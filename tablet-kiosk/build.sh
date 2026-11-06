#!/usr/bin/env bash
# Construit l'APK du kiosque des lutins sans Gradle (aapt2 + javac + d8 + apksigner).
# Prérequis : JDK 17+, Android SDK avec build-tools;37.0.0 et platforms;android-30.
# Usage : ./build.sh            -> build/noel-kiosk.apk
#         ./build.sh --install  -> construit puis installe via adb (adb.exe Windows depuis WSL si présent)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SDK="${ANDROID_HOME:-$HOME/android-sdk}"
BT="$SDK/build-tools/37.0.0"
JAR="$SDK/platforms/android-30/android.jar"
OUT="$HERE/build"
KEYSTORE="${KIOSK_KEYSTORE:-$HOME/.config/noel-kiosk/kiosk.jks}"
ADB="${ADB:-$(command -v adb || echo /mnt/c/platform-tools/adb.exe)}"

rm -rf "$OUT" && mkdir -p "$OUT/classes" "$OUT/gen" "$OUT/dex"

"$BT/aapt2" compile --dir "$HERE/res" -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$JAR" --manifest "$HERE/AndroidManifest.xml" "$OUT/res.zip" \
  --java "$OUT/gen" --min-sdk-version 23 --target-sdk-version 30 --version-code 1 --version-name 1.0

javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$JAR:$BT/core-lambda-stubs.jar" -classpath "$JAR" -d "$OUT/classes" \
  $(find "$HERE/src" "$OUT/gen" -name '*.java')

"$BT/d8" --release --min-api 23 --lib "$JAR" --output "$OUT/dex" $(find "$OUT/classes" -name '*.class')
cp "$OUT/base.apk" "$OUT/unsigned.apk"
python3 -c "import sys,zipfile; zipfile.ZipFile(sys.argv[1],'a').write(sys.argv[2],'classes.dex')" "$OUT/unsigned.apk" "$OUT/dex/classes.dex"
"$BT/zipalign" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

if [ ! -f "$KEYSTORE" ]; then
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass noelkiosk -keypass noelkiosk -alias kiosk \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Noel 2026 Kiosk" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:noelkiosk --out "$OUT/noel-kiosk.apk" "$OUT/aligned.apk"
echo "APK : $OUT/noel-kiosk.apk"

if [ "${1:-}" = "--install" ]; then
  APK="$OUT/noel-kiosk.apk"
  case "$ADB" in *.exe) cp "$APK" /mnt/c/platform-tools/noel-kiosk.apk; APK='C:\platform-tools\noel-kiosk.apk';; esac
  "$ADB" install -r "$APK"
fi
