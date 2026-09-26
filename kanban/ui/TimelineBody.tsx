/* The body of the Timeline's one column: the scale, one lane per bucket, the
 * legend under them and the tray of undated tasks.
 *
 * It was `timelineSection()` returning one string, wired after the paint by
 * `wireTimelineDrag()` finding nodes by selector. `timelineSection()` in
 * kanban/js/18-timeline.js still decides everything, which tasks are dated,
 * where each mark sits in pixels, which lanes are open, and hands the answer
 * over as data; this only draws it. Every drag handler is a prop now, and the
 * handlers themselves still live in 18-timeline.js, since each one reads or
 * writes the document.
 *
 * Row reorder is the one drag that is not a prop. It stays on Tenon's
 * `bindReorder`, bound once to each lane's `<details>` through a ref, because
 * a lane's rows are not one flat list (a task's steps sit between it and the
 * next task) and `bindReorder` already knows to skip them by selector.
 *
 * Class names and `data-*` attributes are what they were. `data-open`,
 * `data-tlsort` and `data-tltoggle` are read by the delegated click listener
 * in kanban/js/25-archiving.js, `data-tlcollapse` by the toggle listener in
 * kanban/js/19-drawer.js, and `data-dayoffset` by `setTlLabelWidth()`, which
 * moves the gridlines during a resize without a render.
 */
import { useEffect, useRef } from 'react'
import type { CSSProperties, DragEvent, PointerEvent } from 'react'
import { Card, ColumnEmpty, bindReorder } from '@tiagopedras/tenon'
import { InlineMd } from './InlineMd'

export type TimelineDragKind = 'move' | 'start' | 'due'

export interface TimelineMark {
  kind: 'bar' | 'trail' | 'milestone'
  left: number
  /** On a milestone, the width of its day column, where its edge handles sit. */
  width?: number
  /** `dueInfo()`'s class, when a date makes the mark urgent. */
  dueCls?: string
  title: string
  /** What dragging the mark itself does. Null on a step's mark, which the
   *  timeline never reschedules. */
  drag: TimelineDragKind | null
  /** A handle at each end: start on the left, due on the right. Every
   *  task's mark has them; a step's has none. */
  handles: boolean
}

export interface TimelineRow {
  id: string
  /** The title as written, inline Markdown and all. */
  title: string
  /** A step nested under its task: thinner, no grip, no chevron, no drag. */
  sub: boolean
  blocked: boolean
  /** Absent on a step, which has never carried a colour of its own. */
  color?: string
  mark: TimelineMark | null
  /** How many dated steps the task has; a chevron shows only when some do. */
  steps: number
  expanded: boolean
}

export interface TimelineLane {
  bucket: string
  color: string
  collapseKey: string
  open: boolean
  /** How many tasks, not counting the step rows in `rows`. */
  count: number
  /** Tasks in lane order, each followed by its steps when expanded. */
  rows: TimelineRow[]
}

export interface TimelineScale {
  dayPx: number
  trackWidth: number
  labelWidth: number
  months: { offset: number, label: string }[]
  weeks: { offset: number, n: number }[]
  weekends: { offset: number }[]
  /** Half a day in, so the line runs down the middle of today's column. */
  todayOffset: number
}

export interface TimelineTrayCard {
  id: string
  title: string
  color: string
  bucket: string
}

export interface TimelineModel {
  /** Null when nothing open carries a date, so there is no scale to draw. */
  scale: TimelineScale | null
  lanes: TimelineLane[]
  /** One per lane on screen, for the legend's striped bucket swatch. */
  legendColors: string[]
  tray: TimelineTrayCard[]
}

/** Every drag the view has. The body is the `.tlbody` the pointer is over,
 *  since each handler measures days against it. */
export interface TimelineHandlers {
  onTrayDragStart: (e: DragEvent<HTMLElement>, id: string) => void
  onTrayDragEnd: (e: DragEvent<HTMLElement>, id: string) => void
  onScaleDragOver: (e: DragEvent<HTMLElement>, body: HTMLElement) => void
  onScaleDragLeave: (e: DragEvent<HTMLElement>) => void
  onScaleDrop: (e: DragEvent<HTMLElement>, body: HTMLElement) => void
  onScalePointerMove: (e: PointerEvent<HTMLElement>, body: HTMLElement) => void
  onScalePointerLeave: () => void
  onMarkPointerDown: (e: PointerEvent<HTMLElement>, id: string, kind: TimelineDragKind) => void
  onTrackPointerDown: (e: PointerEvent<HTMLElement>, id: string) => void
  onResizePointerDown: (e: PointerEvent<HTMLElement>, scroll: HTMLElement) => void
  onResizeReset: () => void
  onReorderStart: () => void
  onReorderEnd: () => void
  /** The lane's task ids in their new order. */
  onReorder: (bucket: string, ids: string[]) => void
}

export interface TimelineBodyProps {
  model: TimelineModel
  /** A backup preview, or the demo: nothing sorts, drags or reorders. */
  locked: boolean
  /** Null when locked. */
  handlers: TimelineHandlers | null
}

const bc = (color: string | undefined, extra?: CSSProperties) =>
  ({ ['--bc' as string]: color, ...extra } as CSSProperties)

function Mark({ row, h }: { row: TimelineRow, h: TimelineHandlers | null }) {
  const m = row.mark
  if (!m) return null
  const drag = m.drag
  const down = (kind: TimelineDragKind) => h
    ? { onPointerDown: (e: PointerEvent<HTMLElement>) => h.onMarkPointerDown(e, row.id, kind) }
    : {}
  const dragAttrs = drag ? { 'data-tlrow': row.id, 'data-tldrag': drag, ...down(drag) } : {}
  if (m.kind === 'milestone') {
    const diamond = (
      <div className={'tlmilestone' + (m.dueCls ? ' ' + m.dueCls : '')}
        style={bc(row.color, { left: m.left + 'px' })}
        data-open={row.id} {...dragAttrs} title={m.title} />
    )
    if (!m.handles) return diamond
    /* Beside the diamond rather than in it, since it is turned 45°. The left
       one draws out a start date, the right one moves the due date. */
    return (
      <>
        {diamond}
        <span className="tlhandle tlmhandle tlhandle-l" style={bc(row.color, { left: m.left + 'px' })}
          data-tlrow={row.id} data-tldrag="start" title="Drag to set a start date" {...down('start')} />
        <span className="tlhandle tlmhandle tlhandle-r" style={bc(row.color, { left: (m.left + (m.width || 0) - 7) + 'px' })}
          data-tlrow={row.id} data-tldrag="due" {...down('due')} />
      </>
    )
  }
  return (
    <div className={'tlbar' + (m.kind === 'trail' ? ' tltrail' : '') + (m.dueCls ? ' ' + m.dueCls : '')}
      style={bc(row.color, { left: m.left + 'px', width: m.width + 'px' })}
      data-open={row.id} {...dragAttrs} title={m.title}>
      {m.handles ? (
        <>
          <span className="tlhandle tlhandle-l" data-tlrow={row.id} data-tldrag="start" {...down('start')} />
          <span className="tlhandle tlhandle-r" data-tlrow={row.id} data-tldrag="due" {...down('due')} />
        </>
      ) : null}
    </div>
  )
}

function Row({ row, bucket, scale, locked, h }: {
  row: TimelineRow, bucket: string, scale: TimelineScale, locked: boolean, h: TimelineHandlers | null
}) {
  const sub = row.sub
  /* Only a task with steps gets a chevron, and only its own click toggles
     them; the title stays a plain click to open. */
  const chevron = !sub && row.steps ? (
    <button type="button" className={'tlchevron' + (row.expanded ? ' open' : '')} data-tltoggle={row.id}
      title={(row.expanded ? 'Hide' : 'Show') + ' ' + row.steps + ' step' + (row.steps > 1 ? 's' : '')}>
      {'›'}
    </button>
  ) : (sub ? null : <span className="tlchevron ph" />)
  const grip = sub ? null : <span className={'tlgrip' + (locked ? ' ph' : '')}>{'⋮⋮'}</span>
  return (
    <div className={'tlrow' + (sub ? ' tlsub' : '') + (row.blocked ? ' blocked' : '')}
      {...(sub ? {} : { 'data-tlreorder': row.id, style: bc(row.color) })}>
      <div className="tllabel" {...(sub || locked ? {} : { title: 'Drag to reorder within ' + bucket })}>
        {grip}{chevron}
        <span className="tllabeltext" data-open={row.id} title={row.title}><InlineMd text={row.title} /></span>
      </div>
      <div className="tltrack" style={{ width: scale.trackWidth + 'px' }}
        {...(!sub && h ? { onPointerDown: (e: PointerEvent<HTMLElement>) => h.onTrackPointerDown(e, row.id) } : {})}>
        <Mark row={row} h={sub ? null : h} />
      </div>
    </div>
  )
}

function Lane({ lane, scale, locked, h }: {
  lane: TimelineLane, scale: TimelineScale, locked: boolean, h: TimelineHandlers | null
}) {
  const ref = useRef<HTMLDetailsElement>(null)
  /* The latest handlers and rows, read by listeners bound once per lane. */
  const live = useRef({ h, lane })
  live.current = { h, lane }
  const armed = !!h

  useEffect(() => {
    const group = ref.current
    if (!group || !armed) return
    const start = () => live.current.h?.onReorderStart()
    const end = () => live.current.h?.onReorderEnd()
    group.addEventListener('dragstart', start)
    group.addEventListener('dragend', end)
    /* One bindReorder per lane, so a row can only land among its own bucket's
       rows. It stops its own dragover and drop at the lane, which is what keeps
       a row drop from reaching the scale's drop and being read as a date. */
    const unbind = bindReorder(group, {
      item: '.tlrow[data-tlreorder]',
      grip: '.tllabel',
      keyOf: el => el.dataset.tlreorder ?? '',
      onMove: (id, beforeId) => {
        const { h: hh, lane: l } = live.current
        const ids = l.rows.filter(r => !r.sub && r.id !== id).map(r => r.id)
        const at = beforeId == null ? ids.length : ids.indexOf(beforeId)
        ids.splice(at < 0 ? ids.length : at, 0, id)
        hh?.onReorder(l.bucket, ids)
      },
    })
    return () => {
      unbind()
      group.removeEventListener('dragstart', start)
      group.removeEventListener('dragend', end)
    }
  }, [armed])

  return (
    <details ref={ref} className="tllanegroup" data-tlcollapse={lane.collapseKey} open={lane.open}>
      <summary className="tlrow tllane">
        <div className="tllabel lanehead" style={bc(lane.color)}>
          <i className="dot" />{lane.bucket}<span className="lanecount">{lane.count}</span>
          {/* Same field a grip drag writes: a one-off sort, not a standing rule. */}
          {locked ? null : (
            <button type="button" className="tlsort" data-tlsort={lane.bucket}
              title="Sort this lane by earliest date — start, else due">Sort by date</button>
          )}
        </div>
        <div className="tltrack" style={{ width: scale.trackWidth + 'px' }} />
      </summary>
      {/* A step carries its task's id, so its key needs its place as well. */}
      {lane.rows.map((row, i) => (
        <Row key={row.sub ? 'sub:' + row.id + ':' + i : row.id}
          row={row} bucket={lane.bucket} scale={scale} locked={locked} h={h} />
      ))}
    </details>
  )
}

/* Weekends, week lines and today's line are siblings of the rows rather than
   inside the header, so each spans every lane at once. Each non-sticky one
   carries its day offset for setTlLabelWidth() to reposition during a resize. */
function Header({ scale, h }: { scale: TimelineScale, h: TimelineHandlers | null }) {
  const { dayPx, labelWidth, months, weeks, weekends, todayOffset, trackWidth } = scale
  return (
    <>
      <div className="tlrow tlheader">
        <div className="tllabel">
          <div className="tlresize" id="tlResize" title="Drag to resize the title column · double-click to reset"
            {...(h ? {
              onPointerDown: (e: PointerEvent<HTMLElement>) => {
                const scroll = e.currentTarget.closest('.tlscroll') as HTMLElement | null
                if (scroll) h.onResizePointerDown(e, scroll)
              },
              onDoubleClick: () => h.onResizeReset(),
            } : {})} />
        </div>
        <div className="tltrack" style={{ width: trackWidth + 'px' }}>
          {months.map(m => (
            <span key={'m' + m.offset} className="tlmonth" style={{ left: m.offset * dayPx + 'px' }}>{m.label}</span>
          ))}
          {weeks.map(w => (
            <span key={'w' + w.offset} className="tlweeknum" style={{ left: w.offset * dayPx + 'px' }}>W{w.n}</span>
          ))}
          <span className="tltodaytick" style={{ left: todayOffset * dayPx + 'px' }} />
          <span className="tltodaylabel" style={{ left: todayOffset * dayPx + 'px' }} title="Today">today</span>
        </div>
      </div>
      {weekends.map(w => (
        <div key={'we' + w.offset} className="tlweekend"
          style={{ left: labelWidth + w.offset * dayPx + 'px', width: 2 * dayPx + 'px' }} />
      ))}
      {weeks.map(w => (
        <div key={'wl' + w.offset} className="tlweekline" data-dayoffset={w.offset}
          style={{ left: labelWidth + w.offset * dayPx + 'px' }} />
      ))}
      <div className="tltoday" data-dayoffset={todayOffset}
        style={{ left: labelWidth + todayOffset * dayPx + 'px' }} title="Today" />
    </>
  )
}

/* What the colours mean, under the scale. The bucket swatch is striped from
   the colours actually on screen, so it reads as "one of these". */
function Legend({ colors }: { colors: string[] }) {
  const stripe = colors.length
    ? 'linear-gradient(90deg,' + colors.map((c, i) =>
        c + ' ' + (i / colors.length * 100) + '%,' + c + ' ' + ((i + 1) / colors.length * 100) + '%'
      ).join(',') + ')'
    : 'var(--tenon-stroke-default)'
  const item = (bg: string, text: string, dim?: boolean) => (
    <span className="tllegitem"><i className={'tlswatch' + (dim ? ' dim' : '')} style={{ background: bg }} />{text}</span>
  )
  return (
    <div className="tllegend">
      {item(stripe, 'Its bucket’s colour')}
      {item('var(--tenon-status-over)', 'Due today, or overdue')}
      {item('var(--tenon-status-soon)', 'Due in the next 4 days')}
      {item(stripe, 'Waiting on a review or another task', true)}
    </div>
  )
}

/* Undated open tasks, as the same mini-card the dependency chain draws.
   Dragging one onto the scale sets its `due:`. */
function Tray({ cards, locked, h }: { cards: TimelineTrayCard[], locked: boolean, h: TimelineHandlers | null }) {
  if (!cards.length) return null
  return (
    <div className="tltray" id="tlTray">
      <div className="tltrayhead">
        <strong>{cards.length} with no date</strong>
        <span>Drag one onto the scale to give it a due date.</span>
      </div>
      <div className="tltraycards">
        {cards.map(c => (
          /* The tooltip sits on a wrapper that draws nothing, since Card spends
             its own `title` prop on the card's title (see ChainBody). */
          <span key={c.id} title="Drag onto the scale, or click to open" style={{ display: 'contents' }}>
            <Card as="div" className="chaincard tltraycard" style={bc(c.color)}
              draggable={!locked} data-tlid={c.id} data-open={c.id}
              {...(h ? {
                onDragStart: (e: DragEvent<HTMLElement>) => h.onTrayDragStart(e, c.id),
                onDragEnd: (e: DragEvent<HTMLElement>) => h.onTrayDragEnd(e, c.id),
              } : {})}>
              <span className="chaintitle"><InlineMd text={c.title} /></span>
              <div className="chainwhere">{c.bucket}</div>
            </Card>
          </span>
        ))}
      </div>
    </div>
  )
}

export function TimelineBody({ model, locked, handlers: h }: TimelineBodyProps) {
  const body = useRef<HTMLDivElement>(null)
  const { scale, lanes, legendColors, tray } = model
  if (!scale && !tray.length) return <ColumnEmpty>Nothing open on the list.</ColumnEmpty>

  const at = <E,>(fn: (e: E, b: HTMLElement) => void) => (e: E) => { if (body.current) fn(e, body.current) }
  const scrollProps = h ? {
    onDragOver: at<DragEvent<HTMLElement>>(h.onScaleDragOver),
    onDragLeave: (e: DragEvent<HTMLElement>) => h.onScaleDragLeave(e),
    onDrop: at<DragEvent<HTMLElement>>(h.onScaleDrop),
    onPointerMove: at<PointerEvent<HTMLElement>>(h.onScalePointerMove),
    onPointerLeave: () => h.onScalePointerLeave(),
  } : {}

  return (
    <>
      {scale ? (
        <>
          <div className="tlscroll" {...scrollProps}>
            <div ref={body} className="tlbody" data-daypx={scale.dayPx}
              style={{ ['--tllabelw' as string]: scale.labelWidth + 'px', ['--tldaypx' as string]: scale.dayPx + 'px' } as CSSProperties}>
              <Header scale={scale} h={h} />
              {lanes.map(l => <Lane key={l.bucket} lane={l} scale={scale} locked={locked} h={h} />)}
            </div>
          </div>
          <Legend colors={legendColors} />
        </>
      ) : (
        <ColumnEmpty>Nothing with a date yet — everything open is in the tray below.</ColumnEmpty>
      )}
      <Tray cards={tray} locked={locked} h={h} />
    </>
  )
}
