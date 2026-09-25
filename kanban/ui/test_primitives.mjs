#!/usr/bin/env node
/* Tenon's components, pinned against markup written out longhand.
 *
 *     node kanban/ui/test_primitives.mjs      (or: npm test)
 *
 * Column, Card, Badge and Stat live in @tiagopedras/tenon now. They were four
 * files in this folder until 19 Sep 2026, written to be exactly what
 * colHTML() and cardShellHTML() emitted; Tenon's are a port of those four.
 * colHTML(), cardShellHTML(), cardHTML() and chipHTML() are gone from
 * kanban/js/09-columns.js as of 25 Sep 2026 — every view is React now, and
 * they had no caller left but this suite and kanban/test_board.mjs's own
 * parity check. What pinned the shape until then was comparing the string
 * builder's output against the component's; what pins it now is comparing the
 * component's render against the markup itself, written out once below, the
 * same way the three PlanCard cases already did before the Plans view went on
 * 22 Sep 2026.
 *
 * Each EXPECT table was captured by rendering the component from the exact
 * props colHTML()/cardShellHTML() used to take, on 25 Sep 2026, while both
 * were still in the tree and the two sides still agreed — so this suite is
 * the same 50 cases, at the values the deleted comparison last confirmed were
 * right, not a fresh guess at what the markup should be.
 *
 * numberBadgeHTML() and setColCount() are still live — the Plans tab badge
 * and Projects use them — so Badge is still checked the same way, against
 * numberBadgeHTML()'s own output rather than a pinned string, since there is
 * still a string builder on the other side of that one.
 *
 * It needs no browser and no server. kanban/js/09-columns.js is run in a `vm`
 * with a stubbed `document` — it registers two delegated click listeners at
 * top level and touches nothing else a host would provide — Tenon is imported
 * as the built package a consumer gets.
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
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const HERE = path.dirname(url.fileURLToPath(import.meta.url))
const REPO = path.join(HERE, '..', '..')

let failures = 0
const fail = (...m) => { console.log('FAIL', ...m); failures++ }

/* ---- what's left of the string builders -----------------------------------
   numberBadgeHTML() is still live — Plans' tab badge and Projects still call
   it — so Badge is still checked against it. esc() lives in
   04-tier-two-the-one-thing.js and is the one symbol it needs from outside its
   file, copied here rather than imported for the same reason it always was:
   pulling in that file drags the rest of the board with it. */
const ESC = `const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));`
const columnsSrc = fs.readFileSync(path.join(REPO, 'kanban/js/09-columns.js'), 'utf8')
const legacy = vm.runInNewContext(
  ESC + '\n' + columnsSrc + '\n;({ numberBadgeHTML, esc });',
  { document: { addEventListener() {} } },
  { filename: 'kanban/js/09-columns.js' })

/* ---- the components ------------------------------------------------------- */
/* The built package, the same file a consumer installs, rather than Tenon's
   source. A component that renders differently once built is a component that
   is broken for everyone but this suite. */
const { Column, Card, Badge, Stat } = await import('@tiagopedras/tenon')

/* ---- the board's words, in Tenon's ---------------------------------------
   Every call site in kanban/ui/ does this by hand. Here it is once, so the
   props tables below can stay in the board's own vocabulary — cls, stripe,
   position, note, body — rather than Tenon's className, accent, lead,
   footer, children. */
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

/* ---- comparing rendered markup against what was pinned --------------------
   React writes a boolean attribute as open="" where the board's own esc()
   writes &#39; for an apostrophe and React writes &#x27; — both still meet
   here, in the badge case (against numberBadgeHTML(), which uses esc()) and
   in the hand-pinned strings that were written to match esc()'s spelling. */
const canon = html => html
  .replace(/&#x27;/g, '&#39;')
  .replace(/ open=""/g, ' open')

let checks = 0
const check = (why, expectedHTML, node) => {
  checks++
  const a = canon(expectedHTML)
  const b = canon(renderToStaticMarkup(node))
  if (a === b) return
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  fail(`${why}\n     expect  ...${a.slice(Math.max(0, i - 40), i + 60)}\n     got     ...${b.slice(Math.max(0, i - 40), i + 60)}`)
}

/* ---- the columns ------------------------------------------------------------
   Every optional part the component carries, on its own and together, plus the
   two variants that are not parts at all — the agent dash and the collapsible
   <details>. Pinned 25 Sep 2026, from colHTML()'s own output for each of
   these exact props while it still existed — see the file header. */
const COLUMN_EXPECT = {
  bare: "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Backlog</h2></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div></section>",
  h3: "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h3 class=\"tenon-column__title\">To do</h3></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div></section>",
  hint: "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Doing</h2><span class=\"tenon-column__hint\">one at a time</span></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div></section>",
  count: "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Done</h2></div><div class=\"tenon-column__head-end\"><span class=\"tenon-column__count\">12</span></div></div></div><div class=\"tenon-column__body\"></div></section>",
  countZero: "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Done</h2></div><div class=\"tenon-column__head-end\"><span class=\"tenon-column__count\">0</span></div></div></div><div class=\"tenon-column__body\"></div></section>",
  clsHalfEmpty: "<section class=\"tenon-column wide plans\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">X</h2></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div></section>",
  bodyCls: "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">X</h2></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body droptarget\"></div></section>",
  agent: "<section class=\"tenon-column tenon-column--dashed\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Waiting for review</h2></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div></section>",
  hot: "<section class=\"tenon-column tenon-column--running\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Producing</h2><span class=\"colgear\" aria-hidden=\"true\"></span></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div></section>",
  hotAgent: "<section class=\"tenon-column tenon-column--running tenon-column--dashed\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Handed to AI</h2><span class=\"colgear\" aria-hidden=\"true\"></span></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div></section>",
  titleEscape: "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Alex&#x27;s &quot;review&quot; &amp; &lt;b&gt;bold&lt;/b&gt;</h2></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div></section>",
  hintEscape: "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">X</h2><span class=\"tenon-column__hint\">a &lt; b &amp; c&#x27;s</span></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div></section>",
  collapsibleOpen: "<details class=\"tenon-column\" open=\"\"><summary class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><span class=\"tenon-column__chevron\" aria-hidden=\"true\"></span><h2 class=\"tenon-column__title\">Overview</h2></div><div class=\"tenon-column__head-end\"></div></div></summary><div class=\"tenon-column__body\"></div></details>",
  collapsibleShut: "<details class=\"tenon-column\"><summary class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><span class=\"tenon-column__chevron\" aria-hidden=\"true\"></span><h2 class=\"tenon-column__title\">Overview</h2></div><div class=\"tenon-column__head-end\"></div></div></summary><div class=\"tenon-column__body\"></div></details>",
  collapsibleKey: "<details class=\"tenon-column\" data-column-collapse=\"ov-1\" open=\"\"><summary class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><span class=\"tenon-column__chevron\" aria-hidden=\"true\"></span><h2 class=\"tenon-column__title\">Overview</h2></div><div class=\"tenon-column__head-end\"></div></div></summary><div class=\"tenon-column__body\"></div></details>",
  everyPart: "<section class=\"tenon-column tenon-column--dashed pcol\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h3 class=\"tenon-column__title\">Ready to be produced</h3><span class=\"tenon-column__hint\">six</span></div><div class=\"tenon-column__head-end\"><span class=\"tenon-column__count\">3</span></div></div></div><div class=\"tenon-column__body pbody\"></div></section>",
}

const COLUMNS = [
  ['a bare column', 'bare', { title: 'Backlog' }],
  ['a heading of h3', 'h3', { title: 'To do', heading: 'h3' }],
  ['a hint', 'hint', { title: 'Doing', hint: 'one at a time' }],
  ['a count', 'count', { title: 'Done', count: 12 }],
  ['a count of nought, which is not nothing', 'countZero', { title: 'Done', count: 0 }],
  ['extra classes, half-empty the way callers build them', 'clsHalfEmpty', { title: 'X', cls: '  wide   plans ' }],
  ['a body class', 'bodyCls', { title: 'X', bodyCls: 'droptarget' }],
  ['the agent variant', 'agent', { title: 'Waiting for review', style: 'agent' }],
  ['a hot column', 'hot', { title: 'Producing', hot: true }],
  ['hot and agent together', 'hotAgent', { title: 'Handed to AI', style: 'agent', hot: true }],
  ['a title needing escaping', 'titleEscape', { title: `Alex's "review" & <b>bold</b>` }],
  ['a hint needing escaping', 'hintEscape', { title: 'X', hint: `a < b & c's` }],
  ['collapsible, open by default', 'collapsibleOpen', { title: 'Overview', collapsible: true }],
  ['collapsible, starting shut', 'collapsibleShut', { title: 'Overview', collapsible: true, open: false }],
  ['collapsible under its own key', 'collapsibleKey', { title: 'Overview', collapsible: true, collapseKey: 'ov-1' }],
  ['every part at once', 'everyPart', {
    title: 'Ready to be produced', heading: 'h3', hint: 'six', count: 3,
    cls: 'pcol', bodyCls: 'pbody', style: 'agent',
  }],
]

for (const [why, key, o] of COLUMNS) {
  check('column — ' + why, COLUMN_EXPECT[key], h(Column, toTenonColumn(o)))
}

/* The parts a caller passes as markup. Pinned from a string the caller had
   already escaped, so the component is given the same thing in its own
   currency — a node — which is the one place the comparison deliberately
   differs case to case. */
check('column — a sort control in the head',
  "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Backlog</h2></div><div class=\"tenon-column__head-end\"><button class=\"sortbtn\">Priority</button></div></div></div><div class=\"tenon-column__body\"></div></section>",
  h(Column, { title: 'Backlog', sort: h('button', { className: 'sortbtn' }, 'Priority') }))

check('column — an action button',
  "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Plans</h2></div><div class=\"tenon-column__head-end\"><button class=\"act\">Run</button></div></div></div><div class=\"tenon-column__body\"></div></section>",
  h(Column, { title: 'Plans', action: h('button', { className: 'act' }, 'Run') }))

check('column — a description',
  "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">People</h2></div><div class=\"tenon-column__head-end\"></div></div><p class=\"tenon-column__desc\">What this bucket is for.</p></div><div class=\"tenon-column__body\"></div></section>",
  h(Column, { title: 'People', desc: 'What this bucket is for.' }))

check('column — a footer outside the body',
  "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Backlog</h2></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"></div><div class=\"tenon-column__footer\"><button class=\"addtask\">+ Add task</button></div></section>",
  h(Column, { title: 'Backlog', footer: h('button', { className: 'addtask' }, '+ Add task') }))

check('column — a body',
  "<section class=\"tenon-column\"><div class=\"tenon-column__head\"><div class=\"tenon-column__head-row\"><div class=\"tenon-column__head-start\"><h2 class=\"tenon-column__title\">Backlog</h2></div><div class=\"tenon-column__head-end\"></div></div></div><div class=\"tenon-column__body\"><article class=\"tenon-card\"></article></div></section>",
  h(Column, { title: 'Backlog', children: h('article', { className: 'tenon-card' }) }))

/* ---- the cards -------------------------------------------------------------
   Pinned 25 Sep 2026, from cardShellHTML()'s own output for each of these
   exact props while it still existed — see the file header. */
const CARD_EXPECT = {
  bare: "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">Write the review</div></div></article>",
  eyebrow: "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__eyebrow\">PEOPLE</div><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div></article>",
  position: "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><span class=\"tenon-card__lead\">1</span><div class=\"tenon-card__title\">X</div></div></article>",
  stripe: "<article class=\"tenon-card tenon-card--flat tenon-card--accent\" style=\"--tenon-card-accent:#2f6feb\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div></article>",
  noStripe: "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div></article>",
  cls: "<article class=\"tenon-card tenon-card--flat agreed plan\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div></article>",
  note: "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div><div class=\"tenon-card__footer\">3 notes</div></article>",
  summary: "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div><div class=\"tenon-card__summary\">What the plan proposes.</div></article>",
  meta: "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div><div class=\"tenon-card__meta\">Design System · To do</div></article>",
}

const CARDS = [
  ['a bare card', 'bare', { title: 'Write the review' }],
  ['an eyebrow', 'eyebrow', { title: 'X', eyebrow: 'PEOPLE' }],
  ['a position', 'position', { title: 'X', position: '1' }],
  ['a stripe', 'stripe', { title: 'X', stripe: '#2f6feb' }],
  ['no stripe, which is not a grey one', 'noStripe', { title: 'X' }],
  ['extra classes', 'cls', { title: 'X', cls: ' agreed  plan ' }],
  ['a note count', 'note', { title: 'X', note: '3 notes' }],
  ['a summary', 'summary', { title: 'X', summary: 'What the plan proposes.' }],
  ['a meta row', 'meta', { title: 'X', meta: 'Design System · To do' }],
]

for (const [why, key, o] of CARDS) {
  check('card — ' + why, CARD_EXPECT[key], h(Card, toTenonCard(o)))
}

check('card — tags, which are markup rather than text',
  "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div><div class=\"tenon-card__tags\"><span class=\"tag\">S</span></div></article>",
  h(Card, { title: 'X', tags: h('span', { className: 'tag' }, 'S') }))

check('card — every row at once',
  "<article class=\"tenon-card tenon-card--flat tenon-card--accent plancard\" style=\"--tenon-card-accent:#1f8a5f\"><div class=\"tenon-card__eyebrow\">DS</div><div class=\"tenon-card__head\"><span class=\"tenon-card__lead\">2</span><div class=\"tenon-card__title\">X</div></div><div class=\"tenon-card__tags\"><span class=\"tag\">M</span></div><div class=\"tenon-card__meta\">Design System</div><div class=\"tenon-card__summary\">A summary.</div><div class=\"tenon-card__footer\">1 note</div></article>",
  h(Card, toTenonCard({
    title: 'X', eyebrow: 'DS', position: '2', tags: h('span', { className: 'tag' }, 'M'),
    meta: 'Design System', summary: 'A summary.', note: '1 note', stripe: '#1f8a5f',
    cls: 'plancard',
  })))

/* The card's own element, which a view wires itself against. Pinned as
   attributes rather than a pre-spelled string, which is the same deliberate
   difference the markup rows above keep. */
check('card — attributes on the element itself',
  "<article class=\"tenon-card tenon-card--flat tenon-card--draggable\" draggable=\"true\" data-plan=\"a/b.md\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div></article>",
  h(Card, { title: 'X', draggable: true, 'data-plan': 'a/b.md' }))

/* A row given as markup the board already built rather than as nodes. It has
   to land on the row's own div, with nothing wrapping it. */
check('card — a raw row goes on the row div, with nothing around it',
  "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div><div class=\"tenon-card__tags\"><span class=\"planscore\">S</span></div></article>",
  h(Card, { title: 'X', tags: { __html: '<span class="planscore">S</span>' } }))

check('card — a different tag',
  "<li class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div></div></li>",
  h(Card, { title: 'X', as: 'li' }))

check('card — an action',
  "<article class=\"tenon-card tenon-card--flat\"><div class=\"tenon-card__head\"><div class=\"tenon-card__title\">X</div><span class=\"tenon-card__action\"><button class=\"cardact-btn\">Open</button></span></div></article>",
  h(Card, { title: 'X', action: h('button', { className: 'cardact-btn' }, 'Open') }))

/* ---- the number badge -----------------------------------------------------
   Nought draws nothing on both sides, which is what lets the Plans tab carry
   one unconditionally rather than asking first. numberBadgeHTML() is still
   live, so this is still the string builder against the component, the
   original comparison. */
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
   longhand the same way every case above is now. The order of the three parts
   is the whole point of the thing — eyebrow, figure, caption, all inside one
   box — so a part moving out of it, or the eyebrow drifting back above the
   box as a heading, fails here.

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

/* ---- classList against a React-owned node ---------------------------------
   React writes className only when the prop it renders from has changed, so
   an imperative classList call on a node it owns is invisible until that prop
   next changes — at which point the class it added is overwritten without a
   word. 13-plans.js carried six of these until the Plans view went on 22 Sep
   2026, so what this holds now is that no ported view picks the pattern back
   up. */
{
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

console.log(`${checks} primitives against pinned markup — ${failures ? 'see above' : 'all agree'}`)
process.exit(failures ? 1 : 0)
