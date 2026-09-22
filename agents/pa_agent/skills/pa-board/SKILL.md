---
name: pa-board
description: Read one column of one of the owner's boards, at Code/to-dos/data/<board>/todo.md, as a numbered list of task names, optionally narrowed to one bucket, and then show the full properties of any task he picks by number. Asks which board, which column and whether to show one bucket, as multiple choice. Use whenever he asks to see, read, list or show a board or a column, "what's in Doing", "show me the Backlog on personal", "what's in To do for DS", "list my pet-projects Reviewing", "read me a column", or picks a number from that list and asks for the detail of the task. Reads only. Do not use it for the daily check-in, which is pa-checkin, for walking Doing and Reviewing to decide what moves, which is pa-checkout, or for any change to a task, which is pa.
---

# Reading a board, one column at a time

**Read `~/Code/to-dos/agents/pa_agent/PA.md` first.** It holds the tone and the
standing rules, which are not repeated here.

This skill reads and never writes. Everything goes through one script, which
uses the shared parser in `core/todo.py`, so it reads the file the way the board
does:

```
S=~/Code/to-dos/agents/pa_agent/skills/pa-board/scripts/board.py
python3 $S boards
python3 $S buckets --board <board> --column <column>
python3 $S list    --board <board> --column <column> [--bucket <bucket>]
python3 $S show    --board <board> --column <column> [--bucket <bucket>] --n <number>
```

## 1. Ask

Skip any question he already answered in his request ("show me Doing on
personal" answers the first two). Never leave the third out.

The bucket options depend on the board, so the board is asked first, on its
own, and the other two together once it is known.

1. **Which board?** One option per line of `boards`. The one marked current goes first.

Then run `buckets --board <board>` and ask the next two in one AskUserQuestion call:

2. **Which column?** In the order the board draws them, left to right: Backlog,
   To do, Doing, Reviewing. AskUserQuestion takes four options at most, so Done
   is reached through Other, and the Reviewing option's description says so.
3. **Which bucket?** "All buckets" first, then the board's buckets as options in
   board order. Four options at most, so a board with more than three buckets
   shows the first three and names the rest in the last bucket option's
   description, for Other.

## 2. List

Run `list` and print what it returns as it is: a numbered list of task names,
with the bucket in brackets when he asked for all buckets. One line above it
naming the board, the column and the count. Nothing else, and no comment on
the tasks.

An empty column is one line saying so.

## 3. Show

When he answers with a number (or a name from the list), run `show` with the
same board, column and bucket and that number. Print the properties, then the
notes and sub-tasks as they come back. Don't summarise or comment on them.

He can ask for another number from the same list without the questions again.
If he names a different column or board, go back to step 1 for just what changed.

## What it doesn't do

It doesn't change anything. When he wants to tick, move or edit a task he
has just read, hand that to the `pa` skill.
