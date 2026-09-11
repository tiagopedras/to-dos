---
name: pa-review-plans
description: Go through the plans the night agent wrote against the owner's master to-do list, at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl"), one plan at a time, and turn his reaction to each into a note on the task it belongs to. Use whenever he asks what the agent came up with overnight, what is waiting on the Plans tab, to go through, read, review, assess or triage the plans, or says something like "what did it plan", "any good plans this morning", "let's go through last night's", "review the overnight plans", "what's the agent suggesting", or names one task and asks what the plan for it says. Also use when he wants to tell the agent it got something wrong, since the way to do that is a note on the task and this is the skill that writes one. Do not use it to run the night agent, which is the board's own Run now button, and do not use it for a general status read of the list, which is pa-checkin, or for a re-prioritisation, which is pa.
---

# Reviewing what the night agent proposed

**Read `~/Code/to-dos/agents/pa_agent/PA.md` first, then `~/Code/to-dos/CONVENTIONS.md`.** The first holds who he is, where the list lives, how he prioritises, the standing rules and the tone. The second holds the file format. Neither is repeated below.

Read `~/Code/to-dos/agents/night_agent/README.md` too, at least the part describing what a
plan is. A plan proposes and never executes, so nothing in this session is a
status report on work that happened — it is a review of suggestions, and the
only thing that changes as a result is what the list says.

## Why the note is the whole point

The obvious reading of this skill is that it helps him get through a folder of
plans. That is the smaller half.

`agents/night_agent/pick.py` hashes each task **including its notes**, and re-plans anything
whose hash has moved. `agents/night_agent/plan.py` pastes the task's title line and its
notes into the agent's prompt verbatim, because that is where the reasoning
lives. Put those two together and a note written here does three things in one
move:

1. It records what he thought, on the task, where he will find it again.
2. It makes the task stale, so the next night plans it afresh without anyone
   asking for that.
3. It becomes the brief for that re-plan. "You missed that the mixed-face
   decision is already made" is read by the next agent as an instruction.

So the feedback is not a rating. It is the correction that makes tomorrow's plan
better than today's, and a session that collects reactions without writing them
onto the tasks has thrown away the only part that compounds.

## Where the plans are

`data/<dataset>/plans/<night>/`, one folder per night, one `.md` per task, plus
an `index.md` summarising the night. Newest night first. `plans/actioned/` holds
plans kept past their night and is not part of a review pass.

Each plan carries frontmatter: `task`, `bucket`, `column`, `ai`, `agent`,
`created`, `state`, `owner`, `seen`, `session` and a one-line `summary`. `state`
and `owner` replaced a single `status` on 11 September 2026, and the Plans view
was renamed onto the list's own four columns on 12 September: Backlog, To do,
Waiting for review, Done. A plan sitting here is `state: review` with
`owner: me`, and `seen` is what this skill sets as it goes.

A plan written before that still carries `status: unread | read | actioned`.
Read it rather than refusing it, the same permanent-fallback rule the file
format keeps everywhere else.

Read the folder directly rather than the board's `/plans.json`. The folder is
the truth, it needs no server running, and this skill has to work on a morning
when the board is shut.

## The three moves

### 1. Count

Open with the numbers before anything else: how many plans, from which night,
how many still unread, and across which buckets. If a night stopped early on
budget, `index.md` and `plans/night-agent.log` say so — name that here, because a
short night is a fact about the list, not a fault to investigate.

One or two sentences. "9 plans from last night, 7 unread, 6 of them Design
System. It stopped on budget with 15 unplanned" is a real answer on its own.

Then move straight into move 2 in the same turn. Do not stop and wait after the
count.

### 2. One plan per message

**Unread first, then read.** Within that, the order the queue already has —
`plans/queue-order.json` if it exists, otherwise the order `index.md` lists.

**Show, then ask, then stop.** One plan per message, and wait for his actual
reply before naming the next. Several plans and their questions in one message is
a report, not a review.

For each plan, show:

- The task title and its bucket.
- The `summary:` line from the frontmatter, as written.
- The **Proposed course of action**, and **What it needs from you** if the plan
  has one.

**Do not paste the whole plan.** They run to several hundred words and most of
that is the agent showing its working — what already exists, what it checked,
what it ruled out. Offer it ("full plan if you want it") and print it only when
he asks. A review that makes him read every plan in full is slower than the
folder he was avoiding.

Read the whole file yourself, though. The summary is the agent's own compression
and it is sometimes generous about what the plan actually establishes.

Then one question, and make it the one the plan is actually waiting on. Usually
that is a decision the plan names as his, in which case ask that decision rather
than asking what he thinks of the plan. A plan whose "What it needs from you"
says *which launch, and Caveat's weight axis* should be asked as those two
questions, not as "any thoughts?".

Where the plan needs nothing from him, ask whether it is right.

### 3. Turn what he said into one of these, and no others

- **A correction.** The plan got something wrong, missed something, or assumed
  something already settled. This is the valuable one — write it as a note.
- **A decision.** He answers the question the plan was waiting on. Write the
  answer as a note; it is the thing that unblocks every future plan on that task,
  not just this one.
- **Accept it.** The plan is right and he intends to work from it. Usually still
  worth a short note saying so, because otherwise the next night re-plans a task
  he has already decided about.
- **Reject the task, not the plan.** Sometimes reading a plan is what makes him
  realise the task should be dropped or reshaped. That is a change to the list,
  not feedback on a plan — hand it to `pa` as an ordinary edit.
- **Nothing.** He has read it and has no reaction. Say so and move on. Do not
  manufacture a note to have written one; an empty note still changes the hash
  and buys a re-plan nobody wanted.

**Batch a few before writing** if he moves quickly through several, but never let
more than a handful pile up unwritten.

**Close every plan with one line saying what happens to it.** Once his reaction
is turned into one of the outcomes above, say plainly what that means for the
plan and the task before moving to the next one: that it has been marked seen,
which column it looks like it belongs in, and whether a note went on the task
(and roughly what it says, not the full text). "Marked seen, no note — nothing
to change" is as valid a closing line as "Marked seen; sounds like Done, which
is yours to press, and I will drop the task via pa." He should never have to ask
what just happened to something he reacted to.

## What this skill writes, and what it hands over

Two different things, and the split matters.

**Marking a plan seen, inside `plans/`: this skill's own.** Set it as you go,
and set nothing else.

- `seen: true` once he has looked at it and reacted. This is almost always the
  only thing this skill writes.
- Leave it unseen if he skipped past it without a reaction.

**Which column it ends up in is his, on the board.** Accepting a plan, sending
it back for another night, or parking it are the three moves the Plans view
makes through a confirm that says what each one means, and each one changes what
the night agent does next. Do not make them from here on the strength of a
reaction in conversation — say what he seems to want and let him press it.

Set `seen` through the board's own route, never by editing the frontmatter:

```bash
curl -s -X POST http://127.0.0.1:8765/stream/apply \
  -H 'Content-Type: application/json' -H 'X-Board: 1' \
  -d '{"stream":"plans","item":{"group":"2026-09-05","name":"the-plan-file.md"},
       "to":"review","owner":"me","seen":true}'
```

That reaches `agents/night_agent/stream.py`, which writes the frontmatter **and**
the ledger `pick.py` reads, together. Neither can be derived from the other, and
editing the file by hand does half the job and leaves the picker believing
something it should not.

The `X-Board: 1` header is a CSRF guard, there to stop a web page in some other
tab POSTing to `127.0.0.1` — see the note in `README.md`. A local script running
with his consent is not that threat, so setting the header here is legitimate
rather than a workaround.

**If the server is not running**, say so and stop marking anything. Do not fall
back to editing the frontmatter alone; a plan that says seen against a ledger
that says otherwise is worse than one still saying unseen. The review itself
carries on regardless — the notes are the part that matters.

**The note on the task: hand it to `pa`.** This skill does not touch
`todo.md`. Same reason as `pa-checkout` and `pa-retrieve-tasks`: `pa` is the one
writer, and a second path that edits the list by hand is how the two drift. Pass
it the task titles and the note text and let it apply them, run the checker and
stamp `Last updated`.

The note is an ordinary note on the task, in the shape `CONVENTIONS.md` already
describes, first line under the title line unless the task has a `Project:` note,
which stays first:

```
- [ ] **Add Caveat to the design system type stack** [impact:: high] [effort:: M] [ai:: partial]
  - Plan feedback (5 Sep): The mixed-face question is settled — one layer, two nodes. Skip that step. The Banner collision is real and worth raising at the DSWG before any of this starts.
```

**Write it as an instruction to the next agent, not as a verdict on the last
one.** "Good plan" tells the next night nothing. "The mixed-face question is
settled" changes what it writes. Date it, because a task can collect several over
weeks and the order is the only thing that says which is current.

**Replace a previous `Plan feedback` note rather than stacking a second one**,
unless the older one is still true and about something else. Two notes
contradicting each other is a task the next agent plans badly.

## Judgement calls that come up

**He wants only one task's plan.** Fine — go straight to it and skip the count.

**A plan is for a task that has since changed.** The plan was written against the
task as it stood. Say which part is now stale rather than reviewing it as if it
were current, and let the note record the change so the re-plan is clean.

**Several plans make the same point.** Common in Design System, where one agent
writes most of the night. Say it once, name the plans it applies to, and ask
whether it is one note on each task or one decision that covers them all. Do not
walk him through the same observation six times.

**He disagrees with the plan's facts.** The agents cite what they read and are
sometimes wrong about it. Check the claim before writing a note that says the
agent was wrong — if the plan is right and he is misremembering, that is worth
saying plainly, and it is the sort of thing the list exists to settle.

**A plan proposes something outside what the task asked for.** Scope creep in a
plan is cheap to catch here and expensive later. Name it.

**He asks you to just do what the plan says.** The plan is a proposal and this
skill is a review; doing the work is a separate decision he can make, but not
inside this pass. Finish the review, then pick it up as ordinary work.

## Tone

See `~/Code/to-dos/agents/pa_agent/PA.md`.

The count is a sentence. Each plan is a short block and one question. This is a
conversation to move through quickly — the plans are already long, and the review
should not be.
