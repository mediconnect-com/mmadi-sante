// Configuration centralisée : lecture et validation des variables d'environnement.
// Chaque variable est documentée dans backend/.env.example
require('dotenv').config();
const crypto = require('crypto');

const env = process.env;
const production = env.NODE_ENV === 'production';

/** Lit une variable obligatoire ou arrête le démarrage avec un message clair. */
function exiger(nom) {
  const valeur = env[nom];
  if (!valeur || !valeur.trim()) {
    throw new Error(
      `Variable d'environnement manquante : ${nom}. Consultez backend/.env.example pour savoir quoi renseigner.`
    );
  }
  return valeur.trim();
}

exiger('DATABASE_URL');
// Sans DIRECT_URL (cas du PostgreSQL local), on réutilise DATABASE_URL.
if (!env.DIRECT_URL) env.DIRECT_URL = env.DATABASE_URL;

const jwtSecret = exiger('JWT_SECRET');
if (jwtSecret.length < 32) {
  throw new Error('JWT_SECRET doit contenir au moins 32 caractères (voir .env.example pour en générer un).');
}

const cleChiffrementBrute = exiger('ENCRYPTION_KEY');
if (cleChiffrementBrute.length < 16) {
  throw new Error('ENCRYPTION_KEY doit contenir au moins 16 caractères (voir .env.example pour en générer une).');
}

// Origines autorisées à appeler l'API depuis un navigateur (CORS), séparées par des virgules.
const origines = (env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
if (production && origines.length === 0) {
  throw new Error(
    "FRONTEND_URL est obligatoire en production (adresse du site web, ex. https://mmadi-sante-web.onrender.com)."
  );
}
if (!production && origines.length === 0) origines.push('http://localhost:3000');

module.exports = {
  production,
  port: Number(env.PORT) || 4000,
  jwtSecret,
  jwtExpiration: env.JWT_EXPIRES_IN || '8h',
  originesAutorisees: origines,
  // La clé AES-256 est dérivée (SHA-256) de ENCRYPTION_KEY : n'importe quelle chaîne longue convient.
  cleChiffrement: crypto.createHash('sha256').update(cleChiffrementBrute).digest(),
  tailleMaxFichierOctets: (Number(env.MAX_FILE_MB) || 5) * 1024 * 1024,
  maxFichiersParEnvoi: 5,
  maxDocumentsParUtilisateur: 50,
  // Mode « sans binaire » : utilise le pilote pg au lieu du moteur natif de Prisma (réseau restreint).
  prismaAdaptateurPg: env.PRISMA_ADAPTER_PG === 'true',
};
