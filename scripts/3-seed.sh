#!/usr/bin/env bash
# ============================================================================
#  ÉTAPE 3 — Créer les comptes de démonstration (un par profil, mot de passe commun)
#  Lancer :  bash scripts/3-seed.sh
#
#  Méthode A : « npm run seed » (Prisma) ; méthode B (repli automatique) : database/seed_demo.sql.
#  Sûr à relancer : les comptes existants sont simplement mis à jour.
# ============================================================================
set -u
source "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"

exiger_env_backend
node_assez_recent || arreter "Node.js 18.18 minimum est requis. Lancez d'abord :  bash scripts/0-verifier-prerequis.sh"
DIRECT_URL="$(lire_env DIRECT_URL)"; DIRECT_URL="${DIRECT_URL:-$(lire_env DATABASE_URL)}"
SEED_SQL="$RACINE/database/seed_demo.sql"
JOURNAL="$(mktemp 2>/dev/null || echo "$RACINE/.seed-journal.tmp")"

titre "Comptes de démonstration"
avertir "Ces comptes et leur mot de passe sont PUBLICS (écrits dans le README)."
echo "   Si votre site est accessible sur Internet, supprimez-les (via le compte administrateur)"
echo "   dès que vous avez fini la démonstration."
printf '\n'
confirmer "Créer les comptes de démonstration maintenant ?" "o" || { info "Étape ignorée à votre demande."; exit 0; }

REUSSI=0
cd "$RACINE/backend" || arreter "Dossier backend introuvable."
[ -d node_modules ] || npm install --no-audit --no-fund || arreter "Installation des dépendances impossible."

titre "Méthode A : seed Prisma"
if { npx prisma generate && npm run seed --silent; } >"$JOURNAL" 2>&1; then
  tail -n 8 "$JOURNAL"
  REUSSI=1
else
  tail -n 6 "$JOURNAL"
  avertir "La méthode A a échoué (voir ci-dessus) : passage à la méthode B (SQL)."
fi

if [ "$REUSSI" -eq 0 ]; then
  titre "Méthode B : script SQL (database/seed_demo.sql)"
  if commande_existe psql && psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -q -f "$SEED_SQL"; then
    REUSSI=1
    ok "Comptes créés avec psql."
  else
    echo "  1. Supabase → « SQL Editor » → « New query »."
    echo "  2. Collez TOUT le contenu de :"
    a_copier "Fichier à copier" "$SEED_SQL"
    if copier_presse_papiers "$SEED_SQL"; then ok "Son contenu a été copié dans votre presse-papiers."; fi
    echo "  3. Cliquez sur « Run »."
    if confirmer "Avez-vous exécuté le script avec succès ?" "n"; then REUSSI=1; fi
  fi
fi
rm -f "$JOURNAL" 2>/dev/null || true
[ "$REUSSI" -eq 1 ] || arreter "Les comptes n'ont pas été créés. Voir README → « En cas d'erreur »."

titre "Comptes disponibles (mot de passe commun : MmadiDemo2026!)"
a_copier "ADMINISTRATEUR" "admin@mmadisante.demo"
a_copier "MÉDECIN" "medecin@mmadisante.demo   (suit uniquement Amina Mmadi)"
a_copier "PATIENT" "patient@mmadisante.demo   (Amina Mmadi)"
a_copier "PATIENT (sans médecin)" "patient2@mmadisante.demo  (Paul Durand)"
printf '\n'
ok "Comptes de démonstration prêts. Étape suivante :  bash scripts/4-deployer-render.sh"
