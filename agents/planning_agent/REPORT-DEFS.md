# Written report definitions

The tracked half of what `agents/planning_agent/report.py` renders — the rules
and the template, the same split `BUCKETS.md` at the repo root already makes
for bucket briefs: this file is what every list's definitions look like,
`data/<dataset>/reports/_defs/` is what one particular list's actually say,
and that folder is gitignored with the rest of `data/` because a definition
naming real Twinkl buckets and processes has to be.

One file per report kind, in that folder. Adding one there is the whole of
adding a shape for `report.py` to render — nothing else needs editing.
`report_listing()` in `kanban/server.py` never lists it as a report itself:
it only reads `.md` files directly in `reports/`, and never recurses into a
subfolder at all, so `_defs/` is invisible to it without any extra rule.

## Frontmatter

```
---
title: Design System, last 30 days
window_days: 30
buckets: Design System
---
```

- **`title`** is written straight onto the output's own `title:` frontmatter,
  so make it what he wants to see in the Reports list.
- **`window_days`** is how far back from tonight the report covers.
- **`buckets`**, comma-separated, or omitted for every bucket on the list.

## The body

Everything under the frontmatter is instructions, not a template — plain
prose telling the model what questions this report has to answer, the way a
brief tells a person. `report.py` hands it `core/aggregate.period_view()`'s
own answer for the window and buckets above — what finished, when, and in
which bucket — as the facts to write from, plus README.md's "Rules for
writing a report" inlined, so the result reads as one of his own rather than
a summary of a JSON blob: never a list of individual to-dos, outcomes rather
than activity, his voice, short.

That is the one real difference from `core/render.py`'s pa-mobile and
pa-checkin templates. Those fields are mechanical — a due date, a count, a
name — and Mustache is exactly enough language for them. What moved and what
it means is a judgement, which is why README.md's own rules for a written
report rule out an automated one that only lists what was ticked.
`period_view()` is the grounding that keeps the model from inventing what
happened; the writing itself still has to be written, by the model `report.py`
calls, not templated.

## Running it

```
python3 agents/planning_agent/report.py --dry-run
python3 agents/planning_agent/report.py --def design-system-monthly   one, by hand
python3 agents/planning_agent/report.py                               every def due this week, for real
```

Fires once a week — Sunday night, the same lock `plan.py`'s batch and
`brief.py`'s briefing pass already share, since all three are `run.sh`'s to
gate. A definition whose `window_days` has not completed a fresh multiple of
itself since the last render is skipped; see `report.py`'s own `due()`.
