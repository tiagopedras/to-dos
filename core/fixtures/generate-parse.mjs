/**
 * Regenerates fixtures/parse.json by running core/todo.js.
 *
 *   node core/fixtures/generate-parse.mjs
 *
 * The inputs (the `line` of each case, and each document) are kept exactly as
 * they were and only the answers are rebuilt, so re-running this cannot quietly
 * change what is being tested. Read the diff before committing it.
 *
 * There was no generator saved when these tables were first written, only a note
 * in core/README.md saying they had been generated. That made adding a field to
 * the grammar a hand-edit of a file whose whole purpose is to be nobody's
 * opinion. This is that missing script.
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import vm from 'node:vm'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const CORE = path.join(HERE, '..')
const WANTED = ['parseTask', 'serializeTask', 'parseDoc', 'serializeDoc', 'mintId', 'idsInDoc']
const board = vm.runInNewContext(
  fs.readFileSync(path.join(CORE, 'todo.js'), 'utf8') + '\n;({ ' + WANTED.join(', ') + ' });\n',
  {}, { filename: 'core/todo.js' })

const old = JSON.parse(fs.readFileSync(path.join(HERE, 'parse.json'), 'utf8'))

/* Every field on the model, so a field added in one language and forgotten in
   the other shows up as a missing key rather than as nothing at all. `id` is
   not here: it is uid(), fresh every parse, and means nothing outside one tab. */
const FIELDS = ['done', 'title', 'bold', 'impact', 'effort', 'due', 'start', 'doneOn',
  'ai', 'to', 'urgent', 'week', 'slug', 'blockedBy', 'rank', 'tlrank', 'headline',
  'chat', 'repeat', 'stableId', 'extra']

/* New cases for the stable id. The existing lines are untouched below. */
const NEW_LINES = [
  '- [ ] **Every tag at once, with an id** `#allsorts` [impact:: high] [effort:: M] `start:2026-09-01` [due:: 2026-09-11] `urgent` `week` [ai:: partial] [to:: Alex] `blocked-by:one,two` `rank:4` `tlrank:2` `headline:the one thing` `chat:7vysow` `repeat:wed` `id:ab12cd`',
  '- [ ] **An id and nothing else** `id:zz9zz9`',
  '- [ ] **No id at all, the way every task looked before today** [impact:: low]',
  '- [ ] **An id in the other syntax is read too** [id:: qq11qq]',
  '- [ ] **An id is lowercased like a slug and a chat key** `id:AB12CD`',
  '- [ ] **An unknown tag still rides along beside an id** `id:ab12cd` `mystery:7`',
  '- [x] **A finished task keeps its id** `done:2026-09-10` `id:ff00ff`'
]

const caseFor = line => {
  const t = board.parseTask([line])
  const expect = {}
  for (const f of FIELDS) expect[f] = t[f]
  return { line, expect, roundTrip: board.serializeTask({ ...t, dirty: true })[0] }
}

const out = {
  _: old._,
  fields: FIELDS,
  /* De-duplicated by line, so re-running this is idempotent. Without it the
     generator reads back its own output and appends the new cases a second
     time, which is quietly wrong rather than loud. */
  cases: [...new Map([...old.cases.map(c => c.line), ...NEW_LINES].map(l => [l, l])).values()]
    .map(caseFor),
  /* The documents are kept exactly as they were. `roundTrips` is re-asserted
     here rather than copied, so a change that broke byte-for-byte fidelity
     fails at generate time instead of being written into the table as true. */
  docs: old.docs.map(d => {
    const back = board.serializeDoc(board.parseDoc(d.text))
    const holds = back === d.text
    if (d.roundTrips && !holds) throw new Error(`document no longer round-trips: ${d.why}`)
    const { roundTrip, ...rest } = d       // a key an earlier draft added and nothing reads
    return { ...rest, roundTrips: holds }
  })
}
fs.writeFileSync(path.join(HERE, 'parse.json'), JSON.stringify(out, null, 2) + '\n')
console.log(`parse.json: ${out.cases.length} cases (${old.cases.length} kept, ${NEW_LINES.length} new), ${out.docs.length} docs, ${FIELDS.length} fields`)
