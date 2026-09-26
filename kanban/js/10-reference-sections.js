'use strict';

/* =========================================================================
   4b. Reference sections. Overview is four columns — Big rocks, This week, Quick
       wins, Delegate to Claude — plus Context. Dependency chain sits on Matrix,
       beside the nine cells.

   These used to be rendered as prose straight out of the markdown, which meant
   an entry was a sentence that happened to look like a task. Nothing connected
   it to the real card, so it could name a task that no longer existed and the
   view would show it happily. Since the tags moved onto the tasks, every entry
   here is built from a task or a sub-step, and clicking one opens it.
   ========================================================================= */

/* A prompt lives as a note under the thing it serves, the same way a suggested
   message does — see MSG_NOTE in core/todo.js, which reads the other one. */
const PROMPT_NOTE = /^\s*-\s+Prompt\s*:/i;
/* A ticket that needs raising. The board key in brackets says which one, the
   same shape as (draft) on a message: - Jira (DSYS): "Summary line". Leave the
   brackets off and every configured board is offered, which is the honest
   answer when it is not yet decided where the ticket belongs. */
const JIRA_NOTE   = /^\s*-\s+Jira(\s*\(([^)]*)\))?\s*:/i;
/* The ticket body, on the line under the Jira note it belongs to. "Description
   to paste" is what the first of these were written as, back when the board only
   carried the summary and the body really did have to be pasted. It still reads
   correctly, so it still parses — but `Description:` is the one to write now. */
const DESC_NOTE   = /^\s*-\s+Description(\s+to\s+paste)?\s*:/i;
/* The agenda for a recurring meeting. Unlike everything above it this is not one
   quoted line: what he pastes into the shared meeting notes is a bullet list, one
   bullet for the topic and one nested under it for the context, so the note is a
   heading and the block indented beneath it is the content.

      - Agenda:
        - AOP2027
          - Confirm the rescoped recommendation is agreed ...
        - Personal objectives
          - Shared 26 Aug, pending validation before Sage.

   No date on it, deliberately. The task's `[due:: ]` is the date of the next
   occurrence and the board rolls it forward itself, so a date here would be the
   same fact written twice with two chances to disagree. What the block holds is
   always the agenda for the meeting the task is currently pointing at, because
   rolling the task forward clears it. */
const AGENDA_NOTE = /^(\s*)-\s+Agenda\s*:/i;
/* Last meeting's agenda, kept for one cycle so the next one can be written
   against what was actually raised. Written by the roll, not by hand, which is
   why this one does carry a date: there is no field left pointing at it. */
const PREV_AGENDA_NOTE = /^(\s*)-\s+Previous agenda(\s*\(([^)]*)\))?\s*:/i;

/* One block-shaped note — an agenda — out of a run of note lines. Depth is what
   pairs them: a topic sits at the shallowest indent inside the block, and
   everything deeper under it is that topic's context. The block ends at the
   first line not indented past the heading, so an ordinary note can follow it. */
function readBlockNote(lines, head_re){
  const at = lines.findIndex(l => head_re.test(l));
  if (at < 0) return null;
  const head = head_re.exec(lines[at]);
  const headIndent = head[1].length;
  const block = [];
  for (let i = at + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (leadIndent(l) <= headIndent) break;
    block.push(l);
  }
  if (!block.length) return null;
  const topIndent = Math.min.apply(null, block.map(leadIndent));
  const topics = [];
  block.forEach(l => {
    const text = l.replace(/^\s*-\s+/, '').trimEnd();
    if (leadIndent(l) === topIndent) topics.push({ title: text, context: [] });
    else if (topics.length) topics[topics.length - 1].context.push(text);
  });
  if (!topics.length) return null;
  return { at, date: (head[3] || '').trim(), topics };
}
function readAgenda(lines){ return readBlockNote(lines, AGENDA_NOTE); }
function readPrevAgenda(lines){ return readBlockNote(lines, PREV_AGENDA_NOTE); }

/* What goes on the clipboard, in the shape the shared notes want rather than the
   shape this file wants. Three parts, and the first two are what he asked for:
   the meeting date as the title, a blank line, then the word Agenda, then the
   list. Both levels are real bullets — the topic and its context each being a
   bullet is the whole format, so neither can be plain indented text.

   Two flavours, because plain text alone does not survive the paste. Google Docs
   turns a leading "- " into a bullet only sometimes and drops the second level
   every time; given a text/html flavour it reads the <ul> and produces real
   nested bullets. Every clipboard that cannot read HTML still gets the text. */
function agendaClipboard(ag, when){
  const title = when ? longDate(when) : '';
  const text = (title ? title + '\n\n' : '') + 'Agenda\n' +
    ag.topics.map(t =>
      ['- ' + t.title].concat(t.context.map(c => '  - ' + c)).join('\n')
    ).join('\n');
  const html =
    (title ? '<p><strong>' + esc(title) + '</strong></p><p><br></p>' : '') +
    '<p>Agenda</p><ul>' +
    ag.topics.map(t =>
      '<li>' + mdInline(t.title) +
      (t.context.length
        ? '<ul>' + t.context.map(c => '<li>' + mdInline(c) + '</li>').join('') + '</ul>'
        : '') +
      '</li>').join('') +
    '</ul>';
  return { text, html };
}
/* Long form, because this one is a document title rather than a chip: "Wednesday,
   2 September 2026" reads as a heading where dueLabel's "Wed, 2 Sept 2026" reads
   as a tag. */
function longDate(s){
  const d = parseDue(s);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function noteMeta(lines){
  const meta = { message: '', draft: false, prompt: '', jira: null, agenda: null };
  lines.forEach(l => {
    if (MSG_NOTE.test(l))    { meta.message = quoted(l); meta.draft = /\(draft\)/i.test(l); }
    else if (PROMPT_NOTE.test(l)) { meta.prompt = quoted(l); }
  });
  /* Also a second pass, for the same reason as a description: an agenda is a
     block of lines rather than one line, so it cannot be read line by line. */
  meta.agenda = readAgenda(lines);
  /* Read in a second pass: a description sits on the line after the note it
     belongs to, so this cannot be decided one line at a time. */
  const tickets = readJiraRun(lines, '');
  if (tickets.length) meta.jira = tickets[0];
  return meta;
}

/* One Jira note as a board key and a summary. The key is whatever sat in the
   brackets, upper-cased so `dsys` and `DSYS` are the same board; an empty key
   means every board is offered. */
function readJira(line){
  const m = JIRA_NOTE.exec(line);
  const key = (m && m[2] ? m[2] : '').trim().toUpperCase();
  return { key, summary: quoted(line), description: '', raw: line, descRaw: '' };
}

/* Jira notes out of one run of note lines, each taking the description written
   under it. Order is what pairs them: a description belongs to the last Jira
   note seen, so a step carrying two tickets keeps two separate bodies rather
   than both of them collapsing onto the first. */
function readJiraRun(lines, where){
  const out = [];
  lines.forEach(l => {
    if (JIRA_NOTE.test(l)) out.push(Object.assign(readJira(l), { where }));
    else if (DESC_NOTE.test(l) && out.length) { out[out.length - 1].description = quoted(l); out[out.length - 1].descRaw = l; }
  });
  return out;
}

/* Every task and sub-step as one flat list. The reference sections all filter
   this, so an entry can never exist without the thing it points at. */
function allItems(){
  const out = [];
  state.doc.buckets.forEach((b, bi) => {
    const color = bucketColor(b.name, bi);
    b.tiers.forEach(tier => tier.tasks.forEach(t => {
      const parts = splitBody(t);
      const own = noteMeta(parts.notes);
      out.push({
        id: t.id, task: t, sub: null, color,
        bucket: b.name, tier: tier.name, parent: '',
        title: t.title, done: t.done,
        due: t.due, start: t.start, to: t.to, impact: t.impact, effort: t.effort,
        urgent: t.urgent, week: t.week, rank: t.rank,
        slug: t.slug, blockedBy: t.blockedBy || [],
        message: own.message, draft: own.draft, prompt: own.prompt, jira: own.jira,
        agenda: own.agenda, prevAgenda: readPrevAgenda(parts.notes),
        repeat: readRepeat(t.repeat)
      });
      parts.steps.forEach(s => {
        const meta = noteMeta(s.notes);
        out.push({
          id: t.id, task: t, sub: s, color,
          bucket: b.name, tier: tier.name, parent: t.title,
          title: s.clean, done: s.done || t.done,
          due: s.due,
          /* A step cannot begin before the task it sits inside can, so it takes
             the later of its own start and its parent's. */
          start: laterOf(s.start, t.start),
          /* Who does a step is the step's own answer, never the parent's: a
             task handed to an agent does not hand every step in it over too. */
          to: s.to, impact: '', effort: '',
          urgent: false, week: s.week, rank: s.rank,
          slug: s.slug, blockedBy: s.blockedBy,
          message: meta.message, draft: meta.draft, prompt: meta.prompt, jira: meta.jira,
          /* A step can carry its own agenda, but the cycle is the task's — the
             meeting is the task, the steps are what happens inside it. */
          agenda: meta.agenda, prevAgenda: null, repeat: readRepeat(t.repeat)
        });
      });
    }));
  });
  return out;
}

function itemBySlug(items, slug){ return items.find(i => i.slug === slug) || null; }

/* Which of the things an item waits on are still outstanding. A blocker that is
   not ticked yet blocks it. So does a slug that names nothing in the file: he
   cannot act on a dependency he cannot even look up, so an unresolvable one
   counts the same as an unfinished one.

   A sub-step carries no blocked-by tag of its own, but it cannot start before
   the task it sits inside can, so it inherits its parent's. */
function unresolvedBlockersFor(items, slugs){
  return (slugs || []).filter(slug => {
    const src = itemBySlug(items, slug);
    return !src || !src.done;
  });
}
function unresolvedBlockers(items, it){
  const own = it.blockedBy || [];
  const inherited = it.sub ? (it.task.blockedBy || []) : [];
  return unresolvedBlockersFor(items, own.concat(inherited));
}
function actionable(items, it){ return unresolvedBlockers(items, it).length === 0; }

/* Same rule as actionable, asked the other way round: not "should this be
   suggested" but "can this be ticked off right now". A task cannot be marked
   done while something it waits on is still open — the tick means the work
   is finished, and it cannot be if a dependency it needed first is not.
   Unticking is never gated; only the move onto Done is. Returns a status-line
   message naming what it is still waiting on, or '' if nothing is in the way. */
function blockedMessage(items, slugs){
  const unresolved = unresolvedBlockersFor(items, slugs);
  if (!unresolved.length) return '';
  const names = unresolved.map(slug => {
    const src = itemBySlug(items, slug);
    return src ? src.title : ('#' + slug);
  });
  return 'still waiting on ' + names.join(', ') + ' — finish that first';
}
/* Shown at the card, not the header status line — see .toasts above. Stacks
   if fired more than once before the first clears; each one clears itself. */
function showToast(msg, kind){
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast' + (kind ? ' ' + kind : '');
  el.textContent = msg;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 200);
  }, 3200);
}
function byDue(a, b){
  if (!a.due && !b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
}

/* ---- The small bordered card every reference renders as ---- */

function refChips(it){
  const chips = [];
  /* First, because on a recurring task how often it comes round is what frames
     every other tag on the card: the deadline is the next occurrence. */
  if (it.repeat) chips.push({ tone: 'neutral', text: it.repeat.label, title: 'Recurring ' + it.repeat.label });
  const si = startInfo(it.start);
  // Kept as the board's own chip — see cardModel()'s startdate comment.
  if (si) chips.push({ cls: 'tag startdate', text: si.label + ' · ' + si.note });
  const di = dueInfo(it.due, it.tier === WAIT_COL);
  if (di) chips.push({ tone: DUE_TONE[di.cls] || 'neutral', text: di.label + (di.note ? ' · ' + di.note : '') });
  if (it.urgent) chips.push({ tone: 'urgent', text: 'urgent' });
  if (it.impact) chips.push({ tone: 'neutral', text: IMPACT_EMOJI[it.impact] || it.impact, title: it.impact + ' impact' });
  if (it.effort) chips.push({ tone: 'neutral', text: it.effort });
  if (it.to && it.to.trim()) chips.push({ tone: 'accent', text: '→ ' + it.to.trim(),
    title: 'Delegated to ' + it.to.trim() });
  return chips;
}

/* These sections are the only place the five views exist now, so a card has to
   be somewhere he can work rather than just read: tick it here, open it here,
   drop it out of the week here. The tick writes to the task or the sub-step,
   whichever the card was built from, so the board and the file agree instantly.

   What one card says, as data for RefCard (kanban/ui/OverviewBodies.tsx).
   opts.message / opts.prompt say whether to include the body text. */
function refModel(it, opts){
  opts = opts || {};
  /* This card is a copy shown away from its own column, so the column itself —
     what the board would otherwise say just by where the card sits — has to
     be spelled out here instead. Same "bucket · tier" order the matrix hover
     preview already uses, so the two read as the same fact. */
  const where = [it.bucket, it.parent, it.done ? DONE_COL : it.tier].filter(Boolean).join(' · ');
  let body = '';
  if (opts.message && it.message) {
    body += messageHTML(it.message, { draft: it.draft });
  }
  /* Delegating a task to the Implement agent puts it here straight away, but the prompt is
     written by hand and lags behind the tag. Say so on the card, otherwise a
     task with nothing to paste looks the same as one that is ready to go. */
  if (opts.prompt) {
    body += it.prompt ? messageHTML(it.prompt, { claude:true, task:it.id })
                      : '<p class="reflead draft">Needs a prompt before this can be handed over</p>';
  }
  /* An agenda, on the same terms as a message: it is the whole of what the card
     is for, so it only shows where the section asked for it. */
  if (opts.agenda && it.agenda) body += agendaHTML(it.agenda, it.due);
  /* A ticket to raise is worth acting on from wherever the card is showing, so
     unlike a message or a prompt this needs no opts flag to turn it on. */
  if (it.jira) body += jiraHTML(it.jira);

  return {
    id: it.id,
    sub: it.sub ? it.sub.line : null,
    color: it.color,
    done: !!it.done,
    titleHTML: mdInline(it.title),
    where,
    chips: refChips(it),
    bodyHTML: body,
    unweek: !!opts.unweek,
    quickDismiss: opts.quickDismiss ? quickKey(it) : null
  };
}

/* One section's blocks, drawn by RefSection. `n` is what the head counts. */
function refSectionBody(blocks, n, sort){
  return { body: BoardUI.h(BoardUI.RefSection, { blocks }), count: n, sort: sort || null };
}

/* ---- Capping how many cards one Overview column shows ----
   A column that scrolls past the fold is not an overview any more, it is the
   board again with extra steps — so each one stops at a card count he can
   actually take in, and says how many were left off rather than quietly
   shrinking. Nothing is lost: the full list is still the board and the other
   views, this is only about what one glance at Overview shows. */
const OV_CARD_LIMIT = 8;
function capCards(items, limit){
  limit = limit || OV_CARD_LIMIT;
  if (items.length <= limit) return { shown: items, hidden: 0 };
  return { shown: items.slice(0, limit), hidden: items.length - limit };
}
/* The same cap spent across several groups in one column — Quick wins and
   Delegate both split into sub-groups — so the column's total stays capped
   rather than each sub-group getting its own budget. Earlier groups keep
   their cards; a group hit once the budget is spent shrinks or disappears,
   in the order it would already have rendered. */
function capGroups(groups, limit){
  limit = limit || OV_CARD_LIMIT;
  let budget = limit, hidden = 0;
  const shown = groups.map(g => {
    if (budget <= 0) { hidden += g.length; return []; }
    if (g.length <= budget) { budget -= g.length; return g; }
    hidden += g.length - budget;
    const s = g.slice(0, budget);
    budget = 0;
    return s;
  });
  return { shown, hidden };
}
function moreBlock(hidden){ return hidden ? [{ kind: 'more', hidden }] : []; }

/* ---- The five sections, each built from its tag ---- */

function weekSection(items){
  const live = items.filter(i => i.week).sort(byDue);
  if (!live.length) return refSectionBody([{ kind: 'empty', which: 'week' }], 0);
  const m = live.filter(i => i.effort === 'M' && !i.done).length;
  const blocks = [];
  if (m > 2) blocks.push({ kind: 'warn',
    text: m + ' M-effort items this week. The ceiling is two once meetings are counted.' });
  const { shown, hidden } = capCards(live);
  blocks.push({ kind: 'cards', cards: shown.map(i => refModel(i, { unweek:true })) });
  return refSectionBody(blocks.concat(moreBlock(hidden)), live.length);
}

/* A quick win has to be something he can act on right now. Anything still
   waiting on an unfinished blocker is not a win, it is a reminder that he cannot
   start — so it is left out. The count of what was held back is shown, because
   a section that quietly shrinks looks like a section with nothing in it.

   Anything delegated to the Implement agent is left out too. Delegate to
   Claude already lists every one of them, ranked, and the two columns sit side by side on Overview —
   the same card in both reads as two jobs when it is one. Quick wins is what is
   left for him to do himself.

   Backlog is left out entirely, the same call the matrix makes with HELD_TIER —
   it has been parked on purpose, so however small it is, it is not a real
   priority and not something to surface here.

   What is left is ordered by byPriority, the dependency chain's own
   assessment: a two-minute message that happens to unblock a big rock outranks
   one that unblocks nothing, the same way the chain ranks a blocked card by
   what is riding on it rather than its own score alone. */
/* Quick wins' second order: due-date-first rather than grouped/priority, the
   same toggle shape sortMode()/setSortMode() (03-tier-one-impact-effort.js)
   already gives the board's own columns — needing a key of its own since
   "Quick wins" is not a board column name, the same reason PROJECT_SORT_KEY
   exists rather than sharing state.sort. Grouped/priority is the default. */
const QUICK_SORT_KEY = 'todo-board-quickwins-sort';
function readQuickSortMode(){
  try { return localStorage.getItem(QUICK_SORT_KEY) === 'due' ? 'due' : 'priority'; }
  catch (e) { return 'priority'; }
}
let quickSortState = readQuickSortMode();
function quickSortMode(){ return quickSortState; }
function setQuickSortMode(mode){
  quickSortState = mode === 'due' ? 'due' : 'priority';
  try { localStorage.setItem(QUICK_SORT_KEY, quickSortState); } catch (e) {}
}
/* An attribute rather than a prop: the click is answered by the delegated
   listener in 25-archiving.js, like every other control in these columns. */
function quickSortBtn(){
  const due = quickSortMode() === 'due';
  return BoardUI.h('button', {
    className: 'sortbtn' + (due ? ' on' : ''), type: 'button', 'data-quicksort': '',
    title: due
      ? 'Showing the nearest deadline first, undated at the bottom. Click to sort by what is worth doing first.'
      : 'Grouped by what it costs, worth doing first inside each. Click to sort by due date instead.'
  }, due ? 'by due date' : 'grouped');
}

function quickSection(items){
  // The Implement agent's work belongs to Delegate to Claude, and Backlog is
  // not a real priority — neither belongs here.
  const implementing = i => agentOf(i.to) === 'Implement agent';
  const open = items.filter(i => !i.done && !implementing(i) && i.tier !== HELD_TIER);
  // Two separate reasons something is not a quick win yet: it waits on another
  // task, or its start date has not arrived. Neither is about the deadline —
  // an overdue task is the most actionable thing on the list, not the least.
  const actionableNow = open.filter(i => actionable(items, i) && !notYet(i.start));
  const live = quickSortMode() === 'due' ? actionableNow.slice().sort(byDue) : byPriority(items, actionableNow).order;
  const heldByDep = open.filter(i => !actionable(items, i)).length;
  const heldByDate = open.filter(i => actionable(items, i) && notYet(i.start)).length;
  const heldByBacklog = items.filter(i => !i.done && !implementing(i) && i.tier === HELD_TIER).length;
  const isS = i => i.sub === null && i.effort === 'S';
  const seen = new Set();
  const take = arr => arr.filter(i => { const k = i.id + '|' + i.title; if (seen.has(k)) return false; seen.add(k); return true; });

  const dismissed = quickDismissedSet();
  const notDismissed = i => !dismissed.has(quickKey(i));

  const reasons = [];
  if (heldByDep)  reasons.push({ n: heldByDep, text: 'waiting on another task' });
  if (heldByDate) reasons.push({ n: heldByDate, text: 'not startable yet' });
  if (heldByBacklog) reasons.push({ n: heldByBacklog, text: 'parked in ' + HELD_TIER });
  const note = reasons.length ? [{ kind: 'held', parts: reasons }] : [];

  if (quickSortMode() === 'due') {
    /* Flat once sorted by due date: the four groups below answer "what kind of
       win is this", which stops meaning anything once the order is "what is
       nearest" — a due-date read is one list rather than four short ones, the
       same call the entry that asked for this made. */
    const preAll = take(live);
    const all = preAll.filter(notDismissed);
    const dismissedShown = preAll.length - all.length;
    const capped = capCards(all);
    const cards = capped.shown.map(i => refModel(i, {
      agenda: !!(i.repeat && i.agenda && i.sub === null),
      message: !!i.message,
      quickDismiss: true
    }));
    const dismissedNote = dismissedShown ? [{ kind: 'dismissed', n: dismissedShown }] : [];
    return refSectionBody(
      cards.length
        ? note.concat([{ kind: 'cards', cards }], moreBlock(capped.hidden), dismissedNote)
        : note.concat(dismissedNote, [{ kind: 'empty', which: 'quick' }]),
      all.length, quickSortBtn());
  }

  /* Meetings first, and before the messages, because a standing meeting is the
     one thing here with a time on it rather than a deadline: 9:15 on Wednesday
     passes whether or not the agenda was ready. Nearest first.

     Only the ones with an agenda written, because the group is what he can clear
     in a gap and a written agenda is one paste from cleared. A recurring meeting
     with nothing on it yet is still on the board with its date, and it is still
     in the other groups if it is small — but it is not a quick win, it is the
     work. Nothing here says whether an agenda exists: the tick on the card is
     what says that, so a second answer to the same question is not wanted. */
  const preMeetings = take(live.filter(i => i.repeat && i.agenda && i.sub === null).sort(byDue));
  const preMessages = take(live.filter(i => i.message));
  /* A small task with the Plan agent comes back as a plan to say yes or no
     to. Anything else small is his, or waits on the person it names. */
  const preDecide   = take(live.filter(i => isS(i) && agentOf(i.to) === 'Plan agent'));
  const preTalk     = take(live.filter(i => isS(i) && !agentOf(i.to)));

  /* Dismissed here, not filtered out of `open` above: a dismissal is a
     preference about this list, not a fact about the task, so it must not
     touch heldByDep/heldByDate/heldByBacklog, which describe the task itself. */
  const meetings = preMeetings.filter(notDismissed);
  const messages = preMessages.filter(notDismissed);
  const decide   = preDecide.filter(notDismissed);
  const talk     = preTalk.filter(notDismissed);
  const dismissedShown = (preMeetings.length - meetings.length) + (preMessages.length - messages.length) +
    (preDecide.length - decide.length) + (preTalk.length - talk.length);

  const capped = capGroups([meetings, messages, decide, talk]);
  const [sMeetings, sMessages, sDecide, sTalk] = capped.shown;

  const out = [
    { kind: 'group', label: 'Costs one paste, before the meeting',
      cards: sMeetings.map(i => refModel(i, { agenda:true, quickDismiss:true })) },
    { kind: 'group', label: 'Costs one message, already written',
      cards: sMessages.map(i => refModel(i, { message:true, quickDismiss:true })) },
    { kind: 'group', label: 'Costs one decision', cards: sDecide.map(i => refModel(i, { quickDismiss:true })) },
    { kind: 'group', label: 'Costs one conversation', cards: sTalk.map(i => refModel(i, { quickDismiss:true })) }
  ].filter(g => g.cards.length);
  const dismissedNote = dismissedShown ? [{ kind: 'dismissed', n: dismissedShown }] : [];
  /* The count in the head is what is actually in the column — after the
     dismissals, before the cap, since a card hidden by the cap is still one of
     them and says so in its own "more" line. */
  const n = meetings.length + messages.length + decide.length + talk.length;
  return refSectionBody(
    out.length
      ? note.concat(out, moreBlock(capped.hidden), dismissedNote)
      : note.concat(dismissedNote, [{ kind: 'empty', which: 'quick' }]),
    n, quickSortBtn());
}

function bigRocksSection(items){
  const rocks = items.filter(i => i.sub === null && i.impact === 'high' && i.effort === 'L' && !i.done);
  if (!rocks.length) return refSectionBody([{ kind: 'empty', which: 'rocks' }], 0);
  const { shown, hidden } = capCards(rocks);
  return refSectionBody([{ kind: 'cards', cards: shown.map(i => refModel(i)) }].concat(moreBlock(hidden)), rocks.length);
}

/* An item's own impact. Sub-steps are never scored, so one takes the score of
   the task it sits in — that is the work it is part of. */
function itemImpact(it){
  return IMPACT_N[it.impact || (it.sub ? it.task.impact : '')] || 0;
}

/* What is riding on a blocked card: its own impact, or the impact of anything
   still waiting on it, whichever is higher. A small task holding up a big one
   is worth unpicking for the big one's sake, and that carries down a chain, so
   this follows the whole tail rather than one step of it. `seen` is copied at
   each step, which keeps it to the current path and stops a circular
   blocked-by from looping forever. */
function chainWeight(waiters, it, seen){
  seen = seen ? new Set(seen) : new Set();
  let best = itemImpact(it);
  if (!it.slug || seen.has(it.slug)) return best;
  seen.add(it.slug);
  (waiters.get(it.slug) || []).forEach(o => {
    best = Math.max(best, chainWeight(waiters, o, seen));
  });
  return best;
}

/* Slug → everything still waiting on it, across every open item. Built once
   and shared: both the chain and quick wins ask the same question — "what
   does finishing this actually unblock" — and re-deriving the answer per
   caller would be the same walk of the list twice. */
function waitersMap(items){
  const waiters = new Map();
  items.forEach(o => {
    if (o.done) return;
    unresolvedBlockers(items, o).forEach(sl => {
      if (!waiters.has(sl)) waiters.set(sl, []);
      waiters.get(sl).push(o);
    });
  });
  return waiters;
}

/* Heaviest first — the same assessment the dependency chain uses, reused
   wherever "what's actually worth doing first" is the question. Ties go to
   whichever frees the most tasks, then to the nearest date. Weight is looked
   up from a precomputed map rather than called fresh per comparison, since a
   sort calls its comparator O(n log n) times and chainWeight walks the whole
   downstream chain on every call. Returns the order and the weights it was
   computed from, since a caller sometimes needs to explain a card's position,
   not just show it. */
function byPriority(items, list){
  const waiters = waitersMap(items);
  const weight = new Map(list.map(i => [i, chainWeight(waiters, i, null)]));
  const order = list.slice().sort((a, b) => {
    const wd = weight.get(b) - weight.get(a);
    if (wd) return wd;
    const fd = (waiters.get(b.slug) || []).length - (waiters.get(a.slug) || []).length;
    if (fd) return fd;
    return byDue(a, b);
  });
  return { order, weight };
}

function chainSection(items){
  const blocked = items.filter(i => i.blockedBy.length && !i.done);
  const { order, weight } = byPriority(items, blocked);

  const ticket = it => ({
    id: it.id, color: it.color, titleHTML: mdInline(it.title), done: !!it.done,
    where: [it.bucket, it.done ? DONE_COL : it.tier].filter(Boolean).join(' \u00b7 ')
  });
  const entries = order.map(i => ({
    target: ticket(i),
    blockers: i.blockedBy.map(slug => {
      const src = itemBySlug(items, slug);
      return src ? ticket(src) : { slug, color: '', titleHTML: '', where: '', done: false };
    }),
    holdsHigher: weight.get(i) > itemImpact(i)
  }));
  return { body: BoardUI.h(BoardUI.ChainBody, { entries }), count: blocked.length };
}

/* Only the Implement agent's work belongs here, and `[to:: Implement agent]`
   is the gate. Manual
   drag-to-reorder on `rank:` (10 Sep 2026) came back out on a re-read: the
   automatic impact-against-effort score this entry originally asked for is
   what sorts it now, the same priorityScore() every other section already
   ranks by. `rank:` itself stays on the task — the planning agent's own queue
   still orders by it (agents/plan-agent/pick.py) — but this view no
   longer shows that number, since a task's scores can move without anyone
   re-ranking it and a stale rank next to a live sort would disagree with
   itself. What's on the row now is its position in the order shown. */
function delegateSection(items){
  /* The Implement sub-task of a handover is briefed by its plan and run through
     the `do` skill, not from a prompt pasted out of this list, so it is not here. */
  const eligible = items.filter(i => agentOf(i.to) === 'Implement agent' && !i.done &&
    !(i.sub && /-implement$/.test(i.slug || '')));
  if (!eligible.length) return refSectionBody([{ kind: 'empty', which: 'delegate' }], 0);

  const ranked = eligible
    .map((i, idx) => ({ i, idx }))
    .sort((a, b) => (priorityScore(b.i) - priorityScore(a.i)) || (a.idx - b.idx))
    .map(x => x.i);

  const { shown, hidden } = capCards(ranked);
  return refSectionBody(
    [{ kind: 'ranked', cards: shown.map(i => refModel(i, { prompt:true })) }].concat(moreBlock(hidden)),
    ranked.length);
}

/* ---- Small shared renderers ---- */

/* Three things that only make sense once the marks below have gone: a URL
   written on its own, a `[key:: value]` tag, and a `[placeholder]` still
   waiting to be filled in. One pass rather than three, with links, code spans
   and `[[wikilinks]]` matched first and handed straight back — so nothing
   here reaches inside a link that was already made, a span meant to read
   literally, or the one bracket form the file format uses for something else.

   Each match keeps every character it was written with, brackets included.
   That is not only honest about what is in the file — clicking a rendered
   note drops the caret into that exact text, and the arithmetic that finds
   the spot (rawOffsetForVisible in the drawer) works by counting characters
   that survive rendering. A chip that dropped its brackets would be two
   characters the count could not see. */
const MD_LATE_RE = new RegExp([
  '<a\\b[^>]*>[\\s\\S]*?<\\/a>',                   // a link the pass below already made
  '<code>[\\s\\S]*?<\\/code>',                     // meant to read literally
  '\\[\\[[^\\]\\n]*\\]\\]',                        // a wikilink, which is not a placeholder
  '(https?:\\/\\/[^\\s<>()]+[^\\s<>().,;:!?\'"])',  // 1: a URL on its own
  '(\\[[A-Za-z][\\w-]*::[^\\]]*\\])',              // 2: [key:: value]
  '(\\[[^\\[\\]\\n]+\\](?!\\())'                   // 3: [placeholder]
].join('|'), 'g');

function mdInline(s){
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_/g, '$1<em>$2</em>')
    // A lone "[path]" placeholder — see claudeHref above — has no following
    // (url), so it never matches this. MD_LATE_RE picks it up instead.
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(MD_LATE_RE, (whole, url, tag, hole) => {
      if (url) return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
      if (tag) return '<em class="mdtag">' + tag + '</em>';
      if (hole) return '<em class="mdhole">' + hole + '</em>';
      return whole;
    });
}
/* A prompt is written to be handed to Claude, so the board can do the handing
   rather than leaving it as a copy-and-paste. claude.ai/new?q= opens a fresh
   chat with the text already sitting in the box, unsent — which is the point,
   because most of these prompts still have a [path] to fill in before they go.
   Only prompts get this. A suggested message is for a person, not for Claude. */
function claudeHref(text){
  return 'https://claude.ai/new?q=' + encodeURIComponent(text);
}
function claudeLink(text){
  return '<a class="toclaude" href="' + claudeHref(text) + '" target="_blank" rel="noopener"' +
         ' title="Opens a new Claude chat with this prompt in the box, unsent">Open in Claude</a>';
}

/* ---- Chats on a task ----
   The engine and the modal itself live in ai_chat/ now, loaded above as
   AIChat — see ai_chat/README.md for the shape of that module and why it
   never stores a transcript of its own.

   What stays here is this board's own business: minting and persisting the
   `chat:` tag on a task line (that marks the list dirty, same as any other
   edit), drawing the "Chats" field inside the drawer, and wiring this
   board's shared click handler to the widget's API.

   A task carries a list rather than one conversation, because the work on a
   task is not one conversation. Reading the 360 responses, drafting the
   message that comes out of it and checking last quarter's wording are
   three, and keeping them apart is the point — each stays short enough to
   be worth resuming. */

// The stub below is the no-engine case, not a parked feature: on this machine
// server.py's AI_CHAT_DIR resolves to ../PACKAGES/ai_chat_engine and /claude.json
// answers, so the real AIChat loads and the buttons draw. Where that sibling
// folder is missing, or its dist/ was never built — a checkout of this repo on
// its own, or the board served statically — /ai-chat/ai-chat.js 404s and AIChat is never defined. Falling
// straight through to AIChat.create() would throw at the top level and stop the
// rest of this script (loadFile() included) from ever running, and the board
// would sit on the start screen forever with no error shown. The stub keeps
// every call site working with the feature simply switched off, the same
// "no engine, no buttons, not a crash" rule server.py already follows.
// A session getting filed, a run finishing, or the modal closing can all
// leave the drawer showing a stale "running" badge or an empty chat list —
// this is the one place that redraws it. It is also where a prompt run
// waiting to learn its own session id (see onPromptRunSend below) finds it:
// whichever row under its key wasn't there a moment ago, stamped before this
// moves on to the ordinary redraw.
function onSessionsChanged(index){
  if (state.pendingPromptRun) {
    const p = state.pendingPromptRun;
    const had = new Set((state.chats[p.key] || []).map(r => r.id));
    const fresh = ((index || {})[p.key] || []).find(r => !had.has(r.id));
    if (fresh) { notePrompt(p.key, fresh.id, p.raw); state.pendingPromptRun = null; }
  }
  state.chats = index || {};
  if (state.pendingChat) {
    const want = state.pendingChat;
    state.pendingChat = '';
    openChatByKey(want);
  }
  if (state.openTask) openDrawer(state.openTask);
}
/* Fired the instant a message leaves the composer, before any reply — the
   one moment "a prompt was actually run" rather than merely opened can be
   told apart from "the modal was opened and closed again". See "A prompt is
   used up by being run": this has to be on send rather than on the Ask Claude
   click that opens the modal, because opening one and closing it again must
   leave the prompt on the task. */
function onPromptRunSend(payload){
  const p = state.pendingPromptRun;
  if (!p || payload.session || payload.key !== p.key) return;
  const task = tasksByChatKey()[p.key];
  if (task) { removeBodyLine(task, p.raw); refreshView(); }
  // pendingPromptRun stays set, now waiting on onSessionsChanged above to
  // learn the session id the line's text gets recorded against.
}
function onChatChange(){ if (state.openTask) openDrawer(state.openTask); }
// The status fetch on load is the first time claudeOn() can go from false to
// true — the Ask Claude button on every prompt only exists once this has
// answered, so the whole view needs a redraw, not just the drawer.
function onChatStatusChanged(cfg){
  state.chatsOn = !!cfg;
  const bubble = document.getElementById('paBubble');
  if (bubble) bubble.classList.toggle('hidden', !cfg);
  if (state.doc) renderView();
}

/* Where a chat window sits and how big it is, remembered the same way the
   drawer's own width and the timeline's label column are — a drag he does
   once should not repeat itself. Every chat opens at the last rect saved. */
function loadChatRect(){
  try {
    const raw = localStorage.getItem('todo-board-chat-rect');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveChatRect(rect){
  try { localStorage.setItem('todo-board-chat-rect', JSON.stringify(rect)); } catch (e) {}
}

/* One AIChat instance per open chat, the way ai_canvas keeps one per card, so
   several can sit minimised or anchored along the bottom edge at once. The
   `hub` instance is never opened: it holds the status and the sessions index
   the drawer reads, and files and forgets sessions. Each chat window is its
   own instance in `chatWins`, found again by its session id, or by its owner
   key while it is a new chat not sent yet, and is taken down when it closes — unless a run is still
   going, in which case it stays hidden until the run ends, so closing a
   window never stops the work inside it. */
const chatWins = new Map();   // counter → { inst, newFor }
let chatWinSeq = 0;
let chatZ = 100;

function findChatWin(sessionId, ownerKey){
  for (const w of chatWins.values()) {
    const s = w.inst.session();
    if (sessionId ? s === sessionId : (!s && w.newFor === ownerKey)) return w.inst;
  }
  return null;
}

function focusChatWin(inst){
  for (const w of chatWins.values()) w.inst.setActive(w.inst === inst);
  inst.setZIndex(++chatZ);
}

function reapChatWins(){
  for (const [k, w] of chatWins) {
    const inst = w.inst;
    if (inst.isOpen() || inst.running()) continue;
    chatWins.delete(k);
    // After the event that closed it has finished, not inside it.
    setTimeout(() => inst.destroy(), 0);
  }
}

function makeChatWin(newFor){
  let inst;
  // Set when a message goes out on the PA's key and cleared once the run it
  // started has ended — see "The PA panel" below. Any window can be carrying
  // the PA's conversation, a `#!chat=` link to an old one included, so this
  // is kept per window rather than only on the one the bubble opened.
  let paWaiting = false;
  inst = AIChat.create({
    windowed: true,
    dockable: true,
    ownerLabel: chatOwnerLabel,
    readOnlyHelp: '',
    onSessionsChanged,
    onSend: p => {
      if (p.key === PA_KEY) { paWaiting = true; paBeforeSend(); }
      onPromptRunSend(p);
    },
    onChange: () => {
      if (paWaiting && !inst.running()) { paWaiting = false; paAfterReply(); }
      reapChatWins(); onChatChange();
    },
    onRectChange: saveChatRect,
    onFocus: () => focusChatWin(inst),
  });
  const saved = loadChatRect();
  if (saved) inst.setRect(saved);
  inst.loadStatus();
  chatWins.set(++chatWinSeq, { inst, newFor });
  return inst;
}

function openChatWin(ownerId, ownerKey, sessionId, seed, o){
  const found = findChatWin(sessionId, ownerKey);
  if (found && found.isOpen()) {
    // Asked for again: brought forward, and a bar opens up to its panel.
    if (found.dockState() === 'minimised') found.anchor();
    focusChatWin(found);
    return found;
  }
  const inst = found || makeChatWin(sessionId ? '' : ownerKey);
  if (sessionId) inst.openSession(ownerId, ownerKey, sessionId);
  else inst.openNew(ownerId, ownerKey, seed, o);
  focusChatWin(inst);
  return inst;
}

function chatOwnerLabel(taskId){
  if (taskId === PA_KEY) return 'The board · PA';
  const loc = state.doc && locate(taskId);
  return loc ? loc.task.title : '';
}

const hub = (typeof AIChat !== 'undefined') ? AIChat.create({
  windowed: true,
  ownerLabel: chatOwnerLabel,
  // Worth explaining once, on the button that starts a chat, not on every
  // task's Chats section — see the Ask Claude / New chat tooltips.
  readOnlyHelp: '',
  onSessionsChanged, onSend: onPromptRunSend, onChange: onChatChange, onStatusChanged: onChatStatusChanged,
}) : null;

const chat = hub ? {
  available: hub.available,
  home: hub.home,
  sessionsFor: hub.sessionsFor,
  newOwnerKey: hub.newOwnerKey,
  forget: hub.forget,
  loadSessions: hub.loadSessions,
  loadStatus: hub.loadStatus,
  openNew: (ownerId, ownerKey, seed, o) => { openChatWin(ownerId, ownerKey, '', seed, o); },
  openSession: (ownerId, ownerKey, sessionId) => { openChatWin(ownerId, ownerKey, sessionId, ''); },
  /* Open and not docked: the one in the way of the board. */
  isOpen: () => [...chatWins.values()].some(w => w.inst.isOpen() && w.inst.dockState() === 'none'),
  closeChat: () => { for (const w of chatWins.values()) if (w.inst.isOpen() && w.inst.dockState() === 'none') w.inst.closeChat(); },
} : {
  available: () => false,
  renderSection: () => '',
  newOwnerKey: () => '',
  openNew: () => {},
  openSession: () => {},
  forget: () => Promise.resolve(),
  loadSessions: () => Promise.resolve(),
  loadStatus: () => {},
  /* Both of these are the board's, not the module's: the listener below calls
     them on every click, and a board loaded without ai_chat_engine would throw
     on the first one otherwise. */
  isOpen: () => false,
  closeChat: () => {},
};

/* A board link posted in a chat opens its card in this tab. The href differs
   from this page only after the `#`, which is what the hashchange listener in
   25-archiving.js already wakes on and what parseHash() already reads — so the
   opening is done, and all that is left is getting the chat window out of the
   way of the drawer underneath it.

   On document rather than on the chat window, which the module owns and
   replaces. A link to another page, or to this one's `#board`, is left alone:
   only a fragment naming a card or a session is a reason to close. */
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || !chat.isOpen()) return;
  let url;
  try { url = new URL(a.getAttribute('href'), location.href); } catch (_) { return; }
  if (url.origin !== location.origin || url.pathname !== location.pathname) return;
  if (!/!(task|chat)=/.test(url.hash)) return;
  chat.closeChat();
});

function claudeOn(){ return chat.available() && !state.locked; }

/* ---- The PA panel ----
   A chat about the whole list, owned by the board rather than by a card. See
   IMPROVEMENTS.md, "There is no way to talk to the PA while the board is in
   front of you." Its one fixed key is both the owner id and the owner key the
   sessions index files it under, so every path that turns an owner into a
   task (locate(), tasksByChatKey(), chatKeyFor()) simply finds none, and
   chatOwnerLabel() names it instead. It is never written onto a task line:
   no `chat:` tag, nothing marked dirty by opening it.

   No lock comes with it. `pa` writes todo.md while this tab autosaves the
   same file, so the two take turns: before a message goes out, anything
   unsaved here is saved; once the reply has landed, todo.md is read back
   from disk if it moved, through reload() — the same path the Reload button
   and a save refused with a 409 take — so a `pa` write is never saved over.
   The server's If-Match check on every PUT covers an edit made here while
   the reply is still coming. */
const PA_KEY = 'board-pa';
let paSaving = Promise.resolve();

function paPreface(ask){
  const ds = state.dataset || '';
  return '/pa ' + ask + '\n\n' +
    '(Sent from the to-do board\'s PA chat, a conversation about the whole list rather than one task. ' +
    'The list on screen is ' + (ds ? 'data/' + ds + '/todo.md, the dataset data/.current names' : 'the one data/.current names') +
    '. The board saved its unsaved changes before this message and reloads todo.md from disk once you reply.)';
}

function openPaChat(){
  if (!chat.available() || state.locked) return null;
  for (const w of chatWins.values()) {
    const inst = w.inst;
    if (!inst.isOpen() || w.newFor !== PA_KEY) continue;
    if (inst.dockState() !== 'anchored') inst.anchor();
    focusChatWin(inst);
    return inst;
  }
  const inst = makeChatWin(PA_KEY);
  inst.openNew(PA_KEY, PA_KEY, '', { preface: paPreface });
  inst.anchor();
  focusChatWin(inst);
  return inst;
}

function paBeforeSend(){
  if (state.locked || !state.doc || !state.dirty) return;
  paSaving = saveFile(true).catch(() => {});
}

async function paAfterReply(){
  await paSaving;
  if (state.locked || !state.doc || modalEl) return;
  const { stamp, hash } = await diskVersion();
  if (!stamp) return;
  const moved = (hash && state.diskHash) ? hash !== state.diskHash : stamp !== state.diskStamp;
  if (!moved) return;
  const quiet = !hasOwnChanges();
  if (quiet) closeDrawer();                        // ids are rebuilt by the parse
  await reload();
  if (quiet) autoStatus('reloaded — the PA changed todo.md');
}

(() => {
  const bubble = document.getElementById('paBubble');
  if (bubble) bubble.addEventListener('click', () => openPaChat());
})();

/* A top-level task by its exact title — the only thing durable enough to
   name a task from outside todo.md, since t.id is 'a counter reset on every
   load and would not survive a task moving between two loads. Used by
   drainAttachQueue() below: /pa-attach can only tell the board which task by
   what it saw when it ran, and by the time the board next loads, that is
   what it still has to go on. */
function findTaskByTitle(title){
  if (!title || !state.doc) return null;
  for (const b of state.doc.buckets) for (const ti of b.tiers) for (const t of ti.tasks) {
    if (t.title === title) return t;
  }
  return null;
}

/* What /pa-attach, or a session picked up from a terminal while the board
   was closed, left in data/<dataset>/attach-queue.json — see
   attach_queue_path() in server.py for why the skill cannot write this
   itself. Called only from loadFile(), after state.locked is confirmed
   false: this mints a `chat:` key through the ordinary edit path for any
   task that needs one, which is a write to todo.md and must never run on a
   demo, a backup preview, or a locked tab.

   An entry whose task cannot be found by title — renamed or deleted since
   the skill ran — is written back rather than dropped, so nothing queued is
   silently lost; it simply waits for the next load, in case the rename gets
   undone or was itself a mistake. */
async function drainAttachQueue(){
  if (!chat.available()) return;
  let items;
  try {
    items = await getJSON('/attach-queue.json');
  } catch (err) { return; }
  if (!Array.isArray(items) || !items.length) return;

  const left = [];
  let filed = 0;
  for (const item of items) {
    const task = item && findTaskByTitle(item.title);
    if (!task || !item.session || !item.cwd) { left.push(item); continue; }
    const key = chatKeyFor(task, true);
    try {
      await postJSON('/claude/attach', { owner: key, session: item.session, cwd: item.cwd, title: item.title || '' });
      filed++;
    } catch (err) { left.push(item); }
  }
  if (!filed) return;

  await postJSON('/attach-queue.json', left).catch(() => {});
  await chat.loadSessions();
  $('#status').textContent = filed + ' conversation' + (filed === 1 ? '' : 's') +
    ' attached from ' + (filed === 1 ? 'the terminal' : 'terminal sessions') + ' — save to apply';
}

/* What an agent asks of a sub-task, applied through the board's own edit path.
   An agent never writes todo.md, so when it finishes it leaves "tick sub-task
   <id>" in data/<dataset>/tick-queue.json (core/tick_queue.py) and this reads
   the file on every load.

   Three rules decide what happens to each request. It is applied only when it
   comes from the agent the sub-task is assigned to (`[to::]`), so no agent can
   tick a review and approve its own work; a request from anyone else is refused
   and cleared, since waiting would not change the answer. A sub-task still
   waiting on an unfinished blocker is refused the same way, and one already
   ticked is cleared without a word. And the Implement agent's tick is the one
   that moves the card, to Reviewing: a ticked Plan leaves it in Doing, because
   the work has only started.

   A request whose sub-task is not in this list is left where it is rather than
   dropped, the way attach-queue.json leaves a title that has been renamed. What
   was dealt with is removed by id, so a request that arrived while this ran is
   not written over. */
async function drainTickQueue(){
  if (state.locked || !state.doc) return;
  let items;
  try {
    items = await getJSON('/tick-queue.json');
  } catch (err) { return; }
  if (!Array.isArray(items) || !items.length) return;

  const dealt = [];
  let ticked = 0, refused = 0, moved = 0;
  for (const it of items) {
    if (!it || !it.id) continue;
    const found = locateSub(String(it.sub || '').trim().toLowerCase());
    if (!found) continue;
    const { loc, step } = found;
    const t = loc.task;
    const f = readSub(t, step.line);
    const who = agentOf(it.by);
    if (!f || f.done) { dealt.push(it.id); continue; }
    if (!who || agentOf(f.to) !== who ||
        blockedMessage(allItems(), (f.blockedBy || []).concat(t.blockedBy || []))) {
      dealt.push(it.id); refused++; continue;
    }
    f.done = true; f.doneOn = ymd(today()); f.doing = false;
    writeSub(t, step.line, f);
    ticked++;
    /* A plan that has been written says where, on the review waiting behind it,
       so opening that review can read it: a `Plan:` note, like `Project:`. */
    const rel = String(it.plan || '').trim();
    if (rel && /^[\w./-]+\.md$/.test(rel) && f.slug) {
      const rv = subSteps(t).find(x => (x.blockedBy || []).indexOf(f.slug) > -1);
      if (rv) {
        const now = stepNoteText(t, rv.line).split('\n').filter(l => !/^- Plan:/i.test(l));
        setStepNoteText(t, rv.line, now.concat('- Plan: plans/' + rel).filter(Boolean).join('\n'));
      }
    }
    dealt.push(it.id);
    if (who === 'Implement agent' && !t.done) {
      const cur = locate(t.id);
      if (cur && cur.tier.name !== WAIT_COL && cur.tier.name !== DONE_COL) {
        cur.tier.tasks.splice(cur.index, 1);
        ensureTier(cur.bucket, WAIT_COL).tasks.unshift(t);
        moved++;
      }
    }
  }
  if (!dealt.length) return;
  if (ticked) { markDirty(); refreshView(); }
  await postJSON('/tick-queue.json', { done: dealt }).catch(() => {});
  if (ticked || refused) {
    $('#status').textContent = (ticked
      ? 'agents ticked ' + ticked + ' sub-task' + (ticked === 1 ? '' : 's') +
        (moved ? ', ' + moved + ' card' + (moved === 1 ? '' : 's') + ' into ' + WAIT_COL : '') + ' — save to apply'
      : '') + (refused ? (ticked ? '; ' : '') + refused + ' request' + (refused === 1 ? '' : 's') + ' refused' : '');
  }
}

/* The task's key, writing one onto the line if this is the first chat on it.
   That marks the list dirty, which is right — a task that has conversations
   under it is a task whose line has changed. */
function chatKeyFor(t, make){
  if (t.chat) return t.chat;
  if (!make) return '';
  t.chat = chat.newOwnerKey();
  t.dirty = true;
  markDirty();
  return t.chat;
}

/* The task's Chats field, drawn with cvCardHTML — a stack of conversation
   cards under the task they belong to. Wired below in handleAsk. The package's own
   list section, renderSection, went with its rewrite in React, and this
   host had stopped calling it long before. A rule ahead of it marks it as its own section rather than one more
   field, the same as the two suggestion lists below it — but only when
   there is something to show: with no chat engine at all, chat.available()
   is false and a bare rule with nothing under it would be a dead end. */
function chatSection(t){
  if (!chat.available()) return '';
  const key = t.chat || '';
  // state.chats rather than chat.sessionsFor(): the board's own cached copy
  // of the sessions index, kept current by onSessionsChanged — sessionsFor()
  // answers from the chat window's own index, which only fills in once loadSessions()
  // has actually run.
  const rows = (key && state.chats[key] || [])
    .slice().sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  const cards = rows.map(row => cvCardHTML(row, key, t.title)).join('');
  const body =
    '<div class="cvstack">' +
      (cards || emptyState('No conversations yet. Start one below, or attach one '
                         + 'that began in the terminal.')) + '</div>' +
    '<div class="aic-actions">' +
      '<button type="button" class="aic-addsub" data-owner="' + esc(t.id) + '">+ New chat</button>' +
      '<button type="button" class="aic-addsub aic-attach" data-owner="' + esc(t.id) +
        '">Attach a session…</button>' +
    '</div>';
  // The cards inside are the shared package's and stay that way; the heading
  // around them is the drawer's, drawn by sideSection() the same as every
  // other section in that column — it used to come from chat.css instead and
  // was a size down and a shade fainter than its neighbours for no reason
  // anyone had chosen.
  return sideSection('AI processes', 'chats', body, rows.length);
}

/* ---- Attaching a session that started elsewhere ----
   The other half of "attaching a session that started in the
   terminal": /pa-attach handles the case where you are already in the
   conversation; this is the case where you are already looking at the task
   instead, and want to reach for a conversation Claude Code has on disk but
   this board has never filed.

   No queue needed here — unlike /pa-attach, which cannot touch todo.md at
   all, this runs inside the board that is the one thing allowed to write it,
   so chatKeyFor() mints the key and /claude/attach files the session in the
   same click. */
async function openAttachPicker(taskId){
  const loc = locate(taskId);
  if (!loc || !claudeOn()) return;
  const overlay = document.createElement('div');
  overlay.className = 'attachpick-wrap';
  overlay.innerHTML = '<div class="attachpick" role="dialog" aria-label="Attach a session">' +
    '<header>Attach a session' +
      '<button type="button" class="attachpick-close" aria-label="Close">×</button>' +
    '</header>' +
    '<div class="attachpick-search-wrap">' +
      '<input type="search" class="attachpick-search" placeholder="Search sessions…" aria-label="Search sessions">' +
    '</div>' +
    '<div class="attachpick-body"><p class="aic-none">Loading…</p></div>' +
  '</div>';
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector('.attachpick-close').onclick = close;

  const body = overlay.querySelector('.attachpick-body');
  const searchBox = overlay.querySelector('.attachpick-search');

  const render = (sessions, term) => {
    if (!overlay.isConnected) return;   // closed while the list was loading
    if (!sessions.length) {
      body.innerHTML = '<p class="aic-none">' +
        (term ? 'Nothing matches that.' : 'Nothing on disk that isn’t filed against a task already.') +
        '</p>';
      return;
    }
    body.innerHTML = sessions.map(s =>
      '<button type="button" class="attachpick-row" data-session="' + esc(s.id) + '"' +
        ' data-cwd="' + esc(s.cwd) + '" data-title="' + esc(s.title || '') + '">' +
        '<span class="attachpick-title">' + esc(s.title || 'Untitled conversation') + '</span>' +
        '<span class="attachpick-meta">' + esc(cvWhen(s.updated)) + ' · ' + esc(s.cwd) + '</span>' +
      '</button>'
    ).join('');
    body.querySelectorAll('.attachpick-row').forEach(row => {
      row.onclick = async () => {
        body.querySelectorAll('.attachpick-row').forEach(r => r.disabled = true);
        const key = chatKeyFor(loc.task, true);
        try {
          await postJSON('/claude/attach', {
            owner: key, session: row.dataset.session,
            cwd: row.dataset.cwd, title: row.dataset.title
          });
        } catch (err) { /* nothing to do — the drawer just won't show it */ }
        close();
        await chat.loadSessions();
        refreshView();
        openDrawer(taskId);
      };
    });
  };

  const load = async term => {
    let sessions = [];
    try {
      const q = term ? '?q=' + encodeURIComponent(term) : '';
      sessions = (await getJSON('/claude/attachable.json' + q)).sessions || [];
    } catch (err) { sessions = []; }
    render(sessions, term);
  };

  // Debounced rather than one request per keystroke — the filter runs
  // server-side, over every session on disk, not just the ones on screen.
  let debounceTimer = null;
  searchBox.oninput = () => {
    clearTimeout(debounceTimer);
    const term = searchBox.value.trim();
    debounceTimer = setTimeout(() => load(term), 200);
  };

  await load('');
  if (overlay.isConnected) searchBox.focus();
}

/* A prompt written on the task starts its own conversation, seeded with the
   prompt but not sent — most of them still have a [path] to fill in, and one
   that fired on click would send the placeholder.

   raw is the exact markdown line the prompt came from, the same text a
   manual Dismiss would remove. Opening the modal does not touch it — see "A
   prompt is used up by being run" — it only marks this as
   the run to watch for: if the first message actually sent on this owner
   key matches, onSend above deletes the line, and onSessionsChanged records
   the prompt against whatever session id that send turns out to create. */
function askFromPrompt(taskId, text, raw){
  const loc = locate(taskId);
  if (!loc) return;
  const key = chatKeyFor(loc.task, true);
  state.pendingPromptRun = raw ? { key, raw } : null;
  refreshView();
  chat.openNew(taskId, key, text);
}

// The task's own title and description, so a fresh chat opens with something
// to work from rather than a blank box — seeded the same unsent way
// askFromPrompt() seeds an authored prompt.
/* The same identity pick.key_of() uses on the Python side: the task's own id,
   falling back to its title for a list from before ids existed. Kept as one
   line here rather than imported, the same as every other small piece of
   format knowledge this file already carries its own copy of. */
function briefKeyFor(t){
  return t.stableId || t.title;
}

/* A cached briefing, written by agents/plan-agent/brief.py — direction,
   what's done, what's still needed — read exactly as cached, never
   re-validated here. Empty for a task never briefed yet. */
function taskBriefing(t){
  return (state.briefings[briefKeyFor(t)] || {}).text || '';
}

function taskDescription(t){
  const briefing = taskBriefing(t);
  if (briefing) return t.title + '\n\n' + briefing;
  const notes = dedent(bodyParts(t).notes);
  return notes ? t.title + '\n\n' + notes : t.title;
}

function newChat(taskId){
  const loc = locate(taskId);
  if (!loc) return;
  const key = chatKeyFor(loc.task, true);
  // Not seeded from a suggestion, so nothing here is "a prompt run" — a
  // stale pending one from a modal opened and abandoned must not have its
  // line deleted by a send that has nothing to do with it.
  state.pendingPromptRun = null;
  refreshView();
  chat.openNew(taskId, key, taskDescription(loc.task));
}

/* The list on a task and the prompt's "Ask Claude" button both land here,
   sharing the listener the drawer and board already use for everything else.
   The card itself — .cvbody to open, .cvclose to take it off the board — is
   drawn by cvCardHTML() in 11-chat-cards.js and wired only from here; there
   was a canvas wiring the same markup a second way until 12 Sep 2026. */
function handleAsk(e){
  const ask = e.target.closest('.askclaude');
  if (ask) { askFromPrompt(ask.dataset.task, ask.dataset.ask || '', ask.dataset.raw || ''); return; }
  const body = e.target.closest('.cvbody');
  if (body) { openCard(body); return; }
  const close = e.target.closest('.cvclose');
  if (close) { closeCard(close.dataset.owner, close.dataset.session); return; }
  const fresh = e.target.closest('.aic-addsub');
  if (fresh && !fresh.classList.contains('aic-attach')) { newChat(fresh.dataset.owner); return; }
  const attach = e.target.closest('.aic-attach');
  if (attach) openAttachPicker(attach.dataset.owner);
}



