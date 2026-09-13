/* The card, as a component — the same object cardShellHTML() emits in
 * kanban/js/09-columns.js, for the same reason Column is colHTML()'s: the card
 * is one shape across the board, Plans, Execution, Overview and the queue, and
 * a second shape here would split it on the first view that got ported.
 *
 * The anatomy, top to bottom, every row optional but the title:
 *
 *   eyebrow    10.5 bold uppercase, coloured by --bc — the same colour the
 *              stripe takes, so a card's mark and its label agree. On a task
 *              that is the bucket; on a plan it is the state it is in.
 *   head       position · title · action
 *   tags       four chips left, two pinned right
 *   meta       where it sits · a link back to the card
 *   summary    what the document says, at rest
 *   progress   steps done, and the bar
 *   note       how many notes are on it
 *   stripe     3px down the left edge, --bc
 *
 * `stripe` left undefined draws no stripe rather than drawing one in the line
 * colour. That is what the component does on a queue card and on a plan nobody
 * needs to look at, and the difference matters: a grey stripe still reads as a
 * mark, and the point of leaving it off is that there is nothing to mark.
 *
 * The gaps come from the component: 5px between rows, and a few rows carry a
 * little more of their own — tags 2, meta 4, summary 6, progress 3, note 1.
 */
import type { CSSProperties, ReactNode } from 'react'

/* A row the card wraps in a div of its own, given either as nodes or as markup
   the board already built. The second form exists because two of them are the
   board's own output and stay that way for now — the task's score chips, and a
   summary run through the board's Markdown — and wrapping either in a span to
   carry it would put an element in the markup that cardShellHTML does not
   emit. It goes on the row's own div, which is the element both spellings
   agree on. */
export type CardRow = ReactNode | { __html: string }

export interface CardProps {
  title?: ReactNode
  eyebrow?: CardRow
  position?: ReactNode
  action?: ReactNode
  tags?: CardRow
  meta?: CardRow
  summary?: CardRow
  progress?: ReactNode
  note?: CardRow
  extra?: ReactNode
  /** The colour of the left edge and the eyebrow, as --bc. Undefined draws no
   *  stripe at all, which is not the same as drawing a grey one. */
  stripe?: string
  cls?: string
  /** 'article' unless a caller needs the card to be something else. */
  tag?: 'article' | 'div' | 'li'
  /** Anything else the card's own element carries — `draggable`, the data
   *  attributes a view wires itself against. cardShellHTML takes the same thing
   *  as a string of attributes; this takes them as props because React writes
   *  them and a half-escaped string here would be a hole rather than a shape. */
  attrs?: Record<string, unknown>
  children?: ReactNode
}

export function Card(props: CardProps) {
  const {
    title, eyebrow, position, action, tags, meta, summary,
    progress, note, extra, stripe, cls, tag, attrs, children,
  } = props

  const Tag = tag || 'article'
  const className = ('card ' + (cls || '')).trim().replace(/\s+/g, ' ')
  /* A custom property, which React will not take off a plain style object
     without the cast — it types style as CSSProperties and --bc is not one. */
  const style = stripe ? ({ ['--bc' as string]: stripe } as CSSProperties) : undefined

  /* One spelling of "wrap this row in its div", whichever currency it arrived
     in. An empty row draws nothing at all, the same as the string builder
     skipping it. */
  const row = (rowCls: string, v: CardRow) => {
    if (!v) return null
    if (typeof v === 'object' && v !== null && '__html' in v)
      return <div className={rowCls} dangerouslySetInnerHTML={v as { __html: string }} />
    return <div className={rowCls}>{v as ReactNode}</div>
  }

  return (
    <Tag className={className} style={style} {...attrs}>
      {row('row1', eyebrow)}
      <div className="cardhead">
        {position ? <span className="cardpos">{position}</span> : null}
        <div className="title">{title}</div>
        {action ? <span className="cardact">{action}</span> : null}
      </div>
      {row('meta', tags)}
      {row('cardmeta', meta)}
      {row('cardsum', summary)}
      {progress}
      {row('notecount', note)}
      {extra}
      {children}
    </Tag>
  )
}
