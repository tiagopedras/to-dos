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

const PORT = Number(process.env.CDP_PORT) || 9444
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_chats.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-chats-test-profile'}`, '--window-size=1600,1000',
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

// ---- One window per open chat, minimised and anchored ----
// See IMPROVEMENTS.md, "A chat can only be open or closed". Each open chat is
// its own AIChat instance; the engine docks them along the bottom edge.
const until = async (expr, ms = 3000) => {
  for (let t = 0; t < ms; t += 50) { if (await evalJS(expr)) return true; await new Promise(r => setTimeout(r, 50)) }
  return false
}
const S1 = '11111111-1111-1111-1111-111111111111', S3 = '33333333-3333-3333-3333-333333333333'
// The pinned PA bar is set aside here, so the counts below are only the
// chats this section opens; "The PA panel" further down brings it back.
await evalJS(`(() => { for (const [k, w] of chatWins) { if (w.pinned) { w.inst.destroy(); chatWins.delete(k); } else w.inst.closeChat(); } })()`)
await until(`chatWins.size === 0`)
await evalJS(`chat.openSession('${built.ids[0]}', 'aaaaaa', '${S1}')`)
check('opening a chat makes one window for it', await until(`chatWins.size === 1 && document.querySelectorAll('.tenon-window.aic-box').length === 1`),
  await evalJS(`chatWins.size + ' instances'`))
await evalJS(`chat.openSession('${built.ids[1]}', 'bbbbbb', '${S3}')`)
check('a second chat opens beside it rather than replacing it', await until(`chatWins.size === 2 && document.querySelectorAll('.tenon-window.aic-box').length === 2`))
await evalJS(`chat.openSession('${built.ids[0]}', 'aaaaaa', '${S1}')`)
check('re-opening an open chat focuses it rather than duplicating it', await until(`chatWins.size === 2 && document.querySelectorAll('.tenon-window.aic-box').length === 2`))
await evalJS(`findChatWin('${S1}').minimise()`)
check('minimising docks it as a bar on the bottom-right edge', await until(`(() => {
  const el = document.querySelector('.aic-minimised'); if (!el) return false;
  const r = el.getBoundingClientRect();
  return Math.abs(r.bottom - innerHeight) < 2 && innerWidth - r.right < 40;
})()`))
check('  and it is no longer the window in the way of the board', await evalJS(`chat.isOpen() === true && findChatWin('${S1}').dockState() === 'minimised'`))
await evalJS(`findChatWin('${S3}').minimise()`)
check('two minimised chats line up leftwards', await until(`(() => {
  const bars = [...document.querySelectorAll('.aic-minimised')].map(e => e.getBoundingClientRect());
  return bars.length === 2 && Math.abs(bars[0].bottom - bars[1].bottom) < 2 && Math.abs(bars[0].left - bars[1].left) >= 300;
})()`))
await evalJS(`chat.openSession('${built.ids[0]}', 'aaaaaa', '${S1}')`)
check('re-opening a minimised chat opens it anchored', await until(`findChatWin('${S1}').dockState() === 'anchored' && !!document.querySelector('.aic-anchored')`))
check('  with buttons to minimise and expand it', await evalJS(`!!document.querySelector('.aic-anchored .aic-minimise') && !!document.querySelector('.aic-anchored .aic-expand')`))
await evalJS(`findChatWin('${S1}').closeChat()`)
check('closing a chat takes its instance down', await until(`chatWins.size === 1 && !findChatWin('${S1}') && document.querySelectorAll('[data-ai-chat]').length === 1`),
  await evalJS(`chatWins.size + ' instances, ' + document.querySelectorAll('[data-ai-chat]').length + ' roots'`))
await evalJS(`findChatWin('${S3}').closeChat()`)
check('  and the last one leaves nothing docked', await until(`chatWins.size === 0 && !document.querySelector('.aic-docked')`))

// ---- The PA panel ----
// See IMPROVEMENTS.md, "There is no way to talk to the PA while the board is
// in front of you." A chat owned by the board, not a task, opened from a
// pinned bar in the bottom-right corner; it saves before each send and reads todo.md
// back once the reply lands. The run is the fetch guard's canned '{}', so the
// reply "lands" at once; saveFile, diskVersion and reload are stubbed and
// restored, so nothing here reaches disk either.
const paOpen = await evalJS(`(() => {
  window.__realAvail = chat.available;
  chat.available = () => true;
  const bar = ensurePaBar();
  const barDock = bar && bar.dockState();
  const before = JSON.stringify(state.doc.buckets.map(b => b.tiers.map(t => t.tasks.map(x => x.chat || ''))));
  const dirtyBefore = state.dirty;
  openPaChat();
  const w = [...chatWins.values()].find(w => w.newFor === PA_KEY);
  const after = JSON.stringify(state.doc.buckets.map(b => b.tiers.map(t => t.tasks.map(x => x.chat || ''))));
  return { barDock, pinned: !!(w && w.pinned), found: !!w, dock: w && w.inst.dockState(), noTaskKeyed: before === after, dirtyUnchanged: state.dirty === dirtyBefore };
})()`)
check('the PA starts as a pinned, minimised bar', paOpen.barDock === 'minimised' && paOpen.pinned, JSON.stringify(paOpen))
check('opening the PA anchors that same chat', paOpen.found, JSON.stringify(paOpen))
check('  anchored bottom-right by default', paOpen.dock === 'anchored' && await until(`(() => {
  const el = document.querySelector('.aic-anchored'); if (!el) return false;
  const r = el.getBoundingClientRect();
  return Math.abs(r.bottom - innerHeight) < 2 && innerWidth - r.right < 40;
})()`))
check('  owned by the board, not a task', await until(`(() => {
  const el = document.querySelector('.aic-anchored .aic-for');
  return !!el && el.textContent === 'The board · PA';
})()`) && paOpen.noTaskKeyed && paOpen.dirtyUnchanged)
check('  and minimisable', await evalJS(`!!document.querySelector('.aic-anchored .aic-minimise')`))
check('  with no close button', await evalJS(`!document.querySelector('.aic-pinned [aria-label="Close"]')`))
const other = await evalJS(`(() => {
  const inst = makeChatWin('other-key');
  inst.openNew('other-key', 'other-key', '', {});
  inst.minimise();
  window.__other = inst;
  return true;
})()`)
check('another docked chat lines up to the left of the PA', other && await until(`(() => {
  const pa = document.querySelector('.aic-pinned'), o = [...document.querySelectorAll('.aic-docked')].find(e => !e.classList.contains('aic-pinned'));
  if (!pa || !o) return false;
  return o.getBoundingClientRect().right <= pa.getBoundingClientRect().left && innerWidth - pa.getBoundingClientRect().right < 40;
})()`))
await evalJS(`window.__other.closeChat()`)
await evalJS(`openPaChat()`)
check('opening the PA again brings the same one forward', await evalJS(`[...chatWins.values()].filter(w => w.newFor === PA_KEY).length === 1`))

const paTurn = await evalJS(`(async () => {
  const real = { saveFile, diskVersion, reload, fetch: window.fetch };
  const log = [];
  let body = '';
  saveFile = async () => { log.push('save'); state.dirty = false; };
  diskVersion = async () => ({ stamp: 'x', hash: 'moved-by-pa' });
  reload = async () => { log.push('reload'); };
  window.fetch = (url, opts) => {
    if (opts && opts.method === 'POST' && String(url).startsWith('/claude')) { log.push('run'); body = opts.body; }
    return real.fetch(url, opts);
  };
  const was = { dirty: state.dirty, hash: state.diskHash };
  state.diskHash = 'before';
  state.dirty = true;
  state.migratedOnly = false;
  const ta = document.querySelector('.aic-anchored .aic-input');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'What is due this week?');
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  document.querySelector('.aic-anchored .aic-send').click();
  for (let i = 0; i < 60 && !log.includes('reload'); i++) await new Promise(r => setTimeout(r, 50));
  Object.assign(window, { fetch: real.fetch });
  saveFile = real.saveFile; diskVersion = real.diskVersion; reload = real.reload;
  // Left as found: the autosave check at the end of this file reads it.
  state.dirty = was.dirty; state.diskHash = was.hash;
  let prompt = '', owner = '';
  try { const j = JSON.parse(body); prompt = j.prompt; owner = j.owner; } catch (e) {}
  return { log, prompt, owner, dataset: state.dataset };
})()`)
check('sending on the PA chat saves unsaved changes first', paTurn.log[0] === 'save' && paTurn.log.indexOf('run') > 0, JSON.stringify(paTurn.log))
check('  and reloads todo.md once the reply has landed', paTurn.log[paTurn.log.length - 1] === 'reload', JSON.stringify(paTurn.log))
check('the run is filed under the board’s PA key', paTurn.owner === 'board-pa', paTurn.owner)
check('the first message is seeded for /pa with the current dataset',
  paTurn.prompt.startsWith('/pa What is due this week?') && paTurn.prompt.includes("PA chat") &&
  (!paTurn.dataset || paTurn.prompt.includes('data/' + paTurn.dataset + '/todo.md')), paTurn.prompt)
check('closing the PA only minimises it', await evalJS(`(() => {
  const inst = paWin(); inst.closeChat();
  return inst.isOpen() && inst.dockState() === 'minimised';
})()`))
await evalJS(`(() => {
  for (const [k, w] of chatWins) { if (w.pinned) { w.inst.destroy(); chatWins.delete(k); } else w.inst.closeChat(); }
  chat.available = window.__realAvail;
})()`)
await until(`chatWins.size === 0`)

// ---- pa-changes: the PA asks, the board writes ----
// See IMPROVEMENTS.md, "A chat started on the board has no safe way to ask the
// PA for a change to the list." No Claude is called: the reply is written here,
// and the transcript it is read back from is a stubbed fetch.
const paParse = await evalJS(`(() => {
  const none = paChangesFromReply('Nothing to change today.');
  const bad = paChangesFromReply('x\\n\\u0060\\u0060\\u0060pa-changes\\n[{nope\\n\\u0060\\u0060\\u0060');
  const two = paChangesFromReply('\\u0060\\u0060\\u0060pa-changes\\n[{"kind":"tick","task":"a"}]\\n\\u0060\\u0060\\u0060\\nthen\\n\\u0060\\u0060\\u0060pa-changes\\n{"changes":[{"kind":"add","title":"b"}]}\\n\\u0060\\u0060\\u0060');
  return { none: none.found, bad: bad.error, two: two.items };
})()`)
check('a reply with no pa-changes block is not a request', paParse.none === false)
check('  a block that is not JSON is refused', /not valid JSON/.test(paParse.bad), paParse.bad)
check('  and only the last block is read', paParse.two.length === 1 && paParse.two[0].kind === 'add', JSON.stringify(paParse.two))

await new Promise(r => setTimeout(r, 700))   // let any open undo burst settle
const paApply = await evalJS(`(() => {
  state.locked = false;
  const before = serializeDoc(state.doc);
  const steps = undoStack.length;
  const fence = String.fromCharCode(96).repeat(3);
  const reply = 'Moving the template, dating the 360s, adding the venue.\\n\\n' + fence + 'pa-changes\\n' + JSON.stringify([
    { kind: 'move', task: 'Tidy up the shared 1:1 notes template', column: 'Doing' },
    { kind: 'date', task: 'chase the 360 responses', due: '2026-10-02' },
    { kind: 'tick', task: 'Decide whether to open the mid-weight design role' },
    { kind: 'edit', task: 'Tidy up the shared 1:1 notes template', field: 'impact', value: 'high' },
    { kind: 'add', title: 'Book the offsite venue', bucket: 'People', effort: 'S', note: 'From the PA panel.' },
    { kind: 'delete', task: 'Chase the 360 responses' },
    { kind: 'edit', task: 'Chase the 360 responses', field: 'impact', value: 'huge' }
  ]) + '\\n' + fence;
  const out = applyPaChanges(reply);
  const find = title => { for (const b of state.doc.buckets) for (const ti of b.tiers) for (const t of ti.tasks) if (t.title === title) return { t, col: ti.name, bucket: b.name }; return null; };
  const tidy = find('Tidy up the shared 1:1 notes template');
  const chase = find('Chase the 360 responses');
  const decide = find('Decide whether to open the mid-weight design role');
  const added = find('Book the offsite venue');
  const after = serializeDoc(state.doc);
  const res = {
    out, stepsAdded: undoStack.length - steps, dirty: state.dirty,
    tidy: tidy && [tidy.col, tidy.t.impact], chaseDue: chase && chase.t.due,
    decide: decide && [decide.col, decide.t.done], added: added && [added.bucket, added.col, added.t.effort, added.t.body.join('|'), !!added.t.stableId],
    wroteLine: after.includes('Book the offsite venue') && after.includes('[due:: 2026-10-02]'),
  };
  undo();
  res.undone = serializeDoc(state.doc) === before;
  return res;
})()`)
check('a pa-changes block applies each known kind', paApply.out.applied.length === 5, JSON.stringify(paApply.out))
check('  move puts the card in the named column', paApply.tidy && paApply.tidy[0] === 'Doing', JSON.stringify(paApply.tidy))
check('  date re-dates it, found by title ignoring case', paApply.chaseDue === '2026-10-02', paApply.chaseDue)
check('  tick ticks it into Done', paApply.decide && paApply.decide[0] === 'Done' && paApply.decide[1] === true, JSON.stringify(paApply.decide))
check('  edit sets a field', paApply.tidy && paApply.tidy[1] === 'high')
check('  add writes a new task with its fields, note and an id',
  JSON.stringify(paApply.added) === JSON.stringify(['People', 'To do', 'S', '  - From the PA panel.', true]), JSON.stringify(paApply.added))
check('  and the document serialises with them', paApply.wroteLine)
check('an unknown kind is refused, by name', paApply.out.refused.some(r => r === 'unknown kind "delete"'), JSON.stringify(paApply.out.refused))
check('  so is a bad value on a known kind', paApply.out.refused.some(r => /impact is/.test(r)))
check('the whole block is one undo step', paApply.stepsAdded === 1 && paApply.dirty, `${paApply.stepsAdded} steps`)
check('  and one undo takes all of it back', paApply.undone)

const paFlow = await evalJS(`(async () => {
  const real = { diskVersion, fetch: window.fetch };
  diskVersion = async () => ({ stamp: '', hash: '' });   // todo.md did not move on disk
  const fence = String.fromCharCode(96).repeat(3);
  const reply = 'Done.\\n' + fence + 'pa-changes\\n[{"kind":"edit","task":"Tidy up the shared 1:1 notes template","field":"week","value":true},{"kind":"archive","task":"x"}]\\n' + fence;
  window.fetch = (url, opts) => {
    if (String(url).startsWith('/claude/transcript.json')) {
      return Promise.resolve(new Response(JSON.stringify({ turns: [{ ask: 'earlier', reply: 'old' }, { ask: '/pa tidy it\\n\\n(Sent from the board)', reply }] }), { status: 200 }));
    }
    return real.fetch(url, opts);
  };
  let header = null;
  const inst = { session: () => 'pa-session-1', setHeader: h => { header = h; } };
  const toastsBefore = document.querySelectorAll('#toasts .toast').length;
  await paAfterReply(inst, { ask: 'tidy it' });
  const find = title => { for (const b of state.doc.buckets) for (const ti of b.tiers) for (const t of ti.tasks) if (t.title === title) return t; return null; };
  const week = find('Tidy up the shared 1:1 notes template').week;
  const toast = document.querySelectorAll('#toasts .toast').length > toastsBefore;
  find('Tidy up the shared 1:1 notes template').week = false;
  const header1 = header;
  await paAfterReply(inst, { ask: 'tidy it' });
  const reapplied = find('Tidy up the shared 1:1 notes template').week;
  const stale = { session: () => 'pa-session-2', setHeader: h => { header = h; } };
  header = 'untouched';
  await paAfterReply(stale, { ask: 'something else entirely' });
  window.fetch = real.fetch; diskVersion = real.diskVersion;
  return { week, header: header1 && header1.subtitle, reapplied, staleHeader: header, toast };
})()`)
check('a reply landing in the PA chat is read back and applied', paFlow.week === true, JSON.stringify(paFlow))
check('  the chat header says what was applied and what was refused',
  /1 change applied/.test(paFlow.header || '') && /unknown kind "archive"/.test(paFlow.header || ''), paFlow.header)
check('  a refusal shows as a toast too', paFlow.toast)
check('  the same turn is never applied twice', paFlow.reapplied === false)
check('  a transcript whose last turn is not this ask is left alone', paFlow.staleHeader === 'untouched', String(paFlow.staleHeader))

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
