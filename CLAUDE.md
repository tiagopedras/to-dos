# to-dos

Read [README.md](README.md) first. Everything in `data/` is private and gitignored.

[IMPROVEMENTS.md](IMPROVEMENTS.md) is the standing list of what is wrong with the
board and what should be built next. Read it before diagnosing anything here, and
update it when something lands or something new turns up.

## Writing a report

When Tiago asks for a report on what has been done, write it to
`data/<dataset>/reports/` (the current dataset, named by `data/.current`) as a
Markdown file with the frontmatter the board expects, and follow the rules
in README.md under **Rules for writing a report**. Read them before drafting.
The short version is that a report never lists individual to-dos, it says what
moved and what it means, and it is written in his voice and kept short.

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

Never write into `data/twinkl/` or `data/personal/` from a test, not even a
small, temporary one — that is real content, private and irreplaceable in a
way `data/_test/` deliberately isn't.

## Pushing

This repo lives on the **personal** GitHub account, `tiagopedras`. Push as that
account — `gh auth switch --hostname github.com --user tiagopedras` if it isn't
already active. Note that a `GITHUB_TOKEN` set in the environment can override
that switch and force the work account; unset it for the shell doing the push.
