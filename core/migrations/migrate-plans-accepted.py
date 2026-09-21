#!/usr/bin/env python3
"""Moves accepted plans off `done` and onto `accepted`.

    python3 core/migrations/migrate-plans-accepted.py --dry-run
    python3 core/migrations/migrate-plans-accepted.py

`done` on this stream meant "he has accepted it" until 12 Sep 2026, which put
two facts in one state: the plan is agreed, and the work it describes has
finished. The Plans view drew them as one column for the same reason, and could
not draw them as the two they are. `accepted` is the seventh state the work
streams contract took to hold the first of the two — see PACKAGES/work-streams/
CONTRACT.md — and from here `done` means only the second.

So every plan already sitting in `done` has to move, or the day this lands it
claims work has finished that nobody has started:

    done / me / actioned    ->  accepted / implementing-agent / (no resolution)
    done / me / superseded  ->  left alone

A superseded plan stays `done`: it is a rejection a later plan answered, which
really is closed, and it was never work he accepted. `resolution` is dropped on
the ones that move because nothing has closed yet, and the owner becomes the
implementing agent because the next move on an accepted plan is a run rather than a
decision.

Frontmatter and the ledger, together. Both, because the board reads the file and
the picker reads the ledger, neither is derivable from the other, and a
migration that did one of them is the same bug agents/planning_agent/stream.py was
written to remove. Every byte after the closing `---` is left as it was.

Idempotent: a second run finds nothing in `done / actioned` and says so.
"""

import json
import glob
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

DRY = "--dry-run" in sys.argv
FM = re.compile(r"\A---\n(.*?\n)---\n", re.S)


def die(msg):
    sys.stderr.write("\nREFUSED: %s\n\n" % msg)
    sys.exit(1)


def ok(msg):
    print("  ok   %s" % msg)


def field(text, key):
    m = re.search(r"^%s:\s*(.*)$" % re.escape(key), text, re.M)
    return m.group(1).strip() if m else ""


def set_field(text, key, value):
    """One frontmatter line replaced, added, or removed when value is ''.

    Line at a time rather than through a YAML writer, the same reason
    stream.py's own _set does it this way: half these summaries contain a colon
    and a parser would reflow them.
    """
    pat = re.compile(r"^%s:.*$\n?" % re.escape(key), re.M)
    if value == "":
        return pat.sub("", text, count=1)
    line = "%s: %s\n" % (key, value)
    if pat.search(text):
        return pat.sub(line, text, count=1)
    return text.replace("---\n", "---\n" + line, 1)


def plan_files(base):
    """Every plan in the tree, nights and the pruned folder alike.

    prune() files an old plan as plans/actioned/<night>-<name>.md, and one
    parked there is exactly as wrongly-stated as one still under its own night
    — the Plans view reads both.
    """
    out = []
    if not os.path.isdir(base):
        die("no plans folder at %s" % base)
    for here, dirs, files in os.walk(base):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        for name in sorted(files):
            if name.endswith(".md") and name != "index.md":
                out.append(os.path.join(here, name))
    return sorted(out)


def main():
    dataset = open(os.path.join(ROOT, "data", ".current"), encoding="utf-8").read().strip()
    base = os.path.join(ROOT, "data", dataset, "plans")
    print("\n%s %s\n" % ("DRY RUN" if DRY else "MIGRATING", base))

    if not DRY:
        for cmd, what in (("pgrep -f kanban/server.py", "the board helper"),
                          ("pgrep -f 'planning_agent/plan.py'", "the planning agent")):
            if subprocess.run(cmd, shell=True, capture_output=True).returncode == 0:
                die("%s is running. Stop it first." % what)
        held = glob.glob(os.path.join(ROOT, "data", ".planning-agent*.lock"))
        if held:
            die("%s exists, so a run thinks it holds these files." % os.path.basename(held[0]))
        ok("nothing else is holding the plans")

    moving, superseded = [], []
    for path in plan_files(base):
        text = open(path, encoding="utf-8").read()
        if not FM.match(text):
            continue
        if field(text, "state") != "done":
            continue
        if field(text, "resolution") == "superseded":
            superseded.append(path)
            continue
        moving.append(path)

    ok("%d plans to move, %d superseded ones left alone" % (len(moving), len(superseded)))
    for path in moving:
        print("       %s" % os.path.relpath(path, ROOT))
    if not moving:
        ok("nothing in done/actioned, so there is nothing to do")
        return

    if DRY:
        print("\nNothing written. Drop --dry-run to apply.\n")
        return

    # One backup of the whole tree before touching any of it: a half-applied
    # migration over the ledger and the files is the state with no way back.
    backup = base.rstrip("/") + ".before-accepted"
    if os.path.exists(backup):
        die("%s already exists; move it aside first" % os.path.relpath(backup, ROOT))
    shutil.copytree(base, backup)
    ok("copied the tree to %s" % os.path.relpath(backup, ROOT))

    names = set()
    for path in moving:
        text = open(path, encoding="utf-8").read()
        text = set_field(text, "state", "accepted")
        text = set_field(text, "owner", "implementing-agent")
        text = set_field(text, "resolution", "")
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
        names.add(os.path.basename(path))
    ok("%d plan files rewritten" % len(moving))

    lpath = os.path.join(base, "ledger.json")
    try:
        rows = json.load(open(lpath, encoding="utf-8"))
    except (OSError, ValueError):
        rows = None
    if not isinstance(rows, dict):
        ok("no ledger to update")
        return
    touched = 0
    for _, row in rows.items():
        if not isinstance(row, dict):
            continue
        if row.get("state") != "done" or row.get("resolution") == "superseded":
            continue
        row.update({"state": "accepted", "owner": "implementing-agent"})
        row.pop("resolution", None)
        touched += 1
    tmp = lpath + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(rows, fh, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, lpath)
    ok("%d ledger rows moved with them" % touched)
    print("\nDone. The board can be reloaded.\n")


if __name__ == "__main__":
    main()
