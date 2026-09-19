#!/usr/bin/env python3
"""When the planning agent is woken, per list, and the floor none of them clear.

Until September 2026 this was written in two places — twelve wakes in the plist
and a `19:00–06:59` clock check in `run.sh` — and neither could be changed from
anywhere but a text editor and a `launchctl reload`. Now the plist is dumb, the
hourly wake asks this file whether it is due, and the agents dashboard is the
editor. The same arrangement the improvements agent has had from the start, and
for the same reason: a schedule you cannot change is a schedule you leave wrong.

One schedule per dataset since 19 Sep 2026. The agent used to follow
`data/.current` and so had exactly one set of hours, which meant the only way to
plan the personal list was to switch the board over and leave it switched. Now
every list that has a `todo.md` gets its own switch, hours and budget, and a
wake runs whichever of them name that hour. The file is keyed by dataset:

    {"twinkl": {"on": true, "hours": [...], "budget": 6.0, "max_plans": 0},
     "personal": {"on": false, ...}}

A file in the old flat shape is read as belonging to whichever list `.current`
pointed at, which is the one it has in fact been driving, and the first write
saves it in the new shape.

Moving a schedule into a file that a web page can write does remove a guard,
though, and this one guarded something that spends money unattended. So the
floor below is not editable and not in the file. `run.sh` refuses to start
inside the working day whatever the schedule says, the dashboard draws those
hours dead, and both of those come from `ALLOWED` here.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

sys.path.insert(0, HERE)
import paths  # noqa: E402

# The hours this agent may ever be woken at, and the one thing on this page a
# dashboard cannot change. 19:00 to 06:59, which is exactly what the old clock
# check in `run.sh` allowed, so nothing about tonight is different from last
# night. 07:00 is the boundary because it is the same 07:00 `core/windows.py`
# calls the morning: past it, the window being spent in is one he would notice.
ALLOWED = tuple(list(range(19, 24)) + list(range(0, 7)))

# The shape of one list's schedule. `on` is False here and True in the branch
# below that reads a missing file: a list the file has never heard of is one he
# has not switched on yet, and defaulting it to on would have the agent start
# spending against a second list the night this shipped.
DEFAULTS = {
    "on": False,
    "hours": list(ALLOWED),
    "budget": 6.00,
    # How many plans a night stops at, on top of the budget and the floor.
    # 0 means no cap of its own — the count that lands is whatever the budget
    # buys, same as before this existed.
    "max_plans": 0,
}

# The keys a pre-September file had at its top level, and the tell that a file
# is in the old flat shape rather than keyed by dataset.
FLAT = ("on", "hours", "budget", "max_plans")


def path():
    """Beside the data rather than inside a dataset folder.

    `data/<dataset>/` holds one list and everything true of it; when the agent
    runs is true of the agent, and one file holding every list's hours is what
    lets a wake ask about all of them without opening four.
    """
    return os.path.join(ROOT, "data", "planning-agent-schedule.json")


def _clean(raw, fallback_on=False):
    """One list's entry, with anything missing or impossible filled in."""
    out = dict(DEFAULTS)
    out["on"] = fallback_on
    if not isinstance(raw, dict):
        return out
    if "on" in raw:
        out["on"] = bool(raw["on"])
    if "budget" in raw:
        try:
            out["budget"] = float(raw["budget"])
        except (TypeError, ValueError):
            pass
    if "max_plans" in raw:
        try:
            out["max_plans"] = max(0, int(raw["max_plans"]))
        except (TypeError, ValueError):
            pass
    if isinstance(raw.get("hours"), list):
        out["hours"] = sorted({int(h) for h in raw["hours"]
                               if isinstance(h, int) and h in ALLOWED})
    return out


def _owner():
    """Which list a pre-September schedule file belonged to.

    The obvious answer is `data/.current`, and it is the wrong one: the pointer
    moves every time the board's dropdown does, so a flat file read twice a
    minute apart could answer twice differently and the hours he set would
    follow whichever list he was looking at. What does not move is the evidence
    of what the agent has actually been planning — a `plans/` folder only
    exists under a list this agent has written a night into. One such list is
    the answer; anything else falls back to the pointer, which is at least the
    answer it used to give.
    """
    planned = [n for n in paths.datasets()
               if os.path.isdir(os.path.join(ROOT, "data", n, "plans"))]
    return planned[0] if len(planned) == 1 else paths.pointer()


def _read():
    """The file as a dict of dataset -> raw entry, migrating the old shape once.

    Returns None when there is no readable file at all, which the callers treat
    differently from an empty one: a file that has gone missing must not read as
    "everything off", or a disk write failure silently stops the agent for a
    night and you find out in the morning.
    """
    try:
        with open(path(), encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    if any(k in data for k in FLAT):
        # The old flat shape, keyed and written back out here rather than
        # re-derived on every read. Deciding the owner once is the whole point:
        # left lazy, the file would keep answering for whichever list the board
        # was showing at the moment something asked.
        out = {_owner(): _clean(data, fallback_on=True)}
        _write(out)
        return out
    return {k: v for k, v in data.items() if isinstance(v, dict)}


def load(name=None):
    """One list's schedule, defaulted.

    With no file at all, the list `.current` names reads as on with the default
    hours and every other list as off. That keeps the old guard — the agent does
    not quietly stop for the list it has been planning — without quietly
    starting on lists he has never switched on.
    """
    name = name or paths.dataset()
    data = _read()
    if data is None:
        return _clean(None, fallback_on=(name == paths.pointer()))
    return _clean(data.get(name))


def load_all():
    """Every eligible list's schedule, keyed by name, in the page's order."""
    return {n: load(n) for n in paths.datasets()}


def _write(data):
    """Atomic, because the dashboard and a run can both be writing this."""
    p = path()
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
        fh.write("\n")
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)


def save(name, entry):
    """A merge rather than a replace.

    The dashboard writes one card at a time and a run can be reading the file
    while it does, so the other lists' entries are read back and written out
    again rather than being whatever this caller happened to hold.
    """
    data = _read() or {}
    data[name] = _clean(entry)
    _write(data)


def due(now, name=None):
    """Whether this list may be planned at this hour.

    The floor is checked here as well as in the setter, on purpose. A file
    edited by hand, or written before `ALLOWED` was narrowed, would otherwise
    name an hour nothing else would ever accept — and the wake that reads it is
    the last place that can still say no.
    """
    s = load(name)
    return bool(s["on"]) and now.hour in ALLOWED and now.hour in s["hours"]


def due_now(now):
    """The lists that want planning at this hour, in the page's order."""
    return [n for n in paths.datasets() if due(now, n)]


def enabled():
    """The lists that are switched on, whatever the hour.

    What a forced run means when no list was named: the ones he has armed,
    rather than every list on disk or whichever one the board happens to be
    showing. `run.sh --force` and the dashboard's agent-level Run now are the
    two callers.
    """
    return [n for n in paths.datasets() if load(n)["on"]]


def main(argv=None):
    """`run.sh` asks in the only way a shell script can: an exit code and stdout.

        schedule.py --datasets        every list that could be planned, one a line
        schedule.py --due-now         the lists due at this hour, one a line
        schedule.py --enabled         the lists switched on, whatever the hour
        schedule.py --due <name>      0 if that list may start now
        schedule.py --json [<name>]   one list's schedule, or all of them, as JSON
    """
    import datetime as dt
    argv = sys.argv[1:] if argv is None else argv
    now = dt.datetime.now().astimezone()

    if "--datasets" in argv:
        print("\n".join(paths.datasets()))
        return 0
    if "--due-now" in argv:
        print("\n".join(due_now(now)))
        return 0
    if "--enabled" in argv:
        print("\n".join(enabled()))
        return 0
    if "--json" in argv:
        rest = [a for a in argv if not a.startswith("--")]
        if rest:
            print(json.dumps(dict(load(rest[0]), allowed=list(ALLOWED))))
        else:
            print(json.dumps({"allowed": list(ALLOWED), "lists": load_all()}))
        return 0
    if "--due" in argv:
        rest = [a for a in argv if not a.startswith("--")]
        return 0 if due(now, rest[0] if rest else None) else 1
    return 0 if due(now) else 1


if __name__ == "__main__":
    raise SystemExit(main())
