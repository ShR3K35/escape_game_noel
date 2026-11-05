#!/usr/bin/env bash
# Sauvegarde de la base SQLite (copie cohérente, à chaud) + configuration + .env.
#   ./scripts/backup.sh                    (compose.prod.yml)
#   COMPOSE_FILE=compose.yml ./scripts/backup.sh
# Archives dans ./backups/ ; les KEEP (défaut 15) plus récentes sont conservées.
# Exemple cron toutes les 10 min pendant la soirée :
#   */10 19-23 24 12 * cd /home/pi/noel2026 && ./scripts/backup.sh >/dev/null
set -euo pipefail
cd "$(dirname "$0")/.."
COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yml}"
KEEP="${KEEP:-15}"
ts="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

DC=(docker compose -f "$COMPOSE_FILE")
docker info >/dev/null 2>&1 || DC=(sudo docker compose -f "$COMPOSE_FILE")

if "${DC[@]}" ps --status running --services 2>/dev/null | grep -qx app; then
  # Sauvegarde via l'API de backup SQLite dans le conteneur (cohérente même en pleine partie).
  inner="$("${DC[@]}" exec -T app python -m app.cli backup --output /data/backups | tail -1)"
  "${DC[@]}" cp "app:$inner" "$work/noel2026.db"
elif [[ -f data/noel2026.db ]]; then
  echo "Conteneur arrêté : copie directe du fichier de base."
  if command -v sqlite3 >/dev/null; then sqlite3 data/noel2026.db ".backup '$work/noel2026.db'"; else cp data/noel2026.db "$work/"; fi
else
  echo "Aucune base trouvée." >&2
  exit 1
fi

cp -r config "$work/config"
[[ -f .env ]] && cp .env "$work/.env"
[[ -f data/secret_key ]] && cp data/secret_key "$work/secret_key"

archive="backups/noel2026-$ts.tar.gz"
tar -czf "$archive" -C "$work" .
chmod 600 "$archive"
echo "Sauvegarde : $archive"

ls -1t backups/noel2026-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
