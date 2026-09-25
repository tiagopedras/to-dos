# Board improvements

The standing list of what is still wrong with this app and what should be built
next. It does the same job for the board that `DS-KNOWN-ISSUES.md` does for the
design system: it holds the state of the tool, not the work.

Deliberately separate from `data/todo.md`. That file is Tiago's actual work and it
is private. This one is about the code, it holds no names and no dates, so it is
tracked in git alongside the thing it describes.

Read it before diagnosing anything here. If a problem is already written down,
what is wanted is progress on the fix, not another report of the symptom. When
something lands or something new turns up, edit this file rather than only saying
so in chat.

Split below into Small — a sitting change, no new data model or view — and Big —
needs a decision, a new tag, or a new piece of the board before it can be built.

## Small

- ~~**Every browser suite defaults to the live server on 8765, so a test that
  unlocks the tab is one autosave away from the real list.**~~ **Done, 25 Sep
  2026.** `scripts/test-board.sh` starts `kanban/server.py` over a temp folder
  holding one `_test` dataset seeded from `kanban/demo.md`, on a free port, runs
  the named suites (or `--all`) against it, prints one line per suite and the
  failures only, and removes the server, any Chrome and the folder on exit,
  Ctrl-C included. The server reads `TODOS_DATA_ROOT` (moves `data/` and
  `.current` with it), `TODOS_PORT` and `TODOS_NO_BROWSER`; unset, nothing
  changes. `agents/plan-agent/paths.py` and `core/tick_queue.py` read the same
  root, and Run the Plan agent now refuses on a scratch root. Each suite's
  headless Chrome takes `CDP_PORT` and `CHROME_PROFILE`, and a suite run without
  `BOARD_PORT` prints a one-line hint pointing at the script. It refuses to
  start if the data root resolves inside the repo's own `data/`, and checks the
  server answers with `_test` before any suite runs. Before this, six agents in
  one night each hand-rolled a second server, and one's scratch `.current`
  leaked into another's lookup.

- ~~**The board's drop line can point at the top of a column when other buckets' cards still sit above the dragged card's own bucket.**~~ **Done, 25 Sep 2026.** `dropLineAnchorEl()` in `18-timeline.js` anchors the line to the last other-bucket card when the dragged bucket has none above the pointer, instead of jumping to the column's true top. `renderBoard()` (`kanban/js/18-timeline.js:1048-1077`) already groups a mixed column by bucket in the DOM — `shown.forEach(bucket => ...)` fills `entries` one bucket at a time, and manual (non-priority) mode does no further sort — so with several buckets showing, bucket A's cards sit above bucket B's on screen. `insertAfterEl()` (`:1199`), which both `onZoneOver()` (`:1141`, the drop line) and `dropTask()` (`:1232`, the actual move) call, skips every card whose bucket differs from the dragged one (`other.bucket !== dragBucket`), so dragging a card up past another bucket's cards can leave `after` at `null` — meaning "top of my own bucket's cards" — while the line is drawn at the top of the column, above cards that are still visually there. The drop itself lands in the right place; only where the line points is wrong. The fix is for the line's position to resolve against the first element of the dragged card's own bucket-group rather than against the column's actual top when `after` comes back `null` and other buckets' cards precede it.

- ~~**A bucket's row in the editor says its name and nothing about what kind of work it holds, so telling two buckets apart means opening each one's brief.**~~ **Done, 25 Sep 2026.** `.bkrow` in `08-buckets.js` carries a `.bksummary` input reading and writing the brief's one-line summary. `openBucketEditor()`'s `draw()` (`kanban/js/08-buckets.js:184-213`) puts only the grip, the number, the colour dot, the name input and the Brief/Delete buttons on a `.bkrow` — the one-line summary that already exists in the brief's own template (`BUCKETS.md`, the line under the title, before the `<!-- NOT FILLED IN YET -->` marker) is nowhere on the row itself. A second input beside the name, reading and writing that same line, means `openBucketEditor()` reading each bucket's brief text up front (the same `bucket-brief.json` fetch `openBucketBrief()` already makes, `:319`) to populate it, and writing it back through `PUT /bucket-brief` (`:351`) on change — parsing out the second line the way the entry above this one already has to for its own split, so the two should land together rather than each writing its own reader for the same file's shape.

- ~~**The bucket brief editor is one textarea for a file with a fixed shape, so writing one means remembering the template rather than filling in its parts.**~~ **Done, 25 Sep 2026.** `openBucketBrief()` in `08-buckets.js` now draws title/summary and the four `##` sections as their own fields, parsed and reassembled by `parseBriefText()`/`serializeBriefText()`, with the `NOT FILLED IN YET` marker cleared automatically once a section gets real content. `openBucketBrief()` (`kanban/js/08-buckets.js:310`) reads the whole file into `briefText`, one string, and draws it as a single `<textarea id="briefBody" class="briefbody">` (`:346-347`), saved whole through `PUT /bucket-brief` (`:351`). Every brief is the same shape, laid out in `BUCKETS.md`'s template: a title line, a one-line summary, then four named `##` sections — The processes I run in this bucket, What already does it, Who is involved, What good looks like here — plus the `<!-- NOT FILLED IN YET -->` marker line that has to be deleted by hand once real content replaces it. Splitting the one textarea into a field per section means parsing the file into those parts on open (splitting on the `## ` headings, the way the template names them) and reassembling them in the same order on save, so the file on disk is unchanged in shape; the title line and one-line summary need their own small fields above the sections, and the marker's removal could become automatic — clearing once a section that used to be empty has something typed into it — rather than a line he has to remember to delete.

- ~~**The PA could be its own session, `claude --agent pa-agent`, and nothing
  rules that out.**~~ **Done, 25 Sep 2026.** `agents/pa_agent/pa-agent.md`, symlinked into `~/.claude/agents/`. `CLAUDE.md`'s "why pa is a skill" paragraph updated to say the PA also runs as a session agent now. `agents/pa_agent/PA-PLAN.md:46-67` only weighed a background
  subagent, which cannot ask questions, and a standalone Agent SDK build, and
  settled on skills. `agents/pa_agent/CLAUDE.md:35`'s "Why `pa` is a skill and
  not a subagent" repeats that reasoning. `--agent` makes the agent the whole
  session, so it converses the way
  `~/Code/AGENTS/business-advisor-agent/business-advisor-agent.md` already does.
  The build is one agent file carrying or pointing at `PA.md`, running the
  `pa-*` skills and sending every write through `pa`, so the one-writer rule
  holds. Link it into `~/.claude/agents/` like the business advisor, and rewrite
  the `CLAUDE.md:35` paragraph to say the PA exists as a session agent. No
  skill changes.

- ~~**The Buckets sheet reorders with ↑/↓ buttons where the drawer's own
  subtask rows already show the drag pattern to reuse.**~~ **Done, 24 Sep 2026.** Landed via Tenon's `bindReorder`, in the drag/drop reorder move covering bucket, column, drawer and timeline all at once. `openBucketEditor()`
  (`kanban/js/08-buckets.js:182`) draws each `.bkrow` with the shared
  `moveDeleteButtonsHTML()` trio (`:169`), wired to `moveBucket()` (`:426`) on
  click. The sidebar's subtask rows do the same reordering job with a
  `.grip` handle and native drag: `.sub` gets `draggable="true"` and a
  `<span class="grip">⠿</span>` (`kanban/js/19-drawer.js:1017-1018`), and
  `ondragstart`/`ondragover`/`ondrop` on each row (`:1208-1238`) track the
  dragged index in `subDrag`, toggle `.over-top`/`.over-bottom` past the
  midpoint of the row under the pointer, and call `moveSub()` on drop. Giving
  `.bkrow` the same grip, `draggable` attribute and three handlers, calling
  `moveBucket()` instead of `moveSub()`, would replace the ↑/↓ pair with the
  same interaction already proven in the drawer. `renumberBuckets()`
  (`:15`) already runs inside `moveBucket()`, so the row numbers and the
  written file stay correct however the drop lands.

- ~~**The board's chat opens as a fixed modal that cannot be moved or resized,
  though the chat engine already knows how.**~~ **Done, 25 Sep 2026.** `AIChat.create({ windowed: true, onRectChange: saveChatRect })` in `10-reference-sections.js`, rect persisted so the window reopens where it was left. `AIChat.create()` at
  `kanban/js/10-reference-sections.js:756` passes no `windowed` option, so
  `ChatWindow.tsx` (`PACKAGES/ai_chat_engine/src/ChatWindow.tsx:159`) takes the
  plain-modal branch, pinned at the 720px height `.aic-modal` sets in
  `src/chat.css:20`. `ai_canvas` already runs the other branch
  (`CardWindow.tsx:81`, `windowed: true`), which gives the window drag, resize
  and a grow from the rect handed to `growFrom()`, all verified there. Turning
  it on here means passing `windowed: true`, giving it a starting rect through
  `setRect()` (`src/controller.ts:537`) before `openNew()`/`openSession()`
  since the controller starts with none, and keeping the last `onRectChange`
  rect so the window opens where it was left. Nothing in the engine needs to
  change.

- ~~**The drawer's Tags section can edit or clear a tag the board does not own,
  but never add one.**~~ **Done, 25 Sep 2026.** `.tagchip-add` in `19-drawer.js`, refuses any key already in `RESERVED_TAG_KEYS`. `taskTagChips()` (`kanban/js/19-drawer.js:606`) turns
  every entry in `t.extra` into an amber chip, and `wireTagChips()` (`:656`)
  lets one be rewritten or emptied in place, so the edit half already exists.
  There is no control to write a new one: `tagsSection()` (`:633`) draws only
  the chips a task already has, and its empty state tells you to type
  `[key:: value]` into the task line by hand. An "Add tag" chip at the end of
  `.tagchips`, taking a key and a value and pushing `'[' + key + ':: ' + value + ']'`
  onto `t.extra`, would round-trip untouched through `readTags()`
  (`core/todo.js:111`) and the write-back at `:284`. The one rule it needs is
  a refusal when the key names a field the board already parses (impact, due,
  to, rank and the rest `readTags()` claims), since writing one of those
  into `t.extra` would put a second copy beside the real field. Bare chips with
  no key, which `taskTagChips()` marks read-only, would stay read-only.

- ~~**A task can carry `[to:: Plan agent]` or `[to:: Implement agent]` with no
  handover behind it, and nothing says so.**~~ **Done, 25 Sep 2026.** `check_handover_hygiene()` in `check_todo.py`, importing `pick.py`'s own naming logic rather than re-deriving it, reports a CHECK when the tag has no matching sub-task. `plannable()` (`agents/plan-agent/pick.py:63`)
  and `CLAUDE.md`'s "One board" section are both explicit that the tag alone is not
  a handover — what makes a task the Plan agent's is the `<id>-plan`/`<id>-implement`
  sub-tasks `handOver()` (`kanban/js/04-tier-two-the-one-thing.js:462`) writes
  alongside the tag, and a tag with no matching sub-task is deliberately skipped by
  the overnight run. That is the right behaviour for the planner, but nothing on
  the file's own side reflects it: `check_tag_hygiene()`
  (`agents/pa_agent/skills/pa/scripts/check_todo.py:707`) checks the tag's syntax
  and nothing else, so a task edited by hand — `pa`'s own SKILL.md documents
  writing the tag directly as an option — can end up looking delegated on the
  board with nobody ever planning it, and nothing flags the gap. Worth a check
  alongside `check_tag_hygiene()` that reads a `[to:: Plan agent]` or
  `[to:: Implement agent]` tag against `slug_states()`/`is_blocked()` the way
  `plannable()` already does, and reports a CHECK when the matching sub-task is
  missing.

- **The personal and pet-projects lists still carry `ai:` tags, which their next save drops without giving the tasks an assignee.**
  Stage 1 of the one board migrated only `data/twinkl/todo.md`. `personal` holds 2
  (1 full, 1 partial) and `pet-projects` 6 (2 full, 4 partial). Since `parseTask()`
  in `core/todo.js` drops `ai:` on read (`else if (key === 'ai') {}`), the board
  writes those lines back without it the first time either list saves, and nothing
  records what they were. The fix is the same run the twinkl list had, through `pa`
  after a backup: an open task with `full` or `partial` gets `[to:: Plan agent]`, a
  ticked one gets nothing, and every `ai:` goes.

- ~~**`check_todo.py` asks for a `Prompt:` note on a task with the Implement agent even when an accepted plan already does that job.**~~ **Done, 22 Sep 2026.** The checker leaves out the Implement sub-task of a handover, and the task it sits under, since the plan is the brief.
  `check_prompt_coverage()` in
  `agents/pa_agent/skills/pa/scripts/check_todo.py` reads `[to:: Implement agent]`
  as the old `ai:full` and wants a prompt under it, because Delegate to Claude
  used to be built from prompts. The composition-patterns task (`id:q5e90b`)
  flags on the twinkl list: it moved to the Implement agent because its plan was
  accepted, and the plan document is its brief. Settle it with stage 7 of
  `handover-one-board.md`, when the plan document becomes what a review sub-task
  points at, so the check can accept a plan in place of a prompt.

- ~~**The plans stream's `production` field is written and checked by `stream.py` but not declared in `stream.json`, so the shared work-streams package cannot see it.**~~ **Done, 22 Sep 2026.** Gone with the stream: `stream.py` and its manifest were deleted in stage 8 and a plan no longer carries `production:`.
  `PRODUCTION` (`agents/plan-agent/stream.py:83`) lists the four stages and `FM_KEYS` (`:84`)
  carries the key, but `agents/plan-agent/stream.json` names it under neither `fields` nor
  `states`. The board and `do` read it directly. To be discussed before anything is built: does
  it belong in `fields`, or is it a second state axis that `CONTRACT.md` should name? Moot
  since 21 Sep 2026: the sub-task entry at the top of Big makes the sub-tasks the only place
  a plan's state lives, so `state:` and `production:` leave the plan documents. It closes
  when stage 7 of `handover-one-board.md` lands.

- ~~**On a phone, Plans opens on its first column, an empty Backlog, with the plans waiting for review four columns to the right and nothing saying so.**~~ **Moot, 25 Sep 2026.** The Plans view it describes was removed in stage 8 (22 Sep) — no `PlansView.tsx`, folded into the one board.

- ~~**Plans reuses To do, Doing and Backlog from the Board to mean the agent's progress, so "Doing" there reads as "I am doing this".**~~ **Done, 21 Sep 2026.** Superseded by the one-board entry under Big, which folds Plans into the Board.
  The five Plans columns in `kanban/ui/PlansView.tsx` share three names with
  `RESERVED_TIERS` (`kanban/js/02-state.js:317`), on purpose, for parity between the two
  pages. Review finding 2 in `/Users/tiagopedras/Code/AGENTS/ux_agent/reviews/2026-09-21-to-dos-delegation/review.md`. Moot if the one-board
  entry under Big lands, so hold it until that is decided.

- ~~**The planning agent's fallback to `planning-general` never reaches `claude`.**~~ **Done, 21 Sep 2026.** `planner_for()` in `agents/planning_agent/plan.py` is the one place that decides which planner a bucket runs against, and both the main loop and `run_agent()` read it. `test_fallback_planner()` in `test_planning_agent.py` stubs `subprocess.run` and checks the `--agent` a bucket with no planner file actually reaches `claude` with.

- ~~**The string twins of Column and Card have no caller left in the app.**~~ **Done, 25 Sep 2026.** `chipHTML()`, `cardHTML()`, `colHTML()`, `colEmptyHTML()` and `cardShellHTML()` deleted from `09-columns.js` (684→455 lines); `cardModel()`, `setColCount()` and `numberBadgeHTML()` kept, since they're still live. `test_primitives.mjs` and `test_board.mjs` rewritten to pin markup captured live before the deletion. Stale comments fixed in `17-matrix.js` and `19-drawer.js`.

- **Two inline Markdown renderers know different things.** `mdInline()`
  (`kanban/js/10-reference-sections.js:687`) understands `[text](url)` links
  and `[placeholder]` markers as well as code, bold and italics, and the board
  runs every card title, plan summary and drawer note through it. Tenon's
  `Markdown` (`inlineNodes()` in the package) knows bare URLs and no link
  syntax, and is what the chat window uses. That difference is why
  `TaskCard.tsx` and `PlanCard.tsx` still take their title and summary as HTML
  through `dangerouslySetInnerHTML`. Teaching `Markdown` the link and
  placeholder forms, in Tenon, would let both take a string and drop the
  markup, and `mdInline()` would go once the drawer and the Overview bodies did.
  **Partly done, 25 Sep 2026.** `inlineNodes()` in `PACKAGES/tenon` now handles both forms, source and `dist/` rebuilt — but not tagged, and to-dos's pinned Tenon version is untouched, so `mdInline()` and the two `dangerouslySetInnerHTML` uses still stand. [needs you] Bump the tag and to-dos's `package.json` pin before the rest of this can land.

- ~~**A new task lands in the first bucket in the file even when that bucket is
  filtered out.**~~ **Done, 25 Sep 2026.** `defaultAddBucket()` (`kanban/js/07-render-board.js`) now reads `state.bucketFilter`: one bucket toggled on means that bucket, several means the leftmost in `state.doc.buckets` order, none toggled keeps the old `buckets[0]` fallback. Covered in `test_board.mjs`.

- ~~**Opening a task from a plan throws away the Plans view to do it.**~~ **Moot, 25 Sep 2026.** `goToPlanTask()` and the Plans view it describes were removed in stage 8 (22 Sep) — folded into the one board.

- ~~**Nine checks in `kanban/test_projects.mjs` have been failing silently since
  the Projects view was ported to React on 13 Sep 2026.**~~ **Done, 25 Sep 2026.** All 16 `#projectsOut` occurrences renamed to `#projectsRoot`. One check (the "another view can take the container" guard) was passing vacuously — it checked absence of a selector that never existed post-port — fixed to actually test the guard. 52/52 passing, was 9 failing.

- ~~**Nothing the board puts in the URL ever reaches the browser's history, so
  Back never returns to the view or the card you just left.**~~ **Done, 18 Sep 2026.** `syncHash()` (`kanban/js/07-render-board.js:82`) takes a `push` argument, and the three moves that are a new place pass it: a view switch (`18-timeline.js`), opening a card and opening a project (`19-drawer.js`). The hashchange listener (`kanban/js/25-archiving.js:506`) closes the drawer when the fragment comes back without a `!task=`, which is what Back out of a card now means, and sets `restoringHash` while it works so a restore pushes nothing of its own. `syncHash()` at
  `kanban/js/07-render-board.js:82` builds the whole fragment —
  `#<view>/<bucket-slug>!task=<key>` — and writes it with
  `history.replaceState()`, which overwrites the current entry rather than
  adding one. Its own comment gives the reason: the hash setter would fire
  `hashchange` and could loop with the listener at
  `kanban/js/25-archiving.js:506`. That listener is already the right thing to
  land on, since it reads `parseHash()` and restores the view, the bucket
  filter and the open task, and its comment says Back and forward come through
  it; it simply never gets an entry to go back to. `history.pushState()` does
  not fire `hashchange` either, so the loop that replaceState was chosen to
  avoid is not an argument against it. What has to be decided is which
  transitions earn an entry: a view switch and opening a card plainly do,
  closing the drawer is the same navigation backwards rather than a new place,
  and a bucket-filter toggle would fill the history with a press per chip.
  Since `syncHash()` is called from `renderTabs()`, `openDrawer()` and
  `closeDrawer()` without knowing which it is serving, it needs to be told —
  a parameter at the three call sites in `07-render-board.js:129` and
  `kanban/js/19-drawer.js:1254`, `:1263` and `:1279`, rather than something it
  can work out from `state`.

- ~~**A note block written after a task's sub-steps disappears from the drawer.**~~ **Done, 18 Sep 2026.** A line back at the step indent or shallower ends the run of step notes and hands the rest of the body back to the task, in `splitBody()` (`core/todo.js`) and `split_body()` (`core/todo.py`) both. The Python half had no indent test at all, so the two were wrong in different ways. `core/fixtures/messages.json` carries the case.
  `splitBody()` at `core/todo.js:405` gives any indented line deeper than the
  step indent to `steps[steps.length - 1].notes`, from the first sub-step
  onwards, so an `Agenda:` heading and its children placed below the steps are
  read as notes on the last step rather than as a block on the task, and
  `agenda_topics()` finds nothing. `core/todo.py:559` does the same with
  `(steps[-1]["notes"] if steps else notes).append(line)`, so the board and
  every Python reader agree and both are wrong in the same way. The fix is to
  let a line at exactly the task's own note indent close the run of step notes
  and go back to `notes`, keeping the deeper lines under it with it — which is
  the distinction the grammar already makes everywhere else, and is why an
  Agenda written above the steps works and one written below it is silently
  lost. Worth a fixture case in `core/fixtures/` either way, since it is the
  kind of thing that reads as correct in the file and shows up as an empty
  section on the card.

- ~~**A board link posted in the chat modal should open its card in this tab.**~~ **Done, 18 Sep 2026.** URLs are linkified (`mdInline()` in `PACKAGES/ai_chat_engine/interface/chat.js`, and `inlineNodes()` in Tenon's `Markdown` since the window went to React on 19 Sep 2026), splitting on backticks so a URL quoted as code stays text, and a delegated listener in `kanban/js/10-reference-sections.js` closes the window when the click lands on a link to this page carrying a `!task=` or `!chat=`.
  Once the chat window turns URLs
  into links, clicking a `#!task=<id>` one changes nothing but the part after
  the `#`, which is already what the listener at `kanban/js/25-archiving.js:506`
  wakes on and what `parseHash()` at `kanban/js/02-state.js:154` reads. What is
  left on the board side is closing the chat modal when the click lands, so the
  drawer it just opened is not sitting behind it — `closeChat()` is already on
  the object `AIChat.create()` returns, and the fallback stub at
  `kanban/js/10-reference-sections.js:785` would need the same key adding so a
  board loaded without the module does not throw.

- ~~**Finishing a plan takes the same two clicks, in the same places, as
  accepting one.**~~ **Done.** The sub-line opens with the column
  (`PLAN_COL_LABEL`), It is finished is last and unstyled in Ready to be
  produced, and the two confirms read "Move to Ready to be produced" and
  "Move to Done". Three new checks in `kanban/test_plans.mjs`. `openPlanModal()` (`kanban/js/13-plans.js:306`) puts its
  first button in one slot for every column: Accept it in Waiting for review,
  It is finished in Ready to be produced, both styled `agree`. The confirm
  sheets then repeat the pattern, with `acceptPlan()` (`:345`) and
  `finishPlan()` (`:392`) each putting their primary button first, and
  `showModal()` (`kanban/js/23-conflict-modal.js`) focusing that first button.
  An already-accepted plan opened in the belief that it was still waiting for
  review got marked finished by exactly those two clicks, and nothing on
  either sheet said which column the card was in. The fix is a sitting
  change across those three functions. The plan modal's sub-line should name
  the column the card is in now. It is finished should lose the `agree`
  styling and leave the first slot. Each confirm should say which column the
  card moves to, in the button label itself ("Move to Done").

- ~~**A plan sent back for replanning cannot be dragged from To do to Backlog.**~~
  **Done, 21 Sep 2026.** Superseded by the one-board entry under Big, which
  removes Plans' To do and Backlog. **Could not reproduce, 15 Sep 2026.** Driven both ways in a locked tab
  against a stubbed `/plans.json` — a synthetic `DragEvent` sequence, and a
  real pointer-driven drag through Chrome's own drag interception
  (`Input.setInterceptDrags` plus `Input.dispatchDragEvent`, which is the only
  way to get the browser's real HTML5 drag rather than events shaped like one).
  Both arrangements behave: Backlog lights `.coldrop`, the drop posts
  `to:"backlog"` with `owner:"me"`, and the task joins the hold list. Tried
  with an empty Backlog and with a populated one, dropping on the column body
  and on a held card inside it, with the sent-back plan alone under the queue
  and with two queue rows above it.

  So whatever he saw is not in this path, and the next report of it wants the
  thing this one could not give: what actually happened on screen — Backlog
  never lighting, the card snapping back, or a toast. Reported 15 Sep 2026.

- ~~**A plan sent back looks like a different kind of card from the queue rows
  above it in To do.**~~ **Done, 15 Sep 2026.** `queueRowNode()`
  (`kanban/js/13-plans.js`) builds a `PlanCard` now rather than a bare `Card`,
  the way `heldPlanCardNode()` already did in Backlog, so the two cards under
  one heading saying "plan this tonight" are one card shape and only the
  eyebrow differs — "no plan yet" against a sent-back plan's "planning again".
  It keeps the two things a plan card has no use for, its rank (which is what
  a drag in this column edits) and its Hold button (since there is no plan to
  open instead); the `.qwhy` line is the card's own summary now, which is the
  slot a plan's standfirst takes, and the rule is gone from `board.css`.
  `PlanCard` gained `position` and an `attrs` passthrough for the four drop
  handlers a queue row carries and a plan never does.

- ~~**Plans' To do column does not say when the next run is, and Waiting for
  review does not say when the last one was.**~~ **Done, 15 Sep 2026.**
  `schedWhen()` in `kanban/js/14-schedule.js` is the one date format all three
  places now share — the schedule modal's own Next line, and the two column
  descriptions. `renderNextRun()` fetches `/schedule.json` once when Plans
  paints, keeps the planning agent's next wake in `nextRunAt`, and
  `renderStatus()` leads with "Next run Wed 16 Sept, 00:15." and follows it
  with the window reading as a second sentence. A failed fetch is silent: the
  line still has the window sentence to say. `renderDoneStats()` leads with
  "Last run Tue 15 Sept, 00:15" rather than a sixteen-character slice of an
  ISO string.

- ~~**The dashed drop outline on a Plans column collides with the cards inside
  it.**~~ **Done, 15 Sep 2026.** It was the offset. `.coldrop` and `.coldeny`
  (`kanban/board.css`) go on `.colbody`, which fills the column's inside, and
  `outline-offset:-4px` pulled the dashed line 4px into the body's own 9px
  padding — five pixels from the cards' borders, which is what read as tangled.
  Both are `outline-offset:-1px` now, so the line sits flush with the column's
  wall and the cards keep the body's full padding clear of it, with the radius
  matched to the column's 12px less its 1px border.

- ~~**⌘↵ does not submit a modal's form.**~~ **Done, 15 Sep 2026.**
  `modalKeys()` (`kanban/js/23-conflict-modal.js`) handles ⌘↵ and Ctrl+↵ beside
  Escape: it clicks `.foot .btn.primary`, so it goes through the same handler a
  press does and covers every form `showModal()` draws now or later. It fires
  only from inside a text field — `isTextField()` beside it, which counts a
  textarea, a contenteditable and the prose-ish input types and nothing else —
  so a plain confirmation like `offerReload()`'s cannot be answered by a stray
  shortcut.

- ~~**On a phone the Board gives no sign of which column is on screen or how
  many there are.**~~ **Done, 15 Sep 2026.** `renderColTabs()` in
  `kanban/js/18-timeline.js` draws the strip and `#colTabs` in `index.html`
  holds it — a sibling of `<main>` rather than a child, because main is what
  scrolls horizontally and anything inside it would scroll away with the
  columns. It is drawn at every width and hidden by CSS above 640px, so there
  is one breakpoint to keep in step rather than two. The lit tab is found by
  nearest left edge rather than by dividing `scrollLeft` by a column's width:
  the arithmetic would be wrong the moment the columns stop being one width,
  and a measurement costs nothing at six columns. Tapping one scrolls it in,
  which the snap then lands exactly. Covered by `kanban/test_phone.mjs`.

- ~~**The Column stepper in the drawer runs its labels into each other at phone
  width, and on a phone it is the only way to move a card.**~~ **Done, 15 Sep
  2026.** `stepPickerHTML()` (`kanban/js/19-drawer.js`) draws the slider and a
  native `<select>` of the same stops in one wrapper, and `.steppick`'s rule in
  `board.css` picks which shows at the existing 640px breakpoint — so the
  component never has to know the width, and a window moved between screens is
  never told the wrong one. `wireStepPicker()` wires both to one `onCommit`,
  and every commit re-renders the drawer, so the two cannot disagree. Impact
  and Effort keep their sliders at every width: they are scales, where Column
  is a pick from a list. Covered by `kanban/test_phone.mjs`, at both widths.

- ~~**Two things on the board only reveal themselves on hover, which a phone
  never does.**~~ **Done, 15 Sep 2026.** `.sortbtn` takes `opacity:1` under
  `@media (hover:none)`, so the control stops reading as disabled on a touch
  screen. The Matrix dot is the bigger half: a click or a tap now pins its
  preview rather than opening the drawer, at every width, and the pinned
  preview carries `.mopen` — the one control that opens the task. `mPinned` in
  `kanban/js/17-matrix.js` is what stops a hover moving a pinned preview off
  its dot, and `.mpreview.pinned` is the only state that takes pointer events,
  so a hover preview still cannot intercept a click meant for what is under it.
  A click outside it or Escape unpins. The hint carries both words,
  `.hoverword` and `.tapword`, swapped in CSS rather than decided once at
  render time. Covered by `kanban/test_matrix.mjs` and `kanban/test_phone.mjs`.

- ~~**A cancelled task and a finished one are indistinguishable once they leave
  the file, so every count of completed work quietly includes work nobody
  did.**~~ **Done, 15 Sep 2026.** `cancelled` and `archived` are first-class
  fields in both parsers now — `core/todo.js` and `core/todo.py` — and both
  serialisers write them. `countsAsFinished()` in `core/todo.js` and
  `counts_as_finished()` in `core/todo.py` are the one rule, and the three
  places that counted a tick ask it instead: `parseArchiveEntries()`,
  `completedRecently()` and `trendEntries()` in `kanban/js/12-reports.js`, and
  `completed` and `done_today` in `core/aggregate.py`, which asks it of the
  archive as well as the live file. `check_cancelled()` in `check_todo.py`
  reports either tag on an unticked task as a FIX. On the board a cancelled
  task is an ordinary done card wearing one more chip, amber rather than red —
  it is a normal answer, and red on a card in Done would read as an error.

  One thing went the other way from what this entry proposed. The serialiser
  writes both tags whether or not the task is ticked, where `done:` is guarded
  by the tick. An unticked one is most likely a tick that was forgotten, which
  is what the checker says, and dropping the tag on the next autosave would
  throw that away rather than let him fix it. Covered in `core/fixtures/`
  (five new cases, generated), `core/test_reports.py`,
  `kanban/test_reports.mjs` and `kanban/test_archiving.mjs`.

- ~~**The plan modal is a fixed size, so a long plan reads through a 912px
  window however big the screen is.**~~ **Done, 15 Sep 2026.**
  `.sheet.wide.planmodal` takes `resize:both` with its caps lifted to the
  viewport (96vw by 92vh) and floors under it, and `wirePlanModalSize()`
  (`kanban/js/13-plans.js`) applies the stored size on open and records the
  next one, the way `tlLabelWidth` already is. History stays at 198px and the
  main column takes the extra room, which it already did. The native corner
  rather than a handle of its own, and `.planmodal .foot` buys it 20px of
  clearance from the last button — cheaper than a second grip to build and to
  explain. The narrow layout under 700px overrides both dimensions with
  `!important`, so a size dragged out on a desktop is inert on a phone.

  One thing worth keeping: the observer stores a change away from the size the
  sheet opened at rather than skipping its own first callback, because an
  attach and a drag in the same frame coalesce into one callback and the skip
  would swallow the drag.

- ~~**The reason box on Turn it down is an unstyled browser textarea.**~~
  **Done, 15 Sep 2026.** `#declineWhy` carries `redowhy` rather than the
  undefined `redoinput`, and `.redowhy`'s comment says it covers both modals.

- ~~**Eleven places on Plans still set a class on a node React owns, and
  nothing says which of them is safe.**~~ **Done, 13 Sep 2026.**
  `kanban/ui/test_primitives.mjs` now greps `13-plans.js` for every
  `classList.add/remove/toggle` call and fails if it carries anything past the
  six known-safe transient classes (`dragging`, `coldrop`, `coldeny`,
  `over-top`, `over-bottom`, `hidden`) — so a class that should have been a
  prop, or a wrapped-handler regression like the two the 13 Sep port already
  fixed, fails the suite instead of going quiet. The same check runs against
  `26-projects.js`, `12-reports.js` and `15-backups.js` and fails if any of
  them pick up a `classList` call at all, since none of the three needs one
  today.

- ~~**The coloured stripe on a card is thinner than it reads.**~~ **Done,
  13 Sep 2026.** The shared card rule, `.card, .repitem, .chaincard`
  (`kanban/board.css:2010`), now sets `border-left:4px solid
  var(--bc,var(--line))` with `padding:9px 10px 9px 8px`, so the two together
  still read as the component's 12px against 10px on the right — the same
  asymmetric pairing the comment above it already argued for, just
  re-balanced against the wider stripe. `.card.nostripe, .repitem.nostripe`
  keeps its own 1px width and 11px padding, unaffected either way.

- ~~**The Completed total names its own window a second time, right next to the
  picker that already says it.**~~ **Done, 13 Sep 2026.** The `.totalw` span is
  gone from `completedByCategoryReport()`, and with it `reportWindowLabel()`,
  which fed nothing else, and the two `.totalw` rules in `board.css`. The line
  now reads "N tasks finished across M categories" under a picker that already
  says which window it means. `completedByCategoryReport()`
  (`kanban/js/12-reports.js:285-289`) renders `'<span class="totalw">' +
  esc(reportWindowLabel()) + '</span>'` after "N tasks finished across M
  categories", so the label reads "12 tasks finished across 4 categories the
  last 30 days" directly under the Show picker that already reads "Past 30
  days". `reportWindowLabel()` (`:87`) only exists to feed that one span —
  dropping the `<span class="totalw">…</span>` clause leaves the sentence
  reading "N tasks finished across M categories", and the function and its
  sibling `reportWindowPhrase()` (`:79`, still used by the empty state and by
  `recentAccomplishmentsReport()`) can stay as they are.

- ~~**Weekly pace only ever draws as a line, with no way to see it as
  bars.**~~ **Done, 13 Sep 2026.** A `trendChartType` var beside `trendHidden`,
  same in-memory-only pattern, and `weeklyTrendReport()` branches on it: bars
  stack rather than group, scaled against each week's own total rather than
  any single bucket's peak, since a stack's height is the total. Line stays
  the default. The toggle is a `.tabs.small` pair in a new `.trendhead` row
  beside the "Weekly pace" heading, wired through the same delegated `#lists`
  listener as the bucket key, and `kanban/test_reports.mjs` covers the chart
  at rest and both directions of the switch.

- ~~**The counted reports carry a caveat about undated finished work that can
  never appear.**~~ **Done, 13 Sep 2026.** `undatedDoneCount()` and the
  sentence it guarded in `countedLeadHTML()` (`kanban/js/12-reports.js`) are
  gone, along with `kanban/test_reports.mjs`'s assertion of the nought.

- ~~**`pa-do` is filed with the skills that read and write his to-do list, and it
  is the only one of them that makes work happen.**~~ **Done, 13 Sep 2026.**
  Moved to `agents/implementing_agent/skills/do/`, dropping the `pa-` prefix
  since it isn't the PA's. The `~/.claude/skills/pa-do` symlink now points
  there as `do`, and every reference — `CLAUDE.md`, `agents/pa_agent/CLAUDE.md`,
  `PA-PLAN.md`, `pa/SKILL.md`, `planning_agent/README.md`,
  `implementing_agent/README.md` and `implementing-agent.md`,
  `planning_agent/plan.py`, `kanban/server.py`, `kanban/js/13-plans.js`'s own
  `/pa-do` hint text, `pa-skills.svg`'s label, and `SKILLS.md` (moved into the
  implementing agent's own table) — now says `do` instead.

  Its own SKILL.md says so —
  "This is the only skill in the set that causes work to happen rather than
  recording a decision about it" — while the other eight under
  `agents/pa_agent/skills/` all read `todo.md` or write it after a conversation.
  Execution is already its own thing with its own manifest, board, owner and
  lock: `agents/implementing_agent/stream.json`, `kanban/js/27-execution.js`,
  `data/.implementing-agent.lock`, and `agents/implementing_agent/implementing-agent.md`
  for the agent itself. None of that is the PA's, and the `pa-` prefix is what
  sends the next reader looking for it in the PA's brief, where nothing about
  execution lives. Moving it to `agents/implementing_agent/skills/` under a name
  without the prefix costs the folder move, repointing the
  `~/.claude/skills/pa-do` symlink, and the eleven references that name it by
  string — `CLAUDE.md:121` and `:167`, `agents/pa_agent/CLAUDE.md:24`,
  `agents/pa_agent/PA-PLAN.md:246` and `:259`,
  `agents/pa_agent/skills/pa/SKILL.md:305`, `agents/planning_agent/README.md:154`,
  `agents/implementing_agent/README.md:33`, `:38`, `:67`,
  `agents/implementing_agent/stream.py:21`, plus the label in
  `agents/pa_agent/pa-skills.svg:66` and the assertion in
  `kanban/test_execution.mjs:187`.

- ~~**The Reports window picker is the last segmented control that is not the
  shared tab.**~~ **Done, 13 Sep 2026.** `reportWindowSegHTML()`
  (`kanban/js/12-reports.js`) now emits `<span class="tabs small">` with
  `.tab`/`.tab.on` children, and `.repwindow-seg` and its three rules are gone
  from `board.css` — replaced by `.tabs.small` (`flex-wrap:wrap`, so it still
  wraps rather than pushing the date range off the edge) and `.tabs.small .tab`
  at the smaller of the Figma Tab component's two sizes: 12px, padding 4/9.
  Wiring was untouched — `#reportWindow` and `button[data-window]` didn't care
  which class drew them. `node kanban/test_execution.mjs`,
  `test_plans.mjs`, `test_schedule.mjs`, `test_chats.mjs`, `test_projects.mjs`
  and `test_notes.mjs` all still green (270 checks), plus a throwaway headless
  check that the picker renders as `.tabs.small` with seven `.tab`s and still
  switches and re-renders on click.

- ~~**`.aic-addsub` is the one small button still outside `.btn`.**~~ **Done,
  13 Sep 2026.** It already matched `.btn.dashed.small`'s size, padding and
  radius; the one real difference was font-weight, 600 against 560. Fixed in
  `PACKAGES/ai_chat_engine/interface/chat.css`, which both `to-dos` and
  `ai_canvas` loaded then (the rule now lives in `kanban/board.css`, since the
  window went to React on 19 Sep 2026 and that package no longer has a list
  section), so `+ New chat` / `+ Attach` now weigh the same as every
  other small dashed button in either app.

- ~~**The night's size is set in dollars, and nothing says how many plans he
  wants.**~~ **Done, 13 Sep 2026.** `max_plans` joined `budget` in
  `schedule.py`'s `DEFAULTS` (0, meaning no cap of its own), `load()` clamps a
  bad value to it, and `dashboard.py` gained the field and its setter, plus a
  headline saying what 0 means. `plan.py`'s batch loop stops on it, beside the
  budget and the floor, with the same `stopped` message shape.

  Building it turned up a bigger gap than the one this entry named: `run.sh`
  was not passing the schedule's `budget` down either — the dashboard's
  "Budget, night" field has been disconnected from every real run since it was
  built, silently falling back to `plan.py`'s own `$12` constant regardless of
  what the page said. `run.sh` now reads the schedule once, before invoking
  `plan.py`, and passes both `--budget` and `--max-plans` down — skipped for
  `--task`, which has no batch loop for either to stop, and skipped for either
  flag a caller already passed by hand, so a manual override still wins.
  `agents/planning_agent/test_planning_agent.py` covers the schedule
  round-trip, the dashboard field and setter, and that both scripts carry the
  wiring.

- ~~**Board, Matrix and Timeline take three tabs for three ways of drawing the same tasks.**~~ **Done, 12 Sep 2026.** The three collapsed into one tab, `renderViewTabs()` (`kanban/js/18-timeline.js:734`) drawing the current one plus a chevron that opens a `.dropdown-panel` of the three — same `group:'draw'` marking on their `viewDefs()` entries (`kanban/js/11-chat-cards.js`), same view ids, same fragments.

- ~~**Token Session and "What runs on a clock" take a whole track on Plans for two cards nobody reads across.**~~ **Done, 12 Sep 2026.** Both moved into a modal, `openRefCards()` (`kanban/js/13-plans.js`), opened from a button on the Backlog card's head. The grid is back to four tracks.

- ~~**`plans/actioned/` is read as though it were a night, and two things break on 5 October 2026 when the first folder is old enough for `prune()` to make it.**~~ **Done.** `kanban/server.py:909` now carries the fix: a plan pruned into `plans/actioned/` is no longer read as though its night were called "actioned" — `redoReplaced()` (`kanban/js/13-plans.js:548`) checks `p.resolution === 'superseded'` rather than comparing night strings.

- ~~**The companion shows the plans the night wrote and says nothing about the run that wrote them.**~~ **Done.** `companion/src/main/night.ts` reads `run.json` off the night's own folder and the renderer draws a summary line above the plan cards, per `companion/src/shared/types.ts`.

- ~~**The Reports window picker is a dropdown, so the seven ranges it holds are invisible until it is opened.**~~ **Done.** `repWindowHTML()` (`kanban/js/12-reports.js:829`) now emits `.repwindow-seg` as a row of buttons rather than a `<select>`.

- ~~**A plan spends most of its words before it gets to what to do.**~~
  **Done, 11 Sep 2026**, by a different route than the one written here. Capping
  the two front sections would have kept a plan carrying research he has no
  reason to read twice, so the file now holds five sections and the board shows
  three of them. `Context` is the night's research trail — what it read, the
  standing constraints, what it ruled out and why, what it could not establish —
  and `History` is one line per revision; `mdBlocks()`
  (`kanban/js/12-reports.js`) takes a `drop` list and leaves both out of the
  render, named rather than positional so a plan written before this still
  draws. What is shown is `Summary`, which says what is proposed rather than
  what the situation is, `Findings` as bullets, and `Proposed plan`, with
  `Needs you` under it. Under 300 words of his reading against 450 before.

  The hidden half is not dead weight: the implementing agent is handed the plan file
  and reads `Context`, and so does the next night when he sends one back, which
  is what the entry below this one turned out to be about.

- ~~**A numbered list in a plan renders as one run-on paragraph.**~~
  **Done, 11 Sep 2026**, as written here: an ordered branch beside the bullet
  one, `flushList()` closing whichever kind is open, and a `.repdoc .repnum`
  rule that leaves the browser's own numbering alone. It became urgent rather
  than untidy once `Proposed plan` was one of the three sections he sees. The
  original entry follows.

  **A numbered list in a plan renders as one run-on paragraph.** `mdBlocks()`
  at `kanban/js/12-reports.js:598` knows one bullet shape,
  `/^[-*]\s+(.*)$/`, so a line opening `1.` misses it, falls through to the
  paragraph branch, and is joined to its neighbours with a space by
  `flushPara()`. Every plan hits it: `agents/planning_agent/PLAN-BRIEF.md` asks
  for the course of action and the open questions as numbered steps and the
  planners write them that way, so the file on disk is right and the renderer
  is what is wrong, which also means fixing it once beats editing six planner
  briefs. It wants an ordered branch beside the bullet one, `/^\d+[.)]\s+(.*)$/`,
  with `flushList()` closing whichever kind is open and emitting `<ol
  class="repnum">`, and a `.repdoc .repnum` rule beside `.repbul` at
  `kanban/board.css:1410`, since that one sets `list-style:none` and draws its
  own middot in `::before`, which would swallow the numbers. The same function
  draws written reports and the drawer's Description field, so
  `kanban/test_notes.mjs` and `kanban/test_plans.mjs` both want a case for it.

- ~~**The diagonal stripes marking a weekend on the timeline read heavier than the working days either side of them.**~~ **Done.** `.tlweekend` (`kanban/board.css:638`) narrowed the solid band to 3px in the 12px repeat.

- ~~**A message on an Overview card runs to 400px before anything trims it, which is twenty lines of a column that holds three cards.**~~ **Done.** `.ref .msg` (`kanban/board.css:1783`) clamps to four lines (`-webkit-line-clamp:4` — three left the truncation label covering the last readable line, so it settled one line taller than first proposed) rather than a 400px height cap; `capMsgCards()` needed no change.

- ~~**The board's canvas has no way to straighten itself back out once dragging
  has piled boxes and cards on top of each other.**~~ **Closed 12 Sep 2026 —
  the canvas went instead.** A Tidy control was built for it on 10 Sep, ported
  from `tidyCanvas()` in `~/Code/ai_canvas`, and both it and the view it
  straightened were removed when the canvas came out of the board. The cards
  survive in the drawer's Chats field, stacked rather than placed, so there is
  nothing left to straighten. `ai_canvas` keeps its own version.

- ~~**The button that edits columns sits next to the button that edits buckets, not next to the control that filters by column.**~~ **Done.** `#editTiers` (`kanban/index.html`) now sits inside `#statusWrap`, beside the Status filter it actually governs.

- ~~**A project whose every task is done still wears the same "Live" tag as one with work outstanding.**~~ **Done.** `projectItemHTML()` (`kanban/js/26-projects.js:75`) now reads a third state, `.tag.projcompleted`, when `live && open === 0`.

- ~~**Delegate to Claude prints `rank:` as the row number but offers no way to change it, so the only way to reorder the list is to retype the tag on every task by hand.**~~ **Done.** `delegateSection()` (`kanban/js/10-reference-sections.js:585`) now renders a `draggable` grip on every ranked row, wired the same way the timeline's own drag-to-reorder is.

- ~~**Counted from the list weighs every finished task the same, so a bucket that closes out three L tasks reads identically to one that closes out three S ones.**~~ **Done.** `completedByCategoryReport()` (`kanban/js/12-reports.js:223`) now sums `EFFORT_N` per bucket alongside the task count, and says so plainly when nothing finished carries an effort tag.

- ~~**A recap he could paste into a status update means flattening the one report that already lists titles, not building a new one.**~~ **Done.** `recentAccomplishmentsReport()` (`kanban/js/12-reports.js:295`) is in `reportDefs()` alongside the other two.

- ~~**The planning agent's lock can sit held for a full day with nothing wrong, because staleness is judged by age alone.**~~ **Done.** `run.sh` writes the holder's PID to `$LOCK/pid` and tests it with `kill -0` before trusting the 2-hour mtime window at all; a dead PID clears regardless of age.

- ~~**Every plan comes back the same shape and the same length, whether the task needed three sentences or three days.**~~ **Done.** `PLAN-BRIEF.md` has a third shape, "### When the answer is short", and the fold bar is phrased as ask early rather than as a last resort.

- ~~**The Bucket field's dropdown button carries no chevron, so it doesn't read as a dropdown at rest.**~~ **Done.** `.bucketbtn::after` (`kanban/board.css:2164`) draws the chevron, flipped via `.open` the same way `.tlchevron` already does.

Otherwise nothing standing. The three entries that were here are done, and what
they settled is written up in the README rather than left here:

- A task in the companion's menu opens that card. The fragment carries both now
  — `#<view>!task=<key>` — the view segment doing exactly what it did before and
  the task segment opening a drawer over whatever is showing. It is the fragment
  rather than a query string on purpose: a link differing only after the `#`
  raises the tab that is already open instead of giving a second tab on one list.
- The companion knows the holidays, UK and Portuguese both, so a day off is
  quiet and the menu names the holiday and its country rather than just going
  silent. They are generated from the rules rather than kept as a table, so
  there is no year for the list to run out in, and `test_todo.py --online`
  re-checks them against gov.uk and Nager.Date.
- One `repeat:` grammar, in `core/todo.py`. `check_todo.py` imports it straight
  from the repo, and `core/test_todo.py` still holds the board's own answers as a
  frozen table, so the JavaScript third copy cannot drift either.

## Big

- **The board edits one task at a time, so moving or deleting ten cards is ten
  trips through the drawer.** Every change goes through the open task:
  `state.openTask` feeds the bucket menu's click handler
  (`kanban/js/19-drawer.js:1918`) and the `#del` button (`:1945`), whose
  `confirm()` and `splice()` act on the one card `locate()` returns. Bulk
  editing needs a selection held in `state` (a `Set` of ids beside
  `state.bucketFilter`), a way to add to it from a card (shift- or cmd-click
  in `cardHTML()`/`TaskCard`, `kanban/js/09-columns.js:427`, with the selected
  look drawn in both), and an action bar offering at least Move to column,
  Move to bucket and Delete. The moves can loop the existing splices: the
  bucket menu's `ensureTier(nb, loc.tier.name)` push, and a column move like
  `moveCardTo()` (`kanban/js/04-tier-two-the-one-thing.js:498`) without its
  Done guard. Delete keeps one `confirm()` naming the count and the first few
  titles, and the whole action should be one `markDirty()` so a single undo
  (`kanban/js/05-undo.js`) puts every card back.

- **An agent has no face on the board, so a task handed to one reads the same as
  a task handed to a person, and there is no way to see only the agents' work.**
  The only mark is the text chip `'→ ' + t.to` built in `cardModel()`
  (`kanban/js/09-columns.js:368`) and drawn by `TaskCard` (`kanban/ui/TaskCard.tsx`),
  and a sub-task row in the drawer (`kanban/js/19-drawer.js:1017`) shows no
  assignee at all. The fix is one avatar per name in `AGENT_NAMES`
  (`core/todo.js:90`), generated rather than drawn, a deterministic abstract
  generator such as DiceBear's `shapes` or Boring Avatars seeded by the agent's
  name, and drawn on the card chip, on each sub-task row and in the drawer's
  Delegate to field (`delegateSelectHTML()`, `19-drawer.js:17`). The filter strip
  only filters by bucket (`state.bucketFilter`, `kanban/js/07-render-board.js:100`)
  and column (`kanban/ui/ColumnFilter.tsx`), so "delegated to an agent" needs a
  third filter that also matches a task through its sub-tasks. Chats are opened
  per task (`openChatByKey()`, `kanban/js/02-state.js:235`) and none is addressed
  to an agent, so the avatar has nowhere to go there until one is. Needs a
  decision on the generator (a vendored script, since the board loads classic
  scripts) and whether people get avatars too.

- **A chat's mode is fixed when the window opens, so a chat that needs to
  write has to be told it cannot.** The board never passes `mode` to
  `AIChat.create()` (`kanban/js/10-reference-sections.js:756`), so the
  controller's `defaultMode` (`PACKAGES/ai_chat_engine/src/controller.ts:129`)
  is always `ask` and every conversation is stamped with it at open (`:224`).
  Nothing in the window changes it. The mode is read again on every send
  (`:444`) and each send is a fresh `claude -p --resume` run
  (`engine.py:458`), so a "can write" switch in the window's header that
  flips `c.mode` would take effect from the next message without restarting
  the conversation. That message should carry a line saying writing is now
  allowed, since the transcript so far has Claude saying it cannot.

  The switch cannot be the `work` mode that exists today, because
  `--dangerously-skip-permissions` lets a run touch anything on disk. Board
  chats are held to `to-dos/`: `data/twinkl/claude.json` points them there
  since 22 Sep 2026, and the other lists have no `claude.json`, so they fall
  back to `default_cwd`, which is `ROOT` (`kanban/server.py:1762`). A
  writing run should keep that limit instead of bypassing it, which means
  `Engine.argv()` gaining a third permission set: edits allowed inside the
  cwd and refused outside it, and `Edit`/`Write` on `data/*/todo.md` denied
  outright so every change to the list goes through the `pa` skill. That still
  leaves `pa`'s own write racing the tab's autosave, which "A chat started on
  the board has no safe way to ask the PA" covers. The switch is only safe to ship once that is settled, and
  `"work": true` has to be set in the list's `claude.json` for any of it to run
  (`engine.py:490`).

- **"Who he is" tells the PA what his job is but not how he works, so prioritisation has nothing of his own to weigh against.** `PA.md:12-21` gives one paragraph — design manager, four kinds of work in parallel, the list as memory across sessions — and the two tiers under "How he prioritises" (`:55-96`) score everything against impact and effort alone, reading tags off the task rather than anything about him. Nothing in `PA.md` says how he actually works: what he pushes through versus defers, how he treats a slipping date, what he'd rather do himself versus hand off. Written down, that section would sit beside "Who he is" and feed the same two tiers every `pa-*` skill already reads, rather than becoming a rule any one skill has to apply on its own.

- **The PA has a tone but not a personality, and every skill reads the same three lines to get it.** `PA.md:224-239`'s "Tone" section is the only place any of that is written down: direct, no padding, short bullets, no preamble, British English, no em dashes. It describes a house style for the reports `pa` writes, not a character — nothing there names a way of talking that would feel like anyone rather than a formatter. Every `pa-*` skill (`agents/pa_agent/CLAUDE.md`'s table lists all ten) reads `PA.md` first and inherits this section as-is, so giving the PA an actual personality means deciding what it is and rewriting `Tone` to state it, which every skill picks up for free without a second file to keep in step.

- **A chat started on the board has no safe way to ask the PA for a change to
  the list.** Every chat runs as `claude -p` in the cwd its list's `claude.json` names
  (`~/Code` for `twinkl`) through
  `Engine.argv()` (`PACKAGES/ai_chat_engine/engine.py:458`), so the `pa`
  skill is reachable from any of them. Two things stop it being useful. In
  Ask mode, the only one on today (`"work": false` in `claude.json`), the run
  has Bash, Edit and Write removed (`ASK_DENIES`, `engine.py:51`), so `pa`
  cannot write `todo.md` at all. In Work mode it can, but the tab that
  opened the chat holds the whole document and autosaves it, so `pa`'s write
  either trips the conflict modal (`kanban/js/23-conflict-modal.js:101`) or is
  lost. PA also exists only as a skill: `agents/pa_agent/` holds `skills/` and
  its docs, with no agent definition in `.claude/agents/` and no `agent.json`,
  so no session can hand PA a request and have PA act on it. That hand-over is
  what this entry asks for. The board already has the pattern for it, from
  the agents: `core/tick_queue.py` takes a request from outside and
  `drainTickQueue()` (`kanban/js/10-reference-sections.js`) applies it through
  the board's own edit path, the same way `attach-queue.json` does. A
  `pa-queue.json` along the same lines would let any board chat leave a
  change request in plain words, tagged with the chat's owner task, for PA to
  apply. The decision to make first is who applies it: PA turned into a real
  agent that picks requests up while the board is locked for the length of
  the write, or the board itself draining a structured request (move, tick,
  re-date, add) with no PA in the loop.

- **A chat can only be open or closed, so keeping one in view means keeping
  it on top of the board.** The controller behind the board's one
  `AIChat.create()` (`kanban/js/10-reference-sections.js:756`) has two states:
  a conversation is `current` or it is not, and `closeChat()`/`finishClose()`
  (`PACKAGES/ai_chat_engine/src/controller.ts:249`, `:262`) set it to `null`,
  so getting back to it means finding it again in the task's Chats section.
  The fix is a third and fourth way to render an open chat, modelled on
  LinkedIn's message windows: minimised, a header bar docked to the
  bottom-right edge with the title, run state and a close button, and
  anchored, the full chat as a fixed-size panel standing on that same edge,
  with buttons in its header to minimise it or expand it to the main modal.
  Clicking a minimised bar opens it anchored.

  Decided: it lives in the engine beside `windowed`, as another presentation
  of the same chat, so `ai_canvas` gets it too and neither host builds its own.
  Several chats can be minimised or anchored at once, lined up leftwards from
  the bottom-right corner, which the board cannot do today with its single
  `AIChat.create()` instance, so the board moves to one instance per open
  chat the way `ai_canvas`'s `CardWindow.tsx` already does. The anchored panel
  stays anchored: no drag, no resize, independent of the draggable-window
  entry under Small. The engine's existing `peeked` flag (`controller.ts:545`,
  drawn by Tenon's `Window` as `.tenon-window--peeked`) is a fade for
  `ai_canvas` and is not reused for this.

- ~~**A sub-task row carries two separate icon buttons instead of being one clickable row.**~~ **Done, 25 Sep 2026.** The row opens the sub-task in `#subpanel`, a second panel over the drawer sized to `.dcol-main`, with the step's note inside it; Escape and the faded area close only that panel.
  `.subopen`
  (`kanban/js/19-drawer.js:1026`, the ↗ that calls `openDrawer(btn.dataset.sub)`) and `.noteicon`
  (`:1027-1028`, the 💬 that toggles the step's note box) sit side by side on every `.sub` row, and
  Tiago wants both gone in favour of a chevron on the right and the whole row clickable to open the
  sub-task's own panel — the same shape the four handover sub-tasks already have, just without the
  separate button. That panel should stop reusing `#drawer` the way `openSubtaskDrawer()`
  (`:1416`) does today — swapping the same panel's content and relying on `#dheadBack` to return —
  and instead slide in from the right as a second panel over both the board and the open task
  drawer, fading both behind it, sized to the width of the task drawer's own left column
  (`.dcol-main`, `kanban/board.css:2314`) rather than the drawer's own resizable width
  (`state.drawerWidth`, `kanban/js/02-state.js:93`). That's a new panel and interaction, not a
  restyle of the existing one, and it still needs the gap the entry above this one names closed
  first — only a sub-task with a `stableId` can open its own panel at all today, and a
  hand-added one never gets one.

- **Skipping a `[to:: Plan agent]`/`[to:: Implement agent]` tag with no matching
  sub-task should have an exception, rather than the flat skip it gets today.**
  `plannable()` (`agents/plan-agent/pick.py:63-75`) reads the tag as the Plan
  agent's work only when the `<id>-plan`/`<id>-implement` sub-tasks are also
  there, and treats a tag with neither as not planned, full stop — the same gap
  the Small entry above this one flags from the checker's side. Tiago wants a
  case where that is not just left invisible until someone happens to notice a
  CHECK flag, but what the exception should be is not settled: the planner could
  treat the tag alone as a valid handover and mint the sub-tasks itself the way
  `handOver()` (`kanban/js/04-tier-two-the-one-thing.js:462`) does, or the gap
  could just surface somewhere he would actually see and act on it, or something
  else. Needs that decided before either the planner or the checker entry above
  it can be built.

- ~~**A sub-task added by hand has no way to open its own drawer, only one an agent handover minted.**~~ **Done, 25 Sep 2026.** `addSub()` mints an `id:`, a bare step gets one on its first click, and `core/migrations/migrate-sub-ids.py` does the lists already written (not yet run on any real list).
  The `↗` button that opens a
  sub-task's own view (`s.stableId ? '<button ... class="subopen" ...'`, `kanban/js/19-drawer.js:1026`, wired to
  `openSubtaskDrawer()` at `:1416` through `locateSub()`) only renders when the sub-task line carries an `id:` tag. Only two
  paths mint one: `handOver()` for the four Plan/Review/Implement/Review sub-tasks
  (`mintId()` calls at `kanban/js/04-tier-two-the-one-thing.js:473` and `:482`), and the one-off sweep over already-loaded
  tasks at `:71-73`. A sub-task typed in through "+ Add subtask" goes through `addSub()`
  (`kanban/js/06-dates-substeps.js:185-191`), which pushes a bare `- [ ] ` line with no `id:` tag, so it never gets a
  `stableId` and the `↗` button silently doesn't appear — there is nothing to click and nothing on screen says why. The fix
  is for `addSub()` to mint one the way `handOver()` does. That still leaves every sub-task already written into the live
  lists — `data/twinkl/todo.md` and the others — without one, so it needs a retroactive pass as well: a review of what's
  actually sitting there today, then a one-off migration (on the model of `core/migrations/migrate-agent-names.py`) that
  mints and writes an `id:` tag onto every existing sub-task line that lacks one, so all of them open the same way rather
  than only the ones an agent happened to create.

- ~~**The Dependencies section in the drawer only shows blockers, it does not let you set one.**~~ **Done, 25 Sep 2026.** Waiting on and Blocks each get an Add (the Attach-a-session search dialog) and a × per entry, a missing slug is minted from the title, a direct loop is refused; `kanban/test_dependencies.mjs`.
  `dependenciesSection()` at
  `kanban/js/19-drawer.js:574`, backed by `taskDependencies()` and `depGroupHTML()`
  (`kanban/js/19-drawer.js:360` and `:396`), renders both "Waiting on" and "Blocks" as
  `depLink` cards you can open but not create, edit or remove — the only way to set one is
  to type `blocked-by:slug` by hand into the task's raw text, which is exactly the kind of
  second, worse editor `tagsSection()` (`kanban/js/19-drawer.js:628`) was written to avoid
  for every other tag. Making the section a real editor means a slug picker to add a
  "Waiting on" entry, which writes `blocked-by:` onto this task, and a way to add a "Blocks"
  entry, which writes `blocked-by:` onto the *other* task instead, since "Blocks" is not a
  tag of its own but every other item whose `blocked-by:` names this one — so the two
  directions save to different task lines and the drawer would need to reach and re-render a
  second card whose panel is not open. `parseTaskLine()` and the write-back path in
  `core/todo.js` already round-trip `blocked-by:`, so the grammar exists; what is missing is
  the picker and the two write paths.

- ~~**An agent's part of a task has nowhere to live on the card, so planning and implementing are tracked on a separate board.**~~ **Done, 22 Sep 2026.** Built as stages 4 to 8 of the one-board plan: sub-tasks in the format, their drawer, the agents' tick queue, handover and approval on the card, and the Plans tab gone. `CLAUDE.md`, "One board", says where it stands.
  Agreed 21 Sep 2026 between two sessions and Tiago: planning and implementing become
  sub-tasks of the task they serve. Handing a task to the Plan agent moves the card to Doing
  and adds four sub-tasks, each `blocked-by` the one before, on the dependency model the list
  already has (`slug_states()` and `is_blocked()`, `core/todo.py:665`): Plan (Plan agent),
  Review the plan (Tiago), Implement (Implement agent), Review the work (Tiago). A task that
  already describes a way forward can be handed straight to the Implement agent, and then
  gets only the last two. That handover does not let a runner take it alone: unattended runs
  are still gated by the work-type list in the entry below. The board mints the four slugs
  from the task's id plus the step (`ab12cd-plan`, `ab12cd-plan-review`, `ab12cd-implement`,
  `ab12cd-work-review`), so they stay unique across the file and readable, as the slug rule
  at `CONVENTIONS.md:80` asks. An agent ticks its own sub-task when it finishes, which
  unblocks Tiago's review. Approving is ticking a review sub-task. Each review sub-task opens
  a chat with the agent that did the work (`openPlanChat()`, `kanban/js/13-plans.js:390`),
  and "Review the plan" carries a note pointing at the plan document, like the `Project:`
  note, so the chat knows which plan to open. Sending back unticks the sub-task before it
  with a `feedback` line, so the agent takes it up again and the review blocks again. The
  card moves to Reviewing when Implement is ticked, back to Doing if Implement is unticked by
  a send-back, and a ticked Plan leaves it in Doing. Ticking the parent still ticks every
  sub-task (`kanban/js/04-tier-two-the-one-thing.js:457`). The hierarchy stays as
  indentation under the parent (`subSteps()`, `kanban/js/06-dates-substeps.js:55`), one level
  deep, with nothing written for "parent". A sub-task carries every tag a task does on its
  own line, plus a six-character id as in `PACKAGES/work-streams/CONTRACT.md`, since a line
  number shifts on every edit. Its only state tag is Doing, for an agent working on it now:
  an unticked line is To do, the tick is Done, and "waiting on Tiago" is worked out (open,
  assigned to him, blocker ticked). A field it does not carry takes its parent's (bucket,
  project, due, impact, tags); state, assignee, `seen`, `feedback` and `resolution` never
  inherit. The assignee is `[to::]`, the spelling Big 14's Delegate to uses. It is not the
  contract's `owner`, which is who moves the item next, so the stream derives `owner` from
  assignee plus state. Agents never write `todo.md`: each writes a request ("tick sub-task
  <id>") to a queue file the board drains through its own edit path, the same route as
  `attach-queue.json` (`drainAttachQueue()`, `kanban/js/10-reference-sections.js:832`). The
  board applies a tick only from the agent the sub-task is assigned to, checked against
  `[to::]`, so an agent cannot tick a review and approve itself. Nothing shows until the
  board is next opened, and an unattended runner needs a ledger, as `agents/plan-agent` keeps
  in `ledger.json`, so it does not pick up a sub-task whose tick is still unapplied. The card
  shows "your move" in the accent colour when a sub-task assigned to Tiago is open with its
  blocker ticked, and the Doing header counts those cards; this replaces Plans' Waiting for
  review column. The card's progress bar stays as it is. A sub-task opens in the task drawer (`openDrawer()`, `kanban/js/19-drawer.js:820`) with its
  inherited values greyed, and a button at its top left goes back to the parent. Built on the
  `one-board` branch, planned in `handover-one-board.md`.

- **The implementing agent only runs with Tiago in the room because nothing says which kinds of work it can do alone.**
  `do` (`agents/implement-agent/skills/do/SKILL.md`, "What this skill never does") forbids
  any schedule, decided 6 Sep 2026, and `implement-agent.md` relies on that: it holds Write
  and Edit but no Bash (line 4), and its only safety net is that it can stop and ask.
  `AGENTS/improve-agent` runs alone because its work is one type, code in a repo, and its
  guards fit that type: an `improve/<date>` branch, a clean-tree refusal, tests, no merge and
  no push. The implementing agent's plans are several types, and only some of them can be
  guarded that way. Decided 21 Sep 2026: it may run without an accept step on six. Two are
  pre-approved because they only add new files inside one project folder and send nothing: a
  write-up (brief, audit, recommendations) and a draft to send (message, comment, ticket text).
  Three are guarded because they may sit beside something that exists: a draft prompt or skill,
  working data (YAML, JSON, spreadsheets) and a deck. They write into the project folder, never
  replace an existing file, and follow a fixed version-naming rule. The sixth is Figma work,
  guarded by four rules: it only works on a page it created empty, never on a page with existing
  layers, never edits an existing main component or any text, colour or other style, and gives
  variables as suggestions in text only. It also needs the desktop app open on the right file
  with the Figma Console bridge paired, and `implement-agent.md` holds no Figma tools today
  (line 4). Anything off the list stays with `do` and a person in the room. Decided 23 Sep
  2026: a new version of a prompt, skill, data file or deck is saved as `name-v2.md` beside
  the original and never overwrites it. A seventh type is added, code on a branch, guarded
  the way `AGENTS/improve-agent` is: clean tree, an `implement/<date>` branch, tests, a
  commit, never a merge or a push, and still no Bash for the agent. Both routes start a run:
  a task handed straight to the Implement agent with a `type::` tag, and a plan whose
  frontmatter declares an approved type. Still open: whether the second route skips his
  Review the plan at all, or unattended runs stay with the first route only. Build, in
  order. `PLAN-BRIEF.md` "What to write" (`:136`) asks for `type:` in the frontmatter
  (write-up, draft, prompt, data, deck, figma, code, other), read back beside `outcome:`
  in `write_plan()` (`agents/plan-agent/plan.py:627`). When the Plan agent's tick arrives
  for an approved type, `drainTickQueue()` (`kanban/js/10-reference-sections.js:873`)
  also ticks Review the plan with the note "pre-approved type", through `append()` in
  `core/tick_queue.py:87`. `agents/implement-agent/` gets `agent.json`, `run.py` and
  `hooks.py` on the shared runner (`PACKAGES/agents-engine/RUNNER.md`), off until hours
  are set; its queue is every open Implement sub-task whose blocker is ticked and whose
  type is approved. The harness holds the guards: types 1 to 5 revert and set aside any
  write outside the project folder or over an existing file; code runs as improve-agent
  does; Figma runs only when the Figma Console bridge is paired on the right file, with the
  four page rules in the prompt and Figma write tools granted for that run alone. Then
  `implement-agent.md`, the `do` skill's "It never runs unattended" (`SKILL.md:113`) and
  the README say so. The runner follows it: the schedule file and `run.sh` that
  `agents/implement-agent/README.md` describes, on the same `agent.json` contract as
  `agents/plan-agent`. The handover-level entry (off, plan first, just do it) and the entry on
  what the implementing agent produces are blocked on the same list of types. Approval is
  carried by the review sub-tasks in the entry above this one, and this list decides which
  work a runner may take on its own, including a task handed straight to the Implement
  agent.

- **The app and its data sit in one checkout, so the hosted web version can only ever show `demo.md` and cannot work on a data folder on the person's own machine.**
  `ROOT` and `DATA = "data"` (`kanban/server.py:41`, `:74`) put every dataset at
  `dataset_dir()` (`:131`) beside the code, and everything the page reads comes through
  routes on that one server: `/data/todo.md` (`FILE_URL`, `kanban/js/01-markdown-model.js:10`),
  `/plans.json`, `/reports.json`, `/backups.json`, `/projects.json`, `/schedule.json` and
  `/queue.json`. The Vercel copy serves static files only, so `load()` falls back to
  `kanban/demo.md` under the read-only lock (`kanban/js/21-datasets.js:244`). To let the
  hosted page work on a local folder, the folder has to become the unit the person points
  the app at, with a fixed layout inside it (`todo.md`, `plans/`, `reports/`, `backups/`,
  `projects/`, `buckets/`), and the page has to reach it without `server.py`, either through
  the browser's File System Access API (Chrome and Edge only) or through a small local
  helper the page talks to. The first step is the inventory: which of the routes above only
  read files and could be answered by the page itself, and which need the server (`_open_terminal()`,
  the planning agent, the companion). It also touches the two saved decisions on browser
  file mode: a crash-copy in localStorage, and that a real list opened in a page served
  from a public URL means its safety rests on code fetched over the internet. Works with
  the entry below, since a project folder of the person's own has to be reachable the same way.

- ~~**Every project folder has to live under `data/<dataset>/projects/`, so someone who keeps their work in a folder of their own cannot point the board at it.**~~ **Done, 25 Sep 2026.** `core/project_folders.py` holds the one check, `resolve()` (realpaths compared with `os.path.commonpath`), used by `/project.json`, `/project/open`, `project_listing()` and the planning agent's `project_dirs()`. Approved folders live in `data/<dataset>/project-folders.json`, written by `POST /project-folders` and read by `GET /project-folders.json`; the drawer's Use an existing folder picks one or approves a typed path after a confirm. `taskProject()` reads a `Project:` note carrying an absolute path, and the implementer's and planners' prompts follow the note as written.
  `projects_dir()` (`kanban/server.py:316`) is the only place a project can be, and
  `/project.json` (`kanban/server.py:2200`) refuses any name with a separator or a parent
  hop in it, so `- Project: data/projects/<name>` (`taskProject()`,
  `kanban/js/06-dates-substeps.js:88`) can only name a folder inside it. Letting the
  person choose a dedicated folder per project, an existing one anywhere on disk, and
  making that the normal case rather than the exception, means the `Project:` note
  carries a path instead of a name and the server checks it against a list of folders the
  person has approved, since the current guard only works because everything sits under
  one root. `project_listing()` (`kanban/server.py:476`) would walk that list as well as
  the default folder. The approved list is one file per dataset,
  `data/<dataset>/project-folders.json`, outside `todo.md`. The default folder stays:
  it counts as approved without being listed, and a project with no folder chosen
  lands there, so someone who never picks one works exactly as today. The agents that read a project folder, `implementing-agent` and the planners,
  would follow the note's path rather than assuming `projects_dir()`.

- **A new user cannot set up an agent from inside the app, because agents, their rules and their skills are all written by hand.**
  An agent today is a file in `agents/planning_agent/` (`planning-<stream>.md`, `agent.json`,
  `schedule.py`) plus a brief under `data/<dataset>/buckets/<stream>/` and the rules in
  `CONVENTIONS.md`; nothing in `kanban/` creates one. Bench's users know very little about AI
  (`AGENTS/ux_agent/clients/tiago/products/bench/users.md`), which asks for a guided setup that
  puts four questions per agent: what it should be like, what tasks it does, whether there is
  documentation on how those tasks are run, and what the output looks like and in what form.
  The answers would write the brief and the agent definition, and the flow would end on the
  agent card from the "Someone new to the app cannot tell what the agents can do" entry and its handover level (finding 8 in
  `/Users/tiagopedras/Code/AGENTS/ux_agent/reviews/2026-09-21-bench-delegation-2/review.md`).
  The answers are written into the bucket's brief,
  `data/<dataset>/buckets/<stream>/<stream>.md`, the file the planners and the implementer
  already read for context, so an agent the person builds stays private and out of git while
  the tracked `planning-<stream>.md` files stay as the shipped ones. Learning from use is a
  proposed edit to that same brief: when a plan is sent back or an output is changed, the
  agent suggests a line and the person accepts or rejects it, so nothing in the brief
  changes without their say.

- **Bench's agents are three the person works with, plus specialists they call in, and nothing in the app models that yet.**
  Agreed on 21 Sep 2026 after the second UX review (`/Users/tiagopedras/Code/AGENTS/ux_agent/reviews/2026-09-21-bench-delegation-2/review.md`). The PA,
  the planner and the implementer are the only agents that own a task, each shown by
  name as its owner, the way an assignee is. Specialists sit one per bucket by default
  (the planners already read `data/<dataset>/buckets/<stream>/`), are brought in when a
  task in their bucket is planned or carried out, can be called from another bucket
  when a task crosses two, and may give a view or do part of the work. They never own
  a task, but every call is written to the task's history ("Planner asked the Hiring
  expert"). Needs the `owner` field in `PACKAGES/work_streams/CONTRACT.md` read by the
  board, and a history per task, which the activity feed entry below also needs.

- **Every agent works one way, plan then accept then produce, so someone who only wants the output has to read and accept a plan first.**
  The implementing agent only runs on accepted plans (the `implementing-agent`
  entry further down), and of 41 plans written 5 were accepted and 2 produced.
  Review finding 3 in `/Users/tiagopedras/Code/AGENTS/ux_agent/reviews/2026-09-21-bench-delegation-2/review.md` suggests a
  handover level per agent: off, plan first, or just do it. With "just do it" the
  work goes straight to review as output, with the plan still readable. The
  personas it serves are in `ux_agent/clients/tiago/products/bench/personas.md`.

- **Someone who only uses the PA to keep their list still has agent columns, a Plans tab, an "AI can do" filter and `ai` chips in their way.**
  `renderViewTabs()` (`kanban/js/18-timeline.js:879`) always draws Plans,
  `boardColumns()` (`kanban/js/02-state.js:337`) always splices in Handed to AI,
  and `state.aiFilter` (`kanban/js/02-state.js:71`, read in
  `kanban/js/07-render-board.js:8`) is always offered. Review finding 2 suggests
  hiding all of it until the person sets up their first agent, in line with the
  quality bar of showing only what is needed at that moment.

- **The board can show its agents' schedule but cannot show their status or change their hours, because that half lives in `agents-dashboard`.**
  `schedule_listing()` (`kanban/server.py:932`) feeds `/schedule.json` and the Spend and
  clocks modal (`kanban/ui/RefCards.tsx`, `kanban/js/14-schedule.js`), and its own header
  says everything in it is read-only. Turning the planning agent on, setting its hours and
  reading what a run did all happen at `~/Code/agents-dashboard`, a second server on 8770
  (`agentsd/server.py`, `discover.py`, about 2,300 lines of React in `src/`) that reaches an
  agent only through the `agent.json` beside it (`agents/planning_agent/agent.json`, its
  `state`, `apply`, `run` and `activity` commands). Someone who installs the board would
  never find that page, so the board needs its own Agents view. Discovery, the four
  routes and the schedule arithmetic are already in `PACKAGES/agents_engine/`, which the
  dashboard is built on. `kanban/server.py` mounts `agents_engine`'s routes itself
  (`python/agents_engine/routes.py`), so the view works with nothing else running. The
  hour track, ruler and agent cards move out of `agents-dashboard/src/` into
  `agents_engine` as components on Tenon, loaded by both apps, so there is one hour track.
  The board changes the schedule through `apply`, never by opening `schedule.py`'s file,
  so it stays the one writer, and the discovery walk over `~/Code` should not ship in the
  board.

- ~~**A task handed to an agent leaves the board it was on, and the Board and Plans then give two answers about where it is.**~~ **Done, 22 Sep 2026.** Stage 2 and stage 8: Reviewing replaced Waiting for review, Blocked and Handed to AI went, and the Plans tab went with them.
  `boardColumns()` (`kanban/js/02-state.js:337`) splices the synthetic `AI_COL`
  after Doing for anything tagged `ai:: full`, while the task keeps its real tier
  underneath, so "Create a DS" reads Handed to AI on Board and Doing on Plans. The
  UX review of 21 Sep 2026 (finding 1, in `/Users/tiagopedras/Code/AGENTS/ux_agent/reviews/2026-09-21-to-dos-delegation/review.md`) suggests one
  ticket on one board whose owner changes as it moves between you, the planning
  agent and the implementing agent, which is how Linear delegates to agents and
  what the `owner` field in `PACKAGES/work_streams/CONTRACT.md` already models.
  Plans would fold into it. Still to decide: the column names. The review proposed
  Brief → Planning → Plan review → Producing → Review → Done, and Tiago is not
  convinced by them. The other two shapes it weighed were one ticket per actor and
  one ticket that stays in Doing throughout.
  His objection: a Plan review column means nothing for a task he does alone. The
  follow-up suggestion is columns that say whose move it is rather than which step
  the work is at: To do, Doing, Review, Done. Planning and producing both sit in
  Doing with the agent as owner and a state line on the card. A plan and a finished
  piece of work both land in Review, labelled "Plan ready" or "Work ready". A solo
  task never passes through an agent step. Settled the same day: the four columns stand, but they
  say only the state of the card. Who does the work is the task's or sub-task's
  assignee, never the column (`AGENTS/ux_agent/knowledge/disputes/columns-by-whose-move.md`).
  The columns, settled with Tiago later the same day: Backlog, To do, Doing, Reviewing, Done.
  Backlog stays. Waiting for review is renamed Reviewing. Blocked goes, and its tasks move to
  Reviewing. Handed to AI goes. Done becomes a real heading, a state like any other. A card
  stays on the board for the whole life of its task, and the agents' part shows as sub-tasks
  (entry at the top of Big). Sorting stays as it was before an agent picked the task up.

- **Once a task is handed over, the card cannot say whether the agent has started, is stuck, is waiting on you or has finished.**
  The only signal on the card is the gear `colgear` draws in `kanban/js/09-columns.js:539`,
  and it turns per column, not per task. Run state lives in the Plans column headers
  (`PlansView.tsx`, "Last run 02:05, planned 0 of 2"). A line on each card reading
  "Planner · waiting for you · 02:05" would need the run record per task from
  `agents/planning_agent`, and the same from `implementing-agent`. This is the
  one place the review (finding 4) suggests departing from familiar patterns.

- **What the implementing agent produces never reaches the board, so it cannot be checked or sent back from where the task lives.**
  A plan can be read in `openPlanModal()` and talked through in `openPlanChat()`
  (`kanban/js/13-plans.js:485` and `:390`), but past Ready to be produced the work is
  reviewed through the `do` and `agents-review` skills in a terminal. Each ticket needs
  an activity feed: brief, plan, output, and a reply that goes back to whichever agent
  last touched it (review finding 5). The implementer produces four kinds of output, and
  the feed draws each one its own way: files in the task's project folder as links that
  open in the drawer; a git branch as its name, commit count and a summary, merged
  through `agents-review`; a Figma branch as a link that opens it in the desktop app;
  and a Slack or email draft shown inline on the task, ready to copy.

- **Someone new to the app cannot tell what the agents can do, or what full, partial and none mean.**
  The rules live only in `CONVENTIONS.md`, and `TIER_HINT` in
  `kanban/js/02-state.js:325` says no more than "tagged ai:: full, not done yet".
  Matters once the app ships: each agent gets a short card saying what it does,
  what it cannot do and what it needs from you (review finding 6).

- **Nothing decides what a failed agent run looks like on a task.**
  A planning or implementing run that errors or gives up leaves no mark on the card
  today. A failure shows as a state line on the card ("Producer · failed") and as a
  desktop notification sent for failures only, for the person who trusts the output and
  rarely looks (second review, finding 5). The notification goes through the companion's
  `postNotification()`; the web copy has no equivalent and gets the card line alone. From
  the line the person can read the log, which opens the run's error output in the
  drawer; retry, which queues the same run tonight for a planner or on the next `do` for
  the implementer; or take it back, which clears the agent as assignee so the task is
  theirs again.

- ~~**Nothing decides whether an agent the person built should look different on a card from a pre-built one.**~~
  **Done, 21 Sep 2026.** It does not. An agent the person builds is a specialist, which
  never owns a task and so never appears on a card, and in a task's history every agent
  is named the same way, built or shipped.

- ~~**"Who does it" and "Delegated to" are two fields for one question, and only one of them says what the agents should do.**~~ **Done, 22 Sep 2026.** Stage 1: `[to::]` is the one field and `ai:` is dropped on read. The personal and pet-projects lists still carry a few `ai:` tags, which is its own entry.
  The drawer draws a step slider for `ai:` (`AI_STOPS`, `kanban/js/19-drawer.js:148`,
  the field at line 939) beside a free-text input for `to:` (`f-to`, line 943), and
  everything the agents act on reads `ai:`: `delegateSection()` in
  `kanban/js/10-reference-sections.js:609`, the Delegate drop in `stripDelegation()`
  (`kanban/js/18-timeline.js:1463`), `eligible()` in `agents/planning_agent/pick.py:116`
  and the prompt in `plan.py`. The change is one dropdown, "Delegate to", holding
  `[to::]`: Planning Agent and Implementing Agent at the top, then the names in
  `data/<dataset>/people.md`. Planning Agent means plan it and stop, Implementing
  Agent means plan it first and carry it out once the plan is accepted. `ai:` is no
  longer read or written, and a backup that still carries it is ignored. The list of
  names comes from a new `/people.json` route in `kanban/server.py` that parses the
  tables in `people.md`, so nobody keeps a second list by hand, and the server needs a
  restart once it lands. `core/todo.js`, `core/todo.py` and the three fixtures change
  together, as does the `pa` skill's tag table. Delegate to Claude reads
  `to:: Implementing Agent`, so it starts empty. The migration runs through `pa`: an
  open task tagged `ai: full` or `partial` gets `[to:: Planning Agent]`, a task whose
  plan is accepted with `production: doing` or `review` gets
  `[to:: Implementing Agent]`, a ticked task or a plan with `production: done` gets no
  `[to::]`, and every `[ai::]` tag is stripped (58 full, 183 partial and 245 none on
  the `twinkl` list).

- **The board's tag chips are its own `.tag` classes, not Tenon's `Tag`.**
  `cardModel()` (`kanban/js/09-columns.js`) gives each chip a class such as
  `tag impact-high` or `tag due late`, and `board.css` styles about twenty of
  them (`.tag.needsscore`, `.tag.proj`, `.tag.jira` and the rest), while Tenon's
  `Tag` draws `tenon-tag--<tone>` and `tenon-tag--chart` from a tone or a chart
  colour. `TaskCard.tsx`, `PlanCard.tsx` and `RefCards.tsx` all draw the board's
  spelling in React. Moving them means mapping each of the twenty to a tone,
  which changes how the board looks, so it wants a look at the result rather
  than a find and replace. The suites that read chip classes are
  `test_board.mjs`, `test_plans.mjs` and `test_overview.mjs`.

- ~~**The Timeline's body is still one HTML string.**~~
  **Done, 25 Sep 2026.** The lanes, bars, scale, legend and tray are
  `TimelineBody` (`kanban/ui/TimelineBody.tsx`), drawn from the data
  `timelineSection()` now returns, each mark a positioned `div` and each tray
  card a Tenon `Card`. Every drag is a prop whose handler stays in
  `kanban/js/18-timeline.js` (`timelineHandlers`), and row reorder is still
  Tenon's `bindReorder`, bound once per lane through a ref. Every `data-*`
  the delegated listeners read is kept. Two things changed underneath because
  React keeps the same bar from one render to the next: a bar drag puts back
  the position React drew before the redraw, and it swallows the click its
  release fires, which the old redraw used to throw away. `test_timeline.mjs`
  went from 11 checks to 29, driving a reorder, bar click and move, handle
  resize, track click and tray drop; they were committed green against the
  string version first.

  What it said: `timelineSection()`
  (`kanban/js/18-timeline.js:290`) returns markup for the lanes, the scale and
  the tray of undated tasks, and `TimelineView` in `kanban/ui/SectionsView.tsx`
  draws it through `dangerouslySetInnerHTML`. Porting it means the lanes and
  their bars become props, and it means the drag wiring gets a home:
  `wireTimelineDrag()` and `wireTlReorder()` arm native handlers on nodes found
  by selector after the paint, and reuse the board's `dropLine`, which
  `BoardView` no longer touches. The handlers can become props the way
  `BoardView`'s did. `kanban/test_timeline.mjs` has 11 checks and would want
  drag and reorder cases before anything moves, since the drag is the risk.

- ~~**Overview, Matrix and Timeline are components around bodies that are still HTML strings.**~~
  **Done for Overview and the Matrix, 20 Sep 2026; the Timeline is the next entry.**
  Overview's four reference columns are `RefSection` and its Context column is
  `ContextBody` (`kanban/ui/OverviewBodies.tsx`), each card a Tenon `Card` that
  keeps the board's `ref` class. `bigRocksSection()`, `weekSection()`,
  `quickSection()` and `delegateSection()` in `kanban/js/10-reference-sections.js`
  and `contextSection()` in `kanban/js/11-chat-cards.js` return blocks of data,
  and warnings are Tenon's `Alert` and empty states its `ColumnEmpty`. The
  Matrix is `MatrixBody` and `ChainBody`, with each dependency ticket a `Card`,
  and its hover preview draws `TaskCard`. Every control kept the attribute the
  delegated listener in `kanban/js/25-archiving.js` reads (`data-tick`,
  `data-open`, `data-unweek`, `data-quickdismiss`, `data-quickrestore`,
  `data-quicksort`), and `capMsgCards()` still measures `.ref .msg`. What
  stayed markup is the message, prompt, agenda and Jira note under a card,
  which `messageHTML()`, `agendaHTML()` and `jiraHTML()` in
  `kanban/js/11-chat-cards.js` draw for the drawer too, so they move with it.
  `kanban/test_overview.mjs` grew from 24 checks to 34 and `test_matrix.mjs`
  passed unchanged at 42.

- **The drawer, the header chrome and the conflict modal are still strings, so Tenon's components cannot reach them.**
  Plans and the Board view went to React on 19 Sep 2026, and so did Projects,
  Backups and Overview, the Matrix and the Timeline around their bodies. What is
  left is the headline bar (`renderHeadline()`, `kanban/js/18-timeline.js:1058`),
  the filter bar (`renderFilterBar()`, `:1120`), the view tabs
  (`renderViewTabs()`, `:879`), the bucket tabs (`renderTabs()`,
  `kanban/js/07-render-board.js:118`), the phone's column strip
  (`renderColTabs()`, `:1147`), the drawer (`openDrawer()`,
  `kanban/js/19-drawer.js:820`, in a 1,725-line file) and the plan modal
  behind Plans (`openPlanModal()`).

  `showModal()` went first, on 25 Sep 2026. It keeps its signature and still
  lives in `kanban/js/23-conflict-modal.js`, but it now mounts Tenon's `Modal`
  through `BoardUI.mountBoardModal()` (`kanban/ui/BoardModal.tsx`), so every
  modal on the board, the conflict modal included, is Tenon's box, head,
  footer and `Button`s. Escape, ⌘↵ from a text field and focus on the first
  button are Tenon's now, and `modalKeys()`/`isTextField()` went with it. The
  body and subtitle are still HTML strings drawn into `.mid`, which callers
  query through `modalEl`. `wide` + `planmodal` is Tenon's `xl` resizable box.
  One change in behaviour: Escape with a modal over the drawer now closes the
  modal only, because Tenon stops the key there.

  The `.err` boxes show the gap. Six views draw Tenon's `Alert`, and eleven in
  plain JS (six in `13-plans.js`, three in `14-schedule.js`, one each in
  `12-reports.js` and `20-loading-saving.js`) still use the `.err` rule in
  `board.css`. The same split holds for `.tabs` against `SegmentedControl`, the
  drawer's `#scrim` against `Modal`, and the drawer's
  `<textarea>` and `<details>` markup against `Textarea`, `EditableText` and
  `Disclosure`. `Disclosure` is a button that unmounts its panel and the
  board's folds are native `<details>`, so Tenon's `Disclosure` gains an option
  to draw a native `<details>`, the way its `Column` already does when
  collapsible, and the `ufold` and `schedlog` folds move onto that, keeping the
  browser's own open state and find-in-page.

  Order: the tab strips and the filter bar onto `SegmentedControl`. The drawer goes
  last, as a job of its own, because `openDrawer()` is reached from every view
  and the Markdown and report builders it uses are shared with Plans. After
  splicing any renderer out, grep
  its file for a second definition of every name replaced, since a later
  duplicate in a classic script wins.

- ~~**A theme is a real layer of the list and the board has never heard of it.**~~
  **Done, 25 Sep 2026.** `[theme:: ]` is a first-class field in `core/todo.js`/
  `core/todo.py` and `RESERVED_TAG_KEYS` (`kanban/js/19-drawer.js`), with fixture
  cases in `core/fixtures/parse.json`. Values are declared per bucket in
  `bucket-themes.json` — `loadBucketThemes()`/`setBucketThemes()`
  (`kanban/js/08-buckets.js`), `/bucket-themes` in `kanban/server.py` — the exact
  shape `bucket-colors.json` already uses for a preference about the list rather
  than a fact `todo.md` carries, edited through a new Themes field on each row of
  the bucket editor rather than the brief or the heading, which would have meant
  a second reader/writer of a shape already owned elsewhere. The board: a second
  row of pills under the bucket tabs (`renderThemeTabs()`, `07-render-board.js`),
  shown only while a single themed bucket is filtered and toggled the same way
  `state.bucketFilter` is; a `.tag.theme` chip on the card (`cardModel()`,
  `09-columns.js`); a Theme field in the drawer offering only the bucket's own
  declared values. Still to do, and out of scope here: migrating the 49
  `- Stream: …` note lines in `twinkl` to the tag, and rewriting the DS brief's
  instruction to read the first note line — both private data, through `pa`.
  The Design System bucket is sub-organised into five themes — ways of working,
  audits, improvements, documentation, enablement — and the only record is a
  sentence at the top of the task's notes, `- Stream: audits.`, on 49 of the 152
  tasks in `twinkl`. Nothing parses it: `parseTaskLine()` (`core/todo.js`) reads
  it as ordinary prose, `KNOWN_TAG_FIELDS` (`kanban/js/19-drawer.js:584`) has no
  entry for it, and `splitDrawnNotes()` (`:413`) leaves it in the Description
  field precisely because no part of the panel draws it. The one thing that does
  use it is the overnight planner, and only because
  `data/twinkl/buckets/ds/ds.md` tells the agent to read the first note line —
  which is an instruction to a language model rather than a field, so it cannot
  be filtered, counted or coloured, and a task filed under the wrong stream
  looks exactly like one filed correctly.

  Making it official is a tag, `[theme:: audits]` alongside the other
  double-colon four so a query can see inside it, plus somewhere for the values
  to be declared per bucket rather than invented per task. The board half is a
  second row of pills under the bucket tabs, reusing `bucketColor()` and
  `BUCKET_COLOR` (`kanban/js/02-state.js:275`) and `state.bucketFilter`'s own
  shape (`kanban/js/08-buckets.js`), and a chip on the card.

  The level is called a theme because "stream" already means a whole bucket, in
  `bucket_stream()`, `BUCKETS.md` and the `buckets/<stream>/` folders, and a
  queue of work items in `PACKAGES/work_streams`. The 49 `- Stream: …` note lines
  become `[theme:: …]` tags through `pa`, and the DS brief's instruction to read
  the first note line is replaced by the tag.

- ~~**A task with no project folder can only be given one by hand, and a folder
  the board knows about cannot be opened.**~~ **Done, 25 Sep 2026.** Start a
  project in `projectSection()` posts to `/project/start` (`start_project()`,
  `project_seed()` in `kanban/server.py`), and `setTaskProject()`
  (`06-dates-substeps.js`) writes the note above every other note for autosave.
  Open folder posts to `/project/open`, checked by `project_folders.resolve()`,
  and is left off when `state.demo` is set. `projectSection()`
  (`kanban/js/19-drawer.js:435`) draws an empty state telling him to type
  `data/projects/<folder>` into Description himself, which means creating a
  project is three steps in two places: make the folder on disk, write its
  `CLAUDE.md`, then edit the note. A Start a project button in that section
  would need a route beside `/project.json` (`kanban/server.py:2200`) that
  makes the folder under `projects_dir()` and seeds a `CLAUDE.md` with the H1
  and lead paragraph `project_meta()` already reads back out of it. Once the
  route answers, the board adds the `Project:` note line to the task in memory,
  the same edit the drawer's Description makes, and autosave saves it, so the
  server never writes `todo.md` and the board stays its one writer. The line
  lands where `taskProject()` expects it, above any other note. Opening the folder afterwards is a second, smaller
  route: `_open_terminal()` (`kanban/server.py:1478`) already shows the shape
  for shelling out from the server, and revealing a folder is
  `subprocess.Popen(["open", path])` against a path checked to sit inside
  `projects_dir()` the way `/project.json` already checks its `name`. It only
  works on the machine the server runs on, so the button has to be absent or
  refused on the Vercel copy rather than failing silently.

- ~~**The Attach a session picker is sixty unsearchable rows.**~~ **Done, 25 Sep
  2026.** `openAttachPicker()` (`kanban/js/10-reference-sections.js`) now draws
  an `.attachpick-search` box above the rows, debounced 200ms, sending its term
  as `?q=` to `/claude/attachable.json`. `list_sessions()` in
  `PACKAGES/ai_chat_engine/engine.py` takes an optional `query`, matching
  title or cwd case-insensitively before the newest-sixty cap, not after —
  `http_glue.py`'s `attachable()` and `kanban/server.py`'s
  `/claude/attachable.json` route pass it through. Row layout and the no-status
  read are unchanged.

- **There is no way to talk to the PA while the board is in front of you.**
  Every conversation the board can start belongs to one card — `AIChat.create()`
  (`kanban/js/10-reference-sections.js:792`) resolves an owner through
  `locate()` or a `plan:` prefix, and `newChat()` (`:1049`) seeds it from
  `taskDescription()` — so a sitting about the whole list has nowhere to
  happen. **Talk about the list** was the answer from 14 Sep 2026 until it was
  removed: `openListChat()` opened a real `Terminal.app` window and locked the
  board for the length of it, which put the list he was discussing behind a
  lock bar. What this asks for instead is a persistent panel anchored to a
  corner of the board, opened from a bubble, in the shape of a support chat —
  a `/pa` conversation he can keep typing into while the cards stay live and
  visible beside it. Most of the parts exist: `opts.windowed`
  (`PACKAGES/ai_chat_engine`, drawn by Tenon's `Window`) already drops the centred,
  scrim-backed modal for a window the host places, and `Runner.run()` already
  passes `--resume` (`engine.py:465`), so a continuing session is not new work.
  Two things are. The owner has to be the board rather than a task, which
  `ownerLabel` and every `chatKeyFor()` caller currently assume. And the lock
  cannot come with it: `pa` writes `todo.md` while this tab autosaves the same
  file, which is exactly the race `state.locked` was set to win. With the panel
  open the two take turns instead: before a message is sent the board saves
  anything unsaved, and once `pa`'s reply lands it reloads `todo.md` from disk,
  so `pa` stays the writer it already is and the board never saves over it.

- ~~**Reading what got done means leaving the page that says what is next.**~~
  **Done.** Reports is not a tab any more: Tasks finished leads Overview's row
  and Written reports closes it, `TasksFinishedColumn` and
  `WrittenReportsColumn` in `kanban/ui/ReportsColumns.tsx`, listed by
  `OverviewView` (`kanban/ui/SectionsView.tsx`). Both fold, under
  `ov:Tasks finished` and `ov:Written reports` in the same key Overview's own
  five use, and both heads carry a count and a description like every column
  beside them — which took two grey paragraphs out of the counted body, along
  with `CountedLead` and `buildCountedLead()`. Tasks finished is
  `minmax(774px,2fr)`, two reference columns and the gap between them, which is
  why every track in that grid now carries its own floor rather than the row
  multiplying one width by a count — the row is about 3,350px wide at its floor
  and scrolls sideways, the same as every other row of columns here.
  `/reports.json`
  is read once per arrival at Overview rather than once per render of it
  (`lastRenderedView` in `kanban/js/18-timeline.js`, `ensureWrittenReports()` in
  `kanban/js/12-reports.js`), and `#reports` still resolves — `isKnownView()`
  keeps the id and `renderView()` sends it to Overview, the same way `#quick`
  and `#delegate` already went there. Every check in `kanban/test_reports.mjs`
  but two came across untouched.

- ~~**Done is not a column, it is the tick read sideways, and that makes the tick
  carry two facts at once.** `DONE_COL` (`kanban/js/02-state.js:283`) is
  synthesised onto the end of the column list by `boardColumns()` (`:344`) and
  kept out of `tierOrder()` entirely, so a card is "in Done" only because
  `t.done` is true. That works everywhere a tick means finished and breaks where
  it means something else: on a recurring task the tick means "prepared for this
  occurrence", so `rollRecurring()`
  (`kanban/js/04-tier-two-the-one-thing.js:224`) cannot leave a rolled card in
  Done without also claiming it is prepared for the occurrence coming, and has
  to untick it and park it in Backlog or To do instead. Holding a rolled card in
  Done costs a second pass that reads `[done:: ]` against the previous
  occurrence to tell a stale tick from prep he has just done, which is a fact
  about the card the file never states.

  A real Done heading would make the column a place and leave the tick to mean
  one thing, and the roll could then untick and stay put. It is built as part of
  the one-board entry above, which redraws every column anyway, so the format
  changes once rather than twice. It brings a second writer on the same fact,
  so the one board needs a rule for a card
  ticked but sitting in To do, and one for a card in Done but unticked, and it
  reaches `RESERVED_TIERS` (`kanban/js/02-state.js:315`, which exists partly to
  stop that heading being typed by hand today), both `core/todo.js` and
  `core/todo.py`, the fixtures under `core/fixtures/`, the reports, archiving,
  the timeline, the matrix and the drawer's Column field.

- ~~**The Plans view needs one review of its whole lifecycle: what a card is,
  how a task becomes one, what each drag does, and what the plan modal
  offers in each column.**~~ **Done, 18 Sep 2026.** All four requirements, as written above. `pick.py`'s three exclusions place a card in Backlog with the reason on it rather than dropping the task, and a drag into To do writes the `force` list that overrules them; every task in Handed to AI now has exactly one card. `planButtons()` (`kanban/js/13-plans.js`) gives each of the seven columns its own set, `openQueuedModal()` opens a card with no plan yet, and Hold is Move to backlog. Today the pieces were decided one at a time and no
  longer add up. Backlog and To do draw cards for tasks that have no plan file
  (`queueRowNode()`, `kanban/js/13-plans.js:1348`), the modal has two button
  sets split on one test (`planColumn(p) === PLAN_COL.produced`, `:315`), so a
  plan in Producing or Done still offers Accept it, and the set of tasks on
  Plans is not the set in Handed to AI: the board draws every open task tagged
  `ai: full` (`kanban/js/18-timeline.js:991`) while the queue drops four of
  them silently (`eligible()` and `select()`, `agents/planning_agent/pick.py:97`
  and `:346`). Settled with the owner 17 Sep 2026, in the order below.

  **One task, one plan, and the two views agree on the count.** A task dropped
  on Handed to AI gets a card on Plans immediately, and the only way a card
  leaves the queue is him moving it to Backlog. So the four exclusions
  `pick.py` applies stop hiding a card and start placing one: a task that is
  blocked by another, or has a `start:` date still ahead, or sits in Waiting
  for review or Blocked, or was held, draws its card in Backlog with that
  reason on it rather than not drawing at all. Dragging it to To do overrides
  the reason, which is what makes the exclusions advice rather than a gate.
  Ticking a task off the board moves its card to Plans' Done, whatever state
  the plan was in, since the task being finished ends the plan about it.

  **Every card is a plan card in every column**, including one with nothing
  written yet. `queueRowNode()` already renders through `PlanCard` with "no
  plan yet" as its eyebrow, so what is left is the object underneath: a queue
  card is keyed `queued:<title>` with no file, which is why clicking it does
  nothing and why the three plans-only columns refuse it. The night still
  writes the plan — nothing mints an empty file on the drop — so the card has
  to be able to stand for a task with no document behind it everywhere on the
  view.

  **What each column does with a card let go on it**, which is the sequence
  requirement 3 asked for:

  1. **Backlog** takes any card, from any column, and holds it. A card with a
     plan is parked; a card without one leaves tonight's queue. It gives cards
     to To do and nowhere else.
  2. **To do** takes a card back from Backlog, which queues it for tonight at
     the rank it lands on, and takes a plan from Waiting for review, Ready to
     be produced or Done, which sends it round to be written again. Dragging
     within the column edits the rank.
  3. **Doing** takes no drops. The agent is writing; dashed edge.
  4. **Waiting for review** takes no drops. The agent's own column; dashed
     edge.
  5. **Ready to be produced** takes a plan and accepts it. Its refusal changes
     with the first decision above: today it turns away a card because it is a
     task (`d.kind === 'plan'`), and once every card is a plan the test is
     whether a plan has been written yet — so the toast becomes "that has no
     plan written yet", and the same goes for Producing's and Done's.
  6. **Producing** takes a plan from Ready to be produced, opens the session
     carrying it out, and gives no card back by hand.
  7. **Done** takes a plan from Ready to be produced or Producing.

  **What the modal offers, column by column.** Four of the seven change:

  - Backlog: Accept it, Move to To do, Turn it down.
  - To do: the task rather than a plan — title, bucket, column and its
    description off the board, plus a line saying it is queued for tonight —
    and one button, Move to backlog.
  - Doing: Turn it down, and nothing else. There is no plan yet to accept or
    send back.
  - Waiting for review: Accept it, Plan it again, Turn it down. Unchanged.
  - Ready to be produced: Plan it again, Turn it down, It is finished.
    Unchanged.
  - Producing: It is finished, Turn it down.
  - Done: Plan it again.

  The Hold button on a queue card becomes **Move to backlog**, since that is
  the move it makes and dragging to Backlog is the same instruction. What it
  writes does not change (`plans/queue-order.json`), only its label.

- ~~**On a phone the header and the filter strip take half the screen before any
  task, and both stay pinned while scrolling.**~~ **Done, 15 Sep 2026**, as
  written: `header, .bucketbar{position:static}` inside the existing phone
  breakpoint in `kanban/board.css`, no new markup. `syncHeaderHeight()` and
  `--header-h` are untouched — the offset they feed is inert once nothing is
  sticky, and both still do their job above 640px.

  One thing stays pinned, and it is the one added the same day: the column
  strip (`#colTabs`), which is four lines tall and says which of six columns is
  on screen. That is the question the header was holding half a screen to
  answer. Covered by `kanban/test_phone.mjs`, at both widths, since the whole
  point is the breakpoint.

- ~~**The plan modal has no way to talk a plan through before deciding on it,
  and accepting one carries no instructions at all.**~~ **Done, 18 Sep 2026.** A Chat button in every column that has a plan to talk about, opening the embedded chat seeded with nothing and wrapping his first message with the plan (`openPlanChat()`, `kanban/js/13-plans.js`). The engine grew `openNew(..., {preface})`, which is what keeps the window showing his sentence while Claude gets the document above it. The conversation lands as `feedback` on whichever button he presses, `stream.py`'s cut is 4000 rather than 500, both readers know what `feedback:` means on an accepted plan, and `stream.py` writes a History line that says when the quote came from a chat. `openPlanModal()`
  (`kanban/js/13-plans.js:239`) offers Accept it, Plan it again and Turn it
  down, and the only place he can say anything is the one-sentence textarea
  `replanPlan()` (`:367`) collects into `reason`, which `stream.py` (`:120`)
  cuts to 500 characters and writes as `feedback:`. `acceptPlan()` (`:294`)
  asks nothing, so whatever he wants the implementing agent to keep in mind
  has nowhere to go; `/do` and `implementing-agent.md` (`:51`) only ever read
  `feedback:`, which on an accepted plan is empty. The chat machinery is
  already on the board — `newChat()` (`kanban/js/10-reference-sections.js:1012`)
  seeds `chat.openNew()` from `taskDescription()` — but it is keyed to a task
  in the drawer, not to a plan, and nothing it says ever reaches a plan's
  frontmatter.

  It wants a Chat button in the plan modal that opens a session seeded with
  the plan's own text, and a way for what comes out of it to land on the plan
  as either a replan reason or build notes for acceptance.

  Decided, 15 Sep 2026: it is the same embedded chat modal the drawer's New
  chat opens, not a Terminal window. The box opens empty, and nothing starts
  until he sends. His first message goes out with two parts added in front of
  it: first "Here's a plan another session has been working on, including the
  goal we're trying to solve and what it suggested so far.", followed by the
  task, its summary, Findings and Proposed plan; then "Here's what the user has
  to say about that.", followed by what he typed. That differs from how
  `newChat()` works today, which drops `taskDescription()` into the input box
  unsent for him to see and edit. The `onSend` hook
  (`ChatController.send()` in `PACKAGES/ai_chat_engine/src/controller.ts`) is told what was sent but
  cannot change it, so wrapping the first message means a change in
  `ai_chat_engine`, which `ai_canvas` also loads.

  What happens after the chat was decided the same day. He talks for as long as
  he needs, usually briefly, then closes it and presses one of the modal's
  existing buttons, most likely Plan it again or Accept it. The conversation
  goes with whichever one he presses, as context for the agent that picks it up
  next, and the button needs no separate typed reason when a chat is attached.
  The conversation and the decision are both recorded in the plan's History.
  Today History belongs to the planning agent's runner and nothing else writes
  it (`agents/planning_agent/plan.py:629`, read back by `plan_meta()` in
  `kanban/server.py:962`), so the board, or `stream.py` on its behalf, becomes
  a second place that adds lines there, and `history_entry()` (`:929`) needs a
  way to show that a line has a conversation attached.

  Where it is stored was decided the same day: the conversation is `feedback`,
  a fuller version of the one-sentence reason, not a new key. The reason typed
  into `replanPlan()` today and a chat attached to either button are the same
  thing. So `stream.py`'s 500-character cut (`:120`) cannot apply to a chat,
  and `/do` (`~/.claude/skills/do/SKILL.md:51`) and `implementing-agent.md`
  (`:51`) have to stop reading every `feedback:` as "he sent this back". On an
  accepted plan it is what he wants kept in mind while building.

- ~~**The plan modal reads a plan as one long document, when it should split
  into a history column, a summary, and two tabs.**~~ **Done, 15 Sep 2026.**~~ **Done, 22 Sep 2026.** Stage 3: Done is a `### Done` heading first in every bucket, and both format files gather a ticked task under it on read.
  Built from the spec below rather than the frames, since Figma was not
  reachable that night. `plan_meta()` now splits each History line through
  `history_entry()` into a note and the send-back reason; `planSections()`
  and `planMainHTML()` in `13-plans.js` split the plan by heading, and
  `planHistoryItems()` draws the timeline. A plan with neither Findings nor
  Proposed plan still reads as one document. The column is a `div`, since the
  drawer's styles are written against every `aside`. Specs are in Figma
  (file `Cgocs5SMDGPSF5MzNan4Hu`, frames `61:9227` for the Findings tab and
  `61:9333` for Proposed plan). `openPlanModal()`
  (`kanban/js/13-plans.js:218`) hands the whole body to `openDocModal()`
  (`kanban/js/12-reports.js:575`), which drops it into `showModal()`'s wide
  sheet (`kanban/js/23-conflict-modal.js:19`, `.sheet.wide` at
  `kanban/board.css:2553`) as one `.repdoc`. The new sheet is 912px wide
  rather than 760, with the head and the three footer buttons unchanged.

  The body becomes two columns. On the left, a 198px History column on the
  `bg` token with a `lineSoft` right border, 14px padding, a HISTORY label
  with a count, and a timeline newest first: every revision and every send-back,
  each with its date and a one-line note, the send-back quoting his reason.
  History lines carry a date only, so the current revision alone shows a time,
  from `generated:`. The dot says what each one is: `accent` for the current
  revision, `red` for sent back, `inkFaint` for an older revision. The
  timeline is read-only, decided 14 Sep 2026: a replan overwrites the same
  file, so there is no older revision to open. On the right, 16px by 20px
  padding and a 14px gap: the Summary in its own `chip` box (radius 10,
  padding 12/14, a SUMMARY label, 14px text in `ink`), then a two-tab
  segmented control, Findings and Proposed plan, each with a count. The modal
  opens on Proposed plan, which shows the numbered steps and Needs you; Needs
  you stays in that tab rather than moving up beside the Summary. Findings
  shows the findings list. `Context` stays hidden through `PLAN_UNSHOWN`
  (`13-plans.js:381`), and `History` moves out of the body into the left
  column.

  It is Big because the modal needs the plan's sections as separate pieces
  rather than one `mdBlocks()` string, so `loadPlanBody()` has to split by
  heading, and because the timeline needs data that is not served yet.
  `plan_meta()` (`kanban/server.py:926`) returns `revisions` as a date and a
  number only, and `feedback` holds just the latest send-back reason, so each
  earlier send-back and its reason has to be parsed from the History section
  before the column can draw them.

- ~~**The bucket editor renames, colours, reorders and deletes buckets, and
  touches none of what actually makes an agent theirs — the brief.**~~
  **Done, 16 Sep 2026.** `GET /bucket-brief.json?bucket=` and
  `PUT /bucket-brief` (`kanban/server.py`) resolve the path through
  `planning_agent_plan.bucket_stream()`, so the board edits the file the
  agents actually read rather than one named off the heading; a Brief button
  on each row of `openBucketEditor()` opens `openBucketBrief()`
  (`kanban/js/08-buckets.js`), a wide sheet holding the raw Markdown, and
  Save and Cancel both draw the editor again. A bucket with no brief yet
  opens on the template read out of `BUCKETS.md` rather than an empty box,
  and the sheet says three things when each is true: the file does not exist,
  it still carries `<!-- NOT FILLED IN YET -->` so no agent is pointed at it,
  or the heading is mapped to nothing and this is the `general` catch-all
  every unmapped bucket shares. `kanban/test_bucket_brief.py` covers the
  routes with no browser and no board, `kanban/test_bucket_brief.mjs` the
  button and the sheet. Scaffolding a brief at the moment a bucket is
  *created* is still the entry below.

  The original entry:
  `openBucketEditor()` (`kanban/js/08-buckets.js:160`) wires up
  `renameBucket()`, `addBucket()`, `deleteBucket()`, `moveBucket()` and
  `setBucketColor()`, but `buckets/<stream>/<stream>.md` — the file
  `agents/planning_agent/planning-<stream>.md` and the implementing agent both
  read for what a bucket's work actually is — has no route in
  `kanban/server.py` at all, read or write; it exists only to someone who
  opens it outside the board. A modal here needs a `GET`/`PUT` pair scoped to
  the current bucket's own brief path, plus a button in `openBucketEditor()`'s
  per-bucket row to open it, and could lean on the same textarea-for-markdown
  pattern the drawer's own Description field already uses
  (`kanban/js/19-drawer.js:785`) rather than inventing a second editing
  surface. "Creating a list is one `prompt()` for a name, and a zero-dataset
  board is a state nothing renders" below writes a bucket's brief once, at
  creation — this is the same file reachable afterwards, which that entry
  doesn't cover either.

- ~~**Creating a list is one `prompt()` for a name, and a zero-dataset board is
  a state nothing renders.**~~ **Done, 18 Sep 2026.** A three-part wizard in `kanban/js/21-datasets.js` — name, buckets, then a line about each — and a welcome screen when `/datasets.json` comes back empty. The line he types opens that bucket's brief rather than boilerplate under the empty marker, which is the difference between a brief an agent is pointed at and one it is not. `createDataset()` (`kanban/js/21-datasets.js:63-71`)
  asks only for a name before reloading, and `current_dataset()`
  (`kanban/server.py:103-112`) returns `None` once `list_datasets()` comes back
  empty — nothing downstream handles that: every route past it resolves a path
  through `dataset_dir(name or current_dataset())`, which means
  `dataset_dir(None)` on a fresh install with `data/` empty. What's wanted is a
  wizard in place of the prompt, walking through name, buckets, and — for each
  bucket — a description of the kind of work it covers, which becomes the
  opening brief `agents/planning_agent/planning-<stream>.md` reads rather than
  the bare template in `BUCKETS.md` scaffolding alone would write. A welcome
  screen ahead of it, shown whenever `list_datasets()` is empty, leads into the
  same wizard rather than a bare board with nothing to switch into.

  Overlaps "Creating a list already works; what it produces is a shell nothing
  else on the board knows how to use" below: that entry gets the sequence
  right — ask for buckets, scaffold `buckets/<stream>/<stream>.md` and
  `buckets/README.md` — but stops at template scaffolding. This is the same
  plumbing carrying a UI, a multi-step wizard rather than one `prompt()`, plus
  the zero-dataset welcome screen neither entry names, and the bucket
  description he types becoming the brief's actual opening content rather than
  boilerplate.

- ~~**Plans should carry nothing but plan cards, and one of its six columns
  carries something else.**~~ **Done, 15 Sep 2026**, as the Small entry above
  about a sent-back plan looking different from the rows around it — the same
  seam from the other side, settled the same way. `queueRowNode()` is a
  `PlanCard` stub with the eyebrow "no plan yet", and every card on all six
  columns is that one card now. `PlansView.tsx`'s own header comment says so
  rather than saying two columns do not hold only plans.

- ~~**Switching from Board to Plans is a flat tab click, and he has a Figma
  prototype exploring it as one continuous vertical transition between two
  stacked surfaces instead, reached by a flip control rather than the tab
  strip.**~~ **Done, 18 Sep 2026.** A FAB, bottom right, on those two views only, flipping between them with the arriving view sliding in from the direction it lives in. `renderView()` is untouched: the animation is on the view that arrives, which is what lets every other tab carry on being drawn exactly as it was. `viewDefs()` (`kanban/js/11-chat-cards.js:398-412`) has `board`
  inside the `group:'draw'` dropdown with Matrix and Timeline and `plans` as a
  tab beside it, and the click handler `renderViewTabs()` wires up
  (`kanban/js/18-timeline.js:741-743`) just sets `state.view` and calls
  `renderView()` — an instant swap, no transition of any kind. His prototype
  (https://www.figma.com/proto/Cgocs5SMDGPSF5MzNan4Hu/Untitled?node-id=13-19555)
  treats Board and Plans as one tall canvas, one above the other, with a flip
  control — tried both bottom-left and bottom-right, as a FAB — panning
  between them rather than switching a tab. The tab strip is untouched: every
  tab stays where it is, Plans included, and the flip is a second route to
  the same two views rather than the only one. Nothing else in the header has
  to move for it, and a route that turns out not to be used costs a FAB.
  What `renderView()`'s all-or-nothing repaint becomes once two views can be
  visible mid-transition, and whether `state.view` still names one current
  view or something closer to a scroll position, are left to the build —
  both read better against something moving on screen than on paper.

- ~~**A meeting's `repeat:` tag already carries the time it starts, and
  nothing fires anything at that time.**~~ **Done, 14 Sep 2026.**
  `companion/digest.py`'s `build()` now collects `timed_meetings` alongside
  `overdue`/`today`: any task due today whose `read_repeat()` result carries a
  `time` and whose `todo.agenda_topics()` is non-empty, sorted by time and
  carried through `to_json()` as `{title, task, time}`. Both conditions this
  entry named — a time on the tag, and an agenda actually ready — gate it; a
  meeting with one but not the other stays silent here and leaves the calendar
  notification he already gets to say so.

  The Electron side holds no real per-task timer, on purpose — `maybeFireMeetings()`
  (`companion/src/main/index.ts`) checks the wall clock once a tick, the same
  way `maybeNotify()` already does for the morning briefing, since a real
  `setTimeout` armed at boot would miss a meeting whose time has already
  passed by the time the process starts or wakes from sleep. A minute is
  remembered fired in `state.meetingsFired` (`companion/src/main/state.ts`,
  `date::task` keys, capped the same way `dismissed` is) so a late tick
  catching up doesn't pop the same meeting twice. The popup is light — the
  title and "Agenda ready.", through the same `postNotification()` every other
  banner uses — and clicking it opens the board to the card, where
  `agenda_topics()`'s output renders in full.

  `companion/test_companion.py` gained `test_timed_meetings()`, three tasks
  due the same day — one with both a time and an agenda, one with a time and
  no agenda, one with an agenda and no time on the tag — asserting only the
  first is collected. Checked for real against the live list too:
  `python3 companion/digest.py --json` returns an empty `timed_meetings`
  array today, correctly, since nothing on it currently carries both.

- ~~**Plans' drag confirmations are inconsistent by kind.**~~ **Already true,
  15 Sep 2026 — the entry was stale when it was written.** `parkPlan()`
  (`kanban/js/13-plans.js`) is one `movePlan()` call with no sheet, and its own
  comment already records the decision: "No confirm sheet, decided 13 Sep
  2026". `doingDrop` and `reviewDrop` are wired nowhere and declared nowhere,
  which is what the entry wanted; `producedDrop` and `doneDrop` are as they
  were. Nothing to build.

  The second half of it — Plans carrying nothing but plan cards, which it
  called out of scope and said needed its own entry — is the entry above, and
  that one is done.

- ~~**The Plans view's dashed borders are five different signals, not one
  decoration to strip.**~~ **Done, 14 Sep 2026 — already built, and not
  struck through.** `git show 2f0fffb` — "Draw Backlog's held tasks as
  plan-card stubs, and lighten Plans' quiet-state colour" — is this entry's own
  fix, landed the same day the entry was written and never linked back to it.
  The dash is off all four card-level uses: `.repitem.actioned`,
  `.repitem.redo` and `.repitem.planitem.parked` (`kanban/board.css`) all keep
  their opacity with no `border-style` line left on any of them, and the held
  row is not a `.qitem` any more at all — `heldPlanCardNode()`
  (`kanban/js/13-plans.js`) draws it through the same `PlanCard` shell a parked
  plan gets, `variant: ' parked'`, so it inherits the same dimmed, undashed
  treatment rather than carrying a second rule of its own. Each of the four
  states already has its own word: `planWord()` gives `declined`, `replaced`,
  `finished` and `accepted` to the three `done` resolutions plus `accepted`
  itself, `parked` to a plan sitting in Backlog, and `heldPlanCardNode()` passes
  `word: 'held'` straight past `planWord()` for the held-task stub — the one
  case this entry named as possibly still missing it, and it was not.
  `.col.agentcol` is the one dash left in the app, exactly as `CLAUDE.md`
  already says it should be.

- ~~**A plan on its second or third revision looks exactly like a plan on its
  first, so there is no way to see whether sending one back achieved
  anything.**~~ **Done, 13 Sep 2026.** `plan_meta()` (`kanban/server.py`) now
  parses the file's own History section for its `- **DATE, revision N.**`
  lines and returns them as `revisions`, rather than adding a second count
  anywhere. The card shows how many there have been and when, through
  `planRevisionsLabel()` (`kanban/js/13-plans.js`) — nothing for a plan on its
  first pass, since "revision 1" is only worth saying once there's a second.
  `PLAN_UNSHOWN` drops only `Context` now, so the modal renders `History` as
  the previous revision's own line. A real diff between two revisions is still
  out of scope, since that needs both revisions findable as separate
  documents, which waits on the one-file-per-task rework below.

- **`implementing-agent` runs unattended on accepted plans, fenced the
  way `improve_agent` already is.** Reverses the decision recorded in the
  struck entry at the foot of this section, which settled on session-only
  runs on 13 Sep 2026. Of 41 plans written, only 5 are accepted and 2
  produced, because accepting one still costs a sitting that isn't happening
  — session-only is what stalls the loop, and the fence is what replaces
  "stop and ask" as the thing that makes it safe to hold write tools.

  Build the same fence `improve_agent` already runs under: a named project
  folder under `data/<dataset>/projects/` for the run's own output, a git
  branch for anything written outside it, no merge, no push, and no write to
  `todo.md` — already forbidden regardless. `run.sh`
  (`~/Code/improve_agent/README.md:8-11`) is the model to copy: build onto a
  branch, run the repo's tests, never restart a process, so a bad run costs a
  branch rather than the work. Figma is the one half with no equivalent — the
  plugin API has no branch-creation call — so a plan touching Figma can only
  run against a branch he has already created and opened in the desktop app
  himself, and that precondition needs checking at the start of the run
  rather than assumed.

- ~~**Opening an accepted plan offers no way to start, or return to, the
  session actually carrying it out.**~~ **Done, 14 Sep 2026 — both pieces,
  built the way the entry's own reasoning pointed rather than through
  `ai_canvas`.** `openPlanModal()` (`kanban/js/13-plans.js:278`) draws the
  same four buttons — It is finished, Plan it again, Turn it down, Leave it
  alone (`:291-299`) — whether a plan is fresh out of review or already
  `state: accepted`, and none of them touches a session. The only way to
  carry one out today is `/pa-do` (`agents/pa_agent/skills/pa-do/SKILL.md`),
  typed into a terminal session he is already sitting in, because
  `implementing-agent` "only ever runs from a session he is in"
  (`agents/implementing_agent/README.md:30`) and never unattended. The
  plumbing that exists points the opposite direction from what this asks
  for: a running session announces itself onto
  `data/<dataset>/attach-queue.json`
  (`agents/pa_agent/skills/pa-attach/scripts/attach_session.py`), the board
  drains that queue on load (`kanban/server.py:1765`) and reads it back
  through its own "Attach a session…" button
  (`kanban/js/10-reference-sections.js:954`) — the board learns which session
  claimed a card, it never causes one to open. The planning agent already
  files its own session the same way when it writes a plan
  (`queue_attach()`, `agents/planning_agent/plan.py:613`), which is why a
  plan's frontmatter already carries a `session:` field (`plan.py:589`) — but
  that is the planning session that wrote the plan, not an execution one, and
  nothing records which session picked up an accepted plan. Doing this for
  real is two pieces of new infrastructure rather than a button: something
  that can actually open a terminal Claude Code session from a browser click
  (`ai_canvas/`, the Electron app that already draws one card per live
  session on a canvas, is the closest existing thing to look at), and a
  `production_session:`-style field on the plan, written back onto it the
  same way `attach_session.py` already writes onto the queue, for the modal
  to read on the way back in.

  **Opening the session** is `open_terminal_session()`'s sibling
  `start_plan_session()` (`kanban/server.py`) — the same real Terminal.app
  window the "Talk about the list" entry above opens, rather than reaching
  for `ai_canvas`: that app draws sessions on a canvas, it does not start
  new ones, and building a second way to launch a terminal session would
  have meant two implementations of the one thing this needed. Seeded with
  `/do the plan for "<task>"`, in the repo's own root.

  **Returning to it** turned out not to need announcing itself onto a queue
  at all. `claude --session-id <uuid>` lets the caller choose the id up
  front rather than waiting to learn it, so the server generates one,
  passes it to the freshly opened window, and writes it straight onto the
  plan's own frontmatter as `production_session:` — before the session has
  said a word. `_set_plan_field()` is the same one-line-at-a-time
  frontmatter edit `stream.py`'s own `_set()` already uses, but reused as a
  plain, direct file write rather than through `stream_apply()`: this field
  answers a different question than `state`/`production` do (which session,
  not which stage), the plans stream's own contract knows nothing about it,
  and the implementing agent already writes `production_summary` the same
  direct way for the same reason. A second click, with the id already on
  file, opens `claude --resume <uuid>` instead of a fresh `/do` — the same
  window either way, just a different argument.

  `production` and `state` are untouched by any of this — those stay `do`'s
  own to set, through `stream.py --apply`, exactly as `agents/implementing_agent/skills/do/SKILL.md`
  already documents. `production_session` is tracking metadata about a
  session, not a step in that contract, which is also why it lives in
  `plan_meta()`'s output as its own field rather than folded into
  `production`.

  The button lives on the card itself rather than in the three-move modal —
  `PlanCard`'s existing `action` slot, the same one `heldPlanCardNode()`
  already uses for Release, reading "Start session" or "Return to session"
  off whether `production_session` is set. Not the modal, on purpose: the
  modal's three buttons are a deliberately closed set as of the "Four
  options" entry above ("four options read as four verdicts to weigh rather
  than three moves and an exit"), and this is neither a verdict nor an
  exit. Shown for every accepted plan except one already `production: done`
  — the session's job is finished by then, and its transcript is history
  rather than something to reopen. No confirm sheet, same reasoning as
  "Talk about the list": worst case is an extra window, not a spend, since
  the money is only spent once he actually talks to whatever the window
  opens.

  `kanban/test_plans.mjs` covers the button's two labels, that it is absent
  from a plan he has not accepted and from one already produced, and that
  pressing it posts `/plans/start-session` by the plan's own name with no
  confirm sheet in the way. The server-side branching — a fresh id and a
  frontmatter write on the first call, `--resume` with the same id on the
  second, a clean refusal for a name that doesn't resolve to a file — was
  checked by hand against a temp plan file with `_open_terminal()` swapped
  for a recorder, the same "spends real money/opens a real window, verified
  by hand" line every other agent-spawning path in this repo already draws.

  **The same verification gap as "Talk about the list": untested whether
  `do script` actually reaches Terminal on this machine**, for the same
  reason — every attempt from this sandboxed session timed out on the
  AppleEvent. Both buttons want a real click from the actual board.

- ~~**The four options on a plan's modal stop fitting once it has been
  accepted.**~~ **Done, 13 Sep 2026.** Three buttons now, and only three: the
  move forward, the move back, and the way out. Forward is still named after
  the column it lands in, Accept it from Waiting for review and It is finished
  from Ready to be produced. Back is always Plan it again, from every column,
  decided rather than derived: a plan in Ready to be produced stepped literally
  back into Waiting for review says nothing, while sending the task round to be
  written again tonight is the move he actually wants from there. Leave it
  alone is gone from the modal, because four options read as four verdicts to
  weigh rather than three moves and an exit. `parkPlan()`
  (`kanban/js/13-plans.js:347`) is untouched and still the Backlog drop
  handler, so parking is reachable by dragging a card onto the column, and
  `kanban/test_plans.mjs` exercises it there instead of through the button.

- ~~**Replanning a task writes a second plan file instead of replacing the
  first, so the same task can show two live cards on the Plans board at
  once.**~~ **Done, 14 Sep 2026.** One file per task, as the entry below
  proposed. `write_plan()` writes to `plan_filename(task)` — the task's own
  slug plus its id, flat under `plans_dir()` — every time, so a replan
  overwrites the same file rather than minting a new one; `history()` and
  `rejection()` needed no change, since both already read the *previous*
  file through `plan_path()`, which now just resolves flat rather than
  through a night folder. `plan_path()`, `plan_meta()` (`kanban/server.py`)
  and `stream.py`'s `apply()` all lost the `night` half of their addressing
  at the same time — an item is `{name}` now, not `{group, night}` — and
  `/stream/apply`'s payload in `kanban/js/13-plans.js` dropped `group`
  to match.

  `prune()` needed a real rule rather than a day-count, since a live task's
  plan is current regardless of age now: it deletes a plan only once its
  `about:` id is no longer on todo.md at all, past a `KEEP_DAYS` grace
  period, rather than aging out a whole night's folder. A night's own
  `index.md`/`run.json` still age out by date — `prune_nights()`, the one
  piece of the old `prune()` that was genuinely about a night rather than
  about a plan.

  `core/migrations/migrate-plans-one-file-per-task.py` moves what is already
  on disk: for each task, the file with the highest `revision:` is kept
  (its History section already carries every earlier one, since that is
  what `history()` always threaded forward) and renamed flat; every older
  revision of the same task, and anything sitting in the old `plans/actioned/`
  archive, is folded in and dropped once superseded. Proved against a fixture
  reproducing all three shapes — a task replanned across two nights, one
  planned once, one archived — dry-run and for real, second run finding
  nothing left to do. **Not yet run against the real datasets** — that is a
  real, one-way rewrite of `data/twinkl/plans/` and `data/personal/plans/`,
  worth running with him watching rather than as part of this change.

  `agents/planning_agent/test_planning_agent.py` gained `test_one_file_per_task`
  (a replan lands in the same file, History intact) and `test_prune` (a live
  task's plan survives any age, an orphan survives its grace period, an
  orphan past it does not); `test_server` and `test_folding` were rewritten
  for the flat layout rather than a temp night folder. All twelve suites in
  the repo pass, `kanban/test_save_guard.mjs` checked only against the single
  live server — it fails under two server processes sharing one `todo.md`,
  which is a fixture-of-convenience problem in the process this was verified
  with, not a regression.

  The original entry follows.

  **Replanning a task writes a second plan file instead of replacing the
  first, so the same task can show two live cards on the Plans board at
  once.** `write_plan()` (`agents/planning_agent/plan.py:524`) always mints a
  fresh path — `out = os.path.join(paths.night_dir(day), slugify(task.title)
  + ".md")` at `:606` — keyed by the night, not the task. The nightly batch
  loop (`:948-1017`) points the ledger's `file`/`night` fields at that new
  file so `pick.is_stale()` (`agents/planning_agent/pick.py:265`) stops
  offering the task up again, but it never touches the plan file the ledger
  used to point at: that file's own `state:` frontmatter is left exactly as
  it was, and `/plans.json` (`kanban/server.py:1705`) lists every file under
  `data/<dataset>/plans/`, not just the one the ledger currently points at.
  Two failure paths land the same way. A task replanned because its
  fingerprint changed while an earlier plan still sat unread in `review`
  leaves both files at `state: review`, drawing two cards in Waiting for
  review for one task. A task sent back with "Plan it again"
  (`replanPlan()`, `kanban/js/13-plans.js:390`, which rewrites that plan's own
  frontmatter to `state: ready / owner: planning-agent`) gets a fresh
  `review` file the next night, but the `ready` file is never resolved —
  if the new plan is later accepted and finished, the old `ready` file is
  still sitting in To do, pointing at a task that is already Done.
  `agents/planning_agent/README.md:138` already documents the intended
  shape — a later plan should leave the earlier one `done / resolution:
  superseded` — but no code path writes that; the only thing that ever sets
  `resolution: superseded` today is a manual board action, not the nightly
  run.

  Genuinely one file per task rather than one per night is the fix, built in
  one piece rather than patched short-term first: `prune()` (`plan.py:777`)
  walks `data/<dataset>/plans/<night>/` folders and deletes whole nights past
  `KEEP_DAYS` unless a file's status matches `KEEP_STATUS`, so a plan no
  longer filed by night needs its own place to live and its own rule for how
  long a finished one is kept. `history()` (`plan.py:259`) and `rejection()`
  (`:289`) both read the *previous* file to build the new one's History
  section and carry forward a rejection's reason — with only ever one file
  per task, that becomes an in-place rewrite that keeps its own History
  section, rather than a chain of files each holding one revision.

- ~~**Every column on the Plans view is ordered one way — the priority of the
  task the plan is about — and there is no control to ask for another.**~~
  **Done, 13 Sep 2026.** Each of the four plan-only columns now carries a
  `sort` prop, built by `plansSortBtn()` in `kanban/js/13-plans.js`, toggling
  between priority (the default) and date written — `byNightWritten()` beside
  `byTaskPriority()`, chosen per column by `orderPlans()`. Keyed by
  `PLANS_SORT_KEY`, its own `localStorage` key rather than the board's
  `state.sort`, exactly as this entry called for. `kanban/test_plans.mjs`
  covers the toggle on Waiting for review; all 130 existing checks pass
  unchanged, since priority stays the default.

  Below is what the entry originally argued, kept for the reasoning:

  `byTaskPriority()` (`kanban/js/13-plans.js:541`) runs unconditionally inside
  `renderPlanReview()` (`:644`), `renderPlanDoing()` (`:669`),
  `renderPlanProduced()` (`:697`) and `renderPlanDone()` (`:735`), so a column
  holding three weeks of plans reads in score order and the one written last
  night sits wherever its task happens to rank. Half the wiring exists already:
  `colHTML()` takes a `sort` slot in the head (`kanban/js/09-columns.js:387`)
  that only the board fills, the button itself is built by the caller in
  `renderBoard()` (`kanban/js/18-timeline.js:981`), and the state behind it is
  `sortMode()`/`setSortMode()` (`kanban/js/03-tier-one-impact-effort.js:22-25`).

  Two things stop it being a slot to fill. `state.sort` is keyed by bare column
  name under a single `SORT_KEY = 'todo-board-sort'`, and four of Plans' six
  names — Backlog, To do, Waiting for review, Done — are the board's names too,
  so a sort set on one view would flip the other unless Plans carries a key of
  its own; `PROJECT_SORT_KEY` (`kanban/js/26-projects.js:25`) is the precedent
  for that. And the board's button toggles between priority and his own file
  order, which Plans has no equivalent of — a folder of plan files carries no
  hand order — so the second order is date written (`p.night`, read by
  `planGeneratedLabel()` at `:167`) rather than bucket or state: the natural
  complement to priority order, answering "what landed last night" where
  priority answers "what matters most", and the field is already on every
  plan. Nothing here reaches disk, so `kanban/test_plans.mjs`'s assertion that
  the view posts only `/stream/apply` and `/queue/order` still holds.

- ~~**The two agents are named on different axes: one says when it runs, the
  other says what it does.**~~ **Done, 12 Sep 2026.** `night_agent` is
  `planning_agent` and `execution_agent` is `implementing_agent`, and the six
  planners went with them — `plan-<stream>.md` is `planning-<stream>.md`, so
  every definition under the planning agent carries the family name. Both open
  calls were settled the same way, which is that the new name goes everywhere:
  the dashboard `id` changed from `night-agent` to `planning-agent` rather than
  being kept as a stable key, and the launchd job was unloaded, relabelled
  `com.tiagopedras.todos-planning-agent` and loaded again.

  What the rename reached, beyond a find-and-replace over 57 files in here and
  15 more across `agents-dashboard`, `improve_agent`, `SKILLS.md` and
  `~/Code/CLAUDE.md`:

  - **The data.** `core/migrations/migrate-agent-names.py` rewrote 65 `owner:`
    and `agent:` lines across 44 plans, runs and `ledger.json`. Nothing depends
    on it having been run: both manifests now carry an `owner_legacy` map
    beside the `legacy` block that already does this for the five status words,
    and `owner_now()` (`kanban/server.py:858`) resolves an old spelling on the
    way out of `plan_meta()` and `run_meta()`. A plan restored from a backup
    taken before today still draws in the column it belongs in.
  - **The files on disk that carried the name.** The lock
    (`data/.planning-agent.lock`), the schedule the dashboard writes
    (`data/planning-agent-schedule.json`), the readable log
    (`plans/planning-agent.log`) and launchd's two
    (`data/planning-agent.{out,err}.log`), all moved rather than recreated, so
    no night's history was dropped.
  - **The shared package.** `PACKAGES/work_streams/fixtures/generate.mjs` reads
    the plans manifest by absolute path and its fixture embeds a copy, so the
    fixture was regenerated and both `work_streams` suites re-run.
  - **The symlinks.** Seven in `.claude/agents/`, one per definition, plus the
    launchd one in `~/Library/LaunchAgents/`.

  Two things were deliberately left. `data/twinkl/todo.md` names both agents in
  four places and the `pa` skill is the only thing that writes it, so those are
  his to change. And the prose reflow: "night" became "planning" and "execution"
  became "implementing" inside wrapped paragraphs all over the repo, so a few
  hundred comment and Markdown lines now run a word past the margin.
- ~~**The implementing agent cannot delegate a lookup, so every expensive read happens
  in the context that is also doing the writing.**~~ **Done, 13 Sep 2026.**
  `implementing-agent` now holds `Agent(ds-analyst)` alongside its write tools
  (`agents/implementing_agent/implementing-agent.md:4`), with a "Delegating a
  lookup" section saying it is the only agent it may call, and why not
  `ds-parity` or `ds-component-docs` beside it. First drafted unattended by
  `improve_agent` on a branch that predated the runs→plans fold, so most of
  that branch's diff reverted since-landed work; only the tool grant and the
  new section were re-applied to current `main` by hand.

  Below is what the entry originally argued, kept for the reasoning:

  `implementing-agent` held
  `tools: Read, Grep, Glob, Write, Edit, WebFetch, WebSearch`
  and no Agent tool, so a run that needs a number out of a design system
  snapshot read the whole capture itself. Read-only consultants for exactly
  that shape already exist outside this repo — `ds-analyst` is granted
  `Bash, Read, Grep, Glob` and answers a question about a snapshot without
  writing anything — and the implementing agent had no way to reach one.

  This is not the per-bucket proposal settled on 6 Sep 2026 and recorded above
  as "One implementing agent, `implementing-agent`, not one per bucket"
  (`IMPROVEMENTS.md:1471`). That was declined because six agents with write
  tools is six copies of one set of guard rails, and a consultant has no write
  tools to copy. The evidence is on disk: the six planners in `.claude/agents/`
  are all `tools: Read, Grep, Glob, WebFetch, WebSearch`, so specialisation was
  never the objection — writing was. Per-bucket knowledge stays in the brief
  files, which this does not touch.

  It earns its place only where a question has a large read cost and a small
  answer. Most runs write prose into a project folder against a plan the agent
  already holds, and a consultant there starts cold and re-derives context to
  answer something the agent could read itself. The thing to weigh before
  building it is that granting the Agent tool widens the one definition
  deliberately kept narrow, and what contains that is a fixed list of named
  read-only consultants rather than an open grant.

- ~~**Plans and Execution are two boards holding one pipeline, and the seam
  between them is a second manual gate on work he has already approved.**~~
  **Done, 13 Sep 2026.** One board. The Execution view, `kanban/js/27-execution.js`,
  `kanban/test_execution.mjs`, the runs stream and its server plumbing are all
  gone, and `agents/implementing_agent/` is the agent definition and its brief
  with no stream of its own.

  **Six columns rather than eight**, which the entry below left open and which
  he settled: the implementing agent only ever runs from a session he is sitting
  in, so there is never a card to watch move on its own, and six extra tracks
  would be spent drawing a state nobody watches. The stage rides on the card
  instead, as `production: none | doing | review | done` on the accepted plan,
  marked by `.planprod` in `kanban/board.css`. **If that agent ever becomes
  autonomous, the eight-column version is the one to build** — he said so
  directly, and `production` is already the right shape to be drawn as columns.

  A second field rather than more states because the contract allows one
  `state:` per document, and this answers a different question about the same
  one: `state` says where the plan is, `production` says what has happened to
  the work it describes.

  The data moved as the entry said: `core/migrations/migrate-fold-runs-into-plans.py`
  folded the three review-state reports (84, 48 and 104 lines) onto their plans
  under a `## What the implementing agent did` heading, closed the two `done`
  ones, and recorded the two empty stubs as `production: none`.
  `data/twinkl/runs.before-fold/` holds the originals.

  Two things had to change that the entry did not name. `accepted` could only be
  owned by the implementing agent, which was right while what happened next was
  a run on another board and wrong the moment the same card came back to him —
  so `OWNERS` in `agents/planning_agent/stream.py` takes `me` there too, and
  `test_planning_agent.py`'s "refuses accepted owned by him" became its
  opposite. And `pa-do` and `implementing-agent.md` both told the agent to move
  its own card, which it has never been able to do: it holds no Bash tool, so it
  cannot run the writer. The driving session writes both transitions now, which
  is what the entry below already decided and what "the board asks; the stream
  writes" says everywhere else.

  The original entry follows, kept because it is the reasoning the fold was
  built from.

  **Plans and Execution are two boards holding one pipeline, and the seam
  between them is a second manual gate on work he has already approved.**
  Accepting a plan writes `state: accepted` on the plan document, and `sync()`
  (`agents/implementing_agent/stream.py:238`) mints a second document into
  `data/<dataset>/runs/` that lands in Execution's Backlog, where nothing
  happens until he drags it to To do. On 12 Sep 2026 six plans stood accepted,
  all six had runs minted, and two were still sitting in Backlog untouched —
  the gate filters nothing, it is a step he has to remember. He wants the
  accepted plans to be the queue themselves, with Done as the final stage of
  whatever gets produced.

  The reason on record for two documents is `PACKAGES/work_streams/CONTRACT.md`,
  which allows one `state:` per file. That is an argument for one document with
  a longer column set, not for two boards: Plans already draws six columns
  through `colHTML()` (`kanban/js/09-columns.js:368`), with `planColumn()`
  (`kanban/js/13-plans.js:125`) mapping states onto them, and
  `Ready to be produced` is already the handover point both stream manifests
  name. Folding Execution in means `renderPlansView()`
  (`kanban/js/13-plans.js:1472`) growing the execution half onto the same cards,
  `runColumn()` and `renderExecutionView()` (`kanban/js/27-execution.js:36`,
  `:255`) going with the view, and `agents/implementing_agent/stream.json` either
  retiring or shrinking to the agent definition alone.

  Decided, 13 Sep 2026: fold the boards. The three review-state run documents
  carrying the implementing agent's full written reports move onto their plan;
  the two `done` runs and the two empty backlog stubs are dropped rather than
  migrated, since a completed state and an empty stub carry nothing a folded
  board needs to keep separately. What replaces the gate is nothing new — the
  overnight entry below still holds, so the implementing agent runs only from a
  session he is sitting in, and that is what stops six accepted plans running
  at once regardless of whether they sit in a queue or a separate column.

- ~~**A finished run and a dead one are the same document, because the acting
  agent cannot move its own card.**~~ **Done, 13 Sep 2026**, by the fold above
  rather than on its own terms. There are no run documents any more, so the
  state that read as "died mid-work" cannot occur; and the decision recorded
  here — that the driving session performs both transitions — is what `pa-do`
  now does, writing `production: doing` on handover and `production: review`
  when the report lands. `implementing-agent.md` no longer tells the agent to
  move its own card, which it could never do: it holds no Bash tool, so it
  cannot run the writer.

  The original entry follows.

  **A finished run and a dead one are the same document, because the acting
  agent cannot move its own card.** `implementing-agent` is defined with `tools:
  Read, Grep, Glob, Write, Edit, WebFetch, WebSearch` and no Bash
  (`.claude/agents/implementing-agent.md:4`), and the runs stream's writer is a
  subprocess — `agents/implementing_agent/stream.json` names `python3 stream.py
  --apply`, and `CONTRACT.md` allows exactly one writer per stream. So the
  agent has no way to run it. `pa-do` nevertheless says the transition is the
  agent's to make: "The agent asks the stream to set it, through
  `agents/implementing_agent/stream.py --apply`"
  (`agents/pa_agent/skills/pa-do/SKILL.md:88`), and then tells the driving
  session not to do it instead — "say so rather than setting it yourself: a run
  still owned by `implementing-agent` means the work did not finish". Both halves
  cannot be true. The only party instructed to move the run is the only party
  that cannot, and the reading the skill gives the resulting state is the
  opposite of what it means: every completed run looks like a session that died
  mid-work.

  Confirmed on disk 12 Sep 2026 — three runs handed over and reported on in
  full, all three sitting in `ready / implementing-agent`, indistinguishable from
  abandoned. The reports are in the run documents and are real work.

  Decided, 13 Sep 2026: the driving session performs both transitions —
  `doing` on handover, `review` on the report landing — which is what "the
  board asks; the stream writes" already says everywhere else, and which
  makes `pa-do:88` and its own next paragraph agree. `implementing-agent`
  keeps its current tool list; no Bash, no queue-file writer.

- ~~**Nothing moves a run to `doing`, so the Execution view cannot show one in
  flight.**~~ **Done, 13 Sep 2026.** `runColumn()` (`kanban/js/27-execution.js`)
  stopped folding `doing` into `ready`, and the view now draws five columns —
  Backlog, To do, Doing, Waiting for review, Done — matching the five states
  `agents/implementing_agent/stream.json` declares. Doing takes no drop, on
  the same reasoning `renderPlanDoing()` already carries for Plans' own Doing
  column: which run is running is not his to choose. `kanban/test_execution.mjs`
  covers both the column order and the no-drop guard.

  This is still only the smaller half. The entry above (finished vs dead —
  who is allowed to write `doing` and `review` in the first place) is
  unresolved, so no run will actually reach this column until that is
  decided; the column is built so it is ready the moment something does.

- ~~**A plan he does not want has nowhere to go but back to the planning
  agent.**~~ **Done, 13 Sep 2026**, as the entry decided: a `declined`
  resolution rather than an eighth state, drawn in Done beside completed and
  replaced. `planWord()` gives it its own word, `planColumn()` branches on it
  **above** the fallback so a declined plan written before the branch existed
  cannot read as accepted, and `planClass()` draws it folded like the other
  closed states. The modal has a fourth button, `declinePlan()`, which collects
  the reason the redo path already collects — the server refuses a decline
  without one, for the same purpose: the reason is all that is left of the idea.

  One thing the entry did not name. `is_stale()` in
  `agents/planning_agent/pick.py` would have reported a declined plan as "plan
  accepted on <date>", which is the opposite of true, so it has its own branch
  saying "turned down on <date>". Not stale either way — planning it again is
  exactly what declining exists to prevent.

  The original entry follows, kept because it is the reasoning this was built
  from.

  **A plan he does not want has nowhere to go but back to the planning agent.**
  `openPlanModal()` (`kanban/js/13-plans.js:236`) offers three moves — Accept
  it, Plan it again, Leave it alone — and every one of them keeps the task
  alive: `replanPlan()` (`:315`) sends it to `ready / planning-agent` to be
  written again, `parkPlan()` (`:344`) drops it into Backlog where the picker
  can still reach the task, and there is no way to say the idea itself is
  turned down. So a plan he has read and rejected outright either sits in
  Backlog looking undecided or goes round again for a second opinion he never
  wanted. It wants a fourth button in the modal, carrying the same reason the
  redo path already collects into `feedback`.

  Decided, 13 Sep 2026. It is a resolution rather than a state: `done` closes
  an item with `resolution` saying how, this stream already writes two —
  `completed` from `finishPlan()` (`:299`) and `superseded` from a replaced
  rejection — and a third, `declined`, is the cheaper answer and the one the
  contract's own test for an eighth state points at. It draws inside the Done
  column rather than a column of its own — a declined plan should read as its
  own word and colour next to completed and superseded, not sit somewhere
  separate from them.

  `planColumn()` (`:125`) needs a branch for the new resolution **above** the
  fallback on `:145`, which currently returns Ready to be produced for any
  state it does not recognise — so a declined plan written before that branch
  exists would draw as accepted. `planWord()` (`:75`) and `planStripe()`
  (`:108`) need the word and the colour, the same two functions that already
  tell `completed` and `superseded` apart. The implementing agent needs
  nothing: `stream.py --sync` in `agents/implementing_agent/` mints runs from
  accepted plans only, so a declined one never reaches Execution.
  `kanban/test_plans.mjs` wants a case for the new resolution in the Done
  column and the new move in its blocked-writes list.

- ~~**Archiving finished work should run on its own rather than wait for a
  click.**~~ **Done, 13 Sep 2026**, as decided: `ARCHIVE_DAYS` is 60, the header
  chip stays hidden, and `autoArchiveTick()` does the work with no press. The
  doing half came out of `archiveOldDone()` into `performArchive()` so the modal
  and the timer share one copy of the order the steps have to happen in — the
  copy reaches `done-archive.md` before the tasks leave the document, so a
  failure between the two leaves the work in both files rather than in neither.

  It runs hourly rather than on the autosave tick, which is where the entry
  pointed: a task crosses the sixty-day line at midnight and not a second
  earlier, so the two-second tick would be two thousand answers to a question
  that changes once a day. Once a minute after load as well, since the common
  case is a tab opened in the morning and left all day.

  Four guards, all four covered by the new `kanban/test_archiving.mjs` (21
  checks) — locked, no document, dirty, and a modal open. This is the only
  thing in the board that rewrites `todo.md` without being asked, so those
  guards are the whole of what makes it safe; dropping the row fails four
  checks, and archiving before the copy lands fails four more.

  ~~Still open and named in the entry: `check_todo.py` has no archive reader, so a
  task that has aged out is invisible to the checker and to every `pa-*` skill
  that reads `todo.md` directly. That gap gets wider now that ageing out happens
  on its own.~~ **Done, 25 Sep 2026.** `check_todo.py` reuses `archive.read_archive()`
  (`core/archive.py`) rather than a second parser — that module already existed,
  built for the written-reports entry below and already used by
  `core/aggregate.py`, so `archived_slugs()` (`check_todo.py`) just reads it
  against `backups/done-archive.md` next to whichever `todo.md` was checked.
  `check_slugs()` takes the result and stops treating an archived task's
  `blocked-by:` target as dangling; it also flags, as a `CHECK`, a live slug
  that collides with one already sitting in the archive, since `blocked-by:`
  would then point at whichever one the script happens to see first. Tests in
  the new `agents/pa_agent/skills/pa/scripts/test_check_todo.py`, next to the
  script for the first time.

  The original entry follows.

  **Archiving finished work should run on its own rather than wait for a
  click.** `ARCHIVE_CHIP_HIDDEN` (`kanban/js/25-archiving.js:39`) takes the
  "Archive N finished" button out of the header on every view; `archivable()`
  (`:24`) and `archiveOldDone()` (`:70`) are untouched underneath it, and today
  the only caller either of them has is `$('#archiveBtn').onclick` (`:138`) —
  so even unhidden, nothing moves a task into `done-archive.md` unless he
  clicks the button. Decided, 13 Sep 2026: raise `ARCHIVE_DAYS` (`:15`) from 30
  to 60, unhide nothing, and instead call `archiveOldDone()` on its own —
  the same load-bearing point `autosaveTick()` already fires from — so a task
  done more than 60 days ago moves itself out with no click required. Nothing
  prunes `done-archive.md` itself, so it stays the one record that outlives
  the rolling backups, and the working file stops growing without him having
  to remember to tend it. `parseArchiveEntries()` (`kanban/js/12-reports.js:120`)
  and `completedRecently()` (`:165`) still exist to rejoin the two files for
  reports, and `check_todo.py`'s missing archive reader is a real remaining
  gap worth fixing alongside this — a task that has aged out is invisible to
  the checker as well as to every `pa-*` skill that reads `todo.md` directly.

- ~~**The board has no component layer, so the same column is written twice and
  every view redraws by replacing `innerHTML`.**~~ **Done, 14 Sep 2026** — both
  remaining pieces, the two this entry left open below. 13,972 lines across 28 classic
  scripts in `kanban/js/`, 463 top-level functions in one global scope, no
  `package.json` and no build step. The Board draws `.col`
  (`kanban/board.css:691-730`) from the single place that emits it,
  `kanban/js/18-timeline.js:987`; Plans and Execution draw
  `.listcard reportsview` plus one of four state classes, written out longhand
  in both `kanban/js/13-plans.js:1273` and `kanban/js/27-execution.js:252`. So
  the three boards the README calls one shape are one shape in the model and
  two in the CSS, and the dashed edge on Waiting for review exists twice, as
  `.col.aicol` and as `.agentcol`. The comment above `runItemHTML()`
  (`kanban/js/27-execution.js:58`) is honest about the rest of it: Plans and
  Execution share the markup rather than the function, which keeps one
  stylesheet answering for both and leaves two functions to keep in step.

  A port can be incremental because every view already owns `#lists` wholesale
  — `renderExecutionView()` (`:249`) and every sibling open by assigning to
  `$('#lists').innerHTML` — so a new renderer can mount into one view while the
  other nine carry on untouched, and the work can stop at any stage with a
  working board. Decided, 13 Sep 2026: React with Vite and TypeScript, which
  converges this with `ai_canvas` rather than Preact's no-build path. Both
  `run.command` and `To-Do Board.app` bundle nothing today, so this is a real
  cost: they need to run the build before starting the server, which they
  don't do now.

  Order, if it goes ahead: a round-trip fixture over a whole `todo.md` in both
  languages first, since `core/fixtures/` covers the grammar and not the
  document; then a real token set, and one column and one card primitive built
  on it, which pays off on its own; then the leaf views, `26-projects.js`
  (131 lines), `15-backups.js` and `16-backup-preview.js` (224), `17-matrix.js` (285),
  `27-execution.js` (292), `14-schedule.js` (348); then `13-plans.js` and
  `12-reports.js`; then the board, drawer and canvas last, 3,100 lines between
  `18-timeline.js`, `09-columns.js` and `19-drawer.js`; then the global `state`
  object in `02-state.js`, which today makes every mutation responsible for
  remembering which `renderX()` to call. `kanban/server.py` can be left where
  it is: 2,250 lines behind a 26-branch dispatch in `do_GET`/`do_POST` is ugly
  and not dangerous, and the suites drive it.

  The token set is its own piece of that and the one to do first, because every
  primitive above is written against it. `board.css:1-21` holds 31 semantic
  variables in `:root` and 25 of them again under
  `@media (prefers-color-scheme: dark)`, which is a good start and is missing
  three things. There are no primitives under the semantics: `--accent` is the
  literal `#2f6feb` rather than a step on a blue ramp, and the ten bucket
  colours `--b1` to `--b10` are twenty hand-picked hexes across the two themes
  with no ramp behind them and nothing saying they are a set. Six of the
  thirty-one are never redefined for dark at all — `--accent`, `--accent-ink`,
  `--agree`, `--agree-ink`, `--reject` and `--reject-ink` — so the light blue
  sits on the `#14161a` panel unchanged, which is a contrast bug the theme
  block looks like it already covers. And only colour is tokenised: the
  stylesheet carries 16 distinct literal `font-size` values, 12 distinct
  `border-radius` values and 88 distinct `padding` declarations, so every
  spacing and type decision is made at the point of use. What this wants is a
  two-layer set in the shape the design system already uses — primitives as
  ramps, semantics aliasing them per theme — covering colour, spacing, radius,
  type and the shadow scale, with the bucket colours generated off one ramp
  rather than picked. It is the piece most worth doing whether or not the port
  ever happens, and the piece that makes the port's primitives cheap.

  **The first two steps of that order are done, 13 Sep 2026**, on branch
  `port/component-layer`, and one of them turned out to be half-impossible.

  The round-trip fixture was mostly already built: `checkRoundTrip()` in
  `core/test_todo.mjs` round-trips all 226 lines of `kanban/demo.md` byte for
  byte, and `parse.json` already carried three whole-document cases both suites
  read. What was actually missing was the Python half, and the round trip cannot
  be built there at all — `todo.py` has no serialiser and `test_todo.mjs`'s own
  header says it never will. So the honest version of this step is that Python
  asserts the structure while JavaScript asserts the bytes, and what landed is
  `demo.md` added to the shared `docs` table by reference rather than by copy: a
  document now carries either its own `text` or a `file` naming a real document
  in the repo. Python went from five tasks across three hand-written shapes to
  all 33 in `demo.md`.

  The token set landed as the two-layer shape this entry asked for — primitives
  as ramps, semantics aliasing them per theme — with every one of the 31
  semantics resolving to the value it already had, bar six. Those six are the
  contrast bug named below, now fixed: `--accent` measured **3.61:1** on the
  dark panel against a 4.5:1 floor, and it is used as `color:` 22 times and as a
  border 9 more; `--agree` and `--reject` were 3.09 and 3.11. The dark theme now
  reads a lighter step from each ramp, and all three clear AA along with their
  `-ink` pairs.

  Two things were deliberately left, both because they change how the board
  looks rather than how it is built. The radius, spacing and type scales are
  defined and nothing reads them — 4/5/6/7/8px split 69 radius declarations and
  11 through 13.5px split 162 font-size ones, so collapsing them onto the scales
  is a small change everywhere and belongs with the view rewrites rather than a
  blind find-and-replace. And the ten bucket colours are named as a set but
  still hand-picked, since generating them off one ramp repaints every bucket on
  his board.

  **The scaffolding and the first view are done too, same day.** React 18 with
  Vite 5 and TypeScript, built to `kanban/dist/board-ui.js` as an IIFE hanging
  one global, `BoardUI`, loaded as an ordinary classic script so it joins the
  28-file source order rather than being deferred past it. `run.command` builds
  before it starts the server — decided against committing `dist/` and against
  having the server rebuild on stale, so the build is never the thing that is
  out of date — and `To-Do Board.app` execs `run.command`, so one place knows
  about it. `Column` and `Card` came first and are written to be the markup
  `colHTML()` and `cardShellHTML()` already emit; `kanban/ui/test_primitives.mjs`
  renders 37 cases both ways and fails on any difference, with no browser and no
  server.

  Projects is the first view off the string builders, and its 44 existing checks
  passed through unchanged, which is the evidence that the markup did not move.
  Two rules came out of it, both now in `CLAUDE.md`: a React view owns a node it
  created rather than `#lists`, because the unported views still assign to
  `#lists.innerHTML` and would tear the DOM out from under a live root; and the
  orchestration stays in `kanban/js/`, with the component taking the fetch's
  answers, `cvWhen` and `mdInline` as props.

  One thing worth knowing before the next build: Vite substitutes `NODE_ENV` for
  an application build and **not** in lib mode, so the first bundle carried
  React's development build and ten live references to `process` — 474kB that
  would have thrown on load. The `define` in `vite.config.ts` is the fix and the
  suite greps the built file so it cannot come back.

  **Backups went second**, once `kanban/test_backups.mjs` existed to judge it
  by — 36 checks, all passing unchanged across the port. Its four formatters
  stayed in `kanban/js/` and came down as props, because one of them,
  `backupWhen`, is Plans' as well, and moving the set would either split it or
  drag a shared helper into one view.

  **Reports went third**, 13 Sep 2026, after `kanban/test_reports.mjs` was
  written for it. One thing did not move and the reason is worth keeping: the
  lead note, the three counted reports and a written report's summary are still
  handed to the component as HTML, because `mdBlocks()`, `mdInline()` and the
  three report builders are shared with the drawer and with Plans. Porting them
  means porting those views in the same change, so they go through
  `dangerouslySetInnerHTML` until their own views are done — the same bargain
  ProjectsView already makes for a project's blurb.

  Splicing that view out left three superseded definitions behind — an old
  `renderWrittenReports`, an old `reportWindowSegHTML`, and an old
  `renderCountedReports` that wrote `innerHTML` into the two nodes React now
  owns. The last one is the one that mattered: a duplicate function declaration
  later in a classic script **wins**, so the dead copy was the live one and the
  suite passed against it by luck. Worth knowing for the ports still to come —
  after splicing a renderer out, grep the file for a second definition of every
  name you replaced.

  **And there the leaf views run out, which the order above gets wrong.** It
  lists `17-matrix.js` (293 lines) and `14-schedule.js` (348) among the views to
  port early, on their size. Size is not what decides it: only Projects,
  Backups and Execution are dispatched as views that own `#lists`. The Matrix is
  not a view at all — `matrixSection()` is called *inside* `renderView()` in
  `18-timeline.js`, which builds Overview and the Timeline in the same string,
  so porting it means porting that composition. Schedule is the same story one
  file over: `renderSched()` is a card drawn by `renderPlansView()` in
  `13-plans.js`. Both of those files are in the *last* tranche this entry sets
  out, so the order as written asks for the last tranche in the middle of the
  first.

  The two standalone leaf views are done and Execution is being folded away, so
  there is no third. What comes next is a real choice rather than a continuation
  — `13-plans.js` and `12-reports.js` as the entry's next tranche, or the
  `refSection()`/`colHTML()` composition in `18-timeline.js` that Matrix,
  Overview and the Timeline all hang off — and it wants deciding rather than
  drifting into.

  **Decided and begun, 13 Sep 2026: Plans, and its shell first.** `PlansView`
  draws the six columns and nothing inside them. The bodies still arrive as
  HTML from the sixteen `innerHTML` assignments in `13-plans.js`, which is a
  narrower bargain than the one ReportsView makes and is written into the
  component's own header rather than left to be discovered: four independent
  fetches fill those columns at different times and each paints as it arrives,
  so the shell is mounted once per visit and never re-rendered. Half-ported and
  re-rendering is the one arrangement that would silently drop a column, so the
  next step on this view is all sixteen at once, not some of them.

  Two things came out of doing it. `mountSync()` is new beside `mount()` —
  React 18 renders when it gets round to it, and Plans reaches into the nodes
  it just mounted, so the shell has to have happened by the time the call
  returns; `flushSync` is React saying this is not how it wants to be used, and
  it is right, which is why the only caller is this one and the fix is the same
  port finishing. And Plans gets a `#plansRoot` of its own, the same rule
  Projects already set.

  The evidence is `kanban/test_plans.mjs` passing all 123 checks unchanged,
  including the ten it makes about what the view is allowed to write.

  **And then all sixteen, the same day.** The paragraph above said the next
  step was all of them at once or none, and it was: `plansProps` is one object
  holding every body on the view, `paintPlans()` is the one place that renders
  it, and nothing assigns into the tree by id any more — including
  `renderStatus()` in `14-schedule.js`, which used to reach across from another
  file and hands its markup to `setPlansStatus()` now.

  What split the work was card kind rather than column. `PlanCard` is
  `planItemHTML()`'s twin and that builder is deleted, so the four columns
  holding nothing but plans are components; Backlog and To do hold queue rows,
  which go through `Card` directly. Two small things came with it and both are
  general. `Card` grew an `attrs` prop, because a card the board wires against
  carries `draggable` and its data attributes, and a pre-spelled attribute
  string would be a hole rather than a shape. And its rows take either nodes or
  `{__html}`, on the row's own div, because two of them are the board's own
  output — the task's score chips and a summary through `mdInline()` — and
  wrapping either in a span to carry it would put an element in the markup
  `cardShellHTML()` does not emit.

  One bug this found rather than introduced: the two plans-only columns refused
  a task by wrapping the drop handlers `wireColumnDrop()` had just assigned.
  That worked while every render built fresh nodes. React reuses them, so the
  wrapper would have wrapped the last paint's wrapper and the nesting would
  never have stopped — `wireColumnDrop()` takes the refusal as an argument now
  and assigns once.

  `planItemHTML()` going means `test_primitives.mjs` has nothing left to
  compare `PlanCard` against, so its three new cases render the card against
  `cardShellHTML()` given the rows a plan carries, written out longhand. That
  is the pattern for every builder that gets replaced outright rather than
  paired: pin the shape, not a second implementation. 37 cases now, and all 123
  in `test_plans.mjs` still pass.

  **And then the wiring, 13 Sep 2026, which finished the view.** The paragraph
  above named the change — `PlanCard` taking `onOpen` and `onDragStart` as
  props — and it was the smaller half of it. `wirePlansView()` ran after every
  paint and found *seven* kinds of node by selector, not three: the plan card's
  three, the queue row's Hold and its reorder handlers, the held row's Release
  and its drag, and `wireColumnDrop()` on four column bodies. All of them were
  the reason for the flush, so all of them had to go, and `mountSync()` is
  deleted rather than merely unused. Six functions went with it —
  `wirePlansView`, `wirePlanColumn`, `wirePlanDrags`, `wireColumnDrop`,
  `wireQueue`, `wireTodoColumn` and `wireBacklogColumn`.

  Where each handler went is decided by what it acts on. A plan card's three
  are built in `planCardNode()`, closed over the plan, so nothing is read back
  off the DOM. A queue row's are `queueRowDragProps()`, which both row kinds
  share — a held card passes no list and so drags without reordering, which is
  exactly what it could already do and is now said rather than implied.
  `wireColumnDrop(el, …)` became `columnDropProps(…)`, returning the three
  handlers for `PlansView` to spread onto the column's own body; the element is
  `e.currentTarget` rather than a captured `el`, which is the same element by
  another name.

  **One thing is still found by selector and it is the right answer, not a
  leftover.** The two filter dropdowns are built by `colFilterHTML()` as a
  string and handed to the browser through `dangerouslySetInnerHTML`, so React
  never owns those buttons and cannot be given a handler for them. They are
  wired by a single delegated listener on `document`, which reads the
  wrapper's own `data-colfilter` to know which column a press came from. That
  is what the *closing* half of the same dropdown already did in
  `09-columns.js`, and for the same reason. A delegated listener costs no
  flush, because it queries nothing after a paint.

  Two things the change broke that the flush had been hiding, and both are the
  general lesson. Three renderers guarded themselves with `$('#queueOut')` or
  `$('#queueDoingCard')` — "is Plans still on screen" asked of a node React
  draws, which is only a safe question while the mount is flushed. They ask
  `plansShowing()` now, which asks about `#plansRoot`: the board makes that one
  itself, in `plansMountPoint()`, so it is there the moment `paintPlans()`
  returns. And `test_plans.mjs` had a check that rendered and read in one
  `evalJS`, which passed on luck; it is three steps now, and the suite has a
  `painted()` helper that every render step returns. **Any suite driving a
  ported view has to wait for a paint** — that is the cost of the flush going,
  and it is a cost in the tests rather than in the board.

  130 checks now, up from 123. Four are new and one of them covers something
  that was never covered: Release, the button half of dragging a held card back
  into the queue, which mutation-testing showed could be gutted without failing
  anything. The other three replace the two assertions that read
  `data-plan-goto` off a button — the better question was always what the
  button *does*, and pressing it is the only way left to ask. Nine mutations
  were run over the new wiring and every one of them fails a check.

  Both of the remaining pieces are wanted, in either order: `12-reports.js`'s
  shared markdown functions (`mdBlocks()`, `mdInline()`, the report builders)
  becoming real components instead of `dangerouslySetInnerHTML` strings, and
  the `18-timeline.js` composition that Matrix, Overview and the Timeline
  hang off.

  **One piece did not depend on any of the above, and it is done, 13 Sep
  2026** — though most of it turned out to be done already, which this entry
  had not noticed.

  What it asked for was a check in the one place every writer passes through,
  on the grounds that the board guards a save with mtime and the conflict modal
  in the tab, and both real overwrites of the live list got past that. The
  server-side half had in fact landed in `f040164`, the work-streams commit,
  before this entry was written: `do_PUT` already demanded `If-Unmodified-Since`
  and answered 428 without one, 409 when the stamp had moved, and behind that
  sat the writer lock and the migration gate.

  What was genuinely missing is the difference between a stamp and a hash, and
  the code's own comment named it: `Last-Modified` carries one second, so two
  writes inside the same second are indistinguishable and the later document
  lands on a file it never read. Closed now. Every read of `todo.md` carries
  `X-Todo-Hash` — a truncated sha256, added in `end_headers()` so `GET` and the
  watcher's `HEAD` both get it — the tab holds it as `state.diskHash` beside
  the stamp, sends it back as `If-Match`, and `do_PUT` refuses a mismatch with
  the same 409 the conflict modal already answers. `watchTick()` prefers it too:
  "did the bytes change" is a better question than "did the second change", with
  the stamp kept as the fallback for a server from before this.

  `If-Match` is checked when offered rather than demanded the way the stamp is.
  The board always offers it, so a write without one is a tab from before this
  landed or a script, and the 428 already holds both.

  `kanban/test_save_guard.mjs` is the suite, 16 checks, and the thing to know
  before editing it is that every `PUT` in it is meant to be refused and is
  given the file's own current bytes as its body — so a regression that lets one
  through rewrites `todo.md` with what it already said. It needs no browser. The
  accepting half is deliberately not in it: proving a correct pair writes means a
  real write, which is `data/_test` and a throwaway, and that was run once by
  hand rather than left in a suite anyone might run against the live list.

  Whenever this is picked up it runs on its own branch off `main`, never
  directly on it, and it is a weekly-allowance-sized spend rather than an
  evening's.

  **Both remaining pieces are done, 14 Sep 2026.** `12-reports.js`'s three
  report builders — `completedByCategoryReport()`, `recentAccomplishmentsReport()`,
  `weeklyTrendReport()` — and `countedLeadHTML()` are gone; `kanban/ui/ReportsBlocks.tsx`
  is `CountedLead`, `CompletedByCategory`, `RecentAccomplishments` and
  `WeeklyTrend` now, and the four functions they replace, prefixed `build`
  rather than named for the HTML they used to return, compute the data those
  components draw from. `mdBlocks()` and `mdInline()` were not touched —
  nothing outside this file called the four that were, but both of those are
  still what the drawer and Plans render Markdown with, so a finished task's
  title still crosses as `{ __html: mdInline(t.title) }`, the same
  `PlanCard.summaryHTML` bargain. The weekly pace chart's SVG geometry — the
  coordinate math, the smoothed curve, the pace comparison — moved into the
  component itself rather than staying data the caller computes, since none of
  it reads `state.doc`. Clicking the trend key or the line/bars picker is a
  real `onClick` now rather than `data-trendkey`/`data-trendtype` for
  `#lists`'s delegated listener to find — both cases came out of
  `kanban/js/25-archiving.js`, which would otherwise have toggled the same
  click twice. `kanban/test_reports.mjs`'s 31 checks pass unchanged, which is
  the evidence the markup did not move; the trend key's own click was checked
  by hand, since the suite never exercised it.

  The `18-timeline.js` composition — Overview's five columns, Matrix's two,
  the Timeline's one — is `kanban/ui/SectionsView.tsx` now: `OverviewView`,
  `MatrixView` and `TimelineView`, each built on the same `Column` every other
  view in the app already draws through. `refSection()`, `splitGridCSS()` and
  the two track constants are gone with it. What still arrives as
  `{ __html }` is each section's own body — the cards in Big rocks, the
  matrix grid, the timeline's lanes — since porting those is a separate job
  from porting the shell around them, largely because a fair amount of what
  they do (the timeline's drag-to-reorder, the matrix dot's hover) is wired by
  `#lists`'s own delegated listener rather than by anything a component could
  take as a prop; delegation reaches a React-rendered subtree exactly as it
  reached a string one, so none of that needed touching. The eight titles and
  hints across the three views are hardcoded in the component now rather than
  built here, since none of them ever varies — a `` `week` `` or a `` `due:` ``
  in a hint is a real `<code>` rather than something `mdInline()` had to be
  asked to make one.

  Two things needed real DOM after the paint rather than a prop: Overview's
  `capMsgCards()` measures `.ref .msg`'s actual `scrollHeight`, and the
  Timeline's `wireTimelineDrag()` arms native `ondragstart`/`ondrop` on
  elements that have to exist first. Neither is fixable by becoming a prop the
  way Plans' three query-based handlers were, so `mountFlushed()` is back in
  `kanban/ui/index.ts` — not the general-purpose `mountSync()` that went with
  Plans' own port, which existed only because handlers were found by selector
  after a paint that a prop could have avoided. This is a narrower case: real
  layout measurement and native handler attachment, neither of which a prop
  can carry. `kanban/test_matrix.mjs`'s 36 checks pass unchanged. Overview and
  the Timeline had no suite at all — the "Three views are drawn by nothing
  that tests them" entry below reached Backups and the Matrix but not these
  two — so `kanban/test_overview.mjs` (18 checks) and `kanban/test_timeline.mjs`
  (9 checks) are new, and both are aimed at the one real risk the port
  carries: that `capMsgCards()` and `wireTimelineDrag()` still find a real,
  painted DOM the instant `renderView()` returns, with no `setTimeout` in
  either suite to paper over a race if one existed.

- ~~**Three views are drawn by nothing that tests them, and the component port
  wants to go through all three next.**~~ **Done, 13 Sep 2026.**
  `kanban/test_backups.mjs` covers Backups and the preview it opens — 36 checks
  — and `kanban/test_matrix.mjs` covers the Matrix, 36 more. Both are in
  CLAUDE.md's list.

  Two things came out of writing them. The first draft of the preview suite
  **passed with the lock guard removed from `saveFile()`**, which is the one
  guard the whole read-only mode rests on: `saveFile()` returns early on
  `!state.dirty` as well as on `state.locked`, so calling it against a clean
  document proves nothing. Both write checks now dirty the document first, and
  `autosaveTick()`'s rate gate is wound back too. Checked by mutation
  afterwards: dropping the guard from `saveFile()` fails three checks and from
  `setDone()` another — but dropping it from `autosaveTick()` fails nothing,
  because that function calls `saveFile()` and the guard there still holds. It
  is defence in depth rather than the thing doing the work, which is worth
  knowing before anyone tidies it away.

  The second is smaller and catches every fixture-based suite: the board mints a
  stable `id:` for any task without one at load time and marks the document
  dirty so the ids get written back. On a fixture that means the tab tries to
  save a file the suite invented. Every task in both new suites carries an
  explicit `id:`, which leaves nothing to mint.

  What the entry originally argued: `kanban/test_*.mjs` covers Plans,
  Execution, Schedule, Chats, Projects and Notes. It does not cover
  `kanban/js/15-backups.js` (129 lines), `16-backup-preview.js` (107) or
  `17-matrix.js` (293), and those are exactly the next three in the order the
  component-layer entry above sets out. Projects could be ported with
  confidence because 44 checks written against the old markup passed unchanged
  against the new; none of these three has that, so the same move on them
  proves nothing.

  Backup preview is the one to write first and the one to be most careful
  with, because it is not an ordinary view: it is the surface that sets
  `state.locked` to make a preview safe to look at, and CLAUDE.md's own testing
  rules lean on that lock being the thing that cannot save. A suite for it is
  worth having whether or not the port ever reaches it — a silent regression
  there is a tab that can write while it is showing a backup, which is the
  shape of both real overwrites of the live list.

  `kanban/test_projects.mjs` is the model to copy: stub the routes rather than
  reading disk, lock the tab before loading a fixture, tear every non-GET out
  of `fetch` afterwards, and assert the blocked list is empty at the end.

- ~~**Every agent here is rationed by an allowance none of them can read, and
  the only way to read it headlessly is a throwaway terminal.**~~ **Done,
  14 Sep 2026.** `core/windows.py`
  reconstructs the five-hour windows from `~/.claude/projects/*/*.jsonl`, and
  `record_limit()` (`agents/planning_agent/plan.py:325`) says in its own docstring
  that `limit_tok` is "the one measurement of the session allowance this machine
  can make" — a floor revised upward by being refused, never a figure. So the
  batch loop at `:733` gates on `expiry` alone: it asks how long the window has
  left and never how full the account is, which are the two halves of the
  question that decides how much work a night can carry.

  Measured on 11 Sep 2026, the official figure is absent from everything an
  unattended process can reach. Not in the transcripts, not in any of the 34
  hook events, and not among the 25 keys a `claude -p --output-format json` run
  returns. `~/.claude.json` holds `cachedUsageUtilization` with
  `utilization.five_hour.utilization`, but a headless run does not refresh it —
  it read 76 minutes stale at 11% while the live figure was 32% — so it is a
  cache only an interactive session fills. The `Usage for Claude` app on
  `127.0.0.1` answers `/session` with a `percentUsed` that does track, but it is
  the app's own derivation and lags by minutes. The one authoritative source is
  Claude Code's `statusLine` payload, which carries
  `rate_limits.five_hour.used_percentage` and `seven_day` straight from the
  server, and which a headless run never fires because a status line is screen
  furniture. What works is giving Claude Code a terminal to draw into: a pty, a
  real session with its own throwaway `statusLine`, one word sent, `rate_limits`
  caught, session killed. About 17 seconds and one Haiku call. A working
  implementation sits outside the repo at `~/.claude/usage/`, with the
  leaked-epoch (#52326), rollover and tombstone guards taken from
  `claude_monitor/output/official.py`, and two traps worth keeping: it must run
  from a directory Claude Code already trusts, or the trust prompt appears
  instead of a session, and the pty must be drained throughout or the TUI blocks
  on write and never reaches its first API response.

  This is not the planning agent's to own. `improve_agent` and
  `agents/planning_agent/` are two claimants on one allowance and a third would be
  a third, so the harvester belongs in `PACKAGES/` by the rule in
  `~/Code/CLAUDE.md` — anything two apps depend on moves there — and each agent
  reads it rather than carrying a copy.

  Decided, 13 Sep 2026, both halves. The number is advisory: `core/windows.py`
  stays the gate on time left, and the harvested figure is logged alongside
  rather than able to stop a night by itself — the harvester is new and
  unproven, and a night should not fail to start because a pty session failed
  to spawn. And the reading is written as a small log beside the plans rather
  than overwritten each time, since a percentage sampled twice a night is a
  series worth seeing trend over weeks, which is the actual point of
  harvesting it. The API call is what forces the sampling shape — it makes the
  harvest a once-per-batch reading rather than a per-task one, so it cannot
  catch a window filling up mid-night.

  Built as decided. `harvest.py` moved into a new repo,
  [tiagopedras/usage-harvester](https://github.com/tiagopedras/usage-harvester)
  (`PACKAGES/usage_harvester/`, private, personal account) — the pty
  mechanics untouched from the `~/.claude/usage/` reference, with the probe
  and output files moved under a fresh `tempfile.mkdtemp()` per call so two
  callers harvesting at once (this machine's several scheduled agents) never
  race each other's capture. It earns its place in `PACKAGES/` on a bet
  rather than the rule being satisfied yet — see the new paragraph in
  `PACKAGES/README.md` — since only `agents/planning_agent/plan.py` reads it
  today; `improve_agent` picking it up later is what would actually satisfy
  "something two apps depend on."

  `plan.py`'s new `harvest_usage()` is the caller: a `sys.path.insert` the
  same shape `stream.py` already uses for `work_streams`, an `import harvest`
  wrapped in `try`/`except ImportError` so a machine with the package not
  checked out costs one log line rather than a failed night, and one call to
  `log()` either way — "usage harvest: 5h 32.0% / 7d 18.4%", or "the
  statusline never fired", or "n/a" for a window `summarise()` couldn't read.
  Wired into `run()` once per real batch, `if not args.task`, on the same
  reasoning `brief.py`/`report.py` skip a manual single-task run: there is no
  batch there for the reading to be logged alongside. It fires even on a
  quiet night that plans nothing — the series this is for is across every
  wake, not just the busy ones.

  `test_harvest_usage()` in `test_planning_agent.py` covers the plumbing —
  both windows logged, a harvest that never fired, a stale-or-missing window
  reading `n/a` — by injecting a fake `harvest` module into `sys.modules`
  rather than calling the real one, the same "spends real money, untested
  here" line `run_agent()` and `run_report_agent()` already draw: the real
  `harvest()` spawns an actual Claude Code session in a pty, which is not
  something a test suite should do unattended either.

- ~~**The board can start a conversation about a task but not about the
  list, so every PA sitting means leaving it for a terminal.**~~ **Done,
  14 Sep 2026 — by a different route than the one decided below.** `newChat()`
  (`kanban/js/10-reference-sections.js:1048`) mints an owner key on a task and
  hands it to `chat.openNew()`, and `Runner.run()`
  (`PACKAGES/ai_chat_engine/engine.py:472`) shells `claude -p <prompt>` in the
  configured cwd — so `/pa-checkin` typed into that modal would run today, and
  what is missing is a chat that belongs to the board rather than to one card,
  plus somewhere in the header to open it.

  Decided, 13 Sep 2026, both halves. `state.locked` is set for the length of
  the turn rather than trusting `watchTick()` (`kanban/js/24-autosave-watching.js:47`)
  — the harder option, but a lock cannot lose an edit where a race can, and
  `watchTick()`'s quiet-reload is built around an occasional outside change,
  not a conversation that may write repeatedly in one sitting. And only the
  plain `pa` skill is reachable this way — ad hoc changes and
  re-prioritisation, the open-ended kind of turn a panel actually suits.
  `pa-checkin`, `pa-checkout`, `pa-focus` and the rest stay terminal-only
  sittings.

  **Reopened and rebuilt, 14 Sep 2026: a real Claude window rather than the
  embedded `claude -p` chat.** He asked for a real window once this reached
  the top of the list, on the reasoning that a sitting about the whole file
  is better served by something he can keep typing into than one round trip
  at a time through the modal every task's own New chat opens. So the panel
  this entry originally called for was never built — `open_terminal_session()`
  (`kanban/server.py`) opens a genuine `Terminal.app` window instead, via
  AppleScript's `do script`, running an interactive `claude "/pa"` in the
  repo's own root (always trusted, so no "Is this a project you trust?"
  prompt gets in the way). The lock half of the decision above still holds
  exactly as reasoned — a real session's writes to `todo.md` would otherwise
  race this tab's autosave the same way an embedded chat's would — so
  `openListChat()` (`kanban/js/16-backup-preview.js`) sets `state.locked`
  and reuses Backup Preview's own bar rather than inventing a second one:
  `updateLockUI()` gained a `state.lockKind` (`''`/`'backup'` and `'demo'`
  read as before, `'chat'` new) so the same `#lockBar`/`#exitLock` draws
  "Conversation open" and "Done — reload the list" instead. The whole
  arrangement is reachable from **Data ▾ → Talk about the list**, refuses
  outright on unsaved edits first (same reason `loadBackupPreview()` does —
  the exit path always re-reads `todo.md` fresh, which would otherwise
  discard them), and the resulting session writes an ordinary transcript
  under `~/.claude/projects/`, so it is findable afterwards through the same
  "Attach a session…" path any other one is.

  **One thing this could not verify from inside an agent's own sandboxed
  tool calls: whether `do script` actually reaches Terminal.app on this
  machine.** Driving Terminal by AppleScript needs a one-time interactive
  Automation permission grant, and every attempt made while building this —
  both through the new route and a bare `do script "echo …"` run directly —
  timed out with `AppleEvent timed out (-1712)` rather than opening anything
  useful, which reads as exactly that permission never having been granted to
  whatever process chain a sandboxed tool call runs under. The code itself
  is unchanged by that; `kanban/test_backups.mjs` covers the lock half in
  full (the fetch a real click would make is stubbed there, same as every
  other write in that suite) precisely because the Terminal half cannot be
  driven headlessly. **Untested by hand: press the button from the actual
  board.** The first click may show the macOS "Terminal wants to control
  Terminal" (or similar) permission dialog — allow it once and it should not
  ask again.

  **Removed, 19 Sep 2026, in favour of a floating PA panel** — the Big entry
  at the top of this file. The whole of it went: the `Data ▾` item, the
  `/session/open-terminal` route, `open_terminal_session()` (`_open_terminal()`
  stays, `start_plan_session()` is its one caller now), `openListChat()`,
  `lockKind`'s `'chat'` branch, and the suite's block. The objection was the
  lock rather than the terminal: a conversation about the list put the list
  behind a lock bar for the length of it.

- ~~**A report he defines once cannot be written down anywhere, so every
  written report is typed fresh from a prompt and comes out a slightly
  different shape each time.**~~ **Done, 14 Sep 2026, together with the
  `core/render.py` entry below** — one piece of work, as both entries
  already said it had to be.

  `core/aggregate.period_view(tasks, archive_path, start, end, buckets=None)`
  is the aggregation pointed at a past window rather than at today —
  `core/archive.py` reads `done-archive.md` for the first time in Python,
  ported from `parseArchiveEntries()` in `kanban/js/12-reports.js` rather
  than duplicating it, off the same `### Bucket · Tier` heading and
  `todo.TASK_RE`/`todo.parse_task()` the live document already reads with.
  Live done tasks and archived ones are joined the same way
  `completedRecently()` already does it, and `buckets` narrows both the row
  list and the per-bucket counts together, so a report scoped to one bucket
  never reports a count for another.

  `agents/planning_agent/report.py` is the pass — a definition per report
  kind in `data/<dataset>/reports/_defs/`, `agents/planning_agent/REPORT-DEFS.md`
  holding the tracked half the same way `BUCKETS.md` does for bucket briefs.
  `report_listing()` needed no change at all: it already reads only `.md`
  files directly in `reports/`, never recursing into a subfolder, so `_defs/`
  was already invisible to it before this entry existed.

  **Not templated, on purpose — the entry below is `core/render.py`'s and
  this one is not the same job.** README.md's own "Rules for writing a
  report" rules out what a template would naturally produce: never list
  individual to-dos, outcomes rather than activity, say what a change means
  rather than what happened. That is judgement, and Mustache is not a
  language for one. So `report.py` hands a definition's own question — the
  prose under its frontmatter — to a real model call, alongside
  `period_view()`'s answer as the only ground truth it is allowed and
  README's five rules inlined rather than assumed read, and the model
  writes the report. `period_view()` is what stops it inventing what
  happened; it was never going to be what decides what any of it means.

  Fires from the same lock `plan.py`'s batch and `brief.py`'s briefing pass
  already share, every scheduled wake — not gated to one night by a
  day-of-week check, because `due()` already answers the question that
  matters: a definition is due once a full `window_days` has passed since it
  last rendered, so a 30-day report renders roughly monthly and a 7-day one
  weekly, whatever night the lock happens to be free. Most wakes find
  nothing due and spend nothing.

  Checked for real against the live list: `design-system-monthly`, the one
  worked example, rendered correctly on a window with nothing to report —
  "Nothing in this bucket closed out between 15 August and 14 September,"
  not a fabricated list — for $0.28, and `report_listing()` picked it up
  without listing `_defs/` alongside it.

  The original entry follows.

  **A report he defines once cannot be written down anywhere, so every written
  report is typed fresh from a prompt and comes out a slightly different shape
  each time.** The Reports view's second column reads `data/<dataset>/reports/`
  through `report_listing()` (`kanban/server.py:1305`) and `report_meta()`
  (`:1255`), which parse the frontmatter — `title`, `date`, `covers`, `topic`,
  `summary` — off whatever Markdown file happens to be in the folder; the empty
  state says as much in as many words, "asking Claude for one is how they get
  there" (`kanban/js/12-reports.js:630`). So the output has a home and a format,
  and the *input* has neither: the rules live as prose in README.md under "Rules
  for writing a report", the period, the buckets and the question are re-stated
  in the prompt every time, and there is no `pa-report` among the nine skills in
  `agents/pa_agent/skills/`. The shape to copy already exists one folder over —
  `agents/pa_agent/skills/pa-mobile/templates/` is one file per report kind, with
  its own README saying "adding a file here is the whole of adding a report
  shape", and `pa/references/templates.md` documenting the fields — except those
  produce phone messages off the live list rather than a written report about a
  period, and they are the templates the entry below already says nothing
  executes.

  So a definition file per report — the window, the buckets it covers, the
  questions it has to answer, the sections it comes out in — plus a pass that
  renders one on a schedule. They live in `data/<dataset>/reports/_defs/`, one
  file per report kind: private and per-list, which is what a definition naming
  Twinkl processes has to be, and beside the output it produces rather than in a
  folder of its own. The underscore is what keeps them out of the listing —
  `report_listing()` (`kanban/server.py:1305`) sweeps that directory for `.md`
  and would otherwise show every definition as a report, so it skips names
  starting with `_` and skips the subfolder itself, which it already does by
  only reading files.

  What the pass reads is the other half, and it is not a free choice: the
  arithmetic behind "what got done between these two dates" exists in
  JavaScript only — `completedRecently()`
  (`kanban/js/12-reports.js:162`) and `parseArchiveEntries()` (`:130`) are what
  join the live file to `done-archive.md`, and the Python side has no archive
  reader at all (`check_todo.py:52` names the archive only as a file to ignore).
  That is the same gap the `core/render.py` entry below already argues for
  filling once in `core/`, with `check_overdue()`
  (`agents/pa_agent/skills/pa/scripts/check_todo.py:638`) and `select()`
  (`agents/planning_agent/pick.py:278`) as the two half-written copies to fold in —
  this wants the same aggregation pointed at a past window rather than at today,
  so the two entries should be built as one piece of work or not at all.

  Where it runs is the easier half. A weekly render is unattended work on a
  budget, which is `agents/planning_agent/`'s machinery — the clock and lock gates
  in `run.sh`, the window arithmetic in `core/windows.py` — but not its contract:
  `eligible()` (`pick.py:82`) only ever yields open `ai:full` tasks, and a report
  is about finished ones. It is a pass of its own, the way the briefing entry
  below also concludes, firing on one night a week rather than every night, and
  writing only into `reports/`. `todo.md` is not in reach for it, same as
  everything else that runs while he is asleep.

- ~~**Creating a list already works; what it produces is a shell nothing else on
  the board knows how to use.**~~ **Done, 18 Sep 2026.** `STREAMS` is gone. The heading is the stream — `bucket_slug()` in `agents/planning_agent/plan.py` — pinned per bucket in the dataset's own `buckets/README.md`, which `stream_map()` reads first so a rename moves the row and nothing on disk. `planning-design-system` and `planning-work-oversight` are `planning-ds` and `planning-bau`, with their folders and symlinks; `personal`'s bucket is a real `personal-tasks` with its own brief and planner. `create_dataset()` and the bucket editor both scaffold as they go, through `/bucket/scaffold`, and the loud log is now a missing planner file rather than a missing table row. `createDataset()`
  (`kanban/js/21-datasets.js:48-58`) prompts for a name, posts it to
  `/datasets`, and `create_dataset()` (`kanban/server.py:394`) writes one file:
  a `todo.md` holding `NEW_DATASET_TEMPLATE` (`kanban/server.py:384-391`), which
  is `## 1. Tasks` and the four standard columns, empty. Everything that makes a
  list actually work is left unmade and undocumented — `people.md`, which
  `CLAUDE.md` calls the source of truth for who is who; the Context section at
  the foot of `todo.md`; and, since 8 Sep 2026, `buckets/<stream>/<stream>.md`
  plus the `buckets/README.md` saying which buckets the list has. Worse, a
  bucket heading invented at the prompt is invisible to `STREAMS`
  (`agents/planning_agent/plan.py:53-72`) until someone edits that table by hand, so
  every task in the new list plans against the `general` fallback and logs
  loudly for it — which is how `personal` has behaved since it was made. What
  this wants is a sequence rather than a prompt: ask for the buckets as well as
  the name, scaffold the briefs from the template in `BUCKETS.md`, and write the
  `README.md`.

  `STREAMS` goes away rather than moving. The only work that table does is
  bridge a shorthand heading to a descriptive filename — `ds` to
  `design-system`, `bau` to `work-oversight` — and the other three entries map a
  heading to itself. So `bucket_stream()` slugifies the heading instead: strip
  the leading number, lowercase, and that is the stream. `3. DS` becomes `ds`,
  `2. BAU` becomes `bau`, and the two files that no longer match get renamed to
  match — `planning-design-system.md` and `planning-work-oversight.md` to
  `planning-ds.md` and `planning-bau.md` (the naming this needs to land on —
  `bucket_agent()` builds the agent name as `"planning-%s" % stream`, so it has
  to be `planning-ds`/`planning-bau` rather than `plan-ds`/`plan-bau`, which is
  what an earlier pass at this entry said), with `buckets/design-system/` and
  `buckets/work-oversight/` renamed alongside them and the `.claude/agents/`
  symlinks repointed once. After that a new bucket needs nothing written down
  anywhere: the heading is the stream, and a new list needs only its own
  planner files, which a new stream needed regardless of where the mapping
  lived.

  A real regression turned up while checking whether the "safe half" of this
  entry (just the createDataset scaffolding, leaving STREAMS alone) could be
  done on its own. It can't: a scaffolded bucket needs its own stream identity
  to find its own brief folder, and today that identity only exists via
  `STREAMS`, which is the very thing direct slugification retires — so the two
  halves are one piece of work, not two.

  Checked against the real data 13 Sep 2026: `personal`'s only heading is
  `1. Personal Tasks` (`data/personal/todo.md:3`), and today that maps to
  `general` not because `STREAMS` names it — it doesn't, "tasks" is the only
  key close to it and "personal tasks" never matches that — but because
  *nothing* matches and `bucket_stream()` falls back to `FALLBACK_STREAM =
  "general"` (`plan.py:70`). Direct slugification would strip the leading
  number and lowercase the rest, same as it does for every other heading, and
  "Personal Tasks" would become the stream `personal-tasks` — a real,
  non-fallback stream with no `planning-personal-tasks.md` and no
  `buckets/personal-tasks/` folder, where today's `general` fallback has both.

  Decided, 13 Sep 2026: `personal-tasks` gets scaffolded properly rather than
  the heading being renamed to dodge it — a real bucket with its own brief and
  planner file, the same as DS or BAU, rather than sharing the general
  catch-all by accident. And the scaffolding this entry already builds for
  `createDataset()` extends to the bucket editor (`kanban/js/08-buckets.js`)
  as well: adding a bucket on a list that already exists is the same action as
  naming one at list creation, and today it is free text with nothing behind
  it, so both paths write the brief and the planner file as part of the
  action.

  Renaming is different from adding, and has to be, or the same regression
  just moves to a different verb: the slug a bucket's stream identity is built
  from is fixed at the moment the bucket is created, not re-derived from its
  heading on every read. `## N. Personal Tasks` renamed to `## N. Family
  stuff` keeps the same brief folder, the same planner file, the same stream —
  only the label he reads changes. That means the slug has to live somewhere
  other than the heading text itself once a bucket exists — a line in
  `buckets/README.md` beside each stream is the natural place, since that file
  already says which buckets a list has. `bucket_stream()` reads it there
  first and only falls back to slugifying the live heading for a bucket that
  has never been through the editor, which is what lets an old hand-written
  `todo.md` keep working unchanged.

  What is lost with the table is the whitelist half — an unmapped heading used
  to reach `general` and log loudly, which is how a renamed bucket got noticed.
  A slugified heading always resolves, so the loud log moves to the missing
  file instead: `bucket_agent()` naming a `planning-<stream>.md` that is not on disk
  is the same signal one step later, and it is a stronger one, since it names
  the file to create rather than a table row to add. With both creation paths
  scaffolding as they go, this log becomes a safety net for a hand-edited
  `todo.md` rather than the main defence.

- ~~**Every place that hands a task to an assistant re-derives its own
  understanding from the same chaotic notes field, and none of them leaves
  behind anything the others could reuse.**~~ **Done, 14 Sep 2026.** Built as
  the entry proposed: `agents/planning_agent/brief.py` is the pass of its
  own, running before `plan.py` inside the same lock `run.sh` already takes
  rather than a second one. `briefable()` is every open task regardless of
  `ai:`, not `pick.eligible()`'s tenth of the board; staleness is
  `pick.fingerprint()` against `data/<dataset>/briefings.json`, the same cache
  shape `attach-queue.json` and the rest already use, keyed by
  `pick.key_of()` rather than the literal `slug:` tag the entry named — most
  tasks do not carry one, and the ledger's own identity was already sitting
  there to reuse.

  Cheap is a real number, not just a word: Haiku (`claude-haiku-4-5-20251001`),
  no tools beyond a token `Read` grant, a 60-word three-line ask (Direction /
  Done / Needed), $0.10 per task and $2 across the whole pass — about $0.10 a
  task in practice, checked against a real call. 77 open tasks on the real
  list today, so a first sweep spans a few nights at that budget before every
  task has been through it once; after that, only what changed costs anything.

  All three consumers read the cache rather than re-deriving it. `newChat()`
  (`kanban/js/10-reference-sections.js`) seeds a chat from `taskBriefing()`
  when one exists, falling back to raw notes exactly as before for a task
  never briefed. `build_prompt()` (`plan.py`) adds `task_briefing()`'s answer
  as a quick orientation ahead of the verbatim block — a supplement, not the
  replacement the entry offered as the alternative, since the deep-research
  agent still wants the raw notes it was built to read. `pa`'s hook is a line
  in `SKILL.md`: `python3 agents/planning_agent/brief.py --task "<title>"`
  refreshes one entry after a groom, so a task edited today does not wait for
  the overnight pass to carry its new briefing into the next chat or plan.

  The board reads it through a new `/briefings.json` route, the same shape
  `/attach-queue.json` already answers with (`{version, briefed: {}}` when
  nothing exists yet), loaded once at boot into `state.briefings` and never
  re-validated client-side — the fingerprint check that decides staleness is
  `brief.py`'s job, the same way the file format itself is parsed in exactly
  two places and nowhere else.

  `test_briefing()` in `test_planning_agent.py` covers `briefable()`,
  `build_brief_prompt()`, the cache round-tripping through disk, staleness
  against a changed fingerprint, and `plan.py`'s own read of it —
  `run_brief_agent()` itself is untested the same way `plan.py`'s own
  `run_agent()` is not, since it spends real money. Three new checks in
  `kanban/test_chats.mjs` cover `taskDescription()`'s two paths. Checked for
  real against the live list: `--task "Prepare the DS drop-in (Friday)"`
  produced a genuine three-line briefing for $0.098, and the board read it
  back correctly through `/briefings.json`.

  The original entry follows.

  **Every place that hands a task to an assistant re-derives its own
  understanding from the same chaotic notes field, and none of them leaves
  behind anything the others could reuse.** `newChat()`
  (`kanban/js/10-reference-sections.js:927`) seeds a fresh chat with
  `taskDescription()` — `t.title + '\n\n' + notes` (`:922`) — and `notes` is
  whatever `bodyParts()` (`kanban/js/06-dates-substeps.js:110`) didn't
  recognise as a sub-step: free prose interleaved with tag lines, dates and a
  `- Project: data/projects/<name>` pointer (`:79-93`), never written to be
  read as a briefing because nothing about the format asks it to be. The
  planning agent hits the same field and does something different with it:
  `build_prompt()` (`agents/planning_agent/plan.py:199`) pastes `task.raw` plus
  the same `body` verbatim into its own prompt, on the stated belief that a
  paraphrase is exactly the context that gets lost — right for an agent
  spending ten minutes researching, and no help to a person opening a chat
  who wants to know in five seconds where this stands. A third consumer,
  `pa` grooming a task in conversation, does the same reading by hand a
  third way and writes nothing back either.

  What's missing is a middle step: a generated briefing — direction, what's
  done, what's still needed — read off the task's raw text, tags, bucket and
  project note the way `build_prompt()` already gathers them, but written to
  explain rather than pasted verbatim. Once it exists it has three
  consumers, not one: `newChat()`'s seed instead of raw `notes`, an addition
  to (or replacement for) the verbatim block in `build_prompt()`, and
  something `pa` can produce or refresh while grooming, so a task groomed
  today already carries its briefing when Tonight's batch or tomorrow's
  "New chat" reaches it.

  It is cached rather than generated on the click — "as soon as I hit New
  chat, that summary is ready" rules out a live model call in the critical
  path. It lives in a side file per dataset, `data/<dataset>/briefings.json`,
  keyed by slug and carrying the fingerprint that produced it: the same shape
  `attach-queue.json`, `canvas.json` and `sessions.json` already use, which
  keeps generated prose out of the file he hand-edits and out of the
  one-writer rule entirely. Staleness is `pick.fingerprint(task)`
  (`agents/planning_agent/pick.py:71`) against the stored one, the same hash
  `ledger[task.title]` (`plan.py:684-690`) already uses to know a plan has
  been overtaken.

  The planning agent writes it, but not as a by-product of planning, because it
  never sees most of the list: `eligible()` (`pick.py:82`) drops everything
  that is not an open `ai:full` task, so a pass riding along with the planners
  would brief a tenth of the board. It is a pass of its own, before the
  planning batch, with a skill of its own — one cheap call per task whose
  fingerprint has moved, over every open task regardless of its `ai:` tag,
  and nothing at all for the ones that haven't changed. That keeps it inside
  the machinery that already has a budget, a usage window and a lock, and it
  means a task edited today is briefed by morning rather than at the moment
  it is clicked.

- ~~**The five reserved column names are enforced by an error message rather
  than by a field you cannot type into, and deleting one is not blocked at
  all.**~~ **Done.** Both halves landed: a reserved row's
  `input[data-tiername]` renders `disabled` in `draw()`
  (`kanban/js/09-columns.js:179`) rather than accepting a rename it will only
  refuse, and `confirmDeleteTier()` (`:141`) now checks `RESERVED_TIERS` before
  offering a destination select. `TODO_TIER`/`DOING_TIER` joined the three
  named constants `rollRecurring()` and `ensureTier()` match against.

  What is built: `RESERVED_TIERS`
  (`kanban/js/02-state.js:293`) names Backlog, To do, Doing, Waiting review and
  Done, `TODO_TIER` and `DOING_TIER` joined the three constants that existed,
  and `rollRecurring()` (`kanban/js/04-tier-two-the-one-thing.js:197`) matches
  against them rather than typing `'Backlog'`/`'To do'` fresh. What is left is
  where the rule is enforced. `renameTier()` (`kanban/js/09-columns.js:79`)
  rejects a reserved rename with "the board depends on that exact name", but it
  rejects it on `onchange` (`:197-201`), so the input is freely typeable and a
  refused rename leaves the typed text sitting in the field while the column
  keeps its real name — the field then shows a name nothing on the board has.
  The rule belongs on the field instead: a reserved row's
  `input[data-tiername]` renders `disabled` in `draw()` (`:168`), with the
  reason as its `title`, so there is nothing to reject. And
  `confirmDeleteTier()` (`:136`) has no reserved check anywhere, so Doing can
  be deleted outright, which is the same failure the rename guard exists to
  prevent and a worse one — it needs the same guard, refusing before the
  confirm rather than offering a destination select for a column that must not
  go. Whichever of the five are real, renamable headings today are the ones
  this reaches; `DONE_COL` and `AI_COL` are already out of `tierOrder()` and so
  never draw a row at all.

  What the entry originally argued, kept because it is the reasoning: `WAIT_COL`, `BLOCKED_TIER` and `BACKLOG_TIER` (`kanban/js/02-state.js:258-269`)
  each carry a comment saying the same thing on purpose: "a renamed section
  simply stops matching and goes back to looking normal" — the column is
  matched by string, but a miss degrades quietly. `rollRecurring()`'s
  move-on-completion logic (`kanban/js/04-tier-two-the-one-thing.js:197`,
  added rolling a finished recurring task into Backlog or To do) doesn't
  follow that rule: it writes fresh `'Backlog'`/`'To do'` literals rather than
  reusing `BACKLOG_TIER`, and its target, `ensureTier()`
  (`kanban/js/04-tier-two-the-one-thing.js:286`), doesn't fail quietly on a
  miss at all — it creates a brand-new tier with that exact name. Rename "To
  do" in `todo.md` and this feature doesn't go quiet the way `BACKLOG_TIER`
  would; it spawns a second, empty "To do" column that nothing else
  recognises, sitting next to whatever the real column is now called.
  `renameParked()` (`kanban/js/04-tier-two-the-one-thing.js:270`) is the one
  place that already treats a name as truly load-bearing rather than
  cosmetic — it rewrites "Parked" to "Backlog" on sight rather than matching
  either. Corrected 8 Sep 2026: an internal key that actually survives a
  rename would need an identity stored per column that outlives its label —
  a marker in the file itself, changing the shared format both `todo.js` and
  `todo.py` read — which is a different, much bigger job than this entry
  first reached for. What was decided instead: Backlog, To do, Doing, Waiting
  review and Done stay ordinary headings matched by string, the same way
  `WAIT_COL`/`BLOCKED_TIER`/`BACKLOG_TIER` already are, and the Edit Columns
  editor refuses to rename any of the five, since code already depends on the
  literal text — the same protection `DONE_COL` and `AI_COL` already get by
  being kept out of `tierOrder()` entirely, extended to the three of these
  five that are real, renamable headings today. `rollRecurring()`'s literals
  and `ensureTier()`'s create-on-miss get named constants to match against —
  `TODO_TIER`, `DOING_TIER` alongside the existing three — rather than typing
  `'Backlog'`/`'To do'` fresh each time, so there is one spelling to get right
  rather than several that could drift apart. Any other tier a bucket adds
  stays freely renamable, exactly as today.

- ~~**Nothing the PA runs logs how long the sitting actually took, so there is
  no way to say where his time with it actually goes bucket by bucket.**~~
  **Done.** `agents/pa_agent/skills/pa/scripts/log_sitting.py` writes
  `data/<dataset>/pa-time.json`, an append-only log of `{session, skill,
  started, ended, buckets}` per sitting — the whole duration against every
  bucket touched, per the decision recorded below. `start`/`end` read the
  wall clock rather than the model, keyed off `CLAUDE_CODE_SESSION_ID`.

  What was missing before this: None
  of the nine `pa-*` skills (`agents/pa_agent/skills/`) record a start or end
  time for themselves anywhere — `pa-attach`'s own queue entry
  (`agents/pa_agent/skills/pa-attach/scripts/attach_session.py`, written from
  `SKILL.md:39`) carries a task title and a `cwd`, nothing about when the
  conversation began or how long it ran. The one place a timestamp already
  exists is `SessionStore` in `PACKAGES/ai_chat_engine/engine.py:103`, which
  stamps `started`/`updated` on a session — but only for conversations launched
  through the board's own Chats field, not the terminal sessions
  `pa-checkin`, `pa-checkout` and `pa-focus` actually run in day to day, which
  are never registered there at all. A task belongs to exactly one bucket, but a
  single sitting — a `pa-checkin` sweep, a `pa-checkout` pass through Doing —
  routinely touches several buckets in the same conversation, so a sitting's
  full duration logs against every bucket it touched, not a split. The write
  side follows the shape `attach-queue.json` and `notify-queue.json` already
  use — an append-only file per dataset, drained by something with a reason to
  read it — rather than inventing a new pattern.

- ~~**Every report the PA sends is rendered by hand, so the templates are
  instructions rather than code.**~~ **Done, 14 Sep 2026, together with the
  entry below** — built as one piece of work, since both needed the same
  gap closed: a Python reader for `done-archive.md`, which nothing had.

  `core/aggregate.py` is the one copy of the arithmetic that used to be two
  half-written ones: `today_view(tasks, today)` returns every field
  `references/templates.md` documents except the three marked below,
  `meeting_view(tasks, title, today)` is the named-meeting half for
  `meeting-prep`. `core/render.py` is the engine, `chevron` (now a real
  dependency — the first third-party one in this repo's Python, installed
  globally the way Jinja2 already was) plus two rules plain Mustache does
  not carry out on its own, both load-bearing for `references/templates.md`'s
  own promises: a heading whose block is empty is stripped from the
  *template source* before chevron ever sees it, since an empty
  `{{#x}}...{{/x}}` renders to nothing chevron will hand back, leaving no
  marker in the output to find the heading above by; and a placeholder with
  nothing to fill it drops its whole line, done by substituting a sentinel
  for every empty string in the context (recursively, so a row's own field
  gets it too) and dropping any rendered line still carrying one afterwards.
  Chevron's own HTML-escaping is undone on the way out, since these are
  plain-text reports, never HTML, and a title with a real `&` in it should
  read as one.

  All six templates — five in `pa-mobile/templates/`, one more each in
  `pa/templates/` and `pa-checkin/templates/`, eight files total — moved
  from the Handlebars-shaped `{{#each x}}`/`{{#none x}}` prose
  `references/templates.md` used to describe to real Mustache,
  `{{#x}}`/`{{^x}}`, closed by the field's own name rather than a generic
  tag. That doc now says so, with a worked "How a report actually gets
  rendered" example, and the stale `delegate`, "in rank: order" line is
  fixed — that list has sorted by impact against effort since 13 Sep 2026,
  not by the tag the planning agent's queue still reads.

  `todo.agenda_topics(task, previous=False)` is new in `core/todo.py`
  itself, on the reasoning the file's other note-block readers already
  follow: an Agenda block is part of the grammar, ported from
  `check_todo.py`'s own line-numbered `agenda_under()` rather than shared
  with it, since that one needs raw file lines for its findings and this
  needs `task.body`, which is a different shape to read the same block off.

  `checker_flags`, `slipped` and `context_dates` — templates.md's own
  "what the read turned up" fields, desk-only — are not built. `today_view()`
  returns each as `[]` rather than guessing, and the desk templates that ask
  for them (`pa-checkin`'s own `morning-brief`/`week-ahead`) render correctly
  with those sections simply absent, the same as any other empty field.
  Building the aggregation behind them is real, separate work — a `slipped`
  reader needs `Last updated` read back and compared to today, a
  `context_dates` one needs dates parsed out of free prose in `## Context` —
  and nothing here fakes either.

  `pa`, `pa-checkin` and `pa-mobile`'s `SKILL.md`s all point at
  `core/render.py` now rather than describing rendering as something to
  reason through by hand — Move 2/3 in `pa-checkin`, "How to report back"
  and "Reports rendered from a template" in `pa`, "Reporting from a
  template" and step 2 of the session shape in `pa-mobile`. What each skill
  still decides — which template fits what he asked, and for
  `change-report`, what the three change-reply fields actually say — is
  unchanged; only the mechanical trip from context to finished text moved
  out of the model's own reasoning and into code.

  `core/test_reports.py` covers the aggregation and the render engine —
  today's fields, the named-meeting view, the archive reader, the two rules
  Mustache does not have — against a small fixture with no JavaScript
  counterpart to keep in step, since neither module has one.
  `test_report()` in `test_planning_agent.py` covers the piece below. All
  suites pass, `core/test_todo.py`/`.mjs` included, since `agenda_topics()`
  landed in shared ground. Checked for real: `render.render()` against the
  live list's own `morning-brief.md`, `week-ahead.md` and `meeting-prep.md`
  produces plausible, correctly-truncated output; `pa`'s own change-report
  render drops the `Needs you` heading and the pending-count line exactly as
  documented, with nothing left standing where they were.

  The original entry follows.

  **Every report the PA sends is rendered by hand, so the templates are
  instructions rather than code.**
  `agents/pa_agent/skills/pa-mobile/templates/` holds five report shapes and
  `agents/pa_agent/skills/pa/references/templates.md` documents around thirty
  fields and thirteen lists to fill them with, but nothing executes any of it.
  The model reads `todo.md`, works out for itself which tasks are overdue,
  which fall inside the week, how many days old the headline is and which
  recurring meetings land tomorrow, then types the report out applying the
  file's own conventions: a placeholder with nothing to fill it drops its line,
  a heading above an empty block disappears with it, and `lines:` is a hard
  ceiling that ends in `+N more`. Those conventions hold only as well as they
  are followed, which is how the same brief comes out in a different shape two
  mornings running, and why the ceiling is the first thing to go. A
  `core/render.py` taking a template name, parsing through `core/todo.py` and
  printing finished text would settle it, and most of the arithmetic exists
  already: `effective_due` resolves dates including recurring ones,
  `occurrence_after` finds the next instance of a standing meeting, and
  `is_blocked`, `unscored`, `priority_score` and the working calendar are all
  there. What is missing is the aggregation on top, the code that turns parsed
  tasks into `overdue`, `due_this_week`, `quick_wins` and the rest, and it is
  already written twice in partial form, in `check_overdue`
  (`agents/pa_agent/skills/pa/scripts/check_todo.py:638`) and in `pick.py`'s
  headline-first ranking (`agents/planning_agent/pick.py:242`), agreeing with each
  other by hand rather than by sharing code.

  It goes in `core/`, beside `todo.py`, with fixtures of its own the way the
  format has: both callers are equals, and `pick.py` is the planning agent's, so
  filing the aggregation under `agents/pa_agent/` would have one agent
  importing out of another's folder. It does not breach the rule that the
  format lives in exactly two places — that rule is about parsing and
  serialising, which is `todo.js` and `todo.py`, and an aggregation with no
  JavaScript counterpart adds no third copy of anything.

  The engine is `chevron`, a small Mustache. The templates are mostly literal
  text with a handful of loops, and Mustache keeps them readable as the
  plain-text shapes they are, where Jinja2 — already installed at 3.1.3 —
  would leave them reading like code. It is not free either way: the section
  tags are Handlebars, not Mustache, so `{{#each overdue}}` becomes
  `{{#overdue}}` and `{{#none overdue}}` becomes `{{^overdue}}` across the six
  files, which is a find-and-replace rather than a rewrite.

- ~~**Quick wins wants a due-date order as well as its grouped/priority one, and
  Delegate to Claude goes back to an automatic sort.**~~ **Done, 13 Sep 2026.**
  `quickSection()` grew a `.sortbtn` in its head (`quickSortBtnHTML()`,
  `kanban/js/10-reference-sections.js`), keyed by its own `QUICK_SORT_KEY`
  rather than the board's `state.sort`. Grouped/priority stays the default;
  the due-date mode collapses the four groups into one flat, capped list,
  undated at the bottom, wired through the same delegated `#lists` click
  listener as the quick-dismiss and restore buttons (`kanban/js/25-archiving.js`).
  `delegateSection()` dropped the manual drag-to-reorder entirely —
  `wireDelegateReorder()`, `applyDelegateOrder()`, `setRank()` and the
  `.refnum[draggable]` CSS are all gone — and now sorts every `ai:full` task by
  `priorityScore()`, the same score every other Overview section already ranks
  by. `.refnum` shows the row's position in that order rather than the stored
  `rank:`, which stays on the task for the planning agent's own queue. Checked
  live against the real board in a locked tab: Delegate's order matched an
  independent `priorityScore()` recomputation exactly, and the Quick wins
  toggle re-rendered correctly both ways. Neither section has a suite of its
  own — Overview is outside `kanban/test_*.mjs`'s coverage entirely — so this
  rests on that manual check rather than an automated one.

  Below is what the entry originally argued, kept for the reasoning:

  `quickSection()`
  (`kanban/js/10-reference-sections.js:399`) groups before it sorts today —
  meetings with an agenda first by nearest date, then messages, then S-effort
  tasks, `byPriority()` ranking inside each. Decided, 13 Sep 2026: rather than
  replacing that with a flat due-date list, it becomes a second order he can
  switch to, the same toggle shape `sortMode()`/`setSortMode()`
  (`kanban/js/03-tier-one-impact-effort.js:22`) already gives the board's own
  columns — grouped/priority stays the default, due-date-first (undated at the
  bottom) is the alternative, and the groups collapse into one flat list only
  in that second mode. What is in the column at all is untouched, since those
  filters are about eligibility rather than order — `ai:full` belongs to
  Delegate, Backlog is parked on purpose, and a task waiting on another or on
  a `start:` date still counts in the held tallies rather than appearing.

  Delegate to Claude gained manual drag-to-reorder on `rank:` on 13 Sep 2026
  (this file, above). Decided the same day, after a re-read: drop it again in
  favour of the automatic impact-against-effort score this entry originally
  asked for (`EFFORT_N`, `core/todo.js:565`) — `delegateSection()` (`:577`)
  sorts by that score rather than by `rank:`. The tag stays, since the
  planning agent's queue orders by it, but `.refnum` beside each card shows
  the row's position rather than the stored rank, since the two no longer
  agree. The drag grip built for the manual order comes back out.

- ~~**`implementing-agent` is not to run overnight. What the night owes him is a
  report that agreed plans are waiting.**~~ **Done, 13 Sep 2026.** Raised
  6 Sep 2026 as a way to run it unattended, and settled the other way: it
  only ever runs from `pa-do`, inside a session he is sitting in, because
  being able to stop and ask is what makes it safe to hold write tools at
  all, and an unattended run is that design inverted. Not re-proposed.

  The reporting half is built. The terminology moved under this entry —
  `status: agreed` became `state: accepted` on a plan, and the actual queue
  that grows quietly is runs sitting `state: backlog` in Execution, minted by
  `stream.py --sync` and untouched until `pa-do` — so
  `count_backlog_runs()` (`agents/planning_agent/plan.py`) counts those rather
  than plans, reading frontmatter the same shallow way `plan_meta()` does.
  `announce()` now fires on that count alone, even on a night that planned
  nothing — the one gap this entry was raised for, since the old
  `if not written: return` made a quiet planning night silent regardless of
  what was waiting in Execution — and the notification's `view` points at
  Execution rather than Plans when that is the only news.

  **Reopened 13 Sep 2026** with the fence it was settled without: see the
  entry at the top of this section.
