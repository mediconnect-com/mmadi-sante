# MmadiSanté

Application web pour saisir et consulter des informations de santé : **nom, prénom, adresse, numéro de mobile, numéro de carte d'identité** et **documents** (ordonnances, diagnostics, analyses…), avec un accès strictement contrôlé selon le profil de l'utilisateur.

> ⚠ **Prototype de démonstration.** Pour de vraies données de santé de patients en France, la réglementation impose un hébergeur **certifié HDS**. Render et Supabase ne le sont pas : n'y enregistrez pas de données réelles. Voir [Limites](#limites-et-pistes-damélioration).

| Profil | Ce qu'il peut faire |
|---|---|
| **PATIENT** | Créer son compte, saisir et modifier **ses** informations, envoyer et supprimer **ses** documents, retrouver **ses médecins** (nom, spécialité, téléphone, adresse), **rechercher un médecin** et **prendre rendez-vous**. Ne voit jamais les données d'un autre. |
| **MÉDECIN** | Tenir sa **fiche professionnelle** (spécialités, adresse), traiter les demandes de rendez-vous, consulter (lecture seule) les informations des patients **qui lui sont attribués** (jamais leurs documents), rédiger un commentaire de pathologies à l'issue d'un rendez-vous et déposer des documents dans leur fiche. |
| **ADMINISTRATEUR** | Tout consulter, supprimer des documents et des utilisateurs, créer des comptes et fiches médecins de tout profil, gérer la liste des **spécialités**, attribuer les patients aux médecins. |

Ces règles sont appliquées **côté serveur, sur chaque route de l'API** (pas seulement dans l'interface) et vérifiées par 90 tests automatisés.

**Technologies** : Node.js + Express + Prisma (API) · Next.js + React + Tailwind (site, export statique) · PostgreSQL · interface et commentaires en français.

---

## Sommaire

1. [Contenu du projet](#contenu-du-projet)
2. [Médecins, spécialités et rendez-vous](#médecins-spécialités-et-rendez-vous)
3. [Comptes de démonstration](#comptes-de-démonstration)
4. [Installation locale](#installation-locale)
5. [Déploiement cloud (Render + Supabase)](#déploiement-cloud-render--supabase)
6. [Mettre à jour une application déjà en ligne](#mettre-à-jour-une-application-déjà-en-ligne)
7. [Variables d'environnement](#variables-denvironnement)
8. [Sécurité : ce qui est en place](#sécurité--ce-qui-est-en-place)
9. [API : routes principales](#api--routes-principales)
10. [En cas d'erreur](#en-cas-derreur)
11. [Limites et pistes d'amélioration](#limites-et-pistes-damélioration)

---

## Contenu du projet

```
mmadi-sante/
├── backend/                 API Express + Prisma (routes sous /api/v1)
│   ├── src/                 code : routes, middleware d'accès, chiffrement, validation
│   ├── prisma/              schema.prisma, migrations/, seed.js
│   ├── tests/               90 tests automatisés (npm test)
│   └── .env.example         variables d'environnement documentées
├── frontend/                site Next.js + Tailwind (responsive mobile/tablette)
│   └── .env.example
├── database/
│   ├── schema.sql           ★ création des tables en SQL pur (éditeur SQL Supabase)
│   ├── mise_a_jour_v2.sql   ★ mise à jour d'une base déjà en service (spécialités, rendez-vous)
│   ├── mise_a_jour_v3.sql   ★ mise à jour V3 (commentaires de pathologies, documents déposés par un médecin)
│   ├── mise_a_jour_v4.sql   ★ mise à jour V4 (« mot de passe oublié » : table des liens de réinitialisation)
│   ├── seed_demo.sql        ★ comptes de démonstration en SQL pur
│   └── supprimer_comptes_demo.sql   ★ retire les 4 comptes de démonstration (et eux seuls)
├── scripts/                 ★ scripts guidés pour non-développeurs (voir ci-dessous)
├── render.yaml              ★ déclaration des services Render (Blueprint)
├── docker-compose.yml       PostgreSQL de test en local (facultatif)
└── README.md
```

---

## Nouveautés de la version 4

| Évolution | Où la trouver |
|---|---|
| **« Mon dossier » du patient séparé en trois menus** : *Mes informations* (informations personnelles, documents, ajout de documents, changement de mot de passe), *Mes médecins* et *Mes rendez-vous*. Le médecin et l'administrateur gardent *Mon profil* | menu du patient |
| **Mes rendez-vous** : les rendez-vous **en cours et à venir** s'affichent en premier, puis les rendez-vous **passés, refusés ou annulés**, que l'on peut **masquer / afficher**. Sous chaque rendez-vous, le patient lit le **commentaire et les pathologies** saisis par son médecin à cette occasion (un commentaire non rattaché à un rendez-vous apparaît dans « Autres commentaires »). Un rendez-vous passé ne propose plus « Annuler » | *Mes rendez-vous* (patient) |
| **Prise de rendez-vous à la demande** : aucun médecin n'est affiché d'office. Le patient clique sur « Prendre un rendez-vous », puis cherche par nom ou spécialité (ou clique sur « Afficher tous les médecins »). « Prendre rendez-vous » depuis *Mes médecins* présélectionne le médecin | *Mes rendez-vous* (patient) |
| **« Mot de passe oublié » à la connexion**, avec **e-mail contenant un lien** : le lien ouvre une page où l'on saisit et confirme le nouveau mot de passe, enregistré (haché) en base. Le lien est **valable 1 heure, à usage unique** ; une nouvelle demande annule la précédente ; la réponse est identique que l'adresse existe ou non ; un e-mail de confirmation prévient l'utilisateur de la modification. Le jeton n'est **jamais stocké** (seule son empreinte SHA-256 l'est). *La réinitialisation par l'administrateur depuis la fiche d'un utilisateur est supprimée.* Changer son mot de passe en le connaissant reste possible dans *Mes informations* / *Mon profil* | page de connexion |

**Envoi des e-mails : à configurer pour le déploiement.** L'hébergement **gratuit de Render bloque les ports SMTP** (25, 465, 587) : l'API envoie donc ses e-mails par l'**API HTTPS de Resend** (<https://resend.com>, offre gratuite). Pour activer l'envoi, ajoutez dans Render → service `mmadi-sante-api` → *Environment* : `RESEND_API_KEY` (clé créée dans Resend) et `MAIL_FROM`. Avec l'expéditeur par défaut (`onboarding@resend.dev`), Resend n'écrit **qu'à l'adresse de votre propre compte Resend** : pour écrire à de vrais utilisateurs, **vérifiez un domaine** dans Resend et utilisez une adresse de ce domaine dans `MAIL_FROM`. Sans `RESEND_API_KEY`, la demande est acceptée mais **aucun e-mail ne part** (en local, le lien s'affiche dans la console de l'API, pratique pour tester).

**Mise à jour d'une base en service.** Au démarrage, l'API applique la migration `0005_mot_de_passe_oublie` (rejouable sans risque : crée la table `reinitialisations_mot_de_passe` et active la protection RLS de Supabase, qui manquait encore sur `commentaires_patients`). En cas d'erreur dans les logs, collez `database/mise_a_jour_v4.sql` dans l'éditeur SQL de Supabase.

---

## Nouveautés de la version 3

| Évolution | Où la trouver |
|---|---|
| **Mes patients** (médecin) : recherche, tri, prochain et dernier rendez-vous, nombre de commentaires, clic sur toute la ligne pour ouvrir la fiche, liens directs vers les rendez-vous et les commentaires (aucune information sur les documents) | menu *Mes patients* |
| **Documents datés, récents / historique** : chaque document affiche sa date de dépôt, « il y a N jours » et qui l'a déposé ; les documents de moins de **30 jours** sont regroupés sous *Récents*, les autres sous *Historique* | fiche d'un patient (**administrateur**) et *Mon dossier* du patient (le médecin n'y a pas accès) |
| **Choisir un médecin par spécialité** : filtre « spécialité » (avec l'effectif de chaque spécialité) avant la liste des médecins à attribuer | fiche d'un patient, côté administrateur (*Médecins attribués*) |
| **Mon profil en lecture** : les informations s'affichent en lecture ; « Modifier mes informations » ouvre le formulaire ; « Enregistrer » ou « Annuler » ramène à la lecture. Le numéro de carte d'identité est masqué en lecture | *Mon profil* / *Mon dossier* (tous les profils) |
| **Commentaires et pathologies, liés à un rendez-vous** : un médecin ne peut commenter qu'un **rendez-vous avec son patient, confirmé et déjà commencé**, un seul commentaire par rendez-vous (modifiable, supprimable par son auteur). Le patient les lit dans *Mon dossier* avec le rendez-vous concerné ; l'administrateur les voit ; **un confrère ne les voit pas** | fiche du patient et détail du rendez-vous (médecin) · *Mon dossier* (patient) |
| **Dépôt de documents par le médecin** dans la fiche de ses patients (PDF, JPG, PNG). Le patient les voit avec la date et le nom du médecin. **Le médecin ne peut ensuite ni les rouvrir ni voir les documents du patient** : il garde seulement un accusé de dépôt (nom, date, sans contenu) | fiche du patient (médecin) · *Mon dossier* (patient) |
| ~~Administrateur : changer le mot de passe d'un utilisateur~~ | **remplacé en V4** par « Mot de passe oublié » à la connexion (voir ci-dessous) |
| **Administrateur : accès par clic à tous les rendez-vous** : la tuile *Rendez-vous* de l'accueil administrateur ouvre la liste, et « Ouvrir » affiche le détail d'un rendez-vous (patient, médecin, statut, actions, liens vers les fiches). Disponible aussi pour le patient et le médecin concernés | accueil administrateur · *Rendez-vous* |

**Confidentialité des documents (V3).** Les documents d'un patient (déposés par lui ou par un médecin) ne sont accessibles qu'au **patient** et à l'**administrateur** ; l'API répond 403 à un médecin, même attribué, même pour son propre dépôt.

**Règles de suppression des documents (V3).** Un document déposé **par le patient** : supprimable par lui et par l'administrateur. Un document déposé **par un médecin** dans la fiche du patient : supprimable par ce médecin et par l'administrateur, **pas par le patient** (il fait partie du dossier médical). Si le médecin est supprimé, ses documents et commentaires restent, avec son nom.

**Mise à jour d'une base en service.** Rien à faire : au démarrage, l'API applique la migration `0004_commentaires_documents_medecin` (rejouable sans risque, aucune donnée existante n'est modifiée ni supprimée). Si les logs affichent une erreur, collez `database/mise_a_jour_v3.sql` dans l'éditeur SQL de Supabase. Une nouvelle base créée avec `database/schema.sql` contient déjà tout.

---

## Médecins, spécialités et rendez-vous

**Spécialités.** Une liste prédéfinie de **59 spécialités et professions** est créée automatiquement avec la base : médecine générale et spécialités courantes, spécialités chirurgicales, santé de la femme et de l'enfant, spécialités médico-techniques et **autres professionnels de santé** (chirurgien-dentiste, sage-femme, kinésithérapeute, pharmacien…). Chaque spécialité a un **type** (`MÉDECIN` ou `PROFESSIONNEL DE SANTÉ`) qui permet de distinguer les médecins des autres professionnels.
L'administrateur la gère dans le menu **Spécialités** : ajouter, modifier, **désactiver / réactiver**. Une spécialité n'est jamais supprimée : désactivée, elle disparaît des listes de choix mais reste sur les fiches qui l'avaient déjà.

**Fiche médecin.** Nom, prénom, téléphone, e-mail (facultatif pour une fiche sans compte), **adresse professionnelle** (facultative) et **une ou plusieurs spécialités**, choisies dans une liste déroulante **avec recherche** (accents et majuscules ignorés, flèches du clavier). L'administrateur la renseigne à la création du compte (case « fiche sans compte de connexion » pour un médecin qui n'utilisera pas l'application) et peut la modifier ensuite ; un médecin peut aussi tenir sa propre fiche depuis « Mon profil ».

**Prendre rendez-vous (patient)** : menu **Rendez-vous**.
1. *Le médecin est dans la base* : recherche par nom ou spécialité, fiche affichée (nom, spécialités, téléphone, adresse professionnelle), « Choisir ce médecin », date et heure, motif. Une case facultative permet d'**autoriser ce médecin à consulter le dossier** ; sans elle, il ne voit pas les documents.
2. *Le médecin n'y est pas* : « Ajouter un médecin absent de la liste » (nom, prénom, téléphone, spécialité, adresse). **Avant toute création, l'application vérifie les doublons** : même téléphone (quel que soit le format, `+33 6…` ou `06…`) → création refusée et fiche existante proposée ; même nom et prénom (ordre indifférent) → alerte « homonyme », création possible seulement après confirmation. Si le médecin est vraiment absent, sa **fiche est créée automatiquement** (sans compte de connexion), **associée au patient** (« Mes médecins ») et au rendez-vous, en une seule opération protégée contre les créations simultanées.

Un rendez-vous a un statut : *en attente*, *confirmé*, *refusé*, *annulé*. Le médecin confirme ou refuse ; le patient annule les siens ; l'administrateur voit tout. Si le médecin n'a pas de compte, le patient est invité à le contacter par téléphone.

**« Mes médecins »** (menu du patient, depuis la V4) affiche pour chaque médecin associé : nom complet, spécialités, **téléphone bien visible (appel en un clic)** et adresse professionnelle (lien carte), avec « Prendre rendez-vous » et « Retirer ». Toutes ces informations sont **relues dans la fiche en base à chaque affichage** : modifier une fiche la met à jour partout, sans ressaisie. Côté administrateur, choisir un médecin à attribuer à un patient affiche d'abord sa fiche complète.

---

## Comptes de démonstration

> Les comptes ci-dessous ne sont **plus affichés sur l'écran de connexion** du site : la page ne propose que le formulaire normal. Ils servent uniquement aux essais, en local ou juste après une installation neuve.

Mot de passe **commun** à tous les comptes : `MmadiDemo2026!`

| Profil | E-mail | Remarque |
|---|---|---|
| Administrateur | `admin@mmadisante.demo` | voit et gère tout |
| Médecin | `medecin@mmadisante.demo` | suit **uniquement** Amina Mmadi |
| Patient | `patient@mmadisante.demo` | Amina Mmadi |
| Patient | `patient2@mmadisante.demo` | Paul Durand — **non suivi** par le médecin démo (pour constater le blocage d'accès) |

> ⚠ Ces identifiants sont publics (écrits dans ce fichier). Sur un site accessible depuis Internet, supprimez-les : voir [Supprimer les comptes de démonstration](#6-sécuriser-après-la-démonstration).

---

## Installation locale

### Prérequis

- **Node.js 18.18 ou plus récent** (version « LTS » sur <https://nodejs.org>)
- **PostgreSQL** : soit Docker (le plus simple), soit une installation classique de PostgreSQL
- Sous **Windows** : ouvrez les commandes dans **Git Bash** (installé avec [Git](https://git-scm.com/downloads)) ou dans WSL. Les scripts `.sh` ne fonctionnent pas dans l'invite de commandes classique.

### Méthode A — avec les scripts guidés (recommandée si vous n'êtes pas développeur)

Depuis le dossier du projet :

```bash
bash scripts/0-verifier-prerequis.sh   # vérifie votre ordinateur
bash scripts/1-configurer.sh           # choisissez « 2 » (PostgreSQL local) : crée backend/.env et les clés secrètes
bash scripts/2-schema.sh               # crée les tables
bash scripts/3-seed.sh                 # crée les comptes de démonstration
bash scripts/demarrer-local.sh         # lance l'API et le site
```

Puis ouvrez **<http://localhost:3000>**. `Ctrl+C` arrête tout.

> Au choix « 2 » de l'étape 1, si Docker est installé, le script propose de démarrer lui-même la base PostgreSQL de test.

### Méthode B — étapes manuelles exactes

**1. Démarrer PostgreSQL** (au choix) :

```bash
docker compose up -d          # base « mmadisante », utilisateur « mmadi », mot de passe « mmadi »
```

ou, avec un PostgreSQL déjà installé : créez une base vide `mmadisante` et un utilisateur ayant tous les droits dessus.

**2. L'API** (dans un premier terminal) :

```bash
cd backend
cp .env.example .env          # puis ouvrez .env et remplacez JWT_SECRET et ENCRYPTION_KEY (voir les commentaires du fichier)
npm install
npx prisma generate           # prépare l'accès à la base
npx prisma migrate deploy     # crée les tables
npm run seed                  # crée les comptes de démonstration
npm run dev                   # API sur http://localhost:4000/api/v1  (test : http://localhost:4000/api/v1/sante)
```

> Les valeurs par défaut de `.env.example` correspondent à la base Docker ci-dessus. Générez des clés secrètes avec `openssl rand -base64 48` (ou `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`).

**3. Le site** (dans un second terminal) :

```bash
cd frontend
cp .env.example .env.local    # contient NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
npm install
npm run dev                   # site sur http://localhost:3000
```

> ⚠ **`NEXT_PUBLIC_API_URL` doit inclure le chemin complet `/api/v1`** (`http://localhost:4000/api/v1`, et non `http://localhost:4000`).

**4. Lancer les tests automatisés** (facultatif) :

```bash
cd backend
npm test
```

Les tests utilisent la base indiquée par `DATABASE_URL`, relancent le seed démo et créent puis suppriment des comptes `test-…`. **Utilisez une base de test**, pas une base contenant des données à conserver.

---

## Déploiement cloud (Render + Supabase)

### Vue d'ensemble

```
Navigateur ──► Site web (Render, site statique) ──► API (Render, service web) ──► Base PostgreSQL (Supabase)
                       jamais en veille                  en veille si inactive          fichiers inclus
```

- **Supabase** héberge la base PostgreSQL (gratuite, 500 Mo). Les fichiers des utilisateurs y sont stockés (colonne `bytea`), d'où la limite de 5 Mo par fichier.
- **Render** héberge l'API et le site, déclarés par `render.yaml`.

### Ports de la base Supabase : 5432 ou 6543 ?

| Variable | Port | Chaîne Supabase | Utilisée pour |
|---|---|---|---|
| `DATABASE_URL` | **6543** | « Transaction pooler » + `?pgbouncer=true` à la fin | **fonctionnement** de l'API (runtime) |
| `DIRECT_URL` | **5432** | « Direct connection » ou « Session pooler » | **migrations** (création des tables) |

Les migrations Prisma **ne fonctionnent pas** via le port 6543. Inversement, l'API en fonctionnement utilise le pooler (6543) pour économiser les connexions. Le script `1-configurer.sh` vérifie ces deux ports et ajoute `?pgbouncer=true` automatiquement.

### Tout en une commande

```bash
bash scripts/deployer-tout.sh
```

Il enchaîne les étapes 0 à 4 ci-dessous en vous guidant. Chaque étape existe aussi seule, et peut être relancée sans risque.

### Pas à pas

#### 1. Créer le projet Supabase et lier l'application

1. Créez un compte sur <https://supabase.com>, puis un projet (« New project »). **Notez le mot de passe de base de données** choisi : il ne sera plus affiché.
2. Sur la page du projet, cliquez sur **« Connect »** : vous y trouvez les chaînes de connexion (les libellés peuvent légèrement varier d'une version à l'autre de Supabase) :
   - « **Transaction pooler** » (port 6543) → ce sera `DATABASE_URL`
   - « **Direct connection** » ou « **Session pooler** » (port 5432) → ce sera `DIRECT_URL`
3. Lancez :
   ```bash
   bash scripts/1-configurer.sh        # choisissez « 1 » (Supabase) et collez les 2 adresses
   ```
   Le script remplace `[YOUR-PASSWORD]` pour vous (en encodant correctement les caractères spéciaux), vérifie les ports, génère `JWT_SECRET` et `ENCRYPTION_KEY`, puis écrit `backend/.env`.

> **Si votre connexion n'est pas en IPv6** (cas fréquent à la maison ou en entreprise), la « Direct connection » de Supabase peut être injoignable : prenez alors la chaîne « **Session pooler** » (port 5432 aussi) pour `DIRECT_URL`.

#### 2. Créer les tables

```bash
bash scripts/2-schema.sh
```

Le script essaie d'abord les migrations Prisma. **Si le réseau bloque le téléchargement des binaires Prisma** (erreur `403 Forbidden` sur `binaries.prisma.sh`), il bascule automatiquement sur `database/schema.sql`, soit avec `psql` s'il est installé, soit en vous guidant pour le **coller dans l'éditeur SQL de Supabase** : *SQL Editor → New query → coller → Run*. Le contenu du fichier est même copié dans votre presse-papiers quand c'est possible.

Le script SQL est **idempotent** (relançable sans danger) et produit exactement la même base que les migrations Prisma. Il active aussi la sécurité **Row Level Security** pour que les tables ne soient pas exposées par l'API REST publique de Supabase.

#### 3. Créer les comptes de démonstration

```bash
bash scripts/3-seed.sh
```

Même principe : seed Prisma, ou repli automatique sur `database/seed_demo.sql` (à coller dans l'éditeur SQL si besoin).

#### 4. Déployer sur Render

Render lit votre code sur **GitHub**. Préparez un compte GitHub et un **dépôt vide** (<https://github.com/new>, sans README), puis un compte Render (<https://render.com>).

```bash
bash scripts/4-deployer-render.sh
```

Le script prépare le dépôt Git (en **refusant** d'y inclure un fichier `.env`), l'envoie sur GitHub, puis affiche **le lien à ouvrir** et **les valeurs à copier** dans Render :

| Service Render | Variable | Valeur |
|---|---|---|
| `mmadi-sante-api` | `DATABASE_URL` | chaîne du pooler, port 6543, avec `?pgbouncer=true` |
| `mmadi-sante-api` | `DIRECT_URL` | chaîne directe ou « Session pooler », port 5432 |
| `mmadi-sante-api` | `FRONTEND_URL` | `https://mmadi-sante-web.onrender.com` (sans `/` final) |
| `mmadi-sante-web` | `NEXT_PUBLIC_API_URL` | `https://mmadi-sante-api.onrender.com`**`/api/v1`** |

`JWT_SECRET` et `ENCRYPTION_KEY` sont générés automatiquement par Render.

> ⚠ **L'URL de l'API côté site doit contenir son chemin complet `/api/v1`.** Sans lui, tous les appels répondent « 404 ». Le site ajoute le chemin manquant par sécurité (avec un avertissement dans la console du navigateur), mais corrigez la variable.
>
> ⚠ `NEXT_PUBLIC_API_URL` est **figée à la construction du site** : après l'avoir modifiée, relancez « Manual Deploy → Deploy latest commit » sur `mmadi-sante-web`.

Cliquez ensuite sur **Apply** (5 à 10 minutes pour le premier déploiement). Au démarrage, l'API applique elle-même les migrations (`DIRECT_URL`), puis écoute.

> **Adresses réelles** : si un nom de service est déjà pris, Render y ajoute un suffixe (ex. `mmadi-sante-api-x7k2.onrender.com`). Vérifiez l'adresse affichée en haut de chaque service et corrigez `FRONTEND_URL` / `NEXT_PUBLIC_API_URL` si besoin. `bash scripts/afficher-valeurs-render.sh NOM-API NOM-SITE` réaffiche les valeurs adaptées.

#### 5. Vérifier

1. Ouvrez `https://<votre-api>.onrender.com/api/v1/sante` → vous devez voir `{"statut":"ok","baseDeDonnees":"ok"}`.
2. Ouvrez `https://<votre-site>.onrender.com` et connectez-vous (compte de démonstration si vous les avez créés, sinon votre compte administrateur).

#### 6. Sécuriser après la démonstration

Le site n'affiche plus les comptes de démonstration, mais **ils existent toujours dans la base** avec un mot de passe public. Pour les retirer, **dans cet ordre** :

1. Connectez-vous avec `admin@mmadisante.demo`, menu *Utilisateurs* → « + Nouvel utilisateur » → profil **Administrateur** : créez **votre propre** compte administrateur, puis vérifiez que vous pouvez vous connecter avec.
2. Supprimez les 4 comptes de démonstration, au choix :
   - **SQL (le plus simple)** : collez `database/supprimer_comptes_demo.sql` dans l'éditeur SQL de Supabase. L'étape 1 du script montre ce qui sera supprimé, l'étape 2 supprime.
   - **ou en ligne de commande** : `cd backend`, puis `npm run supprimer-demo` (aperçu, ne supprime rien), puis `npm run supprimer-demo -- --oui`.

Les deux méthodes reconnaissent les comptes par leur **adresse e-mail exacte** (`admin@`, `medecin@`, `patient@`, `patient2@` + `mmadisante.demo`), refusent de s'exécuter s'il ne reste aucun autre administrateur, et ne touchent à **aucun autre compte**. Les documents et rendez-vous de ces 4 comptes sont supprimés avec eux.

### Plans gratuits : ce qu'il faut savoir

- ⏱ **L'API Render gratuite se met en veille après environ 15 minutes sans visite.** La première requête suivante prend 30 à 60 secondes : le site affiche alors « le serveur se réveille » et réessaie tout seul. Le **site**, lui, est statique : il n'est jamais mis en veille.
- ⏸ **Un projet Supabase gratuit est mis en pause après 7 jours sans activité** : réactivez-le depuis le tableau de bord (« Restore project »).
- 💾 La base gratuite est limitée à 500 Mo : les fichiers y étant stockés, elle se remplit vite. Pour un usage durable, déplacez les fichiers vers Supabase Storage.

### Autre hébergeur (Railway, etc.)

Aucun fichier de configuration n'est fourni pour Railway. Le principe reste le même : un service Node pour `backend/` (build : `npm install && npx prisma generate`, démarrage : `npm start`), un hébergement statique pour le dossier `frontend/out` produit par `npm run build`, et les mêmes variables d'environnement (voir ci-dessous).

---

## Mettre à jour une application déjà en ligne

1. Remplacez les fichiers du projet par ceux de la nouvelle version (**sans** écraser vos fichiers `.env`).
2. Envoyez-les sur GitHub (`git add -A`, `git commit -m "Version 3"`, `git push origin main`) : Render redéploie l'API et le site automatiquement (`autoDeploy`).
3. **La base de données se met à jour toute seule** au démarrage de l'API (V3 : table `commentaires_patients` et colonnes `depose_par_medecin_id` / `depose_par_nom` des documents ; V2 : création des tables `specialites`, `medecin_specialites` et `rendez_vous`, ajout des colonnes de la fiche médecin et de la liste des 59 spécialités. Cette mise à jour **n'efface et ne modifie aucune donnée existante** (comptes, documents, attributions) et peut être rejouée sans risque. Dans les logs de l'API, vous verrez soit `prisma migrate deploy` réussir, soit `Mise à jour de la base appliquée : 0003_specialites_rendez_vous`.
4. Si les logs affichent « ERREUR pendant la mise à jour de la base », collez `database/mise_a_jour_v2.sql`, puis `mise_a_jour_v3.sql`, puis `mise_a_jour_v4.sql` dans l'éditeur SQL de Supabase (même effet, à la main ; collez seulement ceux qui manquent à votre base), puis relancez le déploiement.
5. **V4 : pour que le lien « mot de passe oublié » parte par e-mail**, ajoutez `RESEND_API_KEY` et `MAIL_FROM` à l'API (voir « Nouveautés de la version 4 »). Sans cela, tout le reste fonctionne mais aucun e-mail n'est envoyé. Vous pouvez supprimer `NEXT_PUBLIC_AFFICHER_COMPTES_DEMO` du service `mmadi-sante-web` : elle n'est plus utilisée.

> Si vous avez défini `SKIP_MIGRATE=true` sur l'API, retirez-le pour que la mise à jour s'applique.

---

## Variables d'environnement

Chaque variable est documentée en détail dans `backend/.env.example` et `frontend/.env.example`.

| Variable | Où | Rôle |
|---|---|---|
| `DATABASE_URL` | API | connexion de l'API à la base (Supabase : pooler, **6543**, `?pgbouncer=true`) |
| `DIRECT_URL` | API | connexion pour les migrations (Supabase : **5432**) ; en local, identique à `DATABASE_URL` |
| `JWT_SECRET` | API | clé de signature des connexions (32 caractères minimum) |
| `ENCRYPTION_KEY` | API | clé de chiffrement du numéro de carte d'identité (**ne jamais la perdre**) |
| `FRONTEND_URL` | API | adresse du site autorisé à appeler l'API (CORS) ; obligatoire en production |
| `JWT_EXPIRES_IN` | API | durée d'une connexion (`8h` par défaut) |
| `MAX_FILE_MB` | API | taille maximale par fichier (5 par défaut) |
| `NODE_ENV` | API | `production` sur l'hébergeur |
| `RESEND_API_KEY` | API | clé de l'API d'e-mail Resend (lien « mot de passe oublié »). Sans elle : aucun e-mail envoyé |
| `MAIL_FROM` | API | expéditeur des e-mails (domaine vérifié dans Resend) |
| `APP_URL` | API | adresse du site dans les liens des e-mails (par défaut : la première adresse de `FRONTEND_URL`) |
| `RESET_LINK_MINUTES` | API | validité du lien de réinitialisation (60 par défaut) |
| `SKIP_MIGRATE` | API | `true` pour ne pas lancer les migrations au démarrage |
| `PRISMA_ADAPTER_PG` | API | mode « sans binaire » (avancé, voir plus bas) |
| `NEXT_PUBLIC_API_URL` | site | adresse de l'API **avec `/api/v1`** (figée au build) |

---

## Sécurité : ce qui est en place

- **Contrôle d'accès côté serveur** sur chaque route (`backend/src/lib/acces.js`, `middleware/auth.js`). Le rôle n'est jamais lu dans le jeton : il est relu en base à chaque requête, donc un compte supprimé perd son accès immédiatement.
- **Inscription publique = PATIENT uniquement**, quel que soit ce que le client envoie. Les comptes médecin et administrateur sont créés par un administrateur.
- **Mots de passe hachés avec bcrypt** (coût 12, via `bcryptjs`, implémentation JavaScript du même algorithme, sans compilation native), **authentification par jeton JWT**.
- **Numéro de carte d'identité chiffré en base** (AES-256-GCM) ; le hash du mot de passe et le contenu des fichiers ne sont jamais renvoyés dans les listes.
- **Fichiers** : PDF, JPG, PNG uniquement, 5 Mo maximum, **signature binaire vérifiée** (un faux PDF est refusé), 50 documents par utilisateur, téléchargement uniquement via une route protégée.
- Limitation des tentatives de connexion, en-têtes de sécurité (Helmet), CORS restreint au site déclaré, validation stricte de toutes les entrées.
- **Supabase** : Row Level Security activée sans politique sur les 3 tables, pour qu'elles ne soient pas lisibles via l'API REST publique.
- Le dépôt exclut tous les fichiers `.env` ; le script de déploiement vérifie qu'aucun n'est envoyé.

---

## API : routes principales

Toutes sous `/api/v1`. Authentification par l'en-tête `Authorization: Bearer <jeton>`.

| Méthode et route | Profil autorisé | Rôle |
|---|---|---|
| `GET /sante` | public | état de l'API et de la base |
| `POST /auth/inscription` | public | crée un compte **patient** |
| `POST /auth/connexion` | public | connexion, renvoie le jeton |
| `POST /auth/mot-de-passe-oublie` | public | demande l'envoi du lien de réinitialisation (réponse identique si l'e-mail est inconnu ; 5 demandes / heure / IP) |
| `POST /auth/mot-de-passe-oublie/verifier` | public | le lien reçu est-il encore valable ? |
| `POST /auth/reinitialiser-mot-de-passe` | public (jeton du lien) | enregistre le nouveau mot de passe ; lien à usage unique |
| `GET /auth/moi` | connecté | compte courant |
| `GET` / `PUT /profil` | connecté | lire / modifier **ses** informations |
| `PUT /profil/mot-de-passe` | connecté | changer son mot de passe |
| `GET` / `POST /profil/documents` | connecté | lister / envoyer **ses** documents (champ `fichiers`, 5 max) |
| `GET /documents/:id` | propriétaire, admin (jamais un médecin) | télécharger un document |
| `DELETE /documents/:id` | propriétaire (documents qu'il a déposés), médecin dépositaire, admin | supprimer un document |
| `POST /utilisateurs/:id/documents` | **médecin attribué** | déposer un ou plusieurs documents dans la fiche d'un patient (V3) |
| `POST /commentaires` (`rendezVousId`), `PUT` / `DELETE /commentaires/:id` | **médecin** (auteur du rendez-vous) | commentaire de pathologies lié à un rendez-vous confirmé et commencé (V3) |
| `GET /rendez-vous/:id` | patient / médecin concernés, admin | détail d'un rendez-vous (V3) |
| `GET /profil/commentaires` | patient | lire les commentaires de **ses** médecins (V3) |
| `GET /utilisateurs/:id` | soi, médecin attribué, admin | fiche ; documents (patient, admin) ou accusés de dépôt (médecin) ; commentaires visibles par le demandeur |
| `GET /medecin/patients` | médecin | **ses** patients attribués, avec prochain/dernier rendez-vous et nombre de commentaires (V3) |
| `GET /specialites` (`?toutes=true` : admin) | connecté | liste des spécialités actives |
| `POST /specialites`, `PUT /specialites/:id` | admin | ajouter, modifier, désactiver / réactiver (`actif`) |
| `GET /medecins?q=&specialiteId=&type=`, `GET /medecins/:id` | patient, admin | annuaire des médecins (jamais l'e-mail ni le hash) |
| `POST /medecins/verifier` | patient, admin | un médecin existe-t-il déjà ? (téléphone, nom) |
| `PUT /profil` (`adresseProfessionnelle`, `specialiteIds`) | **médecin** pour ces champs | tenir sa fiche professionnelle |
| `GET /profil/medecins`, `DELETE /profil/medecins/:id` | patient | **mes** médecins (fiche complète) / retirer l'accès |
| `GET /rendez-vous` | connecté | patient : les siens · médecin : ceux qui le concernent · admin : tous |
| `POST /rendez-vous` | patient | `medecinId` **ou** `nouveauMedecin` (vérification anti-doublon + création) |
| `GET /rendez-vous/:id` | patient / médecin concernés, admin | détail d'un rendez-vous (V3) |
| `PATCH /rendez-vous/:id/statut` | patient (annuler les siens), médecin (confirmer/refuser/annuler les siens), admin | changer le statut |
| `PUT /admin/medecins/:id` | admin | modifier la fiche d'un médecin |
| `GET /admin/statistiques`, `/admin/utilisateurs`, `/admin/documents`, `/admin/attributions` | admin | consultation globale |
| `POST /admin/utilisateurs` | admin | créer un compte de n'importe quel profil (médecin : spécialités, adresse pro, option « sans compte ») |
| `DELETE /admin/utilisateurs/:id` | admin | supprimer un utilisateur (et ses documents) |
| `POST` / `DELETE /admin/attributions` | admin | attribuer / retirer un patient d'un médecin |

---

## En cas d'erreur

### Installation et base de données

**`Failed to fetch sha256 checksum … binaries.prisma.sh … 403 Forbidden`** (au `prisma generate` ou `prisma migrate deploy`)
Votre réseau (entreprise, école, proxy) bloque le téléchargement des outils Prisma. **Ce n'est pas grave** : utilisez le chemin SQL. `bash scripts/2-schema.sh` et `3-seed.sh` basculent seuls dessus ; à la main, collez `database/schema.sql` puis `database/seed_demo.sql` dans l'éditeur SQL de Supabase. Sur Render, le téléchargement fonctionne normalement.
*Avancé (Linux/macOS, pour lancer l'API en local malgré tout)* : `PRISMA_CLIENT_ENGINE_TYPE=client PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate`, puis ajoutez `PRISMA_ADAPTER_PG=true` dans `backend/.env`.

**`P1001 : Can't reach database server`**
- Sur Supabase, la « Direct connection » (`db.xxxx.supabase.co`) est en **IPv6** : prenez la chaîne « **Session pooler** » (port 5432) pour `DIRECT_URL`.
- Vérifiez que le projet Supabase n'est pas **en pause** (gratuit : pause après 7 jours d'inactivité).

**`P1000 : Authentication failed`**
Mot de passe erroné. Réinitialisez-le dans Supabase (*Project Settings → Database → Reset database password*) puis relancez `bash scripts/1-configurer.sh`. S'il contient des caractères spéciaux (`@ : / # ? %`), laissez le script l'encoder : ne le collez pas à la main dans l'URL.

**`prepared statement "s0" already exists`** (ou erreurs de « prepared statement »)
`DATABASE_URL` passe par le pooler (6543) sans `?pgbouncer=true`. Ajoutez-le à la fin de l'adresse.

**`P3005 : The database schema is not empty`**
Les tables ont été créées avec `schema.sql` : sans conséquence. L'API détecte que les tables existent et démarre ; vous pouvez aussi ajouter `SKIP_MIGRATE=true`.

**Les migrations échouent alors que `DATABASE_URL` fonctionne**
`DIRECT_URL` utilise le port 6543. Les migrations exigent le port **5432**.

### Déploiement Render

**Le build de l'API échoue ou l'API ne démarre pas** : ouvrez l'onglet **Logs** du service. Message `Variable d'environnement manquante : …` → renseignez-la dans *Environment*. Message `FRONTEND_URL est obligatoire en production` → renseignez l'adresse du site.

**Le site s'affiche mais « Impossible de joindre le serveur »**
Sur le plan gratuit, l'API **dort** : patientez une minute (le site réessaie seul). Si le problème persiste : ouvrez `https://<votre-api>.onrender.com/api/v1/sante`.

**Le navigateur affiche une erreur « CORS » (console, touche F12)**
`FRONTEND_URL` ne correspond pas exactement à l'adresse du site : pas de `/` final, `https` et non `http`, bon suffixe Render. Corrigez-la dans l'API, elle redémarre seule.

**Toutes les requêtes répondent « 404 » ou « Route introuvable »**
`NEXT_PUBLIC_API_URL` n'a pas son chemin complet. Elle doit finir par **`/api/v1`**. Corrigez-la puis relancez un déploiement du site.

**Après déploiement, le site appelle encore `localhost:4000`**
`NEXT_PUBLIC_API_URL` n'était pas définie au moment de la construction. Définissez-la puis « Manual Deploy → **Clear build cache & deploy** ».

**Les numéros de carte d'identité n'apparaissent plus**
`ENCRYPTION_KEY` a changé. Rétablissez l'ancienne valeur ; les numéros chiffrés avec une autre clé ne sont pas récupérables.

### Scripts

**`$'\r': command not found`** (Windows) : les fins de ligne ont été converties. Lancez `sed -i 's/\r$//' scripts/*.sh`, ou re-clonez le dépôt (le fichier `.gitattributes` l'évite).

**`Permission denied`** : lancez les scripts avec `bash scripts/nom.sh` (au lieu de `./scripts/nom.sh`).

**`git push` refusé** : le dépôt GitHub doit être **vide**. En HTTPS, GitHub n'accepte pas votre mot de passe de compte : créez un *Personal access token (classic)* avec la case `repo` (<https://github.com/settings/tokens>) et utilisez-le comme mot de passe.

### Utilisation

**« Session invalide ou expirée »** : une connexion dure 8 h (`JWT_EXPIRES_IN`) ; reconnectez-vous.
**« Fichier refusé »** : seuls les vrais PDF, JPG et PNG de 5 Mo maximum sont acceptés.
**« Ce médecin existe déjà »** lors de la création d'un médecin absent : c'est le contrôle anti-doublon. Sélectionnez la fiche proposée ; si c'est un homonyme (même nom, autre téléphone), confirmez qu'il s'agit d'un autre médecin.
**La liste déroulante des spécialités est vide** : l'administrateur a désactivé toutes les spécialités, ou la mise à jour de la base n'a pas été appliquée (voir [Mettre à jour](#mettre-à-jour-une-application-déjà-en-ligne)).
**Un rendez-vous reste « en attente »** : le médecin doit le confirmer. S'il n'a pas de compte (fiche créée par un patient), c'est à l'administrateur de le confirmer après contact téléphonique.
**Un médecin ne voit aucun patient** : c'est normal tant que l'administrateur ne lui en a pas attribué (fiche du patient → « Médecins attribués »).

---

## Limites et pistes d'amélioration

- **Hébergement de données de santé (HDS)** : indispensable en France pour de vraies données de patients ; non couvert par Render/Supabase.
- **Rendez-vous** : demandes à date et heure libres, sans agenda de disponibilités du médecin, sans rappel par e-mail ni SMS ; seuls les créneaux déjà **confirmés** bloquent un autre patient.
- **Fiches créées par les patients** : n'importe quel patient peut ajouter un médecin absent de la base (limité à 15 créations par heure et par adresse IP). L'administrateur peut corriger ou supprimer ces fiches ; il n'y a pas de validation préalable.
- **Pas de journal d'audit** des consultations (qui a lu quel dossier) : à ajouter avant un usage réel.
- **Pas de réinitialisation de mot de passe par e-mail ni de vérification d'adresse e-mail.**
- Le jeton de connexion est conservé dans le navigateur (`localStorage`) : simple, mais moins protégé qu'un cookie `HttpOnly` face à une faille XSS.
- Les fichiers sont dans la base (demandé pour ce projet) : peu adapté à de gros volumes ; envisagez Supabase Storage.
- Le déploiement sur Render et Supabase n'a pas pu être exécuté depuis l'environnement de développement de ce projet : les scripts, la base, l'API et le site ont été testés en local (voir le récapitulatif de livraison). Le premier déploiement réel peut demander un ajustement des adresses (suffixes Render), expliqué plus haut.
