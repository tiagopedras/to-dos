/**
 * Drives the Execution view in headless Chrome and asserts on what it draws.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_execution.mjs
 *
 * Same two guards as every other board test, for the same reason — this repo
 * has lost the real todo.md to a test twice:
 *
 *   1. The tab is locked before any fixture is loaded. A locked tab cannot save.
 *   2. Every non-GET is torn out of `fetch` and recorded instead of sent, so
 *      there is no path from here to disk even if something unlocks the tab.
 *
 * The recording does double duty. This view writes two things and only two —
 * the sync that mints a run for each accepted plan, and one transition per card
 * moved — and both go to /stream/apply on the `runs` stream. That the list is
 * exactly those is the assertion at the bottom.
 *
 * /runs.json is stubbed rather than read from disk, so this needs no run
 * documents to exist and never touches data/.
 */

import { spawn } from 'node:child_process'

const PORT = 9448
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-exec-test-profile', '--window-size=1400,1000',
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
check('the board loaded', await evalJS(`typeof renderExecutionView === 'function'`))

// LOCK FIRST, then fixtures. Nothing below can write anything.
await evalJS(`(() => {
  const real = window.fetch;
  window.__blocked = [];
  window.__runs = [
    { name:'2026-09-05-a.md', url:'/x/a.md', title:'Rename the text styles',
      task:'Rename the text styles', slug:'', plan:'2026-09-05/a.md',
      bucket:'Design System', column:'To do', summary:'Accepted, not started.',
      state:'backlog', owner:'me', seen:false, resolution:'', feedback:'', created:'2026-09-06' },
    { name:'2026-09-05-b.md', url:'/x/b.md', title:'Write the HR agent brief',
      task:'Write the HR agent brief', slug:'', plan:'2026-09-05/b.md',
      bucket:'Processes', column:'To do', summary:'Handed over.',
      state:'ready', owner:'execution-agent', seen:true, resolution:'', feedback:'', created:'2026-09-06' },
    { name:'2026-09-04-c.md', url:'/x/c.md', title:'Close the buttons gap',
      task:'Close the buttons gap', slug:'', plan:'2026-09-04/c.md',
      bucket:'Design System', column:'Doing', summary:'It did the work.',
      state:'review', owner:'me', seen:false, resolution:'', feedback:'', created:'2026-09-05' },
    { name:'2026-09-03-d.md', url:'/x/d.md', title:'An old one, finished',
      task:'An old one, finished', slug:'', plan:'2026-09-03/d.md',
      bucket:'Strategic', column:'Done', summary:'Signed off.',
      state:'done', owner:'me', seen:true, resolution:'actioned', feedback:'', created:'2026-09-04' }
  ];
  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') {
      window.__blocked.push(method + ' ' + url + ' ' + ((opts && opts.body) || ''));
      return Promise.resolve(new Response('{"ok":true}', {status:200}));
    }
    if (String(url).startsWith('/runs.json')) {
      return Promise.resolve(new Response(JSON.stringify({runs: window.__runs}), {status:200}));
    }
    if (String(url).startsWith('/x/')) {
      return Promise.resolve(new Response(
        ['---','title: t','---','','## What was done','','It was done.',''].join('\\n'), {status:200}));
    }
    return real(url, opts);
  };
  return 'fetch is read-only';
})()`)
await evalJS(`(async () => {
  const demo = await (await fetch('/kanban/demo.md')).text();
  load(demo, 'demo.md', {});
  state.locked = true;
  state.lockedLabel = 'execution test';
  return 'locked';
})()`)
check('tab is locked before any fixture', await evalJS(`state.locked === true`))
check('and no write has left the page', await evalJS(`window.__blocked.length === 0`))

check('the Execution tab is offered, next to Plans', await evalJS(`
  (() => { const ids = viewDefs().map(d => d.id);
    return ids.indexOf('execution') === ids.indexOf('plans') + 1 })()
`))

await evalJS(`(async () => { state.view = 'execution'; await renderExecutionView(); return 1; })()`)
await new Promise(r => setTimeout(r, 500))

// The same four words as the board and the Plans view, in the same order. That
// parallel is the point of the whole thing.
check('Backlog, To do, Waiting for review and Done read left to right', await evalJS(`
  [...document.querySelectorAll('.lists.eview .col')]
    .map(c => c.querySelector('.colhead h3').textContent).join(' | ')
`) === 'Backlog | To do | Waiting for review | Done')
/* The same column as the board's and the Plans view's, drawn by the same
   colHTML(). Its description is in the head rather than the body, which is
   what says a sentence describing a column governs the column. */
check('and each is the shared column, with its description in the head', await evalJS(`
  [...document.querySelectorAll('.lists.eview .col')].every(c =>
    !!c.querySelector('.colhead .colhead-desc') && !!c.querySelector('.colbody')) &&
  !document.querySelector('.lists.eview .colbody .colhead-desc')
`))
check('and none of the Plans view\'s reference cards come with them', await evalJS(`
  !document.querySelector('.lists.eview .pvcol') && !document.querySelector('.lists.eview #usageOut')
`))
check('Waiting for review is drawn as the agent\'s own column', await evalJS(`
  document.querySelector('#runReview').closest('.col').classList.contains('agentcol')
`))

// One card per column, placed by its state rather than by anything the view
// decides for itself.
check('each run is drawn in the column its state names', await evalJS(`
  ['#runBacklog','#runTodo','#runReview','#runDone']
    .map(id => document.querySelectorAll(id + ' .planitem').length).join('')
`) === '1111')
check('a run in Backlog says it is waiting on him', await evalJS(`
  document.querySelector('#runBacklog .bucket').textContent === 'waiting on you'
`))
check('one the agent has written back on reads new until opened', await evalJS(`
  document.querySelector('#runReview .bucket').textContent === 'new'
`))
check('the summary is what the closed row shows', await evalJS(`
  document.querySelector('#runReview .cardsum').textContent.includes('did the work')
`))

// Loading the view mints a run for every plan accepted since the last look. The
// board asks; the runs stream writes.
check('loading it asks the runs stream to catch up', await evalJS(`
  window.__blocked.some(b => b.startsWith('POST /stream/apply') &&
    b.includes('"stream":"runs"') && b.includes('"op":"sync"'))
`))

// --- handing one over -------------------------------------------------------
// Nothing starts here. The confirm has to say so, because "hand it over" reads
// like starting it and the whole safety of the acting agent is that it only
// runs from a session he is in.
await evalJS(`document.querySelector('#runBacklog [data-run-open]').click()`)
await new Promise(r => setTimeout(r, 400))
check('a run opens in the wide modal', await evalJS(`!!document.querySelector('.mscrim .sheet.wide')`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Hand it over').click()`)
await new Promise(r => setTimeout(r, 250))
check('handing it over says nothing runs now', await evalJS(`
  document.querySelector('.mscrim .repdoc').textContent.includes('Nothing runs now')
`))
check('and says how it actually gets run', await evalJS(`
  document.querySelector('.mscrim .repdoc').textContent.includes('/pa-do')
`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Yes, hand it over').click()`)
await new Promise(r => setTimeout(r, 400))
const handed = await evalJS(`window.__blocked.join(' | ')`)
check('it goes to the acting agent as ready',
  handed.includes('"to":"ready"') && handed.includes('"owner":"execution-agent"'))
check('and the card moves into To do', await evalJS(`
  document.querySelectorAll('#runTodo .planitem').length === 2 &&
  document.querySelectorAll('#runBacklog .planitem').length === 0
`))

// --- sending one back -------------------------------------------------------
// A run coming back out of Waiting for review is him asking for it again, so it
// carries a reason. Without one the agent repeats itself at twice the cost.
await evalJS(`document.querySelector('#runReview [data-run-open]').click()`)
await new Promise(r => setTimeout(r, 400))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Hand it over').click()`)
await new Promise(r => setTimeout(r, 250))
check('one already done asks what was wrong with it', await evalJS(`!!document.querySelector('#runWhy')`))
const beforeEmpty = (await evalJS(`String(window.__blocked.length)`)) | 0
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Yes, do it again').click()`)
await new Promise(r => setTimeout(r, 300))
check('and posts nothing when it is empty',
  ((await evalJS(`String(window.__blocked.length)`)) | 0) === beforeEmpty)
// The empty press closed the sheet, the same as it does on the Plans view, so
// the card is opened again before the reason is typed for real.
await evalJS(`document.querySelector('#runReview [data-run-open]').click()`)
await new Promise(r => setTimeout(r, 400))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Hand it over').click()`)
await new Promise(r => setTimeout(r, 250))
await evalJS(`(() => {
  const box = document.querySelector('#runWhy');
  box.value = 'It changed the tokens but never touched the docs.';
  box.dispatchEvent(new Event('input'));
  return 1;
})()`)
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Yes, do it again').click()`)
await new Promise(r => setTimeout(r, 400))
const again = await evalJS(`window.__blocked.join(' | ')`)
check('with a reason it goes back to To do', again.includes('"again":true'))
check('and carries the reason with it', again.includes('never touched the docs'))
check('which the card then shows without being opened', await evalJS(`
  [...document.querySelectorAll('#runTodo .planredo')]
    .some(n => n.textContent.includes('never touched the docs'))
`))

// --- accepting ---------------------------------------------------------------
// And the one thing the acting agent may not do itself: change the task. The
// confirm says where that change actually gets made.
await evalJS(`document.querySelector('#runTodo [data-run-open]').click()`)
await new Promise(r => setTimeout(r, 400))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Accept it').click()`)
await new Promise(r => setTimeout(r, 250))
check('accepting says the task itself is changed by pa, not by the agent', await evalJS(`
  (t => t.includes('never writes') && t.includes('/pa'))(document.querySelector('.mscrim .repdoc').textContent)
`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Yes, accept it').click()`)
await new Promise(r => setTimeout(r, 400))
check('accepting finishes it as done, actioned', await evalJS(`
  window.__blocked.join(' | ').includes('"to":"done"') &&
  window.__blocked.join(' | ').includes('"resolution":"actioned"')
`))

// --- dragging between the columns -------------------------------------------
// The same three moves, reached the way the board is worked. Waiting for review
// takes no drop at all: filling it is the agent's half of the arrangement.
const dropOn = (from, target) => `(() => {
  const row = document.querySelector('${from} .planitem');
  const to = document.querySelector('${target}');
  const dt = new DataTransfer();
  row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles:true }));
  const ev = new DragEvent('dragover', { dataTransfer: dt, bubbles:true, cancelable:true });
  to.dispatchEvent(ev);
  to.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles:true, cancelable:true }));
  return ev.defaultPrevented;
})()`
check('a run row is draggable', await evalJS(`
  document.querySelector('#runTodo .planitem').getAttribute('draggable') === 'true'
`))
check('dropping one on Backlog puts it back out of reach', await evalJS(dropOn('#runTodo', '#runBacklog')))
await new Promise(r => setTimeout(r, 400))
check('which is written as backlog, owned by him', await evalJS(`
  (b => b.includes('"to":"backlog"') && b.includes('"owner":"me"'))(window.__blocked.join(' | '))
`))
check('Waiting for review takes no drop', await evalJS(`(() => {
  const row = document.querySelector('#runBacklog .planitem');
  const dt = new DataTransfer();
  row.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles:true }));
  const ev = new DragEvent('dragover', { dataTransfer: dt, bubbles:true, cancelable:true });
  document.querySelector('#runReview').dispatchEvent(ev);
  row.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles:true }));
  return !ev.defaultPrevented;
})()`))

// The whole point of the second guard.
check('nothing reached todo.md', await evalJS(`
  !window.__blocked.some(b => b.includes('todo.md'))
`))
check('and every write was one transition on the runs stream', await evalJS(`
  window.__blocked.every(b => b.startsWith('POST /stream/apply') && b.includes('"stream":"runs"'))
`), await evalJS(`String(window.__blocked.length) + ' writes'`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
