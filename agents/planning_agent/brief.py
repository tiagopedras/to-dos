#!/usr/bin/env python3
"""Writes a short briefing for every open task whose text has moved.

The middle step IMPROVEMENTS.md called for: "Every place that hands a task to
an assistant re-derives its own understanding from the same chaotic notes
field, and none of them leaves behind anything the others could reuse."
`newChat()` (kanban/js/10-reference-sections.js) seeds a chat with a task's
raw notes; `build_prompt()` (plan.py) pastes the same block into a research
prompt; `pa`, grooming a task in conversation, reads it a third way by hand.
None of the three write anything back.

This is the fourth reading, and the only one that leaves something behind:
one short paragraph per task — direction, what's done, what's still needed —
cached in data/<dataset>/briefings.json, keyed the same way the ledger is.
The other three read it from there; none of them call a model to get it.

A pass of its own rather than a by-product of planning, because eligible()
in pick.py only ever sees `ai:: full` tasks — a tenth of the board, at best —
and a briefing is for every open task, planned or not, delegated or not.
Cheap on purpose: a small model, a short answer, no tools, and nothing spent
on a task whose text has not changed since it was last briefed.

    python3 agents/planning_agent/brief.py --dry-run       what it would do, no spend
    python3 agents/planning_agent/brief.py                 the batch
    python3 agents/planning_agent/brief.py --task "..."    one task, by hand
    python3 agents/planning_agent/brief.py --all           ignore the cache
"""

import argparse
import datetime as dt
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "core"))
sys.path.insert(0, HERE)

import paths  # noqa: E402
import pick  # noqa: E402
import plan  # noqa: E402
import todo  # noqa: E402
import windows  # noqa: E402

TASK_TIMEOUT = 60             # one briefing's ceiling, seconds — this is not research
BUDGET_PER_TASK = 0.10        # dollars, handed to --max-budget-usd
BRIEF_BUDGET = 2.00           # dollars across the whole pass
FLOOR = dt.timedelta(minutes=5)   # do not start another briefing below this
MODEL = "claude-haiku-4-5-20251001"


def log(line):
    plan.log("brief: %s" % line)


def briefable(tasks):
    """Every open task — no ai: filter, no column filter, unlike pick.eligible().

    A briefing is read by three things and none of them care whether Claude
    could do the work: newChat() and pa reach a task in any column, and a
    plan is not a precondition either. Only "done" removes a task from this,
    since a briefing exists to orient someone about to pick something up.
    """
    return [t for t in tasks if not t.done]


def load_briefings():
    try:
        with open(paths.briefings_path(), encoding="utf-8") as fh:
            got = json.load(fh)
    except (OSError, ValueError):
        return {"version": 1, "briefed": {}}
    if not isinstance(got, dict) or not isinstance(got.get("briefed"), dict):
        return {"version": 1, "briefed": {}}
    return got


def save_briefings(data):
    path = paths.briefings_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(data, fh, indent=2, sort_keys=True)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def is_stale(task, briefed):
    seen = briefed.get(pick.key_of(task))
    if not seen:
        return True
    return seen.get("fingerprint") != pick.fingerprint(task)


def build_brief_prompt(task):
    """A short ask, not a research brief — see PLAN-BRIEF.md for that one.

    The same materials build_prompt() in plan.py gathers — the task's own
    text, its bucket, its project note, which is already part of the raw
    block rather than a separate fetch — asked to explain rather than to
    propose. No bucket brief, no external reading: the point is a cheap
    read of what is already written, not a second opinion on it.
    """
    block = "\n".join([task.raw] + list(task.body))
    return (
        "Read this one item from a to-do list and write a short briefing for "
        "someone about to pick it up — not what to do about it, just where it "
        "stands. Three short lines, plain prose, no headings and no markdown:\n"
        "Direction: what this is actually asking for, in one line.\n"
        "Done: what is already known to be finished, or \"nothing yet\".\n"
        "Needed: what is still missing before this could be called done.\n\n"
        "If the notes do not say enough to answer one of the three honestly, "
        "say so in that line rather than guessing or padding it out. At most "
        "60 words altogether.\n\n"
        "Bucket: %s. Column: %s.\n\n"
        "```markdown\n%s\n```\n\n"
        "Reply with the three lines and nothing else — no preamble, no "
        "restating the title." % (task.bucket, task.column, block)
    )


def run_brief_agent(task, dry=False):
    """One headless call. Returns (text, cost, error)."""
    cmd = [
        "claude", "-p", build_brief_prompt(task),
        "--model", MODEL,
        "--output-format", "json",
        "--max-budget-usd", str(BUDGET_PER_TASK),
        # No file access needed — this reads only what is handed to it in the
        # prompt — and named on the command line rather than trusted to the
        # default, the same belt-and-braces plan.py's own call uses.
        "--allowedTools", "Read",
    ]
    if dry:
        return None, 0.0, None
    try:
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True,
                              text=True, timeout=TASK_TIMEOUT)
    except subprocess.TimeoutExpired:
        return None, 0.0, "timed out after %d seconds" % TASK_TIMEOUT
    except OSError as exc:
        return None, 0.0, "could not start claude: %s" % exc

    raw = (proc.stdout or "").strip()
    try:
        res = json.loads(raw)
    except ValueError:
        err = (proc.stderr or raw or "no output").strip()
        return None, 0.0, err[:400]

    text = res.get("result") or res.get("text") or ""
    cost = res.get("total_cost_usd") or res.get("cost_usd") or 0.0
    if res.get("is_error") or not text.strip():
        return None, cost, (res.get("error") or text or "empty result")[:400]
    return text.strip(), cost, None


def run(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true", help="ignore the cache")
    ap.add_argument("--task", default=None, help="brief exactly one, by title")
    ap.add_argument("--budget", type=float, default=BRIEF_BUDGET)
    args = ap.parse_args(argv)

    todo_file = paths.todo_path()
    with open(todo_file, encoding="utf-8") as fh:
        text = fh.read()
    tasks = briefable(todo.parse_doc(text))

    if args.task:
        want = args.task.strip().lower()
        hit = [t for t in tasks if t.title.strip().lower() == want]
        if not hit:
            hit = [t for t in tasks if want in t.title.strip().lower()]
        tasks = hit

    briefed = load_briefings()
    todo_list = tasks if (args.all or args.task) else [
        t for t in tasks if is_stale(t, briefed["briefed"])]

    if args.dry_run:
        print("%d to brief, %d unchanged\n" % (len(todo_list), len(tasks) - len(todo_list)))
        for t in todo_list:
            print("  %-58s %s" % (t.title[:58], t.bucket))
        return 0

    if not todo_list:
        log("nothing to brief (%d unchanged)" % len(tasks))
        print("Nothing to brief." if not args.task else
              "No open task matched %r." % args.task)
        return 0

    guard = plan.file_hash(todo_file)
    expiry = windows.current(state=windows.read_state(paths.window_path()))["expires"]
    spent, written, stopped = 0.0, 0, None
    log("start: %d to brief" % len(todo_list))

    for task in todo_list:
        now = dt.datetime.now().astimezone()
        if expiry and expiry - now < FLOOR:
            stopped = "stopped with %d left: under %d minutes of window remaining" % (
                len(todo_list) - written, FLOOR.seconds // 60)
            log(stopped)
            break
        if spent >= args.budget:
            stopped = "stopped with %d left: budget of $%.2f reached" % (
                len(todo_list) - written, args.budget)
            log(stopped)
            break

        result, cost, err = run_brief_agent(task)
        spent += cost or 0.0

        if plan.file_hash(todo_file) != guard:
            stopped = "STOPPED: todo.md changed during the run"
            log(stopped)
            break

        if err:
            log("  failed %-50s %s" % (task.title[:50], err.splitlines()[0][:120]))
            continue

        briefed["briefed"][pick.key_of(task)] = {
            "title": task.title,
            "fingerprint": pick.fingerprint(task),
            "generated": dt.datetime.now().astimezone().isoformat(timespec="seconds"),
            "text": result,
        }
        save_briefings(briefed)
        written += 1
        log("  briefed %-50s $%.3f" % (task.title[:50], cost or 0.0))

    log("done: %d briefed, $%.2f spent%s" % (written, spent, " (cut short)" if stopped else ""))
    print("%d briefed, $%.2f spent" % (written, spent))
    if stopped:
        print(stopped)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
