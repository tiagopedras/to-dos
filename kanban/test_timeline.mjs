#!/usr/bin/env node
/* Timeline — the one section `renderSections('timeline')` draws: the lanes,
 * and the tray of undated tasks under them.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_timeline.mjs
 *
 * Written 14 Sep 2026, alongside the port of the view's shell to
 * kanban/ui/SectionsView.tsx. The lanes and the scale themselves —
 * timelineTasks(), timelineScale(), timelineLaneHTML() — are untouched by
 * that port; what this suite pins is the shell, and the one real risk the
 * port carries: wireTimelineDrag() arms a tray card's ondragstart and the
 * scale's own ondragover/ondrop by querying the DOM right after the mount
 * call returns (see kanban/js/18-timeline.js, at the end of renderSections()).
 * mountFlushed() (kanban/ui/index.ts) is what makes that query find real
 * elements rather than racing React's own schedule, so the checks below read
 * straight after renderView() with no setTimeout to paper over a race if one
 * existed.
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

await new Promise(r => setTimeout(r, 2500))
check('the board loaded', await evalJS(`typeof timelineSection === 'function'`))

// Not locked — wireTimelineDrag() itself refuses to wire anything against a
// locked tab, which is exactly what this suite needs to see happen. The fetch
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
    ''
  ].join('\\n'), 'demo.md', {});
})()`)

/* No setTimeout before this read — mountFlushed() is what makes that safe. */
await evalJS(`state.view = 'timeline'; renderView()`)

/* ---- the shell ---- */

check('the Timeline column is drawn', await evalJS(`
  document.querySelector('.lists.tview .col h3')?.textContent
`) === 'Timeline')
check('a hint with two tags renders both as code', await evalJS(`
  [...document.querySelectorAll('.lists.tview .colhead-desc code')].map(c => c.textContent).join('|')
`) === 'start:|due:|due:|start:', await evalJS(`document.querySelector('.lists.tview .colhead-desc')?.innerHTML`))

check('the dated task draws a lane', await evalJS(`!!document.querySelector('.tlscroll .tlbody')`))
check('the undated one sits in the tray', (await evalJS(`
  document.querySelector('.tltraycards .tltraycard')?.textContent
`) || '').includes('Undated one'))

/* ---- wireTimelineDrag() ran against the real, painted tray card ---- */

check('the tray card is armed to drag, wired the moment the mount call returned', await evalJS(`
  typeof document.querySelector('.tltraycard').ondragstart === 'function'
`))
check('and the scale itself takes the drop', await evalJS(`(() => {
  const s = document.querySelector('.tlscroll');
  return typeof s.ondragover === 'function' && typeof s.ondrop === 'function';
})()`))

/* ---- switching away and back re-wires cleanly, not twice ---- */

await evalJS(`state.view = 'board'; renderView(); state.view = 'timeline'; renderView()`)
check('a second visit still finds a lane and a wired tray card, not a stale one', await evalJS(`(() => {
  return !!document.querySelector('.tlscroll .tlbody') &&
    typeof document.querySelector('.tltraycard').ondragstart === 'function';
})()`))

/* ---- the point of the guard ---- */

check('the timeline wrote nothing, which is all it should ever do',
  await evalJS(`window.__blocked.length === 0`), await evalJS(`window.__blocked.join(' | ')`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
