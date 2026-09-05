/* The to-do format, as the board reads and writes it.

   This is the authority. `core/todo.py` beside it is a port for the Python
   readers — the companion, the nightly agent, the pa-checkin checker — and its
   own docstring says that where the two disagree, this file is right and the
   Python is the bug. `core/fixtures/` is what stops that being a promise: both
   suites read the same tables, so a change here the fixtures do not expect
   fails in Python as well as in JavaScript.

   Three halves, which is one more than the name suggests:

     - parse and serialise. A document is buckets of tiers of tasks. Every line
       the board did not itself rewrite comes back verbatim, so saving a file
       nobody edited gives back the same bytes.
     - sub-steps and suggested messages. How deep a note is indented is what
       says whether it serves the task or one step inside it.
     - recurrence. `repeat:` says how often, `[due:: ]` says which occurrence the
       card is pointing at now, and neither is derivable from the other.

   What is deliberately not here: anything touching the DOM or `state`, and the
   working calendar. The calendar stays in todo.py alone — two files holding the
   same holiday list is two lists to keep in step.

   A classic script, not a module. index.html's own script is classic and
   inline, and a module here would be deferred past it, so every symbol below
   would be missing at the moment the board first needs it. Loaded before that
   script, these land in the shared global lexical environment and it simply
   sees them. core/test_todo.mjs picks them up the same way, out of a `vm`
   context, which is why nothing here reaches for `window`. */

'use strict';

/* ---- Parse and serialise ---------------------------------------------- */

const TASK_RE   = /^-\s+\[([ xX])\]\s?(.*)$/;
const BUCKET_RE = /^##\s+(\d+)\.\s+(.*)$/;
const TIER_RE   = /^###\s+(.*)$/;
const HR_RE     = /^---\s*$/;

let uidCounter = 0;
const uid = () => 't' + (++uidCounter);

/* Two tag syntaxes, one meaning. `impact`, `effort`, `due` and `ai` moved to
   Dataview's inline-field form on 12 Aug 2026 — `[due:: 2026-08-21]` rather than
   a code span — because those four are what the Dataview queries in views.md
   filter on, and Dataview cannot see inside a code span. The rest stay code
   spans: nothing queries them, and the line is already busy enough.

   Both forms are read everywhere, permanently, not as a migration window. The
   backups, the done-archive and anything he pastes back out of an old snapshot
   are full of the old form, and a board that silently loses the scores off a
   restored task is worse than one that reads both. Only the new form is
   written.

   The bracket pattern insists on the double colon, so `[[a wikilink]]` and
   `[label](a link)` are left alone.

   One pass over both forms rather than one pass each, so an unrecognised tag
   keeps its position on the line instead of drifting to the end of it the next
   time the task is saved. */
const ANY_TAG_RE = /\[([A-Za-z][\w-]*)::\s*([^\]]*)\]|`([A-Za-z][\w-]*):([^`]*)`/g;
/* Every tag form, for stripping a line back to its readable title. */
const ALL_TAGS_RE = /\[[A-Za-z][\w-]*::[^\]]*\]|`[A-Za-z#][\w-]*:?[^`]*`/g;

/* One field, either syntax, or '' when the line does not carry it. */
function readField(text, key){
  const m = new RegExp('\\[' + key + '::\\s*([^\\]]*)\\]|`' + key + ':([^`]*)`', 'i').exec(text);
  if (!m) return '';
  return (m[1] != null ? m[1] : m[2]).trim();
}
function hasField(text, key){
  return new RegExp('\\[' + key + '::|`' + key + ':', 'i').test(text);
}
/* Strips every tag in both syntaxes, leaving the words a human wrote. */
function stripTags(text){
  return text.replace(ALL_TAGS_RE, '').replace(/`(urgent|week)`/g, '');
}

/* Pulls every tag off a task line. The four added on 10 Aug 2026 — #slug, week,
   blocked-by: and rank: — are the sole source for the sections above the board,
   so they are parsed as first-class fields rather than left in `extra`. Anything
   still unrecognised goes to `extra` and is written back untouched. */
function parseTask(rawLines){
  const first = rawLines[0];
  const m = TASK_RE.exec(first);
  let rest = m[2];
  const tags = {};
  const extra = [];                                   // any tag we don't know about, kept verbatim
  let blockedBy = [], rank = null, slug = '', headline = '', chat = '', repeat = '';
  /* Either syntax lands here, so a tag means the same thing whichever form it
     arrived in. `whole` is what goes into `extra`, which keeps an unrecognised
     tag exactly as it was written. */
  const take = (whole, bk, bv, sk, sv) => {
    const k = bk != null ? bk : sk, v = bk != null ? bv : sv;
    const key = k.toLowerCase();
    if (key === 'impact' || key === 'effort' || key === 'due' || key === 'ai' ||
        key === 'start' || key === 'done' || key === 'to') tags[key] = v.trim();
    else if (key === 'blocked-by') blockedBy = v.split(',').map(s => s.trim()).filter(Boolean);
    else if (key === 'rank') rank = parseInt(v.trim(), 10);
    else if (key === 'headline') headline = v.trim();
    /* Which conversations belong to this task. Six characters that mean nothing
       on their own — data/sessions.json is what turns them into a list. It sits
       on the task rather than in that file because a task gets renamed, moved
       between buckets and reordered, and a key written on the line survives all
       three where a key made out of the title survives none of them. */
    else if (key === 'chat') chat = v.trim().toLowerCase();
    /* How often this task comes round. First-class rather than left in `extra`
       because the load-time roll has to read it on every task, and because two
       views ask about it — the card's chip and the Quick wins group. */
    else if (key === 'repeat') repeat = v.trim().toLowerCase();
    else extra.push(whole);
    return ' ';
  };
  rest = rest.replace(ANY_TAG_RE, take);
  rest = rest.replace(/`#([a-z0-9][a-z0-9-]*)`/gi, (whole, s) => { slug = s.toLowerCase(); return ' '; });
  let urgent = false, week = false;
  rest = rest.replace(/`urgent`/g, () => { urgent = true; return ' '; });
  rest = rest.replace(/`week`/g, () => { week = true; return ' '; });
  let title = rest.replace(/\s+/g, ' ').trim();
  const bold = /^\*\*[\s\S]*\*\*$/.test(title);
  if (bold) title = title.slice(2, -2).trim();
  return {
    id: uid(),
    done: m[1].toLowerCase() === 'x',
    title, bold,
    impact: tags.impact || '',
    effort: tags.effort || '',
    due: tags.due || '',
    /* The deadline and the earliest possible start are two different facts. One
       date was doing both jobs, which meant nothing could tell "finish by the
       7th" apart from "cannot begin until the 1st". */
    start: tags.start || '',
    /* The day it was ticked off. Nothing in the file used to record this, so
       "finished a while ago" was unanswerable — which is exactly what archiving
       old finished work needs to know. Written when a task is ticked. */
    doneOn: tags.done || '',
    ai: tags.ai || '',
    /* Who this has been handed to. A person, not Claude — `ai:` already says
       whether the machine is doing it, and the two answer different questions:
       one task can be delegated to someone and still be drafted by Claude.
       Optional, and blank on almost everything, so nothing shows when it is. */
    to: tags.to || '',
    urgent, week, slug, blockedBy, rank, headline, chat, repeat, extra,
    body: rawLines.slice(1),
    raw: first,
    dirty: false
  };
}

function serializeTask(t){
  let first;
  if (!t.dirty) {
    first = t.raw;
  } else {
    const box = t.done ? '[x]' : '[ ]';
    const name = t.bold === false ? t.title : '**' + t.title + '**';
    const tags = [];
    /* The four Dataview reads are written as inline fields; the rest stay code
       spans. Order is unchanged, so a task rewritten by the board still diffs
       cleanly against one edited by hand. */
    if (t.slug)   tags.push('`#' + t.slug + '`');
    if (t.impact) tags.push('[impact:: ' + t.impact + ']');
    if (t.effort) tags.push('[effort:: ' + t.effort + ']');
    if (t.start)  tags.push('`start:' + t.start + '`');
    if (t.due)    tags.push('[due:: ' + t.due + ']');
    if (t.done && t.doneOn) tags.push('`done:' + t.doneOn + '`');
    if (t.urgent) tags.push('`urgent`');
    if (t.week)   tags.push('`week`');
    if (t.ai)     tags.push('[ai:: ' + t.ai + ']');
    if (t.to && t.to.trim()) tags.push('[to:: ' + t.to.trim() + ']');
    if (t.blockedBy && t.blockedBy.length) tags.push('`blocked-by:' + t.blockedBy.join(',') + '`');
    if (t.rank != null && !isNaN(t.rank)) tags.push('`rank:' + t.rank + '`');
    if (t.headline) tags.push('`headline:' + t.headline + '`');
    if (t.chat)   tags.push('`chat:' + t.chat + '`');
    if (t.repeat) tags.push('`repeat:' + t.repeat + '`');
    if (t.extra && t.extra.length) tags.push.apply(tags, t.extra);
    first = '- ' + box + ' ' + [name].concat(tags).join(' ');
  }
  const body = t.body.slice();
  while (body.length && body[body.length - 1].trim() === '') body.pop();
  return [first].concat(body);
}

/* Everything between the task lines — blank lines, stray prose, the `---` rule at
   the foot of a bucket — is kept verbatim so that saving a file nobody edited
   gives back the same bytes. `lead` is what sits under a column heading, `sep`
   is what follows a task, `tail` is what closes a column, `tail` on the bucket
   is what closes the bucket (so a column added later lands above the rule). */
function parseDoc(text){
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const doc = { pre: [], buckets: [], post: [] };
  let i = 0;

  while (i < lines.length && !BUCKET_RE.test(lines[i])) doc.pre.push(lines[i++]);

  while (i < lines.length) {
    const bm = BUCKET_RE.exec(lines[i]);
    if (!bm) break;
    const bucket = { num: bm[1], name: bm[2].trim(), raw: lines[i], intro: [], tiers: [], tail: [] };
    i++;
    while (i < lines.length && !TIER_RE.test(lines[i]) && !/^##\s/.test(lines[i])) bucket.intro.push(lines[i++]);

    while (i < lines.length && TIER_RE.test(lines[i])) {
      const tier = { name: TIER_RE.exec(lines[i])[1].trim(), raw: lines[i],
                     lead: null, tasks: [], tail: [] };
      i++;
      let gap = [];                                   // lines seen since the last task
      while (i < lines.length && !TIER_RE.test(lines[i]) && !/^##\s/.test(lines[i])) {
        const line = lines[i];
        if (TASK_RE.test(line)) {
          if (tier.tasks.length) tier.tasks[tier.tasks.length - 1].sep = gap;
          else tier.lead = gap;
          gap = [];
          const raw = [line];
          i++;
          while (i < lines.length) {
            const l = lines[i];
            if (l.trim() === '') {                       // blank: keep only if the block continues
              let j = i;
              while (j < lines.length && lines[j].trim() === '') j++;
              if (j < lines.length && /^\s+\S/.test(lines[j])) { raw.push.apply(raw, lines.slice(i, j)); i = j; continue; }
              break;
            }
            if (/^\s+\S/.test(l)) { raw.push(l); i++; continue; }  // indented: part of this task
            break;
          }
          tier.tasks.push(parseTask(raw));
        } else {
          gap.push(line);
          i++;
        }
      }
      if (tier.tasks.length) {
        tier.tail = gap;
      } else {
        /* Empty column: the blank line belongs under the heading, anything after
           it closes the column, so a first card lands between the two. */
        let k = 0;
        while (k < gap.length && gap[k].trim() === '') k++;
        tier.lead = gap.slice(0, k);
        tier.tail = gap.slice(k);
      }
      bucket.tiers.push(tier);
    }
    /* Hand the closing blank/rule lines back to the bucket, so they stay at the
       bottom even if a new column is appended. */
    if (bucket.tiers.length) {
      const last = bucket.tiers[bucket.tiers.length - 1];
      let cut = last.tail.length;
      while (cut > 0 && (last.tail[cut - 1].trim() === '' || HR_RE.test(last.tail[cut - 1]))) cut--;
      /* Leave one blank line with the column, so a card appended to it is still
         separated from the rule below. */
      if (cut < last.tail.length && last.tail[cut].trim() === '') cut++;
      bucket.tail = last.tail.slice(cut);
      last.tail = last.tail.slice(0, cut);
    }
    doc.buckets.push(bucket);
  }
  doc.post = lines.slice(i);
  return doc;
}

function serializeDoc(doc){
  const out = doc.pre.slice();
  doc.buckets.forEach(b => {
    out.push(b.raw != null ? b.raw : '## ' + b.num + '. ' + b.name);
    out.push.apply(out, b.intro);
    b.tiers.forEach(tier => {
      out.push(tier.raw != null ? tier.raw : '### ' + tier.name);
      out.push.apply(out, tier.lead != null ? tier.lead : ['']);
      tier.tasks.forEach((t, idx) => {
        out.push.apply(out, serializeTask(t));
        const last = idx === tier.tasks.length - 1;
        out.push.apply(out, last ? (tier.tail || ['']) : (t.sep != null ? t.sep : ['']));
      });
      if (!tier.tasks.length) out.push.apply(out, tier.tail || []);
    });
    out.push.apply(out, b.tail != null ? b.tail : []);
  });
  out.push.apply(out, doc.post);
  return out.join('\n');
}

/* ---- Sub-steps, and the suggested messages inside them ----------------- */

const SUB_RE = /^(\s*)-\s+\[([ xX])\]\s+(.*)$/;

/* A task's body splits into its own notes and its sub-steps, each sub-step
   carrying the deeper-indented notes that belong to it. That depth is what says
   whether a suggested message serves the task or one step inside it. */
function splitBody(t){
  const notes = [], steps = [];
  let base = null;
  t.body.forEach((line, idx) => {
    const m = SUB_RE.exec(line);
    if (m && (base === null || m[1].length <= base)) {
      base = m[1].length;
      const text = m[3];
      steps.push({
        line: idx,                           // index back into the body, so it can be ticked
        done: m[2].toLowerCase() === 'x',
        text,
        due:   readField(text, 'due'),
        start: readField(text, 'start'),
        ai:    readField(text, 'ai'),
        /* Half the blockers in the file are steps, not whole tasks. Without the
           slug here, a `blocked-by:` pointing at one never resolves, so anything
           waiting on it looks permanently stuck. */
        slug: (/`#([a-z0-9][a-z0-9-]*)`/i.exec(text) || [,''])[1].toLowerCase(),
        rank: /`rank:(\d+)`/.test(text) ? +/`rank:(\d+)`/.exec(text)[1] : null,
        week: /`week`/.test(text),
        /* A step can wait on another step, which is the difference between "must
           be finished by the 7th" and "cannot start until the request goes out".
           A date cannot say the second thing, so without this the two are
           indistinguishable and Quick wins has to guess. */
        blockedBy: (/`blocked-by:([^`]*)`/.exec(text) || [,''])[1]
                     .split(',').map(s => s.trim()).filter(Boolean),
        clean: stripTags(text).replace(/\s+/g, ' ').replace(/\s*—\s*$/, '').trim(),
        notes: []
      });
      return;
    }
    if (steps.length && base !== null && /^\s+\S/.test(line) && leadIndent(line) > base) {
      steps[steps.length - 1].notes.push(line);
      return;
    }
    if (line.trim()) notes.push(line);
  });
  return { notes, steps };
}
function leadIndent(l){ return l.length - l.replace(/^\s+/, '').length; }

/* The marker for a message written to be sent as it is. "(draft)" says he has
   to edit it first — anything about probation, performance or salary. It used
   to be free prose mid-sentence, which nothing could read reliably. */
const MSG_NOTE    = /^\s*-\s+Suggested message(\s*\(draft\))?\s*:/i;

/* The text of a note, without its label. Quotes win when there are two of them,
   so a colon inside the message does not split it in the wrong place; without
   them everything after the first colon is the message, which is the shape that
   survives being pasted out of an older file. Curly quotes count — they are what
   arrives from anything with autocorrect in it. */
function quoted(line){
  const q = [];
  for (let i = 0; i < line.length; i++) if (/["“”]/.test(line[i])) q.push(i);
  if (q.length >= 2) return line.slice(q[0] + 1, q[q.length - 1]).trim();
  return line.slice(line.indexOf(':') + 1).trim();
}

/* ---- Recurring tasks ----
   Work that comes round on a cycle: the standing 1:1s, the monthly AOP update.
   Until now every one of them was retyped by hand, which is how the same task
   ends up on the list three times in slightly different words.

   One tag, `repeat:`, and one card. Not a template that spawns copies: a card
   per occurrence would put a ticked "prepare for the 1:1" in Done every week
   for as long as the meeting exists, and the only question ever asked of last
   week's is what was on it — which is one note, not a whole card.

     `repeat:wed`       every Wednesday
     `repeat:wed-9:15`  every Wednesday at 9:15
     `repeat:15`        the 15th of every month
     `repeat:wd5`       the fifth working day of every month
     `repeat:tue2`      the 2nd Tuesday of every month
     `repeat:tue2-15:00`  the 2nd Tuesday of every month, at 15:00
     `repeat:~thu-14:00`  roughly weekly on Thursday, but the day moves
     `repeat:wed/2`     every other Wednesday
     `repeat:15/3`      the 15th, quarterly
     `repeat:tue2/3`    the 2nd Tuesday, quarterly

   The `/n` suffix multiplies whatever comes before it: `/2` on a weekly form is
   fortnightly, `/3` on any monthly one is quarterly, and it reads the same way
   on all four bases. It is a suffix rather than four new forms because a
   quarterly meeting is not a different kind of cycle from a monthly one, it is
   the same cycle counted differently — and `[due:: ]` was already carrying the
   phase that makes "every other" mean anything.

   The nth-weekday form is for a meeting that is monthly but pinned to a
   weekday rather than a day of the month — Game & Animation Production is
   the case: the second Tuesday, not the 13th. `wd5` already covers "the
   nth working day"; this covers "the nth Tuesday" the same way, sharing the
   nth-Monday-to-Friday-or-clamp logic with it.

   The `~` says the cadence is the usual shape rather than a rule. The design
   system drop-in is the case: it is weekly, but which day it lands on gets
   rebooked around everything else, so it ran Fri, Thu, Fri, Thu across four
   sessions. Without `~` the checker would flag every one of those as a date
   disagreeing with its tag, which is right for a fixed slot and pure noise for
   this one. The board still rolls to the tagged day, since that is the best
   default available — the date is his to correct when the session moves.

   The working-day form exists because a real obligation needed it: the AOP
   status update is due by the fifth working day, which is a different date every
   month and is not expressible as a day of the month at all. Working means
   Monday to Friday here, and nothing about bank holidays — the checker already
   flags any date landing on one, and teaching two files the same holiday list
   would be two lists to keep in step.

   `[due:: ]` is the occurrence the card is currently pointing at, and the board
   moves it on once that date has passed. So the tag says how often, the date
   says which one, and neither is derivable from the other. */
const REPEAT_VAL = /^(~?)(?:([a-z]{3})([1-5])?(?:[-\s]+(\d{1,2}:\d{2}))?|wd(\d{1,2})|(\d{1,2}))(?:\/(\d{1,2}))?$/i;
const REPEAT_DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
/* Two years either way. Past that a "cycle" is an anniversary, and a date typed
   once is clearer than a rule nobody will remember the phase of. */
const MAX_EVERY = 24;

/* How often the base cycle actually comes round: `/2` on a weekly form is
   fortnightly, `/3` on a monthly one is quarterly. One suffix rather than a form
   per cadence, because it multiplies every base the grammar already has — a
   quarterly report on the 15th is `15/3`, a quarterly one on the second Tuesday
   is `tue2/3`, and neither needed a new idea.

   The phase lives in `[due:: ]`, not in the tag. "Every other Wednesday" is not
   a fact about Wednesdays, it is a fact about which Wednesday you are on, and
   the card already carries that — so the interval counts from the current
   occurrence and `occurrenceAfter` is the only place it applies. A task tagged
   `/n` with no date yet gets the next plain occurrence of its base cycle, and
   the interval starts from there. */
function everyLabel(n, unit){
  if (n === 1) return '';
  if (unit === 'week') return n === 2 ? 'fortnightly' : 'every ' + n + ' weeks';
  return n === 3 ? 'quarterly' : (n === 6 ? 'twice a year' : 'every ' + n + ' months');
}

function readRepeat(val){
  const m = REPEAT_VAL.exec(String(val || '').trim());
  if (!m) return null;
  const loose = m[1] === '~';
  const every = m[7] ? +m[7] : 1;
  if (every < 1 || every > MAX_EVERY) return null;
  const cyc = u => everyLabel(every, u);
  if (m[5]) {
    const nth = +m[5];
    if (nth < 1 || nth > 23) return null;          // 23 working days is a long month
    return { kind:'workday', nth, time:'', loose, every,
             label:(cyc('month') || 'monthly') + ', ' + ordinal(nth) + ' working day' };
  }
  if (m[6]) {
    const dom = +m[6];
    if (dom < 1 || dom > 31) return null;
    return { kind:'monthly', dom, time:'', loose, every,
             label:(cyc('month') || 'monthly') + ', ' + ordinal(dom) };
  }
  const dow = REPEAT_DAYS.indexOf(m[2].toLowerCase());
  if (dow < 0) return null;
  const time = m[4] || '';
  if (m[3]) {
    const nth = +m[3];
    return { kind:'monthly-dow', dow, nth, time, loose, every,
             label:(cyc('month') || 'monthly') + ', ' + ordinal(nth) + ' ' + DAY_NAMES[dow] +
                   (time ? ' ' + time : '') };
  }
  return { kind:'weekly', dow, time, loose, every,
           label:(every === 1
                   ? (loose ? 'weekly, usually ' : 'every ')
                   : cyc('week') + ', ' + (loose ? 'usually ' : '')) + DAY_NAMES[dow] +
                 (time ? ' ' + time : '') };
}
/* The nth day in a month matching `test`, or the last match when the month is
   too short to have an nth. Same call the monthly form makes: a date
   somebody meant to hit is better clamped than skipped. Shared by the
   working-day form (nth Monday-to-Friday day) and the nth-weekday form (nth
   Tuesday, say) — same walk, different test. */
function nthDayMatching(y, mo, nth, test){
  const last = new Date(y, mo + 1, 0).getDate();
  let seen = 0, fallback = 1;
  for (let day = 1; day <= last; day++) {
    if (!test(new Date(y, mo, day).getDay())) continue;
    fallback = day;
    if (++seen === nth) return new Date(y, mo, day);
  }
  return new Date(y, mo, fallback);
}
function nthWorkday(y, mo, nth){
  return nthDayMatching(y, mo, nth, wd => wd !== 0 && wd !== 6);
}
function nthWeekday(y, mo, dow, nth){
  return nthDayMatching(y, mo, nth, wd => wd === dow);
}
function ordinal(n){
  const s = ['th','st','nd','rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/* The first occurrence on or after `from`. On the morning of the meeting that is
   still today, which is right: the agenda is wanted before it starts, so the day
   of it is not yet the next one.

   A monthly day that a short month does not have lands on that month's last day
   rather than skipping the month. The 31st in February is a date he still means
   to hit, and skipping is the one answer that is certainly wrong. */
function occurrenceFrom(rep, from){
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (rep.kind === 'weekly') {
    d.setDate(d.getDate() + ((rep.dow - d.getDay() + 7) % 7));
    return d;
  }
  let y = d.getFullYear(), mo = d.getMonth();
  if (rep.kind === 'workday') {
    /* Compared against the real date rather than a day number, since the nth
       working day of this month can be later than the nth of the next one. */
    let hit = nthWorkday(y, mo, rep.nth);
    if (hit < d) hit = nthWorkday(mo === 11 ? y + 1 : y, (mo + 1) % 12, rep.nth);
    return hit;
  }
  if (rep.kind === 'monthly-dow') {
    let hit = nthWeekday(y, mo, rep.dow, rep.nth);
    if (hit < d) hit = nthWeekday(mo === 11 ? y + 1 : y, (mo + 1) % 12, rep.dow, rep.nth);
    return hit;
  }
  if (d.getDate() > Math.min(rep.dom, new Date(y, mo + 1, 0).getDate())) mo++;
  const last = new Date(y, mo + 1, 0).getDate();
  return new Date(y, mo, Math.min(rep.dom, last));
}
/* The occurrence strictly after this one, which is what rolling forward needs.

   This is where an interval applies, and the only place it does. `occurrenceFrom`
   answers "the next Wednesday", which needs no phase; this answers "the next one
   of mine", which is entirely phase, counted from the occurrence handed in. The
   roll always hands in the card's current date, so the phase is whatever he last
   set — move the date by hand and the whole series moves with it, which is the
   behaviour a rebooked fortnightly meeting wants. */
function occurrenceAfter(rep, date){
  const n = rep.every || 1;
  if (n === 1) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    return occurrenceFrom(rep, d);
  }
  if (rep.kind === 'weekly') {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7 * n);
    // Zero unless the date was moved onto some other weekday by hand, in which
    // case this snaps back onto the tagged day rather than drifting on it.
    d.setDate(d.getDate() + ((rep.dow - d.getDay() + 7) % 7));
    return d;
  }
  // Month overflow is Date's own — month 12 is next January — so n months on is
  // an addition and nothing else.
  const y = date.getFullYear(), mo = date.getMonth() + n;
  if (rep.kind === 'workday') return nthWorkday(y, mo, rep.nth);
  if (rep.kind === 'monthly-dow') return nthWeekday(y, mo, rep.dow, rep.nth);
  return new Date(y, mo, Math.min(rep.dom, new Date(y, mo + 1, 0).getDate()));
}
