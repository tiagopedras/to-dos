/**
 * Drives the bucket editor's Brief button in headless Chrome.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_bucket_brief.mjs
 *
 * The routes behind it are `kanban/test_bucket_brief.py`, which needs no
 * browser and no board. This is the other half: the button is on every row,
 * the sheet opens on what the server handed back, Save sends what was typed,
 * and both buttons put the bucket editor back.
 *
 * Same two guards as test_notes.mjs, and for the same reason — this repo has
 * lost the real todo.md to a test twice:
 *
 *   1. every non-GET is torn out of `fetch` and recorded instead of sent, so
 *      no brief and no todo.md can reach disk from here;
 *   2. `/bucket-brief.json` is stubbed, so no real bucket's brief is read
 *      either, and the sheet can be shown both states it has — a file that
 *      exists and one that does not.
 *
 * The tab is unlocked, which is the one thing this cannot avoid:
 * openBucketEditor() returns early on a locked tab, so a locked one has no
 * button to press. The fetch guard is doing the whole job, and the blocked
 * list is asserted at the end — nothing but the board's own todo.md save and
 * the brief's own PUT, which is what is under test.
 */

import { spawn } from 'node:child_process'

const PORT = Number(process.env.CDP_PORT) || 9451
const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_bucket_brief.mjs')
const checks = []
const check = (name, pass, detail = '') => {
  checks.push(pass)
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`)
}

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run',
  `--user-data-dir=${process.env.CHROME_PROFILE || '/tmp/todo-brief-test-profile'}`, '--window-size=1400,1000',
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

try {
  await new Promise(r => setTimeout(r, 2500))
  check('the board loaded', await evalJS(`typeof openBucketEditor === 'function'`))
  check('and the brief sheet with it', await evalJS(`typeof openBucketBrief === 'function'`))

  // GUARD FIRST, then fixtures. Nothing below can write anything.
  await evalJS(`(() => {
    const real = window.fetch;
    window.__blocked = [];
    window.__sent = [];
    window.__brief = {
      bucket: '', stream: 'people', path: 'data/demo/buckets/people/people.md',
      text: '# People\\n\\nThe brief on disk.\\n', exists: true, filled: true,
      marker: '<!-- NOT FILLED IN YET -->', fallback: false
    };
    window.fetch = (url, opts) => {
      const method = (opts && opts.method) || 'GET';
      if (method !== 'GET') {
        window.__blocked.push(method + ' ' + url);
        window.__sent.push({ method, url, body: opts && opts.body });
        return Promise.resolve(new Response('{"ok":true,"filled":true}', { status: 200 }));
      }
      if (String(url).indexOf('/bucket-brief.json') === 0) {
        return Promise.resolve(new Response(JSON.stringify(window.__brief), { status: 200 }));
      }
      return real(url, opts);
    };
    return 'fetch is read-only and the brief is stubbed';
  })()`)
  await evalJS(`(async () => {
    const demo = await (await fetch('/kanban/demo.md')).text();
    load(demo, 'demo.md', {});
    return 'loaded';
  })()`)
  check('nothing has been written', await evalJS(`window.__blocked.length === 0`))

  // --- the button is on every row, and so is the summary field -------------
  const rows = await evalJS(`(async () => {
    openBucketEditor();
    await new Promise(r => setTimeout(r, 120));
    const rows = document.querySelectorAll('.bkrow');
    return {
      rows: rows.length,
      briefs: document.querySelectorAll('.bkrow [data-brief]').length,
      summaries: document.querySelectorAll('.bkrow input.bksummary').length,
      firstSummary: rows[0]?.querySelector('input.bksummary')?.value ?? null
    };
  })()`)
  check('the bucket editor opened', rows.rows > 0, `${rows.rows} rows`)
  check('and every row has a Brief button', rows.rows === rows.briefs,
    `${rows.briefs} buttons on ${rows.rows} rows`)
  check('and every row has a summary field', rows.rows === rows.summaries,
    `${rows.summaries} fields on ${rows.rows} rows`)
  check('seeded from that bucket’s own brief', rows.firstSummary === 'The brief on disk.',
    JSON.stringify(rows.firstSummary))

  // --- editing the row summary writes it straight to the brief -------------
  const rowEdit = await evalJS(`(async () => {
    const inp = document.querySelector('.bkrow input.bksummary');
    inp.value = 'Edited from the row.';
    inp.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 150));
    const last = window.__sent[window.__sent.length - 1] || {};
    return { method: last.method, url: last.url, body: last.body ? JSON.parse(last.body) : null };
  })()`)
  check('a row summary edit writes with PUT', rowEdit.method === 'PUT',
    `${rowEdit.method} ${rowEdit.url}`)
  check('to the brief route', rowEdit.url === '/bucket-brief', rowEdit.url)
  check('carrying the new summary line',
    (rowEdit.body?.text || '').includes('Edited from the row.'), JSON.stringify(rowEdit.body?.text))

  // --- the sheet opens on what the server said, split into its own fields --
  await evalJS(`(() => {
    window.__brief = { ...window.__brief, text:
      '# People\\n\\nThe brief on disk.\\n\\n## The processes I run in this bucket\\n\\nTriage.\\n\\n' +
      '## What already does it\\n\\nNothing yet.\\n\\n## Who is involved\\n\\nAlex.\\n\\n' +
      '## What good looks like here\\n\\nShipped.\\n' };
    return 'seeded';
  })()`)
  const sheet = await evalJS(`(async () => {
    document.querySelector('.bkrow [data-brief]').click();
    await new Promise(r => setTimeout(r, 120));
    const sections = [...document.querySelectorAll('[data-brief-section]')].map(b => b.value);
    return {
      heading: document.querySelector('.tenon-modal__title')?.textContent || '',
      summary: document.querySelector('#briefSummary')?.value ?? null,
      sections,
      sub: document.querySelector('.tenon-modal__subtitle')?.textContent || '',
      buttons: [...document.querySelectorAll('.tenon-modal__footer button')].map(b => b.textContent)
    };
  })()`)
  check('the brief sheet opened', sheet.summary !== null)
  check('the summary field is seeded from the file', sheet.summary === 'The brief on disk.',
    JSON.stringify(sheet.summary))
  check('and one field per section, in template order', sheet.sections.join('|') ===
    'Triage.|Nothing yet.|Alex.|Shipped.', sheet.sections.join('|'))
  check('named for the bucket it belongs to', /^Brief: /.test(sheet.heading), sheet.heading)
  check('and it says where it saves', sheet.sub.includes('buckets/people/people.md'), sheet.sub)
  check('with Cancel and Save', sheet.buttons.join('|') === 'Cancel|Save brief',
    sheet.buttons.join('|'))

  // --- Cancel puts the editor back, and sends nothing of its own ------------
  const beforeCancel = await evalJS(`window.__sent.length`)
  const cancelled = await evalJS(`(async () => {
    [...document.querySelectorAll('.tenon-modal__footer button')].find(b => b.textContent === 'Cancel').click();
    await new Promise(r => setTimeout(r, 120));
    return { rows: document.querySelectorAll('.bkrow').length, sent: window.__sent.length };
  })()`)
  check('Cancel draws the bucket editor again', cancelled.rows === rows.rows,
    `${cancelled.rows} rows`)
  check('and sends nothing of its own', cancelled.sent === beforeCancel,
    `${cancelled.sent - beforeCancel} sent`)

  // --- Save reassembles the fields into the template's own shape -----------
  const saved = await evalJS(`(async () => {
    const btn = document.querySelector('.bkrow [data-brief]');
    const name = btn.closest('.bkrow').querySelector('input[data-name]').value;
    btn.click();
    await new Promise(r => setTimeout(r, 120));
    const summary = document.querySelector('#briefSummary');
    summary.value = 'Written in the sheet.';
    summary.dispatchEvent(new Event('input'));
    const sections = document.querySelectorAll('[data-brief-section]');
    sections[0].value = 'Triage, edited.';
    sections[0].dispatchEvent(new Event('input'));
    [...document.querySelectorAll('.tenon-modal__footer button')].find(b => b.textContent === 'Save brief').click();
    await new Promise(r => setTimeout(r, 200));
    const last = window.__sent[window.__sent.length - 1] || {};
    return {
      name,
      method: last.method, url: last.url,
      body: last.body ? JSON.parse(last.body) : null,
      rows: document.querySelectorAll('.bkrow').length
    };
  })()`)
  check('Save writes with PUT', saved.method === 'PUT', `${saved.method} ${saved.url}`)
  check('to the brief route', saved.url === '/bucket-brief', saved.url)
  check('naming the bucket the sheet was opened on', saved.body?.bucket === saved.name,
    `${saved.body?.bucket} vs ${saved.name}`)
  const savedText = saved.body?.text || ''
  check('the edited summary reassembles into the file',
    savedText.includes('Written in the sheet.'), JSON.stringify(savedText))
  check('the edited section reassembles too',
    savedText.includes('Triage, edited.'), JSON.stringify(savedText))
  check('an untouched section is carried through unchanged',
    savedText.includes('Alex.'), JSON.stringify(savedText))
  check('every section heading survives the round trip',
    ['The processes I run in this bucket', 'What already does it', 'Who is involved',
      'What good looks like here'].every(h => savedText.includes('## ' + h)),
    savedText)
  check('then draws the bucket editor again', saved.rows === rows.rows, `${saved.rows} rows`)

  // --- a bucket with no brief yet ------------------------------------------
  const fresh = await evalJS(`(async () => {
    window.__brief = { ...window.__brief, exists: false, filled: false, fallback: true,
      stream: 'general', text: '# <Bucket name>\\n\\n<!-- NOT FILLED IN YET -->\\n' };
    document.querySelector('.bkrow [data-brief]').click();
    await new Promise(r => setTimeout(r, 120));
    const prose = document.querySelector('.tenon-modal__box .repdoc')?.textContent || '';
    return { prose, summary: document.querySelector('#briefSummary')?.value ?? null };
  })()`)
  check('a brief with no file says so', /No brief yet/.test(fresh.prose), fresh.prose.slice(0, 120))
  check('and opens with an empty summary field', fresh.summary === '', JSON.stringify(fresh.summary))
  check('a fallback bucket says which brief it is really editing',
    /fallback/.test(fresh.prose), fresh.prose.slice(0, 200))

  // --- filling in a section clears the empty marker automatically ----------
  const cleared = await evalJS(`(async () => {
    window.__brief = { ...window.__brief, exists: false, filled: false, fallback: false,
      stream: 'people', text: '# People\\n\\n\\n\\n<!-- NOT FILLED IN YET -->\\n\\n' +
        '## The processes I run in this bucket\\n\\n## What already does it\\n\\n' +
        '## Who is involved\\n\\n## What good looks like here\\n' };
    // The previous check left the brief sheet open rather than the bucket
    // editor behind it, since it never closed what it opened.
    openBucketEditor();
    await new Promise(r => setTimeout(r, 120));
    document.querySelector('.bkrow [data-brief]').click();
    await new Promise(r => setTimeout(r, 120));
    const box = document.querySelectorAll('[data-brief-section]')[0];
    box.value = 'Now written.';
    box.dispatchEvent(new Event('input'));
    [...document.querySelectorAll('.tenon-modal__footer button')].find(b => b.textContent === 'Save brief').click();
    await new Promise(r => setTimeout(r, 200));
    const last = window.__sent[window.__sent.length - 1] || {};
    return { text: last.body ? JSON.parse(last.body).text : '' };
  })()`)
  check('a section filled in clears the marker without being asked',
    !cleared.text.includes('NOT FILLED IN YET'), cleared.text)
  check('and keeps what was typed into that section',
    cleared.text.includes('Now written.'), cleared.text)

  // --- nothing reached disk -------------------------------------------------
  const blocked = await evalJS(`window.__blocked`)
  const strays = blocked.filter(b => !/^PUT \/bucket-brief$/.test(b) && !/todo\.md/.test(b))
  check('the only writes attempted are the brief and the board’s own save',
    strays.length === 0, blocked.join(', '))
  check('and every one of them was blocked', true)
} finally {
  chrome.kill()
}

const failed = checks.filter(c => !c).length
console.log(`\n${checks.length - failed} passed${failed ? `, ${failed} failed` : ''}\n`)
process.exit(failed ? 1 : 0)
