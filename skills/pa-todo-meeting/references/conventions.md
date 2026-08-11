# File conventions

The format is load-bearing. Every rule here exists because breaking it caused a real problem.

## Buckets

Four, in this order, matching how his role actually splits:

1. **People** — probation reviews, performance reviews, hiring, 1:1s, growth conversations
2. **Design oversight** — aligning designers, aligning stakeholders, unblocking, reviewing others' work, project planning
3. **Design System** — a temporary remit, so scope creep here is a signal worth naming. Sub-organised into five streams: ways of working, audits, improvements, documentation, enablement. The stream is named in the task's first note line.
4. **Strategic** — planning, defining ways of working, strategy decks, testing new ways of working with AI

Do not add a fifth bucket without asking. The four map to how he is measured, and a fifth usually means a task is miscategorised.

## States

Inside each bucket, three states. These replaced Now / Next / Later / Parked on 10 Aug 2026 at his request. If a file still uses the old four, rename the headings rather than adding new ones alongside.

- **Doing** — the current focus window, roughly the next two weeks
- **To do** — two to four weeks out
- **Backlog** — real work, no time pressure yet. Also where anything deliberately not being done goes, with a revisit date in the note.

Backlog absorbed the old Parked state, so it holds two different things: real work nobody has scheduled yet, and work deliberately deferred. A deferred item needs a revisit date in its note, otherwise the two become indistinguishable and the deferred one is never looked at again.

A state can be empty. Leave the empty headings in place, they make the shape scannable and they stop a bucket looking abandoned.

## Tags

Every top-level task carries impact, effort and a delegation tag. Dates only where real.

`impact:` and `effort:` together are tier one of how he prioritises, and they are set at intake, not later. Neither is optional. A task missing either one shows a **needs scoring** marker on the board and is counted in the header, because a blank score reads as low and the task sinks without anyone deciding that it should.

- `impact:high` / `med` / `low` — how much it moves the needle for the team, the design system or the business
- `effort:S` / `M` / `L` — S is under half a day, M is one to three days, L is a week or more
- `due:YYYY-MM-DD` — the deadline. When it has to be finished by. Only when there is a genuine date.
- `start:YYYY-MM-DD` — the earliest it can begin. Optional, and only where something real gates it.
- `urgent` — time-critical with no fixed date. Never combine with `due:`, they are alternatives.
- `ai:full` — hand to Claude, review the output. The work is reading, comparing, extracting, formatting or generating from a source that already exists.
- `ai:partial` — Claude does the heavy lift, judgement or delivery stays his. Usually Claude drafts, he decides.
- `ai:none` — inherently his. Conversations, decisions, relationships, anything whose value is that it came from him.

Sub-steps carry their own `due:` where the parent needs back-planning, and their own `ai:` tag where it differs from the parent. Most probation steps do differ, which is the whole point of tagging at that level.

### Two dates, not one

Added 11 Aug 2026. `due:` used to carry two different facts at once: the day something has to be finished, and the day it becomes possible to do. Nothing could tell them apart, so Quick wins had to guess — and either guess was wrong half the time. A September deadline on a bookable meeting is not the same thing as a September deadline on a step that cannot start until the request goes out.

- **`due:` is the deadline.** It never means "do it then". An overdue task is the most actionable thing on the list, not the least, so a passed deadline never hides anything.
- **`start:` is the gate.** Quick wins leaves out anything whose `start:` has not arrived, because he cannot act on it yet. A `start:` in the past does nothing and should come off the line — the checker flags it.

Only add `start:` where something real gates the work: a person is back on the 1st, the quarter has not begun, a form does not exist yet. Where the gate is **another task**, use `blocked-by:` instead. That is the more precise tool and it updates itself when the blocker is ticked, whereas a date has to be re-guessed by hand. A step now carries its own `blocked-by:`, so "cannot start until the step before it is done" is expressible directly.

A sub-step takes the later of its own `start:` and its parent's, since a step cannot begin before the task it sits inside can.

### The four tags that replaced the copies

Added 10 Aug 2026. Before this, whether a task was in this week's plan, what it was blocked by, where it ranked for delegation and what its prompt said all existed only inside five sections copied to the top of the file. That made those sections hand-written, which made them drift. All four now live on the task, and the views are worked out from them.

- `week` — in this week's plan. Set by hand, because it is a judgement about what fits rather than something the dates imply. Goes on sub-steps as readily as on tasks, since half of This week is sub-steps.
- `#slug` — a short readable name. Given **only** to tasks something else points at, never to every task. A number would renumber on reorder and mean nothing on sight, which is why it is a slug.
- `blocked-by:slug` — waits on another task, comma-separated for more than one. Waiting on a person or an event rather than a task is not a dependency, it is a `Waiting on:` note, because there is no task to point at and inventing one would put a fake item on the board.
- `rank:N` — position in Delegate to Claude, which is ordered by how much time each one gives back. Judgement, so it is set by hand. Goes on the thing that carries the prompt, which is often a sub-step.

`#slug` works on sub-steps as well as tasks, and several blockers in the file are steps rather than whole tasks. A `blocked-by:` pointing at a step resolves normally when that step is ticked.

### The one thing

Added 11 Aug 2026. Tier two of how he prioritises.

- `headline:YYYY-MM-DD` — the single task that makes the others easier or unnecessary, and the date it was chosen. **Exactly one in the file, or none.** Setting a new one means clearing the old one in the same edit.

It is not the top of the impact-against-effort sort. It is chosen, usually because other tasks wait on it, and it stays chosen until it is solved. The board shows it as a bar above the columns, with a count of how many tasks it frees, and a task can be made the headline from the panel or by dragging a card onto the bar.

Do not invent another tag to avoid writing a note. The test is whether one of the views needs it. If no view reads it, it is a note.

## Prompts

Every `ai:full` task or sub-step carries a prompt, on the task, indented one level deeper, in the same shape as a suggested message:

```
  - [ ] Collect responses into the feedback sheet `due:2026-08-19` `ai:full` `rank:8`
    - Prompt: "Take the 360 feedback responses for [name], ..."
```

The prompt used to live only in Delegate to Claude, which meant it was the one piece of content with no home in the buckets and could not be rebuilt, only maintained. Writing it on the task fixes that.

His own rules under `### How I want messages and prompts written` in the `## Context` section of todo.md override the rules below. Rules for the prompt itself are otherwise unchanged: one to three sentences, second person imperative, name the skill where one applies, say what the output should be, and leave `[path]`, `[name]`, `[fill in]` rather than guessing. Name the person rather than leaving `[name]` where the task is about a specific person, otherwise two probation packs collapse into one prompt he has to edit every time.

## Suggested messages

Any live step whose real work is contacting a person carries a pre-written message underneath it, ready to copy and send. That covers asking someone for something, reminding or chasing, sending a request, sharing a document for review, booking a call or session, and checking in. The checker flags contact steps that are missing one.

The reason is that these steps stall for days, and what stalls them is writing the opening line, not doing the thing. A message already sitting there turns a five minute task into a ten second one.

Format, indented one level deeper than the step it belongs to:

```
  - [ ] Remind [name] I need their list of achievements `due:2026-08-12` `ai:none`
    - Suggested message: "Hey [name] 👋 ..."
```

Sensitive messages use `Suggested message (draft):` instead, with a following note line saying why. The marker used to be free prose in the middle of the label, which meant nothing could reliably tell a ready message from a draft. The bracket is now the marker and the prose is the explanation.

One level deeper matters, because parents carry notes and sub-steps at the same indent, so a message at the same level as its step is ambiguous about which step it serves.

Rules for the message itself. **His own rules under `### How I want messages and prompts written` in the `## Context` section of todo.md override everything below, and everything in the Prompts section above.** He can see and edit that section on the board, he cannot see this file, so where the two disagree his copy is the one that is current:

- **Open with the wave.** To a named person, `Hey [name] 👋` then straight into the message. To a group or a channel, `Hey 👋`. No greeting line after it, no "I hope this finds you well".
- **Write in his voice, not yours.** Plain, direct, warm enough to not read as curt. No em dashes, he does not use them, use commas. No bullet points inside a message. No corporate throat-clearing like "I hope this finds you well".
- **Keep it short.** Two or three sentences. If it needs more, the message is doing work the task should be doing.
- **Name the deadline where there is one**, since a request with no date is the thing that comes back late.
- **Say what good enough looks like** where it removes work for the other person, for example that rough bullets are fine rather than a written piece.
- **One message per step.** If a step contacts two different people, that is two steps, so split it first.
- **Do not invent facts** to make the message flow. If the message needs a detail that is not in the file, leave a clearly marked gap like `[date]` rather than guessing.
- **Sensitive messages stay drafts.** Anything touching probation outcomes, performance, salary or someone's contract gets a message he is expected to edit, and the note should say so. Do not write those as if they are ready to fire.

Rewrite the message when the surrounding facts change. A chase message that still refers to a date that has passed is worse than no message, because he will send it without rereading.

## The five views

He works from five views: This week, Quick wins, Big rocks, Dependency chain and Delegate to Claude. Until 10 Aug 2026 they were sections at the top of the file, copied out of the buckets by hand every session. They were removed that day and are now worked out by the board, live, from the tags below.

| View | Built from |
| --- | --- |
| This week | `week` |
| Quick wins | `effort:S` grouped by `ai:`, plus any live step carrying a suggested message. Anything waiting on an unfinished blocker, or whose `start:` has not arrived, is left out. |
| Big rocks | `impact:high` and `effort:L` |
| Dependency chain | `blocked-by:`, resolved against `#slug` |
| Delegate to Claude | `ai:full`, ordered by `rank:` |

Above the board sits the headline, from `headline:`. It is one task, not a view of many.

**Do not write any of them back into the file.** A section in the file is a copy, and a copy is only correct until the next thing changes. That was the actual failure mode: the board could tick a sub-step and the section above it would keep saying the work was outstanding, and whichever one he happened to read is what he believed. Nothing is stored twice now, so nothing can disagree.

The consequence to accept is that todo.md on its own no longer shows him a weekly plan. That is the trade, and it was made deliberately.

### What the views still expect of the tasks

- **Quick wins earns its place from the message, not the effort tag.** Any live step with a written message appears there whatever its parent is, because sending one message out of an `effort:L` probation pack is a gap-sized job. There is nothing to promote by hand, but it does mean a message written on the wrong step puts the wrong thing in front of him.
- **Quick wins only shows what he can act on now.** Two things take a task out: a `blocked-by:` naming an unticked task or a slug that does not exist, and a `start:` that has not arrived. Both are counted in a line at the top so the section never quietly shrinks. A quick win he cannot start is not a win. The consequence: a stale `blocked-by:` or a forgotten `start:` now hides a task rather than just mislabelling it, so when you tick a blocker, check what it was blocking in the same move.
- **A deadline never hides anything.** Quick wins ignores `due:` entirely. Something overdue is the most actionable item on the list.
- **Every message states whether it is safe to send.** `Suggested message:` is ready. `Suggested message (draft):` is one he edits first, and the board shows it with a warning. Sensitive subjects are always drafts.
- **Undated contact steps still surface.** They sort last rather than disappearing, because those are the ones that rot quietly. Leave the `[date]` gap in the text rather than inventing one.
- **A prompt lives on the thing it delegates**, which is usually a sub-step rather than a whole task.

## Delegate to Claude

Everything `ai:full`, ordered by `rank:`, which is how much time each one gives back. The ranking is judgement, so it is set by hand and worth re-reading rather than left to rot.

- **Every `ai:full` item carries a prompt.** The checker flags one without.
- **Keep prompts to one to three sentences.** They are a starting point he complements, not a spec. A prompt that tries to be complete is one he has to read before using.
- **Write the prompt as an instruction to Claude**, second person, imperative. Name the skill where one applies, for example `ds-snapshot` or a deck-building skill.
- **Say what the output should be** where it is not obvious, for example grouped by component, or ready to paste into the rationale doc.
- **Do not invent inputs.** Leave `[path]`, `[name]`, `[fill in]`. Guessing produces a prompt that runs and returns the wrong thing.
- **Name the person** where the task is about a specific person, rather than leaving `[name]`. Otherwise the two probation packs collapse into one prompt he edits every time.
- **Rewrite the prompt when the task changes.** A prompt referring to a step that is already done sends him round a loop.

An item that is not live yet, waiting on something merging or being defined, keeps its rank and its prompt. It is there so it is not forgotten, and the prompt is ready for the day the blocker clears.

**Taking work back off Claude removes the prompt and the rank.** A prompt left on a task he has decided is his reads as a standing instruction to hand it over, and the next session will act on it. The board does this automatically when the `ai:` tag is changed there; do it by hand when editing the file directly.

## Section order

The file is the title, the `Last updated` line, the **How this works** legend, **Where the other views went**, then the four buckets in order: People, Design oversight, Design System, Strategic. Sections are separated by `---` on its own line.

## Ordering

Anything with `due:` or `urgent` jumps the queue regardless of impact and effort. Everything else: high impact first, and within the same impact, lower effort first. A `high`/`S` task above a `high`/`M` task is correct and worth preserving when editing.

## Dates

**Working days only.** Weekend deadlines get pulled back to the previous Friday. The exception is a step that waits on someone else replying, which pushes to the following Monday instead, because a Friday deadline on someone else's reply is really a Monday deadline.

**UK bank holidays count as non-working days.** The team is UK-based. The checker script knows England and Wales dates for 2026 and 2027.

**Back-plan from the formal deadline.** A probation formally due Sunday 23 August closes Friday 21 August in this file, and every sub-step is dated backwards from there. Never leave the formal date as the working date.

**Sign-off costs a day.** Where a document goes to someone for approval before submission, the draft and the share are separate dated steps, and the submission is the day after. A skip-level manager signs off probation rationale docs.

**Reminder steps are five days after the request**, moved to the next working day if that lands on a weekend. The note should say so, otherwise the arithmetic looks wrong to anyone reading it later.

## This week

The honest filter on top of Doing: Doing is what is live, `week` is what actually fits.

**The capacity ceiling is two M-effort items per week**, once meetings are counted. Everything else should be S. If more than two M items are competing, say so and ask which one loses the tag rather than tagging three and pretending. The checker counts them; it will not decide.

**A `week` tag with a date outside the week is wrong.** Drop the tag or bring the date in.

**Untag as deliberately as you tag.** A `week` left on something that slipped turns the view into a record of intentions. This is the edit nobody makes, so make it explicitly at the end of a session.

**Name which dates in the week cannot move**, as a note on the task itself. That reasoning used to sit in the section and had nowhere to go when it was removed.


## Checkboxes

Tick sub-steps, not parents. A parent closes only when all its sub-steps are ticked. Add a short inline note on a completed step when the outcome matters later, for example "received and added to the spreadsheet", because that detail is what makes the next step possible.

## Named people

**This moved into the file on 10 Aug 2026.** Who is who, who is away, whose contract runs out when, and the spellings that matter are all in the `## Context` section at the bottom of todo.md. Read it every session alongside the buckets.

It was here until then, which meant he could not see it, could not correct it, and the board could not use it. It is standing information about his working life, not a rule about how the file is formatted, so it belongs with his data rather than in this skill.

Do not copy it back into this file. One copy, in todo.md, for the same reason the five views were removed from the file.

Keep it current as a matter of course: a leave date that has passed, or a contract that has been extended, is exactly the kind of stale fact that produces a confidently wrong plan.
