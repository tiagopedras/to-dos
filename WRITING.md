# Writing for the person reading

Twelve rules for anything written to be read by the owner of this board: a plan,
a report, a note on a task, a reply in a session. They came out of marking up one
real plan, `Build the five AI skills for the design team`, which ran to 1,547
words he never finished reading. Every before below is a real sentence from it.

They are about the reader rather than about a house style. A plan that hides its
question inside a paragraph, or explains something the reader already knows, or
ends three clauses after its point, is harder to act on whoever wrote it and
whoever reads it. So this file ships with the repo, and a personal layer on top
of it (spelling, vocabulary, how a message opens) lives outside it.

`agents/planning_agent/check_plan.py` enforces the part of this that can be
counted. The rest is read and applied.

## The twelve

**1. Don't quote my own rules back at me as justification.**

- Before: "Drafted and not installed, because the prompt it came from says show the structure first."
- After: "Drafted only."

**2. Anything you need from me is written as a question, with a question mark.**

- Before: "Whether screen generation is one skill with a wireframe mode or two skills."
- After: "Is screen generation one skill with a wireframe mode, or two skills?"

**3. If I have to do a thing, say the thing.**

- Before: "The handover format is still unwritten. Cheapest route: run prompt 3 with nothing attached..."
- After: "You need to write the handover format. Quickest way: run prompt 3 against two recent handovers. Don't forget to edit the section list it proposes."

**4. End the sentence where the point ends. No trailing extra clause.**

- Before: "design.md is already skill-shaped, frontmatter and all, with assets/twinkl-brand.css carrying the load."
- After: "design.md is already skill-shaped."

**5. No announcement before the content. Say the content.**

- Before: "One catch, its own description scopes it to pages made outside twinkl-web..."
- After: "A design.md file already exists ({file url here}), which unblocks '{task name}'."

**6. A technical word gets a plain equivalent or gets cut.**

- Before: "the Claude skill is a thin wrapper around it"
- After: "the Claude skill just loads that file and asks the questions."

**7. Never state a thing and then restate it by denying the opposite. Pick one clause and stop.**

- Before: "a thin wrapper, no new guidance"
- After: "it adds nothing of its own."

**8. Don't prescribe how long my answer should be.**

- Before: "Confirm the reading above, one line."
- After: "Is the reading above right?"

**9. A bold lead-in describes the whole bullet, and carries a verb.**

- Before: "Step 1, the Claude prototype skill."
- After: "Step 1, the Claude prototype skill is drafted."

**10. Don't explain things I already know.**

- Before: "Its structure, which is the thing to look at: frontmatter claiming product screens and flows explicitly and ruling out readouts, then six sections. What it is for. At most four questions, asked once and grouped, which surface and who opens it..."
- After: "How it works: it asks up to four questions. Which surface and who opens it, the one job the screen has to do, which states matter, desktop or mobile first."

**11. If it is a list, make it a list.**

- Before: four passes run together in a paragraph.
- After: a numbered list, one line each, no connecting prose.

**12. A spec line can be a fragment.**

- Before: "Output, one HTML file plus the stylesheet, and a closing note saying what was assumed and what was left."
- After: "Output: HTML file + CSS + closing note saying what was assumed or left."
