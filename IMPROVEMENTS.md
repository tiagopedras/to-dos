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

- Give cards a minimum width, so on smaller screens the board scrolls
  horizontally instead of squeezing cards down.
- Let the user delete individual entries from the Message suggestions list in
  the task drawer's sidebar.
- An undo button, for edits made on the board.
- In the Overview, make every section collapsible, and collapsed by default.
- Limit how many cards show per column in the Overview.
- Explicit dependencies between tasks/subtasks and other tasks: block marking a
  task complete while its dependency is still open, and exclude blocked tasks
  from quick-win suggestions in the Overview.
- Let the user dismiss a quick-win suggestion in the Overview, so it stops
  reappearing without having to complete or edit the task.
- Teach `pa-retrieve-tasks` to revisit a declined meeting action on request.
  The watermark on the `Meeting actions last pulled` line means nothing is shown
  twice, which is right by default, but the only way back to something turned
  down is to name a wider window by hand and re-read everything in it. There is
  no record of what was declined or when.
