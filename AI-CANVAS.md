# The AI canvas

An exploration, not a plan yet. It works out what it would take to give this
board a page of cards, one per conversation with Claude, laid out the way
`ai_canvas` lays out its sessions, and then to put copies of those same cards
inside a task's drawer next to the prompt suggestions.

All five steps below are built, as of 4 Sep 2026. Read this as the argument for
why each one is shaped the way it is; `IMPROVEMENTS.md` carries the one-line
version of what landed.

## What this page is for

Organising sessions, not starting them. That is the whole scope, and it is
worth stating first because it removes the hardest problem before it is
reached.

`ai_canvas` is a place to run several conversations at once. Its cards are live,
they stop and ask for permission, and the canvas exists to tell you which one
needs you. A canvas here answers a smaller question: **which conversations are
open, and what work does each one belong to.** Sessions get started where they
already get started, from a task, and the canvas is where they are arranged
afterwards.

That matters because a live card needs a process held open between turns, and
this repo is arranged around `todo.md` having exactly one writer. A page that
only files and arranges what already exists needs no second long-lived process
at all. It reads the session index, the transcripts Claude Code wrote, and
whether anything is currently driving them. All of that is on disk already.

## What is already shared, which is more than it looks

`ai_chat_engine` is not just the chat window. Its Node half owns starting a
session, parking it, waking it, its transcript, its permission prompts and its
login. `ai_canvas`'s own `sessionPool.ts` says so at the top: the package owns
everything about a session, and that file is *"a seam rather than a second
engine."*

So the split between the two apps today is:

| | Where it lives | Shared? |
| --- | --- | --- |
| The chat modal | `ai_chat_engine/interface/chat.js` | Yes, same file, both apps |
| Sessions: start, park, wake, transcript, auth | `ai_chat_engine/node`, `engine.py` | Yes |
| Cards: identity, placement, the box round a group | `ai_chat_engine/interface/cards.js` | Yes, as of 4 Sep 2026 |
| Filing and view state, written to a file | `ai_canvas/boardStore.ts`, this board's `canvas.json` | No, and should not be. Each host has its own file |
| The drawing | `ai_canvas/src/renderer/*.tsx` | **No.** React and Electron, 3500 lines |

The middle rows are the ones worth centralising, and they now are. The last cannot be: `ai_canvas`
draws in React inside Electron, this board is one HTML file with no build step,
and neither should change stack to match the other.

## The shape: share the brain, draw twice

The filing layer moves into `ai_chat_engine` as `interface/cards.js`, beside
`chat.js` and following exactly its rules: vanilla JavaScript, no build step,
no dependency, one global. Both hosts already consume that folder as raw
JavaScript, so nothing new has to be invented to reach it. `server.py` already
serves it, from `/ai-chat/`.

What moves is the logic and none of the storage:

- What a card is: identity, owner, title, mode, times, unread.
- How a card is filed: which owner it belongs to, and moving it between owners.
- Geometry maths: default placement, depth, the box a group takes from the
  cards inside it, and never letting a card end up outside its own group.
- The rules that turn a session's state into what a card says.

What stays with each host is where any of that is written down. The package
already does this for sessions, through the `CardStore` and `ChatStore`
interfaces a host implements, and the same pattern extends: `ai_canvas` keeps
writing `board.json`, this board writes `canvas.json`, and neither format
becomes the package's business.

`ai_canvas` then loses its copy of the filing layer and imports the shared one,
which is the half of "centralise" that actually removes code rather than adding
a second place for it to live.

## Tasks are the projects

`ai_canvas` invented projects because Claude Code has no such thing: a working
directory is not a name for a piece of work, so the app had to make one up,
store it in `board.json`, and let you file sessions into it by hand.

This board does not have to invent anything. A task is already a named piece of
work with an id that survives being renamed, reordered and moved between
buckets, and the `chat:` key on its line is already how sessions are filed
against it. So the canvas groups by task, and the grouping is the one that
already exists rather than a second one kept alongside it.

That is the actual merge of the two apps. `ai_canvas` files conversations under
names it made up. This board files them under the work.

## What a card says

Four lines, borrowed from the four `ai_canvas` argued itself into:

- **Title.** The opening prompt, truncated, editable. Already in
  `sessions.json`.
- **The task it belongs to**, by title, or *loose* when it belongs to nothing.
  This is the line `ai_canvas` spends on the folder, and it is worth more here.
- **When it last did anything.** *Finished 2h ago*, *still running*. From
  `updated`, plus liveness where the package can tell.
- **Mode.** `ask` or `work`. `ai_canvas` has no equivalent and needs none. Here
  the difference between a conversation that can only read and one that can
  write to disk is the most important thing about a card, and should be legible
  without opening it.

Unread stays: a card that has produced output since you last opened it carries
a dot. It is the one thing the app cannot work out for you.

## A box per task

The canvas draws a labelled box around each task's conversations, the way
`ai_canvas` draws a section around a project's cards. The box is the task, its
cards are the conversations filed against it, and the shape of the work is
legible without reading a word on any card.

Only tasks that have conversations get a box. `ai_canvas` draws an empty project
because you made it deliberately and the empty box says what it is for; here a
task is not made for this purpose and there are hundreds of them, so a box
appears when the first conversation is filed and goes when the last one leaves.

That makes **dropping a card into a box the attach gesture**, which is the
answer to the section above from the other end: the skill attaches from inside
the conversation, the drawer attaches from the task, and the canvas attaches by
moving a card into a box. Dragging one out again releases it back to loose.

The box maths is exactly the logic worth sharing rather than rewriting: where a
box sits, the shape it takes from the cards inside it, and never letting it be
smaller than what it contains, so a card cannot end up outside its own task.
`ai_canvas` has all of it and it goes into `cards.js` with the rest.

## Where it lives, and where the geometry goes

A sixth tab, next to Overview, Board, Matrix, Timeline and Reports. Same
header, same `viewDefs()`, same `#<view>` fragment, same `renderView()` switch,
and it follows the list dropdown like every other view, since chats are already
filed per dataset.

`#canvas!chat=<session>` opens a card the way `#board!task=<key>` opens a
drawer. A link that differs only after the `#` raises the tab that is already
open, and one list open in two tabs is two autosaves onto one file.

Card positions go in `data/<dataset>/canvas.json`, beside `sessions.json` and
`claude.json`, gitignored with everything else private. They are furniture, not
task content, and they never touch `todo.md`. The only thing that goes on a
task line is the `chat:` key that already goes there.

## The copy in the drawer

The drawer has a Chats section today and it draws rows. A row is not a card.

Once `cards.js` exists there is one card renderer, and the drawer calls it too:
the canvas lays the cards out in space, the drawer stacks the same cards in a
column where Chats sits now, above Message suggestions and Prompt suggestions.
Same markup, same dot, same click. It ends up a sibling of
`suggestionSection()` in `sideFields`, which is where it belongs, since both are
things *about* the task rather than *of* it.

It also fixes something small. **Ask Claude** on a prompt suggestion starts a
conversation and the prompt row shows no sign afterwards that it did. Drawn
next to each other, the card a prompt started is visibly the one it started.

## A prompt is used up by being run

A task can carry several prompt suggestions, and **Ask Claude** on one seeds a
conversation with it. Nothing records that afterwards, so a prompt you ran last
week looks identical to one you have never touched, and on a task with three
prompts and four conversations there is no telling which came from which.

Running a prompt uses it up, so the line goes. The board already knows how to
do this: **Dismiss** on a suggestion removes exactly that line from the task's
notes, through the ordinary edit path that marks the list dirty. Starting a
conversation from a prompt does the same thing, for the same reason. A
suggestion is a thing to act on once, and one that has been acted on is
clutter.

**When, exactly: on the first message actually sent, not on the click.** The
modal opens with the prompt in the box and unsent, because most of these still
have a `[path]` to fill in. Close it again without sending and nothing has
happened, so nothing should have been deleted. Deleting on the click would
lose a prompt to a misclick and there would be no sign it ever existed.

That is why the conversation records the prompt that seeded it: with the line
gone, the conversation is the only place the text survives. One more field in
`sessions.json`, nothing on the task line, and the card can say what it was
started to do rather than only what its first message happened to say.

The field holds the prompt text itself rather than a pointer, since the thing
it points at is deliberately removed. That also makes it exact where a pointer
would not be, and it is what lets a prompt be put back on the task if a
conversation turns out to have been started by mistake.

## Loose cards, and adopting them

The canvas needs conversations that belong to no task, or it is only a second
drawing of the drawer. `engine.py` already allows it, since an owner is any
string: a loose card gets an owner like `canvas:xxxxxx`, which sits in
`sessions.json` next to the task keys and points at no task line.

Then the gesture worth building for: **dropping a loose card onto a task
adopts it.** The task gets a `chat:` key minted the way `chatKeyFor()` mints
one today, the session moves from `canvas:xxxxxx` onto that key, and a
conversation that started as a stray thought is filed against the work it
turned out to be about. `ai_canvas` cannot make that move, because it has no
idea what the work is.

The reverse holds too. A card can be released back to loose, which is what you
want when a conversation wandered off the task it started on.

## Attaching a session that started in the terminal

A conversation does not always begin on a task. You are in a terminal working
on the snapshot, and half an hour in it turns out that conversation is the
work. It should be possible to file it against a task afterwards rather than
having had to start it in the right place.

One fact makes this cheap: **a session knows its own id.** Claude Code puts
`CLAUDE_CODE_SESSION_ID` in the environment of every session, so a skill run
from inside the conversation being attached does not have to search 544 files
on disk or ask which one you mean. It already is the one you mean.

So the skill takes no arguments and asks one question. Run `/pa-attach` inside
the conversation, it works out which session it is, shows the list of tasks,
you pick one. Nothing to type, nothing to look up.

### It must not write todo.md

Attaching needs two things written. A row into `sessions.json`, which nothing
else cares about, and a `chat:` key onto the task line when that task has none
yet, which is a write to `todo.md`.

The skill does neither. The board holds the whole document in memory and
autosaves it, so anything editing that file underneath an open board is
overwritten within seconds. That is the failure this repo is built to avoid,
and a skill is not a good enough reason to make a second writer.

Instead the skill writes what it wants into
`data/<dataset>/attach-queue.json` and stops: the session id, its folder, the
task it should be filed against, and when. Next time the board loads it reads
the queue, mints any keys it needs through its own ordinary edit path, files
the sessions, and clears it. The board stays the only thing that ever writes
`todo.md`, and attaching still works from a terminal at eleven at night with no
board open.

### The same thing from the board

For when you are already looking at the task rather than at the conversation:
**Attach a session…** in the drawer, listing what Claude Code has on disk,
newest first, with each one's opening prompt and folder. No queue needed here,
since the board is the one doing the writing.

### What it costs

**Done, 4 Sep 2026.**

- `list_sessions()` in `engine.py`, walking `~/.claude/projects`, skipping
  whatever is already filed under some owner. Reads only as far into each
  transcript as it takes to find the working directory and the first thing
  actually asked, via a new `_session_head()`, never the whole file. The
  Node engine's `pastSessions()` was the model; the Python side had no
  equivalent before this.
- Two GET/POST route pairs in `http_glue.py`: `GET /claude/attachable.json`
  lists what's on disk and not yet filed, `POST /claude/attach` files one —
  the filing itself is the existing `SessionStore.record()`, unchanged. A
  third route, `POST /claude/note`, came out of "a prompt is used up" below
  rather than this section, but landed the same day and shares the same
  guard.
- The queue reader in the board: `drainAttachQueue()`, called only from
  `loadFile()` once `state.locked` is confirmed false, matching a task by
  its exact title — the only thing durable enough to name a task from
  outside `todo.md`, since a task's `id` is a counter reset on every load.
  An entry naming a task that cannot be found is written back rather than
  dropped, in case the rename gets undone. The GET/POST pair it uses,
  `/attach-queue.json`, lives in `kanban/server.py` rather than the shared
  package, since minting a `chat:` key is entirely this board's concern.
- The skill, `skills/pa-attach/`: thin, as promised — `scripts/attach_session.py`
  reads `CLAUDE_CODE_SESSION_ID` and appends one entry to the queue file it's
  given; everything else (reading the task list, matching what he names
  against a title, confirming) is the skill's own prose, no script for it.
  Deliberately does not use `AskUserQuestion` to offer the list — that tool
  holds at most four options and the list can run to hundreds — a plain-text
  list and a plain-text answer instead.
- Both halves — the queue and the drawer's own **Attach a session…**, built
  as `openAttachPicker()` — were checked against the real server on the
  `_test` dataset before being called done, per README's rules for testing a
  real save, not only against the mocked fetch `kanban/test_canvas.mjs`
  otherwise runs under.

## When a task is archived

A task ticked off for more than a month is lifted out of `todo.md` into
`finished-archive.md`, which is append-only and never pruned. The line goes and
the `chat:` key on it goes with it, but the rows in `sessions.json` stay and
the transcripts are Claude Code's files and stay too.

The box and its cards leave the canvas. The canvas is for work in front of you,
and a box for something finished in June is the same clutter as a used prompt.
Nothing is deleted to make that happen: the rows stay filed under the key, the
archived line still carries that key, and the transcripts are untouched. If the
task ever comes back the conversations come back with it, because the only
thing that changed was whether they were drawn.

That is also why the archive matters here and the backups do not. A backup is a
copy of the whole list at a moment and every one of them is eventually pruned,
so a key that only survived in backups would stop existing in twelve weeks.
`finished-archive.md` never loses one.

## Steps, in order

1. ~~**`interface/cards.js` in `ai_chat_engine`.**~~ **Done, 4 Sep 2026.** The
   layout arithmetic, lifted out of `ai_canvas` — where a card sits, a card's
   durable identity, the depth pool cards and boxes share, dealing a group out
   in a row, the box around it and its refusal to shrink below its contents.
   Storage stayed behind as a host port, since each host already has a file of
   its own. `ai_canvas` imports it in three places and defines none of it any
   more: the padding and the header height had been written out three separate
   times in that repo, twice in the main process and once in the renderer.
   Typecheck clean, both test suites pass, nothing visible changed, which is
   what a move should look like.

   Two things came out of doing it. The package's own README now describes
   `cards.js` next to `chat.js`. And `ai_canvas` had
   `@tiagopedras/ai-chat-engine` sitting in `node_modules` while declaring it
   in neither `package.json` nor the lockfile, so any fresh install would have
   dropped it; it is now a `file:../ai_chat_engine` dependency, which also
   means an edit to the package is live in the app with no publish step.
2. ~~**The canvas tab here.**~~ **Done, 4 Sep 2026.** A sixth tab next to
   Board. Cards from `sessions.json`, a box per task that has conversations,
   loose cards for the ones filed against nothing, geometry in
   `data/<dataset>/canvas.json`, and dragging a card between boxes to re-file
   it. `#canvas!chat=<id>` opens one conversation. Written up properly in
   README.md under **The Canvas**.

   Three things came out of building it. The re-filing move is
   `SessionStore.assign` in `ai_chat_engine` with a `/claude/assign` route
   beside `forget`, so both hosts have it rather than this board doing the
   move by hand. `kanban/test_canvas.mjs` drives the board in headless Chrome
   and is the first browser test this repo has had. And the tab is hidden in a
   backup preview: the sessions index is current while the document is old, so
   a locked canvas would show today's conversations under yesterday's task
   names.
3. ~~**The same card in the drawer.**~~ **Done, 4 Sep 2026.** The task's
   Chats field draws with `cvCardHTML` — the same renderer the canvas uses —
   stacked in a column where the old row markup sat, instead of chat.js's own
   `renderSection()`, which this host no longer calls. Reads from
   `state.chats`, the board's own cached copy `canvasModel()` already reads,
   rather than `chat.sessionsFor()`, which only fills in once
   `loadSessions()` has actually run. Opening and closing a card share
   `openCard()`/`closeCard()` with the canvas — wired through `handleAsk()`
   in the drawer since that markup sits inside `#dbody` rather than
   `#canvas` — so "the × on a drawer row" and "the × on a canvas card" are
   now the same confirm, the same wording, the same call. `kanban/test_canvas.mjs`
   covers it: one card per conversation, no drag grip in the stack, opening
   and closing both reach the shared functions.
4. ~~**Attaching what started elsewhere.**~~ **Done, 4 Sep 2026.**
   `list_sessions()` in the package, the attach queue, the drawer's own
   **Attach a session…**, and the `/pa-attach` skill — see "What it costs"
   above for the shape of each. Independent of the canvas, as expected: none
   of it touches `sessions.json`'s filing or `todo.md`'s `chat:` keys through
   anything the canvas built. The skill is indexed in `~/Code/SKILLS.md`, per
   `skills/CLAUDE.md`.
5. ~~**A prompt is used up by running it.**~~ **Done, 4 Sep 2026.** The line
   goes on the first message actually sent, not on the Ask Claude click that
   opens the modal — chat.js's own `onSend` hook, fired the instant a message
   leaves the composer and already built for exactly this, is what tells the
   two apart. `askFromPrompt()` marks the run pending before opening the
   modal; `onPromptRunSend()` deletes the line if the send that follows
   matches; `onSessionsChanged()` recognises the new session as whichever row
   under that key wasn't there a moment ago and stamps the prompt onto it
   through a new `/claude/note` route, `SessionStore.set_prompt()` in
   `ai_chat_engine`. A stale pending run — the modal opened and abandoned,
   then a plain **+ New chat** started instead — is cleared by `newChat()`
   rather than left to misfire on an unrelated send. Nine checks in
   `kanban/test_canvas.mjs` cover the whole path, including the two ways it
   must *not* fire.

Step 1 before step 2 on purpose. Building the canvas here first and promising
to extract it afterwards is how the second copy becomes permanent.

## Questions, and how they were settled

Nothing open. Four things were undecided when this was first written and all
four have an answer now, each written up in its own section above. Kept here as
a record of what was actually asked, since the answers are only obvious in
hindsight.

- ~~Does a card know which prompt seeded it?~~ **Settled.** Running a prompt
  deletes the line, and the conversation carries the text from then on. See
  the section above.
- ~~What counts as a card?~~ **Settled.** A card is a conversation filed
  against a task, and nothing else is drawn. Recency is not a useful filter:
  of the 544 sessions on this machine, 543 were touched inside a month. What
  makes a card is being filed, and filing after the fact is what the section
  above is for.
- ~~Do groups get boxes?~~ **Settled.** A box per task, drawn only for tasks
  that have conversations. See the section above.

## The stale comment worth fixing either way

`kanban/index.html` said the chat feature was "parked while `ai_chat/` is being
reworked elsewhere" and that `AI_CHAT_DIR` does not resolve. It resolves.
`../ai_chat_engine` is there, `/claude.json` answers `available: true`, and the
buttons draw. The stub fallback around `AIChat.create()` is still right and
stays, since a checkout without the sibling folder is a real case. The comment
now says that instead. Fixed on this branch.
