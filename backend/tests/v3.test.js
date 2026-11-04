// Tests d'intégration de la V3 : documents déposés par un médecin (qu'il ne peut jamais relire), commentaires et
// pathologies liés à un rendez-vous, liste « Mes patients » enrichie, détail d'un rendez-vous, statistiques administrateur.
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

/** Rendez-vous confirmé et DÉJÀ PASSÉ entre un patient et un médecin (le serveur refuse de créer un rendez-vous dans le passé :
 *  on le crée à venir, le médecin le confirme, puis on recule sa date directement en base). */
let compteurRdv = 0;
async function rdvPasse(patient, medecin, { statut = 'CONFIRME', passe = true } = {}) {
  compteurRdv += 1;
  const quand = new Date(Date.now() + (40 + compteurRdv) * 86400000);
  quand.setUTCHours(8, compteurRdv, 0, 0);
  const r = await appel('POST', '/rendez-vous', { jeton: patient.jeton, json: { medecinId: medecin.id, dateHeure: quand.toISOString(), motif: `Test V3 ${compteurRdv}` } });
  assert.equal(r.statut, 201, JSON.stringify(r.donnees));
  const id = r.donnees.rendezVous.id;
  if (statut !== 'DEMANDE') assert.equal((await appel('PATCH', `/rendez-vous/${id}/statut`, { jeton: medecin.jeton, json: { statut } })).statut, 200);
  if (passe) await prisma.rendezVous.update({ where: { id }, data: { dateHeure: new Date(Date.now() - compteurRdv * 3600000) } });
  return id;
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

describe('V3 — le médecin dépose des documents dans la fiche de SES patients, sans pouvoir les relire', () => {
  it('un médecin dépose un document dans la fiche d\'un patient qui lui est attribué ; il est marqué comme déposé par lui', async () => {
    const r = await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.medecinDemo.jeton, form: formulaire('resultat.pdf', 'ANALYSE') });
    assert.equal(r.statut, 201, JSON.stringify(r.donnees));
    const doc = r.donnees.documents[0];
    assert.equal(doc.proprietaireId, J.patientV3.id);
    assert.equal(doc.deposeParMedecinId, J.medecinDemo.id);
    assert.match(doc.deposeParNom, /Claire Martin/);
    J.docMedecin = doc;
  });

  it('le patient voit ce document dans « Mon dossier », avec le nom du médecin qui l\'a déposé, et peut l\'ouvrir', async () => {
    const r = await appel('GET', '/profil/documents', { jeton: J.patientV3.jeton });
    assert.equal(r.statut, 200);
    const d = r.donnees.documents.find((x) => x.id === J.docMedecin.id);
    assert.ok(d);
    assert.match(d.deposeParNom, /Claire Martin/);
    const res = await fetch(`${base}/documents/${J.docMedecin.id}`, { headers: { Authorization: `Bearer ${J.patientV3.jeton}` } });
    assert.equal(res.status, 200);
  });

  it('un document déposé par le patient lui-même n\'est pas marqué comme déposé par un médecin', async () => {
    const r = await appel('POST', '/profil/documents', { jeton: J.patientV3.jeton, form: formulaire('perso.pdf') });
    assert.equal(r.statut, 201);
    assert.equal(r.donnees.documents[0].deposeParMedecinId, null);
    assert.equal(r.donnees.documents[0].deposeParNom, null);
    J.docPatient = r.donnees.documents[0];
  });

  it('refus (403) du dépôt : médecin non attribué, patient, administrateur ; 401 sans jeton', async () => {
    const autre = await creerMedecin('Etranger');
    assert.equal((await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: autre.jeton, form: formulaire() })).statut, 403);
    assert.equal((await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.patientV3.jeton, form: formulaire() })).statut, 403);
    assert.equal((await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.admin.jeton, form: formulaire() })).statut, 403);
    assert.equal((await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { form: formulaire() })).statut, 401);
    assert.equal((await appel('POST', `/utilisateurs/${J.paul.id}/documents`, { jeton: J.medecinDemo.jeton, form: formulaire() })).statut, 403);
  });

  it('mêmes contrôles de fichier que pour le patient (faux PDF refusé)', async () => {
    const form = new FormData();
    form.append('fichiers', new Blob([Buffer.from('pas un pdf')], { type: 'application/pdf' }), 'faux.pdf');
    assert.equal((await appel('POST', `/utilisateurs/${J.patientV3.id}/documents`, { jeton: J.medecinDemo.jeton, form })).statut, 400);
  });

  it('AUCUN médecin ne peut ouvrir un document du patient : ni celui du patient, ni celui qu\'il a lui-même déposé, ni celui d\'un confrère', async () => {
    for (const [medecin, doc] of [
      [J.medecinDemo, J.docPatient], // document déposé par le patient
      [J.medecinDemo, J.docMedecin], // document déposé par ce même médecin
      [J.confrere, J.docPatient],
      [J.confrere, J.docMedecin], // document déposé par un confrère
    ]) {
      const res = await fetch(`${base}/documents/${doc.id}`, { headers: { Authorization: `Bearer ${medecin.jeton}` } });
      assert.equal(res.status, 403, `${medecin.email || 'médecin'} → ${doc.nomFichier}`);
    }
  });

  it('la fiche du patient ne renvoie aucun document au médecin ; seulement l\'accusé de SES dépôts (nom, type, date)', async () => {
    const r = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.medecinDemo.jeton });
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.documents, undefined);
    assert.equal(r.donnees.documentsTransmis.length, 1);
    assert.equal(r.donnees.documentsTransmis[0].id, J.docMedecin.id);
    assert.equal(r.donnees.documentsTransmis[0].contenu, undefined);
    const confrere = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.confrere.jeton });
    assert.deepEqual(confrere.donnees.documentsTransmis, [], 'le confrère n\'a rien déposé : aucun accusé, et le document du patient reste invisible');
    assert.equal(confrere.donnees.documents, undefined);
  });

  it('« Mes patients » et les autres listes ne laissent rien deviner des documents du patient', async () => {
    const r = await appel('GET', '/medecin/patients', { jeton: J.medecinDemo.jeton });
    const p = r.donnees.patients.find((x) => x.id === J.patientV3.id);
    assert.ok(p);
    for (const champ of ['nombreDocuments', 'nombreDocumentsRecents', 'dernierDocumentLe']) assert.equal(p[champ], undefined, champ);
  });

  it('l\'administrateur voit les documents du patient (liste et contenu) ; le patient aussi', async () => {
    const fiche = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.admin.jeton });
    assert.ok(fiche.donnees.documents.some((d) => d.id === J.docPatient.id));
    const res = await fetch(`${base}/documents/${J.docPatient.id}`, { headers: { Authorization: `Bearer ${J.admin.jeton}` } });
    assert.equal(res.status, 200);
  });

  it('suppression : le patient ne supprime pas un document déposé par un médecin ; un confrère non plus', async () => {
    assert.equal((await appel('DELETE', `/documents/${J.docMedecin.id}`, { jeton: J.patientV3.jeton })).statut, 403);
    assert.equal((await appel('DELETE', `/documents/${J.docMedecin.id}`, { jeton: J.confrere.jeton })).statut, 403);
  });

  it('suppression : le patient supprime SES documents ; le médecin dépositaire retire le sien (sans l\'avoir relu)', async () => {
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

describe('V3 — un commentaire se rédige À PROPOS D\'UN RENDEZ-VOUS entre le patient et son médecin', () => {
  it('le médecin commente un rendez-vous confirmé et passé qui le concerne', async () => {
    J.rdv1 = await rdvPasse(J.patientV3, J.medecinDemo);
    const r = await appel('POST', '/commentaires', {
      jeton: J.medecinDemo.jeton,
      json: { rendezVousId: J.rdv1, pathologies: 'Hypertension artérielle', commentaire: 'Tension à surveiller chaque semaine.' },
    });
    assert.equal(r.statut, 201, JSON.stringify(r.donnees));
    assert.equal(r.donnees.commentaire.rendezVousId, J.rdv1);
    assert.ok(r.donnees.commentaire.rendezVousDateHeure);
    assert.equal(r.donnees.commentaire.patientId, J.patientV3.id, 'le patient est celui du rendez-vous, pas une valeur envoyée');
    assert.match(r.donnees.commentaire.medecinNom, /Claire Martin/);
    J.commentaire = r.donnees.commentaire;
  });

  it('refus : sans rendez-vous (400), rendez-vous d\'un autre médecin ou inconnu (403), un seul commentaire par rendez-vous (409)', async () => {
    const sans = await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { patientId: J.patientV3.id, commentaire: 'sans rendez-vous' } });
    assert.equal(sans.statut, 400);
    assert.match(sans.donnees.erreur, /rendez-vous/i);
    const chezConfrere = await rdvPasse(J.patientV3, J.confrere);
    assert.equal((await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: chezConfrere, commentaire: 'pas le mien' } })).statut, 403);
    assert.equal((await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: '00000000-0000-4000-8000-000000000000', commentaire: 'x' } })).statut, 403);
    assert.equal((await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: 'pas-un-uuid', commentaire: 'x' } })).statut, 400);
    const doublon = await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: J.rdv1, commentaire: 'second' } });
    assert.equal(doublon.statut, 409);
  });

  it('refus : rendez-vous en attente, refusé, annulé ou pas encore commencé (409)', async () => {
    const attente = await rdvPasse(J.patientV3, J.medecinDemo, { statut: 'DEMANDE', passe: false });
    const futur = await rdvPasse(J.patientV3, J.medecinDemo, { passe: false });
    const annule = await rdvPasse(J.patientV3, J.medecinDemo);
    await appel('PATCH', `/rendez-vous/${annule}/statut`, { jeton: J.medecinDemo.jeton, json: { statut: 'ANNULE' } });
    const refuse = await rdvPasse(J.patientV3, J.medecinDemo, { statut: 'DEMANDE' });
    await appel('PATCH', `/rendez-vous/${refuse}/statut`, { jeton: J.medecinDemo.jeton, json: { statut: 'REFUSE' } });
    for (const id of [attente, futur, annule, refuse]) {
      const r = await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: id, commentaire: 'trop tôt ou sans objet' } });
      assert.equal(r.statut, 409, id);
    }
  });

  it('validation : au moins un champ renseigné, textes limités', async () => {
    const rdv = await rdvPasse(J.patientV3, J.medecinDemo);
    const vide = await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: rdv, pathologies: '  ', commentaire: '' } });
    assert.equal(vide.statut, 400);
    assert.match(vide.donnees.erreur, /au moins/);
    assert.equal((await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: rdv, commentaire: 'x'.repeat(3001) } })).statut, 400);
  });

  it('refus (403) : patient et administrateur ne rédigent pas de commentaire ; 401 sans jeton', async () => {
    const json = { rendezVousId: J.rdv1, commentaire: 'x' };
    assert.equal((await appel('POST', '/commentaires', { jeton: J.patientV3.jeton, json })).statut, 403);
    assert.equal((await appel('POST', '/commentaires', { jeton: J.admin.jeton, json })).statut, 403);
    assert.equal((await appel('POST', '/commentaires', { json })).statut, 401);
  });

  it('le rendez-vous suffit : le médecin peut commenter même si le patient ne lui a pas donné accès à sa fiche', async () => {
    const seul = await creerPatient('sansattribution');
    const rdv = await rdvPasse(seul, J.medecinDemo);
    assert.equal((await appel('GET', `/utilisateurs/${seul.id}`, { jeton: J.medecinDemo.jeton })).statut, 403, 'pas d\'accès à la fiche');
    const r = await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: rdv, commentaire: 'Consultation de contrôle.' } });
    assert.equal(r.statut, 201);
    const vu = await appel('GET', '/profil/commentaires', { jeton: seul.jeton });
    assert.equal(vu.donnees.commentaires.length, 1);
  });

  it('le patient lit ses commentaires (« Mon dossier »), avec le rendez-vous concerné, sans pouvoir les modifier', async () => {
    const r = await appel('GET', '/profil/commentaires', { jeton: J.patientV3.jeton });
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.commentaires.length, 1);
    assert.equal(r.donnees.commentaires[0].rendezVousId, J.rdv1);
    assert.equal((await appel('PUT', `/commentaires/${J.commentaire.id}`, { jeton: J.patientV3.jeton, json: { commentaire: 'Je modifie' } })).statut, 403);
    assert.equal((await appel('DELETE', `/commentaires/${J.commentaire.id}`, { jeton: J.patientV3.jeton })).statut, 403);
  });

  it('un autre patient ne voit pas ces commentaires ; seul un patient peut appeler cette route', async () => {
    assert.equal((await appel('GET', '/profil/commentaires', { jeton: J.paul.jeton })).donnees.commentaires.length, 0);
    assert.equal((await appel('GET', '/profil/commentaires', { jeton: J.medecinDemo.jeton })).statut, 403);
  });

  it('l\'auteur voit ses commentaires dans la fiche ; un confrère ne les voit pas ; l\'administrateur voit tout', async () => {
    const auteur = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.medecinDemo.jeton });
    assert.equal(auteur.donnees.commentaires.length, 1);
    const confrere = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.confrere.jeton });
    assert.equal(confrere.statut, 200, 'l\'accès à la fiche reste celui de la v2');
    assert.equal(confrere.donnees.commentaires.length, 0);
    const admin = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.admin.jeton });
    assert.equal(admin.donnees.commentaires.length, 1);
  });

  it('la fiche liste les rendez-vous encore commentables (confirmés, passés, sans commentaire), pas celui déjà commenté', async () => {
    const r = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.medecinDemo.jeton });
    const ids = r.donnees.rendezVousCommentables.map((x) => x.id);
    assert.ok(ids.length >= 1, 'les rendez-vous créés plus haut');
    assert.ok(!ids.includes(J.rdv1), 'déjà commenté');
    assert.equal(r.donnees.rendezVousCommentables.every((x) => new Date(x.dateHeure) <= new Date()), true);
    const confrere = await appel('GET', `/utilisateurs/${J.patientV3.id}`, { jeton: J.confrere.jeton });
    assert.ok(confrere.donnees.rendezVousCommentables.length >= 1, 'le confrère a le sien (rendez-vous « chez le confrère »)');
    assert.equal(confrere.donnees.rendezVousCommentables.some((x) => ids.includes(x.id)), false);
  });

  it('le détail d\'un rendez-vous donne le commentaire au patient, au médecin et à l\'administrateur ; propose de commenter au médecin', async () => {
    for (const jeton of [J.patientV3.jeton, J.medecinDemo.jeton, J.admin.jeton]) {
      const r = await appel('GET', `/rendez-vous/${J.rdv1}`, { jeton });
      assert.equal(r.statut, 200);
      assert.equal(r.donnees.rendezVous.commentaire.id, J.commentaire.id);
    }
    const libre = await rdvPasse(J.patientV3, J.medecinDemo);
    const m = await appel('GET', `/rendez-vous/${libre}`, { jeton: J.medecinDemo.jeton });
    assert.equal(m.donnees.rendezVous.commentaire, null);
    assert.equal(m.donnees.rendezVous.peutCommenter, true);
    assert.equal((await appel('GET', `/rendez-vous/${J.rdv1}`, { jeton: J.medecinDemo.jeton })).donnees.rendezVous.peutCommenter, false);
    assert.equal((await appel('GET', `/rendez-vous/${libre}`, { jeton: J.patientV3.jeton })).donnees.rendezVous.peutCommenter, undefined);
  });

  it('seul l\'auteur modifie ou supprime son commentaire', async () => {
    assert.equal((await appel('PUT', `/commentaires/${J.commentaire.id}`, { jeton: J.confrere.jeton, json: { commentaire: 'piraté' } })).statut, 403);
    assert.equal((await appel('DELETE', `/commentaires/${J.commentaire.id}`, { jeton: J.confrere.jeton })).statut, 403);
    const maj = await appel('PUT', `/commentaires/${J.commentaire.id}`, { jeton: J.medecinDemo.jeton, json: { pathologies: 'Hypertension artérielle', commentaire: 'Tension stabilisée.' } });
    assert.equal(maj.statut, 200);
    assert.equal(maj.donnees.commentaire.commentaire, 'Tension stabilisée.');
    assert.equal(maj.donnees.commentaire.rendezVousId, J.rdv1, 'le rendez-vous ne change pas');
    assert.equal((await appel('PUT', `/commentaires/${J.commentaire.id}`, { jeton: J.medecinDemo.jeton, json: {} })).statut, 400);
    assert.equal((await appel('PUT', '/commentaires/00000000-0000-4000-8000-000000000000', { jeton: J.medecinDemo.jeton, json: { commentaire: 'x' } })).statut, 404);
  });

  it('supprimer un commentaire libère le rendez-vous pour un nouveau commentaire', async () => {
    assert.equal((await appel('DELETE', `/commentaires/${J.commentaire.id}`, { jeton: J.medecinDemo.jeton })).statut, 200);
    const r = await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: J.rdv1, commentaire: 'Nouveau commentaire' } });
    assert.equal(r.statut, 201);
    J.commentaire = r.donnees.commentaire;
  });

  it('le commentaire est conservé avec le nom du médecin si sa fiche est supprimée', async () => {
    const eph = await creerMedecin('Disparu');
    const rdv = await rdvPasse(J.patientV3, eph);
    await appel('POST', '/commentaires', { jeton: eph.jeton, json: { rendezVousId: rdv, commentaire: 'Note du médecin supprimé' } });
    await appel('DELETE', `/admin/utilisateurs/${eph.id}`, { jeton: J.admin.jeton });
    const vu = await appel('GET', '/profil/commentaires', { jeton: J.patientV3.jeton });
    const c = vu.donnees.commentaires.find((x) => x.commentaire === 'Note du médecin supprimé');
    assert.ok(c);
    assert.equal(c.medecinId, null);
    assert.match(c.medecinNom, /Disparu/);
  });
});

describe('V3 — « Mes patients » : liste enrichie pour retrouver vite une fiche', () => {
  it('chaque patient indique rendez-vous à venir, dernier rendez-vous, nombre de rendez-vous et commentaires', async () => {
    const quand = new Date(Date.now() + 5 * 86400000);
    quand.setUTCHours(10, 7, 0, 0);
    const rdv = await appel('POST', '/rendez-vous', { jeton: J.patientV3.jeton, json: { medecinId: J.medecinDemo.id, dateHeure: quand.toISOString(), motif: 'Suivi' } });
    assert.equal(rdv.statut, 201, JSON.stringify(rdv.donnees));
    const r = await appel('GET', '/medecin/patients', { jeton: J.medecinDemo.jeton });
    assert.equal(r.statut, 200);
    const p = r.donnees.patients.find((x) => x.id === J.patientV3.id);
    assert.ok(p);
    assert.equal(p.prochainRendezVous.id, rdv.donnees.rendezVous.id);
    assert.equal(p.prochainRendezVous.statut, 'DEMANDE');
    assert.ok(p.dernierRendezVous, 'un rendez-vous confirmé déjà passé');
    assert.ok(p.nombreRendezVous >= 2);
    assert.equal(p.nombreCommentaires, 1);
    assert.equal(r.donnees.patients.some((x) => x.id === J.paul.id), false, 'Paul n\'est pas un patient du médecin démo');
  });

  it('un confrère ne voit que ses propres rendez-vous et commentaires dans la liste', async () => {
    const r = await appel('GET', '/medecin/patients', { jeton: J.confrere.jeton });
    const p = r.donnees.patients.find((x) => x.id === J.patientV3.id);
    assert.ok(p);
    assert.equal(p.nombreCommentaires, 0);
    assert.equal(p.prochainRendezVous, null, 'le rendez-vous à venir est chez l\'autre médecin');
  });

  it('réservé aux médecins', async () => {
    assert.equal((await appel('GET', '/medecin/patients', { jeton: J.patientV3.jeton })).statut, 403);
    assert.equal((await appel('GET', '/medecin/patients', { jeton: J.admin.jeton })).statut, 403);
  });
});

describe('V3 — détail d\'un rendez-vous et statistiques administrateur', () => {
  it('l\'administrateur ouvre n\'importe quel rendez-vous ; patient et médecin concernés aussi', async () => {
    const liste = await appel('GET', '/rendez-vous', { jeton: J.admin.jeton });
    const rdv = liste.donnees.rendezVous.find((r) => r.patient.id === J.patientV3.id && r.medecin.id === J.medecinDemo.id);
    assert.ok(rdv);
    const admin = await appel('GET', `/rendez-vous/${rdv.id}`, { jeton: J.admin.jeton });
    assert.equal(admin.statut, 200);
    assert.equal(admin.donnees.rendezVous.patient.id, J.patientV3.id);
    assert.equal(admin.donnees.rendezVous.patient.email, J.patientV3.email);
    assert.equal(admin.donnees.rendezVous.dossierAccessible, true);
    assert.equal((await appel('GET', `/rendez-vous/${rdv.id}`, { jeton: J.medecinDemo.jeton })).statut, 200);
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
    const rdv = await rdvPasse(p, J.medecinDemo);
    await appel('POST', '/commentaires', { jeton: J.medecinDemo.jeton, json: { rendezVousId: rdv, commentaire: 'x' } });
    await appel('POST', `/utilisateurs/${p.id}/documents`, { jeton: J.medecinDemo.jeton, form: formulaire() });
    assert.equal((await appel('DELETE', `/admin/utilisateurs/${p.id}`, { jeton: J.admin.jeton })).statut, 200);
    assert.equal(await prisma.commentairePatient.count({ where: { patientId: p.id } }), 0);
    assert.equal(await prisma.document.count({ where: { proprietaireId: p.id } }), 0);
  });
});

describe('V3 — réinitialisation du mot de passe par l\'administrateur', () => {
  it('l\'administrateur définit un nouveau mot de passe ; l\'ancien ne marche plus, le nouveau oui', async () => {
    const p = await creerPatient('mdp');
    const r = await appel('PUT', `/admin/utilisateurs/${p.id}/mot-de-passe`, { jeton: J.admin.jeton, json: { nouveauMotDePasse: 'Nouveau2026x' } });
    assert.equal(r.statut, 200);
    assert.equal((await appel('POST', '/auth/connexion', { json: { email: p.email, motDePasse: MDP } })).statut, 401);
    assert.equal((await appel('POST', '/auth/connexion', { json: { email: p.email, motDePasse: 'Nouveau2026x' } })).statut, 200);
  });

  it('refus : mot de passe faible (400), non-administrateur (403), sans jeton (401), soi-même (400), inconnu (404)', async () => {
    const p = await creerPatient('mdp2');
    const url = `/admin/utilisateurs/${p.id}/mot-de-passe`;
    assert.equal((await appel('PUT', url, { jeton: J.admin.jeton, json: { nouveauMotDePasse: 'court1' } })).statut, 400);
    assert.equal((await appel('PUT', url, { jeton: J.admin.jeton, json: { nouveauMotDePasse: 'sansaucunchiffre' } })).statut, 400);
    assert.equal((await appel('PUT', url, { jeton: J.medecinDemo.jeton, json: { nouveauMotDePasse: 'Valide2026x' } })).statut, 403);
    assert.equal((await appel('PUT', url, { jeton: J.paul.jeton, json: { nouveauMotDePasse: 'Valide2026x' } })).statut, 403);
    assert.equal((await appel('PUT', url, { json: { nouveauMotDePasse: 'Valide2026x' } })).statut, 401);
    assert.equal((await appel('PUT', `/admin/utilisateurs/${J.admin.id}/mot-de-passe`, { jeton: J.admin.jeton, json: { nouveauMotDePasse: 'Valide2026x' } })).statut, 400);
    assert.equal((await appel('PUT', '/admin/utilisateurs/00000000-0000-4000-8000-000000000000/mot-de-passe', { jeton: J.admin.jeton, json: { nouveauMotDePasse: 'Valide2026x' } })).statut, 404);
    assert.equal((await appel('POST', '/auth/connexion', { json: { email: p.email, motDePasse: MDP } })).statut, 200); // inchangé
  });

  it('refus (400) pour une fiche médecin sans compte de connexion', async () => {
    const r = await appel('POST', '/admin/utilisateurs', { jeton: J.admin.jeton, json: { role: 'MEDECIN', sansCompte: true, prenom: 'Sans', nom: 'Compte' + suffixe, telephone: '+2693000000' } });
    assert.equal(r.statut, 201, JSON.stringify(r.donnees));
    idsUtilisateurs.push(r.donnees.utilisateur.id);
    assert.equal((await appel('PUT', `/admin/utilisateurs/${r.donnees.utilisateur.id}/mot-de-passe`, { jeton: J.admin.jeton, json: { nouveauMotDePasse: 'Valide2026x' } })).statut, 400);
  });
});
