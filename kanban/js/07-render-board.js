'use strict';

/* =========================================================================
   4. Render board
   ========================================================================= */

function matches(t, tierName){
  // Scoring a task he has already finished is busywork, so done ones never
  // count as needing it however they are tagged.
  if (state.unscoredOnly && (t.done || !unscored(t))) return false;
  const q = state.query.trim().toLowerCase();
  if (!q) return true;
  return (t.title + ' ' + t.body.join(' ')).toLowerCase().indexOf(q) > -1;
}

function allMode(){ return state.bucketFilter.size === 0; }
/* Where a new task lands. Deliberately not derived from which bucket tabs
   happen to be toggled on any more — once several can be on at once there is
   no single one of them to infer a card's home from, so this always means
   the same thing regardless of the filter: the first bucket in the file,
   the same fallback every ambiguous case already used before multi-select
   existed. See addTask() in 18-timeline.js, its only caller. */
function defaultAddBucket(){
  return state.doc.buckets[0];
}
/* A bucket name in the URL, lowercased and despaced — "Design System" becomes
   design-system. Not the name itself: spaces and punctuation are legal in a
   bucket name and illegal-looking in a URL, and two different buckets could
   still slugify the same way, so this is a best-effort match on load, never
   the thing state.bucketFilter actually stores. */
function slugifyBucket(name){
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function bucketBySlug(slug){
  return (state.doc && state.doc.buckets.find(b => slugifyBucket(b.name) === slug)) || null;
}
/* The URL's bucket segment, both ways. 'all' when nothing is toggled on,
   otherwise every toggled bucket's slug, comma-joined — a plain string, not
   the array-of-slugs shape browsers use for repeated query params, since this
   is one path segment rather than a query string (see syncHash's own note on
   why a fragment, not `?`). bucketFilterFromSlugs is used both on load and on
   a live hashchange, so the two ways a URL can set this filter can't drift
   into reading it two different ways. */
function bucketNamesToSlug(names){
  return names.size ? [...names].map(slugifyBucket).join(',') : 'all';
}
function bucketFilterFromSlugs(raw){
  const names = new Set();
  if (!raw || raw === 'all') return names;
  raw.split(',').forEach(slug => {
    const b = bucketBySlug(slug);
    if (b) names.add(b.name);
  });
  return names;
}
/* Keeps the URL's view+bucket+task segments in step with state —
   #<view>/<slug>!task=<key> — called from renderTabs() so every render and
   every bucket-tab click reaches it, and directly from
   openDrawer()/closeDrawer() (19-drawer.js), since opening or closing the
   panel doesn't otherwise trigger a re-render of the board underneath it.

   The task half is read off state.openTask fresh on every call rather than
   cached, so it tracks the drawer rather than surviving past it — see the
   fragment note in 02-state.js. `!chat=` still gets dropped the moment it's
   acted on; only the task panel is "open" in a sense worth remembering.
   Never the hash setter, which fires hashchange and would loop with the
   listener in 25-archiving.js. */

/* True while that listener is putting the board back where Back asked for it.
   A restore re-opens a card and re-draws the view, and both of those are calls
   that would otherwise push an entry of their own — so the one press would
   leave two entries behind and Back would stop going anywhere. */
let restoringHash = false;

/* `push` is what leaves an entry in the browser's history rather than
   overwriting the one there, and only the moves that are really a new place
   pass it: switching view, opening a card, opening a project. Closing the
   drawer is that same navigation backwards rather than a new place, and a
   bucket-filter chip would leave an entry per press, so both overwrite.

   pushState fires no hashchange either, so the loop replaceState was picked to
   avoid is no argument against it. */
function syncHash(push){
  const withBucket = !!state.doc;
  const openLoc = state.openTask && state.doc && locate(state.openTask);
  const hash = '#' + state.view +
    (withBucket ? '/' + bucketNamesToSlug(state.bucketFilter) : '') +
    (openLoc ? '!task=' + encodeTaskKey(taskKey(openLoc.task)) : '');
  if (location.hash === hash) return;
  if (push && !restoringHash) history.pushState(null, '', hash);
  else history.replaceState(null, '', hash);
}
/* Which buckets the board draws. An empty bucket filter (nothing toggled on
   means All) and the unscored queue both widen it from whichever buckets are
   toggled on. Scoring is an intake job: what needs a score in
   Strategic matters as much as what needs one in People. */
function shownBuckets(){
  return (state.unscoredOnly || allMode())
    ? state.doc.buckets
    : state.doc.buckets.filter(b => state.bucketFilter.has(b.name));
}

function renderTabs(){
  const wrap = $('#bucketFilters');
  const openIn = b => b.tiers.reduce((m, t) => m + t.tasks.filter(x => !x.done && matches(x, t.name)).length, 0);
  const total = state.doc.buckets.reduce((m, b) => m + openIn(b), 0);
  const all = '<button class="tab taball' + (allMode() ? ' on' : '') + '" data-bucket="' + ALL_BUCKETS + '"' +
    ' title="every bucket at once" aria-pressed="' + allMode() + '">All' +
    '<span class="n">' + total + '</span></button>';
  wrap.innerHTML = all + state.doc.buckets.map((b, i) => {
    const on = state.bucketFilter.has(b.name);
    return '<button class="tab' + (on ? ' on' : '') + '" data-bucket="' + esc(b.name) + '"' +
      ' title="open tasks — click to toggle, several can be on at once" aria-pressed="' + on + '"' +
      ' style="--bc:' + bucketColor(b.name, i) + '">' +
      '<i class="dot"></i>' + esc(b.name) + '<span class="n">' + openIn(b) + '</span></button>';
  }).join('');
  // Toggled independently, same as the Status pills: All clears the set,
  // anything else adds or removes just itself rather than replacing the
  // whole value the way a single-select tab strip would.
  wrap.querySelectorAll('.tab').forEach(el => {
    el.onclick = () => {
      const name = el.dataset.bucket;
      if (name === ALL_BUCKETS) state.bucketFilter.clear();
      else if (state.bucketFilter.has(name)) state.bucketFilter.delete(name);
      else state.bucketFilter.add(name);
      renderTabs(); refreshView();
    };
  });
  $('#editBuckets').onclick = openBucketEditor;
  $('#editTiers').onclick = openTierEditor;
  syncHash();
}

