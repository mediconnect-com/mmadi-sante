#!/usr/bin/env bash
# ============================================================================
#  ÉTAPE 2 — Créer les tables dans la base de données (application du schéma)
#  Lancer :  bash scripts/2-schema.sh
#
#  Deux méthodes, essayées dans cet ordre :
#    A) migrations Prisma (via DIRECT_URL, port 5432) ;
#    B) script SQL autonome database/schema.sql — utilisé automatiquement si la méthode A échoue,
#       par exemple quand le réseau bloque le téléchargement des binaires Prisma.
#  Les deux produisent exactement la même base. Relancer ce script est sans danger.
# ============================================================================
set -u
source "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"

exiger_env_backend
node_assez_recent || arreter "Node.js 18.18 minimum est requis. Lancez d'abord :  bash scripts/0-verifier-prerequis.sh"

DIRECT_URL="$(lire_env DIRECT_URL)"; DIRECT_URL="${DIRECT_URL:-$(lire_env DATABASE_URL)}"
SCHEMA_SQL="$RACINE/database/schema.sql"
[ -f "$SCHEMA_SQL" ] || arreter "Fichier introuvable : database/schema.sql"
JOURNAL="$(mktemp 2>/dev/null || echo "$RACINE/.schema-journal.tmp")"

# Vérifie (si psql est disponible) que les 3 tables existent. Renvoie 0 si OK ou si non vérifiable.
verifier_tables() {
  commande_existe psql || { info "psql absent : vérification des tables ignorée."; return 0; }
  local n
  n="$(psql "$DIRECT_URL" -Atq -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('utilisateurs','documents','attributions')" 2>/dev/null || echo 0)"
  [ "$n" = "3" ]
}

# Explique l'échec de la méthode A d'après le message d'erreur.
diagnostiquer() {
  if grep -qiE "binaries\.prisma\.sh|checksum|403 Forbidden|ENOTFOUND|ETIMEDOUT|fetch failed" "$JOURNAL"; then
    avertir "Prisma n'a pas pu télécharger ses outils (réseau restreint ou bloqué)."
  elif grep -qiE "P1001|Can't reach database server|ENETUNREACH|EHOSTUNREACH" "$JOURNAL"; then
    avertir "La base est injoignable avec DIRECT_URL. Sur Supabase, la connexion directe est en IPv6 :"
    echo "   → relancez scripts/1-configurer.sh et utilisez la chaîne « Session pooler » (port 5432) comme adresse n°2."
  elif grep -qiE "P1000|authentication failed|password" "$JOURNAL"; then
    avertir "Mot de passe refusé par la base : vérifiez-le (Supabase → Project Settings → Database → Reset password), puis relancez scripts/1-configurer.sh."
  elif grep -qiE "P3005|not empty" "$JOURNAL"; then
    avertir "La base contient déjà des tables (créées autrement) : la méthode B (SQL) va prendre le relais."
  else
    avertir "La méthode A a échoué (détails ci-dessus)."
  fi
}

instructions_manuelles() {
  titre "Méthode B (manuelle) : coller le script dans l'éditeur SQL"
  echo "  1. Ouvrez votre projet Supabase → menu de gauche « SQL Editor » → « New query »."
  echo "  2. Collez TOUT le contenu du fichier :"
  a_copier "Fichier à copier" "$SCHEMA_SQL"
  if copier_presse_papiers "$SCHEMA_SQL"; then ok "Son contenu vient d'être copié dans votre presse-papiers : faites simplement « Coller »."; fi
  echo "  3. Cliquez sur « Run ». Le message « Success. No rows returned » signifie que c'est réussi."
  printf '\n'
  if confirmer "Avez-vous exécuté le script SQL avec succès ?" "n"; then
    ok "Parfait : les tables sont créées."
  else
    arreter "Étape non terminée. Relancez ce script quand le SQL a été exécuté (voir README → « En cas d'erreur »)."
  fi
}

# ---------------------------------------------------------------------------------------------
titre "Installation des dépendances de l'API"
cd "$RACINE/backend" || arreter "Dossier backend introuvable."
if [ ! -d node_modules ]; then
  npm install --no-audit --no-fund || arreter "L'installation des dépendances a échoué (Internet ? voir README → « En cas d'erreur »)."
fi
ok "Dépendances prêtes."

titre "Méthode A : migrations Prisma (connexion directe, port $(port_url "$DIRECT_URL" || echo '?'))"
REUSSI=0
if { npx prisma generate && npx prisma migrate deploy; } >"$JOURNAL" 2>&1; then
  tail -n 6 "$JOURNAL"
  REUSSI=1
  ok "Migrations Prisma appliquées."
else
  tail -n 15 "$JOURNAL"
  diagnostiquer
fi

if [ "$REUSSI" -eq 0 ]; then
  titre "Méthode B : script SQL autonome (database/schema.sql)"
  if commande_existe psql; then
    info "Application du script avec psql..."
    psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -q -f "$SCHEMA_SQL" >"$JOURNAL" 2>&1
    CODE_PSQL=$?
    grep -v "NOTICE" "$JOURNAL" || true
    if [ "$CODE_PSQL" -eq 0 ]; then
      REUSSI=1
      ok "Script SQL appliqué avec psql."
    else
      avertir "psql n'a pas réussi à se connecter ou à exécuter le script."
      instructions_manuelles
      REUSSI=1
    fi
  else
    instructions_manuelles
    REUSSI=1
  fi
fi

if verifier_tables; then
  ok "Vérification : les 3 tables (utilisateurs, documents, attributions) existent."
else
  arreter "Les tables n'ont pas été trouvées dans la base. Reprenez la méthode B (voir README → « En cas d'erreur »)."
fi
rm -f "$JOURNAL" 2>/dev/null || true

printf '\n'
ok "Schéma en place. Étape suivante :  bash scripts/3-seed.sh"
