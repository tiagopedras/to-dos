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

## Big

- Recurring tasks understand a weekday, a day of the month and a working day of
  the month. Cycles that are none of those still have to be hand-dated:
  fortnightly, the first Monday, quarterly, and the case that actually turned up
  — the design system drop-in, which alternates Thursday and Friday, so no
  weekday tag fits it at all. Add a form when a real meeting needs it rather than
  guessing at a syntax now.
- The roll writes to `todo.md` on load, so a day the board is never opened is a
  day nothing rolls. Harmless — the next load catches up in one go — but it does
  mean the dates are only as current as the last time the board ran.
- A way to sync a Jira board with this one.
