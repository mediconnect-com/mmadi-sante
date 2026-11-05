// Tests d'intégration de « mot de passe oublié » : demande par e-mail, lien à usage unique, expiration,
// enregistrement du nouveau mot de passe (hash) en base. Vraie base PostgreSQL ; l'e-mail est capturé (aucun envoi réel).
//   Lancer :  npm test
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-0123456789-0123456789-0123456789';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'cle-de-chiffrement-de-test-123456';
process.env.FRONTEND_URL = 'http://localhost:3000';
delete process.env.RESEND_API_KEY;
process.env.LIMITE_OUBLI_PAR_HEURE = '1000';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { boiteDeTest } = require('../src/lib/courriel');

const suffixe = Date.now().toString(36);
const ANCIEN = 'Ancien2026x';
const NOUVEAU = 'Nouveau2026x';
let serveur;
let base;
const ids = [];

async function appel(methode, chemin, json) {
  const res = await fetch(base + chemin, { method: methode, headers: { 'Content-Type': 'application/json' }, body: json ? JSON.stringify(json) : undefined });
  return { statut: res.status, donnees: await res.json().catch(() => null) };
}
async function creerPatient(nom) {
  const email = `test-${nom}-${suffixe}@exemple.fr`;
  const r = await appel('POST', '/auth/inscription', { email, motDePasse: ANCIEN, nom, prenom: 'Test' });
  assert.equal(r.statut, 201);
  ids.push(r.donnees.utilisateur.id);
  return { id: r.donnees.utilisateur.id, email };
}
const attendreCourriel = async (email) => {
  for (let i = 0; i < 40; i++) {
    const m = [...boiteDeTest].reverse().find((x) => x.a === email && /réinitialisation/.test(x.sujet));
    if (m) return m;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
};
const jetonDuCourriel = (m) => decodeURIComponent(/jeton=([^\s"&<]+)/.exec(m.texte)[1]);
// Les demandes de la même adresse à moins d'une minute d'intervalle sont ignorées : on « vieillit » la précédente.
const vieillir = (id) => prisma.reinitialisationMotDePasse.updateMany({ where: { utilisateurId: id }, data: { creeLe: new Date(Date.now() - 120000) } });

before(async () => {
  await new Promise((ok) => {
    serveur = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${serveur.address().port}/api/v1`;
});
after(async () => {
  await prisma.utilisateur.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
  await new Promise((ok) => serveur.close(ok));
});

describe('Mot de passe oublié', () => {
  it('parcours complet : demande -> e-mail avec lien -> nouveau mot de passe enregistré en base -> connexion', async () => {
    const p = await creerPatient('oubli1');
    const d = await appel('POST', '/auth/mot-de-passe-oublie', { email: p.email });
    assert.equal(d.statut, 200);
    const mail = await attendreCourriel(p.email);
    assert.ok(mail, 'e-mail attendu');
    assert.match(mail.texte, /^Bonjour Test/);
    assert.match(mail.texte, /http:\/\/localhost:3000\/reinitialisation\/\?jeton=/);
    const jeton = jetonDuCourriel(mail);

    // Seule l'empreinte est en base, jamais le jeton.
    const lignes = await prisma.reinitialisationMotDePasse.findMany({ where: { utilisateurId: p.id } });
    assert.equal(lignes.length, 1);
    assert.notEqual(lignes[0].jetonHash, jeton);
    assert.equal(lignes[0].jetonHash.length, 64);

    assert.equal((await appel('POST', '/auth/mot-de-passe-oublie/verifier', { jeton })).donnees.valide, true);
    const avant = (await prisma.utilisateur.findUnique({ where: { id: p.id } })).motDePasseHash;
    const r = await appel('POST', '/auth/reinitialiser-mot-de-passe', { jeton, nouveauMotDePasse: NOUVEAU });
    assert.equal(r.statut, 200, JSON.stringify(r.donnees));

    const apres = (await prisma.utilisateur.findUnique({ where: { id: p.id } })).motDePasseHash;
    assert.notEqual(apres, avant);
    assert.ok(await bcrypt.compare(NOUVEAU, apres), 'le nouveau mot de passe est enregistré (hash bcrypt)');
    assert.equal((await appel('POST', '/auth/connexion', { email: p.email, motDePasse: ANCIEN })).statut, 401);
    assert.equal((await appel('POST', '/auth/connexion', { email: p.email, motDePasse: NOUVEAU })).statut, 200);
    assert.ok(await attendreCourriel(p.email), 'confirmation de modification envoyée');
  });

  it('le lien est à usage unique', async () => {
    const p = await creerPatient('oubli2');
    await appel('POST', '/auth/mot-de-passe-oublie', { email: p.email });
    const jeton = jetonDuCourriel(await attendreCourriel(p.email));
    assert.equal((await appel('POST', '/auth/reinitialiser-mot-de-passe', { jeton, nouveauMotDePasse: NOUVEAU })).statut, 200);
    assert.equal((await appel('POST', '/auth/mot-de-passe-oublie/verifier', { jeton })).donnees.valide, false);
    const second = await appel('POST', '/auth/reinitialiser-mot-de-passe', { jeton, nouveauMotDePasse: 'Autre2026xy' });
    assert.equal(second.statut, 400);
    assert.equal((await appel('POST', '/auth/connexion', { email: p.email, motDePasse: NOUVEAU })).statut, 200);
  });

  it('deux clics simultanés : un seul passe', async () => {
    const p = await creerPatient('oubli3');
    await appel('POST', '/auth/mot-de-passe-oublie', { email: p.email });
    const jeton = jetonDuCourriel(await attendreCourriel(p.email));
    const [a, b] = await Promise.all([
      appel('POST', '/auth/reinitialiser-mot-de-passe', { jeton, nouveauMotDePasse: 'Premier2026x' }),
      appel('POST', '/auth/reinitialiser-mot-de-passe', { jeton, nouveauMotDePasse: 'Second2026xy' }),
    ]);
    assert.deepEqual([a.statut, b.statut].sort(), [200, 400]);
  });

  it('lien expiré, inventé ou mot de passe faible : refus (400) sans rien modifier', async () => {
    const p = await creerPatient('oubli4');
    await appel('POST', '/auth/mot-de-passe-oublie', { email: p.email });
    const jeton = jetonDuCourriel(await attendreCourriel(p.email));
    assert.equal((await appel('POST', '/auth/reinitialiser-mot-de-passe', { jeton, nouveauMotDePasse: 'court1' })).statut, 400);
    assert.equal((await appel('POST', '/auth/reinitialiser-mot-de-passe', { jeton, nouveauMotDePasse: 'sansaucunchiffre' })).statut, 400);
    assert.equal((await appel('POST', '/auth/mot-de-passe-oublie/verifier', { jeton })).donnees.valide, true); // faibles refusés : le lien n'est pas consommé
    assert.equal((await appel('POST', '/auth/reinitialiser-mot-de-passe', { jeton: 'x'.repeat(43), nouveauMotDePasse: NOUVEAU })).statut, 400);
    await prisma.reinitialisationMotDePasse.updateMany({ where: { utilisateurId: p.id }, data: { expireLe: new Date(Date.now() - 1000) } });
    assert.equal((await appel('POST', '/auth/mot-de-passe-oublie/verifier', { jeton })).donnees.valide, false);
    assert.equal((await appel('POST', '/auth/reinitialiser-mot-de-passe', { jeton, nouveauMotDePasse: NOUVEAU })).statut, 400);
    assert.equal((await appel('POST', '/auth/connexion', { email: p.email, motDePasse: ANCIEN })).statut, 200); // inchangé
  });

  it('une nouvelle demande invalide la précédente ; une demande dans la minute est ignorée', async () => {
    const p = await creerPatient('oubli5');
    await appel('POST', '/auth/mot-de-passe-oublie', { email: p.email });
    const j1 = jetonDuCourriel(await attendreCourriel(p.email));
    const n = boiteDeTest.length;
    await appel('POST', '/auth/mot-de-passe-oublie', { email: p.email }); // < 1 min : ignorée
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(boiteDeTest.length, n, 'pas de second e-mail dans la minute');
    await vieillir(p.id);
    await appel('POST', '/auth/mot-de-passe-oublie', { email: p.email });
    await new Promise((r) => setTimeout(r, 150));
    const j2 = jetonDuCourriel([...boiteDeTest].reverse().find((x) => x.a === p.email));
    assert.notEqual(j1, j2);
    assert.equal((await appel('POST', '/auth/mot-de-passe-oublie/verifier', { jeton: j1 })).donnees.valide, false);
    assert.equal((await appel('POST', '/auth/mot-de-passe-oublie/verifier', { jeton: j2 })).donnees.valide, true);
  });

  it('même réponse pour un e-mail inconnu (ne révèle pas l\'existence du compte) et aucun e-mail envoyé', async () => {
    const connu = await creerPatient('oubli6');
    const n = boiteDeTest.length;
    const a = await appel('POST', '/auth/mot-de-passe-oublie', { email: connu.email });
    const inconnu = `personne-${suffixe}@exemple.fr`;
    const b = await appel('POST', '/auth/mot-de-passe-oublie', { email: inconnu });
    assert.equal(a.statut, 200);
    assert.deepEqual(a.donnees, b.donnees);
    await new Promise((r) => setTimeout(r, 150));
    assert.ok(!boiteDeTest.slice(n).some((m) => m.a === inconnu));
    assert.equal((await appel('POST', '/auth/mot-de-passe-oublie', { email: 'pas-un-email' })).statut, 400);
  });

  it('une fiche médecin sans compte de connexion ne reçoit rien', async () => {
    const sans = await prisma.utilisateur.create({
      data: { email: `sans-${suffixe}@exemple.fr`, motDePasseHash: await bcrypt.hash('x1x1x1x1x1', 4), role: 'MEDECIN', nom: 'Sans', prenom: 'Compte', sansCompte: true },
    });
    ids.push(sans.id);
    const n = boiteDeTest.length;
    assert.equal((await appel('POST', '/auth/mot-de-passe-oublie', { email: sans.email })).statut, 200);
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(boiteDeTest.length, n);
    assert.equal(await prisma.reinitialisationMotDePasse.count({ where: { utilisateurId: sans.id } }), 0);
  });

  it('suppression du compte : ses demandes disparaissent (cascade)', async () => {
    const p = await creerPatient('oubli7');
    await appel('POST', '/auth/mot-de-passe-oublie', { email: p.email });
    await attendreCourriel(p.email);
    await prisma.utilisateur.delete({ where: { id: p.id } });
    assert.equal(await prisma.reinitialisationMotDePasse.count({ where: { utilisateurId: p.id } }), 0);
  });
});
