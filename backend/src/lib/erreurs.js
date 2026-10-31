// Erreur HTTP applicative + enveloppe pour les routes asynchrones.
class ErreurHttp extends Error {
  constructor(statut, message, details) {
    super(message);
    this.statut = statut;
    this.details = details;
  }
}

/** Transmet automatiquement les erreurs des routes async au gestionnaire d'erreurs. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ErreurHttp, asyncHandler };
