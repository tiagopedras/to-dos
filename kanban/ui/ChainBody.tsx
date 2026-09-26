/* The Matrix's second column: every task that waits on another, with what it
 * waits on drawn beside it.
 *
 * `chainSection()` in 10-reference-sections.js still works out which tasks are
 * blocked, ranks them by what is riding on them and finds each blocker; this
 * draws the answer. Each ticket is Tenon's `Card` with the board's `chaincard`
 * class kept on it, since the arrows, the dashed edge on a blocker and the
 * strikethrough on a finished one are that class's rules. A click on a ticket
 * opens the task through the `data-open` attribute, which one delegated
 * listener on `#lists` reads.
 */
import type { CSSProperties } from 'react'
import { Card, ColumnEmpty } from '@tiagopedras/tenon'
import { InlineMd } from './InlineMd'

export interface ChainTicket {
  /** Absent on a blocker whose slug names no task. */
  id?: string
  slug?: string
  color: string
  /** The title as written, inline Markdown and all. */
  title: string
  where: string
  done: boolean
}

export interface ChainEntry {
  target: ChainTicket
  /** What it waits on, in the order the task lists them. */
  blockers: ChainTicket[]
  /** A blocker here carries more weight than the task itself. */
  holdsHigher: boolean
}

function Ticket({ t, role }: { t: ChainTicket, role: 'dep' | 'target' }) {
  const missing = !t.id
  const cls = 'chaincard' + (role === 'dep' ? ' dep' : ' target') + (missing ? ' missing' : '') + (t.done ? ' done' : '')
  /* The tooltip goes on a wrapper that draws nothing, because `Card` spends
     its own `title` prop on the card's title and has no way to set the HTML
     attribute. `display: contents` keeps the card a direct child of the flex
     row it sits in, and a tooltip still shows over everything inside it. */
  return (
    <span title={missing ? 'No task carries this slug' : 'Open this task'} style={{ display: 'contents' }}>
      <Card
        as="div"
        className={cls}
        style={{ ['--bc' as string]: t.color } as CSSProperties}
        data-open={t.id}
      >
        {missing ? (
          <span className="chaintitle">{'#' + t.slug + ' missing'}</span>
        ) : (
          <>
            <span className="chaintitle">
              <InlineMd text={t.title} />
              {t.done ? ' \u2713' : ''}
            </span>
            <div className="chainwhere">{t.where}</div>
          </>
        )}
      </Card>
    </span>
  )
}

export function ChainBody({ entries }: { entries: ChainEntry[] }) {
  if (!entries.length) {
    return <ColumnEmpty>Nothing carries a <code>blocked-by:</code> tag.</ColumnEmpty>
  }
  return (
    <>
      {entries.map(e => (
        <div key={e.target.id} className="chainitem">
          <div className="chainrow">
            <div className="chainfrom">
              {e.blockers.map((b, i) => (
                <div key={(b.id || b.slug || '') + i} className="chaindep">
                  <Ticket t={b} role="dep" />
                  <span className="chainarrow" aria-hidden="true">{'→'}</span>
                </div>
              ))}
            </div>
            <Ticket t={e.target} role="target" />
          </div>
          {e.holdsHigher ? <div className="chainholds">Holds up higher impact work</div> : null}
        </div>
      ))}
    </>
  )
}
