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

{{#each overdue}}
- **{{title}}** · {{days}}d over · {{bucket}}
{{/each}}
{{#none overdue}}
Nothing overdue.
{{/none}}

## Today

{{#each due_today}}
- **{{title}}** · {{bucket}}
{{/each}}
{{#none due_today}}
Nothing dated today.
{{/none}}

{{#each meetings_next_two_days}}
- {{due_short}} · **{{title}}** · agenda {{agenda_state}}
{{/each}}

## The rest of the week

{{#each due_this_week}}
- {{due_short}} · **{{title}}** · {{impact}}/{{effort}}
{{/each}}
{{#none due_this_week}}
Nothing else dated before Sunday.
{{/none}}

## Moving

In flight {{doing_count}} · waiting on someone {{waiting_count}} · blocked {{blocked_count}} · tagged this week {{week_count}}

{{#each slipped}}
- Slipped · **{{title}}**, {{days}}d
{{/each}}

{{#each context_dates}}
- {{what}} · {{when}}
{{/each}}

{{#each checker_flags}}
- {{flag}}
{{/each}}

{{unscored_count}} unscored.
