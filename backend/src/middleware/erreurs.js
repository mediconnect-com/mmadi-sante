// Gestion centralisée des erreurs : messages en français, aucune fuite technique vers le client.
const { ZodError } = require('zod');
const { ErreurHttp } = require('../lib/erreurs');

function routeIntrouvable(req, res, next) {
  next(new ErreurHttp(404, 'Route introuvable.'));
}

// eslint-disable-next-line no-unused-vars
function gestionErreurs(err, req, res, next) {
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ champ: i.path.join('.'), message: i.message }));
    return res.status(400).json({ erreur: details[0]?.message || 'Données invalides.', details });
  }
  if (err instanceof ErreurHttp) {
    return res.status(err.statut).json({ erreur: err.message, details: err.details });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ erreur: 'Corps de requête JSON invalide.' });
  }
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ erreur: 'Requête trop volumineuse.' });
  }
  if (err && err.code === 'P2002') {
    return res.status(409).json({ erreur: 'Cette valeur existe déjà (doublon).' });
  }
  console.error('[ERREUR]', req.method, req.originalUrl, err);
  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
}

module.exports = { routeIntrouvable, gestionErreurs };
