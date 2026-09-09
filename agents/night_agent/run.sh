#!/bin/bash
# The night agent's entry point. launchd wakes this every hour, all day; almost
# every wake costs a few milliseconds and stops.
#
# Every hour rather than only at night, and that is deliberate. The schedule
# lives in data/night-agent-schedule.json, where the agents dashboard can edit
# it, and a plist that only woke between certain hours would silently override
# whatever the dashboard said. So the wake is dumb and hourly, the schedule
# decides, and twenty-four wakes a day cost a few milliseconds each.
#
# Three gates before anything is allowed to spend, in this order, cheapest
# first:
#
#   1. The schedule. Not one of tonight's hours and this exits immediately.
#      schedule.py also holds a floor the dashboard cannot write under, so a
#      wake inside the working day is refused whatever the file says. launchd
#      fires a job missed while the lid was shut, so without this a laptop
#      closed on Friday runs at 09:00 on Monday while he is reading the board.
#   2. The lock. One run at a time. An hourly wake landing on top of a batch
#      still going is the normal case, not an edge one.
#   3. The window. core/windows.py decides ride, open or stop against the one test
#      that matters: the window being spent in must expire by 07:00.
#
#   ./agents/night_agent/run.sh              a real run, if all three gates pass
#   ./agents/night_agent/run.sh --dry-run    the decision and the batch, no spend, any hour
#   ./agents/night_agent/run.sh --task "..." one task by hand, skipping the schedule and window
#   ./agents/night_agent/run.sh --force      ignore the schedule and the window, spend anyway

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Two levels up, not one. This agent moved from night_agent/ to
# agents/night_agent/ and this line did not move with it, so ROOT became
# to-dos/agents — a folder with no core/ and no data/ in it. The damage was
# silent and total: mkdir on a lock inside a directory that does not exist
# fails, the failure path reads a failed mkdir as "someone else holds it", and
# every wake from 6 Sep to 9 Sep 2026 logged "a run is already going" and
# stopped. Nothing ran and nothing said so.
ROOT="$(dirname "$(dirname "$HERE")")"
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
  # $HERE rather than a path relative to the working directory. The relative
  # one resolved only because ROOT was wrong in the way it was; correcting ROOT
  # would have quietly stopped every log line from being written.
  local dir; dir="$($PY -c 'import sys;sys.path.insert(0,sys.argv[1]);import paths;print(paths.log_path())' "$HERE")"
  mkdir -p "$(dirname "$dir")"
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$dir"
}

# --- 1. the schedule ---------------------------------------------------------
# A run by hand, a dry run and --force all skip this. Everything else is the
# scheduler asking whether this is one of the hours it was told to work.
#
# The hours used to be written here as `19` and `7`, and again as twelve entries
# in the plist. Now they are in data/night-agent-schedule.json, where the agents
# dashboard can edit them, and the plist is woken every hour so that the file
# can mean what it says. schedule.py holds the floor that no schedule can go
# under, so this still refuses to start in the working day however the file has
# been edited — the guard the hardcoded hours used to be.
if [ "$DRY" -eq 0 ] && [ "$FORCE" -eq 0 ] && [ "$MANUAL" -eq 0 ]; then
  if ! $PY "$HERE/schedule.py" --due; then
    logline "wake at $(date +%H):00 — not a scheduled hour, nothing done"
    exit 0
  fi
fi

# --- 2. the lock -------------------------------------------------------------
LOCK="$ROOT/data/.night-agent.lock"
if [ "$DRY" -eq 0 ]; then
  # The parent, first. `mkdir` on a lock whose parent is missing fails the same
  # way as one whose lock is held, and the branch below reads that failure as
  # "a run is already going" — which is exactly how a wrong ROOT above stopped
  # this agent dead for three nights while logging something reassuring.
  mkdir -p "$(dirname "$LOCK")" 2>/dev/null
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
