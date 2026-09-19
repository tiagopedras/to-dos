#!/usr/bin/env node
/* The Matrix — every open task placed by its two scores.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_matrix.mjs
 *
 * Written 13 Sep 2026, alongside kanban/test_backups.mjs, because the view had
 * no coverage at all and the component port wants to go through it.
 *
 * Almost everything here is a placement rule rather than a piece of markup, and
 * the rules are the part worth pinning: which tasks get a dot, which cell it
 * lands in, which dots are drawn faded, and which of them the advice line
 * counts. Several of those read backwards if you only look at the screen — a
 * blocked task still gets its dot but is left out of "start there", a task in
 * Backlog is kept off the grid however it scores, and a sub-step never appears
 * at all. Each of those is one line in matrixTasks()/matrixSection() and each
 * would be easy to lose.
 *
 * It reads only. The view draws from the loaded document and fetches nothing,
 * so the fetch guard below is there to prove that rather than to stub anything.
 */
import { spawn } from 'node:child_process'

const PORT = 9454
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-matrix-test-profile', '--window-size=1400,1000',
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
check('the board loaded', await evalJS(`typeof matrixSection === 'function'`))

// LOCK FIRST, then the fixture. Nothing below can write anything.
await evalJS(`(() => {
  state.locked = true; state.lockedLabel = 'test';
  const real = window.fetch;
  window.__blocked = [];
  window.fetch = (u, o) => {
    const m = (o && o.method) || 'GET';
    if (m !== 'GET') { window.__blocked.push(m + ' ' + u); return Promise.resolve(new Response('{}', { status: 200 })) }
    return real(u, o);
  };

  /* One task per rule, so a failure names the rule rather than a cell.
     Every one carries an id, or the board mints them on load and marks the
     document dirty — see the note in test_backups.mjs. */
  load([
    '# To-do', '', '## 1. Tasks', '',
    '### To do', '',
    '- [ ] Cheap win \`id:aa0001\` [bucket:: People] [impact:: high] [effort:: S]',
    '- [ ] Second cheap win \`id:aa0002\` [bucket:: People] [impact:: high] [effort:: S] \`urgent\`',
    '- [ ] The big one \`id:aa0003\` [bucket:: People] [impact:: high] [effort:: L] \`headline:the one thing\`',
    '- [ ] Cut corner \`id:aa0004\` [bucket:: People] [impact:: low] [effort:: L]',
    '- [ ] Unscored, no effort \`id:aa0005\` [bucket:: People] [impact:: high]',
    '- [ ] Unscored, nothing at all \`id:aa0006\` [bucket:: People]',
    '- [ ] Finished already \`id:aa0007\` [bucket:: People] [impact:: high] [effort:: S]',
    '- [ ] Has a sub-step \`id:aa0008\` [bucket:: People] [impact:: med] [effort:: M]',
    '  - [ ] the step itself, which has no scores of its own',
    '- [ ] Blocked on the big one \`id:aa0009\` [bucket:: People] [impact:: high] [effort:: S] \`blocked-by:aa0003\`',
    '',
    '### Waiting for review', '',
    '- [ ] Out for review \`id:aa0010\` [bucket:: People] [impact:: high] [effort:: S]',
    '',
    '### Backlog', '',
    '- [ ] Parked on purpose \`id:aa0011\` [bucket:: People] [impact:: high] [effort:: S]',
    ''
  ].join('\\n'), 'demo.md', {});
  // Ticked after loading, so the line above stays readable as an open task.
  (() => { const all = state.doc.buckets[0].tiers.flatMap(t => t.tasks);
    const done = all.find(t => t.title === 'Finished already'); done.done = true; })();
  state.matrixHideWaiting = false;
  state.locked = true;
})()`)
check('the tab is locked', await evalJS(`state.locked === true`))

await evalJS(`state.view = 'matrix'; renderView()`)
await new Promise(r => setTimeout(r, 600))

/* ---- what gets a dot at all ---- */

const dotLabels = () => evalJS(
  `[...document.querySelectorAll('.mgrid .mdot')].map(d => d.getAttribute('aria-label').split(',')[0]).join('|')`)

check('the grid is drawn', await evalJS(`!!document.querySelector('.mgrid')`))
check('nine cells, three impacts by three efforts',
  await evalJS(`document.querySelectorAll('.mgrid .mcell').length`) === 9)

// A done task is not a decision to make, a sub-step has no scores of its own,
// and a Backlog task is parked on purpose — none of the three is on the grid.
check('a finished task gets no dot', (await dotLabels()).includes('Finished already') === false)
check('a sub-step gets no dot of its own',
  (await dotLabels()).includes('the step itself') === false)
check('and a task parked in Backlog is kept off the grid however it scores',
  (await dotLabels()).includes('Parked on purpose') === false, await dotLabels())

check('a task missing a score is off the grid too',
  (await dotLabels()).includes('Unscored') === false)

/* ---- and where it lands ---- */

const cellDots = (imp, eff) => evalJS(`(() => {
  const cells = [...document.querySelectorAll('.mgrid .mcell')];
  const imps = ['high','med','low'], effs = ['S','M','L'];
  const i = imps.indexOf('${imp}') * 3 + effs.indexOf('${eff}');
  return [...cells[i].querySelectorAll('.mdot')].map(d => d.getAttribute('aria-label').split(',')[0]).join('|');
})()`)

check('high/S holds the cheap wins, the urgent one and the blocked one',
  await cellDots('high', 'S') === 'Cheap win|Second cheap win|Blocked on the big one|Out for review',
  await cellDots('high', 'S'))
check('high/L holds the big one', await cellDots('high', 'L') === 'The big one')
check('low/L holds the cut corner', await cellDots('low', 'L') === 'Cut corner')
check('med/M holds the one with a sub-step, scored on the parent',
  await cellDots('med', 'M') === 'Has a sub-step')

check('the first cell is marked as the one to start in',
  await evalJS(`document.querySelector('.mgrid .mcell').classList.contains('first')`))
check('a cell with nothing in it says so', await evalJS(`
  document.querySelectorAll('.mgrid .mcell.empty').length
`) === 5, await evalJS(`document.querySelectorAll('.mgrid .mcell.empty').length`))
/* Row-major, so this reads high S/M/L, then med, then low: four in the cheap
   corner, the big one in high/L, the sub-step parent in med/M, the cut corner
   in low/L. */
check('each cell counts its own dots', await evalJS(`
  [...document.querySelectorAll('.mgrid .mcell .mcount')].map(c => c.textContent).join('')
`) === '401010001', await evalJS(`
  [...document.querySelectorAll('.mgrid .mcell .mcount')].map(c => c.textContent).join('')`))

/* ---- the marks on a dot ---- */

const dotClass = title => evalJS(`(() => {
  const d = [...document.querySelectorAll('.mdot')].find(d =>
    d.getAttribute('aria-label').startsWith(${JSON.stringify(title)}));
  return d ? d.className : 'missing';
})()`)

check('the one thing is marked', (await dotClass('The big one')).includes('hl'))
check('an urgent task is marked', (await dotClass('Second cheap win')).includes('urgent'))
check('a blocked task is faded', (await dotClass('Blocked on the big one')).includes('muted'))
check('so is one out for review', (await dotClass('Out for review')).includes('muted'))
check('and an ordinary one is neither', await dotClass('Cheap win') === 'mdot')

/* The bucket in the label is the `##` heading the task sits under, not its
   own [bucket::] tag — this fixture's heading is "Tasks" — and a task with no
   due date says so rather than leaving the clause out. */
check('a dot says where its task sits, that it is blocked, and that it has no date',
  await evalJS(`
    [...document.querySelectorAll('.mdot')].find(d =>
      d.getAttribute('aria-label').startsWith('Blocked on the big one')).getAttribute('aria-label')
  `) === 'Blocked on the big one, Tasks · To do, blocked, no date',
  await evalJS(`
    [...document.querySelectorAll('.mdot')].find(d =>
      d.getAttribute('aria-label').startsWith('Blocked on the big one')).getAttribute('aria-label')`))

/* ---- the read under the legend ----
   The one place the rules are easy to get backwards: a dot can be in the
   high/S cell and still not be somewhere to start, because it is waiting on
   something. Two of the four in that cell are. */

check('the advice counts only what could be picked up today', await evalJS(`
  /<strong>2<\\/strong> high impact and cheap/.test(document.querySelector('.mread')?.innerHTML || '')
`), await evalJS(`document.querySelector('.mread')?.textContent`))
check('it counts the heavy ones against the total', await evalJS(`
  /<strong>2<\\/strong> of 7 need a week or more/.test(document.querySelector('.mread')?.innerHTML || '')
`), await evalJS(`document.querySelector('.mread')?.textContent`))
check('it names the cut corner', await evalJS(`
  /<strong>1<\\/strong> in the cut corner/.test(document.querySelector('.mread')?.innerHTML || '')
`))
check('and says how many are waiting or blocked', await evalJS(`
  /<strong>2<\\/strong> waiting or blocked/.test(document.querySelector('.mread')?.innerHTML || '')
`), await evalJS(`document.querySelector('.mread')?.textContent`))

/* ---- the two trays ---- */

check('the unscored go in a tray of their own', await evalJS(`
  /2 not on the matrix/.test(document.querySelector('.mtray .mtrayhead')?.textContent || '')
`), await evalJS(`document.querySelector('.mtray .mtrayhead')?.textContent`))
check('and the parked ones in a tray that says why', await evalJS(`
  /1 in Backlog/.test(document.querySelector('.mtray.mhold .mtrayhead')?.textContent || '')
`), await evalJS(`document.querySelector('.mtray.mhold .mtrayhead')?.textContent`))
check('a tray dot is still a dot you can open', await evalJS(`
  !!document.querySelector('.mtray .mdot[data-open]')
`))

/* ---- hiding Waiting for review ---- */

await evalJS(`document.querySelector('[data-mxfilter]').click()`)
await new Promise(r => setTimeout(r, 500))
check('the filter takes the review column off the grid',
  (await dotLabels()).includes('Out for review') === false, await dotLabels())
check('and says how many it took off', await evalJS(`
  /1 hidden, sitting in Waiting for review/.test(document.querySelector('.mhidden')?.textContent || '')
`), await evalJS(`document.querySelector('.mhidden')?.textContent`))
check('the blocked one is still there, since it is not in review',
  (await dotLabels()).includes('Blocked on the big one'))
check('the checkbox stays ticked through the redraw', await evalJS(`
  document.querySelector('[data-mxfilter]').checked === true
`))

await evalJS(`document.querySelector('[data-mxfilter]').click()`)
await new Promise(r => setTimeout(r, 500))
check('unticking it brings them back', (await dotLabels()).includes('Out for review'))
check('and the note goes with them', await evalJS(`!document.querySelector('.mhidden')`))

/* ---- opening one ----

   A click on a dot pins its preview rather than opening the task, and the
   preview carries the control that opens it. One rule at every width: a touch
   screen never hovers, so before 15 Sep 2026 the preview simply never appeared
   there and the only way to find out what a dot was, was to open it. */

await evalJS(`closeDrawer(); state.openTask = null; unpinMatrixPreview()`)
await evalJS(`document.querySelector('.mgrid .mdot').click()`)
await new Promise(r => setTimeout(r, 400))
check('clicking a dot pins its preview rather than opening the task', await evalJS(`
  !!document.querySelector('.mpreview.on.pinned') && state.openTask === null
`), await evalJS(`String(state.openTask) + ' / ' + String(document.querySelector('.mpreview')?.className)`))
check('the pinned preview takes pointer events, where a hover preview does not', await evalJS(`
  getComputedStyle(document.querySelector('.mpreview')).pointerEvents
`) === 'auto')
check('and it carries the one control that opens the task', await evalJS(`
  !!document.querySelector('.mpreview .mopen')
`))
await evalJS(`document.querySelector('.mpreview .mopen').click()`)
await new Promise(r => setTimeout(r, 400))
check('pressing it opens the task and takes the preview down', await evalJS(`
  !!state.openTask && !document.querySelector('.mpreview.on')
`), await evalJS(`String(state.openTask) + ' / ' + String(document.querySelector('.mpreview')?.className)`))
await evalJS(`closeDrawer()`)

/* A pinned preview is a floating panel: a click anywhere else takes it down,
   and so does Escape. */
await evalJS(`state.openTask = null; document.querySelector('.mgrid .mdot').click()`)
await new Promise(r => setTimeout(r, 200))
await evalJS(`document.body.click()`)
check('a click outside unpins it', await evalJS(`!document.querySelector('.mpreview.on')`))
await evalJS(`document.querySelector('.mgrid .mdot').click()`)
await new Promise(r => setTimeout(r, 200))
await evalJS(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
check('and so does Escape', await evalJS(`!document.querySelector('.mpreview.on')`))

/* The hint says which gesture the screen actually does, swapped in CSS rather
   than decided once at render time. */
check('the hint offers both words and shows one of them', await evalJS(`
  (() => {
    const h = document.querySelector('.lists.mview .tenon-column__desc');
    return !!h.querySelector('.hoverword') && !!h.querySelector('.tapword') &&
      getComputedStyle(h.querySelector('.tapword')).display === 'none';
  })()
`))

/* ---- the point of the second guard ---- */

check('the matrix wrote nothing, which is all it should ever do',
  await evalJS(`window.__blocked.length === 0`), await evalJS(`window.__blocked.join(' | ')`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
