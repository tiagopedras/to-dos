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
     lives inside the `chat` object from ai_chat_engine's window rather
     than here. Nothing of it is written to the file or survives a reload. */
  originalText: '',
  fileName: 'todo.md',
  dirty: false,
  /* True when the only thing standing between this tab and the file is a tidy-up
     the board did to itself on load — dating finished tasks, renaming Parked.
     Nothing of his is at stake, so the watcher treats it as clean and reloads
     rather than asking. The tidy-up runs again on the way back in. */
  migratedOnly: false,
  /* Which bucket tabs are toggled on — empty means every bucket, the same
     "nothing picked means no filter" rule statusFilter follows below. Several
     can be on at once, same as Status; see shownBuckets(). */
  bucketFilter: new Set(),
  /* name -> chosen swatch, one per dataset — see bucketColor() below and
     loadBucketColors() in 08-buckets.js. Lives in its own small file rather
     than in todo.md: a colour is a preference about looking at the list, not
     a fact the list itself needs to carry, and todo.md has exactly one writer
     already. */
  bucketColors: {},
  // Heading -> what that column is called on screen, loaded from
  // column-names.json alongside the document. See tierLabel() in 09-columns.js.
  columnNames: {},
  /* Task key (stableId, falling back to title) -> a generated briefing —
     direction, what's done, what's still needed — written by the planning
     agent's own brief.py pass and read by loadBriefings() in
     20-loading-saving.js. Used as-is, never re-validated against the task's
     current text here: the fingerprint check that decides whether a
     briefing is stale is agents/plan-agent/brief.py's job, not the
     board's, on the same reasoning core/todo.js is the one place the format
     itself gets parsed. Absent for a task never briefed yet, which falls
     back to its own raw notes exactly as it always did. */
  briefings: {},
  /* The whole sessions index, owner key -> rows, handed over by the chat window's
     onSessionsChanged. The drawer only ever needs one owner's worth and asks
     for it directly; openChatByKey() has to search every owner for one id, so
     this keeps the last thing the engine said rather than asking again. */
  chats: {},
  /* Whether there is a Claude engine behind this board, as a plain flag rather
     than a question asked of the chat object.

     viewDefs() has to answer before that object exists: the first thing this
     script does is read the URL's view out of the hash, which runs at the top
     of the file, and `chat` is a const two thousand lines below it. Reaching
     for it there is a temporal dead zone error that aborts the whole script
     with no view, no board and nothing in the console to say why. */
  chatsOn: false,
  /* session id -> when that card was last opened, read from and written to
     data/<dataset>/chat-viewed.json — see loadChatViewed() in 11-chat-cards.js.
     Furniture, not content: losing it costs an unread dot and nothing else. */
  chatViewed: {},
  chatViewedLoaded: false,
  query: '',
  urgentFilter: false,
  /* Column names (see boardColumns()) currently narrowed to — empty means
     every column, same "nothing picked means no filter" rule urgentFilter
     already follows. Session-only, like both of those: reset on
     reload rather than remembered. */
  statusFilter: new Set(),
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
  /* The same agreement, asked of the content rather than the clock: the
     X-Todo-Hash the server sent with the last read. The stamp carries one
     second, so a write landing inside the same second as the read looks
     unchanged to it; this does not. Sent back as If-Match on every save. */
  diskHash: null,
  drawerWidth: (+localStorage.getItem('todo-board-drawer')) || 400,
  /* Backup Preview: state.doc holds an old backup instead of the live file, and
     nothing may write to it. Every mutation path checks this before touching
     anything; see updateLockUI for what it hides. */
  locked: false,
  lockedLabel: '',
  /* Which of the two things locked the tab, since updateLockUI() draws a
     different bar for each: '' or 'backup' for a real Backup Preview, and
     'demo' is read off state.demo instead (it predates this field and
     nothing forces the two to agree). */
  lockKind: '',
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
// 11-chat-cards.js, thousands of lines further on — same problem, worse distance.
// Both moved to boot.js, called once everything above has actually loaded —
// see the comment there. This also fixes the readSort() bug, on purpose.

/* The fragment carries three things, so it needs two splits:

     #timeline                     the view — durable, rewritten on every render
     #timeline/design-system       …and which bucket tab is showing, durable too
     #timeline!task=ds-audit       …or a card to open, held open
     #!task=ds-audit               a card to open, whatever view is up

   None of them compete. The view segment sets the view exactly as it always
   did; the bucket segment (a slug — see slugifyBucket in 07-render-board.js)
   sets the active bucket tab; the task segment opens a drawer over whatever
   is showing; an empty segment means leave that part of the state alone. The
   `!` cut comes first, because `!task=`/`!chat=` never appears without it,
   then the view half of what's left of it splits again on `/` for the bucket
   slug. syncHash() writes the view+bucket half back on every render, and the
   task half for as long as openDrawer/closeDrawer say a task is open — see
   there — so a refresh (or a bookmark) lands back on the same card rather
   than just the same view. `!chat=` doesn't get the same treatment: it names
   one turn in a conversation rather than a thing that's "open", so it stays
   the one-shot instruction it always was.

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
  // `!chat=<session>` opens one conversation, the same way `!task=` opens one
  // card. A session id is Claude Code's own and stable, so unlike a task it
  // needs no slug-or-title guessing.
  const c = /^chat=(.*)$/.exec(rest);
  let chatId = '';
  if (c) { try { chatId = decodeURIComponent(c[1]); } catch (e) { chatId = c[1]; } }
  return { view, bucketSlug, task: task.trim(), chat: chatId.trim() };
}

/* A task's `id` is minted fresh on every parse (see uid), so nothing outside
   this tab can name a card by it. Three things in the file are stable enough to
   link to, and all three are tried in this order.

   `stableId` first: written on the line, unique across the list, and the only
   one that survives a retitle, which is why the plans ledger and the nightly
   queue now key on it. Then `#slug`, which is deliberate where it exists but
   optional. Then the title, which is only as unique as he happened to make it,
   and is what every link written before ids existed still carries. */
function findTaskByKey(key){
  if (!key || !state.doc) return null;
  const want = key.replace(/\s+/g, ' ').trim().toLowerCase();
  let byId = null, bySlug = null, byTitle = null;
  for (const b of state.doc.buckets)
    for (const tier of b.tiers)
      for (const t of tier.tasks){
        if (!byId && t.stableId && t.stableId === want) byId = t;
        if (!bySlug && t.slug && t.slug.toLowerCase() === want) bySlug = t;
        if (!byTitle && String(t.title || '').replace(/\s+/g, ' ').trim().toLowerCase() === want) byTitle = t;
      }
  return byId || bySlug || byTitle;
}

/* The inverse of findTaskByKey, and the same choice companion/app.py's own
   task_key() makes — slug first, title as the fallback every task has — so a
   link this tab writes into its own address bar is one findTaskByKey can read
   straight back, here or from the companion. */
function taskKey(t){
  return t.stableId || t.slug || t.title;
}

/* encodeURIComponent leaves `!` untouched. parseHash() only ever splits on the
   first one, which this file's own `!task=` always is, so an un-escaped `!`
   inside a title wouldn't actually be misread today — but that is an
   accident of the current grammar, not something to depend on, and
   companion/app.py's board_url() already escapes it for exactly this reason.
   Matched here so both halves build the same link. */
function encodeTaskKey(key){
  return encodeURIComponent(key).replace(/!/g, '%21');
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
  if (loc && state.bucketFilter.size && !state.bucketFilter.has(loc.bucket.name)) {
    state.bucketFilter = new Set([loc.bucket.name]);
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
   in 11-chat-cards.js, not loaded yet at this point in the script order. */
function initViewFromHash(){
  const h = parseHash();
  if (isKnownView(h.view)) state.view = h.view;
  state.pendingTask = h.task;
  state.pendingChat = h.chat;
  state.pendingBucketSlug = h.bucketSlug || null;
}

/* Ten, and the fifth used to be the accent blue — which is the first bucket's
   colour, so a fifth bucket came out looking like the first. Nothing could add
   one before, so it never showed. Past ten they repeat, which is honest: at
   that point the list is not colour-coded any more whatever we do.

   This is the fallback only — bucketColor() below is what everything actually
   calls. A bucket picked its own colour from these same ten swatches (see
   openBucketEditor in 08-buckets.js) wins over its position in the list, which
   is the whole point: reordering the buckets used to reshuffle every colour on
   the board along with them, because position was the only thing a colour was
   ever derived from. */
const BUCKET_COLOR = ['var(--tenon-chart-1)','var(--tenon-chart-2)','var(--tenon-chart-3)','var(--tenon-chart-4)','var(--tenon-chart-5)','var(--tenon-chart-6)',
                       'var(--tenon-chart-7)','var(--tenon-chart-8)','var(--tenon-chart-9)','var(--tenon-chart-10)'];
/* state.bucketColors is name -> swatch (one of BUCKET_COLOR's own values),
   loaded from bucket-colors.json alongside the document — see loadBucketColors
   in 08-buckets.js. A name with nothing chosen for it falls through to its
   position in the list, exactly as every bucket did before a picker existed. */
function bucketColor(name, index){
  return (state.bucketColors && state.bucketColors[name]) ||
    BUCKET_COLOR[((index % BUCKET_COLOR.length) + BUCKET_COLOR.length) % BUCKET_COLOR.length];
}
const DONE_COL = 'Done';
/* Not a special column the way Done is — just a tier the board tints, so a
   renamed section simply stops matching and goes back to looking normal. It
   was Waiting for review until 21 Sep 2026: a column says the state of the
   card, and Reviewing is what a card is once the work is done and someone has
   to look at it, whoever that someone is. The old heading still loads as this
   one (TIER_RENAMED in core/todo.js), so a backup taken before the rename
   reads the same. The Plans view keeps its own Waiting for review until that
   view goes. */
const WAIT_COL = 'Reviewing';
/* Same story as WAIT_COL: a tier name the board fades on sight, not a status
   field of its own. A renamed Backlog just stops matching. */
const BACKLOG_TIER = 'Backlog';
/* rollRecurring() (04-tier-two-the-one-thing.js) parks a finished recurring
   task in one of these two, by name, so they need the same constant every
   other load-bearing tier gets rather than a fresh literal typed at the call
   site. */
const TODO_TIER = 'To do';
const DOING_TIER = 'Doing';
/* These five are matched by string all through the board, unlike an ordinary
   tier a bucket adds — a real per-column identity that survives a rename
   would mean a marker stored in the file itself, changing the format both
   todo.js and todo.py read, which is a bigger job than this is. So instead
   the Edit Columns editor simply refuses to rename any of the five away from
   this exact text (see tierNameTaken() in 09-columns.js) — the same
   protection DONE_COL already gets by never being a real heading at all,
   extended to the four of these that are. Any other tier a bucket adds
   stays freely renamable. */
const RESERVED_TIERS = [BACKLOG_TIER, TODO_TIER, DOING_TIER, WAIT_COL, DONE_COL];
/* The first bucket tab shows every bucket at once. Not a real bucket, so it
   needs a name no heading in the file could ever produce. */
const ALL_BUCKETS = '__all__';
/* Hints match the tier descriptions in the file. Unknown tier names simply
   show no hint, so renaming a section in todo.md never breaks the board. */
const TIER_HINT = {
  'Backlog': 'no time pressure yet',
  'Reviewing': 'done, waiting for a look',
  'Later':   'no time pressure',
  'To do':   'two to four weeks out',
  'Next':    'after that',
  'Doing':   'current focus, next two weeks',
  'Now':     'current focus',
  'Done':    'ticked off'
};

/* The file lists tiers Now → Backlog. The board shows them the other way
   round, with Done on the far right. Who is doing a task is its assignee
   (`[to::]`), never a column of its own: Handed to AI went on 21 Sep 2026, and
   a task an agent has stays in To do or Doing like any other. */
function boardColumns(){
  return allTiers().slice().reverse().concat([DONE_COL]);
}

/* The four names above, and the synthetic Done column, are also written down in
   stream.json, which is this list's manifest under the work-item contract. Two
   copies of one vocabulary is exactly what that contract exists to stop, so
   this checks them against each other on boot and says so in the console if
   they have drifted.

   Checked rather than derived, deliberately, and it is worth saying why. These
   are `const`s read by twenty-odd scripts at the moment they first run, and the
   manifest arrives over the network. Deriving them would mean either blocking
   the board's first paint on a fetch or leaving every one of those scripts to
   cope with the names not existing yet, which is a real cost for a vocabulary
   that changes about once a year. A check costs nothing and catches the only
   thing that actually goes wrong: someone editing one and not the other.

   Silent when there is no manifest, because the static deployment has no
   /streams.json and a board with no helper behind it is a normal state. */
async function checkStreamManifest(){
  try {
    const res = await fetch('/streams.json');
    if (!res.ok) return;
    const found = (await res.json()).streams || [];
    const mine = found.find(s => s.id === 'tasks');
    if (!mine) return;
    const drew = boardColumns();
    const says = (mine.lanes || []).map(l => l.lane);
    if (drew.join('|') !== says.join('|'))
      console.warn('[work-streams] the board draws columns this manifest does not name.' +
        '\n  board:    ' + drew.join(' | ') +
        '\n  manifest: ' + says.join(' | ') +
        '\n  One of stream.json and 02-state.js is out of date. See PACKAGES/work-streams/CONTRACT.md.');
    for (const e of mine.errors || []) console.warn('[work-streams] stream.json: ' + e);
  } catch (err) { /* no helper, or no package: both are normal */ }
}

