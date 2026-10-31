#!/usr/bin/env bash
# ============================================================================
#  Fonctions communes aux scripts de MmadiSanté (ce fichier n'est pas à lancer seul).
#  Compatible : macOS, Linux, Windows (Git Bash ou WSL).
# ============================================================================

# Dossier racine du projet (le dossier qui contient « backend », « frontend », « scripts »...)
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FICHIER_ENV="$RACINE/backend/.env"

# --- Couleurs (désactivées si la sortie n'est pas un terminal) ---------------
if [ -t 1 ]; then
  ROUGE=$'\033[31m'; VERT=$'\033[32m'; JAUNE=$'\033[33m'; BLEU=$'\033[34m'; GRAS=$'\033[1m'; RESET=$'\033[0m'
else
  ROUGE=''; VERT=''; JAUNE=''; BLEU=''; GRAS=''; RESET=''
fi

titre()   { printf '\n%s== %s ==%s\n' "$GRAS$BLEU" "$*" "$RESET"; }
ok()      { printf '%s✔%s %s\n' "$VERT" "$RESET" "$*"; }
info()    { printf '%sℹ%s %s\n' "$BLEU" "$RESET" "$*"; }
avertir() { printf '%s⚠%s %s\n' "$JAUNE" "$RESET" "$*"; }
echec()   { printf '%s✖ %s%s\n' "$ROUGE" "$*" "$RESET" >&2; }

# Affiche une valeur que l'utilisateur doit COPIER (nom en gras, valeur en vert).
a_copier() { printf '   %s%-22s%s %s%s%s\n' "$GRAS" "$1" "$RESET" "$VERT" "$2" "$RESET"; }

# Arrêt avec un message clair.
arreter() { echec "$*"; exit 1; }

commande_existe() { command -v "$1" >/dev/null 2>&1; }

# --- Questions à l'utilisateur ------------------------------------------------
# demander "Question" "valeur par défaut"  -> résultat dans $REPONSE
demander() {
  local question="$1" defaut="${2:-}"
  if [ -n "$defaut" ]; then
    read -r -p "$question [$defaut] : " REPONSE || true
    REPONSE="${REPONSE:-$defaut}"
  else
    read -r -p "$question : " REPONSE || true
  fi
}

# demander_secret "Question" -> résultat dans $REPONSE (rien ne s'affiche pendant la saisie)
demander_secret() {
  read -r -s -p "$1 : " REPONSE || true
  printf '\n'
}

# confirmer "Question ?" "o|n" -> code retour 0 si l'utilisateur répond oui
confirmer() {
  local question="$1" defaut="${2:-o}" rep
  local indice="[O/n]"; [ "$defaut" = "n" ] && indice="[o/N]"
  read -r -p "$question $indice " rep || true
  rep="${rep:-$defaut}"
  case "$(printf '%s' "$rep" | tr '[:upper:]' '[:lower:]')" in
    o|oui|y|yes) return 0 ;;
    *) return 1 ;;
  esac
}

pause_entree() { read -r -p "Appuyez sur Entrée pour continuer... " _ || true; }

# --- Lecture du fichier backend/.env -------------------------------------------
# lire_env NOM -> affiche la valeur (sans guillemets) de la variable NOM
lire_env() {
  [ -f "$FICHIER_ENV" ] || return 0
  grep -E "^$1=" "$FICHIER_ENV" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}

exiger_env_backend() {
  if [ ! -f "$FICHIER_ENV" ]; then
    arreter "Le fichier backend/.env n'existe pas encore. Lancez d'abord :  bash scripts/1-configurer.sh"
  fi
  for v in DATABASE_URL JWT_SECRET ENCRYPTION_KEY; do
    [ -n "$(lire_env "$v")" ] || arreter "La variable $v est vide dans backend/.env. Relancez :  bash scripts/1-configurer.sh"
  done
}

# Version de Node.js suffisante ? (18.18 minimum)
node_assez_recent() {
  commande_existe node || return 1
  local v major minor
  v="$(node -p "process.versions.node")"
  major="${v%%.*}"; minor="${v#*.}"; minor="${minor%%.*}"
  [ "$major" -gt 18 ] || { [ "$major" -eq 18 ] && [ "$minor" -ge 18 ]; }
}

# Copie un fichier dans le presse-papiers si un outil existe (pratique pour l'éditeur SQL).
copier_presse_papiers() {
  local f="$1"
  if commande_existe pbcopy; then pbcopy < "$f" && return 0
  elif commande_existe clip.exe; then clip.exe < "$f" && return 0
  elif commande_existe xclip; then xclip -selection clipboard < "$f" && return 0
  elif commande_existe wl-copy; then wl-copy < "$f" && return 0
  fi
  return 1
}

# Affiche l'hôte et le port d'une URL de base de données SANS le mot de passe.
resume_url() {
  printf '%s' "$1" | sed -E 's#^[a-z]+://[^@]*@#…@#; s#\?.*$##'
}

# Extrait le port d'une URL postgresql://user:mdp@hote:PORT/base
port_url() {
  [[ "$1" =~ @[^/]*:([0-9]+)/ ]] && printf '%s' "${BASH_REMATCH[1]}"
}
