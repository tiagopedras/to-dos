#!/usr/bin/env python3
"""Where everything the planning agent touches lives.

One module so that the dataset pointer is read in one place. `data/.current`
names the list the board's dropdown is currently pointed at, and every path
below hangs off it — the same resolution PA.md describes for the skills.

Unlike the companion, which pins itself to `twinkl` on purpose, this follows the
pointer. The companion's reasoning is that switching the board for ten minutes
should not silently change what gets notified tomorrow morning; here the
opposite holds, because a plan is written against whichever list is live and
filed beside it.
"""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FALLBACK = "twinkl"


def dataset():
    try:
        with open(os.path.join(ROOT, "data", ".current"), encoding="utf-8") as fh:
            name = fh.read().strip()
    except OSError:
        return FALLBACK
    return name or FALLBACK


def data_dir():
    return os.path.join(ROOT, "data", dataset())


def todo_path():
    return os.path.join(data_dir(), "todo.md")


def buckets_dir():
    """This dataset's bucket briefs, one folder per stream inside it.

    Inside `data/<dataset>/` rather than at the root, because a bucket brief is
    only true of one list. `twinkl` and `personal` do not share a bucket set —
    the first has five headings and the second has one — so a brief filed by
    stream name alone would hand the personal list Twinkl's processes and its
    people. Moving it in here also means the dataset is one folder: copy it,
    delete it, and its briefs go with it.

    Gitignored with the rest of `data/`, for the reason `BUCKETS.md` at the root
    spells out: a brief names real people and real processes, and the skills
    beside it are Twinkl's own. `BUCKETS.md` is the tracked half and holds the
    rules and the template; what each dataset actually has is the README in
    here.
    """
    return os.path.join(data_dir(), "buckets")


def plans_dir():
    return os.path.join(data_dir(), "plans")


def night_dir(day):
    """Where one night's own run record lives — index.md and run.json only.

    Not where a plan lives any more: a plan is one file per task, flat under
    plans_dir(), current for as long as its task is. A night's own record is
    still scoped to the night that wrote it, the same way it always was.
    """
    return os.path.join(plans_dir(), day.isoformat())


def ledger_path():
    return os.path.join(plans_dir(), "ledger.json")


def window_path():
    return os.path.join(plans_dir(), "window.json")


def log_path():
    return os.path.join(plans_dir(), "planning-agent.log")


def attach_queue_path():
    return os.path.join(data_dir(), "attach-queue.json")


def order_path():
    """The board's priority list for the queue: order, and what is held back.

    A sidecar rather than anything in todo.md, because todo.md has exactly one
    writer and the board dragging a card in the Plans view must not become a
    second one. Nothing outside the planning agent reads it, and losing it costs
    an ordering rather than any work.
    """
    return os.path.join(plans_dir(), "queue-order.json")
