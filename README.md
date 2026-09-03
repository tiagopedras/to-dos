# to-dos

A personal task system made of two halves: a Kanban board that reads and writes a
single markdown file, and a skill that runs a review session over that same file.

## Where the list lives

Everything private sits in one folder, `data/`, ignored by git. Inside it, one subfolder per data set — one list, kept completely apart from any other:

```
data/.current              which one below is live right now
data/twinkl/todo.md        the list
data/twinkl/views.md       the Obsidian views, generated
data/twinkl/backups/       the board's snapshots, and done-archive.md
data/twinkl/sessions.json  which Claude chats belong to which task
data/twinkl/claude.json    that data set's own Claude config
data/twinkl/jira.json      that data set's own Jira boards
data/twinkl/meeting-declines.md  meeting actions pa-retrieve-tasks showed and he
                                  turned down, kept so one can be found again
data/twinkl/projects/      that data set's own project folders, see below
data/personal/todo.md      a second, unrelated list, shaped the same way
```

Nothing else in the repo holds a task, a name or a date. `data/` used to be one
list flat inside it, before the dropdown existed to hold more than one — moving
the old files into `data/twinkl/` is the whole of what that change did to disk,
nothing in the shape of a single list changed. It used to be four separate
ignore rules before that — `todo.md`, `backups/`, `todo-backup-*.md`,
`views.md` — which meant every new derived file had to remember to add a fifth,
and one nearly slipped through. A folder cannot be forgotten, and neither can a
second one next to it.

A folder counts as a data set purely by having a `todo.md` in it — there is no
registry to fall out of step with what is really on disk. `data/.current` names
which one the board and `server.py` are pointed at; everything the page fetches
— `/data/todo.md`, `/data/backups/…`, `/data/jira.json` — is the same URL
regardless of which data set that is, rewritten on the server to the real file
underneath. The board never learns a data set's name except to draw the
dropdown and to ask for a different one.

### Switching, and starting a new one

The dropdown at the top right of the board, next to the Data buttons, lists
every folder under `data/` that qualifies. Picking one asks the server to make
it current, then reloads the page — a switch changes the list, its backups, its
Claude sessions and its Jira boards all at once, and a reload is the only way to
be sure nothing from the one just left survives into the one opening. Unsaved
changes on the list you are leaving block the switch, same as they block a
backup preview.

**+ New list…**, at the bottom of the dropdown, prompts for a name, slugifies
it into a folder name, and creates it with nothing in it but one empty bucket —
the least a file needs for the board to draw it at all. Everything else — a
Claude config, a Jira board, a first project folder — appears the same way it
would for `twinkl`: the first time something is saved into it.

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
and writes the file back when you save. That path never changes — it always
means whichever data set is current, see above.

`kanban/server.py` is a small local server so the page can read and write the
file — a browser will not let a page opened straight off the disk do that. It
listens on `127.0.0.1` only and refuses to write anything except `data/todo.md`,
translated on the way in to the current data set's own file.

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

### Renaming and reordering the columns

The second pencil, beside the first, opens the same kind of sheet for the
columns — Backlog through Doing to Done — a task moves through inside a
bucket. A column is a `### Name` heading, and like a bucket it has no id: it is
whichever name a heading uses, read the same everywhere that name turns up.

Not every bucket carries every heading — Design System alone has a Blocked
column, and Waiting review, Doing, To do and Backlog are elsewhere — but the
board draws all of them on every bucket's view regardless, empty wherever that
bucket has no tasks in one. A rename, a reorder, an add or a delete here
reaches every bucket the same way, seeding an empty heading into whichever ones
did not already have it. That looks like more of a file change than it is:
nothing about what is drawn moves, since the empty column was already showing
there before the edit, and the alternative was worse — the column order is
read off the file by scanning bucket by bucket and remembering each name the
first time it appears, so a column confined to one bucket cannot be reordered
relative to the others without every bucket agreeing it exists, or nothing
about its new position inside that one bucket would be visible to the scan at
all.

Deleting works like deleting a bucket: empty, it just goes; holding tasks
anywhere, the sheet asks which column they move to first. The last remaining
column cannot be deleted, for the same reason as the last bucket — the board
cannot draw one with nothing to sort into.

A brand new data set starts with the same four columns as every other one —
Waiting review, Doing, To do, Backlog — precisely so a second list's board
reads the same as the first from the moment it exists, rather than falling
back to a generic default nobody chose.

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
| Quick wins | `[effort:: S]` grouped by `[ai:: ]`, plus any step with a written message, plus every recurring meeting with an agenda written on it. Anything waiting on an unfinished blocker, or whose `start:` has not arrived, is left out. |
| Big rocks | `[impact:: high]` and `[effort:: L]` |
| Dependency chain | `blocked-by:`, resolved against `#slug` |
| Delegate to Claude | `[ai:: full]`, ordered by `rank:` |

These used to be sections written into the file by hand, which meant they drifted
from the tasks they described. Deriving them removed that whole class of bug.

### Reports

Every other view answers what to do next. The **Reports** tab answers what got
done, which is what a one-to-one or an end-of-quarter write-up actually asks for
and which nothing here could tell you without counting ticks by hand.

The first report is **Completed in the last 30 days**, broken down by bucket.
It counts the `done:` date the board writes when a task is ticked, so it only
sees work finished since that date started being recorded; anything ticked before
then is invisible to it, and the report says so underneath rather than quietly
under-reporting. Each bucket gets its count, its share of the total and a bar
scaled to the busiest bucket, so a quiet month still reads as a shape instead of
four slivers. Buckets with nothing in them stay on the list, because an empty
bucket is a finding.

Thirty days is not an arbitrary window. Finished work older than that can be
archived out of `todo.md` into `done-archive.md`, so past thirty days the file
stops being the whole story and a longer count taken from it would be wrong
without knowing it. Opening a bucket shows the tasks behind the number, each one
clickable into the drawer like anywhere else. Reading a backup preview reports on
that backup rather than the live file, and nothing on this tab writes anything.

A second report means one more function that returns HTML, listed in
`reportDefs()`. The tab is built to hold more than one.

The column beside it, **Written reports**, holds the other kind. Counting can only
ever say how many. Saying what moved and what it means is a judgement, so those
have to be written, and they are written by asking Claude for one. They live as
Markdown files in the current dataset's own `reports/` folder, listed by the
server at `/reports.json` and opened in place on the tab. Files rather than
sections inside `todo.md`, because a report is finished the day it is written and
the list is not, so keeping them together would mean editing history every time a
task changes. In `data/` rather than anywhere else, because a report about this
list names people, dates and internal decisions, which is the same reason
`todo.md` never leaves that folder.

Each file opens with frontmatter carrying `title`, `date`, `covers`, `topic` and a
one-line `summary`. The list reads only that, so the tab can show a contents page
without fetching every report. The body is pulled in when one is opened.

#### Rules for writing a report

These are the rules Claude follows when asked to generate one. They are here
rather than in a skill so that they are read alongside everything else about the
board.

**Never list individual to-dos.** A report is not a filtered copy of the list. If
the reader wants the tasks, the board is right there. A report that enumerates
what was ticked has done no work.

**Outcomes, not activity.** Say what actually changed for the team or the system,
and what is now possible that was not possible before. The tasks are the evidence
behind that, not the subject of it. "Four of six components documented" and "the
Loom script is written, the recording isn't" are still activity, just described at
a higher altitude than a checklist. "Docs now cover four of the six most-used
components, so contributors stop asking in Slack for the fifth" is the same fact
read for what it changed. Where something has not moved, say so plainly and say
what it is waiting on. A report that only carries wins is not a report.

**Prose by default, bullets when being specific earns it.** When a report needs to
name particular things, components, numbers, decisions, open questions, a short
bullet list is clearer than a sentence carrying six commas. Everywhere else, write
in prose.

**Tiago's voice, and keep it short.** The `tiago-writing-voice` skill is the
reference: contractions, British English, short sentences and short paragraphs, no
em dashes, concrete numbers rather than vague claims. Simple and short beats
thorough. A report nobody finishes reading is worth nothing.

**Under 400 words unless there is a reason to go longer.** Three or four sections
is usually the shape: what moved, what has not, and what the pattern across the
two is. If a section needs a paragraph to say one thing, it needs one sentence.

### Handing a prompt over

A card that carries a written prompt gets **Open in Claude** under the Copy
button. It is an ordinary link to `claude.ai/new?q=`, with the prompt
URL-encoded onto the end, so a click opens a new chat with the text already
sitting in the box — unsent. Unsent is the whole point: most of these prompts
still have a `[path]` to fill in, and one that fired on click would send the
placeholder.

Only prompts get the link. A suggested message is written for a person, so Copy
is the only thing it needs.

### Recurring tasks

Some of the list comes round on a cycle rather than being finished once: the
standing 1:1s, the monthly AOP status update. Before this every one of them was
retyped by hand each cycle, which is how the same task ends up on the list three
times in slightly different words.

One tag, `` `repeat:` ``, and one card:

| | |
| --- | --- |
| `repeat:wed` | every Wednesday |
| `repeat:wed-9:15` | every Wednesday at 9:15 |
| `repeat:15` | the 15th of every month |
| `repeat:wd5` | the fifth working day of every month |
| `repeat:tue2` | the 2nd Tuesday of every month |
| `repeat:tue2-15:00` | the 2nd Tuesday of every month, at 15:00 |
| `repeat:~fri-15:00` | weekly, usually Friday 3pm, but the day moves |

`[due:: ]` is the occurrence the card is currently pointing at, so the tag says
how often and the date says which one. A month too short for the day it names
lands on its last day rather than skipping, since the 31st in February is still a
date somebody meant to hit.

The working-day form is there because a real obligation needed it and neither of
the other two could hold it: the AOP status update is due by the fifth working
day, which is 7 September, 7 October, 6 November — a different date every month
and not a day of the month at all. Working means Monday to Friday, and the tag
knows nothing about bank holidays. That is deliberate rather than lazy: the
checker already flags any date that lands on one, so teaching the board the
holiday list too would be two lists to keep in step for no extra answer.

The `~` prefix says the cadence is the usual shape rather than a rule. The design
system drop-in is why it exists: it is weekly, but which day it lands on gets
rebooked around everything else, so four consecutive sessions ran Friday,
Thursday, Friday, Thursday. Without `~` the checker would flag every one of those
as a date disagreeing with its tag, which is correct for a fixed slot and pure
noise for this one. The board still rolls to the tagged day, because that is the
best default available — and the date stays his to correct when the session moves.

### What happens when the meeting does not happen

Nothing is ever lost: the roll rewrites dates and ticks, and it never deletes a
task or a topic. But "the date passed" and "the meeting happened" are not the
same fact, and the board only knows the first one. So the tick is what it reads
to tell them apart, and there are three cases.

**It moved, and you knew in advance.** Change the due date to the new day. The
roll only fires on a date in the past, so a card dated forward is left completely
alone — the agenda stays live, the tick stays where it was. One edit, and it is
the case worth reaching for.

**It did not happen, and the date slid past.** The card was never ticked, which
means the prep was never delivered and those topics were never raised. So the
agenda **carries forward** onto the new date rather than being filed as last
cycle's, and the status line says so. Carrying a topic that did get discussed is
the cheaper of the two mistakes: a line he can see and delete, rather than one he
cannot see and has lost.

**It was cancelled after you had prepared.** The card was ticked, so the roll
files the agenda as `Previous agenda` — the board cannot tell a delivered agenda
from a cancelled one. Which is why that block has its own Copy, dated with the
occurrence the card points at *now* rather than the one it was written for. Odd
written down, right in use: the only reason to copy a past agenda is that its
meeting moved, so what is wanted is those topics under the new date.

**A recurring task's sub-steps roll with it.** Its steps are the work of one
occurrence — send the nudge, review what came back — so a step still ticked from
last time would read as already done for a cycle it has never seen. They are
unticked, their `done:` dates cleared, and any `[due:: ]` or `start:` on them
moves by exactly the number of days the parent moved. That last part matters
because a step's date is an offset rather than a fixed day: "the nudge goes out
two days before" survives the roll, where clearing it would lose the intent and
leaving it would point at a session that has already happened.

The board owns that date. On load, once the date on the card has passed, it moves
the date to the next occurrence, unticks the card, and files whatever agenda was
on it as a `Previous agenda (that date):` note. It says so in the status line,
because it changed what a card said without being asked, and it does none of it
while a backup is being previewed — rewriting the dates in a record of a past
state would be a lie about what was on disk that day.

**The board rather than the skill, and on load rather than on a timer.** The
board is open every day; a check-in is not, so a week without one would otherwise
leave last week's date sitting on the card. It sits beside the two fixups that
were already there — renaming Parked to Backlog, dating a task that was ticked
without one — for the same reason all three are automatic: they are facts about
the file rather than decisions about the work.

**One card that rolls, not a template that spawns copies.** A card per occurrence
would put a ticked "prepare for the 1:1" into Done every week for as long as the
meeting exists, and the only question ever asked of last week's is what was on
it — which is one note, not a whole card. Hence `Previous agenda`, which is one
cycle of history and no more.

The tick on a recurring task means *prepared for this one*, not *this happened*.
That is why there is no "agenda ready" chip: the card is the prep, so ticking it
is the status, and a chip saying the same thing a second way would be a second
thing to keep in step. Tick it when the agenda is written, it leaves Quick wins,
and it comes back unticked after the meeting.

### The agenda for a recurring meeting

A recurring meeting also carries the topics for the next one, as an `Agenda:`
block on the task:

```
- [ ] **Prepare for 1:1 with Anu** [impact:: med] [effort:: S] [due:: 2026-09-02] `repeat:wed-9:15`
  - Agenda:
    - AOP2027
      - Confirm the rescoped recommendation is agreed so the tracker can go out.
    - Personal objectives
      - Shared 26 Aug, pending validation before Sage.
```

That note is the one thing in the file that is a block rather than a quoted line.
Every other note — a message, a prompt, a ticket summary — is a sentence, and a
sentence fits on a line. An agenda is a bullet list with a second level under it,
because that is the thing being produced: it gets pasted into somebody else's
document, and the bullets are the format rather than a way of drawing it. So the
note is the heading and the content is whatever sits indented beneath it, ending
at the first line that is not.

There is no date on the note. The task's `[due:: ]` is the meeting date, and
since the board rolls that forward itself and clears the block as it goes, the
block always holds the agenda for the meeting the card is pointing at. An earlier
version dated the note and marked it amber when the date had gone by; rolling the
task removed the state that marker existed to describe.

#### What Copy actually puts on the clipboard

Not the markdown above. This:

```
Wednesday, 2 September 2026

Agenda
- AOP2027
  - Confirm the rescoped recommendation is agreed so the tracker can go out.
```

The meeting date in full on its own line, a blank line, the word Agenda on its
own line, then both levels as bullets. The board builds it from the block and the
task's date, so nothing in the file carries the title or the blank line.

Two flavours go on together, `text/plain` and `text/html`. Plain text alone does
not survive the paste: Google Docs turns a leading `- ` into a bullet only
sometimes and loses the second level every time, so an agenda arrives as literal
hyphens. Given the HTML flavour it reads the `<ul>` and produces real nested
bullets. Anything that cannot read HTML — a terminal, a plain notes field — still
gets the text, so nothing has to choose in advance which one the destination
wants. `ClipboardItem` is what carries both; where it is missing, or where the
browser refuses the write, the fallback copies a selection out of a
`contenteditable` rather than a `textarea`, since that is the only way
`execCommand` ever kept formatting.

On screen the block is drawn as an actual `<ul>`, not as styled indentation, for
the same reason: what is on screen and what lands in the document should not be
two designs of one list.

#### Where the topics come from

Not the board's business. That lives in `## Context`, under `### Recurring
meeting prep scripts`: one line per meeting in Tiago's own words, saying when it
happens, what it is usually about, and what to check before it. `pa-checkin`
reads that script, pulls the live status of whatever it points at, reads
`Previous agenda` to see what was already raised, and writes the block. Keeping
the script in Context rather than in the skill is deliberate, and the same call
`### How I want messages and prompts written` made: he can edit it on the board,
he cannot edit the skill, so his copy is the one that is current.

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
`data/<dataset>/views.md`, which git ignores along with the rest of that folder,
because once the queries have run it holds the real list. Start it with:

```bash
cp views.template.txt data/twinkl/views.md
```

— one copy per data set, since each is its own vault with its own list, and
each needs its own generated file to hold the queries' answers.

The template is `.txt` rather than `.md` deliberately. The Serializer writes into
every markdown file in the vault that carries a query marker, with no regard for
which files git tracks, so a markdown template would have had the real list
written into it and committed. Non-markdown files are ignored, which is the guard.

Then open **`data/<dataset>/`** as an Obsidian vault — that folder, not `data/`
itself and not the repo, so the vault holds one list and nothing else. Opening
`data/` would put every data set in one vault, mixing lists that the board keeps
deliberately apart. Install Dataview and Dataview Serializer
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

`skills/pa-checkin/` is a Claude skill that runs the review session: read
and report, ask what changed, apply updates, optimise, check the one thing,
verify. It is packaged as `skills/dist/pa-checkin.skill` for installing.

`scripts/check_todo.py` is a mechanical checker — dates on weekends, sub-steps
running past their parent, a `blocked-by:` pointing at nothing, duplicate ranks,
more than one `headline:`, missing scores, a `repeat:` the board cannot read or
one whose date does not fall on its own cycle, an agenda topic with no context
under it, and a queried tag written in a form Dataview cannot read. Run it
directly:

```bash
python3 skills/pa-checkin/scripts/check_todo.py data/twinkl/todo.md
```

`pa-checkin/references/conventions.md` is the file format.
`pa-checkin/references/audit-checklist.md` is what to check by hand that the
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
- [ ] **A task** [impact:: high] [effort:: M] [due:: 2026-08-21] [ai:: partial] [to:: Ana]
  - [ ] A sub-step [due:: 2026-08-19] [ai:: full]
    - Suggested message: "..."   <- ready to send
    - Prompt: "..."              <- ready to hand to Claude
    - Jira (DSYS): "..."         <- a ticket still to raise
    - Description: "..."         <- and its body
  - [ ] A gated step `start:2026-09-01` `blocked-by:some-slug`

- [ ] **A recurring task** `repeat:wed-9:15`   <- how often, board keeps the date
  - Agenda:                     <- a block, not a line: the topics to paste
    - A topic
      - what needs saying about it
```

Tags work on sub-steps as readily as on tasks, and usually belong there.

The columns on the board are exactly the `###` headings in the file, so a new
state is a heading rather than a code change. The board reads them in reverse
file order and adds a **Done** column on the end that no heading produces. Left
to right that is Backlog, To do, Doing, Waiting review, Done.

**Blocked** sits between Doing and Waiting review, but it is not a standing
heading like the other four — it has no place in the file until a task is
actually moved there from the drawer's Column field, and the board drops the
column again once nothing is left in it. Use it for a task that cannot move
until something outside it changes, as distinct from `blocked-by:`, which
points at another task on the list rather than an external hold-up.

`[to:: ]` is who the task has been handed to. It is a person's name, and it is
optional: most of the list is work you are doing yourself, and a task without it
shows nothing. It is deliberately separate from `[ai:: ]`, which says whether
Claude is doing the work. The two answer different questions, and a task can
easily be delegated to somebody and still be drafted by Claude first. When it is
set, the name appears on the card as an arrowed chip in the accent colour, so
scanning a column tells you what is with somebody else without opening anything.

**Waiting review** holds work that is finished as far as you are concerned and is
now sitting with somebody else for sign-off. Nothing is owed on it until it comes
back, which is a different thing from Doing (live) and from Backlog (real work,
unscheduled). It appears first in each bucket in the file and last before Done on
the board, because the two orders are mirrors of each other.

### Two tag syntaxes

`impact`, `effort`, `due`, `ai` and `to` are written as Dataview inline fields,
in brackets with a double colon. Everything else is a backtick code span.

The split is not cosmetic. Dataview cannot read inside a code span, so those four
had to come out of one for the Obsidian views to work, and the rest stayed in one
because a line carrying eight bracketed fields is unreadable and nothing queries
them. The older `` `due:2026-08-21` `` form is still read correctly by the board and
by the checker, permanently — the backups and the done archive are full of it —
but nothing writes it any more, and the checker flags one on a task line.
