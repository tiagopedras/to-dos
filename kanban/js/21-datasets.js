'use strict';

/* =========================================================================
   Data sets — which private folder under data/ the board reads and writes.

   The dropdown lists every folder the server found; picking one asks the
   server to make it current, then reloads the page rather than trying to
   patch state in place. A switch changes the list, its backups, its Claude
   sessions and its Jira config all at once, so a full reload is the only way
   to be sure nothing from the old one lingers in this tab.
   ========================================================================= */
async function loadDatasets(){
  try {
    const data = await getJSON(DATASETS_URL);
    const sel = $('#datasetSelect');
    sel.innerHTML = '';
    (data.datasets || []).forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      if (name === data.current) opt.selected = true;
      sel.appendChild(opt);
    });
    const add = document.createElement('option');
    add.value = '__new__';
    add.textContent = '+ New list…';
    sel.appendChild(add);
    state.datasets = true;
    if (!state.locked) $('#datasetMenu').classList.remove('hidden');
  } catch (err) {
    // No /datasets.json — an older server, or none at all. One list, no
    // picker, exactly as the board behaved before this existed.
    state.datasets = false;
    $('#datasetMenu').classList.add('hidden');
  }
}

async function switchDataset(name){
  try {
    await postJSON('/dataset/select', { name });
    location.reload();
  } catch (err) {
    alert('Could not switch lists.\n\n' + (err.message || err));
    loadDatasets();
  }
}

async function createDataset(){
  const raw = prompt('Name the new list:');
  if (raw === null || !raw.trim()) { loadDatasets(); return; }
  try {
    await postJSON('/datasets', { name: raw });
    location.reload();
  } catch (err) {
    alert('Could not create that list.\n\n' + (err.message || err));
    loadDatasets();
  }
}

$('#datasetSelect').onchange = e => {
  const name = e.target.value;
  if (name === '__new__') { createDataset(); return; }
  if (state.dirty) {
    alert('You have unsaved changes on this list.\n\nSave or discard them first, then switch lists.');
    loadDatasets();
    return;
  }
  switchDataset(name);
};

/* Stand an example list in for a missing todo.md, and say plainly that is what
   happened. Two situations reach here: a host serving this page as static files,
   where there is no data/ folder at all because git never had one, and the local
   board opened before the launcher is running.

   It reuses the Backup Preview lock rather than adding a mode of its own. The
   reason is the same one: invented tasks must never be able to reach disk as the
   live list. Locking is what already guarantees that everywhere — every write
   path checks it — so the example data gets it for free rather than needing a
   second set of guards that could fall out of step with the first.

   Returns false rather than throwing when there is no example file either, so
   loadFile can fall through to its real error. */
async function loadDemo(){
  try {
    const res = await fetch(DEMO_URL + '?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) return false;
    const text = await res.text();
    if (!parseDoc(text).buckets.length) return false;
    closeDrawer();
    load(text, 'demo.md', { readOnly:true });
    state.diskStamp = null;
    state.demo = true;
    state.locked = true;
    state.lockedLabel = 'an example list, not yours';
    updateLockUI();
    markClean('');
    renderView();
    applyPendingTask();
    return true;
  } catch (err) {
    return false;
  }
}

/* auto: this save was the timer's idea, not his, so a failure must not throw a
   dialog in front of whatever he is doing. It shows in the status line instead,
   and the changes stay in the tab either way. */
async function saveFile(auto, forceBackup){
  // The one guard that actually matters: state.doc can hold an old backup while
  // locked, and this must never let that overwrite the live todo.md.
  if (state.locked || !state.doc || !state.dirty) return;
  const text = serializeDoc(state.doc);
  try {
    const res = await fetch(FILE_URL + (forceBackup ? '?backup=force' : ''), {
      method: 'PUT',
      headers: { 'Content-Type':'text/markdown; charset=utf-8' },
      body: text
    });
    const info = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(info.error || ('the server answered ' + res.status));
    state.originalText = text;
    lastSaveAt = Date.now();
    // The relative stamp is the timestamp on an auto-save, so the clock time
    // would only repeat it. A manual save keeps the clock.
    markClean((auto ? 'auto-saved' : 'saved ' + new Date().toLocaleTimeString()) +
      (info.backup ? ' · backup: data/backups/' + info.backup : '') +
      (info.weekly ? ' · weekly: data/backups/' + info.weekly : '') + ' · todo.md', auto);
    // Our own write moved the file, so record it — otherwise the watcher would
    // read the new timestamp as somebody else's edit.
    await rememberStamp();
  } catch (err) {
    markDirty();
    if (auto) {
      // markDirty has just written "unsaved changes" over the line; this replaces
      // it, and keeps the clock as well as the stamp because a failure is worth
      // being able to pin to a moment.
      autoStatus('auto-save failed at ' + new Date().toLocaleTimeString() + ' — your changes are still here');
      $('#status').classList.add('dirty');
      return;
    }
    // A failed fetch means the local helper is not answering, not a bad file.
    const helperGone = err instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(String(err.message || err));
    if (helperGone) {
      $('#status').textContent = 'not saved — the board helper has stopped';
      alert('Nothing was saved, because the board helper is not running.\n\n' +
            'Your changes are still here in this tab, so do not close it.\n\n' +
            'Open To-Do Board.app again, or double-click run.command in the to-dos folder. It saves on ' +
            'its own every few seconds once it can reach the file again.\n\n' +
            'If you cannot restart it, use “Download copy” to get the changes out.');
    } else {
      alert('Could not save todo.md: ' + (err.message || err) +
            '\n\nNothing was written. Use “Download copy” if you need the changes out of the browser.');
    }
  }
}

function downloadText(text, name){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type:'text/markdown' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

