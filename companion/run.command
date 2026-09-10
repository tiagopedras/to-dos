#!/bin/bash
#
# Double-click this to build and run the companion.
#
# It exists because launching from Finder is not the same as launching from a
# terminal: Finder gives a shell almost no PATH, so nvm's node is invisible and
# a plain `npm start` fails before it begins. This finds node the way a login
# shell would, checks the two things that are usually missing (dependencies and
# the Electron binary, which npm skips often enough to be worth handling), then
# builds and runs.

set -euo pipefail

cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$1"; }

# --- find node ---------------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
  if [ -s "$HOME/.nvm/nvm.sh" ]; then
    export NVM_DIR="$HOME/.nvm"
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh" >/dev/null 2>&1 || true
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  for candidate in /opt/homebrew/bin /usr/local/bin "$HOME/.volta/bin" "$HOME/.fnm"; do
    if [ -x "$candidate/node" ]; then
      export PATH="$candidate:$PATH"
      break
    fi
  done
fi

if ! command -v node >/dev/null 2>&1; then
  fail "Can't find node on this machine."
  echo "Install Node 20 or newer, then run this again."
  echo
  read -r -p "Press return to close." _
  exit 1
fi

say "node $(node -v)"

# --- dependencies ------------------------------------------------------------

if [ ! -d node_modules ]; then
  say "Installing dependencies (first run, this takes a minute)…"
  npm install
fi

if [ ! -d node_modules/electron/dist ]; then
  say "Fetching the Electron runtime…"
  node node_modules/electron/install.js
fi

# --- run ---------------------------------------------------------------------

say "Building…"
npm run build >/dev/null

# Launch Electron directly rather than through `npm start`, which runs
# electron-vite preview and rebuilds everything a second time.
say "Starting the companion. Quit it from its tray icon, or press control-C here, to stop."
./node_modules/.bin/electron . || true

echo
say "Companion closed."
read -r -p "Press return to close this window." _
