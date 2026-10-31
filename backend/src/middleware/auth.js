// Authentification (JWT) et contrôle du profil (rôle) sur les routes.
const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../lib/prisma');
const { ErreurHttp, asyncHandler } = require('../lib/erreurs');

/** Crée un jeton JWT pour un utilisateur. */
function signerJeton(utilisateur) {
  return jwt.sign({ role: utilisateur.role }, config.jwtSecret, {
    subject: utilisateur.id,
    expiresIn: config.jwtExpiration,
    algorithm: 'HS256',
  });
}

/**
 * Vérifie le jeton « Authorization: Bearer ... » puis RECHARGE l'utilisateur depuis la base :
 * un compte supprimé ou un rôle modifié est donc pris en compte immédiatement
 * (le rôle du jeton n'est jamais cru sur parole).
 */
const authentifier = asyncHandler(async (req, res, next) => {
  const [type, jeton] = (req.headers.authorization || '').split(' ');
  if (type !== 'Bearer' || !jeton) throw new ErreurHttp(401, 'Authentification requise.');

  let charge;
  try {
    charge = jwt.verify(jeton, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new ErreurHttp(401, 'Session invalide ou expirée. Veuillez vous reconnecter.');
  }

  const utilisateur = await prisma.utilisateur.findUnique({
    where: { id: charge.sub },
    select: { id: true, role: true },
  });
  if (!utilisateur) throw new ErreurHttp(401, "Ce compte n'existe plus.");

  req.utilisateur = utilisateur; // { id, role } issus de la base
  next();
});

/** Autorise uniquement les profils listés (à placer APRÈS authentifier). */
const exigerRole =
  (...rolesAutorises) =>
  (req, res, next) => {
    if (!req.utilisateur || !rolesAutorises.includes(req.utilisateur.role)) {
      return next(new ErreurHttp(403, "Accès refusé : votre profil n'a pas le droit d'effectuer cette action."));
    }
    next();
  };

module.exports = { signerJeton, authentifier, exigerRole };
