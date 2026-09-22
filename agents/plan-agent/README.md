# The planning agent

Overnight, this reads the to-do list, picks every task Claude could help with,
and sets one sub-agent per task to work out what doing it would actually involve.
It writes a plan for each and stops. **Nothing it produces has been done.** In the
morning the plans are waiting behind a Review the plan sub-task on each task's card
(there is no Plans tab since 22 Sep 2026), with a notification from the companion
saying they are there, and each one runs only if Tiago approves it.

The problem it solves is not that the work is hard. Open tasks Claude
could do most of are many, and almost none get handed over. What stops it is the half hour of reading
and working out that has to happen before the handover, and that half hour never
has a good moment. This does it at two in the morning instead.

```
agents/plan-agent/run.sh --dry-run          what it would do tonight, no spend, any hour
python3 agents/plan-agent/pick.py           the queue, in the order it would be worked
agents/plan-agent/run.sh --task "Some task" one task by hand, now
python3 core/windows.py --history the last 30 days of usage windows
python3 agents/plan-agent/test_planning_agent.py   the schedule, the picker and the runner
```

## Since 21 Sep 2026: the shared runner

The night is run by the shared runner in `PACKAGES/agents-engine` (`RUNNER.md`
there), the same one the UX agent and `improve_agent` use. The shared hourly
wake calls `run.py --wake`, and `hooks.py` is this agent's side of it. The
runner owns the wake, the lock, the budget and item cap, the stops and the
dashboard's commands. The hooks call the same functions as before for
everything else, so every file the board reads is written exactly as it was:
the lines in `plan-agent.log`, the plans, `ledger.json`, the day's
`index.md` and `run.json`, `window.json` and the companion's notification. The
lock is still `data/.plan-agent-<list>.lock`.

`run.sh` stays as a small file that hands its flags to `run.py`, so the board's
Run now and the commands above still work. The runner also writes its own daily
log per list, in `data/runner/plan-agent/<list>/runs/<date>.md`: what was
planned, what was not and why, and what failed.

`plan.py`'s own `run()` loop and the four commands in `dashboard.py` are no
longer called by anything but the tests. `dashboard.py`'s card is still used,
through the `card` hook.

The sections below describe the rules as they were written. Where they name
`run.sh` doing the checking, it is the runner doing it now, with the same rule.

## When it runs, and why the hours are the whole answer

The schedule is the gate. The runner is woken hourly, asks `schedule.py` whether
this is one of tonight's hours, takes the lock, and runs. Nothing else votes.

It was not always this way, and the history is worth keeping because the removed
rule was a good idea that did not survive contact with the thing it measured.

Usage runs in rolling 5-hour windows, anchored to the first request after the
last one expired rather than sitting on a fixed grid. Measured over the thirty
nights before this agent was written: 29 of 30 already had a window running
between 19:00 and 07:00, opened by Tiago's own evening work; on 13 of 30 there
was no room to open a fresh one before 02:00, because that evening window was
still live; and the typical window carried 71M tokens against a p90 of 197M, so
the one he opened in the evening was usually half empty when it expired. So the
agent was built to ride his window rather than open its own, under one test —
*the window being spent in must expire by 07:00* — which kept the morning's
capacity his.

**That rule was removed on 9 September 2026.** The measurements above are still
true and the rule still failed, for a reason none of them shows: a window is
anchored to whenever the day's first request happened to land, so it moves every
night. A schedule cannot be set against something that lands somewhere different
each time. The same hours rode on Monday and stopped on Tuesday, and from
outside nothing distinguished "it declined to spend" from "it is broken" — which
is how a schedule of 06:00 and 07:00 sat on a repo for a day doing nothing at
all, because at those hours the answer is always stop.

Keeping the morning clear is done the plain way now: pick hours nowhere near it.
The floor below is what makes that a guarantee rather than an intention.

`core/windows.py` still reconstructs the windows, because two things still want
to read them — `plan.py` asks how much of the current window is left before it
starts another task, and the board's Schedule view charts what every window in
the last month spent. Neither stops anything from running.

Almost every wake costs a few milliseconds. `run.sh` checks the schedule, then
the lock, and stops at whichever says no.

The lock records the PID of the run that took it, in `pid` inside the lock
directory, and a wake that finds the lock held asks `kill -0` on that PID before
it asks anything about the age of the directory. Age on its own cannot tell a
crash from a sleeping laptop: closing the lid mid-batch suspends the holder
instead of killing it, `plan.py`'s ten-minute per-task ceiling cannot fire while
the process is not being scheduled, and the batch carries on where it stopped
when the machine wakes. That is how the lock came to be held from 06:05 on 6
September 2026 to the morning of the 8th, with every hourly wake in between
logging "a run is already going". So a dead PID clears the lock whatever its
mtime says, a live one is left alone however old it looks, and the two-hour
mtime window is now only the fallback for a lock that names no holder.

### Which hours, and who decides

`schedule.py` and `data/plan-agent-schedule.json`, edited from the agents
dashboard at `~/Code/agents-dashboard`. The shared wake runs every hour and holds
no policy at all, because a wake that only fired between certain hours would
silently override whatever the dashboard said.

Before 9 September 2026 the hours were written twice — twelve entries in the
plist and a `19:00–06:59` clock check in `run.sh` — and changing them meant
editing both and reloading launchd, which is a good description of why they were
never changed. The schedule file was seeded with exactly those twelve hours, so
nothing about the first night after the move was different.

**The night is a preference, not a floor.** `schedule.PREFERRED` in
`schedule.py` is the same 19:00–06:59 range. It seeds a list the file has never
heard of, and the dashboard hatches the hours outside it so a working-day hour
reads as the worse choice. It refuses nothing.

It was a floor until 19 September 2026: not editable, enforced in the setter,
at load and again at the wake, and drawn dead on the dashboard. That was put
there when the schedule moved into a file a web page can write, on the grounds
that the guard had to go somewhere. It came out because the hours are set by
hand — nothing here works them out — and a rule that overrode him was the tool
telling him what he was allowed to want. What is left is the budget, the
per-list cap and the lock.

### Where the boundaries come from

Two sources. The estimate is the timestamps in `~/.claude/projects/**/*.jsonl`,
greedily bucketed — cheap, needs no network, and blind to claude.ai, Chrome and
mobile. The exact one is a run that actually hits the limit, whose error names
the reset time; that is written to `window.json` and beats the estimate until it
expires.

Neither is load-bearing any more — nothing is refused on the strength of either
— so being wrong costs a slightly wrong number on a chart and, at worst, one
task started with less window left than `plan.py` thought.

`apiBlockIndex` in the transcripts looks like it should be this and is not: it
counts blocks within one session and restarts per transcript.

## What gets planned

Every task that has been **handed to the Plan agent** and still has its Plan
sub-task open, minus three exclusions — the same three `companion/digest.py`
applies, because two readers of one list disagreeing about what is actionable is
worse than either answer:

- **Reviewing.** The next move belongs to somebody else.
- **An unticked `blocked-by:`.** The blocker is the real task.
- **A `start:` that has not arrived.** It cannot begin yet.

Handing a task over is his act, in the board's drawer, and it lays four sub-tasks
out on the card: Plan (this agent), Review the plan (him), Implement, Review the work
(see `CLAUDE.md`, "One board"). The picker plans a task through its Plan sub-task
when that is open, assigned to the Plan agent, and what it waits on is ticked; a
ticked Plan means the plan is written, and an unticked one after a review means it
was sent back. The mark of a handover is the slug it makes, the task's id and
`-plan`. `[to:: Plan agent]` on a task nobody handed over is **not planned** since
22 Sep 2026: its plan would have nowhere to be read, and `[ai:: full]`, which used to
be the tag, is gone from the format.

`due:` is deliberately not consulted. A deadline says when something must be
finished, not whether it is worth thinking about tonight.

## What happens to a plan afterwards

Nothing is recorded on the plan. A plan is a document that holds content; where it
stands is the state of the sub-tasks on its task, and there is no `state:`,
`owner:` or `seen:` in it any more. When the plan is written the agent asks for its
Plan sub-task to be ticked, through `core/tick_queue.py`, and the board applies the
tick the next time it opens, putting a `Plan:` note on the Review the plan sub-task
so that opening it can read the file. He approves it (the review is ticked, which
unblocks Implement) or sends it back (the Plan is unticked with a `feedback:` note
under it, which the next night reads as the reason).

The ledger is what stops tomorrow night planning the same task again before the
board has been opened and the tick applied: each row holds the fingerprint of the
task as it was planned, and a plan is owed again only when that changes. Ticking the
Plan, a review's feedback note and a sub-task added by handing the task over again
all change it.

The acting half is `implement-agent`, in `agents/implement-agent/`. There is one
of it rather than one per bucket, because the per-bucket knowledge lives in the
briefs both halves read. It runs from a live session through the `do` skill,
never on a schedule, and it never writes `todo.md`: a change to the list is asked
for in its report and made by the `pa` skill. See `agents/implement-agent/README.md`
and `../CLAUDE.md`.

## The bucket briefs

`data/<dataset>/buckets/<stream>/<stream>.md`, one per bucket plus a fallback,
holding the processes he actually runs there, what each produces and which of his
skills already does it. `bucket_stream()` in `plan.py` maps a bucket heading to
the stream, and both the agent name and the brief are derived from it, so there
is one table rather than two.

The dataset in that path comes from `paths.buckets_dir()`, which follows
`data/.current` like everything else here. Stream names are shared across every
list, since they name the planning agents, but the briefs behind them are not —
`general` is the fallback nothing should reach on `twinkl` and the only bucket
there is on `personal`.

Both halves read them. That is the reason they are files: the planner and the
implementing agent need the same knowledge, and written twice the two would drift, so
work researched against one understanding would be carried out against another.

A brief still carrying its `<!-- NOT FILLED IN YET -->` marker is treated as
absent by `bucket_brief()` and named to nobody. See `BUCKETS.md`.

That is 25 of the 42 as this is written. Planning all of them is only affordable
because of the **ledger**: `plans/ledger.json` records a hash of each task's own
text and the night it was planned, and a task whose text has not changed, and
whose plan has not been actioned, is skipped. The first night writes 25 plans and
every night after writes only what moved. Without it the morning is 25 identical
files and the whole thing is ignored inside a week.

The hash covers the task's notes, not just its title, because a new sub-step or a
rewritten note makes last night's plan stale without touching the title.

## The order

The queue is `pick.select()`, run against `todo.md` as it stands. Nothing is queued
in advance and nothing is stored, so it cannot describe a different night from the
one that happens: tick a task off at 23:00 and it is gone before the run starts.

Order matters because the batch stops on a budget, a window floor or a usage limit —
the front of the queue is the part that reliably gets planned, and the back is the
part that might not. `in_order()` sorts on three keys, the headline first, then the
date (a date beats a score), then impact against effort. Bucket is deliberately not
a key: the first full batch, on 5 Sep 2026, spent its whole budget on Design System
because the fallback was file order. There was a fourth key ahead of these, the order
he dragged cards into on the Plans view, stored in `plans/queue-order.json` with a
list of tasks to hold back; both went with that view on 22 Sep 2026. Not planning a
task now is not handing it over, or taking the agent off it.

## What the usage chart is drawn against

The board's fourth column plots each five-hour session and the rolling seven-day
total as a share of a ceiling, and nothing here is told what that ceiling is.
`core/windows.py` reconstructs what each window spent; the error a real limit
returns names the reset time and not the allowance.

So `plan.py` records what the open window had spent at the moment a run was
actually refused, as `limit_tok` in `window.json`. That is a floor under the real
session allowance rather than the allowance itself — the refused request is not
counted, and the limit may have been crossed part way through the previous one —
so it is only ever revised upward. Until one is captured, 100% is the heaviest
session in the period, and the card says which of the two it is using.

The week has no measured source and will not get one. Nothing in here has any
notion of a weekly allowance, so it is always against the busiest seven days
seen.

## Watching a run

The same view's second column reads `data/.plan-agent.lock` and `plans/plan-agent.log`
together, which is the only honest way — the agents are subprocesses of a shell
`launchd` started and nothing can ask them anything. The lock says whether a
batch is going; the log says what it has got through. A log with a task in
flight and no lock is a run that died between the two, and the column says that
rather than showing it as live.

One card, not a list, because `plan.py` runs its agents strictly one at a time.

The same card carries **Run the agent now**, which is `run.sh --force` started
detached from the board. Force means what it says: it skips the schedule, so it
will spend in whatever window is open, including the one being worked in. It does not skip the lock, and it does not skip the ledger — a
task planned last night whose text has not moved is still skipped, so pressing
it twice is cheap rather than a second full batch. The button is not offered
while a run is going, because `run.sh` refuses a second one by logging a line
and exiting cleanly, which from a button is indistinguishable from starting.

## The sub-agents

One per bucket, `<dataset>-<stream>-agent.md` in this folder, symlinked into
`.claude/agents/` **in this repo** rather than `~/.claude/`, so they version
alongside the runner that invokes them. They moved in here on 7 Sep 2026 from the
root of `agents/`, dropping the `pa-` prefix they had carried: they belong to the
planning agent rather than to the PA, and `bucket_agent()` in `plan.py` derives the
name from the stream, so a rename means editing that one line. They share
`PLAN-BRIEF.md`, which holds the output format and the rules; each definition
adds what its bucket needs.

| Bucket | Agent |
| --- | --- |
| People | `twinkl-people-agent` — dates beat scores, sensitive things stay drafts, five skills already exist |
| DS | `twinkl-ds-agent` — the snapshot/inventory/audit split, `DS-KNOWN-ISSUES.md`, the `ds-*` skills |
| BAU | `twinkl-bau-agent` — who holds it, and what would move it |
| Strategic | `twinkl-strategic-agent` — usually a decision wearing a task's clothes |
| Processes | `twinkl-processes-agent` — this repo, `IMPROVEMENTS.md`, the one-writer rule |
| anything else | `twinkl-general-agent` — the fallback, which says so in its output |

Buckets are renameable on the board, so the mapping in `plan.py` is by name with
a fallback rather than a hard five. A task landing on the fallback is logged,
because it means either a rename or a genuinely new kind of work.

**The tools each one gets are set on the command line, not only in the
definition.** `plan.py` passes `--allowedTools` when it invokes the agent, and
that flag is what actually holds — the list in a definition's frontmatter is a
request, and this runs unattended with read access to `~/Code`. `Bash` is not
among them, deliberately. Adding a tool to a definition and expecting it to
arrive is the mistake this paragraph exists to stop.

## Folding: when an agent asks instead of guessing

Some tasks are a line he wrote to himself in ten seconds, and the detail that
would make them plannable is in his head and nowhere else. Planning one of those
means inventing the missing half, and an invented plan is worse than none: he
reads it in the morning, it looks complete, and the wrong assumption is now
written down.

So an agent that cannot write the proposed course of action without deciding
something only he can decide **folds**: it writes `outcome: folded` in its
frontmatter, a summary naming what is missing, and two sections instead of four
— what it could establish, and the questions it needs answered. The full rule,
including when not to fold, is in `PLAN-BRIEF.md`, and the bar is deliberately
high. Folding on a task that could have been planned costs a night's capacity
and returns questions nobody needed to answer.

A fold is not a task dropped. `plan.py` counts them separately, `index.md` puts
them under **Waiting on you** above the plans, the banner names them, and the
Plans view marks the card amber. Answering the questions is a note on the task,
which changes the task's text, which is what makes the picker plan it afresh the
next night. The question asked is the whole loop.

## Not writing todo.md

The board holds the whole document in memory and autosaves it, so anything else
writing the file loses within seconds, silently. Two real overwrites have already
happened. This runs unattended at two in the morning, which is the worst possible
case for it, so there are three layers:

1. The agents have read-only tools.
2. Every agent definition names the rule explicitly.
3. `plan.py` hashes `todo.md` before the batch and checks it **after every single
   task**. A mismatch stops the run dead and writes a loud line naming the agent
   that was running.

The one thing that does get filed against a task is the planning conversation
itself, and even that goes through `attach-queue.json` for the board to drain on
its next load — the same route `pa-attach` uses, for the same reason.

## Ceilings

The schedule says when; these are the brakes on what it does once it starts. `--max-budget-usd` per task, a
nightly total in `plan.py`, a ten-minute timeout per agent, and a floor: below 20
minutes of window remaining, do not start another task, because a plan cut off
half way is worse than one not written. Weekly limits are why these exist at all —
a window's capacity dies overnight, a week's does not.

## What lands where

```
data/plan-agent-schedule.json   on/off, the hours, the nightly budget
data/<dataset>/plans/
  2026-09-05/            one folder a night
    index.md             what was planned, what was skipped and why
    run.json             the same night as JSON, for the agents dashboard
    <task-slug>.md       one plan, frontmatter plus four short sections
  actioned/              plans he acted on, kept when the night is pruned
  ledger.json            what has been planned, and whether it was actioned
  window.json            the usage-window clock
  plan-agent.log            every wake, every run, what it cost
```

The schedule sits beside the datasets rather than inside one, because when the
agent runs is true of the agent: switching the board from `twinkl` to `personal`
for ten minutes should not change tonight's hours. `index.md` is the one to open
in the morning; `run.json` says the same thing to the dashboard, which asks every
agent on the machine what last night did and cannot be expected to parse each
one's prose to find out.

Both files hold the day rather than the last run in it. Most nights there is
only one run, because the ledger leaves the next scheduled hour nothing to plan,
so this was invisible until it wasn't: two runs in one day and the second one's
index listed only its own plans while the first one's sat in the same folder
unlinked. `carry_over` in `plan.py` folds the earlier run in — its plans, its
cost, its start time — and drops from the not-planned list anything that has
since been planned. `test_planning_agent.py` covers it.

`dashboard.py --activity` is the third reader of the same folder, and the one
written for a report rather than a page: hand it a moment on stdin and it
answers with every plan written since, what the night cost, what it passed over
and how many hours it woke without work. The `agents-report` skill asks every
agent on the machine that question at once.

Nights older than 30 days are deleted, matching the backups, except anything
marked `actioned` — that is the record of a decision rather than a proposal that
expired.

Plans quote the list, so they hold real names and dates. They live under `data/`,
which is the whole of what git ignores, and nothing in them goes in a commit, a
report or a message.

## Reading them

**The companion** does not list them — it shows messages, which are a ten-second
job, and a plan is several minutes of reading. What it does is say they exist:
`plan.py` puts one line on `data/<dataset>/notify-queue.json` at the end of a
run, and the companion posts it as a desktop notification in the morning. One
notification for the whole night, never one per plan. Pressing it opens the
board's Plans tab, which is where the night's output actually is — the line is
queued with `view="plans"` and no task, since a banner counting a batch should
not open one of them.

**The board** has a Plans tab beside Reports, and a Schedule button beside
Backups showing whether this agent is armed and what the usage windows have been
doing. Opening a plan marks it read;
*Mark actioned* marks it actioned, which is the one the runner reads — an
actioned plan no longer describes outstanding work, so the next night plans that
task afresh instead of skipping it for looking unchanged.

## Installing the schedule

There is nothing of this agent's own to install. The hourly wake is shared by
every agent, and `RUNNER.md` in `PACKAGES/agents-engine` says how it is
installed. Its own plist was retired on 21 Sep 2026. Nothing runs until a list
is switched on and its hour comes round.

## Open questions

**Does Design System want splitting into its five streams?** It is much the
biggest bucket: 14 of the 19 plans written on the first real night came from
`twinkl-ds-agent`. The split, if it happens, is along the streams the
bucket already has — ways of working, audits, improvements, documentation,
enablement — which each task's first note line names, and which
`twinkl-ds-agent.md` already describes in one place. It is not a small
edit: `STREAMS` in `plan.py` names both the agent and the brief, so five
streams means five agent definitions and five brief files. The cheaper
experiment is to fill in `data/twinkl/buckets/ds/ds.md` first and see
whether it
reads as one remit or five.

**The Schedule view cannot show a run in progress.** Deferred deliberately. The
entry in `IMPROVEMENTS.md` has what is on disk for it and what still needs
deciding; the short version is that the lock and the log carry enough and the
front end needs a call on polling.

**The `~/Code` sandbox is wide.** `plan.py` passes `--add-dir ~/Code` so the
agents can read the map and the folders it names. Narrowing it per agent is
possible and was not done, because `~/Code/CLAUDE.md` describes a dozen folders
and an agent that can read the map but not the territory is worse off than one
with neither. Worth revisiting if it ever reads something it should not.
