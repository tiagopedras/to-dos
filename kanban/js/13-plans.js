'use strict';

/* =========================================================================
   4b2b. Plans — what the night agent worked out while nobody was watching.

   Files in data/<dataset>/plans/<night>/, listed by the server at /plans.json,
   read exactly the way written reports are. They are a separate view rather
   than a third column in Reports because they answer the opposite question: a
   report says what happened, a plan proposes what to do, and a plan stops being
   true the moment it is acted on.

   A plan is a work item like any other and carries the shape every stream in
   here now shares: a `state`, an `owner` who is expected to move it next, and a
   `seen` flag. PACKAGES/work_streams/CONTRACT.md is the authority, and
   agents/night_agent/stream.json is this stream's manifest, holding its own word
   for each state.

   Since 12 Sep 2026 this view has the same four columns as the board itself,
   and for the same reason: where he puts a card is the instruction, not a
   label describing one. Backlog, To do, Waiting for review, Done.

     backlog / me               leave it alone; the night agent does not touch it
     ready   / night-agent      plan it tonight, with the reason he gave
     review  / me               the agent has written one; `seen` says if he looked
     done    / me               he accepts it, and the acting agent's half starts

   Waiting for review is the one column he cannot drop into, because filling it
   is the agent's half of the arrangement. It draws with a dashed edge so that
   is visible before a drag is attempted rather than after.

   Five separate words did this until 11 Sep 2026: unread, read, agreed, redo,
   actioned. Two of them said the same thing about the plan — an agent has the
   green light — and differed only in which agent, so they are one state and an
   owner now. That is what stops a third agent needing a sixth word.

   Why a single `state` rather than a flag beside it: a plan is in exactly one
   of these at a time, and a second field would let one be agreed and rejected
   at once, which means nothing. `owner` is single-valued for the same reason.

   Setting a state is the only write in here, and it does not happen here. The
   board posts the move to /stream/apply and the night agent's own stream.py
   performs it, writing the plan file and its ledger row together. Until today
   this view's server half wrote those files itself, which is the arrangement
   agents-dashboard/CONTRACT.md already refuses for schedules, and it had
   already produced the bug where a plan's status and its ledger row disagreed
   for ever. Nothing in this view goes near todo.md.
   ========================================================================= */

const planBodies = {};
let planList = [];

/* A folded plan is one whose agent stopped and asked rather than guessing —
   see the folding rule in agents/night_agent/PLAN-BRIEF.md. It is marked here rather than
   left to read like any other, because the two want opposite things from him:
   a plan wants reading, a fold wants answering. */
function planClass(p){
  /* A superseded plan still reads as the rejection it was. It is finished, but
     what it carries is the reason he sent it back, and that is the only written
     record of what he asked for. */
  if (p.resolution === 'superseded') return ' redo';
  if (p.state === 'done') return ' actioned';
  if (p.state === 'backlog') return ' parked';
  if (p.state === 'ready') return p.owner === 'night-agent' ? ' redo' : ' agreed';
  return p.seen ? ' read' : '';
}

/* One word for the state a card is in, for the badge. His words rather than the
   canonical ones, and the same four the columns are named after wherever the
   card is sitting in the column that word describes. */
function planWord(p){
  if (p.state === 'done') return p.resolution === 'superseded' ? 'replaced' : 'accepted';
  if (p.state === 'backlog') return 'parked';
  if (p.state === 'ready') return p.owner === 'night-agent' ? 'planning again' : 'handed over';
  return p.seen ? 'read' : 'new';
}

/* Which of the four columns a plan draws in. One function, so the renderers,
   the drop handlers and the counts can never disagree about where a card is. */
const PLAN_COL = { backlog:'backlog', todo:'todo', review:'review', done:'done' };
function planColumn(p){
  if (p.state === 'backlog') return PLAN_COL.backlog;
  if (p.state === 'ready' && p.owner === 'night-agent') return PLAN_COL.todo;
  if (p.state === 'review') return PLAN_COL.review;
  /* `done`, and the `ready / execution-agent` a plan agreed before 12 Sep 2026
     still carries. Both mean he has accepted it, which is what Done says. */
  return PLAN_COL.done;
}

/* Whether an agent may pick this up and which one. `ready` owned by the night
   agent is a plan he sent back; `ready` owned by the acting agent is one he
   approved. Both mean the same thing about the plan, which is why they are one
   state and not two. */
const isRedo = p => p.state === 'ready' && p.owner === 'night-agent';
const isAgreed = p => p.state === 'ready' && p.owner === 'execution-agent';

/* When a plan was actually written, to the minute — `generated:` if the file
   has one, falling back to the file's own mtime for a plan written before
   this field existed. Both are naive local timestamps already, the same as
   backupWhen's input, so it reads the same format the Backups list already
   uses for "when did this actually happen". */
function planGeneratedLabel(p){
  const iso = p.created || p.generated || p.modified;
  return iso ? backupWhen(iso) : (p.night || '');
}

/* The two rows under the title. The task's name is the long thing here — long
   enough to take a line on its own at this column width, and long enough that
   letting it wrap in among everything else pushed the row to three ragged
   lines. So it gets its own line, and everything else gets one: the scores and
   then where the card sits, on a single line above it.

   It used to be one run of text with the scores bolted on the front and the
   link on the end, which put the two things worth scanning — a 🔥/S, and the
   name of the card — at opposite ends of a line whose middle was a bucket he
   had already filtered to.

   The link carries the task's own title rather than the words "open the card",
   which is what makes it worth reading rather than only worth clicking. It is
   the task's title and not the plan's: the two are written the same today, so
   most rows say it twice, but a task renamed since the night it was planned is
   exactly the case where the row has to say which card it actually opens. */
function planItemHTML(p){
  /* One canonical field across every stream: an unattended agent must not act
     on this. It was `outcome: folded` here and `needs_you` in the improvements
     backlog, which were two names for one fact. */
  const folded = !!p.needs_you;
  const cls = planClass(p) + (folded ? ' folded' : '');
  // The plan's own task, if the underlying card can still be found by slug or
  // title — see findTaskByKey in 02-state.js. Not every plan resolves: the
  // task might since have been renamed or deleted, so the link falls back to
  // the name the plan itself stored, and goToPlanTask says so on the click.
  const key = planTaskKey(p);
  const task = planTask(p);
  const score = planScoreHTML(task);
  const goto = key
    ? '<button class="plangoto" data-plan-goto="' + esc(key) +
      '" title="Open this task on the board">' + esc(task ? task.title : key) + ' \u2197</button>'
    : '';
  const where = [p.bucket, p.column, planGeneratedLabel(p)].filter(Boolean).map(esc).join(' · ');
  /* Draggable everywhere, including out of Waiting for review: that column
     refuses drops, not drags. Taking a card out of it is how he answers it. */
  return '<article class="repitem planitem' + cls + '" draggable="true"' +
    ' data-plan="' + esc(p.url) + '">' +
    '<button class="rephead" data-plan-open="' + esc(p.url) + '">' +
      '<span class="reptitle">' + esc(p.title) + '</span>' +
      (folded ? '<span class="planfold" title="The agent stopped and asked rather than guessing">needs you</span>' : '') +
      '<span class="repdate">' + esc(planWord(p)) + '</span>' +
    '</button>' +
    (score || goto || where
      ? '<div class="repmeta planmeta">' +
        (score || where
          ? '<span class="planlead">' + score +
            (where ? '<span class="planwhere">' + where + '</span>' : '') + '</span>'
          : '') +
        goto +
        '</div>'
      : '') +
    (p.summary ? '<div class="repsum">' + mdInline(p.summary) + '</div>' : '') +
    /* On a rejected plan the reason is worth more than the summary: it is what
       he told the agent, and it is what tonight's run will be working from. */
    /* Shown wherever it exists rather than only while the plan is still out
       with the agent: once a replacement has landed the old plan is finished,
       and the reason is the thing worth keeping about it. */
    (p.feedback
      ? '<div class="planredo"><b>Sent back:</b> ' + esc(p.feedback) + '</div>' : '') +
  '</article>';
}

/* Opening one marks it read, on the grounds that having it open is what being
   read means. Actioned stays a deliberate press, because that is a claim about
   the work rather than about him, and it is the one the runner acts on. */
function openPlanModal(p){
  const sub = [p.bucket, p.column, planGeneratedLabel(p), p.agent].filter(Boolean).map(esc).join(' · ');
  /* One button per column he could drag the card into, named after the column
     rather than after the verdict, so the two ways of moving a plan say the
     same thing. Waiting for review has no button for the same reason it has no
     drop zone: the card is already there and putting it back is not a move.
     The modal's own × in the corner is the dismissal, so there is no Close
     button left to press by reflex on the way out. */
  openDocModal({
    title: p.title, sub, cache: planBodies, url: p.url, load: loadPlanBody,
    buttons: [{ label:'Accept it', agree:true, run: () => acceptPlan(p) },
              { label:'Plan it again', reject:true, run: () => replanPlan(p) },
              { label:'Leave it alone', run: () => parkPlan(p) }]
  });
  if (!p.seen) movePlan(p, 'review', 'me', { seen:true, quiet:true });
}

/* The three moves, one per column he can put a plan in. Each one is the drop
   handler and the modal button both, so dragging a card and pressing a button
   cannot come to mean different things.

   Nothing runs from any of them. The acting agent is invoked from a session,
   on purpose, so that a run he has not asked for cannot start from a stray
   click on a board tab left open overnight. */

/* Done. He accepts the plan as written, which is the end of this board's
   involvement and the start of the acting agent's: an accepted plan is what
   feeds the execution board's Backlog. The night agent stops re-planning the
   task from here, which is the change of meaning `done` carries since 12 Sep
   2026 — it used to mean "actioned, so plan it fresh next time". */
function acceptPlan(p){
  showModal('Accept this plan?', esc(p.title),
    '<div class="repdoc">' +
      '<p>It moves to <strong>Done</strong>, and the night agent leaves the task ' +
      'alone from here rather than writing a second opinion over it.</p>' +
      '<p>Nothing runs now. It lands in the execution board\'s Backlog, and the ' +
      'acting agent only picks it up once you move it to To do there.</p>' +
    '</div>',
    [{ label:'Yes, accept it', primary:true, run: () => movePlan(p, 'done', 'me', { resolution:'actioned' }) },
     { label:'Cancel' }]);
}

/* To do. The plan is wrong and tonight should write another, so the move has to
   carry a reason: it goes into the plan's frontmatter and the next run's agent
   is handed it, which is what stops tomorrow night writing the same plan again.
   The server refuses an empty one and so does this, so the message about why
   arrives before the press rather than after it. */
let redoText = '';
function replanPlan(p){
  redoText = '';
  showModal('Plan it again?', esc(p.title),
    '<div class="repdoc">' +
      '<p>It goes back to <strong>To do</strong>, and tonight\'s run plans the task ' +
      'again with this one told to it. Say what this plan got wrong, in a sentence.</p>' +
      '<textarea id="redoWhy" class="redowhy" rows="3" ' +
        'placeholder="Wrong scope: this is about the Foundations file, not the whole library."></textarea>' +
    '</div>',
    [{ label:'Yes, plan it again', primary:true, run: () => {
        const why = redoText.trim();
        if (!why) return showToast('A plan going back needs a reason.', 'bad');
        movePlan(p, 'ready', 'night-agent', { reason: why, release: true });
      } },
     { label:'Cancel' }]);
  const box = $('#redoWhy');
  if (box) {
    // Read as he types rather than on press: showModal closes the sheet before
    // running a button, so by then the textarea is gone.
    box.oninput = () => { redoText = box.value; };
    box.focus();
  }
}

/* Backlog. Not a verdict on the plan at all — it is him saying the agent should
   leave this task be. So it does two things rather than one: the plan is parked,
   and the task itself joins the hold list, which is the only thing agents/night_agent/pick.py
   actually reads. Parking the plan and leaving the task queued would have
   tonight write a fresh plan for a task he just took off the agent. */
function parkPlan(p){
  showModal('Leave this one alone?', esc(p.title),
    '<div class="repdoc">' +
      '<p>The plan is parked in <strong>Backlog</strong> and the task is held back ' +
      'from the queue, so the night agent does not touch it until you move it ' +
      'back to To do.</p>' +
    '</div>',
    [{ label:'Yes, leave it alone', primary:true, run: () => movePlan(p, 'backlog', 'me', { hold: true }) },
     { label:'Cancel' }]);
}

/* The two sections of a plan that are not for him. `Context` is the night's
   research trail — what it read, what it ruled out, what it could not
   establish — and `History` is one line per revision. Both are in the plan
   file because the acting agent reads one and the next re-plan reads the
   other, and both stay out of the modal because reading them again is exactly
   the noise that stops a plan being read at all. Named rather than positional,
   so a plan written before this still renders. */
const PLAN_UNSHOWN = ['Context', 'History'];

async function loadPlanBody(url){
  return loadDocBody(url, planBodies, 'plan', { drop: PLAN_UNSHOWN });
}

/* `quiet` is the read-on-open case: it should not redraw the list underneath an
   open modal, which would be a card shuffling itself while he is reading it. */
async function movePlan(p, state, owner, opts){
  opts = opts || {};
  const seen = opts.seen !== undefined ? opts.seen : true;
  try {
    const res = await postJSON('/stream/apply', {
      stream: 'plans',
      item: { group: p.night, name: p.name },
      to: state, owner, seen,
      resolution: opts.resolution || '',
      reason: opts.reason || ''
    });
    if (res && res.ok === false) throw new Error(res.error || 'the stream refused it');
    p.state = state; p.owner = owner; p.seen = seen;
    if (opts.resolution) p.resolution = opts.resolution;
    if (opts.reason) p.feedback = opts.reason;
    /* The task behind the plan, and the hold list that decides whether tonight
       touches it. A plan's own state means nothing to agents/night_agent/pick.py — it reads
       the ledger and the hold list — so a move that says "leave this alone" has
       to say it where the picker looks. */
    if (opts.hold || opts.release) {
      await setTaskHeld(planTaskKey(p), !!opts.hold);
    }
    if (!opts.quiet) { renderPlansList(); renderQueue(); }
  } catch (err) {
    if (!opts.quiet) showToast('Could not move that plan: ' + (err.message || err), 'bad');
  }
}

/* Put one task on the hold list, or take it off, without touching the ordering.
   The list is titles, matched case-insensitively by pick.key(), and it is the
   one control over the night that lives outside todo.md. */
async function setTaskHeld(title, on){
  const norm = t => String(t || '').trim().toLowerCase();
  const want = norm(title);
  if (!want) return;
  const has = queueHoldTitles.some(t => norm(t) === want);
  if (on === has) return;
  queueHoldTitles = on
    ? queueHoldTitles.concat([title])
    : queueHoldTitles.filter(t => norm(t) !== want);
  await saveQueueOrder(false);
}

/* Filters any of the queue/backlog/plan lists down to whichever buckets the
   tabs above this view are showing — All, the AI filter or the urgent/due
   filter all widen it back to everything, the same as shownBuckets() does
   for the board itself. Otherwise a row stays if its bucket is any one of the
   toggled-on set, the same widening shownBuckets() itself does for AI/urgent
   — not an exact match against a single name, which would drop a row the
   moment two bucket tabs were on at once. A row with no bucket on it (should
   not happen in practice) is shown regardless, rather than disappearing
   because of a field that was never set. */
function plansShown(list, field){
  field = field || 'bucket';
  if (!state.doc || allMode() || state.aiFilter || state.urgentFilter) return list;
  return list.filter(r => !r[field] || state.bucketFilter.has(r[field]));
}

function goToPlanTask(key){
  if (!key || !findTaskByKey(key)) {
    showToast('That task is not on the board any more.', 'bad');
    return;
  }
  state.view = 'board';
  openTaskByKey(key);
}

/* Two columns, and each one's own chip row. The Done column used to hold all
   six of these behind a single row of chips, which asked two different
   questions of one list: unread, folded and read are waiting to be read, and
   agreed, redo and actioned are verdicts already given. Splitting the chips in
   two is what lets each row narrow one question rather than both at once.

   `folded` is not a status — it is p.outcome — but it is the distinction he
   scans for first, so it sits in the Inbox row rather than in a second control
   beside it. A plan can be both folded and unread; a chip narrows to one
   question at a time, so it lands in whichever one he clicked. */
const REVIEW_FILTERS = [
  { key:'unread',   label:'new',       match: p => !p.seen },
  { key:'folded',   label:'needs you', match: p => !!p.needs_you },
  { key:'read',     label:'read',      match: p => !!p.seen },
];
const DONE_FILTERS = [
  { key:'agreed',   label:'handed over', match: p => isAgreed(p) },
  /* Only the rejections still waiting on a replacement — see redoReplaced().
     A spent one has no chip of its own, which is the point: it is filed with
     the record rather than kept in front of him. When every redo has been
     replaced the chip is not drawn at all, since planFilterBarHTML() only
     draws chips with something behind them. */
  { key:'redo',     label:'redo',      match: p => isRedo(p) && !redoReplaced(p) },
  /* Genuinely acted on, rather than everything that has finished: a rejection
     that a later plan replaced is also `done`, and calling that "actioned"
     would claim he did work he never did. It has no chip of its own, which is
     the point — it is filed with the record rather than kept in front of him. */
  { key:'actioned', label:'accepted',  match: p => p.state === 'done' && !redoReplaced(p) },
];
/* The chips narrow a column; they never choose it. Which column a plan is in is
   planColumn() and nothing else, so a folded plan sits wherever its state puts
   it rather than staying in front of him asking a question he has answered. */

/* Whether a plan he sent back has already been answered by a later one.

   Sending a plan back does not park the task: `is_stale()`
   (agents/night_agent/pick.py) treats `redo` as a reason to plan it again, so
   the task goes straight back into the queue and the next run writes a fresh
   plan under its own night. The rejected file keeps `status: redo` for good,
   because the note on it is the only written record of what he asked for —
   which left three cards on this column reading as work stalled when the
   replacements had been sitting in the Inbox for days.

   So a later plan for the same task is the replacement, and that is decided
   from `planList` alone: every row carries the night it was written and the
   task it is for, so this needs no route and no read of the night agent's
   ledger. Deliberately measured against the whole list rather than the
   bucket-filtered view — a replacement is a replacement whether or not its
   bucket tab happens to be on. A plan carrying neither slug nor task cannot
   be matched to one, so it counts as unreplaced and stays visible. */
function planTaskKey(p){ return p.slug || p.task || ''; }

/* The card a plan is about, when it is still on the board. A plan is written
   about exactly one task and carries it in its own frontmatter, so the scores
   the board already holds — impact and effort — belong on the plan too rather
   than being a second thing to go and look up. Nothing is copied into the plan
   file: this reads the live task every render, so a re-score on the board shows
   up here on the next paint and there is no second copy to drift.

   Not every plan resolves. The task may have been renamed or ticked off since
   the night it was written, and findTaskByKey answers null for both — which is
   why the chips and the sort below each have to cope with there being no task.
   Rendered on the row rather than the head, beside the bucket and the night it
   was written, because that line is already the row's "which piece of work is
   this" line. */
function planTask(p){
  const key = planTaskKey(p);
  return key ? findTaskByKey(key) : null;
}

/* The task's own scores, drawn exactly as the board's own cards draw them —
   see cardMetaHTML in 09-columns.js. Same emoji, same classes, so a row here
   and a card there are read the same way rather than being two dialects of one
   score. A task carrying only one of the two still shows it, with the board's
   own "needs scoring" marker beside it, rather than the row going quiet and
   reading as low. Takes the task rather than the plan: the caller has already
   resolved it for the link beside these chips, and resolving one walks the
   whole document. */
function planScoreHTML(t){
  if (!t) return '';
  let out = '';
  if (unscored(t) && !t.done) out += '<span class="tag needsscore">needs scoring</span>';
  if (t.impact) out += '<span class="tag impact-' + esc(t.impact) + '" title="' +
    esc(t.impact) + ' impact">' + (IMPACT_EMOJI[t.impact] || esc(t.impact)) + '</span>';
  if (t.effort) out += '<span class="tag" title="' + esc(t.effort) + ' effort">' +
    esc(t.effort) + '</span>';
  return out ? '<span class="planscore">' + out + '</span>' : '';
}

/* What order the columns are in, and it is the task's priority rather than the
   plan's date: impact ÷ effort, priorityScore() in core/todo.js, the same
   arithmetic tier one and the matrix already sort by. A night writes five or
   six plans and they arrive newest-first, which says when they were written and
   nothing about which one is worth reading — so the answer to "what do I read
   first" was buried in whichever night happened to be on top.

   A plan whose task has no scores, or whose task is gone from the board
   entirely, scores -1 and sinks below everything scored, which is what
   priorityScore already does for an unscored task. The incoming order — newest
   night first, straight from plan_listing() — is kept as the tie-break, so
   within one priority the recent night still reads first. Held by index rather
   than by leaning on sort stability, and the score is worked out once per plan
   rather than once per comparison, since resolving a task walks the document. */
function byTaskPriority(list){
  return list
    .map((p, i) => { const t = planTask(p); return { p, i, score: t ? priorityScore(t) : -1 }; })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map(x => x.p);
}

function redoReplaced(p){ return p.state === 'done' && p.resolution === 'superseded'; }
/* One filter per column, so a chip picked in one does not reset the other. */
let reviewFilter = 'all';
let doneFilter = 'all';

/* Only chips with something behind them are drawn, which is what stops a chip
   ever leading to an empty column: the bucket tabs above narrow this list too,
   so a status that exists somewhere may have nothing in the bucket being shown.
   A filter that empties out that way falls back to All rather than leaving him
   looking at nothing with no way to tell why. */
function planFilterBarHTML(shown, filters, current){
  const counts = filters
    .map(f => ({ f, n: shown.filter(f.match).length }))
    .filter(x => x.n);
  if (!counts.length) return '';
  return '<div class="tabs planfilter">' +
    '<button class="tab taball' + (current === 'all' ? ' on' : '') +
      '" data-planfilter="all">All<span class="n">' + shown.length + '</span></button>' +
    counts.map(x =>
      '<button class="tab' + (current === x.f.key ? ' on' : '') +
        '" data-planfilter="' + x.f.key + '">' + x.f.label +
        '<span class="n">' + x.n + '</span></button>').join('') +
  '</div>';
}

/* Both columns wire the same three controls — their own chip row, and the open
   and open-the-card buttons on every row in them. Only the chip handler
   differs, since each column holds its own filter. Wiring is scoped to the
   container, so the two chip rows never see each other's clicks despite
   sharing the attribute name. */
function wirePlanColumn(out, setFilter){
  out.querySelectorAll('[data-planfilter]').forEach(btn => {
    btn.onclick = () => { setFilter(btn.dataset.planfilter); renderPlansList(); };
  });
  out.querySelectorAll('[data-plan-open]').forEach(btn => {
    const p = planList.find(x => x.url === btn.dataset.planOpen);
    btn.onclick = () => openPlanModal(p);
  });
  out.querySelectorAll('[data-plan-goto]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); goToPlanTask(btn.dataset.planGoto); };
  });
  wirePlanDrags(out);
}

/* A move can land a card in any of the four, so all four are redrawn together
   rather than each render guessing which two were touched. */
function renderPlansList(){
  renderPlanReview();
  renderPlanDone();
  renderQueueList();
  renderBacklogList();
}

/* Waiting for review. Flat, because every row in it asks the same thing, and
   the chips are the only split it needs — ordered by the priority of the task
   each plan is about, so the top of it is what is worth reading first.

   The one column with no drop zone. A plan arrives here because the agent put
   it here, and the three ways out are the three other columns. */
function renderPlanReview(){
  const out = $('#plansOut');
  if (!out) return;
  const all = byTaskPriority(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.review));
  const active = REVIEW_FILTERS.find(f => f.key === reviewFilter);
  if (active && !all.some(active.match)) reviewFilter = 'all';
  const shown = reviewFilter === 'all'
    ? all
    : all.filter(REVIEW_FILTERS.find(f => f.key === reviewFilter).match);
  out.innerHTML = planFilterBarHTML(all, REVIEW_FILTERS, reviewFilter) +
    (shown.length
      ? shown.map(planItemHTML).join('')
      : '<div class="empty">Nothing waiting to be read. Everything written has been ruled on.</div>');
  wirePlanColumn(out, k => { reviewFilter = k; });
}

/* Done. He has accepted the plan as written, which is where this board's half
   ends: an accepted plan is what feeds the execution board's Backlog, and the
   night agent stops re-planning the task from here.

   Three groups inside it. `handed over` is a plan already on the acting agent's
   side — the `ready / execution-agent` written before 12 Sep 2026, and whatever
   the execution board sets from now on — lifted to the top because it is the
   only one with work still owed on it. Everything accepted folds shut at the
   bottom, the replaced rejections filed with it. Inside each group the ordering
   is the review column's: highest priority task first. */
function renderPlanDone(){
  const out = $('#plansDecided');
  if (!out) return;
  const all = byTaskPriority(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.done));
  const active = DONE_FILTERS.find(f => f.key === doneFilter);
  if (active && !all.some(active.match)) doneFilter = 'all';
  const shown = doneFilter === 'all'
    ? all
    : all.filter(DONE_FILTERS.find(f => f.key === doneFilter).match);
  const agreed = shown.filter(isAgreed);
  /* A replaced rejection is history, so it is filed with the accepted ones
     rather than left looking like work nobody picked up. Its note goes with it
     — planItemHTML() is untouched — so opening the fold still shows what he
     asked for and why. */
  const replaced = shown.filter(redoReplaced);
  const done = shown.filter(p => p.state === 'done' && !redoReplaced(p)).concat(replaced);
  out.innerHTML = planFilterBarHTML(all, DONE_FILTERS, doneFilter) +
    (agreed.length
      ? '<div class="planagreed"><h4>Handed to the acting agent</h4>' +
        '<p class="help">Start a session and run <code>/pa-do</code>.</p>' +
        agreed.map(planItemHTML).join('') + '</div>'
      : '') +
    /* Open when it is the thing being asked for: a chip that narrows to
       accepted and then hides the result behind a fold has done half a job. */
    (done.length ? '<details' + (doneFilter === 'actioned' ? ' open' : '') +
                   '><summary>' + done.length +
                   (replaced.length ? ' accepted or replaced' : ' accepted') + '</summary>' +
                   done.map(planItemHTML).join('') + '</details>' : '') +
    (shown.length ? ''
                  : '<div class="empty">Nothing accepted yet. A plan you accept lands here, and from ' +
                    'here it feeds the execution board.</div>');
  wirePlanColumn(out, k => { doneFilter = k; });
  /* The one column that takes plans and nothing else: there is nothing to
     accept about a task nobody has planned, so a task dropped here is refused
     with a word rather than silently ignored. */
  wireColumnDrop(out, d => {
    const p = draggedPlan(d);
    if (p) acceptPlan(p);
  }, d => d.kind === 'plan');
  out.ondragover = (orig => e => {
    if (drag && drag.kind === 'task') { e.preventDefault(); out.classList.add('coldeny'); return; }
    orig(e);
  })(out.ondragover);
  out.ondrop = (orig => e => {
    out.classList.remove('coldeny');
    if (drag && drag.kind === 'task') {
      e.preventDefault();
      drag = null;
      showToast('Nothing has been planned for that yet, so there is nothing to accept.', 'bad');
      return;
    }
    orig(e);
  })(out.ondrop);
}

/* -------------------------------------------------------------------------
   The queue — what tonight would plan, and the one place to change it.

   Nothing here is scheduled or stored. /queue.json is pick.select() run
   against todo.md this second, the same call the runner makes at 02:00, so
   the column cannot drift from what actually happens and there is no queued
   batch to go stale. Tick a task off and it leaves the list on the next
   render.

   What a drag writes is only the ordering, to plans/queue-order.json. The
   order matters because the batch stops on a budget, on a window floor or on
   a usage limit: the front of this list is the part that reliably gets
   planned, and the back is the part that might not. Holding a card back is
   the other half of the same control — it is the only way to say "not this
   one" without editing todo.md, which this view must never do.

   Neither the order nor the hold list decides what the queue contains. Every
   rule in agents/night_agent/pick.py still does that. A title in the file that has since
   been ticked off, blocked or renamed is simply never matched, which is why
   nothing here ever needs pruning.
   ------------------------------------------------------------------------- */

let queueRows = [];      // what tonight would plan, in order
let queueHeld = [];      // deliberately held back — lives in the Backlog column
let queueSkipped = [];   // dropped by a rule — lives in the Backlog column too
let queueOrder = [];      // the stored ordering, so held ranks survive a save
/* The hold list as the file holds it, rather than rebuilt from whatever rows
   happen to be on screen. A task can be held and not drawn — its plan is out
   for review, or it went Blocked this week — and rebuilding from the rows
   quietly released every one of those on the next save. */
let queueHoldTitles = [];
/* One card being dragged, of either kind. `task` is a row off the queue or the
   Backlog; `plan` is a written plan. Both move between the same four columns,
   so both travel in the same variable and every column's drop handler decides
   what to do with whichever arrived. */
let drag = null;         // { kind:'task'|'plan', title, from } | { kind:'plan', url, from }

/* The same "open the card ↗" link a plan's own meta line carries — see
   goToPlanTask. A queue or Backlog row is the board's own task, not a plan
   written about it, so it needs the same way back rather than a copy of it. */
function gotoButtonHTML(r){
  const key = r.slug || r.title || '';
  return key ? '<button class="plangoto" data-plan-goto="' + esc(key) +
    '" title="Open this task on the board">open the card ↗</button>' : '';
}

function queueRowHTML(r){
  const meta = [r.bucket, r.column, r.agent].filter(Boolean).map(esc).join(' · ');
  const goto = gotoButtonHTML(r);
  return '<article class="qitem" draggable="true" data-qtitle="' + esc(r.title) + '">' +
    '<div class="qhead">' +
      '<span class="qpos">' + r.position + '</span>' +
      '<span class="qtitle">' + esc(r.title) + '</span>' +
      '<button class="qhold" data-qhold="' + esc(r.title) + '" ' +
        'title="Hold it back from tonight">Hold</button>' +
    '</div>' +
    (meta || goto
      ? '<div class="repmeta">' + meta + (goto ? (meta ? ' · ' : '') + goto : '') + '</div>'
      : '') +
    '<div class="qwhy">' + esc(r.why || '') +
      (r.last ? ' · last planned ' + esc(r.last) : '') + '</div>' +
  '</article>';
}

function renderQueueList(){
  const out = $('#queueOut');
  if (!out) return;
  const shown = plansShown(queueRows);
  /* Plans he has sent back sit in this column too, under the queue. The task
     itself is already in the list above — is_stale() puts it straight back —
     so this is the written half rather than a second copy of the work: what
     was wrong with the last attempt, which is what tonight is working from. */
  const back = byTaskPriority(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.todo));
  out.innerHTML = (shown.length
    ? shown.map(queueRowHTML).join('')
    : '<div class="empty">Nothing to plan tonight. Everything eligible has a ' +
      'plan already, and none of them have changed since.</div>') +
    (back.length
      ? '<h4 class="fhead">Going back for another night</h4>' +
        back.map(planItemHTML).join('')
      : '');
  wireQueue();
  out.querySelectorAll('[data-plan-open]').forEach(btn => {
    const p = planList.find(x => x.url === btn.dataset.planOpen);
    btn.onclick = () => openPlanModal(p);
  });
  wireTodoColumn();
}

/* -------------------------------------------------------------------------
   One drag, four columns.

   Two kinds of card move around this view and they are not the same object. A
   task row is a card off the board that has never been planned, or whose plan
   has been superseded; a plan row is a written document about one. Both answer
   the same question — what should the night agent do with this — so both move
   between the same four columns, and one `drag` carries whichever was picked up.

   Where a card lands is the instruction, and it means the same thing for both
   kinds:

     Backlog            leave it alone. Task: held. Plan: parked, task held.
     To do              plan it tonight. Task: queued, at the rank dropped.
                        Plan: sent back with a reason, task released.
     Waiting for review not a drop target at all. Filling it is the agent's
                        half, which is why it draws with a dashed edge.
     Done               accepted. Plans only — there is nothing to accept about
                        a task nobody has planned yet, so a task dropped here
                        is refused with a word rather than silently ignored.
   ------------------------------------------------------------------------- */

/* Every column but Waiting for review takes drops. Wired once per render, on
   the container rather than on its rows, so an empty column is still a target. */
function wireColumnDrop(el, onDrop, canTake){
  if (!el) return;
  el.ondragover = e => {
    if (!drag || (canTake && !canTake(drag))) return;
    e.preventDefault();
    el.classList.add('coldrop');
  };
  el.ondragleave = e => { if (e.target === el) el.classList.remove('coldrop'); };
  el.ondrop = e => {
    if (!drag || (canTake && !canTake(drag))) return;
    e.preventDefault();
    el.classList.remove('coldrop');
    const d = drag;
    drag = null;
    onDrop(d);
  };
}

/* Start a drag from a plan row, wherever it is drawn. */
function wirePlanDrags(out){
  out.querySelectorAll('.planitem[draggable="true"]').forEach(row => {
    row.ondragstart = e => {
      drag = { kind:'plan', url: row.dataset.plan, from: 'plan' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.plan);
      row.classList.add('dragging');
    };
    row.ondragend = () => { drag = null; row.classList.remove('dragging'); };
  });
}

const draggedPlan = d => planList.find(x => x.url === d.url);

function wireQueue(){
  const out = $('#queueOut');
  if (!out) return;
  out.querySelectorAll('[data-qhold]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); holdTask(btn.dataset.qhold); };
  });
  out.querySelectorAll('[data-plan-goto]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); goToPlanTask(btn.dataset.planGoto); };
  });

  /* The same reorder gesture the sub-steps in the drawer use: drop above or
     below whichever card the cursor is over, decided by its midpoint. A card
     dragged in from the Backlog column lands the same way — the drop target
     decides the position whichever list the card came from. A plan dropped on
     a row has no rank to take, so it goes through the column handler below. */
  const rows = out.querySelectorAll('.qitem');
  const clear = () => rows.forEach(r => r.classList.remove('over-top','over-bottom','dragging'));
  rows.forEach(row => {
    row.ondragstart = e => {
      drag = { kind:'task', title: row.dataset.qtitle, from: 'queue' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.qtitle);
      row.classList.add('dragging');
    };
    row.ondragend = () => { drag = null; clear(); };
    row.ondragover = e => {
      if (!drag || drag.kind !== 'task') return;
      e.preventDefault();
      const r = row.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      row.classList.toggle('over-bottom', after);
      row.classList.toggle('over-top', !after);
    };
    row.ondragleave = () => row.classList.remove('over-top','over-bottom');
    row.ondrop = e => {
      if (!drag || drag.kind !== 'task') return;
      e.preventDefault(); e.stopPropagation();
      const r = row.getBoundingClientRect();
      const at = queueRows.findIndex(x => x.title === row.dataset.qtitle);
      const to = at + (e.clientY > r.top + r.height / 2 ? 1 : 0);
      clear();
      dropOnQueue(to);
    };
  });
  wirePlanDrags(out);
}

/* The To do column as a whole: a task dropped anywhere but on a row appends at
   the end, and a plan dropped anywhere at all goes back for another night. */
function wireTodoColumn(){
  wireColumnDrop($('#queueOut'), d => {
    if (d.kind === 'task') { drag = d; dropOnQueue(queueRows.length); return; }
    const p = draggedPlan(d);
    if (p) replanPlan(p);
  });
}

/* The single place a card's position in the queue actually changes, whichever
   list it started in. `toIndex` is where it lands, in queueRows' own terms —
   wireQueue works it out from the drop target before calling in. */
function dropOnQueue(toIndex){
  if (!drag || drag.kind !== 'task') return;
  const { title, from } = drag;
  drag = null;
  if (from === 'queue') {
    const at = queueRows.findIndex(r => r.title === title);
    if (at < 0) return;
    let to = toIndex;
    if (to > at) to--;
    if (to === at) return;
    queueRows.splice(to, 0, queueRows.splice(at, 1)[0]);
  } else if (from === 'held') {
    const at = queueHeld.findIndex(r => r.title === title);
    if (at < 0) return;
    const [row] = queueHeld.splice(at, 1);
    row.state = 'queued';
    row.why = '';
    unhold(title);
    queueRows.splice(toIndex, 0, row);
  } else {
    return;
  }
  queueRows.forEach((r, i) => { r.position = i + 1; });
  renderQueueList();
  renderBacklogList();
  saveQueueOrder(true);
}

const sameTitle = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
function hold(title){
  if (!queueHoldTitles.some(t => sameTitle(t, title))) queueHoldTitles.push(title);
}
function unhold(title){
  queueHoldTitles = queueHoldTitles.filter(t => !sameTitle(t, title));
}

function holdTask(title){
  const at = queueRows.findIndex(r => r.title === title);
  if (at < 0) return;
  const [row] = queueRows.splice(at, 1);
  row.state = 'held';
  row.why = 'held back from the board';
  queueHeld.push(row);
  hold(title);
  queueRows.forEach((r, i) => { r.position = i + 1; });
  renderQueueList();
  renderBacklogList();
  saveQueueOrder(false);
}

function releaseHeld(title){
  const at = queueHeld.findIndex(r => r.title === title);
  if (at < 0) return;
  const [row] = queueHeld.splice(at, 1);
  row.state = 'queued';
  row.why = '';
  unhold(title);
  queueRows.push(row);
  queueRows.forEach((r, i) => { r.position = i + 1; });
  renderQueueList();
  renderBacklogList();
  saveQueueOrder(false);
}

/* -------------------------------------------------------------------------
   Backlog — everything the queue does not contain and why: held back from
   the board on one hand, excluded by a rule in agents/night_agent/pick.py on the other.

   Only the first half is draggable. Holding is a board-only preference, so
   dragging a held card back into the queue is exactly the reverse of the
   Hold button and just as safe. A card excluded by a rule — blocked, parked,
   tagged short of ai:full, or waiting on a `start:` date — is excluded for a
   reason dragging cannot fix, so it is shown rather than offered: see the
   comment above pick.eligible() and pick.select() for why the order and hold
   files were deliberately never given a say over what the queue contains.
   ------------------------------------------------------------------------- */

function heldRowHTML(r){
  const meta = [r.bucket, r.column, r.agent].filter(Boolean).map(esc).join(' · ');
  const goto = gotoButtonHTML(r);
  return '<article class="qitem held" draggable="true" data-qtitle="' + esc(r.title) + '">' +
    '<div class="qhead">' +
      '<span class="qpos">—</span>' +
      '<span class="qtitle">' + esc(r.title) + '</span>' +
      '<button class="qhold" data-qrelease="' + esc(r.title) + '" ' +
        'title="Put it back in the queue">Release</button>' +
    '</div>' +
    (meta || goto
      ? '<div class="repmeta">' + meta + (goto ? (meta ? ' · ' : '') + goto : '') + '</div>'
      : '') +
    '<div class="qwhy">' + esc(r.why || '') + '</div>' +
  '</article>';
}

function renderBacklogList(){
  const out = $('#backlogOut');
  if (!out) return;
  const held = plansShown(queueHeld);
  const skipped = plansShown(queueSkipped);
  const parked = byTaskPriority(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.backlog));
  out.innerHTML =
    (held.length
      ? '<p class="help listlead">Drag into To do to plan it tonight.</p>' +
        held.map(heldRowHTML).join('')
      : '') +
    /* A parked plan is the written half of the same instruction: the task is
       held, and this is what the agent had already worked out about it. Kept
       openable rather than filed away, since taking it out of Backlog later is
       a decision better made having read it. */
    (parked.length
      ? '<h4 class="fhead">Plans parked here</h4>' + parked.map(planItemHTML).join('')
      : '') +
    (skipped.length
      ? '<details class="ufold"><summary>Not eligible (' + skipped.length + ')</summary>' +
        skipped.map(r =>
          '<div class="qskip"><span>' + esc(r.title) + '</span>' + gotoButtonHTML(r) +
          '<em>' + esc(r.why) + '</em></div>'
        ).join('') + '</details>'
      : '') +
    (!held.length && !parked.length && !skipped.length
      ? '<div class="empty">Nothing held back, and nothing excluded right now.</div>'
      : '');
  const wrap = out;
  wrap.querySelectorAll('[data-qrelease]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); releaseHeld(btn.dataset.qrelease); };
  });
  wrap.querySelectorAll('[data-plan-goto]').forEach(btn => {
    btn.onclick = e => { e.stopPropagation(); goToPlanTask(btn.dataset.planGoto); };
  });
  wrap.querySelectorAll('[data-plan-open]').forEach(btn => {
    const p = planList.find(x => x.url === btn.dataset.planOpen);
    btn.onclick = () => openPlanModal(p);
  });
  wirePlanDrags(wrap);
  wrap.querySelectorAll('.qitem.held').forEach(row => {
    row.ondragstart = e => {
      drag = { kind:'task', title: row.dataset.qtitle, from: 'held' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.qtitle);
      row.classList.add('dragging');
    };
    row.ondragend = () => { drag = null; row.classList.remove('dragging'); };
  });

  // Dropping a card from the queue anywhere on this column holds it back —
  // the drag equivalent of pressing Hold. There is nothing to position it
  // against, since a held card has no rank, so the whole column is the target
  // rather than any one row within it. A plan dropped here is parked, and its
  // task held with it.
  wireColumnDrop(wrap, d => {
    if (d.kind === 'task') { if (d.from === 'queue') holdTask(d.title); return; }
    const p = draggedPlan(d);
    if (p) parkPlan(p);
  }, d => d.kind === 'plan' || d.from === 'queue');
}

/* `ranked` says whether this save is him ordering the queue, and only a drag
   passes true.

   It matters because pick.py treats a stored order as him saying "this one
   first" and puts it above every other rule. Holding one card used to write the
   whole visible list as well, which stamped whatever order the picker happened
   to produce into the file as if it had been chosen — on 5 Sep 2026 that froze
   a bucket ordering nobody asked for and outranked the rules for good. A hold
   is a hold: it changes what is held and leaves the ranking alone.

   Titles the server has stored but that are not on screen — held cards from an
   earlier session, tasks blocked this week — are carried through rather than
   dropped, so releasing one later puts it back where it was rather than at the
   end of the queue. */
async function saveQueueOrder(ranked){
  const norm = t => String(t || '').trim().toLowerCase();
  let order = queueOrder;
  if (ranked) {
    const shown = queueRows.map(r => r.title);
    const seen = new Set(shown.map(norm));
    order = shown.concat(queueOrder.filter(t => !seen.has(norm(t))));
  }
  /* The hold list as held, not as drawn. A task can be held and off screen —
     its plan is out for review, or it went Blocked this week — and rebuilding
     this from the rows released every one of those on the next save. */
  const hold = queueHoldTitles;
  try {
    await postJSON('/queue/order', { order, hold });
    queueOrder = order;
  } catch (err) {
    showToast('Could not save the queue order: ' + (err.message || err), 'bad');
  }
}

async function renderQueue(){
  const out = $('#queueOut');
  const back = $('#backlogOut');
  if (!out) return;
  try {
    const res = await fetch('/queue.json?t=' + Date.now(), { cache:'no-store' });
    if (res.status === 404) {
      out.innerHTML = '<div class="empty">No night agent in this checkout, so there is ' +
        'nothing queued and nothing to order.</div>';
      if (back) back.innerHTML = '<div class="empty">Same here — nothing to hold back.</div>';
      return;
    }
    if (!res.ok) {
      const msg = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about the queue yet.</div>';
      out.innerHTML = msg;
      if (back) back.innerHTML = msg;
      return;
    }
    const q = await res.json();
    queueRows = q.queue || [];
    queueHeld = q.held || [];
    queueSkipped = q.skipped || [];
    queueOrder = q.order || [];
    queueHoldTitles = q.hold || [];
    renderQueueList();
    renderBacklogList();
    wireTodoColumn();
  } catch (err) {
    const msg = '<div class="err">Could not read the queue. ' +
      esc(String(err.message || err)) + '</div>';
    out.innerHTML = msg;
    if (back) back.innerHTML = msg;
  }
}

/* -------------------------------------------------------------------------
   Queue / Doing — one card asking whichever question is actually live: what
   would tonight plan (Queue), or what the agent is doing this second (Doing).
   Never both at once. A run in flight makes "what would tonight plan" a
   description of the recent past rather than of right now, so the card
   becomes the thing that's true instead of carrying two things that answer
   the same underlying question — "is anything about to happen, or is it
   happening" — at two different altitudes.

   Read from the lock directory and the log, which is the only honest way to
   answer either half: the agents are subprocesses of a shell launchd
   started, and nothing here can ask them anything. One task in flight at a
   time, because plan.py runs its agents strictly one at a time — a runaway
   agent then costs one timeout rather than the whole night.
   ------------------------------------------------------------------------- */

let flightTimer = null;
/* The last payload renderNightAgent read. Kept because the run-results fold it
   feeds lives in a modal that is shut most of the time: opening it has to draw
   the fold from something, and the poll already has the only copy. */
let lastNightAgent = null;

function flightRowHTML(r, kind){
  return '<div class="frow ' + kind + '">' +
    '<span class="fname">' + esc(r.title) + '</span>' +
    '<span class="fmeta">' + esc(
      kind === 'done' ? r.took + 's · $' + r.cost.toFixed(2) : (r.why || '')
    ) + '</span>' +
  '</div>';
}

/* The card's own identity — title, lead sentence, which of #queueOut /
   #doingOut is showing, whether the Run button makes sense right now — all
   follow the same one fact: is a run actually live. A dead run (the lock
   gone, the last task never finished) doesn't count as "actively running",
   so it surfaces as a banner over the queue rather than taking over the
   Doing slot — the queue is still the true answer to "what happens next"
   when nothing is going. */
function renderQueueDoingHead(live, orphan){
  const title = $('#qdTitle');
  if (title) title.textContent = live ? 'Doing' : 'To do';
  const lead = $('#qdLead');
  if (lead) lead.textContent = live
    ? 'What the night agent is doing right now.'
    : 'What tonight\'s run picks up, in order.';
  const btn = $('#runQueueBtn');
  // Only when nothing is going. run.sh holds a lock and would refuse a
  // second batch anyway, but it refuses by logging and exiting cleanly,
  // which from a button looks exactly like starting — so the button is not
  // offered rather than offered and quietly ignored.
  if (btn) btn.classList.toggle('hidden', live);
  const doingOut = $('#doingOut');
  const queueOut = $('#queueOut');
  if (doingOut) doingOut.classList.toggle('hidden', !live);
  if (queueOut) queueOut.classList.toggle('hidden', live);
  const orphanOut = $('#qdOrphan');
  if (!orphanOut) return;
  if (!live && orphan) {
    orphanOut.classList.remove('hidden');
    orphanOut.innerHTML = '<div class="err">The last run stopped part way through <strong>' +
      esc(orphan.title) + '</strong> and never finished. Its lock is gone, so nothing is ' +
      'running now.</div>';
  } else {
    orphanOut.classList.add('hidden');
    orphanOut.innerHTML = '';
  }
}

/* Only ever drawn while #doingOut is actually showing — see
   renderQueueDoingHead — so there is no idle or orphan case to handle here;
   those are the queue's job now. */
function renderDoing(n){
  const out = $('#doingOut');
  if (!out) return;
  const when = s => s ? esc(s.slice(11, 16)) : '';
  if (n.live && n.current) {
    out.innerHTML = '<div class="fnow"><i class="fspin"></i>' +
      '<div><strong>' + esc(n.current.title) + '</strong>' +
      '<div class="repmeta">' + esc(n.current.agent) + ' · started ' +
      when(n.current.since) + '</div></div></div>';
  } else if (n.live) {
    out.innerHTML = '<div class="fnow"><i class="fspin"></i><div><strong>A run is going</strong>' +
      '<div class="repmeta">between tasks — nothing in flight this second</div></div></div>';
  } else {
    out.innerHTML = '';
  }
}

/* The batch's own numbers — when it started, how far through it is, what
   made it stop early. Sits in Done rather than in the Queue/Doing card: this
   is a record of the run, the same kind of fact "Latest run costs" is, not a
   description of what's happening or about to. */
function renderDoneStats(n){
  const out = $('#doneStatsOut');
  if (!out) return;
  let html = '';
  if (n.started) {
    html += '<dl class="schedmeta"><dt>Run started</dt><dd>' +
      esc(n.started.slice(0, 16)) + '</dd>' +
      '<dt>Planned</dt><dd>' + n.done.length +
      (n.toPlan ? ' of ' + n.toPlan : '') + '</dd>' +
      (n.left ? '<dt>Left</dt><dd>' + n.left + '</dd>' : '') +
      '</dl>';
  }
  if (n.stopped) html += '<p class="fstop">' + esc(n.stopped) + '</p>';
  if (!n.started) {
    html += '<p class="help">The log has nothing since the last run started. ' +
      'A wake that found no window logs its reason and stops without starting one.</p>';
  }
  out.innerHTML = html;
}

/* What the last run actually cost — sits in Token Session rather than here,
   because it is a cost figure like everything else on that card, not a
   report of what the run is doing right now or what it planned, which are
   Queue/Doing's and Done's jobs. Folded shut like "What runs on a clock" used
   to be and moved below the usage chart, which is what's actually read first
   on this card; the date and the total move onto the fold's own summary
   line, so they're still readable without opening it. It sits outside
   #usageOut's own markup (a sibling, not nested in it), so renderUsage()'s
   full redraw on every range click never touches it and this needs no cache
   of its own. */
function renderRunResults(n){
  const out = $('#runResultsOut');
  const fold = $('#runResultsFold');
  const summary = $('#runResultsSummary');
  if (!out) return;
  let html = '';
  let label = 'Latest run costs';
  if (n.done.length) {
    const spent = n.done.reduce((a, d) => a + d.cost, 0);
    // The date the batch started, not the date of any one task within it —
    // a run that crosses midnight still reads as one night's work.
    const when = n.started || (n.done[0] || {}).at;
    const date = when
      ? new Date(when.replace(' ', 'T')).toLocaleDateString(undefined, { day:'numeric', month:'short' })
      : '';
    label += (date ? ' — ' + date : '') + ' · $' + spent.toFixed(2);
    html += n.done.map(d => flightRowHTML(d, 'done')).join('');
  }
  if (n.failed.length) {
    html += '<h4 class="fhead">Failed</h4>' +
      n.failed.map(d => flightRowHTML(d, 'failed')).join('');
  }
  out.innerHTML = html;
  if (summary) summary.textContent = label;
  if (fold) fold.classList.toggle('hidden', !n.done.length && !n.failed.length);
}

/* Spending money is a deliberate press and then a second one. The confirm says
   what it will cost and what it will do, because "run the agent" does not
   convey either — and the one thing worth being clear about is that it plans
   and never executes, which is true of the agent whatever hour it runs at. */
function confirmNightAgentRun(){
  const n = queueRows.length;
  showModal('Run the night agent now?', 'It normally waits for the small hours',
    '<div class="repdoc">' +
      '<p>' + (n ? 'It will work through the <strong>' + n + '</strong> task' +
        (n === 1 ? '' : 's') + ' in the queue, in that order, one agent each'
        : 'There is nothing in the queue, so it will start and stop') +
      ', and write a plan for each into Waiting for review.</p>' +
      '<p>Up to <strong>$12</strong> across the batch and <strong>$2</strong> a task, ' +
      'stopping early if either runs out. It ignores the clock and the usage window, ' +
      'so it will spend in whatever window is open now — including the one you are ' +
      'working in.</p>' +
      '<p>Nothing it writes is carried out. Every plan waits for you.</p>' +
    '</div>',
    [{ label:'Run it', primary:true, run: startNightAgentRun },
     { label:'Cancel' }]);
}

async function startNightAgentRun(){
  try {
    await postJSON('/night_agent/run');
    showToast('The agent is running. Watch it here.', 'good');
    // The log gets its first line within a second or two; the poll's own ten
    // seconds is too long to wait when you have just pressed the button.
    setTimeout(renderNightAgent, 1200);
  } catch (err) {
    showToast('Could not start it: ' + (err.message || err), 'bad');
  }
}

/* Polls while the tab is on Plans and stops the moment it is not. Faster while
   a run is live, because that is the only time anything moves; an agent takes
   minutes, so ten seconds is frequent enough to watch and rare enough to
   ignore. */
async function renderNightAgent(){
  clearTimeout(flightTimer);
  if (!$('#queueDoingCard')) return;
  let live = false;
  try {
    const n = await getJSON('/night-agent.json');
    lastNightAgent = n;
    live = !!n.live;
    const errBox = $('#nightAgentErr');
    if (errBox) errBox.classList.add('hidden');
    renderQueueDoingHead(live, n.orphan);
    renderDoing(n);
    renderDoneStats(n);
    renderRunResults(n);
  } catch (err) {
    const errBox = $('#nightAgentErr');
    if (errBox) {
      errBox.classList.remove('hidden');
      errBox.textContent = 'Could not read the run log. ' + String(err.message || err);
    }
  }
  flightTimer = setTimeout(() => {
    if (state.view === 'plans' && $('#queueDoingCard')) renderNightAgent();
  }, live ? 10000 : 60000);
}

/* Token Session and the clock card, which took a fifth track beside the four
   columns until 12 Sep 2026. Both are reference rather than decision — the
   chart is a glance at spend, the clock card only changes when the plist does
   — so they are a press away instead of costing the view a column and the
   sideways scroll that came with it. Opened from the Backlog card's head,
   which had a bare h3 where the queue already had a head with a button in it.

   Everything in here draws by id, so the render calls come after showModal has
   put the markup in the DOM; before that, each of them finds nothing and
   returns. */
function openRefCards(){
  showModal('Spend, and what runs on a clock',
    'Both are reference. Nothing on either changes what tonight does.',
    '<div class="pvcol">' +
      '<div class="listcard schedview usage"><h3>Token Session</h3>' +
        '<div id="usageOut">Loading…</div>' +
        '<details class="ufold hidden" id="runResultsFold"><summary id="runResultsSummary">Latest run costs</summary>' +
          '<div id="runResultsOut"></div>' +
        '</details>' +
      '</div>' +
      '<div class="listcard reportsview clockview"><h3>What runs on a clock</h3>' +
        '<div id="schedOut">Loading…</div>' +
      '</div>' +
    '</div>',
    [{ label:'Close', primary:true }], { wide:true });
  renderSched();
  renderUsage();
  // The poll's own copy rather than a second fetch: the fold is a record of a
  // run that has already finished, and renderNightAgent is the only thing that
  // reads that route.
  if (lastNightAgent) renderRunResults(lastNightAgent);
}

async function renderPlansView(){
  $('#lists').innerHTML =
    '<div class="lists pview">' +
      '<div class="listcard reportsview backlogview">' +
        '<div class="cardhead"><h3>Backlog</h3>' +
          '<button class="btn mini" id="refCardsBtn" type="button">Spend and clocks</button></div>' +
        '<p class="help listlead">The agent leaves these alone. Held back by you, ' +
          'or excluded by a rule.</p>' +
        '<div id="backlogOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview queueview" id="queueDoingCard">' +
        '<div class="cardhead"><h3 id="qdTitle">To do</h3>' +
          '<button class="btn mini" id="runQueueBtn" type="button">Run now</button></div>' +
        '<div class="err hidden" id="nightAgentErr"></div>' +
        '<h4 class="fhead">Status</h4>' +
        '<div id="statusOut">Loading…</div>' +
        '<div class="hidden" id="qdOrphan"></div>' +
        '<p class="help listlead" id="qdLead">What tonight\'s run would plan, in order.</p>' +
        '<div id="queueOut">Loading…</div>' +
        '<div class="hidden" id="doingOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview processed agentcol"><h3>Waiting for review</h3>' +
        '<div id="doneStatsOut"></div>' +
        '<p class="help listlead">The agent\'s own column — what it has worked out, ' +
          'waiting on you. Drag out of it, not into it.</p>' +
        '<div id="plansOut">Loading…</div>' +
      '</div>' +
      '<div class="listcard reportsview decided"><h3>Done</h3>' +
        '<p class="help listlead">Accepted as written. From here it feeds the ' +
          'execution board\'s Backlog.</p>' +
        '<div id="plansDecided">Loading…</div>' +
      '</div>' +
    '</div>';
  $('#runQueueBtn').onclick = () => confirmNightAgentRun();
  $('#refCardsBtn').onclick = () => openRefCards();
  const out = $('#plansOut');
  try {
    const res = await fetch('/plans.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      out.innerHTML = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about plans yet.</div>';
      return;
    }
    planList = (await res.json()).plans || [];
    if (!planList.length) {
      out.innerHTML = '<div class="empty">Nothing yet. The night agent writes into ' +
        '<code>data/plans/</code>; the queue on the left is what it would pick up tonight.</div>';
      /* The Decided column has no reason to explain where plans come from —
         the column beside it just did — so it only says it is empty rather
         than sitting on "Loading…" forever. */
      const dec = $('#plansDecided');
      if (dec) dec.innerHTML = '<div class="empty">Nothing ruled on yet.</div>';
    } else {
      renderPlansList();
    }
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the plan list. ' +
      esc(String(err.message || err)) + '</div>';
  }
  // The rest after the plans have painted: reconstructing a month of windows
  // is about a second, and nothing else should wait on it. renderUsage() runs
  // even with its chart shut away in the modal, because the same call is what
  // feeds the Status line on the To do card — see renderStatus().
  renderQueue();
  renderNightAgent();
  renderUsage();
}

