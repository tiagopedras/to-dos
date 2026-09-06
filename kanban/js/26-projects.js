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

/* Clickable via a single data-project attribute and nothing else: the
   document-level capture handler in 19-drawer.js already opens
   openProjectDrawer() for any element carrying one, the same way a card's own
   project chip does. */
function projectItemHTML(p){
  const rows = projectTasks(p.name);
  const open = rows.filter(r => !r.task.done).length;
  const live = rows.length > 0;
  const status = !live ? 'nothing on the list points here'
    : open ? open + ' open task' + (open === 1 ? '' : 's')
    : 'all ' + rows.length + ' task' + (rows.length === 1 ? '' : 's') + ' done';
  return '<article class="repitem projitem">' +
    '<button class="rephead" data-project="' + esc(p.name) + '">' +
      '<span class="reptitle">' + esc(p.name) + '</span>' +
      '<span class="tag ' + (live ? 'projlive' : 'projorphan') + '">' + (live ? 'Live' : 'Orphaned') + '</span>' +
    '</button>' +
    '<div class="repmeta">' + esc(status) +
      (p.has_claude_md ? '' : ' · no CLAUDE.md') +
      ' · ' + p.file_count + ' file' + (p.file_count === 1 ? '' : 's') +
    '</div>' +
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
        '<div id="projectsOut">Loading…</div>' +
      '</div>' +
    '</div>';
  const out = $('#projectsOut');
  try {
    const res = await fetch('/projects.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      out.innerHTML = '<div class="err"><strong>The board helper needs restarting.</strong><br>' +
        'It is running, but it is an older copy that does not know about projects yet.</div>';
      return;
    }
    const list = (await res.json()).projects || [];
    if (!list.length) {
      out.innerHTML = '<div class="empty">Nothing under <code>data/projects/</code> yet.</div>';
      return;
    }
    out.innerHTML = list.map(projectItemHTML).join('');
  } catch (err) {
    out.innerHTML = '<div class="err">Could not read the project list. ' +
      esc(String(err.message || err)) + '</div>';
  }
}
