#!/usr/bin/env python3
"""Checks on the Implement agent's unattended harness, with no Claude run.

Which sub-tasks it takes, which it leaves and why, the tools it hands a run, and
the guards that put back what a run was not allowed to do. Everything happens
in a scratch data root and a scratch git repo; the real list is never read.

    python3 agents/implement-agent/test_implement_agent.py
"""

import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile

TMP = tempfile.mkdtemp(prefix="implement-test-")
DATA = os.path.join(TMP, "data")
# Before anything imports paths.py, which reads it once.
os.environ["TODOS_DATA_ROOT"] = DATA
os.environ["PLANNING_DATASET"] = "t"
IMPROVE = os.path.join(TMP, "improve-agent")
os.environ["IMPLEMENT_IMPROVE_DIR"] = IMPROVE

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import guard  # noqa: E402
import hooks  # noqa: E402
import paths  # noqa: E402
import tick_queue  # noqa: E402

FAILED = []
DAY = dt.date.today()
TARGET = {"id": "t"}


def check(name, got, want):
    if got != want:
        FAILED.append("%s\n    got  %r\n    want %r" % (name, got, want))


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def plan_file(name, kind, needs_you="no"):
    write(os.path.join(DATA, "t", "plans", name),
          "---\ntitle: x\nneeds_you: %s\ntype: %s\nsummary: Do it.\n---\n\n## Summary\n\nDo it.\n" % (needs_you, kind))


def handed(tid, title, plan=None, review_done=True, implement_done=False, project=None):
    """A task handed to the Plan agent, with its Plan ticked."""
    lines = ["- [ ] **%s** [impact:: high] [effort:: M] `id:%s`" % (title, tid)]
    if project:
        lines.append("  - Project: %s" % project)
    lines += [
        "  - [x] Plan [to:: Plan agent] `done:2026-09-25` `#%s-plan` `id:%sp1`" % (tid, tid[:4]),
        "  - [%s] Review the plan [to:: Tiago] `#%s-plan-review` `blocked-by:%s-plan` `id:%sp2`"
        % ("x" if review_done else " ", tid, tid, tid[:4]),
    ]
    if plan:
        lines.append("    - Plan: plans/%s" % plan)
    lines += [
        "  - [%s] Implement [to:: Implement agent] `#%s-implement` `blocked-by:%s-plan-review` `id:%sp3`"
        % ("x" if implement_done else " ", tid, tid, tid[:4]),
        "  - [ ] Review the work [to:: Tiago] `#%s-work-review` `blocked-by:%s-implement` `id:%sp4`"
        % (tid, tid, tid[:4]),
    ]
    return "\n".join(lines)


def doc(*tasks):
    return "# List\n\n## 1. People\n\n### Doing\n\n" + "\n".join(tasks) + "\n"


def by_title(items):
    return {i["title"]: i for i in items}


def why(item):
    got = hooks.eligible(item, TARGET)
    return got["why"] if isinstance(got, dict) else got


# --- the queue ------------------------------------------------------------------

def test_queue():
    for name, kind in (("a.md", "write-up"), ("d.md", "figma"), ("e.md", "other"),
                       ("f.md", "draft"), ("g.md", "data"), ("i.md", "deck")):
        plan_file(name, kind)
    plan_file("n.md", "write-up", needs_you="yes")
    text = doc(
        handed("aaaa01", "Approved write-up", "a.md"),
        handed("bbbb01", "Plan not yet approved", "a.md", review_done=False),
        "- [ ] **Straight to it** [impact:: high] `id:cccc01`\n"
        "  - [ ] Implement [to:: Implement agent] `#cccc01-implement` `id:ccccp3`",
        handed("dddd01", "A Figma plan", "d.md"),
        handed("eeee01", "Some other kind", "e.md"),
        handed("ffff01", "Already finished, tick queued", "f.md"),
        handed("gggg01", "Missing its plan file", "gone.md"),
        handed("hhhh01", "Implement already ticked", "a.md", implement_done=True),
        handed("iiii01", "Folder nobody approved", "i.md", project="/nowhere/approved"),
        handed("nnnn01", "Plan that asks first", "n.md"),
    )
    write(paths.todo_path(), text)
    tick_queue.append("ffffp3", "Implement agent", path=paths.tick_queue_path())
    items = by_title(hooks.items(TARGET))

    check("only open Implement sub-tasks with their blocker ticked are items",
          sorted(items), sorted(["Approved write-up", "Straight to it", "A Figma plan", "Some other kind",
                                 "Already finished, tick queued", "Missing its plan file",
                                 "Folder nobody approved", "Plan that asks first"]))
    a = items["Approved write-up"]
    check("the item is the Implement sub-task, with its plan and type",
          (a["sub"], a["plan_rel"], a["kind"]), ("aaaap3", "a.md", "write-up"))
    check("an approved write-up is taken", why(a), None)
    check("a task handed straight over waits for /do",
          "waits for /do" in why(items["Straight to it"]), True)
    check("Figma refuses to run unattended", why(items["A Figma plan"]), hooks.FIGMA_REFUSAL)
    check("a type off the list waits for /do", "not one it does alone" in why(items["Some other kind"]), True)
    check("a sub-task whose tick is still unapplied is not picked up again",
          hooks.eligible(items["Already finished, tick queued"], TARGET)["kind"], "unchanged")
    check("a missing plan file is said", "is missing" in why(items["Missing its plan file"]), True)
    check("a Project: folder he has not approved is refused",
          "does not name a folder" in why(items["Folder nobody approved"]), True)
    check("a folded plan is not carried out", why(items["Plan that asks first"]), "its plan asks you something first")


# --- the tools a run is handed ---------------------------------------------------

def test_options():
    write(paths.todo_path(), doc(handed("aaaa01", "Approved write-up", "a.md")))
    item = hooks.items(TARGET)[0]
    opts = hooks.options(item, TARGET)
    folder = os.path.realpath(os.path.join(DATA, "t", "projects", "approved-write-up"))
    check("no Bash for a files run", "Bash" in opts["disallowed"], True)
    check("Write and Edit only on the project folder",
          [t for t in opts["tools"] if t.startswith(("Write", "Edit"))],
          ["Write(/%s/**)" % folder, "Edit(/%s/**)" % folder])
    check("and no permission mode that accepts an edit anywhere", opts.get("permission_mode"), None)
    check("the implement-agent definition runs it", opts["agent"], "implement-agent")
    check("the prompt names the folder and the no-overwrite rule",
          (os.path.join("projects", "approved-write-up") in _prompt(item), "name-v2.md" in _prompt(item)),
          (True, True))


def _prompt(item):
    hooks.starting(item, TARGET, {})
    try:
        return hooks.prompt(item, TARGET)
    finally:
        run = hooks._runs.pop(item["id"], {})
        if run.get("guard"):
            guard.discard(run["guard"])


# --- the folder guard ------------------------------------------------------------

def test_guard():
    folder = os.path.join(TMP, "guard", "data", "projects", "p")
    watch = os.path.join(TMP, "guard", "data")
    write(os.path.join(folder, "brief.md"), "his brief\n")
    write(os.path.join(folder, "old.md"), "keep me\n")
    write(os.path.join(watch, "plans", "x.md"), "a plan\n")
    write(os.path.join(watch, "tick-queue.json"), "[]")
    state = guard.before(folder, watch=watch)
    write(os.path.join(folder, "new.md"), "fine\n")
    write(os.path.join(folder, "brief.md"), "written over\n")
    os.remove(os.path.join(folder, "old.md"))
    write(os.path.join(watch, "stray.md"), "outside\n")
    write(os.path.join(watch, "tick-queue.json"), "[{}]")
    report = guard.after(state, DAY)
    check("a new file in the folder stays", report["added"], ["new.md"])
    check("a file written over is put back", read(os.path.join(folder, "brief.md")), "his brief\n")
    check("and the agent's version is set aside",
          read(os.path.join(report["aside"], "brief.md")), "written over\n")
    check("a removed file is put back", read(os.path.join(folder, "old.md")), "keep me\n")
    check("a new file outside is moved aside",
          (os.path.exists(os.path.join(watch, "stray.md")),
           os.path.exists(os.path.join(report["aside"], "outside", "stray.md"))), (False, True))
    check("the queues the board drains are not the agent's doing", report["outside_changed"], [])
    check("the breaches read as sentences", len(guard.breaches(report)), 3)
    check("a clean run has none",
          guard.breaches(guard.after(guard.before(folder, watch=watch), DAY)), [])
    check("a new version is name-v2 beside the original",
          os.path.basename(guard.next_version(os.path.join(folder, "brief.md"))), "brief-v2.md")
    write(os.path.join(folder, "brief-v2.md"), "v2\n")
    check("then v3", os.path.basename(guard.next_version(os.path.join(folder, "brief.md"))), "brief-v3.md")


# --- one run, landed -------------------------------------------------------------

REPLY = "Wrote the brief to brief.md.\n\nSUMMARY: Wrote the brief.\nOUTCOME: done\n"


def test_land():
    plan_file("a.md", "write-up")
    write(paths.todo_path(), doc(handed("aaaa01", "Approved write-up", "a.md")))
    q = paths.tick_queue_path()
    write(q, "[]")
    item = hooks.items(TARGET)[0]
    before = item["fingerprint"]
    hooks.starting(item, TARGET, {})
    folder = hooks._runs[item["id"]]["folder"]
    write(os.path.join(folder, "brief.md"), "the brief\n")
    got = hooks.land(item, {"text": REPLY}, TARGET)
    check("a clean run lands as done", got.get("label"), "done")
    check("and queues its own tick, as the Implement agent",
          [(e["sub"], e["by"]) for e in tick_queue.read(q)], [("aaaap3", "Implement agent")])
    text = read(item["plan"])
    check("its report is added to the plan", "## What the implementing agent did" in text, True)
    check("without the two closing lines", "OUTCOME:" in text.split("did")[-1], False)
    check("the report does not change what the runner fingerprints",
          hooks.items(TARGET)[0]["fingerprint"], before)
    check("and its tick waiting keeps it from running again",
          hooks.eligible(hooks.items(TARGET)[0], TARGET)["kind"], "unchanged")

    # A run that wrote over a file is set aside, and nothing is ticked.
    write(q, "[]")
    item = hooks.items(TARGET)[0]
    hooks.starting(item, TARGET, {})
    write(os.path.join(folder, "brief.md"), "rewritten\n")
    got = hooks.land(item, {"text": REPLY}, TARGET)
    check("writing over a file sets the task aside", (got.get("set_aside"), got.get("label")), (True, "refused"))
    check("the file is as it was", read(os.path.join(folder, "brief.md")), "the brief\n")
    check("and no tick is queued", tick_queue.read(q), [])

    # A run that says it could not do the plan leaves nothing behind.
    item = hooks.items(TARGET)[0]
    hooks.starting(item, TARGET, {})
    write(os.path.join(folder, "half.md"), "half\n")
    got = hooks.land(item, {"text": "SUMMARY: The plan is wrong.\nOUTCOME: folded\n"}, TARGET)
    check("a folded run is set aside for him", (got.get("set_aside"), got.get("label")), (True, "folded"))
    check("and what it half wrote is moved aside", os.path.exists(os.path.join(folder, "half.md")), False)
    check("and no tick is queued", tick_queue.read(q), [])


# --- code, on improve-agent's guards ----------------------------------------------

def git(repo, *args):
    return subprocess.run(["git"] + list(args), cwd=repo, capture_output=True, text=True, check=True).stdout.strip()


def test_code():
    real_improve = os.path.expanduser("~/Code/AGENTS/improve-agent/improve")
    if not os.path.isdir(real_improve):
        print("  (skipped the code checks: improve-agent is not on this machine)")
        return
    repo = os.path.join(TMP, "repos", "r")
    os.makedirs(repo)
    git(repo, "init", "-q", "-b", "main")
    git(repo, "config", "user.email", "t@example.com")
    git(repo, "config", "user.name", "Test")
    write(os.path.join(repo, "app.py"), "x = 1\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "start")
    os.makedirs(IMPROVE, exist_ok=True)
    if not os.path.exists(os.path.join(IMPROVE, "improve")):
        os.symlink(real_improve, os.path.join(IMPROVE, "improve"))
    real = os.path.realpath(repo)
    write(os.path.join(IMPROVE, "registry.json"), json.dumps({"global": {}, "repos": [
        {"name": "r", "path": real, "tests": [{"name": "ok", "cmd": "true"}], "protected": ["data/"]}]}))
    write(os.path.join(DATA, "t", "project-folders.json"),
          json.dumps({"folders": [os.path.realpath(os.path.join(TMP, "repos"))]}))
    plan_file("c.md", "code")
    write(paths.todo_path(), doc(handed("cccc02", "A code change", "c.md", project=real)))
    q = paths.tick_queue_path()
    write(q, "[]")

    write(os.path.join(repo, "scratch.txt"), "his\n")
    item = hooks.items(TARGET)[0]
    check("a dirty tree is refused", "not clean" in (why(item) or ""), True)
    os.remove(os.path.join(repo, "scratch.txt"))
    check("a clean one is taken", why(item), None)

    opts = hooks.options(item, TARGET)
    check("code runs in the repo, with no Bash and no web", (opts["cwd"], "Bash" in opts["disallowed"],
                                                            "WebFetch" in opts["disallowed"]), (real, True, True))
    hooks.starting(item, TARGET, {})
    branch = "implement/%s" % DAY.isoformat()
    check("it works on an implement/<date> branch", git(repo, "rev-parse", "--abbrev-ref", "HEAD"), branch)
    write(os.path.join(repo, "app.py"), "x = 2\n")
    got = hooks.land(item, {"text": "SUMMARY: Set x to 2.\nOUTCOME: done\n"}, TARGET)
    check("green suites commit it", got.get("label"), "built")
    check("the repo is put back on the branch it was on", git(repo, "rev-parse", "--abbrev-ref", "HEAD"), "main")
    check("main is untouched", read(os.path.join(repo, "app.py")), "x = 1\n")
    check("the commit is on the branch", git(repo, "show", "%s:app.py" % branch), "x = 2")
    check("and the tick is queued", [e["sub"] for e in tick_queue.read(q)], ["ccccp3"])

    write(q, "[]")
    item = hooks.items(TARGET)[0]
    hooks.starting(item, TARGET, {})
    write(os.path.join(repo, "data", "real.json"), "{}")
    got = hooks.land(item, {"text": "SUMMARY: Wrote data.\nOUTCOME: done\n"}, TARGET)
    check("a protected path is thrown away and set aside", (got.get("set_aside"), got.get("label")), (True, "refused"))
    check("with nothing left behind", os.path.exists(os.path.join(repo, "data", "real.json")), False)
    check("nor ticked", tick_queue.read(q), [])
    check("and back on main", git(repo, "rev-parse", "--abbrev-ref", "HEAD"), "main")


# --- switched off until he sets hours -----------------------------------------------

def test_off():
    sys.path.insert(0, os.path.expanduser("~/Code/PACKAGES/agents-engine/python"))
    try:
        from agents_engine.runner import settings
    except ImportError:
        print("  (skipped the settings check: agents-engine is not on this machine)")
        return
    conf = settings.load(os.path.join(TMP, "state"), hooks, "t")
    check("a list it has no settings for is off, with no hours", (conf["on"], conf["hours"]), (False, []))
    spec = json.load(open(os.path.join(HERE, "agent.json")))
    check("agent.json points every command at run.py",
          all(v[1] == "run.py" for k, v in spec.items() if isinstance(v, list)), True)


def main():
    try:
        test_queue()
        test_options()
        test_guard()
        test_land()
        test_code()
        test_off()
    finally:
        shutil.rmtree(TMP, ignore_errors=True)
    if FAILED:
        print("%d failed\n" % len(FAILED))
        for f in FAILED:
            print("  " + f)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
