// Client Prisma unique pour toute l'application.
const { PrismaClient } = require('@prisma/client');
const config = require('../config');

function creerClient() {
  if (!config.prismaAdaptateurPg) {
    // Mode normal : moteur natif de Prisma. Pour Supabase, DATABASE_URL doit contenir ?pgbouncer=true (port 6543).
    return new PrismaClient();
  }

  // Mode « sans binaire » (PRISMA_ADAPTER_PG=true) : pilote pg direct, utile quand binaries.prisma.sh est bloqué.
  const { PrismaPg } = require('@prisma/adapter-pg');
  const url = new URL(process.env.DATABASE_URL);
  // Ces paramètres sont propres à Prisma : pg ne les comprend pas.
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('connection_limit');
  const sslDemande = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');
  const hoteLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const ssl = sslDemande === 'disable' || (hoteLocal && !sslDemande) ? false : { rejectUnauthorized: false };
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: url.toString(), ssl }),
  });
}

const globale = globalThis;
const prisma = globale.__prismaMmadi || creerClient();
if (!config.production) globale.__prismaMmadi = prisma;

module.exports = prisma;
