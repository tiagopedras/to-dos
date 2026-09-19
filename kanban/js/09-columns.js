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

/* What a column is called on screen, which is not always its heading.

   The five in RESERVED_TIERS are matched by their exact text here and in every
   other reader of the list, so renameTier() refuses them. A label is the way
   round that for the one thing a rename was usually wanted for: the `### To do`
   heading in todo.md stays as it is, and the board draws this instead. Nothing
   outside the board sees it — the companion, the planning agent and every plan
   still say "To do" — which is the cost of it being free of the file format.

   Every other column can be renamed for real, so it has no use for a label and
   the editor never sets one. Read it everywhere a column name is shown to him
   and nowhere a column is matched, looked up or saved. */
function tierLabel(name){
  return (state.columnNames && state.columnNames[name]) || name;
}

/* The one write a label makes — straight to column-names.json, independent of
   Done and of todo.md entirely, the same bargain setBucketColor() makes. A
   label equal to the heading is not stored: typing the real name back is how
   you clear one, and an entry saying "To do" is called "To do" is noise in a
   file read by eye. */
async function setTierLabel(name, label){
  const clean = cleanTierName(label);
  if (!clean) return 'A column needs a name.';
  const clash = tierOrder().concat([DONE_COL, AI_COL])
    .find(n => n !== name && tierLabel(n).toLowerCase() === clean.toLowerCase());
  if (clash) return 'There is already a column called “' + clean + '”.';
  if (!state.columnNames) state.columnNames = {};
  if (clean === name) delete state.columnNames[name];
  else state.columnNames[name] = clean;
  refreshView();
  try {
    await postJSON('/column-names', state.columnNames);
  } catch (err) {
    showToast('Could not save that name: ' + (err.message || err), 'bad');
  }
  return '';
}

/* Loaded once alongside the other per-dataset side files (see boot.js). A
   server too old to know the route, or a first run with no file yet, leaves
   every column showing its own heading, which is what it always did. */
async function loadColumnNames(){
  try {
    state.columnNames = await getJSON('/column-names.json');
  } catch (err) {
    state.columnNames = {};
  }
  if (state.doc) refreshView();
}

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
  // Backlog, To do, Doing, Waiting for review and Done are matched by this exact
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
/* `focusOn` is the heading of the column whose pencil was clicked, if it came
   from one. The sheet is still the whole list — that is the point of it — and
   this only puts the caret in the row he asked about. */
function openTierEditor(focusOn){
  if (state.locked || !state.doc) return;
  closeDrawer();

  const setErr = msg => { const el = modalEl && modalEl.querySelector('.bkerr'); if (el) el.textContent = msg; };

  const draw = () => {
    const order = tierOrder();
    const rows = order.map((name, i) => {
      const n = tierTaskCount(name);
      /* The five reserved names are refused by renameTier, and this field used
         to be disabled for them, because refusing a rename after it has been
         typed leaves the typed text sitting in a field while the column keeps
         its real name. The field is live for all of them now and what it
         writes is what differs: an ordinary column is renamed in todo.md, one
         of the five keeps its heading and gets a label drawn over it. Either
         way the field means the same thing — what this column is called on
         screen — which is what he was reaching for in both cases. */
      const fixed = RESERVED_TIERS.indexOf(name) > -1;
      return '<div class="bkrow">' +
        '<input type="text" data-tiername="' + i + '" value="' + esc(tierLabel(name)) + '" aria-label="Column name"' +
          (fixed ? ' title="' + esc('Everything that reads the list matches “' + name + '” by this exact text, so the heading in todo.md stays as it is and this changes only what you see on the board.') + '"' : '') + '>' +
          (fixed && tierLabel(name) !== name
            ? '<span class="bkwas" title="the heading in todo.md, left as it is">' + esc(name) + '</span>' : '') +
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
      'listed here, since it is never a heading, just where a ticked task lands. Five of these names are ' +
      'matched by their exact text by everything else that reads the list, so renaming one of those changes ' +
      'what you see here and leaves its heading in the file alone — the grey word beside it is the heading ' +
      'it still has. Nothing reaches the file until you save.',
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
      /* Two writes behind one field. A reserved column keeps its heading and
         takes a label; every other one is renamed for real, which is why
         `order` is only updated in that branch — a label does not move the
         column that the rest of this sheet is keyed by. */
      const apply = () => {
        if (RESERVED_TIERS.indexOf(order[i]) > -1) {
          setTierLabel(order[i], inp.value).then(msg => {
            if (msg) { setErr(msg); inp.value = tierLabel(order[i]); }
            else { setErr(''); draw(); }
          });
          return;
        }
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
    // Only on the way in, not after every redraw: a reorder or a rename would
    // otherwise pull the caret back to the row it started on.
    if (focusOn != null) {
      const i = order.indexOf(focusOn);
      const inp = i > -1 && modalEl.querySelector('input[data-tiername="' + i + '"]');
      if (inp) { inp.focus(); inp.select(); }
      focusOn = null;
    }
  };

  draw();
}

/* Everything a task card says, as data. opts.tier is the task's real column
   name, used only to fade the card by its own status (done/waiting/blocked/
   backlog — see board.css) rather than by which DOM section happens to be
   rendering it. Pass it whether or not the card is done: t.done wins
   regardless. */
function cardModel(t, opts){
  opts = opts || {};
  const subs = subSteps(t);
  const doneSubs = subs.filter(s => s.done).length;
  const di = dueInfo(t.due, opts.muted);
  const notes = noteLines(t);

  /* What is on the card, as data. Two things draw it: cardHTML() below, as a
     string, for the matrix's hover preview, and TaskCard (kanban/ui/TaskCard.tsx)
     for the board. Deciding which chips a task earns lives here once, so the two
     cannot disagree about it. A chip is { cls, text, title?, project? }. */
  const chips = [];
  /* The card sitting in its own column is the same task as the one pinned in
     the headline bar, and used to give no sign of that — open two tabs and
     they read as two different tasks. The ring round the card and the tag
     both point back at the bar rather than duplicating it. */
  if (t.headline) chips.push({ cls: 'tag onething', text: 'the one thing',
    title: 'This is the headline — pinned at the top as the one thing' });
  /* First, because it says which piece of work this belongs to, and that frames
     everything after it. Clicking it opens the project rather than the card —
     see the capture-phase handler on [data-project]. */
  const proj = taskProject(t);
  if (proj) chips.push({ cls: 'tag proj', text: proj, project: proj, title: 'Everything on ' + proj });
  // Says it once, on the card, rather than leaving a gap that reads as "low".
  if (unscored(t) && !t.done) chips.push({ cls: 'tag needsscore', text: 'needs scoring' });
  /* A cancellation is a tick plus a tag (CONVENTIONS.md, Cancelling a task), so
     on the board it is an ordinary done card wearing one more chip rather than
     a state of its own — the same shape every other tag already renders as. It
     sits here rather than with the dates because it answers "was this done",
     which is the first thing to know about a ticked card. */
  if (t.done && t.cancelled) chips.push({ cls: 'tag cancelled', text: 'cancelled',
    title: 'Decided against on ' + t.cancelled + ' — not counted as finished work' });
  if (t.done && t.archived) chips.push({ cls: 'tag cancelled', text: 'archived',
    title: 'No longer relevant, ' + t.archived + ' — not counted as finished work' });
  if (t.impact) chips.push({ cls: 'tag impact-' + t.impact, text: IMPACT_EMOJI[t.impact] || t.impact,
    title: t.impact + ' impact' });
  if (t.effort) chips.push({ cls: 'tag', text: t.effort });
  const si = startInfo(t.start);
  if (si) chips.push({ cls: 'tag startdate', text: si.label + ' · ' + si.note });
  if (t.ai && t.ai !== 'none') chips.push({ cls: 'tag ai ai-' + t.ai, text: 'ai', title: t.ai + ' AI help' });
  if (t.to && t.to.trim()) chips.push({ cls: 'tag who', text: '→ ' + t.to.trim(),
    title: 'Delegated to ' + t.to.trim() });
  /* A ticket waiting to be raised is a fact about the task worth seeing in the
     column, but the button belongs where there is room for it — the task panel
     and the reference cards. So the card gets the marker and not the link. */
  const tickets = jiraNotes(t);
  if (tickets.length && !t.done) {
    tickets.forEach(n => chips.push({ cls: 'tag jira', text: n.key ? n.key + ' ticket' : 'ticket' }));
  }
  /* How often the task comes round, and nothing about whether it is prepared.
     There is no "agenda ready" chip on purpose: on a recurring task the tick
     already says that. The card is the prep — tick it when the agenda is
     written, and it leaves Quick wins and sits in Done until the meeting has
     passed and the board rolls it onto the next date. A chip saying the same
     thing a second way is a second thing to keep in step. */
  const rep = readRepeat(t.repeat);
  if (rep) chips.push({ cls: 'tag repeat', text: rep.label,
    title: 'Recurring ' + rep.label + '. The board moves the date on once this one has passed.' });
  // Urgent and due are the "look at this now" signals, so they get their own
  // corner rather than sitting in the wrap with everything else.
  const when = [];
  if (t.urgent) when.push({ cls: 'tag urgent', text: 'urgent' });
  if (di) when.push({ cls: 'tag due ' + di.cls, text: di.label + (di.note ? ' · ' + di.note : '') });

  let progress = null;
  if (subs.length) {
    progress = { kind: 'steps', done: doneSubs, total: subs.length,
                 pct: Math.round(doneSubs / subs.length * 100) };
  } else if (notes) {
    progress = { kind: 'notes', n: notes };
  }

  const statusClass = t.done ? ' done' :
    opts.tier === WAIT_COL ? ' waiting' :
    opts.tier === BLOCKED_TIER ? ' blocked' :
    opts.tier === BACKLOG_TIER ? ' backlog' : '';

  return {
    id: t.id,
    cls: statusClass.trim() + (t.headline ? ' onething' : ''),
    titleHTML: mdInline(t.title),
    chips, when, progress
  };
}

function chipHTML(c){
  return '<span class="' + esc(c.cls) + '"' +
    (c.project ? ' data-project="' + esc(c.project) + '"' : '') +
    (c.title ? ' title="' + esc(c.title) + '"' : '') + '>' + esc(c.text) + '</span>';
}

/* opts.static drops the drag and focus attributes. The matrix hover preview is
   the same card, but it is a picture of one rather than one you can act on, so
   it must not be draggable or land in the tab order.

   opts.tier is the task's real column name, used only to fade the card by its
   own status (done/waiting/blocked/backlog — see board.css) rather than by
   which DOM section happens to be rendering it. Pass it whether or not the
   card is done: t.done wins regardless.

   The board no longer calls this: it draws TaskCard from cardModel(). What is
   left is the matrix's preview, which goes when the matrix's bodies do. */
function cardHTML(t, color, bucketLabel, opts){
  opts = opts || {};
  const m = cardModel(t, opts);
  let meta = m.chips.map(chipHTML).join('');
  if (m.when.length) meta += '<span class="meta-when">' + m.when.map(chipHTML).join('') + '</span>';

  let prog = '';
  if (m.progress && m.progress.kind === 'steps') {
    prog = '<div class="prog"><span>' + m.progress.done + '/' + m.progress.total + ' steps</span>' +
           '<span class="bar"><i style="width:' + m.progress.pct + '%"></i></span></div>';
  } else if (m.progress) {
    prog = '<div class="notecount">' + m.progress.n + ' note' + (m.progress.n > 1 ? 's' : '') + '</div>';
  }

  /* Through the shared shell since 12 Sep 2026 — see cardShellHTML() below,
     and the Figma `Card` component it is. A task card is the eyebrow, the
     title, the tag row and the stripe, plus whichever of progress and the note
     count it has something to say with. */
  return cardShellHTML({
    cls: m.cls,
    draggable: !opts.static && !opts.noDrag,
    attrs: (opts.static ? '' : 'tabindex="0" role="button" ') + 'data-id="' + t.id + '"',
    stripe: color,
    eyebrow: bucketLabel ? '<span class="bucket">' + esc(bucketLabel) + '</span>' : '',
    title: m.titleHTML,
    tags: meta,
    progress: prog
  });
}


/* =========================================================================
   One column, three views.

   The Board and the Plans view both draw their columns
   through here, so a column is the same object wherever it appears: one fill,
   one border, one radius, one header padding, one body padding, one gap. What
   differs is which of the optional parts the head carries and what goes in
   the body — the same booleans the Figma `Column` component has, since the
   design file and this function are the two halves of one decision.

   Until 12 Sep 2026 the three views drew three different things. The board had
   `.tenon-column` with padding 0 and a divider under its heading; Plans and Execution
   had `.listcard` with padding 14/16/16, no divider, and their lead paragraph
   as the first thing inside the body rather than part of the head. The board's
   shape won because it is the denser and more-used surface: six columns and
   thirty-odd cards against four columns of prose.

     title    what the column is called                       (required)
     hint     the subtitle beside it — off on the board since the same date,
              where the six names carry their own meaning and the subtitles
              were saying it twice
     sort     the sort control, already built by the caller — the board's
              priority toggle, Projects' order select
     count    how many are in it
     action   a button belonging to this column (Run now, Spend and clocks)
     filters  a control narrowing what the column shows — a dropdown on Plans,
              the window picker on Reports, a checkbox on Matrix
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

   Two more say what kind of column it is rather than what is in its head, and
   both are the Figma component's own:

     style        'agent' is the Style=Agent variant — a dashed edge, meaning
                  an agent owns this column and you do not drag into it. It is
                  the only dashed thing in the app, which is what makes the
                  dash readable; see the note on .tenon-column.agentcol in board.css.
                  Anything else, including nothing, is Style=Default.
     hot          a running queue worked by AI: Doing and Producing on Plans,
                  Handed to AI on the board. An orange tint and a gear after
                  the title. The gear turns while the column is hot; pausing
                  it when nothing is actually running is `.hotcol.idle` in
                  board.css, for when the board can tell.
     collapsible  draws the column as a <details> whose <summary> is the head,
                  with `open` saying whether it starts open and `collapseKey`
                  naming where that is remembered (data-column-collapse, read by
                  the toggle listener in 19-drawer.js). Overview's five are the
                  only ones: five columns of prose open at once is a lot of
                  scrolling, and a column of cards has nothing to gain by
                  hiding. A head with controls in it still works — the click
                  guard below keeps a button in a summary from toggling the
                  column open as a side effect of being pressed.
   ========================================================================= */
function colHTML(o){
  o = o || {};
  const tag = o.heading === 'h3' ? 'h3' : 'h2';
  // Callers build these by concatenating optional words, so an empty or
  // half-empty run of them is normal and must not reach the attribute.
  const cls = (o.cls || '').trim().replace(/\s+/g, ' ');
  const bodyCls = (o.bodyCls || '').trim().replace(/\s+/g, ' ');
  /* A collapsible column is a <details> and its head is the <summary> — the
     same head, the same classes, the same optional parts, so nothing about a
     column changes by being foldable except the element it is made of. */
  const el = o.collapsible ? 'details' : 'section';
  const headTag = o.collapsible ? 'summary' : 'div';
  /* Two groups pushed apart, not one row with things floated right. What the
     column is called sits left; what you do to it sits right, in the
     component's own order — sort, then count, then an action button, then a
     Filters select. A long title squeezes the left group and leaves the right
     one alone, which is what a header full of controls has to do. */
  const head =
    '<' + headTag + ' class="tenon-column__head">' +
      '<div class="tenon-column__head-row">' +
        '<div class="tenon-column__head-start">' +
          (o.collapsible ? '<span class="tenon-column__chevron" aria-hidden="true"></span>' : '') +
          '<' + tag + ' class="tenon-column__title">' + esc(o.title) + '</' + tag + '>' +
          (o.hot ? '<span class="colgear" aria-hidden="true"></span>' : '') +
          (o.hint ? '<span class="tenon-column__hint">' + esc(o.hint) + '</span>' : '') +
        '</div>' +
        '<div class="tenon-column__head-end">' +
          (o.sort || '') +
          (o.count != null ? '<span class="tenon-column__count">' + o.count + '</span>' : '') +
          (o.action || '') +
          (o.filters || '') +
        '</div>' +
      '</div>' +
      (o.desc ? '<p class="tenon-column__desc">' + o.desc + '</p>' : '') +
    '</' + headTag + '>';
  /* Tenon's own variants first and the caller's classes after, because that is
     the order its `cx()` writes them in and this markup has to match character
     for character — kanban/ui/test_primitives.mjs renders both and compares. */
  return '<' + el + ' class="tenon-column' +
      (o.hot ? ' tenon-column--running' : '') +
      (o.style === 'agent' ? ' tenon-column--dashed' : '') +
      (cls ? ' ' + cls : '') + '"' +
    (o.collapsible ? (o.collapseKey ? ' data-column-collapse="' + esc(o.collapseKey) + '"' : '') +
      (o.open === false ? '' : ' open') : '') +
    (o.attrs ? ' ' + o.attrs : '') + '>' +
    head +
    '<div class="tenon-column__body' + (bodyCls ? ' ' + bodyCls : '') + '"' +
      (o.bodyAttrs ? ' ' + o.bodyAttrs : '') + '>' + (o.body || '') + '</div>' +
    (o.footer ? '<div class="tenon-column__footer">' + o.footer + '</div>' : '') +
  '</' + el + '>';
}

/* A control in a collapsible column's head is there to act on the column, not
   to fold it — but it sits inside the <summary>, where a click folds the
   column whatever it lands on. So the press is allowed through to the control
   and the fold is cancelled. Delegated for the same reason the filter's own
   handler below is: every head is rebuilt on every render. */
document.addEventListener('click', e => {
  const sum = e.target.closest('.tenon-column > summary');
  if (sum && e.target.closest('button, select, input, label, a')) e.preventDefault();
});

/* Filling a column's count after the fact. Three of them — Written reports,
   Backups and Projects — cannot know their number until a fetch comes back, so
   they draw with an empty count and this puts the figure in when it arrives.
   Silent when the column has gone: a view can be switched away from while its
   fetch is still in the air. */
function setColCount(sel, n){
  const el = document.querySelector(sel + ' .tenon-column__head .tenon-column__count');
  if (el) el.textContent = n;
}

/* The empty state a column falls back to, named once rather than written out
   at each of the eight places that needed it. Two styles and no third: plain
   grey text on the board, and a dashed box on Plans and Execution, where a
   column of prose with one line of grey text in it read as a column that had
   failed to load rather than one with nothing in it. */
function colEmptyHTML(message, style){
  return '<div class="tenon-column-empty' +
    (style === 'boxed' ? ' tenon-column-empty--boxed' : '') + '">' +
    message + '</div>';
}

/* =========================================================================
   One card, four kinds of thing on it.

   A task on the board, a plan written about one, a row in tonight's queue and
   a dependency in the chain. The Figma `Card` component (node 13:6850) is one
   component with seven states and ten show/hide booleans, and 169 instances
   across the three screens are all of it. This is that component.

   The anatomy, top to bottom, every row optional but the title:

     eyebrow    10.5 bold uppercase, coloured by --bc — the same colour the
                stripe takes, so a card's mark and its label agree. On a task
                that is the bucket; on a plan it is the state it is in.
     head       position · title · action
     tags       four chips left, two pinned right
     meta       where it sits · a link back to the card
     summary    what the document says, at rest
     progress   steps done, and the bar
     note       how many notes are on it
     stripe     3px down the left edge, --bc

   `stripe: null` leaves it off rather than drawing it in the line colour. That
   is what the component does on a queue card and on a plan nobody needs to
   look at, and the difference matters: a grey stripe still reads as a mark,
   and the point of leaving it off is that there is nothing to mark.

   The gaps come from the component: 5px between rows, and a few rows carry a
   little more of their own — tags 2, meta 4, summary 6, progress 3, note 1.
   ========================================================================= */
/* =========================================================================
   The number badge. A filled pill with a count in it, for something that is
   waiting on him: the Plans tab carries one for plans in Waiting for review.
   It is louder than `.tab .n`, the grey count a bucket tab carries, and that
   difference is the meaning: `.n` says how many there are, the badge says
   how many need looking at.

     n       the count; nought or less draws nothing, since there is nothing
             to flag, and above 99 it reads 99+
     label   what the count is of, for a screen reader and the tooltip

   Tenon's `Badge` is its twin and test_primitives.mjs holds the two to the
   same markup.
   ========================================================================= */
function numberBadgeHTML(o){
  o = o || {};
  const n = Math.floor(Number(o.n) || 0);
  if (n < 1) return '';
  const text = n > 99 ? '99+' : String(n);
  const label = o.label ? n + ' ' + o.label : '';
  return '<span class="tenon-badge tenon-badge--accent"' +
    (label ? ' title="' + esc(label) + '" aria-label="' + esc(label) + '"' : '') + '>' +
    text + '</span>';
}

function cardShellHTML(o){
  o = o || {};
  /* Same ordering rule as colHTML above. `draggable` is a class here as well
     as an attribute, because Tenon's Card styles the cursor off the class and
     a card that is draggable in one half of the board and not the other is
     the drift this whole arrangement exists to stop. */
  const cls = ('tenon-card tenon-card--flat' +
    (o.stripe ? ' tenon-card--accent' : '') +
    (o.draggable ? ' tenon-card--draggable' : '') +
    ' ' + (o.cls || '')).trim().replace(/\s+/g, ' ');
  const rows =
    (o.eyebrow ? '<div class="tenon-card__eyebrow">' + o.eyebrow + '</div>' : '') +
    '<div class="tenon-card__head">' +
      (o.position ? '<span class="tenon-card__lead">' + o.position + '</span>' : '') +
      '<div class="tenon-card__title">' + (o.title || '') + '</div>' +
      (o.action ? '<span class="tenon-card__action">' + o.action + '</span>' : '') +
    '</div>' +
    (o.tags ? '<div class="tenon-card__tags">' + o.tags + '</div>' : '') +
    (o.meta ? '<div class="tenon-card__meta">' + o.meta + '</div>' : '') +
    (o.summary ? '<div class="tenon-card__summary">' + o.summary + '</div>' : '') +
    (o.progress ? '<div class="tenon-card__body">' + o.progress + '</div>' : '') +
    (o.note ? '<div class="tenon-card__footer">' + o.note + '</div>' : '') +
    (o.extra || '');
  return '<' + (o.tag || 'article') + ' class="' + cls + '"' +
    (o.draggable ? ' draggable="true"' : '') +
    (o.attrs ? ' ' + o.attrs : '') +
    (o.stripe ? ' style="--tenon-card-accent:' + o.stripe + '"' : '') + '>' +
    rows +
  '</' + (o.tag || 'article') + '>';
}
