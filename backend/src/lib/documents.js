// Envoi de documents (PDF, JPG, PNG) : réception multipart, contrôles, enregistrement en base.
// Utilisé par le patient (« Mon dossier ») et, depuis la V3, par un médecin dans la fiche de SON patient.
const multer = require('multer');
const config = require('../config');
const prisma = require('./prisma');
const { ErreurHttp } = require('./erreurs');
const { schemaDocument } = require('./validation');
const { selectDocumentSansContenu } = require('./serialiser');
const { fichierValide, nettoyerNomFichier } = require('./fichiers');

// Les fichiers restent en mémoire puis sont enregistrés dans la base (colonne bytea).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.tailleMaxFichierOctets, files: config.maxFichiersParEnvoi },
});

/** Middleware : lit le champ « fichiers » (plusieurs fichiers) avec des messages d'erreur en français. */
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

/**
 * Enregistre les fichiers reçus dans la fiche du patient `proprietaireId`.
 * deposant : null (le patient dépose lui-même) ou { id, nomComplet } d'un médecin qui dépose dans la fiche.
 */
async function enregistrerDocuments(req, proprietaireId, deposant = null) {
  const fichiers = req.files || [];
  if (fichiers.length === 0) throw new ErreurHttp(400, 'Aucun fichier reçu.');
  const meta = schemaDocument.parse(req.body);

  const dejaPresents = await prisma.document.count({ where: { proprietaireId } });
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
        proprietaireId,
        nomFichier: nettoyerNomFichier(f.originalname),
        typeMime: f.mimetype,
        tailleOctets: f.size,
        categorie: meta.categorie,
        description: meta.description,
        contenu: f.buffer,
        deposeParMedecinId: deposant ? deposant.id : null,
        deposeParNom: deposant ? deposant.nomComplet : null,
      },
      select: selectDocumentSansContenu,
    });
    crees.push(doc);
  }
  return crees;
}

module.exports = { televerser, enregistrerDocuments };
