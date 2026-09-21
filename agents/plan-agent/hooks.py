"""The planning agent's part of a night. The shared runner does the rest.

`PACKAGES/agents-engine/RUNNER.md` says what the runner owns: the wake, the
lock, the budget, the stops, the daily log and the dashboard's commands. Since
21 Sep 2026 that is no longer `run.sh` and the loop in `plan.py`. What stays
here is everything about the to-do list and the plans, done by the same
functions as before:

- the queue is `todo.md`, read through `pick.select`, which still decides what
  is due to be planned from its own ledger. The runner never writes the list.
- every file the board reads is still written the same way: the lines in
  `plan-agent.log`, the plan files, `ledger.json`, the day's `index.md` and
  `run.json`, `window.json` on a usage limit, and the one notification on the
  companion's queue. The lock is still `data/.plan-agent-<list>.lock`.
- the briefings and reports still run once per scheduled wake (`on_wake`).
- the batch still stops if todo.md changes under it, and when less than twenty
  minutes of the usage window is left.

One target per list, and `PLANNING_DATASET` is set for whichever list a hook is
answering about, so `paths.py` resolves every path against it as before.
"""

import datetime as dt
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "core"))
sys.path.insert(0, HERE)

import dashboard  # noqa: E402
import paths  # noqa: E402
import pick  # noqa: E402
import plan  # noqa: E402
import schedule  # noqa: E402
import todo  # noqa: E402
import windows  # noqa: E402

ID = "plan-agent"
NAME = "Plan agent"
BLURB = ("works out overnight what each task on the list would take, and writes a plan for each — "
         "nothing it produces has been done")
# The runner's ledger, daily logs and log hold task titles, so they live under
# data/, which is the whole of what this repo's git ignores.
STATE = os.path.join("..", "..", "data", "runner", "plan-agent")
HOURS_PREFERRED = list(schedule.PREFERRED)

# What one list's night has gathered between before() and after().
_night = {}
_skipped = {}


def _use(target_id):
    os.environ["PLANNING_DATASET"] = target_id


# --------------------------------------------------------------------------
# targets, settings and the lock


def targets():
    return [{"id": n, "name": "%s list" % n, "subtitle": os.path.join(ROOT, "data", n),
             "where": os.path.join("data", n, "plans")} for n in paths.datasets()]


def lock_path(target_id):
    """The board's Run now checks this path before it starts anything."""
    return os.path.join(ROOT, "data", ".plan-agent-%s.lock" % target_id)


def load_settings(target_id):
    s = schedule.load(target_id)
    return {"on": s["on"], "hours": s["hours"], "budget": s["budget"], "max_items": s["max_plans"]}


def save_settings(target_id, clean):
    s = schedule.load(target_id)
    for key, value in clean.items():
        s["max_plans" if key == "max_items" else key] = value
    schedule.save(target_id, s)
    return None


# --------------------------------------------------------------------------
# the queue


def _item(task, ledger, skip=None):
    key = pick.key_of(task)
    row = ledger.get(key) or ledger.get(task.title) or {}
    # The planning ledger is what says a task is due again: a plan sent back
    # moves its row, not the task's text. So its row is part of the
    # fingerprint, and the runner's own ledger never holds back a task the
    # planning ledger has released.
    stamp = "|".join(str(row.get(k) or "") for k in ("state", "status", "owner", "planned", "file"))
    return {"id": key, "title": task.title, "fields": {}, "body": "", "task": task, "skip": skip,
            "fingerprint": "%s|%s" % (pick.fingerprint(task), stamp)}


def items(target):
    _use(target["id"])
    with open(paths.todo_path(), encoding="utf-8") as fh:
        text = fh.read()
    ledger = pick.load_ledger()
    only = target.get("only")
    todo_, skip = pick.select(text, day=dt.date.today(), use_ledger=not only, ledger=ledger, only=only)
    out = [_item(t, ledger) for t in todo_]
    # Tasks not tagged ai:full are not candidates at all, and listing thirty of
    # them every night would bury the handful worth reading.
    for t, why in skip:
        if not why.startswith("tagged ai:"):
            out.append(_item(t, ledger, skip=why))
    _skipped[target["id"]] = len(skip)
    return out


def eligible(item, target):
    why = item.get("skip")
    if not why:
        return None
    return {"why": why, "kind": "unchanged" if why.startswith("unchanged") else "refused"}


# --------------------------------------------------------------------------
# around the batch


def on_wake(target):
    """Once per scheduled wake, due or not: briefings, reports, a usage reading."""
    _use(target["id"])
    env = dict(os.environ, PLANNING_DATASET=target["id"])
    for script in ("brief.py", "report.py"):
        code = subprocess.call([sys.executable, os.path.join(HERE, script)], env=env, cwd=ROOT)
        if code:
            plan.log("%s failed with exit %d" % (script, code))
    plan.harvest_usage()


def before(target, todo_, dry):
    _use(target["id"])
    if dry:
        missing = sorted({t["task"].bucket for t in todo_
                          if not plan.agent_on_disk(plan.bucket_agent(t["task"].bucket))})
        return {"note": "no planner for %s, the general one will be used" % ", ".join(missing)} if missing else None
    path = paths.todo_path()
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    _night[target["id"]] = {
        "text": text, "guard": plan.file_hash(path), "written": [],
        "started": dt.datetime.now().astimezone(), "day": dt.date.today(),
        "expiry": windows.current(state=windows.read_state(paths.window_path()))["expires"],
    }
    plan.log("start: %d to plan, %d skipped" % (len(todo_), _skipped.get(target["id"], 0)))
    return {"where": os.path.relpath(paths.plans_dir(), ROOT)}


def should_stop(target, run):
    night = _night.get(target["id"]) or {}
    expiry = night.get("expiry")
    if expiry and expiry - dt.datetime.now().astimezone() < plan.FLOOR:
        return "under %d minutes of the usage window remaining" % (plan.FLOOR.seconds // 60)
    return None


def after(target, run):
    _use(target["id"])
    night = _night.pop(target["id"], None)
    skipped = [(l["title"], l["why"]) for l in run["left"]]
    skipped += [(d["title"], "the run failed") for d in run["did"] if d["outcome"] == "failed"]
    if night is None:
        plan.log("nothing to plan (%d unchanged)" % len(skipped))
        plan.announce([], [], None)
        return
    stopped = None
    if run["stopped"]:
        left = len([l for l in run["left"] if l.get("kind") == "stopped"])
        stopped = "Stopped with %d left: %s." % (left, run["stopped"])
        plan.log(stopped)
    written = night["written"]
    day = night["day"]
    w, s, st, spent, started = plan.carry_over(day, written, skipped, stopped, run["cost"], night["started"])
    plan.write_index(day, w, s, st)
    plan.write_run_record(day, w, s, st, spent, started)
    plan.prune(day, todo.parse_doc(night["text"]))
    plan.prune_nights(day)
    folded = len([x for x in written if x[3]])
    plan.log("done: %d written%s, $%.2f spent%s" % (
        len(written), (" (%d folded)" % folded) if folded else "", run["cost"], " (cut short)" if stopped else ""))
    plan.announce(written, skipped, stopped)


def notify(target, run, text):
    """after() already queued the one notification the companion shows."""
    return None


# --------------------------------------------------------------------------
# one task


def _prior(task):
    ledger = pick.load_ledger()
    return ledger.get(pick.key_of(task)) or ledger.get(task.title)


def prompt(item, target):
    _use(target["id"])
    return plan.build_prompt(item["task"], _prior(item["task"]))


def options(item, target):
    _use(target["id"])
    return {"agent": plan.planner_for(item["task"].bucket),
            # Named here as well as in each agent definition. A definition is a
            # request; this is what holds, and it runs unattended.
            "tools": ["Read", "Grep", "Glob", "WebFetch", "WebSearch"],
            "dirs": list(plan.EXTRA_DIRS), "budget": plan.BUDGET_PER_TASK,
            "timeout": plan.TASK_TIMEOUT, "cwd": paths.ROOT}


def starting(item, target, opts):
    _use(target["id"])
    task = item["task"]
    wanted = plan.bucket_agent(task.bucket)
    if not plan.agent_on_disk(wanted):
        plan.log("  NO PLANNER for bucket %r — planning %r with the fallback. "
                 "Write agents/plan-agent/%s.md." % (task.bucket, task.title[:50], wanted))
    # Logged before the run: the board's Schedule view reads this line to name
    # the task in flight.
    plan.log("  > %s (%s)" % (task.title[:60], opts["agent"]))
    (_night.get(target["id"]) or {})["began"] = time.time()


def failed(item, result, target):
    _use(target["id"])
    err = result.get("error") or ""
    if result.get("kind") == "limit":
        plan.record_limit(err)
        return
    plan.log("  failed %-50s %s" % (item["title"][:50], (err.splitlines() or [""])[0][:120]))


def land(item, result, target):
    _use(target["id"])
    night = _night[target["id"]]
    task = item["task"]
    if plan.file_hash(paths.todo_path()) != night["guard"]:
        plan.log("STOPPED: todo.md changed during the run. Nothing else was attempted.")
        plan.log("  the agent for %r is the suspect; check it before running again" % task.title)
        return {"failed": "todo.md changed while this task was being planned, so no plan was written",
                "fix": "Check what the agent for this task did before running again.",
                "stop": "todo.md changed during the run"}
    prior = _prior(task)
    out, summary, folded = plan.write_plan(task, result.get("text") or "", result.get("session"), night["day"],
                                           prior=prior)
    plan.queue_attach(task, result.get("session"))
    name = os.path.basename(out)
    night["written"].append((name, task.title, summary, folded))
    if folded:
        plan.log("  folded  %-50s needs a decision from him first" % task.title[:50])
    ledger = pick.load_ledger()
    ledger.pop(task.title, None)
    ledger[pick.key_of(task)] = {
        "title": task.title, "fingerprint": pick.fingerprint(task), "planned": night["day"].isoformat(),
        "file": name, "night": night["day"].isoformat(), "state": "review", "owner": "me",
        "seen": False, "resolution": "",
    }
    pick.save_ledger(ledger)
    took = int(time.time() - night.get("began", time.time()))
    plan.log("  planned %-50s %3ds  $%.2f" % (task.title[:50], took, result.get("cost") or 0.0))
    return {"label": "needs a decision" if folded else "planned", "tone": "warn" if folded else "good",
            "ref": os.path.join("data", target["id"], "plans", name),
            "summary": summary or ("folded: it needs a decision from you first" if folded else "plan written"),
            "detail": "Folded: the plan asks you something before it can go further." if folded else None}


# --------------------------------------------------------------------------
# the dashboard, beyond what the runner draws


def card(target, card):
    extra = dashboard.target(target["id"])
    for key in ("name", "subtitle", "subtitle_title", "note", "counts", "detail"):
        if key in extra:
            card[key] = extra[key]
    card["problems"] = extra.get("problems", []) + card["problems"]
    return card
