---
name: pa-review-plans
description: Go through the plans the planning agent wrote against the owner's master to-do list, at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl"), one plan at a time, and turn his reaction to each into an approval or a note on the task it belongs to. Use whenever he asks what the agent came up with overnight, what is waiting for review, to go through, read, review, assess or triage the plans, or says something like "what did it plan", "any good plans this morning", "let's go through last night's", "review the overnight plans", "what's the agent suggesting", or names one task and asks what the plan for it says. Also use when he wants to tell the agent it got something wrong, since the way to do that is a feedback note on the task and this is the skill that writes one. Do not use it to run the planning agent, which is Run the Plan agent now in the board's Data menu, and do not use it for a general status read of the list, which is pa-checkin, or for a re-prioritisation, which is pa.
---

# Reviewing what the planning agent proposed

**Read `~/Code/to-dos/agents/pa_agent/PA.md` first, then `~/Code/to-dos/CONVENTIONS.md`.** The first holds who he is, where the list lives, how he prioritises, the standing rules and the tone. The second holds the file format. Neither is repeated below.

A plan proposes and never executes, so nothing in this session is a status report on work that happened. It is a review of suggestions, and the only thing that changes as a result is what the list says.

## Where a plan is, since 22 September 2026

A plan is no longer a card on a board of its own. Handing a task to the Plan agent lays four sub-tasks out on the task's card: Plan, Review the plan, Implement, Review the work, each blocked by the one before. When the plan is written the agent's Plan sub-task is ticked, through the board's queue, and the **Review the plan** sub-task carries a `Plan:` note pointing at the file, `data/<dataset>/plans/<file>.md`. That sub-task is his, and it is what this skill goes through.

So the plans waiting are the **Review the plan** sub-tasks that are unticked, assigned to him, with the Plan sub-task above them ticked. Read the list for them, and read the plan from the file the note names. The file is the truth, it needs no server running, and this skill has to work on a morning when the board is shut.

## Why the note is the whole point

`agents/plan-agent/pick.py` hashes each task **including its notes**, and picks a task up again whenever its Plan sub-task is open. `agents/plan-agent/plan.py` pastes the task's title line and notes into the agent's prompt verbatim, because that is where the reasoning lives. So a `feedback:` note written under the Plan sub-task does three things in one move: it records what he thought, where he will find it again; it unticks the Plan, so the next night writes a new plan without anyone asking; and it becomes the brief for that plan, read by the next agent as an instruction.

So the feedback is not a rating. It is the correction that makes tomorrow's plan better than today's, and a session that collects reactions without writing them onto the tasks has thrown away the only part that compounds.

## The three moves

### 1. Count

Read the list and count the plans waiting: the total first, then by bucket, then how many you have not opened before. Say it as one line and go straight into the first plan in the same turn.

### 2. One plan at a time

For each, show the task, the bucket and what the plan's `summary:` says, then read it with him. **One plan per message**, and stay on it until it has an outcome:

- **Approve it.** The Review the plan sub-task is ticked. That unblocks Implement, which is what the `do` skill picks up.
- **Send it back.** The Plan sub-task is unticked and a `- feedback: …` note goes under it saying what was wrong, in his words. The Review the plan sub-task stays open and blocks again.
- **Turn it down.** The idea is finished. Untick nothing; write a note on the task saying why, and take the agent off it (`[to::]` back to nobody or to him), which stops the next night planning it.
- **Leave it.** Nothing changes and it stays in the count.

If he wants to talk it through first, that is the Talk it through button on the review's drawer on the board, which opens a chat with the plan in it. Do the same here, in conversation, and then take the decision.

### 3. Hand the writing to pa

This skill does not touch `todo.md` itself. Once he has decided on the ones he wants to act on, invoke `pa` with the list: the sub-task to tick or untick, the `feedback:` line and its text. `pa` applies them, runs the checker and closes with the Reload line. Same reason as every other skill here: `pa` is the one writer.

## What this skill never does

- **It never writes a plan's own file.** A plan is content the agent wrote; what he thought of it goes on the task.
- **It never runs the planning agent.** That spends money and is a deliberate press.
- **It never carries a plan out.** Approving is ticking the review, and carrying out is the `do` skill, in a session he is in.

Plans written before 22 September 2026 still carry `state:` and `production:` in their frontmatter. Nothing reads them now. A plan whose task is no longer on the list shows in Overview's Context column, and the plan file is left where it is.
