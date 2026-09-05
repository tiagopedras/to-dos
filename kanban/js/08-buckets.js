'use strict';

/* =========================================================================
   3b. The buckets themselves
   A bucket is a `## N. Name` line in the file and nothing else — no id, no
   record anywhere of which tasks belong to it beyond the fact that they sit
   under it. So renaming one is a rewrite of that single line, and reordering
   is a rewrite of the numbers on all of them. Nothing about a task changes
   either way, which is why this can be a small feature rather than a migration.
   ========================================================================= */

/* The number in the heading *is* the position, so anything that moves, adds or
   removes a bucket has to restate it. Dropping `raw` is what lets serializeDoc
   rebuild the line from num and name instead of handing back the one it read. */
function renumberBuckets(){
  state.doc.buckets.forEach((b, i) => {
    const num = String(i + 1);
    if (b.num !== num) { b.num = num; b.raw = null; }
  });
}
function bucketTaskCount(b){ return b.tiers.reduce((m, t) => m + t.tasks.length, 0); }
/* Returns the bucket already holding the name, so the complaint can quote what
   is actually in the file rather than the capitalisation just typed at it. */
function bucketNameTaken(name, except){
  const k = name.toLowerCase();
  return state.doc.buckets.find(b => b !== except && b.name.toLowerCase() === k) || null;
}
/* One name, tidied the same way wherever it arrives from. A heading cannot carry
   a line break, and two spaces in the middle of a bucket name are a typo rather
   than a decision. */
function cleanBucketName(name){ return String(name).replace(/\s+/g, ' ').trim(); }

/* Each of these returns an error to show, or '' when it went through. The board
   is redrawn here rather than by the caller, because a rename changes the tab
   strip and the label on every card in that bucket. */
function renameBucket(b, name){
  const clean = cleanBucketName(name);
  if (!clean) return 'A bucket needs a name.';
  if (clean === b.name) return '';
  const clash = bucketNameTaken(clean, b);
  if (clash) return 'There is already a bucket called \u201c' + clash.name + '\u201d.';
  const was = b.name;
  b.name = clean;
  b.raw = null;
  // activeBucket is held by name, so the tab he is looking at has to follow it.
  if (state.activeBucket === was) state.activeBucket = clean;
  markDirty(); refreshView();
  return '';
}

function addBucket(name){
  const clean = cleanBucketName(name);
  if (!clean) return 'A bucket needs a name.';
  const clash = bucketNameTaken(clean, null);
  if (clash) return 'There is already a bucket called \u201c' + clash.name + '\u201d.';
  /* Born with the same columns as its siblings, all empty. A bucket with no
     `###` headings parses and draws perfectly well — ensureTier writes one the
     first card it gets — but the file is also read in Obsidian and by the
     checker, and there a bucket shaped unlike the rest reads as half-written.
     The closing rule matches what the other buckets end with, so the heading
     lands below the last one's rule and above whatever follows the buckets. */
  const tiers = allTiers().map(n => ({ name: n, raw: null, lead: [''], tasks: [], tail: [] }));
  // The blank line the closing rule sits under belongs to the last column, which
  // is where the parser puts it when it reads one of the buckets already there.
  if (tiers.length) tiers[tiers.length - 1].tail = [''];
  state.doc.buckets.push({ num: String(state.doc.buckets.length + 1), name: clean, raw: null,
                           intro: [''], tiers, tail: ['---', ''] });
  renumberBuckets();
  markDirty(); refreshView();
  return '';
}

/* Deleting a bucket must never delete work, so one with tasks in it can only go
   once they have somewhere to land. Each task keeps its column and its own text
   verbatim: this is the move the drawer's Bucket field already makes, done for
   every task in the bucket at once. */
function deleteBucket(b, dest){
  const list = state.doc.buckets;
  // The board cannot draw a list with no buckets, and load() refuses to read one.
  if (list.length < 2) return;
  const n = bucketTaskCount(b);
  if (n && !dest) return;
  if (n) b.tiers.forEach(tier => tier.tasks.forEach(t => ensureTier(dest, tier.name).tasks.push(t)));
  list.splice(list.indexOf(b), 1);
  renumberBuckets();
  if (state.activeBucket === b.name) state.activeBucket = dest ? dest.name : ALL_BUCKETS;
  markDirty(); refreshView();
}

/* Two different questions, so two different sheets. Empty, deleting a bucket
   costs a heading. With tasks in it, the only safe delete is a move, so it asks
   where they go and says how many are going there. */
/* Two different questions, so two different sheets \u2014 empty, the heading just
   goes; holding work, the only safe delete is a move, so it asks where to
   first. A bucket and a tier are the same shape of thing with different
   labels, and this is the mechanical half they share: the button footer, the
   empty/holding-work split, and the destination select's own wiring \u2014 read as
   it changes rather than when the button is pressed, since showModal takes
   the sheet down before it runs the choice, so by then the select is gone.
   The wording, which differs in the details, is still written out in full by
   each caller rather than assembled from fragments here. */
function confirmDeleteHeading(cfg){
  const { title, count, emptyBody, moveBody, options, optionLabel, selectId, onDelete, back } = cfg;
  if (!count) {
    showModal(title, emptyBody, '',
      [{ label: 'Keep it', run: back },
       { label: 'Delete it', danger: true, run: () => { onDelete(null); back(); } }]);
    return;
  }
  let dest = options[0];
  showModal(title, moveBody,
    '<label class="field"><span>Move its tasks to</span><select id="' + selectId + '">' +
      options.map((x, i) => '<option value="' + i + '">' + esc(optionLabel(x)) + '</option>').join('') +
    '</select></label>',
    [{ label: 'Keep it', run: back },
     { label: 'Move ' + count + ' and delete', danger: true, run: () => { onDelete(dest); back(); } }]);
  const sel = modalEl.querySelector('#' + selectId);
  sel.onchange = () => { dest = options[+sel.value]; };
}

function confirmDeleteBucket(b, back){
  const n = bucketTaskCount(b);
  confirmDeleteHeading({
    title: 'Delete \u201c' + b.name + '\u201d?',
    count: n,
    emptyBody: 'Nothing is in it. The heading goes, the buckets below it renumber, and none of it ' +
      'reaches the file until you save.',
    moveBody: 'It still holds ' + n + ' task' + (n === 1 ? '' : 's') + ', finished ones included. They move ' +
      'rather than go \u2014 each one keeps its column, its text and its tags, and lands in the ' +
      'bucket you pick here.',
    options: state.doc.buckets.filter(x => x !== b),
    optionLabel: x => x.name,
    selectId: 'bkDest',
    onDelete: dest => deleteBucket(b, dest),
    back
  });
}

/* The move-up/move-down/delete trio both list editors below draw for every
   row — identical in shape, different only in which data attribute each
   button carries and in the two bits of wording that are genuinely different
   between a bucket and a column (a column reads left-to-right on the board,
   a bucket does not; "one bucket" isn't "one column"). */
function moveDeleteButtonsHTML(i, len, opts){
  return '<button class="btn mini" ' + opts.upAttr + '="' + i + '" title="' + opts.upTitle + '" aria-label="Move up"' +
      (i === 0 ? ' disabled' : '') + '>↑</button>' +
    '<button class="btn mini" ' + opts.downAttr + '="' + i + '" title="' + opts.downTitle + '" aria-label="Move down"' +
      (i === len - 1 ? ' disabled' : '') + '>↓</button>' +
    '<button class="btn mini danger" ' + opts.delAttr + '="' + i + '"' +
      (len < 2 ? ' disabled title="A list needs at least one ' + opts.noun + '"' : '') +
      '>Delete</button>';
}

/* The editor is one sheet holding every bucket, because the questions it answers
   are comparative — is this the right name next to the other three, is this the
   right order. A per-bucket menu on each tab could not show that. */
function openBucketEditor(){
  if (state.locked || !state.doc) return;
  /* An open task drawer behind this is stale the moment a bucket is renamed —
     its Bucket field lists the old name — and it is the wrong altitude anyway. */
  closeDrawer();

  const setErr = msg => { const el = modalEl && modalEl.querySelector('.bkerr'); if (el) el.textContent = msg; };

  const draw = () => {
    const list = state.doc.buckets;
    const rows = list.map((b, i) => {
      const n = bucketTaskCount(b);
      return '<div class="bkrow">' +
        '<span class="bknum">' + (i + 1) + '</span>' +
        '<i class="bkdot" style="background:' + BUCKET_COLOR[i % BUCKET_COLOR.length] + '"></i>' +
        '<input type="text" data-name="' + i + '" value="' + esc(b.name) + '" aria-label="Bucket name">' +
        '<span class="bkn" title="tasks in it, finished ones included">' + n + '</span>' +
        moveDeleteButtonsHTML(i, list.length, {
          upAttr: 'data-up', downAttr: 'data-down', delAttr: 'data-del',
          upTitle: 'Move up', downTitle: 'Move down', noun: 'bucket'
        }) +
      '</div>';
    }).join('');

    showModal('Buckets',
      'The headings your list is organised under. A rename rewrites that one heading in ' +
      esc(state.fileName) + ' and leaves every task under it alone. The number and the colour ' +
      'follow the order, so moving a bucket renumbers the ones it passes. Nothing reaches the ' +
      'file until you save.',
      '<div class="bklist">' + rows + '</div>' +
      '<div class="bkadd">' +
        '<input type="text" id="bkNew" placeholder="New bucket name" aria-label="New bucket name">' +
        '<button class="btn" id="bkAdd">Add bucket</button>' +
      '</div>' +
      '<p class="bkerr" role="status"></p>',
      [{ label: 'Done', primary: true }]);
    wire();
  };

  const wire = () => {
    const list = state.doc.buckets;
    modalEl.querySelectorAll('input[data-name]').forEach(inp => {
      const b = list[+inp.dataset.name];
      /* A rejected name is not redrawn away: he keeps what he typed, with the
         reason under it, because the fix is usually one character. */
      const apply = () => {
        const msg = renameBucket(b, inp.value);
        if (msg) { setErr(msg); }
        else { setErr(''); inp.value = b.name; }
      };
      inp.onchange = apply;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };
    });
    modalEl.querySelectorAll('[data-up]').forEach(el => {
      el.onclick = () => { moveBucket(list[+el.dataset.up], -1); draw(); };
    });
    modalEl.querySelectorAll('[data-down]').forEach(el => {
      el.onclick = () => { moveBucket(list[+el.dataset.down], 1); draw(); };
    });
    modalEl.querySelectorAll('[data-del]').forEach(el => {
      el.onclick = () => confirmDeleteBucket(list[+el.dataset.del], draw);
    });
    const add = () => {
      const inp = modalEl.querySelector('#bkNew');
      const msg = addBucket(inp.value);
      if (msg) setErr(msg); else draw();
    };
    modalEl.querySelector('#bkAdd').onclick = add;
    modalEl.querySelector('#bkNew').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  };

  draw();
}

function moveBucket(b, dir){
  const list = state.doc.buckets;
  const i = list.indexOf(b), j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  list.splice(i, 1);
  list.splice(j, 0, b);
  renumberBuckets();
  markDirty(); refreshView();
}

