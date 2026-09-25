#!/usr/bin/env node
/* Overview — the seven columns `renderSections('overview')` draws.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_overview.mjs
 *
 * Written 14 Sep 2026, alongside the port of the view's own shell — the split
 * grid and the Column wrappers — to kanban/ui/SectionsView.tsx. What each
 * section actually decides to show (byPriority, capCards, the Quick wins
 * groups) is untouched by that port and stays covered by inspection rather
 * than by this suite; what this suite pins is the shell: the titles and
 * hints, the count beside each, the split grid's track count, and — the one
 * real risk the port carries — that capMsgCards() still measures the real,
 * painted DOM rather than racing React's own schedule. mountFlushed() (see
 * kanban/ui/index.ts) is what that risk turns on, so the check below reads the
 * .capped class in the same synchronous pass as the render call, with no
 * setTimeout to paper over a race if one existed.
 *
 * Five columns until 19 Sep 2026, seven since: Tasks finished and Written
 * reports were a tab of their own and sit at the two ends of this row now,
 * Tasks finished leading it at twice a reference column's width. What
 * they hold is kanban/test_reports.mjs's; what this suite adds about them is
 * that they are there, that they fold like the rest, and that the row's tracks
 * counted them.
 */
import { spawn } from 'node:child_process'

const PORT = Number(process.env.CDP_PORT) || 9458
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_overview.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-overview-test-profile'}`, '--window-size=1400,1000',
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
check('the board loaded', await evalJS(`typeof renderSections === 'function'`))

// LOCK FIRST, then the fixture. Nothing below can write anything.
await evalJS(`(() => {
  state.locked = true; state.lockedLabel = 'test';
  const real = window.fetch;
  window.__blocked = [];
  window.fetch = (u, o) => {
    const m = (o && o.method) || 'GET';
    if (m !== 'GET') { window.__blocked.push(m + ' ' + u); return Promise.resolve(new Response('{}', { status: 200 })) }
    /* The plans folder is real and private, so the orphan-plan line is fed from here. */
    if (String(u).startsWith('/plans.json')) return Promise.resolve(new Response(JSON.stringify({ plans: window.__plans || [] }), { status: 200 }))
    return real(u, o);
  };

  /* One task per section, so a failure names the section rather than a card.
     The message on the quick win is long enough to overrun the four-line clamp
     .ref .msg carries (see board.css), which is what proves capMsgCards() ran
     against real layout rather than an unpainted node. */
  const longMessage = Array(12).fill('This is one long suggested message, written to run well past the four lines the card clamps to before anything trims it.').join(' ');
  load([
    '# To-do', '', '## 1. Tasks', '',
    '### To do', '',
    '- [ ] Ship the redesign \`id:ov0001\` [bucket:: People] [impact:: high] [effort:: L]',
    '- [ ] Standup notes \`id:ov0002\` [bucket:: People] [impact:: med] [effort:: S] \`week\`',
    '- [ ] Reply to Sam \`id:ov0003\` [bucket:: People] [impact:: med] [effort:: S]',
    '  - Suggested message: "' + longMessage + '"',
    '- [ ] Export the report \`id:ov0004\` [bucket:: People] [impact:: high] [effort:: M] [to:: Implement agent] \`rank:1\`',
    '',
    '## Context', '',
    '- The team runs a fortnightly retro.',
    ''
  ].join('\\n'), 'demo.md', {});
  state.locked = true;
})()`)
check('the tab is locked', await evalJS(`state.locked === true`))

/* No setTimeout before this read — mountFlushed() is what makes that safe,
   and the point of the check is that it stays safe. */
await evalJS(`state.view = 'overview'; renderView()`)

/* ---- the shell: seven columns, in reading order ---- */

check('all seven columns are drawn, in reading order', await evalJS(`
  [...document.querySelectorAll('.lists.split .tenon-column h3')].map(h => h.textContent).join('|')
`) === 'Tasks finished|Big rocks|This week|Quick wins|Delegate to Claude|Context|Written reports',
  await evalJS(`[...document.querySelectorAll('.lists.split .tenon-column h3')].map(h => h.textContent).join('|')`))

check('the split grid carries seven tracks', await evalJS(`
  (document.querySelector('.lists.split').style.gridTemplateColumns.match(/minmax/g) || []).length
`) === 7, await evalJS(`document.querySelector('.lists.split').style.gridTemplateColumns`))

/* The two report columns are wider than the four reference ones, and the row's
   own floor has to add up to what it is actually holding rather than to a
   count times one width. */
check('and the row is as wide as the seven tracks it holds', await evalJS(`
  document.querySelector('.lists.split').style.minWidth
`) === (394 * 4 + 554 + 788 + 434) + 'px', await evalJS(`document.querySelector('.lists.split').style.minWidth`))

/* Two reference columns and the gap between them, so the wide column lines up
   with the pair beside it rather than being merely bigger than them. */
check('Tasks finished leads the row at exactly two reference columns wide', await evalJS(`
  document.querySelector('.lists.split').style.gridTemplateColumns.split(') ')[0] + ')'
`) === 'minmax(774px, 2fr)', await evalJS(`document.querySelector('.lists.split').style.gridTemplateColumns`))

check('a hint with a tag in it renders the tag as code, not literal backticks', await evalJS(`
  document.querySelector('.lists.split .tenon-column:nth-child(3) .tenon-column__desc code')?.textContent
`) === 'week', await evalJS(`document.querySelector('.lists.split .tenon-column:nth-child(3) .tenon-column__desc')?.innerHTML`))

/* ---- each section counts what it holds ---- */

const countOf = title => evalJS(`(() => {
  const h = [...document.querySelectorAll('.lists.split .tenon-column h3')].find(h => h.textContent === ${JSON.stringify(title)});
  return h?.closest('.tenon-column')?.querySelector('.tenon-column__head-end .tenon-column__count')?.textContent;
})()`)

check('Big rocks counts the one L task', await countOf('Big rocks') === '1')
check('This week counts the one week-tagged task', await countOf('This week') === '1')
/* The S task with nobody named is his, so it counts beside the message task.
   Until 21 Sep 2026 an untagged task was skipped for having no `ai:`. */
check('Quick wins counts the message task and the small one', await countOf('Quick wins') === '2')
check('Delegate to Claude counts the one Implement agent task', await countOf('Delegate to Claude') === '1')

/* ---- the two report columns, at the end of the same row ---- */

check('Tasks finished carries the window picker in its head', await evalJS(`(() => {
  const c = [...document.querySelectorAll('.lists.split .tenon-column')].find(c => c.querySelector('h3')?.textContent === 'Tasks finished');
  return !!c?.querySelector('summary #reportWindow');
})()`))
/* The report columns carry `.reportsview`, which styles the folds inside the
   Completed report — and those rules caught the column's own head the moment
   the column became a <details> with a <summary> for one: 12.5px type and a
   second chevron on a line of its own. They are scoped under `.tenon-column__body` now,
   so the head is the same object as any other column's. */
check('and its head is drawn exactly like a reference column\'s', await evalJS(`(() => {
  const at = t => [...document.querySelectorAll('.lists.split .tenon-column')].find(c => c.querySelector('h3')?.textContent === t);
  const shape = el => { const s = el.querySelector('summary'), cs = getComputedStyle(s);
    return [cs.fontSize, cs.padding, getComputedStyle(s, '::before').content,
            s.querySelectorAll('.tenon-column__chevron').length].join('/') };
  return shape(at('Tasks finished')) === shape(at('Big rocks')) ? 'same' : shape(at('Tasks finished')) + ' vs ' + shape(at('Big rocks'));
})()`) === 'same', await evalJS(`(() => {
  const at = t => [...document.querySelectorAll('.lists.split .tenon-column')].find(c => c.querySelector('h3')?.textContent === t);
  const s = at('Tasks finished').querySelector('summary'), cs = getComputedStyle(s);
  return cs.fontSize + '/' + getComputedStyle(s, '::before').content;
})()`))

/* The head, used the way every other column on this row uses it: a count of
   the thing the column holds, and one line saying what that is. */
check('and a count and a description, like every other column here', await evalJS(`(() => {
  const c = [...document.querySelectorAll('.lists.split .tenon-column')].find(c => c.querySelector('h3')?.textContent === 'Tasks finished');
  return c.querySelector('.tenon-column__head-end .tenon-column__count')?.textContent + '|' +
    (c.querySelector('.tenon-column__desc')?.textContent || '').slice(0, 24);
})()`) === '0|Everything ticked off in', await evalJS(`(() => {
  const c = [...document.querySelectorAll('.lists.split .tenon-column')].find(c => c.querySelector('h3')?.textContent === 'Tasks finished');
  return c.querySelector('.tenon-column__head-end .tenon-column__count')?.textContent + '|' + c.querySelector('.tenon-column__desc')?.textContent;
})()`))
check('Written reports folds on the same key the other six use', await evalJS(`(() => {
  const c = [...document.querySelectorAll('.lists.split .tenon-column')].find(c => c.querySelector('h3')?.textContent === 'Written reports');
  return c?.tagName === 'DETAILS' && c.dataset.columnCollapse === 'ov:Written reports';
})()`))

/* ---- the section with nothing to count ---- */

check('Context carries no count, since it is prose rather than a list', await evalJS(`(() => {
  const h = [...document.querySelectorAll('.lists.split .tenon-column h3')].find(h => h.textContent === 'Context');
  return h.closest('.tenon-column').querySelector('.tenon-column__head-end .tenon-column__count');
})()`) == null)

/* ---- capMsgCards() against real, painted layout ---- */

check('the long message is clamped and marked capped by measuring the real box, not guessed', await evalJS(`(() => {
  const msg = document.querySelector('.ref .msg');
  if (!msg) return false;
  return msg.classList.contains('capped') && msg.scrollHeight > msg.clientHeight;
})()`))

/* ---- collapsing a section persists, the same way it always has ---- */

const bigRocksDetails = () => evalJS(`
  [...document.querySelectorAll('.lists.split .tenon-column')].find(c => c.querySelector('h3')?.textContent === 'Big rocks')?.tagName
`)
check('a section is a <details>, open by default', await bigRocksDetails() === 'DETAILS')

await evalJS(`(() => {
  const d = [...document.querySelectorAll('.lists.split .tenon-column')].find(c => c.querySelector('h3')?.textContent === 'Big rocks');
  d.open = false;
  d.dispatchEvent(new Event('toggle'));
})()`)
await new Promise(r => setTimeout(r, 150))
check('shutting one writes it to the same key Overview has always used', await evalJS(`
  JSON.parse(localStorage.getItem('todo-board-overview-closed') || '{}')['ov:Big rocks'] === true
`))

await evalJS(`state.view = 'board'; renderView(); state.view = 'overview'; renderView()`)
check('and it stays shut across a re-render', await evalJS(`(() => {
  const d = [...document.querySelectorAll('.lists.split .tenon-column')].find(c => c.querySelector('h3')?.textContent === 'Big rocks');
  return d.open === false;
})()`))

// Cleaned up so this suite leaves no mark on a machine it runs on twice.
await evalJS(`localStorage.removeItem('todo-board-overview-closed')`)

/* ---- Quick wins' own sort control, and Delegate to Claude's ranked rows ---- */

check('Quick wins carries its own sort toggle, not the board\'s', await evalJS(`
  !!document.querySelector('.lists.split .tenon-column:nth-child(4) [data-quicksort]')
`))
check('Delegate to Claude numbers its rows', await evalJS(`
  document.querySelector('.lists.split .tenon-column:nth-child(5) .refnum')?.textContent
`) === '1')

/* ---- the cards: Tenon's Card, with the attributes the delegated listener reads ---- */

/* A reference card is Tenon's Card with the board's `ref` class kept on it, and
   every control on it is an attribute rather than a prop, because one listener
   on #lists answers them here, in the drawer and on Plans alike. */
/* The file's own \`id:\` tokens are not honoured at load, so a card is found by
   its title rather than by an id the fixture wrote. */
await evalJS(`window.__ref = t => [...document.querySelectorAll('.lists.split article.ref')]
  .find(a => a.querySelector('.reftitle')?.textContent === t)`)
check('a reference card is a Tenon card that keeps the ref class', await evalJS(`
  !!document.querySelector('.lists.split article.tenon-card.ref[style*="--bc"]')
`))
check('its tick box is a checkbox naming the task', await evalJS(`(() => {
  const b = __ref('Ship the redesign')?.querySelector('[data-tick]');
  return !!b && b.getAttribute('role') === 'checkbox' && b.getAttribute('aria-checked') === 'false';
})()`))
check('its title opens the task', await evalJS(`
  !!__ref('Ship the redesign')?.querySelector('.reftitle[data-open]')
`))
check('where it lives is spelled out under the title', await evalJS(`
  __ref('Ship the redesign').querySelector('.refwhere').textContent
`) === 'Tasks · To do', await evalJS(`__ref('Ship the redesign').querySelector('.refwhere').textContent`))
check('This week offers Not this week', await evalJS(`
  __ref('Standup notes')?.querySelector('[data-unweek]')?.textContent
`) === 'Not this week')
check('Quick wins offers Dismiss, and says what was left out', await evalJS(`
  !!document.querySelector('.lists.split [data-quickdismiss]') && !!document.querySelector('.lists.split .refheld, .lists.split .refgroup')
`))

/* Dismissing is a preference about the list, kept in localStorage, and the
   note that says so carries the way back. Both go through the delegated
   listener, and the suite puts it back so it leaves no mark. */
await evalJS(`document.querySelector('.lists.split [data-quickdismiss]').click()`)
await new Promise(r => setTimeout(r, 150))
check('Dismiss takes the card out and says how many are dismissed', await evalJS(`
  /^1 dismissed\\./.test(document.querySelector('.lists.split .refmore')?.textContent || '') &&
  !!document.querySelector('.lists.split [data-quickrestore]')
`))
await evalJS(`document.querySelector('.lists.split [data-quickrestore]').click()`)
await new Promise(r => setTimeout(r, 150))
check('and Show them again puts it back', await evalJS(`
  !document.querySelector('.lists.split [data-quickrestore]') && !!document.querySelector('.lists.split [data-quickdismiss]')
`))
check('the Context column draws its standing facts as cards', await evalJS(`
  document.querySelector('.lists.split .ref.ctx .ctxtext')?.textContent
`) === 'The team runs a fortnightly retro.')

/* A sub-step is a card of its own, and its line is what the tick and Not this
   week send back. Line zero is a real line, so it must not be dropped as empty. */
await evalJS(`(() => {
  load([
    '# To-do', '', '## 1. Tasks', '', '### To do', '',
    '- [ ] Parent \`id:ov0010\` [bucket:: People]',
    '  - [ ] Step one \`week\`',
    ''
  ].join('\\n'), 'demo.md', {});
  state.locked = true;
  state.view = 'overview'; renderView();
})()`)
check('a sub-step card names its line, zero included', await evalJS(`
  __ref('Step one')?.querySelector('[data-unweek]')?.dataset.sub + '/' +
  __ref('Step one')?.querySelector('[data-tick]')?.dataset.sub
`) === '0/0', await evalJS(`__ref('Step one')?.outerHTML.slice(0, 300)`))

/* ---- delegation still opens a card from a React-rendered section ---- */

await evalJS(`document.querySelector('.lists.split [data-open]').click()`)
await new Promise(r => setTimeout(r, 400))
check('clicking a card opens it, the same #lists delegation every other view uses', await evalJS(`
  !!document.querySelector('#drawer:not(.hidden)')
`))
await evalJS(`closeDrawer()`)

/* ---- a plan whose task has gone ---- */

await evalJS(`window.__plans = [
  { name: 'kept.md', title: 'Has its task', about: 'task:' + state.doc.buckets.flatMap(b => b.tiers.flatMap(t => t.tasks.map(k => k.stableId)))[0], state: '' },
  { name: 'orphan.md', title: 'Lost its task', about: 'task:zz9999', state: 'review' },
  { name: 'old.md', title: 'Finished long ago', about: 'task:zz8888', state: 'done' }
]`)
await evalJS(`state.view = 'board'; renderView(); state.view = 'overview'; renderView()`)
await new Promise(r => setTimeout(r, 500))
check('a plan with no task on the list gets a line in Context', await evalJS(`
  /Lost its task/.test(([...document.querySelectorAll('.ctxgroup')].find(g => g.querySelector('summary').textContent === 'Plans with no task') || {}).textContent || '')
`))
check('and a plan that has its task, or is finished, does not', await evalJS(`
  !/Has its task|Finished long ago/.test([...document.querySelectorAll('.ctxgroup')].find(g => g.querySelector('summary').textContent === 'Plans with no task').textContent)
`))

/* ---- the point of the guard ---- */

check('overview wrote nothing, which is all it should ever do',
  await evalJS(`window.__blocked.length === 0`), await evalJS(`window.__blocked.join(' | ')`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
