#!/usr/bin/env bash
# ============================================================================
#  ÉTAPE 1 — Lier l'application à votre base de données et créer les clés secrètes
#  Lancer :  bash scripts/1-configurer.sh
#
#  Ce que fait ce script :
#    1. vous guide pour récupérer les 2 adresses de connexion Supabase (ou configure un PostgreSQL local) ;
#    2. vérifie qu'elles sont correctes (bon port, mot de passe renseigné...) ;
#    3. génère vos clés secrètes (JWT_SECRET et ENCRYPTION_KEY) ;
#    4. écrit le fichier backend/.env (et frontend/.env.local pour l'usage en local).
#  Vous pouvez le relancer autant de fois que nécessaire (l'ancien .env est sauvegardé).
# ============================================================================
set -u
source "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"

node_assez_recent || arreter "Node.js 18.18 minimum est requis. Lancez d'abord :  bash scripts/0-verifier-prerequis.sh"

# --- Fonctions de cette étape -------------------------------------------------------
# Remplace [YOUR-PASSWORD] par le mot de passe, correctement encodé pour une URL (@ : / # ? ...).
injecter_mot_de_passe() {
  URL_IN="$1" MDP_IN="$2" node -e '
    const enc = encodeURIComponent(process.env.MDP_IN);
    const re = /\[(YOUR-PASSWORD|VOTRE-MOT-DE-PASSE|PASSWORD|MOT-DE-PASSE)\]/i;
    process.stdout.write(process.env.URL_IN.replace(re, () => enc));
  '
}

# Génère une valeur secrète aléatoire (openssl si présent, sinon Node.js).
secret_aleatoire() {
  if commande_existe openssl; then openssl rand -base64 "$1" | tr -d '\n'
  else node -e "process.stdout.write(require('crypto').randomBytes($1).toString('base64'))"; fi
}

url_valide() { [[ "$1" =~ ^postgres(ql)?://[^[:space:]]+@[^[:space:]]+/[^[:space:]]+$ ]]; }

titre "Configuration de MmadiSanté"
echo "Où se trouve votre base de données PostgreSQL ?"
echo "  1) Supabase (cloud, gratuit)            ← recommandé pour la mise en ligne"
echo "  2) Un PostgreSQL sur mon ordinateur      ← pour tester en local (ex. avec Docker)"
demander "Votre choix (1 ou 2)" "1"
CHOIX="$REPONSE"

if [ "$CHOIX" = "2" ]; then
  # ----------------------------------------------------------------------------------
  # Cas local
  # ----------------------------------------------------------------------------------
  titre "PostgreSQL local"
  if commande_existe docker && [ -f "$RACINE/docker-compose.yml" ]; then
    if confirmer "Docker est installé. Démarrer une base PostgreSQL de test avec « docker compose » ?" "o"; then
      (cd "$RACINE" && docker compose up -d) || avertir "Le démarrage Docker a échoué. Vous pouvez saisir les informations d'une autre base ci-dessous."
    fi
  fi
  demander "Adresse du serveur" "localhost"; HOTE="$REPONSE"
  demander "Port" "5432"; PORT_DB="$REPONSE"
  demander "Utilisateur" "mmadi"; UTIL="$REPONSE"
  demander "Mot de passe" "mmadi"; MDP="$REPONSE"
  demander "Nom de la base" "mmadisante"; NOMBASE="$REPONSE"
  MDP_ENC="$(MDP_IN="$MDP" node -e 'process.stdout.write(encodeURIComponent(process.env.MDP_IN))')"
  DATABASE_URL="postgresql://$UTIL:$MDP_ENC@$HOTE:$PORT_DB/$NOMBASE"
  DIRECT_URL="$DATABASE_URL"
  ok "Base locale configurée."
else
  # ----------------------------------------------------------------------------------
  # Cas Supabase
  # ----------------------------------------------------------------------------------
  titre "Supabase : récupérer vos 2 adresses de connexion"
  cat <<'AIDE'
  1. Créez un compte gratuit sur https://supabase.com puis un projet (« New project »).
     → Notez bien le MOT DE PASSE de la base que vous choisissez : Supabase ne le réaffiche pas.
  2. Une fois le projet prêt, cliquez sur le bouton « Connect » en haut de la page du projet.
  3. Vous y trouverez les chaînes de connexion (commençant par postgresql://) :

     ┌─────────────────────────────────────────────────────────────────────────────┐
     │  Adresse n°1  « Transaction pooler »  — PORT 6543                           │
     │      utilisée par l'application EN FONCTIONNEMENT (DATABASE_URL)            │
     │  Adresse n°2  « Direct connection »  ou  « Session pooler » — PORT 5432     │
     │      utilisée UNIQUEMENT pour créer les tables (DIRECT_URL)                 │
     └─────────────────────────────────────────────────────────────────────────────┘

     Astuce : si votre connexion internet n'est pas en IPv6 et que l'étape 2 échoue,
     prenez pour l'adresse n°2 la chaîne « Session pooler » (port 5432 aussi).

  Collez les adresses telles quelles : le texte [YOUR-PASSWORD] sera remplacé pour vous.
AIDE
  printf '\n'

  while true; do
    demander "Adresse n°1 — Transaction pooler (port 6543)"; URL_RUNTIME="$REPONSE"
    url_valide "$URL_RUNTIME" && break
    echec "Cette adresse n'a pas le bon format (elle doit ressembler à postgresql://utilisateur:mot-de-passe@hote:6543/postgres)."
  done
  while true; do
    demander "Adresse n°2 — Direct connection ou Session pooler (port 5432)"; URL_DIRECT="$REPONSE"
    url_valide "$URL_DIRECT" && break
    echec "Cette adresse n'a pas le bon format (elle doit ressembler à postgresql://utilisateur:mot-de-passe@hote:5432/postgres)."
  done

  # Mot de passe à injecter si le texte [YOUR-PASSWORD] est encore présent
  if [[ "$URL_RUNTIME$URL_DIRECT" =~ \[[A-Za-z-]+\] ]]; then
    demander_secret "Mot de passe de votre base Supabase (rien ne s'affiche pendant la saisie)"
    [ -n "$REPONSE" ] || arreter "Le mot de passe est obligatoire."
    URL_RUNTIME="$(injecter_mot_de_passe "$URL_RUNTIME" "$REPONSE")"
    URL_DIRECT="$(injecter_mot_de_passe "$URL_DIRECT" "$REPONSE")"
  fi
  if [[ "$URL_RUNTIME$URL_DIRECT" =~ \[[A-Za-z-]+\] ]]; then
    arreter "Il reste un texte entre crochets [ ] dans les adresses. Remplacez-le par la vraie valeur et relancez."
  fi

  # --- Contrôles de cohérence des ports -------------------------------------------------
  P1="$(port_url "$URL_RUNTIME" || true)"
  P2="$(port_url "$URL_DIRECT" || true)"
  [ "$P2" = "6543" ] && arreter "L'adresse n°2 utilise le port 6543 : les migrations (création des tables) ne fonctionnent PAS via ce port. Utilisez la « Direct connection » ou le « Session pooler » (port 5432)."
  if [ "$P1" != "6543" ]; then
    avertir "L'adresse n°1 n'utilise pas le port 6543 (port trouvé : ${P1:-inconnu}). Pour l'application en ligne, le « Transaction pooler » (6543) est recommandé."
  fi
  if [ "$P1" = "6543" ] && [[ "$URL_RUNTIME" != *pgbouncer=true* ]]; then
    # Obligatoire avec Prisma derrière le pooler Supabase
    if [[ "$URL_RUNTIME" == *\?* ]]; then URL_RUNTIME="$URL_RUNTIME&pgbouncer=true"; else URL_RUNTIME="$URL_RUNTIME?pgbouncer=true"; fi
    ok "« ?pgbouncer=true » ajouté automatiquement à l'adresse n°1 (obligatoire avec le port 6543)."
  fi
  if [[ "$URL_DIRECT" =~ @db\.[a-z0-9]+\.supabase\.co ]]; then
    info "L'adresse n°2 est la connexion directe (IPv6). Si l'étape 2 échoue avec « Can't reach database server », reprenez ce script avec la chaîne « Session pooler »."
  fi
  DATABASE_URL="$URL_RUNTIME"
  DIRECT_URL="$URL_DIRECT"
fi

# --- Adresse du site web (CORS) ---------------------------------------------------------
titre "Adresse du site web"
echo "L'API n'accepte que les appels venant de l'adresse de votre site web."
echo "  • Pour tester sur votre ordinateur : http://localhost:3000"
echo "  • Pour la mise en ligne sur Render, vous le renseignerez plus tard dans Render (étape 4)."
demander "Adresse du site web" "http://localhost:3000"
FRONTEND_URL="${REPONSE%/}"

# --- Clés secrètes -----------------------------------------------------------------------
titre "Génération des clés secrètes"
JWT_SECRET="$(secret_aleatoire 48)"
ENCRYPTION_KEY="$(secret_aleatoire 32)"
ok "JWT_SECRET et ENCRYPTION_KEY générées (valeurs aléatoires uniques)."
avertir "Conservez ENCRYPTION_KEY précieusement : sans elle, les numéros de carte d'identité déjà enregistrés deviennent illisibles."

# --- Écriture de backend/.env --------------------------------------------------------------
if [ -f "$FICHIER_ENV" ]; then
  SAUVEGARDE="$FICHIER_ENV.sauvegarde-$(date +%Y%m%d-%H%M%S)"
  cp "$FICHIER_ENV" "$SAUVEGARDE"
  info "L'ancien backend/.env a été sauvegardé : $(basename "$SAUVEGARDE")"
fi
umask 077
cat > "$FICHIER_ENV" <<EOF
# Fichier généré par scripts/1-configurer.sh le $(date '+%d/%m/%Y à %H:%M'). Ne le publiez JAMAIS.
# Documentation de chaque variable : backend/.env.example
DATABASE_URL="$DATABASE_URL"
DIRECT_URL="$DIRECT_URL"
JWT_SECRET="$JWT_SECRET"
JWT_EXPIRES_IN="8h"
ENCRYPTION_KEY="$ENCRYPTION_KEY"
PORT=4000
FRONTEND_URL="$FRONTEND_URL"
MAX_FILE_MB=5
EOF
chmod 600 "$FICHIER_ENV" 2>/dev/null || true
ok "backend/.env écrit."

# --- Configuration du site web en local --------------------------------------------------------
if [ ! -f "$RACINE/frontend/.env.local" ]; then
  cat > "$RACINE/frontend/.env.local" <<'EOF'
# ⚠ L'adresse de l'API doit inclure le chemin COMPLET « /api/v1 »
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
EOF
  ok "frontend/.env.local écrit (API locale : http://localhost:4000/api/v1)."
fi

# --- Récapitulatif --------------------------------------------------------------------------
titre "Récapitulatif (les mots de passe sont masqués)"
a_copier "DATABASE_URL" "$(resume_url "$DATABASE_URL")"
a_copier "DIRECT_URL" "$(resume_url "$DIRECT_URL")"
a_copier "FRONTEND_URL" "$FRONTEND_URL"
printf '\n'
ok "Configuration terminée. Étape suivante :  bash scripts/2-schema.sh"
info "Pour revoir plus tard les valeurs à copier dans Render :  bash scripts/afficher-valeurs-render.sh"
