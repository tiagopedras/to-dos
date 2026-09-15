/* The number badge, as a component.
 *
 * The same object numberBadgeHTML() in kanban/js/09-columns.js emits, and
 * kanban/ui/test_primitives.mjs holds the two side by side. A filled pill
 * with a count in it, for something waiting on him — louder than the grey
 * `.tab .n` count on purpose, since that one says how many there are and
 * this one says how many need looking at.
 */
export interface NumberBadgeProps {
  /** Nought or less draws nothing; above 99 it reads 99+. */
  n: number
  /** What the count is of, for a screen reader and the tooltip. */
  label?: string
}

export function NumberBadge({ n, label }: NumberBadgeProps) {
  const count = Math.floor(Number(n) || 0)
  if (count < 1) return null
  const text = count > 99 ? '99+' : String(count)
  const said = label ? count + ' ' + label : undefined
  return <span className="nbadge" title={said} aria-label={said}>{text}</span>
}
