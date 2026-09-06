# Bucket briefs

One file per bucket, holding the work Tiago actually does in it. Both halves of
the night agent read them: the `pa-plan-*` agent that researches a task
overnight, and `pa-execute`, the one agent allowed to act on a plan once he has
agreed it.

They exist because of a gap found on 6 Sep 2026. The six planning agents already
know their bucket in general terms, and several of them know it well. What none
of them knows is the specific: which process this task belongs to, what that
process produces, which of his skills already does it, and who is involved. That
is the difference between a plan that names the next step and a plan that
describes the task back to him.

## Why a file rather than more prose in the agent

Because two different agents need the same knowledge. Put it in the planner and
the acting agent has to be told it again; write it twice and the two drift, and
a plan researched against one understanding gets carried out against another.
`night_agent/PLAN-BRIEF.md` is the same idea for the half that is shared across
every bucket.

It also means the knowledge is his to edit without opening an agent definition,
which is the part that has to keep being true. This is a living file, not a
spec.

## How they are found

`bucket_stream()` in `night_agent/plan.py` maps a bucket heading to a stream name,
and both the agent and the brief are named off it. `## 3. DS` becomes
`design-system`, so the agent is `pa-plan-design-system` and the brief is
`design-system.md`. A heading that matches nothing falls back to `general`.

Renaming a bucket on the board means adding an alias to `STREAMS`. That table is
the only place bucket headings are known, on purpose.

## The empty marker

Every template ships with this line:

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

Keep them short and keep them true. A brief describing a process he stopped
running in July is worse than no brief, because the agent believes it.
