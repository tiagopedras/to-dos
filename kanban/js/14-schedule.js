'use strict';

/* =========================================================================
   4b2c. What runs on a clock, and what the usage windows are doing.

   Three things around this app run on a schedule rather than on demand: the
   planning agent's twelve launchd wakes, the companion's morning briefing,
   and the weekly backup thread inside this server. Used to be a view of its
   own; both halves now live behind one button on the Plans tab instead, since
   that is where the question "would it even run tonight" comes up, and neither
   half is worth a column of that view to answer it — renderSched() draws the
   jobs into their own card and renderUsage() draws the token chart, both inside
   the modal openRefCards() opens. Nothing here holds a view id or a route any
   more, just the render functions Plans calls — renderUsage() also feeds the
   To do column's own description, which is on the view itself whether the
   modal is open or not, see renderStatus() below.

   A list rather than a calendar, deliberately. Twelve wakes a night render as
   noise on a grid and as one line in a list.

   Two sources behind it, and they are not alternatives — the server's
   schedule_listing() explains why. Live says whether a job is armed and when it
   fires next; the log says what it actually did.

   The second half is the usage windows, which have no other home. The nightly
   agent's whole schedule is built around them, and until now the only way to
   see one was to run core/windows.py at a terminal.
   ========================================================================= */

/* "Tue 16 Sept, 00:15". One format for every time this file prints, so the
   line in the schedule modal and the two on Plans' column heads agree. */
function schedWhen(iso){
  if (!iso) return '';
  const d = new Date(String(iso).replace(' ', 'T'));
  if (isNaN(d)) return '';
  return d.toLocaleString([], { weekday:'short', day:'numeric', month:'short',
                                hour:'2-digit', minute:'2-digit' });
}

/* What the modal's React tree is drawn from. Each renderer below fills its own
   slice and calls paintRefCards(), which draws only when the modal is open, so
   a fetch that lands after it has shut costs nothing. The chart, the job list
   and the run-cost fold are RefCards in kanban/ui/RefCards.tsx. */
let usageState = { kind: 'loading' };
let schedState = { kind: 'loading' };
let runResultsState = null;

function setRunResults(r){
  runResultsState = r;
  paintRefCards();
}

function paintRefCards(){
  const host = $('#refCardsRoot');
  if (!host) return;
  BoardUI.mount(host, BoardUI.RefCards({
    usage: usageState,
    days: usageDays,
    ranges: USAGE_RANGES,
    onDays: days => { usageDays = days; renderUsage(); },
    schedule: schedState,
    runResults: runResultsState
  }));
}

/* How far back the chart looks. Four stops rather than a free number: these
   are the four questions actually asked of it — what happened last night, the
   last few nights, the week, the month — and a spinner for a value nobody
   tunes is a control to ignore. Kept in the page rather than the URL or a
   file: it is a way of looking at the card, not a fact about the list. */
const USAGE_RANGES = [
  { days: 1, label: '24h' },
  { days: 3, label: '3d' },
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
];
/* Three days by default. A month is what this card used to show and it was
   unreadable — eighty-three windows in a 380px column is a barcode — and one
   day is too short to tell you whether last night was unusual. */
let usageDays = 3;

const hm = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');

/* How much of the current usage window is left. This used to be a decision —
   ride, open or stop — because a window that outlived 07:00 stopped the night
   agent dead. That rule went on 9 Sep 2026, so what is left is a measurement:
   the run is gated by its schedule now, and this says whether there is capacity
   sitting there. Drawn into the To do column's own description in
   13-plans.js rather than into this chart's own #usageOut, since it answers a
   question about tonight's run; still fetched here, because /usage.json is
   the only route that knows it and one call draws both. */
/* When the planning agent next wakes, as `/schedule.json` reports it. Held
   here because two things want it and neither should fetch it twice: this
   file's own status line and, once it has landed, Plans' To do column. Empty
   until renderNextRun() has been round. */
let nextRunAt = '';

function renderStatus(u){
  /* Handed over rather than assigned: the description is a prop on the React
     tree PlansView mounts, like every other body on that view. setPlansStatus
     is 13-plans.js's, and is absent on every other view. */
  if (typeof setPlansStatus !== 'function') return;
  /* The column's own question is "when does this get picked up", so the answer
     leads and the capacity reading follows it as a second sentence. Both used
     to need the schedule modal opened to find. */
  const lead = nextRunAt ? 'Next run ' + schedWhen(nextRunAt) + '.' : '';
  const w = u && u.window;
  const rest = !w || !w.expires
    ? 'No session open right now.'
    : 'Session open — closes ' + hm(new Date(w.expires)) + ', ' +
      Math.max(0, Math.round((new Date(w.expires) - new Date()) / 60000)) + ' min left.';
  setPlansStatus([lead, rest].filter(Boolean).join(' '));
}

/* Reads the planning agent's next wake off the schedule and repaints the
   status line with it. A failure is silent: the line still has the window
   sentence to say, and an error banner over a column description would be
   louder than the fact is worth. */
let lastUsage = null;
async function renderNextRun(){
  try {
    const res = await fetch('/schedule.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) return;
    const jobs = (await res.json()).jobs || [];
    const job = jobs.find(j => j.id === 'plan-agent');
    nextRunAt = (job && job.next) || '';
    if (nextRunAt) renderStatus(lastUsage);
  } catch (err) { /* silent, see above */ }
}

async function renderUsage(){
  try {
    const u = await getJSON('/usage.json?days=' + usageDays);
    lastUsage = u;
    renderStatus(u);
    /* The chart lives in a modal off Plans and is absent most of the time; the
       Status line above it is not. So the fetch happens either way and only the
       drawing is skipped — paintRefCards() does nothing with the modal shut. */
    usageState = { kind: 'ok', usage: u };
  } catch (err) {
    usageState = { kind: 'error', message: String(err.message || err) };
  }
  paintRefCards();
}

/* The jobs half only — the modal's tree holds both cards and renderUsage()
   feeds the other one. */
async function renderSched(){
  try {
    const res = await fetch('/schedule.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      schedState = { kind: 'stale' };
    } else {
      const jobs = (await res.json()).jobs || [];
      schedState = { kind: 'ok', jobs: jobs.map(j => ({
        name: j.name, armed: !!j.armed, state: j.state, what: j.what,
        schedule: j.schedule, next: j.next ? schedWhen(j.next) : null,
        last: j.last, hint: j.hint, recent: j.recent
      })) };
    }
  } catch (err) {
    schedState = { kind: 'error', message: String(err.message || err) };
  }
  paintRefCards();
}
