'use strict';

/* =========================================================================
   3. Dates & sub-steps
   ========================================================================= */

function today(){ const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function parseDue(s){
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((s||'').trim());
  return m ? new Date(+m[1], +m[2]-1, +m[3]) : null;
}
/* `muted` is set on anything sitting in Waiting for review: the date is still
   worth showing, but the work is done as far as he is concerned, so it should
   not read as something to act on today. The label and the note stay — "5d
   late" is still a true fact about the date — only the red/amber urgency
   colour is withheld. */
function dueInfo(s, muted){
  const d = parseDue(s);
  if (!d) return null;
  const days = Math.round((d - today()) / 86400000);
  const label = d.toLocaleDateString(undefined, { day:'numeric', month:'short' });
  let cls = '', note = '';
  if (days < 0)       { note = Math.abs(days) + 'd late'; }
  else if (days === 0){ note = 'today'; }
  else if (days <= 4) { note = 'in ' + days + 'd'; }
  if (!muted) {
    if (days <= 0) cls = 'over';
    else if (days <= 4) cls = 'soon';
  }
  return { label, cls, note, days };
}
/* `start:` is the earliest the work can begin. Only the future matters — a start
   date that has passed is just history, and showing it would be noise on every
   card that has ever had one. */
function startInfo(s){
  const d = parseDue(s);
  if (!d) return null;
  const days = Math.round((d - today()) / 86400000);
  if (days <= 0) return null;                      // already open, nothing to say
  return {
    days,
    label: 'from ' + d.toLocaleDateString(undefined, { day:'numeric', month:'short' }),
    note: days === 1 ? 'tomorrow' : 'in ' + days + 'd'
  };
}
function notYet(s){ return !!startInfo(s); }
/* The stricter of two start dates. Both may be blank. */
function laterOf(a, b){
  const da = parseDue(a), db = parseDue(b);
  if (!da) return b || '';
  if (!db) return a || '';
  return da > db ? a : b;
}

function subSteps(t){
  const out = [];
  t.body.forEach((line, i) => {
    const m = SUB_RE.exec(line);
    if (!m) return;
    out.push({
      line: i, indent: m[1], done: m[2].toLowerCase() === 'x', text: m[3],
      due: readField(m[3], 'due'),
      doneOn: readField(m[3], 'done'),
      clean: stripTags(m[3]).replace(/\s+/g, ' ').replace(/\s*—\s*$/, '').trim()
    });
  });
  return out;
}
function noteLines(t){
  return t.body.filter(l => l.trim() !== '' && !SUB_RE.test(l)).length;
}

/* ---- Projects ----
   Work carrying more context than a line can hold keeps a folder under
   `data/projects/<name>/`, with a CLAUDE.md inside holding the background and
   the source documents beside it. The task stays short and names the folder in
   an ordinary note on it:

     - Project: `data/projects/AOP2027`. Background in its CLAUDE.md, the raw
       material for the rescope in redefinition-brief.md.

   The board reads that note rather than asking for a tag of its own. The
   pointer was already written this way in the file before the board knew about
   projects, and a second syntax for the same fact would only give the two a
   chance to disagree. Only the name is taken; the rest of the sentence stays a
   note, where a person put it. */
const PROJECT_RE = /(?:^|[\s`(\[])data\/projects\/([A-Za-z0-9][A-Za-z0-9._-]*)/;
function taskProject(t){
  for (let i = 0; i < t.body.length; i++) {
    const m = PROJECT_RE.exec(t.body[i]);
    if (m) return m[1];
  }
  return '';
}
/* Every task pointing at one folder, in board order, Done included — a project
   is the whole of the work, and half of it being finished is the answer to
   "where is this up to" rather than something to hide. */
function projectTasks(name){
  const out = [];
  state.doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t => {
    if (taskProject(t) === name) {
      out.push({ task: t, bucket: b.name, tier: t.done ? DONE_COL : tier.name });
    }
  })));
  return out;
}

/* Notes and sub-steps are edited separately, so split them apart — remembering
   how many notes came before the steps, to put the block back where it was. */
function bodyParts(t){
  const notes = [], subs = [];
  let subsAt = -1;
  t.body.forEach(l => {
    if (SUB_RE.test(l)) { if (subsAt < 0) subsAt = notes.length; subs.push(l); }
    else notes.push(l);
  });
  return { notes, subs, subsAt: subsAt < 0 ? notes.length : subsAt };
}
function rebuildBody(t, notes, subs, subsAt){
  const at = Math.max(0, Math.min(subsAt, notes.length));
  t.body = notes.slice(0, at).concat(subs, notes.slice(at));
}
function moveSub(t, from, to){
  if (state.locked) return;
  const p = bodyParts(t);
  if (from === to || from < 0 || from >= p.subs.length) return;
  const item = p.subs.splice(from, 1)[0];
  p.subs.splice(to > from ? to - 1 : to, 0, item);
  rebuildBody(t, p.notes, p.subs, p.subsAt);
  markDirty();
}
/* setDone's treatment, applied to one sub-step: ticking writes a `done:` date
   on the line, unticking clears it, so a sub-step is dated the same way a
   task is rather than leaving the box as the only record of when it moved. */
function toggleSub(t, lineIdx){
  if (state.locked) return;
  const m = SUB_RE.exec(t.body[lineIdx]);
  if (!m) return;
  const toDone = m[2].toLowerCase() !== 'x';
  const box = toDone ? '[x]' : '[ ]';
  let text = m[3].replace(/\[done::\s*[^\]]*\]|`done:[^`]*`/i, '')
                  .replace(/\s{2,}/g, ' ').trim();
  if (toDone) text = (text ? text + ' ' : '') + '[done:: ' + ymd(today()) + ']';
  t.body[lineIdx] = m[1] + '- ' + box + ' ' + text;
  markDirty();
}
/* Replaces the text of one sub-step in place, keeping its indent and tick state.
   The line still carries whatever tags it had — due dates and the rest — since
   the edit box holds the raw line, the same convention the notes textarea uses. */
function setSubText(t, lineIdx, text){
  if (state.locked) return;
  const m = SUB_RE.exec(t.body[lineIdx]);
  if (!m) return;
  t.body[lineIdx] = m[1] + '- [' + m[2] + '] ' + text;
  markDirty();
}
function removeSubLine(t, lineIdx){
  if (state.locked) return;
  t.body.splice(lineIdx, 1);
  markDirty();
}
/* Appends a blank step at the end of the list. It comes back empty rather than
   with placeholder text, because the caller drops straight into editing it. */
function addSub(t){
  if (state.locked) return;
  const p = bodyParts(t);
  p.subs.push('  - [ ] ');
  rebuildBody(t, p.notes, p.subs, p.subsAt);
  markDirty();
}

/* ---- A note on one step ----
   A step already carries whatever is indented deeper than its own bullet — a
   Suggested message, a Prompt, or just a line of plain prose saying what
   happened. splitBody (core/todo.js) works this out per step already, for the
   suggestion panels; this walks the same rule — deeper-indented lines belong to
   the step above them — to find the exact range in the body so it can be
   edited and written back in place, without touching anything before or after
   it. No format change: this exposes what a step could already carry, it does
   not add a new kind of line. */
function stepNoteRange(t, lineIdx){
  const base = leadIndent(t.body[lineIdx]);
  let end = lineIdx + 1;
  while (end < t.body.length && /^\s+\S/.test(t.body[end]) && leadIndent(t.body[end]) > base) end++;
  return { start: lineIdx + 1, end, base };
}
function stepNoteText(t, lineIdx){
  const { start, end, base } = stepNoteRange(t, lineIdx);
  const re = new RegExp('^ {1,' + (base + 2) + '}');
  return t.body.slice(start, end).map(l => l.replace(re, '')).join('\n').replace(/\n+$/, '');
}
function setStepNoteText(t, lineIdx, text){
  if (state.locked) return;
  const { start, end, base } = stepNoteRange(t, lineIdx);
  const pad = ' '.repeat(base + 2);
  const body = text.replace(/\s+$/, '');
  const lines = body === '' ? [] : body.split('\n').map(l => l.trim() === '' ? '' : pad + l);
  t.body.splice(start, end - start, ...lines);
  markDirty();
}

