# Handover: drag to reorder across the to-dos app, on Tenon

Written 24 Sep 2026. Start a fresh session with "read
/Users/tiagopedras/Code/to-dos/HANDOVER-drag-reorder.md and do step 1".

## Where things stand

- **Tenon v0.8.0 is tagged and pushed** (`main` at `b066b0e`). It added
  `useReorder`, `DragHandle`, `DropLine`, `reorderKeys` and `applySavedOrder` in
  `PACKAGES/tenon/src/components/Reorder/`. It also carries the improve agent's
  two commits, merged on purpose: the lighter warning and error text tokens, and
  `Column`'s `bodyProps`.
- **The agents dashboard** is on v0.8.0 and uses the hook for dragging agents and
  targets. Not committed.
- **The to-dos board** is on v0.8.0 and draws Tenon's `DropLine` in the board and
  timeline views. `test_board.mjs` passes 46/46 and `test_timeline.mjs` 11/11.
  Not committed. Other sessions have uncommitted work in `to-dos` too
  (`agents/plan-agent/*`, `IMPROVEMENTS.md`), so stage by file name.

## The goal

Every reorder in the to-dos app behaves and looks the same as the dashboard's:
the same grip, the whole item as the drag picture, the fade on what is being
carried, and the drop line. The ↑/↓ buttons in the bucket and column editors go.

Decided with Tiago:

1. Mouse drag only. Don't add a keyboard way to reorder in place of the arrows.
2. Both the bucket editor and the column editor change.
3. Board cards moving between columns, and dropping a tray card on a day in the
   timeline, stay as they are. Those rules belong to the board.

Most of the to-dos app is plain JavaScript building HTML strings, so Tenon's
React hook can't reach it. Tenon gains a plain-JS version, and the hook is
rebuilt on top of it, so there is one implementation.

## Who does what

- **Step 1 on Opus.** It's the refactor where the earlier bugs happened.
- **Steps 2–6 on Sonnet.** They follow a set pattern, and the test suites catch
  regressions.

## What changes where

| Surface | Today | After |
| --- | --- | --- |
| Bucket editor (`kanban/js/08-buckets.js`) | ↑/↓ buttons | grip on each row, drag |
| Column editor (`kanban/js/09-columns.js`) | ↑/↓ buttons, same builder | grip on each row, drag |
| Drawer sub-steps (`kanban/js/19-drawer.js`) | own drag, inset-shadow line | Tenon drag from the existing `⠿` grip |
| Timeline row order (`kanban/js/18-timeline.js`, `wireTlReorder`) | own drag, inserted `tenon-dropline` | Tenon drag from the row label |
| Board cards (`kanban/ui/BoardView.tsx` + `dropTask`) | own drag across columns | unchanged |
| Timeline tray → date | drop on a day | unchanged |

## Steps

**1. Tenon v0.9.0: a plain-JS `bindReorder`.**
- New `src/components/Reorder/bindReorder.ts`:
  `bindReorder(list, { keyOf, onMove, axis, grip }) → unbind`. It uses delegated
  listeners on the list element. Items carry `data-tenon-reorder="key"`, and the
  drag starts only from an element matching `grip` (default `[data-tenon-grip]`).
- Move the logic out of `useReorder.ts` into shared helpers both use. That covers
  the whole item as the drag picture, the fade a tick late, the before/after
  half, the drop line via `data-tenon-drop`, and stopping the event at the list.
  `useReorder` stays the same from outside, so the dashboard only needs the
  version bump.
- `DragHandle` gains `data-tenon-grip`. Add a string export `dragHandleHTML()`
  that emits exactly the same markup.
- Storybook: one plain-DOM story in `stories/Reorder.stories.tsx`. README: one
  paragraph after the reorder one.
- Release per the README's Releasing section: `npm version minor
  --no-git-tag-version`, `npm run all`, commit, `git tag v0.9.0`, push `main` and
  the tag as tiagopedras.

**2. to-dos onto v0.9.0.** Bump `package.json`. Re-export `bindReorder` and
`dragHandleHTML` through `kanban/ui/index.ts`, so classic scripts reach them as
`BoardUI.bindReorder` / `BoardUI.dragHandleHTML`. `npm run build` to rebuild
`kanban/dist`.

**3. Bucket and column editors.**
- Replace `moveDeleteButtonsHTML` (08-buckets.js) with a delete-only builder, and
  put `BoardUI.dragHandleHTML()` first in each `.bkrow` with
  `data-tenon-reorder="<index>"`.
- In each editor's `wire()`, call `bindReorder(modalEl.querySelector('.bklist'),
  …)`. `onMove` calls new `moveBucketTo(b, beforeB)` / `moveTierTo(name,
  beforeName)`, which are `moveBucket` / `moveTier` with a target position
  instead of ±1 (same `renumberBuckets` / `syncTierShapes`, `markDirty`,
  `refreshView`), then `draw()`.
- Remove the `data-up/down` and `data-tierback/fwd` wiring, and `moveBucket` /
  `moveTier` if nothing else calls them. Set `--tenon-reorder-gap: 0px` on
  `.bklist`, since its rows are separated by a border, not a gap.

**4. Drawer sub-steps.**
- Rows get `data-tenon-reorder="<i>"` and lose `draggable="true"`, and the `⠿`
  grip becomes `dragHandleHTML()`.
- Replace the hand-written `ondragstart…ondrop` block (around line 1205) with
  `bindReorder` on `#f-subs`, with `onMove` → `moveSub(t, from, to)`. `to` is the
  before-row's index, or the length when "before" is null.
- `editSubtext` no longer needs `row.draggable = false`. Remove it.
- Remove `.sub.over-top/over-bottom/dragging` and the old `.sub .grip` look from
  `board.css`. `subDrag` is also read by the board's `onZoneOver` and
  `wireHeadlineDrop`. Keep it only if a sub-step drag can still reach those, and
  remove it if not.

**5. Timeline row order.**
- `bindReorder` on each `.tllanegroup`, items `.tlrow[data-tlreorder]` (key =
  `data-tlreorder`), grip `.tllabel`. `onMove` writes the same `tlrank`
  renumbering the current `group.ondrop` does.
- The core must stop the event at the list, or the tray's date drop on
  `.tlscroll` fires and overwrites the task's due date. The comment in the old
  `ondrop` explains why.
- `dropLine` / `hideDropLine` stay, for the board only.

**6. Log it.** Append to `to-dos/COORDINATION.md` (and the dashboard's for its
bump). Leave to-dos and the dashboard uncommitted.

## Traps already hit once

- **A drop bubbles to the list's own drop handler.** The first dashboard version
  moved every item to the end because of this. The item that takes the drop has
  to stop the event there.
- **An `<svg>` inside the grip is draggable by default** in Firefox and Safari,
  which starts the browser's own image drag. `DragHandle` sets
  `draggable={false}` on it, and `dragHandleHTML()` must do the same.
- **The fade has to wait a tick after dragstart**, or the browser's drag picture
  comes out faded or blank.
- **Tenon's build rejects any `--tenon-*` variable that isn't a token.** New
  local ones go in `LOCALS` in `scripts/build.mjs` (`--tenon-dropline-color` and
  `--tenon-reorder-gap` are already there).
- **`npm install` keeps the old Tenon commit from the lock file.** Install the tag
  explicitly: `npm install "@tiagopedras/tenon@github:tiagopedras/tenon#v0.9.0"`.
- **Card uses `::before` for its accent stripe**, so the drop line lives on
  `::after`. Check a surface doesn't already use `::after` before binding it.

## Verification

1. Tenon: `npm run check`, and try the stories in `npm run storybook`.
2. to-dos: `npm run check`, `npm run build`, `npm test`. Add `dragHandleHTML()`
   against `<DragHandle/>` to `kanban/ui/test_primitives.mjs`, as it already does
   for cards.
3. Browser suites: `node kanban/test_board.mjs`, `node kanban/test_timeline.mjs`,
   and whichever suite covers the drawer and the two editors (`grep -l
   "bkrow\|f-subs" kanban/test_*.mjs`). Rewrite their ↑/↓ and old drag checks
   for the new selectors.
4. Dashboard: bump to v0.9.0, `npx tsc --noEmit -p .`, `npm run build`.
5. Tiago: reorder a bucket, a column, a sub-step and a timeline row by the grip,
   and check the dashboard still drags.
