/* What the bundle hangs on `window.BoardUI`.
 *
 * The board is 28 classic scripts sharing one global scope, so this is the
 * seam: a classic <script src="dist/board-ui.js"> puts one name beside them,
 * and a view that has been ported calls mount() instead of assigning to
 * $('#lists').innerHTML. Every view still owns #lists wholesale, which is what
 * lets one be ported while the other nine carry on untouched — and what lets
 * this work stop at any stage with a working board.
 *
 * Projects, Backups and Reports are ported whole. Plans is the one that is
 * half done on purpose: its six columns and the four that hold nothing but
 * plans are components, and the bodies four independent fetches fill are still
 * markup the board builds. PlansView's own header says why, and what would
 * have to change for the other two columns to follow.
 *
 * There were two mount functions until 13 Sep 2026, and there are two again
 * since the Overview/Matrix/Timeline port on the 14th, for a different reason
 * than the first pair. `mountSync()` wrapped this one in `flushSync` because
 * Plans wired its own handlers by querying for the nodes it had just
 * painted — a prop could have carried every one of those, so the fix was the
 * view, and `mountSync()` went with it.
 *
 * `mountFlushed()` is not that case again. Overview measures `.ref .msg`'s
 * real scrollHeight after every paint (`capMsgCards()`, kanban/js/18-timeline.js)
 * and the Timeline arms native `ondragstart`/`ondrop` on elements a card's
 * own drag depends on existing (`wireTimelineDrag()`) — neither is a handler
 * a prop could carry, because both need the real, painted DOM rather than
 * something React already holds. `mount()` alone leaves both racing React's
 * own schedule, same as it would have left Plans' three query-based handlers
 * racing it; `flushSync` is the same fix, for a case a prop cannot reach.
 */
/* React's own element builder, for the board's classic scripts. They have no
   JSX and no build step of their own, so a ported view assembles its lists as
   `BoardUI.h(BoardUI.PlanCard, props)` — which is what JSX compiles to anyway.
   Keyed lists need `key` in those props, the same as anywhere else. */
export { createElement as h, Fragment } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'

export { Column, ColumnEmpty } from './Column'
export type { ColumnProps, ColumnStyle } from './Column'
export { Card } from './Card'
export type { CardProps, CardRow } from './Card'
export { PlanCard } from './PlanCard'
export type { PlanCardProps } from './PlanCard'
export { ProjectsView, ProjectsEmpty } from './ProjectsView'
export { BackupsView } from './BackupsView'
export { ReportsView, ReportsEmpty } from './ReportsView'
export { PlansView } from './PlansView'
export type { PlansViewProps, DropZone } from './PlansView'
export type { ReportsViewProps, WrittenReport, ReportWindow } from './ReportsView'
export {
  CountedLead, CompletedByCategory, RecentAccomplishments, WeeklyTrend,
} from './ReportsBlocks'
export type {
  CountedLeadProps, CompletedByCategoryData, CategoryRowData, EffortCell,
  RecentAccomplishmentsData, DoneRowData, WeeklyTrendProps, TrendSeriesData, TrendWeekData,
} from './ReportsBlocks'
export { OverviewView, MatrixView, TimelineView } from './SectionsView'
export type {
  OverviewViewProps, MatrixViewProps, TimelineViewProps, SectionBody,
} from './SectionsView'
export type { BackupsViewProps, BackupFile, ArchiveFile } from './BackupsView'
export type { ProjectsViewProps, ProjectSummary, ProjectSortOption } from './ProjectsView'

/* One root per container, kept so a re-render reuses it. Calling createRoot on
   a container that already has one is React's own warned-about mistake, and a
   board that re-renders on every state change would hit it immediately. */
const roots = new WeakMap<Element, Root>()

export function mount(container: Element, node: ReactNode): void {
  let root = roots.get(container)
  if (!root) {
    root = createRoot(container)
    roots.set(container, root)
  }
  root.render(node)
}

/** `mount()`, forced to commit before this call returns — see the note above
 *  on why this is back and what it is for. Use `mount()` unless the caller's
 *  very next line reads or wires the DOM this just painted. */
export function mountFlushed(container: Element, node: ReactNode): void {
  let root = roots.get(container)
  if (!root) {
    root = createRoot(container)
    roots.set(container, root)
  }
  const r = root
  flushSync(() => { r.render(node) })
}

/* Tearing a view down when another one takes #lists. Without it the old root
   stays subscribed to a container whose contents the next view has already
   replaced with a string. */
export function unmount(container: Element): void {
  const root = roots.get(container)
  if (!root) return
  root.unmount()
  roots.delete(container)
}
