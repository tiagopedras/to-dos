'use strict';

/* =========================================================================
   4b2. Reports — what the file says about work that is already finished.

   Every other column answers "what should I do next". These two answer "what
   got done", which is the question that comes up in a one-to-one or a quarterly
   review and has never had an answer here that did not mean counting by hand.

   They were a tab of their own until 19 Sep 2026 and are the last two columns
   of Overview now, so the two questions are read in one place. What is left in
   this file is everything but the shell: the window picker and its arithmetic,
   the archive read that makes a 90-day count trustworthy, and the four
   build*() functions the components in kanban/ui/ReportsBlocks.tsx draw from.
   reportsColumnProps() near the bottom is the seam — renderSections() in
   18-timeline.js calls it, and OverviewView lists the two columns after
   Context.

   The counted half reads straight from state.doc, the same as every other
   column on the row: nothing is fetched, nothing is stored, and a report of a
   backup preview describes that backup rather than the live file. Adding a
   second counted report means one more build*() here and one more component
   in ReportsBlocks.tsx, listed in TasksFinishedColumn's body.
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
/* Set and never read since 19 Sep 2026. It was the one thing that told a
   window past the archive point that its older end might be short, through
   CountedLead, which went with the two grey paragraphs above the first
   report. The failure itself is silent now — a failed read leaves
   archiveEntries as [], which reads as "nothing was archived" — so this is
   kept as the hook for saying so somewhere smaller. */
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
    // countsAsFinished(), not t.done: a cancelled task is ticked and archived
    // out with everything else, and counting it says work was done that was
    // not. core/todo.js holds the rule, so both languages ask the same thing.
    if (countsAsFinished(t)) out.push({ bucketName, tierName, title: t.title, doneOn: t.doneOn, effort: t.effort });
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
   re-render — the same lazy pattern ensureWrittenReports uses for the written
   half. */
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
    if (!countsAsFinished(t)) return;
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

/* One finished task as a row: the date it was ticked, its title, and a chip on
   the right saying where it sits. Both reports that list tasks rather than
   count them build their rows through here, so the live-versus-archived
   branch below is written once and a row reads the same whichever report it
   is in. `DoneRow` in `kanban/ui/ReportsBlocks.tsx` is what actually draws
   it; this is the data it draws from.

   An archived task has no live id to open the drawer with, so `taskId` comes
   back null and the component renders plain text instead of a button. */
function buildDoneRow(it, color, chip, chipClass){
  return {
    key: it.taskId || (it.bucketName + '|' + it.doneOn + '|' + it.title),
    color, dateLabel: reportDay(it.doneOn), title: it.title,
    taskId: it.taskId || null, chip, chipClass,
  };
}

/* The bucket a finished task was in, in the board's own colour. Anything the
   list no longer has a bucket for — an archived entry whose bucket has since
   been renamed or removed — is greyed rather than dropped, the same as in
   weeklyTrendReport. */
function reportBucketColor(name){
  const i = state.doc ? state.doc.buckets.findIndex(b => b.name === name) : -1;
  return i > -1 ? bucketColor(name, i) : 'var(--tenon-text-faint)';
}

/* Builds the data `CompletedByCategory` in `kanban/ui/ReportsBlocks.tsx`
   draws from — the counts, the bar widths, the effort points, one row per
   bucket, in a component rather than a string until 13 Sep 2026. */
function buildCompletedByCategory(){
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

  const dataRow = r => {
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
    let effort;
    if (!n) {
      effort = { kind:'none' };
    } else if (!scored.length) {
      effort = { kind:'untagged', title: 'No effort tag on any of these ' + n +
        ' tasks, so there is nothing to add up' };
    } else {
      effort = { kind:'scored', text: pts + ' pt' + (pts === 1 ? '' : 's'),
        title: pts + ' effort point' + (pts === 1 ? '' : 's') +
          ', from ' + scored.length + ' of ' + n + ' task' + (n === 1 ? '' : 's') +
          ' — S counts 1, M 2, L 3' };
    }
    // The "where" chip says Done for every row rather than it.tierName — Done
    // is not a section in the file, it is the tick box on the task (see
    // setDone/dropTask), so a ticked task keeps whatever tier it was last
    // dragged into and it.tierName would show that raw tier instead. Every
    // task in this report is done by construction, so the live board's own
    // convention (t.done ? DONE_COL : tier.name) is what belongs here too.
    return {
      name: r.name, color: r.color, count: n, widthPct: width,
      pctLabel: total ? pct + '%' : '—', effort,
      tasks: r.items.map(it => buildDoneRow(it, r.color, DONE_COL)),
    };
  };

  return {
    total,
    /* The window used to be named again here, in a `.totalw` span, so the
       line read "12 tasks finished across 4 categories the last 30 days"
       directly under a picker already reading "Past 30 days". The picker
       governs the whole column and says so in its own head; saying it twice
       made the sentence longer without making it truer. */
    totalLine: 'task' + (total === 1 ? '' : 's') + ' finished across ' +
      state.doc.buckets.length + ' categor' + (state.doc.buckets.length === 1 ? 'y' : 'ies'),
    rows: rows.map(dataRow),
    emptyMessage: total ? null :
      'Nothing has been ticked off with a date ' + reportWindowPhrase() + '.',
  };
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
function buildRecentAccomplishments(){
  const list = completedRecently();
  return {
    count: list.length,
    windowPhrase: reportWindowPhrase(),
    rows: list.map(it => buildDoneRow(it, reportBucketColor(it.bucketName), it.bucketName, 'bk')),
    emptyMessage: 'Nothing has been ticked off with a date ' + reportWindowPhrase() + '.',
  };
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

/* Line or bars. Same in-memory-only pattern as trendHidden — a way of looking
   at the chart, not a setting worth keeping across a reload. */
let trendChartType = 'line';

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
    if (!countsAsFinished(t)) return;
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

/* Toggling a bucket in the trend's own key, or switching between line and
   bars, is a real onClick on the button now (WeeklyTrend in
   kanban/ui/ReportsBlocks.tsx) — not a data-trendkey/data-trendtype pair for
   #lists's delegated listener to find; see the two cases removed from
   kanban/js/25-archiving.js. Only the counted card redraws, since nothing
   about the list itself has changed — this is a change of view, not an edit. */
function toggleTrendKey(name){
  if (trendHidden.has(name)) trendHidden.delete(name); else trendHidden.add(name);
  renderCountedReports();
}
function setTrendChartType(type){
  trendChartType = type;
  renderCountedReports();
}

/* Builds the data WeeklyTrend draws from — one series per bucket, one count
   per week. The chart's own geometry (the SVG coordinates, the smoothed
   curve, the pace comparison) is pure arithmetic over these values with no
   read of state.doc, so it lives beside the chart in ReportsBlocks.tsx rather
   than here. */
function buildWeeklyTrend(){
  const weeks = weekBuckets(trendWeeks());
  const entries = trendEntries();
  // Bucket order and colour match the board's own, so a bucket reads the same
  // colour here as everywhere else. An archived bucket that no longer exists
  // still needs somewhere to go, so anything unmatched is appended, greyed.
  const bucketOrder = state.doc ? state.doc.buckets.map(b => b.name) : [];
  const colorOf = name => {
    const i = bucketOrder.indexOf(name);
    return i > -1 ? bucketColor(name, i) : 'var(--tenon-text-faint)';
  };

  const weekData = weeks.map(w => {
    const inWeek = entries.filter(e => e.date >= w.start && e.date <= w.end);
    const counts = new Map();
    inWeek.forEach(e => counts.set(e.bucketName, (counts.get(e.bucketName) || 0) + 1));
    const order = bucketOrder.filter(n => counts.has(n))
      .concat([...counts.keys()].filter(n => !bucketOrder.includes(n)));
    return {
      start: w.start,
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

  return {
    chartType: trendChartType,
    onChartType: setTrendChartType,
    weeks: weekData.map(w => ({ label: reportDay(ymd(w.start)) })),
    series,
    onToggleSeries: toggleTrendKey,
  };
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

/* The written half's own state. `written` staying null is what says the fetch
   is still out, which is not the same as the folder being empty. `fetched`
   is what keeps /reports.json read once per arrival at Overview rather than
   once per render of it — a bucket tab or a search term redraws the whole
   row, and neither changes what is in data/reports/. */
let writtenState = { list: null, error: null, fetched: false };

/* Everything the two report columns draw from, in one object — the shape
   ReportsColumnsProps (kanban/ui/ReportsColumns.tsx) spells out. renderSections()
   in 18-timeline.js hands it to OverviewView, which lists the two columns
   after Context.

   The counted reports are components — see ReportsBlocks.tsx — so what crosses
   here is the data they draw from, not markup. mdBlocks and mdInline stay
   shared functions for the drawer's HTML strings; a done task's title here
   crosses as the plain string and Tenon's Markdown draws it (InlineMd.tsx). */
function reportsColumnProps(){
  if (!state.doc) return null;
  return {
    windows: REPORT_WINDOWS.map(w => ({ id: w.id, label: w.label, short: w.short })),
    window: reportWindow,
    onWindow: id => { if (setReportWindow(id)) renderCountedReports(); },
    range: reportDateRange(),
    completed: buildCompletedByCategory(),
    recent: buildRecentAccomplishments(),
    trend: buildWeeklyTrend(),
    written: writtenState.list,
    writtenError: writtenState.error,
    onOpen: r => openReportModal(r),
    finishedOpen: overviewOpen('ov:Tasks finished'),
    writtenOpen: overviewOpen('ov:Written reports'),
  };
}

/* Redraw whichever view is holding the report columns. Named rather than
   inlined because archiveEntriesSync() calls back into it when the archive
   finishes loading, long after the view was drawn, and the trend's own key and
   chart-type toggles reach it too. Silent when Overview is not on screen —
   both of those can land after he has moved to another tab. */
function renderCountedReports(){
  if (state.view === 'overview') renderSections('overview');
}

/* /reports.json, once per arrival at Overview. The counted half needs nothing
   fetched — it reads state.doc, the same as every other column on the row — so
   the columns are drawn first and this fills the written one in when it lands.

   Called by renderSections() rather than by renderView(), because the bucket
   tabs and the search box redraw sections without ever leaving the view, and
   `fetched` is what tells the two apart. */
async function ensureWrittenReports(){
  if (writtenState.fetched) return;
  writtenState = { list: null, error: null, fetched: true };
  try {
    const res = await fetch('/reports.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      writtenState = { list: null, error: { kind: 'stale-helper' }, fetched: true };
      renderCountedReports();
      return;
    }
    writtenState = {
      list: ((await res.json()).reports || []).map(r => ({
        title: r.title, date: r.date, covers: r.covers, topic: r.topic,
        summary: r.summary || '',
        url: r.url,
      })),
      error: null, fetched: true,
    };
    renderCountedReports();
  } catch (err) {
    writtenState = {
      list: null, error: { kind: 'unreadable', detail: String(err.message || err) }, fetched: true,
    };
    renderCountedReports();
  }
}

/* Asking for the list again — after an archive run, or on landing on Overview
   from another tab. The next ensureWrittenReports() does the fetch. */
function forgetWrittenReports(){ writtenState = { list: null, error: null, fetched: false }; }

/* The span the picker is currently showing. "All" has no start date to name —
   the earliest thing counted is whatever the archive happens to still hold, and
   that is not known until it has loaded — so it says what it is instead of
   printing a date that would be wrong for the first second and misleading after. */
function reportDateRange(){
  if (reportWindow === 'all') return 'everything still on record';
  return reportDay(ymd(reportWindowStart())) + '–' + reportDay(ymd(today()));
}


