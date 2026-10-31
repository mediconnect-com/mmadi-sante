// Espace administrateur : TOUTES les routes exigent le profil ADMIN (vérifié côté serveur).
const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { chiffrer } = require('../lib/chiffrement');
const { asyncHandler, ErreurHttp } = require('../lib/erreurs');
const { schemaCreationUtilisateur, schemaAttribution, idValide } = require('../lib/validation');
const { utilisateurPublic, selectDocumentSansContenu } = require('../lib/serialiser');
const { authentifier, exigerRole } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier, exigerRole('ADMIN'));

// GET /api/v1/admin/statistiques
router.get(
  '/statistiques',
  asyncHandler(async (req, res) => {
    const [patients, medecins, admins, documents, attributions] = await Promise.all([
      prisma.utilisateur.count({ where: { role: 'PATIENT' } }),
      prisma.utilisateur.count({ where: { role: 'MEDECIN' } }),
      prisma.utilisateur.count({ where: { role: 'ADMIN' } }),
      prisma.document.count(),
      prisma.attribution.count(),
    ]);
    res.json({ patients, medecins, admins, documents, attributions });
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
      include: { _count: { select: { documents: true } } },
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
    const existant = await prisma.utilisateur.findUnique({ where: { email: d.email }, select: { id: true } });
    if (existant) throw new ErreurHttp(409, 'Un compte existe déjà avec cet e-mail.');
    const u = await prisma.utilisateur.create({
      data: {
        email: d.email,
        motDePasseHash: await bcrypt.hash(d.motDePasse, 12),
        role: d.role,
        nom: d.nom,
        prenom: d.prenom,
        adresse: d.adresse,
        telephone: d.telephone,
        carteIdentiteChiffree: chiffrer(d.carteIdentite),
      },
    });
    res.status(201).json({ utilisateur: utilisateurPublic(u) });
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
