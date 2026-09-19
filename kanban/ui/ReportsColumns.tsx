/* Reports — the counted half and the written half, as two columns Overview
 * draws at the end of its own row.
 *
 * They were a tab of their own until 19 Sep 2026, `ReportsView` here and a
 * `.lists.rview` grid of two. The tab is gone: what got done and what to do
 * next are the same question asked at two ends, and reading one meant leaving
 * the other. So the file keeps the two columns and drops the view around them,
 * and `OverviewView` (SectionsView.tsx) lists them at the two ends of its row —
 * Tasks finished first, at twice a reference column's width, and Written
 * reports last.
 *
 * Both are collapsible here, which they were not as a tab — every column on
 * Overview is, for the same reason Overview's own five are: seven columns of
 * prose open at once is a lot of scrolling.
 *
 * Both heads are the column head every other column on the row carries, using
 * the same slots for the same things. The count is how many tasks the window
 * holds, and how many reports are in the folder. The description says what the
 * column is, in one line. The window picker governs every report in the counted
 * column — the counts and the pace chart alike — so it is a
 * column filter and sits in that head's Filters slot beside Plans' dropdown and
 * Matrix's checkbox, not above the first report as a row of its own. The counted
 * body opens straight on its first report: the two grey paragraphs above it
 * went on 19 Sep 2026, along with `CountedLead` and `buildCountedLead()`. One
 * of the four things the second said was a real warning — that a window past
 * the archive point reaches a file that could not be read, so the older end of
 * the counts may be short — and there is nothing saying it now.
 *
 * The counted reports were HTML strings handed to `dangerouslySetInnerHTML`
 * until 13 Sep 2026, built by four functions in `kanban/js/12-reports.js` that
 * the drawer and Plans also use — `mdBlocks()`, `mdInline()` and the three
 * report builders. `mdBlocks()` and `mdInline()` stay exactly that: shared
 * Markdown rendering, used well beyond this file. The three report builders did
 * not need to be — nothing outside this file ever called them — so they are
 * `ReportsBlocks.tsx` now, components taking the data `12-reports.js` still
 * computes rather than the markup it used to build from it. A finished task's
 * title still arrives as `{ __html: mdInline(t.title) }`, the same
 * `PlanCard.summaryHTML` bargain, because rendering *that* is still the board's
 * Markdown either way.
 */
import type { ReactNode } from 'react'
import { Column } from './Column'
import {
  CompletedByCategory, RecentAccomplishments, WeeklyTrend,
  type CompletedByCategoryData, type RecentAccomplishmentsData, type WeeklyTrendProps,
} from './ReportsBlocks'

export interface ReportWindow {
  id: string
  label: string
  short: string
}

export interface WrittenReport {
  title: string
  date?: string
  covers?: string
  topic?: string
  /** Inline Markdown, already rendered to HTML by the board's mdInline. */
  summaryHTML?: string
  url: string
}

export interface ReportsColumnsProps {
  windows: ReportWindow[]
  window: string
  onWindow: (id: string) => void
  /** What span the picker is currently showing, in words or as a date range. */
  range: string
  /** The three counted reports, as data. See the note above. */
  completed: CompletedByCategoryData
  recent: RecentAccomplishmentsData
  trend: WeeklyTrendProps
  /** null while /reports.json is out. */
  written: WrittenReport[] | null
  writtenError?: { kind: 'stale-helper' | 'unreadable'; detail?: string } | null
  onOpen: (r: WrittenReport) => void
  /** Whether each column is folded, the same per-column memory Overview's own
   *  five keep under `todo-board-overview-closed`. */
  finishedOpen?: boolean
  writtenOpen?: boolean
}

/* A row of buttons rather than a dropdown: this governs every report in the
   column, so the seven windows are worth reading at a glance instead of being
   one click away behind the one currently chosen. The shared `.tabs` object at
   its small size rather than a segmented control of its own. */
function WindowPicker(props: { windows: ReportWindow[]; current: string; onPick: (id: string) => void }) {
  return (
    <span className="tabs small" id="reportWindow" role="group" aria-label="How far back to count">
      {props.windows.map(w => (
        <button
          key={w.id}
          type="button"
          className={'tab' + (w.id === props.current ? ' on' : '')}
          data-window={w.id}
          aria-pressed={w.id === props.current}
          title={w.label}
          onClick={() => props.onPick(w.id)}
        >{w.short}</button>
      ))}
    </span>
  )
}

function WrittenRow(props: { report: WrittenReport; onOpen: () => void }) {
  const r = props.report
  const when = [r.covers ? 'Covers ' + r.covers : '', r.topic || ''].filter(Boolean).join(' · ')
  return (
    <article className="repitem" data-report={r.url}>
      <button className="rephead" data-report-open={r.url} onClick={props.onOpen}>
        <span className="reptitle">{r.title}</span>
        {r.date ? <span className="repdate">{r.date}</span> : null}
      </button>
      {when ? <div className="repmeta">{when}</div> : null}
      {r.summaryHTML
        ? <div className="repsum" dangerouslySetInnerHTML={{ __html: r.summaryHTML }} />
        : null}
    </article>
  )
}

/* The picker sits in a <summary> now, where a click would fold the column as
   well as change the window. Nothing here handles that: the delegated guard in
   `kanban/js/09-columns.js` already cancels the fold for any button, select,
   input, label or link inside a column's own head, which is the same guard
   Quick wins' sort toggle has always relied on. */
export function TasksFinishedColumn(props: ReportsColumnsProps) {
  const { windows, window: current, onWindow, range, completed, recent, trend } = props
  return (
    <Column
      heading="h3"
      title="Tasks finished"
      cls="reportsview prose"
      collapsible
      collapseKey="ov:Tasks finished"
      open={props.finishedOpen}
      /* The head says how many, the same as every column on this row that
         holds a countable thing — the three reports below it break that one
         number down by bucket, by task and by week, and none of them is the
         column's own figure. */
      count={completed.total}
      /* One line saying what is in the column, like the four reference
         sections' hints. It replaced two paragraphs of the same grey type at
         the top of the body — what counts as finished, and how much of the
         window the archive covers — which said more about the data than the
         column needed to say before showing it. */
      desc="Everything ticked off inside the window, by bucket, by task and by week."
      filters={
        <span className="repwindow">
          <WindowPicker windows={windows} current={current} onPick={onWindow} />
          <span className="repdates" id="repDates">{range}</span>
        </span>
      }
      body={
        <>
          <div id="countedOut">
            <CompletedByCategory {...completed} />
            <RecentAccomplishments {...recent} />
            <WeeklyTrend {...trend} />
          </div>
        </>
      }
    />
  )
}

export function WrittenReportsColumn(props: ReportsColumnsProps) {
  const { written, writtenError, onOpen } = props

  let body: ReactNode
  if (writtenError) {
    body = writtenError.kind === 'stale-helper'
      ? (
        <div className="err">
          <strong>The board helper needs restarting.</strong><br />
          It is running, but it is an older copy that does not know about reports yet.
        </div>
      )
      : <div className="err">Could not read the report list. {writtenError.detail}</div>
  } else if (written === null) {
    body = 'Loading…'
  } else if (!written.length) {
    body = (
      <div className="empty">
        Nothing written yet. Reports are Markdown files in <code>data/reports/</code>, and asking
        Claude for one is how they get there.
      </div>
    )
  } else {
    body = written.map(r => (
      <WrittenRow key={r.url} report={r} onOpen={() => onOpen(r)} />
    ))
  }

  return (
    <Column
      id="writtenCol"
      heading="h3"
      title="Written reports"
      cls="reportsview written prose"
      collapsible
      collapseKey="ov:Written reports"
      open={props.writtenOpen}
      // An empty count rather than a 0 that would be wrong for a second.
      count={written === null ? '' : written.length}
      desc={
        <>
          What moved and what it means, rather than what was ticked. Ask Claude for one and it
          lands in the <code>data/reports/</code> folder.
        </>
      }
      body={<div id="writtenOut">{body}</div>}
    />
  )
}
