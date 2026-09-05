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
function matches(t){
  if (!matchesAi(t)) return false;
  if (state.urgentFilter && !(t.urgent || t.due)) return false;
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
/* Keeps the URL's view+bucket segment in step with state — #<view>/<slug> —
   called from renderTabs() so every render and every bucket-tab click reaches
   it, and from renderView() so a view change with no filter bar (canvas) still
   updates the URL. Writing the view alone for canvas is deliberate: it has no
   bucket tabs, so #canvas/all would claim a filter that isn't there. This is
   also what drops a `!task=`/`!chat=` once it has been acted on — see the
   fragment note in 02-state.js — same as before this had a bucket segment at
   all. replaceState, not the hash setter: no history entry, no hashchange, so
   this can't loop with the listener in boot.js. */
function syncHash(){
  const withBucket = state.doc && state.view !== 'canvas';
  const hash = '#' + state.view + (withBucket ? '/' + (allMode() ? 'all' : slugifyBucket(activeBucket().name)) : '');
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
  const openIn = b => b.tiers.reduce((m, t) => m + t.tasks.filter(x => !x.done && matches(x)).length, 0);
  const total = state.doc.buckets.reduce((m, b) => m + openIn(b), 0);
  const all = '<button class="tab taball' + (allMode() ? ' on' : '') + '" data-bucket="' + ALL_BUCKETS + '"' +
    ' title="every bucket at once" aria-pressed="' + allMode() + '">All' +
    '<span class="n">' + total + '</span></button>';
  wrap.innerHTML = all + state.doc.buckets.map((b, i) => {
    const on = !allMode() && b === activeBucket();
    return '<button class="tab' + (on ? ' on' : '') + '" data-bucket="' + esc(b.name) + '"' +
      ' title="open tasks" aria-pressed="' + on + '" style="--bc:' + BUCKET_COLOR[i % BUCKET_COLOR.length] + '">' +
      '<i class="dot"></i>' + esc(b.name) + '<span class="n">' + openIn(b) + '</span></button>';
  }).join('');
  wrap.querySelectorAll('.tab').forEach(el => {
    el.onclick = () => { state.activeBucket = el.dataset.bucket; renderTabs(); refreshView(); };
  });
  $('#editBuckets').onclick = openBucketEditor;
  $('#editTiers').onclick = openTierEditor;
  syncHash();
}

