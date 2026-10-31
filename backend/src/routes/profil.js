// « Mon compte » : chaque utilisateur ne manipule QUE ses propres données.
// Aucun identifiant n'est lu dans l'URL ici : tout est basé sur req.utilisateur (issu du jeton + base).
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const config = require('../config');
const prisma = require('../lib/prisma');
const { chiffrer } = require('../lib/chiffrement');
const { ErreurHttp, asyncHandler } = require('../lib/erreurs');
const { schemaMajProfil, schemaChangementMotDePasse, schemaDocument } = require('../lib/validation');
const { utilisateurPublic, selectDocumentSansContenu } = require('../lib/serialiser');
const { fichierValide, nettoyerNomFichier } = require('../lib/fichiers');
const { authentifier } = require('../middleware/auth');

const router = express.Router();
router.use(authentifier);

// Les fichiers restent en mémoire puis sont enregistrés dans la base (colonne bytea).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.tailleMaxFichierOctets, files: config.maxFichiersParEnvoi },
});

function televerser(req, res, next) {
  upload.array('fichiers', config.maxFichiersParEnvoi)(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ErreurHttp(413, `Fichier trop volumineux (maximum ${config.tailleMaxFichierOctets / 1024 / 1024} Mo).`));
      }
      return next(new ErreurHttp(400, `Envoi invalide (maximum ${config.maxFichiersParEnvoi} fichiers à la fois).`));
    }
    next(err);
  });
}

// GET /api/v1/profil
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = await prisma.utilisateur.findUnique({ where: { id: req.utilisateur.id } });
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

    const u = await prisma.utilisateur.update({ where: { id: req.utilisateur.id }, data });
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
    const fichiers = req.files || [];
    if (fichiers.length === 0) throw new ErreurHttp(400, 'Aucun fichier reçu.');
    const meta = schemaDocument.parse(req.body);

    const dejaPresents = await prisma.document.count({ where: { proprietaireId: req.utilisateur.id } });
    if (dejaPresents + fichiers.length > config.maxDocumentsParUtilisateur) {
      throw new ErreurHttp(400, `Limite de ${config.maxDocumentsParUtilisateur} documents atteinte.`);
    }
    for (const f of fichiers) {
      if (!fichierValide(f.mimetype, f.buffer)) {
        throw new ErreurHttp(400, `« ${nettoyerNomFichier(f.originalname)} » refusé : seuls les PDF, JPG et PNG valides sont acceptés.`);
      }
    }

    const crees = [];
    for (const f of fichiers) {
      const doc = await prisma.document.create({
        data: {
          proprietaireId: req.utilisateur.id,
          nomFichier: nettoyerNomFichier(f.originalname),
          typeMime: f.mimetype,
          tailleOctets: f.size,
          categorie: meta.categorie,
          description: meta.description,
          contenu: f.buffer,
        },
        select: selectDocumentSansContenu,
      });
      crees.push(doc);
    }
    res.status(201).json({ documents: crees });
  })
);

module.exports = router;
