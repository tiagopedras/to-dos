---
name: week-ahead
use: Monday morning, or any time he asks what the week holds.
lines: 16
---
Week of {{week_start}}

**{{headline}}**

This week ({{week_count}})
{{#week}}
- {{title}} · {{impact}}/{{effort}}
{{/week}}
{{^week}}
- Nothing tagged yet.
{{/week}}

Dated
{{#due_this_week}}
- {{due_short}} · {{title}}
{{/due_this_week}}

Meetings
{{#meetings_this_week}}
- {{due_short}} · {{title}}, agenda {{agenda_state}}
{{/meetings_this_week}}
