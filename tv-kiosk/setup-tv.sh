#!/usr/bin/env bash
# Installe l'appli « TV Noël » sur le Google TV Streamer par adb Wi-Fi et coupe la mise en veille.
#
# Sur la TV : Paramètres > Système > À propos > cliquer 7 fois sur « Build Android TV OS »,
# puis Paramètres > Système > Options pour les développeurs > Débogage sans fil (activé).
# Première fois : « Associer l'appareil avec un code » puis  adb pair IP:PORT_ASSOCIATION  (code à 6 chiffres).
#
# Usage : TV=192.168.1.20:PORT ./setup-tv.sh                 installation + réglages anti-veille
#         TV=… ./setup-tv.sh --install-only                  met seulement l'APK à jour
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
APK="$HERE/build/noel-tv-kiosk.apk"
PKG=fr.noel2026.tvkiosk
ADB="${ADB:-$(command -v adb || echo /mnt/c/platform-tools/adb.exe)}"
: "${TV:?Indique l’adresse adb de la TV, ex. TV=192.168.1.20:37000}"

"$ADB" connect "$TV" >/dev/null || true
adb_tv() { "$ADB" -s "$TV" "$@"; }

[ -f "$APK" ] || "$HERE/build.sh"
src="$APK"
case "$ADB" in *.exe) cp "$APK" /mnt/c/platform-tools/noel-tv-kiosk.apk; src='C:\platform-tools\noel-tv-kiosk.apk';; esac
adb_tv install -r "$src"

if [ "${1:-}" != "--install-only" ]; then
  # Pas d'écran de veille, de mode Ambiant ni d'extinction automatique, même hors de l'appli.
  adb_tv shell settings put secure screensaver_enabled 0
  adb_tv shell settings put secure screensaver_activate_on_sleep 0
  adb_tv shell settings put secure sleep_timeout -1
  adb_tv shell settings put secure attentive_timeout -1
  adb_tv shell settings put system screen_off_timeout 2147483647
fi

adb_tv shell am start -n "$PKG/.MainActivity" >/dev/null
echo "« TV Noël » lancée sur $TV."
