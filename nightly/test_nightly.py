#!/usr/bin/env python3
"""Checks on the two pieces of arithmetic that decide whether money gets spent.

The window rule and the picker both make their decisions hours before anyone is
awake to see them go wrong, and both are easy to get subtly backwards. So they
are tested against fabricated nights rather than against whatever happens to be
in ~/.claude today, which is the only way to check the 02:00 cutoff without
waiting until 02:00.

    python3 nightly/test_nightly.py
"""

import datetime as dt
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "core"))
sys.path.insert(0, HERE)

import pick  # noqa: E402
import plan  # noqa: E402
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


# --- the window rule ---------------------------------------------------------

def test_windows():
    # Riding a window he opened in the evening. The common case: 29 of the last
    # 30 nights had one of these running.
    d = windows.decide(now=at(4, 21, 0), events=turns_ending(at(4, 20, 0)))
    check("21:00, his window runs to 01:00 — ride", d["action"], windows.RIDE)

    # The same window, but he started late enough that it outlives the morning.
    # This is the case the whole module exists for.
    d = windows.decide(now=at(4, 23, 0), events=turns_ending(at(4, 22, 30)))
    check("23:00, window runs to 03:30 — ride", d["action"], windows.RIDE)
    d = windows.decide(now=at(5, 3, 0), events=turns_ending(at(5, 2, 30)))
    check("03:00, window runs to 07:30 — stop, it eats the morning",
          d["action"], windows.STOP)

    # Nothing open, and time to fit a whole fresh window before 07:00.
    d = windows.decide(now=at(4, 20, 0), events=turns_ending(at(4, 10, 0)))
    check("20:00, nothing open — open", d["action"], windows.OPEN)

    # 02:00 exactly is the last moment a fresh window closes by 07:00.
    d = windows.decide(now=at(5, 2, 0), events=turns_ending(at(4, 10, 0)))
    check("02:00 exactly, nothing open — open", d["action"], windows.OPEN)
    d = windows.decide(now=at(5, 2, 1), events=turns_ending(at(4, 10, 0)))
    check("02:01, nothing open — stop, past the cutoff", d["action"], windows.STOP)

    # Riding is allowed after the cutoff, because the window is already running
    # and dies before he wakes. This is the half of the rule that is easy to get
    # wrong by testing the start time instead of the end.
    d = windows.decide(now=at(5, 3, 0), events=turns_ending(at(5, 1, 30)))
    check("03:00, window open until 06:30 — ride", d["action"], windows.RIDE)

    # Daytime never spends, whatever the windows say.
    d = windows.decide(now=at(4, 11, 0), events=turns_ending(at(4, 10, 30)))
    check("11:00 — stop, outside the night", d["action"], windows.STOP)

    # A recorded limit beats the estimate while it stands, and is ignored once
    # it has passed.
    live = {"expires": at(5, 5, 0).isoformat()}
    d = windows.decide(now=at(5, 1, 0), state=live, events=[])
    check("a recorded reset at 05:00 — ride", d["action"], windows.RIDE)
    stale = {"expires": at(4, 20, 0).isoformat()}
    d = windows.decide(now=at(4, 21, 0), state=stale, events=turns_ending(at(4, 10, 0)))
    check("a reset that has passed is ignored", d["action"], windows.OPEN)

    # morning_after rolls to tomorrow once today's has gone.
    check("morning after 21:00 is tomorrow", windows.morning_after(at(4, 21)).date(),
          dt.date(2026, 9, 5))
    check("morning after 03:00 is today", windows.morning_after(at(5, 3)).date(),
          dt.date(2026, 9, 5))

    # The cutoff is derived, not written down twice.
    check("cutoff is MORNING minus one window",
          (windows.morning_after(at(4, 21)) - windows.WINDOW).strftime("%H:%M"), "02:00")


# --- the picker --------------------------------------------------------------

DOC = """# List

## 1. People

### Waiting review

- [ ] **Sitting with someone** [impact:: high] [effort:: S] [ai:: full]

### Blocked

- [ ] **Stuck** [impact:: high] [effort:: S] [ai:: full]

### Doing

- [ ] **Plain and plannable** [impact:: high] [effort:: M] [ai:: partial]
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

    # The ledger: unchanged is skipped, changed is planned again, actioned comes
    # back because the plan no longer describes outstanding work.
    tasks = {t.title: t for t in plan_}
    fp = pick.fingerprint(tasks["Startable now"])
    ledger = {"Startable now": {"fingerprint": fp, "planned": "2026-09-04", "status": "unread"}}
    p2, s2 = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("unchanged is skipped", titles(p2), ["Plain and plannable"])
    check("and says why", s2[0][1].startswith("unchanged"), True)

    ledger["Startable now"]["status"] = "actioned"
    p3, _ = pick.select(DOC, day=dt.date(2026, 9, 5), ledger=ledger)
    check("actioned is planned again", titles(p3), ["Plain and plannable", "Startable now"])

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


# --- the bucket mapping ------------------------------------------------------

def test_agents():
    for bucket, want in [
        ("People", "pa-plan-people"),
        ("1. People", "pa-plan-people"),
        ("Design System", "pa-plan-design-system"),
        ("DS", "pa-plan-design-system"),
        ("3. DS", "pa-plan-design-system"),
        ("BAU", "pa-plan-work-oversight"),
        ("Work oversight", "pa-plan-work-oversight"),
        ("Strategic", "pa-plan-strategic"),
        ("Processes", "pa-plan-processes"),
        ("Something new", "pa-plan-general"),
        ("", "pa-plan-general"),
    ]:
        check("bucket %r maps" % bucket, plan.bucket_agent(bucket), want)

    for bucket, want in list(plan.AGENTS.items()) + [("x", plan.FALLBACK_AGENT)]:
        agent = plan.AGENTS.get(bucket, plan.FALLBACK_AGENT)
        path = os.path.join(os.path.dirname(HERE), ".claude", "agents", agent + ".md")
        check("%s exists on disk" % agent, os.path.exists(path), True)

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
agent: pa-plan-design-system
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
    sys.path.insert(0, os.path.join(os.path.dirname(HERE), "kanban"))
    import server

    tmp = tempfile.mkdtemp(prefix="plans-test-")
    try:
        night = os.path.join(tmp, "2026-09-05")
        os.makedirs(night)
        with open(os.path.join(night, "a-planned-thing.md"), "w", encoding="utf-8") as fh:
            fh.write(PLAN)
        with open(os.path.join(night, "index.md"), "w", encoding="utf-8") as fh:
            fh.write("---\ntitle: Plans\n---\n")
        with open(os.path.join(tmp, "ledger.json"), "w", encoding="utf-8") as fh:
            json.dump({"A planned thing": {"fingerprint": "abc", "planned": "2026-09-05",
                                           "status": "unread", "file": "a-planned-thing.md",
                                           "night": "2026-09-05"}}, fh)

        real_dir, real_ds = server.plans_dir, server.current_dataset
        server.plans_dir = lambda name=None: tmp
        server.current_dataset = lambda: "test"
        try:
            rows = server.plan_listing()
            check("one plan listed, index.md skipped", len(rows), 1)
            check("its task comes off the frontmatter", rows[0]["task"], "A planned thing")
            check("and its night off the folder", rows[0]["night"], "2026-09-05")
            check("status defaults sensibly", rows[0]["status"], "unread")

            # The URL must carry no dataset name. translate_path inserts the
            # current one into every /data/ path, so a URL naming it asks for
            # data/twinkl/twinkl/... and 404s — the plan lists fine and then
            # will not open, which is the shape of bug that survives a listing
            # test. Checked here by pushing it back through translate_path.
            check("the plan url has no dataset in it",
                  rows[0]["url"], "/data/plans/2026-09-05/a-planned-thing.md")
            stub = object.__new__(server.Handler)
            stub.directory = server.ROOT          # what __init__ would have set
            resolved = server.Handler.translate_path(stub, rows[0]["url"])
            check("and resolves to one dataset deep, not two",
                  resolved.count("/test/"), 1)

            got, err = server.mark_plan("2026-09-05", "a-planned-thing.md", "actioned")
            check("marking succeeds", err, None)
            check("the file now says actioned",
                  server.plan_listing()[0]["status"], "actioned")
            with open(os.path.join(tmp, "ledger.json"), encoding="utf-8") as fh:
                check("and so does the ledger, which is what the picker reads",
                      json.load(fh)["A planned thing"]["status"], "actioned")

            # The three ways a bad reference gets refused, since these come off
            # a URL and one of them is a path climbing out of the folder.
            for night, name in [("nope", "a.md"), ("2026-09-05", "../x.md"),
                                ("2026-09-05", "missing.md")]:
                _, err = server.mark_plan(night, name, "read")
                check("refuses %r/%r" % (night, name), bool(err), True)
            _, err = server.mark_plan("2026-09-05", "a-planned-thing.md", "banana")
            check("refuses an unknown status", bool(err), True)
        finally:
            server.plans_dir, server.current_dataset = real_dir, real_ds
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_queue_routes():
    """queue_listing, set_queue_order and nightly_run, against a temp folder.

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
    sys.path.insert(0, os.path.join(os.path.dirname(HERE), "kanban"))
    import server

    tmp = tempfile.mkdtemp(prefix="queue-test-")
    try:
        plans = os.path.join(tmp, "plans")
        os.makedirs(plans)
        todo_file = os.path.join(tmp, "todo.md")
        with open(todo_file, "w", encoding="utf-8") as fh:
            fh.write(DOC)

        real = (server.plans_dir, server.current_dataset, server.todo_path,
                server.NIGHTLY_LOCK)
        server.plans_dir = lambda name=None: plans
        server.current_dataset = lambda: "test"
        server.todo_path = lambda name=None: todo_file
        server.NIGHTLY_LOCK = os.path.join(tmp, ".nightly.lock")
        try:
            q = server.queue_listing()
            check("the queue is what pick would plan",
                  sorted(r["title"] for r in q["queue"]),
                  ["Plain and plannable", "Startable now"])
            check("each row carries the agent it would go to",
                  q["queue"][0]["agent"].startswith("pa-plan-"), True)
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
            with open(os.path.join(plans, "nightly.log"), "w", encoding="utf-8") as fh:
                fh.write(
                    "2026-09-05 01:05:00  wake — ride: his window runs to 04:00\n"
                    "2026-09-05 02:05:00  start: 3 to plan, 1 skipped\n"
                    "2026-09-05 02:05:01    > Startable now (pa-plan-people)\n"
                    "2026-09-05 02:08:20    planned Startable now"
                    "                                      199s  $0.74\n"
                    "2026-09-05 02:08:21    > Plain and plannable (pa-plan-processes)\n"
                    "2026-09-05 02:09:00    failed Plain and plannable"
                    "                             the agent timed out\n"
                    "2026-09-05 02:09:01    > Third thing (pa-plan-strategic)\n")
            long_title = "A task with a title fifty characters long, exactly"
            check("the fixture title really is fifty characters", len(long_title), 50)
            with open(os.path.join(plans, "nightly.log"), "a", encoding="utf-8") as fh:
                fh.write("2026-09-05 02:09:02    failed %-50s %s\n"
                         % (long_title, "the agent hit an error"))
            n = server.nightly_run()
            check("a title that fills the log's field is not eaten by the reason",
                  [f["title"] for f in n["failed"]][-1], long_title)
            check("and the reason survives intact",
                  n["failed"][-1]["why"], "the agent hit an error")

            with open(os.path.join(plans, "nightly.log"), encoding="utf-8") as fh:
                kept = [l for l in fh if long_title not in l]
            with open(os.path.join(plans, "nightly.log"), "w", encoding="utf-8") as fh:
                fh.writelines(kept)

            n = server.nightly_run()
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

            os.makedirs(server.NIGHTLY_LOCK)
            n = server.nightly_run()
            check("the lock is what makes a run live", n["live"], True)
            check("and the task in flight is then a real one",
                  (n["current"] or {}).get("agent"), "pa-plan-strategic")
            check("with nothing orphaned", n["orphan"], None)

            # Everything before the last `start:` belongs to a previous night.
            with open(os.path.join(plans, "nightly.log"), "a", encoding="utf-8") as fh:
                fh.write("2026-09-06 02:05:00  start: 1 to plan, 4 skipped\n")
            n = server.nightly_run()
            check("a new run does not inherit the last one's tally", n["done"], [])
            check("nor its failures", n["failed"], [])

            # The button. Only the refusals are checked here — the success path
            # spends real money on real agents, which is not a thing a test
            # suite gets to do.
            _, err = server.start_nightly_run()
            check("it will not start a second run on top of one going",
                  (err or {}).get("error"), "a run is already going")
            os.rmdir(server.NIGHTLY_LOCK)

            real_root = server.ROOT
            server.ROOT = tmp                 # no nightly/run.sh under here
            try:
                _, err = server.start_nightly_run()
                check("nor one with no runner to start", bool(err), True)
            finally:
                server.ROOT = real_root
        finally:
            (server.plans_dir, server.current_dataset, server.todo_path,
             server.NIGHTLY_LOCK) = real
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def test_usage_chart():
    """rolling_week and ceiling — the two figures the usage chart is drawn from.

    Both are arithmetic over dates, which is the kind of thing that looks right
    and is off by one. Fabricated windows rather than the real transcripts, for
    the same reason the window rule is tested that way: the real ones change
    every time anybody uses Claude.
    """
    sys.path.insert(0, os.path.join(os.path.dirname(HERE), "kanban"))
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
    check("and it does trap the lock off on exit", "trap 'rmdir" in sh, True)

    # The agents are told to read ~/Code/CLAUDE.md, SKILLS.md and
    # DS-KNOWN-ISSUES.md. Without --add-dir claude -p cannot see any of them,
    # and the plans get quietly thinner rather than failing.
    src = open(os.path.join(HERE, "plan.py"), encoding="utf-8").read()
    check("plan.py widens the sandbox to ~/Code", "--add-dir" in src, True)
    # And narrows the tools, on the command line rather than only in the agent
    # definition — a definition is a request, the flag is what holds.
    check("and pins the tools on the command line", "--allowedTools" in src, True)
    check("with no Bash among them", "\"Bash\"" in src, False)
    for p in sorted(os.listdir(os.path.join(os.path.dirname(HERE), ".claude", "agents"))):
        if not p.startswith("pa-plan-"):
            continue
        head = open(os.path.join(os.path.dirname(HERE), ".claude", "agents", p),
                    encoding="utf-8").read()[:400]
        check("%s claims no Bash either" % p, "Bash" in head, False)


def main():
    test_windows()
    test_pick()
    test_order()
    test_agents()
    test_server()
    test_queue_routes()
    test_usage_chart()
    test_runner()
    if FAILED:
        print("%d failed\n" % len(FAILED))
        for f in FAILED:
            print("  " + f)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
