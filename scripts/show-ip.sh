#!/usr/bin/env bash
# Affiche les adresses d'accès à l'application (mDNS + IP de secours).
set -uo pipefail
PORT="${HTTP_PORT:-80}"
suffix=""; [[ "$PORT" != "80" ]] && suffix=":$PORT"
name="$(hostname)"

echo
echo "🎄 Noël 2026 — adresses d'accès"
echo "  via mDNS       : http://$name.local$suffix/admin"
for ip in $(hostname -I 2>/dev/null); do
  [[ "$ip" == *:* ]] && continue   # IPv6 ignorée
  [[ "$ip" == 172.1[6-9].* || "$ip" == 172.2[0-9].* || "$ip" == 172.3[01].* ]] && continue   # réseaux Docker
  echo "  IP de secours  : http://$ip$suffix/admin"
done
echo "  Interfaces     : /admin (maître du jeu) · /tv (télévision) · /lutins (tablette) · /status"
if command -v systemctl >/dev/null 2>&1; then
  state="$(systemctl is-active avahi-daemon 2>/dev/null || true)"
  echo "  avahi-daemon   : ${state:-inconnu}"
fi
echo
