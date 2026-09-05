#!/usr/bin/env python3
"""What the companion thinks is owed today.

Kept apart from the menu bar app on purpose: this half is plain data in, plain
data out, so it can be run and read at a terminal without an app bundle, a
status icon or a notification permission anywhere in the way:

    python3 companion/digest.py            what is owed today
    python3 companion/digest.py 2026-09-07 what would be owed on that day

The format knowledge is not here — that is core/todo.py, which every reader of
the list shares.
What is here is the policy, and the policy is one question: which tasks are
actually owed today, as opposed to merely carrying a date.

Three things take a task out, all three matching what the board's Quick wins
view already does, because two views of one list disagreeing about what is
actionable is worse than either answer:

  - Waiting review and Blocked. Both mean the next move belongs to somebody
    else. Nothing is owed on them until they come back, so a notification about
    one is a notification he can do nothing with.
  - An unticked `blocked-by:`. The blocker is the real task; this one is not
    startable and saying so at 08:30 is noise.
  - Sub-steps. A step has no state of its own, it inherits its parent's, so
    counting steps would count the same work twice.

`start:` is deliberately ignored. It says the earliest work can begin, and a
task whose deadline has arrived is owed whether or not its start date has —
those two disagreeing is a tagging mistake worth seeing, not one worth hiding.

It also collects the suggested messages waiting to be sent — see read_messages
below. That is a second question and it is here for the same reason as the
first: what stalls a contact step for days is writing the opening line, not
doing the thing, and a message already sitting in the menu turns a five minute
task into a ten second one.

Both are read-only, which is the whole of what this process is allowed to be.
"""

import datetime as dt
import hashlib
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "core"))
import todo  # noqa: E402

# The one list this watches. It reads data/twinkl/ by name rather than following
# data/.current, which is the pointer the board's dropdown moves: switching the
# board to another list for ten minutes should not silently change what gets
# notified tomorrow morning. One list, chosen here, until there is a reason for
# a second.
DATASET = "twinkl"

PARKED_COLUMNS = {"waiting review", "blocked"}


class Digest:
    def __init__(self, day):
        self.day = day
        self.overdue = []      # deadline gone, still open
        self.today = []        # due today
        self.headline = None   # the one thing, whatever its date
        self.parked = 0        # open, dated, but sitting with someone else
        self.messages = []     # contact steps with a message ready to copy
        self.error = None      # the file could not be read

    @property
    def count(self):
        return len(self.overdue) + len(self.today)

    def line(self):
        """The one sentence the notification and the menu header both use."""
        if self.error:
            return "The list could not be read"
        bits = []
        if self.today:
            bits.append("%d due today" % len(self.today))
        if self.overdue:
            bits.append("%d overdue" % len(self.overdue))
        if self.messages:
            bits.append("%d to send" % len(self.messages))
        return ", ".join(bits) if bits else "Nothing due today"


def todo_path(root=None):
    root = root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(root, "data", DATASET, "todo.md")


def message_key(m):
    """A stable id for one message, for remembering it has been dismissed.

    Built from the task, the step and the text rather than from a position in
    the file, so re-ordering the board does not resurrect everything, and
    rewording a message deliberately does — a changed message is a different
    message and is worth seeing again.
    """
    raw = "%s\u241f%s\u241f%s" % (m["task"], m["where"], m["text"])
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]


def read_messages(text, day, dismissed=()):
    """Suggested messages that are still waiting to go out.

    The extraction is core/todo.py's — this is only the policy on top of it, and
    the policy is the same three exclusions the rest of this file applies, for
    the same reason. A message under a task sitting with somebody else, or
    waiting on an unfinished blocker, is not one he can send today.

    `start:` is honoured here, unlike in the dated half above. There the
    argument is that a passed deadline is owed whatever its start date says;
    here there is no deadline in play, so a step that cannot begin yet is
    genuinely not ready and putting its message up would be noise.

    Undated ones sort last rather than dropping out, which is what the board's
    Quick wins does, because those are the ones that rot quietly.
    """
    tasks = todo.parse_doc(text)
    slugs = todo.slug_states(tasks)
    out = []
    for t in tasks:
        if t.column.strip().lower() in PARKED_COLUMNS or todo.is_blocked(t, slugs):
            continue
        for m in todo.messages(t):
            if m["due"]:
                start = todo.parse_date(t.start) if t.start else None
                if start and start > day:
                    continue
            m["key"] = message_key(m)
            if m["key"] in dismissed:
                continue
            out.append(m)
    out.sort(key=lambda m: (m["due"] or "9999-99-99", m["task"], m["where"]))
    return out


def build(day=None, path=None, dismissed=()):
    day = day or dt.date.today()
    path = path or todo_path()
    d = Digest(day)
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        d.error = str(exc)
        return d

    tasks = todo.parse_doc(text)
    slugs = todo.slug_states(tasks)
    for t in tasks:
        if t.done:
            continue
        if t.headline and not d.headline:
            d.headline = t
        due = todo.effective_due(t, day)
        if not due or due > day:
            continue
        if t.column.strip().lower() in PARKED_COLUMNS or todo.is_blocked(t, slugs):
            d.parked += 1
            continue
        (d.overdue if due < day else d.today).append((due, t))

    # Oldest deadline first in each group: the thing that has been owed longest
    # is the thing worth reading first.
    d.overdue.sort(key=lambda p: p[0])
    d.today.sort(key=lambda p: (p[1].bucket, p[1].title))
    d.messages = read_messages(text, day, dismissed)
    return d


def main():
    day = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else None
    d = build(day)
    print("%s — %s" % (d.day.strftime("%A %-d %B %Y"), d.line()))
    if d.error:
        return 1
    if d.headline:
        print("\nThe one thing: %s" % d.headline.title)
    for label, group in (("Overdue", d.overdue), ("Due today", d.today)):
        if not group:
            continue
        print("\n%s" % label)
        for due, t in group:
            when = "" if due == d.day else "  (%s)" % due.isoformat()
            print("  %-14s %s%s" % (t.bucket[:14], t.title, when))
    if d.parked:
        print("\n%d more dated but sitting with somebody else or blocked." % d.parked)
    if d.messages:
        print("\nMessages to send")
        for m in d.messages:
            mark = " (draft)" if m["draft"] else ""
            print("  %-10s %s%s" % (m["due"] or "—", m["where"] or m["task"], mark))
            print("             %s" % m["text"][:88])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
