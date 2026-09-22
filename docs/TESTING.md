# Testing the board, in detail

Moved out of `CLAUDE.md` on 22 Sep 2026. `CLAUDE.md` keeps the two rules that
matter every time (lock the tab; use `data/_test/` for a real save). This file
has the per-suite detail — what each one covers and why it's shaped the way it
is — for when you're touching the area it protects.

A test that talks to the running `kanban/server.py` can save for real — the
board's autosave fires within seconds of anything that marks the document dirty
(dragging a card, ticking a box), with no confirmation. Two real overwrites of
the live `twinkl` list have already happened this way, both recovered only
because a session backup happened to exist.

**`kanban/test_chats.mjs`** is the worked example of the default (lock the tab).
It drives the board in headless Chrome, locks the tab before loading `demo.md`,
and then tears every non-GET out of `fetch` so nothing can reach disk even if
something unlocks the tab later — that second guard isn't belt and braces for
its own sake: a past run recorded an attempted `PUT /data/todo.md` that it
stopped. Run it with `node kanban/test_chats.mjs`, or
`BOARD_PORT=8799 node ...` against a server on another port.

**`kanban/test_one_board.mjs` and `kanban/test_subtasks.mjs`** are the ones that
unlock the tab, because handing a task over, approving and draining the agents'
queue all edit the document. Each installs a `fetch` that tears every non-GET out
before it does, records what was attempted, and ends by asserting nothing
reached `todo.md`; the queue tests stub `/tick-queue.json` rather than read a
file. `kanban/test_schedule.mjs` (Spend and schedules sheet) does the same.

**`kanban/test_projects.mjs`** covers both halves of the Projects view — the tab
listing every folder under `data/projects/`, and the drawer that shows what's
inside one, describes it, and says when it was last touched. It stubs
`/projects.json` and `/project.json` rather than reading disk, so it needs no
project folder to exist, and its blocked list is asserted empty: a project is a
folder, the panel only ever reads it. It also covers the Project card in the
task drawer's second column, and holds the assertion that keeps that column
tidy — every section in it is a `details.field.sugg` drawn by `sideSection()`,
so a new one can't arrive with its own invented heading. It's defending the fact
that neither the description nor the date is a field anyone maintains: the
first is the H1 and lead paragraph of the folder's own `CLAUDE.md`, the second
is the newest mtime in the folder.

**`kanban/test_notes.mjs`** covers the drawer's Description field, which renders
Markdown at rest and swaps to a raw textarea when clicked. It's the one board
test that has to unlock the tab and type for real, since that's the thing under
test — the `fetch` guard does the whole job on its own there, and the blocked
list is asserted to hold nothing but the board's own `todo.md` save. It clicks
at real coordinates rather than calling the handler with made-up ones, because
the caret arithmetic starts from a hit test the browser does — which means it
has to wait out the drawer's slide-in transition first, or every hit test
misses.

**Orphaned headless Chrome:** a board test that throws before its
`chrome.kill()` leaves a headless Chrome holding the debugging port and the
page it had loaded. The next run finds the port taken, connects to that orphan,
and asserts against a stale copy of `index.html` — three real failures in code
that's actually fine. If a test fails on text you can see is correct on disk,
that's what happened:

```
pkill -f "remote-debugging-port=94"
```

**`core/test_todo.mjs`** needs none of the above — it's the one to reach for
when what changed is the format rather than the view. It runs `core/todo.js` in
a `vm` context with no browser, no server and no `todo.md` in reach, so it's
fast and can't touch anything. Run it alongside `python3 core/test_todo.py`,
which reads the same fixtures.

## Every suite, in one place

```
python3 core/test_todo.py          # the fixtures, and the working calendars
node core/test_todo.mjs            # the same fixtures, the other language
python3 core/test_reports.py       # aggregate.py, render.py, archive.py — no JS counterpart
node kanban/ui/test_primitives.mjs # the React primitives against colHTML/cardShellHTML
python3 agents/plan-agent/test_planning_agent.py    # the schedule, the picker, the runner
python3 companion/test_companion.py
python3 kanban/test_bucket_brief.py # the brief routes — no board, no browser
node kanban/test_schedule.mjs       # the ones below need the board running
node kanban/test_one_board.mjs     # handing a task over, the two reviews, whose move it is
node kanban/test_subtasks.mjs      # sub-tasks in the drawer, and the agents' tick queue
node kanban/test_board.mjs         # drag, drop, sort, add, Done as a heading, string card vs React one
node kanban/test_chats.mjs
node kanban/test_projects.mjs
node kanban/test_notes.mjs
node kanban/test_backups.mjs       # and the read-only preview it opens
node kanban/test_matrix.mjs        # and the dot's pinned preview
node kanban/test_phone.mjs         # the 640px breakpoint, from both sides
node kanban/test_overview.mjs      # capMsgCards() against real, painted layout
node kanban/test_timeline.mjs      # wireTimelineDrag() against a real, painted tray card
node kanban/test_reports.mjs       # both halves, and the window picker over them
node kanban/test_recurring_roll.mjs # where a recurring card lands when its date turns over
node kanban/test_archiving.mjs     # the only thing that rewrites todo.md on a timer
node kanban/test_save_guard.mjs    # the preconditions on PUT /data/todo.md
node kanban/test_bucket_brief.mjs  # the Brief button, and the sheet behind it
```

**`test_phone.mjs`** runs twice — a 400px window and a 1400px one, both through
the same checks, so what's under test is the breakpoint rather than one side of
it. It covers three things a desk-width-only check misses: drag and drop
doesn't fire on touch (the drawer's Column field is the only way to move a card
there), a touch screen never hovers (so anything hover-revealed is invisible),
and six columns snapped one to a screen say nothing about which one you're
looking at.

**`test_save_guard.mjs`** is the odd one out: it needs the server but no
browser, because it checks the server's own contract. Every `PUT` it sends is
meant to be refused and carries the file's own current bytes as its body, so a
regression that lets one through rewrites `todo.md` with what it already said
rather than with a fixture. Never give one of those requests a body of its own.

Never write into `data/twinkl/` or `data/personal/` from a test, not even a
small, temporary one — that's real content, private and irreplaceable in a way
`data/_test/` deliberately isn't.
