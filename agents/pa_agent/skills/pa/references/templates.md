# Report templates

Most of what the PA says back is rendered from a template rather than written
freehand, so the same report comes out in the same shape every time and he can
scan it instead of reading it. That covers the reports he reads — the morning
brief, the week ahead, the agenda for a meeting he is about to walk into — and
the reply after the list has been changed, `pa/templates/change-report.md`,
which is where the length of that reply is now decided.

This file is the syntax and the fields, in one copy. The templates themselves
live with the skill that produces the report, in its own `templates/` folder.

## Where they live, and which one wins

A skill reads its whole `templates/` folder at the start of a session and picks
one, so adding a file there is the whole of adding a report shape. Nothing else
has to be edited.

`pa-mobile` has a folder of its own holding the same filenames. **When
`pa-mobile` is the surface, its twin wins**, because a report written for a desk
is three screens on a phone. Where it has no twin for the template it needs, it
says so in one line and asks rather than rendering the desk version, and a
template for it goes on the list of things to write later.

These files are his. The wording, the order, the headings and the length are all
decisions the template makes rather than the skill, so changing a line in one
changes what comes out tomorrow morning.

## Frontmatter

```
---
name: morning-brief
use: the default. He has opened the app and wants to know what today looks like.
lines: 12
---
```

- **`name`** is how the skill refers to it. Match the filename.
- **`use`** is how the skill picks. Write it as the situation, not the content,
  since that is the thing being matched against what you asked for.
- **`lines`** is a hard ceiling on the rendered output. Past it, the skill cuts
  from the bottom and ends with `+3 more`. It never reflows the template to fit,
  so a ceiling that is too tight loses real information quietly. Twelve is about
  a phone screen.

## Placeholders

A single value in double braces, `{{headline}}`, is replaced by that value.

**A placeholder with nothing to fill it drops its whole line**, rather than
printing an empty one or the word "none". So a line that only makes sense
sometimes can just sit in the template.

A list is a block:

```
{{#each overdue}}
- {{title}} · {{days}}d over
{{/each}}
```

Everything between the two markers repeats once per item, and the fields inside
belong to the item. A block with nothing in it renders nothing at all,
including any heading you put inside it.

For the empty case, `{{#none}}` renders only when the list is empty:

```
{{#none overdue}}
Nothing overdue.
{{/none}}
```

Those three are the whole syntax. There is no condition, no maths and no
formatting. If a template needs any of that, the skill is doing it wrong.

## Fields

**About today**

| Field | What it is |
| --- | --- |
| `date` | Today, long form. `Thursday, 3 September 2026` |
| `date_short` | `Thu 3 Sep` |
| `week_start` | The Monday of the current week, `Mon 1 Sep` |

**The headline**

| Field | What it is |
| --- | --- |
| `headline` | The title of the task carrying `headline:` |
| `headline_bucket` | Its bucket, `Design System` |
| `headline_age` | Whole days since the headline date |
| `headline_next_step` | The first unticked sub-step under it |

**Lists**, each item carrying `title`, `bucket`, `state`, `impact`, `effort`,
`ai`, `due` (long), `due_short` (`Fri 5 Sep`), `days` (whole days over or until,
never negative) and `who` (from `[to:: ]`, or a `Waiting on:` note).

| List | What is in it |
| --- | --- |
| `overdue` | Past `[due:: ]`, not ticked, not in Waiting review |
| `due_today` | Due today |
| `due_tomorrow` | Due tomorrow |
| `due_this_week` | Due between today and Sunday |
| `doing` | Top-level tasks in Doing, every bucket |
| `waiting` | Top-level tasks in Waiting review |
| `blocked` | Top-level tasks in Blocked |
| `week` | Anything tagged `week`, tasks and sub-steps both |
| `done_today` | Ticked with today's `done:` date |
| `quick_wins` | S effort, unblocked, `start:` arrived, or carrying a message |
| `delegate` | `[ai:: full]`, in `rank:` order |

**Meetings**, each carrying the fields above plus `agenda_state`, which is
`written` or `not written`.

| List | What is in it |
| --- | --- |
| `meetings_next_two_days` | Recurring tasks dated today or tomorrow |
| `meetings_this_week` | Recurring tasks dated inside the week |

**One named meeting**, for `meeting-prep`. Set from the meeting you asked for.

| Field | What it is |
| --- | --- |
| `meeting` | Its title |
| `meeting_date_long` | The occurrence date, `Wednesday, 9 September 2026` |
| `agenda` | Its topics, each with `topic` and `context` |
| `previous_agenda` | Last cycle's topics, same two fields |

**What the read turned up**, for a desk report that has room for it. Each item
in `slipped` and `context_dates` carries the fields below rather than a task's.

| List | What is in it |
| --- | --- |
| `checker_flags` | What `check_todo.py` flagged, each carrying `flag` |
| `slipped` | Dated tasks whose date passed between `Last updated` and today, each carrying `title` and `days` |
| `context_dates` | Dates in `## Context` that have passed or are close, each carrying `what`, `when` and `days` |

**The change reply**, for `change-report` and anything else `pa` renders after
editing the file. These three are the only fields it has, and they are filled
from the session rather than read off the list.

| Field | What it is |
| --- | --- |
| `changes` | One item per change he asked for, each carrying `summary` — the change in his terms, with the task title already written as a link to its card |
| `needs_you` | One item per failure or decision that is his, each carrying `summary`. Three at most, and empty on most sessions, which takes the heading with it |
| `pending_count` | How many pending topics there are, or empty when there are none, which drops the line |

There is no field holding what the pending topics are. That is deliberate: they
are counted here and given one at a time when he asks.

**Counts**, for a line that is a number rather than a list. `overdue_count`,
`doing_count`, `waiting_count`, `blocked_count`, `week_count`,
`unscored_count`, `delegate_count`.

## Writing one

Two things worth knowing before you add a template.

**Lead with the answer.** A mobile report is read one-handed while walking and a
desk report is read between two meetings, so in both the first line is the one
that has to survive being interrupted. In every template written so far that is
the headline or the thing that is late.

**A heading only earns its place if it has something under it.** A plain line
sitting immediately above an `{{#each}}` block is treated as that block's
heading, so it disappears along with the list when the list is empty. That is
why `Due this week` in `morning-brief` never appears over an empty space. Give
the block a `{{#none}}` and the heading stays, because now there is something
to head.
