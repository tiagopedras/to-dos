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
import type { ReactNode } from 'react'

export { Column } from './Column'
export type { ColumnProps, ColumnStyle } from './Column'
export { Card } from './Card'
export type { CardProps } from './Card'
export { ProjectsView, ProjectsEmpty } from './ProjectsView'
export { BackupsView } from './BackupsView'
export { ReportsView, ReportsEmpty } from './ReportsView'
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

/* Tearing a view down when another one takes #lists. Without it the old root
   stays subscribed to a container whose contents the next view has already
   replaced with a string. */
export function unmount(container: Element): void {
  const root = roots.get(container)
  if (!root) return
  root.unmount()
  roots.delete(container)
}
