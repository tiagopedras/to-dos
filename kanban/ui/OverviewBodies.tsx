/* What is inside Overview's four reference columns and its Context column.
 *
 * Big rocks, This week, Quick wins and Delegate to Claude each build a list of
 * blocks in 10-reference-sections.js and hand it over as data: a run of cards,
 * a group under a heading, a note about what was left out. This draws them. A
 * card is Tenon's `Card` with the board's `ref` class kept on it, since the
 * tick box, the dimming of a finished one and the message underneath are that
 * class's rules, and `capMsgCards()` measures `.ref .msg` after the paint.
 *
 * Every control keeps the attribute the delegated listener on `#lists` reads
 * (`data-tick`, `data-open`, `data-unweek`, `data-quickdismiss`,
 * `data-quickrestore`, `data-quicksort`), so `25-archiving.js` is untouched.
 * They are attributes and not props because the same listener also serves the
 * drawer and Plans, which are not React yet.
 *
 * The message, prompt, agenda and Jira notes under a card arrive as markup,
 * because the drawer draws the same notes with the same builders and the copy
 * and Claude buttons inside them are wired by that shared listener too.
 */
import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import { Alert, Card, ColumnEmpty } from '@tiagopedras/tenon'
import type { Chip } from './TaskCard'

export interface RefModel {
  id: string
  /** The line of the sub-step this card is built from, or null for a task. */
  sub: number | null
  color: string
  done: boolean
  titleHTML: string
  /** Bucket, parent and column, since the card is shown away from its own. */
  where: string
  chips: Chip[]
  /** Message, prompt, agenda or Jira note, as the drawer's own builders draw it. */
  bodyHTML: string
  /** Shows Not this week. */
  unweek: boolean
  /** The key that Dismiss writes, or null for no button. */
  quickDismiss: string | null
}

export type EmptyKind = 'week' | 'rocks' | 'quick' | 'delegate'

export type RefBlock =
  | { kind: 'cards', cards: RefModel[] }
  | { kind: 'ranked', cards: RefModel[] }
  | { kind: 'group', label: string, cards: RefModel[] }
  | { kind: 'warn', text: string }
  | { kind: 'held', parts: { n: number, text: string }[] }
  | { kind: 'more', hidden: number }
  | { kind: 'dismissed', n: number }
  | { kind: 'empty', which: EmptyKind }

function ChipSpan({ c }: { c: Chip }) {
  return <span className={c.cls} data-project={c.project} title={c.title}>{c.text}</span>
}

export function RefCard({ m }: { m: RefModel }) {
  const target = m.sub != null ? m.sub : undefined
  return (
    <Card
      as="article"
      className={'ref' + (m.done ? ' done' : '')}
      accent={m.color}
      style={{ ['--bc' as string]: m.color } as CSSProperties}
      lead={
        <button
          className="refbox"
          data-tick={m.id}
          data-sub={target}
          role="checkbox"
          aria-checked={m.done}
          title={m.done ? 'Mark as not done' : 'Mark as done'}
        >
          {m.done ? '✓' : ''}
        </button>
      }
      title={
        <button
          className="reftitle"
          data-open={m.id}
          title="Open this task"
          dangerouslySetInnerHTML={{ __html: m.titleHTML }}
        />
      }
      action={
        m.unweek ? (
          <button className="refdrop" data-unweek={m.id} data-sub={target} title="Take this out of the week">
            Not this week
          </button>
        ) : m.quickDismiss != null ? (
          <button
            className="refdrop"
            data-quickdismiss={m.quickDismiss}
            title="Dismiss this suggestion. Nothing about the task changes — it just stops showing here until you bring it back."
          >
            Dismiss
          </button>
        ) : undefined
      }
    >
      <div className="refwhere">{m.where}</div>
      {m.chips.length ? <div className="meta">{m.chips.map((c, i) => <ChipSpan key={i} c={c} />)}</div> : null}
      {m.bodyHTML ? <div className="refbody" dangerouslySetInnerHTML={{ __html: m.bodyHTML }} /> : null}
    </Card>
  )
}

function Empty({ which }: { which: EmptyKind }) {
  switch (which) {
    case 'week': return <ColumnEmpty>Nothing is tagged <code>week</code> yet.</ColumnEmpty>
    case 'rocks': return <ColumnEmpty>No high impact, L effort tasks.</ColumnEmpty>
    case 'quick': return <ColumnEmpty>Nothing small enough to clear in a gap.</ColumnEmpty>
    case 'delegate': return <ColumnEmpty>Nothing is tagged <code>ai:full</code>.</ColumnEmpty>
  }
}

export function RefSection({ blocks }: { blocks: RefBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'cards':
            return <Fragment key={i}>{b.cards.map(c => <RefCard key={c.id + (c.sub ?? '')} m={c} />)}</Fragment>
          case 'ranked':
            return (
              <div key={i} className="refrank">
                {b.cards.map((c, n) => (
                  <div key={c.id + (c.sub ?? '')} className="refrow">
                    <span className="refnum">{n + 1}</span>
                    <RefCard m={c} />
                  </div>
                ))}
              </div>
            )
          case 'group':
            return (
              <Fragment key={i}>
                <h4 className="refgroup">{b.label}</h4>
                {b.cards.map(c => <RefCard key={c.id + (c.sub ?? '')} m={c} />)}
              </Fragment>
            )
          case 'warn':
            return <Alert key={i} tone="warning" className="refwarn">{b.text}</Alert>
          case 'held':
            return (
              <p key={i} className="refheld">
                {'Left out: '}
                {b.parts.map((p, j) => (
                  <span key={j}>{j ? ' · ' : ''}<strong>{p.n}</strong> {p.text}</span>
                ))}
                {'.'}
              </p>
            )
          case 'more':
            return <p key={i} className="refmore">+{b.hidden} more not shown here {'—'} open the board to see the rest.</p>
          case 'dismissed':
            return (
              <p key={i} className="refmore">
                {b.n} dismissed. <button type="button" className="reflink" data-quickrestore>Show them again</button>
              </p>
            )
          case 'empty':
            return <Empty key={i} which={b.which} />
        }
      })}
    </>
  )
}

/* ---- Context ---- */

export interface ContextItem {
  textHTML: string
  chip: Chip | null
}
export interface ContextGroup {
  /** Null for what sits before the first heading, which is not collapsed. */
  title: string | null
  items: ContextItem[]
}

/* Standing facts, not tasks. A group with a heading folds behind it, since a
   dozen `###` sections are most of the column's length and only one is usually
   being read. Native <details>, left uncontrolled, so which ones he opened
   survives a redraw, which the string version lost every time. */
export function ContextBody({ groups }: { groups: ContextGroup[] }) {
  const items = (list: ContextItem[]) => list.map((it, i) => (
    <Card key={i} as="article" className="ref ctx">
      <div className="ctxtext" dangerouslySetInnerHTML={{ __html: it.textHTML }} />
      {it.chip ? <div className="meta"><ChipSpan c={it.chip} /></div> : null}
    </Card>
  ))
  return (
    <>
      {groups.map((g, i) => g.title
        ? <details key={i} className="ctxgroup"><summary>{g.title}</summary>{items(g.items)}</details>
        : <Fragment key={i}>{items(g.items)}</Fragment>)}
    </>
  )
}
