'use strict';

/* =========================================================================
   Data sets — which private folder under data/ the board reads and writes.

   The dropdown lists every folder the server found; picking one asks the
   server to make it current, then reloads the page rather than trying to
   patch state in place. A switch changes the list, its backups, its Claude
   sessions and its Jira config all at once, so a full reload is the only way
   to be sure nothing from the old one lingers in this tab.

   Which list is loaded is on the button rather than only inside the panel it
   opens. Everything on the board — every count, every date, every name — is
   true of one data set and wrong of the other, and with the switcher buried
   in a menu there was nothing on the page saying which one you were reading.
   ========================================================================= */

/* The button reads "Data · twinkl ▾". A middot rather than brackets or a
   colon, the same separator the reports use for a period, and the raw folder
   name rather than anything prettified — that name is what data/.current
   holds and what every path under data/ is spelt with, so a tidied-up version
   here would be a second name for one folder. Falls back to a bare "Data ▾"
   when the server has no /datasets.json to answer with, which is the board
   behaving exactly as it did before lists existed. */
function setDataMenuLabel(name){
  $('#dataMenuBtn').textContent = name ? 'Data · ' + name + ' ▾' : 'Data ▾';
}
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
    setDataMenuLabel(data.current);
    if (!state.locked) $('#datasetMenu').classList.remove('hidden');
    // A server that answers with no lists at all, which is a fresh checkout.
    welcomeIfEmpty(data);
  } catch (err) {
    // No /datasets.json — an older server, or none at all. One list, no
    // picker, exactly as the board behaved before this existed.
    state.datasets = false;
    setDataMenuLabel('');
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

/* ---- Making a list ------------------------------------------------------
   One `prompt()` for a name until 17 Sep 2026, which produced a shell: a
   todo.md with one bucket called Tasks and nothing else. Everything that makes
   a list actually work — a brief per bucket, and the README saying which
   buckets the list has — was left unmade, so every task in a new list planned
   against the fallback agent with nothing to read. `personal` behaved that way
   from the day it was made.

   So it is a wizard: the name, then the buckets, then a line about each saying
   what kind of work lands in it. That last one is the part worth collecting —
   it becomes the opening of the bucket's own brief rather than boilerplate
   under a "not filled in yet" marker, which is the difference between a brief
   an agent is pointed at and one it is not. Everything else is scaffolded from
   it by create_dataset() in kanban/server.py. */

const WIZARD_BUCKETS = ['People', 'Work oversight', 'Design System', 'Strategic'];

let wizard = null;

function wizardHTML(){
  if (wizard.step === 0) {
    return '<div class="repdoc">' +
      '<p>What is this list called? It becomes a folder under <code>data/</code>, ' +
      'and the name on the switcher.</p>' +
      '<input id="wizName" class="field" type="text" placeholder="Personal" ' +
        'value="' + esc(wizard.name) + '">' +
    '</div>';
  }
  if (wizard.step === 1) {
    return '<div class="repdoc">' +
      '<p>Which buckets? One per line, in the order they should read on the board. ' +
      'Each gets its own folder, its own brief and its own planner.</p>' +
      '<textarea id="wizBuckets" class="redowhy" rows="6" ' +
        'placeholder="' + esc(WIZARD_BUCKETS.join('\n')) + '">' +
        esc(wizard.buckets.map(b => b.name).join('\n')) + '</textarea>' +
    '</div>';
  }
  const b = wizard.buckets[wizard.step - 2];
  return '<div class="repdoc">' +
    '<p>What kind of work lands in <strong>' + esc(b.name) + '</strong>? One line. ' +
    'It opens the bucket\u2019s brief, which is what the planning agent reads ' +
    'before it plans anything in here.</p>' +
    '<textarea id="wizAbout" class="redowhy" rows="3" ' +
      'placeholder="Probation reviews, performance, hiring, objectives, growth conversations.">' +
      esc(b.about || '') + '</textarea>' +
    '<p class="qwhy">You can leave it blank and write the brief later \u2014 while it is ' +
    'empty, no agent is pointed at it.</p>' +
  '</div>';
}

function wizardRead(){
  if (wizard.step === 0) {
    const el = $('#wizName');
    if (el) wizard.name = el.value.trim();
    return !!wizard.name;
  }
  if (wizard.step === 1) {
    const el = $('#wizBuckets');
    const was = wizard.buckets;
    if (el) {
      const names = el.value.split('\n').map(n => n.trim()).filter(Boolean);
      // Keep a description already typed against a bucket whose name has not
      // changed, so stepping back and forward does not lose it.
      wizard.buckets = names.map(name => ({
        name, about: (was.find(b => b.name === name) || {}).about || ''
      }));
    }
    return wizard.buckets.length > 0;
  }
  const el = $('#wizAbout');
  if (el) wizard.buckets[wizard.step - 2].about = el.value.trim();
  return true;
}

function wizardSteps(){ return 2 + wizard.buckets.length; }

function showWizard(){
  const last = wizard.step === wizardSteps() - 1;
  const buttons = [];
  if (wizard.step > 0) buttons.push({ label:'Back', run: () => { wizard.step--; showWizard(); } });
  buttons.push({ label: last ? 'Make the list' : 'Next', primary:true, run: () => {
    if (!wizardRead()) {
      showToast(wizard.step === 0 ? 'A list needs a name.' : 'A list needs at least one bucket.', 'bad');
      showWizard();
      return;
    }
    // Read again after the buckets step, since the count it just set is what
    // says how many steps there are.
    if (wizard.step >= wizardSteps() - 1) { finishWizard(); return; }
    wizard.step++;
    showWizard();
  } });
  buttons.push({ label:'Cancel', run: () => { wizard = null; loadDatasets(); } });
  const sub = wizard.step === 0 ? 'Step 1 of 2, at least'
    : 'Step ' + (wizard.step + 1) + ' of ' + wizardSteps();
  showModal('A new list', esc(sub), wizardHTML(), buttons, { cls:'wizard' });
  const first = $('#wizName') || $('#wizBuckets') || $('#wizAbout');
  if (first) { first.focus(); if (first.select) first.select(); }
}

async function finishWizard(){
  const body = { name: wizard.name, buckets: wizard.buckets };
  wizard = null;
  try {
    await postJSON('/datasets', body);
    location.reload();
  } catch (err) {
    alert('Could not create that list.\n\n' + (err.message || err));
    loadDatasets();
  }
}

function createDataset(){
  wizard = { step: 0, name: '', buckets: WIZARD_BUCKETS.map(name => ({ name, about: '' })) };
  showWizard();
}

/* Nothing to switch into, which is what a fresh clone looks like: `data/` is
   gitignored, so the first time the board is opened on a new machine there is
   no list at all and every route past current_dataset() resolves a path
   through None. A board with no lists drew a bare, broken board and said
   nothing; it opens the wizard instead. */
function welcomeIfEmpty(data){
  if ((data.datasets || []).length) return false;
  showModal('Nothing here yet', 'No list on this machine',
    '<div class="repdoc">' +
      '<p>There is no list in <code>data/</code> yet \u2014 which is what a fresh ' +
      'checkout looks like, since that folder is never committed.</p>' +
      '<p>Make one now and the board has something to draw.</p>' +
    '</div>',
    [{ label:'Make a list', primary:true, run: () => createDataset() }], {});
  return true;
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
    state.diskHash = null;
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
    /* The stamp this tab last agreed with, so the server can refuse a write
       built on a version of the file that has since moved. Absent on the very
       first save of a session, before any HEAD has run — the server treats a
       missing header as "no opinion" and writes, which is the old behaviour and
       the right one for a tab that has not yet read the file. */
    const headers = { 'Content-Type':'text/markdown; charset=utf-8' };
    if (state.diskStamp) headers['If-Unmodified-Since'] = state.diskStamp;
    /* And the content this document was built on, which is the check the stamp
       cannot make: Last-Modified carries one second, so a write landing inside
       the same second as this tab's last read looks unchanged to it. */
    if (state.diskHash) headers['If-Match'] = state.diskHash;
    const res = await fetch(FILE_URL + (forceBackup ? '?backup=force' : ''), {
      method: 'PUT', headers, body: text
    });
    const info = await res.json().catch(() => ({}));
    /* 409 is the file having moved under this tab, or a migration holding the
       list. Handled here rather than thrown, because the catch below calls
       markDirty() and the autosave would come straight back in four seconds and
       get the same answer, forever.

       Taking the server's stamp first is what stops the same loop through the
       modal: reload() may leave his changes in place if he keeps them, and
       without this the next autosave would still be carrying the old stamp. The
       watcher takes a changed stamp once per outside change for the same
       reason. */
    if (res.status === 409) {
      if (info.disk) state.diskStamp = info.disk;
      if (info.hash) state.diskHash = info.hash;
      if (info.migrating) {
        markDirty();
        autoStatus('not saved — a migration is running on this list. Your changes are still here.');
        return;
      }
      markDirty();
      autoStatus('not saved — todo.md changed on disk since this tab read it');
      await reload();
      return;
    }
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

