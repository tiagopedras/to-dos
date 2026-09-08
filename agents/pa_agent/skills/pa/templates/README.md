# The change templates

The shape of the reply you get after the list has been changed. `pa` reads this
whole folder and picks one by its `use:` line, so adding a file here is the whole
of adding a new shape.

**These are yours.** The wording, the order, the headings and the length are all
decisions the template makes rather than the skill. `lines:` is the hard ceiling,
and it is the one to move when a reply is coming back longer than you wanted.

`change-report.md` is the only one, and it covers every change: a tick, a date, a
new task, a re-score, a batch handed over by another `pa-*` skill. Adding tasks
reads the same because the extra detail rides inside each `summary` rather than
needing a shape of its own.

Two parts of it are load-bearing rather than decorative:

- **`Needs you` disappears with its list.** A plain line above an `{{#each}}`
  block is that block's heading, so an empty `needs_you` takes the heading with
  it. That is what keeps the heading off the nine replies out of ten where
  nothing needs you.
- **The pending line is a count and never a list.** There is no field holding
  what the topics are, on purpose. Ask, and you get them one at a time.

`pa-mobile` holds a twin of the same filename, six lines rather than ten and no
Reload line, since a phone is not where the board is open. So a change here
changes the desk reply and leaves the phone alone, and a change you want in both
has to be written in both.

The syntax, the blocks and every field you can fill are documented once, in
[../references/templates.md](../references/templates.md). Read that before
writing a new one.

Reports you read rather than changes you asked for live elsewhere: the morning
brief and the week ahead are in `pa-checkin/templates/`, and the phone cuts of
those are in `pa-mobile/templates/`.
