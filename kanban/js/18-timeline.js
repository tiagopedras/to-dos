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

   A lane's vertical order is its own thing, not the tier order the board
   uses — a lane mixes tasks pulled from every tier, so there is no shared
   position to read one off. Dragging a row's label writes `tlrank`, and only
   dragging ever does; a lane nobody has touched just keeps falling back to
   board order (see timelineSection()).
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
    const color = bucketColor(b.name, bi);
    b.tiers.forEach(tier => tier.tasks.forEach(t => {
      if (t.done || !matches(t, tier.name)) return;
      const it = items.find(i => i.id === t.id && !i.sub);
      const blocked = !!it && !actionable(items, it);
      const steps = splitBody(t).steps
        .filter(s => !s.done && (s.due || s.start))
        .map(s => ({ id: t.id, title: s.clean, start: laterOf(s.start, t.start), due: s.due }));
      const row = { id: t.id, title: t.title, bucket: b.name, color,
                    start: t.start, due: t.due, blocked, steps, tlrank: t.tlrank };
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
/* Every Saturday–Sunday inside the scale's range, as one two-day span each —
   decided in IMPROVEMENTS.md against collapsing them: a weekend stays real
   space on the axis, no change to tlOffset or the day-to-pixel math anywhere
   else, and is marked instead with a diagonal-striped seam (see .tlweekend
   in board.css) so five working days next to two off ones still reads as
   what it is without the scale itself lying about how long either span is. */
function tlWeekends(scale){
  const out = [];
  const cur = new Date(scale.min);
  const dow = cur.getDay();                          // Sun=0..Sat=6
  if (dow !== 6) cur.setDate(cur.getDate() + ((6 - dow + 7) % 7));
  const end = addDays(scale.min, scale.days);
  while (cur <= end) {
    out.push({ offset: Math.round((cur - scale.min) / 86400000) });
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
  // The row's vertical position in its lane, dragged from anywhere on the
  // label (see wireTlReorder) — a step has no lane position of its own to
  // drag (see the file banner), so it gets nothing here, same as it gets no
  // chevron. The dots are just the affordance now, not the only hit target:
  // a native `draggable` ancestor still lets a plain click on the title
  // through as a click, same as the board's own cards manage both at once.
  const grip = sub ? '' : '<span class="tlgrip' + (state.locked ? ' ph' : '') + '">⋮⋮</span>';
  const labelDrag = (sub || state.locked) ? '' :
    ' draggable="true" title="Drag to reorder within ' + esc(row.bucket || '') + '"';
  return '<div class="tlrow' + (sub ? ' tlsub' : '') + (row.blocked ? ' blocked' : '') + '"' +
    // --bc here too, not only on the mark it may or may not have drawn (a
    // task with neither start nor due but a dated step draws no mark of its
    // own) — wireTlTrackClick's ghost bar reads it off the row rather than
    // off a mark that might not exist.
    (sub ? '' : ' data-tlreorder="' + row.id + '" style="--bc:' + row.color + '"') + '>' +
    '<div class="tllabel"' + labelDrag + '>' + grip + chevron +
      '<span class="tllabeltext" data-open="' + row.id + '" title="' + esc(row.title) + '">' + mdInline(row.title) + '</span>' +
    '</div>' +
    '<div class="tltrack" style="width:' + trackWidth + 'px">' + mark + '</div>' +
  '</div>';
}

function timelineLaneHTML(bucket, rows, scale){
  if (!rows.length) return '';
  const key = 'tl:' + bucket;
  // Same field a grip drag already writes (see wireTlReorder) — a one-off
  // sort, not a standing rule, so a later drag on any single row overwrites
  // its own rank same as it always did.
  const sortBtn = state.locked ? '' : '<button type="button" class="tlsort" data-tlsort="' +
    esc(bucket) + '" title="Sort this lane by earliest date — start, else due">Sort by date</button>';
  const header = '<summary class="tlrow tllane"><div class="tllabel lanehead" style="--bc:' + rows[0].color + '">' +
      '<i class="dot"></i>' + esc(bucket) + '<span class="lanecount">' + rows.length + '</span>' + sortBtn +
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

/* What the colours mean, under the scale rather than over it — a bar or a
   diamond is drawn in its bucket's colour until a date makes it urgent, at
   which point `dueInfo` (06-dates-substeps.js) overrides it, and nothing on
   the row itself says so. The bucket swatch is striped from the colours
   actually on screen, so it reads as "one of these" rather than picking one
   lane's colour and implying that one. */
function timelineLegendHTML(colors){
  const stripe = colors.length
    ? 'linear-gradient(90deg,' + colors.map((c, i) =>
        c + ' ' + (i / colors.length * 100) + '%,' + c + ' ' + ((i + 1) / colors.length * 100) + '%'
      ).join(',') + ')'
    : 'var(--tenon-stroke-default)';
  const item = (sw, text) => '<span class="tllegitem">' + sw + text + '</span>';
  return '<div class="tllegend">' +
    item('<i class="tlswatch" style="background:' + stripe + '"></i>', 'Its bucket&rsquo;s colour') +
    item('<i class="tlswatch" style="background:var(--tenon-status-over)"></i>', 'Due today, or overdue') +
    item('<i class="tlswatch" style="background:var(--tenon-status-soon)"></i>', 'Due in the next 4 days') +
    item('<i class="tlswatch dim" style="background:' + stripe + '"></i>', 'Waiting on a review or another task') +
  '</div>';
}

function timelineHeaderHTML(scale){
  const months = tlMonths(scale);
  const weeks = tlWeeks(scale);
  const weekends = tlWeekends(scale);
  // Half a day in, so the line runs down the middle of today's column,
  // the same place a diamond due today sits.
  const todayOffset = tlOffset(scale, ymd(today())) + 0.5;
  const trackWidth = scale.days * scale.dayPx;
  return '<div class="tlrow tlheader">' +
      '<div class="tllabel">' +
        '<div class="tlresize" id="tlResize" title="Drag to resize the title column · double-click to reset"></div>' +
      '</div>' +
    '<div class="tltrack" style="width:' + trackWidth + 'px">' +
      months.map(m => '<span class="tlmonth" style="left:' + (m.offset * scale.dayPx) + 'px">' + esc(m.label) + '</span>').join('') +
      weeks.map(w => '<span class="tlweeknum" style="left:' + (w.offset * scale.dayPx) + 'px">W' + w.n + '</span>').join('') +
      '<span class="tltodaytick" style="left:' + (todayOffset * scale.dayPx) + 'px"></span>' +
      '<span class="tltodaylabel" style="left:' + (todayOffset * scale.dayPx) + 'px" title="Today">today</span>' +
    '</div></div>' +
    weekends.map(w => '<div class="tlweekend" style="left:' +
      (state.tlLabelWidth + w.offset * scale.dayPx) + 'px;width:' + (2 * scale.dayPx) + 'px"></div>').join('') +
    weeks.map(w => '<div class="tlweekline" data-dayoffset="' + w.offset + '" style="left:' +
      (state.tlLabelWidth + w.offset * scale.dayPx) + 'px"></div>').join('') +
    '<div class="tltoday" data-dayoffset="' + todayOffset + '" style="left:' +
      (state.tlLabelWidth + todayOffset * scale.dayPx) + 'px" title="Today"></div>';
}

function timelineSection(){
  const { dated, undated } = timelineTasks();
  if (!dated.length && !undated.length) return { html: '<p class="empty">Nothing open on the list.</p>', n: 0 };
  const scale = timelineScale(dated);
  const byBucket = new Map();
  dated.forEach(row => {
    if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, []);
    byBucket.get(row.bucket).push(row);
  });
  let lanes = '';
  byBucket.forEach((rows, bucket) => {
    // Dragged rows carry a `tlrank` and sort by it; everything else falls
    // back to board order, same split Delegate uses for its own `rank`.
    const ranked = rows.filter(r => r.tlrank != null).sort((a, b) => a.tlrank - b.tlrank);
    const unranked = rows.filter(r => r.tlrank == null);
    lanes += timelineLaneHTML(bucket, ranked.concat(unranked), scale);
  });
  const body = dated.length
    ? '<div class="tlscroll"><div class="tlbody" style="--tllabelw:' + state.tlLabelWidth + 'px;--tldaypx:' + scale.dayPx + 'px" data-daypx="' +
        scale.dayPx + '">' + timelineHeaderHTML(scale) + lanes + '</div></div>' +
      timelineLegendHTML(Array.from(byBucket.values()).map(rows => rows[0].color))
    : '<p class="empty">Nothing with a date yet — everything open is in the tray below.</p>';
  // Every open top-level task, dated or not — the tray is part of the column,
  // not a footnote to it.
  return { html: body + timelineTrayHTML(undated), n: dated.length + undated.length };
}

/* The tray's cards drag the same way every board card does — same
   `dataTransfer`/`dragId` convention — but drop onto the scale instead of a
   tier, and the drop sets a date instead of a column. Wired after render,
   same as renderBoard wires its own card drag handlers. */
function wireTimelineDrag(){
  // The previous render's .tlbody, and whatever the hover line appended to
  // it, are already gone — drop the stale references rather than let
  // hideTlHoverLine() try to remove a node from a tree that no longer exists.
  tlHoverEl = null;
  tlHoverLabelEl = null;
  if (state.locked) return;
  const scroll = $('.tlscroll');
  $('#lists').querySelectorAll('.tltraycard').forEach(el => {
    el.ondragstart = e => {
      e.dataTransfer.setData('text/plain', el.dataset.tlid);
      e.dataTransfer.effectAllowed = 'move';
      dragId = el.dataset.tlid;
      hideTlHoverLine();
    };
    el.ondragend = () => { dragId = null; hideTlTargetLine(); hideTlPopover(); };
  });
  if (!scroll) return;
  const body = scroll.querySelector('.tlbody');
  // Same day math the drop handler below uses, run on every dragover instead
  // of only at drop — so the target line and the date popover track the
  // pointer the whole way across the scale, not just announce where it
  // landed after the fact.
  scroll.ondragover = e => {
    if (!dragId) return;
    e.preventDefault();
    const rect = body.getBoundingClientRect();
    const x = e.clientX - rect.left - state.tlLabelWidth;
    const scale = timelineScale(timelineTasks().dated);
    const dayN = Math.floor(x / scale.dayPx);
    showTlTargetLine(state.tlLabelWidth + (dayN + 0.5) * scale.dayPx);
    showTlPopover(e.clientX, e.clientY, dueLabel(ymd(addDays(scale.min, dayN))));
  };
  scroll.ondragleave = e => { if (!scroll.contains(e.relatedTarget)) { hideTlTargetLine(); hideTlPopover(); } };
  // The hover guide and the tray's own drop-target line answer the same
  // question — "which day is this" — so only one is ever on screen: a real
  // drag or an in-progress track click (tlTrackActive) suppresses this one.
  scroll.onpointermove = e => {
    if (dragId || tlReorderId || tlTrackActive) { hideTlHoverLine(); return; }
    const rect = body.getBoundingClientRect();
    const x = e.clientX - rect.left - state.tlLabelWidth;
    const scale = timelineScale(timelineTasks().dated);
    const dayN = Math.floor(x / scale.dayPx);
    if (x < 0 || e.clientY < rect.top || dayN < 0 || dayN > scale.days) { hideTlHoverLine(); return; }
    showTlHoverLine(scale, dayN);
  };
  scroll.onpointerleave = () => hideTlHoverLine();
  scroll.ondrop = e => {
    e.preventDefault();
    hideTlTargetLine();
    hideTlPopover();
    const id = e.dataTransfer.getData('text/plain') || dragId;
    const loc = id && locate(id);
    if (!loc) return;
    const rect = body.getBoundingClientRect();
    const x = e.clientX - rect.left - state.tlLabelWidth;
    const scale = timelineScale(timelineTasks().dated);
    const dayN = Math.floor(x / scale.dayPx);
    const date = addDays(scale.min, dayN);
    loc.task.due = ymd(date);
    loc.task.dirty = true;
    markDirty();
    refreshView();
  };

  wireTlResize(scroll);
  wireTlBarDrag();
  wireTlReorder();
  wireTlTrackClick();
}

/* The lane header's "Sort by date" button — a one-off, not a standing rule.
   Writes `tlrank` in earliest-date order (`start:` where it exists, else
   `due:`, both plain `YYYY-MM-DD` strings so a lexical compare is already a
   chronological one) across every dated task in that bucket, the same field
   a grip drag writes one row at a time (see wireTlReorder below). A later
   drag on any single row overwrites its own rank same as it always did —
   this does not lock the lane into staying date-ordered. */
function sortTimelineLane(bucket){
  if (state.locked) return;
  const rows = timelineTasks().dated.filter(r => r.bucket === bucket);
  const ranked = rows.slice().sort((a, b) => {
    const da = a.start || a.due, db = b.start || b.due;
    return da < db ? -1 : da > db ? 1 : 0;
  });
  ranked.forEach((row, i) => {
    const loc = locate(row.id);
    if (loc) { loc.task.tlrank = i; loc.task.dirty = true; }
  });
  markDirty();
  refreshView();
}

/* Dragging a row's label up or down writes a `tlrank` on every task in that
   lane, renumbered 0.. in the row's new visual order — the dedicated order
   timelineSection() reads back (see there). One lane at a time: rows outside
   the dragged one's own `.tllanegroup` never see its dragover, so a task can
   only be reordered against others in the same bucket, never moved to
   another one's lane by dropping into it.

   Reuses the board's own `dropLine`/`hideDropLine`, defined further down in
   this file, rather than a second floating divider — a plain div is a plain
   div whichever view asked for it, and the two views are never on screen at
   once. */
let tlReorderId = null;
function tlReorderRows(group){
  return Array.from(group.querySelectorAll(':scope > .tlrow[data-tlreorder]'));
}
function tlInsertAfterEl(group, clientY, skipId){
  let after = null;
  tlReorderRows(group).forEach(el => {
    if (el.dataset.tlreorder === skipId) return;
    const r = el.getBoundingClientRect();
    if (clientY > r.top + r.height / 2) after = el;
  });
  return after;
}
function wireTlReorder(){
  if (state.locked) return;
  $('#lists').querySelectorAll('.tllanegroup').forEach(group => {
    group.querySelectorAll('.tllabel[draggable]').forEach(label => {
      label.ondragstart = e => {
        tlReorderId = label.closest('.tlrow').dataset.tlreorder;
        e.dataTransfer.setData('text/plain', tlReorderId);
        e.dataTransfer.effectAllowed = 'move';
        hideTlHoverLine();
      };
      label.ondragend = () => { tlReorderId = null; hideDropLine(); };
    });
    group.ondragover = e => {
      if (!tlReorderId) return;
      e.preventDefault();
      if (!dropLine) { dropLine = document.createElement('div'); dropLine.className = 'dropline'; }
      const after = tlInsertAfterEl(group, e.clientY, tlReorderId);
      if (after) after.after(dropLine);
      else {
        const summary = group.querySelector(':scope > summary');
        if (summary) summary.after(dropLine); else group.prepend(dropLine);
      }
    };
    group.ondragleave = e => { if (!group.contains(e.relatedTarget)) hideDropLine(); };
    group.ondrop = e => {
      if (!tlReorderId) return;
      e.preventDefault();
      // Without this, the drop event bubbles up to .tlscroll's own ondrop
      // (wired in wireTimelineDrag for the undated tray), which reads the
      // same dataTransfer id and treats the reorder as a drop onto the
      // scale — overwriting the task's due date with whatever day sits
      // under the pointer.
      e.stopPropagation();
      const after = tlInsertAfterEl(group, e.clientY, tlReorderId);
      const before = tlReorderRows(group).map(el => el.dataset.tlreorder);
      const ids = before.slice();
      ids.splice(ids.indexOf(tlReorderId), 1);
      const at = after ? ids.indexOf(after.dataset.tlreorder) + 1 : 0;
      ids.splice(at, 0, tlReorderId);
      hideDropLine();
      tlReorderId = null;
      if (ids.join() === before.join()) return;          // dropped back where it started
      ids.forEach((id, i) => {
        const loc = locate(id);
        if (loc) { loc.task.tlrank = i; loc.task.dirty = true; }
      });
      markDirty();
      refreshView();
    };
  });
}

/* The grey hover guide — .tltoday's own line and label, but following the
   pointer instead of pinned to today, so the reader always knows exactly
   which day is under the cursor before clicking or dragging on a row's
   track. The label lives in the sticky header's track, the same place
   .tltodaylabel does, so it stays visible through a horizontal scroll; the
   line itself is a sibling of the rows, the same as .tltoday. Both are torn
   down and rebuilt against whatever .tlbody the current render made — see
   the reset at the top of wireTimelineDrag(). */
let tlHoverEl = null, tlHoverLabelEl = null;
function showTlHoverLine(scale, dayN){
  const body = $('.tlbody');
  if (!body) return;
  if (!tlHoverEl) {
    tlHoverEl = document.createElement('div');
    tlHoverEl.className = 'tlhoverline';
    body.appendChild(tlHoverEl);
  }
  tlHoverEl.style.left = (state.tlLabelWidth + (dayN + 0.5) * scale.dayPx) + 'px';
  const headerTrack = body.querySelector('.tlheader .tltrack');
  if (!headerTrack) return;
  if (!tlHoverLabelEl) {
    tlHoverLabelEl = document.createElement('span');
    tlHoverLabelEl.className = 'tlhoverlabel';
    headerTrack.appendChild(tlHoverLabelEl);
  }
  tlHoverLabelEl.style.left = ((dayN + 0.5) * scale.dayPx) + 'px';
  tlHoverLabelEl.textContent = dueLabel(ymd(addDays(scale.min, dayN)));
}
function hideTlHoverLine(){
  if (tlHoverEl) { tlHoverEl.remove(); tlHoverEl = null; }
  if (tlHoverLabelEl) { tlHoverLabelEl.remove(); tlHoverLabelEl = null; }
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

/* The vertical line shown while dragging an undated tray card across the
   scale — same idea as .tltoday/.tlweekline (a sibling of the rows, spanning
   every lane at once), but appended on demand rather than drawn by the
   template, since it only exists for the length of one drag. Reused across
   a drag's own dragover events rather than recreated on each one. */
let tlTargetEl = null;
function showTlTargetLine(left){
  const body = $('.tlbody');
  if (!body) return;
  if (!tlTargetEl) {
    tlTargetEl = document.createElement('div');
    tlTargetEl.className = 'tltarget';
    body.appendChild(tlTargetEl);
  }
  tlTargetEl.style.left = left + 'px';
}
function hideTlTargetLine(){ if (tlTargetEl) { tlTargetEl.remove(); tlTargetEl = null; } }

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
      // A handle sits inside its own .tlbar, which carries data-tldrag="move"
      // too — without this, the pointerdown a handle just handled keeps
      // bubbling, reaches the bar's own handler as well, and that second
      // handler's setPointerCapture() steals the pointer back off the
      // handle, so every resize drag was actually moving the whole bar.
      e.stopPropagation();
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

      hideTlHoverLine();
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

/* Click anywhere on a row's own track, outside the mark it already draws, to
   set its due date directly — no trip to the drawer for "give this a
   deadline". A click that moves before release sets start and due together,
   the two ends of a fresh bar, the same shape wireTlBarDrag's own "move"
   writes. A stopped drag under a few pixels is the click it probably was,
   same rule wireTlBarDrag uses for the same reason.

   Guarded against the marks .tlbar/.tlmilestone/.tlhandle already draw on
   top of the track — e.target.closest('[data-tldrag]') is true for any of
   them, and this hands off to wireTlBarDrag's own handler rather than
   fighting it for the same pointerdown. */
let tlTrackActive = false;
function wireTlTrackClick(){
  if (state.locked) return;
  $('#lists').querySelectorAll('.tlrow[data-tlreorder] .tltrack').forEach(track => {
    track.onpointerdown = e => {
      if (e.button) return;
      if (e.target.closest('[data-tldrag]')) return;
      const row = track.closest('.tlrow');
      const loc = locate(row.dataset.tlreorder);
      if (!loc) return;
      const t = loc.task;
      const scale = timelineScale(timelineTasks().dated);
      const trackRect = track.getBoundingClientRect();
      const beginDay = Math.floor((e.clientX - trackRect.left) / scale.dayPx);
      let moved = false, endDay = beginDay, ghost = null;
      tlTrackActive = true;
      hideTlHoverLine();
      track.setPointerCapture(e.pointerId);

      const move = ev => {
        if (!moved && Math.abs(ev.clientX - e.clientX) < 3) return;
        ev.preventDefault();
        moved = true;
        endDay = Math.floor((ev.clientX - trackRect.left) / scale.dayPx);
        const lo = Math.min(beginDay, endDay), hi = Math.max(beginDay, endDay);
        // The bar being drawn, live — the same shape the real one takes once
        // it lands, not just a popover promising it.
        if (!ghost) {
          ghost = document.createElement('div');
          ghost.className = 'tlbar tlghostbar';
          track.appendChild(ghost);
        }
        ghost.style.left = (lo * scale.dayPx) + 'px';
        ghost.style.width = (Math.max(1, hi - lo + 1) * scale.dayPx) + 'px';
        showTlPopover(ev.clientX, ev.clientY,
          dueLabel(ymd(addDays(scale.min, lo))) + ' → ' + dueLabel(ymd(addDays(scale.min, hi))));
      };
      const up = () => {
        track.removeEventListener('pointermove', move);
        hideTlPopover();
        if (ghost) { ghost.remove(); ghost = null; }
        tlTrackActive = false;
        if (moved) {
          const lo = Math.min(beginDay, endDay), hi = Math.max(beginDay, endDay);
          t.start = ymd(addDays(scale.min, lo));
          t.due = ymd(addDays(scale.min, hi));
        } else {
          t.due = ymd(addDays(scale.min, beginDay));
        }
        t.dirty = true;
        markDirty();
        refreshView();
      };
      track.addEventListener('pointermove', move);
      track.addEventListener('pointerup', up, { once:true });
      track.addEventListener('pointercancel', up, { once:true });
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

/* Overview, Matrix and Timeline draw their sections through the same Column
   every other column in the app is drawn with — a section here has always
   been a column of the list in everything but the furniture it was made of.
   `OverviewView`/`MatrixView`/`TimelineView` (kanban/ui/SectionsView.tsx) are
   the components since 14 Sep 2026; `renderSections()` below builds the data
   they draw from. Each still calls the section builders it always called —
   `bigRocksSection()`, `matrixSection()`, `timelineSection()` and the rest —
   and their `{ html, n }` (and, on Quick wins and Matrix, `sort`/`filters`)
   crosses as `{ __html }`, same as `PlanCard.summaryHTML`; porting the cards
   themselves is a separate job.

   The five titles and hints that used to be built here — 'Big rocks', 'High
   impact, L effort...' and the rest — are hardcoded in SectionsView.tsx now,
   since none of the eight across all three views ever varies. What still
   comes from here is only what does: the count, the body, whether an
   Overview section is open (overviewOpen(), unchanged — the toggle listener
   in 19-drawer.js that persists it reads data-column-collapse off the rendered
   <details> either way, string-built or React). */
let sectionsRoot = null;
function sectionsMountPoint(){
  const lists = $('#lists');
  if (!lists) return null;
  let host = lists.querySelector('#sectionsRoot');
  if (!host) {
    if (sectionsRoot) BoardUI.unmount(sectionsRoot);
    lists.innerHTML = '<div id="sectionsRoot"></div>';
    host = lists.querySelector('#sectionsRoot');
    sectionsRoot = host;
  }
  return host;
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
  const host = sectionsMountPoint();
  if (!host) return;

  // { html, n, sort, filters } is what every section builder above has always
  // returned; SectionBody (kanban/ui/SectionsView.tsx) spells the same four
  // things bodyHTML/count/sortHTML/filtersHTML, since a bare `html` or `n` on
  // a prop reads as a stray abbreviation once it is a name in a type rather
  // than a local convention read next to where it is built.
  const toBody = sec => ({
    bodyHTML: sec.html, count: sec.n != null ? sec.n : null,
    sortHTML: sec.sort, filtersHTML: sec.filters,
  });

  // mountFlushed(), not mount(): capMsgCards() below measures the real,
  // painted .ref .msg boxes, and wireTimelineDrag() arms native drag handlers
  // on elements that have to exist first. Neither is a prop a component could
  // take instead — see the note in kanban/ui/index.ts.
  if (viewId === 'overview') {
    const ctx = contextSection();
    // One section per column, left to right, the same way the board reads.
    BoardUI.mountFlushed(host, BoardUI.OverviewView({
      bigRocks: Object.assign(bigRocksSection(items), { open: overviewOpen('ov:Big rocks') }),
      thisWeek: Object.assign(weekSection(items), { open: overviewOpen('ov:This week') }),
      quickWins: Object.assign(quickSection(items), { open: overviewOpen('ov:Quick wins') }),
      delegate: Object.assign(delegateSection(items), { open: overviewOpen('ov:Delegate to Claude') }),
      // The only section with nothing to count — it is standing prose, not a
      // list of anything — so it is left out entirely rather than drawn empty.
      context: ctx ? Object.assign(ctx, { open: overviewOpen('ov:Context') }) : null,
      // Tasks finished and Written reports, the two columns that were the
      // Reports tab until 19 Sep 2026. Everything they draw from is built in
      // 12-reports.js, this file's only dealing with them (see
      // reportsColumnProps there).
      reports: reportsColumnProps(),
    }));
    // After the mount, not before it: the counted half needs nothing fetched,
    // so the row paints now and the written column fills in when /reports.json
    // lands. It is a no-op on every render but the first of a visit.
    ensureWrittenReports();
  } else if (viewId === 'matrix') {
    // The chain sits beside the matrix: both answer "what can I actually start",
    // one by score and one by what is still waiting on something else.
    BoardUI.mountFlushed(host, BoardUI.MatrixView({
      impactEffort: matrixSection(),
      dependencyChain: chainSection(items),
    }));
  } else if (viewId === 'timeline') {
    BoardUI.mountFlushed(host, BoardUI.TimelineView({ timeline: toBody(timelineSection()) }));
  }

  capMsgCards();
  if (viewId === 'timeline') wireTimelineDrag();
}

/* .ref .msg's three-line clamp is CSS, and CSS alone cannot tell a card that
   happens to run to exactly three lines from one three screens long — so once
   the cards are actually in the DOM, measure each one against its own scroll
   height and mark the ones truncation really cut. Only .capped gets the fade
   and the label; a card that fits gets neither. A clamped box reports the
   same way a height-capped one did: clientHeight is the three lines it shows,
   scrollHeight the whole text. */
function capMsgCards(){
  $('#lists').querySelectorAll('.ref .msg').forEach(el => {
    el.classList.toggle('capped', el.scrollHeight > el.clientHeight + 1);
  });
}

/* The tab strip. Board, Matrix and Timeline were folded behind one tab with a
   chevron opening a panel of the other two, until 22 Sep 2026 — unfolded back
   into three plain tabs since the strip has the room and a menu was a click
   spent finding what was already named on the tab underneath it. */
function renderViewTabs(defs){
  const tab = (d, attrs) => '<button class="tab' + (d.id === state.view ? ' on' : '') + '" ' +
    attrs + '>' + esc(d.label) + '</button>';

  $('#viewToggle').innerHTML = defs.map(d =>
    d.sep ? '<span class="tabsep"></span>' : tab(d, 'data-view="' + d.id + '"')
  ).join('');

  $('#viewToggle').querySelectorAll('[data-view]').forEach(b => {
    /* syncHash() before the render rather than after it: the write it makes
       has to land while location.hash still names the view being left, or
       there is nothing for Back to return to. renderView() reaches syncHash()
       again through renderTabs(), finds the URL already right and does
       nothing. */
    b.onclick = () => { state.view = b.dataset.view; syncHash(true); renderView(); };
  });
}

/* Which view the last renderView() drew, so arriving somewhere can be told
   from redrawing where you already are. Only the report list cares: it is
   re-read on arrival at Overview and not on every filter change there. */
let lastRenderedView = null;

/* Two views: the board, and the hand-written summaries from the end of the file.
   The bucket tabs and search only make sense on the board. */
function renderView(){
  // Up front, not at the end: the board case returns early, and the chip belongs
  // to the header rather than to any one view.
  updateArchiveChip();
  const defs = viewDefs();
  // Quick wins and Delegate to Claude are columns of Overview, and since
  // 19 Sep 2026 so are the two halves of Reports, so an old #quick, #delegate
  // or #reports link lands where its content actually lives.
  if (state.view === 'quick' || state.view === 'delegate' || state.view === 'reports') {
    state.view = 'overview';
  }
  // Plans was a view until 22 Sep 2026. A plan is read from the review behind it
  // now, on the card, so an old #plans link lands on the board.
  if (state.view === 'plans') state.view = 'board';
  const isBackups = state.view === 'backups';
  if (!isBackups && !defs.some(d => d.id === state.view)) state.view = 'board';
  const def = isBackups ? { id:'backups', label:'Backups' }
    : defs.find(d => d.id === state.view);
  const isBoard = def.id === 'board';
  // Keep the URL in step with whichever tab is on screen, so a refresh (or a
  // link back to this page) lands on the same view instead of the default.
  // syncHash() (07-render-board.js) does the actual write — every branch below
  // reaches it, via renderBoard() or renderFilterBar() calling renderTabs().
  // state.view is finalised above this point, so whichever branch runs next
  // syncs the URL to the right value.

  // Arriving at Overview, rather than redrawing it: ask for the report list
  // again, since a report Claude wrote while another tab was up would
  // otherwise never show. forgetWrittenReports() only clears the cache — the
  // fetch itself is ensureWrittenReports(), from renderSections().
  if (def.id === 'overview' && lastRenderedView !== 'overview') { forgetWrittenReports(); refreshOrphanPlans(); }
  lastRenderedView = def.id;

  renderViewTabs(defs);

  $('#board').classList.toggle('hidden', !isBoard);
  $('#lists').classList.toggle('hidden', isBoard);
  // renderColTabs() puts it back; nothing else on any other view wants it.
  if (!isBoard) $('#colTabs').classList.add('hidden');
  $('#backupsBtn').classList.toggle('on', isBackups);

  if (isBoard) { renderBoard(); return; }
  // The one thing bar is a board idea specifically — pinning a card above
  // columns that don't exist anywhere else has nothing to attach to. Every
  // other control in the header (the bucket tabs, the score chip, AI,
  // urgent, search) applies the same way wherever it's shown, so it stays up
  // on every tab rather than popping in and out as he switches between them.
  $('#headline').classList.add('hidden');
  if (def.id === 'projects') { renderFilterBar(); renderProjectsView(); return; }
  if (def.id === 'backups') { renderFilterBar(); renderBackupsView(); return; }
  renderSections(def.id);
}

/* Re-draw whichever view is on screen. The drawer opens from the lists as well
   as the board now, so an edit has to show up where it was made — renderBoard
   alone does nothing when a list view is up. */
function refreshView(){
  if (state.view === 'board') renderBoard();
  else if (state.view === 'projects') renderProjectsView();
  else if (state.view === 'backups') renderBackupsView();
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
  // Follows the strip it belongs to, and goes with it in a preview or the demo,
  // where the file behind it is not one that can be written to.
  $('#editBuckets').classList.toggle('hidden', state.locked);
}

/* The strip of column names above the board, phone only — which one is on
   screen and how many there are, neither of which a snapped one-column-wide
   board says on its own. Names rather than dots: a dot says where you are in
   the sequence, and the thing that is missing is which column that is. Six
   names do not fit across 400px, so the strip scrolls horizontally itself and
   the lit one is scrolled into view with the column it names.

   Drawn at every width and hidden by CSS above 640px — a width check here
   would be a second breakpoint to keep in step with board.css's. */
function renderColTabs(columns){
  const strip = $('#colTabs');
  if (!strip) return;
  strip.classList.remove('hidden');
  strip.innerHTML = columns.map((name, i) =>
    '<button type="button" class="coltab' + (i === 0 ? ' on' : '') +
    '" data-coli="' + i + '">' + esc(tierLabel(name)) + '</button>').join('');

  const main = $('#main');
  const tabs = Array.from(strip.querySelectorAll('.coltab'));
  const cols = () => Array.from($('#board').children);

  const light = i => {
    tabs.forEach((t, j) => t.classList.toggle('on', j === i));
    const on = tabs[i];
    if (on) on.scrollIntoView({ inline:'nearest', block:'nearest' });
  };
  /* Nearest left edge rather than scrollLeft divided by a column's width: the
     columns are one width today and the arithmetic would be wrong the moment
     that stops being true, and a measurement costs nothing at six columns. */
  const current = () => {
    const list = cols();
    if (!list.length) return 0;
    let best = 0, dist = Infinity;
    list.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - main.scrollLeft);
      if (d < dist) { dist = d; best = i; }
    });
    return best;
  };

  tabs.forEach((t, i) => {
    t.onclick = () => {
      const c = cols()[i];
      if (c) c.scrollIntoView({ inline:'start', block:'nearest', behavior:'smooth' });
      light(i);
    };
  });
  /* One listener, replaced on every render rather than added to — renderBoard
     runs on every edit and addEventListener would stack them up. */
  main.onscroll = () => light(current());
  light(current());
}

function renderBoard(){
  if (state.view !== 'board') return;
  renderFilterBar();
  renderHeadline();
  const board = $('#board');
  const shown = shownBuckets();
  const many = shown.length > 1;

  const columns = boardColumns();
  board.style.setProperty('--cols', columns.length);
  const data = columns.map(name => {
    const isDone = name === DONE_COL;
    const mode = sortMode(name);
    let entries = [];
    shown.forEach(bucket => {
      const color = bucketColor(bucket.name, state.doc.buckets.indexOf(bucket));
      const label = many ? bucket.name : '';
      if (isDone) {
        /* Its own heading now, so this reads the tier like any other. What the
           tick moves there is setDone()'s job, and gatherDone() in core/todo.js
           does the same for a file written before that was true. */
        const tier = bucket.tiers.find(t => t.name === DONE_COL);
        if (tier) tier.tasks.forEach(t => {
          if (matches(t, DONE_COL)) entries.push({ t, color, label });
        });
      } else {
        const tier = bucket.tiers.find(t => t.name === name);
        if (tier) tier.tasks.forEach(t => {
          if (!t.done && matches(t, name)) entries.push({ t, color, label });
        });
      }
    });
    // Stable: equal scores keep the order he put them in, so the sort only ever
    // answers the question it was asked.
    if (mode === 'priority') {
      entries = entries.map((e, i) => ({ e, i }))
        .sort((a, b) => (priorityScore(b.e.t) - priorityScore(a.e.t)) || (a.i - b.i))
        .map(x => x.e);
    }
    const cards = entries.map(e => ({
      model: cardModel(e.t, { muted: name === WAIT_COL, tier: name }),
      stripe: e.color,
      bucketLabel: e.label,
      draggable: !state.locked
    }));

    /* No hint on the board since 12 Sep 2026. TIER_HINT is still the source of
       the sentence — the tier editor shows it, and the Plans view's own
       descriptions are the same idea — but on the board the six column names
       carry their own meaning and the subtitle beside each was saying it a
       second time in smaller type.

       The pencil the head carries, one per column, since 19 Sep 2026. The
       sheet behind it is the one that was reached from the filter bar until
       the button there was hidden — comparative questions need every column
       in front of you — so this opens the same sheet rather than a per-column
       menu, and scrolls to the row for the column it was clicked on. Not on
       Done, which is not a row in it, and not on a locked board, which can
       write nothing. */
    return {
      // What it is called on screen; `name` stays the heading everything else
      // matches by, and is what data-tier and every lookup still use.
      tier: name,
      title: tierLabel(name),
      className: ((isDone ? 'donecol ' : '') +
                  (name === WAIT_COL ? 'waitcol ' : '') + (mode === 'priority' ? 'sorted' : '')).trim(),
      note: (n => n ? n + ' your move' : '')(entries.filter(e => !e.t.done && yourMove(e.t)).length),
      sort: isDone ? null : mode,
      canEdit: !(isDone || state.locked),
      canAdd: !(isDone || state.locked),
      cards
    };
  });

  /* Flushed, because what follows reads the columns this just drew: the phone's
     tab strip measures their offsets, and every caller that opens a card or
     checks a count straight after a render expects it to be there. */
  BoardUI.mountFlushed(board, BoardUI.h(BoardUI.BoardView, {
    columns: data,
    locked: state.locked,
    onOpen: id => openDrawer(id),
    onDragStart: (e, id) => {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
      dragId = id;
    },
    onDragEnd: () => { dragId = null; },
    /* Says where the drop line goes, and nothing else: a sub-step drag is not a
       card, and a sorted column has no gap to drop into because its order is
       worked out. Either way the column still lights up as a valid target. The
       line reads the same cards dropTask() does — only same-bucket ones count,
       since a card can only be reordered against its own bucket's list — so it
       always marks the place the card actually goes. */
    onZoneOver: (e, tier) => {
      e.preventDefault();
      if (subDrag !== null || sortMode(tier) === 'priority') return null;
      const from = dragId ? locate(dragId) : null;
      const after = insertAfterEl(e.currentTarget, e.clientY, from ? from.bucket : null, dragId);
      return after ? after.dataset.id : '';
    },
    onZoneDrop: (e, tier) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || dragId;
      if (id) dropTask(id, tier, e.currentTarget, e.clientY);
    },
    onAdd: tier => addTask(tier),
    onEdit: tier => openTierEditor(tier),
    onSort: tier => {
      setSortMode(tier, sortMode(tier) === 'priority' ? 'manual' : 'priority');
      renderBoard();
    }
  }));

  renderColTabs(columns);
}

/* The intake queue. Counts across every bucket whatever the tabs say, because
   a task with no scores is not in a bucket's flow yet — it is waiting to enter
   one. Clicking it shows exactly those. */
function renderScoreChip(){
  const chip = $('#scoreChip');
  if (!state.doc) { chip.classList.add('hidden'); return; }
  let n = 0;
  state.doc.buckets.forEach(b => b.tiers.forEach(ti => ti.tasks.forEach(t => {
    if (!t.done && unscored(t)) n++;
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
  zone.querySelectorAll('.tenon-card').forEach(el => {
    if (el.classList.contains('dragging') || el.dataset.id === skipId) return;
    const other = locate(el.dataset.id);
    if (!other || (dragBucket && other.bucket !== dragBucket)) return;
    const r = el.getBoundingClientRect();
    if (clientY > r.top + r.height / 2) after = el;
  });
  return after;
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

  // Dropping on Done ticks the task, and setDone() moves it under the heading.
  if (tierName === DONE_COL) {
    const msg = blockedMessage(allItems(), loc.task.blockedBy);
    if (msg) { showToast(msg, 'blocked'); return; }
    if (setDone(loc.task, true)) { markDirty(); refreshView(); }
    if (state.openTask === id) openDrawer(id);
    return;
  }
  // A column says where the card is, never who has it, so a drop leaves
  // `[to::]` alone.
  setDone(loc.task, false, { stay: true });       // dragged back out of Done

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
  const tier = ensureTier(defaultAddBucket(), tierName);
  const t = { id: uid(), done:false, title:'New task', bold:true, impact:'', effort:'', due:'', to:'',
              urgent:false, week:false, slug:'', blockedBy:[], rank:null, extra:[], body:[], raw:'', dirty:true };
  tier.tasks.push(t);
  markDirty(); refreshView(); openDrawer(t.id, true);
}

/* Taking work back off Claude has to take the prompt with it.
   Delegate to Claude is generated from `[to:: Implement agent]`, so a task
   taken back drops out of that list — but the prompt written for it would
   stay behind on the task, still reading as an instruction to hand it over. The
   next person to rebuild the section would have a prompt with nothing asking for
   it. A sub-step delegated in its own right is left alone, because it did not
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
      inherits = !agentOf(readField(m[3], 'to'));          // not an agent's in its own right, so it follows the parent
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

