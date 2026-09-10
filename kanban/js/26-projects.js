'use strict';

/* =========================================================================
   4c. Projects — every folder under data/projects/, not just the ones a
   task happens to name.

   taskProject()/projectTasks() (06-dates-substeps.js) only ever discover a
   project folder through a task's own "- Project: data/projects/<name>"
   note — a folder nothing points at yet, or any more, was invisible. This
   view is the read that was missing: /projects.json (kanban/server.py) lists
   the folder itself. Live vs orphaned is still worked out here rather than
   on the server, because the board already holds every task in memory and
   already knows how to scan one for a project note — a second copy of that
   rule server-side would be the same rule twice.
   ========================================================================= */

/* Sort options for the Projects column. Alphabetical is the default because
   it is what /projects.json already returns unsorted-by-anything-else — a
   change here never has to touch the server's own order. */
const PROJECT_SORTS = [
  { id:'name-asc',  label:'Name (A–Z)',    cmp:(a, b) => a.name.localeCompare(b.name) },
  { id:'name-desc', label:'Name (Z–A)',    cmp:(a, b) => b.name.localeCompare(a.name) },
  { id:'edited',    label:'Last edited',   cmp:(a, b) => (b.modified || '').localeCompare(a.modified || '') },
];
const PROJECT_SORT_KEY = 'todo-board-project-sort';
function readProjectSort(){
  try {
    const saved = localStorage.getItem(PROJECT_SORT_KEY);
    return PROJECT_SORTS.some(s => s.id === saved) ? saved : 'name-asc';
  } catch (e) { return 'name-asc'; }
}
let projectSort = readProjectSort();
function setProjectSort(id){
  if (projectSort === id || !PROJECT_SORTS.some(s => s.id === id)) return false;
  projectSort = id;
  try { localStorage.setItem(PROJECT_SORT_KEY, id); } catch (e) {}
  return true;
}
function projectSortSelectHTML(){
  return '<select id="projectSort" title="Sort projects">' +
    PROJECT_SORTS.map(s => '<option value="' + s.id + '"' + (s.id === projectSort ? ' selected' : '') + '>' +
      esc(s.label) + '</option>').join('') +
  '</select>';
}
// The fetched list, kept around so changing the sort redraws instantly
// instead of hitting /projects.json again for data that hasn't changed.
let projectList = [];
function renderProjectList(){
  const out = $('#projectsOut');
  if (!out) return;
  const sort = PROJECT_SORTS.find(s => s.id === projectSort) || PROJECT_SORTS[0];
  out.innerHTML = projectList.length
    ? projectList.slice().sort(sort.cmp).map(projectItemHTML).join('')
    : '<div class="empty">Nothing under <code>data/projects/</code> yet.</div>';
}

/* Clickable via a single data-project attribute and nothing else: the
   document-level capture handler in 19-drawer.js already opens
   openProjectDrawer() for any element carrying one, the same way a card's own
   project chip does. It sits on the <article>, not on the .rephead button
   inside it, so the path, the status line and the blurb are all part of the
   same target — the card looks like one thing and now behaves like one. The
   button stays a button so the card is still reachable from the keyboard;
   its click finds the attribute on the way out through closest(). */
function projectItemHTML(p){
  const rows = projectTasks(p.name);
  const open = rows.filter(r => !r.task.done).length;
  const live = rows.length > 0;
  const status = !live ? 'nothing on the list points here'
    : open ? open + ' open task' + (open === 1 ? '' : 's')
    : 'all ' + rows.length + ' task' + (rows.length === 1 ? '' : 's') + ' done';
  // The tag splits the same three ways the status line above does. A folder
  // whose every task is ticked used to read "Live", which is the one of the
  // three a glance down the column most needs told apart from the others.
  const tagClass = !live ? 'projorphan' : open ? 'projlive' : 'projcompleted';
  const tagLabel = !live ? 'Orphaned' : open ? 'Live' : 'Completed';
  const edited = cvWhen(p.modified);
  return '<article class="repitem projitem" data-project="' + esc(p.name) + '">' +
    '<button class="rephead">' +
      '<span class="reptitle">' + esc(p.name) + '</span>' +
      '<span class="tag ' + tagClass + '">' + tagLabel + '</span>' +
    '</button>' +
    '<code class="pcpath">data/projects/' + esc(p.name) + '/</code>' +
    '<div class="repmeta">' + esc(status) +
      (p.has_claude_md ? '' : ' · no CLAUDE.md') +
      ' · ' + p.file_count + ' file' + (p.file_count === 1 ? '' : 's') +
      // The newest mtime in the folder, worked out server-side. Nothing has to
      // be maintained for it to be right, which is the whole reason it is the
      // mtime and not a line someone writes into CLAUDE.md.
      (edited ? ' · edited ' + esc(edited) : '') +
    '</div>' +
    (p.blurb ? '<div class="projcardblurb">' + mdInline(p.blurb) + '</div>' : '') +
  '</article>';
}

async function renderProjectsView(){
  if (!state.doc) {
    $('#lists').innerHTML = '<div class="listcard reportsview"><h3>Projects</h3>' +
      '<div class="empty">No file loaded yet.</div></div>';
    return;
  }
  $('#lists').innerHTML =
    '<div class="lists pview">' +
      '<div class="listcard reportsview projectsview">' +
        '<h3>Projects</h3>' +
        '<p class="help listlead">Every folder under <code>data/projects/</code>, whether or not a task ' +
        'currently mentions it. Live means at least one task’s note points here; orphaned means none ' +
        'does — either nothing on the list has started against it yet, or the work it names is already ' +
        'finished and ticked off.</p>' +
        '<label class="projsort">Sort ' + projectSortSelectHTML() + '</label>' +
        '<div id="projectsOut">Loading…</div>' +
      '</div>' +
    '</div>';
  $('#projectSort').onchange = e => {
    if (setProjectSort(e.target.value)) renderProjectList();
  };
  const out = $('#projectsOut');
  try {
    const res = await fetch('/projects.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      out.innerHTML = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about projects yet.</div>';
      return;
    }
    projectList = (await res.json()).projects || [];
    renderProjectList();
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the project list. ' +
      esc(String(err.message || err)) + '</div>';
  }
}
