#!/usr/bin/env node
/* The Board view — the columns and the cards in them, as `BoardView` and
 * `TaskCard` (kanban/ui/) draw them from `renderBoard()`.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_board.mjs
 *
 * Written 19 Sep 2026, alongside the port of the view. Until then the board was
 * one string assigned to `#board`, and the only things that drew a card were
 * the suites that happened to open one; nothing here dragged a card, sorted a
 * column, or added a task. What it pins is what the port replaced by hand:
 *
 *   - every handler is a prop now, so a card opens, drags and drops through
 *     React's own events rather than through `onclick` assigned after a paint;
 *   - the drop line and the highlight under a dragged card are state inside
 *     `BoardView`, so it must appear where the pointer is and go when it leaves;
 *   - a task card drawn by React is the card `cardHTML()` draws as a string,
 *     element for element, once the one wrapper the title sits in is stepped
 *     over. That is the parity check, run over every task in demo.md.
 *
 * The tab is not locked, because the point is to drag and add. What keeps that
 * safe is the fetch guard: every non-GET is torn out of `fetch` and recorded,
 * so nothing here can reach `todo.md`, which the last assertion checks.
 */
import { spawn } from 'node:child_process'

const PORT = 9460
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-board-test-profile', '--window-size=1500,1000',
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
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500))
  return r.result?.result?.value
}
const wait = ms => new Promise(r => setTimeout(r, ms))

await wait(2500)
check('the board loaded', await evalJS(`typeof renderBoard === 'function' && typeof BoardUI.BoardView === 'function'`))

await evalJS(`(() => {
  const real = window.fetch;
  window.__blocked = [];
  window.fetch = (u, o) => {
    const m = (o && o.method) || 'GET';
    if (m !== 'GET') { window.__blocked.push(m + ' ' + u); return Promise.resolve(new Response('{}', { status: 200 })) }
    return real(u, o);
  };
  window.__drag = (type, el, y) => el.dispatchEvent(new DragEvent(type, {
    bubbles: true, cancelable: true, clientY: y, dataTransfer: window.__dt || (window.__dt = new DataTransfer())
  }));
  window.__titles = tier => [...document.querySelectorAll('#board .tenon-column[data-tier="' + tier + '"] .tenon-card__title')]
    .map(e => e.textContent).join(',');
  window.__order = tier => state.doc.buckets[0].tiers.find(t => t.name === tier).tasks.map(t => t.title).join(',');
  state.view = 'board';
  load([
    '# To-do', '', '## 1. People', '',
    '### To do', '',
    '- [ ] Alpha \`id:bd0001\` [impact:: high] [effort:: S]',
    '  - [x] first step',
    '  - [ ] second step',
    '- [ ] Beta \`id:bd0002\` [impact:: low] [effort:: L] [due:: 2026-09-12]',
    '- [ ] Gamma \`id:bd0003\` [impact:: med] [effort:: M]',
    '',
    '### Doing', '',
    '- [ ] Delta \`id:bd0004\` [impact:: high] [effort:: S]',
    ''
  ].join('\\n'), 'demo.md', {});
  state.locked = false;
  /* The file's own \`id:\` tokens are not honoured at load, so name the four
     tasks here rather than lean on the ones minted for them. */
  const ids = { Alpha: 'bd0001', Beta: 'bd0002', Gamma: 'bd0003', Delta: 'bd0004' };
  state.doc.buckets.forEach(b => b.tiers.forEach(t => t.tasks.forEach(k => { if (ids[k.title]) k.id = ids[k.title]; })));
  renderView();
})()`)

/* ---- the columns ---- */

const tiers = await evalJS(`[...document.querySelector('#board').children].map(c => c.dataset.tier).join('|')`)
check('the board draws its columns straight into #board, Done last', /(^|\|)To do\|/.test(tiers) && tiers.endsWith('|Done'), tiers)
check('a column says how many cards it holds', await evalJS(`
  document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-column__count').textContent
`) === '3')
check('its cards are in the file order', await evalJS(`__titles('To do')`) === 'Alpha,Beta,Gamma')
check('an empty column says so', await evalJS(`
  !!document.querySelector('#board .tenon-column[data-tier="Handed to AI"] .tenon-column-empty')
`))
check('each column is a drop target and says which tier it is', await evalJS(`
  [...document.querySelectorAll('#board > .tenon-column')].every(c =>
    c.dataset.tier && c.querySelector('.tenon-column__body.drop'))
`))

/* ---- what a card says ---- */

check('a card carries its own id and is reachable from the keyboard', await evalJS(`(() => {
  const c = document.querySelector('#board .tenon-card[data-id="bd0001"]');
  return c.getAttribute('tabindex') === '0' && c.getAttribute('role') === 'button' &&
         c.getAttribute('draggable') === 'true';
})()`))
check('impact and effort are chips', await evalJS(`(() => {
  const c = document.querySelector('#board .tenon-card[data-id="bd0001"]');
  return !!c.querySelector('.tag.impact-high') && [...c.querySelectorAll('.tag')].some(t => t.textContent === 'S');
})()`))
check('a due date is a chip in its own corner', await evalJS(`
  !!document.querySelector('#board .tenon-card[data-id="bd0002"] .meta-when .tag.due')
`))
check('steps show as a progress line', await evalJS(`
  document.querySelector('#board .tenon-card[data-id="bd0001"] .prog span').textContent
`) === '1/2 steps')

/* ---- opening a card ---- */

await evalJS(`document.querySelector('#board .tenon-card[data-id="bd0002"]').click()`)
check('a click opens the drawer on that task', await evalJS(`state.openTask === 'bd0002'`))
await evalJS(`closeDrawer(); document.querySelector('#board .tenon-card[data-id="bd0003"]')
  .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))`)
check('Enter opens it too', await evalJS(`state.openTask === 'bd0003'`))
await evalJS(`closeDrawer()`)

/* ---- dragging ---- */

await evalJS(`__drag('dragstart', document.querySelector('#board .tenon-card[data-id="bd0003"]'), 0)`)
await wait(150)
check('a dragged card is remembered by the board and faded', await evalJS(`
  dragId === 'bd0003' && document.querySelector('#board .tenon-card[data-id="bd0003"]').classList.contains('dragging')
`))
await evalJS(`(() => {
  const first = document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-card[data-id="bd0001"]');
  __drag('dragover', first, first.getBoundingClientRect().top + 2);
})()`)
await wait(100)
check('the column lights up under the pointer', await evalJS(`
  document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-column__body').classList.contains('over')
`))
check('and the drop line sits above the first card', await evalJS(`
  document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-column__body').firstElementChild.className
`) === 'dropline')
await evalJS(`(() => {
  const first = document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-card[data-id="bd0001"]');
  __drag('dragover', first, first.getBoundingClientRect().bottom - 2);
})()`)
await wait(100)
check('moving down moves the line under it', await evalJS(`
  document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-card[data-id="bd0001"]').nextElementSibling.className
`) === 'dropline')
check('there is only ever one line', await evalJS(`document.querySelectorAll('#board .dropline').length`) === 1)
await evalJS(`__drag('dragleave', document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-column__body'), 0)`)
await wait(100)
check('leaving the column clears the line and the highlight', await evalJS(`
  !document.querySelector('#board .dropline') && !document.querySelector('#board .drop.over')
`))

/* Dropped at the top of To do: Gamma goes first. */
await evalJS(`(() => {
  const first = document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-card[data-id="bd0001"]');
  const y = first.getBoundingClientRect().top + 2;
  __drag('dragover', first, y);
  __drag('drop', first, y);
  __drag('dragend', document.querySelector('#board .tenon-card[data-id="bd0003"]'), 0);
})()`)
await wait(150)
check('a drop reorders the tasks in the file', await evalJS(`__order('To do')`) === 'Gamma,Alpha,Beta', await evalJS(`__order('To do')`))
check('and the board shows the new order', await evalJS(`__titles('To do')`) === 'Gamma,Alpha,Beta')
check('the line and the fade are gone afterwards', await evalJS(`
  !document.querySelector('#board .dropline') && !document.querySelector('#board .tenon-card.dragging') && dragId === null
`))
check('and the tab knows it has something to save', await evalJS(`state.dirty === true`))

/* Into another column. */
await evalJS(`(() => {
  __drag('dragstart', document.querySelector('#board .tenon-card[data-id="bd0004"]'), 0);
  const col = document.querySelector('#board .tenon-column[data-tier="To do"]');
  const last = col.querySelector('.tenon-card[data-id="bd0002"]');
  const y = last.getBoundingClientRect().bottom - 2;
  __drag('dragover', last, y);
  __drag('drop', last, y);
  __drag('dragend', document.querySelector('#board .tenon-card[data-id="bd0004"]'), 0);
})()`)
await wait(150)
check('a card dropped in another column moves there', await evalJS(`__order('To do')`) === 'Gamma,Alpha,Beta,Delta', await evalJS(`__order('To do')`))
check('and it left the column it came from', await evalJS(`__titles('Doing')`) === '')
check('both counts follow', await evalJS(`
  ['To do', 'Doing'].map(n =>
    document.querySelector('#board .tenon-column[data-tier="' + n + '"] .tenon-column__count').textContent).join('/')
`) === '4/0')

/* Done is the tick, not a section. */
await evalJS(`(() => {
  __drag('dragstart', document.querySelector('#board .tenon-card[data-id="bd0002"]'), 0);
  const done = document.querySelector('#board .tenon-column[data-tier="Done"]');
  __drag('dragover', done.querySelector('.tenon-column__body'), 0);
  __drag('drop', done.querySelector('.tenon-column__body'), 0);
  __drag('dragend', document.querySelector('#board .tenon-card[data-id="bd0002"]'), 0);
})()`)
await wait(150)
check('a card dropped on Done is ticked', await evalJS(`
  !!document.querySelector('#board .tenon-column[data-tier="Done"] .tenon-card.done[data-id="bd0002"]')
`))

/* ---- sorting ---- */

await evalJS(`document.querySelector('#board .tenon-column[data-tier="To do"] .sortbtn').click()`)
await wait(100)
check('the sort button says it is on', await evalJS(`
  document.querySelector('#board .tenon-column[data-tier="To do"] .sortbtn').textContent
`) === 'by priority')
check('the column is marked sorted', await evalJS(`
  document.querySelector('#board .tenon-column[data-tier="To do"]').classList.contains('sorted')
`))
check('and orders by impact against effort', await evalJS(`__titles('To do')`) === 'Alpha,Delta,Gamma', await evalJS(`__titles('To do')`))
await evalJS(`(() => {
  __drag('dragstart', document.querySelector('#board .tenon-card[data-id="bd0003"]'), 0);
  const first = document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-card');
  __drag('dragover', first, first.getBoundingClientRect().top + 2);
})()`)
await wait(100)
check('a sorted column takes drops but draws no line', await evalJS(`
  document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-column__body').classList.contains('over') &&
  !document.querySelector('#board .dropline')
`))
await evalJS(`__drag('dragend', document.querySelector('#board .tenon-card[data-id="bd0003"]'), 0);
  document.querySelector('#board .tenon-column[data-tier="To do"] .sortbtn').click()`)
await wait(100)

/* ---- adding, and the pencil ---- */

await evalJS(`document.querySelector('#board .tenon-column[data-tier="To do"] .addbtn').click()`)
await wait(150)
check('+ Add task puts a new card in that column', await evalJS(`__titles('To do')`).then(t => t.includes('New task')))
await evalJS(`closeDrawer()`)
check('the head carries a pencil for the tier editor', await evalJS(`
  !!document.querySelector('#board .tenon-column[data-tier="To do"] .coledit[data-editcol="To do"]')
`))
check('Done and Handed to AI carry neither the pencil nor the add button', await evalJS(`
  ['Done', 'Handed to AI'].every(n => {
    const c = document.querySelector('#board .tenon-column[data-tier="' + n + '"]');
    return c && !c.querySelector('.coledit') && !c.querySelector('.addbtn');
  })
`))
check('Handed to AI is the agent column: dashed, running, geared', await evalJS(`
  (() => { const c = document.querySelector('#board .tenon-column[data-tier="Handed to AI"]');
    return c.classList.contains('tenon-column--dashed') && c.classList.contains('tenon-column--running') &&
           !!c.querySelector('.colgear'); })()
`))

/* ---- locked ---- */

await evalJS(`state.locked = true; renderBoard()`)
check('a locked board draws no add button and no pencil', await evalJS(`
  !document.querySelector('#board .addbtn') && !document.querySelector('#board .coledit')
`))
check('its cards are not draggable', await evalJS(`
  [...document.querySelectorAll('#board .tenon-card')].every(c => c.getAttribute('draggable') !== 'true')
`))
check('and a column does not take a drop', await evalJS(`(() => {
  const body = document.querySelector('#board .tenon-column[data-tier="To do"] .tenon-column__body');
  const e = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
  body.dispatchEvent(e);
  return e.defaultPrevented === false && !body.classList.contains('over');
})()`))
await evalJS(`state.locked = false; renderBoard()`)

/* ---- parity with cardHTML() ---- */

/* The string builder and the component draw one model, and this is what says so.
   Every task in demo.md, on the board, against cardHTML() for the same task,
   with attributes sorted, inline style spacing ignored, and the one span the
   title sits in stepped over. */
await evalJS(`(async () => {
  const md = await (await fetch('/kanban/demo.md')).text();
  load(md, 'demo.md', {});
  state.locked = false;
  state.bucketFilter = new Set(state.doc.buckets.map(b => b.name));
  state.view = 'board';
  renderView();
})()`)
await wait(200)
const parity = await evalJS(`(() => {
  const canon = el => {
    if (el.nodeType === 3) return el.textContent;
    if (el.tagName === 'SPAN' && el.parentNode.classList && el.parentNode.classList.contains('tenon-card__title') &&
        el.parentNode.children.length === 1 && !el.className) {
      return [...el.childNodes].map(canon).join('');
    }
    const attrs = [...el.attributes].map(a => a.name + '="' +
      (a.name === 'style' ? a.value.replace(/[\\s;]/g, '') : a.value) + '"').sort().join(' ');
    return '<' + el.tagName.toLowerCase() + ' ' + attrs + '>' + [...el.childNodes].map(canon).join('') + '</>';
  };
  const many = shownBuckets().length > 1;
  const bad = [];
  let n = 0;
  document.querySelectorAll('#board .tenon-card').forEach(card => {
    const loc = locate(card.dataset.id);
    if (!loc) return;
    n++;
    const tier = card.closest('.tenon-column').dataset.tier;
    const color = card.style.getPropertyValue('--tenon-card-accent');
    const label = many ? loc.bucket.name : '';
    const holder = document.createElement('div');
    holder.innerHTML = cardHTML(loc.task, color, label, { muted: tier === WAIT_COL, tier });
    const want = canon(holder.firstElementChild);
    const got = canon(card);
    if (want !== got) bad.push(loc.task.title + '\\n  want ' + want.slice(0, 400) + '\\n  got  ' + got.slice(0, 400));
  });
  return { n, bad };
})()`)
check(`every task on the demo board is the card cardHTML() draws (${parity.n} of them)`,
  parity.n > 10 && parity.bad.length === 0, parity.bad.slice(0, 2).join('\n'))

/* ---- the point of the guard ---- */

/* The tab is unlocked here, so the board tries to save after every move. The
   guard tore each attempt out of fetch, and this is the check that nothing
   else was attempted. */
check('no write was attempted but the board saving its own file', await evalJS(`
  window.__blocked.every(b => /^(PUT|HEAD) \\/data\\/todo\\.md/.test(b))
`), await evalJS(`window.__blocked.join(' | ')`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
