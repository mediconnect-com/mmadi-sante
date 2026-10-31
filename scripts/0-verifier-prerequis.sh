#!/usr/bin/env bash
# ============================================================================
#  ÉTAPE 0 — Vérifier que votre ordinateur est prêt
#  Lancer :  bash scripts/0-verifier-prerequis.sh
#
#  Ce script ne modifie rien : il vérifie seulement les outils nécessaires et vous dit
#  exactement quoi installer s'il en manque un.
# ============================================================================
set -u
source "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"

BLOQUANT=0
titre "Vérification des prérequis"

# --- Node.js (obligatoire) -----------------------------------------------------
if node_assez_recent; then
  ok "Node.js $(node -v) détecté."
else
  BLOQUANT=1
  if commande_existe node; then
    echec "Node.js $(node -v) est trop ancien (version 18.18 minimum requise)."
  else
    echec "Node.js n'est pas installé."
  fi
  echo "   → Téléchargez la version « LTS » sur https://nodejs.org puis relancez ce script."
fi

# --- npm (obligatoire, fourni avec Node.js) -------------------------------------
if commande_existe npm; then ok "npm $(npm -v) détecté."; else
  BLOQUANT=1; echec "npm est introuvable (il est normalement installé avec Node.js)."
fi

# --- Git (nécessaire seulement pour le déploiement cloud) ----------------------------
if commande_existe git; then ok "Git $(git --version | awk '{print $3}') détecté."; else
  avertir "Git n'est pas installé : il sera nécessaire pour l'étape 4 (déploiement). → https://git-scm.com/downloads"
fi

# --- psql (facultatif : sert de solution de repli pour créer les tables) --------------------
if commande_existe psql; then ok "psql détecté (client PostgreSQL)."; else
  info "psql n'est pas installé : facultatif. À défaut, vous collerez le script SQL dans l'éditeur de Supabase."
fi

# --- openssl (facultatif, Node.js sait aussi générer les clés) -----------------------------
if commande_existe openssl; then ok "openssl détecté."; else info "openssl absent : Node.js générera vos clés secrètes à la place."; fi

# --- Accès Internet vers les services utilisés ------------------------------------------
if commande_existe curl; then
  if curl -fsS -m 10 -o /dev/null https://registry.npmjs.org/; then ok "Accès au registre npm : OK."; else
    BLOQUANT=1; echec "Le registre npm est injoignable (Internet coupé ? proxy d'entreprise ?). Les dépendances ne pourront pas être installées."
  fi
  CODE_PRISMA="$(curl -s -m 10 -o /dev/null -w '%{http_code}' https://binaries.prisma.sh/ || true)"
  case "$CODE_PRISMA" in
    000|403)
      avertir "Le site des binaires Prisma (binaries.prisma.sh) est bloqué sur ce réseau (code $CODE_PRISMA)."
      echo "   → Pas de panique : l'étape 2 utilisera automatiquement le script SQL autonome (database/schema.sql)."
      ;;
    *) ok "Accès aux binaires Prisma : OK." ;;
  esac
else
  info "curl absent : test du réseau ignoré."
fi

# --- État de la configuration ----------------------------------------------------------
if [ -f "$FICHIER_ENV" ]; then ok "backend/.env existe déjà."; else info "backend/.env n'existe pas encore : l'étape 1 va le créer."; fi

printf '\n'
if [ "$BLOQUANT" -ne 0 ]; then
  arreter "Corrigez les points ci-dessus puis relancez :  bash scripts/0-verifier-prerequis.sh"
fi
ok "Tout est prêt. Étape suivante :  bash scripts/1-configurer.sh"
