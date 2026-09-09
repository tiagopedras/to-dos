# The night agent

Overnight, this reads the to-do list, picks every task Claude could help with,
and sets one sub-agent per task to work out what doing it would actually involve.
It writes a plan for each and stops. **Nothing it produces has been done.** In the
morning the plans are waiting in the board's Plans tab, with a notification from
the companion saying they are there, and each one runs only if Tiago says so.

The problem it solves is not that the work is hard. Open tasks tagged
`[ai:: full]` are ones Claude could do most of, and almost none get handed
over. What stops it is the half hour of reading
and working out that has to happen before the handover, and that half hour never
has a good moment. This does it at two in the morning instead.

```
agents/night_agent/run.sh --dry-run          what it would do tonight, no spend, any hour
python3 agents/night_agent/pick.py           the queue, in the order it would be worked
agents/night_agent/run.sh --task "Some task" one task by hand, now
python3 core/windows.py --history the last 30 days of usage windows
python3 agents/night_agent/test_night_agent.py   the arithmetic that decides what gets spent
```

## The night is not empty, and that is the whole design

The obvious build is a launchd job at 02:00 that starts a fresh 5-hour usage
window and works through the list. That build was measured against seven weeks of
real usage and it does nothing on nearly half the nights.

Usage runs in rolling 5-hour windows, anchored to the first request after the
last one expired rather than sitting on a fixed grid. Over the thirty nights
before this was written:

- 29 of 30 already had a window running between 19:00 and 07:00, opened by
  Tiago's own evening work.
- On 13 of 30 there was no room at all to open a fresh one before 02:00, because
  that evening window was still live.
- The median gap available to open a fresh window was 0.3 hours.

Meanwhile the typical window carries 71M tokens against a p90 of 197M, so the
evening window he opens is usually half empty when it expires at midnight.

**So the agent rides his window rather than opening its own.** One test decides
everything: *the window being spent in must expire by 07:00.*

| | |
| --- | --- |
| **Ride** | A window is open and dies by 07:00. Spend in it — it costs him nothing, because it is gone before he sits down. The common case. |
| **Open** | Nothing is open and now + 5h is still before 07:00, so 02:00 is the last moment. The quiet-night case. |
| **Stop** | A window is open that outlives 07:00, or it is past 02:00 with nothing open. Do nothing and log why. |

`MORNING` is one constant in `core/windows.py` and the 02:00 cutoff is derived from
it, so moving the boundary is a one-line change rather than an arithmetic hunt.

That is also why launchd wakes this **hourly rather than once**. The only way to
catch a window he opened is to keep looking, and an hourly wake gives the
resume-after-a-limit behaviour for free: when a run hits the limit, it records
the reset time and stops, and the next wake past that reset either opens a fresh
window or defers to tomorrow, by the same one test. No long-lived process,
nothing sleeping, nothing to restart.

Almost every wake costs a few milliseconds. `run.sh` checks the schedule, then
the lock, then the window, and stops at whichever says no.

### Which hours, and who decides

`schedule.py` and `data/night-agent-schedule.json`, edited from the agents
dashboard at `~/Code/agents-dashboard`. The plist wakes this all twenty-four
hours and holds no policy at all, because a plist that only woke between certain
hours would silently override whatever the dashboard said.

Before 9 September 2026 the hours were written twice — twelve entries in the
plist and a `19:00–06:59` clock check in `run.sh` — and changing them meant
editing both and reloading launchd, which is a good description of why they were
never changed. The schedule file was seeded with exactly those twelve hours, so
nothing about the first night after the move was different.

**The floor is not editable.** `schedule.ALLOWED` in `schedule.py` is the same
19:00–06:59 range, and `run.sh` refuses to start outside it however the file has
been edited; the dashboard draws those hours dead rather than accepting a click
it knows would be refused. Moving a schedule into a file a web page can write
removes a guard, and this is what replaced it — two guards is the right number
for something that spends money unattended.

### Where the boundaries come from

Two sources. The estimate is the timestamps in `~/.claude/projects/**/*.jsonl`,
greedily bucketed — cheap, needs no network, and blind to claude.ai, Chrome and
mobile. The exact one is a run that actually hits the limit, whose error names
the reset time; that is written to `window.json` and beats the estimate until it
expires.

Being wrong is safe in the direction that matters. Thinking a window is closed
when it is open means opening nothing and riding what is there. Thinking one is
open when it is closed costs a fresh window, and the cutoff already stops that
after 02:00.

`apiBlockIndex` in the transcripts looks like it should be this and is not: it
counts blocks within one session and restarts per transcript.

## What gets planned

Every open, top-level task tagged `[ai:: full]`, minus three exclusions — the same three `companion/digest.py` applies, because two readers of
one list disagreeing about what is actionable is worse than either answer:

- **Waiting review and Blocked.** The next move belongs to somebody else.
- **An unticked `blocked-by:`.** The blocker is the real task.
- **A `start:` that has not arrived.** It cannot begin yet.

`due:` is deliberately not consulted. A deadline says when something must be
finished, not whether it is worth thinking about tonight.

`[ai:: partial]` was in scope until 6 Sep 2026 and is not any more. The tag is
his own judgement about whether the work can run mostly without him, and a task
he has not judged that way should not be spending a night's capacity ahead of
one he has. A task passed over for its tag is named in the board's "not
eligible" fold with the reason; `[ai:: none]` is not, since that one is his own
statement that the task is his and the card already says so.

## What happens to a plan afterwards

A plan carries a `status:`, and three of the five are decisions rather than
reading:

| Status | What it means |
| --- | --- |
| `unread` / `read` | Nobody has looked at it, or has and is doing nothing yet |
| `agreed` | Approved to be carried out. `execution-agent` picks these up, and the picker leaves the task alone until the work is done |
| `redo` | Rejected, with `redo_note:` saying why. The task is planned again on the next run and the agent is handed the reason, so the second plan is not the first plan |
| `actioned` | Acted on, so it no longer describes outstanding work |

These are known in three places and all three have to stay in step:
`PLAN_STATUS` in `kanban/server.py`, the buttons in `kanban/js/13-plans.js`, and
`is_stale()` in `agents/night_agent/pick.py`.

The acting half is `execution-agent`, in `agents/execution_agent/`. There is one
of it rather than one per bucket, because the per-bucket knowledge lives in the
briefs both halves read. It runs from a live session through the `pa-do` skill,
never on a schedule, and it never writes `todo.md`: a change to the list is asked
for in its report and made by the `pa` skill. See `agents/execution_agent/README.md`
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
acting agent need the same knowledge, and written twice the two would drift, so
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

## The order is his, and so is what gets held back

The board's Plans view opens with the queue — the same `pick.select()` this
runner calls, run against `todo.md` as it stands the moment the column is drawn.
Nothing is queued in advance and nothing is stored, so the column cannot
describe a different night from the one that happens: tick a task off at 23:00
and it is gone from the queue before the run starts.

Dragging a card there writes `plans/queue-order.json`, which is the one thing
that persists:

```json
{ "order": ["The one to do first", "…"], "hold": ["Not tonight"] }
```

Order matters because the batch stops on a budget, a window floor or a usage
limit — the front of the queue is the part that reliably gets planned, and the
back is the part that might not. A task he has never ranked queues *behind* what
he has, rather than in front of it, so an ordering set last week survives a new
task appearing today.

`hold` is the other half: a held task is not planned at all. It beats `--all`,
which exists to ignore the ledger — the ledger is a cache and a hold is an
instruction. It is also the only way to say "not this one" without editing
`todo.md`, which the board must not do from this view and does not.

Neither list decides what the queue *contains*. Every rule above still does, so
a title in the file that has since been ticked off, blocked or renamed is never
matched and there is nothing to prune. Titles rather than ids, because titles
are already what the ledger keys on; retitling a task loses its place in the
order the same way it loses its ledger row, and costs one plan.

Only a drag writes an ordering. Holding a card writes the hold and leaves
`order` exactly as it was, which is a distinction that had to be learned: until
5 Sep 2026 a hold saved the whole visible list too, so touching one card stamped
whatever order the picker happened to produce into the file as though it had
been chosen. It then outranked every rule below, permanently, and nothing on
screen said so.

The file is a preference. Delete it, or never write it, and the queue falls back
to the rules.

### What the queue falls back on

Everything he has not ranked is sorted by the list's own rules, in `in_order`.
Four keys:

1. **What he dragged**, above.
2. **The headline.** One task carries `headline:` and it is the one that makes
   the others easier or unnecessary. Planning anything ahead of it is planning
   the wrong task.
3. **The date.** `PA.md` is explicit that a date beats a score, because the
   tasks carrying real dates are the people ones and their consequences land on
   somebody else. Overdue first, then soonest, with recurrence rolled forward in
   memory so a fortnightly 1:1 sorts on the meeting it actually points at.

   This is not `due:` deciding *whether* to plan something, which `pick.py`
   rules out and this does not change. A deadline still hides nothing. It only
   says what to reach first when the budget runs out before the queue does.
4. **Impact against effort**, highest first, out of `core/todo.py` so it is the
   same arithmetic the board draws. Unscored sorts last, which is right: nobody
   has said the task is worth a night.

**Bucket is not a key at any level**, and that is the point. The fallback used
to be file order, file order is bucket order, and the first full batch on 5 Sep
2026 spent its entire budget on Design System while People, Strategic and
Processes got nothing at all. Sorting on merit is what interleaves them, so a
night that stops early is a thin spread rather than one bucket finished and
three unstarted.

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

The same view's second column reads `data/.night-agent.lock` and `plans/night-agent.log`
together, which is the only honest way — the agents are subprocesses of a shell
`launchd` started and nothing can ask them anything. The lock says whether a
batch is going; the log says what it has got through. A log with a task in
flight and no lock is a run that died between the two, and the column says that
rather than showing it as live.

One card, not a list, because `plan.py` runs its agents strictly one at a time.

The same card carries **Run the agent now**, which is `run.sh --force` started
detached from the board. Force means what it says: it skips the clock gate and
the window test, so it will spend in whatever window is open, including the one
being worked in. It does not skip the lock, and it does not skip the ledger — a
task planned last night whose text has not moved is still skipped, so pressing
it twice is cheap rather than a second full batch. The button is not offered
while a run is going, because `run.sh` refuses a second one by logging a line
and exiting cleanly, which from a button is indistinguishable from starting.

## The sub-agents

One per bucket, `plan-<stream>.md` in this folder, symlinked into
`.claude/agents/` **in this repo** rather than `~/.claude/`, so they version
alongside the runner that invokes them. They moved in here on 7 Sep 2026 from the
root of `agents/`, dropping the `pa-` prefix they had carried: they belong to the
night agent rather than to the PA, and `bucket_agent()` in `plan.py` derives the
name from the stream, so a rename means editing that one line. They share
`PLAN-BRIEF.md`, which holds the output format and the rules; each definition
adds what its bucket needs.

| Bucket | Agent |
| --- | --- |
| People | `plan-people` — dates beat scores, sensitive things stay drafts, five skills already exist |
| Design System | `plan-design-system` — the snapshot/inventory/audit split, `DS-KNOWN-ISSUES.md`, the `ds-*` skills |
| Work oversight | `plan-work-oversight` — who holds it, and what would move it |
| Strategic | `plan-strategic` — usually a decision wearing a task's clothes |
| Processes | `plan-processes` — this repo, `IMPROVEMENTS.md`, the one-writer rule |
| anything else | `plan-general` — the fallback, which says so in its output |

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

Windows are the schedule; these are the brakes. `--max-budget-usd` per task, a
nightly total in `plan.py`, a ten-minute timeout per agent, and a floor: below 20
minutes of window remaining, do not start another task, because a plan cut off
half way is worse than one not written. Weekly limits are why these exist at all —
a window's capacity dies overnight, a week's does not.

## What lands where

```
data/night-agent-schedule.json   on/off, the hours, the nightly budget
data/<dataset>/plans/
  2026-09-05/            one folder a night
    index.md             what was planned, what was skipped and why
    run.json             the same night as JSON, for the agents dashboard
    <task-slug>.md       one plan, frontmatter plus four short sections
  actioned/              plans he acted on, kept when the night is pruned
  ledger.json            what has been planned, and whether it was actioned
  window.json            the usage-window clock
  night-agent.log            every wake, every run, what it cost
```

The schedule sits beside the datasets rather than inside one, because when the
agent runs is true of the agent: switching the board from `twinkl` to `personal`
for ten minutes should not change tonight's hours. `index.md` is the one to open
in the morning; `run.json` says the same thing to the dashboard, which asks every
agent on the machine what last night did and cannot be expected to parse each
one's prose to find out.

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

```bash
ln -s ~/Code/to-dos/agents/night_agent/com.tiagopedras.todos-night-agent.plist \
      ~/Library/LaunchAgents/com.tiagopedras.todos-night-agent.plist
launchctl load ~/Library/LaunchAgents/com.tiagopedras.todos-night-agent.plist
```

`RunAtLoad` is deliberately absent, so loading it at 10am starts nothing. The
schedule guard in `run.sh` would refuse anyway, and two guards on the same
mistake is the right number for something that spends money unattended.

Reloading is only needed when the plist itself changes, which is now almost
never — the hours are a file the dashboard writes, not a plist to edit.

```bash
launchctl unload ~/Library/LaunchAgents/com.tiagopedras.todos-night-agent.plist
launchctl load   ~/Library/LaunchAgents/com.tiagopedras.todos-night-agent.plist
```

## Open questions

**Does Design System want splitting into its five streams?** It is much the
biggest bucket: 14 of the 19 plans written on the first real night came from
`plan-design-system`. The split, if it happens, is along the streams the
bucket already has — ways of working, audits, improvements, documentation,
enablement — which each task's first note line names, and which
`plan-design-system.md` already describes in one place. It is not a small
edit: `STREAMS` in `plan.py` names both the agent and the brief, so five
streams means five agent definitions and five brief files. The cheaper
experiment is to fill in `data/twinkl/buckets/design-system/design-system.md` first and see
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
