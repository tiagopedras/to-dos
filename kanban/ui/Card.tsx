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

export interface CardProps {
  title?: ReactNode
  eyebrow?: ReactNode
  position?: ReactNode
  action?: ReactNode
  tags?: ReactNode
  meta?: ReactNode
  summary?: ReactNode
  progress?: ReactNode
  note?: ReactNode
  extra?: ReactNode
  /** The colour of the left edge and the eyebrow, as --bc. Undefined draws no
   *  stripe at all, which is not the same as drawing a grey one. */
  stripe?: string
  cls?: string
  /** 'article' unless a caller needs the card to be something else. */
  tag?: 'article' | 'div' | 'li'
  children?: ReactNode
}

export function Card(props: CardProps) {
  const {
    title, eyebrow, position, action, tags, meta, summary,
    progress, note, extra, stripe, cls, tag, children,
  } = props

  const Tag = tag || 'article'
  const className = ('card ' + (cls || '')).trim().replace(/\s+/g, ' ')
  /* A custom property, which React will not take off a plain style object
     without the cast — it types style as CSSProperties and --bc is not one. */
  const style = stripe ? ({ ['--bc' as string]: stripe } as CSSProperties) : undefined

  return (
    <Tag className={className} style={style}>
      {eyebrow ? <div className="row1">{eyebrow}</div> : null}
      <div className="cardhead">
        {position ? <span className="cardpos">{position}</span> : null}
        <div className="title">{title}</div>
        {action ? <span className="cardact">{action}</span> : null}
      </div>
      {tags ? <div className="meta">{tags}</div> : null}
      {meta ? <div className="cardmeta">{meta}</div> : null}
      {summary ? <div className="cardsum">{summary}</div> : null}
      {progress}
      {note ? <div className="notecount">{note}</div> : null}
      {extra}
      {children}
    </Tag>
  )
}
