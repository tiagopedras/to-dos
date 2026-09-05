'use strict';

/* =========================================================================
   4b2c. Schedule — what runs on a clock, and what the usage windows are doing.

   Three things around this app run on a schedule rather than on demand: the
   nightly prep agent's twelve launchd wakes, the companion's morning briefing,
   and the weekly backup thread inside this server. Until this view they were
   three separate places to go and look, and "did the nightly job actually run"
   had no answer short of reading a log.

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

  const tMin = t(wins[0].start);
  const tMax = Math.max(Date.now(), t(wins[wins.length - 1].end));
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

  /* Each session is its own vertical line, standing where it opened. They are
     discrete five-hour events rather than a continuous quantity, and joining
     them into a curve draws slopes between windows that never existed. */
  const bars = wins.map(w =>
    '<line class="ubarv' + (w.night ? ' night' : '') + (w.open ? ' live' : '') +
      '" x1="' + px(t(w.start)).toFixed(1) + '" y1="' + py(0).toFixed(1) +
      '" x2="' + px(t(w.start)).toFixed(1) + '" y2="' + py(pctS(w)).toFixed(1) + '"/>'
  ).join('');

  const rPts = roll.map(r => px(dayT(r.day)).toFixed(1) + ',' + py(pctR(r)).toFixed(1));

  // Four date ticks, evenly spaced across the range rather than on round
  // dates — the range is thirty days and never starts on a Monday.
  let ticks = '';
  for (let i = 0; i <= 3; i++) {
    const ms = tMin + (tMax - tMin) * i / 3;
    ticks += '<text class="uaxl d" x="' + px(ms).toFixed(1) + '" y="' + (y1 + 13) + '">' +
      esc(new Date(ms).toLocaleDateString([], { day:'numeric', month:'short' })) + '</text>';
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
      (measured ? '' : ' <em>heaviest in ' + u.days + ' days</em>') +
    '</p>' +
  '</div>';
}

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

async function renderUsage(){
  const out = $('#usageOut');
  if (!out) return;
  try {
    const u = await getJSON('/usage.json');
    if (!u.available) {
      out.innerHTML = '<div class="empty">No <code>core/windows.py</code> in this checkout, ' +
        'so there is nothing to read the usage windows with.</div>';
      return;
    }
    const wins = u.windows.slice().reverse();
    const peak = Math.max(1, ...wins.map(w => w.tok));
    const nights = u.windows.filter(w => w.night).length;

    /* The decision line first, because it is the one thing here that answers a
       question about tonight rather than about the past: would the agent spend
       right now, and why not. */
    out.innerHTML =
      '<div class="udecide ' + esc(u.decision.action) + '">' +
        '<strong>' + esc(u.decision.action.toUpperCase()) + '</strong> — ' + esc(u.decision.why) +
      '</div>' +
      /* The five-hour rule, the 07:00 boundary and the 02:00 cutoff used to be
         spelled out here in a paragraph. They are in nightly/README.md, and the
         decision line above already says what they add up to tonight. */
      usageChart(u) +
      '<div class="ustats">' +
        '<span><b>' + u.windows.length + '</b> windows in ' + u.days + ' days</span>' +
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
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the usage windows. ' +
      esc(String(err.message || err)) + '</div>';
  }
}

async function renderScheduleView(){
  $('#lists').innerHTML =
    '<div class="lists rview">' +
      '<div class="listcard schedview"><h3>What runs on a clock</h3>' +
        '<p class="help listlead">Everything around this list that fires on a schedule rather ' +
        'than when you ask it to. Whether it is armed comes from the system; what it last did ' +
        'comes from its own log.</p>' +
        '<div id="schedOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard schedview usage"><h3>Token windows</h3>' +
        '<div id="usageOut">Loading…</div>' +
      '</div>' +
    '</div>';
  try {
    const res = await fetch('/schedule.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      $('#schedOut').innerHTML = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about the schedule yet.</div>';
      return;
    }
    const jobs = (await res.json()).jobs || [];
    $('#schedOut').innerHTML = jobs.length
      ? jobs.map(schedRow).join('')
      : '<div class="empty">Nothing scheduled.</div>';
  } catch (err) {
    $('#schedOut').innerHTML = '<div class="err">Could not read the schedule. ' +
      esc(String(err.message || err)) + '</div>';
  }
  // After the jobs have painted: reconstructing a month of windows is about a
  // second, and there is no reason for the instant half to wait on it.
  renderUsage();
}

