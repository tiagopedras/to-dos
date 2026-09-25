/**
 * Drives drag to reorder on a task's sub-steps in the drawer, in headless
 * Chrome. The drawer used to run its own dragstart/dragover/drop; it now
 * drags by the grip through `BoardUI.bindReorder` (Tenon v0.9.0), the same
 * as the bucket and column editors.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_drawer_subtask_reorder.mjs
 *
 * Same guard as the other browser suites: every non-GET is torn out of
 * `fetch`, so nothing here can reach todo.md.
 */

import { spawn } from 'node:child_process'

const PORT = Number(process.env.CDP_PORT) || 9453
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_drawer_subtask_reorder.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-drawer-subtask-reorder-profile'}`, '--window-size=1400,1000',
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

try {
  await wait(2500)
  check('the board loaded', await evalJS(`typeof openDrawer === 'function' && typeof moveSub === 'function'`))

  await evalJS(`(() => {
    const real = window.fetch;
    window.__blocked = [];
    window.fetch = (u, o) => {
      const m = (o && o.method) || 'GET';
      if (m !== 'GET') { window.__blocked.push(m + ' ' + u); return Promise.resolve(new Response('{}', { status: 200 })) }
      return real(u, o);
    };
    window.__dt = new DataTransfer();
    window.__fire = (type, el, where) => {
      const r = el.getBoundingClientRect();
      const y = where === 'lower' ? r.bottom - 2 : r.top + 2;
      return el.dispatchEvent(new DragEvent(type, {
        bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: y, dataTransfer: window.__dt
      }));
    };
    return 'ready';
  })()`)

  await evalJS(`(() => {
    load([
      '# To-do', '', '## 1. People', '',
      '### To do', '',
      '- [ ] Alpha \`id:sr0001\`',
      '  - [ ] first step',
      '  - [ ] second step',
      '  - [ ] third step',
      ''
    ].join('\\n'), 'demo.md', {});
    state.locked = false;
    renderView();
    return 'loaded';
  })()`)
  check('nothing has been written yet', await evalJS(`window.__blocked.length === 0`))

  const opened = await evalJS(`(() => {
    const alpha = allItems().find(i => !i.sub);
    openDrawer(alpha.id);
    return { rows: document.querySelectorAll('#f-subs .sub').length };
  })()`)
  check('the drawer opened with all three steps, each a grip row', opened.rows === 3, `${opened.rows} rows`)
  check('grip carries data-tenon-grip', await evalJS(`!!document.querySelector('#f-subs [data-tenon-grip]')`))
  check('a row is not draggable itself — only the grip starts a drag',
    await evalJS(`document.querySelector('#f-subs .sub').getAttribute('draggable') !== 'true'`))

  const before = await evalJS(`[...document.querySelectorAll('#f-subs .subtext')].map(s => s.textContent.trim())`)
  await evalJS(`(async () => {
    const rows = [...document.querySelectorAll('#f-subs .sub')];
    const grip = rows[0].querySelector('[data-tenon-grip]');
    __fire('dragstart', grip);
    await new Promise(r => setTimeout(r, 20));
    __fire('dragover', rows[1], 'lower');
    __fire('drop', rows[1], 'lower');
    __fire('dragend', grip);
    return 'dropped';
  })()`)
  await wait(100)
  const after = await evalJS(`[...document.querySelectorAll('#f-subs .subtext')].map(s => s.textContent.trim())`)
  check('dragging the first step onto the second moves it after that one',
    JSON.stringify(after) === JSON.stringify([before[1], before[0], before[2]]),
    `${after.join(' | ')}`)
  check('no drag reached the file', await evalJS(`window.__blocked.length === 0`))

  check('the old dragging/over-top/over-bottom classes are never applied',
    await evalJS(`document.querySelectorAll('.sub.dragging,.sub.over-top,.sub.over-bottom').length === 0`))
} finally {
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(`\n${checks.length - failed} passed${failed ? `, ${failed} failed` : ''}\n`)
process.exit(failed ? 1 : 0)
