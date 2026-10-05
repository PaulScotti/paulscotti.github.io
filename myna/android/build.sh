#!/bin/sh
# Builds ../myna.apk, the Android shell around paulscotti.com/myna, without Gradle: aapt2 packs the manifest
# and icon, javac and d8 compile Main.java, apksigner signs it with the key in ~/.config/myna. Keep a copy of
# that folder: Android only installs an update signed with the same key. The version is `apk` in ../config.js.
set -e
cd "$(dirname "$0")"
SDK=/opt/homebrew/share/android-commandlinetools
TOOLS=$SDK/build-tools/37.0.0
JAR=$SDK/platforms/android-37.0/android.jar
VERSION=$(sed -n 's/^ *apk: \([0-9]*\),.*/\1/p' ../config.js)
rm -rf build
mkdir -p build/classes
$TOOLS/aapt2 compile --dir res -o build/res.zip
$TOOLS/aapt2 link -I $JAR --manifest AndroidManifest.xml --version-code "$VERSION" --version-name "$VERSION" -o build/myna.apk build/res.zip
javac --release 17 -cp $JAR -d build/classes Main.java
$TOOLS/d8 --release --min-api 36 --lib $JAR --output build build/classes/com/paulscotti/myna/*.class
(cd build && zip -q myna.apk classes.dex)
$TOOLS/zipalign -f 4 build/myna.apk build/aligned.apk
$TOOLS/apksigner sign --v4-signing-enabled false --ks ~/.config/myna/release.keystore --ks-pass file:"$HOME/.config/myna/password" --out ../myna.apk build/aligned.apk
echo "Built myna.apk, version $VERSION"
