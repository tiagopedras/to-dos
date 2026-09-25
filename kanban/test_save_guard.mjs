/* The preconditions on PUT /data/todo.md, checked against the running server.
 *
 *   python3 kanban/server.py &          # or BOARD_PORT=... at one already up
 *   node kanban/test_save_guard.mjs
 *
 * No browser and no headless Chrome: this is the server's own contract, and
 * every question it asks is asked over plain HTTP.
 *
 * Safe against the live list by construction, which is the point worth reading
 * before changing anything here. Every PUT below is meant to be refused, and a
 * refusal writes nothing — but a broken guard would write, so the body of each
 * one is the file's own current bytes, read a moment earlier. The worst a
 * regression can do here is rewrite todo.md with what it already said. Never
 * give one of these a body of its own.
 *
 * What that leaves uncovered is the accepting half: no test here proves a
 * correct If-Match writes, because proving it means a real write, and the only
 * place that is allowed is the _test dataset (see to-dos/CLAUDE.md). The
 * refusals are what the guard exists for.
 */

const BOARD = process.env.BOARD_PORT || 8765
if (!process.env.BOARD_PORT) console.error('Note: this runs against the live board on 8765. For a throwaway copy: scripts/test-board.sh test_save_guard.mjs')
const BASE = `http://127.0.0.1:${BOARD}`
const FILE = `${BASE}/data/todo.md`

let pass = 0
const fails = []
function ok (label, cond, detail) {
  if (cond) { pass++; return }
  fails.push(detail ? `${label} — ${detail}` : label)
}

async function readFile () {
  const res = await fetch(`${FILE}?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GET todo.md answered ${res.status}`)
  return {
    text: await res.text(),
    stamp: res.headers.get('Last-Modified'),
    hash: res.headers.get('X-Todo-Hash')
  }
}

/* Always the file's own bytes. See the header. */
function put (body, headers) {
  return fetch(FILE, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', ...headers },
    body
  })
}

async function main () {
  let live
  try {
    live = await readFile()
  } catch (err) {
    console.error(`\nCould not reach the board helper at ${BASE} — ${err.message}`)
    console.error('Start it with: python3 kanban/server.py &\n')
    process.exit(2)
  }

  // --- the hash is served at all, on both verbs the board uses ---------------

  ok('GET carries X-Todo-Hash', !!live.hash,
    'no X-Todo-Hash header on the read — is this server from before the guard landed?')
  ok('the hash is a short hex digest', /^[0-9a-f]{16}$/.test(live.hash || ''),
    `got ${JSON.stringify(live.hash)}`)
  ok('GET still carries Last-Modified', !!live.stamp)

  const head = await fetch(FILE, { method: 'HEAD', cache: 'no-store' })
  ok('HEAD carries the same hash', head.headers.get('X-Todo-Hash') === live.hash,
    `HEAD said ${head.headers.get('X-Todo-Hash')}, GET said ${live.hash}`)
  ok('HEAD carries the same stamp', head.headers.get('Last-Modified') === live.stamp)

  // The watcher polls with HEAD and never reads a body, so the hash has to be
  // there without one. A body on a HEAD response would be a protocol bug.
  ok('HEAD sends no body', (await head.text()) === '')

  // --- the stamp precondition, which was already here -----------------------

  const none = await put(live.text, {})
  ok('a write with no precondition is refused', none.status === 428,
    `answered ${none.status}`)
  const noneInfo = await none.json().catch(() => ({}))
  ok('and says so as a precondition failure', noneInfo.precondition === true)

  const oldStamp = await put(live.text, {
    'If-Unmodified-Since': 'Sat, 01 Jan 2000 00:00:00 GMT',
    'If-Match': live.hash
  })
  ok('a write carrying a stale stamp is refused', oldStamp.status === 409,
    `answered ${oldStamp.status}`)
  const oldStampInfo = await oldStamp.json().catch(() => ({}))
  ok('the refusal names the version on disk', oldStampInfo.stale === true &&
    oldStampInfo.disk === live.stamp)
  ok('and hands back the current hash', oldStampInfo.hash === live.hash,
    `got ${oldStampInfo.hash}`)

  // --- the content precondition, which is the new half ----------------------

  // The case the stamp cannot see: the timestamp this tab agreed with is still
  // the one on disk, and the content underneath it is not. Second-precision is
  // what lets that happen for real; here it is simply asserted directly.
  const wrongHash = await put(live.text, {
    'If-Unmodified-Since': live.stamp,
    'If-Match': '0123456789abcdef'
  })
  ok('a current stamp with the wrong content hash is refused', wrongHash.status === 409,
    `answered ${wrongHash.status} — the stamp passed and nothing checked the bytes`)
  const wrongInfo = await wrongHash.json().catch(() => ({}))
  ok('the content refusal reads as stale too', wrongInfo.stale === true)
  ok('and hands back the hash to retry against', wrongInfo.hash === live.hash,
    `got ${wrongInfo.hash}`)

  // --- nothing above moved the file ----------------------------------------

  const after = await readFile()
  ok('todo.md is untouched by the whole run', after.hash === live.hash,
    `hash moved from ${live.hash} to ${after.hash}`)
  ok('and its bytes are what they were', after.text === live.text)

  console.log(`\n${pass} checks passed${fails.length ? `, ${fails.length} failed` : ''}`)
  if (fails.length) {
    for (const f of fails) console.error(`  ✗ ${f}`)
    process.exit(1)
  }
  console.log('the save guard refuses a stale stamp and stale content, and writes nothing\n')
}

main().catch(err => { console.error(err); process.exit(1) })
