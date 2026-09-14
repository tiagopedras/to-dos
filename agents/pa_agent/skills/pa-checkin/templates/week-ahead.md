---
name: week-ahead
use: Monday, or any time he asks what the week holds rather than what today holds.
lines: 30
---
**Week of {{week_start}}**

**{{headline}}** · {{headline_bucket}} · day {{headline_age}}

## Tagged this week ({{week_count}})

{{#week}}
- **{{title}}** · {{bucket}} · {{impact}}/{{effort}} · {{state}}
{{/week}}
{{^week}}
Nothing tagged yet. Worth picking before Tuesday.
{{/week}}

## Dated

{{#overdue}}
- **{{title}}** · {{days}}d over
{{/overdue}}
{{#due_this_week}}
- {{due_short}} · **{{title}}**
{{/due_this_week}}
{{^due_this_week}}
Nothing dated before Sunday.
{{/due_this_week}}

## Meetings

{{#meetings_this_week}}
- {{due_short}} · **{{title}}** · agenda {{agenda_state}}
{{/meetings_this_week}}
{{^meetings_this_week}}
No standing meetings this week.
{{/meetings_this_week}}

## Worth clearing

{{#quick_wins}}
- **{{title}}** · {{bucket}}
{{/quick_wins}}

{{#delegate}}
- Claude could take **{{title}}**
{{/delegate}}

Waiting on someone {{waiting_count}} · blocked {{blocked_count}} · unscored {{unscored_count}}
