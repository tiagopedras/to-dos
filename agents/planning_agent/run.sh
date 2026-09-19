#!/bin/bash
# The planning agent's entry point. launchd wakes this every hour, all day; almost
# every wake costs a few milliseconds and stops.
#
# Every hour rather than only at night, and that is deliberate. The schedule
# lives in data/planning-agent-schedule.json, where the agents dashboard can edit
# it, and a plist that only woke between certain hours would silently override
# whatever the dashboard said. So the wake is dumb and hourly, the schedule
# decides, and twenty-four wakes a day cost a few milliseconds each.
#
# One wake, possibly several lists. Since 19 Sep 2026 the schedule is kept per
# dataset, so a wake asks which lists name this hour and runs each of them in
# turn, under its own lock and against its own budget. They are sequential
# rather than parallel: two batches talking to the same API at once buys
# nothing, and giving two lists different hours keeps them out of each other's
# way anyway.
#
# Two gates before anything is allowed to spend, in this order, cheapest first:
#
#   1. The schedule. No list names this hour and this exits immediately.
#      schedule.py also holds a floor the dashboard cannot write under, so a
#      wake inside the working day is refused whatever the file says. launchd
#      fires a job missed while the lid was shut, so without this a laptop
#      closed on Friday runs at 09:00 on Monday while he is reading the board.
#   2. The lock, one per list. One run at a time per list. An hourly wake
#      landing on top of a batch still going is the normal case, not an edge
#      one. Per list rather than one for the agent, so a batch overrunning on
#      one list does not cost the other one its night.
#
# There was a third until 9 Sep 2026: a usage-window check, refusing any window
# that outlived 07:00. It went because a window is anchored to whenever the
# day's first request landed, so it moves, and hours could not be set against
# it. The schedule and its floor are what keep the morning clear now.
#
#   ./agents/planning_agent/run.sh                  every list due this hour
#   ./agents/planning_agent/run.sh --dataset twinkl  one named list
#   ./agents/planning_agent/run.sh --dry-run        the batch, no spend, any hour
#   ./agents/planning_agent/run.sh --task "..."     one task by hand, skipping the schedule
#   ./agents/planning_agent/run.sh --force          ignore the schedule, spend anyway

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Two levels up, not one. This agent moved from planning_agent/ to
# agents/planning_agent/ and this line did not move with it, so ROOT became
# to-dos/agents — a folder with no core/ and no data/ in it. The damage was
# silent and total: mkdir on a lock inside a directory that does not exist
# fails, the failure path reads a failed mkdir as "someone else holds it", and
# every wake from 6 Sep to 9 Sep 2026 logged "a run is already going" and
# stopped. Nothing ran and nothing said so.
ROOT="$(dirname "$(dirname "$HERE")")"
PY="${PLANNING_PYTHON:-python3}"
cd "$ROOT" || exit 1

DRY=0; FORCE=0; MANUAL=0; ONLY=""; ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; ARGS+=("$1") ;;
    --force)   FORCE=1 ;;
    --dataset) ONLY="${2:-}"; shift ;;
    --task)    MANUAL=1; ARGS+=("$1" "${2:-}"); shift ;;
    *)         ARGS+=("$1") ;;
  esac
  shift
done

logline() {
  # $HERE rather than a path relative to the working directory. The relative
  # one resolved only because ROOT was wrong in the way it was; correcting ROOT
  # would have quietly stopped every log line from being written.
  #
  # Called with PLANNING_DATASET already exported, so the line lands in the log
  # of the list it is about — paths.log_path() sits inside that list's own
  # plans folder, which is what keeps one list's night out of another's log.
  local dir; dir="$($PY -c 'import sys;sys.path.insert(0,sys.argv[1]);import paths;print(paths.log_path())' "$HERE")"
  mkdir -p "$(dirname "$dir")"
  printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$dir"
}

# --- 1. the schedule ---------------------------------------------------------
# A run by hand, a dry run and --force all skip this and take the list they were
# given, or the one `data/.current` points at. Everything else asks which lists
# named this hour, which is the scheduler's whole question now.
#
# The hours used to be written here as `19` and `7`, and again as twelve entries
# in the plist. Now they are in data/planning-agent-schedule.json, where the agents
# dashboard can edit them, and the plist is woken every hour so that the file
# can mean what it says. schedule.py holds the floor that no schedule can go
# under, so this still refuses to start in the working day however the file has
# been edited — the guard the hardcoded hours used to be.
# Collected as newline-separated text rather than into an array: bash 3.2 is
# what ships with macOS, it has no `mapfile`, and an empty array under `set -u`
# is an error there rather than a length of zero.
if [ -n "$ONLY" ]; then
  LISTS="$ONLY"
elif [ "$MANUAL" -eq 1 ]; then
  # One task by hand belongs to the list the board is showing, which is the
  # only list the task could have been read off.
  LISTS="$($PY -c 'import sys;sys.path.insert(0,sys.argv[1]);import paths;print(paths.dataset())' "$HERE")"
elif [ "$DRY" -eq 1 ] || [ "$FORCE" -eq 1 ]; then
  # Skipping the hours does not mean skipping the switch: a forced run takes
  # every list that is armed. With none armed it runs nothing and says so,
  # rather than falling back to whichever list the board is showing — the
  # dashboard's own Run now sends a list by name, and the one on the band
  # means "the ones I have armed", which can be none of them.
  LISTS="$($PY "$HERE/schedule.py" --enabled)"
  if [ -z "$LISTS" ]; then
    echo "No list is switched on. Arm one on the agents dashboard, or name one with --dataset." >&2
    exit 1
  fi
else
  LISTS="$($PY "$HERE/schedule.py" --due-now)"
  if [ -z "$LISTS" ]; then
    # Logged against the list the board is on rather than against all of them.
    # A wake that did nothing is one line about the agent, and writing it into
    # every list's log would make each of them mostly a record of the hours
    # that list was off.
    export PLANNING_DATASET="$($PY -c 'import sys;sys.path.insert(0,sys.argv[1]);import paths;print(paths.pointer())' "$HERE")"
    logline "wake at $(date +%H):00 — no list is scheduled for this hour, nothing done"
    exit 0
  fi
fi

# Everything below runs once per list, with PLANNING_DATASET exported so that
# paths.py — and so plan.py, brief.py and report.py, which ask it for every path
# they touch — resolves to that list's own folder.
run_one() {
  local DS="$1"
  export PLANNING_DATASET="$DS"

  # --- 2. the lock -----------------------------------------------------------
  local LOCK="$ROOT/data/.planning-agent-$DS.lock"
  local PIDFILE="$LOCK/pid"
  if [ "$DRY" -eq 0 ]; then
    # The parent, first. `mkdir` on a lock whose parent is missing fails the same
    # way as one whose lock is held, and the branch below reads that failure as
    # "a run is already going" — which is exactly how a wrong ROOT above stopped
    # this agent dead for three nights while logging something reassuring.
    mkdir -p "$(dirname "$LOCK")" 2>/dev/null
    if ! mkdir "$LOCK" 2>/dev/null; then
      # Is the holder alive, asked before how old the lock looks. Age alone
      # cannot tell a crash from a suspended run: a lid closed mid-batch
      # suspends the holder rather than killing it, plan.py's ten-minute
      # per-task ceiling cannot fire while the process is not being scheduled,
      # and the batch picks up where it left off when the machine wakes. That
      # happened over 6–8 Sep 2026 — the lock sat held from 06:05 on the 6th to
      # the morning of the 8th, and every hourly wake in between logged "a run
      # is already going" rather than ever clearing it.
      local STALE=""
      local HOLDER; HOLDER="$(cat "$PIDFILE" 2>/dev/null)"
      if [ -n "$HOLDER" ]; then
        # A dead PID clears whatever the mtime says; a live one is left alone
        # however old the lock looks.
        kill -0 "$HOLDER" 2>/dev/null || STALE="its holder (pid $HOLDER) is gone"
      elif [ -n "$(find "$LOCK" -maxdepth 0 -mmin +120 2>/dev/null)" ]; then
        # Only reached when there is no PID to ask: a lock taken before this
        # check existed, or one whose PID file could not be written. Two hours
        # because the per-task timeout is ten minutes and a batch of them has
        # never come close.
        STALE="it is over two hours old and names no holder"
      fi
      if [ -n "$STALE" ]; then
        logline "clearing a stale lock — $STALE"
        rm -f "$PIDFILE" 2>/dev/null
        rmdir "$LOCK" 2>/dev/null && mkdir "$LOCK" 2>/dev/null || return 0
      else
        logline "a run is already going for $DS, skipping this wake"
        return 0
      fi
    fi
    # Immediately, so a wake seconds later has a PID to test rather than falling
    # back to an mtime that will read as fresh for the next two hours.
    echo $$ > "$PIDFILE" 2>/dev/null
  fi
  # Released on the way out of this function rather than by an EXIT trap, since
  # a trap fires once and this loop may take two locks in a wake.
  _release() { [ "$DRY" -eq 0 ] && { rm -f "$PIDFILE" 2>/dev/null; rmdir "$LOCK" 2>/dev/null; }; }
  trap '_release' INT TERM

  # --- 2.5. the task briefings, a pass of its own before planning -------------
  # One cheap call per open task whose text has moved since it was last
  # briefed, regardless of its ai: tag — eligible() in pick.py only ever sees
  # ai:full tasks, a tenth of the board at best, and a briefing is read by
  # newChat() and pa too, which reach all of it. Inside the same lock as the
  # batch below rather than a second one, and stopped by its own small budget
  # rather than reaching for the planning budget in step 3. Skipped for --task
  # and --dry-run, the same two flags that skip the batch's own real spend.
  if [ "$DRY" -eq 0 ] && [ "$MANUAL" -eq 0 ]; then
    "$PY" "$HERE/brief.py" || logline "brief.py failed with exit $?"
  fi

  # --- 2.6. written reports, weekly by their own reckoning ---------------------
  # Called every scheduled wake, the same as brief.py above — what actually
  # keeps this to about once a week per definition is report.py's own due(),
  # which compares window_days against when it last rendered rather than
  # trusting a day-of-week guard here to mean the same thing for a 7-day
  # definition and a 30-day one. Most wakes find nothing due and spend nothing.
  if [ "$DRY" -eq 0 ] && [ "$MANUAL" -eq 0 ]; then
    "$PY" "$HERE/report.py" || logline "report.py failed with exit $?"
  fi

  # --- 3. this list's own budget and max_plans --------------------------------
  # The dashboard writes these into the schedule file, one entry per list, and
  # they are read back here so the batch actually spends against the number on
  # its own card. Skipped for `--task`, which plans exactly one and has no batch
  # loop for either to stop. A caller who already passed --budget or
  # --max-plans by hand wins over the schedule rather than being overwritten
  # by it.
  local RUN_ARGS=("${ARGS[@]+"${ARGS[@]}"}")
  if [ "$MANUAL" -eq 0 ]; then
    local SCHED_BUDGET SCHED_MAX
    read -r SCHED_BUDGET SCHED_MAX <<< "$($PY -c '
import sys
sys.path.insert(0, sys.argv[1])
import schedule
s = schedule.load(sys.argv[2])
print(s["budget"], s["max_plans"])
' "$HERE" "$DS" 2>/dev/null)"
    if [ -n "$SCHED_BUDGET" ] && [[ "${RUN_ARGS[*]+${RUN_ARGS[*]}}" != *"--budget"* ]]; then
      RUN_ARGS+=(--budget "$SCHED_BUDGET")
    fi
    if [ -n "$SCHED_MAX" ] && [ "$SCHED_MAX" != "0" ] && [[ "${RUN_ARGS[*]+${RUN_ARGS[*]}}" != *"--max-plans"* ]]; then
      RUN_ARGS+=(--max-plans "$SCHED_MAX")
    fi
  fi

  # A child, not exec. `exec` replaces this shell, and a replaced shell never runs
  # its cleanup — so the lock above was held for the full two-hour staleness
  # window after every successful run, and every wake in between refused to do
  # anything. Caught on the second real run, 5 Sep 2026, which is the first moment
  # a second run existed to be blocked.
  "$PY" "$HERE/plan.py" "${RUN_ARGS[@]+"${RUN_ARGS[@]}"}"
  local CODE=$?
  trap - INT TERM
  _release
  return $CODE
}

# The worst exit code any list gave, so a night where one of two failed does not
# report success. Each list still gets its run whatever the one before it did.
WORST=0
while IFS= read -r DS; do
  [ -z "$DS" ] && continue
  run_one "$DS"
  CODE=$?
  [ "$CODE" -gt "$WORST" ] && WORST=$CODE
done <<< "$LISTS"
exit $WORST
