// Supprime les 4 comptes de DÉMONSTRATION (et eux seuls), reconnus par leur adresse e-mail exacte.
//   npm run supprimer-demo             -> APERÇU : liste ce qui serait supprimé, ne supprime rien
//   npm run supprimer-demo -- --oui    -> supprime réellement
//
// Garde-fous : refuse de s'exécuter s'il ne resterait aucun autre administrateur ; ne touche à aucun
// autre compte (même s'il porte une adresse en @mmadisante.demo : il est alors seulement signalé).
// Les documents, rendez-vous et attributions des comptes supprimés disparaissent avec eux (cascade).
const prisma = require('../src/lib/prisma');

const EMAILS_DEMO = ['admin@mmadisante.demo', 'medecin@mmadisante.demo', 'patient@mmadisante.demo', 'patient2@mmadisante.demo'];

async function principal() {
  const confirme = process.argv.includes('--oui');
  const comptes = await prisma.utilisateur.findMany({
    where: { email: { in: EMAILS_DEMO } },
    select: { id: true, email: true, role: true, nom: true, prenom: true },
    orderBy: { email: 'asc' },
  });
  const autresDomaine = await prisma.utilisateur.findMany({
    where: { email: { endsWith: '@mmadisante.demo' }, NOT: { email: { in: EMAILS_DEMO } } },
    select: { email: true },
  });

  if (comptes.length === 0) {
    console.log('Aucun compte de démonstration dans la base : rien à faire.');
    return;
  }

  console.log('Comptes de démonstration trouvés :');
  const ids = comptes.map((c) => c.id);
  for (const c of comptes) {
    const [documents, rendezVous] = await Promise.all([
      prisma.document.count({ where: { proprietaireId: c.id } }),
      prisma.rendezVous.count({ where: { OR: [{ patientId: c.id }, { medecinId: c.id }] } }),
    ]);
    console.log(`  - ${c.role.padEnd(8)} ${c.email}  (${c.prenom} ${c.nom}) : ${documents} document(s), ${rendezVous} rendez-vous`);
  }
  if (autresDomaine.length > 0) {
    console.log('Comptes en @mmadisante.demo NON supprimés (hors liste officielle) : ' + autresDomaine.map((a) => a.email).join(', '));
  }
  // Rendez-vous entre un compte démo et un vrai compte : ils seraient supprimés aussi.
  const rdvMixtes = await prisma.rendezVous.count({
    where: { OR: [{ patientId: { in: ids } }, { medecinId: { in: ids } }], NOT: { AND: [{ patientId: { in: ids } }, { medecinId: { in: ids } }] } },
  });
  if (rdvMixtes > 0) console.log(`⚠ ${rdvMixtes} rendez-vous liant un compte de démonstration à un autre compte seront aussi supprimés.`);

  const autresAdmins = await prisma.utilisateur.count({ where: { role: 'ADMIN', id: { notIn: ids } } });
  if (autresAdmins === 0) {
    console.error('\n✖ Annulé : il ne resterait aucun administrateur. Créez d\'abord VOTRE compte administrateur');
    console.error('  (connectez-vous en administrateur > Utilisateurs > « + Nouvel utilisateur »), puis relancez.');
    process.exitCode = 1;
    return;
  }

  if (!confirme) {
    console.log('\nAPERÇU seulement : rien n\'a été supprimé. Pour supprimer ces comptes :  npm run supprimer-demo -- --oui');
    return;
  }
  const { count } = await prisma.utilisateur.deleteMany({ where: { id: { in: ids } } });
  console.log(`\n✔ ${count} compte(s) de démonstration supprimé(s).`);
}

principal()
  .catch((e) => {
    console.error('✖ Échec :', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
