/* What the bundle hangs on `window.BoardUI`.
 *
 * The board is 28 classic scripts sharing one global scope, so this is the
 * seam: a classic <script src="dist/board-ui.js"> puts one name beside them,
 * and a view that has been ported calls mount() instead of assigning to
 * $('#lists').innerHTML. Every view still owns #lists wholesale, which is what
 * lets one be ported while the other nine carry on untouched — and what lets
 * this work stop at any stage with a working board.
 *
 * Projects, Backups, the report columns, Overview, the Matrix and the Board are
 * ported whole. Plans was too until it went on 22 Sep 2026.
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
 * own schedule; `flushSync` is the fix, for a case a prop cannot reach.
 */
/* React's own element builder, for the board's classic scripts. They have no
   JSX and no build step of their own, so a ported view assembles its lists as
   `BoardUI.h(BoardUI.TaskCard, props)` — which is what JSX compiles to anyway.
   Keyed lists need `key` in those props, the same as anywhere else. */
export { createElement as h, Fragment } from 'react'

import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import type { ReactNode } from 'react'

/* Card, Column, Badge and Stat are Tenon's, not the board's. They were the
   board's until 19 Sep 2026, and Tenon's are a port of exactly those four —
   the card had already survived five views here, which is a harder test than
   anything a component written fresh would have had. What changed is the
   names: `.card` became `.tenon-card`, `cls`/`stripe`/`position`/`note` became
   `className`/`accent`/`lead`/`footer`, and `body` became `children`.

   colHTML() and cardShellHTML() in kanban/js/09-columns.js emit the same
   markup, so the half of the board that is still strings and the half that is
   React draw the same card. That is the rule those two files have always been
   under; only the shape they agree on has moved. */
export { Alert, Card, Column, ColumnEmpty, Badge, Stat, Tag, Button, Field } from '@tiagopedras/tenon'
export type {
  AlertProps, CardProps, ColumnProps, ColumnTone, BadgeProps, StatProps, TagProps,
} from '@tiagopedras/tenon'
/* Drag to reorder for the classic scripts: bindReorder(list, opts) for a list
   built as an HTML string, dragHandleHTML() for the grip inside each row.
   Reached as BoardUI.bindReorder / BoardUI.dragHandleHTML. */
export { bindReorder, dragHandleHTML } from '@tiagopedras/tenon'
export type { BindReorderOptions } from '@tiagopedras/tenon'
export { ProjectsView, ProjectsEmpty } from './ProjectsView'
export { BackupsView } from './BackupsView'
export { TasksFinishedColumn, WrittenReportsColumn } from './ReportsColumns'
export { RefSection, ContextBody } from './OverviewBodies'
export type { RefBlock, RefModel, EmptyKind, ContextGroup, ContextItem } from './OverviewBodies'
export { ChainBody } from './ChainBody'
export type { ChainEntry, ChainTicket } from './ChainBody'
export { MatrixBody } from './MatrixBody'
export type { MatrixBodyProps, MatrixModel, MatrixCell, MatrixDot, MatrixRead } from './MatrixBody'
export { TaskCard } from './TaskCard'
export type { TaskCardProps, TaskCardModel, Chip, CardProgress } from './TaskCard'
export { BoardView } from './BoardView'
export type { BoardViewProps, BoardColumn, BoardCard } from './BoardView'
export { ColumnFilter } from './ColumnFilter'
export { RefCards } from './RefCards'
export type {
  RefCardsProps, Usage, UsageState, ScheduleJob, ScheduleState, RunResults,
} from './RefCards'
export type { ColumnFilterProps, ColumnFilterOption } from './ColumnFilter'
export type { ReportsColumnsProps, WrittenReport, ReportWindow } from './ReportsColumns'
export {
  CompletedByCategory, RecentAccomplishments, WeeklyTrend,
} from './ReportsBlocks'
export type {
  CompletedByCategoryData, CategoryRowData, EffortCell,
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
