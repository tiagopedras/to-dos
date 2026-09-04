---
name: pa-checkout
description: Walk through everything sitting in Doing, Waiting review or Blocked on the owner's master to-do list, at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl"), one task at a time, and help him decide whether it moves forward, needs more detail, or is stuck for a reason worth naming. Opens with a count in each of the three states. Use whenever he asks to clear the backlog, go through what's stuck, review what's blocked or waiting, chase what's sitting in Doing, or asks something like "let's go through what's stuck", "what's been sitting there", "help me close some of this out", or "what's blocked right now". Top-level tasks only — a sub-step has no state of its own, it inherits its parent's. Do not use this for a general status read or re-prioritisation, which is pa-checkin, or for pulling meeting actions, which is pa-retrieve-tasks. This skill only reviews and asks; pa-checkin does the actual writing.
---

# Unsticking Doing, Waiting review and Blocked

**Read `~/Code/to-dos/PA.md` first, then `~/Code/to-dos/CONVENTIONS.md`.** The first holds who he is, where the list lives, how he prioritises, the standing rules and the tone. The second holds the file format. Neither is repeated below.

Three states on the list are not really about the work, they are a claim about
where it sits: **Doing** says it is live, **Waiting review** says it is finished
and sitting with somebody else, **Blocked** says it cannot move until something
outside the list changes. None of the three carry a date that expires, so a task
can sit in any of them for weeks without ever surfacing as overdue — Doing has no
deadline of its own, Waiting review is deliberately not chased by the checker
(see `check_overdue` in `scripts/check_todo.py`), and Blocked has no timer by
design. That is exactly the shape of thing that goes quiet.

This skill exists to make that go loud instead, on request rather than on a
schedule: count what is sitting in each state, then go through them one at a
time and ask.

## What counts

Top-level tasks only, in the three states named above, read from the live board
rather than assumed.

**Blocked** is a real heading some buckets carry and others do not — see the file
conventions. It is not the same thing as a `blocked-by:` tag, which points at
another task on the list rather than an external hold-up; this skill reads the
column, not the tag. A task blocked-by an unfinished task but still sitting in
Doing is out of scope here — that is what the Overview's dependency chain and
the task drawer's own Dependencies section are for.

## The three moves

### 1. Count

Read the file, group by state, and open with the numbers before anything else:
how many in Doing, how many in Waiting review, how many in Blocked, across which
buckets. This is the one line he might just want and stop there — say it plainly
enough that "3 in Doing, 2 waiting on Anu, 1 blocked" is a real answer on its own,
not just a lead-in to the rest.

If a state is empty, say so and skip it rather than asking him to sit through
nothing.

The count is not the deliverable, it is the lead-in. Move straight from it into
move 2 in the same turn — do not stop and wait after the count, and do not
report the count as if it were the whole answer.

### 2. Walk through, one at a time

**Every task in the three states, not a sample of them.** The count in move 1
is a promise about how many are coming — if it said 11 in Waiting review, he
gets 11, not four picked out as representative. Cutting the list short is a
different failure to reading it out as a batch, but it is still a failure: the
whole point is that nothing sitting in these states goes unseen.

**One task per message.** Show it, ask about it, then stop and wait for his
actual reply before naming the next one. Do not describe several tasks and
their questions in a single message and call that "walking through" them —
that is a report, not the conversation this move is for. He answers, you react
to what he actually said, then you move on.

Order: Blocked first, then Waiting review, then Doing — the ones most likely to
need a decision before the ones that are probably fine as they are. Within a
state, soonest due first, then undated ones last, the same ordering the board
itself uses.

For each task, show what is already known before asking anything: the title,
the bucket, how long it has carried a `[to:: ]` or a note naming who has it (if
any), and its due date if it has one. Do not make him re-explain what the file
already says.

Then one question, shaped to the state it is in:

- **Blocked** — "still blocked on the same thing, or can this move?" A note
  already on the task saying what it is blocked on is the thing to read back to
  him, not just the title — if there is no such note, that is worth naming, since
  a Blocked task with no reason written down is not really trackable.
- **Waiting review** — "any word back, or still waiting?" If it names who has it,
  ask whether it is worth a nudge.
- **Doing** — "still live, or has it stalled?" Doing is his own claim that
  something is in flight; a task that has quietly stopped being worked belongs
  somewhere else, not left implying progress that is not happening.

Take whatever he says and turn it into one of a small set of outcomes — do not
invent more:

- **Move it** to a different state (Doing → Waiting review, Blocked → Doing, and
  so on).
- **Tick it done.**
- **Add or update a note** — who has it, what it is blocked on, a date something
  unblocks. This is usually the actual value of the pass: half of what is "stuck"
  turns out to just be missing the one line that would make its state legible
  next time.
- **Leave it**, when it is genuinely fine where it is. Not every stuck-looking
  task is a problem — say so and move on rather than manufacturing an edit.

Batch a few before writing if he answers quickly through several in a row, but
do not let more than a handful pile up unwritten — a batch lost to a dropped
session is worse than writing after every one.

### 3. Hand the writing to pa-checkin

This skill does not touch todo.md itself. Once he has answered for the ones he
wants to act on, pass the list of changes to `pa-checkin` — bucket and state
moves, ticks, and note text — and let it apply them, run the checker, and stamp
`Last updated`. Same reason `pa-retrieve-tasks` does this: one skill owns the
file conventions and the checker, and a second path that edits it by hand is how
the two drift.

## Judgement calls that come up

**A task has been in the same state for what looks like a long time.** Nothing
in the file records when a task entered a state, so do not claim an exact
duration — say what you can see (no note, no date, nothing to suggest recent
movement) and let him supply the "since when."

**He wants to skip a whole state.** Fine — go straight to the one he named.
Do not insist on covering all three just because the skill can.

**A Blocked task's blocker has obviously cleared** (the note names something
that has since happened). Say so and ask directly whether it should move,
rather than asking the generic question and making him notice it himself.

**Something in Waiting review is actually done** — it came back clear and just
was never ticked. Tick it, do not move it to Doing first.

**He answers with a batch instruction** ("move everything in Blocked to
Doing"). Confirm the list before applying it — a blanket instruction over
several tasks is exactly where one of them turns out to be the exception.

## Tone

See `~/Code/to-dos/PA.md`.

The count in move 1 is a sentence, not a table, and the question for each task is one line. This is a conversation to move through quickly, not a form.
