#!/usr/bin/env python3
"""Which tasks tonight's run should plan.

Every open, top-level task tagged `[ai:: full]` or `[ai:: partial]`, minus three
exclusions and minus anything already planned whose text has not changed since.

The three exclusions are the same ones companion/digest.py applies, deliberately:
two readers of one list disagreeing about what is actionable is worse than
either answer on its own.

  - Waiting review and Blocked. The next move belongs to somebody else, so
    there is nothing to plan.
  - An unticked `blocked-by:`. The blocker is the real task.
  - A `start:` that has not arrived. It cannot begin yet.

`due:` is deliberately not consulted. A deadline says when something must be
finished, not whether it is worth thinking about tonight, and CONVENTIONS.md is
explicit that a deadline never hides anything.

The ledger is what makes planning all of them affordable rather than a wall of
identical files every morning. Each planned task is recorded against a hash of
its own text; a task whose text has not moved, and whose last plan has not been
actioned, is skipped. So the first night plans everything and every night after
plans only what changed.

No format knowledge lives here. Everything about how todo.md is written comes
from core/todo.py, which every reader of the list shares.

    python3 nightly/pick.py            what tonight would plan
    python3 nightly/pick.py --all      ignore the ledger
    python3 nightly/pick.py --json     the same, for the runner
"""

import datetime as dt
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "core"))
sys.path.insert(0, HERE)

import todo  # noqa: E402
import paths  # noqa: E402

PARKED = {"waiting review", "blocked"}
PLANNABLE = {"full", "partial"}


def fingerprint(task):
    """A hash of the task exactly as written, title line and notes together.

    The whole block rather than the title, because the point is to notice that
    the task has changed — a new sub-step, a rewritten note, a moved date all
    make last night's plan stale, and none of them touch the title.
    """
    text = task.raw + "\n" + "\n".join(task.body)
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def eligible(tasks, day, slugs=None):
    """The tasks worth planning, before the ledger has its say."""
    slugs = slugs if slugs is not None else todo.slug_states(tasks)
    out = []
    for t in tasks:
        if t.done or t.ai not in PLANNABLE:
            continue
        if t.column.strip().lower() in PARKED:
            continue
        if todo.is_blocked(t, slugs):
            continue
        if t.start:
            start = todo.parse_date(t.start)
            if start and start > day:
                continue
        out.append(t)
    return out


def load_ledger(path=None):
    try:
        with open(path or paths.ledger_path(), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_ledger(ledger, path=None):
    path = path or paths.ledger_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(ledger, fh, indent=2, sort_keys=True)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def is_stale(task, ledger):
    """Whether this task needs a fresh plan.

    Three ways to be worth planning: never planned, changed since the last plan,
    or the last plan was actioned and so no longer describes outstanding work.
    """
    seen = ledger.get(task.title)
    if not seen:
        return True, "never planned"
    if seen.get("fingerprint") != fingerprint(task):
        return True, "changed since %s" % seen.get("planned", "?")
    if seen.get("status") == "actioned":
        return True, "last plan actioned"
    return False, "unchanged since %s" % seen.get("planned", "?")


def select(text, day=None, use_ledger=True, ledger=None, only=None):
    """(to plan, skipped) — skipped carries a reason for the log."""
    day = day or dt.date.today()
    tasks = todo.parse_doc(text)
    slugs = todo.slug_states(tasks)
    cand = eligible(tasks, day, slugs)

    if only:
        want = only.strip().lower()
        # Exact first, so a title that is a prefix of another still resolves.
        hit = [t for t in tasks if t.title.strip().lower() == want]
        if not hit:
            hit = [t for t in tasks if want in t.title.strip().lower()]
        return hit, []

    ledger = ledger if ledger is not None else (load_ledger() if use_ledger else {})
    plan, skip = [], []
    for t in cand:
        if not use_ledger:
            plan.append(t)
            continue
        stale, why = is_stale(t, ledger)
        (plan if stale else skip).append(t if stale else (t, why))
    return plan, skip


def _report(plan, skip):
    if not plan:
        print("Nothing to plan.")
    else:
        print("%d to plan:\n" % len(plan))
        bucket = None
        for t in plan:
            if t.bucket != bucket:
                bucket = t.bucket
                print("  %s" % bucket)
            print("    %-14s %-8s %s" % (t.column, t.ai, t.title[:60]))
    if skip:
        print("\n%d skipped:" % len(skip))
        for t, why in skip:
            print("    %-60s %s" % (t.title[:60], why))


def main(argv):
    with open(paths.todo_path(), encoding="utf-8") as fh:
        text = fh.read()
    only = None
    if "--task" in argv:
        only = argv[argv.index("--task") + 1]
    plan, skip = select(text, use_ledger="--all" not in argv, only=only)
    if "--json" in argv:
        print(json.dumps([{
            "title": t.title, "bucket": t.bucket, "column": t.column,
            "ai": t.ai, "slug": t.slug, "fingerprint": fingerprint(t),
            "raw": t.raw, "body": t.body,
        } for t in plan], indent=2))
        return 0
    _report(plan, skip)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
