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

- **A card limit per column, with a "load more" at the bottom.** Long columns
  (Backlog especially) render every card at once. Capping the initial render
  and revealing the rest on demand would help scroll and layout on the busier
  lists.

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
- One `repeat:` grammar, in `kanban/todo.py`. `check_todo.py` imports it — the
  original from the repo, or the copy `skills/build.command` stages into the zip
  — and `kanban/test_todo.py` still holds the board's own answers as a frozen
  table, so the JavaScript third copy cannot drift either.

## Big

- **Render the description field as markdown.** It's a plain `<textarea>` —
  bold, links and lists all show as literal asterisks and brackets rather than
  formatted. Needs a decision on whether it's a toggle between editing the raw
  text and viewing it rendered, or a live preview alongside, and on how much of
  markdown to support given the field also holds the prompt/message suggestion
  scaffolding `suggestions()` parses back out of it.

- **A desktop widget holding message suggestions, ready to copy.** Prompt
  suggestions today live on a task's row or drawer, one click away but still a
  trip into the board. A standing widget — companion-adjacent, always on
  screen — could surface the suggestions ready to grab without opening a tab.
  Needs a decision on where it lives (the companion, or its own thing) and how
  it stays in sync with the board's own copy/delete-on-send behaviour.

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
