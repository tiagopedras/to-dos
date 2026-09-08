'use strict';

/* =========================================================================
   Archiving finished work

   A task ticked off a month ago is history, not a list. It comes out of todo.md
   and goes into data/backups/done-archive.md, which is append-only and never pruned —
   so this is a move, not a delete, and the record outlives the backups that
   would otherwise have been the only copy.

   Never automatic. The list shrinking on its own, while the tab is open, is
   indistinguishable from the board losing work.
   ========================================================================= */

const ARCHIVE_DAYS = 30;

function daysSince(iso){
  const d = parseDue(iso);
  return d ? Math.round((today() - d) / 86400000) : null;
}

/* Ticked, dated, and dated long enough ago. An undated done task is left alone:
   without a date there is no claim to make about its age. */
function archivable(){
  const out = [];
  if (!state.doc) return out;
  state.doc.buckets.forEach(b => b.tiers.forEach(tier => tier.tasks.forEach(t => {
    if (!t.done || !t.doneOn) return;
    const age = daysSince(t.doneOn);
    if (age != null && age > ARCHIVE_DAYS) out.push({ bucket:b, tier, task:t, age });
  })));
  return out.sort((x, y) => y.age - x.age);
}

function updateArchiveChip(){
  const btn = $('#archiveBtn');
  if (!btn) return;
  if (state.locked) { btn.classList.add('hidden'); return; }
  const n = archivable().length;
  btn.classList.toggle('hidden', n === 0);
  btn.textContent = 'Archive ' + n + ' finished';
  btn.title = n + ' task' + (n === 1 ? '' : 's') + ' ticked off more than ' +
              ARCHIVE_DAYS + ' days ago. Moves them to data/backups/done-archive.md.';
}

/* Grouped by where they were, because "which bucket was this in" is most of what
   makes an archived task findable a year later. */
function archiveMarkdown(list){
  const groups = new Map();
  list.forEach(it => {
    const key = it.bucket.name + ' · ' + it.tier.name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it.task);
  });
  const out = [];
  groups.forEach((tasks, key) => {
    out.push('### ' + key, '');
    tasks.forEach(t => { out.push.apply(out, serializeTask(t)); });
    out.push('');
  });
  return out.join('\n');
}

async function archiveOldDone(){
  if (state.locked) return;
  const list = archivable();
  if (!list.length) return;

  const body =
    '<div class="changes"><h3>Moving out of todo.md (' + list.length + ')</h3><ul>' +
    list.slice(0, 40).map(it =>
      '<li><span class="what">' + it.age + 'd</span><span><strong>' + mdInline(it.task.title) +
      '</strong> <span class="where">' + esc(it.bucket.name + ' · ' + it.tier.name) +
      ' · ticked ' + esc(it.task.doneOn) + '</span></span></li>').join('') +
    '</ul>' + (list.length > 40 ? '<div class="none">…and ' + (list.length - 40) + ' more.</div>' : '') +
    '</div>';

  showModal('Archive finished work',
    'These were ticked off more than ' + ARCHIVE_DAYS + ' days ago. They move to ' +
    '<strong>data/backups/done-archive.md</strong>, which is never pruned, and a fresh backup of ' +
    'the whole list is taken first. Sub-steps and notes go with them.',
    body,
    [{ label:'Archive ' + list.length, primary:true, run:runArchive },
     { label:'Not now' }]);

  async function runArchive(){
    const text = archiveMarkdown(list);
    try {
      await postJSON('/archive', { text });
    } catch (err) {
      alert('Nothing was archived, and nothing was removed from todo.md.\n\n' +
            (err.message || err));
      return;
    }
    // Only now is it safe to take them out: the copy is already on disk.
    list.forEach(it => {
      const i = it.tier.tasks.indexOf(it.task);
      if (i > -1) it.tier.tasks.splice(i, 1);
    });
    invalidateArchiveEntries();       // this batch is now in the file the reports view reads
    closeDrawer();
    markDirty();
    refreshView();
    await saveFile(false, true);
    $('#status').textContent = 'archived ' + list.length + ' finished task' +
      (list.length === 1 ? '' : 's') + ' → data/backups/done-archive.md';
  }
}

setInterval(autosaveTick, 2 * 1000);                // checked often, saves at most every 4 seconds
setInterval(watchTick, WATCH_MS);

/* The Data menu: one button standing in for the four it used to show at once.
   Closes on a second click of the button, a click anywhere else, Escape, or
   picking one of its own items — the last so the panel never sits open over
   whatever the click just did (a Backups or Schedule view change, a download). */
function closeDataMenu(){
  $('#dataMenuPanel').classList.add('hidden');
  $('#dataMenuBtn').setAttribute('aria-expanded', 'false');
}
$('#dataMenuBtn').onclick = () => {
  const open = $('#dataMenuPanel').classList.toggle('hidden') === false;
  $('#dataMenuBtn').setAttribute('aria-expanded', String(open));
};
$('#dataMenuPanel').addEventListener('click', e => { if (e.target.closest('.dropdown-item')) closeDataMenu(); });
document.addEventListener('click', e => { if (!e.target.closest('#dataMenu')) closeDataMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDataMenu(); });

/* wiring */
$('#download').onclick = () => downloadText(serializeDoc(state.doc), state.fileName);
$('#backupsBtn').onclick = () => { state.view = 'backups'; renderView(); };
$('#archiveBtn').onclick = archiveOldDone;
$('#retry').onclick = loadFile;
$('#q').oninput = e => { state.query = e.target.value; renderBoard(); };
$('#aiFilter').onchange = e => { state.aiFilter = e.target.value; closeDrawer(); renderBoard(); };
$('#urgentFilter').onchange = e => { state.urgentFilter = e.target.checked; closeDrawer(); renderBoard(); };

/* The reference cards are a working surface, not a report. Everything here
   writes to the same task the card was built from, then re-renders the view,
   which recomputes it from scratch — so a tick moves the card out of Quick wins
   and into its done state everywhere at once, with nothing to keep in step. */
$('#lists').addEventListener('click', e => {
  // preventDefault since the button sits inside a lane's <summary> — without
  // it, the click also toggles the lane collapsed/open, which is not what a
  // sort click means.
  const sortBtn = e.target.closest('[data-tlsort]');
  if (sortBtn) {
    e.preventDefault();
    sortTimelineLane(sortBtn.dataset.tlsort);
    return;
  }

  const toggle = e.target.closest('[data-tltoggle]');
  if (toggle) {
    const id = toggle.dataset.tltoggle;
    if (tlExpanded.has(id)) tlExpanded.delete(id); else tlExpanded.add(id);
    renderView();
    return;
  }

  /* The pace chart's key. Only the counted card is redrawn, since nothing about
     the list itself has changed — this is a change of view, not an edit. */
  const key = e.target.closest('[data-trendkey]');
  if (key) {
    const name = key.dataset.trendkey;
    if (trendHidden.has(name)) trendHidden.delete(name); else trendHidden.add(name);
    renderCountedReports();
    return;
  }

  const tick = e.target.closest('[data-tick]');
  if (tick) {
    const found = locate(tick.dataset.tick);
    if (!found) return;
    if (tick.dataset.sub != null) {
      const lineIdx = +tick.dataset.sub;
      const step = splitBody(found.task).steps.find(s => s.line === lineIdx);
      if (!step || !step.done) {
        const msg = blockedMessage(allItems(), (step ? step.blockedBy : []).concat(found.task.blockedBy || []));
        if (msg) { showToast(msg, 'blocked'); return; }
      }
      toggleSub(found.task, lineIdx);
    } else {
      if (!found.task.done) {
        const msg = blockedMessage(allItems(), found.task.blockedBy);
        if (msg) { showToast(msg, 'blocked'); return; }
      }
      setDone(found.task, !found.task.done); markDirty();
    }
    renderView();
    return;
  }

  /* Taking something out of the week is the edit that never gets made, because
     it means admitting the week was over-committed. One click, from the list
     where he notices it. */
  const drop = e.target.closest('[data-unweek]');
  if (drop) {
    const found = locate(drop.dataset.unweek);
    if (!found) return;
    if (drop.dataset.sub != null) {
      const i = +drop.dataset.sub;
      const m = SUB_RE.exec(found.task.body[i]);
      if (m) found.task.body[i] = m[1] + '- [' + m[2] + '] ' + m[3].replace(/\s*`week`/g, '');
    } else {
      found.task.week = false;
      found.task.dirty = true;
    }
    markDirty();
    renderView();
    return;
  }

  /* Dismissing a quick win is a preference about this list, not an edit —
     nothing is marked dirty and nothing is saved to todo.md. */
  const dismissQuick = e.target.closest('[data-quickdismiss]');
  if (dismissQuick) {
    const set = quickDismissedSet();
    set.add(dismissQuick.dataset.quickdismiss);
    setQuickDismissed(set);
    renderView();
    return;
  }
  if (e.target.closest('[data-quickrestore]')) {
    setQuickDismissed(new Set());
    renderView();
    return;
  }

  /* Open the task where he is standing. This used to throw him onto the board
     first, which lost his place in the list he was reading and made a two second
     edit feel like a detour. The drawer edits the task itself, not the card, so
     it works the same from any view. */
  const open = e.target.closest('[data-open]');
  if (!open) return;
  if (!locate(open.dataset.open)) return;
  openDrawer(open.dataset.open);
});

/* Matrix hover preview. Delegated from #lists, which survives every re-render,
   rather than bound per dot — the grid is rebuilt on any edit and per-dot
   handlers would be re-attached thirty times for nothing.

   Keyboard gets the same treatment through focusin: the dots are real buttons,
   so tabbing through the grid should show what each one is. */
$('#lists').addEventListener('mouseover', e => {
  const dot = e.target.closest('.mdot');
  if (dot) showMatrixPreview(dot);
  const pt = e.target.closest('.trendpt');
  if (pt) showTrendPreview(pt);
});
$('#lists').addEventListener('mouseout', e => {
  if (e.target.closest('.mdot')) hideMatrixPreview();
  if (e.target.closest('.trendpt')) hideTrendPreview();
});
$('#lists').addEventListener('focusin', e => {
  const dot = e.target.closest('.mdot');
  if (dot) showMatrixPreview(dot);
  const pt = e.target.closest('.trendpt');
  if (pt) showTrendPreview(pt);
});
$('#lists').addEventListener('focusout', e => {
  if (e.target.closest('.mdot')) hideMatrixPreview();
  if (e.target.closest('.trendpt')) hideTrendPreview();
});
/* A preview left floating over a scrolled page points at the wrong dot, and one
   left up after a click sits on top of the drawer that just opened. */
window.addEventListener('scroll', () => { hideMatrixPreview(); hideTrendPreview(); }, { passive: true });
window.addEventListener('resize', () => { hideMatrixPreview(); hideTrendPreview(); });
$('#lists').addEventListener('click', () => { hideMatrixPreview(); hideTrendPreview(); }, true);

/* The Matrix's own filter. A change event rather than click, since this is a
   real checkbox and click would fire before its checked state settled. */
$('#lists').addEventListener('change', e => {
  if (!e.target.closest('[data-mxfilter]')) return;
  state.matrixHideWaiting = e.target.checked;
  refreshView();
});

/* Copy a ready-written message to the clipboard. Used by the list views and by
   the two suggestion sections at the bottom of the panel.

   The whole module is the click target, not just the icon: Copy is the one
   thing worth reaching for on a suggestion card without hunting for a small
   button first. A click that actually landed on one of the other controls —
   Dismiss, Ask Claude, Open in Claude, Raise in Jira — opts itself out, since
   those already have their own job and bubble up through here otherwise. A
   card with no Copy at all (a Jira note) has nothing to fall back to and
   this quietly does nothing, which is correct. */
async function handleCopy(e){
  let btn = e.target.closest('.copy');
  if (!btn) {
    if (e.target.closest('.dismiss, .toclaude, .askclaude, .tojira')) return;
    const msg = e.target.closest('.msg');
    btn = msg && msg.querySelector('.copy');
  }
  if (!btn) return;
  const text = btn.dataset.copy || '';
  /* An agenda carries a second flavour. Google Docs turns a leading "- " into a
     bullet only sometimes and loses the second level every time, so a plain-text
     agenda arrives as literal hyphens. Given text/html on the clipboard it reads
     the <ul> and produces real nested bullets. Both flavours go on together, so
     anywhere that cannot read HTML — a terminal, a plain notes field — still
     gets the text and nothing has to choose in advance. */
  const html = btn.dataset.copyHtml || '';
  let copied = false;
  try {
    if (html && window.ClipboardItem && navigator.clipboard.write) {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html':  new Blob([html], { type:'text/html' }),
        'text/plain': new Blob([text], { type:'text/plain' }),
      })]);
      copied = true;
    } else {
      await navigator.clipboard.writeText(text);
      copied = true;
    }
  } catch (err) {
    /* Older fallback. A contenteditable div rather than a textarea where there is
       an HTML flavour to keep: copying a selection out of live DOM is the only
       way execCommand ever carried formatting, and losing the bullets here would
       undo the whole point of the second flavour. */
    const el = document.createElement(html ? 'div' : 'textarea');
    if (html) { el.contentEditable = 'true'; el.innerHTML = html; }
    else el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    if (html) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } else el.select();
    try { copied = document.execCommand('copy'); } catch (e2) { copied = false; }
    el.remove();
  }
  if (!copied) {
    /* Never claim success: select the message so the keyboard shortcut works.
       From the whole block rather than from the button's own parent — the button
       lives in .msgacts, which is a sibling of .msgtext, so looking inside it
       found nothing and the last resort silently did nothing at all. */
    const box = (btn.closest('.msg') || btn.parentElement).querySelector('.msgtext');
    if (box) {
      const range = document.createRange();
      range.selectNodeContents(box);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  btn.innerHTML = copied ? ICON_CHECK : ICON_COPY;
  btn.title = copied ? 'Copied' : 'Now press ⌘C';
  btn.setAttribute('aria-label', btn.title);
  btn.classList.toggle('done', copied);
  btn.classList.toggle('warn', !copied);
  clearTimeout(btn._t);
  btn._t = setTimeout(() => {
    btn.innerHTML = ICON_COPY;
    btn.title = 'Copy';
    btn.setAttribute('aria-label', 'Copy');
    btn.classList.remove('done','warn');
  }, copied ? 1500 : 4000);
}
/* Removes one suggestion line from the task it was written on — Message,
   Prompt or Jira. The text was never anything but a note under the task, so
   dismissing it is the same edit as deleting that note by hand: find the raw
   line and take it out of the body. A Jira note may carry a description on
   the line under it, which goes with it. */
/* Takes one raw markdown line out of a task's body, the shared half of
   dismissing a suggestion by hand and a prompt suggestion being used up by
   actually being run — see askFromPrompt() and the onSend handler above
   it. Marks the list dirty on a real removal; does nothing to a line that
   isn't there, which covers both "already dismissed" and "no such line" the
   same way. */
function removeBodyLine(t, raw){
  if (!raw) return false;
  const idx = t.body.indexOf(raw);
  if (idx === -1) return false;
  t.body.splice(idx, 1);
  t.dirty = true;
  markDirty();
  return true;
}
function handleDismiss(e){
  const btn = e.target.closest('.dismiss');
  if (!btn || state.locked) return;
  const loc = state.openTask && locate(state.openTask);
  if (!loc) return;
  const t = loc.task;
  if (!removeBodyLine(t, btn.dataset.dismiss)) return;
  removeBodyLine(t, btn.dataset.dismissDesc);
  refreshView();
  openDrawer(t.id);
}
/* Opens the task named in a Dependencies row, from inside the panel that is
   already open on a different task. openDrawer replaces #dbody's content in
   place, the same as it does from any other trigger. */
function handleDepLink(e){
  const link = e.target.closest('.deplink');
  if (!link) return;
  if (!locate(link.dataset.open)) return;
  openDrawer(link.dataset.open);
}
/* Copy and the chat trigger buttons live inside the same containers, so one
   listener each rather than two. The modal itself is AIChat's own DOM, and it
   wires its own controls — see ai_chat/interface/chat.js. */
function handleMsgClick(e){ handleAsk(e); handleCopy(e); handleDismiss(e); handleDepLink(e); }
$('#lists').onclick = handleMsgClick;
$('#dbody').onclick = handleMsgClick;

window.addEventListener('beforeunload', e => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });

/* Back/forward and hand-edited URLs come through here rather than the tab
   clicks above, which drive the switch straight off state.view instead. Same
   for the bucket slug beside the view — an unmatched or missing one is left
   alone rather than reset to All, since plenty of hashchanges (a view tab
   click, for instance) carry no opinion about the bucket at all. */
window.addEventListener('hashchange', () => {
  const h = parseHash();
  let changed = false;
  if (isKnownView(h.view) && h.view !== state.view) { state.view = h.view; changed = true; }
  if (h.bucketSlug && state.doc) {
    const name = h.bucketSlug === 'all' ? ALL_BUCKETS : (bucketBySlug(h.bucketSlug) || {}).name;
    if (name && name !== state.activeBucket) { state.activeBucket = name; changed = true; }
  }
  if (changed) renderView();
  /* A second link arriving at a tab that is already up — which is what the
     companion's menu sends. If the file is still loading it waits for load(). */
  if (h.task) {
    if (state.doc) openTaskByKey(h.task);
    else state.pendingTask = h.task;
  }
  if (h.chat) {
    // The sessions index arrives with the engine's status rather than with the
    // file, so a link that beats it waits for the next onSessionsChanged.
    if (Object.keys(state.chats || {}).length) openChatByKey(h.chat);
    else state.pendingChat = h.chat;
  }
});
