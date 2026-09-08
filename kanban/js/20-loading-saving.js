'use strict';

/* =========================================================================
   6. Loading & saving
   ========================================================================= */

function load(text, name, opts){
  opts = opts || {};
  const doc = parseDoc(text);
  if (!doc.buckets.length) throw new Error('No task buckets found — expected headings like "## 1. People".');
  state.doc = doc;
  const renamed = renameParked(state.doc);
  const stamped = stampDoneDates(state.doc);
  /* Never on a document that cannot be written back. The demo and a backup
     preview are both records of something else, and rolling their dates forward
     would show dates that are nowhere on disk — the demo would also silently
     lose its example agenda to a Previous agenda note. `state.locked` is set by
     the caller after this returns, so it cannot be the guard here. */
  const rolled = opts.readOnly ? { n:0, carried:0, archived:[] } : rollRecurring(state.doc);
  state.originalText = text;
  state.fileName = name || 'todo.md';
  $('#start').classList.add('hidden');
  $('#board').classList.remove('hidden');
  $('#hdr').classList.remove('hidden');
  // The bucket strip is a second bar under the header now, so it comes and goes
  // with it — there is nothing to filter before a document is loaded.
  $('#bucketBar').classList.remove('hidden');
  // The URL's bucket slug can only be matched against a real bucket once the
  // file naming them has actually loaded — that's now, so it gets one shot
  // here and is cleared either way, so a later reload of a different dataset
  // doesn't reapply a slug that belonged to the URL, not to this file.
  if (state.pendingBucketSlug !== null) {
    state.bucketFilter = bucketFilterFromSlugs(state.pendingBucketSlug);
    state.pendingBucketSlug = null;
  }
  // A dataset switch can land here carrying a filter full of names from the
  // *previous* dataset's buckets — drop whichever ones this file doesn't have
  // rather than showing an empty board because every toggled name is stale.
  state.bucketFilter.forEach(name => { if (!doc.buckets.some(b => b.name === name)) state.bucketFilter.delete(name); });
  markClean('');
  state.migratedOnly = false;
  renderView();
  if (renamed) { markDirty(); $('#status').textContent = 'renamed “Parked” to “Backlog” — save to apply'; }
  if (stamped) {
    markDirty();
    $('#status').textContent = 'dated ' + stamped + ' finished task' + (stamped === 1 ? '' : 's') +
      ' as done today — save to apply';
  }
  /* Said out loud, because this one moved a date and cleared a tick on a task he
     did not touch. Last, so it is the message left standing when more than one
     fixup ran: it is the only one of the three that changes what a card says. */
  if (rolled.n) {
    markDirty();
    $('#status').textContent = 'rolled ' + rolled.n + ' recurring task' + (rolled.n === 1 ? '' : 's') +
      ' onto the next date' +
      /* Said separately, because it is the one part he might disagree with: an
         agenda that was never ticked off is treated as still pending and moves
         with the card rather than being filed as last cycle's. */
      (rolled.carried
        ? ', ' + (rolled.carried === 1 ? 'one' : rolled.carried) +
          ' carrying an agenda that was never ticked off'
        : '') +
      // A finished one moving columns is a bigger change to the board than a
      // date quietly ticking forward, so it gets its own clause rather than
      // hiding inside "rolled".
      (rolled.moved
        ? ', ' + (rolled.moved === 1 ? 'one' : rolled.moved) +
          ' parked in To do or Backlog'
        : '') +
      ' — save to apply';
  }
  flushAgendaHistory(rolled.archived);
  // After, not before: the rename/stamp fixups above are auto-applied on every
  // load, not something to undo back out of, so the freshly loaded (and fixed)
  // document is what "nothing to undo yet" means.
  resetUndo();
  // Set last: markDirty clears it, and both migrations go through markDirty.
  state.migratedOnly = !!(renamed || stamped || rolled.n);
}

/* A link naming a task arrives before there is a document to find it in, so it
   waits in state.pendingTask until one is loaded. Called by the loaders rather
   than by load() itself: the drawer draws itself read-only or not off
   state.locked, and that isn't settled until the caller has finished — load()
   runs before loadDemo has said the demo may not be written to. */
function applyPendingTask(){
  if (!state.pendingTask) return;
  const key = state.pendingTask;
  state.pendingTask = '';
  openTaskByKey(key);
}

function showErr(msg){
  $('#start').classList.remove('hidden');
  $('#board').classList.add('hidden');
  $('#hdr').classList.add('hidden');
  $('#bucketBar').classList.add('hidden');
  $('#startErr').innerHTML = '<div class="err">' + msg + '</div>';
}

/* Read todo.md from the project root, one folder up from this page. Needs the local
   launcher running — a browser will not let a page opened straight off the disk read
   files around it. */
async function loadFile(){
  try {
    const res = await fetch(FILE_URL + '?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error('the server answered ' + res.status);
    load(await res.text(), 'todo.md');
    state.diskStamp = res.headers.get('Last-Modified') || null;
    /* A real list always wins: whatever was standing in for it stops here. */
    state.demo = false;
    state.locked = false;
    state.lockedLabel = '';
    updateLockUI();
    applyPendingTask();
    drainAttachQueue();
  } catch (err) {
    if (await loadDemo()) return;
    showErr('<strong>Could not read todo.md.</strong><br>Close this tab and start the board by ' +
            'double-clicking <strong>run.command</strong> in the to-dos folder. ' +
            'Opening this page directly from Finder will not work — browsers block a page on disk ' +
            'from reading files beside it.<br><span style="opacity:.75">(' + esc(String(err.message || err)) + ')</span>');
  }
}

/* Read the Jira boards, if there are any. Absent is the ordinary case: the file
   is gitignored, so a fresh clone has none and the buttons simply do not show.
   It falls back to a committed example the same way the list falls back to
   demo.md, so the public deployment can still show what the feature looks like
   without a real site or account id being committed to a public repo.

   Never throws and never blocks the list: a board that cannot read this file is
   a board with no Jira buttons, which is a smaller problem than a board that
   will not open. */
async function loadJira(){
  for (const url of [JIRA_URL, '/kanban/jira.demo.json']) {
    try {
      const cfg = await getJSON(url);
      if (!cfg || !cfg.site || !Array.isArray(cfg.boards) || !cfg.boards.length) continue;
      state.jira = cfg;
      if (state.doc) renderView();
      return;
    } catch (err) { /* malformed or missing: no buttons, no complaint */ }
  }
}

