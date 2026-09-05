/**
 * Drives the Schedule view in headless Chrome and asserts on what it draws.
 *
 *   BOARD_PORT=8799 node kanban/test_schedule.mjs
 *
 * Same two guards as the other two board tests, for the same reason — this repo
 * has lost the real todo.md to a test twice:
 *
 *   1. The tab is locked before anything else happens. A locked tab cannot save.
 *   2. Every non-GET is torn out of `fetch` and recorded instead of sent.
 *
 * The Schedule view is read-only, so the second guard is also the assertion: a
 * view about the machinery has no business writing anything at all, and the
 * recording proves it does not.
 *
 * Both routes are stubbed, so this needs no launchd job installed and no
 * transcripts on disk, and it can assert on states — a job that is not
 * installed, a window still open — that are awkward to arrange for real.
 */

import { spawn } from 'node:child_process'

const PORT = 9450
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-schedule-test-profile', '--window-size=1500,1000',
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
check('the board loaded', await evalJS(`typeof renderScheduleView === 'function'`))

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
    { id:'nightly', name:'Nightly prep agent', armed:false, state:'not installed',
      what:'Plans every task tagged ai:full or ai:partial, one agent each.',
      schedule:'12 wakes, 19:00–06:00', next:'', last:'',
      recent:[], hint:'ln -s nightly/x.plist ~/Library/LaunchAgents/' },
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
    available:true, days:30, morning:'07:00', cutoff:'02:00',
    decision:{ action:'ride', why:'a window is open until 23:40, estimated from transcripts' },
    median: 71e6, p90: 197e6, max: 430e6,
    windows: [
      { start:iso(now - 3*864e5), end:iso(now - 3*864e5 + 18e6), tok: 71e6, turns:300, open:false, night:false },
      { start:iso(now - 864e5),   end:iso(now - 864e5 + 18e6),   tok:430e6, turns:1700, open:false, night:true },
      { start:iso(now - 36e5),    end:iso(now + 144e5),          tok: 12e6, turns:60,  open:true,  night:true }
    ],
    rolling: [
      { day: day(now - 2*864e5), tok: 320e6 },
      { day: day(now - 864e5),   tok: 480e6 },
      { day: day(now),           tok: 640e6 }
    ],
    ceiling: { session: 430e6, week: 640e6, source:'observed', measuredAt:'' }
  };
  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') { window.__blocked.push(method + ' ' + url); return Promise.resolve(new Response('{}', {status:200})); }
    const u = String(url);
    if (u.startsWith('/schedule.json')) return Promise.resolve(new Response(JSON.stringify({jobs: window.__jobs}), {status:200}));
    if (u.startsWith('/usage.json')) return Promise.resolve(new Response(JSON.stringify(window.__usage), {status:200}));
    return real(url, opts);
  };
  return 'locked and stubbed';
})()`)
check('tab is locked before anything is drawn', await evalJS(`state.locked === true`))

check('Schedule is a header button, not a nav tab', await evalJS(`
  !!document.getElementById('scheduleBtn') && !viewDefs().some(d => d.id === 'schedule')
`))

await evalJS(`document.getElementById('scheduleBtn').click()`)
await new Promise(r => setTimeout(r, 700))

check('the button reads as on', await evalJS(`document.getElementById('scheduleBtn').classList.contains('on')`))
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

check('the decision leads the usage card', await evalJS(`
  document.querySelector('#usageOut .udecide strong').textContent === 'RIDE' &&
  document.querySelector('#usageOut .udecide').textContent.includes('23:40')
`))
// The card carries no explanatory prose any more: the decision line says what
// tonight looks like and nightly/README.md holds the reasoning.
check('the card explains itself with the decision, not a paragraph', await evalJS(`
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
check('each five-hour session is its own vertical line', await evalJS(`
  document.querySelectorAll('#usageOut .uchart .ubarv').length === 3
`))
// 430M against a 430M ceiling is the full height of the plot; 71M is a sixth
// of it. Checked as a ratio so the geometry can move without breaking this.
check('a session stands at its share of the ceiling', await evalJS(`
  (() => { const bars = [...document.querySelectorAll('#usageOut .ubarv')];
    const h = b => +b.getAttribute('y1') - +b.getAttribute('y2');
    return Math.abs(h(bars[1]) / h(bars[0]) - 430 / 71) < 0.02 })()
`))
check('night sessions are picked out from the rest', await evalJS(`
  document.querySelectorAll('#usageOut .ubarv.night').length === 2 &&
  document.querySelectorAll('#usageOut .ubarv.live').length === 1
`))
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
  await renderUsage();
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
  await renderUsage();
  window.__usage = keep;
  return 1;
})()`)
await new Promise(r => setTimeout(r, 300))
check('no windows draws no chart rather than a broken one', await evalJS(`
  !document.querySelector('#usageOut .uchart') && !!document.querySelector('#usageOut .udecide')
`))
await evalJS(`renderUsage()`)
await new Promise(r => setTimeout(r, 300))

// Leaving and coming back must work, since the button is a toggle into a view
// that is not in the registry.
await evalJS(`state.view = 'board'; renderView()`)
await new Promise(r => setTimeout(r, 300))
check('leaving the view goes back to the board', await evalJS(`
  !document.getElementById('scheduleBtn').classList.contains('on')
`))
await evalJS(`document.getElementById('scheduleBtn').click()`)
await new Promise(r => setTimeout(r, 700))
check('and coming back redraws it', await evalJS(`
  document.querySelectorAll('#schedOut .schedjob').length === 3
`))

check('the whole view wrote nothing', await evalJS(`window.__blocked.length === 0`),
  await evalJS(`window.__blocked.join(', ') || 'no writes attempted'`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
