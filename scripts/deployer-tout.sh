#!/usr/bin/env bash
# ============================================================================
#  DÉPLOIEMENT COMPLET EN UNE COMMANDE
#  Lancer :  bash scripts/deployer-tout.sh
#
#  Enchaîne, en vous guidant, toutes les étapes :
#    0. vérification de l'ordinateur        4. mise en ligne sur Render
#    1. liaison à la base + clés secrètes   (2. tables  3. comptes de démo)
#  Chaque étape peut aussi être lancée seule (voir le README). Si une étape échoue, corrigez puis
#  relancez simplement ce script : les étapes déjà faites sont sans danger.
# ============================================================================
set -u
DOSSIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$DOSSIER/_commun.sh"

lancer() {
  local script="$1" libelle="$2"
  printf '\n%s━━━━━━━━━━━━━━━━  %s  ━━━━━━━━━━━━━━━━%s\n' "$GRAS$BLEU" "$libelle" "$RESET"
  if ! bash "$DOSSIER/$script"; then
    echec "L'étape « $libelle » s'est arrêtée. Lisez le message ci-dessus, corrigez, puis relancez :  bash scripts/deployer-tout.sh"
    exit 1
  fi
}

lancer 0-verifier-prerequis.sh "ÉTAPE 0/4 — Vérification"
lancer 1-configurer.sh "ÉTAPE 1/4 — Configuration"
lancer 2-schema.sh "ÉTAPE 2/4 — Création des tables"
lancer 3-seed.sh "ÉTAPE 3/4 — Comptes de démonstration"
if confirmer "Passer maintenant à la mise en ligne sur Render (étape 4) ?" "o"; then
  lancer 4-deployer-render.sh "ÉTAPE 4/4 — Déploiement Render"
else
  info "Vous pourrez la lancer plus tard :  bash scripts/4-deployer-render.sh"
fi
printf '\n'
ok "Terminé."
