#!/usr/bin/env node
/* Backups, and the read-only preview it opens.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_backups.mjs
 *
 * The two are one surface — the Load button on a backup row is what opens the
 * preview — so they are one suite. Written 13 Sep 2026 because neither had any
 * coverage at all, which was found when the component port reached them: a view
 * can only be ported with confidence if checks written against the old markup
 * still pass against the new, and there were none to pass.
 *
 * Backup preview is the half that actually matters. It is not an ordinary view:
 * it puts somebody else's document into `state.doc` and relies on
 * `state.locked` to stop that document being written back over today's list.
 * CLAUDE.md's whole testing regime leans on that lock, and two real overwrites
 * of the live list have already happened. So the checks below are less about
 * what is drawn than about what cannot happen while it is up.
 *
 * Every fetch this suite needs is stubbed, `/data/todo.md` included — which is
 * not belt and braces. exitBackupPreview() calls loadFile(), and against a real
 * server that would pull the live twinkl list into the tab; stubbing it keeps
 * the real document out of the browser entirely rather than trusting the lock
 * that is itself the thing under test.
 */
import { spawn } from 'node:child_process'

const PORT = 9453
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-backups-test-profile', '--window-size=1400,1000',
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
check('the board loaded', await evalJS(`typeof renderBackupsView === 'function'`))
check('and the preview half with it', await evalJS(`typeof loadBackupPreview === 'function'`))

// LOCK FIRST, then fixtures. Nothing below can write anything.
await evalJS(`(() => {
  state.locked = true; state.lockedLabel = 'test';
  const real = window.fetch;
  window.__blocked = [];
  window.__alerts = [];
  window.alert = m => window.__alerts.push(String(m));

  const days = n => new Date(Date.now() - n * 86400000).toISOString();
  window.__backups = {
    backups: [
      { name:'todo-week-2026-W37.md', kind:'weekly', bytes:2048, modified: days(1),
        url:'/data/backups/todo-week-2026-W37.md' },
      { name:'todo-week-2026-W36.md', kind:'weekly', bytes:512, modified: days(9),
        url:'/data/backups/todo-week-2026-W36.md' },
      { name:'todo-backup-0931.md', kind:'session', bytes:120000, modified: days(3),
        url:'/data/backups/todo-backup-0931.md' }
    ],
    archive: { name:'done-archive.md', bytes:4096, modified: days(2), sections: 3,
               url:'/data/done-archive.md' },
    week: '2026-W37',
    keep: { session: 10, weekly: 8 }
  };
  window.__backupStatus = 0;

  /* A real list, but not his: what the Load button pulls in.

     Every task carries an explicit \`id:\`, and that is not decoration. The
     board mints a stable id for any task without one at load time and marks
     the document dirty so the ids get written back — correct behaviour, and on
     a fixture it means the tab wants to save a file this suite invented the
     moment the preview is left. Pre-stamping them leaves nothing to mint. */
  window.__backupText = [
    '# To-do', '', '## 1. Tasks', '', '### To do', '',
    '- [ ] Something from last week \`id:aa11aa\` [bucket:: Strategic]',
    '- [ ] Another thing \`id:bb22bb\` [bucket:: People]', ''
  ].join('\\n');
  // What loadFile() gets on the way back out. Deliberately different from the
  // backup above, so "did it leave the preview" is answerable from the content.
  window.__todayText = [
    '# To-do', '', '## 1. Tasks', '', '### To do', '',
    '- [ ] Today\\'s only task \`id:cc33cc\` [bucket:: People]', ''
  ].join('\\n');

  const json = (body, status) => Promise.resolve(new Response(JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } }));
  const text = body => Promise.resolve(new Response(body,
    { status: 200, headers: { 'Content-Type': 'text/markdown' } }));

  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') {
      window.__blocked.push(method + ' ' + url + ' ' + ((opts && opts.body) || ''));
      return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
    }
    const u = String(url);
    if (u.startsWith('/backups.json')) {
      if (window.__backupStatus) return json({ error: 'no' }, window.__backupStatus);
      return json(window.__backups, 200);
    }
    if (u.startsWith('/data/backups/')) return text(window.__backupText);
    // loadFile()'s own read, stubbed so the live list never reaches this tab.
    if (u.startsWith('/data/todo.md')) return text(window.__todayText);
    return real(url, opts);
  };

  load(window.__todayText, 'demo.md', {});
  state.locked = true;
})()`)
check('the tab is locked', await evalJS(`state.locked === true`))

/* ---- the list itself ---- */

await evalJS(`renderBackupsView()`)
await new Promise(r => setTimeout(r, 500))

check('every group is drawn', await evalJS(`
  [...document.querySelectorAll('#backupsOut h2')].map(h => h.textContent).join('|')
`) === 'Archived finished work|Weekly snapshots|Recent sessions')

check('the archive is first, before any backup',
  await evalJS(`document.querySelector('#backupsOut h2').textContent`) === 'Archived finished work')

check('every file gets a row, the archive included',
  await evalJS(`document.querySelectorAll('#backupsOut .row').length`) === 4)

// The count in the head has to include the archive, which is not in `backups`.
check('the head counts the archive as one of them',
  await evalJS(`document.querySelector('#backupsCol .colhead .count')?.textContent`) === '4',
  await evalJS(`document.querySelector('#backupsCol .colhead .count')?.textContent`))

check('a weekly snapshot is tagged by its week rather than its file name', await evalJS(`
  [...document.querySelectorAll('#backupsOut .row .tag')].map(t => t.textContent).join('|')
`) === 'never pruned|Week 37, 2026|Week 36, 2026|session')

// Weekly ones sort by their week label, not their timestamp: a snapshot copied
// late still belongs to its own week.
check('weekly snapshots read newest week first', await evalJS(`
  [...document.querySelectorAll('#backupsOut .row .name')].map(n => n.textContent).join('|')
`) === 'done-archive.md|todo-week-2026-W37.md|todo-week-2026-W36.md|todo-backup-0931.md')

check('sizes read as sizes', await evalJS(`
  [...document.querySelectorAll('#backupsOut .row .size')].map(s => s.textContent).join('|')
`) === '4.0 KB|2.0 KB|512 B|117 KB', await evalJS(`
  [...document.querySelectorAll('#backupsOut .row .size')].map(s => s.textContent).join('|')`))

check('and ages read in words', await evalJS(`
  [...document.querySelectorAll('#backupsOut .row .ago')].map(s => s.textContent).join('|')
`) === '2 days ago|yesterday|last week|3 days ago', await evalJS(`
  [...document.querySelectorAll('#backupsOut .row .ago')].map(s => s.textContent).join('|')`))

check('the archive says how many batches it holds', await evalJS(`
  /3 batches/.test(document.querySelector('#backupsOut .help')?.textContent || '')
`))

check('the archive row offers no Load, since it is not a list', await evalJS(`
  !document.querySelector('#backupsOut .row:first-of-type [data-load-url]')
`))

check('the note says what is kept and what is deleted', await evalJS(`
  /last 10 session backups and the last 8 weekly/.test(
    document.querySelector('#backupsOut .listnote')?.textContent || '')
`))

/* ---- the two ways it can fail ---- */

await evalJS(`window.__backupStatus = 404; renderBackupsView()`)
await new Promise(r => setTimeout(r, 400))
check('an older helper is named as the cause, with the command to fix it', await evalJS(`
  /board helper needs restarting/.test(document.querySelector('#backupsOut .err')?.textContent || '') &&
  /lsof -ti tcp:8765/.test(document.querySelector('#backupsOut .err')?.textContent || '')
`))

await evalJS(`window.__backupStatus = 500; renderBackupsView()`)
await new Promise(r => setTimeout(r, 400))
check('any other failure says so plainly instead', await evalJS(`
  /Could not read the backup list/.test(document.querySelector('#backupsOut .err')?.textContent || '')
`))

await evalJS(`window.__backupStatus = 0; renderBackupsView()`)
await new Promise(r => setTimeout(r, 400))

/* ---- the preview, which is the half that matters ----
   Everything below is about one property: a document that is not today's list
   is in the tab, and nothing may write it back. */

await evalJS(`(() => { state.locked = false; state.lockedLabel = ''; state.dirty = true; })()`)
await evalJS(`document.querySelector('#backupsOut [data-load-url]').click()`)
await new Promise(r => setTimeout(r, 400))
check('a backup will not load over unsaved work', await evalJS(`state.locked === false`))
check('and it says why rather than failing quietly', await evalJS(`
  window.__alerts.some(a => /unsaved changes/.test(a))
`))

await evalJS(`state.dirty = false; document.querySelector('#backupsOut [data-load-url]').click()`)
await new Promise(r => setTimeout(r, 500))
check('with nothing unsaved it loads', await evalJS(`state.locked === true`))
check('the backup is what is in the tab now', await evalJS(`
  state.doc.buckets.flatMap(b => b.tiers.flatMap(t => t.tasks.map(x => x.title))).join('|')
`) === 'Something from last week|Another thing')
check('the bar says which file is being read', await evalJS(`
  /Week 37, 2026/.test($('#lockBarLabel').textContent)
`), await evalJS(`$('#lockBarLabel').textContent`))
check('and that nothing in it can be edited', await evalJS(`
  /nothing here can be edited or saved/.test($('#lockBarLabel').textContent)
`))
check('the frame and the bar are both showing', await evalJS(`
  !$('#lockFrame').classList.contains('hidden') && !$('#lockBar').classList.contains('hidden')
`))
check('it is named as a Backup Preview rather than example data', await evalJS(`
  $('#lockBarKind').textContent === 'Backup Preview'
`))
check('the Data menu is out of reach while it is up', await evalJS(`
  $('#dataMenu').classList.contains('hidden')
`))

/* The guards, one by one. Each of these is a writer that has to check the lock
   before doing anything, and each is the sort of thing a refactor quietly
   drops. */
check('ticking a task off does nothing', await evalJS(`
  (() => { const t = state.doc.buckets[0].tiers[0].tasks[0];
    const was = t.done; const moved = setDone(t, !was);
    return moved === false && t.done === was })()
`))
check('and the document is still clean afterwards', await evalJS(`state.dirty !== true`))

/* Both of these have to make the document dirty first, and that is the whole
   point of them. saveFile() and autosaveTick() each return early on
   !state.dirty as well as on state.locked, so a check that calls them against
   a clean document passes whether the lock guard is there or not — which is
   what the first draft of this suite did, and it did not notice the lock being
   removed. autosaveTick() also has a rate gate, so lastSaveAt is wound back
   too, or it returns on the clock instead of on the lock.

   Checked by mutation, and one result is worth writing down: taking the lock
   guard out of saveFile() fails three of these, and taking it out of setDone()
   fails another — but taking it out of autosaveTick() fails nothing, because
   autosaveTick() calls saveFile() and that guard still holds. The outer one is
   defence in depth rather than the thing doing the work. Keep it anyway; the
   point is that saveFile() is where the lock actually bites, so that is the
   guard to be careful with. */
check('saving is refused outright', await evalJS(`
  (async () => { state.dirty = true; await saveFile();
    const n = window.__blocked.length; state.dirty = false; return n })()
`) === 0, await evalJS(`window.__blocked.join(' | ')`))

check('and so is the autosave that runs on a timer', await evalJS(`
  (async () => { state.dirty = true; lastSaveAt = 0; await autosaveTick();
    const n = window.__blocked.length; state.dirty = false; return n })()
`) === 0, await evalJS(`window.__blocked.join(' | ')`))

/* ---- and back out again ---- */

await evalJS(`$('#exitLock').click()`)
await new Promise(r => setTimeout(r, 600))
check('leaving the preview unlocks the tab', await evalJS(`state.locked === false`))
check('the frame and bar are gone with it', await evalJS(`
  $('#lockFrame').classList.contains('hidden') && $('#lockBar').classList.contains('hidden')
`))
check('the Data menu is back', await evalJS(`!$('#dataMenu').classList.contains('hidden')`))
// Re-read from disk rather than restored from memory: simplest, and no live
// edit can be lost from a mode that never allowed one.
check('and today’s list is re-read rather than restored', await evalJS(`
  state.doc.buckets.flatMap(b => b.tiers.flatMap(t => t.tasks.map(x => x.title))).join('|')
`) === "Today's only task", await evalJS(`
  state.doc.buckets.flatMap(b => b.tiers.flatMap(t => t.tasks.map(x => x.title))).join('|')`))

/* ---- a backup that is not a list ---- */

await evalJS(`(() => { state.locked = false; window.__backupText = 'not a to-do file at all';
  window.__alerts = []; })()`)
await evalJS(`loadBackupPreview('/data/backups/todo-week-2026-W37.md', 'a broken one')`)
await new Promise(r => setTimeout(r, 400))
check('a file with no buckets in it is refused', await evalJS(`state.locked === false`))
check('and it says so rather than showing an empty board', await evalJS(`
  window.__alerts.some(a => /no task buckets/.test(a))
`), await evalJS(`window.__alerts.join(' | ')`))

/* ---- the point of the second guard ---- */

check('nothing in this whole suite wrote anything', await evalJS(`
  window.__blocked.length === 0
`), await evalJS(`window.__blocked.join(' | ')`))

ws.close()
chrome.kill()
const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
