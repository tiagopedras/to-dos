---
name: end-of-day
use: evening. What moved today, and what tomorrow opens with.
lines: 12
---
{{date_short}}

Ticked
{{#done_today}}
- {{title}}
{{/done_today}}
{{^done_today}}
- Nothing today.
{{/done_today}}

Still in Doing
{{#doing}}
- {{title}}
{{/doing}}

{{#due_tomorrow}}
Due tomorrow · {{title}}
{{/due_tomorrow}}

Tomorrow opens with {{headline}}.
