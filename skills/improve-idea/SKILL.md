---
name: improve-idea
description: Turn a rough idea, bug or annoyance about the to-dos board itself into a properly written entry in IMPROVEMENTS.md — grounded in the real code (file and line references), classified as Small or Big by the file's own definition, and added to the top of the right section. Use whenever he shares a thought about something wrong or missing in the board without expecting it built right now — "add this to improvements", "log this as an idea", "note this down for later", "improvement idea:", or just describing something annoying about the app in passing. Do not use this to actually build or fix the thing (that's just doing the work) and do not use it for anything about data/todo.md, which is a different file with its own skills (pa writes it, pa-checkin reads it back) — this only ever touches IMPROVEMENTS.md.
---

# Logging an improvement idea

Turns a sentence or two into an entry in `IMPROVEMENTS.md`, in the voice the file
already uses — a bold one-sentence claim, then the prose that grounds it in the
actual code. Not a conversation: read the idea, place it, confirm in one line.

**The only file this skill ever writes is `IMPROVEMENTS.md`.** Reading other
files to ground the entry (grepping the code for the real function/file names)
is the whole point of step 3 below, and is fine — but no edit tool touches
anything except `IMPROVEMENTS.md`, ever, no matter what the idea is about.
Not `todo.md`, not the code the idea describes, not a scratch note, nothing.
If acting on the idea for real is tempting, that is a different, later
conversation — this skill's job ends at the written entry.

## Steps

1. **Read `IMPROVEMENTS.md`** (repo root of `to-dos/`). Note its own split:

   > Small — a sitting change, no new data model or view — and Big — needs a
   > decision, a new tag, or a new piece of the board before it can be built.

   Read both sections in full, not just the first few items — the idea he just
   gave you might already be sitting in there, done or not.

2. **Check for a duplicate first.** If something close to this idea is already
   in the file — done (struck through with `~~`) or still open — say so instead
   of adding a second copy. Point at the existing entry rather than repeating it.
   If it's already marked done, tell him plainly; he may be describing a
   regression, which is a different thing worth its own entry.

3. **Ground it in the real code.** Grep and read before writing a single word —
   every existing entry names actual functions and files
   (`timelineScale()` in `kanban/js/18-timeline.js`, not "the timeline code").
   If you can't find where the idea would live, say that rather than inventing
   a plausible-looking reference — a wrong file/line is worse than none.

4. **Classify Small or Big** against the file's own definition above, not a
   guess. If it's genuinely on the line, pick the one that makes the entry
   easier to act on later and say which you picked and why in your one-line
   confirmation.

5. **Write the entry** matching the existing style exactly:
   - One bold sentence, the claim itself, as if it were a finding — `**The
     timeline draws weekends as real space...**`, not "It would be nice if...".
   - Followed by 2-5 sentences of prose naming the real functions/files
     involved and what changing them would take, in the same dry, specific
     register as the entries already there. No "as a user" framing, no
     enthusiasm, no bullet sub-lists — a paragraph, like every other entry.
   - No `Why:`/`How to apply:` structure — that convention belongs to memory
     files elsewhere, not this one.

6. **Insert it at the top of the right section**, directly under `## Small` or
   `## Big`, above whatever is currently first there. Newest first is the
   established order — do not alphabetise or re-sort the rest of the section,
   and do not touch the other section at all.

7. **Confirm in one line**: which section it went into and the bold sentence
   you wrote, nothing else. Don't restate the idea back to him or narrate the
   grep — he can read the entry itself if he wants the detail.

## What this does not do

It never writes to anything other than `IMPROVEMENTS.md`. It never opens
`data/<dataset>/todo.md` to write it — a completely different file, with its
own skills (`pa` writes it, `pa-checkin` reads it back) for a completely different kind of list — and it never
edits the code the idea is about, even a trivial one-line fix, even if he asks
in the same breath; that is a separate request, handled the ordinary way, not
by this skill reaching past its own file. It never marks anything done,
reorders existing entries, or removes the strikethrough from a resolved item —
that only happens when the fix actually lands, by hand, the same way every
existing `~~**...**~~` entry in the file was closed.
