/* The dropdown in a column's head that narrows it: "All 12", and under it the
 * options that have something behind them.
 *
 * It is `colFilterHTML()` in 13-plans.js as a component, and it keeps that
 * function's class names and `data-planfilter` attribute so the stylesheet and
 * `test_plans.mjs` read it unchanged. What changed is who owns it. The string
 * version was handed to the browser as markup, so React could not give its
 * buttons a handler and two delegated listeners on `document` stood in: one to
 * open a panel and pick from it, one in 09-columns.js to shut the others. Both
 * are gone. The panel's open state is this component's own, and an outside
 * click shuts it from the effect below.
 *
 * An option is drawn only if it has cards behind it, which is decided by the
 * caller; the option list arrives already filtered. A column with no option at
 * all draws no dropdown, which the caller signals by passing `null` to
 * PlansView rather than an empty list.
 */
import { useEffect, useRef, useState } from 'react'

export interface ColumnFilterOption {
  key: string
  label: string
  /** How many cards the option would leave in the column. */
  n: number
}

export interface ColumnFilterProps {
  /** Which column this is, written to `data-colfilter`. */
  id: string
  /** The key of the option in force, or `all`. */
  current: string
  /** How many cards the column holds with nothing narrowed. */
  total: number
  options: ColumnFilterOption[]
  onPick: (key: string) => void
}

export function ColumnFilter({ id, current, total, options, onPick }: ColumnFilterProps) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', away)
    return () => document.removeEventListener('click', away)
  }, [open])

  const active = options.find(o => o.key === current)
  const label = active ? active.label + ' ' + active.n : 'All ' + total

  const item = (key: string, text: string, n: number) => (
    <button
      key={key}
      type="button"
      className={'dropdown-item statusopt' + (current === key ? ' on' : '')}
      role="menuitemradio"
      aria-checked={current === key}
      data-planfilter={key}
      onClick={() => { setOpen(false); onPick(key) }}
    >
      {text}<span className="n">{n}</span>
    </button>
  )

  return (
    <span className="dropdown colfilter" data-colfilter={id} ref={wrap}>
      <button
        className="colfilter-btn"
        type="button"
        aria-expanded={open}
        title="Narrow this column"
        onClick={() => setOpen(o => !o)}
      >
        {label}<span className="caret" aria-hidden="true">{'▾'}</span>
      </button>
      <div
        className={'dropdown-panel alignright' + (open ? '' : ' hidden')}
        role="menu"
        aria-label="Narrow this column"
      >
        {item('all', 'All', total)}
        {options.map(o => item(o.key, o.label, o.n))}
      </div>
    </span>
  )
}
