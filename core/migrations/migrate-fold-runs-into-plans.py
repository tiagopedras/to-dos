#!/usr/bin/env python3
"""Folds the runs stream into the plans stream.

    python3 core/migrations/migrate-fold-runs-into-plans.py --dry-run
    python3 core/migrations/migrate-fold-runs-into-plans.py

Plans and Execution were two boards holding one pipeline. Accepting a plan wrote
`accepted` on the plan document and minted a second document into
`data/<dataset>/runs/`, which landed in Execution's Backlog and sat there until
it was dragged to To do — a gate that filtered nothing and was simply a step to
remember. On 12 Sep 2026 six plans stood accepted, all six had runs, and two had
never been moved.

The reason on record for two documents was that PACKAGES/work_streams/CONTRACT.md
allows one `state:` per file. That is an argument for one document with a longer
column set, not for two boards. Decided 13 Sep 2026: fold them, and keep Plans'
six columns rather than growing to eight — the implementing agent is not
autonomous enough for where a card sits to be worth six extra tracks, and the
stage it is at rides on the card instead. If that changes, the eight-column
version is the one to build; the `production` field this writes is what it would
become columns of.

What that means per document:

    run backlog  ->  plan keeps `accepted`, production: none
                     (accepted, and the agent has not started)
    run review   ->  plan takes `accepted` and production: review, and the run's
                     report is appended to the plan
    run done     ->  plan takes `done`, owned by him, production: done

The report is the whole reason this is a migration rather than a delete. Three
of the seven run documents carry the implementing agent's full written reports
— 105, 69 and 125 lines — and those are real work that exists nowhere else. The
four that do not are stubs: two empty backlog rows and two `done` markers, and
the entry that decided this said to drop them rather than migrate them, because
a completed state and an empty stub carry nothing a folded board needs.

The runs folder is left on disk. Deleting it is a separate, deliberate step, and
`data/<dataset>/runs.before-fold/` should exist beside it before either happens.

Idempotent: a second run finds no runs left to fold, or finds the plans already
carrying `production` and says so.
"""

import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

DRY = "--dry-run" in sys.argv


def die(msg):
    sys.stderr.write("\nREFUSED: %s\n\n" % msg)
    sys.exit(1)


def field(text, key):
    m = re.search(r"^%s:\s*(.*)$" % re.escape(key), text, re.M)
    return m.group(1).strip() if m else ""


def set_field(text, key, value):
    """One frontmatter line replaced or added.

    Line at a time rather than through a YAML writer, the same reason
    stream.py's own _set does it this way: half these summaries contain a colon
    and a parser would reflow them.
    """
    pat = re.compile(r"^%s:.*$\n?" % re.escape(key), re.M)
    line = "%s: %s\n" % (key, value)
    if pat.search(text):
        return pat.sub(line, text, count=1)
    return text.replace("---\n", "---\n" + line, 1)


def body(text):
    """Everything after the closing ---, with the pointer-to-the-plan section
    dropped. That section exists only because the run was a second document; on
    the plan itself it would be a page telling the reader to read the page."""
    m = re.match(r"\A---\n.*?\n---\n", text, re.S)
    rest = text[m.end():] if m else text
    rest = re.sub(r"\A\s*## The plan\n.*?(?=\n## )", "", rest, flags=re.S)
    return rest.strip()


def dataset(base):
    cur = os.path.join(base, "data", ".current")
    if os.path.isfile(cur):
        with open(cur, encoding="utf-8") as fh:
            name = fh.read().strip()
            if name:
                return name
    return "twinkl"


def main():
    ds = dataset(ROOT)
    runs_dir = os.path.join(ROOT, "data", ds, "runs")
    plans_dir = os.path.join(ROOT, "data", ds, "plans")
    if not os.path.isdir(plans_dir):
        die("no plans folder at %s" % plans_dir)
    if not os.path.isdir(runs_dir):
        print("Nothing to fold: no runs folder. Already done.")
        return 0

    backup = os.path.join(ROOT, "data", ds, "runs.before-fold")
    if not os.path.isdir(backup) and not DRY:
        die("take a copy first:\n"
            "    cp -R data/%s/runs data/%s/runs.before-fold" % (ds, ds))

    runs = sorted(f for f in os.listdir(runs_dir) if f.endswith(".md"))
    if not runs:
        print("Nothing to fold: the runs folder is empty.")
        return 0

    moved = folded = dropped = 0
    for name in runs:
        path = os.path.join(runs_dir, name)
        with open(path, encoding="utf-8") as fh:
            run = fh.read()
        state = field(run, "state")
        rel = field(run, "plan")
        if not rel:
            print("  --   %s names no plan, left alone" % name)
            continue
        plan_path = os.path.join(plans_dir, rel)
        if not os.path.isfile(plan_path):
            print("  --   %s points at a plan that is gone (%s), left alone" % (name, rel))
            continue
        with open(plan_path, encoding="utf-8") as fh:
            plan = fh.read()

        if state == "review":
            report = body(run)
            if not report:
                print("  --   %s is in review with nothing written, treated as a stub" % name)
                plan = set_field(plan, "production", "none")
                dropped += 1
            else:
                # The plan becomes the one document, so it takes the state the
                # run was in: he accepted it, the agent reported back, and the
                # next move is his.
                plan = set_field(plan, "state", "accepted")
                plan = set_field(plan, "owner", "me")
                plan = set_field(plan, "production", "review")
                plan = set_field(plan, "seen", field(run, "seen") or "no")
                summary = field(run, "summary")
                if summary and summary != "[fill in]":
                    plan = set_field(plan, "production_summary", summary)
                if "## What the implementing agent did" not in plan:
                    plan = plan.rstrip() + \
                        "\n\n## What the implementing agent did\n\n" + report + "\n"
                folded += 1
                print("  ok   %s -> report folded onto its plan (%d lines)"
                      % (name, len(report.splitlines())))
        elif state == "done":
            plan = set_field(plan, "state", "done")
            plan = set_field(plan, "owner", "me")
            plan = set_field(plan, "production", "done")
            moved += 1
            print("  ok   %s -> its plan is done" % name)
        else:
            # backlog, ready, doing: accepted and not reported back.
            plan = set_field(plan, "state", "accepted")
            plan = set_field(plan, "owner", "implementing-agent")
            plan = set_field(plan, "production", "none")
            dropped += 1
            print("  ok   %s -> stub, its plan stays waiting to be produced" % name)

        if not DRY:
            with open(plan_path, "w", encoding="utf-8") as fh:
                fh.write(plan)

    print("\n%d report%s folded on, %d plan%s closed, %d stub%s recorded."
          % (folded, "" if folded == 1 else "s",
             moved, "" if moved == 1 else "s",
             dropped, "" if dropped == 1 else "s"))
    if DRY:
        print("Dry run: nothing written.")
    else:
        print("\nThe runs folder is untouched. Once the board reads right, it can go:")
        print("    rm -r data/%s/runs" % ds)
    return 0


if __name__ == "__main__":
    sys.exit(main())
