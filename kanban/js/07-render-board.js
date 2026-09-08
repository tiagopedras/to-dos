'use strict';

/* =========================================================================
   4. Render board
   ========================================================================= */

function matchesAi(t){
  const f = state.aiFilter;
  if (!f) return true;
  if (f === 'ai') return t.ai === 'full' || t.ai === 'partial';
  return t.ai === f;
}
/* tierName is optional — every call site that knows which column a task is
   in (the board's own render, Matrix, Timeline) passes it; one that doesn't
   (search suggestions, reports, anywhere a task is checked outside a
   per-column loop) just gets no status narrowing, the same as before this
   filter existed. */
function matches(t, tierName){
  if (!matchesAi(t)) return false;
  if (state.urgentFilter && !(t.urgent || t.due)) return false;
  if (state.statusFilter.size && tierName != null && !state.statusFilter.has(tierName)) return false;
  // Scoring a task he has already finished is busywork, so done ones never
  // count as needing it however they are tagged.
  if (state.unscoredOnly && (t.done || !unscored(t))) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return (t.title + ' ' + t.body.join(' ')).toLowerCase().indexOf(q) > -1;
}

function allMode(){ return state.activeBucket === ALL_BUCKETS; }
function activeBucket(){
  return state.doc.buckets.find(b => b.name === state.activeBucket) || state.doc.buckets[0];
}
/* A bucket name in the URL, lowercased and despaced — "Design System" becomes
   design-system. Not the name itself: spaces and punctuation are legal in a
   bucket name and illegal-looking in a URL, and two different buckets could
   still slugify the same way, so this is a best-effort match on load, never
   the thing state.activeBucket actually stores. */
function slugifyBucket(name){
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function bucketBySlug(slug){
  return (state.doc && state.doc.buckets.find(b => slugifyBucket(b.name) === slug)) || null;
}
/* Keeps the URL's view+bucket+task segments in step with state —
   #<view>/<slug>!task=<key> — called from renderTabs() so every render and
   every bucket-tab click reaches it, from renderView() so a view change with
   no filter bar (canvas) still updates the URL, and directly from
   openDrawer()/closeDrawer() (19-drawer.js), since opening or closing the
   panel doesn't otherwise trigger a re-render of the board underneath it.
   Writing the view alone for canvas is deliberate: it has no bucket tabs, so
   #canvas/all would claim a filter that isn't there.

   The task half is read off state.openTask fresh on every call rather than
   cached, so it tracks the drawer rather than surviving past it — see the
   fragment note in 02-state.js. `!chat=` still gets dropped the moment it's
   acted on; only the task panel is "open" in a sense worth remembering.
   replaceState, not the hash setter: no history entry, no hashchange, so this
   can't loop with the listener in boot.js. */
function syncHash(){
  const withBucket = state.doc && state.view !== 'canvas';
  const openLoc = state.openTask && state.doc && locate(state.openTask);
  const hash = '#' + state.view +
    (withBucket ? '/' + (allMode() ? 'all' : slugifyBucket(activeBucket().name)) : '') +
    (openLoc ? '!task=' + encodeTaskKey(taskKey(openLoc.task)) : '');
  if (location.hash !== hash) history.replaceState(null, '', hash);
}
/* Which buckets the board draws. The AI filter cuts across every bucket, and so
   do the urgent/due filter, the All tab and the unscored queue, so any of them
   widens it from the single active bucket. Scoring is an intake job: what
   needs a score in Strategic matters as much as what needs one in People. */
function shownBuckets(){
  return (state.aiFilter || state.urgentFilter || allMode() || state.unscoredOnly) ? state.doc.buckets : [activeBucket()];
}

function renderTabs(){
  const wrap = $('#bucketFilters');
  const openIn = b => b.tiers.reduce((m, t) => m + t.tasks.filter(x => !x.done && matches(x, t.name)).length, 0);
  const total = state.doc.buckets.reduce((m, b) => m + openIn(b), 0);
  const all = '<button class="tab taball' + (allMode() ? ' on' : '') + '" data-bucket="' + ALL_BUCKETS + '"' +
    ' title="every bucket at once" aria-pressed="' + allMode() + '">All' +
    '<span class="n">' + total + '</span></button>';
  wrap.innerHTML = all + state.doc.buckets.map((b, i) => {
    const on = !allMode() && b === activeBucket();
    return '<button class="tab' + (on ? ' on' : '') + '" data-bucket="' + esc(b.name) + '"' +
      ' title="open tasks" aria-pressed="' + on + '" style="--bc:' + bucketColor(b.name, i) + '">' +
      '<i class="dot"></i>' + esc(b.name) + '<span class="n">' + openIn(b) + '</span></button>';
  }).join('');
  wrap.querySelectorAll('.tab').forEach(el => {
    el.onclick = () => { state.activeBucket = el.dataset.bucket; renderTabs(); refreshView(); };
  });
  $('#editBuckets').onclick = openBucketEditor;
  $('#editTiers').onclick = openTierEditor;
  syncHash();
}

/* Status filter — the tier/column half of "narrow across every bucket",
   alongside AI can do and Urgent/due. A dropdown rather than the row of pill
   tabs the bucket strip uses above it, because the column list can run to
   six or more names and the pills were wrapping the bar to a second and
   third line — reuses the header's own .dropdown/.dropdown-panel/.dropdown-item
   shape (see the Data menu and the drawer's Bucket field) rather than
   inventing a second popover component. Still multi-select: state.statusFilter
   is a Set, and a task counts as shown when the set is empty (no narrowing
   yet) or contains the tier it's actually sitting in — see matches()'s
   optional second argument. Picking an option doesn't close the panel, since
   picking a second and third is the point. */
function renderStatusFilters(){
  const btn = $('#statusFilterBtn');
  const menu = $('#statusFilterMenu');
  if (!btn || !menu) return;
  const cols = boardColumns();
  const active = state.statusFilter;
  const label = !active.size ? 'All'
    : active.size === 1 ? [...active][0]
    : active.size + ' columns';
  btn.textContent = label + ' ▾';
  btn.classList.toggle('on', active.size > 0);
  btn.setAttribute('aria-pressed', String(active.size > 0));
  const all = '<button type="button" class="dropdown-item statusopt' + (!active.size ? ' on' : '') +
    '" role="menuitemcheckbox" aria-checked="' + !active.size + '" data-status="">All columns</button>';
  menu.innerHTML = all + cols.map(name => {
    const on = active.has(name);
    return '<button type="button" class="dropdown-item statusopt' + (on ? ' on' : '') + '" role="menuitemcheckbox"' +
      ' aria-checked="' + on + '" data-status="' + esc(name) + '"><i class="dot"></i>' + esc(name) + '</button>';
  }).join('');
}

/* One delegated handler for the whole dropdown, rather than binding fresh on
   every renderStatusFilters() call — the panel is rebuilt each time the
   filter changes, so anything bound directly to its buttons would need
   rebinding right after. Mirrors the Bucket field's dropdown in
   19-drawer.js: toggle open on the button, act and stay open on an option
   (multi-select), close on any other click. */
document.addEventListener('click', e => {
  const btn = e.target.closest('#statusFilterBtn');
  const menu = $('#statusFilterMenu');
  if (btn) {
    const open = menu.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', String(open));
    return;
  }
  const opt = e.target.closest('#statusFilterMenu [data-status]');
  if (opt) {
    const key = opt.dataset.status;
    if (!key) state.statusFilter.clear();
    else if (state.statusFilter.has(key)) state.statusFilter.delete(key); else state.statusFilter.add(key);
    renderStatusFilters();
    refreshView();
    return;
  }
  if (menu && !menu.classList.contains('hidden') && !e.target.closest('#statusFilterField')) {
    menu.classList.add('hidden');
    $('#statusFilterBtn').setAttribute('aria-expanded', 'false');
  }
});

