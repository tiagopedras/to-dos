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

    # The fingerprint covers the notes, not just the title line.
    a = pick.select(DOC, use_ledger=False)[0][0]
    b = pick.select(DOC.replace("**Plain and plannable** [impact:: high]",
                                "**Plain and plannable** [impact:: high] `week`"),
                    use_ledger=False)[0][0]
    check("a changed tag changes the fingerprint",
          pick.fingerprint(a) != pick.fingerprint(b), True)

    # --task finds one by exact title, ignoring every other rule.
    only, _ = pick.select(DOC, only="stuck")
    check("--task reaches a blocked task", titles(only), ["Stuck"])


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
    test_agents()
    test_server()
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
