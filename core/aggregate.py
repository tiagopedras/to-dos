"""Turns a parsed todo.md into the fields agents/pa_agent/skills/pa/references/templates.md
documents, so a report is rendered from real arithmetic rather than typed out
by hand against the same rules every time.

See IMPROVEMENTS.md, "Every report the PA sends is rendered by hand, so the
templates are instructions rather than code." The arithmetic mostly already
existed, in two half-written, hand-agreeing copies: check_overdue() in
check_todo.py and the headline-first ranking in agents/plan-agent/pick.py. This is
the one copy, built on core/todo.py the way both of those already read the
file, and it produces the whole of a template's context — not asked to know
about Mustache, chevron or any particular skill.

Two things are deliberately not here. `checker_flags`, `slipped` and
`context_dates` — the "what the read turned up" fields templates.md marks as
desk-only — have no aggregation built yet: nothing in this file fakes them,
so a template asking for one gets an empty list rather than a wrong answer.
And the change-report fields (`changes`, `needs_you`, `pending_count`) are
never read from todo.md at all — they come from the session that made the
change, and the caller supplies them directly to core/render.py alongside
whatever this module returns.
"""

import datetime as dt
import re

import archive
import todo

# Top-level columns read verbatim off `column`, matching the board's own
# names rather than a slug — a renamed column would need renaming here too,
# the same cost every other string-matched column name in this repo carries.
DOING = "Doing"
WAITING = "Waiting for review"
BLOCKED = "Blocked"
BACKLOG = "Backlog"


def _fmt_long(date):
    return date.strftime("%A, %d %B %Y") if date else ""


def _fmt_short(date):
    return date.strftime("%a %-d %b") if date else ""


WAITING_ON_RE = re.compile(r"Waiting on:\s*([^,.\n]*)", re.I)


def _who(task):
    """From `[to:: ]`, or a `Waiting on:` note — the first clause of it,
    since the note itself is usually a full sentence about why."""
    if task.to:
        return task.to
    for line in task.body:
        m = WAITING_ON_RE.search(line)
        if m:
            return m.group(1).strip()
    return ""


def _row(task, today, due_override=None):
    due = due_override if due_override is not None else todo.parse_date(task.due)
    days = abs((due - today).days) if due else ""
    return {
        "title": task.title, "bucket": task.bucket, "state": task.column,
        "impact": task.impact, "effort": task.effort, "ai": task.ai,
        "due": _fmt_long(due), "due_short": _fmt_short(due),
        "days": days, "who": _who(task),
    }


def _meeting_row(task, today, due_override):
    row = _row(task, today, due_override)
    row["agenda_state"] = "written" if todo.agenda_topics(task) else "not written"
    return row


def _has_message(task):
    return bool(todo.messages(task, live_only=True))


def _actionable(task, slugs, today):
    if todo.is_blocked(task, slugs):
        return False
    start = todo.parse_date(task.start)
    return not (start and start > today)


def today_view(tasks, today=None):
    """Every "about today" field templates.md documents, minus the desk-only
    three named in this module's own docstring."""
    today = today or dt.date.today()
    open_tasks = [t for t in tasks if not t.done]
    slugs = todo.slug_states(tasks)
    horizon_week = today + dt.timedelta(days=(6 - today.weekday()))  # this Sunday
    week_start = today - dt.timedelta(days=today.weekday())

    overdue, due_today, due_tomorrow, due_this_week = [], [], [], []
    for t in open_tasks:
        if t.column == WAITING:
            # The work is done as far as he is concerned and it is sitting
            # with someone else — the date belongs to them now. Same
            # reasoning check_overdue() already applies, extended to every
            # date list here rather than only the overdue one: a "due today"
            # card sitting in Waiting for review is not actionable by him today
            # either.
            continue
        due = todo.effective_due(t, today)
        if not due:
            continue
        if due < today:
            overdue.append(_row(t, today, due))
        elif due == today:
            due_today.append(_row(t, today, due))
        elif due == today + dt.timedelta(days=1):
            due_tomorrow.append(_row(t, today, due))
        if today <= due <= horizon_week:
            due_this_week.append(_row(t, today, due))

    doing = [_row(t, today) for t in open_tasks if t.column == DOING]
    waiting = [_row(t, today) for t in open_tasks if t.column == WAITING]
    blocked = [_row(t, today) for t in open_tasks if t.column == BLOCKED]

    week = []
    for t in open_tasks:
        if t.week:
            week.append(_row(t, today))
        _, steps = todo.split_body(t)
        for s in steps:
            if not s["done"] and s["task"].week:
                st = s["task"]
                st.bucket, st.column = t.bucket, t.column
                week.append(_row(st, today))

    # counts_as_finished(), not t.done: a cancelled task is ticked, and
    # counting it says work was done that was not.
    done_today = [_row(t, today) for t in tasks
                  if todo.counts_as_finished(t) and t.done_on == today.isoformat()]

    quick_wins = []
    for t in open_tasks:
        if t.ai == "full" or t.column == BACKLOG:
            continue
        if not _actionable(t, slugs, today):
            continue
        if t.effort == "S" or _has_message(t):
            quick_wins.append(_row(t, today))

    delegate = sorted(
        (t for t in open_tasks if t.ai == "full"),
        key=todo.priority_score, reverse=True)
    delegate = [_row(t, today) for t in delegate]

    meetings_next_two_days, meetings_this_week = [], []
    for t in open_tasks:
        if not t.repeat:
            continue
        due = todo.effective_due(t, today)
        if not due:
            continue
        if today <= due <= today + dt.timedelta(days=1):
            meetings_next_two_days.append(_meeting_row(t, today, due))
        if today <= due <= horizon_week:
            meetings_this_week.append(_meeting_row(t, today, due))

    headline_task = next((t for t in open_tasks if t.headline), None)
    headline_age = ""
    headline_next_step = ""
    if headline_task:
        set_on = todo.parse_date(headline_task.headline)
        if set_on:
            headline_age = (today - set_on).days
        _, steps = todo.split_body(headline_task)
        nxt = next((s for s in steps if not s["done"]), None)
        if nxt:
            headline_next_step = nxt["task"].title

    return {
        "date": _fmt_long(today), "date_short": _fmt_short(today),
        "week_start": _fmt_short(week_start),
        "headline": headline_task.title if headline_task else "",
        "headline_bucket": headline_task.bucket if headline_task else "",
        "headline_age": headline_age,
        "headline_next_step": headline_next_step,
        "overdue": overdue, "due_today": due_today,
        "due_tomorrow": due_tomorrow, "due_this_week": due_this_week,
        "doing": doing, "waiting": waiting, "blocked": blocked,
        "week": week, "done_today": done_today,
        "quick_wins": quick_wins, "delegate": delegate,
        "meetings_next_two_days": meetings_next_two_days,
        "meetings_this_week": meetings_this_week,
        # Not built yet — see this module's own docstring.
        "checker_flags": [], "slipped": [], "context_dates": [],
        "overdue_count": len(overdue), "doing_count": len(doing),
        "waiting_count": len(waiting), "blocked_count": len(blocked),
        "week_count": len(week),
        "unscored_count": len([t for t in open_tasks if todo.unscored(t)]),
        "delegate_count": len(delegate),
    }


def meeting_view(tasks, title, today=None):
    """The fields meeting-prep needs for one named recurring task, or None
    when nothing matches — title matched loosely, the same way plan.py's
    own `--task` does, since he asks for a meeting by a shorthand rather
    than pasting the exact line."""
    today = today or dt.date.today()
    want = title.strip().lower()
    hit = next((t for t in tasks if t.title.strip().lower() == want), None)
    if not hit:
        hit = next((t for t in tasks if want in t.title.strip().lower()), None)
    if not hit:
        return None
    due = todo.effective_due(hit, today)
    return {
        "meeting": hit.title,
        "meeting_date_long": _fmt_long(due),
        "agenda": todo.agenda_topics(hit),
        "previous_agenda": todo.agenda_topics(hit, previous=True),
    }


def period_view(tasks, archive_path, start, end, buckets=None):
    """What finished between `start` and `end` (inclusive), live tasks and
    the archive both — the aggregation IMPROVEMENTS.md's written-reports
    entry asks for, pointed at a past window rather than at today. Live and
    archived are joined the same way completedRecently() in
    kanban/js/12-reports.js already does it, since a task ticked recently
    and one lifted into done-archive.md by ARCHIVE_DAYS are the same fact
    told from two files.

    `buckets`, when given, narrows both `completed` and `by_bucket` to those
    named — a report definition's own scope, applied here rather than left
    for the caller to filter afterwards, since filtering after the count
    would leave `by_bucket` naming buckets the report was never about.
    """
    def in_window(done_on):
        d = todo.parse_date(done_on)
        return bool(d and start <= d <= end)

    # Same rule as done_today above, and the same rule the board's own
    # archive collector applies — the archive is where a cancelled task ends
    # up, so it has to be asked there too.
    completed = [t for t in tasks
                 if todo.counts_as_finished(t) and in_window(t.done_on)]
    completed += [t for t in archive.read_archive(archive_path)
                  if todo.counts_as_finished(t) and in_window(t.done_on)]
    if buckets:
        completed = [t for t in completed if t.bucket in buckets]

    by_bucket = {}
    for t in completed:
        by_bucket[t.bucket] = by_bucket.get(t.bucket, 0) + 1

    rows = sorted(
        ({"title": t.title, "bucket": t.bucket, "tier": t.column,
          "effort": t.effort, "done_on": t.done_on} for t in completed),
        key=lambda r: r["done_on"])

    return {
        "completed": rows,
        "completed_count": len(rows),
        "by_bucket": [{"bucket": b, "count": n} for b, n in sorted(by_bucket.items())],
        "window_start": _fmt_long(start), "window_end": _fmt_long(end),
    }
