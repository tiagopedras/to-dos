'use strict';

/* =========================================================================
   4b4. Backup Preview — loading one of the files above straight into the
   board, so it can be looked through the same way as today's list, without
   any risk of it landing back on disk as the live todo.md.

   state.doc becomes the backup's parsed content and state.locked goes true;
   every place that would otherwise write to state.doc (setDone, dropTask,
   addTask, the drawer's field handlers, sub-step edits, headline, archive,
   saveFile, autosave, the outside-edit watcher) checks state.locked first and
   refuses. Exiting always re-fetches todo.md fresh from disk rather than
   restoring anything from memory — simplest, and no live edit can be lost
   from a mode that never allowed any.
   ========================================================================= */
async function loadBackupPreview(url, label){
  if (state.dirty) {
    alert('You have unsaved changes on today\'s list.\n\n' +
          'Save or discard them first, then Load the backup again.');
    return;
  }
  try {
    const res = await fetch(url + '?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) throw new Error('the server answered ' + res.status);
    const text = await res.text();
    const doc = parseDoc(text);
    if (!doc.buckets.length) throw new Error('that file has no task buckets in it');
    closeDrawer();
    state.doc = doc;
    state.originalText = text;
    state.fileName = url.split('/').pop();
    state.bucketFilter = new Set();
    state.view = 'board';
    state.locked = true;
    state.demo = false;
    state.lockedLabel = label;
    updateLockUI();
    renderView();
  } catch (err) {
    alert('Could not load that backup.\n\n' + (err.message || err));
  }
}

async function exitBackupPreview(){
  state.locked = false;
  state.lockedLabel = '';
  state.lockKind = '';
  state.demo = false;
  updateLockUI();
  await loadFile();
}

/* A conversation about the whole list rather than one card. Decided
   13 Sep 2026 as an embedded chat, reopened 14 Sep 2026 for a real
   Terminal.app window running an interactive `claude` session seeded with
   /pa, instead of the `claude -p` one-shot every task's own New chat opens
   (`PACKAGES/ai_chat_engine`'s Runner.run()) — a sitting about the whole
   file is better served by a session he can keep typing into.

   Locks the tab for the length of it, the same guard Backup Preview and
   demo data already use: pa's own writes to todo.md would otherwise race
   this tab's autosave, and a lock is the one guard that cannot lose either
   side of that race. Refuses on unsaved edits first, for the same reason
   loadBackupPreview() does — exitBackupPreview() always re-reads todo.md
   fresh from disk, which would otherwise discard them. */
async function openListChat(){
  if (state.dirty) {
    alert('You have unsaved changes on today\'s list.\n\n' +
          'Save or discard them first, then Talk about the list again.');
    return;
  }
  try {
    await postJSON('/session/open-terminal', { prompt: '/pa' });
  } catch (err) {
    alert('Could not open a Claude window.\n\n' + (err.message || err));
    return;
  }
  state.locked = true;
  state.lockKind = 'chat';
  state.lockedLabel = 'A conversation about the whole list is open in a new Claude window';
  updateLockUI();
}

function updateLockUI(){
  document.body.classList.toggle('locked', state.locked);
  $('#lockFrame').classList.toggle('hidden', !state.locked);
  $('#lockBar').classList.toggle('hidden', !state.locked);
  const chat = state.lockKind === 'chat';
  $('#lockBarKind').textContent = chat ? 'Conversation open' : (state.demo ? 'Example data' : 'Backup Preview');
  $('#exitLock').textContent = chat ? 'Done — reload the list' : (state.demo ? 'Try todo.md again' : 'Return to today\'s list');
  $('#lockBarLabel').textContent = !state.locked ? '' : chat
    ? state.lockedLabel + '. Nothing here saves until you reload.'
    : 'Viewing ' + state.lockedLabel + ' — nothing here can be edited or saved.';
  $('#dataMenu').classList.toggle('hidden', state.locked);
  if (state.locked) $('#datasetMenu').classList.add('hidden');
  else if (state.datasets) $('#datasetMenu').classList.remove('hidden');
  syncLockBarHeight();
}

/* Tell the header how far down to stick. Both it and the bar are sticky at the
   top of the same scroller, so the header needs the bar's height as its offset
   or the two occupy the same strip and the bar, being the higher layer, hides
   the buttons underneath it. Measured rather than assumed: the bar wraps to a
   second line on a narrow window, and the Example data label is longer than the
   Backup Preview one, so no single number is right for both. */
function syncLockBarHeight(){
  const h = state.locked ? $('#lockBar').offsetHeight : 0;
  document.body.style.setProperty('--lockbar-h', h + 'px');
  /* The bar pushes the header down without changing its height, so nothing else
     remeasures — and the bucket strip sticks to the header's bottom edge, which
     has just moved. */
  syncHeaderHeight();
}

/* The bar changes height without the board re-rendering — the window is resized,
   or the label reflows — so remeasure from the element itself rather than only
   at the moments the mode changes. */
if (window.ResizeObserver) {
  new ResizeObserver(syncLockBarHeight).observe($('#lockBar'));
} else {
  window.addEventListener('resize', syncLockBarHeight);
}

/* How much of the viewport the app's own header (and the lock bar above it,
   when one is showing) already takes up — read back with getBoundingClientRect
   rather than added by hand, since the two can each change height on their
   own (the lock bar wraps, the header wraps). Used to size the timeline's own
   scrolling pane so it fits under the header instead of running off the
   bottom of the window — see .tlscroll's max-height. */
function syncHeaderHeight(){
  document.body.style.setProperty('--header-h', Math.round($('header').getBoundingClientRect().bottom) + 'px');
}
if (window.ResizeObserver) {
  new ResizeObserver(syncHeaderHeight).observe($('header'));
} else {
  window.addEventListener('resize', syncHeaderHeight);
}

$('#exitLock').onclick = exitBackupPreview;

