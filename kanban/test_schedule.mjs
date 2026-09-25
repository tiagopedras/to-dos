/**
 * Drives the Spend and schedules sheet in headless Chrome and asserts on the two cards that
 * used to be the Schedule view — "What runs on a clock", its own card
 * stacked under Token Session, and the Token Session chart itself.
 *
 *   BOARD_PORT=8799 node kanban/test_schedule.mjs
 *
 * Same two guards as the other board tests, for the same reason — this repo
 * has lost the real todo.md to a test twice:
 *
 *   1. The tab is locked before anything else happens. A locked tab cannot save.
 *   2. Every non-GET is torn out of `fetch` and recorded instead of sent.
 *
 * Neither card writes anything, so the second guard is also the assertion:
 * this test never drags a queue card or marks a plan actioned, so the
 * recording staying empty proves these two are still read-only.
 *
 * Every route Plans reads is stubbed, so this needs no plans, no queue, no
 * run log, no launchd job installed and no transcripts on disk, and it can
 * assert on states — a job that is not installed, a window still open — that
 * are awkward to arrange for real.
 */

import { spawn } from 'node:child_process'

const PORT = Number(process.env.CDP_PORT) || 9450
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_schedule.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-schedule-test-profile'}`, '--window-size=1500,1000',
  `http://127.0.0.1:${BOARD}/kanban/index.html`
], { stdio: ['ignore', 'pipe', 'pipe'] })

async function page () {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const t = (await r.json()).find(t => t.type === 'page' && t.url.includes('index.html'))
      if (t?.webSocketDebuggerUrl) return t.webSocketDebuggerUrl
    } catch {}
    await new Promise(r => setTimeout(r, 250))
  }
  throw new Error('no page')
}

const ws = new WebSocket(await page())
await new Promise(r => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params) => new Promise(res => {
  const n = ++id
  pending.set(n, res)
  ws.send(JSON.stringify({ id: n, method, params }))
})
async function evalJS (expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}

await new Promise(r => setTimeout(r, 2500))
check('the board loaded', await evalJS(`typeof openRefCards === 'function' && typeof renderSched === 'function'`))

/* The modal's tree is React, so a render followed by a read in the same breath
   reads the paint before it. Two frames: React commits in one and the browser
   lays out in the next. */
await evalJS(`(window.painted = () => new Promise(
  r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))) && 1`)

// LOCK FIRST. Nothing below can write anything.
await evalJS(`(() => {
  state.locked = true;
  state.lockedLabel = 'schedule test';
  const real = window.fetch;
  window.__blocked = [];
  const now = Date.now();
  const iso = ms => new Date(ms).toISOString();
  const day = ms => new Date(ms).toISOString().slice(0, 10);
  window.__jobs = [
    { id:'plan-agent', name:'Plan agent', armed:false, state:'not installed',
      what:'Plans every task delegated to the Plan agent, one agent each.',
      schedule:'12 wakes, 19:00–06:00', next:'', last:'',
      recent:[], hint:'ln -s agents/plan-agent/x.plist ~/Library/LaunchAgents/' },
    { id:'companion', name:'Desktop companion', armed:true, state:'running',
      what:'One briefing each working morning.',
      schedule:'08:30 on a working day', next:iso(now + 864e5),
      last:'notified 2026-09-04 at 8:30', recent:[], hint:'' },
    { id:'weekly-backup', name:'Weekly backup', armed:true, state:'running, in this server',
      what:'One snapshot of todo.md a week.', schedule:'every 30 minutes',
      next:'', last:'todo-backup-week-2026-W36.md',
      recent:['todo-backup-week-2026-W36.md'], hint:'' }
  ];
  window.__usage = {
    available:true, days:30, baseline:30,
    // Ninety minutes from now, so the Status line has a real countdown to
    // render. It is capacity, not permission: nothing is gated on it since the
    // usage-window rule went on 9 Sep 2026.
    window:{ expires:iso(now + 90*60e3), source:'estimated from transcripts' },
    median: 71e6, p90: 197e6, max: 430e6,
    windows: [
      // shape is the running total across the window, as fractions of its own
      // span and its own total — what the box is filled in with. The first
      // spends evenly, the second front-loads: same height, different fill.
      { start:iso(now - 3*864e5), end:iso(now - 3*864e5 + 18e6), tok: 71e6, turns:300, open:false, night:false,
        shape: [[0.25,0.25],[0.5,0.5],[0.75,0.75],[1,1]] },
      { start:iso(now - 864e5),   end:iso(now - 864e5 + 18e6),   tok:430e6, turns:1700, open:false, night:true,
        shape: [[0.25,0.9],[0.5,1],[0.75,1],[1,1]] },
      { start:iso(now - 36e5),    end:iso(now + 144e5),          tok: 12e6, turns:60,  open:true,  night:true,
        shape: [[0.25,0.4],[0.5,0.8],[0.75,1],[1,1]] }
    ],
    rolling: [
      { day: day(now - 2*864e5), tok: 320e6 },
      { day: day(now - 864e5),   tok: 480e6 },
      { day: day(now),           tok: 640e6 }
    ],
    ceiling: { session: 430e6, week: 640e6, source:'observed', measuredAt:'' }
  };
  // Plans reads three more routes on the way to painting the cards this test
  // does not touch. Empty-but-valid, so those columns render their own empty
  // states instead of erroring, and this stays about the two cards that moved.
  window.__plans = [];
  window.__queue = {};
  window.__nightAgent = { live:false, done:[], failed:[] };
  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') { window.__blocked.push(method + ' ' + url); return Promise.resolve(new Response('{}', {status:200})); }
    const u = String(url);
    if (u.startsWith('/schedule.json')) return Promise.resolve(new Response(JSON.stringify({jobs: window.__jobs}), {status:200}));
    if (u.startsWith('/usage.json')) return Promise.resolve(new Response(JSON.stringify(window.__usage), {status:200}));
    if (u.startsWith('/plans.json')) return Promise.resolve(new Response(JSON.stringify({plans: window.__plans}), {status:200}));
    if (u.startsWith('/queue.json')) return Promise.resolve(new Response(JSON.stringify(window.__queue), {status:200}));
    if (u.startsWith('/planning-agent.json')) return Promise.resolve(new Response(JSON.stringify(window.__nightAgent), {status:200}));
    return real(url, opts);
  };
  return 'locked and stubbed';
})()`)
check('tab is locked before anything is drawn', await evalJS(`state.locked === true`))

check('Schedule is gone as a header button', await evalJS(`!document.getElementById('scheduleBtn')`))

await evalJS(`state.view = 'board'; renderView()`)
await new Promise(r => setTimeout(r, 700))

// Neither card is on a view: both are reference rather than decision, so they
// sit behind the Data menu's Spend and schedules button and draw when it is
// pressed. Everything below reads them inside that modal.
check('neither card is drawn until the button is pressed', await evalJS(`
  !document.querySelector('#schedOut') && !document.querySelector('#usageOut')
`))
await evalJS(`document.querySelector('#refCardsBtn').click()`)
await new Promise(r => setTimeout(r, 700))

check('the clock card is its own column, stacked under Token Session', await evalJS(`
  (() => { const card = document.querySelector('#schedOut').closest('.tenon-column');
    return card && card.parentElement.classList.contains('pvcol') &&
      card.closest('.mscrim') &&
      card.querySelector('h3').textContent === 'What runs on a clock' &&
      card.previousElementSibling.querySelector('h3').textContent === 'Token Session' })()
`))
const jobs = await evalJS(`document.querySelectorAll('#schedOut .schedjob').length`)
check('one row per scheduled job', jobs === 3, `${jobs} rows`)

check('an unarmed job says so and gives the command', await evalJS(`
  document.querySelector('#schedOut .schedjob .schedstate').textContent === 'not installed' &&
  !!document.querySelector('#schedOut .schedjob .schedhint code')
`))
check('an armed one shows a green dot and no command', await evalJS(`
  document.querySelectorAll('#schedOut .schedjob')[1].querySelector('.dot').classList.contains('on') &&
  !document.querySelectorAll('#schedOut .schedjob')[1].querySelector('.schedhint')
`))
check('the next run is written as a date, not an ISO string', await evalJS(`
  !document.querySelectorAll('#schedOut .schedjob')[1].querySelector('.schedmeta').textContent.includes('T0')
`))

// The usage card itself carries no explanatory prose: the Status line
// (elsewhere now) says what there is to spend and
// agents/plan-agent/README.md holds the reasoning.
check('the usage card explains itself with the chart, not a paragraph', await evalJS(`
  !document.querySelector('#usageOut .help')
`))
const rows = await evalJS(`document.querySelectorAll('#usageOut .urow').length`)
check('one row per window', rows === 3, `${rows} rows`)
check('newest first', await evalJS(`
  document.querySelector('#usageOut .urow').classList.contains('live')
`))
check('a window still open is marked live', await evalJS(`
  document.querySelectorAll('#usageOut .urow.live').length === 1
`))
check('night windows are picked out', await evalJS(`
  document.querySelectorAll('#usageOut .urow.night').length === 2
`))
check('tokens read in millions', await evalJS(`
  document.querySelector('#usageOut .utok').textContent === '12.0M'
`))
check('the bar is scaled to the biggest window', await evalJS(`
  document.querySelectorAll('#usageOut .urow')[1].querySelector('.ubar span').style.width === '100%'
`))
check('and the log of rows is folded, not the first thing on the card', await evalJS(`
  document.querySelector('#usageOut .ufold') &&
  document.querySelector('#usageOut .ufold .ulist') &&
  !document.querySelector('#usageOut .ufold').open
`))

// The chart. Both series as a share of their own ceiling on one axis, which is
// the whole reason it is percentages: a weekly total and a single session are
// different sizes of number, and one raw axis flattens the sessions into the
// floor.
check('the axis is a percentage, not a token count', await evalJS(`
  [...document.querySelectorAll('#usageOut .uaxl.y')].map(e => e.textContent).join(',')
`) === '0%,50%,100%')
check('and there is only one of them', await evalJS(`
  !document.querySelector('#usageOut .uaxl.s') && !document.querySelector('#usageOut .uaxl.r')
`))
check('each five-hour session is its own box', await evalJS(`
  document.querySelectorAll('#usageOut .uchart .ubox').length === 3
`))
// 430M against a 430M ceiling is the full height of the plot; 71M is a sixth
// of it. Checked as a ratio so the geometry can move without breaking this.
check('a session stands at its share of the ceiling', await evalJS(`
  (() => { const r = [...document.querySelectorAll('#usageOut .uboxline')];
    const h = b => +b.getAttribute('height');
    return Math.abs(h(r[1]) / h(r[0]) - 430 / 71) < 0.02 })()
`))
/* The box covers the five hours the window ran, which is the whole reason it
   is a box rather than the line it used to be — a window that opened at 22:00
   and one that opened at 02:00 are the same event five hours apart, and the
   old mark said nothing about the second one being inside the first's reach.
   Every window is exactly five hours by construction (reconstruct() sets end
   to start + WINDOW), so the assertion is that a box measures five hours on
   the axis it is drawn against, not that the three differ. */
check('and covers the five hours the window ran', await evalJS(`
  (() => { const r = [...document.querySelectorAll('#usageOut .uboxline')];
    const w = b => +b.getAttribute('width');
    // The plot is 400 wide with 30 and 12 cut off each side; the range is 30 days.
    const want = 5 / (30 * 24) * (400 - 30 - 12);
    return r.every(b => Math.abs(w(b) - want) < 0.15) })()
`), await evalJS(`[...document.querySelectorAll('#usageOut .uboxline')].map(b => b.getAttribute('width')).join(' / ')`))
/* The fill is how the spend arrived across those hours. Two windows the same
   height and a different shape is exactly what it exists to tell apart, so
   the check is that they differ rather than that either has some value. */
check('the spend is drawn filling in across the box', await evalJS(`
  document.querySelectorAll('#usageOut .ubox .ufill').length === 3
`))
check('and a front-loaded window fills differently from an even one', await evalJS(`
  (() => { const f = [...document.querySelectorAll('#usageOut .ufill')].map(p => p.getAttribute('d'));
    return f[0] !== f[1] && f.every(d => /^M[\\d.]+,[\\d.]+ L/.test(d) && d.endsWith('Z')) })()
`))
check('a window with no shape still draws its box', await evalJS(`
  (async () => {
    const keep = window.__usage;
    window.__usage = Object.assign({}, keep, { windows: keep.windows.map(w =>
      Object.assign({}, w, { shape: [] })) });
    await renderUsage(); await painted();
    const ok = document.querySelectorAll('#usageOut .ubox').length === 3 &&
               document.querySelectorAll('#usageOut .ufill').length === 0;
    window.__usage = keep; await renderUsage(); await painted();
    return ok;
  })()
`))
check('night sessions are picked out from the rest', await evalJS(`
  document.querySelectorAll('#usageOut .ubox.night').length === 2 &&
  document.querySelectorAll('#usageOut .ubox.live').length === 1
`))
/* The range buttons. Four stops, three days on by default, and pressing one
   redraws the whole card rather than only the chart — every figure under it
   is about the range too. */
check('the card offers four ranges', await evalJS(`
  [...document.querySelectorAll('#usageOut .urange')].map(b => b.textContent).join(',')
`) === '24h,3d,7d,30d')
check('and three days is the one on', await evalJS(`
  document.querySelector('#usageOut .urange.on').textContent === '3d' && usageDays === 3
`))
check('pressing one asks the server for that range', await evalJS(`
  (async () => {
    window.__asked = [];
    const inner = window.fetch;
    window.fetch = (u, o) => { if (String(u).startsWith('/usage.json')) window.__asked.push(String(u)); return inner(u, o); };
    document.querySelector('[data-days="7"]').click();
    await new Promise(r => setTimeout(r, 120));
    // getJSON hangs a cache-buster off the end of every URL it fetches.
    const ok = window.__asked.length === 1 && window.__asked[0].startsWith('/usage.json?days=7') &&
               document.querySelector('#usageOut .urange.on').textContent === '7d';
    document.querySelector('[data-days="3"]').click();
    await new Promise(r => setTimeout(r, 120));
    return ok;
  })()
`), await evalJS(`JSON.stringify(window.__asked)`))
check('the weekly total is a line across them', await evalJS(`
  document.querySelector('#usageOut .uline.r').getAttribute('points').trim().split(/\\s+/).length === 3
`))
check('the ceiling is drawn, and drawn as an estimate', await evalJS(`
  !!document.querySelector('#usageOut .ugrid.cap')
`))
check('and now is drawn as a rule', await evalJS(`
  !!document.querySelector('#usageOut .uchart .unow')
`))
// The honest bit. No allowance is known, so the card must say what its 100%
// actually is rather than implying an authority it has not got.
// A percentage axis with an unstated denominator says nothing, so what 100% is
// stays on the card even though the prose around it has gone.
check('what 100% is stays on the card', await evalJS(`
  (() => { const t = document.querySelector('#usageOut .ucap').textContent;
    return t.includes('430M') && t.includes('640M') })()
`), await evalJS(`document.querySelector('#usageOut .ucap').textContent`))
check('an observed ceiling says it is only the heaviest seen', await evalJS(`
  document.querySelector('#usageOut .ucap').textContent.includes('heaviest in 30 days')
`))
// A measured one — a run actually refused, its spend recorded — reads
// differently, because it is a real floor under the allowance.
await evalJS(`(async () => {
  const keep = window.__usage;
  window.__usage = Object.assign({}, keep, { ceiling:
    { session: 430e6, week: 640e6, source:'measured', measuredAt:'2026-09-05' } });
  await renderUsage(); await painted();
  window.__usage = keep;
  return 1;
})()`)
await new Promise(r => setTimeout(r, 300))
check('a measured ceiling says so instead, with its date', await evalJS(`
  (() => { const t = document.querySelector('#usageOut .ucap').textContent;
    return t.includes('measured at a limit') && t.includes('2026-09-05') &&
           !t.includes('heaviest') })()
`))
await evalJS(`renderUsage()`)
await new Promise(r => setTimeout(r, 300))

// No windows at all — a fresh checkout — has nothing to draw and must not
// throw trying.
await evalJS(`(async () => {
  const keep = window.__usage;
  window.__usage = Object.assign({}, keep, { windows: [], rolling: [] });
  await renderUsage(); await painted();
  window.__usage = keep;
  return 1;
})()`)
await new Promise(r => setTimeout(r, 300))
check('no windows draws no chart rather than a broken one', await evalJS(`
  !document.querySelector('#usageOut .uchart')
`))
await evalJS(`renderUsage()`)
await new Promise(r => setTimeout(r, 300))

// Closing and reopening must work: a second opening has to draw both cards as
// fully as the first.
await evalJS(`closeModal()`)
await evalJS(`state.view = 'board'; renderView()`)
await new Promise(r => setTimeout(r, 300))
check('there is no Plans tab any more, and an old #plans link lands on the board', await evalJS(`
  ![...document.querySelectorAll('#viewToggle .tab')].some(t => t.textContent.startsWith('Plans')) &&
  (state.view = 'plans', renderView(), state.view === 'board')
`))
await evalJS(`document.querySelector('#refCardsBtn').click()`)
await new Promise(r => setTimeout(r, 700))
check('and coming back redraws both cards', await evalJS(`
  document.querySelectorAll('#schedOut .schedjob').length === 3 &&
  !!document.querySelector('#usageOut .uchart')
`))
await evalJS(`closeModal()`)

check('none of it wrote anything', await evalJS(`window.__blocked.length === 0`),
  await evalJS(`window.__blocked.join(', ') || 'no writes attempted'`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
