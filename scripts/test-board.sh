#!/usr/bin/env bash
# Run the board's suites against a throwaway server, never the live one.
#
#   scripts/test-board.sh test_board.mjs timeline          # named suites
#   scripts/test-board.sh --all                             # every kanban/test_*.mjs
#   scripts/test-board.sh --no-build test_board.mjs         # skip npm run build
#
# It makes a temp folder holding one dataset, `_test`, seeded from
# kanban/demo.md, starts kanban/server.py over it on a free port
# (TODOS_DATA_ROOT, TODOS_PORT, TODOS_NO_BROWSER), and runs each suite with
# BOARD_PORT pointing there and its headless Chrome on a free debugging port
# and a profile of its own (CDP_PORT, CHROME_PROFILE). The dataset is reseeded
# before every suite. On exit, Ctrl-C included, the server and any Chrome it
# started are killed and the temp folder goes.
#
# The real data/ and its .current are never read or written: the server is
# checked to be serving `_test` from the temp folder before any suite runs.

set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 1

SUITE_TIMEOUT="${SUITE_TIMEOUT:-240}"
BUILD=1
ALL=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --all) ALL=1 ;;
    --no-build) BUILD=0 ;;
    -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) ARGS+=("$a") ;;
  esac
done

SUITES=()
if [ "$ALL" = 1 ]; then
  for f in kanban/test_*.mjs; do [ -f "$f" ] && SUITES+=("$f"); done
fi
for a in ${ARGS[@]+"${ARGS[@]}"}; do
  for c in "$a" "kanban/$a" "kanban/test_$a" "kanban/test_$a.mjs" "kanban/test_$a.py"; do
    if [ -f "$c" ]; then SUITES+=("$c"); continue 2; fi
  done
  echo "No suite called $a" >&2; exit 2
done
if [ "${#SUITES[@]}" = 0 ]; then
  echo "Name the suites to run, or pass --all. See --help." >&2; exit 2
fi

free_port() {
  # A port nothing holds, and (for test_phone.mjs, which uses two) the next one.
  python3 - <<'EOF'
import random, socket
def free(p):
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", p)); return True
    except OSError:
        return False
    finally:
        s.close()
for _ in range(200):
    p = random.randint(20000, 40000)
    if free(p) and free(p + 1):
        print(p); break
EOF
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/todo-board-test.XXXXXX")"
DATA_ROOT="$TMP/data"
SERVER_PID=""
SUITE_PID=""
WATCHDOG=""
CDP=""

cleanup() {
  [ -n "$SUITE_PID" ] && kill "$SUITE_PID" 2>/dev/null
  [ -n "$WATCHDOG" ] && { pkill -P "$WATCHDOG" 2>/dev/null; kill "$WATCHDOG" 2>/dev/null; }
  # Every Chrome started here has a profile inside $TMP, so this finds them
  # all and nothing else. Wait for them to go before deleting what they write.
  pkill -f -- "--user-data-dir=$TMP/" 2>/dev/null
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -f -- "--user-data-dir=$TMP/" >/dev/null || break
    sleep 0.3
  done
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null; wait "$SERVER_PID" 2>/dev/null
  fi
  rm -rf "$TMP" 2>/dev/null || { sleep 1; rm -rf "$TMP"; }
}
trap cleanup EXIT
trap 'echo; echo "Stopped."; exit 130' INT TERM

# The one guard that matters: whatever this resolves to must not be the repo's
# own data folder, nor anything inside it.
REAL_DATA="$(cd "$REPO/data" 2>/dev/null && pwd -P || echo "$REPO/data")"
mkdir -p "$DATA_ROOT"
RESOLVED="$(cd "$DATA_ROOT" && pwd -P)"
case "$RESOLVED/" in
  "$REAL_DATA/"*) echo "Refusing: the data root resolves to the real data/ ($RESOLVED)." >&2; exit 3 ;;
esac

seed() {
  rm -rf "$DATA_ROOT/_test"
  mkdir -p "$DATA_ROOT/_test/backups"
  cp kanban/demo.md "$DATA_ROOT/_test/todo.md"
  printf '_test' > "$DATA_ROOT/.current"
}
seed

if [ "$BUILD" = 1 ]; then
  if [ ! -d node_modules ]; then
    echo "The board needs its dependencies first: npm install" >&2; exit 1
  fi
  if ! npm run build --silent > "$TMP/build.log" 2>&1; then
    echo "npm run build failed:" >&2; tail -20 "$TMP/build.log" >&2; exit 1
  fi
fi

PORT="$(free_port)"
TODOS_DATA_ROOT="$RESOLVED" TODOS_PORT="$PORT" TODOS_NO_BROWSER=1 \
  python3 -u kanban/server.py > "$TMP/server.log" 2>&1 &
SERVER_PID=$!

ok=0
for _ in $(seq 1 60); do
  kill -0 "$SERVER_PID" 2>/dev/null || break
  if curl -sf "http://127.0.0.1:$PORT/datasets.json" 2>/dev/null \
      | grep -q '"datasets": \["_test"\], "current": "_test"'; then ok=1; break; fi
  sleep 0.25
done
if [ "$ok" != 1 ]; then
  echo "The test server did not come up serving _test on $PORT:" >&2
  tail -20 "$TMP/server.log" >&2; exit 1
fi
echo "Test server on $PORT, data in $RESOLVED"

FAILED=()
for s in "${SUITES[@]}"; do
  name="$(basename "$s")"
  log="$TMP/$name.log"
  seed
  CDP="$(free_port)"
  start=$(date +%s)
  case "$s" in
    *.mjs) BOARD_PORT="$PORT" CDP_PORT="$CDP" CHROME_PROFILE="$TMP/chrome-${name%.mjs}-" \
             node "$s" > "$log" 2>&1 & ;;
    # A Python suite here (kanban/test_bucket_brief.py) starts its own
    # in-process server over a temp folder, so it runs exactly as it would
    # by hand; it is accepted only so one command can cover a whole change.
    *.py)  python3 "$s" > "$log" 2>&1 & ;;
  esac
  pid=$!; SUITE_PID=$pid
  ( sleep "$SUITE_TIMEOUT"; kill "$pid" 2>/dev/null ) 2>/dev/null &
  WATCHDOG=$!
  wait "$pid"; code=$?
  pkill -P "$WATCHDOG" 2>/dev/null; kill "$WATCHDOG" 2>/dev/null; wait "$WATCHDOG" 2>/dev/null
  SUITE_PID=""; WATCHDOG=""
  # A suite that threw before chrome.kill() leaves its Chrome behind.
  pkill -f -- "--user-data-dir=$TMP/" 2>/dev/null
  secs=$(( $(date +%s) - start ))
  passes=$(grep -c '^ *ok ' "$log")
  # Two suites print a total rather than a line per check.
  if [ "$passes" = 0 ]; then
    passes=$(grep -Eo '^([0-9]+) (checks )?passed' "$log" | tail -1 | grep -Eo '^[0-9]+' || echo 0)
  fi
  fails=$(grep -c ' FAIL ' "$log")
  if [ "$code" = 0 ] && [ "$fails" = 0 ]; then
    printf '  PASS  %-32s %3s ok, %ss\n' "$name" "$passes" "$secs"
  else
    FAILED+=("$name")
    printf '  FAIL  %-32s %3s ok, %s failed, exit %s, %ss\n' "$name" "$passes" "$fails" "$code" "$secs"
    if [ "$fails" != 0 ]; then grep ' FAIL ' "$log" | head -15 | sed 's/^/        /'
    else tail -12 "$log" | sed 's/^/        /'; fi
  fi
done

echo
if [ "${#FAILED[@]}" = 0 ]; then
  echo "All ${#SUITES[@]} passed."
else
  echo "${#FAILED[@]} of ${#SUITES[@]} failed: ${FAILED[*]}"
  exit 1
fi
