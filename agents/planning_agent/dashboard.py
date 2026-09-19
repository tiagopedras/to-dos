#!/usr/bin/env python3
"""This agent's half of the dashboard contract.

The page that switches the scheduled agents on lives in `~/Code/agents-dashboard`
and serves every one of them rather than only this one. It knows nothing about
todo.md, about buckets or about what a plan is — everything it draws for this
agent is printed here, and every click it takes comes back here to be carried out.

Until September 2026 this agent was on that page read-only, because its schedule
was written twice, in the plist and in `run.sh`, and neither could be changed
from anywhere but an editor and a `launchctl reload`. `schedule.py` beside this
is where the hours live now, and this is what lets them be edited.

One target per list. The improvements agent has one per repo it serves; this
one has one per dataset under `data/` with a `todo.md` in it, each with its own
switch, hours and budget. Until 19 Sep 2026 it sent exactly one, for whichever
list `data/.current` pointed at, which meant planning the personal list took
switching the board over and leaving it switched.

    python3 agents/planning_agent/dashboard.py --state     what the page should draw
    python3 agents/planning_agent/dashboard.py --apply     one change, on stdin
    python3 agents/planning_agent/dashboard.py --run       one action, on stdin
    python3 agents/planning_agent/dashboard.py --activity  what it did in a window, on stdin
"""

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "core"))
sys.path.insert(0, HERE)

import paths  # noqa: E402
import pick  # noqa: E402
import schedule  # noqa: E402

PLIST = "com.tiagopedras.todos-planning-agent"


def launchd(label):
    """Whether a launchd job is loaded, without pretending to know more than that.

    `launchctl print` is the only thing that knows whether a job is armed right
    now — a plist sitting in LaunchAgents says nothing about whether it was ever
    loaded, and a log will happily describe a job unloaded a week ago.
    """
    linked = os.path.expanduser("~/Library/LaunchAgents/%s.plist" % label)
    out = {"label": label, "installed": os.path.exists(linked), "loaded": False}
    try:
        proc = subprocess.run(["launchctl", "print", "gui/%d/%s" % (os.getuid(), label)],
                              capture_output=True, text=True, timeout=10)
        out["loaded"] = proc.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        pass
    return out


OUTCOMES = {
    "planned": ("good", "planned"),
    "folded": ("warn", "needs a decision"),
    "skipped": (None, "skipped"),
}


def _last_run():
    """The most recent night's run.json, if one has been written yet.

    Nights before 9 Sep 2026 wrote only index.md, so the newest folder may have
    no record in it. Walking back to the newest one that does is better than
    reporting no run at all, which would read as an agent that has never worked.
    """
    root = paths.plans_dir()
    try:
        days = sorted((d for d in os.listdir(root) if d[:2] == "20"), reverse=True)
    except OSError:
        return None
    for day in days:
        path = os.path.join(root, day, "run.json")
        try:
            with open(path, encoding="utf-8") as fh:
                run = json.load(fh)
        except (OSError, ValueError):
            continue
        rows = []
        for e in run.get("entries") or []:
            tone, label = OUTCOMES.get(e.get("outcome"), (None, e.get("outcome") or "—"))
            rows.append({"tone": tone, "label": label,
                         "text": e.get("title") or "", "tag": None})
        meta = "$%.2f" % (run.get("cost") or 0)
        if run.get("stopped"):
            meta += " · cut short"
        return {"when": (run.get("started") or "")[:16].replace("T", " "),
                "meta": meta, "rows": rows}
    return None


def _queue():
    """What tonight would plan, and what is sitting unread from before.

    `pick.select` is the same call the runner makes and costs nothing beyond
    reading todo.md, so the number on the card is the real queue rather than an
    estimate of it.
    """
    ledger = pick.load_ledger()
    try:
        with open(paths.todo_path(), encoding="utf-8") as fh:
            text = fh.read()
        plan, skip = pick.select(text, day=dt.date.today(), ledger=ledger)
    except (OSError, ValueError):
        return None, None, ledger
    return plan, skip, ledger


def target(name):
    """One list's card. Every path inside is resolved against that list.

    The name is required, and nothing on this page falls back to
    `data/.current`. It is the editor for every list at once, and the board
    rewrites that pointer every time its dropdown moves — so a card that
    quietly described whichever list was open there would file one list's
    queue, log and last run under another list's name.
    """
    with paths.using(name):
        return _target(name)


def _target(name):
    s = schedule.load(name)
    plan, skip, ledger = _queue()

    unread = [k for k, v in ledger.items() if (v or {}).get("status") == "unread"]
    agreed = [k for k, v in ledger.items() if (v or {}).get("status") == "agreed"]

    problems = []
    if plan is None:
        problems.append("Could not read todo.md, so tonight's queue is unknown.")

    out = {
        # The dataset name, which is what `apply` and `start` are sent back and
        # what `PLANNING_DATASET` is set to for a run. Until 19 Sep 2026 this
        # was the agent's own id, because there was only ever one card.
        "id": name,
        # Named for the list it plans against rather than for the agent. The
        # agent's own name is already on the band above these cards, and
        # repeating it here read as a stutter.
        "name": "%s list" % name,
        "subtitle": os.path.join(ROOT, "data", name),
        "subtitle_title": paths.todo_path(),
        "note": "writes plans against the to-do list, never code",
        "on": bool(s["on"]),
        "hours": list(s["hours"]),
        "hours_label": "Hours it may start work · the working day is barred by the runner",
        "problems": problems,
        "actions": [{"id": "run", "label": "Run now"}],
        "last_run": _last_run(),
        "fields": [
            {"key": "budget", "label": "Budget, night", "type": "number",
             "value": s["budget"], "min": 0, "step": 0.5},
            {"key": "max_plans", "label": "Plans a night, at most", "type": "number",
             "value": s["max_plans"], "min": 0, "step": 1,
             "headline": "0 means no cap beyond the budget"},
        ],
    }
    if plan is not None:
        out["counts"] = [
            {"n": len(plan) + len(skip), "l": "eligible", "kind": "total", "opens": "detail",
             "title": "What tonight would plan, and what it would leave"},
            {"n": len(plan), "l": "tonight", "kind": "good", "status": "ready",
             "opens": "detail", "title": "What tonight would plan"},
            {"n": len(unread), "l": "unread plans", "kind": "warn"},
            {"n": len(agreed), "l": "agreed"},
            {"n": len(skip), "l": "skipped"},
        ]
        out["detail"] = {"groups": [
            {"name": "Tonight’s queue", "cards": [
                {"tags": [t.bucket], "tone": "good", "state": "to plan", "status": "ready",
                 "index": n + 1, "text": t.title}
                for n, t in enumerate(plan)]},
            {"name": "Not planned", "cards": [
                {"tags": [t.bucket], "state": "skipped", "status": "backlog", "text": t.title, "why": why}
                for t, why in skip]},
        ]}
    return out


def tail_log(n, name):
    with paths.using(name):
        try:
            with open(paths.log_path(), encoding="utf-8") as fh:
                return fh.read().split("\n")[-n:]
        except OSError:
            return []


def merged_log(n):
    """Every list's log, interleaved, one tagged line each.

    One log per list, because paths.log_path() sits inside that list's own
    plans folder and a night belongs to the list it planned. The card band
    above them is about the agent, though, so this is where they come back
    together: lines sort by their own timestamp prefix, which is fixed-width,
    so lexicographic order is chronological order.
    """
    names = paths.datasets()
    if len(names) == 1:
        return tail_log(n, names[0])
    width = max(len(x) for x in names)
    rows = []
    for name in names:
        for line in tail_log(n, name):
            if not line.strip():
                continue
            stamp, _, rest = line.partition("  ")
            rows.append((stamp, "%s  %-*s  %s" % (stamp, width, name, rest)))
    rows.sort()
    return [line for _, line in rows[-n:]]


def running():
    """Whether any list is mid-run. One lock per list since 19 Sep 2026."""
    return any(os.path.isdir(os.path.join(ROOT, "data", ".planning-agent-%s.lock" % n))
               for n in paths.datasets())


def _summary(all_schedules):
    on = [(n, s) for n, s in all_schedules.items() if s["on"]]
    if not on:
        return "no list is switched on · plans only, nothing is ever executed"
    spend = " · ".join("%s $%.2f" % (n, s["budget"]) for n, s in on)
    return "%s a night · plans only, nothing is ever executed" % spend


def state():
    all_schedules = schedule.load_all()
    return {
        "id": "planning-agent",
        "name": "to-dos planning agent",
        "blurb": "one card per list, each with its own log",
        "summary": _summary(all_schedules),
        "job": launchd(PLIST),
        # No `window`. The contract still carries the field, and nothing here
        # reports one any more: the usage window stopped being a gate on 9 Sep
        # 2026, so an answer about it would be a fact with no consequence on a
        # card about what runs tonight. The schedule below is the whole gate.
        "running": running(),
        "log": merged_log(60),
        # The floor, which is the one thing on this card the page cannot write.
        # `run.sh` refuses to start inside the working day whatever the schedule
        # file says, so an hour it would refuse should not be an hour the page
        # offers. schedule.py is the single place that list is written down.
        "hours_allowed": list(schedule.ALLOWED),
        "actions": [
            {"id": "dry", "label": "Dry run"},
            {"id": "run", "label": "Run now", "primary": True},
        ],
        "targets": [target(n) for n in paths.datasets()],
    }


# --------------------------------------------------------------------------
# what the page asks for


def apply(body):
    # Refused rather than sent to the live list. Every setting this agent has
    # belongs to one list, the page sends the card's own id with all four of
    # its writes, and a change arriving without one is a bug — one that would
    # otherwise land on whichever list the board happened to be showing.
    name = body.get("target")
    if not name:
        return {"ok": False, "error": "a change has to name the list it is for"}
    if name not in paths.datasets():
        return {"ok": False, "error": "no list called %r — this agent plans %s"
                % (name, ", ".join(paths.datasets()))}
    s = schedule.load(name)
    for key, value in (body.get("changes") or {}).items():
        if key == "on":
            s["on"] = bool(value)
        elif key == "hours":
            try:
                hours = sorted({int(h) for h in value})
            except (TypeError, ValueError):
                return {"ok": False, "error": "hours want to be whole numbers"}
            # The floor, refused here rather than quietly dropped. A schedule
            # silently missing the hour he just clicked is worse than being told
            # why he cannot have it.
            barred = [h for h in hours if h not in schedule.ALLOWED]
            if barred:
                return {"ok": False, "error":
                        "%s is inside the working day — this agent will not start then"
                        % ", ".join("%02d:00" % h for h in barred)}
            s["hours"] = hours
        elif key == "budget":
            try:
                s["budget"] = float(value)
            except (TypeError, ValueError):
                return {"ok": False, "error": "budget wants a number"}
        elif key == "max_plans":
            try:
                s["max_plans"] = max(0, int(value))
            except (TypeError, ValueError):
                return {"ok": False, "error": "max_plans wants a whole number"}
        else:
            return {"ok": False, "error": "nothing here owns %r" % key}
    schedule.save(name, s)
    return {"ok": True}


def start(body):
    action = body.get("action")
    if action not in ("run", "dry"):
        return {"ok": False, "error": "no action %r" % action}
    args = [os.path.join(HERE, "run.sh"),
            "--force" if action == "run" else "--dry-run"]
    # A card's own button names its list; the band's button names none, and
    # run.sh reads that as every list that is switched on. Either way the hours
    # are skipped and the floor in run.sh is not.
    name = body.get("target")
    if name:
        if name not in paths.datasets():
            return {"ok": False, "error": "no list called %r" % name}
        args += ["--dataset", name]
    elif not schedule.enabled():
        # run.sh refuses this too, but it is detached by the time it does, so
        # the page would show a button that did nothing rather than a reason.
        return {"ok": False, "error": "no list is switched on — arm one, or use a card's own button"}
    # Detached, because a batch is minutes long and the page must not sit on an
    # open socket for it. Progress is the log, which the page polls anyway.
    try:
        subprocess.Popen(args, cwd=ROOT, stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL, start_new_session=True)
    except OSError as exc:
        return {"ok": False, "error": str(exc)}
    return {"ok": True}


# --------------------------------------------------------------------------
# what it did, for a report rather than a page


def _since(body):
    """The start of the window, defaulted to a day ago and always tz-aware."""
    raw = (body or {}).get("since")
    if raw:
        try:
            when = dt.datetime.fromisoformat(raw)
        except ValueError:
            when = None
        if when is not None:
            return when if when.tzinfo else when.astimezone()
    return dt.datetime.now().astimezone() - dt.timedelta(hours=24)


def _at(raw):
    if not raw:
        return None
    try:
        when = dt.datetime.fromisoformat(str(raw))
    except ValueError:
        return None
    return when if when.tzinfo else when.astimezone()


GENERATED = re.compile(r"^generated:\s*(\S+)\s*$", re.M)
REVISION = re.compile(r"^- \*\*(\d{4}-\d\d-\d\d), revision \d+\.\*\*", re.M)


def _written_at(day, name):
    """When one plan was finished, for the night in question.

    One file per task now, so the frontmatter alone is not enough: a plan
    replanned since day would carry a later `generated:`, naming the night
    that rewrote it rather than the one this record is about. The History
    section is what still holds day's own line — see history() in plan.py,
    which appends rather than replaces — so it is checked first and the
    frontmatter is only a fallback, for a plan that has not been replanned
    since and so has no second History line to prefer over it.
    """
    if not name:
        return None
    try:
        with open(os.path.join(paths.plans_dir(), name), encoding="utf-8") as fh:
            body = fh.read()
    except OSError:
        return None
    for m in REVISION.finditer(body):
        if m.group(1) == day.isoformat():
            return m.group(1)
    m = GENERATED.search(body[:1200])
    return m.group(1) if m else None


# One line per wake is not what this log holds — a wake that finds work writes
# several — so wakes are counted by the minute they happened in. The count is
# the only way a report can tell an agent that was armed and had nothing to plan
# from one that never woke at all, and those look identical in the plans folder.
STAMP = re.compile(r"^(\d{4}-\d\d-\d\d \d\d:\d\d):\d\d\s+(.*)$")
WOKE = ("wake", "a run is already going", "nothing to plan")


def _wakes(since):
    """The minutes this agent was awake in, and the ones it worked in.

    Sets rather than counts since 19 Sep 2026: one wake can now run two lists
    and write into both their logs, and the caller unions them so that reads as
    one wake rather than two.
    """
    try:
        with open(paths.log_path(), encoding="utf-8") as fh:
            lines = fh.read().split("\n")
    except OSError:
        return None
    woke, worked = set(), set()
    for line in lines:
        m = STAMP.match(line)
        if not m:
            continue
        try:
            when = dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M").astimezone()
        except ValueError:
            continue
        if when < since:
            continue
        text = m.group(2)
        if text.startswith(WOKE):
            woke.add(m.group(1))
        if text.startswith("start:"):
            woke.add(m.group(1))
            worked.add(m.group(1))
    return woke, worked


def _day_run(day, since, name):
    """One night's folder as an activity run, or None if it falls outside.

    Named by its caller rather than read back out of paths: the caller has it,
    and a label worked out from the pointer would name the wrong list on every
    run but one.
    """
    record = read_run(day)
    if not record:
        return None
    finished = _at(record.get("finished")) or _at(record.get("started"))
    if finished is not None and finished < since:
        return None

    did, left, first, last = [], [], None, None
    for e in record.get("entries") or []:
        outcome = e.get("outcome")
        if outcome == "skipped":
            left.append({"title": e.get("title") or "", "why": e.get("summary") or ""})
            continue
        when = _written_at(day, e.get("file"))
        if _at(when) is not None and _at(when) < since:
            continue
        tone, label = OUTCOMES.get(outcome, (None, outcome or "—"))
        did.append({"outcome": outcome, "tone": tone, "label": label,
                    "title": e.get("title") or "", "summary": e.get("summary") or "",
                    "ref": e.get("file"), "cost": None,
                    "detail": "needs a decision before it can be planned"
                              if outcome == "folded" else None,
                    "when": when})
        first = first or when
        last = when or last
    if not did and not left:
        return None
    return {"target": "%s list" % name,
            "started": first or record.get("started"),
            "finished": last or record.get("finished"),
            # The night's own total. Plans are not costed one by one in the
            # record, so a window cutting into the middle of a night reports the
            # whole night's spend rather than pretending to divide it.
            "cost": round(record.get("cost") or 0.0, 4),
            "where": os.path.relpath(paths.night_dir(day), ROOT),
            "stopped": record.get("stopped"),
            "did": did, "left": left}


def read_run(day):
    try:
        with open(os.path.join(paths.night_dir(day), "run.json"), encoding="utf-8") as fh:
            record = json.load(fh)
    except (OSError, ValueError):
        return None
    return record if isinstance(record, dict) else None


def activity(body):
    """Every night's work inside the window, oldest first.

    Three days of folders for a window of one. A night runs from 19:00 into the
    next morning and is filed under two dates when it crosses midnight, so a
    window of twenty-four hours routinely touches three of them.
    """
    since = _since(body)
    today = dt.date.today()
    runs, spent = [], 0.0
    woke, worked = set(), set()
    # Every list rather than the live one. A night where the personal list was
    # planned and the board was left on twinkl would otherwise report nothing,
    # which is the same answer as an agent that never woke.
    for name in paths.datasets():
        with paths.using(name):
            for back in range(3, -1, -1):
                run = _day_run(today - dt.timedelta(days=back), since, name)
                if not run:
                    continue
                spent += run["cost"]
                runs.append(run)
            seen = _wakes(since)
            if seen:
                woke |= seen[0]
                worked |= seen[1]
    runs.sort(key=lambda r: str(r.get("started") or ""))
    out = {"id": "planning-agent", "name": "to-dos planning agent",
           "since": since.isoformat(), "cost": round(spent, 4), "unit": "$",
           "runs": runs,
           "note": "every one of these is a proposal; nothing here has been carried out"}
    if woke:
        out["wakes"] = {"total": len(woke), "worked": len(worked)}
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--state", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--activity", action="store_true")
    args = ap.parse_args(argv)

    if args.state:
        print(json.dumps(state()))
        return 0

    try:
        body = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        print(json.dumps({"ok": False, "error": "stdin was not JSON"}))
        return 1

    if args.apply:
        print(json.dumps(apply(body)))
        return 0
    if args.run:
        print(json.dumps(start(body)))
        return 0
    if args.activity:
        print(json.dumps(activity(body)))
        return 0

    ap.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
