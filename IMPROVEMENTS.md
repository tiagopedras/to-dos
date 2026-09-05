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

- **The Schedule view cannot show a run that is happening right now.** It reads
  the last *finished* run out of `plans/nightly.log`, so an agent batch in
  progress looks identical to one that ended an hour ago, and the view does not
  refresh anyway — you have to leave it and come back. A run takes minutes per
  task and twenty-odd tasks a night, so this is most of the time it is
  interesting.

  Most of what it needs is already on disk. `run.sh` holds `data/.nightly.lock`
  for the length of a batch, which is the only thing that distinguishes "still
  going" from "died half way" — the log looks the same either way. And the log
  now carries a `  > <task> (<agent>)` line written *before* each agent starts,
  added 5 Sep 2026 for exactly this, so the task in flight can be named rather
  than only the ones already finished. Counting `planned`/`failed` lines since
  the last `start:` gives the progress against the total that line records.

  What needs deciding is the front end. The view fetches once on render, so it
  wants either polling while a run is live or a proper stream, and polling every
  few seconds on a view somebody has left open all day is the kind of thing that
  is easy to add and annoying to notice later. Worth settling that before
  building the server half, which is otherwise about fifteen lines.

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
