'use strict';

/* =========================================================================
   4b2. Reports — what the file says about work that is already finished.

   Every other view answers "what should I do next". This one answers "what got
   done", which is the question that comes up in a one-to-one or a quarterly
   review and has never had an answer here that did not mean counting by hand.

   Read straight from state.doc, the same as every other view: nothing is
   fetched, nothing is stored, and a report of a backup preview describes that
   backup rather than the live file. Adding a second report means writing one
   more report*Report() that returns HTML and listing it in reportDefs().
   ========================================================================= */

/* Fixed choices rather than a free "since" date — this counts recent output,
   and each option answers "how am I doing lately" at a different grain. The
   30-day default is the one archiving also leaves alone (see the note in
   completedByCategoryReport), so it can never be quietly wrong about its own
   period. Past that, completedRecently() reads the archive to fill in the
   older end, which is what makes 60 and 90 trustworthy rather than a guess —
   90 is a quarter, close enough for the question a quarterly review actually
   asks. "This week" is the calendar week — Monday to today, not a rolling
   seven days — because that is the question Monday standup answers. */
/* `short` is what the row of buttons shows and `label` is its title: seven
   full labels do not fit beside the date range on a half-width card, and the
   range printed next to them says in full what the short one means. */
const REPORT_WINDOWS = [
  { id:'week', label:'This week',    short:'Week' },
  { id:'7',    label:'Past 7 days',  short:'7d',  days:7 },
  { id:'15',   label:'Past 15 days', short:'15d', days:15 },
  { id:'30',   label:'Past 30 days', short:'30d', days:30 },
  { id:'60',   label:'Past 60 days', short:'60d', days:60 },
  { id:'90',   label:'Past 90 days', short:'90d', days:90 },
  /* No window at all: everything the file and the archive between them still
     remember. Last in the list because it is the one that stops answering "how
     am I doing lately" and starts answering "how much is there", which is a
     different question and a slower one — it always reads the archive. */
  { id:'all',  label:'All',          short:'All' }
];
const REPORT_WINDOW_KEY = 'todo-board-report-window';
function readReportWindow(){
  try {
    const saved = localStorage.getItem(REPORT_WINDOW_KEY);
    return REPORT_WINDOWS.some(w => w.id === saved) ? saved : '30';
  } catch (e) { return '30'; }
}
let reportWindow = readReportWindow();
/* Returns whether it actually changed, so the caller knows whether a
   re-render is worth doing. */
function setReportWindow(id){
  if (reportWindow === id || !REPORT_WINDOWS.some(w => w.id === id)) return false;
  reportWindow = id;
  try { localStorage.setItem(REPORT_WINDOW_KEY, id); } catch (e) {}
  return true;
}
function reportWindowStart(){
  if (reportWindow === 'all') return new Date(0);
  if (reportWindow === 'week') {
    const dow = (today().getDay() + 6) % 7;   // Monday = 0
    return new Date(today() - dow * 86400000);
  }
  const def = REPORT_WINDOWS.find(w => w.id === reportWindow);
  return new Date(today() - (def ? def.days : 30) * 86400000);
}
/* A function rather than a const, for two reasons: it depends on the picker
   above, and ARCHIVE_DAYS is declared further down the file, so a const
   reading either one up here would be evaluated before they exist. */
function reportDays(){
  /* Infinity rather than a large number, so every `age > days` comparison down
     the file lets everything through without anyone having to pick a ceiling —
     and so `> ARCHIVE_DAYS` is true, which is what pulls the archive in. */
  if (reportWindow === 'all') return Infinity;
  return Math.round((today() - reportWindowStart()) / 86400000);
}
/* "This week" reads oddly re-said as "the last 3 days" on a Wednesday, so the
   two kinds of window get their own phrasing everywhere the count is put into
   a sentence. */
function reportWindowPhrase(){
  if (reportWindow === 'all') return 'at any point';
  return reportWindow === 'week' ? 'this week' : 'in the last ' + reportDays() + ' days';
}
/* What the total calls its own period. A bare noun phrase, not the sentence
   fragment above: it is set off by a middot rather than run into the words
   around it, because no single preposition works for "this week", "the last 30
   days" and "all time" at once. */
function reportWindowLabel(){
  if (reportWindow === 'all') return 'all time';
  if (reportWindow === 'week') return 'this week';
  return 'the last ' + reportDays() + ' days';
}

function reportDefs(){
  return [completedByCategoryReport, recentAccomplishmentsReport, weeklyTrendReport];
}

/* "27 Aug" — the year is noise inside a 30 day window. */
function reportDay(iso){
  const d = parseDue(iso);
  return d ? d.toLocaleDateString(undefined, { day:'numeric', month:'short' }) : iso;
}

/* ---- Reading past the archive point ----

   Finished work older than ARCHIVE_DAYS can be lifted out of todo.md into
   data/backups/done-archive.md (see "Archiving finished work" further down).
   A window longer than that used to just say so and stop — the older end of
   the count was whatever hadn't been archived yet, which is not a count at
   all. The archive is the same task-line grammar as todo.md, grouped under
   "### Bucket · Tier" headings instead of nested columns, so it is parsed
   with the same parseTask() rather than a second parser.

   Fetched once and cached: the file only grows when Archive is actually used,
   which is rare enough that a stale cache is not a real risk, and the archive
   invalidates its own cache when that happens (see runArchive). */
let archiveEntries = null;             // null until the first fetch resolves
let archiveEntriesPromise = null;
let archiveEntriesError = false;

function parseArchiveEntries(text){
  const out = [];
  let bucketName = '', tierName = '';
  text.replace(/\r\n?/g, '\n').split('\n').forEach(line => {
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      const parts = h3[1].split(' · ');
      bucketName = (parts[0] || '').trim();
      tierName = (parts[1] || '').trim();
      return;
    }
    if (!TASK_RE.test(line)) return;
    const t = parseTask([line]);
    if (t.done && t.doneOn) out.push({ bucketName, tierName, title: t.title, doneOn: t.doneOn, effort: t.effort });
  });
  return out;
}

function invalidateArchiveEntries(){
  archiveEntries = null;
  archiveEntriesPromise = null;
  archiveEntriesError = false;
}

/* Returns the cached list once loaded, otherwise kicks off the one fetch and
   returns null. onReady is called when that fetch settles, so the caller can
   re-render — the same lazy pattern renderWrittenReports uses for report
   bodies. */
function archiveEntriesSync(onReady){
  if (archiveEntries) return archiveEntries;
  if (!archiveEntriesPromise) {
    archiveEntriesPromise = fetch('/data/backups/done-archive.md?t=' + Date.now(), { cache:'no-store' })
      .then(res => res.ok ? res.text() : Promise.reject(res.status))
      .then(text => { archiveEntries = parseArchiveEntries(text); })
      .catch(() => { archiveEntries = []; archiveEntriesError = true; })
      .then(onReady);
  }
  return null;
}

/* Every ticked, dated task inside the window, kept with the bucket and tier it
   was in so the breakdown does not need a second walk of the document. Once
   the window reaches past ARCHIVE_DAYS, archived work is merged in too — see
   above — so "sorted newest first" still means the whole period, not just
   whatever is still sitting in todo.md. */
function completedRecently(){
  const out = [];
  const days = reportDays();
  if (state.doc) state.doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t => {
    if (!t.done || !t.doneOn) return;
    const age = daysSince(t.doneOn);
    if (age == null || age < 0 || age > days) return;
    out.push({ bucketName:b.name, tierName:tier.name, title:t.title, doneOn:t.doneOn, taskId:t.id, effort:t.effort, age });
  })));
  if (days > ARCHIVE_DAYS) {
    const entries = archiveEntriesSync(() => renderCountedReports());
    (entries || []).forEach(e => {
      const age = daysSince(e.doneOn);
      if (age == null || age < 0 || age > days) return;
      out.push({ bucketName:e.bucketName, tierName:e.tierName, title:e.title, doneOn:e.doneOn, taskId:null, effort:e.effort, age });
    });
  }
  return out.sort((x, y) => x.age - y.age);
}

/* Ticked but undated. These are real finished work that the count cannot claim,
   because without a date there is no way to say which month it belongs to — so
   they are reported as a gap rather than folded in or ignored. */
function undatedDoneCount(){
  let n = 0;
  if (!state.doc) return n;
  state.doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t => {
    if (t.done && !t.doneOn) n++;
  })));
  return n;
}

/* One finished task as a row: the date it was ticked, its title, and a chip on
   the right saying where it sits. Both reports that list tasks rather than
   count them draw their rows through here, so the live-versus-archived branch
   below is written once and a row reads the same whichever report it is in.

   An archived task has no live id to open the drawer with, so it renders as
   plain text instead of a button. */
function doneRowHTML(it, color, chip, chipClass){
  return '<li style="--bc:' + color + '">' +
      '<span class="dt">' + esc(reportDay(it.doneOn)) + '</span>' +
      (it.taskId
        ? '<button class="tt" data-open="' + it.taskId + '" title="Open this task">' + mdInline(it.title) + '</button>'
        : '<span class="tt archived" title="Archived — no longer in todo.md">' + mdInline(it.title) + '</span>') +
      '<span class="where' + (chipClass ? ' ' + chipClass : '') + '">' + esc(chip) + '</span>' +
    '</li>';
}

/* The bucket a finished task was in, in the board's own colour. Anything the
   list no longer has a bucket for — an archived entry whose bucket has since
   been renamed or removed — is greyed rather than dropped, the same as in
   weeklyTrendReport. */
function reportBucketColor(name){
  const i = state.doc ? state.doc.buckets.findIndex(b => b.name === name) : -1;
  return i > -1 ? bucketColor(name, i) : 'var(--ink-faint)';
}

function completedByCategoryReport(){
  const list = completedRecently();

  // Every bucket appears, including the empty ones. A bucket with nothing in it
  // is a finding, and dropping it would hide that. Matched by name rather than
  // by object identity so an archived entry, which has no live bucket to point
  // at, groups the same way a task still in todo.md does.
  const rows = state.doc.buckets.map((b, i) => ({
    name: b.name,
    color: bucketColor(b.name, i),
    items: list.filter(it => it.bucketName === b.name)
  }));
  const total = list.length;
  const most = rows.reduce((m, r) => Math.max(m, r.items.length), 0);

  const rowHTML = r => {
    const n = r.items.length;
    const pct = total ? Math.round(n / total * 100) : 0;
    const width = most ? (n / most * 100) : 0;
    const scored = r.items.filter(it => EFFORT_N[it.effort]);
    const pts = scored.reduce((sum, it) => sum + EFFORT_N[it.effort], 0);
    /* Effort points beside the count, so three L tasks stop reading the same as
       three S ones. The same S/M/L → 1/2/3 the impact-against-effort sort uses,
       and deliberately not called time: nothing in the file records how long a
       task took, so the size tag is the only weight there is to read.

       Three things it can honestly say. Nothing finished: no effort either way.
       Tasks finished but none of them sized: "untagged", because a bare 0 next
       to a count of 3 reads as work that cost nothing rather than work nobody
       scored. Otherwise the sum, with the title saying how much of the bucket
       it is actually made of — a partial sum is still an undercount. */
    let effortCell;
    if (!n) {
      effortCell = '<span class="ef">—</span>';
    } else if (!scored.length) {
      effortCell = '<span class="ef untagged" title="No effort tag on any of these ' + n +
        ' tasks, so there is nothing to add up">untagged</span>';
    } else {
      effortCell = '<span class="ef" title="' + pts + ' effort point' + (pts === 1 ? '' : 's') +
        ', from ' + scored.length + ' of ' + n + ' task' + (n === 1 ? '' : 's') +
        ' — S counts 1, M 2, L 3">' + pts + ' pt' + (pts === 1 ? '' : 's') + '</span>';
    }
    // The "where" chip says Done for every row rather than it.tierName — Done
    // is not a section in the file, it is the tick box on the task (see
    // setDone/dropTask), so a ticked task keeps whatever tier it was last
    // dragged into and it.tierName would show that raw tier instead. Every
    // task in this report is done by construction, so the live board's own
    // convention (t.done ? DONE_COL : tier.name) is what belongs here too.
    const tasks = r.items.map(it => doneRowHTML(it, r.color, DONE_COL)).join('');
    return '<div class="bkgroup">' +
        '<div class="row' + (n ? '' : ' zero') + '" style="--bc:' + r.color + '">' +
          '<span class="bkname"><i></i>' + esc(r.name) + '</span>' +
          '<span class="bar"><span style="width:' + width.toFixed(1) + '%"></span></span>' +
          '<span class="n">' + n + '</span>' +
          effortCell +
          '<span class="pct">' + (total ? pct + '%' : '—') + '</span>' +
        '</div>' +
        (n ? '<details><summary>Show the ' + n + ' task' + (n === 1 ? '' : 's') + '</summary>' +
             '<ul class="done">' + tasks + '</ul></details>' : '') +
      '</div>';
  };

  return '<h2>Completed</h2>' +
    '<div class="total"><span class="totaln">' + total + '</span>' +
      '<span class="totall">task' + (total === 1 ? '' : 's') + ' finished across ' +
      state.doc.buckets.length + ' categor' + (state.doc.buckets.length === 1 ? 'y' : 'ies') +
      ' <span class="totalw">' + esc(reportWindowLabel()) + '</span></span></div>' +
    (total ? rows.map(rowHTML).join('')
           : '<div class="empty">Nothing has been ticked off with a date ' +
             reportWindowPhrase() + '.</div>');
}

/* ---- Recent accomplishments ----

   The same finished tasks the report above lists, read the other way round.
   Grouped by bucket, each list sits behind its own closed <details>, so
   reading what actually got done means opening every non-empty bucket in
   turn — and what a status update or a one-to-one needs is the list itself,
   in the order the work happened. So: one flat list, newest first, with the
   bucket as a chip on each row rather than as the grouping.

   It folds, and starts closed. A month of finished work runs long enough to
   push the report under it off the screen, and this tab is read for the counts
   above far more often than for the list itself — so the summary carries the
   number and the list opens on a click when that number needs explaining.

   No second walk of the document and no second fetch. completedRecently() has
   already merged the live file with the archive and sorted the result newest
   first, and the Show picker above is the same one every report here reads. */
function recentAccomplishmentsReport(){
  const list = completedRecently();
  const n = list.length;
  return '<h2>Recent accomplishments</h2>' +
    '<p class="help listlead">Everything ticked off ' + reportWindowPhrase() +
      ', newest first — the same tasks counted above, flat and in one place.</p>' +
    (n
      ? '<details class="whole">' +
          '<summary>' + n + ' task' + (n === 1 ? '' : 's') + '</summary>' +
          '<ul class="done flat">' +
            list.map(it => doneRowHTML(it, reportBucketColor(it.bucketName), it.bucketName, 'bk')).join('') +
          '</ul>' +
        '</details>'
      : '<div class="empty">Nothing has been ticked off with a date ' +
        reportWindowPhrase() + '.</div>');
}

/* The one description of what every report on this tab counts and how
   complete it is — right under the panel's own heading, same shape as the
   Written reports column beside it: a headline, then what it means, then the
   content. Lives here rather than inside completedByCategoryReport() because
   it is true of the reports under it too, not just the first one — they all
   read the same `done:` dates and reach into the same archive. */
function countedLeadHTML(){
  const undated = undatedDoneCount();
  // Below 30 days this window sits inside the one archiving leaves alone, so the
  // count is a complete picture by construction. Past it, completeness depends
  // on the archive fetch above: still loading, failed, or in and merged.
  let archiveNote;
  if (reportDays() <= ARCHIVE_DAYS) {
    archiveNote = 'Finished work older than ' + ARCHIVE_DAYS + ' days can be archived out of todo.md. This window ' +
      'stays inside that, so every count below is the whole story for the period.';
  } else if (archiveEntriesError) {
    archiveNote = 'This window reaches past the ' + ARCHIVE_DAYS + '-day point where finished work moves to the ' +
      'archive, and that file could not be read — so the older end of these counts may be incomplete.';
  } else if (archiveEntries === null) {
    archiveNote = 'Reading the archive for finished work older than ' + ARCHIVE_DAYS + ' days…';
  } else {
    archiveNote = 'This window reaches past the ' + ARCHIVE_DAYS + '-day point where finished work moves to ' +
      '`data/backups/done-archive.md` — counted below too, so these counts still cover the whole period.';
  }
  const notes = [
    'Only tasks carrying a `done:` date are counted. The board writes that date when ' +
    'a task is ticked, so anything ticked before that was added is invisible below.',
    archiveNote
  ];
  if (undated) notes.unshift('<strong>' + undated + ' ticked task' + (undated === 1 ? ' has' : 's have') +
    ' no date</strong>, so ' + (undated === 1 ? 'it is' : 'they are') + ' missing from every count below.');
  return notes.map(n => '<p class="help listlead">' + n + '</p>').join('');
}

/* ---- Weekly pace ----

   A count for one window says how much moved. It says nothing about whether
   that is more or less than usual, and reconstructing that by memory or by
   digging out old reports is exactly the kind of arithmetic this view exists
   to do instead. Complete weeks, Monday to Sunday.

   Tied to the picker above like every other report on this tab, so the whole
   tab always describes one period rather than two. The picker counts in days
   (or the calendar week); this chart counts in weeks, so its span is that
   picker's window rounded up to whole weeks — "Past 30 days" becomes 5 weeks,
   not a slice of a 6th. Reaches past ARCHIVE_DAYS by construction, so it
   reads the archive the same way completedRecently() does.

   "All" has no day count to round up — reportDays() returns Infinity for it,
   which would hand weekBuckets() an infinite loop — so it falls back to the
   width this chart used before it was tied to the picker at all. */
function trendWeeks(){
  if (reportWindow === 'all') return 8;
  return Math.max(1, Math.ceil(reportDays() / 7));
}

/* Which buckets the key has switched off. In memory only: it is a way of
   looking at the chart for a moment, not a setting worth keeping. */
const trendHidden = new Set();

function weekBuckets(n){
  const dow = (today().getDay() + 6) % 7;              // Monday = 0
  const thisMonday = new Date(today() - dow * 86400000);
  const out = [];
  for (let i = n - 1; i >= 0; i--){
    const start = new Date(thisMonday.getTime() - i * 7 * 86400000);
    out.push({ start, end: new Date(start.getTime() + 6 * 86400000) });
  }
  return out;
}

/* Every ticked, dated task's finish date across the trend's own lookback,
   live and archived alike, kept with the bucket it was in — a bar says how
   many, hovering it says which. */
function trendEntries(){
  const from = weekBuckets(trendWeeks())[0].start;
  const out = [];
  if (state.doc) state.doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t => {
    if (!t.done || !t.doneOn) return;
    const d = parseDue(t.doneOn);
    if (d && d >= from) out.push({ date: d, bucketName: b.name });
  })));
  if (Math.round((today() - from) / 86400000) > ARCHIVE_DAYS) {
    const entries = archiveEntriesSync(() => renderCountedReports());
    (entries || []).forEach(e => {
      const d = parseDue(e.doneOn);
      if (d && d >= from) out.push({ date: d, bucketName: e.bucketName });
    });
  }
  return out;
}

function weeklyTrendReport(){
  const weeks = weekBuckets(trendWeeks());
  const entries = trendEntries();
  // Bucket order and colour match the board's own, so a bucket reads the same
  // colour here as everywhere else. An archived bucket that no longer exists
  // still needs somewhere to go, so anything unmatched is appended, greyed.
  const bucketOrder = state.doc ? state.doc.buckets.map(b => b.name) : [];
  const colorOf = name => {
    const i = bucketOrder.indexOf(name);
    return i > -1 ? bucketColor(name, i) : 'var(--ink-faint)';
  };

  const weekData = weeks.map(w => {
    const inWeek = entries.filter(e => e.date >= w.start && e.date <= w.end);
    const counts = new Map();
    inWeek.forEach(e => counts.set(e.bucketName, (counts.get(e.bucketName) || 0) + 1));
    const order = bucketOrder.filter(n => counts.has(n))
      .concat([...counts.keys()].filter(n => !bucketOrder.includes(n)));
    return {
      start: w.start, end: w.end, total: inWeek.length,
      breakdown: order.map(n => ({ name: n, n: counts.get(n), color: colorOf(n) }))
    };
  });


  /* One series per bucket, each week's count read back out of that week's
     breakdown. Buckets that no longer exist in the list still finished work in
     this window, so any name the weeks turned up that the board no longer has
     is kept on the end rather than dropped. */
  const seriesNames = bucketOrder.concat(
    [...new Set(weekData.flatMap(w => w.breakdown.map(b => b.name)))].filter(n => !bucketOrder.includes(n))
  );
  const series = seriesNames.map(name => ({
    name, color: colorOf(name), hidden: trendHidden.has(name),
    values: weekData.map(w => (w.breakdown.find(b => b.name === name) || { n: 0 }).n)
  }));
  const shown = series.filter(s => !s.hidden);

  /* Every number on this report counts the buckets currently switched on, not
     all of them. The key hides a line from the chart, and a headline total or a
     pace sentence still describing the hidden ones would contradict the picture
     directly above it. Before the total existed the pace line quietly did that;
     it does not now. */
  const counts = weekData.map((w, i) => shown.reduce((a, sr) => a + sr.values[i], 0));
  const hiddenN = series.length - shown.length;

  const n = weekData.length;
  const W = 700, H = 190, top = 12, base = H - 6;       // viewBox units, scaled to the card's width
  const peak = Math.max(1, ...shown.map(s => Math.max(...s.values)));
  const col = W / n;
  const cx = i => col * (i + 0.5);
  const cy = v => base - (v / peak) * (base - top);
  const f = x => x.toFixed(1);

  /* Both control points sit on the vertical midline between the two weeks
     they join, which keeps every curve inside the pair of values it connects.
     A smooth line can then never dip below zero or invent a peak no week had —
     the shape is decoration, the numbers under it are not. The line runs flat
     out to both edges so the chart fills its box rather than floating in it. */
  const curve = vals => {
    let d = 'M0,' + f(cy(vals[0])) + 'L' + f(cx(0)) + ',' + f(cy(vals[0]));
    for (let i = 1; i < n; i++){
      const mx = f((cx(i - 1) + cx(i)) / 2);
      d += 'C' + mx + ',' + f(cy(vals[i - 1])) + ' ' + mx + ',' + f(cy(vals[i])) +
        ' ' + f(cx(i)) + ',' + f(cy(vals[i]));
    }
    return d + 'L' + W + ',' + f(cy(vals[n - 1]));
  };

  const grid = weekData.map((w, i) =>
    '<line class="trendgrid" x1="' + f(cx(i)) + '" y1="' + top + '" x2="' + f(cx(i)) + '" y2="' + base + '"/>'
  ).join('');
  // Each band fades out downwards so overlapping ones stay readable through
  // each other, which a flat fill at any opacity does not.
  const defs = shown.map((s, i) =>
    '<linearGradient id="tgrad' + i + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' + s.color + '" stop-opacity=".42"/>' +
      '<stop offset="1" stop-color="' + s.color + '" stop-opacity="0"/>' +
    '</linearGradient>').join('');
  const bands = shown.map((s, i) => {
    const d = curve(s.values);
    return '<path d="' + d + 'L' + W + ',' + base + 'L0,' + base + 'Z" fill="url(#tgrad' + i + ')"/>' +
      '<path class="trendline" d="' + d + '" stroke="' + s.color + '">' +
        '<title>' + esc(s.name) + '</title></path>';
  }).join('');
  /* One point per week per line, on top of the bands: a small dot to see, and
     a bigger transparent circle round it to actually hover — a 3px target is
     real but not a fair one. showTrendPreview reads the count and the week
     straight off these rather than re-deriving them, the same way matrixDot's
     aria-label is written once at render time rather than looked up on hover. */
  const points = shown.map(s =>
    s.values.map((v, i) => {
      const x = f(cx(i)), y = f(cy(v));
      return '<circle class="trenddot" cx="' + x + '" cy="' + y + '" r="2.5" fill="' + s.color + '"/>' +
        '<circle class="trendpt" cx="' + x + '" cy="' + y + '" r="9" tabindex="0"' +
        ' data-trendlabel="' + esc(s.name) + '" data-trendcolor="' + s.color + '"' +
        ' data-trendcount="' + v + '" data-trendweek="' + esc(reportDay(ymd(weekData[i].start))) + '"' +
        ' aria-label="' + esc(s.name) + ', ' + v + ' task' + (v === 1 ? '' : 's') +
        ', week of ' + esc(reportDay(ymd(weekData[i].start))) + '"></circle>';
    }).join('')
  ).join('');

  const chart = '<svg class="trendchart" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
      'aria-label="Tasks finished per week, one line per bucket">' +
      '<defs>' + defs + '</defs>' + grid + bands + points +
      '<line class="trendbase" x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '"/>' +
    '</svg>' +
    '<div class="trendx">' + weekData.map((w, i) =>
      '<div class="trendxc' + (i === n - 1 ? ' current' : '') + '">' +
        '<span class="trendwk">' + esc(reportDay(ymd(w.start))) + '</span>' +
        '<span class="trendn">(' + counts[i] + ')</span>' +
      '</div>').join('') + '</div>' +
    '<div class="trendkey">' + series.map(s =>
      '<button class="tkey' + (s.hidden ? ' off' : '') + '" data-trendkey="' + esc(s.name) + '" ' +
        'style="--bc:' + s.color + '" aria-pressed="' + !s.hidden + '" ' +
        'title="Show or hide this bucket"><i></i>' + esc(s.name) + '</button>').join('') + '</div>';

  // Split the run in half and compare the two halves' averages, rather than
  // just the last week against the first — one quiet Friday should not read
  // as a slowdown. A window that rounds up to a single week has no "before"
  // half to compare against, so it gets its own sentence instead of a
  // comparison against nothing.
  let pace;
  if (weeks.length < 2) {
    pace = 'Just this one week in view — widen "Show" above to see whether the pace is climbing or slowing.';
  } else {
    const half = Math.ceil(weeks.length / 2);
    const recentAvg = counts.slice(-half).reduce((a, b) => a + b, 0) / half;
    const earlierN = weeks.length - half;
    const earlierAvg = counts.slice(0, earlierN).reduce((a, b) => a + b, 0) / earlierN;
    if (recentAvg === 0 && earlierAvg === 0) {
      pace = 'Nothing finished with a date across these ' + weeks.length + ' weeks.';
    } else if (recentAvg > earlierAvg * 1.15) {
      pace = 'Climbing — the last ' + half + ' weeks are ahead of the ' + earlierN + ' before them.';
    } else if (recentAvg < earlierAvg * 0.85) {
      pace = 'Slowing — the last ' + half + ' weeks are behind the ' + earlierN + ' before them.';
    } else {
      pace = 'Flat — the last ' + half + ' weeks are close to the ' + earlierN + ' before them.';
    }
  }
  if (hiddenN) pace += ' ' + hiddenN + ' bucket' + (hiddenN === 1 ? ' is' : 's are') +
    ' hidden, so every number here counts only the rest.';

  return '<h2>Weekly pace</h2>' +
    '<p class="help listlead">Tasks finished per week, Monday to Sunday, over the last ' +
      weeks.length + ' week' + (weeks.length === 1 ? '' : 's') +
      ', one line per bucket. The number under each week is its total.</p>' +
    '<div class="trend">' + chart + '</div>' +
    '<p class="note">' + esc(pace) + '</p>';
}

/* ---- Written reports ----

   The counted report above is arithmetic: it can only ever say how many. A
   written report says what moved and what it means, which is a judgement and so
   has to be written rather than derived.

   They are Markdown files in data/reports/, listed by the server at
   /reports.json. Kept as files rather than inside todo.md because a report is
   finished the day it is written, and the list is not — mixing the two would
   mean editing history every time a task changes. data/ rather than anywhere
   else, because a report about this list names people and internal decisions.

   The rules for writing one are in the README, under Reports. The short version
   is that a report never lists tasks. */

/* Body cache, keyed by url. A report never changes once written, so opening the
   same one twice should not go back to the server. */
const reportBodies = {};

/* Enough Markdown for a report and no more: headings, paragraphs, bullets and
   the inline marks mdInline already handles. Anything fancier is not something
   these files are allowed to contain.

   Three options, all off by default so a report renders exactly as it always
   did. The drawer's Description turns the first two on: `srcmap` stamps every
   block with the lines of `text` it came from, which is how a click on the
   rendered note finds its place in the Markdown behind it (see noteCaret in
   the drawer), and `keepH1` keeps a single-hash heading, which is a real
   heading in a note where in a report it is only the title repeated.

   `drop` is a list of heading names whose whole section is left out of the
   render. It exists for plans: a plan carries its research trail and its
   revision history in the same file as the plan itself, because the acting
   agent and the next night's re-plan both read them, and he does not. Left
   out rather than folded into a `details`, since a fold is still an invitation
   to open something written for a machine. */
function mdBlocks(text, opts){
  const o = opts || {};
  // Frontmatter is metadata for the list, not part of the report.
  const fm = /^---\n[\s\S]*?\n---\n/.exec(text);
  const body = fm ? text.slice(fm[0].length) : text;
  // data-src counts lines of `text`, not of `body`, so a caller mapping back
  // into what it passed in does not have to know frontmatter was dropped.
  const base = fm ? fm[0].split('\n').length - 1 : 0;
  const at = (a, b) => o.srcmap ? ' data-src="' + (base + a) + ',' + (base + b) + '"' : '';
  const out = [];
  let para = [], paraAt = 0, list = null;
  // Sections the caller does not want rendered at all. A heading whose text is
  // named takes everything under it with it, as far as the next heading at its
  // own level or above, so a subheading inside a dropped section goes too.
  const drop = (o.drop || []).map(s => s.trim().toLowerCase());
  let skipAt = 0;
  const flushPara = () => { if (para.length) {
    out.push('<p' + at(paraAt, paraAt + para.length - 1) + '>' + mdInline(para.join(' ')) + '</p>');
    para = [];
  } };
  // Two list shapes, one open at a time. A plan's Proposed plan and Needs you
  // are both numbered, and until the ordered branch existed every one of them
  // fell through to the paragraph branch and came back as a run-on sentence.
  let listTag = 'ul';
  const flushList = () => { if (list) {
    out.push('<' + listTag + ' class="' + (listTag === 'ol' ? 'repnum' : 'repbul') + '">' +
             list.join('') + '</' + listTag + '>');
    list = null;
  } };
  body.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      if (skipAt && level <= skipAt) skipAt = 0;
      if (!skipAt && drop.indexOf(h[2].trim().toLowerCase()) !== -1) {
        flushPara(); flushList();
        skipAt = level;
        return;
      }
    }
    if (skipAt) return;
    if (!line) { flushPara(); flushList(); return; }
    if (h) {
      flushPara(); flushList();
      // The h1 is the report's own title, which the list already shows above it.
      if (h[1].length > 1 || o.keepH1) out.push('<h4' + at(i, i) + '>' + mdInline(h[2]) + '</h4>');
      return;
    }
    const b = /^[-*]\s+(.*)$/.exec(line) || /^(?:\d+[.)])\s+(.*)$/.exec(line);
    if (b) {
      const tag = /^[-*]/.test(line) ? 'ul' : 'ol';
      // A list that changes kind mid-run closes and opens rather than mixing.
      if (list && tag !== listTag) flushList();
      listTag = tag;
      flushPara();
      (list = list || []).push('<li' + at(i, i) + '>' + mdInline(b[1]) + '</li>');
      return;
    }
    flushList();
    if (!para.length) paraAt = i;
    para.push(line);
  });
  flushPara(); flushList();
  return out.join('');
}

/* The closed state is the list's whole job: title, date and standfirst are
   enough to say what a report found without opening it. Opening it is a
   separate choice — see openReportModal. */
function reportItemHTML(r){
  const when = [r.covers ? 'Covers ' + esc(r.covers) : '', r.topic ? esc(r.topic) : '']
    .filter(Boolean).join(' · ');
  return '<article class="repitem" data-report="' + esc(r.url) + '">' +
    '<button class="rephead" data-report-open="' + esc(r.url) + '">' +
      '<span class="reptitle">' + esc(r.title) + '</span>' +
      (r.date ? '<span class="repdate">' + esc(r.date) + '</span>' : '') +
    '</button>' +
    (when ? '<div class="repmeta">' + when + '</div>' : '') +
    (r.summary ? '<div class="repsum">' + mdInline(r.summary) + '</div>' : '') +
  '</article>';
}

/* A written report and a plan are both a document, and a document wants a
   document's width — not 600 words read down this column's narrow gutter.
   Both open in showModal's wide variant instead of expanding inside their own
   card, and both are lazy and cached: the body is only fetched the first time
   the modal opens, and never again after that — a written report never
   changes once it exists, and a plan changes only through setPlanStatus,
   never by being re-fetched. */
function openDocModal(cfg){
  showModal(cfg.title, cfg.sub,
    '<div class="repdoc">' + (cfg.cache[cfg.url] || '<p class="empty">Loading…</p>') + '</div>',
    cfg.buttons, { wide:true });
  if (!cfg.cache[cfg.url]) cfg.load(cfg.url);
}

async function loadDocBody(url, cache, noun, opts){
  let html;
  try {
    const res = await fetch(url + '?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error(res.status);
    html = mdBlocks(await res.text(), opts);
    cache[url] = html;
  } catch (err) {
    html = '<div class="err">Could not read that ' + noun + '. ' + esc(String(err.message || err)) + '</div>';
  }
  // The modal may have been closed, or moved on to a different document, while
  // this was in flight — write back only if it is still the one showing.
  const mid = modalEl && modalEl.querySelector('.mid .repdoc');
  if (mid) mid.innerHTML = html;
}

function openReportModal(r){
  const when = [r.covers ? 'Covers ' + esc(r.covers) : '', r.topic ? esc(r.topic) : '']
    .filter(Boolean).join(' · ');
  const sub = [r.date ? esc(r.date) : '', when].filter(Boolean).join(' · ');
  openDocModal({
    title: r.title, sub, cache: reportBodies, url: r.url, load: loadReportBody,
    buttons: [{ label:'Close', primary:true }]
  });
}

async function loadReportBody(url){ return loadDocBody(url, reportBodies, 'report'); }

/* The React root, on a node this view creates rather than on #lists — the
   same rule ProjectsView and BackupsView follow, and for the same reason: the
   unported views still assign to #lists.innerHTML. See CLAUDE.md. */
let reportsRoot = null;
function reportsMountPoint(){
  const lists = $('#lists');
  if (!lists) return null;
  let host = lists.querySelector('#reportsRoot');
  if (!host) {
    if (reportsRoot) BoardUI.unmount(reportsRoot);
    lists.innerHTML = '<div id="reportsRoot"></div>';
    host = lists.querySelector('#reportsRoot');
    reportsRoot = host;
  }
  return host;
}

/* The written half's own state. `written` staying null is what says the fetch
   is still out, which is not the same as the folder being empty. */
let writtenState = { list: null, error: null };

function drawReports(){
  const host = reportsMountPoint();
  if (!host) return;
  BoardUI.mount(host, BoardUI.ReportsView({
    windows: REPORT_WINDOWS.map(w => ({ id: w.id, label: w.label, short: w.short })),
    window: reportWindow,
    onWindow: id => { if (setReportWindow(id)) drawReports(); },
    range: reportDateRange(),
    /* The counted reports and the lead note are still built as HTML by the
       three functions in this file, because mdBlocks/mdInline and those
       builders are shared with the drawer and Plans — porting them means
       porting those views in the same change. */
    leadHTML: countedLeadHTML(),
    countedHTML: reportDefs().map(fn => fn()).join(''),
    written: writtenState.list,
    writtenError: writtenState.error,
    onOpen: r => openReportModal(r),
  }));
}

/* Kept as a named function because renderCountedReports() is what
   archiveEntriesSync() calls back into when the archive finishes loading —
   the counted half can be asked to redraw long after the view was drawn. */
function renderCountedReports(){
  drawReports();
}

/* Two columns, because the two kinds of report answer different questions and
   neither is a footnote to the other. Counted on the left, written on the
   right. Both are Column since 12 Sep 2026, like every other column in the app.

   Changing the window redraws through drawReports(), which re-renders both
   columns — but the written half is re-rendered from `writtenState` rather than
   re-fetched, so /reports.json is still read exactly once per visit to the tab.
   kanban/test_reports.mjs asserts that by counting fetches. */
async function renderReportsView(){
  if (!state.doc) {
    const host = reportsMountPoint();
    if (host) BoardUI.mount(host, BoardUI.ReportsEmpty({}));
    return;
  }
  writtenState = { list: null, error: null };
  drawReports();
  try {
    const res = await fetch('/reports.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      writtenState = { list: null, error: { kind: 'stale-helper' } };
      drawReports();
      return;
    }
    writtenState = {
      list: ((await res.json()).reports || []).map(r => ({
        title: r.title, date: r.date, covers: r.covers, topic: r.topic,
        summaryHTML: r.summary ? mdInline(r.summary) : '',
        url: r.url,
      })),
      error: null,
    };
    drawReports();
  } catch (err) {
    writtenState = { list: null, error: { kind: 'unreadable', detail: String(err.message || err) } };
    drawReports();
  }
}

/* Kept so anything that wants only the written half redrawn still can. */
async function renderWrittenReports(){ return renderReportsView(); }

/* The span the picker is currently showing. "All" has no start date to name —
   the earliest thing counted is whatever the archive happens to still hold, and
   that is not known until it has loaded — so it says what it is instead of
   printing a date that would be wrong for the first second and misleading after. */
function reportDateRange(){
  if (reportWindow === 'all') return 'everything still on record';
  return reportDay(ymd(reportWindowStart())) + '–' + reportDay(ymd(today()));
}


