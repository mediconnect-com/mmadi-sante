// Tests d'intégration de la V3 : commentaires et pathologies, documents déposés par un médecin,
// liste « Mes patients » enrichie, détail d'un rendez-vous, statistiques administrateur.
// Même principe que les autres fichiers : vraie base PostgreSQL (DATABASE_URL), comptes « test-… » créés puis supprimés.
//   Lancer :  npm test
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-0123456789-0123456789-0123456789';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'cle-de-chiffrement-de-test-123456';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.MAX_FILE_MB = '1';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { semer, MOT_DE_PASSE_DEMO } = require('../prisma/seed');

const MDP = MOT_DE_PASSE_DEMO;
const suffixe = Date.now().toString(36);
let serveur;
let base;
const J = {};
const idsUtilisateurs = [];

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

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
  const donnees = (res.headers.get('content-type') || '').includes('application/json') ? await res.json() : null;
  return { statut: res.status, donnees };
}

async function connecter(email, motDePasse = MDP) {
  const r = await appel('POST', '/auth/connexion', { json: { email, motDePasse } });
  assert.equal(r.statut, 200, `connexion ${email} : ${JSON.stringify(r.donnees)}`);
  return { jeton: r.donnees.jeton, id: r.donnees.utilisateur.id };
}

function formulaire(nom = 'compte-rendu.pdf', categorie = 'COMPTE_RENDU') {
  const form = new FormData();
  form.append('fichiers', new Blob([PDF], { type: 'application/pdf' }), nom);
  form.append('categorie', categorie);
  return form;
}

async function creerPatient(nom) {
  const email = `test-${nom}-${suffixe}@exemple.fr`;
  const r = await appel('POST', '/auth/inscription', { json: { email, motDePasse: MDP, nom, prenom: 'Test' } });
  assert.equal(r.statut, 201);
  idsUtilisateurs.push(r.donnees.utilisateur.id);
  return { jeton: r.donnees.jeton, id: r.donnees.utilisateur.id, email };
}

async function creerMedecin(nom) {
  const cardio = (await prisma.specialite.findUnique({ where: { libelle: 'Cardiologie' } })).id;
  const email = `test-${nom}-${suffixe}@exemple.fr`;
  const r = await appel('POST', '/admin/utilisateurs', {
    jeton: J.admin.jeton,
    json: { email, motDePasse: MDP, role: 'MEDECIN', nom, prenom: 'Docteur', specialiteIds: [cardio] },
  });
  assert.equal(r.statut, 201, JSON.stringify(r.donnees));
  idsUtilisateurs.push(r.donnees.utilisateur.id);
  return { ...(await connecter(email)), email };
}

const attribuer = (patientId, medecinId) => appel('POST', '/admin/attributions', { jeton: J.admin.jeton, json: { patientId, medecinId } });

before(async () => {
  await semer();
  await new Promise((ok) => {
    serveur = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${serveur.address().port}/api/v1`;
  J.admin = await connecter('admin@mmadisante.demo');
  J.medecinDemo = await connecter('medecin@mmadisante.demo'); // suit Amina (patient@) mais pas Paul (patient2@)
  J.amina = await connecter('patient@mmadisante.demo');
  J.paul = await connecter('patient2@mmadisante.demo');
  J.confrere = await creerMedecin('Confrere');
  J.patientV3 = await creerPatient('patientv3');
  assert.equal((await attribuer(J.patientV3.id, J.medecinDemo.id)).statut, 201);
  assert.equal((await attribuer(J.patientV3.id, J.confrere.id)).statut, 201);
});

after(async () => {
  await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  await prisma.$disconnect();
  await new Promise((ok) => serveur.close(ok));
});

describe('V3 — le médecin dépose des documents dans la fiche de SES patients', () => {
  it('un médecin dépose un document dans la fiche d\'un patient qui lui est attribué ; il est marqué comme déposé par lui', async () => {
    const r = await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.medecinDemo.jeton, form: formulaire('resultat.pdf', 'ANALYSE') });
    assert.equal(r.statut, 201, JSON.stringify(r.donnees));
    const doc = r.donnees.documents[0];
    assert.equal(doc.proprietaireId, J.patientV3.id);
    assert.equal(doc.deposeParMedecinId, J.medecinDemo.id);
    assert.match(doc.deposeParNom, /Claire Martin/);
    J.docMedecin = doc;
  });

  it('le patient voit ce document dans « Mon dossier », avec le nom du médecin qui l\'a déposé', async () => {
    const r = await appel('GET', '/profil/documents', { jeton: J.patientV3.jeton });
    assert.equal(r.statut, 200);
    const d = r.donnees.documents.find((x) => x.id === J.docMedecin.id);
    assert.ok(d);
    assert.match(d.deposeParNom, /Claire Martin/);
  });

  it('un document déposé par le patient lui-même n\'est pas marqué comme déposé par un médecin', async () => {
    const r = await appel('POST', '/profil/documents', { jeton: J.patientV3.jeton, form: formulaire('perso.pdf') });
    assert.equal(r.statut, 201);
    assert.equal(r.donnees.documents[0].deposeParMedecinId, null);
    assert.equal(r.donnees.documents[0].deposeParNom, null);
    J.docPatient = r.donnees.documents[0];
  });

  it('refus (403) : médecin non attribué, patient, administrateur', async () => {
    const autre = await creerMedecin('Etranger');
    assert.equal((await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: autre.jeton, form: formulaire() })).statut, 403);
    assert.equal((await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.patientV3.jeton, form: formulaire() })).statut, 403);
    assert.equal((await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.admin.jeton, form: formulaire() })).statut, 403);
    assert.equal((await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { form: formulaire() })).statut, 401);
    // Paul n'est pas attribué au médecin démo
    assert.equal((await appel('POST', `/utilisateurs/${J.paul.id}/documents`, { jeton: J.medecinDemo.jeton, form: formulaire() })).statut, 403);
  });

  it('mêmes contrôles de fichier que pour le patient (faux PDF refusé)', async () => {
    const form = new FormData();
    form.append('fichiers', new Blob([Buffer.from('pas un pdf')], { type: 'application/pdf' }), 'faux.pdf');
    const r = await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.medecinDemo.jeton, form });
    assert.equal(r.statut, 400);
  });

  it('l\'autre médecin du patient peut lire le document (accès v2 conservé)', async () => {
    const res = await fetch(`${base}/documents/${J.docMedecin.id}`, { headers: { Authorization: `Bearer ${J.confrere.jeton}` } });
    assert.equal(res.status, 200);
  });

  it('suppression : le patient ne peut pas supprimer un document déposé par un médecin ; un confrère non plus', async () => {
    assert.equal((await appel('DELETE', `/documents/${J.docMedecin.id}`, { jeton: J.patientV3.jeton })).statut, 403);
    assert.equal((await appel('DELETE', `/documents/${J.docMedecin.id}`, { jeton: J.confrere.jeton })).statut, 403);
  });

  it('suppression : le patient supprime SES documents ; le médecin dépositaire supprime le sien', async () => {
    assert.equal((await appel('DELETE', `/documents/${J.docPatient.id}`, { jeton: J.patientV3.jeton })).statut, 200);
    assert.equal((await appel('DELETE', `/documents/${J.docMedecin.id}`, { jeton: J.medecinDemo.jeton })).statut, 200);
  });

  it('l\'administrateur peut supprimer un document déposé par un médecin', async () => {
    const r = await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.medecinDemo.jeton, form: formulaire('a-supprimer.pdf') });
    assert.equal((await appel('DELETE', `/documents/${r.donnees.documents[0].id}`, { jeton: J.admin.jeton })).statut, 200);
  });

  it('si la fiche du médecin est supprimée, le document reste, avec son nom, et n\'est supprimable que par l\'administrateur', async () => {
    const eph = await creerMedecin('Ephemere');
    assert.equal((await attribuer(J.patientV3.id, eph.id)).statut, 201);
    const r = await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: eph.jeton, form: formulaire('orphelin.pdf') });
    const id = r.donnees.documents[0].id;
    assert.equal((await appel('DELETE', `/admin/utilisateurs/${eph.id}`, { jeton: J.admin.jeton })).statut, 200);
    const liste = await appel('GET', '/profil/documents', { jeton: J.patientV3.jeton });
    const d = liste.donnees.documents.find((x) => x.id === id);
    assert.ok(d, 'le document est conservé');
    assert.equal(d.deposeParMedecinId, null);
    assert.match(d.deposeParNom, /Ephemere/);
    assert.equal((await appel('DELETE', `/documents/${id}`, { jeton: J.patientV3.jeton })).statut, 403);
    assert.equal((await appel('DELETE', `/documents/${id}`, { jeton: J.admin.jeton })).statut, 200);
  });
});

describe('V3 — commentaires et pathologies rédigés par un médecin', () => {
  it('un médecin crée un commentaire sur un patient qui lui est attribué', async () => {
    const r = await appel('POST', '/commentaires', {
      jeton: J.medecinDemo.jeton,
      json: { patientId: J.patientV3.id, pathologies: 'Hypertension artérielle', commentaire: 'Tension à surveiller chaque semaine.' },
    });
    assert.equal(r.statut, 201, JSON.stringify(r.donnees));
    assert.equal(r.donnees.commentaire.pathologies, 'Hypertension artérielle');
    assert.match(r.donnees.commentaire.medecinNom, /Claire Martin/);
    J.commentaire = r.donnees.commentaire;
  });

  it('validation : au moins un champ, textes limités', async () => {
    const vide = await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { patientId: J.patientV3.id, pathologies: '  ', commentaire: '' } });
    assert.equal(vide.statut, 400);
    assert.match(vide.donnees.erreur, /au moins/);
    const long = await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { patientId: J.patientV3.id, commentaire: 'x'.repeat(3001) } });
    assert.equal(long.statut, 400);
    assert.equal((await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { patientId: 'pas-un-uuid', commentaire: 'x' } })).statut, 400);
  });

  it('refus (403) : médecin non attribué ; patient ; administrateur ; sans jeton (401)', async () => {
    assert.equal((await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { patientId: J.paul.id, commentaire: 'x' } })).statut, 403);
    assert.equal((await appel('POST', '/commentaires', { jeton: J.patientV3.jeton, json: { patientId: J.patientV3.id, commentaire: 'x' } })).statut, 403);
    assert.equal((await appel('POST', '/commentaires', { jeton: J.admin.jeton, json: { patientId: J.patientV3.id, commentaire: 'x' } })).statut, 403);
    assert.equal((await appel('POST', '/commentaires', { json: { patientId: J.patientV3.id, commentaire: 'x' } })).statut, 401);
  });

  it('le patient lit ses commentaires (« Mon dossier »), sans pouvoir les modifier', async () => {
    const r = await appel('GET', '/profil/commentaires', { jeton: J.patientV3.jeton });
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.commentaires.length, 1);
    assert.equal((await appel('PUT', `/commentaires/${J.commentaire.id}`, { jeton: J.patientV3.jeton, json: { commentaire: 'Je modifie' } })).statut, 403);
    assert.equal((await appel('DELETE', `/commentaires/${J.commentaire.id}`, { jeton: J.patientV3.jeton })).statut, 403);
  });

  it('un autre patient ne voit pas les commentaires de ce patient ; seul un patient peut appeler cette route', async () => {
    const r = await appel('GET', '/profil/commentaires', { jeton: J.paul.jeton });
    assert.equal(r.donnees.commentaires.length, 0);
    assert.equal((await appel('GET', '/profil/commentaires', { jeton: J.medecinDemo.jeton })).statut, 403);
  });

  it('l\'auteur voit ses commentaires dans la fiche du patient ; un confrère ne les voit pas ; l\'administrateur voit tout', async () => {
    const auteur = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.medecinDemo.jeton });
    assert.equal(auteur.donnees.commentaires.length, 1);
    const confrere = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.confrere.jeton });
    assert.equal(confrere.statut, 200, 'l\'accès à la fiche reste celui de la v2');
    assert.equal(confrere.donnees.commentaires.length, 0, 'mais pas aux commentaires d\'un confrère');
    const admin = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.admin.jeton });
    assert.equal(admin.donnees.commentaires.length, 1);
  });

  it('le confrère rédige son propre commentaire ; le patient voit les deux, chacun avec son auteur', async () => {
    const r = await appel('POST', '/commentaires', { jeton: J.confrere.jeton, json: { patientId: J.patientV3.id, pathologies: 'Arythmie', commentaire: 'Holter prescrit.' } });
    assert.equal(r.statut, 201);
    const vu = await appel('GET', '/profil/commentaires', { jeton: J.patientV3.jeton });
    assert.equal(vu.donnees.commentaires.length, 2);
    assert.deepEqual(vu.donnees.commentaires.map((c) => c.medecinNom).sort().length, 2);
    const admin = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.admin.jeton });
    assert.equal(admin.donnees.commentaires.length, 2);
  });

  it('seul l\'auteur modifie ou supprime son commentaire', async () => {
    assert.equal((await appel('PUT', `/commentaires/${J.commentaire.id}`, { jeton: J.confrere.jeton, json: { commentaire: 'piraté' } })).statut, 403);
    assert.equal((await appel('DELETE', `/commentaires/${J.commentaire.id}`, { jeton: J.confrere.jeton })).statut, 403);
    const maj = await appel('PUT', `/commentaires/${J.commentaire.id}`, { jeton: J.medecinDemo.jeton, json: { pathologies: 'Hypertension artérielle', commentaire: 'Tension stabilisée.' } });
    assert.equal(maj.statut, 200);
    assert.equal(maj.donnees.commentaire.commentaire, 'Tension stabilisée.');
    assert.equal((await appel('PUT', `/commentaires/${J.commentaire.id}`, { jeton: J.medecinDemo.jeton, json: {} })).statut, 400);
    assert.equal((await appel('PUT', '/commentaires/00000000-0000-4000-8000-000000000000', { jeton: J.medecinDemo.jeton, json: { commentaire: 'x' } })).statut, 404);
  });

  it('si l\'attribution est retirée, le médecin ne peut plus commenter ce patient', async () => {
    const autre = await creerPatient('retire');
    const a = await attribuer(autre.id, J.medecinDemo.id);
    assert.equal((await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { patientId: autre.id, commentaire: 'ok' } })).statut, 201);
    await appel('DELETE', `/admin/attributions/${a.donnees.attribution.id}`, { jeton: J.admin.jeton });
    assert.equal((await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { patientId: autre.id, commentaire: 'refus' } })).statut, 403);
  });

  it('le commentaire est conservé avec le nom du médecin si sa fiche est supprimée', async () => {
    const eph = await creerMedecin('Disparu');
    await attribuer(J.patientV3.id, eph.id);
    await appel('POST', '/commentaires', { jeton: eph.jeton, json: { patientId: J.patientV3.id, commentaire: 'Note du médecin supprimé' } });
    await appel('DELETE', `/admin/utilisateurs/${eph.id}`, { jeton: J.admin.jeton });
    const vu = await appel('GET', '/profil/commentaires', { jeton: J.patientV3.jeton });
    const c = vu.donnees.commentaires.find((x) => x.commentaire === 'Note du médecin supprimé');
    assert.ok(c);
    assert.equal(c.medecinId, null);
    assert.match(c.medecinNom, /Disparu/);
  });

  it('l\'auteur supprime son commentaire', async () => {
    assert.equal((await appel('DELETE', `/commentaires/${J.commentaire.id}`, { jeton: J.medecinDemo.jeton })).statut, 200);
  });
});

describe('V3 — « Mes patients » : liste enrichie pour retrouver vite une fiche', () => {
  it('chaque patient indique documents, documents récents, dernier dépôt, prochain rendez-vous et commentaires', async () => {
    const cardio = (await prisma.specialite.findUnique({ where: { libelle: 'Cardiologie' } })).id;
    assert.ok(cardio);
    await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.medecinDemo.jeton, form: formulaire('liste.pdf') });
    await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { patientId: J.patientV3.id, commentaire: 'Pour la liste' } });
    const quand = new Date(Date.now() + 5 * 86400000);
    quand.setUTCHours(10, 7, 0, 0);
    const rdv = await appel('POST', '/rendez-vous', { jeton: J.patientV3.jeton, json: { medecinId: J.medecinDemo.id, dateHeure: quand.toISOString(), motif: 'Suivi' } });
    assert.equal(rdv.statut, 201, JSON.stringify(rdv.donnees));

    const r = await appel('GET', '/medecin/patients', { jeton: J.medecinDemo.jeton });
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.joursRecent, 30);
    const p = r.donnees.patients.find((x) => x.id === J.patientV3.id);
    assert.ok(p);
    assert.ok(p.nombreDocuments >= 1);
    assert.ok(p.nombreDocumentsRecents >= 1);
    assert.ok(p.dernierDocumentLe);
    assert.equal(p.prochainRendezVous.id, rdv.donnees.rendezVous.id);
    assert.equal(p.prochainRendezVous.statut, 'DEMANDE');
    assert.equal(p.nombreCommentaires, 1);
    assert.equal(r.donnees.patients.some((x) => x.id === J.paul.id), false, 'Paul n\'est pas un patient du médecin démo');
  });

  it('un document ancien (plus de 30 jours) compte dans le total mais pas dans les récents', async () => {
    const doc = await prisma.document.findFirst({ where: { proprietaireId: J.patientV3.id } });
    await prisma.document.update({ where: { id: doc.id }, data: { creeLe: new Date(Date.now() - 90 * 86400000) } });
    const r = await appel('GET', '/medecin/patients', { jeton: J.medecinDemo.jeton });
    const p = r.donnees.patients.find((x) => x.id === J.patientV3.id);
    assert.ok(p.nombreDocuments > p.nombreDocumentsRecents);
  });

  it('un confrère ne voit que ses propres patients et ses propres commentaires dans la liste', async () => {
    const r = await appel('GET', '/medecin/patients', { jeton: J.confrere.jeton });
    const p = r.donnees.patients.find((x) => x.id === J.patientV3.id);
    assert.ok(p);
    assert.equal(p.nombreCommentaires, 1, 'seulement le sien (Arythmie)');
    assert.equal(p.prochainRendezVous, null, 'le rendez-vous est chez l\'autre médecin');
  });

  it('réservé aux médecins', async () => {
    assert.equal((await appel('GET', '/medecin/patients', { jeton: J.patientV3.jeton })).statut, 403);
    assert.equal((await appel('GET', '/medecin/patients', { jeton: J.admin.jeton })).statut, 403);
  });
});

describe('V3 — détail d\'un rendez-vous et statistiques administrateur', () => {
  it('l\'administrateur ouvre n\'importe quel rendez-vous ; patient et médecin concernés aussi', async () => {
    const liste = await appel('GET', '/rendez-vous', { jeton: J.admin.jeton });
    const rdv = liste.donnees.rendezVous.find((r) => r.patient.id === J.patientV3.id);
    assert.ok(rdv);
    const admin = await appel('GET', `/rendez-vous/${rdv.id}`, { jeton: J.admin.jeton });
    assert.equal(admin.statut, 200);
    assert.equal(admin.donnees.rendezVous.patient.id, J.patientV3.id);
    assert.equal(admin.donnees.rendezVous.patient.email, J.patientV3.email);
    assert.equal(admin.donnees.rendezVous.dossierAccessible, true);
    assert.equal(admin.donnees.rendezVous.medecin.id, J.medecinDemo.id);
    const medecin = await appel('GET', `/rendez-vous/${rdv.id}`, { jeton: J.medecinDemo.jeton });
    assert.equal(medecin.statut, 200);
    assert.equal(medecin.donnees.rendezVous.dossierAccessible, true);
    const patient = await appel('GET', `/rendez-vous/${rdv.id}`, { jeton: J.patientV3.jeton });
    assert.equal(patient.statut, 200);
    assert.equal(patient.donnees.rendezVous.patient, undefined, 'le patient n\'a pas besoin de ses propres coordonnées ici');
    J.rdv = rdv;
  });

  it('refus (403) : un autre patient, un médecin non concerné ; 401 sans jeton ; 404 / 400 sur identifiant inconnu / invalide', async () => {
    assert.equal((await appel('GET', `/rendez-vous/${J.rdv.id}`, { jeton: J.paul.jeton })).statut, 403);
    assert.equal((await appel('GET', `/rendez-vous/${J.rdv.id}`, { jeton: J.confrere.jeton })).statut, 403);
    assert.equal((await appel('GET', `/rendez-vous/${J.rdv.id}`)).statut, 401);
    assert.equal((await appel('GET', '/rendez-vous/00000000-0000-4000-8000-000000000000', { jeton: J.admin.jeton })).statut, 404);
    assert.equal((await appel('GET', '/rendez-vous/nimporte-quoi', { jeton: J.admin.jeton })).statut, 400);
  });

  it('les statistiques administrateur comptent aussi les rendez-vous', async () => {
    const r = await appel('GET', '/admin/statistiques', { jeton: J.admin.jeton });
    assert.equal(r.statut, 200);
    assert.ok(r.donnees.rendezVous >= 1);
    assert.equal((await appel('GET', '/admin/statistiques', { jeton: J.medecinDemo.jeton })).statut, 403);
  });

  it('la suppression d\'un patient supprime aussi ses commentaires et documents (cascade)', async () => {
    const p = await creerPatient('cascade');
    await attribuer(p.id, J.medecinDemo.id);
    await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { patientId: p.id, commentaire: 'x' } });
    await appel('POST', `/utilisateurs/${p.id}/documents`, { jeton: J.medecinDemo.jeton, form: formulaire() });
    assert.equal((await appel('DELETE', `/admin/utilisateurs/${p.id}`, { jeton: J.admin.jeton })).statut, 200);
    assert.equal(await prisma.commentairePatient.count({ where: { patientId: p.id } }), 0);
    assert.equal(await prisma.document.count({ where: { proprietaireId: p.id } }), 0);
  });
});
