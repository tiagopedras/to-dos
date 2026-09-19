/* The report shapes on the counted half — `completedByCategoryReport()`,
 * `recentAccomplishmentsReport()` and `weeklyTrendReport()` in
 * `kanban/js/12-reports.js`, until 13 Sep 2026 — as components rather than
 * HTML strings handed to `dangerouslySetInnerHTML`. There was a fourth,
 * `CountedLead`, drawing two grey paragraphs above the first report; it went
 * on 19 Sep 2026 with the paragraphs.
 *
 * The split follows `PlanCard`'s: the business of what counts as what —
 * which window, which bucket, how many effort points, which weeks a trend
 * spans — stays in `12-reports.js`, which is the only thing that reads
 * `state.doc` and the archive. What crosses into props here is data, never
 * markup, with one exception these components share with `PlanCard`: a done
 * task's title is `mdInline(t.title)`, and porting that is porting the
 * board's Markdown, a different job from porting this view. It arrives as
 * `{ __html }` on the one row that carries it, same as `PlanCard.summaryHTML`.
 *
 * `weeklyTrendReport`'s SVG geometry is the other thing that stays inside the
 * component rather than crossing as a prop: `cx`, `cy`, `curve`, the pace
 * comparison — all of it is pure arithmetic over the values the caller passes
 * down, no read of `state.doc`, so it belongs beside the chart it draws
 * rather than in the file that fetches `done-archive.md`.
 *
 * Clicking the trend key or the line/bars picker is a real `onClick` now,
 * not a `data-trendkey`/`data-trendtype` pair for `#lists`'s delegated
 * listener to find — see the removed cases in `kanban/js/25-archiving.js`.
 * The attributes stay on the elements regardless, because a suite and the
 * hover preview in `kanban/js/17-matrix.js` (`showTrendPreview`, reading
 * `.trendpt`'s own `data-*`) both still read them; only the click stopped
 * being found by selector.
 */
import type { CSSProperties, ReactNode } from 'react'

/* ---- shared: one finished task as a row ---- */

export interface DoneRowData {
  key: string
  color: string
  dateLabel: string
  /** mdInline(title) */
  titleHTML: string
  /** null for an archived task, which has no live id to open the drawer with. */
  taskId: string | null
  chip: string
  chipClass?: string
}

function DoneRow({ color, dateLabel, titleHTML, taskId, chip, chipClass }: DoneRowData) {
  return (
    <li style={{ ['--bc' as string]: color } as CSSProperties}>
      <span className="dt">{dateLabel}</span>
      {taskId
        ? <button className="tt" data-open={taskId} title="Open this task"
            dangerouslySetInnerHTML={{ __html: titleHTML }} />
        : <span className="tt archived" title="Archived — no longer in todo.md"
            dangerouslySetInnerHTML={{ __html: titleHTML }} />}
      <span className={'where' + (chipClass ? ' ' + chipClass : '')}>{chip}</span>
    </li>
  )
}

/* ---- Completed, grouped by category ---- */

export type EffortCell =
  | { kind: 'none' }
  | { kind: 'untagged'; title: string }
  | { kind: 'scored'; title: string; text: string }

export interface CategoryRowData {
  name: string
  color: string
  count: number
  /** 0–100, against the busiest bucket. */
  widthPct: number
  pctLabel: string
  effort: EffortCell
  tasks: DoneRowData[]
}

export interface CompletedByCategoryData {
  total: number
  totalLine: string
  rows: CategoryRowData[]
  emptyMessage: string | null
}

function EffortCellView({ effort }: { effort: EffortCell }) {
  if (effort.kind === 'none') return <span className="ef">—</span>
  if (effort.kind === 'untagged') return <span className="ef untagged" title={effort.title}>untagged</span>
  return <span className="ef" title={effort.title}>{effort.text}</span>
}

function CategoryRow({ row }: { row: CategoryRowData }) {
  const { name, color, count, widthPct, pctLabel, effort, tasks } = row
  return (
    <div className="bkgroup">
      <div className={'row' + (count ? '' : ' zero')} style={{ ['--bc' as string]: color } as CSSProperties}>
        <span className="bkname"><i></i>{name}</span>
        <span className="bar"><span style={{ width: widthPct.toFixed(1) + '%' }}></span></span>
        <span className="n">{count}</span>
        <EffortCellView effort={effort} />
        <span className="pct">{pctLabel}</span>
      </div>
      {count ? (
        <details>
          <summary>Show the {count} task{count === 1 ? '' : 's'}</summary>
          <ul className="done">
            {tasks.map(({ key, ...t }) => <DoneRow key={key} {...t} />)}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

export function CompletedByCategory({ total, totalLine, rows, emptyMessage }: CompletedByCategoryData) {
  return (
    <>
      <h2>Completed</h2>
      <div className="total">
        <span className="totaln">{total}</span>
        <span className="totall">{totalLine}</span>
      </div>
      {total
        ? rows.map(r => <CategoryRow key={r.name} row={r} />)
        : <div className="empty">{emptyMessage}</div>}
    </>
  )
}

/* ---- Recent accomplishments ---- */

export interface RecentAccomplishmentsData {
  count: number
  windowPhrase: string
  rows: DoneRowData[]
  emptyMessage: string
}

export function RecentAccomplishments({ count, windowPhrase, rows, emptyMessage }: RecentAccomplishmentsData) {
  return (
    <>
      <h2>Recent accomplishments</h2>
      <p className="help listlead">
        Everything ticked off {windowPhrase}, newest first — the same tasks counted above, flat and
        in one place.
      </p>
      {count
        ? (
          <details className="whole">
            <summary>{count} task{count === 1 ? '' : 's'}</summary>
            <ul className="done flat">
              {rows.map(({ key, ...r }) => <DoneRow key={key} {...r} />)}
            </ul>
          </details>
        )
        : <div className="empty">{emptyMessage}</div>}
    </>
  )
}

/* ---- Weekly pace ---- */

export interface TrendWeekData {
  /** reportDay(ymd(week.start)) — "27 Aug". */
  label: string
}

export interface TrendSeriesData {
  name: string
  color: string
  hidden: boolean
  /** One count per week, same order as `weeks`. */
  values: number[]
}

export interface WeeklyTrendProps {
  chartType: 'line' | 'bars'
  onChartType: (type: 'line' | 'bars') => void
  weeks: TrendWeekData[]
  series: TrendSeriesData[]
  onToggleSeries: (name: string) => void
}

export function WeeklyTrend({ chartType, onChartType, weeks, series, onToggleSeries }: WeeklyTrendProps) {
  const n = weeks.length
  const shown = series.filter(s => !s.hidden)
  const hiddenN = series.length - shown.length
  const counts = weeks.map((_, i) => shown.reduce((a, s) => a + s.values[i], 0))

  const W = 700, H = 190, top = 12, base = H - 6
  const peak = Math.max(1, ...shown.map(s => Math.max(0, ...s.values)))
  const col = W / n
  const cx = (i: number) => col * (i + 0.5)
  const cy = (v: number) => base - (v / peak) * (base - top)
  const f = (x: number) => x.toFixed(1)

  /* Both control points sit on the vertical midline between the two weeks
     they join, which keeps every curve inside the pair of values it connects
     — see weeklyTrendReport in 12-reports.js for why. */
  const curve = (vals: number[]) => {
    let d = 'M0,' + f(cy(vals[0])) + 'L' + f(cx(0)) + ',' + f(cy(vals[0]))
    for (let i = 1; i < n; i++) {
      const mx = f((cx(i - 1) + cx(i)) / 2)
      d += 'C' + mx + ',' + f(cy(vals[i - 1])) + ' ' + mx + ',' + f(cy(vals[i])) +
        ' ' + f(cx(i)) + ',' + f(cy(vals[i]))
    }
    return d + 'L' + W + ',' + f(cy(vals[n - 1]))
  }

  const grid = weeks.map((_, i) =>
    <line key={i} className="trendgrid" x1={f(cx(i))} y1={top} x2={f(cx(i))} y2={base} />
  )

  let picture: ReactNode
  if (chartType === 'bars') {
    const stackPeak = Math.max(1, ...counts)
    const barW = col * 0.6
    const bars = weeks.map((_, i) => {
      let acc = 0
      return shown.map(s => {
        const v = s.values[i]
        const y0 = base - (acc / stackPeak) * (base - top)
        acc += v
        const y1 = base - (acc / stackPeak) * (base - top)
        if (!v) return null
        return (
          <rect key={s.name + '-' + i} className="trendbar" x={f(cx(i) - barW / 2)} y={f(y1)}
            width={f(barW)} height={f(y0 - y1)} fill={s.color}>
            <title>{s.name}: {v}</title>
          </rect>
        )
      })
    })
    picture = <>{grid}{bars}</>
  } else {
    const defs = shown.map((s, i) => (
      <linearGradient key={s.name} id={'tgrad' + i} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={s.color} stopOpacity=".42" />
        <stop offset="1" stopColor={s.color} stopOpacity="0" />
      </linearGradient>
    ))
    const bands = shown.map((s, i) => {
      const d = curve(s.values)
      return (
        <g key={s.name}>
          <path d={d + 'L' + W + ',' + base + 'L0,' + base + 'Z'} fill={'url(#tgrad' + i + ')'} />
          <path className="trendline" d={d} stroke={s.color}><title>{s.name}</title></path>
        </g>
      )
    })
    const points = shown.map(s =>
      s.values.map((v, i) => {
        const x = f(cx(i)), y = f(cy(v))
        return (
          <g key={s.name + i}>
            <circle className="trenddot" cx={x} cy={y} r="2.5" fill={s.color} />
            <circle className="trendpt" cx={x} cy={y} r="9" tabIndex={0}
              data-trendlabel={s.name} data-trendcolor={s.color}
              data-trendcount={v} data-trendweek={weeks[i].label}
              aria-label={s.name + ', ' + v + ' task' + (v === 1 ? '' : 's') + ', week of ' + weeks[i].label} />
          </g>
        )
      })
    )
    picture = <><defs>{defs}</defs>{grid}{bands}{points}</>
  }

  let pace: string
  if (weeks.length < 2) {
    pace = 'Just this one week in view — widen "Show" above to see whether the pace is climbing or slowing.'
  } else {
    const half = Math.ceil(weeks.length / 2)
    const recentAvg = counts.slice(-half).reduce((a, b) => a + b, 0) / half
    const earlierN = weeks.length - half
    const earlierAvg = counts.slice(0, earlierN).reduce((a, b) => a + b, 0) / earlierN
    if (recentAvg === 0 && earlierAvg === 0) {
      pace = 'Nothing finished with a date across these ' + weeks.length + ' weeks.'
    } else if (recentAvg > earlierAvg * 1.15) {
      pace = 'Climbing — the last ' + half + ' weeks are ahead of the ' + earlierN + ' before them.'
    } else if (recentAvg < earlierAvg * 0.85) {
      pace = 'Slowing — the last ' + half + ' weeks are behind the ' + earlierN + ' before them.'
    } else {
      pace = 'Flat — the last ' + half + ' weeks are close to the ' + earlierN + ' before them.'
    }
  }
  if (hiddenN) pace += ' ' + hiddenN + ' bucket' + (hiddenN === 1 ? ' is' : 's are') +
    ' hidden, so every number here counts only the rest.'

  return (
    <>
      <div className="trendhead">
        <h2>Weekly pace</h2>
        <span className="tabs small" data-trendtype-group role="group" aria-label="Line or bars">
          {(['line', 'bars'] as const).map(id => (
            <button key={id} type="button" className={'tab' + (id === chartType ? ' on' : '')}
              data-trendtype={id} aria-pressed={id === chartType} onClick={() => onChartType(id)}>
              {id === 'line' ? 'Line' : 'Bars'}
            </button>
          ))}
        </span>
      </div>
      <p className="help listlead">
        Tasks finished per week, Monday to Sunday, over the last {weeks.length} week{weeks.length === 1 ? '' : 's'},
        one {chartType === 'bars' ? 'stacked bar' : 'line'} per bucket. The number under each week is its total.
      </p>
      <div className="trend">
        <svg className="trendchart" viewBox={'0 0 ' + W + ' ' + H} role="img"
          aria-label={'Tasks finished per week, one ' + (chartType === 'bars' ? 'stacked bar' : 'line') + ' per bucket'}>
          {picture}
          <line className="trendbase" x1="0" y1={base} x2={W} y2={base} />
        </svg>
        <div className="trendx">
          {weeks.map((w, i) => (
            <div key={i} className={'trendxc' + (i === n - 1 ? ' current' : '')}>
              <span className="trendwk">{w.label}</span>
              <span className="trendn">({counts[i]})</span>
            </div>
          ))}
        </div>
        <div className="trendkey">
          {series.map(s => (
            <button key={s.name} className={'tkey' + (s.hidden ? ' off' : '')} data-trendkey={s.name}
              style={{ ['--bc' as string]: s.color } as CSSProperties} aria-pressed={!s.hidden}
              title="Show or hide this bucket" onClick={() => onToggleSeries(s.name)}>
              <i></i>{s.name}
            </button>
          ))}
        </div>
      </div>
      <p className="note">{pace}</p>
    </>
  )
}
