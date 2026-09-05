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
}

