# to-dos

A personal task system made of two halves: a Kanban board that reads and writes a
single markdown file, and a skill that runs a review session over that same file.

The list itself is **not** in this repo. It holds real tasks about real, named
people, so `todo.md` and its backups are ignored. What is here is the machinery.

## The board

`kanban/kanban.html` is one self-contained page. No build step, no dependencies.
It parses `todo.md` into buckets, states and tags, renders them as columns, and
writes the file back when you save.

`kanban/server.py` is a small local server so the page can read and write its
neighbouring file — a browser will not let a page opened straight off the disk do
that. It listens on `127.0.0.1` only, refuses to write anything except `todo.md`,
and takes one backup per run before its first save.

Start it by double-clicking `board.command`.

### How the board prioritises

Two tiers, at two different moments.

**Impact against effort, at intake.** Every task carries `impact:high|med|low`
and `effort:S|M|L`. Any column can be sorted on impact divided by effort, so a
med/S beats a high/L — high impact for the lighter lift comes first. A task
missing either score shows a *needs scoring* marker and is counted in the header,
because a blank score reads as low and the task sinks without anyone deciding it
should. Sorting never rewrites the file: your own order is still the file order.

**The one thing.** A single task carries `headline:<date it was set>` and appears
in a bar above the columns, with a count of how many other tasks it frees. It is
the task that makes the others easier or unnecessary, which is a different
question from which one scores highest. It stays chosen until it is solved.

### Views

Everything else is worked out from tags at render time, never stored twice:

| View | Built from |
| --- | --- |
| This week | `week` |
| Quick wins | `effort:S` grouped by `ai:`, plus any step with a written message. Anything waiting on an unfinished blocker is left out. |
| Big rocks | `impact:high` and `effort:L` |
| Dependency chain | `blocked-by:`, resolved against `#slug` |
| Delegate to Claude | `ai:full`, ordered by `rank:` |

These used to be sections written into the file by hand, which meant they drifted
from the tasks they described. Deriving them removed that whole class of bug.

## The skill

`skills/pa-todo-meeting/` is a Claude skill that runs the review session: read
and report, ask what changed, apply updates, optimise, check the one thing,
verify. It is packaged as `skills/pa-todo-meeting.skill` for installing.

`scripts/check_todo.py` is a mechanical checker — dates on weekends, sub-steps
running past their parent, a `blocked-by:` pointing at nothing, duplicate ranks,
more than one `headline:`, missing scores. Run it directly:

```bash
python3 skills/pa-todo-meeting/scripts/check_todo.py todo.md
```

`references/conventions.md` is the file format. `references/audit-checklist.md`
is what to check by hand that the script cannot.

## File format

```
## 1. People                      <- bucket
### Doing                         <- state
- [ ] **A task** `impact:high` `effort:M` `due:2026-08-21` `ai:partial`
  - [ ] A sub-step `due:2026-08-19` `ai:full`
    - Suggested message: "..."   <- ready to send
    - Prompt: "..."              <- ready to paste
```

Tags work on sub-steps as readily as on tasks, and usually belong there.
