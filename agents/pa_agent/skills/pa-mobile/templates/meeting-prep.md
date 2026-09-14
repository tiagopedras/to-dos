---
name: meeting-prep
use: he named a standing meeting and wants its agenda, ready to paste.
lines: 16
---
{{meeting_date_long}}

Agenda
{{#agenda}}
- {{topic}}
  - {{context}}
{{/agenda}}
{{^agenda}}
- Not written yet.
{{/agenda}}

{{#previous_agenda}}
Last time · {{topic}}
{{/previous_agenda}}
