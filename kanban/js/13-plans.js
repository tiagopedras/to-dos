'use strict';

/* =========================================================================
   4b2b. Plans — what the nightly agent worked out while nobody was watching.

   Files in data/<dataset>/plans/<night>/, listed by the server at /plans.json,
   read exactly the way written reports are. They are a separate view rather
   than a third column in Reports because they answer the opposite question: a
   report says what happened, a plan proposes what to do, and a plan stops being
   true the moment it is acted on.

   Three states, and the difference between the last two matters:

     unread    nobody has looked at it
     read      looked at, doing nothing about it yet
     actioned  acted on, so it no longer describes outstanding work

   Marking one actioned is the only write in here, and it writes the plan file.
   The runner's ledger picks it up and plans that task afresh on the next run,
   which is how a task he has moved on gets a new plan instead of being skipped
   for looking unchanged. Nothing in this view goes near todo.md.
   ========================================================================= */

const planBodies = {};
let planList = [];

/* A folded plan is one whose agent stopped and asked rather than guessing —
   see the folding rule in nightly/PLAN-BRIEF.md. It is marked here rather than
   left to read like any other, because the two want opposite things from him:
   a plan wants reading, a fold wants answering. */
function planItemHTML(p){
  const folded = p.outcome === 'folded';
  const meta = [p.bucket, p.column, p.night].filter(Boolean).map(esc).join(' · ');
  const cls = (p.status === 'actioned' ? ' actioned' : (p.status === 'read' ? ' read' : ''))
    + (folded ? ' folded' : '');
  return '<article class="repitem' + cls + '" data-plan="' + esc(p.url) + '">' +
    '<button class="rephead" data-plan-open="' + esc(p.url) + '">' +
      '<span class="reptitle">' + esc(p.title) + '</span>' +
      (folded ? '<span class="planfold" title="The agent stopped and asked rather than guessing">needs you</span>' : '') +
      '<span class="repdate">' + esc(p.status === 'unread' ? 'new' : p.status) + '</span>' +
    '</button>' +
    (meta ? '<div class="repmeta">' + meta + '</div>' : '') +
    (p.summary ? '<div class="repsum">' + mdInline(p.summary) + '</div>' : '') +
  '</article>';
}

/* Opening one marks it read, on the grounds that having it open is what being
   read means. Actioned stays a deliberate press, because that is a claim about
   the work rather than about him, and it is the one the runner acts on. */
function openPlanModal(p){
  const sub = [p.bucket, p.column, p.night, p.agent].filter(Boolean).map(esc).join(' · ');
  openDocModal({
    title: p.title, sub, cache: planBodies, url: p.url, load: loadPlanBody,
    buttons: [{ label:'Mark actioned', run: () => setPlanStatus(p, 'actioned') },
              { label:'Close', primary:true }]
  });
  if (p.status === 'unread') setPlanStatus(p, 'read', true);
}

async function loadPlanBody(url){ return loadDocBody(url, planBodies, 'plan'); }

/* `quiet` is the read-on-open case: it should not redraw the list underneath an
   open modal, which would be a card shuffling itself while he is reading it. */
async function setPlanStatus(p, status, quiet){
  try {
    await postJSON('/plan/status', { night: p.night, name: p.name, status });
    p.status = status;
    if (!quiet) renderPlansList();
  } catch (err) {
    if (!quiet) showToast('Could not mark that plan: ' + (err.message || err), 'bad');
  }
}

function renderPlansList(){
  const out = $('#plansOut');
  if (!out) return;
  const live = planList.filter(p => p.status !== 'actioned');
  const done = planList.filter(p => p.status === 'actioned');
  out.innerHTML =
    (live.length ? live.map(planItemHTML).join('')
                 : '<div class="empty">Nothing waiting. Everything written has been actioned.</div>') +
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
   rule in nightly/pick.py still does that. A title in the file that has since
   been ticked off, blocked or renamed is simply never matched, which is why
   nothing here ever needs pruning.
   ------------------------------------------------------------------------- */

let queueRows = [];      // what tonight would plan, in order
let queueHeld = [];      // deliberately held back
let queueSkipped = [];   // dropped by a rule, with the reason
let queueOrder = [];     // the stored ordering, so held ranks survive a save
let queueDrag = null;

function queueItemHTML(r, i){
  const meta = [r.bucket, r.column, r.agent].filter(Boolean).map(esc).join(' · ');
  const held = r.state === 'held';
  return '<article class="qitem' + (held ? ' held' : '') + '"' +
      (held ? '' : ' draggable="true"') + ' data-qi="' + i + '">' +
    '<div class="qhead">' +
      '<span class="qpos">' + (held ? '—' : r.position) + '</span>' +
      '<span class="qtitle">' + esc(r.title) + '</span>' +
      '<button class="qhold" data-qhold="' + i + '" title="' +
        (held ? 'Put it back in the queue' : 'Hold it back from tonight') + '">' +
        (held ? 'Release' : 'Hold') + '</button>' +
    '</div>' +
    (meta ? '<div class="repmeta">' + meta + '</div>' : '') +
    '<div class="qwhy">' + esc(r.why || '') +
      (r.last ? ' · last planned ' + esc(r.last) : '') + '</div>' +
  '</article>';
}

function renderQueueList(){
  const out = $('#queueOut');
  if (!out) return;
  out.innerHTML =
    (queueRows.length
      ? queueRows.map((r, i) => queueItemHTML(r, i)).join('')
      : '<div class="empty">Nothing to plan tonight. Everything eligible has a ' +
        'plan already, and none of them have changed since.</div>') +
    (queueHeld.length
      ? '<details open class="qfold"><summary>' + queueHeld.length + ' held back</summary>' +
        queueHeld.map((r, i) => queueItemHTML(r, queueRows.length + i)).join('') + '</details>'
      : '') +
    (queueSkipped.length
      ? '<details class="qfold"><summary>' + queueSkipped.length + ' not eligible</summary>' +
        queueSkipped.map(r =>
          '<div class="qskip"><span>' + esc(r.title) + '</span><em>' + esc(r.why) + '</em></div>'
        ).join('') + '</details>'
      : '');
  wireQueue();
}

/* One list of rows across both arrays, indexed the way the DOM is, so a drag
   and a hold press can name a card without caring which half it is in. */
function queueAt(i){
  return i < queueRows.length ? queueRows[i] : queueHeld[i - queueRows.length];
}

function wireQueue(){
  const out = $('#queueOut');
  out.querySelectorAll('[data-qhold]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); toggleHold(+btn.dataset.qhold); };
  });

  /* The same reorder gesture the sub-steps in the drawer use: drop above or
     below whichever card the cursor is over, decided by its midpoint. Held
     cards are not draggable — a held card has no position to hold. */
  const rows = out.querySelectorAll('.qitem:not(.held)');
  const clear = () => rows.forEach(r => r.classList.remove('over-top','over-bottom','dragging'));
  rows.forEach(row => {
    row.ondragstart = e => {
      queueDrag = +row.dataset.qi;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'queue');
      row.classList.add('dragging');
    };
    row.ondragend = () => { queueDrag = null; clear(); };
    row.ondragover = e => {
      if (queueDrag === null) return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      row.classList.toggle('over-bottom', after);
      row.classList.toggle('over-top', !after);
    };
    row.ondragleave = () => row.classList.remove('over-top','over-bottom');
    row.ondrop = e => {
      if (queueDrag === null) return;
      e.preventDefault(); e.stopPropagation();
      const r = row.getBoundingClientRect();
      let to = +row.dataset.qi + (e.clientY > r.top + r.height / 2 ? 1 : 0);
      const from = queueDrag;
      queueDrag = null; clear();
      if (to > from) to--;
      if (to === from) return;
      queueRows.splice(to, 0, queueRows.splice(from, 1)[0]);
      queueRows.forEach((row, i) => { row.position = i + 1; });
      renderQueueList();
      saveQueueOrder(true);
    };
  });
}

function toggleHold(i){
  const row = queueAt(i);
  if (!row) return;
  if (row.state === 'held') {
    row.state = 'queued';
    queueHeld.splice(queueHeld.indexOf(row), 1);
    queueRows.push(row);
  } else {
    row.state = 'held';
    row.why = 'held back from the board';
    queueRows.splice(queueRows.indexOf(row), 1);
    queueHeld.push(row);
  }
  queueRows.forEach((r, n) => { r.position = n + 1; });
  renderQueueList();
  saveQueueOrder(false);
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
  if (!out) return;
  try {
    const res = await fetch('/queue.json?t=' + Date.now(), { cache:'no-store' });
    if (res.status === 404) {
      out.innerHTML = '<div class="empty">No nightly agent in this checkout, so there is ' +
        'nothing queued and nothing to order.</div>';
      return;
    }
    if (!res.ok) {
      out.innerHTML = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about the queue yet.</div>';
      return;
    }
    const q = await res.json();
    queueRows = q.queue || [];
    queueHeld = q.held || [];
    queueSkipped = q.skipped || [];
    queueOrder = q.order || [];
    renderQueueList();
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the queue. ' +
      esc(String(err.message || err)) + '</div>';
  }
}

/* -------------------------------------------------------------------------
   In flight — the run happening right now, or the last one that happened.

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
  if (n.done.length) {
    const spent = n.done.reduce((a, d) => a + d.cost, 0);
    html += '<h4 class="fhead">Written this run — $' + spent.toFixed(2) + '</h4>' +
      n.done.map(d => flightRowHTML(d, 'done')).join('');
  }
  if (n.failed.length) {
    html += '<h4 class="fhead">Failed</h4>' +
      n.failed.map(d => flightRowHTML(d, 'failed')).join('');
  }
  if (!n.started) {
    html += '<p class="help">The log has nothing since the last run started. ' +
      'A wake that found no window logs its reason and stops without starting one.</p>';
  }
  out.innerHTML = html;
  const btn = $('#runNight');
  if (btn) btn.onclick = () => confirmNightlyRun();
}

/* Spending money is a deliberate press and then a second one. The confirm says
   what it will cost and what it will do, because "run the agent" does not
   convey either — and the one thing worth being clear about is that it plans
   and never executes, which is true of the agent whatever hour it runs at. */
function confirmNightlyRun(){
  const n = queueRows.length;
  showModal('Run the nightly agent now?', 'It normally waits for the small hours',
    '<div class="repdoc">' +
      '<p>' + (n ? 'It will work through the <strong>' + n + '</strong> task' +
        (n === 1 ? '' : 's') + ' in the queue, in that order, one agent each'
        : 'There is nothing in the queue, so it will start and stop') +
      ', and write a plan for each into the Written plans column.</p>' +
      '<p>Up to <strong>$12</strong> across the batch and <strong>$2</strong> a task, ' +
      'stopping early if either runs out. It ignores the clock and the usage window, ' +
      'so it will spend in whatever window is open now — including the one you are ' +
      'working in.</p>' +
      '<p>Nothing it writes is carried out. Every plan waits for you.</p>' +
    '</div>',
    [{ label:'Run it', primary:true, run: startNightlyRun },
     { label:'Cancel' }]);
}

async function startNightlyRun(){
  try {
    await postJSON('/nightly/run');
    showToast('The agent is running. Watch it here.', 'good');
    // The log gets its first line within a second or two; the poll's own ten
    // seconds is too long to wait when you have just pressed the button.
    setTimeout(renderNightly, 1200);
  } catch (err) {
    showToast('Could not start it: ' + (err.message || err), 'bad');
  }
}

/* Polls while the tab is on Plans and stops the moment it is not. Faster while
   a run is live, because that is the only time anything moves; an agent takes
   minutes, so ten seconds is frequent enough to watch and rare enough to
   ignore. */
async function renderNightly(){
  clearTimeout(flightTimer);
  const out = $('#flightOut');
  if (!out) return;
  let live = false;
  try {
    const n = await getJSON('/nightly.json');
    live = !!n.live;
    renderFlight(n);
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the run log. ' +
      esc(String(err.message || err)) + '</div>';
  }
  flightTimer = setTimeout(() => {
    if (state.view === 'plans' && $('#flightOut')) renderNightly();
  }, live ? 10000 : 60000);
}

async function renderPlansView(){
  $('#lists').innerHTML =
    '<div class="lists pview">' +
      '<div class="listcard reportsview queueview"><h3>Queue for tonight</h3>' +
        '<p class="help listlead">Worked out from the list as it stands now, not booked ' +
        'in advance. Drag to change what gets planned first — the run stops on a budget ' +
        'or a usage limit, so the top of this list is the part that reliably happens.</p>' +
        '<div id="queueOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview flightview"><h3>In flight</h3>' +
        '<p class="help listlead">One task at a time, on purpose. Read from the run\'s own ' +
        'lock and log, so this is what is happening rather than what was asked for.</p>' +
        '<div id="flightOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview written"><h3>Written plans</h3>' +
        '<p class="help listlead">One per task tagged <code>ai:full</code> or ' +
        '<code>ai:partial</code>, researched overnight. Nothing here has been done — ' +
        'each one proposes a course of action and waits.</p>' +
        '<div id="plansOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard schedview usage"><h3>Token windows</h3>' +
        '<div id="usageOut">Loading…</div>' +
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
      out.innerHTML = '<div class="empty">Nothing yet. The nightly agent writes into ' +
        '<code>data/plans/</code>; the queue on the left is what it would pick up tonight.</div>';
    } else {
      renderPlansList();
    }
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the plan list. ' +
      esc(String(err.message || err)) + '</div>';
  }
  // The other three after the plans have painted, for the same reason the
  // Schedule view defers its usage half: reconstructing a month of windows is
  // about a second, and nothing else should wait on it.
  renderQueue();
  renderNightly();
  renderUsage();
}

