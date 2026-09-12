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
        due: t.due, start: t.start, ai: t.ai, impact: t.impact, effort: t.effort,
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
          ai: s.ai || t.ai, impact: '', effort: '',
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

function refTags(it){
  let out = '';
  /* First, because on a recurring task how often it comes round is what frames
     every other tag on the card: the deadline is the next occurrence. */
  if (it.repeat) out += '<span class="tag repeat" title="Recurring ' +
    esc(it.repeat.label) + '">' + esc(it.repeat.label) + '</span>';
  const si = startInfo(it.start);
  if (si) out += '<span class="tag startdate">' + esc(si.label) + ' · ' + esc(si.note) + '</span>';
  const di = dueInfo(it.due, it.tier === WAIT_COL);
  if (di) out += '<span class="tag due ' + di.cls + '">' + esc(di.label) + (di.note ? ' · ' + esc(di.note) : '') + '</span>';
  if (it.urgent) out += '<span class="tag urgent">urgent</span>';
  if (it.impact) out += '<span class="tag impact-' + esc(it.impact) + '" title="' + esc(it.impact) + ' impact">' + (IMPACT_EMOJI[it.impact] || esc(it.impact)) + '</span>';
  if (it.effort) out += '<span class="tag">' + esc(it.effort) + '</span>';
  if (it.ai && it.ai !== 'none') out += '<span class="tag ai ai-' + esc(it.ai) + '" title="' + esc(it.ai) + ' AI help">ai</span>';
  return out;
}

/* These sections are the only place the five views exist now, so a card has to
   be somewhere he can work rather than just read: tick it here, open it here,
   drop it out of the week here. The tick writes to the task or the sub-step,
   whichever the card was built from, so the board and the file agree instantly.

   opts.message / opts.prompt say whether to include the body text. */
function refCard(it, opts){
  opts = opts || {};
  /* This card is a copy shown away from its own column, so the column itself —
     what the board would otherwise say just by where the card sits — has to
     be spelled out here instead. Same "bucket · tier" order the matrix hover
     preview already uses, so the two read as the same fact. */
  const where = [it.bucket, it.parent, it.done ? DONE_COL : it.tier].filter(Boolean).map(esc).join(' · ');
  const target = it.sub ? ' data-sub="' + it.sub.line + '"' : '';
  let body = '';
  if (opts.message && it.message) {
    body += messageHTML(it.message, { draft: it.draft });
  }
  /* Switching a task to ai:full puts it here straight away, but the prompt is
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

  return '<article class="ref' + (it.done ? ' done' : '') + '" style="--bc:' + it.color + '">' +
    '<div class="refhead">' +
      '<button class="refbox" data-tick="' + it.id + '"' + target +
        ' role="checkbox" aria-checked="' + it.done + '"' +
        ' title="' + (it.done ? 'Mark as not done' : 'Mark as done') + '">' + (it.done ? '✓' : '') + '</button>' +
      '<button class="reftitle" data-open="' + it.id + '" title="Open this task">' + mdInline(it.title) + '</button>' +
      (opts.unweek
        ? '<button class="refdrop" data-unweek="' + it.id + '"' + target + ' title="Take this out of the week">Not this week</button>'
        : '') +
      (opts.quickDismiss
        ? '<button class="refdrop" data-quickdismiss="' + esc(quickKey(it)) + '" ' +
          'title="Dismiss this suggestion. Nothing about the task changes — it just stops showing here until you bring it back.">Dismiss</button>'
        : '') +
    '</div>' +
    '<div class="refwhere">' + where + '</div>' +
    (refTags(it) ? '<div class="meta">' + refTags(it) + '</div>' : '') +
    body +
  '</article>';
}

function refGroup(label, cards){
  if (!cards.length) return '';
  return '<h4 class="refgroup">' + esc(label) + '</h4>' + cards.join('');
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
function moreNote(hidden){
  return hidden ? '<p class="refmore">+' + hidden + ' more not shown here — open the board to see the rest.</p>' : '';
}

/* ---- The five sections, each built from its tag ---- */

function weekSection(items){
  const live = items.filter(i => i.week).sort(byDue);
  if (!live.length) return { html: '<p class="empty">Nothing is tagged <code>week</code> yet.</p>', n: 0 };
  const m = live.filter(i => i.effort === 'M' && !i.done).length;
  const warn = m > 2
    ? '<p class="refwarn">' + m + ' M-effort items this week. The ceiling is two once meetings are counted.</p>'
    : '';
  const { shown, hidden } = capCards(live);
  return { html: warn + shown.map(i => refCard(i, { unweek:true })).join('') + moreNote(hidden), n: live.length };
}

/* A quick win has to be something he can act on right now. Anything still
   waiting on an unfinished blocker is not a win, it is a reminder that he cannot
   start — so it is left out. The count of what was held back is shown, because
   a section that quietly shrinks looks like a section with nothing in it.

   Anything tagged ai:full is left out too. Delegate to Claude already lists
   every one of them, ranked, and the two columns sit side by side on Overview —
   the same card in both reads as two jobs when it is one. Quick wins is what is
   left for him to do himself.

   Backlog is left out entirely, the same call the matrix makes with HELD_TIER —
   it has been parked on purpose, so however small it is, it is not a real
   priority and not something to surface here.

   What is left is ordered by byPriority, the dependency chain's own
   assessment: a two-minute message that happens to unblock a big rock outranks
   one that unblocks nothing, the same way the chain ranks a blocked card by
   what is riding on it rather than its own score alone. */
function quickSection(items){
  // ai:full belongs to Delegate to Claude, and Backlog is not a real priority —
  // neither belongs here.
  const open = items.filter(i => !i.done && i.ai !== 'full' && i.tier !== HELD_TIER);
  // Two separate reasons something is not a quick win yet: it waits on another
  // task, or its start date has not arrived. Neither is about the deadline —
  // an overdue task is the most actionable thing on the list, not the least.
  const live = byPriority(items, open.filter(i => actionable(items, i) && !notYet(i.start))).order;
  const heldByDep = open.filter(i => !actionable(items, i)).length;
  const heldByDate = open.filter(i => actionable(items, i) && notYet(i.start)).length;
  const heldByBacklog = items.filter(i => !i.done && i.ai !== 'full' && i.tier === HELD_TIER).length;
  const isS = i => i.sub === null && i.effort === 'S';
  const seen = new Set();
  const take = arr => arr.filter(i => { const k = i.id + '|' + i.title; if (seen.has(k)) return false; seen.add(k); return true; });

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
  const preDecide   = take(live.filter(i => isS(i) && i.ai === 'partial'));
  const preTalk     = take(live.filter(i => isS(i) && i.ai === 'none'));

  /* Dismissed here, not filtered out of `open` above: a dismissal is a
     preference about this list, not a fact about the task, so it must not
     touch heldByDep/heldByDate/heldByBacklog, which describe the task itself. */
  const dismissed = quickDismissedSet();
  const notDismissed = i => !dismissed.has(quickKey(i));
  const meetings = preMeetings.filter(notDismissed);
  const messages = preMessages.filter(notDismissed);
  const decide   = preDecide.filter(notDismissed);
  const talk     = preTalk.filter(notDismissed);
  const dismissedShown = (preMeetings.length - meetings.length) + (preMessages.length - messages.length) +
    (preDecide.length - decide.length) + (preTalk.length - talk.length);

  const reasons = [];
  if (heldByDep)  reasons.push('<strong>' + heldByDep + '</strong> waiting on another task');
  if (heldByDate) reasons.push('<strong>' + heldByDate + '</strong> not startable yet');
  if (heldByBacklog) reasons.push('<strong>' + heldByBacklog + '</strong> parked in ' + esc(HELD_TIER));
  const note = reasons.length
    ? '<p class="refheld">Left out: ' + reasons.join(' · ') + '.</p>'
    : '';

  const capped = capGroups([meetings, messages, decide, talk]);
  const [sMeetings, sMessages, sDecide, sTalk] = capped.shown;

  const out =
    refGroup('Costs one paste, before the meeting', sMeetings.map(i => refCard(i, { agenda:true, quickDismiss:true }))) +
    refGroup('Costs one message, already written', sMessages.map(i => refCard(i, { message:true, quickDismiss:true }))) +
    refGroup('Costs one decision', sDecide.map(i => refCard(i, { quickDismiss:true }))) +
    refGroup('Costs one conversation', sTalk.map(i => refCard(i, { quickDismiss:true })));
  const dismissedNote = dismissedShown
    ? '<p class="refmore">' + dismissedShown + ' dismissed. ' +
      '<button type="button" class="reflink" data-quickrestore>Show them again</button></p>'
    : '';
  /* The count in the head is what is actually in the column — after the
     dismissals, before the cap, since a card hidden by the cap is still one of
     them and says so in its own "more" line. */
  const n = meetings.length + messages.length + decide.length + talk.length;
  return {
    html: out
      ? note + out + moreNote(capped.hidden) + dismissedNote
      : note + dismissedNote + '<p class="empty">Nothing small enough to clear in a gap.</p>',
    n
  };
}

function bigRocksSection(items){
  const rocks = items.filter(i => i.sub === null && i.impact === 'high' && i.effort === 'L' && !i.done);
  if (!rocks.length) return { html: '<p class="empty">No high impact, L effort tasks.</p>', n: 0 };
  const { shown, hidden } = capCards(rocks);
  return { html: shown.map(i => refCard(i)).join('') + moreNote(hidden), n: rocks.length };
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
  if (!blocked.length) return { html: '<p class="empty">Nothing carries a <code>blocked-by:</code> tag.</p>', n: 0 };

  const { order, weight } = byPriority(items, blocked);

  const html = order.map(i => {
    const deps = i.blockedBy.map(slug => {
      const src = itemBySlug(items, slug);
      const card = src ? chainCard(src, { dep:true }) : chainMissing(slug);
      return '<div class="chaindep">' + card + '<span class="chainarrow" aria-hidden="true">→</span></div>';
    }).join('');
    return '<div class="chainitem">' +
      '<div class="chainrow">' +
        '<div class="chainfrom">' + deps + '</div>' +
        chainCard(i, { target:true }) +
      '</div>' +
      (weight.get(i) > itemImpact(i)
        ? '<div class="chainholds">Holds up higher impact work</div>' : '') +
    '</div>';
  }).join('');
  return { html, n: blocked.length };
}

/* One mini ticket in the chain — a blocker (dashed, dep:true) or the card
   waiting on it (target:true). Both open the full task on click. */
function chainCard(it, opts){
  opts = opts || {};
  const cls = 'chaincard' + (opts.dep ? ' dep' : '') + (opts.target ? ' target' : '') + (it.done ? ' done' : '');
  return '<div class="' + cls + '" style="--bc:' + it.color + '" data-open="' + it.id + '" title="Open this task">' +
    '<span class="chaintitle">' + mdInline(it.title) + (it.done ? ' ✓' : '') + '</span>' +
    '<div class="chainwhere">' + esc([it.bucket, it.done ? DONE_COL : it.tier].filter(Boolean).join(' · ')) + '</div>' +
  '</div>';
}

function chainMissing(slug){
  return '<div class="chaincard dep missing" title="No task carries this slug">' +
    '<span class="chaintitle">#' + esc(slug) + ' missing</span>' +
  '</div>';
}

/* Only ai:full work belongs here, and the ai: tag is the gate rather than the
   rank. A rank left behind on something he has taken back off Claude must not
   keep it in the list, otherwise the section quietly recommends delegating work
   he has already decided is his. */
function delegateSection(items){
  const ranked = items.filter(i => i.ai === 'full' && !i.done && i.rank != null)
                      .sort((a, b) => a.rank - b.rank);
  const unranked = items.filter(i => i.ai === 'full' && !i.done && i.rank == null);
  if (!ranked.length && !unranked.length) return { html: '<p class="empty">Nothing is tagged <code>ai:full</code>.</p>', n: 0 };

  const capped = capGroups([ranked, unranked]);
  const [sRanked, sUnranked] = capped.shown;

  /* The number is the grip. It is already the one part of the row that stands
     for the order, so nothing here needs a second handle beside it — and only
     the ranked rows get one, since dragging an unranked card would be giving
     it a rank rather than changing one. */
  let html = sRanked.map(i =>
    '<div class="refrow" data-rank="' + esc(quickKey(i)) + '">' +
      '<span class="refnum"' +
        (state.locked ? '' : ' draggable="true" title="Drag to reorder the queue"') + '>' +
        i.rank + '</span>' +
      refCard(i, { prompt:true }) +
    '</div>'
  ).join('');
  if (html) html = '<div class="refrank">' + html + '</div>';
  if (sUnranked.length) {
    html += refGroup('Not ranked yet', sUnranked.map(i => refCard(i, { prompt:true })));
  }
  return { html: html + moreNote(capped.hidden), n: ranked.length + unranked.length };
}

/* Dragging a row's number rewrites `rank:` across every `ai:full` task in the
   file, dense 1..n in the new order. Two things make a whole-queue renumber the
   right shape rather than swapping the dragged row with its neighbour, the way
   the timeline's `tlrank` drag can afford to: `rank` is global across the file
   where `tlrank` is scoped to one bucket lane, and the numbers on this list
   drift on their own — a rank stays on the line when a task is ticked off or
   taken back off Claude, so the list already reads 1..9, 11, 12, and nothing
   stops two tasks sharing a number, which leaves their order against each other
   to whatever the sort happens to do. A dense pass on every write is what makes
   the number on screen mean the position in the queue. It costs nothing: the
   board writes the whole document on save regardless of how many lines moved.

   The rows on screen are not the whole queue — Overview caps the column at
   OV_CARD_LIMIT and the bucket tabs narrow it further — so the drop is read as
   the one thing it actually states, which card the dragged one now sits above.
   See applyDelegateOrder below for what that does to the tasks it cannot see. */
let delegateDragKey = null;
function delegateRows(zone){
  return Array.from(zone.querySelectorAll(':scope > .refrow[data-rank]'));
}
function delegateInsertAfterEl(zone, clientY, skipKey){
  let after = null;
  delegateRows(zone).forEach(el => {
    if (el.dataset.rank === skipKey) return;
    const r = el.getBoundingClientRect();
    if (clientY > r.top + r.height / 2) after = el;
  });
  return after;
}
function wireDelegateReorder(){
  if (state.locked) return;
  $('#lists').querySelectorAll('.refrank').forEach(zone => {
    zone.querySelectorAll('.refnum[draggable]').forEach(num => {
      const row = num.closest('.refrow');
      num.ondragstart = e => {
        delegateDragKey = row.dataset.rank;
        row.classList.add('dragging');
        e.dataTransfer.setData('text/plain', delegateDragKey);
        e.dataTransfer.effectAllowed = 'move';
      };
      num.ondragend = () => {
        row.classList.remove('dragging');
        delegateDragKey = null;
        hideDropLine();
      };
    });
    zone.ondragover = e => {
      if (!delegateDragKey) return;
      e.preventDefault();
      if (!dropLine) { dropLine = document.createElement('div'); dropLine.className = 'dropline'; }
      const after = delegateInsertAfterEl(zone, e.clientY, delegateDragKey);
      if (after) after.after(dropLine); else zone.prepend(dropLine);
    };
    zone.ondragleave = e => { if (!zone.contains(e.relatedTarget)) hideDropLine(); };
    zone.ondrop = e => {
      if (!delegateDragKey) return;
      e.preventDefault();
      const after = delegateInsertAfterEl(zone, e.clientY, delegateDragKey);
      const before = delegateRows(zone).map(el => el.dataset.rank);
      const shown = before.slice();
      shown.splice(shown.indexOf(delegateDragKey), 1);
      const at = after ? shown.indexOf(after.dataset.rank) + 1 : 0;
      shown.splice(at, 0, delegateDragKey);
      const key = delegateDragKey;
      hideDropLine();
      delegateDragKey = null;
      if (shown.join() === before.join()) return;        // dropped back where it started
      applyDelegateOrder(key, shown);
    };
  });
}

/* The visible order the drop produced, folded back into the whole `ai:full`
   queue and written out dense 1..n. The dragged card goes immediately above the
   next card that was on screen with it, or below the last one if it was dropped
   at the foot — either way it lands where the drop said it should, and every
   task the cap or the bucket tabs kept off screen holds the order it already
   had rather than being shuffled by a drag that never saw it. */
function applyDelegateOrder(key, shown){
  const queue = allItems().filter(i => i.ai === 'full' && !i.done && i.rank != null)
                          .sort((a, b) => a.rank - b.rank);
  const byKey = new Map(queue.map(i => [quickKey(i), i]));
  const moved = byKey.get(key);
  if (!moved) return;
  const at = shown.indexOf(key);
  const next = shown.slice(at + 1).find(k => byKey.has(k));
  const prev = shown.slice(0, at).reverse().find(k => byKey.has(k));
  const order = queue.filter(i => i !== moved);
  const to = next ? order.indexOf(byKey.get(next))
           : prev ? order.indexOf(byKey.get(prev)) + 1
           : order.length;
  order.splice(to, 0, moved);
  order.forEach((it, n) => setRank(it, n + 1));
  markDirty();
  refreshView();
}

/* One `rank:`, written where that item's rank actually lives. A task carries it
   as a parsed field and the serialiser puts it back; a sub-step has no
   serialiser — its line is part of the parent's body, written back verbatim —
   so the tag has to be edited in the raw text, the same way toggleSub edits the
   tick. No branch that adds a missing tag, because only items that already
   parsed a rank reach here. */
function setRank(it, n){
  if (!it.sub) { it.task.rank = n; it.task.dirty = true; return; }
  const m = SUB_RE.exec(it.task.body[it.sub.line]);
  if (!m) return;
  it.task.body[it.sub.line] =
    m[1] + '- [' + m[2] + '] ' + m[3].replace(/`rank:\d+`/, '`rank:' + n + '`');
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
// folder is missing — a checkout of this repo on its own, or the board served
// statically — /ai-chat/chat.js 404s and AIChat is never defined. Falling
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
  if (state.doc) renderView();
}

const chat = (typeof AIChat !== 'undefined') ? AIChat.create({
  ownerLabel: taskId => { const loc = locate(taskId); return loc ? loc.task.title : ''; },
  // Worth explaining once, on the button that starts a chat, not on every
  // task's Chats section — see the Ask Claude / New chat tooltips.
  readOnlyHelp: '',
  onSessionsChanged, onSend: onPromptRunSend, onChange: onChatChange, onStatusChanged: onChatStatusChanged,
}) : {
  available: () => false,
  renderSection: () => '',
  newOwnerKey: () => '',
  openNew: () => {},
  openSession: () => {},
  forget: () => Promise.resolve(),
  loadSessions: () => Promise.resolve(),
  loadStatus: () => {},
};

function claudeOn(){ return chat.available() && !state.locked; }

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
   cards under the task they belong to. Wired below in handleAsk rather than in
   chat.js's own renderSection, which this host no longer
   calls. A rule ahead of it marks it as its own section rather than one more
   field, the same as the two suggestion lists below it — but only when
   there is something to show: with no chat engine at all, chat.available()
   is false and a bare rule with nothing under it would be a dead end. */
function chatSection(t){
  if (!chat.available()) return '';
  const key = t.chat || '';
  // state.chats rather than chat.sessionsFor(): the board's own cached copy
  // of the sessions index, kept current by onSessionsChanged — sessionsFor()
  // answers from chat.js's own index, which only fills in once loadSessions()
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
    '<div class="attachpick-body"><p class="aic-none">Loading…</p></div>' +
  '</div>';
  document.body.appendChild(overlay);
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.onclick = e => { if (e.target === overlay) close(); };
  overlay.querySelector('.attachpick-close').onclick = close;

  let sessions = [];
  try {
    sessions = (await getJSON('/claude/attachable.json')).sessions || [];
  } catch (err) { sessions = []; }
  if (!overlay.isConnected) return;   // closed while the list was loading

  const body = overlay.querySelector('.attachpick-body');
  if (!sessions.length) {
    body.innerHTML = '<p class="aic-none">Nothing on disk that isn’t filed against a task already.</p>';
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
function taskDescription(t){
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



