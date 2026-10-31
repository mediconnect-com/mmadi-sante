#!/usr/bin/env bash
# ============================================================================
#  Lancer l'application EN LOCAL (API + site) pour l'essayer sur votre ordinateur
#  Lancer :  bash scripts/demarrer-local.sh
#
#  Prérequis : avoir fait les étapes 1, 2 et 3 (configuration, tables, comptes de démo).
#  Ensuite ouvrez http://localhost:3000   (Ctrl+C pour tout arrêter)
# ============================================================================
set -u
source "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"

exiger_env_backend
node_assez_recent || arreter "Node.js 18.18 minimum est requis."
[ -f "$RACINE/frontend/.env.local" ] || arreter "frontend/.env.local manquant : lancez d'abord  bash scripts/1-configurer.sh"

titre "Installation des dépendances (première fois : 1 à 2 minutes)"
[ -d "$RACINE/backend/node_modules" ] || (cd "$RACINE/backend" && npm install --no-audit --no-fund) || arreter "Échec de l'installation du backend."
[ -d "$RACINE/frontend/node_modules" ] || (cd "$RACINE/frontend" && npm install --no-audit --no-fund) || arreter "Échec de l'installation du frontend."
(cd "$RACINE/backend" && npx prisma generate >/dev/null 2>&1) || avertir "« prisma generate » a échoué (réseau restreint ?) : voir README → « En cas d'erreur »."

titre "Démarrage"
PID_API=""
nettoyer() { [ -n "$PID_API" ] && kill "$PID_API" 2>/dev/null; exit 0; }
trap nettoyer INT TERM EXIT

(cd "$RACINE/backend" && SKIP_MIGRATE=true node src/server.js) &
PID_API=$!
sleep 2
ok "API démarrée sur http://localhost:4000/api/v1  (test : http://localhost:4000/api/v1/sante)"
ok "Site : ouvrez http://localhost:3000 dans votre navigateur (Ctrl+C pour arrêter)."
cd "$RACINE/frontend" && npm run dev
