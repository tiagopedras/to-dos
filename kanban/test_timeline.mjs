#!/usr/bin/env node
/* Timeline — the one section `renderSections('timeline')` draws: the lanes,
 * and the tray of undated tasks under them.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_timeline.mjs
 *
 * Written 14 Sep 2026, alongside the port of the view's shell to
 * kanban/ui/SectionsView.tsx, and grown on 25 Sep 2026 when the body went the
 * same way: the lanes, bars, scale and tray are TimelineBody
 * (kanban/ui/TimelineBody.tsx), drawn from the data timelineSection() returns,
 * with every drag handed to it as a prop.
 *
 * The drag checks drive every drag the view has, end to end: a row reorder, a
 * click and a drag on a bar, a handle resize, a click on an empty track, and a
 * tray card dropped on the scale. They went in against the string-built lanes
 * first, and the React port passed them unchanged.
 */
import { spawn } from 'node:child_process'

const PORT = 9459
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-timeline-test-profile', '--window-size=1400,1000',
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

try {
await new Promise(r => setTimeout(r, 2500))
check('the board loaded', await evalJS(`typeof timelineSection === 'function'`))

// Not locked — a locked tab gets no drag handlers at all, which is exactly what this suite needs to see happen. The fetch
// guard below is what keeps that safe, the same exception test_notes.mjs
// makes for the one thing it actually has to unlock the tab to test.
await evalJS(`(() => {
  const real = window.fetch;
  window.__blocked = [];
  window.fetch = (u, o) => {
    const m = (o && o.method) || 'GET';
    if (m !== 'GET') { window.__blocked.push(m + ' ' + u); return Promise.resolve(new Response('{}', { status: 200 })) }
    return real(u, o);
  };

  load([
    '# To-do', '', '## 1. Tasks', '',
    '### To do', '',
    '- [ ] Dated one \`id:tl0001\` [bucket:: People] [impact:: high] [effort:: S] \`start:2026-09-10\` \`due:2026-09-12\`',
    '- [ ] Undated one \`id:tl0002\` [bucket:: People] [impact:: med] [effort:: S]',
    '- [ ] Dated two \`id:tl0003\` [bucket:: People] [impact:: low] [effort:: S] \`start:2026-09-15\` \`due:2026-09-17\`',
    ''
  ].join('\\n'), 'demo.md', {});
})()`)

/* No setTimeout before this read — mountFlushed() is what makes that safe. */
await evalJS(`state.view = 'timeline'; renderView()`)

/* ---- the shell ---- */

check('the Timeline column is drawn', await evalJS(`
  document.querySelector('.lists.tview .tenon-column h3')?.textContent
`) === 'Timeline')
check('a hint with two tags renders both as code', await evalJS(`
  [...document.querySelectorAll('.lists.tview .tenon-column__desc code')].map(c => c.textContent).join('|')
`) === 'start:|due:|due:|start:', await evalJS(`document.querySelector('.lists.tview .tenon-column__desc')?.innerHTML`))

check('the dated task draws a lane', await evalJS(`!!document.querySelector('.tlscroll .tlbody')`))
check('the undated one sits in the tray', (await evalJS(`
  document.querySelector('.tltraycards .tltraycard')?.textContent
`) || '').includes('Undated one'))

/* The legend sits under the scale and above the tray — four swatches, and the
   bucket one striped from the colours actually on screen rather than picking
   a lane's. */
check('the legend is drawn below the scale, above the tray', await evalJS(`(() => {
  const leg = document.querySelector('.tllegend');
  if (!leg) return false;
  const scroll = document.querySelector('.tlscroll'), tray = document.querySelector('.tltray');
  const after = scroll.compareDocumentPosition(leg) & Node.DOCUMENT_POSITION_FOLLOWING;
  const before = !tray || (leg.compareDocumentPosition(tray) & Node.DOCUMENT_POSITION_FOLLOWING);
  return !!after && !!before && leg.querySelectorAll('.tlswatch').length === 4;
})()`))
check('and its bucket swatch is striped from the lane colours', await evalJS(`
  document.querySelector('.tllegend .tlswatch').style.background.includes('linear-gradient')
`))

/* ---- the drag handlers are on the painted nodes ----
   Read off React's own props on the element, since a handler passed as a prop
   is never an on* property of the node. */

await evalJS(`window.__handler = (el, name) => {
  const k = el && Object.keys(el).find(k => k.startsWith('__reactProps'));
  return !!k && typeof el[k][name] === 'function';
}`)
check('the tray card is draggable, with its drag handler on it', await evalJS(`
  document.querySelector('.tltraycard').draggable && __handler(document.querySelector('.tltraycard'), 'onDragStart')
`))
check('and the scale itself takes the drop', await evalJS(`(() => {
  const s = document.querySelector('.tlscroll');
  return __handler(s, 'onDragOver') && __handler(s, 'onDrop');
})()`))

/* ---- switching away and back re-wires cleanly, not twice ---- */

await evalJS(`state.view = 'board'; renderView(); state.view = 'timeline'; renderView()`)
check('a second visit still finds a lane and a wired tray card, not a stale one', await evalJS(`(() => {
  return !!document.querySelector('.tlscroll .tlbody') &&
    __handler(document.querySelector('.tltraycard'), 'onDragStart');
})()`))

/* ---- the drags themselves ----
   Added 25 Sep 2026, before the lanes, bars and tray moved from one HTML
   string to React components, so that port had something to hold it to.
   The checks drive each drag the way a person would and read the result off
   the document, never off how a handler happens to be attached: a bar drag is
   real mouse input through CDP (setPointerCapture wants a live pointer), and
   the two HTML5 drags are dispatched DragEvents sharing one DataTransfer, the
   same way test_timeline_reorder.mjs drives them. */

/* The board renumbers ids on load, so a row is found by its title. */
const ID = await evalJS(`(() => {
  const items = allItems().filter(i => !i.sub);
  return Object.fromEntries([['one','Dated one'],['un','Undated one'],['two','Dated two']]
    .map(([k, t]) => [k, items.find(i => i.title === t).id]));
})()`)
const mouse = (type, x, y) => send('Input.dispatchMouseEvent', {
  type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1,
})
const taskDates = id => evalJS(`(() => { const t = locate('${id}').task; return { start: t.start || null, due: t.due || null, tlrank: t.tlrank ?? null } })()`)
const rowOrder = () => evalJS(`[...document.querySelector('.tllanegroup').querySelectorAll(':scope > .tlrow[data-tlreorder]')].map(e => e.dataset.tlreorder).join(',')`)
/* Where a day sits on screen, for one row's track: its left edge plus a
   quarter of a day in, clear of the half-day rounding in the drag's own sums. */
const dayX = (id, day) => evalJS(`(() => {
  const track = document.querySelector('.tlrow[data-tlreorder="${id}"] .tltrack');
  track.scrollIntoView({ block: 'center', inline: 'nearest' });
  document.querySelector('.tlscroll').scrollLeft = 0;
  const r = track.getBoundingClientRect();
  return { x: r.left + (${day} + 0.25) * TL_DAY_PX, y: r.top + r.height / 2 };
})()`)
const offsetOf = date => evalJS(`tlOffset(timelineScale(timelineTasks().dated), '${date}')`)
const dateAt = n => evalJS(`ymd(addDays(timelineScale(timelineTasks().dated).min, ${n}))`)

await evalJS(`(() => {
  window.__dt = new DataTransfer();
  window.__fire = (type, el, x, y) => el.dispatchEvent(new DragEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: window.__dt
  }));
})()`)

/* Row reorder: Dated one's label onto Dated two's lower half. */
check('two dated rows, board order to start', await rowOrder() === ID.one + ',' + ID.two, await rowOrder())
await evalJS(`(async () => {
  const rows = [...document.querySelector('.tllanegroup').querySelectorAll(':scope > .tlrow[data-tlreorder]')];
  const grip = rows[0].querySelector('.tllabel');
  const g = grip.getBoundingClientRect(), r = rows[1].getBoundingClientRect();
  __fire('dragstart', grip, g.left + 10, g.top + 5);
  await new Promise(res => setTimeout(res, 20));
  __fire('dragover', rows[1], r.left + 20, r.bottom - 2);
  __fire('drop', rows[1], r.left + 20, r.bottom - 2);
  __fire('dragend', grip, r.left + 20, r.bottom - 2);
})()`)
check('dragging a row label below the next row reorders the lane', await rowOrder() === ID.two + ',' + ID.one, await rowOrder())
{
  const one = await taskDates(ID.one), two = await taskDates(ID.two)
  check('and writes tlrank 0.. in the new order, leaving both dates alone',
    two.tlrank === 0 && one.tlrank === 1 && one.start === '2026-09-10' && one.due === '2026-09-12' &&
    two.start === '2026-09-15' && two.due === '2026-09-17', JSON.stringify({ one, two }))
}

/* A press on a bar that never moves is a click: it opens the drawer and
   writes nothing. */
{
  const s = await offsetOf('2026-09-10')
  const p = await dayX(ID.one, s + 1)
  await mouse('mousePressed', p.x, p.y)
  await mouse('mouseReleased', p.x, p.y)
  await new Promise(r => setTimeout(r, 50))
  const d = await taskDates(ID.one)
  check('a press on a bar without moving opens its drawer and moves nothing',
    await evalJS(`state.openTask`) === ID.one && d.start === '2026-09-10' && d.due === '2026-09-12',
    JSON.stringify({ open: await evalJS(`state.openTask`), d }))
  await evalJS(`closeDrawer()`)
}

/* A bar dragged three days right moves start and due together. */
{
  const s = await offsetOf('2026-09-10')
  const p = await dayX(ID.one, s + 1)
  check('the press lands on the bar itself', await evalJS(`document.elementFromPoint(${p.x}, ${p.y})?.dataset.tldrag`) === 'move')
  await mouse('mousePressed', p.x, p.y)
  await mouse('mouseMoved', p.x + 10, p.y)
  await mouse('mouseMoved', p.x + 3 * 28, p.y)
  check('the date popover follows a bar drag', await evalJS(`!!document.querySelector('.tlpopover.on')`))
  await mouse('mouseReleased', p.x + 3 * 28, p.y)
  await new Promise(r => setTimeout(r, 50))
  const d = await taskDates(ID.one)
  check('dragging a bar three days right moves both its dates three days',
    d.start === '2026-09-13' && d.due === '2026-09-15', JSON.stringify(d))
  check('and the bar is redrawn at its new place', await evalJS(`(() => {
    const bar = document.querySelector('.tlbar[data-tlrow="${ID.one}"]');
    return bar && parseInt(bar.style.left) === tlOffset(timelineScale(timelineTasks().dated), '2026-09-13') * TL_DAY_PX;
  })()`))
  check('and the release after a real drag does not open the drawer', await evalJS(`state.openTask`) == null, String(await evalJS(`state.openTask`)))
  check('and the popover is gone', await evalJS(`!document.querySelector('.tlpopover.on')`))
}

/* The right-hand handle moves only the due date. It sits inside the bar,
   whose own handler must not take the drag over. */
{
  const due = await offsetOf('2026-09-15')
  const h = await evalJS(`(() => {
    const el = document.querySelector('.tlbar[data-tlrow="${ID.one}"] .tlhandle-r');
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    document.querySelector('.tlscroll').scrollLeft = 0;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`)
  // A handle takes the day under the pointer, not a delta from where it was
  // picked up, so the release point is day (due + 2) itself.
  const to = await dayX(ID.one, due + 2)
  check('the press lands on the right handle', await evalJS(`document.elementFromPoint(${h.x}, ${h.y})?.classList.contains('tlhandle-r')`) === true)
  await mouse('mousePressed', h.x, h.y)
  await mouse('mouseMoved', h.x + 10, h.y)
  await mouse('mouseMoved', to.x, h.y)
  await mouse('mouseReleased', to.x, h.y)
  await new Promise(r => setTimeout(r, 50))
  const d = await taskDates(ID.one)
  check('dragging the right handle two days moves the due date alone',
    d.start === '2026-09-13' && d.due === '2026-09-17', JSON.stringify(d))
}

/* A click on a row's empty track, clear of its bar, sets the due date to the
   day clicked. */
{
  const p = await dayX(ID.two, await offsetOf('2026-09-22'))
  check('the click lands on the empty track', await evalJS(`document.elementFromPoint(${p.x}, ${p.y})?.classList.contains('tltrack')`) === true)
  await mouse('mousePressed', p.x, p.y)
  await mouse('mouseReleased', p.x, p.y)
  await new Promise(r => setTimeout(r, 50))
  const d = await taskDates(ID.two)
  check('clicking the empty track sets the due date to that day', d.start === '2026-09-15' && d.due === '2026-09-22', JSON.stringify(d))
  await evalJS(`closeDrawer()`)
}

/* Tray to scale: the undated card dropped on day 10 of the scale gets that
   day as its due date and leaves the tray. */
{
  const target = await dateAt(10)
  await evalJS(`(async () => {
    const card = document.querySelector('.tltraycard[data-tlid="${ID.un}"]');
    const body = document.querySelector('.tlbody');
    const c = card.getBoundingClientRect(), b = body.getBoundingClientRect();
    const x = b.left + state.tlLabelWidth + 10.5 * TL_DAY_PX, y = b.top + 40;
    __fire('dragstart', card, c.left + 5, c.top + 5);
    await new Promise(res => setTimeout(res, 20));
    __fire('dragover', body, x, y);
    window.__targetShown = !!document.querySelector('.tlbody .tltarget');
    __fire('drop', body, x, y);
    __fire('dragend', card, x, y);
  })()`)
  check('dragging an undated card over the scale shows the target line', await evalJS(`window.__targetShown`))
  const d = await taskDates(ID.un)
  check('dropping it on day 10 of the scale sets that day as its due date',
    d.due === target && d.start === null, JSON.stringify({ d, target }))
  check('and it leaves the tray for a lane', await evalJS(`
    !document.querySelector('.tltraycard[data-tlid="${ID.un}"]') &&
    !!document.querySelector('.tlrow[data-tlreorder="${ID.un}"] .tlmilestone')
  `))
  check('and the target line is cleared', await evalJS(`!document.querySelector('.tltarget')`))
}

/* ---- the point of the guard ---- */

check('the timeline wrote nothing, which is all it should ever do',
  await evalJS(`window.__blocked.length === 0`), await evalJS(`window.__blocked.join(' | ')`))

} finally {
  ws.close()
  chrome.kill()
}
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
