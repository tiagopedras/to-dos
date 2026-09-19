#!/usr/bin/env python3
"""Where everything the planning agent touches lives.

One module so that the dataset pointer is read in one place. Every path below
hangs off a dataset name, and that name comes from one of three places, in
order: `using()` around the call, `$PLANNING_DATASET` in the environment, then
`data/.current` — the same pointer PA.md describes for the skills.

The env var is what lets one wake plan more than one list. `run.sh` loops the
datasets that are due and exports the name for each, so `plan.py`, `brief.py`
and `report.py` go on calling these functions with no argument and land in the
right folder. `using()` is the same trick for a process that has to look at
several in turn, which is the dashboard building one card per list.

Unlike the companion, which pins itself to `twinkl` on purpose, this follows the
pointer when nothing overrides it. The companion's reasoning is that switching
the board for ten minutes should not silently change what gets notified tomorrow
morning; here the opposite holds, because a plan is written against whichever
list is live and filed beside it.
"""

import contextlib
import os


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FALLBACK = "twinkl"

# Set by using(), and the first thing dataset() asks. A module global rather
# than an argument threaded through forty call sites: everything downstream
# already calls these functions with no argument, and the alternative was
# editing every one of them to carry a name they would only pass straight back.
_ACTIVE = None


def pointer():
    """What `data/.current` says, ignoring both overrides.

    Kept separate from dataset() because two callers need the pointer itself
    rather than the dataset in force: the board's own idea of which list is
    open, and schedule.py deciding which list a pre-September schedule file
    belonged to.
    """
    try:
        with open(os.path.join(ROOT, "data", ".current"), encoding="utf-8") as fh:
            name = fh.read().strip()
    except OSError:
        return FALLBACK
    return name or FALLBACK


def dataset():
    return _ACTIVE or os.environ.get("PLANNING_DATASET") or pointer()


@contextlib.contextmanager
def using(name):
    """Point every path below at one dataset for the length of a block.

    Restores whatever was in force rather than clearing it, so a nested use
    inside a run that already has `$PLANNING_DATASET` set does not leave the
    process pointed somewhere else.
    """
    global _ACTIVE
    before = _ACTIVE
    _ACTIVE = name
    try:
        yield name
    finally:
        _ACTIVE = before


def datasets():
    """Every list this agent could plan against, oldest rule first: it has a todo.md.

    A folder under `data/` with no `todo.md` is not a list — `test2` holds a
    plans folder and nothing to plan from. A leading underscore is the mark for
    a fixture rather than a list, which is what keeps `_test` off the dashboard
    without anything needing to know its name.

    Sorted, so the cards on the page do not reorder themselves between reads.
    """
    root = os.path.join(ROOT, "data")
    try:
        names = os.listdir(root)
    except OSError:
        return [FALLBACK]
    out = [n for n in sorted(names)
           if not n.startswith((".", "_"))
           and os.path.isfile(os.path.join(root, n, "todo.md"))]
    return out or [FALLBACK]


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


def briefings_path():
    """Where brief.py leaves what it has worked out about each task.

    Beside data_dir() rather than inside plans_dir(): a briefing is not a
    proposal about what to do, it is a summary of what a task already says,
    and newChat() and pa read it whether or not the task has ever been
    planned at all. Same shape as attach_queue_path() and the rest — a
    sidecar the board reads and only this agent writes, kept out of
    todo.md and out of the one-writer rule entirely.
    """
    return os.path.join(data_dir(), "briefings.json")


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
