#!/usr/bin/env node
/* Archiving, which since 13 September 2026 happens without being asked.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_archiving.mjs
 *
 * This is the only thing in the board that rewrites `todo.md` on a timer rather
 * than in answer to something he did, so its guards are the whole of what keeps
 * it safe. Each of the four is checked here directly, because none of them is
 * visible on screen and three of them only matter in a moment that is hard to
 * reach by hand: a backup preview open, an edit mid-flight, a modal up.
 *
 * The order inside `performArchive()` is the other half. The copy reaches
 * `done-archive.md` before the tasks leave the document in memory, so a failure
 * between the two leaves the work in both files rather than in neither — and
 * the test for that is that a refused POST leaves the document untouched.
 *
 * Every non-GET is torn out of fetch as usual, so nothing here reaches disk:
 * what is asserted is what the board *tried* to send.
 */
import { spawn } from 'node:child_process'

const PORT = 9456
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-archiving-test-profile', '--window-size=1400,1000',
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
ws.onmessage = e => { const m = JSON.parse(e.data); if (pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
const send = (method, params) => new Promise(res => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
async function evalJS (expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400))
  return r.result?.result?.value
}

await new Promise(r => setTimeout(r, 2500))
check('the board loaded', await evalJS(`typeof autoArchiveTick === 'function'`))
check('and the doing half is its own function', await evalJS(`typeof performArchive === 'function'`))

// LOCK FIRST, then fixtures.
await evalJS(`(() => {
  state.locked = true; state.lockedLabel = 'test';
  const real = window.fetch;
  window.__blocked = [];
  window.__archiveFails = false;
  window.fetch = (u, o) => {
    const m = (o && o.method) || 'GET';
    if (m !== 'GET') {
      window.__blocked.push(m + ' ' + u);
      if (String(u).startsWith('/archive') && window.__archiveFails) {
        return Promise.resolve(new Response('{"error":"no"}', { status: 500 }));
      }
      return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
    }
    return real(u, o);
  };

  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  window.__iso = iso;

  /* One task either side of the line, plus one ticked and never dated. The
     board stamps an undated done task with today on load, so it can never be
     old enough — which is the point of the check below. */
  window.__fixture = [
    '# To-do', '', '## 1. People', '', '### Done', '',
    '- [x] Long finished \`id:ar0001\` \`done:' + iso(90) + '\`',
    '- [x] Just over the line \`id:ar0002\` \`done:' + iso(61) + '\`',
    '- [x] Just inside it \`id:ar0003\` \`done:' + iso(59) + '\`',
    '- [x] Ticked, never dated \`id:ar0004\`',
    '- [ ] Still open \`id:ar0005\`', ''
  ].join('\\n');
  load(window.__fixture, 'demo.md', {});
  state.locked = true;
})()`)
check('the tab is locked', await evalJS(`state.locked === true`))

/* ---- what counts as old enough ---- */

check('the line is sixty days, not thirty', await evalJS(`ARCHIVE_DAYS`) === 60,
  String(await evalJS(`ARCHIVE_DAYS`)))

check('only what is past the line is archivable', await evalJS(`
  archivable().map(a => a.task.title).sort().join('|')
`) === 'Just over the line|Long finished', await evalJS(`
  archivable().map(a => a.task.title).sort().join('|')`))

check('the oldest is offered first', await evalJS(`
  archivable()[0].task.title
`) === 'Long finished')

/* A task ticked with no date is stamped with today on load, so it is never
   old enough — an undated done task has no claim to make about its age. */
check('one ticked but never dated is left alone', await evalJS(`
  archivable().some(a => a.task.title === 'Ticked, never dated')
`) === false)

/* ---- the four guards, one at a time ----
   None of these is visible on screen, and three only matter in a moment that is
   hard to reach by hand. */

const tried = () => evalJS(`(async () => { window.__blocked = [];
  await autoArchiveTick(); return window.__blocked.length })()`)

check('a locked tab archives nothing', await tried() === 0)

await evalJS(`state.locked = false; state.dirty = true`)
check('and neither does one with an edit mid-flight', await tried() === 0)

await evalJS(`state.dirty = false; modalEl = document.createElement('div')`)
check('nor one with a modal open over it', await tried() === 0)

await evalJS(`modalEl = null; const d = state.doc; state.doc = null; window.__doc = d`)
check('nor one with no document at all', await tried() === 0)
await evalJS(`state.doc = window.__doc`)

/* ---- and with none of them in the way ---- */

await evalJS(`window.__blocked = []`)
await evalJS(`autoArchiveTick()`)
await new Promise(r => setTimeout(r, 600))
const sent = await evalJS(`window.__blocked.join(' | ')`)
check('with nothing in the way it archives on its own, no click', sent.includes('POST /archive'), sent)
check('and saves the shortened list after', sent.includes('PUT /data/todo.md'), sent)
check('forcing a backup as it does', sent.includes('backup=force'), sent)

check('the archived tasks are out of the document', await evalJS(`
  state.doc.buckets.flatMap(b => b.tiers.flatMap(t => t.tasks.map(x => x.title))).sort().join('|')
`) === 'Just inside it|Still open|Ticked, never dated', await evalJS(`
  state.doc.buckets.flatMap(b => b.tiers.flatMap(t => t.tasks.map(x => x.title))).sort().join('|')`))

check('and it says what it did', await evalJS(`
  /archived 2 finished tasks/.test($('#status').textContent)
`), await evalJS(`$('#status').textContent`))

check('a second pass finds nothing left to do', await tried() === 0)

/* ---- the order that matters ----
   The copy reaches disk before the tasks leave the document. A refused POST
   must therefore leave the document exactly as it was: the work ends up in both
   files rather than in neither. */

await evalJS(`(() => { load(window.__fixture, 'demo.md', {}); state.locked = false;
  state.dirty = false; window.__archiveFails = true; window.__blocked = []; })()`)
await evalJS(`autoArchiveTick()`)
await new Promise(r => setTimeout(r, 600))
check('a refused archive leaves every task where it was', await evalJS(`
  state.doc.buckets.flatMap(b => b.tiers.flatMap(t => t.tasks)).length
`) === 5, await evalJS(`
  state.doc.buckets.flatMap(b => b.tiers.flatMap(t => t.tasks)).length + ' tasks'`))
check('and never gets as far as saving the list', await evalJS(`
  window.__blocked.some(b => b.startsWith('PUT'))
`) === false, await evalJS(`window.__blocked.join(' | ')`))
check('and says nothing about having archived anything', await evalJS(`
  /archived/.test($('#status').textContent)
`) === false, await evalJS(`$('#status').textContent`))

/* ---- the button is still hidden, and that is deliberate ---- */
await evalJS(`window.__archiveFails = false; state.locked = true`)
check('the header chip stays hidden, since nothing needs pressing now',
  await evalJS(`ARCHIVE_CHIP_HIDDEN`) === true)

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
