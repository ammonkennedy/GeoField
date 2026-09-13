#!/bin/bash
# Called before Xcode copies the app's resources, for both Run and Archive.
set -euo pipefail

# Xcode launched from Finder does not inherit the Terminal PATH.
export PATH="${HOME}/.volta/bin:${HOME}/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:${PATH}"
if ! command -v node >/dev/null 2>&1 && [ -s "${HOME}/.nvm/nvm.sh" ]; then
  # nvm is not guaranteed to support nounset during initialization.
  set +u
  . "${HOME}/.nvm/nvm.sh"
  set -u
fi

for tool in node pnpm; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: GeoField requires $tool. Install Node.js and pnpm, then reopen Xcode."
    exit 1
  fi
done

app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$app_dir"
if [ ! -d node_modules ]; then
  echo "error: GeoField dependencies are missing. Run pnpm install --frozen-lockfile from the repository root."
  exit 1
fi

echo "Building GeoField web app for Xcode..."
# Native assets are served from the root, regardless of web deployment settings.
BASE_PATH=/ pnpm run build
# Only copy assets/configuration here. Updating native packages during an active
# Xcode build would change the Swift package graph after dependency resolution.
pnpm exec cap copy ios
echo "GeoField web assets are ready for Xcode."
