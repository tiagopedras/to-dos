---
name: pa-mobile
description: The phone surface over the master to-do list, at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl"), reached over Remote Control from the Claude mobile app. Same list and same file as at the desk, so it reads and writes for real, and it can run anything the other pa-* skills run. Two things make it different: every question is asked as multiple choice rather than as something to type, and every report is rendered from this skill's own templates rather than the desk ones. Use whenever he is on his phone and asks what is going on, what his main thing is, what is due, what moved today, what the week looks like, or for the agenda for a standing meeting, and whenever he says he is on mobile, on the move, between meetings, walking or away from his desk. Also use when he wants to tick something off or move a date without typing it out. Do not use it at the desk, where pa-checkin is the fuller session, and do not use it for a restructure, a bucket sweep or an optimisation pass, all of which need a screen.
---

# Running the list from a phone

**Read `~/Code/to-dos/agents/pa_agent/PA.md` first, then `~/Code/to-dos/CONVENTIONS.md`.** The first holds who he is, where the list lives, how he prioritises, the standing rules and the tone. The second holds the file format. Neither is repeated below.

Nothing about the list changes here. Same file, same four buckets, same tags,
same checker. He reaches this session over Remote Control from the Claude app,
so the file under the session is the real one and a write from the phone is a
real write.

What changes is the surface. A phone gives about ten lines of readable screen
and a keyboard nobody wants to use standing in a corridor. So two rules hold for
the whole session, and everything below follows from them:

1. **Ask in options.** Every question goes through `AskUserQuestion` with real
   choices on it. He should be able to run a whole session with a thumb.
2. **Report from this skill's templates.** `templates/` here holds the phone
   version of every report, and it wins over the desk version of the same name.
   Writing a report freehand is the failure this skill exists to prevent, because
   a status that comes out in a different shape every morning has to be read
   rather than scanned.

## This is a surface, not a separate list

The other `pa-*` skills still do the work. This one changes how they ask and how
they report.

- **The check-in** is `pa-checkin`. Follow its moves, with the two rules above
  applied and the exceptions below.
- **The writing** is `pa`, the same as at the desk. Invoke it with what he chose
  and let it apply the changes, run the checker and stamp `Last updated`. Never
  edit `todo.md` yourself: one writer is the rule the board's autosave survives,
  and a phone racing a desk save is the worst case for breaking it.
- **The backlog sweeps** are `pa-checkout` and `pa-focus`, and neither belongs on
  a phone. See what waits for the desk.

Invoke them with the Skill tool and carry on in this session. Do not spawn a
subagent for any of it, since a subagent cannot ask him anything and asking is
the whole of the session.

## Asking in options

Never ask him to type what a list of choices could carry.

- **A date.** Offer the real candidates: today, tomorrow, the named weekday,
  next Monday, plus any date already on the task. Not a text box.
- **A score.** Impact is three values and effort is three values. Always a
  choice, and suggest the one you would set with the comparison in its
  description, the same as at the desk.
- **Which task.** Name them. Never ask him to describe one back to you.
- **A state or a bucket.** Always a choice.
- **Yes or no.** Write the two outcomes out as what will happen, so the labels
  are "Tick it and close the branch" and "Leave it open", not "Yes" and "No".

**Batch up to four independent questions into one call.** Each round trip costs
him more on a phone than at a desk, and four taps in one screen is one
interaction rather than four. Questions that depend on each other still go one
at a time, and when an answer makes a later question pointless, drop it instead
of asking anyway.

Free text is for one thing: a note in his own words, where the words are the
point. Ask for it last, after everything a choice could settle is settled, and
say that skipping it is fine.

## Reporting from a template

`templates/` here holds one file per kind of report. Read the whole folder at the
start of the session, because he adds and edits these and the folder is the
current set, not the list in this file.

**Pick by what he asked for**, using the `use:` line in each template's
frontmatter. When two fit, pick the shorter one.

**When there is no phone template for what he asked for**, say so in one line and
ask which of the ones here he wants. Never fall back to the desk template of the
same name: those are written for a screen he does not have, and rendering one is
how a two-line answer becomes three screens. Put "a phone template for this" on
the list of things to write later.

**Render it, do not type it.** `core/render.py`'s `render(template_path,
context)` carries out the placeholder rules, the empty-line rule and the
`lines:` ceiling — the template owns the order, the headings and the
wording, and this is what actually applies them rather than something to
reason through by hand:

```bash
python3 -c "
import sys
sys.path.insert(0, 'core')
import todo, aggregate, render
tasks = todo.parse_doc(open('data/<dataset>/todo.md', encoding='utf-8').read())
ctx = aggregate.today_view(tasks)
print(render.render('agents/pa_agent/skills/pa-mobile/templates/<name>.md', ctx))
"
```

run from `~/Code/to-dos`, with `<dataset>` and `<name>` filled in — `meeting-prep`
uses `aggregate.meeting_view(tasks, title, today)` instead, and `change-report`
builds its own `changes`/`needs_you`/`pending_count` and skips `aggregate`
entirely, the same as the desk copy of it in `pa/SKILL.md`.

**Placeholders and blocks** are described in
`~/Code/to-dos/agents/pa_agent/skills/pa/references/templates.md`, which also
lists every field available to fill them. Read it before rendering the first
time in a session.

## The session shape

### 1. Read

Read `data/.current`, then that dataset's `todo.md`, including `## Context`.
Then run the checker:

```bash
python3 ~/Code/to-dos/agents/pa_agent/skills/pa/scripts/check_todo.py ~/Code/to-dos/data/<dataset>/todo.md
```

Hold what it says. Do not report a flag that was already there when you arrived,
because a phone screen spent on a pre-existing CHECK is a screen he does not get
the status on. Flags matter here only when your own edit caused one.

**Do not pull meeting actions.** `pa-retrieve-tasks` reviews what it finds one
item at a time and that is a desk-length conversation. If the watermark is not
from today, put one line at the end of the report saying so, and leave it. That
is the one move of `pa-checkin` this skill skips rather than shortens.

### 2. Render

Pick the template, render it (see "Reporting from a template" above), send it.
That is the whole reply. No preamble in front of it and no summary after it,
since the rendered report already is the summary.

### 3. Offer the moves

Straight after the report, in the same turn, offer what he can do about it as
choices. Two to four options, drawn from what the report actually showed:
tick the headline's next step, move a date, change a state, write the agenda for
the meeting that is coming, nothing for now.

"Nothing for now" is always one of the options. Most mornings he wanted the
report and that is all, and a session that will not let him stop is worse than
one that does too little.

### 4. Hand it to pa

Invoke `pa` with what he chose. It applies the changes, runs the checker, stamps
`Last updated` and closes with the Reload line. Then say that closing line
yourself if it did not: **Reload the board.** See below for why it is not
optional.

**Write after each answer rather than batching several to the end.** A batch lost
to a dropped phone session is worse than four small writes, and this is the one
place where the desk habit of collecting everything first is wrong.

## The board on his desk, while he is not at it

The board holds his edits in the browser and writes the whole file when it
saves. So a board left open at his desk, or on a second device, will overwrite
anything written from the phone the moment it next saves, and its autosave fires
within seconds of anything marking the document dirty. Nothing warns either
side.

That makes the closing line load-bearing rather than a courtesy. Say it every
time there was a write, in full: reload the board before touching it again.

When he says mid-session that the board is open somewhere with unsaved work,
**stop writing.** Finish the session as a read, tell him what you would have
changed, and let him run it at the desk once he has saved. A phone write racing a
desk save is how the list loses a morning.

## What waits for the desk

Say so in one line and move on. Do not start any of these on a phone:

- A bucket-by-bucket sweep, or any full review.
- The optimisation pass. It needs the whole file in view and it ends in a
  conversation, which is two things a phone is bad at.
- A restructure, a new bucket, moving work between buckets in bulk.
- Anything that means reading a project folder.
- The meeting-action pull, for the reason in move 1.
- Picking a new headline. Report that the old one is solved or blocked, and let
  him make the pick at the desk. A headline chosen between meetings is the kind
  that changes again tomorrow.

Ticking things off, moving a date, changing a state, adding a task, writing an
agenda: all fine on a phone, and all of them are why he opened it.

## Judgement calls that come up

**He adds a task by voice, so it arrives as a sentence.** Turn it into a title
and offer the bucket, the state and both scores as choices in one call. Do not
write it in unscored and stay quiet, and do not make him type the title again.

**He says something is done but not which step.** Show the unticked steps as
choices. Never guess which one he meant, since ticking the wrong step in a
probation pack is invisible until the deadline.

**The report would run past the template's `lines:`.** Cut from the bottom,
keep the headline and anything overdue, and end with the `+N more` count. Do not
reflow the template to make room.

**He asks for something no template covers.** One short answer in plain prose is
better than forcing it into the wrong template. Say that it was freehand, and
note that a template for it is worth writing.

**He asks for a full check-in on the phone.** Run `pa-checkin`'s moves, skipping
the pull and rendering the phone `morning-brief`. Say in one line that the pull
is waiting for the desk if the watermark is stale.

**The connection drops mid-session.** Covered in move 4: write after each answer.

## Tone

See `~/Code/to-dos/agents/pa_agent/PA.md`, and then cut it further. Everything
here is read on a phone, usually while he is walking. Short lines, no tables, no
headers he did not ask for, and no sentence that exists to introduce the next
one.
