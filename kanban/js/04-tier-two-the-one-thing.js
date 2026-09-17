'use strict';

/* =========================================================================
   2c. Tier two: the one thing
   One task at a time carries `headline:<date it was set>`. It is the task that
   makes the others easier or unnecessary, so it is not simply the top of the
   sorted list — it is chosen, and it stays chosen until it is solved.
   ========================================================================= */

function headlineTask(){
  if (!state.doc) return null;
  for (const b of state.doc.buckets)
    for (const ti of b.tiers)
      for (const t of ti.tasks)
        if (t.headline) return { task:t, bucket:b, tier:ti };
  return null;
}
/* Clearing every other one first is what keeps "one thing" true. Two headlines
   in the file is the same failure as a week with two priorities. */
function setHeadline(id){
  if (state.locked) return;
  const loc = locate(id);
  if (!loc) return;
  clearHeadline(true);
  loc.task.headline = ymd(today());
  loc.task.dirty = true;
  markDirty(); refreshView();
  if (state.openTask) openDrawer(state.openTask);
}
function clearHeadline(quiet){
  if (state.locked) return;
  state.doc.buckets.forEach(b => b.tiers.forEach(ti => ti.tasks.forEach(t => {
    if (t.headline) { t.headline = ''; t.dirty = true; }
  })));
  if (quiet) return;
  markDirty(); refreshView();
  if (state.openTask) openDrawer(state.openTask);
}
/* How many live tasks name this one as their blocker. This is the evidence for
   picking it, so the bar shows the number rather than asking him to trust it. */
function unblockCount(t){
  if (!t.slug) return 0;
  return allItems().filter(i => !i.done && i.blockedBy.indexOf(t.slug) > -1).length;
}

/* The board calls this column Backlog, so the file says Backlog too. */
/* Tasks ticked off before the board started dating them have no `done:` at all,
   so nothing can tell whether they were finished yesterday or in March. They are
   stamped with today on first sight: the clock has to start somewhere, and
   starting it now means nothing is archived before it has been sat with for the
   full thirty days. Returns how many were stamped, to say so rather than quietly
   marking the file dirty. */
/* Gives an id to any task that has not got one, on load.

   The 137 tasks that existed when ids arrived were done in one pass by
   core/migrations/mint-ids.mjs. This is what keeps it true afterwards: a task
   added by the pa skill, pasted in, or restored from a backup taken before the
   migration arrives without one, and picks one up the first time the board sees
   it. The same shape as stampDoneDates and renameParked below, and it counts as
   a tidy-up rather than his own work, so migratedOnly stays true and the
   watcher may still reload over it.

   Marks only the tasks it touches dirty, so a file where everything already has
   an id is not rewritten at all. */
function mintMissingIds(doc){
  const taken = idsInDoc(doc);
  let n = 0;
  for (const b of doc.buckets)
    for (const tier of b.tiers)
      for (const t of tier.tasks){
        if (t.stableId) continue;
        t.stableId = mintId(taken);
        taken.add(t.stableId);
        t.dirty = true;
        n++;
      }
  return n;
}

function stampDoneDates(doc){
  let n = 0;
  const now = ymd(today());
  doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t => {
    if (t.done && !t.doneOn) { t.doneOn = now; t.dirty = true; n++; }
  })));
  return n;
}

/* ---- Rolling a recurring task onto its next occurrence ----
   Runs on load, beside the two fixups above and for the same reason: it is a
   fact about the calendar rather than a decision, so waiting to be asked would
   only mean the card said something untrue until somebody noticed.

   The board rather than the skill does it because the board is open every day
   and a check-in is not. A week without a check-in would otherwise leave last
   week's date on the card.

   Four things happen when an occurrence has passed:

   1. The agenda that was on it becomes `Previous agenda (that date):`, replacing
      whatever was there before. One cycle of history, which is what writing the
      next agenda actually needs — anything older is in his meeting notes.
   2. The tick comes off. On a recurring task the tick means "prepared for this
      one", so it has to come off when "this one" changes, or the card claims
      next week is done.
   3. `[due:: ]` moves to the next occurrence. In a loop, since the gap since the
      last time the board was open can be longer than one cycle.
   4. A task that was ticked gets parked somewhere that says how soon it matters
      again, rather than sitting wherever it happened to be finished from. Under
      a week to the next occurrence and it goes to To do, where the rest of the
      week's work is; a week or more and it goes to Backlog, out of the way
      until it is worth thinking about again. An occurrence that was never
      prepared for — still unticked when its date passed — has nothing to move
      on from, so it is left exactly where it was; only a "done" carries an
      opinion about what comes next.

   Nothing is rolled while the board is showing a backup: that document is a
   record of a past state and rewriting the dates in it would be a lie about
   what was on disk that day. */
/* How many lines a block-shaped note occupies, counting its heading. Used to cut
   one out without disturbing anything at or above its own indent. */
function blockLength(lines, at){
  const base = leadIndent(lines[at]);
  let end = at + 1;
  while (end < lines.length && (!lines[end].trim() || leadIndent(lines[end]) > base)) end++;
  return end - at;
}

/* Moves a date field on one line by a number of days, in whichever of the two
   syntaxes it was written in. Leaves the line alone when it carries no such
   field, which is the ordinary case. */
function shiftFieldDate(text, key, days){
  if (!days) return text;
  const re = new RegExp('(\\[' + key + '::\\s*)(\\d{4}-\\d{2}-\\d{2})(\\s*\\])|(`' + key +
                        ':)(\\d{4}-\\d{2}-\\d{2})(`)', 'i');
  return text.replace(re, (whole, a, d1, b, c, d2, e) => {
    const iso = d1 || d2;
    const d = parseDue(iso);
    if (!d) return whole;
    d.setDate(d.getDate() + days);
    return d1 ? a + ymd(d) + b : c + ymd(d) + e;
  });
}

function rollRecurring(doc){
  const now = today();
  let n = 0, c = 0, moved = 0;
  const archived = [];
  // Collected rather than applied in place: this runs inside a forEach over
  // tier.tasks itself, and splicing the array a task's own iteration is
  // sitting in is how the next task in the same tier gets silently skipped.
  // Applied once, after every tier has been walked.
  const parks = [];
  doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t => {
    const rep = readRepeat(t.repeat);
    if (!rep) return;

    /* No date yet — a task he has just tagged, or one the skill wrote without
       one. Give it its next occurrence rather than flagging it: the tag already
       says which day, so the date is derivable and asking would be busywork. */
    const cur = parseDue(t.due);
    if (!cur) {
      t.due = ymd(occurrenceFrom(rep, now));
      t.dirty = true;
      n++;
      return;
    }
    if (cur >= now) return;

    let next = occurrenceAfter(rep, cur);
    while (next < now) next = occurrenceAfter(rep, next);
    const shift = Math.round((next - cur) / 86400000);

    /* Edited on `t.body` in place, line by line, rather than through
       bodyParts/rebuildBody. Those two split every sub-step line away from every
       note line and reassemble the two runs back to back, which is right for the
       drawer's Description box — it only ever shows the task's own notes — and
       lossy here: a note belonging to a sub-step, a suggested message under
       "send the nudge", comes back attached to whichever step happens to end up
       last. In place, nothing moves that was not meant to. */
    /* The tick is what decides whether the agenda has been used. It means
       "prepared for this occurrence", so a ticked card whose date has gone is
       one where the prep was delivered — file the agenda as last cycle's. An
       unticked one is prep that never happened, which means those topics were
       never raised, so they carry forward to the new date instead.

       That distinction is the whole answer to a 1:1 that does not happen. The
       topics survive rather than being filed as history he then has to dig out,
       and carrying a topic that did get discussed is the cheaper mistake of the
       two: he deletes a line he can see, rather than losing one he cannot. */
    const agAt = t.body.findIndex(l => AGENDA_NOTE.test(l));
    let carried = false;
    if (agAt > -1 && t.done) {
      /* Cut last cycle's Previous block first, or a year of them accumulates
         under a task nobody scrolls to the bottom of. Cut before rewriting, and
         re-find the agenda afterwards, since cutting shifts the indices.

         The card keeps one cycle of history, which is what writing the next
         agenda needs — but the one being cut here is not nothing, it is a
         record of a meeting that happened. Filed to agenda-history.md before
         it goes, so a month back is still readable somewhere, just not on the
         card itself. */
      const prevAt = t.body.findIndex(l => PREV_AGENDA_NOTE.test(l));
      if (prevAt > -1) {
        const old = readPrevAgenda(t.body);
        if (old) archived.push({ title: t.title, when: old.date, topics: old.topics });
        t.body.splice(prevAt, blockLength(t.body, prevAt));
      }
      const at = t.body.findIndex(l => AGENDA_NOTE.test(l));
      const m = AGENDA_NOTE.exec(t.body[at]);
      t.body[at] = m[1] + '- Previous agenda (' + t.due + '):';
    } else if (agAt > -1) {
      carried = true;
    }

    /* Checked before setDone() clears it below — this is the state the task
       is rolling out of, not the one it's rolling into. A gap of a week
       reads on the calendar the same way a working week does, which is the
       only reason 7 is the line: less than that and it's still this week's
       business, so it goes to To do; a week or more and it's next week's
       problem at the earliest, so it's parked in Backlog instead. */
    if (t.done) {
      const gap = Math.round((next - now) / 86400000);
      parks.push({ bucket: b, from: tier, task: t, to: gap >= 7 ? BACKLOG_TIER : TODO_TIER });
      moved++;
    }

    setDone(t, false);
    /* And every sub-step with it. A recurring task's steps are the work of one
       occurrence — send the nudge, review what came back — so a step still
       ticked from last time reads as already done for a cycle it has never seen.
       Their `done:` dates go the same way the task's does.

       A step's own `[due:: ]` is an offset from the occurrence rather than a
       fixed date — "the nudge goes out two days before" — so it moves by exactly
       what the parent moved by. Clearing it would lose that intent and leaving it
       would point at a session that has already happened. */
    t.body.forEach((line, i) => {
      const sm = SUB_RE.exec(line);
      if (!sm) return;
      let text = sm[3];
      if (sm[2].toLowerCase() === 'x') {
        text = text.replace(/\[done::\s*[^\]]*\]|`done:[^`]*`/i, '')
                   .replace(/\s{2,}/g, ' ').trim();
      }
      text = shiftFieldDate(text, 'due', shift);
      text = shiftFieldDate(text, 'start', shift);
      t.body[i] = sm[1] + '- [ ] ' + text;
    });
    t.due = ymd(next);
    t.dirty = true;
    n++;
    if (carried) c++;
  })));
  // Same move the Column field's own slider makes (see wireStepSlider('f-tier',
  // ...) in 19-drawer.js) — splice out of the tier the roll found it in, push
  // onto the target, skip the write entirely when they're already the same
  // tier so a task already sitting in To do isn't reshuffled to the bottom of
  // its own column for no reason.
  parks.forEach(({ bucket, from, task, to }) => {
    const target = ensureTier(bucket, to);
    if (target === from) return;
    const at = from.tasks.indexOf(task);
    if (at > -1) from.tasks.splice(at, 1);
    target.tasks.push(task);
  });
  return { n, carried: c, moved, archived };
}

/* The plain-text shape of one filed agenda, reused from agendaClipboard's
   bullet-building but without the clipboard's title/blank-line wrapper —
   this is a heading in a file that already carries the date and the task
   it belonged to, not a document pasted somewhere else. */
function agendaHistoryMarkdown(entries){
  return entries.map(e => {
    const heading = '## ' + e.title + (e.when ? ' (' + e.when + ')' : '');
    const body = e.topics.map(t =>
      ['- ' + t.title].concat(t.context.map(c => '  - ' + c)).join('\n')
    ).join('\n');
    return heading + '\n\n' + body;
  }).join('\n\n');
}

/* Best effort, and silent on failure. Before this existed, a previous agenda
   the roll cut was simply gone — so a write that fails here leaves things no
   worse than they always were, and is not worth interrupting a page load
   over. Fired once, right after the roll that produced these entries. */
async function flushAgendaHistory(entries){
  if (!entries || !entries.length) return;
  try {
    await postJSON('/agenda-history', { text: agendaHistoryMarkdown(entries) });
  } catch (err) { /* nothing to do — see comment above */ }
}

function renameParked(doc){
  let changed = false;
  doc.buckets.forEach(b => b.tiers.forEach(t => { if (t.name === 'Parked') { t.name = 'Backlog'; t.raw = null; changed = true; } }));
  if (changed) doc.pre = doc.pre.map(l => l.replace(/\*\*Parked\*\*/g, '**Backlog**'));
  return changed;
}

const $  = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* The board's fetch shapes, collapsed out of what used to be 32 separate
   call sites copy-pasted from whichever one was nearest. A GET that forgets
   the cache-bust, or a POST that forgets X-Board, is how the two drift; going
   through here instead means a new endpoint gets both for free.

   getJSON throws on a non-OK response so callers get one try/catch rather
   than an `if (!res.ok)` of their own. postJSON always sends the two headers
   every write route wants (see the X-Board comment in server.py — the header
   itself is harmless on the handful of routes that don't check for it) and
   reads the body as JSON even on failure, since a write route's error rides
   in the same {error} shape as its success reply. */
async function getJSON(url){
  const sep = url.indexOf('?') === -1 ? '?' : '&';
  const res = await fetch(url + sep + 't=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('the server answered ' + res.status);
  return res.json();
}
async function sendJSON(method, url, data){
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Board': '1' },
    body: JSON.stringify(data)
  });
  const info = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(info.error || ('the server answered ' + res.status));
  return info;
}
function postJSON(url, data){ return sendJSON('POST', url, data); }
/* The one route the board writes with PUT rather than POST, because it
   replaces a whole file with a whole file: a bucket's brief. todo.md's own
   save is not this shape and does not go through here — it carries
   preconditions of its own (see 24-autosave-watching.js). */
function putJSON(url, data){ return sendJSON('PUT', url, data); }

function allTiers(){
  const names = [];
  (state.doc ? state.doc.buckets : []).forEach(b => b.tiers.forEach(t => { if (names.indexOf(t.name) < 0) names.push(t.name); }));
  if (!names.length) return ['Now','Next','Later','Parked'];
  // Blocked always sits right after Waiting for review. Once a bucket actually
  // has the heading, the scan above finds it wherever that bucket happens to
  // put it in the merged list — meaningless, and it throws the board order
  // off (reversed, the end of this list is the far left of the board) — so
  // pull it back out and reinsert it in its fixed spot every time.
  const at = names.indexOf(BLOCKED_TIER);
  if (at > -1) names.splice(at, 1);
  const after = names.indexOf(WAIT_COL);
  names.splice(after < 0 ? names.length : after + 1, 0, BLOCKED_TIER);
  return names;
}
/* A bucket may not have every column heading yet (e.g. an empty "Now").
   Create it in the right place the first time a card lands there. */
function ensureTier(bucket, name){
  const found = bucket.tiers.find(t => t.name === name);
  if (found) return found;
  const tier = { name, raw: null, lead: [''], tasks: [], tail: [''] };
  const order = allTiers();
  const pos = order.indexOf(name);
  let at = bucket.tiers.length;
  for (let i = 0; i < bucket.tiers.length; i++){
    if (order.indexOf(bucket.tiers[i].name) > pos) { at = i; break; }
  }
  bucket.tiers.splice(at, 0, tier);
  return tier;
}
function locate(id){
  const d = state.doc;
  for (let bi = 0; bi < d.buckets.length; bi++){
    const b = d.buckets[bi];
    for (let ti = 0; ti < b.tiers.length; ti++){
      const idx = b.tiers[ti].tasks.findIndex(t => t.id === id);
      if (idx > -1) return { bucket:b, bi, tier:b.tiers[ti], ti, index:idx, task:b.tiers[ti].tasks[idx] };
    }
  }
  return null;
}
/* The single way a task's tick is changed. Five places used to set .done by hand,
   and every one of them would now have to remember to date it — so they all go
   through here instead. Returns true if anything actually changed. */
function setDone(t, on){
  if (state.locked) return false;
  if (t.done === on) return false;
  t.done = on;
  t.doneOn = on ? ymd(today()) : '';
  t.dirty = true;
  // Ticking the card off ticks its sub-steps too — a card in Done with open
  // steps under it reads as unfinished work, which it no longer is. Going the
  // other way leaves steps alone: dragging a card back out of Done doesn't
  // mean the steps that were already ticked got undone.
  if (on) splitBody(t).steps.forEach(s => { if (!s.done) toggleSub(t, s.line); });
  return true;
}

function markDirty(){
  if (state.locked) return;
  noteUndo();
  applyDirty();
}
function applyDirty(msg){
  state.dirty = true;
  state.migratedOnly = false;
  const s = $('#status');
  s.textContent = msg || 'unsaved changes';
  s.classList.add('dirty');
}

