'use strict';

/* =========================================================================
   The canvas — conversations with Claude, grouped by the task they belong to.

   Two things make this different from the Electron canvas next door, and both
   come from what this board already is:

   A group here is a task, not a project invented for the purpose. Claude Code
   has no idea what a piece of work is, so ai_canvas had to make projects up
   and store them. This board has had tasks all along, with ids that survive a
   rename, a reorder and a move between buckets, and the `chat:` key on a task
   line is already how conversations are filed against it. So the canvas groups
   by something that exists rather than keeping a second grouping beside it.

   And nothing here starts a session. This is a view of filing: which
   conversations are open and what work each belongs to. The one thing it
   writes to todo.md is a `chat:` key, minted when a card is dropped onto a
   task that has never had one, which is the same write the drawer already
   makes when you start a chat from a task.

   The arithmetic — where a card sits, the box around a group, the box's
   refusal to shrink below what is in it — is cards.js in the chat engine,
   shared with ai_canvas rather than written twice.
   ========================================================================= */

/* A loose conversation belongs to no task. Its owner key is minted with this
   prefix so it is recognisable on sight in sessions.json, and so nothing ever
   mistakes it for a task's key. The engine's OWNER_KEY pattern allows letters,
   digits, dash and underscore, which is why this is a dash rather than the
   colon that would read better. */
const LOOSE_PREFIX = 'canvas-';
function isLoose(key){ return String(key || '').startsWith(LOOSE_PREFIX); }

/* Every task on the list that carries a chat key, by key. Rebuilt per draw
   rather than cached: a task can gain a key at any point, and a stale map is
   how a card ends up in the wrong box. */
function tasksByChatKey(){
  const map = {};
  if (!state.doc) return map;
  state.doc.buckets.forEach(b => b.tiers.forEach(ti => ti.tasks.forEach(t => {
    if (t.chat) map[t.chat] = t;
  })));
  return map;
}

/* The canvas model: one entry per owner that has conversations, each either a
   task with a box or a loose card with none.

   An owner key pointing at no task is loose. That covers two cases and treats
   them the same on purpose: a conversation started loose, and one whose task
   has since been archived out of todo.md. Both are conversations with no work
   attached, the transcripts survive either way, and re-filing one is the same
   gesture. */
/* A conversation has no column of its own — only the task that owns it does,
   so Status filtering here means checking that task rather than the card.
   Same three names the board itself resolves a task to: Done and Handed to
   AI both override the task's literal tier, exactly as they do on the board. */
function canvasTaskShown(task){
  if (!state.statusFilter.size) return true;
  const loc = locate(task.id);
  const tierName = task.done ? DONE_COL : task.ai === 'full' ? AI_COL : (loc && loc.tier.name);
  return tierName != null && state.statusFilter.has(tierName);
}
function canvasModel(){
  const byKey = tasksByChatKey();
  const groups = [];
  const loose = [];
  Object.keys(state.chats || {}).forEach(key => {
    const rows = (state.chats[key] || []).slice()
      .sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
    if (!rows.length) return;
    const task = byKey[key];
    if (task) { if (canvasTaskShown(task)) groups.push({ key, task, rows }); }
    else rows.forEach(row => loose.push({ key, row }));
  });
  groups.sort((a, b) => a.task.title.localeCompare(b.task.title));
  return { groups, loose };
}

/* ---- The geometry store ----
   Read once on load, written back debounced. A card the store has never seen
   is laid out where the model puts it and written down on the next save, so
   an arrangement builds itself the first time the canvas is opened rather
   than needing every card placed by hand. */
async function loadCanvasStore(){
  if (state.canvasLoaded) return;
  state.canvasLoaded = true;
  try {
    const data = await getJSON('/canvas.json');
    state.canvas = {
      version: 1,
      cards: (data && data.cards) || {},
      boxes: (data && data.boxes) || {},
      viewed: (data && data.viewed) || {}
    };
  } catch (err) { /* no helper, no stored layout — the canvas lays itself out */ }
}

/* Opening a card is what "read" means — the same rule sessionPool.ts uses
   in ai_canvas, just kept here instead: this board has no live process to
   ask, so the unread flag is only ever a comparison against when the card
   was last opened, not something a running session reports on its own. */
function markCanvasViewed(id){
  state.canvas.viewed = state.canvas.viewed || {};
  state.canvas.viewed[id] = new Date().toISOString();
  saveCanvas();
  renderCanvas();
}

let canvasSaveTimer = null;
function saveCanvas(){
  // A locked tab cannot write anything, layout included. Same guard the file
  // save uses, and for the same reason — a backup preview is a look at
  // something that was, not a thing to rearrange.
  if (state.locked) return;
  clearTimeout(canvasSaveTimer);
  canvasSaveTimer = setTimeout(() => {
    // Checked again on the way out, not just on the way in. Half a second is
    // long enough to drag a card and then open a backup preview, and a write
    // scheduled by the live tab should not land after the tab has been locked.
    if (state.locked) return;
    postJSON('/canvas', state.canvas)
      .catch(() => { /* the layout is not worth an error message */ });
  }, 500);
}

/* Where a card sits, from the store or from a first-time layout. Cards are
   dealt out inside their group's box, groups down the canvas in the order
   the model put them, and loose cards in a column of their own on the left. */
function layoutCanvas(model){
  const C = window.AICards;
  const cards = {};          /* session id -> geometry */
  const boxes = {};          /* owner key   -> rect */
  const stored = state.canvas.cards || {};
  const GAP = C ? C.LAYOUT.gap : 20;
  const CARD_W = 280, CARD_H = 108;

  let y = 60;
  model.groups.forEach(group => {
    let x = 260;
    group.rows.forEach(row => {
      const held = stored[row.id];
      cards[row.id] = held
        ? { x: held.x, y: held.y, width: CARD_W, height: CARD_H, z: held.z || 1 }
        : { x: x, y: y, width: CARD_W, height: CARD_H, z: 1 };
      x += CARD_W + GAP;
    });
    const members = group.rows.map(r => ({ id: r.id, geometry: cards[r.id] }));
    const held = state.canvas.boxes[group.key];
    boxes[group.key] = C
      ? C.containBox(held, members, {}, { fallbackHeight: CARD_H })
      : held || null;
    // Only advance the default row when this group used one. A group whose
    // cards were all placed by hand should not push the next group down the
    // canvas to make room for a row it never occupied.
    if (group.rows.some(r => !stored[r.id])) y += CARD_H + 90;
  });

  let ly = y + 20;
  model.loose.forEach(item => {
    const held = stored[item.row.id];
    cards[item.row.id] = held
      ? { x: held.x, y: held.y, width: CARD_W, height: CARD_H, z: held.z || 1 }
      : { x: 40, y: ly, width: CARD_W, height: CARD_H, z: 1 };
    if (!held) ly += CARD_H + GAP;
  });

  return { cards, boxes };
}

/* When a conversation last did anything, in the words the drawer already
   uses for the same rows. */
function cvWhen(iso){
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then)) return '';
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function cvCardHTML(row, ownerKey, ownerLabel, isLooseCard){
  // Unread since the canvas last saw it opened — state.canvas.viewed is
  // furniture, same as position, so it survives a reload. A row with no
  // `updated` (shouldn't happen) never lights up rather than always doing so.
  const viewedAt = (state.canvas.viewed || {})[row.id];
  const unread = !!row.updated && (!viewedAt || row.updated > viewedAt);
  return '<article class="cvcard" data-session="' + esc(row.id) + '"' +
      ' data-owner="' + esc(ownerKey) + '">' +
    '<div class="cvgrip" title="Drag to move. Drop on a task to file it there.">⠿</div>' +
    '<button type="button" class="cvclose" data-session="' + esc(row.id) + '"' +
      ' data-owner="' + esc(ownerKey) + '"' +
      ' title="Take this conversation off the board. The transcript stays on disk.">×</button>' +
    '<button type="button" class="cvbody" data-session="' + esc(row.id) + '"' +
        ' data-owner="' + esc(ownerKey) + '">' +
      '<span class="cvtitle">' + esc(row.title || 'Untitled conversation') +
        (unread ? '<i class="unread-dot" title="New output since you last opened it"></i>' : '') +
      '</span>' +
      '<span class="cvowner' + (isLooseCard ? ' loose' : '') + '">' +
        esc(isLooseCard ? 'Not filed against a task' : ownerLabel) + '</span>' +
      '<span class="cvmeta">' + esc(cvWhen(row.updated)) +
        (row.mode === 'work' ? '<em class="cvmode">can write</em>' : '') +
      '</span>' +
    '</button>' +
  '</article>';
}

function renderCanvas(){
  const host = $('#canvas');
  if (!host) return;
  if (!state.canvasLoaded) { loadCanvasStore().then(renderCanvas); }

  const model = canvasModel();
  const placed = layoutCanvas(model);

  if (!model.groups.length && !model.loose.length) {
    host.innerHTML = '<div class="cvsurface"><div class="cvempty">' +
      '<h2>No conversations yet</h2>' +
      '<p>Every chat you start from a task shows up here, in a box named after ' +
      'that task. Drag a card onto a different box to re-file it, or out of ' +
      'every box to leave it unattached.</p>' +
      '<p>Start one from the AI processes section of any task.</p>' +
      '</div></div>';
    return;
  }

  // Boxes first so they sit behind their cards. Both are absolutely
  // positioned siblings rather than nested, because a card has to be
  // draggable out of its box and nesting would make that a reparent
  // mid-drag rather than a move.
  //
  // Tidy is the only control on the canvas that moves something already
  // placed, so a locked tab does not get it at all rather than getting one
  // that refuses — the same line every other rearranging gesture here draws.
  let html = state.locked ? '' :
    '<div class="cvtools"><button type="button" class="btn small" id="cvtidy"' +
      ' title="Line every box and loose card back up in a grid, in the order they' +
      ' already read. Nothing changes but where things sit.">Tidy</button></div>';
  html += '<div class="cvsurface">';
  model.groups.forEach(group => {
    const rect = placed.boxes[group.key];
    if (!rect) return;
    const loc = locate(group.task.id);
    const bc = loc ? bucketColor(loc.bucket.name, loc.bi) : 'var(--ink-faint)';
    html += '<section class="cvbox" data-box="' + esc(group.key) + '"' +
        ' style="left:' + rect.x + 'px; top:' + rect.y + 'px;' +
        ' width:' + rect.width + 'px; height:' + rect.height + 'px">' +
      '<header class="cvboxbar" data-box="' + esc(group.key) + '">' +
        '<i class="bkdot" style="background:' + bc + '"' +
          ' title="' + esc(loc ? loc.bucket.name : '') + '"></i>' +
        '<button type="button" class="cvopen" data-task="' + esc(group.task.id) + '"' +
          ' title="Open this task">' + esc(group.task.title) + '</button>' +
        '<span class="cvcount">' + group.rows.length + '</span>' +
      '</header>' +
      '<div class="cvgrow" data-box="' + esc(group.key) + '"' +
        ' title="Drag to resize. It will not go smaller than the cards in it."></div>' +
    '</section>';
  });

  model.groups.forEach(group => {
    group.rows.forEach(row => {
      const g = placed.cards[row.id];
      html += cvCardHTML(row, group.key, group.task.title, false)
        .replace('<article class="cvcard"',
          '<article class="cvcard" style="left:' + g.x + 'px; top:' + g.y + 'px; z-index:' + (10 + g.z) + '"');
    });
  });
  model.loose.forEach(item => {
    const g = placed.cards[item.row.id];
    html += cvCardHTML(item.row, item.key, '', true)
      .replace('<article class="cvcard"',
        '<article class="cvcard" style="left:' + g.x + 'px; top:' + g.y + 'px; z-index:' + (10 + g.z) + '"');
  });
  html += '</div>';
  host.innerHTML = html;

  // Remember what the layout worked out, so a canvas opened once and never
  // touched still comes back the same way rather than being re-derived from a
  // model that may have gained a card since.
  Object.keys(placed.cards).forEach(id => {
    const g = placed.cards[id];
    state.canvas.cards[id] = { x: g.x, y: g.y, z: g.z };
  });
  Object.keys(placed.boxes).forEach(key => {
    if (placed.boxes[key]) state.canvas.boxes[key] = placed.boxes[key];
  });

  wireCanvas(host);
}


/* ---- Moving things about ----
   One pointer handler on the canvas rather than one per card. It is cheaper
   with a few dozen cards on screen, and it keeps a drag working when the
   cursor outruns the card — the same call ai_canvas made, for the same
   reason.

   A card drags by the strip along its top and opens by its body, which is the
   bargain a window title bar makes: the bar belongs to the furniture, the body
   belongs to the content. Without that split there is no gesture left for
   opening a card, since a card that moves when you press it cannot also be a
   button. */
let cvDrag = null;

/* Opening a card, from wherever it was clicked — the canvas, wired below, or
   the drawer's own stack, wired through handleAsk instead since that markup
   sits inside #dbody rather than #canvas. */
function openCard(el){
  const owner = el.dataset.owner, id = el.dataset.session;
  const task = tasksByChatKey()[owner];
  markCanvasViewed(id);
  chat.openSession(task ? task.id : owner, owner, id);
}

function wireCanvas(host){
  host.querySelectorAll('.cvbody').forEach(el => { el.onclick = () => openCard(el); });
  host.querySelectorAll('.cvopen').forEach(el => {
    el.onclick = e => { e.stopPropagation(); openDrawer(el.dataset.task); };
  });
  host.querySelectorAll('.cvclose').forEach(el => {
    el.onclick = e => { e.stopPropagation(); closeCard(el.dataset.owner, el.dataset.session); };
  });

  // A locked tab can look and open, and cannot rearrange — the same line
  // every other view draws.
  if (state.locked) return;

  const tidy = host.querySelector('#cvtidy');
  if (tidy) tidy.onclick = tidyCanvas;

  host.onpointerdown = e => {
    const grip = e.target.closest('.cvgrip');
    const bar = e.target.closest('.cvboxbar');
    const grow = e.target.closest('.cvgrow');
    if (!grip && !bar && !grow) return;
    if (e.target.closest('.cvopen') || e.target.closest('.cvclose')) return;
    e.preventDefault();

    if (grow) {
      const box = grow.closest('.cvbox');
      cvDrag = {
        kind: 'resize', el: box, key: box.dataset.box,
        dx: e.clientX, dy: e.clientY,
        ow: box.offsetWidth, oh: box.offsetHeight
      };
    } else if (grip) {
      const card = grip.closest('.cvcard');
      cvDrag = {
        kind: 'card', el: card, id: card.dataset.session, from: card.dataset.owner,
        dx: e.clientX, dy: e.clientY,
        ox: parseFloat(card.style.left) || 0, oy: parseFloat(card.style.top) || 0
      };
      card.classList.add('dragging');
      card.style.zIndex = 999;
    } else {
      const box = bar.closest('.cvbox');
      const key = box.dataset.box;
      const cards = [...host.querySelectorAll('.cvcard')]
        .filter(c => c.dataset.owner === key)
        .map(c => ({ el: c, ox: parseFloat(c.style.left) || 0, oy: parseFloat(c.style.top) || 0 }));
      cvDrag = {
        kind: 'box', el: box, key: key, cards: cards,
        dx: e.clientX, dy: e.clientY,
        ox: parseFloat(box.style.left) || 0, oy: parseFloat(box.style.top) || 0
      };
    }
    host.setPointerCapture(e.pointerId);
  };

  host.onpointermove = e => {
    if (!cvDrag) return;
    const mx = e.clientX - cvDrag.dx, my = e.clientY - cvDrag.dy;
    if (cvDrag.kind === 'resize') {
      // Live, the box follows the corner freely — including inwards past its
      // own cards, because a gesture that stops dead under your hand feels
      // broken. The floor is applied on release, by cards.js, which is where
      // it belongs: dragging inwards is allowed and simply has no effect
      // below what the box contains.
      cvDrag.el.style.width = Math.max(120, cvDrag.ow + mx) + 'px';
      cvDrag.el.style.height = Math.max(60, cvDrag.oh + my) + 'px';
      return;
    }
    cvDrag.el.style.left = (cvDrag.ox + mx) + 'px';
    cvDrag.el.style.top = (cvDrag.oy + my) + 'px';
    if (cvDrag.kind === 'box') {
      cvDrag.cards.forEach(c => {
        c.el.style.left = (c.ox + mx) + 'px';
        c.el.style.top = (c.oy + my) + 'px';
      });
    } else {
      // Light up the box the card would land in, so dropping is not a guess.
      const over = cvBoxUnder(cvDrag.el);
      host.querySelectorAll('.cvbox').forEach(b => {
        b.classList.toggle('over', !!over && b.dataset.box === over && over !== cvDrag.from);
      });
    }
  };

  host.onpointerup = () => {
    if (!cvDrag) return;
    const drag = cvDrag;
    cvDrag = null;
    host.querySelectorAll('.cvbox.over').forEach(b => b.classList.remove('over'));

    if (drag.kind === 'resize') {
      const held = state.canvas.boxes[drag.key] || { x: 0, y: 0 };
      const members = [...host.querySelectorAll('.cvcard')]
        .filter(c => c.dataset.owner === drag.key)
        .map(c => ({
          id: c.dataset.session,
          geometry: {
            x: parseFloat(c.style.left) || 0, y: parseFloat(c.style.top) || 0,
            width: c.offsetWidth, height: c.offsetHeight, z: 1
          }
        }));
      const asked = {
        x: held.x, y: held.y,
        width: parseFloat(drag.el.style.width) || drag.ow,
        height: parseFloat(drag.el.style.height) || drag.oh
      };
      // The same floor the Electron canvas uses, from the same function: a box
      // grows to cover its cards and never shrinks below them.
      const rect = window.AICards
        ? window.AICards.containBox(asked, members, {}) : asked;
      state.canvas.boxes[drag.key] = rect;
      drag.el.style.left = rect.x + 'px';
      drag.el.style.top = rect.y + 'px';
      drag.el.style.width = rect.width + 'px';
      drag.el.style.height = rect.height + 'px';
      saveCanvas();
      return;
    }

    if (drag.kind === 'box') {
      state.canvas.boxes[drag.key] = Object.assign({}, state.canvas.boxes[drag.key], {
        x: parseFloat(drag.el.style.left) || 0,
        y: parseFloat(drag.el.style.top) || 0
      });
      drag.cards.forEach(c => cvRecord(c.el));
      saveCanvas();
      return;
    }

    drag.el.classList.remove('dragging');
    drag.el.style.zIndex = '';
    cvRecord(drag.el);
    saveCanvas();

    const landed = cvBoxUnder(drag.el);
    if (landed === drag.from) return;
    if (landed) return void adoptCard(drag.id, drag.from, landed);
    // Dragged clear of every box. A card that was in one is being taken out
    // of it deliberately; one that was already loose has simply been moved.
    if (!isLoose(drag.from)) void releaseCard(drag.id, drag.from);
  };
}

/* Which box a card is sitting on, by its own centre rather than by overlap —
   a card is wider than the gap between two boxes, so any test based on
   touching would find two of them. */
function cvBoxUnder(cardEl){
  const cx = (parseFloat(cardEl.style.left) || 0) + cardEl.offsetWidth / 2;
  const cy = (parseFloat(cardEl.style.top) || 0) + cardEl.offsetHeight / 2;
  const boxes = state.canvas.boxes || {};
  const hit = Object.keys(boxes).filter(key => {
    const r = boxes[key];
    return r && cx >= r.x && cx <= r.x + r.width && cy >= r.y && cy <= r.y + r.height;
  });
  // Boxes should not overlap, but if two do, the smaller one is the one the
  // eye reads as containing the card.
  hit.sort((a, b) => (boxes[a].width * boxes[a].height) - (boxes[b].width * boxes[b].height));
  return hit[0] || null;
}

function cvRecord(cardEl){
  const id = cardEl.dataset.session;
  const held = state.canvas.cards[id] || {};
  state.canvas.cards[id] = {
    x: parseFloat(cardEl.style.left) || 0,
    y: parseFloat(cardEl.style.top) || 0,
    z: held.z || 1
  };
}

/* ---- Straightening the canvas back out ----
   Everything else here places a thing once and then leaves it alone:
   layoutCanvas only deals out a card the first time it sees one, and a
   position dragged by hand is kept forever. That is right until a few dozen
   drags have piled boxes and cards on top of each other, at which point
   there is nothing to undo it with. This is that one control.

   It is the same behaviour as tidyCanvas() in ai_canvas, and the same
   ordering decision: blocks are sorted by where they already sit, top-left
   down, so this straightens the desk rather than reshuffling it into an order
   nobody arranged. Sorting by task name or by date would be a different
   feature and would throw away the arrangement it is meant to rescue.

   A box moves with its cards, so a group is one block and only cards outside
   every box are blocks of their own. */
const TIDY_GAP = 40, TIDY_MARGIN = 60;

/* Read off the DOM rather than out of state.canvas, for the reason ai_canvas
   measures too: a box grows to cover what is in it, so the rectangle actually
   drawn is the true one and the stored rect is only the floor it was asked
   for. */
function cvRectOf(el){
  return { x: el.offsetLeft, y: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
}
function cvBlocks(host){
  const blocks = [];
  const boxed = new Set();
  const cards = [...host.querySelectorAll('.cvcard')];
  host.querySelectorAll('.cvbox').forEach(el => {
    const key = el.dataset.box;
    boxed.add(key);
    blocks.push({
      kind: 'box', key: key, rect: cvRectOf(el),
      members: cards.filter(c => c.dataset.owner === key).map(c => ({
        id: c.dataset.session,
        geometry: Object.assign(cvRectOf(c), { z: (state.canvas.cards[c.dataset.session] || {}).z || 1 })
      }))
    });
  });
  // Loose is "in no box on screen", not isLoose() on the key: a conversation
  // whose task has been archived out of todo.md still carries that task's
  // chat key and has no box to move with.
  cards.forEach(el => {
    if (boxed.has(el.dataset.owner)) return;
    blocks.push({ kind: 'card', id: el.dataset.session, rect: cvRectOf(el) });
  });
  return blocks;
}

function tidyCanvas(){
  const host = $('#canvas');
  const C = window.AICards;
  // A box and its cards move as one, which is shiftBox's whole job — the same
  // function the Electron canvas moves a group with. Without the engine there
  // is no arithmetic here to fall back on, and half a tidy is worse than none.
  if (!host || !C || state.locked) return;

  const blocks = cvBlocks(host);
  if (!blocks.length) return;
  blocks.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);

  // The row wraps at the width of the pane, not at the surface's own 4000px,
  // so what comes back fits the window it was tidied in. The floor stops a
  // narrow window from putting every block on a row of its own.
  const rowWidth = Math.max(720, host.clientWidth - TIDY_MARGIN * 2);
  let x = TIDY_MARGIN, y = TIDY_MARGIN, rowHeight = 0;

  blocks.forEach(block => {
    if (x > TIDY_MARGIN && x + block.rect.width > TIDY_MARGIN + rowWidth) {
      x = TIDY_MARGIN;
      y += rowHeight + TIDY_GAP;
      rowHeight = 0;
    }
    const dx = x - block.rect.x, dy = y - block.rect.y;
    // Only what needs to move is written, so a block already in its place
    // keeps the exact numbers it had rather than being rounded through this.
    if (dx || dy) {
      if (block.kind === 'card') {
        const held = state.canvas.cards[block.id] || {};
        state.canvas.cards[block.id] =
          { x: block.rect.x + dx, y: block.rect.y + dy, z: held.z || 1 };
      } else {
        const moved = C.shiftBox(state.canvas.boxes[block.key] || block.rect, block.members, dx, dy);
        state.canvas.boxes[block.key] = moved.rect;
        moved.cards.forEach(c => {
          state.canvas.cards[c.id] = { x: c.geometry.x, y: c.geometry.y, z: c.geometry.z || 1 };
        });
      }
    }
    x += block.rect.width + TIDY_GAP;
    rowHeight = Math.max(rowHeight, block.rect.height);
  });

  saveCanvas();
  renderCanvas();
}

/* ---- Filing a card by dropping it ----
   The third way to file a conversation, alongside starting one from a task and
   attaching one from the terminal. All three end in the same place: a row in
   sessions.json under the task's key.

   The one write to todo.md in the whole canvas is here — a task that has never
   had a conversation gets a `chat:` key minted on its line, exactly as
   starting a chat from its drawer would. It goes through markDirty and the
   ordinary autosave rather than round the side of it. */
async function adoptCard(sessionId, fromKey, toKey){
  const task = tasksByChatKey()[toKey];
  if (!task) return;
  await cvAssign(fromKey, sessionId, toKey);
}

/* Taking a card out of every box. The conversation keeps its transcript and
   its history and stops being filed against the work — which is what you want
   when it wandered off the task it started on. It gets a loose key of its own
   rather than being left under the task's, so the box it came out of stops
   counting it. */
async function releaseCard(sessionId, fromKey){
  await cvAssign(fromKey, sessionId, LOOSE_PREFIX + chat.newOwnerKey());
}

/* ---- Taking a conversation off the board ----
   The same thing the × on a drawer row does, and worth being exact about what
   it is: the row leaves sessions.json, so the board stops listing the
   conversation, and Claude Code's transcript is left exactly where it is. The
   conversation is not deleted, it is unfiled — `claude --resume <id>` still
   opens it, and Claude Desktop still imports it.

   Which is why the wording asks about the board rather than about the
   conversation. "Delete this chat?" would be a promise this cannot keep: the
   file belongs to Claude Code and nothing here should be reaching into it.

   It is still a confirm. Nothing on the board undoes it, and putting a
   conversation back means finding the id again. */
async function closeCard(ownerKey, sessionId){
  const rows = state.chats[ownerKey] || [];
  const row = rows.find(r => r.id === sessionId);
  const label = (row && row.title) || 'this conversation';
  if (!confirm('Take “' + label + '” off the board?\n\n' +
               'It stops being listed here. The transcript stays on disk, so ' +
               'the conversation can still be resumed in Claude Code or opened ' +
               'in Claude Desktop.')) return;

  await chat.forget(ownerKey, sessionId);
  // Its place on the canvas goes with it. Leaving the geometry behind would
  // quietly re-place the card at its old spot if the same session were ever
  // filed again, which is a surprise nobody asked for.
  delete state.canvas.cards[sessionId];
  delete state.canvas.viewed[sessionId];
  saveCanvas();
  await chat.loadSessions();
  renderCanvas();
}

/* The one write onSend's line-deletion above cannot make itself: by the time
   a run's session id exists, the send that started it is long past. Fire and
   forget, the same as saveCanvas() — a session that never gets its prompt
   recorded (server unreachable, tab closed mid-run) has simply lost a nicety,
   not the conversation, which is why nothing here waits on or retries it. */
function notePrompt(ownerKey, sessionId, raw){
  postJSON('/claude/note', { owner: ownerKey, session: sessionId, prompt: raw }).catch(() => {});
}

async function cvAssign(fromKey, sessionId, toKey){
  try {
    await postJSON('/claude/assign', { owner: fromKey, session: sessionId, to: toKey });
  } catch (err) { return; }
  await chat.loadSessions();
  renderCanvas();
}

/* The prompt's own row. Ask starts a conversation on the task; the link is
   still there for the times the web app is what you wanted. */
function claudeActions(text, taskId, raw){
  if (!claudeOn() || !taskId) return claudeLink(text);
  return '<button type="button" class="askclaude" data-task="' + esc(taskId) + '"' +
    ' data-ask="' + esc(text) + '"' +
    (raw ? ' data-raw="' + esc(raw) + '"' : '') +
    ' title="Starts a chat on this task with the prompt ready to send, running in ' +
    esc(chat.home()) + '">Ask Claude</button>' + claudeLink(text);
}

/* Every Jira note on a task, its sub-steps included. The card marker and the
   panel section both need this, and a task's tickets can sit at either depth. */
function jiraNotes(t){
  const parts = splitBody(t);
  const out = readJiraRun(parts.notes, '');
  parts.steps.forEach(s => out.push.apply(out, readJiraRun(s.notes, s.clean)));
  return out;
}

/* ---- Raising a Jira ticket ----
   Same idea as the Claude link, and the same limit: the URL fills the create
   form in, it does not create anything. CreateIssueDetails!init.jspa opens the
   dialog with the fields already set and waits for Create to be pressed, which
   is the only version of this worth having — a link that raised a ticket on
   somebody's board from a click would be a link nobody could safely put on a
   card.

   Jira wants numeric ids rather than keys, so pid and issuetype come out of
   data/jira.json rather than being written on the task. reporter is per board
   on purpose: DSYS refuses to create without one, and WADE refuses to let it be
   set at all, so one setting could not serve both. */
function jiraBoards(key){
  const cfg = state.jira;
  if (!cfg || !cfg.boards || !cfg.boards.length) return [];
  if (!key) return cfg.boards;
  return cfg.boards.filter(b => String(b.key || '').toUpperCase() === key);
}
function jiraHref(board, note){
  const cfg = state.jira;
  const q = ['pid=' + encodeURIComponent(board.pid),
             'issuetype=' + encodeURIComponent(board.issuetype)];
  if (board.setReporter && cfg.reporter) q.push('reporter=' + encodeURIComponent(cfg.reporter));
  q.push('summary=' + encodeURIComponent(note.summary));
  if (note.description) q.push('description=' + encodeURIComponent(note.description));
  return String(cfg.site).replace(/\/+$/, '') + '/secure/CreateIssueDetails!init.jspa?' + q.join('&');
}
/* Copy is drawn as an icon, not a label, and stays visible without a hover —
   the one action on a suggestion module worth reaching for on sight. Copied
   swaps in the tick for a moment; both are single-path SVGs, same convention
   as the icon buttons in the header. */
const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 16.17 4.83 12l-1.41 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
function copyBtn(attrs){
  return '<button type="button" class="copy" data-copy="' + esc(attrs.text) + '"' +
    (attrs.html ? ' data-copy-html="' + escAttr(attrs.html) + '"' : '') +
    ' aria-label="Copy" title="' + esc(attrs.title || 'Copy') + '">' + ICON_COPY + '</button>';
}

/* The buttons for one Jira note. A note naming a board nothing is configured
   for still renders, saying so — a note that quietly showed nothing would look
   the same as no note at all, and the summary is worth reading either way.
   That note stays outside .msgextra: it is information, not a control, so
   hiding it behind a hover would hide the reason nothing else is there to
   press. opts.where and opts.dismiss are the same two the drawer already
   needed — see messageHTML just below, which takes them for the same reason. */
function jiraHTML(note, opts){
  opts = opts || {};
  const boards = jiraBoards(note.key);
  /* This is information, not a control, so it reads with the rest of the
     text rather than floating in the corner where a button would sit — it
     explains why nothing is there to press. */
  const noBoard = boards.length ? '' : '<em class="suggwhere draft">' +
    (state.jira ? 'no board configured as ' + esc(note.key) : 'no data/jira.json') + '</em>';
  const extra = (boards.length
    ? boards.map(b =>
        '<a class="tojira" href="' + jiraHref(b, note) + '" target="_blank" rel="noopener"' +
        ' title="Opens the Jira create form on ' + esc(b.name || b.key) + ', filled in and unsubmitted">' +
        'Raise in ' + esc(b.key) + '</a>').join('')
    : '') +
    (opts.dismiss ? dismissBtn(opts.dismiss, opts.dismissDesc) : '');
  return '<div class="msg jira">' +
    '<div class="msgtext">' +
      (opts.where ? '<em class="suggwhere">for: ' + esc(opts.where) + '</em>' : '') +
      mdInline(note.summary) +
      (note.description ? '<em class="jirabody">' + mdInline(note.description) + '</em>' : '') +
      noBoard +
    '</div>' +
    (extra ? '<div class="msgacts"><span class="msgextra">' + extra + '</span></div>' : '') +
  '</div>';
}
function dismissBtn(raw, descRaw){
  return '<button type="button" class="dismiss" data-dismiss="' + esc(raw) + '"' +
    (descRaw ? ' data-dismiss-desc="' + esc(descRaw) + '"' : '') +
    ' title="Remove this suggestion">Dismiss</button>';
}

/* A ready-to-send message, with a button that copies just the message text.
   opts.claude adds the hand-over link beside it. opts.where and opts.draft
   are the drawer's own: several of these can sit on one task there, each
   under its own sub-step, so each needs to say which one and whether it
   still wants editing before it goes — Overview never passes either, since
   one card there is already scoped to one task. opts.dismiss is the raw
   markdown line to remove; rendering the button at all is what turns
   dismissing on, so a caller with nowhere to persist a removal just omits it. */
function messageHTML(text, opts){
  opts = opts || {};
  // opts.dismiss is already the exact raw line, when there is one — the same
  // text a manual Dismiss removes is what "used up by being run" removes.
  const extra = (opts.claude ? claudeActions(text, opts.task, opts.dismiss) : '') +
    (opts.dismiss ? dismissBtn(opts.dismiss) : '');
  return '<div class="msg"><div class="msgtext">' +
      (opts.where ? '<em class="suggwhere">for: ' + esc(opts.where) + '</em>' : '') +
      (opts.draft ? '<em class="suggwhere draft">draft — read it before sending</em>' : '') +
      mdInline(text) +
    '</div>' +
    '<div class="msgacts">' + copyBtn({ text }) +
      (extra ? '<span class="msgextra">' + extra + '</span>' : '') +
    '</div></div>';
}
/* A message is one line, so it goes into a `data-copy` attribute as it stands.
   An agenda is several, and a newline inside an attribute survives the parser but
   only by accident of how it is written, so encode it and stop relying on that. */
function escAttr(s){ return esc(s).replace(/\n/g, '&#10;'); }

/* The agenda for a recurring meeting, shown as the thing it becomes once pasted:
   the meeting date as a title, then Agenda, then real nested bullets. Rendered as
   an actual <ul> rather than as styled indentation, so what is on screen and what
   lands in the document are the same shape rather than two designs of one list.

   `when` is the task's `[due:: ]`, which is the date of the occurrence this
   agenda is for. The block carries no date of its own — see AGENDA_NOTE.

   `opts.prev` renders it as last cycle's, quieter and titled differently, but it
   still carries its own Copy — see the comment on the button below for why.
   `opts.where` is the drawer's own, same reason as messageHTML's. */
function agendaHTML(ag, when, opts){
  opts = opts || {};
  const clip = agendaClipboard(ag, when);
  const title = opts.prev
    ? '<em class="suggwhere">last time' + (ag.date ? ', ' + esc(dueLabel(ag.date)) : '') + '</em>'
    : (when ? '<span class="agdate">' + esc(longDate(when)) + '</span>' : '');
  return '<div class="msg agenda' + (opts.prev ? ' prev' : '') + '">' +
    '<div class="msgtext">' +
      (opts.where ? '<em class="suggwhere">for: ' + esc(opts.where) + '</em>' : '') +
      title +
      '<span class="aglead">Agenda</span>' +
      '<ul class="aglist">' + ag.topics.map(t =>
        '<li>' + mdInline(t.title) +
        (t.context.length
          ? '<ul>' + t.context.map(c => '<li>' + mdInline(c) + '</li>').join('') + '</ul>'
          : '') +
        '</li>').join('') + '</ul>' +
    '</div>' +
    '<div class="msgacts">' +
      /* Last cycle's gets a Copy too, dated with the occurrence the card is
         pointing at now rather than the one it was written for. It reads
         oddly written down and is the right behaviour: the reason to copy a
         past agenda is that the meeting it belonged to was cancelled or
         moved, so what is wanted is those topics under the new date. */
      copyBtn({
        text: clip.text, html: clip.html,
        title: opts.prev
          ? 'Copies these topics under the date on the card now, for a meeting that moved'
          : 'Copies the title and the bullets. Pasted into Google Docs they stay real bullets, both levels'
      }) +
    '</div>' +
  '</div>';
}
/* ---- Context: standing facts, not tasks ----
   Who is away, whose contract runs out when, how names are spelt. It is the one
   part of the file that is not work and cannot be worked out from the tasks, so
   it is read straight out of the markdown rather than derived. Dates tagged
   on: or until: get a live countdown, since a leave date nobody is counting is
   how a plan ends up depending on somebody who is not there. */
const CTX_DATE = /`(on|until):(\d{4}-\d{2}-\d{2})`/;

function contextBlock(){
  const lines = state.doc.pre.concat(state.doc.post);
  let inside = false;
  const out = [];
  lines.forEach(l => {
    const h = /^##\s+(.*)$/.exec(l);
    if (h) { inside = /^context\b/i.test(h[1].trim()); return; }
    if (inside) out.push(l);
  });
  return out;
}

function contextSection(){
  const lines = contextBlock();
  if (!lines.length) return '';

  let html = '', group = '', items = [];
  // Grouped facts collapse behind their heading — a dozen `###` sections is
  // most of the column's length, and only one is usually the one being read.
  // Anything before the first heading has no title to collapse behind, so it
  // stays open, plain, the way it always has.
  const flush = () => {
    if (!items.length) return;
    html += group
      ? '<details class="ctxgroup"><summary>' + esc(group) + '</summary>' + items.join('') + '</details>'
      : items.join('');
    items = [];
  };

  lines.forEach(l => {
    const s = l.trim();
    if (!s || /^---+$/.test(s)) return;
    const h = /^###\s+(.*)$/.exec(s);
    if (h) { flush(); group = h[1]; return; }
    const b = /^[-*]\s+(.*)$/.exec(s);
    if (!b) return;

    const dm = CTX_DATE.exec(b[1]);
    let chip = '';
    if (dm) {
      const di = dueInfo(dm[2]);
      const past = di.days < 0;
      chip = '<span class="tag due ' + (past ? '' : di.cls) + '">' +
             (dm[1] === 'until' ? 'until ' : '') + esc(di.label) +
             ' · ' + (past ? Math.abs(di.days) + 'd ago' : 'in ' + di.days + 'd') + '</span>';
    }
    items.push('<article class="ref ctx">' +
      // Lifting the date out leaves "back on ." behind, so close the gap it left.
      '<div class="ctxtext">' + mdInline(
        b[1].replace(CTX_DATE, '').replace(/\s+([.,])/g, '$1').replace(/\s{2,}/g, ' ').trim()
      ) + '</div>' +
      (chip ? '<div class="meta">' + chip + '</div>' : '') +
    '</article>');
  });
  flush();
  return html;
}

/* The tabs, in reading order. Plans and Execution are the two agent boards and
   sit together: the first proposes, the second carries out, and a card crosses
   from one to the other when he accepts a plan. Each reference section is
   generated from the tags on the tasks, so nothing here can name a task that is
   not on the board.

   `group` marks the defs that share one tab: Board, Matrix and Timeline are the
   same tasks under three renderers, and three peers between separators spent a
   third of the strip on that. The registry stays flat — the ids, isKnownView(),
   the #matrix and #timeline fragments and syncHash() all carry on unchanged, and
   only renderViewTabs() (18-timeline.js) knows the three are offered as one. */
function viewDefs(){
  const defs = [
    { id:'overview', label:'Overview' },
    { id:'sep0', sep:true },
    { id:'board',    label:'Board',    group:'draw' },
    { id:'matrix',   label:'Matrix',   group:'draw' },
    { id:'timeline', label:'Timeline', group:'draw' },
    { id:'sep1', sep:true },
    { id:'plans',    label:'Plans' },
    { id:'execution', label:'Execution' },
    { id:'projects', label:'Projects' },
    { id:'sep2', sep:true }
  ];
  // Canvas only exists where there is an engine behind it. Same rule the Ask
  // Claude buttons follow: no CLI, no helper, or a host serving these files
  // statically, and the tab is simply not there rather than being there and
  // empty. It sits between Projects and Reports.
  // Hidden for now regardless of chatsOn — see IMPROVEMENTS.md.
  if (false && state.chatsOn && !state.locked) defs.push({ id:'canvas', label:'AI processes' });
  defs.push({ id:'reports', label:'Reports' });
  return defs;
}
/* Backups isn't a view of the board, it's a data operation — see the Backups
   button in the header's data menu — so it sits outside viewDefs() and its
   tabs, but it still needs a #backups URL and a renderView() case of its own. */
function isKnownView(id){
  // 'canvas' would normally be listed by hand rather than read off viewDefs(),
  // which only offers it once the engine has answered — a link is read before
  // that, and a refresh onto #canvas should land on the canvas rather than
  // falling back to the board for the half-second it takes /claude.json to
  // reply. Left out while the view is hidden — see IMPROVEMENTS.md.
  return id === 'backups' || viewDefs().some(d => d.id === id);
}

