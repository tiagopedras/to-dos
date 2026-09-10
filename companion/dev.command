#!/bin/bash
#
# Double-click this to run the companion in dev mode: hot reload on every
# save, instead of the build-once-and-launch that run.command does.
#
# Finder gives a shell almost no PATH, so this finds node the way a login
# shell would before handing off to `npm run dev`. See run.command for the
# production launcher, and for why this dance is necessary at all.

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

# --- run -----------------------------------------------------------------

say "Starting the companion in dev mode. Close the window, or press control-C here, to stop."
npm run dev
