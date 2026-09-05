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

Order comes from the board. The Plans view shows this queue as its first column
and writes `plans/queue-order.json` when a card is dragged, so the front of the
list is what he asked for first rather than whichever bucket happens to sort
early. Cards can also be held back there, and a held task is not planned at all.

The ledger is what makes planning all of them affordable rather than a wall of
identical files every morning. Each planned task is recorded against a hash of
its own text; a task whose text has not moved, and whose last plan has not been
actioned, is skipped. So the first night plans everything and every night after
plans only what changed.

No format knowledge lives here. Everything about how todo.md is written comes
from core/todo.py, which every reader of the list shares.

    python3 nightly/pick.py            what tonight would plan, in order
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


# --- the board's ordering ----------------------------------------------------
#
# The queue used to be whatever order the tasks happened to sit in todo.md,
# which is bucket order, which is not a priority. This is the board's say in it:
# `plans/queue-order.json`, written by the Plans view when a card is dragged,
# holding two lists of titles.
#
#   order  the front of the queue, in the order they should be planned
#   hold   tasks not to plan at all until they are let back in
#
# Titles rather than ids because titles are already what the ledger keys on, and
# a second identity scheme for the same tasks is a second thing to keep in step.
# Retitling a task loses its place in the order, which is the same thing it does
# to its ledger row, and costs one plan rather than anything else.
#
# Neither list is authoritative about what the queue contains. Every rule above
# still decides that; this only sorts what survives them and drops what is held.
# So a title in here that no longer exists, or that has gone Blocked since, is
# simply never matched, and there is nothing to prune.


def titles(value):
    """A list of non-empty titles, or nothing, from whatever was in the file.

    `isinstance(value, list)` rather than truthiness, because a string is
    iterable: a hand-edited file saying `"order": "Some task"` would otherwise
    come back as one entry per letter and quietly shuffle the whole queue.
    """
    if not isinstance(value, list):
        return []
    return [str(t) for t in value if str(t).strip()]


def load_order(path=None):
    try:
        with open(path or paths.order_path(), encoding="utf-8") as fh:
            got = json.load(fh)
    except (OSError, ValueError):
        return {"order": [], "hold": []}
    if not isinstance(got, dict):
        return {"order": [], "hold": []}
    return {"order": titles(got.get("order")), "hold": titles(got.get("hold"))}


def save_order(order, path=None):
    path = path or paths.order_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    body = {
        "order": titles(order.get("order")),
        "hold": titles(order.get("hold")),
        "saved": dt.datetime.now().astimezone().isoformat(timespec="minutes"),
    }
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(body, fh, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
    return body


def key(title):
    return (title or "").strip().lower()


def in_order(tasks, order, today=None):
    """The queue, in the order the list's own rules say to work through it.

    Four keys, in this order, and the first three exist because the board's
    ordering cannot express them:

    1. **What he dragged.** `plans/queue-order.json` is him saying "this one
       first" in as many words, and nothing here second-guesses it. A task he
       has never ranked sorts behind every task he has, so an ordering set last
       week survives a new task appearing today.

    2. **The headline.** One task carries `headline:` and it is, by definition,
       the one that makes the others easier or unnecessary. PA.md calls it the
       one thing; planning anything ahead of it is planning the wrong task.

    3. **The date.** PA.md is explicit that a date beats a score, because the
       tasks with real dates are the people ones and their consequences land on
       somebody else. Overdue first, then soonest. Recurrence is rolled forward
       in memory by `effective_due` so a fortnightly 1:1 sorts on the meeting it
       is actually pointing at.

       This is not the same as `due:` deciding *whether* to plan something,
       which the module docstring rules out and this does not change. A deadline
       still hides nothing; it only says what to reach first when the budget
       runs out before the queue does.

    4. **Impact against effort**, highest first, straight out of
       `core/todo.py` so it is the same arithmetic the board draws. An unscored
       task scores -1 and sinks, which is right: a task nobody has scored is not
       a task anybody has said is worth a night's spend.

    Bucket is deliberately not a key at any level. The first full batch, on
    5 Sep 2026, spent its whole budget on Design System and left three buckets
    untouched, because the fallback was file order and file order is bucket
    order. Sorting by the rules rather than by the file is what mixes them: the
    buckets interleave on merit instead of one draining before the next starts.
    """
    today = today or dt.date.today()
    rank = {key(t): i for i, t in enumerate(order or [])}
    back = len(rank)

    def sort_key(t):
        due = todo.effective_due(t, today)
        return (
            rank.get(key(t.title), back),
            0 if t.headline else 1,
            (due - today).days if due else 10 ** 6,
            -todo.priority_score(t),
        )

    return sorted(tasks, key=sort_key)


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


def select(text, day=None, use_ledger=True, ledger=None, only=None, order=None):
    """(to plan, skipped) — skipped carries a reason for the log.

    The returned queue is in the order it will actually be worked through, which
    is the board's order first and list order behind it. That matters more than
    it looks: the batch stops on a budget, a floor or a usage limit, so the
    front of this list is the part that reliably gets planned and the back is
    the part that might not.
    """
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

    order = order if order is not None else load_order()
    held = {key(t) for t in order.get("hold") or []}
    ledger = ledger if ledger is not None else (load_ledger() if use_ledger else {})
    plan, skip = [], []
    for t in cand:
        # Held beats everything, --all included. The ledger is a cache and --all
        # exists to ignore it; this is an instruction, and ignoring it would
        # mean the one control he has over the night quietly not working.
        if key(t.title) in held:
            skip.append((t, "held back from the board"))
            continue
        if not use_ledger:
            plan.append(t)
            continue
        stale, why = is_stale(t, ledger)
        (plan if stale else skip).append(t if stale else (t, why))
    return in_order(plan, order.get("order"), day), skip


def _report(plan, skip):
    if not plan:
        print("Nothing to plan.")
    else:
        # Numbered and flat rather than grouped by bucket. Grouping would imply
        # the runner works bucket by bucket, and since the board started
        # ordering this queue it works straight down it.
        print("%d to plan, in order:\n" % len(plan))
        for i, t in enumerate(plan, 1):
            print("  %2d. %-14s %-8s %-40s %s" % (
                i, t.column, t.ai, t.title[:40], t.bucket))
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
