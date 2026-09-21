#!/usr/bin/env node
/* Sub-tasks — what the format says about a step under a task, read through the
 * board's own functions.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_subtasks.mjs
 *
 * Written 21 Sep 2026, stage 4 of handover-one-board.md. core/test_todo.mjs and
 * core/test_todo.py hold the grammar itself, both languages against one table;
 * what this adds is the two things only the board can answer: that a `blocked-by`
 * between two sub-tasks holds them back and draws in the Dependency chain the way
 * it does between tasks, and that what a sub-task takes from its task is what the
 * format says. The tab is locked before anything loads and every write is torn out
 * of `fetch`, so the run cannot reach todo.md.
 */
import { spawn } from 'node:child_process'

const PORT = 9491
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-subtasks-test-profile', '--window-size=1400,1000',
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
  check('the board loaded', await evalJS(`typeof allItems === 'function' && typeof inheritedFields === 'function'`))

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
    load([
      '# To-do', '', '## 1. Tasks', '',
      '### To do', '',
      '- [ ] **Write the handover** \`id:ab12cd\` [impact:: high] [effort:: M] [due:: 2026-09-30] \`week\`',
      '  - [x] Plan [to:: Plan agent] \`done:2026-09-21\` \`#ab12cd-plan\` \`id:aa0001\`',
      '  - [ ] Review the plan [to:: Tiago] \`#ab12cd-plan-review\` \`blocked-by:ab12cd-plan\` \`id:aa0002\`',
      '  - [ ] Implement [to:: Implement agent] \`doing\` [due:: 2026-09-25] \`#ab12cd-implement\` \`blocked-by:ab12cd-plan-review\` \`id:aa0003\`',
      '  - [ ] Review the work [to:: Tiago] \`#ab12cd-work-review\` \`blocked-by:ab12cd-implement\` \`id:aa0004\`',
      ''
    ].join('\\n'), 'demo.md', {});
    state.locked = true;
    window.__parent = state.doc.buckets[0].tiers[0].tasks[0];
    window.__steps = splitBody(window.__parent).steps;
  })()`)
  check('the tab is locked', await evalJS(`state.locked === true`))

  /* ---- the tags ---- */

  check('the four sub-tasks are read, each with the id written on its line',
    await evalJS(`__steps.map(s => s.stableId).join(',')`) === 'aa0001,aa0002,aa0003,aa0004')
  check('the assignee is read off each one', await evalJS(`__steps.map(s => s.to).join('|')`) ===
    'Plan agent|Tiago|Implement agent|Tiago')
  check('Doing is the one state tag, and only the one carrying it has it',
    await evalJS(`__steps.map(s => s.doing ? 'doing' : '-').join(',')`) === '-,-,doing,-')
  check('the drawer\'s lighter reading of a step carries them too', await evalJS(`
    (() => { const s = subSteps(__parent); return s.map(x => x.stableId + ':' + x.to + ':' + (x.doing ? 'doing' : '-')).join(','); })()`) ===
    'aa0001:Plan agent:-,aa0002:Tiago:-,aa0003:Implement agent:doing,aa0004:Tiago:-')
  check('the tick is the state Done', await evalJS(`__steps.map(s => s.done ? 'x' : '.').join('')`) === 'x...')

  /* ---- blocked-by, between sub-tasks ---- */

  check('a sub-task whose blocker is ticked can be started', await evalJS(`
    (() => { const items = allItems(); return actionable(items, items.find(i => i.sub && i.slug === 'ab12cd-plan-review')); })()`))
  check('one whose blocker is open cannot, and neither can the one behind it', await evalJS(`
    (() => { const items = allItems();
      return ['ab12cd-implement', 'ab12cd-work-review'].map(s => actionable(items, items.find(i => i.sub && i.slug === s))).join(); })()`) === 'false,false')
  check('the board names the blocker it is waiting on', await evalJS(`
    (() => { const items = allItems();
      return unresolvedBlockers(items, items.find(i => i.sub && i.slug === 'ab12cd-implement')).join(); })()`) === 'ab12cd-plan-review')
  check('the chain draws all three that wait, each under its blocker', await evalJS(`
    (() => { const items = allItems(); const s = chainSection(items); return s.count; })()`) === 3)

  await evalJS(`state.view = 'matrix'; renderView()`)
  check('and the Matrix draws all three in its Dependency chain, each with its blocker beside it', await evalJS(`
    document.querySelectorAll('.chainitem').length === 3 && document.querySelectorAll('.chainitem .chaindep').length === 3`),
    await evalJS(`document.querySelectorAll('.chainitem').length + ' items, ' + document.querySelectorAll('.chaindep').length + ' blockers'`))

  /* ---- what a sub-task takes from its task ---- */

  check('a sub-task with no date of its own takes its task\'s', await evalJS(`
    inheritedFields(__parent, __steps[1]).due`) === '2026-09-30')
  check('and one with a date of its own keeps it', await evalJS(`
    inheritedFields(__parent, __steps[2]).due`) === '2026-09-25')
  check('impact and the week tag come across, and the list says which', await evalJS(`
    (() => { const f = inheritedFields(__parent, __steps[1]); return f.impact + '|' + f.week + '|' + f.inherited.join(); })()`) ===
    'high|true|due,impact,week')
  check('the assignee and the tick are never taken', await evalJS(`
    (() => { const f = inheritedFields(__parent, __steps[1]); return ('to' in f) || ('done' in f) || ('doing' in f); })()`) === false)

  /* ---- the point of the guard ---- */

  check('nothing was written', await evalJS(`window.__blocked.length === 0`), await evalJS(`window.__blocked.join(' | ')`))
} finally {
  ws.close()
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
