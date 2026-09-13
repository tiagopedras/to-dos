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

- **Eleven places on Plans still set a class on a node React owns, and nothing
  says which of them is safe.** Two broke during the 13 Sep 2026 port and were
  fixed by making the class a prop: `renderQueueDoingHead()` hid `#doingOut`
  and `#runQueueBtn` with `classList.toggle`, and `wireColumnDrop()` added the
  two plans-only columns' refusal by wrapping the handlers it had just
  assigned — which only works while every render builds fresh nodes, and React
  reuses them, so each paint would have wrapped the last paint's. What is left
  in `kanban/js/13-plans.js` is the drag feedback (`dragging`, `coldrop`,
  `coldeny`, `over-top`/`over-bottom` at lines 905-987 and 1604) and the column
  filter's own `hidden` at line 613. Those survive today for a reason worth
  knowing rather than relying on: React writes `className` only when the prop
  it renders from has changed, so an imperative class it never recorded is left
  alone — until the prop does change, at which point the class goes without a
  word. `26-projects.js`, `12-reports.js` and `15-backups.js` were checked and
  use `classList` nowhere, so the sweep is clean now; the gap is that no suite
  asserts it, and the next ported view can reintroduce either pattern without
  failing anything.

- **The coloured stripe on a card is thinner than it reads.** The shared card
  rule, `.card, .repitem, .chaincard` (`kanban/board.css:2017-2021`), sets
  `border-left:3px solid var(--bc,var(--line))` — one rule feeding all four
  card kinds since the 12 Sep 2026 unification the comment above it
  describes. Bumping it to 4px is the one-line change, but the same comment
  notes the padding was set against the old width: `padding:9px 10px 9px 9px`
  pairs a 9px left inset with the 3px stripe to make "the component's 12"
  against 10px on the right, deliberately asymmetric. Going to 4px without
  touching padding pushes that to 13 and widens the gap the comment argues
  for keeping close; dropping the left padding to 8px keeps the 12 the
  argument is built on. `.card.nostripe, .repitem.nostripe` (`:2031`) sets
  its own 1px width and 11px padding and is unaffected either way.

- ~~**The Completed total names its own window a second time, right next to the
  picker that already says it.**~~ **Done, 13 Sep 2026.** The `.totalw` span is
  gone from `completedByCategoryReport()`, and with it `reportWindowLabel()`,
  which fed nothing else, and the two `.totalw` rules in `board.css`. The line
  now reads "N tasks finished across M categories" under a picker that already
  says which window it means. `completedByCategoryReport()`
  (`kanban/js/12-reports.js:285-289`) renders `'<span class="totalw">' +
  esc(reportWindowLabel()) + '</span>'` after "N tasks finished across M
  categories", so the label reads "12 tasks finished across 4 categories the
  last 30 days" directly under the Show picker that already reads "Past 30
  days". `reportWindowLabel()` (`:87`) only exists to feed that one span —
  dropping the `<span class="totalw">…</span>` clause leaves the sentence
  reading "N tasks finished across M categories", and the function and its
  sibling `reportWindowPhrase()` (`:79`, still used by the empty state and by
  `recentAccomplishmentsReport()`) can stay as they are.

- **Weekly pace only ever draws as a line, with no way to see it as bars.**
  `weeklyTrendReport()` (`kanban/js/12-reports.js:421`) builds one `<svg
  class="trendchart">` (`:523`) out of `curve()` (`:480`), which always emits
  the smoothed multi-series line — the bands, dots and gradients all key off
  that one path shape, and there's no second renderer or state flag choosing
  between them. A toggle wants a `trendChartType` var beside `trendHidden`
  (`:387`, the same in-memory-only pattern already used for which buckets are
  switched off), a `barChart()` function drawing one `<rect>` per
  series-per-week stacked or grouped inside the same `W`/`H`/`col` geometry
  `curve()` already computes, and a small control in the chart's header —
  `.trendkey` (`:533`) is the nearest precedent for a row of buttons scoped to
  this chart. Line stays the default. `kanban/test_reports.mjs` wants a case
  for whichever state renders at rest and one for the switch.

- **The counted reports carry a caveat about undated finished work that can
  never appear.** `countedLeadHTML()` (`kanban/js/12-reports.js:336`) reads
  `undatedDoneCount()` (`:188`), which counts tasks that are `done` with no
  `doneOn`, so the lead note can say how much finished work the count cannot
  place. Nothing can ever be in that state by the time it is asked.
  `stampDoneDates()` (`kanban/js/04-tier-two-the-one-thing.js:80`) runs inside
  `load()` (`kanban/js/20-loading-saving.js:13`) and stamps every undated done
  task with today, on every load including a locked one; and `setDone()`
  (`04-tier-two-the-one-thing.js:377`) is the only thing in the app that sets
  `t.done`, and it always writes `doneOn` alongside. So the function returns
  nought for the life of the tab, and the sentence it guards is unreachable.

  Found 13 Sep 2026 while writing `kanban/test_reports.mjs`, which now asserts
  the nought so the pair stay honest. It is a real question rather than a
  deletion: the note was written when tasks ticked before the board dated them
  still existed, and `stampDoneDates()` is what closed that gap — so either the
  caveat goes, or it starts saying the thing that is actually true, which is how
  many finished tasks are carrying a stamped-on-load date rather than the date
  they were really finished. The second is more useful and costs a flag on the
  task at stamping time; the first is two lines. Worth deciding which.

- **`pa-do` is filed with the skills that read and write his to-do list, and it
  is the only one of them that makes work happen.** Its own SKILL.md says so —
  "This is the only skill in the set that causes work to happen rather than
  recording a decision about it" — while the other eight under
  `agents/pa_agent/skills/` all read `todo.md` or write it after a conversation.
  Execution is already its own thing with its own manifest, board, owner and
  lock: `agents/implementing_agent/stream.json`, `kanban/js/27-execution.js`,
  `data/.implementing-agent.lock`, and `agents/implementing_agent/implementing-agent.md`
  for the agent itself. None of that is the PA's, and the `pa-` prefix is what
  sends the next reader looking for it in the PA's brief, where nothing about
  execution lives. Moving it to `agents/implementing_agent/skills/` under a name
  without the prefix costs the folder move, repointing the
  `~/.claude/skills/pa-do` symlink, and the eleven references that name it by
  string — `CLAUDE.md:121` and `:167`, `agents/pa_agent/CLAUDE.md:24`,
  `agents/pa_agent/PA-PLAN.md:246` and `:259`,
  `agents/pa_agent/skills/pa/SKILL.md:305`, `agents/planning_agent/README.md:154`,
  `agents/implementing_agent/README.md:33`, `:38`, `:67`,
  `agents/implementing_agent/stream.py:21`, plus the label in
  `agents/pa_agent/pa-skills.svg:66` and the assertion in
  `kanban/test_execution.mjs:187`.

- ~~**The Reports window picker is the last segmented control that is not the
  shared tab.**~~ **Done, 13 Sep 2026.** `reportWindowSegHTML()`
  (`kanban/js/12-reports.js`) now emits `<span class="tabs small">` with
  `.tab`/`.tab.on` children, and `.repwindow-seg` and its three rules are gone
  from `board.css` — replaced by `.tabs.small` (`flex-wrap:wrap`, so it still
  wraps rather than pushing the date range off the edge) and `.tabs.small .tab`
  at the smaller of the Figma Tab component's two sizes: 12px, padding 4/9.
  Wiring was untouched — `#reportWindow` and `button[data-window]` didn't care
  which class drew them. `node kanban/test_execution.mjs`,
  `test_plans.mjs`, `test_schedule.mjs`, `test_chats.mjs`, `test_projects.mjs`
  and `test_notes.mjs` all still green (270 checks), plus a throwaway headless
  check that the picker renders as `.tabs.small` with seven `.tab`s and still
  switches and re-renders on click.

- **`.aic-addsub` is the one small button still outside `.btn`.** The five that
  were folded into `.btn.outline.small` and `.btn.dashed.small` on 12 Sep 2026
  — `.btn.mini`, `.addsub`, `.completeall`, `.qhold` — all live in
  `kanban/board.css`. The sixth, `+ New chat` and `+ Attach` in the task
  drawer's Chats field (`kanban/js/10-reference-sections.js:946-947`), takes its
  styling from `PACKAGES/ai_chat_engine`, which `ai_canvas` also loads. So the
  fold is a change to a shared package with a second consumer, and the Figma
  merge put it at Dashed/Small (12px, padding 4/9, radius 6) the same as
  `.addsub`. Worth doing with `ai_canvas` open beside it rather than blind.

- **The night's size is set in dollars, and nothing says how many plans he
  wants.** The batch loop in `run()` (`agents/planning_agent/plan.py:898`) stops on
  two things only — under `FLOOR` minutes of window left (`:87`) and
  `spent >= args.budget` against `PLANNING_AGENT_BUDGET` of $12 (`:79`) — so the
  count that lands is whatever $12 happens to buy that night — 10 plans on the
  first full batch, against 24 eligible. A third stop, `len(written) >=
  args.max_plans`, is two lines beside the budget one, and reuses the same
  `stopped` message shape. The setting has further to go than the check: the
  schedule file's existing `budget` key (`agents/planning_agent/schedule.py:31`) is
  read by `dashboard.py` alone — `run.sh:133` calls `plan.py` with nothing but
  the flags it was given — so a `max_plans` key added to `DEFAULTS`, `load()`
  and the dashboard's `fields` list (`dashboard.py:146`) still needs `run.sh` to
  pass it down, which no schedule value does today.

- ~~**Board, Matrix and Timeline take three tabs for three ways of drawing the same tasks.**~~ **Done, 12 Sep 2026.** The three collapsed into one tab, `renderViewTabs()` (`kanban/js/18-timeline.js:734`) drawing the current one plus a chevron that opens a `.dropdown-panel` of the three — same `group:'draw'` marking on their `viewDefs()` entries (`kanban/js/11-chat-cards.js`), same view ids, same fragments.

- ~~**Token Session and "What runs on a clock" take a whole track on Plans for two cards nobody reads across.**~~ **Done, 12 Sep 2026.** Both moved into a modal, `openRefCards()` (`kanban/js/13-plans.js`), opened from a button on the Backlog card's head. The grid is back to four tracks.

- ~~**`plans/actioned/` is read as though it were a night, and two things break on 5 October 2026 when the first folder is old enough for `prune()` to make it.**~~ **Done.** `kanban/server.py:909` now carries the fix: a plan pruned into `plans/actioned/` is no longer read as though its night were called "actioned" — `redoReplaced()` (`kanban/js/13-plans.js:548`) checks `p.resolution === 'superseded'` rather than comparing night strings.

- ~~**The companion shows the plans the night wrote and says nothing about the run that wrote them.**~~ **Done.** `companion/src/main/night.ts` reads `run.json` off the night's own folder and the renderer draws a summary line above the plan cards, per `companion/src/shared/types.ts`.

- ~~**The Reports window picker is a dropdown, so the seven ranges it holds are invisible until it is opened.**~~ **Done.** `repWindowHTML()` (`kanban/js/12-reports.js:829`) now emits `.repwindow-seg` as a row of buttons rather than a `<select>`.

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

  The hidden half is not dead weight: the implementing agent is handed the plan file
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
  `flushPara()`. Every plan hits it: `agents/planning_agent/PLAN-BRIEF.md` asks
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
  builds. It needs no route and no read of the planning agent's ledger, since
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
  (`agents/planning_agent/plan.py`) reads it back off the file.

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

- ~~**The diagonal stripes marking a weekend on the timeline read heavier than the working days either side of them.**~~ **Done.** `.tlweekend` (`kanban/board.css:638`) narrowed the solid band to 3px in the 12px repeat.

- ~~**A message on an Overview card runs to 400px before anything trims it, which is twenty lines of a column that holds three cards.**~~ **Done.** `.ref .msg` (`kanban/board.css:1783`) clamps to four lines (`-webkit-line-clamp:4` — three left the truncation label covering the last readable line, so it settled one line taller than first proposed) rather than a 400px height cap; `capMsgCards()` needed no change.

- ~~**The board's canvas has no way to straighten itself back out once dragging
  has piled boxes and cards on top of each other.**~~ **Closed 12 Sep 2026 —
  the canvas went instead.** A Tidy control was built for it on 10 Sep, ported
  from `tidyCanvas()` in `~/Code/ai_canvas`, and both it and the view it
  straightened were removed when the canvas came out of the board. The cards
  survive in the drawer's Chats field, stacked rather than placed, so there is
  nothing left to straighten. `ai_canvas` keeps its own version.

- ~~**The button that edits columns sits next to the button that edits buckets, not next to the control that filters by column.**~~ **Done.** `#editTiers` (`kanban/index.html`) now sits inside `#statusWrap`, beside the Status filter it actually governs.

- ~~**A project whose every task is done still wears the same "Live" tag as one with work outstanding.**~~ **Done.** `projectItemHTML()` (`kanban/js/26-projects.js:75`) now reads a third state, `.tag.projcompleted`, when `live && open === 0`.

- ~~**Delegate to Claude prints `rank:` as the row number but offers no way to change it, so the only way to reorder the list is to retype the tag on every task by hand.**~~ **Done.** `delegateSection()` (`kanban/js/10-reference-sections.js:585`) now renders a `draggable` grip on every ranked row, wired the same way the timeline's own drag-to-reorder is.

- ~~**Counted from the list weighs every finished task the same, so a bucket that closes out three L tasks reads identically to one that closes out three S ones.**~~ **Done.** `completedByCategoryReport()` (`kanban/js/12-reports.js:223`) now sums `EFFORT_N` per bucket alongside the task count, and says so plainly when nothing finished carries an effort tag.

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

- ~~**A recap he could paste into a status update means flattening the one report that already lists titles, not building a new one.**~~ **Done.** `recentAccomplishmentsReport()` (`kanban/js/12-reports.js:295`) is in `reportDefs()` alongside the other two.

- ~~**The planning agent's lock can sit held for a full day with nothing wrong, because staleness is judged by age alone.**~~ **Done.** `run.sh` writes the holder's PID to `$LOCK/pid` and tests it with `kill -0` before trusting the 2-hour mtime window at all; a dead PID clears regardless of age.

- ~~**Every plan comes back the same shape and the same length, whether the task needed three sentences or three days.**~~ **Done.** `PLAN-BRIEF.md` has a third shape, "### When the answer is short", and the fold bar is phrased as ask early rather than as a last resort.

- ~~**The Bucket field's dropdown button carries no chevron, so it doesn't read as a dropdown at rest.**~~ **Done.** `.bucketbtn::after` (`kanban/board.css:2164`) draws the chevron, flipped via `.open` the same way `.tlchevron` already does.

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

- ~~**The planning agent's first full batch spent the whole night on one
  bucket.**~~ **Done, 5 Sep 2026** (`dcbc109`). Found on the first real
  24-task run — Design System is 13 of the 24 and sorted first, so all 10
  plans the budget paid for were DS and three buckets got nothing. `in_order`
  in `agents/planning_agent/pick.py` now sorts on the board's own order, headline, date, then
  impact against effort — bucket is not a key at any level, so a short night
  interleaves instead of draining one bucket before the next starts. Also
  settles the open question of whether DS wants splitting into five streams:
  the ordering was the real cause, not the bucket's size.

- ~~**A plan whose agent wrote no `summary:` lists as `[fill in]`, and the
  file itself is worse than the symptom shows.**~~ **Done**, alongside the
  fold/hold work in `f540acd`. `write_plan` in `agents/planning_agent/plan.py` now strips the
  agent's own frontmatter entirely and writes one rebuilt block, so there is
  never a placeholder header sitting in front of a real summary two blocks
  down. A missing summary now reads plainly as "The agent wrote no summary
  line" rather than reusing `[fill in]`, which used to mean two different
  things.

- ~~**The nightly budget is set from figures four times too low.**~~
  **Done — closed, 7 Sep 2026.** `PLANNING_AGENT_BUDGET`
  in `agents/planning_agent/plan.py` is $12, chosen against two runs that cost $0.29 and
  $0.67. The first full batch averaged $1.23 across 10 plans and stopped on
  budget with 14 left. The whole 24 is around $30. $12 is a defensible ceiling,
  but it should be set against $1.23 rather than against $0.48.

  **Decided, 5 Sep 2026: leave it at $12.** Cost is already logged per plan and
  per night in `data/<dataset>/plans/planning-agent.log` (`agents/planning_agent/plan.py`'s own
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
  It holds anything queued outside 08:30–20:00, so the planning agent finishing at
  02:00 is heard about in the morning instead of at 02:00. It does *not* hold for
  weekends and holidays, unlike the morning briefing: that one is a scheduled
  interruption about a working day, this one answers something that just
  happened. The planning agent is its first caller.

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

- **Opening an accepted plan offers no way to start, or return to, the
  session actually carrying it out.** `openPlanModal()`
  (`kanban/js/13-plans.js:278`) draws the same four buttons — It is finished,
  Plan it again, Turn it down, Leave it alone (`:291-299`) — whether a plan is
  fresh out of review or already `state: accepted`, and none of them touches
  a session. The only way to carry one out today is `/pa-do`
  (`agents/pa_agent/skills/pa-do/SKILL.md`), typed into a terminal session
  he is already sitting in, because `implementing-agent` "only ever runs from
  a session he is in" (`agents/implementing_agent/README.md:30`) and never
  unattended. The plumbing that exists points the opposite direction from what
  this asks for: a running session announces itself onto
  `data/<dataset>/attach-queue.json`
  (`agents/pa_agent/skills/pa-attach/scripts/attach_session.py`), the board
  drains that queue on load (`kanban/server.py:1765`) and reads it back
  through its own "Attach a session…" button
  (`kanban/js/10-reference-sections.js:954`) — the board learns which session
  claimed a card, it never causes one to open. The planning agent already
  files its own session the same way when it writes a plan
  (`queue_attach()`, `agents/planning_agent/plan.py:613`), which is why a
  plan's frontmatter already carries a `session:` field (`plan.py:589`) — but
  that is the planning session that wrote the plan, not an execution one, and
  nothing records which session picked up an accepted plan. Doing this for
  real is two pieces of new infrastructure rather than a button: something
  that can actually open a terminal Claude Code session from a browser click
  (`ai_canvas/`, the Electron app that already draws one card per live
  session on a canvas, is the closest existing thing to look at), and a
  `production_session:`-style field on the plan, written back onto it the
  same way `attach_session.py` already writes onto the queue, for the modal
  to read on the way back in.

- **The four options on a plan's modal stop fitting once it has been
  accepted.** `openPlanModal()` (`kanban/js/13-plans.js:278`) offers the same
  "It is finished / Plan it again / Turn it down / Leave it alone" set
  (`:291-299`) to a plan sitting in Ready to be produced as to one just
  written. "Plan it again" (`replanPlan()`, `:390`) sends an already-accepted,
  possibly in-progress plan back to be written again tonight, and "Turn it
  down" / "Leave it alone" read as though the idea itself were still
  undecided rather than already agreed and under way. Worth revisiting
  together with the session-launching idea above, since whatever a session
  tied to the plan needs from the modal will change what belongs in this set.

- **Replanning a task writes a second plan file instead of replacing the
  first, so the same task can show two live cards on the Plans board at
  once.** `write_plan()` (`agents/planning_agent/plan.py:524`) always mints a
  fresh path — `out = os.path.join(paths.night_dir(day), slugify(task.title)
  + ".md")` at `:606` — keyed by the night, not the task. The nightly batch
  loop (`:948-1017`) points the ledger's `file`/`night` fields at that new
  file so `pick.is_stale()` (`agents/planning_agent/pick.py:265`) stops
  offering the task up again, but it never touches the plan file the ledger
  used to point at: that file's own `state:` frontmatter is left exactly as
  it was, and `/plans.json` (`kanban/server.py:1705`) lists every file under
  `data/<dataset>/plans/`, not just the one the ledger currently points at.
  Two failure paths land the same way. A task replanned because its
  fingerprint changed while an earlier plan still sat unread in `review`
  leaves both files at `state: review`, drawing two cards in Waiting for
  review for one task. A task sent back with "Plan it again"
  (`replanPlan()`, `kanban/js/13-plans.js:390`, which rewrites that plan's own
  frontmatter to `state: ready / owner: planning-agent`) gets a fresh
  `review` file the next night, but the `ready` file is never resolved —
  if the new plan is later accepted and finished, the old `ready` file is
  still sitting in To do, pointing at a task that is already Done.
  `agents/planning_agent/README.md:138` already documents the intended
  shape — a later plan should leave the earlier one `done / resolution:
  superseded` — but no code path writes that; the only thing that ever sets
  `resolution: superseded` today is a manual board action, not the nightly
  run.

  Genuinely one file per task rather than one per night is the fix Tiago
  asked for, and it is bigger than the write path alone: `prune()`
  (`plan.py:777`) walks `data/<dataset>/plans/<night>/` folders and deletes
  whole nights past `KEEP_DAYS` unless a file's status matches `KEEP_STATUS`,
  so a plan no longer filed by night needs its own place to live and its own
  rule for how long a finished one is kept. `history()` (`plan.py:259`) and
  `rejection()` (`:289`) both read the *previous* file to build the new one's
  History section and carry forward a rejection's reason — if there is only
  ever one file per task, that becomes an in-place rewrite that keeps its own
  History section, rather than a chain of files each holding one revision.
  The short-term version — write_plan() sets `state: done, resolution:
  superseded` on the ledger's previous file before minting the new one — closes
  the duplicate-card symptom without the storage change, if the two want
  splitting into separate pieces of work.

- **Every column on the Plans view is ordered one way — the priority of the
  task the plan is about — and there is no control to ask for another.**
  `byTaskPriority()` (`kanban/js/13-plans.js:541`) runs unconditionally inside
  `renderPlanReview()` (`:644`), `renderPlanDoing()` (`:669`),
  `renderPlanProduced()` (`:697`) and `renderPlanDone()` (`:735`), so a column
  holding three weeks of plans reads in score order and the one written last
  night sits wherever its task happens to rank. Half the wiring exists already:
  `colHTML()` takes a `sort` slot in the head (`kanban/js/09-columns.js:387`)
  that only the board fills, the button itself is built by the caller in
  `renderBoard()` (`kanban/js/18-timeline.js:981`), and the state behind it is
  `sortMode()`/`setSortMode()` (`kanban/js/03-tier-one-impact-effort.js:22-25`).

  Two things stop it being a slot to fill. `state.sort` is keyed by bare column
  name under a single `SORT_KEY = 'todo-board-sort'`, and four of Plans' six
  names — Backlog, To do, Waiting for review, Done — are the board's names too,
  so a sort set on one view would flip the other unless Plans carries a key of
  its own; `PROJECT_SORT_KEY` (`kanban/js/26-projects.js:25`) is the precedent
  for that. And the board's button toggles between priority and his own file
  order, which Plans has no equivalent of — a folder of plan files carries no
  hand order — so the second order is date written (`p.night`, read by
  `planGeneratedLabel()` at `:167`) rather than bucket or state: the natural
  complement to priority order, answering "what landed last night" where
  priority answers "what matters most", and the field is already on every
  plan. Nothing here reaches disk, so `kanban/test_plans.mjs`'s assertion that
  the view posts only `/stream/apply` and `/queue/order` still holds.

- ~~**The two agents are named on different axes: one says when it runs, the
  other says what it does.**~~ **Done, 12 Sep 2026.** `night_agent` is
  `planning_agent` and `execution_agent` is `implementing_agent`, and the six
  planners went with them — `plan-<stream>.md` is `planning-<stream>.md`, so
  every definition under the planning agent carries the family name. Both open
  calls were settled the same way, which is that the new name goes everywhere:
  the dashboard `id` changed from `night-agent` to `planning-agent` rather than
  being kept as a stable key, and the launchd job was unloaded, relabelled
  `com.tiagopedras.todos-planning-agent` and loaded again.

  What the rename reached, beyond a find-and-replace over 57 files in here and
  15 more across `agents-dashboard`, `improve_agent`, `SKILLS.md` and
  `~/Code/CLAUDE.md`:

  - **The data.** `core/migrations/migrate-agent-names.py` rewrote 65 `owner:`
    and `agent:` lines across 44 plans, runs and `ledger.json`. Nothing depends
    on it having been run: both manifests now carry an `owner_legacy` map
    beside the `legacy` block that already does this for the five status words,
    and `owner_now()` (`kanban/server.py:858`) resolves an old spelling on the
    way out of `plan_meta()` and `run_meta()`. A plan restored from a backup
    taken before today still draws in the column it belongs in.
  - **The files on disk that carried the name.** The lock
    (`data/.planning-agent.lock`), the schedule the dashboard writes
    (`data/planning-agent-schedule.json`), the readable log
    (`plans/planning-agent.log`) and launchd's two
    (`data/planning-agent.{out,err}.log`), all moved rather than recreated, so
    no night's history was dropped.
  - **The shared package.** `PACKAGES/work_streams/fixtures/generate.mjs` reads
    the plans manifest by absolute path and its fixture embeds a copy, so the
    fixture was regenerated and both `work_streams` suites re-run.
  - **The symlinks.** Seven in `.claude/agents/`, one per definition, plus the
    launchd one in `~/Library/LaunchAgents/`.

  Two things were deliberately left. `data/twinkl/todo.md` names both agents in
  four places and the `pa` skill is the only thing that writes it, so those are
  his to change. And the prose reflow: "night" became "planning" and "execution"
  became "implementing" inside wrapped paragraphs all over the repo, so a few
  hundred comment and Markdown lines now run a word past the margin.
- **The implementing agent cannot delegate a lookup, so every expensive read happens
  in the context that is also doing the writing.** `implementing-agent` holds
  `tools: Read, Grep, Glob, Write, Edit, WebFetch, WebSearch`
  (`agents/implementing_agent/implementing-agent.md:4`) and no Agent tool, so a run
  that needs a number out of a design system snapshot reads the whole capture
  itself. Read-only consultants for exactly that shape already exist outside
  this repo — `ds-analyst` is granted `Bash, Read, Grep, Glob` and answers a
  question about a snapshot without writing anything — and the implementing agent has
  no way to reach one.

  This is not the per-bucket proposal settled on 6 Sep 2026 and recorded above
  as "One implementing agent, `implementing-agent`, not one per bucket"
  (`IMPROVEMENTS.md:1471`). That was declined because six agents with write
  tools is six copies of one set of guard rails, and a consultant has no write
  tools to copy. The evidence is on disk: the six planners in `.claude/agents/`
  are all `tools: Read, Grep, Glob, WebFetch, WebSearch`, so specialisation was
  never the objection — writing was. Per-bucket knowledge stays in the brief
  files, which this does not touch.

  It earns its place only where a question has a large read cost and a small
  answer. Most runs write prose into a project folder against a plan the agent
  already holds, and a consultant there starts cold and re-derives context to
  answer something the agent could read itself. The thing to weigh before
  building it is that granting the Agent tool widens the one definition
  deliberately kept narrow, and what contains that is a fixed list of named
  read-only consultants rather than an open grant.

- ~~**Plans and Execution are two boards holding one pipeline, and the seam
  between them is a second manual gate on work he has already approved.**~~
  **Done, 13 Sep 2026.** One board. The Execution view, `kanban/js/27-execution.js`,
  `kanban/test_execution.mjs`, the runs stream and its server plumbing are all
  gone, and `agents/implementing_agent/` is the agent definition and its brief
  with no stream of its own.

  **Six columns rather than eight**, which the entry below left open and which
  he settled: the implementing agent only ever runs from a session he is sitting
  in, so there is never a card to watch move on its own, and six extra tracks
  would be spent drawing a state nobody watches. The stage rides on the card
  instead, as `production: none | doing | review | done` on the accepted plan,
  marked by `.planprod` in `kanban/board.css`. **If that agent ever becomes
  autonomous, the eight-column version is the one to build** — he said so
  directly, and `production` is already the right shape to be drawn as columns.

  A second field rather than more states because the contract allows one
  `state:` per document, and this answers a different question about the same
  one: `state` says where the plan is, `production` says what has happened to
  the work it describes.

  The data moved as the entry said: `core/migrations/migrate-fold-runs-into-plans.py`
  folded the three review-state reports (84, 48 and 104 lines) onto their plans
  under a `## What the implementing agent did` heading, closed the two `done`
  ones, and recorded the two empty stubs as `production: none`.
  `data/twinkl/runs.before-fold/` holds the originals.

  Two things had to change that the entry did not name. `accepted` could only be
  owned by the implementing agent, which was right while what happened next was
  a run on another board and wrong the moment the same card came back to him —
  so `OWNERS` in `agents/planning_agent/stream.py` takes `me` there too, and
  `test_planning_agent.py`'s "refuses accepted owned by him" became its
  opposite. And `pa-do` and `implementing-agent.md` both told the agent to move
  its own card, which it has never been able to do: it holds no Bash tool, so it
  cannot run the writer. The driving session writes both transitions now, which
  is what the entry below already decided and what "the board asks; the stream
  writes" says everywhere else.

  The original entry follows, kept because it is the reasoning the fold was
  built from.

  **Plans and Execution are two boards holding one pipeline, and the seam
  between them is a second manual gate on work he has already approved.**
  Accepting a plan writes `state: accepted` on the plan document, and `sync()`
  (`agents/implementing_agent/stream.py:238`) mints a second document into
  `data/<dataset>/runs/` that lands in Execution's Backlog, where nothing
  happens until he drags it to To do. On 12 Sep 2026 six plans stood accepted,
  all six had runs minted, and two were still sitting in Backlog untouched —
  the gate filters nothing, it is a step he has to remember. He wants the
  accepted plans to be the queue themselves, with Done as the final stage of
  whatever gets produced.

  The reason on record for two documents is `PACKAGES/work_streams/CONTRACT.md`,
  which allows one `state:` per file. That is an argument for one document with
  a longer column set, not for two boards: Plans already draws six columns
  through `colHTML()` (`kanban/js/09-columns.js:368`), with `planColumn()`
  (`kanban/js/13-plans.js:125`) mapping states onto them, and
  `Ready to be produced` is already the handover point both stream manifests
  name. Folding Execution in means `renderPlansView()`
  (`kanban/js/13-plans.js:1472`) growing the execution half onto the same cards,
  `runColumn()` and `renderExecutionView()` (`kanban/js/27-execution.js:36`,
  `:255`) going with the view, and `agents/implementing_agent/stream.json` either
  retiring or shrinking to the agent definition alone.

  Decided, 13 Sep 2026: fold the boards. The three review-state run documents
  carrying the implementing agent's full written reports move onto their plan;
  the two `done` runs and the two empty backlog stubs are dropped rather than
  migrated, since a completed state and an empty stub carry nothing a folded
  board needs to keep separately. What replaces the gate is nothing new — the
  overnight entry below still holds, so the implementing agent runs only from a
  session he is sitting in, and that is what stops six accepted plans running
  at once regardless of whether they sit in a queue or a separate column.

- ~~**A finished run and a dead one are the same document, because the acting
  agent cannot move its own card.**~~ **Done, 13 Sep 2026**, by the fold above
  rather than on its own terms. There are no run documents any more, so the
  state that read as "died mid-work" cannot occur; and the decision recorded
  here — that the driving session performs both transitions — is what `pa-do`
  now does, writing `production: doing` on handover and `production: review`
  when the report lands. `implementing-agent.md` no longer tells the agent to
  move its own card, which it could never do: it holds no Bash tool, so it
  cannot run the writer.

  The original entry follows.

  **A finished run and a dead one are the same document, because the acting
  agent cannot move its own card.** `implementing-agent` is defined with `tools:
  Read, Grep, Glob, Write, Edit, WebFetch, WebSearch` and no Bash
  (`.claude/agents/implementing-agent.md:4`), and the runs stream's writer is a
  subprocess — `agents/implementing_agent/stream.json` names `python3 stream.py
  --apply`, and `CONTRACT.md` allows exactly one writer per stream. So the
  agent has no way to run it. `pa-do` nevertheless says the transition is the
  agent's to make: "The agent asks the stream to set it, through
  `agents/implementing_agent/stream.py --apply`"
  (`agents/pa_agent/skills/pa-do/SKILL.md:88`), and then tells the driving
  session not to do it instead — "say so rather than setting it yourself: a run
  still owned by `implementing-agent` means the work did not finish". Both halves
  cannot be true. The only party instructed to move the run is the only party
  that cannot, and the reading the skill gives the resulting state is the
  opposite of what it means: every completed run looks like a session that died
  mid-work.

  Confirmed on disk 12 Sep 2026 — three runs handed over and reported on in
  full, all three sitting in `ready / implementing-agent`, indistinguishable from
  abandoned. The reports are in the run documents and are real work.

  Decided, 13 Sep 2026: the driving session performs both transitions —
  `doing` on handover, `review` on the report landing — which is what "the
  board asks; the stream writes" already says everywhere else, and which
  makes `pa-do:88` and its own next paragraph agree. `implementing-agent`
  keeps its current tool list; no Bash, no queue-file writer.

- ~~**Nothing moves a run to `doing`, so the Execution view cannot show one in
  flight.**~~ **Done, 13 Sep 2026.** `runColumn()` (`kanban/js/27-execution.js`)
  stopped folding `doing` into `ready`, and the view now draws five columns —
  Backlog, To do, Doing, Waiting for review, Done — matching the five states
  `agents/implementing_agent/stream.json` declares. Doing takes no drop, on
  the same reasoning `renderPlanDoing()` already carries for Plans' own Doing
  column: which run is running is not his to choose. `kanban/test_execution.mjs`
  covers both the column order and the no-drop guard.

  This is still only the smaller half. The entry above (finished vs dead —
  who is allowed to write `doing` and `review` in the first place) is
  unresolved, so no run will actually reach this column until that is
  decided; the column is built so it is ready the moment something does.

- ~~**A plan he does not want has nowhere to go but back to the planning
  agent.**~~ **Done, 13 Sep 2026**, as the entry decided: a `declined`
  resolution rather than an eighth state, drawn in Done beside completed and
  replaced. `planWord()` gives it its own word, `planColumn()` branches on it
  **above** the fallback so a declined plan written before the branch existed
  cannot read as accepted, and `planClass()` draws it folded like the other
  closed states. The modal has a fourth button, `declinePlan()`, which collects
  the reason the redo path already collects — the server refuses a decline
  without one, for the same purpose: the reason is all that is left of the idea.

  One thing the entry did not name. `is_stale()` in
  `agents/planning_agent/pick.py` would have reported a declined plan as "plan
  accepted on <date>", which is the opposite of true, so it has its own branch
  saying "turned down on <date>". Not stale either way — planning it again is
  exactly what declining exists to prevent.

  The original entry follows, kept because it is the reasoning this was built
  from.

  **A plan he does not want has nowhere to go but back to the planning agent.**
  `openPlanModal()` (`kanban/js/13-plans.js:236`) offers three moves — Accept
  it, Plan it again, Leave it alone — and every one of them keeps the task
  alive: `replanPlan()` (`:315`) sends it to `ready / planning-agent` to be
  written again, `parkPlan()` (`:344`) drops it into Backlog where the picker
  can still reach the task, and there is no way to say the idea itself is
  turned down. So a plan he has read and rejected outright either sits in
  Backlog looking undecided or goes round again for a second opinion he never
  wanted. It wants a fourth button in the modal, carrying the same reason the
  redo path already collects into `feedback`.

  Decided, 13 Sep 2026. It is a resolution rather than a state: `done` closes
  an item with `resolution` saying how, this stream already writes two —
  `completed` from `finishPlan()` (`:299`) and `superseded` from a replaced
  rejection — and a third, `declined`, is the cheaper answer and the one the
  contract's own test for an eighth state points at. It draws inside the Done
  column rather than a column of its own — a declined plan should read as its
  own word and colour next to completed and superseded, not sit somewhere
  separate from them.

  `planColumn()` (`:125`) needs a branch for the new resolution **above** the
  fallback on `:145`, which currently returns Ready to be produced for any
  state it does not recognise — so a declined plan written before that branch
  exists would draw as accepted. `planWord()` (`:75`) and `planStripe()`
  (`:108`) need the word and the colour, the same two functions that already
  tell `completed` and `superseded` apart. The implementing agent needs
  nothing: `stream.py --sync` in `agents/implementing_agent/` mints runs from
  accepted plans only, so a declined one never reaches Execution.
  `kanban/test_plans.mjs` wants a case for the new resolution in the Done
  column and the new move in its blocked-writes list.

- ~~**Archiving finished work should run on its own rather than wait for a
  click.**~~ **Done, 13 Sep 2026**, as decided: `ARCHIVE_DAYS` is 60, the header
  chip stays hidden, and `autoArchiveTick()` does the work with no press. The
  doing half came out of `archiveOldDone()` into `performArchive()` so the modal
  and the timer share one copy of the order the steps have to happen in — the
  copy reaches `done-archive.md` before the tasks leave the document, so a
  failure between the two leaves the work in both files rather than in neither.

  It runs hourly rather than on the autosave tick, which is where the entry
  pointed: a task crosses the sixty-day line at midnight and not a second
  earlier, so the two-second tick would be two thousand answers to a question
  that changes once a day. Once a minute after load as well, since the common
  case is a tab opened in the morning and left all day.

  Four guards, all four covered by the new `kanban/test_archiving.mjs` (21
  checks) — locked, no document, dirty, and a modal open. This is the only
  thing in the board that rewrites `todo.md` without being asked, so those
  guards are the whole of what makes it safe; dropping the row fails four
  checks, and archiving before the copy lands fails four more.

  Still open and named in the entry: `check_todo.py` has no archive reader, so a
  task that has aged out is invisible to the checker and to every `pa-*` skill
  that reads `todo.md` directly. That gap gets wider now that ageing out happens
  on its own.

  The original entry follows.

  **Archiving finished work should run on its own rather than wait for a
  click.** `ARCHIVE_CHIP_HIDDEN` (`kanban/js/25-archiving.js:39`) takes the
  "Archive N finished" button out of the header on every view; `archivable()`
  (`:24`) and `archiveOldDone()` (`:70`) are untouched underneath it, and today
  the only caller either of them has is `$('#archiveBtn').onclick` (`:138`) —
  so even unhidden, nothing moves a task into `done-archive.md` unless he
  clicks the button. Decided, 13 Sep 2026: raise `ARCHIVE_DAYS` (`:15`) from 30
  to 60, unhide nothing, and instead call `archiveOldDone()` on its own —
  the same load-bearing point `autosaveTick()` already fires from — so a task
  done more than 60 days ago moves itself out with no click required. Nothing
  prunes `done-archive.md` itself, so it stays the one record that outlives
  the rolling backups, and the working file stops growing without him having
  to remember to tend it. `parseArchiveEntries()` (`kanban/js/12-reports.js:120`)
  and `completedRecently()` (`:165`) still exist to rejoin the two files for
  reports, and `check_todo.py`'s missing archive reader is a real remaining
  gap worth fixing alongside this — a task that has aged out is invisible to
  the checker as well as to every `pa-*` skill that reads `todo.md` directly.

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
  working board. Decided, 13 Sep 2026: React with Vite and TypeScript, which
  converges this with `ai_canvas` rather than Preact's no-build path. Both
  `run.command` and `To-Do Board.app` bundle nothing today, so this is a real
  cost: they need to run the build before starting the server, which they
  don't do now.

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

  **The first two steps of that order are done, 13 Sep 2026**, on branch
  `port/component-layer`, and one of them turned out to be half-impossible.

  The round-trip fixture was mostly already built: `checkRoundTrip()` in
  `core/test_todo.mjs` round-trips all 226 lines of `kanban/demo.md` byte for
  byte, and `parse.json` already carried three whole-document cases both suites
  read. What was actually missing was the Python half, and the round trip cannot
  be built there at all — `todo.py` has no serialiser and `test_todo.mjs`'s own
  header says it never will. So the honest version of this step is that Python
  asserts the structure while JavaScript asserts the bytes, and what landed is
  `demo.md` added to the shared `docs` table by reference rather than by copy: a
  document now carries either its own `text` or a `file` naming a real document
  in the repo. Python went from five tasks across three hand-written shapes to
  all 33 in `demo.md`.

  The token set landed as the two-layer shape this entry asked for — primitives
  as ramps, semantics aliasing them per theme — with every one of the 31
  semantics resolving to the value it already had, bar six. Those six are the
  contrast bug named below, now fixed: `--accent` measured **3.61:1** on the
  dark panel against a 4.5:1 floor, and it is used as `color:` 22 times and as a
  border 9 more; `--agree` and `--reject` were 3.09 and 3.11. The dark theme now
  reads a lighter step from each ramp, and all three clear AA along with their
  `-ink` pairs.

  Two things were deliberately left, both because they change how the board
  looks rather than how it is built. The radius, spacing and type scales are
  defined and nothing reads them — 4/5/6/7/8px split 69 radius declarations and
  11 through 13.5px split 162 font-size ones, so collapsing them onto the scales
  is a small change everywhere and belongs with the view rewrites rather than a
  blind find-and-replace. And the ten bucket colours are named as a set but
  still hand-picked, since generating them off one ramp repaints every bucket on
  his board.

  **The scaffolding and the first view are done too, same day.** React 18 with
  Vite 5 and TypeScript, built to `kanban/dist/board-ui.js` as an IIFE hanging
  one global, `BoardUI`, loaded as an ordinary classic script so it joins the
  28-file source order rather than being deferred past it. `run.command` builds
  before it starts the server — decided against committing `dist/` and against
  having the server rebuild on stale, so the build is never the thing that is
  out of date — and `To-Do Board.app` execs `run.command`, so one place knows
  about it. `Column` and `Card` came first and are written to be the markup
  `colHTML()` and `cardShellHTML()` already emit; `kanban/ui/test_primitives.mjs`
  renders 37 cases both ways and fails on any difference, with no browser and no
  server.

  Projects is the first view off the string builders, and its 44 existing checks
  passed through unchanged, which is the evidence that the markup did not move.
  Two rules came out of it, both now in `CLAUDE.md`: a React view owns a node it
  created rather than `#lists`, because the unported views still assign to
  `#lists.innerHTML` and would tear the DOM out from under a live root; and the
  orchestration stays in `kanban/js/`, with the component taking the fetch's
  answers, `cvWhen` and `mdInline` as props.

  One thing worth knowing before the next build: Vite substitutes `NODE_ENV` for
  an application build and **not** in lib mode, so the first bundle carried
  React's development build and ten live references to `process` — 474kB that
  would have thrown on load. The `define` in `vite.config.ts` is the fix and the
  suite greps the built file so it cannot come back.

  **Backups went second**, once `kanban/test_backups.mjs` existed to judge it
  by — 36 checks, all passing unchanged across the port. Its four formatters
  stayed in `kanban/js/` and came down as props, because one of them,
  `backupWhen`, is Plans' as well, and moving the set would either split it or
  drag a shared helper into one view.

  **Reports went third**, 13 Sep 2026, after `kanban/test_reports.mjs` was
  written for it. One thing did not move and the reason is worth keeping: the
  lead note, the three counted reports and a written report's summary are still
  handed to the component as HTML, because `mdBlocks()`, `mdInline()` and the
  three report builders are shared with the drawer and with Plans. Porting them
  means porting those views in the same change, so they go through
  `dangerouslySetInnerHTML` until their own views are done — the same bargain
  ProjectsView already makes for a project's blurb.

  Splicing that view out left three superseded definitions behind — an old
  `renderWrittenReports`, an old `reportWindowSegHTML`, and an old
  `renderCountedReports` that wrote `innerHTML` into the two nodes React now
  owns. The last one is the one that mattered: a duplicate function declaration
  later in a classic script **wins**, so the dead copy was the live one and the
  suite passed against it by luck. Worth knowing for the ports still to come —
  after splicing a renderer out, grep the file for a second definition of every
  name you replaced.

  **And there the leaf views run out, which the order above gets wrong.** It
  lists `17-matrix.js` (293 lines) and `14-schedule.js` (348) among the views to
  port early, on their size. Size is not what decides it: only Projects,
  Backups and Execution are dispatched as views that own `#lists`. The Matrix is
  not a view at all — `matrixSection()` is called *inside* `renderView()` in
  `18-timeline.js`, which builds Overview and the Timeline in the same string,
  so porting it means porting that composition. Schedule is the same story one
  file over: `renderSched()` is a card drawn by `renderPlansView()` in
  `13-plans.js`. Both of those files are in the *last* tranche this entry sets
  out, so the order as written asks for the last tranche in the middle of the
  first.

  The two standalone leaf views are done and Execution is being folded away, so
  there is no third. What comes next is a real choice rather than a continuation
  — `13-plans.js` and `12-reports.js` as the entry's next tranche, or the
  `refSection()`/`colHTML()` composition in `18-timeline.js` that Matrix,
  Overview and the Timeline all hang off — and it wants deciding rather than
  drifting into.

  **Decided and begun, 13 Sep 2026: Plans, and its shell first.** `PlansView`
  draws the six columns and nothing inside them. The bodies still arrive as
  HTML from the sixteen `innerHTML` assignments in `13-plans.js`, which is a
  narrower bargain than the one ReportsView makes and is written into the
  component's own header rather than left to be discovered: four independent
  fetches fill those columns at different times and each paints as it arrives,
  so the shell is mounted once per visit and never re-rendered. Half-ported and
  re-rendering is the one arrangement that would silently drop a column, so the
  next step on this view is all sixteen at once, not some of them.

  Two things came out of doing it. `mountSync()` is new beside `mount()` —
  React 18 renders when it gets round to it, and Plans reaches into the nodes
  it just mounted, so the shell has to have happened by the time the call
  returns; `flushSync` is React saying this is not how it wants to be used, and
  it is right, which is why the only caller is this one and the fix is the same
  port finishing. And Plans gets a `#plansRoot` of its own, the same rule
  Projects already set.

  The evidence is `kanban/test_plans.mjs` passing all 123 checks unchanged,
  including the ten it makes about what the view is allowed to write.

  **And then all sixteen, the same day.** The paragraph above said the next
  step was all of them at once or none, and it was: `plansProps` is one object
  holding every body on the view, `paintPlans()` is the one place that renders
  it, and nothing assigns into the tree by id any more — including
  `renderStatus()` in `14-schedule.js`, which used to reach across from another
  file and hands its markup to `setPlansStatus()` now.

  What split the work was card kind rather than column. `PlanCard` is
  `planItemHTML()`'s twin and that builder is deleted, so the four columns
  holding nothing but plans are components; Backlog and To do hold queue rows,
  which go through `Card` directly. Two small things came with it and both are
  general. `Card` grew an `attrs` prop, because a card the board wires against
  carries `draggable` and its data attributes, and a pre-spelled attribute
  string would be a hole rather than a shape. And its rows take either nodes or
  `{__html}`, on the row's own div, because two of them are the board's own
  output — the task's score chips and a summary through `mdInline()` — and
  wrapping either in a span to carry it would put an element in the markup
  `cardShellHTML()` does not emit.

  One bug this found rather than introduced: the two plans-only columns refused
  a task by wrapping the drop handlers `wireColumnDrop()` had just assigned.
  That worked while every render built fresh nodes. React reuses them, so the
  wrapper would have wrapped the last paint's wrapper and the nesting would
  never have stopped — `wireColumnDrop()` takes the refusal as an argument now
  and assigns once.

  `planItemHTML()` going means `test_primitives.mjs` has nothing left to
  compare `PlanCard` against, so its three new cases render the card against
  `cardShellHTML()` given the rows a plan carries, written out longhand. That
  is the pattern for every builder that gets replaced outright rather than
  paired: pin the shape, not a second implementation. 37 cases now, and all 123
  in `test_plans.mjs` still pass.

  What is left on this view is the wiring, not the markup. The board still
  finds its own nodes by `[data-plan-open]`, `[data-plan-goto]` and
  `[draggable]` after every paint, which is what keeps `mountSync()` alive.
  `PlanCard` taking `onOpen` and `onDragStart` as props is the change that
  retires both.

  Still the next real choice, unchanged by any of this: `12-reports.js`, or the
  `18-timeline.js` composition.

  **One piece did not depend on any of the above, and it is done, 13 Sep
  2026** — though most of it turned out to be done already, which this entry
  had not noticed.

  What it asked for was a check in the one place every writer passes through,
  on the grounds that the board guards a save with mtime and the conflict modal
  in the tab, and both real overwrites of the live list got past that. The
  server-side half had in fact landed in `f040164`, the work-streams commit,
  before this entry was written: `do_PUT` already demanded `If-Unmodified-Since`
  and answered 428 without one, 409 when the stamp had moved, and behind that
  sat the writer lock and the migration gate.

  What was genuinely missing is the difference between a stamp and a hash, and
  the code's own comment named it: `Last-Modified` carries one second, so two
  writes inside the same second are indistinguishable and the later document
  lands on a file it never read. Closed now. Every read of `todo.md` carries
  `X-Todo-Hash` — a truncated sha256, added in `end_headers()` so `GET` and the
  watcher's `HEAD` both get it — the tab holds it as `state.diskHash` beside
  the stamp, sends it back as `If-Match`, and `do_PUT` refuses a mismatch with
  the same 409 the conflict modal already answers. `watchTick()` prefers it too:
  "did the bytes change" is a better question than "did the second change", with
  the stamp kept as the fallback for a server from before this.

  `If-Match` is checked when offered rather than demanded the way the stamp is.
  The board always offers it, so a write without one is a tab from before this
  landed or a script, and the 428 already holds both.

  `kanban/test_save_guard.mjs` is the suite, 16 checks, and the thing to know
  before editing it is that every `PUT` in it is meant to be refused and is
  given the file's own current bytes as its body — so a regression that lets one
  through rewrites `todo.md` with what it already said. It needs no browser. The
  accepting half is deliberately not in it: proving a correct pair writes means a
  real write, which is `data/_test` and a throwaway, and that was run once by
  hand rather than left in a suite anyone might run against the live list.

  Whenever this is picked up it runs on its own branch off `main`, never
  directly on it, and it is a weekly-allowance-sized spend rather than an
  evening's.

- ~~**Three views are drawn by nothing that tests them, and the component port
  wants to go through all three next.**~~ **Done, 13 Sep 2026.**
  `kanban/test_backups.mjs` covers Backups and the preview it opens — 36 checks
  — and `kanban/test_matrix.mjs` covers the Matrix, 36 more. Both are in
  CLAUDE.md's list.

  Two things came out of writing them. The first draft of the preview suite
  **passed with the lock guard removed from `saveFile()`**, which is the one
  guard the whole read-only mode rests on: `saveFile()` returns early on
  `!state.dirty` as well as on `state.locked`, so calling it against a clean
  document proves nothing. Both write checks now dirty the document first, and
  `autosaveTick()`'s rate gate is wound back too. Checked by mutation
  afterwards: dropping the guard from `saveFile()` fails three checks and from
  `setDone()` another — but dropping it from `autosaveTick()` fails nothing,
  because that function calls `saveFile()` and the guard there still holds. It
  is defence in depth rather than the thing doing the work, which is worth
  knowing before anyone tidies it away.

  The second is smaller and catches every fixture-based suite: the board mints a
  stable `id:` for any task without one at load time and marks the document
  dirty so the ids get written back. On a fixture that means the tab tries to
  save a file the suite invented. Every task in both new suites carries an
  explicit `id:`, which leaves nothing to mint.

  What the entry originally argued: `kanban/test_*.mjs` covers Plans,
  Execution, Schedule, Chats, Projects and Notes. It does not cover
  `kanban/js/15-backups.js` (129 lines), `16-backup-preview.js` (107) or
  `17-matrix.js` (293), and those are exactly the next three in the order the
  component-layer entry above sets out. Projects could be ported with
  confidence because 44 checks written against the old markup passed unchanged
  against the new; none of these three has that, so the same move on them
  proves nothing.

  Backup preview is the one to write first and the one to be most careful
  with, because it is not an ordinary view: it is the surface that sets
  `state.locked` to make a preview safe to look at, and CLAUDE.md's own testing
  rules lean on that lock being the thing that cannot save. A suite for it is
  worth having whether or not the port ever reaches it — a silent regression
  there is a tab that can write while it is showing a backup, which is the
  shape of both real overwrites of the live list.

  `kanban/test_projects.mjs` is the model to copy: stub the routes rather than
  reading disk, lock the tab before loading a fixture, tear every non-GET out
  of `fetch` afterwards, and assert the blocked list is empty at the end.

- **Every agent here is rationed by an allowance none of them can read, and the
  only way to read it headlessly is a throwaway terminal.** `core/windows.py`
  reconstructs the five-hour windows from `~/.claude/projects/*/*.jsonl`, and
  `record_limit()` (`agents/planning_agent/plan.py:325`) says in its own docstring
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

  This is not the planning agent's to own. `improve_agent` and
  `agents/planning_agent/` are two claimants on one allowance and a third would be
  a third, so the harvester belongs in `PACKAGES/` by the rule in
  `~/Code/CLAUDE.md` — anything two apps depend on moves there — and each agent
  reads it rather than carrying a copy.

  Decided, 13 Sep 2026, both halves. The number is advisory: `core/windows.py`
  stays the gate on time left, and the harvested figure is logged alongside
  rather than able to stop a night by itself — the harvester is new and
  unproven, and a night should not fail to start because a pty session failed
  to spawn. And the reading is written as a small log beside the plans rather
  than overwritten each time, since a percentage sampled twice a night is a
  series worth seeing trend over weeks, which is the actual point of
  harvesting it. The API call is what forces the sampling shape — it makes the
  harvest a once-per-batch reading rather than a per-task one, so it cannot
  catch a window filling up mid-night.

- **The board can start a conversation about a task but not about the list, so
  every PA sitting means leaving it for a terminal.** `newChat()`
  (`kanban/js/10-reference-sections.js:1048`) mints an owner key on a task and
  hands it to `chat.openNew()`, and `Runner.run()`
  (`PACKAGES/ai_chat_engine/engine.py:472`) shells `claude -p <prompt>` in the
  configured cwd — so `/pa-checkin` typed into that modal would run today, and
  what is missing is a chat that belongs to the board rather than to one card,
  plus somewhere in the header to open it.

  Decided, 13 Sep 2026, both halves. `state.locked` is set for the length of
  the turn rather than trusting `watchTick()` (`kanban/js/24-autosave-watching.js:47`)
  — the harder option, but a lock cannot lose an edit where a race can, and
  `watchTick()`'s quiet-reload is built around an occasional outside change,
  not a conversation that may write repeatedly in one sitting. And only the
  plain `pa` skill is reachable this way — ad hoc changes and
  re-prioritisation, the open-ended kind of turn a panel actually suits.
  `pa-checkin`, `pa-checkout`, `pa-focus` and the rest stay terminal-only
  sittings.

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
  (`agents/planning_agent/pick.py:278`) as the two half-written copies to fold in —
  this wants the same aggregation pointed at a past window rather than at today,
  so the two entries should be built as one piece of work or not at all.

  Where it runs is the easier half. A weekly render is unattended work on a
  budget, which is `agents/planning_agent/`'s machinery — the clock and lock gates
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
  (`agents/planning_agent/plan.py:53-72`) until someone edits that table by hand, so
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
  match — `planning-design-system.md` and `planning-work-oversight.md` to
  `planning-ds.md` and `planning-bau.md` (the naming this needs to land on —
  `bucket_agent()` builds the agent name as `"planning-%s" % stream`, so it has
  to be `planning-ds`/`planning-bau` rather than `plan-ds`/`plan-bau`, which is
  what an earlier pass at this entry said), with `buckets/design-system/` and
  `buckets/work-oversight/` renamed alongside them and the `.claude/agents/`
  symlinks repointed once. After that a new bucket needs nothing written down
  anywhere: the heading is the stream, and a new list needs only its own
  planner files, which a new stream needed regardless of where the mapping
  lived.

  A real regression turned up while checking whether the "safe half" of this
  entry (just the createDataset scaffolding, leaving STREAMS alone) could be
  done on its own. It can't: a scaffolded bucket needs its own stream identity
  to find its own brief folder, and today that identity only exists via
  `STREAMS`, which is the very thing direct slugification retires — so the two
  halves are one piece of work, not two.

  Checked against the real data 13 Sep 2026: `personal`'s only heading is
  `1. Personal Tasks` (`data/personal/todo.md:3`), and today that maps to
  `general` not because `STREAMS` names it — it doesn't, "tasks" is the only
  key close to it and "personal tasks" never matches that — but because
  *nothing* matches and `bucket_stream()` falls back to `FALLBACK_STREAM =
  "general"` (`plan.py:70`). Direct slugification would strip the leading
  number and lowercase the rest, same as it does for every other heading, and
  "Personal Tasks" would become the stream `personal-tasks` — a real,
  non-fallback stream with no `planning-personal-tasks.md` and no
  `buckets/personal-tasks/` folder, where today's `general` fallback has both.

  Decided, 13 Sep 2026: `personal-tasks` gets scaffolded properly rather than
  the heading being renamed to dodge it — a real bucket with its own brief and
  planner file, the same as DS or BAU, rather than sharing the general
  catch-all by accident. And the scaffolding this entry already builds for
  `createDataset()` extends to the bucket editor (`kanban/js/08-buckets.js`)
  as well: adding a bucket on a list that already exists is the same action as
  naming one at list creation, and today it is free text with nothing behind
  it, so both paths write the brief and the planner file as part of the
  action.

  Renaming is different from adding, and has to be, or the same regression
  just moves to a different verb: the slug a bucket's stream identity is built
  from is fixed at the moment the bucket is created, not re-derived from its
  heading on every read. `## N. Personal Tasks` renamed to `## N. Family
  stuff` keeps the same brief folder, the same planner file, the same stream —
  only the label he reads changes. That means the slug has to live somewhere
  other than the heading text itself once a bucket exists — a line in
  `buckets/README.md` beside each stream is the natural place, since that file
  already says which buckets a list has. `bucket_stream()` reads it there
  first and only falls back to slugifying the live heading for a bucket that
  has never been through the editor, which is what lets an old hand-written
  `todo.md` keep working unchanged.

  What is lost with the table is the whitelist half — an unmapped heading used
  to reach `general` and log loudly, which is how a renamed bucket got noticed.
  A slugified heading always resolves, so the loud log moves to the missing
  file instead: `bucket_agent()` naming a `planning-<stream>.md` that is not on disk
  is the same signal one step later, and it is a stronger one, since it names
  the file to create rather than a table row to add. With both creation paths
  scaffolding as they go, this log becomes a safety net for a hand-edited
  `todo.md` rather than the main defence.

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
  as `improve_agent/` rather than inside `agents/` beside the planning agent. Four
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
  reaches into `agents/planning_agent/paths.py`, and the hours are a per-repo
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
  was built from: `agents/planning_agent/` picks tasks by rule, spends only in a usage
  window that expires before 07:00 (`core/windows.py`), skips anything whose text
  has not moved since it was last reached (`ledger[task.title]`,
  `agents/planning_agent/plan.py:684-690`) and writes a plan per task. Most of that
  machinery is generic and points at this file with nothing new: the clock and
  lock gates in `run.sh`, the window arithmetic, the per-task budget and the
  twenty-minute floor all survive as they are, and only the picker is replaced,
  by a parser over the `- **` bullets under `## Small`. The two rules that parser
  needs are already written down once, in `skills/improve-list/SKILL.md`, which
  skips an entry starting `~~` as done and tags one whose own prose asks for a
  decision before anything can be built. They move into a shared reader rather
  than being described in a second place.

  What separates it from the planning agent is that this one can finish the work.
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
  `data/<dataset>/plans/queue-order.json` the way the planning agent's does, because
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
  planning agent hits the same field and does something different with it:
  `build_prompt()` (`agents/planning_agent/plan.py:199`) pastes `task.raw` plus
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
  (`agents/planning_agent/pick.py:71`) against the stored one, the same hash
  `ledger[task.title]` (`plan.py:684-690`) already uses to know a plan has
  been overtaken.

  The planning agent writes it, but not as a by-product of planning, because it
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

- ~~**The five reserved column names are enforced by an error message rather
  than by a field you cannot type into, and deleting one is not blocked at
  all.**~~ **Done.** Both halves landed: a reserved row's
  `input[data-tiername]` renders `disabled` in `draw()`
  (`kanban/js/09-columns.js:179`) rather than accepting a rename it will only
  refuse, and `confirmDeleteTier()` (`:141`) now checks `RESERVED_TIERS` before
  offering a destination select. `TODO_TIER`/`DOING_TIER` joined the three
  named constants `rollRecurring()` and `ensureTier()` match against.

  What is built: `RESERVED_TIERS`
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

- ~~**Nothing the PA runs logs how long the sitting actually took, so there is
  no way to say where his time with it actually goes bucket by bucket.**~~
  **Done.** `agents/pa_agent/skills/pa/scripts/log_sitting.py` writes
  `data/<dataset>/pa-time.json`, an append-only log of `{session, skill,
  started, ended, buckets}` per sitting — the whole duration against every
  bucket touched, per the decision recorded below. `start`/`end` read the
  wall clock rather than the model, keyed off `CLAUDE_CODE_SESSION_ID`.

  What was missing before this: None
  of the nine `pa-*` skills (`agents/pa_agent/skills/`) record a start or end
  time for themselves anywhere — `pa-attach`'s own queue entry
  (`agents/pa_agent/skills/pa-attach/scripts/attach_session.py`, written from
  `SKILL.md:39`) carries a task title and a `cwd`, nothing about when the
  conversation began or how long it ran. The one place a timestamp already
  exists is `SessionStore` in `PACKAGES/ai_chat_engine/engine.py:103`, which
  stamps `started`/`updated` on a session — but only for conversations launched
  through the board's own Chats field, not the terminal sessions
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
  headline-first ranking (`agents/planning_agent/pick.py:242`), agreeing with each
  other by hand rather than by sharing code.

  It goes in `core/`, beside `todo.py`, with fixtures of its own the way the
  format has: both callers are equals, and `pick.py` is the planning agent's, so
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
  Queue for tonight is what the planning agent will pick. It stays synthetic,
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
    `kanban/js/13-plans.js`, and `is_stale()` in `agents/planning_agent/pick.py`. `agreed`
    deliberately does **not** make a task stale — a plan waiting to be carried
    out must not be replaced overnight by a second opinion, which would put two
    live plans on one task.
  - **The rejection reason**, the question this entry left open. It goes in the
    plan's own frontmatter as `redo_note:`, written by the same route that
    already rewrites `status:`. `plan.py` follows the ledger row's existing
    `file`/`night` pointer to read it back and pastes it into the next run's
    prompt, so a rejected plan comes back different rather than identical. The
    server refuses a `redo` with no reason, since a reason is the entire point.
  - **One implementing agent, `implementing-agent`**, not one per bucket. The entry said
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

- ~~**Three changes to what the planning agent plans and what a plan is for,**~~
  **All three done.** Raised 5 Sep 2026 during a `pa-review-plans` review.

  - **Drop `partial` from the picker.** Done 6 Sep. `PLANNABLE` in
    `agents/planning_agent/pick.py` is `{"full"}`. A task passed over for its tag is named in
    the board's "not eligible" fold with the reason, rather than silently
    dropped — `ai:: none` is not, since that is his own statement that the task
    is his and the card already says it.
  - **A plan that hits an open question should stop there.** This was already
    built when the entry was re-read on 6 Sep: `outcome: folded` is written by
    `plan.py`, the rule is `agents/planning_agent/PLAN-BRIEF.md`, and the Plans list badges a
    folded plan "needs you". Landed in `f540acd` alongside the hold work.
  - **Plans should be actionable, not descriptive.** Done 6 Sep as the entry
    above. Agreeing a plan is now a real signal, and `implementing-agent` is what reads
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
  definitions run 41 to 76 lines, and `agents/planning_agent/planning-people.md` already carries the
  back-planning rules, the five hiring skills and the two confusable name pairs.
  And it proposed that each agent "should get its own skills"; what was built
  instead is one file per bucket that every agent reads, for the reason in the
  entry above.

  **What exists now:** `data/<dataset>/buckets/<stream>/<stream>.md`, one per stream plus the
  fallback, found by `bucket_stream()` in `agents/planning_agent/plan.py` — the same table
  that names the agent, so there is one mapping rather than two. Both the
  planners and `implementing-agent` are pointed at it. Each ships with a
  `<!-- NOT FILLED IN YET -->` marker, and `bucket_brief()` treats a file
  carrying that line as absent, so an unwritten brief costs nothing and no agent
  spends its attention on a page of empty headings.

  **What is left is the part only he can do**, which is what this entry always
  said was the blocker: the processes he actually runs in each bucket, what each
  produces, which skill already does it, and who is involved. That is now a task
  in Processes with a sub-step per bucket, DS and BAU first. `planning-people.md`
  is the worked example to copy from.

  Two things from the original entry that still stand:

  - **Output should vary by bucket and by task, not be one shape.** A message, a
    change on the board, a starting point for a background session. The "what
    finished looks like" heading in each brief is where that gets said. Raising
    a Jira ticket and writing into the design system directly are still TBD and
    still not to be built.
  - **The planners and the implementing agent are not the same agents.** Held. The
    `plan-*` contract — proposes, never executes, never touches `todo.md` —
    is unchanged, and `implementing-agent` is a separate definition with a separate tool
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

  Every one of the four proved itself against `node kanban/test_chats.mjs`,
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
  rather than asserting it. `node kanban/test_chats.mjs`, `test_plans.mjs` and
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
    `11-chat-cards.js`.

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
  tags) added back individually. Proved against `node kanban/test_chats.mjs`,
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
  Three jobs today: the planning agent's twelve launchd wakes, the companion's
  morning check, and the weekly backup thread inside the server.

  It needed both sources rather than one. Live (`launchctl print`, the plist's
  own wake times, the companion's lock) says whether a job is armed and when it
  fires next, which no log can know — a log will happily describe a job that was
  unloaded a week ago. The ledger (`plans/planning-agent.log`, `companion.json`,
  `backup_listing()`) says what actually happened, which `launchctl` cannot. A
  job that is not installed says so and gives the command to install it, which
  is the most useful thing the view says right now.

  The second card is the usage windows, which had no home outside
  `core/windows.py --history`: the last 30 days, night windows picked out, and
  the planning agent's own ride/open/stop decision as it stands this second. That
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
  2026**, as the **In flight** column in Plans, off a new `/planning-agent.json`, with
  a **Run the agent now** button on the same card (`POST /planning_agent/run`, which is
  `run.sh --force` started detached).

  It reads the lock and the log together, because neither is enough. The lock
  (`data/.planning-agent.lock`, held by `run.sh` for the length of a batch) is the only
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
  than lying, and `test_queue_routes` in `agents/planning_agent/test_planning_agent.py` holds
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
  draws with `cvCardHTML`, stacked; the canvas it shared that renderer with
  was removed on 12 Sep 2026. A `/pa-attach` skill
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
  why, in AI-CANVAS.md, which was dropped from the repo on 6 Sep 2026.

- ~~**An AI canvas, and cards in the drawer.**~~ **Canvas done, 4 Sep 2026.** A view of conversations with Claude
  laid out as cards and grouped by the task they belong to, the way `ai_canvas`
  groups sessions by project, with copies of the same cards in a task's drawer
  next to the prompt suggestions. For organising sessions rather than starting
  them, which is what keeps it off a second long-lived process. The filing
  layer comes out of `ai_canvas` into `ai_chat_engine` first so neither app
  keeps its own copy; the drawing stays per app, since one is React in Electron
  and this is one HTML file. The argument, what was decided and what is left
  were in AI-CANVAS.md, dropped from the repo on 6 Sep 2026; this entry
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
    "What the planning agent is doing right now, or last did.", and so on.
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
  against. All twelve suites in the repo (core, planning agent, companion, and
  the four board ones — 69/69, 39/39, 54/54, 48/48) pass clean against it,
  checked against the actual running server, not just the fixtures.

- **Quick wins wants a due-date order as well as its grouped/priority one, and
  Delegate to Claude goes back to an automatic sort.** `quickSection()`
  (`kanban/js/10-reference-sections.js:399`) groups before it sorts today —
  meetings with an agenda first by nearest date, then messages, then S-effort
  tasks, `byPriority()` ranking inside each. Decided, 13 Sep 2026: rather than
  replacing that with a flat due-date list, it becomes a second order he can
  switch to, the same toggle shape `sortMode()`/`setSortMode()`
  (`kanban/js/03-tier-one-impact-effort.js:22`) already gives the board's own
  columns — grouped/priority stays the default, due-date-first (undated at the
  bottom) is the alternative, and the groups collapse into one flat list only
  in that second mode. What is in the column at all is untouched, since those
  filters are about eligibility rather than order — `ai:full` belongs to
  Delegate, Backlog is parked on purpose, and a task waiting on another or on
  a `start:` date still counts in the held tallies rather than appearing.

  Delegate to Claude gained manual drag-to-reorder on `rank:` on 13 Sep 2026
  (this file, above). Decided the same day, after a re-read: drop it again in
  favour of the automatic impact-against-effort score this entry originally
  asked for (`EFFORT_N`, `core/todo.js:565`) — `delegateSection()` (`:577`)
  sorts by that score rather than by `rank:`. The tag stays, since the
  planning agent's queue orders by it, but `.refnum` beside each card shows
  the row's position rather than the stored rank, since the two no longer
  agree. The drag grip built for the manual order comes back out.

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
  from `kanban/test_chats.mjs` confirming nothing written. The dedicated test
  file this asked for arrived on 8 Sep 2026 with the folder listing above:
  `kanban/test_projects.mjs`, covering the tab as well as the drawer.

- ~~**`implementing-agent` is not to run overnight. What the night owes him is a
  report that agreed plans are waiting.**~~ **Done, 13 Sep 2026.** Raised
  6 Sep 2026 as a way to run it unattended, and settled the other way: it
  only ever runs from `pa-do`, inside a session he is sitting in, because
  being able to stop and ask is what makes it safe to hold write tools at
  all, and an unattended run is that design inverted. Not re-proposed.

  The reporting half is built. The terminology moved under this entry —
  `status: agreed` became `state: accepted` on a plan, and the actual queue
  that grows quietly is runs sitting `state: backlog` in Execution, minted by
  `stream.py --sync` and untouched until `pa-do` — so
  `count_backlog_runs()` (`agents/planning_agent/plan.py`) counts those rather
  than plans, reading frontmatter the same shallow way `plan_meta()` does.
  `announce()` now fires on that count alone, even on a night that planned
  nothing — the one gap this entry was raised for, since the old
  `if not written: return` made a quiet planning night silent regardless of
  what was waiting in Execution — and the notification's `view` points at
  Execution rather than Plans when that is the only news.
