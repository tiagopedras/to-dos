/* Spend, and what runs on a clock — the two columns the Plans view opens in a
 * modal from Backlog's head.
 *
 * Token Session is the usage chart, its range picker, four figures and a fold
 * of every window; the clock column is the list of scheduled jobs. Both were
 * strings 14-schedule.js built and wrote into `#usageOut` and `#schedOut` after
 * the modal was in the page, and the run-cost fold under the chart was a third
 * thing written by id from 13-plans.js. They are one component now and every
 * value arrives as a prop, so nothing in here is found by selector after a
 * paint. The ids stay, because the suites and the stylesheet reach them.
 *
 * Dates and times are formatted by the caller wherever the board already had a
 * format it shares with another view (`schedWhen()`), and here where the
 * chart is the only reader. The chart's own geometry is the old `usageChart()`
 * unchanged; its comments moved with it.
 */
import type { ReactNode } from 'react'
import { Alert, Column, ColumnEmpty } from '@tiagopedras/tenon'

export interface UsageWindow {
  start: string
  end: string
  tok: number
  turns: number
  night?: boolean
  open?: boolean
  /** How the spend arrived across the window, as fractions of its own span and total. */
  shape?: [number, number][]
}
export interface Usage {
  available: boolean
  windows: UsageWindow[]
  rolling?: { day: string, tok: number }[]
  ceiling?: { session?: number, week?: number, source?: string, measuredAt?: string }
  days: number
  baseline?: number
  median: number
  p90: number
}
export type UsageState =
  | { kind: 'loading' }
  | { kind: 'error', message: string }
  | { kind: 'ok', usage: Usage }

export interface ScheduleJob {
  name: string
  armed: boolean
  state: string
  what: string
  schedule: string
  /** Already formatted. Null draws a dash. */
  next: string | null
  last: string
  hint?: string
  recent?: string[]
}
export type ScheduleState =
  | { kind: 'loading' }
  | { kind: 'stale' }
  | { kind: 'error', message: string }
  | { kind: 'ok', jobs: ScheduleJob[] }

export interface RunResults {
  /** The fold's summary line: what it is, the date and the total. */
  label: string
  done: { title: string, took: number, cost: number }[]
  failed: { title: string, why?: string }[]
}

export interface RefCardsProps {
  usage: UsageState
  days: number
  ranges: { days: number, label: string }[]
  onDays: (days: number) => void
  schedule: ScheduleState
  runResults: RunResults | null
}

/* Tokens are shown in millions throughout. The raw figures run to hundreds of
   millions and nothing here is a number he does arithmetic on — it is a
   comparison between windows, which is what the bar is for. */
const tokM = (n: number) => (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M'

/* Past a billion, "3043M" is a number nobody reads. The weekly line crosses
   that within a fortnight of normal use, so it gets its own unit. */
function tokBig(n: number): string {
  if (n < 1) return '0'
  return n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B' : tokM(n)
}

const two = (n: number) => String(n).padStart(2, '0')
const hm = (d: Date) => two(d.getHours()) + ':' + two(d.getMinutes())

/* The usage chart — both series as a share of their ceiling, one axis.

   Each five-hour session is a box standing on the axis at the time it opened,
   as wide as the five hours it ran and as tall as it spent, and the rolling
   seven-day total is a line across them. Percentages rather than raw tokens,
   because a weekly total and a single session are different sizes of number
   and one raw axis flattens the sessions into the floor.

   Where the ceiling comes from is the part worth knowing, and the card says it
   out loud. Nothing on this machine is told what the allowance is:
   core/windows.py reconstructs what each window spent, and the error a real
   limit returns names the reset time and not the ceiling. So until a run is
   actually refused, 100% is the heaviest session seen in the period. The week
   never has a measured source, so it is always against the busiest seven
   days seen. */
function UsageChart({ u }: { u: Usage }) {
  const wins = u.windows || []
  const roll = u.rolling || []
  const cap = u.ceiling || {}
  if (!wins.length || !cap.session) return null

  /* Sized close to the column it sits in rather than to a round number. It
     scales to fit either way, but text scales with it, and a 660-wide box in a
     380-wide column renders 10px labels at six. */
  const W = 400, H = 190, L = 30, R = 12, T = 14, B = 22
  const x0 = L, x1 = W - R, y0 = T, y1 = H - B

  const t = (s: string) => new Date(s).getTime()
  // Noon, so a day's point sits in the middle of the day it is about.
  const dayT = (s: string) => new Date(s + 'T12:00:00').getTime()

  /* The range asked for, not the range the data happens to cover. A quiet
     three days should read as three quiet days. */
  const tMax = Math.max(Date.now(), t(wins[wins.length - 1].end))
  const tMin = Math.min(t(wins[0].start), tMax - u.days * 864e5)
  const px = (ms: number) => x0 + (ms - tMin) / (tMax - tMin || 1) * (x1 - x0)

  /* One axis, 0 to 100. A session can exceed its own ceiling only when the
     ceiling is measured and an older window was heavier, so the scale runs to
     whichever is larger and the 100% rule stays where it belongs. */
  const session = cap.session
  const pctS = (w: UsageWindow) => w.tok / session * 100
  const pctR = (r: { tok: number }) => r.tok / (cap.week || 1) * 100
  const top = Math.max(100, ...wins.map(pctS), ...roll.map(pctR))
  const py = (v: number) => y1 - v / top * (y1 - y0)

  const short = u.days <= 3
  const rPts = roll.map(r => px(dayT(r.day)).toFixed(1) + ',' + py(pctR(r)).toFixed(1))
  const nowX = px(Date.now()).toFixed(1)
  const measured = cap.source === 'measured'

  return (
    <div className="uchart">
      <svg viewBox={'0 0 ' + W + ' ' + H} role="img"
        aria-label="Each five-hour session and the rolling seven-day total, as a share of their ceiling">
        {[0, 50, 100].map(v => (
          <g key={'g' + v}>
            <line className={'ugrid' + (v === 100 ? ' cap' : '')} x1={x0} y1={py(v).toFixed(1)}
              x2={x1} y2={py(v).toFixed(1)} />
            <text className="uaxl y" x={x0 - 5} y={(py(v) + 3.2).toFixed(1)}>{v}%</text>
          </g>
        ))}
        {[0, 1, 2, 3].map(i => {
          /* Four ticks, evenly spaced across the range rather than on round
             dates. What they say depends on how much is being shown: four
             copies of "6 Sep" is no axis at all on a day's worth, and a clock
             time is no axis on a month's. */
          const ms = tMin + (tMax - tMin) * i / 3
          return (
            <text key={'t' + i} className="uaxl d" x={px(ms).toFixed(1)} y={y1 + 13}>
              {new Date(ms).toLocaleString([], short
                ? { weekday: 'short', hour: '2-digit', minute: '2-digit' }
                : { day: 'numeric', month: 'short' })}
            </text>
          )
        })}
        {wins.map((w, i) => {
          /* A box standing on the axis, as wide as the five hours it ran and as
             tall as it spent. Discrete events are never joined into a curve: a
             slope between two windows is a slope that never happened. What is
             drawn inside is how the spend arrived across those five hours. */
          const bx = px(t(w.start)), bw = Math.max(1.6, px(t(w.end)) - bx)
          const topY = py(pctS(w)), baseY = py(0), bh = baseY - topY
          const cls = 'ubox' + (w.night ? ' night' : '') + (w.open ? ' live' : '')
          const shape = w.shape || []
          return (
            <g key={i} className={cls}>
              {shape.length ? (
                <path className="ufill"
                  d={'M' + bx.toFixed(1) + ',' + baseY.toFixed(1) + ' ' +
                    shape.map(p => 'L' + (bx + p[0] * bw).toFixed(1) + ',' + (baseY - p[1] * bh).toFixed(1)).join(' ') +
                    ' L' + (bx + bw).toFixed(1) + ',' + baseY.toFixed(1) + ' Z'} />
              ) : null}
              <rect className="uboxline" x={bx.toFixed(1)} y={topY.toFixed(1)}
                width={bw.toFixed(1)} height={Math.max(0.6, bh).toFixed(1)} />
              <title>
                {new Date(w.start).toLocaleString([], {
                  weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' · ' + tokM(w.tok) + ' · ' + w.turns + ' turns'}
                {w.night ? ' · opened in the night' : ''}
              </title>
            </g>
          )
        })}
        {rPts.length > 1 ? <polyline className="uline r" points={rPts.join(' ')} /> : null}
        <line className="unow" x1={nowX} y1={y0} x2={nowX} y2={py(0).toFixed(1)} />
      </svg>
      <div className="ukey">
        <span className="k s">Five-hour session</span>
        <span className="k n">Opened in the night</span>
        <span className="k f">Spend across the window</span>
        {rPts.length > 1 ? <span className="k r">Rolling seven days</span> : null}
      </div>
      {/* One line, not a paragraph. A percentage axis with an unstated
          denominator says nothing, so what 100% is has to be on the card — but
          which of the two sources it came from is the only part that needs
          saying. */}
      <p className="ucap">
        {'100% = '}<b>{tokBig(session)}</b>{' session'}
        {measured ? <>{' '}<em>{'measured at a limit' + (cap.measuredAt ? ', ' + cap.measuredAt : '')}</em></> : null}
        {' · '}<b>{tokBig(cap.week || 0)}</b>{' week'}
        {/* The baseline, not the range. Narrowing to three days does not change
            what 100% is, and a card that said "heaviest in 3 days" while
            drawing a month's ceiling would be lying about both. */}
        {measured ? null : <>{' '}<em>{'heaviest in ' + (u.baseline || u.days) + ' days'}</em></>}
      </p>
    </div>
  )
}

function UsageRow({ w, peak }: { w: UsageWindow, peak: number }) {
  const a = new Date(w.start), b = new Date(w.end)
  return (
    <div className={'urow' + (w.open ? ' live' : '') + (w.night ? ' night' : '')}>
      <span className="uday">
        {a.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
      </span>
      <span className="uspan">{hm(a) + '–' + hm(b)}</span>
      <span className="ubar"><span style={{ width: Math.max(1, Math.round(w.tok / peak * 100)) + '%' }} /></span>
      <span className="utok">{tokM(w.tok)}</span>
    </div>
  )
}

function UsageBody({ usage, days, ranges, onDays }: Pick<RefCardsProps, 'usage' | 'days' | 'ranges' | 'onDays'>) {
  if (usage.kind === 'loading') return <>Loading…</>
  if (usage.kind === 'error') {
    return <Alert tone="error">Could not read the usage windows. {usage.message}</Alert>
  }
  const u = usage.usage
  if (!u.available) {
    return (
      <ColumnEmpty>
        No <code>core/windows.py</code> in this checkout, so there is nothing to read the usage
        windows with.
      </ColumnEmpty>
    )
  }
  const wins = u.windows.slice().reverse()
  const peak = Math.max(1, ...wins.map(w => w.tok))
  const nights = u.windows.filter(w => w.night).length
  return (
    <>
      <div className="uranges">
        {ranges.map(r => (
          <button key={r.days} type="button" className={'urange' + (r.days === days ? ' on' : '')}
            data-days={r.days} onClick={() => onDays(r.days)}>
            {r.label}
          </button>
        ))}
      </div>
      <UsageChart u={u} />
      {/* The whole card is redrawn on a range click rather than only the
          chart. Every figure on it is about the range, so a chart that changed
          while the numbers under it did not would be the worse half of a
          working control. */}
      <div className="ustats">
        <span><b>{u.windows.length}</b> windows in {u.days === 1 ? '24 hours' : u.days + ' days'}</span>
        <span><b>{tokM(u.median)}</b> median</span>
        <span><b>{tokM(u.p90)}</b> p90</span>
        <span><b>{nights}</b> started in the night</span>
      </div>
      {/* The rows are still here, one per window, but folded. They read as a
          log, which is the wrong shape for "is this getting better" and the
          right one for "what happened on Tuesday". */}
      <details className="ufold">
        <summary>Every window, newest first</summary>
        <div className="ulist">
          {wins.map((w, i) => <UsageRow key={i} w={w} peak={peak} />)}
        </div>
      </details>
    </>
  )
}

function JobRow({ j }: { j: ScheduleJob }) {
  const dot = j.armed ? 'on' : 'off'
  return (
    <article className="schedjob">
      <div className="schedhead">
        <i className={'dot ' + dot} />
        <span className="schedname">{j.name}</span>
        <span className={'schedstate ' + dot}>{j.state}</span>
      </div>
      <p className="schedwhat">{j.what}</p>
      <dl className="schedmeta">
        <dt>Runs</dt><dd>{j.schedule || '—'}</dd>
        <dt>Next</dt><dd>{j.next != null ? j.next : '—'}</dd>
        <dt>Last</dt><dd>{j.last || '—'}</dd>
      </dl>
      {j.hint ? <p className="schedhint">Not armed. To start it:<code>{j.hint}</code></p> : null}
      {j.recent && j.recent.length ? (
        <details className="schedlog"><summary>Recent</summary><pre>{j.recent.join('\n')}</pre></details>
      ) : null}
    </article>
  )
}

function ScheduleBody({ schedule }: { schedule: ScheduleState }) {
  if (schedule.kind === 'loading') return <>Loading…</>
  if (schedule.kind === 'stale') {
    return (
      <Alert tone="error" title="The board helper needs restarting.">
        It is running, but it is an older copy that does not know about the schedule yet.
      </Alert>
    )
  }
  if (schedule.kind === 'error') {
    return <Alert tone="error">Could not read the schedule. {schedule.message}</Alert>
  }
  if (!schedule.jobs.length) return <ColumnEmpty>Nothing scheduled.</ColumnEmpty>
  return <>{schedule.jobs.map((j, i) => <JobRow key={i} j={j} />)}</>
}

const runRow = (kind: 'done' | 'failed', title: string, meta: string, key: number): ReactNode => (
  <div key={kind + key} className={'frow ' + kind}>
    <span className="fname">{title}</span>
    <span className="fmeta">{meta}</span>
  </div>
)

/* What the last run actually cost. It sits under the usage chart rather than
   in Plans' own columns, because it is a cost figure like everything else on
   this card. Folded shut, with the date and the total on the summary line so
   they read without opening it. It is a sibling of the usage body rather than
   part of it, so a range click that redraws the chart never touches it. */
function RunResultsFold({ results }: { results: RunResults | null }) {
  const has = !!results && (results.done.length > 0 || results.failed.length > 0)
  return (
    <details className={'ufold' + (has ? '' : ' hidden')} id="runResultsFold">
      <summary id="runResultsSummary">{results ? results.label : 'Latest run costs'}</summary>
      <div id="runResultsOut">
        {results ? results.done.map((d, i) => runRow('done', d.title, d.took + 's · $' + d.cost.toFixed(2), i)) : null}
        {results && results.failed.length ? (
          <>
            <h4 className="fhead">Failed</h4>
            {results.failed.map((d, i) => runRow('failed', d.title, d.why || '', i))}
          </>
        ) : null}
      </div>
    </details>
  )
}

export function RefCards({ usage, days, ranges, onDays, schedule, runResults }: RefCardsProps) {
  return (
    <div className="pvcol">
      <Column
        titleAs="h3"
        title="Token Session"
        className="schedview usage prose"
        desc="What has been spent, window by window."
        children={
          <>
            <div id="usageOut">
              <UsageBody usage={usage} days={days} ranges={ranges} onDays={onDays} />
            </div>
            <RunResultsFold results={runResults} />
          </>
        }
      />
      <Column
        titleAs="h3"
        title="What runs on a clock"
        className="reportsview clockview prose"
        desc="Set in the agents dashboard, not here."
        children={<div id="schedOut"><ScheduleBody schedule={schedule} /></div>}
      />
    </div>
  )
}
