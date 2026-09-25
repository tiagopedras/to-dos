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
  // bucketFilter is held by name, so a toggled-on tab has to follow it.
  if (state.bucketFilter.has(was)) { state.bucketFilter.delete(was); state.bucketFilter.add(clean); }
  /* A rename must not move the bucket's brief, its folder or its planner. The
     stream is fixed when a bucket is created and pinned in buckets/README.md,
     so this moves that row onto the new heading and changes nothing else on
     disk — without it, `bucket_stream()` would slugify the new heading and the
     bucket would silently acquire a stream with no brief behind it. */
  scaffoldBucket(clean, { was });
  markDirty(); refreshView();
  return '';
}

/* Tell the server a bucket exists, so it has somewhere for its brief to live.
   Fire and forget: the bucket is already in the document either way, and a
   server one version behind answers 404 rather than failing the rename. */
async function scaffoldBucket(name, opts){
  try {
    await postJSON('/bucket/scaffold', Object.assign({ name }, opts || {}));
  } catch (err) {
    showToast('The bucket is there, but its brief could not be set up: ' +
              (err.message || err), 'bad');
  }
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
  /* Same action as naming a bucket when the list was created, so it writes the
     same things: the folder, the brief from BUCKETS.md's template, and the row
     in buckets/README.md that pins the stream. */
  scaffoldBucket(clean);
  /* Picked and saved now rather than left to the positional fallback, so the
     colour is this bucket's own from the start and reordering it later never
     moves it — the same guarantee a manual pick already gets, just made
     automatic for a bucket that never asks for one. The first swatch no
     other bucket already holds; once all ten are claimed twice over, a new
     bucket falls back to the position rule same as before this existed. */
  const taken = new Set(Object.values(state.bucketColors || {}));
  const swatch = BUCKET_COLOR.find(c => !taken.has(c));
  if (swatch) setBucketColor(state.doc.buckets[state.doc.buckets.length - 1], swatch);
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
  if (state.bucketFilter.has(b.name)) {
    state.bucketFilter.delete(b.name);
    if (dest) state.bucketFilter.add(dest.name);
  }
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

/* The delete button both list editors below draw for every row — identical
   in shape, different only in which data attribute it carries and the noun
   in its disabled title. Reordering is a drag by the grip now, not a button. */
function deleteButtonHTML(i, len, opts){
  return '<button class="btn small danger" ' + opts.delAttr + '="' + i + '"' +
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

  /* The one-line summary shown on each row lives in the bucket's own brief
     file, not in todo.md, so it has to be fetched rather than read off
     state.doc. Keyed by bucket name and reloaded whenever a brief might have
     changed under it — on open, and after the Brief sheet closes — rather
     than kept in step token by token, since it is read far more often than
     it is written. */
  let summaries = {};
  async function loadSummaries(){
    const list = state.doc.buckets;
    const pairs = await Promise.all(list.map(async b => {
      try {
        const brief = await getJSON('/bucket-brief.json?bucket=' + encodeURIComponent(b.name));
        return [b.name, parseBriefText(brief.text).summary];
      } catch (err) { return [b.name, '']; }
    }));
    summaries = Object.fromEntries(pairs);
  }

  const draw = () => {
    const list = state.doc.buckets;
    const rows = list.map((b, i) => {
      const color = bucketColor(b.name, i);
      /* The dot opens a palette of the board's own ten swatches rather than a
         free colour input — a bucket picks from the same set every other
         bucket colour on the board is drawn from, so two of them can never
         land on a colour close enough to be mistaken for one another. Picking
         one writes state.bucketColors straight away (see setBucketColor
         below); nothing about a colour waits for Done. */
      const palette = BUCKET_COLOR.map(c =>
        '<button type="button" class="bkswatch' + (c === color ? ' on' : '') + '" data-pick="' + i +
          '" data-swatch="' + esc(c) + '" style="background:' + c + '" aria-label="Use this colour"></button>'
      ).join('');
      return '<div class="bkrow" data-tenon-reorder="' + i + '">' +
        BoardUI.dragHandleHTML() +
        '<span class="bknum">' + (i + 1) + '</span>' +
        '<span class="bkcolor">' +
          '<button type="button" class="bkpick" data-palette="' + i + '" style="background:' + color +
            '" title="Change this bucket’s colour" aria-label="Change this bucket’s colour"></button>' +
          '<div class="bkpalette hidden" data-palette-for="' + i + '">' + palette + '</div>' +
        '</span>' +
        '<input type="text" data-name="' + i + '" value="' + esc(b.name) + '" aria-label="Bucket name">' +
        '<input type="text" class="bksummary" data-summary="' + i + '" value="' + esc(summaries[b.name] || '') +
          '" placeholder="What kind of work lands here" aria-label="What this bucket is for, from its brief">' +
        /* The sub-organisation inside this bucket — `[theme:: ]` on the task
           line — comma-separated here rather than one row per value, the way
           a short, freely-edited list is typed everywhere else on this board
           (blocked-by, people.md). Empty is a normal state: most buckets have
           no themes, and the Theme field simply does not appear on their
           tasks. */
        '<input type="text" class="bkthemes" data-themes="' + i + '" value="' +
          esc((state.bucketThemes[b.name] || []).join(', ')) +
          '" placeholder="Themes: comma-separated, e.g. audits, docs" ' +
          'aria-label="This bucket’s themes, comma-separated">' +
        /* The brief is the only thing on this row that is not a property of
           the bucket as the board draws it — it is a file, and a page of
           prose — so it is a button to somewhere rather than a control here.
           See openBucketBrief. */
        '<button type="button" class="btn small" data-brief="' + i + '" ' +
          'title="What the agents read for what this bucket’s work actually is">Brief</button>' +
        deleteButtonHTML(i, list.length, { delAttr: 'data-del', noun: 'bucket' }) +
      '</div>';
    }).join('');

    showModal('Buckets',
      'The headings your list is organised under. A rename rewrites that one heading in ' +
      esc(state.fileName) + ' and leaves every task under it alone. The number follows the ' +
      'order, so moving a bucket renumbers the ones it passes — the colour follows the dot ' +
      'instead, so reordering never reshuffles it. The summary is the one-line opener of the ' +
      'bucket’s own brief, editable here too. Themes are this bucket’s own sub-organisation — ' +
      'leave it empty for a bucket that has none, and a Theme field appears on its tasks the ' +
      'moment it does. Nothing reaches the file until you save; a colour, a summary and the ' +
      'themes save themselves the moment you change them, and Brief opens the rest of that file.',
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
    modalEl.querySelectorAll('input[data-summary]').forEach(inp => {
      const b = list[+inp.dataset.summary];
      const apply = async () => {
        const val = inp.value;
        if (val === (summaries[b.name] || '')) return;
        try {
          const brief = await getJSON('/bucket-brief.json?bucket=' + encodeURIComponent(b.name));
          const parts = parseBriefText(brief.text);
          // A brief that has never been saved opens on the template, which
          // carries the marker too — not just one that exists on disk and
          // still has it (brief.filled covers the marker alone).
          const wasEmpty = !brief.exists || !brief.filled;
          parts.summary = val;
          const text = serializeBriefText(parts, keepBriefMarker(wasEmpty, parts));
          await putJSON('/bucket-brief', { bucket: b.name, text });
          summaries[b.name] = val;
        } catch (err) {
          showToast('Could not save that summary: ' + (err.message || err), 'bad');
        }
      };
      inp.onchange = apply;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
    });
    modalEl.querySelectorAll('input[data-themes]').forEach(inp => {
      const apply = () => {
        const b = list[+inp.dataset.themes];
        setBucketThemes(b, inp.value.split(','));
      };
      inp.onchange = apply;
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
    });
    BoardUI.bindReorder(modalEl.querySelector('.bklist'), {
      onMove: (key, beforeKey) => {
        moveBucketTo(list[+key], beforeKey == null ? null : list[+beforeKey]);
        draw();
      }
    });
    modalEl.querySelectorAll('[data-del]').forEach(el => {
      el.onclick = () => confirmDeleteBucket(list[+el.dataset.del], draw);
    });
    modalEl.querySelectorAll('[data-brief]').forEach(el => {
      el.onclick = () => openBucketBrief(list[+el.dataset.brief].name, async () => {
        await loadSummaries();
        draw();
      });
    });
    modalEl.querySelectorAll('[data-palette]').forEach(dot => {
      dot.onclick = e => {
        e.stopPropagation();
        const pal = modalEl.querySelector('[data-palette-for="' + dot.dataset.palette + '"]');
        const already = !pal.classList.contains('hidden');
        modalEl.querySelectorAll('.bkpalette').forEach(p => p.classList.add('hidden'));
        pal.classList.toggle('hidden', already);
      };
    });
    modalEl.querySelectorAll('[data-pick]').forEach(sw => {
      sw.onclick = e => {
        e.stopPropagation();
        setBucketColor(list[+sw.dataset.pick], sw.dataset.swatch);
        draw();
      };
    });
    // Anywhere else in the sheet closes whichever palette is open — the same
    // click-away a native <select> gets for free. modalEl's own onclick
    // already closes the whole modal on a backdrop click (23-conflict-modal.js)
    // and is a single assignment, so this listens on the sheet inside it
    // rather than overwriting that.
    modalEl.querySelector('.sheet').addEventListener('click', () => {
      modalEl.querySelectorAll('.bkpalette').forEach(p => p.classList.add('hidden'));
    });
    const add = () => {
      const inp = modalEl.querySelector('#bkNew');
      const msg = addBucket(inp.value);
      if (msg) setErr(msg); else draw();
    };
    modalEl.querySelector('#bkAdd').onclick = add;
    modalEl.querySelector('#bkNew').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  };

  loadSummaries().then(draw);
}

/* The four section headings BUCKETS.md's template carries, in the order the
   template writes them. Fixed, since the brief editor below reassembles a
   file in exactly this shape and a heading typed differently in a hand-edited
   brief would otherwise fall out of every section and land nowhere. */
const BRIEF_SECTIONS = [
  'The processes I run in this bucket',
  'What already does it',
  'Who is involved',
  'What good looks like here'
];
// The empty-marker line and the note under it, deleted together the moment a
// section that used to hold nothing gets typed into — see keepBriefMarker().
const BRIEF_MARKER = '<!-- NOT FILLED IN YET -->';

/* Splits a brief's whole text into its named parts: the title line, the
   one-line summary under it, and each of BRIEF_SECTIONS as a trimmed body.
   Marker and note lines are dropped here — keepBriefMarker() is what decides
   whether they come back on save. Tolerant of a brief that predates a
   section (missing sections read as ''), since a hand-edited or very old
   brief should still open rather than losing whatever text it does carry. */
function parseBriefText(text){
  const lines = String(text || '').split('\n');
  let i = 0;
  const title = (lines[i] || '').replace(/^#\s*/, '').trim(); i++;
  while (lines[i] === '') i++;
  let summary = '';
  if (lines[i] !== undefined && !lines[i].startsWith('#') && !lines[i].startsWith('>') &&
      lines[i].trim() !== BRIEF_MARKER) {
    summary = lines[i].trim(); i++;
  }
  const rest = lines.slice(i).join('\n');
  const sections = {};
  BRIEF_SECTIONS.forEach((name, idx) => {
    const re = new RegExp(
      '^##\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'm');
    const m = re.exec(rest);
    if (!m) { sections[name] = ''; return; }
    const from = m.index + m[0].length;
    const nextHeading = /^##\s+/m.exec(rest.slice(from));
    const to = nextHeading ? from + nextHeading.index : rest.length;
    sections[name] = rest.slice(from, to).trim();
  });
  return { title, summary, sections };
}

/* The inverse of parseBriefText — rebuilds the file in the template's own
   shape so a round trip through the structured fields changes nothing but
   the words typed into them. The marker and its explaining note are written
   back only when told to (see keepBriefMarker), never decided here. */
function serializeBriefText(parts, keepMarker){
  let body = '# ' + parts.title + '\n\n' + parts.summary + '\n\n';
  if (keepMarker) {
    body += BRIEF_MARKER + '\n\n' +
      '> Delete the line above once this is written. While it is there, no agent is\n' +
      '> pointed at this file.\n\n';
  }
  BRIEF_SECTIONS.forEach(name => {
    body += '## ' + name + '\n\n' + (parts.sections[name] || '') + '\n\n';
  });
  return body.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* A brief starts with the marker on, since it opens on the template. It comes
   off the moment any section that used to be empty has something in it —
   the same "he wrote something real" signal the server's own brief_text()
   uses for the one-line summary, applied here to the four sections too, so
   he never has to remember to delete the line by hand. */
function keepBriefMarker(wasEmpty, parts){
  return wasEmpty && !BRIEF_SECTIONS.some(name => (parts.sections[name] || '').trim());
}

/* The brief behind a bucket: `data/<dataset>/buckets/<stream>/<stream>.md`,
   the file both planning agents and the implementing agent read for what a
   bucket's work actually is. The editor above renames, colours, reorders and
   deletes, and until now touched none of it — the file existed only to
   someone who opened it outside the board.

   A sheet of its own rather than a sixth control on the row, because it is a
   page of prose rather than a property. showModal replaces whatever is open,
   so Save and Cancel both draw the bucket editor again on the way out; the ×
   and Escape close to the board, which is what both mean everywhere else.

   Read fresh every time it opens and written whole. Nothing else writes it
   while the board is up, and the board holds no copy of it between openings,
   so there is nothing here of todo.md's preconditions. */
/* A field per part rather than one textarea, so writing a brief means filling
   in what BUCKETS.md's template asks for rather than remembering its shape.
   Held here rather than re-read from the DOM on save, for the same reason the
   single textarea used to be: showModal closes the sheet before running a
   button, so the fields are gone by the time one runs. */
let briefParts = { title: '', summary: '', sections: {} };
let briefWasEmpty = false;
async function openBucketBrief(bucketName, back){
  let brief;
  try {
    brief = await getJSON('/bucket-brief.json?bucket=' + encodeURIComponent(bucketName));
  } catch (err) {
    showToast('Could not read that brief — the board helper may need restarting. ' +
      (err.message || err), 'bad');
    return;
  }
  briefParts = parseBriefText(brief.text);
  // A brief that has never been saved opens on the template, which carries
  // the marker too — not just one that exists on disk and still has it.
  briefWasEmpty = !brief.exists || !brief.filled;

  const marker = brief.marker || '';
  /* Three things worth knowing before typing, and only when each is true: a
     brief that does not exist yet, one that is still the untouched template,
     and a bucket whose heading is mapped to nothing — the last is the one
     that explains why two buckets can open the same file. */
  const notes =
    (brief.exists
      ? ''
      : '<p>No brief yet. This opens on the template from <code>BUCKETS.md</code>, ' +
        'and saving writes the file.</p>') +
    (brief.exists && !brief.filled
      ? '<p>This one still carries <code>' + esc(marker) + '</code>, so no agent is ' +
        'pointed at it. Filling in a section clears it automatically.</p>'
      : '') +
    (brief.fallback
      ? '<p>This bucket’s heading is mapped to the <strong>' + esc(brief.stream) +
        '</strong> fallback rather than a stream of its own, so this is the ' +
        'catch-all brief — every unmapped bucket reads it.</p>'
      : '');

  const sectionFields = BRIEF_SECTIONS.map((name, i) =>
    '<label class="field briefsection">' +
      '<span>' + esc(name) + '</span>' +
      '<textarea data-brief-section="' + i + '" spellcheck="false" ' +
        'aria-label="' + esc(name) + '">' + esc(briefParts.sections[name] || '') + '</textarea>' +
    '</label>'
  ).join('');

  showModal('Brief: ' + bucketName,
    'What the planning agents and the implementing agent read for the work in this ' +
    'bucket — the processes it holds, what each produces, which skill already ' +
    'does it, and who is involved. Markdown, saved to <code>' + esc(brief.path) + '</code>.',
    '<div class="repdoc">' + notes + '</div>' +
    '<label class="field"><span>One line: what kind of work lands here</span>' +
      '<input type="text" id="briefSummary" value="' + esc(briefParts.summary) + '" ' +
        'aria-label="What kind of work lands in this bucket"></label>' +
    sectionFields,
    [{ label:'Cancel', run: () => { if (back) back(); } },
     { label:'Save brief', primary:true, run: async () => {
        try {
          const text = serializeBriefText(briefParts, keepBriefMarker(briefWasEmpty, briefParts));
          const res = await putJSON('/bucket-brief', { bucket: bucketName, text });
          showToast(res.filled ? 'Brief saved.'
            : 'Brief saved — still carrying the empty marker, so no agent reads it yet.',
            res.filled ? '' : 'bad');
        } catch (err) {
          showToast('Could not save that brief: ' + (err.message || err), 'bad');
        }
        if (back) back();
      } }],
    { wide: true });

  /* Read as he types. showModal closes the sheet before running a button, so
     the fields are gone by the time one runs — the same reason declinePlan()
     and replanPlan() keep theirs in a variable. */
  const summaryBox = modalEl && modalEl.querySelector('#briefSummary');
  if (summaryBox) summaryBox.oninput = () => { briefParts.summary = summaryBox.value; };
  const sectionBoxes = modalEl ? modalEl.querySelectorAll('[data-brief-section]') : [];
  sectionBoxes.forEach(box => {
    const name = BRIEF_SECTIONS[+box.dataset.briefSection];
    box.oninput = () => { briefParts.sections[name] = box.value; };
  });
  if (summaryBox) { summaryBox.focus(); summaryBox.setSelectionRange(0, 0); }
}

/* The one write a colour makes — straight to bucket-colors.json, independent
   of Done and of todo.md entirely. Optimistic: the swatch and every other
   colour on the board update immediately, and a failed save says so rather
   than silently reverting, since state.bucketColors already has the pick in
   it either way and a second attempt is just picking it again. */
async function setBucketColor(b, swatch){
  state.bucketColors[b.name] = swatch;
  refreshView();
  try {
    await postJSON('/bucket-colors', state.bucketColors);
  } catch (err) {
    showToast('Could not save that colour: ' + (err.message || err), 'bad');
  }
}

/* Loaded once, alongside the other per-dataset side files (see boot.js) — a
   colour with nothing chosen for it just falls back to its position in the
   list, so a server too old to know this route, or a first run with no file
   yet, costs nothing. */
/* bucket-colors.json holds the swatch as the literal string the picker wrote,
   and until 19 Sep 2026 that string was `var(--b4)`. The board reads Tenon's
   names now, so a file written before then names a variable nothing defines,
   and a bucket that had chosen a colour silently loses it — the one failure
   mode a var() has. Translated on the way in rather than migrated on disk:
   data/ is his, one writer touches it, and a rename in the stylesheet is not
   a reason to rewrite a file he owns. Drop this once no dataset is old enough
   to need it. */
const LEGACY_SWATCH = /^var\(--b(10|[1-9])\)$/;

function currentSwatch(value){
  const m = typeof value === 'string' && value.match(LEGACY_SWATCH);
  return m ? 'var(--tenon-chart-' + m[1] + ')' : value;
}

async function loadBucketColors(){
  try {
    const raw = await getJSON('/bucket-colors.json');
    state.bucketColors = Object.fromEntries(
      Object.entries(raw || {}).map(([name, swatch]) => [name, currentSwatch(swatch)]));
  } catch (err) {
    state.bucketColors = {};
  }
  if (state.doc) refreshView();
}

/* The one write a bucket's theme list makes — straight to bucket-themes.json,
   the same bargain setBucketColor() makes for a colour. Optimistic: the
   dropdown offering it and the pills under the bucket strip update
   immediately, and a failed save says so rather than reverting, since
   state.bucketThemes already has the new list either way. */
async function setBucketThemes(b, themes){
  const clean = themes.map(s => s.trim()).filter(Boolean);
  if (clean.length) state.bucketThemes[b.name] = clean;
  else delete state.bucketThemes[b.name];
  refreshView();
  try {
    await postJSON('/bucket-themes', state.bucketThemes);
  } catch (err) {
    showToast('Could not save that bucket’s themes: ' + (err.message || err), 'bad');
  }
}

/* Loaded once alongside bucket-colors.json — see loadBucketColors above and
   boot.js. A server too old to know the route, or a first run with no file
   yet, leaves every bucket with no themes declared, which is what it always
   had: no Theme field in the drawer and no pills under the bucket strip. */
async function loadBucketThemes(){
  try {
    const raw = await getJSON('/bucket-themes.json');
    state.bucketThemes = Object.fromEntries(
      Object.entries(raw || {}).map(([name, list]) => [name, Array.isArray(list) ? list : []]));
  } catch (err) {
    state.bucketThemes = {};
  }
  if (state.doc) refreshView();
}

/* Put `b` just before `beforeB`, or at the end when `beforeB` is null — the
   position bindReorder hands back from a drop, rather than a step of ±1. */
function moveBucketTo(b, beforeB){
  const list = state.doc.buckets;
  const i = list.indexOf(b);
  if (i < 0 || b === beforeB) return;
  list.splice(i, 1);
  const j = beforeB ? list.indexOf(beforeB) : list.length;
  list.splice(j < 0 ? list.length : j, 0, b);
  renumberBuckets();
  markDirty(); refreshView();
}

