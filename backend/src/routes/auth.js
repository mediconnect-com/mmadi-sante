// Inscription publique (PATIENT uniquement), connexion et lecture du compte courant.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { chiffrer } = require('../lib/chiffrement');
const { ErreurHttp, asyncHandler } = require('../lib/erreurs');
const { schemaInscription, schemaConnexion } = require('../lib/validation');
const { utilisateurPublic } = require('../lib/serialiser');
const { signerJeton, authentifier } = require('../middleware/auth');

const router = express.Router();

// Limite les tentatives (anti force brute) : 30 essais par IP toutes les 15 minutes.
const limiteur = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

// Hash factice : évite de révéler (par le temps de réponse) si un e-mail existe.
const HASH_FACTICE = bcrypt.hashSync('mot-de-passe-factice', 12);

// POST /api/v1/auth/inscription — le rôle est TOUJOURS PATIENT, quoi que le client envoie.
router.post(
  '/inscription',
  limiteur,
  asyncHandler(async (req, res) => {
    const d = schemaInscription.parse(req.body);
    const existant = await prisma.utilisateur.findUnique({ where: { email: d.email }, select: { id: true } });
    if (existant) throw new ErreurHttp(409, 'Un compte existe déjà avec cet e-mail.');

    const utilisateur = await prisma.utilisateur.create({
      data: {
        email: d.email,
        motDePasseHash: await bcrypt.hash(d.motDePasse, 12),
        role: 'PATIENT',
        nom: d.nom,
        prenom: d.prenom,
        adresse: d.adresse,
        telephone: d.telephone,
        carteIdentiteChiffree: chiffrer(d.carteIdentite),
      },
    });
    res.status(201).json({ jeton: signerJeton(utilisateur), utilisateur: utilisateurPublic(utilisateur) });
  })
);

// POST /api/v1/auth/connexion
router.post(
  '/connexion',
  limiteur,
  asyncHandler(async (req, res) => {
    const d = schemaConnexion.parse(req.body);
    const utilisateur = await prisma.utilisateur.findUnique({ where: { email: d.email } });
    const ok = await bcrypt.compare(d.motDePasse, utilisateur ? utilisateur.motDePasseHash : HASH_FACTICE);
    if (!utilisateur || !ok) throw new ErreurHttp(401, 'E-mail ou mot de passe incorrect.');
    res.json({ jeton: signerJeton(utilisateur), utilisateur: utilisateurPublic(utilisateur) });
  })
);

// GET /api/v1/auth/moi — compte de la session courante
router.get(
  '/moi',
  authentifier,
  asyncHandler(async (req, res) => {
    const utilisateur = await prisma.utilisateur.findUnique({ where: { id: req.utilisateur.id } });
    res.json({ utilisateur: utilisateurPublic(utilisateur) });
  })
);

module.exports = router;
