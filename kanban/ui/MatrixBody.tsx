/* The body of the Matrix's first column: the legend, the one-line read, the
 * nine-cell grid, and the two trays under it.
 *
 * It was `matrixSection()` returning one string. That function still decides
 * everything, which tasks are placed, which are parked, what the read says, and
 * hands over the answer as data; this only draws it. Class names, the
 * `data-open` on a dot and the order of the elements are what they were, since
 * the hover preview and its pin (`.mdot` in kanban/js/25-archiving.js) are
 * wired by one delegated listener on `#lists` and find a dot by class, and
 * `test_matrix.mjs` reads the same classes.
 *
 * The one control that moved is the "Hide Waiting for review" checkbox. It was
 * a `data-mxfilter` input answered by a second delegated listener; it is a
 * prop here, and that listener is gone.
 */
import type { CSSProperties } from 'react'

export interface MatrixDot {
  id: string
  color: string
  /** Spoken in place of a tooltip. There is no `title`, on purpose: the
   *  browser's own would appear beside the floating preview a second later. */
  label: string
  headline: boolean
  urgent: boolean
  muted: boolean
}

export interface MatrixCell {
  key: string
  advice: string
  /** Impact over effort, drawn as the cell's weight. */
  score: string
  first: boolean
  dots: MatrixDot[]
}

export interface MatrixRead {
  total: number
  cheapWins: number
  heavy: number
  cut: number
  waiting: number
}

export interface MatrixModel {
  efforts: { key: string, hint: string }[]
  /** Impact rows top to bottom, each with its row of cells left to right. */
  rows: { impact: string, cells: MatrixCell[] }[]
  read: MatrixRead | null
  hiddenWaiting: number
  /** Tasks missing an impact or an effort, so they have no position. */
  unplaced: MatrixDot[]
  /** Parked in the held tier, kept off the grid however they score. */
  held: { tier: string, dots: MatrixDot[] } | null
}

export interface MatrixBodyProps {
  model: MatrixModel
}

function Dot({ d }: { d: MatrixDot }) {
  return (
    <button
      className={'mdot' + (d.headline ? ' hl' : '') + (d.urgent ? ' urgent' : '') + (d.muted ? ' muted' : '')}
      data-open={d.id}
      style={{ ['--bc' as string]: d.color } as CSSProperties}
      aria-label={d.label}
    />
  )
}

function Read({ r }: { r: MatrixRead }) {
  /* Counted on what he could pick up today: a high impact, cheap task waiting
     on a review or on another task is not a place to start, so it is left out
     of the advice even though its dot is still in the cell. */
  return (
    <p className="mread">
      {r.cheapWins
        ? <><strong>{r.cheapWins}</strong> high impact and cheap {'—'} start there</>
        : 'nothing is both high impact and cheap right now'}
      {' · '}<strong>{r.heavy}</strong> of {r.total} need a week or more
      {r.cut ? <>{' · '}<strong>{r.cut}</strong> in the cut corner</> : null}
      {r.waiting ? <>{' · '}<strong>{r.waiting}</strong> waiting or blocked</> : null}
    </p>
  )
}

export function MatrixBody({ model }: MatrixBodyProps) {
  const { efforts, rows, read, hiddenWaiting, unplaced, held } = model
  return (
    <>
      <div className="mlegend">
        <span className="mkey mkeyhl"><i />the one thing</span>
        <span className="mkey mkeyurg"><i />urgent</span>
        <span className="mkey mkeymuted"><i />waiting or blocked</span>
      </div>
      {read ? <Read r={read} /> : null}
      {hiddenWaiting ? <p className="mhidden">{hiddenWaiting} hidden, sitting in Waiting for review.</p> : null}

      <div className="mgrid">
        <div className="mcorner">
          <span className="maxis">Effort {'→'}</span>
          <span className="maxis">{'↓'} Impact</span>
        </div>
        {efforts.map(e => (
          <div key={e.key} className="mhead">{e.key}<span className="mhint">{e.hint}</span></div>
        ))}
        {rows.map(row => (
          <RowCells key={row.impact} row={row} />
        ))}
      </div>

      {unplaced.length ? (
        <div className="mtray">
          <div className="mtrayhead">
            <strong>{unplaced.length} not on the matrix</strong>
            <span>Missing an impact or an effort score, so they have no position. Click one to score it.</span>
          </div>
          <div className="mdots">{unplaced.map(d => <Dot key={d.id} d={d} />)}</div>
        </div>
      ) : null}

      {held ? (
        <div className="mtray mhold">
          <div className="mtrayhead">
            <strong>{held.dots.length} in {held.tier}</strong>
            <span>
              Parked on purpose, so they are kept off the grid however they score. Move one out of{' '}
              {held.tier} and it takes its cell.
            </span>
          </div>
          <div className="mdots">{held.dots.map(d => <Dot key={d.id} d={d} />)}</div>
        </div>
      ) : null}
    </>
  )
}

/* A row of the grid is a side label and its cells, which the grid lays out as
   siblings rather than as a wrapper, so this returns a fragment. */
function RowCells({ row }: { row: MatrixModel['rows'][number] }) {
  return (
    <>
      <div className="mside">{row.impact}</div>
      {row.cells.map(c => (
        <div
          key={c.key}
          className={'mcell' + (c.first ? ' first' : '') + (c.dots.length ? '' : ' empty')}
          data-score={c.score}
          style={{ ['--w' as string]: c.score } as CSSProperties}
        >
          <div className="mcellhead">
            <span className="madvice">{c.advice}</span>
            <span className="mcount">{c.dots.length}</span>
          </div>
          <div className="mdots">{c.dots.map(d => <Dot key={d.id} d={d} />)}</div>
        </div>
      ))}
    </>
  )
}
