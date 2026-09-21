# Handover: one board

Branch `one-board`, cut from `main` at `b0da379` on 21 Sep 2026. Nothing is built yet.
This file is the plan. A later session, on Opus or Sonnet, should be able to pick up any
stage from it without the conversation that produced it.

## What we're building

One board, where a task keeps its card from the moment it is written until it is
finished, whoever does the work. The agents' part of a task shows as sub-tasks on that
card. Plans stops being a board of its own.

Two rules, agreed 21 Sep 2026
(`/Users/tiagopedras/Code/AGENTS/ux-agent/knowledge/disputes/columns-by-whose-move.md`):

1. A column says the state of the card.
2. Who does the work is the task's or sub-task's assignee, never the column.

The backlog entries in `/Users/tiagopedras/Code/to-dos/IMPROVEMENTS.md` this covers:

- **Big, "An agent's part of a task has nowhere to live on the card"** (top of Big): the
  sub-task design, agreed with the agents-dashboard session. The detail lives there. This
  file only orders the work.
- **Big, "A task handed to an agent leaves the board it was on"**: the columns.
- **Big, "Who does it" and "Delegated to"**: the assignee field.
- **Big, "Done is not a column"**: Done as a real heading.

Out of scope: running the Implement agent unattended (Big, "The implementing agent only
runs with Tiago in the room"), and hiding the agent parts from someone who only uses the
PA.

## What's settled

- **The columns are Backlog, To do, Doing, Reviewing, Done.** Waiting for review is
  renamed Reviewing. Blocked goes and its tasks move to Reviewing. Handed to AI goes.
  Done becomes a real `###` heading.
- **Handing a task over is your act, and the card moves from To do to Doing.**
  - Handed to the Plan agent, it gets four sub-tasks, each blocked by the one before:
    Plan (Plan agent), Review the plan (you), Implement (Implement agent), Review the work
    (you).
  - Handed straight to the Implement agent, because the task already describes a way
    forward, it gets only the last two.
  - A runner may take it on its own only if the work type is on the list in Big "The
    implementing agent only runs with Tiago in the room". Anything else waits for `do`.
- **The board mints the sub-task slugs**, from the task's id plus the step:
  `ab12cd-plan`, `ab12cd-plan-review`, `ab12cd-implement`, `ab12cd-work-review`.
- **An agent ticks its own sub-task when it finishes.** That unblocks your review.
- **Approving is ticking a review sub-task.** Each review sub-task opens a chat with the
  agent that did the work. "Review the plan" carries a note pointing at the plan document
  so the chat knows which one to open.
- **Sending back unticks the sub-task before the review**, with a `feedback` line. The
  agent takes it up again and your review blocks again.
- **Only Implement moves the card.** Ticked, the card goes to Reviewing. Unticked by a
  send-back, it goes back to Doing. A ticked Plan leaves the card in Doing.
- **A sub-task's only state tag is Doing**, meaning an agent is on it now. Unticked is To
  do, the tick is Done.
- **Agents never write `todo.md`.** They queue "tick sub-task <id>" in a file the board
  applies when it loads, the same route as `attach-queue.json`. The board only accepts a
  tick from the agent the sub-task is assigned to, so no agent can approve its own work.
- **"Your move" is worked out, never stored.** It shows in the accent colour when a
  sub-task assigned to you is open with its blocker ticked, and the Doing header counts
  those cards. The progress bar stays as it is.
- **Sorting stays as it was.** The Plan agent plans in the order its cards sit.
- **The assignee is `[to::]`.** The contract's `owner` (who moves it next) is derived from
  assignee plus state.

## Answered during planning

1. **The sub-tasks are the only place a plan's state lives.** A plan document keeps
   its content and loses `state:` and `production:`. `plan-agent/stream.json` stops
   keeping lanes of its own, and the Small entry on `production` closes with it.
2. **`pa` gives each plan in flight's task its four sub-tasks**, ticked as far as the
   plan has got. That's 4 in review, 4 ready and 6 in backlog. Finished plans are left
   alone.

## Stages

Each stage leaves a working board, passes its tests and gets one commit.

| # | Stage | Model |
| --- | --- | --- |
| 1 | The assignee field | Opus |
| 2 | The new columns | Sonnet |
| 3 | Done becomes a heading | Opus |
| 4 | Sub-tasks in the format | Opus |
| 5 | The sub-task drawer | Sonnet |
| 6 | The agents' queue file | Opus |
| 7 | Handover and approval on the card | Opus |
| 8 | The Plans tab goes | Sonnet |
| 9 | Docs and backlog | Sonnet |

### 1. The assignee field

This stage is Big "Who does it" as written, with the agent names changed to "Plan agent"
and "Implement agent".

- A "Delegate to" dropdown in the drawer writes `[to::]`. It replaces the `ai:` slider
  (`AI_STOPS`, `/Users/tiagopedras/Code/to-dos/kanban/js/19-drawer.js:148`) and the free-text
  `f-to` input.
- A new `/people.json` route in `kanban/server.py` reads `people.md`. Restart the server
  afterwards.
- `core/todo.js`, `core/todo.py` and the fixtures change together.
- Moving the real list across goes through `pa`, with a backup first.

Tests: `python3 core/test_todo.py`, `node core/test_todo.mjs`, `test_board.mjs`,
`test_notes.mjs`.

### 2. The new columns

- Delete `AI_COL`, its splice in `boardColumns()`
  (`/Users/tiagopedras/Code/to-dos/kanban/js/02-state.js:337`), and `aiFilter` in every file
  that reads it.
- `WAIT_COL` becomes Reviewing. Keep Waiting for review as an alias in `TIER_RENAMED`, in
  both format files, so old backups still load.
- Delete `BLOCKED_TIER` and its special handling.
- Update `RESERVED_TIERS`, `TIER_HINT` and the `tasks` stream manifest.
- In `agents/plan-agent/pick.py:60`, `PARKED` becomes `{"reviewing"}`.
- Rename the headings on the real list, and move the 3 blocked tasks, through `pa`.

Tests: `test_board.mjs`, `test_matrix.mjs`, `test_phone.mjs`, `test_overview.mjs`,
`test_recurring_roll.mjs`, `test_planning_agent.py`.

### 3. Done becomes a heading

This stage is Big "Done is not a column".

- A `### Done` heading in each bucket, kept in step with the tick in `core/todo.js`. A
  tick moves the card to Done, and a card dropped in Done gets ticked.
- `rollRecurring()` can untick a card and leave it in Done.
- Everything that reads `DONE_COL` or `t.done` needs checking: reports, archiving
  (`core/archive.py` and `25-archiving.js`), `core/aggregate.py`, the timeline, the matrix,
  and the drawer's Column field.

Tests: every suite listed in `CLAUDE.md`, plus `python3 core/test_reports.py`.

### 4. Sub-tasks in the format

- Sub-tasks get every tag a task has, on their own line, plus a six-character id and an
  optional Doing tag. The tick means Done.
- `blocked-by` between sub-tasks already works (`slug_states()` and `is_blocked()`,
  `/Users/tiagopedras/Code/to-dos/core/todo.py:665`). Check that the board draws it on
  sub-tasks too.
- Inheritance follows the Big entry: bucket, project, due, impact and tags inherit.
  State, assignee, `seen`, `feedback` and `resolution` never do.
- `subSteps()` (`/Users/tiagopedras/Code/to-dos/kanban/js/06-dates-substeps.js:55`) and
  `splitBody()` in both format files.
- New fixture cases for sub-task lines, generated by `core/fixtures/generate-parse.mjs`.

Tests: both format suites.

### 5. The sub-task drawer

- `openDrawer()` (`/Users/tiagopedras/Code/to-dos/kanban/js/19-drawer.js:820`) opens a
  sub-task by its id, with inherited values greyed out.
- A button at the top left goes back to the parent task.

Tests: a new case in `test_notes.mjs` or a new `test_subtasks.mjs`, on a locked tab.

### 6. The agents' queue file

- A new queue file in `data/<dataset>/`, with GET and POST routes in `server.py` shaped
  like `/attach-queue.json`.
- A drain in the board, beside `drainAttachQueue()`
  (`/Users/tiagopedras/Code/to-dos/kanban/js/10-reference-sections.js:832`), that applies
  "tick sub-task <id>" through the board's own edit path, and refuses a tick from anyone
  other than the sub-task's `[to::]`.
- Ticking Implement moves the card to Reviewing, in the same drain.
- The Plan agent queues a tick on Plan when the plan is ready, and records it in
  `ledger.json` so it doesn't plan the same sub-task again.
- `pick.py` picks open, unblocked Plan sub-tasks assigned to the Plan agent, in board
  order, instead of `ai: full`.
- The `do` skill and `implement-agent.md` queue a tick on Implement when the work is
  finished.

Tests: `test_planning_agent.py`, plus a board test that stubs the queue.

### 7. Handover and approval on the card

- Delegating in the drawer moves the card to Doing and adds the sub-tasks: four for the
  Plan agent, two for the Implement agent, with minted slugs and `blocked-by` links.
- "Review the plan" carries a note pointing at the plan document, and its drawer offers
  what the Plans card has today: read the plan (`openPlanModal()`) and talk it through
  (`openPlanChat()`).
- "Review the work" opens a chat with the Implement agent the same way.
- From either review: approve ticks it. Send back unticks the sub-task before it, with a
  `feedback` line. Unticking Implement moves the card back to Doing.
- "Your move" in the accent colour goes on `cardModel()`, drawn by both `TaskCard.tsx` and
  `cardHTML()`. The Doing header gets its count.

- Stop reading and writing `state:` and `production:` on plan documents, in the board,
  `stream.py` and `do`. Remove the lanes from `plan-agent/stream.json`.
- Move the plans in flight across through `pa` (answer 2), with a backup first.

Tests: a new `test_one_board.mjs` built from the action cases in `test_plans.mjs`. Its only
allowed write is the board's own `todo.md` save.

### 8. The Plans tab goes

- Remove the tab from `renderViewTabs()`, and have `isKnownView()` send `#plans` to the
  board.
- Delete `PlansView.tsx`, the rendering half of `13-plans.js`, and `test_plans.mjs`. Keep
  `PlanCard` only if the drawer uses it.
- A plan whose task is gone gets a line in Overview's Context column.
- `plans/queue-order.json` goes, since the order comes from the board.

Tests: `test_phone.mjs` and the full browser list.

### 9. Docs and backlog

- Rewrite "The two boards, and why they are one shape" in `CLAUDE.md`, the Plans part of
  "The React half", and the Plans section of `README.md`.
- Strike through the four entries above in `IMPROVEMENTS.md`, and the Small entry on
  `production`.
- Update the `pa` skill's tag table for `[to::]`, the sub-task tags and the new headings.

## Rules for whoever builds this

- Read `COORDINATION.md` before each stage, and add an entry at each commit.
- Test on a locked tab. Never write into `data/twinkl/` or `data/personal/` from a test.
  `data/_test/` is the only dataset for a real save.
- Restart the server after changing `server.py`. Run `npm run build` after changing a
  `.tsx`.
- Changes to the real list go through `pa`, with a backup first.
- Don't push or merge. You merge the branch yourself.
