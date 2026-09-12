#!/usr/bin/env python3
"""When the planning agent is woken, and the floor that no schedule can go under.

Until September 2026 this was written in two places — twelve wakes in the plist
and a `19:00–06:59` clock check in `run.sh` — and neither could be changed from
anywhere but a text editor and a `launchctl reload`. Now the plist is dumb, the
hourly wake asks this file whether it is due, and the agents dashboard is the
editor. The same arrangement the improvements agent has had from the start, and
for the same reason: a schedule you cannot change is a schedule you leave wrong.

Moving a schedule into a file that a web page can write does remove a guard,
though, and this one guarded something that spends money unattended. So the
floor below is not editable and not in the file. `run.sh` refuses to start
inside the working day whatever the schedule says, the dashboard draws those
hours dead, and both of those come from `ALLOWED` here.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

# The hours this agent may ever be woken at, and the one thing on this page a
# dashboard cannot change. 19:00 to 06:59, which is exactly what the old clock
# check in `run.sh` allowed, so nothing about tonight is different from last
# night. 07:00 is the boundary because it is the same 07:00 `core/windows.py`
# calls the morning: past it, the window being spent in is one he would notice.
ALLOWED = tuple(list(range(19, 24)) + list(range(0, 7)))

DEFAULTS = {
    "on": True,
    "hours": list(ALLOWED),
    "budget": 6.00,
}


def path():
    """Beside the data rather than inside a dataset folder.

    `data/<dataset>/` holds one list and everything true of it; when the agent
    runs is true of the agent, and switching the board from `twinkl` to
    `personal` for ten minutes should not change tonight's schedule.
    """
    return os.path.join(ROOT, "data", "planning-agent-schedule.json")


def load():
    """The schedule, with anything missing or impossible filled in from DEFAULTS.

    A file that has gone missing reads as the defaults rather than as "off".
    The alternative is an agent that silently stops for a night because a disk
    write failed, which is the failure you find out about in the morning.
    """
    out = dict(DEFAULTS)
    try:
        with open(path(), encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return out
    if not isinstance(data, dict):
        return out
    if "on" in data:
        out["on"] = bool(data["on"])
    if "budget" in data:
        try:
            out["budget"] = float(data["budget"])
        except (TypeError, ValueError):
            pass
    if isinstance(data.get("hours"), list):
        out["hours"] = sorted({int(h) for h in data["hours"]
                               if isinstance(h, int) and h in ALLOWED})
    return out


def save(data):
    """Atomic, because the dashboard and a run can both be writing this."""
    p = path()
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, p)


def due(now):
    """Whether the agent may start work at this hour.

    The floor is checked here as well as in the setter, on purpose. A file
    edited by hand, or written before `ALLOWED` was narrowed, would otherwise
    name an hour nothing else would ever accept — and the wake that reads it is
    the last place that can still say no.
    """
    s = load()
    return bool(s["on"]) and now.hour in ALLOWED and now.hour in s["hours"]


def main(argv=None):
    """`run.sh` asks in the only way a shell script can: an exit code.

        python3 agents/planning_agent/schedule.py --due    0 if it may start now
        python3 agents/planning_agent/schedule.py --json   the schedule, as JSON
    """
    import datetime as dt
    import sys
    argv = sys.argv[1:] if argv is None else argv
    if "--json" in argv:
        print(json.dumps(dict(load(), allowed=list(ALLOWED))))
        return 0
    return 0 if due(dt.datetime.now().astimezone()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
