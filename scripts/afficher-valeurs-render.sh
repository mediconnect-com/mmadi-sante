#!/usr/bin/env bash
# ============================================================================
#  Réafficher les valeurs à copier dans Render (sans rien modifier)
#  Lancer :  bash scripts/afficher-valeurs-render.sh
# ============================================================================
set -u
source "$(dirname "${BASH_SOURCE[0]}")/_commun.sh"
exiger_env_backend

NOM_API="mmadi-sante-api"
NOM_WEB="mmadi-sante-web"
[ "${1:-}" != "" ] && NOM_API="$1"
[ "${2:-}" != "" ] && NOM_WEB="$2"

titre "Valeurs à renseigner dans Render"
printf '   %sService « %s » (API)%s  → onglet « Environment »\n' "$GRAS" "$NOM_API" "$RESET"
a_copier "DATABASE_URL" "$(lire_env DATABASE_URL)"
a_copier "DIRECT_URL" "$(lire_env DIRECT_URL)"
a_copier "FRONTEND_URL" "https://$NOM_WEB.onrender.com"
printf '\n   %sService « %s » (site)%s  → onglet « Environment »\n' "$GRAS" "$NOM_WEB" "$RESET"
a_copier "NEXT_PUBLIC_API_URL" "https://$NOM_API.onrender.com/api/v1"
printf '\n'
avertir "NEXT_PUBLIC_API_URL doit se terminer par /api/v1. Après l'avoir modifiée, relancez un déploiement du site."
info "Adaptez les adresses si Render a ajouté un suffixe aux noms. Usage : bash scripts/afficher-valeurs-render.sh NOM-API NOM-SITE"
info "Ne partagez jamais ces valeurs (elles contiennent le mot de passe de votre base)."
