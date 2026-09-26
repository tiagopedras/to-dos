/**
 * Drives the Agents tab in headless Chrome.
 *
 *   scripts/test-board.sh test_agents.mjs
 *
 * The view is PACKAGES/agents-engine/react, mounted by kanban/js/27-agents.js.
 * Same two guards as test_projects.mjs: the tab is locked before any fixture
 * is loaded, and every non-GET is recorded instead of sent, so switching a
 * target or setting an hour here reaches no agent. /agents-api/state.json is
 * stubbed for the drawing checks; the last check asks the real route on the
 * test server, which runs the two agents' read-only `state` commands.
 *
 * SHOT=/path.png saves a screenshot of the list view.
 */

import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const PORT = Number(process.env.CDP_PORT) || 9451
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_agents.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-agents-test-profile'}`, '--window-size=1400,1000',
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
const wait = ms => new Promise(r => setTimeout(r, ms))

await wait(2500)
check('the board loaded', await evalJS(`typeof renderAgentsView === 'function' && typeof BoardUI.AgentsApp === 'function'`))

// LOCK FIRST, then fixtures. Nothing below can write anything.
await evalJS(`(() => {
  state.locked = true; state.lockedLabel = 'test';
  const real = window.fetch;
  window.__real = real;
  window.__blocked = [];
  window.__stateReads = 0;
  const target = (id, name, on, hours) => ({ id, name, on, hours, counts: [{ n: 2, l: 'queued', kind: 'good' }] });
  window.__agents = {
    hour: 10, now: new Date().toISOString(),
    agents: [
      { id: 'plan-agent', key: 'plan-agent', name: 'Plan agent', blurb: 'Writes plans overnight.',
        targets: [target('twinkl', 'twinkl', true, [1, 2, 3]), target('personal', 'personal', false, [])] },
      { id: 'implement-agent', key: 'implement-agent', name: 'Implement agent', blurb: 'Carries out agreed plans.',
        targets: [target('twinkl', 'twinkl', false, [4])] },
    ],
  };
  const json = (body, status) => Promise.resolve(new Response(JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } }));
  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') {
      window.__blocked.push(method + ' ' + url + ' ' + ((opts && opts.body) || ''));
      return json({ ok: true }, 200);
    }
    if (String(url).startsWith('/agents-api/state.json')) { window.__stateReads++; return json(window.__agents, 200); }
    return real(url, opts);
  };
  load(['# To-do', '', '## 1. Tasks', '', '### To do', '', '- [ ] One task [bucket:: Strategic]', ''].join('\\n'), 'demo.md', {});
  state.locked = true;
  try { localStorage.setItem('board-agents.view', 'list') } catch {}
})()`)
check('the tab is locked', await evalJS(`state.locked === true`))

/* ---- the tab ---- */
check('Agents is one of the view tabs', await evalJS(`viewDefs().some(d => d.id === 'agents')`))
await evalJS(`state.view = 'agents'; renderView()`)
await wait(1200)
check('it mounts the shared component', await evalJS(`!!document.querySelector('#lists #agentsRoot .agents-ui.agents-root.embedded')`))
check('titled Agents', await evalJS(`document.querySelector('#agentsRoot h1')?.textContent === 'Agents'`))
check('it shows both agents', await evalJS(`(() => { const t = document.querySelector('#agentsRoot').textContent; return t.includes('Plan agent') && t.includes('Implement agent') })()`))
check('it read /agents-api, not the dashboard routes', await evalJS(`window.__stateReads > 0`))
check('the list view draws an hour track per target', await evalJS(`document.querySelectorAll('#agentsRoot .trow .hours .hr').length === 72`))
check('and the ruler over them', await evalJS(`!!document.querySelector('#agentsRoot .rulerwrap .ruler')`))

if (process.env.SHOT) {
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(process.env.SHOT, Buffer.from(shot.result.data, 'base64'))
}

/* ---- a change goes through the agent ---- */
await evalJS(`document.querySelector('#agentsRoot .trow .hours button.hr[data-hour="5"]').click()`)
await wait(500)
const posted = await evalJS(`window.__blocked.join('\\n')`)
check('an hour click posts to /agents-api/apply', /POST \/agents-api\/apply \{"agent":"plan-agent","target":"personal","changes":\{"hours":\[5\]\}\}/.test(posted), posted.slice(0, 200))

/* ---- nothing leaks into the board ---- */
check('its .count styles stay inside the view', await evalJS(`(() => {
  const s = document.createElement('span'); s.className = 'count'; document.body.appendChild(s);
  const r = getComputedStyle(s).whiteSpace; s.remove(); return r !== 'nowrap';
})()`))

/* ---- leaving unmounts it, so the poll stops ---- */
await evalJS(`state.view = 'board'; renderView()`)
await wait(300)
// The board view hides #lists rather than emptying it, so the host node can
// stay; what matters is that React let go of it and drew nothing into it.
check('leaving the tab unmounts it', await evalJS(`agentsRoot === null && !document.querySelector('#agentsRoot .agents-ui')`))

/* ---- the real route ---- */
const real = await evalJS(`window.__real('/agents-api/state.json').then(r => r.json()).then(j => (j.agents || []).map(a => a.id).sort().join(','))`)
check('the server lists only this repo agents', real === 'implement-agent,plan-agent', real)
const refused = await evalJS(`window.__real('/agents-api/run', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }).then(r => r.status)`)
check('a POST naming no agent is refused', refused === 404, String(refused))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
