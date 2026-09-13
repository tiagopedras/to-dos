#!/bin/bash
# Double-click this file to open the to-do board.
cd "$(dirname "$0")" || exit 1

# The board has a React half now (kanban/ui/, built to kanban/dist/ by vite),
# so there is a build step where there never used to be one. It runs here, on
# every launch, rather than being committed as build output or left for the
# server to notice: the build is then never the thing that is out of date, and
# an edit to a .tsx is live the next time the board is opened with nothing to
# remember. It costs a couple of seconds each morning.
#
# To-Do Board.app execs this file, so the Dock launcher gets the build too and
# there is only one place that knows about it.
if [ ! -d node_modules ]; then
  echo "The board needs its dependencies before it can build:"
  echo
  echo "    cd \"$(pwd)\" && npm install"
  echo
  echo "That is a one-off after a fresh clone. Nothing else needs it."
  read -r -p "Press return to close. "
  exit 1
fi

if ! npm run build --silent; then
  echo
  echo "The board's front end did not build, so it has not been started —"
  echo "the error above is vite's. The last good build in kanban/dist/ is"
  echo "untouched, so fixing the error and running this again is all it needs."
  read -r -p "Press return to close. "
  exit 1
fi

exec /usr/bin/env python3 kanban/server.py
