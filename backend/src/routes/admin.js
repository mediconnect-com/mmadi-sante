// Espace administrateur : TOUTES les routes exigent le profil ADMIN (vérifié côté serveur).
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { chiffrer } = require('../lib/chiffrement');
const { asyncHandler, ErreurHttp } = require('../lib/erreurs');
const { schemaCreationUtilisateur, schemaAttribution, schemaMajMedecin, schemaReinitialisationMotDePasse, idValide } = require('../lib/validation');
const { utilisateurPublic, INCLURE_SPECIALITES, selectDocumentSansContenu } = require('../lib/serialiser');
const { remplacerSpecialites } = require('../lib/medecins');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier, exigerRole('ADMIN'));

// GET /api/v1/admin/statistiques
router.get(
  '/statistiques',
  asyncHandler(async (req, res) => {
    const [patients, medecins, admins, documents, attributions, rendezVous] = await Promise.all([
      prisma.utilisateur.count({ where: { role: 'PATIENT' } }),
      prisma.utilisateur.count({ where: { role: 'MEDECIN' } }),
      prisma.utilisateur.count({ where: { role: 'ADMIN' } }),
      prisma.document.count(),
      prisma.attribution.count(),
      prisma.rendezVous.count(),
    ]);
    res.json({ patients, medecins, admins, documents, attributions, rendezVous });
  })
);

// GET /api/v1/admin/utilisateurs?role=PATIENT&q=dupont
router.get(
  '/utilisateurs',
  asyncHandler(async (req, res) => {
    const where = {};
    if (['PATIENT', 'MEDECIN', 'ADMIN'].includes(req.query.role)) where.role = req.query.role;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (q) {
      where.OR = [
        { nom: { contains: q, mode: 'insensitive' } },
        { prenom: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const lignes = await prisma.utilisateur.findMany({
      where,
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
      take: 500,
      include: { ...INCLURE_SPECIALITES, _count: { select: { documents: true } } },
    });
    // Minimisation : le numéro de carte d'identité n'apparaît pas dans la liste, seulement dans la fiche détaillée.
    const utilisateurs = lignes.map((u) => {
      const { carteIdentite, ...sansCarte } = utilisateurPublic(u);
      return { ...sansCarte, nombreDocuments: u._count.documents };
    });
    res.json({ utilisateurs });
  })
);

// POST /api/v1/admin/utilisateurs — création d'un compte de n'importe quel profil
router.post(
  '/utilisateurs',
  asyncHandler(async (req, res) => {
    const d = schemaCreationUtilisateur.parse(req.body);
    if (d.email) {
      const existant = await prisma.utilisateur.findUnique({ where: { email: d.email }, select: { id: true } });
      if (existant) throw new ErreurHttp(409, 'Un compte existe déjà avec cet e-mail.');
    }
    // Fiche médecin sans compte : mot de passe aléatoire, jamais communiqué => aucune connexion possible.
    const secret = d.sansCompte ? crypto.randomBytes(32).toString('hex') : d.motDePasse;
    const motDePasseHash = await bcrypt.hash(secret, d.sansCompte ? 10 : 12);
    const u = await prisma.$transaction(async (tx) => {
      const cree = await tx.utilisateur.create({
        data: {
          email: d.email,
          motDePasseHash,
          role: d.role,
          sansCompte: d.sansCompte,
          nom: d.nom,
          prenom: d.prenom,
          adresse: d.adresse,
          telephone: d.telephone,
          adresseProfessionnelle: d.adresseProfessionnelle,
          carteIdentiteChiffree: chiffrer(d.carteIdentite),
        },
      });
      if (d.role === 'MEDECIN' && d.specialiteIds) await remplacerSpecialites(tx, cree.id, d.specialiteIds);
      return tx.utilisateur.findUnique({ where: { id: cree.id }, include: INCLURE_SPECIALITES });
    });
    res.status(201).json({ utilisateur: utilisateurPublic(u) });
  })
);

// PUT /api/v1/admin/medecins/:id — modifie la fiche d'un médecin (identité, téléphone, adresse pro, spécialités)
router.put(
  '/medecins/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    const d = schemaMajMedecin.parse(req.body);
    const fournis = new Set(Object.keys(req.body || {}));
    const cible = await prisma.utilisateur.findFirst({ where: { id, role: 'MEDECIN' }, select: { id: true, sansCompte: true } });
    if (!cible) throw new ErreurHttp(404, 'Médecin introuvable.');

    const data = {};
    if (d.nom !== undefined) data.nom = d.nom;
    if (d.prenom !== undefined) data.prenom = d.prenom;
    if (fournis.has('telephone')) data.telephone = d.telephone;
    if (fournis.has('adresseProfessionnelle')) data.adresseProfessionnelle = d.adresseProfessionnelle;
    if (fournis.has('email')) {
      // L'e-mail d'un compte avec connexion est son identifiant : il ne peut pas être vidé.
      if (!d.email && !cible.sansCompte) throw new ErreurHttp(400, "L'e-mail d'un compte de connexion ne peut pas être supprimé.");
      if (d.email) {
        const autre = await prisma.utilisateur.findUnique({ where: { email: d.email }, select: { id: true } });
        if (autre && autre.id !== id) throw new ErreurHttp(409, 'Un compte existe déjà avec cet e-mail.');
      }
      data.email = d.email;
    }
    const u = await prisma.$transaction(async (tx) => {
      if (fournis.has('specialiteIds')) await remplacerSpecialites(tx, id, d.specialiteIds || []);
      return tx.utilisateur.update({ where: { id }, data, include: INCLURE_SPECIALITES });
    });
    res.json({ utilisateur: utilisateurPublic(u) });
  })
);

// PUT /api/v1/admin/utilisateurs/:id/mot-de-passe — l'administrateur définit un nouveau mot de passe (oubli).
// Un mot de passe n'est jamais lisible (seul son hash est stocké) : on le remplace, on ne le consulte pas.
router.put(
  '/utilisateurs/:id/mot-de-passe',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    if (id === req.utilisateur.id) {
      throw new ErreurHttp(400, 'Pour votre propre compte, utilisez « Changer mon mot de passe » dans Mon profil.');
    }
    const d = schemaReinitialisationMotDePasse.parse(req.body);
    const cible = await prisma.utilisateur.findUnique({ where: { id }, select: { id: true, role: true, email: true, sansCompte: true } });
    if (!cible) throw new ErreurHttp(404, 'Utilisateur introuvable.');
    if (cible.sansCompte) throw new ErreurHttp(400, "Cette fiche médecin n'a pas de compte de connexion : aucun mot de passe à modifier.");
    await prisma.utilisateur.update({ where: { id }, data: { motDePasseHash: await bcrypt.hash(d.nouveauMotDePasse, 12) } });
    console.log(`[ADMIN] ${req.utilisateur.id} a réinitialisé le mot de passe du compte ${cible.email} (${cible.role})`);
    res.json({ message: 'Mot de passe modifié. Communiquez-le à l’utilisateur par un canal sûr.' });
  })
);

// DELETE /api/v1/admin/utilisateurs/:id — supprime le compte, ses documents et ses attributions (cascade en base)
router.delete(
  '/utilisateurs/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    if (id === req.utilisateur.id) throw new ErreurHttp(400, 'Vous ne pouvez pas supprimer votre propre compte.');
    const cible = await prisma.utilisateur.findUnique({ where: { id }, select: { id: true, role: true, email: true } });
    if (!cible) throw new ErreurHttp(404, 'Utilisateur introuvable.');
    if (cible.role === 'ADMIN' && (await prisma.utilisateur.count({ where: { role: 'ADMIN' } })) <= 1) {
      throw new ErreurHttp(400, 'Impossible de supprimer le dernier administrateur.');
    }
    await prisma.utilisateur.delete({ where: { id } });
    console.log(`[ADMIN] ${req.utilisateur.id} a supprimé le compte ${cible.email} (${cible.role})`);
    res.json({ message: 'Utilisateur supprimé.' });
  })
);

// GET /api/v1/admin/documents — tous les documents de tous les utilisateurs (sans contenu binaire)
router.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const lignes = await prisma.document.findMany({
      select: {
        ...selectDocumentSansContenu,
        proprietaire: { select: { id: true, nom: true, prenom: true, role: true } },
      },
      orderBy: { creeLe: 'desc' },
      take: 1000,
    });
    res.json({ documents: lignes });
  })
);

// GET /api/v1/admin/attributions
router.get(
  '/attributions',
  asyncHandler(async (req, res) => {
    const attributions = await prisma.attribution.findMany({
      include: {
        patient: { select: { id: true, nom: true, prenom: true } },
        medecin: { select: { id: true, nom: true, prenom: true } },
      },
      orderBy: { creeLe: 'desc' },
    });
    res.json({ attributions });
  })
);

// POST /api/v1/admin/attributions — attribue un patient à un médecin
router.post(
  '/attributions',
  asyncHandler(async (req, res) => {
    const { patientId, medecinId } = schemaAttribution.parse(req.body);
    const [patient, medecin] = await Promise.all([
      prisma.utilisateur.findUnique({ where: { id: patientId }, select: { role: true } }),
      prisma.utilisateur.findUnique({ where: { id: medecinId }, select: { role: true } }),
    ]);
    if (!patient || patient.role !== 'PATIENT') throw new ErreurHttp(400, "Le patient indiqué n'existe pas ou n'a pas le profil PATIENT.");
    if (!medecin || medecin.role !== 'MEDECIN') throw new ErreurHttp(400, "Le médecin indiqué n'existe pas ou n'a pas le profil MEDECIN.");

    try {
      const attribution = await prisma.attribution.create({ data: { patientId, medecinId } });
      res.status(201).json({ attribution });
    } catch (e) {
      if (e.code === 'P2002') throw new ErreurHttp(409, 'Ce patient est déjà attribué à ce médecin.');
      throw e;
    }
  })
);

// DELETE /api/v1/admin/attributions/:id
router.delete(
  '/attributions/:id',
  asyncHandler(async (req, res) => {
    const id = idValide(req.params.id);
    const existe = await prisma.attribution.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new ErreurHttp(404, 'Attribution introuvable.');
    await prisma.attribution.delete({ where: { id } });
    res.json({ message: 'Attribution supprimée.' });
  })
);

module.exports = router;
