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

- **The nightly agent's first full batch spent the whole night on one bucket.**
  Found 5 Sep 2026, on the first real 24-task run. The queue is ordered
  Design System first, and DS is 13 of the 24, so all 10 plans the budget paid
  for were DS. People, Strategic and Processes got nothing at all, and every one
  of the 14 that went unplanned is in those three. The ledger carries them, so
  the second night is all non-DS, which is the opposite imbalance rather than a
  fix. What it probably wants is the picker interleaving buckets rather than
  draining them in order, so a short night is a thin spread instead of one
  bucket done and three untouched. This is also the night's spread the handover
  said would settle whether DS wants splitting into its five streams: it does,
  or the ordering does.

- **A plan whose agent wrote no `summary:` lists as `[fill in]`.** Found 5 Sep
  2026; 2 of 10 agents did it. `write_plan` in `nightly/plan.py` falls back to
  the literal `[fill in]` when the agent's own frontmatter carries no summary
  line, and that string is what `index.md` and the Plans view then show as the
  plan's whole description. The fallback is right to be visible rather than
  silent, but it should not be the placeholder text the brief uses for a fact
  the agent could not establish — those two meanings are now the same string.
  Either take the plan's first sentence, or say plainly that the agent wrote no
  summary.

- **The nightly budget is set from figures four times too low.** `NIGHTLY_BUDGET`
  in `nightly/plan.py` is $12, chosen against two runs that cost $0.29 and
  $0.67. The first full batch averaged $1.23 across 10 plans and stopped on
  budget with 14 left. The whole 24 is around $30. $12 is a defensible ceiling,
  but it should be set against $1.23 rather than against $0.48.

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
  It holds anything queued outside 08:30–20:00, so the nightly agent finishing at
  02:00 is heard about in the morning instead of at 02:00. It does *not* hold for
  weekends and holidays, unlike the morning briefing: that one is a scheduled
  interruption about a working day, this one answers something that just
  happened. The nightly agent is its first caller.

- **A card limit per column, with a "load more" at the bottom.** Long columns
  (Backlog especially) render every card at once. Capping the initial render
  and revealing the rest on demand would help scroll and layout on the busier
  lists.

- **Schedule should be part of Plans, not a view of its own.** Half done, 5 Sep
  2026: Plans now ends in a **Token windows** column, the same `renderUsage()`
  the Schedule view calls, so the question "would it even run tonight" is
  answered beside the queue it would run on. What is left is the other card,
  "What runs on a clock", and then retiring the view — the `schedule` view id,
  the `#schedule` fragment, `renderScheduleView()` and the header button, which
  also takes one item out of the crowded row below.

  Only `schedRow()` and `schedule_listing()` still need to move, and neither
  reads anything Plans does not already have. The layout question the entry
  used to raise is settled: Plans is a four-column `.lists.pview`, and a fifth
  card is a column rather than a rearrangement.

  One thing to decide before finishing it. Five columns is a lot for a view
  whose middle three are usually short, and "What runs on a clock" is the least
  urgent of them — it changes when a plist changes, which is rarely. It may
  belong under the in-flight column rather than beside it.

- **The top-right header is a flat row of buttons and dropdowns** — Undo,
  Download copy, Backups, the dataset switcher, AI filter, Urgent/due, search —
  crowded together with no grouping. Sort into themed menus or a sectioned
  dropdown (data actions, filters, list switching) rather than one long row.

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
- One `repeat:` grammar, in `core/todo.py`. `check_todo.py` imports it — the
  original from the repo, or the copy `skills/build.command` stages into the zip
  — and `core/test_todo.py` still holds the board's own answers as a frozen
  table, so the JavaScript third copy cannot drift either.

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
  - **15 dead CSS classes** in `board.css`: `ai-full`, `ai-partial`, `chk`,
    `cvhint`, `cvlive`, `hlset`, `impact-high`, `legendbody`, `mdlist`,
    `msglead`, `refchip`, `refholds`, `refnote`, `refwaits`, `ride`. Checked
    against dynamic construction (nothing builds `'ai-' + t.ai`) and against
    `ai_chat_engine`, which draws into the same page and could have owned them.
    None does. 15 rules, 24 lines, plus 19 selector lists to trim a name out of.
  - **No dead custom properties.** All 25 are read.

  So the ceiling is somewhere around 300 lines out of 9,300, which is 3%. Worth
  doing for the reasons below, not for the number.

  In rough order of what is actually worth it:

  1. **A `getJSON` / `postJSON` pair.** The single biggest cluster: 32 `fetch`
     call sites, 18 of them repeating `'?t=' + Date.now()`, 7 repeating the
     `Content-Type` and `X-Board` header block, 12 repeating
     `if (!res.ok) throw`, 4 repeating `res.json().catch(() => ({}))`. Two
     helpers collapse most of it, and the real gain is that a new endpoint stops
     being a copy-paste of an old one — which is how the cache-bust came to be
     on 18 of 32 rather than all of them.
  2. **`matrixPreview` / `trendPreview`** are 95% identical, nine lines each.
     One function with an argument.
  3. **`confirmDeleteBucket` / `confirmDeleteTier`** (64% alike, 26 and 24
     lines) and **`openBucketEditor` / `openTierEditor`** (46%, 76 and 71). A
     bucket and a tier are the same shape of thing with different labels, and
     these four have drifted apart in small ways already.
  4. **`openReportModal` / `openPlanModal`** and **`loadReportBody` /
     `loadPlanBody`** — 58% and 48%. Both are "fetch a Markdown file, render it
     into a modal, mark it read".
  5. **The dead CSS.** Trivial and safe, but it is 24 lines, so do it last and
     do not pretend it was the point.

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
  `test_schedule.mjs` between them boot the whole board and run 92 checks, and
  `core/test_todo.mjs` covers the format. A refactor that cannot be shown green
  in all four is not finished. Where a change is meant to be a pure move rather
  than a rewrite, prove it the way `board.css` was: reassemble the pieces and
  diff against the original.

- **The rest of `index.html` could be split the same way, and the survey is
  already done.** 7,500 lines, 24 banner-marked sections, one inline
  `<script>`. Cutting it into classic `<script>` files in source order works —
  classic top-level declarations share one global environment, which is exactly
  what `core/todo.js` is already relying on — and no section reads forward at
  evaluation time, with two exceptions, both in section 2:

  - `state.sort = readSort();`, where `readSort` is in section 3.
  - the `initViewFromHash` IIFE, which calls `isKnownView`, nine sections away.

  Both would move to a `boot.js` loaded last, beside the existing
  `loadFile(); loadJira(); loadDatasets();` at the foot of the file.

  One thing to know before touching the first: it is already broken. `readSort`
  reads a `const` declared 150 lines below it, so the `ReferenceError` fires
  every load and is swallowed by `readSort`'s own `try/catch` — which is why the
  saved per-column sort has never once restored. Moving that line fixes it as a
  side effect, so make the change deliberately rather than discovering it.

  Not obviously worth doing. The two lifts above each had a reason beyond size:
  the CSS was a different language, and the format needed a test. Cutting the
  remaining sections would only make the files smaller, and the banner comments
  already do most of the navigating.

- ~~**A list view of every cronned task tied to this app.**~~ **Done, 5 Sep
  2026.** A **Schedule** button beside Backups in the Data group, opening a
  full-pane view — a header button rather than a nav tab, as the entry asked.
  Three jobs today: the nightly agent's twelve launchd wakes, the companion's
  morning check, and the weekly backup thread inside the server.

  It needed both sources rather than one. Live (`launchctl print`, the plist's
  own wake times, the companion's lock) says whether a job is armed and when it
  fires next, which no log can know — a log will happily describe a job that was
  unloaded a week ago. The ledger (`plans/nightly.log`, `companion.json`,
  `backup_listing()`) says what actually happened, which `launchctl` cannot. A
  job that is not installed says so and gives the command to install it, which
  is the most useful thing the view says right now.

  The second card is the usage windows, which had no home outside
  `core/windows.py --history`: the last 30 days, night windows picked out, and
  the nightly agent's own ride/open/stop decision as it stands this second. That
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
  2026**, as the **In flight** column in Plans, off a new `/nightly.json`, with
  a **Run the agent now** button on the same card (`POST /nightly/run`, which is
  `run.sh --force` started detached).

  It reads the lock and the log together, because neither is enough. The lock
  (`data/.nightly.lock`, held by `run.sh` for the length of a batch) is the only
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
  than lying, and `test_queue_routes` in `nightly/test_nightly.py` holds
  `plan.py`'s own format strings filled in, so a change to the wording fails
  there rather than in the morning.

- **Render the description field as markdown.** It's a plain `<textarea>` —
  bold, links and lists all show as literal asterisks and brackets rather than
  formatted. Needs a decision on whether it's a toggle between editing the raw
  text and viewing it rendered, or a live preview alongside, and on how much of
  markdown to support given the field also holds the prompt/message suggestion
  scaffolding `suggestions()` parses back out of it.

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
