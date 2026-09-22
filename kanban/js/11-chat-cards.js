
'use strict';

/* =========================================================================
   Conversations with Claude, as cards, plus the reference sections that sit
   under a task in the drawer — Jira notes, agendas, messages, context.

   There was a canvas view over these cards until 12 Sep 2026: one box per
   task, cards dragged between boxes to re-file them, positions kept in
   canvas.json. It is gone, and what it shared with the drawer is what is left
   here. A card is now only ever drawn stacked in a task's Chats field, so it
   has no grip to drag by and no box to land in, and re-filing a conversation
   is the attach picker's job rather than a gesture.
   ========================================================================= */

/* Every task on the list that carries a chat key, by key. Rebuilt per draw
   rather than cached: a task can gain a key at any point, and a stale map is
   how a card ends up under the wrong task. */
function tasksByChatKey(){
  const map = {};
  if (!state.doc) return map;
  state.doc.buckets.forEach(b => b.tiers.forEach(ti => ti.tasks.forEach(t => {
    if (t.chat) map[t.chat] = t;
  })));
  return map;
}

/* ---- What has been opened ----
   Read once on load, written back debounced, to data/<dataset>/chat-viewed.json.
   Opening a card is what "read" means — the board has no live process to ask,
   so the unread dot is only ever a comparison against when the card was last
   opened, not something a running session reports on its own. */
async function loadChatViewed(){
  if (state.chatViewedLoaded) return;
  state.chatViewedLoaded = true;
  try {
    const data = await getJSON('/chat-viewed.json');
    state.chatViewed = (data && data.viewed) || {};
  } catch (err) { /* no helper — every card simply reads as unread once */ }
}

let chatViewedTimer = null;
function saveChatViewed(){
  // A locked tab cannot write anything. Same guard the file save uses, and for
  // the same reason — a backup preview is a look at something that was.
  if (state.locked) return;
  clearTimeout(chatViewedTimer);
  chatViewedTimer = setTimeout(() => {
    // Checked again on the way out, not just on the way in: half a second is
    // long enough to open a card and then open a backup preview.
    if (state.locked) return;
    postJSON('/chat-viewed', { version: 1, viewed: state.chatViewed })
      .catch(() => { /* an unread dot is not worth an error message */ });
  }, 500);
}

function markChatViewed(id){
  state.chatViewed = state.chatViewed || {};
  state.chatViewed[id] = new Date().toISOString();
  saveChatViewed();
}

/* When a conversation last did anything, in the words the drawer already
   uses for the same rows. */
function cvWhen(iso){
  if (!iso) return '';
  const then = new Date(iso);
  if (isNaN(then)) return '';
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
function startOfDay(d){ return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function cvCardHTML(row, ownerKey, ownerLabel){
  // Unread since the card was last opened. state.chatViewed is furniture
  // rather than content, kept beside the list rather than in it, so it
  // survives a reload. A row with no `updated` (shouldn't happen) never lights
  // up rather than always doing so.
  const viewedAt = (state.chatViewed || {})[row.id];
  const unread = !!row.updated && (!viewedAt || row.updated > viewedAt);
  return '<article class="cvcard" data-session="' + esc(row.id) + '"' +
      ' data-owner="' + esc(ownerKey) + '">' +
    '<button type="button" class="cvclose" data-session="' + esc(row.id) + '"' +
      ' data-owner="' + esc(ownerKey) + '"' +
      ' title="Take this conversation off the board. The transcript stays on disk.">×</button>' +
    '<button type="button" class="cvbody" data-session="' + esc(row.id) + '"' +
        ' data-owner="' + esc(ownerKey) + '">' +
      '<span class="cvtitle">' + esc(row.title || 'Untitled conversation') +
        (unread ? '<i class="unread-dot" title="New output since you last opened it"></i>' : '') +
      '</span>' +
      '<span class="cvowner">' + esc(ownerLabel) + '</span>' +
      '<span class="cvmeta">' + esc(cvWhen(row.updated)) +
        (row.mode === 'work' ? '<em class="cvmode">can write</em>' : '') +
      '</span>' +
    '</button>' +
  '</article>';
}

function openCard(el){
  const owner = el.dataset.owner, id = el.dataset.session;
  const task = tasksByChatKey()[owner];
  markChatViewed(id);
  chat.openSession(task ? task.id : owner, owner, id);
}


/* ---- Taking a conversation off the board ----
   The same thing the × on a drawer row does, and worth being exact about what
   it is: the row leaves sessions.json, so the board stops listing the
   conversation, and Claude Code's transcript is left exactly where it is. The
   conversation is not deleted, it is unfiled — `claude --resume <id>` still
   opens it, and Claude Desktop still imports it.

   Which is why the wording asks about the board rather than about the
   conversation. "Delete this chat?" would be a promise this cannot keep: the
   file belongs to Claude Code and nothing here should be reaching into it.

   It is still a confirm. Nothing on the board undoes it, and putting a
   conversation back means finding the id again. */
async function closeCard(ownerKey, sessionId){
  const rows = state.chats[ownerKey] || [];
  const row = rows.find(r => r.id === sessionId);
  const label = (row && row.title) || 'this conversation';
  if (!confirm('Take “' + label + '” off the board?\n\n' +
               'It stops being listed here. The transcript stays on disk, so ' +
               'the conversation can still be resumed in Claude Code or opened ' +
               'in Claude Desktop.')) return;

  await chat.forget(ownerKey, sessionId);
  // When it was last opened goes with it. Leaving that behind would quietly
  // mark the card read if the same session were ever filed again, which is a
  // surprise nobody asked for.
  delete state.chatViewed[sessionId];
  saveChatViewed();
  await chat.loadSessions();
  renderView();
}

/* The one write onSend's line-deletion above cannot make itself: by the time
   a run's session id exists, the send that started it is long past. Fire and
   forget, the same as saveChatViewed() — a session that never gets its prompt
   recorded (server unreachable, tab closed mid-run) has simply lost a nicety,
   not the conversation, which is why nothing here waits on or retries it. */
function notePrompt(ownerKey, sessionId, raw){
  postJSON('/claude/note', { owner: ownerKey, session: sessionId, prompt: raw }).catch(() => {});
}


/* The prompt's own row. Ask starts a conversation on the task; the link is
   still there for the times the web app is what you wanted. */
function claudeActions(text, taskId, raw){
  if (!claudeOn() || !taskId) return claudeLink(text);
  return '<button type="button" class="askclaude" data-task="' + esc(taskId) + '"' +
    ' data-ask="' + esc(text) + '"' +
    (raw ? ' data-raw="' + esc(raw) + '"' : '') +
    ' title="Starts a chat on this task with the prompt ready to send, running in ' +
    esc(chat.home()) + '">Ask Claude</button>' + claudeLink(text);
}

/* Every Jira note on a task, its sub-steps included. The card marker and the
   panel section both need this, and a task's tickets can sit at either depth. */
function jiraNotes(t){
  const parts = splitBody(t);
  const out = readJiraRun(parts.notes, '');
  parts.steps.forEach(s => out.push.apply(out, readJiraRun(s.notes, s.clean)));
  return out;
}

/* ---- Raising a Jira ticket ----
   Same idea as the Claude link, and the same limit: the URL fills the create
   form in, it does not create anything. CreateIssueDetails!init.jspa opens the
   dialog with the fields already set and waits for Create to be pressed, which
   is the only version of this worth having — a link that raised a ticket on
   somebody's board from a click would be a link nobody could safely put on a
   card.

   Jira wants numeric ids rather than keys, so pid and issuetype come out of
   data/jira.json rather than being written on the task. reporter is per board
   on purpose: DSYS refuses to create without one, and WADE refuses to let it be
   set at all, so one setting could not serve both. */
function jiraBoards(key){
  const cfg = state.jira;
  if (!cfg || !cfg.boards || !cfg.boards.length) return [];
  if (!key) return cfg.boards;
  return cfg.boards.filter(b => String(b.key || '').toUpperCase() === key);
}
function jiraHref(board, note){
  const cfg = state.jira;
  const q = ['pid=' + encodeURIComponent(board.pid),
             'issuetype=' + encodeURIComponent(board.issuetype)];
  if (board.setReporter && cfg.reporter) q.push('reporter=' + encodeURIComponent(cfg.reporter));
  q.push('summary=' + encodeURIComponent(note.summary));
  if (note.description) q.push('description=' + encodeURIComponent(note.description));
  return String(cfg.site).replace(/\/+$/, '') + '/secure/CreateIssueDetails!init.jspa?' + q.join('&');
}
/* Copy is drawn as an icon, not a label, and stays visible without a hover —
   the one action on a suggestion module worth reaching for on sight. Copied
   swaps in the tick for a moment; both are single-path SVGs, same convention
   as the icon buttons in the header. */
const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 16.17 4.83 12l-1.41 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
function copyBtn(attrs){
  return '<button type="button" class="copy" data-copy="' + esc(attrs.text) + '"' +
    (attrs.html ? ' data-copy-html="' + escAttr(attrs.html) + '"' : '') +
    ' aria-label="Copy" title="' + esc(attrs.title || 'Copy') + '">' + ICON_COPY + '</button>';
}

/* The buttons for one Jira note. A note naming a board nothing is configured
   for still renders, saying so — a note that quietly showed nothing would look
   the same as no note at all, and the summary is worth reading either way.
   That note stays outside .msgextra: it is information, not a control, so
   hiding it behind a hover would hide the reason nothing else is there to
   press. opts.where and opts.dismiss are the same two the drawer already
   needed — see messageHTML just below, which takes them for the same reason. */
function jiraHTML(note, opts){
  opts = opts || {};
  const boards = jiraBoards(note.key);
  /* This is information, not a control, so it reads with the rest of the
     text rather than floating in the corner where a button would sit — it
     explains why nothing is there to press. */
  const noBoard = boards.length ? '' : '<em class="suggwhere draft">' +
    (state.jira ? 'no board configured as ' + esc(note.key) : 'no data/jira.json') + '</em>';
  const extra = (boards.length
    ? boards.map(b =>
        '<a class="tojira" href="' + jiraHref(b, note) + '" target="_blank" rel="noopener"' +
        ' title="Opens the Jira create form on ' + esc(b.name || b.key) + ', filled in and unsubmitted">' +
        'Raise in ' + esc(b.key) + '</a>').join('')
    : '') +
    (opts.dismiss ? dismissBtn(opts.dismiss, opts.dismissDesc) : '');
  return '<div class="msg jira">' +
    '<div class="msgtext">' +
      (opts.where ? '<em class="suggwhere">for: ' + esc(opts.where) + '</em>' : '') +
      mdInline(note.summary) +
      (note.description ? '<em class="jirabody">' + mdInline(note.description) + '</em>' : '') +
      noBoard +
    '</div>' +
    (extra ? '<div class="msgacts"><span class="msgextra">' + extra + '</span></div>' : '') +
  '</div>';
}
function dismissBtn(raw, descRaw){
  return '<button type="button" class="dismiss" data-dismiss="' + esc(raw) + '"' +
    (descRaw ? ' data-dismiss-desc="' + esc(descRaw) + '"' : '') +
    ' title="Remove this suggestion">Dismiss</button>';
}

/* A ready-to-send message, with a button that copies just the message text.
   opts.claude adds the hand-over link beside it. opts.where and opts.draft
   are the drawer's own: several of these can sit on one task there, each
   under its own sub-step, so each needs to say which one and whether it
   still wants editing before it goes — Overview never passes either, since
   one card there is already scoped to one task. opts.dismiss is the raw
   markdown line to remove; rendering the button at all is what turns
   dismissing on, so a caller with nowhere to persist a removal just omits it. */
function messageHTML(text, opts){
  opts = opts || {};
  // opts.dismiss is already the exact raw line, when there is one — the same
  // text a manual Dismiss removes is what "used up by being run" removes.
  const extra = (opts.claude ? claudeActions(text, opts.task, opts.dismiss) : '') +
    (opts.dismiss ? dismissBtn(opts.dismiss) : '');
  return '<div class="msg"><div class="msgtext">' +
      (opts.where ? '<em class="suggwhere">for: ' + esc(opts.where) + '</em>' : '') +
      (opts.draft ? '<em class="suggwhere draft">draft — read it before sending</em>' : '') +
      mdInline(text) +
    '</div>' +
    '<div class="msgacts">' + copyBtn({ text }) +
      (extra ? '<span class="msgextra">' + extra + '</span>' : '') +
    '</div></div>';
}
/* A message is one line, so it goes into a `data-copy` attribute as it stands.
   An agenda is several, and a newline inside an attribute survives the parser but
   only by accident of how it is written, so encode it and stop relying on that. */
function escAttr(s){ return esc(s).replace(/\n/g, '&#10;'); }

/* The agenda for a recurring meeting, shown as the thing it becomes once pasted:
   the meeting date as a title, then Agenda, then real nested bullets. Rendered as
   an actual <ul> rather than as styled indentation, so what is on screen and what
   lands in the document are the same shape rather than two designs of one list.

   `when` is the task's `[due:: ]`, which is the date of the occurrence this
   agenda is for. The block carries no date of its own — see AGENDA_NOTE.

   `opts.prev` renders it as last cycle's, quieter and titled differently, but it
   still carries its own Copy — see the comment on the button below for why.
   `opts.where` is the drawer's own, same reason as messageHTML's. */
function agendaHTML(ag, when, opts){
  opts = opts || {};
  const clip = agendaClipboard(ag, when);
  const title = opts.prev
    ? '<em class="suggwhere">last time' + (ag.date ? ', ' + esc(dueLabel(ag.date)) : '') + '</em>'
    : (when ? '<span class="agdate">' + esc(longDate(when)) + '</span>' : '');
  return '<div class="msg agenda' + (opts.prev ? ' prev' : '') + '">' +
    '<div class="msgtext">' +
      (opts.where ? '<em class="suggwhere">for: ' + esc(opts.where) + '</em>' : '') +
      title +
      '<span class="aglead">Agenda</span>' +
      '<ul class="aglist">' + ag.topics.map(t =>
        '<li>' + mdInline(t.title) +
        (t.context.length
          ? '<ul>' + t.context.map(c => '<li>' + mdInline(c) + '</li>').join('') + '</ul>'
          : '') +
        '</li>').join('') + '</ul>' +
    '</div>' +
    '<div class="msgacts">' +
      /* Last cycle's gets a Copy too, dated with the occurrence the card is
         pointing at now rather than the one it was written for. It reads
         oddly written down and is the right behaviour: the reason to copy a
         past agenda is that the meeting it belonged to was cancelled or
         moved, so what is wanted is those topics under the new date. */
      copyBtn({
        text: clip.text, html: clip.html,
        title: opts.prev
          ? 'Copies these topics under the date on the card now, for a meeting that moved'
          : 'Copies the title and the bullets. Pasted into Google Docs they stay real bullets, both levels'
      }) +
    '</div>' +
  '</div>';
}
/* ---- Context: standing facts, not tasks ----
   Who is away, whose contract runs out when, how names are spelt. It is the one
   part of the file that is not work and cannot be worked out from the tasks, so
   it is read straight out of the markdown rather than derived. Dates tagged
   on: or until: get a live countdown, since a leave date nobody is counting is
   how a plan ends up depending on somebody who is not there. */
const CTX_DATE = /`(on|until):(\d{4}-\d{2}-\d{2})`/;

function contextBlock(){
  const lines = state.doc.pre.concat(state.doc.post);
  let inside = false;
  const out = [];
  lines.forEach(l => {
    const h = /^##\s+(.*)$/.exec(l);
    if (h) { inside = /^context\b/i.test(h[1].trim()); return; }
    if (inside) out.push(l);
  });
  return out;
}

/* Plans whose task has gone. A plan is read from the review behind it on its
   task's card, so one whose task was deleted or never got an id has nowhere to be
   read, and gets a line here instead: its title and where the file is. Finished
   plans (the old `state: done`) are history and are left out. Read from
   /plans.json when Overview is arrived at, and drawn again only if the answer
   changed. */
let orphanPlans = [];
async function refreshOrphanPlans(){
  let got = [];
  try {
    const res = await fetch('/plans.json?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const ids = new Set();
      if (state.doc) state.doc.buckets.forEach(b => b.tiers.forEach(t => t.tasks.forEach(k => { if (k.stableId) ids.add(k.stableId); })));
      got = ((await res.json()).plans || [])
        .filter(p => /^task:/.test(p.about || '') && !ids.has(p.about.slice(5)) && p.state !== 'done')
        .map(p => ({ title: p.title || p.name, name: p.name }));
    }
  } catch (err) { /* no server, or no plans folder: nothing to say */ }
  const was = JSON.stringify(orphanPlans);
  orphanPlans = got;
  if (JSON.stringify(got) !== was && state.view === 'overview') renderView();
}

function contextSection(){
  const lines = contextBlock();
  if (!lines.length && !orphanPlans.length) return null;

  const groups = [];
  let group = '', items = [];
  // Grouped facts collapse behind their heading — a dozen `###` sections is
  // most of the column's length, and only one is usually the one being read.
  // Anything before the first heading has no title to collapse behind, so it
  // stays open, plain, the way it always has.
  const flush = () => {
    if (!items.length) return;
    groups.push({ title: group || null, items });
    items = [];
  };

  lines.forEach(l => {
    const s = l.trim();
    if (!s || /^---+$/.test(s)) return;
    const h = /^###\s+(.*)$/.exec(s);
    if (h) { flush(); group = h[1]; return; }
    const b = /^[-*]\s+(.*)$/.exec(s);
    if (!b) return;

    const dm = CTX_DATE.exec(b[1]);
    let chip = null;
    if (dm) {
      const di = dueInfo(dm[2]);
      const past = di.days < 0;
      chip = { cls: 'tag due ' + (past ? '' : di.cls),
               text: (dm[1] === 'until' ? 'until ' : '') + di.label + ' \u00b7 ' +
                     (past ? Math.abs(di.days) + 'd ago' : 'in ' + di.days + 'd') };
    }
    items.push({
      // Lifting the date out leaves "back on ." behind, so close the gap it left.
      textHTML: mdInline(b[1].replace(CTX_DATE, '').replace(/\s+([.,])/g, '$1').replace(/\s{2,}/g, ' ').trim()),
      chip
    });
  });
  flush();
  if (orphanPlans.length) groups.push({
    title: 'Plans with no task',
    items: orphanPlans.map(p => ({
      textHTML: mdInline(p.title) + ' — <code>plans/' + esc(p.name) + '</code>. Its task is not on the list any more.',
      chip: null
    }))
  });
  return { body: BoardUI.h(BoardUI.ContextBody, { groups }) };
}

/* The tabs, in reading order. Plans and Execution are the two agent boards and
   sit together: the first proposes, the second carries out, and a card crosses
   from one to the other when he accepts a plan. Each reference section is
   generated from the tags on the tasks, so nothing here can name a task that is
   not on the board.

   `group` marks the defs that share one tab: Board, Matrix and Timeline are the
   same tasks under three renderers, and three peers between separators spent a
   third of the strip on that. The registry stays flat — the ids, isKnownView(),
   the #matrix and #timeline fragments and syncHash() all carry on unchanged, and
   only renderViewTabs() (18-timeline.js) knows the three are offered as one. */
function viewDefs(){
  const defs = [
    { id:'overview', label:'Overview' },
    { id:'sep0', sep:true },
    { id:'board',    label:'Board',    group:'draw' },
    { id:'matrix',   label:'Matrix',   group:'draw' },
    { id:'timeline', label:'Timeline', group:'draw' },
    { id:'sep1', sep:true },
    { id:'projects', label:'Projects' }
  ];
  return defs;
}
/* Backups isn't a view of the board, it's a data operation — see the Backups
   button in the header's data menu — so it sits outside viewDefs() and its
   tabs, but it still needs a #backups URL and a renderView() case of its own.

   'reports' is here for a different reason: it was a tab until 19 Sep 2026 and
   its two columns are the end of Overview's row now, so a #reports link is
   still a link somebody may have, and renderView() sends it to Overview. 'plans'
   is here the same way: it was a tab until 22 Sep 2026, and renderView() sends an
   old #plans link to the board. */
function isKnownView(id){
  return id === 'backups' || id === 'reports' || id === 'plans' || viewDefs().some(d => d.id === id);
}

