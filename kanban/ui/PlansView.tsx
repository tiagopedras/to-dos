/* Plans — the six columns a plan moves through.
 *
 * The fourth view off the string builders, and the first one that is a board
 * rather than a page: Backlog, To do, Doing, Waiting for review, Ready to be
 * produced, Done. Where a card sits is the instruction, the same as on the
 * task board, which is why Waiting for review draws with the dashed edge and
 * takes no drops — it is the agent's own column.
 *
 * What this component is, and what it deliberately is not
 * ------------------------------------------------------
 * It is the shell: six `Column`s, their heads, their descriptions, their
 * counts, their filter slots and the two buttons in Backlog's and To do's
 * heads. That is the half that was six longhand `colHTML()` calls, and it is
 * the half `test_primitives.mjs` already holds `Column` to.
 *
 * Four of the six bodies are cards now as well, and they are the four that
 * hold nothing but plans: Doing, Waiting for review, Ready to be produced and
 * Done each take a list of `PlanCard`s. Backlog and To do do not, because
 * neither holds only plans — Backlog carries held tasks and a fold of the ones
 * a rule excluded, To do carries tonight's queue rows — and porting a card is
 * worth doing once per kind rather than once per column.
 *
 * So two currencies, deliberately, until the queue row is a component too.
 * What still arrives as an HTML string is what four independent fetches fill
 * at different times — `/plans.json`, `/queue.json`, the agent's own status,
 * and the usage reconstruction that takes about a second — each painting as it
 * arrives rather than the view waiting on the slowest. Those go in through
 * `dangerouslySetInnerHTML`, the same bargain ReportsView already makes.
 *
 * This view re-renders, which the shell-only version of it deliberately did
 * not. Every body is a prop, and `plansProps` in `13-plans.js` is the one
 * object they all come out of — the sixteen `innerHTML` assignments that used
 * to fill these nodes by id went in one change, because half-and-half is the
 * arrangement that would silently drop a column. Nothing outside that file
 * writes into this tree either: the Status line is handed over by
 * `setPlansStatus()` rather than assigned from `14-schedule.js`.
 *
 * Nothing is wired after a paint, as of 13 Sep 2026, and that is what retired
 * `mountSync()`. Every handler on a node this component owns arrives as a
 * prop: opening a plan and dragging it are `PlanCard`'s, holding and
 * reordering a queue row go through `Card`'s `attrs`, and the four columns
 * that take drops get theirs here as `DropZone`. The two filter dropdowns are
 * the one exception and they are not an exception to the rule — they are
 * markup this component never owns the handlers of, wired by one delegated
 * listener on `document` the same way their closing half already was.
 */
import type { DragEvent, ReactNode } from 'react'
import { Column } from './Column'

/* What a column that takes drops is given. Three handlers rather than a
   callback, because the answer to "will you take this" has to be given on
   every dragover — it is what paints the green edge or the red one — and only
   the caller knows what is being dragged. `13-plans.js` builds these with
   `columnDropProps()`; the component only spreads them. */
export interface DropZone {
  onDragOver: (e: DragEvent<HTMLElement>) => void
  onDragLeave: (e: DragEvent<HTMLElement>) => void
  onDrop: (e: DragEvent<HTMLElement>) => void
}

export interface PlansViewProps {
  /** Backlog: what the agent is to leave alone — held tasks, parked plans, and
   *  a fold of the ones a rule excluded. */
  backlog: ReactNode
  /** To do: the error line, the Status block and tonight's queue, in that
   *  order. The first two are markup the board built; the queue is cards. */
  queueErrorHTML: string
  statusHTML: string
  queue: ReactNode
  /** Doing: an orphaned lock notice, the live run, plans in production, or nothing. */
  orphanHTML: string
  doingHTML: string
  doingEmptyHTML: string
  /** Waiting for review: the counts above the agent's own cards. */
  doneStatsHTML: string
  /** The four columns that hold nothing but plans, as nodes rather than as
   *  markup — `PlanCard`s, or the column's empty state. These are the half of
   *  the port that has happened; everything above and below is still a string
   *  the board built. */
  doingPlans: ReactNode
  review: ReactNode
  produced: ReactNode
  done: ReactNode
  /** The priority/night toggle for each of the four, built by plansSortBtn()
   *  in 13-plans.js — a prop rather than a slot filled after paint, the same
   *  as every other handler on this view. */
  doingSort?: ReactNode
  reviewSort?: ReactNode
  producedSort?: ReactNode
  doneSort?: ReactNode
  /** Counts in the heads. An empty string draws no count at all — the two
   *  filtered columns say "All 12" on their own button, and the same number
   *  twice in one head is one too many. */
  backlogCount?: string
  queueCount?: string
  doingCount?: string
  producedCount?: string
  /** The two filter dropdowns, built by colFilterHTML(). Markup rather than a
   *  component, and the only thing on this view still wired off the DOM — by
   *  one delegated listener on `document` rather than a query after a paint,
   *  which is why it costs no flush. */
  reviewFilterHTML: string
  doneFilterHTML: string
  /** Whether a run is actually going. It decides two things and nothing else:
   *  the live-run body shows, and Run now does not — run.sh holds a lock and
   *  would refuse a second batch anyway, but it refuses by logging and exiting
   *  cleanly, which from a button looks exactly like starting. */
  runLive?: boolean
  onRunQueue: () => void
  onOpenRefCards: () => void
  /** The four columns that take a card. Waiting for review takes none — it is
   *  the agent's own column, which is what the dashed edge says — and Doing
   *  takes none either, since nothing puts a run in flight by hand. */
  backlogDrop?: DropZone
  queueDrop?: DropZone
  producedDrop?: DropZone
  doneDrop?: DropZone
}

/* Every body in here is HTML the board just built. See the note above on why,
   and keep it the only way anything gets in: a component that starts taking
   half nodes and half strings is two shapes again.
 *
 * It goes on the id'd element itself rather than on a wrapper inside it. The
 * renderers in 13-plans.js assign to `$('#plansOut').innerHTML` and the
 * stylesheet reaches these ids directly, so an extra div between the id and
 * the content would be a third shape nobody asked for. */
const raw = (html: string) => ({ __html: html })

export function PlansView (props: PlansViewProps) {
  const {
    backlog, queueErrorHTML, statusHTML, queue,
    orphanHTML, doingHTML, doingEmptyHTML,
    doneStatsHTML, doingPlans, review, produced, done,
    backlogCount, queueCount, doingCount, producedCount,
    reviewFilterHTML, doneFilterHTML, runLive, onRunQueue, onOpenRefCards,
    backlogDrop, queueDrop, producedDrop, doneDrop,
    doingSort, reviewSort, producedSort, doneSort,
  } = props

  return (
    <div className="lists pview">
      <Column
        heading="h3"
        title="Backlog"
        cls="reportsview backlogview"
        id="backlogCol"
        desc="The agent leaves these alone. Held back by you, or excluded by a rule."
        count={backlogCount ?? ''}
        action={
          <button className="btn small" id="refCardsBtn" type="button" onClick={onOpenRefCards}>
            Spend and clocks
          </button>
        }
        body={<div id="backlogOut" {...backlogDrop}>{backlog}</div>}
      />

      <Column
        heading="h3"
        title="To do"
        cls="reportsview queueview"
        id="queueDoingCard"
        count={queueCount ?? ''}
        desc="What tonight’s run picks up, in order."
        action={
          <button className={'btn small' + (runLive ? ' hidden' : '')} id="runQueueBtn"
            type="button" onClick={onRunQueue}>
            Run now
          </button>
        }
        body={
          <>
            {/* Capacity — how much of the usage window is left — stays on this
                card rather than going to Doing with the live run. It answers
                whether tonight can run at all, not how the run in flight is
                getting on. */}
            <div className={'err' + (queueErrorHTML ? '' : ' hidden')} id="nightAgentErr"
              dangerouslySetInnerHTML={raw(queueErrorHTML)} />
            <h4 className="fhead">Status</h4>
            <div id="statusOut" dangerouslySetInnerHTML={raw(statusHTML)} />
            <div id="queueOut" {...queueDrop}>{queue}</div>
          </>
        }
      />

      <Column
        heading="h3"
        title="Doing"
        cls="reportsview doingview"
        id="doingCol"
        sort={doingSort}
        count={doingCount ?? ''}
        desc="Currently running."
        body={
          <>
            <div className={orphanHTML ? '' : 'hidden'} id="qdOrphan"
              dangerouslySetInnerHTML={raw(orphanHTML)} />
            <div className={runLive ? '' : 'hidden'} id="doingOut"
              dangerouslySetInnerHTML={raw(doingHTML)} />
            <div id="plansDoing">{doingPlans}</div>
            <div id="doingEmpty" dangerouslySetInnerHTML={raw(doingEmptyHTML)} />
          </>
        }
      />

      <Column
        heading="h3"
        title="Waiting for review"
        cls="reportsview processed"
        style="agent"
        desc="The agent’s own column — what it has worked out, waiting on you. Drag out of it, not into it."
        sort={reviewSort}
        filters={
          <span className="colfilter-slot" id="reviewFilterSlot"
            dangerouslySetInnerHTML={raw(reviewFilterHTML)} />
        }
        body={
          <>
            <div id="doneStatsOut" dangerouslySetInnerHTML={raw(doneStatsHTML)} />
            <div id="plansOut">{review}</div>
          </>
        }
      />

      {/* No filter on this one: every card in it is the same thing, a plan he
          has accepted whose work has not finished. A dropdown with one option
          is a control that only ever says All. */}
      <Column
        heading="h3"
        title="Ready to be produced"
        cls="reportsview decided"
        id="producedCol"
        sort={producedSort}
        count={producedCount ?? ''}
        desc="Accepted as written, and waiting on the implementing agent."
        body={<div id="plansProduced" {...producedDrop}>{produced}</div>}
      />

      <Column
        heading="h3"
        title="Done"
        cls="reportsview finished"
        desc="Completed."
        sort={doneSort}
        filters={
          <span className="colfilter-slot" id="doneFilterSlot"
            dangerouslySetInnerHTML={raw(doneFilterHTML)} />
        }
        body={<div id="plansDone" {...doneDrop}>{done}</div>}
      />
    </div>
  )
}
