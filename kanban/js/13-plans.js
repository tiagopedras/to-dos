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

/* Opening an accepted plan used to offer no way to start, or return to, the
   session actually carrying it out — the other half of that entry in
   IMPROVEMENTS.md. A real Terminal window, seeded with `/do` naming this
   plan's own task;
   `--session-id` is what makes a second click on the same card resume
   rather than start over, since the server writes the id it used back onto
   the plan the moment the window opens. Nothing here touches `state` or
   `production` — those stay do's own to set. */
async function startPlanSession(p){
  try {
    const res = await postJSON('/plans/start-session', { name: p.name });
    if (res && res.ok === false) throw new Error(res.error || 'the server refused it');
    p.production_session = res.session || p.production_session;
    renderPlansList();
    showToast(res.resumed ? 'Reopened the session carrying this out.'
                           : 'Opened a Claude window to carry this out.', 'good');
  } catch (err) {
    showToast('Could not open a session: ' + (err.message || err), 'bad');
  }
}

/* The plan card's left stripe. Every card in the app carries one; a task card's
   is its bucket's colour, and a plan's is this. Not the bucket, because a plan
   is one proposal about one task rather than a thing belonging to a bucket, and
   not a fixed red — which is what it was until 12 Sep 2026 as a top border, and
   which spent the loudest colour in the palette announcing "this is a plan" on
   a view where everything is one.

   So colour is spent only where it earns attention: something has arrived, or
   something is settled. Everything in between takes a quiet neutral and says
   what it is in its badge instead — faint enough not to compete, not so faint
   the badge itself goes unreadable, which is what the line colour did.

     new                            blue,  the accent
     read, accepted, planning again,
     parked, finished, replaced     a quiet neutral (ink-faint)

   Accepted was green until 15 Sep 2026. A whole column of green cards in
   Ready to be produced said nothing the column heading does not. */
function planStripe(p){
  if (p.state === 'review' && !p.seen) return 'var(--tenon-chart-1)';
  /* Reported back and not yet looked at is the other thing that has just
     arrived, so it takes the same colour as a new plan. Before the fold this
     card was on a different board entirely and could not say so here. */
  if (p.production === 'review' && !p.seen) return 'var(--tenon-chart-1)';
  return 'var(--tenon-text-faint)';
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
                   review:'review', produced:'produced', producing:'producing',
                   done:'done' };
const PLAN_COL_LABEL = { backlog:'Backlog', todo:'To do', doing:'Doing',
                         review:'Waiting for review', produced:'Ready to be produced',
                         producing:'Producing', done:'Done' };
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
  /* Producing, since 16 Sep 2026. `production: doing` is the implementing
     agent being on it right now, which was a badge on a card in Ready to be
     produced and is a column of its own now. Only that one stage: a plan that
     has reported back (`production: review`) or finished (`production: done`)
     stays where it was, still wearing its badge. */
  if (p.production === 'doing') return PLAN_COL.producing;
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


/* The size he last dragged the plan modal out to. Remembered the same way the
   timeline's frozen title column is (state.tlLabelWidth, 02-state.js) — a drag
   done once should not have to be repeated on the next plan. Stored rather
   than kept in memory because the answer is about his screen, which does not
   change between sessions. */
const PLAN_SIZE_KEY = 'todo-board-planmodal-size';

function planModalSize(){
  try {
    const raw = JSON.parse(localStorage.getItem(PLAN_SIZE_KEY) || 'null');
    if (raw && raw.w > 0 && raw.h > 0) return raw;
  } catch (err) { /* a corrupt value is the same as none */ }
  return null;
}

/* Applies the stored size and records the next one. The observer is on the
   sheet, which showModal() replaces on every open, so it goes with it and
   nothing has to be torn down. Below 700px board.css overrides both
   dimensions with !important, so a size written on a desktop is inert on a
   phone rather than having to be guarded here. */
function wirePlanModalSize(){
  const sheet = document.querySelector('.sheet.planmodal');
  if (!sheet || typeof ResizeObserver !== 'function') return;
  const stored = planModalSize();
  if (stored) { sheet.style.width = stored.w + 'px'; sheet.style.height = stored.h + 'px'; }
  /* The size it opens at, measured now. Only a change away from it is a drag
     worth storing — skipping the observer's first callback instead would lose
     a drag that arrived in the same frame as the attach, since the two
     coalesce into one callback. */
  const size = () => {
    const r = sheet.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  };
  const base = size();
  new ResizeObserver(() => {
    if (!sheet.isConnected) return;
    const now = size();
    if (Math.abs(now.w - base.w) < 2 && Math.abs(now.h - base.h) < 2) return;
    try { localStorage.setItem(PLAN_SIZE_KEY, JSON.stringify(now)); }
    catch (err) { /* a full or blocked store is not worth a toast */ }
  }).observe(sheet);
}

/* Opening one marks it read, on the grounds that having it open is what being
   read means. Actioned stays a deliberate press, because that is a claim about
   the work rather than about him, and it is the one the runner acts on. */
/* The board's half of one task, one plan: a task ticked off takes its plan card
   to Done with it. Called from setDone() (04-tier-two-the-one-thing.js).

   Three guards, and they are the whole of what makes a write from the board's
   tick path safe. It writes only when this tab has already loaded the plans, so
   a tick on a board whose Plans view has never been opened fetches nothing and
   posts nothing. It writes only for a plan that is not already in Done. And it
   goes through movePlan() like every other move on this view, so the stream is
   still the only thing that changes a plan's state. */
function planFinishedWithTask(task){
  if (!planList || !planList.length) return;
  const key = k => String(k || '').trim().toLowerCase();
  const want = new Set([key(task.slug), key(task.title)].filter(Boolean));
  planList
    .filter(p => want.has(key(planTaskKey(p))) && planColumn(p) !== PLAN_COL.done)
    .forEach(p => movePlan(p, 'done', 'me', { resolution:'completed', quiet:true }));
}

/* The modal for a card with no plan written yet — a task queued for tonight, a
   task held back, or one of pick.py's three rules. Clicking one of these did
   nothing at all until 17 Sep 2026, which is the last place the view still
   treated a queue row as a lesser thing than a plan: every card on Plans is a
   plan card, and a plan card opens.

   What it shows is the task, since that is all there is: where it sits on the
   board, its own description, and one line saying what this view is going to
   do with it. One button, and it is the move the card's own action makes, so
   the modal and the card never offer different things.

   `row` is a /queue.json row rather than a plan — there is no file to load and
   no History to draw, which is why this is its own modal rather than a branch
   inside openPlanModal(). */
function openQueuedModal(row, where){
  const key = row.slug || row.title;
  const task = key && findTaskByKey(key);
  const sub = ['In ' + where, row.bucket, row.column, row.agent]
    .filter(Boolean).map(esc).join(' \u00b7 ');
  const why = where === PLAN_COL_LABEL.todo
    ? 'Queued for tonight\u2019s run. The planning agent writes the plan, and it ' +
      'comes back in Waiting for review.'
    : (row.why ? esc(row.why) + ' \u2014 so nothing is planned for it tonight.'
               : 'Held back, so nothing is planned for it tonight.');
  const notes = task ? dedent(bodyParts(task).notes) : '';
  const buttons = where === PLAN_COL_LABEL.todo
    ? [{ label:'Move to backlog', reject:true, run: () => holdTask(row.title) }]
    : [{ label:'Move to To do', run: () =>
          (row.state === 'held' ? releaseHeld(row.title) : forceSkipped(row.title)) }];
  showModal(row.title, sub,
    '<div class="planmain">' +
      '<p class="qwhy">' + why + '</p>' +
      (notes ? mdBlocks(notes) : '<p class="empty">No description on the task yet.</p>') +
    '</div>',
    buttons, { wide:true, cls:'planmodal' });
}

/* ---- Talking a plan through before deciding on it ------------------------
   Decided 15 Sep 2026, and built here 17 Sep. Until then the only thing he
   could say about a plan was the one sentence replanPlan() collects, and an
   accepted plan carried nothing at all — so whatever he wanted the
   implementing agent to keep in mind had nowhere to go.

   It is the same embedded chat the drawer's New chat opens, not a Terminal
   window. The box opens empty and nothing starts until he sends. His first
   message goes out with the plan in front of it, which is what `preface`
   below is for: the window shows the sentence he typed, and Claude gets the
   sentence with the plan above it. That differs from newChat(), which drops
   the seed into the box unsent — here the plan is far too long to ask him to
   scroll past.

   Afterwards he closes it and presses one of the modal's own buttons. The
   conversation goes with whichever he presses, as `feedback`, which is why
   neither button needs a typed reason once a chat is attached. */
const PLAN_CHAT_LEAD =
  'Here\u2019s a plan another session has been working on, including the goal ' +
  'we\u2019re trying to solve and what it suggested so far.';
const PLAN_CHAT_TURN = 'Here\u2019s what the user has to say about that.';

/* The plan as the conversation should see it: the task, the summary, the
   findings and the proposal. Context and History are left out for the same
   reason the modal leaves them out — they are the night\u2019s own trail, and
   feeding them back in is asking the conversation to re-read its own notes. */
function planForChat(p){
  const text = planTexts[p.url];
  const s = text ? planSections(text) : {};
  const part = (label, md) => md ? '## ' + label + '\n\n' + md.trim() + '\n' : '';
  return [
    '# ' + p.title,
    part('Summary', s.summary || p.summary || ''),
    part('Findings', s.findings || ''),
    part('Proposed plan', s['proposed plan'] || '')
  ].filter(Boolean).join('\n');
}

/* Everything said in the chat this plan opened, kept in the tab rather than on
   disk until one of the modal\u2019s buttons carries it into the plan\u2019s own
   frontmatter. Keyed by plan url, so two plans open in one sitting do not mix. */
let planChatLog = {};

function openPlanChat(p){
  if (!chat.available || !chat.available()) {
    showToast('No Claude here to talk to about it.', 'bad');
    return;
  }
  const doc = planForChat(p);
  closeModal();
  planChatLog[p.url] = planChatLog[p.url] || [];
  chat.openNew('plan:' + p.url, chat.newOwnerKey(), '', {
    preface: ask => PLAN_CHAT_LEAD + '\n\n' + doc + '\n\n' + PLAN_CHAT_TURN + '\n\n' + ask
  });
}

/* What the board records when he types into a plan\u2019s chat. Called from
   onPromptRunSend() (10-reference-sections.js) for any conversation whose
   owner names a plan. Only his own words: the preface is the plan, which the
   plan already holds. */
/* The header the chat window shows for a plan's conversation. */
function planTitleFor(owner){
  const url = String(owner || '').slice('plan:'.length);
  const p = planList.find(x => x.url === url);
  return p ? p.title : 'A plan';
}

function notePlanChat(owner, ask){
  const url = String(owner || '').slice('plan:'.length);
  if (!url) return;
  (planChatLog[url] = planChatLog[url] || []).push(ask);
}

/* The conversation as one block of feedback, for whichever button he presses
   next. Empty when he never said anything, which reads the same as never
   having opened the chat. */
function planChatFeedback(p){
  const said = planChatLog[p.url] || [];
  return said.length ? said.join('\n\n') : '';
}

/* What the modal offers, and it is a different answer in every column.

   One test split these until 17 Sep 2026 — Ready to be produced against
   everything else — which is how a plan already being built, and one finished
   a fortnight ago, both went on offering Accept it. Pressing it on a declined
   plan reopened it. The set is per column now, agreed column by column, and
   the rule behind every one of them is the same: offer the moves that are
   real from where the card is sitting, and nothing else.

   Three things hold across all seven. Back is always a replan rather than a
   literal step, decided 13 Sep 2026 — stepping a plan in Ready to be produced
   back into Waiting for review says nothing, while sending the task round to
   be written again tonight is what he wants from there. Turn it down ends the
   idea rather than the plan of it. And the modal's own × is the dismissal, so
   no column carries a Close button to press by reflex.

   Leave it alone was a fourth button until 13 Sep 2026 and is not coming back:
   four options read as four verdicts to weigh. Parking is a drag into Backlog,
   which calls the same parkPlan(), and Backlog's own Move to To do below is
   the reverse of it. */
function planButtons(p){
  const col = planColumn(p);
  /* Talk it through. Not a verdict, which is why it sits ahead of the three
     that are and carries neither the agree nor the reject colour. Left out of
     the columns where there is no plan to talk about — Doing has not written
     one yet — and out of Done, where the conversation could not change
     anything. */
  const talk = { label:'Chat about it', run: () => openPlanChat(p) };
  const accept = { label:'Accept it', agree:true, run: () => acceptPlan(p) };
  const replan = { label:'Plan it again', reject:true, run: () => replanPlan(p) };
  const decline = { label:'Turn it down', reject:true, run: () => declinePlan(p) };
  const finish = { label:'It is finished', run: () => finishPlan(p) };
  /* Backlog is a holding pen rather than a stage, so its forward move is back
     into the queue rather than on to the next column. A plan parked here has a
     body he can already agree with, which is why Accept it stays: making him
     put it back in the queue first would be a detour through a night that has
     nothing left to work out. */
  if (col === PLAN_COL.backlog)
    return [talk, accept, { label:'Move to To do', run: () => unparkPlan(p) }, decline];
  /* Doing is the night writing this one right now. There is no plan yet to
     accept or send back, and the only real move is to stop wanting it. */
  if (col === PLAN_COL.doing) return [decline];
  /* In Ready to be produced, finishing goes last and plain rather than first
     and green, so it never sits where Accept it does in every other column. */
  if (col === PLAN_COL.produced) return [talk, replan, decline, finish];
  /* Producing is the implementing agent on it. Accepting it again means
     nothing and replanning mid-build would leave the run writing against a
     plan that no longer exists, so the two moves are: it landed, or stop. */
  if (col === PLAN_COL.producing) return [talk, finish, decline];
  /* Done, whether it finished, was declined or was superseded. One way out of
     history, which is to put the task round again. */
  if (col === PLAN_COL.done) return [replan];
  /* To do and Waiting for review. The first is a plan sent back sitting under
     tonight's queue, the second is the one column this whole view exists for. */
  return [talk, accept, replan, decline];
}

function openPlanModal(p){
  /* The column leads the sub-line, since the buttons below change with it: an
     accepted plan opened in the belief it was still waiting for review got
     marked finished by two clicks in the usual places, 17 Sep 2026. */
  const sub = ['In ' + PLAN_COL_LABEL[planColumn(p)], p.bucket, p.column, planGeneratedLabel(p), p.agent]
    .filter(Boolean).map(esc).join(' · ');
  const buttons = planButtons(p);
  planModalTab = 'plan';
  showModal(p.title, sub,
    planHistoryHTML(p) +
    '<div class="planmain">' +
      (planTexts[p.url] !== undefined ? planMainHTML(planTexts[p.url], p) : '<p class="empty">Loading…</p>') +
    '</div>',
    buttons, { wide:true, cls:'planmodal' });
  wirePlanModalSize();
  if (planTexts[p.url] === undefined) loadPlanBody(p);
  else wirePlanTabs();
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
  /* A conversation he had about this plan goes with the acceptance, as
     `feedback` — the same key a replan's one-sentence reason uses, because
     they are the same thing at two lengths: what he has to say about the plan.
     On an accepted plan it is what he wants kept in mind while it is built,
     which is what /do and implementing-agent.md now read it as. */
  const said = planChatFeedback(p);
  showModal('Accept this plan?', esc(p.title),
    '<div class="repdoc">' +
      '<p>It moves to <strong>Ready to be produced</strong>, and the planning agent ' +
      'leaves the task alone from here rather than writing a second opinion over it.</p>' +
      '<p>Nothing runs now. It lands in the execution board\'s Backlog, and the ' +
      'implementing agent only picks it up once you move it to To do there.</p>' +
      (said ? '<p>What you said in the chat goes with it, as notes for the build.</p>' : '') +
    '</div>',
    [{ label:'Move to Ready to be produced', primary:true, run: () => {
        movePlan(p, 'accepted', 'implementing-agent', said ? { reason: said } : {});
        delete planChatLog[p.url];
      } },
     { label:'Cancel' }]);
}

/* Producing. The implementing agent has this one in hand. The do skill writes
   `production: doing` itself when it picks a plan up, so this is the same fact
   said by hand — for the runs he starts from the card's own button, and for a
   plan he is carrying out himself. The state stays `accepted`, which is what
   the stream requires of anything with a production stage on it.

   Dropping a card here also opens the session, since 16 Sep 2026. The drag and
   the card's own Start session button are one gesture — moving a plan into
   Producing by hand and then having to find the button on it was two — so this
   runs startPlanSession() after the move, and only if the move landed: a
   session opened against a plan the stream refused would be a window carrying
   out work the board does not believe is happening. */
function producePlan(p){
  showModal('Is this being made now?', esc(p.title),
    '<div class="repdoc">' +
      '<p>It moves to <strong>Producing</strong> and stays there until the work ' +
      'reports back or finishes. Cards in that column cannot be dragged out.</p>' +
      '<p>A Claude window opens to carry it out, the same one the card\'s own ' +
      'button opens — or the session already carrying it, if there is one.</p>' +
    '</div>',
    [{ label:'Yes, it is being made', primary:true,
       run: async () => {
         if (await movePlan(p, 'accepted', 'implementing-agent', { production:'doing' })) {
           await startPlanSession(p);
         }
       } },
     { label:'Cancel' }]);
}

/* The card's Start session button in Ready to be produced, since 17 Sep 2026.
   Starting the session is starting production, so the card moves to Producing
   first and the window opens only if that move landed — producePlan()'s rule,
   without its question, since pressing the button already answered it. */
async function startProducing(p){
  if (await movePlan(p, 'accepted', 'implementing-agent', { production:'doing' })) {
    await startPlanSession(p);
  }
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
    [{ label:'Move to Done', primary:true, run: () => movePlan(p, 'done', 'me', { resolution:'completed' }) },
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
      '<textarea class="redowhy" id="declineWhy" rows="3" ' +
        'placeholder="Why this is not worth doing"></textarea>' +
    '</div>',
    [{ label:'Yes, turn it down', primary:true, run: () => {
        const why = declineText.trim();
        if (!why) return showToast('Turning a plan down needs a reason.', 'bad');
        movePlan(p, 'done', 'me', { resolution:'declined', reason: why });
      } },
     { label:'Cancel' }]);
  /* Read as he types, the same as replanPlan(): showModal closes the sheet
     before running a button, so the textarea is gone by the time it runs.
     Reading it on press is what made this button do nothing until 15 Sep. */
  const box = $('#declineWhy');
  if (box) {
    box.oninput = () => { declineText = box.value; };
    box.focus();
  }
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
      'again with this one told to it. Say what this plan got wrong, in a sentence' +
      (planChatFeedback(p) ? ' \u2014 or leave it blank and the chat goes instead' : '') +
      '.</p>' +
      '<textarea id="redoWhy" class="redowhy" rows="3" ' +
        'placeholder="Wrong scope: this is about the Foundations file, not the whole library."></textarea>' +
    '</div>',
    [{ label:'Yes, plan it again', primary:true, run: () => {
        /* A chat stands in for the typed sentence: it is the same thing said
           at greater length, and asking for both would be asking him to
           summarise a conversation he just had. */
        const why = redoText.trim() || planChatFeedback(p);
        if (!why) return showToast('A plan going back needs a reason.', 'bad');
        movePlan(p, 'ready', 'planning-agent', { reason: why, release: true });
        delete planChatLog[p.url];
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
   tonight write a fresh plan for a task he just took off the agent.

   No confirm sheet, decided 13 Sep 2026: dragging onto Backlog is already the
   deliberate act, the same reasoning holdTask() below already goes on with no
   modal of its own, and either kind is one drag back out if it lands wrong. */
function parkPlan(p){
  movePlan(p, 'backlog', 'me', { hold: true });
}

/* The reverse of it, and deliberately not replanPlan(): both land the plan in
   To do, but a replan is him saying this plan is wrong and needs writing again,
   which is why it insists on a reason. Taking a parked plan out of Backlog says
   nothing about the plan — it says the task is live again. So no reason, no
   sheet, and the hold comes off the task with it. */
function unparkPlan(p){
  movePlan(p, 'ready', 'planning-agent', { release: true });
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

/* ---- The plan modal's body -----------------------------------------------
   Two columns since 15 Sep 2026, to the Figma frames 61:9227 and 61:9333.
   History down the left, read-only because a replan overwrites the same file
   and there is no older revision to open. On the right the Summary in a box of
   its own, then two tabs: Proposed plan, which it opens on and which carries
   Needs you, and Findings.

   So the plan is read as sections rather than one mdBlocks() string, split on
   the headings PLAN-BRIEF.md names. Only those names split, so a subheading
   inside a section stays in it — which is how Context still takes its own
   subheadings with it. A plan with neither Findings nor Proposed plan predates
   the brief's shape, and reads as one document the way every plan used to. */
const planTexts = {};
let planModalTab = 'plan';
const PLAN_SECTIONS = ['context', 'summary', 'findings', 'proposed plan', 'needs you', 'history'];

function planSections(text){
  const fm = /^---\n[\s\S]*?\n---\n/.exec(text);
  const body = fm ? text.slice(fm[0].length) : text;
  const out = { extra: [] };
  let name = null, level = 0, lines = [];
  const flush = () => {
    const md = lines.join('\n').trim();
    if (name) out[name] = (out[name] ? out[name] + '\n\n' : '') + md;
    else if (md) out.extra.push(md);
    lines = [];
  };
  body.split('\n').forEach(raw => {
    const h = /^(#{1,4})\s+(.*)$/.exec(raw.trim());
    if (h) {
      const key = h[2].trim().toLowerCase();
      // An h1 is the plan's own title, which the modal already shows.
      if (h[1].length === 1) return;
      if (PLAN_SECTIONS.indexOf(key) !== -1) { flush(); name = key; level = h[1].length; return; }
      // A heading of its own at the section's level or above ends the section.
      if (name && h[1].length <= level) { flush(); name = null; }
    }
    lines.push(raw);
  });
  flush();
  return out;
}

// Top-level items only: an indented line under a finding is part of it.
const planCount = (md, re) => (md || '').split('\n').filter(l => re.test(l)).length;

function planMainHTML(text, p){
  if (text === null) return '<div class="err">Could not read that plan.</div>';
  const s = planSections(text);
  if (s.findings === undefined && s['proposed plan'] === undefined) {
    return '<div class="repdoc">' + mdBlocks(text, { drop: PLAN_UNSHOWN.concat('History') }) + '</div>';
  }
  const summary = s.summary ? mdBlocks(s.summary) : (p.summary ? '<p>' + mdInline(p.summary) + '</p>' : '');
  const steps = planCount(s['proposed plan'], /^\d+[.)]\s/);
  const found = planCount(s.findings, /^[-*]\s/);
  const extra = s.extra.map(md => mdBlocks(md)).join('');
  const tab = (id, label, n) =>
    '<button type="button" class="tab" role="tab" ' +
      'data-plantab="' + id + '" aria-selected="' + (planModalTab === id) + '">' +
      esc(label) + '<span class="n">' + n + '</span></button>';
  return (summary
      ? '<section class="plansummary"><h3 class="planlabel">Summary</h3><div class="repdoc">' + summary + '</div></section>'
      : '') +
    '<div class="tabs plantabs" role="tablist">' +
      tab('plan', 'Proposed plan', steps) + tab('findings', 'Findings', found) +
    '</div>' +
    '<div class="repdoc planpanel' + (planModalTab === 'plan' ? '' : ' hidden') + '" data-planpanel="plan" role="tabpanel">' +
      (s['proposed plan'] ? mdBlocks(s['proposed plan']) : '<p class="empty">No steps written.</p>') +
      (s['needs you'] ? '<h4>Needs you</h4>' + mdBlocks(s['needs you']) : '') +
      extra +
    '</div>' +
    '<div class="repdoc planpanel' + (planModalTab === 'findings' ? '' : ' hidden') + '" data-planpanel="findings" role="tabpanel">' +
      (s.findings ? mdBlocks(s.findings) : '<p class="empty">No findings written.</p>') +
    '</div>';
}

function wirePlanTabs(){
  const sheet = modalEl && modalEl.querySelector('.sheet.planmodal');
  if (!sheet) return;
  sheet.querySelectorAll('[data-plantab]').forEach(b => {
    b.onclick = () => {
      planModalTab = b.dataset.plantab;
      sheet.querySelectorAll('[data-plantab]').forEach(t => {
        // aria-selected carries the look as well, since this file keeps .on
        // off classList (test_primitives.mjs holds it to that).
        t.setAttribute('aria-selected', String(t.dataset.plantab === planModalTab));
      });
      sheet.querySelectorAll('[data-planpanel]').forEach(el =>
        el.classList.toggle('hidden', el.dataset.planpanel !== planModalTab));
    };
  });
}

/* The timeline, newest first, from plan_meta()'s reading of the History
   section. A line that re-planned after a send-back is two events, so it draws
   two: the revision, and below it the send-back quoting his reason. A plan
   sent back and not yet written again has that send-back on top, from its own
   `feedback:`. Lines carry a date only, so the current revision alone shows a
   time. */
function planHistoryItems(p){
  const revs = (p.revisions || []).slice().sort((a, b) => b.revision - a.revision);
  const items = [];
  const pending = p.feedback && planColumn(p) === PLAN_COL.todo;
  if (pending) items.push({ kind:'sent', when: p.modified ? reportDay(p.modified.slice(0, 10)) : '',
                            title:'Sent back', quote: p.feedback });
  const iso = p.generated || p.created;
  if (!revs.length) {
    items.push({ kind: pending ? 'old' : 'current', title:'Revision 1',
                 when: iso ? backupWhen(iso) : reportDay(p.night || p.date || ''),
                 note: p.agent ? 'Planned by `' + p.agent + '`.' : '' });
  }
  revs.forEach((r, i) => {
    const current = i === 0 && !pending;
    items.push({ kind: current ? 'current' : 'old', title:'Revision ' + r.revision,
                 when: current && iso ? backupWhen(iso) : reportDay(r.date), note: r.note || '' });
    /* What he said about that revision, which is either the send-back the
       night answered or one of the three the board writes. `conversation`
       says it was a chat he had about the plan rather than a sentence he
       typed, which is worth marking: a quote that long reads as a paste
       otherwise. */
    if (r.sent_back) items.push({
      kind:'sent',
      title: r.conversation ? 'What you said, in a chat' : 'Sent back',
      when: reportDay(r.date), quote: r.sent_back });
  });
  return items;
}

function planHistoryHTML(p){
  const items = planHistoryItems(p);
  // A div rather than an <aside>: the drawer's styles are written against
  // every aside on the page.
  return '<div class="planhistory" role="complementary" aria-label="History">' +
    '<h3 class="planlabel">History <span class="n">' + items.length + '</span></h3>' +
    '<ol class="plantimeline">' + items.map(it =>
      '<li class="' + it.kind + '">' +
        '<span class="pdot" aria-hidden="true"></span>' +
        '<div class="phead"><b>' + esc(it.title) + '</b>' +
          (it.when ? '<span class="pwhen">' + esc(it.when) + '</span>' : '') + '</div>' +
        (it.quote ? '<q class="pnote" title="' + esc(it.quote) + '">' + esc(it.quote) + '</q>'
          : it.note ? '<div class="pnote">' + mdInline(it.note) + '</div>' : '') +
      '</li>').join('') +
    '</ol></div>';
}

async function loadPlanBody(p){
  let text;
  try {
    const res = await fetch(p.url + '?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error(res.status);
    text = await res.text();
    planTexts[p.url] = text;
  } catch (err) {
    text = null;
  }
  // The modal may have been closed, or moved on to another plan, while this
  // was in flight — write back only if it is still the one showing.
  const main = modalEl && modalEl.querySelector('.sheet.planmodal .planmain');
  if (!main || modalEl.querySelector('h2').textContent !== p.title) return;
  main.innerHTML = planMainHTML(text, p);
  wirePlanTabs();
}

/* `quiet` is the read-on-open case: it should not redraw the list underneath an
   open modal, which would be a card shuffling itself while he is reading it. */
async function movePlan(p, state, owner, opts){
  opts = opts || {};
  const seen = opts.seen !== undefined ? opts.seen : true;
  try {
    const res = await postJSON('/stream/apply', {
      stream: 'plans',
      item: { name: p.name },
      to: state, owner, seen,
      resolution: opts.resolution || '',
      reason: opts.reason || '',
      /* Left out unless the move is about production, since the stream treats
         a `production` it is given as the new value and a move that says
         nothing about it must not reset it. */
      ...(opts.production ? { production: opts.production } : {})
    });
    if (res && res.ok === false) throw new Error(res.error || 'the stream refused it');
    p.state = state; p.owner = owner; p.seen = seen;
    if (opts.production) p.production = opts.production;
    if (opts.resolution) p.resolution = opts.resolution;
    if (opts.reason) p.feedback = opts.reason;
    // A quiet move repaints nothing, so opening a plan would leave the badge
    // counting it until the next render.
    if (opts.quiet) setPlansBadge(countPlansAwaiting(planList));
    /* The task behind the plan, and the hold list that decides whether tonight
       touches it. A plan's own state means nothing to agents/planning_agent/pick.py — it reads
       the ledger and the hold list — so a move that says "leave this alone" has
       to say it where the picker looks. */
    if (opts.hold || opts.release) {
      await setTaskHeld(planTaskKey(p), !!opts.hold);
    }
    if (!opts.quiet) { renderPlansList(); renderQueue(); }
    return true;
  } catch (err) {
    if (!opts.quiet) showToast('Could not move that plan: ' + (err.message || err), 'bad');
    return false;
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
/* The Plans tab's badge: how many plans are sitting in Waiting for review
   that he has not opened yet, across every bucket whatever the filter says, since the tab is asking him
   to go and look rather than describing the view he has filtered.

   Plans loads its list only when it is opened, so the count has a fetch of its
   own for every other view — on each view change and whenever the tab comes
   back into focus, which is when a night's plans are first worth flagging.
   On Plans itself the list it has just drawn is the answer. It updates the
   tab in place rather than redrawing the strip, which would shut the view
   menu if it happened to be open. */
let plansAwaiting = 0;

function plansAwaitingBadgeHTML(){
  return numberBadgeHTML({ n: plansAwaiting, label: 'new plans waiting for review' });
}

// Unread only, decided 15 Sep 2026: one he has opened and not yet decided on is
// already his to get to, so counting it again only nags.
function countPlansAwaiting(list){
  return list.filter(p => planColumn(p) === PLAN_COL.review && !p.seen).length;
}

function setPlansBadge(n){
  if (n === plansAwaiting) return;
  plansAwaiting = n;
  const tab = document.querySelector('#viewToggle [data-view="plans"]');
  if (!tab) return;
  tab.querySelectorAll('.tenon-badge').forEach(b => b.remove());
  tab.insertAdjacentHTML('beforeend', plansAwaitingBadgeHTML());
}

async function refreshPlansBadge(){
  try {
    const res = await fetch('/plans.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) return;
    const list = (await res.json()).plans || [];
    setPlansBadge(countPlansAwaiting(list));
  } catch (_) { /* the board helper is down; the badge keeps what it had */ }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.view !== 'plans') refreshPlansBadge();
});

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
function planScores(t){
  if (!t) return null;
  return {
    needsScoring: unscored(t) && !t.done,
    impact: t.impact ? { level: t.impact, label: IMPACT_EMOJI[t.impact] || t.impact } : null,
    effort: t.effort || ''
  };
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
function colFilterProps(id, shown, filters, current, onPick){
  const options = filters
    .map(f => ({ key: f.key, label: f.label, n: shown.filter(f.match).length }))
    .filter(o => o.n);
  if (!options.length) return null;
  return { id, current, total: shown.length, options, onPick };
}

/* Picking an option sets the filter and redraws the lists. The dropdown's own
   open state and its outside-click close belong to ColumnFilter
   (kanban/ui/ColumnFilter.tsx); until 19 Sep 2026 two delegated listeners on
   `document` did both, because the dropdown was markup React never owned. */
const pickReviewFilter = k => { reviewFilter = k; renderPlansList(); };
const pickDoneFilter = k => { doneFilter = k; renderPlansList(); };

/* A move can land a card in any of the seven, so all seven are worked out together
   rather than each render guessing which two were touched. None of them paints
   on its own any more — each writes into plansProps and the paint happens once
   at the end, which is what stops six renders and six re-wirings per move. */
function renderPlansList(){
  setPlansBadge(countPlansAwaiting(planList));
  renderPlanReview();
  renderPlanProduced();
  renderPlanProducing();
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
  const col = planColumn(p);
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
    /* Start, or return to, the session actually carrying this out — only
       while there is one worth having: not before he has accepted it, and
       not once do has already marked it produced, since the session's job
       is finished by then and the transcript is history rather than
       something to reopen. */
    action: ((col === PLAN_COL.produced || col === PLAN_COL.producing) && p.production !== 'done')
      ? BoardUI.h('button', { className: 'btn outline small startsession',
          onClick: e => { e.stopPropagation(); col === PLAN_COL.produced ? startProducing(p) : startPlanSession(p); } },
          p.production_session ? 'Return to session' : 'Start session')
      : null,
    /* Not every plan resolves: the task might since have been renamed or
       deleted, so the link falls back to the name the plan itself stored, and
       goToPlanTask says so on the click. */
    gotoKey: key,
    gotoLabel: task ? task.title : key,
    where: [p.bucket, p.column, planGeneratedLabel(p), planRevisionsLabel(p)],
    /* The task's own impact and effort, read live off the task every render
       rather than copied into the plan — the one thing on the row that cannot
       go stale, and what the column is ordered by. */
    scores: planScores(task),
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
    onDragEnd: e => { drag = null; e.currentTarget.classList.remove('dragging'); },
    /* Producing is one-way: cards go in and none comes out by hand. `attrs`
       merges over PlanCard's own `draggable: true`, so the card is still a
       card in every other respect — it opens, it links back to its task, it
       keeps its session button. */
    attrs: col === PLAN_COL.producing ? { draggable: false } : undefined
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
  plansProps.reviewFilterProps = colFilterProps('review', all, REVIEW_FILTERS, reviewFilter, pickReviewFilter);
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
  if (shown.length) plansProps.doingEmpty = false;
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
    ? planCardNodes(shown)
    : emptyNode('Nothing accepted yet. A plan you accept lands here, and from ' +
                'it is waiting to be produced.');
  plansProps.producedCount = shown.length;
  plansProps.producedSort = plansSortBtn('produced');
}

/* Producing. The implementing agent is on this one now — `production: doing`,
   which the do skill writes on handover and which the board writes too when a
   card is dropped in here.

   One-way, and that is the whole shape of it: it takes drops from Ready to be
   produced, and its cards are not draggable out. What happens next is the
   agent reporting back or the work finishing, and neither is something to say
   by dragging a card — the same reason Waiting for review takes no drops. A
   card leaves this column when `production` moves on. */
function renderPlanProducing(){
  const shown = orderPlans(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.producing), 'producing');
  plansProps.producing = shown.length
    ? planCardNodes(shown)
    : emptyNode('Nothing being made. Drag a plan here when the implementing agent picks it up.');
  plansProps.producingCount = shown.length;
  plansProps.producingSort = plansSortBtn('producing');
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
  plansProps.doneFilterProps = colFilterProps('done', all, DONE_FILTERS, doneFilter, pickDoneFilter);
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
/* What pick.py's three rules put in Backlog rather than in tonight's queue:
   parked, blocked by something unfinished, or waiting on a `start:` date. They
   were not drawn at all until 17 Sep 2026, which is what broke one task, one
   plan — a task handed to AI was on the board and nowhere on this view. Each
   one carries the rule's own words in `why`, and dragging it into To do
   overrules the rule. */
let queueSkipped = [];
let queueOrder = [];      // the stored ordering, so held ranks survive a save
/* The titles he has overruled, as the file holds them, for the same reason the
   hold list below is kept as the file holds it. */
let queueForceTitles = [];
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

/* A task queued for tonight, as a plan-card stub — the same shell every plan
   on this view draws in, the way Backlog's held tasks already do (see
   heldPlanCardNode below). It was a bare `Card` until 15 Sep 2026, which put
   two different-looking cards under one heading saying the same thing: plan
   this tonight. The eyebrow is what carries the difference, "no plan yet"
   against the "planning again" a sent-back plan wears, rather than a second
   card shape doing the telling.

   Two things it keeps that a plan card has no use for: its rank, which is what
   a drag in this column edits, and the Hold button, since there is no plan to
   open instead. What was the `.qwhy` line under the row — "never planned", or
   "changed since" and when it was last planned — is the card's summary now,
   which is the slot a plan's own standfirst takes. */
function queueRowNode(r){
  const why = (r.why || '') + (r.last ? ' · last planned ' + r.last : '');
  return BoardUI.h(BoardUI.PlanCard, {
    key: 'q:' + r.title,
    /* No plan file to be identified by, so the title stands in — the same
       shape heldPlanCardNode's `held:` key takes, for the same reason. */
    url: 'queued:' + r.title,
    title: r.title,
    variant: ' qitem',
    word: 'no plan yet',
    position: r.position,
    gotoKey: r.slug || r.title,
    gotoLabel: r.title,
    where: [r.bucket, r.column, r.agent],
    summaryHTML: why ? esc(why) : '',
    onOpen: () => openQueuedModal(r, PLAN_COL_LABEL.todo),
    /* "Move to backlog" rather than "Hold", since 17 Sep 2026: the button and
       a drag into Backlog make the same move, and two names for one move is
       how the two came to read as different things. */
    action: BoardUI.h('button', { className: 'btn outline small qhold',
      title: 'Hold it back from tonight',
      onClick: e => { e.stopPropagation(); holdTask(r.title); } }, 'Move to backlog'),
    onGoto: () => goToPlanTask(r.slug || r.title),
    /* Through `attrs` rather than as props: a queue row is a drop target as
       well as a drag source, and the four handlers that make it one are no
       part of what a plan card does. */
    attrs: queueRowDragProps(r, () => queueRows, 'queue')
  });
}

function renderQueueList(){
  const shown = plansShown(queueRows);
  /* Plans he has sent back sit in this column too, under the queue. The task
     itself is already in the list above — is_stale() puts it straight back —
     so this is the written half rather than a second copy of the work: what
     was wrong with the last attempt, which is what tonight is working from. */
  const back = byTaskPriority(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.todo));
  /* A plan sent back for another night carries its own "planning again"
     label already (see planWord()), so it reads fine sitting straight under
     tonight's queue rather than behind a heading saying the same thing. */
  plansProps.queue = shown.map(queueRowNode).concat(planCardNodes(back));
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
    /* Moving onto a card inside the column fires a leave too, so it only
       clears once the pointer is really outside, the board's own .drop rule.
       Checking e.target instead kept the outline on whenever the pointer left
       across a card, until 15 Sep 2026. */
    onDragLeave: e => {
      const el = e.currentTarget;
      if (!el.contains(e.relatedTarget)) el.classList.remove('coldrop', 'coldeny');
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

/* A drag let go anywhere else, or cancelled with Escape, reaches no column's
   drop handler, so whatever column it was over would keep its outline. */
document.addEventListener('dragend', () => {
  document.querySelectorAll('.coldrop, .coldeny').forEach(el => el.classList.remove('coldrop', 'coldeny'));
});

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
  } else if (from === 'skipped') {
    /* One of pick.py's three rules put this card in Backlog, and dropping it
       here overrules the rule for tonight — the same write the card's own
       button makes, landing at the rank it was let go on rather than at the
       end. */
    const at = queueSkipped.findIndex(r => r.title === title);
    if (at < 0) return;
    const [row] = queueSkipped.splice(at, 1);
    row.state = 'queued';
    row.why = '';
    force(title);
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
/* Held and forced are the two Plans columns saying opposite things about one
   task, so nothing is ever in both: holding a card drops whatever override put
   it in the queue, and forcing one drops the hold. save_order() in pick.py
   enforces the same rule on the file, since the board is not the only writer
   of it. */
function hold(title){
  if (!queueHoldTitles.some(t => sameTitle(t, title))) queueHoldTitles.push(title);
  unforce(title);
}
function unhold(title){
  queueHoldTitles = queueHoldTitles.filter(t => !sameTitle(t, title));
}
function force(title){
  if (!queueForceTitles.some(t => sameTitle(t, title))) queueForceTitles.push(title);
  unhold(title);
}
function unforce(title){
  queueForceTitles = queueForceTitles.filter(t => !sameTitle(t, title));
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
   Backlog — everything the agent is to leave alone: a task moved out of
   tonight's queue by hand, a task pick.py's own rules put here, or a plan
   already parked. All three drag back into To do.

   The middle kind arrived 17 Sep 2026 with one task, one plan. A task tagged
   `ai:: full` that is blocked, parked or waiting on a `start:` date used to be
   dropped by pick.py and drawn nowhere, so the board showed it in Handed to AI
   and this view showed nothing — the two never agreed on a count. It is a card
   here now, wearing the rule's own words, and dragging it into To do writes the
   `force` list pick.select() reads: the rules say where a card starts, and the
   column says what happens to it.
   ------------------------------------------------------------------------- */

/* A held task has no plan written about it yet, but Backlog is meant to read
   as one thing — a card the agent leaves alone — so it draws in the same
   `PlanCard` shell every parked plan does, dashed and dimmed the same way,
   with its eyebrow saying "held" rather than "parked" rather than a
   different card shape doing the telling. It drags out to To do exactly as
   the Hold button's reverse always did; there is no rank to drop it
   against, so nothing here tries to reorder it. */
function heldPlanCardNode(r){
  const key = r.slug || r.title;
  return BoardUI.h(BoardUI.PlanCard, {
    key: 'held:' + r.title,
    url: 'held:' + r.title,
    title: r.title,
    variant: ' parked',
    word: 'held',
    gotoKey: key,
    gotoLabel: r.title,
    where: [r.bucket, r.column],
    onOpen: () => openQueuedModal(r, PLAN_COL_LABEL.backlog),
    action: BoardUI.h('button', { className: 'btn outline small release',
      title: 'Put it back in the queue',
      onClick: e => { e.stopPropagation(); releaseHeld(r.title); } }, 'Release'),
    onGoto: () => goToPlanTask(key),
    onDragStart: e => {
      drag = { kind:'task', title: r.title, from:'held' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', r.title);
      e.currentTarget.classList.add('dragging');
    },
    onDragEnd: e => { drag = null; e.currentTarget.classList.remove('dragging'); }
  });
}

/* The same shell again, for a task one of pick.py's three rules put here. It
   differs from a held card in one way only, and it is the important one: the
   eyebrow carries the rule rather than the word "held", because what he needs
   to read is why this is not being planned tonight. The button overrules the
   rule rather than releasing a hold, so it says so. */
function skippedPlanCardNode(r){
  const key = r.slug || r.title;
  return BoardUI.h(BoardUI.PlanCard, {
    key: 'skip:' + r.title,
    url: 'skip:' + r.title,
    title: r.title,
    variant: ' parked',
    word: 'not queued',
    gotoKey: key,
    gotoLabel: r.title,
    where: [r.bucket, r.column],
    summaryHTML: r.why ? esc(r.why) : '',
    onOpen: () => openQueuedModal(r, PLAN_COL_LABEL.backlog),
    action: BoardUI.h('button', { className: 'btn outline small release',
      title: 'Plan it tonight anyway',
      onClick: e => { e.stopPropagation(); forceSkipped(r.title); } }, 'Move to To do'),
    onGoto: () => goToPlanTask(key),
    onDragStart: e => {
      drag = { kind:'task', title: r.title, from:'skipped' };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', r.title);
      e.currentTarget.classList.add('dragging');
    },
    onDragEnd: e => { drag = null; e.currentTarget.classList.remove('dragging'); }
  });
}

/* Which tasks already have a plan card somewhere else on this view. A skipped
   row whose task has been planned is that plan — drawing the row as well would
   be the same task twice, which is the thing one task, one plan is for. */
function plannedTaskKeys(){
  const out = new Set();
  planList.forEach(p => {
    const k = planTaskKey(p);
    if (k) out.add(String(k).trim().toLowerCase());
  });
  return out;
}

function renderBacklogList(){
  const held = plansShown(queueHeld);
  const planned = plannedTaskKeys();
  /* Two filters, and both are what keeps the count honest in one direction or
     the other. `ai === 'full'` is the set the board draws in Handed to AI, and
     pick.py's skipped list is wider than that — it names every `ai:: partial`
     task too, which is 30 of them on the twinkl list and none of which has been
     handed over at all. And a row whose task already has a plan card somewhere
     on this view is that plan; drawing the row as well would be the same task
     twice. */
  const skipped = plansShown(queueSkipped).filter(r =>
    r.ai === 'full' && !planned.has(String(r.slug || r.title).trim().toLowerCase()));
  const parked = byTaskPriority(plansShown(planList).filter(p => planColumn(p) === PLAN_COL.backlog));
  /* A parked plan is the written half of the same instruction the held cards
     carry: the task is held, and this is what the agent had already worked
     out about it. Kept openable rather than filed away, since taking it out
     of Backlog later is a decision better made having read it. Every card
     here is the same instruction — leave it alone — so nothing separates
     the two kinds beyond their own eyebrow. */
  const body = held.map(heldPlanCardNode)
    .concat(skipped.map(skippedPlanCardNode))
    .concat(planCardNodes(parked));
  plansProps.backlog = body.length ? body
    : [BoardUI.h('div', { className: 'empty', key: 'none' }, 'Nothing held back right now.')];
  plansProps.backlogCount = held.length + skipped.length + parked.length;
}

/* Overrule the rule that put a card here: the task goes into tonight's queue
   and its title into `force`, which is what makes that survive a reload. The
   row is moved on screen first so the drag lands where it was let go rather
   than waiting on the next /queue.json. */
function forceSkipped(title){
  const at = queueSkipped.findIndex(r => r.title === title);
  if (at < 0) return;
  const [row] = queueSkipped.splice(at, 1);
  row.state = 'queued';
  row.why = '';
  force(title);
  queueRows.push(row);
  queueRows.forEach((r, i) => { r.position = i + 1; });
  renderQueueList();
  renderBacklogList();
  paintPlans();
  saveQueueOrder(false);
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
  /* Same reasoning as the hold list: a forced title can be off screen — its
     plan came back overnight and the card is in Waiting for review now — and
     rebuilding this from the rows would quietly un-force it on the next save. */
  const force = queueForceTitles;
  try {
    await postJSON('/queue/order', { order, hold, force });
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
    queueForceTitles = q.force || [];
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
  plansProps.doingEmpty = !(live || (parked && parked.length));
  plansProps.orphan = (!live && orphan) ? { title: orphan.title } : null;
}

/* Only ever drawn while #doingOut is actually showing — see
   renderQueueDoingHead — so there is no idle or orphan case to handle here;
   those are the queue's job now. */
function renderDoing(n){
  const when = s => s ? s.slice(11, 16) : '';
  if (n.live && n.current) {
    plansProps.liveRun = { between: false, title: n.current.title,
                           agent: n.current.agent, since: when(n.current.since) };
  } else if (n.live) {
    plansProps.liveRun = { between: true };
  } else {
    plansProps.liveRun = null;
  }
}

/* The batch's own numbers — when it started, how far through it is, what
   made it stop early. Sits in Done rather than in the Queue/Doing card: this
   is a record of the run, the same kind of fact "Latest run costs" is, not a
   description of what's happening or about to. */
/* One clear line replacing the Run started / Planned / Left block, in the
   column's own description — the same move made for the To do column below.
   A plain string rather than markup, since it goes straight into Column's
   `desc`. */
function renderDoneStats(n){
  /* Leads with when the run was, in schedWhen()'s format rather than as a
     sixteen-character slice of an ISO string — the same answer the schedule
     modal gives, without opening it. */
  let text = n.started
    ? 'Last run ' + (schedWhen(n.started) || n.started.slice(0, 16)) + ' — planned ' + n.done.length +
      (n.toPlan ? ' of ' + n.toPlan : '') + (n.left ? ', ' + n.left + ' left' : '') + '.'
    : 'The log has nothing since the last run started. A wake that found no ' +
      'window logs its reason and stops without starting one.';
  if (n.stopped) text += ' ' + n.stopped;
  plansProps.reviewDesc = text;
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
  }
  setRunResults({ label, done: n.done, failed: n.failed });
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
    plansProps.queueError = null;
    renderQueueDoingHead(live, n.orphan);
    renderDoing(n);
    renderDoneStats(n);
    paintPlans();
    /* Outside the paint: the run-results fold lives in a modal this view does
       not own, and it is still drawn by id. */
    renderRunResults(n);
  } catch (err) {
    plansProps.queueError = 'Could not read the run log. ' + String(err.message || err);
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

   The body is one React tree, painted by paintRefCards(). Each renderer keeps
   its own slice of what it shows and paints only if the modal is open, so a
   fetch that lands after it has shut costs nothing. */
function openRefCards(){
  /* One React tree in the body, drawn by paintRefCards() in 14-schedule.js. The
     modal is a sheet the board builds as a string; what goes in it is not. */
  showModal('Spend, and what runs on a clock',
    'Both are reference. Nothing on either changes what tonight does.',
    '<div id="refCardsRoot"></div>',
    [{ label:'Close', primary:true }],
    { wide:true, onClose: () => { const host = $('#refCardsRoot'); if (host) BoardUI.unmount(host); } });
  paintRefCards();
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
  queueError: null,
  queueDesc: 'Loading…',
  queue: 'Loading…',
  orphan: null,
  liveRun: null,
  doingEmpty: false,
  reviewDesc: 'Loading…',
  doingPlans: null,
  review: 'Loading…',
  produced: 'Loading…',
  producing: 'Loading…',
  done: 'Loading…',
  backlogCount: '',
  queueCount: '',
  doingCount: '',
  producedCount: '',
  producingCount: '',
  reviewFilterProps: null,
  doneFilterProps: null,
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

    /* Ready to be produced takes a plan with a body and nothing else. Since
       every card on this view is a plan card, the refusal is about whether a
       plan has been written rather than about what kind of card was picked
       up — which is what `kind:'task'` means here now: a card standing for a
       task the night has not got to yet. */
    producedDrop: columnDropProps(d => {
      const p = draggedPlan(d);
      if (p) acceptPlan(p);
    }, d => d.kind === 'plan',
       'No plan has been written for that yet, so there is nothing to accept.'),

    /* Producing takes a plan from Ready to be produced and gives none back:
       there is no drag out of it, so this is the only way a card gets in or
       out by hand. Plans only, for the same reason the column before it is. */
    producingDrop: columnDropProps(d => {
      const p = draggedPlan(d);
      if (p) producePlan(p);
    }, d => d.kind === 'plan',
       'No plan has been written for that yet, so there is nothing to make.'),

    /* Done takes them from the column before it, so a plan whose work has
       landed can be dragged across rather than only closed from inside the
       modal. */
    doneDrop: columnDropProps(d => {
      const p = draggedPlan(d);
      if (p) finishPlan(p);
    }, d => d.kind === 'plan',
       'No plan has been written for that yet, so there is nothing to finish.')
  })));
  return true;
}

/* The To do column's own description, drawn by renderStatus() in
   14-schedule.js, which reads /usage.json — the only route that knows it, and
   one call draws both that and the chart. It used to be a separate "Status"
   block inside the column body; it lives in the head now, the same place
   every other column's description does. */
function setPlansStatus(text){
  plansProps.queueDesc = text;
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
      setPlansBadge(0);
      plansProps.review = BoardUI.h('div', { className: 'empty' },
        'Nothing yet. The planning agent writes into ',
        BoardUI.h('code', null, 'data/plans/'),
        '; the queue on the left is what it would pick up tonight.');
      /* None of the three columns past review has any reason to explain where
         plans come from — the column beside them just did — so each
         only says it is empty rather than sitting on "Loading…" forever. */
      plansProps.produced = emptyNode('Nothing accepted yet.');
      plansProps.producing = emptyNode('Nothing being made.');
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
  renderNextRun();
}

