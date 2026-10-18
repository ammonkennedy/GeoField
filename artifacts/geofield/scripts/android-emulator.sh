#!/bin/bash
set -euo pipefail

sdk_dir="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
avd_name="${1:-Medium_Phone_API_37.0}"

# Vulkan on this emulator produces repeated/stale WebView tiles. Keep hardware
# graphics available for maps, but use the OpenGL path and a fresh boot.
exec "$sdk_dir/emulator/emulator" -avd "$avd_name" -gpu host \
  -feature -Vulkan -cores 4 -no-snapshot-load -no-snapshot-save
