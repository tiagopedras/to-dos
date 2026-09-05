#!/usr/bin/env python3
"""Ask the companion to say something on screen.

The companion is the only thing in this repo that can put a desktop notification
up. The nightly agent has no UI at all, the board is a browser tab that is
usually shut, and a skill is a conversation that has already ended by the time
its result matters. So rather than each growing its own way to speak, they all
append here and the companion drains the queue on its next tick.

    python3 companion/notify.py "Nightly agent" "3 plans written, 2 skipped"
    python3 companion/notify.py --view plans "Nightly agent" "3 plans waiting"
    python3 companion/notify.py --task ds-audit "Due today" "The audit is owed"
    python3 companion/notify.py --dataset _test "Title" "Body"

Or from Python:

    sys.path.insert(0, ".../companion"); import notify
    notify.queue("Nightly agent", "3 plans written", view="plans")

`task` and `view` say where the banner goes when it is pressed. A task is a
card's `#slug`, or its title where it has none — the two things in todo.md
stable enough to point at. A view is one of the board's own tabs, `plans`,
`schedule`, `board` and the rest. Give both and it opens the card on that view;
give neither and it opens the board's front page. Sending someone to a banner
they cannot follow up is most of what makes a notification annoying, so name
one wherever there is an obvious one to name.

Appending is all this does. It never posts anything itself and it never blocks,
so it is safe to call from a script running at two in the morning with nobody
logged in — and safe when the companion is not running at all, since the queue
simply waits.

What the companion will not do with what you queue, however loudly you ask:

  - Post outside 08:30 to 20:00. A line queued at 02:00 waits for the morning.
  - Post more than three at once.

Weekends and public holidays are *not* excluded, unlike the morning briefing.
That briefing is a scheduled interruption about a working day, so a Saturday
rightly gets none; a queued line answers something that has just happened,
because something was set running. Holding a Saturday night's result until
Monday morning helps nobody.

So this is for things worth a banner, not for progress. A run that wrote three
plans is one line at the end, not one line a plan.
"""

import datetime as dt
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAX_QUEUED = 20


def queue_path(dataset=None):
    if not dataset:
        try:
            with open(os.path.join(ROOT, "data", ".current"), encoding="utf-8") as fh:
                dataset = fh.read().strip()
        except OSError:
            dataset = ""
        dataset = dataset or "twinkl"
    return os.path.join(ROOT, "data", dataset, "notify-queue.json")


def queue(title, body, dataset=None, task=None, view=None):
    """Append one notification. Returns the path, or None if it could not be written.

    `task` and `view` are where the banner goes when it is pressed, and are
    left out of the entry entirely when empty rather than written as null — the
    companion treats a missing key and an empty one the same way, and an entry
    with nothing to say about where it points should not carry the keys.

    Never raises. A caller asking for a banner is never doing it as its main job,
    so a failure here must not take down whatever was actually being done.
    """
    path = queue_path(dataset)
    try:
        with open(path, encoding="utf-8") as fh:
            items = json.load(fh)
        if not isinstance(items, list):
            items = []
    except (OSError, ValueError):
        items = []

    entry = {
        "title": str(title)[:120],
        "body": str(body)[:400],
        "queued": dt.datetime.now().isoformat(timespec="seconds"),
    }
    if task:
        entry["task"] = str(task)[:200]
    if view:
        entry["view"] = str(view)[:40]
    items.append(entry)
    # A queue nobody drains is a companion that is not running. Cap it so that
    # comes back as the last few lines when it starts, rather than as a month of
    # backlog fired at once.
    items = items[-MAX_QUEUED:]

    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="") as fh:
            json.dump(items, fh, indent=2)
        os.replace(tmp, path)
    except OSError:
        return None
    return path


def main(argv):
    opts = {"--dataset": None, "--task": None, "--view": None}
    while len(argv) > 1 and argv[0] in opts:
        opts[argv[0]], argv = argv[1], argv[2:]
    if len(argv) < 2:
        print(__doc__.strip().splitlines()[0], file=sys.stderr)
        print('usage: notify.py [--dataset NAME] [--task KEY] [--view NAME] '
              '"Title" "Body"', file=sys.stderr)
        return 2
    path = queue(argv[0], argv[1], opts["--dataset"],
                 task=opts["--task"], view=opts["--view"])
    if not path:
        print("could not write the queue", file=sys.stderr)
        return 1
    print("queued — the companion posts it on its next tick, within the "
          "morning window")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
