# to-dos

A personal task system made of two halves: a Kanban board that reads and writes a
single markdown file, and a skill that runs a review session over that same file.

## Where the list lives

Everything private sits in one folder, `data/`, and that folder is the whole of
what git ignores:

```
data/todo.md              the list
data/views.md             the Obsidian views, generated
data/backups/             the board's snapshots, and done-archive.md
```

Nothing else in the repo holds a task, a name or a date. It used to be four
separate ignore rules — `todo.md`, `backups/`, `todo-backup-*.md`, `views.md` —
which meant every new derived file had to remember to add a fifth, and one nearly
slipped through. A folder cannot be forgotten.

`data/` is also what Obsidian opens as its vault, so the vault contains the list
and nothing else: no board, no skill, no README to index.

## The board

`kanban/index.html` is one self-contained page. No build step, no dependencies.
It parses `data/todo.md` into buckets, states and tags, renders them as columns,
and writes the file back when you save.

`kanban/server.py` is a small local server so the page can read and write the
file — a browser will not let a page opened straight off the disk do that. It
listens on `127.0.0.1` only and refuses to write anything except
`data/todo.md`.

Start it by double-clicking `board.command`.

### The Vercel deployment is only the shell

There is a copy of this repo on Vercel, and `vercel.json` exists solely so the
root URL lands on `kanban/index.html` rather than a 404 — without it Vercel
serves the repo root, which has no index page. That is the whole of what the
rewrite does.

What it cannot do is be the board. The page is a front end for `server.py`: it
fetches `data/todo.md` on load, saves with a `PUT` back to the same path, and
asks the server for `/backups.json` and `/archive`. Static hosting answers none
of those, and `data/` is gitignored, so there is no list out there to read. That
is correct rather than a fault to fix. The list is private and the Vercel URL is
public, so the answer is never to put the real file where the deployment can
reach it.

Instead the board falls back to `kanban/demo.md` — an invented list, committed
to the repo, with the messages and prompts written out so Quick wins and
Delegate to Claude have something in them. It loads through the same lock the
Backup Preview uses, which is the point: locking is what already stops anything
reaching disk as the live list, so example tasks inherit that guarantee rather
than needing a second set of guards to keep in step with the first. The bar
across the top says Example data, and the button under it retries the real file,
which is what you want when you opened the tab a moment before starting
`board.command`.

### Stopping it

Ctrl-C in that window, which is what the window tells you. If the window has been
closed without stopping it first, the helper carries on with nothing attached to
it — and because it still holds the port, launching `board.command` again only
opens a tab against that stale copy, which is how a board ends up missing features
that are sitting right there in the file. Stop it by port:

```bash
lsof -ti tcp:8765 | xargs kill
```

By port rather than by name, because the process name depends on which folder it
was started from. The startup output prints this command, so it is in the
scrollback when it is needed.

### Saving, backups and outside edits

Four things keep the file safe without anyone having to remember to press a
button. All of them work off one fact: the file's timestamp the last time the open
tab agreed with what was on disk.

**Auto-save** runs every five minutes, and only when something has actually
changed — an idle tab never touches the file. It holds off while a field is being
typed into, and a failed auto-save reports in the status line rather than throwing
a dialog. There is a toggle in the header; the setting sticks. Manual saving is
unchanged.

**Backups** come in two kinds, listed on the **Backups** tab in the header. A
*session* backup is taken before the first save of each
run, and the last fifty are kept. A *weekly* snapshot is taken the first time the
board notices a new ISO week — on startup, on a save, or on its own half-hourly
check while it sits running — and the last twelve are kept. The two are pruned
separately, so a busy fortnight of saves can never delete the only copy of how the
list looked last month.

**Auto-reload** picks up edits made outside the board: Claude working through the
list, or the file opened in an editor. With nothing unsaved in the tab, reloading
costs nothing, so it happens quietly and says so in the status line.

**The conflict modal** is the one time the board interrupts. If the file changed on
disk *and* there is unsaved work in the tab, it lists both sets of changes — task
by task, marked new, deleted, done, moved, renamed or edited — and offers three
ways out: keep what is in the tab, download it first, or discard it and take the
file. Nothing is overwritten until that choice is made. Renames are shown as
renames rather than as a delete plus an add, because the second reads like lost
work.

### Archiving finished work

A task ticked off more than 30 days ago is history rather than a list, so the
header offers to move it out: **Archive N finished**. It goes to
`data/backups/done-archive.md`, which is append-only, never pruned, and written
to by nothing else — so this is a move, not a delete, and the record outlives the
backups that would otherwise be the only copy. Sub-steps and notes travel with the
task. A fresh backup of the whole list is taken first, and the archive file is
written *before* anything leaves `data/todo.md`, so a failure loses nothing.

It is never automatic. The list shrinking on its own while the tab is open is
indistinguishable from the board losing work.

This needs a completion date, which the file did not record: `done:YYYY-MM-DD` is
written when a task is ticked. Tasks that were already ticked before this existed
are stamped with the day they are first seen, because there is no way to recover
when they were actually finished — so nothing is ever archived before it has sat
for a full 30 days under a date the board can vouch for.

### How the board prioritises

Two tiers, at two different moments.

**Impact against effort, at intake.** Every task carries `[impact:: high|med|low]`
and `[effort:: S|M|L]`. Any column can be sorted on impact divided by effort, so a
med/S beats a high/L — high impact for the lighter lift comes first. A task
missing either score shows a *needs scoring* marker and is counted in the header,
because a blank score reads as low and the task sinks without anyone deciding it
should. Sorting never rewrites the file: your own order is still the file order.

The **Matrix** view draws the same two scores as a 3×3 grid, impact down the side
and effort across the top, so the shape of the whole list is visible at once —
how much sits in the expensive corner, whether the cheap high-impact cell is
actually empty. A task is one dot rather than a card, because nine cells on one
screen leaves a thumbnail each; the title is on hover and a click opens the real
task. Anything missing a score sits in a tray under the grid instead of being
dropped, since a dropped task is one that never gets scored.

**The one thing.** A single task carries `headline:<date it was set>` and appears
in a bar above the columns, with a count of how many other tasks it frees. It is
the task that makes the others easier or unnecessary, which is a different
question from which one scores highest. It stays chosen until it is solved. Its
dot on the matrix is ringed, so you can see where your one thing actually sits.

### Views

Everything else is worked out from tags at render time, never stored twice:

| View | Built from |
| --- | --- |
| Matrix | `[impact:: ]` against `[effort:: ]`, as a 3×3 grid. One dot per open task, coloured by bucket. |
| This week | `week` |
| Quick wins | `[effort:: S]` grouped by `[ai:: ]`, plus any step with a written message. Anything waiting on an unfinished blocker, or whose `start:` has not arrived, is left out. |
| Big rocks | `[impact:: high]` and `[effort:: L]` |
| Dependency chain | `blocked-by:`, resolved against `#slug` |
| Delegate to Claude | `[ai:: full]`, ordered by `rank:` |

These used to be sections written into the file by hand, which meant they drifted
from the tasks they described. Deriving them removed that whole class of bug.

### Handing a prompt over

A card that carries a written prompt gets **Open in Claude** under the Copy
button. It is an ordinary link to `claude.ai/new?q=`, with the prompt
URL-encoded onto the end, so a click opens a new chat with the text already
sitting in the box — unsent. Unsent is the whole point: most of these prompts
still have a `[path]` to fill in, and one that fired on click would send the
placeholder.

Only prompts get the link. A suggested message is written for a person, so Copy
is the only thing it needs.

### The same views in Obsidian

Quick wins, Big rocks and Delegate to Claude also exist as Dataview queries, for
reading the list in Obsidian rather than on the board. Two plugins do the work:
**Dataview** runs the queries, and **Dataview Serializer** writes their answers
back into the file as ordinary markdown, so the result still reads correctly
somewhere that has never heard of either plugin.

`views.template.txt` is the committed copy of the queries. The one that runs is
`data/views.md`, which git ignores along with the rest of that folder, because
once the queries have run it holds the real list. Start it with:

```bash
cp views.template.txt data/views.md
```

The template is `.txt` rather than `.md` deliberately. The Serializer writes into
every markdown file in the vault that carries a query marker, with no regard for
which files git tracks, so a markdown template would have had the real list
written into it and committed. Non-markdown files are ignored, which is the guard.

Then open **`data/`** as an Obsidian vault — that folder, not the repo, so the
vault holds the list and nothing else. Install Dataview and Dataview Serializer
**in that vault**: Obsidian keeps community plugins per vault, so having them in
another one does not count. Exclude `backups/` in Settings → Files and links,
which keeps fifty copies of every task out of the search box.

Three things the Obsidian version does worse than the board, all listed in the
file itself: Delegate is in deadline order rather than `rank:` order, Quick wins
does not hide what is blocked or not yet startable, and a sub-step needs its own
`[ai:: ]` because Dataview does not inherit the parent's. All three are because
`rank:`, `start:` and `blocked-by:` are still code spans, which Dataview cannot
read inside. The board remains the authority.

## The skill

`skills/pa-todo-meeting/` is a Claude skill that runs the review session: read
and report, ask what changed, apply updates, optimise, check the one thing,
verify. It is packaged as `skills/pa-todo-meeting.skill` for installing.

`scripts/check_todo.py` is a mechanical checker — dates on weekends, sub-steps
running past their parent, a `blocked-by:` pointing at nothing, duplicate ranks,
more than one `headline:`, missing scores, and a queried tag written in a form
Dataview cannot read. Run it directly:

```bash
python3 skills/pa-todo-meeting/scripts/check_todo.py data/todo.md
```

`references/conventions.md` is the file format. `references/audit-checklist.md`
is what to check by hand that the script cannot.

### Two dates, not one

`due:` is the deadline. `start:` is the earliest the work can begin. One date used
to carry both meanings, which made "finish by the 7th" and "cannot begin until
the 1st" indistinguishable — so a filter for what is actionable had to guess, and
either guess was wrong half the time.

Quick wins reads `start:` and ignores `due:` completely. A passed deadline never
hides anything: overdue is the most actionable state on the list, not the least.
Where the gate is another task rather than a calendar date, `blocked-by:` is the
better tool — it resolves itself when the blocker is ticked instead of needing a
date re-guessed by hand.

## File format

```
## 1. People                      <- bucket
### Doing                         <- state
- [ ] **A task** [impact:: high] [effort:: M] [due:: 2026-08-21] [ai:: partial]
  - [ ] A sub-step [due:: 2026-08-19] [ai:: full]
    - Suggested message: "..."   <- ready to send
    - Prompt: "..."              <- ready to hand to Claude
  - [ ] A gated step `start:2026-09-01` `blocked-by:some-slug`
```

Tags work on sub-steps as readily as on tasks, and usually belong there.

### Two tag syntaxes

`impact`, `effort`, `due` and `ai` are written as Dataview inline fields, in
brackets with a double colon. Everything else is a backtick code span.

The split is not cosmetic. Dataview cannot read inside a code span, so those four
had to come out of one for the Obsidian views to work, and the rest stayed in one
because a line carrying eight bracketed fields is unreadable and nothing queries
them. The older `` `due:2026-08-21` `` form is still read correctly by the board and
by the checker, permanently — the backups and the done archive are full of it —
but nothing writes it any more, and the checker flags one on a task line.
