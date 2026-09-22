'use strict';

/* =========================================================================
   4b2b. The Plan agent's run, and the Spend and clocks sheet.

   This file was 13-plans.js, the Plans view, until 22 Sep 2026. Plans stopped
   being a board of its own when an agent's part of a task became sub-tasks on the
   task's own card: a plan is read from the review sub-task behind it
   (openPlanReader() in 19-drawer.js), and where it stands is the state of those
   sub-tasks. What survives here is the two things that were only ever reached
   from that view and are not about plans: the sheet with Token Session and the
   jobs that run on a clock, and the button that starts the Plan agent now.

   Both are opened from the Data menu. Nothing here touches todo.md.
   ========================================================================= */

/* The last read of /planning-agent.json, kept for the run-cost fold in the sheet.
   It used to be polled while Plans was on screen; now it is read when the sheet
   opens, which is when anything shows it. */
let lastNightAgent = null;

async function readNightAgent(){
  try {
    lastNightAgent = await getJSON('/planning-agent.json');
    renderRunResults(lastNightAgent);
  } catch (err) { /* the fold stays as it was; the rest of the sheet does not need it */ }
}

/* What the last run actually cost — sits in Token Session rather than anywhere
   else, because it is a cost figure like everything else on that card. Folded
   shut, with the date and the total on the fold's own summary line. */
function renderRunResults(n){
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
  }
  setRunResults({ label, done: n.done, failed: n.failed });
}

/* Spending money is a deliberate press and then a second one. The confirm says
   what it will cost and what it will do, because "run the agent" does not
   convey either — and the one thing worth being clear about is that it plans
   and never executes, which is true of the agent whatever hour it runs at. */
function confirmNightAgentRun(){
  showModal('Run the Plan agent now?', 'It normally waits for the small hours',
    '<div class="repdoc">' +
      '<p>It will work through every task with an open Plan sub-task assigned to it, ' +
      'in the order they sit on the board, one agent each, and leave a plan for each ' +
      'behind its review.</p>' +
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
    await postJSON('/planning_agent/run');
    showToast('The agent is running.', 'good');
  } catch (err) {
    showToast('Could not start it: ' + (err.message || err), 'bad');
  }
}

/* Token Session and the clock card, both reference rather than decision — the
   chart is a glance at spend, the clock card only changes when the plist does —
   so they are a press away, from the Data menu.

   The body is one React tree, painted by paintRefCards(). Each renderer keeps
   its own slice of what it shows and paints only if the modal is open, so a
   fetch that lands after it has shut costs nothing. */
function openRefCards(){
  /* One React tree in the body, drawn by paintRefCards() in 14-schedule.js. The
     modal is a sheet the board builds as a string; what goes in it is not. */
  showModal('Spend, and what runs on a clock',
    'Both are reference. Nothing on either changes what tonight does.',
    '<div id="refCardsRoot"></div>',
    [{ label:'Close', primary:true }],
    { wide:true, onClose: () => { const host = $('#refCardsRoot'); if (host) BoardUI.unmount(host); } });
  paintRefCards();
  renderSched();
  renderUsage();
  if (lastNightAgent) renderRunResults(lastNightAgent);
  readNightAgent();
}

$('#refCardsBtn').onclick = () => { closeDataMenu(); openRefCards(); };
$('#runAgentBtn').onclick = () => { closeDataMenu(); confirmNightAgentRun(); };
