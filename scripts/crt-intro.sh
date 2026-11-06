#!/usr/bin/env bash
# Intro « télé cathodique » de 5 s, montée sur les premières images d'une vidéo.
#   0,00–0,90 s : allumage CRT (point → ligne horizontale → ouverture verticale, flash blanc)
#   0,90–3,00 s : neige + grésillement, barre de ronflement qui défile
#   3,00–5,00 s : les 2 premières secondes de la vidéo apparaissent à travers la neige
#                 (ondulation, aberration chromatique, vignettage, lignes de balayage et
#                 grésillement s'éteignent à 5 s → raccord invisible avec la suite)
#
# Usage :
#   ./scripts/crt-intro.sh <video_source> <sortie.mp4> [--full]
#   --full : enchaîne l'intro avec la suite de la vidéo (à partir de 2 s) → montage complet.
# Variables : W, H (défaut 1920x1080), FPS (défaut 25),
#   FILL=cover pour remplir l'écran en recadrant (au lieu de bandes noires).
set -euo pipefail

SRC="${1:?vidéo source requise}"
OUT="${2:?fichier de sortie requis}"
FULL="${3:-}"
W="${W:-1920}"; H="${H:-1080}"; FPS="${FPS:-25}"
SR=48000

if [[ -e "$OUT" ]]; then echo "« $OUT » existe déjà, abandon." >&2; exit 1; fi

HAS_AUDIO=0
if ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$SRC" | grep -q .; then
  HAS_AUDIO=1
fi

if [[ "${FILL:-pad}" == "cover" ]]; then
  FIT="scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${FPS}"
else
  FIT="scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}"
fi

FG="$(mktemp)"; trap 'rm -f "$FG"' EXIT
cat > "$FG" <<EOF
color=c=gray:s=${W}x$((H/2)):r=${FPS}:d=5,
  noise=alls=100:allf=t+u,format=gray,scale=${W}:${H}:flags=neighbor,setsar=1,
  geq=lum='
    if(lt(T,0.12), 0,
      lte(abs(X-W/2), if(lt(T,0.30), W/2*min(1,(T-0.12)/0.18), W/2)) *
      lte(abs(Y-H/2), if(lt(T,0.30), 2, 2+(H/2-2)*(1-pow(1-min(1,(T-0.30)/0.30),3)))) *
      ( 255*if(lt(T,0.30),1,max(0,1-(T-0.30)/0.6))
        + min(255, p(X,Y)*0.85 + 45*exp(-pow((Y-mod(T*0.45*H,1.4*H)+0.2*H)/(0.07*H),2)))
          * (1-if(lt(T,0.30),1,max(0,1-(T-0.30)/0.6))) )
    )':cb=128:cr=128,
  format=yuv420p [snow];

[0:v] trim=0:2,setpts=PTS-STARTPTS,${FIT},format=gbrp,
  geq=
    r='r(X+(28*pow(1-T/2,2)+3*(1-T/2))*sin(Y/9+T*37)+7*(1-T/2), Y)':
    g='g(X+(28*pow(1-T/2,2)+3*(1-T/2))*sin(Y/9+T*37), Y)':
    b='b(X+(28*pow(1-T/2,2)+3*(1-T/2))*sin(Y/9+T*37)-7*(1-T/2), Y)',
  format=yuv420p,tpad=start_duration=3:color=black [vid];

[snow][vid] blend=all_expr='
    A*(1-if(lt(T,3),0, clip(0.12+0.88*pow((T-3)/2,1.3) + 0.08*sin(T*61)*(1-(T-3)/2),0,1)))
  + B*   if(lt(T,3),0, clip(0.12+0.88*pow((T-3)/2,1.3) + 0.08*sin(T*61)*(1-(T-3)/2),0,1))',
  geq=lum='lum(X,Y)*(1-0.20*(1-clip((T-3.6)/1.4,0,1))*(1-mod(Y,3)/2))':cb='cb(X,Y)':cr='cr(X,Y)',
  eq=brightness='0.03*sin(t*47)*(1-clip((t-3.6)/1.4,0,1))':eval=frame,
  vignette=angle='PI/4.5*(1-clip((t-3.6)/1.4,0,1))':eval=frame,
  format=yuv420p [vintro];

aevalsrc='if(gte(t,0.12), 0.9*sin(2*PI*48*(t-0.12))*exp(-(t-0.12)*9) + 0.35*sin(2*PI*120*(t-0.12))*exp(-(t-0.12)*25), 0)
          + if(gte(t,0.30), 0.012*sin(2*PI*15600*t)*exp(-(t-0.30)*0.8), 0)':s=${SR}:d=5,
  aformat=channel_layouts=stereo [thump];
anoisesrc=d=5:c=white:a=0.4:r=${SR},highpass=f=250,lowpass=f=7500,
  volume='if(lt(t,0.25),0, min(1,(t-0.25)/0.25)) * if(lt(t,3),1, 1-(t-3)/2) * (0.85+0.15*sin(2*PI*7*t))':eval=frame,
  aformat=channel_layouts=stereo [static];
EOF

AMIX_IN="[thump][static]"; NA=2
if [[ $HAS_AUDIO == 1 ]]; then
  cat >> "$FG" <<EOF
[0:a] atrim=0:2,asetpts=PTS-STARTPTS,aresample=${SR},aformat=channel_layouts=stereo,
  volume='min(1,0.2+0.8*t/2)':eval=frame,adelay=3000:all=1 [vaud];
EOF
  AMIX_IN+="[vaud]"; NA=3
fi
echo "${AMIX_IN} amix=inputs=${NA}:duration=first:normalize=0,alimiter=limit=0.95 [aintro]" >> "$FG"

if [[ "$FULL" == "--full" ]]; then
  cat >> "$FG" <<EOF
;
[0:v] trim=start=2,setpts=PTS-STARTPTS,${FIT},format=yuv420p [vrest];
EOF
  if [[ $HAS_AUDIO == 1 ]]; then
    echo "[0:a] atrim=start=2,asetpts=PTS-STARTPTS,aresample=${SR},aformat=channel_layouts=stereo [arest];" >> "$FG"
  else
    REST_DUR="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")"
    echo "anullsrc=r=${SR}:cl=stereo,atrim=0:$(echo "$REST_DUR - 2" | bc -l) [arest];" >> "$FG"
  fi
  echo "[vintro][aintro][vrest][arest] concat=n=2:v=1:a=1 [vout][aout]" >> "$FG"
  MAPV="[vout]"; MAPA="[aout]"
else
  MAPV="[vintro]"; MAPA="[aintro]"
fi

ffmpeg -hide_banner -loglevel warning -stats \
  -i "$SRC" \
  -filter_complex_script "$FG" -map "$MAPV" -map "$MAPA" \
  -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r "$FPS" \
  -c:a aac -b:a 192k -movflags +faststart "$OUT"

echo "OK → $OUT"
