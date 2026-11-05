#!/usr/bin/env bash
# Génère des vidéos de démonstration courtes (titre + tonalité) dans media/videos/.
# Les fichiers existants ne sont JAMAIS écrasés : déposez vos vraies vidéos, elles sont conservées.
# Utilise ffmpeg local, ou à défaut l'image Docker linuxserver/ffmpeg.
#   ./scripts/generate-demo-videos.sh [durée_en_secondes]
set -euo pipefail
cd "$(dirname "$0")/.."
DUR="${1:-8}"
OUT="media/videos"
mkdir -p "$OUT"

declare -A VIDEOS=(
  [00_loop_bureau.mp4]="Bureau du Pere Noel (boucle)|0x3b2416"
  [01_intro_2000.mp4]="20h00 - Introduction|0x5a0f1f"
  [02_relance_2030.mp4]="20h30 - Relance|0x1f4d2b"
  [03_alerte_2050.mp4]="20h50 - Alerte|0x7a1a2c"
  [04_finale_2115.mp4]="21h15 - Finale|0x24150c"
  [05_victoire.mp4]="Victoire !|0xa88236"
  [06_secours_lutins.mp4]="Secours des lutins|0x24592f"
  [07_appel_lutins_2300.mp4]="23h00 - Appel des lutins|0x1e3a6e"
)

if command -v ffmpeg >/dev/null 2>&1; then
  FF=(ffmpeg)
  WORK="$PWD"
else
  echo "ffmpeg absent : utilisation de Docker (linuxserver/ffmpeg)"
  FF=(docker run --rm -v "$PWD:/work" -w /work linuxserver/ffmpeg)
  WORK="/work"
fi

for file in "${!VIDEOS[@]}"; do
  target="$OUT/$file"
  if [[ -f "$target" ]]; then
    echo "conservé : $target"
    continue
  fi
  IFS='|' read -r title color <<<"${VIDEOS[$file]}"
  d="$DUR"; [[ "$file" == 00_* ]] && d=12
  freq=$(( 300 + RANDOM % 400 ))
  # drawtext nécessite une police ; en cas d'échec on génère sans texte.
  vf="drawtext=text='${title}':fontcolor=0xecd9a0:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2,drawtext=text='DEMO %{pts\\:hms}':fontcolor=white@0.6:fontsize=28:x=40:y=h-60"
  if ! "${FF[@]}" -hide_banner -loglevel error -f lavfi -i "color=c=${color}:s=1280x720:r=25:d=${d}" \
      -f lavfi -i "sine=frequency=${freq}:duration=${d}" -vf "$vf" -c:v libx264 -pix_fmt yuv420p \
      -c:a aac -shortest -movflags +faststart "$WORK/$target" 2>/dev/null; then
    "${FF[@]}" -hide_banner -loglevel error -f lavfi -i "testsrc2=s=1280x720:r=25:d=${d}" \
      -f lavfi -i "sine=frequency=${freq}:duration=${d}" -c:v libx264 -pix_fmt yuv420p \
      -c:a aac -shortest -movflags +faststart "$WORK/$target"
  fi
  echo "créé    : $target"
done
