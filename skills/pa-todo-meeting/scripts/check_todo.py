#!/usr/bin/env python3
"""Consistency checker for the PA to-do list.

Catches the mechanical mistakes that are easy to make by hand and awkward to
spot by eye: deadlines landing on weekends or UK bank holidays, sub-step dates
running past their parent, a blocked-by: pointing at a task that does not exist,
an ai:full task with no prompt to hand over, and a week that is over-committed.

The file used to carry five sections copied out of the buckets, and most of this
script existed to prove those copies still matched. They were removed on 10 Aug
2026 and are worked out by the board instead, so the copies cannot drift and
those checks are gone with them. What is left checks the tags themselves.

It deliberately does not try to judge meaning. Dependency logic, state logic,
whether a delegation tag is honest and whether a suggested message actually
sounds like him are all in references/audit-checklist.md and need reading, not
parsing.

Usage:
    python3 check_todo.py /path/to/todo.md [--today YYYY-MM-DD]

Exit code is 0 when clean, 1 when anything is flagged, so it can gate a commit.
"""

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

# England and Wales. Substitute days are the observed dates, which are the ones
# that matter for whether someone is at their desk.
BANK_HOLIDAYS = {
    "2026-01-01": "New Year's Day",
    "2026-04-03": "Good Friday",
    "2026-04-06": "Easter Monday",
    "2026-05-04": "Early May bank holiday",
    "2026-05-25": "Spring bank holiday",
    "2026-08-31": "Summer bank holiday",
    "2026-12-25": "Christmas Day",
    "2026-12-28": "Boxing Day (substitute)",
    "2027-01-01": "New Year's Day",
    "2027-03-26": "Good Friday",
    "2027-03-29": "Easter Monday",
    "2027-05-03": "Early May bank holiday",
    "2027-05-31": "Spring bank holiday",
    "2027-08-30": "Summer bank holiday",
    "2027-12-27": "Christmas Day (substitute)",
    "2027-12-28": "Boxing Day (substitute)",
}

DUE = re.compile(r"`due:(\d{4}-\d{2}-\d{2})`")
DUE_LOOSE = re.compile(r"due:(\d{4}-\d{2}-\d{2})")
IMPACT = re.compile(r"`impact:(high|med|low)`")
EFFORT = re.compile(r"`effort:([SML])`")
AI_TAG = re.compile(r"`ai:(full|partial|none)`")
BOLD_TITLE = re.compile(r"\*\*(.+?)\*\*")
TASK_LINE = re.compile(r"^(\s*)- \[( |x)\] (.*)$")

# The four tags added on 10 Aug 2026, when the five copied sections were removed
# from the file. Each one is now the sole input to a view the board works out at
# render time, so a missing tag silently empties part of a view rather than
# merely disagreeing with it. Nothing else can catch that, hence the hard checks.
SLUG = re.compile(r"`#([a-z0-9][a-z0-9-]*)`")
WEEK = re.compile(r"`week`")
BLOCKED_BY = re.compile(r"`blocked-by:([a-z0-9,\- ]+)`")
RANK = re.compile(r"`rank:(\d+)`")
HEADLINE = re.compile(r"`headline:([^`]*)`")
START = re.compile(r"`start:([^`]*)`")
PROMPT_NOTE = re.compile(r"^\s*-\s+Prompt:", re.IGNORECASE)


class Finding:
    def __init__(self, line_no, severity, message):
        self.line_no = line_no
        self.severity = severity
        self.message = message

    def __str__(self):
        loc = f"line {self.line_no}" if self.line_no else "file"
        return f"  [{self.severity}] {loc}: {self.message}"


def parse_date(s):
    return dt.date.fromisoformat(s)


def working_day_problem(date):
    """Return a description when a date is not a working day, else None."""
    iso = date.isoformat()
    if iso in BANK_HOLIDAYS:
        return f"{BANK_HOLIDAYS[iso]}, a UK bank holiday"
    if date.weekday() == 5:
        return "a Saturday"
    if date.weekday() == 6:
        return "a Sunday"
    return None


def previous_working_day(date):
    d = date - dt.timedelta(days=1)
    while working_day_problem(d):
        d -= dt.timedelta(days=1)
    return d


def next_working_day(date):
    d = date + dt.timedelta(days=1)
    while working_day_problem(d):
        d += dt.timedelta(days=1)
    return d


def load(path):
    text = Path(path).read_text(encoding="utf-8")
    return text.splitlines()


# Delegate prompts are a starting point he complements, not a spec. Past this
# he has to read the prompt before using it, which defeats the point.
PROMPT_WORD_CEILING = 70


def section_of(lines, idx):
    """Nearest preceding heading, so findings can be reported in context."""
    for i in range(idx, -1, -1):
        if lines[i].startswith("## "):
            return lines[i][3:].strip()
    return "unknown section"


def tier_of(lines, idx):
    """Nearest preceding state heading, Doing / To do / Backlog."""
    for i in range(idx, -1, -1):
        if lines[i].startswith("### "):
            return lines[i][4:].strip()
        if lines[i].startswith("## "):
            return None
    return None


def check_working_days(lines):
    findings = []
    for i, line in enumerate(lines, start=1):
        for m in DUE.finditer(line):
            date = parse_date(m.group(1))
            problem = working_day_problem(date)
            if not problem:
                continue
            # A step that waits on someone else replying pushes forward instead
            # of back, so suggest both and let the reader pick.
            back = previous_working_day(date)
            fwd = next_working_day(date)
            findings.append(
                Finding(
                    i,
                    "FIX",
                    f"due:{m.group(1)} is {problem}. "
                    f"Pull back to {back.isoformat()} ({back.strftime('%a')}), "
                    f"or push to {fwd.isoformat()} ({fwd.strftime('%a')}) if the step "
                    f"waits on someone else replying.",
                )
            )
    return findings


# Steps whose real work is contacting a person. These are the ones that stall
# for days because writing the opening line is the friction, not the task, so
# they are expected to carry a pre-written message underneath.
CONTACT_STEP = re.compile(
    r"\b("
    r"ask(?:ing|s)?|remind(?:er|ing|s)?|chase(?:rs?|d)?|chasing|nudge|"
    r"message|email|invite|"
    r"send (?:out |the |a )?(?:[\w'’]+ )*(?:requests?|invites?|doc|document|note|list|email)|"
    r"share (?:the |my |a )?.*\bwith\b|"
    r"check in with|follow up|"
    r"push \w+ to|"
    r"(?:set up|book|schedule|arrange) (?:a |the )?(?:session|call|meeting|slot|1:1|chat|conversation)"
    r")\b",
    re.I,
)

# Steps that read like contact but have no human on the other end. Setting up a
# recurring reminder or prompting Claude is configuration, not correspondence.
NOT_CORRESPONDENCE = re.compile(
    r"\b(claude|recurring (?:reminder|task)|reminder task|cron|myself)\b", re.I
)

SUGGESTED_MESSAGE = re.compile(r"suggested message", re.I)


def leading_spaces(line):
    return len(line) - len(line.lstrip(" "))


def check_suggested_messages(lines):
    """Flag live contact steps that have no pre-written message under them.

    The message note lives indented one level deeper than the step it serves,
    so it is unambiguous which step it belongs to even when a parent has both
    notes and sub-steps at the same indent.
    """
    findings = []
    for i, line in enumerate(lines, start=1):
        m = TASK_LINE.match(line)
        if not m:
            continue
        indent, checked, body = m.group(1), m.group(2) == "x", m.group(3)
        if checked:
            continue
        if not CONTACT_STEP.search(body):
            continue
        if NOT_CORRESPONDENCE.search(body):
            continue

        found = False
        j = i  # lines is zero-indexed, so this is the line after the step
        while j < len(lines):
            nxt = lines[j]
            if nxt.startswith("#"):
                break
            if not nxt.strip():
                break
            if leading_spaces(nxt) <= len(indent):
                break
            if SUGGESTED_MESSAGE.search(nxt):
                found = True
                break
            j += 1

        if not found:
            title = BOLD_TITLE.search(body)
            label = title.group(1) if title else body.split("`")[0].strip()
            findings.append(
                Finding(
                    i,
                    "CHECK",
                    f"\"{label}\" needs someone contacted but carries no suggested "
                    f"message. Draft one indented under it so it can be sent as is.",
                )
            )
    return findings


def flatten(s):
    """Whitespace-insensitive form, so a wrapped copy still matches its source."""
    return re.sub(r"\s+", " ", s).strip().strip('"').strip()


def prompt_under(lines, task_line, indent):
    """The prompt text written under a task or sub-step, or None.

    Matched at exactly one indent level deeper, the same rule suggested messages
    follow. A parent's own prompt sits among its notes at that depth, while its
    sub-steps' prompts sit two levels deeper, so the depth alone says which one
    a prompt belongs to without needing to track blank lines between them.
    """
    want = indent + 2
    j = task_line  # lines is zero-indexed, so this is the line after the task
    while j < len(lines):
        line = lines[j]
        if line.startswith("#"):
            break
        if line.strip():
            depth = leading_spaces(line)
            if depth <= indent:
                break
            if depth == want and PROMPT_NOTE.match(line):
                quotes = [m.start() for m in re.finditer('"', line)]
                if len(quotes) >= 2:
                    return flatten(line[quotes[0] + 1 : quotes[-1]])
                return flatten(line.split(":", 1)[1])
        j += 1
    return None


def all_entries(tasks):
    """Every task and sub-step in one flat list, since the new tags sit on both."""
    out = []
    for task in tasks:
        out.append(task)
        out.extend(task["subs"])
    return out


def parse_tasks(lines):
    """Group task lines into parents and their indented sub-steps."""
    tasks = []
    current = None
    for i, line in enumerate(lines, start=1):
        m = TASK_LINE.match(line)
        if not m:
            continue
        indent, checked, body = m.group(1), m.group(2) == "x", m.group(3)
        section = section_of(lines, i - 1)
        due_m = DUE_LOOSE.search(body)
        slug_m = SLUG.search(body)
        blocked_m = BLOCKED_BY.search(body)
        rank_m = RANK.search(body)
        ai_m = AI_TAG.search(body)
        entry = {
            "line": i,
            "indent": len(indent),
            "checked": checked,
            "body": body,
            "due": parse_date(due_m.group(1)) if due_m else None,
            "impact": (IMPACT.search(body).group(1) if IMPACT.search(body) else None),
            "effort": (EFFORT.search(body).group(1) if EFFORT.search(body) else None),
            "title": (BOLD_TITLE.search(body).group(1) if BOLD_TITLE.search(body) else body),
            "section": section,
            "tier": tier_of(lines, i - 1),
            "slug": slug_m.group(1) if slug_m else None,
            "week": bool(WEEK.search(body)),
            "blocked_by": (
                [s.strip() for s in blocked_m.group(1).split(",") if s.strip()]
                if blocked_m
                else []
            ),
            "rank": int(rank_m.group(1)) if rank_m else None,
            "ai": ai_m.group(1) if ai_m else None,
            "prompt": prompt_under(lines, i, len(indent)),
            "subs": [],
        }
        if entry["indent"] == 0:
            current = entry
            tasks.append(entry)
        elif current is not None:
            current["subs"].append(entry)
    return tasks


def check_substep_chronology(tasks):
    findings = []
    for task in tasks:
        dated = [s for s in task["subs"] if s["due"]]
        if not dated:
            continue
        if task["due"]:
            for s in dated:
                if s["due"] > task["due"]:
                    findings.append(
                        Finding(
                            s["line"],
                            "FIX",
                            f"sub-step is due {s['due'].isoformat()}, after its parent "
                            f"\"{task['title']}\" which is due {task['due'].isoformat()}.",
                        )
                    )
        for a, b in zip(dated, dated[1:]):
            if b["due"] < a["due"]:
                findings.append(
                    Finding(
                        b["line"],
                        "CHECK",
                        f"sub-step dates go backwards, {a['due'].isoformat()} then "
                        f"{b['due'].isoformat()}, under \"{task['title']}\". "
                        f"Intentional overlaps are fine, but confirm it reads correctly.",
                    )
                )
    return findings


def check_overdue(tasks, today):
    findings = []
    horizon = today + dt.timedelta(days=7)
    for task in tasks:
        for entry in [task] + task["subs"]:
            if entry["checked"] or not entry["due"]:
                continue
            if entry["due"] < today:
                days = (today - entry["due"]).days
                findings.append(
                    Finding(
                        entry["line"],
                        "OVERDUE",
                        f"{entry['due'].isoformat()} was {days} day{'s' if days != 1 else ''} "
                        f"ago: {entry['title'][:70]}",
                    )
                )
            elif entry["due"] <= horizon:
                findings.append(
                    Finding(
                        entry["line"],
                        "DUE SOON",
                        f"{entry['due'].isoformat()} ({entry['due'].strftime('%a')}): "
                        f"{entry['title'][:70]}",
                    )
                )
    return findings


def check_tag_hygiene(lines, tasks):
    findings = []
    for task in tasks:
        if task["due"] and "`urgent`" in task["body"]:
            findings.append(
                Finding(
                    task["line"],
                    "FIX",
                    f"\"{task['title']}\" has both a due date and `urgent`. They are "
                    f"alternatives, keep the date.",
                )
            )
        for tag, name in ((task["impact"], "impact"), (task["effort"], "effort")):
            if tag is None:
                findings.append(
                    Finding(task["line"], "CHECK", f"\"{task['title']}\" is missing an {name}: tag.")
                )
        if not AI_TAG.search(task["body"]):
            findings.append(
                Finding(task["line"], "CHECK", f"\"{task['title']}\" is missing an ai: tag.")
            )
    return findings


def check_stale(lines, today):
    for i, line in enumerate(lines[:10], start=1):
        m = re.match(r"Last updated:\s*(\d{4}-\d{2}-\d{2})", line.strip())
        if m:
            stamped = parse_date(m.group(1))
            age = (today - stamped).days
            if age > 7:
                return [
                    Finding(
                        i,
                        "CHECK",
                        f"Last updated {age} days ago. Walk the buckets rather than doing "
                        f"a targeted update, the file is likely to have drifted.",
                    )
                ]
            if age < 0:
                return [Finding(i, "FIX", f"Last updated is dated in the future: {m.group(1)}.")]
            return []
    return [Finding(None, "CHECK", "No 'Last updated' line found near the top of the file.")]


def check_slugs(tasks):
    """Slugs must be unique, and every blocked-by: must point at one that exists.

    This is the check that replaced reading the dependency chain against the
    notes by eye. A blocked-by: pointing at nothing used to be invisible; now it
    is the one thing that silently drops a link out of the chain.
    """
    findings = []
    entries = all_entries(tasks)
    seen = {}
    for entry in entries:
        if not entry["slug"]:
            continue
        if entry["slug"] in seen:
            findings.append(
                Finding(
                    entry["line"],
                    "FIX",
                    f"slug #{entry['slug']} is already used on line {seen[entry['slug']]}. "
                    f"Slugs have to be unique or blocked-by: points at both.",
                )
            )
        seen[entry["slug"]] = entry["line"]

    for entry in entries:
        for slug in entry["blocked_by"]:
            if slug not in seen:
                findings.append(
                    Finding(
                        entry["line"],
                        "FIX",
                        f"\"{entry['title'][:50]}\" is blocked-by:{slug} but no task carries "
                        f"`#{slug}`. Add the slug to the blocking task, or make it a "
                        f"Waiting on: note if it is a person rather than a task.",
                    )
                )
            elif seen[slug] == entry["line"]:
                findings.append(
                    Finding(entry["line"], "FIX", f"\"{entry['title'][:50]}\" is blocked by itself.")
                )

    # A slug nothing points at is dead weight. Harmless, but it implies a link
    # that is not there, which is worse than no slug at all.
    pointed_at = {s for e in entries for s in e["blocked_by"]}
    for entry in entries:
        if entry["slug"] and entry["slug"] not in pointed_at:
            findings.append(
                Finding(
                    entry["line"],
                    "CHECK",
                    f"#{entry['slug']} is not referenced by any blocked-by:. Either "
                    f"something should point at it, or the slug can go.",
                )
            )
    return findings


def check_prompt_coverage(tasks):
    """Every live ai:full item carries its own prompt, on the task.

    Prompts used to live only in Delegate to Claude, which made them the one
    thing in the file that could not be rebuilt from the buckets. They live on
    the task now, so an ai:full item without one breaks the rebuild.
    """
    findings = []
    for entry in all_entries(tasks):
        if entry["ai"] != "full" or entry["checked"]:
            continue
        if not entry["prompt"]:
            findings.append(
                Finding(
                    entry["line"],
                    "FIX",
                    f"\"{entry['title'][:50]}\" is ai:full but carries no Prompt: note. "
                    f"Delegate to Claude is built from these, so it will rebuild without it.",
                )
            )
            continue
        words = len(entry["prompt"].split())
        if words > PROMPT_WORD_CEILING:
            findings.append(
                Finding(
                    entry["line"],
                    "CHECK",
                    f"prompt on \"{entry['title'][:40]}\" is {words} words. He asked for "
                    f"short prompts he complements himself, so trim towards "
                    f"{PROMPT_WORD_CEILING}.",
                )
            )
    return findings


def check_start_dates(lines):
    """`start:` is the earliest the work can begin. `due:` is the deadline.

    Two failures matter. A start date after its own deadline is a contradiction,
    and one of the two is simply wrong. A start date that has already passed is
    dead weight: it hides nothing and reads as a constraint that no longer
    exists, so it should come off the line.
    """
    findings = []
    today = dt.date.today()
    for i, line in enumerate(lines, start=1):
        m = START.search(line)
        if not m:
            continue
        raw = m.group(1).strip()
        try:
            start = parse_date(raw)
        except (ValueError, TypeError):
            findings.append(
                Finding(i, "FIX", f"`start:{raw}` is not a YYYY-MM-DD date.")
            )
            continue

        due_m = DUE.search(line)
        if due_m:
            due = parse_date(due_m.group(1))
            if start > due:
                findings.append(
                    Finding(
                        i,
                        "FIX",
                        f"start:{raw} is after due:{due_m.group(1)}. It cannot begin "
                        f"after it is meant to be finished, so one of the two is wrong.",
                    )
                )
                continue

        if start <= today:
            findings.append(
                Finding(
                    i,
                    "CHECK",
                    f"start:{raw} has passed, so it is not holding anything back. "
                    f"Drop the tag.",
                )
            )
    return findings


def check_headline(lines):
    """Exactly one `headline:` in the file, or none.

    Tier two of how he prioritises is "the one thing". Two of them is the same
    failure as a week with two priorities, and the board would silently show
    only the first it found. A stale one matters too: a headline set five weeks
    ago is either a task that needs breaking down or the wrong pick.
    """
    found = []
    for i, line in enumerate(lines, start=1):
        m = HEADLINE.search(line)
        if m:
            found.append((i, m.group(1), line))

    if not found:
        return [
            Finding(
                1,
                "CHECK",
                "No task carries `headline:`. Pick the one thing that makes the "
                "others easier or unnecessary.",
            )
        ]

    findings = []
    if len(found) > 1:
        for i, _, line in found:
            findings.append(
                Finding(
                    i,
                    "FIX",
                    f"A second `headline:` here. Only one task can be the one "
                    f"thing: {line.strip()[:70]}",
                )
            )
        return findings

    line_no, stamp, _ = found[0]
    try:
        age = (dt.date.today() - parse_date(stamp)).days
    except (ValueError, TypeError):
        return [
            Finding(
                line_no,
                "FIX",
                f"`headline:{stamp}` is not a YYYY-MM-DD date. It records the day "
                f"the headline was set.",
            )
        ]
    if age > 14:
        findings.append(
            Finding(
                line_no,
                "CHECK",
                f"Headline set {age} days ago and still open. Either break it into "
                f"steps or accept it was the wrong pick.",
            )
        )
    return findings


def check_ranks(tasks):
    """Ranks order Delegate to Claude, so they must be unique and complete."""
    findings = []
    entries = all_entries(tasks)
    ranked = [e for e in entries if e["rank"] is not None]

    seen = {}
    for entry in ranked:
        if entry["rank"] in seen:
            findings.append(
                Finding(
                    entry["line"],
                    "FIX",
                    f"rank:{entry['rank']} is already used on line {seen[entry['rank']]}. "
                    f"Two items cannot share a position in the list.",
                )
            )
        seen[entry["rank"]] = entry["line"]

    for entry in ranked:
        if entry["ai"] != "full":
            findings.append(
                Finding(
                    entry["line"],
                    "FIX",
                    f"\"{entry['title'][:50]}\" carries rank:{entry['rank']} but is not "
                    f"ai:full. Only fully delegable work belongs in that list.",
                )
            )

    for entry in entries:
        if entry["ai"] == "full" and not entry["checked"] and entry["rank"] is None:
            findings.append(
                Finding(
                    entry["line"],
                    "CHECK",
                    f"\"{entry['title'][:50]}\" is ai:full with no rank:, so it will not "
                    f"appear in Delegate to Claude.",
                )
            )

    if ranked:
        numbers = sorted(seen)
        missing = [n for n in range(1, max(numbers) + 1) if n not in seen]
        if missing:
            findings.append(
                Finding(
                    None,
                    "CHECK",
                    f"ranks skip {', '.join(str(n) for n in missing)}. Harmless, but the "
                    f"numbering in Delegate will not match the tags.",
                )
            )
    return findings


def check_week_health(tasks, today):
    """The `week` tag is the whole of This week now, so it is checked on its own.

    There is no section to compare it against any more — the board works the
    plan out from these tags every time it renders. What is left to catch is the
    plan being dishonest: more committed than a week holds, or tags left behind
    on work that has moved on.
    """
    findings = []
    tagged = [e for e in all_entries(tasks) if e["week"]]

    m_items = [e for e in tagged if e["effort"] == "M" and not e["checked"]]
    if len(m_items) > 2:
        findings.append(
            Finding(
                None,
                "CHECK",
                f"{len(m_items)} M-effort items are tagged `week`. The ceiling is two once "
                f"meetings are counted. Ask which one loses the tag.",
            )
        )

    for entry in tagged:
        if entry["checked"]:
            continue
        if entry["due"] and entry["due"] > today + dt.timedelta(days=6):
            findings.append(
                Finding(
                    entry["line"],
                    "FIX",
                    f"tagged `week` but due {entry['due'].isoformat()}, outside the week. "
                    f"Drop the tag or bring the date in.",
                )
            )

    for task in tasks:
        if not task["checked"]:
            continue
        for sub in task["subs"]:
            if sub["week"] and not sub["checked"]:
                findings.append(
                    Finding(
                        sub["line"],
                        "CHECK",
                        f"tagged `week` under a completed parent \"{task['title'][:40]}\". "
                        f"Drop the tag or reopen the parent.",
                    )
                )
    return findings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--today", help="Override today's date, format YYYY-MM-DD")
    args = ap.parse_args()

    today = parse_date(args.today) if args.today else dt.date.today()
    lines = load(args.path)
    tasks = parse_tasks(lines)

    groups = [
        ("Status", check_overdue(tasks, today)),
        ("Working days", check_working_days(lines)),
        ("Sub-step chronology", check_substep_chronology(tasks)),
        ("This week", check_week_health(tasks, today)),
        ("Slugs and dependencies", check_slugs(tasks)),
        ("Prompts on tasks", check_prompt_coverage(tasks)),
        ("Delegate ranks", check_ranks(tasks)),
        ("The one thing", check_headline(lines)),
        ("Start dates", check_start_dates(lines)),
        ("Tag hygiene", check_tag_hygiene(lines, tasks)),
        ("Suggested messages", check_suggested_messages(lines)),
        ("Freshness", check_stale(lines, today)),
    ]

    print(f"Checked {args.path} against {today.isoformat()} ({today.strftime('%A')})")
    print(f"{len(tasks)} top-level tasks, {sum(len(t['subs']) for t in tasks)} sub-steps\n")

    problems = 0
    for name, findings in groups:
        if not findings:
            print(f"{name}: clean")
            continue
        print(f"{name}:")
        for f in findings:
            print(f)
            if f.severity == "FIX":
                problems += 1
        print()

    print(
        "\nMechanical checks only. Dependency logic, state logic, whether the "
        "delegation tags are honest and whether a suggested message sounds like "
        "him need references/audit-checklist.md."
    )
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
