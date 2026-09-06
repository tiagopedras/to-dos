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
   is_stale() in night_agent/pick.py, the two other places these are known.
   ========================================================================= */

const planBodies = {};
let planList = [];

/* A folded plan is one whose agent stopped and asked rather than guessing —
   see the folding rule in night_agent/PLAN-BRIEF.md. It is marked here rather than
   left to read like any other, because the two want opposite things from him:
   a plan wants reading, a fold wants answering. */
const PLAN_CLASS = { actioned:' actioned', read:' read', agreed:' agreed', redo:' redo' };

function planItemHTML(p){
  const folded = p.outcome === 'folded';
  const meta = [p.bucket, p.column, p.night].filter(Boolean).map(esc).join(' · ');
  const cls = (PLAN_CLASS[p.status] || '') + (folded ? ' folded' : '');
  return '<article class="repitem' + cls + '" data-plan="' + esc(p.url) + '">' +
    '<button class="rephead" data-plan-open="' + esc(p.url) + '">' +
      '<span class="reptitle">' + esc(p.title) + '</span>' +
      (folded ? '<span class="planfold" title="The agent stopped and asked rather than guessing">needs you</span>' : '') +
      '<span class="repdate">' + esc(p.status === 'unread' ? 'new' : p.status) + '</span>' +
    '</button>' +
    (meta ? '<div class="repmeta">' + meta + '</div>' : '') +
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
  const sub = [p.bucket, p.column, p.night, p.agent].filter(Boolean).map(esc).join(' · ');
  /* Four buttons and only two of them are decisions. Agree and Send back are
     the pair this view exists for; Mark actioned stays for the plans he
     carries out himself, which is still most of them. Agree is not the primary
     button — the primary is the one pressed by reflex on the way out, and
     approving work to run should not be reachable by reflex. */
  openDocModal({
    title: p.title, sub, cache: planBodies, url: p.url, load: loadPlanBody,
    buttons: [{ label:'Agree, hand it over', run: () => agreePlan(p) },
              { label:'Send it back', run: () => rejectPlan(p) },
              { label:'Mark actioned', run: () => setPlanStatus(p, 'actioned') },
              { label:'Close', primary:true }]
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

function renderPlansList(){
  const out = $('#plansOut');
  if (!out) return;
  /* Agreed plans sit above the rest rather than among them. They are the ones
     with work owed on them, and the question they answer is different: the
     others ask to be read, these ask to be run. */
  const agreed = planList.filter(p => p.status === 'agreed');
  const live = planList.filter(p => p.status !== 'actioned' && p.status !== 'agreed');
  const done = planList.filter(p => p.status === 'actioned');
  out.innerHTML =
    (agreed.length
      ? '<div class="planagreed"><h4>Agreed, waiting to be run</h4>' +
        '<p class="help">Start a session and run <code>/pa-do</code>.</p>' +
        agreed.map(planItemHTML).join('') + '</div>'
      : '') +
    (live.length ? live.map(planItemHTML).join('')
                 : (agreed.length ? ''
                    : '<div class="empty">Nothing waiting. Everything written has been actioned.</div>')) +
    (done.length ? '<details><summary>' + done.length + ' actioned</summary>' +
                   done.map(planItemHTML).join('') + '</details>' : '');
  out.querySelectorAll('[data-plan-open]').forEach(btn => {
    const p = planList.find(x => x.url === btn.dataset.planOpen);
    btn.onclick = () => openPlanModal(p);
  });
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
   rule in night_agent/pick.py still does that. A title in the file that has since
   been ticked off, blocked or renamed is simply never matched, which is why
   nothing here ever needs pruning.
   ------------------------------------------------------------------------- */

let queueRows = [];      // what tonight would plan, in order
let queueHeld = [];      // deliberately held back — lives in the Backlog column
let queueSkipped = [];   // dropped by a rule — lives in the Backlog column too
let queueOrder = [];     // the stored ordering, so held ranks survive a save
let queueDrag = null;    // { title, from: 'queue' | 'held' } while a card is being dragged

function queueRowHTML(r){
  const meta = [r.bucket, r.column, r.agent].filter(Boolean).map(esc).join(' · ');
  return '<article class="qitem" draggable="true" data-qtitle="' + esc(r.title) + '">' +
    '<div class="qhead">' +
      '<span class="qpos">' + r.position + '</span>' +
      '<span class="qtitle">' + esc(r.title) + '</span>' +
      '<button class="qhold" data-qhold="' + esc(r.title) + '" ' +
        'title="Hold it back from tonight">Hold</button>' +
    '</div>' +
    (meta ? '<div class="repmeta">' + meta + '</div>' : '') +
    '<div class="qwhy">' + esc(r.why || '') +
      (r.last ? ' · last planned ' + esc(r.last) : '') + '</div>' +
  '</article>';
}

function renderQueueList(){
  const out = $('#queueOut');
  if (!out) return;
  out.innerHTML = queueRows.length
    ? queueRows.map(queueRowHTML).join('')
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
   the board on one hand, excluded by a rule in night_agent/pick.py on the other.

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
  return '<article class="qitem held" draggable="true" data-qtitle="' + esc(r.title) + '">' +
    '<div class="qhead">' +
      '<span class="qpos">—</span>' +
      '<span class="qtitle">' + esc(r.title) + '</span>' +
      '<button class="qhold" data-qrelease="' + esc(r.title) + '" ' +
        'title="Put it back in the queue">Release</button>' +
    '</div>' +
    (meta ? '<div class="repmeta">' + meta + '</div>' : '') +
    '<div class="qwhy">' + esc(r.why || '') + '</div>' +
  '</article>';
}

function renderBacklogList(){
  const out = $('#backlogOut');
  if (!out) return;
  out.innerHTML =
    (queueHeld.length
      ? '<p class="help listlead">Drag back into the queue to plan it tonight.</p>' +
        queueHeld.map(heldRowHTML).join('')
      : '') +
    (queueSkipped.length
      ? (queueHeld.length ? '<h4 class="fhead">Not eligible</h4>' : '') +
        queueSkipped.map(r =>
          '<div class="qskip"><span>' + esc(r.title) + '</span><em>' + esc(r.why) + '</em></div>'
        ).join('')
      : '') +
    (!queueHeld.length && !queueSkipped.length
      ? '<div class="empty">Nothing held back, and nothing excluded right now.</div>'
      : '');
  const wrap = $('#backlogOut');
  wrap.querySelectorAll('[data-qrelease]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); releaseHeld(btn.dataset.qrelease); };
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
   Next run — the run happening right now, or the last one that happened.

   Read from the lock directory and the log, which is the only honest way: the
   agents are subprocesses of a shell launchd started, and nothing here can ask
   them anything. One card, because plan.py runs its agents strictly one at a
   time, which is a deliberate choice rather than a limitation — a runaway
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

function renderFlight(n){
  const out = $('#flightOut');
  if (!out) return;
  const when = s => s ? esc(s.slice(11, 16)) : '';
  let html = '';

  if (n.live && n.current) {
    html += '<div class="fnow"><i class="fspin"></i>' +
      '<div><strong>' + esc(n.current.title) + '</strong>' +
      '<div class="repmeta">' + esc(n.current.agent) + ' · started ' +
      when(n.current.since) + '</div></div></div>';
  } else if (n.live) {
    html += '<div class="fnow"><i class="fspin"></i><div><strong>A run is going</strong>' +
      '<div class="repmeta">between tasks — nothing in flight this second</div></div></div>';
  } else if (n.orphan) {
    html += '<div class="err">The last run stopped part way through <strong>' +
      esc(n.orphan.title) + '</strong> and never finished. Its lock is gone, so ' +
      'nothing is running now.</div>';
  } else {
    html += '<div class="fidle">Nothing running. The next wake is on the hour, ' +
      'and it plans only if a usage window allows it.</div>';
  }

  if (n.started) {
    html += '<dl class="schedmeta"><dt>Run started</dt><dd>' +
      esc(n.started.slice(0, 16)) + '</dd>' +
      '<dt>Planned</dt><dd>' + n.done.length +
      (n.toPlan ? ' of ' + n.toPlan : '') + '</dd>' +
      (n.left ? '<dt>Left</dt><dd>' + n.left + '</dd>' : '') +
      '</dl>';
  }
  if (n.stopped) html += '<p class="fstop">' + esc(n.stopped) + '</p>';

  /* Only when nothing is going. run.sh holds a lock and would refuse a second
     batch anyway, but it refuses by logging and exiting cleanly, which from a
     button looks exactly like starting — so the button is not offered rather
     than offered and quietly ignored. */
  if (!n.live) {
    html += '<button class="btn frun" id="runNight">Run the agent now</button>';
  }
  if (!n.started) {
    html += '<p class="help">The log has nothing since the last run started. ' +
      'A wake that found no window logs its reason and stops without starting one.</p>';
  }
  out.innerHTML = html;
  const btn = $('#runNight');
  if (btn) btn.onclick = () => confirmNightAgentRun();
}

/* What the last run actually cost — sits in the Token windows column rather
   than here, because it is a cost figure like everything else on that card,
   not a report of what the run is doing right now, which is all Next run
   shows. */
function renderRunResults(n){
  const out = $('#runResultsOut');
  if (!out) return;
  let html = '';
  if (n.done.length) {
    const spent = n.done.reduce((a, d) => a + d.cost, 0);
    // The date the batch started, not the date of any one task within it —
    // a run that crosses midnight still reads as one night's work.
    const when = n.started || (n.done[0] || {}).at;
    const date = when
      ? new Date(when.replace(' ', 'T')).toLocaleDateString(undefined, { day:'numeric', month:'short' })
      : '';
    html += '<h4 class="fhead">Latest run costs' + (date ? ' — ' + esc(date) : '') +
      ' · $' + spent.toFixed(2) + '</h4>' +
      n.done.map(d => flightRowHTML(d, 'done')).join('');
  }
  if (n.failed.length) {
    html += '<h4 class="fhead">Failed</h4>' +
      n.failed.map(d => flightRowHTML(d, 'failed')).join('');
  }
  out.innerHTML = html;
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
  const out = $('#flightOut');
  if (!out) return;
  let live = false;
  try {
    const n = await getJSON('/night-agent.json');
    live = !!n.live;
    renderFlight(n);
    renderRunResults(n);
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the run log. ' +
      esc(String(err.message || err)) + '</div>';
  }
  flightTimer = setTimeout(() => {
    if (state.view === 'plans' && $('#flightOut')) renderNightAgent();
  }, live ? 10000 : 60000);
}

async function renderPlansView(){
  $('#lists').innerHTML =
    '<div class="lists pview">' +
      '<div class="listcard reportsview backlogview"><h3>Backlog</h3>' +
        '<p class="help listlead">Held back from the board, or excluded by a rule. Drag a ' +
        'card between here and the queue to hold it back or bring it in — the excluded ' +
        'ones need the underlying reason fixed first, not a drag.</p>' +
        '<div id="backlogOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview queueview"><h3>Queue for tonight</h3>' +
        '<p class="help listlead">Worked out from the list as it stands now, not booked ' +
        'in advance. Drag to change what gets planned first — the run stops on a budget ' +
        'or a usage limit, so the top of this list is the part that reliably happens.</p>' +
        '<div id="queueOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview flightview"><h3>Next run</h3>' +
        '<p class="help listlead">One task at a time, on purpose. Read from the run\'s own ' +
        'lock and log, so this is what is happening rather than what was asked for.</p>' +
        '<div id="flightOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview processed"><h3>Plans</h3>' +
        '<p class="help listlead">One per task tagged <code>ai:full</code>, researched ' +
        'overnight. Nothing here has been done: each one proposes a course of action ' +
        'and waits for you to agree it, send it back, or do it yourself.</p>' +
        '<div id="plansOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard schedview usage"><h3>Token windows</h3>' +
        '<div id="runResultsOut"></div>' +
        '<div id="usageOut">Loading…</div>' +
        '<details class="ufold"><summary>What runs on a clock</summary>' +
          '<div id="schedOut">Loading…</div>' +
        '</details>' +
      '</div>' +
    '</div>';
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

