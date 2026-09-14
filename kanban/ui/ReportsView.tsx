/* Reports — the counted half and the written half.
 *
 * The third view off the string builders, 13 Sep 2026, after Projects and
 * Backups and by the same rule: its suite (`kanban/test_reports.mjs`, 29
 * checks) was written first, against the old markup, so the port has something
 * to be judged by.
 *
 * Two columns, because the two kinds of report answer different questions and
 * neither is a footnote to the other. Counted on the left, written on the
 * right.
 *
 * The window picker governs every report in the left column — the counts, the
 * lead note and the pace chart alike — so it is a column filter and sits in the
 * head's Filters slot beside Plans' dropdown and Matrix's checkbox, not above
 * the first report as a row of its own. The right column's lead paragraph is
 * its head's description for the same reason; the left column's notes stay in
 * its body, because they are caveats about the data as it stands today rather
 * than a description of what the column is.
 *
 * The counted reports were HTML strings handed to `dangerouslySetInnerHTML`
 * until 13 Sep 2026, built by four functions in `kanban/js/12-reports.js` that
 * the drawer and Plans also use — `mdBlocks()`, `mdInline()` and the three
 * report builders. `mdBlocks()` and `mdInline()` stay exactly that: shared
 * Markdown rendering, used well beyond this view. The three report builders
 * did not need to be — nothing outside this file ever called them — so they
 * are `ReportsBlocks.tsx` now, components taking the data `12-reports.js`
 * still computes rather than the markup it used to build from it.  A finished
 * task's title still arrives as `{ __html: mdInline(t.title) }`, the same
 * `PlanCard.summaryHTML` bargain, because rendering *that* is still the
 * board's Markdown either way.
 */
import type { ReactNode } from 'react'
import { Column } from './Column'
import {
  CountedLead, CompletedByCategory, RecentAccomplishments, WeeklyTrend,
  type CountedLeadProps, type CompletedByCategoryData, type RecentAccomplishmentsData,
  type WeeklyTrendProps,
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

export interface ReportsViewProps {
  windows: ReportWindow[]
  window: string
  onWindow: (id: string) => void
  /** What span the picker is currently showing, in words or as a date range. */
  range: string
  /** The lead note and the three counted reports, as data. See the note above. */
  lead: CountedLeadProps
  completed: CompletedByCategoryData
  recent: RecentAccomplishmentsData
  trend: WeeklyTrendProps
  /** null while /reports.json is out. */
  written: WrittenReport[] | null
  writtenError?: { kind: 'stale-helper' | 'unreadable'; detail?: string } | null
  onOpen: (r: WrittenReport) => void
}

/* A row of buttons rather than a dropdown: this governs every report on the
   tab, so the seven windows are worth reading at a glance instead of being one
   click away behind the one currently chosen. The shared `.tabs` object at its
   small size rather than a segmented control of its own. */
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

export function ReportsView(props: ReportsViewProps) {
  const { windows, window: current, onWindow, range,
          lead, completed, recent, trend, written, writtenError, onOpen } = props

  let writtenBody: ReactNode
  if (writtenError) {
    writtenBody = writtenError.kind === 'stale-helper'
      ? (
        <div className="err">
          <strong>The board helper needs restarting.</strong><br />
          It is running, but it is an older copy that does not know about reports yet.
        </div>
      )
      : <div className="err">Could not read the report list. {writtenError.detail}</div>
  } else if (written === null) {
    writtenBody = 'Loading…'
  } else if (!written.length) {
    writtenBody = (
      <div className="empty">
        Nothing written yet. Reports are Markdown files in <code>data/reports/</code>, and asking
        Claude for one is how they get there.
      </div>
    )
  } else {
    writtenBody = written.map(r => (
      <WrittenRow key={r.url} report={r} onOpen={() => onOpen(r)} />
    ))
  }

  return (
    <div className="lists rview">
      <Column
        heading="h3"
        title="Tasks finished"
        cls="reportsview prose"
        filters={
          <span className="repwindow">
            <WindowPicker windows={windows} current={current} onPick={onWindow} />
            <span className="repdates" id="repDates">{range}</span>
          </span>
        }
        body={
          <>
            <div id="countedLead"><CountedLead {...lead} /></div>
            <div id="countedOut">
              <CompletedByCategory {...completed} />
              <RecentAccomplishments {...recent} />
              <WeeklyTrend {...trend} />
            </div>
          </>
        }
      />
      <Column
        id="writtenCol"
        heading="h3"
        title="Written reports"
        cls="reportsview written prose"
        // An empty count rather than a 0 that would be wrong for a second.
        count={written === null ? '' : written.length}
        desc={
          <>
            What moved and what it means, rather than what was ticked. Ask Claude for one and it
            lands in the <code>data/reports/</code> folder.
          </>
        }
        body={<div id="writtenOut">{writtenBody}</div>}
      />
    </div>
  )
}

/* Before a document is loaded. Its own export rather than a branch inside
   ReportsView, because it shares nothing with it but the wrapper. */
export function ReportsEmpty(props: { message?: string }) {
  return (
    <div className="lists rview">
      <Column
        heading="h3"
        title="Reports"
        cls="reportsview prose"
        body={<div className="empty boxed">{props.message || 'No file loaded yet.'}</div>}
      />
    </div>
  )
}
