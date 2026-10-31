// Espace médecin : liste des patients qui lui sont attribués (et seulement ceux-là).
const express = require('express');
const prisma = require('../lib/prisma');
const { asyncHandler } = require('../lib/erreurs');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier, exigerRole('MEDECIN'));

// GET /api/v1/medecin/patients
router.get(
  '/patients',
  asyncHandler(async (req, res) => {
    const attributions = await prisma.attribution.findMany({
      where: { medecinId: req.utilisateur.id }, // filtre imposé par le serveur, jamais par le client
      include: {
        patient: {
          select: { id: true, nom: true, prenom: true, email: true, telephone: true, _count: { select: { documents: true } } },
        },
      },
      orderBy: { creeLe: 'desc' },
    });
    const patients = attributions.map((a) => ({
      id: a.patient.id,
      nom: a.patient.nom,
      prenom: a.patient.prenom,
      email: a.patient.email,
      telephone: a.patient.telephone,
      nombreDocuments: a.patient._count.documents,
      attribueLe: a.creeLe,
    }));
    res.json({ patients });
  })
);

module.exports = router;
