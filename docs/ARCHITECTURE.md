# Architecture history

Moved out of `CLAUDE.md` on 22 Sep 2026 to keep that file to behavioural rules.
Everything here is "why it's built this way" — read it when you're about to
change one of these areas and want the reasoning, not on every session.

## One board, and where an agent's part of a task lives

There is one board, and a task keeps its card from the moment it is written until
it is finished, whoever does the work. Two rules, agreed 21 Sep 2026 and built on
the `one-board` branch in nine stages (`handover-one-board.md` is the plan and the
order):

1. A column says the state of the card.
2. Who does the work is the task's or sub-task's assignee, `[to::]`, never the
   column. Handed to AI and Blocked went, and so did the header filter that
   drove the first. Reviewing was Waiting for review.

Where a card sits is the instruction, on every column. Backlog means leave it
alone, To do means pick it up, Doing means it is live, Reviewing means the work is
done and someone has to look, Done means the tick. Done is a real `### Done`
heading first in every bucket (the board draws headings the other way round, so it
is the far right). The tick and the heading move together: `setDone()` moves a card
to the top of Done and one unticked there to the top of To do, and
`gatherDone()` in `core/todo.js`, with `gather_done()` in `core/todo.py` in the same
order, does it for a file written before that was true, so an old backup reads the
same. The old headings load as the new ones (`TIER_RENAMED`, in both format files).

One shape means one object, not a family resemblance. Every column in the app is an
instance of `colHTML()` in `kanban/js/09-columns.js`, so the fill, the border, the
radius, the 322px width, the 12px gap, the header padding and the body padding are
settled once. What a view chooses is which optional parts its heads carry — a hint,
a sort control, a count, an action button, a filter, a description — and what goes
in the bodies. That covers Overview's sections, Matrix's two, the Timeline, both
halves of Reports, Backups, Projects and the two reference cards in the Spend and
schedules sheet. A control that narrows or orders a column lives in its head, which
is where Reports' window picker, Matrix's "Hide Reviewing" and Projects' order select
went, and `colHTML()` has `collapsible`, which draws the column as a `<details>`
whose `<summary>` is the head. The Figma `Column` and `Column header` components
carry the same set, and the two are meant to be changed together. The dash means
exactly one thing in the app, that an agent owns a column, and nothing on the board
is dashed now.

Handing a task over is his act: choosing an agent in the drawer's Delegate to calls
`handOver()` (`kanban/js/04-tier-two-the-one-thing.js`), which moves the card to
Doing and lays out, under the task, four sub-tasks each blocked by the one before —
Plan (Plan agent), Review the plan (him), Implement (Implement agent), Review the
work (him) — or the last two, if it goes straight to the Implement agent. The slugs
are made from the task's id and the step (`ab12cd-plan`, `-plan-review`,
`-implement`, `-work-review`), which is also what marks a task as handed over, and
every sub-task has an id of its own. A sub-task carries every tag a task does, read
by the same `readTags()`, plus a bare `doing` for an agent working on it now; what
it does not carry it takes from its task (`inheritedFields()`: due, impact, urgent,
week), and never the tick, the assignee or anything an agent writes. It opens in
the drawer by its id (`openSubtaskDrawer()` in `19-drawer.js`), faded where it is
the task's.

Approving is ticking a review, and sending back unticks what is before it with a
`feedback:` note under it, so the agent takes it up again and the review blocks
again. Only Implement moves the card: ticked, it goes to Reviewing, and unticked by
a send-back it goes back to Doing. A card shows "your move" while a sub-task
assigned to him is open with its blocker ticked, and its column's head counts them;
it is worked out each time and never stored.

Agents queue "tick sub-task `<id>`" in `data/<dataset>/tick-queue.json`
(`core/tick_queue.py`, appended and removed by id under a lock), served at
`/tick-queue.json`, and the board drains it when it loads (`drainTickQueue()` in
`10-reference-sections.js`): a tick is applied only from the agent the sub-task is
assigned to, one for a sub-task still waiting on a blocker is refused, and a
written plan says where it is through a `Plan:` note on the review behind it.
Nothing shows until the board is next opened.

Plans is not a board. It was seven columns of its own, with `state:` and
`production:` in each plan's frontmatter, from 12 Sep to 22 Sep 2026. A plan is a
document now that holds content and nothing about where it stands: the sub-tasks
are the only place that lives, `stream.py` and its manifest are gone, and `plan.py`
no longer writes `state`, `owner` or `seen`. A plan is read from the review
sub-task behind it (`openPlanReader()`), and one whose task has gone gets a line in
Overview's Context column. An old `#plans` link lands on the board. What the view
alone reached, the Spend and schedules sheet and Run the Plan agent now, is in the
Data menu (`13-agent-run.js`).

## Agent naming history

The planning agent was `night_agent` until 12 Sep 2026, named for the hour it
happens to wake at. The pair now say what each half does: `plan-agent` plans,
`implement-agent` implements. The names it writes into its own documents moved
with it — `night-agent` is `plan-agent` in every `owner:` — and
`core/migrations/migrate-agent-names.py` rewrote what was already on disk. Nothing
depends on that having run: both manifests carry an `owner_legacy` map, so a
document restored from a backup taken before the rename still reads.

There was a second gate on the planning agent's schedule until 9 Sep 2026 — it
would only spend in a usage window that expired before 07:00 — and it went because
a window moves with whenever the day's first request landed, so hours could not be
set against it. `core/windows.py` is still there and no longer refuses anything:
`plan.py` reads it to see whether there is room for another task, and the board's
chart draws it.

`implement-agent` was added 6 Sep 2026, given its own folder on 7 Sep, and its
present name on 12 Sep when the two agents were put on one axis. It had a board of
its own, Execution, from 12 Sep 2026 until the two were folded into one on 13 Sep,
and the board that replaced both went on 22 Sep 2026 — see the one-board section
above.

## The React half, and why it is only a half

`kanban/ui/` is the component layer, begun 13 Sep 2026 against an entry in
IMPROVEMENTS.md. React with Vite and TypeScript, built to `kanban/dist/board-ui.js`.
Under it sit `Column` and `Card`, the two primitives every view is written
against, plus `mount()`, `mountFlushed()` and `unmount()`. Eight views were
ported: Projects, Backups, the two report columns, Overview, the Matrix and the
Timeline, Plans (deleted again 22 Sep 2026), and the Board itself (19 Sep 2026),
and since 20 Sep 2026 the bodies inside Overview and the Matrix are components
too. Still built as strings: the drawer, the header chrome (headline, filter bar,
both tab strips), the conflict modal, the message, agenda and Jira notes under an
Overview card, and the Timeline's body. All of it sits behind one `state` object
every view's mutation still has to remember to re-render.

The point of doing the primitives first is that a column is one object across the
whole app. `Column` is not a new column: it is the same markup `colHTML()`
(`kanban/js/09-columns.js`) emits, element for element and class for class, and
`Card` is `cardShellHTML()`'s the same way. `kanban/ui/test_primitives.mjs` holds
them to it — it renders 50 cases both ways and fails on any difference, with no
browser and no server, because it runs `09-columns.js` in a `vm` with a stubbed
`document`.

**Porting order and what each stage taught:**

- **Projects, 13 Sep 2026** — the smallest leaf view. Two rules came out of it and
  apply to every view since: a React view owns a node it created, not `#lists`
  (the unported views still tear out `#lists` wholesale, which would orphan a
  mounted root); and the orchestration — fetch, error branch, sort preference,
  anything reading `state.doc` — stays in `kanban/js/`, handed to the component as
  props, so the component stays pure and testable and a port touches one place,
  not two.
- **Plans, 13 Sep 2026, deleted 22 Sep 2026 with the tab.** `ColumnFilter`
  (`kanban/ui/ColumnFilter.tsx`) stays as a component nothing uses yet.
  `mountSync()` went with it — it wrapped `mount()` in `flushSync` because Plans
  wired seven kinds of node by selector after every paint; a prop could carry
  every one of those instead.
- **The Board, 19 Sep 2026** (last but one). `renderBoard()` builds a plain data
  model of the columns and hands it to `BoardView` (`kanban/ui/BoardView.tsx`),
  mounted with `mountFlushed()` onto `#board`, which no other view writes into. A
  task card is `TaskCard`, drawn from `cardModel()` in `09-columns.js` — which
  decides which chips a task earns. `cardHTML()` draws the same model as a string
  for the matrix's hover preview, and `test_board.mjs` compares the two over every
  task in `demo.md`, element for element: change what a card shows in
  `cardModel()`, and how a chip or the progress line is drawn in both renderers.
  The title is the one exception to "element for element" — it sits in a span the
  string version does not emit, because the board's inline Markdown (`mdInline()`)
  knows `[text](url)` links and `[placeholder]` markers Tenon's `Markdown` does
  not. Every handler on the board is a prop; the drop line and highlight under a
  dragged card are state inside `BoardView`. `BoardUI.BoardView` has a hook, so it
  is mounted as `BoardUI.h(BoardUI.BoardView, props)`, never called as a function.
- **Reports' counted half, 14 Sep 2026.** `kanban/ui/ReportsBlocks.tsx` is
  `CountedLead`, `CompletedByCategory`, `RecentAccomplishments` and `WeeklyTrend`;
  the four functions that used to return HTML are `build*()` and return the data
  instead. `mdBlocks()`/`mdInline()` stayed as they were (the drawer and Plans
  still call them directly).
- **Overview, Matrix and Timeline, same day (20 Sep 2026 for their bodies).**
  `kanban/ui/SectionsView.tsx` — `OverviewView`, `MatrixView`, `TimelineView`. The
  eight section titles/hints are hardcoded in the component. Still `{ __html }`:
  each section's own body (Big rocks' cards, the matrix grid, the timeline's
  lanes) — porting those is separate, and much of their interactivity (drag-to-
  reorder, the matrix dot's hover) is wired by `#lists`'s delegated listener
  rather than a prop, which reaches a React-rendered subtree the same way it
  reached a string one. Overview's cards are `RefCard`
  (`kanban/ui/OverviewBodies.tsx`); the Matrix is `MatrixBody`/`ChainBody`. Every
  control is an attribute the delegated listener in `25-archiving.js` reads, not
  a prop, except Hide Reviewing (`data-mxfilter`, kept as a prop for the suite).
- **`mountFlushed()`** exists because `capMsgCards()` (Overview) and
  `wireTimelineDrag()` (Timeline) both need real, painted DOM immediately after
  render — neither is a handler a prop could carry. `mount()` alone would race
  React's own schedule.

## Reports is two columns of Overview

Reports was a tab until 19 Sep 2026. `TasksFinishedColumn` and
`WrittenReportsColumn` (`kanban/ui/ReportsColumns.tsx`) now sit at the two ends of
Overview's row. What got done and what to do next are the same question asked at
two ends.

- Tasks finished leads the row, then the four reference sections, then Context,
  then Written reports.
- The row is two reference columns wide exactly — `minmax(774px,2fr)`, 380 twice
  plus the 14px gap — about 3,350px at its floor, scrolls sideways like every row
  of columns.
- Both heads use ordinary column head slots: a count and one line of description.
  `archiveEntriesError` (`kanban/js/12-reports.js`) is set and never read — kept
  as the hook for surfacing a window-reached-the-archive-point warning somewhere
  smaller.
- Both fold under `ov:Tasks finished`/`ov:Written reports` in
  `todo-board-overview-closed`.
- `/reports.json` is read once per arrival at Overview, not once per render:
  `renderView()` compares against `lastRenderedView` and calls
  `forgetWrittenReports()`; `renderSections()` calls `ensureWrittenReports()`
  after the mount.
- `#reports` still resolves to Overview, same as `#quick`/`#delegate`.
