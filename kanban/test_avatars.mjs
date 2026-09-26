#!/usr/bin/env node
/* Agent avatars — a face on the card chip, a sub-task row and the drawer's
 * Delegate to field, and the "delegated to an agent" filter that finds a
 * task through its sub-tasks. IMPROVEMENTS.md, `agent-avatars`.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_avatars.mjs
 *
 * Written 26 Sep 2026. Own fixture rather than reusing test_one_board.mjs's:
 * this needs a task delegated to a person with an agent only on one of its
 * sub-tasks, to prove the filter reaches through rather than reading `[to::]`
 * alone. The tab is locked before the fixture loads and every write is torn
 * out of `fetch`, so the run cannot reach todo.md.
 */
import { spawn } from 'node:child_process'

const PORT = Number(process.env.CDP_PORT) || 9494
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_avatars.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-avatars-test-profile'}`, '--window-size=1400,1000',
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
  await new Promise(r => setTimeout(r, 2500))
  check('the board loaded', await evalJS(`typeof avatarSvg === 'function' && typeof delegatedToAgent === 'function'`))

  await evalJS(`(() => {
    state.locked = true; state.lockedLabel = 'test';
    const real = window.fetch;
    window.__blocked = [];
    window.fetch = (u, o) => {
      const m = (o && o.method) || 'GET';
      if (m !== 'GET') { window.__blocked.push(m + ' ' + u); return Promise.resolve(new Response('{}', { status: 200 })) }
      return real(u, o);
    };
    load([
      '# To-do', '', '## 1. Tasks', '',
      '### Doing', '',
      "- [ ] **Alpha** [impact:: high] [effort:: M] [to:: Plan agent]",
      "- [ ] **Beta** [impact:: med] [effort:: S] [to:: Tiago]",
      '  - [ ] a step for the agent [to:: Implement agent]',
      '  - [ ] an ordinary step',
      "- [ ] **Gamma** [impact:: low] [effort:: S]",
      '',
      '### To do', '',
      ''
    ].join('\\n'), 'demo.md', {});
    state.locked = false;
    window.__task = title => state.doc.buckets[0].tiers.flatMap(x => x.tasks).find(t => t.title === title);
    window.__cardChip = title => document.querySelector('#board .tenon-card[data-id="' + __task(title).id + '"] .tenon-tag--accent .avatar svg');
    // Loading a fixture starts on Overview, same as any load — the board is
    // its own view, picked the same way clicking its tab would.
    state.view = 'board'; renderView();
  })()`)
  await wait(200)
  check('the tab is unlocked, and every write is being torn out', await evalJS(`state.locked === false && window.__blocked.length === 0`))

  /* ---- the generator itself ---- */

  check('the same name gives the same SVG every time', await evalJS(`
    avatarSvg('Plan agent', 20) === avatarSvg('Plan agent', 20)`))
  check('two different agents draw two different SVGs', await evalJS(`
    avatarSvg('Plan agent', 20) !== avatarSvg('Implement agent', 20)`))
  check('a person gets no avatar at all', await evalJS(`agentAvatarHTML('Tiago', 20)`) === '')
  check('an agent does', await evalJS(`agentAvatarHTML('Plan agent', 20).includes('<svg')`))

  /* ---- where it shows ---- */

  check("the card chip for a task delegated to an agent draws that agent's avatar", await evalJS(`(() => {
    const svg = __cardChip('Alpha');
    const d = document.createElement('div'); d.innerHTML = avatarSvg('Plan agent', 16);
    return !!svg && svg.outerHTML === d.firstElementChild.outerHTML;
  })()`))
  check('a task delegated to him draws no avatar on its chip', await evalJS(`(() => {
    const t = __task('Beta');
    const chip = document.querySelector('#board .tenon-card[data-id="' + t.id + '"] .tenon-tag--accent');
    return !!chip && !chip.querySelector('.avatar');
  })()`))

  await evalJS(`openDrawer(__task('Beta').id)`)
  await wait(100)
  check('a sub-task assigned to an agent shows its avatar in the drawer', await evalJS(`(() => {
    const rows = [...document.querySelectorAll('#f-subs .sub')];
    const agentRow = rows[0], plainRow = rows[1];
    const got = agentRow.querySelector('.avatar svg'); const d = document.createElement('div'); d.innerHTML = avatarSvg('Implement agent', 16);
    return !!got && got.outerHTML === d.firstElementChild.outerHTML;
  })()`))
  check('an ordinary sub-task shows none', await evalJS(`
    !document.querySelectorAll('#f-subs .sub')[1].querySelector('.avatar')`))
  const pick = v => evalJS(`(() => {
    document.querySelector('[data-delegate-btn="f-to"]').click();
    document.querySelector('[data-delegate-menu="f-to"] [data-delegate-value="${v}"]').click();
  })()`)
  check('the Delegate to field shows no avatar while it is set to a person', await evalJS(`
    !document.querySelector('[data-delegate-btn="f-to"] .avatar')`))
  check('each agent in the Delegate to dropdown carries its avatar', await evalJS(`(() => {
    const d = document.createElement('div'); d.innerHTML = avatarSvg('Plan agent', 18);
    const svg = document.querySelector('[data-delegate-menu="f-to"] [data-delegate-value="Plan agent"] svg');
    return !!svg && svg.outerHTML === d.firstElementChild.outerHTML &&
      !document.querySelector('[data-delegate-menu="f-to"] [data-delegate-value=""] svg');
  })()`))
  await pick('Plan agent')
  check('choosing an agent draws its avatar on the field', await evalJS(`(() => {
    const svg = document.querySelector('[data-delegate-btn="f-to"] svg');
    const d = document.createElement('div'); d.innerHTML = avatarSvg('Plan agent', 18);
    return !!svg && svg.outerHTML === d.firstElementChild.outerHTML && document.querySelector('#f-to').value === 'Plan agent';
  })()`))
  await pick('')
  check('and choosing Nobody again clears it, without closing the drawer', await evalJS(`
    !document.querySelector('[data-delegate-btn="f-to"] .avatar') && !!document.querySelector('#f-to') &&
    document.querySelector('[data-delegate-btn="f-to"]').textContent === 'Nobody'`))
  await evalJS(`closeDrawer()`)

  /* ---- the filter ---- */

  check('delegatedToAgent is true for a task handed to an agent itself', await evalJS(`delegatedToAgent(__task('Alpha'))`))
  check('and true for one only a sub-task of which is', await evalJS(`delegatedToAgent(__task('Beta'))`))
  check('and false for one with neither', await evalJS(`delegatedToAgent(__task('Gamma'))`) === false)

  await evalJS(`(() => { state.agentFilter = true; refreshView(); })()`)
  await wait(200)
  check('the filter narrows the board to just those two', await evalJS(`(() => {
    const shown = [...document.querySelectorAll('#board .tenon-card')].map(c => c.dataset.id).sort();
    return JSON.stringify(shown) === JSON.stringify([__task('Alpha').id, __task('Beta').id].sort());
  })()`))
  check('the chip on the filter strip says so', await evalJS(`
    document.querySelector('#agentFilterChip').classList.contains('on') &&
    document.querySelector('#agentFilterChip').textContent.includes('2')`))
  await evalJS(`(() => { state.agentFilter = false; refreshView(); })()`)
  await wait(200)
  check('turning it off brings Gamma back', await evalJS(`
    [...document.querySelectorAll('#board .tenon-card')].some(c => c.dataset.id === __task('Gamma').id)`))

  await evalJS(`state.locked = true`)
  check('nothing reached todo.md', await evalJS(`window.__blocked.length === 0`), await evalJS(`window.__blocked.join(' | ')`))
} finally {
  ws.close()
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
