/**
 * Drives drag to reorder in the bucket editor and the column editor, in
 * headless Chrome. Replaces the old ↑/↓ button checks — there were none in
 * a browser suite before this, the buttons were only ever unit-covered by
 * hand — now that both editors reorder by dragging a row's grip
 * (`BoardUI.bindReorder`, Tenon v0.9.0).
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_editors_reorder.mjs
 *
 * Same two guards as test_bucket_brief.mjs: every non-GET is torn out of
 * `fetch` and recorded instead of sent, so nothing here can reach todo.md.
 */

import { spawn } from 'node:child_process'

const PORT = 9452
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-editors-reorder-profile', '--window-size=1400,1000',
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
  check('the board loaded', await evalJS(`typeof openBucketEditor === 'function' && typeof openTierEditor === 'function'`))

  await evalJS(`(() => {
    const real = window.fetch;
    window.__blocked = [];
    window.fetch = (u, o) => {
      const m = (o && o.method) || 'GET';
      if (m !== 'GET') { window.__blocked.push(m + ' ' + u); return Promise.resolve(new Response('{}', { status: 200 })) }
      return real(u, o);
    };
    // Drop DataTransfer on a shared instance, the same as test_board.mjs's __drag.
    window.__dt = new DataTransfer();
    window.__fire = (type, el, where) => {
      const r = el.getBoundingClientRect();
      const y = where === 'lower' ? r.bottom - 3 : r.top + 3;
      return el.dispatchEvent(new DragEvent(type, {
        bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: y, dataTransfer: window.__dt
      }));
    };
    window.__names = sel => [...document.querySelectorAll(sel)].map(r => r.getAttribute('data-tenon-reorder')).join(',');
    return 'ready';
  })()`)

  await evalJS(`(async () => {
    const demo = await (await fetch('/kanban/demo.md')).text();
    load(demo, 'demo.md', {});
    return 'loaded';
  })()`)
  check('nothing has been written yet', await evalJS(`window.__blocked.length === 0`))

  // --- bucket editor: drag the first row onto the third ---------------------
  const bStart = await evalJS(`(() => {
    openBucketEditor();
    return { rows: document.querySelectorAll('.bkrow').length, names: __names('.bkrow') };
  })()`)
  check('bucket editor opened with a grip on every row',
    bStart.rows > 2, `${bStart.rows} rows`)
  check('grip carries data-tenon-grip', await evalJS(`!!document.querySelector('.bkrow [data-tenon-grip]')`))

  const bNamesBefore = await evalJS(`[...document.querySelectorAll('.bkrow input[data-name]')].map(i => i.value)`)
  await evalJS(`(async () => {
    const rows = [...document.querySelectorAll('.bkrow')];
    const grip = rows[0].querySelector('[data-tenon-grip]');
    __fire('dragstart', grip);
    await new Promise(r => setTimeout(r, 20));
    __fire('dragover', rows[2], 'lower');
    __fire('drop', rows[2], 'lower');
    __fire('dragend', grip);
    return 'dropped';
  })()`)
  await wait(100)
  const bNamesAfter = await evalJS(`[...document.querySelectorAll('.bkrow input[data-name]')].map(i => i.value)`)
  const bWant = [bNamesBefore[1], bNamesBefore[2], bNamesBefore[0], ...bNamesBefore.slice(3)]
  check('dragging the first bucket onto the third moves it after that one',
    JSON.stringify(bNamesAfter) === JSON.stringify(bWant),
    `${bNamesAfter.join(',')} vs wanted ${bWant.join(',')}`)
  check('the numbers renumbered', await evalJS(`document.querySelector('.bkrow .bknum').textContent === '1'`))
  check('no drag reached the file', await evalJS(`window.__blocked.length === 0`))
  await evalJS(`closeModal()`)

  // --- column editor: drag the first row onto the third ----------------------
  const tStart = await evalJS(`(() => {
    openTierEditor();
    return { rows: document.querySelectorAll('.bkrow').length };
  })()`)
  check('column editor opened with a grip on every row', tStart.rows > 2, `${tStart.rows} rows`)

  const tNamesBefore = await evalJS(`[...document.querySelectorAll('.bkrow input[data-tiername]')].map(i => i.value)`)
  await evalJS(`(async () => {
    const rows = [...document.querySelectorAll('.bkrow')];
    const grip = rows[0].querySelector('[data-tenon-grip]');
    __fire('dragstart', grip);
    await new Promise(r => setTimeout(r, 20));
    __fire('dragover', rows[2], 'lower');
    __fire('drop', rows[2], 'lower');
    __fire('dragend', grip);
    return 'dropped';
  })()`)
  await wait(100)
  const tNamesAfter = await evalJS(`[...document.querySelectorAll('.bkrow input[data-tiername]')].map(i => i.value)`)
  const tWant = [tNamesBefore[1], tNamesBefore[2], tNamesBefore[0], ...tNamesBefore.slice(3)]
  check('dragging the first column onto the third moves it after that one',
    JSON.stringify(tNamesAfter) === JSON.stringify(tWant),
    `${tNamesAfter.join(',')} vs wanted ${tWant.join(',')}`)
  check('no drag reached the file', await evalJS(`window.__blocked.length === 0`))

  // --- old ↑/↓ machinery is gone ----------------------------------------------
  check('no move-up/move-down buttons remain in either editor',
    await evalJS(`document.querySelectorAll('[data-up],[data-down],[data-tierback],[data-tierfwd]').length === 0`))
  check('moveBucket and moveTier no longer exist — replaced by *_To',
    await evalJS(`typeof moveBucket === 'undefined' && typeof moveTier === 'undefined' &&
      typeof moveBucketTo === 'function' && typeof moveTierTo === 'function'`))
} finally {
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(`\n${checks.length - failed} passed${failed ? `, ${failed} failed` : ''}\n`)
process.exit(failed ? 1 : 0)
