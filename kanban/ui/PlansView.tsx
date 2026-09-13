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
 * It is not the cards. Every body arrives as an HTML string built by
 * `kanban/js/13-plans.js` and goes in through `dangerouslySetInnerHTML`, the
 * same bargain ReportsView already makes. That is not laziness about the
 * remaining 1,400 lines: the bodies are filled by four independent fetches
 * that land at different times — `/plans.json`, `/queue.json`, the agent's own
 * status, and the usage reconstruction that takes about a second — and each
 * one paints as it arrives rather than the view waiting on the slowest. Making
 * the cards components means porting the drag wiring, the six modals and the
 * two write paths in the same change, and Plans is the one view in the app
 * that writes to disk. So the shell goes first and the bodies follow, which is
 * also what lets the 123 checks in `kanban/test_plans.mjs` judge this port
 * without being rewritten.
 *
 * The consequence to keep in mind: a re-render replaces every body node, so
 * anything the board wired onto those nodes is wired again after each paint.
 * `paintPlans()` in `13-plans.js` is the one place that happens, and it is why
 * the wiring lives next to the painting rather than anywhere else.
 */
import { Column } from './Column'

export interface PlansViewProps {
  /** Backlog: what the agent is to leave alone. */
  backlogHTML: string
  /** To do: the error line, the Status block and tonight's queue, in that order. */
  queueErrorHTML: string
  statusHTML: string
  queueHTML: string
  /** Doing: an orphaned lock notice, the live run, plans in production, or nothing. */
  orphanHTML: string
  doingHTML: string
  plansDoingHTML: string
  doingEmptyHTML: string
  /** Waiting for review: the counts above the agent's own cards. */
  doneStatsHTML: string
  reviewHTML: string
  /** The last two columns. */
  producedHTML: string
  doneHTML: string
  /** Counts in the heads. An empty string draws no count at all — the two
   *  filtered columns say "All 12" on their own button, and the same number
   *  twice in one head is one too many. */
  backlogCount?: string
  queueCount?: string
  doingCount?: string
  producedCount?: string
  /** The two filter dropdowns, built by colFilterHTML() and wired after paint. */
  reviewFilterHTML: string
  doneFilterHTML: string
  onRunQueue: () => void
  onOpenRefCards: () => void
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
    backlogHTML, queueErrorHTML, statusHTML, queueHTML,
    orphanHTML, doingHTML, plansDoingHTML, doingEmptyHTML,
    doneStatsHTML, reviewHTML, producedHTML, doneHTML,
    backlogCount, queueCount, doingCount, producedCount,
    reviewFilterHTML, doneFilterHTML, onRunQueue, onOpenRefCards,
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
        body={<div id="backlogOut" dangerouslySetInnerHTML={raw(backlogHTML)} />}
      />

      <Column
        heading="h3"
        title="To do"
        cls="reportsview queueview"
        id="queueDoingCard"
        count={queueCount ?? ''}
        desc="What tonight’s run picks up, in order."
        action={
          <button className="btn small" id="runQueueBtn" type="button" onClick={onRunQueue}>
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
            <div id="queueOut" dangerouslySetInnerHTML={raw(queueHTML)} />
          </>
        }
      />

      <Column
        heading="h3"
        title="Doing"
        cls="reportsview doingview"
        id="doingCol"
        count={doingCount ?? ''}
        desc="Currently running."
        body={
          <>
            <div className={orphanHTML ? '' : 'hidden'} id="qdOrphan"
              dangerouslySetInnerHTML={raw(orphanHTML)} />
            <div id="doingOut" dangerouslySetInnerHTML={raw(doingHTML)} />
            <div id="plansDoing" dangerouslySetInnerHTML={raw(plansDoingHTML)} />
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
        filters={
          <span className="colfilter-slot" id="reviewFilterSlot"
            dangerouslySetInnerHTML={raw(reviewFilterHTML)} />
        }
        body={
          <>
            <div id="doneStatsOut" dangerouslySetInnerHTML={raw(doneStatsHTML)} />
            <div id="plansOut" dangerouslySetInnerHTML={raw(reviewHTML)} />
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
        count={producedCount ?? ''}
        desc="Accepted as written, and waiting on the implementing agent."
        body={<div id="plansProduced" dangerouslySetInnerHTML={raw(producedHTML)} />}
      />

      <Column
        heading="h3"
        title="Done"
        cls="reportsview finished"
        desc="Completed."
        filters={
          <span className="colfilter-slot" id="doneFilterSlot"
            dangerouslySetInnerHTML={raw(doneFilterHTML)} />
        }
        body={<div id="plansDone" dangerouslySetInnerHTML={raw(doneHTML)} />}
      />
    </div>
  )
}
