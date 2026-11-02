// Espace médecin : liste des patients qui lui sont attribués (et seulement ceux-là).
const express = require('express');
const prisma = require('../lib/prisma');
const { asyncHandler } = require('../lib/erreurs');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier, exigerRole('MEDECIN'));

// GET /api/v1/medecin/patients — mes patients, avec de quoi les retrouver et les ouvrir vite (V3) :
// prochain rendez-vous, dernier rendez-vous passé, nombre de rendez-vous, commentaires que j'ai rédigés.
// Aucune information sur les documents du patient : un médecin n'y a pas accès.
router.get(
  '/patients',
  asyncHandler(async (req, res) => {
    const medecinId = req.utilisateur.id;
    const attributions = await prisma.attribution.findMany({
      where: { medecinId }, // filtre imposé par le serveur, jamais par le client
      include: { patient: { select: { id: true, nom: true, prenom: true, email: true, telephone: true } } },
      orderBy: { creeLe: 'desc' },
    });
    const ids = attributions.map((a) => a.patientId);
    const maintenant = new Date();

    const [rendezVous, commentaires] = ids.length
      ? await Promise.all([
          prisma.rendezVous.findMany({
            where: { medecinId, patientId: { in: ids }, statut: { in: ['DEMANDE', 'CONFIRME'] } },
            select: { id: true, patientId: true, dateHeure: true, statut: true },
            orderBy: { dateHeure: 'asc' },
          }),
          prisma.commentairePatient.groupBy({ by: ['patientId'], where: { medecinId, patientId: { in: ids } }, _count: { _all: true } }),
        ])
      : [[], []];

    const prochain = new Map();
    const dernier = new Map();
    const nbRdv = new Map();
    for (const r of rendezVous) {
      nbRdv.set(r.patientId, (nbRdv.get(r.patientId) || 0) + 1);
      if (r.dateHeure > maintenant) {
        if (!prochain.has(r.patientId)) prochain.set(r.patientId, r); // déjà triés par date croissante
      } else if (r.statut === 'CONFIRME') {
        dernier.set(r.patientId, r); // le dernier de la liste triée = le plus récent
      }
    }
    const nbCommentaires = new Map(commentaires.map((c) => [c.patientId, c._count._all]));

    const patients = attributions.map((a) => {
      const rdv = prochain.get(a.patientId);
      const passe = dernier.get(a.patientId);
      return {
        id: a.patient.id,
        nom: a.patient.nom,
        prenom: a.patient.prenom,
        email: a.patient.email,
        telephone: a.patient.telephone,
        prochainRendezVous: rdv ? { id: rdv.id, dateHeure: rdv.dateHeure, statut: rdv.statut } : null,
        dernierRendezVous: passe ? { id: passe.id, dateHeure: passe.dateHeure } : null,
        nombreRendezVous: nbRdv.get(a.patientId) || 0,
        nombreCommentaires: nbCommentaires.get(a.patientId) || 0,
        attribueLe: a.creeLe,
      };
    });
    res.json({ patients });
  })
);

module.exports = router;
