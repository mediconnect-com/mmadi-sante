// Seed : crée 4 comptes de démonstration (mot de passe commun) et une attribution médecin → patient.
// Idempotent : peut être relancé sans créer de doublons (il réinitialise le mot de passe des comptes démo).
//   Lancer :  npm run seed      (depuis le dossier backend)
//
// ⚠ Ces comptes sont PUBLICS (documentés dans le README) : supprimez-les dès que vous passez en usage réel
//   (voir « npm run supprimer-demo »). Ils ne sont plus affichés sur l'écran de connexion du site.
const bcrypt = require('bcryptjs');
const prisma = require('../src/lib/prisma');
const { chiffrer } = require('../src/lib/chiffrement');

const MOT_DE_PASSE_DEMO = 'MmadiDemo2026!';

const COMPTES = [
  {
    email: 'admin@mmadisante.demo',
    role: 'ADMIN',
    nom: 'Administrateur',
    prenom: 'Démo',
    adresse: '1 rue de la Démo, 75001 Paris',
    telephone: '+33 6 00 00 00 01',
  },
  {
    email: 'medecin@mmadisante.demo',
    role: 'MEDECIN',
    nom: 'Martin',
    prenom: 'Claire',
    adresse: 'Cabinet médical, 12 avenue de la Santé, 69003 Lyon',
    telephone: '+33 6 00 00 00 02',
    adresseProfessionnelle: 'Cabinet médical, 12 avenue de la Santé, 69003 Lyon',
    specialites: ['Médecine générale'],
  },
  {
    email: 'patient@mmadisante.demo',
    role: 'PATIENT',
    nom: 'Mmadi',
    prenom: 'Amina',
    adresse: '8 rue des Lilas, 13001 Marseille',
    telephone: '+33 6 00 00 00 03',
    carteIdentite: 'DEMO-123456789',
  },
  {
    email: 'patient2@mmadisante.demo',
    role: 'PATIENT',
    nom: 'Durand',
    prenom: 'Paul',
    adresse: '5 place du Marché, 31000 Toulouse',
    telephone: '+33 6 00 00 00 04',
    carteIdentite: 'DEMO-987654321',
  },
];

async function semer() {
  const hash = await bcrypt.hash(MOT_DE_PASSE_DEMO, 12);
  const crees = {};

  for (const c of COMPTES) {
    const donnees = {
      motDePasseHash: hash,
      role: c.role,
      nom: c.nom,
      prenom: c.prenom,
      adresse: c.adresse,
      telephone: c.telephone,
      adresseProfessionnelle: c.adresseProfessionnelle || null,
      carteIdentiteChiffree: chiffrer(c.carteIdentite),
    };
    crees[c.email] = await prisma.utilisateur.upsert({
      where: { email: c.email },
      update: donnees,
      create: { email: c.email, ...donnees },
    });
  }

  // Spécialités du médecin démo (la liste de référence est créée par la migration 0003).
  for (const c of COMPTES.filter((x) => x.specialites)) {
    for (const libelle of c.specialites) {
      const specialite = await prisma.specialite.findUnique({ where: { libelle } });
      if (!specialite) continue;
      await prisma.medecinSpecialite.upsert({
        where: { medecinId_specialiteId: { medecinId: crees[c.email].id, specialiteId: specialite.id } },
        update: {},
        create: { medecinId: crees[c.email].id, specialiteId: specialite.id },
      });
    }
  }

  // Le médecin démo suit le patient démo « Amina Mmadi » (mais PAS « Paul Durand » : utile pour tester les accès).
  const patientId = crees['patient@mmadisante.demo'].id;
  const medecinId = crees['medecin@mmadisante.demo'].id;
  await prisma.attribution.upsert({
    where: { patientId_medecinId: { patientId, medecinId } },
    update: {},
    create: { patientId, medecinId },
  });

  return { motDePasse: MOT_DE_PASSE_DEMO, comptes: COMPTES.map((c) => ({ email: c.email, role: c.role })) };
}

module.exports = { semer, MOT_DE_PASSE_DEMO };

if (require.main === module) {
  semer()
    .then((r) => {
      console.log('✔ Comptes de démonstration prêts (mot de passe commun : ' + r.motDePasse + ')');
      r.comptes.forEach((c) => console.log(`   - ${c.role.padEnd(8)} ${c.email}`));
    })
    .catch((e) => {
      console.error('✖ Échec du seed :', e.message);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
