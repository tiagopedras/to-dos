---
name: meeting-prep
use: he named a standing meeting and wants its agenda, ready to paste.
lines: 16
---
{{meeting_date_long}}

Agenda
{{#each agenda}}
- {{topic}}
  - {{context}}
{{/each}}
{{#none agenda}}
- Not written yet.
{{/none}}

{{#each previous_agenda}}
Last time · {{topic}}
{{/each}}
