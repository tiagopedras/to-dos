/**
 * Drives the board in headless Chrome and asserts on what the canvas actually
 * draws, rather than on what the code looks like it should do.
 *
 *   python3 kanban/server.py &          # or point PORT below at one already up
 *   node kanban/test_canvas.mjs
 *
 * Two guards, because this repo has lost the real todo.md to a test twice:
 *
 *   1. The tab is locked before any fixture is loaded, which is the rule in
 *      CLAUDE.md. A locked tab cannot save.
 *   2. Every non-GET is torn out of `fetch` and recorded instead of sent, so
 *      even if something below unlocks the tab there is no path from here to
 *      disk. The recording is also what the save assertions read.
 *
 * The fixture is demo.md plus a made-up sessions index. Nothing here touches
 * the real list or the real sessions store.
 */

import { spawn } from 'node:child_process'

const PORT = 9444
const BOARD = process.env.BOARD_PORT || 8765
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  '--user-data-dir=/tmp/todo-canvas-test-profile', '--window-size=1600,1000',
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
check('the board loaded', await evalJS(`typeof renderCanvas === 'function'`))
check('cards.js reached the page', await evalJS(`typeof window.AICards === 'object' && typeof AICards.containBox === 'function'`))

// LOCK FIRST, then fixtures. Nothing below can write anything.
// Belt and braces. The tab is locked, AND every write is torn out of fetch, so
// there is no path from this test to todo.md even if something below unlocks.
await evalJS(`(() => {
  const real = window.fetch;
  window.__blocked = [];
  window.fetch = (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    if (method !== 'GET') { window.__blocked.push(method + ' ' + url); return Promise.resolve(new Response('{}', {status:200})); }
    return real(url, opts);
  };
  return 'fetch is read-only';
})()`)
await evalJS(`(async () => {
  const demo = await (await fetch('/kanban/demo.md')).text();
  load(demo, 'demo.md', {});
  state.locked = true;
  state.lockedLabel = 'canvas test';
  return 'locked';
})()`)
check('tab is locked before any fixture', await evalJS(`state.locked === true`))
check('and no write can leave the page', await evalJS(`window.__blocked.length === 0 && typeof window.__blocked === 'object'`))
check('the Canvas tab stays hidden in a locked tab', await evalJS(`
  !viewDefs().some(d => d.id === 'canvas')
`))

const built = await evalJS(`
  (() => {
    // Unlocked from here so the canvas draws as it would in real use. Writes
    // are still impossible: fetch above refuses every one of them.
    state.locked = false;
    state.chatsOn = true;
    const ts = [];
    state.doc.buckets.forEach(b => b.tiers.forEach(ti => ti.tasks.forEach(t => ts.push(t))));
    const a = ts[0], b = ts[1];
    a.chat = 'aaaaaa'; b.chat = 'bbbbbb';
    state.chats = {
      aaaaaa: [
        { id:'11111111-1111-1111-1111-111111111111', title:'Reading the 360 responses', updated:new Date().toISOString(), mode:'ask', cwd:'/x' },
        { id:'22222222-2222-2222-2222-222222222222', title:'Drafting the note that comes out of it', updated:new Date(Date.now()-864e5).toISOString(), mode:'work', cwd:'/x' }
      ],
      bbbbbb: [
        { id:'33333333-3333-3333-3333-333333333333', title:'Checking how it was worded last quarter', updated:new Date(Date.now()-3*864e5).toISOString(), mode:'ask', cwd:'/x' }
      ],
      'canvas-zzzzzz': [
        { id:'44444444-4444-4444-4444-444444444444', title:'A stray thought from the terminal', updated:new Date().toISOString(), mode:'ask', cwd:'/x' }
      ]
    };
    state.canvasLoaded = true;
    state.view = 'canvas';
    renderView();
    return { titles: [a.title, b.title], ids: [a.id, b.id] };
  })()
`)

check('the Canvas tab is offered', await evalJS(`[...document.querySelectorAll('#viewToggle .tab')].map(b=>b.textContent).includes('AI processes')`))
check('the canvas is the visible view', await evalJS(`!document.getElementById('canvas').classList.contains('hidden') && document.getElementById('board').classList.contains('hidden')`))

const boxes = await evalJS(`[...document.querySelectorAll('.cvbox')].length`)
check('one box per task with conversations', boxes === 2, `${boxes} boxes`)
const cards = await evalJS(`[...document.querySelectorAll('.cvcard')].length`)
check('every conversation got a card', cards === 4, `${cards} cards`)
// Boxes are ordered by task title, not by the order the fixture listed them,
// so check both names are on the canvas rather than which one came first.
const names = await evalJS(`[...document.querySelectorAll('.cvboxbar')].map(b => b.textContent)`)
check('each box is named after its task',
  built.titles.every(t => names.some(n => n.includes(t))), names.map(n => n.slice(0, 28)).join(' | '))
check('the loose card says it is unfiled', await evalJS(`[...document.querySelectorAll('.cvowner.loose')].length === 1`))
check('a work-mode card says it can write', await evalJS(`[...document.querySelectorAll('.cvmode')].length === 1`))

const geom = await evalJS(`
  (() => {
    const box = document.querySelector('.cvbox[data-box="aaaaaa"]');
    const r = state.canvas.boxes.aaaaaa;
    const inside = [...document.querySelectorAll('.cvcard')].filter(c => c.dataset.owner === 'aaaaaa');
    const fits = inside.every(c => {
      const x = parseFloat(c.style.left), y = parseFloat(c.style.top);
      return x >= r.x && y >= r.y && x + c.offsetWidth <= r.x + r.width;
    });
    return { hasRect: !!r && r.width > 0, fits, w: r && r.width };
  })()
`)
check('the box got a real rect from cards.js', geom.hasRect, `width ${geom.w}`)
check('and it contains its own cards', geom.fits)

// Drag a loose card onto a task's box and see whether the drop is recognised.
const drop = await evalJS(`
  (() => {
    const card = document.querySelector('.cvcard[data-owner^="canvas-"]');
    const target = state.canvas.boxes.bbbbbb;
    card.style.left = (target.x + 30) + 'px';
    card.style.top = (target.y + 40) + 'px';
    return cvBoxUnder(card);
  })()
`)
check('a card dropped on a box is read as landing in it', drop === 'bbbbbb', String(drop))
const out = await evalJS(`
  (() => {
    const card = document.querySelector('.cvcard[data-owner^="canvas-"]');
    card.style.left = '3200px'; card.style.top = '2200px';
    return cvBoxUnder(card);
  })()
`)
check('a card dragged clear of every box lands in none', out === null, String(out))

// ---- Resizing a box ----
check('a box has a corner to resize from', await evalJS(`
  !!document.querySelector('.cvbox[data-box="aaaaaa"] .cvgrow')
`))
const grew = await evalJS(`
  (() => {
    const box = document.querySelector('.cvbox[data-box="aaaaaa"]');
    const before = { w: box.offsetWidth, h: box.offsetHeight };
    const r = box.getBoundingClientRect();
    const grip = box.querySelector('.cvgrow');
    const at = grip.getBoundingClientRect();
    const down = new PointerEvent('pointerdown', { clientX: at.x + 8, clientY: at.y + 8, bubbles: true, pointerId: 1 });
    grip.dispatchEvent(down);
    document.getElementById('canvas').onpointermove(new PointerEvent('pointermove', { clientX: at.x + 208, clientY: at.y + 108, pointerId: 1 }));
    const mid = { w: box.offsetWidth, h: box.offsetHeight };
    document.getElementById('canvas').onpointerup(new PointerEvent('pointerup', { pointerId: 1 }));
    return { before, mid, after: { w: box.offsetWidth, h: box.offsetHeight }, stored: state.canvas.boxes.aaaaaa };
  })()
`)
check('dragging the corner makes the box bigger', grew.after.w > grew.before.w + 150,
  `${grew.before.w} -> ${grew.after.w}`)
check('the new size is written down', grew.stored.width === grew.after.w, `stored ${grew.stored.width}`)

const shrank = await evalJS(`
  (() => {
    const box = document.querySelector('.cvbox[data-box="aaaaaa"]');
    const grip = box.querySelector('.cvgrow');
    const at = grip.getBoundingClientRect();
    grip.dispatchEvent(new PointerEvent('pointerdown', { clientX: at.x + 8, clientY: at.y + 8, bubbles: true, pointerId: 2 }));
    // Drag hard inwards, past the cards the box holds.
    document.getElementById('canvas').onpointermove(new PointerEvent('pointermove', { clientX: at.x - 900, clientY: at.y - 400, pointerId: 2 }));
    const mid = box.offsetWidth;
    document.getElementById('canvas').onpointerup(new PointerEvent('pointerup', { pointerId: 2 }));
    const cards = [...document.querySelectorAll('.cvcard')].filter(c => c.dataset.owner === 'aaaaaa');
    const r = state.canvas.boxes.aaaaaa;
    return {
      mid, after: box.offsetWidth,
      fits: cards.every(c => parseFloat(c.style.left) + c.offsetWidth <= r.x + r.width)
    };
  })()
`)
check('it follows the cursor inwards while dragging', shrank.mid < 200, `${shrank.mid}px mid-drag`)
check('and on release refuses to be smaller than its cards', shrank.fits && shrank.after > 400,
  `settled at ${shrank.after}px`)

// ---- Closing a card ----
check('every card has a close button', await evalJS(`
  document.querySelectorAll('.cvclose').length === document.querySelectorAll('.cvcard').length
`))
const closed = await evalJS(`(async () => {
  const before = document.querySelectorAll('.cvcard').length;
  let asked = '';
  const realConfirm = window.confirm;
  window.confirm = (msg) => { asked = msg; return true; };
  let forgot = null;
  const realForget = chat.forget;
  chat.forget = (key, id) => { forgot = key + '/' + id; delete state.chats[key];
    return Promise.resolve(); };
  const realLoad = chat.loadSessions;
  chat.loadSessions = () => Promise.resolve();
  state.canvas.cards['44444444-4444-4444-4444-444444444444'] = { x: 1, y: 1, z: 1 };
  await closeCard('canvas-zzzzzz', '44444444-4444-4444-4444-444444444444');
  window.confirm = realConfirm; chat.forget = realForget; chat.loadSessions = realLoad;
  return {
    asked, forgot, before, after: document.querySelectorAll('.cvcard').length,
    geometryGone: !state.canvas.cards['44444444-4444-4444-4444-444444444444']
  };
})()`)
check('closing asks first', closed.asked.includes('off the board'))
check('and says the transcript survives', closed.asked.includes('stays on disk'))
check('it forgets the right session', closed.forgot === 'canvas-zzzzzz/44444444-4444-4444-4444-444444444444')
check('the card leaves the canvas', closed.after === closed.before - 1, `${closed.before} -> ${closed.after}`)
check('and its place is forgotten with it', closed.geometryGone)

const kept = await evalJS(`(async () => {
  const before = document.querySelectorAll('.cvcard').length;
  const realConfirm = window.confirm;
  window.confirm = () => false;
  let called = false;
  const realForget = chat.forget;
  chat.forget = () => { called = true; return Promise.resolve(); };
  await closeCard('aaaaaa', '11111111-1111-1111-1111-111111111111');
  window.confirm = realConfirm; chat.forget = realForget;
  return { called, same: document.querySelectorAll('.cvcard').length === before };
})()`)
check('saying no closes nothing', !kept.called && kept.same)

// ---- The same card, in the drawer ----
// Step 3 of AI-CANVAS.md: the drawer's Chats field draws with cvCardHTML,
// the same renderer the canvas uses, instead of chat.js's own row markup.
const drawer = await evalJS(`
  (() => {
    openDrawer('${built.ids[0]}');
    const stack = document.querySelector('#dbody .cvstack');
    return {
      cards: stack ? stack.querySelectorAll('.cvcard').length : -1,
      noGrip: stack ? getComputedStyle(stack.querySelector('.cvgrip')).display === 'none' : false,
      hasAttach: !!document.querySelector('#dbody .aic-attach'),
      hasNew: !!document.querySelector('#dbody .aic-addsub:not(.aic-attach)')
    };
  })()
`)
check('the drawer draws one card per conversation', drawer.cards === 2, `${drawer.cards} cards`)
check('no drag grip on a card stacked in the drawer', drawer.noGrip)
check('the drawer offers Attach a session…', drawer.hasAttach)
check('and still offers + New chat', drawer.hasNew)

const drawerOpen = await evalJS(`(() => {
  let opened = null;
  const real = chat.openSession;
  chat.openSession = (owner, key, id) => { opened = { owner, key, id }; };
  document.querySelector('#dbody .cvstack .cvbody').click();
  chat.openSession = real;
  return opened;
})()`)
check('clicking a drawer card opens that session', drawerOpen && drawerOpen.key === 'aaaaaa', JSON.stringify(drawerOpen))

const drawerClose = await evalJS(`(async () => {
  const realConfirm = window.confirm;
  let asked = '';
  window.confirm = (msg) => { asked = msg; return false; };
  document.querySelector('#dbody .cvstack .cvclose').click();
  window.confirm = realConfirm;
  return asked;
})()`)
check('the drawer card’s close button is the same closeCard() the canvas uses', drawerClose.includes('off the board'))

// ---- A prompt is used up by being run ----
// Step 5 of AI-CANVAS.md. The click that opens the modal must not delete
// anything — only an actual send does, and only the send that matches the
// prompt run pending on that task.
const promptRaw = '- Prompt: Draft the note that comes out of it'
const askWired = await evalJS(`
  (() => {
    const t = locate('${built.ids[0]}').task;
    t.body.push(${JSON.stringify(promptRaw)});
    refreshView();
    openDrawer('${built.ids[0]}');
    const btn = [...document.querySelectorAll('#dbody .askclaude')]
      .find(b => b.dataset.raw === ${JSON.stringify(promptRaw)});
    return { found: !!btn, ask: btn && btn.dataset.ask };
  })()
`)
check('a prompt suggestion carries its raw line onto Ask Claude', askWired.found)

const clicked = await evalJS(`
  (() => {
    [...document.querySelectorAll('#dbody .askclaude')]
      .find(b => b.dataset.raw === ${JSON.stringify(promptRaw)}).click();
    return {
      pending: state.pendingPromptRun,
      stillOnTask: locate('${built.ids[0]}').task.body.includes(${JSON.stringify(promptRaw)})
    };
  })()
`)
check('opening the modal marks the run pending, nothing more',
  clicked.pending && clicked.pending.key === 'aaaaaa' && clicked.pending.raw === promptRaw)
check('the line is not touched by opening it', clicked.stillOnTask)

const sentElsewhere = await evalJS(`
  (() => {
    // A send on a different owner key must not consume this task's pending run.
    onPromptRunSend({ owner: 'x', key: 'bbbbbb', session: '', ask: 'unrelated' });
    return {
      pending: state.pendingPromptRun,
      stillOnTask: locate('${built.ids[0]}').task.body.includes(${JSON.stringify(promptRaw)})
    };
  })()
`)
check('a send on a different task leaves the pending run alone',
  sentElsewhere.pending && sentElsewhere.stillOnTask)

const sent = await evalJS(`
  (() => {
    onPromptRunSend({ owner: 'x', key: 'aaaaaa', session: '', ask: 'Draft it' });
    return {
      pendingStillWaiting: !!state.pendingPromptRun,   // waiting on a session id now
      lineGone: !locate('${built.ids[0]}').task.body.includes(${JSON.stringify(promptRaw)})
    };
  })()
`)
check('sending it deletes the line', sent.lineGone)
check('the pending run stays open, waiting for a session id', sent.pendingStillWaiting)

const stamped = await evalJS(`
  (() => {
    let noted = null;
    const real = notePrompt;
    notePrompt = (owner, session, raw) => { noted = { owner, session, raw }; };
    onSessionsChanged({ aaaaaa: (state.chats.aaaaaa || []).concat([
      { id: '55555555-5555-5555-5555-555555555555', title: 'Draft it', updated: new Date().toISOString(), mode: 'ask', cwd: '/x' }
    ]) });
    notePrompt = real;
    return { noted, pendingCleared: !state.pendingPromptRun };
  })()
`)
check('the new session gets the prompt recorded against it',
  stamped.noted && stamped.noted.owner === 'aaaaaa' &&
  stamped.noted.session === '55555555-5555-5555-5555-555555555555' &&
  stamped.noted.raw === promptRaw, JSON.stringify(stamped.noted))
check('and the pending run is done', stamped.pendingCleared)

check('starting a plain new chat clears a stale pending run instead of adopting it', await evalJS(`
  (() => {
    state.pendingPromptRun = { key: 'bbbbbb', raw: 'stale' };
    newChat('${built.ids[1]}');
    return state.pendingPromptRun === null;
  })()
`))

// ---- Attaching a session that started elsewhere ----
// Step 4 of AI-CANVAS.md, the board's own half — the queue /pa-attach leaves
// is the other half, and cannot be driven from here since it is a terminal
// skill, not a page. fetch is monkey-patched for the length of each of these
// two blocks and restored after, on top of the permanent read-only wrapper
// from the top of this file — nothing here reaches the real attach-queue.json
// or the real /claude/attach on disk either.
const drained = await evalJS(`
  (async () => {
    let target = null;
    for (const b of state.doc.buckets) for (const ti of b.tiers) for (const t of ti.tasks) {
      if (!t.chat) { target = t; break; }
    }
    if (!target) return { error: 'no task without a chat key in the fixture' };
    const realFetch = window.fetch;
    const calls = [];
    window.fetch = (url, opts) => {
      calls.push((opts && opts.method || 'GET') + ' ' + url);
      if (url.startsWith('/attach-queue.json') && (!opts || !opts.method)) {
        return Promise.resolve(new Response(JSON.stringify([
          { session: '66666666-6666-6666-6666-666666666666', cwd: '/x', title: target.title },
          { session: '77777777-7777-7777-7777-777777777777', cwd: '/x', title: 'No task has this title' }
        ]), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    await drainAttachQueue();
    window.fetch = realFetch;
    return {
      mintedKey: !!target.chat,
      attachCall: calls.find(c => c.startsWith('POST /claude/attach')) || '',
      clearCall: calls.find(c => c.startsWith('POST /attach-queue.json')) || '',
      status: document.getElementById('status').textContent
    };
  })()
`)
check('a matched entry mints the task a chat key', drained.mintedKey, JSON.stringify(drained))
check('and files it through /claude/attach', !!drained.attachCall)
check('the queue is written back afterwards', !!drained.clearCall)
check('and says what it did', drained.status.includes('attached'), drained.status)

const picked = await evalJS(`
  (async () => {
    const realFetch = window.fetch;
    const calls = [];
    window.fetch = (url, opts) => {
      calls.push((opts && opts.method || 'GET') + ' ' + url);
      if (url.startsWith('/claude/attachable.json')) {
        return Promise.resolve(new Response(JSON.stringify({ sessions: [
          { id: '88888888-8888-8888-8888-888888888888', cwd: '/Users/x/project',
            title: 'A stray thought from the terminal', updated: new Date().toISOString() }
        ] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    await openAttachPicker('${built.ids[0]}');
    await new Promise(r => setTimeout(r, 30));
    const rows = document.querySelectorAll('.attachpick-row').length;
    document.querySelector('.attachpick-row').click();
    await new Promise(r => setTimeout(r, 30));
    window.fetch = realFetch;
    return {
      rows,
      closed: !document.querySelector('.attachpick-wrap'),
      attachCall: calls.find(c => c.startsWith('POST /claude/attach')) || ''
    };
  })()
`)
check('the picker lists what is on disk', picked.rows === 1, `${picked.rows} rows`)
check('picking one closes the picker', picked.closed)
check('and attaches it', !!picked.attachCall)

check('a locked tab refuses to save the layout', await evalJS(`
  (() => {
    state.locked = true;
    window.__blocked.length = 0;
    saveCanvas();
    return window.__blocked.length === 0;
  })()
`))
await new Promise(r => setTimeout(r, 700))
check('and still nothing was written after the debounce', await evalJS(`window.__blocked.length === 0`))
check('an unlocked tab does save it', await evalJS(`
  (() => { state.locked = false; saveCanvas(); return true; })()
`))
await new Promise(r => setTimeout(r, 700))
check('the layout save is a POST to /canvas', await evalJS(`
  window.__blocked.some(b => b === 'POST /canvas')
`), await evalJS(`JSON.stringify(window.__blocked)`))

const errs = await evalJS(`window.__errs || 0`)
console.log(`\n${checks.filter(Boolean).length}/${checks.length} passed`)
ws.close(); chrome.kill()
process.exit(checks.every(Boolean) ? 0 : 1)
