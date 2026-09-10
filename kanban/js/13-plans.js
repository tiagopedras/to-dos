'use strict';

/* =========================================================================
   4b2b. Plans — what the night agent worked out while nobody was watching.

   Files in data/<dataset>/plans/<night>/, listed by the server at /plans.json,
   read exactly the way written reports are. They are a separate view rather
   than a third column in Reports because they answer the opposite question: a
   report says what happened, a plan proposes what to do, and a plan stops being
   true the moment it is acted on.

   Five states, and the three at the end are decisions rather than reading:

     unread    nobody has looked at it
     read      looked at, doing nothing about it yet
     agreed    approved to be carried out. This is what hands the work to the
               acting agent, and it is the only status that says "yes, do it".
     redo      rejected, with a reason. The next nightly run plans the task
               again and the agent is told what was wrong with the last one,
               so the second plan is not the first plan.
     actioned  acted on, so it no longer describes outstanding work

   Setting a status is the only write in here, and it writes the plan file. The
   runner's ledger picks it up: actioned and redo both make the task worth
   planning again, agreed holds it back until the work is done. Nothing in this
   view goes near todo.md.

   Why agreed is a status and not a flag: a plan is in exactly one of these
   states at a time, and a second field would let a plan be agreed and rejected
   at once, which means nothing. See PLAN_STATUS in kanban/server.py and
   is_stale() in agents/night_agent/pick.py, the two other places these are known.
   ========================================================================= */

const planBodies = {};
let planList = [];

/* A folded plan is one whose agent stopped and asked rather than guessing —
   see the folding rule in agents/night_agent/PLAN-BRIEF.md. It is marked here rather than
   left to read like any other, because the two want opposite things from him:
   a plan wants reading, a fold wants answering. */
const PLAN_CLASS = { actioned:' actioned', read:' read', agreed:' agreed', redo:' redo' };

/* When a plan was actually written, to the minute — `generated:` if the file
   has one, falling back to the file's own mtime for a plan written before
   this field existed. Both are naive local timestamps already, the same as
   backupWhen's input, so it reads the same format the Backups list already
   uses for "when did this actually happen". */
function planGeneratedLabel(p){
  const iso = p.generated || p.modified;
  return iso ? backupWhen(iso) : (p.night || '');
}

function planItemHTML(p){
  const folded = p.outcome === 'folded';
  const meta = [p.bucket, p.column, planGeneratedLabel(p)].filter(Boolean).map(esc).join(' · ');
  const cls = (PLAN_CLASS[p.status] || '') + (folded ? ' folded' : '');
  // The plan's own task, if the underlying card can still be found by slug or
  // title — see findTaskByKey in 02-state.js. Not every plan resolves: the
  // task might since have been renamed or deleted, so the button only shows
  // up when there is somewhere for it to actually go.
  const key = p.slug || p.task || '';
  return '<article class="repitem planitem' + cls + '" data-plan="' + esc(p.url) + '">' +
    '<button class="rephead" data-plan-open="' + esc(p.url) + '">' +
      '<span class="reptitle">' + esc(p.title) + '</span>' +
      (folded ? '<span class="planfold" title="The agent stopped and asked rather than guessing">needs you</span>' : '') +
      '<span class="repdate">' + esc(p.status === 'unread' ? 'new' : p.status) + '</span>' +
    '</button>' +
    (meta || key
      ? '<div class="repmeta">' + meta +
        (key ? (meta ? ' · ' : '') + '<button class="plangoto" data-plan-goto="' + esc(key) +
          '" title="Open this task on the board">open the card ↗</button>' : '') +
        '</div>'
      : '') +
    (p.summary ? '<div class="repsum">' + mdInline(p.summary) + '</div>' : '') +
    /* On a rejected plan the reason is worth more than the summary: it is what
       he told the agent, and it is what tonight's run will be working from. */
    (p.status === 'redo' && p.redo_note
      ? '<div class="planredo"><b>Sent back:</b> ' + esc(p.redo_note) + '</div>' : '') +
  '</article>';
}

/* Opening one marks it read, on the grounds that having it open is what being
   read means. Actioned stays a deliberate press, because that is a claim about
   the work rather than about him, and it is the one the runner acts on. */
function openPlanModal(p){
  const sub = [p.bucket, p.column, planGeneratedLabel(p), p.agent].filter(Boolean).map(esc).join(' · ');
  /* Three buttons and only two of them are decisions. Agree and Send back are
     the pair this view exists for, coloured for what they commit to — green
     hands the work to the runner, red sends it away with a reason. I did this
     myself stays for the plans he carries out on his own, which is still most
     of them; it carries no colour because it isn't a verdict on the plan. The
     modal's own × in the corner is the dismissal now, so there is no Close
     button left to press by reflex on the way out. */
  openDocModal({
    title: p.title, sub, cache: planBodies, url: p.url, load: loadPlanBody,
    buttons: [{ label:'Agree, hand it over', agree:true, run: () => agreePlan(p) },
              { label:'Send it back', reject:true, run: () => rejectPlan(p) },
              { label:'I did this myself', run: () => setPlanStatus(p, 'actioned') }]
  });
  if (p.status === 'unread') setPlanStatus(p, 'read', true);
}

/* Agreeing is a claim that the work should happen, so it says what happens
   next rather than flipping a label silently. Nothing runs from here: the
   acting agent is invoked from a session, on purpose, so that a run he has not
   asked for cannot start from a stray click on a board tab left open. */
function agreePlan(p){
  showModal('Agree this plan?', esc(p.title),
    '<div class="repdoc">' +
      '<p>It moves to <strong>agreed</strong> and waits. Nothing runs now.</p>' +
      '<p>The night agent stops re-planning this task while it sits here, so ' +
      'the plan you approved is the one that gets carried out rather than being ' +
      'replaced by tonight\'s second opinion.</p>' +
      '<p>To actually run it, start a session and use <code>/pa-do</code>.</p>' +
    '</div>',
    [{ label:'Agree it', primary:true, run: () => setPlanStatus(p, 'agreed') },
     { label:'Cancel' }]);
}

/* A rejection has to carry a reason, because the reason is the whole feature:
   it goes into the plan's frontmatter and the next run's agent is handed it,
   which is what stops tomorrow night writing the same plan again. The server
   refuses an empty one, and so does this, so the message about why arrives
   before the press rather than after it. */
let redoText = '';
function rejectPlan(p){
  redoText = '';
  showModal('Send this plan back?', esc(p.title),
    '<div class="repdoc">' +
      '<p>It gets planned again on the next run, and the agent is told what was ' +
      'wrong with this one. Say what it got wrong, in a sentence.</p>' +
      '<textarea id="redoWhy" class="redowhy" rows="3" ' +
        'placeholder="Wrong scope: this is about the Foundations file, not the whole library."></textarea>' +
    '</div>',
    [{ label:'Send it back', primary:true, run: () => {
        const why = redoText.trim();
        if (!why) return showToast('A plan sent back needs a reason.', 'bad');
        setPlanStatus(p, 'redo', false, why);
      } },
     { label:'Cancel' }]);
  const box = $('#redoWhy');
  if (box) {
    // Read as he types rather than on press: showModal closes the sheet before
    // running a button, so by then the textarea is gone.
    box.oninput = () => { redoText = box.value; };
    box.focus();
  }
}

async function loadPlanBody(url){ return loadDocBody(url, planBodies, 'plan'); }

/* `quiet` is the read-on-open case: it should not redraw the list underneath an
   open modal, which would be a card shuffling itself while he is reading it. */
async function setPlanStatus(p, status, quiet, note){
  try {
    await postJSON('/plan/status', { night: p.night, name: p.name, status, note });
    p.status = status;
    if (status === 'redo') p.redo_note = note || '';
    if (!quiet) renderPlansList();
  } catch (err) {
    if (!quiet) showToast('Could not mark that plan: ' + (err.message || err), 'bad');
  }
}

/* Filters any of the queue/backlog/plan lists down to whichever buckets the
   tabs above this view are showing — All, the AI filter or the urgent/due
   filter all widen it back to everything, the same as shownBuckets() does
   for the board itself. Otherwise a row stays if its bucket is any one of the
   toggled-on set, the same widening shownBuckets() itself does for AI/urgent
   — not an exact match against a single name, which would drop a row the
   moment two bucket tabs were on at once. A row with no bucket on it (should
   not happen in practice) is shown regardless, rather than disappearing
   because of a field that was never set. */
function plansShown(list, field){
  field = field || 'bucket';
  if (!state.doc || allMode() || state.aiFilter || state.urgentFilter) return list;
  return list.filter(r => !r[field] || state.bucketFilter.has(r[field]));
}

function goToPlanTask(key){
  if (!key || !findTaskByKey(key)) {
    showToast('That task is not on the board any more.', 'bad');
    return;
  }
  state.view = 'board';
  openTaskByKey(key);
}

/* Two columns, and each one's own chip row. The Done column used to hold all
   six of these behind a single row of chips, which asked two different
   questions of one list: unread, folded and read are waiting to be read, and
   agreed, redo and actioned are verdicts already given. Splitting the chips in
   two is what lets each row narrow one question rather than both at once.

   `folded` is not a status — it is p.outcome — but it is the distinction he
   scans for first, so it sits in the Inbox row rather than in a second control
   beside it. A plan can be both folded and unread; a chip narrows to one
   question at a time, so it lands in whichever one he clicked. */
const INBOX_FILTERS = [
  { key:'unread',   label:'new',       match: p => p.status === 'unread' },
  { key:'folded',   label:'needs you', match: p => p.outcome === 'folded' },
  { key:'read',     label:'read',      match: p => p.status === 'read' },
];
const DECIDED_FILTERS = [
  { key:'agreed',   label:'agreed',    match: p => p.status === 'agreed' },
  { key:'redo',     label:'redo',      match: p => p.status === 'redo' },
  { key:'actioned', label:'actioned',  match: p => p.status === 'actioned' },
];
/* Which column a plan is in at all, decided by status rather than by chip —
   the chips narrow a column, they do not choose it. The five statuses split
   cleanly in two: unread and read are still being read, these three have had a
   verdict. A folded plan is in whichever column its status puts it, so one
   that has been sent back sits under redo rather than staying in the Inbox
   asking a question he has already answered. */
const DECIDED_STATUS = new Set(['agreed', 'redo', 'actioned']);
/* One filter per column, so a chip picked in one does not reset the other. */
let inboxFilter = 'all';
let decidedFilter = 'all';

/* Only chips with something behind them are drawn, which is what stops a chip
   ever leading to an empty column: the bucket tabs above narrow this list too,
   so a status that exists somewhere may have nothing in the bucket being shown.
   A filter that empties out that way falls back to All rather than leaving him
   looking at nothing with no way to tell why. */
function planFilterBarHTML(shown, filters, current){
  const counts = filters
    .map(f => ({ f, n: shown.filter(f.match).length }))
    .filter(x => x.n);
  if (!counts.length) return '';
  return '<div class="tabs planfilter">' +
    '<button class="tab taball' + (current === 'all' ? ' on' : '') +
      '" data-planfilter="all">All<span class="n">' + shown.length + '</span></button>' +
    counts.map(x =>
      '<button class="tab' + (current === x.f.key ? ' on' : '') +
        '" data-planfilter="' + x.f.key + '">' + x.f.label +
        '<span class="n">' + x.n + '</span></button>').join('') +
  '</div>';
}

/* Both columns wire the same three controls — their own chip row, and the open
   and open-the-card buttons on every row in them. Only the chip handler
   differs, since each column holds its own filter. Wiring is scoped to the
   container, so the two chip rows never see each other's clicks despite
   sharing the attribute name. */
function wirePlanColumn(out, setFilter){
  out.querySelectorAll('[data-planfilter]').forEach(btn => {
    btn.onclick = () => { setFilter(btn.dataset.planfilter); renderPlansList(); };
  });
  out.querySelectorAll('[data-plan-open]').forEach(btn => {
    const p = planList.find(x => x.url === btn.dataset.planOpen);
    btn.onclick = () => openPlanModal(p);
  });
  out.querySelectorAll('[data-plan-goto]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); goToPlanTask(btn.dataset.planGoto); };
  });
}

/* A status change moves a plan from one column to the other, so both are
   always redrawn together. */
function renderPlansList(){
  renderPlanInbox();
  renderPlanDecided();
}

/* The reading column. Flat, because every row in it asks the same thing, and
   the chips are the only split it needs. */
function renderPlanInbox(){
  const out = $('#plansOut');
  if (!out) return;
  const all = plansShown(planList).filter(p => !DECIDED_STATUS.has(p.status));
  const active = INBOX_FILTERS.find(f => f.key === inboxFilter);
  if (active && !all.some(active.match)) inboxFilter = 'all';
  const shown = inboxFilter === 'all'
    ? all
    : all.filter(INBOX_FILTERS.find(f => f.key === inboxFilter).match);
  out.innerHTML = planFilterBarHTML(all, INBOX_FILTERS, inboxFilter) +
    (shown.length
      ? shown.map(planItemHTML).join('')
      : '<div class="empty">Nothing waiting to be read. Everything written has been ruled on.</div>');
  wirePlanColumn(out, k => { inboxFilter = k; });
}

/* The verdict column, and the reason the split was worth making: agreed is
   work still owed, redo went back for another night, and actioned is a record.
   The three keep the grouping the one list already gave them — agreed lifted
   to the top under its own heading, actioned folded shut at the bottom — with
   redo between them, which is where it always drew. */
function renderPlanDecided(){
  const out = $('#plansDecided');
  if (!out) return;
  const all = plansShown(planList).filter(p => DECIDED_STATUS.has(p.status));
  const active = DECIDED_FILTERS.find(f => f.key === decidedFilter);
  if (active && !all.some(active.match)) decidedFilter = 'all';
  const shown = decidedFilter === 'all'
    ? all
    : all.filter(DECIDED_FILTERS.find(f => f.key === decidedFilter).match);
  const agreed = shown.filter(p => p.status === 'agreed');
  const redo = shown.filter(p => p.status === 'redo');
  const done = shown.filter(p => p.status === 'actioned');
  out.innerHTML = planFilterBarHTML(all, DECIDED_FILTERS, decidedFilter) +
    (agreed.length
      ? '<div class="planagreed"><h4>Agreed, waiting to be run</h4>' +
        '<p class="help">Start a session and run <code>/pa-do</code>.</p>' +
        agreed.map(planItemHTML).join('') + '</div>'
      : '') +
    redo.map(planItemHTML).join('') +
    /* Open when it is the thing being asked for: a chip that narrows to
       actioned and then hides the result behind a fold has done half a job. */
    (done.length ? '<details' + (decidedFilter === 'actioned' ? ' open' : '') +
                   '><summary>' + done.length + ' actioned</summary>' +
                   done.map(planItemHTML).join('') + '</details>' : '') +
    (shown.length ? ''
                  : '<div class="empty">Nothing ruled on yet. Agreeing a plan, or sending one back, lands it here.</div>');
  wirePlanColumn(out, k => { decidedFilter = k; });
}

/* -------------------------------------------------------------------------
   The queue — what tonight would plan, and the one place to change it.

   Nothing here is scheduled or stored. /queue.json is pick.select() run
   against todo.md this second, the same call the runner makes at 02:00, so
   the column cannot drift from what actually happens and there is no queued
   batch to go stale. Tick a task off and it leaves the list on the next
   render.

   What a drag writes is only the ordering, to plans/queue-order.json. The
   order matters because the batch stops on a budget, on a window floor or on
   a usage limit: the front of this list is the part that reliably gets
   planned, and the back is the part that might not. Holding a card back is
   the other half of the same control — it is the only way to say "not this
   one" without editing todo.md, which this view must never do.

   Neither the order nor the hold list decides what the queue contains. Every
   rule in agents/night_agent/pick.py still does that. A title in the file that has since
   been ticked off, blocked or renamed is simply never matched, which is why
   nothing here ever needs pruning.
   ------------------------------------------------------------------------- */

let queueRows = [];      // what tonight would plan, in order
let queueHeld = [];      // deliberately held back — lives in the Backlog column
let queueSkipped = [];   // dropped by a rule — lives in the Backlog column too
let queueOrder = [];     // the stored ordering, so held ranks survive a save
let queueDrag = null;    // { title, from: 'queue' | 'held' } while a card is being dragged

/* The same "open the card ↗" link a plan's own meta line carries — see
   goToPlanTask. A queue or Backlog row is the board's own task, not a plan
   written about it, so it needs the same way back rather than a copy of it. */
function gotoButtonHTML(r){
  const key = r.slug || r.title || '';
  return key ? '<button class="plangoto" data-plan-goto="' + esc(key) +
    '" title="Open this task on the board">open the card ↗</button>' : '';
}

function queueRowHTML(r){
  const meta = [r.bucket, r.column, r.agent].filter(Boolean).map(esc).join(' · ');
  const goto = gotoButtonHTML(r);
  return '<article class="qitem" draggable="true" data-qtitle="' + esc(r.title) + '">' +
    '<div class="qhead">' +
      '<span class="qpos">' + r.position + '</span>' +
      '<span class="qtitle">' + esc(r.title) + '</span>' +
      '<button class="qhold" data-qhold="' + esc(r.title) + '" ' +
        'title="Hold it back from tonight">Hold</button>' +
    '</div>' +
    (meta || goto
      ? '<div class="repmeta">' + meta + (goto ? (meta ? ' · ' : '') + goto : '') + '</div>'
      : '') +
    '<div class="qwhy">' + esc(r.why || '') +
      (r.last ? ' · last planned ' + esc(r.last) : '') + '</div>' +
  '</article>';
}

function renderQueueList(){
  const out = $('#queueOut');
  if (!out) return;
  const shown = plansShown(queueRows);
  out.innerHTML = shown.length
    ? shown.map(queueRowHTML).join('')
    : '<div class="empty">Nothing to plan tonight. Everything eligible has a ' +
      'plan already, and none of them have changed since.</div>';
  wireQueue();
}

function wireQueue(){
  const out = $('#queueOut');
  if (!out) return;
  out.querySelectorAll('[data-qhold]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); holdTask(btn.dataset.qhold); };
  });
  out.querySelectorAll('[data-plan-goto]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); goToPlanTask(btn.dataset.planGoto); };
  });

  /* The same reorder gesture the sub-steps in the drawer use: drop above or
     below whichever card the cursor is over, decided by its midpoint. A card
     dragged in from the Backlog column lands the same way — the drop target
     decides the position whichever list the card came from. */
  const rows = out.querySelectorAll('.qitem');
  const clear = () => rows.forEach(r => r.classList.remove('over-top','over-bottom','dragging'));
  rows.forEach(row => {
    row.ondragstart = e => {
      queueDrag = { title: row.dataset.qtitle, from: 'queue' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.qtitle);
      row.classList.add('dragging');
    };
    row.ondragend = () => { queueDrag = null; clear(); };
    row.ondragover = e => {
      if (!queueDrag) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      row.classList.toggle('over-bottom', after);
      row.classList.toggle('over-top', !after);
    };
    row.ondragleave = () => row.classList.remove('over-top','over-bottom');
    row.ondrop = e => {
      if (!queueDrag) return;
      e.preventDefault(); e.stopPropagation();
      const r = row.getBoundingClientRect();
      const at = queueRows.findIndex(x => x.title === row.dataset.qtitle);
      const to = at + (e.clientY > r.top + r.height / 2 ? 1 : 0);
      clear();
      dropOnQueue(to);
    };
  });
  // Dropping on the column itself rather than on any one card — an empty
  // queue, or the gap below the last row — appends at the end.
  out.ondragover = e => { if (queueDrag) e.preventDefault(); };
  out.ondrop = e => {
    if (!queueDrag) return;
    e.preventDefault();
    dropOnQueue(queueRows.length);
  };
}

/* The single place a card's position in the queue actually changes, whichever
   list it started in. `toIndex` is where it lands, in queueRows' own terms —
   wireQueue works it out from the drop target before calling in. */
function dropOnQueue(toIndex){
  if (!queueDrag) return;
  const { title, from } = queueDrag;
  queueDrag = null;
  if (from === 'queue') {
    const at = queueRows.findIndex(r => r.title === title);
    if (at < 0) return;
    let to = toIndex;
    if (to > at) to--;
    if (to === at) return;
    queueRows.splice(to, 0, queueRows.splice(at, 1)[0]);
  } else if (from === 'held') {
    const at = queueHeld.findIndex(r => r.title === title);
    if (at < 0) return;
    const [row] = queueHeld.splice(at, 1);
    row.state = 'queued';
    row.why = '';
    queueRows.splice(toIndex, 0, row);
  } else {
    return;
  }
  queueRows.forEach((r, i) => { r.position = i + 1; });
  renderQueueList();
  renderBacklogList();
  saveQueueOrder(true);
}

function holdTask(title){
  const at = queueRows.findIndex(r => r.title === title);
  if (at < 0) return;
  const [row] = queueRows.splice(at, 1);
  row.state = 'held';
  row.why = 'held back from the board';
  queueHeld.push(row);
  queueRows.forEach((r, i) => { r.position = i + 1; });
  renderQueueList();
  renderBacklogList();
  saveQueueOrder(false);
}

function releaseHeld(title){
  const at = queueHeld.findIndex(r => r.title === title);
  if (at < 0) return;
  const [row] = queueHeld.splice(at, 1);
  row.state = 'queued';
  row.why = '';
  queueRows.push(row);
  queueRows.forEach((r, i) => { r.position = i + 1; });
  renderQueueList();
  renderBacklogList();
  saveQueueOrder(false);
}

/* -------------------------------------------------------------------------
   Backlog — everything the queue does not contain and why: held back from
   the board on one hand, excluded by a rule in agents/night_agent/pick.py on the other.

   Only the first half is draggable. Holding is a board-only preference, so
   dragging a held card back into the queue is exactly the reverse of the
   Hold button and just as safe. A card excluded by a rule — blocked, parked,
   tagged short of ai:full, or waiting on a `start:` date — is excluded for a
   reason dragging cannot fix, so it is shown rather than offered: see the
   comment above pick.eligible() and pick.select() for why the order and hold
   files were deliberately never given a say over what the queue contains.
   ------------------------------------------------------------------------- */

function heldRowHTML(r){
  const meta = [r.bucket, r.column, r.agent].filter(Boolean).map(esc).join(' · ');
  const goto = gotoButtonHTML(r);
  return '<article class="qitem held" draggable="true" data-qtitle="' + esc(r.title) + '">' +
    '<div class="qhead">' +
      '<span class="qpos">—</span>' +
      '<span class="qtitle">' + esc(r.title) + '</span>' +
      '<button class="qhold" data-qrelease="' + esc(r.title) + '" ' +
        'title="Put it back in the queue">Release</button>' +
    '</div>' +
    (meta || goto
      ? '<div class="repmeta">' + meta + (goto ? (meta ? ' · ' : '') + goto : '') + '</div>'
      : '') +
    '<div class="qwhy">' + esc(r.why || '') + '</div>' +
  '</article>';
}

function renderBacklogList(){
  const out = $('#backlogOut');
  if (!out) return;
  const held = plansShown(queueHeld);
  const skipped = plansShown(queueSkipped);
  out.innerHTML =
    (held.length
      ? '<p class="help listlead">Drag back into the queue to plan it tonight.</p>' +
        held.map(heldRowHTML).join('')
      : '') +
    (skipped.length
      ? '<details class="ufold"><summary>Not eligible (' + skipped.length + ')</summary>' +
        skipped.map(r =>
          '<div class="qskip"><span>' + esc(r.title) + '</span>' + gotoButtonHTML(r) +
          '<em>' + esc(r.why) + '</em></div>'
        ).join('') + '</details>'
      : '') +
    (!held.length && !skipped.length
      ? '<div class="empty">Nothing held back, and nothing excluded right now.</div>'
      : '');
  const wrap = $('#backlogOut');
  wrap.querySelectorAll('[data-qrelease]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); releaseHeld(btn.dataset.qrelease); };
  });
  wrap.querySelectorAll('[data-plan-goto]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); goToPlanTask(btn.dataset.planGoto); };
  });
  wrap.querySelectorAll('.qitem.held').forEach(row => {
    row.ondragstart = e => {
      queueDrag = { title: row.dataset.qtitle, from: 'held' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.qtitle);
      row.classList.add('dragging');
    };
    row.ondragend = () => { queueDrag = null; row.classList.remove('dragging'); };
  });

  // Dropping a card from the queue anywhere on this column holds it back —
  // the drag equivalent of pressing Hold. There is nothing to position it
  // against, since a held card has no rank, so the whole column is the target
  // rather than any one row within it.
  wrap.ondragover = e => {
    if (!queueDrag || queueDrag.from !== 'queue') return;
    e.preventDefault();
    wrap.classList.add('backlogdrop');
  };
  wrap.ondragleave = e => {
    if (e.target === wrap) wrap.classList.remove('backlogdrop');
  };
  wrap.ondrop = e => {
    if (!queueDrag || queueDrag.from !== 'queue') return;
    e.preventDefault();
    wrap.classList.remove('backlogdrop');
    const title = queueDrag.title;
    queueDrag = null;
    holdTask(title);
  };
}

/* `ranked` says whether this save is him ordering the queue, and only a drag
   passes true.

   It matters because pick.py treats a stored order as him saying "this one
   first" and puts it above every other rule. Holding one card used to write the
   whole visible list as well, which stamped whatever order the picker happened
   to produce into the file as if it had been chosen — on 5 Sep 2026 that froze
   a bucket ordering nobody asked for and outranked the rules for good. A hold
   is a hold: it changes what is held and leaves the ranking alone.

   Titles the server has stored but that are not on screen — held cards from an
   earlier session, tasks blocked this week — are carried through rather than
   dropped, so releasing one later puts it back where it was rather than at the
   end of the queue. */
async function saveQueueOrder(ranked){
  const norm = t => String(t || '').trim().toLowerCase();
  let order = queueOrder;
  if (ranked) {
    const shown = queueRows.map(r => r.title);
    const seen = new Set(shown.map(norm));
    order = shown.concat(queueOrder.filter(t => !seen.has(norm(t))));
  }
  const hold = queueHeld.map(r => r.title);
  try {
    await postJSON('/queue/order', { order, hold });
    queueOrder = order;
  } catch (err) {
    showToast('Could not save the queue order: ' + (err.message || err), 'bad');
  }
}

async function renderQueue(){
  const out = $('#queueOut');
  const back = $('#backlogOut');
  if (!out) return;
  try {
    const res = await fetch('/queue.json?t=' + Date.now(), { cache:'no-store' });
    if (res.status === 404) {
      out.innerHTML = '<div class="empty">No night agent in this checkout, so there is ' +
        'nothing queued and nothing to order.</div>';
      if (back) back.innerHTML = '<div class="empty">Same here — nothing to hold back.</div>';
      return;
    }
    if (!res.ok) {
      const msg = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about the queue yet.</div>';
      out.innerHTML = msg;
      if (back) back.innerHTML = msg;
      return;
    }
    const q = await res.json();
    queueRows = q.queue || [];
    queueHeld = q.held || [];
    queueSkipped = q.skipped || [];
    queueOrder = q.order || [];
    renderQueueList();
    renderBacklogList();
  } catch (err) {
    const msg = '<div class="err">Could not read the queue. ' +
      esc(String(err.message || err)) + '</div>';
    out.innerHTML = msg;
    if (back) back.innerHTML = msg;
  }
}

/* -------------------------------------------------------------------------
   Queue / Doing — one card asking whichever question is actually live: what
   would tonight plan (Queue), or what the agent is doing this second (Doing).
   Never both at once. A run in flight makes "what would tonight plan" a
   description of the recent past rather than of right now, so the card
   becomes the thing that's true instead of carrying two things that answer
   the same underlying question — "is anything about to happen, or is it
   happening" — at two different altitudes.

   Read from the lock directory and the log, which is the only honest way to
   answer either half: the agents are subprocesses of a shell launchd
   started, and nothing here can ask them anything. One task in flight at a
   time, because plan.py runs its agents strictly one at a time — a runaway
   agent then costs one timeout rather than the whole night.
   ------------------------------------------------------------------------- */

let flightTimer = null;

function flightRowHTML(r, kind){
  return '<div class="frow ' + kind + '">' +
    '<span class="fname">' + esc(r.title) + '</span>' +
    '<span class="fmeta">' + esc(
      kind === 'done' ? r.took + 's · $' + r.cost.toFixed(2) : (r.why || '')
    ) + '</span>' +
  '</div>';
}

/* The card's own identity — title, lead sentence, which of #queueOut /
   #doingOut is showing, whether the Run button makes sense right now — all
   follow the same one fact: is a run actually live. A dead run (the lock
   gone, the last task never finished) doesn't count as "actively running",
   so it surfaces as a banner over the queue rather than taking over the
   Doing slot — the queue is still the true answer to "what happens next"
   when nothing is going. */
function renderQueueDoingHead(live, orphan){
  const title = $('#qdTitle');
  if (title) title.textContent = live ? 'Doing' : 'Queue';
  const lead = $('#qdLead');
  if (lead) lead.textContent = live
    ? 'What the night agent is doing right now.'
    : 'What tonight\'s run would plan, in order.';
  const btn = $('#runQueueBtn');
  // Only when nothing is going. run.sh holds a lock and would refuse a
  // second batch anyway, but it refuses by logging and exiting cleanly,
  // which from a button looks exactly like starting — so the button is not
  // offered rather than offered and quietly ignored.
  if (btn) btn.classList.toggle('hidden', live);
  const doingOut = $('#doingOut');
  const queueOut = $('#queueOut');
  if (doingOut) doingOut.classList.toggle('hidden', !live);
  if (queueOut) queueOut.classList.toggle('hidden', live);
  const orphanOut = $('#qdOrphan');
  if (!orphanOut) return;
  if (!live && orphan) {
    orphanOut.classList.remove('hidden');
    orphanOut.innerHTML = '<div class="err">The last run stopped part way through <strong>' +
      esc(orphan.title) + '</strong> and never finished. Its lock is gone, so nothing is ' +
      'running now.</div>';
  } else {
    orphanOut.classList.add('hidden');
    orphanOut.innerHTML = '';
  }
}

/* Only ever drawn while #doingOut is actually showing — see
   renderQueueDoingHead — so there is no idle or orphan case to handle here;
   those are the queue's job now. */
function renderDoing(n){
  const out = $('#doingOut');
  if (!out) return;
  const when = s => s ? esc(s.slice(11, 16)) : '';
  if (n.live && n.current) {
    out.innerHTML = '<div class="fnow"><i class="fspin"></i>' +
      '<div><strong>' + esc(n.current.title) + '</strong>' +
      '<div class="repmeta">' + esc(n.current.agent) + ' · started ' +
      when(n.current.since) + '</div></div></div>';
  } else if (n.live) {
    out.innerHTML = '<div class="fnow"><i class="fspin"></i><div><strong>A run is going</strong>' +
      '<div class="repmeta">between tasks — nothing in flight this second</div></div></div>';
  } else {
    out.innerHTML = '';
  }
}

/* The batch's own numbers — when it started, how far through it is, what
   made it stop early. Sits in Done rather than in the Queue/Doing card: this
   is a record of the run, the same kind of fact "Latest run costs" is, not a
   description of what's happening or about to. */
function renderDoneStats(n){
  const out = $('#doneStatsOut');
  if (!out) return;
  let html = '';
  if (n.started) {
    html += '<dl class="schedmeta"><dt>Run started</dt><dd>' +
      esc(n.started.slice(0, 16)) + '</dd>' +
      '<dt>Planned</dt><dd>' + n.done.length +
      (n.toPlan ? ' of ' + n.toPlan : '') + '</dd>' +
      (n.left ? '<dt>Left</dt><dd>' + n.left + '</dd>' : '') +
      '</dl>';
  }
  if (n.stopped) html += '<p class="fstop">' + esc(n.stopped) + '</p>';
  if (!n.started) {
    html += '<p class="help">The log has nothing since the last run started. ' +
      'A wake that found no window logs its reason and stops without starting one.</p>';
  }
  out.innerHTML = html;
}

/* What the last run actually cost — sits in Token Session rather than here,
   because it is a cost figure like everything else on that card, not a
   report of what the run is doing right now or what it planned, which are
   Queue/Doing's and Done's jobs. Folded shut like "What runs on a clock" used
   to be and moved below the usage chart, which is what's actually read first
   on this card; the date and the total move onto the fold's own summary
   line, so they're still readable without opening it. It sits outside
   #usageOut's own markup (a sibling, not nested in it), so renderUsage()'s
   full redraw on every range click never touches it and this needs no cache
   of its own. */
function renderRunResults(n){
  const out = $('#runResultsOut');
  const fold = $('#runResultsFold');
  const summary = $('#runResultsSummary');
  if (!out) return;
  let html = '';
  let label = 'Latest run costs';
  if (n.done.length) {
    const spent = n.done.reduce((a, d) => a + d.cost, 0);
    // The date the batch started, not the date of any one task within it —
    // a run that crosses midnight still reads as one night's work.
    const when = n.started || (n.done[0] || {}).at;
    const date = when
      ? new Date(when.replace(' ', 'T')).toLocaleDateString(undefined, { day:'numeric', month:'short' })
      : '';
    label += (date ? ' — ' + date : '') + ' · $' + spent.toFixed(2);
    html += n.done.map(d => flightRowHTML(d, 'done')).join('');
  }
  if (n.failed.length) {
    html += '<h4 class="fhead">Failed</h4>' +
      n.failed.map(d => flightRowHTML(d, 'failed')).join('');
  }
  out.innerHTML = html;
  if (summary) summary.textContent = label;
  if (fold) fold.classList.toggle('hidden', !n.done.length && !n.failed.length);
}

/* Spending money is a deliberate press and then a second one. The confirm says
   what it will cost and what it will do, because "run the agent" does not
   convey either — and the one thing worth being clear about is that it plans
   and never executes, which is true of the agent whatever hour it runs at. */
function confirmNightAgentRun(){
  const n = queueRows.length;
  showModal('Run the night agent now?', 'It normally waits for the small hours',
    '<div class="repdoc">' +
      '<p>' + (n ? 'It will work through the <strong>' + n + '</strong> task' +
        (n === 1 ? '' : 's') + ' in the queue, in that order, one agent each'
        : 'There is nothing in the queue, so it will start and stop') +
      ', and write a plan for each into the Plans column.</p>' +
      '<p>Up to <strong>$12</strong> across the batch and <strong>$2</strong> a task, ' +
      'stopping early if either runs out. It ignores the clock and the usage window, ' +
      'so it will spend in whatever window is open now — including the one you are ' +
      'working in.</p>' +
      '<p>Nothing it writes is carried out. Every plan waits for you.</p>' +
    '</div>',
    [{ label:'Run it', primary:true, run: startNightAgentRun },
     { label:'Cancel' }]);
}

async function startNightAgentRun(){
  try {
    await postJSON('/night_agent/run');
    showToast('The agent is running. Watch it here.', 'good');
    // The log gets its first line within a second or two; the poll's own ten
    // seconds is too long to wait when you have just pressed the button.
    setTimeout(renderNightAgent, 1200);
  } catch (err) {
    showToast('Could not start it: ' + (err.message || err), 'bad');
  }
}

/* Polls while the tab is on Plans and stops the moment it is not. Faster while
   a run is live, because that is the only time anything moves; an agent takes
   minutes, so ten seconds is frequent enough to watch and rare enough to
   ignore. */
async function renderNightAgent(){
  clearTimeout(flightTimer);
  if (!$('#queueDoingCard')) return;
  let live = false;
  try {
    const n = await getJSON('/night-agent.json');
    live = !!n.live;
    const errBox = $('#nightAgentErr');
    if (errBox) errBox.classList.add('hidden');
    renderQueueDoingHead(live, n.orphan);
    renderDoing(n);
    renderDoneStats(n);
    renderRunResults(n);
  } catch (err) {
    const errBox = $('#nightAgentErr');
    if (errBox) {
      errBox.classList.remove('hidden');
      errBox.textContent = 'Could not read the run log. ' + String(err.message || err);
    }
  }
  flightTimer = setTimeout(() => {
    if (state.view === 'plans' && $('#queueDoingCard')) renderNightAgent();
  }, live ? 10000 : 60000);
}

async function renderPlansView(){
  $('#lists').innerHTML =
    '<div class="lists pview">' +
      '<div class="listcard reportsview backlogview"><h3>Backlog</h3>' +
        '<p class="help listlead">Held back from the board, or excluded by a rule.</p>' +
        '<div id="backlogOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview queueview" id="queueDoingCard">' +
        '<div class="cardhead"><h3 id="qdTitle">Queue</h3>' +
          '<button class="btn mini qrun" id="runQueueBtn" type="button">Run now</button></div>' +
        '<div class="err hidden" id="nightAgentErr"></div>' +
        '<h4 class="fhead">Status</h4>' +
        '<div id="statusOut">Loading…</div>' +
        '<div class="hidden" id="qdOrphan"></div>' +
        '<p class="help listlead" id="qdLead">What tonight\'s run would plan, in order.</p>' +
        '<div id="queueOut">Loading…</div>' +
        '<div class="hidden" id="doingOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview processed"><h3>Inbox</h3>' +
        '<div id="doneStatsOut"></div>' +
        '<p class="help listlead">What the night agent has worked out, waiting to be read.</p>' +
        '<div id="plansOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview decided"><h3>Decided</h3>' +
        '<p class="help listlead">Already ruled on — agreed and waiting to run, sent back, or actioned.</p>' +
        '<div id="plansDecided">Loading…</div>' +
      '</div>' +
      '<div class="pvcol">' +
        '<div class="listcard schedview usage"><h3>Token Session</h3>' +
          '<div id="usageOut">Loading…</div>' +
          '<details class="ufold hidden" id="runResultsFold"><summary id="runResultsSummary">Latest run costs</summary>' +
            '<div id="runResultsOut"></div>' +
          '</details>' +
        '</div>' +
        '<div class="listcard reportsview clockview"><h3>What runs on a clock</h3>' +
          '<div id="schedOut">Loading…</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  $('#runQueueBtn').onclick = () => confirmNightAgentRun();
  const out = $('#plansOut');
  try {
    const res = await fetch('/plans.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      out.innerHTML = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about plans yet.</div>';
      return;
    }
    planList = (await res.json()).plans || [];
    if (!planList.length) {
      out.innerHTML = '<div class="empty">Nothing yet. The night agent writes into ' +
        '<code>data/plans/</code>; the queue on the left is what it would pick up tonight.</div>';
      /* The Decided column has no reason to explain where plans come from —
         the column beside it just did — so it only says it is empty rather
         than sitting on "Loading…" forever. */
      const dec = $('#plansDecided');
      if (dec) dec.innerHTML = '<div class="empty">Nothing ruled on yet.</div>';
    } else {
      renderPlansList();
    }
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the plan list. ' +
      esc(String(err.message || err)) + '</div>';
  }
  // The rest after the plans have painted: reconstructing a month of windows
  // is about a second, and nothing else should wait on it.
  renderQueue();
  renderNightAgent();
  renderSched();
  renderUsage();
}

