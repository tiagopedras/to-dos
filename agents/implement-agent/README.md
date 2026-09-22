# to-dos/agents/implement-agent

The acting half. `agents/plan-agent/` researches a task overnight and proposes;
this is what happens after Tiago reads one of those plans and says yes.

Given its own folder on 7 Sep 2026. It was a loose `implement-agent.md` at the
root of `agents/` until then, sitting among the six planners, which read as
though it were one of them. It is not: the planners are read-only and run
unattended, and this one holds write tools and only ever runs with him in the
room. A folder of its own makes that difference visible before anyone opens the
file.

## What is in here

| File | What it is |
| --- | --- |
| `implement-agent.md` | The agent definition Claude Code reads. Symlinked into `.claude/agents/implement-agent.md`, one file rather than a folder link, so this folder is free to be organised however it needs to be. |

## The three things that are load-bearing

**There is one of it.** Not one per bucket. The six planners, in
`../plan-agent/`, are safe to duplicate because they are read-only and their
differences are real; an implementing agent holds the dangerous half, and six copies
of one set of guard rails is six chances for one to be edited without the
others. The per-bucket knowledge sits
in `data/<dataset>/buckets/<stream>/<stream>.md`, which both halves read, so it is written once
and cannot drift between the agent that researched the work and the agent that
does it.

**It only ever runs from a session he is in**, through the `do` skill. Never
on a schedule, never in the background. The whole reason it is allowed to act is
that it can stop and ask, which is exactly what the planners cannot do and why
they fold into a report instead.

The To do column is a list `do` works through when he starts it, not a queue
anything picks up on a clock. That was the open question when the board was
built on 12 Sep 2026, and it was deliberately left open: the columns are laid
out, and giving this half a runner later is a schedule file and a `run.sh` with
nothing on the board to change. Whether it should have one is a separate
decision from whether it should have a board.

**It does not write `todo.md`.** That file belongs to the `pa` skill. This agent
carries out a plan; where the work means the task itself should change, it asks
for the change in its report, precisely enough to be applied, and `pa` makes it.
One writer is the only rule the board's autosave survives, and the implementing agent
is the wrong one to be it because it is the one running unattended stretches.

## How work reaches it

Through the card. Handing a task to an agent lays sub-tasks out on it (Plan, Review the
plan, Implement, Review the work, see `CLAUDE.md`, "One board"), and the work waiting
for this agent is the Implement sub-task: assigned to it, open, with what it waits on
ticked, which for a task that went through the Plan agent means he has approved the
plan. A task handed straight to the Implement agent has only the last two, and the
task itself is the brief. There is no plan `state:` or `production:` any more, and the
board that showed them, first as Execution and then as part of Plans, is gone.

`do` is what picks one up, and it hands the agent the plan path (the `Plan:` note
under the review above it), the task's bucket and column, and the bucket's brief. The
agent writes what it did into the task's project folder; the driving session then
queues the tick on the Implement sub-task through `core/tick_queue.py`, since this
agent holds no Bash tool and never could run a writer, and the board applies it the
next time it opens, moving the card to Reviewing. Approving what was produced is his
tick on Review the work, and sending it back unticks Implement with a note.

## Where the rest of it is written down

- [../plan-agent/README.md](../plan-agent/README.md) — the planning half, the
  window rule, and the status table.
- [../plan-agent/PLAN-BRIEF.md](../plan-agent/PLAN-BRIEF.md) — the shape of the
  plan this agent is handed.
- [skills/do/SKILL.md](skills/do/SKILL.md) — the
  skill that invokes it, and what it does with what comes back.
- [../../BUCKETS.md](../../BUCKETS.md) — what the briefs are for. The briefs
  themselves are gitignored, since they name real people and real processes.
