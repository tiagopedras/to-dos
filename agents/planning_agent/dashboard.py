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

One target, itself. The improvements agent has one target per repo it serves;
this one plans against a single list, so it sends a list of one rather than a
different shape, which is what keeps the page from needing a special case.

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


def target():
    s = schedule.load()
    plan, skip, ledger = _queue()

    unread = [k for k, v in ledger.items() if (v or {}).get("status") == "unread"]
    agreed = [k for k, v in ledger.items() if (v or {}).get("status") == "agreed"]

    problems = []
    if plan is None:
        problems.append("Could not read todo.md, so tonight's queue is unknown.")

    out = {
        "id": "planning-agent",
        # Named for the list it plans against rather than for the agent. The
        # agent's own name is already on the band above this card, and repeating
        # it here read as a stutter; the dataset is also the one thing about
        # this target that can actually change, since data/.current points the
        # whole agent at a different list.
        "name": "%s list" % paths.dataset(),
        "subtitle": os.path.join(ROOT, "data", paths.dataset()),
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


def tail_log(n):
    try:
        with open(paths.log_path(), encoding="utf-8") as fh:
            return fh.read().split("\n")[-n:]
    except OSError:
        return []


def state():
    s = schedule.load()
    return {
        "id": "planning-agent",
        "name": "to-dos planning agent",
        "blurb": "one log, in the dataset it plans against",
        "summary": "$%.2f a night%s · plans only, nothing is ever executed" % (
            s["budget"], (", %d plans at most" % s["max_plans"]) if s["max_plans"] else ""),
        "job": launchd(PLIST),
        # No `window`. The contract still carries the field, and nothing here
        # reports one any more: the usage window stopped being a gate on 9 Sep
        # 2026, so an answer about it would be a fact with no consequence on a
        # card about what runs tonight. The schedule below is the whole gate.
        "running": os.path.isdir(os.path.join(ROOT, "data", ".planning-agent.lock")),
        "log": tail_log(60),
        # The floor, which is the one thing on this card the page cannot write.
        # `run.sh` refuses to start inside the working day whatever the schedule
        # file says, so an hour it would refuse should not be an hour the page
        # offers. schedule.py is the single place that list is written down.
        "hours_allowed": list(schedule.ALLOWED),
        "actions": [
            {"id": "dry", "label": "Dry run"},
            {"id": "run", "label": "Run now", "primary": True},
        ],
        "targets": [target()],
    }


# --------------------------------------------------------------------------
# what the page asks for


def apply(body):
    if (body.get("target") or "planning-agent") != "planning-agent":
        return {"ok": False, "error": "this agent has one target, %r" % "planning-agent"}
    s = schedule.load()
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
    schedule.save(s)
    return {"ok": True}


def start(body):
    action = body.get("action")
    if action not in ("run", "dry"):
        return {"ok": False, "error": "no action %r" % action}
    # Detached, because a batch is minutes long and the page must not sit on an
    # open socket for it. Progress is the log, which the page polls anyway.
    args = [os.path.join(HERE, "run.sh"), "--force"] if action == "run" \
        else [os.path.join(HERE, "run.sh"), "--dry-run"]
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
    return {"total": len(woke), "worked": len(worked)}


def _day_run(day, since):
    """One night's folder as an activity run, or None if it falls outside."""
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
    return {"target": "%s list" % paths.dataset(),
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
    for back in range(3, -1, -1):
        run = _day_run(today - dt.timedelta(days=back), since)
        if not run:
            continue
        spent += run["cost"]
        runs.append(run)
    out = {"id": "planning-agent", "name": "to-dos planning agent",
           "since": since.isoformat(), "cost": round(spent, 4), "unit": "$",
           "runs": runs,
           "note": "every one of these is a proposal; nothing here has been carried out"}
    wakes = _wakes(since)
    if wakes:
        out["wakes"] = wakes
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
