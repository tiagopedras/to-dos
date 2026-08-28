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

All four of the items below have landed.

**Written reports should report on outcomes, not on tasks. — done.** The README
rule now says "outcomes, not activity" and carries a worked example of each: a
task-shaped fact restated for what it changed, side by side.

**Open a report in a modal instead of expanding the card. — done.** Clicking a
report now opens it in `showModal`'s new wide variant (760px, reuses the same
Markdown rendering) instead of unfolding inline in the narrow column. The closed
state — title, date, standfirst — is unchanged.

**Nothing can report further back than 30 days. — done.** `completedRecently()`
now reads `data/backups/done-archive.md` (fetched once client-side, parsed with
the same `parseTask()` as `todo.md`, cached until the next archive run) whenever
the chosen window reaches past `ARCHIVE_DAYS`. A "Past 90 days" option was added
to the picker for a proper quarterly view. An archived task shows in the
breakdown as plain text rather than an openable card, since there's no longer a
live task to open.

**A report has no shape over time, only a count for the window it covers. —
done.** A "Weekly pace" chart sits under the category breakdown: eight trailing
Monday-to-Sunday weeks, bar per week, plus a one-line read on whether the last
few weeks are running ahead of, behind, or level with the ones before them.
Independent of the window picker on purpose, so changing one never resizes the
other.

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
