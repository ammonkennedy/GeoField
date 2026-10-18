#!/bin/bash
set -euo pipefail
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$app_dir"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 21)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
if [ ! -f android/keystore.properties ]; then
  echo 'Missing private android/keystore.properties release signing configuration.' >&2
  exit 1
fi
pnpm run typecheck
pnpm exec cap sync android
cd android
./gradlew bundleRelease
"$JAVA_HOME/bin/jarsigner" -verify app/build/outputs/bundle/release/app-release.aab
