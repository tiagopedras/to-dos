#!/usr/bin/env node
/* The other half of core/test_todo.py.
 *
 * Same three tables out of core/fixtures/, same checks, run against
 * core/todo.js instead of core/todo.py. Between them the two suites are what
 * stops the board and the Python readers drifting apart, and neither holds a
 * table of its own — a table written out twice, once per language, would be
 * exactly the third copy this is here to prevent.
 *
 * No browser. kanban/test_canvas.mjs and its siblings drive headless Chrome
 * because they test what the board draws; this tests pure functions, so it runs
 * todo.js in a `vm` context instead. That is the whole reason todo.js never
 * touches `window` or `document`.
 *
 * It also checks two things the Python cannot, because todo.py has no
 * serialiser and never will: what serializeTask writes for a task the board has
 * touched, and that serializeDoc(parseDoc(text)) gives back the same bytes. The
 * second is the property the whole lossless-whitespace design exists for, and
 * nothing tested it until now.
 *
 *     node core/test_todo.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const fixture = name =>
  JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', name), 'utf8'));

/* todo.js is a classic script, so it exports nothing: it declares into whatever
   global it is given, and a vm context is that global. Half of what it declares
   is `const`, though, and a classic script's top-level `const` goes into the
   global *lexical* environment rather than onto the global object — which is
   exactly why the board can see MSG_NOTE from its own inline script, and why
   reading it off the context object here would give undefined. So the file is
   evaluated with a trailing expression naming what this suite uses, and the
   value of that expression is what comes back. */
const WANTED = ['TASK_RE', 'SUB_RE', 'MSG_NOTE', 'parseTask', 'serializeTask',
                'parseDoc', 'serializeDoc', 'splitBody', 'quoted', 'readRepeat',
                'occurrenceFrom', 'occurrenceAfter', 'unscored', 'priorityScore'];
const source = fs.readFileSync(path.join(HERE, 'todo.js'), 'utf8')
  + '\n;({ ' + WANTED.join(', ') + ' });\n';
const board = vm.runInNewContext(source, {}, { filename: 'core/todo.js' });

let failures = 0;
const fail = (...msg) => { console.log('FAIL', ...msg); failures++; };

/* ---- dates ---------------------------------------------------------------
   The fixtures are ISO strings; the board works in local-midnight Date objects,
   the way `new Date(y, mo, d)` gives them. Compare as strings, never as Dates. */
const iso = d => d.getFullYear() + '-'
  + String(d.getMonth() + 1).padStart(2, '0') + '-'
  + String(d.getDate()).padStart(2, '0');
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---- repeat: -------------------------------------------------------------- */

function checkRepeat() {
  const table = fixture('repeat.json');
  const { seedDays, seedMonths, startYear } = table;
  const anchor = fromISO(table.anchor);

  const seeds = [];
  for (let m = 0; m < seedMonths; m++) {
    const y = startYear + Math.floor(m / 12), mo = m % 12;
    const last = new Date(y, mo + 1, 0).getDate();
    for (const day of seedDays) if (day <= last) seeds.push(new Date(y, mo, day));
  }

  let dates = 0;
  for (const { tag, label, dates: want, series } of table.cases) {
    const rep = board.readRepeat(tag);
    if (label === null) {
      if (rep) fail(`${tag} should be rejected, parsed as`, JSON.stringify(rep));
      continue;
    }
    if (!rep) { fail(`${tag} should parse, was rejected`); continue; }
    if (rep.label !== label) fail(`${tag} label ${JSON.stringify(rep.label)}, fixture says ${JSON.stringify(label)}`);

    /* Break after the first mismatch per tag: one broken rule would otherwise
       print eighty-eight lines and bury the next one. */
    for (let i = 0; i < seeds.length; i++) {
      const got = iso(board.occurrenceFrom(rep, seeds[i]));
      if (got !== want[i]) { fail(`${tag} from ${iso(seeds[i])} gave ${got}, fixture says ${want[i]}`); break; }
    }
    let cur = board.occurrenceFrom(rep, anchor);
    const walked = [iso(cur)];
    for (let i = 1; i < series.length; i++) { cur = board.occurrenceAfter(rep, cur); walked.push(iso(cur)); }
    for (let i = 0; i < series.length; i++) {
      if (walked[i] !== series[i]) { fail(`${tag} occurrence ${i} gave ${walked[i]}, fixture says ${series[i]}`); break; }
    }
    dates += want.length + series.length;
  }
  console.log(`${table.cases.length} tags, ${dates} dates — ${failures ? 'see above' : 'all agree'}`);
}

/* ---- suggested messages --------------------------------------------------- */

function checkMessages() {
  const before = failures;
  const table = fixture('messages.json');

  for (const { line, matches, draft, text } of table.lines) {
    const got = board.MSG_NOTE.test(line);
    if (got !== matches) { fail(`message match ${JSON.stringify(line.slice(0, 50))} — got ${got}, fixture says ${matches}`); continue; }
    if (!matches) continue;
    const mine = board.quoted(line);
    if (mine !== text) fail(`message text ${JSON.stringify(line.slice(0, 50))}\n     got   ${JSON.stringify(mine)}\n     want  ${JSON.stringify(text)}`);
    if (/\(draft\)/i.test(line) !== draft) fail(`message draft ${JSON.stringify(line.slice(0, 50))}`);
  }

  /* The structural half. splitBody is what decides whether a message serves the
     task or one step inside it, and the depth of the indent is the only thing
     saying which — so a document is the only way to test it. */
  const doc = board.parseDoc(table.doc);
  const live = [], every = [];
  doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t => {
    const { notes, steps } = board.splitBody(t);
    const push = (text, where, due, draft, dead) => {
      const m = { text, where, due, draft };
      every.push(m);
      if (!dead) live.push(m);
    };
    for (const l of notes) {
      if (board.MSG_NOTE.test(l)) push(board.quoted(l), '', t.due, /\(draft\)/i.test(l), t.done);
    }
    for (const s of steps) {
      for (const l of s.notes) {
        if (board.MSG_NOTE.test(l)) push(board.quoted(l), s.clean, s.due || t.due, /\(draft\)/i.test(l), t.done || s.done);
      }
    }
  })));

  if (!same(live, table.live)) {
    fail(`live messages\n     got  ${JSON.stringify(live)}\n     want ${JSON.stringify(table.live)}`);
  }
  if (every.length !== table.everyCount) {
    fail(`every message: got ${every.length}, want ${table.everyCount}`);
  }
  console.log(`${table.lines.length} message lines, ${every.length} in a document — ${failures > before ? 'see above' : 'all agree'}`);
}

/* ---- the task line itself ------------------------------------------------- */

function checkParse() {
  const before = failures;
  const table = fixture('parse.json');

  for (const { line, expect, roundTrip } of table.cases) {
    const t = board.parseTask([line]);
    for (const field of table.fields) {
      let got = t[field];
      /* A rank the board could not read is NaN here and null in the fixture,
         because null is the only answer Python can also give. serializeTask
         drops it either way. */
      if (typeof got === 'number' && isNaN(got)) got = null;
      if (got === undefined) got = null;
      if (!same(got, expect[field])) {
        fail(`parse ${JSON.stringify(line.slice(0, 55))}\n     ${field}: got ${JSON.stringify(got)}, want ${JSON.stringify(expect[field])}`);
      }
    }
    /* What the board writes back, which is the half Python cannot check. */
    const written = board.serializeTask({ ...t, dirty: true })[0];
    if (written !== roundTrip) {
      fail(`serialize ${JSON.stringify(line.slice(0, 55))}\n     got  ${JSON.stringify(written)}\n     want ${JSON.stringify(roundTrip)}`);
    }
  }

  for (const d of table.docs) {
    const doc = board.parseDoc(d.text);
    const got = [];
    doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t =>
      got.push({ title: t.title, bucket: b.name, column: tier.name, body: t.body }))));
    if (!same(got, d.tasks)) {
      fail(`parseDoc — ${d.why}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(d.tasks)}`);
      continue;
    }
    if (board.serializeDoc(doc) !== d.text) fail(`parseDoc did not round-trip — ${d.why}`);
  }
  console.log(`${table.cases.length} task lines, ${table.docs.length} documents — ${failures > before ? 'see above' : 'all agree'}`);
}

/* ---- the real file, byte for byte ----------------------------------------
   Nothing above is longer than a few lines, and the property that actually
   matters is that a save which changed nothing gives back the same bytes. The
   demo list is the biggest document in the repo that is not private, so it is
   the one to prove it on. */

function checkRoundTrip() {
  const p = path.join(HERE, '..', 'kanban', 'demo.md');
  const text = fs.readFileSync(p, 'utf8');
  const out = board.serializeDoc(board.parseDoc(text));
  if (out === text) { console.log(`demo.md round-trips — ${text.split('\n').length} lines, byte for byte`); return; }

  const a = text.split('\n'), b = out.split('\n');
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) { fail(`demo.md changed at line ${i + 1}\n     was ${JSON.stringify(a[i])}\n     now ${JSON.stringify(b[i])}`); break; }
  }
  if (a.length !== b.length) fail(`demo.md is ${b.length} lines after a round trip, was ${a.length}`);
}

/* Tier one, against the table generated from these same functions. The row
   that matters is med/S beating high/L — the counter-intuitive half of the rule
   in PA.md, and the one a rewrite to impact - effort would silently break. So
   the descending order is pinned as well as the individual scores. */
function checkPriority() {
  const table = fixture('priority.json');
  for (const c of table.cases) {
    const t = { impact: c.impact, effort: c.effort };
    if (board.unscored(t) !== c.unscored)
      fail(`unscored ${c.impact}/${c.effort}: got ${board.unscored(t)}, want ${c.unscored}`);
    const got = board.priorityScore(t);
    if (Math.abs(got - c.score) > 1e-9)
      fail(`score ${c.impact}/${c.effort}: got ${got}, want ${c.score}`);
  }
  const ranked = table.descending.slice()
    .sort((a, b) => board.priorityScore(b) - board.priorityScore(a))
    .map(c => `${c.impact}/${c.effort}`);
  const want = table.descending.map(c => `${c.impact}/${c.effort}`);
  if (ranked.join() !== want.join())
    fail(`priority order\n     got  ${ranked.join(' ')}\n     want ${want.join(' ')}`);
  console.log(`${table.cases.length} score combinations, ${table.descending.length} ranked — all agree`);
}

checkRepeat();
checkMessages();
checkParse();
checkPriority();
checkRoundTrip();
process.exit(failures ? 1 : 0);
