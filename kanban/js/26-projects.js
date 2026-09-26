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

   THIS IS THE FIRST VIEW DRAWN AS COMPONENTS. The markup moved to
   kanban/ui/ProjectsView.tsx on 13 Sep 2026 and this file kept everything
   else: the fetch, the error branch, the sort preference and its
   localStorage, and the counting of open tasks against the loaded document.
   The split is on purpose — a port is easier to trust when the thing that
   changed is only how the markup is produced, and the component is pure and
   testable with no board around it as a result. See CLAUDE.md, "The React
   half, and why it is only a half".

   What that costs is one rule to keep: this file must not reach into the
   view's DOM after drawing it. setColCount() used to put the figure into an
   empty count once the fetch came back, and that is now a prop — React owns
   what is on screen, and a stray querySelector here would be overwritten by
   the next render without saying so.
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

// The fetched list, kept around so changing the sort redraws instantly
// instead of hitting /projects.json again for data that hasn't changed.
let projectList = [];
// null until the first answer arrives, which is not the same as an empty list:
// one says "still asking" and the other says "nothing there".
let projectsLoaded = false;
let projectsError = null;

/* How many tasks in the loaded document point at a folder, and how many of
   those are still open. The component asks; this answers, because the
   document lives here. */
function projectCounts(name){
  const rows = projectTasks(name);
  return { open: rows.filter(r => !r.task.done).length, total: rows.length };
}

/* The React root goes on a child of #lists rather than on #lists itself, and
   this is the one piece of the port that is not obvious.

   Every other view still draws by assigning to $('#lists').innerHTML — nine of
   them do — which tears out whatever is under it without telling React. A root
   mounted on #lists would go on believing it owned a subtree that no longer
   exists, and the next render would put the view back in a container React
   thinks is already correct. So this view makes its own node, and treats that
   node going missing as what it is: another view has been here, and this root
   is finished.

   When the last of the ten is ported this can go back to being #lists. Until
   then the rule is that a React view owns a node it created. */
let projectsRoot = null;
function projectsMountPoint(){
  const lists = $('#lists');
  if (!lists) return null;
  let host = lists.querySelector('#projectsRoot');
  if (!host) {
    if (projectsRoot) BoardUI.unmount(projectsRoot);
    lists.innerHTML = '<div id="projectsRoot"></div>';
    host = lists.querySelector('#projectsRoot');
    projectsRoot = host;
  }
  return host;
}

function drawProjects(){
  const host = projectsMountPoint();
  if (!host) return;
  const sort = PROJECT_SORTS.find(s => s.id === projectSort) || PROJECT_SORTS[0];
  BoardUI.mount(host, BoardUI.ProjectsView({
    projects: projectsLoaded ? projectList.slice().sort(sort.cmp) : null,
    error: projectsError,
    sort: projectSort,
    sorts: PROJECT_SORTS.map(s => ({ id: s.id, label: s.label })),
    onSortChange: id => { if (setProjectSort(id)) drawProjects(); },
    countsFor: projectCounts,
    when: cvWhen,
  }));
}

async function renderProjectsView(){
  if (!state.doc) {
    const host = projectsMountPoint();
    if (host) BoardUI.mount(host, BoardUI.ProjectsEmpty({}));
    return;
  }
  /* Reset per render rather than per load: renderProjectsView() is called
     again when the document changes underneath it, and a stale "loaded" here
     would show the previous document's counts against the new one's tasks
     for as long as the fetch took. */
  projectsLoaded = false;
  projectsError = null;
  drawProjects();
  try {
    const res = await fetch('/projects.json?t=' + Date.now(), { cache:'no-store' });
    if (!res.ok) {
      projectsError = { title: 'The board helper needs restarting.',
        detail: 'It is running, but it is an older copy that does not know about projects yet.' };
      drawProjects();
      return;
    }
    projectList = (await res.json()).projects || [];
    projectsLoaded = true;
    drawProjects();
  } catch (err) {
    projectsError = { title: 'Could not read the project list.',
      detail: String(err.message || err) };
    drawProjects();
  }
}
