#!/usr/bin/env node
/* The one board, stage 7: handing a task over, the two reviews, and whose move it is.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_one_board.mjs
 *
 * Written 22 Sep 2026. Choosing an agent in the drawer lays the sub-tasks out on the
 * card and moves it to Doing; the two reviews approve by ticking and send back by
 * unticking what is before them, with what was wrong as a note; a card shows
 * "your move" while a sub-task assigned to him is open with its blocker ticked, and
 * the column head counts them. The tab is locked before anything loads and every
 * write is torn out of `fetch`, so the run cannot reach todo.md.
 */
import { spawn } from 'node:child_process'

const PORT = Number(process.env.CDP_PORT) || 9492
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_one_board.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-oneboard-test-profile'}`, '--window-size=1400,1000',
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
  check('the board loaded', await evalJS(`typeof handOver === 'function' && typeof yourMove === 'function'`))

  // LOCK FIRST, then the fixture. Every write is torn out of fetch.
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
      '### To do', '',
      '- [ ] **Alpha** [impact:: high] [effort:: M]',
      '- [ ] **Beta** [impact:: med] [effort:: S]',
      '- [ ] **Gamma** [impact:: low] [effort:: S] \`id:gm0001\`',
      '  - [ ] an ordinary step',
      '',
      '- [ ] **Epsilon** [impact:: low] [effort:: S] \`id:ep0001\`',
      '  - [ ] a step an agent does [to:: Implement agent]',
      '',
      '### Backlog', '',
      '- [ ] **Delta** [impact:: low] [effort:: S]',
      ''
    ].join('\\n'), 'demo.md', {});
    state.locked = false;
    window.__task = title => state.doc.buckets[0].tiers.flatMap(x => x.tasks).find(t => t.title === title);
    window.__tier = title => locate(__task(title).id).tier.name;
    window.__step = (title, id) => __task(title).body.find(l => l.includes(id));
  })()`)
  check('the tab is unlocked, and every write is being torn out', await evalJS(`state.locked === false && window.__blocked.length === 0`))

  /* ---- handing a task over ---- */

  await evalJS(`openDrawer(__task('Alpha').id)`)
  await evalJS(`(() => { const sel = document.querySelector('#f-to'); sel.value = 'Plan agent'; sel.onchange({ target: sel }); })()`)
  check('handing a task to the Plan agent lays out four sub-tasks, each blocked by the one before', await evalJS(`
    (() => { const t = __task('Alpha'); return subSteps(t).map(s => s.clean + ':' + s.to + ':' + s.blockedBy.map(b => b.replace(t.stableId, 'ID')).join('+')).join('|'); })()`) ===
    'Plan:Plan agent:|Review the plan:Tiago:ID-plan|Implement:Implement agent:ID-plan-review|Review the work:Tiago:ID-implement')
  check('with the slugs made from the task\'s id and the step', await evalJS(`
    (() => { const t = __task('Alpha'); return subSteps(t).map(s => s.slug.replace(t.stableId, 'ID')).join(','); })()`) === 'ID-plan,ID-plan-review,ID-implement,ID-work-review')
  check('the task was given an id to make them from, and each sub-task has its own', await evalJS(`
    (() => { const t = __task('Alpha'); const ids = subSteps(t).map(s => s.stableId).concat([t.stableId]);
      return ids.every(i => /^[a-z0-9]{6}$/.test(i)) && new Set(ids).size === 5; })()`))
  check('the two reviews are his', await evalJS(`subSteps(__task('Alpha')).map(s => s.to).join('|')`) === 'Plan agent|Tiago|Implement agent|Tiago')
  check('the card moved from To do to Doing', await evalJS(`__tier('Alpha')`) === 'Doing')
  check('and the task says who has it', await evalJS(`__task('Alpha').to`) === 'Plan agent')

  await evalJS(`openDrawer(__task('Beta').id)`)
  await evalJS(`(() => { const sel = document.querySelector('#f-to'); sel.value = 'Implement agent'; sel.onchange({ target: sel }); })()`)
  check('handed straight to the Implement agent it gets the last two', await evalJS(`subSteps(__task('Beta')).map(s => s.clean).join('|')`) === 'Implement|Review the work')

  await evalJS(`openDrawer(__task('Gamma').id)`)
  await evalJS(`(() => { const sel = document.querySelector('#f-to'); sel.value = 'Plan agent'; sel.onchange({ target: sel }); })()`)
  check('a task with steps of its own keeps them and gets the four after', await evalJS(`subSteps(__task('Gamma')).length`) === 5)
  check('and keeps the id it already had', await evalJS(`__task('Gamma').stableId`) === 'gm0001')
  await evalJS(`openDrawer(__task('Delta').id)`)
  await evalJS(`(() => { const sel = document.querySelector('#f-to'); sel.value = 'Plan agent'; sel.onchange({ target: sel }); })()`)
  check('one in Backlog moves to Doing too', await evalJS(`__tier('Delta')`) === 'Doing')
  await evalJS(`(() => { const sel = document.querySelector('#f-to'); sel.value = 'Implement agent'; sel.onchange({ target: sel }); })()`)
  check('choosing again does not lay it out twice', await evalJS(`subSteps(__task('Delta')).length`) === 4)
  await evalJS(`openDrawer(__task('Epsilon').id)`)
  await evalJS(`(() => { const sel = document.querySelector('#f-to'); sel.value = 'Plan agent'; sel.onchange({ target: sel }); })()`)
  check('an ordinary step assigned to an agent is not a handover, so the four are still laid out', await evalJS(`subSteps(__task('Epsilon')).length`) === 5)
  await evalJS(`closeDrawer()`)

  /* ---- whose move it is ---- */

  check('no card is his move while the agent has the first sub-task', await evalJS(`yourMove(__task('Alpha'))`) === false)
  await evalJS(`(() => { const t = __task('Alpha'); const at = subSteps(t)[0].line; const f = readSub(t, at); f.done = true; writeSub(t, at, f); refreshView(); })()`)
  check('once the Plan is ticked, the review is', await evalJS(`yourMove(__task('Alpha'))`) === true)
  check('the card says so', await evalJS(`state.view = 'board'; renderView(); [...document.querySelectorAll('#board .tenon-card .tag.yourmove')].length`) === 1)
  check('and the column head counts it', await evalJS(`document.querySelector('#board .tenon-column[data-tier="Doing"] .yourmovecount')?.textContent`) === '1 your move')

  /* ---- the two reviews ---- */

  await evalJS(`(() => { const t = __task('Alpha'); const rv = subSteps(t)[1]; window.__setNote = (l) => setStepNoteText(t, rv.line, l); __setNote('- Plan: plans/2026-09-22/alpha.md'); openDrawer(rv.stableId); })()`)
  check('the review of the plan offers to read it, talk it through, approve and send back', await evalJS(`
    ['#f-readplan', '#f-chatrev', '#f-approve', '#f-sendback'].every(s => document.querySelector(s))`))
  check('and Approve is open, since the plan is written', await evalJS(`!document.querySelector('#f-approve').disabled`))

  await evalJS(`document.querySelector('#f-sendback').click()`)
  await evalJS(`(() => { document.querySelector('#f-sendback-text').value = 'The second option ignores the brand answer.'; document.querySelector('#f-sendback-go').click(); })()`)
  check('sending the plan back unticks the Plan', await evalJS(`subSteps(__task('Alpha'))[0].done`) === false)
  check('with what was wrong as a note under it', await evalJS(`stepNoteText(__task('Alpha'), subSteps(__task('Alpha'))[0].line)`) === '- feedback: The second option ignores the brand answer.')
  check('and the card is no longer his move', await evalJS(`yourMove(__task('Alpha'))`) === false)
  check('it stays in Doing', await evalJS(`__tier('Alpha')`) === 'Doing')

  /* Plan again, then approve it, then the work. */
  await evalJS(`(() => { const t = __task('Alpha'); [0, 1].forEach(i => { const at = subSteps(t)[i].line; const f = readSub(t, at); f.done = i === 0; writeSub(t, at, f); }); openDrawer(subSteps(t)[1].stableId); })()`)
  await evalJS(`document.querySelector('#f-approve').click()`)
  check('approving is ticking the review', await evalJS(`subSteps(__task('Alpha'))[1].done`) === true)

  await evalJS(`(() => { const t = __task('Alpha'); const at = subSteps(t)[2].line; const f = readSub(t, at); f.done = true; writeSub(t, at, f); moveCardTo(t, WAIT_COL); refreshView(); openDrawer(subSteps(t)[3].stableId); })()`)
  check('with the Implement agent done, the card is in Reviewing and the work is his to review', await evalJS(`__tier('Alpha') + ':' + yourMove(__task('Alpha'))`) === 'Reviewing:true')
  check('the review of the work offers no plan to read', await evalJS(`!document.querySelector('#f-readplan') && !!document.querySelector('#f-chatrev')`))
  await evalJS(`document.querySelector('#f-sendback').click()`)
  await evalJS(`(() => { document.querySelector('#f-sendback-text').value = 'Missed the mobile layout.'; document.querySelector('#f-sendback-go').click(); })()`)
  check('sending the work back unticks Implement', await evalJS(`subSteps(__task('Alpha'))[2].done`) === false)
  check('and puts the card back in Doing', await evalJS(`__tier('Alpha')`) === 'Doing')
  check('the plan stays approved', await evalJS(`subSteps(__task('Alpha'))[1].done`) === true)

  /* ---- a written plan says where it is ---- */

  await evalJS(`(() => {
    const real = window.__realFetch || window.fetch;
    window.__queue = [{ id: 'z1', sub: subSteps(__task('Gamma')).find(s => s.to === 'Plan agent').stableId, by: 'Plan agent', plan: '2026-09-22/gamma.md' }];
    window.fetch = (u, o) => {
      const m = (o && o.method) || 'GET';
      if (String(u).startsWith('/tick-queue.json') && m === 'GET') return Promise.resolve(new Response(JSON.stringify(window.__queue), { status: 200 }));
      if (m !== 'GET') { window.__blocked.push(m + ' ' + u); return Promise.resolve(new Response('{}', { status: 200 })) }
      return real(u, o);
    };
  })()`)
  await evalJS(`drainTickQueue()`)
  await new Promise(r => setTimeout(r, 300))
  check('the tick that reports a plan writes a Plan note on the review behind it', await evalJS(`
    (() => { const t = __task('Gamma'); const rv = subSteps(t).find(s => s.clean === 'Review the plan'); return stepNoteText(t, rv.line); })()`) === '- Plan: plans/2026-09-22/gamma.md')
  check('a plan with no type leaves its review for him', await evalJS(`
    subSteps(__task('Gamma')).find(s => s.clean === 'Review the plan').done`) === false)

  /* ---- a pre-approved type approves itself on arrival ---- */

  await evalJS(`(() => {
    const planOf = title => subSteps(__task(title)).find(s => s.to === 'Plan agent').stableId;
    window.__queue = [
      { id: 'z2', sub: planOf('Delta'), by: 'Plan agent', plan: '2026-09-22/delta.md', type: 'write-up' },
      { id: 'z3', sub: planOf('Epsilon'), by: 'Plan agent', plan: '2026-09-22/epsilon.md', type: 'deck' },
    ];
  })()`)
  await evalJS(`drainTickQueue()`)
  await new Promise(r => setTimeout(r, 300))
  check('a write-up plan ticks the review behind it', await evalJS(`
    subSteps(__task('Delta')).find(s => s.clean === 'Review the plan').done`) === true)
  check('with a note saying why, beside the Plan note', await evalJS(`
    (() => { const t = __task('Delta'); const rv = subSteps(t).find(s => s.clean === 'Review the plan'); return stepNoteText(t, rv.line); })()`) ===
    '- Plan: plans/2026-09-22/delta.md\n- Approved: pre-approved type (write-up)')
  check('which unblocks the Implement agent', await evalJS(`
    (() => { const t = __task('Delta'); const im = subSteps(t).find(s => s.clean === 'Implement'); return !blockedMessage(allItems(), im.blockedBy); })()`) === true)
  check('a deck plan still waits for his review', await evalJS(`
    subSteps(__task('Epsilon')).find(s => s.clean === 'Review the plan').done`) === false)
  await evalJS(`state.locked = true`)

  check('nothing reached todo.md', await evalJS(`window.__blocked.every(b => b.startsWith('POST /tick-queue.json'))`), await evalJS(`window.__blocked.join(' | ')`))
} finally {
  ws.close()
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
