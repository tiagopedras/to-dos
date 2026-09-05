'use strict';

/* =========================================================================
   2. State
   ========================================================================= */

const state = {
  doc: null,
  /* The Jira boards read from data/jira.json, or null when there is no such
     file. Null is a normal state, not an error: no file, no buttons. */
  jira: null,
  /* True once /datasets.json has answered at least once. An older server
     with no such route leaves this false forever and the dropdown hidden —
     the board works exactly as it did before data sets existed. */
  datasets: false,
  /* Everything about the Claude chat engine — the CLI's status, which
     sessions sit under which task, any run in flight, the modal itself —
     lives inside the `chat` object from ai_chat/interface/chat.js rather
     than here. Nothing of it is written to the file or survives a reload. */
  originalText: '',
  fileName: 'todo.md',
  dirty: false,
  /* True when the only thing standing between this tab and the file is a tidy-up
     the board did to itself on load — dating finished tasks, renaming Parked.
     Nothing of his is at stake, so the watcher treats it as clean and reloads
     rather than asking. The tidy-up runs again on the way back in. */
  migratedOnly: false,
  activeBucket: null,
  /* The whole sessions index, owner key -> rows, handed over by chat.js's
     onSessionsChanged. The drawer only ever needs one owner's worth and asks
     for it directly; the canvas needs all of them at once, so this keeps the
     last thing the engine said rather than asking again per box. */
  chats: {},
  /* Whether there is a Claude engine behind this board, as a plain flag rather
     than a question asked of the chat object.

     viewDefs() has to answer before that object exists: the first thing this
     script does is read the URL's view out of the hash, which runs at the top
     of the file, and `chat` is a const two thousand lines below it. Reaching
     for it there is a temporal dead zone error that aborts the whole script
     with no view, no board and nothing in the console to say why. */
  chatsOn: false,
  // False until onChatStatusChanged's first answer arrives — see renderView's
  // isPendingCanvas, which needs to tell "canvas doesn't exist here" apart from
  // "canvas exists, we just don't know it yet".
  chatsChecked: false,
  /* Where each card sits and the box around each task's cards, read from and
     written to data/<dataset>/canvas.json. Furniture, not content: losing it
     costs an arrangement and nothing else. */
  canvas: { version: 1, cards: {}, boxes: {}, viewed: {} },
  canvasLoaded: false,
  query: '',
  aiFilter: '',
  urgentFilter: false,
  unscoredOnly: false,
  matrixHideWaiting: false,
  /* Width of the timeline's frozen title column. Remembered the same way the
     drawer's own width is — a drag he does once should not repeat itself. */
  tlLabelWidth: (+localStorage.getItem('todo-board-tl-label')) || 200,
  sort: {},           /* column name -> 'priority'; absent means his own order */
  view: 'overview',   /* the view the file opens on */
  openTask: null,
  /* The same panel, showing a project folder instead of a task. Only ever one
     of the two is set. */
  openProject: null,
  /* Last-Modified of todo.md as this tab last agreed with it. Used to notice
     edits made outside the board. */
  diskStamp: null,
  drawerWidth: (+localStorage.getItem('todo-board-drawer')) || 400,
  /* Backup Preview: state.doc holds an old backup instead of the live file, and
     nothing may write to it. Every mutation path checks this before touching
     anything; see updateLockUI for what it hides. */
  locked: false,
  lockedLabel: '',
  /* Example data is standing in for a list that is not there. It is a kind of
     lock rather than a separate mode, so nothing it renders can be written
     back — see loadDemo for why that matters. */
  demo: false,
  /* A task named in the URL that hasn't been opened yet, because the document
     wasn't loaded when the link arrived. Cleared the moment it is acted on;
     see parseHash. */
  pendingTask: '',
  /* Same idea, for the bucket slug riding along beside the view (see
     syncHash in 07-render-board.js). Can't be resolved against a real bucket
     until state.doc exists, so it waits here for load() to match it. */
  pendingBucketSlug: null
};
// state.sort = readSort() and initViewFromHash() below both used to run here,
// immediately. readSort() reads SORT_KEY, a const declared 150-odd lines
// below in 03-tier-one-impact-effort.js — a script tag has no hoisting into
// scripts that haven't run yet, so that call threw ReferenceError every load,
// silently, inside readSort()'s own try/catch, and the saved per-column sort
// never once restored. initViewFromHash() calls isKnownView(), declared in
// 11-canvas.js, thousands of lines further on — same problem, worse distance.
// Both moved to boot.js, called once everything above has actually loaded —
// see the comment there. This also fixes the readSort() bug, on purpose.

/* The fragment carries three things, so it needs two splits:

     #timeline                     the view — durable, rewritten on every render
     #timeline/design-system       …and which bucket tab is showing, durable too
     #timeline!task=ds-audit       …or a card to open, once
     #!task=ds-audit               a card to open, whatever view is up

   None of them compete. The view segment sets the view exactly as it always
   did; the bucket segment (a slug — see slugifyBucket in 07-render-board.js)
   sets the active bucket tab; the task segment opens a drawer over whatever
   is showing; an empty segment means leave that part of the state alone. The
   `!` cut comes first, because `!task=`/`!chat=` never appears without it,
   then the view half of what's left of it splits again on `/` for the bucket
   slug. syncHash() writes the view+bucket half back on every render, which is
   what drops the task again — an instruction that has been carried out
   shouldn't survive a refresh.

   The fragment rather than a query string on purpose. A link that differs only
   after the `#` is a same-document navigation, so the browser brings the tab
   that is already open to the front and fires hashchange. A `?task=` would be a
   different URL and would give a second tab on one list, and two tabs both
   autosaving the same file is the one thing this board cannot survive. */
function parseHash(){
  const raw = location.hash.slice(1);
  const cut = raw.indexOf('!');
  const viewPart = cut < 0 ? raw : raw.slice(0, cut);
  const rest = cut < 0 ? '' : raw.slice(cut + 1);
  const slash = viewPart.indexOf('/');
  const view = slash < 0 ? viewPart : viewPart.slice(0, slash);
  const bucketSlug = slash < 0 ? '' : viewPart.slice(slash + 1);
  const m = /^task=(.*)$/.exec(rest);
  let task = '';
  if (m) { try { task = decodeURIComponent(m[1]); } catch (e) { task = m[1]; } }
  // `#canvas!chat=<session>` opens one conversation, the same way `!task=`
  // opens one card. A session id is Claude Code's own and stable, so unlike a
  // task it needs no slug-or-title guessing.
  const c = /^chat=(.*)$/.exec(rest);
  let chatId = '';
  if (c) { try { chatId = decodeURIComponent(c[1]); } catch (e) { chatId = c[1]; } }
  return { view, bucketSlug, task: task.trim(), chat: chatId.trim() };
}

/* A task's `id` is minted fresh on every parse (see uid), so nothing outside
   this tab can name a card by it. Two things in the file are stable enough to
   link to: its `#slug` where it has one, and its title where it doesn't. Both
   are tried, slug first — a slug is deliberate, a title is only as unique as he
   happened to make it. */
function findTaskByKey(key){
  if (!key || !state.doc) return null;
  const want = key.replace(/\s+/g, ' ').trim().toLowerCase();
  let bySlug = null, byTitle = null;
  for (const b of state.doc.buckets)
    for (const tier of b.tiers)
      for (const t of tier.tasks){
        if (!bySlug && t.slug && t.slug.toLowerCase() === want) bySlug = t;
        if (!byTitle && String(t.title || '').replace(/\s+/g, ' ').trim().toLowerCase() === want) byTitle = t;
      }
  return bySlug || byTitle;
}

/* Open the card a link named. The bucket tab is moved to the one holding it
   first, so the card is actually behind the panel rather than filtered out of
   the view underneath — a drawer over an empty board reads as a bug. */
function openTaskByKey(key){
  const t = findTaskByKey(key);
  if (!t) {
    renderView();
    $('#status').textContent = 'no task called “' + key + '” on this list';
    return false;
  }
  const loc = locate(t.id);
  if (loc && state.activeBucket !== ALL_BUCKETS && loc.bucket.name !== state.activeBucket) {
    state.activeBucket = loc.bucket.name;
  }
  renderView();
  openDrawer(t.id);
  return true;
}

/* Open the conversation a link named. Unlike a task there is nothing to search
   for: the id is in sessions.json under exactly one owner, and that owner is
   what the modal needs to know as well. */
function openChatByKey(id){
  if (!id) return false;
  const index = state.chats || {};
  for (const key of Object.keys(index)){
    if (!(index[key] || []).some(r => r.id === id)) continue;
    const task = tasksByChatKey()[key];
    chat.openSession(task ? task.id : key, key, id);
    return true;
  }
  $('#status').textContent = 'no conversation with that id on this list';
  return false;
}

/* The URL's #slug is the one thing a refresh doesn't wipe, so read it before the
   first render — otherwise every reload snaps back to the default view. Called
   from boot.js rather than self-invoked here: isKnownView() below is declared
   in 11-canvas.js, not loaded yet at this point in the script order. */
function initViewFromHash(){
  const h = parseHash();
  if (isKnownView(h.view)) state.view = h.view;
  state.pendingTask = h.task;
  state.pendingChat = h.chat;
  state.pendingBucketSlug = h.bucketSlug || null;
}

/* Six, and the fifth used to be the accent blue — which is the first bucket's
   colour, so a fifth bucket came out looking like the first. Nothing could add
   one before, so it never showed. Past six they repeat, which is honest: at that
   point the list is not colour-coded any more whatever we do. */
const BUCKET_COLOR = ['var(--b1)','var(--b2)','var(--b3)','var(--b4)','var(--b5)','var(--b6)'];
const DONE_COL = 'Done';
/* Not a special column the way Done is — just a tier the board tints, so a
   renamed section simply stops matching and goes back to looking normal. */
const WAIT_COL = 'Waiting review';
/* Sits between Doing and Waiting review. Unlike the other columns it has no
   standing heading in every bucket — it is only ever created the first time a
   task is moved into it (see ensureTier), and the board hides it again once
   nothing is left there (see the filter in renderBoard). */
const BLOCKED_TIER = 'Blocked';
/* The first bucket tab shows every bucket at once. Not a real bucket, so it
   needs a name no heading in the file could ever produce. */
const ALL_BUCKETS = '__all__';
/* Hints match the tier descriptions in the file. Unknown tier names simply
   show no hint, so renaming a section in todo.md never breaks the board. */
const TIER_HINT = {
  'Backlog': 'no time pressure yet',
  'Waiting review': 'done, waiting on someone else',
  'Later':   'no time pressure',
  'To do':   'two to four weeks out',
  'Next':    'after that',
  'Doing':   'current focus, next two weeks',
  'Now':     'current focus',
  'Done':    'ticked off',
  'Blocked': "can't move until something changes"
};

/* The file lists tiers Now → Backlog. The board shows them the other way
   round, with a Done column on the far right for anything ticked off. */
function boardColumns(){ return allTiers().slice().reverse().concat([DONE_COL]); }

