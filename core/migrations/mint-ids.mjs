/**
 * Gives every top-level task in a list file a stable id.
 *
 *   node core/migrations/mint-ids.mjs --dry-run [path]     write nothing, print the diff
 *   node core/migrations/mint-ids.mjs [path]               do it
 *
 * Surgical on purpose. It appends one token to each task line and changes no
 * other byte, rather than reparsing the document and writing it back. A full
 * re-serialise would rewrite all 137 lines into canonical tag order at once,
 * which makes the diff unreadable and applies any writer bug 137 times before
 * anyone can see it. One appended token per line gives a diff that can be read
 * in a minute, and `id` is written last among the tags precisely so that an
 * appended token is already where the board's own writer would have put it.
 *
 * Everything else about each line is left alone and normalises lazily, the next
 * time that task is actually edited. That is how the tag-syntax change of 12
 * August was handled too: both forms read for ever, no migration window.
 *
 * It refuses to run while anything else could be writing the file. The board
 * holds the whole document in memory and autosaves within four seconds of
 * anything marking it dirty, and rollRecurring marks it dirty on every load, so
 * a tab left open from before this ran would put the old version straight back.
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import vm from 'node:vm'
import { execSync } from 'node:child_process'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..', '..')
const WANTED = ['TASK_RE', 'BUCKET_RE', 'parseTask', 'serializeTask', 'parseDoc', 'serializeDoc', 'mintId']
const board = vm.runInNewContext(
  fs.readFileSync(path.join(ROOT, 'core', 'todo.js'), 'utf8') + '\n;({ ' + WANTED.join(', ') + ' });\n',
  {}, { filename: 'core/todo.js' })

const args = process.argv.slice(2)
const dry = args.includes('--dry-run')
const target = args.find(a => !a.startsWith('--')) ||
  path.join(ROOT, 'data', fs.readFileSync(path.join(ROOT, 'data', '.current'), 'utf8').trim(), 'todo.md')

const die = m => { console.error(`\nREFUSED: ${m}\n`); process.exit(1) }
const ok = m => console.log(`  ok   ${m}`)

/* ---- 1. nothing else may be writing --------------------------------------- */
console.log(`\n${dry ? 'DRY RUN' : 'MIGRATING'} ${target}\n`)
if (!dry) {
  const running = cmd => { try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' } }
  if (running('pgrep -f "kanban/server.py"')) die('the board helper is running. Quit To-Do Board.app and kill it first.')
  if (running('pgrep -f "To-Do Companion"')) die('the companion is running. Quit it first.')
  for (const lock of ['data/.night-agent.lock', path.join(path.dirname(target), 'companion.lock')])
    if (fs.existsSync(path.join(ROOT, lock))) die(`${lock} exists, so something else thinks it holds this list.`)
  ok('nothing else is holding the list')
}

const before = fs.readFileSync(target, 'utf8')
const lines = before.split('\n')

/* ---- 2. find the task lines, the same way both parsers do ----------------- */
const doc = board.parseDoc(before)
const parsedCount = doc.buckets.reduce((n, b) => n + b.tiers.reduce((m, t) => m + t.tasks.length, 0), 0)

let inBuckets = false, ended = false
const isTaskLine = []
for (const line of lines) {
  if (/^##\s/.test(line)) {
    if (board.BUCKET_RE.test(line)) inBuckets = true
    else if (inBuckets) ended = true          // the Context section; the same guard both parsers use
  }
  isTaskLine.push(inBuckets && !ended && board.TASK_RE.test(line))
}
const targets = isTaskLine.filter(Boolean).length
if (targets !== parsedCount) die(`found ${targets} task lines but the parser sees ${parsedCount}`)
ok(`${targets} top-level task lines, and the parser agrees`)

/* ---- 3. mint, avoiding anything already in the file ----------------------- */
const taken = new Set()
for (const b of doc.buckets) for (const t of b.tiers) for (const x of t.tasks) {
  if (x.stableId) taken.add(x.stableId)
  if (x.chat) taken.add(x.chat)               // not required, but a chat key and an id that match read as one thing
}
const already = [...taken].length
const after = lines.map((line, i) => {
  if (!isTaskLine[i]) return line
  if (/`id:[a-z0-9]{6}`/.test(line)) return line
  const key = board.mintId(taken); taken.add(key)
  return line + ' `id:' + key + '`'
})
const text = after.join('\n')
const changed = after.filter((l, i) => l !== lines[i]).length
ok(`${changed} lines gained an id (${already ? already + ' keys already in the file avoided' : 'file had none'})`)

/* ---- 4. the checks ------------------------------------------------------- */
if (after.length !== lines.length) die('line count moved')
ok('line count unchanged')

for (let i = 0; i < lines.length; i++) {
  if (after[i] === lines[i]) continue
  const gained = after[i].startsWith(lines[i]) ? after[i].slice(lines[i].length) : null
  if (gained === null || !/^ `id:[a-z0-9]{6}`$/.test(gained))
    die(`line ${i + 1} changed by more than one appended token:\n    was: ${lines[i]}\n    now: ${after[i]}`)
}
ok('every changed line is the old line plus exactly one token')

const ids = after.filter((l, i) => isTaskLine[i]).map(l => (l.match(/`id:([a-z0-9]{6})`/) || [])[1])
if (ids.some(x => !x)) die('a task line came out without an id')
if (new Set(ids).size !== ids.length) die('two tasks share an id')
ok(`${ids.length} ids, all distinct, all six characters`)

/* Not "the writer reproduces this line": it would not, and should not be
   expected to. The file is hand-edited by the pa skill, and serializeTask only
   rewrites a line when that task is dirty, so plenty of lines carry a tag order
   nobody has ever normalised. Forty of them, at the time of writing.

   The property that actually matters is that appending the id perturbs nothing
   else: whatever the writer would have made of the old line, it makes exactly
   that plus the id in its canonical last position. That holds whatever order
   the line arrived in, and it is what proves the token is in the right place. */
const write = line => board.serializeTask({ ...board.parseTask([line]), dirty: true })[0]
let unnormalised = 0
for (let i = 0; i < after.length; i++) {
  if (!isTaskLine[i]) continue
  if (write(lines[i]) !== lines[i]) unnormalised++
  const want = write(lines[i]) + after[i].slice(lines[i].length)
  if (write(after[i]) !== want)
    die(`appending an id changed what the writer makes of line ${i + 1}:\n    got:  ${write(after[i])}\n    want: ${want}`)
}
ok(`appending an id perturbs nothing the writer does (${unnormalised} lines carry a hand-written tag order, untouched)`)

const FIELDS = ['done', 'title', 'bold', 'impact', 'effort', 'due', 'start', 'doneOn', 'ai', 'to',
  'urgent', 'week', 'slug', 'blockedBy', 'rank', 'tlrank', 'headline', 'chat', 'repeat', 'extra']
for (let i = 0; i < lines.length; i++) {
  if (!isTaskLine[i]) continue
  const a = board.parseTask([lines[i]]), b = board.parseTask([after[i]])
  for (const f of FIELDS)
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f]))
      die(`line ${i + 1}: field "${f}" changed, ${JSON.stringify(a[f])} -> ${JSON.stringify(b[f])}`)
}
ok('every other field on every task reads exactly as it did')

if (board.serializeDoc(board.parseDoc(text)) !== text) die('the migrated document does not round-trip')
ok('the whole document round-trips byte for byte')

/* ---- 5. write, with a backup the board's pruner cannot reach -------------- */
if (dry) {
  const tmp = path.join('/tmp', 'mint-ids-preview.md')
  fs.writeFileSync(tmp, text)
  console.log(`\nnothing written. preview at ${tmp}\n`)
  try { console.log(execSync(`diff --unified=0 ${JSON.stringify(target)} ${tmp} | head -40`).toString()) } catch (e) { console.log(e.stdout?.toString() || '') }
  console.log(`(diff is ${changed} single-token insertions)\n`)
  process.exit(0)
}

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
const bdir = path.join(path.dirname(target), 'backups')
fs.mkdirSync(bdir, { recursive: true })
/* Deliberately not named todo-backup-*: prune_backups() keeps only the newest
   fifty of those and there are already forty-five. */
const backup = path.join(bdir, `todo-${stamp}-pre-ids.md`)
fs.copyFileSync(target, backup)
ok(`backed up to ${path.relative(ROOT, backup)}`)

fs.writeFileSync(target + '.tmp', text)
fs.renameSync(target + '.tmp', target)
ok('written')
console.log(`\n${changed} tasks now carry an id.\n`)
