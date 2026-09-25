/* The one modal every sheet on the board opens in, drawn with Tenon's Modal.
 *
 * showModal() in kanban/js/23-conflict-modal.js is the only caller. It keeps
 * the orchestration: which modal is open, what closing it runs, and the
 * callers that query the body straight after opening it. So the body and the
 * subtitle arrive as HTML strings, the way every caller has always built them,
 * and mountBoardModal() commits before it returns so those queries find the
 * nodes. It hands back the modal's outermost node, which is what `modalEl`
 * has always pointed at.
 */
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { Modal, Button, type ButtonVariant } from '@tiagopedras/tenon'

export interface BoardModalButton {
  label: string
  primary?: boolean
  danger?: boolean
  agree?: boolean
  reject?: boolean
}

export interface BoardModalProps {
  heading: string
  /** HTML, as callers have always passed it. Empty draws no subtitle. */
  subHTML: string
  bodyHTML: string
  buttons: BoardModalButton[]
  /** The document-width variant (760px) rather than the confirmation size. */
  wide?: boolean
  /** One more class on the box, for a body shape of its own. `planmodal`
      with `wide` is the 912px resizable plan reader. */
  cls?: string
  /** A button was pressed, by index. The caller closes and runs it. */
  onPick: (i: number) => void
  /** The X, the scrim or Escape. */
  onClose: () => void
}

function variantOf(b: BoardModalButton): ButtonVariant {
  if (b.primary) return 'primary'
  if (b.agree) return 'confirm'
  if (b.reject) return 'destructive'
  if (b.danger) return 'danger'
  return 'secondary'
}

export function BoardModal(p: BoardModalProps) {
  const plan = !!(p.wide && p.cls && p.cls.split(/\s+/).includes('planmodal'))
  const primary = p.buttons.findIndex(b => b.primary)
  return (
    <Modal
      open
      onClose={p.onClose}
      title={p.heading}
      subtitle={p.subHTML ? <span dangerouslySetInnerHTML={{ __html: p.subHTML }} /> : undefined}
      size={plan ? 'xl' : p.wide ? 'lg' : 'md'}
      resizable={plan}
      initialFocus="footer"
      onSubmit={primary > -1 ? () => p.onPick(primary) : undefined}
      className={['boardmodal', p.cls].filter(Boolean).join(' ')}
      footer={p.buttons.map((b, i) => (
        <Button key={i} variant={variantOf(b)} data-i={i} onClick={() => p.onPick(i)}>{b.label}</Button>
      ))}
    >
      <div className="mid" dangerouslySetInnerHTML={{ __html: p.bodyHTML }} />
    </Modal>
  )
}

/* The host is a node showModal() created and appends to body; the Modal
   itself portals to body beside it. One root per host, dropped on unmount. */
const modalRoots = new WeakMap<Element, Root>()

export function mountBoardModal(host: Element, props: BoardModalProps): HTMLElement | null {
  let root = modalRoots.get(host)
  if (!root) { root = createRoot(host); modalRoots.set(host, root) }
  const r = root
  flushSync(() => { r.render(<BoardModal {...props} />) })
  const boxes = document.querySelectorAll('.tenon-modal__box.boardmodal')
  const box = boxes[boxes.length - 1]
  return box ? (box.closest('.tenon-modal') as HTMLElement) : null
}

export function unmountBoardModal(host: Element): void {
  const root = modalRoots.get(host)
  if (!root) return
  root.unmount()
  modalRoots.delete(host)
}
