#!/usr/bin/env python3
"""Where everything the nightly agent touches lives.

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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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


def plans_dir():
    return os.path.join(data_dir(), "plans")


def night_dir(day):
    return os.path.join(plans_dir(), day.isoformat())


def actioned_dir():
    return os.path.join(plans_dir(), "actioned")


def ledger_path():
    return os.path.join(plans_dir(), "ledger.json")


def window_path():
    return os.path.join(plans_dir(), "window.json")


def log_path():
    return os.path.join(plans_dir(), "nightly.log")


def attach_queue_path():
    return os.path.join(data_dir(), "attach-queue.json")


def order_path():
    """The board's priority list for the queue: order, and what is held back.

    A sidecar rather than anything in todo.md, because todo.md has exactly one
    writer and the board dragging a card in the Plans view must not become a
    second one. Nothing outside the nightly agent reads it, and losing it costs
    an ordering rather than any work.
    """
    return os.path.join(plans_dir(), "queue-order.json")
