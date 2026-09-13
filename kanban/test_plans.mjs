/**
 * Drives the Plans view in headless Chrome and asserts on what it draws.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_plans.mjs
 *
 * Same two guards as test_chats.mjs, for the same reason — this repo has lost
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
 * /plans.json, /queue.json and /planning-agent.json are all stubbed rather than read
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

/* Waiting for a paint, which this suite has to do since 13 Sep 2026 and did
   not before. paintPlans() mounted through BoardUI.mountSync() until then,
   because the view wired its own handlers onto the nodes it had just painted
   and so needed them to exist by the time the call returned. Every handler is
   a prop now and the mount is an ordinary one, so React schedules the paint
   and a render followed by a read in the same breath reads the paint before
   it. Two frames, because React commits in one and the browser lays out in
   the next. evalJS awaits a returned promise, so `return painted()` is all a
   render step needs. */
await evalJS(`(window.painted = () => new Promise(
  r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))) && 1`)

// LOCK FIRST, then fixtures. Nothing below can write anything.
await evalJS(`(() => {
  const real = window.fetch;
  window.__blocked = [];
  window.__plans = [
    { name:'add-caveat.md', night:'2026-09-05', url:'/x/add-caveat.md', state:'review', owner:'me', seen:false,
      title:'Add Caveat to the design system type stack', task:'Add Caveat to the design system type stack',
      bucket:'Design System', column:'To do', ai:'partial', agent:'planning-design-system',
      date:'2026-09-05', summary:'Caveat is already in the Foundations file as a loose style.',
      // Sent back once and re-planned — the card names both dates so this one
      // does not read as freshly written the way hr-agent.md, with none, does.
      revisions: [{ date:'2026-09-01', revision:1 }, { date:'2026-09-05', revision:2 }] },
    { name:'hr-agent.md', night:'2026-09-05', url:'/x/hr-agent.md', state:'review', owner:'me', seen:true,
      title:'Create an HR agent', task:'Create an HR agent', bucket:'Processes', column:'To do',
      ai:'partial', agent:'planning-processes', date:'2026-09-05',
      summary:'Five of the six pieces exist as skills already.' },
    { name:'old.md', night:'2026-09-04', url:'/x/old.md', state:'done', owner:'me', seen:true, resolution:'actioned',
      title:'Something already dealt with', task:'Something already dealt with',
      bucket:'Strategic', column:'Backlog', ai:'partial', agent:'planning-strategic',
      date:'2026-09-04', summary:'Done and dusted.' },
    /* The three stages the implementing agent's half can be at, since the
       Execution board was folded into this one on 13 Sep 2026. All three are
       accepted plans and all three draw in Ready to be produced — six columns
       rather than eight was the decision, so the stage is a mark on the card
       and not a place. */
    { name:'prod-none.md', night:'2026-09-05', url:'/x/prod-none.md', state:'accepted',
      owner:'implementing-agent', seen:true, production:'none',
      title:'Accepted, not started', task:'Accepted, not started',
      bucket:'DS', column:'To do', agent:'planning-design-system', date:'2026-09-05', summary:'x' },
    { name:'prod-doing.md', night:'2026-09-05', url:'/x/prod-doing.md', state:'accepted',
      owner:'implementing-agent', seen:true, production:'doing',
      title:'Being made right now', task:'Being made right now',
      bucket:'DS', column:'To do', agent:'planning-design-system', date:'2026-09-05', summary:'x' },
    /* Turned down outright — the fourth move, added 13 Sep 2026. It draws in
       Done beside completed and replaced rather than in a column of its own,
       because it is one of the ways a plan closes. */
    { name:'declined.md', night:'2026-09-04', url:'/x/declined.md', state:'done', owner:'me',
      seen:true, resolution:'declined', feedback:'Not worth the effort.',
      title:'An idea turned down', task:'An idea turned down',
      bucket:'Strategic', column:'Backlog', agent:'planning-strategic', date:'2026-09-04', summary:'x' },
    { name:'prod-review.md', night:'2026-09-05', url:'/x/prod-review.md', state:'accepted',
      owner:'me', seen:false, production:'review',
      title:'Reported back', task:'Reported back',
      bucket:'DS', column:'To do', agent:'planning-design-system', date:'2026-09-05', summary:'x' }
  ];
  window.__queue = {
    queue: [
      { title:'Review the objectives', bucket:'People', column:'Doing', ai:'partial',
        agent:'planning-people', position:1, state:'queued', why:'never planned',
        last:'', lastStatus:'' },
      { title:'Rename the text styles', bucket:'DS', column:'To do', ai:'full',
        agent:'planning-design-system', position:2, state:'queued',
        why:'changed since 2026-09-03', last:'2026-09-03', lastStatus:'read' },
      { title:'Adoption and usage report', bucket:'DS', column:'Backlog', ai:'full',
        agent:'planning-design-system', position:3, state:'queued', why:'never planned',
        last:'', lastStatus:'' }
    ],
    held: [
      { title:'Arabic theme as a new token mode', bucket:'DS', column:'Backlog', ai:'full',
        agent:'planning-design-system', position:0, state:'held',
        why:'held back from the board', last:'', lastStatus:'' }
    ],
    skipped: [
      { title:'Something parked', bucket:'People', column:'Blocked', ai:'partial',
        agent:'planning-people', position:0, state:'skipped',
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
    if (String(url).startsWith('/planning-agent.json')) {
      return Promise.resolve(new Response(JSON.stringify(window.__nightAgent), {status:200}));
    }
    // The usage half is a second of work on the real server and nothing here
    // asserts on it; an empty answer keeps the fourth column quiet.
    if (String(url).startsWith('/usage.json')) {
      return Promise.resolve(new Response('{"available":false}', {status:200}));
    }
    if (String(url).startsWith('/x/')) {
      // A plan in the shape PLAN-BRIEF.md asks for: five sections, two of them
      // written for an agent rather than for him.
      return Promise.resolve(new Response([
        '---', 'title: t', '---', '',
        '## Context', '', '**Read.** ds-inventory/snapshots/figma/2026-09-04/.', '',
        '### A subheading inside it', '', 'Still not his to read.', '',
        '## Summary', '', 'Confirm the weights, hold the brand half.', '',
        '## Findings', '', '- Caveat is in Foundations.', '',
        '## Proposed plan', '', '1. Run ds-analyst.', '2. Write the options.', '',
        '## History', '', '- **2026-09-05, revision 1.** Planned.', ''
      ].join('\\n'), {status:200}));
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

// A plan sent back and re-planned reads as what it is, not as one written
// fresh — the card names how many revisions and when, read off the History
// section server-side rather than kept as a second count.
check('a plan with a History behind it says how many revisions and when', await evalJS(`
  [...document.querySelectorAll('#plansOut .planwhere')]
    .some(el => el.textContent.includes('2 revisions') &&
                el.textContent.includes('1 Sep') && el.textContent.includes('5 Sep'))
`))
check('a plan with no History behind it says nothing about revisions', await evalJS(`
  (() => {
    const card = [...document.querySelectorAll('#plansOut .repitem')]
      .find(c => c.textContent.includes('Create an HR agent'));
    return !!card && !(card.querySelector('.planwhere')?.textContent || '').includes('revision');
  })()
`))
/* `done / actioned` is what accepting a plan wrote until 12 Sep 2026, so this
   fixture row is a plan accepted under the old spelling — and it belongs in
   Ready to be produced rather than Done, which now means the work has
   finished. Flat and unfolded: the fold existed because the old Done column
   was holding two questions at once, and splitting it took the second away. */
/* Done holds the one he turned down and nothing else: `done / actioned` is a
   plan accepted under the old spelling and belongs in Ready to be produced,
   which is the distinction the seventh state was added to draw. */
check('accepted ones sit in Ready to be produced, not Done', await evalJS(`
  document.querySelectorAll('#plansProduced > .repitem').length === 4 &&
  [...document.querySelectorAll('#plansProduced .bucket')]
    .every(b => b.textContent === 'accepted') &&
  document.querySelectorAll('#plansDone > .repitem').length === 1 &&
  document.querySelector('#plansDone .bucket').textContent === 'declined'
`), await evalJS(`
  document.querySelectorAll('#plansProduced > .repitem').length + ' rows, words: ' +
  [...document.querySelectorAll('#plansProduced .bucket')].map(b => b.textContent).join('/')`))
check('and Waiting for review holds only what is still to be read', await evalJS(`
  ![...document.querySelectorAll('#plansOut .repitem')]
    .some(r => r.classList.contains('actioned') || r.classList.contains('agreed') ||
               r.classList.contains('redo'))
`))
check('an unread plan is marked new', await evalJS(`
  document.querySelector('#plansOut .repitem:not(.read):not(.actioned) .bucket').textContent === 'new'
`))
check('a read plan is dimmed rather than hidden', await evalJS(`
  !!document.querySelector('#plansOut .repitem.read')
`))
check('the summary is what the closed row shows', await evalJS(`
  document.querySelector('#plansOut .cardsum').textContent.includes('Foundations file')
`))

// --- the queue column ------------------------------------------------------
// What tonight would plan, in the order it would plan it, and the two ways to
// change that: drag to reorder, hold to take one out entirely.

check('all six columns are drawn', await evalJS(`
  ['#backlogOut','#queueOut','#doingOut','#plansOut','#plansProduced','#plansDone']
    .every(id => !!document.querySelector(id))
`))
// Token Session and the clock are behind a button, not a fifth column: neither
// is a decision, and the view's work is the four columns.
check('and the two reference cards are not on the view', await evalJS(`
  !document.querySelector('#usageOut') && !document.querySelector('#schedOut') &&
  !document.querySelector('.lists.pview .pvcol')
`))
/* To do keeps its own name now that Doing is a column of its own. It used to
   retitle itself while a run was live, because the queue and the run in flight
   shared one card; the queue also stays drawn, since "what happens after this
   one" is a live question during a run rather than a hidden one. */
check('To do keeps its name and its queue while nothing is running', await evalJS(`
  document.querySelector('#queueDoingCard .colhead h3').textContent === 'To do' &&
  !document.querySelector('#queueOut').classList.contains('hidden') &&
  document.querySelector('#doingOut').classList.contains('hidden')
`))
// The same six words as the board itself, in the same order. That parallel is
// the whole point of the rename on 12 Sep 2026: where a card sits is the
// instruction, and it means the same thing on both boards.
check('the board\'s own six columns read left to right', await evalJS(`
  [...document.querySelectorAll('.lists.pview .col')]
    .map(c => c.querySelector('.colhead h3').textContent).join(' | ')
`) === 'Backlog | To do | Doing | Waiting for review | Ready to be produced | Done')
// Every column carries one, and it is in the head rather than being the first
// paragraph of the body — a sentence describing a column governs the column.
check('each one says what it is for, in its own head', await evalJS(`
  [...document.querySelectorAll('.lists.pview .col')]
    .every(c => !!c.querySelector('.colhead .colhead-desc')) &&
  !document.querySelector('.lists.pview .colbody .colhead-desc')
`))
check('Waiting for review is drawn as the agent\'s own column', await evalJS(`
  document.querySelector('#plansOut').closest('.col').classList.contains('agentcol')
`))

// The two reference cards, a press away on the Backlog card's head. Opening is
// the only thing that puts #usageOut and #schedOut in the page, so everything
// that draws into them is called by the opener rather than by the view.
await evalJS(`document.querySelector('#refCardsBtn').click()`)
await new Promise(r => setTimeout(r, 400))
check('the button opens both of them in one modal, stacked', await evalJS(`
  document.querySelector('.mscrim .sheet').classList.contains('wide') &&
  document.querySelector('.mscrim .pvcol').children.length === 2 &&
  document.querySelector('.mscrim .pvcol').children[0].querySelector('h3').textContent === 'Token Session' &&
  document.querySelector('.mscrim .pvcol').children[1].querySelector('h3').textContent === 'What runs on a clock'
`))
// The fold is drawn from the poll's own last payload, not a second fetch — the
// fixture has a finished run in it, so there is something for it to say.
check('and the latest run costs come with it', await evalJS(`
  document.querySelector('#runResultsSummary').textContent.includes('$0.83')
`))
await evalJS(`closeModal()`)
check('closing it takes them back out of the page', await evalJS(`
  !document.querySelector('.mscrim') && !document.querySelector('#usageOut')
`))

check('every queued task is listed', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem')].length
`) === 3)
check('numbered by the order it will be worked through', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem .cardpos')].map(e => e.textContent).join('')
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
  [...document.querySelectorAll('#queueOut > .qitem .title')].map(e => e.textContent)[0]
`) === 'Adoption and usage report')
check('and renumbers what it moved', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem .cardpos')].map(e => e.textContent).join('')
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
await evalJS(`document.querySelector('#queueOut > .qitem .qhold').click()`)
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
  document.querySelector('#queueOut > .qitem .title').textContent
`) === 'Arabic theme as a new token mode')
check('the other held card stays behind', await evalJS(`
  document.querySelector('#backlogOut .qitem.held .title').textContent
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
  [...document.querySelectorAll('#backlogOut .qitem.held .title')].map(e => e.textContent)
    .includes('Rename the text styles')
`))
check('without disturbing the card held earlier', await evalJS(`
  [...document.querySelectorAll('#backlogOut .qitem.held .title')].map(e => e.textContent)
    .includes('Adoption and usage report')
`))
check('and the post names both held titles', await evalJS(`
  (() => { const hold = JSON.parse(window.__blocked.filter(b => b.startsWith('POST /queue/order')).pop()
    .split(' ').slice(2).join(' ')).hold;
    return hold.includes('Rename the text styles') && hold.includes('Adoption and usage report') })()
`))

// Release is the button half of that drag, and until 13 Sep 2026 nothing
// exercised it — it was found after every paint by `[data-qrelease]`, and it
// takes an onClick prop now like every other control on this view. Two cards
// are held at this point; releasing one puts it back at the end of the queue
// and leaves the other where it is.
await evalJS(`(() => {
  const row = [...document.querySelectorAll('#backlogOut .qitem.held')]
    .find(r => r.querySelector('.title').textContent === 'Rename the text styles');
  row.querySelector('.qhold').click();
  return painted();
})()`)
check('Release puts a held card back in the queue', await evalJS(`
  [...document.querySelectorAll('#queueOut > .qitem .title')].map(e => e.textContent)
    .includes('Rename the text styles')
`))
check('and takes it out of the backlog', await evalJS(`
  ![...document.querySelectorAll('#backlogOut .qitem.held .title')].map(e => e.textContent)
    .includes('Rename the text styles')
`))
check('and drops only that title from the hold list', await evalJS(`
  (() => { const hold = JSON.parse(window.__blocked.filter(b => b.startsWith('POST /queue/order')).pop()
    .split(' ').slice(2).join(' ')).hold;
    return !hold.includes('Rename the text styles') &&
           hold.includes('Adoption and usage report') })()
`))

// --- Doing --------------------------------------------------------------
// A live run takes over the card: the title swaps to Doing, the queue list
// hides (so a hidden #queueOut is not what the drag tests above ran
// against — this is why the fixture starts not-live), and the Run button
// goes with it.

await evalJS(`(async () => {
  window.__nightAgent = {
    live: true, since:'2026-09-05T02:05', started:'2026-09-05 02:05:01', toPlan: 4,
    current: { title:'Rename the text styles', agent:'planning-design-system',
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
/* The Doing column fills and the To do column stays as it is. Both of those
   used to be one card that renamed itself and hid its own queue; with Doing a
   column of its own, the live run is drawn beside the queue rather than over
   it, and the queue is still the answer to what happens after this one. */
check('the Doing column fills, and To do keeps its queue', await evalJS(`
  !document.querySelector('#doingOut').classList.contains('hidden') &&
  document.querySelector('#queueDoingCard .colhead h3').textContent === 'To do' &&
  !document.querySelector('#queueOut').classList.contains('hidden')
`))
check('the task in flight is named', await evalJS(`
  document.querySelector('#doingOut .fnow strong').textContent === 'Rename the text styles'
`))
check('with the agent working on it', await evalJS(`
  document.querySelector('#doingOut .fnow .repmeta').textContent.includes('planning-design-system')
`))
// Run started / Planned / Left sit in Done now — a record of the batch, the
// same kind of fact "Latest run costs" is, not a description of what's
// happening this second.
check('progress through the batch is shown in Done', await evalJS(`
  document.querySelector('#doneStatsOut .schedmeta').textContent.includes('1 of 4')
`))
// The results of the run itself sit in Token Session, not here — this card
// is only what's happening right now. Token Session is behind the button, so
// the fold has to be read there, drawn from the payload the poll just took.
// Folded shut, with the cost on the fold's own summary line rather than a
// heading inside it.
await evalJS(`document.querySelector('#refCardsBtn').click()`)
await new Promise(r => setTimeout(r, 300))
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
await evalJS(`closeModal()`)
check('a run already going is not offered a second one', await evalJS(`
  document.querySelector('#runQueueBtn').classList.contains('hidden')
`))

// A dead run must not read as a live one. The lock is what says which — and
// it is not "actively running", so the card falls back to Queue rather than
// staying on Doing, with the dead run named in a banner above the list.
await evalJS(`(async () => {
  window.__nightAgent = { live:false, since:'', started:'2026-09-05 02:05:01', toPlan: 4,
    current: null,
    orphan: { title:'Rename the text styles', agent:'planning-design-system',
              since:'2026-09-05 02:11:40' },
    done: [], failed: [], stopped:'', left: 4 };
  await renderNightAgent();
  return 1;
})()`)
await new Promise(r => setTimeout(r, 300))
check('a run that died mid-task says so rather than looking live', await evalJS(`
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
  !!document.querySelector('.mscrim .sheet') && window.__blocked.every(b => !b.includes('/planning_agent/run'))
`))
check('and the confirm says what it costs and that nothing is carried out', await evalJS(`
  (() => { const m = document.querySelector('.mscrim .mid').textContent;
    return m.includes('$12') && m.includes('$2') &&
           m.includes('Nothing it writes is carried out') })()
`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Run it').click()`)
await new Promise(r => setTimeout(r, 400))
check('confirming posts the run', await evalJS(`
  window.__blocked.some(b => b.startsWith('POST /planning_agent/run'))
`))

// Opening one: the body loads, and reading it is recorded as read — the one
// write that happens without being asked for.
await evalJS(`document.querySelector('#plansOut .planitem').click()`)
await new Promise(r => setTimeout(r, 500))
check('it opens in the wide modal', await evalJS(`!!document.querySelector('.mscrim .sheet.wide')`))
// mdBlocks renders every heading below h1 as an h4 — the h1 is the document's
// own title, which the modal already shows above it.
check('the body is rendered as Markdown', await evalJS(`
  !!document.querySelector('.mscrim .repdoc h4') &&
  document.querySelector('.mscrim .repdoc h4').textContent === 'Summary'
`))
// Context is the night's research trail, which the implementing agent reads
// rather than him, so it is left out of the render. History stays now — it is
// the previous revision's own line, and dropping it is what let a plan sent
// back read as indistinguishable from one written for the first time.
check('Context is dropped but History renders', await evalJS(`
  [...document.querySelectorAll('.mscrim .repdoc h4')].map(h => h.textContent).join(',')
    === 'Summary,Findings,Proposed plan,History'
`))
check('and Context leaks through neither the heading nor its body', await evalJS(`
  (t => !t.includes('ds-inventory') &&
        !t.includes('Still not his to read'))(document.querySelector('.mscrim .repdoc').textContent)
`))
check('History reads as what it is', await evalJS(`
  document.querySelector('.mscrim .repdoc').textContent.includes('revision 1')
`))
check('a dropped section takes its own subheadings with it', await evalJS(`
  !document.querySelector('.mscrim .repdoc').textContent.includes('A subheading inside it')
`))
check('the findings are a list', await evalJS(`
  !!document.querySelector('.mscrim .repdoc ul.repbul li')
`))
// Numbered steps were falling through to the paragraph branch and coming back
// as one run-on sentence, which every plan hits: the proposed steps and the
// open questions are both written numbered.
check('and the proposed steps are a numbered one', await evalJS(`
  !!document.querySelector('.mscrim .repdoc ol.repnum li') &&
  document.querySelector('.mscrim .repdoc ol.repnum li').textContent === 'Run ds-analyst.'
`))
check('and the frontmatter is not part of it', await evalJS(`
  !document.querySelector('.mscrim .repdoc').textContent.includes('title: t')
`))
check('the subhead names the agent that wrote it', await evalJS(`
  document.querySelector('.mscrim .msub').textContent.includes('planning-design-system')
`))

const marked = await evalJS(`window.__blocked.join(' | ')`)
check('opening marks it read', marked.includes('POST /stream/apply') && marked.includes('"seen":true'), marked.slice(0, 160))
// The contract addresses an item by its group and its name, so the night
// travels as `group` rather than under a key only this stream would know.
check('and names the night and the file', marked.includes('"group":"2026-09-05"') && marked.includes('"name":"add-caveat.md"'))

// The three moves, one per column a plan can be dragged into. Each one is a
// button in the modal and a drop zone on the board, and both go through the
// same confirm — a card landing somewhere and a button being pressed must not
// come to mean different things.

/* ---- the half that used to be the Execution board, 13 Sep 2026 ----
   Plans and Execution were two boards over one pipeline: accepting a plan
   minted a second document that landed in Execution's Backlog and waited to be
   dragged, a gate that filtered nothing. The two are one board now and the
   second document is gone, so the stage the implementing agent has reached
   rides on the plan card.

   Six columns rather than eight was the decision. Where a card sits is the
   instruction everywhere else in this app, and by that rule these would be
   columns — they are not, because the agent only runs from a session he is in,
   so there is never a card to watch move. All three therefore draw in Ready to
   be produced and differ only by their mark. */

check('every stage of production draws in Ready to be produced', await evalJS(`
  ['Accepted, not started','Being made right now','Reported back'].every(t =>
    [...document.querySelectorAll('#plansProduced .card .title')].some(e => e.textContent === t))
`), await evalJS(`
  [...document.querySelectorAll('#plansProduced .card .title')].map(e => e.textContent).join(' | ')`))

check('and none of them is a column of its own', await evalJS(`
  document.querySelectorAll('.lists.pview > .col').length
`) === 6, await evalJS(`document.querySelectorAll('.lists.pview > .col').length`))

const prodChip = title => evalJS(`(() => {
  const card = [...document.querySelectorAll('#plansProduced .card')].find(c =>
    c.querySelector('.title')?.textContent === ${JSON.stringify(title)});
  const chip = card && card.querySelector('.planprod');
  return chip ? chip.textContent + '/' + chip.className : 'missing';
})()`)

check('an accepted plan nothing has started says so',
  await prodChip('Accepted, not started') === 'not started/planprod planprod-none',
  await prodChip('Accepted, not started'))
check('one the agent has right now says that instead',
  await prodChip('Being made right now') === 'being made/planprod planprod-doing',
  await prodChip('Being made right now'))
check('and one that has reported back is the one waiting on him',
  await prodChip('Reported back') === 'reported back/planprod planprod-review',
  await prodChip('Reported back'))

/* A plan that has reported back and not been looked at is the other thing that
   has just arrived, so it takes the accent the same way an unread plan does.
   Before the fold this card was on another board and could not say so here. */
check('a report he has not read yet is marked like a new plan', (await evalJS(`
  (() => { const card = [...document.querySelectorAll('#plansProduced .card')].find(c =>
      c.querySelector('.title')?.textContent === 'Reported back');
    return card.getAttribute('style') || '' })()
`)).includes('--b1'), await evalJS(`
  (() => { const card = [...document.querySelectorAll('#plansProduced .card')].find(c =>
      c.querySelector('.title')?.textContent === 'Reported back');
    return card.getAttribute('style') || '' })()`))

/* The fourth way out of the modal. Before it, a plan he had read and did not
   want could only go round again for a second opinion or sit in Backlog reading
   as undecided. */
check('a plan he turned down sits in Done', await evalJS(`
  [...document.querySelectorAll('#plansDone .card .title')].some(e =>
    e.textContent === 'An idea turned down')
`), await evalJS(`
  [...document.querySelectorAll('#plansDone .card .title')].map(e => e.textContent).join(' | ')`))
check('and says so in its own word, not "finished" or "replaced"', await evalJS(`
  (() => { const c = [...document.querySelectorAll('#plansDone .card')].find(x =>
      x.querySelector('.title')?.textContent === 'An idea turned down');
    return c?.querySelector('.bucket')?.textContent })()
`) === 'declined', await evalJS(`
  (() => { const c = [...document.querySelectorAll('#plansDone .card')].find(x =>
      x.querySelector('.title')?.textContent === 'An idea turned down');
    return c?.querySelector('.bucket')?.textContent })()`))
check('the reason he gave is kept on the card', await evalJS(`
  (() => { const c = [...document.querySelectorAll('#plansDone .card')].find(x =>
      x.querySelector('.title')?.textContent === 'An idea turned down');
    return /Not worth the effort/.test(c?.textContent || '') })()
`))
check('a plan he has not accepted carries no production mark at all', await evalJS(`
  [...document.querySelectorAll('#plansOut .card')].every(c => !c.querySelector('.planprod'))
`))

// Ready to be produced. He accepts the plan as written, which is the end of the
// planning half: the picker leaves the task alone from here, and the card waits
// on the implementing agent. `accepted` rather than `done`, which is the
// whole reason the seventh state exists — approving a plan and the work it
// describes finishing are two facts, and `done` was holding both.
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Accept it').click()`)
await new Promise(r => setTimeout(r, 200))
check('Accept says the planning agent stops re-planning it', await evalJS(`
  document.querySelector('.mscrim .repdoc').textContent.includes('leaves the task alone')
`))
check('and that nothing runs yet', await evalJS(`
  document.querySelector('.mscrim .repdoc').textContent.includes('Nothing runs now')
`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Yes, accept it').click()`)
await new Promise(r => setTimeout(r, 400))
const after = await evalJS(`window.__blocked.join(' | ')`)
// No resolution with it: nothing has closed, so there is nothing to say about
// how. And the implementing agent owns it, because the next move on it is a run.
check('accepting moves it to accepted, not done',
  after.includes('"to":"accepted"') && after.includes('"owner":"implementing-agent"') &&
  !after.includes('"resolution":"actioned"'))
// Five, not two: the four the column already held plus the one just accepted.
check('and the row moves out of Waiting for review into Ready to be produced', await evalJS(`
  document.querySelectorAll('#plansProduced > .repitem').length === 5 &&
  !document.querySelector('#plansOut > .repitem.agreed')
`), await evalJS(`document.querySelectorAll('#plansProduced > .repitem').length + ' in the column'`))

// To do. The plan is wrong and tonight should write another, so the move has to
// carry a reason — the reason is the whole feature, since it is what the next
// night's agent is handed.
await evalJS(`document.querySelectorAll('#plansOut .planitem')[0].click()`)
await new Promise(r => setTimeout(r, 400))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Plan it again').click()`)
await new Promise(r => setTimeout(r, 200))
check('Plan it again asks for a reason first', await evalJS(`!!document.querySelector('#redoWhy')`))
const beforeEmpty = (await evalJS(`String(window.__blocked.length)`)) | 0
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Yes, plan it again').click()`)
await new Promise(r => setTimeout(r, 300))
check('and posts nothing when it is empty',
  ((await evalJS(`String(window.__blocked.length)`)) | 0) === beforeEmpty)

await evalJS(`document.querySelectorAll('#plansOut .planitem')[0].click()`)
await new Promise(r => setTimeout(r, 400))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Plan it again').click()`)
await new Promise(r => setTimeout(r, 200))
await evalJS(`(() => {
  const box = document.querySelector('#redoWhy');
  box.value = 'Wrong scope, this is the Foundations file only.';
  box.dispatchEvent(new Event('input'));
  return 1;
})()`)
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Yes, plan it again').click()`)
await new Promise(r => setTimeout(r, 400))
const sentBack = await evalJS(`window.__blocked.join(' | ')`)
// Going back is `ready` owned by the planning agent: an agent may pick it up, and
// owner says which. Not a state of its own — see 13-plans.js.
check('with a reason it hands the task back to the planning agent',
  sentBack.includes('"to":"ready"') && sentBack.includes('"owner":"planning-agent"'))
check('and carries the reason with it', sentBack.includes('Wrong scope'))
// It lands in the To do column, under the queue, rather than in a verdict
// column of its own — the task is already in the queue above it, and this is
// the written half saying what tonight is working from.
check('the plan is drawn in To do, under the queue', await evalJS(`
  !!document.querySelector('#queueOut .repitem.redo .planredo') &&
  document.querySelector('#queueOut .repitem.redo .planredo').textContent.includes('Wrong scope')
`))
// Sending it back emptied the review column — there were two plans and both
// have now been ruled on.
check('an emptied Waiting for review says so rather than going blank', await evalJS(`
  !!document.querySelector('#plansOut .empty') &&
  !document.querySelector('#plansOut .repitem')
`))

// Backlog. Not a verdict on the plan at all, so it does two things: parks the
// plan, and holds the task itself back — the hold list being the only thing the
// picker actually reads. Reached through parkPlan() directly, because the modal
// stopped offering it on 13 Sep 2026 when the four buttons became three: the
// only way in now is dragging a card onto the Backlog column, whose drop
// handler calls exactly this.
await evalJS(`parkPlan(planList.find(x => x.name === 'hr-agent.md'))`)
await new Promise(r => setTimeout(r, 200))
check('parking says the task is held too', await evalJS(`
  document.querySelector('.mscrim .repdoc').textContent.includes('held back from the queue')
`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Yes, leave it alone').click()`)
await new Promise(r => setTimeout(r, 500))
const parked = await evalJS(`window.__blocked.join(' | ')`)
check('parking a plan writes backlog', parked.includes('"to":"backlog"'))
check('and holds its task in the same gesture', await evalJS(`
  (() => { const hold = JSON.parse(window.__blocked.filter(b => b.startsWith('POST /queue/order')).pop()
    .split(' ').slice(2).join(' ')).hold;
    return hold.some(t => t.toLowerCase() === 'create an hr agent') })()
`))
check('the parked plan is drawn in Backlog', await evalJS(`
  !!document.querySelector('#backlogOut .repitem.parked')
`))

/* The two filters are independent: a pick in one must not reset the other.
   Both live in their column's own head, and both are wired by the one
   delegated listener on document in 13-plans.js — which is why this matters
   enough to check. The listener reads the wrapper's own `data-colfilter` to
   know which column a press came from, so the two panels never see each
   other's clicks despite sharing the attribute name.

   They are also the one thing on this view still found by selector rather than
   given a handler, because colFilterHTML() builds them as a string and
   PlansView hands them over through dangerouslySetInnerHTML. React never owns
   those buttons, so it cannot be given a handler for them.

   A step per paint rather than one closure doing all of it: renderPlansList()
   schedules a paint now rather than performing one, so a chip read in the same
   breath as the render that drew it is last paint's chip. */
const colChip = (body, key) => `(() => {
  const head = document.querySelector('${body}').closest('.col').querySelector('.colhead');
  const chip = [...head.querySelectorAll('[data-planfilter]')]
    .find(b => b.dataset.planfilter === '${key}');
  if (!chip) return 0;
  chip.click();
  return painted();
})()`

await evalJS(`(() => {
  planList = window.__plans.slice();
  reviewFilter = 'all'; doneFilter = 'all';
  renderPlansList();
  return painted();
})()`)
check('the review column offers the statuses it actually holds',
  !!(await evalJS(colChip('#plansOut', 'read'))))
check('each column keeps its own status filter', await evalJS(`
  reviewFilter === 'read' && doneFilter === 'all'
`), await evalJS(`reviewFilter + '/' + doneFilter`))
await evalJS(colChip('#plansOut', 'all'))
check('and All puts it back', await evalJS(`reviewFilter === 'all'`))
/* Ready to be produced carries no filter, because every card in it is the same
   thing: a plan he has accepted whose work has not finished. */
check('and Ready to be produced needs none', await evalJS(`
  !document.querySelector('#plansProduced').closest('.col').querySelector('.colfilter')
`))


// --- dragging a plan between the columns ------------------------------------
// The same three moves as the buttons above, reached the way the board itself
// is worked. Waiting for review is the one column that takes no drop: filling
// it is the agent's half of the arrangement.

await evalJS(`(() => {
  planList = [
    { name:'drag-me.md', night:'2026-09-05', url:'/x/drag-me.md', state:'review', owner:'me', seen:true,
      title:'A plan to drag', task:'A plan to drag', slug:'a-plan-to-drag',
      bucket:'DS', column:'To do', ai:'full', agent:'planning-design-system',
      date:'2026-09-05', summary:'Something to move about.' }
  ];
  reviewFilter = 'all'; doneFilter = 'all';
  renderPlansList();
  return painted();
})()`)
check('a plan row is draggable out of Waiting for review', await evalJS(`
  document.querySelector('#plansOut .planitem').getAttribute('draggable') === 'true'
`))
const dropOn = (target) => `(() => {
  const from = document.querySelector('#plansOut .planitem');
  const to = document.querySelector('${target}');
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles:true }));
  const ev = new DragEvent('dragover', { dataTransfer: dt, bubbles:true, cancelable:true });
  to.dispatchEvent(ev);
  const drop = new DragEvent('drop', { dataTransfer: dt, bubbles:true, cancelable:true });
  to.dispatchEvent(drop);
  return ev.defaultPrevented;
})()`
check('dropping it on Done asks to accept it', await evalJS(dropOn('#plansProduced')))
await new Promise(r => setTimeout(r, 300))
check('through the same confirm the button uses', await evalJS(`
  !!document.querySelector('.mscrim .repdoc') &&
  document.querySelector('.mscrim .repdoc').textContent.includes('leaves the task alone')
`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Cancel').click()`)
await new Promise(r => setTimeout(r, 200))

check('dropping it on To do asks for a reason', await evalJS(dropOn('#queueOut')))
await new Promise(r => setTimeout(r, 300))
check('the reason box is the same one', await evalJS(`!!document.querySelector('#redoWhy')`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Cancel').click()`)
await new Promise(r => setTimeout(r, 200))

check('dropping it on Backlog asks to park it', await evalJS(dropOn('#backlogOut')))
await new Promise(r => setTimeout(r, 300))
check('and says the task is held with it', await evalJS(`
  document.querySelector('.mscrim .repdoc').textContent.includes('held back from the queue')
`))
await evalJS(`[...document.querySelectorAll('.mscrim .foot .btn')].find(b => b.textContent === 'Cancel').click()`)
await new Promise(r => setTimeout(r, 200))

// The one column that refuses. A drag over it is never accepted, so nothing
// can be put into the agent's own column by hand.
check('Waiting for review takes no drop at all', await evalJS(`(() => {
  const from = document.querySelector('#plansOut .planitem');
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles:true }));
  const ev = new DragEvent('dragover', { dataTransfer: dt, bubbles:true, cancelable:true });
  document.querySelector('#plansOut').dispatchEvent(ev);
  from.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles:true }));
  return !ev.defaultPrevented;
})()`))

// And a task card has nothing to accept, so Done refuses it in words rather
// than swallowing the drop.
check('a task dropped on Done is refused', await evalJS(`(() => {
  const from = document.querySelector('#queueOut .qitem');
  const to = document.querySelector('#plansProduced');
  const dt = new DataTransfer();
  from.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles:true }));
  to.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles:true, cancelable:true }));
  to.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles:true, cancelable:true }));
  return !document.querySelector('#plansProduced .qitem');
})()`))
await new Promise(r => setTimeout(r, 200))

// --- a rejection the night has already answered ----------------------------
// Sending a plan back puts the task straight back in the queue, so the next
// run writes a replacement and the rejected card is history. It belongs with
// the record rather than in the redo group reading as stalled work. Driven off
// planList directly rather than a re-render, so nothing is re-fetched.
await evalJS(`(() => {
  planList = [
    // Superseded is written on the plan now rather than worked out by
    // comparing night names, which used to break the moment prune() created
    // plans/actioned/ — "actioned" sorts above every date.
    { name:'twice-old.md', night:'2026-09-03', url:'/x/twice-old.md', state:'done', owner:'me', seen:true, resolution:'superseded', feedback:'Wrong scope: the Foundations file, not the whole library.',
      title:'Planned twice', task:'Planned twice', slug:'planned-twice',
      bucket:'DS', column:'To do', ai:'full', agent:'planning-design-system',
      date:'2026-09-03', summary:'The first attempt.', redo_note:'Wrong scope.' },
    { name:'twice-new.md', night:'2026-09-06', url:'/x/twice-new.md', state:'review', owner:'me', seen:false,
      title:'Planned twice', task:'Planned twice', slug:'planned-twice',
      bucket:'DS', column:'To do', ai:'full', agent:'planning-design-system',
      date:'2026-09-06', summary:'The replacement.' },
    { name:'still-out.md', night:'2026-09-06', url:'/x/still-out.md', state:'ready', owner:'planning-agent', seen:true,
      title:'Sent back last night', task:'Sent back last night', slug:'sent-back',
      bucket:'People', column:'To do', ai:'full', agent:'planning-people',
      date:'2026-09-06', summary:'Waiting on a replacement.', redo_note:'Try again.' },
    { name:'rec.md', night:'2026-09-02', url:'/x/rec.md', state:'done', owner:'me', seen:true, resolution:'actioned',
      title:'A record', task:'A record', slug:'a-record', bucket:'DS', column:'Done',
      ai:'full', agent:'planning-design-system', date:'2026-09-02', summary:'Done.' }
  ];
  doneFilter = 'all'; reviewFilter = 'all';
  renderPlansList();
  return painted();
})()`)
// A plan sent back is in To do now, under the queue, rather than in a verdict
// column: it is work the planning agent is about to redo, which is what To do
// means on both boards.
check('a plan still out for another night sits in To do', await evalJS(`
  [...document.querySelectorAll('#queueOut .repitem.redo')]
    .map(r => r.querySelector('.title').textContent).join(',') === 'Sent back last night'
`))
check('and a replaced rejection is not there with it', await evalJS(`
  !document.querySelector('#plansProduced > .repitem.redo')
`))
/* Both closed cards are in Done, flat. They used to be folded together inside
   the old Done column, because that column was also holding the accepted ones
   and the fold was how it stopped burying them; Done now holds nothing but
   closed work, so there is nothing to bury and no fold. `A record` is a
   `done / actioned`, the old spelling of accepted, so it stays in Ready to be
   produced rather than reading as work that finished. */
check('the replaced rejection is filed in Done', await evalJS(`
  [...document.querySelectorAll('#plansDone > .repitem')]
    .map(r => r.querySelector('.title').textContent).sort().join(',') === 'Planned twice'
`))
check('and the plan accepted under the old spelling stays in Ready to be produced', await evalJS(`
  [...document.querySelectorAll('#plansProduced > .repitem')]
    .map(r => r.querySelector('.title').textContent).join(',') === 'A record' &&
  document.querySelector('#plansProduced .bucket').textContent === 'accepted'
`))
check('the reason he wrote is still readable on it', await evalJS(`
  document.querySelector('#plansDone .repitem.redo .planredo').textContent.includes('Wrong scope')
`))
/* The filter tells the two ways a plan closes apart, which is the distinction
   the old column could not draw: it called a replaced rejection "accepted",
   claiming he had acted on work he only ever sent back. */
check('Done says which kind of closed each one is', await evalJS(`
  [...document.querySelector('#plansDone').closest('.col')
    .querySelectorAll('.colhead [data-planfilter]')]
    .map(b => b.textContent).join(' | ') === 'All1 | replaced1'
`))
check('and the replacement itself is in Waiting for review', await evalJS(`
  [...document.querySelectorAll('#plansOut .repitem')]
    .map(r => r.querySelector('.title').textContent).join(',') === 'Planned twice'
`))

// An option with nothing behind it is not drawn at all rather than sitting
// there at zero, which is what colFilterHTML does for every empty one.
await evalJS(`(() => {
  planList = planList.filter(p => p.name !== 'twice-old.md');
  doneFilter = 'all';
  renderPlansList();
  return painted();
})()`)
check('with nothing replaced the option is not drawn at all', await evalJS(`
  ![...document.querySelector('#plansDone').closest('.col')
    .querySelectorAll('.colhead [data-planfilter]')]
    .some(b => b.dataset.planfilter === 'replaced') &&
  !document.querySelector('#plansDone > .repitem.redo')
`))

// --- the task's own priority, on the row and in the order -------------------
// A plan is written about exactly one task, so the impact and effort the board
// already holds for that task belong on the plan row too — and they are what
// the column is ordered by, rather than the night the plan happened to be
// written. Driven off planList directly, against demo.md's own tasks, so the
// scores below are the ones actually in the fixture on disk.
//
//   Decide whether to open the mid-weight design role   high / S  = 3
//   Close the Figma against code gap on buttons         high / M  = 1.5
//   Rewrite the design career framework                 med  / L  = 0.67
//   Update the design QA checklist for the new checkout  — unscored
//   (and one plan whose task is not on the board at all)
await evalJS(`(() => {
  const plan = (name, task, seen, night) => ({
    name: name + '.md', night, url:'/x/' + name + '.md',
    state:'review', owner:'me', seen,
    title: name, task, bucket:'DS', column:'To do', ai:'full',
    agent:'planning-design-system', date: night, summary:'.' });
  planList = [
    plan('cheap-and-big', 'Decide whether to open the mid-weight design role', false, '2026-09-01'),
    plan('gone', 'A task nobody kept', false, '2026-09-07'),
    plan('unscored', 'Update the design QA checklist for the new checkout flow', false, '2026-09-06'),
    plan('middling', 'Close the Figma against code gap on buttons', true, '2026-09-07'),
    plan('slow-burn', 'Rewrite the design career framework', false, '2026-09-07')
  ];
  doneFilter = 'all'; reviewFilter = 'all';
  renderPlansList();
  return painted();
})()`)
check('the highest priority task is at the top, not the newest night', await evalJS(`
  [...document.querySelectorAll('#plansOut .repitem')]
    .map(r => r.querySelector('.title').textContent).join(',') ===
  'cheap-and-big,middling,slow-burn,gone,unscored'
`), await evalJS(`[...document.querySelectorAll('#plansOut .title')].map(r => r.textContent).join(',')`))
/* The toggle this column's head grew alongside the port: priority is the
   default and the entry's asked-for alternative is what was written most
   recently, undated (there is none here) falling further back to the night
   folder. Toggled on, then off again, so every check after this one still
   reads the priority order it was written against. */
check('the column offers a sort toggle, off by default', await evalJS(`
  document.querySelector('#doneStatsOut').closest('.col').querySelector('.sortbtn:not(.on)')?.textContent === 'by priority'
`))
await evalJS(`(() => {
  document.querySelector('#doneStatsOut').closest('.col').querySelector('.sortbtn').click();
  return painted();
})()`)
check('clicking it sorts by when the plan was written, newest first', await evalJS(`
  [...document.querySelectorAll('#plansOut .repitem')]
    .map(r => r.querySelector('.title').textContent).join(',') ===
  'gone,middling,slow-burn,unscored,cheap-and-big'
`), await evalJS(`[...document.querySelectorAll('#plansOut .title')].map(r => r.textContent).join(',')`))
check('and the button now reads the other way round', await evalJS(`
  document.querySelector('#doneStatsOut').closest('.col').querySelector('.sortbtn.on')?.textContent === 'by night'
`))
await evalJS(`(() => {
  document.querySelector('#doneStatsOut').closest('.col').querySelector('.sortbtn').click();
  return painted();
})()`)
check('and clicking it again puts priority order back', await evalJS(`
  [...document.querySelectorAll('#plansOut .repitem')]
    .map(r => r.querySelector('.title').textContent).join(',') ===
  'cheap-and-big,middling,slow-burn,gone,unscored'
`))
check('the task\'s impact and effort are on the row', await evalJS(`
  (() => {
    const row = [...document.querySelectorAll('#plansOut .repitem')]
      .find(r => r.querySelector('.title').textContent === 'middling');
    const tags = [...row.querySelectorAll('.planscore .tag')];
    return tags.length === 2 && tags[0].title === 'high impact' && tags[1].textContent === 'M';
  })()
`))
check('and they are the board\'s own chips rather than a second kind', await evalJS(`
  !!document.querySelector('#plansOut .planscore .tag.impact-high')
`))
check('a task carrying neither score says so', await evalJS(`
  (() => {
    const row = [...document.querySelectorAll('#plansOut .repitem')]
      .find(r => r.querySelector('.title').textContent === 'unscored');
    return !!row.querySelector('.planscore .tag.needsscore');
  })()
`))
check('a plan whose task is gone from the board carries no score at all', await evalJS(`
  (() => {
    const row = [...document.querySelectorAll('#plansOut .repitem')]
      .find(r => r.querySelector('.title').textContent === 'gone');
    // No tag row at all rather than an empty one, and the meta row — where
    // it sits, and the link back — still there.
    return !row.querySelector('.planscore') && !row.querySelector('.meta') &&
           !!row.querySelector('.cardmeta');
  })()
`))
// The meta row reads scores, then which card, then where it sits — and the
// link is the card's own name rather than the words "open the card", so the
// row says what it opens without being clicked.
check('the link is named after the task it opens', await evalJS(`
  (() => {
    const row = [...document.querySelectorAll('#plansOut .repitem')]
      .find(r => r.querySelector('.title').textContent === 'middling');
    const b = row.querySelector('.plangoto');
    return b.textContent.trim() === 'Close the Figma against code gap on buttons \u2197';
  })()
`))
/* And it opens that task rather than only being named after it. The key used
   to be readable off the button as `data-plan-goto` and this check read it
   there; the button takes onGoto as a prop since 13 Sep 2026, so the only way
   left to ask what it opens is to press it. Which is the better question —
   the attribute was never what the board acted on, only where it looked.

   goToPlanTask is stood in for rather than let run: the real one switches to
   the board and opens the drawer, and every check below this one is about
   Plans. It is a top-level function declaration in a classic script, so it is
   a property of window and can be put back. */
check('and pressing it opens that task', await evalJS(`
  (() => {
    const real = window.goToPlanTask;
    let asked = null;
    window.goToPlanTask = k => { asked = k; };
    try {
      [...document.querySelectorAll('#plansOut .repitem')]
        .find(r => r.querySelector('.title').textContent === 'middling')
        .querySelector('.plangoto').click();
    } finally { window.goToPlanTask = real; }
    return asked === 'Close the Figma against code gap on buttons';
  })()
`))
/* And the press stops there: the whole card opens the plan, so a link that let
   its click carry on would open both at once. */
check('and it does not also open the plan behind it',
  !(await evalJS(`!!document.querySelector('.mscrim')`)))
/* The scores are the tag row, where the card sits and the link are the meta
   row below it — the component's own two rows, rather than the stacked block
   the plan card used to build for itself. */
check('the scores are the tag row, and where it sits is the meta row', await evalJS(`
  (() => {
    const row = [...document.querySelectorAll('#plansOut .repitem')]
      .find(r => r.querySelector('.title').textContent === 'middling');
    const tags = [...row.querySelector('.meta').children].map(n => n.className);
    const meta = [...row.querySelector('.cardmeta').children].map(n => n.className);
    return tags.join('|') === 'planscore' &&
           meta.join('|') === 'planwhere|plangoto' &&
           row.querySelector('.planwhere').textContent === 'DS · To do · 2026-09-07';
  })()
`))
check('a plan whose task is gone still links, under the name it stored', await evalJS(`
  (() => {
    const row = [...document.querySelectorAll('#plansOut .repitem')]
      .find(r => r.querySelector('.title').textContent === 'gone');
    return row.querySelector('.plangoto').textContent.trim() === 'A task nobody kept \u2197';
  })()
`))
/* Same ordering in Ready to be produced. Flat rather than grouped: `accepted`
   and the `ready / implementing-agent` that preceded it are the same fact about a
   plan, and the group that used to lift the second above the first existed
   only because the column was also holding finished work. It is not, so one
   ordering does the whole column. */
await evalJS(`(() => {
  planList.forEach(p => { p.state = 'accepted'; p.owner = 'implementing-agent'; p.resolution = ''; });
  Object.assign(planList.find(p => p.name === 'slow-burn.md'),
                { state:'ready', owner:'implementing-agent', resolution:'' });
  doneFilter = 'all';
  renderPlansList();
  return painted();
})()`)
check('Ready to be produced is ordered the same way', await evalJS(`
  [...document.querySelectorAll('#plansProduced > .repitem')]
    .map(r => r.querySelector('.title').textContent).join(',') ===
  'cheap-and-big,middling,slow-burn,gone,unscored'
`))
/* The old spelling and the new one draw as one column and read as one word.
   `slow-burn` is the `ready / implementing-agent` a plan agreed on 11 Sep 2026
   carries; everything else is `accepted`. */
check('and the old spelling of accepted reads as accepted beside it', await evalJS(`
  [...document.querySelectorAll('#plansProduced > .repitem')]
    .map(r => r.querySelector('.bucket').textContent)
    .join(',') === 'accepted,accepted,handed over,accepted,accepted'
`))

// The whole point of the second guard.
check('nothing reached todo.md', await evalJS(`
  !window.__blocked.some(b => b.includes('todo.md'))
`))
check('and every write was a plan status, a queue ordering or a run', await evalJS(`
  window.__blocked.every(b =>
    b.startsWith('POST /stream/apply') || b.startsWith('POST /queue/order') ||
    b.startsWith('POST /planning_agent/run'))
`), await evalJS(`String(window.__blocked.length) + ' writes'`))
// The whole queue column writes to exactly one place, and it is not the list.
check('the queue writes only its own ordering', await evalJS(`
  window.__blocked.filter(b => b.includes('order')).every(b => b.startsWith('POST /queue/order'))
`))

/* Last, because it opens a modal and shuts it again — anything after it that
   expected one already open would find none. */
check('the modal offers three moves and no more', await evalJS(`
  (() => { openPlanModal(window.__plans.find(x => x.name === 'add-caveat.md'));
    const labels = [...document.querySelectorAll('.mscrim .foot .btn')].map(b => b.textContent);
    closeModal();
    return labels.join('|') })()
`) === 'Accept it|Plan it again|Turn it down', await evalJS(`
  (() => { openPlanModal(window.__plans.find(x => x.name === 'add-caveat.md'));
    const labels = [...document.querySelectorAll('.mscrim .foot .btn')].map(b => b.textContent);
    closeModal();
    return labels.join('|') })()`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
