/* One number, boxed, with what it counts underneath.
 *
 * It was three spans inside `CompletedByCategory` — `.total`, `.totaln`,
 * `.totall`, styled under `.reportsview` — so the one shape the board already
 * uses for "the answer to the question you opened this view for" could not be
 * drawn anywhere else. Same markup, own file, classes no longer scoped to one
 * view, so the next view that has a headline figure draws this rather than a
 * fourth spelling of it.
 *
 * The eyebrow sits inside the box rather than above it. Reports' Completed
 * heading was an `<h2>` over the card until 19 Sep 2026, which put the name of
 * the number and the number itself in two containers; the two sections under it
 * keep their `<h2>` because neither is a single figure.
 *
 * There is no string builder to agree with — this has never been one — so what
 * holds its shape is the case in `kanban/ui/test_primitives.mjs`, written out
 * longhand the same way the plan card's three are.
 */
export interface StatCardProps {
  /** The small label above the figure, inside the box. Drawn uppercase by CSS. */
  eyebrow?: string
  /** The figure itself. A string so "2 of 2" is as welcome as a count. */
  value: string | number
  /** What the figure counts, under it. */
  caption?: string
  /** Extra classes, for a caller that needs to colour or widen one. */
  cls?: string
}

export function StatCard({ eyebrow, value, caption, cls }: StatCardProps) {
  return (
    <div className={'statcard' + (cls ? ' ' + cls.trim().replace(/\s+/g, ' ') : '')}>
      {eyebrow ? <span className="statcard-eyebrow">{eyebrow}</span> : null}
      <span className="statcard-value">{value}</span>
      {caption ? <span className="statcard-caption">{caption}</span> : null}
    </div>
  )
}
