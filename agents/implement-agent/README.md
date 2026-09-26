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
| `agent.json`, `run.py`, `hooks.py` | Its unattended runner, on the shared runner in `PACKAGES/agents-engine` (RUNNER.md), the same contract as `../plan-agent`. Off until hours are set. |
| `guard.py` | What an unattended run of types 1 to 5 may leave behind in the project folder, and putting back what it may not. |
| `run.sh` | The runner by hand: `--dry-run`, `--dataset <list>`, `--task "<title>"`. |
| `test_implement_agent.py` | The queue, the tools, the folder guard and the code route, with no Claude run. |

## The three things that are load-bearing

**There is one of it.** Not one per bucket. The six planners, in
`../plan-agent/`, are safe to duplicate because they are read-only and their
differences are real; an implementing agent holds the dangerous half, and six copies
of one set of guard rails is six chances for one to be edited without the
others. The per-bucket knowledge sits
in `data/<dataset>/buckets/<stream>/<stream>.md`, which both halves read, so it is written once
and cannot drift between the agent that researched the work and the agent that
does it.

**It runs alone only on the kinds of work he has agreed it may.** For most of
its life it only ran from a session he was in, through the `do` skill, because
being able to stop and ask was the whole reason it was allowed to act. On 21 and
23 Sep 2026 he agreed a list of plan types it may carry out with nobody there,
and on 26 Sep 2026 it was given a runner for those. The list is
`core/plan_types.py`, and the Plan agent writes one of them as `type:` in every
plan it writes.

Two of them, a write-up and a draft, are approved on arrival: when the Plan
agent's tick reaches the board, `drainTickQueue()` ticks Review the plan as well,
with the note "pre-approved type". They only ever add new files to one folder and
send nothing, so there is nothing for an accept step to catch. A prompt or skill,
working data and a deck run once he has ticked the review, and are held to the
same folder with one more rule: a new version is saved beside the original as
`name-v2.md`, never over it. The tool list grants Write and Edit on the project
folder alone, and `guard.py` checks afterwards anyway, the way the Plan agent
hashes `todo.md` rather than trusting its own tool list. Code runs on the guards
`AGENTS/improve-agent` already has, using its git module and its registry of repos
and suites: a clean tree or no run, an `implement/<date>` branch, the repo's
suites, a commit, never a merge or a push, and still no Bash.

Figma work was agreed with a condition the runner cannot check: the desktop app
open on the right file with the Figma Console bridge paired. That bridge is a
server the MCP starts inside each Claude session, so there is nothing to ask
before a run starts, and a Figma plan is refused with that reason and waits for
`do`. So does a task handed straight to the Implement agent, since it has no plan
and no type, and anything of type `other`.

When a run finishes, the runner adds the agent's reply to the plan under "What
the implementing agent did" and queues the tick on the Implement sub-task, which
is what `do` has the driving session do. A run that breaks a rule, or says it
could not do the plan, is set aside for him with its reason in the day's log and
nothing ticked.

It is off until he sets hours for a list on the agents dashboard. The hourly wake
already calls `run.py --wake` through `agent.json`, and the runner treats a list
it has no settings for as off.

**It does not write `todo.md`.** That file belongs to the `pa` skill. This agent
carries out a plan; where the work means the task itself should change, it asks
for the change in its report, precisely enough to be applied, and `pa` makes it.
One writer is the only rule the board's autosave survives, and the implementing agent
is the wrong one to be it because it is the one running unattended stretches. Its
runner asks for its tick through `core/tick_queue.py` like every other agent.

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
