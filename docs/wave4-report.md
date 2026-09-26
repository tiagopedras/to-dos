# Wave 4, 26 Sep 2026

All four items landed on main, three of them in full and the drawer in part. On main 21 of 22 suites pass. The one failure is the known timing flake in test_chats, "the todo.md save was attempted". The type check is clean and the primitives pass 50 of 50. Nothing was pushed and the live server wasn't restarted, so reload the board tab to see the changes.

Two builders swapped each other's unsaved work part-way through, because `git stash` is shared by every worktree of a repo. Both sets were backed up before anything was discarded, so nothing was lost. They were put back and committed on their own branches. The other two builders were told to stay off `git stash` for the rest of the wave.

## 1. Titles on Tenon's Markdown
Card, Overview, chain, timeline, report and project titles now render through Tenon's `Markdown`, through a small wrapper in `kanban/ui/InlineMd.tsx`. `TaskCard.tsx` takes its title as plain text instead of HTML. Tenon v0.10.0 already had the link and placeholder syntax, so Tenon itself didn't change.

`mdInline()` stays for the parts still built as HTML strings: the drawer, chat cards and report bodies. It goes once the drawer is React.

For you:
- Check titles by eye across Board, Overview, Timeline, Reports and Projects. They should look the same as before.
- A `[placeholder]` in a title shows as an amber chip, and a link in a title opens in a new tab.
- A `[key:: value]` inside a title now shows amber instead of grey. That's rare in titles.

## 2. PA changes from a board chat
In a board chat, `pa` no longer writes `todo.md`. It ends its reply with a `pa-changes` block listing what to change, in five kinds: move, tick, date, add and edit. The board checks each request and applies what passes as one undo step. The chat header and status line say what was applied and what was refused. The chat stays in Ask mode. The `pa` skill has a new section, "From a board chat", with the format.

For you:
- Try it: ask the PA panel to move a card, re-date one and add a task. Then check the header's applied/refused line, and that one Undo takes all of it back.
- `chat-write-mode` was blocked on this and can now be refined.

## 3. The Implement agent can run alone
Plans now declare a `type:`. A write-up or a draft is approved as soon as the Plan agent's tick arrives. A prompt, data file, deck or code change waits for your "Review the plan" tick, then the new runner in `agents/implement-agent/` carries it out. The runner is off until you set its hours on the agents dashboard.

The guards:
- Types that write files may only add new files in the project folder. A new version goes beside the original as `name-v2`, and anything written over is put back.
- Code runs on improve-agent's guards: an `implement/<date>` branch, the repo's tests, a commit, never a merge or push.

For you:
- **Figma can't run alone.** The Figma bridge only starts inside a Claude session, so the runner can't check it before a run. The page rules are written and wait for that check.
- Is "pre-approved" meant as write-ups and drafts only? That's how it was built.
- `PACKAGES/agents-engine/RUNNER.md` still says the Implement agent never gets a runner. It's another repo, so it wasn't edited.
- The planning-agent suite has the same 24 failures as before the merge, none of them new.

## 4. The drawer, in part
The drawer's Description box, the sub-task Note and the send-back message now use Tenon's `Textarea`. The rest of the drawer is still built as HTML text: the title, steps, date pickers, dependency picker, tag chips, project section and sub-task list. Moving those means rebuilding the drawer as React first, so the entry stays open with a note of what moved.

For you:
- Check the Description box by eye. Tenon's text-box styles and the board's own now both apply, so the border or padding may look slightly different.
- The drawer has no `.err` box, so the entry's `Alert` step had nothing to move there.
- `#drawer` and `#scrim` are a docked side panel, and Tenon's `Modal` is a centred box, so they stayed as they are.
