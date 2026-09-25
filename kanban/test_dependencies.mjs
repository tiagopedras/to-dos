#!/usr/bin/env node
/* Dependencies — setting and clearing `blocked-by:` from the drawer.
 *
 *   scripts/test-board.sh test_dependencies.mjs
 *
 * Waiting on writes onto this task, Blocks onto the other one, a missing slug
 * is minted from the title, × removes from whichever line holds the tag, one
 * undo reverts each change, and a direct loop is refused with a toast. The
 * tab is locked before the fixture loads, and every write is torn out of
 * `fetch`, so nothing reaches todo.md even while it is unlocked for the edits.
 */
import { spawn } from 'node:child_process'

const PORT = Number(process.env.CDP_PORT) || 9497
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_dependencies.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-deps-test-profile'}`, '--window-size=1400,1000',
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
  check('the board loaded', await evalJS(`typeof addDependency === 'function' && typeof openDepPicker === 'function'`))

  // LOCK FIRST, then the fixture. Writes are torn out of fetch, so even once
  // the tab is unlocked for the edits below nothing reaches todo.md.
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
      '- [ ] **Write the brief** \`#brief\` \`id:aaaaa1\`',
      '  - [ ] Collect the notes \`id:aaaas1\`',
      '- [ ] **Review the draft** \`id:bbbbb1\`',
      '- [ ] **Ship it** \`blocked-by:brief\` \`id:ccccc1\`',
      ''
    ].join('\\n'), 'demo.md', {});
    state.locked = true;
  })()`)
  check('the tab is locked', await evalJS(`state.locked === true`))

  const helpers = `
    window.__task = title => state.doc.buckets.flatMap(b => b.tiers).flatMap(x => x.tasks).find(t => t.title === title);
    window.__line = title => serializeDoc(state.doc).split('\\n').find(l => l.includes(title)) || '';
  `
  await evalJS(helpers)
  const line = title => evalJS(`__line(${JSON.stringify(title)})`)
  const openOn = title => evalJS(`openDrawer(__task(${JSON.stringify(title)}).id)`)
  const settle = () => new Promise(r => setTimeout(r, 750))   // past UNDO_GAP_MS, so each edit is its own step

  /* ---- read-only when locked ---- */
  await openOn('Write the brief')
  check('a locked tab shows the section without Add or ×',
    await evalJS(`!document.querySelector('#dbody [data-depadd]') && !document.querySelector('#dbody [data-depremove]')`))
  check('and still lists what this blocks', await evalJS(`[...document.querySelectorAll('#dbody .deplink')].some(b => b.textContent.includes('Ship it'))`))

  await evalJS(`state.locked = false; resetUndo()`)
  await openOn('Write the brief')
  check('unlocked, both lists get an Add', await evalJS(`document.querySelectorAll('#dbody [data-depadd]').length`) === 2)
  check('and the existing entry gets a ×', await evalJS(`document.querySelectorAll('#dbody [data-depremove="blocks"]').length`) === 1)

  /* ---- Waiting on: writes onto this task, minting the other one's slug ---- */
  await evalJS(`document.querySelector('#dbody [data-depadd="waiting"]').click()`)
  check('Add opens the search-and-pick dialog', await evalJS(`!!document.querySelector('.deppick .attachpick-search')`))
  check('it leaves out this task and what is already linked', await evalJS(`
    [...document.querySelectorAll('.deppick .attachpick-row .attachpick-title')].map(e => e.textContent).join('|')`) ===
    'Collect the notes|Review the draft|Ship it')
  await evalJS(`(() => { const s = document.querySelector('.deppick .attachpick-search'); s.value = 'draft'; s.oninput(); })()`)
  check('typing filters the list', await evalJS(`document.querySelectorAll('.deppick .attachpick-row').length`) === 1)
  await evalJS(`document.querySelector('.deppick .attachpick-row').click()`)
  check('picking closes the dialog', await evalJS(`!document.querySelector('.deppick')`))
  check('the other task gets a slug minted from its title', /`#review-draft`/.test(await line('Review the draft')), await line('Review the draft'))
  check('and this task waits on it', /`blocked-by:review-draft`/.test(await line('Write the brief')), await line('Write the brief'))
  check('the drawer redraws with it listed', await evalJS(`[...document.querySelectorAll('#dbody [data-depremove="waiting"]')].length`) === 1)
  await settle()

  /* ---- undo reverts slug and tag together ---- */
  await evalJS(`undo()`)
  check('one undo takes both the tag and the minted slug back',
    !/blocked-by/.test(await line('Write the brief')) && !/#review-draft/.test(await line('Review the draft')),
    (await line('Write the brief')) + ' / ' + (await line('Review the draft')))
  await settle()

  /* ---- Blocks: writes onto the other task ---- */
  await openOn('Write the brief')
  await evalJS(`document.querySelector('#dbody [data-depadd="blocks"]').click()`)
  check('the Blocks picker leaves out what already waits on this', await evalJS(`
    [...document.querySelectorAll('.deppick .attachpick-row .attachpick-title')].map(e => e.textContent).join('|')`) ===
    'Collect the notes|Review the draft')
  await evalJS(`[...document.querySelectorAll('.deppick .attachpick-row')].find(r => r.textContent.includes('Review the draft')).click()`)
  check('Blocks writes blocked-by onto the other task', /`blocked-by:brief`/.test(await line('Review the draft')), await line('Review the draft'))
  check('and leaves this one alone', !/blocked-by/.test(await line('Write the brief')))
  check('the drawer lists both it blocks', await evalJS(`document.querySelectorAll('#dbody [data-depremove="blocks"]').length`) === 2)
  await settle()

  /* ---- a sub-step as the other end ---- */
  await openOn('Review the draft')
  await evalJS(`document.querySelector('#dbody [data-depadd="waiting"]').click()`)
  await evalJS(`[...document.querySelectorAll('.deppick .attachpick-row')].find(r => r.textContent.includes('Collect the notes')).click()`)
  check('a sub-step picked gets its slug on its own line', /Collect the notes `#collect-notes`/.test(await line('Collect the notes')), await line('Collect the notes'))
  check('and the task waits on it', /blocked-by:brief,collect-notes/.test(await line('Review the draft')), await line('Review the draft'))
  await settle()

  /* ---- remove, both directions ---- */
  await evalJS(`[...document.querySelectorAll('#dbody [data-depremove="waiting"]')].find(b => b.dataset.depSlug === 'collect-notes').click()`)
  check('× on Waiting on removes it from this line', /`blocked-by:brief`/.test(await line('Review the draft')) && !/collect-notes`/.test(await line('Review the draft')), await line('Review the draft'))
  await settle()
  await openOn('Write the brief')
  await evalJS(`[...document.querySelectorAll('#dbody .depitem')].find(li => li.textContent.includes('Ship it')).querySelector('[data-depremove]').click()`)
  check('× on Blocks removes it from the other task\'s line', !/blocked-by/.test(await line('Ship it')), await line('Ship it'))
  check('and leaves the other entry', /`blocked-by:brief`/.test(await line('Review the draft')))
  await settle()
  await evalJS(`undo()`)
  check('one undo puts the removed one back', /`blocked-by:brief`/.test(await line('Ship it')), await line('Ship it'))
  await settle()

  /* ---- a direct cycle is refused ---- */
  const before = await evalJS(`serializeDoc(state.doc)`)
  await openOn('Ship it')
  await evalJS(`document.querySelector('#dbody [data-depadd="blocks"]').click()`)
  await evalJS(`[...document.querySelectorAll('.deppick .attachpick-row')].find(r => r.textContent.includes('Write the brief')).click()`)
  check('a loop is refused with a toast', await evalJS(`[...document.querySelectorAll('#toasts .toast')].some(t => /loop/.test(t.textContent))`))
  check('and writes nothing', await evalJS(`serializeDoc(state.doc)`) === before)
  await evalJS(`document.querySelector('.deppick') && document.querySelector('.deppick').remove()`)
  check('the direct call refuses it too', await evalJS(`addDependency(__task('Write the brief'), -1, 'waiting', { task: __task('Ship it'), line: -1 })`) === 'cycle')

  await evalJS(`state.locked = true`)
  // The autosave did fire once unlocked; it was caught above. What is on disk
  // is still the seeded list, with none of the fixture in it.
  check('nothing reached todo.md', !(await evalJS(`fetch('/data/todo.md?t=' + Date.now(), { cache: 'no-store' }).then(r => r.text())`)).includes('Write the brief'))
} finally {
  ws.close()
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
