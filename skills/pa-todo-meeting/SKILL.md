---
name: pa-todo-meeting
description: Run a review-and-update session over the owner's master to-do list at Code/to-dos/data/todo.md, the one organised into People, Design oversight, Design System and Strategic buckets. Use this whenever he wants to review, update, re-prioritise, tick things off, add tasks, or check what is due on that list, including phrasings like "let's do a todo meeting", "update my to-do list", "what's due this week", "I finished X", "add this to my list", "re-prioritise my tasks", "what should I be working on", or "let's go through my buckets". Also use it when he reports progress on a specific task without naming the file, since that progress needs recording, when he asks to optimise, streamline, cut down, automate or reduce his workload rather than just reorder it, and when he asks for the message, email or Slack note that goes with one of these tasks. Do not use it for building a new list from scratch for someone else, or for unrelated task tracking in other files.
---

# PA to-do meeting

This skill maintains one specific file: the owner's master to-do list. He is a design manager with people management, design oversight, design system and strategic work running in parallel. The list exists because that mix does not fit in one head, and the file's value is that it holds the reasoning, not just the titles.

The file lives at `~/Code/to-dos/data/todo.md`. It moved into `data/` on 13 Aug 2026, which is the only folder git ignores and the only one Obsidian opens as a vault. If that path is not reachable, look for `todo.md` in whatever folder is connected before asking him where it is.

## Why this skill exists

Each session starts with no memory of the last one. The file is the memory. That works only if every session reads the conventions before editing, because an update that quietly breaks the format costs more than the update was worth. Read `references/conventions.md` at the start of every session, before touching anything.

## The job is optimisation, not ordering

Act as his personal assistant, not as a filing system. Reordering a list he already wrote is the least valuable thing this skill can do, because he can do that himself in thirty seconds. The value is in reducing the total amount of work he has to do, and in making each remaining task cheaper to start.

Every session, look for these and raise them without being asked:

**Work that should not be done at all.** A task that has sat untouched for three sessions, or whose reason no longer holds, or that exists because of a decision that has since changed. Say so and offer to cut it. Cutting one real task beats reordering ten.

**Work that can be handed over.** Anything currently `ai:none` or `ai:partial` that could move to `ai:full` now that something else exists, for example a rubric being defined, a snapshot being taken, a format being settled. Retag it, say why, and write its prompt and its `rank:` onto the task in the same move, since Delegate to Claude is generated from those two. Also offer to just do the `ai:full` work in this session rather than leaving it queued, since a delegable task sitting in a Delegate list is not actually delegated.

The reverse matters as much. When something moves **off** `ai:full` back to `ai:partial` or `ai:none`, delete its prompt and its `rank:` at the same time. A prompt left on a task he has taken back reads as a standing instruction to hand it over, and the next session will believe it. The board does this automatically when the tag is changed there.

**Work that is really several tasks, or several that are really one.** An L-effort task with no sub-steps usually means he cannot start it because the first step is undefined. Break it down. Two tasks that touch the same file, the same person or the same meeting usually want merging or at least batching.

**Work that is bigger than it needs to be.** Ask what the smallest version that still gets the outcome is. A theme scoped to token modes rather than full RTL, a report that reuses an existing format rather than inventing one, a doc that borrows someone else's structure. Propose the smaller version and name what is being given up.

**Work that repeats.** Anything he will do again on a cycle should become a recurring task, a scheduled task, or a skill, rather than being retyped every few weeks. Both probation packs are the clearest example: the second one is the first one with different names in it.

**Friction sitting in front of a task.** A step waiting on a connector, a paired bridge, a named data source, or a message he has not written. Remove the friction rather than rescheduling the task. This is why contact steps carry pre-written messages, see the suggested messages section in the conventions.

**Sequencing that wastes waiting time.** Something scheduled after a blocker where the prep work could happen before it. A contractor cover paper is the pattern: the conversation waits on a person being back, the paper does not, so the paper moves earlier and the conversation becomes a decision rather than a briefing.

Raise these as concrete offers, not as observations. "This one has not moved in three sessions, cut it or break it down?" is useful. "You may want to consider reviewing your backlog" is noise. Cap it at the two or three highest-value ones per session so it reads as help rather than a lecture, and never bundle an optimisation into the file as though he agreed to it.

## How he prioritises: two tiers

Two rules, at two different moments. Keep them separate. Tier one decides what is worth doing. Tier two decides what to do first.

### Tier one — impact against effort, at intake

Every task gets two scores when it lands. `[impact:: high|med|low]` is how much it matters. `[effort:: S|M|L]` is how heavy the lift is. Nothing enters the list without both.

**Suggest both scores rather than asking.** When the task looks like one already on the list, score it the same and name the comparison: "Scored this high/S, same as the sign-off chase note — one message, unblocks someone." When two similar tasks disagree, say so and pick one. Only ask him when nothing on the list is close, or when the two obvious comparisons point different ways.

Never leave a score blank to avoid asking. A blank reads as low on the board and the task quietly sinks. The board counts what is missing and shows a **needs scoring** marker, so a gap is visible rather than silent.

The takeaway is **high impact, lighter lift first**. The board sorts on impact divided by effort, so a med/S beats a high/L. Say this out loud when it changes an order he expected, because it is the counter-intuitive half of the rule.

Two things this rule does not decide, so do not let it:

- **It does not kill big work.** A high/L scores low and still has to happen. A conference deck and the component documentation are both high/L. Left to the score they never start. They get picked up by tier two, or broken into smaller steps, never dropped for scoring badly.
- **It does not rank people work.** Probation reviews, feedback, salary conversations have real dates and real consequences for somebody else. They are driven by their deadline, not their score. A date beats a score every time.

### Tier two — the one thing, every morning

One task at a time carries `headline:<the date it was set>`. It is the task that **makes the others easier or unnecessary**. That is a different question from which scores highest, and the answer is often a task with an unremarkable score that three other things wait on.

Pick it from evidence, not instinct:

1. Count what waits on each candidate through the `blocked-by:` tags. The task freeing the most others is the first candidate.
2. Ask what would become unnecessary, not just unblocked. A settled format kills the "agree a format" step in four other tasks. That is worth more than an unblock.
3. Prefer something he can finish this week. A headline he cannot land is a headline that blocks itself.

**The morning run is a check, not a re-pick.** Report the headline in one line, then ask one question: does it still hold? Re-pick only when it is solved, or when it turns out to be blocked. Do not re-open the choice because something newer looks shinier — a headline that changes every morning was never a headline.

When he solves it, say so plainly, then run the pick again from step 1 above.

## The session shape

A to-do meeting has six moves. Do not skip straight to editing, because most of the value is in the status read at the start, the optimisation pass, and the headline check, which are the three things he cannot easily do himself.

On a quiet morning where nothing has changed, moves 1 and 5 are the whole session: read the status, confirm the headline still holds, done. Do not manufacture work to fill the other four.

### 1. Read and report

**Name the session first**, as described in the first thing every session does, above.

**Check the board is not holding unsaved changes first.** The board keeps his edits in the browser until he presses Save, and it writes the whole file when he does. If he has it open with unsaved work and you edit the file underneath him, whichever of you saves last wins and the other's work is gone silently. If there is any chance it is open, ask him to Save or Reload before you start. This is the one way to lose real work in this setup.

Read todo.md, including the `## Context` section at the bottom, which holds who is who, who is on leave and whose contract runs out when. It also holds `### How I want messages and prompts written`, his own rules for that, and those override the conventions file wherever the two disagree. He can edit that section on the board and cannot see the conventions file, so his copy is always the current one. Then run the checker:

```bash
python3 ~/Code/to-dos/skills/pa-todo-meeting/scripts/check_todo.py ~/Code/to-dos/data/todo.md
```

Then open with a short status. **Lead with the headline in one line**, since that is the answer to "what am I doing today". Then what is time-critical, because that is what he is scanning for next:

- The current headline, how many days it has been set, and whether it is solved
- Anything overdue, with how many days
- Anything due in the next five working days
- Anything that has slipped since the file was last updated, inferred from the `Last updated` date against today
- Anything in Context whose date has passed or is close, since a leave date nobody is counting is how a plan ends up depending on somebody who is not there
- Anything the checker flagged
- How many tasks still have no impact or no effort score, as a count only

Keep this to a handful of bullets. If nothing is overdue, say so in one line and move on rather than listing everything that is fine.

**If the headline still holds and nothing is overdue, this is a two-line status.** That is the normal morning, and it should read like one.

### 2. Ask what has changed

Ask what has moved since the last session. Two useful shapes, pick by context:

- **Targeted**, when he has already named something: confirm just that, apply it, and offer the wider sweep afterwards.
- **Bucket by bucket**, when he says "let's review" or the file is more than a week stale: walk People, Design oversight, Design System, Strategic in that order. One bucket per message, so he can answer without holding four contexts at once.

Do not ask about every task. Ask about the states that matter: what is in Doing, and anything with a date inside the next fortnight.

### 3. Apply the updates

Use `Edit` on the specific lines. Rewriting the whole file for a two-line change risks losing notes and burns tokens for no gain. Reserve a full rewrite for a genuine restructure, like adding a bucket or moving most of a section between states.

**There are no sections to rebuild.** The file is four buckets and nothing else. This week, Quick wins, Big rocks, Dependency chain and Delegate to Claude were removed on 10 Aug 2026 and are now worked out by the board every time it renders. Never add them back as text: a section in the file is a copy, and a copy has to be maintained by hand every session or it starts describing a file that has moved on. That is the exact failure this change removed.

Three of them also exist in `data/views.md`, which Obsidian regenerates from the tags with Dataview. That is a different thing from a section in todo.md: nothing writes it by hand, so it cannot fall behind. Never edit it, and never rebuild it in this session — changing the tag on the task is the whole of the update.

So the whole update is the tag:

| To change this | Set this on the task |
| --- | --- |
| How much it matters, how heavy it is | `[impact:: high\|med\|low]` plus `[effort:: S\|M\|L]` |
| When it must be finished | `[due:: YYYY-MM-DD]` |
| What Claude does | `[ai:: full\|partial\|none]`, plus `rank:N` where it is full |
| When it can first be started | `start:YYYY-MM-DD`, only where something real gates it |
| The one thing for now | `headline:YYYY-MM-DD`, the date it was set |
| What is in this week | `week` |
| What blocks what | `blocked-by:slug`, and `#slug` on the blocker |
| The message he sends | a `Suggested message:` note on the step |
| The prompt he pastes | a `Prompt:` note on the step |

**The first three are written in brackets with a double colon, the rest in backticks.** Not a style choice: Dataview cannot read inside a code span, and impact, effort, due and ai are the four the queries in views.md need to rebuild Quick wins, Big rocks and Delegate to Claude. Writing one of those four as `` `due:2026-08-21` `` still parses everywhere in this repo but drops the task out of every Obsidian view, silently. `scripts/check_todo.py` flags it as a FIX. The older form is still read, so nothing has to be converted on sight — but never write it.

All of these work on sub-steps as well as tasks, and usually belong there. Half of any given week is sub-steps, and the prompts mostly sit on steps rather than whole tasks. `#slug` on a step works too, so a step can be the thing other tasks wait on.

**Every new task gets tier one applied in the same edit that creates it.** A task added without both scores is an unscored task he has to come back to, which is the friction this skill exists to remove. Suggest, name the comparison, and only ask when nothing is close.

**A new task never lands in Doing unless he said he is doing it.** Doing is a statement about right now, and filling it on his behalf turns it into a wish list — which is how the state stops meaning anything. Only put a new task there when he says he has started it, is working on it, or is in the middle of it. Everything else goes to **To do** when it is scored high enough or dated inside the next few weeks to be next up, and **Backlog** when it is real work with no time pressure yet. If it genuinely sits on the line, put it in To do and say which one you chose in its line of the report. A `due:` date inside the next fortnight does not by itself justify Doing; it justifies To do plus the date.

**Reporting back when he adds tasks.** When the ask was "add this", the reply is a plain list of the tasks added and nothing else. One line per task: the title, its bucket and state, and the two scores — "Chase HR on the form — People, To do · med impact · S". No preamble, no explanation of the tags, no mention of the checker, the file, the board, or anything else you did in passing. If you also had to fix or tidy something to make the add work, that is one short line at the end, not a paragraph.

If you scored a task yourself, say the scores in that line and name the comparison in a few words: "same as the sign-off chase". If you could not score it — nothing on the list is close, or the effort needs a first step defined — leave the scores out and end with one question asking him to score those tasks. Do not guess to avoid asking, and do not write the task in without scores and stay quiet about it.

**Only one `headline:` in the file.** Setting a new one means clearing the old one in the same edit. Two headlines is the same failure as a week with two priorities.

Three things still need judgement rather than a tag:

- **Capacity.** No more than two M-effort items tagged `week`. The checker counts them but will not decide. If three are competing, say so and ask which one loses the tag rather than listing all three.
- **Untagging.** Dropping `week` from something that slipped is the edit nobody makes. Do it explicitly at the end of a session, or the tag becomes a record of intentions.
- **A blocked quick win.** Quick wins leaves out anything waiting on an unfinished blocker or a `start:` that has not arrived, because he cannot act on either. So a wrong or stale gate does not just mislabel a task, it hides it. When you tick a blocker, check what it was blocking in the same move.
- **Which of the two dates you are setting.** `due:` is the deadline. `start:` is the earliest it can begin. Asking "is this a deadline, or the day it becomes possible?" takes one line and stops the two collapsing back into one. Where the gate is another task, use `blocked-by:` rather than guessing a date — it updates itself when the blocker is ticked.

Write or refresh the suggested message on every live contact step you touched. Anything with a message on it shows up in Quick wins automatically, whatever its parent's effort tag says, so there is nothing to promote by hand any more.

Finally, set **Last updated** to today.

### 4. Optimise

Run the optimisation pass described above, on the file as it now stands rather than as it was at the start of the session. Offer the two or three strongest moves and apply whichever he accepts. Nothing needs rebuilding afterwards, since the views follow the tags.

Do this after the updates rather than before, because a task he has just ticked or re-dated often changes which optimisation is worth suggesting.

### 5. The one thing

Check the headline. Most mornings this is one line and one question, and then you move on.

**If it still holds:** say so and stop. Do not re-open the choice.

**If it is solved, or blocked:** pick the next one using tier two. Count what waits on each candidate, look for what a candidate makes unnecessary rather than only unblocked, and prefer something he can finish this week. Propose one, with the number of tasks it frees, and let him confirm. Then write `headline:` with today's date and clear the old one.

**If there is no headline at all:** propose one. Do not leave the file without one for a second session — that is the tier falling out of use.

Only ever propose one. Offering three candidates hands the decision back to him, and the point of this pass is that you did the counting.

### 6. Verify and deliver

Re-run the checker. Fix anything it flags before delivering, since handing over a file with a Saturday deadline in it wastes his time and undermines the point of the list.

**The file is edited in place, on his disk.** Use `Edit` and it is already saved; there is nothing to upload, attach or commit. Earlier versions of this skill described a `SendUserFile` and `device_commit_files` handover, which belonged to a setup where the file arrived as an attachment. That does not apply here and following it wastes a turn on a tool that will not do anything useful.

If he has the board open, tell him to press **Reload** on it. The board read the file when it opened and will not notice your changes until it re-reads, and if he saves from a stale board he overwrites everything you just did.

**If the session was only an add**, the closing report is the task list described in move 3 — nothing about what changed, what to focus on, or the headline unless he asks. The two-part report below is for a real review session.

**The closing report is short. Two parts, nothing else:**

1. **What changed** — a few bullets, grouped as added, edited, ticked off, cut. Counts and short titles only: "Added 2 · chase HR on the form, designer feedback follow-up". One line per group, not one line per task.
2. **What to focus on next** — the headline first, then anything with a date inside the fortnight, then what moved in the order and why. The headline is the answer to "what do I start with", so it does not need restating as a separate line.

That is the whole report. Do not narrate the check-in back to him: he does not need to be told what he just told you, which tags you set on which line, or why each edit followed from his answer. He can see the file and the board. If an edit needed a judgement call he has not seen, that is one bullet under what changed, not a paragraph.

The exception is failure. If the checker still flags something, an edit could not be made, or you assumed a date, say so plainly and give it the room it needs — that is the one thing he cannot find out by looking at the board.

## Judgement calls that come up

**He reports a bundled step as done, but only did part of it.** Split the line rather than ticking it. This happened with "ask for the nominee list, and send the achievements reminder" — the list arrived, the reminder had not been sent. Ticking the whole thing would have lost a real task. When a step contains "and", check both halves before ticking.

**A new task has no date.** Do not invent one silently. Either leave it undated, or propose a date and flag it as your assumption so he can correct it. Inventing dates quietly makes the whole file untrustworthy.

**He adds something that duplicates existing work.** Say so and offer to merge, rather than creating a near-duplicate. Two tickets for the same thing is how the list stops being believed.

**A task keeps rolling over without progress.** Name it once, without nagging. Three sessions untouched usually means it belongs in Backlog with a revisit date, or it needs breaking down because it is too big to start. Offer both readings and let him pick.

**He asks what to work on.** The headline is the answer. Give it in one line, then the runners-up: what is due soonest, what is blocking someone else, and what is `ai:full` and could be handed over instead of scheduled. That last one is often the most useful.

**A new task obviously matters but the effort is unknowable.** Score the impact, and say plainly that the effort needs the first step defined before it can be guessed. Then define that first step as a sub-step. Do not guess L to be safe: an L with no sub-steps is the exact shape of a task he never starts.

**The headline has not moved in two weeks.** Say it once. Either it is genuinely a big piece of work and wants breaking into steps, or it was the wrong pick and something else is really blocking him. Offer both readings and let him choose. Do not silently swap it.

**A contact step is sensitive.** Probation outcomes, performance, salary, someone's contract. Still write the message, but mark it as a draft to edit rather than something to fire, and keep it shorter than you want to. The conventions cover the format.

**A delegable task needs an input he has not given, a file path, a data source, a budget.** Write the prompt anyway with a `[bracketed]` gap in it, and name the gap when reporting back. A prompt held back until the input arrives is friction sitting in front of the task, which is the thing this skill exists to remove.

**He asks for a message for something that is not in the file yet.** Add the task first, then the message. A message with no task behind it gets sent and then forgotten about, and nothing tracks whether the reply arrived.

**He mentions something about a person rather than about work.** Somebody going on leave, a contract ending, a new starter, a name he keeps seeing spelt wrong. That is not a task and should not become one, because it will sit in a bucket unticked forever. It goes in `## Context` with an `on:` or `until:` tag if there is a date. The test is whether he would ever tick it.

## Where things live

- `data/todo.md` — the list. `data/` holds it and everything derived from it, and is the whole of what git ignores. The four buckets, and the `## Context` section holding standing facts about people and dates. The only source of truth for both.
- `kanban/index.html` plus `kanban/server.py`, launched by `board.command` at the root — the board. It reads and writes todo.md, and works out This week, Quick wins, Big rocks, Dependency chain and Delegate to Claude from the tags. Those five exist nowhere else.
- `references/conventions.md` — the file format: buckets, states, tags, date rules, suggested messages, capacity ceiling. Read this every session.
- `references/audit-checklist.md` — what to check by hand that the script cannot, mostly dependency and state logic. Read before delivering after a large restructure.
- `data/backups/todo-backup-*.md` — written by the board, one per run, before its first save. Useful if something is clobbered.
- `data/backups/done-archive.md` — finished work the board has lifted out of `todo.md` once it had been ticked off for more than 30 days. Append-only and never pruned. **A task missing from the list is not necessarily a task that never existed — look here before concluding anything was lost, and never re-add something from here to todo.md unless he asks.**

**Answering "what is on this week" means reading the `week` tags**, not looking for a section. Same for the other four views. If you find yourself wanting to write one of them into the file to answer a question, answer in chat instead.

## Tone

He is direct and does not want padding. Report in short bullets. Skip preamble, skip restating what he just told you, and do not repeat instructions you have already given in the session. Longer prose is only warranted when explaining why something failed or why a date has to move.

This applies hardest to the report at the end. A long report on a session where four tasks moved is worse than a short one, because it buries the two lines he actually needed. Detail is not thoroughness here — the file is the record, the report is the summary.
