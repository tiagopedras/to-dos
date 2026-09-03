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

Nothing outstanding right now.

## Big

- An undo button, for edits made on the board.
- Explicit dependencies between tasks/subtasks and other tasks: block marking a
  task complete while its dependency is still open, and exclude blocked tasks
  from quick-win suggestions in the Overview.
- Recurring tasks understand a weekday, a day of the month and a working day of
  the month. Cycles that are none of those still have to be hand-dated:
  fortnightly, the first Monday, quarterly, and the case that actually turned up
  — the design system drop-in, which alternates Thursday and Friday, so no
  weekday tag fits it at all. Add a form when a real meeting needs it rather than
  guessing at a syntax now.
- A recurring task keeps one previous agenda, not a history. One cycle is what
  writing the next agenda needs, so this is deliberate, but if reading a month
  back ever matters the roll is where the older one would be written out to.
- The roll writes to `todo.md` on load, so a day the board is never opened is a
  day nothing rolls. Harmless — the next load catches up in one go — but it does
  mean the dates are only as current as the last time the board ran.
- Teach `pa-retrieve-tasks` to revisit a declined meeting action on request.
  The watermark on the `Meeting actions last pulled` line means nothing is shown
  twice, which is right by default, but the only way back to something turned
  down is to name a wider window by hand and re-read everything in it. There is
  no record of what was declined or when.
- A timeline view, alongside the board and the Overview: cards laid out as bars
  across dates rather than stacked in columns. Needs a new `start:` key on the
  task line to sit beside the existing `due:`, since a bar needs two ends and
  only one of them exists today. A task with a `due:` and no `start:` still has
  to draw as something, either a milestone on its due date or a bar inferred
  back from it, so decide that before writing any of it. Sub-steps expand under
  their parent bar so a long task can be read as the smaller pieces it is
  actually made of, which means sub-steps need to carry their own dates too.
  Tasks with no dates at all are most of the list, so the view needs an honest
  answer for them rather than an empty screen: a tray of undated work beside
  the timeline is the obvious one, and dragging out of it is how a date gets
  set.
- A way to sync a Jira board with this one.
