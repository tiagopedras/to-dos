# Source: Jamie

Jamie sits in his calls, records them, and writes down who agreed to do what. It is
the source this skill was built against and, as of 27 Aug 2026, the only one
configured.

## Connecting

An MCP server at `https://mcp.meetjamie.ai/mcp`. `claude mcp list` shows it as
**claude.ai Jamie**. If it is missing:

```bash
claude mcp add --transport http jamie https://mcp.meetjamie.ai/mcp
```

The tools come through with a `mcp__claude_ai_Jamie__` prefix and their schemas are
deferred, so fetch them before the first call:

```
ToolSearch("select:mcp__claude_ai_Jamie__list_meetings,mcp__claude_ai_Jamie__list_tasks,mcp__claude_ai_Jamie__get_meeting,mcp__claude_ai_Jamie__update_task")
```

## Answering the contract

**Listing a window.** `list_tasks` takes ISO `startDate` and `endDate` and returns
every action item in that range with its text, its `completed` flag, its assignee
and the `meetingId` and `meetingTitle` it came from. `list_meetings` takes the same
range and returns the calls themselves.

Keep each task's own id from that response and carry it through the review. It is
what `update_task` needs at the end, and going back for it after the fact means a
second pull and a guess at which returned row was which.

Call both, in the same message, since neither depends on the other. `list_meetings`
is what lets the report name the calls that produced nothing, and that line is the
difference between "no tasks for you" and "no tasks for you, and here is the proof
I looked."

Use whole UTC days: `2026-08-27T00:00:00Z` to `2026-08-27T23:59:59Z`. Both
paginate, so follow `nextCursor` until it comes back null. A busy day will not fit
in one page, and a truncated pull that reads as complete is worse than no pull.

**Naming the assignee.** Each task carries an `assignee` object with `name` and
`email`. The email is `null` for plenty of people, so the name is the only field
that is reliably there.

**Recognising him.** He is `Tiago Pedras`, `tiagopedras@gmail.com`. That is his
personal address rather than his Twinkl one, because the recorder joins under the
account that owns the Jamie subscription. Match on either field.

**Getting more context.** `get_meeting` with the `meetingId` returns the summary,
the participants, the tags and the full task list for one call, with a long
transcript truncated inline. `get_meeting_transcript` reads the whole thing in
order, a page at a time, following `nextCursor` until `isFinal`.
`search_meetings` finds a call by what was said in it, which is the way in when he
describes a meeting rather than naming it.

**Provenance.** `meetingTitle` plus the date off `startTime`, written as a short
note: "From the DS-Design WG on 27 Aug." Titles carry emoji, so strip them.

**Closing it.** `update_task` sets the completed flag on one task by its id. Fetch
its schema with the others before the first call and read the field names off it
rather than assuming them — it is the one write tool this skill uses and it is
worth being sure about. One call per task, after the list has been written.

## What this source gets wrong

**It writes summaries, not instructions.** "Address the design system board task
regarding read-only states" is a description of a moment in a conversation. Expect
to rewrite every task before showing it to him, and expect the specifics — a name,
a file, a board, a date — to be the part worth keeping.

**It circles.** A subject discussed three times comes back as three tasks in three
wordings. Merging them is normal, not an edge case.

**It assigns to whoever was named out loud.** A task saying "send Tiago the file"
is somebody else's, however much it concerns him.

**It marks things complete.** Tasks ticked in the meeting come back with
`completed: true` in the same list as the open ones, so filter on it rather than
assuming everything returned is outstanding.

## What not to call

`create_tasks`, `update_tag`, `upsert_template` and the rest of the write tools.
Creating an action item in Jamie makes it a second plan, and the list is the plan.

`update_task` is the one exception, and only to tick something off. Never to edit a
task's text, its assignee or its due date — the rewriting happens on the way into
todo.md and Jamie keeps the wording the meeting actually produced.
