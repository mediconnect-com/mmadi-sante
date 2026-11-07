// Consultation du dossier d'un utilisateur par un autre (médecin → patient attribué, admin → tous).
// L'autorisation est vérifiée par exigerAccesUtilisateur : admin, soi-même, ou médecin attribué.
const express = require('express');
const prisma = require('../lib/prisma');
const { asyncHandler, ErreurHttp } = require('../lib/erreurs');
const { idValide } = require('../lib/validation');
const { exigerAccesUtilisateur } = require('../lib/acces');
const { utilisateurPublic, medecinPublic, commentairePublic, INCLURE_SPECIALITES, selectDocumentSansContenu } = require('../lib/serialiser');
const { televerser, enregistrerDocuments } = require('../lib/documents');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

// GET /api/v1/utilisateurs/:id — fiche + documents (+ médecins attribués, visibles par l'admin)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    await exigerAccesUtilisateur(req.utilisateur, id);

    const acteur = req.utilisateur;
    const u = await prisma.utilisateur.findUnique({
      where: { id },
      include: {
        ...INCLURE_SPECIALITES,
        // V4 : un médecin ne reçoit AUCUN document du patient, sauf ceux qu'il a lui-même déposés
        // (il peut les ouvrir, les télécharger et les retirer, comme le patient).
        documents: {
          where: acteur.role === 'MEDECIN' ? { deposeParMedecinId: acteur.id } : undefined,
          select: selectDocumentSansContenu,
          orderBy: { creeLe: 'desc' },
        },
        commePatient: { select: { id: true, medecin: { include: INCLURE_SPECIALITES } } },
        commeMedecin: { select: { id: true, patient: { select: { id: true, nom: true, prenom: true, email: true } } } },
      },
    });
    if (!u) throw new ErreurHttp(404, 'Utilisateur introuvable.');

    const reponse = { utilisateur: utilisateurPublic(u) };
    if (acteur.role === 'MEDECIN') reponse.documentsTransmis = u.documents; // uniquement SES dépôts
    else reponse.documents = u.documents;
    // Seul l'administrateur voit les attributions (médecins d'un patient / patients d'un médecin).
    if (acteur.role === 'ADMIN') {
      reponse.medecins = u.commePatient.map((a) => ({ attributionId: a.id, ...medecinPublic(a.medecin) }));
      reponse.patients = u.commeMedecin.map((a) => ({ attributionId: a.id, ...a.patient }));
    }
    // V3 : commentaires et pathologies d'un patient, toujours liés à un rendez-vous.
    // Administrateur : tous ; patient : tous les siens ; médecin : uniquement CEUX QU'IL A LUI-MÊME rédigés.
    if (u.role === 'PATIENT') {
      const where = { patientId: id };
      if (acteur.role === 'MEDECIN') where.medecinId = acteur.id;
      const lignes = await prisma.commentairePatient.findMany({ where, include: { rendezVous: { select: { id: true, dateHeure: true } } }, orderBy: { creeLe: 'desc' } });
      reponse.commentaires = lignes.map(commentairePublic);
      if (acteur.role === 'MEDECIN') {
        // Rendez-vous de ce patient avec ce médecin sur lesquels il peut encore rédiger un commentaire.
        const commentables = await prisma.rendezVous.findMany({
          where: { patientId: id, medecinId: acteur.id, statut: 'CONFIRME', dateHeure: { lte: new Date() }, commentaire: null },
          select: { id: true, dateHeure: true, motif: true },
          orderBy: { dateHeure: 'desc' },
        });
        reponse.rendezVousCommentables = commentables;
      }
    }
    res.json(reponse);
  })
);

// POST /api/v1/utilisateurs/:id/documents — V3 : un médecin dépose un ou plusieurs documents dans la fiche
// d'un patient QUI LUI EST ATTRIBUÉ (champ « fichiers », comme pour « Mon dossier »).
router.post(
  '/:id/documents',
  televerser,
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    if (req.utilisateur.role !== 'MEDECIN') throw new ErreurHttp(403, "Accès refusé : seul un médecin peut déposer un document dans la fiche d'un patient.");
    const attribution = await prisma.attribution.findUnique({
      where: { patientId_medecinId: { patientId: id, medecinId: req.utilisateur.id } },
      select: { id: true },
    });
    if (!attribution) throw new ErreurHttp(403, "Accès refusé : ce patient ne figure pas parmi vos patients.");
    const medecin = await prisma.utilisateur.findUnique({ where: { id: req.utilisateur.id }, select: { id: true, nom: true, prenom: true } });
    const documents = await enregistrerDocuments(req, id, { id: medecin.id, nomComplet: `${medecin.prenom} ${medecin.nom}` });
    console.log(`[DOCUMENTS] ${medecin.id} a déposé ${documents.length} document(s) dans la fiche du patient ${id}`);
    res.status(201).json({ documents });
  })
);

module.exports = router;
