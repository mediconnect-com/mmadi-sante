// Espace médecin : liste des patients qui lui sont attribués (et seulement ceux-là).
const express = require('express');
const prisma = require('../lib/prisma');
const { asyncHandler } = require('../lib/erreurs');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier, exigerRole('MEDECIN'));

const JOURS_RECENT = 30; // un document est « récent » pendant 30 jours

// GET /api/v1/medecin/patients — mes patients, avec de quoi les retrouver et les ouvrir vite (V3) :
// documents (dont récents), dernier dépôt, prochain rendez-vous, commentaires que j'ai rédigés.
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
    const limiteRecent = new Date(Date.now() - JOURS_RECENT * 86400000);

    const [documents, rendezVous, commentaires] = ids.length
      ? await Promise.all([
          prisma.document.findMany({ where: { proprietaireId: { in: ids } }, select: { proprietaireId: true, creeLe: true } }),
          prisma.rendezVous.findMany({
            where: { medecinId, patientId: { in: ids }, statut: { in: ['DEMANDE', 'CONFIRME'] }, dateHeure: { gt: new Date() } },
            select: { id: true, patientId: true, dateHeure: true, statut: true },
            orderBy: { dateHeure: 'asc' },
          }),
          prisma.commentairePatient.groupBy({ by: ['patientId'], where: { medecinId, patientId: { in: ids } }, _count: { _all: true } }),
        ])
      : [[], [], []];

    const resume = new Map(ids.map((id) => [id, { nombre: 0, recents: 0, dernier: null }]));
    for (const d of documents) {
      const r = resume.get(d.proprietaireId);
      r.nombre += 1;
      if (d.creeLe >= limiteRecent) r.recents += 1;
      if (!r.dernier || d.creeLe > r.dernier) r.dernier = d.creeLe;
    }
    const prochain = new Map();
    for (const r of rendezVous) if (!prochain.has(r.patientId)) prochain.set(r.patientId, r); // déjà triés par date
    const nbCommentaires = new Map(commentaires.map((c) => [c.patientId, c._count._all]));

    const patients = attributions.map((a) => {
      const r = resume.get(a.patientId);
      const rdv = prochain.get(a.patientId);
      return {
        id: a.patient.id,
        nom: a.patient.nom,
        prenom: a.patient.prenom,
        email: a.patient.email,
        telephone: a.patient.telephone,
        nombreDocuments: r.nombre,
        nombreDocumentsRecents: r.recents,
        dernierDocumentLe: r.dernier,
        prochainRendezVous: rdv ? { id: rdv.id, dateHeure: rdv.dateHeure, statut: rdv.statut } : null,
        nombreCommentaires: nbCommentaires.get(a.patientId) || 0,
        attribueLe: a.creeLe,
      };
    });
    res.json({ patients, joursRecent: JOURS_RECENT });
  })
);

module.exports = router;
