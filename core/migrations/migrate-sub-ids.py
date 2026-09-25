#!/usr/bin/env python3
"""Give every sub-task in a list an `id:` of its own.

A sub-task opens in its own panel by the id written on its line. Until 25 Sep
2026 only two paths wrote one: handOver(), for the four sub-tasks of a handover,
and nothing else. A step typed in through "+ Add subtask" arrived bare, so it
could not be opened. addSub() mints one now, and this does the same for every
step already written.

    python3 core/migrations/migrate-sub-ids.py --dry-run [path]   # count, write nothing
    python3 core/migrations/migrate-sub-ids.py [path]             # do it

`path` defaults to the current list, data/<.current>/todo.md.

Surgical, the same way mint-ids.mjs is for tasks: one token appended to each
step line that lacks one, `id` last among the tags where the board's own writer
puts it, and no other byte changed. A step is read the way splitBody reads one
(core/todo.js): an indented checkbox line under a task, at the indent of the
first step or shallower. A checkbox deeper than that is a note on the step
above it and is left alone. So is anything outside the numbered buckets, which
the board reads as prose.

Before writing it copies the file into the backups/ folder beside it, named the
way the board names its own, so it shows in the Backups view. On a real list
under data/ it refuses while the board helper is running, since a tab left open
would autosave the old version straight back over it.

Safe to run twice: a step that already carries an id is left alone.
"""

import datetime
import os
import random
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")

BUCKET_RE = re.compile(r"^##\s+\d+\.\s+")
TASK_RE = re.compile(r"^-\s+\[[ xX]\]")
SUB_RE = re.compile(r"^(\s+)-\s+\[[ xX]\]")
ID_ANY = re.compile(r"`id:([^`]+)`|\[id::\s*([^\]]+)\]", re.I)
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"


def mint(taken):
    """Six characters of base36, the shape mintId() in core/todo.js makes."""
    while True:
        key = "".join(random.choice(ALPHABET) for _ in range(6))
        if key not in taken:
            taken.add(key)
            return key


def ids_in(lines):
    out = set()
    for line in lines:
        for m in ID_ANY.finditer(line):
            out.add((m.group(1) or m.group(2)).strip().lower())
    return out


def step_lines(lines):
    """Indexes of every sub-task line, read the way splitBody reads them."""
    out = []
    in_buckets = in_task = False
    base = None
    fence = False
    for i, line in enumerate(lines):
        if line.lstrip().startswith("```"):
            fence = not fence
            continue
        if fence:
            continue
        if BUCKET_RE.match(line):
            in_buckets, in_task = True, False
            continue
        if line.startswith("#"):
            # Any other `##` ends the buckets (Context is prose); a `###` column
            # heading ends the task above it.
            if in_buckets and line.startswith("## "):
                in_buckets = False
            in_task = False
            continue
        if not in_buckets:
            continue
        if TASK_RE.match(line):
            in_task, base = True, None
            continue
        if not line.strip():
            continue
        if not line[0].isspace():
            in_task = False
            continue
        m = SUB_RE.match(line)
        if in_task and m and (base is None or len(m.group(1)) <= base):
            base = len(m.group(1))
            out.append(i)
    return out


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    paths = [a for a in args if not a.startswith("--")]
    if paths:
        target = os.path.abspath(paths[0])
    else:
        with open(os.path.join(DATA, ".current"), encoding="utf-8") as fh:
            target = os.path.join(DATA, fh.read().strip(), "todo.md")

    with open(target, encoding="utf-8") as fh:
        text = fh.read()
    lines = text.split("\n")
    taken = ids_in(lines)
    bare = [i for i in step_lines(lines) if not ID_ANY.search(lines[i])]

    print("%s %s" % ("DRY RUN" if dry else "MIGRATING", os.path.relpath(target, ROOT) if target.startswith(ROOT) else target))
    for i in bare:
        print("  %5d  %s" % (i + 1, lines[i].strip()[:90]))
    if not bare:
        print("nothing to change — every sub-task already carries an id")
        return
    if dry:
        print("\n%d sub-task(s) without an id — rerun without --dry-run to mint them" % len(bare))
        return

    if target.startswith(DATA + os.sep):
        try:
            running = subprocess.run(["pgrep", "-f", "kanban/server.py"], capture_output=True, text=True).stdout.strip()
        except OSError:
            running = ""
        if running:
            sys.exit("\nREFUSED: the board helper is running. Quit To-Do Board.app and kill it first.\n")

    bdir = os.path.join(os.path.dirname(target), "backups")
    os.makedirs(bdir, exist_ok=True)
    backup = os.path.join(bdir, "todo-backup-%s.md" % datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S"))
    shutil.copy2(target, backup)
    print("\n  backed up to %s" % backup)

    for i in bare:
        lines[i] = lines[i].rstrip() + " `id:%s`" % mint(taken)
    tmp = target + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    os.replace(tmp, target)
    print("  minted %d id(s)" % len(bare))


if __name__ == "__main__":
    main()
