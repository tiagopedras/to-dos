---
name: week-ahead
use: Monday morning, or any time he asks what the week holds.
lines: 16
---
Week of {{week_start}}

**{{headline}}**

This week ({{week_count}})
{{#each week}}
- {{title}} · {{impact}}/{{effort}}
{{/each}}
{{#none week}}
- Nothing tagged yet.
{{/none}}

Dated
{{#each due_this_week}}
- {{due_short}} · {{title}}
{{/each}}

Meetings
{{#each meetings_this_week}}
- {{due_short}} · {{title}}, agenda {{agenda_state}}
{{/each}}
