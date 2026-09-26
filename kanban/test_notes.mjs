/**
 * Drives the drawer's Description field in headless Chrome and asserts on it.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_notes.mjs
 *
 * The field renders Markdown at rest and swaps to the raw textarea when it is
 * clicked, with the caret where the click landed. Two things are worth a test:
 * that the rendering happens at all, and that the caret arrives on the
 * character that was clicked rather than a mark next to it — the mapping from
 * rendered text back to source is the only part of this that is arithmetic
 * rather than plumbing, and it was wrong twice before it was right.
 *
 * Same two guards as test_chats.mjs, for the reason written there: the tab is
 * locked before any fixture is loaded, and every non-GET is torn out of fetch
 * and recorded instead of sent. The Description field is an editor, so this
 * one types into a real task — the recording is how we know that typing
 * reached no file.
 *
 * The last third covers the field's height, which is one stored number driving
 * both halves — press Expand or drag the corner and the other half and the
 * button's own label have to agree, or the panel jumps under the pointer the
 * next time the field changes state.
 */

import { spawn } from 'node:child_process'

const PORT = Number(process.env.CDP_PORT) || 9448
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_notes.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-notes-test-profile'}`, '--window-size=1400,1000',
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
check('the board loaded', await evalJS(`typeof openDrawer === 'function'`))

// LOCK FIRST, then fixtures. Nothing below can write anything.
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
  state.lockedLabel = 'notes test';
  return 'locked';
})()`)
check('tab is locked before any fixture', await evalJS(`state.locked === true`))
check('and no write can leave the page', await evalJS(`window.__blocked.length === 0`))

/* A backup preview is read-only, and reading is exactly what the rendering is
   for, so it renders there too — it just cannot be clicked into. */
const roDrawn = await evalJS(`
  (() => {
    const ts = [];
    state.doc.buckets.forEach(b => b.tiers.forEach(ti => ti.tasks.forEach(t => ts.push(t))));
    const t = ts[0];
    t.body = ['  A note with **bold** in it.'];
    openDrawer(t.id);
    const v = document.querySelector('#f-body-view');
    return { html: v ? v.innerHTML : null, taHidden: document.querySelector('#f-body').hidden,
             clickable: !!(v && v.onclick) };
  })()
`)
check('a locked drawer still renders the note', /<strong>bold<\/strong>/.test(roDrawn.html || ''), roDrawn.html)
check('and the textarea stays out of the way', roDrawn.taHidden === true)
check('and nothing can be clicked into edit', roDrawn.clickable === false)

// Unlocked from here so the field behaves as it does in real use. Writes are
// still impossible: fetch above refuses every one of them.
const NOTE = [
  '  # Probation review',
  '  Needs the 360 back from Ana before **the form** goes in.',
  '  It has been open a fortnight.',
  '  ',
  '  - Chase Ana on `Monday`',
  '  - Read [the guidance](https://example.com/probation) first',
  '  - The form lives at https://hr.example.com/forms/probation today',
  '  - Draft it from [path] and leave [fill in] where you are stuck [due:: 2026-09-20]'
].join('\n')

/* openDrawer starts a slide-in transition, and until it finishes the panel is
   off the right-hand edge of the window — where elementFromPoint finds
   nothing and the caret arithmetic has no hit test to start from. Every
   measurement below waits for it. */
const settle = () => new Promise(r => setTimeout(r, 600))
await settle()

const rendered = await evalJS(`
  (() => {
    state.locked = false;
    const ts = [];
    state.doc.buckets.forEach(b => b.tiers.forEach(ti => ti.tasks.forEach(t => ts.push(t))));
    window.__t = ts[0];
    window.__t.body = ${JSON.stringify(NOTE)}.split('\\n');
    openDrawer(window.__t.id);
    const v = document.querySelector('#f-body-view');
    document.querySelector('[data-collapse="notes"]').open = true;
    return {
      html: v.innerHTML,
      blocks: [...v.querySelectorAll('[data-src]')].map(b => b.dataset.src + ' ' + b.tagName),
      raw: document.querySelector('#f-body').value
    };
  })()
`)
check('the heading renders', /<h4[^>]*>Probation review<\/h4>/.test(rendered.html), rendered.html.slice(0, 90))
check('bold, code and links all render',
  /<strong>the form<\/strong>/.test(rendered.html) &&
  /<code>Monday<\/code>/.test(rendered.html) &&
  /href="https:\/\/example\.com\/probation"/.test(rendered.html))
check('the two-line paragraph is one block', rendered.blocks.includes('1,2 P'), rendered.blocks.join(' | '))
check('every block knows its source lines',
  JSON.stringify(rendered.blocks) === JSON.stringify(['0,0 H4', '1,2 P', '4,4 LI', '5,5 LI', '6,6 LI', '7,7 LI']),
  rendered.blocks.join(' | '))

/* A URL written on its own is a link, the same as one in brackets, and the
   two bracket forms that turn up in prose get a colour. All three keep every
   character they were written with — see MD_LATE_RE — which is what lets the
   caret arithmetic below stay as simple as it is. */
check('a bare URL is a link',
  /<a href="https:\/\/hr\.example\.com\/forms\/probation"[^>]*>https:\/\/hr\.example\.com\/forms\/probation<\/a>/
    .test(rendered.html), rendered.html.slice(rendered.html.indexOf('hr.example') - 60, 200))
check('and it stops at the word after it', !/probation today<\/a>/.test(rendered.html))
check('the link already in brackets is untouched',
  (rendered.html.match(/<a /g) || []).length === 2, String((rendered.html.match(/<a /g) || []).length))
check('a placeholder is picked out, brackets and all',
  /<em class="mdhole">\[path\]<\/em>/.test(rendered.html) &&
  /<em class="mdhole">\[fill in\]<\/em>/.test(rendered.html), rendered.html.slice(-220))
check('and a [key:: value] tag gets the quieter chip',
  /<em class="mdtag">\[due:: 2026-09-20\]<\/em>/.test(rendered.html), rendered.html.slice(-220))
check('the raw text is the note without its indent',
  rendered.raw.split('\n')[0] === '# Probation review', JSON.stringify(rendered.raw.split('\n')[0]))

/* The point of the whole exercise: click a word in the rendering, land on that
   word in the source. The coordinates are real ones, measured off the word
   itself, because the caret arithmetic starts from a hit test the browser
   does — and a hit test only works on something actually on screen, hence the
   scroll. Blur first, so each click starts from the rendered state. */
async function clickWord (sel, word) {
  await settle()
  return evalJS(`
    (() => {
      const ta = document.querySelector('#f-body'), view = document.querySelector('#f-body-view');
      ta.blur();
      const el = [...document.querySelectorAll(${JSON.stringify(sel)})]
        .find(n => n.textContent.includes(${JSON.stringify(word)}));
      if (!el) return { error: 'no element holding ' + ${JSON.stringify(word)} };
      el.scrollIntoView({ block: 'center' });
      // The word itself, measured inside its own text node.
      const node = [...el.childNodes].find(n => n.nodeType === 3 && n.nodeValue.includes(${JSON.stringify(word)}))
        || el.firstChild;
      const at = node.nodeValue.indexOf(${JSON.stringify(word)});
      const r = document.createRange();
      r.setStart(node, at);
      r.setEnd(node, at + ${JSON.stringify(word)}.length);
      const box = r.getBoundingClientRect();
      const x = box.left + 1, y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      view.onclick({ target: node.parentElement, clientX: x, clientY: y, preventDefault(){} });
      const i = ta.selectionStart;
      return { i, at: ta.value.slice(i, i + ${JSON.stringify(word)}.length), hidden: ta.hidden,
               viewHidden: view.hidden, hit: hit && hit.tagName };
    })()
  `)
}

const c1 = await clickWord('#f-body-view p', 'fortnight')
check('clicking a plain word opens the editor', c1.hidden === false && c1.viewHidden === true)
check('and the caret lands on that word', c1.at === 'fortnight', JSON.stringify(c1))

const c2 = await clickWord('#f-body-view strong', 'form')
check('a click inside **bold** lands past the asterisks', c2.at === 'form', JSON.stringify(c2))

const c3 = await clickWord('#f-body-view code', 'Monday')
check('a click inside `code` lands past the backtick', c3.at === 'Monday', JSON.stringify(c3))

const c4 = await clickWord('#f-body-view h4', 'review')
check('a click in a heading lands past the hash', c4.at === 'review', JSON.stringify(c4))

/* Everything a link takes up on screen is its label; the URL is not there to
   be clicked past. A click on the word after it has to skip the whole thing. */
const c5 = await clickWord('#f-body-view li', 'first')
check('a click after a link skips its URL', c5.at === 'first', JSON.stringify(c5))

/* The three chips above keep their brackets, so the count of characters that
   survive rendering is unchanged and a click after one of them still lands
   where it should. These are the checks that would catch a chip that dropped
   its notation. */
const c6 = await clickWord('#f-body-view li', 'today')
check('a click after a bare URL lands right', c6.at === 'today', JSON.stringify(c6))

const c7 = await clickWord('#f-body-view .mdhole', 'path')
check('a click on a placeholder lands inside it', c7.at === 'path', JSON.stringify(c7))

const c8 = await clickWord('#f-body-view .mdtag', '2026-09-20')
check('and a click in a tag lands in its value', c8.at === '2026-09-20', JSON.stringify(c8))

await evalJS(`document.querySelector('#f-body').blur()`)

/* A link is the one thing in the rendering that is not a way into the editor —
   it is a way to the page it points at. */
const linkClick = await evalJS(`
  (() => {
    const a = document.querySelector('#f-body-view a');
    const ta = document.querySelector('#f-body');
    const wasHidden = ta.hidden;
    document.querySelector('#f-body-view').onclick({ target: a, clientX: 0, clientY: 0, preventDefault(){} });
    return { wasHidden, stillHidden: ta.hidden };
  })()
`)
check('clicking a link does not open the editor', linkClick.stillHidden === true && linkClick.wasHidden === true)

/* Typing, then leaving: the text reaches the task and the rendering comes back
   showing what was typed. Escape is the same exit as blur. */
const round = await evalJS(`
  (() => {
    const view = document.querySelector('#f-body-view'), ta = document.querySelector('#f-body');
    view.onclick({ target: view, clientX: 0, clientY: 0, preventDefault(){} });
    ta.value = '# Probation review\\n\\nNow it says **something else**.';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    return { hidden: ta.hidden, viewHidden: view.hidden, html: view.innerHTML,
             body: window.__t.body.join('\\n'), dirty: state.dirty };
  })()
`)
check('Escape closes the editor', round.hidden === true && round.viewHidden === false)
check('and the rendering shows what was typed',
  /<strong>something else<\/strong>/.test(round.html), round.html)
check('and the task carries the new text, indented',
  round.body.includes('  Now it says **something else**.'), JSON.stringify(round.body))
check('and the document is marked dirty', round.dirty === true)

/* An empty note is a normal state and says so, and is still a way in. */
const empty = await evalJS(`
  (() => {
    window.__t.body = [];
    openDrawer(window.__t.id);
    const view = document.querySelector('#f-body-view'), ta = document.querySelector('#f-body');
    const text = view.textContent;
    view.onclick({ target: view, clientX: 0, clientY: 0, preventDefault(){} });
    return { text, opened: !ta.hidden, caret: ta.selectionStart };
  })()
`)
check('an empty note says so', /Nothing written yet/.test(empty.text), empty.text)
check('and clicking it still opens the editor', empty.opened === true && empty.caret === 0)

/* ---- Height: a short default, an Expand button, and a draggable corner ----
   One height on both halves of the field, so nothing below it moves when the
   note swaps between rendered and raw. The button and the drag are two ways
   into the same stored number, which is why the label is read off the height
   rather than off a flag of its own. */
const heights = await evalJS(`
  (() => {
    localStorage.removeItem('todo-board-note-height');
    window.__t.body = ${JSON.stringify(NOTE)}.split(String.fromCharCode(10));
    openDrawer(window.__t.id);
    const view = document.querySelector('#f-body-view'), ta = document.querySelector('#f-body');
    const grow = document.querySelector('#f-body-grow');
    const start = { view: view.offsetHeight, ta: ta.style.height, label: grow.textContent };
    // Into the editor and back: the field must not change height either way.
    view.onclick({ target: view, clientX: 0, clientY: 0, preventDefault(){} });
    const editing = ta.offsetHeight;
    ta.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    grow.onclick({ preventDefault(){}, stopPropagation(){} });
    const big = { view: view.offsetHeight, ta: parseInt(ta.style.height, 10), label: grow.textContent,
                  stored: +localStorage.getItem('todo-board-note-height') };
    grow.onclick({ preventDefault(){}, stopPropagation(){} });
    const back = { view: view.offsetHeight, label: grow.textContent,
                   stored: +localStorage.getItem('todo-board-note-height') };
    return { start, editing, big, back, open: document.querySelector('[data-collapse="notes"]').open };
  })()
`)
check('the field starts at its short height', heights.start.view === 120, JSON.stringify(heights.start))
check('and the label offers to expand it', heights.start.label === 'Expand')
check('clicking into the note does not change the height', heights.editing === 120, String(heights.editing))
check('Expand grows it', heights.big.view > 200, JSON.stringify(heights.big))
check('and grows both halves to the same height', heights.big.ta === heights.big.view, JSON.stringify(heights.big))
check('and remembers it', heights.big.stored === heights.big.view, JSON.stringify(heights.big))
check('and the label now offers to collapse it', heights.big.label === 'Collapse')
check('Collapse puts it back', heights.back.view === 120 && heights.back.stored === 120, JSON.stringify(heights.back))
check('and the button never puts the section away', heights.open === true)

/* The corner is a browser control with no event of its own — dragging it is
   heard through a ResizeObserver, so this sets a height the way a drag does
   and waits a frame for the observer to catch it. */
const dragged = await evalJS(`
  (async () => {
    const view = document.querySelector('#f-body-view'), ta = document.querySelector('#f-body'),
          grow = document.querySelector('#f-body-grow');
    view.style.height = '310px';
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { view: view.offsetHeight, ta: parseInt(ta.style.height, 10), label: grow.textContent,
             stored: +localStorage.getItem('todo-board-note-height') };
  })()
`)
check('a drag on the corner is heard', dragged.stored === 310, JSON.stringify(dragged))
check('and carries to the textarea and the button', dragged.ta === 310 && dragged.label === 'Collapse', JSON.stringify(dragged))

const reopened = await evalJS(`
  (() => {
    openDrawer(window.__t.id);
    return document.querySelector('#f-body-view').offsetHeight;
  })()
`)
check('and the next task opens at that height', reopened === 310, String(reopened))
await evalJS(`localStorage.removeItem('todo-board-note-height')`)

/* The line about subtasks moved out from under the field and up beside the
   label, where Subtasks' own Complete all already sits. */
const label = await evalJS(`
  (() => {
    const det = document.querySelector('[data-collapse="notes"]');
    return { summary: det.querySelector('summary').textContent,
             under: [...det.children].filter(c => c.tagName !== 'SUMMARY').map(c => c.tagName) };
  })()
`)
check('the note about subtasks sits beside the label',
  /Subtasks are in the list below/.test(label.summary), label.summary)
/* The field itself is Tenon's Textarea since 26 Sep 2026, mounted into a host
   div rather than drawn as a raw <textarea> — so what sits under the label is
   the rendered view and that host, not the field tag directly. #f-body is
   still found by id, inside it. */
check('and nothing trails under the field',
  JSON.stringify(label.under) === JSON.stringify(['DIV', 'DIV']), JSON.stringify(label.under))

/* ---- The lines the second column already draws ----
   A suggested message, a prompt, an agenda, a Jira ticket, the project folder
   and a `Waiting on:` note are each pulled out and drawn properly on the right
   of this same panel, so the field holds the prose and nothing else. Held back
   rather than hidden: the field's content is what gets written on commit, so
   the real test is the second half — that an edit to the prose puts every held
   line back where it was rather than deleting it.

   Both halves in one fixture on purpose. A test that only checked what the
   field shows would pass just as happily against a change that dropped the
   lines on the floor. */
const MIXED = [
  '  Real prose, the first line.',
  '  - Stream: audits. Stays, because nothing else draws it.',
  '  - Waiting on: HR, chased 3 Sep.',
  '  - Project: `data/projects/probation-pack`',
  '  - Suggested message: "Hi Ana, any word on the 360?"',
  '  - Prompt: "Draft the form from the notes"',
  '  - Jira (DSYS): "Raise the rename"',
  '  - Description: "The body of the ticket"',
  '  - Agenda:',
  '    - AOP2027',
  '      - Confirm the rescope',
  '  Real prose, the last line.'
].join('\n')

const split = await evalJS(`
  (() => {
    window.__t.body = ${JSON.stringify(MIXED)}.split('\\n');
    openDrawer(window.__t.id);
    return { raw: document.querySelector('#f-body').value,
             view: document.querySelector('#f-body-view').textContent };
  })()
`)
await settle()
check('the field holds the prose and the unhomed lines only',
  split.raw === 'Real prose, the first line.\n- Stream: audits. Stays, because nothing else draws it.\nReal prose, the last line.',
  JSON.stringify(split.raw))
check('and the rendering shows the same, not the raw note',
  !/Suggested message|Agenda|Jira/.test(split.view), JSON.stringify(split.view))

/* Every one of them still on the task, and still drawn on the right. */
const drawn = await evalJS(`
  (() => {
    const side = document.querySelector('.dcol-side');
    const heads = [...side.querySelectorAll('details.sugg')]
      .filter(d => !d.querySelector('p.empty'))
      .map(d => d.querySelector('summary').textContent.trim().split(' ')[0]);
    return { heads, deps: side.querySelector('[data-collapse="sugg:deps"]').textContent };
  })()
`)
check('the held lines are drawn in the column beside it',
  ['Project', 'Dependencies', 'Meeting', 'Message', 'Prompt', 'Jira'].every(h => drawn.heads.some(x => x.startsWith(h))),
  JSON.stringify(drawn.heads))
check('and a `Waiting on:` note reads as a dependency',
  /HR, chased 3 Sep/.test(drawn.deps), drawn.deps.slice(0, 120))

/* The half that matters. Type over the prose and the held lines come back. */
const merged = await evalJS(`
  (() => {
    const view = document.querySelector('#f-body-view'), ta = document.querySelector('#f-body');
    view.onclick({ target: view, clientX: 0, clientY: 0, preventDefault(){} });
    ta.value = 'Rewritten prose.';
    ta.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    return window.__t.body.join('\\n');
  })()
`)
check('an edit to the prose keeps every held line',
  ['Waiting on: HR', 'Project: `data/projects', 'Suggested message:', 'Prompt:', 'Jira (DSYS):',
   'Description: "The body', '- Agenda:', 'AOP2027', 'Confirm the rescope'].every(f => merged.includes(f)),
  JSON.stringify(merged))
check('and puts them back in the order they were in',
  merged.indexOf('Waiting on') < merged.indexOf('Project:') &&
  merged.indexOf('Suggested message') < merged.indexOf('Prompt:') &&
  merged.indexOf('Jira (DSYS)') < merged.indexOf('Description:') &&
  merged.indexOf('- Agenda:') < merged.indexOf('AOP2027'),
  JSON.stringify(merged))
check('and the new prose is the only thing that changed',
  merged.includes('Rewritten prose.') && !merged.includes('Real prose'),
  JSON.stringify(merged))

/* An untouched note round-trips byte for byte — the field is opened, left
   alone and committed, which is what closing the drawer does. */
const untouched = await evalJS(`
  (() => {
    const before = ${JSON.stringify(MIXED)}.split('\\n');
    window.__t.body = before.slice();
    openDrawer(window.__t.id);
    const view = document.querySelector('#f-body-view'), ta = document.querySelector('#f-body');
    view.onclick({ target: view, clientX: 0, clientY: 0, preventDefault(){} });
    ta.value = ta.value + ' ';
    ta.value = ta.value.slice(0, -1);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', bubbles:true }));
    return { same: JSON.stringify(window.__t.body) === JSON.stringify(before), got: window.__t.body };
  })()
`)
check('a note nobody edited comes back exactly as it was', untouched.same,
  untouched.same ? '' : JSON.stringify(untouched.got))

/* The whole point of the second guard. Typing into the Description marks the
   document dirty, and the tab was unlocked above so the field would behave as
   it does in real use, so autosave does try — and this is the recording of it
   being stopped. Nothing reached disk; what it aimed at is worth asserting
   too, since the only file this field is ever allowed to change is todo.md
   and it is only ever allowed to get there through the board's own save. */
const blocked = await evalJS(`window.__blocked`)
check('every write the page tried was stopped', blocked.length > 0, JSON.stringify(blocked))
check('and every one of them was the board\'s own save, not a new route',
  blocked.every(b => /^(PUT|HEAD) \/data\/todo\.md$/.test(b)), JSON.stringify(blocked))

chrome.kill()
const failed = checks.filter(c => !c).length
console.log(`\n${checks.length - failed}/${checks.length} passed`)
process.exit(failed ? 1 : 0)
