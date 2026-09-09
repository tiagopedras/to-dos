# to-dos/agents/execution_agent

The acting half. `agents/night_agent/` researches a task overnight and proposes;
this is what happens after Tiago reads one of those plans and says yes.

Given its own folder on 7 Sep 2026. It was a loose `execution-agent.md` at the
root of `agents/` until then, sitting among the six planners, which read as
though it were one of them. It is not: the planners are read-only and run
unattended, and this one holds write tools and only ever runs with him in the
room. A folder of its own makes that difference visible before anyone opens the
file.

## What is in here

| File | What it is |
| --- | --- |
| `execution-agent.md` | The agent definition Claude Code reads. Symlinked into `.claude/agents/execution-agent.md`, one file rather than a folder link, so this folder is free to be organised however it needs to be. |

## The three things that are load-bearing

**There is one of it.** Not one per bucket. The six planners, in
`../night_agent/`, are safe to duplicate because they are read-only and their
differences are real; an acting agent holds the dangerous half, and six copies
of one set of guard rails is six chances for one to be edited without the
others. The per-bucket knowledge sits
in `data/<dataset>/buckets/<stream>/<stream>.md`, which both halves read, so it is written once
and cannot drift between the agent that researched the work and the agent that
does it.

**It only ever runs from a session he is in**, through the `pa-do` skill. Never
on a schedule, never in the background. The whole reason it is allowed to act is
that it can stop and ask, which is exactly what the planners cannot do and why
they fold into a report instead.

**It does not write `todo.md`.** That file belongs to the `pa` skill. This agent
carries out a plan; where the work means the task itself should change, it asks
for the change in its report, precisely enough to be applied, and `pa` makes it.
One writer is the only rule the board's autosave survives, and the acting agent
is the wrong one to be it because it is the one running unattended stretches.

## How a plan reaches it

A plan carries `status: agreed`, set by him on the Plans view and nowhere else.
`pa-do` looks for those, hands one over with the plan path, the task's bucket and
column, and the bucket's brief, and the agent sets the plan to `actioned` when it
is done.

The five statuses are documented in `kanban/js/13-plans.js` and known in two
other places, `PLAN_STATUS` in `kanban/server.py` and `is_stale()` in
`agents/night_agent/pick.py`. Change one and change all three.

## Where the rest of it is written down

- [../night_agent/README.md](../night_agent/README.md) — the planning half, the
  window rule, and the status table.
- [../night_agent/PLAN-BRIEF.md](../night_agent/PLAN-BRIEF.md) — the shape of the
  plan this agent is handed.
- [../pa_agent/skills/pa-do/SKILL.md](../pa_agent/skills/pa-do/SKILL.md) — the
  skill that invokes it, and what it does with what comes back.
- [../../BUCKETS.md](../../BUCKETS.md) — what the briefs are for. The briefs
  themselves are gitignored, since they name real people and real processes.
