# The phone templates

One file per kind of report, written for a phone screen. `pa-mobile` reads this
whole folder at the start of a session and picks one, so adding a file here is
the whole of adding a report shape.

**These are yours.** The wording, the order, the headings and the length are all
decisions the template makes rather than the skill, so changing a line here
changes what comes out on your phone tomorrow morning.

The syntax, the blocks and every field you can fill are documented once, in
[../../pa/references/templates.md](../../pa/references/templates.md). Read that
before writing a new one.

## Which wins

A filename here that also exists under another skill's `templates/` is the phone
version of it, and it wins whenever the session is on a phone. Three exist in
both places: `morning-brief` and `week-ahead`, the phone cuts of the desk briefs
in `pa-checkin`, and `change-report`, the reply after the list has been changed,
whose desk copy lives in `pa/templates/`. The phone cut of that one is shorter
and drops the Reload line, since a phone is not where the board is open.

The rest here have no desk twin, which is fine: `one-thing`, `end-of-day` and
`meeting-prep` are answers you want in a corridor and would not ask for sitting
down.

`pa-mobile` never falls back to a desk template. Where it has no twin for the
report it needs, it says so and asks, because rendering a desk brief on a phone
turns a two-line answer into three screens.
