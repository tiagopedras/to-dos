# Session Handover — Figma component system, and porting it back to the board

**Session date**: 12 September 2026
**Repo**: `~/Code/to-dos`
**Figma file**: `Untitled` — https://www.figma.com/design/Cgocs5SMDGPSF5MzNan4Hu/Untitled
**Written for**: a session that will implement the Figma standardisation in this codebase.

---

## Session overview

The board's Board view, its task drawer, and the Plans view were rebuilt in Figma from live
measurements of the running app. Those three screens were then progressively refactored into a
component library, and the library was repeatedly consolidated — 9 separate components collapsed
into 4, and the Board and Plans columns ended up on one shared skeleton.

**The job for the next session is the reverse direction: take the consolidation decisions that were
settled in Figma and apply them to `kanban/board.css`, `kanban/index.html` and the view renderers in
`kanban/js/`, so the code has the same small set of parts the design file now has.**

Nothing in this session changed how the app behaves, with one exception (the filter bar order, see
below). The Figma file is the specification; this document is the translation.

---

## Context & objectives

The starting point was three screens drawn faithfully from the live app at 1440×900:

| Frame | What it is |
| --- | --- |
| `Board — 1440×900` | the Board view, six columns, 33 cards |
| `Task drawer — 780×900` | the drawer at its two-column width (≥700px on `#dbody`) |
| `Plans — 1440×900` | the Plans view, four columns |

All content is the **example list** (`kanban/demo.md`), never the real one. The Plans view reads the
real `data/<dataset>/plans/` folder, so its copy was invented in the same register as demo.md rather
than copied from the real plans.

Everything then moved through repeated rounds of "these two things are the same, merge them".

---

## The component system as it now stands in Figma

This is the target state for the code. Nine of these did not exist as components at the start of the
session; the consolidation happened in the order below.

### 1. `Tag` — 10 variants, two axes

Was 14 single-purpose variants (Neutral, Impact high, AI partial, AI full, Due, Due soon, Due
overdue, Urgent, Needs scoring, Project, Ticket, Repeat, Delegate, One thing). Now:

- **`Style`**: `Solid` | `Outline`
- **`Colour`**: `Neutral` | `Blue` | `Amber` | `Red` | `Green`
- **`Label`**: text property

Mapping that was applied:

| Old | New |
| --- | --- |
| Neutral, Impact high, Due, Ticket, Repeat | Solid / Neutral |
| Due soon, Needs scoring | Solid / Amber |
| Due overdue, Urgent | Solid / Red |
| Delegate | Solid / Blue |
| Project | Outline / Neutral |
| One thing | Outline / Blue |
| AI partial | Outline / Amber |
| AI full | Outline / Green |

**The insight worth carrying into the CSS**: `.tag.impact-high{color:var(--ink)}` is dead code. Its
only job is to brighten the text, and its content is always an emoji (🔥), which renders in its own
colours regardless of `color`. It is visually identical to a plain `.tag`.

Solid/Neutral is `background:var(--chip); color:var(--ink-soft)`. Outline is
`background:transparent; border:1px solid <colour at 35%>; color:<colour>`. Solid Green
(`--green-bg`) and Outline Red exist in the matrix but are unused today.

### 2. `Tab` — 4 variants, optional dot and count

Was two separate sets, `Tab` (the view tabs) and `Bucket tab` (the bucket filters). One component now:

- **`State`**: `Off` | `On`
- **`Size`**: `Default` (13px, padding 5/11) | `Small` (12px, padding 4/9)
- **`Show dot`** (boolean) — the bucket colour dot
- **`Show count`** (boolean) — the trailing count pill
- **`Label`**, **`Count`**: text properties

A bucket tab is just a Tab with the dot and count switched on. A Plans filter chip is a Small tab
with the count on and the dot off.

### 3. `Segmented control` — one container, folded from two

`Bucket filter group` was the same object as `Segmented control`: a `.tabs`-style pill holding N
tabs. Now one component with six tab slots (instance-swap + show/hide each) and three optional
dividers.

- App header → dividers on, no dots, no counts
- Bucket filter bar → dividers off, dots and counts on
- Plans column filters → Small tabs, dividers off, counts on

### 4. `Button` — 12 variants, two axes

Was `Button` (Default, Ghost, Danger, Primary) plus `Button · small` (Outline, Dashed, Mini). Now:

- **`Variant`**: `Default` | `Outline` | `Ghost` | `Danger` | `Primary` | `Dashed`
- **`Size`**: `Default` (13px, padding 6/11, radius 7) | `Small` (12px, padding 4/9, radius 6)
- **`Label`**: text property

Normalisations accepted in the merge (these are real, if small, visual changes to port):

- `.btn.mini` (Run now, Spend and clocks) → Default/Small: **radius 4 → 6**
- `.addsub` / `.aic-addsub` (+ Add subtask, + New chat…) → Dashed/Small: **12.5px → 12px**,
  **padding 6/10 → 4/9**, **radius 7 → 6**
- `.completeall` (Complete all, Expand) → Outline/Small: **11.5px → 12px**

### 5. `Card` — one component for four card types

The biggest merge. `Task card`, `Plan card`, `Queue card` and `Chain card` are one component. The
plan card had already been redesigned (in Figma, by hand) until it was the same object as the task
card: same fill, radius 9, padding 9/10/9/12, 3px absolute left stripe, and a 10.5px bold uppercase
eyebrow above the title.

- **`State`**: `Default` | `Backlog` (.9) | `Waiting` (.6) | `Done` (.3 + strikethrough title) |
  `One thing` (accent tint `#1D2431`, accent border at 45%) | `Agreed` (`--green-bg` fill) |
  `Dimmed` (.6 + dashed)
- **Booleans**: `Show eyebrow`, `Show position`, `Show action`, `Show tags`, `Show meta`,
  `Show link`, `Show summary`, `Show progress`, `Show note`, `Show stripe`
- **Texts**: `Eyebrow`, `Title`, `Position`, `Where`, `Link`, `Summary`, `Steps`, `Note text`
- **Tags**: six instance-swap slots (4 left, 2 right) each with a show/hide boolean

Which toggles make which card:

| Card | Toggles |
| --- | --- |
| Task card | eyebrow (bucket) + tags + note (+ progress) |
| Plan card | eyebrow (status badge) + meta + link + summary |
| Queue card | position + link + note, no eyebrow, no stripe |
| Chain card (dependency) | title + one tag |

Differences deliberately dropped: the queue card's darker `--bg` fill and 10px radius, and the chain
card's missing border. Titles unified on **13.5px Semi Bold** (the plan card's weight, not the task
card's 570/Medium).

Plan cards set their stripe colour as an instance override: `#6AA0FF` for `new`, `#6FD398` for
handed over and accepted, `#363C45` for everything else. See "Decisions taken" below.

### 6. `Column header` — one component for both views

Was `Column header` (board: name, hint, sort, count, bottom divider, padding 11/13/9) and
`List card head` (plans: title + a `.btn.mini`, no padding, no divider). One component now, with:

- **Booleans**: `Show hint`, `Show sort`, `Show count`, `Show action`, `Show Filters`,
  `Show description`
- **Texts**: `Title`, `Hint`, `Count`, `Description`
- **`minHeight: 41`** so a header carrying only a title still matches the board's

Two additions made in Figma that do not exist in the app yet: a **Filters dropdown in the header**
(used by Plans' Waiting for review and Done, replacing the in-body filter tab rows) and a
**Description paragraph in the header** (the Plans column lead text, moved out of the body).

### 7. `Column` — 2 variants, one background, one skeleton

Settled after several passes:

- **`Style`**: `Default` (solid border) | `Agent` (dashed border) — **Handed to AI is the only
  dashed column in the whole file**
- **One background for every column**: `--panel` `#1C1F25`. The transparent-fill treatment on
  `.waitcol` / `.donecol` / `.aicol` is gone.
- Radius 12, `1px var(--line)`, the two existing drop shadows, **width 322, row gap 12** in both views
- **Anatomy**: `Column header` instance, then a **Body** (a real Figma slot) with padding 9 and gap 8
- `Show empty state` boolean holding a `Column empty state` instance

### 8. `Column empty state` — new, did not exist

- **`Style`**: `Plain` (the board: 12.5px `--ink-faint`, padding 6/4/10, "Nothing here") |
  `Boxed` (Plans: dashed border, `--bg` fill, radius 10, padding 11/13, 13px)
- **`Message`**: text property

Both already exist in `board.css` (`.empty` and `.lists.pview .reportsview .empty`) — this only
names them as one thing with two styles.

### 9. `Input` — Search folded in

`Search field` was only ever a placeholder-state input. One set now:

- **`State`**: `Value` | `Placeholder`
- **`Value`**: text property

### 10. `Select` — Dropdown + Select + Date picker folded in

- **`State`**: `Value` | `Placeholder`
- **`Show dot`** (the bucket colour dot on the Bucket field)
- **`Show caret`** (▾)
- **`Show calendar`** (a drawn calendar icon — body, header rule, two hangers)
- **`Label`**: text property

| Was | Now |
| --- | --- |
| Dropdown · With dot (Bucket) | Value + dot + caret |
| Dropdown · Plain (Status, header Filters) | Value + caret |
| Select (AI can do) | Value + caret |
| Date picker · Set (Due) | Value + **calendar** |
| Date picker · Empty (Can start) | Placeholder + **calendar** |

The calendar icon on date fields is new — the app currently shows no trailing affordance on `.dpbtn`.

### 11. One control height

**Every field control is `minHeight: 33`, matching a default-size button.** Before the merge they
were 32.3 (`#q`, `#aiFilter`), 34.85 (`.dpbtn`, `.bucketbtn`) and 36.3 (drawer text inputs).

### 12. Variables

- Collection **`Bucket`** — one colour variable, four modes (People, Design oversight, Design System,
  Strategic). The card's stripe and eyebrow bind to it, so a card changes bucket by switching mode.
- Collection **`Colour`** — the 14 palette tokens from `:root` in `board.css`.

---

## How the Board and Plans came to share one skeleton

This is the part with the most consequence for the code, so it is worth spelling out.

**Starting point.** The two views were built from unrelated furniture:

| | Board | Plans |
| --- | --- | --- |
| container | `.col` — radius 12, `--panel`, 1px line, shadow, **padding 0** | `.listcard` — radius 12, `--panel`, 1px line, shadow, **padding 14/16/16** |
| heading | `.col h2` — name, hint, sort, count, **bottom divider**, padding 11/13/9 | `.cardhead > h3` + optional `.btn.mini`, no divider |
| lead copy | none | `.help.listlead` paragraph, first child of the card body |
| body | `.drop` — padding 9, gap 8 | the card's own padding, ~gap 10 |
| width | 322, gap 12 | 341.5, gap 14 |
| state cues | `.waitcol` transparent+solid, `.aicol`/`.donecol` transparent+dashed | agent column tinted+dashed, Done solid |

**What was done, in order:**

1. The two header components were merged, and the Plans headers were moved onto the Board's style
   (padding + bottom divider).
2. The Plans columns had their outer padding zeroed and their children moved into a **Body** wrapper
   with the board's padding 9 / gap 8. The header sits above it, flush, exactly like `.col h2`.
3. The Plans lead paragraph moved **out of the body and into the header** as `Show description`.
4. Widths and gaps were standardised on the board's **322 / 12**. Plans no longer stretches four
   columns across the full row; it ends ~84px short of the right edge.
5. All ten columns became instances of one `Column` component, with content living in its Body slot.
6. Dashed borders were dropped everywhere except Handed to AI.
7. All column backgrounds were standardised on `--panel`, which made the transparent variant
   redundant and collapsed `Column` to two variants.

**Net effect**: a column is now the same object in both views — `header + body`, one background, one
border, one width, one padding, one gap. The only difference between a Board column and a Plans
column is which toggles the header carries and what goes in the body.

---

## The column setup to build

Two master components in the Figma file hold the intended arrangement. **These are the spec — build
to these, not to what the app does today.**

- **`board columns`** (node `13:17252`)
- **`plans columns`** (node `13:17251`)

Both are the same wrapper: a `main`-equivalent at padding `14 16 40 16`, holding a horizontal row of
columns at **gap 12**, each column **322** wide. Both rows come to **1992px**, so Plans is now a
six-column horizontal scroller exactly like the Board, rather than a four-track grid.

### Board — 6 columns

| # | Title | Style | Hint | Sort | Count | Description | Action | Filters |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Backlog | Default | — | ✓ | ✓ 4 | — | — | — |
| 2 | To do | Default | — | ✓ | ✓ 8 | — | — | — |
| 3 | Doing | Default | — | ✓ | ✓ 7 | — | — | — |
| 4 | Waiting review | Default | — | ✓ | ✓ 1 | — | — | — |
| 5 | Handed to AI | **Agent** (dashed) | — | ✓ | ✓ 2 | — | — | — |
| 6 | Done | Default | — | ✓ | ✓ 11 | — | — | — |

**The hint is off on every board column.** The `Hint` text is still populated ("no time pressure
yet", "two to four weeks out", …) but `Show hint` is false, so the subtitle beside the column name
goes away. In code that means `.col .hint` stops rendering on the Board.

### Plans — 6 columns

| # | Title | Style | Description | Action | Filters |
| --- | --- | --- | --- | --- | --- |
| 1 | Backlog | Default | "The agent leaves these alone. Held back by you, or excluded by a rule." | ✓ (Spend and clocks) | — |
| 2 | To do | Default | "What tonight's run picks up, in order." | ✓ (Run now) | — |
| 3 | **Doing** | Default | "Currently running" | — | — |
| 4 | Waiting for review | Default | "The agent's own column — what it has worked out, waiting on you. Drag out of it, not into it." | — | **✓** |
| 5 | **Ready to be produced** | Default | "Accepted as written. From here it feeds the execution board's Backlog." | — | — |
| 6 | **Done** | Default | "Completed" | — | — |

No hint, no sort, no count on any Plans column. Every one carries a description.

**Three of these are new work, not just restyling:**

- **`Doing`** — a column the Plans view does not have. It is the run that is happening now: what the
  planning agent has picked up and is working through. Today `13-plans.js` shows run state as a
  `Status` block inside the To do column (`14:28 — window open, 55 min left`); this promotes it to a
  column of its own.
- **`Ready to be produced`** — this is what the current `Done` column holds: accepted plans that
  feed the Execution board's Backlog. The rename says what it is rather than that it is finished.
- **`Done`** — genuinely finished, described as "Completed". A new terminal column after
  Ready to be produced.

So the Plans pipeline goes **Backlog → To do → Doing → Waiting for review → Ready to be produced →
Done**, mirroring the Board's six. That is a change to `agents/planning_agent` territory as much as to
the view: `stream.json` and `PACKAGES/work_streams/CONTRACT.md` define the states a plan can be in,
and two of these columns do not exist there yet. **Check the contract before building the view** —
per `CLAUDE.md`, the board asks and the stream writes, and nothing here writes another stream's
files.

### Difference between the two, in one line

Board columns show **sort + count**; Plans columns show a **description**, and two of them carry an
action button while one carries a Filters dropdown. Everything else — fill, border, radius, width,
gap, header padding, body padding, min-height — is identical.

---

## What this means in the code

Nothing below has been implemented. This is the translation of the above into this repo.

### Files that will carry the work

| File | Why |
| --- | --- |
| `kanban/board.css` | every rule listed below lives here |
| `kanban/index.html` | the header and filter bar markup |
| `kanban/js/07-render-board.js` | `cardHTML()` and the board's column rendering |
| `kanban/js/13-plans.js` | the Plans view: `.listcard`, `.qitem`, `.repitem.planitem`, filter tabs |
| `kanban/js/09-columns.js` | column definitions and the tier/column editor |
| `kanban/js/19-drawer.js` | the drawer's fields, `.dpbtn`, `.bucketbtn`, `.stepslider` |
| `kanban/js/27-execution.js` | the Execution view uses the same column shape — check it follows |
| `kanban/js/12-reports.js` | shares `.reportsview` / `.repitem` with Plans |

### Column skeleton (the biggest change)

Today the Board renders `.col > h2 + .drop` and Plans renders `.listcard > .cardhead + …`. Target:
**one column partial used by Board, Plans and Execution**, producing

```
.col            radius 12, background var(--panel), 1px solid var(--line), shadow, padding 0
  .colhead      padding 11px 13px 9px, border-bottom 1px var(--line-soft), min-height 41
                title · optional hint · optional sort · optional count · optional action · optional filters
                optional .colhead-desc paragraph (the Plans lead)
  .colbody      padding 9, display flex, column, gap 8
```

- `.lists.pview .listcard` loses `padding:14px 16px 16px` and becomes `.col`.
- `.help.listlead` moves inside the head.
- Delete `background:transparent` from `.col.waitcol`, `.col.donecol`, `.col.aicol`.
- Delete `border-style:dashed` from `.col.donecol`; keep it only on `.col.aicol`.
- Plans grid: columns 322 wide, gap 12 (currently a 4-track grid with gap 14).

### Card renderer

`cardHTML()` in `07-render-board.js`, the plan item markup in `13-plans.js`, `.qitem`, and the
`.chaincard` in the drawer should become **one renderer with flags** mirroring the Figma booleans:
`eyebrow`, `position`, `action`, `tags`, `meta`, `link`, `summary`, `progress`, `note`, `stripe`.

CSS consequences:

- `.repitem`, `.repitem.planitem`, `.qitem` and `.chaincard` collapse into `.card` plus modifiers.
- `.card.onething` → state `One thing`; `.repitem.agreed` → `Agreed`; `.repitem.actioned` and
  `.qitem.held` → `Dimmed`.
- Plan cards drop `border-top:3px solid var(--red)` for the shared left stripe, coloured only for
  `new` and done — see "Decisions taken". The comment above that rule needs rewriting.
- Queue cards lose their `--bg` fill and 10px radius (they become standard cards).
- Titles: one size and weight, 13.5px / 600-ish, replacing 14px/640 on `.reptitle` and
  13.5px/620 on `.qtitle`.

### Tag CSS

Collapse to two axes:

```
.tag                       /* solid neutral: chip background, ink-soft text */
.tag--outline              /* transparent, 1px border */
.tag--blue .tag--amber .tag--red .tag--green
```

and map the existing semantic classes onto them (`.tag.due.over` → `.tag--red`,
`.tag.ai-partial` → `.tag--outline.tag--amber`, and so on). **Delete `.tag.impact-high`** — it has no
visible effect on an emoji.

### Buttons

One `.btn` with `--outline`, `--ghost`, `--danger`, `--primary`, `--dashed` and a single `--small`
size. Fold in `.btn.mini`, `.addsub`, `.aic-addsub`, `.completeall`, `.qhold` with the small
normalisations listed in §4 above.

### Tabs

`.tab` gains an optional dot and an optional count, so `.tabs` in the header and `#bucketFilters`
share one class. `.tabs.planfilter` becomes `.tabs` with small tabs.

### Field controls

`input[type=text]`, `#q`, `select#aiFilter`, `.dpbtn`, `.bucketbtn` all get **min-height 33px** and
padding 5/9, matching `.btn`. Add a calendar glyph to `.dpbtn`.

### Already applied in this session

- **`kanban/index.html`**: `#urgentWrap` now sits **before** `#statusWrap` in the bucket bar, so the
  order reads Urgent or due → Status → AI can do → Search. This was a design change made in Figma
  first; it has a short comment explaining why it leads. Only `index.html` changed, so a **Reload**
  of the board tab is enough — no server restart.

---

## What worked

- **Measuring the live app rather than eyeballing.** Every value in the Figma file came from
  `getComputedStyle` on the running board, dumped via the Browser pane. Colours came from the
  `:root` custom properties, spacing and type from computed styles. The frames came out within a
  pixel or two of the app on first render.
- **`loadDemo()` + `state.locked = true`** as the standing safety posture. The board tab was locked
  for the whole session; the write guard recorded and blocked 35 non-GET requests, all routine
  `HEAD /data/todo.md` polling.
- **Tearing non-GET out of `fetch`** before unlocking, when the editable drawer was needed (the
  drawer renders read-only whenever `state.locked` is true, so it had to be unlocked to be drawn).
  This is the pattern `kanban/test_chats.mjs` already uses.
- **Rebuilding from the backup frames** whenever a Figma operation destroyed content. The untouched
  `Board — 1440×900 (backup)` paid for itself three times.

## What didn't work

Mostly Figma plugin API behaviour. All of these cost real time and are worth knowing if the design
file is edited by script again:

1. **`setProperties` with an `INSTANCE_SWAP` value takes the component's node id, not its key.**
   Passing `.key` throws "Property value is incompatible with component property type". The first
   pass over 19 cards silently landed default content because of this.
2. **Swapping a nested instance renames the layer** to the new component's name, so
   `findOne(n => n.name === 'Tag 2')` stops matching afterwards. Address slots **by position**, not
   by name, and rename them back.
3. **Text overrides applied in the same call as a swap get wiped.** The swap resolves lazily; the
   overrides have to be re-applied in a *later* execute call.
4. **Changing a variant on an instance empties its slot.** This destroyed the contents of five
   columns across two passes. Workaround that does work: stash the slot's children in a temp frame,
   switch the variant, append them back.
5. **`clone()` on a component containing a slot drops the slot**, leaving a plain frame. The slot has
   to be recreated with the slot API.
6. **Slots created via the API come with a white fill**, which showed up as two washed-out columns.
7. **Two instances ended up with corrupted slot references** after variant swaps — any read of
   `slot.children` threw "node … does not exist". The only fix was deleting and recreating the
   instance.
8. **A duplicate property name silently breaks binding.** Naming both a wrapper frame and its text
   node `Summary` made `componentPropertyReferences` fail with "Cannot attach 'TEXT' component
   property reference".
9. **A variant named without its property prefix breaks the whole set.** One variant was called
   `One thing` instead of `State=One thing`, which made every read of
   `componentPropertyDefinitions` throw "Component set has existing errors".
10. **Editing the same file by hand while a script runs loses work.** Three of my writes were undone
    by a ⌘Z landing mid-pass. For a broad sweep, the file needs to be hands-off.
11. **The frame kept growing past 1440 and losing `clipsContent`** whenever children were
    reparented. Reset both after any structural change.
12. **The Figma Desktop Bridge dropped twice**, mid-call both times. Recovery is
    Plugins → Development → Figma Desktop Bridge → Run.

## Key decisions

1. **Invented copy for the Plans view.**
   - *Why*: the Plans view reads the real `data/<dataset>/plans/` folder, so the screen was showing
     genuine overnight plans. Private content must not go into a shared design file.
   - *Alternative*: use the real text. Rejected on the `CLAUDE.md` rule that snapshots, tokens and
     task content are never published.
   - *Tradeoff*: the Plans frame is not a literal screenshot of any real run.

2. **Merge on the newest hand-made decision, not the oldest.**
   - Card titles took the plan card's Semi Bold rather than the task card's Medium, because the plan
     card had been redesigned by hand most recently.

3. **Accept small normalisations in exchange for fewer components.**
   - Button radii 4 → 6, dashed buttons 12.5 → 12px, queue cards losing their darker fill.
   - *Why*: the explicit instruction was "fold them and ignore the differences".

4. **One column background.**
   - The transparent fill on Waiting review / Handed to AI / Done was carrying the same meaning as
     the border, twice. With the dash reserved for Handed to AI, the second fill had no job.

5. **Columns stay frames in the two screens until the Body slot existed.**
   - Instances cannot take extra children, so a column with 11 cards could not be an instance. Once
     the Body became a real slot (done by hand in Figma), all ten columns became instances.

6. **The board's header style won for Plans, not the other way round.**
   - The board has six columns and 33 cards; the Plans view has four columns of prose. Matching the
     denser, more-used surface was the smaller change overall.

## Lessons & gotchas that matter for the code work

- **`.tag.impact-high` is dead.** Its content is an emoji; `color` never applies.
- **The drawer's two-column layout is a container query on `#dbody` at 700px**, not a viewport media
  query — the drawer is user-resizable. See the comment above `.dcols` in `board.css`.
- **The drawer renders read-only whenever `state.locked` is true** (`ro = state.locked`, twice in
  `19-drawer.js`). Any test that needs the editable drawer must neutralise writes another way.
- **Plan cards use a top border, not a left stripe**, and the comment in `board.css` explains why
  (`.repitem.planitem{border-top:3px solid var(--red)}` — "a plan is not the bucket, it's a proposal
  about one task in it"). Figma moved to a left stripe. **That comment needs updating or the decision
  reversing** — do not change it silently.
- **`.empty` is shared with the Reports view**; the boxed treatment is scoped
  `.lists.pview .reportsview .empty` on purpose. Keep that scoping when componentising.
- **`index.html` changes need only a Reload**; only `server.py` needs the process restarted.

## Current state

- ✓ **Working**: three Figma frames matching the app, built entirely from components; a 15-component
  library; backups of the Board and drawer frames in a `Backups` section; `index.html` filter-bar
  reorder verified in the browser.
- ⚠️ **Incomplete**: none of the Figma consolidation exists in the code yet. The Figma file also has
  two things the app does not: a Filters dropdown in the column header, and a calendar icon on date
  fields.
- ✗ **Broken**: nothing known. The Plans backup frame inside `Backups` holds detached frames (its
  instances lost their main components when the old card sets were deleted) — visually identical,
  and it is a frozen snapshot, so it was left alone.
- ❓ **Unknown**: whether the three new Plans columns (Doing, Ready to be produced, Done) need new
  states in the planning agent's stream contract, or whether they are views onto states that already
  exist. See "The column setup to build" above.

## Decisions taken (previously open)

**1. Plan cards use the left stripe, and colour is reserved.**
Every card in the file — task, plan, queue, dependency — carries the same 3px left stripe. The
`.repitem.planitem{border-top:3px solid var(--red)}` top border goes. On plan cards the stripe is
coloured **only for `new` and for done**:

| Plan card | Stripe |
| --- | --- |
| new | `--b1` `#6AA0FF` |
| handed over, accepted | `--green` `#6FD398` |
| read, planning again, everything else | `--line` `#363C45` |

Task cards keep the bucket colour. The red stripe disappears entirely. **The comment above
`.repitem.planitem` in `board.css` argues for the top border and for red — rewrite it, don't leave
it contradicting the code.** The new reasoning is that a plan is the same object as the task it is
about, so it gets the same stripe, and colour is spent only where it earns attention: something
arrived, or something is finished.

**2. The Plans column filters become a dropdown.**
The in-body row of filter chips (All 6 / new 3 / needs you 1 / read 2) is replaced by a single
dropdown in the column header, carrying the same options. Applies to Waiting for review on Plans,
and to Execution, which has the same four columns and the same filtering.

## Next steps

1. **Check the stream contract** against the three new Plans columns (Doing, Ready to be produced,
   Done) — `agents/planning_agent/stream.json` and `PACKAGES/work_streams/CONTRACT.md`. If they need
   new states, that lands before any view work.
2. **Do the column skeleton first** — one `.col` with `.colhead` + `.colbody`, used by Board, Plans
   and Execution. It is the change with the widest reach and everything else sits inside it.
3. **Then the card renderer**, collapsing `cardHTML()`, the plan item, `.qitem` and `.chaincard` into
   one function with the ten flags.
4. **Then the leaf CSS**: tags to two axes, buttons to one class with modifiers, tabs with optional
   dot and count, field controls to `min-height: 33px`.
5. **Run every suite afterwards** — the column and card markup is what most board tests assert
   against:
   ```
   python3 core/test_todo.py     node core/test_todo.mjs
   python3 agents/planning_agent/test_planning_agent.py
   python3 agents/implementing_agent/test_implementing_agent.py
   python3 companion/test_companion.py
   node kanban/test_plans.mjs    node kanban/test_execution.mjs
   node kanban/test_schedule.mjs node kanban/test_chats.mjs
   node kanban/test_projects.mjs node kanban/test_notes.mjs
   ```
6. **Log the leftovers in `IMPROVEMENTS.md`** rather than half-doing them.

**Blockers**: none technical. The two design questions in step 1 are the only thing that should
gate starting.

## Important files

- `kanban/board.css` — every rule named above; `:root` holds the palette the Figma `Colour`
  collection mirrors
- `kanban/index.html` — header and bucket bar markup; already carries the filter-bar reorder
- `kanban/js/07-render-board.js` — `cardHTML()`, the board's column rendering
- `kanban/js/13-plans.js` — `.listcard`, `.qitem`, `.repitem.planitem`, the Plans filter tabs, the
  empty states
- `kanban/js/09-columns.js` — column definitions, the tier editor
- `kanban/js/19-drawer.js` — drawer fields, `.dpbtn`, `.bucketbtn`, `ro = state.locked`
- `kanban/js/27-execution.js`, `kanban/js/12-reports.js` — share the column and `.repitem` shapes
- `kanban/demo.md` — the example list every Figma frame is drawn from
- `IMPROVEMENTS.md` — where anything deferred should land

---

## Automation opportunities

**Identified during this session:**

- **Measuring the live UI for design work.** Roughly a dozen bespoke `getComputedStyle` dumps were
  hand-written to pull geometry, type and colour out of the running board. → A small skill,
  something like `ui-measure`, that loads the board with `loadDemo()` + lock, takes a selector, and
  returns a normalised spec (box, type, colour, spacing, children). This was the single most
  repeated task of the session.
- **Safe board inspection.** The lock-then-load dance was repeated on every reconnect, and getting it
  wrong risks the live list. → Fold it into the same skill so it cannot be forgotten.
- **Figma bulk edits via the plugin API.** The swap/rename/override gotchas (§1–§7 above) were each
  rediscovered the hard way. → A helper module with `swapInstance()`, `setTextByPosition()` and
  `stashAndSwapVariant()` would remove the whole class of failure.
- **Design-to-code parity checks.** Comparing the Figma frame against the live DOM was entirely
  manual (screenshot, eyeball, re-measure). → Worth a check that walks a Figma frame and the live
  page and reports where padding, radius, colour or type disagree. This is close in spirit to
  `ds-parity`, which already does Figma-vs-code for the design system.

**Highest-value first:**

1. `ui-measure` — used a dozen times this session alone, and it is the thing that makes design work
   from the real app rather than from memory.
2. The Figma plugin-API helper module — turns seven known traps into three function calls.
3. Figma-vs-DOM parity check — the only way the code port in the next session can be verified
   without eyeballing screenshots.

**Existing tools that apply:**

- `mcp__figma-console__*` — the bridge everything in this session ran through
- `ds-parity` agent — the same shape of problem, already solved for the design system
- `improve-idea` — for logging anything deferred into `IMPROVEMENTS.md`

---

**Notes for the next session**

- The Figma file is the spec. Read the component properties rather than this document where the two
  disagree — the file was edited by hand between passes.
- Two backup frames live in the `Backups` section. Do not repoint them at the merged components;
  they are the record of what the app looked like before any of this.
- If you script Figma again, get the file to a hands-off state first. Three writes were lost to an
  undo landing mid-pass.
- This file is untracked and sits at the repo root. It contains no task content, but it does name
  internal structure — worth a look before it is committed.
