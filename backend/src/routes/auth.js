// Inscription publique (PATIENT uniquement), connexion et lecture du compte courant.
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { chiffrer } = require('../lib/chiffrement');
const { ErreurHttp, asyncHandler } = require('../lib/erreurs');
const { schemaInscription, schemaConnexion, schemaMotDePasseOublie, schemaNouveauMotDePasse, schemaVerificationJeton } = require('../lib/validation');
const config = require('../config');
const { envoyerCourriel, courrielReinitialisation, courrielMotDePasseModifie } = require('../lib/courriel');
const { utilisateurPublic, INCLURE_SPECIALITES } = require('../lib/serialiser');
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
    const utilisateur = await prisma.utilisateur.findUnique({ where: { email: d.email }, include: INCLURE_SPECIALITES });
    const ok = await bcrypt.compare(d.motDePasse, utilisateur ? utilisateur.motDePasseHash : HASH_FACTICE);
    // Une fiche médecin « sans compte » n'a jamais le droit de se connecter.
    if (!utilisateur || utilisateur.sansCompte || !ok) throw new ErreurHttp(401, 'E-mail ou mot de passe incorrect.');
    res.json({ jeton: signerJeton(utilisateur), utilisateur: utilisateurPublic(utilisateur) });
  })
);

// ---------------------------------------------------------------------------
//  « Mot de passe oublié » : lien à usage unique envoyé par e-mail, valable config.courriel.dureeLienMinutes.
//  Seule l'empreinte SHA-256 du jeton est enregistrée en base.
// ---------------------------------------------------------------------------
const empreinte = (jeton) => crypto.createHash('sha256').update(jeton).digest('hex');
const MESSAGE_ENVOYE = 'Si un compte correspond à cette adresse, un e-mail contenant un lien de réinitialisation vient d’être envoyé. Pensez à vérifier vos courriers indésirables.';

// Frein plus strict : 5 demandes par IP et par heure (réglable : LIMITE_OUBLI_PAR_HEURE, utilisé par les tests).
const limiteurOubli = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: Number(process.env.LIMITE_OUBLI_PAR_HEURE) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: 'Trop de demandes. Réessayez dans une heure.' },
});

// POST /api/v1/auth/mot-de-passe-oublie — répond TOUJOURS pareil (ne révèle pas si l'e-mail existe).
router.post(
  '/mot-de-passe-oublie',
  limiteurOubli,
  asyncHandler(async (req, res) => {
    const d = schemaMotDePasseOublie.parse(req.body);
    const utilisateur = await prisma.utilisateur.findUnique({ where: { email: d.email } });
    if (utilisateur && !utilisateur.sansCompte) {
      // Une nouvelle demande dans la minute qui suit la précédente est ignorée (anti-spam d'e-mails).
      const recente = await prisma.reinitialisationMotDePasse.findFirst({
        where: { utilisateurId: utilisateur.id, creeLe: { gt: new Date(Date.now() - 60 * 1000) } },
        select: { id: true },
      });
      if (!recente) {
        const jeton = crypto.randomBytes(32).toString('base64url');
        await prisma.$transaction([
          prisma.reinitialisationMotDePasse.deleteMany({ where: { utilisateurId: utilisateur.id, utiliseLe: null } }),
          prisma.reinitialisationMotDePasse.create({
            data: { utilisateurId: utilisateur.id, jetonHash: empreinte(jeton), expireLe: new Date(Date.now() + config.courriel.dureeLienMinutes * 60 * 1000) },
          }),
        ]);
        const lien = `${config.courriel.urlSite}/reinitialisation/?jeton=${encodeURIComponent(jeton)}`;
        const message = courrielReinitialisation({ prenom: utilisateur.prenom, lien, minutes: config.courriel.dureeLienMinutes });
        // L'envoi ne bloque pas la réponse (et n'en change pas le contenu) : une panne d'e-mail est seulement journalisée.
        envoyerCourriel({ a: utilisateur.email, ...message }).catch((e) => console.error('[COURRIEL] envoi impossible :', e.message));
      }
    }
    res.json({ message: MESSAGE_ENVOYE });
  })
);

// POST /api/v1/auth/mot-de-passe-oublie/verifier — le lien reçu est-il encore valable ? (confort d'affichage)
router.post(
  '/mot-de-passe-oublie/verifier',
  limiteur,
  asyncHandler(async (req, res) => {
    const d = schemaVerificationJeton.parse(req.body);
    const ligne = await prisma.reinitialisationMotDePasse.findUnique({ where: { jetonHash: empreinte(d.jeton) } });
    const valide = Boolean(ligne && !ligne.utiliseLe && ligne.expireLe > new Date());
    res.json({ valide });
  })
);

// POST /api/v1/auth/reinitialiser-mot-de-passe — enregistre le nouveau mot de passe (hash bcrypt) si le lien est valable.
router.post(
  '/reinitialiser-mot-de-passe',
  limiteur,
  asyncHandler(async (req, res) => {
    const d = schemaNouveauMotDePasse.parse(req.body);
    const ligne = await prisma.reinitialisationMotDePasse.findUnique({
      where: { jetonHash: empreinte(d.jeton) },
      include: { utilisateur: true },
    });
    if (!ligne || ligne.utiliseLe || ligne.expireLe <= new Date() || ligne.utilisateur.sansCompte) {
      throw new ErreurHttp(400, 'Ce lien est invalide ou a expiré. Demandez-en un nouveau depuis la page de connexion.');
    }
    const hash = await bcrypt.hash(d.nouveauMotDePasse, 12);
    // Usage unique : la mise à jour du jeton est conditionnelle (deux clics simultanés ne passent pas tous les deux).
    const resultat = await prisma.$transaction(async (tx) => {
      const pris = await tx.reinitialisationMotDePasse.updateMany({ where: { id: ligne.id, utiliseLe: null }, data: { utiliseLe: new Date() } });
      if (pris.count === 0) return false;
      await tx.utilisateur.update({ where: { id: ligne.utilisateurId }, data: { motDePasseHash: hash } });
      await tx.reinitialisationMotDePasse.deleteMany({ where: { utilisateurId: ligne.utilisateurId, id: { not: ligne.id } } });
      return true;
    });
    if (!resultat) throw new ErreurHttp(400, 'Ce lien est invalide ou a expiré. Demandez-en un nouveau depuis la page de connexion.');
    console.log(`[AUTH] mot de passe réinitialisé par lien e-mail pour le compte ${ligne.utilisateur.id}`);
    if (ligne.utilisateur.email) {
      envoyerCourriel({ a: ligne.utilisateur.email, ...courrielMotDePasseModifie({ prenom: ligne.utilisateur.prenom }) }).catch((e) =>
        console.error('[COURRIEL] confirmation non envoyée :', e.message)
      );
    }
    res.json({ message: 'Votre mot de passe a été modifié. Vous pouvez vous connecter.' });
  })
);

// GET /api/v1/auth/moi — compte de la session courante
router.get(
  '/moi',
  authentifier,
  asyncHandler(async (req, res) => {
    const utilisateur = await prisma.utilisateur.findUnique({ where: { id: req.utilisateur.id }, include: INCLURE_SPECIALITES });
    res.json({ utilisateur: utilisateurPublic(utilisateur) });
  })
);

module.exports = router;
