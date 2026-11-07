#!/usr/bin/env bash
# Prépare le Raspberry Pi pour une PiZiGate (ZiGate enfichée sur le GPIO). Idempotent, redémarrage requis.
#   - UART PL011 sur GPIO 14/15 : enable_uart=1 + dtoverlay=disable-bt (sur Pi 3, le Bluetooth l'occupe) ;
#   - console série retirée de cmdline.txt (sinon le noyau parle à la ZiGate) ;
#   - GPIO 27 (FLASH) à l'état haut et impulsion sur GPIO 17 (RESET) à chaque démarrage, avant Docker :
#     la ZiGate démarre alors en mode normal et non en mode programmation.
# Usage sur le Pi :  sudo scripts/zigbee/setup-pizigate.sh   puis   sudo reboot
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "À lancer avec sudo." >&2; exit 1; }

BOOT=/boot/firmware
[[ -f $BOOT/config.txt ]] || BOOT=/boot
CONFIG=$BOOT/config.txt CMDLINE=$BOOT/cmdline.txt
STAMP=$(date +%Y%m%d-%H%M%S)

if ! grep -q '^# --- PiZiGate' "$CONFIG"; then
  cp "$CONFIG" "$CONFIG.avant-pizigate-$STAMP"
  # Section [all] explicite : les lignes s'appliquent quel que soit le filtre précédent ([cm5]…).
  cat >> "$CONFIG" <<'EOF'

[all]
# --- PiZiGate (scripts/zigbee/setup-pizigate.sh)
enable_uart=1
dtoverlay=disable-bt
gpio=17,27=op,dh
EOF
  echo "config.txt : UART activé, Bluetooth coupé, GPIO 17/27 à l'état haut."
fi

if grep -qE 'console=(serial0|ttyAMA0|ttyS0),[0-9]+ ?' "$CMDLINE"; then
  cp "$CMDLINE" "$CMDLINE.avant-pizigate-$STAMP"
  sed -i -E 's/console=(serial0|ttyAMA0|ttyS0),[0-9]+ ?//' "$CMDLINE"
  echo "cmdline.txt : console série retirée."
fi

systemctl disable --now hciuart.service 2>/dev/null || true
systemctl disable --now serial-getty@ttyAMA0.service serial-getty@serial0.service 2>/dev/null || true

cat > /usr/local/sbin/pizigate-run-mode <<'EOF'
#!/bin/sh
# Mode normal de la PiZiGate : FLASH (GPIO 27) haut, puis impulsion basse sur RESET (GPIO 17).
pinctrl set 27 op dh
pinctrl set 17 op dl
sleep 0.5
pinctrl set 17 op dh
sleep 2
EOF
chmod 755 /usr/local/sbin/pizigate-run-mode

cat > /etc/systemd/system/pizigate.service <<'EOF'
[Unit]
Description=PiZiGate en mode normal (GPIO 17/27)
Before=docker.service

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/pizigate-run-mode
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable pizigate.service >/dev/null
echo "Service pizigate.service installé. Redémarrez : sudo reboot"
