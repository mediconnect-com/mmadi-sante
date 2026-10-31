// Annuaire des médecins pour les patients : recherche par nom ou spécialité, fiche, vérification de doublon.
// Seules les informations professionnelles sont exposées (nom, spécialités, téléphone, adresse professionnelle).
const express = require('express');
const prisma = require('../lib/prisma');
const { ErreurHttp, asyncHandler } = require('../lib/erreurs');
const { idValide, schemaVerificationMedecin } = require('../lib/validation');
const { medecinPublic, INCLURE_SPECIALITES } = require('../lib/serialiser');
const { filtrerAnnuaire, chercherDoublons } = require('../lib/medecins');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier, exigerRole('PATIENT', 'ADMIN'));

// GET /api/v1/medecins?q=martin&specialiteId=...&type=MEDECIN
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
    const specialiteId = typeof req.query.specialiteId === 'string' && req.query.specialiteId ? idValide(req.query.specialiteId) : undefined;
    const type = ['MEDECIN', 'PROFESSIONNEL_SANTE'].includes(req.query.type) ? req.query.type : undefined;

    const tous = await prisma.utilisateur.findMany({
      where: { role: 'MEDECIN' },
      include: INCLURE_SPECIALITES,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      take: 5000,
    });
    const trouves = filtrerAnnuaire(tous, { q, specialiteId, type });
    res.json({ medecins: trouves.slice(0, 100).map(medecinPublic), total: trouves.length });
  })
);

// POST /api/v1/medecins/verifier — le médecin saisi existe-t-il déjà ? (appelé avant toute création)
router.post(
  '/verifier',
  asyncHandler(async (req, res) => {
    const d = schemaVerificationMedecin.parse(req.body);
    const doublons = await chercherDoublons(prisma, d, INCLURE_SPECIALITES);
    res.json({ doublons: doublons.map((x) => ({ raison: x.raison, medecin: medecinPublic(x.medecin) })) });
  })
);

// GET /api/v1/medecins/:id — fiche d'un médecin
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    const m = await prisma.utilisateur.findFirst({ where: { id, role: 'MEDECIN' }, include: INCLURE_SPECIALITES });
    if (!m) throw new ErreurHttp(404, 'Médecin introuvable.');
    res.json({ medecin: medecinPublic(m) });
  })
);

module.exports = router;
