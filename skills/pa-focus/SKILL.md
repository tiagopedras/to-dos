---
name: pa-focus
description: Question whether too much is sitting in To do and Doing on the owner's master to-do list, at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl"), and go through both columns one task at a time to work out what is actually being worked, what hasn't started and is honestly still two to four weeks out, and what should go back to Backlog because it isn't really getting picked up any time soon. Opens with a count in each column, by bucket. Use whenever he asks something like "am I taking on too much", "let's do a focus check", "how much have I got in flight", "review my To do and Doing", "help me trim my WIP", "what should go back to Backlog", or "is this realistic". Top-level tasks only — a sub-step has no column of its own, it inherits its parent's. Do not use this for Waiting review or Blocked, which is pa-unstick, or for a general status read or re-prioritisation, which is pa-checkin. This skill only reviews and asks; pa-checkin does the actual writing.
---

# Focus: trimming Doing and To do

**Read `~/Code/to-dos/PA.md` first, then `~/Code/to-dos/CONVENTIONS.md`.** The first holds who he is, where the list lives, how he prioritises, the standing rules and the tone. The second holds the file format. Neither is repeated below.

Doing and To do are not neutral holding areas. Doing is his own claim that
something is live, roughly the next two weeks. To do is the claim that
something is genuinely two to four weeks out — next up, not just intended.
Backlog is the honest state for everything else: real work, no time pressure
yet. Nothing enforces the difference — a task can sit in either column for
months without ever being challenged, because neither carries a date that
expires and nothing on the board distinguishes "about to start" from "would be
nice."

That drift is what this skill exists to catch, on request rather than on a
schedule: count what is in each column, then go through it one task at a time
and ask whether the column still tells the truth.

## What counts

Top-level tasks only, in To do and Doing, read from the live board rather than
assumed.

## The three moves

### 1. Count

Read the file, group by column and bucket, and open with the numbers before
anything else: how many in Doing, how many in To do, across which buckets.
Say it plainly enough that "4 in Doing, 9 in To do, most of it Design System"
is a real answer on its own.

If a column is empty, say so and skip it.

The count is not the deliverable, it is the lead-in. Move straight from it
into move 2 in the same turn.

### 2. Walk through, one at a time

**Every task in both columns, not a sample.** The count in move 1 is a
promise about how many are coming.

**One task per message.** Show it, ask about it, then stop and wait for his
actual reply before naming the next one. Do not describe several tasks and
their questions in one message and call that walking through them.

Order: Doing first, then To do — Doing makes the stronger claim, so it is the
more expensive one to be wrong about. Within a column, soonest due first,
then undated ones last.

For each task, show what is already known before asking anything: the title,
the bucket, its impact/effort scores, and its due date if it has one. Do not
make him re-explain what the file already says.

Then one question, shaped to the column it is in:

- **Doing** — "still genuinely live, or has this actually stalled?" Doing is a
  statement of fact, not intent — if nothing has moved on it, that fact is no
  longer true.
- **To do** — "really two to four weeks out, or has this just been sitting
  here?" A task with no realistic start in that window is not next up, it's
  parked, and Backlog is where parked work belongs — that's not a demotion,
  it's the honest label.

Take whatever he says and turn it into one of a small set of outcomes — do not
invent more:

- **Move it to Backlog**, when it isn't really getting picked up soon. This is
  the outcome the skill exists to surface — say it plainly when the pattern
  fits rather than waiting to be asked.
- **Move it between Doing and To do**, when the column just doesn't match
  reality (started work sitting in To do; stalled work sitting in Doing).
- **Tick it done**, if it turns out finished.
- **Leave it**, when the column is genuinely right. Not everything in Doing or
  To do is a problem — say so and move on rather than manufacturing an edit.

Batch a few before writing if he answers quickly through several in a row, but
do not let more than a handful pile up unwritten.

### 3. Hand the writing to pa-checkin

This skill does not touch todo.md itself. Once he has answered for the ones he
wants to act on, pass the list of changes to `pa-checkin` — column and bucket
moves, ticks — and let it apply them, run the checker, and stamp
`Last updated`.

## Closing read

After the pass, say in one line whether what's left in Doing and To do still
looks realistic — not a lecture, a single observation he can take or leave.
"Doing's down to 3, that tracks" is as valid a close as "To do's still got 11
in it across four buckets, worth another pass next week." Do not attach a
number or a rule to it — capacity ceilings and `week` tagging are
`pa-checkin`'s territory (see `~/Code/to-dos/CONVENTIONS.md`, "This week"),
not this skill's to invent.

## Judgement calls that come up

**A task has been in Doing or To do for what looks like a long time.**
Nothing in the file records when a task entered a column, so do not claim an
exact duration — say what you can see (no recent note, no sign of movement)
and let him supply the "since when."

**He wants to cover only one column.** Fine — go straight to the one he
named. Do not insist on covering both just because the skill can.

**A task in Doing has actually finished but not been ticked.** Tick it, don't
move it anywhere first.

**A task in Doing is real work but is actually stuck on something outside
it** — that's pa-unstick's question, not this one. Note it and point him
there rather than trying to resolve it here.

**He answers with a batch instruction** ("move everything untouched in To do
back to Backlog"). Confirm the list before applying it — a blanket
instruction over several tasks is exactly where one of them turns out to be
the exception.

## Tone

See `~/Code/to-dos/PA.md`.

The count in move 1 is a sentence, not a table, and the question for each task is one line. This is a conversation to move through quickly, not a form.
