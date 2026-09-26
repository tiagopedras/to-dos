#!/bin/bash
# The Implement agent by hand, on the shared runner through run.py. The hourly
# wake calls run.py --wake itself (agent.json), and does nothing until hours
# are set for a list on the agents dashboard.
#
#   ./agents/implement-agent/run.sh --dry-run            what would run, no spend, any hour
#   ./agents/implement-agent/run.sh --dataset twinkl     one list, now, ignoring the hours
#   ./agents/implement-agent/run.sh --task "..."         one task by title, now

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="${PLANNING_PYTHON:-python3}"
DRY=0; ONLY=""; TASK=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --dataset) ONLY="${2:-}"; shift ;;
    --task)    TASK="${2:-}"; shift ;;
  esac
  shift
done

TARGET=()
[ -n "$ONLY" ] && TARGET=(--target "$ONLY")
if [ "$DRY" -eq 1 ]; then
  exec "$PY" "$HERE/run.py" --now --dry-run "${TARGET[@]+"${TARGET[@]}"}"
elif [ -n "$TASK" ]; then
  [ -z "$ONLY" ] && TARGET=(--target "$("$PY" -c 'import sys;sys.path.insert(0,sys.argv[1]);import paths;print(paths.pointer())' "$HERE/../plan-agent")")
  exec "$PY" "$HERE/run.py" --now "${TARGET[@]}" --item "$TASK"
else
  exec "$PY" "$HERE/run.py" --now "${TARGET[@]+"${TARGET[@]}"}"
fi
