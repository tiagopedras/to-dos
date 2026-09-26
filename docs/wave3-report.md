# Wave 3, overnight 26 Sep 2026

All four items landed on main. Every suite passes (22 of 22), with the type check and build clean. Nothing was pushed and the live server wasn't restarted. Reload the board tab to see the changes.

## 1. Build blocks on every open entry
All 23 open entries in IMPROVEMENTS.md now end with a Build block giving the model, an Id, links to other entries, the files, the tests and any open questions. Only the blocks were added, and the overnight agent's reader still sees the same 23 open entries. The split is 15 Opus and 8 Sonnet.

For you:
- Seven entries still name code that was renamed or removed in September, mostly the old Plans view and folder names like `planning_agent`. Their Open lines say so.
- Two entries look like duplicates: `implementing-agent-fence-types` and `implementing-agent-unattended`. Worth merging when you next refine.

## 2. View tabs on Tenon
The view tabs in the header now use Tenon's `SegmentedControl`. The bucket tabs, theme pills and filter bar stay as they were, because you can switch on several at once and `SegmentedControl` only allows one. They need a multi-select group in Tenon first.

For you:
- The dividers between tabs are redrawn, so check them by eye.
- The keyboard changed. Tab lands on the current view and the arrow keys switch views. On Backups no view tab is on, so the strip can't be reached by keyboard.

## 3. PA panel
A round PA button, bottom-left, opens a docked chat that belongs to the board rather than a task. Your first message goes to `/pa`. The board saves before each message and reloads your list after the reply if it changed on disk.

Defaults used: the button sits bottom-left because docked chats fill the right. Each click starts a new PA chat unless one is already open.

For you:
- **The PA can't change your list from the panel yet.** Board chats run in Ask mode, which removes the edit tools. The two entries that would fix this are `chat-write-mode` and `pa-queue-chat`, and both need a decision from you.

## 4. Agent avatars
Each agent gets a small generated picture: abstract shapes in Tenon's chart colours, always the same picture for the same name, drawn by `core/avatar.js` with nothing fetched from the internet. It shows on the card's delegated chip, on sub-task rows given to an agent and beside the Delegate to field. People get none. A new "delegated to an agent" filter chip shows tasks handed to an agent, directly or through a sub-task.

For you: check the avatars by eye.
