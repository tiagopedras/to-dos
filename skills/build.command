#!/bin/bash
# Packages every pa-* skill in this folder into skills/dist/<name>.skill.
# Double-click it, or run it from a terminal.
#
# A .skill file is a plain zip with SKILL.md at its root, so the whole job is
# copy, prune, zip. The reason it is a script rather than a line of `zip` typed
# when needed is the staging in the middle: a skill has to stand alone once it
# is installed, and pa-checkin needs the board's `repeat:` parser and bank
# holiday list, which live in kanban/todo.py and are not inside the skill.
#
# That file used to be transcribed into the skill by hand, which meant two
# Python ports of one set of rules with nothing keeping them in step. Now
# check_todo.py imports it: from the repo it reaches the original four folders
# up, and from an installed skill it finds the copy this script stages beside
# it. One source, two ways of reaching it, and no second copy in git.
#
# Nothing here is gitignored — the .skill files are committed, so a machine that
# only wants to install them does not need this script at all.
set -e
cd "$(dirname "$0")"
ROOT="$(cd .. && pwd)"
DIST="$(pwd)/dist"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$DIST"

for dir in */ ; do
  name="${dir%/}"
  [ "$name" = "dist" ] && continue
  [ -f "$name/SKILL.md" ] || continue

  # Copy, then prune the things macOS and Python leave lying about. They are
  # invisible locally and would be shipped to anyone installing the skill.
  work="$STAGE/$name"
  rm -rf "$work"
  cp -R "$name" "$work"
  find "$work" -name '.DS_Store' -delete
  find "$work" -name '__pycache__' -type d -prune -exec rm -rf {} +
  find "$work" -name '*.pyc' -delete

  # The one skill with a script, and so the one that needs the board's reader
  # travelling with it. Staged rather than committed, so the copy inside the
  # zip is always as new as the zip.
  if [ "$name" = "pa-checkin" ]; then
    cp "$ROOT/kanban/todo.py" "$work/scripts/todo.py"
  fi

  # -X drops the extended attributes and resource forks; without it every zip
  # built on a Mac differs from the last one even when nothing changed.
  rm -f "$DIST/$name.skill"
  ( cd "$work" && zip -q -r -X "$DIST/$name.skill" . )
  printf '  %-20s %s\n' "$name.skill" "$(du -h "$DIST/$name.skill" | cut -f1)"
done

echo
echo "Written to skills/dist/. Install one by dragging it onto Claude, or with"
echo "  claude plugin install <path to the .skill file>"
