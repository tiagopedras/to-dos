#!/usr/bin/env node
/* The phone. Three things the board does only at 400px, and nothing above it.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_phone.mjs
 *
 * Written 15 Sep 2026, alongside the three entries in IMPROVEMENTS.md it
 * covers. Drag and drop does not fire on touch and a touch screen never
 * hovers, so a board that is only ever checked at desktop width quietly ships
 * controls a phone cannot reach:
 *
 *   1. Every column is the screen's width and snaps, so nothing says which one
 *      is on screen or how many there are. renderColTabs() (18-timeline.js)
 *      draws the strip; this asserts it names the columns the board drew, that
 *      it lights the one actually on screen, and that tapping one moves there.
 *   2. Moving a card means the drawer's Column field, and six .stepstop labels
 *      across 340px is not a target anyone can hit. It is a native <select>
 *      under 640px and the slider above it — both halves are asserted, at both
 *      widths, because a rule that showed neither or both would pass a test
 *      that only ever looked at one.
 *   3. .sortbtn sits at 55% opacity until .tenon-column:hover, which on a phone means
 *      always, so the control reads as disabled.
 *
 * Both widths run the same checks, so the CSS breakpoint is what is under test
 * rather than one side of it. Same two guards as every other board test: the
 * tab is locked before any fixture is loaded, and every non-GET is torn out of
 * fetch and recorded instead of sent.
 */
import { spawn } from 'node:child_process'

const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

/* The fixture's tier is To do rather than Done: a bucket whose only tier is
   called Done gives the board two columns of that name, since Done is also one
   of the fixed ones, and the strip would then name it twice for a reason that
   has nothing to do with what is being tested. */
const FIXTURE = [
  '# To-do', '', '## 1. People', '', '### To do', '',
  '- [ ] Alpha [impact:: high] [effort:: M]',
  '- [ ] Beta [impact:: low] [effort:: S]', '', '### Doing', ''
].join('\n')

async function run (label, width, height) {
  const port = 9480 + (width < 700 ? 0 : 1)
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', `--remote-debugging-port=${port}`, '--no-first-run',
    `--user-data-dir=/tmp/todo-phone-test-${width}`, `--window-size=${width},${height}`,
    `http://127.0.0.1:${BOARD}/kanban/index.html`
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  const target = async () => {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/list`)
        const t = (await r.json()).find(t => t.type === 'page' && t.url.includes('index.html'))
        if (t?.webSocketDebuggerUrl) return t.webSocketDebuggerUrl
      } catch {}
      await new Promise(r => setTimeout(r, 250))
    }
    throw new Error('no page')
  }
  const ws = new WebSocket(await target())
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
  const evalJS = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 500))
    return r.result?.result?.value
  }

  const phone = width < 700
  const at = s => `${label}: ${s}`

  await new Promise(r => setTimeout(r, 2500))
  check(at('the board loaded'), await evalJS(`typeof renderColTabs === 'function'`))

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
    load(${JSON.stringify(FIXTURE)}, 'demo.md', {});
    state.locked = true;
  })()`)
  check(at('the tab is locked'), await evalJS(`state.locked === true`))

  await evalJS(`document.querySelector('#main').scrollLeft = 0; state.view = 'board'; renderView()`)
  await new Promise(r => setTimeout(r, 300))

  /* ---- 1. the column strip ---- */

  const named = await evalJS(`[...document.querySelectorAll('#colTabs .coltab')].map(b => b.textContent).join('|')`)
  const drawn = await evalJS(`[...document.querySelector('#board').children].map(c => c.dataset.tier).join('|')`)
  check(at('the strip names exactly the columns the board drew, in that order'), named === drawn, named)

  check(at('and it is drawn at phone width only'),
    await evalJS(`getComputedStyle(document.querySelector('#colTabs')).display`) === (phone ? 'flex' : 'none'))

  if (phone) {
    check(at('the lit tab is the column on screen'),
      await evalJS(`document.querySelector('#colTabs .coltab').classList.contains('on')`))
    /* Scrolling relights it with no render in between — the listener is what
       keeps the strip honest while a swipe is happening. */
    await evalJS(`(async () => {
      document.querySelector('#main').scrollLeft = document.querySelector('#board').children[1].offsetLeft;
      await new Promise(r => setTimeout(r, 150));
    })()`)
    check(at('scrolling to the next column lights its tab'),
      await evalJS(`[...document.querySelectorAll('#colTabs .coltab')].findIndex(b => b.classList.contains('on'))`) === 1)
    await evalJS(`document.querySelectorAll('#colTabs .coltab')[2].click()`)
    check(at('and tapping a tab lights that one'),
      await evalJS(`[...document.querySelectorAll('#colTabs .coltab')].findIndex(b => b.classList.contains('on'))`) === 2)
  }

  check(at('the strip is put away on every other view'),
    await evalJS(`state.view = 'overview'; renderView(); document.querySelector('#colTabs').classList.contains('hidden')`))
  await evalJS(`state.view = 'board'; renderView()`)

  /* ---- 2. the Column field ---- */

  const firstId = await evalJS(`state.doc.buckets[0].tiers[0].tasks[0].id`)
  await evalJS(`openDrawer(${JSON.stringify(firstId)})`)
  await new Promise(r => setTimeout(r, 200))

  check(at('the Column field carries both a slider and a select'),
    await evalJS(`!!document.querySelector('#f-tier.stepslider') && !!document.querySelector('#f-tier-sel')`))
  check(at('and the width picks which one shows'),
    await evalJS(`getComputedStyle(document.querySelector('#f-tier-sel')).display`) === (phone ? 'block' : 'none') &&
    (await evalJS(`getComputedStyle(document.querySelector('#f-tier.stepslider')).display`) === 'none') === phone)
  check(at('the select offers the same stops as the slider, in the same order'),
    await evalJS(`
      [...document.querySelectorAll('#f-tier-sel option')].map(o => o.textContent).join('|') ===
      [...document.querySelectorAll('#f-tier .stepstop')].map(o => o.textContent).join('|')
    `))
  check(at('and it opens on the column the task is in'),
    await evalJS(`document.querySelector('#f-tier-sel').selectedOptions[0].textContent`) === 'To do')
  // A read-only tab disables both halves, the same as every other field.
  check(at('a locked tab disables it'), await evalJS(`document.querySelector('#f-tier-sel').disabled === true`))
  /* Impact and Effort are scales rather than picks from a list, so they keep
     their sliders at every width and get no select of their own. */
  check(at('Impact and Effort keep their sliders and gain no select'),
    await evalJS(`!document.querySelector('#f-impact-sel') && !document.querySelector('#f-effort-sel')`))
  await evalJS(`closeDrawer()`)

  /* ---- the header and the bucket strip are not pinned on a phone ----

     At 400px the two together stack to about half the screen, and sticky held
     that all the way down a column. They scroll away with the cards now.
     Asserted at both widths, since the whole point is the breakpoint: pinned
     on a desktop, where the header is one row, and not on a phone. */

  const pinned = sel => evalJS(`getComputedStyle(document.querySelector(${JSON.stringify(sel)})).position`)
  check(at('the header is pinned only where it costs nothing'),
    await pinned('header') === (phone ? 'static' : 'sticky'), await pinned('header'))
  check(at('and so is the bucket strip'),
    await pinned('.bucketbar') === (phone ? 'static' : 'sticky'), await pinned('.bucketbar'))
  /* The strip is the one thing that stays pinned on a phone: four lines tall,
     and it says where you are, which is the thing the header was holding half
     the screen to answer. */
  if (phone) {
    check(at('the column strip is what stays pinned instead'),
      await pinned('#colTabs') === 'sticky')
  }

  /* ---- 3. the sort control on a touch screen ---- */

  check(at('.sortbtn is at full opacity where nothing can hover'), await evalJS(`
    (() => {
      const all = [];
      const walk = rs => { for (const r of rs) { all.push(r.cssText || ''); if (r.cssRules) walk(r.cssRules) } };
      [...document.styleSheets].forEach(s => { try { walk(s.cssRules) } catch {} });
      return all.some(t => /hover:\\s*none/.test(t) && t.includes('sortbtn') && t.includes('opacity: 1'));
    })()
  `))

  check(at('nothing was written'), await evalJS(`window.__blocked.length === 0`),
    await evalJS(`window.__blocked.join(' | ')`))

  ws.close()
  chrome.kill()
}

await run('phone', 400, 900)
await run('desktop', 1400, 1000)

const failed = checks.filter(c => !c).length
console.log(failed ? `\n${failed} failed` : `\nall ${checks.length} checks passed`)
process.exit(failed ? 1 : 0)
