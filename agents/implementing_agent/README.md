# to-dos/agents/implementing_agent

The acting half. `agents/planning_agent/` researches a task overnight and proposes;
this is what happens after Tiago reads one of those plans and says yes.

Given its own folder on 7 Sep 2026. It was a loose `implementing-agent.md` at the
root of `agents/` until then, sitting among the six planners, which read as
though it were one of them. It is not: the planners are read-only and run
unattended, and this one holds write tools and only ever runs with him in the
room. A folder of its own makes that difference visible before anyone opens the
file.

## What is in here

| File | What it is |
| --- | --- |
| `implementing-agent.md` | The agent definition Claude Code reads. Symlinked into `.claude/agents/implementing-agent.md`, one file rather than a folder link, so this folder is free to be organised however it needs to be. |

## The three things that are load-bearing

**There is one of it.** Not one per bucket. The six planners, in
`../planning_agent/`, are safe to duplicate because they are read-only and their
differences are real; an implementing agent holds the dangerous half, and six copies
of one set of guard rails is six chances for one to be edited without the
others. The per-bucket knowledge sits
in `data/<dataset>/buckets/<stream>/<stream>.md`, which both halves read, so it is written once
and cannot drift between the agent that researched the work and the agent that
does it.

**It only ever runs from a session he is in**, through the `pa-do` skill. Never
on a schedule, never in the background. The whole reason it is allowed to act is
that it can stop and ask, which is exactly what the planners cannot do and why
they fold into a report instead.

The To do column is a list `pa-do` works through when he starts it, not a queue
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

Through the Plans view. It had a board of its own, Execution, from 12 Sep 2026
until the two were folded into one on 13 Sep, and since then
the plan carries both halves: `state: accepted` says he agreed to it, and
`production:` says how far this half has got.

Accepting a plan on the Plans view leaves it at `production: none`, where nothing
happens to it. `pa-do` is what picks one up, and it hands the agent the plan
path, the task's bucket and column, and the bucket's brief. The agent writes what
it did into the plan itself; the driving session writes the two transitions
around that, since this agent holds no Bash tool and never could run a writer.
Accepting what was produced is his press on the board, not the agent's.

**There is no stream here any more.** Until 13 September 2026 this folder owned
one: accepting a plan minted a run document into `data/<dataset>/runs/`, which
landed in a board of its own. That board and this stream were folded into Plans —
see `CLAUDE.md` — and what is left here is the agent definition and this README.
The plan is now both the instruction and the record, and the two transitions the
work passes through are written by the session driving it, through `pa-do`, on
the plans stream. `core/migrations/migrate-fold-runs-into-plans.py` is what moved
the documents.

The vocabulary is not scattered across files that have to be edited together. It
lives in `stream.json` beside this, and the shape it belongs to is
`PACKAGES/work_streams/CONTRACT.md`.

## Where the rest of it is written down

- [../planning_agent/README.md](../planning_agent/README.md) — the planning half, the
  window rule, and the status table.
- [../planning_agent/PLAN-BRIEF.md](../planning_agent/PLAN-BRIEF.md) — the shape of the
  plan this agent is handed.
- [../pa_agent/skills/pa-do/SKILL.md](../pa_agent/skills/pa-do/SKILL.md) — the
  skill that invokes it, and what it does with what comes back.
- [../../BUCKETS.md](../../BUCKETS.md) — what the briefs are for. The briefs
  themselves are gitignored, since they name real people and real processes.
