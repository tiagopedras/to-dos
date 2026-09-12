'use strict';

/* =========================================================================
   2c. Columns — the states every task moves through inside a bucket.

   These are not stored as a list of their own: they are the `###` headings
   already sitting inside the buckets, read off by allTiers()/boardColumns()
   above, which unions them by scanning the buckets in order and remembering
   each name the first time it turns up. That scan is why every edit below
   ends by calling syncTierShapes() rather than touching only the buckets a
   column happens to already be in: a column that only exists in one bucket
   — Design System's Blocked, say — cannot be reordered relative to the
   others just by moving it around inside that one bucket, because nothing
   about its position there is visible to a scan that never gets past the
   earlier buckets' own tiers first. Giving every bucket the same set closes
   that blind spot, and costs nothing on screen: the board already draws
   Blocked as a column on every bucket's view, empty wherever that bucket has
   no tasks in it, whether or not that bucket's file section mentions the
   heading at all. See syncTierShapes for the rest of this.
   ========================================================================= */

/* Left to right, the way the board actually draws them, with Done and Handed
   to AI left off — neither is ever a heading: Done is where a ticked task
   lands regardless of which column it sits under, and Handed to AI is where
   an ai:full task lands regardless of which column it sits under. */
function tierOrder(){ return boardColumns().filter(n => n !== DONE_COL && n !== AI_COL); }

function tierTaskCount(name){
  return state.doc.buckets.reduce((sum, b) => {
    const t = b.tiers.find(x => x.name === name);
    return sum + (t ? t.tasks.length : 0);
  }, 0);
}

/* Returns the name already taken, so the complaint can quote it back rather
   than just the one just typed. Done and Handed to AI included: a real
   column with either name would sit behind its synthetic namesake and never
   be reachable. */
function tierNameTaken(name, except){
  const k = name.toLowerCase();
  if (k === DONE_COL.toLowerCase() && name !== except) return DONE_COL;
  if (k === AI_COL.toLowerCase() && name !== except) return AI_COL;
  return tierOrder().find(n => n !== except && n.toLowerCase() === k) || null;
}

function cleanTierName(name){ return String(name).replace(/\s+/g, ' ').trim(); }

/* Makes every bucket carry exactly this set of columns, in this order —
   inventing an empty one wherever a bucket does not already have it. That
   sounds bigger than it is: the board already shows every column somewhere
   like Design System's Blocked in every bucket's view whether or not that
   bucket's own file section mentions it (boardColumns() is global, see
   above), so this changes nothing anyone sees on screen. What it fixes is
   allTiers() itself — its order is read off by scanning buckets in turn and
   remembering each name the first time it appears, which means a column
   missing from an early bucket can never be reordered relative to the
   others: nothing about where it sits inside the one bucket that does have
   it is visible to that scan. Every bucket agreeing on the full set removes
   the blind spot, so reordering, adding and deleting all do this rather than
   only touching the buckets a column already happened to be in. */
function syncTierShapes(order){
  const fileOrder = order.slice().reverse();   // boardColumns() reverses allTiers()
  state.doc.buckets.forEach(b => {
    const byName = {};
    b.tiers.forEach(t => { byName[t.name] = t; });
    b.tiers = fileOrder.map(name => byName[name] || { name, raw: null, lead: [''], tasks: [], tail: [''] });
  });
}

function renameTier(oldName, newName){
  const clean = cleanTierName(newName);
  if (!clean) return 'A column needs a name.';
  if (clean === oldName) return '';
  // Backlog, To do, Doing, Waiting review and Done are matched by this exact
  // text all through the board (rollRecurring, ensureTier, the status
  // filter's synthetic columns) — renaming one away doesn't fail gracefully
  // the way an ordinary tier does, it leaves a second, empty column of the
  // old name behind. See RESERVED_TIERS in 02-state.js.
  if (RESERVED_TIERS.indexOf(oldName) > -1) return '“' + oldName + '” can’t be renamed — the board depends on that exact name.';
  const clash = tierNameTaken(clean, oldName);
  if (clash) return 'There is already a column called “' + clash + '”.';
  state.doc.buckets.forEach(b => {
    const t = b.tiers.find(x => x.name === oldName);
    if (t) { t.name = clean; t.raw = null; }
  });
  if (oldName in state.sort) { state.sort[clean] = state.sort[oldName]; delete state.sort[oldName]; }
  markDirty(); refreshView();
  return '';
}

function addTier(name){
  const clean = cleanTierName(name);
  if (!clean) return 'A column needs a name.';
  const clash = tierNameTaken(clean, null);
  if (clash) return 'There is already a column called “' + clash + '”.';
  const order = tierOrder();
  order.push(clean);
  syncTierShapes(order);
  markDirty(); refreshView();
  return '';
}

function moveTier(name, dir){
  const order = tierOrder();
  const i = order.indexOf(name), j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return;
  order.splice(i, 1);
  order.splice(j, 0, name);
  syncTierShapes(order);
  markDirty(); refreshView();
}

/* A column with tasks in it can only go once they have somewhere to land —
   the same rule deleteBucket already enforces, applied once per bucket that
   has this column, since its tasks can be spread across every one of them.
   The sync afterwards drops it everywhere at once, rather than leaving it
   behind in whichever buckets happened to have no tasks in it to trigger
   the check above. */
function deleteTier(name, dest){
  const order = tierOrder();
  if (order.length < 2) return;
  const n = tierTaskCount(name);
  if (n && !dest) return;
  if (n) state.doc.buckets.forEach(b => {
    const t = b.tiers.find(x => x.name === name);
    if (t && t.tasks.length) t.tasks.forEach(task => ensureTier(b, dest).tasks.push(task));
  });
  syncTierShapes(order.filter(x => x !== name));
  delete state.sort[name];
  markDirty(); refreshView();
}

/* Two different questions, so two different sheets — same split as deleting a
   bucket, and for the same reason: empty, a column just goes; holding work,
   the only safe delete is a move, so it asks where to first. Returns a
   complaint rather than opening either sheet when the column is one of the
   five the board matches by name: deleting one is the same failure renameTier
   refuses and a worse one, so it has to be refused before the confirm rather
   than by offering a destination for a column that must not go. */
function confirmDeleteTier(name, back){
  if (RESERVED_TIERS.indexOf(name) > -1) return '“' + name + '” can’t be deleted — the board depends on that exact name.';
  const n = tierTaskCount(name);
  confirmDeleteHeading({
    title: 'Delete “' + name + '”?',
    count: n,
    emptyBody: 'Nothing is in it, in any bucket. The heading goes wherever it appears, and none of it ' +
      'reaches the file until you save.',
    moveBody: 'It still holds ' + n + ' task' + (n === 1 ? '' : 's') + ', across every bucket that has it, ' +
      'finished ones included. They move rather than go — each one keeps its bucket, its text ' +
      'and its tags, and lands in the column you pick here.',
    options: tierOrder().filter(x => x !== name),
    optionLabel: x => x,
    selectId: 'tierDest',
    onDelete: dest => deleteTier(name, dest),
    back
  });
  return '';
}

/* One sheet holding every column, same reasoning as the bucket editor: the
   questions are comparative — is this the right name next to the others, is
   this the right order — and a per-column menu could not show that. */
function openTierEditor(){
  if (state.locked || !state.doc) return;
  closeDrawer();

  const setErr = msg => { const el = modalEl && modalEl.querySelector('.bkerr'); if (el) el.textContent = msg; };

  const draw = () => {
    const order = tierOrder();
    const rows = order.map((name, i) => {
      const n = tierTaskCount(name);
      /* The five reserved names are refused by renameTier anyway, but refusing
         a rename after it has been typed leaves the typed text sitting in the
         field while the column keeps its real name — a field showing a name
         nothing on the board has. So the rule goes on the field: there is
         nothing to reject, and the reason is on the field that carries it. */
      const fixed = RESERVED_TIERS.indexOf(name) > -1;
      return '<div class="bkrow">' +
        '<input type="text" data-tiername="' + i + '" value="' + esc(name) + '" aria-label="Column name"' +
          (fixed ? ' disabled title="' + esc('The board matches “' + name + '” by this exact text, so it can’t be renamed.') + '"' : '') + '>' +
        '<span class="bkn" title="tasks in it, across every bucket, finished ones included">' + n + '</span>' +
        moveDeleteButtonsHTML(i, order.length, {
          upAttr: 'data-tierback', downAttr: 'data-tierfwd', delAttr: 'data-tierdel',
          upTitle: 'Move up (left on the board)', downTitle: 'Move down (right on the board)', noun: 'column'
        }) +
      '</div>';
    }).join('');

    showModal('Columns',
      'The states every task moves through inside a bucket, left to right on the board. Every bucket ' +
      'shows every column, whether or not its own section has tasks in it, so a rename, reorder, add ' +
      'or delete here reaches every bucket the same way. Done sits fixed at the far right and is not ' +
      'listed here, since it is never a heading, just where a ticked task lands. Nothing reaches the ' +
      'file until you save.',
      '<div class="bklist">' + rows + '</div>' +
      '<div class="bkadd">' +
        '<input type="text" id="tierNew" placeholder="New column name" aria-label="New column name">' +
        '<button class="btn" id="tierAdd">Add column</button>' +
      '</div>' +
      '<p class="bkerr" role="status"></p>',
      [{ label: 'Done', primary: true }]);
    wire();
  };

  const wire = () => {
    const order = tierOrder();
    modalEl.querySelectorAll('input[data-tiername]').forEach(inp => {
      const i = +inp.dataset.tiername;
      const apply = () => {
        const msg = renameTier(order[i], inp.value);
        if (msg) { setErr(msg); }
        else { setErr(''); order[i] = cleanTierName(inp.value); inp.value = order[i]; }
      };
      inp.onchange = apply;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };
    });
    modalEl.querySelectorAll('[data-tierback]').forEach(el => {
      el.onclick = () => { moveTier(order[+el.dataset.tierback], -1); draw(); };
    });
    modalEl.querySelectorAll('[data-tierfwd]').forEach(el => {
      el.onclick = () => { moveTier(order[+el.dataset.tierfwd], 1); draw(); };
    });
    modalEl.querySelectorAll('[data-tierdel]').forEach(el => {
      el.onclick = () => {
        const msg = confirmDeleteTier(order[+el.dataset.tierdel], draw);
        setErr(msg);
      };
    });
    const add = () => {
      const inp = modalEl.querySelector('#tierNew');
      const msg = addTier(inp.value);
      if (msg) setErr(msg); else draw();
    };
    modalEl.querySelector('#tierAdd').onclick = add;
    modalEl.querySelector('#tierNew').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  };

  draw();
}

/* opts.static drops the drag and focus attributes. The matrix hover preview is
   the same card, but it is a picture of one rather than one you can act on, so
   it must not be draggable or land in the tab order.

   opts.tier is the task's real column name, used only to fade the card by its
   own status (done/waiting/blocked/backlog — see board.css) rather than by
   which DOM section happens to be rendering it. Pass it whether or not the
   card is done: t.done wins regardless. */
function cardHTML(t, color, bucketLabel, opts){
  opts = opts || {};
  const subs = subSteps(t);
  const doneSubs = subs.filter(s => s.done).length;
  const di = dueInfo(t.due, opts.muted);
  const notes = noteLines(t);

  let meta = '';
  /* The card sitting in its own column is the same task as the one pinned in
     the headline bar, and used to give no sign of that — open two tabs and
     they read as two different tasks. The ring round the card and the tag
     both point back at the bar rather than duplicating it. */
  if (t.headline) meta += '<span class="tag onething" title="This is the headline — pinned at the top as the one thing">the one thing</span>';
  /* First, because it says which piece of work this belongs to, and that frames
     everything after it. Clicking it opens the project rather than the card —
     see the capture-phase handler on [data-project]. */
  const proj = taskProject(t);
  if (proj) meta += '<span class="tag proj" data-project="' + esc(proj) + '" title="' +
    esc('Everything on ' + proj) + '">' + esc(proj) + '</span>';
  // Says it once, on the card, rather than leaving a gap that reads as "low".
  if (unscored(t) && !t.done) meta += '<span class="tag needsscore">needs scoring</span>';
  if (t.impact) meta += '<span class="tag impact-' + esc(t.impact) + '" title="' + esc(t.impact) + ' impact">' + (IMPACT_EMOJI[t.impact] || esc(t.impact)) + '</span>';
  if (t.effort) meta += '<span class="tag">' + esc(t.effort) + '</span>';
  const si = startInfo(t.start);
  if (si) meta += '<span class="tag startdate">' + esc(si.label) + ' · ' + esc(si.note) + '</span>';
  if (t.ai && t.ai !== 'none') meta += '<span class="tag ai ai-' + esc(t.ai) + '" title="' + esc(t.ai) + ' AI help">ai</span>';
  if (t.to && t.to.trim()) meta += '<span class="tag who" title="Delegated to ' +
    esc(t.to.trim()) + '">\u2192 ' + esc(t.to.trim()) + '</span>';
  /* A ticket waiting to be raised is a fact about the task worth seeing in the
     column, but the button belongs where there is room for it — the task panel
     and the reference cards. So the card gets the marker and not the link. */
  const tickets = jiraNotes(t);
  if (tickets.length && !t.done) {
    tickets.forEach(n => { meta += '<span class="tag jira">' + esc(n.key ? n.key + ' ticket' : 'ticket') + '</span>'; });
  }
  /* How often the task comes round, and nothing about whether it is prepared.
     There is no "agenda ready" chip on purpose: on a recurring task the tick
     already says that. The card is the prep — tick it when the agenda is
     written, and it leaves Quick wins and sits in Done until the meeting has
     passed and the board rolls it onto the next date. A chip saying the same
     thing a second way is a second thing to keep in step. */
  const rep = readRepeat(t.repeat);
  if (rep) meta += '<span class="tag repeat" title="Recurring ' + esc(rep.label) +
    '. The board moves the date on once this one has passed.">' + esc(rep.label) + '</span>';
  // Urgent and due are the "look at this now" signals, so they get their own
  // corner rather than sitting in the wrap with everything else.
  let metaWhen = '';
  if (t.urgent) metaWhen += '<span class="tag urgent">urgent</span>';
  if (di) metaWhen += '<span class="tag due ' + di.cls + '">' + esc(di.label) + (di.note ? ' · ' + esc(di.note) : '') + '</span>';
  if (metaWhen) meta += '<span class="meta-when">' + metaWhen + '</span>';

  let prog = '';
  if (subs.length) {
    const pct = Math.round(doneSubs / subs.length * 100);
    prog = '<div class="prog"><span>' + doneSubs + '/' + subs.length + ' steps</span>' +
           '<span class="bar"><i style="width:' + pct + '%"></i></span></div>';
  } else if (notes) {
    prog = '<div class="notecount">' + notes + ' note' + (notes > 1 ? 's' : '') + '</div>';
  }

  const statusClass = t.done ? ' done' :
    opts.tier === WAIT_COL ? ' waiting' :
    opts.tier === BLOCKED_TIER ? ' blocked' :
    opts.tier === BACKLOG_TIER ? ' backlog' : '';

  return '<article class="card' + statusClass + (t.headline ? ' onething' : '') + '"' +
    (opts.static ? '' : ' tabindex="0" role="button"' + (opts.noDrag ? '' : ' draggable="true"')) +
    ' data-id="' + t.id + '" style="--bc:' + color + '">' +
    (bucketLabel ? '<div class="row1"><span class="bucket">' + esc(bucketLabel) + '</span></div>' : '') +
    '<div class="title">' + mdInline(t.title) + '</div>' +
    (meta ? '<div class="meta">' + meta + '</div>' : '') +
    prog +
  '</article>';
}


/* =========================================================================
   One column, three views.

   The Board, the Plans view and the Execution view all draw their columns
   through here, so a column is the same object wherever it appears: one fill,
   one border, one radius, one header padding, one body padding, one gap. What
   differs is which of the optional parts the head carries and what goes in
   the body — the same booleans the Figma `Column` component has, since the
   design file and this function are the two halves of one decision.

   Until 12 Sep 2026 the three views drew three different things. The board had
   `.col` with padding 0 and a divider under its heading; Plans and Execution
   had `.listcard` with padding 14/16/16, no divider, and their lead paragraph
   as the first thing inside the body rather than part of the head. The board's
   shape won because it is the denser and more-used surface: six columns and
   thirty-odd cards against four columns of prose.

     title    what the column is called                       (required)
     hint     the subtitle beside it — off on the board since the same date,
              where the six names carry their own meaning and the subtitles
              were saying it twice
     sort     the sort button, already built by the caller
     count    how many are in it
     action   a button belonging to this column (Run now, Spend and clocks)
     filters  a dropdown narrowing what the column shows
     desc     a sentence saying what the column is for — Plans carries one on
              every column, the board none
     body     the column's contents
     cls      extra classes on the column, attrs extra attributes
     bodyCls / bodyAttrs the same for the body, which is where the board hangs
              its drop zone and Plans hangs the id each renderer writes into
     footer   below the body, outside it — the board's + Add task
     heading  h2 or h3; the board's columns are the page's own sections and
              Plans' sit inside a view, and that is the only reason the tag
              differs. Nothing is styled off it.
   ========================================================================= */
function colHTML(o){
  o = o || {};
  const tag = o.heading === 'h3' ? 'h3' : 'h2';
  // Callers build these by concatenating optional words, so an empty or
  // half-empty run of them is normal and must not reach the attribute.
  const cls = (o.cls || '').trim().replace(/\s+/g, ' ');
  const bodyCls = (o.bodyCls || '').trim().replace(/\s+/g, ' ');
  const head =
    '<div class="colhead">' +
      '<div class="colhead-row">' +
        '<' + tag + '>' + esc(o.title) +
          (o.hint ? ' <span class="hint">' + esc(o.hint) + '</span>' : '') +
        '</' + tag + '>' +
        (o.sort || '') +
        (o.action ? '<span class="colact">' + o.action + '</span>' : '') +
        (o.filters ? '<span class="colact">' + o.filters + '</span>' : '') +
        (o.count != null ? '<span class="count">' + o.count + '</span>' : '') +
      '</div>' +
      (o.desc ? '<p class="colhead-desc">' + o.desc + '</p>' : '') +
    '</div>';
  return '<section class="col' + (cls ? ' ' + cls : '') + '"' +
      (o.attrs ? ' ' + o.attrs : '') + '>' +
    head +
    '<div class="colbody' + (bodyCls ? ' ' + bodyCls : '') + '"' +
      (o.bodyAttrs ? ' ' + o.bodyAttrs : '') + '>' + (o.body || '') + '</div>' +
    (o.footer || '') +
  '</section>';
}

/* The empty state a column falls back to, named once rather than written out
   at each of the eight places that needed it. Two styles and no third: plain
   grey text on the board, and a dashed box on Plans and Execution, where a
   column of prose with one line of grey text in it read as a column that had
   failed to load rather than one with nothing in it. */
function colEmptyHTML(message, style){
  return '<div class="empty' + (style === 'boxed' ? ' boxed' : '') + '">' +
    message + '</div>';
}

/* Shutting whichever column filter is open. One delegated handler rather than
   one per panel, because the panels are rebuilt on every render and anything
   bound to them directly would need rebinding right after — the same
   arrangement the Status filter's own dropdown uses in 07-render-board.js. The
   opening half is wired per column by its renderer, since that is where the
   setter for the filter lives. */
document.addEventListener('click', e => {
  const inside = e.target.closest('.colfilter');
  document.querySelectorAll('.colfilter').forEach(wrap => {
    if (wrap === inside) return;
    const panel = wrap.querySelector('.dropdown-panel');
    const btn = wrap.querySelector('.colfilter-btn');
    if (panel && !panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
});
