#!/bin/bash
#
# Double-click this to bundle the current version of the companion as a real
# macOS .app — something Finder, Spotlight and the Dock all treat as an app,
# rather than a project you launch from a terminal.
#
# It rebuilds first (see run.command for what that step does and why), then
# hands the whole project — including digest.py and notify.py, which the
# packaged app still shells out to and appends to at runtime — to
# electron-packager. The result lands in dist/, and a symlink named
# "To-Do Companion.app" is left at the repo root, where kanban/server.py's own
# hint and the README already expect to find it. The symlink is what stays
# current: re-run this after a change and it points at the new build without
# anything else needing to move.

set -euo pipefail

cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$1"; }

APP_NAME="To-Do Companion"
BUNDLE_ID="com.tiagopedras.todocompanion"

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

# --- build ---------------------------------------------------------------

say "Building…"
npm run build >/dev/null

# --- package ---------------------------------------------------------------

say "Bundling $APP_NAME.app into dist/…"

# A clean slate rather than trusting --overwrite: Finder drops a .DS_Store
# into any folder it has been shown, and that alone is enough to make
# electron-packager's own rmdir fail with ENOTEMPTY on the next run.
rm -rf dist

./node_modules/.bin/electron-packager . "$APP_NAME" \
  --platform=darwin \
  --arch=arm64 \
  --out=dist \
  --app-bundle-id="$BUNDLE_ID" \
  --icon=resources/icon.icns \
  --overwrite \
  --no-asar \
  --prune=false \
  --ignore='^/src($|/)' \
  --ignore='^/__pycache__($|/)' \
  --ignore='^/dist($|/)' \
  --ignore='^/\.git($|/)' \
  --ignore='^/\.claude($|/)' \
  --ignore='^/[^/]+\.app$'

APP_PATH="dist/$APP_NAME-darwin-arm64/$APP_NAME.app"

# The name every existing reference (kanban/server.py's hint, the README,
# launchd if it's ever wired up) already expects, one level up at the repo
# root — same place build-app.command used to leave a real bundle. A symlink
# here does the same job: Finder and `open` both follow it as if it were the
# app, and re-running this script after a change repoints it without anything
# else needing to move.
LINK_PATH="../$APP_NAME.app"
# rm -rf first: build-app.command used to leave a real bundle there, and
# `ln -sfn` on an existing real directory creates the link *inside* it
# instead of replacing it. Only ever removes something this same recipe
# produced — either a real bundle from before this rewrite, or a symlink
# from a previous run of this script.
rm -rf "$LINK_PATH"
ln -sfn "$(pwd)/$APP_PATH" "$LINK_PATH"

say "$APP_NAME.app is ready:"
echo "  companion/$APP_PATH"
echo "  $APP_NAME.app -> always points at the latest build (repo root)"
open -R "$LINK_PATH"

echo
read -r -p "Press return to close this window." _
