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
function dependenciesSection(t){
  const groups = taskDependencies(t);
  if (!groups.length) return '';
  const key = 'sugg:deps';
  return '<hr class="dsep">' +
    '<details class="field sugg" data-collapse="' + esc(key) + '"' + (sectionCollapsed(key) ? '' : ' open') + '>' +
    '<summary>Dependencies</summary>' +
    groups.map(depGroupHTML).join('') +
    '</details>';
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
  const key = 'sugg:' + label;
  const body = list.length
    ? list.map(s => messageHTML(s.text, {
        where: s.where, draft: s.draft, claude: opts.claude, task: opts.task,
        dismiss: state.locked ? '' : s.raw
      })).join('')
    : '<p class="empty">' + esc(opts.emptyText || 'Nothing here yet.') + '</p>';
  return '<hr class="dsep">' +
    '<details class="field sugg" data-collapse="' + esc(key) + '"' + (sectionCollapsed(key) ? '' : ' open') + '>' +
    '<summary>' + esc(label) +
    (list.length > 1 ? ' <em class="sublabel">' + list.length + '</em>' : '') + '</summary>' +
    body +
    '</details>';
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
  if (!list.length && !prev) return '';
  const key = 'sugg:agenda';
  return '<hr class="dsep">' +
    '<details class="field sugg" data-collapse="' + esc(key) + '"' +
    (sectionCollapsed(key) ? '' : ' open') + '>' +
    '<summary>Meeting agenda' +
    (list.length > 1 ? ' <em class="sublabel">' + list.length + '</em>' : '') + '</summary>' +
    list.map(ag => agendaHTML(ag, when, { where: ag.where })).join('') +
    (prev ? agendaHTML(prev, '', { prev:true }) : '') +
    '<span class="help">Copy takes the date, the word Agenda and both levels of ' +
    'bullets, as bullets. The topics themselves are edited in Description.</span>' +
    '</details>';
}

/* Tickets waiting to be raised. Its own section rather than a third kind of
   suggestion, because the button is a link out to Jira rather than a copy, and
   because which board it goes to is part of what the row has to say. */
function jiraSection(list){
  if (!list.length) return '';
  return '<div class="field sugg"><span>Jira tickets' +
    (list.length > 1 ? ' <em class="sublabel">' + list.length + '</em>' : '') + '</span>' +
    list.map(n => jiraHTML(n, {
      where: n.where, dismiss: state.locked ? '' : n.raw, dismissDesc: n.descRaw
    })).join('') +
    '<span class="help">The link fills in the summary and the description. Nothing is raised until you press Create in Jira.</span>' +
    '</div>';
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
  addSub(t);
  refreshView();
  openDrawer(id);
  const spans = $('#f-subs').querySelectorAll('.subtext');
  const last = spans[spans.length - 1];
  if (last) editSubtext(last, t, +last.dataset.line, id, { chain: true });
}

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
  // tick box that has nothing to do with the other columns.
  const cols = boardColumns();
  const nowIn = t.done ? DONE_COL : loc.tier.name;
  // Neutral rather than a per-column palette — the columns themselves vary by
  // board and carry no fixed meaning beyond "further along", except the last
  // one, which always means done.
  const tierStops = cols.map(n => ({ value: n, label: n, color: n === DONE_COL ? 'var(--green)' : 'var(--accent)' }));
  const subs = subSteps(t);
  const sugg = suggestions(t);
  const proj = taskProject(t);
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
  $('#dfootHelp').textContent = ro
    ? 'Read-only — from a backup, nothing here can be changed.'
    : 'Changes save automatically';

  const mainFields =
    '<label class="field"><span>Title</span><input type="text" id="f-title" value="' + esc(t.title) + '"' + dis + '></label>' +
    '<details class="field" data-collapse="notes"' + (sectionCollapsed('notes') ? '' : ' open') + '>' +
      /* The label carries the note about subtasks and the Expand button, the
         way Subtasks' own label already carries Complete all. Under the field
         they were a line of small print between the note and the next thing,
         read once and in the way ever after. */
      '<summary>Description' +
        '<em class="sublabel">Subtasks are in the list below.</em>' +
        '<button type="button" class="completeall notegrow" id="f-body-grow"></button>' +
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
    '<label class="field"><span>Bucket</span><select id="f-bucket"' + dis + '>' +
      state.doc.buckets.map(b => '<option' + (b === loc.bucket ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') +
    '</select></label>' +
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
    /* Read out of the notes below, and shown here as the thing it is. The note
       itself stays where it was written — this is a way in, not a second copy. */
    (proj
      ? '<div class="field"><span>Project</span>' +
          '<button type="button" class="projbtn" data-project="' + esc(proj) + '">' + esc(proj) + '</button>' +
          '<span class="help">Its background and sources are in <code>data/projects/' + esc(proj) +
          '/</code>. Click to see everything on it.</span>' +
        '</div>'
      : '') +
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
        ? '<button type="button" class="completeall" id="f-completeall">Complete all</button>'
        : '') +
      '</span>' +
      '<div class="substeps" id="f-subs">' +
      subs.map((s, i) => {
        const sd = dueInfo(s.due);
        return '<div class="sub' + (s.done ? ' checked' : '') + '"' + (ro ? '' : ' draggable="true"') + ' data-i="' + i + '">' +
          '<span class="grip" title="Drag to reorder">⠿</span>' +
          '<input type="checkbox" data-line="' + s.line + '"' + (s.done ? ' checked' : '') + dis + '>' +
          /* Rendered, like the Description above it and like the card titles
             on the board, and edited raw by editSubtext the moment it is
             clicked. A subtask is one line, so this is mdInline rather than
             the block renderer. */
          '<span class="subtext" data-line="' + s.line + '"' + (ro ? '' : ' title="Click to edit"') + '>' + mdInline(s.clean) +
          (sd ? '<em class="mini ' + sd.cls + '">' + esc(sd.label) + '</em>' : '') + '</span>' +
          (ro ? '' : '<button type="button" class="subdel" data-line="' + s.line + '" title="Delete this subtask">×</button>') +
          '</div>';
      }).join('') +
      '</div>' +
      (ro ? '' : '<button type="button" class="addsub" id="f-addsub" title="Enter keeps adding, blank Enter stops">+ Add subtask</button>') +
    '</div>';

  // Chats, dependencies and the four suggestion-shaped sections below them are
  // all "about the task" rather than "of the task" — kept in a second column
  // when the drawer is wide enough to hold one, same content and order as
  // when it isn't (see .dcols in the stylesheet).
  const sideFields =
    chatSection(t) +
    dependenciesSection(t) +
    agendaSection(sugg.agenda, t.due, readPrevAgenda(bodyParts(t).notes)) +
    suggestionSection('Message suggestions', sugg.message,
      { emptyText: 'None yet. Written as "- Suggested message: ..." in Notes.' }) +
    suggestionSection('Prompt suggestions', sugg.prompt,
      { claude:true, task:t.id, emptyText: 'None yet. Written as "- Prompt: ..." in Notes.' }) +
    jiraSection(sugg.jira);

  $('#dbody').innerHTML = '<div class="dcols">' +
    '<div class="dcol dcol-main">' + mainFields + '</div>' +
    (sideFields ? '<div class="dcol dcol-side">' + sideFields + '</div>' : '') +
  '</div>';

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
  $('#f-bucket').onchange = e => {
    const nb = state.doc.buckets.find(b => b.name === e.target.value);
    if (!nb) return;
    const target = ensureTier(nb, loc.tier.name);
    loc.tier.tasks.splice(loc.index, 1);
    target.tasks.push(t);
    // The filter stays put rather than following the task to its new bucket —
    // moving a card out of the one you're looking at should look like moving
    // it out, the same as any other edit that drops a task out of view.
    markDirty(); refreshView(); openDrawer(id);
  };
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
        removeSubLine(t, lineIdx);
        refreshView(); openDrawer(id);
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
}

function closeDrawer(){
  state.openTask = null;
  state.openProject = null;
  $('#drawer').classList.remove('open');
  $('#drawer').classList.remove('projectview');
  $('#scrim').classList.remove('open');
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
    '<div class="field"><span>Folder</span>' +
      '<div class="projpath">data/projects/' + esc(name) + '/</div>' +
      '<span class="help">The background is in that folder\'s <code>CLAUDE.md</code>, with the ' +
      'source documents beside it. The board does not read those files — this is where they are.</span>' +
    '</div>' +
    '<div class="field"><span>On this project</span>' +
      (rows.length
        ? '<div class="projlist">' + open.map(row).join('') + done.map(row).join('') + '</div>' +
          '<span class="help">' + esc(split) + '. Click one to open it.</span>'
        : '<span class="help">Nothing on the list points at this folder yet. A task joins it by ' +
          'naming the folder in a note: <code>Project: data/projects/' + esc(name) + '</code>.</span>') +
    '</div>';

  $('#dbody').querySelectorAll('.projrow').forEach(el => {
    el.onclick = () => openDrawer(el.dataset.open);
  });

  $('#dfootHelp').textContent = 'A project is a folder, not a task — nothing here can be edited.';
  $('#drawer').classList.add('open');
  $('#scrim').classList.add('open');
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

