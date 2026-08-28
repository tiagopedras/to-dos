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
data/sessions.json        which Claude chats belong to which task
```

Nothing else in the repo holds a task, a name or a date. It used to be four
separate ignore rules — `todo.md`, `backups/`, `todo-backup-*.md`, `views.md` —
which meant every new derived file had to remember to add a fifth, and one nearly
slipped through. A folder cannot be forgotten.

`data/` is also what Obsidian opens as its vault, so the vault contains the list
and nothing else: no board, no skill, no README to index.

### Projects

Some work carries more context than a task line can hold: a plan, a ticket history, source
documents, a decision and the reason behind it. That goes in `data/projects/<name>/`, one
folder per project, with a `CLAUDE.md` inside holding the background and the sources next to
it. The task in `todo.md` stays short and points at the folder.

`data/` rather than the repo root, for the same reason everything else private sits there:
a project folder holds real names and real dates, and a folder cannot be forgotten by the
ignore rules the way a new file can. It also means the projects show up in the Obsidian
vault next to the list they belong to.

The pointer is an ordinary note on the task, written as `Project:` and then the path in a
code span:

```
- [ ] **AOP2027: redefine the design initiative and deliver it** [impact:: high] [effort:: L]
  - Project: `data/projects/AOP2027`. Background in its `CLAUDE.md`, the raw material for
    the rescope in `redefinition-brief.md`, the AOP deck and the 1:1 in `sources/`.
```

There is no `project:` tag. The note was already how the file said this before the board
knew projects existed, and a tag carrying the same fact would only give the two a chance to
disagree. The board reads the folder name out of that note and shows it as a chip on the
card; clicking the chip opens the side panel on the project instead of a task, listing every
task pointing at the same folder with the bucket and column each one sits in. That is the
only place a project is visible as a whole, because its tasks are deliberately spread across
the buckets — the presentation is Design System work, the deck review that feeds it is People
work, and the columns are right to keep them apart. Which also means a task without the note
is missing from it.

The board reads the pointer and nothing else. It never opens the folder, so what is in there
can be in any shape the work needs.

## The board

`kanban/index.html` is one self-contained page. No build step, no dependencies.
It parses `data/todo.md` into buckets, states and tags, renders them as columns,
and writes the file back when you save.

`kanban/server.py` is a small local server so the page can read and write the
file — a browser will not let a page opened straight off the disk do that. It
listens on `127.0.0.1` only and refuses to write anything except
`data/todo.md`.

Start it by double-clicking `run.command`.

There is also a Dock launcher, **To-Do Board.app**, which does nothing but hand
off to `run.command` — the board still opens in a Terminal window, because that
window is where Ctrl-C lives. The bundle itself is gitignored: it is three small
files and an icon rebuilt from `kanban/icon.svg`, so keeping the recipe is worth
more than keeping the build.

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
`run.command`.

### Stopping it

Ctrl-C in that window, which is what the window tells you. If the window has been
closed without stopping it first, the helper carries on with nothing attached to
it — and because it still holds the port, launching `run.command` again only
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

### Renaming and reordering the buckets

A bucket is a `## N. Name` line in `data/todo.md` and nothing else. There is no
id, and no record anywhere of which tasks belong to it beyond the fact that they
sit underneath it — so the pencil beside the tabs, which opens all of them in one
sheet, is a small feature rather than a migration. Renaming one rewrites that single heading and
leaves every task under it alone. Moving one up or down rewrites the numbers on
the headings it passed, because the number in the heading is the position. The
colour follows the position too, which is why a bucket that moves changes colour,
along with the ones it moved past. There are six colours; a seventh bucket starts
them again.

Deleting is the part that needed a rule. A bucket with nothing in it simply goes.
A bucket with tasks in it can only go once they have somewhere to land, so the
sheet asks which bucket they move to and says how many are moving; each task keeps
its column, its text and its tags. That is the move the drawer's Bucket field
already makes on one task, done for all of them at once. Deleting the last bucket
is not offered, because the board cannot draw a list with no headings in it and
refuses to read one.

It sits beside the tabs rather than in the Data menu because that strip is where
the buckets already are, and it is an icon rather than a labelled button because
renaming a bucket is a once-a-quarter job. It hides in a backup preview and on the
demo list along with everything else that writes, and nothing reaches the file
until you save.

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

Setting it is a button in the top corner of the task panel, beside Close. It used
to be a field partway down the panel, among impact, effort and the dates, which
put a decision about the whole list in the same run as the task's own scores and
meant scrolling to reach it. The explanation it carried underneath moved to the
button's tooltip: it is worth reading once, not on every task.

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

### Chats on a task

The link above has one thing wrong with it, and it is the thing most of these
prompts are about. The chat it opens runs in a browser tab that has never seen
this machine, so a prompt saying *read the notes in `data/projects/AOP2027`* is
asking the one end that cannot do it. Every one of them ends the same way: find
the files, paste them in, then start.

Claude Code is already installed, already signed in, and runs where the files
are. So a task now carries **Chats** — a list of conversations, each one running
down at `server.py` and answering in a modal on top of the board.

A list rather than one, because the work on a task is not one conversation.
Reading the 360 responses, drafting the message that comes out of it, and
checking how it was worded last quarter are three, and keeping them apart is the
point: each one stays short enough to be worth coming back to. **+ New chat**
starts one. A prompt written on the task gets **Ask Claude**, which starts one
with that prompt already in the box, unsent — most still have a `[path]` to fill
in, and one that fired on click would send the placeholder.

### Where a conversation actually lives

Three things, and none of them is a copy of another:

| | |
| --- | --- |
| `` `chat:xxxxxx` `` on the task line | which task a conversation belongs to |
| `data/sessions.json` | which sessions sit under that key |
| `~/.claude/projects/…/<id>.jsonl` | what was said, written by Claude Code |

The third is why nothing here stores a transcript. That file is what the CLI
resumes from and what Claude Desktop imports, so a conversation carried on
somewhere else comes back complete instead of as a stale copy. Clear those files
and the board says the transcript has gone rather than drawing an empty chat.

The key sits on the task line rather than in `sessions.json` because a task gets
renamed, moved between buckets and reordered, and a key written on the line
survives all three where a key made out of the title survives none of them. It
is minted the first time you start a chat on a task, which marks the list dirty
like any other change — so a chat started and never saved leaves an entry in
`sessions.json` with nothing pointing at it. The `×` on a row clears one out.
Nothing is lost either way: the transcript is Claude Code's file and is left
alone.

### Carrying on in Claude Desktop

Every chat row, and the modal, offers **Claude Desktop**. It is a link to
`claude://resume?session=<id>`, which imports the session into the app with its
full history and carries it on there.

That deep link took finding. Claude Desktop keeps its own session records —
`local_…` ids that map to a CLI session — and lists only sessions it created,
which is why a run started here never appeared. `claude://code/continue?session=`
refuses a CLI id outright; it only takes `last` or a `local_…`. `claude://resume`
is the one that adopts a CLI session, and the app's own log says so when it
does: *importing CLI session … as Desktop session local_….*

### What the modal is copied from

`ai_chat/claude-chat-interface-findings.md` is a teardown of the claude.ai chat
interface, and the modal follows it, because that is the shape this conversation
already has in his head:

- **Attribution by asymmetry.** Your message is a filled bubble pushed right;
  the reply is unbubbled prose running the full width. No avatars, no `you:`
  prefix. It keeps the reply reading as a document rather than as a chat log.
- **One slot, one primary action.** Send and Stop share a position, so stopping
  is where sending was and the primary action never competes with a second one
  for the same glance. The box grows line by line instead of scrolling, so a
  long question stays visible while it is written.
- **No spinner.** A line that says what it is doing, rewritten in place as that
  changes. A progress indicator whose content is the progress reads as activity
  rather than as a wait.
- **The trace collapses.** What it did becomes one grey summary line that opens
  into a timeline.

One thing the teardown flags as friction, deliberately not copied: there, the
trace only admits to being a control once the cursor is on it, which hides the
most interesting part of an answer behind the least likely gesture. Here the
chevron is always drawn. The response also keeps its Copy button, which the
teardown notes the original is missing.

The artifact panel has no equivalent and none is faked. A run here changes files
on disk rather than producing something to preview.

### What a chat is allowed to do

**Ask reads and cannot write.** Bash, Edit, Write, NotebookEdit and Task are
removed from the run outright — not permissions it has to ask about, tools that
are absent, so there is nothing to be argued into using. Ask it to create a file
and it answers that it has no way to.

**Do it** is the other half, and it only exists if `data/claude.json` says so.
It runs with permissions bypassed, which is what a headless run needs to do the
actual work, and it is not dressed as the safe button.

The board asks the helper `/claude.json` before drawing any of this. No CLI, no
helper, or a host serving these files statically, and the answer is the same: no
chats, and the prompts keep the link they always had. That is also why the
Vercel deployment never shows it.

The config is optional and lives with everything else private:

```json
{
  "cwd": "/Users/you/Code",
  "work": false,
  "model": "sonnet",
  "timeout": 900
}
```

`cwd` is the folder a chat starts in, and the one setting worth thinking about.
It defaults to this repo, which is not where these prompts point — mine is
`~/Code`, so a prompt naming `ds-snapshots` or `ds-docs` finds it. Everything a
chat can read is under that folder. `model` is unset by default, so chats use
whatever Claude Code is configured to use; a card-sized question is usually a
Sonnet job, and the cost on a finished chat is the honest reason to care.

Two runs at a time, killed after fifteen minutes, and **Stop** ends one now — it
drops the connection, the helper notices, and the whole process group goes with
it rather than being orphaned. A chat left running carries on while you close
the modal and go and look at something else; the row says *running*.

One guard is worth stating plainly. Any page in any tab can POST to
`127.0.0.1`; that is what CSRF is, and until now the worst it could have done
was write `todo.md`. Running Claude is a bigger thing to hand out, so the
endpoint refuses anything without an `X-Board: 1` header. A form cannot set one,
which forces a preflight this server does not answer, so the request never
leaves the page that tried it.

### Raising a Jira ticket

A task that needs a ticket carries a `Jira` note, the same shape as a prompt:

```
- [ ] **Raise the button variant gap on the contributions board** [impact:: med] [effort:: S]
  - Jira (DSYS): "Button: three variants in Figma with no Storybook equivalent"
  - Description: "Three button variants exist in Figma with no Storybook equivalent ..."
```

The board turns that into **Raise in DSYS**, which opens Jira's create form with
the project, the issue type, the summary and the description already filled in. It creates
nothing. Jira has two endpoints here and only one of them is worth linking to:
`CreateIssueDetails!init.jspa` opens the form and waits, and that is the one
behind the button. A link that raised a ticket on a shared board from a click is
not something worth putting on a card.

`Description:` is optional and belongs on the line under the note it serves, so
a step carrying two tickets keeps two separate bodies. The older
`Description to paste:` still parses — it is what the first of these were written
as, when the board carried only the summary and the body really did have to be
pasted — but nothing writes it now.

Leave the brackets off and every configured board is offered, which is the
honest answer when it is not yet settled where the ticket goes. The column card
shows a `DSYS ticket` marker rather than the button, because the card has no room
for it and a pending ticket is still worth seeing from the board.

Which boards exist is `data/jira.json`, gitignored with everything else private —
it names a company Jira and an account id, and this repo is public:

```json
{
  "site": "https://example.atlassian.net",
  "reporter": "000000:0000...",
  "boards": [
    { "key": "DSYS", "name": "DS Contributions",
      "pid": "10001", "issuetype": "10002", "setReporter": true }
  ]
}
```

Jira wants numeric ids rather than project keys, which is why they are in a file
rather than written on the task. `/rest/api/3/project/DSYS` in a logged-in
browser returns the project id and every issue type id for it.

`setReporter` is per board because it has to be. One board here refuses to create
an issue without a reporter, and the other refuses to let it be set at all, so
one setting could not have served both. No file means no buttons, which is why
the Vercel deployment falls back to `kanban/jira.demo.json` — the same trick as
`demo.md`, so the public page can show the feature without a real site being
committed to a public repo.

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

## The skills

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

`pa-todo-meeting/references/conventions.md` is the file format.
`pa-todo-meeting/references/audit-checklist.md` is what to check by hand that the
script cannot.

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
    - Jira (DSYS): "..."         <- a ticket still to raise
    - Description: "..."         <- and its body
  - [ ] A gated step `start:2026-09-01` `blocked-by:some-slug`
```

Tags work on sub-steps as readily as on tasks, and usually belong there.

The columns on the board are exactly the `###` headings in the file, so a new
state is a heading rather than a code change. The board reads them in reverse
file order and adds a **Done** column on the end that no heading produces. Left
to right that is Backlog, To do, Doing, Waiting review, Done.

**Waiting review** holds work that is finished as far as you are concerned and is
now sitting with somebody else for sign-off. Nothing is owed on it until it comes
back, which is a different thing from Doing (live) and from Backlog (real work,
unscheduled). It appears first in each bucket in the file and last before Done on
the board, because the two orders are mirrors of each other.

### Two tag syntaxes

`impact`, `effort`, `due` and `ai` are written as Dataview inline fields, in
brackets with a double colon. Everything else is a backtick code span.

The split is not cosmetic. Dataview cannot read inside a code span, so those four
had to come out of one for the Obsidian views to work, and the rest stayed in one
because a line carrying eight bracketed fields is unreadable and nothing queries
them. The older `` `due:2026-08-21` `` form is still read correctly by the board and
by the checker, permanently — the backups and the done archive are full of it —
but nothing writes it any more, and the checker flags one on a task line.
