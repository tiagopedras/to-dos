---
name: week-ahead
use: Monday, or any time he asks what the week holds rather than what today holds.
lines: 30
---
**Week of {{week_start}}**

**{{headline}}** · {{headline_bucket}} · day {{headline_age}}

## Tagged this week ({{week_count}})

{{#each week}}
- **{{title}}** · {{bucket}} · {{impact}}/{{effort}} · {{state}}
{{/each}}
{{#none week}}
Nothing tagged yet. Worth picking before Tuesday.
{{/none}}

## Dated

{{#each overdue}}
- **{{title}}** · {{days}}d over
{{/each}}
{{#each due_this_week}}
- {{due_short}} · **{{title}}**
{{/each}}
{{#none due_this_week}}
Nothing dated before Sunday.
{{/none}}

## Meetings

{{#each meetings_this_week}}
- {{due_short}} · **{{title}}** · agenda {{agenda_state}}
{{/each}}
{{#none meetings_this_week}}
No standing meetings this week.
{{/none}}

## Worth clearing

{{#each quick_wins}}
- **{{title}}** · {{bucket}}
{{/each}}

{{#each delegate}}
- Claude could take **{{title}}**
{{/each}}

Waiting on someone {{waiting_count}} · blocked {{blocked_count}} · unscored {{unscored_count}}
