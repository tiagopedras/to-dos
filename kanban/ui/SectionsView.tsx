/* Overview, Matrix and Timeline — the three views `renderSections()` in
 * `kanban/js/18-timeline.js` composes, as components. `refSection()`'s job —
 * wrapping a section in the same `Column` every board column already is —
 * moves here; `$('#lists').innerHTML = '<div class="lists ...">' + html +
 * '</div>' + the trailing note` does too.
 *
 * The shell only. Each section's own body — the cards in Big rocks, the
 * matrix grid, the timeline's lanes — is still built by the functions this
 * file always called (`bigRocksSection()`, `matrixSection()`,
 * `timelineSection()`, and the rest), and arrives here as `{ __html }`, the
 * same bargain `PlanCard.summaryHTML` makes: porting that markup is a
 * separate job, largely because a fair amount of it (the timeline's own
 * drag-to-reorder, the matrix's dot hover) is wired by `#lists`'s delegated
 * listener rather than by a handler this component could take as a prop —
 * see `wireTimelineDrag()` and the `.mdot`/`.trendpt` cases in
 * `kanban/js/25-archiving.js`. Delegation reaches into a React-rendered
 * subtree exactly as it reached into a string one, so none of that needed
 * touching to make this port safe.
 *
 * What *is* real here: every title and hint is written once, in this file,
 * rather than concatenated in `refSection()`'s caller — the six of them never
 * vary, so there was no prop to be made of them. A `` `week` `` in a hint is a
 * real `<code>` now rather than something `mdInline()` had to be asked to
 * make one.
 */
import type { ReactNode, CSSProperties } from 'react'
import { Column } from './Column'

/* A body a section builder already rendered — `{ html, n, filters, sort }`
   from `matrixSection()`, or a plainer version of the same shape from the
   Overview and Timeline builders. */
export interface SectionBody {
  bodyHTML: string
  count?: number | null
  sortHTML?: string
  filtersHTML?: string
}

/* One column, built the way every one of the eight below is: a hardcoded
   title and hint, a body a section builder already rendered, and whether it
   is open — Overview's own five remember that per section, Matrix's two and
   the Timeline's one are always open (see refSection() in 18-timeline.js,
   before this port, for why). */
function Section(props: {
  title: string
  hint: ReactNode
  body: SectionBody
  collapsible?: boolean
  collapseKey?: string
  open?: boolean
}) {
  const { title, hint, body, collapsible, collapseKey, open } = props
  return (
    <Column
      heading="h3"
      title={title}
      desc={hint}
      count={body.count != null ? body.count : null}
      sort={body.sortHTML ? <span dangerouslySetInnerHTML={{ __html: body.sortHTML }} /> : null}
      filters={body.filtersHTML ? <span dangerouslySetInnerHTML={{ __html: body.filtersHTML }} /> : null}
      cls="refcol prose"
      collapsible={collapsible}
      collapseKey={collapseKey}
      open={open}
      body={<span dangerouslySetInnerHTML={{ __html: body.bodyHTML }} />}
    />
  )
}

/* Below the grid on every one of these three views — generated from the
   tags on the tasks, never hand-kept, so it is the same line regardless of
   which of the three is showing. */
function ListNote() {
  return (
    <p className="help listnote">
      Generated from the tags on the tasks, so every card here is a real task. Open one to change
      it, then Save.
    </p>
  )
}

/* ---- Overview ---- */

export interface OverviewViewProps {
  bigRocks: SectionBody & { open: boolean }
  thisWeek: SectionBody & { open: boolean }
  quickWins: SectionBody & { open: boolean }
  delegate: SectionBody & { open: boolean }
  /** null when todo.md's own Context section is empty — dropped rather than
   *  drawn blank, the one section here with nothing to count. */
  context: (SectionBody & { open: boolean }) | null
}

/* The split grid's tracks are listed out rather than left to repeat(),
   because repeat() cannot take a computed count reliably across browsers —
   splitGridCSS()'s own reasoning in 18-timeline.js, ported rather than
   reused, since a CSS custom-property string is not a shape React's style
   prop takes. Context is the last column and the only wider one: it is prose
   in full sentences, not cards, and at card width it reads as a ribbon. */
const REF_TRACK = 'minmax(380px,1fr)'
const CTX_TRACK = 'minmax(540px,1.5fr)'

export function OverviewView(props: OverviewViewProps) {
  const { bigRocks, thisWeek, quickWins, delegate, context } = props
  const cols = context ? 5 : 4
  const plain = context ? cols - 1 : cols
  const tracks = Array(plain).fill(REF_TRACK)
  if (context) tracks.push(CTX_TRACK)
  const minW = plain * 394 + (context ? 554 : 0)
  const gridStyle: CSSProperties = { gridTemplateColumns: tracks.join(' '), minWidth: minW + 'px' }

  return (
    <>
      <div className="lists split" style={gridStyle}>
        <Section title="Big rocks" hint="High impact, L effort. Needs protected time."
          body={bigRocks} collapsible collapseKey="ov:Big rocks" open={bigRocks.open} />
        <Section title="This week" hint={<>Everything tagged <code>week</code>, soonest first.</>}
          body={thisWeek} collapsible collapseKey="ov:This week" open={thisWeek.open} />
        <Section title="Quick wins"
          hint={<>Yours to do: meeting agendas, <code>effort:S</code> and written messages. Anything{' '}
            <code>ai:full</code> sits in Delegate instead.</>}
          body={quickWins} collapsible collapseKey="ov:Quick wins" open={quickWins.open} />
        <Section title="Delegate to Claude"
          hint={<>Everything tagged <code>ai:full</code>, in <code>rank:</code> order. Drag a number to
            move that task up or down the queue.</>}
          body={delegate} collapsible collapseKey="ov:Delegate to Claude" open={delegate.open} />
        {context ? (
          <Section title="Context" hint="Standing facts, not tasks. Edit these in todo.md."
            body={context} collapsible collapseKey="ov:Context" open={context.open} />
        ) : null}
      </div>
      <ListNote />
    </>
  )
}

/* ---- Matrix ---- */

export interface MatrixViewProps {
  impactEffort: SectionBody
  dependencyChain: SectionBody
}

export function MatrixView({ impactEffort, dependencyChain }: MatrixViewProps) {
  return (
    <>
      <div className="lists mview">
        <Section title="Impact against effort"
          hint={<>Every open task by its two scores, except the ones parked in Backlog. One dot per
            task, coloured by bucket — hover for the title, click to open it. Faded dots are
            waiting on a review or on another task.</>}
          body={impactEffort} />
        <Section title="Dependency chain" hint={<>Built from every <code>blocked-by:</code> tag.</>}
          body={dependencyChain} />
      </div>
      <ListNote />
    </>
  )
}

/* ---- Timeline ---- */

export interface TimelineViewProps {
  timeline: SectionBody
}

export function TimelineView({ timeline }: TimelineViewProps) {
  return (
    <>
      <div className="lists tview">
        <Section title="Timeline"
          hint={<>Open top-level tasks as bars and milestones across their <code>start:</code>/
            <code>due:</code> dates, one lane per bucket. A <code>due:</code> with no{' '}
            <code>start:</code> draws as a diamond rather than a guessed bar. Undated tasks sit in
            the tray below — drag one onto the scale to give it a due date.</>}
          body={timeline} />
      </div>
      <ListNote />
    </>
  )
}
