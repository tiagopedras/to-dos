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

  /* ---- the drawer ---- */

  await evalJS(`state.view = 'board'; renderView(); openDrawer(__parent.id)`)
  check('a task with sub-tasks offers to open each one that has an id', await evalJS(`document.querySelectorAll('#f-subs .subopen').length`) === 4)
  check('and the task\'s own drawer has no way back', await evalJS(`document.querySelector('#dheadBack').classList.contains('hidden')`))

  await evalJS(`openDrawer('aa0002')`)
  check('openDrawer takes a sub-task\'s id and shows its title', await evalJS(`document.querySelector('#f-title').value`) === 'Review the plan')
  check('the drawer says it is a sub-task, with the way back top left', await evalJS(`
    document.querySelector('#drawerTitle').textContent === 'View sub-task (read-only)' &&
    !document.querySelector('#dheadBack').classList.contains('hidden') &&
    document.querySelector('.dhead').firstElementChild.id === 'dheadBack'`))
  check('what it takes from its task is faded, and what it has of its own is not', await evalJS(`
    [...document.querySelectorAll('#dbody .field')].filter(f => f.classList.contains('inherited'))
      .map(f => f.querySelector('span').textContent).join('|')`) === 'Impact|Due|Flags|Task|Bucket')
  check('the assignee and the state are its own', await evalJS(`
    document.querySelector('#f-to').value === 'Tiago' || document.querySelector('#f-to').selectedOptions[0].textContent === 'Tiago'`))
  check('the delete and headline controls are hidden for it', await evalJS(`
    getComputedStyle(document.querySelector('#del')).display === 'none' && getComputedStyle(document.querySelector('#dheadHl')).display === 'none'`))
  check('what it is waiting on is named', await evalJS(`document.querySelector('.subwait')?.textContent`) === 'Plan — done')

  await evalJS(`openDrawer('aa0003')`)
  check('one with a date of its own does not fade it', await evalJS(`
    ![...document.querySelectorAll('#dbody .field.inherited')].some(f => f.querySelector('span').textContent === 'Due')`))
  check('and the state shows Doing', await evalJS(`document.querySelector('#f-substate').getAttribute('aria-valuetext')`) === 'Doing')

  await evalJS(`document.querySelector('#dheadBack').click()`)
  check('the button goes back to the task', await evalJS(`state.openTask === __parent.id && document.querySelector('#f-title').value === 'Write the handover'`))
  check('and a sub-task\'s id is not a task\'s', await evalJS(`locate('aa0002') === null && locateSub('aa0002') !== null`))
  await evalJS(`closeDrawer()`)

  /* ---- editing one, on a tab that is allowed to ---- */

  await evalJS(`state.locked = false; window.__saved = []; window.fetch = (u, o) => { window.__saved.push(((o && o.method) || 'GET') + ' ' + u); return Promise.resolve(new Response('{}', { status: 200 })) }; openDrawer('aa0002')`)
  await evalJS(`(() => { const sel = document.querySelector('#f-to'); sel.value = 'Implement agent'; sel.onchange({ target: sel }); })()`)
  check('changing the assignee rewrites its line in the tag order of a task and keeps every tag', await evalJS(`
    __parent.body.find(l => l.includes('aa0002'))`) === '  - [ ] Review the plan \`#ab12cd-plan-review\` [to:: Implement agent] \`blocked-by:ab12cd-plan\` \`id:aa0002\`', await evalJS(`__parent.body.find(l => l.includes('aa0002'))`))
  await evalJS(`state.locked = true`)

  /* ---- the agents' queue ---- */

  await evalJS(`(() => {
    const real = window.__realFetch || (window.__realFetch = window.fetch);
    window.__queue = [
      { id: 'q1', sub: 'p00001', by: 'Plan agent', note: 'plan written' },
      { id: 'q2', sub: 'i00001', by: 'Implement agent' },
      { id: 'q3', sub: 'r00001', by: 'Plan agent' },
      { id: 'q4', sub: 'nope00', by: 'Plan agent' }
    ];
    window.__posted = [];
    window.fetch = (u, o) => {
      const m = (o && o.method) || 'GET';
      if (String(u).startsWith('/tick-queue.json') && m === 'GET') return Promise.resolve(new Response(JSON.stringify(window.__queue), { status: 200 }));
      if (m !== 'GET') { window.__posted.push(m + ' ' + u + ' ' + (o && o.body || '')); return Promise.resolve(new Response('{}', { status: 200 })) }
      return real(u, o);
    };
    load([
      '# To-do', '', '## 1. Tasks', '',
      '### Doing', '',
      '- [ ] **Handed over** \`id:hh0001\` [impact:: high]',
      '  - [ ] Plan [to:: Plan agent] \`doing\` \`#hh-plan\` \`id:p00001\`',
      '  - [ ] Review the plan [to:: Tiago] \`#hh-review\` \`blocked-by:hh-plan\` \`id:r00001\`',
      '  - [ ] Implement [to:: Implement agent] \`#hh-impl\` \`blocked-by:hh-review\` \`id:i00001\`',
      '',
      '### Reviewing', '',
      ''
    ].join('\\n'), 'demo.md', {});
    state.locked = false;
  })()`)
  await evalJS(`drainTickQueue()`)
  await new Promise(r => setTimeout(r, 300))
  const line = id => evalJS(`(() => { const t = state.doc.buckets[0].tiers.flatMap(x => x.tasks).find(t => t.title === 'Handed over'); return t.body.find(l => l.includes('${id}')) })()`)
  check('a tick from the agent the sub-task is assigned to is applied, dated today', /^  - \[x\] Plan .*done:\d{4}-\d{2}-\d{2}/.test(await line('p00001')) && !/doing/.test(await line('p00001')), await line('p00001'))
  check('a tick from an agent for a sub-task that is not its own is refused', /\[ \] Review the plan/.test(await line('r00001')))
  check('a tick for one still waiting on a blocker is refused too', /\[ \] Implement/.test(await line('i00001')))
  check('a ticked Plan leaves the card in Doing', await evalJS(`locate(state.doc.buckets[0].tiers.flatMap(x => x.tasks).find(t => t.title === 'Handed over').id).tier.name`) === 'Doing')
  check('what was dealt with is taken out of the queue by id, and the one it could not find stays', await evalJS(`window.__posted.filter(p => p.startsWith('POST /tick-queue.json')).map(p => p.split(' ')[2]).join()`) === '{"done":["q1","q2","q3"]}')
  check('and the tab has something to save', await evalJS(`state.dirty === true`))

  await evalJS(`(() => {
    const t = state.doc.buckets[0].tiers.flatMap(x => x.tasks).find(t => t.title === 'Handed over');
    const at = t.body.findIndex(l => l.includes('r00001'));
    const f = readSub(t, at); f.done = true; f.doneOn = '2026-09-22'; writeSub(t, at, f);
    window.__queue = [{ id: 'q5', sub: 'i00001', by: 'Implement agent' }];
    window.__posted = [];
  })()`)
  await evalJS(`drainTickQueue()`)
  await new Promise(r => setTimeout(r, 300))
  check('once its blocker is ticked, the Implement agent\'s tick is applied', /\[x\] Implement/.test(await line('i00001')), await line('i00001'))
  check('and it is the one that moves the card, into Reviewing', await evalJS(`locate(state.doc.buckets[0].tiers.flatMap(x => x.tasks).find(t => t.title === 'Handed over').id).tier.name`) === 'Reviewing')
  await evalJS(`state.locked = true`)

  /* ---- the point of the guard ---- */

  check('nothing reached todo.md', await evalJS(`window.__blocked.length === 0 && window.__posted.every(p => p.startsWith('POST /tick-queue.json'))`), await evalJS(`window.__blocked.concat(window.__posted).join(' | ')`))
} finally {
  ws.close()
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
