# to-dos/agents/pa_agent

The `pa-*` skills: ten ways of running the one list at
`to-dos/data/<dataset>/todo.md`. Read [PA.md](PA.md) and
[../../CONVENTIONS.md](../../CONVENTIONS.md) before changing any of them, since
all ten share both.

## The hierarchy

Restructured 7 Sep 2026. They used to be a flat set where `pa-checkin` happened
to own the file format as well as the morning session, and the other five
reached across a skill boundary to borrow it. Now there is one writer and
everything else feeds it.

| Skill | What it is |
| --- | --- |
| `pa` | **The one that writes.** Every change to `todo.md` goes through it. It owns the tag syntax, the scores, the recurring meeting agendas, the headline, the optimisation pass, the checker and the Reload line. |
| `pa-checkin` | The daily session. Reads the list (and invokes `pa-retrieve-tasks` only when asked, since 22 Sep 2026), renders the brief from its own templates, asks what has moved, hands the changes to `pa`. |
| `pa-retrieve-tasks` | Intake from the meeting recorder. Reviews what it finds one at a time, hands what he kept to `pa`, owns the watermark's value. |
| `pa-mobile` | The phone surface over any of the above. Asks in multiple choice, renders from its own templates, writes through `pa`. |
| `pa-checkout` | Walks Doing and Reviewing. Reviews and asks; `pa` writes. |
| `pa-focus` | Walks To do and Doing, trimming what is not really in flight. Reviews and asks; `pa` writes. |
| `pa-review-plans` | Triages the planning agent's plans. Writes plan statuses through the board's own routes, hands task notes to `pa`. |
| `do` | Hands an agreed plan to `implement-agent`. That agent never writes the list, so its requested changes come back through `pa`. |
| `pa-attach` | Files a conversation against a task through `attach-queue.json`, which the board drains. Touches nothing else. |
| `pa-reports` | Makes a report off the list from its catalogue of types and sends it. Reads only; screenshots go through a locked headless board. |
| `pa-board` | Reads one column of one board as a numbered list, optionally one bucket, and shows a task's full properties on request. Reads only. |

**Why one writer.** The board holds the whole document in the browser and writes
all of it back when it saves, within seconds of anything marking the document
dirty, so a second editor is overwritten silently. That has taken the real list
twice. One skill owning the writing also means one place a convention can be
wrong, rather than six copies that drift.

**Why `pa` is a skill and not a subagent.** Writing means stopping to ask, and a
subagent cannot: it runs in its own context and returns one report, so every
question becomes a guess. It is the same reason `implement-agent` only ever runs
from a session he is in. The one job here that would suit a subagent is a
read-only status read, which `PA-PLAN.md` calls `board-read` and nothing has
needed yet.

The PA also exists as a session agent, `pa-agent.md`, run whole with
`claude --agent pa-agent` — a different thing from a subagent, since the whole
session converses the way `business-advisor-agent` already does, rather than
running in the background and returning one report. It changes nothing about
who writes: every `pa-*` skill invoked from that session, including `pa`
itself, works exactly as it does from any other session, and `todo.md` still
has the one writer.

## What lives where

- `PA.md` — standing behaviour, read by every skill and by the planning agent's six
  planners and `implement-agent`. It stayed a plain file rather than folding into
  `pa` precisely because those seven read it and never write anything.
- `../../CONVENTIONS.md` — the file format.
- `skills/pa/scripts/check_todo.py` — the mechanical checker. It lived under
  `pa-checkin` until 7 Sep 2026 and moved with the writing.
- `skills/pa/scripts/log_sitting.py` — logs how long a sitting took and which
  buckets it touched, into `data/<dataset>/pa-time.json`. Every `pa-*` skill
  calls it; see PA.md.
- `skills/pa/references/audit-checklist.md` — what to check by hand that the
  script cannot.
- `skills/pa/references/templates.md` — the report template syntax and the full
  field list, in one copy, read by every skill that renders a report.
- `skills/<name>/templates/` — the templates themselves. `pa-mobile`'s folder
  holds phone cuts of the same filenames and wins whenever the session is on a
  phone.

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

That is also what lets `pa/scripts/check_todo.py` import `core/todo.py`
directly, six folders up, rather than needing a copy staged next to it: the
symlink resolves back here and the repo is always in reach. Do not commit a copy
of `todo.py` under `pa/` — one copy is the whole point.
