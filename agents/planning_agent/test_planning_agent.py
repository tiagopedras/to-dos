#!/usr/bin/env python3
"""Checks on the two pieces of arithmetic that decide whether money gets spent.

The window rule and the picker both make their decisions hours before anyone is
awake to see them go wrong, and both are easy to get subtly backwards. So they
are tested against fabricated nights rather than against whatever happens to be
in ~/.claude today, which is the only way to check the 02:00 cutoff without
waiting until 02:00.

    python3 agents/planning_agent/test_planning_agent.py
"""

import datetime as dt
import io
import os
import shutil
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "core"))
sys.path.insert(0, HERE)

import brief  # noqa: E402
import paths  # noqa: E402
import pick  # noqa: E402
import plan  # noqa: E402
import report  # noqa: E402
import todo  # noqa: E402
import windows  # noqa: E402

TZ = dt.timezone(dt.timedelta(hours=1))
FAILED = []


def check(name, got, want):
    if got != want:
        FAILED.append("%s\n    got  %r\n    want %r" % (name, got, want))


def at(day, hour, minute=0):
    return dt.datetime(2026, 9, day, hour, minute, tzinfo=TZ)


def turns_ending(*starts):
    """One turn at each given time, which is all reconstruct() needs."""
    return [(s, 1000) for s in starts]


# --- the current window ------------------------------------------------------

def test_windows():
    """What is left of the window right now. No longer a gate on anything.

    The 07:00 rule went on 9 Sep 2026 — a window is anchored to whenever the
    day's first request landed, so it moves every night and hours could not be
    set against it. `plan.py` still asks this before starting another task, and
    the board's chart draws it, so the two boundaries it reads from are still
    worth testing.
    """
    # Estimated from the transcripts: a turn at 20:00 opens a window to 01:00.
    w = windows.current(now=at(4, 21, 0), events=turns_ending(at(4, 20, 0)))
    check("21:00, a turn at 20:00 — open until 01:00", w["expires"], at(5, 1, 0))
    check("and it says where that came from", w["source"], "estimated from transcripts")

    # Nothing recent enough to still be running.
    w = windows.current(now=at(4, 20, 0), events=turns_ending(at(4, 10, 0)))
    check("a window that has already expired is not open", w["expires"], None)
    check("and says so", w["source"], "nothing open")

    # A recorded limit beats the estimate while it stands, and is ignored once
    # it has passed. This is the only exact signal there is.
    live = {"expires": at(5, 5, 0).isoformat()}
    w = windows.current(now=at(5, 1, 0), state=live, events=[])
    check("a recorded reset at 05:00 wins", w["expires"], at(5, 5, 0))
    check("and says which source won", w["source"], "the limit's own reset time")
    stale = {"expires": at(4, 20, 0).isoformat()}
    w = windows.current(now=at(4, 21, 0), state=stale, events=turns_ending(at(4, 10, 0)))
    check("a reset that has passed is ignored", w["expires"], None)

    # The hour means nothing here now. The schedule and its floor are the whole
    # gate, and this module has no opinion about when it is being asked.
    w = windows.current(now=at(4, 11, 0), events=turns_ending(at(4, 10, 30)))
    check("11:00 in the working day is still just a window", w["expires"], at(4, 15, 30))


# --- the picker --------------------------------------------------------------

DOC = """# List

## 1. People

### Waiting review

- [ ] **Sitting with someone** [impact:: high] [effort:: S] [ai:: full]

### Blocked

- [ ] **Stuck** [impact:: high] [effort:: S] [ai:: full]

### Doing

- [ ] **Plain and plannable** [impact:: high] [effort:: M] [ai:: full]
- [ ] **Only half of it** [impact:: high] [effort:: M] [ai:: partial]
- [ ] **Not for Claude** [impact:: high] [effort:: S] [ai:: none]
- [ ] **Already done** [impact:: high] [effort:: S] [ai:: full]
- [ ] **Waits on another** [impact:: high] [effort:: S] [ai:: full] `blocked-by:gate`
- [ ] **Not yet startable** [impact:: high] [effort:: S] [ai:: full] `start:2099-01-01`
- [ ] **Startable now** [impact:: high] [effort:: S] [ai:: full] `start:2020-01-01`

### To do

- [ ] **The gate** [impact:: high] [effort:: S] [ai:: none] `#gate`
"""

DOC = DOC.replace("- [ ] **Already done**", "- [x] **Already done**")


def titles(tasks):
    return sorted(t.title for t in tasks)


def test_pick():
    plan_, skip = pick.select(DOC, day=dt.date(2026, 9, 5), use_ledger=False)
    check("eligible tasks", titles(plan_),
          ["Plain and plannable", "Startable now"])

    # ai:partial is out as of 6 Sep 2026, and it is the one exclusion that says
    # why on the board rather than being silently dropped.
    why = {t.title: w for t, w in skip}
    check("partial is not planned", "Only half of it" in why, True)
    check("and says why", why.get("Only half of it"), "tagged ai:partial, and only ai:full is planned")
    check("ai:none is dropped quietly", "Not for Claude" in why, False)

    # The ledger: unchanged is skipped, changed is planned again, and an accepted
    # plan is left alone — since 12 Sep 2026 `done` is the end of the planning
    # half rather than a reason to start it over.
    tasks = {t.title: t for t in plan_}
    fp = pick.fingerprint(tasks["Startable now"])
    ledger = {"Startable now": {"fingerprint": fp, "planned": "2026-09-04", "status": "unread"}}
    p2, s2 = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("unchanged is skipped", titles(p2), ["Plain and plannable"])
    check("and says why", s2[0][1].startswith("unchanged"), True)

    ledger["Startable now"]["status"] = "actioned"
    p3, s3 = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("an accepted plan is left alone", titles(p3), ["Plain and plannable"])
    check("and says so", [w for t, w in s3 if t.title == "Startable now"][0].startswith("last plan actioned"), True)

    # The same question asked of the six states rather than the five words. Both
    # readings have to agree, since a ledger written before 11 Sep 2026 still
    # carries the words and nothing rewrites them.
    ledger["Startable now"] = {"fingerprint": fp, "planned": "2026-09-04",
                               "state": "done", "owner": "me", "resolution": "actioned"}
    pd, _ = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("done is left alone", titles(pd), ["Plain and plannable"])

    ledger["Startable now"]["resolution"] = "superseded"
    ps, _ = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("but a replaced one comes back", titles(ps), ["Plain and plannable", "Startable now"])

    # `accepted`, the state added 12 Sep 2026 for a plan he has approved whose
    # run has not finished. It has to answer this question exactly as `done`
    # does: two live plans on one task is the thing being prevented, and that
    # is just as true while the run is still going as after it ends.
    ledger["Startable now"] = {"fingerprint": fp, "planned": "2026-09-04",
                               "state": "accepted", "owner": "implementing-agent"}
    pac, sac = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("accepted is left alone", titles(pac), ["Plain and plannable"])
    check("and says it was accepted",
          [w for t, w in sac if t.title == "Startable now"][0].startswith("plan accepted"), True)

    # Parked in Backlog. The hold list is what the picker actually reads, but a
    # plan left in `backlog` must not pull the task back in on its own either.
    ledger["Startable now"] = {"fingerprint": fp, "planned": "2026-09-04",
                               "state": "backlog", "owner": "me"}
    pb, _ = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("parked is left alone", titles(pb), ["Plain and plannable"])

    ledger["Startable now"] = {"fingerprint": fp, "planned": "2026-09-04",
                               "status": "actioned"}

    # The two statuses added with the execution half, 6 Sep 2026. They pull in
    # opposite directions and both matter: a rejected plan has to come back, and
    # an agreed one has to be left alone until the work is done.
    ledger["Startable now"]["status"] = "redo"
    pr, _ = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("redo is planned again", titles(pr), ["Plain and plannable", "Startable now"])

    ledger["Startable now"]["status"] = "agreed"
    pa, sa = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("agreed is left alone", titles(pa), ["Plain and plannable"])
    check("and says it is waiting",
          [w for t, w in sa if t.title == "Startable now"][0].startswith("plan agreed"), True)
    ledger["Startable now"]["status"] = "unread"

    ledger["Startable now"] = {"fingerprint": "different", "planned": "2026-09-04",
                               "status": "unread"}
    p4, _ = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("changed is planned again", titles(p4), ["Plain and plannable", "Startable now"])

    # The fingerprint covers the notes, not just the title line. Both sides are
    # found by title rather than by position: in_order sorts on the rules now,
    # so adding a tag can legitimately move a task up the queue and an index
    # would be comparing two different tasks.
    def only_task(text, title):
        return next(t for t in pick.select(text, use_ledger=False)[0]
                    if t.title == title)

    a = only_task(DOC, "Plain and plannable")
    b = only_task(DOC.replace("**Plain and plannable** [impact:: high]",
                              "**Plain and plannable** [impact:: high] `week`"),
                  "Plain and plannable")
    check("a changed tag changes the fingerprint",
          pick.fingerprint(a) != pick.fingerprint(b), True)

    # --task finds one by exact title, ignoring every other rule.
    only, _ = pick.select(DOC, only="stuck")
    check("--task reaches a blocked task", titles(only), ["Stuck"])


def test_order():
    """The board's say in the queue: what runs first, and what does not run.

    Order matters because the batch stops on a budget, a floor or a usage limit,
    so the front of the queue is the part that reliably gets planned. These check
    the two rules that are easy to get backwards: an unranked task goes to the
    back rather than the front, and a hold beats everything including --all.
    """
    day = dt.date(2026, 9, 5)
    order = {"order": ["Startable now"], "hold": []}
    p1, _ = pick.select(DOC, day=day, use_ledger=False, order=order)
    check("the ranked task leads", [t.title for t in p1],
          ["Startable now", "Plain and plannable"])

    # A task the board has never ranked queues behind what he has prioritised,
    # rather than jumping it. Without this, every new task would arrive at the
    # front of the night.
    order = {"order": ["Plain and plannable"], "hold": []}
    p2, _ = pick.select(DOC, day=day, use_ledger=False, order=order)
    check("an unranked task goes to the back", [t.title for t in p2],
          ["Plain and plannable", "Startable now"])

    # A stored title that is not in tonight's queue is never matched, which is
    # why nothing ever has to prune this file.
    order = {"order": ["Something deleted last week", "Startable now"], "hold": []}
    p3, _ = pick.select(DOC, day=day, use_ledger=False, order=order)
    check("a title that no longer exists is simply not matched",
          [t.title for t in p3], ["Startable now", "Plain and plannable"])

    order = {"order": [], "hold": ["startable NOW"]}
    p4, s4 = pick.select(DOC, day=day, use_ledger=False, order=order)
    check("a held task is dropped, whatever its case", titles(p4),
          ["Plain and plannable"])
    check("and says it was held rather than skipped by a rule",
          [why for t, why in s4 if t.title == "Startable now"],
          ["held back from the board"])

    # --all exists to ignore the ledger, which is a cache. A hold is an
    # instruction, and the one control he has over the night.
    p5, _ = pick.select(DOC, day=day, use_ledger=False,
                        order={"order": [], "hold": ["Startable now"]})
    check("--all does not override a hold", titles(p5), ["Plain and plannable"])

    # The file itself. Missing, or written by hand and wrong, it must read as
    # empty rather than take the queue down with it — it is a preference, and
    # losing it should cost an ordering and nothing else.
    import json
    import tempfile
    check("a missing order file reads as empty",
          pick.load_order("/nowhere/at/all.json"), {"order": [], "hold": []})
    tmp = tempfile.mkdtemp(prefix="order-test-")
    try:
        path = os.path.join(tmp, "queue-order.json")
        for junk in ('not json at all', '[]', '{"order": "a string"}', '{"hold": null}'):
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(junk)
            check("%s reads as empty" % junk[:22],
                  pick.load_order(path), {"order": [], "hold": []})
        pick.save_order({"order": ["One", "  "], "hold": ["Two"]}, path)
        check("saving drops blank titles", pick.load_order(path),
              {"order": ["One"], "hold": ["Two"]})
        with open(path, encoding="utf-8") as fh:
            check("and stamps when it was saved", "saved" in json.load(fh), True)
    finally:
        __import__("shutil").rmtree(tmp, ignore_errors=True)


# --- the rules the queue falls back on ---------------------------------------

RULES_DOC = """# List

## 1. People

### To do

- [ ] **Undated low value** [impact:: low] [effort:: L] [ai:: full]
- [ ] **Dated next week** [impact:: low] [effort:: L] [ai:: full] [due:: 2026-09-12]

## 2. DS

### To do

- [ ] **Undated high value** [impact:: high] [effort:: S] [ai:: full]
- [ ] **Overdue** [impact:: low] [effort:: L] [ai:: full] [due:: 2026-09-01]
- [ ] **The one thing** [impact:: low] [effort:: L] [ai:: full] `headline:2026-09-04`
"""


def test_rules():
    """What orders the queue when he has not dragged anything.

    This is the half that decides most nights, because the stored order only
    ever covers what he has actually touched. It went wrong once and expensively
    — on 5 Sep 2026 the fallback was file order, file order is bucket order, and
    the first full batch spent its entire budget on Design System while three
    buckets got nothing. So each key is pinned separately here.
    """
    day = dt.date(2026, 9, 5)
    order = {"order": [], "hold": []}
    # Not titles(), which sorts: every check here is about the order itself.
    ranked = lambda o: [t.title for t in
                        pick.select(RULES_DOC, day=day, use_ledger=False, order=o)[0]]
    got = ranked(order)

    check("the headline leads, whatever it scores", got[0], "The one thing")
    check("then the dates, soonest first, because a date beats a score",
          got[1:3], ["Overdue", "Dated next week"])
    check("then the undated, by impact against effort",
          got[3:], ["Undated high value", "Undated low value"])

    # The whole point of sorting on the rules: a bucket cannot drain the night
    # just by sorting early in the file.
    buckets = [t.bucket for t in
               pick.select(RULES_DOC, day=day, use_ledger=False, order=order)[0]]
    check("buckets interleave rather than draining in file order",
          buckets, ["DS", "DS", "People", "DS", "People"])

    # And he still wins. A dragged order is him saying "this one first" and it
    # sits above every rule above.
    dragged = {"order": ["Undated low value"], "hold": []}
    check("what he dragged outranks the headline",
          ranked(dragged)[0], "Undated low value")


# --- folding -----------------------------------------------------------------

def test_folding():
    """An agent that stops and asks rather than guessing.

    See the folding rule in PLAN-BRIEF.md. The runner has to be able to tell a
    fold from a plan, because the two want opposite things from him and a fold
    that reads like a plan is a question nobody answers.
    """
    import shutil
    import tempfile

    task = todo.parse_task(["- [ ] **Improve the app** [impact:: high] "
                            "[effort:: L] [ai:: partial]"])
    task.bucket, task.column = "Processes", "Backlog"
    day = dt.date(2026, 9, 5)

    tmp = tempfile.mkdtemp(prefix="fold-test-")
    real = plan.paths.plans_dir
    plan.paths.plans_dir = lambda: tmp
    try:
        folded_text = ("---\nstatus: unread\noutcome: folded\n"
                       "summary: Needs the scope settled.\n---\n\n"
                       "### What I could establish\n\nNot much.\n")
        out, summary, folded = plan.write_plan(task, folded_text, "", day)
        check("a folded plan is recognised", folded, True)
        check("and keeps the agent's summary", summary, "Needs the scope settled.")
        text = open(out, encoding="utf-8").read()
        # `outcome: folded` was this stream's own word for it until 11 Sep 2026.
        # It is `needs_you` now, which is the same fact the improvements backlog
        # already carried under that name: an unattended agent must not act on
        # this. One canonical field, two streams. See work_streams/CONTRACT.md.
        check("folding survives into the file", "needs_you: yes" in text, True)
        check("and a plan nobody folded says so", "needs_you: no" in
              open(plan.write_plan(task, "---\nsummary: Fine.\n---\n\nBody.\n", "", day)[0],
                   encoding="utf-8").read(), True)

        plain = "---\nstatus: unread\nsummary: Do the thing.\n---\n\nBody.\n"
        _, _, folded = plan.write_plan(task, plain, "", day)
        check("an ordinary plan is not folded", folded, False)

        # `[fill in]` is the brief's marker for a fact the agent could not
        # establish. Reusing it for "the agent forgot the summary line" made two
        # different problems read identically, which is how two of ten plans on
        # 5 Sep 2026 listed as "[fill in]" with no way to tell why.
        _, summary, _ = plan.write_plan(
            task, "---\nstatus: unread\n---\n\nNo summary line.\n", "", day)
        check("a missing summary says so rather than borrowing [fill in]",
              summary, "The agent wrote no summary line.")
    finally:
        plan.paths.plans_dir = real
        shutil.rmtree(tmp, ignore_errors=True)


def test_one_file_per_task():
    """A replan overwrites the same file in place, History and all.

    See IMPROVEMENTS.md, "Replanning a task writes a second plan file instead
    of replacing the first." write_plan() used to mint a fresh path every
    call; it writes to the same one now, for as long as the task's identity
    (its id, via plan_filename()) does not change.
    """
    import shutil
    import tempfile

    task = todo.parse_task(["- [ ] **Fix the thing** [impact:: high] "
                            "[effort:: L] [ai:: full] `id:zz9988`"])
    task.bucket, task.column = "Processes", "Backlog"
    day1, day2 = dt.date(2026, 9, 1), dt.date(2026, 9, 3)

    tmp = tempfile.mkdtemp(prefix="onefile-test-")
    real = plan.paths.plans_dir
    plan.paths.plans_dir = lambda: tmp
    try:
        check("the filename carries the task's own id",
              plan.plan_filename(task), "fix-the-thing-zz9988.md")

        out1, _, _ = plan.write_plan(
            task, "---\nsummary: First pass.\n---\n\nDo the thing.\n", "sess-1", day1)
        ledger_row = {"file": os.path.basename(out1), "night": day1.isoformat(),
                      "state": "ready", "owner": "planning-agent"}

        out2, _, _ = plan.write_plan(
            task, "---\nsummary: Second pass.\n---\n\nDo it differently.\n",
            "sess-2", day2, prior=ledger_row)

        check("the replan lands in the same file", out2, out1)
        check("exactly one file exists for this task",
              sorted(f for f in os.listdir(tmp) if f.endswith(".md")),
              ["fix-the-thing-zz9988.md"])

        text = open(out2, encoding="utf-8").read()
        check("revision 2 is recorded", "revision: 2" in text, True)
        check("the first pass's History line survives the overwrite",
              "revision 1." in text, True)
        check("and the second pass's is appended, not replacing it",
              "revision 2." in text, True)
        check("the latest body is what is on disk", "differently" in text, True)
        check("the first pass's body is not", "Do the thing." in text, False)
    finally:
        plan.paths.plans_dir = real
        shutil.rmtree(tmp, ignore_errors=True)


def test_prune():
    """A plan ages out only once its task is gone, and only after a grace period.

    Replaces the old folder-age prune(): one file per task means a live
    task's plan is current regardless of age, and what wants pruning now is
    an orphan — a plan whose task no longer exists on the list at all.
    """
    import shutil
    import tempfile

    tmp = tempfile.mkdtemp(prefix="prune-test-")
    real = plan.paths.plans_dir
    plan.paths.plans_dir = lambda: tmp
    today = dt.date(2026, 10, 1)
    old = today - dt.timedelta(days=plan.KEEP_DAYS + 5)
    recent = today - dt.timedelta(days=3)

    def write(name, task_id, stamp):
        path = os.path.join(tmp, name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("---\ntitle: X\nabout: task:%s\n---\n\nBody.\n" % task_id)
        ts = dt.datetime.combine(stamp, dt.time(12, 0)).timestamp()
        os.utime(path, (ts, ts))

    try:
        write("still-here.md", "aaaaaa", old)     # task still on the list
        write("gone-recent.md", "bbbbbb", recent)  # orphaned, but too fresh
        write("gone-old.md", "cccccc", old)        # orphaned, past the grace period

        live_task = todo.parse_task(
            ["- [ ] **Still here** [impact:: high] [effort:: S] [ai:: full] `id:aaaaaa`"])
        plan.prune(today, [live_task])

        left = sorted(os.listdir(tmp))
        check("the plan for a task still on the list survives, however old",
              "still-here.md" in left, True)
        check("an orphan inside its grace period survives too",
              "gone-recent.md" in left, True)
        check("an orphan past KEEP_DAYS is the one that goes",
              "gone-old.md" in left, False)
    finally:
        plan.paths.plans_dir = real
        shutil.rmtree(tmp, ignore_errors=True)


def test_briefing():
    """The cache brief.py writes, and the two things that read it back.

    See IMPROVEMENTS.md, "Every place that hands a task to an assistant
    re-derives its own understanding from the same chaotic notes field."
    run_brief_agent() is the one piece that spends money and is not covered
    here, the same reasoning plan.py's own run_agent() is not — see that
    module's own docstring.
    """
    task = todo.parse_task(
        ["- [ ] **Ship the thing** [impact:: high] [effort:: M] [ai:: none] "
         "`id:bb77cc`",
         "  - Project: data/projects/the-thing"])
    task.bucket, task.column = "BAU", "To do"

    check("every open task is briefable regardless of its ai: tag",
          [t.title for t in brief.briefable([task])], ["Ship the thing"])
    done = todo.parse_task(["- [x] **Done already** `done:2026-09-01` `id:zz0000`"])
    check("a finished task is not", brief.briefable([task, done]), [task])

    prompt = brief.build_brief_prompt(task)
    check("the prompt carries the task's own text", "Ship the thing" in prompt, True)
    check("and the project note that is already part of it",
          "data/projects/the-thing" in prompt, True)
    check("and asks for the three-line shape, not a plan",
          "Direction:" in prompt and "Needed:" in prompt, True)
    check("it is not asked to research or propose",
          "Research it" not in prompt, True)

    import tempfile
    tmp = tempfile.mkdtemp(prefix="briefing-test-")
    real = brief.paths.briefings_path
    brief.paths.briefings_path = lambda: os.path.join(tmp, "briefings.json")
    try:
        empty = brief.load_briefings()
        check("a missing cache reads as empty", empty, {"version": 1, "briefed": {}})
        check("and every task is stale against it",
              brief.is_stale(task, empty["briefed"]), True)

        empty["briefed"][pick.key_of(task)] = {
            "title": task.title, "fingerprint": pick.fingerprint(task),
            "generated": "2026-09-14T12:00:00", "text": "Direction: ship it.\n"}
        brief.save_briefings(empty)
        reloaded = brief.load_briefings()
        check("it round-trips through disk", reloaded, empty)
        check("and is no longer stale, same fingerprint",
              brief.is_stale(task, reloaded["briefed"]), False)

        task2 = todo.parse_task(
            ["- [ ] **Ship the thing, with more to it now** [impact:: high] "
             "[effort:: M] [ai:: none] `id:bb77cc`"])
        check("but a task whose text moved is stale again, same id",
              brief.is_stale(task2, reloaded["briefed"]), True)

        # plan.py's own reader — an addition to build_prompt(), not a
        # replacement for the verbatim block.
        real_bp = plan.paths.briefings_path
        plan.paths.briefings_path = brief.paths.briefings_path
        try:
            check("plan.py reads the same cache back",
                  plan.task_briefing(task), "Direction: ship it.\n")
            check("and folds it into the prompt as an orientation, not instead of the text",
                  ("Direction: ship it." in plan.build_prompt(task)
                   and "Ship the thing" in plan.build_prompt(task)), True)
        finally:
            plan.paths.briefings_path = real_bp
        never_briefed = todo.parse_task(
            ["- [ ] **Something else entirely** [impact:: low] [effort:: S] "
             "[ai:: none] `id:dd99ee`"])
        check("a task never briefed gets nothing added",
              plan.task_briefing(never_briefed), "")
    finally:
        brief.paths.briefings_path = real
        shutil.rmtree(tmp, ignore_errors=True)


def test_report():
    """report.py's deterministic pieces — see IMPROVEMENTS.md, "A report he
    defines once cannot be written down anywhere." run_report_agent() itself
    is untested here for the same reason brief.py's own model call is not:
    it spends real money, and agents/planning_agent/report.py's own
    end-to-end run against the real list is the check that matters, done by
    hand rather than in a suite anyone might run unattended.
    """
    import shutil
    import tempfile

    tmp = tempfile.mkdtemp(prefix="report-test-")
    try:
        defpath = os.path.join(tmp, "a-def.md")
        with open(defpath, "w", encoding="utf-8") as fh:
            fh.write("---\ntitle: A Test Report\nwindow_days: 7\n"
                     "buckets: Design System, People\n---\n\nWhat moved.\n")
        parsed = report.read_def(defpath)
        check("title, window and body all read off the frontmatter",
              (parsed["title"], parsed["window_days"], parsed["body"]),
              ("A Test Report", 7, "What moved."))
        check("a comma list of buckets splits and trims",
              parsed["buckets"], ["Design System", "People"])

        no_buckets = os.path.join(tmp, "b-def.md")
        with open(no_buckets, "w", encoding="utf-8") as fh:
            fh.write("---\ntitle: Everything\nwindow_days: 30\n---\n\nBody.\n")
        check("no buckets: line means every bucket, not zero of them",
              report.read_def(no_buckets)["buckets"], None)

        not_a_def = os.path.join(tmp, "c-def.md")
        with open(not_a_def, "w", encoding="utf-8") as fh:
            fh.write("---\ntitle: Missing the one field that matters\n---\n\nBody.\n")
        check("a file with no window_days is not a definition at all",
              report.read_def(not_a_def), None)

        today = dt.date(2026, 9, 14)
        check("never rendered is always due", report.due(parsed, {}, today), True)
        state = {parsed["name"]: {"last_rendered": "2026-09-10"}}
        check("4 days into a 7-day window is not due yet",
              report.due(parsed, state, today), False)
        state = {parsed["name"]: {"last_rendered": "2026-09-06"}}
        check("a full window having passed is due again",
              report.due(parsed, state, today), True)

        period = {"window_start": "Mon 1 Sep 2026", "window_end": "Mon 14 Sep 2026"}
        agent_reply = ("---\ntopic: What moved\nsummary: The thing that mattered.\n---\n\n"
                       "# A Test Report\n\nThe body the model wrote.\n")
        real_data_dir = report.paths.data_dir
        write_tmp = tempfile.mkdtemp(prefix="report-write-test-")
        report.paths.data_dir = lambda: write_tmp
        try:
            out = report.write_report(parsed, period, today, agent_reply)
            written = open(out, encoding="utf-8").read()
            check("the board's own fields are set from what report.py already knew",
                  ("title: A Test Report" in written and "date: 2026-09-14" in written
                   and "covers: Mon 1 Sep 2026 to Mon 14 Sep 2026" in written), True)
            check("the model's topic and summary survive",
                  ("topic: What moved" in written and
                   "summary: The thing that mattered." in written), True)
            check("and so does its body", "The body the model wrote." in written, True)

            no_front = report.write_report(parsed, period, today, "Just a body, no frontmatter.\n")
            check("a reply with no frontmatter at all still writes something sane",
                  "summary: The agent wrote no summary line." in
                  open(no_front, encoding="utf-8").read(), True)
        finally:
            report.paths.data_dir = real_data_dir
            shutil.rmtree(write_tmp, ignore_errors=True)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_harvest_usage():
    """harvest_usage()'s own plumbing — logging what came back, and staying
    quiet-but-safe when it didn't. The real PACKAGES/usage_harvester.harvest()
    is not called here: it spawns a real Claude Code session in a pty, which
    is exactly the "spends real money" case run_agent() and run_report_agent()
    are already left untested for. A fake `harvest` module stands in instead,
    injected into sys.modules the way a real `import harvest` would find it,
    so harvest_usage()'s own sys.path.insert never has to resolve to anything
    that exists on this machine.
    """
    import types

    tmp = tempfile.mkdtemp(prefix="harvest-usage-test-")
    real_data_dir = plan.paths.data_dir
    real_module = sys.modules.get("harvest")
    plan.paths.data_dir = lambda: tmp
    try:
        fake = types.ModuleType("harvest")
        fake.harvest = lambda timeout, model, cwd: {"rate_limits": {
            "five_hour": {"used_percentage": 32.0}, "seven_day": {"used_percentage": 18.4}}}
        fake.summarise = lambda record: {"five_hour": 32.0, "seven_day": 18.4}
        sys.modules["harvest"] = fake
        plan.harvest_usage()
        logged = open(paths.log_path(), encoding="utf-8").read()
        check("a real reading logs both windows",
              "usage harvest: 5h 32.0% / 7d 18.4%" in logged, True)

        fake.harvest = lambda timeout, model, cwd: None
        plan.harvest_usage()
        logged = open(paths.log_path(), encoding="utf-8").read()
        check("a harvest that never fired says so rather than raising",
              "usage harvest: the statusline never fired" in logged, True)

        fake.summarise = lambda record: {"five_hour": None, "seven_day": None}
        fake.harvest = lambda timeout, model, cwd: {"rate_limits": {}}
        plan.harvest_usage()
        logged = open(paths.log_path(), encoding="utf-8").read()
        check("a stale or missing window reads n/a rather than crashing",
              "usage harvest: 5h n/a / 7d n/a" in logged, True)
    finally:
        plan.paths.data_dir = real_data_dir
        if real_module is not None:
            sys.modules["harvest"] = real_module
        else:
            sys.modules.pop("harvest", None)
        shutil.rmtree(tmp, ignore_errors=True)


# --- the bucket mapping ------------------------------------------------------

def test_agents():
    for bucket, want in [
        ("People", "planning-people"),
        ("1. People", "planning-people"),
        ("Design System", "planning-design-system"),
        ("DS", "planning-design-system"),
        ("3. DS", "planning-design-system"),
        ("BAU", "planning-work-oversight"),
        ("Work oversight", "planning-work-oversight"),
        ("Strategic", "planning-strategic"),
        ("Processes", "planning-processes"),
        ("Something new", "planning-general"),
        ("", "planning-general"),
    ]:
        check("bucket %r maps" % bucket, plan.bucket_agent(bucket), want)

    for bucket in list(plan.STREAMS) + ["x"]:
        agent = plan.bucket_agent(bucket)
        path = os.path.join(ROOT, "agents", "planning_agent", agent + ".md")
        check("%s exists on disk" % agent, os.path.exists(path), True)

    # The acting half. One agent, not one per bucket — see the note at the top
    # of its own definition for why.
    check("implementing-agent exists on disk",
          os.path.exists(os.path.join(
              ROOT, "agents", "implementing_agent", "implementing-agent.md")), True)

    # A brief is offered only when it has actually been written. This is built
    # against a temporary tree rather than the real briefs, because they live
    # inside `data/`, which is gitignored — a fresh clone has none of it, and a
    # test that asserts his own briefs exist would fail on any machine but this
    # one.
    #
    # The tree is written under a dataset name, and `.current` points at it,
    # because that is the part worth covering: briefs moved inside
    # `data/<dataset>/` on 8 Sep 2026 so that `twinkl` and `personal` stop
    # sharing one set. A path built without the dataset would still find the
    # `people` brief below, so the second dataset is what actually proves it.
    tmp = tempfile.mkdtemp()
    real_root = paths.ROOT
    try:
        paths.ROOT = tmp
        os.makedirs(os.path.join(tmp, "data"))
        io.open(os.path.join(tmp, "data", ".current"), "w",
                encoding="utf-8").write("alpha\n")
        for stream, body in (("people", "# People\n\nwritten out properly.\n"),
                             ("design-system", "# DS\n\n%s\n" % plan.BRIEF_EMPTY)):
            d = os.path.join(tmp, "data", "alpha", "buckets", stream)
            os.makedirs(d)
            io.open(os.path.join(d, "%s.md" % stream), "w", encoding="utf-8").write(body)
        check("a written brief is offered", plan.bucket_brief("People") is not None, True)
        check("one still carrying the marker is not",
              plan.bucket_brief("3. DS"), None)
        check("and a bucket with no folder at all is not",
              plan.bucket_brief("Nothing like it"), None)

        # The same stream name, a different dataset, a different brief. This is
        # the whole point of the move: `general` is the fallback nobody should
        # reach on `twinkl` and the only bucket there is on `personal`, and one
        # folder per stream could not hold both.
        io.open(os.path.join(tmp, "data", ".current"), "w",
                encoding="utf-8").write("beta\n")
        check("a brief from another dataset is not offered here",
              plan.bucket_brief("People"), None)
        d = os.path.join(tmp, "data", "beta", "buckets", "people")
        os.makedirs(d)
        io.open(os.path.join(d, "people.md"), "w",
                encoding="utf-8").write("# People\n\nbeta's own.\n")
        check("its own is", plan.bucket_brief("People"),
              os.path.join(d, "people.md"))
    finally:
        paths.ROOT = real_root
        shutil.rmtree(tmp, ignore_errors=True)

    # Every stream still resolves to a name, whether or not a brief is on disk.
    for stream in set(plan.STREAMS.values()) | {plan.FALLBACK_STREAM}:
        check("%s is a stream name" % stream, isinstance(stream, str) and bool(stream), True)

    check("a limit message is recognised",
          plan.is_limit("Claude usage limit reached, resets at 3:00pm"), True)
    check("an ordinary failure is not", plan.is_limit("file not found"), False)

    # The wording is not ours and it changes. This one is verbatim from a real
    # run on 5 Sep 2026, and it got through the first version of the pattern:
    # the batch logged it as an ordinary failure and would have gone on to fail
    # every remaining task the same way, in about a minute, recording no reset
    # time for the next wake to respect.
    real = "You've hit your session limit \u00b7 resets 12:20pm (Europe/Lisbon)"
    check("a session limit is a limit", plan.is_limit(real), True)
    check("and its reset time is what gets recorded",
          plan._parse_reset(plan.RESET_RE.search(real).group(1)).strftime("%H:%M"),
          "12:20")
    for wording in ["You've hit your weekly limit",
                    "Approaching your rate limit, resets 09:05",
                    "5-hour limit reached"]:
        check("%r is a limit" % wording[:30], plan.is_limit(wording), True)
    for wording in ["no such file", "the agent timed out", "limits.py not found"]:
        check("%r is not" % wording[:30], plan.is_limit(wording), False)
    check("a reset time parses",
          plan._parse_reset("3:00pm").strftime("%H:%M"), "15:00")


# --- the board's side of it --------------------------------------------------

PLAN = """---
title: A planned thing
task: A planned thing
bucket: Design System
column: To do
ai: partial
agent: planning-design-system
date: 2026-09-05
status: unread
summary: One line about it.
---

## What already exists

Something.
"""


def test_server():
    """plan_listing and mark_plan, against a temp folder rather than the real one.

    server.py is imported and its two directory functions redirected, so nothing
    here can reach data/twinkl/ even by accident. That is the same rule the
    board's own tests follow and it is worth the four lines of plumbing.
    """
    import json
    import shutil
    import tempfile
    sys.path.insert(0, os.path.join(ROOT, "kanban"))
    import server

    tmp = tempfile.mkdtemp(prefix="plans-test-")
    try:
        # One file per task, flat under the plans folder — no night subfolder
        # any more. A dated one still exists here (index.md's own home), and
        # plan_listing() has to walk past it without mistaking it for a plan.
        os.makedirs(os.path.join(tmp, "2026-09-05"))
        with open(os.path.join(tmp, "a-planned-thing.md"), "w", encoding="utf-8") as fh:
            fh.write(PLAN)
        with open(os.path.join(tmp, "2026-09-05", "index.md"), "w", encoding="utf-8") as fh:
            fh.write("---\ntitle: Plans\n---\n")
        with open(os.path.join(tmp, "ledger.json"), "w", encoding="utf-8") as fh:
            json.dump({"A planned thing": {"fingerprint": "abc", "planned": "2026-09-05",
                                           "status": "unread", "file": "a-planned-thing.md"}}, fh)

        real_dir, real_ds = server.plans_dir, server.current_dataset
        server.plans_dir = lambda name=None: tmp
        server.current_dataset = lambda: "test"
        try:
            rows = server.plan_listing()
            check("one plan listed, the dated folder skipped", len(rows), 1)
            check("its task comes off the frontmatter", rows[0]["task"], "A planned thing")
            check("and its night off the frontmatter's own date, with no folder to fall back on",
                  rows[0]["night"], "2026-09-05")
            check("status defaults sensibly", rows[0]["status"], "unread")

            # The URL must carry no dataset name. translate_path inserts the
            # current one into every /data/ path, so a URL naming it asks for
            # data/twinkl/twinkl/... and 404s — the plan lists fine and then
            # will not open, which is the shape of bug that survives a listing
            # test. Checked here by pushing it back through translate_path.
            check("the plan url has no dataset in it",
                  rows[0]["url"], "/data/plans/a-planned-thing.md")
            stub = object.__new__(server.Handler)
            stub.directory = server.ROOT          # what __init__ would have set
            resolved = server.Handler.translate_path(stub, rows[0]["url"])
            check("and resolves to one dataset deep, not two",
                  resolved.count("/test/"), 1)

            # The writing is the stream's own, since 11 Sep 2026. The board
            # asks and this performs it, which is what keeps one writer per
            # file — see agents/planning_agent/stream.py and, for why, the note
            # where mark_plan() used to be in kanban/server.py.
            import stream as plans_stream
            real_pd, real_lp = plans_stream.paths.plans_dir, plans_stream.paths.ledger_path
            plans_stream.paths.plans_dir = lambda: tmp
            plans_stream.paths.ledger_path = lambda: os.path.join(tmp, "ledger.json")
            try:
                out = plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "done", "owner": "me", "resolution": "actioned"})
                check("the move succeeds", out.get("ok"), True)
                check("the file now says done", server.plan_listing()[0]["state"], "done")
                check("and says how it finished", server.plan_listing()[0]["resolution"], "actioned")
                with open(os.path.join(tmp, "ledger.json"), encoding="utf-8") as fh:
                    row = json.load(fh)["A planned thing"]
                # Both halves in one call. Writing the file and not the ledger
                # is the bug this replaced: the picker reads the ledger, so a
                # plan finished only in its own frontmatter left the task held
                # out of every future night's queue for ever.
                check("and so does the ledger, which is what the picker reads", row["state"], "done")
                check("the ledger carries the owner too", row["owner"], "me")

                # Accepting a plan. `accepted` is not `done`: he has approved
                # it and the run it feeds has not finished, which is the gap
                # the state was added for on 12 Sep 2026. It needs no
                # resolution, because nothing has closed yet, and it defaults
                # to the implementing agent rather than to him, because the next
                # move on it is a run rather than a decision.
                out = plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "accepted"})
                check("accepting one succeeds with no resolution", out.get("ok"), True)
                check("and lands in accepted", server.plan_listing()[0]["state"], "accepted")
                with open(os.path.join(tmp, "ledger.json"), encoding="utf-8") as fh:
                    row = json.load(fh)["A planned thing"]
                check("owned by the implementing agent by default", row["owner"], "implementing-agent")
                check("and its production half starts at none",
                      server.plan_listing()[0]["production"], "none")
                # He was not the next mover on an accepted plan until 13 Sep
                # 2026, because what happened next was a run on a board of its
                # own. Folding the two boards into one removed that second
                # document, so the same card comes back to him the moment the
                # agent reports — and `accepted` is now owned by whichever of
                # the two is next to move.
                check("accepted may be owned by him, since the fold",
                      plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "accepted", "owner": "me",
                                          "production": "review"}).get("ok"), True)
                check("and the stage it reached is on the plan",
                      server.plan_listing()[0]["production"], "review")
                # Turning one down: a resolution rather than an eighth state,
                # and it needs a reason for the same purpose sending one back
                # does — the record is all that is left of the idea.
                check("turning a plan down needs a reason",
                      plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "done", "resolution": "declined"}).get("ok"), False)
                check("and with one it closes",
                      plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "done", "resolution": "declined",
                                          "reason": "not worth the effort"}).get("ok"), True)
                check("landing in done, said as declined",
                      (server.plan_listing()[0]["state"], server.plan_listing()[0]["resolution"]),
                      ("done", "declined"))
                check("and the reason is kept on the plan",
                      server.plan_listing()[0]["feedback"], "not worth the effort")
                check("but a stage this stream has never heard of is refused",
                      plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "accepted", "production": "halfway"}).get("ok"), False)
                # Put it back where the rest of this section found it.
                plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                    "to": "done", "owner": "me", "resolution": "actioned"})

                # The bad references this stream refuses, since these come off
                # a URL and one of them climbs out of the folder.
                for name in ("../x.md", "missing.md", "no-extension", ""):
                    out = plans_stream.apply({"item": {"name": name}, "to": "review", "owner": "me"})
                    check("refuses %r" % name, out.get("ok"), False)
                check("refuses a state this stream does not have",
                      plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "banana"}).get("ok"), False)
                # An owner is not decoration: an item nobody owns is one nothing
                # will ever pick up.
                check("refuses a state its owner cannot hold",
                      plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "review", "owner": "planning-agent"}).get("ok"), False)
                check("refuses sending one back with no reason",
                      plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "ready", "owner": "planning-agent"}).get("ok"), False)
                # The claim. Advisory on purpose: a claim held by a process
                # that has gone is ignored, because being unable to write your
                # own list after a crash is a worse failure than the one the
                # lock prevents. See PACKAGES/work_streams/writer.py.
                import writer as ws_writer
                lock = os.path.join(tmp, ".plans.lock")
                with open(lock, "w", encoding="utf-8") as fh:
                    # Somebody else's pid, and a live one: a process never
                    # locks itself out, which is why os.getpid() would pass here.
                    json.dump({"who": "something live", "pid": os.getppid(), "at": time.time()}, fh)
                check("refuses a write while something live holds the claim",
                      plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "review", "owner": "me"}).get("ok"), False)
                with open(lock, "w", encoding="utf-8") as fh:
                    json.dump({"who": "a crashed run", "pid": 999999, "at": time.time()}, fh)
                check("but a claim whose process has gone locks nobody out",
                      plans_stream.apply({"item": {"name": "a-planned-thing.md"},
                                          "to": "review", "owner": "me"}).get("ok"), True)
            finally:
                plans_stream.paths.plans_dir, plans_stream.paths.ledger_path = real_pd, real_lp
        finally:
            server.plans_dir, server.current_dataset = real_dir, real_ds
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_queue_routes():
    """queue_listing, set_queue_order and planning_agent_run, against a temp folder.

    Same plumbing as test_server and for the same reason: everything the board
    reads here follows data/.current, and a test that reads the real one would
    be reporting on his actual night rather than checking anything.

    The queue is the part most worth pinning. It is pick.select() rendered, not
    a second implementation of the rules, and the check that matters is that the
    board's ordering actually reaches it — a queue column that showed an order
    the runner then ignored would be worse than no column.
    """
    import json
    import shutil
    import tempfile
    sys.path.insert(0, os.path.join(ROOT, "kanban"))
    import server

    tmp = tempfile.mkdtemp(prefix="queue-test-")
    try:
        plans = os.path.join(tmp, "plans")
        os.makedirs(plans)
        todo_file = os.path.join(tmp, "todo.md")
        with open(todo_file, "w", encoding="utf-8") as fh:
            fh.write(DOC)

        real = (server.plans_dir, server.current_dataset, server.todo_path,
                server.PLANNING_LOCK)
        server.plans_dir = lambda name=None: plans
        server.current_dataset = lambda: "test"
        server.todo_path = lambda name=None: todo_file
        server.PLANNING_LOCK = os.path.join(tmp, ".planning-agent.lock")
        try:
            q = server.queue_listing()
            check("the queue is what pick would plan",
                  sorted(r["title"] for r in q["queue"]),
                  ["Plain and plannable", "Startable now"])
            check("each row carries the agent it would go to",
                  q["queue"][0]["agent"].startswith("planning-"), True)
            check("and why it is being planned", q["queue"][0]["why"], "never planned")
            check("nothing is held to begin with", q["held"], [])

            # The ordering, written the way the board writes it and read back
            # the way the runner reads it. Both halves in one check, because
            # the failure worth catching is them disagreeing.
            got, err = server.set_queue_order(["Startable now"], ["Plain and plannable"])
            check("the ordering saves", err, None)
            q = server.queue_listing()
            check("the board's order is what the queue now shows",
                  [r["title"] for r in q["queue"]], ["Startable now"])
            check("and a held task moves out of it, not out of sight",
                  [r["title"] for r in q["held"]], ["Plain and plannable"])
            check("held is the reason it gives", q["held"][0]["state"], "held")
            check("the file is where the runner looks for it",
                  os.path.isfile(os.path.join(plans, "queue-order.json")), True)

            for bad in [("not a list", []), ([], "not a list"), (["x"] * 501, [])]:
                _, err = server.set_queue_order(*bad)
                check("refuses %r" % (str(bad)[:28],), bool(err), True)

            # The run log. Parsed rather than exported from plan.py, so this is
            # the check that keeps the two in step: these are plan.py's own
            # format strings, filled in.
            with open(os.path.join(plans, "planning-agent.log"), "w", encoding="utf-8") as fh:
                fh.write(
                    "2026-09-05 01:05:00  wake — ride: his window runs to 04:00\n"
                    "2026-09-05 02:05:00  start: 3 to plan, 1 skipped\n"
                    "2026-09-05 02:05:01    > Startable now (planning-people)\n"
                    "2026-09-05 02:08:20    planned Startable now"
                    "                                      199s  $0.74\n"
                    "2026-09-05 02:08:21    > Plain and plannable (planning-processes)\n"
                    "2026-09-05 02:09:00    failed Plain and plannable"
                    "                             the agent timed out\n"
                    "2026-09-05 02:09:01    > Third thing (planning-strategic)\n")
            long_title = "A task with a title fifty characters long, exactly"
            check("the fixture title really is fifty characters", len(long_title), 50)
            with open(os.path.join(plans, "planning-agent.log"), "a", encoding="utf-8") as fh:
                fh.write("2026-09-05 02:09:02    failed %-50s %s\n"
                         % (long_title, "the agent hit an error"))
            n = server.planning_agent_run()
            check("a title that fills the log's field is not eaten by the reason",
                  [f["title"] for f in n["failed"]][-1], long_title)
            check("and the reason survives intact",
                  n["failed"][-1]["why"], "the agent hit an error")

            with open(os.path.join(plans, "planning-agent.log"), encoding="utf-8") as fh:
                kept = [l for l in fh if long_title not in l]
            with open(os.path.join(plans, "planning-agent.log"), "w", encoding="utf-8") as fh:
                fh.writelines(kept)

            n = server.planning_agent_run()
            check("with no lock, nothing is claimed to be running", n["live"], False)
            check("a run that stopped mid-task is called out",
                  (n["orphan"] or {}).get("title"), "Third thing")
            check("and is not shown as in flight", n["current"], None)
            check("what it wrote is read off the log", [d["title"] for d in n["done"]],
                  ["Startable now"])
            check("with the cost it actually spent", n["done"][0]["cost"], 0.74)
            check("a failure is not counted as written",
                  [f["title"] for f in n["failed"]], ["Plain and plannable"])
            check("and keeps its reason", n["failed"][0]["why"], "the agent timed out")
            check("and the batch size comes off the start line", n["toPlan"], 3)
            check("so the remainder is arithmetic rather than a guess", n["left"], 1)

            os.makedirs(server.PLANNING_LOCK)
            n = server.planning_agent_run()
            check("the lock is what makes a run live", n["live"], True)
            check("and the task in flight is then a real one",
                  (n["current"] or {}).get("agent"), "planning-strategic")
            check("with nothing orphaned", n["orphan"], None)

            # Everything before the last `start:` belongs to a previous night.
            with open(os.path.join(plans, "planning-agent.log"), "a", encoding="utf-8") as fh:
                fh.write("2026-09-06 02:05:00  start: 1 to plan, 4 skipped\n")
            n = server.planning_agent_run()
            check("a new run does not inherit the last one's tally", n["done"], [])
            check("nor its failures", n["failed"], [])

            # The button. Only the refusals are checked here — the success path
            # spends real money on real agents, which is not a thing a test
            # suite gets to do.
            _, err = server.start_planning_agent_run()
            check("it will not start a second run on top of one going",
                  (err or {}).get("error"), "a run is already going")
            os.rmdir(server.PLANNING_LOCK)

            real_root = server.ROOT
            server.ROOT = tmp                 # no agents/planning_agent/run.sh under here
            try:
                _, err = server.start_planning_agent_run()
                check("nor one with no runner to start", bool(err), True)
            finally:
                server.ROOT = real_root
        finally:
            (server.plans_dir, server.current_dataset, server.todo_path,
             server.PLANNING_LOCK) = real
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_usage_chart():
    """rolling_week and ceiling — the two figures the usage chart is drawn from.

    Both are arithmetic over dates, which is the kind of thing that looks right
    and is off by one. Fabricated windows rather than the real transcripts, for
    the same reason the window rule is tested that way: the real ones change
    every time anybody uses Claude.
    """
    sys.path.insert(0, os.path.join(ROOT, "kanban"))
    import server

    today = dt.date.today()

    def win(days_ago, tok, hour=20):
        when = dt.datetime.combine(today - dt.timedelta(days=days_ago),
                                   dt.time(hour), tzinfo=TZ)
        return {"start": when, "end": when + windows.WINDOW, "tok": tok, "turns": 1}

    # Ten days, one window a day, one token each. Every seven-day total is 7.
    wins = [win(n, 1) for n in range(9, -1, -1)]
    roll = server.rolling_week(wins, 10)
    check("a rolling total per day, minus the six it cannot fill",
          len(roll), 4)
    check("the first is not the first day of the range",
          roll[0]["day"], (today - dt.timedelta(days=3)).isoformat())
    check("the last is today", roll[-1]["day"], today.isoformat())
    check("and each covers seven days", [r["tok"] for r in roll], [7, 7, 7, 7])

    # A quiet fortnight then four heavy days: the total climbs one day at a
    # time as the heavy days enter the window, rather than stepping.
    wins = [win(n, 1 if n >= 4 else 10) for n in range(13, -1, -1)]
    roll = server.rolling_week(wins, 14)
    check("a heavy run climbs rather than steps",
          [r["tok"] for r in roll][-4:], [16, 25, 34, 43])

    # Two windows opened on one day both count, on that day.
    same = [win(3, 5, hour=9), win(3, 5, hour=20)] + [win(n, 0) for n in range(6, -1, -1)]
    check("two windows in a day both count",
          server.rolling_week(same, 8)[-1]["tok"], 10)
    # And a day that has fallen out of the seven no longer does.
    old_day = [win(7, 5)] + [win(n, 0) for n in range(6, -1, -1)]
    check("a window eight days back is out of the total",
          server.rolling_week(old_day, 8)[-1]["tok"], 0)

    check("no windows, no line to draw", server.rolling_week([], 30), [])

    # The ceiling, and which of its two sources wins.
    wins = [win(3, 100), win(2, 400), win(1, 250)]
    roll = [{"day": today.isoformat(), "tok": 750}]
    cap = server.ceiling(wins, roll, {})
    check("with no limit ever hit, the busiest session stands in",
          (cap["session"], cap["source"]), (400, "observed"))
    check("and the week is always the busiest seen", cap["week"], 750)

    cap = server.ceiling(wins, roll, {"limit_tok": 900, "limit_tok_at": "2026-09-05"})
    check("a measured limit beats the observed one",
          (cap["session"], cap["source"]), (900, "measured"))
    check("and says when it was measured", cap["measuredAt"], "2026-09-05")

    # A measured floor lower than something already seen is not a ceiling. The
    # heavier window is proof the allowance is at least that big.
    cap = server.ceiling(wins, roll, {"limit_tok": 200})
    check("a stale measurement below what has been seen does not win",
          (cap["session"], cap["source"]), (400, "observed"))

    # Nothing on disk at all still has to divide by something.
    cap = server.ceiling([], [], {})
    check("an empty ceiling is one, not zero", (cap["session"], cap["week"]), (1, 1))

    # --- the shape of a window, which is what fills its box in ---------------
    # reconstruct() keeps the running total after each turn; window_shape thins
    # it to something worth sending and expresses it as two fractions, so the
    # chart needs neither the window's clock nor its total to draw it.
    start = dt.datetime.combine(today, dt.time(20), tzinfo=TZ)
    even = {"start": start, "end": start + windows.WINDOW, "tok": 100, "turns": 4,
            "shape": [(start + dt.timedelta(hours=h), h * 20) for h in (1, 2, 3, 4, 5)]}
    sh = server.window_shape(even, steps=5)
    check("a window's shape is sampled across its own five hours", len(sh), 5)
    check("and reaches its total at the end", sh[-1], [1.0, 1.0])
    check("an even spend reads as a straight climb",
          [p[1] for p in sh], [0.2, 0.4, 0.6, 0.8, 1.0])

    # Sampled by time and not by turn, which is the whole point: a window that
    # emptied itself in the first hour has to draw as a step, and taking every
    # nth turn would draw it as the same ramp as the one above.
    front = {"start": start, "end": start + windows.WINDOW, "tok": 100, "turns": 3,
             "shape": [(start + dt.timedelta(minutes=m), t)
                       for m, t in ((5, 40), (20, 90), (50, 100))]}
    sh = server.window_shape(front, steps=5)
    check("a front-loaded window reads as a step",
          [p[1] for p in sh], [1.0, 1.0, 1.0, 1.0, 1.0])

    # Nothing spent before the first sample is a flat floor, not a guess.
    late = {"start": start, "end": start + windows.WINDOW, "tok": 100, "turns": 1,
            "shape": [(start + dt.timedelta(hours=4, minutes=30), 100)]}
    check("a window that only spent at the end stays on the floor until then",
          [p[1] for p in server.window_shape(late, steps=5)], [0.0, 0.0, 0.0, 0.0, 1.0])

    check("a window that spent nothing has no shape to draw",
          server.window_shape({"start": start, "end": start + windows.WINDOW,
                               "tok": 0, "turns": 0, "shape": []}), [])
    # reconstruct() is where shape comes from, and every window it makes has one.
    made = windows.reconstruct([(start, 3), (start + dt.timedelta(hours=1), 7)])
    check("reconstruct keeps the running total behind each window",
          [(t, n) for t, n in made[0]["shape"]],
          [(start, 3), (start + dt.timedelta(hours=1), 10)])


def test_runner():
    """Two things about run.sh that cannot be checked by running it.

    Running it spends real money on a real agent, so these read the script
    instead. Both pin a bug that actually happened rather than a hypothetical.
    """
    sh = open(os.path.join(HERE, "run.sh"), encoding="utf-8").read()

    # `exec` replaces the shell, and a replaced shell never runs its EXIT trap,
    # so the lock was held for the full staleness window after every successful
    # run and every wake in between refused to work. It looked fine until there
    # was a second run to block.
    body = sh.split("# --- 3. the window", 1)[-1]
    check("run.sh does not exec plan.py, or the lock leaks",
          "exec " in body.replace("exec $?", ""), False)
    trap = sh.split("trap '", 1)[-1].split("'", 1)[0]
    check("and it does trap the lock off on exit", 'rmdir "$LOCK"' in trap, True)
    # The PID file lives inside the lock directory, so rmdir fails while it is
    # there and the lock outlives the run that took it.
    check("clearing the PID file with it", '"$PIDFILE"' in trap, True)

    # Staleness asks whether the holder is alive before it asks how old the
    # lock is. A laptop asleep mid-batch suspends the holder rather than
    # killing it, so age alone held the lock from 6 to 8 September 2026.
    check("run.sh records the holder's PID with the lock", 'echo $$ > "$PIDFILE"' in sh, True)
    check("and tests it before trusting the mtime", 'kill -0 "$HOLDER"' in sh, True)

    # The agents are told to read ~/Code/CLAUDE.md, SKILLS.md and
    # DS-KNOWN-ISSUES.md. Without --add-dir claude -p cannot see any of them,
    # and the plans get quietly thinner rather than failing.
    src = open(os.path.join(HERE, "plan.py"), encoding="utf-8").read()
    check("plan.py widens the sandbox to ~/Code", "--add-dir" in src, True)
    # And narrows the tools, on the command line rather than only in the agent
    # definition — a definition is a request, the flag is what holds.
    check("and pins the tools on the command line", "--allowedTools" in src, True)
    check("with no Bash among them", "\"Bash\"" in src, False)
    planners = os.path.join(ROOT, "agents", "planning_agent")
    for p in sorted(os.listdir(planners)):
        if not p.startswith("plan-"):
            continue
        head = open(os.path.join(planners, p),
                    encoding="utf-8").read()[:400]
        check("%s claims no Bash either" % p, "Bash" in head, False)


def test_schedule():
    """The floor under the schedule, and that nothing can write below it.

    The hours moved out of run.sh and the plist into a JSON file the agents
    dashboard writes, which removed one of the two guards on something that
    spends money unattended. `schedule.ALLOWED` is what replaced it, so it gets
    more than one check: the floor itself, the loader dropping an hour under it,
    and `due()` refusing to obey a file that already names one.
    """
    import importlib
    import schedule as sched

    check("the floor is the old 19:00-06:59 gate, exactly",
          sorted(sched.ALLOWED), sorted(list(range(0, 7)) + list(range(19, 24))))
    for hour in (7, 12, 18):
        check("%02d:00 is barred" % hour, hour in sched.ALLOWED, False)
    for hour in (19, 23, 0, 6):
        check("%02d:00 is allowed" % hour, hour in sched.ALLOWED, True)

    tmp = tempfile.mkdtemp()
    real_path = sched.path
    try:
        path = os.path.join(tmp, "planning-agent-schedule.json")
        sched.path = lambda: path

        # A file naming a barred hour — edited by hand, or written before the
        # floor was narrowed. The loader drops it and due() refuses it, so
        # neither is the only thing between a stray edit and a run at lunchtime.
        with open(path, "w", encoding="utf-8") as fh:
            fh.write('{"on": true, "hours": [3, 12, 20]}')
        check("load() drops an hour under the floor", sched.load()["hours"], [3, 20])
        check("due() says no at 12:00 even if the file said yes",
              sched.due(at(4, 12)), False)
        check("due() says yes at 03:00", sched.due(at(4, 3)), True)

        # Switched off is switched off, whatever the hours say.
        with open(path, "w", encoding="utf-8") as fh:
            fh.write('{"on": false, "hours": [3]}')
        check("due() says no when the agent is switched off", sched.due(at(4, 3)), False)

        # A missing file reads as the defaults rather than as off. An agent that
        # skipped a night over a failed disk write is a failure you find out
        # about in the morning.
        os.unlink(path)
        check("a missing schedule falls back to on", sched.load()["on"], True)
        check("and to the full allowed range", sched.load()["hours"], list(sched.ALLOWED))
    finally:
        sched.path = real_path
        shutil.rmtree(tmp, ignore_errors=True)
        importlib.reload(sched)


def test_max_plans():
    """How many plans a night stops at, on top of the budget and the floor.

    Three places had to agree: the schedule (default, clamp, round-trip), the
    dashboard (the field the page draws and the setter it posts back to), and
    plan.py's own batch loop, which needs a third stop condition beside the
    budget and the floor. run.sh is what actually carries the schedule's value
    down to a real run, checked here by reading the script rather than running
    it — running it spends real money.
    """
    import importlib
    import schedule as sched

    check("0 is the default — no cap beyond the budget", sched.DEFAULTS["max_plans"], 0)

    tmp = tempfile.mkdtemp()
    real_path = sched.path
    try:
        path = os.path.join(tmp, "planning-agent-schedule.json")
        sched.path = lambda: path

        with open(path, "w", encoding="utf-8") as fh:
            fh.write('{"max_plans": 5}')
        check("load() reads a set max_plans", sched.load()["max_plans"], 5)

        with open(path, "w", encoding="utf-8") as fh:
            fh.write('{"max_plans": -3}')
        check("load() clamps a negative one to 0 rather than carrying it through",
              sched.load()["max_plans"], 0)

        with open(path, "w", encoding="utf-8") as fh:
            fh.write('{"max_plans": "not a number"}')
        check("load() falls back to the default on nonsense rather than raising",
              sched.load()["max_plans"], 0)

        os.unlink(path)
        sched.save({"max_plans": 8})
        check("save() then load() round-trips it", sched.load()["max_plans"], 8)
    finally:
        sched.path = real_path
        shutil.rmtree(tmp, ignore_errors=True)
        importlib.reload(sched)

    import dashboard
    real_path = dashboard.schedule.path
    tmp = tempfile.mkdtemp()
    try:
        path = os.path.join(tmp, "planning-agent-schedule.json")
        dashboard.schedule.path = lambda: path
        with open(path, "w", encoding="utf-8") as fh:
            fh.write('{"max_plans": 4}')

        fields = {f["key"]: f for f in dashboard.target()["fields"]}
        check("the dashboard offers a max_plans field", "max_plans" in fields, True)
        check("carrying the schedule's own value", fields["max_plans"]["value"], 4)
        check("with 0 allowed, which is the no-cap sentinel", fields["max_plans"]["min"], 0)

        result = dashboard.apply({"changes": {"max_plans": 12}})
        check("apply() accepts a change to it", result.get("ok"), True)
        check("and writes it back", dashboard.schedule.load()["max_plans"], 12)

        bad = dashboard.apply({"changes": {"max_plans": "lots"}})
        check("apply() refuses nonsense rather than writing it", bad.get("ok"), False)
    finally:
        dashboard.schedule.path = real_path
        shutil.rmtree(tmp, ignore_errors=True)

    # plan.py's own loop, and run.sh's half of carrying a schedule value there.
    src = open(os.path.join(HERE, "plan.py"), encoding="utf-8").read()
    check("plan.py takes --max-plans on the command line", "--max-plans" in src, True)
    check("and stops the batch on it, beside the budget check",
          "args.max_plans and len(written) >= args.max_plans" in src, True)

    sh = open(os.path.join(HERE, "run.sh"), encoding="utf-8").read()
    check("run.sh reads the schedule's max_plans", "schedule.load()" in sh and "max_plans" in sh, True)
    check("and passes it to plan.py as --max-plans", "--max-plans" in sh, True)
    # --task plans exactly one and has no batch loop for max_plans to stop, so
    # the schedule-reading block is gated on MANUAL, the same flag --task sets.
    sched_block = sh.split("# --- 3. the schedule's own budget", 1)[-1]
    check("the schedule-reading block is skipped for a --task run",
          'if [ "$MANUAL" -eq 0 ]; then' in sched_block, True)


def test_runner_root():
    """ROOT in run.sh, pinned because getting it wrong killed the agent silently.

    The agent moved from planning_agent/ to agents/planning_agent/ and this line did
    not move with it, so ROOT became to-dos/agents — no core/, no data/. mkdir
    on a lock whose parent does not exist fails exactly like a lock that is
    held, so every wake from 6 to 9 September 2026 logged "a run is already
    going" and stopped. Nothing ran and nothing said so, which is the worst
    shape a bug can have in something nobody watches.
    """
    sh = open(os.path.join(HERE, "run.sh"), encoding="utf-8").read()
    check("run.sh goes two levels up to the repo root",
          'ROOT="$(dirname "$(dirname "$HERE")")"' in sh, True)
    check("and makes the lock's parent before taking the lock",
          'mkdir -p "$(dirname "$LOCK")"' in sh, True)
    # The paths ROOT is used for have to exist from the root it cd's to, which
    # is the check that would have caught it.
    for rel in ("core/windows.py", "data"):
        check("%s exists under the root run.sh cd's to" % rel,
              os.path.exists(os.path.join(ROOT, rel)), True)
    check("run.sh asks schedule.py rather than a hardcoded clock",
          "schedule.py\" --due" in sh, True)
    check("and no longer has the 19/7 hours written into it",
          "-lt 19 " in sh, False)
    # The plist is dumb now. Twelve wakes there would silently override whatever
    # the dashboard wrote into the schedule file.
    plist = open(os.path.join(HERE, "com.tiagopedras.todos-planning-agent.plist"),
                 encoding="utf-8").read()
    check("the plist wakes all twenty-four hours",
          plist.count("<key>Hour</key>"), 24)


def test_carry_over():
    """A second run in one day adds to the day rather than replacing it.

    Most nights there is only one, because the ledger leaves the next scheduled
    hour nothing to plan. The day two runs both find something is the day the
    morning index would have listed the second run's plans and quietly dropped
    the first run's, which are sitting in the same folder unlinked.
    """
    import tempfile

    day = dt.date(2026, 9, 10)
    tmp = tempfile.mkdtemp(prefix="carry-test-")
    real = plan.paths.night_dir
    plan.paths.night_dir = lambda d=None: tmp
    try:
        first = [("a.md", "Task A", "What A needs.", False),
                 ("b.md", "Task B", "B is waiting on a decision.", True)]
        started = dt.datetime(2026, 9, 10, 19, 5, tzinfo=TZ)
        plan.write_run_record(day, first, [("Task C", "tagged ai:partial")], None, 2.0, started)

        # The second run plans C. A and B are now in the ledger, so the picker
        # hands them back as skipped — which is exactly the case that must not
        # read as "not planned" in an index that links them.
        second = [("c.md", "Task C", "What C needs.", False)]
        skipped = [("Task A", "unchanged since 2026-09-10"),
                   ("Task B", "unchanged since 2026-09-10"),
                   ("Task D", "tagged ai:partial")]
        later = dt.datetime(2026, 9, 10, 23, 5, tzinfo=TZ)
        written, left, stopped, spent, start = plan.carry_over(
            day, second, skipped, None, 1.5, later)

        check("every plan the day wrote is in the record",
              [w[1] for w in written], ["Task A", "Task B", "Task C"])
        check("and the fold is still a fold", [w[3] for w in written], [False, True, False])
        check("nothing planned today is also listed as not planned",
              [t for t, _ in left], ["Task D"])
        check("the cost is the day's", spent, 3.5)
        check("and the run began when the first one did", start, started)

        plan.write_run_record(day, written, left, stopped, spent, start)
        plan.write_index(day, written, left, stopped)
        index = open(os.path.join(tmp, "index.md"), encoding="utf-8").read()
        for name in ("a.md", "b.md", "c.md"):
            check("index.md links %s" % name, name in index, True)
        check("and counts the two unfolded ones", "count: 2" in index, True)

        third, _, _, spent, _ = plan.carry_over(day, [], [], None, 0.0, later)
        check("a run that plans nothing loses nothing", [w[1] for w in third],
              ["Task A", "Task B", "Task C"])
        check("and adds nothing to the cost", spent, 3.5)
    finally:
        plan.paths.night_dir = real
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    test_windows()
    test_schedule()
    test_max_plans()
    test_pick()
    test_order()
    test_rules()
    test_folding()
    test_one_file_per_task()
    test_prune()
    test_briefing()
    test_report()
    test_harvest_usage()
    test_agents()
    test_server()
    test_queue_routes()
    test_usage_chart()
    test_runner()
    test_runner_root()
    test_carry_over()
    if FAILED:
        print("%d failed\n" % len(FAILED))
        for f in FAILED:
            print("  " + f)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
