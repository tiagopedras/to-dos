'use strict';

/* =========================================================================
   Conflict modal
   ========================================================================= */

let modalEl = null;

function closeModal(){
  if (modalEl) { modalEl.remove(); modalEl = null; }
  document.removeEventListener('keydown', modalKeys);
}
function modalKeys(e){ if (e.key === 'Escape') closeModal(); }

/* buttons: [{ label, primary, danger, agree, reject, run }] — the first is the
   safe default. The × in .top always closes without running anything.
   opts: { wide } — wide is the document-width variant a written report opens
   in, rather than the confirmation-sized default. */
function showModal(heading, sub, bodyHTML, buttons, opts){
  closeModal();
  modalEl = document.createElement('div');
  modalEl.className = 'mscrim';
  modalEl.innerHTML =
    '<div class="sheet' + (opts && opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(heading) + '">' +
      '<div class="top"><button type="button" class="mclose" aria-label="Close">×</button>' +
        '<h2>' + esc(heading) + '</h2><p class="msub">' + sub + '</p></div>' +
      '<div class="mid">' + bodyHTML + '</div>' +
      '<div class="foot">' + buttons.map((b, i) =>
        '<button class="btn' + (b.primary ? ' primary' : '') + (b.danger ? ' danger' : '') +
        (b.agree ? ' agree' : '') + (b.reject ? ' reject' : '') +
        '" data-i="' + i + '">' + esc(b.label) + '</button>').join('') +
      '</div>' +
    '</div>';
  // Clicking the backdrop is a cancel, not a choice. Nothing is decided by it.
  modalEl.onclick = e => { if (e.target === modalEl) closeModal(); };
  modalEl.querySelector('.mclose').onclick = closeModal;
  modalEl.querySelectorAll('.foot .btn').forEach(btn => {
    btn.onclick = () => { const b = buttons[+btn.dataset.i]; closeModal(); if (b.run) b.run(); };
  });
  document.body.appendChild(modalEl);
  document.addEventListener('keydown', modalKeys);
  const first = modalEl.querySelector('.foot .btn');
  if (first) first.focus();
}

/* Changes of his own, as against the board's own tidy-up on load. Only the
   first kind is worth stopping for. */
function hasOwnChanges(){ return state.dirty && !state.migratedOnly; }

async function reload(){
  if (state.locked) return;
  if (!hasOwnChanges()) return loadFile();
  // Same collision as an outside edit, so it gets the same modal — he can see
  // what he would be throwing away before he throws it away.
  let diskText = null;
  try {
    const res = await fetch(FILE_URL + '?t=' + Date.now(), { cache:'no-store' });
    if (res.ok) diskText = await res.text();
  } catch (err) { /* handled below by the null check */ }
  offerReload(diskText, true);
}

/* The modal both Reload and the outside-edit watcher land in when there is
   something here it would overwrite. diskText may be null if the file could
   not be read, in which case discarding is not offered. */
function offerReload(diskText, manual){
  const mine = describeChanges(state.originalText, serializeDoc(state.doc));
  const theirs = diskText === null ? null : describeChanges(state.originalText, diskText);

  const sub = '<strong>todo.md changed on disk</strong> while you had unsaved changes here. ' +
    'Nothing has been overwritten either way — pick which version wins.';

  const body =
    changesHTML('Your unsaved changes', mine, 'Nothing — your tab matches the file.') +
    (diskText === null
      ? '<div class="changes"><h3>Changed on disk</h3><div class="none">Could not read the file to compare.</div></div>'
      : changesHTML('Changed on disk', theirs, 'Nothing found — the file may only have been re-saved.'));

  const buttons = [{ label:'Keep my changes', primary:true }];
  buttons.push({ label:'Download my copy first', run: () => downloadText(serializeDoc(state.doc), state.fileName) });
  if (diskText !== null) {
    buttons.push({ label:'Discard mine, use the file', danger:true, run: () => {
      try { load(diskText, 'todo.md'); rememberStamp(); closeDrawer(); markClean('reloaded from disk'); }
      catch (err) { alert('Could not read the file on disk: ' + (err.message || err)); }
    }});
  }
  showModal('Two versions of this list', sub, body, buttons);
}

