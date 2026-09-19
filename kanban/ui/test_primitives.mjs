#!/usr/bin/env node
/* Tenon's components against the string builders they share a board with.
 *
 *     node kanban/ui/test_primitives.mjs      (or: npm test)
 *
 * Column, Card, Badge and Stat live in @tiagopedras/tenon now. They were four
 * files in this folder until 19 Sep 2026, written to be exactly what colHTML()
 * and cardShellHTML() emit; Tenon's are a port of those four and the builders
 * were changed to emit Tenon's markup the same day, so the rule is unchanged:
 * one stylesheet answers for both halves of a half-ported board, and "three
 * boards, one shape" rests on there being one column rather than a family
 * resemblance. This suite renders each case both ways and fails on any
 * difference.
 *
 * What moved with them is the vocabulary. colHTML() still speaks the board's —
 * cls, stripe, position, note, body — and Tenon speaks className, accent,
 * lead, footer, children. The tables below stay in the board's words and
 * toTenon() maps them, in one place, which is worth pinning on its own: it is
 * the same translation every call site in kanban/ui/ does by hand.
 *
 * It needs no browser and no server. kanban/js/09-columns.js is run in a `vm`
 * with a stubbed `document` — it registers two delegated click listeners at
 * top level and touches nothing else a host would provide — Tenon is imported
 * as the built package a consumer gets, and PlanCard, the one component still
 * written here, is transformed by esbuild, which is already in the tree as one
 * of vite's own dependencies rather than as a dependency of this.
 *
 * The last check is a different kind and belongs here anyway: that the built
 * bundle carries React's production build. Vite substitutes NODE_ENV for an
 * application build and not in lib mode, and getting that wrong ships a bundle
 * that throws on `process` at load.
 */
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import vm from 'node:vm'
import * as esbuild from 'esbuild'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const REPO = path.join(HERE, '..', '..')

let failures = 0
const fail = (...m) => { console.log('FAIL', ...m); failures++ }

/* ---- the string builders, out of the board's own file ---------------------
   esc() lives in 04-tier-two-the-one-thing.js and is the one symbol these two
   functions need from outside their file. It is copied here rather than
   imported because pulling in that file drags the rest of the board with it,
   and a four-line escape is not the thing this suite is testing. If it ever
   diverges, every case below fails loudly on the escaping ones. */
const ESC = `const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));`
const columnsSrc = fs.readFileSync(path.join(REPO, 'kanban/js/09-columns.js'), 'utf8')
const legacy = vm.runInNewContext(
  ESC + '\n' + columnsSrc + '\n;({ colHTML, cardShellHTML, numberBadgeHTML, esc });',
  { document: { addEventListener() {} } },
  { filename: 'kanban/js/09-columns.js' })

/* ---- the components ------------------------------------------------------- */
/* Inside the repo rather than in /tmp, because the transformed files import
   `react` and node resolves that from the importing file's own directory
   upwards — from /tmp there is no node_modules to find. */
const outdir = fs.mkdtempSync(path.join(REPO, 'node_modules', '.cache-board-ui-'))
await esbuild.build({
  entryPoints: [path.join(HERE, 'PlanCard.tsx')],
  outdir, bundle: true, format: 'esm', jsx: 'automatic',
  external: ['react', 'react-dom', 'react/jsx-runtime', '@tiagopedras/tenon'],
  logLevel: 'silent',
})
const { PlanCard } = await import(url.pathToFileURL(path.join(outdir, 'PlanCard.js')))
/* The built package, the same file a consumer installs, rather than Tenon's
   source. A component that renders differently once built is a component that
   is broken for everyone but this suite. */
const { Column, Card, Badge, Stat } = await import('@tiagopedras/tenon')

/* ---- the board's words, in Tenon's ---------------------------------------
   Every call site in kanban/ui/ does this by hand. Here it is once, so the
   tables below can stay in the vocabulary colHTML() still speaks. */
const toTenonColumn = o => {
  const { heading, cls, bodyCls, style, hot, body, ...rest } = o
  return {
    ...rest,
    ...(heading ? { titleAs: heading } : {}),
    ...(cls ? { className: cls.trim().replace(/\s+/g, ' ') } : {}),
    ...(bodyCls ? { bodyClassName: bodyCls.trim().replace(/\s+/g, ' ') } : {}),
    ...(style === 'agent' ? { dashed: true } : {}),
    ...(hot ? { tone: 'running', titleAfter: h('span', { className: 'colgear', 'aria-hidden': 'true' }) } : {}),
    ...(body !== undefined ? { children: body } : {}),
  }
}

const toTenonCard = o => {
  const { cls, stripe, position, note, progress, extra, tag, attrs, ...rest } = o
  return {
    ...rest,
    ...(cls ? { className: cls.trim().replace(/\s+/g, ' ') } : {}),
    ...(stripe ? { accent: stripe } : {}),
    ...(position !== undefined ? { lead: position } : {}),
    ...(note !== undefined ? { footer: note } : {}),
    ...(progress !== undefined ? { body: progress } : {}),
    ...(extra !== undefined ? { children: extra } : {}),
    ...(tag ? { as: tag } : {}),
    ...(attrs || {}),
  }
}

/* ---- comparing two spellings of the same markup ---------------------------
   Neither side is wrong where they differ, so both are put in one form first:
   React writes a boolean attribute as open="" and the string builder writes a
   bare `open`; React escapes an apostrophe as &#x27; where esc() writes &#39;;
   and attribute order follows each side's own source, which is nobody's
   contract. Anything left after that is a real difference. */
const canon = html => html
  .replace(/&#x27;/g, '&#39;')
  .replace(/&#x2F;/g, '/')
  .replace(/ open=""/g, ' open')
  .replace(/<([a-z0-9]+)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)+)(\s*\/?)>/g,
    (_, tag, attrs, close) =>
      '<' + tag + ' ' + (attrs.match(/[a-zA-Z-]+(?:="[^"]*")?/g) || []).sort().join(' ') + close + '>')

let checks = 0
const check = (why, legacyHTML, node) => {
  checks++
  const a = canon(legacyHTML)
  const b = canon(renderToStaticMarkup(node))
  if (a === b) return
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  fail(`${why}\n     colHTML  ...${a.slice(Math.max(0, i - 40), i + 60)}\n     Column   ...${b.slice(Math.max(0, i - 40), i + 60)}`)
}

/* ---- the columns ----------------------------------------------------------
   Every optional part the component carries, on its own and together, plus the
   two variants that are not parts at all — the agent dash and the collapsible
   <details>. */
const COLUMNS = [
  ['a bare column', { title: 'Backlog' }],
  ['a heading of h3', { title: 'To do', heading: 'h3' }],
  ['a hint', { title: 'Doing', hint: 'one at a time' }],
  ['a count', { title: 'Done', count: 12 }],
  ['a count of nought, which is not nothing', { title: 'Done', count: 0 }],
  ['extra classes, half-empty the way callers build them', { title: 'X', cls: '  wide   plans ' }],
  ['a body class', { title: 'X', bodyCls: 'droptarget' }],
  ['the agent variant', { title: 'Waiting for review', style: 'agent' }],
  ['a hot column', { title: 'Producing', hot: true }],
  ['hot and agent together', { title: 'Handed to AI', style: 'agent', hot: true }],
  ['a title needing escaping', { title: `Alex's "review" & <b>bold</b>` }],
  ['a hint needing escaping', { title: 'X', hint: `a < b & c's` }],
  ['collapsible, open by default', { title: 'Overview', collapsible: true }],
  ['collapsible, starting shut', { title: 'Overview', collapsible: true, open: false }],
  ['collapsible under its own key', { title: 'Overview', collapsible: true, collapseKey: 'ov-1' }],
  ['every part at once', {
    title: 'Ready to be produced', heading: 'h3', hint: 'six', count: 3,
    cls: 'pcol', bodyCls: 'pbody', style: 'agent',
  }],
]

for (const [why, o] of COLUMNS) {
  check('column — ' + why, legacy.colHTML(o), h(Column, toTenonColumn(o)))
}

/* The parts a caller passes as markup. The string builder takes them
   pre-escaped and the component takes nodes, so the two are given the same
   thing in each one's own currency — which is the one place the signatures
   deliberately differ, and worth pinning precisely because of that. */
check('column — a sort control in the head',
  legacy.colHTML({ title: 'Backlog', sort: '<button class="sortbtn">Priority</button>' }),
  h(Column, { title: 'Backlog', sort: h('button', { className: 'sortbtn' }, 'Priority') }))

check('column — an action button',
  legacy.colHTML({ title: 'Plans', action: '<button class="act">Run</button>' }),
  h(Column, { title: 'Plans', action: h('button', { className: 'act' }, 'Run') }))

check('column — a description',
  legacy.colHTML({ title: 'People', desc: 'What this bucket is for.' }),
  h(Column, { title: 'People', desc: 'What this bucket is for.' }))

check('column — a footer outside the body',
  legacy.colHTML({ title: 'Backlog', footer: '<button class="addtask">+ Add task</button>' }),
  h(Column, { title: 'Backlog', footer: h('button', { className: 'addtask' }, '+ Add task') }))

check('column — a body',
  legacy.colHTML({ title: 'Backlog', body: '<article class="tenon-card"></article>' }),
  h(Column, { title: 'Backlog', children: h('article', { className: 'tenon-card' }) }))

/* ---- the cards ------------------------------------------------------------ */
const CARDS = [
  ['a bare card', { title: 'Write the review' }],
  ['an eyebrow', { title: 'X', eyebrow: 'PEOPLE' }],
  ['a position', { title: 'X', position: '1' }],
  ['a stripe', { title: 'X', stripe: '#2f6feb' }],
  ['no stripe, which is not a grey one', { title: 'X' }],
  ['extra classes', { title: 'X', cls: ' agreed  plan ' }],
  ['a note count', { title: 'X', note: '3 notes' }],
  ['a summary', { title: 'X', summary: 'What the plan proposes.' }],
  ['a meta row', { title: 'X', meta: 'Design System · To do' }],
]

for (const [why, o] of CARDS) {
  /* Every row above is plain text, so the string builder's markup and the
     component's node are the same characters and passing one object to both is
     comparing like with like. The two below are not: a row holding markup has
     to be given to each side in its own currency, or the component escapes
     what the string builder passed through — which is the components being
     right and the test being lazy. */
  check('card — ' + why, legacy.cardShellHTML(o), h(Card, toTenonCard(o)))
}

check('card — tags, which are markup rather than text',
  legacy.cardShellHTML({ title: 'X', tags: '<span class="tag">S</span>' }),
  h(Card, { title: 'X', tags: h('span', { className: 'tag' }, 'S') }))

check('card — every row at once', legacy.cardShellHTML({
  title: 'X', eyebrow: 'DS', position: '2', tags: '<span class="tag">M</span>',
  meta: 'Design System', summary: 'A summary.', note: '1 note', stripe: '#1f8a5f',
  cls: 'plancard',
}), h(Card, toTenonCard({
  title: 'X', eyebrow: 'DS', position: '2', tags: h('span', { className: 'tag' }, 'M'),
  meta: 'Design System', summary: 'A summary.', note: '1 note', stripe: '#1f8a5f',
  cls: 'plancard',
})))

/* The card's own element, which a view wires itself against. The string
   builder takes them as one pre-spelled attribute string and the component
   takes props, which is the same deliberate difference as the markup rows. */
check('card — attributes on the element itself',
  legacy.cardShellHTML({ title: 'X', draggable: true, attrs: 'data-plan="a/b.md"' }),
  h(Card, { title: 'X', draggable: true, 'data-plan': 'a/b.md' }))

/* A row given as markup the board already built rather than as nodes. It has
   to land on the row's own div, or the component puts a wrapper in the markup
   that cardShellHTML does not emit — which is the whole reason CardRow takes
   two currencies. */
check('card — a raw row goes on the row div, with nothing around it',
  legacy.cardShellHTML({ title: 'X', tags: '<span class="planscore">S</span>' }),
  h(Card, { title: 'X', tags: { __html: '<span class="planscore">S</span>' } }))

check('card — a different tag',
  legacy.cardShellHTML({ title: 'X', tag: 'li' }),
  h(Card, { title: 'X', as: 'li' }))

check('card — an action',
  legacy.cardShellHTML({ title: 'X', action: '<button class="cardact-btn">Open</button>' }),
  h(Card, { title: 'X', action: h('button', { className: 'cardact-btn' }, 'Open') }))

/* ---- the number badge -----------------------------------------------------
   Nought draws nothing on both sides, which is what lets the Plans tab carry
   one unconditionally rather than asking first. */
const BADGES = [
  ['a count', { n: 3 }],
  ['a count with a label', { n: 3, label: 'plans waiting for review' }],
  ['nought, which draws nothing', { n: 0 }],
  ['a negative, which draws nothing', { n: -2 }],
  ['a hundred, capped', { n: 100 }],
  ['a label needing escaping', { n: 1, label: `Alex's "plans" & <b>` }],
]
for (const [why, o] of BADGES) {
  check('badge — ' + why, legacy.numberBadgeHTML(o), h(Badge, { count: o.n, label: o.label }))
}

/* ---- the stat card --------------------------------------------------------
   One headline figure in a box. It has never been a string builder, so there
   is nothing to render it against; what these pin is the shape, written out
   longhand the same way the plan card's cases below are. The order of the
   three parts is the whole point of the thing — eyebrow, figure, caption, all
   inside one box — so a part moving out of it, or the eyebrow drifting back
   above the box as a heading, fails here.

   The escaping case is not incidental: nothing calls esc() on the way in, and
   that is only safe for as long as React writes these itself. */
check('stat card — all three parts',
  '<div class="tenon-stat">' +
    '<span class="tenon-stat__eyebrow">Completed</span>' +
    '<span class="tenon-stat__value">12</span>' +
    '<span class="tenon-stat__caption">tasks finished across 4 categories</span>' +
  '</div>',
  h(Stat, { eyebrow: 'Completed', value: 12, caption: 'tasks finished across 4 categories' }))

check('stat card — the figure on its own, which is the minimum',
  '<div class="tenon-stat"><span class="tenon-stat__value">0</span></div>',
  h(Stat, { value: 0 }))

check('stat card — a value that is not a number',
  '<div class="tenon-stat">' +
    '<span class="tenon-stat__eyebrow">Schedulers</span>' +
    '<span class="tenon-stat__value">2 of 2</span>' +
  '</div>',
  h(Stat, { eyebrow: 'Schedulers', value: '2 of 2' }))

check('stat card — extra classes',
  '<div class="tenon-stat wide good"><span class="tenon-stat__value">1</span></div>',
  h(Stat, { value: 1, className: 'wide good' }))

check('stat card — text needing escaping, which React does rather than esc()',
  '<div class="tenon-stat">' +
    '<span class="tenon-stat__eyebrow">Alex&#39;s &quot;plans&quot; &amp; &lt;b&gt;</span>' +
    '<span class="tenon-stat__value">3</span>' +
  '</div>',
  h(Stat, { eyebrow: `Alex's "plans" & <b>`, value: 3 }))

/* ---- the plan card --------------------------------------------------------
   `planItemHTML()` is gone — PlanCard is the only spelling of a plan card now —
   so there is no string builder left to render this one against. What holds it
   instead is the thing that builder was made of: the same cardShellHTML, given
   the rows a plan card carries, written out here. It is the shape that matters
   and the shape is what this pins, so a row moving out of the card, or picking
   up a wrapper on the way through, still fails here.

   The escaping is not incidental. planItemHTML() called esc() on every one of
   these by hand and the component does not, because React escapes what it
   writes — so this case carries the characters that would show the difference
   if that ever stopped being true.

   `data-plan` is the only attribute left and that is the point: the card
   carried `data-plan-open` and `data-plan-goto` until 13 Sep 2026, when
   opening and the link back became props. A handler is not markup, so nothing
   here holds them — what holds them is test_plans.mjs, which clicks. */
const PLAN = {
  url: 'plans/2026-09-13-buttons.md',
  title: `Alex's "button" audit & <b>the rest</b>`,
  variant: ' agreed',
  stripe: 'var(--tenon-text-success)',
  word: 'accepted',
  production: 'being made',
  productionKind: 'doing',
  needsYou: true,
  gotoKey: 'close-the-figma-gap',
  gotoLabel: 'Close the Figma gap',
  where: ['Design System', 'To do', undefined, '13 Sep 12:04'],
  scoresHTML: '<span class="planscore"><span class="tag impact-high">🔥</span></span>',
  summaryHTML: 'What the plan <em>proposes</em>.',
  feedback: 'Too broad — split it per component.',
}

check('plan card — every row a plan carries',
  legacy.cardShellHTML({
    cls: 'repitem planitem agreed folded',
    draggable: true,
    attrs: 'data-plan="' + PLAN.url + '"',
    stripe: PLAN.stripe,
    eyebrow: '<span class="bucket">accepted</span><span class="right">' +
      '<span class="planprod planprod-doing" ' +
      'title="How far the implementing agent has got with this one">being made</span>' +
      '<span class="planfold" ' +
      'title="The agent stopped and asked rather than guessing">needs you</span></span>',
    title: legacy.esc(PLAN.title),
    tags: PLAN.scoresHTML,
    meta: '<span class="planwhere">Design System · To do · 13 Sep 12:04</span>' +
      '<button class="plangoto" ' +
      'title="Open this task on the board">Close the Figma gap ↗</button>',
    summary: PLAN.summaryHTML,
    extra: '<div class="planredo"><b>Sent back:</b> ' + legacy.esc(PLAN.feedback) + '</div>',
  }),
  h(PlanCard, PLAN))

check('plan card — nothing optional, which is most of them',
  legacy.cardShellHTML({
    cls: 'repitem planitem',
    draggable: true,
    attrs: 'data-plan="p.md"',
    stripe: 'var(--tenon-stroke-default)',
    eyebrow: '<span class="bucket">new</span>',
    title: 'Write the review',
  }),
  h(PlanCard, { url: 'p.md', title: 'Write the review', stripe: 'var(--tenon-stroke-default)', word: 'new' }))

check('plan card — a plan with no task left on the board keeps its own name',
  legacy.cardShellHTML({
    cls: 'repitem planitem read',
    draggable: true,
    attrs: 'data-plan="p.md"',
    stripe: 'var(--tenon-stroke-default)',
    eyebrow: '<span class="bucket">read</span>',
    title: 'X',
    meta: '<button class="plangoto" ' +
      'title="Open this task on the board">a-slug ↗</button>',
  }),
  h(PlanCard, {
    url: 'p.md', title: 'X', variant: ' read', stripe: 'var(--tenon-stroke-default)', word: 'read',
    gotoKey: 'a-slug', where: [],
  }))

/* ---- classList against a React-owned node ---------------------------------
   React writes className only when the prop it renders from has changed, so
   an imperative classList call on a node it owns is invisible until that prop
   next changes — at which point the class it added is overwritten without a
   word. 13-plans.js still carries six of these, all transient interaction
   feedback (a drag in progress, a drop target, a closed filter or fold) that
   never collides with a prop React tracks, which is why they are safe rather
   than merely unnoticed. This is what stops a ported view from growing a
   seventh kind, or a different ported view from picking either pattern back
   up, without failing anything. */
{
  const KNOWN_SAFE = new Set(['dragging', 'coldrop', 'coldeny', 'over-top', 'over-bottom', 'hidden'])
  const classListCalls = src => {
    const found = new Set()
    const re = /\.classList\.(?:add|remove|toggle)\(([^)]*)\)/g
    let m
    while ((m = re.exec(src))) {
      for (const arg of m[1].split(','))
        for (const lit of arg.matchAll(/'([^']+)'/g)) lit[1].split(/\s+/).forEach(c => c && found.add(c))
    }
    return found
  }

  const plansSrc = fs.readFileSync(path.join(REPO, 'kanban/js/13-plans.js'), 'utf8')
  const plansClasses = classListCalls(plansSrc)
  checks++
  for (const c of plansClasses)
    if (!KNOWN_SAFE.has(c))
      fail(`13-plans.js writes .${c} through classList — a class React doesn't own is invisible ` +
        `until the prop it should have been changes, at which point it's silently overwritten`)
  for (const c of KNOWN_SAFE)
    if (!plansClasses.has(c))
      fail(`13-plans.js no longer writes .${c} through classList — narrow KNOWN_SAFE to match`)

  for (const f of ['26-projects.js', '12-reports.js', '15-backups.js']) {
    checks++
    const found = classListCalls(fs.readFileSync(path.join(REPO, 'kanban/js', f), 'utf8'))
    if (found.size)
      fail(`${f} now writes ${[...found].join(', ')} through classList onto a React-owned node`)
  }
}

/* ---- the built bundle ----------------------------------------------------- */
const bundle = path.join(REPO, 'kanban/dist/board-ui.js')
if (!fs.existsSync(bundle)) {
  console.log('note: kanban/dist/board-ui.js not built, skipping the bundle checks')
} else {
  const built = fs.readFileSync(bundle, 'utf8')
  if (built.includes('react-dom.development'))
    fail("the bundle carries React's development build — check `define` in vite.config.ts")
  if (built.includes('process.env.NODE_ENV'))
    fail('the bundle references process.env.NODE_ENV, which does not exist in a browser')
  if (!built.includes('BoardUI'))
    fail('the bundle does not hang the BoardUI global the page loads it for')
}

fs.rmSync(outdir, { recursive: true, force: true })
console.log(`${checks} primitives against their string builders — ${failures ? 'see above' : 'all agree'}`)
process.exit(failures ? 1 : 0)
