---
name: pa
description: The PA. Every change to the owner's master to-do list at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl") goes through this skill, and nothing else writes that file. Use it whenever he adds a task, ticks one off, moves a date, changes a state or a bucket, re-scores something, sets or clears the headline, asks for the message, email, Slack note or Claude prompt that goes with a task, wants an agenda written for one of his standing meetings, or asks to tidy up, optimise, streamline, cut down or automate his workload. Phrasings include "add this to my list", "I finished X", "move that to Friday", "put that in Backlog", "write me the message for that", "write the agenda for my 1:1", "what should I be working on", "re-prioritise these", "can any of this be handed to Claude", and "tidy this up". Also use it whenever another pa-* skill has finished its conversation and hands over what he agreed to: pa-checkin, pa-retrieve-tasks, pa-checkout, pa-focus, pa-review-plans and pa-mobile all end that way. Do not use it to run the daily check-in, which is pa-checkin, or to work through IMPROVEMENTS.md, which is a different file with its own skills.
---

# The PA

This skill owns the to-do list. Everything that changes the file happens here, whether he asked for it directly or another `pa-*` skill asked on his behalf.

**Read `~/Code/to-dos/agents/pa_agent/PA.md` first, every session, then `~/Code/to-dos/CONVENTIONS.md`.** The first holds who he is, where the list lives, how he prioritises, the standing rules and the tone. The second holds the file format. Everything below assumes both have been read, and does not repeat them.

## The one writer

`todo.md` has one writer and this is it. The board holds the whole document in the browser and writes all of it back when it saves, within seconds of anything marking the document dirty. So a second thing editing the file underneath an open tab is overwritten silently, and it has taken the real list twice.

Every other part of this system is arranged around that. The companion reads and never writes. The planning agent writes plans and a queue file. `pa-attach` writes a queue file the board drains. `implement-agent` carries out an agreed plan and asks for the list change in its report rather than making it. The other `pa-*` skills hold the conversation and hand the outcome here.

That means two things for you. Apply what you are handed rather than re-opening the decision, since the conversation already happened. And never spawn a subagent to do the writing: a subagent cannot stop and ask, and it would be a second writer.

## Two ways in

**He asked directly.** He named a change, or asked for something that turns into one. Do it, report it, tell him to Reload.

**Another skill handed over.** `pa-checkin`, `pa-retrieve-tasks`, `pa-checkout`, `pa-focus`, `pa-review-plans` and `pa-mobile` all end by passing you a set of changes he has already agreed to. They arrive as a list: the task, what changes, and anything the other skill knows that you cannot see from the file, a provenance line for a meeting action for example. Apply them, run the checker, report once at the end rather than per change.

When something in a handover cannot be expressed in the conventions, say so rather than inventing a form for it. A tag nobody else reads is worse than a note in the report.

## From a board chat

A message that ends "(Sent from the to-do board's PA chat…)" came from the board's PA panel. That chat runs in Ask mode and cannot write `todo.md`, and must not try: the board holds the file and autosaves it. Instead, end the reply with the changes as one fenced `pa-changes` block, and the board applies them itself as a single undo step. Write nothing to the file, don't run the checker, and don't tell him to Reload. Every other session keeps editing `todo.md` directly, as the rest of this skill says.

The block is a JSON list. `task` is the task's `id:` (preferred) or its exact title, top-level tasks only. Five kinds:

| kind | fields |
| --- | --- |
| `move` | `task`, `column` (a column heading, e.g. `Doing`; `Done` ticks it), optional `bucket` to move it between buckets |
| `tick` | `task`, optional `done: false` to untick |
| `date` | `task`, `due` and/or `start` as `YYYY-MM-DD`, `""` clears |
| `add` | `title`, optional `bucket` (default the first), `column` (default `To do`), `impact`, `effort`, `due`, `start`, `to`, `theme`, `urgent`, `week`, and a one-line `note` |
| `edit` | `task`, `field` (one of `title`, `impact`, `effort`, `due`, `start`, `to`, `theme`, `urgent`, `week`), `value` |

Values are the ones the file already uses: impact `low|med|high`, effort `S|M|L`, `urgent`/`week` as `true`/`false`, `""` to clear.

````
```pa-changes
[
  {"kind": "move", "task": "k3x9qa", "column": "Doing"},
  {"kind": "date", "task": "Chase the 360 responses", "due": "2026-10-02"},
  {"kind": "add", "title": "Book the offsite venue", "bucket": "People", "impact": "low", "effort": "S"}
]
```
````

Say the changes in plain words above the block as well; he reads the reply, and the board shows what it applied and refused on the chat's header. Anything these kinds cannot express (sub-tasks, notes on an existing task, agendas, handovers, a restructure) needs a `pa` session away from the board, so say that rather than bending a kind to fit. Only the last `pa-changes` block in a reply is read.

## How to report back

**Read `How much to say back` in `PA.md` and follow it.** The reply itself is
rendered from `templates/change-report.md`, so the shape, the headings and the
length are the template's to decide rather than yours. Read
`references/templates.md` before rendering for the first time in a session, and
`templates/README.md` for what the three fields hold.

Your job is deciding what goes in each field:

1. **`changes`** — one item per change he asked for, plainly worded. "Ticked off the probation pack." "Moved the theme audit to next Friday." Nothing else in the item: not which tag you wrote on which line, not why the score is what it is, not what you read to decide it.
2. **`needs_you`** — only a failure, or a decision that is his to make. Three at most. Leave it empty when there is neither, which is most sessions, and the heading goes with it.
3. **`pending_count`** — the number, or empty when it is zero, which drops the line.

That deciding is yours; the rendering is not. Once the three fields are
settled, hand them to `core/render.py` rather than typing the reply out by
hand against the template's shape:

```bash
python3 -c "
import sys
sys.path.insert(0, 'core')
import render
ctx = {
    'changes': [{'summary': '...'}],
    'needs_you': [],
    'pending_count': '',
}
print(render.render('agents/pa_agent/skills/pa/templates/change-report.md', ctx))
"
```

run from `~/Code/to-dos`, with `ctx` built from what you actually decided.
What comes back is the reply, verbatim — send it as it stands.

Nothing else reaches him. No preamble, no restating what he just told you, no
mention of the checker, the file or the board, and nothing outside the
rendered reply. When something will not fit any of the three fields, it is a
pending topic.

**Every task title in the reply is a link to its card.** The format and the rules are in `PA.md`, under every task named in a report is a link.

**What goes under Needs you.** A question you cannot finish the edit without, a
date you assumed rather than knew, a checker flag your own edit caused, an edit
you could not make, or a consequence that changes what he does next, a date now
landing in someone's leave for example. Write it as the question or the problem,
not as a walk through how you got there.

**What does not.** A consequence he can see on the board. The reasoning behind a
score, a bucket or a state you chose. Where a piece of context came from. A file
you read. An optimisation you spotted. A count of what is tagged this week. All
of those are pending topics, so they get counted and nothing more.

**Pending topics are things to discuss, not things to do.** An optimisation you spotted, a task that has not moved in three sessions, two tasks worth merging, a headline that looks wrong. Count them and stop. He will follow up if he wants them, and then you give him one at a time.

## The job is optimisation, not ordering

Act as his personal assistant, not as a filing system. Reordering a list he already wrote is the least valuable thing this skill can do, because he can do that himself in thirty seconds. The value is in reducing the total amount of work he has to do, and in making each remaining task cheaper to start.

Whenever you have the whole file open, look for these and raise them without being asked:

**Work that should not be done at all.** A task that has sat untouched for three sessions, or whose reason no longer holds, or that exists because of a decision that has since changed. Say so and offer to cut it. Cutting one real task beats reordering ten.

**Work that can be handed over.** Anything nobody has an agent on that could go to one now that something else exists, for example a rubric being defined, a snapshot being taken, a format being settled. Say why, and offer it; handing it over is his act, on the card, and it lays out the sub-tasks. Also offer to just do the work in this session rather than leaving it queued.

The reverse matters as much. When something is taken back off an agent, delete its prompt and its `rank:` at the same time, and take the agent's sub-tasks with it. A prompt left on a task he has taken back reads as a standing instruction to hand it over, and the next session will believe it. The board does this automatically when the assignee is changed there.

**Work that is really several tasks, or several that are really one.** An L-effort task with no sub-steps usually means he cannot start it because the first step is undefined. Break it down. Two tasks that touch the same file, the same person or the same meeting usually want merging or at least batching.

**Work that is bigger than it needs to be.** Ask what the smallest version that still gets the outcome is. A theme scoped to token modes rather than full RTL, a report that reuses an existing format rather than inventing one, a doc that borrows someone else's structure. Propose the smaller version and name what is being given up.

**Work that repeats.** Anything he will do again on a cycle should become a recurring task, a scheduled task, or a skill, rather than being retyped every few weeks. Both probation packs are the clearest example: the second one is the first one with different names in it.

**Friction sitting in front of a task.** A step waiting on a connector, a paired bridge, a named data source, or a message he has not written. Remove the friction rather than rescheduling the task. This is why contact steps carry pre-written messages, see the suggested messages section in the conventions.

**Sequencing that wastes waiting time.** Something scheduled after a blocker where the prep work could happen before it. A contractor cover paper is the pattern: the conversation waits on a person being back, the paper does not, so the paper moves earlier and the conversation becomes a decision rather than a briefing.

Keep them out of the reply. They are pending topics: count them on the last line and wait to be asked. When he does ask, give one at a time, as a concrete offer rather than an observation — "this one has not moved in three sessions, cut it or break it down?" is useful, "you may want to review your backlog" is noise. Hold the count to the two or three strongest, since a count of nine is a lecture with a number in front of it. Never bundle an optimisation into the file as though he agreed to it.

**Run the pass after the updates rather than before**, because a task he has just ticked or re-dated often changes which optimisation is worth suggesting.

## Applying a change

Use `Edit` on the specific lines. Rewriting the whole file for a two-line change risks losing notes and burns tokens for no gain. Reserve a full rewrite for a genuine restructure, like adding a bucket or moving most of a section between states.

**There are no sections to rebuild.** The file is four buckets and nothing else. This week, Quick wins, Big rocks, Dependency chain and Delegate to Claude were removed on 10 Aug 2026 and are now worked out by the board every time it renders. Never add them back as text: a section in the file is a copy, and a copy has to be maintained by hand every session or it starts describing a file that has moved on. That is the exact failure this change removed.

Three of them also exist in `data/views.md`, which Obsidian regenerates from the tags with Dataview. That is a different thing from a section in todo.md: nothing writes it by hand, so it cannot fall behind. Never edit it, and never rebuild it in this session — changing the tag on the task is the whole of the update.

So the whole update is the tag:

| To change this | Set this on the task |
| --- | --- |
| How much it matters, how heavy it is | `[impact:: high\|med\|low]` plus `[effort:: S\|M\|L]` |
| When it must be finished | `[due:: YYYY-MM-DD]` |
| Who does it | `[to:: Plan agent\|Implement agent\|<a name from people.md>]`, plus `rank:N` on an agent's |
| Handing a task to an agent | the four sub-tasks the board's Delegate to lays out, written by hand only if he asks you to: Plan, Review the plan, Implement, Review the work, slugs `<task id>-plan`, `-plan-review`, `-implement`, `-work-review`, each `blocked-by:` the one before, each with its own `id:`, the reviews `[to:: Tiago]`, and the task in Doing |
| An agent working on a sub-task now | a bare `` `doing` `` on that sub-task, its only state tag; unticked is To do and the tick is Done |
| A plan he has sent back | a `- feedback: …` note under the Plan sub-task, which is unticked, so the next night plans it again |
| A plan's file | a `- Plan: plans/<file>.md` note under the Review the plan sub-task |
| That it is finished | tick it, and move it under the bucket's `### Done` heading in the same edit (the board does it on its next save if you do not) |
| When it can first be started | `start:YYYY-MM-DD`, only where something real gates it |
| The one thing for now | `headline:YYYY-MM-DD`, the date it was set |
| What is in this week | `week` |
| What blocks what | `blocked-by:slug`, and `#slug` on the blocker |
| The message he sends | a `Suggested message:` note on the step |
| The prompt he pastes | a `Prompt:` note on the step |
| The ticket he raises | a `Jira (DSYS\|WADE):` note on the task or step |
| Where its context lives | a `Project:` note on the task, naming a folder under `data/projects/` |
| How often it comes round | `repeat:wed`, `repeat:wed-9:15`, `repeat:15`, `repeat:wd5`, `repeat:tue2`, or any with a `~` |
| The topics he takes into a recurring meeting | an `Agenda:` block on the task |

**The first three are written in brackets with a double colon, the rest in backticks.** Not a style choice: Dataview cannot read inside a code span, and impact, effort, due and ai are the four the queries in views.md need to rebuild Quick wins, Big rocks and Delegate to Claude. Writing one of those four as `` `due:2026-08-21` `` still parses everywhere in this repo but drops the task out of every Obsidian view, silently. `scripts/check_todo.py` flags it as a FIX. The older form is still read, so nothing has to be converted on sight — but never write it.

All of these work on sub-steps as well as tasks, and usually belong there. Half of any given week is sub-steps, and the prompts mostly sit on steps rather than whole tasks. `#slug` on a step works too, so a step can be the thing other tasks wait on.

**Every new task gets tier one applied in the same edit that creates it.** A task added without both scores is an unscored task he has to come back to, which is the friction this skill exists to remove. Suggest, name the comparison, and only ask when nothing is close.

**A new task never lands in Doing unless he said he is doing it.** Doing is a statement about right now, and filling it on his behalf turns it into a wish list — which is how the state stops meaning anything. Only put a new task there when he says he has started it, is working on it, or is in the middle of it. Everything else goes to **To do** when it is scored high enough or dated inside the next few weeks to be next up, and **Backlog** when it is real work with no time pressure yet. If it genuinely sits on the line, put it in To do and say which one you chose in its line of the report. A `due:` date inside the next fortnight does not by itself justify Doing; it justifies To do plus the date.

**Reporting back when he adds tasks.** One line per task: the title, its bucket and state, and the two scores — "Chase HR on the form — People, To do · med impact · S". Then `Needs you` if something failed or needs deciding, then the pending count. Nothing else.

If you scored a task yourself, say the scores in that line and name the comparison in a few words: "same as the sign-off chase". If you could not score it — nothing on the list is close, or the effort needs a first step defined — leave the scores out and end with one question asking him to score those tasks. Do not guess to avoid asking, and do not write the task in without scores and stay quiet about it.

**Only one `headline:` in the file.** Setting a new one means clearing the old one in the same edit. Two headlines is the same failure as a week with two priorities.

Three things still need judgement rather than a tag:

- **Capacity.** No more than two M-effort items tagged `week`. The checker counts them but will not decide. If three are competing, say so and ask which one loses the tag rather than listing all three.
- **Untagging.** Dropping `week` from something that slipped is the edit nobody makes. Do it explicitly at the end of a session, or the tag becomes a record of intentions.
- **A blocked quick win.** Quick wins leaves out anything waiting on an unfinished blocker or a `start:` that has not arrived, because he cannot act on either. So a wrong or stale gate does not just mislabel a task, it hides it. When you tick a blocker, check what it was blocking in the same move.
- **Which of the two dates you are setting.** `due:` is the deadline. `start:` is the earliest it can begin. Asking "is this a deadline, or the day it becomes possible?" takes one line and stops the two collapsing back into one. Where the gate is another task, use `blocked-by:` rather than guessing a date — it updates itself when the blocker is ticked.

Write or refresh the suggested message on every live contact step you touched. Anything with a message on it shows up in Quick wins automatically, whatever its parent's effort tag says, so there is nothing to promote by hand any more.

**A task that belongs to a project points at its folder.** Work carrying more context than a line can hold keeps a folder in `data/projects/<name>/`, and the task names it in a `Project:` note. Read that folder's `CLAUDE.md` before you touch the task, since it holds the background and the decisions already taken, and write the pointer onto any new task that joins the project. The board reads the note and offers a panel showing every task on the same folder, which is the only place the whole of a project is visible — a task without the note is missing from it. The conventions cover when a folder is worth creating and what goes in it.

Write a `Jira` note on anything whose real work is raising a ticket — a component contribution, a gap an audit turned up, a request to another team. The board turns it into a button that opens Jira's create form with the summary in place. **Never raise the ticket yourself.** He presses Create, on the form, with the summary in front of him; a ticket landing on a shared board without that is worse than no ticket. The conventions cover which board key to use and how to write the summary.

Finally, set **Last updated** to today.

## Recurring tasks, and the meetings among them

Some of the list comes round on a cycle rather than being finished once: the standing 1:1s, the monthly AOP status update. Those carry `` `repeat:` `` and the board keeps their dates for them. The meetings among them also carry an agenda, and writing it is the work here.

**How a recurring task works, so you do not fight the board over it.** One tag and one card.

```
- [ ] **Prepare for 1:1 with Morgan** [impact:: med] [effort:: S] [due:: 2026-09-02] `repeat:wed-9:15`
```

`repeat:wed` is every Wednesday, `repeat:wed-9:15` adds the time, `repeat:15` is the 15th of every month, `repeat:wd5` is the fifth working day of every month — for something dated by working days rather than by the calendar, which the AOP status update is — and `repeat:tue2` is the 2nd Tuesday of every month, for something pinned to a weekday rather than a day of the month, taking a time the same way: `repeat:tue2-15:00`. A `~` in front of any of them, `repeat:~fri-15:00`, says the day is the usual shape rather than a rule, for a meeting that is real but gets rebooked. `[due:: ]` is the occurrence the card is currently pointing at.

The board owns that date. On load, once the date on the card has passed, it moves it to the next occurrence, unticks the card, and files the agenda that was on it as `Previous agenda (that date):`. So:

- **Never hand-edit `[due:: ]` on a recurring task** to move it to the next cycle. The board has already done it or is about to, and two writers on one date is how it ends up a week out.
- **Never delete or rewrite a `Previous agenda` note.** The board writes it and replaces it each cycle. It is there to be read, which is the point of reading it before writing the next agenda.
- **The tick means "prepared", not "the meeting happened".** On a recurring meeting the card is the prep, so tick it once the agenda is written. It drops out of Quick wins and comes back unticked after the meeting.
- **A meeting that moved is a date edit, not a rewrite.** When he says a 1:1 has moved, change `[due:: ]` to the new day and stop — the roll only fires on a date in the past, so a card dated forward keeps its agenda and its tick untouched. Do not rebuild the agenda, and do not touch `Previous agenda`.
- **An agenda on an unticked card is still pending.** The board carries it forward rather than archiving it, on the grounds that an unticked card is prep that never happened. So a carried agenda holds topics that have not been raised yet: read it, keep what still matters, and say in the report that it came over from a meeting that did not happen.
- **Sub-steps roll too**, and so do their dates. A step's tick comes off with the parent's, and any `[due:: ]` or `start:` on it moves by the days the parent moved, since those are offsets from the occurrence. So a "send the nudge two days before" step keeps meaning that. Never re-date a recurring task's steps by hand.
- A recurring task with no `[due:: ]` gets one from the board. Do not invent one.
- The `repeat:` tag goes on the task, never on a sub-step. The checker flags that as a FIX.

**Making something recurring.** He names it. Add the tag and let the board date it. Do not convert a task to recurring on your own judgement — it changes what ticking it means, which is his call. The probation packs look recurring and are not: they follow a person's start date, not the calendar.

**His script is the brief for a meeting, and it is his to write.** `## Context` in todo.md carries `### Recurring meeting prep scripts`, one line per meeting in his own words: when it happens, what it is usually about, and what to check before it. Read it every session, the same way you read `### How I want messages and prompts written`. It is on the board where he can edit it, so his copy is always the current one — if it disagrees with anything here, his wins. Never rewrite a script to match what you did; if a script is missing something you had to guess at, say so as a question rather than editing it.

**What to write.** An `Agenda:` block on the task. One bullet per topic, one bullet indented under it with the context:

```
  - Agenda:
    - AOP2027
      - Confirm the rescoped recommendation is agreed so the tracker update can go out, due tomorrow.
    - Personal objectives
      - Shared 26 Aug, pending validation before adding to Sage.
```

No date on the note. `[due:: ]` on the task is the meeting date, and the board reads it from there — a date here would be the same fact twice.

**What the Copy button produces**, and the shape you are writing towards. It is not the markdown above verbatim:

```
Wednesday, 2 September 2026

Agenda
- AOP2027
  - Confirm the rescoped recommendation is agreed so the tracker update can go out, due tomorrow.
```

The date of the meeting in full, on its own line. A blank line. The word `Agenda` on its own line. Then the topics, both levels as bullets. The board builds that from the block and the task's date, and it also puts an HTML flavour on the clipboard so a paste into Google Docs keeps both levels as real bullets rather than as hyphens. Nothing about that is yours to write — write the block, and the format follows. It matters only because it tells you what the topics have to survive being read as: a heading and a list in somebody else's document.

**How to fill it.** Work out the topics from the live list rather than from the last agenda, then read `Previous agenda` to see what was already raised. The script says what to look at; go and look. For the Morgan 1:1 that means anything in Waiting for review or due around the meeting date that touches them or their team, plus the regulars the script names. A topic earns its place when there is a decision, an input or a sign-off wanted from the other person, or when something has moved enough that they would want to know.

Rules for the writing itself:

- **Both levels are bullets.** The topic is one bullet and its context is one bullet nested under it. Not a title with a paragraph, not a bullet with a sub-heading. That is the format he pastes and it is not negotiable.
- **A few words as the title.** `AOP2027`, `Personal objectives`. It is a heading in somebody else's document, not a sentence.
- **One context bullet, two at most.** Say what has moved, what is being asked for, and by when. If it needs a paragraph the topic is really two topics.
- **Written neutrally, because they read the same notes.** No pronouns for the other person, no "she needs to", no "chase her on". Write it as the shared record of what the meeting covered, which is what it becomes.
- **Nothing from the list that is not theirs.** The agenda is not a status report on his week. A task he is getting on with, and which needs nothing from them, stays off it.
- **Say when a decision has a window.** "before the window closes in September" is the sentence that gets a decision made in the meeting rather than after it.
- **Something that has not moved since the last meeting is not a topic**, and `Previous agenda` is how you can tell.
- **Do not invent facts to fill a topic.** Leave `[fill in]` in the context bullet, the same rule as prompts and Jira summaries.
- **Three to five topics.** A 1:1 is thirty minutes. More than five and the last two do not get discussed, which is worse than not raising them, because they now read as covered. The checker flags six.

**Rewrite the block, do not append to it.** It holds the agenda for the date on the card and nothing else. Anything that came out of the last meeting becomes a task in the buckets, which is where actions live.

**Write the agenda for any recurring meeting that has one coming**, in the session, rather than raising it as a topic. The whole point of a standing meeting is that it does not need deciding, and an agenda he has to ask for is one he prepares in the ten minutes before the call.

## The one thing

`PA.md` holds tier two, the rule for what the headline is. This is the writing of it.

**If it still holds:** say so and stop. Do not re-open the choice.

**If it is solved, or blocked:** pick the next one using tier two. Count what waits on each candidate, look for what a candidate makes unnecessary rather than only unblocked, and prefer something he can finish this week. Propose one, with the number of tasks it frees, and let him confirm. Then write `headline:` with today's date and clear the old one.

**If there is no headline at all:** propose one. Do not leave the file without one for a second session — that is the tier falling out of use.

Only ever propose one. Offering three candidates hands the decision back to him, and the point of this pass is that you did the counting.

**A headline is not picked on a phone.** `pa-mobile` reports that the old one is solved or blocked and stops there. A headline chosen between meetings is the kind that changes again tomorrow.

## Verify and deliver

Run the checker before delivering, every time there was a write:

```bash
python3 ~/Code/to-dos/agents/pa_agent/skills/pa/scripts/check_todo.py ~/Code/to-dos/data/<dataset>/todo.md
```

Fix anything it flags, since handing over a file with a Saturday deadline in it wastes his time and undermines the point of the list. Do not report a flag that was already there when you arrived unless he asked; flags matter when your own edit caused one.

`references/audit-checklist.md` is what to check by hand that the script cannot, mostly dependency and state logic. Read it before delivering after a large restructure.

**The file is edited in place, on his disk.** Use `Edit` and it is already saved; there is nothing to upload, attach or commit.

**Do not ask whether the board is open.** Start reading and editing straight away. He knows the board is there and asking every session costs a turn to be told yes or no. What the risk actually needs is the closing line: the board holds his edits in the browser until it saves and writes the whole file when it does, so a save from a stale board overwrites your work.

Always end by telling him to press **Reload** on the board, without asking whether it is open. `change-report.md` carries that line, so it comes out on its own; do not write a second one. If he says mid-session that he has unsaved work on the board, stop and let him Save first.

## Reports rendered from a template

Some of what the PA produces is a report he reads rather than a change to the file: the morning brief, the week ahead, the state of what is stuck. Those are rendered from a template file rather than written freehand, so the same report comes out in the same shape every time and he can scan it instead of reading it.

The templates belong to the skill that produces the report, in its own `templates/` folder, and they are his to edit. `references/templates.md` here holds the syntax and the full list of fields available to fill them, in one copy, so every skill renders the same way. Read it before rendering for the first time in a session.

**Render, do not type.** `core/render.py`'s `render(template_path, context)` is
what actually carries out the syntax `references/templates.md` documents —
the placeholder rules, the empty-line rule, the `lines:` ceiling. For a
report about today, `core/aggregate.py`'s `today_view()` or `meeting_view()`
builds the context; `references/templates.md`'s own "How a report actually
gets rendered" section has the worked example. Reasoning the fields out by
hand and writing the report freehand to match the template's shape is the
failure this exists to remove — see IMPROVEMENTS.md, "Every report the PA
sends is rendered by hand."

The reply after a change is templated too, `templates/change-report.md`. Writing
the change **into the file** never is: the conventions decide that, and a
template that tried to would be a second copy of them.

## Judgement calls that come up

**He reports a bundled step as done, but only did part of it.** Split the line rather than ticking it. This happened with "ask for the nominee list, and send the achievements reminder" — the list arrived, the reminder had not been sent. Ticking the whole thing would have lost a real task. When a step contains "and", check both halves before ticking.

**A new task has no date.** Do not invent one silently. Either leave it undated, or propose a date and flag it as your assumption so he can correct it. Inventing dates quietly makes the whole file untrustworthy.

**He adds something that duplicates existing work.** Say so and offer to merge, rather than creating a near-duplicate. Two tickets for the same thing is how the list stops being believed.

**A task keeps rolling over without progress.** Name it once, without nagging. Three sessions untouched usually means it belongs in Backlog with a revisit date, or it needs breaking down because it is too big to start. Offer both readings and let him pick.

**He asks what to work on.** The headline is the answer. Give it in one line, then the runners-up: what is due soonest, what is blocking someone else, and what could be handed to an agent instead of scheduled. That last one is often the most useful.

**A new task obviously matters but the effort is unknowable.** Score the impact, and say plainly that the effort needs the first step defined before it can be guessed. Then define that first step as a sub-step. Do not guess L to be safe: an L with no sub-steps is the exact shape of a task he never starts.

**The headline has not moved in two weeks.** Say it once. Either it is genuinely a big piece of work and wants breaking into steps, or it was the wrong pick and something else is really blocking him. Offer both readings and let him choose. Do not silently swap it.

**A contact step is sensitive.** Probation outcomes, performance, salary, someone's contract. Still write the message, but mark it as a draft to edit rather than something to fire, and keep it shorter than you want to. The conventions cover the format.

**A delegable task needs an input he has not given, a file path, a data source, a budget.** Write the prompt anyway with a `[bracketed]` gap in it, and name the gap when reporting back. A prompt held back until the input arrives is friction sitting in front of the task, which is the thing this skill exists to remove.

**He asks for a message for something that is not in the file yet.** Add the task first, then the message. A message with no task behind it gets sent and then forgotten about, and nothing tracks whether the reply arrived.

**He hands you a brief, a plan, a deck or a set of documents for one task.** That is a project, not a note. Put the files in `data/projects/<name>/`, write the background into a `CLAUDE.md` in there addressed to a session that has never seen this one, and leave a one-line `Project:` note on the task. Pasting the same context into the task every session is the thing the folder removes. Below that bar — one or two sentences, no documents — it stays a note, since a folder holding a sentence is worse than the sentence.

**He mentions something about a person rather than about work.** Somebody going on leave, a contract ending, a new starter, a name he keeps seeing spelt wrong. That is not a task and should not become one, because it will sit in a bucket unticked forever. It goes in `## Context` with an `on:` or `until:` tag if there is a date. The test is whether he would ever tick it.

## Where things live

- `data/.current` — which dataset is live right now, e.g. `twinkl`. Read this first; everything below is relative to `data/<that name>/`, not the bare `data/` root. The board's own dropdown is what changes it.
- `data/<dataset>/todo.md` — the list. `data/` holds every dataset and everything derived from each, and is the whole of what git ignores. The four buckets, and the `## Context` section holding standing facts about people and dates. The only source of truth for both.
- `kanban/index.html` plus `kanban/server.py`, launched by `board.command` at the root — the board. It reads and writes the current dataset's todo.md, and works out This week, Quick wins, Big rocks, Dependency chain and Delegate to Claude from the tags. Those five exist nowhere else.
- `data/<dataset>/projects/<name>/` — one folder per project, holding the background in a `CLAUDE.md` and the source documents beside it, for work carrying more context than a task line can hold. Private like everything else in `data/`. The tasks stay in todo.md and point at the folder; the folder never holds a task list.
- `~/Code/to-dos/agents/pa_agent/PA.md` — standing behaviour: who he is, where the list lives, the two tiers of prioritisation, the standing rules and the tone. Read every session, before the conventions.
- `~/Code/to-dos/CONVENTIONS.md` — the file format: buckets, states, tags, date rules, suggested messages, meeting agendas, capacity ceiling. Read this every session.
- `references/audit-checklist.md` — what to check by hand that the script cannot, mostly dependency and state logic.
- `references/templates.md` — the report template syntax and every field available, shared by every skill that renders one.
- `scripts/check_todo.py` — the mechanical checker. Run it before delivering.
- `data/<dataset>/backups/todo-backup-*.md` — written by the board, one per run, before its first save. Useful if something is clobbered.
- `data/<dataset>/backups/done-archive.md` — finished work the board has lifted out of `todo.md` once it had been ticked off for more than 30 days. Append-only and never pruned. **A task missing from the list is not necessarily a task that never existed — look here before concluding anything was lost, and never re-add something from here to todo.md unless he asks.**
- `data/<dataset>/briefings.json` — a generated briefing per task (direction, what's done, what's still needed), written overnight by `agents/plan-agent/brief.py` and read by `newChat()` and by this skill. Never write this file by hand; refresh one entry with `python3 agents/plan-agent/brief.py --task "<title>"` after a groom that changes what a task is actually asking for — worth doing so the next chat or plan on it starts from what you just settled rather than what the overnight pass last saw.

**Answering "what is on this week" means reading the `week` tags**, not looking for a section. Same for the other four views. If you find yourself wanting to write one of them into the file to answer a question, answer in chat instead.

## The other skills, and what each hands you

| Skill | What it does before it reaches you |
| --- | --- |
| `pa-checkin` | The daily check-in. Pulls meeting actions, reads the list, renders the brief, asks what has changed. Hands you the changes and the headline decision. |
| `pa-retrieve-tasks` | Pulls action items from the meeting recorder and reviews them one by one. Hands you the ones he kept, each with its provenance line. |
| `pa-checkout` | Walks Doing and Reviewing. Hands you what he decided about each. |
| `pa-focus` | Walks To do and Doing, asking what is honestly in flight. Hands you what goes back to Backlog. |
| `pa-review-plans` | Goes through the planning agent's plans. Writes plan statuses itself, hands you the note that goes on each task. |
| `pa-mobile` | Any of the above, from a phone, asked as multiple choice and reported from the mobile templates. Hands you the same changes. |
| `do` | Hands an agreed plan to `implement-agent`. That agent never writes the list, so anything it needs changed comes to you as a request in its report. |
| `pa-attach` | Files a conversation against a task through `attach-queue.json`, which the board drains. Nothing reaches you. |
