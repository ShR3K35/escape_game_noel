#!/usr/bin/env bash
# Affichage TV : Chromium plein écran sur /tv au démarrage du Raspberry Pi (sortie HDMI).
# À lancer avec l'utilisateur du bureau (pas root). Pris en charge : labwc (Pi OS Bookworm récent / Trixie),
# wayfire (Bookworm 2023-2024) et X11/LXDE (autostart XDG).
set -euo pipefail
URL="${KIOSK_URL:-http://localhost/tv}"
# Résolution forcée de la sortie HDMI (ex. KIOSK_MODE=1280x720 sur Pi 3 : 2,25× moins de pixels qu'en 1080p).
MODE="${KIOSK_MODE:-}"
BIN_DIR="$HOME/.local/bin"
LAUNCHER="$BIN_DIR/noel-kiosk.sh"

echo "▶ Paquets : Chromium + police emoji (étoiles, rennes, cadeaux…)"
sudo apt-get update -qq
sudo apt-get install -y -qq chromium-browser 2>/dev/null || sudo apt-get install -y -qq chromium
sudo apt-get install -y -qq fonts-noto-color-emoji curl

CHROMIUM="$(command -v chromium-browser || command -v chromium)"

mkdir -p "$BIN_DIR"
cat >"$LAUNCHER" <<EOF
#!/usr/bin/env bash
# Attend que l'application réponde, puis ouvre la TV en plein écran.
for _ in \$(seq 1 90); do curl -fsS "${URL%/tv}/api/health" >/dev/null 2>&1 && break; sleep 2; done
MODE="${MODE}"
if [[ -n "\$MODE" ]] && command -v wlr-randr >/dev/null 2>&1; then
  OUT="\$(wlr-randr | awk '/^[^ ]/{print \$1; exit}')"
  [[ -n "\$OUT" ]] && wlr-randr --output "\$OUT" --mode "\$MODE" || true
fi
exec "$CHROMIUM" --kiosk "$URL" \\
  --noerrdialogs --disable-infobars --no-first-run --disable-session-crashed-bubble \\
  --autoplay-policy=no-user-gesture-required \\
  --disable-features=Translate,TranslateUI --disable-pinch --overscroll-history-navigation=0 \\
  --check-for-update-interval=31536000 --password-store=basic
EOF
chmod +x "$LAUNCHER"

if command -v labwc >/dev/null 2>&1; then
  mkdir -p "$HOME/.config/labwc"
  touch "$HOME/.config/labwc/autostart"
  grep -q noel-kiosk "$HOME/.config/labwc/autostart" || echo "$LAUNCHER &" >>"$HOME/.config/labwc/autostart"
  echo "Autostart labwc configuré."
elif command -v wayfire >/dev/null 2>&1; then
  ini="$HOME/.config/wayfire.ini"
  touch "$ini"
  grep -q '^\[autostart\]' "$ini" || printf '\n[autostart]\n' >>"$ini"
  grep -q noel-kiosk "$ini" || sed -i "/^\[autostart\]/a noel = $LAUNCHER" "$ini"
  echo "Autostart wayfire configuré."
else
  mkdir -p "$HOME/.config/autostart"
  cat >"$HOME/.config/autostart/noel-kiosk.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Noël 2026 TV
Exec=$LAUNCHER
X-GNOME-Autostart-enabled=true
EOF
  echo "Autostart XDG configuré."
fi

if command -v raspi-config >/dev/null 2>&1; then
  echo "▶ Connexion automatique au bureau et désactivation de la mise en veille de l'écran"
  sudo raspi-config nonint do_boot_behaviour B4 || true
  sudo raspi-config nonint do_blanking 1 || true
fi

echo "Kiosk prêt : redémarrez (sudo reboot) pour vérifier l'affichage automatique de $URL"
