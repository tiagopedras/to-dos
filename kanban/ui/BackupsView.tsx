/* Backups — every copy of todo.md the board has kept.
 *
 * The second view off the string builders, 13 Sep 2026, and it went second
 * because `kanban/test_backups.mjs` was written first: 36 checks against the
 * old markup, so the port has something to be judged by. That is the order
 * every remaining view should go in.
 *
 * Same split as ProjectsView. `kanban/js/15-backups.js` keeps the fetch, the
 * two error branches, the grouping and the sort, and the four formatters — one
 * of which, `backupWhen`, Plans uses as well, so none of them could move here
 * without either splitting the set or dragging a shared helper into one view.
 * They arrive as props.
 *
 * The markup is the markup that was there, class for class. The `data-load-url`
 * and `data-load-label` attributes stay on the button even though React wires
 * the click itself: they are how the row says which file it is, and the suite
 * finds the button by them.
 */
import type { ReactNode } from 'react'
import { Alert, Column } from '@tiagopedras/tenon'

export interface BackupFile {
  name: string
  kind?: 'weekly' | 'session'
  bytes: number
  modified: string
  url: string
}

export interface ArchiveFile extends BackupFile {
  /** How many batches of finished work have been lifted out of todo.md. */
  sections: number
}

/** The two ways the list can fail, which say different things and offer
 *  different help. A stale helper is fixable and the message says how. */
export type BackupsErrorKind = 'stale-helper' | 'unreadable'

export interface BackupsFormatters {
  size: (bytes: number) => string
  ago: (iso: string) => string
  when: (iso: string) => string
  weekOf: (name: string) => string | null
}

export interface BackupsViewProps {
  /** null while the fetch is out. */
  weekly: BackupFile[] | null
  session: BackupFile[]
  archive?: ArchiveFile | null
  week?: string
  keep?: { session: number; weekly: number }
  error?: { kind: BackupsErrorKind; detail?: string } | null
  onLoad: (url: string, label: string) => void
  fmt: BackupsFormatters
}

function Row(props: {
  file: BackupFile
  tag: string
  tagCls?: string
  fmt: BackupsFormatters
  onLoad?: () => void
  loadUrl?: string
  loadLabel?: string
}) {
  const { file: b, tag, tagCls, fmt, onLoad, loadUrl, loadLabel } = props
  return (
    <div className="row">
      <span className={'tag' + (tagCls ? ' ' + tagCls : '')}>{tag}</span>
      <a className="when" href={b.url} target="_blank" rel="noreferrer">{fmt.when(b.modified)}</a>
      <span className="ago">{fmt.ago(b.modified)}</span>
      <span className="spacer" />
      <span className="name">{b.name}</span>
      <span className="size">{fmt.size(b.bytes)}</span>
      {onLoad
        ? <button type="button" className="btn loadbtn"
                  data-load-url={loadUrl} data-load-label={loadLabel}
                  onClick={onLoad}>Load</button>
        : null}
    </div>
  )
}

function Group(props: { title: string; files: BackupFile[]; blank: string; children?: ReactNode }) {
  return (
    <>
      <h2>{props.title}</h2>
      {props.files.length ? props.children : <div className="empty">{props.blank}</div>}
    </>
  )
}

const STALE_HELPER = (
  <Alert tone="error" title="The board helper needs restarting.">
    It is running, but it is an older copy that does not know about backups yet. Save anything
    unsaved on the board first, then run this in Terminal:<br />
    <code style={{ display: 'inline-block', marginTop: 7, fontSize: 12 }}>
      lsof -ti tcp:8765 | xargs kill
    </code><br /><br />
    Then open <strong>To-Do Board.app</strong> again, or double-click <strong>run.command</strong>.
  </Alert>
)

export function BackupsView(props: BackupsViewProps) {
  const { weekly, session, archive, week, keep, error, onLoad, fmt } = props

  /* A backup row's label is what the lock bar shows while the preview is up, so
     it has to say which file is being read without the file name being any use
     — "Week 37, 2026 · Sat 12 Sept, 16:40" rather than todo-week-2026-W37.md. */
  const labelFor = (b: BackupFile) => {
    const wk = fmt.weekOf(b.name)
    return (b.kind === 'weekly' ? (wk || 'weekly snapshot') : 'session backup') +
      ' · ' + fmt.when(b.modified)
  }
  const rowFor = (b: BackupFile) => (
    <Row key={b.name} file={b} fmt={fmt}
         tag={b.kind === 'weekly' ? (fmt.weekOf(b.name) || 'weekly') : 'session'}
         tagCls={b.kind === 'weekly' ? undefined : 'session'}
         loadUrl={b.url} loadLabel={labelFor(b)}
         onLoad={() => onLoad(b.url, labelFor(b))} />
  )

  let body: ReactNode
  if (error) {
    body = error.kind === 'stale-helper'
      ? STALE_HELPER
      : <Alert tone="error" title="Could not read the backup list.">{error.detail}</Alert>
  } else if (weekly === null) {
    body = 'Loading…'
  } else {
    body = (
      <>
        {/* The archive goes first and on its own. Every other file here is a
            copy of something that still exists; this is the only one holding
            work that has been taken out of the list — so it gets no Load
            button, because it is not a list to open. */}
        {archive ? (
          <>
            <h2>Archived finished work</h2>
            <Row file={archive} tag="never pruned" fmt={fmt} />
            <p className="help" style={{ marginTop: 8 }}>
              {archive.sections}{archive.sections === 1 ? ' batch' : ' batches'}
              {' of tasks that were ticked off more than a month ago and lifted out of todo.md. '}
              Nothing is ever removed from this file.
            </p>
          </>
        ) : null}

        <Group title="Weekly snapshots" files={weekly}
               blank="None yet — the first one is taken the next time the board runs in a new week.">
          {weekly.map(rowFor)}
        </Group>

        <Group title="Recent sessions" files={session}
               blank="None yet — one is taken before the first save of each run.">
          {session.map(rowFor)}
        </Group>

        {keep ? (
          <p className="help listnote">
            This week is {week}. The board keeps the last {keep.session} session backups and the
            last {keep.weekly} weekly ones, then deletes the oldest.
          </p>
        ) : null}
      </>
    )
  }

  // The archive counts as one of them: it is a file on this tab like the rest,
  // and the head would be short by one without it.
  const total = weekly === null ? '' : weekly.length + session.length + (archive ? 1 : 0)

  return (
    <div className="lists pview" style={{ ['--pcols' as string]: 1 }}>
      <Column
        id="backupsCol"
        titleAs="h3"
        title="Backups"
        className="backupsview prose"
        count={total}
        desc={
          <>
            Every copy of todo.md the board has kept. Click one to read it, or Load it to look
            through it on the board — Backup Preview opens read-only, so nothing in it can be
            changed or saved over today’s list.
          </>
        }
        children={<div id="backupsOut">{body}</div>}
      />
    </div>
  )
}
