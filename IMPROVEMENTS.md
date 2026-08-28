# Board improvements

The standing list of what is still wrong with this app and what should be built
next. It does the same job for the board that `DS-KNOWN-ISSUES.md` does for the
design system: it holds the state of the tool, not the work.

Deliberately separate from `data/todo.md`. That file is Tiago's actual work and it
is private. This one is about the code, it holds no names and no dates, so it is
tracked in git alongside the thing it describes.

Read it before diagnosing anything here. If a problem is already written down,
what is wanted is progress on the fix, not another report of the symptom. When
something lands or something new turns up, edit this file rather than only saying
so in chat.

## Reports

**Written reports should report on outcomes, not on tasks.** The rules in the
README already say a report never lists individual to-dos, and that stopped the
worst version. But the first design system report still leans on task-shaped
facts, for example "four of six done" and "the Loom script is written, the
recording isn't". That is activity described at a higher altitude, and it is still
activity. What a report should say is what actually changed for the team or the
system, and what is now possible that was not possible before. The tasks are the
evidence behind that, not the subject of it. The rules need rewriting to make the
difference explicit, with an example of each so the line is obvious.

**Open a report in a modal instead of expanding the card.** Right now clicking a
report unfolds it inside its own item in the right-hand column, which means a
600 word report is read down a 500 pixel gutter while the counted report sits
beside it doing nothing. A report is a document and wants a document's width. The
modal machinery already exists, `showModal` is what the archive confirmation uses,
so this is mostly a matter of giving it a wider variant that can hold rendered
Markdown. The closed state stays exactly as it is, since the title, the standfirst
and the window it covers are already a decent contents page.

**Nothing can report further back than 30 days.** Finished work older than a month
is archived into `data/backups/done-archive.md`, and no view reads that file back.
So the counted report stops at 30 days and a quarterly one cannot be built at all.
Teaching the server to parse the archive alongside `todo.md` would unlock every
window longer than a month, which is the window most reviews actually use.

## Chats on a task

**The whole feature sits on `claude-from-the-card` and has not been merged.** A
task can carry a list of Claude Code conversations, each running against the
local CLI and answering in a modal, with a `claude://resume` link that hands one
to Claude Desktop with its history intact. It branched before the Reports work
landed, so merging it conflicts in one place, `kanban/server.py`, where both
sides added endpoints to the same handler. `kanban/index.html` merges cleanly
despite both sides editing it. That branch also carries the in-flight Projects
panel and Jira ticket work, because the chat code sits inside `suggestions()`,
`openDrawer()` and `messageHTML()` and calls into both — the three could not be
separated into their own commits.

**A chat started and never saved leaves an entry nothing points at.** The link
between a task and its conversations is a `chat:` tag on the task line, minted
the first time a chat is started there. Minting marks the list dirty like any
other edit, so until it is saved the tag exists only in the tab — and a reload
before then leaves the sessions recorded in `data/sessions.json` under a key no
task carries. Nothing is lost, since the transcript is Claude Code's own file
and still opens in the desktop app, but the board can no longer reach it, and
the `×` that would clear it is on a row that is never drawn. Either the key
should be written and saved in one step, or the board should offer a way to see
and clear keys nothing claims.

**Work mode has never been exercised through the interface.** `Do it` runs with
permissions bypassed and only appears when `data/claude.json` says `"work":
true`, which no config here does, so the button has never rendered. The path
underneath it is known to work — a run driven straight at the endpoint wrote its
file — but the button, its warning colour and what the modal does while a run is
editing files are all unproven.

**Two chats running at once is the point of the list and has not been tried.**
The helper caps concurrent runs at two and a row shows `running` while its chat
works, both correct by construction and neither observed. The interesting case
is a second chat started while the first is still going, since the modal shows
one conversation at a time and the run it is not showing has to survive being
looked away from.

## Rough edges

**A finished task keeps sitting in its old tier.** Ticking something does not move
it, so the report lists completed work under To do and Backlog, which reads as
wrong even though it is exactly what the file says. Either the tick moves the task
to a Done tier, or the reports stop showing the tier next to finished work. The
first is a real change to how the file is organised and needs deciding rather than
just doing.

**Sub-steps are ticked without a date.** `setDone` writes `done:` on a task, but
`toggleSub` only flips the box on the line. There are 87 sub-steps in the Design
System bucket alone and 31 of them are ticked, so a real amount of finished work
is invisible to anything that counts. Dating them would need the same treatment
tasks got.

**Bold inside a title survives into the card.** The parser only strips `**` when
it wraps the whole title, so a task written as `**Find out who is using it**,
findings gathered 20 Aug` shows its asterisks on the reference cards, the matrix
hover and the report lists. Every one of those renders the title with `esc()`
rather than `mdInline()`. Changing it is a one-line fix in several places, and it
should be done in all of them at once or not at all.
