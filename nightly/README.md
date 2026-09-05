# The nightly prep agent

Overnight, this reads the to-do list, picks every task Claude could help with,
and sets one sub-agent per task to work out what doing it would actually involve.
It writes a plan for each and stops. **Nothing it produces has been done.** In the
morning the plans are waiting in the board's Plans tab, with a notification from
the companion saying they are there, and each one runs only if Tiago says so.

The problem it solves is not that the work is hard. Forty-two open tasks are
tagged `[ai:: full]` or `[ai:: partial]`, meaning Claude could do most or all of
them, and almost none get handed over. What stops it is the half hour of reading
and working out that has to happen before the handover, and that half hour never
has a good moment. This does it at two in the morning instead.

```
nightly/run.sh --dry-run          what it would do tonight, no spend, any hour
nightly/run.sh --task "Some task" one task by hand, now
python3 core/windows.py --history the last 30 days of usage windows
python3 nightly/test_nightly.py   the arithmetic that decides what gets spent
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

That is also why launchd wakes this **twelve times, hourly from 19:00 to 06:00**,
rather than once. The only way to catch a window he opened is to keep looking,
and an hourly wake gives the resume-after-a-limit behaviour for free: when a run
hits the limit, it records the reset time and stops, and the next wake past that
reset either opens a fresh window or defers to tomorrow, by the same one test.
No long-lived process, nothing sleeping, nothing to restart.

Almost every wake costs a few milliseconds. `run.sh` checks the clock, then the
lock, then the window, and stops at whichever says no.

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

Every open, top-level task tagged `[ai:: full]` or `[ai:: partial]`, minus three
exclusions — the same three `companion/digest.py` applies, because two readers of
one list disagreeing about what is actionable is worse than either answer:

- **Waiting review and Blocked.** The next move belongs to somebody else.
- **An unticked `blocked-by:`.** The blocker is the real task.
- **A `start:` that has not arrived.** It cannot begin yet.

`due:` is deliberately not consulted. A deadline says when something must be
finished, not whether it is worth thinking about tonight.

That is 25 of the 42 as this is written. Planning all of them is only affordable
because of the **ledger**: `plans/ledger.json` records a hash of each task's own
text and the night it was planned, and a task whose text has not changed, and
whose plan has not been actioned, is skipped. The first night writes 25 plans and
every night after writes only what moved. Without it the morning is 25 identical
files and the whole thing is ignored inside a week.

The hash covers the task's notes, not just its title, because a new sub-step or a
rewritten note makes last night's plan stale without touching the title.

## The sub-agents

One per bucket, in `.claude/agents/` **in this repo** rather than `~/.claude/`,
so they version alongside the runner that invokes them. They share
`PLAN-BRIEF.md`, which holds the output format and the rules; each definition
adds what its bucket needs.

| Bucket | Agent |
| --- | --- |
| People | `pa-plan-people` — dates beat scores, sensitive things stay drafts, five skills already exist |
| Design System | `pa-plan-design-system` — the snapshot/inventory/audit split, `DS-KNOWN-ISSUES.md`, the `ds-*` skills |
| Work oversight | `pa-plan-work-oversight` — who holds it, and what would move it |
| Strategic | `pa-plan-strategic` — usually a decision wearing a task's clothes |
| Processes | `pa-plan-processes` — this repo, `IMPROVEMENTS.md`, the one-writer rule |
| anything else | `pa-plan-general` — the fallback, which says so in its output |

Buckets are renameable on the board, so the mapping in `plan.py` is by name with
a fallback rather than a hard five. A task landing on the fallback is logged,
because it means either a rename or a genuinely new kind of work.

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
data/<dataset>/plans/
  2026-09-05/            one folder a night
    index.md             what was planned, what was skipped and why
    <task-slug>.md       one plan, frontmatter plus four short sections
  actioned/              plans he acted on, kept when the night is pruned
  ledger.json            what has been planned, and whether it was actioned
  window.json            the usage-window clock
  nightly.log            every wake, every run, what it cost
```

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
notification for the whole night, never one per plan.

**The board** has a Plans tab beside Reports, and a Schedule button beside
Backups showing whether this agent is armed and what the usage windows have been
doing. Opening a plan marks it read;
*Mark actioned* marks it actioned, which is the one the runner reads — an
actioned plan no longer describes outstanding work, so the next night plans that
task afresh instead of skipping it for looking unchanged.

## Installing the schedule

```bash
ln -s ~/Code/to-dos/nightly/com.tiagopedras.todos-nightly.plist \
      ~/Library/LaunchAgents/com.tiagopedras.todos-nightly.plist
launchctl load ~/Library/LaunchAgents/com.tiagopedras.todos-nightly.plist
```

`RunAtLoad` is deliberately absent, so loading it at 10am starts nothing. The
clock guard in `run.sh` would refuse anyway, and two guards on the same mistake
is the right number for something that spends money unattended.

## The other half

There was one task for this, and it was split. The implementation agent — pick
the next entry off `IMPROVEMENTS.md` and build it overnight — reuses this runner,
this window clock and this landing place, and it is not built. Its picking rule
and its commit behaviour are still open questions, and batching only becomes one
there, where a night's work leaves a working tree behind rather than a proposal.
