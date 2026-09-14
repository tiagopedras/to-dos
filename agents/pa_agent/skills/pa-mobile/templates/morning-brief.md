---
name: morning-brief
use: the default. He has opened the app and wants to know what today looks like.
lines: 12
---
{{date_short}}

**{{headline}}** · day {{headline_age}}
Next: {{headline_next_step}}

{{#overdue}}
Late · {{title}}, {{days}}d
{{/overdue}}
{{^overdue}}
Nothing overdue.
{{/overdue}}

Due this week
{{#due_this_week}}
- {{due_short}} · {{title}}
{{/due_this_week}}

{{#meetings_next_two_days}}
{{due_short}} · {{title}}, agenda {{agenda_state}}
{{/meetings_next_two_days}}
