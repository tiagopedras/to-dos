'use strict';

/* =========================================================================
   4b2b. Plans — what the planning agent worked out while nobody was watching.

   Files in data/<dataset>/plans/<night>/, listed by the server at /plans.json,
   read exactly the way written reports are. They are a separate view rather
   than a third column in Reports because they answer the opposite question: a
   report says what happened, a plan proposes what to do, and a plan stops being
   true the moment it is acted on.

   A plan is a work item like any other and carries the shape every stream in
   here now shares: a `state`, an `owner` who is expected to move it next, and a
   `seen` flag. PACKAGES/work_streams/CONTRACT.md is the authority, and
   agents/planning_agent/stream.json is this stream's manifest, holding its own word
   for each state.

   Since 12 Sep 2026 this view has the same four columns as the board itself,
   and for the same reason: where he puts a card is the instruction, not a
   label describing one. Backlog, To do, Waiting for review, Done.

     backlog / me               leave it alone; the planning agent does not touch it
     ready   / planning-agent      plan it tonight, with the reason he gave
     review  / me               the agent has written one; `seen` says if he looked
     done    / me               he accepts it, and the implementing agent's half starts

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
   board posts the move to /stream/apply and the planning agent's own stream.py
   performs it, writing the plan file and its ledger row together. Until today
   this view's server half wrote those files itself, which is the arrangement
   agents-dashboard/CONTRACT.md already refuses for schedules, and it had
   already produced the bug where a plan's status and its ledger row disagreed
   for ever. Nothing in this view goes near todo.md.
   ========================================================================= */

const planBodies = {};
let planList = [];

/* A folded plan is one whose agent stopped and asked rather than guessing —
   see the folding rule in agents/planning_agent/PLAN-BRIEF.md. It is marked here rather than
   left to read like any other, because the two want opposite things from him:
   a plan wants reading, a fold wants answering. */
function planClass(p){
  /* A superseded plan still reads as the rejection it was. It is finished, but
     what it carries is the reason he sent it back, and that is the only written
     record of what he asked for. */
  if (p.resolution === 'declined') return ' actioned';
  if (p.resolution === 'superseded') return ' redo';
  /* Green, not dimmed, for a plan accepted under the old spelling: it is
     sitting in Ready to be produced with work still owed on it, so it reads
     the way every other card in that column does. See planColumn(). */
  if (p.state === 'done') return p.resolution === 'actioned' ? ' agreed' : ' actioned';
  if (p.state === 'accepted') return ' agreed';
  if (p.state === 'backlog') return ' parked';
  if (p.state === 'doing') return '';
  if (p.state === 'ready') return p.owner === 'planning-agent' ? ' redo' : ' agreed';
  return p.seen ? ' read' : '';
}

/* One word for the state a card is in, for the badge. His words rather than the
   canonical ones, and the same four the columns are named after wherever the
   card is sitting in the column that word describes. */
function planWord(p){
  /* `accepted` and `done` are two answers since 12 Sep 2026 and the badge says
     which: he has agreed to it, or the work it describes has finished. They
     were one word and one column until then. A `done / actioned` plan is one
     accepted under the old spelling, so it reads as accepted rather than as
     finished — see planColumn(), which puts it in the same column that word
     names. */
  if (p.state === 'done') {
    /* Three ways a plan can be closed, and the badge says which. `declined` is
       the one added 13 Sep 2026: a plan he read and turned down outright.
       Before it, the only ways to say no were Plan it again — which sends the
       task round for a second opinion he never asked for — and Leave it alone,
       which drops it in Backlog reading as undecided. */
    if (p.resolution === 'declined') return 'declined';
    if (p.resolution === 'superseded') return 'replaced';
    return p.resolution === 'actioned' ? 'accepted' : 'finished';
  }
  if (p.state === 'accepted') return 'accepted';
  if (p.state === 'backlog') return 'parked';
  if (p.state === 'doing') return 'being planned';
  if (p.state === 'ready') return p.owner === 'planning-agent' ? 'planning again' : 'handed over';
  return p.seen ? 'read' : 'new';
}

/* How far the implementing agent's half has got, on a plan he accepted.
   Since 13 Sep 2026 there is one board rather than two: Execution was a second
   view over a second document per accepted plan, and the gate between them
   filtered nothing — it was a step to remember. So the stage rides on the plan
   card instead.

   Six columns rather than eight, decided the same day. Where a card sits is the
   instruction everywhere else in the app, and by that rule these would be
   columns; they are not, because the implementing agent only ever runs from a
   session he is sitting in, so there is never a card to watch move. If that
   changes, `production` is what the two extra columns would be drawn from —
   the field is already the right shape for it. */
function productionWord(p){
  if (p.production === 'doing') return 'being made';
  if (p.production === 'review') return 'reported back';
  if (p.production === 'done') return 'produced';
  if (p.state === 'accepted') return 'not started';
  return '';
}

/* The plan card's left stripe. Every card in the app carries one; a task card's
   is its bucket's colour, and a plan's is this. Not the bucket, because a plan
   is one proposal about one task rather than a thing belonging to a bucket, and
   not a fixed red — which is what it was until 12 Sep 2026 as a top border, and
   which spent the loudest colour in the palette announcing "this is a plan" on
   a view where everything is one.

   So colour is spent only where it earns attention: something has arrived, or
   something is settled. Everything in between takes the ordinary line colour
   and says what it is in its badge instead.

     new                            blue,  the accent
     accepted, handed over          green
     read, planning again, parked,
     finished, replaced             the line colour */
function planStripe(p){
  if (p.state === 'review' && !p.seen) return 'var(--b1)';
  /* Reported back and not yet looked at is the other thing that has just
     arrived, so it takes the same colour as a new plan. Before the fold this
     card was on a different board entirely and could not say so here. */
  if (p.production === 'review' && !p.seen) return 'var(--b1)';
  if (isAgreed(p)) return 'var(--green)';
  return 'var(--line)';
}

/* Which of the six columns a plan draws in. One function, so the renderers,
   the drop handlers and the counts can never disagree about where a card is.

   Six since 12 Sep 2026, mirroring the board's own six. Doing was a Status
   block inside To do, which meant the run that is happening now was described
   rather than drawn; and the old Done column held two different facts at once
   — plans he had accepted, whose work had not started, alongside plans whose
   work was finished — which is what the `accepted` state was added to split.
   Ready to be produced is that column renamed to say what it is. */
const PLAN_COL = { backlog:'backlog', todo:'todo', doing:'doing',
                   review:'review', produced:'produced', done:'done' };
function planColumn(p){
  if (p.state === 'backlog') return PLAN_COL.backlog;
  if (p.state === 'ready' && p.owner === 'planning-agent') return PLAN_COL.todo;
  if (p.state === 'doing') return PLAN_COL.doing;
  if (p.state === 'review') return PLAN_COL.review;
  /* `done` covers both halves of finished: work that got carried out, and a
     rejection a later plan answered. What it does not cover is `actioned`,
     which is what accepting a plan wrote until 12 Sep 2026 — every plan
     accepted before that date is `done / actioned` on disk and belongs in
     Ready to be produced, so it falls through to the line below. Nothing
     rewrites those files; core/migrations/migrate-plans-accepted.py tidies
     them if he wants them tidied, and this reads them correctly either way. */
  if (p.state === 'done' &&
      (p.resolution === 'completed' || p.resolution === 'superseded' ||
       p.resolution === 'declined')) return PLAN_COL.done;
  /* `accepted`, and the `ready / implementing-agent` a plan agreed before
     11 Sep 2026 still carries. Both mean he has accepted it and the work has
     not finished, which is what Ready to be produced says. It is also the
     fallback, so a state this view has never heard of is drawn rather than
     dropped. */
  return PLAN_COL.produced;
}

/* Whether an agent may pick this up and which one. `ready` owned by the night
   agent is a plan he sent back; `ready` owned by the implementing agent is one he
   approved. Both mean the same thing about the plan, which is why they are one
   state and not two. */
const isRedo = p => p.state === 'ready' && p.owner === 'planning-agent';
/* Accepted, and the work not finished. `accepted` is the state that says so
   since 12 Sep 2026; `ready / implementing-agent` is what it was called for the
   day between the six states arriving and this one, and plans written in that
   window are still on disk saying it. */
const isAgreed = p => p.state === 'accepted' ||
  (p.state === 'ready' && p.owner === 'implementing-agent') ||
  (p.state === 'done' && p.resolution === 'actioned');

/* When a plan was actually written, to the minute — `generated:` if the file
   has one, falling back to the file's own mtime for a plan written before
   this field existed. Both are naive local timestamps already, the same as
   backupWhen's input, so it reads the same format the Backups list already
   uses for "when did this actually happen". */
/* How many times this task has been sent back and re-planned, and when — read
   straight off the file's own History section (server.py's plan_meta()), not
   a count kept anywhere else. A plan on its first pass has nothing to add
   here, since "revision 1" reads as a fact only a second one makes worth
   knowing. */
function planRevisionsLabel(p){
  const revs = p.revisions || [];
  if (revs.length < 2) return '';
  return revs.length + ' revisions — ' + revs.map(r => reportDay(r.date)).join(', ');
}

function planGeneratedLabel(p){
  const iso = p.created || p.generated || p.modified;
  return iso ? backupWhen(iso) : (p.night || '');
}


/* Opening one marks it read, on the grounds that having it open is what being
   read means. Actioned stays a deliberate press, because that is a claim about
   the work rather than about him, and it is the one the runner acts on. */
function openPlanModal(p){
  const sub = [p.bucket, p.column, planGeneratedLabel(p), p.agent].filter(Boolean).map(esc).join(' · ');
  /* Three buttons and only three: the move forward, the move back, and the way
     out. Forward is named after the column it lands in, which is the one that
     changes with where the card already is. Back is always a replan rather
     than a literal step, decided 13 Sep 2026: stepping a plan in Ready to be
     produced back into Waiting for review says nothing, while sending the task
     round to be written again tonight is the thing he wants from there, so one
     button means the same move from every column. Turn it down ends the idea
     rather than the plan of it. The modal's own × in the corner is the
     dismissal, so there is no Close button left to press by reflex.

     Leave it alone was the fourth until the same date. Four options read as
     four verdicts to weigh rather than three moves and an exit, and weighing
     them is what a plan modal least needs. Parking is still reachable, by
     dragging the card into Backlog, which calls the same parkPlan() the button
     called. */
  openDocModal({
    title: p.title, sub, cache: planBodies, url: p.url, load: loadPlanBody,
    buttons: planColumn(p) === PLAN_COL.produced
      ? [{ label:'It is finished', agree:true, run: () => finishPlan(p) },
         { label:'Plan it again', reject:true, run: () => replanPlan(p) },
         { label:'Turn it down', reject:true, run: () => declinePlan(p) }]
      : [{ label:'Accept it', agree:true, run: () => acceptPlan(p) },
         { label:'Plan it again', reject:true, run: () => replanPlan(p) },
         { label:'Turn it down', reject:true, run: () => declinePlan(p) }]
  });
  if (!p.seen) movePlan(p, 'review', 'me', { seen:true, quiet:true });
}

/* The three moves, one per column he can put a plan in. Each one is the drop
   handler and the modal button both, so dragging a card and pressing a button
   cannot come to mean different things.

   Nothing runs from any of them. The implementing agent is invoked from a session,
   on purpose, so that a run he has not asked for cannot start from a stray
   click on a board tab left open overnight. */

/* Ready to be produced. He accepts the plan as written, which is the end of
   this board's involvement and the start of the implementing agent's: an accepted
   plan is what feeds the execution board's Backlog. The planning agent stops
   re-planning the task from here.

   It lands in `accepted` rather than `done`, and that is the whole reason the
   seventh state exists. Accepting a plan and the work it describes finishing
   are two facts, and putting both in `done` meant one column answering two
   questions — which is what "Done" on this view had been doing. Nothing is
   closed yet, so there is no resolution to give, and the implementing agent owns it
   from here because what happens next is a run rather than a decision. */
function acceptPlan(p){
  showModal('Accept this plan?', esc(p.title),
    '<div class="repdoc">' +
      '<p>It moves to <strong>Ready to be produced</strong>, and the planning agent ' +
      'leaves the task alone from here rather than writing a second opinion over it.</p>' +
      '<p>Nothing runs now. It lands in the execution board\'s Backlog, and the ' +
      'implementing agent only picks it up once you move it to To do there.</p>' +
    '</div>',
    [{ label:'Yes, accept it', primary:true, run: () => movePlan(p, 'accepted', 'implementing-agent') },
     { label:'Cancel' }]);
}

/* Done. The work the plan describes has finished. Not a verdict on the plan —
   he gave that when he accepted it — so this asks nothing and carries no
   reason; it is the record closing. `actioned` because the plan was carried
   out, which is what distinguishes it from the `superseded` a replaced
   rejection carries. */
function finishPlan(p){
  showModal('Mark this finished?', esc(p.title),
    '<div class="repdoc">' +
      '<p>The work this plan describes is done. It moves to <strong>Done</strong> ' +
      'and stays there as the record.</p>' +
    '</div>',
    [{ label:'Yes, it is finished', primary:true, run: () => movePlan(p, 'done', 'me', { resolution:'completed' }) },
     { label:'Cancel' }]);
}

/* Declined. He has read the plan and does not want the idea at all — which the
   other three moves could not say. Plan it again sends the task round for a
   second opinion he never asked for, and Leave it alone drops it in Backlog
   where it reads as undecided and the picker can still reach the task.

   A resolution rather than an eighth state, decided 13 Sep 2026: `done` already
   closes an item with `resolution` saying how, this stream already writes two,
   and a third is the cheaper answer. It carries the same reason the redo path
   collects — what was wrong with it is worth keeping whether or not anything
   acts on it — and it draws in Done beside completed and replaced, because a
   declined plan should read as its own word next to those rather than sit
   somewhere separate from them. */
let declineText = '';
function declinePlan(p){
  declineText = '';
  showModal('Turn this one down?', esc(p.title),
    '<div class="repdoc">' +
      '<p>The idea itself is turned down, not just this plan of it. It moves to ' +
      '<strong>Done</strong> and stays there as the record, and the planning ' +
      'agent will not come back to the task.</p>' +
      '<p>Say why, so the record is worth reading later.</p>' +
      '<textarea class="redoinput" id="declineWhy" rows="3" ' +
        'placeholder="Why this is not worth doing"></textarea>' +
    '</div>',
    [{ label:'Yes, turn it down', primary:true, keep:true, run: () => {
        const el = document.querySelector('#declineWhy');
        declineText = (el && el.value || '').trim();
        if (!declineText) { if (el) el.focus(); return; }
        closeModal();
        movePlan(p, 'done', 'me', { resolution:'declined', reason: declineText });
      } },
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
        movePlan(p, 'ready', 'planning-agent', { reason: why, release: true });
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
   and the task itself joins the hold list, which is the only thing agents/planning_agent/pick.py
   actually reads. Parking the plan and leaving the task queued would have
   tonight write a fresh plan for a task he just took off the agent. */
function parkPlan(p){
  showModal('Leave this one alone?', esc(p.title),
    '<div class="repdoc">' +
      '<p>The plan is parked in <strong>Backlog</strong> and the task is held back ' +
      'from the queue, so the planning agent does not touch it until you move it ' +
      'back to To do.</p>' +
    '</div>',
    [{ label:'Yes, leave it alone', primary:true, run: () => movePlan(p, 'backlog', 'me', { hold: true }) },
     { label:'Cancel' }]);
}

/* The two sections of a plan that are not for him. `Context` is the night's
   research trail — what it read, what it ruled out, what it could not
   establish — and `History` is one line per revision. Both are in the plan
   file because the implementing agent reads one and the next re-plan reads the
   other, and both stay out of the modal because reading them again is exactly
   the noise that stops a plan being read at all. Named rather than positional,
   so a plan written before this still renders. */
// History drops out of PLAN_UNSHOWN, 13 Sep 2026: a plan sent back and
// written again used to read identically to one written for the first time,
// and History is the previous revision's own line saying otherwise.
const PLAN_UNSHOWN = ['Context'];

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
       touches it. A plan's own state means nothing to agents/planning_agent/pick.py — it reads
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
/* Done, and the two ways a plan gets there. Finished is work he accepted and
   that got carried out; replaced is a rejection a later plan answered, which
   is also closed but is not work anybody did. Calling both "accepted" was the
   old column's problem — it claimed he had acted on plans he had only ever
   sent back.

   The `handed over` and `redo` options this list used to carry have gone. Both
   describe plans that now sit in other columns — Ready to be produced and To
   do — so neither could ever match anything here, which is what splitting the
   old Done column in two made visible. */
const DONE_FILTERS = [
  { key:'completed', label:'finished', match: p => p.state === 'done' && !redoReplaced(p) },
  { key:'replaced',  label:'replaced', match: p => redoReplaced(p) },
];
/* The chips narrow a column; they never choose it. Which column a plan is in is
   planColumn() and nothing else, so a folded plan sits wherever its state puts
   it rather than staying in front of him asking a question he has answered. */

/* Whether a plan he sent back has already been answered by a later one.

   Sending a plan back does not park the task: `is_stale()`
   (agents/planning_agent/pick.py) treats `redo` as a reason to plan it again, so
   the task goes straight back into the queue and the next run writes a fresh
   plan under its own night. The rejected file keeps `status: redo` for good,
   because the note on it is the only written record of what he asked for —
   which left three cards on this column reading as work stalled when the
   replacements had been sitting in the Inbox for days.

   So a later plan for the same task is the replacement, and that is decided
   from `planList` alone: every row carries the night it was written and the
   task it is for, so this needs no route and no read of the planning agent's
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

/* The complement to priority order: what landed last night, rather than what
   matters most. planGeneratedLabel() already resolves the same precedence for
   the row's own display, so the order and the words next to it never disagree. */
function byNightWritten(list){
  const key = p => p.created || p.generated || p.modified || p.night || '';
  return list.slice().sort((a, b) => key(b).localeCompare(key(a)));
}

/* Plans has no equivalent of the board's file order — a folder of plan files
   carries no hand order — so its second mode is date written rather than
   manual, and it needs a key of its own: four of the six column names here are
   the board's names too (PROJECT_SORT_KEY is the precedent for a view needing
   its own key rather than sharing state.sort). Priority is the default, same
   as it has always behaved. */
const PLANS_SORT_KEY = 'todo-board-plans-sort';
function readPlansSort(){
  try { return JSON.parse(localStorage.getItem(PLANS_SORT_KEY) || '{}') || {}; } catch (e) { return {}; }
}
let plansSort = readPlansSort();
function plansSortMode(col){ return plansSort[col] === 'night' ? 'night' : 'priority'; }
function setPlansSortMode(col, mode){
  if (mode === 'night') plansSort[col] = 'night'; else delete plansSort[col];
  try { localStorage.setItem(PLANS_SORT_KEY, JSON.stringify(plansSort)); } catch (e) {}
}
function orderPlans(list, col){
  return plansSortMode(col) === 'night' ? byNightWritten(list) : byTaskPriority(list);
}
/* The toggle itself, the same shape as the board's own .sortbtn — a prop
   rather than a node found after a paint, closed over the column it governs. */
function plansSortBtn(col){
  const mode = plansSortMode(col);
  return BoardUI.h('button', {
    className: 'sortbtn' + (mode === 'night' ? ' on' : ''),
    type: 'button',
    title: mode === 'priority'
      ? 'Showing highest impact for the lightest lift first. Click to sort by when it was written.'
      : 'Showing what was written most recently. Click to sort by impact against effort.',
    onClick: () => { setPlansSortMode(col, mode === 'priority' ? 'night' : 'priority'); renderPlansList(); }
  }, mode === 'priority' ? 'by priority' : 'by night');
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
/* A dropdown in the column's own head since 12 Sep 2026, not a row of chips
   inside it. The chips were the first thing in the body, above the cards they
   narrowed, which cost a line of the column to a control that is mostly left
   on All — and at 322px wide, six statuses wrapped it to two and three rows.
   The header is where a control governing the whole column belongs, and the
   same `.dropdown` / `.dropdown-panel` / `.dropdown-item` shape the Status
   filter and the drawer's Bucket field already use, rather than a fourth kind
   of popover.

   It still draws only the options with something behind them, for the same
   reason: the bucket tabs narrow this list too, so a status that exists
   somewhere may have nothing in the column being shown, and an option leading
   to an empty column is worse than no option. */
function colFilterHTML(id, shown, filters, current){
  const counts = filters
    .map(f => ({ f, n: shown.filter(f.match).length }))
    .filter(x => x.n);
  if (!counts.length) return '';
  const active = counts.find(x => x.f.key === current);
  const label = active ? active.f.label + ' ' + active.n : 'All ' + shown.length;
  const opt = (key, text, n, on) =>
    '<button type="button" class="dropdown-item statusopt' + (on ? ' on' : '') + '"' +
      ' role="menuitemradio" aria-checked="' + on + '" data-planfilter="' + esc(key) + '">' +
      esc(text) + '<span class="n">' + n + '</span></button>';
  return '<span class="dropdown colfilter" data-colfilter="' + esc(id) + '">' +
    '<button class="colfilter-btn" type="button" aria-expanded="false"' +
      ' title="Narrow this column">' + esc(label) +
      '<span class="caret" aria-hidden="true">\u25be</span></button>' +
    '<div class="dropdown-panel alignright hidden" role="menu" aria-label="Narrow this column">' +
      opt('all', 'All', shown.length, current === 'all') +
      counts.map(x => opt(x.f.key, x.f.label, x.n, current === x.f.key)).join('') +
    '</div>' +
  '</span>';
}

/* The two filter dropdowns, wired once for the life of the page rather than
   once per paint.

   They are the only controls on this view still found by selector, and the
   reason is that they are the only ones this view does not own: colFilterHTML()
   builds them as a string and PlansView hands them to the browser through
   dangerouslySetInnerHTML, so React never sees the buttons and cannot be given
   a handler for them. Delegation is the answer that costs nothing — it is what
   the closing half of the same dropdown already does, in 09-columns.js, and
   for the same reason: the panel is rebuilt on every render and anything bound
   to it directly would need rebinding straight after.

   Which column a press came from is read off the wrapper's own
   `data-colfilter`, which colFilterHTML() already wrote, so the two panels
   never see each other's clicks despite sharing the attribute name. */
const PLAN_FILTER_SETTERS = {
  review: k => { reviewFilter = k; },
  done: k => { doneFilter = k; }
};

document.addEventListener('click', e => {
  const wrap = e.target.closest('.colfilter[data-colfilter]');
  if (!wrap) return;
  const setFilter = PLAN_FILTER_SETTERS[wrap.dataset.colfilter];
  if (!setFilter) return;

  const chip = e.target.closest('[data-planfilter]');
  if (chip) {
    setFilter(chip.dataset.planfilter);
    renderPlansList();
    return;
  }

  const btn = e.target.closest('.colfilter-btn');
  if (!btn) return;
  e.stopPropagation();
  const panel = wrap.querySelector('.dropdown-panel');
  if (!panel) return;
  const open = !panel.classList.toggle('hidden');
  btn.setAttribute('aria-expanded', String(open));
});

/* A move can land a card in any of the six, so all six are worked out together
   rather than each render guessing which two were touched. None of them paints
   on its own any more — each writes into plansProps and the paint happens once
   at the end, which is what stops six renders and six re-wirings per move. */
function renderPlansList(){
  renderPlanReview();
  renderPlanProduced();
  renderPlanDone();
  renderPlanDoing();
  renderQueueList();
  renderBacklogList();
  paintPlans();
}

/* One plan, as the component that draws it. Everything the card shows is
   decided here rather than inside PlanCard — which class it takes, which colour
   its stripe is, which word its eyebrow carries, whether the task it is about
   can still be found on the board — for the same reason Projects hands
   ProjectsView its sort and its dates. The component stays pure, and a plan
   goes on being read in one place.

   Keyed by the plan's own file, which is its identity everywhere on this view,
   so React moves a card between columns rather than rebuilding it.

   The three handlers come from here too, closed over this plan, which is what
   let the post-paint wiring go: opening it, the link back to its task, and the
   drag off it were all found by selector after every paint until 13 Sep 2026,
   and finding them was the only reason the paint had to be flushed. */
function planCardNode(p){
  const task = planTask(p);
  const key = planTaskKey(p);
  return BoardUI.h(BoardUI.PlanCard, {
    key: p.url,
    url: p.url,
    title: p.title,
    variant: planClass(p),
    stripe: planStripe(p),
    word: planWord(p),
    production: productionWord(p),
    productionKind: p.production || 'none',
    /* One canonical field across every stream: an unattended agent must not act
       on this. It was `outcome: folded` here and `needs_you` in the improvements
       backlog, which were two names for one fact. */
    needsYou: !!p.needs_you,
    /* Not every plan resolves: the task might since have been renamed or
       deleted, so the link falls back to the name the plan itself stored, and
       goToPlanTask says so on the click. */
    gotoKey: key,
    gotoLabel: task ? task.title : key,
    where: [p.bucket, p.column, planGeneratedLabel(p), planRevisionsLabel(p)],
    /* The task's own impact and effort, read live off the task every render
       rather than copied into the plan — the one thing on the row that cannot
       go stale, and what the column is ordered by. */
    scoresHTML: planScoreHTML(task),
    summaryHTML: p.summary ? mdInline(p.summary) : '',
    /* On a rejected plan the reason is worth more than the summary: it is what
       he told the agent, and it is what tonight's run will be working from. */
    feedback: p.feedback || '',
    onOpen: () => openPlanModal(p),
    onGoto: () => goToPlanTask(key),
    onDragStart: e => {
      drag = { kind:'plan', url: p.url, from: 'plan' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', p.url);
      e.currentTarget.classList.add('dragging');
    },
    onDragEnd: e => { drag = null; e.currentTarget.classList.remove('dragging'); }
  });
}

const planCardNodes = list => list.map(planCardNode);
const emptyNode = msg => BoardUI.h(BoardUI.ColumnEmpty, { boxed: true }, msg);

/* Waiting for review. Flat, because every row in it asks the same thing, and
   the chips are the only split it needs — ordered by the priority of the task
   each plan is about, so the top of it is what is worth reading first.

   The one column with no drop zone. A plan arrives here because the agent put
   it here, and the three ways out are the three other columns. */
function renderPlanReview(){
  const all = orderPlans(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.review), 'review');
  const active = REVIEW_FILTERS.find(f => f.key === reviewFilter);
  if (active && !all.some(active.match)) reviewFilter = 'all';
  const shown = reviewFilter === 'all'
    ? all
    : all.filter(REVIEW_FILTERS.find(f => f.key === reviewFilter).match);
  plansProps.reviewFilterHTML = colFilterHTML('review', all, REVIEW_FILTERS, reviewFilter);
  plansProps.reviewSort = plansSortBtn('review');
  plansProps.review = shown.length
    ? planCardNodes(shown)
    : emptyNode('Nothing waiting to be read. Everything written has been ruled on.');
}

/* Doing. The written half of the column: a plan the runner has picked up and
   is working through right now. Mostly empty, because a run holds one task at
   a time and the live card above it is drawn from the runner's own poll rather
   than from the plan folder — a plan only lands in `doing` if something set it
   there, which nothing does automatically today. It is drawn anyway, because a
   state the stream declares and the view cannot show is a card that vanishes.

   No filter and no drop zone: which one is running is not his to choose. */
function renderPlanDoing(){
  const shown = orderPlans(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.doing), 'doing');
  plansProps.doingPlans = shown.length ? planCardNodes(shown) : null;
  plansProps.doingCount = shown.length;
  plansProps.doingSort = plansSortBtn('doing');
  /* A card arriving here answers the column, so the "nothing running" word
     goes; a run that is live has already put its own card above, and that
     case is renderQueueDoingHead's. */
  if (shown.length) plansProps.doingEmptyHTML = '';
}

/* Ready to be produced. He has accepted the plan as written, which is where
   this board's half ends: an accepted plan is what feeds the implementing
   agent, and the planning agent stops re-planning the task from here.

   Flat, and no fold. It held three groups behind one `<details>` while it was
   still called Done, because it was holding two different questions — work
   still owed, and work long finished — and the fold was how the second stopped
   burying the first. Splitting Done off took the second question away, so
   every card in here is now the same kind of card and none of them wants
   hiding. Ordered by the priority of the task each plan is about, same as the
   review column, so the top of it is the work worth starting.

   The one column that takes plans and nothing else: there is nothing to accept
   about a task nobody has planned, so a task dropped here is refused with a
   word rather than silently ignored — see the `deny` argument on this column's
   `columnDropProps()` in paintPlans(). */
function renderPlanProduced(){
  const shown = orderPlans(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.produced), 'produced');
  plansProps.produced = shown.length
    ? [BoardUI.h('p', { className: 'help', key: 'how' },
        'Start a session and run ', BoardUI.h('code', null, '/do'), '.')]
        .concat(planCardNodes(shown))
    : emptyNode('Nothing accepted yet. A plan you accept lands here, and from ' +
                'it is waiting to be produced.');
  plansProps.producedCount = shown.length;
  plansProps.producedSort = plansSortBtn('produced');
}

/* Done. The work a plan describes has finished, which is the last thing that
   happens to one. Two kinds of card: a plan that was carried out, and a
   rejection a later plan answered — both closed, and only one of them work
   anybody did, which is why the filter tells them apart and the badge does too.

   Takes drops from Ready to be produced, so a plan whose work has landed can be
   dragged across rather than only closed from inside the modal. Plans only, for
   the same reason the column before it is plans only. */
function renderPlanDone(){
  const all = orderPlans(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.done), 'done');
  const active = DONE_FILTERS.find(f => f.key === doneFilter);
  if (active && !all.some(active.match)) doneFilter = 'all';
  const shown = doneFilter === 'all'
    ? all
    : all.filter(DONE_FILTERS.find(f => f.key === doneFilter).match);
  plansProps.doneFilterHTML = colFilterHTML('done', all, DONE_FILTERS, doneFilter);
  plansProps.doneSort = plansSortBtn('done');
  plansProps.done = shown.length ? planCardNodes(shown) : emptyNode('Nothing finished yet.');
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
   rule in agents/planning_agent/pick.py still does that. A title in the file that has since
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
function gotoButtonNode(r, label){
  const key = r.slug || r.title || '';
  if (!key) return null;
  return BoardUI.h('button', {
    className: 'plangoto', title: 'Open this task on the board', key: 'goto',
    /* The same stop the plan card's own link makes: a queue row is a card and
       the whole card is a drag handle, so a press that carried on up would
       start one. */
    onClick: e => { e.stopPropagation(); goToPlanTask(key); }
  }, label || 'open the card ↗');
}

/* Bucket, column, agent and the way back to the card, on one line. The
   separator is written here rather than folded into the strings so an absent
   field leaves no stray dot behind it. */
function rowMetaNode(r){
  const where = [r.bucket, r.column, r.agent].filter(Boolean).join(' · ');
  const goto = gotoButtonNode(r);
  if (!where) return goto;
  return BoardUI.h(BoardUI.Fragment, null, where, goto ? ' · ' : '', goto);
}

/* The reorder gesture every queue row carries: drop above or below whichever
   card the cursor is over, decided by its midpoint — the same one the drawer's
   sub-steps use. A card dragged in from the Backlog column lands the same way,
   since the target decides the position whichever list the card came from. A
   plan dropped on a row has no rank to take, so it falls through to the
   column's own handler.

   These were assigned onto `.qitem` after every paint until 13 Sep 2026, along
   with a `clear()` that walked every row in the column to strip the two edge
   classes. A row only ever marks itself, so each one clears its own now, and
   dragend clears the row the drag started from — which is the row this is. */
function queueRowDragProps(r, listOf, from){
  const edges = el => el.classList.remove('over-top', 'over-bottom');
  return {
    draggable: true,
    'data-qtitle': r.title,
    onDragStart: e => {
      drag = { kind:'task', title: r.title, from };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', r.title);
      e.currentTarget.classList.add('dragging');
    },
    onDragEnd: e => {
      drag = null;
      e.currentTarget.classList.remove('dragging');
      edges(e.currentTarget);
    },
    onDragOver: e => {
      if (!drag || drag.kind !== 'task' || !listOf) return;
      e.preventDefault();
      const box = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > box.top + box.height / 2;
      e.currentTarget.classList.toggle('over-bottom', after);
      e.currentTarget.classList.toggle('over-top', !after);
    },
    onDragLeave: e => edges(e.currentTarget),
    onDrop: e => {
      if (!drag || drag.kind !== 'task' || !listOf) return;
      e.preventDefault();
      e.stopPropagation();
      const box = e.currentTarget.getBoundingClientRect();
      const at = listOf().findIndex(x => x.title === r.title);
      const to = at + (e.clientY > box.top + box.height / 2 ? 1 : 0);
      edges(e.currentTarget);
      dropOnQueue(to);
    }
  };
}

function queueRowNode(r){
  return BoardUI.h(BoardUI.Card, {
    key: 'q:' + r.title,
    cls: 'qitem nostripe',
    attrs: queueRowDragProps(r, () => queueRows, 'queue'),
    position: r.position,
    title: r.title,
    action: BoardUI.h('button', { className: 'btn outline small qhold',
      title: 'Hold it back from tonight',
      onClick: e => { e.stopPropagation(); holdTask(r.title); } }, 'Hold'),
    meta: rowMetaNode(r),
    extra: BoardUI.h('div', { className: 'qwhy' },
      (r.why || '') + (r.last ? ' · last planned ' + r.last : ''))
  });
}

function renderQueueList(){
  const shown = plansShown(queueRows);
  /* Plans he has sent back sit in this column too, under the queue. The task
     itself is already in the list above — is_stale() puts it straight back —
     so this is the written half rather than a second copy of the work: what
     was wrong with the last attempt, which is what tonight is working from. */
  const back = byTaskPriority(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.todo));
  const rows = shown.length
    ? shown.map(queueRowNode)
    : [BoardUI.h('div', { className: 'empty', key: 'none' },
        'Nothing to plan tonight. Everything eligible has a plan already, and ' +
        'none of them have changed since.')];
  plansProps.queue = back.length
    ? rows.concat([BoardUI.h('h4', { className: 'fhead', key: 'backhead' },
        'Going back for another night')], planCardNodes(back))
    : rows;
  // Tonight's queue plus the plans going back for another night — both are
  // things this column is holding for tonight.
  plansProps.queueCount = shown.length + back.length;
}

/* -------------------------------------------------------------------------
   One drag, four columns.

   Two kinds of card move around this view and they are not the same object. A
   task row is a card off the board that has never been planned, or whose plan
   has been superseded; a plan row is a written document about one. Both answer
   the same question — what should the planning agent do with this — so both move
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

/* Every column but Waiting for review takes drops, and this is what it gets:
   the three handlers as props, spread onto the column's own body by PlansView.

   It was `wireColumnDrop(el, ...)` and it assigned onto a node found after the
   paint, which is the arrangement that retired on 13 Sep 2026 along with
   mountSync(). Nothing about the behaviour moved — the element is
   `e.currentTarget` rather than a captured `el`, which is the same element by
   another name — and the column rather than its rows is still the target, so
   an empty column is still something a card can be let go over.

   `deny` is what a column says to a card it will not take. The two plans-only
   columns refuse a task with a word rather than ignoring it, and that used to
   be written by wrapping the two handlers this function had just assigned.
   That worked while every render built fresh nodes; React reuses them, so a
   wrapper would wrap last paint's wrapper and the nesting would never stop.
   One set of handlers, both answers in them. */
function columnDropProps(onDrop, canTake, deny){
  const refused = () => canTake && !canTake(drag);
  return {
    onDragOver: e => {
      const el = e.currentTarget;
      if (!drag) return;
      if (refused()) {
        if (!deny) return;
        e.preventDefault();
        el.classList.add('coldeny');
        return;
      }
      e.preventDefault();
      el.classList.add('coldrop');
    },
    onDragLeave: e => {
      const el = e.currentTarget;
      if (e.target === el) el.classList.remove('coldrop', 'coldeny');
    },
    onDrop: e => {
      const el = e.currentTarget;
      el.classList.remove('coldeny');
      if (!drag) return;
      if (refused()) {
        if (!deny) return;
        e.preventDefault();
        drag = null;
        showToast(deny, 'bad');
        return;
      }
      e.preventDefault();
      el.classList.remove('coldrop');
      const d = drag;
      drag = null;
      onDrop(d);
    }
  };
}

const draggedPlan = d => planList.find(x => x.url === d.url);

/* The single place a card's position in the queue actually changes, whichever
   list it started in. `toIndex` is where it lands, in queueRows' own terms —
   the row's own drop handler works it out from where the cursor let go, and
   the column's appends at the end. */
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
  paintPlans();
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
  paintPlans();
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
  paintPlans();
  saveQueueOrder(false);
}

/* -------------------------------------------------------------------------
   Backlog — everything the queue does not contain and why: held back from
   the board on one hand, excluded by a rule in agents/planning_agent/pick.py on the other.

   Only the first half is draggable. Holding is a board-only preference, so
   dragging a held card back into the queue is exactly the reverse of the
   Hold button and just as safe. A card excluded by a rule — blocked, parked,
   tagged short of ai:full, or waiting on a `start:` date — is excluded for a
   reason dragging cannot fix, so it is shown rather than offered: see the
   comment above pick.eligible() and pick.select() for why the order and hold
   files were deliberately never given a say over what the queue contains.
   ------------------------------------------------------------------------- */

/* A held card drags but does not reorder: it has no rank to be dropped above
   or below, which is why it gets no list to position itself in. */
function heldRowNode(r){
  return BoardUI.h(BoardUI.Card, {
    key: 'h:' + r.title,
    cls: 'qitem held nostripe',
    attrs: queueRowDragProps(r, null, 'held'),
    position: '—',
    title: r.title,
    action: BoardUI.h('button', { className: 'btn outline small qhold',
      title: 'Put it back in the queue',
      onClick: e => { e.stopPropagation(); releaseHeld(r.title); } }, 'Release'),
    meta: rowMetaNode(r),
    extra: BoardUI.h('div', { className: 'qwhy' }, r.why || '')
  });
}

function renderBacklogList(){
  const held = plansShown(queueHeld);
  const skipped = plansShown(queueSkipped);
  const parked = byTaskPriority(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.backlog));
  let body = [];
  if (held.length) {
    body.push(BoardUI.h('p', { className: 'help listlead', key: 'lead' },
      'Drag into To do to plan it tonight.'));
    body = body.concat(held.map(heldRowNode));
  }
  /* A parked plan is the written half of the same instruction: the task is
     held, and this is what the agent had already worked out about it. Kept
     openable rather than filed away, since taking it out of Backlog later is
     a decision better made having read it. */
  if (parked.length) {
    body.push(BoardUI.h('h4', { className: 'fhead', key: 'parkedhead' }, 'Plans parked here'));
    body = body.concat(planCardNodes(parked));
  }
  if (skipped.length) {
    body.push(BoardUI.h('details', { className: 'ufold', key: 'skipped' },
      BoardUI.h('summary', null, 'Not eligible (' + skipped.length + ')'),
      skipped.map(r => BoardUI.h('div', { className: 'qskip', key: 's:' + r.title },
        BoardUI.h('span', null, r.title),
        gotoButtonNode(r),
        BoardUI.h('em', null, r.why)))));
  }
  if (!body.length) {
    body = [BoardUI.h('div', { className: 'empty', key: 'none' },
      'Nothing held back, and nothing excluded right now.')];
  }
  plansProps.backlog = body;
  // Everything the column is holding, in all three of its groups.
  plansProps.backlogCount = held.length + parked.length + skipped.length;
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
  if (!plansShowing()) return;
  const say = (queueNode, backNode) => {
    plansProps.queue = queueNode;
    plansProps.backlog = backNode;
    paintPlans();
  };
  const errNode = msg => BoardUI.h('div', { className: 'err' }, msg);
  try {
    const res = await fetch('/queue.json?t=' + Date.now(), { cache:'no-store' });
    if (res.status === 404) {
      say(BoardUI.h('div', { className: 'empty' },
            'No planning agent in this checkout, so there is nothing queued and ' +
            'nothing to order.'),
          BoardUI.h('div', { className: 'empty' }, 'Same here \u2014 nothing to hold back.'));
      return;
    }
    if (!res.ok) {
      const stale = BoardUI.h('div', { className: 'err' },
        BoardUI.h('strong', null, 'The board helper needs restarting.'),
        BoardUI.h('br'),
        'It is running, but it is an older copy that does not know about the queue yet.');
      say(stale, stale);
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
    paintPlans();
  } catch (err) {
    const msg = 'Could not read the queue. ' + String(err.message || err);
    say(errNode(msg), errNode(msg));
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
  /* It used to retitle the To do column to "Doing" and swap its lead sentence,
     because the queue and the run in flight shared one card. They are two
     columns since 12 Sep 2026, so both keep their own name and their own
     sentence, and this is left with the two things that actually depend on
     whether a run is live: the button, and which of the two bodies is drawn.
     Both are one prop now rather than two classList toggles \u2014 a toggle
     against a node React owns is undone by the next paint without saying so. */
  plansProps.runLive = !!live;
  /* Nothing running is the normal state of this column, and an empty column
     with no word in it reads as one that failed to load. Said here rather than
     in renderPlanDoing(), which knows what is in the plan folder but not
     whether the runner is going \u2014 and "nothing is running" is the answer
     that needs both. Read off the props rather than off the DOM, since the
     plans half of the column is a list this file built. */
  const parked = plansProps.doingPlans;
  plansProps.doingEmptyHTML = (live || (parked && parked.length))
    ? ''
    : colEmptyHTML('Nothing running. The planning agent starts at its scheduled ' +
                   'hour, or from Run now.', 'boxed');
  plansProps.orphanHTML = (!live && orphan)
    ? '<div class="err">The last run stopped part way through <strong>' +
      esc(orphan.title) + '</strong> and never finished. Its lock is gone, so nothing is ' +
      'running now.</div>'
    : '';
}

/* Only ever drawn while #doingOut is actually showing — see
   renderQueueDoingHead — so there is no idle or orphan case to handle here;
   those are the queue's job now. */
function renderDoing(n){
  const when = s => s ? esc(s.slice(11, 16)) : '';
  if (n.live && n.current) {
    plansProps.doingHTML = '<div class="fnow"><i class="fspin"></i>' +
      '<div><strong>' + esc(n.current.title) + '</strong>' +
      '<div class="repmeta">' + esc(n.current.agent) + ' \u00b7 started ' +
      when(n.current.since) + '</div></div></div>';
  } else if (n.live) {
    plansProps.doingHTML = '<div class="fnow"><i class="fspin"></i><div><strong>A run is going</strong>' +
      '<div class="repmeta">between tasks \u2014 nothing in flight this second</div></div></div>';
  } else {
    plansProps.doingHTML = '';
  }
}

/* The batch's own numbers — when it started, how far through it is, what
   made it stop early. Sits in Done rather than in the Queue/Doing card: this
   is a record of the run, the same kind of fact "Latest run costs" is, not a
   description of what's happening or about to. */
function renderDoneStats(n){
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
  plansProps.doneStatsHTML = html;
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
  showModal('Run the planning agent now?', 'It normally waits for the small hours',
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
    await postJSON('/planning_agent/run');
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
  if (!plansShowing()) return;
  let live = false;
  try {
    const n = await getJSON('/planning-agent.json');
    lastNightAgent = n;
    live = !!n.live;
    plansProps.queueErrorHTML = '';
    renderQueueDoingHead(live, n.orphan);
    renderDoing(n);
    renderDoneStats(n);
    paintPlans();
    /* Outside the paint: the run-results fold lives in a modal this view does
       not own, and it is still drawn by id. */
    renderRunResults(n);
  } catch (err) {
    plansProps.queueErrorHTML = esc('Could not read the run log. ' + String(err.message || err));
    paintPlans();
  }
  flightTimer = setTimeout(() => {
    if (state.view === 'plans' && plansShowing()) renderNightAgent();
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
    /* Two columns, drawn with the same colHTML() the view behind them uses —
       a pair of `.listcard`s of their own until 12 Sep 2026. Being in a modal
       does not make a column a different object. */
    '<div class="pvcol">' +
      colHTML({
        heading: 'h3', title: 'Token Session', cls: 'schedview usage prose',
        desc: 'What has been spent, window by window.',
        body: '<div id="usageOut">Loading…</div>' +
          '<details class="ufold hidden" id="runResultsFold"><summary id="runResultsSummary">Latest run costs</summary>' +
            '<div id="runResultsOut"></div>' +
          '</details>'
      }) +
      colHTML({
        heading: 'h3', title: 'What runs on a clock', cls: 'reportsview clockview prose',
        desc: 'Set in the agents dashboard, not here.',
        body: '<div id="schedOut">Loading…</div>'
      }) +
    '</div>',
    [{ label:'Close', primary:true }], { wide:true });
  renderSched();
  renderUsage();
  // The poll's own copy rather than a second fetch: the fold is a record of a
  // run that has already finished, and renderNightAgent is the only thing that
  // reads that route.
  if (lastNightAgent) renderRunResults(lastNightAgent);
}

/* Six columns, the same six the board has, drawn through the same colHTML()
   the board draws its own with — so a column here is the same object it is
   there, down to the fill, the border, the 322px width and the 12px gap.

   The descriptions sit in the heads rather than as the first paragraph of each
   body. A sentence saying what a column is for governs the column, and
   anything governing a column belongs in its head; that is where the Filters
   dropdown went for the same reason.

   Doing and Done are the two new ones. Doing was a Status block inside To do,
   which described the run that is happening instead of drawing it, and swapped
   To do's own title to say so; Done held two facts at once — accepted, and
   finished — which is the split the `accepted` state was added for. See
   planColumn(). */
/* The React root goes on a child of #lists rather than on #lists itself, for
   the reason projectsMountPoint() in 26-projects.js sets out at length: nine
   views still draw by assigning to $('#lists').innerHTML, which tears out
   whatever is under it without telling React. A view owns a node it created,
   and treats that node going missing as another view having been here. */
let plansRoot = null;
/* Is Plans still the view on screen? Asked by the three renderers whose fetch
   can come back after he has switched away, so a late answer paints nothing.

   It asks about `#plansRoot` rather than about anything inside the tree, and
   that is the point: the root is made by the assignment below and is there the
   moment paintPlans() returns, where every node React draws arrives whenever
   React gets round to it. Both of these used to ask about a node in the tree —
   `#queueOut` and `#queueDoingCard` — which was safe only because the mount was
   flushed. */
function plansShowing(){
  const lists = $('#lists');
  return !!(lists && lists.querySelector('#plansRoot'));
}

function plansMountPoint(){
  const lists = $('#lists');
  if (!lists) return null;
  let host = lists.querySelector('#plansRoot');
  if (!host) {
    if (plansRoot) BoardUI.unmount(plansRoot);
    lists.innerHTML = '<div id="plansRoot"></div>';
    host = lists.querySelector('#plansRoot');
    plansRoot = host;
  }
  return host;
}

/* Every body on this view, in one object, and one function that paints it.
   Nothing here assigns to an id inside the mounted tree any more: the sixteen
   places that used to went at once, because half-and-half is the arrangement
   that silently drops a column. A renderer works out its own slice, writes it
   in here, and the paint happens once at the end of whatever asked for it.

   Four of the columns hold nodes, and they are the four that hold nothing but
   plans; the rest hold markup this file built, which is what the bodies filled
   by the agent's own status and the usage reconstruction still are. Those land
   at different times and each paints as it arrives rather than the view waiting
   on the slowest, and that goes on working now because a paint redraws all of
   it from one object rather than each fetch writing into its own corner. */
const PLANS_BLANK = {
  backlog: 'Loading…',
  queueErrorHTML: '',
  statusHTML: 'Loading…',
  queue: 'Loading…',
  orphanHTML: '',
  doingHTML: '',
  doingEmptyHTML: '',
  doneStatsHTML: '',
  doingPlans: null,
  review: 'Loading…',
  produced: 'Loading…',
  done: 'Loading…',
  backlogCount: '',
  queueCount: '',
  doingCount: '',
  producedCount: '',
  reviewFilterHTML: '',
  doneFilterHTML: '',
  runLive: false
};
let plansProps = Object.assign({}, PLANS_BLANK);

/* mount rather than mountSync, as of 13 Sep 2026, and nothing follows it.

   This used to be a flushed mount with wirePlansView() straight after, because
   every handler on this view was assigned onto a node found by selector once
   the paint had landed — so the paint had to have landed. All of them are
   props now, built where the thing they act on is built: a plan card's in
   planCardNode(), a queue row's in queueRowDragProps(), and a column's in
   columnDropProps() below. React is left to schedule, and the one thing still
   found by selector — the two filter dropdowns, which are markup this view
   hands over rather than owns — is wired by a delegated listener on document
   that runs once for the life of the page. */
function paintPlans(){
  const host = plansMountPoint();
  if (!host) return false;
  BoardUI.mount(host, BoardUI.PlansView(Object.assign({}, plansProps, {
    onRunQueue: () => confirmNightAgentRun(),
    onOpenRefCards: () => openRefCards(),

    /* Backlog. Dropping a card from the queue anywhere on this column holds it
       back — the drag equivalent of pressing Hold. There is nothing to
       position it against, since a held card has no rank, so the whole column
       is the target rather than any one row within it. A plan dropped here is
       parked, and its task held with it. */
    backlogDrop: columnDropProps(d => {
      if (d.kind === 'task') { if (d.from === 'queue') holdTask(d.title); return; }
      const p = draggedPlan(d);
      if (p) parkPlan(p);
    }, d => d.kind === 'plan' || d.from === 'queue'),

    /* To do as a whole: a task dropped anywhere but on a row appends at the
       end, and a plan dropped anywhere at all goes back for another night. */
    queueDrop: columnDropProps(d => {
      if (d.kind === 'task') { drag = d; dropOnQueue(queueRows.length); return; }
      const p = draggedPlan(d);
      if (p) replanPlan(p);
    }),

    /* Ready to be produced takes plans and nothing else: there is nothing to
       accept about a task nobody has planned. */
    producedDrop: columnDropProps(d => {
      const p = draggedPlan(d);
      if (p) acceptPlan(p);
    }, d => d.kind === 'plan',
       'Nothing has been planned for that yet, so there is nothing to accept.'),

    /* Done takes them from the column before it, so a plan whose work has
       landed can be dragged across rather than only closed from inside the
       modal. */
    doneDrop: columnDropProps(d => {
      const p = draggedPlan(d);
      if (p) finishPlan(p);
    }, d => d.kind === 'plan',
       'Nothing has been planned for that yet, so there is nothing to finish.')
  })));
  return true;
}

/* The Status line on the To do card is drawn by renderStatus() in
   14-schedule.js, which reads /usage.json — the only route that knows it, and
   one call draws both that and the chart. It used to write into #statusOut
   directly; it hands the markup over instead, since that node belongs to
   React now. */
function setPlansStatus(html){
  plansProps.statusHTML = html;
  paintPlans();
}

async function renderPlansView(){
  plansProps = Object.assign({}, PLANS_BLANK);
  if (!paintPlans()) return;
  const say = node => { plansProps.review = node; paintPlans(); };
  try {
    const res = await fetch('/plans.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      say(BoardUI.h('div', { className: 'err' },
        BoardUI.h('strong', null, 'The board helper needs restarting.'),
        BoardUI.h('br'),
        'It is running, but it is an older copy that does not know about plans yet.'));
      return;
    }
    planList = (await res.json()).plans || [];
    if (!planList.length) {
      plansProps.review = BoardUI.h('div', { className: 'empty' },
        'Nothing yet. The planning agent writes into ',
        BoardUI.h('code', null, 'data/plans/'),
        '; the queue on the left is what it would pick up tonight.');
      /* Neither of the two columns past review has any reason to explain where
         plans come from — the column beside them just did — so each
         only says it is empty rather than sitting on "Loading…" forever. */
      plansProps.produced = emptyNode('Nothing accepted yet.');
      plansProps.done = emptyNode('Nothing finished yet.');
      paintPlans();
    } else {
      renderPlansList();
    }
  } catch (err) {
    say(BoardUI.h('div', { className: 'err' },
      'Could not read the plan list. ' + String(err.message || err)));
  }
  // The rest after the plans have painted: reconstructing a month of windows
  // is about a second, and nothing else should wait on it. renderUsage() runs
  // even with its chart shut away in the modal, because the same call is what
  // feeds the Status line on the To do card — see renderStatus().
  renderQueue();
  renderNightAgent();
  renderUsage();
}

