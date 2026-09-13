/* A plan, as a card — `planItemHTML()`'s twin in kanban/js/13-plans.js.
 *
 * The first thing inside a Plans column to stop being a string. Four of the six
 * columns hold nothing but these, so porting this one card ports four column
 * bodies; Backlog and To do hold queue rows and skipped-task lines as well, and
 * those are still built longhand beside it.
 *
 * What it does not do is decide anything. Which class the card takes, which
 * colour its stripe is, which word its eyebrow carries, whether the task it is
 * about can still be found on the board — all of that is `13-plans.js`'s, read
 * off the plan and the live document at paint time, and arrives here as props.
 * That is the same split `ProjectsView` is written under and for the same
 * reason: the component stays pure, and a port stays one change rather than
 * two.
 *
 * Two rows arrive as markup rather than as nodes, and both are the board's own:
 * `scoresHTML` is `planScoreHTML()`, which is `cardMetaHTML()`'s chips spelled
 * the same way so a plan and the task it is about read alike, and `summaryHTML`
 * is `mdInline()`. Porting either means porting the board's Markdown, which is
 * a different job from porting this card.
 *
 * The two rows under the title. The task's name is the long thing here — long
 * enough to take a line on its own at this column width, and long enough that
 * letting it wrap in among everything else pushed the row to three ragged
 * lines. So it gets its own line, and everything else gets one: the scores and
 * then where the card sits, on a single line above it. It used to be one run of
 * text with the scores bolted on the front and the link on the end, which put
 * the two things worth scanning — a 🔥/S, and the name of the card — at
 * opposite ends of a line whose middle was a bucket he had already filtered to.
 *
 * The link carries the task's own title rather than the words "open the card",
 * which is what makes it worth reading rather than only worth clicking. It is
 * the task's title and not the plan's: the two are written the same today, so
 * most rows say it twice, but a task renamed since the night it was planned is
 * exactly the case where the row has to say which card it actually opens.
 *
 * The state the plan is in is the card's eyebrow. It sat at the right-hand end
 * of the title row until 12 Sep 2026, which put the one word saying what to do
 * about the card furthest from where reading starts — and left the eyebrow
 * slot, where a task card says which bucket it is in, empty on every plan. The
 * eyebrow takes --bc, so the word and the stripe are the same colour and say
 * the same thing once.
 *
 * The data attributes are load-bearing. `13-plans.js` wires opening, the link
 * back to the task and the drag off this card by querying for them after every
 * paint — see the note at the top of PlansView about why the wiring lives next
 * to the painting. They go when the whole view takes handlers, not before.
 */
import { Card } from './Card'

export interface PlanCardProps {
  /** The plan's own file, which is its identity everywhere on this view. */
  url: string
  title: string
  /** `planClass(p)` — ' agreed', ' redo', ' parked', ' read', ' actioned', or
   *  nothing at all for a plan in flight. */
  variant?: string
  /** `planStripe(p)`. Undefined draws no stripe, and the card says so in its
   *  own class the way every other stripeless card does. */
  stripe?: string
  /** `planWord(p)` — the state the plan is in, as the eyebrow. */
  word: string
  /** `productionWord(p)`, and the raw `production:` it was read from. Empty on
   *  every plan he has not accepted. */
  production?: string
  productionKind?: string
  /** `needs_you` — the agent stopped and asked rather than guessing. */
  needsYou?: boolean
  /** The task this plan is about: the key to go to, and what to call it. */
  gotoKey?: string
  gotoLabel?: string
  /** Bucket, column and when it was written. Blanks are dropped here rather
   *  than by the caller, since the separator is this component's business. */
  where?: (string | undefined)[]
  /** Markup the board built: the task's chips, and the summary as Markdown. */
  scoresHTML?: string
  summaryHTML?: string
  /** What he told the agent when he sent it back. */
  feedback?: string
}

export function PlanCard(props: PlanCardProps) {
  const {
    url, title, variant, stripe, word, production, productionKind,
    needsYou, gotoKey, gotoLabel, where, scoresHTML, summaryHTML, feedback,
  } = props

  const cls = 'repitem planitem' + (variant || '') +
    (needsYou ? ' folded' : '') + (stripe ? '' : ' nostripe')
  const line = (where || []).filter(Boolean).join(' · ')

  return (
    <Card
      cls={cls}
      stripe={stripe}
      attrs={{ draggable: true, 'data-plan': url, 'data-plan-open': url }}
      eyebrow={
        <>
          <span className="bucket">{word}</span>
          {(needsYou || production) ? (
            <span className="right">
              {production ? (
                <span className={'planprod planprod-' + (productionKind || 'none')}
                  title="How far the implementing agent has got with this one">
                  {production}
                </span>
              ) : null}
              {needsYou ? (
                <span className="planfold"
                  title="The agent stopped and asked rather than guessing">
                  needs you
                </span>
              ) : null}
            </span>
          ) : null}
        </>
      }
      title={title}
      tags={scoresHTML ? { __html: scoresHTML } : null}
      meta={(line || gotoKey) ? (
        <>
          {line ? <span className="planwhere">{line}</span> : null}
          {gotoKey ? (
            <button className="plangoto" data-plan-goto={gotoKey}
              title="Open this task on the board">
              {(gotoLabel || gotoKey) + ' ↗'}
            </button>
          ) : null}
        </>
      ) : null}
      summary={summaryHTML ? { __html: summaryHTML } : null}
      extra={feedback ? (
        <div className="planredo"><b>Sent back:</b>{' ' + feedback}</div>
      ) : null}
    />
  )
}
