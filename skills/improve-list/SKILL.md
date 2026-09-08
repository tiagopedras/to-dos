---
name: improve-list
description: Show the current IMPROVEMENTS.md backlog as a numbered list, grouped into Small and Big the way the file itself is, one line per open item, done ones left out. Use whenever he asks to see the improvements list, what's on the board's backlog, what ideas are queued up, "show me the improvements", "what's on improve-list", or wants a scan of open items before picking one to work on. Do not use this to work through data/todo.md, a completely different list with its own pa-* skills, and do not use it to add a new idea, which is improve-idea.
---

# Listing the improvements backlog

Reads `IMPROVEMENTS.md` (repo root of `to-dos/`) and renders it as two short,
numbered lists — a scan, not the full detail.

**Read-only until he says otherwise.** Running this skill never writes
anything, on its own, no matter what the list shows. Show the numbered list
first, every time, and stop there. Only touch the file afterwards if he
explicitly asks for a change to something already on the list he just saw —
"mark 3 done", "drop that one", "reword 7" — and even then, edit only the one
entry named, nothing else on the page. A request to add a brand-new idea is
not this skill's job at all; that's `improve-idea`, run separately.

## Steps

1. **Read the whole file.** Each of the two sections, `## Small` and `## Big`,
   is a flat list of top-level `- ` bullets. An entry that starts `~~**` is
   already done — skip it from the numbered list, but keep a count.

2. **For each remaining bullet, take its bold lead sentence** — the text
   between the first pair of `**`s — as the one-line summary. That sentence is
   written as the claim itself and reads fine on its own; don't add a verb or
   reframe it. (In the rare case a bullet has no bold lead, fall back to its
   first ~15 words instead of skipping it.)

3. **Flag anything that needs him before it can move.** Two separate reasons
   earn the tag `[needs you]` at the very start of the line, before the number
   even has meaning to read:

   - **The entry's own prose asks for a decision, a preference, or his
     agreement** before anything can be built — "needs him to say what...",
     "needs a decision", "agreed with him before anything is built", or
     similar. This is what the file's own "Big" definition half-promises
     already; tag it so it doesn't take a full re-read to notice.
   - **The done/not-done status itself is ambiguous** — the bullet reads as
     resolved in its own prose (past-tense "Restructured", "Built",
     "Superseded", "Decided ... leave it", a date-stamped completion) but was
     never wrapped in the file's own `~~done~~` convention. Don't silently
     decide for him which it is — surface it and let him say whether it
     should be struck through or is still genuinely open.

   An entry can carry the tag for either reason or both; one tag either way,
   not two.

4. **Render two numbered lists**, each restarting at 1, in the file's own
   order — Small first, then Big, newest-added entry first within each since
   that is the order the file already keeps:

   ```
   Small
   1. <bold sentence>
   2. [needs you] <bold sentence>
   ...

   Big
   1. <bold sentence>
   ...
   ```

5. **One closing line**: how many done entries were left out of each section
   (e.g. "6 done in Small, 19 in Big, not shown"). Don't list the done ones
   unless he asks for them by name.

6. **If he asks for one by number**, read that entry back in full — the whole
   paragraph, not just the bold sentence — rather than summarising it further.
   Still no write: reading the full entry back is not a change to it.

## Updating an entry — only once he asks, after seeing the list

The list above is the whole of this skill's normal job. If, after seeing it,
he asks to change one — mark it done, drop it, reword it, move it to the other
section — that's the one and only case this skill edits `IMPROVEMENTS.md`:

- Change only the entry he named, by its number from the list you just showed.
  Never touch any other bullet while you're in the file.
- Marking something done follows the file's own convention: wrap the bold
  lead sentence in `~~...~~` and add `**Done, <date>.**` (or the exact wording
  he gives you) right after it, same as every other resolved entry — don't
  invent a different marker.
- Confirm the specific change in one line once it's made. Don't re-render the
  whole numbered list again unless he asks to see it fresh.

Anything short of that explicit follow-up — including him just reacting to an
item in conversation ("oh that one's annoying") — is not a request to edit the
file. When in doubt about whether he actually asked for a change, ask, rather
than writing.

## What this does not do

It doesn't touch `data/<dataset>/todo.md`, doesn't re-sort or renumber
anything in the file itself (the numbers shown are for this conversation
only, never written back), and never adds a new idea — that's `improve-idea`.
Outside the one explicit follow-up case above, it makes no edits at all.
