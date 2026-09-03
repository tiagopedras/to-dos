# File conventions

The format is load-bearing. Every rule here exists because breaking it caused a real problem.

## Buckets

Four, in this order, matching how his role actually splits:

1. **People** — probation reviews, performance reviews, hiring, 1:1s, growth conversations
2. **Design oversight** — aligning designers, aligning stakeholders, unblocking, reviewing others' work, project planning
3. **Design System** — a temporary remit, so scope creep here is a signal worth naming. Sub-organised into five streams: ways of working, audits, improvements, documentation, enablement. The stream is named in the task's first note line.
4. **Strategic** — planning, defining ways of working, strategy decks, testing new ways of working with AI

Do not add a fifth bucket without asking. The four map to how he is measured, and a fifth usually means a task is miscategorised. He can rename, reorder, add and remove buckets himself on the board, so read the headings out of the file rather than assuming these four are what you will find.

## States

Inside each bucket, four states. Doing / To do / Backlog replaced Now / Next / Later / Parked on 10 Aug 2026 at his request; if a file still uses the old four, rename the headings rather than adding new ones alongside. Waiting review was added on 26 Aug 2026.

- **Waiting review** — finished as far as he is concerned, sitting with somebody else for sign-off. On the board it is the column to the right of Doing, so in the file it is the first heading in the bucket.
- **Doing** — the current focus window, roughly the next two weeks
- **To do** — two to four weeks out
- **Backlog** — real work, no time pressure yet. Also where anything deliberately not being done goes, with a revisit date in the note.

Backlog absorbed the old Parked state, so it holds two different things: real work nobody has scheduled yet, and work deliberately deferred. A deferred item needs a revisit date in its note, otherwise the two become indistinguishable and the deferred one is never looked at again.

**New tasks do not go into Doing.** That state is his own statement that something is live, so it is only ever set from what he says: he has started it, is working on it, is mid-way through it. A task arriving on the list goes to To do if prioritisation puts it next up, or Backlog if it does not, whatever its score or date. Adding to Doing on his behalf makes the state a wish list rather than a record of what is in flight.

**Nothing goes into Waiting review on his behalf either.** Like Doing, it is a statement of fact about where the work sits, and only he knows whether the pack actually went. Move a task there when he says he has sent it, handed it over or is waiting on a reply; move it back to Doing when the review comes back with work in it, and tick it when it comes back clear. A task sitting in Waiting review with no note saying who has it is worth asking about. Waiting on a person is the state most likely to be forgotten.

A state can be empty. Leave the empty headings in place, they make the shape scannable and they stop a bucket looking abandoned.

## Tags

Every top-level task carries impact, effort and a delegation tag. Dates only where real.

`impact` and `effort` together are tier one of how he prioritises, and they are set at intake, not later. Neither is optional. A task missing either one shows a **needs scoring** marker on the board and is counted in the header, because a blank score reads as low and the task sinks without anyone deciding that it should.

- `[impact:: high]` / `med` / `low` — how much it moves the needle for the team, the design system or the business
- `[effort:: S]` / `M` / `L` — S is under half a day, M is one to three days, L is a week or more
- `[due:: YYYY-MM-DD]` — the deadline. When it has to be finished by. Only when there is a genuine date.
- `[ai:: full]` — hand to Claude, review the output. The work is reading, comparing, extracting, formatting or generating from a source that already exists.
- `[ai:: partial]` — Claude does the heavy lift, judgement or delivery stays his. Usually Claude drafts, he decides.
- `[ai:: none]` — inherently his. Conversations, decisions, relationships, anything whose value is that it came from him.
- `start:YYYY-MM-DD` — the earliest it can begin. Optional, and only where something real gates it.
- `urgent` — time-critical with no fixed date. Never combine with `due`, they are alternatives.
- `done:YYYY-MM-DD` — the day it was ticked off. Written by the board, not by hand. Never add it to an open task, and never remove it from a ticked one: it is what decides when finished work is old enough to be archived out of the file.
- `repeat:wed-9:15` — how often this task comes round: a three-letter weekday with an optional time, a day of the month, a working day of the month, the nth weekday of the month (`repeat:tue2` for the 2nd Tuesday), or any of those with a `~` in front where the day is the usual shape rather than a rule. See recurring tasks below.

Sub-steps carry their own `[due:: ]` where the parent needs back-planning, and their own `[ai:: ]` tag where it differs from the parent. Most probation steps do differ, which is the whole point of tagging at that level.

### Two tag syntaxes, and which one to write

Changed 12 Aug 2026. The first four are written as Dataview inline fields, in brackets with a double colon. Everything else stays a backtick code span. Both lists are above; the split is not cosmetic.

Dataview cannot see inside a code span, so a tag written as `` `due:2026-08-21` `` is invisible to the queries in `data/views.md`, which rebuild Quick wins, Big rocks and Delegate to Claude for reading the list in Obsidian. Those three views need impact, effort, due and ai, and only those, which is why only those four moved. The rest kept the code span, because a line carrying eight bracketed fields is unreadable and nothing queries them.

**Write the bracket form.** The board writes it, and the checker flags a code span on a task line as a FIX. Old-form tags are still read correctly by both the board and the checker, and always will be — the backups and the done-archive are full of them, and losing a score off a restored task would be worse than accepting two syntaxes. That tolerance is for reading, not for writing.

The nuisance to accept: `[due:: 2026-08-21]` is uglier in a plain text editor than `` `due:2026-08-21` `` was. That was the trade, and it was made to stop the views being hand-maintained in a second place.

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

## Projects

Added 26 Aug 2026. Some work carries more context than a task line can hold: a plan, a ticket history, source documents, a decision and the reason it went the way it did. That goes in `data/<dataset>/projects/<name>/`, one folder per project, with a `CLAUDE.md` inside holding the background and the source files beside it. Under `data/` rather than at the repo root, because a project folder is full of real names and real dates, and a folder cannot be forgotten by the ignore rules the way a new file can. It also puts the context in the Obsidian vault beside the list it belongs to.

The task in todo.md stays short and points at the folder, as an ordinary note on the task, first in its notes and above the stream line. The note itself stays written as `data/projects/<name>` — short for the current dataset's own folder, the same shorthand as everywhere else in this skill:

```
- [ ] **AOP2027: redefine the design initiative and deliver it** [impact:: high] [effort:: L] [due:: 2026-09-02] [ai:: partial]
  - Project: `data/projects/AOP2027`. Background in its `CLAUDE.md`, the raw material for the rescope in `redefinition-brief.md`, the AOP deck and the 1:1 in `sources/`.
```

**Write `Project:` and then the path in a code span.** The board reads the folder name straight out of that note, shows it as a chip on the card, and clicking the chip opens a panel listing every task pointing at the same folder. There is no `project:` tag: the note came first, it is what the file already had, and a tag saying the same thing would only give the two a chance to disagree. Everything after the path stays prose, and is worth writing — it is what tells the next session which file in there to open.

The rest of the note says what is in the folder. Name the files, because a folder listing is not a description and the next session has to open all of them to find out which one matters.

A project is not a bucket and not a state. Its tasks stay where they belong: the presentation is Design System work, the deck review that feeds it is People work, and the list is right to keep them apart. The panel is what puts them back together, which is why the pointer has to be on every one of them and not just the biggest.

Rules that keep it honest:

- **One folder per project, named as a slug.** Lowercase and hyphens, or the shape the project already has a name in, as `AOP2027` does. It becomes the chip on the card, so it has to read at a glance.
- **Every task on the project carries the pointer.** A task without it is invisible to the panel, which is the one place the whole of the project is visible.
- **The folder holds the context, todo.md holds the tasks.** Do not write a task list into the project's `CLAUDE.md`, and do not copy the background into the task. Two copies of the same fact is the failure this whole file exists to avoid.
- **Do not create a folder to hold one sentence.** A project earns a folder when the context does not fit on the task and would otherwise be re-explained every session. Below that, it is a note.
- **Read the folder's `CLAUDE.md` before touching its tasks.** That is why it is there. A session that re-plans a project without reading its background produces a plan the last session already rejected.
- **The board never reads those files.** It reads the pointer and nothing else, so the folder can hold anything, in any format, without the board having an opinion about it.

Everything private lives under `data/`, and a project folder is no exception. Nothing in there goes in a commit, a report or a message.

## Prompts

Every `ai:full` task or sub-step carries a prompt, on the task, indented one level deeper, in the same shape as a suggested message:

```
  - [ ] Collect responses into the feedback sheet [due:: 2026-08-19] [ai:: full] `rank:8`
    - Prompt: "Take the 360 feedback responses for [name], ..."
```

The prompt used to live only in Delegate to Claude, which meant it was the one piece of content with no home in the buckets and could not be rebuilt, only maintained. Writing it on the task fixes that.

His own rules under `### How I want messages and prompts written` in the `## Context` section of todo.md override the rules below. Rules for the prompt itself are otherwise unchanged: one to three sentences, second person imperative, name the skill where one applies, say what the output should be, and leave `[path]`, `[name]`, `[fill in]` rather than guessing. Name the person rather than leaving `[name]` where the task is about a specific person, otherwise two probation packs collapse into one prompt he has to edit every time.

## Suggested messages

Any live step whose real work is contacting a person carries a pre-written message underneath it, ready to copy and send. That covers asking someone for something, reminding or chasing, sending a request, sharing a document for review, booking a call or session, and checking in. The checker flags contact steps that are missing one.

The reason is that these steps stall for days, and what stalls them is writing the opening line, not doing the thing. A message already sitting there turns a five minute task into a ten second one.

Format, indented one level deeper than the step it belongs to:

```
  - [ ] Remind [name] I need their list of achievements [due:: 2026-08-12] [ai:: none]
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

## Recurring tasks

Added 1 Sep 2026. Work that comes round on a cycle rather than being finished once: the standing 1:1s, the monthly AOP status update. Before this, every one of them was retyped by hand each cycle, which is how the same task ends up on the list three times in slightly different words.

One tag and one card:

```
- [ ] **Prepare for 1:1 with Anu** [impact:: med] [effort:: S] [due:: 2026-09-02] [ai:: partial] `repeat:wed-9:15`
```

- `repeat:wed` — every Wednesday. A three-letter day.
- `repeat:wed-9:15` — every Wednesday at 9:15. The time is for meetings and is optional.
- `repeat:15` — the 15th of every month. A month too short for the day lands on its last day rather than skipping.
- `repeat:wd5` — the fifth working day of every month. For an obligation dated by working days rather than by the calendar, which the AOP status update is. Working means Monday to Friday; the tag knows nothing about bank holidays, and the checker's working-day check catches one landing on a holiday separately.
- `repeat:tue2` — the 2nd Tuesday of every month. For a meeting that is monthly but pinned to a weekday rather than a day of the month, the way Game & Animation Production runs. Takes a time the same way the weekly form does: `repeat:tue2-15:00`. A month with no 5th occurrence of the day clamps to its last one, the same rule the working-day form uses.
- `repeat:~fri-15:00` — the `~` prefix works on any of the forms above and says the cadence is the usual shape rather than a rule. Use it where the meeting is real but gets rebooked: the design system drop-in is weekly and has run Friday, Thursday, Friday, Thursday. The board still rolls to the tagged day, and the checker stops flagging a date that lands off it.

`[due:: ]` is the occurrence the card is currently pointing at. So the tag says how often and the date says which one, and neither is derivable from the other.

**The board owns that date.** On load, once the date on the card has passed, it moves the date to the next occurrence, unticks the card, and files whatever agenda was on it as a `Previous agenda (that date):` note. Which means:

- **Never hand-edit `[due:: ]` on a recurring task** to advance it a cycle. The board has done it, or is about to, and two writers on one date is how it ends up a week out.
- **Never delete or rewrite a `Previous agenda` note.** The board writes it and replaces it each cycle.
- **The tick means "prepared for this one", not "this happened".** It comes off when the occurrence changes, and so do the ticks on every sub-step, since a step's work belongs to one occurrence.
- **A sub-step's own `[due:: ]` or `start:` moves with the roll**, by the same number of days the parent moved, because those dates are offsets from the occurrence rather than fixed days. Write them as the real date for the current cycle and let the board carry them; do not re-date them by hand.
- The tag goes on the task, never on a sub-step. A cycle belongs to the whole task, and the checker flags it as a FIX.

**When a meeting does not happen.** The board knows the date passed; it cannot know whether the meeting did. The tick is what separates them:

- **Ticked and the date passed** — the prep was delivered, so the agenda is filed as `Previous agenda (that date):`.
- **Unticked and the date passed** — the prep never happened, so those topics were never raised. The agenda **carries forward** onto the new date instead of being archived.
- **Known in advance** — change `[due:: ]` to the new day and nothing rolls at all, since the roll only fires on a date in the past. This is the one to reach for, and the one to tell him about when he says a meeting moved.
- **Cancelled after he prepared** — the agenda is archived, because that case is indistinguishable from a delivered one. The `Previous agenda` block carries its own Copy, dated with the occurrence the card points at now, so recovering it is one click.

One card that rolls rather than a template that spawns copies. A card per occurrence would put a ticked "prepare for the 1:1" in Done every week for as long as the meeting exists, and the only question ever asked of last week's is what was on it — which is one note, not a whole card.

**Making something recurring is his call**, since it changes what ticking the task means. Do not convert one on your own judgement. The probation packs look recurring and are not: they follow a person's start date rather than the calendar.

### Meeting agendas

A recurring meeting also carries the topics to take into the next one, as an `Agenda:` block on the task:

```
- [ ] **Prepare for 1:1 with Anu** [impact:: med] [effort:: S] [due:: 2026-09-02] [ai:: partial] `repeat:wed-9:15`
  - Agenda:
    - AOP2027
      - Confirm the rescoped recommendation is agreed so the tracker update can go out, due tomorrow.
    - Personal objectives
      - Shared 26 Aug, pending validation before adding to Sage.
```

Unlike every other note in this file this one is a block rather than a quoted line, because what he pastes into the shared meeting notes is a bullet list: one bullet for the topic, one bullet nested under it for the context. Both levels are bullets, and that is the format rather than a rendering choice. The block ends at the first line not indented past the `Agenda:` line, so an ordinary note can follow it.

No date on the note. `[due:: ]` on the task is the meeting date and the board reads it from there, so a date here would be the same fact twice with two chances to disagree. Nothing has to say whether the agenda is current, either: rolling the task forward clears the block.

**What the Copy button produces** is not that markdown verbatim. It is:

```
Wednesday, 2 September 2026

Agenda
- AOP2027
  - Confirm the rescoped recommendation is agreed so the tracker update can go out, due tomorrow.
```

The meeting date in full on its own line, a blank line, the word `Agenda` on its own line, then the topics. The board also puts an HTML flavour on the clipboard, so a paste into Google Docs keeps both levels as real bullets instead of literal hyphens. None of that is written by hand — write the block and the format follows. It is here because it says what the topics have to survive being read as: a heading and a list in somebody else's document.

**The block is rewritten each cycle, never appended to.** It holds the agenda for the date on the card and nothing else. Whatever came out of the last meeting is a task in the buckets, which is where actions live.

The brief for what goes in it is his, not this file's. `## Context` in todo.md carries `### Recurring meeting prep scripts`, one line per meeting in his own words: when it happens, what it is usually about, and what to check before it. Read it every session and follow it; where it disagrees with anything below, his copy wins.

Rules for the writing:

- **Both levels are bullets.** One bullet for the topic, one nested under it for the context. Not a title with a paragraph.
- **A few words as the title.** `AOP2027`, `Personal objectives`. It is a heading in a shared document, not a sentence.
- **One context bullet, two at most.** What has moved, what is being asked for, by when.
- **Written neutrally, because they read the same notes.** No pronouns for the other person, no "she needs to", no "chase her on this". Write it as the shared record the notes become.
- **Nothing that is not theirs.** The agenda is not a status report on his week. Work he is getting on with, that needs nothing from them, stays off it.
- **Three to five topics.** A 1:1 is thirty minutes. Six means the last two read as covered without having been discussed, and the checker flags it.
- **Something that has not moved since the last meeting is not a topic**, and `Previous agenda` is how you can tell.
- **Leave `[fill in]` rather than inventing a detail**, the same rule as prompts and Jira summaries.

## Jira tickets

Work that leaves the list as a ticket on somebody's board carries a `Jira` note, in the same shape as a prompt. The board turns it into a **Raise in DSYS** button that opens Jira's create form with the summary already filled in, and raises nothing until he presses Create there.

```
- [ ] **Raise the button variant gap on the contributions board** [impact:: med] [effort:: S] [ai:: none]
  - Jira (DSYS): "Button: three variants in Figma with no Storybook equivalent"
```

The body goes on the line under it, and the button carries that too:

```
  - [ ] Create the docs contribution on error patterns
    - Jira (DSYS): "Documentation contribution: error patterns"
    - Description: "Document the error patterns in the design system: inline field errors, ..."
```

Write `Description:`. The first of these were written as `Description to paste:`, from when the board only carried the summary and the body really did have to be pasted by hand; that phrasing still parses so nothing has to be converted on sight, but it is no longer true and should not be written again.

A ticket with no description is a ticket somebody has to come back and ask about, so write one unless the summary genuinely says everything. End it with what done looks like — that is the part the board's readers cannot infer.

The brackets name the board. Two are configured: **DSYS** for DS Contributions, the designers' board, and **WADE** for Web Analytics Design Experiments. Leave the brackets off — `- Jira: "..."` — and the board offers every configured board, which is the honest answer when it is not yet decided where the ticket belongs. Do not guess a board to avoid the plain form.

Write one whenever a task or a step means raising a ticket: contributing a component, reporting a gap found in an audit, asking another team for work, recording a decision that needs a ticket to be actioned. The test is the same as the one for a suggested message — the thing that stalls it is writing the summary, not raising it.

**Never raise the ticket, only write the note.** The whole point of the button is that he presses Create with his own eyes on the form. A ticket appearing on a shared board without him having seen it is worse than a ticket not raised: he cannot tell what he is answering for, and the team cannot tell whether a human meant it.

Rules for the summary:

- **One line each, no quotes inside them.** Both go in the URL. Keep the two together under a thousand characters or so; they are a starting point on the form, not the finished ticket.
- **Write it for the board's readers, not for the list.** The people reading it have not seen his to-do list, so `Button: three variants in Figma with no Storybook equivalent` beats `Fix the button thing we discussed`.
- **Lead with the component or the area** where the board is organised that way, as DS Contributions is.
- **Leave `[fill in]` rather than inventing a detail.** The same rule as prompts: a summary that reads as complete and is wrong is worse than one with a visible gap.
- **Rewrite it when the task changes**, and delete it when the ticket has actually been raised. A note left behind reads as a ticket still to raise, and he raises it twice.

## The five views

He works from five views: This week, Quick wins, Big rocks, Dependency chain and Delegate to Claude. Until 10 Aug 2026 they were sections at the top of the file, copied out of the buckets by hand every session. They were removed that day and are now worked out by the board, live, from the tags below.

| View | Built from |
| --- | --- |
| This week | `week` |
| Quick wins | `[effort:: S]` grouped by `[ai:: ]`, plus any live step carrying a suggested message, plus every `repeat:` task with an agenda written on it, nearest first. Anything waiting on an unfinished blocker, or whose `start:` has not arrived, is left out. |
| Big rocks | `[impact:: high]` and `[effort:: L]` |
| Dependency chain | `blocked-by:`, resolved against `#slug` |
| Delegate to Claude | `[ai:: full]`, ordered by `rank:` |

Above the board sits the headline, from `headline:`. It is one task, not a view of many.

### The same three views in Obsidian

Added 12 Aug 2026. Quick wins, Big rocks and Delegate to Claude also exist as Dataview queries in `data/views.md`, for reading the list in Obsidian instead of on the board. That file is generated by the Dataview Serializer plugin and is never edited by hand, so it is not a copy in the sense the removed sections were: it is rebuilt from the same tags every time the file is touched, and it cannot say something the tags do not.

It is a second reader of the tags, not a second place to maintain them. Three things it does worse than the board, listed in that file itself and worth knowing before trusting it: Delegate is in file order rather than `rank:` order, Quick wins does not hide what is blocked or not yet startable, and a sub-step needs its own `[ai:: ]` because Dataview does not inherit the parent's. All three are because `rank:`, `start:` and `blocked-by:` are still code spans.

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

The file is the title, the `Last updated` line, the `Meeting actions last pulled` line, the **How this works** legend, **Where the other views went**, then the buckets in the order the file has them, currently People, Design oversight, Design System, Strategic. Sections are separated by `---` on its own line.

## Ordering

Anything with `due:` or `urgent` jumps the queue regardless of impact and effort. Everything else: high impact first, and within the same impact, lower effort first. A `high`/`S` task above a `high`/`M` task is correct and worth preserving when editing.

## Dates

**Working days only.** Weekend deadlines get pulled back to the previous Friday. The exception is a step that waits on someone else replying, which pushes to the following Monday instead, because a Friday deadline on someone else's reply is really a Monday deadline.

**UK bank holidays count as non-working days.** The team is UK-based. The checker script knows England and Wales dates for 2026 and 2027.

**Back-plan from the formal deadline.** A probation formally due Sunday 23 August closes Friday 21 August in this file, and every sub-step is dated backwards from there. Never leave the formal date as the working date.

**Sign-off costs a day.** Where a document goes to someone for approval before submission, the draft and the share are separate dated steps, and the submission is the day after. A skip-level manager signs off probation rationale docs.

**Reminder steps are five days after the request**, moved to the next working day if that lands on a weekend. The note should say so, otherwise the arithmetic looks wrong to anyone reading it later.

**`Meeting actions last pulled` is a machine stamp, not a date he keeps.** It is a full UTC timestamp, `2026-09-01T09:33:21Z`, and it does two jobs. It tells this skill whether today's pull has happened, so the first check-in of any day runs `pa-retrieve-tasks` and later ones do not. And it is the watermark that skill filters on: anything the recorder created before it has already been put in front of him and is never shown again, whether he kept it or turned it down.

It became a timestamp on 1 Sep 2026, having been a plain date. A date was enough for the once-a-day trigger and is not enough for the watermark, which has to cut a window mid-morning without swallowing the rest of the day.

It is set only by a run that actually happened, only by `pa-retrieve-tasks` and only after the tasks are written, it is never edited by hand, and `never` is a valid value meaning no pull has happened yet. Do not read it as when the file was last touched, which is what `Last updated` is for.

## This week

The honest filter on top of Doing: Doing is what is live, `week` is what actually fits.

**The capacity ceiling is two M-effort items per week**, once meetings are counted. Everything else should be S. If more than two M items are competing, say so and ask which one loses the tag rather than tagging three and pretending. The checker counts them; it will not decide.

**A `week` tag with a date outside the week is wrong.** Drop the tag or bring the date in.

**Untag as deliberately as you tag.** A `week` left on something that slipped turns the view into a record of intentions. This is the edit nobody makes, so make it explicitly at the end of a session.

**A `week` tag has exactly two ways to expire, and both are automatic, not judgement calls:**

- **Ticked clears it.** The moment a step or task is ticked off, remove `week` in the same edit. A finished item has nothing left to plan for, and leaving the tag on turns This week into a log of what already happened rather than what is coming.
- **A passed `due:` on an open item clears it too.** If the date has slipped and the work is still open, it is now Overdue, which is a stronger and different claim on attention than "fits this week." Leave it to Overdue rather than letting it sit in both.

Added 20 Aug 2026, after a session where roughly twenty ticked sub-steps from the week of 11–14 Aug were still carrying `week`, because ticking a step and untagging it had drifted into two separate edits and the second one kept not happening. The checker now flags both cases under "This week" (see `check_todo.py`), so a session that runs the checker before delivering will not hand back a file with either kind of stale tag in it. Fix what it flags rather than leaving it for next time.

**Name which dates in the week cannot move**, as a note on the task itself. That reasoning used to sit in the section and had nowhere to go when it was removed.


## Checkboxes

Tick sub-steps, not parents. A parent closes only when all its sub-steps are ticked. Add a short inline note on a completed step when the outcome matters later, for example "received and added to the spreadsheet", because that detail is what makes the next step possible.

## Named people

**This moved into the file on 10 Aug 2026.** Who is who, who is away, whose contract runs out when, and the spellings that matter are all in the `## Context` section at the bottom of todo.md. Read it every session alongside the buckets.

It was here until then, which meant he could not see it, could not correct it, and the board could not use it. It is standing information about his working life, not a rule about how the file is formatted, so it belongs with his data rather than in this skill.

Do not copy it back into this file. One copy, in todo.md, for the same reason the five views were removed from the file.

Keep it current as a matter of course: a leave date that has passed, or a contract that has been extended, is exactly the kind of stale fact that produces a confidently wrong plan.
