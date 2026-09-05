# Nightly agent — handover

Written 5 Sep 2026, at the end of the session that built it, updated the next
morning by the session that picked it up, and again by the one that added the
queue and in-flight columns. For whoever comes after that.

Everything described here works and is tested. It is now **committed** (`19c3589`)
and not yet pushed. The launchd job is **still not installed** — that is the one
thing left, and it needs a command run by hand.

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
  server.py            /plans.json, /queue.json, /nightly.json, /schedule.json,
                       /usage.json, POST /plan/status, POST /queue/order
  index.html           the Plans view (four columns) and the Schedule view
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

## Where it got to

### 1. Committed

Done, as `19c3589`, one commit: the whole of `core/` and `nightly/`, the Plans and
Schedule views, the server routes it had then, `companion/notify.py`, and the six
agent definitions. The queue and in-flight columns came later and are described
under 5 below. `core/todo.py` and `core/test_todo.py` went in as renames out of
`kanban/`, so the history follows.

Two first names of real people were sitting in `core/fixtures/` as sample data.
They are now `Alex` and `Sam`, which is the convention `kanban/demo.md` already
used. Neither suite hardcodes a name, so the swap was a `sed` and both still pass.

**Not pushed.** This repo pushes as the **personal** GitHub account,
`tiagopedras` — see `CLAUDE.md`. Ask which account first; a `GITHUB_TOKEN` in the
environment can override `gh auth switch` and force the work account.

### 2. The budget: left at $12, first night is partial by design

Asked and decided. `NIGHTLY_BUDGET` in `plan.py` stays at $12 against 25
qualifying tasks at roughly $0.48 each. The batch is expected to stop a task or
two short on the first night and the ledger carries the remainder to the second.
That is the accepted behaviour now, not a surprise to investigate.

### 3. The batch by hand: skipped, deliberately

`./nightly/run.sh --dry-run` was run and is clean — 25 to plan, 1 skipped as
unchanged, every bucket resolving to its own agent and nothing falling through to
the fallback. The real `--force` batch was **not** run: the session that would
have paid for it was nearly out of window, and spending $12 of it in the morning
is exactly what this whole design exists to avoid.

So the first real night is the first full batch. What that leaves unproven is the
loop rather than the parts: one task has been planned by hand twice and works,
but the ledger across a batch, the budget stop, the prune, and the `todo.md`
re-hash between tasks have only ever run in `test_nightly.py`. If a morning shows
no plans, `data/<dataset>/plans/nightly.log` is the first thing to read, then
`data/nightly.err.log`.

### 4. Install the launchd job

**Still to do**, and it needs running by hand — the sandbox in that session
refused to write into `~/Library/LaunchAgents/`.

```bash
ln -s ~/Code/to-dos/nightly/com.tiagopedras.todos-nightly.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.tiagopedras.todos-nightly.plist
```

`RunAtLoad` is absent on purpose, so loading it at 10am starts nothing. To stop
it again:

```bash
launchctl unload ~/Library/LaunchAgents/com.tiagopedras.todos-nightly.plist
```

### On scheduling it against a usage window

There is no clock time to schedule against. A window opens on the first request
after the previous one expired, so it is anchored to when Tiago starts working,
not to a grid — `python3 core/windows.py --history` shows the last thirty and how
irregular the starts are. That is the whole reason the plist wakes twelve times
instead of once. Nothing outside `run.sh` needs to know when a window opens,
because `run.sh` asks every hour and rides whichever one it finds.

---

### 5. The Plans view now has four columns

Added after the first real night, when the obvious gap turned out to be the one
the view could not answer: *what is it going to do tonight, and can I change
that.*

Left to right — **Queue for tonight**, **In flight**, **Written plans**, **Token
windows**. The queue is `pick.select()` run on demand against `todo.md`, imported
into `server.py` rather than reimplemented, so there is exactly one selection
rule. Dragging a card writes `plans/queue-order.json`; holding one back keeps it
out of the night entirely. In flight reads `data/.nightly.lock` and the log
together and polls every ten seconds while a run is live.

Two things to keep true, both for the reason everything else here has:

- **The queue view writes only `plans/queue-order.json`.** It is the second
  write either surface makes, after `/plan/status`, and both stay inside
  `plans/`. `kanban/test_plans.mjs` asserts it: every non-GET is recorded rather
  than sent, and the run is checked for anything reaching `todo.md`.
- **The log parsing lives in `server.py`, not `plan.py`.** That log is read at a
  terminal far more often than it is parsed, and pinning its wording to a format
  string the board depends on would stop it being edited freely. When a line
  stops matching, the column goes quiet rather than lying —
  `test_queue_routes` holds `plan.py`'s format strings filled in so the failure
  lands there instead.

`nightly/README.md` has the design; `IMPROVEMENTS.md` has what is left, which is
the "What runs on a clock" card and then retiring the Schedule view.

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
