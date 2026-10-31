// Repli pour les bases créées « à la main » avec database/schema.sql (donc sans historique de migrations Prisma) :
// `prisma migrate deploy` refuse alors de s'exécuter. Les migrations numérotées 0003 et suivantes sont écrites
// pour être IDEMPOTENTES (IF NOT EXISTS, ON CONFLICT DO NOTHING) : on peut donc les rejouer sans risque
// à chaque démarrage, sans jamais modifier ni supprimer de données existantes.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const PREMIERE_MIGRATION_IDEMPOTENTE = '0003';

function optionsConnexion() {
  const url = new URL(process.env.DIRECT_URL || process.env.DATABASE_URL);
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('connection_limit');
  const sslDemande = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');
  const hoteLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const ssl = sslDemande === 'disable' || (hoteLocal && !sslDemande) ? false : { rejectUnauthorized: false };
  return { connectionString: url.toString(), ssl };
}

async function appliquerMigrationsIdempotentes() {
  const dossier = path.join(__dirname, '..', '..', 'prisma', 'migrations');
  const noms = fs
    .readdirSync(dossier)
    .filter((n) => /^\d{4}_/.test(n) && n.slice(0, 4) >= PREMIERE_MIGRATION_IDEMPOTENTE)
    .sort();
  const client = new Client(optionsConnexion());
  await client.connect();
  try {
    for (const nom of noms) {
      const fichier = path.join(dossier, nom, 'migration.sql');
      if (!fs.existsSync(fichier)) continue;
      await client.query(fs.readFileSync(fichier, 'utf8'));
      console.log(`[démarrage] Mise à jour de la base appliquée : ${nom}`);
    }
  } finally {
    await client.end();
  }
}

module.exports = { appliquerMigrationsIdempotentes };
