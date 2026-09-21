# The PA agent

Written 3 Sep 2026, for turning the four `pa-*` skills into one PA with a shared
brief. Updated the same day with the decisions taken since.

## Built 7 Sep 2026

The hierarchy below exists now, in a shape close to the `board-write` proposal
and nothing like the `board-read` half.

- **`pa` is the writer.** One skill, holding the tag syntax, the scores, the
  recurring meeting agendas, the headline, the optimisation pass, the checker and
  the Reload line. Everything else hands it a list of changes he has already
  agreed to. `check_todo.py` and `audit-checklist.md` moved with it, out of
  `pa-checkin`.
- **`pa-checkin` is the daily session and nothing else.** It invokes
  `pa-retrieve-tasks` once a day, reads, renders the brief for the day and the
  week from `pa-checkin/templates/`, asks what has moved, and hands over.
- **Reports are templated at the desk too**, not only on the phone. The syntax
  and the field list moved to `pa/references/templates.md` so both sets render
  the same way, and `pa-mobile`'s folder holds phone cuts of the same filenames
  which win whenever the session is on a phone.
- **`pa-mobile` is a surface over the others** rather than a parallel skill. It
  still skips the meeting-action pull, which is the one move it cannot shorten.

Names below were normalised to what the skills are called now: `pa-unstick`
became `pa-checkout`, and the four skills this was written against are nine.

Two things in this document are now wrong and left as the record of what was
proposed. `board-read` was not built, and it remains the one job here that would
suit a subagent, since it never writes and so never needs to ask. And the line
under **The one writer rule survives** says `implement-agent` may write
`todo.md`. It may not, and never could: it hands the change up as a request and
`pa` applies it.

**Decided since the first draft.** The shared brief is called `PA.md`, not
`AGENT.md`, because nothing runs it: it is a reference the skills read, the same
as `CONVENTIONS.md`. Both live at the root of `to-dos/`, next to the data they
describe, and `~/Code/agents/` stays empty. The writer is built as a skill first
rather than a subagent, so its change-list grammar can be proven in a session you
can watch. The reader goes straight to a subagent, since it is read-only.

**Done.** `CONVENTIONS.md` moved to the repo root. `PA.md` written. The tone, the
`.current` path rule and the top-level-tasks rule are out of the four skills.

## First, what "agent" can mean, because it changes the answer

Three different things go by that name and only one of them is a drop-in for what
you have.

**A Claude Code subagent**, a markdown file in `.claude/agents/`. It runs in its own
context, does one job, and returns a single report. It cannot ask you anything while
it runs. That rules it out for the check-in, the focus pass and the unstick pass,
all three of which are conversations where you answer one question before the next
one is asked. It suits a read-only job perfectly, which is where the idea started.

**A standalone agent on the Agent SDK.** A real conversational loop, running outside
Claude Code, with its own tools and its own memory. This is the version that could
genuinely be "your PA" rather than a set of things you invoke. It is a much bigger
build and it is not what to do first.

**A brief plus a set of skills.** What you have today, with the missing piece added:
one document holding who you are, what the PA is for and how it behaves, that every
mode reads before it does anything.

This proposal builds the third. It is cheap, it works with what exists, and the
brief it produces is exactly the input the second one would need if you ever want it.

## The shape

```
~/Code/agents/pa/
  PA.md                     standing behaviour, read by every skill
  reference/
    conventions.md          the file format, moved out of pa-checkin
    walkthrough.md          the shared one-task-at-a-time mechanics
  skills/
    board-read/             read the list, return the state
    board-write/            apply changes, check, stamp
    pa-checkin/             the review session
    pa-focus/               scope: what goes back to Backlog
    pa-checkout/            movement: what is sitting unattended
    pa-retrieve-tasks/      intake from the meeting recorder
  scripts/
    check_todo.py           moved out of pa-checkin, used by board-read and board-write
```

Everything under `skills/` still symlinks into `~/.claude/skills/`, the way the four
do today.

## PA.md, the story you tell it

This is the part that does not exist anywhere at the moment. It is not a mode and it
never runs on its own. Every mode reads it first, the way every session currently
reads `conventions.md`.

What goes in it:

- Who you are and what the list is for. The mix of people, oversight, design system
  and strategic work that does not fit in one head, and why the file's value is that
  it holds the reasoning rather than the titles.
- What the PA is for. Optimisation rather than ordering: reduce the total amount of
  work, make what remains cheaper to start. Reordering a list you already wrote is
  the least valuable thing it can do.
- The two tiers of prioritisation. Impact against effort at intake, the one thing
  every morning. Both are decisions about the work rather than about the file, so
  they belong to the agent rather than to any one mode.
- How to talk to you. Short bullets, plain sentences, no preamble, no repeating an
  instruction already given in the session. Longer prose only when explaining a
  failure.
- The standing rules that hold whatever mode is running. Never invent a date. Never
  add a task without both scores. Never write into `data/twinkl/` from a test. Say
  plainly when something failed.

Almost all of this already exists, written well, inside `pa-checkin`. The work is
lifting it out rather than writing it.

## The two centralised skills

You said it yourself: one place that reads the board and one that writes back, so
the rules for each live in one file. That is the change that carries the most weight
here, more than the brief does.

**`board-read`.** One job. Read `data/.current`, read that dataset's `todo.md`
including the `## Context` section, read the conventions, run the checker. Return the
state of the list: the headline and how long it has been set, what is overdue, what
is due in the next five working days, what has slipped since `Last updated`, dates in
Context that have passed, recurring meetings due today or tomorrow, whatever the
checker flagged, how many tasks are unscored, and counts by state and by bucket.

One report with all of that in it, rather than modes. Each caller takes the part it
needs. A reader with three modes is a thing that has to be kept in step with three
callers, which is the failure this whole system keeps designing out.

**`board-write`.** One job. Take a list of changes and apply them. It owns the tag
syntax, the bracket-versus-backtick rule, editing specific lines rather than
rewriting the file, the `Last updated` stamp, re-running the checker before
delivering, and telling you to press Reload. It refuses anything it cannot express
in the conventions rather than inventing a form for it.

Every conversational mode then has the same skeleton: call `board-read`, have the
conversation, call `board-write`. `pa-focus`, `pa-checkout` and `pa-retrieve-tasks`
already end that way by handing back to `pa-checkin`. This makes the front of the
sandwich match the back, and it takes the file-owning job off `pa-checkin`, which is
currently doing two jobs at once.

## conventions.md becomes the agent's, not a skill's

It sat inside `pa-checkin/references/` when this was written and the other three
reached across a skill boundary to read it. Moving it to `reference/conventions.md`
under the agent fixes that. Done since, as `CONVENTIONS.md` at the repo root.

It does not need splitting into a read half and a write half, which was the earlier
suggestion. Once `board-read` and `board-write` exist, they are the only two things
that read it at all. The four modes never touch the file format, so there is nothing
to split it for.

## The four modes, and what each one is for

| Mode | Goal | Reads | Asks |
| --- | --- | --- | --- |
| `pa-checkin` | The full review. Status, what changed, apply it, meeting agendas, optimisation, the headline. | Everything | What has moved since last time |
| `pa-focus` | Scope. What is claimed as in-flight or next-up that honestly is not, and goes back to Backlog. | Doing, To do | Does this column still tell the truth |
| `pa-checkout` | Movement. What has stopped moving, and what is piling up under review with nobody looking at it. | Doing, Waiting for review, Blocked | What would make this move |
| `pa-retrieve-tasks` | Intake. Action items the meeting recorder captured, reviewed one by one before anything lands. | The recorder, plus existing titles for duplicates | Is this yours, and is it real |

Two of them meet in Doing, on purpose. `pa-focus` asks whether it should be there at
all. `pa-checkout` asks why it has not moved. Same column, different question, so
they stay two skills.

**On merging focus and unstick.** They share their mechanics and nothing else, which
is an argument for sharing a reference rather than for merging. Keeping them apart
also keeps their two descriptions apart, and the description is the thing that makes
the right one fire when you ask for it. A single skill with two modes would need you
to name the mode, which puts the choosing back on you. Worth revisiting if
`reference/walkthrough.md` turns out to hold nearly all of both.

## The watermark, since it came up

It is the `Meeting actions last pulled` line in the header of `todo.md`, a timestamp
that says how far the recorder has already been read. `pa-retrieve-tasks` pulls from
that line to now, then moves the line forward. It is what stops the same action item
being shown to you twice, including the ones you turned down.

## What changes in each of the four

- **`pa-checkin`** loses its status read to `board-read` and its file-writing rules to
  `board-write`. What is left is the session shape: ask what changed, write the
  recurring meeting agendas, run the optimisation pass, check the headline. That is
  the review conversation and nothing else.
- **`pa-focus`** loses move 1, the count. It starts at the walkthrough, working from
  what `board-read` returned.
- **`pa-checkout`** loses move 1 the same way.
- **`pa-retrieve-tasks`** barely changes. Its read is the watermark line plus the
  existing task titles for spotting duplicates, which is a different job from a
  status read, so it keeps doing that itself. Its handoff at the end goes to
  `board-write` instead of to `pa-checkin`.

The three shared things that are currently written out four times, once per skill,
move up: the tone, the `data/.current` path rule, and the "top-level tasks only, a
sub-step has no state of its own" rule. All three go in `PA.md`.

## What I would build, in this order

1. `PA.md`, lifted from `pa-checkin`. Nothing else can move until the brief exists.
2. `board-read`, and point `pa-checkin` move 1 at it. Run one morning against it
   before going further. If the status it returns is not enough to run the whole
   check-in from, stop here and the rest is not worth doing.
3. `board-write`, and point `pa-checkin` at it.
4. Move `conventions.md` and `check_todo.py` up, update every reference.
5. `reference/walkthrough.md`, then trim `pa-focus` and `pa-checkout` down to their
   goal, their columns, their question and their outcome list.
6. Repoint `pa-retrieve-tasks` at `board-write`.

## What this costs, honestly

The four skills live in `~/Code/to-dos/agents/pa_agent/` today and are symlinked into
`~/.claude/skills/`. Moving them to `~/Code/agents/pa/` means the symlinks change,
the `.skill` archives in `to-dos/agents/pa_agent/dist/` move or go, and three files that name
the checker's path have to be updated: `to-dos/CLAUDE.md`, `Code/CLAUDE.md` and the
skills themselves.

There is also a question the move raises rather than answers. The PA reads
`to-dos/data/`, and the checker was written against the board's own file format. Put
the agent in one folder and the data in another and the two can drift, which is the
thing keeping them together currently prevents. Worth deciding deliberately rather
than as a side effect of tidying.

## The acting half, added 6 Sep 2026

Everything above is about the modes he drives himself. This is the other half,
decided in one sitting on 6 Sep and built the same day: what happens to a plan
the planning agent wrote once he has agreed with it.

It is not a new PA. It is the same list, the same conventions and the same
brief, with one agent added that can act and one skill that drives it.

**The pieces.**

| Piece | What it is |
| --- | --- |
| `data/<dataset>/buckets/<stream>/<stream>.md` | One brief per bucket, holding the processes he runs in it, what each produces and which skill already does it. Read by the planners and by the implementing agent. Templates only until he writes them. |
| Plan status `agreed` | His approval, set on the Plans view. The only thing that queues work for the implementing agent. |
| Plan status `redo` | A rejection with a reason, written into the plan's own frontmatter. The next nightly run plans the task again and the agent is handed what was wrong with the last one. |
| `implement-agent` | One agent, not one per bucket. It never writes `todo.md`: a change to the list is asked for in its report and made by the PA agent. |
| `do` | The skill that finds agreed plans and hands them over, one at a time, in a session he is sitting in. |

**Why one implementing agent rather than six.** The six planners are safe to duplicate
because they are read-only, and their differences are real. An implementing agent
holds the dangerous half, and six copies of the same guard rails is six chances
for one of them to be edited without the others. The per-bucket knowledge sits
in the brief files instead, which both halves read, so it is written once and
cannot drift between the agent that researched the work and the agent that does
it.

**Why it never runs unattended.** The planners run at two in the morning because
proposing is safe. Acting is not, and the useful thing about a live session is
that the agent can stop and ask rather than guessing, which is exactly what the
planners cannot do and why they fold instead. `do` has no cron, no schedule
and no background mode, deliberately.

**Why `agreed` is a status and not a flag.** A plan is in one state at a time. A
separate approved flag would let a plan be agreed and rejected at once, which
means nothing, and it would need its own reader in three places that already
read `status:`. The five values are documented in `kanban/js/13-plans.js`,
validated in `kanban/server.py` and acted on by `is_stale()` in
`agents/plan-agent/pick.py`, and those three have to stay in step.

**The one writer rule survives, and is now written down.** The board autosaves
`todo.md` within seconds of anything marking it dirty, and it has taken the real
list twice. `implement-agent` may write it, and it is the only agent that may. Before
any write it asks, shows the before and after, hashes the file, edits only the
lines it named, and tells him to press Reload rather than save. Nothing else in
this system writes that file, including the planners, the companion and the
board's own queue column.

## Open questions

- Does the PA move to `~/Code/agents/pa/` or stay in `to-dos/agents/pa_agent/` with only the
  brief and references as new files. The migration above assumes it moves.
- Does `pa-retrieve-tasks` get renamed. You called it intake, which is a better name
  for what it does, and renaming is cheapest before anything else moves.
- Does `board-write` refuse a change it cannot express, or write it and flag it. The
  first is safer and will occasionally be annoying.
- Whether `board-write`, if it is ever built, and `implement-agent` are the same
  writer. Both would own writing `todo.md`, and two owners of one file is the
  arrangement this whole document exists to avoid. `implement-agent` holds that job
  today because it was the one that needed it first.
