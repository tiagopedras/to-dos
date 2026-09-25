'use strict';

/* =========================================================================
   Conflict modal
   ========================================================================= */

/* The open modal's outermost node (Tenon's .tenon-modal), or null. Callers
   query their own body through it straight after showModal() returns. */
let modalEl = null;
/* The node the React root lives on. The Modal portals to body beside it. */
let modalHost = null;
/* Set by a modal whose body is a React tree, so shutting it lets the tree go
   rather than leaving a root subscribed to a node that has left the page. */
let modalOnClose = null;

function closeModal(){
  if (modalHost) { BoardUI.unmountBoardModal(modalHost); modalHost.remove(); modalHost = null; }
  modalEl = null;
  if (modalOnClose) { const done = modalOnClose; modalOnClose = null; done(); }
}

/* buttons: [{ label, primary, danger, agree, reject, run }] — the first is the
   safe default, and takes focus. The × in the head, the scrim and Escape all
   close without running anything. ⌘↵ / Ctrl+↵ presses the primary button, but
   only from inside a text field, so a plain confirmation like offerReload()'s
   cannot be answered by a stray shortcut aimed at something else. Tenon's
   Modal does both; this function only says what the buttons run.
   opts: { wide, cls, onClose } — wide is the document-width variant a written
   report opens in, rather than the confirmation-sized default; cls is one more
   class on the box, for a modal with a body shape of its own (the plan
   reader); onClose runs once when the modal goes, whichever way it goes.
   The body is drawn into .mid, which callers query. */
function showModal(heading, sub, bodyHTML, buttons, opts){
  closeModal();
  modalOnClose = (opts && opts.onClose) || null;
  modalHost = document.createElement('div');
  document.body.appendChild(modalHost);
  modalEl = BoardUI.mountBoardModal(modalHost, {
    heading, subHTML: sub || '', bodyHTML, wide: !!(opts && opts.wide), cls: (opts && opts.cls) || '',
    buttons: buttons.map(b => ({ label: b.label, primary: !!b.primary, danger: !!b.danger, agree: !!b.agree, reject: !!b.reject })),
    onPick: i => { const b = buttons[i]; closeModal(); if (b.run) b.run(); },
    onClose: closeModal,
  });
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

