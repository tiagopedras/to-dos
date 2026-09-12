'use strict';

/* =========================================================================
   4b2c. Execution — the implementing agent's half, drawn as five columns.

   Three boards in this app now and Backlog, To do, Waiting for review and Done
   mean the same thing on all three. Doing is the one Plans grew on 12 Sep 2026
   and this view didn't, because nothing was writing `doing` for it to draw —
   see IMPROVEMENTS.md for who eventually sets it. Drawn anyway, on the same
   reasoning renderPlanDoing() already carries: a state the stream declares and
   the view cannot show is a card that vanishes the moment something does set it.

     Backlog            the agent leaves it alone. Everything he accepted on the
                        Plans view lands here, and nothing happens to it.
     To do              he wants the implementing agent to carry this one out.
     Doing              it is running right now. Not his to start or stop, so it
                        takes no drops, same as Waiting for review.
     Waiting for review it did the work and wrote back. His column to empty, not
                        to fill — so it takes no drops and draws dashed.
     Done               he accepts what it did.

   A card here is a **run**, one document per plan he accepted, in
   data/<dataset>/runs/. Not the plan itself: a plan and the run that carries it
   out are two work items about one task and they sit in different columns at
   the same time — a plan he has accepted is finished as a plan and not started
   as a run. One document cannot hold two states, which is what
   PACKAGES/work_streams/CONTRACT.md exists to stop, so an accepted plan mints a
   run and the plan file is never written again.

   Nothing here runs anything, and that is load-bearing rather than incidental.
   The implementing agent holds write tools, and the whole reason it is allowed to is
   that it can stop and ask — which it can only do from a session Tiago is in.
   So To do is a list `/pa-do` works through when he starts it, not a queue
   anything picks up on a clock. See agents/implementing_agent/README.md.
   ========================================================================= */

const runBodies = {};
let runList = [];

const RUN_COL = { backlog:'backlog', todo:'todo', doing:'doing', review:'review', done:'done' };
function runColumn(r){
  if (r.state === 'ready') return RUN_COL.todo;
  if (r.state === 'doing') return RUN_COL.doing;
  if (r.state === 'review') return RUN_COL.review;
  if (r.state === 'done') return RUN_COL.done;
  return RUN_COL.backlog;
}

function runWord(r){
  if (r.state === 'doing') return 'running';
  if (r.state === 'ready') return 'to do';
  if (r.state === 'done') return 'accepted';
  if (r.state === 'review') return r.seen ? 'read' : 'new';
  return 'waiting on you';
}

/* The run card's left stripe, on the same rule the plan card's is on — see
   planStripe() in 13-plans.js. Same two colours for the same two reasons:
   something has arrived, or something is settled. */
function runStripe(r){
  if (r.state === 'review' && !r.seen) return 'var(--b1)';
  if (r.state === 'done') return 'var(--green)';
  return 'var(--line)';
}

function runClass(r){
  if (r.state === 'done') return ' actioned';
  if (r.state === 'ready' || r.state === 'doing') return ' agreed';
  if (r.state === 'review') return r.seen ? ' read' : '';
  return ' parked';
}

/* The same row the Plans view draws, down to the class names, because it is the
   same kind of thing being read: a document about one task, with that task's own
   scores beside it and a way back to the card. Sharing the markup rather than
   the function — planItemHTML() reads a plan's fields — keeps one stylesheet
   answering for both without either view reaching into the other's model. */
function runItemHTML(r){
  const task = r.slug || r.task ? findTaskByKey(r.slug || r.task) : null;
  const key = r.slug || r.task || '';
  const goto = key
    ? '<button class="plangoto" data-run-goto="' + esc(key) +
      '" title="Open this task on the board">' + esc(task ? task.title : key) + ' \u2197</button>'
    : '';
  const where = [r.bucket, r.column, r.created].filter(Boolean).map(esc).join(' \u00b7 ');
  const stripe = runStripe(r);
  /* The same shell the plan card and the task card draw through — see
     cardShellHTML() in 09-columns.js. It was the same markup as the plan card
     by hand before that, kept in step by a comment; it is the same function
     now, so it cannot drift. The state word is the eyebrow here too. */
  return cardShellHTML({
    cls: 'repitem planitem' + runClass(r) + (stripe ? '' : ' nostripe'),
    attrs: 'draggable="true" data-run="' + esc(r.name) + '" data-run-open="' + esc(r.name) + '"',
    stripe: stripe,
    eyebrow: '<span class="bucket">' + esc(runWord(r)) + '</span>',
    title: esc(r.title),
    tags: planScoreHTML(task),
    meta: (where ? '<span class="planwhere">' + where + '</span>' : '') + goto,
    summary: r.summary ? mdInline(r.summary) : '',
    extra: r.feedback
      ? '<div class="planredo"><b>Sent back:</b> ' + esc(r.feedback) + '</div>' : ''
  });
}

async function loadRunBody(url){
  return loadDocBody(url, runBodies, 'run', {});
}

function openRunModal(r){
  const sub = [r.bucket, r.column, r.created].filter(Boolean).map(esc).join(' · ');
  openDocModal({
    title: r.title, sub, cache: runBodies, url: r.url, load: loadRunBody,
    buttons: [{ label:'Accept it', agree:true, run: () => acceptRun(r) },
              { label:'Hand it over', reject:false, run: () => queueRun(r) },
              { label:'Leave it alone', run: () => moveRun(r, 'backlog', 'me') }]
  });
  if (r.state === 'review' && !r.seen) moveRun(r, 'review', 'me', { seen:true, quiet:true });
}

async function moveRun(r, state, owner, opts){
  opts = opts || {};
  const seen = opts.seen !== undefined ? opts.seen : true;
  try {
    const res = await postJSON('/stream/apply', {
      stream: 'runs',
      item: { name: r.name },
      to: state, owner, seen,
      resolution: opts.resolution || '',
      reason: opts.reason || '',
      again: !!opts.again
    });
    if (res && res.ok === false) throw new Error(res.error || 'the stream refused it');
    r.state = state; r.owner = owner; r.seen = seen;
    if (opts.resolution) r.resolution = opts.resolution;
    if (opts.reason) r.feedback = opts.reason;
    if (!opts.quiet) renderRunColumns();
  } catch (err) {
    if (!opts.quiet) showToast('Could not move that: ' + (err.message || err), 'bad');
  }
}

/* To do. Nothing starts here — the agent is invoked from a session, which is
   the only place it can stop and ask, and a queue that ran itself would have
   thrown that away. A run coming back from Waiting for review or Done is him
   asking for it to be done again, so that one carries a reason. */
let runAgainText = '';
function queueRun(r){
  const again = r.state === 'review' || r.state === 'done';
  if (!again) {
    showModal('Hand this to the implementing agent?', esc(r.title),
      '<div class="repdoc">' +
        '<p>It moves to <strong>To do</strong> and waits there. Nothing runs now.</p>' +
        '<p>To actually run it, start a session and use <code>/pa-do</code>, which ' +
        'works through this column one at a time.</p>' +
      '</div>',
      [{ label:'Yes, hand it over', primary:true, run: () => moveRun(r, 'ready', 'implementing-agent') },
       { label:'Cancel' }]);
    return;
  }
  runAgainText = '';
  showModal('Have it done again?', esc(r.title),
    '<div class="repdoc">' +
      '<p>It goes back to <strong>To do</strong>, and the agent is told what was ' +
      'wrong with what it did. Say what it got wrong, in a sentence.</p>' +
      '<textarea id="runWhy" class="redowhy" rows="3" ' +
        'placeholder="It changed the tokens but never touched the docs."></textarea>' +
    '</div>',
    [{ label:'Yes, do it again', primary:true, run: () => {
        const why = runAgainText.trim();
        if (!why) return showToast('Sending work back needs a reason.', 'bad');
        moveRun(r, 'ready', 'implementing-agent', { reason: why, again: true });
      } },
     { label:'Cancel' }]);
  const box = $('#runWhy');
  if (box) { box.oninput = () => { runAgainText = box.value; }; box.focus(); }
}

function acceptRun(r){
  showModal('Accept what it did?', esc(r.title),
    '<div class="repdoc">' +
      '<p>It moves to <strong>Done</strong> and nothing else happens to it.</p>' +
      '<p>Where the work means the task itself should change, that change is in ' +
      'the report — the implementing agent never writes <code>todo.md</code>. Run ' +
      '<code>/pa</code> to apply it.</p>' +
    '</div>',
    [{ label:'Yes, accept it', primary:true, run: () => moveRun(r, 'done', 'me', { resolution:'actioned' }) },
     { label:'Cancel' }]);
}

/* -------------------------------------------------------------------------
   The four columns, and the one drag between them.
   ------------------------------------------------------------------------- */

let runDrag = null;

function wireRunColumn(out, onDrop, takes){
  out.querySelectorAll('[data-run-open]').forEach(btn => {
    const r = runList.find(x => x.name === btn.dataset.runOpen);
    btn.onclick = () => openRunModal(r);
  });
  out.querySelectorAll('[data-run-goto]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const key = btn.dataset.runGoto;
      if (!key || !findTaskByKey(key)) return showToast('That task is not on the board any more.', 'bad');
      state.view = 'board';
      openTaskByKey(key);
    };
  });
  out.querySelectorAll('.planitem').forEach(row => {
    row.ondragstart = e => {
      runDrag = row.dataset.run;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.run);
      row.classList.add('dragging');
    };
    row.ondragend = () => { runDrag = null; row.classList.remove('dragging'); };
  });
  if (!takes) return;
  out.ondragover = e => {
    if (!runDrag) return;
    e.preventDefault();
    out.classList.add('coldrop');
  };
  out.ondragleave = e => { if (e.target === out) out.classList.remove('coldrop'); };
  out.ondrop = e => {
    if (!runDrag) return;
    e.preventDefault();
    out.classList.remove('coldrop');
    const r = runList.find(x => x.name === runDrag);
    runDrag = null;
    if (r) onDrop(r);
  };
}

function renderRunColumn(id, want, empty, onDrop, takes){
  const out = $(id);
  if (!out) return;
  const rows = plansShown(runList).filter(r => runColumn(r) === want);
  out.innerHTML = rows.length
    ? rows.map(runItemHTML).join('')
    : colEmptyHTML(empty, 'boxed');
  // Same count the board's columns carry, filled once the folder has been read
  // — the column is drawn before the fetch, so it cannot be written into the
  // head at the same moment the head is built.
  setColCount('#' + out.id + 'Col', rows.length);
  wireRunColumn(out, onDrop, takes);
}

function renderRunColumns(){
  renderRunColumn('#runBacklog', RUN_COL.backlog,
    'Nothing accepted yet. A plan you accept on the Plans view lands here.',
    r => moveRun(r, 'backlog', 'me'), true);
  renderRunColumn('#runTodo', RUN_COL.todo,
    'Nothing handed over. Drag one across, then run <code>/pa-do</code> in a session.',
    r => queueRun(r), true);
  // No drop zone: which one is running is not his to choose, same reasoning
  // renderPlanDoing() carries for Plans' own Doing column.
  renderRunColumn('#runDoing', RUN_COL.doing,
    'Nothing running right now.',
    null, false);
  renderRunColumn('#runReview', RUN_COL.review,
    'Nothing waiting on you. The agent writes into this column when it has done something.',
    null, false);
  renderRunColumn('#runDone', RUN_COL.done,
    'Nothing accepted yet.',
    r => acceptRun(r), true);
}

async function renderExecutionView(){
  $('#lists').innerHTML =
    /* The same colHTML() the board and the Plans view draw their columns with,
       and the same five words in the same order Plans uses for its own first
       five. Five rather than Plans' six: this stream has no equivalent of
       Ready to be produced, because accepting what the agent did is the end
       of the work rather than the start of somebody else's. It sets --pcols
       so the row is five tracks wide at the board's own 322 and 12. */
    '<div class="lists pview eview" style="--pcols:5">' +
      colHTML({
        heading: 'h3', title: 'Backlog', cls: 'reportsview backlogview',
        desc: 'Everything you accepted on the Plans view. The agent leaves these alone.',
        count: '',
        attrs: 'id="runBacklogCol"',
        body: '<div id="runBacklog">Loading\u2026</div>'
      }) +
      colHTML({
        heading: 'h3', title: 'To do', cls: 'reportsview queueview',
        desc: 'What you want carried out. Nothing starts on its own \u2014 run ' +
              '<code>/pa-do</code> in a session and it works through this.',
        count: '',
        attrs: 'id="runTodoCol"',
        body: '<div id="runTodo">Loading\u2026</div>'
      }) +
      colHTML({
        heading: 'h3', title: 'Doing', cls: 'reportsview doingview',
        desc: 'Currently running.',
        count: '',
        attrs: 'id="runDoingCol"',
        body: '<div id="runDoing">Loading\u2026</div>'
      }) +
      colHTML({
        heading: 'h3', title: 'Waiting for review', cls: 'reportsview processed', style: 'agent',
        desc: 'The agent\u2019s own column \u2014 what it did, waiting on you. ' +
              'Drag out of it, not into it.',
        count: '',
        attrs: 'id="runReviewCol"',
        body: '<div id="runReview">Loading\u2026</div>'
      }) +
      colHTML({
        heading: 'h3', title: 'Done', cls: 'reportsview decided',
        desc: 'You accepted what it did. Any change to the task itself is in the ' +
              'report, for <code>/pa</code> to apply.',
        count: '',
        attrs: 'id="runDoneCol"',
        body: '<div id="runDone">Loading\u2026</div>'
      }) +
    '</div>';
  /* Mint a run for every plan accepted since the last look, before reading the
     folder. Idempotent, and it is what makes "Backlog is fed by everything in
     the Plans board's Done column" true of plans accepted before this view
     existed rather than only of the ones accepted since. The board asks; the
     runs stream writes. */
  try { await postJSON('/stream/apply', { stream:'runs', op:'sync' }); } catch (err) { /* read-only is still useful */ }
  try {
    const res = await fetch('/runs.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      $('#runBacklog').innerHTML = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about runs yet.</div>';
      return;
    }
    runList = (await res.json()).runs || [];
    renderRunColumns();
  } catch (err) {
    $('#runBacklog').innerHTML = '<div class="err">Could not read the runs. ' +
      esc(String(err.message || err)) + '</div>';
  }
}
