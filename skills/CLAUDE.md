# to-dos/skills

The `pa-*` skills: six ways of running the one list at
`to-dos/data/<dataset>/todo.md`. They are separate skills because they ask
different questions, not because they touch different data. Read
[../PA.md](../PA.md) and [../CONVENTIONS.md](../CONVENTIONS.md) before changing any
of them, since all six share both.

## The skills index

`~/Code/SKILLS.md` is the index of every skill I have written, across all four
skill folders. Any new skill added here goes into that file in the same session,
under the to-do list section, with a one-line description and the folder it lives
in. A skill that is not in the index is a skill I will forget I have.

## Packaging

`./build.command` writes every skill here to `dist/<name>.skill`. Run it after
changing any of them, and after changing `kanban/todo.py` — the build stages a
copy of that file into `pa-checkin/scripts/`, because `check_todo.py` imports the
`repeat:` grammar and the working calendar from it and an installed skill has no
repo to reach. Do not commit a copy of `todo.py` under `pa-checkin/`: one copy in
git, staged at build time, is the whole point.
