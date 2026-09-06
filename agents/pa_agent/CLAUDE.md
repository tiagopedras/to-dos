# to-dos/agents/pa_agent

The `pa-*` skills: eight ways of running the one list at
`to-dos/data/<dataset>/todo.md`. They are separate skills because they ask
different questions, not because they touch different data. Seven of them read
the list or write to it after a conversation with him; `pa-do` is the one that
causes work to happen, by handing an agreed plan to the `execution-agent` agent. Read
[PA.md](PA.md) and [../../CONVENTIONS.md](../../CONVENTIONS.md) before changing any
of them, since all seven share both.

## The skills index

`~/Code/SKILLS.md` is the index of every skill I have written, across all four
skill folders. Any new skill added here goes into that file in the same session,
under the to-do list section, with a one-line description and the folder it lives
in. A skill that is not in the index is a skill I will forget I have.

## No packaging

These are symlinked into `~/.claude/skills/`, not packed. There is no build step
and no `dist/`, both dropped on 6 Sep 2026 — an archive beside a folder is a
second copy that goes stale the moment the folder is edited, and every one of
them had. Add a skill by linking it:

```sh
ln -s ~/Code/to-dos/agents/pa_agent/skills/<name> ~/.claude/skills/<name>
```

The folder is the source, so an edit takes effect the next time the skill fires.

That is also what lets `pa-checkin/scripts/check_todo.py` import `core/todo.py`
directly, six folders up, rather than needing a copy staged next to it: the
symlink resolves back here and the repo is always in reach. Do not commit a copy
of `todo.py` under `pa-checkin/` — one copy is the whole point.
