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
 * /plans.json, /queue.json and /night-agent.json are all stubbed rather than read
 * from disk, so this needs no plans, no queue and no run log to exist, and it
 * never touches data/.
 *
 * The queue column is the reason the blocked list matters twice over: dragging
 * a card there posts an ordering, and the whole design rests on that ordering
 * going to plans/queue-order.json and nowhere near todo.md. Both halves are
 * asserted below.
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
  window.__queue = {
    queue: [
      { title:'Review the objectives', bucket:'People', column:'Doing', ai:'partial',
        agent:'pa-plan-people', position:1, state:'queued', why:'never planned',
        last:'', lastStatus:'' },
      { title:'Rename the text styles', bucket:'DS', column:'To do', ai:'full',
        agent:'pa-plan-design-system', position:2, state:'queued',
        why:'changed since 2026-09-03', last:'2026-09-03', lastStatus:'read' },
      { title:'Adoption and usage report', bucket:'DS', column:'Backlog', ai:'full',
        agent:'pa-plan-design-system', position:3, state:'queued', why:'never planned',
        last:'', lastStatus:'' }
    ],
    held: [
      { title:'Arabic theme as a new token mode', bucket:'DS', column:'Backlog', ai:'full',
        agent:'pa-plan-design-system', position:0, state:'held',
        why:'held back from the board', last:'', lastStatus:'' }
    ],
    skipped: [
      { title:'Something parked', bucket:'People', column:'Blocked', ai:'partial',
        agent:'pa-plan-people', position:0, state:'skipped',
        why:'unchanged since 2026-09-04', last:'2026-09-04', lastStatus:'unread' }
    ],
    order: ['Review the objectives', 'Rename the text styles', 'Adoption and usage report',
            'Arabic theme as a new token mode'],
    hold: ['Arabic theme as a new token mode']
  };
  // Not live to start with — the Queue/Doing card shows Queue while this is
  // the fixture, which is what the backlog/queue drag section below needs:
  // a live run hides #queueOut, and a hidden element has no bounding box for
  // a drag to land in. Switched to live further down, right before the
  // section that tests Doing itself.
  window.__nightAgent = {
    live: false, since:'', started:'2026-09-05 02:05:01', toPlan: 4,
    current: null, orphan: null,
    done: [{ title:'Review the objectives', took: 214, cost: 0.83, at:'2026-09-05 02:11:38' }],
    failed: [{ title:'A task that blew up', why:'the run failed', at:'2026-09-05 02:09:00' }],
    stopped: '', left: 3
  };
  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') {
      window.__blocked.push(method + ' ' + url + ' ' + ((opts && opts.body) || ''));
      return Promise.resolve(new Response('{"ok":true}', {status:200}));
    }
    if (String(url).startsWith('/plans.json')) {
      return Promise.resolve(new Response(JSON.stringify({plans: window.__plans}), {status:200}));
    }
    if (String(url).startsWith('/queue.json')) {
      return Promise.resolve(new Response(JSON.stringify(window.__queue), {status:200}));
    }
    if (String(url).startsWith('/night-agent.json')) {
      return Promise.resolve(new Response(JSON.stringify(window.__nightAgent), {status:200}));
    }
    // The usage half is a second of work on the real server and nothing here
    // asserts on it; an empty answer keeps the fourth column quiet.
    if (String(url).startsWith('/usage.json')) {
      return Promise.resolve(new Response('{"available":false}', {status:200}));
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

// --- the queue column ------------------------------------------------------
// What tonight would plan, in the order it would plan it, and the two ways to
// change that: drag to reorder, hold to take one out entirely.

check('all five cards are drawn', await evalJS(`
  !!document.querySelector('#backlogOut') && !!document.querySelector('#queueOut') &&
  !!document.querySelector('#doingOut') && !!document.querySelector('#plansOut') &&
  !!document.querySelector('#usageOut') && !!document.querySelector('#schedOut')
`))
check('the queue shows while nothing is running, not Doing', await evalJS(`
  document.querySelector('#qdTitle').textContent === 'Queue' &&
  !document.querySelector('#queueOut').classList.contains('hidden') &&
  document.querySelector('#doingOut').classList.contains('hidden')
`))
check('Backlog, Queue, Done, Token Session and the clock read left to right, top to bottom', await evalJS(`
  [...document.querySelectorAll('.lists.pview .listcard')]
    .map(c => c.querySelector('h3').textContent).join(' | ')
`) === 'Backlog | Queue | Done | Token Session | What runs on a clock')
check('Token Session and the clock share the last track, stacked', await evalJS(`
  document.querySelector('.pvcol').children.length === 2 &&
  document.querySelector('.pvcol').children[0].querySelector('h3').textContent === 'Token Session' &&
  document.querySelector('.pvcol').children[1].querySelector('h3').textContent === 'What runs on a clock'
`))

check('every queued task is listed', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem')].length
`) === 3)
check('numbered by the order it will be worked through', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem .qpos')].map(e => e.textContent).join('')
`) === '123')
check('each says why it is being planned again', await evalJS(`
  document.querySelectorAll('#queueOut .qwhy')[1].textContent.includes('changed since 2026-09-03')
`))

// --- the backlog column -----------------------------------------------------
// Held cards and not-eligible cards both live here, and only the first kind
// can be dragged back into the queue.

check('a held card is shown in the backlog, not the queue', await evalJS(`
  !document.querySelector('#queueOut .qitem.held') &&
  !!document.querySelector('#backlogOut .qitem.held')
`))
check('and it can be dragged', await evalJS(`
  document.querySelector('#backlogOut .qitem.held').getAttribute('draggable') === 'true'
`))
check('what a rule dropped is shown with its reason', await evalJS(`
  document.querySelector('#backlogOut .qskip em').textContent.includes('unchanged')
`))
check('and it cannot be dragged, unlike a held card', await evalJS(`
  !document.querySelector('#backlogOut .qskip').closest('[draggable="true"]')
`))

// Dragging the third card above the first. The board reorders locally and then
// posts the whole ordering — the one write this column makes.
await evalJS(`(() => {
  const rows = document.querySelectorAll('#queueOut > .qitem');
  const from = rows[2], to = rows[0];
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles:true }));
  const box = to.getBoundingClientRect();
  const opts = { dataTransfer: dt, bubbles:true, clientY: box.top + 2 };
  to.dispatchEvent(new DragEvent('dragover', opts));
  to.dispatchEvent(new DragEvent('drop', opts));
  return 1;
})()`)
await new Promise(r => setTimeout(r, 300))
check('a drag reorders the queue', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem .qtitle')].map(e => e.textContent)[0]
`) === 'Adoption and usage report')
check('and renumbers what it moved', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem .qpos')].map(e => e.textContent).join('')
`) === '123')
const ordered = await evalJS(`window.__blocked.join(' | ')`)
check('the new order is posted', ordered.includes('POST /queue/order'))
check('front of the queue first in the body', await evalJS(`
  JSON.parse(window.__blocked.find(b => b.startsWith('POST /queue/order'))
    .split(' ').slice(2).join(' ')).order[0] === 'Adoption and usage report'
`))
// A held title the board is not showing as queued must survive the save, or
// releasing it later would put it at the back of a queue it was never at the
// back of.
check('and a held title is carried through rather than dropped', await evalJS(`
  JSON.parse(window.__blocked.find(b => b.startsWith('POST /queue/order'))
    .split(' ').slice(2).join(' ')).order
    .includes('Arabic theme as a new token mode')
`))

// Holding one takes it out of the queue and says so in the same post.
await evalJS(`document.querySelector('#queueOut > .qitem [data-qhold]').click()`)
await new Promise(r => setTimeout(r, 300))
check('holding a card removes it from the queue', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem')].length === 2
`))
check('and names it in the hold list', await evalJS(`
  JSON.parse(window.__blocked.filter(b => b.startsWith('POST /queue/order')).pop()
    .split(' ').slice(2).join(' ')).hold.includes('Adoption and usage report')
`))

// Two cards sit held in the backlog now — the original fixture's and the one
// just held above. Dragging the first of them back onto the queue puts it
// back in play, at the position dropped, and only that title leaves the hold
// list — the second held card stays held.
await evalJS(`(() => {
  const from = document.querySelector('#backlogOut .qitem.held');
  const to = document.querySelectorAll('#queueOut > .qitem')[0];
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles:true }));
  const box = to.getBoundingClientRect();
  const opts = { dataTransfer: dt, bubbles:true, clientY: box.top + 2 };
  to.dispatchEvent(new DragEvent('dragover', opts));
  to.dispatchEvent(new DragEvent('drop', opts));
  return 1;
})()`)
await new Promise(r => setTimeout(r, 300))
check('dragging a held card into the queue un-holds it', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem')].length === 3
`))
check('dropped at the top of the queue', await evalJS(`
  document.querySelector('#queueOut > .qitem .qtitle').textContent
`) === 'Arabic theme as a new token mode')
check('the other held card stays behind', await evalJS(`
  document.querySelector('#backlogOut .qitem.held .qtitle').textContent
`) === 'Adoption and usage report')
check('and the hold list drops only the one released', await evalJS(`
  (() => { const hold = JSON.parse(window.__blocked.filter(b => b.startsWith('POST /queue/order')).pop()
    .split(' ').slice(2).join(' ')).hold;
    return !hold.includes('Arabic theme as a new token mode') &&
           hold.includes('Adoption and usage report') })()
`))

// The reverse drag — a queue card dropped onto the backlog holds it back,
// the same as pressing Hold. There is nothing to drop it against, so the
// whole column is the target rather than one row within it.
await evalJS(`(() => {
  const rows = document.querySelectorAll('#queueOut > .qitem');
  const from = rows[rows.length - 1];
  const to = document.querySelector('#backlogOut');
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles:true }));
  const opts = { dataTransfer: dt, bubbles:true };
  to.dispatchEvent(new DragEvent('dragover', opts));
  to.dispatchEvent(new DragEvent('drop', opts));
  return 1;
})()`)
await new Promise(r => setTimeout(r, 300))
check('dragging a queue card onto the backlog holds it', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem')].length === 2
`))
check('and it shows up there, held', await evalJS(`
  [...document.querySelectorAll('#backlogOut .qitem.held .qtitle')].map(e => e.textContent)
    .includes('Rename the text styles')
`))
check('without disturbing the card held earlier', await evalJS(`
  [...document.querySelectorAll('#backlogOut .qitem.held .qtitle')].map(e => e.textContent)
    .includes('Adoption and usage report')
`))
check('and the post names both held titles', await evalJS(`
  (() => { const hold = JSON.parse(window.__blocked.filter(b => b.startsWith('POST /queue/order')).pop()
    .split(' ').slice(2).join(' ')).hold;
    return hold.includes('Rename the text styles') && hold.includes('Adoption and usage report') })()
`))

// --- Doing --------------------------------------------------------------
// A live run takes over the card: the title swaps to Doing, the queue list
// hides (so a hidden #queueOut is not what the drag tests above ran
// against — this is why the fixture starts not-live), and the Run button
// goes with it.

await evalJS(`(async () => {
  window.__nightAgent = {
    live: true, since:'2026-09-05T02:05', started:'2026-09-05 02:05:01', toPlan: 4,
    current: { title:'Rename the text styles', agent:'pa-plan-design-system',
               since:'2026-09-05 02:11:40' },
    orphan: null,
    done: [{ title:'Review the objectives', took: 214, cost: 0.83, at:'2026-09-05 02:11:38' }],
    failed: [{ title:'A task that blew up', why:'the run failed', at:'2026-09-05 02:09:00' }],
    stopped: '', left: 3
  };
  await renderNightAgent();
  return 1;
})()`)
await new Promise(r => setTimeout(r, 300))
check('the card becomes Doing, and the queue steps aside', await evalJS(`
  document.querySelector('#qdTitle').textContent === 'Doing' &&
  document.querySelector('#queueOut').classList.contains('hidden') &&
  !document.querySelector('#doingOut').classList.contains('hidden')
`))
check('the task in flight is named', await evalJS(`
  document.querySelector('#doingOut .fnow strong').textContent === 'Rename the text styles'
`))
check('with the agent working on it', await evalJS(`
  document.querySelector('#doingOut .fnow .repmeta').textContent.includes('pa-plan-design-system')
`))
// Run started / Planned / Left sit in Done now — a record of the batch, the
// same kind of fact "Latest run costs" is, not a description of what's
// happening this second.
check('progress through the batch is shown in Done', await evalJS(`
  document.querySelector('#doneStatsOut .schedmeta').textContent.includes('1 of 4')
`))
// The results of the run itself sit in Token Session, not here — this card
// is only what's happening right now. Folded shut like "What runs on a
// clock", with the cost on the fold's own summary line rather than a
// heading inside it.
check('what the run has written is listed in Token Session, with what it cost', await evalJS(`
  document.querySelector('#runResultsSummary').textContent.includes('Latest run costs') &&
  document.querySelector('#runResultsOut .frow.done .fmeta').textContent === '214s · $0.83'
`))
check('and the summary carries the date the run started', await evalJS(`
  (() => { const h = document.querySelector('#runResultsSummary').textContent;
    return h !== 'Latest run costs · $0.83' && h.includes('$0.83') })()
`))
check('and the fold is not hidden when there is something to show', await evalJS(`
  !document.querySelector('#runResultsFold').classList.contains('hidden')
`))
check('and a failure is separated from a success', await evalJS(`
  document.querySelector('#runResultsOut .frow.failed .fname').textContent === 'A task that blew up'
`))
check('a run already going is not offered a second one', await evalJS(`
  document.querySelector('#runQueueBtn').classList.contains('hidden')
`))

// A dead run must not read as a live one. The lock is what says which — and
// it is not "actively running", so the card falls back to Queue rather than
// staying on Doing, with the dead run named in a banner above the list.
await evalJS(`(async () => {
  window.__nightAgent = { live:false, since:'', started:'2026-09-05 02:05:01', toPlan: 4,
    current: null,
    orphan: { title:'Rename the text styles', agent:'pa-plan-design-system',
              since:'2026-09-05 02:11:40' },
    done: [], failed: [], stopped:'', left: 4 };
  await renderNightAgent();
  return 1;
})()`)
await new Promise(r => setTimeout(r, 300))
check('a run that died mid-task says so rather than looking live', await evalJS(`
  document.querySelector('#qdTitle').textContent === 'Queue' &&
  document.querySelector('#doingOut').classList.contains('hidden') &&
  !document.querySelector('#qdOrphan').classList.contains('hidden') &&
  document.querySelector('#qdOrphan .err').textContent.includes('never finished')
`))

// --- forcing a run by hand ------------------------------------------------
// The button spends real money, so it confirms first and says what it will
// cost. The post itself is recorded rather than sent, like every other write
// in here.

check('with nothing running, the agent can be started by hand', await evalJS(`
  !!document.querySelector('#runQueueBtn') && !document.querySelector('#runQueueBtn').classList.contains('hidden')
`))
await evalJS(`document.querySelector('#runQueueBtn').click()`)
await new Promise(r => setTimeout(r, 300))
check('pressing it asks first rather than spending', await evalJS(`
  !!document.querySelector('.mscrim .sheet') && window.__blocked.every(b => !b.includes('/night_agent/run'))
`))
check('and the confirm says what it costs and that nothing is carried out', await evalJS(`
  (() => { const m = document.querySelector('.mscrim .mid').textContent;
    return m.includes('$12') && m.includes('$2') &&
           m.includes('Nothing it writes is carried out') })()
`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Run it').click()`)
await new Promise(r => setTimeout(r, 400))
check('confirming posts the run', await evalJS(`
  window.__blocked.some(b => b.startsWith('POST /night_agent/run'))
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

// Agree and Send back, the two statuses the execution half runs on. Both go
// through a confirm, and Send back refuses to post without a reason — which is
// the whole feature, since the reason is what the next night's agent is given.
await evalJS(`document.querySelectorAll('#plansOut [data-plan-open]')[0].click()`)
await new Promise(r => setTimeout(r, 400))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Send it back').click()`)
await new Promise(r => setTimeout(r, 200))
check('Send it back asks for a reason first', await evalJS(`!!document.querySelector('#redoWhy')`))
const beforeEmpty = (await evalJS(`String(window.__blocked.length)`)) | 0
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Send it back').click()`)
await new Promise(r => setTimeout(r, 300))
check('and posts nothing when it is empty',
  ((await evalJS(`String(window.__blocked.length)`)) | 0) === beforeEmpty)

await evalJS(`document.querySelectorAll('#plansOut [data-plan-open]')[0].click()`)
await new Promise(r => setTimeout(r, 400))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Send it back').click()`)
await new Promise(r => setTimeout(r, 200))
await evalJS(`(() => {
  const box = document.querySelector('#redoWhy');
  box.value = 'Wrong scope, this is the Foundations file only.';
  box.dispatchEvent(new Event('input'));
  return 1;
})()`)
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Send it back').click()`)
await new Promise(r => setTimeout(r, 400))
const sentBack = await evalJS(`window.__blocked.join(' | ')`)
check('with a reason it posts redo', sentBack.includes('"status":"redo"'))
check('and carries the reason with it', sentBack.includes('Wrong scope'))
check('the reason is shown on the card without opening it', await evalJS(`
  !!document.querySelector('#plansOut .repitem.redo .planredo')
`))

await evalJS(`document.querySelectorAll('#plansOut [data-plan-open]')[0].click()`)
await new Promise(r => setTimeout(r, 400))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Agree, hand it over').click()`)
await new Promise(r => setTimeout(r, 200))
check('Agree confirms before it commits anything', await evalJS(`
  document.querySelector('.mscrim .repdoc').textContent.includes('Nothing runs now')
`))
check('and says how it actually gets run', await evalJS(`
  document.querySelector('.mscrim .repdoc').textContent.includes('/pa-do')
`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Agree it').click()`)
await new Promise(r => setTimeout(r, 400))
check('agreeing posts agreed', (await evalJS(`window.__blocked.join(' | ')`)).includes('"status":"agreed"'))
check('and the agreed plan is lifted out of the reading list', await evalJS(`
  !!document.querySelector('#plansOut .planagreed .repitem.agreed')
`))

// The whole point of the second guard.
check('nothing reached todo.md', await evalJS(`
  !window.__blocked.some(b => b.includes('todo.md'))
`))
check('and every write was a plan status, a queue ordering or a run', await evalJS(`
  window.__blocked.every(b =>
    b.startsWith('POST /plan/status') || b.startsWith('POST /queue/order') ||
    b.startsWith('POST /night_agent/run'))
`), await evalJS(`String(window.__blocked.length) + ' writes'`))
// The whole queue column writes to exactly one place, and it is not the list.
check('the queue writes only its own ordering', await evalJS(`
  window.__blocked.filter(b => b.includes('order')).every(b => b.startsWith('POST /queue/order'))
`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
