# Bucket briefs

One folder per bucket in `data/<dataset>/buckets/`, holding the work I actually
do in it and the skills that do it. Both halves of the night agent read the
brief — the `plan-*` agent that researches a task overnight, and
`execution-agent`, the one agent allowed to act on a plan once I have agreed
it — and so do I.

```
data/twinkl/buckets/people/people.md    the brief
data/twinkl/buckets/people/skills/      the skills that bucket's work runs on
data/twinkl/buckets/README.md           which buckets this list has
```

They exist because of a gap found on 6 Sep 2026. The six planning agents already
know their bucket in general terms, and several of them know it well. What none
of them knows is the specific: which process this task belongs to, what that
process produces, which of my skills already does it, and who is involved. That
is the difference between a plan that names the next step and a plan that
describes the task back to me.

## One set per dataset

They sat at the root, in `buckets/`, until 8 Sep 2026. One set, filed by stream
name, shared by every list on the board. That was fine while there was one list
and stopped being fine the moment `personal` had tasks in it: a brief is only
true of one list, and `twinkl` and `personal` share neither their buckets nor
their processes nor their people. The `general` brief is the clearest case. On
`twinkl` it is the fallback nothing should reach and its own text says so; on
`personal` it is the only bucket there is. One folder per stream could not hold
both.

Inside `data/<dataset>/` rather than `buckets/<dataset>/` because `data/` is
already the per-dataset folder and already resolves through one place,
`paths.dataset()`. It also means a dataset is one folder: copy it, delete it,
and its briefs go with it.

The cost of that choice, stated plainly: `data/` is otherwise content the board
reads and writes, and a bucket's `skills/` folder is tooling. That is a real
crossing of the line `~/Code/CLAUDE.md` draws everywhere else, taken knowingly,
because a self-contained dataset was worth more here than a clean split.

## Gitignored, with data/

A brief never leaves the machine, for the reason nothing in `data/` does. It
describes real processes involving real people, and the skills beside it are
Twinkl's own — the probation form, the interview question pool, the offer
justifications, the career framework. This repo is public.

This file is the tracked half, and it is deliberately the generic half: what a
brief is for, how one is found, the template to start from. It carries no bucket
names and no examples from either list, so a fresh clone rebuilds the shape and
inherits none of the content. Which buckets a list actually has is that
dataset's own `buckets/README.md`, gitignored with everything else.

## Why a file rather than more prose in the agent

Because two different agents need the same knowledge. Put it in the planner and
the acting agent has to be told it again; write it twice and the two drift, and
a plan researched against one understanding gets carried out against another.
`agents/night_agent/PLAN-BRIEF.md` is the same idea for the half that is shared across
every bucket.

It also means the knowledge is mine to edit without opening an agent definition,
which is the part that has to keep being true. This is a living file, not a
spec.

## Why the skills sit with the brief

A brief that says "probation reviews run through `probation-review`" and a
`probation-review` living three folders away in another repo is two halves of
one answer. Putting them together means the bucket is one place to look, for me
and for an agent reading its way in.

They stay symlinked into `~/.claude/skills/` exactly as before, so the folder is
still the source and Claude still reads through the link. Moving one means
repointing its link:

```bash
ln -sfn ~/Code/to-dos/data/<dataset>/buckets/<stream>/skills/<name> ~/.claude/skills/<name>
```

One thing that does not follow the dataset: `~/.claude/skills/` is flat and
global, so two lists cannot both link a skill of the same name. The folder is
per dataset, the link is not, and if that ever collides the name has to give.

Skills that are not a bucket's own stay where they are. The ones generic to any
bucket are listed that way in `~/Code/SKILLS.md` — they are the output end of a
task rather than the work itself, which is why they belong to no bucket. Every
brief names them once so an agent knows they are there, and says where in that
bucket they actually apply.

## How a brief is found

`bucket_stream()` in `agents/night_agent/plan.py` maps a bucket heading to a
stream name, and the agent, the folder and the brief are all named off it: the
agent is `plan-<stream>` and the brief is
`data/<dataset>/buckets/<stream>/<stream>.md`, with the dataset coming from
`paths.buckets_dir()`. A heading that matches nothing falls back to `general`,
and that fallback is logged loudly, since it usually means a bucket was renamed.

`STREAMS` is one table across every dataset, on purpose. Stream names are the
shared vocabulary — they name the planning agents, which are global — while the
briefs behind them are not. So two lists can both have a `general` stream and
mean entirely different things by it, and neither has to know about the other.

Renaming a bucket on the board means adding an alias to `STREAMS`. That table is
the only place bucket headings are known, and a heading that is deliberately
general belongs in it rather than left to the fallback, so the noise stays
reserved for headings nobody has mapped yet.

## The empty marker

Every brief starts from the template below, which ships with this line:

```
<!-- NOT FILLED IN YET -->
```

While it is there, `bucket_brief()` treats the file as absent and no agent is
pointed at it. **Delete the line when you write the brief.** A file of empty
headings named in a prompt spends an agent's attention on nothing, which is
worse than not naming it.

## What goes in one

The template lists the headings. The two that matter most:

- **What each process produces.** A plan is only actionable if it knows what
  finished looks like, and "a document" is not an answer. Name the artefact: a
  filled-in form, a deck in a named template, a ticket on a named board, a
  message to one person.
- **Which skill already does it.** The most valuable thing a night can come back
  with is that the work is already automated. A brief that names the skills
  covering each process, and says which gap is real, is the model to copy.

Keep them short and keep them true. A brief describing a process I stopped
running in July is worse than no brief, because the agent believes it.

## The template

A new bucket starts as `data/<dataset>/buckets/<stream>/<stream>.md` holding
this, with a `skills/` folder beside it:

```markdown
# <Bucket name>

<One line: what kind of work lands in this bucket.>

<!-- NOT FILLED IN YET -->

> Delete the line above once this is written. While it is there, no agent is
> pointed at this file.

## The processes I run in this bucket

One per heading. For each: what triggers it, roughly how often, and what it
produces. Name the artefact, not the activity: a filled-in form, a deck, a
ticket on a named board, a message to one person.

## What already does it

Which of my skills covers which process, and where a gap is real. The most
valuable thing a night can come back with is that the work is already
automated, and it can only find that out if it is told where to look. Name the
gaps too, with the task slug for each, since building one of those is a fair
thing for a plan to propose and rebuilding an existing skill is not. Close with
one line on the five generic skills and where they apply in this bucket.

## Who is involved

Names, and what each person owns **in this bucket**. Not their role, not their
team, not who they report to: `data/<dataset>/people.md` is the one copy of that
and a brief that restates it is a second copy waiting to go stale. The list's own
Context section holds what changes weekly, leave and immovable dates. Surnames are
one initial.

## What good looks like here

What I would accept without changes, and what always comes back for a rewrite.
```
