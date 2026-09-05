'use strict';

/* =========================================================================
   2d. Undo — five steps back, no more
   state.doc is mutated in place everywhere, so the only way to go back is to
   keep whole-document text snapshots and reparse one on request. Five is
   plenty for "I didn't mean that" and cheap to keep — this is Markdown for a
   personal list, not a novel.

   A snapshot is taken the moment a burst of changes starts, not on every
   markDirty() call: typing a title fires markDirty() once per keystroke, and
   one undo step per letter would make the button useless. Instead the text as
   it stood before the burst (undoBaseline) is pushed the first time markDirty
   fires, and a short pause with no further changes closes the burst and moves
   the baseline forward. Two checkboxes ticked half a second apart land in the
   same step — an acceptable coarseness for what this button is for. */
const UNDO_LIMIT = 5;
const UNDO_GAP_MS = 600;
let undoStack = [];
let undoBaseline = '';
let undoTimer = null;

/* Called once per load — a fresh document starts with nothing to undo back
   past, and reparsed text carries fresh task ids anyway (see uid()), so an
   older snapshot would not line up with anything on screen. */
function resetUndo(){
  undoStack = [];
  undoBaseline = state.doc ? serializeDoc(state.doc) : '';
  clearTimeout(undoTimer);
  undoTimer = null;
  updateUndoButton();
}
function noteUndo(){
  if (!state.doc) return;
  if (undoTimer === null) {
    undoStack.push(undoBaseline);
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    updateUndoButton();
  }
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoTimer = null;
    undoBaseline = serializeDoc(state.doc);   // burst settled; this is the next step's floor
  }, UNDO_GAP_MS);
}
function updateUndoButton(){
  const b = $('#undo');
  b.disabled = !undoStack.length;
  b.title = undoStack.length
    ? 'Undo the last change (⌘Z) — ' + undoStack.length + ' step' + (undoStack.length === 1 ? '' : 's') + ' back'
    : 'Nothing to undo';
}
/* Reparsing rather than reversing a diff — simplest, and it's exactly what
   Reload from disk already does. Fresh ids mean the drawer can't stay open on
   whatever was showing, same as any other reparse. */
function undo(){
  if (state.locked || !undoStack.length) return;
  clearTimeout(undoTimer);
  undoTimer = null;
  const text = undoStack.pop();
  closeDrawer();
  state.doc = parseDoc(text);
  undoBaseline = text;
  applyDirty('undone');
  refreshView();
  updateUndoButton();
}
/* auto: the board did this on its own — an auto-save, or a reload the watcher
   ran because the file moved under it — so he may not have been looking when it
   happened. Those carry a relative stamp that keeps itself current, because the
   only question you ask of a message you did not trigger is how long it has been
   sitting there. Messages he asked for keep the clock time: he knows when. */
function markClean(msg, auto){
  state.dirty = false;
  const s = $('#status');
  s.classList.remove('dirty');
  if (auto && msg) { autoStatus(msg); return; }
  statusAgo = null;
  s.textContent = msg;
}

/* The stamp re-renders on a timer rather than being written once, so "just now"
   does not still say that twenty minutes later. */
let statusAgo = null;
function shortAgo(at){
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return mins + ' min ago';
  const hrs = Math.round(mins / 60);
  return hrs === 1 ? 'an hour ago' : hrs + ' hours ago';
}
function autoStatus(msg){
  statusAgo = { at: Date.now(), msg, painted: null };
  paintStatusAgo();
}
function paintStatusAgo(){
  if (!statusAgo) return;
  const s = $('#status');
  // Something else has written to the line since — a save, an archive, the
  // unsaved-changes flag. That message owns the space now, so stand down rather
  // than overwrite it on the next tick.
  if (statusAgo.painted !== null && s.textContent !== statusAgo.painted) { statusAgo = null; return; }
  statusAgo.painted = statusAgo.msg + ' · ' + shortAgo(statusAgo.at);
  s.textContent = statusAgo.painted;
}
setInterval(paintStatusAgo, 30000);

