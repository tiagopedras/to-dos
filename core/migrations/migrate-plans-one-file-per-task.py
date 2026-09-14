#!/usr/bin/env python3
"""Flattens plans/<night>/*.md into one file per task, plans/<slug>-<id>.md.

    python3 core/migrations/migrate-plans-one-file-per-task.py --dry-run
    python3 core/migrations/migrate-plans-one-file-per-task.py

A plan used to be filed by the night that wrote it, so a task replanned five
times had five files and the same task's history was a chain of documents
rather than one. See IMPROVEMENTS.md, "Replanning a task writes a second plan
file instead of replacing the first." Each replan already threads the whole
History section forward into the newest file (history() in plan.py), so the
newest revision of a task's plan already carries everything the older ones
said — which is what makes this a move rather than a merge: for each task,
the file with the highest `revision:` is kept and renamed flat into plans/,
and every older revision of the same task is dropped, having contributed
nothing the winner does not already hold in its own History section.

plans/actioned/ is folded in the same pass — a plan pruned there by the old
prune() is grouped and picked from exactly like any other candidate.

Grouped by `about:` (task:<id>) first, since that is the stable identity
write_plan() has written since ids existed; a plan from before that falls
back to its `task:` title, lowercased and stripped, on the same reasoning
the ledger itself falls back to titles for a pre-id row.

Idempotent: a second run finds every plan already flat under plans/ with
nothing left in a dated folder, and says so.
"""

import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DRY = "--dry-run" in sys.argv
NIGHT_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def die(msg):
    sys.stderr.write("\nREFUSED: %s\n\n" % msg)
    sys.exit(1)


def slugify(title):
    """The same rule plan_filename() in plan.py uses, kept in step by hand:
    this is a one-off migration script, not a third copy anything reads."""
    s = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    return (s or "task")[:60]


def read_front(path):
    fields = {}
    try:
        with open(path, encoding="utf-8") as fh:
            if fh.readline().strip() != "---":
                return {}
            for line in fh:
                if line.strip() == "---":
                    break
                key, _, value = line.partition(":")
                fields[key.strip().lower()] = value.strip()
    except OSError:
        return {}
    return fields


def dataset(base):
    cur = os.path.join(base, "data", ".current")
    if os.path.isfile(cur):
        with open(cur, encoding="utf-8") as fh:
            name = fh.read().strip()
            if name:
                return name
    return "twinkl"


def identity(fields):
    """What groups this plan with its own earlier and later revisions."""
    about = fields.get("about", "")
    if about.startswith("task:") and about[len("task:"):]:
        return about[len("task:"):]
    return "title:" + fields.get("task", fields.get("title", "")).strip().lower()


def target_name(fields, identity_key):
    slug = slugify(fields.get("task", fields.get("title", "")))
    if identity_key.startswith("title:"):
        return "%s.md" % slug
    return "%s-%s.md" % (slug, identity_key)


def find_candidates(plans_dir):
    """Every plan .md on disk today, wherever the old layout put it."""
    out = []
    for name in sorted(os.listdir(plans_dir)):
        full = os.path.join(plans_dir, name)
        if os.path.isdir(full) and NIGHT_RE.match(name):
            for fn in sorted(os.listdir(full)):
                if fn.endswith(".md") and fn != "index.md":
                    out.append(os.path.join(full, fn))
        elif os.path.isdir(full) and name == "actioned":
            for fn in sorted(os.listdir(full)):
                if fn.endswith(".md"):
                    out.append(os.path.join(full, fn))
    return out


def main():
    ds = dataset(ROOT)
    plans_dir = os.path.join(ROOT, "data", ds, "plans")
    if not os.path.isdir(plans_dir):
        die("no plans folder at %s" % plans_dir)

    candidates = find_candidates(plans_dir)
    if not candidates:
        print("Nothing to flatten: every plan is already loose under plans/. Already done.")
        return 0

    backup = os.path.join(ROOT, "data", ds, "plans.before-flatten")
    if not os.path.isdir(backup) and not DRY:
        die("take a copy first:\n"
            "    cp -R data/%s/plans data/%s/plans.before-flatten" % (ds, ds))

    groups = {}
    for path in candidates:
        fields = read_front(path)
        if not fields:
            print("  --   %s has no readable frontmatter, left where it is"
                  % os.path.relpath(path, plans_dir))
            continue
        key = identity(fields)
        try:
            rev = int(fields.get("revision", "1"))
        except ValueError:
            rev = 1
        stamp = fields.get("created") or fields.get("generated") or fields.get("date", "")
        groups.setdefault(key, []).append((rev, stamp, path, fields))

    targets = {}
    for key, entries in groups.items():
        entries.sort(key=lambda e: (e[0], e[1]))
        rev, stamp, winner, fields = entries[-1]
        name = target_name(fields, key)
        if name in targets and targets[name][0] != key:
            die("two different tasks would both land on plans/%s — resolve by hand "
                "(%s and %s)" % (name, targets[name][0], key))
        targets[name] = (key, winner, fields, [e[2] for e in entries[:-1]])

    moved, dropped = 0, 0
    for name, (key, winner, fields, losers) in sorted(targets.items()):
        dest = os.path.join(plans_dir, name)
        rel_from = os.path.relpath(winner, plans_dir)
        already = os.path.abspath(winner) == os.path.abspath(dest)
        if already:
            print("  ==   %s already at plans/%s (revision %s)"
                  % (rel_from, name, fields.get("revision", "1")))
        else:
            print("  ok   %s -> plans/%s (revision %s, its History carries the rest)"
                  % (rel_from, name, fields.get("revision", "1")))
            if not DRY:
                if os.path.exists(dest):
                    die("plans/%s already exists and is not the file being moved into it — "
                        "resolve by hand" % name)
                os.rename(winner, dest)
        moved += 1
        for loser in losers:
            print("  rm   %s (superseded by revision %s)"
                  % (os.path.relpath(loser, plans_dir), fields.get("revision", "1")))
            dropped += 1
            if not DRY:
                os.remove(loser)

    ledger_path = os.path.join(plans_dir, "ledger.json")
    if os.path.isfile(ledger_path):
        with open(ledger_path, encoding="utf-8") as fh:
            ledger = json.load(fh)
        by_key = {k: n for n, (k, _, _, _) in targets.items()}
        renamed = 0
        for row_key, row in (ledger or {}).items():
            if not isinstance(row, dict):
                continue
            fname = row.get("file")
            if not fname:
                continue
            # The ledger's own key is the same identity a plan's `about:`
            # carries once ids exist, so it is tried first; a pre-id ledger
            # row falls back to the same title key identity() would build.
            new_name = by_key.get(row_key) or by_key.get("title:" + row_key.strip().lower())
            if new_name and new_name != fname:
                row["file"] = new_name
                renamed += 1
        if renamed and not DRY:
            tmp = ledger_path + ".tmp"
            with open(tmp, "w", encoding="utf-8", newline="") as fh:
                json.dump(ledger, fh, indent=2, sort_keys=True)
            os.replace(tmp, ledger_path)
        print("\n%d ledger row%s repointed at its flattened file."
              % (renamed, "" if renamed == 1 else "s"))

    actioned = os.path.join(plans_dir, "actioned")
    if os.path.isdir(actioned) and not DRY:
        try:
            os.rmdir(actioned)
        except OSError:
            print("\nplans/actioned/ is not empty — check what is left in it by hand.")

    print("\n%d task%s flattened, %d superseded revision%s dropped."
          % (moved, "" if moved == 1 else "s", dropped, "" if dropped == 1 else "s"))
    if DRY:
        print("Dry run: nothing written.")
    else:
        print("\nplans/<night>/ folders are untouched apart from the plans moved out of "
              "them — index.md and run.json stay, that is still their home. Once the "
              "board reads right:")
        print("    rm -r data/%s/plans.before-flatten" % ds)
    return 0


if __name__ == "__main__":
    sys.exit(main())
