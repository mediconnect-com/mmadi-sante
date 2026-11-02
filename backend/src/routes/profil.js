// « Mon compte » : chaque utilisateur ne manipule QUE ses propres données.
// Aucun identifiant n'est lu dans l'URL ici : tout est basé sur req.utilisateur (issu du jeton + base).
const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { chiffrer } = require('../lib/chiffrement');
const { ErreurHttp, asyncHandler } = require('../lib/erreurs');
const { schemaMajProfil, schemaChangementMotDePasse } = require('../lib/validation');
const { utilisateurPublic, medecinPublic, commentairePublic, INCLURE_SPECIALITES, selectDocumentSansContenu } = require('../lib/serialiser');
const { remplacerSpecialites } = require('../lib/medecins');
const { idValide } = require('../lib/validation');
const { televerser, enregistrerDocuments } = require('../lib/documents');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

// GET /api/v1/profil
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = await prisma.utilisateur.findUnique({ where: { id: req.utilisateur.id }, include: INCLURE_SPECIALITES });
    res.json({ utilisateur: utilisateurPublic(u) });
  })
);

// PUT /api/v1/profil — modifie uniquement les champs fournis (jamais le rôle ni l'e-mail)
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const d = schemaMajProfil.parse(req.body);
    const fournis = new Set(Object.keys(req.body || {}));
    const data = {};
    if (fournis.has('nom') && d.nom !== undefined) data.nom = d.nom;
    if (fournis.has('prenom') && d.prenom !== undefined) data.prenom = d.prenom;
    if (fournis.has('adresse')) data.adresse = d.adresse;
    if (fournis.has('telephone')) data.telephone = d.telephone;
    if (fournis.has('carteIdentite')) data.carteIdentiteChiffree = chiffrer(d.carteIdentite);

    // Adresse professionnelle et spécialités : uniquement pour un médecin, sur SA propre fiche.
    const champsMedecin = fournis.has('adresseProfessionnelle') || fournis.has('specialiteIds');
    if (champsMedecin && req.utilisateur.role !== 'MEDECIN') {
      throw new ErreurHttp(403, "Accès refusé : ces informations concernent uniquement les médecins.");
    }
    if (fournis.has('adresseProfessionnelle')) data.adresseProfessionnelle = d.adresseProfessionnelle;

    const u = await prisma.$transaction(async (tx) => {
      if (fournis.has('specialiteIds')) await remplacerSpecialites(tx, req.utilisateur.id, d.specialiteIds || []);
      return tx.utilisateur.update({ where: { id: req.utilisateur.id }, data, include: INCLURE_SPECIALITES });
    });
    res.json({ utilisateur: utilisateurPublic(u) });
  })
);

// PUT /api/v1/profil/mot-de-passe
router.put(
  '/mot-de-passe',
  asyncHandler(async (req, res) => {
    const d = schemaChangementMotDePasse.parse(req.body);
    const u = await prisma.utilisateur.findUnique({ where: { id: req.utilisateur.id } });
    if (!(await bcrypt.compare(d.ancienMotDePasse, u.motDePasseHash))) {
      throw new ErreurHttp(400, "L'ancien mot de passe est incorrect.");
    }
    await prisma.utilisateur.update({
      where: { id: u.id },
      data: { motDePasseHash: await bcrypt.hash(d.nouveauMotDePasse, 12) },
    });
    res.json({ message: 'Mot de passe modifié.' });
  })
);

// GET /api/v1/profil/medecins — MES médecins (patient) : fiche complète tirée de la base à chaque appel
router.get(
  '/medecins',
  asyncHandler(async (req, res) => {
    if (req.utilisateur.role !== 'PATIENT') throw new ErreurHttp(403, "Accès refusé : votre profil n'a pas le droit d'effectuer cette action.");
    const attributions = await prisma.attribution.findMany({
      where: { patientId: req.utilisateur.id },
      include: { medecin: { include: INCLURE_SPECIALITES } },
      orderBy: { creeLe: 'desc' },
    });
    res.json({ medecins: attributions.map((a) => ({ attributionId: a.id, attribueLe: a.creeLe, ...medecinPublic(a.medecin) })) });
  })
);

// DELETE /api/v1/profil/medecins/:medecinId — le patient retire un médecin de SES médecins
// (le médecin perd alors l'accès à son dossier ; ses rendez-vous restent dans l'historique).
router.delete(
  '/medecins/:medecinId',
  asyncHandler(async (req, res) => {
    if (req.utilisateur.role !== 'PATIENT') throw new ErreurHttp(403, "Accès refusé : votre profil n'a pas le droit d'effectuer cette action.");
    const medecinId = idValide(req.params.medecinId);
    const { count } = await prisma.attribution.deleteMany({ where: { patientId: req.utilisateur.id, medecinId } });
    if (count === 0) throw new ErreurHttp(404, 'Ce médecin ne figure pas dans vos médecins.');
    res.json({ message: 'Médecin retiré.' });
  })
);

// GET /api/v1/profil/documents — liste de MES documents (sans contenu binaire)
router.get(
  '/documents',
  asyncHandler(async (req, res) => {
    const documents = await prisma.document.findMany({
      where: { proprietaireId: req.utilisateur.id },
      select: selectDocumentSansContenu,
      orderBy: { creeLe: 'desc' },
    });
    res.json({ documents });
  })
);

// POST /api/v1/profil/documents — envoi d'un ou plusieurs fichiers (champ « fichiers »)
router.post(
  '/documents',
  televerser,
  asyncHandler(async (req, res) => {
    const documents = await enregistrerDocuments(req, req.utilisateur.id, null);
    res.status(201).json({ documents });
  })
);

// GET /api/v1/profil/commentaires — V3 : commentaires et pathologies rédigés par MES médecins (lecture seule)
router.get(
  '/commentaires',
  asyncHandler(async (req, res) => {
    if (req.utilisateur.role !== 'PATIENT') throw new ErreurHttp(403, "Accès refusé : votre profil n'a pas le droit d'effectuer cette action.");
    const lignes = await prisma.commentairePatient.findMany({
      where: { patientId: req.utilisateur.id },
      include: { rendezVous: { select: { id: true, dateHeure: true } } },
      orderBy: { creeLe: 'desc' },
    });
    res.json({ commentaires: lignes.map(commentairePublic) });
  })
);

module.exports = router;
