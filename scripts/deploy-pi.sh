#!/usr/bin/env bash
# Installation et mise à jour sur Raspberry Pi 4/5 (Raspberry Pi OS 64 bits).
#
#   ./scripts/deploy-pi.sh              installation ou mise à jour (idempotent)
#   ./scripts/deploy-pi.sh --update     git pull puis reconstruction
#   ./scripts/deploy-pi.sh --no-hostname  ne pas renommer la machine
#   ./scripts/deploy-pi.sh --no-build     utiliser l'image noel2026:latest déjà chargée (docker load),
#                                         utile sur Pi 3 / 1 Go où la compilation sature la mémoire
#
# Internet est nécessaire pendant l'installation (paquets, images Docker).
# Ensuite, l'application fonctionne entièrement hors ligne.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
HOSTNAME_TARGET="${NOEL_HOSTNAME:-noel2026}"
COMPOSE=(docker compose -f compose.prod.yml)

UPDATE=0; SET_HOSTNAME=1; BUILD=1
for arg in "$@"; do
  case "$arg" in
    --update) UPDATE=1 ;;
    --no-hostname) SET_HOSTNAME=0 ;;
    --no-build) BUILD=0 ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "option inconnue : $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1;33m▶ %s\033[0m\n' "$*"; }
[[ $EUID -eq 0 ]] && { echo "Lancez ce script avec votre utilisateur (pas root) : il utilise sudo si besoin." >&2; exit 1; }

ARCH="$(uname -m)"
[[ "$ARCH" == "aarch64" ]] || echo "⚠ Architecture $ARCH : Raspberry Pi OS 64 bits (aarch64) recommandé."

if (( UPDATE )) && [[ -d .git ]]; then
  say "Mise à jour du code (git pull)"
  git pull --ff-only
fi

# ---------------------------------------------------------------- Docker
if ! command -v docker >/dev/null 2>&1; then
  say "Installation de Docker Engine"
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER"
  echo "Docker installé. Utilisation de sudo pour cette première exécution."
fi
if ! docker info >/dev/null 2>&1; then
  COMPOSE=(sudo docker compose -f compose.prod.yml)
fi
sudo systemctl enable --now docker >/dev/null

# ------------------------------------------------------- Nom d'hôte + mDNS
if (( SET_HOSTNAME )); then
  say "Nom d'hôte « $HOSTNAME_TARGET » et Avahi (http://$HOSTNAME_TARGET.local)"
  if [[ "$(hostname)" != "$HOSTNAME_TARGET" ]]; then
    sudo hostnamectl set-hostname "$HOSTNAME_TARGET"
    if grep -q '^127\.0\.1\.1' /etc/hosts; then
      sudo sed -i "s/^127\.0\.1\.1.*/127.0.1.1\t$HOSTNAME_TARGET/" /etc/hosts
    else
      echo -e "127.0.1.1\t$HOSTNAME_TARGET" | sudo tee -a /etc/hosts >/dev/null
    fi
  fi
  if ! dpkg -s avahi-daemon >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y -qq avahi-daemon
  fi
  sudo systemctl enable --now avahi-daemon >/dev/null
  sudo systemctl restart avahi-daemon
fi

# ------------------------------------------------------------- .env + hash
if [[ ! -f .env ]]; then
  say "Création du fichier .env"
  cp .env.example .env
  while true; do
    read -rsp "Mot de passe du maître du jeu (8 caractères min.) : " pw1; echo
    read -rsp "Confirmation : " pw2; echo
    [[ "$pw1" == "$pw2" && ${#pw1} -ge 8 ]] && break
    echo "Mots de passe différents ou trop courts, recommencez."
  done
  # security.py n'utilise que la bibliothèque standard : python3 du système suffit.
  HASH="$(NOEL_PW="$pw1" PYTHONPATH=backend python3 -c 'import os; from app.core.security import hash_password; print(hash_password(os.environ["NOEL_PW"]))')"
  unset pw1 pw2
  sed -i "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=$HASH|" .env
  sed -i "s|^APP_UID=.*|APP_UID=$(id -u)|; s|^APP_GID=.*|APP_GID=$(id -g)|" .env
  chmod 600 .env
fi
grep -q '^ADMIN_PASSWORD_HASH=scrypt:' .env || { echo "ADMIN_PASSWORD_HASH absent de .env" >&2; exit 1; }

mkdir -p data media/videos backups
HTTP_PORT="$(grep -E '^HTTP_PORT=' .env | cut -d= -f2)"; export HTTP_PORT="${HTTP_PORT:-80}"

if grep -qE '^COMPOSE_PROFILES=.*zigbee' .env; then
  say "Télécommande Zigbee (ZiGate)"
  mkdir -p zigbee/data
  [[ -f zigbee/data/configuration.yaml ]] || cp zigbee/configuration.yaml zigbee/data/configuration.yaml
  ZIGBEE_PORT="$(grep -E '^ZIGBEE_SERIAL_PORT=' .env | cut -d= -f2)"; ZIGBEE_PORT="${ZIGBEE_PORT:-/dev/ttyUSB0}"
  if [[ ! -e "$ZIGBEE_PORT" ]]; then
    echo "ZiGate introuvable sur $ZIGBEE_PORT : branchez-la ou corrigez ZIGBEE_SERIAL_PORT dans .env" >&2
    echo "(ou retirez COMPOSE_PROFILES=zigbee pour démarrer sans la télécommande)." >&2
    exit 1
  fi
fi

# ------------------------------------------------------- Build + démarrage
if (( BUILD )); then
  say "Construction de l'image et démarrage (quelques minutes la première fois)"
  "${COMPOSE[@]}" up -d --build --remove-orphans
  docker image prune -f >/dev/null 2>&1 || true
else
  say "Démarrage avec l'image noel2026:latest existante (sans compilation)"
  docker image inspect noel2026:latest >/dev/null 2>&1 || sudo docker image inspect noel2026:latest >/dev/null 2>&1 \
    || { echo "Image noel2026:latest absente : chargez-la (docker load) ou relancez sans --no-build." >&2; exit 1; }
  "${COMPOSE[@]}" up -d --no-build --remove-orphans
fi

say "Attente du serveur"
for _ in $(seq 1 60); do
  if curl -fsS "http://localhost:${HTTP_PORT:-80}/api/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done
if [[ -z "${OK:-}" ]]; then
  "${COMPOSE[@]}" logs --tail 60 app
  echo "Le serveur ne répond pas." >&2
  exit 1
fi
curl -fsS "http://localhost:${HTTP_PORT:-80}/api/health"; echo

"$ROOT/scripts/show-ip.sh"
