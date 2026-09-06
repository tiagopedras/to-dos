'use strict';

/* =========================================================================
   4b2c. What runs on a clock, and what the usage windows are doing.

   Three things around this app run on a schedule rather than on demand: the
   night agent's twelve launchd wakes, the companion's morning briefing,
   and the weekly backup thread inside this server. Used to be a view of its
   own; both halves now live on the Plans tab instead, since that is where
   the question "would it even run tonight" actually comes up —
   renderSched() draws the jobs into their own card, stacked under Token
   Session (rarely worth a glance, so it sits below the chart rather than
   beside it), and renderUsage() draws the token chart itself. Nothing here
   holds a view id or a route any more, just the render functions Plans
   calls — renderUsage() also feeds the Status line on the Queue/Doing card,
   see renderStatus() below.

   A list rather than a calendar, deliberately. Twelve wakes a night render as
   noise on a grid and as one line in a list.

   Two sources behind it, and they are not alternatives — the server's
   schedule_listing() explains why. Live says whether a job is armed and when it
   fires next; the log says what it actually did.

   The second half is the usage windows, which have no other home. The nightly
   agent's whole schedule is built around them, and until now the only way to
   see one was to run core/windows.py at a terminal.
   ========================================================================= */

function schedRow(j){
  const dot = j.armed ? 'on' : 'off';
  const when = j.next ? new Date(j.next) : null;
  return '<article class="schedjob">' +
    '<div class="schedhead">' +
      '<i class="dot ' + dot + '"></i>' +
      '<span class="schedname">' + esc(j.name) + '</span>' +
      '<span class="schedstate ' + dot + '">' + esc(j.state) + '</span>' +
    '</div>' +
    '<p class="schedwhat">' + esc(j.what) + '</p>' +
    '<dl class="schedmeta">' +
      '<dt>Runs</dt><dd>' + esc(j.schedule || '—') + '</dd>' +
      '<dt>Next</dt><dd>' + (when ? esc(when.toLocaleString([], {
          weekday:'short', day:'numeric', month:'short',
          hour:'2-digit', minute:'2-digit' })) : '—') + '</dd>' +
      '<dt>Last</dt><dd>' + esc(j.last || '—') + '</dd>' +
    '</dl>' +
    (j.hint ? '<p class="schedhint">Not armed. To start it:<code>' + esc(j.hint) + '</code></p>' : '') +
    (j.recent && j.recent.length
      ? '<details class="schedlog"><summary>Recent</summary><pre>' +
        j.recent.map(esc).join('\n') + '</pre></details>' : '') +
  '</article>';
}

/* Tokens are shown in millions throughout. The raw figures run to hundreds of
   millions and nothing here is a number he does arithmetic on — it is a
   comparison between windows, which is what the bar is for. */
function tokM(n){ return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M'; }

/* Past a billion, "3043M" is a number nobody reads. The weekly line crosses
   that within a fortnight of normal use, so it gets its own unit. */
function tokBig(n){
  if (n < 1) return '0';          // "0.0M" on an axis is three characters of noise
  return n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B' : tokM(n);
}

/* -------------------------------------------------------------------------
   The usage chart — both series as a share of their ceiling, one axis.

   Each five-hour session is a vertical line at the time it opened, and the
   rolling seven-day total is a line across them. Percentages rather than raw
   tokens, because a weekly total and a single session are different sizes of
   number and one raw axis flattens the sessions into the floor. As shares of
   their own ceiling they sit on one axis and can be read against each other,
   which is the whole point of the pairing.

   Where the ceiling comes from is the part worth knowing, and the card says it
   out loud rather than implying an authority it does not have. Nothing on this
   machine is told what the allowance is: core/windows.py reconstructs what each
   window spent, and the error a real limit returns names the reset time and not
   the ceiling. So until a run is actually refused — at which point plan.py
   writes what the window had spent into window.json, and that becomes a
   measured floor under the real allowance — 100% is the heaviest session seen
   in the period. That still answers "is today unusual", which is the question
   being asked, and it stops pretending to answer "how much is left".

   The week never has a measured source. Nothing here has any notion of a weekly
   allowance at all, so it is always against the busiest seven days seen.
   ------------------------------------------------------------------------- */

function usageChart(u){
  const wins = u.windows || [];
  const roll = u.rolling || [];
  const cap = u.ceiling || {};
  if (!wins.length || !cap.session) return '';

  /* Sized close to the column it sits in rather than to a round number. It
     scales to fit either way, but text scales with it, and a 660-wide box in a
     380-wide column renders 10px labels at six. */
  const W = 400, H = 190, L = 30, R = 12, T = 14, B = 22;
  const x0 = L, x1 = W - R, y0 = T, y1 = H - B;

  const t = s => new Date(s).getTime();
  // Noon, so a day's point sits in the middle of the day it is about rather
  // than on the boundary between two.
  const dayT = s => new Date(s + 'T12:00:00').getTime();

  /* The range asked for, not the range the data happens to cover. A quiet
     three days should read as three quiet days, and a scale that shrank to
     the one window in them would draw that window filling the card. */
  const tMax = Math.max(Date.now(), t(wins[wins.length - 1].end));
  const tMin = Math.min(t(wins[0].start), tMax - u.days * 864e5);
  const px = ms => x0 + (ms - tMin) / (tMax - tMin || 1) * (x1 - x0);

  /* One axis, 0 to 100, and a session can exceed its own ceiling only when the
     ceiling is measured and an older window was heavier — so the scale runs to
     whichever is larger and the 100% rule stays where it belongs. */
  const pctS = w => w.tok / cap.session * 100;
  const pctR = r => r.tok / (cap.week || 1) * 100;
  const top = Math.max(100, ...wins.map(pctS), ...roll.map(pctR));
  const py = v => y1 - v / top * (y1 - y0);

  let grid = '';
  for (const v of [0, 50, 100]) {
    grid +=
      '<line class="ugrid' + (v === 100 ? ' cap' : '') + '" x1="' + x0 + '" y1="' +
        py(v).toFixed(1) + '" x2="' + x1 + '" y2="' + py(v).toFixed(1) + '"/>' +
      '<text class="uaxl y" x="' + (x0 - 5) + '" y="' + (py(v) + 3.2).toFixed(1) + '">' +
        v + '%</text>';
  }

  /* Each session is a box standing on the axis, as wide as the five hours it
     actually ran and as tall as it spent. Discrete events rather than a
     continuous quantity, so they are never joined into a curve — a slope
     between two windows is a slope that never happened.

     Used to be a one-pixel line at the opening time, which lost the two
     things the box carries: how long the window covered, so windows that
     butt up against each other read as the run of work they were, and a
     width big enough to draw inside.

     What is drawn inside is how the spend arrived across those five hours —
     `shape` off the server, as fractions of the window's own span and total.
     A window that emptied itself in the first twenty minutes and one that
     ticked along for five hours reach the same height, and the fill is the
     only thing that tells them apart. */
  const bars = wins.map(w => {
    const bx = px(t(w.start)), bw = Math.max(1.6, px(t(w.end)) - bx);
    const topY = py(pctS(w)), baseY = py(0), bh = baseY - topY;
    const cls = 'ubox' + (w.night ? ' night' : '') + (w.open ? ' live' : '');
    // Down the left edge, across the curve, then back along the floor.
    const fill = (w.shape || []).length
      ? '<path class="ufill" d="M' + bx.toFixed(1) + ',' + baseY.toFixed(1) + ' ' +
          w.shape.map(p => 'L' + (bx + p[0] * bw).toFixed(1) + ',' + (baseY - p[1] * bh).toFixed(1)).join(' ') +
          ' L' + (bx + bw).toFixed(1) + ',' + baseY.toFixed(1) + ' Z"/>'
      : '';
    return '<g class="' + cls + '">' +
      fill +
      '<rect class="uboxline" x="' + bx.toFixed(1) + '" y="' + topY.toFixed(1) +
        '" width="' + bw.toFixed(1) + '" height="' + Math.max(0.6, bh).toFixed(1) + '"/>' +
      '<title>' + esc(new Date(w.start).toLocaleString([], {
          weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })) +
        ' · ' + esc(tokM(w.tok)) + ' · ' + w.turns + ' turns' +
        (w.night ? ' · opened in the night' : '') + '</title>' +
    '</g>';
  }).join('');

  const rPts = roll.map(r => px(dayT(r.day)).toFixed(1) + ',' + py(pctR(r)).toFixed(1));

  /* Four ticks, evenly spaced across the range rather than on round dates —
     the range never starts on a Monday or at midnight. What they say depends
     on how much is being shown: four copies of "6 Sep" is no axis at all on
     a day's worth, and a clock time is no axis on a month's. */
  const short = u.days <= 3;
  let ticks = '';
  for (let i = 0; i <= 3; i++) {
    const ms = tMin + (tMax - tMin) * i / 3;
    ticks += '<text class="uaxl d" x="' + px(ms).toFixed(1) + '" y="' + (y1 + 13) + '">' +
      esc(new Date(ms).toLocaleString([], short
        ? { weekday:'short', hour:'2-digit', minute:'2-digit' }
        : { day:'numeric', month:'short' })) + '</text>';
  }

  const nowX = px(Date.now()).toFixed(1);
  const measured = cap.source === 'measured';

  return '<div class="uchart">' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Each five-hour session and the rolling seven-day total, as a ' +
      'share of their ceiling">' +
      grid + ticks + bars +
      (rPts.length > 1 ? '<polyline class="uline r" points="' + rPts.join(' ') + '"/>' : '') +
      '<line class="unow" x1="' + nowX + '" y1="' + y0 + '" x2="' + nowX + '" y2="' + py(0).toFixed(1) + '"/>' +
    '</svg>' +
    '<div class="ukey">' +
      '<span class="k s">Five-hour session</span>' +
      '<span class="k n">Opened in the night</span>' +
      '<span class="k f">Spend across the window</span>' +
      (rPts.length > 1 ? '<span class="k r">Rolling seven days</span>' : '') +
    '</div>' +
    /* One line, not a paragraph. A percentage axis with an unstated denominator
       says nothing, so what 100% is has to be on the card — but which of the
       two sources it came from is the only part that needs saying, and it fits
       in a word. */
    '<p class="ucap">100% = <b>' + esc(tokBig(cap.session)) + '</b> session' +
      (measured ? ' <em>measured at a limit' +
        (cap.measuredAt ? ', ' + esc(cap.measuredAt) : '') + '</em>' : '') +
      ' · <b>' + esc(tokBig(cap.week)) + '</b> week' +
      /* The baseline, not the range. Narrowing to three days does not change
         what 100% is — see usage_summary — and a card that said "heaviest in
         3 days" while drawing a month's ceiling would be lying about both. */
      (measured ? '' : ' <em>heaviest in ' + (u.baseline || u.days) + ' days</em>') +
    '</p>' +
  '</div>';
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

function usageRow(w, peak){
  const a = new Date(w.start), b = new Date(w.end);
  const hm = d => String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  return '<div class="urow' + (w.open ? ' live' : '') + (w.night ? ' night' : '') + '">' +
    '<span class="uday">' + esc(a.toLocaleDateString([], { weekday:'short', day:'numeric', month:'short' })) + '</span>' +
    '<span class="uspan">' + hm(a) + '–' + hm(b) + '</span>' +
    '<span class="ubar"><span style="width:' + Math.max(1, Math.round(w.tok / peak * 100)) + '%"></span></span>' +
    '<span class="utok">' + tokM(w.tok) + '</span>' +
  '</div>';
}

/* The decision — would the agent spend right now, and why not — used to lead
   this card, but it answers a question about the Queue/Doing card in
   13-plans.js, not about token history, so it's drawn there now under its
   own "Status" heading. Still fetched here, since /usage.json is the only
   route that knows it: written into #statusOut as a side effect of the same
   call that draws the chart, rather than fetched twice. */
function renderStatus(u){
  const out = $('#statusOut');
  if (!out) return;
  out.innerHTML = u.decision
    ? '<div class="udecide ' + esc(u.decision.action) + '">' +
        '<strong>' + esc(u.decision.action.toUpperCase()) + '</strong> — ' + esc(u.decision.why) +
      '</div>'
    : '<p class="help">Nothing to judge tonight against yet.</p>';
}

async function renderUsage(){
  const out = $('#usageOut');
  if (!out) return;
  try {
    const u = await getJSON('/usage.json?days=' + usageDays);
    renderStatus(u);
    if (!u.available) {
      out.innerHTML = '<div class="empty">No <code>core/windows.py</code> in this checkout, ' +
        'so there is nothing to read the usage windows with.</div>';
      return;
    }
    const wins = u.windows.slice().reverse();
    const peak = Math.max(1, ...wins.map(w => w.tok));
    const nights = u.windows.filter(w => w.night).length;

    out.innerHTML =
      '<div class="uranges">' +
        USAGE_RANGES.map(r => '<button type="button" class="urange' +
          (r.days === usageDays ? ' on' : '') + '" data-days="' + r.days + '">' +
          r.label + '</button>').join('') +
      '</div>' +
      /* The five-hour rule, the 07:00 boundary and the 02:00 cutoff used to be
         spelled out here in a paragraph. They are in agents/night_agent/README.md, and the
         Status line on the Queue/Doing card already says what they add up to
         tonight. */
      usageChart(u) +
      '<div class="ustats">' +
        '<span><b>' + u.windows.length + '</b> windows in ' +
          (u.days === 1 ? '24 hours' : u.days + ' days') + '</span>' +
        '<span><b>' + tokM(u.median) + '</b> median</span>' +
        '<span><b>' + tokM(u.p90) + '</b> p90</span>' +
        '<span><b>' + nights + '</b> started in the night</span>' +
      '</div>' +
      /* The rows are still here, one per window, but folded. They read as a
         log, which is the wrong shape for "is this getting better" and the
         right one for "what happened on Tuesday". */
      '<details class="ufold"><summary>Every window, newest first</summary>' +
        '<div class="ulist">' + wins.map(w => usageRow(w, peak)).join('') + '</div>' +
      '</details>';

    /* The whole card is redrawn rather than only the chart. Every figure on it
       — the window count, the median, the p90, the fold below — is about the
       range, so a chart that changed while the numbers under it did not would
       be the worse half of a working control. */
    out.querySelectorAll('.urange').forEach(btn => {
      btn.onclick = () => {
        usageDays = +btn.dataset.days;
        renderUsage();
      };
    });
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the usage windows. ' +
      esc(String(err.message || err)) + '</div>';
  }
}

/* The jobs half only — Plans supplies its own card and calls renderUsage()
   itself for the other half, on its own schedule (after the plan list, same
   as this used to defer to it). */
async function renderSched(){
  const out = $('#schedOut');
  if (!out) return;
  try {
    const res = await fetch('/schedule.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      out.innerHTML = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about the schedule yet.</div>';
      return;
    }
    const jobs = (await res.json()).jobs || [];
    out.innerHTML = jobs.length
      ? jobs.map(schedRow).join('')
      : '<div class="empty">Nothing scheduled.</div>';
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the schedule. ' +
      esc(String(err.message || err)) + '</div>';
  }
}

