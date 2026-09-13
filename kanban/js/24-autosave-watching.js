'use strict';

/* =========================================================================
   Auto-save and watching the file

   Two jobs that share one fact: what the file on disk looked like the last time
   this tab agreed with it. Last-Modified is enough — the board is the only
   thing writing, so a changed timestamp means a real change.
   ========================================================================= */

/* No toggle and no button any more — a change on a card, in the sidebar or on
   the board, saves to disk on its own within a few seconds. That is the one
   behaviour now, not an option someone could switch off and forget. */
const AUTOSAVE_MS = 4 * 1000;
const WATCH_MS = 15 * 1000;
let conflictShown = false;

/* One HEAD, both answers: the timestamp and the content hash the server sends
   with every read of todo.md. Returns nulls rather than throwing when the
   helper is down, which is the shape every caller here already copes with. */
async function diskVersion(){
  try {
    const res = await fetch(FILE_URL, { method:'HEAD', cache:'no-store' });
    if (!res.ok) return { stamp:null, hash:null };
    return { stamp: res.headers.get('Last-Modified') || null,
             hash:  res.headers.get('X-Todo-Hash') || null };
  } catch (err) { return { stamp:null, hash:null }; }
}
async function diskStamp(){ return (await diskVersion()).stamp; }
async function rememberStamp(){
  const v = await diskVersion();
  state.diskStamp = v.stamp;
  state.diskHash = v.hash;
}

/* Saves only when there is something to save, so an idle tab never touches the
   file and never triggers a backup for no reason. The clock runs from the last
   save, so a manual save (⌘S) also resets the four seconds.

   Checked twice a second rather than on the save interval itself, so a change
   made just after a tick still lands within roughly one interval rather than
   waiting out a second one. Runs regardless of what has focus — a title or
   notes field mid-edit already holds its new value in state.doc, so saving
   under it is safe, and holding off until the field is blurred is exactly the
   wait he asked to remove. */
let lastSaveAt = Date.now();
async function autosaveTick(){
  if (state.locked || !state.doc || !state.dirty || modalEl) return;
  if (Date.now() - lastSaveAt < AUTOSAVE_MS) return;
  await saveFile(true);
}

/* Picks up edits made outside the board — Claude working through the list, or
   the file being changed in an editor. With nothing of his unsaved here,
   reloading is free, so it happens quietly and says so afterwards rather than
   asking first. Only his own unsaved work turns it into a question. */
async function watchTick(){
  if (state.locked || !state.doc || modalEl || conflictShown) return;
  const { stamp, hash } = await diskVersion();
  if (!stamp) return;                              // helper stopped; saveFile reports that
  if (!state.diskStamp) { state.diskStamp = stamp; state.diskHash = hash; return; }
  /* The hash is the better question where both sides have one — it answers
     "did the bytes change" rather than "did the second change" — and the stamp
     is the fallback for a server from before X-Todo-Hash existed. */
  const moved = (hash && state.diskHash) ? hash !== state.diskHash : stamp !== state.diskStamp;
  if (!moved) { state.diskStamp = stamp; state.diskHash = hash; return; }

  if (!hasOwnChanges()) {
    try {
      const res = await fetch(FILE_URL + '?t=' + Date.now(), { cache:'no-store' });
      if (!res.ok) return;
      const text = await res.text();
      if (text === state.originalText) { state.diskStamp = stamp; state.diskHash = hash; return; }
      const changes = describeChanges(state.originalText, text);
      closeDrawer();                               // ids are rebuilt by the parse
      load(text, 'todo.md');
      state.diskStamp = stamp;
      state.diskHash = hash;
      const n = changes ? changes.length : 0;
      const note = 'reloaded — the file changed on disk' +
        (n ? ' (' + n + ' task' + (n > 1 ? 's' : '') + ')' : '');
      // The fresh parse may have re-run the load-time tidy-up, which is a real
      // pending save. Say what happened without clearing it.
      if (state.migratedOnly) autoStatus(note); else markClean(note, true);
    } catch (err) { /* try again on the next tick */ }
    return;
  }

  // Unsaved work here and a changed file there: his call, not the board's.
  conflictShown = true;
  let diskText = null;
  try {
    const res = await fetch(FILE_URL + '?t=' + Date.now(), { cache:'no-store' });
    if (res.ok) diskText = await res.text();
  } catch (err) { /* offerReload copes with null */ }
  state.diskStamp = stamp;                         // asked once per outside change
  state.diskHash = hash;
  conflictShown = false;
  offerReload(diskText);
}

