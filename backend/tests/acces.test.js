// Tests d'intégration : vérifient côté SERVEUR toutes les règles d'accès (patient / médecin / admin).
// Ils s'exécutent contre une vraie base PostgreSQL (DATABASE_URL) :   npm test
// ⚠ Utiliser une base de test : le seed démo est relancé et des comptes « test-... » sont créés puis supprimés.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-0123456789-0123456789-0123456789';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'cle-de-chiffrement-de-test-123456';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.MAX_FILE_MB = '1'; // limite basse pour tester le refus des gros fichiers

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { semer, MOT_DE_PASSE_DEMO } = require('../prisma/seed');

const MDP = MOT_DE_PASSE_DEMO;
const suffixe = Date.now().toString(36);
let serveur;
let base;
const jetons = {};
const idsCrees = [];

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

async function appel(methode, chemin, { jeton, json, form } = {}) {
  const headers = {};
  if (jeton) headers.Authorization = `Bearer ${jeton}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) {
    body = form;
  }
  const res = await fetch(base + chemin, { method: methode, headers, body });
  const type = res.headers.get('content-type') || '';
  const donnees = type.includes('application/json') ? await res.json() : Buffer.from(await res.arrayBuffer());
  return { statut: res.status, donnees, entetes: res.headers };
}

async function connecter(email, motDePasse = MDP) {
  const r = await appel('POST', '/auth/connexion', { json: { email, motDePasse } });
  assert.equal(r.statut, 200, `connexion ${email} : ${JSON.stringify(r.donnees)}`);
  return { jeton: r.donnees.jeton, id: r.donnees.utilisateur.id };
}

function formulaireFichier(contenu, nom, type, categorie = 'ORDONNANCE') {
  const form = new FormData();
  form.append('fichiers', new Blob([contenu], { type }), nom);
  form.append('categorie', categorie);
  return form;
}

before(async () => {
  await semer();
  await new Promise((ok) => {
    serveur = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${serveur.address().port}/api/v1`;

  jetons.admin = await connecter('admin@mmadisante.demo');
  jetons.medecin = await connecter('medecin@mmadisante.demo');
  jetons.patientA = await connecter('patient@mmadisante.demo');
  jetons.patientB = await connecter('patient2@mmadisante.demo');

  // Un second médecin, sans aucun patient attribué
  const r = await appel('POST', '/admin/utilisateurs', {
    jeton: jetons.admin.jeton,
    json: { email: `test-medecin2-${suffixe}@exemple.fr`, motDePasse: MDP, role: 'MEDECIN', nom: 'Test', prenom: 'Médecin2' },
  });
  assert.equal(r.statut, 201);
  idsCrees.push(r.donnees.utilisateur.id);
  jetons.medecin2 = await connecter(`test-medecin2-${suffixe}@exemple.fr`);
});

after(async () => {
  await prisma.utilisateur.deleteMany({ where: { id: { in: idsCrees } } });
  await prisma.document.deleteMany({ where: { nomFichier: { startsWith: 'test-' } } });
  await prisma.$disconnect();
  await new Promise((ok) => serveur.close(ok));
});

describe('Santé et sécurité générale', () => {
  it("l'endpoint /sante répond et la base est joignable", async () => {
    const r = await appel('GET', '/sante');
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.baseDeDonnees, 'ok');
  });

  it('CORS : une origine inconnue ne reçoit pas les en-têtes d\'autorisation', async () => {
    const res = await fetch(base + '/sante', { headers: { Origin: 'https://site-malveillant.example' } });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    const ok = await fetch(base + '/sante', { headers: { Origin: 'http://localhost:3000' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  });
});

describe('Authentification', () => {
  it("l'inscription publique crée TOUJOURS un patient, même si le client envoie role=ADMIN", async () => {
    const email = `test-pirate-${suffixe}@exemple.fr`;
    const r = await appel('POST', '/auth/inscription', {
      json: { email, motDePasse: MDP, nom: 'Pirate', prenom: 'Zoe', role: 'ADMIN', carteIdentite: 'CNI-SECRET-42' },
    });
    assert.equal(r.statut, 201);
    idsCrees.push(r.donnees.utilisateur.id);
    assert.equal(r.donnees.utilisateur.role, 'PATIENT');
    assert.equal(r.donnees.utilisateur.motDePasseHash, undefined, 'le hash ne doit jamais être renvoyé');
    // Le jeton obtenu ne donne aucun accès admin
    const admin = await appel('GET', '/admin/statistiques', { jeton: r.donnees.jeton });
    assert.equal(admin.statut, 403);
    jetons.patientC = { jeton: r.donnees.jeton, id: r.donnees.utilisateur.id, email };
  });

  it('en base : mot de passe haché (bcrypt) et carte d\'identité chiffrée', async () => {
    const brut = await prisma.utilisateur.findUnique({ where: { id: jetons.patientC.id } });
    assert.match(brut.motDePasseHash, /^\$2[aby]\$12\$/);
    assert.ok(brut.carteIdentiteChiffree && !brut.carteIdentiteChiffree.includes('CNI-SECRET-42'));
    const profil = await appel('GET', '/profil', { jeton: jetons.patientC.jeton });
    assert.equal(profil.donnees.utilisateur.carteIdentite, 'CNI-SECRET-42', 'déchiffrée correctement pour son propriétaire');
  });

  it('refuse un doublon d\'e-mail (409), un mot de passe faible (400) et un mauvais mot de passe (401)', async () => {
    const doublon = await appel('POST', '/auth/inscription', {
      json: { email: jetons.patientC.email, motDePasse: MDP, nom: 'X', prenom: 'Y' },
    });
    assert.equal(doublon.statut, 409);
    const faible = await appel('POST', '/auth/inscription', {
      json: { email: `test-faible-${suffixe}@exemple.fr`, motDePasse: 'abc', nom: 'X', prenom: 'Y' },
    });
    assert.equal(faible.statut, 400);
    const faux = await appel('POST', '/auth/connexion', { json: { email: 'patient@mmadisante.demo', motDePasse: 'Faux-mot-de-passe1' } });
    assert.equal(faux.statut, 401);
  });

  it('refuse les requêtes sans jeton, avec un jeton falsifié ou pour un compte supprimé', async () => {
    assert.equal((await appel('GET', '/profil')).statut, 401);
    assert.equal((await appel('GET', '/profil', { jeton: 'n.importe.quoi' })).statut, 401);
    const falsifie = jetons.admin.jeton.slice(0, -4) + 'AAAA';
    assert.equal((await appel('GET', '/admin/statistiques', { jeton: falsifie })).statut, 401);

    const email = `test-ephemere-${suffixe}@exemple.fr`;
    const ins = await appel('POST', '/auth/inscription', { json: { email, motDePasse: MDP, nom: 'Eph', prenom: 'Mere' } });
    const jeton = ins.donnees.jeton;
    assert.equal((await appel('GET', '/profil', { jeton })).statut, 200);
    await appel('DELETE', `/admin/utilisateurs/${ins.donnees.utilisateur.id}`, { jeton: jetons.admin.jeton });
    assert.equal((await appel('GET', '/profil', { jeton })).statut, 401, 'le jeton d\'un compte supprimé ne doit plus fonctionner');
  });
});

describe('Patient : accès limité à ses propres données', () => {
  it('modifie son profil sans pouvoir changer son rôle ni son e-mail', async () => {
    const r = await appel('PUT', '/profil', {
      jeton: jetons.patientC.jeton,
      json: { nom: 'Nouveau', telephone: '+33 6 12 34 56 78', role: 'ADMIN', email: 'autre@exemple.fr' },
    });
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.utilisateur.nom, 'Nouveau');
    assert.equal(r.donnees.utilisateur.role, 'PATIENT');
    assert.equal(r.donnees.utilisateur.email, jetons.patientC.email);
    assert.equal(r.donnees.utilisateur.carteIdentite, 'CNI-SECRET-42', 'un champ non envoyé reste inchangé');
  });

  it('ne peut consulter ni un autre patient, ni les routes médecin/admin', async () => {
    const autre = await appel('GET', `/utilisateurs/${jetons.patientB.id}`, { jeton: jetons.patientA.jeton });
    assert.equal(autre.statut, 403);
    const soi = await appel('GET', `/utilisateurs/${jetons.patientA.id}`, { jeton: jetons.patientA.jeton });
    assert.equal(soi.statut, 200);
    assert.equal((await appel('GET', '/medecin/patients', { jeton: jetons.patientA.jeton })).statut, 403);
    assert.equal((await appel('GET', '/admin/utilisateurs', { jeton: jetons.patientA.jeton })).statut, 403);
    assert.equal((await appel('GET', '/admin/documents', { jeton: jetons.patientA.jeton })).statut, 403);
    const supp = await appel('DELETE', `/admin/utilisateurs/${jetons.patientB.id}`, { jeton: jetons.patientA.jeton });
    assert.equal(supp.statut, 403);
    assert.equal((await appel('GET', '/utilisateurs/pas-un-uuid', { jeton: jetons.patientA.jeton })).statut, 400);
  });

  it('téléverse des documents valides (PDF et PNG, plusieurs à la fois)', async () => {
    const form = new FormData();
    form.append('fichiers', new Blob([PDF], { type: 'application/pdf' }), 'test-ordonnance.pdf');
    form.append('fichiers', new Blob([PNG], { type: 'image/png' }), 'test-radio.png');
    form.append('categorie', 'DIAGNOSTIC');
    const r = await appel('POST', '/profil/documents', { jeton: jetons.patientA.jeton, form });
    assert.equal(r.statut, 201);
    assert.equal(r.donnees.documents.length, 2);
    assert.equal(r.donnees.documents[0].contenu, undefined, 'le contenu binaire n\'est jamais listé');
    jetons.docPdf = r.donnees.documents[0].id;
    jetons.docPng = r.donnees.documents[1].id;
  });

  it('refuse un faux PDF, un type non autorisé et un fichier trop gros', async () => {
    const faux = await appel('POST', '/profil/documents', {
      jeton: jetons.patientA.jeton,
      form: formulaireFichier(Buffer.from('ceci est du texte, pas un PDF'), 'test-faux.pdf', 'application/pdf'),
    });
    assert.equal(faux.statut, 400);
    const exe = await appel('POST', '/profil/documents', {
      jeton: jetons.patientA.jeton,
      form: formulaireFichier(Buffer.from('MZ-binaire'), 'test-virus.exe', 'application/x-msdownload'),
    });
    assert.equal(exe.statut, 400);
    const gros = Buffer.concat([PDF, Buffer.alloc(1024 * 1024 + 10)]);
    const trop = await appel('POST', '/profil/documents', {
      jeton: jetons.patientA.jeton,
      form: formulaireFichier(gros, 'test-gros.pdf', 'application/pdf'),
    });
    assert.equal(trop.statut, 413);
    const aucun = await appel('POST', '/profil/documents', { jeton: jetons.patientA.jeton, form: new FormData() });
    assert.equal(aucun.statut, 400);
  });

  it('télécharge son document à l\'identique', async () => {
    const r = await appel('GET', `/documents/${jetons.docPdf}`, { jeton: jetons.patientA.jeton });
    assert.equal(r.statut, 200);
    assert.ok(Buffer.compare(r.donnees, PDF) === 0);
    assert.equal(r.entetes.get('content-type'), 'application/pdf');
    assert.equal(r.entetes.get('x-content-type-options'), 'nosniff');
  });

  it('un autre patient et un médecin non attribué ne peuvent pas lire ce document (403)', async () => {
    assert.equal((await appel('GET', `/documents/${jetons.docPdf}`, { jeton: jetons.patientB.jeton })).statut, 403);
    assert.equal((await appel('GET', `/documents/${jetons.docPdf}`, { jeton: jetons.medecin2.jeton })).statut, 403);
    assert.equal((await appel('GET', `/documents/${jetons.docPdf}`)).statut, 401);
  });

  it('un autre patient ne peut pas supprimer ce document (403) ; le médecin attribué non plus (lecture seule)', async () => {
    assert.equal((await appel('DELETE', `/documents/${jetons.docPng}`, { jeton: jetons.patientB.jeton })).statut, 403);
    assert.equal((await appel('DELETE', `/documents/${jetons.docPng}`, { jeton: jetons.medecin.jeton })).statut, 403);
  });
});

describe('Médecin : uniquement les patients attribués', () => {
  it('ne voit dans sa liste que ses patients attribués', async () => {
    const r = await appel('GET', '/medecin/patients', { jeton: jetons.medecin.jeton });
    assert.equal(r.statut, 200);
    const ids = r.donnees.patients.map((p) => p.id);
    assert.ok(ids.includes(jetons.patientA.id));
    assert.ok(!ids.includes(jetons.patientB.id));
    const vide = await appel('GET', '/medecin/patients', { jeton: jetons.medecin2.jeton });
    assert.equal(vide.donnees.patients.length, 0);
  });

  it('consulte le dossier et les documents du patient attribué, mais pas ceux d\'un autre patient', async () => {
    const ok = await appel('GET', `/utilisateurs/${jetons.patientA.id}`, { jeton: jetons.medecin.jeton });
    assert.equal(ok.statut, 200);
    assert.equal(ok.donnees.documents.length, 2);
    assert.equal(ok.donnees.medecins, undefined, 'les attributions sont réservées à l\'admin');
    const doc = await appel('GET', `/documents/${jetons.docPdf}`, { jeton: jetons.medecin.jeton });
    assert.equal(doc.statut, 200);
    assert.equal((await appel('GET', `/utilisateurs/${jetons.patientB.id}`, { jeton: jetons.medecin.jeton })).statut, 403);
    assert.equal((await appel('GET', `/utilisateurs/${jetons.patientA.id}`, { jeton: jetons.medecin2.jeton })).statut, 403);
  });

  it('ne peut pas consulter les comptes administrateur/médecin ni utiliser les routes admin', async () => {
    assert.equal((await appel('GET', `/utilisateurs/${jetons.admin.id}`, { jeton: jetons.medecin.jeton })).statut, 403);
    assert.equal((await appel('GET', `/utilisateurs/${jetons.medecin2.id}`, { jeton: jetons.medecin.jeton })).statut, 403);
    assert.equal((await appel('GET', '/admin/utilisateurs', { jeton: jetons.medecin.jeton })).statut, 403);
    assert.equal((await appel('POST', '/admin/attributions', { jeton: jetons.medecin.jeton, json: { patientId: jetons.patientB.id, medecinId: jetons.medecin.id } })).statut, 403);
  });
});

describe('Administrateur', () => {
  it('consulte tous les utilisateurs, tous les documents et les statistiques', async () => {
    const u = await appel('GET', '/admin/utilisateurs', { jeton: jetons.admin.jeton });
    assert.equal(u.statut, 200);
    const roles = new Set(u.donnees.utilisateurs.map((x) => x.role));
    assert.deepEqual([...roles].sort(), ['ADMIN', 'MEDECIN', 'PATIENT']);
    assert.ok(u.donnees.utilisateurs.every((x) => x.motDePasseHash === undefined));
    const filtre = await appel('GET', '/admin/utilisateurs?role=MEDECIN', { jeton: jetons.admin.jeton });
    assert.ok(filtre.donnees.utilisateurs.every((x) => x.role === 'MEDECIN'));
    const docs = await appel('GET', '/admin/documents', { jeton: jetons.admin.jeton });
    assert.ok(docs.donnees.documents.some((d) => d.id === jetons.docPdf));
    const stats = await appel('GET', '/admin/statistiques', { jeton: jetons.admin.jeton });
    assert.ok(stats.donnees.patients >= 2 && stats.donnees.documents >= 2);
    const fiche = await appel('GET', `/utilisateurs/${jetons.patientA.id}`, { jeton: jetons.admin.jeton });
    assert.equal(fiche.statut, 200);
    assert.equal(fiche.donnees.utilisateur.carteIdentite, 'DEMO-123456789');
    assert.ok(Array.isArray(fiche.donnees.medecins) && fiche.donnees.medecins.length === 1);
    assert.equal((await appel('GET', `/documents/${jetons.docPdf}`, { jeton: jetons.admin.jeton })).statut, 200);
  });

  it('attribue puis retire un patient à un médecin : l\'accès du médecin suit immédiatement', async () => {
    assert.equal((await appel('GET', `/utilisateurs/${jetons.patientB.id}`, { jeton: jetons.medecin.jeton })).statut, 403);
    const att = await appel('POST', '/admin/attributions', {
      jeton: jetons.admin.jeton,
      json: { patientId: jetons.patientB.id, medecinId: jetons.medecin.id },
    });
    assert.equal(att.statut, 201);
    assert.equal((await appel('GET', `/utilisateurs/${jetons.patientB.id}`, { jeton: jetons.medecin.jeton })).statut, 200);
    const doublon = await appel('POST', '/admin/attributions', {
      jeton: jetons.admin.jeton,
      json: { patientId: jetons.patientB.id, medecinId: jetons.medecin.id },
    });
    assert.equal(doublon.statut, 409);
    const retrait = await appel('DELETE', `/admin/attributions/${att.donnees.attribution.id}`, { jeton: jetons.admin.jeton });
    assert.equal(retrait.statut, 200);
    assert.equal((await appel('GET', `/utilisateurs/${jetons.patientB.id}`, { jeton: jetons.medecin.jeton })).statut, 403);
  });

  it('refuse une attribution avec de mauvais profils', async () => {
    const inverse = await appel('POST', '/admin/attributions', {
      jeton: jetons.admin.jeton,
      json: { patientId: jetons.medecin.id, medecinId: jetons.patientA.id },
    });
    assert.equal(inverse.statut, 400);
  });

  it('supprime un document de n\'importe quel utilisateur', async () => {
    assert.equal((await appel('DELETE', `/documents/${jetons.docPng}`, { jeton: jetons.admin.jeton })).statut, 200);
    assert.equal((await appel('GET', `/documents/${jetons.docPng}`, { jeton: jetons.admin.jeton })).statut, 404);
  });

  it('le propriétaire peut supprimer son propre document', async () => {
    assert.equal((await appel('DELETE', `/documents/${jetons.docPdf}`, { jeton: jetons.patientA.jeton })).statut, 200);
  });

  it('supprime un utilisateur : ses documents et attributions disparaissent (cascade)', async () => {
    const email = `test-cascade-${suffixe}@exemple.fr`;
    const ins = await appel('POST', '/auth/inscription', { json: { email, motDePasse: MDP, nom: 'Cas', prenom: 'Cade' } });
    const id = ins.donnees.utilisateur.id;
    await appel('POST', '/profil/documents', {
      jeton: ins.donnees.jeton,
      form: formulaireFichier(PDF, 'test-cascade.pdf', 'application/pdf'),
    });
    await appel('POST', '/admin/attributions', { jeton: jetons.admin.jeton, json: { patientId: id, medecinId: jetons.medecin.id } });
    assert.equal(await prisma.document.count({ where: { proprietaireId: id } }), 1);
    assert.equal(await prisma.attribution.count({ where: { patientId: id } }), 1);

    assert.equal((await appel('DELETE', `/admin/utilisateurs/${id}`, { jeton: jetons.admin.jeton })).statut, 200);
    assert.equal(await prisma.document.count({ where: { proprietaireId: id } }), 0);
    assert.equal(await prisma.attribution.count({ where: { patientId: id } }), 0);
    assert.equal(await prisma.utilisateur.count({ where: { id } }), 0);
  });

  it('ne peut pas supprimer son propre compte', async () => {
    const r = await appel('DELETE', `/admin/utilisateurs/${jetons.admin.id}`, { jeton: jetons.admin.jeton });
    assert.equal(r.statut, 400);
  });

  it('crée un compte de n\'importe quel profil (médecin, admin) avec validation des champs', async () => {
    const invalide = await appel('POST', '/admin/utilisateurs', {
      jeton: jetons.admin.jeton,
      json: { email: 'pas-un-email', motDePasse: MDP, role: 'MEDECIN', nom: 'A', prenom: 'B' },
    });
    assert.equal(invalide.statut, 400);
    const roleInconnu = await appel('POST', '/admin/utilisateurs', {
      jeton: jetons.admin.jeton,
      json: { email: `test-role-${suffixe}@exemple.fr`, motDePasse: MDP, role: 'SUPERUSER', nom: 'A', prenom: 'B' },
    });
    assert.equal(roleInconnu.statut, 400);
  });
});
