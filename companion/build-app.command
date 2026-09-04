#!/bin/bash
# Builds "To-Do Companion.app" at the root of the repo. Double-click it, or run
# it from a terminal.
#
# The bundle is gitignored, the same as the board's Dock launcher: it is a
# plist, a shell script and a copied icon, so the recipe is worth keeping and
# the build is not. Run this once on a new machine, or after changing anything
# below, and the app appears next to run.command ready to double-click.
set -e
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
APP="$ROOT/To-Do Companion.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$ROOT/kanban/icon.icns" "$APP/Contents/Resources/companion.icns"

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>To-Do Companion</string>
  <key>CFBundleDisplayName</key><string>To-Do Companion</string>
  <key>CFBundleIdentifier</key><string>com.tiagopedras.todocompanion</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>companion</string>
  <key>CFBundleIconFile</key><string>companion</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <!-- Menu bar only: no Dock icon, no app switcher entry, no menu bar of its
       own. The status item is the whole of the interface. -->
  <key>LSUIElement</key><true/>
</dict>
</plist>
PLIST

cat > "$APP/Contents/MacOS/companion" <<'LAUNCHER'
#!/bin/bash
# Launcher for the menu bar companion.
#
# Two jobs, both of them about finding a Python.
#
# First, an app launched from Finder gets a bare PATH, so `env python3` finds
# the Command Line Tools build, which has no PyObjC and cannot draw a menu bar
# item. The loop below tries the likely installs in order and takes the first
# that can actually import AppKit.
#
# Second, a notification carries the name of the bundle the running process
# belongs to, and running the framework's own python3 means that bundle is
# Python.app. So the framework's interpreter stub is copied in here beside this
# script and run from there instead: same interpreter, this app's identity. The
# copy has to be re-signed, because a signature covers the path a binary sits
# at, and macOS kills a copied binary whose signature no longer matches.
#
# The copy is refreshed whenever it stops working, so a Python upgrade heals
# itself on the next launch rather than needing a build step nobody remembers.

LOG="$HOME/Library/Logs/To-Do Companion.log"
mkdir -p "$(dirname "$LOG")"
exec >> "$LOG" 2>&1
echo "--- $(date) starting"

HERE="$(cd "$(dirname "$0")" && pwd)"
DIR="$(cd "$HERE/../../.." && pwd)"
[ -f "$DIR/companion/app.py" ] || DIR="/Users/tiagopedras/Code/to-dos"
STUB="$HERE/pythonstub"

works() { [ -x "$1" ] && "$1" -c "import AppKit" > /dev/null 2>&1; }

if works "$STUB"; then
  exec "$STUB" "$DIR/companion/app.py" "$@"
fi

for PY in \
  /Library/Frameworks/Python.framework/Versions/Current/bin/python3 \
  /Library/Frameworks/Python.framework/Versions/3.11/bin/python3 \
  /opt/homebrew/bin/python3 \
  /usr/local/bin/python3 \
  /usr/bin/python3
do
  works "$PY" || continue
  # Rebuild the stub from this interpreter if it has one. `sys.prefix` gives the
  # install root; every framework build keeps its bundle stub in the same place
  # under it.
  SRC="$("$PY" -c 'import sys; print(sys.prefix)')/Resources/Python.app/Contents/MacOS/Python"
  if [ -x "$SRC" ]; then
    echo "rebuilding the interpreter stub from $SRC"
    cp -f "$SRC" "$STUB" && codesign -f -s - "$STUB" && works "$STUB" && \
      exec "$STUB" "$DIR/companion/app.py" "$@"
  fi
  # No stub available: still run, and the app falls back to posting its
  # notifications through osascript, where they are attributed to Script Editor.
  echo "no bundle stub for $PY; notifications will come from osascript"
  exec "$PY" "$DIR/companion/app.py" "$@"
done

/usr/bin/osascript -e 'display alert "To-Do Companion" message "No Python on this machine has PyObjC, so the menu bar item cannot be drawn. Install it with: python3 -m pip install pyobjc-framework-Cocoa"'
exit 1
LAUNCHER

chmod +x "$APP/Contents/MacOS/companion"
# Ad-hoc, so macOS has a stable identity to hang notification permission on. It
# is not a developer signature and Gatekeeper is not fooled by it; it only makes
# the bundle self-consistent.
codesign -f -s - "$APP" > /dev/null 2>&1 || true
echo "Built $APP"
