---
name: pa-attach
description: File the conversation you are having right now against a task on the owner's master to-do list, at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl"). Takes no arguments — it reads its own session id from the environment, shows the task list, and once he names one, writes the request to data/<dataset>/attach-queue.json for the board to file next time it loads. It never touches todo.md itself. Use whenever he says a conversation belongs to a task, asks to attach, file or link this chat to a task, says "this is actually about X", "put this on my list", "attach this session", "file this conversation under...", or when work that started in the terminal turns out to be about a specific piece of work on the list. Do not use this to start a new conversation from a task — that already happens from the board's own Chats field, in the drawer or on the canvas — and do not use it to review or edit the list itself, which is pa-checkin.
---

# Attaching this conversation to a task

Files the conversation you are running inside, right now, against a task on the list — the case AI-CANVAS.md in this repo calls "a session that started in the terminal": half an hour into some other piece of work it turns out this conversation *is* the work, and it should end up filed the way one started from the board would be.

**Read `~/Code/to-dos/PA.md` first.** It holds where the list lives and how `data/<dataset>` is resolved. This skill does not repeat that.

## Why this cannot just edit todo.md

The board holds the whole document in memory and autosaves it — see `README.md`'s rules for testing the board, and the write-up in `AI-CANVAS.md` under "It must not write todo.md". A skill editing the file underneath an open tab is overwritten within seconds, silently. So this skill never opens todo.md to write it, only to read it, and the actual filing happens through `data/<dataset>/attach-queue.json`, which the board drains through its own edit path the next time it loads. That is also what makes this work with no board open at all: queue it now, the filing happens whenever the board is next opened, whether that is thirty seconds from now or tomorrow morning.

## The one thing this needs that nothing else does

**Its own session id.** Claude Code sets `CLAUDE_CODE_SESSION_ID` in the environment of every session, so this skill does not have to ask which conversation it is — it already knows, the moment it runs.

```bash
echo "$CLAUDE_CODE_SESSION_ID"
```

If that comes back empty, say so plainly and stop — this only works run from inside a real Claude Code session, not pasted into a plan or run some other way.

## The steps

1. **Read `CLAUDE_CODE_SESSION_ID`**, as above. Note the current working directory too (`pwd`) — the board needs both to find this transcript again.

2. **Read the task list** at `~/Code/to-dos/data/<dataset>/todo.md` (`<dataset>` from `data/.current`) and show its top-level, undone tasks grouped by bucket, as a compact list — title only, no tags or scores, this is a picker rather than a status read. Leave done tasks out; there is nothing to attach a live conversation to on something already finished.

   **Do not use AskUserQuestion for this.** The list can run to hundreds of tasks, and that tool holds at most four options — ask in plain text instead, and let him answer with a number, a title, or a search term.

3. **He names one.** Match it against the task titles case-insensitively, allowing a partial match. If more than one task matches, list the matches and ask him to narrow it. If none match, say so and ask again rather than guessing the closest one — a session filed against the wrong task is worse than one not filed yet.

4. **Write the queue entry:**

   ```bash
   python3 ~/Code/to-dos/skills/pa-attach/scripts/attach_session.py \
     ~/Code/to-dos/data/<dataset>/attach-queue.json \
     --title "<the task's exact title, copied from the file>" \
     --cwd "$(pwd)"
   ```

   Use the title exactly as it stands in the file — that is the only thing the board has to find the task by again, since a session's place in the queue survives no rename. If the script exits 1, read its stderr and say what went wrong rather than pressing on.

5. **Confirm in one line** — which task, and that it takes effect next time the board loads (or immediately, if it happens to be open, since a page already sitting on `#board!task=...` picks up a live reload the next time anything triggers `loadFile()`, but do not promise that — say "next time the board loads" and let it be a pleasant surprise if it is already open). Do not narrate the write itself, the queue file, or any of the mechanism above — that is for this file, not for him.

## What this does not do

It does not start a conversation, rename one, or open the board. It does not touch todo.md, sessions.json, or anything else directly — see the routes and the queue reader in `AI-CANVAS.md` for exactly what the board does with the request once it is queued, if that ever needs debugging.

It does not offer to attach to a task that does not exist yet. If the work genuinely has no task, that is a `pa-checkin` job — add the task first, then run this again.

## Tone

One exchange: show the list, take the answer, confirm. Not a check-in, not a review — see `~/Code/to-dos/PA.md` for the tone that applies everywhere else on this list, and keep this shorter than that.
