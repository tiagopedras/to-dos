---
name: pa-reports
description: Produce a report off the owner's master to-do list, at Code/to-dos/data/<dataset>/todo.md (<dataset> named by data/.current, currently "twinkl"), and send it to him. Holds a catalogue of report types, and grows one entry at a time. Today it has one — a phone-sized screenshot of the Weekly pace chart (tasks finished per week, per bucket) off the board's Reports view. Use whenever he asks for a screenshot or image of the pace chart, the achieved or finished tasks chart, "how many tasks did I finish this week" as a picture, a chart to share or post, or any report type listed in this skill. Read-only; it never writes todo.md. Do not use it for the written monthly report in data/<dataset>/reports/ (see README.md's rules for writing a report), for the morning brief, which is pa-checkin, or for what the overnight agents did, which is agents-report.
---

# PA reports

Makes one report off the list and sends it with SendUserFile. Every report here only reads; nothing in this skill writes `todo.md` or any other file under `data/`.

**Read `~/Code/to-dos/agents/pa_agent/PA.md` first** for where the list lives.

## Report types

| Type | What he gets | How |
| --- | --- | --- |
| `weekly-pace` | PNG of the Weekly pace chart at phone width: title, subtitle, the chart, week labels and totals, the bucket key. | `board_shot.mjs --view reports --from .trendhead --to .trendkey` |

When he asks for something not in this table, say so and ask whether to add it. A new type is a new row plus, if it needs one, a new script beside `board_shot.mjs`.

## Screenshot types

Everything captured off the board goes through `scripts/board_shot.mjs`. It blocks every save before the board loads and locks the tab, so the real list is safe to read. Write the image into the session's scratchpad, never into the repo or `data/`.

```bash
node ~/Code/to-dos/agents/pa_agent/skills/pa-reports/scripts/board_shot.mjs \
  --view reports --from .trendhead --to .trendkey --width 390 \
  --out <scratchpad>/weekly-pace-$(date +%F).png
```

- **Width:** 390 unless he names a device or asks for desktop (then 1400).
- **Server not running:** the script says so. Tell him to open To-Do Board.app; don't start the server yourself.
- **`"overflow": true` in the output:** the page is wider than the screen at that width. Read the image before sending. If the chart is cut off, tell him what is cut and don't send it.
- **A test Chrome still holding a port** makes the connection fail: `pkill -f "remote-debugging-port=94"`, then retry once.

Read the PNG before sending it, then send it with a caption naming the report, the width and the dataset.

Log the sitting with `skills/pa/scripts/log_sitting.py`, as PA.md says every `pa-*` skill does.
