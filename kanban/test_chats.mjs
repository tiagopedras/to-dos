/**
 * Drives the board in headless Chrome and asserts on what the drawer's Chats
 * field actually draws, rather than on what the code looks like it should do.
 *
 * It was test_canvas.mjs until 12 Sep 2026, when the canvas view it was
 * written against was removed and what it covers became the stack of
 * conversation cards under a task, the attach queue and the prompt runs.
 *
 *   python3 kanban/server.py &          # or point PORT below at one already up
 *   node kanban/test_chats.mjs
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
  '--user-data-dir=/tmp/todo-chats-test-profile', '--window-size=1600,1000',
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
check('the board loaded', await evalJS(`typeof cvCardHTML === 'function'`))

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
  state.lockedLabel = 'chats test';
  return 'locked';
})()`)
check('tab is locked before any fixture', await evalJS(`state.locked === true`))
check('and no write can leave the page', await evalJS(`window.__blocked.length === 0 && typeof window.__blocked === 'object'`))
check('no canvas view is offered', await evalJS(`
  !viewDefs().some(d => d.id === 'canvas') && !isKnownView('canvas')
`))

const built = await evalJS(`
  (() => {
    // Unlocked from here so the drawer draws as it would in real use. Writes
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
      cccccc: [
        { id:'44444444-4444-4444-4444-444444444444', title:'A stray thought from the terminal', updated:new Date().toISOString(), mode:'ask', cwd:'/x' }
      ]
    };
    state.chatViewedLoaded = true;
    renderView();
    return { titles: [a.title, b.title], ids: [a.id, b.id] };
  })()
`)

// ---- The seed a new chat opens with ----
// See IMPROVEMENTS.md, "Every place that hands a task to an assistant
// re-derives its own understanding from the same chaotic notes field." A
// cached briefing, when brief.py has written one, replaces the raw notes as
// the seed rather than sitting beside them — a task never briefed falls back
// to exactly what taskDescription() always returned.
const briefed = await evalJS(`
  (() => {
    let target = null;
    for (const b of state.doc.buckets) for (const ti of b.tiers) for (const t of ti.tasks)
      if (!target && t.body && t.body.length) target = t;
    if (!target) return { error: 'no task with notes in the fixture' };
    const key = target.stableId || target.title;
    const withoutBriefing = taskDescription(target);
    state.briefings[key] = { title: target.title, text: 'Direction: settled already.' };
    const withBriefing = taskDescription(target);
    delete state.briefings[key];
    const afterClearing = taskDescription(target);
    return { withoutBriefing, withBriefing, afterClearing, title: target.title };
  })()
`)
check('a task with no cached briefing seeds from its raw notes, as before',
  briefed.withoutBriefing.startsWith(briefed.title) && briefed.withoutBriefing !== briefed.withBriefing,
  JSON.stringify(briefed))
check('a cached briefing replaces the notes as the seed',
  briefed.withBriefing === briefed.title + '\n\nDirection: settled already.',
  briefed.withBriefing)
check('clearing the cache falls straight back to raw notes',
  briefed.afterClearing === briefed.withoutBriefing)

// ---- The card, in the drawer ----
// The Chats field draws with cvCardHTML rather than chat.js's own row markup.
const drawer = await evalJS(`
  (() => {
    openDrawer('${built.ids[0]}');
    const stack = document.querySelector('#dbody .cvstack');
    return {
      cards: stack ? stack.querySelectorAll('.cvcard').length : -1,
      noGrip: stack ? !stack.querySelector('.cvgrip') : false,
      mode: stack ? stack.querySelectorAll('.cvmode').length : -1,
      hasAttach: !!document.querySelector('#dbody .aic-attach'),
      hasNew: !!document.querySelector('#dbody .aic-addsub:not(.aic-attach)')
    };
  })()
`)
check('the drawer draws one card per conversation', drawer.cards === 2, `${drawer.cards} cards`)
check('a card has no grip to drag by — there is nowhere to drag it', drawer.noGrip)
check('a work-mode card says it can write', drawer.mode === 1, `${drawer.mode} badges`)
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
check('the card’s close button asks before taking it off the board', drawerClose.includes('off the board'))
check('and says the transcript survives', drawerClose.includes('stays on disk'))

// ---- A prompt is used up by being run ----
// The click that opens the modal must not delete
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
// The board's own half of /pa-attach — the queue that skill leaves
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

check('a locked tab refuses to write down what was opened', await evalJS(`
  (() => {
    state.locked = true;
    window.__blocked.length = 0;
    saveChatViewed();
    return window.__blocked.length === 0;
  })()
`))
await new Promise(r => setTimeout(r, 700))
check('and still nothing was written after the debounce', await evalJS(`window.__blocked.length === 0`))
check('an unlocked tab does save it', await evalJS(`
  (() => { state.locked = false; saveChatViewed(); return true; })()
`))
await new Promise(r => setTimeout(r, 700))
check('the save is a POST to /chat-viewed', await evalJS(`
  window.__blocked.some(b => b === 'POST /chat-viewed')
`), await evalJS(`JSON.stringify(window.__blocked)`))
// The recording also holds a PUT /data/todo.md that never left the page:
// attaching a session above minted a task a `chat:` key, which marks the
// document dirty and starts the ordinary autosave. Stopping that is the whole
// point of the fetch guard, and seeing it here is the proof it worked.
check('the todo.md save was attempted and stopped', await evalJS(`
  window.__blocked.some(b => b === 'PUT /data/todo.md')
`), await evalJS(`JSON.stringify(window.__blocked)`))

const errs = await evalJS(`window.__errs || 0`)
console.log(`\n${checks.filter(Boolean).length}/${checks.length} passed`)
ws.close(); chrome.kill()
process.exit(checks.every(Boolean) ? 0 : 1)
