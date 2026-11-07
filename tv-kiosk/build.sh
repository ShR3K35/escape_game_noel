#!/usr/bin/env bash
# Construit l'APK « TV Noël » sans Gradle (aapt2 + javac + d8 + apksigner).
# Prérequis : JDK 17+, Android SDK avec build-tools;37.0.0 et platforms;android-30.
# Usage : ./build.sh            -> build/noel-tv-kiosk.apk
#         ./build.sh --install  -> construit puis installe sur la TV ($TV, ex. TV=192.168.1.20:5555)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-$HOME/android-sdk}"
BT="$SDK/build-tools/37.0.0"
JAR="$SDK/platforms/android-30/android.jar"
OUT="$HERE/build"
KEYSTORE="${KIOSK_KEYSTORE:-$HOME/.config/noel-kiosk/kiosk.jks}"
VERSION_CODE="${VERSION_CODE:-$(date +%y%m%d%H)}"

rm -rf "$OUT" && mkdir -p "$OUT/classes" "$OUT/gen" "$OUT/dex"

"$BT/aapt2" compile --dir "$HERE/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" --manifest "$HERE/AndroidManifest.xml" "$OUT/res.zip" \
  --java "$OUT/gen" --min-sdk-version 24 --target-sdk-version 30 --version-code "$VERSION_CODE" --version-name 1.0

javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR:$BT/core-lambda-stubs.jar" -classpath "$JAR" -d "$OUT/classes" \
  $(find "$HERE/src" "$OUT/gen" -name '*.java')

"$BT/d8" --release --min-api 24 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"
python3 -c "import sys,zipfile; zipfile.ZipFile(sys.argv[1],'a').write(sys.argv[2],'classes.dex')" "$OUT/unsigned.apk" "$OUT/dex/classes.dex"
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass noelkiosk -keypass noelkiosk -alias kiosk \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Noel 2026 Kiosk" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:noelkiosk --out "$OUT/noel-tv-kiosk.apk" "$OUT/aligned.apk"
echo "APK : $OUT/noel-tv-kiosk.apk"

if [ "${1:-}" = "--install" ]; then
  exec "$HERE/setup-tv.sh" --install-only
fi
