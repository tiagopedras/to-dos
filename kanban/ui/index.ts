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
export type { PlansViewProps } from './PlansView'
export type { ReportsViewProps, WrittenReport, ReportWindow } from './ReportsView'
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

/* The same mount, made to have happened by the time it returns.
 *
 * React 18 renders when it gets round to it, which is right for a view that
 * hands the component everything it needs and then leaves. Plans is not that
 * view: it wires opening a plan, the link back to the task and every drag on
 * the view by querying for the nodes it has just painted, so those nodes have
 * to exist the moment mount() returns or the wiring hangs on the paint before
 * this one.
 *
 * flushSync is React telling you this is not how it wants to be used, and it
 * is right — the standing direction is handlers as props. What it is waiting
 * on is the card, not the view: PlanCard keeps the data attributes the board
 * wires against, and the day it takes onOpen and onDragStart instead is the
 * day this goes. Until then it is the honest version of what the board already
 * does, rather than a setTimeout hoping the render has landed.
 *
 * Only for a mount whose caller reaches into the result. Everything else uses
 * mount() and lets React schedule.
 */
export function mountSync(container: Element, node: ReactNode): void {
  flushSync(() => { mount(container, node) })
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
