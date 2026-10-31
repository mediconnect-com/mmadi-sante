#!/usr/bin/env bash
# ============================================================================
#  ÉTAPE 4 — Mettre le code en ligne et déployer sur Render
#  Lancer :  bash scripts/4-deployer-render.sh
#
#  Render récupère votre code depuis GitHub puis lit le fichier render.yaml, qui décrit les 2 services :
#     • mmadi-sante-api  → l'API (service web Node.js)
#     • mmadi-sante-web  → le site (site statique, jamais mis en veille)
#
#  Ce script :
#    1. prépare le dépôt Git (en vérifiant qu'AUCUN secret n'y est inclus) ;
#    2. l'envoie sur votre dépôt GitHub ;
#    3. vous affiche, prêtes à copier, les valeurs à renseigner dans Render.
# ============================================================================
set -u
source "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"

commande_existe git || arreter "Git n'est pas installé. Installez-le (https://git-scm.com/downloads) puis relancez ce script."
[ -f "$RACINE/render.yaml" ] || arreter "Fichier render.yaml introuvable à la racine du projet."
exiger_env_backend

NOM_API="mmadi-sante-api"
NOM_WEB="mmadi-sante-web"

titre "Avant de commencer"
cat <<'AIDE'
  Il vous faut :
    • un compte GitHub gratuit            → https://github.com/signup
    • un DÉPÔT GitHub VIDE (sans README)  → https://github.com/new   (nom conseillé : mmadi-sante)
    • un compte Render gratuit            → https://render.com  (« Sign in with GitHub » est le plus simple)
AIDE
printf '\n'
confirmer "Ces trois éléments sont prêts ?" "o" || arreter "Préparez-les puis relancez ce script."

# --- 1) Dépôt Git local ----------------------------------------------------------------------
titre "Préparation du dépôt Git"
cd "$RACINE" || exit 1
if [ ! -d .git ]; then
  git init -q -b main 2>/dev/null || { git init -q && git checkout -q -b main; }
  ok "Dépôt Git créé."
fi

# Identité Git (nécessaire pour enregistrer un « commit »)
if [ -z "$(git config user.name || true)" ]; then
  demander "Votre nom (pour Git)"; git config user.name "$REPONSE"
fi
if [ -z "$(git config user.email || true)" ]; then
  demander "Votre e-mail (pour Git)"; git config user.email "$REPONSE"
fi

git add -A
# SÉCURITÉ : on refuse d'envoyer des fichiers contenant des secrets.
SECRETS="$(git diff --cached --name-only | grep -E '(^|/)\.env($|\.local$|\.production$|\.sauvegarde)' || true)"
if [ -n "$SECRETS" ]; then
  git reset -q
  echec "Des fichiers secrets allaient être publiés :"
  echo "$SECRETS" | sed 's/^/   - /'
  arreter "Le fichier .gitignore devrait les exclure. Vérifiez qu'il est présent à la racine du projet, puis relancez."
fi
ok "Aucun fichier secret dans l'envoi (.env exclus)."

if git diff --cached --quiet; then
  info "Aucun changement à enregistrer."
else
  git commit -q -m "MmadiSanté : version à déployer" && ok "Version enregistrée (commit)."
fi

# --- 2) Envoi vers GitHub ------------------------------------------------------------------
titre "Envoi vers GitHub"
ACTUEL="$(git remote get-url origin 2>/dev/null || true)"
if [ -n "$ACTUEL" ]; then
  info "Dépôt GitHub déjà lié : $ACTUEL"
  confirmer "Utiliser ce dépôt ?" "o" || ACTUEL=""
fi
if [ -z "$ACTUEL" ]; then
  while true; do
    demander "Adresse de votre dépôt GitHub (ex. https://github.com/votre-nom/mmadi-sante)"
    DEPOT="${REPONSE%/}"; DEPOT="${DEPOT%.git}"
    [[ "$DEPOT" =~ ^https://github\.com/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$ ]] && break
    echec "Adresse invalide. Format attendu : https://github.com/votre-nom/mmadi-sante"
  done
  git remote remove origin 2>/dev/null || true
  git remote add origin "$DEPOT.git"
else
  DEPOT="${ACTUEL%.git}"
fi

info "Envoi en cours (GitHub peut vous demander de vous connecter ; en HTTPS, le « mot de passe » est un jeton d'accès personnel)..."
if git push -u origin main 2>&1; then
  ok "Code envoyé sur GitHub."
else
  echec "L'envoi a échoué."
  cat <<'AIDE'
   Causes fréquentes :
     • le dépôt n'est pas VIDE (supprimez le README créé par GitHub, ou créez un dépôt neuf) ;
     • l'authentification : sur https://github.com/settings/tokens créez un « Personal access token (classic) »
       avec la case « repo » cochée, et utilisez-le comme mot de passe ;
     • ou installez l'outil GitHub CLI (https://cli.github.com) puis lancez :  gh auth login
AIDE
  exit 1
fi

# --- 3) Valeurs à renseigner dans Render --------------------------------------------------------
URL_API_PREVUE="https://$NOM_API.onrender.com"
URL_WEB_PREVUE="https://$NOM_WEB.onrender.com"
LIEN_BLUEPRINT="https://dashboard.render.com/blueprint/new?repo=$DEPOT"

titre "À FAIRE MAINTENANT DANS RENDER (5 minutes)"
echo "  1. Ouvrez ce lien (il crée vos 2 services d'un coup à partir de render.yaml) :"
printf '       %s%s%s\n\n' "$GRAS$VERT" "$LIEN_BLUEPRINT" "$RESET"
echo "  2. Render vous demande les valeurs ci-dessous. COPIEZ-COLLEZ-les exactement :"
printf '\n'
printf '   %sService « %s » (l\x27API)%s\n' "$GRAS" "$NOM_API" "$RESET"
a_copier "DATABASE_URL" "$(lire_env DATABASE_URL)"
a_copier "DIRECT_URL" "$(lire_env DIRECT_URL)"
a_copier "FRONTEND_URL" "$URL_WEB_PREVUE"
printf '\n   %sService « %s » (le site)%s\n' "$GRAS" "$NOM_WEB" "$RESET"
a_copier "NEXT_PUBLIC_API_URL" "$URL_API_PREVUE/api/v1"
printf '\n'
avertir "NEXT_PUBLIC_API_URL doit se terminer par  /api/v1  (chemin complet de l'API)."
echo "   (JWT_SECRET et ENCRYPTION_KEY sont générés automatiquement par Render : rien à saisir.)"
printf '\n'
echo "  3. Cliquez sur « Apply » : le premier déploiement dure environ 5 à 10 minutes."
echo "  4. VÉRIFIEZ les adresses réelles : dans Render, ouvrez chaque service et regardez son adresse"
echo "     (en haut de la page, « https://....onrender.com »). Si Render a ajouté un suffixe à un nom"
echo "     déjà pris, corrigez FRONTEND_URL (API) et/ou NEXT_PUBLIC_API_URL (site) dans « Environment »,"
echo "     puis relancez : « Manual Deploy » → « Deploy latest commit » (obligatoire pour le site)."
echo "  5. Testez : ouvrez  $URL_API_PREVUE/api/v1/sante  → vous devez voir {\"statut\":\"ok\",...}"
echo "     puis ouvrez  $URL_WEB_PREVUE  et connectez-vous."
printf '\n'
titre "À SAVOIR : plan gratuit"
avertir "L'API Render gratuite se met en VEILLE après 15 minutes sans visite : la première requête suivante"
echo "     prend 30 à 60 secondes (le site affiche alors « le serveur se réveille »). C'est normal."
avertir "Un projet Supabase gratuit est mis en pause après 7 jours sans activité : réactivez-le d'un clic"
echo "     dans le tableau de bord Supabase (« Restore project »)."
printf '\n'
ok "Étape 4 terminée côté ordinateur. Suivez les instructions Render ci-dessus."
info "Pour réafficher ces valeurs à tout moment :  bash scripts/afficher-valeurs-render.sh"
