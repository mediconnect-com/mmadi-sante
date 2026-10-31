// Rendez-vous : un patient en demande un auprès d'un médecin (déjà enregistré ou saisi par lui).
// Chaque route contrôle côté serveur QUI fait QUOI :
//   PATIENT : crée ses demandes, voit et annule les siennes
//   MEDECIN : voit les rendez-vous qui le concernent, les confirme ou les refuse
//   ADMIN   : voit tout et peut modifier le statut
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { ErreurHttp, asyncHandler } = require('../lib/erreurs');
const { schemaRendezVous, schemaStatutRendezVous, idValide } = require('../lib/validation');
const { medecinPublic, INCLURE_SPECIALITES } = require('../lib/serialiser');
const { chercherDoublons, remplacerSpecialites } = require('../lib/medecins');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

const MAX_RDV_ACTIFS = 20; // demandes en cours par patient (anti-abus)
const HORIZON_JOURS = 366;

// Frein supplémentaire sur la création de fiches médecins par les patients.
const limiteCreationFiche = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: 'Trop de créations de fiches médecins. Réessayez plus tard.' },
});
const limiterSiNouveauMedecin = (req, res, next) => (req.body && req.body.nouveauMedecin ? limiteCreationFiche(req, res, next) : next());

const INCLURE_RDV = {
  medecin: { include: INCLURE_SPECIALITES },
  patient: { select: { id: true, nom: true, prenom: true, telephone: true } },
};

function rdvPublic(r, acteur, patientsAccessibles) {
  const rep = {
    id: r.id,
    dateHeure: r.dateHeure,
    motif: r.motif,
    statut: r.statut,
    creeLe: r.creeLe,
    medecin: medecinPublic(r.medecin),
  };
  // Le patient n'a pas besoin de ses propres coordonnées ici ; médecin et admin voient l'identité du patient.
  if (acteur.role !== 'PATIENT') {
    rep.patient = { id: r.patient.id, nom: r.patient.nom, prenom: r.patient.prenom, telephone: r.patient.telephone };
    // Un lien vers le dossier n'est proposé que si l'accès est réellement autorisé (attribution).
    rep.dossierAccessible = acteur.role === 'ADMIN' || patientsAccessibles.has(r.patientId);
  }
  return rep;
}

// GET /api/v1/rendez-vous
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const acteur = req.utilisateur;
    const where = acteur.role === 'PATIENT' ? { patientId: acteur.id } : acteur.role === 'MEDECIN' ? { medecinId: acteur.id } : {};
    const lignes = await prisma.rendezVous.findMany({ where, include: INCLURE_RDV, orderBy: { dateHeure: 'asc' }, take: 500 });

    let accessibles = new Set();
    if (acteur.role === 'MEDECIN') {
      const attributions = await prisma.attribution.findMany({ where: { medecinId: acteur.id }, select: { patientId: true } });
      accessibles = new Set(attributions.map((a) => a.patientId));
    }
    res.json({ rendezVous: lignes.map((r) => rdvPublic(r, acteur, accessibles)) });
  })
);

// POST /api/v1/rendez-vous — réservé aux patients
router.post(
  '/',
  exigerRole('PATIENT'),
  limiterSiNouveauMedecin,
  asyncHandler(async (req, res) => {
    const d = schemaRendezVous.parse(req.body);
    const patientId = req.utilisateur.id;
    const date = new Date(d.dateHeure);
    const maintenant = Date.now();
    if (date.getTime() <= maintenant) throw new ErreurHttp(400, 'Choisissez une date et une heure à venir.');
    if (date.getTime() > maintenant + HORIZON_JOURS * 86400000) throw new ErreurHttp(400, 'Le rendez-vous ne peut pas dépasser un an.');

    const actifs = await prisma.rendezVous.count({
      where: { patientId, statut: { in: ['DEMANDE', 'CONFIRME'] }, dateHeure: { gt: new Date() } },
    });
    if (actifs >= MAX_RDV_ACTIFS) throw new ErreurHttp(400, `Limite de ${MAX_RDV_ACTIFS} rendez-vous à venir atteinte.`);

    const resultat = await prisma.$transaction(async (tx) => {
      let medecinId = d.medecinId;
      let nouveau = false;

      if (d.nouveauMedecin) {
        const m = d.nouveauMedecin;
        // Verrou : deux créations simultanées du même médecin ne peuvent pas passer toutes les deux.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(7001)`;
        const doublons = await chercherDoublons(tx, m, INCLURE_SPECIALITES);
        const parTelephone = doublons.filter((x) => x.raison === 'telephone');
        const parNom = doublons.filter((x) => x.raison === 'nom');
        if (parTelephone.length > 0 || (parNom.length > 0 && !m.confirmationHomonyme)) {
          throw new ErreurHttp(
            409,
            parTelephone.length > 0
              ? 'Ce médecin existe déjà dans la base (même numéro de téléphone). Sélectionnez-le dans la liste.'
              : 'Un médecin portant le même nom existe déjà. Est-ce le même ? Sinon, confirmez qu\'il s\'agit d\'un autre médecin.',
            {
              bloquant: parTelephone.length > 0,
              medecinsExistants: doublons.map((x) => ({ raison: x.raison, medecin: medecinPublic(x.medecin) })),
            }
          );
        }
        // Fiche sans compte : aucune connexion possible (pas d'e-mail, mot de passe aléatoire inutilisable).
        const cree = await tx.utilisateur.create({
          data: {
            email: null,
            motDePasseHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
            role: 'MEDECIN',
            sansCompte: true,
            nom: m.nom,
            prenom: m.prenom,
            telephone: m.telephone,
            adresseProfessionnelle: m.adresseProfessionnelle,
          },
        });
        await remplacerSpecialites(tx, cree.id, m.specialiteIds);
        medecinId = cree.id;
        nouveau = true;
        // Le médecin créé est associé au patient (visible dans « Mes médecins »).
        await tx.attribution.create({ data: { patientId, medecinId } });
      } else {
        const m = await tx.utilisateur.findFirst({ where: { id: medecinId, role: 'MEDECIN' }, select: { id: true } });
        if (!m) throw new ErreurHttp(404, 'Médecin introuvable.');
        if (d.autoriserAcces) {
          await tx.attribution.upsert({
            where: { patientId_medecinId: { patientId, medecinId } },
            update: {},
            create: { patientId, medecinId },
          });
        }
      }

      const identique = await tx.rendezVous.findFirst({
        where: { patientId, medecinId, dateHeure: date, statut: { in: ['DEMANDE', 'CONFIRME'] } },
        select: { id: true },
      });
      if (identique) throw new ErreurHttp(409, 'Vous avez déjà demandé un rendez-vous avec ce médecin à cette date et cette heure.');
      const pris = await tx.rendezVous.findFirst({ where: { medecinId, dateHeure: date, statut: 'CONFIRME' }, select: { id: true } });
      if (pris) throw new ErreurHttp(409, "Ce créneau n'est plus disponible. Choisissez une autre date ou heure.");

      const rdv = await tx.rendezVous.create({
        data: { patientId, medecinId, dateHeure: date, motif: d.motif },
        include: INCLURE_RDV,
      });
      return { rdv, nouveau };
    });

    res.status(201).json({ rendezVous: rdvPublic(resultat.rdv, req.utilisateur, new Set()), medecinCree: resultat.nouveau });
  })
);

// PATCH /api/v1/rendez-vous/:id/statut
router.patch(
  '/:id/statut',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    const { statut } = schemaStatutRendezVous.parse(req.body);
    const acteur = req.utilisateur;
    const rdv = await prisma.rendezVous.findUnique({ where: { id } });
    if (!rdv) throw new ErreurHttp(404, 'Rendez-vous introuvable.');

    const interdit = () => {
      throw new ErreurHttp(403, "Accès refusé : vous ne pouvez pas effectuer cette action sur ce rendez-vous.");
    };
    if (acteur.role === 'PATIENT') {
      if (rdv.patientId !== acteur.id || statut !== 'ANNULE') interdit();
    } else if (acteur.role === 'MEDECIN') {
      if (rdv.medecinId !== acteur.id) interdit();
      if (statut !== 'ANNULE' && rdv.statut !== 'DEMANDE') interdit(); // confirmer / refuser seulement une demande en attente
    }
    if (['REFUSE', 'ANNULE'].includes(rdv.statut)) throw new ErreurHttp(409, 'Ce rendez-vous est déjà clôturé.');
    if (statut === 'CONFIRME') {
      const pris = await prisma.rendezVous.findFirst({
        where: { medecinId: rdv.medecinId, dateHeure: rdv.dateHeure, statut: 'CONFIRME', id: { not: id } },
        select: { id: true },
      });
      if (pris) throw new ErreurHttp(409, 'Un autre rendez-vous est déjà confirmé sur ce créneau.');
    }

    const maj = await prisma.rendezVous.update({ where: { id }, data: { statut }, include: INCLURE_RDV });
    let accessibles = new Set();
    if (acteur.role === 'MEDECIN') {
      const attrib = await prisma.attribution.findUnique({
        where: { patientId_medecinId: { patientId: rdv.patientId, medecinId: acteur.id } },
        select: { id: true },
      });
      if (attrib) accessibles = new Set([rdv.patientId]);
    }
    res.json({ rendezVous: rdvPublic(maj, acteur, accessibles) });
  })
);

module.exports = router;
