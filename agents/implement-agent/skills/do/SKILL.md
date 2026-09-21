---
name: do
description: Carry out the plans the owner has accepted on the Plans view of his board, at Code/to-dos/data/<dataset>/plans/ (<dataset> named by data/.current, currently "twinkl"), one at a time, by handing each to the implement-agent agent. Use whenever he says to do, run, carry out, action or get on with an agreed plan, asks what is waiting to be run, says "let's do the ones I agreed", "run that plan", "action the agreed ones", "what did I say yes to", or names one task and asks to get it done. Also use after a pa-review-plans session where he accepted something, since accepting a plan is what starts it towards this. Do not use it to read or triage plans, which is pa-review-plans, and do not use it to run the planning agent, which is the board's own Run now button.
---

# Carrying out an agreed plan

**Read `~/Code/to-dos/agents/pa_agent/PA.md` first, then `~/Code/to-dos/CONVENTIONS.md`.** The
first holds who he is, where the list lives, how he prioritises, the standing
rules and the tone. The second holds the file format. Neither is repeated below.

This is the only skill in the set that causes work to happen rather than
recording a decision about it. Everything else here reads the list or writes to
it after a conversation. This one hands a plan to an agent that will produce
something.

## Which queue this is, and why nothing runs without him

There is one agent board, not two. Plans and Execution were separate until
13 September 2026, and accepting a plan minted a second document — a *run* — that
landed in Execution's Backlog and waited there to be dragged across. That gate
filtered nothing: it was a step to remember, and on 12 Sep six plans stood
accepted with two of their runs never moved. The two boards are one now, the runs
are folded onto the plans they came from, and `data/<dataset>/runs/` is gone.

So a card here is the **plan itself**, in `data/<dataset>/plans/<night>/`. A plan
he has accepted carries `state: accepted`, and a second field says how far this
half has got:

    production: none     he accepted it; nothing has been started
    production: doing    an implement-agent run has it right now
    production: review   it did the work and wrote back; waiting on him
    production: done     he has accepted what it did

A second field rather than more states, because `PACKAGES/work-streams/CONTRACT.md`
allows one `state:` per document and this answers a different question about the
same one: `state` says where the plan is, `production` says what has happened to
the work it describes. The Plans view draws all four in **Ready to be produced**
and marks the card with the stage — six columns rather than eight, decided the
same day, because this agent only ever runs from a session he is sitting in, so
there is never a card to watch move on its own.

While a plan sits accepted, `is_stale()` in `agents/plan-agent/pick.py` leaves
that task alone, so the plan he approved is the one that gets carried out rather
than being replaced overnight by a second opinion.

## Move 1: what is waiting

Read `data/.current` for the dataset, then look through
`data/<dataset>/plans/*/*.md` for frontmatter with `state: accepted` and
`production: none`. Ignore `index.md`. A plan carrying a `feedback:` line has
something he said about it, and it is the first thing the agent needs. What it
says depends on the plan's state, and getting that the wrong way round is how a
plan he agreed with gets carried out as though it had been rejected:

- On an **accepted** plan it is what he wants kept in mind while it is built.
  He agreed with the plan; this is a note on top of it, not a complaint about
  it. It is the only kind a `/do` run ever sees, since `/do` only reads
  accepted plans.
- On a plan **sent back** (`state: ready`, owned by the planning agent) it is
  what was wrong last time, written for the night that rewrites it.

Either way it may be one sentence he typed or a whole conversation he had about
the plan in the board's chat window — both arrive on the same line.

Report the count and list them: the task title, its bucket, and its `summary:`
line. If there are none, say so and stop. Do not go looking for plans he might
like to accept; that is a `pa-review-plans` session and it is his call, not
yours.

## Move 2: one at a time, and he picks

Never start work on more than one plan at once. Ask which one, or take them in
the order he gives.

Before handing one over, say in two or three lines what it proposes and what
carrying it out will produce. He agreed to this plan when he read it, possibly
days ago, and the thing about to happen should not be a surprise.

## Move 3: hand it to `implement-agent`

One `implement-agent` run per plan. Give it:

- The full path to the plan file. It is both the instruction and, since the
  fold, the document the report goes onto — there is no second file.
- Its `feedback:` line, if it has one. On an accepted plan that is what he
  wants kept in mind while building it, not a rejection — see Move 1.
- The task's title, bucket and column, and its `Project:` note if it has one.
- The path to the bucket's brief, `data/<dataset>/buckets/<stream>/<stream>.md`, worked out the
  way `bucket_stream()` in `agents/plan-agent/plan.py` does it.

Then stay out of its way. Do not do the work yourself alongside it, and do not
re-plan the task because you can see a better approach. If the plan is wrong, the
answer is to stop and tell him, which is what the agent is told to do too.

## Move 4: what comes back

`implement-agent` reports what it did, what it left and what needs him. Pass that
on in his own terms: what got done in a line or two, then a `**Needs you**`
heading holding what actually stopped or needs a decision. Its report is written
for you rather than for him, so summarise it rather than relaying it, and follow
`How much to say back` in `PA.md` as for any other reply.

Two things to check before you call it done:

- **Write the two transitions yourself.** `production: doing` when you hand the
  plan over, and `production: review` with `owner: me` when the report lands,
  both through `agents/plan-agent/stream.py --apply` — the plans stream's
  one writer, which is what the board itself posts to. This was the agent's job
  to do until 13 Sep 2026 and it never could: `implement-agent` holds no Bash
  tool, so it cannot run a subprocess, and every finished run sat in `review`
  looking exactly like a session that had died mid-work. The board asks and the
  stream writes, everywhere else in this repo; this is the same rule.
- **Queue the tick on the Implement sub-task**, when the task has one: a
  sub-task assigned `[to:: Implement agent]` with its id written on the line.
  `python3 ~/Code/to-dos/core/tick_queue.py tick <sub-id> --by "Implement agent"
  --note "report written"`. It is the agent's own tick, made through the board's
  queue because nobody but the board writes the list, and the board applies it
  the next time it loads, moving the card to Reviewing and unblocking his review
  of the work. The board refuses it if the sub-task is not the Implement agent's
  or is still waiting on his review of the plan, so run it only once the report
  is in. A task with no such sub-task has nothing to tick.
- **Append the report to the plan**, under a `## What the implementing agent did`
  heading, and put its one-line summary in `production_summary:`. The report is
  the only record of what was actually produced, and before the fold it lived in
  a document of its own.
- **Anything it wrote is under `data/<dataset>/projects/`.** That folder is
  private and gitignored. Nothing from it goes into a commit, a report or a
  message.

Accepting what it did is his move, on the Plans view, and it is not yours to
make.

If it asked for a change to `todo.md`, **it goes through `pa`, not the agent.**
`implement-agent` never writes that file. It hands the change up as a request,
with the exact lines before and after. Show him those lines, get a yes, then
invoke `pa` with what he agreed and let it write, check and close with the
Reload line. Reload rather than save, in that order: a tab open since before the
write is holding a stale document, and a save from it would undo the change.

## What this skill never does

- **It never accepts a plan, and it never marks one produced.** If he says
  "that one looks fine, do it", that is him accepting it, and it gets recorded
  on the Plans view. Both accepting the plan and accepting what was produced are
  moves he makes on the board.
- **It never runs the planning agent.** That is the board's Run now button, and
  it spends money.
- **It never runs unattended.** No cron, no schedule, no background. Decided
  6 Sep 2026: the acting half of this system only ever runs in a session he is
  sitting in front of.
