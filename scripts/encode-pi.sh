#!/usr/bin/env bash
# Réencode des vidéos pour une lecture fluide dans Chromium sur Raspberry Pi 3 (décodage logiciel) :
# 1280×720, 25 i/s, H.264 Main 3.1, débit plafonné à 2 Mbit/s, AAC 128 kbit/s, faststart.
#
#   ./scripts/encode-pi.sh <dossier-sortie> media/videos/*.mp4
#
# Les originaux ne sont jamais modifiés ; un fichier de sortie existant est ignoré.
set -euo pipefail
OUT_DIR="${1:?dossier de sortie requis}"; shift
(( $# )) || { echo "aucune vidéo à réencoder" >&2; exit 2; }
W="${W:-1280}"; H="${H:-720}"
mkdir -p "$OUT_DIR"
for src in "$@"; do
  dst="$OUT_DIR/$(basename "${src%.*}").mp4"
  if [[ -e "$dst" ]]; then echo "« $dst » existe déjà, ignoré."; continue; fi
  ffmpeg -nostdin -v error -i "$src" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=25" \
    -c:v libx264 -profile:v main -level 3.1 -preset slow -crf 24 -maxrate 2M -bufsize 4M -pix_fmt yuv420p \
    -c:a aac -b:a 128k -ar 48000 -movflags +faststart "$dst"
  echo "✔ $dst"
done
