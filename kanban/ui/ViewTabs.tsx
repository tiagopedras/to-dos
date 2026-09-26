/* The view tabs in the header, drawn with Tenon's SegmentedControl since
 * 26 Sep 2026.
 *
 * renderViewTabs() in kanban/js/18-timeline.js keeps the orchestration: it
 * hands over viewDefs() as it stands and what picking a view runs, and this
 * only draws. viewDefs() still carries its `sep` entries; SegmentedControl has
 * no divider of its own, so the option after a divider marks its label with
 * `.sepbefore` and board.css draws the hairline from that.
 *
 * One behaviour moved with it: the strip is a radiogroup now, so Tab lands on
 * the view that is on and the arrow keys move between views, rather than Tab
 * walking every button.
 */
import { SegmentedControl, type SegmentOption } from '@tiagopedras/tenon'

export interface ViewTabDef {
  id: string
  label?: string
  sep?: boolean
}

export interface ViewTabsProps {
  defs: ViewTabDef[]
  value: string
  onPick: (id: string) => void
}

export function ViewTabs({ defs, value, onPick }: ViewTabsProps) {
  const options: SegmentOption[] = []
  let afterSep = false
  for (const d of defs) {
    if (d.sep) { afterSep = options.length > 0; continue }
    options.push({
      value: d.id,
      label: <span className={afterSep ? 'sepbefore' : undefined} data-view={d.id}>{d.label}</span>,
    })
    afterSep = false
  }
  return (
    <SegmentedControl
      className="viewtabs"
      aria-label="View"
      options={options}
      value={value}
      onChange={onPick}
    />
  )
}
