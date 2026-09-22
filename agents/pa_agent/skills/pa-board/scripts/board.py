#!/usr/bin/env python3
"""Read one board's tasks, for the pa-board skill. Reads only, never writes.

    board.py boards                                  the lists there are
    board.py buckets --board B [--column C]          buckets, with counts
    board.py list    --board B --column C [--bucket X]
    board.py show    --board B --column C [--bucket X] --n N

`show` takes the same filters as `list`, so N is the number `list` printed.
The parsing is core/todo.py's; nothing here knows the file format.
"""

import argparse
import os
import sys

TODOS = os.path.abspath(os.path.join(os.path.dirname(os.path.realpath(__file__)), "../../../../.."))
sys.path.insert(0, os.path.join(TODOS, "core"))
import todo  # noqa: E402

DATA = os.path.join(TODOS, "data")
COLUMNS = ["Backlog", "To do", "Doing", "Reviewing", "Done"]


def boards():
    return sorted(d for d in os.listdir(DATA)
                  if not d.startswith(("_", ".")) and not d.startswith("test")
                  and os.path.isfile(os.path.join(DATA, d, "todo.md")))


def load(board):
    path = os.path.join(DATA, board, "todo.md")
    if not os.path.isfile(path):
        sys.exit("No board called %r. Boards: %s" % (board, ", ".join(boards())))
    with open(path, encoding="utf-8") as f:
        return todo.parse_doc(f.read())


def match_column(name):
    for c in COLUMNS:
        if c.lower() == name.strip().lower():
            return c
    sys.exit("No column called %r. Columns: %s" % (name, ", ".join(COLUMNS)))


def pick(tasks, column, bucket):
    col = match_column(column)
    out = [t for t in tasks if t.column == col]
    if bucket:
        b = bucket.strip().lower()
        out = [t for t in out if t.bucket.lower() == b]
    return out


def show(t):
    rows = [("Title", t.title), ("Bucket", t.bucket), ("Column", t.column),
            ("Id", t.stable_id), ("Assignee", t.to), ("Due", t.due),
            ("Start", t.start), ("Impact", t.impact), ("Effort", t.effort),
            ("Urgent", "yes" if t.urgent else ""), ("This week", "yes" if t.week else ""),
            ("Repeats", t.repeat), ("Blocked by", ", ".join(t.blocked_by)),
            ("Slug", t.slug), ("Headline", t.headline), ("Chat", t.chat),
            ("Done on", t.done_on), ("Cancelled", t.cancelled), ("Archived", t.archived),
            ("Other tags", " ".join(t.extra))]
    for k, v in rows:
        if v:
            print("%s: %s" % (k, v))
    notes, steps = todo.split_body(t)
    notes = [l for l in notes if l.strip()]
    if notes:
        print("\nNotes:")
        for l in notes:
            print(l.rstrip())
    if steps:
        print("\nSub-tasks:")
        for s in steps:
            st = s["task"]
            tags = [x for x in (st.to and "to: " + st.to, st.stable_id and "id: " + st.stable_id,
                                st.due and "due: " + st.due, st.doing and "doing") if x]
            print("- [%s] %s%s" % ("x" if s["done"] else " ", st.title,
                                   "  (" + ", ".join(tags) + ")" if tags else ""))
            for l in s["notes"]:
                if l.strip():
                    print("    " + l.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["boards", "buckets", "list", "show"])
    ap.add_argument("--board")
    ap.add_argument("--column")
    ap.add_argument("--bucket")
    ap.add_argument("--n", type=int)
    a = ap.parse_args()

    if a.cmd == "boards":
        cur = open(os.path.join(DATA, ".current")).read().strip()
        for b in boards():
            print(b + ("  (current)" if b == cur else ""))
        return
    tasks = load(a.board)
    if a.cmd == "buckets":
        # From the headings, not the tasks, so an empty bucket is still listed.
        # Stops at the first un-numbered `##` after them, as parse_doc does.
        seen = []
        with open(os.path.join(DATA, a.board, "todo.md"), encoding="utf-8") as f:
            for line in f:
                m = todo.BUCKET_RE.match(line)
                if m:
                    seen.append(m.group(2).strip())
                elif seen and line.startswith("## "):
                    break
        for b in seen:
            n = len([t for t in tasks if t.bucket == b and (not a.column or t.column == match_column(a.column))])
            print("%s (%d)" % (b, n))
        return
    got = pick(tasks, a.column, a.bucket)
    if a.cmd == "list":
        if not got:
            print("Nothing in %s." % match_column(a.column))
        for i, t in enumerate(got, 1):
            print("%d. %s%s" % (i, t.title, "" if a.bucket else "  [%s]" % t.bucket))
        return
    if not a.n or not 1 <= a.n <= len(got):
        sys.exit("No task %s; the list has %d." % (a.n, len(got)))
    show(got[a.n - 1])


if __name__ == "__main__":
    main()
