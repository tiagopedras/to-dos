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

- **The nightly budget is set from figures four times too low.** `NIGHT_AGENT_BUDGET`
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
    it. The decision that the execution agent does not edit `todo.md` itself was
    reconsidered in the same session: `execution-agent` **is** the writer, and the
    only one, rather than handing off to a second agent. One writer with the
    guard rails written down beat two agents each holding half of them.

- **The bucket agents need to be bound to their buckets more closely than they
  are, and given somewhere to grow.** Raised 5 Sep 2026. **The somewhere to grow
  was built on 6 Sep; the content is his and is a task on the list now.**

  Two corrections to this entry as it was written. It said the agents "know that
  [their bucket] only at the level of a one-line description in their
  frontmatter" — that was true when it was written and is not now. The six
  definitions run 41 to 76 lines, and `pa-plan-people.md` already carries the
  back-planning rules, the five hiring skills and the two confusable name pairs.
  And it proposed that each agent "should get its own skills"; what was built
  instead is one file per bucket that every agent reads, for the reason in the
  entry above.

  **What exists now:** `buckets/<stream>/<stream>.md`, one per stream plus the
  fallback, found by `bucket_stream()` in `agents/night_agent/plan.py` — the same table
  that names the agent, so there is one mapping rather than two. Both the
  planners and `execution-agent` are pointed at it. Each ships with a
  `<!-- NOT FILLED IN YET -->` marker, and `bucket_brief()` treats a file
  carrying that line as absent, so an unwritten brief costs nothing and no agent
  spends its attention on a page of empty headings.

  **What is left is the part only he can do**, which is what this entry always
  said was the blocker: the processes he actually runs in each bucket, what each
  produces, which skill already does it, and who is involved. That is now a task
  in Processes with a sub-step per bucket, DS and BAU first. `pa-plan-people.md`
  is the worked example to copy from.

  Two things from the original entry that still stand:

  - **Output should vary by bucket and by task, not be one shape.** A message, a
    change on the board, a starting point for a background session. The "what
    finished looks like" heading in each brief is where that gets said. Raising
    a Jira ticket and writing into the design system directly are still TBD and
    still not to be built.
  - **The planners and the acting agent are not the same agents.** Held. The
    `pa-plan-*` contract — proposes, never executes, never touches `todo.md` —
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

- **Making the code shorter is a different job from splitting it, and mostly
  there is nothing to cut.** Surveyed on 5 Sep 2026, after the split, because
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
- The roll writes to `todo.md` on load, so a day the board is never opened is a
  day nothing rolls. Harmless — the next load catches up in one go — but it does
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

- **The Plans token graph needs rework.** Superseded rather than done: this
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

- **Drop the descriptions on the bucket columns in the board.** He didn't
  write them. Found on inspection: this is the text under each `## N. Name`
  heading in `todo.md` itself (`bucket.intro`, parsed and round-tripped by
  `core/todo.js`/`.py` but never rendered anywhere on the board — e.g. "BAU"
  carries none, "People" carries "Probation reviews, performance reviews,
  hiring, 1:1s, growth conversations."). Not touched here: it's a straight
  edit to the live `data/twinkl/todo.md`, and CLAUDE.md is explicit that only
  the board itself (or the `pa-*` skills) should write that file — a stray
  edit from outside it, while the board might be open and autosaving, is
  exactly the kind of overwrite the "Testing the board" section warns about.
  Wants a `pa-checkin` pass, or an in-board edit, rather than a file edit from
  here.

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

- **The Plans page had five cards doing the job three could do.** Restructured
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

- **Add different ways to sort "Quick wins" and "Delegate to Claude."** Not
  started — needs him to say what the alternative sort orders actually are
  before there's anything to build.

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
  from `kanban/test_canvas.mjs` confirming nothing written. No dedicated test
  file for this view yet — `kanban/test_canvas.mjs`, `test_plans.mjs` and
  `test_schedule.mjs` don't touch it, so a `test_projects.mjs` on the same
  pattern is still worth adding before this view is touched again.

- **Find a way to run `execution-agent` automatically overnight**, raised
  6 Sep 2026. Right now it only runs from `pa-do`, inside a session he is
  sitting in — see `CLAUDE.md` under "The acting agent". That was a deliberate
  choice, not an oversight: the reason given is that it can stop and ask,
  which is what makes it safe to hold write tools at all, and the planners
  cannot do that. Running it unattended at night is the opposite of that
  design, so this is not a small change — it needs its own answer to "what
  does it do when it would otherwise stop and ask a question", agreed with him
  before anything is built, not assumed by whoever picks this up. Candidates
  worth weighing: only auto-run plans that need no judgement calls (rare in
  practice), give it a way to leave the question on the plan or the task for
  the morning instead of blocking, or narrow "automatically" to something
  short of the full night agent, e.g. a fixed nightly batch size he has
  pre-agreed to.
