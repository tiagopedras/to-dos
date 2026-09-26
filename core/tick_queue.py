#!/usr/bin/env python3
"""The queue an agent leaves a request in when it has finished a sub-task.

An agent never writes todo.md: the board holds the whole document in the
browser and writes all of it back, so a second writer is overwritten within
seconds. What an agent can do is say "I have finished sub-task aa0001", and this
is where it says it, in `data/<dataset>/tick-queue.json`. The board drains the
file when it loads (`drainTickQueue()` in kanban/js/10-reference-sections.js),
through its own edit path, the way it drains attach-queue.json.

Each entry is one request:

    {"id": "3f9a1c2b", "sub": "aa0001", "by": "Plan agent",
     "at": "2026-09-22T02:14:09", "note": "plan written", "plan": "2026-09-22/ab12cd-x.md",
     "type": "write-up"}

`sub` is the six-character id written on the sub-task's line, and `by` is who is
asking. The board applies a tick only when `by` is the agent the sub-task is
assigned to, so an agent cannot tick a review and approve its own work. Nothing
is lost when the board is closed: the request waits for the next load.

`type` is the plan's own `type:` (core/plan_types.py), on the Plan agent's tick
only. For a pre-approved type the board also ticks Review the plan, with the
note "pre-approved type". That is the board's decision, made from its own list:
the agent only says what kind of plan it wrote.

The file is appended to and removed from under a lock, and the board removes
only the ids it dealt with rather than rewriting the list, so a request that
lands while the board is draining is not written over.

    python3 core/tick_queue.py tick aa0001 --by "Plan agent" --note "plan written"
"""

import argparse
import datetime as dt
import fcntl
import json
import os
import sys
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# $TODOS_DATA_ROOT moves the datasets, as it does for kanban/server.py.
DATA_ROOT = os.environ.get("TODOS_DATA_ROOT") or os.path.join(ROOT, "data")


def current_dataset():
    try:
        with open(os.path.join(DATA_ROOT, ".current"), encoding="utf-8") as fh:
            return fh.read().strip() or "twinkl"
    except OSError:
        return "twinkl"


def queue_path(dataset=None):
    return os.path.join(DATA_ROOT, dataset or current_dataset(), "tick-queue.json")


class _Locked:
    """Holds an exclusive lock beside the queue for as long as it is open."""

    def __init__(self, path):
        self.path = path

    def __enter__(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        self.fh = open(self.path + ".lock", "w")
        fcntl.flock(self.fh, fcntl.LOCK_EX)
        return self

    def __exit__(self, *exc):
        fcntl.flock(self.fh, fcntl.LOCK_UN)
        self.fh.close()


def read(path=None):
    """Every request waiting, oldest first. Unreadable or hand-broken is empty."""
    try:
        with open(path or queue_path(), encoding="utf-8") as fh:
            got = json.load(fh)
    except (OSError, ValueError):
        return []
    return [e for e in got if isinstance(e, dict)] if isinstance(got, list) else []


def _write(path, items):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(items, fh, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def append(sub, by, note="", path=None, now=None, plan="", kind=""):
    """Asks the board to tick sub-task `sub`, on behalf of `by`. Returns the entry.

    `plan` is the path of a plan just written, relative to the plans folder. The
    board puts it on the review waiting behind the sub-task as a `Plan:` note,
    so that opening the review can read it. `kind` is that plan's `type:`."""
    path = path or queue_path()
    entry = {
        "id": uuid.uuid4().hex[:8],
        "sub": str(sub).strip().lower(),
        "by": str(by).strip(),
        "at": (now or dt.datetime.now()).replace(microsecond=0).isoformat(),
        "note": note,
    }
    if plan:
        entry["plan"] = str(plan)
    if kind:
        entry["type"] = str(kind).strip().lower()
    with _Locked(path):
        items = read(path)
        items.append(entry)
        _write(path, items)
    return entry


def remove(ids, path=None):
    """Takes the entries with these ids out, and nothing else."""
    path = path or queue_path()
    gone = set(ids)
    with _Locked(path):
        items = read(path)
        keep = [e for e in items if e.get("id") not in gone]
        if len(keep) != len(items):
            _write(path, keep)
    return len(items) - len(keep)


def main(argv):
    ap = argparse.ArgumentParser(description="Ask the board to tick a sub-task.")
    ap.add_argument("action", choices=["tick"])
    ap.add_argument("sub", help="the six-character id on the sub-task's line")
    ap.add_argument("--by", required=True, help='who is asking: "Plan agent" or "Implement agent"')
    ap.add_argument("--note", default="")
    ap.add_argument("--plan", default="", help="a plan just written, relative to the plans folder")
    ap.add_argument("--type", default="", help="the plan's type:, on the Plan agent's tick")
    ap.add_argument("--dataset")
    args = ap.parse_args(argv)
    entry = append(args.sub, args.by, args.note, path=queue_path(args.dataset), plan=args.plan, kind=args.type)
    print("queued: tick %s by %s (%s)" % (entry["sub"], entry["by"], entry["id"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
