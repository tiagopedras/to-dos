# Source: Jamie

Jamie sits in his calls, records them, and writes down who agreed to do what. It is
the source this skill was built against and, as of 27 Aug 2026, the only one
configured.

## Connecting

An MCP server at `https://mcp.meetjamie.ai/mcp`, added locally as **jamie**. The
tools come through with a `mcp__jamie__` prefix and their schemas are deferred, so
fetch them before the first call:

```
ToolSearch("select:mcp__jamie__list_meetings,mcp__jamie__list_tasks,mcp__jamie__get_meeting")
```

If that returns nothing, the tools are not published to the session and no amount
of retrying will change it. MCP servers are enumerated when a session starts, so a
server added mid-session never appears in it. Check `claude mcp list` and start a
fresh session in `~/Code/to-dos`, since the server is registered at local scope and
does not exist in other directories.

**`claude mcp list` saying "Connected" is not proof the tools are usable.** It went
wrong exactly this way on 1 Sep 2026: an orphaned claude.ai connector answered the
health check for days, advertised `hasTools: true`, and published nothing to any
session, while the connector itself had vanished from the account's UI. Connected
means the endpoint replied. Only a successful ToolSearch means the tools are there.
If it needs re-adding:

```bash
claude mcp add --transport http jamie https://mcp.meetjamie.ai/mcp
```

then authenticate it with `/mcp` from an interactive terminal.

## Answering the contract

**Listing a window.** `list_tasks` takes ISO `startDate` and `endDate` and returns
every action item in that range with its text, its `completed` flag, its assignee
and the `meetingId` and `meetingTitle` it came from. `list_meetings` takes the same
range and returns the calls themselves.

Each task carries a `createdAt`, which is when Jamie wrote the item up rather than
when the meeting ran. **That is the field the watermark compares against.** The two
come apart whenever a late call is processed the next morning, and filtering on the
meeting time instead would drop exactly those.

`startDate` and `endDate` filter on the meeting's date, not on `createdAt`, so pull
a little wider than the watermark and filter the returned rows yourself.

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

**There is no `update_task`.** It appeared in the old claude.ai connector's tool
list and does not exist on this server, checked 1 Sep 2026. Nothing here can tick a
Jamie action item off, which is why the skill tracks what it has seen with a
watermark instead of closing things. Jamie's own list stays as it is and is not
worth maintaining.
