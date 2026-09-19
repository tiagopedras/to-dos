/* Plans — the seven columns a plan moves through.
 *
 * The fourth view off the string builders, and the first one that is a board
 * rather than a page: Backlog, To do, Doing, Waiting for review, Ready to be
 * produced, Producing, Done. Where a card sits is the instruction, the same as
 * on the task board, which is why Waiting for review draws with the dashed edge
 * and takes no drops — it is the agent's own column.
 *
 * Producing arrived 16 Sep 2026 and is drawn from `production: doing` rather
 * than from `state:`, which is what a seventh column costs: the contract
 * allows one `state:` per file, so the second half of the pipeline is a field.
 *
 * What this component is, and what it deliberately is not
 * ------------------------------------------------------
 * It is the shell: six `Column`s, their heads, their descriptions, their
 * counts, their filter slots and the two buttons in Backlog's and To do's
 * heads. That is the half that was six longhand `colHTML()` calls, and it is
 * the half `test_primitives.mjs` already holds `Column` to.
 *
 * Every one of the six bodies is a list of `PlanCard`s since 15 Sep 2026, and
 * every card on the view is that one card. The two that were not are the two
 * that hold something other than a written plan, and both draw it as a stub of
 * the same card rather than as a shape of its own: Backlog's held tasks
 * (`heldPlanCardNode()`, eyebrow "held") and To do's queue rows
 * (`queueRowNode()`, eyebrow "no plan yet"). A card in either column is the
 * same instruction as the plan cards beside it — leave it alone, or plan it
 * tonight — so it is the eyebrow that carries the difference rather than a
 * second card shape.
 *
 * The stubs keep what a plan has no use for, through props `PlanCard` grew for
 * them: `action` for Release and Hold, since neither has a plan to open
 * instead, `position` for the queue's rank, which is what a drag there edits,
 * and `attrs` for the four drop handlers a queue row carries as a reorder
 * target.
 * Nothing arrives as an HTML string any more. What four independent fetches
 * fill at different times — `/plans.json`, `/queue.json`, the agent's own
 * status, and the usage reconstruction that takes about a second — is data
 * here: `liveRun`, `orphan`, `queueError` and the two filters are plain
 * objects, and this file turns each into markup. The board's classic scripts
 * have no JSX, so handing them a shape to fill in is what keeps them from
 * assembling elements by hand.
 *
 * This view re-renders, which the shell-only version of it deliberately did
 * not. Every body is a prop, and `plansProps` in `13-plans.js` is the one
 * object they all come out of — the sixteen `innerHTML` assignments that used
 * to fill these nodes by id went in one change, because half-and-half is the
 * arrangement that would silently drop a column. Nothing outside that file
 * writes into this tree either: To do's own description is handed over by
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
import { Alert, Column, ColumnEmpty } from '@tiagopedras/tenon'
import { ColumnFilter, type ColumnFilterProps } from './ColumnFilter'

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
  /** To do: the error line and tonight's queue. The error is a sentence, or
   *  null when there is nothing to say. */
  queueError: string | null
  /** To do's own description — when the current usage window closes, and how
   *  long is left in it — replacing the static sentence every other column
   *  keeps, since this is the one column where that answer changes by the
   *  minute. */
  queueDesc: ReactNode
  queue: ReactNode
  /** Doing: an orphaned lock notice, the live run, plans in production, or nothing. */
  orphan: { title: string } | null
  liveRun: LiveRun | null
  /** Says nothing is running. Only meaningful when there is no live run and
   *  no plan parked in `doing`, which is for the caller to work out. */
  doingEmpty: boolean
  /** Waiting for review's own description — the same move as queueDesc:
   *  when the last run started and how far it got, in place of the static
   *  sentence. */
  reviewDesc: ReactNode
  /** The four columns that hold nothing but plans, as nodes — `PlanCard`s, or
   *  the column's empty state. */
  doingPlans: ReactNode
  review: ReactNode
  produced: ReactNode
  /** Producing: the plans the implementing agent has in hand right now,
   *  `production: doing`. */
  producing: ReactNode
  done: ReactNode
  /** The priority/night toggle for each of the four, built by plansSortBtn()
   *  in 13-plans.js — a prop rather than a slot filled after paint, the same
   *  as every other handler on this view. */
  doingSort?: ReactNode
  reviewSort?: ReactNode
  producedSort?: ReactNode
  producingSort?: ReactNode
  doneSort?: ReactNode
  /** Counts in the heads. An empty string draws no count at all — the two
   *  filtered columns say "All 12" on their own button, and the same number
   *  twice in one head is one too many. */
  backlogCount?: string
  queueCount?: string
  doingCount?: string
  producedCount?: string
  producingCount?: string
  /** The two filter dropdowns, or null for a column with nothing to narrow. */
  reviewFilterProps: ColumnFilterProps | null
  doneFilterProps: ColumnFilterProps | null
  /** Whether a run is actually going. It decides two things and nothing else:
   *  the live-run body shows, and Run now does not — run.sh holds a lock and
   *  would refuse a second batch anyway, but it refuses by logging and exiting
   *  cleanly, which from a button looks exactly like starting. */
  runLive?: boolean
  onRunQueue: () => void
  onOpenRefCards: () => void
  /** The five columns that take a card. Waiting for review takes none — it is
   *  the agent's own column, which is what the dashed edge says — and Doing
   *  takes none either, since nothing puts a run in flight by hand. Producing
   *  takes them and gives none back: the cards in it are not draggable, which
   *  `13-plans.js` sets on the card rather than here. */
  backlogDrop?: DropZone
  queueDrop?: DropZone
  producedDrop?: DropZone
  producingDrop?: DropZone
  doneDrop?: DropZone
}

/* What the live-run body says. A run that is going but between two tasks has
   no current task to name, which is the second shape. */
export type LiveRun =
  | { between: false, title: string, agent: string, since: string }
  | { between: true }

function LiveRunBody({ run }: { run: LiveRun }) {
  return (
    <div className="fnow">
      <i className="fspin" />
      <div>
        {run.between ? (
          <>
            <strong>A run is going</strong>
            <div className="repmeta">between tasks {'\u2014'} nothing in flight this second</div>
          </>
        ) : (
          <>
            <strong>{run.title}</strong>
            <div className="repmeta">{run.agent} {'\u00b7'} started {run.since}</div>
          </>
        )}
      </div>
    </div>
  )
}

export function PlansView (props: PlansViewProps) {
  const {
    backlog, queueError, queueDesc, queue,
    orphan, liveRun, doingEmpty,
    reviewDesc, doingPlans, review, produced, producing, done,
    backlogCount, queueCount, doingCount, producedCount, producingCount,
    reviewFilterProps, doneFilterProps, runLive, onRunQueue, onOpenRefCards,
    backlogDrop, queueDrop, producedDrop, producingDrop, doneDrop,
    doingSort, reviewSort, producedSort, producingSort, doneSort,
  } = props

  return (
    <div className="lists pview" style={{ ['--pcols' as string]: 7 }}>
      <Column
        titleAs="h3"
        title="Backlog"
        className="reportsview backlogview"
        id="backlogCol"
        desc="The agent leaves these alone. Held back by you, or excluded by a rule."
        count={backlogCount ?? ''}
        action={
          <button className="btn small" id="refCardsBtn" type="button" onClick={onOpenRefCards}>
            Spend and clocks
          </button>
        }
        children={<div id="backlogOut" {...backlogDrop}>{backlog}</div>}
      />

      <Column
        titleAs="h3"
        title="To do"
        className="reportsview queueview"
        id="queueDoingCard"
        count={queueCount ?? ''}
        desc={queueDesc}
        action={
          <button className={'btn small' + (runLive ? ' hidden' : '')} id="runQueueBtn"
            type="button" onClick={onRunQueue}>
            Run now
          </button>
        }
        children={
          <>
            {/* Capacity — how much of the usage window is left — stays on this
                card rather than going to Doing with the live run. It answers
                whether tonight can run at all, not how the run in flight is
                getting on. */}
            {queueError ? <Alert tone="error" id="nightAgentErr">{queueError}</Alert> : null}
            <div id="queueOut" {...queueDrop}>{queue}</div>
          </>
        }
      />

      <Column
        titleAs="h3"
        title="Doing"
        tone="running"
        titleAfter={<span className="colgear" aria-hidden="true" />}
        className="reportsview doingview"
        id="doingCol"
        sort={doingSort}
        count={doingCount ?? ''}
        desc="Currently running."
        children={
          <>
            <div className={orphan ? '' : 'hidden'} id="qdOrphan">
              {orphan ? (
                <Alert tone="error">
                  The last run stopped part way through <strong>{orphan.title}</strong> and
                  never finished. Its lock is gone, so nothing is running now.
                </Alert>
              ) : null}
            </div>
            <div className={runLive ? '' : 'hidden'} id="doingOut">
              {liveRun ? <LiveRunBody run={liveRun} /> : null}
            </div>
            <div id="plansDoing">{doingPlans}</div>
            <div id="doingEmpty">
              {doingEmpty ? (
                <ColumnEmpty boxed>
                  Nothing running. The planning agent starts at its scheduled hour, or from Run now.
                </ColumnEmpty>
              ) : null}
            </div>
          </>
        }
      />

      <Column
        titleAs="h3"
        title="Waiting for review"
        className="reportsview processed"
        dashed
        desc={reviewDesc}
        sort={reviewSort}
        filters={
          <span className="colfilter-slot" id="reviewFilterSlot">
            {reviewFilterProps ? <ColumnFilter {...reviewFilterProps} /> : null}
          </span>
        }
        children={<div id="plansOut">{review}</div>}
      />

      {/* No filter on this one: every card in it is the same thing, a plan he
          has accepted whose work has not finished. A dropdown with one option
          is a control that only ever says All. */}
      <Column
        titleAs="h3"
        title="Ready to be produced"
        className="reportsview decided"
        id="producedCol"
        sort={producedSort}
        count={producedCount ?? ''}
        desc="Accepted as written, and waiting on the implementing agent."
        children={<div id="plansProduced" {...producedDrop}>{produced}</div>}
      />

      {/* One-way. It takes drops, and nothing in it drags out — what happens
          next is the agent reporting back or the work finishing, neither of
          which is a card to move. */}
      <Column
        titleAs="h3"
        title="Producing"
        tone="running"
        titleAfter={<span className="colgear" aria-hidden="true" />}
        className="reportsview decided"
        id="producingCol"
        sort={producingSort}
        count={producingCount ?? ''}
        desc="Being made now by the implementing agent."
        children={<div id="plansProducing" {...producingDrop}>{producing}</div>}
      />

      <Column
        titleAs="h3"
        title="Done"
        className="reportsview finished"
        desc="Completed."
        sort={doneSort}
        filters={
          <span className="colfilter-slot" id="doneFilterSlot">
            {doneFilterProps ? <ColumnFilter {...doneFilterProps} /> : null}
          </span>
        }
        children={<div id="plansDone" {...doneDrop}>{done}</div>}
      />
    </div>
  )
}
