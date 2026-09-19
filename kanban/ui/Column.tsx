/* The column, as a component.
 *
 * This is the same object colHTML() in kanban/js/09-columns.js emits, and that
 * is the whole point of it: since 12 Sep 2026 every column in the app — the
 * three boards, Overview's seven sections, Matrix's two, the Timeline,
 * Backups, Projects and the Spend modal's reference cards — is one shape, so the fill, the border, the radius, the 322px width, the 12px
 * gap and both paddings are settled once. A second shape here would undo that
 * on the first view that got ported.
 *
 * So the markup below is colHTML()'s markup, element for element and class for
 * class, and kanban/ui/test_primitives.mjs holds the two side by side and fails
 * if they ever disagree. What differs is only what a component can do that a
 * string cannot: the optional parts are nodes rather than pre-escaped HTML, so
 * a caller passes a real element instead of concatenating a fragment and hoping
 * it was escaped on the way in.
 *
 * The Figma `Column` and `Column header` components carry the same set of
 * optional parts and are meant to be changed alongside this.
 */
import type { ReactNode } from 'react'

export type ColumnStyle = 'default' | 'agent'

export interface ColumnProps {
  title: string
  /** An id on the column element itself, for the handful of callers that
   *  reach back into a column after a fetch comes back. */
  id?: string
  /** h2 for the board's own sections, h3 for a column sitting inside a view.
   *  Nothing is styled off it; it is the page outline that cares. */
  heading?: 'h2' | 'h3'
  hint?: ReactNode
  /** The head's right-hand group, in the component's own order. */
  sort?: ReactNode
  count?: ReactNode
  action?: ReactNode
  filters?: ReactNode
  desc?: ReactNode
  body?: ReactNode
  /** Below the body and outside it — the board's + Add task. */
  footer?: ReactNode
  cls?: string
  bodyCls?: string
  /** 'agent' is the Style=Agent variant: a dashed edge meaning an agent owns
   *  this column and you do not drag into it. It is the only dashed thing in
   *  the app, which is what makes the dash readable. */
  style?: ColumnStyle
  /** A running queue worked by AI — an orange tint and a turning gear after
   *  the title. Same as colHTML()'s `hot`. */
  hot?: boolean
  /** Draws the column as a <details> whose <summary> is the head. Overview's
   *  seven are the only ones — seven columns of prose open at once is a lot of
   *  scrolling, and a column of cards has nothing to gain by hiding. */
  collapsible?: boolean
  open?: boolean
  collapseKey?: string
  children?: ReactNode
}

/* Callers build these by concatenating optional words, so an empty or
   half-empty run of them is normal and must not reach the attribute. */
const clean = (s?: string) => (s || '').trim().replace(/\s+/g, ' ')

export function Column(props: ColumnProps) {
  const {
    title, id, heading, hint, sort, count, action, filters, desc,
    body, footer, cls, bodyCls, style, hot, collapsible, open, collapseKey, children,
  } = props

  const Tag = heading === 'h3' ? 'h3' : 'h2'
  const cleanCls = clean(cls)
  const cleanBodyCls = clean(bodyCls)

  const colClass = 'col'
    + (cleanCls ? ' ' + cleanCls : '')
    + (style === 'agent' ? ' agentcol' : '')
    + (hot ? ' hotcol' : '')

  /* Two groups pushed apart, not one row with things floated right. What the
     column is called sits left; what you do to it sits right. A long title
     squeezes the left group and leaves the right one alone, which is what a
     header full of controls has to do. */
  const head = (
    <>
      <div className="colhead-row">
        <div className="colhead-left">
          {collapsible ? <span className="colchev" aria-hidden="true" /> : null}
          <Tag>{title}</Tag>
          {hot ? <span className="colgear" aria-hidden="true" /> : null}
          {hint ? <span className="hint">{hint}</span> : null}
        </div>
        <div className="colhead-right">
          {sort}
          {count != null ? <span className="count">{count}</span> : null}
          {action}
          {filters}
        </div>
      </div>
      {desc ? <p className="colhead-desc">{desc}</p> : null}
    </>
  )

  const inner = (
    <>
      <div className={'colbody' + (cleanBodyCls ? ' ' + cleanBodyCls : '')}>
        {body}
        {children}
      </div>
      {footer}
    </>
  )

  /* A collapsible column is a <details> and its head is the <summary> — the
     same head, the same classes, the same optional parts, so nothing about a
     column changes by being foldable except the element it is made of. */
  if (collapsible) {
    return (
      <details
        id={id}
        className={colClass}
        data-colcollapse={collapseKey || title}
        open={open !== false}
      >
        <summary className="colhead">{head}</summary>
        {inner}
      </details>
    )
  }

  return (
    <section id={id} className={colClass}>
      <div className="colhead">{head}</div>
      {inner}
    </section>
  )
}

/* What a column draws when there is nothing in it — `colEmptyHTML()`'s twin in
   kanban/js/09-columns.js. Two styles and no third: plain grey text on the
   board, and a dashed box on Plans, where a column of prose with one line of
   grey text in it read as a column that had failed to load rather than one
   with nothing in it. */
export function ColumnEmpty({ boxed, children }: { boxed?: boolean, children?: ReactNode }) {
  return <div className={boxed ? 'empty boxed' : 'empty'}>{children}</div>
}
