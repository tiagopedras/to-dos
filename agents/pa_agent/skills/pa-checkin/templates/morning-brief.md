---
name: morning-brief
use: the default. The daily check-in at the desk. Today first, then the rest of the week.
lines: 28
---
**{{date}}**

## The one thing

**{{headline}}** · {{headline_bucket}} · day {{headline_age}}
Next step: {{headline_next_step}}

## Late

{{#overdue}}
- **{{title}}** · {{days}}d over · {{bucket}}
{{/overdue}}
{{^overdue}}
Nothing overdue.
{{/overdue}}

## Today

{{#due_today}}
- **{{title}}** · {{bucket}}
{{/due_today}}
{{^due_today}}
Nothing dated today.
{{/due_today}}

{{#meetings_next_two_days}}
- {{due_short}} · **{{title}}** · agenda {{agenda_state}}
{{/meetings_next_two_days}}

## The rest of the week

{{#due_this_week}}
- {{due_short}} · **{{title}}** · {{impact}}/{{effort}}
{{/due_this_week}}
{{^due_this_week}}
Nothing else dated before Sunday.
{{/due_this_week}}

## Moving

In flight {{doing_count}} · waiting on someone {{waiting_count}} · blocked {{blocked_count}} · tagged this week {{week_count}}

{{#slipped}}
- Slipped · **{{title}}**, {{days}}d
{{/slipped}}

{{#context_dates}}
- {{what}} · {{when}}
{{/context_dates}}

{{#checker_flags}}
- {{flag}}
{{/checker_flags}}

{{unscored_count}} unscored.
