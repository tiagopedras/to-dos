---
name: end-of-day
use: evening. What moved today, and what tomorrow opens with.
lines: 12
---
{{date_short}}

Ticked
{{#each done_today}}
- {{title}}
{{/each}}
{{#none done_today}}
- Nothing today.
{{/none}}

Still in Doing
{{#each doing}}
- {{title}}
{{/each}}

{{#each due_tomorrow}}
Due tomorrow · {{title}}
{{/each}}

Tomorrow opens with {{headline}}.
