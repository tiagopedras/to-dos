# My To-Do list

Last updated: 2026-08-23

## How this works

This is example data. It is not anybody's real list — every name, project and
date below is invented, and it exists so the board has something to render when
the real `data/todo.md` is not there. Nothing here can be edited or saved.

Four buckets, three states inside each. Tasks carry an impact, an effort and a
delegation tag. Steps that mean contacting somebody carry the message already
written, and steps handed to Claude carry the prompt.

---

## 1. People

### Waiting review

### Doing

- [ ] **Run Alex Rivera's probation review** [impact:: high] [effort:: L] [due:: 2026-09-11] [ai:: partial] `headline:2026-08-17`
  - Six month mark. The pack has to be with HR a week before the conversation.
  - [x] Book the review conversation [due:: 2026-08-14] [ai:: none] `done:2026-08-13`
  - [ ] Ask Alex for their list of achievements [due:: 2026-08-26] [ai:: none] `week`
    - Suggested message: "Hey Alex 👋 Your six month review is coming up on the 11th. Could you send me a short list of what you are proudest of since you joined, and anything you want to talk through? Three or four bullets is plenty, no need to write an essay."
  - [ ] Collect the 360 responses into one pack [due:: 2026-09-02] [ai:: full] `rank:1` `blocked-by:alex-360`
    - Prompt: "Take the 360 feedback responses for Alex Rivera in [path] and group them into strengths, areas to develop and direct quotes worth reading back. Keep every quote verbatim, do not summarise them, and flag anything that contradicts another response."
  - [ ] Write the review and send it to HR [due:: 2026-09-04] [ai:: partial]
    - Suggested message (draft): "Hey 👋 Alex's six month review pack is attached, ready for the conversation on the 11th. Shout if you need anything else from me before then."
    - Draft because it carries a probation outcome. Read it against the final pack before sending.

- [ ] **Chase the 360 responses** [impact:: med] [effort:: S] [due:: 2026-08-25] [ai:: none] `#alex-360`
  - Three of six are in. The two on the Web team are the ones holding it up.
  - [ ] Nudge Priya and Sam [due:: 2026-08-25] [ai:: none] `week`
    - Suggested message: "Hey 👋 Quick nudge on the 360 for Alex, I still need yours to close the pack. It is five questions and takes about ten minutes. Could you get it back to me by Tuesday? Happy to talk it through if that is easier than writing it."

### To do

- [ ] **Set up monthly growth conversations with the team** [impact:: high] [effort:: M] [ai:: none]
  - Separate from 1:1s on purpose. 1:1s have become status updates.
  - [ ] Draft the shape of the conversation [ai:: partial] `week`
  - [ ] Put the recurring slots in [ai:: none] `start:2026-09-01`

- [ ] **Decide whether to open the mid-weight design role** [impact:: high] [effort:: S] [due:: 2026-09-15] [ai:: none]
  - Budget is confirmed, the question is whether the team needs breadth or depth.

### Backlog

- [ ] **Rewrite the design career framework** [impact:: med] [effort:: L] [ai:: partial]
  - Deferred until the probation round is finished. Revisit 2026-10-01.

---

## 2. Design oversight

### Waiting review

### Doing

- [ ] **Unblock the checkout redesign** [impact:: high] [effort:: M] [due:: 2026-08-21] [ai:: none] `#checkout`
  - Jordan has two competing directions and no way to choose between them.
  - [ ] Sit with Jordan and pick a direction [due:: 2026-08-21] [ai:: none]
  - [ ] Share the decision with the Web team [ai:: partial] `blocked-by:checkout`
    - Suggested message: "Hey 👋 We have landed on a direction for checkout, the single page flow rather than the stepped one. Jordan is picking the screens back up this week, and I will share them at Thursday's review."

- [ ] **Review the onboarding flow before it ships** [impact:: high] [effort:: S] [due:: 2026-08-28] [ai:: none] `week`

### To do

- [ ] **Write up how design reviews should run** [impact:: med] [effort:: M] [ai:: full] `rank:3`
  - Prompt: "Read the notes in [path] and draft a one page guide to how our design reviews run: who comes, what gets shown, what a reviewer is expected to leave with. Keep it to one page and write it as guidance rather than rules."

### Backlog

- [ ] **Audit which projects have no design owner** [impact:: med] [effort:: S] [ai:: partial]

---

## 3. Design System

### Waiting review

- [ ] **Send the Q3 design system review pack to Anu** [impact:: high] [effort:: S] [ai:: none]
  - Went over on the 21st. Nothing to do until it comes back with comments.

### Doing

- [ ] **Close the Figma against code gap on buttons** [impact:: high] [effort:: M] [due:: 2026-09-04] [ai:: partial]
  - Stream: audits.
  - [ ] Pull a fresh snapshot [due:: 2026-08-27] [ai:: full] `rank:2`
    - Prompt: "Run the ds-snapshot skill from the ds-snapshots folder to capture today's library, then tell me which button variants exist in Figma and not in Storybook. Do not compare against an old snapshot, take a new one first."
  - [ ] Agree the naming with the Web team [ai:: none] `blocked-by:checkout`

### To do

- [ ] **Document the form components** [impact:: med] [effort:: L] [ai:: full] `rank:4`
  - Stream: documentation.
  - Prompt: "Write usage documentation for the text input, select and checkbox components into ds-docs/component-docs/, following the GOV.UK Design System structure. Use only GOV.UK, the ARIA Authoring Practices Guide and WCAG 2.2 as sources, and leave a gap marked [fill in] rather than inventing product specific guidance."

- [ ] **Run a token clean-up pass** [impact:: low] [effort:: M] [ai:: partial]
  - Stream: improvements.

### Backlog

- [ ] **Move the icon set onto variables** [impact:: low] [effort:: L] [ai:: partial]

---

## 4. Strategic

### Waiting review

### Doing

- [ ] **Draft the design team plan for next quarter** [impact:: high] [effort:: L] [due:: 2026-09-30] [ai:: partial]
  - [ ] Pull last quarter's numbers together [ai:: full] `rank:5`
    - Prompt: "Summarise the adoption numbers in [path] into five sentences I can put in front of the leadership team. Say what moved, what did not, and what the honest read is. Do not pad it with recommendations."

### To do

- [ ] **Test whether AI review speeds up design QA** [impact:: med] [effort:: M] [ai:: partial]

### Backlog

- [ ] **Rethink how the team shares work in progress** [impact:: low] [effort:: S] [ai:: none]

---

## Context

Standing facts, not tasks.

### My team

- Alex Rivera, mid-weight designer, joined 2026-03-11, probation review due
- Priya Shah, senior designer, leads the Web squad
- Sam Okafor, product designer, shared with the Growth team
- Jordan Lee, junior designer, on the checkout redesign

### Around me

- Priya is on leave `until:2026-09-07`
- The Web team's design review runs every Thursday

### Dates that are not mine to move

- Alex's probation conversation is `on:2026-09-11`
- The quarter closes `on:2026-09-30`

### How I want messages and prompts written

- Open with `Hey [name] 👋` to one person, `Hey 👋` to a group. Nothing after it.
- Two or three sentences. Commas rather than em dashes.
- Anything about probation, performance or salary is a draft, never ready to send.

### Spelling

- Northwind, not Northwynd. Rivera, not Riviera.
