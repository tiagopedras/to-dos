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
const WANTED = ['parseTask', 'serializeTask', 'parseDoc', 'serializeDoc', 'mintId', 'idsInDoc', 'agentOf',
  'splitBody', 'inheritedFields']
const board = vm.runInNewContext(
  fs.readFileSync(path.join(CORE, 'todo.js'), 'utf8') + '\n;({ ' + WANTED.join(', ') + ' });\n',
  {}, { filename: 'core/todo.js' })

const old = JSON.parse(fs.readFileSync(path.join(HERE, 'parse.json'), 'utf8'))

/* Every field on the model, so a field added in one language and forgotten in
   the other shows up as a missing key rather than as nothing at all. `id` is
   not here: it is uid(), fresh every parse, and means nothing outside one tab. */
const FIELDS = ['done', 'title', 'bold', 'impact', 'effort', 'due', 'start', 'doneOn',
  'to', 'theme', 'urgent', 'week', 'slug', 'blockedBy', 'rank', 'tlrank', 'headline',
  'chat', 'repeat', 'stableId', 'cancelled', 'archived', 'extra', 'doing']

/* New cases, appended as the grammar grows. The existing lines are untouched
   and the list is de-duplicated below, so re-running this is idempotent. */
const NEW_LINES = [
  '- [x] **A cancelled task is ticked and says so** `done:2026-09-15` `cancelled:2026-09-15`',
  '- [x] **An archived task is the other half of the same rule** `done:2026-09-15` `archived:2026-09-14`',
  '- [x] **Both at once, which is odd but has to round-trip** `done:2026-09-15` `cancelled:2026-09-15` `archived:2026-09-15`',
  '- [ ] **Unticked, so the tag is kept for him to fix rather than dropped** `cancelled:2026-09-15`',
  '- [x] **The other syntax reads too** `done:2026-09-15` [cancelled:: 2026-09-15]',
  '- [ ] **Every tag at once, with an id** `#allsorts` [impact:: high] [effort:: M] `start:2026-09-01` [due:: 2026-09-11] `urgent` `week` [ai:: partial] [to:: Alex] `blocked-by:one,two` `rank:4` `tlrank:2` `headline:the one thing` `chat:7vysow` `repeat:wed` `id:ab12cd`',
  '- [ ] **An id and nothing else** `id:zz9zz9`',
  '- [ ] **No id at all, the way every task looked before today** [impact:: low]',
  '- [ ] **An id in the other syntax is read too** [id:: qq11qq]',
  '- [ ] **An id is lowercased like a slug and a chat key** `id:AB12CD`',
  '- [ ] **An unknown tag still rides along beside an id** `id:ab12cd` `mystery:7`',
  '- [x] **A finished task keeps its id** `done:2026-09-10` `id:ff00ff`',
  /* 21 Sep 2026: `[to::]` names who does the work, an agent included, and
     `ai:` is dropped on read in either syntax, so it never comes back out. */
  '- [ ] **Handed to the Plan agent** [impact:: med] [to:: Plan agent] `id:pl4n00`',
  '- [ ] **Handed to the Implement agent** [to:: Implement agent] `rank:2`',
  '- [ ] **A backup from before the assignee field** [impact:: high] [ai:: full] `rank:3`',
  '- [ ] **The old syntax of the retired tag goes too** `ai:partial` [to:: Rita]',
  /* 21 Sep 2026: a sub-task carries every tag a task does, on its own line,
     and Doing is the one state tag it has of its own. The same grammar, so the
     lines are cases here and the two suites read them the way they read any
     other. */
  '- [ ] **Plan** `doing` [to:: Plan agent] `#ab12cd-plan` `id:pl0001`',
  '- [ ] **Review the plan** [to:: Tiago] `blocked-by:ab12cd-plan` `#ab12cd-plan-review` `id:pl0002`',
  '- [x] **Implement** [to:: Implement agent] `done:2026-09-21` `#ab12cd-implement` `id:pl0003`',
  /* 25 Sep 2026: a bucket's own sub-organisation, `[theme:: ]`, values declared
     per bucket rather than invented per task — see IMPROVEMENTS.md. */
  '- [ ] **Filed under a theme** [impact:: high] [theme:: audits]',
  '- [ ] **The other syntax reads too** `theme:ways-of-working`',
  '- [ ] **No theme at all, the way every task looked before today** [impact:: low]'
]

/* Sub-tasks, read out of a task's body. Each entry is a task line and the
   lines under it, and what lands in the table is what splitBody() makes of the
   steps and what inheritedFields() says each takes from the task. Python's
   split_body() and inherited_fields() are held to the same answers. */
const STEP_TASKS = [
  { why: 'a step carries every tag a task does, and Doing on top',
    lines: [
      '- [ ] **Parent** [impact:: high] [effort:: L] [due:: 2026-09-30] `week`',
      '  - [ ] Plain step',
      '  - [ ] A step with everything `#ab12cd-plan` [impact:: low] [effort:: S] `start:2026-09-22` [due:: 2026-09-25] `urgent` `doing` [to:: Plan agent] `blocked-by:one,two` `rank:3` `tlrank:1` `headline:2026-09-21` `chat:7vysow` `id:ab12cd`',
      '  - [x] A ticked step `done:2026-09-20` `cancelled:2026-09-20`'
    ] },
  { why: 'what a step does not carry it takes from its task: due, impact and the two bare tags, and nothing else',
    lines: [
      '- [ ] **Parent** [impact:: med] [effort:: M] [due:: 2026-10-01] `urgent` `week` [to:: Implement agent] `blocked-by:gate` `rank:9`',
      '  - [ ] Bare step',
      '  - [ ] Step with its own date [due:: 2026-09-25]',
      '  - [ ] Step with its own impact [impact:: low]'
    ] },
  { why: 'the four sub-tasks of a task handed to the Plan agent, each blocked by the one before',
    lines: [
      '- [ ] **Write the handover** [impact:: high] [effort:: M] `id:ab12cd`',
      '  - [x] Plan [to:: Plan agent] `done:2026-09-21` `#ab12cd-plan` `id:aa0001`',
      '  - [ ] Review the plan [to:: Tiago] `#ab12cd-plan-review` `blocked-by:ab12cd-plan` `id:aa0002`',
      '  - [ ] Implement [to:: Implement agent] `doing` `#ab12cd-implement` `blocked-by:ab12cd-plan-review` `id:aa0003`',
      '  - [ ] Review the work [to:: Tiago] `#ab12cd-work-review` `blocked-by:ab12cd-implement` `id:aa0004`'
    ] }
]

const STEP_FIELDS = ['done', 'due', 'start', 'to', 'slug', 'blockedBy', 'rank', 'week', 'impact', 'effort',
  'urgent', 'doneOn', 'headline', 'chat', 'tlrank', 'repeat', 'stableId', 'doing', 'cancelled', 'archived', 'extra']
const stepsFor = d => {
  const task = board.parseTask(d.lines)
  return {
    why: d.why, lines: d.lines,
    steps: board.splitBody(task).steps.map(s => {
      const got = {}
      STEP_FIELDS.forEach(f => { got[f] = s[f] })
      return { ...got, inherits: board.inheritedFields(task, s) }
    })
  }
}

/* What agentOf() makes of whatever `[to::]` holds: an agent's canonical
   spelling, or '' for a person or nobody. Both suites check todo.py's agent_of
   against it. */
const AGENT_INPUTS = ['Plan agent', 'Implement agent', 'plan AGENT', '  Implement agent ',
  'Rita', '', 'Planning Agent', 'Claude']

const caseFor = line => {
  const t = board.parseTask([line])
  const expect = {}
  for (const f of FIELDS) expect[f] = t[f]
  return { line, expect, roundTrip: board.serializeTask({ ...t, dirty: true })[0] }
}

/* Documents carry their input one of two ways. The three written by hand carry
   their own `text`, because each exists to make one point and is shorter than
   the explanation of it. A real document in the repo carries a `file` instead
   and is read off disk by both suites, so the table holds the answers and never
   a second copy of the document — a copy is exactly what would drift the first
   time demo.md was edited and this file was not. */
const REPO = path.join(CORE, '..')
const DOC_FILES = [
  { why: 'the demo list — the biggest document in the repo that is not private, '
       + 'and the only whole realistic file both parsers are held to',
    file: 'kanban/demo.md' }
]
/* Hand-written documents added after the first three, appended the same way
   NEW_LINES is. */
const NEW_DOCS = [
  { why: 'a column heading that has since been renamed reads as its new name, '
       + 'so an old backup lands in the right column. It does not round-trip: '
       + 'the next save writes the new heading.',
    text: '## 1. People\n\n### Waiting review\n\n- [ ] Sent over, waiting on comments\n' },
  { why: 'Waiting for review became Reviewing on 21 Sep 2026, and a list or a '
       + 'backup still carrying the old heading reads as the new one. It does '
       + 'not round-trip either.',
    text: '## 1. People\n\n### Waiting for review\n\n- [ ] Sent over, waiting on comments\n' },
  { why: 'a ticked task is read under its bucket\'s Done heading wherever the file '
       + 'has it, appended after what Done already held, and a bucket with no Done '
       + 'heading gets one, first. A task in Done that is not ticked stays. It does '
       + 'not round-trip: the next save writes them where they now live.',
    text: '## 1. People\n\n### Doing\n\n- [x] Finished in Doing\n- [ ] Still going\n\n### To do\n\n'
        + '- [x] Finished in To do\n\n### Done\n\n- [x] Already there\n- [ ] Unticked in Done\n\n'
        + '## 2. BAU\n\n### To do\n\n- [ ] Open\n- [x] Ticked, and there is no Done heading\n' }
]

const docText = d => d.file
  ? fs.readFileSync(path.join(REPO, d.file), 'utf8')
  : d.text

/* The same walk both suites do, so what lands in the table is what they compare
   against rather than a second opinion about the shape. */
const tasksOf = doc => {
  const got = []
  doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t =>
    got.push({ title: t.title, bucket: b.name, column: tier.name, body: t.body }))))
  return got
}

const docFor = d => {
  const text = docText(d)
  const doc = board.parseDoc(text)
  const holds = board.serializeDoc(doc) === text
  if (d.roundTrips && !holds) throw new Error(`document no longer round-trips: ${d.why}`)
  const { roundTrip, tasks, ...rest } = d   // `roundTrip`: a key an earlier draft added and nothing reads
  return { ...rest, tasks: tasksOf(doc), roundTrips: holds }
}

const out = {
  _: old._,
  fields: FIELDS,
  agents: AGENT_INPUTS.map(to => ({ to, agent: board.agentOf(to) })),
  /* De-duplicated by line, so re-running this is idempotent. Without it the
     generator reads back its own output and appends the new cases a second
     time, which is quietly wrong rather than loud. */
  cases: [...new Map([...old.cases.map(c => c.line), ...NEW_LINES].map(l => [l, l])).values()]
    .map(caseFor),
  /* The documents' inputs are kept exactly as they were; `tasks` and
     `roundTrips` are both re-asserted here rather than copied, so a change that
     broke the parse or byte-for-byte fidelity fails at generate time instead of
     being written into the table as true. De-duplicated by `file` for the same
     reason the cases are de-duplicated by line. */
  docs: [...old.docs,
         ...DOC_FILES.filter(f => !old.docs.some(d => d.file === f.file)),
         ...NEW_DOCS.filter(n => !old.docs.some(d => d.text === n.text))].map(docFor),
  steps: STEP_TASKS.map(stepsFor)
}
fs.writeFileSync(path.join(HERE, 'parse.json'), JSON.stringify(out, null, 2) + '\n')
console.log(`parse.json: ${out.cases.length} cases (${old.cases.length} kept, ${NEW_LINES.length} new), ${out.docs.length} docs, ${FIELDS.length} fields`)
