---
name: do
description: Carry out the work he has handed to the Implement agent, on the list at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl"), one task at a time, by handing each to the implement-agent agent. Use whenever he says to do, run, carry out, action or get on with an agreed plan, asks what is waiting to be run, says "let's do the ones I agreed", "run that plan", "action the agreed ones", "what did I say yes to", or names one task and asks to get it done. Also use after a pa-review-plans session where he approved a plan, since approving the plan is what starts it towards this. Do not use it to read or triage plans, which is pa-review-plans, and do not use it to run the planning agent, which is the Data menu's Run the Plan agent now.
---

# Carrying out an agreed plan

**Read `~/Code/to-dos/agents/pa_agent/PA.md` first, then `~/Code/to-dos/CONVENTIONS.md`.** The
first holds who he is, where the list lives, how he prioritises, the standing
rules and the tone. The second holds the file format. Neither is repeated below.

This is the only skill in the set that causes work to happen rather than
recording a decision about it. Everything else here reads the list or writes to
it after a conversation. This one hands a task to an agent that will produce
something.

## What is waiting, and why nothing runs without him

Handing a task to an agent is his act, and it lays out sub-tasks on the task's own
card: Plan, Review the plan, Implement, Review the work, each blocked by the one
before (`handOver()` in the board's `kanban/js/04-tier-two-the-one-thing.js`).
There is no separate board and no plan `state:` any more. Where the work has got to
is which of those sub-tasks are ticked.

So the work waiting for this skill is a sub-task **assigned to the Implement agent,
open, with what it waits on ticked**. For a task handed to the Plan agent that means
he has approved the plan, which is what unblocks Implement. For a task handed
straight to the Implement agent the task itself is the brief, and it is waiting from
the moment he handed it over.

This skill runs it from a session he is in, where it can stop and ask. Its own
runner (`agents/implement-agent/hooks.py`) may also take a piece of work alone, but
only a planned one whose plan's `type:` is on the list in `core/plan_types.py`
(write-up, draft, prompt, data, deck, code), with the guards that runner holds.
Figma work, a task handed straight to the Implement agent, and anything else wait
for this skill. A sub-task the runner has already finished has its tick queued, so
check `data/<dataset>/tick-queue.json` before offering one: if its tick is waiting,
it is done and only needs the board opened.

## Move 1: what is waiting

Read `data/.current` for the dataset, then read `data/<dataset>/todo.md` and find the
sub-tasks that are `[to:: Implement agent]`, unticked, whose `blocked-by:` slug is
ticked. Their slugs are the task's id and `-implement`. Report the count and list
them: the task title, its bucket, and the plan it was written from, which is the
`Plan:` note under the Review the plan sub-task above it. If there are none, say so
and stop. Do not go looking for work he might like to hand over; that is his call,
made on the card.

Anything he said about the plan sits as `feedback:` notes under the Plan sub-task
and in the review's chat. On a plan he approved it is what he wants kept in mind
while it is built, not a complaint about it.

## Move 2: one at a time, and he picks

Never start work on more than one task at once. Ask which one, or take them in the
order he gives.

Before handing one over, say in two or three lines what the plan proposes and what
carrying it out will produce. He approved it when he read it, possibly days ago,
and the thing about to happen should not be a surprise.

## Move 3: hand it to `implement-agent`

One `implement-agent` run per task. Give it:

- The path to the plan, from the `Plan:` note (`data/<dataset>/plans/<file>.md`), or
  the task itself where it went straight to the agent. That is the instruction.
- Any `feedback:` notes on the Plan sub-task.
- The task's title, bucket and column, and its `Project:` note if it has one.
- The path to the bucket's brief, `data/<dataset>/buckets/<stream>/<stream>.md`, worked
  out the way `bucket_stream()` in `agents/plan-agent/plan.py` does it.

Then stay out of its way. Do not do the work yourself alongside it, and do not
re-plan the task because you can see a better approach. If the plan is wrong, the
answer is to stop and tell him, which is what the agent is told to do too.

## Move 4: what comes back

`implement-agent` reports what it did, what it left and what needs him. Pass that
on in his own terms: what got done in a line or two, then a `**Needs you**` heading
holding what actually stopped or needs a decision. Its report is written for you
rather than for him, so summarise it rather than relaying it, and follow
`How much to say back` in `PA.md` as for any other reply.

Two things to do before you call it done:

- **Queue the tick on the Implement sub-task**, once the report is in:
  `python3 ~/Code/to-dos/core/tick_queue.py tick <sub-id> --by "Implement agent"
  --note "report written"`. It is the agent's own tick, made through the board's
  queue because nobody but the board writes the list, and the board applies it the
  next time it loads, moving the card to Reviewing and unblocking his review of the
  work. The board refuses it if the sub-task is not the Implement agent's or is
  still waiting on his review of the plan, so run it only once the report is in.
- **Anything it wrote is under `data/<dataset>/projects/`.** That folder is private
  and gitignored. Nothing from it goes into a commit, a report or a message.

Approving what it did is his move, on the Review the work sub-task, and it is not
yours to make. Sending it back is his too: it unticks Implement with a note, and the
next `/do` finds it waiting again.

If it asked for a change to `todo.md`, **it goes through `pa`, not the agent.**
`implement-agent` never writes that file. It hands the change up as a request, with
the exact lines before and after. Show him those lines, get a yes, then invoke `pa`
with what he agreed and let it write, check and close with the Reload line. Reload
rather than save, in that order: a tab open since before the write is holding a
stale document, and a save from it would undo the change.

## What this skill never does

- **It never approves a plan, and it never approves the work.** If he says "that
  one looks fine, do it", he is approving the plan; that is ticking the review on
  the card, or asking `pa` to. Approving what was produced is the same move on the
  next review.
- **It never runs the planning agent.** That is Run the Plan agent now in the Data
  menu, and it spends money.
- **It never runs unattended itself.** No cron, no schedule, no background. The
  unattended route is the Implement agent's own runner, decided 21 Sep 2026 for
  the plan types in `core/plan_types.py` and off until he sets its hours on the
  agents dashboard. Everything else only runs in a session he is sitting in
  front of, which was the whole rule from 6 Sep 2026.
