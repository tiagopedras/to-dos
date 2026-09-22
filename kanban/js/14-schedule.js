'use strict';

/* =========================================================================
   4b2c. What runs on a clock, and what the usage windows are doing.

   Three things around this app run on a schedule rather than on demand: the
   Plan agent's wakes, the companion's morning briefing, and the weekly backup
   thread inside this server. Both halves live behind one button in the Data
   menu, Spend and schedules — renderSched() draws the jobs into their own card and
   renderUsage() draws the token chart, both inside the modal openRefCards()
   (13-agent-run.js) opens. Nothing here holds a view id or a route, just the
   render functions that modal calls.

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
async function renderUsage(){
  try {
    const u = await getJSON('/usage.json?days=' + usageDays);
    /* The chart lives in a modal and is absent most of the time, so only the
       drawing is skipped when it is shut — paintRefCards() does nothing then. */
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
