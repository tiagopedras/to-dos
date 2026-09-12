# Board improvements

The standing list of what is still wrong with this app and what should be built
next. It does the same job for the board that `DS-KNOWN-ISSUES.md` does for the
design system: it holds the state of the tool, not the work.

Deliberately separate from `data/todo.md`. That file is Tiago's actual work and it
is private. This one is about the code, it holds no names and no dates, so it is
tracked in git alongside the thing it describes.

Read it before diagnosing anything here. If a problem is already written down,
what is wanted is progress on the fix, not another report of the symptom. When
something lands or something new turns up, edit this file rather than only saying
so in chat.

Split below into Small — a sitting change, no new data model or view — and Big —
needs a decision, a new tag, or a new piece of the board before it can be built.

## Small

- **The Reports window picker is the last segmented control that is not the
  shared tab.** `.repwindow-seg` (`kanban/board.css:894`) draws its own pill and
  its own buttons — `padding:3px 9px`, `font-size:12.5px`, its own `.on` state
  — and `repWindowHTML()` (`kanban/js/12-reports.js`) emits them. It is the same
  object as `.tabs` holding N `.tab`s, at the smaller of the two sizes the Figma
  `Tab` component has: 12px, padding 4/9. Folding it in means emitting
  `<div class="tabs small">` with `.tab` / `.tab.on` children and deleting the
  three `.repwindow-seg` rules. The reason it was left is that nothing else
  wanted a small tab once the Plans filter chips became a header dropdown
  (`.colfilter`), so a `.tabs.small` rule added for this alone would have been
  the only caller — see the note where that rule was removed from board.css.

- **`.aic-addsub` is the one small button still outside `.btn`.** The five that
  were folded into `.btn.outline.small` and `.btn.dashed.small` on 12 Sep 2026
  — `.btn.mini`, `.addsub`, `.completeall`, `.qhold` — all live in
  `kanban/board.css`. The sixth, `+ New chat` and `+ Attach` in the task
  drawer's Chats field (`kanban/js/10-reference-sections.js:946-947`), takes its
  styling from `PACKAGES/ai_chat_engine`, which `ai_canvas` also loads. So the
  fold is a change to a shared package with a second consumer, and the Figma
  merge put it at Dashed/Small (12px, padding 4/9, radius 6) the same as
  `.addsub`. Worth doing with `ai_canvas` open beside it rather than blind.

- **The Execution view has a `doing` state its board does not draw.**
  `agents/execution_agent/stream.json` declares five states and
  `renderExecutionView()` (`kanban/js/27-execution.js`) draws four columns:
  Backlog, To do, Waiting for review, Done. A run the acting agent has picked up
  is `doing`, and `runColumn()` folds it in with `ready` so it shows in To do.
  The Plans view got its own Doing column on 12 Sep 2026 for exactly this reason
  — a run in flight and a queue waiting to run are two answers — and the
  argument is the same here. Five columns, and `runColumn()` stops folding.

- **The night's size is set in dollars, and nothing says how many plans he
  wants.** The batch loop in `run()` (`agents/night_agent/plan.py:898`) stops on
  two things only — under `FLOOR` minutes of window left (`:87`) and
  `spent >= args.budget` against `NIGHT_AGENT_BUDGET` of $12 (`:79`) — so the
  count that lands is whatever $12 happens to buy that night — 10 plans on the
  first full batch, against 24 eligible. A third stop, `len(written) >=
  args.max_plans`, is two lines beside the budget one, and reuses the same
  `stopped` message shape. The setting has further to go than the check: the
  schedule file's existing `budget` key (`agents/night_agent/schedule.py:31`) is
  read by `dashboard.py` alone — `run.sh:133` calls `plan.py` with nothing but
  the flags it was given — so a `max_plans` key added to `DEFAULTS`, `load()`
  and the dashboard's `fields` list (`dashboard.py:146`) still needs `run.sh` to
  pass it down, which no schedule value does today.

- **Board, Matrix and Timeline take three tabs for three ways of drawing the same
  tasks.** `viewDefs()` at `kanban/js/11-canvas.js:901-912` lists them as three
  peers between separators, and `renderView()` at `kanban/js/18-timeline.js:734`
  renders every def as its own `.tab` button — so a third of the strip is spent on
  what is one view under three renderers. Collapse them into a single tab carrying
  the name of whichever is current plus a chevron on its right, opening a
  `.dropdown-panel` of the three, built the way the header's `Data ▾` menu already
  is (`kanban/index.html:33`, wired at `kanban/js/25-archiving.js:117-126` — closes
  on picking an item, on a click elsewhere, and on Escape). The view ids stay as
  they are, so `isKnownView()` (`kanban/js/11-canvas.js:925`), the `#matrix` and
  `#timeline` fragments and `syncHash()` need no change; what changes is only how
  the three are offered. `kanban/test_canvas.mjs:126` and
  `kanban/test_schedule.mjs:357` both read the on-tab out of `#viewToggle .tab`,
  so whatever the collapsed control renders has to keep that selector meaningful
  or both need rewriting.

- **Token Session and "What runs on a clock" take a whole track on Plans for two
  cards nobody reads across.** `renderPlansView()` at `kanban/js/13-plans.js:1262-1273`
  wraps both in a `.pvcol` fifth grid track, and `.lists.pview` in
  `kanban/board.css:1010-1015` pays `minmax(320px,420px)` plus its share of the
  `min-width:1796px` for it — on a view whose actual work is the four columns to
  its left. Both are reference rather than decision: the chart is a glance at
  spend, the clock card changes only when the plist does. Move both card strings
  into a `showModal()` body (`kanban/js/23-conflict-modal.js:19`, the `wide`
  variant the written reports already use), opened by a `btn mini` in a
  `.cardhead` on the Inbox card, which is the one that currently has a bare `<h3>`
  where Queue has a head with a button in it. The grid then drops to four tracks
  and the `min-width` comes down with it. `renderUsage()` and `renderSched()`
  already draw into `#usageOut`/`#schedOut` by id, so they need no change as long
  as the modal is in the DOM before they run. `kanban/test_plans.mjs:233-237` and
  `kanban/test_schedule.mjs:148-152` both assert the two cards sit in a `.pvcol`
  in the last track, so both have to be rewritten against the modal.

- **`plans/actioned/` is read as though it were a night, and two things break on
  5 October 2026 when the first folder is old enough for `prune()` to make it.**
  `prune()` in `agents/night_agent/plan.py` moves agreed and actioned plans into
  `plans/actioned/` as `<night>-<file>.md`, and `plan_listing()` in
  `kanban/server.py` iterates every non-dotted directory under `plans/`, so those
  come back carrying `night: "actioned"`. Two things then go wrong. `mark_plan()`
  validates `night` against `^\d{4}-\d{2}-\d{2}$`, so a pruned plan can never be
  marked again from the board. And `redoReplaced()` in `kanban/js/13-plans.js`
  compares `(o.night || o.date || '') > when` as strings, where `"actioned"` sorts
  above every date, so once one pruned plan exists every rejected plan reads as
  already replaced and drops out of the Decided column into history. Neither has
  fired yet only because no night folder has reached `KEEP_DAYS = 30`; the
  `2026-09-05` folder does on 5 Oct 2026. The fix is to stop the folder name being
  identity, which is also what the stream contract does when plans migrate, so it
  is worth doing in that pass rather than twice.

- **The companion shows the plans the night wrote and says nothing about the
  run that wrote them.** `planListing()` (`companion/src/main/plans.ts:52`)
  walks the plan files, and the renderer's plans section
  (`companion/src/renderer/src/App.tsx:180`) draws a card per open one, so a
  night that planned nothing and a night that never woke up look identical —
  an empty section. The night already writes the answer:
  `write_run_record()` (`agents/night_agent/plan.py:579`) leaves a `run.json`
  beside the plans with the start and finish times, the cost, whether it was
  cut short, and a row per task tagged planned, folded or skipped with the
  reason. Reading that file in a new `companion/src/main/night.ts`, hanging it
  off `Snapshot` (`companion/src/shared/types.ts`) alongside `plans` where the
  snapshot is assembled (`companion/src/main/index.ts:173`), and drawing one
  summary line above the cards would say what happened without opening the
  board. `run.json` is per-night and pruned with its folder, so the companion
  has to cope with the newest night's folder having no record at all — which
  is itself the thing worth saying, since it means the agent did not finish.

- **The Reports window picker is a dropdown, so the seven ranges it holds are
  invisible until it is opened.** `reportWindowSelectHTML()`
  (`kanban/js/12-reports.js:760`) writes a `<select>` over the seven entries in
  `REPORT_WINDOWS` (`:25`), and it governs every report on the tab — the counts,
  the lead note, and the weekly pace chart through `trendWeeks()` (`:378`) — so
  it is the one control on the view worth reading at a glance. A segmented row
  of buttons would show all seven at once and make switching one click rather
  than two. The change is contained: emit a `<div class="repwindow-seg">` of
  `<button data-window="...">` instead of the `<select>`, swap the `onchange`
  handler in `renderReportsView()` (`:742`) for a click handler that calls the
  same `setReportWindow()` (`:48`), and give `.repwindow select`
  (`kanban/board.css:802`) a sibling rule for the row. `readReportWindow()`
  (`:39`) and its `localStorage` key are untouched. Seven buttons plus the
  `.repdates` span may not fit the card at narrow widths, so the row needs to
  wrap or the labels shorten.

- ~~**A plan spends most of its words before it gets to what to do.**~~
  **Done, 11 Sep 2026**, by a different route than the one written here. Capping
  the two front sections would have kept a plan carrying research he has no
  reason to read twice, so the file now holds five sections and the board shows
  three of them. `Context` is the night's research trail — what it read, the
  standing constraints, what it ruled out and why, what it could not establish —
  and `History` is one line per revision; `mdBlocks()`
  (`kanban/js/12-reports.js`) takes a `drop` list and leaves both out of the
  render, named rather than positional so a plan written before this still
  draws. What is shown is `Summary`, which says what is proposed rather than
  what the situation is, `Findings` as bullets, and `Proposed plan`, with
  `Needs you` under it. Under 300 words of his reading against 450 before.

  The hidden half is not dead weight: the acting agent is handed the plan file
  and reads `Context`, and so does the next night when he sends one back, which
  is what the entry below this one turned out to be about.

- ~~**A numbered list in a plan renders as one run-on paragraph.**~~
  **Done, 11 Sep 2026**, as written here: an ordered branch beside the bullet
  one, `flushList()` closing whichever kind is open, and a `.repdoc .repnum`
  rule that leaves the browser's own numbering alone. It became urgent rather
  than untidy once `Proposed plan` was one of the three sections he sees. The
  original entry follows.

  **A numbered list in a plan renders as one run-on paragraph.** `mdBlocks()`
  at `kanban/js/12-reports.js:598` knows one bullet shape,
  `/^[-*]\s+(.*)$/`, so a line opening `1.` misses it, falls through to the
  paragraph branch, and is joined to its neighbours with a space by
  `flushPara()`. Every plan hits it: `agents/night_agent/PLAN-BRIEF.md` asks
  for the course of action and the open questions as numbered steps and the
  planners write them that way, so the file on disk is right and the renderer
  is what is wrong, which also means fixing it once beats editing six planner
  briefs. It wants an ordered branch beside the bullet one, `/^\d+[.)]\s+(.*)$/`,
  with `flushList()` closing whichever kind is open and emitting `<ol
  class="repnum">`, and a `.repdoc .repnum` rule beside `.repbul` at
  `kanban/board.css:1410`, since that one sets `list-style:none` and draws its
  own middot in `::before`, which would swallow the numbers. The same function
  draws written reports and the drawer's Description field, so
  `kanban/test_notes.mjs` and `kanban/test_plans.mjs` both want a case for it.

- ~~**A plan sent back stays in Decided forever, even once the night has
  written the replacement it asked for.**~~ **Done, 10 Sep 2026.** A replaced
  rejection is filed with the record instead of left in the redo group reading
  as stalled work. `redoReplaced()` (`kanban/js/13-plans.js`) is the whole
  test: a redo plan is spent when another plan for the same task carries a
  later `night`, keyed on the `p.slug || p.task` that `planItemHTML()` already
  builds. It needs no route and no read of the night agent's ledger, since
  every row `plan_meta()` returns (`kanban/server.py`) already carries both
  fields, and it is measured against the whole `planList` rather than the
  bucket-filtered view — a replacement is a replacement whether or not its
  bucket tab is on.

  `renderPlanDecided()` puts those cards in the `<details>` beside the
  actioned ones, whose summary now reads "N actioned or replaced" rather than
  claiming they were actioned, and the `redo` chip counts only rejections
  still waiting on a replacement — so when every one has been answered the
  chip is not drawn at all, which is `planFilterBarHTML()`'s existing rule
  doing the work. `planItemHTML()` is untouched, so `redo_note` still reads
  inside the fold: a spent card is folded, never dropped, because that note is
  the only written record of what was asked for and `rejection()`
  (`agents/night_agent/plan.py`) reads it back off the file.

  What prompted it was the three cards on the real list, all rejected 5 Sep,
  all re-planned 9 Sep, all still showing as redo while their replacements sat
  unread in the Inbox. Checked against the running board afterwards: the redo
  chip is gone, the three are in a fold reading "5 actioned or replaced", and
  the Decided column shows only the two agreed plans waiting on `/pa-do`.
  `kanban/test_plans.mjs` gained seven checks and runs 79.


- ~~**A project card on the Projects view is only clickable on its title row.**~~ **Built by the improvements agent, 10 Sep 2026.**
  `projectItemHTML()` (`kanban/js/26-projects.js:61-85`) puts `data-project` on
  the `.rephead` button alone, and the path, status line and blurb underneath
  it carry none — so clicking anywhere in a card except that top strip does
  nothing, even though the whole card looks like one target. The document-level
  handler that opens the drawer already reads it with `closest('[data-project]')`
  (`kanban/js/19-drawer.js:1493`), so moving the attribute onto the `<article
  class="repitem projitem">` wrapper itself is enough to make the rest of the
  card clickable with no change to the handler.

- **The diagonal stripes marking a weekend on the timeline read heavier than
  the working days either side of them.** `.tlweekend` (`kanban/board.css:580-583`)
  draws them with `repeating-linear-gradient(45deg, var(--line-soft) 0 6px,
  transparent 6px 12px)` — a 6px solid band against a 6px gap, so the stripe
  carries as much weight as the space between. Narrowing the solid band (say
  to 3px, keeping the 12px repeat so the diagonal angle and spacing stay put)
  is the whole change: one number in that gradient, nothing in `tlWeekends()`
  or the `.tlweekend` divs it renders in `kanban/js/18-timeline.js:242-254`.

- **A message on an Overview card runs to 400px before anything trims it,
  which is twenty lines of a column that holds three cards.** `.ref .msg`
  (`kanban/board.css:1520`) caps every kind — message, prompt, ticket, agenda
  — at `max-height:400px`, and `capMsgCards()` (`kanban/js/18-timeline.js:691`)
  measures each one after render and adds `.capped` only where truncation
  really cut, which is what earns the fade and the "truncated — open the task
  to read the rest" label (`board.css:1524`). The mechanism is right and the
  number is wrong: three lines is the cap, on every `.ref .msg` in Quick wins
  and Delegate to Claude alike, so the column reads as a list of cards rather
  than a page of text. A `-webkit-line-clamp:3` replaces the height, and
  `capMsgCards()` needs no change — `scrollHeight > clientHeight` is as true
  of a clamped box as of a capped one. The fade does need one: at 13px on a
  1.55 line-height, three lines is about 60px, which is exactly the height the
  `::after` gradient already claims, so it would cover the whole message
  rather than the end of it.

- **The board's canvas has no way to straighten itself back out once dragging
  has piled boxes and cards on top of each other.** `layoutCanvas()`
  (`kanban/js/11-canvas.js:121`) only ever places a card the first time it
  shows up — anything already in `state.canvas.cards`/`state.canvas.boxes`
  keeps its stored `x`/`y` forever, and there is no control anywhere in
  `11-canvas.js` that revisits those positions afterwards. `ai_canvas` already
  solved this once, as `tidyCanvas()` in
  `~/Code/ai_canvas/src/renderer/src/App.tsx:733`: it measures every section
  and loose card, sorts them reading-order (`y` then `x`), and re-packs them
  into a wrapping grid sized to the window, moving only what needs to move.
  Porting that one behaviour — a "Tidy" control that reflows `cvbox` groups
  and loose `cvcard`s the same way, writing the results back through the same
  `state.canvas` store `renderCanvas()` already persists to — would give the
  to-dos canvas the equivalent of that single button; `ai_canvas`'s own
  `gridLayout()`/`peekLayout()` nearby are a different feature (an Exposé over
  open session windows, not the board canvas) and not part of this.

- **The button that edits columns sits next to the button that edits buckets,
  not next to the control that filters by column.** `#editTiers`
  (`kanban/index.html:63-66`, wired to `openTierEditor` in
  `kanban/js/07-render-board.js:93`) is grouped with `#editBuckets` at the far
  left of the bucket strip, right after `#bucketFilters`. The Status dropdown
  it would actually pair with — `#statusWrap`/`#statusFilterBtn`
  (`kanban/index.html:70-77`, drawn by `renderStatusFilters()` in
  `07-render-board.js:108`) — sits on the other side of the strip's own
  `<span class="spacer">`, past `#allBuckets` and `#scoreChip`. Edit buckets
  belongs where it is, beside the tabs it edits; Edit columns edits the exact
  set of names Status filters by, so moving `#editTiers` next to
  `#statusFilterField` groups the control with the thing it controls, the way
  Edit buckets already does for its own tabs. A markup move rather than new
  behaviour — `18-timeline.js:849` and `:853` toggle both buttons' `.hidden`
  class independently already, by id, so neither's visibility logic cares
  where in the strip it sits.

- **A project whose every task is done still wears the same "Live" tag as one
  with work outstanding.** `projectItemHTML()` (`kanban/js/26-projects.js:61`)
  already computes both numbers it would need — `open`, the count of
  not-done tasks, and `live`, whether any task points here at all — but the
  tag on line 72 only ever reads `live`, so `open === 0` renders identically
  to a project mid-flight. A third state, "Completed", would fire when
  `live && open === 0`, alongside a new `.tag.projcompleted` rule next to
  `.tag.projlive`/`.tag.projorphan` in `kanban/board.css:1693-1694`.
  `kanban/test_projects.mjs:136-140` asserts `.projlive` on the first fixture
  project and `.projorphan` on the last — whichever fixture project has all
  its tasks done, if any, would need its own assertion added alongside them.

- **Delegate to Claude prints `rank:` as the row number but offers no way to
  change it, so the only way to reorder the list is to retype the tag on every
  task by hand.** `delegateSection()` (`kanban/js/10-reference-sections.js:577`)
  filters `ai:full`, sorts on `rank` ascending and renders the rank's own value
  into `.refnum` — there is no `draggable` or `ondragstart` anywhere in that
  file, so the numbers are read-only and the gaps show: the list currently runs
  1..9, 11, 12 because rank 10 was ticked off and 20 came off a task that went
  back to `ai:partial`. The pattern to copy is already built one view over —
  `wireTlReorder()` (`kanban/js/18-timeline.js:387`) drags a row's grip and
  renumbers every task in that lane 0..n through `locate(row.id)`
  (`kanban/js/04-tier-two-the-one-thing.js:299`), setting `.dirty` and calling
  `markDirty()`, and `sortTimelineLane()` (`18-timeline.js:348`) does the same
  in one pass from a button. The one difference that matters: `tlrank` is scoped
  to a bucket lane, `rank` is global across the file, so a single drag rewrites
  every `ai:full` task line rather than one lane's worth — no extra cost, since
  the board writes the whole document on save anyway, but it does mean a dense
  renumber is the sensible behaviour rather than shuffling neighbours. Gaps are
  cosmetic; duplicates are not, and nothing today stops two tasks sharing a
  number, in which case their order against each other is whatever the sort
  happens to do. Related but not the same as the open Big entry asking for
  alternative sort orders on this section, which is about what to sort by rather
  than about being able to reorder at all.

- **Counted from the list weighs every finished task the same, so a bucket
  that closes out three L tasks reads identically to one that closes out three
  S ones.** `completedByCategoryReport()` (`kanban/js/12-reports.js:194`) already
  groups `completedRecently()`'s output by bucket and shows a count, a bar and a
  percentage per bucket — the count is task volume, not effort. `EFFORT_N`
  (`core/todo.js:565`, S/M/L → 1/2/3) already exists for the Impact-against-effort
  sort and would give each row a second number, effort points summed per bucket,
  next to the task count. It isn't time — nothing in this codebase timestamps a
  work session, so "how much time I spend per bucket" has no real data to answer
  it, only "how much effort I closed out per bucket" as a proxy from the S/M/L
  tag already on every task. Two threads have to carry the field before the report
  can read it: `completedRecently()` (`kanban/js/12-reports.js:169`) pushes
  `bucketName`/`tierName`/`title`/`doneOn`/`taskId` per live task but drops
  `t.effort` on the floor, and `parseArchiveEntries()`
  (`kanban/js/12-reports.js:130`) does the same for archived ones — `parseTask()`
  already returns `.effort` in both places, it just isn't kept. Once both carry
  it, a bucket with no effort tagged on any of its finished tasks should say so
  rather than silently reading as zero.

- ~~**The companion's notifications vanish on their own because they're
  Banners, and this code has no lever to make them Alerts.**~~ **Done, 8 Sep
  2026 — nothing to build.** `notify()`
  (`companion/app.py:155`) delivers through `NSUserNotification`, and whether
  the result sits on screen until dismissed or auto-hides after a few seconds
  is macOS's own per-app "Alert Style" setting — System Settings → Notifications
  → To-Do Companion → Banners/Alerts — not a property this code sets. There is
  no `setAlertStyle_` or equivalent on `NSUserNotification`, and the
  `UNUserNotificationCenter` API this deprecated one stands in for (see the
  comment above `notify()` on why that one won't register for an unsigned
  bundle) is governed by the same system setting either way. So "persistent"
  here isn't a build: it's flipping that one toggle for the app, once, outside
  this repo. Worth knowing separately — `deliverNotification_` already leaves
  a banner listed in the Notification Center panel until `removeDeliveredNotification_`
  fires on click (`userNotificationCenter_didActivateNotification_`,
  `companion/app.py:125`), so an ignored one isn't actually gone, only off
  screen.

- **A recap he could paste into a status update means flattening the one
  report that already lists titles, not building a new one.**
  `completedByCategoryReport()` (`kanban/js/12-reports.js:194`) already has
  every finished task's date and title, off the same `completedRecently()`
  list `reportDefs()` (`kanban/js/12-reports.js:90`) feeds every report on the
  tab — but it's grouped by bucket, and each bucket's tasks sit behind their
  own closed `<details>`, so reading what got done means opening every
  non-empty bucket in turn. A "Recent accomplishments" report would read the
  same list sorted by `doneOn` instead of grouped by bucket, one flat `<ul>`
  open by default, each row keeping `rowHTML()`'s existing
  date/title/`mdInline()` shape with the bucket named as a chip rather than as
  the grouping. One more `report*Report()` function, listed in `reportDefs()`
  beside the two that exist already — no new data and no new fetch, since
  `completedRecently()` and the Show-window picker are already shared across
  the tab.

- **The night agent's lock can sit held for a full day with nothing wrong,
  because staleness is judged by age alone.** `run.sh`'s stale-lock check
  (`agents/night_agent/run.sh:62`) only ever asks `find "$LOCK" -maxdepth 0
  -mmin +120` — how old the directory is — never whether the process that
  made it is still alive. That's fine for a crash, but a laptop put to sleep
  mid-run suspends the holder rather than killing it: `plan.py`'s own
  10-minute per-task ceiling (`TASK_TIMEOUT` at `agents/night_agent/plan.py:71`)
  can't fire while the process isn't scheduled, so it comes back exactly
  where it left off once the lid opens, and every hourly wake in between logs
  "a run is already going" (`run.sh:66`) rather than ever clearing it — caught
  8 Sep 2026, where the lock held from 06:05 on the 6th to the morning of the
  8th with zero output in `night-agent.log` and nothing in either
  `night-agent.err.log` or `.out.log`, across a stretch the log itself shows
  the machine awake for on the hour throughout. The fix is to write the
  holder's PID alongside the lock when `mkdir "$LOCK"` succeeds (`run.sh:59`)
  and have the staleness branch test that PID with `kill -0` before trusting
  the 2-hour window at all — a dead PID clears regardless of age, a live one
  is left alone regardless of how old it looks, and the mtime check stays
  only as the fallback for when no PID was recorded to check.

- **Every plan comes back the same shape and the same length, whether the task
  needed three sentences or three days.** `agents/night_agent/PLAN-BRIEF.md`
  offers exactly two shapes under "What to write": four sections up to 400 words,
  or a fold, whose bar it then sets "deliberately high" on purpose. A small task
  has nowhere to land between them — it is plannable, so folding is ruled out,
  and what is left is four sections of research about something that wanted a
  paragraph. The same brief tells an agent short of a fact that folding "costs
  him a night's capacity", which reads as a reason to write around the gap rather
  than name it on the first pass. Two edits to that one file would cover both,
  with no new outcome value and nothing to change in `write_plan()`
  (`agents/night_agent/plan.py:524`) or the "needs you" badge
  (`kanban/js/13-plans.js:146`): a third shape for a task whose whole answer is a
  finding and a first step, and a fold bar phrased as ask early rather than as a
  last resort.

- **The Bucket field's dropdown button carries no chevron, so it doesn't
  read as a dropdown at rest.** `.bucketbtn` (`kanban/js/19-drawer.js:588`,
  styled in `board.css:1709`) is a coloured dot and the bucket name, nothing
  else — no arrow, no `::after` marker, unlike a native `<select>` it
  replaced. A small chevron on the right, the way `.dropdown-item`'s own
  panel already implies direction by opening below the button, would be a
  CSS-only addition: an `::after` on `.bucketbtn` or an inline `<i>` beside
  the label, flipped via a class when `#f-bucket-menu` is open the same way
  `.tlchevron.open` already rotates on click.

- ~~**A task's Project field is buried below the fold, under eight fields it
  has nothing to do with.**~~ **Done, 8 Sep 2026** — and not where this entry
  said. The reasoning here was right about the cause and wrong about the
  destination: the field is not an editable property of the task, so it does
  not belong in the left-hand column at all, under Description or anywhere
  else. It is now the first section of the drawer's *second* column, beside
  the conversations and the dependencies, which are the other things that are
  about the task rather than of it. `projectSection()` in
  `kanban/js/19-drawer.js` draws it as a card — folder name, what the project
  is, how many files it holds and when it was last touched, the last three
  filled in by `loadTaskProject()` off the same `/project.json` the project
  panel reads. Clicking it opens that panel, so a task card reached from a
  project now has a way back.

- ~~**Three different headings for one kind of section.**~~ **Done, 8 Sep
  2026.** Everything in the drawer's second column is the same kind of thing —
  a titled section about the task, collapsible, remembering whether it was
  left shut — and the three of them drew that title three ways. AI processes
  came with the shared package's `aic-field`, half a point smaller and a shade
  fainter than its neighbours; Jira tickets was a plain `div` that could not be
  collapsed at all; the rest were `field sugg`. `sideSection()` in
  `kanban/js/19-drawer.js` is now the one shape all six go through — the rule
  above, the summary that collapses and remembers, the count when there is more
  than one — and what differs between them is what goes inside, which is the
  part that should differ. The cards inside AI processes are still the shared
  package's own; only the heading around them changed. Asserted in
  `kanban/test_projects.mjs`: every child of `.dcol-side` is either the rule or
  a `details.field.sugg` with its own summary.

- ~~**The project drawer names a folder and then refuses to say what is in
  it.**~~ **Done, 8 Sep 2026.** The open decision was settled the way it was
  posed: **one level deep**. `project_entries()` in `kanban/server.py` lists
  a folder's own children and stops, and a sub-folder comes back as a single
  row carrying its own count — `sources/ · 3 items` — rather than its
  contents, so a project filing its documents one level down shows one row
  instead of ten and the row itself is the way in. It is served by a new
  `/project.json?name=<folder>` rather than folded into `/projects.json`: the
  Projects tab needs a count and nothing else, and shipping every folder's
  file list to draw it would be the whole of `data/projects/` on every render.
  `loadProjectFiles()` in `kanban/js/19-drawer.js` fetches it after the panel
  is already up and paints the rows as links into `/data/projects/<name>/`,
  which `translate_path()` was already serving; the folder path above them is
  now a link to the folder itself, and the browser's own directory listing is
  what answers for anything deeper. Two things fell out of building it: the
  handler now serves `.md` as `text/plain`, since macOS has no mapping for it
  and every link into a project folder was saving a file to Downloads instead
  of opening it; and the view finally has the `kanban/test_projects.mjs` the
  entry below it asked for, 31 checks over both halves, blocked list asserted
  empty.

  Reworked the same day, after seeing it: the border came off the folder path,
  which was the one thing on screen with nothing inside it, and went round the
  file list instead, where it says where the folder stops. The path is now the
  caption under a "Files in this folder" heading, the task list got its own
  ("Tasks on this project"), and the help line that had been floating between
  them is gone. Above both, the panel now opens with what the project *is*:
  `project_about()` in `kanban/server.py` reads the H1 and the lead paragraph
  out of the folder's own `CLAUDE.md`, dropping the two sentences every one of
  them ends on ("this folder is the context", "the tasks live in
  ../../todo.md") because both are filing rather than description and the
  drawer shows those tasks itself. No frontmatter was added to do it — every
  project `CLAUDE.md` the PA has written already opens the same way, and that
  shape is the metadata. It also picks up the "Opened 26 Aug 2026." line those
  files carry, which is the only start date a project folder has.

  Last edited needed nothing new either: `project_meta()` already took the
  newest mtime across the folder and everything directly in it, so a file
  edited two levels down still counts (writing it bumps its own folder, and
  that folder is one of the entries). It now shows as "Edited yesterday" under
  the description and on every card in the Projects tab, alongside the same
  one-line description. Nothing has to be written or maintained for either to
  stay true, which is why there is no "last edited" line in `CLAUDE.md` for
  anyone to forget to update.

- ~~**A task's bucket dropdown shows no colour.**~~ **Done, 7 Sep 2026.** The
  drawer's "Bucket" field is a custom button-plus-popover dropdown now
  (`#f-bucket-btn`/`#f-bucket-menu` in `kanban/js/19-drawer.js`, reusing the
  header's own `.dropdown`/`.dropdown-panel`/`.dropdown-item`), each option
  carrying the same coloured dot the bucket filter pills draw, from
  `bucketColor()`. The "Move its tasks to" select in `08-buckets.js` was left
  as a native select — it wasn't the one asked for, and it doesn't lead with
  colour the way this field does.

- ~~**Dragging an undated card onto the timeline shows no target line.**~~
  **Done, 7 Sep 2026.** `scroll.ondragover` in `wireTimelineDrag()`
  (`kanban/js/18-timeline.js`) now shows a dashed vertical line (`.tltarget`)
  at the day under the pointer, plus the same `showTlPopover` date tooltip a
  bar drag already uses, both cleared on drop, drag-leave or drag-end.

- ~~**Timeline lanes have no sort control.**~~ **Done, 7 Sep 2026.** Each
  lane header carries a "Sort by date" button (`sortTimelineLane()` in
  `kanban/js/18-timeline.js`), writing `tlrank` in earliest-date order —
  `start:` where it exists, else `due:` — the same field a grip drag already
  sets one row at a time. A one-off sort, not a standing rule: a later drag
  on any row overwrites its own rank same as before.

- ~~**The night agent's first full batch spent the whole night on one
  bucket.**~~ **Done, 5 Sep 2026** (`dcbc109`). Found on the first real
  24-task run — Design System is 13 of the 24 and sorted first, so all 10
  plans the budget paid for were DS and three buckets got nothing. `in_order`
  in `agents/night_agent/pick.py` now sorts on the board's own order, headline, date, then
  impact against effort — bucket is not a key at any level, so a short night
  interleaves instead of draining one bucket before the next starts. Also
  settles the open question of whether DS wants splitting into five streams:
  the ordering was the real cause, not the bucket's size.

- ~~**A plan whose agent wrote no `summary:` lists as `[fill in]`, and the
  file itself is worse than the symptom shows.**~~ **Done**, alongside the
  fold/hold work in `f540acd`. `write_plan` in `agents/night_agent/plan.py` now strips the
  agent's own frontmatter entirely and writes one rebuilt block, so there is
  never a placeholder header sitting in front of a real summary two blocks
  down. A missing summary now reads plainly as "The agent wrote no summary
  line" rather than reusing `[fill in]`, which used to mean two different
  things.

- ~~**The nightly budget is set from figures four times too low.**~~
  **Done — closed, 7 Sep 2026.** `NIGHT_AGENT_BUDGET`
  in `agents/night_agent/plan.py` is $12, chosen against two runs that cost $0.29 and
  $0.67. The first full batch averaged $1.23 across 10 plans and stopped on
  budget with 14 left. The whole 24 is around $30. $12 is a defensible ceiling,
  but it should be set against $1.23 rather than against $0.48.

  **Decided, 5 Sep 2026: leave it at $12.** Cost is already logged per plan and
  per night in `data/<dataset>/plans/night-agent.log` (`agents/night_agent/plan.py`'s own
  `log()` calls), so there's a real record to assess the ceiling against once
  more nights have run, rather than resetting it on two nights' figures.

- ~~Message suggestions and Prompt suggestions disappeared when empty.~~
  **Done, 4 Sep 2026.** `suggestionSection` in `kanban/index.html` no longer
  returns `''` for an empty list — it renders the section with a one-line
  empty state instead (a plain `<p class="empty">`, the same class other empty
  states in the app already use), so a task's shape in the drawer no longer
  shifts depending on whether anything's in them.

- ~~The suggestion-shaped section headlines and the Dependencies sub-labels
  looked identical.~~ **Done, 4 Sep 2026.** In the drawer, "Dependencies",
  "Message suggestions", "Prompt suggestions", "Meeting agenda" and "Jira
  tickets" were rendering in `--ink-faint`, too low-contrast against a dark
  panel for a heading. They're full `--ink` now, scoped to `.sugg` so ordinary
  field labels (Title, Status, Notes...) keep their original weight. And
  `.deplabel` ("Waiting on" / "Blocks" under Dependencies) used the exact same
  rule as the "Dependencies" heading above it — now one visible rung down:
  smaller, lighter weight, tighter letter-spacing, 80% opacity.

- ~~**Nothing could put a desktop notification on screen except the morning
  briefing.**~~ **Done, 5 Sep 2026.** The companion is the only process here
  that can, so it is now the pathway rather than only a user of it:
  `companion/notify.py` appends to `data/<dataset>/notify-queue.json` and the
  companion drains it on its next tick. Same shape as `attach-queue.json` — a
  JSON array anything appends to, drained by the one thing that can act on it.
  It holds anything queued outside 08:30–20:00, so the night agent finishing at
  02:00 is heard about in the morning instead of at 02:00. It does *not* hold for
  weekends and holidays, unlike the morning briefing: that one is a scheduled
  interruption about a working day, this one answers something that just
  happened. The night agent is its first caller.

- ~~A card limit per column, with a "load more" at the bottom.~~ **Dropped,
  5 Sep 2026.** Would have interacted badly with drag-and-drop — dropping past
  a hidden tail card doesn't land where the board's own drop-position logic
  says it should. Not worth the risk on a view that autosaves in seconds.

- ~~**Schedule should be part of Plans, not a view of its own.**~~ **Done,
  6 Sep 2026.** Token windows landed as its own column on 5 Sep; "What runs on
  a clock" was the piece left, and the open question was where — a fifth
  column, or folded under something that already exists. Decided: folded under
  **In flight**, since it changes only when the plist itself changes, which is
  rarely, and five columns was a lot for a view whose middle three are usually
  short.

  `renderScheduleView()` in `kanban/js/14-schedule.js` is gone, replaced by
  `renderSched()` — the same job-list rendering, minus the wrapper it used to
  build a whole view out of. `kanban/js/13-plans.js` calls it alongside
  `renderQueue()`/`renderNightAgent()`/`renderUsage()` and nests its output in a
  `<details class="ufold">` under the In flight card. The `schedule` view id,
  the `#schedule` fragment, and the Schedule button all came out of
  `kanban/js/18-timeline.js`, `25-archiving.js` and `index.html` — nothing
  routes to a standalone Schedule any more. `kanban/test_schedule.mjs` now
  drives Plans instead and asserts on the two migrated cards directly.

  **Except the card is not under In flight yet.** The view retired, the button
  went and `renderSched()` replaced `renderScheduleView()`, but the `<details>`
  holding "What runs on a clock" is still nested in the **Token windows** card
  in `kanban/js/13-plans.js` rather than the In flight one. The test was written
  against the decision rather than the markup, so it fails on exactly this and
  nothing else — which is the right way round, and the one check left to make
  pass. Moving the `<details>` between the two card strings is the whole fix.

- ~~**The top-right header is a flat row of buttons and dropdowns**~~ **Done,
  5 Sep 2026.** Undo, Download copy, Backups, Schedule and the dataset switcher
  were five always-visible controls under two separate labels ("Data", "List");
  they're now one `Data ▾` button opening a small panel (`.dropdown` /
  `.dropdown-panel` in `board.css`, wired in `kanban/js/25-archiving.js`) that
  closes on picking an item, clicking elsewhere, or Escape. The dataset
  `<select>` sits inside the same panel under its own divider row rather than
  as one more item — it's a pick, not an action. Same ids throughout, so
  nothing else that reads `#undo` / `#download` / `#backupsBtn` /
  `#scheduleBtn` / `#datasetSelect` had to change. Schedule's entry in this
  menu goes away on its own once the Schedule view retires (see the entry
  above).

  The filters row (AI can do, Urgent/due, search) moved too, off the header
  entirely and down onto the bucket strip's own row, alongside the bucket tabs
  and the column/bucket edit icons — one row doing view-scoping instead of two.
  The header itself is now just the title, the view tabs, status and the Data
  menu. `.filters` as a header-only section is gone; the bucket strip
  (`.bucketbar`) already had the same flex layout, so the same markup just
  moved down a level.

Otherwise nothing standing. The three entries that were here are done, and what
they settled is written up in the README rather than left here:

- A task in the companion's menu opens that card. The fragment carries both now
  — `#<view>!task=<key>` — the view segment doing exactly what it did before and
  the task segment opening a drawer over whatever is showing. It is the fragment
  rather than a query string on purpose: a link differing only after the `#`
  raises the tab that is already open instead of giving a second tab on one list.
- The companion knows the holidays, UK and Portuguese both, so a day off is
  quiet and the menu names the holiday and its country rather than just going
  silent. They are generated from the rules rather than kept as a table, so
  there is no year for the list to run out in, and `test_todo.py --online`
  re-checks them against gov.uk and Nager.Date.
- One `repeat:` grammar, in `core/todo.py`. `check_todo.py` imports it straight
  from the repo, and `core/test_todo.py` still holds the board's own answers as a
  frozen table, so the JavaScript third copy cannot drift either.

- ~~**`index.html` is 9,600 lines and the format has no test of its own.**~~
  **Done, 5 Sep 2026.** Two lifts, and the page is 7,500 lines:

  - `kanban/board.css`, the whole stylesheet. A pure move: one `<style>`,
    nothing generating or rewriting CSS anywhere in the file. Reassembling the
    two halves gives back the original byte for byte, which is how it was
    checked.
  - `core/todo.js`, the format itself — parsing, serialising, sub-steps,
    suggested messages, `repeat:`. It went to `core/` rather than staying in
    `kanban/` because it is what `core/todo.py` is a port of, and a copy is
    easier to keep honest when you can see both at once.

  The test is the part that was actually missing. `core/fixtures/` now holds
  the three tables — `repeat.json`, `messages.json`, `parse.json` — and
  `core/test_todo.py` and the new `core/test_todo.mjs` both read them, so the
  grammar is written down once and checked in both languages. `test_todo.mjs`
  runs `todo.js` in a `vm` context: no browser, no server, nothing it could
  write to.

  Writing `parse.json` turned up three real divergences, all on input nothing
  would ever produce, which is why they had gone unnoticed: `****` as a title,
  `rank:` with characters after the number, and a numbered bucket below the
  Context section. The board is the authority, so `todo.py` moved in all three.

## Big

- **Archiving finished work may not be worth having at all, and it is hidden
  behind a constant until that is decided.** `ARCHIVE_CHIP_HIDDEN`
  (`kanban/js/25-archiving.js:39`) takes the "Archive N finished" button out of
  the header on every view; `archivable()` (`:24`), `archiveOldDone()` (`:70`)
  and the `ARCHIVE_DAYS` threshold of 30 (`:15`) are all untouched underneath
  it, so the decision is which way to go rather than what to unpick. The case
  against keeping it: on the twinkl list it currently offers to move four
  tasks, which is not a list under any pressure, and moving anything out of
  `todo.md` buys a second file that every count then has to read back in —
  `parseArchiveEntries()` (`kanban/js/12-reports.js:120`) and
  `completedRecently()` (`:165`) exist only to rejoin the two, and
  `check_todo.py` has no archive reader at all, so the Python side already sees
  a partial list. The case for: nothing prunes `done-archive.md`, so it is the
  only record that outlives the rolling backups, and a list that does grow has
  no other way to shed a year of ticked work. Deciding it means either deleting
  the feature and the two readers with it, or raising `ARCHIVE_DAYS` to
  something that only fires when the file is genuinely long and dropping the
  constant.

- **The board has no component layer, so the same column is written twice and
  every view redraws by replacing `innerHTML`.** 13,972 lines across 28 classic
  scripts in `kanban/js/`, 463 top-level functions in one global scope, no
  `package.json` and no build step. The Board draws `.col`
  (`kanban/board.css:691-730`) from the single place that emits it,
  `kanban/js/18-timeline.js:987`; Plans and Execution draw
  `.listcard reportsview` plus one of four state classes, written out longhand
  in both `kanban/js/13-plans.js:1273` and `kanban/js/27-execution.js:252`. So
  the three boards the README calls one shape are one shape in the model and
  two in the CSS, and the dashed edge on Waiting for review exists twice, as
  `.col.aicol` and as `.agentcol`. The comment above `runItemHTML()`
  (`kanban/js/27-execution.js:58`) is honest about the rest of it: Plans and
  Execution share the markup rather than the function, which keeps one
  stylesheet answering for both and leaves two functions to keep in step.

  A port can be incremental because every view already owns `#lists` wholesale
  — `renderExecutionView()` (`:249`) and every sibling open by assigning to
  `$('#lists').innerHTML` — so a new renderer can mount into one view while the
  other nine carry on untouched, and the work can stop at any stage with a
  working board. React with Vite and TypeScript is the choice that converges
  this with `ai_canvas`, at the cost of a build step that `run.command` would
  have to run before starting the server, since it and `To-Do Board.app` bundle
  nothing today. Preact with `htm` keeps the no-build property and gives up the
  tooling. That decision is the one thing this entry is holding.

  Order, if it goes ahead: a round-trip fixture over a whole `todo.md` in both
  languages first, since `core/fixtures/` covers the grammar and not the
  document; then a real token set, and one column and one card primitive built
  on it, which pays off on its own; then the leaf views, `26-projects.js`
  (131 lines), `15-backups.js` and `16-backup-preview.js` (224), `17-matrix.js` (285),
  `27-execution.js` (292), `14-schedule.js` (348); then `13-plans.js` and
  `12-reports.js`; then the board, drawer and canvas last, 3,100 lines between
  `18-timeline.js`, `09-columns.js` and `19-drawer.js`; then the global `state`
  object in `02-state.js`, which today makes every mutation responsible for
  remembering which `renderX()` to call. `kanban/server.py` can be left where
  it is: 2,250 lines behind a 26-branch dispatch in `do_GET`/`do_POST` is ugly
  and not dangerous, and the suites drive it.

  The token set is its own piece of that and the one to do first, because every
  primitive above is written against it. `board.css:1-21` holds 31 semantic
  variables in `:root` and 25 of them again under
  `@media (prefers-color-scheme: dark)`, which is a good start and is missing
  three things. There are no primitives under the semantics: `--accent` is the
  literal `#2f6feb` rather than a step on a blue ramp, and the ten bucket
  colours `--b1` to `--b10` are twenty hand-picked hexes across the two themes
  with no ramp behind them and nothing saying they are a set. Six of the
  thirty-one are never redefined for dark at all — `--accent`, `--accent-ink`,
  `--agree`, `--agree-ink`, `--reject` and `--reject-ink` — so the light blue
  sits on the `#14161a` panel unchanged, which is a contrast bug the theme
  block looks like it already covers. And only colour is tokenised: the
  stylesheet carries 16 distinct literal `font-size` values, 12 distinct
  `border-radius` values and 88 distinct `padding` declarations, so every
  spacing and type decision is made at the point of use. What this wants is a
  two-layer set in the shape the design system already uses — primitives as
  ramps, semantics aliasing them per theme — covering colour, spacing, radius,
  type and the shadow scale, with the bucket colours generated off one ramp
  rather than picked. It is the piece most worth doing whether or not the port
  ever happens, and the piece that makes the port's primitives cheap.

  One piece does not depend on any of the above and is worth doing first. The
  board guards a save with mtime and the conflict modal, both in the tab;
  `agents/night_agent/plan.py` guards the same file with `file_hash()` before a
  batch and after every task. Both real overwrites of the live list got past
  the tab-side guard. If `PUT /data/todo.md` carried the hash the tab last read
  and `do_PUT` (`kanban/server.py:2083`) refused a mismatch, the check would
  sit in the one place every writer passes through.

  Whenever this is picked up it runs on its own branch off `main`, never
  directly on it, and it is a weekly-allowance-sized spend rather than an
  evening's.

- **Every agent here is rationed by an allowance none of them can read, and the
  only way to read it headlessly is a throwaway terminal.** `core/windows.py`
  reconstructs the five-hour windows from `~/.claude/projects/*/*.jsonl`, and
  `record_limit()` (`agents/night_agent/plan.py:325`) says in its own docstring
  that `limit_tok` is "the one measurement of the session allowance this machine
  can make" — a floor revised upward by being refused, never a figure. So the
  batch loop at `:733` gates on `expiry` alone: it asks how long the window has
  left and never how full the account is, which are the two halves of the
  question that decides how much work a night can carry.

  Measured on 11 Sep 2026, the official figure is absent from everything an
  unattended process can reach. Not in the transcripts, not in any of the 34
  hook events, and not among the 25 keys a `claude -p --output-format json` run
  returns. `~/.claude.json` holds `cachedUsageUtilization` with
  `utilization.five_hour.utilization`, but a headless run does not refresh it —
  it read 76 minutes stale at 11% while the live figure was 32% — so it is a
  cache only an interactive session fills. The `Usage for Claude` app on
  `127.0.0.1` answers `/session` with a `percentUsed` that does track, but it is
  the app's own derivation and lags by minutes. The one authoritative source is
  Claude Code's `statusLine` payload, which carries
  `rate_limits.five_hour.used_percentage` and `seven_day` straight from the
  server, and which a headless run never fires because a status line is screen
  furniture. What works is giving Claude Code a terminal to draw into: a pty, a
  real session with its own throwaway `statusLine`, one word sent, `rate_limits`
  caught, session killed. About 17 seconds and one Haiku call. A working
  implementation sits outside the repo at `~/.claude/usage/`, with the
  leaked-epoch (#52326), rollover and tombstone guards taken from
  `claude_monitor/output/official.py`, and two traps worth keeping: it must run
  from a directory Claude Code already trusts, or the trust prompt appears
  instead of a session, and the pty must be drained throughout or the TUI blocks
  on write and never reaches its first API response.

  This is not the night agent's to own. `improve_agent` and
  `agents/night_agent/` are two claimants on one allowance and a third would be
  a third, so the harvester belongs in `PACKAGES/` by the rule in
  `~/Code/CLAUDE.md` — anything two apps depend on moves there — and each agent
  reads it rather than carrying a copy. Two decisions before it can be built.
  What an agent does with the number: advisory, with `core/windows.py` staying
  the gate, or authoritative, in which case a night that cannot harvest has to
  choose between declining to start and running blind. And where the reading is
  written: `limit_tok` and the window state are one file today, and a percentage
  sampled twice a night is a series rather than a state, so it either grows into
  a small log beside the plans or it overwrites and keeps only the last night.
  The API call is what forces that shape — it makes the harvest a once-per-batch
  reading rather than a per-task one, so it cannot catch a window filling up
  mid-night.

- **The board can start a conversation about a task but not about the list, so
  every PA sitting means leaving it for a terminal.** `newChat()`
  (`kanban/js/10-reference-sections.js:1048`) mints an owner key on a task and
  hands it to `chat.openNew()`, and `Runner.run()`
  (`PACKAGES/ai_chat_engine/engine.py:472`) shells `claude -p <prompt>` in the
  configured cwd — so `/pa-checkin` typed into that modal would run today, and
  what is missing is a chat that belongs to the board rather than to one card,
  plus somewhere in the header to open it. The decision it is waiting on is the
  writer rule: `todo.md` has exactly one writer, and a PA turn is a second one
  firing inside a tab whose `autosaveTick()`
  (`kanban/js/24-autosave-watching.js:38`) is four seconds from overwriting
  whatever it just wrote. `watchTick()` (`:47`) already covers the shape of it,
  reloading quietly on an outside change and asking only when the tab has
  unsaved work of its own, so the choice is between trusting that and setting
  `state.locked` for the length of the turn — the harder, safer option, since a
  lock cannot lose an edit and a race can. Which of the ten `pa-*` skills are
  reachable this way is the second question: `pa-checkin` and `pa-checkout` are
  sittings that suit a panel, `pa-mobile` has no business here at all.

- ~~**The companion is a menu, and a menu is why the plans half had to come
  back out of it.**~~ **Done, 10 Sep 2026.** Rebuilt as an Electron app —
  `companion/src/main/`, `preload/`, `renderer/` — with the small portrait
  window this entry called for: the night's plans still unread or read, then
  the one thing, then overdue, then due today, then the message suggestions,
  each a link into the board exactly as decided. A tray icon toggles it and
  survives it closing; right-click gives Open the board and Quit.
  `companion/app.py` is retired outright, and the three things in it that
  weren't about the menu — the once-a-morning notification, the notify
  queue's time gate, the dismissed-messages state — moved across.

  One deviation from what this entry proposed: the policy the window needs
  (effective due dates, `blocked-by`, message extraction, the UK/PT holiday
  calendar) stayed in Python rather than being ported to JavaScript, because
  it already lives in exactly one place on purpose — `core/todo.js` says as
  much about the holiday calendar specifically — and porting it would have
  made a second copy of exactly the thing this repo's format rules exist to
  prevent. So `digest.py` gained a `--json` mode, and the Electron main
  process shells out to it once a tick instead of re-deriving that policy
  itself. Everything else the window needed — plans, the notify queue, its
  own state — had no format of its own to duplicate, so those are read
  straight off disk in TypeScript. See the README's "The desktop companion"
  section for how it's actually built.

- **A report he defines once cannot be written down anywhere, so every written
  report is typed fresh from a prompt and comes out a slightly different shape
  each time.** The Reports view's second column reads `data/<dataset>/reports/`
  through `report_listing()` (`kanban/server.py:1305`) and `report_meta()`
  (`:1255`), which parse the frontmatter — `title`, `date`, `covers`, `topic`,
  `summary` — off whatever Markdown file happens to be in the folder; the empty
  state says as much in as many words, "asking Claude for one is how they get
  there" (`kanban/js/12-reports.js:630`). So the output has a home and a format,
  and the *input* has neither: the rules live as prose in README.md under "Rules
  for writing a report", the period, the buckets and the question are re-stated
  in the prompt every time, and there is no `pa-report` among the nine skills in
  `agents/pa_agent/skills/`. The shape to copy already exists one folder over —
  `agents/pa_agent/skills/pa-mobile/templates/` is one file per report kind, with
  its own README saying "adding a file here is the whole of adding a report
  shape", and `pa/references/templates.md` documenting the fields — except those
  produce phone messages off the live list rather than a written report about a
  period, and they are the templates the entry below already says nothing
  executes.

  So a definition file per report — the window, the buckets it covers, the
  questions it has to answer, the sections it comes out in — plus a pass that
  renders one on a schedule. They live in `data/<dataset>/reports/_defs/`, one
  file per report kind: private and per-list, which is what a definition naming
  Twinkl processes has to be, and beside the output it produces rather than in a
  folder of its own. The underscore is what keeps them out of the listing —
  `report_listing()` (`kanban/server.py:1305`) sweeps that directory for `.md`
  and would otherwise show every definition as a report, so it skips names
  starting with `_` and skips the subfolder itself, which it already does by
  only reading files.

  What the pass reads is the other half, and it is not a free choice: the
  arithmetic behind "what got done between these two dates" exists in
  JavaScript only — `completedRecently()`
  (`kanban/js/12-reports.js:162`) and `parseArchiveEntries()` (`:130`) are what
  join the live file to `done-archive.md`, and the Python side has no archive
  reader at all (`check_todo.py:52` names the archive only as a file to ignore).
  That is the same gap the `core/render.py` entry below already argues for
  filling once in `core/`, with `check_overdue()`
  (`agents/pa_agent/skills/pa/scripts/check_todo.py:638`) and `select()`
  (`agents/night_agent/pick.py:278`) as the two half-written copies to fold in —
  this wants the same aggregation pointed at a past window rather than at today,
  so the two entries should be built as one piece of work or not at all.

  Where it runs is the easier half. A weekly render is unattended work on a
  budget, which is `agents/night_agent/`'s machinery — the clock and lock gates
  in `run.sh`, the window arithmetic in `core/windows.py` — but not its contract:
  `eligible()` (`pick.py:82`) only ever yields open `ai:full` tasks, and a report
  is about finished ones. It is a pass of its own, the way the briefing entry
  below also concludes, firing on one night a week rather than every night, and
  writing only into `reports/`. `todo.md` is not in reach for it, same as
  everything else that runs while he is asleep.

- **Creating a list already works; what it produces is a shell nothing else on
  the board knows how to use.** `createDataset()`
  (`kanban/js/21-datasets.js:48-58`) prompts for a name, posts it to
  `/datasets`, and `create_dataset()` (`kanban/server.py:394`) writes one file:
  a `todo.md` holding `NEW_DATASET_TEMPLATE` (`kanban/server.py:384-391`), which
  is `## 1. Tasks` and the four standard columns, empty. Everything that makes a
  list actually work is left unmade and undocumented — `people.md`, which
  `CLAUDE.md` calls the source of truth for who is who; the Context section at
  the foot of `todo.md`; and, since 8 Sep 2026, `buckets/<stream>/<stream>.md`
  plus the `buckets/README.md` saying which buckets the list has. Worse, a
  bucket heading invented at the prompt is invisible to `STREAMS`
  (`agents/night_agent/plan.py:53-72`) until someone edits that table by hand, so
  every task in the new list plans against the `general` fallback and logs
  loudly for it — which is how `personal` has behaved since it was made. What
  this wants is a sequence rather than a prompt: ask for the buckets as well as
  the name, scaffold the briefs from the template in `BUCKETS.md`, and write the
  `README.md`.

  `STREAMS` goes away rather than moving. The only work that table does is
  bridge a shorthand heading to a descriptive filename — `ds` to
  `design-system`, `bau` to `work-oversight` — and the other three entries map a
  heading to itself. So `bucket_stream()` slugifies the heading instead: strip
  the leading number, lowercase, and that is the stream. `3. DS` becomes `ds`,
  `2. BAU` becomes `bau`, and the two files that no longer match get renamed to
  match — `plan-design-system.md` to `plan-ds.md` and `plan-work-oversight.md`
  to `plan-bau.md`, with `buckets/design-system/` and `buckets/work-oversight/`
  renamed alongside them and the `.claude/agents/` symlinks repointed once.
  After that a new bucket needs nothing written down anywhere: the heading is
  the stream, and a new list needs only its own planner files, which a new
  stream needed regardless of where the mapping lived.

  What is lost with the table is the whitelist half — an unmapped heading used
  to reach `general` and log loudly, which is how a renamed bucket got noticed.
  A slugified heading always resolves, so the loud log moves to the missing
  file instead: `bucket_agent()` naming a `plan-<stream>.md` that is not on disk
  is the same signal one step later, and it is a stronger one, since it names
  the file to create rather than a table row to add.

- ~~**The Done column on Plans holds six states that ask two different
  questions, and only one of them is "read this".**~~ **Done, 10 Sep 2026.**
  Built as described. The Done card is two cards now — **Inbox**, carrying
  unread, folded and read, and **Decided** to its right, carrying agreed, redo
  and actioned — so the Plans view is five tracks rather than four
  (`.lists.pview` in `kanban/board.css`, `repeat(4, minmax(330px,1fr))` plus
  the Token Session track, `min-width` up from 1452px to 1796px).

  `PLAN_FILTERS` split into `INBOX_FILTERS` and `DECIDED_FILTERS`, and
  `planStatusFilter` into `inboxFilter` and `decidedFilter`, so a chip picked
  in one column no longer resets the other. Which column a plan is in is
  decided by status rather than by chip — `DECIDED_STATUS` is the set
  `agreed`/`redo`/`actioned` — which is what settles the one case the entry
  did not name: a folded plan that has been sent back sits under redo rather
  than staying in the Inbox asking a question already answered.
  `renderPlansList()` is now two functions that always draw together, since a
  status change moves a card from one column to the other, and the grouping
  each column keeps is exactly what the single list already did —
  `planItemHTML()` untouched, agreed lifted into `.planagreed`, actioned
  folded shut, redo between them. `planFilterBarHTML()` takes its filter list
  and current key as arguments, and `wirePlanColumn()` wires one container's
  chips and rows, so neither column can see the other's clicks despite sharing
  `data-planfilter`.

  `kanban/test_plans.mjs` moved its agreed/redo/actioned assertions onto
  `#plansDecided` and gained four: that the Inbox holds nothing already ruled
  on, that an emptied Inbox says so rather than going blank, that the six
  headings read left to right in order, and that the two chip rows keep their
  filters independently. 72 checks pass. Checked against the running board on
  the real plan list too: 24 plans split 17 Inbox / 7 Decided, chips counting
  per column.

- ~~**The improvements in this file are read and built by hand, one at a time,
  while the to-do list beside it has a whole agent working its backlog
  overnight.**~~ **Built, 8 Sep 2026 — and not in this repo.** It serves every
  repo here that keeps an `IMPROVEMENTS.md`, so it lives at the root of `~/Code`
  as `improve_agent/` rather than inside `agents/` beside the night agent. Four
  repos have one today and only this one calls its sections `## Small` and
  `## Big`, so the headings are a per-repo setting, guessed on discovery and
  corrected on a dashboard — which is also where each repo is switched on and
  given its own hours. This repo is the only one switched on.

  Most of what this entry predicted held. The picker was replaced by a parser
  over the `- **` bullets, the two rules moved into a shared reader
  (`improve_agent/improve/reader.py`) that `skills/personal/improve-list` now
  points at rather than restating, output is a branch a night with one commit
  per entry carrying the strikethrough alongside the change, and a build whose
  tests fail stays on the branch with the failure named. The window arithmetic
  came across as a deliberate copy rather than an import: `core/windows.py`
  reaches into `agents/night_agent/paths.py`, and the hours are a per-repo
  setting over there where they are a constant here.

  Three things were decided differently once it was real. The agent gets **no
  Bash tool at all** — Read, Grep, Glob, Edit, Write and nothing else — which is
  how the harness holds the tab-lock rule rather than trusting an agent to: it
  cannot run a suite, so the board suites are simply not in the configured test
  list, and the four that are safe run from the harness afterwards. It is
  **confined to the repo it is building in**, with no `--add-dir ~/Code`, since
  read access it could write through is not worth the blast radius on something
  holding write tools. And the **clean-tree check** turned out to be the load
  bearing one: it licenses the single hard reset in that codebase, because if
  nothing was uncommitted when the run began then everything uncommitted
  afterwards is what the agent just wrote.

  The prompt's first instruction is to check whether the entry is already built,
  which was added after finding four entries in the Big list below describing
  work that shipped weeks ago and was never struck through. `already-built` is a
  real outcome and it changes nothing.

  What the entry originally argued, kept because it is the reasoning the thing
  was built from: `agents/night_agent/` picks tasks by rule, spends only in a usage
  window that expires before 07:00 (`core/windows.py`), skips anything whose text
  has not moved since it was last reached (`ledger[task.title]`,
  `agents/night_agent/plan.py:684-690`) and writes a plan per task. Most of that
  machinery is generic and points at this file with nothing new: the clock and
  lock gates in `run.sh`, the window arithmetic, the per-task budget and the
  twenty-minute floor all survive as they are, and only the picker is replaced,
  by a parser over the `- **` bullets under `## Small`. The two rules that parser
  needs are already written down once, in `skills/improve-list/SKILL.md`, which
  skips an entry starting `~~` as done and tags one whose own prose asks for a
  decision before anything can be built. They move into a shared reader rather
  than being described in a second place.

  What separates it from the night agent is that this one can finish the work.
  That agent proposes because its subject is `todo.md`, where `pa` is the only
  writer and a mistake is unrecoverable. Here the subject is code in a git repo,
  git is the undo, and this file's own definition of Small, a sitting change with
  no new data model or view, is already the size an unattended agent can close.
  Output is a branch per night, one commit per entry carrying the strikethrough
  edit to this file alongside the change itself, so `main` keeps saying only what
  has actually shipped. A build whose tests fail stays on the branch with the
  failure named rather than being dropped, since a fix most of the way there is
  worth more than a clean slate. The suites are what gate a commit at all:
  `core/test_todo.mjs` and `core/test_todo.py` are free to run, the five board
  suites need the server up and headless Chrome and have to be held to the
  tab-lock rule in `CLAUDE.md` by the harness rather than by the agent's good
  intentions, and an entry touching `kanban/server.py` can be written but never
  restarts the running process, so that class is reported to him rather than
  claimed as done.

  The view is the Plans view with its sources swapped. `renderPlansView()`
  (`kanban/js/13-plans.js:1232`) already draws Backlog, To do and Done beside a
  fourth column for the agent's own state, and four things about it change.
  Approval runs the other way: in Plans everything eligible is queued by rule and
  `holdTask()` (`:834`) is the only way to say no, whereas nothing here gets
  built unless it is dragged into the queue, which turns `queue-order.json` from
  an ordering plus a hold list into an explicit build list and makes reusing that
  format verbatim the obvious mistake. Done reads git rather than a status field,
  since merged is `git branch --merged main` and not something anyone maintains,
  the same principle as the Projects panel reading a folder's newest mtime
  instead of a date someone types (`kanban/js/26-projects.js`). There is no Merge
  button to begin with, because that is a server route running `git merge` and
  `kanban/server.py` does nothing of the kind today. And the state cannot sit at
  `data/<dataset>/plans/queue-order.json` the way the night agent's does, because
  this file is not dataset-scoped: `data/build/`, beside the datasets and
  gitignored the same way, holds the queue, the ledger, and one `index.md` a
  night listing everything attempted, what the diff touched, which suites ran,
  what they said and which branch it is sitting on.

- **Every place that hands a task to an assistant re-derives its own
  understanding from the same chaotic notes field, and none of them leaves
  behind anything the others could reuse.** `newChat()`
  (`kanban/js/10-reference-sections.js:927`) seeds a fresh chat with
  `taskDescription()` — `t.title + '\n\n' + notes` (`:922`) — and `notes` is
  whatever `bodyParts()` (`kanban/js/06-dates-substeps.js:110`) didn't
  recognise as a sub-step: free prose interleaved with tag lines, dates and a
  `- Project: data/projects/<name>` pointer (`:79-93`), never written to be
  read as a briefing because nothing about the format asks it to be. The
  night agent hits the same field and does something different with it:
  `build_prompt()` (`agents/night_agent/plan.py:199`) pastes `task.raw` plus
  the same `body` verbatim into its own prompt, on the stated belief that a
  paraphrase is exactly the context that gets lost — right for an agent
  spending ten minutes researching, and no help to a person opening a chat
  who wants to know in five seconds where this stands. A third consumer,
  `pa` grooming a task in conversation, does the same reading by hand a
  third way and writes nothing back either.

  What's missing is a middle step: a generated briefing — direction, what's
  done, what's still needed — read off the task's raw text, tags, bucket and
  project note the way `build_prompt()` already gathers them, but written to
  explain rather than pasted verbatim. Once it exists it has three
  consumers, not one: `newChat()`'s seed instead of raw `notes`, an addition
  to (or replacement for) the verbatim block in `build_prompt()`, and
  something `pa` can produce or refresh while grooming, so a task groomed
  today already carries its briefing when Tonight's batch or tomorrow's
  "New chat" reaches it.

  It is cached rather than generated on the click — "as soon as I hit New
  chat, that summary is ready" rules out a live model call in the critical
  path. It lives in a side file per dataset, `data/<dataset>/briefings.json`,
  keyed by slug and carrying the fingerprint that produced it: the same shape
  `attach-queue.json`, `canvas.json` and `sessions.json` already use, which
  keeps generated prose out of the file he hand-edits and out of the
  one-writer rule entirely. Staleness is `pick.fingerprint(task)`
  (`agents/night_agent/pick.py:71`) against the stored one, the same hash
  `ledger[task.title]` (`plan.py:684-690`) already uses to know a plan has
  been overtaken.

  The night agent writes it, but not as a by-product of planning, because it
  never sees most of the list: `eligible()` (`pick.py:82`) drops everything
  that is not an open `ai:full` task, so a pass riding along with the planners
  would brief a tenth of the board. It is a pass of its own, before the
  planning batch, with a skill of its own — one cheap call per task whose
  fingerprint has moved, over every open task regardless of its `ai:` tag,
  and nothing at all for the ones that haven't changed. That keeps it inside
  the machinery that already has a budget, a usage window and a lock, and it
  means a task edited today is briefed by morning rather than at the moment
  it is clicked.

- ~~**A task's tags are scattered across a dozen separate fields, so there is
  no one place that shows what is actually applied to a task, and one whole
  class of tag has no field at all.**~~ **Done, 9 Sep 2026.** Built as
  described: `tagsSection()` (`kanban/js/19-drawer.js:482`, drawn at `:760`)
  lists every applied tag as a chip in the second column, `t.extra` included,
  and each chip edits the field that already owns the value — writing back to
  `t.extra` in the `[key:: value]` or backtick form the tag was written in
  (`:524-527`) and to the known field otherwise. `parseTaskLine()` (`core/todo.js:87`) reads every
  recognised marker — impact, effort, ai, due, start, urgent, week, chat, rank,
  repeat and the rest — off a task line, but the drawer (`kanban/js/19-drawer.js`)
  surfaces each one as its own slider, button or checkbox scattered through the
  left-hand column (`f-impact`, `f-effort`, `f-ai`, `f-urgent`... from line 678
  on), never as a single list. Worse, `parseTaskLine()` also collects `extra`
  (`core/todo.js:88`) — any tag it doesn't recognise, kept verbatim so a
  round-trip doesn't lose it — and nothing in the drawer ever reads `t.extra` at
  all; the only place it's touched anywhere in `kanban/js/` is
  `core/todo.js:182` on the way back out to disk, so a task carrying an unknown
  or mistyped tag shows nothing in the UI to say so. A sidebar section — the
  same `sideSection()` shape the second column's Project and Dependencies cards
  already use (`kanban/js/19-drawer.js`) — listing every applied tag as one
  clear set of chips, `extra` included, doubles as the editor: each chip opens
  the same value for editing and writes straight back into whichever field
  already owns it — `t.extra` for anything `parseTaskLine()` didn't recognise,
  the known field otherwise. There is one stored value per tag either way, so
  the sidebar and the existing slider or checkbox are two entry points onto
  the same field rather than two copies that could fall out of step.

- ~~**Bucket filtering is a single pick plus an "All" escape hatch, while
  Status right beside it is genuinely multi-select.**~~ **Done, 9 Sep 2026**
  (`22749a6`). `state.bucketFilter` is a `Set` the way `state.statusFilter`
  already was, read across twenty call sites, with an empty set meaning no
  narrowing rather than a dedicated All option. Every consumer this entry
  flagged was handled as it proposed: `plansShown()`
  (`kanban/js/13-plans.js:174`) short-circuits in All mode and then matches a
  row against the set, `addTask()` (`kanban/js/18-timeline.js:1102`) files a new
  card into `defaultAddBucket()` rather than inferring it from the filter, and
  `syncHash()` carries a comma-joined slug list through `bucketNamesToSlug()`
  and `bucketFilterFromSlugs()` (`kanban/js/07-render-board.js:61-69`). What the
  entry originally argued, kept for the reasoning: `state.activeBucket`
  (`kanban/js/02-state.js:28`) holds one bucket name or the `ALL_BUCKETS`
  sentinel (`02-state.js:272`), and `renderTabs()`
  (`kanban/js/07-render-board.js:67-90`) draws it as one row of exclusive
  tabs, each click replacing the whole value (`:90`). `state.statusFilter`
  sits right beside it in the same strip as a `Set` (`02-state.js:65`),
  toggled on and off independently by `renderStatusFilters()`
  (`07-render-board.js:108`), with an empty set meaning "no narrowing" rather
  than a dedicated All option — the shape this idea wants buckets to copy.
  It isn't a redraw on its own: `activeBucket()` returning exactly one
  bucket is depended on past the tabs themselves. `addTask()`
  (`kanban/js/18-timeline.js:1081`) files a new card straight into it, and
  `plansShown()` (`kanban/js/13-plans.js:174-178`) narrows the Plans view by
  comparing a row's bucket string against that one name — both need to keep
  working once several buckets are live at once. `addTask()` keeps its own
  explicit bucket picker regardless of which tabs happen to be active, so a
  new card's home is never inferred from the filter. `plansShown()` widens the
  same way `shownBuckets()`'s own AI/urgent widening already does — a row
  matching any currently active bucket stays in view, not only one comparing
  equal to a single name. `syncHash()`'s `#<view>/<slug>`
  (`07-render-board.js:54-58`) also bakes in one bucket per URL and needs to
  carry a set instead.

- **The five reserved column names are enforced by an error message rather
  than by a field you cannot type into, and deleting one is not blocked at
  all.** Most of this entry is built: `RESERVED_TIERS`
  (`kanban/js/02-state.js:293`) names Backlog, To do, Doing, Waiting review and
  Done, `TODO_TIER` and `DOING_TIER` joined the three constants that existed,
  and `rollRecurring()` (`kanban/js/04-tier-two-the-one-thing.js:197`) matches
  against them rather than typing `'Backlog'`/`'To do'` fresh. What is left is
  where the rule is enforced. `renameTier()` (`kanban/js/09-columns.js:79`)
  rejects a reserved rename with "the board depends on that exact name", but it
  rejects it on `onchange` (`:197-201`), so the input is freely typeable and a
  refused rename leaves the typed text sitting in the field while the column
  keeps its real name — the field then shows a name nothing on the board has.
  The rule belongs on the field instead: a reserved row's
  `input[data-tiername]` renders `disabled` in `draw()` (`:168`), with the
  reason as its `title`, so there is nothing to reject. And
  `confirmDeleteTier()` (`:136`) has no reserved check anywhere, so Doing can
  be deleted outright, which is the same failure the rename guard exists to
  prevent and a worse one — it needs the same guard, refusing before the
  confirm rather than offering a destination select for a column that must not
  go. Whichever of the five are real, renamable headings today are the ones
  this reaches; `DONE_COL` and `AI_COL` are already out of `tierOrder()` and so
  never draw a row at all.

  What the entry originally argued, kept because it is the reasoning: `WAIT_COL`, `BLOCKED_TIER` and `BACKLOG_TIER` (`kanban/js/02-state.js:258-269`)
  each carry a comment saying the same thing on purpose: "a renamed section
  simply stops matching and goes back to looking normal" — the column is
  matched by string, but a miss degrades quietly. `rollRecurring()`'s
  move-on-completion logic (`kanban/js/04-tier-two-the-one-thing.js:197`,
  added rolling a finished recurring task into Backlog or To do) doesn't
  follow that rule: it writes fresh `'Backlog'`/`'To do'` literals rather than
  reusing `BACKLOG_TIER`, and its target, `ensureTier()`
  (`kanban/js/04-tier-two-the-one-thing.js:286`), doesn't fail quietly on a
  miss at all — it creates a brand-new tier with that exact name. Rename "To
  do" in `todo.md` and this feature doesn't go quiet the way `BACKLOG_TIER`
  would; it spawns a second, empty "To do" column that nothing else
  recognises, sitting next to whatever the real column is now called.
  `renameParked()` (`kanban/js/04-tier-two-the-one-thing.js:270`) is the one
  place that already treats a name as truly load-bearing rather than
  cosmetic — it rewrites "Parked" to "Backlog" on sight rather than matching
  either. Corrected 8 Sep 2026: an internal key that actually survives a
  rename would need an identity stored per column that outlives its label —
  a marker in the file itself, changing the shared format both `todo.js` and
  `todo.py` read — which is a different, much bigger job than this entry
  first reached for. What was decided instead: Backlog, To do, Doing, Waiting
  review and Done stay ordinary headings matched by string, the same way
  `WAIT_COL`/`BLOCKED_TIER`/`BACKLOG_TIER` already are, and the Edit Columns
  editor refuses to rename any of the five, since code already depends on the
  literal text — the same protection `DONE_COL` and `AI_COL` already get by
  being kept out of `tierOrder()` entirely, extended to the three of these
  five that are real, renamable headings today. `rollRecurring()`'s literals
  and `ensureTier()`'s create-on-miss get named constants to match against —
  `TODO_TIER`, `DOING_TIER` alongside the existing three — rather than typing
  `'Backlog'`/`'To do'` fresh each time, so there is one spelling to get right
  rather than several that could drift apart. Any other tier a bucket adds
  stays freely renamable, exactly as today.

- **Nothing the PA runs logs how long the sitting actually took, so there is
  no way to say where his time with it actually goes bucket by bucket.** None
  of the nine `pa-*` skills (`agents/pa_agent/skills/`) record a start or end
  time for themselves anywhere — `pa-attach`'s own queue entry
  (`agents/pa_agent/skills/pa-attach/scripts/attach_session.py`, written from
  `SKILL.md:39`) carries a task title and a `cwd`, nothing about when the
  conversation began or how long it ran. The one place a timestamp already
  exists is `SessionStore` in `PACKAGES/ai_chat_engine/engine.py:103`, which
  stamps `started`/`updated` on a session — but only for conversations launched
  through the board's own canvas or Chats field, not the terminal sessions
  `pa-checkin`, `pa-checkout` and `pa-focus` actually run in day to day, which
  are never registered there at all. A task belongs to exactly one bucket, but a
  single sitting — a `pa-checkin` sweep, a `pa-checkout` pass through Doing —
  routinely touches several buckets in the same conversation, so a sitting's
  full duration logs against every bucket it touched, not a split. The write
  side follows the shape `attach-queue.json` and `notify-queue.json` already
  use — an append-only file per dataset, drained by something with a reason to
  read it — rather than inventing a new pattern.

- **Every report the PA sends is rendered by hand, so the templates are
  instructions rather than code.**
  `agents/pa_agent/skills/pa-mobile/templates/` holds five report shapes and
  `agents/pa_agent/skills/pa/references/templates.md` documents around thirty
  fields and thirteen lists to fill them with, but nothing executes any of it.
  The model reads `todo.md`, works out for itself which tasks are overdue,
  which fall inside the week, how many days old the headline is and which
  recurring meetings land tomorrow, then types the report out applying the
  file's own conventions: a placeholder with nothing to fill it drops its line,
  a heading above an empty block disappears with it, and `lines:` is a hard
  ceiling that ends in `+N more`. Those conventions hold only as well as they
  are followed, which is how the same brief comes out in a different shape two
  mornings running, and why the ceiling is the first thing to go. A
  `core/render.py` taking a template name, parsing through `core/todo.py` and
  printing finished text would settle it, and most of the arithmetic exists
  already: `effective_due` resolves dates including recurring ones,
  `occurrence_after` finds the next instance of a standing meeting, and
  `is_blocked`, `unscored`, `priority_score` and the working calendar are all
  there. What is missing is the aggregation on top, the code that turns parsed
  tasks into `overdue`, `due_this_week`, `quick_wins` and the rest, and it is
  already written twice in partial form, in `check_overdue`
  (`agents/pa_agent/skills/pa/scripts/check_todo.py:638`) and in `pick.py`'s
  headline-first ranking (`agents/night_agent/pick.py:242`), agreeing with each
  other by hand rather than by sharing code.

  It goes in `core/`, beside `todo.py`, with fixtures of its own the way the
  format has: both callers are equals, and `pick.py` is the night agent's, so
  filing the aggregation under `agents/pa_agent/` would have one agent
  importing out of another's folder. It does not breach the rule that the
  format lives in exactly two places — that rule is about parsing and
  serialising, which is `todo.js` and `todo.py`, and an aggregation with no
  JavaScript counterpart adds no third copy of anything.

  The engine is `chevron`, a small Mustache. The templates are mostly literal
  text with a handful of loops, and Mustache keeps them readable as the
  plain-text shapes they are, where Jinja2 — already installed at 3.1.3 —
  would leave them reading like code. It is not free either way: the section
  tags are Handlebars, not Mustache, so `{{#each overdue}}` becomes
  `{{#overdue}}` and `{{#none overdue}}` becomes `{{^overdue}}` across the six
  files, which is a find-and-replace rather than a rewrite.

- ~~**The board has no column for work handed to AI, so a delegated task sits
  in Doing looking exactly like something he is doing himself.**~~ **Done,
  9 Sep 2026** (`22749a6`). `AI_COL` is "Handed to AI"
  (`kanban/js/02-state.js:266`), appended by `boardColumns()` (`:315`) and kept
  out of `tierOrder()`, so it is synthetic exactly as this entry decided: the
  column sits second from the right, between Waiting review and Done, and
  `todo.md` has no such heading. `renderBoard()`
  (`kanban/js/18-timeline.js:886-897`) fills it with every not-done `ai:full`
  task and drops the same task out of its own tier, so a card is in one place
  or the other rather than both. The cost the entry named holds: cards there
  are `noDrag` (`:912`) and the column offers no Add task footer (`:927`), since
  moving work there means setting the tag and taking it back goes through
  `stripDelegation()`. Checked against the running board on 9 Sep 2026 in a
  locked tab — thirteen assertions over the column's position, its contents,
  the drag block and the missing footer, with every non-GET torn out of `fetch`
  so nothing could reach disk. What the entry originally argued: the `ai:` tag
  is
  the only marker (`AI_STOPS` in `kanban/js/19-drawer.js:148`) and it is
  orthogonal to the column, which is a `###` heading inside each bucket read off
  by `allTiers()`/`boardColumns()` (`kanban/js/02-state.js:268`). Everything
  that shows delegated work today is a derived list rather than a place on the
  board: `delegateSection()` (`kanban/js/10-reference-sections.js:577`) is an
  Overview column of `ai:full` tasks in `rank:` order, and the Plans view's
  Queue for tonight is what the night agent will pick. It stays synthetic,
  the way `DONE_COL` (`kanban/js/02-state.js:237`) already is — the board
  draws the column straight from the `ai:` tag without `todo.md` knowing about
  it, so the tag stays the single source and the format doesn't change. The
  cost is that nothing can be dragged into it directly; moving a task there
  still means setting the tag. `quickSection()` already excludes `ai:full`
  (`kanban/js/10-reference-sections.js:400`) and `stripDelegation()`
  (`kanban/js/18-timeline.js`) already handles work taken back off Claude, so
  the rules around the edges exist — what is missing is the place.

- ~~**The timeline draws weekends as real space, so five working days can
  look like a sliver next to two wasted ones.**~~ **Done, 7 Sep 2026 — decided
  to keep the seam rather than collapse the axis.** `timelineScale()` and
  `tlOffset()` in `kanban/js/18-timeline.js` still map calendar days straight
  to pixels, untouched — Saturday and Sunday still get their own `dayPx`
  width, so a bar spanning a weekend (Fri to Mon) shows as adjacent real
  days, not a skip. What changed is only the visual mark: `tlWeekends()`
  finds every Saturday–Sunday pair in the scale's range, and `.tlweekend` in
  `board.css` draws a diagonal-striped seam across each one (the same idiom
  `.tlbar.tltrail` already uses), so five working days next to two off ones
  reads as what it is without the day math, the drag math in
  `wireTimelineDrag()`, or the header builders having to change at all.

- ~~**A dedicated agent to act on a plan once it's been agreed, not just write
  it.**~~ **Built, 6 Sep 2026,** together with the two entries below, which were
  always one feature. What landed:

  - **`agreed` and `redo`, two new plan statuses**, alongside
    `unread`/`read`/`actioned`. A status rather than a flag, because a plan is
    in one state at a time. Known in three places that have to stay in step:
    `PLAN_STATUS` in `kanban/server.py`, the modal buttons in
    `kanban/js/13-plans.js`, and `is_stale()` in `agents/night_agent/pick.py`. `agreed`
    deliberately does **not** make a task stale — a plan waiting to be carried
    out must not be replaced overnight by a second opinion, which would put two
    live plans on one task.
  - **The rejection reason**, the question this entry left open. It goes in the
    plan's own frontmatter as `redo_note:`, written by the same route that
    already rewrites `status:`. `plan.py` follows the ledger row's existing
    `file`/`night` pointer to read it back and pastes it into the next run's
    prompt, so a rejected plan comes back different rather than identical. The
    server refuses a `redo` with no reason, since a reason is the entire point.
  - **One acting agent, `execution-agent`**, not one per bucket. The entry said
    "scoped per bucket"; that was reconsidered on 6 Sep and the per-bucket
    knowledge went into brief files both halves read instead. Six agents with
    write tools is six copies of one set of guard rails, and the first one
    edited without the others is the one that does damage.
  - **`pa-do`**, the skill that finds agreed plans and hands them over one at a
    time. On demand only, in a session he is sitting in, as decided. No cron and
    no background mode. The Plans view's Agree button says so in its confirm
    rather than implying anything runs.
  - **`prune()` keeps agreed plans**, which it would otherwise have deleted on
    their thirtieth day — silently dropping work he had already approved.

  Still open, and deliberately not built: raising a Jira ticket, and writing
  into the design system directly. Both named in the entry below as TBD, both
  still TBD.

- ~~**Three changes to what the night agent plans and what a plan is for,**~~
  **All three done.** Raised 5 Sep 2026 during a `pa-review-plans` review.

  - **Drop `partial` from the picker.** Done 6 Sep. `PLANNABLE` in
    `agents/night_agent/pick.py` is `{"full"}`. A task passed over for its tag is named in
    the board's "not eligible" fold with the reason, rather than silently
    dropped — `ai:: none` is not, since that is his own statement that the task
    is his and the card already says it.
  - **A plan that hits an open question should stop there.** This was already
    built when the entry was re-read on 6 Sep: `outcome: folded` is written by
    `plan.py`, the rule is `agents/night_agent/PLAN-BRIEF.md`, and the Plans list badges a
    folded plan "needs you". Landed in `f540acd` alongside the hold work.
  - **Plans should be actionable, not descriptive.** Done 6 Sep as the entry
    above. Agreeing a plan is now a real signal, and `execution-agent` is what reads
    it. Whether that agent may also edit `todo.md` was argued both ways on 6 Sep
    and settled the other way since: **it may not.** It carries out the plan and
    asks for the list change in its report, and the `pa` skill makes it, in a
    session Tiago is sitting in. One writer still beat two agents each holding
    half the guard rails; the writer is just the skill rather than the agent,
    because the agent is the one that runs unattended stretches.

- ~~**The bucket agents need to be bound to their buckets more closely than
  they are, and given somewhere to grow.**~~ **Done, 8 Sep 2026.** Raised
  5 Sep 2026. The somewhere to grow was built on 6 Sep; the content is his and
  is a task on the list now.

  Two corrections to this entry as it was written. It said the agents "know that
  [their bucket] only at the level of a one-line description in their
  frontmatter" — that was true when it was written and is not now. The six
  definitions run 41 to 76 lines, and `agents/night_agent/plan-people.md` already carries the
  back-planning rules, the five hiring skills and the two confusable name pairs.
  And it proposed that each agent "should get its own skills"; what was built
  instead is one file per bucket that every agent reads, for the reason in the
  entry above.

  **What exists now:** `data/<dataset>/buckets/<stream>/<stream>.md`, one per stream plus the
  fallback, found by `bucket_stream()` in `agents/night_agent/plan.py` — the same table
  that names the agent, so there is one mapping rather than two. Both the
  planners and `execution-agent` are pointed at it. Each ships with a
  `<!-- NOT FILLED IN YET -->` marker, and `bucket_brief()` treats a file
  carrying that line as absent, so an unwritten brief costs nothing and no agent
  spends its attention on a page of empty headings.

  **What is left is the part only he can do**, which is what this entry always
  said was the blocker: the processes he actually runs in each bucket, what each
  produces, which skill already does it, and who is involved. That is now a task
  in Processes with a sub-step per bucket, DS and BAU first. `plan-people.md`
  is the worked example to copy from.

  Two things from the original entry that still stand:

  - **Output should vary by bucket and by task, not be one shape.** A message, a
    change on the board, a starting point for a background session. The "what
    finished looks like" heading in each brief is where that gets said. Raising
    a Jira ticket and writing into the design system directly are still TBD and
    still not to be built.
  - **The planners and the acting agent are not the same agents.** Held. The
    `plan-*` contract — proposes, never executes, never touches `todo.md` —
    is unchanged, and `execution-agent` is a separate definition with a separate tool
    list.

- ~~**Token windows should be a line chart, not a list of rows.**~~ **Done, 5 Sep
  2026.** One chart, both series as a share of their ceiling on a single 0-100%
  axis, with the rows kept but folded away — they read as a log, which is the
  wrong shape for "is this getting better" and the right one for "what happened
  on Tuesday".

  Each five-hour session is its own vertical line at the moment it opened, night
  ones picked out and the live one in green. Sessions are discrete events rather
  than a continuous quantity, and joining them into a curve draws slopes between
  windows that never existed. The rolling seven-day total is a line across them.

  The denominator was the blocker and it is answered in two halves. Nothing on
  this machine is told what the allowance is, so `plan.py` now records what the
  window had spent at the moment a run was actually refused — `limit_tok` in
  `window.json` — which is a real floor under the session allowance and the only
  measurement available. Until one is captured, 100% is the heaviest session
  seen in the period, and the card says which of the two it is drawing against
  in the one line under the legend. The week never has a measured source at all;
  nothing here has any notion of a weekly allowance.

  What that means in practice: the chart answers whether today is unusual, not
  how much is left, and it will start answering the second question the first
  time a nightly run hits a limit.

- ~~**Eighty-three hairlines in a 380px column is a barcode.**~~ **Done, 6 Sep
  2026.** The chart above was right about what to draw and wrong about how much
  of it to draw at once. Thirty days of five-hour sessions rendered as
  one-pixel lines two and a half pixels apart, and the answer to "what happened
  last night" was somewhere in the smear on the right.

  A session is a box now, covering the five hours it ran rather than standing
  at the minute it opened — so windows that butt up against each other read as
  the run of work they were, and the box is wide enough to draw inside. What is
  drawn inside is how the spend arrived across those five hours:
  `reconstruct()` in `core/windows.py` keeps the running total after each turn,
  `window_shape()` in the server thins it to fourteen points as fractions of
  the window's own span and total, and the chart fills the box in with it. A
  window that emptied itself in twenty minutes and one that ticked along for
  five hours reach the same height, and the fill is the only thing that tells
  them apart.

  And four range buttons — 24h, 3d, 7d, 30d — defaulting to three days, which
  is the span the card is actually read at. They buy legibility rather than
  speed: `usage_summary()` still reconstructs the full thirty days whichever
  one is pressed, because 100% is the heaviest session seen and a three-day
  view that worked out its own ceiling would call its own busiest window 100%.
  Every range has to mean the same thing on the axis or the card stops
  answering "is today unusual", which is the only question it is for.

- ~~**Making the code shorter is a different job from splitting it, and mostly
  there is nothing to cut.**~~ **Done, confirmed 7 Sep 2026.** Never struck
  through despite the body already saying "done 5 Sep 2026" for every item in
  its own ordered list. Re-checked directly against the running code:
  `getJSON`/`postJSON` (`kanban/js/04-tier-two-the-one-thing.js`),
  `makePreviewEl` (`kanban/js/17-matrix.js`), `confirmDeleteHeading`
  (`kanban/js/08-buckets.js`), and `openDocModal`/`loadDocBody`
  (`kanban/js/12-reports.js`) all exist as described. Surveyed on 5 Sep 2026,
  after the split, because
  "9,500 lines" and "9,500 lines of waste" are not the same claim and only one
  of them was ever checked. The result, honestly: the file is not bloated.

  What the survey found:

  - **No dead JavaScript at all.** 407 top-level declarations, every single one
    referenced somewhere. Nothing to delete.
  - **A quarter of the script is comments** — 1,843 lines of 7,418. That is the
    house style and it stays. Do not count it as fat, and do not let anyone
    "optimise" by deleting the prose that explains why a rule is the shape it
    is. That prose is the reason this repo can be picked up cold.
  - **Repetition is real but small.** About 130 lines are exact duplicates of
    another line, and another ~140 sit in near-duplicate function pairs.
  - **15 dead CSS classes, on paper.** `ai-full`, `ai-partial`, `chk`,
    `cvhint`, `cvlive`, `hlset`, `impact-high`, `legendbody`, `mdlist`,
    `msglead`, `refchip`, `refholds`, `refnote`, `refwaits`, `ride`. The survey
    named its own trap correctly — "checked against dynamic construction" — and
    then missed four hits against its own rule when it wrote the final list.
    `ai-full`/`ai-partial` are built by `'tag ai ai-' + esc(t.ai)`, `impact-high`
    by `'tag impact-' + esc(t.impact)`, and `ride` by
    `'udecide ' + esc(u.decision.action)` — all three live, all three not
    caught because the grep that checked for dynamic construction looked for
    the class's own prefix (`'ai-' + t.ai`) rather than the actual code, which
    builds the whole `tag ai` / `tag impact` / `udecide` string first and
    appends the value after. Fixed 5 Sep 2026: the 11 that were actually dead
    are gone from `board.css`; those four are still there, on purpose.
  - **No dead custom properties.** All 25 are read.

  So the ceiling is somewhere around 300 lines out of 9,300, which is 3%. Worth
  doing for the reasons below, not for the number.

  In rough order of what is actually worth it, **done 5 Sep 2026**:

  1. **A `getJSON` / `postJSON` pair.** The single biggest cluster: 32 `fetch`
     call sites, 18 of them repeating `'?t=' + Date.now()`, 7 repeating the
     `Content-Type` and `X-Board` header block, 12 repeating
     `if (!res.ok) throw`, 4 repeating `res.json().catch(() => ({}))`. Two
     helpers collapse most of it, and the real gain is that a new endpoint stops
     being a copy-paste of an old one — which is how the cache-bust came to be
     on 18 of 32 rather than all of them. Landed for every JSON call site with
     plain, generic error handling — about 20 of the 32. Left alone on purpose:
     the handful of GETs that branch on status code for a bespoke "the board
     helper needs restarting" message (`/queue.json`, `/plans.json`,
     `/schedule.json`, `/backups.json`), the text (not JSON) fetches
     (`loadFile`, `loadDemo`, backup previews, the outside-edit watcher), the
     `HEAD` request, and the `todo.md` `PUT` — none of those fit either helper's
     shape without losing something a straight throw-on-`!ok` would flatten.
  2. **`matrixPreview` / `trendPreview`** are 95% identical, nine lines each.
     Down to one shared `makePreviewEl(cls)`, with each singleton getter still
     its own one-liner.
  3. **`confirmDeleteBucket` / `confirmDeleteTier`** (64% alike, 26 and 24
     lines) and **`openBucketEditor` / `openTierEditor`** (46%, 76 and 71). A
     bucket and a tier are the same shape of thing with different labels, and
     these four have drifted apart in small ways already. The delete-confirm
     pair now share one `confirmDeleteHeading()` — the button footer and the
     destination select's wiring are mechanical, the wording is still written
     out in full by each caller rather than assembled from fragments, since the
     two really do say different things in the details. The editor pair kept
     their own `draw()`/`wire()` — the rename-sync logic differs in a real way
     between a mutable bucket object and a re-read tier-name array, and neither
     is under test, so only the one truly identical piece (the
     move-up/move-down/delete button trio) came out, into
     `moveDeleteButtonsHTML()`.
  4. **`openReportModal` / `openPlanModal`** and **`loadReportBody` /
     `loadPlanBody`** — 58% and 48%. Both are "fetch a Markdown file, render it
     into a modal, mark it read". Now `openDocModal()` and `loadDocBody()`,
     each kind's own function reduced to the three or four lines that are
     actually different (the buttons, the cache object, the noun in the error).
  5. **The dead CSS.** Trivial and safe, but it is 24 lines, so do it last and
     do not pretend it was the point. 11 of the 15 turned out to be genuinely
     dead — see above for the other four — for 20 fewer lines and 8 fewer
     names to trim out of shared selector lists.

  Every one of the four proved itself against `node kanban/test_canvas.mjs`,
  `test_plans.mjs` and `test_schedule.mjs` (132 checks between them) plus
  `core/test_todo.py`/`.mjs`, all still green. The Description-field Preview
  toggle below exercises `mdBlocks`/`mdInline`, which item 4's merge left
  untouched, and item 3's editors have no automated coverage at all — worth
  a manual look next time either is touched by hand, since nothing here would
  catch a regression in them.

  How to re-run the survey rather than trusting this entry a year from now:

  - **Dead JavaScript:** collect every `^function name` and `^const name =` in
    the inline script, strip comments from the source, and count remaining
    references of each name. Zero means dead. Watch for two false-positive
    traps — a name only ever used inside a template string, and a handler
    referenced from an `onclick=` attribute in the HTML above the script.
  - **Dead CSS:** collect every `.class` in `board.css` and grep each one in
    `index.html`. Before deleting any hit, check two things: that nothing builds
    the name dynamically (`'impact-' + t.impact` would make `.impact-high` look
    dead when it is not), and that `ai_chat_engine` does not own it, since
    `chat.js` and `cards.js` draw into this same page.
  - **Duplication:** `difflib.SequenceMatcher` over the body of every pair of
    top-level functions with similar names is what found the pairs above.

  **The rule for any of this work:** it changes no behaviour, so prove that
  rather than asserting it. `node kanban/test_canvas.mjs`, `test_plans.mjs` and
  `test_schedule.mjs` between them boot the whole board and run 132 checks, and
  `core/test_todo.mjs` covers the format. A refactor that cannot be shown green
  in all four is not finished. Where a change is meant to be a pure move rather
  than a rewrite, prove it the way `board.css` was: reassemble the pieces and
  diff against the original.

- ~~**The rest of `index.html` could be split the same way, and the survey is
  already done.**~~ **Done, 5 Sep 2026,** despite this entry's own doubt about
  whether it was worth it — asked for directly, so built as planned rather than
  relitigated. 25 banner-marked sections (one more than this entry counted),
  each now its own classic `<script src>` in `kanban/js/`, in source order,
  plus `boot.js`. `index.html` itself is down to 165 lines.

  The two forward-reaching exceptions this entry predicted were the only two
  that turned up on a full re-check of every top-level statement in the old
  inline script (not just the two named here — every `setInterval`, event
  wiring, and bare function call was checked against where the name it uses
  was actually declared):

  - `state.sort = readSort();` — `readSort` reads `SORT_KEY`, a `const` in what
    is now `03-tier-one-impact-effort.js`.
  - the `initViewFromHash` IIFE — calls `isKnownView`, in what is now
    `11-canvas.js`.

  Both now live in `boot.js`, `initViewFromHash` converted from a self-invoking
  IIFE to a plain function so `boot.js` can call it. `boot.js` also inherited
  the original tail — `loadFile(); loadJira(); loadDatasets(); chat.loadStatus();`
  — exactly as this entry described.

  The predicted bug fix is real and checked, not just theoretical: before the
  split, `readSort()` ran while `SORT_KEY` was still in its temporal dead zone,
  threw, and was swallowed by `readSort`'s own `try/catch` — so the saved
  per-column sort silently never restored, every load, since whenever that
  code was written. Loaded fresh against the live server with a fake sort
  planted in `localStorage` first, `state.sort` now comes back populated
  instead of `{}`.

  Every classic script tag stayed non-module and non-deferred, so execution
  order is exactly what it was inside the one big inline script — each file's
  `'use strict'` (lost, otherwise, since the pragma doesn't cross script
  tags) added back individually. Proved against `node kanban/test_canvas.mjs`,
  `test_plans.mjs` and `test_schedule.mjs` (132 checks) run against the actual
  running board, not a fixture — all still green, plus every one of the 26
  new files passing `node --check` on its own.

  What this didn't touch: the banner-numbering itself still has two "2c"s and
  two "4c"s, an old quirk from sections renumbered in place over time. The
  file names in `kanban/js/` are sequential (`01`–`25`) rather than repeating
  that, so the numbering mismatch is now only inside the banner comments, not
  in anything a path depends on.

- ~~**A list view of every cronned task tied to this app.**~~ **Done, 5 Sep
  2026.** A **Schedule** button beside Backups in the Data group, opening a
  full-pane view — a header button rather than a nav tab, as the entry asked.
  Three jobs today: the night agent's twelve launchd wakes, the companion's
  morning check, and the weekly backup thread inside the server.

  It needed both sources rather than one. Live (`launchctl print`, the plist's
  own wake times, the companion's lock) says whether a job is armed and when it
  fires next, which no log can know — a log will happily describe a job that was
  unloaded a week ago. The ledger (`plans/night-agent.log`, `companion.json`,
  `backup_listing()`) says what actually happened, which `launchctl` cannot. A
  job that is not installed says so and gives the command to install it, which
  is the most useful thing the view says right now.

  The second card is the usage windows, which had no home outside
  `core/windows.py --history`: the last 30 days, night windows picked out, and
  the night agent's own ride/open/stop decision as it stands this second. That
  last line is the useful one, because it answers "would it run tonight" without
  waiting for tonight.

- ~~**Nothing shows what is about to be planned, or lets it be prioritised.**~~
  **Done, 5 Sep 2026**, as the **Queue for tonight** column, first in Plans,
  off a new `/queue.json`.

  Nothing is queued ahead of time and nothing is stored. The column is
  `pick.select()` run against `todo.md` this second — the same call the runner
  makes at 02:00, imported rather than reimplemented, so there is one selection
  rule and the column cannot describe a different night from the one that
  happens. Tick a task off and it leaves the queue on the next render.

  The ordering is the only thing written, to `plans/queue-order.json`, and it
  matters because the batch stops on a budget, a window floor or a usage limit:
  the front of the queue is the part that reliably gets planned. A card can also
  be held back, which is the only way to say "not this one tonight" without
  editing `todo.md` — which this view must never do, and does not.

  Two rules in there are easy to get backwards, so both are pinned by tests. A
  task the board has never ranked queues *behind* what he has already
  prioritised, or every new task would arrive at the front of the night. And a
  hold beats `--all`, because `--all` exists to ignore the ledger, which is a
  cache, whereas a hold is an instruction.

  Neither list decides what the queue contains — every rule in `pick.py` still
  does. So a stored title that has since been ticked off, blocked or renamed is
  simply never matched, and there is nothing to prune.

- ~~**No view can show a run that is happening right now.**~~ **Done, 5 Sep
  2026**, as the **In flight** column in Plans, off a new `/night-agent.json`, with
  a **Run the agent now** button on the same card (`POST /night_agent/run`, which is
  `run.sh --force` started detached).

  It reads the lock and the log together, because neither is enough. The lock
  (`data/.night-agent.lock`, held by `run.sh` for the length of a batch) is the only
  thing that separates "still going" from "died half way" — the log looks
  identical either way, and a log with a task in flight and no lock now says so
  in as many words rather than showing a dead run as live. The log gives the
  rest: the `  > <task> (<agent>)` line written *before* each agent starts names
  what is being worked on, and the `planned`/`failed` lines since the last
  `start:` give the tally against the total that line records.

  The polling question the entry raised is settled the plain way: ten seconds
  while a run is live, sixty otherwise, and the timer stops the moment the tab
  is not on Plans. Nothing streams, and nothing polls in the background.

  The parsing lives in `server.py` rather than being exported from `plan.py`, on
  purpose. That log is read at a terminal far more often than it is parsed, and
  pinning its wording to a format string the board depends on would stop it
  being edited freely. When a line stops matching, the column goes quiet rather
  than lying, and `test_queue_routes` in `agents/night_agent/test_night_agent.py` holds
  `plan.py`'s own format strings filled in, so a change to the wording fails
  there rather than in the morning.

- ~~**Render the description field as markdown.**~~ **Done, 5 Sep 2026,** as an
  Edit/Preview toggle rather than a live side-by-side — the drawer isn't wide
  enough for both, and a toggle needed no new state, since Preview only ever
  reads the textarea's own value and never writes to it. Preview runs the
  field's text through the same `mdBlocks()`/`mdInline()` a report or plan
  modal already renders with, styled with the same `.repdoc` CSS rather than a
  new set of rules. The prompt/message scaffolding `suggestions()` parses back
  out of the same field (a `- Message (draft): …` line, say) renders as an
  ordinary bullet in Preview — honest rather than wrong, and not worth a
  special case. `mdInline()` itself gained one thing it didn't have before:
  `[text](url)` now renders as a link, everywhere it's used, not just here —
  it was the other half of "bold, links and lists" the entry named, and
  reports and plans get it for free. A lone `[path]` placeholder, which
  prompts already rely on staying literal, is unaffected — the pattern only
  fires with a `(url)` immediately after.

- ~~**The Edit/Preview toggle was a click in the way of reading.**~~ **Done,
  6 Sep 2026.** The toggle above shipped rendering but left it behind a
  button, so a note read as raw Markdown until you pressed Preview — a click
  to do the thing the panel is open for. The tabs are gone. The Description
  now renders at rest and swaps to the raw textarea when it is clicked, with
  the caret on the character that was clicked; blur or Escape puts the
  rendering back. Not a live side-by-side, for the reason the entry above
  gives: the drawer is not wide enough for two columns.

  The caret is the only part of this that is arithmetic. `mdBlocks()` gained
  a `srcmap` option that stamps every block with the lines of the source it
  came from, and `rawOffsetForVisible()` in the drawer inverts `mdInline()`
  for the marks it knows — so a click on the `b` of `**bold**` lands on the
  `b` and not on an asterisk, which is what the first two attempts got wrong
  in both directions. `kanban/test_notes.mjs` is the cover for it, and drives
  real clicks at real coordinates because the arithmetic starts from a hit
  test the browser does.

  Two smaller things went with it, both making the drawer agree with the rest
  of the board: a subtask's text and a task's title in the project view now
  render inline Markdown, the way card titles everywhere else already did. A
  link in either is followed rather than opening the editor on top of it.

  Followed the same day by the field's height, which the rendering had made
  worse: at 200px, Bucket, Column and both dates sat below the fold on every
  task whose note was two lines. It now stands at 120px, with an **Expand**
  button in the label that grows it to as much of the note as fits, and a
  corner that drags to anything in between. One stored height drives the
  rendering and the textarea together, so nothing moves when the field swaps
  between them, and the button reads Collapse whenever the field is above its
  floor — after a drag as much as after a press, so the two ways of resizing
  it cannot disagree. A drag has no event of its own; it is heard through a
  `ResizeObserver`. The line about subtasks moved out from under the field and
  up beside the label, where Subtasks' own Complete all already sits.

  And then what the rendering should pick out, which is three things
  `mdInline()` was walking straight past: a URL written on its own is now a
  link, the same as one already in brackets; a `[key:: value]` tag gets a
  quiet chip; and a `[placeholder]` — `[path]`, `[fill in]`, `[name]` — gets
  an amber one, because it is an open loop rather than an answer. All three
  keep every character they were written with, brackets included. That is
  honest about what is in the file, and it is also what lets the caret
  arithmetic stay as simple as it is: a chip that dropped its brackets would
  be two characters the count could not see, and every click after it would
  land two early. Because this is `mdInline()`, reports and plans get the
  same treatment, which is where `[fill in]` comes from in the first place.

- ~~**A desktop widget holding message suggestions, ready to copy.**~~
  **Where it lives is decided, 5 Sep 2026: the companion.** The open question
  was whether this was its own thing or part of the companion, and the nightly
  prep agent answered it by needing the same surface. The companion already runs
  every working morning, already reads the list read-only, and already opens the
  board, so a second menu bar item would have been two processes watching one
  file to save one click.

  A plans half landed first and came straight back out: a plan is several minutes
  of reading and the menu bar is the wrong shape for it. Plans live on the
  board's Plans tab, and what the companion does about them is say they exist —
  see the notification queue below.

  **The messages half landed 5 Sep 2026**, and the plans half came back out: the
  companion shows messages only, because a plan is several minutes of reading and
  the menu bar is the wrong place for it. Plans stay on the board's Plans tab.

  The blocker turned out not to be the sync question at all. It was that nothing
  outside `kanban/index.html` could read a suggested message — the parsing lived
  only in the board's JavaScript. So `MSG_NOTE`, `quoted()`, `split_body()` and
  `messages()` are now in `core/todo.py`, `check_todo.py` uses that regex instead
  of its own looser one, and `core/test_todo.py` holds a frozen table of the
  board's own answers so the two cannot drift.

  Click copies. Alt-click dismisses, which is this app's own state in
  `companion.json` and never touches `todo.md` — the message stays on the card,
  keyed by a hash of its own text so rewording one deliberately brings it back.
  What it still cannot do is the board's delete-on-send, because that is a write:
  a message sent from the menu stays on the card until the board is next used,
  and that is the trade.

- ~~**Cards in the task drawer, attaching a session that started in the
  terminal, and a prompt being used up by running it.**~~ **Done, 4 Sep
  2026.** All three of the plan's remaining steps. The drawer's Chats field
  draws with the same `cvCardHTML` the canvas uses, stacked instead of
  scattered, sharing `openCard()`/`closeCard()` with it. A `/pa-attach` skill
  files the conversation it is run inside against a task named in plain text
  (never `AskUserQuestion` — the list runs to hundreds), writing
  `data/<dataset>/attach-queue.json` for the board to drain on its next load
  through its own edit path; the drawer's own **Attach a session…** does the
  same filing directly, no queue needed, for when the board is already open.
  `list_sessions()` and the four new `/claude/*` routes it needed live in
  `ai_chat_engine`, shared with whatever else wants them. A prompt suggestion
  is deleted the instant it is actually sent, not on the click that opens the
  modal — chat.js's existing `onSend` hook is what tells the two apart — and
  the text survives on the session's own row afterwards, through a new
  `SessionStore.set_prompt()`. Full write-up, including what was tried and
  why, in [AI-CANVAS.md](AI-CANVAS.md).

- ~~**An AI canvas, and cards in the drawer.**~~ **Canvas done, 4 Sep 2026.** A view of conversations with Claude
  laid out as cards and grouped by the task they belong to, the way `ai_canvas`
  groups sessions by project, with copies of the same cards in a task's drawer
  next to the prompt suggestions. For organising sessions rather than starting
  them, which is what keeps it off a second long-lived process. The filing
  layer comes out of `ai_canvas` into `ai_chat_engine` first so neither app
  keeps its own copy; the drawing stays per app, since one is React in Electron
  and this is one HTML file. The argument, what was decided and what is left
  are in [AI-CANVAS.md](AI-CANVAS.md), which is the live document; this entry
  is kept only as the record of what was originally asked for.

- ~~Recurring tasks cannot express fortnightly or quarterly.~~ **Done, 4 Sep
  2026.** A `/n` suffix on any existing form: `repeat:wed/2` is fortnightly,
  `repeat:15/3` is quarterly, `repeat:mon1/6` is twice a year. One suffix rather
  than four new forms, because a quarterly cycle is a monthly one counted
  differently. The phase lives in `[due:: ]`, which was already carrying it, so
  the interval counts from the card's own date and the checker verifies shape
  but not phase.

  Two things that entry claimed were missing were not. `repeat:mon1` has always
  meant the first Monday of the month. And the design system drop-in does not
  need an alternating-weekday form — `~thu` already covers it, and covers it
  better: the drop-in is not a strict Thursday/Friday alternation, it is a weekly
  session that gets rebooked, which is what `~` was added for. A rigid
  alternation would confidently roll it to the wrong day.
- ~~The roll writes to `todo.md` on load, so a day the board is never opened is
  a day nothing rolls.~~ **Closed, 7 Sep 2026.** Harmless — the next load
  catches up in one go — but it does
  mean the dates are only as current as the last time the board ran.

  **Decided on 4 Sep 2026: leave it.** What it costs is that the file on disk
  reads as overdue, on a recurring task, to every reader that is not the board —
  the checker, the pa-* skills and the Obsidian views — until the board is next
  opened. The companion is the exception; it rolls in memory and is already
  immune. Fixing it properly means something other than the board writing to
  `todo.md`, which is the thing this repo is built to avoid, so it stays.

  There is a middle option if the noise ever gets annoying, and it is not this
  entry: the checker and the skills could call `todo.effective_due()` and roll in
  memory the way the companion does. That is a small change and needs no second
  writer. Do not re-propose the writing version.

- ~~**Clicking a queued plan on the Plans page should take you to the card it
  came from.**~~ **Done, 6 Sep 2026.** Every plan card's meta line now carries
  an **open the card ↗** button (`planItemHTML()` in `kanban/js/13-plans.js`)
  when the plan's own task can still be found on the board — by `slug:` first,
  falling back to `task:` (its title), the same two ways `findTaskByKey()` in
  `02-state.js` already resolves a companion link. It switches to the Board
  view, lands on the right bucket tab and opens the drawer, same as
  `openTaskByKey()` always did; a plan whose task has since been renamed or
  deleted says so in a toast rather than opening an empty board.

- ~~**The Plans token graph needs rework.**~~ **Superseded, confirmed 7 Sep
  2026.** Never struck through despite its own text closing the question.
  Re-checked against the running code: `USAGE_RANGES` in
  `kanban/js/14-schedule.js` still has the four ranges (24h/3d/7d/30d) and
  `window_shape()` in `kanban/server.py` still exists, both matching what
  this entry already described as shipped. This
  was written against the very first version of the chart — one thin vertical
  line per session, plotting a full month by default (commit `31af0a7`, before
  the "Eighty-three hairlines" rework below it in this file). Re-checked
  6 Sep 2026 against what actually ships now: the default range is already
  three days, not a month (the four range buttons — 24h/3d/7d/30d — are the
  answer to "narrow it"); each session is already a box standing on the axis
  for the five hours it actually ran, which shows where a window starts and
  ends more plainly than a bare vertical line ever did; the orange line is the
  rolling seven-day total, already named in the chart's own legend
  (`.ukey .k.r`) and in the caption underneath it. The one literal ask left —
  swap the boxes for a line — would undo a later, more considered decision
  recorded just below this entry: a session is a discrete event, not a
  continuous quantity, and joining them into a curve draws slopes between
  windows that never happened. Leaving this as no further action; the entry
  stays only as the record of why it isn't being reopened.

- ~~**Drop the descriptions on the bucket columns in the board.**~~ **Done,
  8 Sep 2026 — nothing to change.** The text is the block under each
  `## N. Name` heading in `todo.md` (`bucket.intro`, parsed and round-tripped
  at `core/todo.js:207` and `:273`), and nothing in `kanban/js/` reads it, so
  it is already invisible on the board. It stays in the file: DS's names the
  five streams the planners key off and says the DSDS group runs the design
  system until the Principal Product Designer is hired, which is written down
  nowhere else. The standing rule is the other half of it — the intro is
  context for whatever reads the file, not a caption for a column, so nothing
  on the board should start rendering it.

- ~~**On the Plans page, make "Held back" its own column on the far left**
  rather than a section within the queue.~~ **Done, 6 Sep 2026**, as the
  **Backlog** column, first in Plans — held-back and not-eligible tasks both
  live there now, off the same `/queue.json`.

  Held cards drag both ways — into the queue at whatever position dropped, or
  out of it by dropping a queue card anywhere on the Backlog column, since a
  held card has no rank to drop it against. Both are the drag equivalent of the
  Hold/Release buttons, which stay for a click rather than a drag. Not-eligible
  cards are shown with their reason but not draggable: they are excluded by a
  real rule in `pick.py` (blocked, parked, tagged short of `ai:full`, or waiting
  on a `start:` date), and a drag cannot fix any of those, so offering one
  would just fail silently on the next load.

  The columns are five now rather than four. In flight is renamed **Next
  run**, and Written plans is renamed **Plans**. What the run has actually
  cost lives in **Token windows** now, as **Latest run costs** (with the date
  the run started), alongside the usage chart and the job schedule that used
  to be folded into Next run — all three are cost-and-schedule information,
  which Next run itself no longer carries; it shows only what is happening
  right now.

  ~~Still open: a "Run now" button on top of the queue column.~~ **Done,
  6 Sep 2026.** Sits beside the Queue for tonight heading itself (`.cardhead`
  in `renderPlansView()`), same `confirmNightAgentRun()` the one on Next run
  already calls — two buttons, one action, reachable from wherever he's
  actually looking when he decides to run it.

- ~~**Plans page follow-ups, raised 6 Sep 2026, none started yet.**~~ **All
  five done, 6 Sep 2026.**

  - **Simplified the column descriptions** to one plain sentence each, no
    drag/click instructions — "What tonight's run would plan, in order.",
    "What the night agent is doing right now, or last did.", and so on.
  - **Every column has a boxed empty state** now, matching `.fidle`, scoped to
    `.lists.pview .reportsview .empty` so the Reports view's own plain
    `.empty` is untouched.
  - **"Not eligible" in Backlog is a closed fold**, `<details><summary>Not
    eligible (N)</summary>…`, same shape as "What runs on a clock".
  - **"Latest run costs" is a closed fold too, and sits after the usage
    chart.** The caching this entry worried about turned out not to be
    needed: `#runResultsOut` was already a sibling of `#usageOut`, not nested
    inside it, so `renderUsage()`'s full redraw on a range click never
    touched it before and still doesn't — moving it below `#usageOut` in the
    template was the whole change. The date and the total, which used to be a
    heading inside the fold, are now the fold's own `<summary>` text
    (`#runResultsSummary`), so they're still readable closed.
  - **Plan cards get a top border**, fixed red (`.repitem.planitem` in
    `board.css`), rather than the left bucket-coloured accent task cards
    carry — set after every `.repitem.<status>` rule in source order, since
    those set `border-color` on every edge and the top edge needs to keep
    winning regardless of a card's status.

  Discovered while moving "Latest run costs" around: the exception this
  file's own "Schedule should be part of Plans" entry left open — "the card
  is not under In flight yet" — was still open, and `kanban/test_schedule.mjs`
  was still failing on exactly that. Fixed alongside these five: "What runs
  on a clock" now sits inside the **Next run** card, a sibling of
  `#flightOut`, not the Token windows one.

- ~~**Bring the board's bucket filters to the Plans page.**~~ **Done,
  6 Sep 2026.** The tabs were already drawn there (`renderFilterBar()` was
  already called for the Plans view) but clicking one changed nothing — none
  of Backlog, Queue or Plans read `state.activeBucket` at all. `plansShown()`
  in `13-plans.js` is the one filter all three now run their rows through:
  a specific bucket tab narrows to an exact name match, and echoes
  `shownBuckets()`'s own widening rule — All, the AI filter or the urgent/due
  filter all mean "show everything", not "show only rows whose bucket string
  happens to equal one of the current buckets' names". Getting that backwards
  first (comparing against the *set* of shown bucket names rather than
  short-circuiting in All mode) is what `test_plans.mjs` caught: three
  fixture rows use bucket names — `DS`, `Processes` — that don't exist in
  `demo.md`, and a correct "All means everything" filter has to show them
  regardless.

  Also cost an hour chasing a phantom regression that had nothing to do with
  this change: a `test_plans.mjs` run thrown before `chrome.kill()` (from
  before this session's edits existed) had left an orphaned headless Chrome
  holding port 9446, and every subsequent run was silently reconnecting to
  its stale, pre-edit page instead of starting fresh — exactly the failure
  mode this file's own "Testing the board" section already documents.
  `pkill -f "remote-debugging-port=9"` before a suspicious run is the fix, not
  the code.

- ~~**The Plans page had five cards doing the job three could do.**~~ **Done,
  confirmed 7 Sep 2026.** Never struck through despite its own body describing
  the change in the past tense. Re-checked against `kanban/js/13-plans.js`:
  the Queue/Doing toggle card is exactly as described (`renderQueueDoingHead`,
  "one card asking whichever question is actually live"). Restructured
  6 Sep 2026. **Queue** (was "Queue for tonight") and **Doing** (was "Next
  run") are one card now, toggling rather than sitting side by side: it shows
  the queue list and a **Run now** button when nothing is running, and swaps
  to Doing — title, lead sentence, the live task — the moment a run goes
  live. The button hides while a run is live rather than risking a second one
  the runner would silently refuse anyway. A dead run (the lock gone, the
  task never finished) does not count as "actively running", so it falls back
  to Queue mode with a small alert banner above the list instead of taking
  over Doing.

  The Status heading and the RIDE/HOLD/STOP decision line moved into that same
  card, above whichever half is showing — they were answering "would tonight
  run", which is a question about the same thing this card now is. **Done**
  (was "Plans") picked up the "Run started / Planned / Left" stats above its
  plan list, since those numbers describe what already happened, which is
  Done's job, not Doing's. **Token Session** (was "Token windows") is chart
  only now, and **What runs on a clock** is its own full card again rather
  than folded into it — stacked directly below Token Session in the same grid
  column (`.pvcol` in `board.css`) rather than taking a track of its own,
  since a glance at it is rare enough that it reads better as an appendix to
  the chart than as a competitor for width.

  `kanban/js/13-plans.js` carries the bulk of the toggle logic;
  `renderStatus()` came out of `renderUsage()` in `kanban/js/14-schedule.js`
  so the Status line can be drawn from the Queue/Doing card instead of Token
  Session. The grid went from five tracks to four, and `.fidle`/`.frun`
  (Doing's old "nothing running" box and its full-width run button) are gone
  from `board.css`, both unused once Queue absorbed that job.
  `kanban/test_plans.mjs` and `kanban/test_schedule.mjs` were rewritten
  alongside it — the plans fixture now starts not-live, since a live Doing
  state hides the queue and a hidden element has no bounding box to drag-test
  against. All twelve suites in the repo (core, night agent, companion, and
  the four board ones — 69/69, 39/39, 54/54, 48/48) pass clean against it,
  checked against the actual running server, not just the fixtures.

- **"Quick wins" sorts by due date and "Delegate to Claude" by impact against
  effort, and both replace the order they have now rather than being offered
  as a second choice.** Nothing to draw and nothing to remember: each column
  has one order. `quickSection()` (`kanban/js/10-reference-sections.js:399`)
  groups before it sorts today — meetings with an agenda first by nearest
  date, then messages, then S-effort tasks, `byPriority()` ranking inside each
  — and the groups go with the change: one flat list, earliest `due:` first,
  undated at the bottom. What is in the column at all is untouched, since
  those filters are about eligibility rather than order — `ai:full` belongs to
  Delegate, Backlog is parked on purpose, and a task waiting on another or on
  a `start:` date still counts in the held tallies rather than appearing.
  `delegateSection()` (`:577`) drops `rank:` as its sort for the same
  impact-against-effort score the board already computes (`EFFORT_N`,
  `core/todo.js:565`). The tag stays — the night agent's queue orders by it —
  but `.refnum` beside each card then shows the row's position rather than the
  stored rank, since the two no longer agree.

- ~~**Rework the bucket editor.**~~ **Done, 6 Sep 2026.** The task-count
  column is gone. In its place, each bucket's dot (`.bkpick`, in
  `kanban/js/08-buckets.js`) opens a popover of the board's own ten preset
  swatches (`BUCKET_COLOR`, extended from six to ten — `--b7` through `--b10`
  joined `--b1`..`--b6` in `board.css`, four more theme-aware hues in the same
  style as the first six). Picking one writes straight to
  `state.bucketColors[name]` and posts the whole map to a new
  `/bucket-colors` route — `bucket-colors.json`, one per dataset, the same
  shape as `canvas.json`: a preference about looking at the list, not a fact
  the list carries, so it stays out of `todo.md` and out of the one-writer
  rule entirely. Every place on the board that used to derive a bucket's
  colour from `BUCKET_COLOR[i % 6]` — the tabs, the editor, the canvas boxes,
  the reports, Matrix, the timeline, the board itself, nine call sites across
  seven files — now goes through one `bucketColor(name, index)` in
  `02-state.js`, which is the stored colour if there is one and the old
  index-based fallback if there isn't. That's also the fix for what the entry
  actually asked for: a colour keyed by name survives a reorder, where one
  derived from array position never could.

- ~~**A place to see every project, not just the ones a task happens to
  name.**~~ **Done.** Raised 6 Sep 2026, built the same day. `/projects.json`
  in `kanban/server.py` (`project_listing()`/`project_meta()`) reads the
  `data/projects/` directory itself rather than inferring names from task
  notes, so a folder nothing points at yet, or any more, still shows up.
  `kanban/js/26-projects.js` is the Projects tab that reads it — one card per
  folder, tagged Live or Orphaned by walking `projectTasks()` the same way the
  drawer already does, clickable through the same `[data-project]` capture
  handler `openProjectDrawer` already listens for. Checked 6 Sep 2026 against
  the running server and the real `data/twinkl/projects/` folder: the route
  returns all five folders on disk, the tab renders them with correct
  live/orphaned tags, and clicking one opens the drawer, with the fetch guard
  from `kanban/test_canvas.mjs` confirming nothing written. The dedicated test
  file this asked for arrived on 8 Sep 2026 with the folder listing above:
  `kanban/test_projects.mjs`, covering the tab as well as the drawer.

- **`execution-agent` is not to run overnight. What the night owes him is a
  report that agreed plans are waiting.** Raised 6 Sep 2026 as a way to run it
  unattended, and settled the other way: it only ever runs from `pa-do`,
  inside a session he is sitting in, because being able to stop and ask is
  what makes it safe to hold write tools at all, and an unattended run is that
  design inverted. Do not re-propose it.

  What is left to build is the reporting half. A plan carrying
  `status: agreed` (`PLAN_STATUS`, `kanban/server.py:945`) is work he has
  approved and nothing acts on until he next sits down with `pa-do`, and
  today nothing anywhere says how many are waiting or how long they have
  been. The channel exists: `companion/notify.py` appends to
  `notify-queue.json` and the companion drains it after 08:30, which is
  already how the night agent says it wrote plans. The night's own run adds
  one line counting the agreed plans still outstanding, so a queue that is
  quietly growing is heard about in the morning rather than found weeks later
  on the Plans view.
