#!/usr/bin/env python3
"""Refuses a plan that is too long to read, before it is ever written.

`PLAN-BRIEF.md` has asked for under 300 shown words since it was written, and on
13 September 2026 forty of the forty-one plans on disk broke it, median 403 and
worst 1,588. An instruction the agent reads in its own system prompt and ignores
forty times out of forty-one is not going to start holding because it is written
somewhere better. So this counts, and `plan.py` sends the plan back.

Shown means what the board's plan modal renders: everything but the frontmatter,
Context and History. Those three are written for the next night and for the
implementing agent, and he never sees them, so they cost him nothing.

    python3 agents/planning_agent/check_plan.py data/twinkl/plans/*/*.md
    python3 agents/planning_agent/check_plan.py --self-test

This file owns its own section splitter rather than importing `plan.py`'s, so the
dependency runs one way: `plan.py` imports this, and this imports nothing of the
runner's. It is a text splitter besides, where the runner's reads a path.
"""

import argparse
import re
import sys

SECTION_RE = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
FRONT_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)

# Hidden from him by the board, so they are not counted. Keep this in step with
# what `kanban/js/13-plans.js` chooses to render.
HIDDEN = {"context", "history"}

# The five headings the brief names, in the order it names them. The board and
# the implementing agent both look for these by name, so a missing one is a
# fault even when the plan is short.
REQUIRED = ["summary", "findings", "proposed plan", "needs you"]

# One limit per kind of thing Claude writes him, because a plan, a report and a
# chat reply are not the same read. Only `plan` is enforced today; the others
# are here so the numbers live in one place when their writers start asking.
LIMITS = {
    "plan": 300,
    "report": 250,
    "reply": 150,
}

# A report is read as a scan rather than as prose, so it is held to a shape as
# well as a length. These were the only two numbers the `plain-reports` output
# style held that nothing else did, and they live here with the rest of them.
REPORT_MAX_BULLETS = 6
REPORT_BULLET_WORDS = 15

BULLET_RE = re.compile(r"^\s*(?:[-*+]|\d+\.)\s+(.*)$")
QUOTE_RE = re.compile(r"^\s*>")


def strip_front(text):
    """`text` without its YAML frontmatter, and the frontmatter as a dict."""
    front = {}
    m = FRONT_RE.match(text.lstrip())
    if not m:
        return text, front
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith((" ", "\t", "-")):
            k, v = line.split(":", 1)
            front[k.strip().lower()] = v.strip()
    return text.lstrip()[m.end():], front


def sections(body):
    """`{lowercased heading: text}` for every heading in `body`.

    A section runs to the next heading at its own level or above, the same rule
    the board renders by.
    """
    found, current, buf, level = {}, None, [], 0
    for line in body.splitlines():
        m = SECTION_RE.match(line)
        if m:
            if current and len(m.group(1)) <= level:
                found[current] = "\n".join(buf).strip()
                current, buf = None, []
            if not current:
                current, buf, level = m.group(2).strip().lower(), [], len(m.group(1))
                continue
        if current:
            buf.append(line)
    if current:
        found[current] = "\n".join(buf).strip()
    return found


def shown_words(text):
    """How many words of `text` he actually has to read.

    A blockquote does not count. The prompts a plan hands him to paste are
    quoted, and they are the deliverable rather than prose about it, so cutting
    one to make the budget would be cutting the wrong thing.
    """
    body, _ = strip_front(text)
    secs = sections(body)
    words = 0
    for name, content in secs.items():
        if name in HIDDEN:
            continue
        for line in content.splitlines():
            if QUOTE_RE.match(line):
                continue
            words += len(line.split())
    return words


def shown_bullets(text):
    """Every bullet's text, across the sections he is shown."""
    body, _ = strip_front(text)
    out = []
    for name, content in sections(body).items():
        if name in HIDDEN:
            continue
        for line in content.splitlines():
            if QUOTE_RE.match(line):
                continue
            m = BULLET_RE.match(line)
            if m:
                out.append(m.group(1).strip())
    return out


def check(text, kind="plan"):
    """Every reason `text` should be sent back, as a list of plain lines.

    An empty list means it passes. The lines are written to be read by him in
    the morning as much as by the runner at two, so they say the number.
    """
    faults = []
    body, front = strip_front(text)
    secs = sections(body)
    limit = LIMITS.get(kind, LIMITS["plan"])

    words = shown_words(text)
    if words > limit:
        faults.append(
            "Too long to read: %d shown words against a limit of %d. "
            "Cut Findings and Proposed plan, not Context." % (words, limit)
        )

    if kind == "report":
        bullets = shown_bullets(text)
        if len(bullets) > REPORT_MAX_BULLETS:
            faults.append(
                "Too many bullets: %d against a limit of %d. A report is a scan."
                % (len(bullets), REPORT_MAX_BULLETS))
        long_ones = [b for b in bullets if len(b.split()) > REPORT_BULLET_WORDS]
        if long_ones:
            faults.append(
                "%d bullet%s over %d words. The first is: %s"
                % (len(long_ones), "" if len(long_ones) == 1 else "s",
                   REPORT_BULLET_WORDS, long_ones[0][:60]))

    # The four headings are a plan's shape. A report has its own.
    missing = [h for h in REQUIRED if h not in secs] if kind == "plan" else []
    if missing:
        faults.append(
            "Missing section%s: %s. The board and the implementing agent look "
            "for these by name." % ("" if len(missing) == 1 else "s",
                                    ", ".join(h.title() for h in missing))
        )

    summary = front.get("summary", "").strip()
    if not summary:
        faults.append("No summary line in the frontmatter. The card shows that "
                      "and nothing else.")
    elif len(summary.split()) > 40:
        faults.append("Summary line is %d words. Keep it to one sentence."
                      % len(summary.split()))

    return faults


def report(path, kind="plan"):
    """Check one file on disk. Returns the faults."""
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError as exc:
        return ["could not read: %s" % exc]
    return check(text, kind)


SELF_TEST_GOOD = """---
title: A task
summary: Reuse the report format that already works.
---

### Context

- **Read.** `a.md`, `b.md`.

### Summary

The format already exists. Point the writer at it.

### Findings

- **It exists.** `data/twinkl/reports/` already does this.

### Proposed plan

1. Point the writer at the existing format.

### Needs you

1. Nothing. Ready as it stands.

## History

- **2026-09-13, revision 1.**
"""


def self_test():
    fails = []

    def eq(got, want, what):
        if got != want:
            fails.append("%s: got %r, wanted %r" % (what, got, want))

    eq(check(SELF_TEST_GOOD), [], "a good plan passes")

    # Context and History are free: padding them does not fail the check.
    padded = SELF_TEST_GOOD.replace(
        "- **Read.** `a.md`, `b.md`.", "- **Read.** " + "word " * 2000)
    eq(check(padded), [], "hidden sections are not counted")

    # The shown half is not free.
    fat = SELF_TEST_GOOD.replace(
        "The format already exists. Point the writer at it.", "word " * 400)
    got = check(fat)
    eq(len(got), 1, "one fault for a long plan")
    if got and "Too long to read: %d " % shown_words(fat) not in got[0]:
        fails.append("long plan: %r did not name the real count" % got[0])

    # A missing heading is a fault even when the plan is short.
    cut = SELF_TEST_GOOD.replace("### Findings", "### Nothing In Particular")
    got = check(cut)
    eq(len(got), 1, "one fault for a missing section")
    if got and "Findings" not in got[0]:
        fails.append("missing section: %r did not name it" % got[0])

    # No summary line in the frontmatter.
    nosum = SELF_TEST_GOOD.replace(
        "summary: Reuse the report format that already works.\n", "")
    got = check(nosum)
    eq(len(got), 1, "one fault for a missing summary")

    # A pasteable prompt is quoted, and quoted lines are free.
    quoted = SELF_TEST_GOOD.replace(
        "1. Point the writer at the existing format.",
        "1. Paste this in a session:\n\n> " + "word " * 400)
    eq(check(quoted), [], "a blockquote is not counted")

    # A report is held to its shape as well as its length.
    report_ok = "---\nsummary: It moved.\n---\n\n### What moved\n\n" + \
        "\n".join("- Line %d, short enough." % i for i in range(6))
    eq(check(report_ok, "report"), [], "a six-bullet report passes")

    got = check(report_ok + "\n- One bullet too many.", "report")
    eq(len(got), 1, "one fault for a seventh bullet")

    fat_bullet = "---\nsummary: It moved.\n---\n\n### What moved\n\n- " + \
        "word " * 20
    got = check(fat_bullet, "report")
    eq(len(got), 1, "one fault for a bullet over %d words" % REPORT_BULLET_WORDS)

    # Every kind has a limit, and they differ.
    if len(set(LIMITS.values())) != len(LIMITS):
        fails.append("two kinds share a limit, which makes one of them pointless")

    for line in fails:
        print("FAIL  " + line)
    print("%d checks, %d failed" % (10, len(fails)))
    return 1 if fails else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("paths", nargs="*", help="plan files to check")
    ap.add_argument("--kind", default="plan", choices=sorted(LIMITS),
                    help="which limit to hold it to (default: plan)")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args(argv)

    if args.self_test:
        return self_test()
    if not args.paths:
        ap.error("name at least one file, or pass --self-test")

    bad = 0
    for path in args.paths:
        faults = report(path, args.kind)
        if faults:
            bad += 1
            print("%s  (%d shown words)" % (path, shown_words(open(path, encoding="utf-8").read())))
            for f in faults:
                print("    " + f)
    print("\n%d of %d plans would be sent back." % (bad, len(args.paths)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
