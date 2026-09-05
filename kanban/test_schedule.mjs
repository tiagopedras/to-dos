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
    ]
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
check('the morning and the cutoff are both named', await evalJS(`
  document.querySelector('#usageOut .help').textContent.includes('07:00') &&
  document.querySelector('#usageOut .help').textContent.includes('02:00')
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
