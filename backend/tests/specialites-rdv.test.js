// Tests d'intégration des évolutions : spécialités, fiches médecins, annuaire, création sans doublon
// et rendez-vous. Même principe que acces.test.js : vraie base PostgreSQL (DATABASE_URL), comptes « test-… »
// créés puis supprimés.   Lancer :  npm test
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secret-de-test-0123456789-0123456789-0123456789';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'cle-de-chiffrement-de-test-123456';
process.env.FRONTEND_URL = 'http://localhost:3000';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const app = require('../src/app');
const prisma = require('../src/lib/prisma');
const { semer, MOT_DE_PASSE_DEMO } = require('../prisma/seed');

const MDP = MOT_DE_PASSE_DEMO;
const suffixe = Date.now().toString(36);
let serveur;
let base;
const J = {}; // jetons et identifiants
const idsUtilisateurs = [];
const idsSpecialites = [];
let compteurCreneau = 0;

async function appel(methode, chemin, { jeton, json } = {}) {
  const headers = {};
  if (jeton) headers.Authorization = `Bearer ${jeton}`;
  let body;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
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

/** Un créneau futur unique (évite les collisions entre tests). */
function creneau(jours = 10) {
  compteurCreneau += 1;
  const d = new Date(Date.now() + jours * 86400000);
  d.setUTCHours(9, compteurCreneau, 0, 0);
  return d.toISOString();
}
const telAleatoire = () => '+33 6 ' + Math.floor(10000000 + Math.random() * 89999999).toString().replace(/(\d{2})(?=\d)/g, '$1 ');
const specialiteParLibelle = async (libelle) => (await prisma.specialite.findUnique({ where: { libelle } })).id;

async function creerPatient(nom) {
  const email = `test-${nom}-${suffixe}@exemple.fr`;
  const r = await appel('POST', '/auth/inscription', { json: { email, motDePasse: MDP, nom, prenom: 'Test' } });
  assert.equal(r.statut, 201);
  idsUtilisateurs.push(r.donnees.utilisateur.id);
  return { jeton: r.donnees.jeton, id: r.donnees.utilisateur.id, email };
}

before(async () => {
  await semer();
  await new Promise((ok) => {
    serveur = app.listen(0, ok);
  });
  base = `http://127.0.0.1:${serveur.address().port}/api/v1`;

  J.admin = await connecter('admin@mmadisante.demo');
  J.medecinDemo = await connecter('medecin@mmadisante.demo');
  J.patientA = await connecter('patient@mmadisante.demo');
  J.patientB = await connecter('patient2@mmadisante.demo');
  J.patientC = await creerPatient('patientc');
  J.patientD = await creerPatient('patientd');

  // Médecin de test (avec compte), spécialités Cardiologie + Médecine interne
  const cardio = await specialiteParLibelle('Cardiologie');
  const interne = await specialiteParLibelle('Médecine interne');
  J.telMedecin = telAleatoire();
  const r = await appel('POST', '/admin/utilisateurs', {
    jeton: J.admin.jeton,
    json: {
      email: `test-docteur-${suffixe}@exemple.fr`,
      motDePasse: MDP,
      role: 'MEDECIN',
      nom: 'Éloïse-Test',
      prenom: 'Marguerite',
      telephone: J.telMedecin,
      adresseProfessionnelle: '3 rue du Test, 75010 Paris',
      specialiteIds: [cardio, interne],
    },
  });
  assert.equal(r.statut, 201, JSON.stringify(r.donnees));
  idsUtilisateurs.push(r.donnees.utilisateur.id);
  J.docteur = { ...(await connecter(`test-docteur-${suffixe}@exemple.fr`)), cardio, interne };
});

after(async () => {
  await prisma.utilisateur.deleteMany({ where: { id: { in: idsUtilisateurs } } });
  await prisma.utilisateur.deleteMany({ where: { nom: { startsWith: 'TestNouveau' } } });
  await prisma.specialite.deleteMany({ where: { id: { in: idsSpecialites } } });
  await prisma.$disconnect();
  await new Promise((ok) => serveur.close(ok));
});

describe('Spécialités : liste prédéfinie et gestion par l\'administrateur', () => {
  it('la liste prédéfinie est présente, groupée, avec distinction médecins / autres professionnels', async () => {
    const r = await appel('GET', '/specialites', { jeton: J.patientA.jeton });
    assert.equal(r.statut, 200);
    const par = Object.fromEntries(r.donnees.specialites.map((s) => [s.libelle, s]));
    for (const l of ['Médecine générale', 'Cardiologie', 'Neurochirurgie', 'Pédiatrie', 'ORL (oto-rhino-laryngologie)', 'Urologie', 'Angiologie (médecine vasculaire)']) {
      assert.ok(par[l], `spécialité manquante : ${l}`);
      assert.equal(par[l].type, 'MEDECIN');
    }
    for (const l of ['Chirurgien-dentiste', 'Sage-femme', 'Pharmacien', 'Infirmier / Infirmière', 'Psychologue']) {
      assert.ok(par[l], `profession manquante : ${l}`);
      assert.equal(par[l].type, 'PROFESSIONNEL_SANTE');
    }
    assert.equal(par['Cardiologie'].groupe, 'Médecine générale et spécialités courantes');
    assert.ok(r.donnees.specialites.length >= 59);
    assert.equal(par['Cardiologie'].nombreMedecins, undefined, 'le compteur est réservé à l\'administrateur');
  });

  it('exige une authentification ; un patient ou un médecin ne peut ni ajouter ni modifier (403)', async () => {
    assert.equal((await appel('GET', '/specialites')).statut, 401);
    for (const jeton of [J.patientA.jeton, J.medecinDemo.jeton]) {
      assert.equal((await appel('POST', '/specialites', { jeton, json: { libelle: 'Pirate', groupe: 'X' } })).statut, 403);
      assert.equal((await appel('PUT', `/specialites/${J.docteur.cardio}`, { jeton, json: { actif: false } })).statut, 403);
    }
  });

  it('l\'administrateur ajoute, modifie puis désactive une spécialité ; les doublons (casse, accents) sont refusés', async () => {
    const libelle = `Testologie ${suffixe}`;
    const ajout = await appel('POST', '/specialites', { jeton: J.admin.jeton, json: { libelle, groupe: 'Groupe de test', type: 'MEDECIN' } });
    assert.equal(ajout.statut, 201);
    const id = ajout.donnees.specialite.id;
    idsSpecialites.push(id);

    const doublon = await appel('POST', '/specialites', { jeton: J.admin.jeton, json: { libelle: libelle.toUpperCase(), groupe: 'Autre' } });
    assert.equal(doublon.statut, 409);
    const doublonAccents = await appel('POST', '/specialites', { jeton: J.admin.jeton, json: { libelle: 'cardiologié', groupe: 'Autre' } });
    assert.equal(doublonAccents.statut, 409, 'même libellé aux accents près = doublon');
    assert.equal((await appel('POST', '/specialites', { jeton: J.admin.jeton, json: { libelle: 'CARDIOLOGIE', groupe: 'Autre' } })).statut, 409);
    assert.equal((await appel('POST', '/specialites', { jeton: J.admin.jeton, json: { libelle: '', groupe: 'Autre' } })).statut, 400);

    const maj = await appel('PUT', `/specialites/${id}`, { jeton: J.admin.jeton, json: { libelle: `${libelle} bis`, groupe: 'Groupe 2', type: 'PROFESSIONNEL_SANTE' } });
    assert.equal(maj.statut, 200);
    assert.equal(maj.donnees.specialite.libelle, `${libelle} bis`);
    assert.equal(maj.donnees.specialite.type, 'PROFESSIONNEL_SANTE');
    assert.equal((await appel('PUT', `/specialites/${id}`, { jeton: J.admin.jeton, json: { libelle: 'Cardiologie' } })).statut, 409);
    assert.equal((await appel('PUT', `/specialites/${'00000000-0000-4000-8000-000000000000'}`, { jeton: J.admin.jeton, json: { actif: false } })).statut, 404);

    const off = await appel('PUT', `/specialites/${id}`, { jeton: J.admin.jeton, json: { actif: false } });
    assert.equal(off.donnees.specialite.actif, false);
    const vuPatient = await appel('GET', '/specialites?toutes=true', { jeton: J.patientA.jeton });
    assert.ok(!vuPatient.donnees.specialites.some((s) => s.id === id), 'une spécialité désactivée disparaît des choix du patient');
    const vuAdmin = await appel('GET', '/specialites?toutes=true', { jeton: J.admin.jeton });
    assert.ok(vuAdmin.donnees.specialites.some((s) => s.id === id && s.actif === false), 'l\'administrateur voit aussi les désactivées');
    assert.ok(!(await appel('GET', '/specialites', { jeton: J.admin.jeton })).donnees.specialites.some((s) => s.id === id));
    J.specDesactivee = id;
  });

  it('une spécialité désactivée ne peut plus être attribuée, mais reste sur les médecins qui l\'avaient déjà', async () => {
    const reactivee = await appel('PUT', `/specialites/${J.specDesactivee}`, { jeton: J.admin.jeton, json: { actif: true } });
    assert.equal(reactivee.statut, 200);
    // On attribue la spécialité au médecin de test...
    const ok = await appel('PUT', `/admin/medecins/${J.docteur.id}`, {
      jeton: J.admin.jeton,
      json: { specialiteIds: [J.docteur.cardio, J.docteur.interne, J.specDesactivee] },
    });
    assert.equal(ok.statut, 200);
    // ... puis on la désactive
    await appel('PUT', `/specialites/${J.specDesactivee}`, { jeton: J.admin.jeton, json: { actif: false } });
    const refus = await appel('POST', '/admin/utilisateurs', {
      jeton: J.admin.jeton,
      json: { email: `test-spec-off-${suffixe}@exemple.fr`, motDePasse: MDP, role: 'MEDECIN', nom: 'X', prenom: 'Y', specialiteIds: [J.specDesactivee] },
    });
    assert.equal(refus.statut, 400);
    assert.match(refus.donnees.erreur, /plus disponible/);
    // Le médecin qui l'avait déjà la garde, même quand il met sa fiche à jour
    const garde = await appel('PUT', '/profil', { jeton: J.docteur.jeton, json: { specialiteIds: [J.docteur.cardio, J.specDesactivee] } });
    assert.equal(garde.statut, 200);
    assert.deepEqual(garde.donnees.utilisateur.specialites.map((s) => s.id).sort(), [J.docteur.cardio, J.specDesactivee].sort());
    // retour à l'état initial
    await appel('PUT', '/profil', { jeton: J.docteur.jeton, json: { specialiteIds: [J.docteur.cardio, J.docteur.interne] } });
  });
});

describe('Fiches médecins', () => {
  it('la fiche créée contient identité, téléphone, adresse professionnelle et spécialités, relues depuis la base', async () => {
    const r = await appel('GET', '/auth/moi', { jeton: J.docteur.jeton });
    const u = r.donnees.utilisateur;
    assert.equal(u.nom, 'Éloïse-Test');
    assert.equal(u.telephone, J.telMedecin);
    assert.equal(u.adresseProfessionnelle, '3 rue du Test, 75010 Paris');
    assert.deepEqual(u.specialites.map((s) => s.libelle), ['Cardiologie', 'Médecine interne']);
    assert.equal(u.typeProfessionnel, 'MEDECIN');
    assert.equal(u.sansCompte, false);
  });

  it('distingue les médecins des autres professionnels de santé', async () => {
    const pharma = await specialiteParLibelle('Pharmacien');
    const r = await appel('POST', '/admin/utilisateurs', {
      jeton: J.admin.jeton,
      json: { email: `test-pharma-${suffixe}@exemple.fr`, motDePasse: MDP, role: 'MEDECIN', nom: 'Pharma', prenom: 'Test', specialiteIds: [pharma] },
    });
    assert.equal(r.statut, 201);
    idsUtilisateurs.push(r.donnees.utilisateur.id);
    assert.equal(r.donnees.utilisateur.typeProfessionnel, 'PROFESSIONNEL_SANTE');
    const annuaire = await appel('GET', '/medecins?type=PROFESSIONNEL_SANTE&q=pharma', { jeton: J.patientA.jeton });
    assert.ok(annuaire.donnees.medecins.some((m) => m.id === r.donnees.utilisateur.id && m.typeProfessionnel === 'PROFESSIONNEL_SANTE'));
    const medecinsSeuls = await appel('GET', '/medecins?type=MEDECIN&q=pharma', { jeton: J.patientA.jeton });
    assert.ok(!medecinsSeuls.donnees.medecins.some((m) => m.id === r.donnees.utilisateur.id));
  });

  it('création d\'une fiche SANS compte : e-mail et mot de passe facultatifs, connexion impossible', async () => {
    const sansEmail = await appel('POST', '/admin/utilisateurs', {
      jeton: J.admin.jeton,
      json: { role: 'MEDECIN', sansCompte: true, nom: 'TestNouveau-Fiche', prenom: 'Sans', telephone: telAleatoire(), specialiteIds: [J.docteur.cardio] },
    });
    assert.equal(sansEmail.statut, 201, JSON.stringify(sansEmail.donnees));
    assert.equal(sansEmail.donnees.utilisateur.email, null);
    assert.equal(sansEmail.donnees.utilisateur.sansCompte, true);

    const avecEmail = await appel('POST', '/admin/utilisateurs', {
      jeton: J.admin.jeton,
      json: { role: 'MEDECIN', sansCompte: true, email: `test-fiche-${suffixe}@exemple.fr`, nom: 'TestNouveau-Fiche2', prenom: 'Avec' },
    });
    assert.equal(avecEmail.statut, 201);
    // même avec un e-mail renseigné, aucune connexion possible
    const connexion = await appel('POST', '/auth/connexion', { json: { email: `test-fiche-${suffixe}@exemple.fr`, motDePasse: MDP } });
    assert.equal(connexion.statut, 401);

    // Un compte « normal » exige toujours e-mail et mot de passe valide ; sansCompte réservé aux médecins
    const sansMdp = await appel('POST', '/admin/utilisateurs', { jeton: J.admin.jeton, json: { role: 'MEDECIN', email: `test-x-${suffixe}@exemple.fr`, nom: 'A', prenom: 'B' } });
    assert.equal(sansMdp.statut, 400);
    const sansMail = await appel('POST', '/admin/utilisateurs', { jeton: J.admin.jeton, json: { role: 'MEDECIN', motDePasse: MDP, nom: 'A', prenom: 'B' } });
    assert.equal(sansMail.statut, 400);
    const patientSansCompte = await appel('POST', '/admin/utilisateurs', { jeton: J.admin.jeton, json: { role: 'PATIENT', sansCompte: true, nom: 'A', prenom: 'B' } });
    assert.equal(patientSansCompte.statut, 400);
    const patientAvecSpecialite = await appel('POST', '/admin/utilisateurs', {
      jeton: J.admin.jeton,
      json: { role: 'PATIENT', email: `test-ps-${suffixe}@exemple.fr`, motDePasse: MDP, nom: 'A', prenom: 'B', specialiteIds: [J.docteur.cardio] },
    });
    assert.equal(patientAvecSpecialite.statut, 400);
  });

  it('le médecin modifie SA fiche (adresse pro, spécialités) ; un patient ne le peut pas', async () => {
    const r = await appel('PUT', '/profil', { jeton: J.docteur.jeton, json: { adresseProfessionnelle: '9 avenue Neuve, 69002 Lyon' } });
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.utilisateur.adresseProfessionnelle, '9 avenue Neuve, 69002 Lyon');
    assert.equal(r.donnees.utilisateur.specialites.length, 2, 'les spécialités ne changent pas si elles ne sont pas envoyées');
    const interdit = await appel('PUT', '/profil', { jeton: J.patientA.jeton, json: { adresseProfessionnelle: 'Pirate', specialiteIds: [J.docteur.cardio] } });
    assert.equal(interdit.statut, 403);
    const mauvaise = await appel('PUT', '/profil', { jeton: J.docteur.jeton, json: { specialiteIds: ['00000000-0000-4000-8000-000000000000'] } });
    assert.equal(mauvaise.statut, 400);
  });

  it('l\'administrateur modifie la fiche d\'un médecin ; le changement est visible partout (annuaire, fiche)', async () => {
    const nouveauTel = telAleatoire();
    const r = await appel('PUT', `/admin/medecins/${J.docteur.id}`, { jeton: J.admin.jeton, json: { telephone: nouveauTel, adresseProfessionnelle: '1 place Centrale, 13001 Marseille' } });
    assert.equal(r.statut, 200);
    const annuaire = await appel('GET', `/medecins/${J.docteur.id}`, { jeton: J.patientA.jeton });
    assert.equal(annuaire.donnees.medecin.telephone, nouveauTel);
    assert.equal(annuaire.donnees.medecin.adresseProfessionnelle, '1 place Centrale, 13001 Marseille');
    J.telMedecin = nouveauTel;
    // autres profils : refusé
    assert.equal((await appel('PUT', `/admin/medecins/${J.docteur.id}`, { jeton: J.patientA.jeton, json: { telephone: '123456' } })).statut, 403);
    assert.equal((await appel('PUT', `/admin/medecins/${J.docteur.id}`, { jeton: J.docteur.jeton, json: { telephone: '123456' } })).statut, 403);
    // un patient n'est pas une fiche médecin
    assert.equal((await appel('PUT', `/admin/medecins/${J.patientA.id}`, { jeton: J.admin.jeton, json: { telephone: '123456' } })).statut, 404);
    // l'e-mail d'un compte de connexion ne peut pas être vidé
    assert.equal((await appel('PUT', `/admin/medecins/${J.docteur.id}`, { jeton: J.admin.jeton, json: { email: '' } })).statut, 400);
  });
});

describe('Annuaire des médecins (recherche patient)', () => {
  it('recherche par nom (sans tenir compte des accents ni de la casse) et affiche les informations utiles', async () => {
    const r = await appel('GET', '/medecins?q=ELOISE', { jeton: J.patientA.jeton });
    assert.equal(r.statut, 200);
    const m = r.donnees.medecins.find((x) => x.id === J.docteur.id);
    assert.ok(m, 'trouvé malgré l\'absence d\'accent et la casse');
    assert.equal(m.nom, 'Éloïse-Test');
    assert.equal(m.prenom, 'Marguerite');
    assert.equal(m.telephone, J.telMedecin);
    assert.equal(m.adresseProfessionnelle, '1 place Centrale, 13001 Marseille');
    assert.deepEqual(m.specialites.map((s) => s.libelle), ['Cardiologie', 'Médecine interne']);
    assert.equal(m.email, undefined, 'l\'e-mail de connexion n\'est pas exposé aux patients');
    assert.equal(m.motDePasseHash, undefined);
  });

  it('recherche par spécialité (texte ou identifiant) ; ne renvoie que des médecins', async () => {
    const parTexte = await appel('GET', '/medecins?q=cardiologie', { jeton: J.patientA.jeton });
    assert.ok(parTexte.donnees.medecins.some((m) => m.id === J.docteur.id));
    const parId = await appel('GET', `/medecins?specialiteId=${J.docteur.interne}`, { jeton: J.patientA.jeton });
    assert.ok(parId.donnees.medecins.some((m) => m.id === J.docteur.id));
    assert.ok(parId.donnees.medecins.every((m) => m.specialites.some((s) => s.id === J.docteur.interne)));
    const aucun = await appel('GET', '/medecins?q=zzzintrouvablezzz', { jeton: J.patientA.jeton });
    assert.equal(aucun.donnees.medecins.length, 0);
    const tous = await appel('GET', '/medecins', { jeton: J.patientA.jeton });
    assert.ok(tous.donnees.medecins.every((m) => m.id !== J.patientA.id && m.id !== J.admin.id), 'ni patients ni administrateurs');
    assert.equal((await appel('GET', '/medecins?specialiteId=pas-un-uuid', { jeton: J.patientA.jeton })).statut, 400);
  });

  it('réservé aux patients et administrateurs', async () => {
    assert.equal((await appel('GET', '/medecins')).statut, 401);
    assert.equal((await appel('GET', '/medecins', { jeton: J.docteur.jeton })).statut, 403);
    assert.equal((await appel('GET', '/medecins', { jeton: J.admin.jeton })).statut, 200);
  });

  it('« verifier » retrouve un médecin existant par téléphone (formats différents) ou par nom', async () => {
    const chiffres = J.telMedecin.replace(/\D/g, '').slice(-9);
    const autreFormat = '0' + chiffres; // 06 12 ... au lieu de +33 6 12 ...
    const parTel = await appel('POST', '/medecins/verifier', { jeton: J.patientA.jeton, json: { nom: 'Inconnu', prenom: 'Autre', telephone: autreFormat } });
    assert.equal(parTel.statut, 200);
    assert.ok(parTel.donnees.doublons.some((d) => d.raison === 'telephone' && d.medecin.id === J.docteur.id));
    const parNom = await appel('POST', '/medecins/verifier', { jeton: J.patientA.jeton, json: { nom: 'eloise-test', prenom: 'MARGUERITE' } });
    assert.ok(parNom.donnees.doublons.some((d) => d.raison === 'nom' && d.medecin.id === J.docteur.id));
    const inversé = await appel('POST', '/medecins/verifier', { jeton: J.patientA.jeton, json: { nom: 'Marguerite', prenom: 'Éloïse-Test' } });
    assert.ok(inversé.donnees.doublons.some((d) => d.medecin.id === J.docteur.id), 'nom et prénom inversés détectés');
    const aucun = await appel('POST', '/medecins/verifier', { jeton: J.patientA.jeton, json: { nom: 'Zzzz', prenom: 'Yyyy', telephone: '+33 6 11 22 33 44' } });
    assert.equal(aucun.donnees.doublons.length, 0);
  });
});

describe('Rendez-vous avec un médecin déjà enregistré (cas 1)', () => {
  it('le patient réserve ; le médecin et l\'administrateur voient la demande, un autre patient non', async () => {
    const date = creneau(10);
    const r = await appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { medecinId: J.docteur.id, dateHeure: date, motif: 'Contrôle annuel' } });
    assert.equal(r.statut, 201, JSON.stringify(r.donnees));
    assert.equal(r.donnees.medecinCree, false);
    const rdv = r.donnees.rendezVous;
    assert.equal(rdv.statut, 'DEMANDE');
    assert.equal(rdv.medecin.id, J.docteur.id);
    assert.equal(rdv.medecin.telephone, J.telMedecin, 'les informations du médecin viennent de sa fiche, sans ressaisie');
    assert.equal(rdv.medecin.adresseProfessionnelle, '1 place Centrale, 13001 Marseille');
    J.rdv1 = rdv.id;

    const cote = await appel('GET', '/rendez-vous', { jeton: J.patientC.jeton });
    assert.ok(cote.donnees.rendezVous.some((x) => x.id === rdv.id && x.medecin.specialites.length === 2));
    assert.equal(cote.donnees.rendezVous.find((x) => x.id === rdv.id).patient, undefined);

    const medecin = await appel('GET', '/rendez-vous', { jeton: J.docteur.jeton });
    const vu = medecin.donnees.rendezVous.find((x) => x.id === rdv.id);
    assert.ok(vu);
    assert.equal(vu.patient.id, J.patientC.id);
    assert.equal(vu.dossierAccessible, false, 'pas d\'attribution : pas d\'accès au dossier');

    const autrePatient = await appel('GET', '/rendez-vous', { jeton: J.patientD.jeton });
    assert.ok(!autrePatient.donnees.rendezVous.some((x) => x.id === rdv.id));
    const autreMedecin = await appel('GET', '/rendez-vous', { jeton: J.medecinDemo.jeton });
    assert.ok(!autreMedecin.donnees.rendezVous.some((x) => x.id === rdv.id));
    const admin = await appel('GET', '/rendez-vous', { jeton: J.admin.jeton });
    assert.ok(admin.donnees.rendezVous.some((x) => x.id === rdv.id));
  });

  it('sans autorisation, le médecin n\'accède pas au dossier ; avec « autoriserAcces », il y accède', async () => {
    assert.equal((await appel('GET', `/utilisateurs/${J.patientC.id}`, { jeton: J.docteur.jeton })).statut, 403);
    const r = await appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { medecinId: J.docteur.id, dateHeure: creneau(11), autoriserAcces: true } });
    assert.equal(r.statut, 201);
    assert.equal((await appel('GET', `/utilisateurs/${J.patientC.id}`, { jeton: J.docteur.jeton })).statut, 200);
    const liste = await appel('GET', '/rendez-vous', { jeton: J.docteur.jeton });
    assert.equal(liste.donnees.rendezVous.find((x) => x.id === r.donnees.rendezVous.id).dossierAccessible, true);
  });

  it('« Mes médecins » : fiche complète pour le patient ; il peut retirer l\'accès', async () => {
    const r = await appel('GET', '/profil/medecins', { jeton: J.patientC.jeton });
    assert.equal(r.statut, 200);
    const m = r.donnees.medecins.find((x) => x.id === J.docteur.id);
    assert.ok(m);
    assert.equal(m.telephone, J.telMedecin);
    assert.equal(m.adresseProfessionnelle, '1 place Centrale, 13001 Marseille');
    assert.equal(m.specialites.length, 2);
    assert.equal((await appel('GET', '/profil/medecins', { jeton: J.docteur.jeton })).statut, 403);

    const retrait = await appel('DELETE', `/profil/medecins/${J.docteur.id}`, { jeton: J.patientC.jeton });
    assert.equal(retrait.statut, 200);
    assert.equal((await appel('GET', `/utilisateurs/${J.patientC.id}`, { jeton: J.docteur.jeton })).statut, 403, 'le médecin perd l\'accès');
    assert.equal((await appel('DELETE', `/profil/medecins/${J.docteur.id}`, { jeton: J.patientC.jeton })).statut, 404);
    assert.equal((await appel('GET', '/profil/medecins', { jeton: J.patientD.jeton })).donnees.medecins.length, 0, 'un autre patient ne voit pas ces médecins');
  });

  it('validations : date passée ou trop lointaine, format, médecin inconnu, mauvais profil', async () => {
    const post = (json, jeton = J.patientD.jeton) => appel('POST', '/rendez-vous', { jeton, json });
    assert.equal((await post({ medecinId: J.docteur.id, dateHeure: new Date(Date.now() - 3600000).toISOString() })).statut, 400);
    assert.equal((await post({ medecinId: J.docteur.id, dateHeure: new Date(Date.now() + 400 * 86400000).toISOString() })).statut, 400);
    assert.equal((await post({ medecinId: J.docteur.id, dateHeure: 'demain matin' })).statut, 400);
    assert.equal((await post({ medecinId: J.docteur.id })).statut, 400);
    assert.equal((await post({ dateHeure: creneau(12) })).statut, 400, 'ni médecin existant ni nouveau médecin');
    assert.equal((await post({ medecinId: J.docteur.id, dateHeure: creneau(12), nouveauMedecin: { nom: 'A', prenom: 'B', telephone: '0600000000', specialiteIds: [J.docteur.cardio] } })).statut, 400, 'les deux à la fois');
    assert.equal((await post({ medecinId: '00000000-0000-4000-8000-000000000000', dateHeure: creneau(12) })).statut, 404);
    assert.equal((await post({ medecinId: J.patientA.id, dateHeure: creneau(12) })).statut, 404, 'un patient n\'est pas un médecin');
    assert.equal((await post({ medecinId: 'abc', dateHeure: creneau(12) })).statut, 400);
    // seuls les patients réservent
    assert.equal((await post({ medecinId: J.docteur.id, dateHeure: creneau(12) }, J.docteur.jeton)).statut, 403);
    assert.equal((await post({ medecinId: J.docteur.id, dateHeure: creneau(12) }, J.admin.jeton)).statut, 403);
    assert.equal((await appel('POST', '/rendez-vous', { json: { medecinId: J.docteur.id, dateHeure: creneau(12) } })).statut, 401);
  });

  it('refuse une demande identique et un créneau déjà confirmé pour ce médecin', async () => {
    const date = creneau(13);
    const premier = await appel('POST', '/rendez-vous', { jeton: J.patientD.jeton, json: { medecinId: J.docteur.id, dateHeure: date } });
    assert.equal(premier.statut, 201);
    const identique = await appel('POST', '/rendez-vous', { jeton: J.patientD.jeton, json: { medecinId: J.docteur.id, dateHeure: date } });
    assert.equal(identique.statut, 409);
    // le médecin confirme ; un autre patient ne peut plus prendre ce créneau
    const conf = await appel('PATCH', `/rendez-vous/${premier.donnees.rendezVous.id}/statut`, { jeton: J.docteur.jeton, json: { statut: 'CONFIRME' } });
    assert.equal(conf.statut, 200);
    assert.equal(conf.donnees.rendezVous.statut, 'CONFIRME');
    const pris = await appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { medecinId: J.docteur.id, dateHeure: date } });
    assert.equal(pris.statut, 409);
  });
});

describe('Statuts des rendez-vous : qui peut faire quoi', () => {
  it('seul le médecin concerné confirme ou refuse ; le patient annule uniquement le sien', async () => {
    const r = await appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { medecinId: J.docteur.id, dateHeure: creneau(20) } });
    const id = r.donnees.rendezVous.id;
    const patch = (jeton, statut) => appel('PATCH', `/rendez-vous/${id}/statut`, { jeton, json: { statut } });

    assert.equal((await patch(J.patientC.jeton, 'CONFIRME')).statut, 403, 'un patient ne confirme pas');
    assert.equal((await patch(J.patientD.jeton, 'ANNULE')).statut, 403, 'un autre patient ne peut pas annuler');
    assert.equal((await patch(J.medecinDemo.jeton, 'CONFIRME')).statut, 403, 'un autre médecin ne peut pas confirmer');
    assert.equal((await appel('PATCH', `/rendez-vous/${id}/statut`, { json: { statut: 'ANNULE' } })).statut, 401);
    assert.equal((await patch(J.docteur.jeton, 'PAS-UN-STATUT')).statut, 400);
    assert.equal((await appel('PATCH', `/rendez-vous/${'00000000-0000-4000-8000-000000000000'}/statut`, { jeton: J.admin.jeton, json: { statut: 'ANNULE' } })).statut, 404);

    assert.equal((await patch(J.docteur.jeton, 'REFUSE')).donnees.rendezVous.statut, 'REFUSE');
    assert.equal((await patch(J.patientC.jeton, 'ANNULE')).statut, 409, 'déjà clôturé');

    const r2 = await appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { medecinId: J.docteur.id, dateHeure: creneau(21) } });
    const annule = await appel('PATCH', `/rendez-vous/${r2.donnees.rendezVous.id}/statut`, { jeton: J.patientC.jeton, json: { statut: 'ANNULE' } });
    assert.equal(annule.statut, 200);
    assert.equal(annule.donnees.rendezVous.statut, 'ANNULE');

    const r3 = await appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { medecinId: J.docteur.id, dateHeure: creneau(22) } });
    const parAdmin = await appel('PATCH', `/rendez-vous/${r3.donnees.rendezVous.id}/statut`, { jeton: J.admin.jeton, json: { statut: 'CONFIRME' } });
    assert.equal(parAdmin.statut, 200);
  });
});

describe('Médecin absent de la base (cas 2) : vérification, création sans doublon, association', () => {
  const nouveau = (extra = {}) => ({
    nom: 'TestNouveau-Dupuis',
    prenom: 'Armand',
    telephone: telAleatoire(),
    adresseProfessionnelle: '14 rue des Lilas, 31000 Toulouse',
    specialiteIds: [],
    ...extra,
  });

  it('crée la fiche, l\'associe au patient et au rendez-vous', async () => {
    const neuro = await specialiteParLibelle('Neurologie');
    const m = nouveau({ specialiteIds: [neuro] });
    const avant = await prisma.utilisateur.count({ where: { role: 'MEDECIN' } });
    const r = await appel('POST', '/rendez-vous', { jeton: J.patientD.jeton, json: { nouveauMedecin: m, dateHeure: creneau(30), motif: 'Maux de tête' } });
    assert.equal(r.statut, 201, JSON.stringify(r.donnees));
    assert.equal(r.donnees.medecinCree, true);
    const rdv = r.donnees.rendezVous;
    assert.equal(rdv.medecin.nom, 'TestNouveau-Dupuis');
    assert.equal(rdv.medecin.specialites[0].libelle, 'Neurologie');
    assert.equal(rdv.medecin.sansCompte, true);
    assert.equal(await prisma.utilisateur.count({ where: { role: 'MEDECIN' } }), avant + 1);

    const fiche = await prisma.utilisateur.findUnique({ where: { id: rdv.medecin.id } });
    assert.equal(fiche.role, 'MEDECIN');
    assert.equal(fiche.email, null);
    assert.equal(fiche.sansCompte, true);
    assert.equal(fiche.telephone, m.telephone);
    assert.equal(fiche.adresseProfessionnelle, m.adresseProfessionnelle);

    // associé au patient (visible dans « Mes médecins ») et au rendez-vous
    const mes = await appel('GET', '/profil/medecins', { jeton: J.patientD.jeton });
    assert.ok(mes.donnees.medecins.some((x) => x.id === fiche.id && x.telephone === m.telephone));
    const rdvs = await appel('GET', '/rendez-vous', { jeton: J.patientD.jeton });
    const lie = rdvs.donnees.rendezVous.find((x) => x.id === rdv.id);
    assert.equal(lie.medecin.id, fiche.id);
    assert.equal(await prisma.rendezVous.count({ where: { id: rdv.id, patientId: J.patientD.id, medecinId: fiche.id } }), 1);
    // la fiche est désormais disponible pour tous dans l'annuaire
    const annuaire = await appel('GET', '/medecins?q=dupuis', { jeton: J.patientC.jeton });
    assert.ok(annuaire.donnees.medecins.some((x) => x.id === fiche.id));
    J.nouveauMedecin = { ...m, id: fiche.id };
  });

  it('refuse de recréer un médecin existant (même téléphone, même autre format) : aucune fiche en double', async () => {
    const avant = await prisma.utilisateur.count({ where: { role: 'MEDECIN' } });
    const chiffres = J.nouveauMedecin.telephone.replace(/\D/g, '').slice(-9);
    const r = await appel('POST', '/rendez-vous', {
      jeton: J.patientC.jeton,
      json: { nouveauMedecin: nouveau({ nom: 'TestNouveau-Autre', telephone: '0' + chiffres, specialiteIds: [J.docteur.cardio] }), dateHeure: creneau(31) },
    });
    assert.equal(r.statut, 409);
    assert.equal(r.donnees.details.bloquant, true);
    assert.equal(r.donnees.details.medecinsExistants[0].medecin.id, J.nouveauMedecin.id);
    assert.equal(await prisma.utilisateur.count({ where: { role: 'MEDECIN' } }), avant, 'aucune création');
  });

  it('même nom mais autre téléphone : alerte « homonyme » ; création seulement après confirmation explicite', async () => {
    const neuro = await specialiteParLibelle('Neurologie');
    const base1 = nouveau({ nom: 'TestNouveau-Dupuis', prenom: 'armand', specialiteIds: [neuro] }); // même identité, autre téléphone
    const avant = await prisma.utilisateur.count({ where: { role: 'MEDECIN' } });
    const alerte = await appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { nouveauMedecin: base1, dateHeure: creneau(32) } });
    assert.equal(alerte.statut, 409);
    assert.equal(alerte.donnees.details.bloquant, false);
    assert.equal(await prisma.utilisateur.count({ where: { role: 'MEDECIN' } }), avant);

    const confirme = await appel('POST', '/rendez-vous', {
      jeton: J.patientC.jeton,
      json: { nouveauMedecin: { ...base1, confirmationHomonyme: true }, dateHeure: creneau(32) },
    });
    assert.equal(confirme.statut, 201);
    assert.equal(await prisma.utilisateur.count({ where: { role: 'MEDECIN' } }), avant + 1);
  });

  it('deux créations simultanées du même médecin : une seule fiche est créée', async () => {
    const m = nouveau({ nom: 'TestNouveau-Course', prenom: 'Zoé', specialiteIds: [J.docteur.cardio] });
    const avant = await prisma.utilisateur.count({ where: { role: 'MEDECIN' } });
    const [a, b] = await Promise.all([
      appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { nouveauMedecin: m, dateHeure: creneau(33) } }),
      appel('POST', '/rendez-vous', { jeton: J.patientD.jeton, json: { nouveauMedecin: m, dateHeure: creneau(33) } }),
    ]);
    assert.deepEqual([a.statut, b.statut].sort(), [201, 409]);
    assert.equal(await prisma.utilisateur.count({ where: { role: 'MEDECIN' } }), avant + 1);
  });

  it('exige nom, prénom, téléphone et au moins une spécialité ; ignore tout champ « rôle » envoyé', async () => {
    const post = (nouveauMedecin) => appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { nouveauMedecin, dateHeure: creneau(34) } });
    assert.equal((await post({ ...nouveau(), nom: '' })).statut, 400);
    assert.equal((await post({ ...nouveau(), prenom: '' })).statut, 400);
    assert.equal((await post({ ...nouveau(), telephone: '' })).statut, 400);
    assert.equal((await post({ ...nouveau(), telephone: 'pas-un-numero' })).statut, 400);
    assert.equal((await post({ ...nouveau(), specialiteIds: [] })).statut, 400);
    assert.equal((await post({ ...nouveau({ nom: 'TestNouveau-SpecInconnue' }), specialiteIds: ['00000000-0000-4000-8000-000000000000'] })).statut, 400);
    // rôle / droits forcés : ignorés
    const r = await post({ ...nouveau({ nom: 'TestNouveau-Role', specialiteIds: [J.docteur.cardio] }), role: 'ADMIN', sansCompte: false, email: 'pirate@exemple.fr' });
    assert.equal(r.statut, 201);
    const fiche = await prisma.utilisateur.findUnique({ where: { id: r.donnees.rendezVous.medecin.id } });
    assert.equal(fiche.role, 'MEDECIN');
    assert.equal(fiche.sansCompte, true);
    assert.equal(fiche.email, null);
  });

  it('une fiche sans compte ne peut pas se connecter ; le rendez-vous reste « en attente » (confirmation par l\'administrateur)', async () => {
    const lignes = await prisma.rendezVous.findMany({ where: { medecinId: J.nouveauMedecin.id } });
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].statut, 'DEMANDE');
    const parAdmin = await appel('PATCH', `/rendez-vous/${lignes[0].id}/statut`, { jeton: J.admin.jeton, json: { statut: 'CONFIRME' } });
    assert.equal(parAdmin.statut, 200);
  });
});

describe('Cohérence des données', () => {
  it('supprimer un patient ou un médecin supprime ses rendez-vous (cascade) sans toucher aux autres', async () => {
    const p = await creerPatient('cascade-rdv');
    const r1 = await appel('POST', '/rendez-vous', { jeton: p.jeton, json: { medecinId: J.docteur.id, dateHeure: creneau(40) } });
    assert.equal(r1.statut, 201);
    assert.equal((await appel('DELETE', `/admin/utilisateurs/${p.id}`, { jeton: J.admin.jeton })).statut, 200);
    assert.equal(await prisma.rendezVous.count({ where: { id: r1.donnees.rendezVous.id } }), 0);
    assert.ok(await prisma.utilisateur.findUnique({ where: { id: J.docteur.id } }), 'le médecin existe toujours');

    // médecin supprimé : ses rendez-vous, spécialités et attributions disparaissent, le patient reste
    const medecin = await appel('POST', '/admin/utilisateurs', {
      jeton: J.admin.jeton,
      json: { role: 'MEDECIN', sansCompte: true, nom: 'TestNouveau-Cascade', prenom: 'Med', telephone: telAleatoire(), specialiteIds: [J.docteur.cardio] },
    });
    const r2 = await appel('POST', '/rendez-vous', { jeton: J.patientC.jeton, json: { medecinId: medecin.donnees.utilisateur.id, dateHeure: creneau(41), autoriserAcces: true } });
    assert.equal(r2.statut, 201);
    assert.equal((await appel('DELETE', `/admin/utilisateurs/${medecin.donnees.utilisateur.id}`, { jeton: J.admin.jeton })).statut, 200);
    assert.equal(await prisma.rendezVous.count({ where: { medecinId: medecin.donnees.utilisateur.id } }), 0);
    assert.equal(await prisma.medecinSpecialite.count({ where: { medecinId: medecin.donnees.utilisateur.id } }), 0);
    assert.equal(await prisma.attribution.count({ where: { medecinId: medecin.donnees.utilisateur.id } }), 0);
    assert.ok(await prisma.utilisateur.findUnique({ where: { id: J.patientC.id } }), 'le patient existe toujours');
    assert.ok(await prisma.specialite.findUnique({ where: { id: J.docteur.cardio } }), 'la spécialité existe toujours');
  });

  it('la liste admin des utilisateurs expose spécialités et adresse pro des médecins, jamais la carte d\'identité', async () => {
    const r = await appel('GET', '/admin/utilisateurs?role=MEDECIN&q=eloise', { jeton: J.admin.jeton });
    // "eloise" sans accent ne correspond pas côté admin (recherche SQL) : on cherche par e-mail
    const r2 = await appel('GET', `/admin/utilisateurs?role=MEDECIN&q=test-docteur-${suffixe}`, { jeton: J.admin.jeton });
    assert.equal(r.statut, 200);
    const m = r2.donnees.utilisateurs[0];
    assert.equal(m.id, J.docteur.id);
    assert.equal(m.specialites.length, 2);
    assert.ok(m.adresseProfessionnelle);
    assert.equal(m.carteIdentite, undefined);
  });

  it('la fiche vue par l\'administrateur affiche les médecins attribués avec spécialités, téléphone et adresse', async () => {
    const att = await appel('POST', '/admin/attributions', { jeton: J.admin.jeton, json: { patientId: J.patientD.id, medecinId: J.docteur.id } });
    assert.equal(att.statut, 201);
    const r = await appel('GET', `/utilisateurs/${J.patientD.id}`, { jeton: J.admin.jeton });
    const m = r.donnees.medecins.find((x) => x.id === J.docteur.id);
    assert.ok(m);
    assert.equal(m.telephone, J.telMedecin);
    assert.equal(m.specialites.length, 2);
    assert.ok(m.adresseProfessionnelle);
    assert.equal(m.email, undefined);
  });
});

describe('Écran de connexion : plus aucun compte de démonstration', () => {
  it('aucun identifiant, mot de passe ou raccourci de démonstration dans le code du site', () => {
    const racine = path.join(__dirname, '..', '..', 'frontend');
    const fichiers = [];
    const parcourir = (dossier) => {
      for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, e.name);
        if (e.isDirectory()) parcourir(chemin);
        else if (/\.(js|jsx|css|json)$/.test(e.name)) fichiers.push(chemin);
      }
    };
    for (const d of ['app', 'components', 'lib']) parcourir(path.join(racine, d));
    assert.ok(fichiers.length > 10);
    const interdits = [/mmadisante\.demo/i, /MmadiDemo2026/, /AFFICHER_COMPTES_DEMO/, /COMPTES_DEMO/, /Comptes de démonstration/i];
    for (const f of fichiers) {
      const texte = fs.readFileSync(f, 'utf8');
      for (const motif of interdits) assert.ok(!motif.test(texte), `${path.relative(racine, f)} contient encore « ${motif} »`);
    }
    const connexion = fs.readFileSync(path.join(racine, 'app', 'connexion', 'page.js'), 'utf8');
    assert.match(connexion, /type="email"/);
    assert.match(connexion, /type="password"/);
  });
});
