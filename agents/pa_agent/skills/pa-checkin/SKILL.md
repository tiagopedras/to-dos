---
name: pa-checkin
description: Run the daily check-in over the owner's master to-do list, at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl"). It pulls anything new his meeting recorder captured, reads the list, gives him the brief for the day and the week rendered from a template he edits, asks what has moved, and hands the writing to the pa skill. Use it whenever he asks for a check-in or a status read on the list, including phrasings like "let's do a check-in", "morning check-in", "let's do a todo meeting", "brief me", "what's on my plate", "what's due this week", "what am I doing today", "where am I", "what did I miss", or "let's go through my buckets". Do not use it for a change he has already decided on, which is the pa skill on its own, for the backlog sweeps, which are pa-checkout and pa-focus, or from a phone, which is pa-mobile.
---

# The daily check-in

The morning session over the list: what came in overnight, what today and this week look like, what has moved, and whether the one thing still holds.

**Read `~/Code/to-dos/agents/pa_agent/PA.md` first, every session, then `~/Code/to-dos/CONVENTIONS.md`.** The first holds who he is, where the list lives, how he prioritises, the standing rules and the tone. The second holds the file format. Everything below assumes both have been read, and does not repeat them.

**This skill does not write `todo.md`.** It reads, it reports, it asks, and it hands what he agreed to `pa`. That skill owns the tag syntax, the scores, the agendas, the checker and the Reload line, in one copy, so there is one place a convention can be wrong. Invoke it with the Skill tool at the end of the session and let it finish before you close.

## What a check-in is for

The value is in the three things he cannot easily do himself: the pull, the brief, and the headline check. The middle of the session, applying what he tells you, is the cheap part.

On a quiet morning where nothing has changed, moves 1, 2 and 3 are the whole session: nothing came in, here is the day, the headline still holds. Do not manufacture work to fill the rest.

## Move 1: pull what came in

**Once a day, before you read the file.** The recorder holds actions from his calls that are not on the list yet, and a brief taken over a list that is missing them is a brief of the wrong list.

Look at the `Meeting actions last pulled` line in the header of todo.md. If that timestamp is not from today, invoke `pa-retrieve-tasks` and let it finish before carrying on. Do not pass it a window: it reads that same line and pulls from there to now, so whatever it has not shown him yet is exactly what comes back, however long the gap. That is what carries a Monday over the weekend, and a call late on Friday afternoon is exactly the one he has not seen yet.

`pa-retrieve-tasks` reviews what it finds with him one item at a time, so on a day with actions waiting this becomes the opening part of the meeting rather than a background step. That is the right order: settle what is on the list before reading the list back to him. On a day with nothing waiting it should cost one line, or nothing at all.

Run it a second time in the same day only when he asks, after a call that has just ended for example.

## Move 2: read

Read `data/.current`, then that dataset's `todo.md`, including the `## Context` section at the bottom. Context holds who is who, who is on leave and whose contract runs out when. It also holds `### How I want messages and prompts written` and `### Recurring meeting prep scripts`, both his own words, and both override anything in the reference files wherever they disagree.

Then run the checker:

```bash
python3 ~/Code/to-dos/agents/pa_agent/skills/pa/scripts/check_todo.py ~/Code/to-dos/data/<dataset>/todo.md
```

Work out everything the brief needs before rendering anything:

- The headline, its bucket, how many days it has been set, its first unticked sub-step, and whether it is solved
- Anything overdue, with how many days
- Anything due today, tomorrow and inside the working week
- Anything that has slipped since `Last updated`, inferred from that date against today
- Anything in Context whose date has passed or is close, since a leave date nobody is counting is how a plan ends up depending on somebody who is not there
- Any recurring meeting today or tomorrow, and whether its agenda is written
- What the checker flagged
- How many tasks have no impact or no effort score

**Do not ask whether the board is open.** Start straight away. The risk that question is aimed at is closed off by the Reload line `pa` gives him at the end.

## Move 3: the brief

**Render it from a template.** `templates/` holds one file per shape of brief. Read the whole folder at the start of the session, because he adds and edits these and the folder is the current set, not the list in this file.

Pick by what he asked for, using the `use:` line in each template's frontmatter. When two fit, pick the shorter one. When nothing fits, say so in one line and ask which he wants rather than inventing a shape, and note that a template for it is worth writing.

**Render it exactly.** The template owns the order, the headings and the wording. Fill the placeholders and change nothing else. The `lines:` number in the frontmatter is a hard ceiling: if what you have to say does not fit, cut the least important line rather than running over, and end with `+3 more` so he knows there was more.

The syntax, the blocks and every field available are in `~/Code/to-dos/agents/pa_agent/skills/pa/references/templates.md`. Read it before rendering for the first time in a session. Two rules matter enough to repeat: a placeholder with nothing to fill it drops its whole line rather than printing an empty one, and a template asking for a field that does not exist is a failure to report plainly, not something to quietly approximate.

Send the brief on its own. No preamble in front of it and no summary after it, since the brief already is the summary.

## Move 4: ask what has changed

Ask what has moved since the last session. Two useful shapes, pick by context:

- **Targeted**, when he has already named something: confirm just that, apply it, and offer the wider sweep afterwards.
- **Bucket by bucket**, when he says "let's review" or the file is more than a week stale: walk the buckets in the order the file has them, currently People, Design oversight, Design System, Strategic. One bucket per message, so he can answer without holding four contexts at once.

Do not ask about every task. Ask about the states that matter: what is in Doing, and anything with a date inside the next fortnight.

Straight after the brief, offering the obvious moves as choices is often faster than an open question: tick the headline's next step, move a date, write the agenda for the meeting that is coming, nothing for now. **"Nothing for now" is always one of the options.** Most mornings he wanted the brief and that is all.

## Move 5: the headline

Check it, do not re-pick it. Most mornings this is one line and one question.

**If it still holds**, say so and stop. Do not re-open the choice because something newer looks shinier.

**If it is solved or blocked**, that is a pick, and picking is `pa`'s job under tier two: count what waits on each candidate, look for what a candidate makes unnecessary, prefer something he can finish this week. Pass it over with the reason it is no longer the headline.

## Move 6: hand it to pa

Invoke `pa` with everything he agreed to in one list: the task, what changes, and anything you know that the file does not show. It applies the changes under the conventions, runs the optimisation pass on the file as it now stands, re-runs the checker, stamps `Last updated`, reports in its own short shape, and closes with the Reload line.

Do not write anything yourself first, including `Last updated` and the watermark. `pa-retrieve-tasks` owns the watermark's value and `pa` owns the writing.

**If nothing changed**, there is nothing to hand over. Say the headline holds and stop.

## Judgement calls that come up

**He only wants the meeting prep.** "Get me ready for the Morgan 1:1", "what do I need to raise on Wednesday". That is not a check-in. Go straight to `pa`, which writes agendas, and skip everything here.

**He reports progress on one task and nothing else.** Also not a check-in. That is `pa` on its own, one change and one line back.

**The recorder is unreachable.** Say so in one line, carry on with the brief, and leave the watermark alone. A pull that failed is not a pull that happened.

**The brief would run past the template's `lines:`.** Cut from the bottom, keep the headline and anything overdue, and end with the `+N more` count. Do not reflow the template to make room.

**The file has not been touched in over a week.** Say so in the brief and go bucket by bucket in move 4. A stale file usually means several dates have quietly passed rather than one.

**The checker flags something that was already there when you arrived.** Put it in the brief once, in the `checker_flags` block, and leave it. Do not open the session with it.

## Tone

See `~/Code/to-dos/agents/pa_agent/PA.md`. The brief is rendered rather than written, so the tone that matters here is everything around it: the question in move 4, the headline line in move 5. Keep both to one line each.
