---
name: morning-brief
use: the default. He has opened the app and wants to know what today looks like.
lines: 12
---
{{date_short}}

**{{headline}}** · day {{headline_age}}
Next: {{headline_next_step}}

{{#each overdue}}
Late · {{title}}, {{days}}d
{{/each}}
{{#none overdue}}
Nothing overdue.
{{/none}}

Due this week
{{#each due_this_week}}
- {{due_short}} · {{title}}
{{/each}}

{{#each meetings_next_two_days}}
{{due_short}} · {{title}}, agenda {{agenda_state}}
{{/each}}
