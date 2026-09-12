'use strict';

/* =========================================================================
   5. Drawer
   ========================================================================= */

function dedent(lines){ return lines.map(l => l.replace(/^ {1,2}/, '')).join('\n').replace(/\n+$/, ''); }
function indent(text){
  return text.replace(/\s+$/,'').split('\n').map(l => l.trim() === '' ? '' : '  ' + l);
}

/* ---- Clicking rendered Markdown back into its source ----
   The Description shows rendered and edits raw (see the field in openDrawer),
   so a click on the rendering has to land on the same word in the Markdown
   underneath. Two steps: which character of the rendered text was clicked,
   and where that character is in the source.

   The second step is the awkward one, because mdInline drops the marks —
   backticks, asterisks, underscores, a link's URL — so the nth character you
   can see is not the nth character in the source. This builds the whole
   correspondence rather than counting up to the one it wants: one entry per
   character that survives rendering, holding where that character sits in the
   source, and a last entry for the end. Written out in full because the
   counting version got the ends of a marked run wrong in both directions —
   a click on the b of **bold** landed on an asterisk, and so did a click on
   the space after it.

   It knows exactly the marks mdInline knows and no others; anything else
   counts as itself, which is the right answer for plain text. */
function rawOffsetForVisible(src, want){
  const map = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m, lead = 0, shown = null;
    // A link shows its label and hides its URL. The rest are symmetric marks
    // of one or two characters each side.
    if ((m = /^\[([^\]]+)\]\([^)]+\)/.exec(rest))) { lead = 1; shown = m[1]; }
    else if ((m = /^`([^`]+)`/.exec(rest))) { lead = 1; shown = m[1]; }
    else if ((m = /^\*\*([^*]+)\*\*/.exec(rest))) { lead = 2; shown = m[1]; }
    // _em_ only counts at a word boundary, the same condition mdInline uses.
    else if ((i === 0 || /[\s(]/.test(src[i - 1])) && (m = /^_([^_]+)_/.exec(rest))) { lead = 1; shown = m[1]; }
    if (shown === null) { map.push(i); i++; continue; }
    for (let k = 0; k < shown.length; k++) map.push(i + lead + k);
    i += m[0].length;
  }
  map.push(src.length);
  return map[Math.max(0, Math.min(want, map.length - 1))];
}

/* How far into `root`'s text the point (x, y) falls. Firefox and the rest
   spell the same thing two different ways, and either can miss entirely — a
   click on the padding rather than on a glyph — in which case the end of the
   text is the honest answer. */
function textOffsetAtPoint(root, x, y){
  let node = null, off = 0;
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (p) { node = p.offsetNode; off = p.offset; }
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) { node = r.startContainer; off = r.startOffset; }
  }
  if (!node || node.nodeType !== 3 || !root.contains(node)) return root.textContent.length;
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n = 0, t;
  while ((t = walk.nextNode())) {
    if (t === node) return n + off;
    n += t.nodeValue.length;
  }
  return n;
}

/* Where in `value` a click on the rendered note should put the caret. The
   block carries the lines it came from in data-src; within the block, a
   heading's hashes and a bullet's dash are rendered away like any other mark,
   so they are skipped before the count starts. A paragraph joins its lines
   with a space where the source has a newline — one character either way, so
   the count still lines up across a wrapped paragraph. */
function noteCaret(view, value, e){
  const blk = e.target.closest('[data-src]');
  if (!blk) return value.length;
  const [a, b] = blk.dataset.src.split(',').map(Number);
  const lines = value.split('\n');
  let start = 0;
  for (let i = 0; i < a && i < lines.length; i++) start += lines[i].length + 1;
  const block = lines.slice(a, b + 1).join('\n');
  const pre = /^\s*(?:#{1,4}\s+|[-*]\s+)/.exec(block);
  const prefix = pre ? pre[0].length : 0;
  const vis = textOffsetAtPoint(blk, e.clientX, e.clientY);
  return start + prefix + rawOffsetForVisible(block.slice(prefix), vis);
}

/* ---- Date picker ----
   A month grid rather than <input type="date">, which hides its calendar behind
   a small icon and draws a different control in every browser. It opens in the
   flow under the field instead of floating over it: the panel scrolls, and a
   floating calendar gets cut off at the bottom edge. */
const CAL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const CAL_MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
function ymd(d){
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
}
function dueLabel(s){
  const d = parseDue(s);
  if (!d) return 'No date';
  return d.toLocaleDateString(undefined, { weekday:'short', day:'numeric', month:'short', year:'numeric' });
}
function calendarHTML(month, selected){
  const y = month.getFullYear(), m = month.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;      // weeks start on Monday
  const days = new Date(y, m + 1, 0).getDate();
  const now = ymd(today());
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<span class="cd pad"></span>';
  for (let d = 1; d <= days; d++){
    const key = ymd(new Date(y, m, d));
    cells += '<button type="button" class="cd' + (key === selected ? ' sel' : '') +
      (key === now ? ' now' : '') + '" data-day="' + key + '">' + d + '</button>';
  }
  return '<div class="calhead">' +
      '<button type="button" class="calnav" data-cal="-1" title="Previous month">‹</button>' +
      '<strong>' + CAL_MONTHS[m] + ' ' + y + '</strong>' +
      '<button type="button" class="calnav" data-cal="1" title="Next month">›</button>' +
    '</div>' +
    '<div class="calgrid">' +
      CAL_DAYS.map(w => '<span class="cw" title="' + w + '">' + w[0] + '</span>').join('') +
      cells +
    '</div>' +
    '<div class="calfoot">' +
      '<button type="button" class="calsm" data-day="' + now + '">Today</button>' +
      '<button type="button" class="calsm" data-day="">Clear</button>' +
    '</div>';
}
/* ai:, impact:, effort: and the task's column all pick from a short, known
   set of values, so all four are drawn with the same fixed-stop slider. Each
   caller supplies its own ordered list of {value, label, color} stops —
   color is optional, and only meaningful on the stop actually selected, so a
   trailing stop with no color just keeps whatever the previous one set.

   impact: and effort: keep a blank stop at position 0 rather than folding it
   into the lowest real value, because unscored is a real, load-bearing state
   here — the matrix and the "needs scoring" count both key off it — where
   ai:'s blank and ai:none were never told apart anywhere else, which is why
   that slider only got three stops instead of four. */
const AI_STOPS = [
  { value: 'none', label: 'None', color: 'var(--ink-faint)' },
  { value: 'partial', label: 'Partial', color: 'var(--amber)' },
  { value: 'full', label: 'Full', color: 'var(--green)' },
];
const IMPACT_STOPS = [
  { value: '', label: '—', color: 'var(--ink-faint)' },
  { value: 'low', label: 'Low', color: 'var(--ink-faint)' },
  { value: 'med', label: 'Med', color: 'var(--amber)' },
  { value: 'high', label: 'High', color: 'var(--green)' },
];
const EFFORT_STOPS = [
  { value: '', label: '—', color: 'var(--ink-faint)' },
  { value: 'S', label: 'S', color: 'var(--ink-faint)' },
  { value: 'M', label: 'M', color: 'var(--amber)' },
  { value: 'L', label: 'L', color: 'var(--green)' },
];

/* Where a stop sits along the track: evenly spaced, except the first and
   last are pulled in by --step-inset so the handle parked there doesn't
   cover the tip (see the CSS comment above .stepslider). Ticks and stop
   labels use the plain, un-inset fraction instead — they are reference
   marks, not something a handle has to clear. */
function stepPos(idx, n){
  if (n < 2) return '50%';
  if (idx === 0) return 'var(--step-inset)';
  if (idx === n - 1) return 'calc(100% - var(--step-inset))';
  return (idx / (n - 1) * 100) + '%';
}
function stepTickPos(idx, n){ return n < 2 ? '50%' : (idx / (n - 1) * 100) + '%'; }
function stepFillWidth(idx, n){ return idx === 0 ? '0%' : 'calc(' + stepPos(idx, n) + ' + var(--step-cap))'; }

function stepSliderHTML(id, stops, value, ro, ariaLabel){
  const n = stops.length;
  let idx = stops.findIndex(s => s.value === value);
  if (idx < 0) idx = 0;
  const color = stops[idx].color ? ';--step-color:' + stops[idx].color : '';
  return '<div class="stepslider' + (ro ? ' disabled' : '') + '" id="' + id + '" data-idx="' + idx + '"' +
      (ro ? '' : ' tabindex="0"') +
      ' role="slider" aria-label="' + esc(ariaLabel) + '" aria-valuemin="0" aria-valuemax="' + (n - 1) + '"' +
      ' aria-valuenow="' + idx + '" aria-valuetext="' + esc(stops[idx].label) + '">' +
    '<div class="steptrack">' +
      '<div class="stepfill" style="width:' + stepFillWidth(idx, n) + color + '"></div>' +
      stops.map((s, i) => '<span class="steptick" style="left:' + stepTickPos(i, n) + '"></span>').join('') +
      '<div class="stephandle" style="left:' + stepPos(idx, n) + color + '"></div>' +
    '</div>' +
    /* Capped to its own fair share of the width (100/n%) rather than left to
       size itself: an even split is the one guarantee that holds regardless
       of stop count or label length, so a wide one wraps onto a second line
       under .stepstop's line-height instead of running into its neighbour —
       which a name like "Waiting review" otherwise does at 5 stops. */
    '<div class="stepstops">' +
      stops.map((s, i) => '<span class="stepstop' + (i === idx ? ' on' : '') + '" data-i="' + i +
        '" style="left:' + stepTickPos(i, n) + ';max-width:' + (100 / n).toFixed(3) + '%">' + esc(s.label) + '</span>').join('') +
    '</div>' +
  '</div>';
}
/* Drag the handle, click a stop label, or arrow-key it once focused — three
   ways into the same fixed set of positions. posToIdx() always rounds to the
   nearest stop, so a drag can only ever land on one of them, never between.
   onCommit(value) is the only thing that varies by field — everything above
   it is just moving the handle and painting the result. */
function wireStepSlider(id, stops, onCommit){
  const el = $('#' + id);
  if (!el || el.classList.contains('disabled')) return;
  const track = el.querySelector('.steptrack');
  const n = stops.length;

  const paint = idx => {
    const s = stops[idx];
    el.dataset.idx = idx;
    el.setAttribute('aria-valuenow', idx);
    el.setAttribute('aria-valuetext', s.label);
    const fill = el.querySelector('.stepfill'), handle = el.querySelector('.stephandle');
    fill.style.width = stepFillWidth(idx, n);
    handle.style.left = stepPos(idx, n);
    if (s.color) { fill.style.setProperty('--step-color', s.color); handle.style.setProperty('--step-color', s.color); }
    el.querySelectorAll('.stepstop').forEach((stop, i) => stop.classList.toggle('on', i === idx));
  };
  const posToIdx = clientX => {
    const r = track.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(frac * (n - 1));
  };

  el.querySelectorAll('.stepstop').forEach(stop => {
    stop.onclick = () => { const i = +stop.dataset.i; paint(i); onCommit(stops[i].value); };
  });
  el.onkeydown = e => {
    const cur = +el.dataset.idx;
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(cur + 1, n - 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(cur - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = n - 1;
    if (next === null) return;
    e.preventDefault();
    paint(next); onCommit(stops[next].value);
  };
  let dragging = false;
  track.onpointerdown = e => {
    dragging = true;
    el.classList.add('dragging');
    el.focus();
    track.setPointerCapture(e.pointerId);
    paint(posToIdx(e.clientX));
  };
  track.onpointermove = e => { if (dragging) paint(posToIdx(e.clientX)); };
  const finish = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    onCommit(stops[+el.dataset.idx].value);
  };
  track.onpointerup = finish;
  track.onpointercancel = finish;
}
/* One picker per date field, so `field` says which one is being edited. Both
   dates use the same calendar; only the value they write differs. */
const calMonth = {};
function wireDatePicker(t, touch, field){
  const btn = $('#f-' + field), cal = $('#f-cal-' + field);
  if (!btn || !cal) return;
  const draw = () => { cal.innerHTML = calendarHTML(calMonth[field], parseDue(t[field]) ? t[field] : ''); };
  btn.onclick = () => {
    const closed = cal.classList.toggle('hidden');
    if (closed) return;
    const from = parseDue(t[field]) || today();
    calMonth[field] = new Date(from.getFullYear(), from.getMonth(), 1);
    draw();
    cal.scrollIntoView({ block:'nearest' });
  };
  cal.onclick = e => {
    const nav = e.target.closest('[data-cal]');
    if (nav) {
      const m = calMonth[field];
      calMonth[field] = new Date(m.getFullYear(), m.getMonth() + (+nav.dataset.cal), 1);
      draw();
      return;
    }
    const day = e.target.closest('[data-day]');
    if (!day) return;
    t[field] = day.dataset.day;
    cal.classList.add('hidden');
    btn.textContent = dueLabel(t[field]);
    btn.classList.toggle('empty', !t[field]);
    touch();
    // The two dates constrain each other, so a change can make the other one
    // wrong. Re-open so the warning appears or clears straight away.
    openDrawer(state.openTask);
  };
}

/* ---- Dependencies, both directions, in the panel ----
   Backward is a plain read of `blocked-by:` — this line waits on that slug.
   Forward has no tag of its own: it is every other item in the file whose
   `blocked-by:` names this one, the same scan `unblockCount` already does
   for the headline bar, just kept as a list instead of collapsed to a
   number. A task or sub-step with neither a slug nor a `blocked-by:` has
   nothing to say either way, so it is left out rather than shown empty. */
function taskDependencies(t){
  const items = allItems();
  const parts = splitBody(t);
  const out = [];
  const addFor = (slug, blockedBy, where) => {
    const waitingOn = (blockedBy || []).map(s => ({ slug: s, item: itemBySlug(items, s) }));
    const blocks = slug ? items.filter(i => !i.done && i.blockedBy.indexOf(slug) > -1) : [];
    if (waitingOn.length || blocks.length) out.push({ where, waitingOn, blocks });
  };
  addFor(t.slug, t.blockedBy, '');
  parts.steps.forEach(s => addFor(s.slug, s.blockedBy, s.clean));
  return out;
}
/* Stripped down from the full ref card: no bucket, no tier, no impact/effort/ai
   chips — just the name and whichever dates actually bear on when it's due,
   the two facts that matter while reading a chain of blockers rather than one
   task on its own. Same chaincard shape the Matrix dependency view already
   uses, so a mini task-card reads the same wherever it turns up. */
function depLink(item, missingSlug){
  if (!item) return '<li class="depitem"><div class="chaincard dep missing" title="No task carries this slug">' +
    '<span class="chaintitle">#' + esc(missingSlug) + ' missing</span></div></li>';
  const due = dueInfo(item.due, item.tier === WAIT_COL);
  const si = startInfo(item.start);
  const dates = (due || si) ? '<div class="depdates">' +
      (due ? '<span class="tag due ' + due.cls + '">' + esc(due.label) + (due.note ? ' · ' + esc(due.note) : '') + '</span>' : '') +
      (si  ? '<span class="tag startdate">' + esc(si.label) + '</span>' : '') +
    '</div>' : '';
  return '<li class="depitem">' +
    '<button type="button" class="chaincard dep deplink' + (item.done ? ' done' : '') + '"' +
      ' style="--bc:' + item.color + '" data-open="' + item.id + '" title="Open this task">' +
      '<span class="chaintitle">' + (item.done ? '✓ ' : '') + mdInline(item.title) + '</span>' +
      dates +
    '</button></li>';
}
function depGroupHTML(g){
  const waiting = g.waitingOn.length
    ? '<div class="depcol"><span class="deplabel">Waiting on</span><ul class="deplist">' +
      g.waitingOn.map(w => depLink(w.item, w.slug)).join('') + '</ul></div>'
    : '';
  const blocks = g.blocks.length
    ? '<div class="depcol"><span class="deplabel">Blocks</span><ul class="deplist">' +
      g.blocks.map(i => depLink(i)).join('') + '</ul></div>'
    : '';
  return '<div class="depgroup">' +
    (g.where ? '<em class="suggwhere">for: ' + esc(g.where) + '</em>' : '') +
    '<div class="depcols">' + waiting + blocks + '</div>' +
  '</div>';
}
/* ---- One shape for every section in the drawer's second column ----
   Chats, Project, Dependencies, the agenda, the two suggestion lists and Jira
   all arrived separately and each drew its own heading — the chat list came
   with the shared package's `aic-field`, faint and a size down, the Jira list
   was a plain div that could not be put away at all, and the rest were
   `field sugg`. Three headings for one kind of thing. This is that kind of
   thing: a rule above it, a summary that collapses and remembers, and a count
   when there is more than one. What differs between them is what goes inside,
   which is the part that should differ. */
/* Every section in this column stays in the panel whether or not it has
   anything in it, so the column reads as the same list of things on every
   task and the shape of the panel doesn't move as tasks change. A section
   with nothing in it says what would put something there — most of these are
   written as a note in Description rather than edited here, and the empty
   state is the only place that syntax is written down. */
function emptyState(text){
  // Most of these name the exact syntax that would fill the section in, and a
  // run of it in the middle of a sentence wants to look like one — `like this`
  // becomes a code span, after escaping, so the text itself is still plain.
  return '<p class="empty">' +
    esc(text).replace(/`([^`]+)`/g, (m, code) => '<code>' + code + '</code>') +
    '</p>';
}
function sideSection(label, key, body, count){
  const k = 'sugg:' + key;
  return '<hr class="dsep">' +
    '<details class="field sugg" data-collapse="' + esc(k) + '"' +
    (sectionCollapsed(k) ? '' : ' open') + '>' +
    '<summary>' + esc(label) +
    (count > 1 ? ' <em class="sublabel">' + count + '</em>' : '') + '</summary>' +
    body +
    '</details>';
}

/* The folder this task's work lives in, as a way into it rather than as a
   field of the task: the note that names it stays where it was written, in
   Description, and this is the same line shown properly. It sat ninth in the
   left-hand column, under eight things it has nothing to do with and below the
   fold on a real task; it belongs beside the conversations and the
   dependencies, which are the other things about the task rather than of it.

   The card is filled in by loadTaskProject() once the panel is up — what the
   project is and when it was last touched are read off disk, and neither is
   worth holding the drawer open for. */
function projectSection(t){
  const proj = taskProject(t);
  if (!proj) return sideSection('Project', 'project',
    emptyState('No folder yet. Name one in Description as `data/projects/<folder>`.'));
  return sideSection('Project', 'project',
    '<div class="pcard" id="taskProjCard">' +
      '<button type="button" class="pcbody" data-project="' + esc(proj) + '">' +
        '<span class="pctitle">' + esc(proj) + '</span>' +
        '<code class="pcpath">data/projects/' + esc(proj) + '/</code>' +
        '<span class="pcblurb" id="taskProjBlurb"></span>' +
        '<span class="pcmeta" id="taskProjWhen"></span>' +
      '</button>' +
    '</div>');
}

/* The two lines under the folder name, out of the same read the project drawer
   does. Quiet about failure on purpose: this is a caption on a button that
   already works, so a helper too old to answer leaves the name and nothing
   else rather than an error where a sentence goes. */
async function loadTaskProject(name, taskId){
  let meta;
  try {
    const res = await fetch('/project.json?name=' + encodeURIComponent(name) + '&t=' + Date.now(),
                            { cache:'no-store' });
    if (!res.ok) return;
    meta = await res.json();
  } catch (err) { return; }
  // The panel may have moved to another task, or to a project, while this was
  // in flight — every openDrawer() on a task with a project starts one.
  if (state.openTask !== taskId) return;
  const blurb = $('#taskProjBlurb');
  const when = $('#taskProjWhen');
  if (blurb && meta.blurb) blurb.innerHTML = mdInline(meta.blurb);
  if (when) {
    const bits = [];
    if (meta.file_count) bits.push(meta.file_count + ' file' + (meta.file_count === 1 ? '' : 's'));
    const edited = cvWhen(meta.modified);
    if (edited) bits.push('edited ' + edited);
    when.textContent = bits.join(' · ');
  }
}

function dependenciesSection(t){
  const groups = taskDependencies(t);
  const body = groups.length
    ? groups.map(depGroupHTML).join('')
    : emptyState('Nothing waiting on this, and nothing holding it up. '
               + 'Written as `blocked-by:slug` on whichever task is waiting.');
  return sideSection('Dependencies', 'deps', body);
}

/* ---- Every tag actually on the task, in one list ----
   parseTaskLine() (core/todo.js) reads a dozen known tags into their own
   fields and keeps anything it doesn't recognise verbatim in t.extra — which
   nothing anywhere else in kanban/js ever reads. This is the one place a
   task's whole tag set is visible at a glance, extra included, and it doubles
   as the editor: a click edits the same field a slider or checkbox elsewhere
   already owns, so there is one stored value per tag, never two copies that
   could fall out of step.

   Left out on purpose, because each already has a real editor of its own
   elsewhere on this same panel that does more than a plain text box could —
   impact, effort, due, start, ai and to all have their own slider, picker or
   input above; headline has its own button; urgent has its own checkbox;
   #slug has its own syntax; blocked-by has the Dependencies section above.
   Showing any of those here too would just be a second, worse way to edit
   the same value. What's left — rank, tlrank, chat, repeat — is exactly the
   set with no editor anywhere else on the card. */
const KNOWN_TAG_FIELDS = [
  { field: 'rank',    label: 'rank' },
  { field: 'tlrank',  label: 'tlrank' },
  { field: 'chat',    label: 'chat' },
  { field: 'repeat',  label: 'repeat' }
];
function taskTagChips(t){
  const chips = [];
  KNOWN_TAG_FIELDS.forEach(f => {
    const v = t[f.field];
    if (v == null || v === '') return;
    chips.push({ label: f.label, value: String(v), editable: true, field: f.field });
  });
  // week has no checkbox of its own anywhere in the app yet, unlike urgent —
  // shown here, read-only, for the same reason #slug and blocked-by are:
  // there is nowhere else on the card that says it is set at all.
  if (t.week) chips.push({ label: 'week', value: '', editable: false });
  if (t.slug) chips.push({ label: '#' + t.slug, value: '', editable: false });
  if (t.blockedBy && t.blockedBy.length) chips.push({ label: 'blocked-by', value: t.blockedBy.join(', '), editable: false });
  (t.extra || []).forEach((raw, i) => {
    ANY_TAG_RE.lastIndex = 0;
    const m = ANY_TAG_RE.exec(raw);
    if (m) {
      const key = m[1] != null ? m[1] : m[3];
      const value = (m[1] != null ? m[2] : m[4]).trim();
      chips.push({ label: key, value, editable: true, extraIndex: i, unrecognised: true, form: m[1] != null ? 'bracket' : 'code' });
    } else {
      chips.push({ label: raw, value: '', editable: false, unrecognised: true });
    }
  });
  return chips;
}
function tagsSection(t){
  const chips = taskTagChips(t);
  if (!chips.length) return sideSection('Tags', 'tags',
    emptyState('No tags beyond the fields above. Anything written as '
             + '`[key:: value]` in the task line shows up here.'));
  const ro = state.locked;
  const body = chips.map((c, i) => {
    const cls = 'tagchip' + (c.unrecognised ? ' tagchip-extra' : '') + (!c.editable || ro ? ' tagchip-ro' : '');
    const text = c.value ? esc(c.label) + ': ' + esc(c.value) : esc(c.label);
    return '<button type="button" class="' + cls + '" data-chip="' + i + '"' +
      (c.editable && !ro ? '' : ' disabled') + '>' + text + '</button>';
  }).join('');
  const hasExtra = chips.some(c => c.unrecognised && c.editable);
  return sideSection('Tags', 'tags', '<div class="tagchips">' + body + '</div>' +
    (hasExtra ? '<span class="help">Amber ones are tags nothing else on the board reads — click to edit or clear.</span>' : ''),
    chips.length);
}
/* Swaps one chip for a text input, commits on Enter or blur, cancels on
   Escape. Rebuilding the whole drawer on every keystroke would lose focus, so
   this edits the DOM directly and only calls back into the task/refresh once,
   on commit. */
function wireTagChips(t){
  const wrap = $('#drawer').querySelector('.tagchips');
  if (!wrap) return;
  const chips = taskTagChips(t);
  wrap.querySelectorAll('.tagchip').forEach(btn => {
    if (btn.disabled) return;
    const c = chips[+btn.dataset.chip];
    btn.onclick = () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = c.value;
      input.setAttribute('aria-label', c.label);
      const label = document.createTextNode(c.label + ': ');
      btn.textContent = '';
      btn.appendChild(label);
      btn.appendChild(input);
      input.focus();
      input.select();
      const commit = () => {
        const v = input.value.trim();
        if (c.field) {
          if (c.field === 'rank' || c.field === 'tlrank') t[c.field] = v ? parseInt(v, 10) : null;
          else t[c.field] = v;
        } else if (c.extraIndex != null) {
          if (!v) t.extra.splice(c.extraIndex, 1);
          else if (c.form === 'bracket') t.extra[c.extraIndex] = '[' + c.label + ':: ' + v + ']';
          else t.extra[c.extraIndex] = '`' + c.label + ':' + v + '`';
        }
        t.dirty = true;
        markDirty(); refreshView(); openDrawer(t.id);
      };
      input.onblur = commit;
      input.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        else if (e.key === 'Escape') { e.preventDefault(); input.onblur = null; openDrawer(t.id); }
      };
    };
  });
}

/* ---- Messages and prompts written for this task ----
   Both live in the markdown as a note under the thing they serve, which means
   they arrive as one line buried in Notes. Pulled out here so the two things
   that are actually ready to send get their own place at the bottom of the
   panel, with a Copy button. The text itself is still edited in Notes — this is
   the same line, shown properly. */
function suggestions(t){
  const parts = splitBody(t);
  const out = { message: [], prompt: [], jira: [], agenda: [] };
  const take = (lines, where) => lines.forEach(l => {
    if (MSG_NOTE.test(l))         out.message.push({ text: quoted(l), draft: /\(draft\)/i.test(l), where, raw: l });
    else if (PROMPT_NOTE.test(l)) out.prompt.push({ text: quoted(l), draft: false, where, raw: l });
  });
  take(parts.notes, '');
  parts.steps.forEach(s => take(s.notes, s.clean));
  out.jira = jiraNotes(t);
  /* Read as a block rather than line by line, like a Jira description, so it
     goes through readAgenda on each run of notes instead of through take(). */
  const own = readAgenda(parts.notes);
  if (own) out.agenda.push(Object.assign({ where: '' }, own));
  parts.steps.forEach(s => {
    const ag = readAgenda(s.notes);
    if (ag) out.agenda.push(Object.assign({ where: s.clean }, ag));
  });
  return out;
}
function suggestionSection(label, list, opts){
  opts = opts || {};
  const body = list.length
    ? list.map(s => messageHTML(s.text, {
        where: s.where, draft: s.draft, claude: opts.claude, task: opts.task,
        dismiss: state.locked ? '' : s.raw
      })).join('')
    : emptyState(opts.emptyText || 'Nothing here yet.');
  return sideSection(label, label, body, list.length);
}

/* The agenda for a recurring meeting, in the panel. Its own section rather than
   a third kind of message suggestion, because it is many lines rather than one
   and because the date the topics belong to comes from the task rather than from
   the note, which a message suggestion has no equivalent of.

   Open by default, unlike the other two: on a meeting task this is the whole of
   what the panel is for.

   `prev` is last cycle's agenda, kept by the roll. Shown under this one and
   without a Copy, because its only job is to be read while the next is written. */
function agendaSection(list, when, prev){
  if (!list.length && !prev) return sideSection('Meeting agenda', 'agenda',
    emptyState('None yet. Written as `- Agenda:` in Notes, with the topics '
             + 'as bullets indented under it.'));
  return sideSection('Meeting agenda', 'agenda',
    list.map(ag => agendaHTML(ag, when, { where: ag.where })).join('') +
    (prev ? agendaHTML(prev, '', { prev:true }) : '') +
    '<span class="help">Copy takes the date, the word Agenda and both levels of ' +
    'bullets, as bullets. The topics themselves are edited in Description.</span>',
    list.length);
}

/* Tickets waiting to be raised. Its own section rather than a third kind of
   suggestion, because the button is a link out to Jira rather than a copy, and
   because which board it goes to is part of what the row has to say. */
function jiraSection(list){
  if (!list.length) return sideSection('Jira tickets', 'jira',
    emptyState('None yet. Written as `- Jira (BOARD): ...` in Notes.'));
  return sideSection('Jira tickets', 'jira',
    list.map(n => jiraHTML(n, {
      where: n.where, dismiss: state.locked ? '' : n.raw, dismissDesc: n.descRaw
    })).join('') +
    '<span class="help">The link fills in the summary and the description. Nothing is ' +
    'raised until you press Create in Jira.</span>',
    list.length);
}

/* Turns one sub-step's text into an editable field in place. The row's drag
   handle stays put, but the row itself must stop being draggable while an
   input sits inside it, or selecting text tries to drag the row instead.
   Clearing the text and leaving removes the step, so there is no separate
   delete control to add just for this. */
function editSubtext(span, t, lineIdx, id, opts){
  if (state.locked) return;
  const chain = !!(opts && opts.chain);
  const row = span.closest('.sub');
  const m = SUB_RE.exec(t.body[lineIdx]);
  if (!m) return;
  row.draggable = false;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'subedit';
  input.value = m[3];
  span.replaceWith(input);
  input.focus();
  input.select();
  let settled = false;
  const finish = save => {
    if (settled) return;
    settled = true;
    if (save) {
      const val = input.value.trim();
      if (val) setSubText(t, lineIdx, val); else removeSubLine(t, lineIdx);
    }
    refreshView();
    openDrawer(id);
  };
  input.onblur = () => finish(true);
  input.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      /* Typing a run of steps. Enter commits this one and opens the next, so a
         list of five is five lines and four Enters rather than five trips to
         the Add button. Read before finish(), which takes the input away.

         An empty step ends the run instead of adding another blank one, so
         Enter on a blank line is how you stop — the same way it works
         everywhere else that lists are typed. */
      const more = chain && !!input.value.trim();
      finish(true);
      if (more) addStepAndEdit(t, id);
    }
    else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  };
}

/* Adds a step and puts the cursor straight in it. Shared by the Add button and
   by Enter inside a new step, so both arrive in the same state. */
function addStepAndEdit(t, id){
  openStepNote = null;
  addSub(t);
  refreshView();
  openDrawer(id);
  const spans = $('#f-subs').querySelectorAll('.subtext');
  const last = spans[spans.length - 1];
  if (last) editSubtext(last, t, +last.dataset.line, id, { chain: true });
}

/* Which step's note box is open, as `<taskId>:<lineIdx>`, or null. Remembered
   the same way the drawer's own width and the Description field's height are —
   a preference about what is showing, not about one render of it, so it
   survives the redraw a commit triggers. Reset on anything that can shift a
   step's line index (adding, deleting, reordering), since a stale line number
   would open the wrong row's box after one of those. */
let openStepNote = null;

function openDrawer(id, focusTitle){
  const loc = locate(id);
  if (!loc) return;
  state.openTask = id;
  const t = loc.task;
  // A backup preview opens the same panel to look at a task, but nothing in it
  // may change — every field below is disabled and nothing is wired to it.
  const ro = state.locked;
  // Same list as the board, Done included: a ticked-off task is in the Done
  // column there, so the panel says the same thing rather than hiding it in a
  // tick box that has nothing to do with the other columns. Handed to AI left
  // out: nothing can be dragged into it on the board either, only tagged, and
  // this stepper only ever offers real destinations.
  const cols = boardColumns().filter(n => n !== AI_COL);
  const nowIn = t.done ? DONE_COL : loc.tier.name;
  // Neutral rather than a per-column palette — the columns themselves vary by
  // board and carry no fixed meaning beyond "further along", except the last
  // one, which always means done.
  const tierStops = cols.map(n => ({ value: n, label: n, color: n === DONE_COL ? 'var(--green)' : 'var(--accent)' }));
  const subs = subSteps(t);
  const sugg = suggestions(t);
  const proj = taskProject(t);
  const rep = t.repeat ? readRepeat(t.repeat) : null;
  /* The same fallback rollRecurring() itself uses (04-tier-two-the-one-thing.js):
     trust `due` when it's a real, future date — that's the occurrence the roll
     already landed on, and on a `~` tag it may be a hand-corrected date the
     rule alone wouldn't produce — and only fall back to the rule when there's
     nothing usable yet, which is a backup/read-only view, where load() skips
     the roll on purpose. */
  const nextDue = rep && (parseDue(t.due) && parseDue(t.due) >= today() ? parseDue(t.due) : occurrenceFrom(rep, today()));
  const dis = ro ? ' disabled' : '';

  state.openProject = null;
  $('#drawer').classList.remove('projectview');
  $('#drawer').classList.toggle('readonly', ro);
  $('#drawerTitle').textContent = ro ? 'View task (read-only)' : 'Edit task';

  /* The headline is the one thing on the whole list, so the control for it sits
     in the panel's frame rather than in the run of fields — a decision about
     the task, next to the other one, instead of the eighth thing to scroll
     past. The explanation it used to carry underneath moves to the tooltip:
     it is worth reading once, not on every task. */
  const hlBtn = $('#dheadHl');
  hlBtn.classList.remove('hidden');
  hlBtn.classList.toggle('on', !!t.headline);
  hlBtn.textContent = t.headline ? 'The one thing' : 'Make headline';
  hlBtn.title = t.headline
    ? 'Set ' + dueLabel(t.headline) + '. It stays the headline until you solve it. Click to remove it.'
    : 'The task that makes the others easier or unnecessary. Only one at a time.';
  hlBtn.disabled = ro;
  // title as well as text: the line truncates rather than wrapping when the
  // drawer is narrow, and the read-only one is the sentence worth reading.
  const help = $('#dheadHelp');
  help.textContent = ro
    ? 'Read-only — from a backup, nothing here can be changed.'
    : 'Changes save automatically';
  help.title = help.textContent;

  const mainFields =
    '<label class="field"><span>Title</span><input type="text" id="f-title" value="' + esc(t.title) + '"' + dis + '></label>' +
    '<details class="field" data-collapse="notes"' + (sectionCollapsed('notes') ? '' : ' open') + '>' +
      /* The label carries the note about subtasks and the Expand button, the
         way Subtasks' own label already carries Complete all. Under the field
         they were a line of small print between the note and the next thing,
         read once and in the way ever after. */
      '<summary>Description' +
        '<em class="sublabel">Subtasks are in the list below.</em>' +
        '<button type="button" class="btn outline small completeall notegrow" id="f-body-grow"></button>' +
      '</summary>' +
      /* Rendered by default, raw while you are in it. There used to be an
         Edit/Preview pair of tabs here and reading a note meant pressing one
         of them, which is a click to do the thing the panel is open for. Now
         the note reads as a note, and clicking it swaps the whole field for
         the textarea with the caret where you clicked (see noteCaret) —
         blur or Escape puts the rendering back. Not a live side-by-side:
         the drawer is not wide enough for two columns.

         Raw is still the truth. notePrompt and the other scaffolding readers
         parse the same text this renders, and a "Message (draft):" line reads
         as a bullet either way, which is honest rather than wrong. */
      '<div id="f-body-view" class="repdoc noteview"' + (ro ? '' : ' title="Click to edit"') + '></div>' +
      '<textarea id="f-body" spellcheck="false" hidden' + dis + '>' + esc(dedent(bodyParts(t).notes)) + '</textarea>' +
    '</details>' +
    tagsSection(t) +
    /* A custom dropdown rather than a native <select> — an <option> cannot
       carry the coloured dot the bucket filter pills at the top of the board
       already draw (see bucketColor()/BUCKET_COLOR in 02-state.js), and this
       is the one field on the whole card where "which bucket" is exactly the
       thing that colour already stands for everywhere else. Reuses the
       header's own .dropdown/.dropdown-panel/.dropdown-item — same
       toggle-button-plus-popover shape the Data menu already uses — rather
       than inventing a second popover component. */
    '<div class="field"><span>Bucket</span>' +
      '<div class="dropdown bucketfield">' +
        '<button type="button" class="bucketbtn" id="f-bucket-btn"' + dis + '>' +
          '<i class="dot" style="background:' + bucketColor(loc.bucket.name, state.doc.buckets.indexOf(loc.bucket)) + '"></i>' +
          esc(loc.bucket.name) +
        '</button>' +
        (ro ? '' : '<div class="dropdown-panel bucketmenu hidden" id="f-bucket-menu" role="menu" aria-label="Choose a bucket">' +
          state.doc.buckets.map((b, i) => '<button type="button" class="dropdown-item bucketopt' +
            (b === loc.bucket ? ' on' : '') + '" role="menuitem" data-bucket="' + esc(b.name) + '">' +
            '<i class="dot" style="background:' + bucketColor(b.name, i) + '"></i>' + esc(b.name) +
          '</button>').join('') +
        '</div>') +
      '</div>' +
    '</div>' +
    /* Full width rather than sharing a grid2 with Bucket: a column name like
       "Waiting review" needs the room a slider half that wide wouldn't give
       its label, where the old <select> never had to fit the whole word next
       to anything. */
    '<div class="field"><span>Column</span>' + stepSliderHTML('f-tier', tierStops, nowIn, ro, 'Column') + '</div>' +
    '<div class="grid2">' +
      '<div class="field"><span>Impact</span>' + stepSliderHTML('f-impact', IMPACT_STOPS, t.impact, ro, 'Impact') + '</div>' +
      '<div class="field"><span>Effort</span>' + stepSliderHTML('f-effort', EFFORT_STOPS, t.effort, ro, 'Effort') + '</div>' +
    '</div>' +
    '<div class="grid2">' +
      '<div class="field"><span>Who does it (ai:)</span>' + stepSliderHTML('f-ai', AI_STOPS, t.ai, ro, 'How much of this AI can do') + '</div>' +
      /* A person, not Claude. Left blank on anything he is doing himself, which
         is most of the list, so the card shows nothing until it is filled in. */
      '<label class="field"><span>Delegated to</span>' +
        '<input type="text" id="f-to" value="' + esc(t.to || '') + '" placeholder="Nobody"' + dis + '>' +
        '<span class="help">A name. Shows on the card.</span>' +
      '</label>' +
    '</div>' +
    /* Two dates, because one was doing two jobs. "Can start" is when the work
       becomes possible; "Due" is when it has to be finished. Quick wins reads
       the first and ignores the second. */
    '<div class="grid2">' +
      '<div class="field"><span>Can start</span>' +
        '<button type="button" class="dpbtn' + (parseDue(t.start) ? '' : ' empty') + '" id="f-start"' + dis + '>' +
          esc(t.start ? dueLabel(t.start) : 'Any time') + '</button>' +
      '</div>' +
      '<div class="field"><span>Due</span>' +
        '<button type="button" class="dpbtn' + (parseDue(t.due) ? '' : ' empty') + '" id="f-due"' + dis + '>' +
          esc(dueLabel(t.due)) + '</button>' +
      '</div>' +
    '</div>' +
    '<div class="cal hidden" id="f-cal-start"></div>' +
    '<div class="cal hidden" id="f-cal-due"></div>' +
    /* Read-only — the `repeat:` tag is set by the pa skill, never typed into
       the drawer — so this is the same reading the card's own "Recurring" tag
       tooltip already does, just given room to say it in full. Sits right
       under the two dates rather than in the sugg column: it is a fact about
       when the task falls, same as they are, not a note about the task. */
    (rep ? '<div class="field"><span>Repeats</span>' +
      '<span class="dpbtn" style="cursor:default">' +
        esc(rep.label.charAt(0).toUpperCase() + rep.label.slice(1)) + '</span>' +
      '</div>' +
      '<span class="help">Next: ' + esc(dueLabel(ymd(nextDue))) + '</span>' +
      (rep.loose
        ? '<span class="help">Usual shape, not a fixed rule — the date moves around it.</span>'
        : '')
      : '') +
    (parseDue(t.start) && parseDue(t.due) && parseDue(t.start) > parseDue(t.due)
      ? '<p class="datewarn">This cannot start until after it is due. One of the two dates is wrong.</p>'
      : '') +
    (notYet(t.start)
      ? '<p class="datenote">Hidden from Quick wins until ' + esc(dueLabel(t.start)) + '.</p>'
      : '') +
    '<div class="field"><span>Flags</span>' +
      '<label class="toggle"><input type="checkbox" id="f-urgent"' + (t.urgent ? ' checked' : '') + dis + '> urgent</label>' +
    '</div>' +
    '<div class="field"><span class="fieldhead">Subtasks' +
      (subs.length && !ro ? ' <em class="sublabel">drag to reorder, click to edit</em>' : '') +
      (!ro && subs.some(s => !s.done)
        ? '<button type="button" class="btn outline small completeall" id="f-completeall">Complete all</button>'
        : '') +
      '</span>' +
      '<div class="substeps" id="f-subs">' +
      subs.map((s, i) => {
        const sd = dueInfo(s.due);
        const note = ro ? '' : stepNoteText(t, s.line);
        const noteOpen = !ro && openStepNote === (t.id + ':' + s.line);
        return '<div class="sub' + (s.done ? ' checked' : '') + '"' + (ro ? '' : ' draggable="true"') + ' data-i="' + i + '">' +
          '<span class="grip" title="Drag to reorder">⠿</span>' +
          '<input type="checkbox" data-line="' + s.line + '"' + (s.done ? ' checked' : '') + dis + '>' +
          /* Rendered, like the Description above it and like the card titles
             on the board, and edited raw by editSubtext the moment it is
             clicked. A subtask is one line, so this is mdInline rather than
             the block renderer. */
          '<span class="subtext" data-line="' + s.line + '"' + (ro ? '' : ' title="Click to edit"') + '>' + mdInline(s.clean) +
          (sd ? '<em class="mini ' + sd.cls + '">' + esc(sd.label) + '</em>' : '') + '</span>' +
          (ro ? '' : '<button type="button" class="noteicon' + (note ? ' has-note' : '') + '" data-line="' + s.line +
            '" title="' + (note ? 'Edit the note on this step' : 'Add a note to this step') + '">💬</button>') +
          (ro ? '' : '<button type="button" class="subdel" data-line="' + s.line + '" title="Delete this subtask">×</button>') +
          '</div>' +
          (noteOpen
            ? '<div class="noterow" data-line="' + s.line + '">' +
                '<textarea class="notebox" data-line="' + s.line +
                  '" placeholder="What happened, when, and what it’s waiting on">' + esc(note) + '</textarea>' +
              '</div>'
            : '');
      }).join('') +
      '</div>' +
      (ro ? '' : '<button type="button" class="btn dashed small addsub" id="f-addsub" title="Enter keeps adding, blank Enter stops">+ Add subtask</button>') +
    '</div>';

  // Chats, dependencies and the four suggestion-shaped sections below them are
  // all "about the task" rather than "of the task" — kept in a second column
  // when the drawer is wide enough to hold one, same content and order as
  // when it isn't (see .dcols in the stylesheet).
  //
  // Every one of them draws whether or not it has anything in it: the column is
  // the same list of headings on every task, so nothing below it moves as you
  // read from one task to the next, and a section with nothing in it is the one
  // place that says what would put something there. Only chatSection() can
  // still come back empty, and only when the chat engine isn't loaded at all —
  // a heading over two buttons that cannot work is worse than no heading.
  const sideFields =
    projectSection(t) +
    chatSection(t) +
    dependenciesSection(t) +
    agendaSection(sugg.agenda, t.due, readPrevAgenda(bodyParts(t).notes)) +
    suggestionSection('Message suggestions', sugg.message,
      { emptyText: 'None yet. Written as `- Suggested message: ...` in Notes.' }) +
    suggestionSection('Prompt suggestions', sugg.prompt,
      { claude:true, task:t.id, emptyText: 'None yet. Written as `- Prompt: ...` in Notes.' }) +
    jiraSection(sugg.jira);

  $('#dbody').innerHTML = '<div class="dcols">' +
    '<div class="dcol dcol-main">' + mainFields + '</div>' +
    (sideFields ? '<div class="dcol dcol-side">' + sideFields + '</div>' : '') +
  '</div>';

  // The card in the Project section is drawn with the folder name it already
  // had; what the folder holds is a read off disk, and the panel does not wait
  // for it.
  if (proj) loadTaskProject(proj, t.id);

  // Every handler below changes the task, so none of them are wired up in a
  // backup preview — the fields are also disabled above, but this is what
  // actually stops a change from happening rather than just looking stopped.
  if (!ro) {
  const touch = () => { t.dirty = true; markDirty(); refreshView(); };

  $('#f-title').oninput  = e => { t.title = e.target.value; touch(); };
  // Not trimmed here, or a space between a first and last name would vanish as
  // it is typed. serializeTask trims it on the way to the file.
  $('#f-to').oninput     = e => { t.to = e.target.value; touch(); };
  wireStepSlider('f-impact', IMPACT_STOPS, v => { t.impact = v; touch(); });
  wireStepSlider('f-effort', EFFORT_STOPS, v => { t.effort = v; touch(); });
  wireStepSlider('f-ai', AI_STOPS, v => {
    t.ai = v;
    if (t.ai !== 'full') {
      const dropped = stripDelegation(t);
      if (dropped.length) {
        touch();
        openDrawer(id);
        $('#status').textContent = 'removed ' + dropped.length + ' prompt' +
          (dropped.length > 1 ? 's' : '') + ' — no longer ai:full';
        $('#status').classList.add('dirty');
        return;
      }
    }
    touch();
  });
  $('#f-urgent').onchange = e => { t.urgent = e.target.checked; touch(); };
  hlBtn.onclick = () => { if (t.headline) clearHeadline(false); else setHeadline(id); };
  wireDatePicker(t, touch, 'start');
  wireDatePicker(t, touch, 'due');
  wireTagChips(t);

  /* Done is the tick box in the file, not a section, so picking it here ticks
     the task off and picking anything else unticks it — exactly what dragging a
     card in or out of the Done column does. */
  wireStepSlider('f-tier', tierStops, pick => {
    if (pick === DONE_COL) {
      const msg = blockedMessage(allItems(), t.blockedBy);
      if (msg) { showToast(msg, 'blocked'); openDrawer(id); return; }
      setDone(t, true);
      markDirty(); refreshView(); openDrawer(id);
      return;
    }
    setDone(t, false);
    const target = ensureTier(loc.bucket, pick);
    if (target !== loc.tier) {
      loc.tier.tasks.splice(loc.index, 1);
      target.tasks.push(t);
    }
    markDirty(); refreshView(); openDrawer(id);
  });
  // Wiring for the button and its menu lives once, at module scope, near the
  // other document-level delegated handlers at the bottom of this file — see
  // the note there for why (this form is rebuilt on every openDrawer call,
  // and a persistent ancestor would stack a new listener on every rebuild).
  const subsEl = $('#f-subs');
  if (subsEl) {
    subsEl.querySelectorAll('input').forEach(cb => {
      cb.onchange = () => {
        const lineIdx = +cb.dataset.line;
        if (cb.checked) {
          const step = splitBody(t).steps.find(s => s.line === lineIdx);
          const msg = blockedMessage(allItems(), (step ? step.blockedBy : []).concat(t.blockedBy || []));
          if (msg) { showToast(msg, 'blocked'); openDrawer(id); return; }
        }
        toggleSub(t, lineIdx); refreshView(); openDrawer(id);
      };
    });
    subsEl.querySelectorAll('.subtext').forEach(span => {
      span.onclick = e => {
        // A link in a rendered subtask is there to be followed. Opening the
        // editor on top of it would make it the one bit of text you cannot
        // click, so the click goes to the link and the editor stays shut.
        if (e.target.closest('a')) return;
        editSubtext(span, t, +span.dataset.line, id);
      };
    });
    subsEl.querySelectorAll('.subdel').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const lineIdx = +btn.dataset.line;
        const m = SUB_RE.exec(t.body[lineIdx]);
        const label = m ? stripTags(m[3]).replace(/\s+/g, ' ').trim() : 'this step';
        if (!confirm('Delete "' + label + '"? This removes it from todo.md when you save.')) return;
        openStepNote = null;
        removeSubLine(t, lineIdx);
        refreshView(); openDrawer(id);
      };
    });
    subsEl.querySelectorAll('.noteicon').forEach(btn => {
      btn.onclick = e => {
        e.stopPropagation();
        const lineIdx = +btn.dataset.line;
        const key = t.id + ':' + lineIdx;
        const opening = openStepNote !== key;
        openStepNote = opening ? key : null;
        refreshView(); openDrawer(id);
        if (opening) {
          const box = $('#f-subs').querySelector('.notebox[data-line="' + lineIdx + '"]');
          if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
        }
      };
    });
    subsEl.querySelectorAll('.notebox').forEach(box => {
      const lineIdx = +box.dataset.line;
      const saved = box.value;
      const commit = () => {
        if (box.value === saved) return;
        setStepNoteText(t, lineIdx, box.value);
        markDirty(); refreshView();
      };
      box.onblur = commit;
      box.onkeydown = e => {
        // Escape leaves the box rather than the drawer, same as Description —
        // there is no draft here to throw away, the text is the step's.
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); box.blur(); }
      };
    });
    const rows = subsEl.querySelectorAll('.sub');
    const clear = () => rows.forEach(r => r.classList.remove('over-top','over-bottom','dragging'));
    rows.forEach(row => {
      row.ondragstart = e => {
        subDrag = +row.dataset.i;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'substep');
        row.classList.add('dragging');
      };
      row.ondragend = () => { subDrag = null; clear(); };
      row.ondragover = e => {
        if (subDrag === null) return;
        e.preventDefault();
        const r = row.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        row.classList.toggle('over-bottom', after);
        row.classList.toggle('over-top', !after);
      };
      row.ondragleave = () => row.classList.remove('over-top','over-bottom');
      row.ondrop = e => {
        if (subDrag === null) return;
        e.preventDefault(); e.stopPropagation();
        const r = row.getBoundingClientRect();
        const to = +row.dataset.i + (e.clientY > r.top + r.height / 2 ? 1 : 0);
        const from = subDrag;
        subDrag = null; clear();
        openStepNote = null;
        moveSub(t, from, to);
        refreshView(); openDrawer(id);
      };
    });
  }
  /* Ticks every open subtask in one click — the same blocked check each box
     makes on its own, applied per subtask rather than to the button as a
     whole, since some waiting on a blocker while the rest are free to close
     is the ordinary case, not a reason to refuse the lot. Several toggleSub()
     calls in one synchronous run land in the same undo step (see noteUndo),
     so this undoes as the one action it looks like. */
  const allBtn = $('#f-completeall');
  if (allBtn) {
    allBtn.onclick = () => {
      const items = allItems();
      let done = 0, waiting = 0;
      splitBody(t).steps.forEach(s => {
        if (s.done) return;
        if (blockedMessage(items, (s.blockedBy || []).concat(t.blockedBy || []))) { waiting++; return; }
        toggleSub(t, s.line);
        done++;
      });
      if (done) { refreshView(); openDrawer(id); }
      $('#status').textContent = !done
        ? 'Every open subtask is still waiting on something — finish that first'
        : waiting
          ? 'Completed ' + done + ', ' + waiting + ' still waiting on something'
          : 'Completed ' + done + ' subtask' + (done === 1 ? '' : 's');
      if (done) $('#status').classList.add('dirty');
    };
  }
  /* Adds the step, then drops straight into editing its (empty) text — an
     "Add" click that still left a blank, unlabelled row would just be a second
     click waiting to happen. */
  $('#f-addsub').onclick = () => addStepAndEdit(t, id);
  }

  /* ---- Description: rendered, click to edit ----
     Drawn before the wiring below so a backup preview gets the rendering too —
     reading is not editing, and a note is easier to read rendered whether or
     not this panel is allowed to change anything. */
  const bodyTa = $('#f-body'), bodyView = $('#f-body-view'), bodyGrow = $('#f-body-grow');
  let bodySaved = bodyTa.value;
  const renderBody = () => {
    bodyView.innerHTML = mdBlocks(bodyTa.value, { srcmap:true, keepH1:true }) ||
      '<p class="empty">' + (ro ? 'Nothing written.' : 'Nothing written yet. Click to add a note.') + '</p>';
  };
  renderBody();

  /* One height on both halves, so the panel below the field does not move
     when the field changes state. Expand is the only button, and it reads
     Collapse whenever the field is standing taller than its floor — which is
     true after a drag as much as after a press, so the two ways of resizing
     it cannot disagree about what the button now does. */
  let bodyH = noteHeight();
  const showBodyHeight = h => {
    bodyH = Math.max(NOTE_H_MIN, Math.round(h));
    bodyView.style.height = bodyH + 'px';
    bodyTa.style.height = bodyH + 'px';
    bodyGrow.textContent = bodyH > NOTE_H_MIN ? 'Collapse' : 'Expand';
    bodyGrow.title = bodyH > NOTE_H_MIN
      ? 'Put the note back to its short height'
      : 'Show the whole note, as much of it as fits';
  };
  showBodyHeight(bodyH);

  bodyGrow.onclick = e => {
    // Inside a <summary>, so a plain click would put the section away as well.
    e.preventDefault(); e.stopPropagation();
    if (bodyH > NOTE_H_MIN) showBodyHeight(NOTE_H_MIN);
    else {
      // As much of the note as fits, rather than a fixed second stop: a two
      // line note has nothing to gain from a field 400px tall.
      const want = (bodyTa.hidden ? bodyView : bodyTa).scrollHeight + 4;
      showBodyHeight(Math.max(260, Math.min(want, Math.round(window.innerHeight * 0.6))));
    }
    setNoteHeight(bodyH);
  };

  /* Dragging the field's own corner is a browser control with no event of its
     own, and a ResizeObserver is the only way to hear it. A height that is
     not the one just applied came from his drag, so it becomes the height —
     on both halves, and on the next task he opens. The comparison is also
     what stops this from feeding itself: applying the new height fires the
     observer again, and the second pass matches and stops. */
  if (noteResizeObs) noteResizeObs.disconnect();
  if (window.ResizeObserver) {
    noteResizeObs = new ResizeObserver(() => {
      const h = (bodyTa.hidden ? bodyView : bodyTa).offsetHeight;
      if (!h || Math.abs(h - bodyH) < 2) return;
      showBodyHeight(h);
      setNoteHeight(bodyH);
    });
    noteResizeObs.observe(bodyTa);
    noteResizeObs.observe(bodyView);
  }

  if (!ro) {
    /* onchange rather than oninput: rebuildBody rewrites the task's lines and
       refreshView redraws the board behind the drawer, which is not something
       to do on every keystroke. Both ways out of the editor go through here,
       and bodySaved keeps a second call with the same text from marking the
       document dirty for nothing. */
    const commitBody = () => {
      if (bodyTa.value === bodySaved) return;
      bodySaved = bodyTa.value;
      const p = bodyParts(t);
      rebuildBody(t, indent(bodyTa.value), p.subs, p.subsAt);
      markDirty(); refreshView();
    };
    const stopEditing = () => {
      commitBody();
      renderBody();
      bodyTa.hidden = true;
      bodyView.hidden = false;
    };
    bodyView.onclick = e => {
      // A link in a rendered note is there to be followed, the same as one in
      // a subtask — the editor opens on everything except that.
      if (e.target.closest('a')) return;
      const caret = noteCaret(bodyView, bodyTa.value, e);
      bodyView.hidden = true;
      bodyTa.hidden = false;
      bodyTa.focus();
      bodyTa.setSelectionRange(caret, caret);
    };
    bodyTa.onblur = stopEditing;
    bodyTa.onkeydown = e => {
      // Escape leaves the field rather than the drawer, and keeps what was
      // typed — there is no draft here to throw away, the text is the task's.
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); bodyTa.blur(); }
    };
  }

  $('#drawer').classList.add('open');
  $('#scrim').classList.add('open');
  if (focusTitle) { const el = $('#f-title'); el.focus(); el.select(); }
  // Written into the URL now rather than left for the next full render —
  // opening the drawer alone doesn't otherwise touch the hash. See syncHash()
  // in 07-render-board.js.
  syncHash();
}

function closeDrawer(){
  state.openTask = null;
  state.openProject = null;
  $('#drawer').classList.remove('open');
  $('#drawer').classList.remove('projectview');
  $('#scrim').classList.remove('open');
  syncHash();
}

/* ---- The panel, showing a project instead of a task ----
   A project is spread across buckets by design: the presentation is Design
   System work, the deck review is People work, and the list is right to keep
   them apart. That makes "what is left on this" a question the columns cannot
   answer, which is what this is for. It reads, and nothing more — every row is
   a way back into the task that owns it. */
function openProjectDrawer(name){
  const rows = projectTasks(name);
  state.openTask = null;
  state.openProject = name;
  // Drops a `!task=` a click through from the task drawer left behind — see
  // syncHash() in 07-render-board.js — rather than leaving it stale until
  // whatever renders next happens to call syncHash() itself.
  syncHash();

  $('#drawer').classList.add('projectview');
  $('#drawer').classList.toggle('readonly', state.locked);
  $('#drawerTitle').textContent = name;
  $('#dheadHl').classList.add('hidden');

  const open = rows.filter(r => !r.task.done);
  const done = rows.filter(r => r.task.done);
  const count = rows.length === 1 ? '1 task' : rows.length + ' tasks';
  const split = done.length
    ? count + ', ' + done.length + ' finished'
    : count;

  const row = r => {
    const di = dueInfo(r.task.due);
    return '<button type="button" class="projrow' + (r.task.done ? ' done' : '') +
        '" data-open="' + r.task.id + '">' +
      // Rendered, like the same title on a card and in every other list.
      '<span class="pt">' + mdInline(r.task.title) + '</span>' +
      '<span class="pw">' + esc(r.bucket + ' · ' + r.tier) +
        (di ? '<em class="tag due ' + di.cls + '">' + esc(di.label) + '</em>' : '') +
        (r.task.headline ? '<em class="tag">the one thing</em>' : '') +
      '</span>' +
    '</button>';
  };

  $('#dbody').innerHTML =
    // Filled in by loadProjectFiles() below, out of the folder's own
    // CLAUDE.md — what this project is, when it was opened, when it was last
    // touched. Empty until then rather than a placeholder: it is one line of
    // prose, and a spinner where a sentence is going is worse than a beat of
    // nothing.
    '<div class="projabout" id="projAbout"></div>' +
    '<div class="field"><span>Files in this folder</span>' +
      '<a class="projpath" href="' + esc(projectUrl(name)) + '" target="_blank" rel="noopener">' +
        'data/projects/' + esc(name) + '/</a>' +
      '<div class="projfiles" id="projFiles"><span class="help">Reading the folder…</span></div>' +
    '</div>' +
    '<div class="field"><span>Tasks on this project</span>' +
      (rows.length
        ? '<div class="projlist">' + open.map(row).join('') + done.map(row).join('') + '</div>' +
          '<span class="help">' + esc(split) + '. Click one to open it.</span>'
        : '<span class="help">Nothing on the list points at this folder yet. A task joins it by ' +
          'naming the folder in a note: <code>Project: data/projects/' + esc(name) + '</code>.</span>') +
    '</div>';

  $('#dbody').querySelectorAll('.projrow').forEach(el => {
    el.onclick = () => openDrawer(el.dataset.open);
  });

  $('#dheadHelp').textContent = 'A project is a folder, not a task — nothing here can be edited.';
  $('#dheadHelp').title = $('#dheadHelp').textContent;
  $('#drawer').classList.add('open');
  $('#scrim').classList.add('open');
  loadProjectFiles(name);
}

/* Where the folder itself is served. translate_path() (kanban/server.py)
   resolves /data/ against the current dataset, so this is the same path
   whichever list is open, and the browser's own directory listing is what
   answers for a folder. */
function projectUrl(name){
  return '/data/projects/' + encodeURIComponent(name) + '/';
}

function fileSize(n){
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

/* Whether the folder's CLAUDE.md calls the project something other than what
   the folder is called. The folder name is the identity — it is what a task's
   own note points at — so a title that only differs in capitals and hyphens
   is the same name twice and stays off screen. */
function differentTitle(title, name){
  const flat = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return !!title && flat(title) !== flat(name);
}

/* What the project is and when it was last touched, above everything else in
   the panel. Both come off disk with no upkeep: the description is the lead
   paragraph of the folder's own CLAUDE.md, and the date is the newest mtime
   in the folder — see project_about() and project_meta() in kanban/server.py.
   Nothing here is a field he has to remember to write. */
function projectAboutHTML(meta, name){
  const bits = [];
  if (meta.opened) bits.push('Opened ' + meta.opened);
  const edited = cvWhen(meta.modified);
  if (edited) bits.push('Edited ' + edited);
  return (differentTitle(meta.title, name)
            ? '<div class="projname">' + mdInline(meta.title) + '</div>' : '') +
    (meta.blurb
      ? '<p class="projblurb">' + mdInline(meta.blurb) + '</p>'
      : '<p class="projblurb none">Nothing describes this folder yet. A <code>CLAUDE.md</code> ' +
        'in it, opening with a heading and a sentence, is what this line reads.</p>') +
    (bits.length ? '<div class="projwhen">' + esc(bits.join(' · ')) + '</div>' : '');
}

/* What is in the folder, one level down and no further — the server decided
   that, see project_entries() in kanban/server.py. A sub-folder is one row
   carrying its own count rather than its contents, and clicking it hands the
   walk to the browser's directory listing, which is where a walk belongs.

   One fetch fills both halves of the panel: the description at the top and
   the file rows under the path. They come out of the same read of the same
   folder, so asking twice would be two reads for one answer. */
async function loadProjectFiles(name){
  const paint = (html, aboutHtml) => {
    // The drawer may have moved on to another project, or shut, while this
    // was in flight — every openProjectDrawer() call starts one of these.
    if (state.openProject !== name) return;
    const box = $('#projFiles');
    if (box) box.innerHTML = html;
    const top = $('#projAbout');
    if (top) top.innerHTML = aboutHtml || '';
  };
  let meta;
  try {
    const res = await fetch('/project.json?name=' + encodeURIComponent(name) + '&t=' + Date.now(),
                            { cache:'no-store' });
    if (res.status === 404) return paint('<span class="help">That folder is not on disk.</span>');
    if (!res.ok) {
      return paint('<span class="help">The board helper needs restarting — the copy running ' +
                   'does not list project files yet.</span>');
    }
    meta = await res.json();
  } catch (err) {
    return paint('<span class="help">Could not read the folder. ' + esc(String(err.message || err)) +
                 '</span>');
  }
  const about = projectAboutHTML(meta, name);
  const list = meta.entries || [];
  if (!list.length) return paint('<span class="help">The folder is empty.</span>', about);
  const base = projectUrl(name);
  const row = e => {
    const meta = e.dir
      ? (e.children === null ? 'folder'
         : e.children + ' item' + (e.children === 1 ? '' : 's'))
      : fileSize(e.size);
    return '<a class="projfile' + (e.dir ? ' isdir' : '') + '" target="_blank" rel="noopener" ' +
        'href="' + esc(base + encodeURIComponent(e.name) + (e.dir ? '/' : '')) + '">' +
      '<span class="pf">' + esc(e.name + (e.dir ? '/' : '')) + '</span>' +
      '<span class="pfm">' + esc(meta) + '</span>' +
    '</a>';
  };
  paint(list.map(row).join(''), about);
}

/* Which of the drawer's own sections — Description, Chats, Message
   suggestions, Prompt suggestions — are shut, remembered the same way the
   drawer's own width is: a preference about the drawer's shape, not about
   one task, so closing Chats once keeps it closed on every task after.
   Absent means open, so a fresh clone or a section invented after this
   shipped both default to shown. */
/* How tall the Description stands, remembered the same way and for the same
   reason: it is a preference about the drawer's shape, not about one task.
   One number covers both halves of the field — the rendering and the textarea
   are the same box in two states, and a note that changed height the moment
   you clicked into it would drag every field under it out from under the
   pointer.

   The default is short on purpose. Most notes are two lines, and a field
   sized for the long ones pushed Bucket, Column and the dates below the fold
   on every task that wasn't. Expand is there for the long ones, and the
   field's own corner drags to anything in between. */
const NOTE_H_KEY = 'todo-board-note-height';
const NOTE_H_MIN = 120;
function noteHeight(){
  let n;
  try { n = parseInt(localStorage.getItem(NOTE_H_KEY), 10); } catch (e) { return NOTE_H_MIN; }
  return Number.isFinite(n) ? Math.max(NOTE_H_MIN, Math.min(n, 2000)) : NOTE_H_MIN;
}
function setNoteHeight(px){
  try { localStorage.setItem(NOTE_H_KEY, String(Math.round(px))); } catch (e) {}
}
/* The one watching the current field. openDrawer redraws the whole panel on
   every edit, so without disconnecting the last one there would be an
   observer per redraw, all of them still writing the same preference. */
let noteResizeObs = null;

const SECTION_KEY = 'todo-board-collapsed';
function sectionCollapsed(key){
  try { return !!(JSON.parse(localStorage.getItem(SECTION_KEY) || '{}') || {})[key]; }
  catch (e) { return false; }
}
function setSectionCollapsed(key, collapsed){
  let all;
  try { all = JSON.parse(localStorage.getItem(SECTION_KEY) || '{}') || {}; } catch (e) { all = {}; }
  if (collapsed) all[key] = true; else delete all[key];
  try { localStorage.setItem(SECTION_KEY, JSON.stringify(all)); } catch (e) {}
}
/* Overview's own sections — Big rocks, This week, Quick wins, Delegate to
   Claude, Context — default open: an overview is meant to be skimmed in one
   glance, not clicked open section by section. Remembers which ones he has
   shut, per section, the same way the drawer's are. A separate key from the
   drawer's, so a section name the two happen to share cannot cross-wire
   their two different defaults. */
const OVSECTION_KEY = 'todo-board-overview-closed';
function overviewOpen(key){
  try { return !((JSON.parse(localStorage.getItem(OVSECTION_KEY) || '{}') || {})[key]); }
  catch (e) { return true; }
}
function setOverviewOpen(key, open){
  let all;
  try { all = JSON.parse(localStorage.getItem(OVSECTION_KEY) || '{}') || {}; } catch (e) { all = {}; }
  if (!open) all[key] = true; else delete all[key];
  try { localStorage.setItem(OVSECTION_KEY, JSON.stringify(all)); } catch (e) {}
}
/* A suggestion he does not want dismissed without touching the task itself —
   the whole point is that nothing about the task changes, so nothing here
   writes to todo.md. Keyed on the task id plus the sub-step's own line, since
   two sub-steps under one task share the task's id and would otherwise
   dismiss each other. Persisted the same way the collapsed sections are, so
   it survives a reload rather than resetting every time the board opens. */
const QUICK_DISMISS_KEY = 'todo-board-quick-dismissed';
function quickKey(it){ return it.id + (it.sub ? ':' + it.sub.line : ''); }
function quickDismissedSet(){
  try { return new Set(JSON.parse(localStorage.getItem(QUICK_DISMISS_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function setQuickDismissed(set){
  try { localStorage.setItem(QUICK_DISMISS_KEY, JSON.stringify([...set])); } catch (e) {}
}

/* A <details>'s own toggle event does not bubble in every browser, but the
   capture phase still sees it on the way down regardless of that — so one
   listener here, rather than one wired up inside openDrawer on every redraw,
   covers every collapsible section the drawer ever draws. */
document.addEventListener('toggle', e => {
  const ds = e.target.dataset || {};
  if (ds.collapse) setSectionCollapsed(ds.collapse, !e.target.open);
  else if (ds.ovcollapse) setOverviewOpen(ds.ovcollapse, e.target.open);
  else if (ds.tlcollapse) setSectionCollapsed(ds.tlcollapse, !e.target.open);
}, true);

/* Drag the panel's left edge to make it wider; the width is remembered. */
function drawerMax(){
  const w = window.innerWidth || document.documentElement.clientWidth || 1280;
  return Math.max(360, w - 120);
}
/* Apply fits the panel to the window; set records what the user actually wants,
   so a narrow window never quietly overwrites their chosen width. */
function applyDrawerWidth(){
  $('#drawer').style.width = Math.round(Math.min(Math.max(state.drawerWidth, 340), drawerMax())) + 'px';
}
function setDrawerWidth(px){
  state.drawerWidth = Math.round(Math.min(Math.max(px, 340), 1200));
  try { localStorage.setItem('todo-board-drawer', state.drawerWidth); } catch (e) {}
  applyDrawerWidth();
}
applyDrawerWidth();
(() => {
  const grip = $('#dgrip');
  grip.onpointerdown = e => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('active');
    document.body.classList.add('resizing');
    const move = ev => setDrawerWidth(window.innerWidth - ev.clientX);
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.classList.remove('active');
      document.body.classList.remove('resizing');
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once:true });
    grip.addEventListener('pointercancel', up, { once:true });
  };
  grip.ondblclick = () => setDrawerWidth(400);
})();
window.addEventListener('resize', applyDrawerWidth);

$('#closeDrawer').onclick = closeDrawer;
$('#scrim').onclick = closeDrawer;

/* Project chips are drawn inside cards, and a card opens its task on click.
   Capture phase, on the document, so the chip answers first and the card behind
   it never hears about it — one handler covering the board, the lists and the
   panel's own Project button, none of which need to know this exists. */
document.addEventListener('click', e => {
  const chip = e.target.closest('[data-project]');
  if (!chip) return;
  e.preventDefault();
  e.stopPropagation();
  openProjectDrawer(chip.dataset.project);
}, true);

/* The Bucket field's dropdown (see openDrawer, the "Bucket" field), one
   delegated handler rather than binding the button and its options fresh on
   every openDrawer call — #f-bucket-menu is rebuilt each time the drawer
   redraws, so a listener attached directly to it or to any element that
   survives the redraw would stack a copy on every open. Looking the task up
   fresh here, from state.openTask, is what lets that be true safely. */
/* The panel being open and the button's chevron pointing up are one state
   with two elements holding it, so they are always set together — every path
   below closes the menu, and a button left turned up after a click-away would
   be pointing at a panel that is no longer there. */
function setBucketMenu(open) {
  const menu = $('#f-bucket-menu');
  const btn = $('#f-bucket-btn');
  if (menu) menu.classList.toggle('hidden', !open);
  if (btn) btn.classList.toggle('open', open && !!menu);
}
document.addEventListener('click', e => {
  const menu = $('#f-bucket-menu');
  const btn = e.target.closest('#f-bucket-btn');
  if (btn) {
    if (menu) setBucketMenu(menu.classList.contains('hidden'));
    return;
  }
  const opt = e.target.closest('#f-bucket-menu [data-bucket]');
  if (opt) {
    const id = state.openTask;
    const loc = id && locate(id);
    const nb = loc && state.doc.buckets.find(b => b.name === opt.dataset.bucket);
    setBucketMenu(false);
    if (!loc || !nb || nb === loc.bucket) return;
    const target = ensureTier(nb, loc.tier.name);
    loc.tier.tasks.splice(loc.index, 1);
    target.tasks.push(loc.task);
    // The filter stays put rather than following the task to its new bucket
    // — moving a card out of the one you're looking at should look like
    // moving it out, the same as any other edit that drops a task from view.
    markDirty(); refreshView(); openDrawer(id);
    return;
  }
  // Anywhere else closes it — the click-away a native <select> gets for free.
  if (menu && !menu.classList.contains('hidden')) setBucketMenu(false);
});
$('#del').onclick = () => {
  if (state.locked) return;
  const loc = state.openTask && locate(state.openTask);
  if (!loc) return;
  if (!confirm('Delete "' + loc.task.title + '"? This removes it from todo.md when you save.')) return;
  loc.tier.tasks.splice(loc.index, 1);
  closeDrawer(); markDirty(); refreshView();
};
$('#undo').onclick = undo;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDrawer();
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveFile(); }
  // Not while a field has focus — cmd/ctrl+Z there means "undo my last few
  // keystrokes", which the browser already does natively on that one field.
  // Hijacking it for a whole-document undo would be a surprise, not a fix.
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    const tag = (document.activeElement || {}).tagName;
    if (tag !== 'INPUT' && tag !== 'TEXTAREA') { e.preventDefault(); undo(); }
  }
});

