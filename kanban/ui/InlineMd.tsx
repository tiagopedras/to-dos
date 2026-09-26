/* One line of the board's inline Markdown — a task title, a project blurb, a
 * report summary — drawn by Tenon's `Markdown` from the plain string.
 *
 * Every React view that shows a title goes through this, so none of them takes
 * HTML any more. The `mdinline` class is the board's hook: board.css makes the
 * span inherit the type of whatever it sits in (a card title, a timeline label)
 * rather than Tenon's body size, and gives a `[placeholder]` the amber chip
 * the drawer's notes use.
 *
 * `mdInline()` in kanban/js/10-reference-sections.js is still there for the
 * classic scripts that build HTML strings (the drawer, the chat cards, the
 * hover previews). It and Tenon read the same forms; a link opens in a new tab
 * in both, through the capture listener beside mdInline().
 */
import { Markdown } from '@tiagopedras/tenon'

export function InlineMd({ text }: { text: string }) {
  return <Markdown inline className="mdinline">{text || ''}</Markdown>
}
