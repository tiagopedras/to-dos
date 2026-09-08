---
name: change-report
use: he asked for a change on his phone and it has been made.
lines: 6
---
{{#each changes}}
- {{summary}}
{{/each}}

**Needs you**
{{#each needs_you}}
- {{summary}}
{{/each}}

{{pending_count}} topics pending.
