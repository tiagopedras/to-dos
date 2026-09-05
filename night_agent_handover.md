# Nightly agent — handover

Written 5 Sep 2026, at the end of the session that built it. For the session that
picks it up next.

Everything described here works and is tested. **None of it is committed**, and
the launchd job is deliberately not installed. Those are the two things to deal
with first.

Read [nightly/README.md](nightly/README.md) before changing any of it — this file
is the state of the work, that one is the design and the reasoning. Same split as
`IMPROVEMENTS.md` against the code it describes.

---

## What it does

Overnight, one sub-agent per task tagged `[ai:: full]` or `[ai:: partial]`, each
researching what the task would actually involve and writing a plan that proposes
a course of action. **Nothing executes.** The plans wait on the board's Plans tab
until Tiago says go. 26 tasks qualify as this is written.

## What was built

```
core/                  the shared library, moved out of kanban/ this session
  todo.py              reading the list, plus the working calendars
  todo.js              the same, in JavaScript, for the board
  windows.py           the rolling 5-hour usage windows
  fixtures/            three JSON tables both test suites read
  test_todo.py         those tables against the Python
  test_todo.mjs        the same tables against the JavaScript
nightly/
  run.sh               three gates: the clock, the lock, the window
  paths.py             where everything lives, from data/.current
  pick.py              which tasks to plan, and the ledger
  plan.py              runs the agents, writes the plans, prunes, logs
  PLAN-BRIEF.md        the half of the brief every agent shares
  com.tiagopedras.todos-nightly.plist
.claude/agents/        six agent definitions, one per bucket plus a fallback
companion/
  notify.py            the queue anything can ask for a banner on
kanban/
  server.py            /plans.json, /schedule.json, /usage.json, POST /plan/status
  index.html           the Plans view and the Schedule view
```

Plus, on the same day and tangled with it: the companion now lists suggested
messages instead of plans, and is the notification pathway. See `IMPROVEMENTS.md`.

## The one design decision worth knowing before touching anything

**It rides the usage window Tiago already opened rather than starting its own.**
Seven weeks of real usage says 29 of 30 nights already had a window running
between 19:00 and 07:00, and on 13 of them there was no room to open a fresh one
before the 02:00 cutoff. A job that woke at 02:00 and started its own window
would have done nothing on nearly half the nights.

One test decides everything: **the window being spent in must expire by 07:00.**
That is why launchd wakes it twelve times, hourly from 19:00 to 06:00, rather
than once, and it is also what gives the resume-after-a-limit behaviour for free.

`MORNING` in `core/windows.py` is the single constant; the 02:00 cutoff is
derived from it. `nightly/README.md` has the full argument and the numbers.

---

## First things to do

### 1. Commit it

Nothing from this session is in git. 19 modified files and 12 untracked paths,
including the whole of `core/` and `nightly/`. `core/todo.py` and
`core/test_todo.py` are recorded as renames out of `kanban/`, so the history
follows if they are committed as such.

This repo pushes as the **personal** GitHub account, `tiagopedras` — see
`CLAUDE.md`. Ask which account before any push; a `GITHUB_TOKEN` in the
environment can override `gh auth switch` and force the work account.

### 2. A full batch by hand, before arming anything

One task has been run twice. A whole night has not.

```bash
./nightly/run.sh --dry-run      # 26 tasks, no spend, any hour
./nightly/run.sh --force        # the real batch, in the evening
```

**The nightly ceiling is probably too low.** `NIGHTLY_BUDGET` in `plan.py` is
$12. The two real runs cost $0.29 and $0.67, so 26 tasks is somewhere around
$13 and the batch would stop short of finishing. Either raise it or accept that
the first night is partial and the ledger carries the rest to the second — both
are defensible, but it should be a decision rather than a surprise.

### 3. Then install the launchd job

Deliberately not done. The task says not to arm it until a night's output has
been read by hand.

```bash
ln -s ~/Code/to-dos/nightly/com.tiagopedras.todos-nightly.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tiagopedras.todos-nightly.plist
```

`RunAtLoad` is absent on purpose, so loading it at 10am starts nothing.

---

## Open questions

**Does Design System want splitting into its five streams?** 13 of the 26 tasks
go to one agent. The one plan written so far was good, so there is an argument it
does not. A night's spread would settle it. The split, if it happens, is along
the streams the bucket already has — ways of working, audits, improvements,
documentation, enablement — which each task's first note line names.

**The Schedule view cannot show a run in progress.** Deferred deliberately; the
entry in `IMPROVEMENTS.md` has what is already on disk for it and what still
needs deciding. The short version: the lock and the log carry enough, the front
end needs a call on polling.

**The `~/Code` sandbox is wide.** `plan.py` passes `--add-dir ~/Code` so the
agents can read the map and the folders it names. Narrowing it per agent is
possible and was not done, because `~/Code/CLAUDE.md` describes a dozen folders
and an agent that can read the map but not the territory is worse off than one
with neither. Worth revisiting if it ever reads something it should not.

---

## Traps, all of them found the hard way today

**`todo.md` has exactly one writer and it is the board.** Everything else queues:
`attach-queue.json` for sessions, `notify-queue.json` for banners, plan files for
plans. `plan.py` hashes `todo.md` before the batch and re-checks it after every
task; that guard is not decoration.

**Do not `exec` from `run.sh`.** It ended with `exec plan.py`, which replaces the
shell, so the `EXIT` trap never fired and the lock was held for the full
two-hour staleness window after every *successful* run. On the real schedule that
is one wake working and eleven refusing. There is a static check for it in
`test_nightly.py` now.

**A plan URL carries no dataset name.** `translate_path` in `server.py` inserts
the current one into every `/data/` path, so naming it as well asks for
`data/twinkl/twinkl/plans/…` and 404s. The plan lists fine and then will not
open, which is the shape of bug a listing test misses. Also checked now.

**Bucket names change.** "Design System" and "Work oversight" became "DS" and
"BAU" within a day, and both silently fell through to the fallback agent. The map
in `plan.py` carries aliases, the fallback is logged loudly, and `--dry-run`
names any bucket with no agent.

**The agents get `--allowedTools` on the command line**, not just in their
definitions. A definition is a request; the flag is what holds, and this runs
unattended with read access to `~/Code`. `Bash` is deliberately not among them.

**`core/todo.py` and `core/todo.js` must agree.** `core/fixtures/` holds the
board's own answers and both suites read the same files. A `parse_doc` bug this
session made every Python reader see an empty document — the companion said
nothing was due, the agent had nothing to plan, the checker found nothing to
check, and none of them errored. Run both suites after touching either file, and
`skills/build.command` after touching `todo.py`.

---

## How to check it is all still working

```bash
python3 core/test_todo.py          # the fixtures, and the calendars
node core/test_todo.mjs            # the same fixtures, the other language
python3 nightly/test_nightly.py    # the window rule, the picker, the runner
python3 companion/test_companion.py
node kanban/test_plans.mjs         # needs the board running
node kanban/test_schedule.mjs
node kanban/test_canvas.mjs
```

All passing as of this handover. The board tests lock the tab and tear every
non-GET out of `fetch` before doing anything — keep that, and never point a test
at `data/twinkl/`.

**After changing `kanban/server.py`, restart the server.** A new route does not
exist until the process is restarted, and the symptom is the board saying "the
board helper needs restarting". `To-Do Board.app` bundles nothing and reads
`server.py` off disk, so there is never anything to rebuild.
