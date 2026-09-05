#!/bin/bash
# The nightly prep agent's entry point. launchd wakes this once an hour from
# 19:00 to 06:00; almost every wake costs a few milliseconds and stops.
#
# Three gates before anything is allowed to spend, in this order, cheapest
# first:
#
#   1. The clock. Outside 19:00-06:59 this exits immediately. launchd fires a
#      job missed while the lid was shut, so without this a laptop closed on
#      Friday runs at 09:00 on Monday while he is reading the board.
#   2. The lock. One run at a time. An hourly wake landing on top of a batch
#      still going is the normal case, not an edge one.
#   3. The window. core/windows.py decides ride, open or stop against the one test
#      that matters: the window being spent in must expire by 07:00.
#
#   ./nightly/run.sh              a real run, if all three gates pass
#   ./nightly/run.sh --dry-run    the decision and the batch, no spend, any hour
#   ./nightly/run.sh --task "..." one task by hand, skipping the clock and window
#   ./nightly/run.sh --force      ignore the clock and the window, spend anyway

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
PY="${NIGHTLY_PYTHON:-python3}"
cd "$ROOT" || exit 1

DRY=0; FORCE=0; MANUAL=0; ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; ARGS+=("$1") ;;
    --force)   FORCE=1 ;;
    --task)    MANUAL=1; ARGS+=("$1" "${2:-}"); shift ;;
    *)         ARGS+=("$1") ;;
  esac
  shift
done

logline() {
  local dir; dir="$($PY -c 'import sys;sys.path.insert(0,"nightly");import paths;print(paths.log_path())')"
  mkdir -p "$(dirname "$dir")"
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$dir"
}

# --- 1. the clock ------------------------------------------------------------
# A run by hand, a dry run and --force all skip this. Everything else is the
# scheduler, and the scheduler has no business running in the morning.
if [ "$DRY" -eq 0 ] && [ "$FORCE" -eq 0 ] && [ "$MANUAL" -eq 0 ]; then
  H=$(date +%H)
  if [ "$((10#$H))" -lt 19 ] && [ "$((10#$H))" -ge 7 ]; then
    logline "wake at ${H}:00 — outside the night, nothing done"
    exit 0
  fi
fi

# --- 2. the lock -------------------------------------------------------------
LOCK="$ROOT/data/.nightly.lock"
if [ "$DRY" -eq 0 ]; then
  if ! mkdir "$LOCK" 2>/dev/null; then
    # A lock older than two hours is a crashed run, not a live one: the per-task
    # timeout is ten minutes and the batch cannot outlive its own window.
    if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
      logline "clearing a stale lock"
      rmdir "$LOCK" 2>/dev/null && mkdir "$LOCK" 2>/dev/null || exit 0
    else
      logline "a run is already going, skipping this wake"
      exit 0
    fi
  fi
  trap 'rmdir "$LOCK" 2>/dev/null' EXIT INT TERM
fi

# --- 3. the window -----------------------------------------------------------
if [ "$FORCE" -eq 0 ] && [ "$MANUAL" -eq 0 ]; then
  DECISION="$($PY "$ROOT/core/windows.py" --json 2>/dev/null)"
  ACTION="$(printf '%s' "$DECISION" | $PY -c 'import json,sys;print(json.load(sys.stdin)["action"])' 2>/dev/null)"
  WHY="$(printf '%s' "$DECISION" | $PY -c 'import json,sys;print(json.load(sys.stdin)["why"])' 2>/dev/null)"
  if [ "$DRY" -eq 1 ]; then
    printf 'window: %s — %s\n\n' "${ACTION:-?}" "${WHY:-unknown}"
  elif [ "$ACTION" != "ride" ] && [ "$ACTION" != "open" ]; then
    logline "wake — ${WHY:-no window}"
    exit 0
  else
    logline "wake — ${ACTION}: ${WHY}"
  fi
fi

# A child, not exec. `exec` replaces this shell, and a replaced shell never runs
# its EXIT trap — so the lock above was held for the full two-hour staleness
# window after every successful run, and every wake in between refused to do
# anything. Caught on the second real run, 5 Sep 2026, which is the first moment
# a second run existed to be blocked.
"$PY" "$HERE/plan.py" "${ARGS[@]+"${ARGS[@]}"}"
exit $?
