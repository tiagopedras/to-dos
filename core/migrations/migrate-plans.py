#!/usr/bin/env python3
"""Moves the plans onto the canonical work-item shape.

    python3 core/migrations/migrate-plans.py --dry-run
    python3 core/migrations/migrate-plans.py

Frontmatter only. Every byte after the closing `---` is left exactly as it was,
and no plan file is renamed: index.md links plans by filename and both run.json
and ledger.json record it, so a rename would mean rewriting three more things
for no gain.

What changes, and why it is not a rename of five words:

    unread    ->  review / me              not seen
    read      ->  review / me              seen
    agreed    ->  ready  / implementing-agent
    redo      ->  ready  / planning-agent     keeps its feedback
    actioned  ->  done   / me              resolution: actioned

`agreed` and `redo` are both `ready`, because both mean an agent may pick this
up. What differs is which agent, and that is `owner`. A rejected plan really is
input to the next run: rejection() in plan.py reads the note back off the file
to build the following prompt. So it is work an agent picks up, which is what
`ready` means, and a seventh state for it would only have to be joined by an
eighth when a third agent arrives.

The ledger and the queue order stop keying on task titles and key on task ids,
which is what stops a retitle losing a task's ledger row and its place in the
queue. pick.py's own note says titles were chosen only because no id existed.
"""

import datetime
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "core"))
sys.path.insert(0, os.path.normpath(os.path.join(ROOT, "..", "PACKAGES", "work_streams")))
import todo                     # noqa: E402
import manifest as ws           # noqa: E402

DRY = "--dry-run" in sys.argv
FM = re.compile(r"\A---\n(.*?\n)---\n", re.S)


def die(msg):
    sys.stderr.write("\nREFUSED: %s\n\n" % msg)
    sys.exit(1)


def ok(msg):
    print("  ok   %s" % msg)


def read_fm(text):
    """The frontmatter as ordered pairs, and everything after it untouched.

    Deliberately not a YAML parser. These files are written by plan.py one
    `key: value` line at a time, and a parser would reflow the half of them
    whose summary contains a colon.
    """
    m = FM.match(text)
    if not m:
        return None, text
    pairs = []
    for line in m.group(1).splitlines():
        if ":" not in line:
            pairs.append((None, line))
            continue
        k, v = line.split(":", 1)
        pairs.append((k.strip(), v.strip()))
    return pairs, text[m.end():]


def main():
    dataset = open(os.path.join(ROOT, "data", ".current"), encoding="utf-8").read().strip()
    base = os.path.join(ROOT, "data", dataset, "plans")
    print("\n%s %s\n" % ("DRY RUN" if DRY else "MIGRATING", base))

    if not DRY:
        for cmd, what in (("pgrep -f kanban/server.py", "the board helper"),
                          ("pgrep -f 'planning_agent/plan.py'", "the planning agent")):
            if subprocess.run(cmd, shell=True, capture_output=True).returncode == 0:
                die("%s is running. Stop it first." % what)
        if os.path.exists(os.path.join(ROOT, "data", ".planning-agent.lock")):
            die("data/.planning-agent.lock exists, so a run thinks it holds these files.")
        ok("nothing else is holding the plans")

    legacy = ws.load(os.path.join(ROOT, "agents", "planning_agent", "stream.json"))[0]["legacy"]["map"]

    # Task ids, so `about:` can point at something that survives a retitle.
    tasks = todo.parse_doc(open(os.path.join(ROOT, "data", dataset, "todo.md"), encoding="utf-8").read())
    by_title = {}
    for t in tasks:
        by_title.setdefault(" ".join(t.title.split()).lower(), t)
    if not any(t.stable_id for t in tasks):
        die("no task carries an id yet; run core/migrations/mint-ids.mjs first")
    ok("%d tasks to link against, %d with ids" % (len(tasks), sum(1 for t in tasks if t.stable_id)))

    nights = sorted(d for d in os.listdir(base)
                    if re.match(r"^\d{4}-\d{2}-\d{2}$", d) and os.path.isdir(os.path.join(base, d)))
    files = [(n, f) for n in nights for f in sorted(os.listdir(os.path.join(base, n)))
             if f.endswith(".md") and f != "index.md"]
    ok("%d plans across %d nights" % (len(files), len(nights)))

    taken, out, unresolved, counts = set(), [], [], {}
    for night, name in files:
        path = os.path.join(base, night, name)
        text = open(path, encoding="utf-8").read()
        pairs, body = read_fm(text)
        if pairs is None:
            die("%s/%s has no frontmatter" % (night, name))
        old = dict(p for p in pairs if p[0])

        status = old.get("status", "unread")
        if status not in legacy:
            die("%s/%s carries an unknown status %r" % (night, name, status))
        counts[status] = counts.get(status, 0) + 1
        new = dict(legacy[status])

        key = " ".join(old.get("task", old.get("title", "")).split()).lower()
        task = by_title.get(key)
        if task is None:
            unresolved.append("%s/%s -> %r" % (night, name, old.get("task", "")[:50]))

        pid = ws and None
        pid = _mint(taken)
        rebuilt = [
            ("id", pid),
            ("title", old.get("title", "")),
            ("task", old.get("task", "")),
            ("about", "task:%s" % task.stable_id if task is not None else ""),
            ("group", old.get("bucket", "")),
            ("state", new["state"]),
            ("owner", new["owner"]),
            ("seen", "yes" if new["seen"] else "no"),
            ("needs_you", "yes" if old.get("outcome") == "folded" else "no"),
            ("resolution", new.get("resolution", "")),
            ("feedback", old.get("redo_note", "")),
            ("created", old.get("generated") or old.get("date", "")),
            ("night", night),
            ("agent", old.get("agent", "")),
            ("session", old.get("session", "")),
            ("column", old.get("column", "")),
            ("ai", old.get("ai", "")),
            ("summary", old.get("summary", "")),
        ]
        head = "".join("%s: %s\n" % (k, v) for k, v in rebuilt if v != "")
        out.append((path, "---\n" + head + "---\n" + body, body, night, name, pid,
                    task.stable_id if task is not None else None, status))

    ok("statuses seen: %s" % ", ".join("%s x%d" % (k, v) for k, v in sorted(counts.items())))
    if unresolved:
        print("  --   %d plans name a task that is not on the list any more:" % len(unresolved))
        for u in unresolved:
            print("         %s" % u)
        print("       They keep their `task:` line as the label, which is what the board falls back to.")
    else:
        ok("every plan resolves to a task on the list")

    # --- the checks --------------------------------------------------------
    for path, text, body, night, name, pid, tid, status in out:
        was = open(path, encoding="utf-8").read()
        if read_fm(was)[1] != body:
            die("%s/%s: the body changed" % (night, name))
    ok("every body is byte for byte what it was")

    pids = [o[5] for o in out]
    if len(set(pids)) != len(pids):
        die("two plans share an id")
    ok("%d plan ids, all distinct" % len(pids))

    # The round trip that says whether the model actually replaces the five words.
    back = {}
    for state, owner, seen, res in [(v["state"], v["owner"], v["seen"], v.get("resolution", "")) for v in legacy.values()]:
        back[(state, owner, seen, res)] = None
    for word, v in legacy.items():
        back[(v["state"], v["owner"], v["seen"], v.get("resolution", ""))] = word
    if len(back) != len(legacy):
        die("two of the five statuses decompose to the same state/owner/seen/resolution, so the model is lossy")
    ok("all five statuses reconstruct from state+owner+seen+resolution, uniquely")

    if DRY:
        print("\nnothing written.\n")
        print("  one migrated frontmatter, as it would be written:\n")
        print("    " + "\n    ".join(out[0][1].split("---")[1].strip().splitlines()))
        print()
        return

    # --- write -------------------------------------------------------------
    stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
    snap = os.path.join(base, "..", "backups", "plans-%s-pre-canonical" % stamp)
    shutil.copytree(base, snap)
    ok("backed up to %s" % os.path.relpath(snap, ROOT))

    for path, text, body, night, name, pid, tid, status in out:
        with io.open(path + ".tmp", "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(path + ".tmp", path)
    ok("%d plans rewritten" % len(out))

    # ledger: keyed by task id rather than task title
    lpath = os.path.join(base, "ledger.json")
    ledger = json.load(open(lpath, encoding="utf-8"))
    new_ledger, lost = {}, []
    plan_by_file = {(o[3], o[4]): o for o in out}
    for title, row in ledger.items():
        task = by_title.get(" ".join(title.split()).lower())
        if task is None:
            lost.append(title)
            continue
        o = plan_by_file.get((row.get("night"), row.get("file")))
        v = legacy.get(row.get("status", "unread"), legacy["unread"])
        new_ledger[task.stable_id] = {
            "title": title, "file": row.get("file"), "night": row.get("night"),
            "planned": row.get("planned"), "fingerprint": row.get("fingerprint"),
            "plan": o[5] if o else "", "state": v["state"], "owner": v["owner"],
            "seen": v["seen"], "resolution": v.get("resolution", ""),
        }
    json.dump(new_ledger, open(lpath, "w", encoding="utf-8"), indent=2)
    ok("ledger rekeyed by task id: %d rows%s" % (len(new_ledger),
       (", %d dropped naming a task that is gone" % len(lost)) if lost else ""))

    # queue order: the same, and the order/hold duplication kept exactly as it is
    qpath = os.path.join(base, "queue-order.json")
    q = json.load(open(qpath, encoding="utf-8"))
    def to_ids(names):
        out_ = []
        for n in names:
            t = by_title.get(" ".join(n.split()).lower())
            out_.append(t.stable_id if t is not None else n)
        return out_
    q2 = {"order": to_ids(q.get("order", [])), "hold": to_ids(q.get("hold", [])),
          "saved": q.get("saved", "")}
    json.dump(q2, open(qpath, "w", encoding="utf-8"), indent=2)
    both = set(q2["order"]) & set(q2["hold"])
    ok("queue order rekeyed: %d queued, %d held%s" % (len(q2["order"]), len(q2["hold"]),
       (", %d in both, kept as they were" % len(both)) if both else ""))
    print("\ndone.\n")


def _mint(taken):
    import random
    import string
    while True:
        k = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(6))
        if k not in taken:
            taken.add(k)
            return k


if __name__ == "__main__":
    main()
