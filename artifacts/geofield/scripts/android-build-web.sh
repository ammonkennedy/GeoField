#!/bin/bash
set -euo pipefail
export PATH="${HOME}/.volta/bin:${HOME}/Library/pnpm:/opt/homebrew/bin:/usr/local/bin:${PATH}"
app_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$app_dir"
BASE_PATH=/ pnpm run build
pnpm exec cap copy android
