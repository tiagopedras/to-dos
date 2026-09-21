#!/usr/bin/env node
/* Where a recurring card lands, column-wise, when its occurrence turns over.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_recurring_roll.mjs
 *
 * Three rules, and the whole of what this checks is that they agree about where
 * To do stops. A ticked card whose date has passed goes to To do inside two days
 * of the next occurrence and to Backlog outside it; a week or more out it is not
 * rolled at all and keeps its date, its tick and its agenda; and a card already
 * parked in Backlog is brought across to To do on a later load, once its day is
 * under two days away, which is the only thing that saves the first rule from
 * parking a weekly meeting in Backlog and leaving it there.
 *
 * `rollRecurring()` is called against a document parsed here rather than through
 * `load()`, so `state.doc` is never touched and the live list is never in reach.
 * `today()` is stubbed to a fixed Friday, since every assertion below is about a
 * number of days. Every non-GET is torn out of fetch first, as usual: the tab is
 * deliberately left unlocked, because `setDone()` refuses on a locked one and
 * the tick coming off is half of what is under test, so that tear-out is doing
 * the whole job on its own here.
 */
import { spawn } from 'node:child_process'

const PORT = 9461
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-recurring-test-profile', '--window-size=1400,1000',
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
ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
async function evalJS (expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}

try {
  await new Promise(r => setTimeout(r, 2500))
  check('the board loaded', await evalJS(`typeof rollRecurring === 'function'`))

  // Nothing reaches disk from here, whatever else happens on the page.
  await evalJS(`(() => {
    const real = window.fetch;
    window.__blocked = [];
    window.fetch = (u, o) => {
      const m = (o && o.method) || 'GET';
      if (m !== 'GET') { window.__blocked.push(m + ' ' + u); return Promise.resolve(new Response('{"ok":true}', { status: 200 })); }
      return real(u, o);
    };
  })()`)

  // Friday 18 September 2026. Every date below is chosen against it.
  await evalJS(`window.today = () => new Date(2026, 8, 18)`)

  const fixture = [
    '# To-do', '',
    '## 1. People', '',
    '### Backlog', '',
    '- [x] **Weekly, five days out** [due:: 2026-09-16] `repeat:wed`',
    '  - Agenda:',
    '    - A topic',
    '',
    '- [x] **Monthly, held in Done** [due:: 2026-09-15] `repeat:15`',
    '  - Agenda:',
    '    - A monthly topic',
    '',
    '- [x] **Weekly, one day out** [due:: 2026-09-12] `repeat:sat`',
    '',
    '- [ ] **Parked, its day is tomorrow** [due:: 2026-09-19] `repeat:sat`',
    '',
    '- [ ] **Parked, still five days off** [due:: 2026-09-23] `repeat:wed`',
    '',
    '- [ ] **Never prepared for, date gone** [due:: 2026-09-16] `repeat:wed`',
    '  - Agenda:',
    '    - Never raised',
    '',
    '### To do', ''
  ].join('\n')

  const out = await evalJS(`(() => {
    const doc = parseDoc(${JSON.stringify(fixture)});
    const res = rollRecurring(doc);
    const where = {};
    doc.buckets[0].tiers.forEach(ti => ti.tasks.forEach(t => {
      where[t.title] = { tier: ti.name, due: t.due, done: !!t.done,
                         agenda: t.body.some(l => /- Agenda:/.test(l)),
                         prev: t.body.some(l => /- Previous agenda/.test(l)) };
    }));
    return { res: { n: res.n, carried: res.carried, moved: res.moved }, where,
             counts: doc.buckets[0].tiers.map(ti => ti.name + ':' + ti.tasks.length) };
  })()`)

  const w = out.where
  const at = (title, field) => w[title] ? w[title][field] : '(missing)'

  check('a ticked weekly five days out is parked in Backlog',
    at('Weekly, five days out', 'tier') === 'Backlog', at('Weekly, five days out', 'tier'))
  check('and it is unticked, dated on the next occurrence, its agenda filed',
    at('Weekly, five days out', 'done') === false &&
    at('Weekly, five days out', 'due') === '2026-09-23' &&
    at('Weekly, five days out', 'prev') === true,
    JSON.stringify(w['Weekly, five days out']))

  check('a ticked weekly one day out goes to To do',
    at('Weekly, one day out', 'tier') === 'To do', at('Weekly, one day out', 'tier'))
  check('dated on the Saturday coming',
    at('Weekly, one day out', 'due') === '2026-09-19', at('Weekly, one day out', 'due'))

  check('a ticked monthly a month out is not rolled at all',
    at('Monthly, held in Done', 'due') === '2026-09-15' &&
    at('Monthly, held in Done', 'done') === true,
    JSON.stringify(w['Monthly, held in Done']))
  check('so it keeps its agenda rather than filing it',
    at('Monthly, held in Done', 'agenda') === true &&
    at('Monthly, held in Done', 'prev') === false)
  check('and it stays in Done, where its tick put it',
    at('Monthly, held in Done', 'tier') === 'Done', at('Monthly, held in Done', 'tier'))

  check('a card parked in Backlog whose day is tomorrow is brought into To do',
    at('Parked, its day is tomorrow', 'tier') === 'To do', at('Parked, its day is tomorrow', 'tier'))
  check('one still five days off is left in Backlog',
    at('Parked, still five days off', 'tier') === 'Backlog', at('Parked, still five days off', 'tier'))

  check('an occurrence never prepared for is left exactly where it was',
    at('Never prepared for, date gone', 'tier') === 'Backlog', at('Never prepared for, date gone', 'tier'))
  check('and carries its agenda forward rather than filing it',
    at('Never prepared for, date gone', 'agenda') === true &&
    at('Never prepared for, date gone', 'prev') === false &&
    out.res.carried === 1, JSON.stringify(out.res))

  check('three rolled, and the held one is not one of them',
    out.res.n === 3, String(out.res.n))
  // Every ticked card in the fixture is read as sitting in Done, so all three
  // decisions are real moves: two rolled cards leave Done, one for Backlog and
  // one for To do, and the parked one whose day is tomorrow comes across from
  // Backlog. The held one stays in Done, and none is in two columns at once.
  check('three placements decided', out.res.moved === 3, String(out.res.moved))
  check('three cards actually changed column, and none is in two at once',
    out.counts.join(' ') === 'Done:1 Backlog:3 To do:2', out.counts.join(' '))

  const blocked = await evalJS(`window.__blocked`)
  check('nothing was written', blocked.length === 0, blocked.join(', '))
} finally {
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(`\n${checks.length - failed}/${checks.length} passed`)
process.exit(failed ? 1 : 0)
