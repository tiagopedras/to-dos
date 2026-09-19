/* The board: one `Column` per tier, each a stack of task cards.
 *
 * Until 19 Sep 2026 `renderBoard()` built this as one string, assigned it to
 * `#board`, and then went back over the result with `querySelectorAll` to give
 * every card and every column its handlers. Every handler is a prop now, so
 * nothing is found by selector after a paint, and the drop line and the
 * highlight under a dragged card are state in here rather than a `div` moved
 * about inside a tree it does not own.
 *
 * What stays in 18-timeline.js is everything that reads or writes the
 * document: `dropTask()`, `setSortMode()`, `openDrawer()`, `addTask()`. This
 * component only says when to call them. `onZoneOver` is the one that has to
 * answer, because the drop line's place depends on where the other cards
 * are on screen, which only the board can measure: it returns the id of the
 * card the line sits under, an empty string for the top of the column, or null
 * when there is nowhere to point (a sorted column, where the order is worked
 * out, and a sub-step drag, which is not a card).
 *
 * The drop target is the whole column rather than its body, because Tenon's
 * `Column` gives the body a class and not props. That makes the head a valid
 * place to drop, which it was not, and puts the card at the top when it is.
 */
import { useState } from 'react'
import type { DragEvent } from 'react'
import { Column, ColumnEmpty } from '@tiagopedras/tenon'
import { TaskCard, type TaskCardModel } from './TaskCard'

export interface BoardCard {
  model: TaskCardModel
  stripe: string
  bucketLabel: string
  draggable: boolean
}

export interface BoardColumn {
  /** The heading every lookup matches by, also written to `data-tier`. */
  tier: string
  /** What it is called on screen, which is not always the heading. */
  title: string
  className: string
  /** Handed to AI: an agent owns it, so it is dashed, tinted and geared. */
  agent: boolean
  /** Null on the two columns with no sort toggle. */
  sort: 'priority' | 'manual' | null
  canEdit: boolean
  canAdd: boolean
  cards: BoardCard[]
}

export interface BoardViewProps {
  columns: BoardColumn[]
  /** A backup preview, or the demo: nothing can be dragged, added or renamed. */
  locked: boolean
  onOpen: (id: string) => void
  onDragStart: (e: DragEvent<HTMLElement>, id: string) => void
  onDragEnd: (e: DragEvent<HTMLElement>, id: string) => void
  onZoneOver: (e: DragEvent<HTMLElement>, tier: string) => string | null
  onZoneDrop: (e: DragEvent<HTMLElement>, tier: string) => void
  onAdd: (tier: string) => void
  onEdit: (tier: string) => void
  onSort: (tier: string) => void
}

const PENCIL = 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'

export function BoardView(props: BoardViewProps) {
  const { columns, locked, onOpen, onDragStart, onDragEnd, onZoneOver, onZoneDrop, onAdd, onEdit, onSort } = props
  /* Which column the pointer is over, where its drop line sits, and which card
     is being carried. All three are gone the moment the drag ends. */
  const [over, setOver] = useState<string | null>(null)
  const [line, setLine] = useState<{ tier: string, after: string } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)

  const clear = () => { setOver(null); setLine(null) }

  return (
    <>
      {columns.map(col => {
        const priority = col.sort === 'priority'
        const cards = col.cards.map(c => (
          <TaskCard
            key={c.model.id}
            model={c.model}
            stripe={c.stripe}
            bucketLabel={c.bucketLabel}
            draggable={c.draggable}
            dragging={dragging === c.model.id}
            onOpen={onOpen}
            onDragStart={(e, id) => {
              onDragStart(e, id)
              /* After the browser has taken its drag image: fading the card in
                 the handler would fade the picture of it too. */
              requestAnimationFrame(() => setDragging(id))
            }}
            onDragEnd={(e, id) => { setDragging(null); clear(); onDragEnd(e, id) }}
          />
        ))
        if (line && line.tier === col.tier) {
          const at = line.after ? cards.findIndex(c => c.key === line.after) + 1 : 0
          cards.splice(at, 0, <div key="dropline" className="dropline" />)
        }

        const drop = locked ? {} : {
          onDragOver: (e: DragEvent<HTMLElement>) => {
            const after = onZoneOver(e, col.tier)
            setOver(col.tier)
            setLine(after === null ? null : { tier: col.tier, after })
          },
          /* Moving onto a card inside the column counts as leaving it in most
             browsers, so look at where the pointer actually went. */
          onDragLeave: (e: DragEvent<HTMLElement>) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            clear()
          },
          onDrop: (e: DragEvent<HTMLElement>) => { clear(); onZoneDrop(e, col.tier) },
        }

        return (
          <Column
            key={col.tier}
            title={col.title}
            className={col.className}
            data-tier={col.tier}
            tone={col.agent ? 'running' : 'default'}
            dashed={col.agent}
            titleAfter={col.agent ? <span className="colgear" aria-hidden="true" /> : undefined}
            sort={col.sort ? (
              <button
                className={'sortbtn' + (priority ? ' on' : '')}
                data-sort={col.tier}
                title={priority
                  ? 'Showing highest impact for the lightest lift first. Hand-reordering is off while this is on.'
                  : 'Showing your own order. Click to sort by impact against effort.'}
                onClick={() => onSort(col.tier)}
              >
                {priority ? 'by priority' : '⇅'}
              </button>
            ) : undefined}
            count={col.cards.length}
            action={col.canEdit ? (
              <button
                className="iconbtn coledit"
                data-editcol={col.tier}
                aria-label="Rename this column"
                title="Rename, reorder, add or remove columns"
                onClick={() => onEdit(col.tier)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={PENCIL} /></svg>
              </button>
            ) : undefined}
            bodyClassName={'drop' + (over === col.tier ? ' over' : '')}
            footer={col.canAdd ? (
              <button className="addbtn" data-add={col.tier} onClick={() => onAdd(col.tier)}>+ Add task</button>
            ) : undefined}
            {...drop}
            children={col.cards.length ? cards : <ColumnEmpty>Nothing here</ColumnEmpty>}
          />
        )
      })}
    </>
  )
}
