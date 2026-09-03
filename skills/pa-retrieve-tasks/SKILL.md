---
name: pa-retrieve-tasks
description: Pull the action items captured from the owner's meetings by whatever recorder was in the room, review them with him one by one, and add the ones he keeps to his master to-do list at Code/to-dos/data/todo.md. Jamie is the source configured today. Use whenever he asks what came out of his calls, what he was actioned with, what the recorder picked up, or asks to check today's, yesterday's or this week's meetings for tasks. Phrasings include "check my Jamie calls", "any tasks from today's meetings", "what did I get actioned with", "pull my action items", "what came out of the DS WG", "did I pick anything up in that call", and "add my meeting tasks to my list". Also use when he names one meeting and wants its actions. Do not use it to summarise a meeting he just wants to read, to create new action items in the recorder, or to review the to-do list itself, which is pa-checkin.
---

# Meeting actions into the to-do list

Something sits in his meetings and writes down who agreed to do what. This skill
moves the ones that are his onto the list and closes them where they came from, so
that the record of a decision and the record of the work are the same record, in
one place.

It exists because the two systems drift within a day. The recorder holds an action
item that nobody reads again, the list holds the work he actually plans against,
and the gap between them is where a commitment made out loud goes missing. The fix
is not to read the recorder more often. It is to empty it into the list, on
purpose, and know that the list is complete.

The process below is the same whatever recorded the meeting. What changes per
source is mechanical, and it lives in `references/sources/`.

## Which source

Read `references/sources/` and use what is there.

- **He names one** — use it. If there is no file for it, say so rather than guessing at its tools.
- **One file exists** — use it without asking. Today that is `jamie.md`.
- **Several exist and he named none** — pick from what he said, since he will usually have named a meeting that only one of them recorded. Ask only when nothing points either way.

Read the source file before the first call. It carries the tool names, and on an
MCP source those schemas are usually deferred, so they need fetching before they
can be called at all.

## What a source file has to answer

Seven things, and the process below assumes all seven. A source that cannot answer
them is not ready to be added.

1. **How to connect**, and how to tell whether it is connected.
2. **How to list what it captured for a date window**, including how it paginates.
3. **How each item names the person it was assigned to.**
4. **How to recognise him** in that field, which is rarely his work email.
5. **How to get more context** when an item's wording is too thin to act on — the meeting, the transcript, the search.
6. **What to write in the provenance note**, so a task carries the meeting it came from.
7. **What timestamp on each item says when the recorder created it**, since that is what the watermark is compared against.

It should also say what the source gets wrong, because every one of them has a
house style and knowing it in advance is what stops a bad task reaching him.

## What this skill does not do

**It does not write to the source at all.** Recorders offer tools to create action
items and, on some, to tick them off. This skill calls none of them. Two lists that
both claim to be the plan is the failure this whole repo is built to avoid, and the
list is the one that wins.

Closing items in the recorder was tried and dropped on 1 Sep 2026. Jamie's MCP
server has no `update_task`, so there was nothing to call, and the wider point held
anyway: he does not work out of the recorder's interface, so its state is not worth
maintaining. What he needs is not a tidy recorder, it is never being shown the same
action item twice.

That is what the watermark does, and it is strictly better than closing things
would have been. Closing only covers what he kept. The watermark covers everything
he was shown, including what he declined, which is the larger pile.

The watermark says a decline happened, not what it was. Getting back to one meant
naming a wider window by hand and re-reading everything in it, declines and all, to
find the one line he actually wanted. `data/<dataset>/meeting-declines.md` fixes
that: every declined item is logged there as it happens, so a specific decline can
be found and revisited on its own without re-pulling anything. See **Log the
declines** under Move 4, and **Revisiting a decline** under Judgement calls.

**It does not add anything without asking.** A recorder captures action items for
everyone in the room, and its wording is a machine's summary of what was said. Most
of what comes back is not his, and some of what is his is already on the list under
a better title. The review is the point of the skill; the pull is the easy half.

**It does not apply the file conventions itself.** Once he has picked what to keep,
hand the writing to `pa-checkin`. That skill owns the buckets, the scores, the
tag syntax and the checker, and it should stay the only thing that edits todo.md.

## The five moves

### 1. Pull

**Read the watermark first.** It is the `Meeting actions last pulled` line in the
header of todo.md, a UTC timestamp, and the window runs from there to now. Move 5
sets it. Everything before it he has already been shown and already decided about,
kept or declined, and showing it again is the one thing this skill must not do.

Filter on when the recorder created each item, not on when the meeting happened. A
call on Friday afternoon whose actions were written up on Monday morning belongs to
Monday's pull, and matching on the meeting time would drop it.

**When the watermark says `never`,** or the line is missing, fall back to the start
of the previous business day. On a Tuesday that is Monday and Tuesday. On a Monday
it is Friday onwards, so the weekend is inside the window rather than a hole in it,
and the same holds for the Tuesday after a bank holiday Monday.

Business day here means what it means everywhere else in this system: weekends
are out and UK bank holidays are out, since the team is UK-based. The England and
Wales dates for 2026 and 2027 are in
`~/Code/to-dos/skills/pa-checkin/scripts/check_todo.py`, which is the
authority when a date is borderline.

**When he names a window, his wins.** "This week" means Monday to today. "Go back
to last Wednesday" means exactly that, watermark ignored, which is also how a
decline gets revisited. Say that the watermark was overridden when it was, since
he will otherwise see items he has already turned down and think the skill is
broken.

Say which days were covered when reporting back. "Nothing from your calls" means
something different over one day than over a weekend, and he cannot tell which
one he is being told without the dates.

Ask the source for two things over that window, in the same message since neither
depends on the other:

- **The meetings themselves**, so the report can name the calls that were checked and produced nothing. That line matters more than it looks: it is the difference between "no tasks for you" and "no tasks for you, and here is the proof I looked."
- **The action items**, with the assignee, the completion state, the creation timestamp and which meeting each came from.

Follow the pagination all the way. A truncated pull that reads as complete is worse
than no pull.

Only go back for the full meeting when an item's wording is ambiguous enough that
you cannot write it into the list without guessing. That is common: recorders write
summaries, not instructions, and something like "address the design system board
task regarding read-only states" needs the room's context before it is a task
anybody can start. Read the transcript when the summary is not enough. Do not read
every meeting by reflex.

### 2. Filter

Three piles, and only the first one is his:

- **His, open.** These are the candidates.
- **His, already marked done in the source.** He did them in the meeting or straight after. Never add these to the list, and never add them pre-ticked either — a done task arriving on the list is noise with no future. Name them in one line so he knows they were seen, and if he says one is not actually finished, it moves to the first pile.
- **Everybody else's.** These stay out, including the ones that mention him. "Send Tiago the file" is somebody else's task and putting it on his list makes him responsible for chasing himself. At most it is one closing line, and only when he is waiting on the output.

The one exception in the third pile: a task assigned to someone who reports to him,
where the real work is his to unblock or follow up. That is a judgement call, so
raise it as a question rather than adding it.

### 3. Review

One message. Number his open tasks, and for each one give:

- the task, rewritten as an instruction rather than a summary
- the meeting it came from and the time
- **new** or **already on the list**, with the existing task's title where it is a duplicate
- the bucket, state and both scores you would give it

Then one question: which of these to add. He answers with numbers.

**Check for duplicates before this message, not after.** Grep todo.md for the
distinctive nouns in each task, not for the whole sentence, since the recorder's
phrasing will never match his. Search the whole file including ticked tasks, and
check `data/backups/done-archive.md` too, because something finished last month and
archived out is a different answer from something that was never on the list. A
task that already exists as a sub-step of something bigger counts as a duplicate,
and saying which parent it sits under is the useful part of that line.

**Rewrite the wording before showing it to him.** A recorder writes "Explore other
design systems' form and input field states to replicate best practices for
accessibility." The list wants the thing to do and the object it acts on. Drop
"address", "regarding", "ensure proper", and anything that describes the discussion
rather than the work. Keep the specifics — a name, a file, a board, a date — those
are what make it startable later.

### 4. Add

Invoke `pa-checkin` with what he kept, and let it do the writing: bucket,
state, `[impact:: ]`, `[effort:: ]`, `[ai:: ]`, a suggested message on any step
whose work is contacting somebody, and the checker before delivering.

Two things to pass through to it, since they come from here and it cannot know them:

- **The provenance line.** Every task from a meeting carries a note saying which meeting and which date: "From the DS-Design WG on 27 Aug." It explains why the task exists to whoever reads it in three weeks, and it is what makes the next duplicate check work.
- **Anything the transcript said that the task text lost.** A deadline somebody named out loud, a person who has to be involved, the reason it was raised. That context is in the meeting and nowhere else, and it is the whole reason a task written from a transcript beats a task written from a title.

New tasks go to **To do** or **Backlog**. Never to Doing, even when he agreed in the
meeting to start it today, because Doing is his own statement about what is live.

**Log the declines.** For every candidate from Move 3 he did not pick, append one
line to `data/<dataset>/meeting-declines.md` (create it, with the heading below, if
it does not exist yet):

```
# Declined meeting actions

Every item this skill has shown him and he chose not to add — recorded so one can
be found and revisited by name later, without re-pulling and re-showing everything
else from the same window. Nothing here is ever deleted: a decline that is later
added gets a second line saying so: the first line stays as the record that it was
once turned down.

## 2026-09-03 pull

- **Send the Q3 board deck to Anu for review.** From the DS-Design WG on 27 Aug 2026.
```

One `## <date> pull` section per pull, the rewritten task text bolded exactly as it
was shown to him, then the provenance line, same wording as what would have gone on
the task had he kept it. That is what a later search matches against. Skip the
already-marked-done pile from Move 2 — those were never a decline, they were already
finished — but do log the third pile's borderline case (someone who reports to him)
when he says no to raising it, since that is a real decline too.

### 5. Stamp

Move the watermark forward, so nothing in this pull is ever shown to him again.

It lives on the `Meeting actions last pulled` line in the header of todo.md, as a
full UTC timestamp. `never` is a valid value and means no pull has happened yet.
`pa-checkin` owns that line's format; this skill owns its value.

**Set it to the end of the window that was pulled, not to the moment the writing
finished.** Those differ by however long the review took, and a task the recorder
created while he was reading the review would be skipped forever if the stamp
overshot it.

**After the writing, never before.** If `pa-checkin` fails halfway, or he walks
away mid-review, a watermark already moved has silently swallowed everything in
that window. Write the tasks, log the declines, confirm both landed, then stamp.

**Stamp whatever he was shown, not what he kept.** The declines are the point. He
has already decided about them, and asking again tomorrow is the exact noise this
step exists to stop. The decline log is what makes that safe to do without also
losing the ability to go back to one on request — see **Revisiting a decline**
below.

**Say the new value in the closing line.** It is the one piece of state this skill
writes, and a stamp that moved when he thought it had not is how a day of meetings
goes missing without anybody noticing.

## Judgement calls that come up

**He asks to revisit a decline.** "Actually let's add that thing about X I skipped",
naming a meeting, a subject or roughly what it said. Grep
`data/<dataset>/meeting-declines.md` for it rather than re-pulling from the source —
the text is already sitting there with its provenance, and re-pulling would mean
widening the watermark and re-showing everything else from that window as well,
declines he meant to leave declined included.

Found, run it through Filter and the duplicate check again before offering it —
time has passed, and it may have been added a different way since, or somebody else
may have picked it up. If he confirms, hand it to `pa-checkin` exactly as Move 4
does, carrying the same provenance line, then append a second line under the
original entry in the decline log: `  → added 2026-09-10`, dated the day this
happened, so the log still shows it was once turned down and shows what changed. If
he still doesn't want it, leave the entry as it is — one look was the whole point of
asking.

Not found by name, ask which meeting or roughly when, since the log is grepped by
what the item says and a vague description will not match on the first try. Still
nothing, it may be old enough that only a wider pull of the source itself will find
it — that is the fallback this replaces, not a case it removes.

**The recorder split one thing into three tasks.** Meetings circle a subject, so the
same commitment gets captured three times in different words. Propose it as one
task with the three as sub-steps, and say that is what you did.

**A task is his but belongs to a project rather than the list.** If it needs a
plan, a ticket history or source documents behind it, that is
`data/projects/<name>/`, and the list carries one line pointing at it. Ask rather
than deciding.

**The action item is really a fact about a person.** Somebody going on leave, a
contract ending, who now owns a board. That goes in `## Context` in todo.md, not
into a bucket. The test is the same one the other skill uses: would he ever tick it.

**A task has a date somebody said in the room.** Trust it, and say in the review
line that the date came from the meeting rather than from you. A date agreed out
loud is stronger evidence than anything else this process produces.

**Nothing came back for him.** Say so in two lines: the meetings checked, and that
none carried a task for him. Do not go hunting through transcripts for work he
might have implicitly picked up. The recorder not finding a task is a real answer.

**He asks about one meeting rather than a day.** Find it however the source file
says to, then pull its tasks. The other three moves are unchanged.

**Two sources recorded the same meeting.** Pull from one. The duplicate check runs
against todo.md, not against the other recorder, so taking both puts the same task
in front of him twice with different wording.

## Tone

Same as `pa-checkin`, because he reads both between meetings. Short bullets,
plain sentences, no preamble, no restating what he asked for. The review message is
the one place a numbered list is right, since he is answering it with numbers.
