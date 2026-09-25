'use strict';

/* =========================================================================
   2c. Columns — the states every task moves through inside a bucket.

   These are not stored as a list of their own: they are the `###` headings
   already sitting inside the buckets, read off by allTiers()/boardColumns()
   above, which unions them by scanning the buckets in order and remembering
   each name the first time it turns up. That scan is why every edit below
   ends by calling syncTierShapes() rather than touching only the buckets a
   column happens to already be in: a column that only exists in one bucket
   — Design System's Reviewing, say — cannot be reordered relative to the
   others just by moving it around inside that one bucket, because nothing
   about its position there is visible to a scan that never gets past the
   earlier buckets' own tiers first. Giving every bucket the same set closes
   that blind spot, and costs nothing on screen: the board already draws
   every column on every bucket's view, empty wherever that bucket has no
   tasks in it, whether or not that bucket's file section mentions the
   heading at all. See syncTierShapes for the rest of this.
   ========================================================================= */

/* Left to right, the way the board actually draws them, with Done left off: it
   is fixed at the far right and not one of the columns that can be renamed,
   reordered or deleted, so every editor here works from this list. */
function tierOrder(){ return boardColumns().filter(n => n !== DONE_COL); }

function tierTaskCount(name){
  return state.doc.buckets.reduce((sum, b) => {
    const t = b.tiers.find(x => x.name === name);
    return sum + (t ? t.tasks.length : 0);
  }, 0);
}

/* Returns the name already taken, so the complaint can quote it back rather
   than just the one just typed. Done included: a real column with that name
   would sit behind its synthetic namesake and never be reachable. */
function tierNameTaken(name, except){
  const k = name.toLowerCase();
  if (k === DONE_COL.toLowerCase() && name !== except) return DONE_COL;
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
  const clash = tierOrder().concat([DONE_COL])
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
  // boardColumns() reverses allTiers(), and Done is first in the file
  const fileOrder = [DONE_COL].concat(order.slice().reverse());
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
  // Backlog, To do, Doing, Reviewing and Done are matched by this exact
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

/* Put `name` just before `beforeName`, or at the end when `beforeName` is
   null — the position bindReorder hands back from a drop, rather than a
   step of ±1. */
function moveTierTo(name, beforeName){
  const order = tierOrder();
  const i = order.indexOf(name);
  if (i < 0 || name === beforeName) return;
  order.splice(i, 1);
  const j = beforeName ? order.indexOf(beforeName) : order.length;
  order.splice(j < 0 ? order.length : j, 0, name);
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
      return '<div class="bkrow" data-tenon-reorder="' + i + '">' +
        BoardUI.dragHandleHTML() +
        '<input type="text" data-tiername="' + i + '" value="' + esc(tierLabel(name)) + '" aria-label="Column name"' +
          (fixed ? ' title="' + esc('Everything that reads the list matches “' + name + '” by this exact text, so the heading in todo.md stays as it is and this changes only what you see on the board.') + '"' : '') + '>' +
          (fixed && tierLabel(name) !== name
            ? '<span class="bkwas" title="the heading in todo.md, left as it is">' + esc(name) + '</span>' : '') +
        '<span class="bkn" title="tasks in it, across every bucket, finished ones included">' + n + '</span>' +
        deleteButtonHTML(i, order.length, { delAttr: 'data-tierdel', noun: 'column' }) +
      '</div>';
    }).join('');

    showModal('Columns',
      'The states every task moves through inside a bucket, left to right on the board. Every bucket ' +
      'shows every column, whether or not its own section has tasks in it, so a rename, reorder, add ' +
      'or delete here reaches every bucket the same way. Done sits fixed at the far right and is not ' +
      'listed here: it is where a ticked task lands. Four of these names are ' +
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
    BoardUI.bindReorder(modalEl.querySelector('.bklist'), {
      onMove: (key, beforeKey) => {
        moveTierTo(order[+key], beforeKey == null ? null : order[+beforeKey]);
        draw();
      }
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
  /* A sub-task assigned to him is open and what it waits on is ticked, so the
     next move on this card is his. Worked out from the sub-tasks each time; the
     column head counts the cards carrying it. */
  if (!t.done && yourMove(t)) chips.push({ cls: 'tag yourmove', text: 'your move',
    title: 'A sub-task on this card is waiting on you' });
  /* First, because it says which piece of work this belongs to, and that frames
     everything after it. Clicking it opens the project rather than the card —
     see the capture-phase handler on [data-project]. */
  const proj = taskProject(t);
  if (proj) chips.push({ cls: 'tag proj', text: proj, project: proj, title: 'Everything on ' + proj });
  /* The bucket's own sub-organisation — `[theme:: ]`, values declared per
     bucket (see state.bucketThemes in 02-state.js). Beside the project chip:
     both answer "what does this belong to", one level up and one level down. */
  if (t.theme) chips.push({ cls: 'tag theme', text: t.theme, title: 'Theme: ' + t.theme });
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
  }

  const statusClass = t.done ? ' done' :
    opts.tier === WAIT_COL ? ' waiting' :
    opts.tier === BACKLOG_TIER ? ' backlog' : '';

  return {
    id: t.id,
    cls: statusClass.trim() + (t.headline ? ' onething' : ''),
    titleHTML: mdInline(t.title),
    chips, when, progress
  };
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
