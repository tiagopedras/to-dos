/* What the bundle hangs on `window.BoardUI`.
 *
 * The board is 28 classic scripts sharing one global scope, so this is the
 * seam: a classic <script src="dist/board-ui.js"> puts one name beside them,
 * and a view that has been ported calls mount() instead of assigning to
 * $('#lists').innerHTML. Every view still owns #lists wholesale, which is what
 * lets one be ported while the other nine carry on untouched — and what lets
 * this work stop at any stage with a working board.
 *
 * Nothing is ported yet. What is here is the two primitives and the mount
 * helpers, which is the step IMPROVEMENTS.md says pays off on its own.
 */
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'

export { Column } from './Column'
export type { ColumnProps, ColumnStyle } from './Column'
export { Card } from './Card'
export type { CardProps } from './Card'
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
 * view: it mounts a shell of six columns and its four fetches then fill the
 * bodies by id, so the nodes have to exist the moment mount() returns or the
 * first fill writes into nothing.
 *
 * flushSync is React telling you this is not how it wants to be used, and it
 * is right — the standing direction is props, and PlansView's own header says
 * what would have to change for Plans to get there. Until then this is the
 * honest version of what the board already does, rather than a setTimeout
 * hoping the render has landed.
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
