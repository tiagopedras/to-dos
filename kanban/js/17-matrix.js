'use strict';

/* =========================================================================
   4c. The matrix: impact against effort
   Tier one drawn as a grid rather than a sorted column. Nine cells, impact up
   the side, effort across the bottom, so the eye reads the shape of the whole
   list at once: how much sits in the expensive corner, whether the cheap
   high-impact cell is actually empty.

   A card per task will not fit — nine cells across one screen means roughly a
   thumbnail each — so a task is one dot, coloured by its bucket. The title is on
   hover and a click opens it, which keeps the grid scannable while losing
   nothing: everything is still one gesture from the real task.
   ========================================================================= */

/* Two tiers say something the scores cannot. A Backlog task has been parked on
   purpose, so however cheap and high impact it is, it is not what he should
   start today — and left on the grid it lands in "Do these first" and argues
   with the decision he already made. It comes off the grid entirely, into its
   own tray, where it is still one click from the card. Quick wins uses the
   same tier for the same reason: Backlog is not a real priority, so it is left
   out there too, not just muted.

   Waiting review is the softer case: the work is done and someone else has it.
   It belongs on the grid, since it still costs what it costs, but the dot is
   faded the way a done card is faded on the board. Anything blocked by an
   unfinished task is faded for the same reason — the grid can rank it, but he
   cannot start it. */
const HELD_TIER  = 'Backlog';
const MATRIX_MUTED_TIER = 'Waiting review';

const MATRIX_IMPACT = ['high', 'med', 'low'];      // top row down
const MATRIX_EFFORT = ['S', 'M', 'L'];             // left column across
const EFFORT_HINT = { S: 'under half a day', M: 'one to three days', L: 'a week or more' };

/* What each cell means, said plainly. The corner cells are the only two that
   need no explanation, and the middle is where lists quietly rot, so it gets the
   bluntest label. */
const CELL_ADVICE = {
  'high/S': 'Do these first',
  'high/M': 'Worth the time',
  'high/L': 'Protect time, or break down',
  'med/S':  'Clear in a gap',
  'med/M':  'Fine, not urgent',
  'med/L':  'Ask for a smaller version',
  'low/S':  'Batch or hand over',
  'low/M':  'Probably not worth it',
  'low/L':  'Cut these'
};

/* No `title` attribute. The browser's own tooltip would appear next to the
   floating preview a second later, saying a worse version of the same thing.
   aria-label still carries it for anyone not using a pointer. */
function matrixDot(t, color){
  const di = dueInfo(t.due);
  const label = [
    t.title,
    t.bucket + ' · ' + t.tierName,
    t.blocked ? 'blocked' : '',
    di ? 'due ' + di.label + (di.note ? ', ' + di.note : '') : 'no date'
  ].filter(Boolean).join(', ');
  return '<button class="mdot' + (t.headline ? ' hl' : '') + (t.urgent ? ' urgent' : '') +
    (t.muted ? ' muted' : '') +
    '" data-open="' + t.id + '" style="--bc:' + color + '"' +
    ' aria-label="' + esc(label) + '"></button>';
}

/* ---- Hover preview ----
   The dot says where a task sits, not what it is. Rather than a tooltip that
   paraphrases the card, this shows the card itself — the same cardHTML the board
   renders — so hovering a dot answers the same question as looking at the board.

   Fixed position and appended to the body, because the grid sits inside a
   scrolling column and an absolutely positioned child would be clipped by it.
   pointer-events:none throughout, so the preview can never sit between the
   cursor and the dot it describes and swallow the click. */
/* The lazy-singleton-element part both hover previews below share — created
   once, appended to the body rather than wherever the hovered dot or point
   happens to sit, since both live inside a scrolling column that would clip
   an absolutely positioned child. */
function makePreviewEl(cls){
  const el = document.createElement('div');
  el.className = cls;
  el.setAttribute('aria-hidden', 'true');
  document.body.appendChild(el);
  return el;
}
let mPreviewEl = null;
/* Pinned by a click rather than shown by a pointer. A touch screen never hovers,
   so until 15 Sep 2026 a tap on a dot opened the drawer and the preview never
   appeared at all — the only way to find out what a dot was, was to open it.
   One rule at every width instead: a click or a tap shows the preview, and the
   preview carries the control that opens the task. Hover still previews on a
   desktop, so the only thing that changes there is that opening a task is a
   click on the card rather than on the dot. */
let mPinned = false;

function matrixPreview(){ return mPreviewEl || (mPreviewEl = makePreviewEl('mpreview')); }

function showMatrixPreview(dot, pin){
  const loc = locate(dot.dataset.open);
  if (!loc) return;
  // A hover must not take a pinned preview off the dot it was pinned to.
  if (mPinned && !pin) return;
  const el = matrixPreview();
  const color = bucketColor(loc.bucket.name, state.doc.buckets.indexOf(loc.bucket));
  const where = loc.bucket.name + ' · ' + (loc.task.done ? DONE_COL : loc.tier.name);
  el.innerHTML = cardHTML(loc.task, color, where, { static: true, muted: loc.tier.name === WAIT_COL, tier: loc.tier.name }) +
    (pin ? '<button type="button" class="mopen">Open this task</button>' : '');
  el.classList.toggle('pinned', !!pin);
  // Inert while it is only a hover preview, so it cannot intercept a click
  // meant for whatever is underneath it.
  el.setAttribute('aria-hidden', pin ? 'false' : 'true');
  if (pin) {
    mPinned = true;
    const btn = el.querySelector('.mopen');
    if (btn) btn.onclick = () => { unpinMatrixPreview(); openDrawer(dot.dataset.open); };
  }
  el.classList.add('on');
  placeMatrixPreview(dot);
}

function unpinMatrixPreview(){
  mPinned = false;
  if (mPreviewEl) { mPreviewEl.classList.remove('on', 'pinned'); mPreviewEl.setAttribute('aria-hidden', 'true'); }
}
/* Beside the dot, flipping to the other side rather than running off the edge,
   and never taller than the window allows. */
function placeMatrixPreview(dot){
  const el = mPreviewEl;
  if (!el) return;
  const r = dot.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, gap = 12, edge = 8;
  let left = r.right + gap;
  if (left + w > window.innerWidth - edge) left = r.left - gap - w;
  left = Math.max(edge, Math.min(left, window.innerWidth - w - edge));
  let top = r.top + r.height / 2 - h / 2;
  top = Math.max(edge, Math.min(top, window.innerHeight - h - edge));
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
}
function hideMatrixPreview(){ if (!mPinned && mPreviewEl) mPreviewEl.classList.remove('on'); }

/* ---- Weekly pace hover popover ----
   Same shape as the Matrix's own hover preview just above — a single fixed
   element, reused rather than rebuilt on every point, positioned fresh each
   time it is shown. The content is read straight off the point's own data
   attributes, written once when the chart was drawn. */
let tPreviewEl = null;
function trendPreview(){ return tPreviewEl || (tPreviewEl = makePreviewEl('tpreview')); }
/* Two lines can cross the same value in the same week, which stacks their
   hit targets exactly on top of each other — cx/cy are computed from the
   same week index and the same value, so a real tie lands on the same
   coordinates rather than merely close ones. Rather than showing whichever
   circle happened to be drawn last (topmost under the pointer), find every
   .trendpt at that exact point and list them all. */
function showTrendPreview(pt){
  const el = trendPreview();
  const svg = pt.closest('svg');
  const cx = pt.getAttribute('cx'), cy = pt.getAttribute('cy');
  const here = svg
    ? [...svg.querySelectorAll('.trendpt')].filter(p => p.getAttribute('cx') === cx && p.getAttribute('cy') === cy)
    : [pt];
  el.innerHTML = here.map(p => {
    const count = +p.dataset.trendcount;
    return '<div class="tprow" style="--bc:' + esc(p.dataset.trendcolor) + '"><i></i>' + esc(p.dataset.trendlabel) + '</div>' +
      '<div class="tpcount"><strong>' + count + '</strong> task' + (count === 1 ? '' : 's') +
        ', week of ' + esc(p.dataset.trendweek) + '</div>';
  }).join('');
  el.classList.add('on');
  placeTrendPreview(pt);
}
/* Above the point by default — a tooltip reads as pointing at what it is
   about, and below would sit over the line and the point it just left. Only
   drops beneath when there is no room above. */
function placeTrendPreview(pt){
  const el = tPreviewEl;
  if (!el) return;
  const r = pt.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, gap = 10, edge = 8;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(edge, Math.min(left, window.innerWidth - w - edge));
  let top = r.top - gap - h;
  if (top < edge) top = r.bottom + gap;
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
}
function hideTrendPreview(){ if (tPreviewEl) tPreviewEl.classList.remove('on'); }

/* Top-level tasks only. Sub-steps carry no impact or effort of their own, so
   they have no position here — placing them under their parent's scores would
   double-count the same piece of work. Done tasks are left out: this is a tool
   for deciding what is next, not a record of what happened. */
function matrixTasks(){
  const items = allItems();
  const out = [];
  // Same bucket tabs as the board. Blocker lookups still resolve against the
  // full, unfiltered items above — a blocker sitting in a bucket that is
  // currently hidden is still real and still done or not, so only which dots
  // get drawn is scoped, not what they're allowed to depend on.
  const shownNames = new Set(shownBuckets().map(b => b.name));
  state.doc.buckets.forEach((b, bi) => {
    if (!shownNames.has(b.name)) return;
    const color = bucketColor(b.name, bi);
    b.tiers.forEach(tier => tier.tasks.forEach(t => {
      if (t.done || !matches(t, tier.name)) return;
      const it = items.find(i => i.id === t.id && !i.sub);
      const blocked = !!it && !actionable(items, it);
      const waiting = tier.name === MATRIX_MUTED_TIER;
      out.push({ id: t.id, title: t.title, impact: t.impact, effort: t.effort,
                 due: t.due, ai: t.ai, urgent: t.urgent, headline: !!t.headline,
                 bucket: b.name, tierName: tier.name, color,
                 held: tier.name === HELD_TIER,
                 blocked,
                 waiting,
                 muted: waiting || blocked });
    }));
  });
  return out;
}

function matrixSection(){
  const all = matrixTasks();
  const hideWaiting = state.matrixHideWaiting;
  const hiddenWaiting = hideWaiting ? all.filter(t => t.waiting).length : 0;
  const visible = hideWaiting ? all.filter(t => !t.waiting) : all;
  const held = visible.filter(t => t.held);
  const tasks = visible.filter(t => !t.held);
  const placed = tasks.filter(t => IMPACT_N[t.impact] && EFFORT_N[t.effort]);
  const missing = tasks.filter(t => !IMPACT_N[t.impact] || !EFFORT_N[t.effort]);

  /* The legend says what the dots mean; the checkbox says which of them are
     drawn. Since 12 Sep 2026 only the first is in the body — narrowing what a
     column shows is the column header's Filters slot, the same slot Plans'
     dropdown and Reports' window picker sit in, so it goes back with the
     section rather than inside it. */
  const legend = '<div class="mlegend">' +
    '<span class="mkey mkeyhl"><i></i>the one thing</span>' +
    '<span class="mkey mkeyurg"><i></i>urgent</span>' +
    '<span class="mkey mkeymuted"><i></i>waiting or blocked</span>' +
  '</div>';
  const filters = '<label class="mxfilter"><input type="checkbox" data-mxfilter' +
    (hideWaiting ? ' checked' : '') + '> Hide Waiting review</label>';

  let grid = '<div class="mgrid">' +
    '<div class="mcorner">' +
      '<span class="maxis">Effort →</span>' +
      '<span class="maxis">↓ Impact</span>' +
    '</div>' +
    MATRIX_EFFORT.map(e => '<div class="mhead">' + esc(e) +
      '<span class="mhint">' + esc(EFFORT_HINT[e]) + '</span></div>').join('');

  MATRIX_IMPACT.forEach(imp => {
    grid += '<div class="mside">' + esc(imp) + '</div>';
    MATRIX_EFFORT.forEach(eff => {
      const key = imp + '/' + eff;
      const inCell = placed.filter(t => t.impact === imp && t.effort === eff);
      const score = IMPACT_N[imp] / EFFORT_N[eff];
      grid += '<div class="mcell' + (key === 'high/S' ? ' first' : '') +
          (inCell.length ? '' : ' empty') + '" data-score="' + score.toFixed(2) + '"' +
          ' style="--w:' + score.toFixed(2) + '">' +
        '<div class="mcellhead">' +
          '<span class="madvice">' + esc(CELL_ADVICE[key]) + '</span>' +
          '<span class="mcount">' + inCell.length + '</span>' +
        '</div>' +
        '<div class="mdots">' + inCell.map(t => matrixDot(t, t.color)).join('') + '</div>' +
      '</div>';
    });
  });
  grid += '</div>';

  const tray = missing.length
    ? '<div class="mtray"><div class="mtrayhead">' +
        '<strong>' + missing.length + ' not on the matrix</strong>' +
        '<span>Missing an impact or an effort score, so they have no position. ' +
        'Click one to score it.</span></div>' +
        '<div class="mdots">' + missing.map(t => matrixDot(t, t.color)).join('') + '</div>' +
      '</div>'
    : '';

  const holdTray = held.length
    ? '<div class="mtray mhold"><div class="mtrayhead">' +
        '<strong>' + held.length + ' in ' + esc(HELD_TIER) + '</strong>' +
        '<span>Parked on purpose, so they are kept off the grid however they ' +
        'score. Move one out of ' + esc(HELD_TIER) + ' and it takes its ' +
        'cell.</span></div>' +
        '<div class="mdots">' + held.map(t => matrixDot(t, t.color)).join('') + '</div>' +
      '</div>'
    : '';

  const total = placed.length;
  /* Counted on what he could pick up today. A high impact, cheap task that is
     waiting on a review or on another task is not a place to start, so it is
     left out of the advice even though its dot is still in the cell. */
  const cheapWins = placed.filter(t => t.impact === 'high' && t.effort === 'S' && !t.muted).length;
  const cut = placed.filter(t => t.impact === 'low' && t.effort === 'L').length;
  const heavy = placed.filter(t => t.effort === 'L').length;
  const waiting = placed.filter(t => t.muted).length;
  let read = '';
  if (total) {
    const bits = [];
    bits.push(cheapWins
      ? '<strong>' + cheapWins + '</strong> high impact and cheap — start there'
      : 'nothing is both high impact and cheap right now');
    bits.push('<strong>' + heavy + '</strong> of ' + total + ' need a week or more');
    if (cut) bits.push('<strong>' + cut + '</strong> in the cut corner');
    if (waiting) bits.push('<strong>' + waiting + '</strong> waiting or blocked');
    read = '<p class="mread">' + bits.join(' · ') + '</p>';
  }

  const hiddenNote = hiddenWaiting
    ? '<p class="mhidden">' + hiddenWaiting + ' hidden, sitting in Waiting review.</p>'
    : '';

  /* Counted on the grid rather than on the list behind it: the two trays under
     it say their own numbers, and a head count that included them would be a
     number matching nothing visible in the cells. */
  return { html: legend + read + hiddenNote + grid + tray + holdTray, n: placed.length, filters };
}

