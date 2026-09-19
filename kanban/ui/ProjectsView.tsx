/* Projects — the first view drawn as components rather than as a string.
 *
 * It went first because it is the smallest (131 lines) and because nothing else
 * is about to rewrite it: the Execution view is smaller work still, and entry
 * 558 in IMPROVEMENTS.md folds it into Plans, so porting it would be work
 * thrown away.
 *
 * What did NOT move is the orchestration. kanban/js/26-projects.js still owns
 * the fetch, the error branch, the sort preference and localStorage, and hands
 * the answers down as props — so this component is pure, has no idea a server
 * exists, and the async flow the view already had is untouched. That is
 * deliberate for a first port: one thing changed at a time, and the thing
 * changed here is how the markup is produced.
 *
 * The markup itself is the markup that was there before, class for class,
 * because kanban/board.css is unchanged and answers for both. kanban/
 * test_projects.mjs is the check on that and reads the DOM directly — one of
 * its assertions compares a className string exactly — so this is not a place
 * to tidy a class name in passing.
 *
 * The board's own helpers arrive as props rather than being read off the global
 * scope. cvWhen, mdInline and projectTasks are all reachable from the bundle as
 * bare globals, but taking them as arguments keeps the component testable
 * without a board around it, and makes the dependency visible in one place
 * instead of buried at the point of use.
 */
import type { ReactNode } from 'react'
import { Alert, Column, ColumnEmpty } from '@tiagopedras/tenon'

export interface ProjectSummary {
  name: string
  blurb?: string
  has_claude_md?: boolean
  file_count: number
  modified?: string
}

export interface ProjectSortOption {
  id: string
  label: string
}

/** Two sentences rather than one string: the board's error boxes lead with the
 *  thing that is wrong in bold and put what to do about it underneath, and a
 *  caller in plain JavaScript cannot build that node itself. */
export interface ProjectsError {
  title: string
  detail?: string
}

export interface ProjectsViewProps {
  /** null while the fetch is still out — which is not the same as an empty
   *  list, and the two say different things on screen. */
  projects: ProjectSummary[] | null
  error?: ProjectsError | null
  sort: string
  sorts: ProjectSortOption[]
  onSortChange: (id: string) => void
  /** How many tasks in the loaded document point at this folder, and how many
   *  of those are still open. The board holds the document, so it answers. */
  countsFor: (name: string) => { open: number; total: number }
  /** The board's cvWhen: an ISO stamp as "yesterday". */
  when: (iso?: string) => string
  /** The board's mdInline, which returns HTML. */
  inline: (s: string) => string
}

function ProjectItem(props: {
  project: ProjectSummary
  countsFor: ProjectsViewProps['countsFor']
  when: ProjectsViewProps['when']
  inline: ProjectsViewProps['inline']
}) {
  const { project: p, countsFor, when, inline } = props
  const { open, total } = countsFor(p.name)
  const live = total > 0

  const status = !live
    ? 'nothing on the list points here'
    : open
      ? open + ' open task' + (open === 1 ? '' : 's')
      : 'all ' + total + ' task' + (total === 1 ? '' : 's') + ' done'

  /* The tag splits the same three ways the status line does. A folder whose
     every task is ticked used to read "Live", which is the one of the three a
     glance down the column most needs told apart from the others. */
  const tagClass = !live ? 'projorphan' : open ? 'projlive' : 'projcompleted'
  const tagLabel = !live ? 'Orphaned' : open ? 'Live' : 'Completed'
  const edited = when(p.modified)

  /* data-project sits on the <article> and nowhere else: the document-level
     handler in 19-drawer.js opens the drawer for any element carrying one, so
     putting it here makes the path, the status line and the blurb part of the
     same target — the card looks like one thing and behaves like one. The
     button stays a button so the card is still reachable from the keyboard. */
  return (
    <article className="repitem projitem" data-project={p.name}>
      <button className="rephead">
        <span className="reptitle">{p.name}</span>
        <span className={'tag ' + tagClass}>{tagLabel}</span>
      </button>
      <code className="pcpath">{'data/projects/' + p.name + '/'}</code>
      <div className="repmeta">
        {status}
        {p.has_claude_md ? '' : ' · no CLAUDE.md'}
        {' · ' + p.file_count + ' file' + (p.file_count === 1 ? '' : 's')}
        {/* The newest mtime in the folder, worked out server-side. Nothing has
            to be maintained for it to be right, which is the whole reason it is
            the mtime and not a line someone writes into CLAUDE.md. */}
        {edited ? ' · edited ' + edited : ''}
      </div>
      {p.blurb
        ? <div className="projcardblurb" dangerouslySetInnerHTML={{ __html: inline(p.blurb) }} />
        : null}
    </article>
  )
}

export function ProjectsView(props: ProjectsViewProps) {
  const { projects, error, sort, sorts, onSortChange, countsFor, when, inline } = props

  let body: ReactNode
  if (error) {
    body = (
      <Alert tone="error" title={error.title}>{error.detail}</Alert>
    )
  } else if (projects === null) {
    body = 'Loading…'
  } else if (!projects.length) {
    body = <div className="empty">Nothing under <code>data/projects/</code> yet.</div>
  } else {
    body = projects.map(p => (
      <ProjectItem key={p.name} project={p} countsFor={countsFor} when={when} inline={inline} />
    ))
  }

  /* The order control is the column header's Sort slot, the same slot the
     board's priority toggle sits in — it governs every card below it, and
     anything governing a column belongs in its head rather than as the first
     row of its body, which is where it read as part of the list. */
  const sortControl = (
    <label className="projsort">
      Sort{' '}
      <select
        id="projectSort"
        title="Sort projects"
        value={sort}
        onChange={e => onSortChange(e.target.value)}
      >
        {sorts.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
    </label>
  )

  /* --pcols:1 so the single track keeps the board's own 322px floor and then
     takes whatever width is going, rather than a six-column row with five
     empty tracks in it. */
  return (
    <div className="lists pview" style={{ ['--pcols' as string]: 1 }}>
      <Column
        id="projectsCol"
        titleAs="h3"
        title="Projects"
        className="reportsview projectsview"
        sort={sortControl}
        count={projects ? projects.length : ''}
        desc={
          <>
            Every folder under <code>data/projects/</code>, whether or not a task
            currently mentions it. Live means at least one task’s note points here;
            orphaned means none does — either nothing on the list has started against
            it yet, or the work it names is already finished and ticked off.
          </>
        }
        bodyClassName=""
        children={<div id="projectsOut">{body}</div>}
      />
    </div>
  )
}

/* The empty view, for before a document is loaded. Its own export rather than a
   branch inside ProjectsView, because it shares nothing with it but the wrapper
   — no sort, no count, no fetch. */
export function ProjectsEmpty(props: { message?: string }) {
  return (
    <div className="lists pview" style={{ ['--pcols' as string]: 1 }}>
      <Column
        titleAs="h3"
        title="Projects"
        className="reportsview"
        children={<ColumnEmpty boxed>{props.message || 'No file loaded yet.'}</ColumnEmpty>}
      />
    </div>
  )
}
