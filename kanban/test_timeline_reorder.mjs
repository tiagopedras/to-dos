#!/usr/bin/env node
/* Drag to reorder a timeline lane's rows, in headless Chrome — a row's label
 * now drags through BoardUI.bindReorder (Tenon v0.9.0) rather than the
 * timeline's own dragstart/dragover/drop. What matters most here is the trap
 * the handover names: a row's drop must never bubble to .tlscroll's own
 * drop, wired for the undated tray, or it overwrites the dragged task's
 * due date with whatever day sits under the pointer.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_timeline_reorder.mjs
 */
import { spawn } from 'node:child_process'

const PORT = Number(process.env.CDP_PORT) || 9460
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_timeline_reorder.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-timeline-reorder-profile'}`, '--window-size=1400,1000',
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
  check('the board loaded', await evalJS(`typeof timelineSection === 'function'`))

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
    load([
      '# To-do', '', '## 1. Tasks', '',
      '### To do', '',
      '- [ ] Alpha \`id:tr0001\` [bucket:: People] [impact:: high] [effort:: S] \`start:2026-09-10\` \`due:2026-09-12\`',
      '- [ ] Beta \`id:tr0002\` [bucket:: People] [impact:: med] [effort:: S] \`start:2026-09-14\` \`due:2026-09-16\`',
      '- [ ] Gamma \`id:tr0003\` [bucket:: People] [impact:: low] [effort:: M] \`start:2026-09-18\` \`due:2026-09-20\`',
      ''
    ].join('\\n'), 'demo.md', {});
    state.locked = false;
    state.view = 'timeline';
    renderView();
    return 'loaded';
  })()`)
  check('nothing has been written yet', await evalJS(`window.__blocked.length === 0`))

  const before = await evalJS(`(() => {
    const group = document.querySelector('.tllanegroup');
    return [...group.querySelectorAll(':scope > .tlrow[data-tlreorder] .tllabeltext')].map(e => e.textContent);
  })()`)
  check('three dated rows in one lane, board order to start', before.join(',') === 'Alpha,Beta,Gamma', before.join(','))
  check('grip is the row label', await evalJS(`!!document.querySelector('.tlrow[data-tlreorder] .tllabel')`))

  // Drag Alpha's label onto Gamma's lower half — expect Beta, Gamma, Alpha.
  await evalJS(`(async () => {
    const rows = [...document.querySelectorAll('.tllanegroup')[0].querySelectorAll(':scope > .tlrow[data-tlreorder]')];
    const grip = rows[0].querySelector('.tllabel');
    __fire('dragstart', grip);
    await new Promise(r => setTimeout(r, 20));
    __fire('dragover', rows[2], 'lower');
    __fire('drop', rows[2], 'lower');
    __fire('dragend', grip);
    return 'dropped';
  })()`)
  await wait(100)

  const after = await evalJS(`(() => {
    const group = document.querySelector('.tllanegroup');
    return [...group.querySelectorAll(':scope > .tlrow[data-tlreorder] .tllabeltext')].map(e => e.textContent);
  })()`)
  check('dragging Alpha onto Gamma moves it after Gamma', after.join(',') === 'Beta,Gamma,Alpha', after.join(','))

  const byTitle = await evalJS(`(() => {
    const items = allItems().filter(i => !i.sub);
    return Object.fromEntries(['Alpha','Beta','Gamma'].map(title => {
      const it = items.find(i => i.title === title);
      return [title, { due: it.task.due, tlrank: it.task.tlrank }];
    }));
  })()`)
  check('the trap: no row carries a due date rewritten by the tray’s own drop handler',
    byTitle.Alpha.due === '2026-09-12' && byTitle.Beta.due === '2026-09-16' && byTitle.Gamma.due === '2026-09-20',
    JSON.stringify(byTitle))

  check('the reorder never reached the file', await evalJS(`window.__blocked.length === 0`))

  check('tlrank was written 0.. in the new visual order — Beta 0, Gamma 1, Alpha 2',
    byTitle.Beta.tlrank === 0 && byTitle.Gamma.tlrank === 1 && byTitle.Alpha.tlrank === 2,
    JSON.stringify(byTitle))
} finally {
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(`\n${checks.length - failed} passed${failed ? `, ${failed} failed` : ''}\n`)
process.exit(failed ? 1 : 0)
