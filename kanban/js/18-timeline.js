'use strict';

/* =========================================================================
   4c. Timeline — top-level tasks as bars across dates, grouped by bucket.

   `start:` and `due:` already exist on every task and sub-step (see "Two
   dates, not one" in the README) — this view is the first thing to draw both
   of them at once rather than reading one and ignoring the other.

   Nothing here invents a date the file doesn't have. A task with both draws
   as a bar; a task with only `due:` — most of the list — draws as a diamond
   on that date rather than a bar backed by a start date nobody set; a task
   with only `start:` draws as a bar out to today, since "started, no
   deadline yet" is still two real dates once today is one of them. A task
   with neither sits in the tray below the lanes rather than being dropped.
   ========================================================================= */
const TL_DAY_PX = 28;
const TL_MIN_DAYS = 56;          // ~8 weeks, so a short list isn't a sliver

function addDays(d, n){ const r = new Date(d); r.setDate(r.getDate() + n); return r; }
/* Standard ISO-8601 week number — the same figure `week_tag` in server.py
   already stamps a weekly backup with, computed here instead because the
   header labels every week in range, not just the current one. */
function isoWeekNumber(d){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;               // Mon=0..Sun=6
  t.setUTCDate(t.getUTCDate() - day + 3);            // nearest Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  return 1 + Math.round((t - firstThu) / (7 * 86400000));
}

/* Same split `matrixTasks` does — top-level only, open only, `matches()`
   filtered — plus the one extra split this view needs: dated vs undated.
   "Dated" means the task itself carries a date, or one of its steps does,
   since a step's own bar would otherwise never be reachable. */
function timelineTasks(){
  const items = allItems();
  const dated = [], undated = [];
  // Same bucket tabs as the board and Matrix — see the comment in
  // matrixTasks for why blocker lookups stay against the full items list.
  const shownNames = new Set(shownBuckets().map(b => b.name));
  state.doc.buckets.forEach((b, bi) => {
    if (!shownNames.has(b.name)) return;
    const color = BUCKET_COLOR[bi % BUCKET_COLOR.length];
    b.tiers.forEach(tier => tier.tasks.forEach(t => {
      if (t.done || !matches(t)) return;
      const it = items.find(i => i.id === t.id && !i.sub);
      const blocked = !!it && !actionable(items, it);
      const steps = splitBody(t).steps
        .filter(s => !s.done && (s.due || s.start))
        .map(s => ({ id: t.id, title: s.clean, start: laterOf(s.start, t.start), due: s.due }));
      const row = { id: t.id, title: t.title, bucket: b.name, color,
                    start: t.start, due: t.due, blocked, steps };
      (t.start || t.due || steps.length ? dated : undated).push(row);
    }));
  });
  return { dated, undated };
}

/* The day range every lane draws against, padded a few days either side so a
   bar or diamond is never flush against the scroll edge, and floored to a
   minimum span so three tasks next week don't render as a two-inch strip. */
function timelineScale(dated){
  let min = today(), max = today();
  dated.forEach(row => {
    [row.start, row.due].concat(row.steps.flatMap(s => [s.start, s.due])).forEach(v => {
      const d = parseDue(v);
      if (!d) return;
      if (d < min) min = d;
      if (d > max) max = d;
    });
  });
  min = addDays(min, -3);
  max = addDays(max, 4);
  let days = Math.round((max - min) / 86400000);
  if (days < TL_MIN_DAYS) days = TL_MIN_DAYS;
  return { min, days, dayPx: TL_DAY_PX };
}
function tlOffset(scale, dateStr){
  const d = parseDue(dateStr);
  return d ? Math.round((d - scale.min) / 86400000) : null;
}
/* The first of each month inside the scale's range, so the header can label
   the scale without a caller having to walk the calendar itself. */
function tlMonths(scale){
  const out = [];
  const cur = new Date(scale.min.getFullYear(), scale.min.getMonth(), 1);
  const end = addDays(scale.min, scale.days);
  if (cur < scale.min) cur.setMonth(cur.getMonth() + 1);
  while (cur <= end) {
    out.push({ offset: Math.round((cur - scale.min) / 86400000),
               label: cur.toLocaleDateString(undefined, { month:'short', year:'numeric' }) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}
/* Every Monday inside the scale's range, each with its ISO week number —
   the gridlines that actually mean something, rather than a plain repeat
   every seven days from wherever the scale happens to start. */
function tlWeeks(scale){
  const out = [];
  const cur = new Date(scale.min);
  const dow = (cur.getDay() + 6) % 7;                // Mon=0..Sun=6
  if (dow !== 0) cur.setDate(cur.getDate() + (7 - dow));
  const end = addDays(scale.min, scale.days);
  while (cur <= end) {
    out.push({ offset: Math.round((cur - scale.min) / 86400000), n: isoWeekNumber(cur) });
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

/* One row: a sticky label plus a track the width of the whole scale, with
   the bar or diamond positioned inside it by day offset. `sub` narrows the
   row for a step nested under its parent — same track, thinner mark, and no
   drag handles: a step's dates live inside its line's own tags rather than
   on a property the way a task's do, so rescheduling one by dragging would
   mean rewriting that line's text rather than just setting a field — still
   only done from the drawer, same as before this view existed. */
function timelineRowHTML(row, scale, sub){
  const trackWidth = scale.days * scale.dayPx;
  const s = tlOffset(scale, row.start), d = tlOffset(scale, row.due);
  const drag = !sub;
  let mark = '';
  if (s != null && d != null) {
    const left = Math.min(s, d) * scale.dayPx;
    const width = Math.max(1, Math.abs(d - s) + 1) * scale.dayPx;
    const di = dueInfo(row.due);
    mark = '<div class="tlbar' + (di ? ' ' + di.cls : '') + '" style="left:' + left + 'px;width:' + width +
      'px;--bc:' + row.color + '" data-open="' + row.id + '"' +
      (drag ? ' data-tlrow="' + row.id + '" data-tldrag="move"' : '') +
      ' title="' + esc(row.title) + '">' +
      (drag ? '<span class="tlhandle tlhandle-l" data-tlrow="' + row.id + '" data-tldrag="start"></span>' +
              '<span class="tlhandle tlhandle-r" data-tlrow="' + row.id + '" data-tldrag="due"></span>' : '') +
      '</div>';
  } else if (s != null) {
    const t0 = tlOffset(scale, ymd(today()));
    const left = Math.min(s, t0) * scale.dayPx;
    const width = Math.max(1, Math.abs(t0 - s) + 1) * scale.dayPx;
    mark = '<div class="tlbar tltrail" style="left:' + left + 'px;width:' + width +
      'px;--bc:' + row.color + '" data-open="' + row.id + '"' +
      (drag ? ' data-tlrow="' + row.id + '" data-tldrag="start"' : '') +
      ' title="' + esc(row.title) + ' — started, no due date yet"></div>';
  } else if (d != null) {
    const di = dueInfo(row.due);
    mark = '<div class="tlmilestone' + (di ? ' ' + di.cls : '') + '" style="left:' + (d * scale.dayPx) +
      'px;--bc:' + row.color + '" data-open="' + row.id + '"' +
      (drag ? ' data-tlrow="' + row.id + '" data-tldrag="due"' : '') +
      ' title="' + esc(row.title) + '"></div>';
  }
  /* Only a task with steps gets a chevron, and only its own click toggles
     them — the title stays a plain click-to-open, same as every other row,
     so the two never fight over the same gesture. */
  const chevron = (!sub && row.steps && row.steps.length)
    ? '<button type="button" class="tlchevron' + (tlExpanded.has(row.id) ? ' open' : '') + '" data-tltoggle="' +
      row.id + '" title="' + (tlExpanded.has(row.id) ? 'Hide' : 'Show') + ' ' + row.steps.length +
      ' step' + (row.steps.length > 1 ? 's' : '') + '">›</button>'
    : (sub ? '' : '<span class="tlchevron ph"></span>');
  return '<div class="tlrow' + (sub ? ' tlsub' : '') + (row.blocked ? ' blocked' : '') + '">' +
    '<div class="tllabel">' + chevron +
      '<span class="tllabeltext" data-open="' + row.id + '" title="' + esc(row.title) + '">' + mdInline(row.title) + '</span>' +
    '</div>' +
    '<div class="tltrack" style="width:' + trackWidth + 'px">' + mark + '</div>' +
  '</div>';
}

function timelineLaneHTML(bucket, rows, scale){
  if (!rows.length) return '';
  const key = 'tl:' + bucket;
  const header = '<summary class="tlrow tllane"><div class="tllabel lanehead" style="--bc:' + rows[0].color + '">' +
      '<i class="dot"></i>' + esc(bucket) + '<span class="lanecount">' + rows.length + '</span>' +
    '</div><div class="tltrack" style="width:' + (scale.days * scale.dayPx) + 'px"></div></summary>';
  const body = rows.map(row => timelineRowHTML(row, scale) +
    (row.steps.length && tlExpanded.has(row.id) ? row.steps.map(s => timelineRowHTML(s, scale, true)).join('') : '')
  ).join('');
  return '<details class="tllanegroup" data-tlcollapse="' + esc(key) + '"' +
    (sectionCollapsed(key) ? '' : ' open') + '>' + header + body + '</details>';
}

/* Undated open tasks — most of a fresh list — sit here rather than being
   left off the view entirely. Same `chainCard` mini-card the dependency
   chain already draws blockers with: bucket colour, title, where it sits,
   click to open. Dragging one onto the scale sets its `due:`. */
function timelineTrayHTML(undated){
  if (!undated.length) return '';
  return '<div class="tltray" id="tlTray">' +
    '<div class="tltrayhead"><strong>' + undated.length + ' with no date</strong>' +
    '<span>Drag one onto the scale to give it a due date.</span></div>' +
    '<div class="tltraycards">' +
      undated.map(row => '<div class="chaincard tltraycard" style="--bc:' + row.color + '"' +
        (state.locked ? '' : ' draggable="true"') + ' data-tlid="' +
        row.id + '" data-open="' + row.id + '" title="Drag onto the scale, or click to open">' +
        '<span class="chaintitle">' + mdInline(row.title) + '</span>' +
        '<div class="chainwhere">' + esc(row.bucket) + '</div></div>').join('') +
    '</div></div>';
}

function timelineHeaderHTML(scale){
  const months = tlMonths(scale);
  const weeks = tlWeeks(scale);
  const todayOffset = tlOffset(scale, ymd(today()));
  const trackWidth = scale.days * scale.dayPx;
  return '<div class="tlrow tlheader">' +
      '<div class="tllabel">' +
        '<div class="tlresize" id="tlResize" title="Drag to resize the title column · double-click to reset"></div>' +
      '</div>' +
    '<div class="tltrack" style="width:' + trackWidth + 'px">' +
      months.map(m => '<span class="tlmonth" style="left:' + (m.offset * scale.dayPx) + 'px">' + esc(m.label) + '</span>').join('') +
      weeks.map(w => '<span class="tlweeknum" style="left:' + (w.offset * scale.dayPx) + 'px">W' + w.n + '</span>').join('') +
    '</div></div>' +
    weeks.map(w => '<div class="tlweekline" data-dayoffset="' + w.offset + '" style="left:' +
      (state.tlLabelWidth + w.offset * scale.dayPx) + 'px"></div>').join('') +
    '<div class="tltoday" data-dayoffset="' + todayOffset + '" style="left:' +
      (state.tlLabelWidth + todayOffset * scale.dayPx) + 'px" title="Today"></div>';
}

function timelineSection(){
  const { dated, undated } = timelineTasks();
  if (!dated.length && !undated.length) return '<p class="empty">Nothing open on the list.</p>';
  const scale = timelineScale(dated);
  const byBucket = new Map();
  dated.forEach(row => {
    if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, []);
    byBucket.get(row.bucket).push(row);
  });
  let lanes = '';
  byBucket.forEach((rows, bucket) => { lanes += timelineLaneHTML(bucket, rows, scale); });
  const body = dated.length
    ? '<div class="tlscroll"><div class="tlbody" style="--tllabelw:' + state.tlLabelWidth + 'px" data-daypx="' +
        scale.dayPx + '">' + timelineHeaderHTML(scale) + lanes + '</div></div>'
    : '<p class="empty">Nothing with a date yet — everything open is in the tray below.</p>';
  return body + timelineTrayHTML(undated);
}

/* The tray's cards drag the same way every board card does — same
   `dataTransfer`/`dragId` convention — but drop onto the scale instead of a
   tier, and the drop sets a date instead of a column. Wired after render,
   same as renderBoard wires its own card drag handlers. */
function wireTimelineDrag(){
  if (state.locked) return;
  const scroll = $('.tlscroll');
  $('#lists').querySelectorAll('.tltraycard').forEach(el => {
    el.ondragstart = e => {
      e.dataTransfer.setData('text/plain', el.dataset.tlid);
      e.dataTransfer.effectAllowed = 'move';
      dragId = el.dataset.tlid;
    };
    el.ondragend = () => { dragId = null; };
  });
  if (!scroll) return;
  const body = scroll.querySelector('.tlbody');
  scroll.ondragover = e => { if (dragId) e.preventDefault(); };
  scroll.ondrop = e => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    const loc = id && locate(id);
    if (!loc) return;
    const rect = body.getBoundingClientRect();
    const x = e.clientX - rect.left - state.tlLabelWidth;
    const scale = timelineScale(timelineTasks().dated);
    const dayN = Math.round(x / scale.dayPx);
    const date = addDays(scale.min, dayN);
    loc.task.due = ymd(date);
    loc.task.dirty = true;
    markDirty();
    refreshView();
  };

  wireTlResize(scroll);
  wireTlBarDrag();
}

/* A small fixed tooltip that follows the pointer — the live date(s) while a
   bar or milestone is being dragged. One element, reused rather than
   rebuilt, the same way the matrix and trend-line hover previews are. */
let tlPopoverEl = null;
function showTlPopover(x, y, text){
  if (!tlPopoverEl) {
    tlPopoverEl = document.createElement('div');
    tlPopoverEl.className = 'tlpopover';
    document.body.appendChild(tlPopoverEl);
  }
  tlPopoverEl.textContent = text;
  tlPopoverEl.style.left = x + 'px';
  tlPopoverEl.style.top = (y - 14) + 'px';
  tlPopoverEl.classList.add('on');
}
function hideTlPopover(){ if (tlPopoverEl) tlPopoverEl.classList.remove('on'); }

/* Drag a bar or a milestone to reschedule the task it belongs to, straight
   from the chart — the Gantt exists to make "push this a week" a drag rather
   than a trip to the drawer. Three targets, all wired the same way:
     .tlbar itself       — data-tldrag="move", shifts start and due together
     .tlhandle-l/-r       — data-tldrag="start"/"due", resizes one end
     .tlmilestone         — data-tldrag="due", the only date it has
   Sub-step marks carry none of these attributes (see timelineRowHTML), so
   `querySelectorAll` simply finds nothing to wire for them.

   A stopped drag under a few pixels is treated as the click it probably
   was — `moved` stays false and nothing is written, so the native click
   pointerup is about to fire still opens the drawer. A drag that actually
   moved never gets that far: `ev.preventDefault()` inside move(), once
   movement is confirmed, is what stops the browser following through with
   that trailing click at all, so there is nothing left to suppress by hand
   once the drag itself has run. */
function wireTlBarDrag(){
  $('#lists').querySelectorAll('[data-tldrag]').forEach(el => {
    el.onpointerdown = e => {
      if (e.button) return;
      const kind = el.dataset.tldrag;
      const loc = locate(el.dataset.tlrow);
      const track = el.closest('.tltrack');
      if (!loc || !track) return;
      const t = loc.task;
      const scale = timelineScale(timelineTasks().dated);
      const bar = el.classList.contains('tlbar') ? el : el.closest('.tlbar');
      const milestone = el.classList.contains('tlmilestone') ? el : null;
      const trackRect = track.getBoundingClientRect();
      const origStart = t.start ? tlOffset(scale, t.start) : null;
      const origDue = t.due ? tlOffset(scale, t.due) : null;
      const beginDay = Math.round((e.clientX - trackRect.left) / scale.dayPx);
      let moved = false, newStart = origStart, newDue = origDue;

      el.setPointerCapture(e.pointerId);

      const move = ev => {
        if (!moved && Math.abs(ev.clientX - e.clientX) < 3) return;
        // Only once real movement is confirmed, and on this event rather than
        // the pointerdown that started it: calling preventDefault there
        // unconditionally suppresses the click a plain, unmoved press fires
        // afterwards — the same click that opens the drawer the rest of the
        // time. By now preventing it just stops the drag turning into a text
        // selection.
        ev.preventDefault();
        moved = true;
        const day = Math.round((ev.clientX - trackRect.left) / scale.dayPx);
        if (kind === 'move') {
          const delta = day - beginDay;
          newStart = origStart != null ? origStart + delta : null;
          newDue = origDue != null ? origDue + delta : null;
        } else if (kind === 'start') {
          newStart = origDue != null ? Math.min(day, origDue) : day;
        } else if (kind === 'due') {
          newDue = origStart != null ? Math.max(day, origStart) : day;
        }
        const lo = newStart != null && newDue != null ? Math.min(newStart, newDue) : (newStart != null ? newStart : newDue);
        const hi = newStart != null && newDue != null ? Math.max(newStart, newDue) : (newStart != null ? newStart : newDue);
        if (bar) {
          bar.style.left = (lo * scale.dayPx) + 'px';
          bar.style.width = (Math.max(1, hi - lo + 1) * scale.dayPx) + 'px';
        } else if (milestone) {
          milestone.style.left = (newDue * scale.dayPx) + 'px';
        }
        const label = newStart != null && newDue != null
          ? dueLabel(ymd(addDays(scale.min, newStart))) + ' → ' + dueLabel(ymd(addDays(scale.min, newDue)))
          : dueLabel(ymd(addDays(scale.min, newStart != null ? newStart : newDue)));
        showTlPopover(ev.clientX, ev.clientY, label);
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        hideTlPopover();
        if (!moved) return;
        if (newStart != null) t.start = ymd(addDays(scale.min, newStart));
        if (newDue != null) t.due = ymd(addDays(scale.min, newDue));
        t.dirty = true;
        markDirty();
        refreshView();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up, { once:true });
      el.addEventListener('pointercancel', up, { once:true });
    };
  });
}

/* Drag the title column's right edge to make it wider or narrower. The
   handle itself sits inside the header's sticky label cell (see
   timelineHeaderHTML), so it tracks the frozen column during a horizontal
   scroll for free — no separate offset to keep in step. Everything that
   isn't sticky (the today line, the week gridlines) carries its own day
   offset instead, so a resize can reposition them without a full re-render. */
function setTlLabelWidth(px){
  state.tlLabelWidth = Math.round(Math.min(Math.max(px, 120), 400));
  try { localStorage.setItem('todo-board-tl-label', state.tlLabelWidth); } catch (e) {}
  const body = $('.tlbody');
  if (!body) return;
  body.style.setProperty('--tllabelw', state.tlLabelWidth + 'px');
  const dayPx = +body.dataset.daypx || TL_DAY_PX;
  body.querySelectorAll('[data-dayoffset]').forEach(el => {
    el.style.left = (state.tlLabelWidth + (+el.dataset.dayoffset) * dayPx) + 'px';
  });
}
function wireTlResize(scroll){
  const grip = $('#tlResize');
  if (!grip) return;
  grip.onpointerdown = e => {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    grip.classList.add('active');
    const rect = scroll.getBoundingClientRect();
    const move = ev => setTlLabelWidth(ev.clientX - rect.left);
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.classList.remove('active');
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up, { once:true });
    grip.addEventListener('pointercancel', up, { once:true });
  };
  grip.ondblclick = () => setTlLabelWidth(200);
}

/* opts.collapsible is Overview's own five sections: shut until he opens one,
   remembered per section the same way the drawer's are — see overviewOpen.
   Matrix's two sections stay plain, always open, since there is only ever
   the two of them and nothing to skim past. */
function refSection(title, hint, html, opts){
  opts = opts || {};
  if (opts.collapsible) {
    const key = 'ov:' + title;
    return '<details class="listcard ovsection" data-ovcollapse="' + esc(key) + '"' +
      (overviewOpen(key) ? ' open' : '') + '>' +
      '<summary>' + esc(title) + '</summary>' +
      (hint ? '<p class="refhint">' + mdInline(hint) + '</p>' : '') +
      html +
      '</details>';
  }
  return '<section class="listcard"><h3>' + esc(title) + '</h3>' +
         (hint ? '<p class="refhint">' + mdInline(hint) + '</p>' : '') +
         html +
         '</section>';
}

/* The split grid is written out here rather than in the stylesheet because
   Context is the last column and the only one with a different width: it is
   prose in full sentences, not cards, and at card width it reads as a ribbon.
   repeat() cannot take a computed count reliably across browsers, so the tracks
   are listed one by one. */
const REF_TRACK = 'minmax(380px,1fr)';
const CTX_TRACK = 'minmax(540px,1.5fr)';
function splitGridCSS(cols, hasCtx){
  const plain = hasCtx ? cols - 1 : cols;
  const tracks = Array(plain).fill(REF_TRACK);
  if (hasCtx) tracks.push(CTX_TRACK);
  // Below this the row scrolls sideways instead of squeezing the columns.
  const minW = plain * 394 + (hasCtx ? 554 : 0);
  return 'grid-template-columns:' + tracks.join(' ') + ';min-width:' + minW + 'px';
}

function renderSections(viewId){
  // The grid is rebuilt from scratch here, so any preview on screen is pointing
  // at a dot that no longer exists.
  hideMatrixPreview();
  renderFilterBar();
  // Same bucket tabs as the board, same meaning: narrowed to one bucket
  // unless the AI filter, the urgent filter, the unscored chip or All widens
  // it back out, per shownBuckets().
  const shownNames = new Set(shownBuckets().map(b => b.name));
  const items = allItems().filter(i => shownNames.has(i.bucket));
  let html = '', split = false, mview = false, tview = false, cols = 4, hasCtx = false;

  if (viewId === 'overview') {
    const ctx = contextSection();
    split = true;
    // One section per column, left to right, the same way the board reads.
    const secs = [
      refSection('Big rocks', 'High impact, L effort. Needs protected time.', bigRocksSection(items), { collapsible:true }),
      refSection('This week', 'Everything tagged `week`, soonest first.', weekSection(items), { collapsible:true }),
      refSection('Quick wins', 'Yours to do: meeting agendas, `effort:S` and written messages. Anything `ai:full` sits in Delegate instead.', quickSection(items), { collapsible:true }),
      refSection('Delegate to Claude', 'Everything tagged `ai:full`, in `rank:` order.', delegateSection(items), { collapsible:true })
    ];
    if (ctx) {
      secs.push(refSection('Context', 'Standing facts, not tasks. Edit these in todo.md.', ctx, { collapsible:true }));
      hasCtx = true;
    }
    cols = secs.length;
    html = secs.join('');
  } else if (viewId === 'matrix') {
    mview = true;
    // The chain sits beside the matrix: both answer "what can I actually start",
    // one by score and one by what is still waiting on something else.
    html = refSection('Impact against effort',
      'Every open task by its two scores, except the ones parked in Backlog. One dot per task, coloured by bucket — hover for the title, click to open it. Faded dots are waiting on a review or on another task.',
      matrixSection()) +
      refSection('Dependency chain', 'Built from every `blocked-by:` tag.', chainSection(items));
  } else if (viewId === 'timeline') {
    tview = true;
    html = refSection('Timeline',
      'Open top-level tasks as bars and milestones across their `start:`/`due:` dates, one lane per bucket. ' +
      'A `due:` with no `start:` draws as a diamond rather than a guessed bar. Undated tasks sit in the tray below — drag one onto the scale to give it a due date.',
      timelineSection());
  }

  $('#lists').innerHTML =
    '<div class="lists' + (split ? ' split' : '') + (mview ? ' mview' : '') + (tview ? ' tview' : '') + '"' +
      (split ? ' style="' + splitGridCSS(cols, hasCtx) + '"' : '') + '>' + html + '</div>' +
    '<p class="help listnote">Generated from the tags on the tasks, so every card here is a real task. ' +
    'Open one to change it, then Save.</p>';
  capMsgCards();
  if (tview) wireTimelineDrag();
}

/* .ref .msg's 400px cap is CSS, and CSS alone cannot tell a card that landed
   on exactly 400px from one three screens long — so once the cards are
   actually in the DOM, measure each one against its own scroll height and
   mark the ones truncation really cut. Only .capped gets the fade and the
   label; a card that fits gets neither. */
function capMsgCards(){
  $('#lists').querySelectorAll('.ref .msg').forEach(el => {
    el.classList.toggle('capped', el.scrollHeight > el.clientHeight + 1);
  });
}

/* Two views: the board, and the hand-written summaries from the end of the file.
   The bucket tabs, the AI filter and search only make sense on the board. */
function renderView(){
  // Up front, not at the end: the board case returns early, and the chip belongs
  // to the header rather than to any one view.
  updateArchiveChip();
  const defs = viewDefs();
  // Quick wins and Delegate to Claude are columns of Overview now, so an old
  // #quick or #delegate link lands where its content actually lives.
  if (state.view === 'quick' || state.view === 'delegate') state.view = 'overview';
  const isBackups = state.view === 'backups';
  // Schedule sits beside Backups for the same reason: it is about the machinery
  // around the list rather than about the list, so it is a header button and
  // not a tab on the main nav.
  const isSchedule = state.view === 'schedule';
  // Canvas is gated behind onChatStatusChanged's async answer, which hasn't
  // arrived yet on the very first render — load() calls this before that
  // fetch resolves. Without this exception a refresh onto #canvas loses the
  // race: the fallback below overwrites state.view to 'board' (and the URL
  // with it, at the replaceState below) before chatsOn ever gets the chance
  // to say yes, and nothing afterwards remembers canvas was ever wanted.
  const isPendingCanvas = state.view === 'canvas' && !state.chatsChecked;
  if (!isBackups && !isSchedule && !isPendingCanvas && !defs.some(d => d.id === state.view)) state.view = 'board';
  const def = isBackups ? { id:'backups', label:'Backups' }
    : isSchedule ? { id:'schedule', label:'Schedule' }
    : isPendingCanvas ? { id:'board', label:'Board' }
    : defs.find(d => d.id === state.view);
  const isBoard = def.id === 'board';
  // Keep the URL in step with whichever tab is on screen, so a refresh (or a
  // link back to this page) lands on the same view instead of the default.
  // replaceState rather than the hash setter: it doesn't add a history entry
  // or fire hashchange, so this can't loop with the listener below.
  // Writing the view alone is also what clears a `!task=` once it has been
  // acted on, so a refresh doesn't reopen the same drawer for ever.
  if (location.hash.slice(1) !== state.view) history.replaceState(null, '', '#' + state.view);

  $('#viewToggle').innerHTML = defs.map(d => d.sep ? '<span class="tabsep"></span>' :
    '<button class="tab' + (d.id === state.view ? ' on' : '') + '" data-view="' + d.id + '">' + esc(d.label) + '</button>'
  ).join('');
  $('#viewToggle').querySelectorAll('.tab').forEach(b => {
    b.onclick = () => { state.view = b.dataset.view; renderView(); };
  });

  const isCanvas = def.id === 'canvas';
  $('#board').classList.toggle('hidden', !isBoard);
  $('#canvas').classList.toggle('hidden', !isCanvas);
  $('#lists').classList.toggle('hidden', isBoard || isCanvas);
  $('#backupsBtn').classList.toggle('on', isBackups);
  $('#scheduleBtn').classList.toggle('on', isSchedule);

  if (isBoard) { renderBoard(); return; }
  // Same reasoning as the board's early return: the canvas draws itself and
  // has no bucket sections under it.
  if (isCanvas) { $('#headline').classList.add('hidden'); renderCanvas(); return; }
  // The one thing bar is a board idea specifically — pinning a card above
  // columns that don't exist anywhere else has nothing to attach to. Every
  // other control in the header (the bucket tabs, the score chip, AI,
  // urgent, search) applies the same way wherever it's shown, so it stays up
  // on every tab rather than popping in and out as he switches between them.
  $('#headline').classList.add('hidden');
  if (def.id === 'reports') { renderFilterBar(); renderReportsView(); return; }
  if (def.id === 'plans') { renderFilterBar(); renderPlansView(); return; }
  if (def.id === 'backups') { renderFilterBar(); renderBackupsView(); return; }
  if (def.id === 'schedule') { renderFilterBar(); renderScheduleView(); return; }
  renderSections(def.id);
}

/* Re-draw whichever view is on screen. The drawer opens from the lists as well
   as the board now, so an edit has to show up where it was made — renderBoard
   alone does nothing when a list view is up. */
function refreshView(){
  if (state.view === 'board') renderBoard();
  else if (state.view === 'canvas') renderCanvas();
  else if (state.view === 'reports') renderReportsView();
  else if (state.view === 'plans') renderPlansView();
  else if (state.view === 'backups') renderBackupsView();
  else if (state.view === 'schedule') renderScheduleView();
  else renderSections(state.view);
  updateArchiveChip();
}

/* The bar above the board. Empty it is a slim invitation, not a banner: an empty
   headline is a normal state, and the board should not shout about it. */
function renderHeadline(){
  const bar = $('#headline');
  const hl = headlineTask();
  bar.classList.toggle('hidden', state.view !== 'board' || state.locked);
  bar.classList.toggle('set', !!hl);
  if (!hl) {
    bar.innerHTML = '<span class="hllabel">The one thing</span>' +
      '<span class="hlempty">Nothing set. Drag a card here, or open a task and press ' +
      '<strong>Make this the headline</strong>.</span>';
    // Nothing to open, so the bar goes back to being a strip of text. Left set,
    // the old role and handler would survive the removal and open a stale task.
    bar.removeAttribute('role');
    bar.removeAttribute('tabindex');
    bar.onclick = null;
    bar.onkeydown = null;
    return;
  }
  const t = hl.task;
  const di = dueInfo(t.due);
  const blocks = unblockCount(t);
  const set = parseDue(t.headline);
  const age = set ? Math.round((today() - set) / 86400000) : null;

  let tags = '';
  if (t.impact) tags += '<span class="tag impact-' + esc(t.impact) + '" title="' + esc(t.impact) + ' impact">' + (IMPACT_EMOJI[t.impact] || esc(t.impact)) + '</span>';
  if (t.effort) tags += '<span class="tag">' + esc(t.effort) + '</span>';
  if (di) tags += '<span class="tag due ' + di.cls + '">' + esc(di.label) +
                  (di.note ? ' · ' + esc(di.note) : '') + '</span>';
  if (blocks) tags += '<span class="tag unblocks">frees up ' + blocks +
                      ' other task' + (blocks > 1 ? 's' : '') + '</span>';

  bar.innerHTML = '<span class="hllabel">The one thing</span>' +
    '<div class="hlmain">' +
      '<div class="hltitle">' + mdInline(t.title) + '</div>' +
      '<div class="hlmeta">' +
        '<span class="hlwhere">' + esc(hl.bucket.name) + ' · ' +
          esc(t.done ? DONE_COL : hl.tier.name) + '</span>' + tags +
      '</div>' +
    '</div>' +
    '<div class="hlright">' +
      (age === null ? '' : '<span class="hlage">' +
        (age <= 0 ? 'set today' : 'set ' + age + ' day' + (age > 1 ? 's' : '') + ' ago') + '</span>') +
      (t.done ? '<span class="hldone">solved — pick the next one</span>' : '') +
      '<button class="hlclear" id="hlClear">Remove</button>' +
    '</div>';

  /* The whole bar opens the task, like a card. Only the Remove button is carved
     out of that, or the one gesture that gets rid of the headline would open it. */
  bar.setAttribute('role', 'button');
  bar.setAttribute('tabindex', '0');
  bar.onclick = e => { if (!e.target.closest('.hlclear')) openDrawer(t.id); };
  bar.onkeydown = e => {
    if (e.target.closest('.hlclear')) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(t.id); }
  };
  $('#hlClear').onclick = e => { e.stopPropagation(); clearHeadline(false); };
}

/* The bucket tabs and the score chip, and the rule that widens both past a
   single bucket — shared by the board and every list view (Overview, Matrix,
   Timeline, Reports, Backups) now, rather than a board-only idea the rest
   only tolerated. Filtering means the same thing wherever it's shown. */
function renderFilterBar(){
  renderTabs();
  renderScoreChip();
  // The "who does it" filter cuts across every bucket, so it overrides the tabs.
  // The urgent/due filter does the same. The All tab does the same thing, but
  // the tabs stay up so it can be undone.
  const across = !!state.aiFilter || state.urgentFilter;
  $('#bucketFilters').classList.toggle('hidden', across);
  // Follows the strip it belongs to, and goes with it in a preview or the demo,
  // where the file behind it is not one that can be written to.
  $('#editBuckets').classList.toggle('hidden', across || state.locked);
  // Columns are global, so this one has no reason to hide when the AI filter
  // narrows the view across every bucket — only a backup preview, which
  // cannot write anything, takes it away.
  $('#editTiers').classList.toggle('hidden', state.locked);
  $('#allBuckets').classList.toggle('hidden', !across);
}

function renderBoard(){
  if (state.view !== 'board') return;
  renderFilterBar();
  renderHeadline();
  const board = $('#board');
  const shown = shownBuckets();
  const many = shown.length > 1;

  // Blocked stays off the board entirely until something is actually sitting
  // in it — the empty-column treatment other tiers get would be misleading
  // here, since Blocked has no standing heading to justify a permanent slot.
  const hasBlocked = state.doc.buckets.some(b => {
    const tier = b.tiers.find(t => t.name === BLOCKED_TIER);
    return tier && tier.tasks.some(t => !t.done);
  });
  const columns = boardColumns().filter(name => name !== BLOCKED_TIER || hasBlocked);
  board.style.setProperty('--cols', columns.length);
  board.innerHTML = columns.map(name => {
    const isDone = name === DONE_COL;
    const mode = sortMode(name);
    let entries = [];
    shown.forEach(bucket => {
      const color = BUCKET_COLOR[state.doc.buckets.indexOf(bucket) % BUCKET_COLOR.length];
      const label = many ? bucket.name : '';
      if (isDone) {
        bucket.tiers.forEach(tier => tier.tasks.forEach(t => {
          if (t.done && matches(t)) entries.push({ t, color, label });
        }));
      } else {
        const tier = bucket.tiers.find(t => t.name === name);
        if (tier) tier.tasks.forEach(t => { if (!t.done && matches(t)) entries.push({ t, color, label }); });
      }
    });
    // Stable: equal scores keep the order he put them in, so the sort only ever
    // answers the question it was asked.
    if (mode === 'priority') {
      entries = entries.map((e, i) => ({ e, i }))
        .sort((a, b) => (priorityScore(b.e.t) - priorityScore(a.e.t)) || (a.i - b.i))
        .map(x => x.e);
    }
    const n = entries.length;
    const cards = entries.map(e => cardHTML(e.t, e.color, e.label, { noDrag: state.locked, muted: name === WAIT_COL })).join('');

    const sortBtn = isDone ? '' :
      '<button class="sortbtn' + (mode === 'priority' ? ' on' : '') + '" data-sort="' + esc(name) + '"' +
      ' title="' + (mode === 'priority'
        ? 'Showing highest impact for the lightest lift first. Hand-reordering is off while this is on.'
        : 'Showing your own order. Click to sort by impact against effort.') + '">' +
      (mode === 'priority' ? 'by priority' : '⇅') + '</button>';

    return '<section class="col' + (isDone ? ' donecol' : '') +
        (name === WAIT_COL ? ' waitcol' : '') +
        (mode === 'priority' ? ' sorted' : '') + '" data-tier="' + esc(name) + '">' +
      '<h2>' + esc(name) + (TIER_HINT[name] ? ' <span class="hint">' + esc(TIER_HINT[name]) + '</span>' : '') +
      sortBtn + '<span class="count">' + n + '</span></h2>' +
      '<div class="drop" data-tier="' + esc(name) + '">' + (n ? cards : '<div class="empty">Nothing here</div>') + '</div>' +
      (isDone || state.locked ? '' : '<footer><button class="addbtn" data-add="' + esc(name) + '">+ Add task</button></footer>') +
    '</section>';
  }).join('');

  board.querySelectorAll('.card').forEach(el => {
    el.onclick = () => openDrawer(el.dataset.id);
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDrawer(el.dataset.id); } };
  });
  // Drag-and-drop, the add-task footer and their wiring only mean anything for
  // the live file — a backup preview has nothing to reorder into.
  if (!state.locked) {
    board.querySelectorAll('.card').forEach(el => {
      el.ondragstart = e => {
        e.dataTransfer.setData('text/plain', el.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        dragId = el.dataset.id;
        requestAnimationFrame(() => el.classList.add('dragging'));
      };
      el.ondragend = () => { el.classList.remove('dragging'); dragId = null; hideDropLine(); };
    });
    board.querySelectorAll('.drop').forEach(zone => {
      zone.ondragover = e => {
        e.preventDefault();
        zone.classList.add('over');
        showDropLine(zone, e.clientY);
      };
      // Moving onto a card inside the zone counts as leaving the zone in most
      // browsers, so check where the pointer actually went before clearing.
      zone.ondragleave = e => {
        if (zone.contains(e.relatedTarget)) return;
        zone.classList.remove('over');
        hideDropLine();
      };
      zone.ondrop = e => {
        e.preventDefault();
        zone.classList.remove('over');
        hideDropLine();
        const id = e.dataTransfer.getData('text/plain') || dragId;
        if (id) dropTask(id, zone.dataset.tier, zone, e.clientY);
      };
    });
    board.querySelectorAll('.addbtn').forEach(el => { el.onclick = () => addTask(el.dataset.add); });
  }
  board.querySelectorAll('.sortbtn').forEach(el => {
    el.onclick = () => {
      setSortMode(el.dataset.sort, sortMode(el.dataset.sort) === 'priority' ? 'manual' : 'priority');
      renderBoard();
    };
  });
}

/* The intake queue. Counts across every bucket whatever the tabs say, because
   a task with no scores is not in a bucket's flow yet — it is waiting to enter
   one. Clicking it shows exactly those. */
function renderScoreChip(){
  const chip = $('#scoreChip');
  if (!state.doc) { chip.classList.add('hidden'); return; }
  let n = 0;
  state.doc.buckets.forEach(b => b.tiers.forEach(ti => ti.tasks.forEach(t => {
    if (!t.done && unscored(t) && matchesAi(t)) n++;
  })));
  chip.classList.toggle('hidden', n === 0 && !state.unscoredOnly);
  chip.classList.toggle('on', state.unscoredOnly);
  chip.textContent = state.unscoredOnly
    ? 'Showing ' + n + ' unscored · show all'
    : n + ' need scoring';
  chip.title = state.unscoredOnly
    ? 'Back to the whole list'
    : 'Tasks with no impact or no effort score yet. Click to see just those.';
  chip.onclick = () => { state.unscoredOnly = !state.unscoredOnly; refreshView(); };
}

let dragId = null;
let subDrag = null;
/* Which timeline tasks are showing their steps. Not persisted — reparsing
   mints fresh task ids (see resetUndo), so a stored id would stop matching
   anything by the next reload anyway. Collapsed by default: the row-per-step
   count could otherwise dwarf the tasks that own them. */
let tlExpanded = new Set();

/* A line showing where the card will land. One element, moved around the board
   rather than one per gap, so there is never more than one target on screen.
   It reads the same cards dropTask does — only same-bucket ones count, since a
   card can only be reordered against its own bucket's list — so the line always
   marks the place the card actually goes. */
let dropLine = null;
function insertAfterEl(zone, clientY, dragBucket, skipId){
  let after = null;
  zone.querySelectorAll('.card').forEach(el => {
    if (el.classList.contains('dragging') || el.dataset.id === skipId) return;
    const other = locate(el.dataset.id);
    if (!other || (dragBucket && other.bucket !== dragBucket)) return;
    const r = el.getBoundingClientRect();
    if (clientY > r.top + r.height / 2) after = el;
  });
  return after;
}
function showDropLine(zone, clientY){
  if (subDrag !== null) return;                       // a sub-step drag, not a card
  // Nothing to point at in a sorted column: the order is worked out, so there
  // is no gap to drop into. The column still highlights as a valid target.
  if (sortMode(zone.dataset.tier) === 'priority') return;
  if (!dropLine) {
    dropLine = document.createElement('div');
    dropLine.className = 'dropline';
  }
  const from = dragId ? locate(dragId) : null;
  const after = insertAfterEl(zone, clientY, from ? from.bucket : null, dragId);
  if (after) after.after(dropLine);
  else zone.prepend(dropLine);
}
function hideDropLine(){ if (dropLine && dropLine.parentNode) dropLine.remove(); }

/* Dropping a card on the bar makes it the one thing. Bound once, not per render,
   since the bar itself is never replaced — only its contents are. */
(function wireHeadlineDrop(){
  const bar = $('#headline');
  bar.ondragover = e => {
    if (subDrag !== null || !dragId) return;
    e.preventDefault();
    bar.classList.add('over');
  };
  bar.ondragleave = e => { if (!bar.contains(e.relatedTarget)) bar.classList.remove('over'); };
  bar.ondrop = e => {
    e.preventDefault();
    bar.classList.remove('over');
    const id = e.dataTransfer.getData('text/plain') || dragId;
    if (id && locate(id)) setHeadline(id);
  };
})();

/* Move a task to another tier, inserting near where it was dropped.
   Cards from other buckets are ignored when working out the position. */
function dropTask(id, tierName, zone, clientY){
  if (state.locked) return;
  const loc = locate(id);
  if (!loc) return;

  // Done is not a section in the file — it is the tick box on the task.
  if (tierName === DONE_COL) {
    const msg = blockedMessage(allItems(), loc.task.blockedBy);
    if (msg) { showToast(msg, 'blocked'); return; }
    if (setDone(loc.task, true)) { markDirty(); refreshView(); }
    if (state.openTask === id) openDrawer(id);
    return;
  }
  setDone(loc.task, false);                       // dragged back out of Done

  const targetTier = ensureTier(loc.bucket, tierName);

  // In a sorted column the position on screen is worked out, not chosen, so
  // there is nothing to read off the drop point. Move the task into the column
  // and leave his order alone — the sort will place it.
  const manual = sortMode(tierName) !== 'priority';
  const afterEl = manual ? insertAfterEl(zone, clientY, loc.bucket, id) : null;
  const after = afterEl ? (locate(afterEl.dataset.id) || {}).task : null;

  loc.tier.tasks.splice(loc.index, 1);
  let at;
  if (!manual) at = targetTier.tasks.length;
  else if (after) { const k = targetTier.tasks.indexOf(after); at = k > -1 ? k + 1 : targetTier.tasks.length; }
  else at = 0;
  targetTier.tasks.splice(at, 0, loc.task);

  markDirty(); refreshView();
  if (state.openTask === id) openDrawer(id);
}

function addTask(tierName){
  if (state.locked) return;
  const tier = ensureTier(activeBucket(), tierName);
  const t = { id: uid(), done:false, title:'New task', bold:true, impact:'', effort:'', due:'', ai:'', to:'',
              urgent:false, week:false, slug:'', blockedBy:[], rank:null, extra:[], body:[], raw:'', dirty:true };
  tier.tasks.push(t);
  markDirty(); refreshView(); openDrawer(t.id, true);
}

/* Taking work back off Claude has to take the prompt with it.
   Delegate to Claude is generated from the ai: tag, so a task switched to
   partial or none drops out of that list — but the prompt written for it would
   stay behind on the task, still reading as an instruction to hand it over. The
   next person to rebuild the section would have a prompt with nothing asking for
   it. A sub-step carrying its own ai:full is left alone, because it did not
   inherit the tag that just changed. Returns what was removed, so the change
   can be reported rather than happening silently. */
function stripDelegation(t){
  const removed = [];
  const out = [];
  let base = null, inherits = false;

  t.body.forEach(line => {
    const m = SUB_RE.exec(line);
    if (m && (base === null || m[1].length <= base)) {
      base = m[1].length;
      inherits = !hasField(m[3], 'ai');                    // no ai: of its own, so it follows the parent
      let text = m[3];
      if (inherits) text = text.replace(/\s*`rank:\d+`/g, '');
      out.push(m[1] + '- [' + m[2] + '] ' + text);
      return;
    }
    const deeper = base !== null && /^\s+\S/.test(line) && leadIndent(line) > base;
    if (PROMPT_NOTE.test(line) && (!deeper || inherits)) { removed.push(line.trim()); return; }
    out.push(line);
  });

  if (removed.length || t.rank != null) {
    t.body = out;
    t.rank = null;
    t.dirty = true;
  }
  return removed;
}

