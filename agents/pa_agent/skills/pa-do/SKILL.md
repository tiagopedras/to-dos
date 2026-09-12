---
name: pa-do
description: Carry out the work the owner has put in the To do column of the Execution view of his board, at Code/to-dos/data/<dataset>/runs/ (<dataset> named by data/.current, currently "twinkl"), one at a time, by handing each to the implementing-agent agent. Use whenever he says to do, run, carry out, action or get on with an agreed plan, asks what is waiting to be run, says "let's do the ones I agreed", "run that plan", "action the agreed ones", "what did I say yes to", or names one task and asks to get it done. Also use after a pa-review-plans session where he accepted something, since accepting a plan is what starts it towards this. Do not use it to read or triage plans, which is pa-review-plans, and do not use it to run the planning agent, which is the board's own Run now button.
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

Since 12 September 2026 there are two agent boards, and they carry the same four
columns as his own: Backlog, To do, Waiting for review, Done. Plans is the
planning agent's; **Execution is this one**.

A card here is a **run** — one document per plan he accepted, in
`data/<dataset>/runs/`, carrying the plan it came from in its `plan:` field. Not
the plan itself: a plan he has accepted is finished as a plan and not started as
a run, and one document cannot be in two columns at once. The shape is shared by
every queue in `~/Code` and written up in `PACKAGES/work_streams/CONTRACT.md`;
this stream's own words are in `agents/implementing_agent/stream.json`.

Accepting a plan mints a run into **Backlog**, where nothing happens to it. What
starts the work is him moving it to **To do**, which is `state: ready` with
`owner: implementing-agent`. Not by you, and never on the grounds that a plan looks
right.

While a plan sits accepted, `is_stale()` in `agents/planning_agent/pick.py` leaves
that task alone, so the plan he approved is the one that gets carried out rather
than being replaced overnight by a second opinion.

## Move 1: what is waiting

Read `data/.current` for the dataset, then look through
`data/<dataset>/runs/*.md` for frontmatter with `state: ready` and
`owner: implementing-agent`. Ignore `index.md`. A run carrying a `feedback:` line
is one he sent back — that line says what was wrong last time, and it is the
first thing the agent needs.

Report the count and list them: the task title, its bucket, and its `summary:`
line. If there are none, say so and stop — and say whether anything is sitting in
Backlog, since that is him not having moved it across rather than there being
nothing to do. Do not go looking for plans he might like to accept; that is a
`pa-review-plans` session and it is his call, not yours.

## Move 2: one at a time, and he picks

Never start work on more than one plan at once. Ask which one, or take them in
the order he gives.

Before handing one over, say in two or three lines what it proposes and what
carrying it out will produce. He agreed to this plan when he read it, possibly
days ago, and the thing about to happen should not be a surprise.

## Move 3: hand it to `implementing-agent`

One `implementing-agent` run per plan. Give it:

- The full path to the plan file, which is `data/<dataset>/plans/` plus the run's
  own `plan:` field.
- The full path to the run document, which is where it writes back.
- Its `feedback:` line, if it has one — that is him having sent this back.
- The task's title, bucket and column, and its `Project:` note if it has one.
- The path to the bucket's brief, `data/<dataset>/buckets/<stream>/<stream>.md`, worked out the
  way `bucket_stream()` in `agents/planning_agent/plan.py` does it.

Then stay out of its way. Do not do the work yourself alongside it, and do not
re-plan the task because you can see a better approach. If the plan is wrong, the
answer is to stop and tell him, which is what the agent is told to do too.

## Move 4: what comes back

`implementing-agent` reports what it did, what it left and what needs him. Pass that
on in his own terms: what got done in a line or two, then a `**Needs you**`
heading holding what actually stopped or needs a decision. Its report is written
for you rather than for him, so summarise it rather than relaying it, and follow
`How much to say back` in `PA.md` as for any other reply.

Two things to check before you call it done:

- **The run is now `state: review` with `owner: me`.** The agent asks the stream
  to set it, through `agents/implementing_agent/stream.py --apply`, which is the
  only thing that writes these documents. If it did not, say so rather than
  setting it yourself: a run still owned by `implementing-agent` means the work did
  not finish, and that is a fact worth him seeing rather than tidying away.
  Accepting it is his move, on the Execution view, and it is not yours to make.
  The plan it came from is left exactly as it is — it was finished the moment he
  accepted it, and nothing writes it again.
- **Anything it wrote is under `data/<dataset>/projects/`.** That folder is
  private and gitignored. Nothing from it goes into a commit, a report or a
  message.

If it asked for a change to `todo.md`, **it goes through `pa`, not the agent.**
`implementing-agent` never writes that file. It hands the change up as a request,
with the exact lines before and after. Show him those lines, get a yes, then
invoke `pa` with what he agreed and let it write, check and close with the
Reload line. Reload rather than save, in that order: a tab open since before the
write is holding a stale document, and a save from it would undo the change.

## What this skill never does

- **It never accepts a plan, and it never accepts a run.** If he says "that one
  looks fine, do it", that is him accepting it, and it gets recorded on the
  Plans view first — then moved across on the Execution view. Both are moves he
  makes on the board.
- **It never runs the planning agent.** That is the board's Run now button, and
  it spends money.
- **It never runs unattended.** No cron, no schedule, no background. Decided
  6 Sep 2026: the acting half of this system only ever runs in a session he is
  sitting in front of.
