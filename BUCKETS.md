# Bucket briefs

One folder per bucket in `buckets/`, holding the work I actually do in it and
the skills that do it. Both halves of the night agent read the brief — the
`pa-plan-*` agent that researches a task overnight, and `execution-agent`, the one
agent allowed to act on a plan once I have agreed it — and so do I, which is why
it sits at the root of the repo rather than inside the agent that happened to
need it first.

```
buckets/people/people.md        the brief
buckets/people/skills/          the skills that bucket's work runs on
```

They exist because of a gap found on 6 Sep 2026. The six planning agents already
know their bucket in general terms, and several of them know it well. What none
of them knows is the specific: which process this task belongs to, what that
process produces, which of my skills already does it, and who is involved. That
is the difference between a plan that names the next step and a plan that
describes the task back to me.

## Gitignored, like data/

`buckets/` never leaves the machine, for the same reason `data/` doesn't. A
brief describes real processes involving real people, and the skills beside it
are Twinkl's own — the probation form, the interview question pool, the offer
justifications, the career framework. This repo is public.

This file is the tracked half. It holds what a brief is for, how one is found
and the template to start from, so a fresh clone can rebuild the shape without
carrying any of the content.

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
ln -sfn ~/Code/to-dos/buckets/<stream>/skills/<name> ~/.claude/skills/<name>
```

Skills that are not a bucket's own stay where they are. Five are generic to any
bucket and listed that way in `~/Code/SKILLS.md`: `twinkl-deck-outline`,
`twinkl-deck` and `twinkl-diagram` in `skills/twinkl/`, `tiago-writing-voice` and
`tldr` in `skills/personal/`. They are the output end of a task rather than the
work itself, which is why they belong to no bucket. Every brief names them once so
an agent knows they are there, and says where in that bucket they actually apply.

## How a brief is found

`bucket_stream()` in `agents/night_agent/plan.py` maps a bucket heading to a stream
name, and the agent, the folder and the brief are all named off it. `## 3. DS`
becomes `design-system`, so the agent is `pa-plan-design-system` and the brief
is `buckets/design-system/design-system.md`. A heading that matches nothing
falls back to `general`.

Renaming a bucket on the board means adding an alias to `STREAMS`. That table is
the only place bucket headings are known, on purpose.

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
  finished looks like, and "a document" is not an answer. A filled-in probation
  form, a deck in the Twinkl template, a Jira ticket on DSYS, a message to one
  person.
- **Which skill already does it.** The most valuable thing a night can come back
  with is that the work is already automated. `pa-plan-people` gets this right
  today and is the model to copy: it names five skills and says which gap is
  real.

Keep them short and keep them true. A brief describing a process I stopped
running in July is worse than no brief, because the agent believes it.

## The template

A new bucket starts as `buckets/<stream>/<stream>.md` holding this, with a
`skills/` folder beside it:

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
