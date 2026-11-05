// Démarrage « tout-en-un » utilisé par l'hébergeur (npm start) :
//   1) applique les migrations Prisma (via DIRECT_URL, port 5432) ;
//   2) lance l'API (qui utilise DATABASE_URL, port 6543 pour Supabase).
// Si le schéma a déjà été créé à la main avec database/schema.sql, la migration peut refuser de
// s'exécuter : on vérifie alors que les tables existent et on démarre quand même.
const { execSync } = require('child_process');
require('./config'); // valide les variables d'environnement (et définit DIRECT_URL si absente)

async function main() {
  if (process.env.SKIP_MIGRATE === 'true') {
    console.log('[démarrage] SKIP_MIGRATE=true : migrations ignorées.');
  } else {
    try {
      console.log('[démarrage] Application des migrations Prisma...');
      execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
    } catch {
      console.warn('[démarrage] La migration automatique a échoué. Vérification des tables existantes...');
      const prisma = require('./lib/prisma');
      let tablesExistent = true;
      try {
        await prisma.utilisateur.count();
      } catch {
        tablesExistent = false;
      }
      if (!tablesExistent) {
        console.error(
          '[démarrage] ERREUR : impossible de migrer et les tables sont absentes.\n' +
            '  -> Vérifiez DIRECT_URL (port 5432) dans les variables d\'environnement,\n' +
            '  -> ou exécutez database/schema.sql dans l\'éditeur SQL de Supabase, puis relancez.'
        );
        process.exit(1);
      }
      console.warn('[démarrage] Les tables existent déjà (schéma créé via database/schema.sql ?) : on continue.');
      // Met à jour la base avec les évolutions récentes (spécialités, rendez-vous...) sans toucher aux données existantes.
      try {
        const { appliquerMigrationsIdempotentes } = require('./lib/migrationsSql');
        await appliquerMigrationsIdempotentes();
      } catch (e) {
        console.error(
          '[démarrage] ERREUR pendant la mise à jour de la base : ' + e.message + '\n' +
            '  -> Exécutez database/mise_a_jour_v2.sql, mise_a_jour_v3.sql puis mise_a_jour_v4.sql dans l\'éditeur SQL de Supabase, puis relancez.'
        );
        process.exit(1);
      }
    }
  }
  require('./server');
}

main();
