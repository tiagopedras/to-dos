# Manual audit checklist

`scripts/check_todo.py` covers dates, tag consistency, whether every `blocked-by:` resolves to a real `#slug`, whether every `ai:full` carries a prompt, whether ranks are unique, whether the four queried tags are written in the form Dataview can read, and whether This week and the `week` tags agree in both directions. What it cannot judge is meaning. Work through this list after a large restructure, or when you have added several tasks with dependencies.

The script's output is the starting point, not the whole audit. A file can pass the script and still be wrong.

## Dependency logic

**A blocker cannot sit in a later state than the thing it blocks.** If task A blocks task B, A must be in the same state as B or an earlier one. Doing blocking To do is fine. To do blocking Doing is impossible and means either the states or the dependency is wrong. The script resolves the slugs; it has no idea whether the states make sense.

**A `blocked-by:` has to be a real dependency, not a reason for not starting.** The script proves the slug points at something. It cannot tell you the link is honest. If the blocked task could actually start today on a different part, it is a partial dependency, not a block.

**Partial dependencies need saying so.** The AI prototyping test is blocked by the design.md for one of its two setups only, so the other setup can start immediately. Writing it as fully blocked would park work that could run today. When a dependency is partial, say which part.

## Chronology

**Sub-step dates must be ascending and all on or before the parent's due date.** The script checks this, but read them anyway when a parent's date changes, since the script only knows the dates are ordered, not whether the ordering still makes sense.

**Notes that claim a timing relationship must match the dates.** A note saying two workstreams overlap, next to dates that do not overlap, is a contradiction that will mislead a future session. Either fix the date or delete the claim.

## Realism

**Count the M-effort items in This week.** More than two is over-commitment, and an over-committed week is the fastest way for the file to lose credibility.

**Check that recurring tasks are marked as recurring.** CV reviews and the estimating check-in are ongoing, not one-off. An ongoing task that gets ticked disappears, and then nobody notices it stopped happening.

**Check "done" definitions on anything ambiguous.** The contribution model is done when published and discoverable from the library, not when written. The token branch is done when merged, not when pushed for review. Where the obvious reading of a task title is weaker than the real finish line, the note has to say so.

## Delegation tags

**A task tagged `ai:full` should genuinely need no judgement from him.** If reviewing the output requires him to make the same decision the work required, it is `ai:partial`. Over-tagging `ai:full` is worse than under-tagging, because it sets up a hand-over that comes back.

**Anything where Claude would judge its own output is `ai:partial` at best.** The prototyping test is the clear case: Claude can run the prototypes, it cannot decide whether they are good.

**Prerequisites belong in the note.** A delegable task that needs a connector, a paired bridge or a named data source is not actually delegable until that exists. Say what it needs, otherwise the hand-over stalls at the first step.

**Anything moved off `ai:full` must lose its prompt and its `rank:` in the same edit.** The script flags a rank without an `ai:full`, but a prompt left on a task he has taken back is invisible to it and reads to the next session as a standing instruction to hand the work over.

**Read the `rank:` order as a list and ask whether it is still honest.** It is meant to be ordered by time given back. The script only proves the numbers are unique, so a rank that made sense three sessions ago will sit there unchallenged.

## The week tag

**`week` is a promise, not a label.** The script checks it appears in both places. Only a read tells you whether the week is deliverable. Count the M items, and check nothing tagged sits behind a blocker that will not clear inside the week.

**Untag as well as tag.** A `week` left on something that slipped turns the view into a record of intentions rather than a plan for the next five days.

## Jira tickets

The script does not look at these at all. Every one of them is a read.

**Check the ticket has not already been raised.** A `Jira` note is a ticket still to raise. Left on a task after the ticket exists, it reads as work outstanding and gets raised twice. Ask when a task looks like it has moved on.

**Check the board key against what the task is actually about.** DSYS is DS Contributions, the designers' board. WADE is Web Analytics Design Experiments. A component gap filed on WADE reaches nobody who can act on it.

**Read the summary as somebody on that board.** They have not seen the list, the meeting or the task title. If it only makes sense next to the task it sits under, rewrite it.

**Check there is a description.** The button carries the summary and the description both. A ticket arriving with a title and an empty body is one somebody has to come back and ask about, and the asking lands on him.

**Never raise the ticket to tidy the note away.** The note is the whole deliverable here. Pressing Create is his.

## Projects

The script does not know projects exist. All of this is a read.

**Check every task on a project carries the pointer.** The panel on the board is built from the `Project:` notes and nothing else, so one task missing the note is one task missing from the only view of the whole project. The usual cause is a task added later, by a session that did not know the folder was there.

**Check the pointer names a folder that exists.** A path to a folder nobody created reads as context waiting to be opened, and the next session goes looking for it.

**Check the note still describes what is in the folder.** It names the files, and files get added and superseded. A note pointing at a brief that has since been replaced sends the next session to the wrong document, which is worse than sending it to none.

**Check the folder has not started holding tasks.** A project's `CLAUDE.md` is background. The moment it grows a list of what to do next, there are two lists, and the one nobody looks at is the one that goes stale and then gets believed.

**Check the project is still a project.** When the work is done, or has shrunk back to something a task line holds, the folder is history rather than context. Say so and ask, rather than leaving a pointer to a folder nobody opens.

## Suggested messages

The script only checks that a message exists. Whether it is usable is a read.

**Read every message aloud in his voice.** He writes plainly and does not use em dashes. If it sounds like an assistant wrote it, he will rewrite it, and then the message saved him nothing.

**Check the dates inside the message against the dates on the task.** A chase that says "by Monday" next to a step dated Wednesday is a message that gets sent and then contradicted. This is the most common way these go stale.

**Check the message matches how far the thing has actually got.** A first-ask message still sitting under a step where the ask has already gone out means the next session sends the wrong thing.

**Anything sensitive should read as a draft, not as ready to send.** Probation, performance, salary, contracts. The note should say to edit it first. Confidence in the phrasing is not a substitute for him choosing the words on those.

**A gap is better than a guess.** A `[date]` or `[name]` placeholder is fine. An invented detail that reads plausibly is not, because it will be sent without being noticed.

**Open Quick wins on the board and read the message queue top to bottom.** It sorts by date, which is not the same as being sendable in order. Nothing can tell you that the third message depends on the first having been answered, or that two of them would land in the same person's inbox an hour apart. Re-date or merge the steps when that happens, since the order comes from the dates.

**Check the statuses are still true.** A "ready" that now needs editing, or a "draft" that has since been agreed, are both worse than no status at all.

**Check the message is on the right step.** Quick wins picks up any live step carrying a message, so nothing needs promoting by hand any more. The flip side is that a message written on the wrong step silently puts the wrong thing in front of him.

## Optimisation

**Did this session actually reduce work, or only reorder it?** If nothing was cut, merged, retagged, batched, made recurring or handed over, the optimisation pass did not happen. Reordering alone is the failure mode this skill exists to avoid.

**Was every optimisation offered rather than applied silently?** Cutting or rescoping his work without agreement is how the file stops being his.
