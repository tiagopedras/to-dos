---
name: change-report
use: the default. He asked for a change to the list and it has been made.
lines: 10
---
{{#each changes}}
- {{summary}}
{{/each}}

**Needs you**
{{#each needs_you}}
- {{summary}}
{{/each}}

{{pending_count}} topics pending.

Press **Reload** on the board.
