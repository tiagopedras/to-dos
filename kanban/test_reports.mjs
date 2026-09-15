#!/usr/bin/env node
/* Reports — the counted half and the written half.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_reports.mjs
 *
 * Written 13 Sep 2026, before porting the view to components, for the same
 * reason the Backups suite was: a port can only be trusted if checks written
 * against the old markup pass against the new.
 *
 * The window picker is the thing to pin hardest. It governs every report in the
 * left column — the counts, the lead note and the pace chart alike — and it has
 * its own render path on purpose, so that changing the window redraws the
 * counted card and leaves the written one alone rather than re-fetching
 * /reports.json for no reason. That separation is invisible on screen and easy
 * to lose, so it is asserted directly by counting fetches.
 *
 * The counted reports read the live document and `done-archive.md` together,
 * which is the other thing worth pinning: a task that has aged out of todo.md
 * still counts, and the two halves have to agree about which window it falls
 * in.
 */
import { spawn } from 'node:child_process'

const PORT = 9455
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-reports-test-profile', '--window-size=1400,1000',
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

await new Promise(r => setTimeout(r, 2500))
check('the board loaded', await evalJS(`typeof renderReportsView === 'function'`))

// LOCK FIRST, then fixtures. Nothing below can write anything.
await evalJS(`(() => {
  state.locked = true; state.lockedLabel = 'test';
  const real = window.fetch;
  window.__blocked = [];
  window.__gets = [];

  const iso = n => { const d = new Date(); d.setDate(d.getDate() - n);
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
  window.__iso = iso;

  window.__reports = [
    { title:'August in review', date:'1 Sep 2026', covers:'August', topic:'Design System',
      summary:'What moved and what it means.', url:'/data/reports/august.md' },
    { title:'A second one', date:'', covers:'', topic:'', summary:'', url:'/data/reports/two.md' }
  ];
  window.__reportsStatus = 0;
  window.__archive = '';

  const json = (b, s) => Promise.resolve(new Response(JSON.stringify(b),
    { status: s, headers: { 'Content-Type': 'application/json' } }));

  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') {
      window.__blocked.push(method + ' ' + url);
      return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
    }
    const u = String(url);
    window.__gets.push(u.split('?')[0]);
    if (u.startsWith('/reports.json')) {
      if (window.__reportsStatus) return json({ error:'no' }, window.__reportsStatus);
      return json({ reports: window.__reports }, 200);
    }
    if (u.includes('done-archive.md')) {
      return Promise.resolve(new Response(window.__archive, { status: 200 }));
    }
    if (u.startsWith('/data/reports/')) {
      return Promise.resolve(new Response('# A report\\n\\nIts body.', { status: 200 }));
    }
    return real(url, opts);
  };

  /* Two buckets so "every bucket appears, including the empty ones" has an
     empty one to show. Three finished tasks at known ages, sized S/M/L so the
     effort points are not the same number as the count. Every task carries an
     id, or the board mints one and marks the document dirty. */
  load([
    '# To-do', '', '## 1. People', '', '### Done', '',
    '- [x] Recent small \`id:rr0001\` [impact:: high] [effort:: S] \`done:' + iso(2) + '\`',
    /* A cancellation is a tick plus a tag (CONVENTIONS.md, Cancelling a task),
       so both of these are ticked, dated and inside the window — and no count
       of finished work may include either. They are what countsAsFinished()
       in core/todo.js exists for. */
    '- [x] Called off \`id:rr0007\` [impact:: high] [effort:: L] \`done:' + iso(2) + '\` \`cancelled:' + iso(2) + '\`',
    '- [x] No longer relevant \`id:rr0008\` [impact:: high] [effort:: L] \`done:' + iso(3) + '\` \`archived:' + iso(3) + '\`',
    '- [x] Recent large \`id:rr0002\` [impact:: high] [effort:: L] \`done:' + iso(3) + '\`',
    '- [x] Older one \`id:rr0003\` [impact:: low] [effort:: M] \`done:' + iso(45) + '\`',
    '- [x] Never dated \`id:rr0004\` [impact:: low] [effort:: S]',
    '- [ ] Still open \`id:rr0005\` [impact:: high] [effort:: S]',
    '',
    '## 2. Design System', '', '### To do', '',
    '- [ ] Nothing finished here \`id:rr0006\` [impact:: med] [effort:: M]', ''
  ].join('\\n'), 'demo.md', {});
  state.locked = true;
  reportWindow = '30';
  invalidateArchiveEntries();
})()`)
check('the tab is locked', await evalJS(`state.locked === true`))

await evalJS(`renderReportsView()`)
await new Promise(r => setTimeout(r, 700))

/* ---- the two columns ---- */

check('both columns are drawn, counted then written', await evalJS(`
  [...document.querySelectorAll('.rview .col .colhead h3')].map(h => h.textContent).join('|')
`) === 'Tasks finished|Written reports')

check('the window picker is in the counted column’s head, not its body', await evalJS(`
  !!document.querySelector('.rview .col:first-child .colhead #reportWindow') &&
  !document.querySelector('.rview .col:first-child .colbody #reportWindow')
`))

check('it is the shared tab object at its small size', await evalJS(`
  document.querySelector('#reportWindow').className
`) === 'tabs small')

check('all seven windows are visible at once rather than behind a dropdown', await evalJS(`
  [...document.querySelectorAll('#reportWindow button[data-window]')].map(b => b.textContent).join('|')
`) === 'Week|7d|15d|30d|60d|90d|All')

check('the one in force is the pressed one', await evalJS(`
  document.querySelector('#reportWindow button.on')?.dataset.window
`) === '30')

check('and it says what span it is showing', await evalJS(`
  /\\d/.test(document.querySelector('#repDates')?.textContent || '')
`), await evalJS(`document.querySelector('#repDates')?.textContent`))

/* ---- what the counted half counts ---- */

const bucketRow = name => evalJS(`(() => {
  const rows = [...document.querySelectorAll('#countedOut .repitem, #countedOut .catrow, #countedOut .row')];
  const hit = rows.find(r => r.textContent.includes(${JSON.stringify(name)}));
  return hit ? hit.textContent.replace(/\\s+/g, ' ').trim() : 'missing';
})()`)

check('a bucket with nothing finished still appears, because that is a finding',
  (await bucketRow('Design System')) !== 'missing', await bucketRow('Design System'))

/* A finished task with no `done:` tag is stamped with today by
   stampDoneDates() on load — the clock has to start somewhere, and starting it
   now means nothing is archived before it has been sat with for thirty days.
   So it counts as finished today rather than being left out. */
check('a finished task with no done: date is stamped with today on load', await evalJS(`
  (() => { const t = state.doc.buckets.flatMap(b => b.tiers.flatMap(x => x.tasks))
    .find(t => t.title === 'Never dated');
    const d = new Date();
    const now = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    return t.doneOn === now })()
`))

// Three inside 30 days once the stamped one counts; the 45-day-old one is not.
check('only what finished inside the window is counted', await evalJS(`
  completedRecently().map(it => it.title).sort().join("|")
`) === 'Never dated|Recent large|Recent small', await evalJS(`
  completedRecently().map(it => it.title).sort().join("|")`))

/* Effort points rather than a count, which is the whole reason the column
   exists: two S and one L is 1 + 1 + 3 = 5 points across 3 tasks, and the two
   numbers being different is the point. */
check('the bucket is weighed by effort as well as counted',
  /5 pts/.test(await bucketRow('People')), await bucketRow('People'))

/* ---- weekly pace: line or bars ---- */

check('line is the chart at rest, and the tab says so', await evalJS(`(() => {
  const svg = document.querySelector('#countedOut .trendchart');
  const on = document.querySelector('#countedOut [data-trendtype].on');
  return !!svg.querySelector('.trendline') && !svg.querySelector('.trendbar') &&
    on?.dataset.trendtype === 'line';
})()`))

await evalJS(`document.querySelector('#countedOut [data-trendtype="bars"]').click()`)

check('switching draws bars instead, and moves the pressed tab', await evalJS(`(() => {
  const svg = document.querySelector('#countedOut .trendchart');
  const on = document.querySelector('#countedOut [data-trendtype].on');
  return !!svg.querySelector('.trendbar') && !svg.querySelector('.trendline') &&
    on?.dataset.trendtype === 'bars';
})()`))

await evalJS(`document.querySelector('#countedOut [data-trendtype="line"]').click()`)

check('and switching back reads as line again', await evalJS(`(() => {
  const svg = document.querySelector('#countedOut .trendchart');
  return !!svg.querySelector('.trendline') && !svg.querySelector('.trendbar');
})()`))

/* ---- changing the window ---- */

await evalJS(`window.__gets = []`)
await evalJS(`document.querySelector('#reportWindow button[data-window="60"]').click()`)
await new Promise(r => setTimeout(r, 500))
check('picking another window moves the pressed state', await evalJS(`
  document.querySelector('#reportWindow button.on')?.dataset.window
`) === '60')
check('and widens what is counted', await evalJS(`
  completedRecently().map(it => it.title).sort().join("|")
`) === 'Never dated|Older one|Recent large|Recent small', await evalJS(`
  completedRecently().map(it => it.title).sort().join("|")`))
check('the date range moves with it', await evalJS(`
  document.querySelector('#repDates')?.textContent
`) !== '', await evalJS(`document.querySelector('#repDates')?.textContent`))

/* The separation that is invisible on screen: the written column must not be
   re-fetched just because the counted one's window changed. */
check('changing the window does not re-read the written reports', await evalJS(`
  window.__gets.filter(u => u === '/reports.json').length
`) === 0, await evalJS(`window.__gets.join(' | ')`))

await evalJS(`document.querySelector('#reportWindow button[data-window="all"]').click()`)
await new Promise(r => setTimeout(r, 500))
check('All says what it is rather than printing a start date', await evalJS(`
  document.querySelector('#repDates')?.textContent
`) === 'everything still on record', await evalJS(`document.querySelector('#repDates')?.textContent`))

await evalJS(`document.querySelector('#reportWindow button[data-window="30"]').click()`)
await new Promise(r => setTimeout(r, 400))

/* ---- the written half ---- */

check('every report in the folder gets a row', await evalJS(`
  document.querySelectorAll('#writtenOut .repitem').length
`) === 2)
check('the head counts them', await evalJS(`
  document.querySelector('#writtenCol .colhead .count')?.textContent
`) === '2', await evalJS(`document.querySelector('#writtenCol .colhead .count')?.textContent`))
check('a row leads with its title and date', await evalJS(`
  document.querySelector('#writtenOut .reptitle')?.textContent === 'August in review' &&
  document.querySelector('#writtenOut .repdate')?.textContent === '1 Sep 2026'
`))
check('what it covers and what it is about sit under that', await evalJS(`
  document.querySelector('#writtenOut .repmeta')?.textContent
`) === 'Covers August · Design System', await evalJS(`
  document.querySelector('#writtenOut .repmeta')?.textContent`))
check('a report with no date, topic or summary drops those rows rather than drawing them empty',
  await evalJS(`
    document.querySelectorAll('#writtenOut .repitem')[1].querySelectorAll('.repdate, .repmeta, .repsum').length
  `) === 0)

await evalJS(`document.querySelector('#writtenOut [data-report-open]').click()`)
await new Promise(r => setTimeout(r, 500))
check('clicking one opens it as a document', await evalJS(`
  !!document.querySelector('.repdoc')
`))
check('and the document is fetched, not guessed', await evalJS(`
  window.__gets.some(u => u === '/data/reports/august.md')
`))
await evalJS(`closeModal ? closeModal() : document.querySelector('dialog[open]')?.close()`)

/* ---- the two ways the written half can fail ---- */

await evalJS(`window.__reports = []; renderWrittenReports()`)
await new Promise(r => setTimeout(r, 400))
check('an empty folder says how a report gets there', await evalJS(`
  /asking Claude for one/.test(document.querySelector('#writtenOut .empty')?.textContent || '')
`))

await evalJS(`window.__reportsStatus = 404; renderWrittenReports()`)
await new Promise(r => setTimeout(r, 400))
check('an older helper is named as the cause', await evalJS(`
  /board helper needs restarting/.test(document.querySelector('#writtenOut .err')?.textContent || '')
`))
await evalJS(`window.__reportsStatus = 0; window.__reports = [
  { title:'Back again', date:'', covers:'', topic:'', summary:'', url:'/data/reports/x.md' }]`)

/* ---- no document at all ---- */

await evalJS(`(() => { const d = state.doc; state.doc = null; renderReportsView(); state.__doc = d; })()`)
await new Promise(r => setTimeout(r, 300))
check('with no file loaded it says so rather than drawing empty reports', await evalJS(`
  /No file loaded yet/.test(document.querySelector('.rview .empty')?.textContent || '')
`))
await evalJS(`state.doc = state.__doc; renderReportsView()`)
await new Promise(r => setTimeout(r, 500))

/* ---- cancelled work is not finished work ---- */

check('a cancelled and an archived task both parse their tag off the line', await evalJS(`
  (() => {
    const all = [];
    state.doc.buckets.forEach(b => b.tiers.forEach(t => t.tasks.forEach(x => all.push(x))));
    const c = all.find(t => t.title === 'Called off');
    const a = all.find(t => t.title === 'No longer relevant');
    return !!c.cancelled && !c.archived && !!a.archived && !a.cancelled;
  })()
`))

/* Six ticked and dated — load() dates a ticked task that arrived without one —
   and four of them are work that was actually done. The two the tags mark are
   exactly the difference. */
check('and neither counts as finished, though both are ticked and dated', await evalJS(`
  (() => {
    const all = [];
    state.doc.buckets.forEach(b => b.tiers.forEach(t => t.tasks.forEach(x => all.push(x))));
    return all.filter(t => t.done && t.doneOn).length === 6 &&
           all.filter(countsAsFinished).length === 4;
  })()
`))

/* Three finished tasks are in the window, not five — the two cancellations are
   the whole point of the check. A count that includes them says work was done
   that nobody did, which is the thing the tag exists to stop. */
check('the counted lead counts the three real ones and leaves the two out', await evalJS(`
  /\\b3 tasks finished across\\b/.test(document.body.innerText.replace(/\\s+/g, ' '))
`), await evalJS(`(document.body.innerText.replace(/\\s+/g,' ').match(/\\d+ tasks? finished across \\d+ categor\\w+/) || ['—'])[0]`))

check('and neither shows up in the list of what was finished', await evalJS(`
  !/Called off|No longer relevant/.test(document.querySelector('.rview')?.innerText || '')
`))

/* ---- the point of the second guard ---- */

check('the reports view wrote nothing, which is all it should ever do',
  await evalJS(`window.__blocked.length === 0`), await evalJS(`window.__blocked.join(' | ')`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
