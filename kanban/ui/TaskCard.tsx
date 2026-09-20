/* A task on the board: eyebrow, title, chips and a progress line, on Tenon's
 * `Card`.
 *
 * `cardModel()` in 09-columns.js decides what a task says, and this draws it.
 * `cardHTML()` in the same file draws the same model as a string for the
 * matrix's hover preview, and `test_board.mjs` compares the two element for
 * element. Change what a card shows in cardModel() and both follow; change how
 * a chip or the progress line is drawn and change it in both.
 *
 * The title arrives as the HTML the board's own inline Markdown made, because
 * that renderer knows `[text](url)` links and `[placeholder]` markers Tenon's
 * `Markdown` does not, and the drawer shares it. It sits in one span, which
 * the string version does not emit; the test steps over it.
 */
import type { DragEvent, KeyboardEvent } from 'react'
import { Card } from '@tiagopedras/tenon'

export interface Chip {
  cls: string
  text: string
  title?: string
  /** Set on the project chip, which opens the project rather than the card. */
  project?: string
}

export type CardProgress =
  | { kind: 'steps', done: number, total: number, pct: number }
  | { kind: 'notes', n: number }

export interface TaskCardModel {
  id: string
  /** `done`, `waiting`, `blocked` or `backlog`, plus `onething` for the headline. */
  cls: string
  titleHTML: string
  chips: Chip[]
  /** Urgent and due, drawn together in the row's own corner. */
  when: Chip[]
  progress: CardProgress | null
}

export interface TaskCardProps {
  model: TaskCardModel
  /** The bucket's colour, for the stripe. */
  stripe: string
  /** The bucket's name, shown only when more than one bucket is on screen. */
  bucketLabel: string
  draggable: boolean
  dragging: boolean
  /** A picture of the card rather than one to act on: no focus, no role, no
   *  handlers. The matrix's hover preview is one, and must not land in the tab
   *  order or take a click meant for whatever is under it. */
  static?: boolean
  onOpen?: (id: string) => void
  onDragStart?: (e: DragEvent<HTMLElement>, id: string) => void
  onDragEnd?: (e: DragEvent<HTMLElement>, id: string) => void
}

function ChipSpan({ c }: { c: Chip }) {
  return (
    <span className={c.cls} data-project={c.project} title={c.title}>{c.text}</span>
  )
}

export function TaskCard(props: TaskCardProps) {
  const { model: m, stripe, bucketLabel, draggable, dragging, onOpen, onDragStart, onDragEnd } = props
  const still = !!props.static
  const open = () => { if (onOpen) onOpen(m.id) }
  const key = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
  }

  const tags = (m.chips.length || m.when.length) ? (
    <>
      {m.chips.map((c, i) => <ChipSpan key={i} c={c} />)}
      {m.when.length ? (
        <span className="meta-when">{m.when.map((c, i) => <ChipSpan key={i} c={c} />)}</span>
      ) : null}
    </>
  ) : null

  const p = m.progress
  const body = !p ? null : p.kind === 'steps' ? (
    <div className="prog">
      <span>{p.done + '/' + p.total + ' steps'}</span>
      <span className="bar"><i style={{ width: p.pct + '%' }} /></span>
    </div>
  ) : (
    <div className="notecount">{p.n + ' note' + (p.n > 1 ? 's' : '')}</div>
  )

  return (
    <Card
      className={(m.cls + (dragging ? ' dragging' : '')).trim()}
      accent={stripe}
      draggable={still ? false : draggable}
      dragging={dragging}
      tabIndex={still ? undefined : 0}
      role={still ? undefined : 'button'}
      data-id={m.id}
      onClick={still ? undefined : open}
      onKeyDown={still ? undefined : key}
      onDragStart={still || !onDragStart ? undefined : e => onDragStart(e, m.id)}
      onDragEnd={still || !onDragEnd ? undefined : e => onDragEnd(e, m.id)}
      eyebrow={bucketLabel ? <span className="bucket">{bucketLabel}</span> : undefined}
      title={<span dangerouslySetInnerHTML={{ __html: m.titleHTML }} />}
      tags={tags}
      body={body}
    />
  )
}
