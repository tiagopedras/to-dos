---
name: pa-do
description: Carry out the plans the owner has agreed on the Plans view of his board, at Code/to-dos/data/<dataset>/plans/ (<dataset> named by data/.current, currently "twinkl"), one at a time, by handing each to the execution-agent agent. Use whenever he says to do, run, carry out, action or get on with an agreed plan, asks what is waiting to be run, says "let's do the ones I agreed", "run that plan", "action the agreed ones", "what did I say yes to", or names one task and asks to get it done. Also use after a pa-review-plans session where he agreed something, since agreeing a plan is what queues it for this. Do not use it to read or triage plans, which is pa-review-plans, and do not use it to run the night agent, which is the board's own Run now button.
---

# Carrying out an agreed plan

**Read `~/Code/to-dos/PA.md` first, then `~/Code/to-dos/CONVENTIONS.md`.** The
first holds who he is, where the list lives, how he prioritises, the standing
rules and the tone. The second holds the file format. Neither is repeated below.

This is the only skill in the set that causes work to happen rather than
recording a decision about it. Everything else here reads the list or writes to
it after a conversation. This one hands a plan to an agent that will produce
something.

## What "agreed" means and why nothing runs without it

A plan carries a `status:` in its frontmatter. `agreed` is the one that matters
here, and it is set by him on the Plans view, through a confirm that says what
it means. Not by you, and never on the grounds that a plan looks right.

The five statuses are `unread`, `read`, `agreed`, `redo`, `actioned`. They are
documented in `kanban/js/13-plans.js`, validated in `kanban/server.py` and read
by `is_stale()` in `agents/night_agent/pick.py`. While a plan sits at `agreed` the nightly
runner leaves that task alone, so the plan he approved is the one that gets
carried out rather than being replaced overnight by a second opinion.

## Move 1: what is waiting

Read `data/.current` for the dataset, then look through
`data/<dataset>/plans/*/*.md` for frontmatter with `status: agreed`. Ignore
`index.md`, and ignore `plans/actioned/`.

Report the count and list them: the task title, its bucket, the night it was
written, and its `summary:` line. If there are none, say so and stop. Do not go
looking for plans he might like to agree; that is a `pa-review-plans` session and it is
his call, not yours.

## Move 2: one at a time, and he picks

Never start work on more than one plan at once. Ask which one, or take them in
the order he gives.

Before handing one over, say in two or three lines what it proposes and what
carrying it out will produce. He agreed to this plan when he read it, possibly
days ago, and the thing about to happen should not be a surprise.

## Move 3: hand it to `execution-agent`

One `execution-agent` run per plan. Give it:

- The full path to the plan file.
- The task's title, bucket and column, and its `Project:` note if it has one.
- The path to the bucket's brief, `buckets/<stream>/<stream>.md`, worked out the
  way `bucket_stream()` in `agents/night_agent/plan.py` does it.

Then stay out of its way. Do not do the work yourself alongside it, and do not
re-plan the task because you can see a better approach. If the plan is wrong, the
answer is to stop and tell him, which is what the agent is told to do too.

## Move 4: what comes back

`execution-agent` reports what it did, what it left and what needs him. Pass that on
in his own terms, short.

Two things to check before you call it done:

- **The plan is now `actioned`.** The agent sets it. If it did not, say so
  rather than setting it yourself, because a plan that is still `agreed` means
  the work did not finish.
- **Anything it wrote is under `data/<dataset>/projects/`.** That folder is
  private and gitignored. Nothing from it goes into a commit, a report or a
  message.

If it asked for a change to `todo.md`, **you make it, not the agent.**
`execution-agent` never writes that file. It hands the change up as a request, with the
exact lines before and after, and this skill is the PA agent applying it. Show him
those lines, get a yes, write only what he agreed, then tell him to press
**Reload** on the board rather than save, in that order: a tab open since before
the write is holding a stale document, and a save from it would undo the change.

## What this skill never does

- **It never agrees a plan.** If he says "that one looks fine, do it", that is
  him agreeing it, and the agreement gets recorded on the Plans view first.
- **It never runs the night agent.** That is the board's Run now button, and
  it spends money.
- **It never runs unattended.** No cron, no schedule, no background. Decided
  6 Sep 2026: the acting half of this system only ever runs in a session he is
  sitting in front of.
