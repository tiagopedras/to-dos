/**
 * Drives the Projects tab and the project drawer in headless Chrome.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_projects.mjs
 *
 * Same two guards as test_canvas.mjs, for the same reason — this repo has lost
 * the real todo.md to a test twice:
 *
 *   1. The tab is locked before any fixture is loaded. A locked tab cannot save.
 *   2. Every non-GET is torn out of `fetch` and recorded instead of sent, so
 *      there is no path from here to disk even if something unlocks the tab.
 *
 * Neither half of this view writes anything at all, which is the last check
 * below: a project is a folder, the panel reads it, and the only thing on
 * screen that changes anything is a task row that hands over to the drawer.
 *
 * /projects.json and /project.json are both stubbed, so this needs no folder
 * under data/projects/ to exist and never reads the real one.
 */

import { spawn } from 'node:child_process'

const PORT = 9449
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-projects-test-profile', '--window-size=1400,1000',
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
check('the board loaded', await evalJS(`typeof renderProjectsView === 'function'`))
check('and the drawer half of it too', await evalJS(`typeof openProjectDrawer === 'function'`))

// LOCK FIRST, then fixtures. Nothing below can write anything.
await evalJS(`(() => {
  state.locked = true; state.lockedLabel = 'test';
  const real = window.fetch;
  window.__blocked = [];
  // Two folders on disk: one every task in the fixture points at, one nothing
  // does. Live vs orphaned is worked out in the board rather than the server,
  // so both sides of that rule need a folder to stand on.
  const today = new Date(); today.setHours(9, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  window.__projects = [
    { name:'aop2027', title:'AOP2027', blurb:'Twinkl\\'s FY27 Annual Operating Plan.',
      opened:'26 Aug 2026', has_claude_md:true, file_count:4,
      modified: yesterday.toISOString(), url:'/data/projects/aop2027/' },
    { name:'nobody-here', title:'', blurb:'', opened:'', has_claude_md:false, file_count:1,
      modified:'2026-08-01T09:00:00', url:'/data/projects/nobody-here/' }
  ];
  window.__entries = [
    { name:'sources', dir:true, size:null, children:3, modified:'2026-09-01T10:00:00' },
    { name:'CLAUDE.md', dir:false, size:6528, children:null, modified:'2026-09-06T15:13:10' },
    { name:'redefinition brief.md', dir:false, size:1400000, children:null, modified:'2026-09-06T15:13:10' },
    { name:'notes.txt', dir:false, size:900, children:null, modified:'2026-09-06T15:13:10' }
  ];
  // The one the two "it broke" checks swap out. Absent means answer normally.
  window.__projectStatus = 0;
  const json = (body, status) => Promise.resolve(new Response(JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } }));
  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') {
      window.__blocked.push(method + ' ' + url + ' ' + ((opts && opts.body) || ''));
      return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
    }
    const u = String(url);
    if (u.startsWith('/projects.json')) return json({ projects: window.__projects }, 200);
    if (u.startsWith('/project.json')) {
      if (window.__projectStatus) return json({ error: 'no' }, window.__projectStatus);
      return json(Object.assign({ entries: window.__entries },
        window.__about || { name:'aop2027', title:'The AOP for 2027', opened:'26 Aug 2026',
          blurb:'Twinkl\\'s FY27 Annual Operating Plan, and the design initiative inside it.',
          file_count: 4, modified: yesterday.toISOString() }), 200);
    }
    return real(url, opts);
  };
  const md = [
    '# To-do', '', '## 1. Tasks', '', '### To do', '',
    '- [ ] Write the AOP deck [bucket:: Strategic] [due:: 2026-09-12]',
    '  - Project: data/projects/aop2027',
    '- [x] Review the AOP wording [bucket:: People]',
    '  - Project: data/projects/aop2027', ''
  ].join('\\n');
  load(md, 'demo.md', {});
  state.locked = true;
})()`)
check('the tab is locked', await evalJS(`state.locked === true`))

/* ---- the Projects tab ---- */

await evalJS(`renderProjectsView()`)
await new Promise(r => setTimeout(r, 500))
check('both folders are listed, on disk order', await evalJS(`
  [...document.querySelectorAll('#projectsOut .reptitle')].map(e => e.textContent).join(',')
`) === 'aop2027,nobody-here')
check('a folder a task points at is Live', await evalJS(`
  !!document.querySelector('#projectsOut .repitem:first-child .projlive')
`))
check('and one nothing points at is Orphaned', await evalJS(`
  !!document.querySelector('#projectsOut .repitem:last-child .projorphan')
`))
check('the file count is shown', await evalJS(`
  /4 files/.test(document.querySelector('#projectsOut .repmeta').textContent)
`))
check('a missing CLAUDE.md is called out', await evalJS(`
  /no CLAUDE.md/.test(document.querySelectorAll('#projectsOut .repmeta')[1].textContent)
`))
check('and when it was last edited, in words', await evalJS(`
  /edited yesterday/.test(document.querySelector('#projectsOut .repmeta').textContent)
`), await evalJS(`document.querySelector('#projectsOut .repmeta').textContent`))
check('the card says what the project is', await evalJS(`
  /FY27 Annual Operating Plan/.test(document.querySelector('#projectsOut .projcardblurb')?.textContent || '')
`))
check('a folder with no CLAUDE.md gets no blurb rather than an empty one', await evalJS(`
  document.querySelectorAll('#projectsOut .projcardblurb').length === 1
`))

/* ---- the drawer, which is where the folder's own contents show ---- */

await evalJS(`openProjectDrawer('aop2027')`)
await new Promise(r => setTimeout(r, 600))
check('the drawer opens on the project', await evalJS(`state.openProject === 'aop2027'`))
check('the folder path is itself a link to the folder', await evalJS(`
  document.querySelector('a.projpath')?.getAttribute('href') === '/data/projects/aop2027/'
`))

// The description at the top, read out of the folder's own CLAUDE.md rather
// than typed into the board anywhere.
check('the panel opens with what the project is', await evalJS(`
  /FY27 Annual Operating Plan/.test(document.querySelector('#projAbout .projblurb')?.textContent || '')
`))
check('a CLAUDE.md title unlike the folder name is shown', await evalJS(`
  document.querySelector('#projAbout .projname')?.textContent === 'The AOP for 2027'
`))
check('opened and edited sit under it', await evalJS(`
  document.querySelector('#projAbout .projwhen')?.textContent
`) === 'Opened 26 Aug 2026 · Edited yesterday')
check('and the description is above the files, not below them', await evalJS(`
  !!(document.querySelector('#projAbout').compareDocumentPosition(document.querySelector('#projFiles'))
     & Node.DOCUMENT_POSITION_FOLLOWING)
`))
check('both halves are titled', await evalJS(`
  [...document.querySelectorAll('#dbody .field > span:first-child')].map(s => s.textContent).join('|')
`) === 'Files in this folder|Tasks on this project')

const rows = await evalJS(`[...document.querySelectorAll('#projFiles .projfile')].map(a =>
  a.querySelector('.pf').textContent + ' | ' + a.querySelector('.pfm').textContent +
  ' | ' + a.getAttribute('href'))`)
check('every entry is a row', rows.length === 4, rows.join(' / '))
// One level deep and no further: a sub-folder is one row carrying its own
// count, not ten rows of somebody else's filing.
check('a sub-folder is one row, counting what is inside it',
      rows[0].startsWith('sources/') && rows[0].includes('3 items'))
check('and it links one level in, where the browser lists the rest',
      rows[0].endsWith('/data/projects/aop2027/sources/'))
check('folders sort above files', await evalJS(`
  [...document.querySelectorAll('#projFiles .projfile')]
    .findIndex(a => !a.classList.contains('isdir')) === 1
`))
check('sizes read as sizes', rows[1].includes('6 KB') && rows[2].includes('1.3 MB') &&
      rows[3].includes('900 B'))
check('a space in a name is encoded in the href', rows[2].includes('redefinition%20brief.md'))
check('every row opens in a new tab, so the board keeps its own', await evalJS(`
  [...document.querySelectorAll('#projFiles .projfile')].every(a => a.target === '_blank')
`))
check('the task rows are still under it', await evalJS(`
  document.querySelectorAll('#dbody .projrow').length === 2
`))

// A folder with no CLAUDE.md in it: the one field here nothing on disk
// guarantees, so the panel says what would fill it rather than sitting blank.
await evalJS(`window.__about = { name:'aop2027', title:'', blurb:'', opened:'',
  modified:'2026-08-01T09:00:00' }`)
await evalJS(`openProjectDrawer('aop2027')`)
await new Promise(r => setTimeout(r, 500))
check('a folder with no CLAUDE.md says what would describe it', await evalJS(`
  /Nothing describes this folder yet/.test(document.querySelector('#projAbout')?.textContent || '')
`))
check('and still says when it was last edited', await evalJS(`
  document.querySelector('#projAbout .projwhen')?.textContent === 'Edited 1 Aug'
`), await evalJS(`document.querySelector('#projAbout .projwhen')?.textContent`))
await evalJS(`window.__about = null`)

// A folder that has gone from disk since the list was drawn.
await evalJS(`window.__projectStatus = 404`)
await evalJS(`openProjectDrawer('aop2027')`)
await new Promise(r => setTimeout(r, 500))
check('a folder that is gone says so rather than spinning', await evalJS(`
  /not on disk/.test(document.querySelector('#projFiles')?.textContent || '')
`), await evalJS(`document.querySelector('#projFiles')?.textContent`))

// A helper that predates the route — the symptom CLAUDE.md names.
await evalJS(`window.__projectStatus = 501`)
await evalJS(`openProjectDrawer('aop2027')`)
await new Promise(r => setTimeout(r, 500))
check('an older helper is named as the cause', await evalJS(`
  /needs restarting/.test(document.querySelector('#projFiles')?.textContent || '')
`))

/* ---- the way back, from a task to the project it belongs to ----
   Opening a task card from the project panel was a one-way trip: the task
   drawer named its project ninth in the left-hand column, below the fold, and
   after this change does not name it there at all. It is a card in the second
   column now, beside the conversations. */

// The two failure cases above left the stub answering 501 to everything.
await evalJS(`window.__projectStatus = 0`)
const taskId = await evalJS(`(() => {
  let found = '';
  state.doc.buckets.forEach(b => b.tiers.forEach(t => t.tasks.forEach(x => {
    if (!found && taskProject(x) === 'aop2027') found = x.id;
  })));
  return found;
})()`)
check('the fixture has a task on the project', !!taskId)
await evalJS(`openDrawer(${JSON.stringify(taskId)})`)
await new Promise(r => setTimeout(r, 600))

check('the task drawer leads its second column with the project', await evalJS(`
  document.querySelector('.dcol-side > details > summary')?.textContent.trim()
`) === 'Project')
check('the project is gone from the left-hand column', await evalJS(`
  !document.querySelector('.dcol-main [data-project]')
`))
check('the card names the folder', await evalJS(`
  document.querySelector('#taskProjCard .pctitle')?.textContent === 'aop2027'
`))
check('and fills in what it is and when it was touched', await evalJS(`
  /FY27 Annual Operating Plan/.test(document.querySelector('#taskProjBlurb')?.textContent || '') &&
  document.querySelector('#taskProjWhen')?.textContent === '4 files · edited yesterday'
`), await evalJS(`document.querySelector('#taskProjWhen')?.textContent`))

// One shape for every section in that column — the whole point of the change.
check('every section in the column is the same kind of section', await evalJS(`
  [...document.querySelectorAll('.dcol-side > *')].every(el =>
    el.tagName === 'HR' ||
    (el.tagName === 'DETAILS' && el.classList.contains('field') &&
     el.classList.contains('sugg') && !!el.querySelector(':scope > summary')))
`), await evalJS(`[...document.querySelectorAll('.dcol-side > *')].map(e => e.tagName + '.' + e.className).join(' / ')`))
check('and none of them still draws the packaged heading', await evalJS(`
  !document.querySelector('.dcol-side .aic-field, .dcol-side .aic-sublabel')
`))

// Clicking it lands on the project panel this file's first half tests.
await evalJS(`document.querySelector('#taskProjCard .pcbody').click()`)
await new Promise(r => setTimeout(r, 500))
check('clicking the card opens the project', await evalJS(`state.openProject === 'aop2027'`))
check('and the task panel is behind it, not gone', await evalJS(`state.openTask === null`))

/* ---- the point of the second guard ---- */

check('nothing in this whole view wrote anything', await evalJS(`
  window.__blocked.length === 0
`), await evalJS(`window.__blocked.join(' | ')`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
