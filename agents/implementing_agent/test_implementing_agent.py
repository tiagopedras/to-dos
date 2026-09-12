#!/usr/bin/env python3
"""The runs stream: what mints a run, and what each column move writes.

    python3 agents/implementing_agent/test_implementing_agent.py

Everything happens inside a temporary folder. `paths.data_dir` is pointed at it
before anything is imported that would read the real one, so there is no path
from here to `data/twinkl/` — the rule the board's own tests keep, and for the
same reason: this repo has lost real content to a test twice.
"""

import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "planning_agent"))
sys.path.insert(0, HERE)

import paths  # noqa: E402

TMP = tempfile.mkdtemp(prefix="runs-test-")
paths.data_dir = lambda: TMP

import stream  # noqa: E402  — after the patch, so runs_dir() lands in TMP

fails = []


def check(name, got, want):
    ok = got == want
    print("  %s  %s" % ("ok " if ok else "FAIL", name))
    if not ok:
        fails.append(name)
        print("    got  %r\n    want %r" % (got, want))


def plan(night, name, **fields):
    folder = os.path.join(paths.plans_dir(), night)
    os.makedirs(folder, exist_ok=True)
    head = ["---"] + ["%s: %s" % (k, v) for k, v in fields.items()] + ["---", "", "Body."]
    with open(os.path.join(folder, name), "w", encoding="utf-8") as fh:
        fh.write("\n".join(head) + "\n")


def names():
    return sorted(n for n, _p, _f in stream.runs())


def field(name, key):
    return stream.frontmatter(os.path.join(stream.runs_dir(), name)).get(key)


try:
    # --- what counts as accepted ---------------------------------------------
    # Everything in the Plans board's Done column, in all three spellings it has
    # had. A plan still waiting on him, parked, or sent back is not accepted and
    # must not mint anything: a run would sit in Backlog claiming he agreed to
    # work he never looked at.
    plan("2026-09-05", "accepted.md", title="An accepted plan", task="Rename the text styles",
         slug="rename-text-styles", bucket="Design System", column="To do",
         summary="Do the thing.", state="done", owner="me", resolution="actioned")
    plan("2026-09-05", "waiting.md", title="Still waiting", task="Not yet",
         state="review", owner="me")
    plan("2026-09-05", "parked.md", title="Parked", task="Left alone",
         state="backlog", owner="me")
    plan("2026-09-05", "sentback.md", title="Sent back", task="Another night",
         state="ready", owner="planning-agent")
    plan("2026-09-04", "legacy.md", title="Agreed the old way", task="An old one",
         status="agreed")
    plan("2026-09-04", "replaced.md", title="Replaced", task="Superseded one",
         state="done", owner="me", resolution="superseded")

    made = stream.sync()
    check("one run per accepted plan, and only those", sorted(made),
          ["2026-09-04-legacy.md", "2026-09-05-accepted.md"])
    check("a superseded plan is not work he accepted",
          any("replaced" in n for n in made), False)

    # --- minting is idempotent ----------------------------------------------
    # The view calls this every time it loads, so a second call on the same
    # folder has to be silent rather than a second copy of everything.
    check("syncing again mints nothing", stream.sync(), [])
    check("and leaves one document per plan", len(names()), 2)

    run = "2026-09-05-accepted.md"
    check("the run starts in Backlog", field(run, "state"), "backlog")
    check("owned by him", field(run, "owner"), "me")
    check("naming the plan it carries out", field(run, "plan"), "2026-09-05/accepted.md")
    check("and carrying the task's own identity", field(run, "slug"), "rename-text-styles")
    check("the bucket travels as `group`, the contract's word", field(run, "group"), "Design System")
    check("it is given an id of its own", len(field(run, "id") or ""), 6)

    # --- the columns ---------------------------------------------------------
    out = stream.apply({"item": {"name": run}, "to": "ready", "owner": "implementing-agent"})
    check("handing it over is ready, owned by the implementing agent", out.get("ok"), True)
    check("and that is what lands in the file", field(run, "state"), "ready")

    out = stream.apply({"item": {"name": run}, "to": "review", "owner": "me", "seen": False})
    check("the agent writing back is review, owned by him", out.get("ok"), True)
    check("unseen until he opens it", field(run, "seen"), "no")

    # Sending work back has to carry a reason, the same rule the planning half
    # holds: without one the agent does the same thing again, twice the money.
    out = stream.apply({"item": {"name": run}, "to": "ready",
                        "owner": "implementing-agent", "again": True})
    check("sending it back with nothing said is refused", out.get("ok"), False)
    out = stream.apply({"item": {"name": run}, "to": "ready", "owner": "implementing-agent",
                        "again": True, "reason": "It never touched the docs."})
    check("with a reason it goes back", out.get("ok"), True)
    check("and the reason is on the file", field(run, "feedback"), "It never touched the docs.")

    out = stream.apply({"item": {"name": run}, "to": "done", "owner": "me"})
    check("finishing without saying how is refused", out.get("ok"), False)
    out = stream.apply({"item": {"name": run}, "to": "done", "owner": "me",
                        "resolution": "actioned"})
    check("accepting it is done, actioned", field(run, "state"), "done")

    # --- what it refuses ------------------------------------------------------
    # An item owned by nobody is an item nothing will ever pick up, so a pairing
    # the manifest does not allow is refused rather than written.
    check("a state this stream has no word for",
          stream.apply({"item": {"name": run}, "to": "nowhere", "owner": "me"}).get("ok"), False)
    check("an agent owning a column that is his",
          stream.apply({"item": {"name": run}, "to": "review",
                        "owner": "implementing-agent"}).get("ok"), False)
    check("a name that walks out of the folder",
          stream.apply({"item": {"name": "../todo.md"}, "to": "backlog",
                        "owner": "me"}).get("ok"), False)
    check("a run that is not there",
          stream.apply({"item": {"name": "nothing.md"}, "to": "backlog",
                        "owner": "me"}).get("ok"), False)

    # --- and the one thing it must never touch --------------------------------
    check("nothing was written outside runs/",
          sorted(os.listdir(TMP)), ["plans", "runs"])
finally:
    shutil.rmtree(TMP, ignore_errors=True)

print("\n%s" % ("all checks passed" if not fails else "%d failed" % len(fails)))
sys.exit(1 if fails else 0)
