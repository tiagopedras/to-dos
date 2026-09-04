# to-dos

Read [README.md](README.md) first. Everything in `data/` is private and gitignored.

[IMPROVEMENTS.md](IMPROVEMENTS.md) is the standing list of what is wrong with the
board and what should be built next. Read it before diagnosing anything here, and
update it when something lands or something new turns up.

## The skills index

The `pa-*` skills in `skills/` are indexed, along with every other skill I have
written, in `~/Code/SKILLS.md`. Add a new one there in the same session it is
created; see [skills/CLAUDE.md](skills/CLAUDE.md).

## Writing a report

When Tiago asks for a report on what has been done, write it to
`data/<dataset>/reports/` (the current dataset, named by `data/.current`) as a
Markdown file with the frontmatter the board expects, and follow the rules
in README.md under **Rules for writing a report**. Read them before drafting.
The short version is that a report never lists individual to-dos, it says what
moved and what it means, and it is written in his voice and kept short.

## The desktop companion

`companion/` is the menu bar app that notifies once each working morning. It
reads `data/twinkl/todo.md` and never writes to it — keep it that way, since a
second writer is exactly what the board's autosave cannot survive. The file
format it reads lives in `kanban/todo.py`, which the board owns; put format
knowledge there rather than in the companion, and the working calendar too —
that file generates the UK and Portuguese public holidays now, for the same
reason. Both countries count as days off by default. Run
`python3 kanban/test_todo.py --online` after touching the calendar rules; it
checks them against gov.uk and Nager.Date.

Its menu links to a card with `#!task=<key>`, a fragment rather than a query
string so the link lands in the tab that is already open. Keep it a fragment: a
second tab on one list is two autosaves on one file.

## Testing the board

A test that talks to the running `kanban/server.py` can save for real — the
board's autosave fires within seconds of anything that marks the document
dirty (dragging a card, ticking a box), with no confirmation. Two real
overwrites of the live `twinkl` list have already happened this way, both
recovered only because a session backup happened to exist. Test carefully:

**Default: lock the tab.** Load whatever fixture text you need with
`load(text, 'name.md', {})`, then immediately set `state.locked = true` (and
optionally `state.lockedLabel`) before doing anything else — the same guard
demo mode and backup preview already use. A locked tab cannot save, full
stop, whichever dataset happens to be current. This covers essentially all UI
testing: rendering, clicking, dragging, checking layout and CSS. Use it every
time unless you specifically need to test that a save reaches disk.

**The one exception — testing a real save:** a dedicated dataset,
`data/_test/`, exists for exactly this and nothing else touches it. To use
it: note whatever `data/.current` currently says, switch to `_test`
(`POST /dataset/select` with `{"name":"_test"}`, or write the file directly),
run the one check that needed real persistence, then switch `data/.current`
back to the value you noted — immediately, before doing anything else, and
verify it stuck before ending the turn. `data/.current` is one file shared by
every tab and session pointed at this server, so a dataset switch is visible
to anyone else with the board open the moment you make it, not just to you.

`kanban/test_canvas.mjs` is the worked example of the default. It drives the
board in headless Chrome, locks the tab before loading demo.md, and then tears
every non-GET out of `fetch` so nothing can reach disk even if something
unlocks the tab later. That second guard is not belt and braces for its own
sake: the run records an attempted `PUT /data/todo.md` that it stopped. Run it
with `node kanban/test_canvas.mjs`, or `BOARD_PORT=8799 node ...` against a
server on another port.

Never write into `data/twinkl/` or `data/personal/` from a test, not even a
small, temporary one — that is real content, private and irreplaceable in a
way `data/_test/` deliberately isn't.

## Pushing

This repo lives on the **personal** GitHub account, `tiagopedras`. Push as that
account — `gh auth switch --hostname github.com --user tiagopedras` if it isn't
already active. Note that a `GITHUB_TOKEN` set in the environment can override
that switch and force the work account; unset it for the shell doing the push.
