/**
 * Drives the Plans view in headless Chrome and asserts on what it draws.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_plans.mjs
 *
 * Same two guards as test_canvas.mjs, for the same reason — this repo has lost
 * the real todo.md to a test twice:
 *
 *   1. The tab is locked before any fixture is loaded. A locked tab cannot save.
 *   2. Every non-GET is torn out of `fetch` and recorded instead of sent, so
 *      there is no path from here to disk even if something unlocks the tab.
 *
 * The recording does double duty here. The Plans view is the one view that
 * writes something — marking a plan read or actioned — so the blocked list is
 * also the assertion that it posts what it should, to the route it should,
 * without a single byte reaching a file.
 *
 * /plans.json is stubbed rather than read from disk, so this needs no plans to
 * exist and never touches data/.
 */

import { spawn } from 'node:child_process'

const PORT = 9446
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-plans-test-profile', '--window-size=1400,1000',
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
check('the board loaded', await evalJS(`typeof renderPlansView === 'function'`))

// LOCK FIRST, then fixtures. Nothing below can write anything.
await evalJS(`(() => {
  const real = window.fetch;
  window.__blocked = [];
  window.__plans = [
    { name:'add-caveat.md', night:'2026-09-05', url:'/x/add-caveat.md', status:'unread',
      title:'Add Caveat to the design system type stack', task:'Add Caveat to the design system type stack',
      bucket:'Design System', column:'To do', ai:'partial', agent:'pa-plan-design-system',
      date:'2026-09-05', summary:'Caveat is already in the Foundations file as a loose style.' },
    { name:'hr-agent.md', night:'2026-09-05', url:'/x/hr-agent.md', status:'read',
      title:'Create an HR agent', task:'Create an HR agent', bucket:'Processes', column:'To do',
      ai:'partial', agent:'pa-plan-processes', date:'2026-09-05',
      summary:'Five of the six pieces exist as skills already.' },
    { name:'old.md', night:'2026-09-04', url:'/x/old.md', status:'actioned',
      title:'Something already dealt with', task:'Something already dealt with',
      bucket:'Strategic', column:'Backlog', ai:'partial', agent:'pa-plan-strategic',
      date:'2026-09-04', summary:'Done and dusted.' }
  ];
  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') {
      window.__blocked.push(method + ' ' + url + ' ' + ((opts && opts.body) || ''));
      return Promise.resolve(new Response('{"ok":true}', {status:200}));
    }
    if (String(url).startsWith('/plans.json')) {
      return Promise.resolve(new Response(JSON.stringify({plans: window.__plans}), {status:200}));
    }
    if (String(url).startsWith('/x/')) {
      return Promise.resolve(new Response('---\\ntitle: t\\n---\\n\\n## What already exists\\n\\nCaveat is in Foundations.\\n', {status:200}));
    }
    return real(url, opts);
  };
  return 'fetch is read-only';
})()`)
await evalJS(`(async () => {
  const demo = await (await fetch('/kanban/demo.md')).text();
  load(demo, 'demo.md', {});
  state.locked = true;
  state.lockedLabel = 'plans test';
  return 'locked';
})()`)
check('tab is locked before any fixture', await evalJS(`state.locked === true`))
check('and no write has left the page', await evalJS(`window.__blocked.length === 0`))

check('the Plans tab is offered', await evalJS(`viewDefs().some(d => d.id === 'plans')`))

await evalJS(`(async () => { state.view = 'plans'; await renderPlansView(); return 1; })()`)
await new Promise(r => setTimeout(r, 400))

const live = await evalJS(`[...document.querySelectorAll('#plansOut > .repitem')].length`)
check('unactioned plans are listed', live === 2, `${live} shown`)
check('actioned ones are folded away', await evalJS(`
  !!document.querySelector('#plansOut details') &&
  document.querySelector('#plansOut details summary').textContent.trim() === '1 actioned'
`))
check('an unread plan is marked new', await evalJS(`
  document.querySelector('#plansOut .repitem:not(.read):not(.actioned) .repdate').textContent === 'new'
`))
check('a read plan is dimmed rather than hidden', await evalJS(`
  !!document.querySelector('#plansOut .repitem.read')
`))
check('the summary is what the closed row shows', await evalJS(`
  document.querySelector('#plansOut .repsum').textContent.includes('Foundations file')
`))

// Opening one: the body loads, and reading it is recorded as read — the one
// write that happens without being asked for.
await evalJS(`document.querySelector('#plansOut [data-plan-open]').click()`)
await new Promise(r => setTimeout(r, 500))
check('it opens in the wide modal', await evalJS(`!!document.querySelector('.mscrim .sheet.wide')`))
// mdBlocks renders every heading below h1 as an h4 — the h1 is the document's
// own title, which the modal already shows above it.
check('the body is rendered as Markdown', await evalJS(`
  !!document.querySelector('.mscrim .repdoc h4') &&
  document.querySelector('.mscrim .repdoc h4').textContent === 'What already exists'
`))
check('and the frontmatter is not part of it', await evalJS(`
  !document.querySelector('.mscrim .repdoc').textContent.includes('title: t')
`))
check('the subhead names the agent that wrote it', await evalJS(`
  document.querySelector('.mscrim .msub').textContent.includes('pa-plan-design-system')
`))

const marked = await evalJS(`window.__blocked.join(' | ')`)
check('opening marks it read', marked.includes('POST /plan/status') && marked.includes('"status":"read"'), marked.slice(0, 120))
check('and names the night and the file', marked.includes('"night":"2026-09-05"') && marked.includes('"name":"add-caveat.md"'))

// Actioned is a deliberate press, and it is the one the runner reads.
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Mark actioned').click()`)
await new Promise(r => setTimeout(r, 400))
const after = await evalJS(`window.__blocked.join(' | ')`)
check('Mark actioned posts actioned', after.includes('"status":"actioned"'))
check('and the row moves into the actioned fold', await evalJS(`
  document.querySelector('#plansOut details summary').textContent.trim() === '2 actioned'
`))

// The whole point of the second guard.
check('nothing reached todo.md', await evalJS(`
  !window.__blocked.some(b => b.includes('todo.md'))
`))
check('and every write was a plan status', await evalJS(`
  window.__blocked.every(b => b.startsWith('POST /plan/status'))
`), await evalJS(`String(window.__blocked.length) + ' writes'`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
