#!/bin/bash
# Kept so what already calls this still works: the board's Run now
# (kanban/server.py runs `run.sh --force --dataset <list>`) and anyone's habit.
# The night itself is the shared runner's since 21 Sep 2026, through run.py;
# see hooks.py beside this and PACKAGES/agents_engine/RUNNER.md. The hourly
# wake is shared too, so nothing schedules this file any more.
#
#   ./agents/plan-agent/run.sh                   a scheduled wake, as the runner would
#   ./agents/plan-agent/run.sh --dataset twinkl  one named list, now
#   ./agents/plan-agent/run.sh --dry-run         the batch, no spend, any hour
#   ./agents/plan-agent/run.sh --task "..."      one task by hand
#   ./agents/plan-agent/run.sh --force           every list now, ignoring the hours

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${PLANNING_PYTHON:-python3}"
DRY=0; FORCE=0; ONLY=""; TASK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --force)   FORCE=1 ;;
    --dataset) ONLY="${2:-}"; shift ;;
    --task)    TASK="${2:-}"; shift ;;
  esac
  shift
done

TARGET=()
[ -n "$ONLY" ] && TARGET=(--target "$ONLY")
if [ "$DRY" -eq 1 ]; then
  exec "$PY" "$HERE/run.py" --dry-run "${TARGET[@]+"${TARGET[@]}"}"
elif [ -n "$TASK" ]; then
  # One task belongs to the list the board is showing unless a list is named.
  [ -z "$ONLY" ] && TARGET=(--target "$("$PY" -c 'import sys;sys.path.insert(0,sys.argv[1]);import paths;print(paths.pointer())' "$HERE")")
  exec "$PY" "$HERE/run.py" --now "${TARGET[@]}" --item "$TASK"
elif [ "$FORCE" -eq 1 ] || [ -n "$ONLY" ]; then
  exec "$PY" "$HERE/run.py" --now "${TARGET[@]+"${TARGET[@]}"}"
else
  exec "$PY" "$HERE/run.py" --wake
fi
