#!/usr/bin/env python3
"""Renders every due written-report definition, once a week.

See agents/plan-agent/REPORT-DEFS.md for what a definition looks like and
IMPROVEMENTS.md, "A report he defines once cannot be written down anywhere."
core/aggregate.period_view() is the grounding — what actually finished, in
the window and buckets a definition names — handed to the model as fact
alongside the definition's own questions and README.md's "Rules for writing
a report", inlined rather than assumed read. The model writes the report;
nothing here templates prose, on the same reasoning that entry gives: what
moved and what it means is a judgement, and Mustache is not a language for
one.

A pass of its own rather than riding on plan.py's nightly batch, the same
shape brief.py already is and for the same reason: eligible() in pick.py has
never heard of a written report, and this has nothing to do while it is
choosing tonight's plans anyway — a definition due weekly is not due every
night.

    python3 agents/plan-agent/report.py --dry-run          what is due, no spend
    python3 agents/plan-agent/report.py                    render what's due
    python3 agents/plan-agent/report.py --def NAME         one definition, by hand
"""

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "core"))
sys.path.insert(0, HERE)

import aggregate  # noqa: E402
import paths  # noqa: E402
import plan  # noqa: E402

TASK_TIMEOUT = 5 * 60
BUDGET_PER_REPORT = 1.00
REPORT_BUDGET = 3.00

RULES = """Rules for writing this, from README.md's "Rules for writing a report":

- Never list individual to-dos. A report is not a filtered copy of the list.
  If the reader wants the tasks, the board is right there.
- Outcomes, not activity. Say what actually changed and what is now possible
  that was not before, at a higher altitude than a checklist. Where nothing
  moved, say so plainly and say what it is waiting on.
- Prose by default, bullets when being specific earns it — naming particular
  things, numbers, decisions, open questions.
- His voice: contractions, British English, short sentences and short
  paragraphs, no em dashes. Simple and short beats thorough.
- Under 400 words unless there is a real reason to go longer."""

FRONT_RE = re.compile(r"\A---\n(.*?)\n---\n", re.S)
FIELD_RE = re.compile(r"^(\w+):\s*(.*)$")


def log(line):
    plan.log("report: %s" % line)


def defs_dir():
    return os.path.join(paths.data_dir(), "reports", "_defs")


def state_path():
    return os.path.join(defs_dir(), ".rendered.json")


def load_state():
    try:
        with open(state_path(), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_state(state):
    path = state_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(state, fh, indent=2, sort_keys=True)
    os.replace(tmp, path)


def read_def(path):
    with open(path, encoding="utf-8") as fh:
        text = fh.read()
    m = FRONT_RE.match(text)
    if not m:
        return None
    front = {}
    for line in m.group(1).splitlines():
        fm = FIELD_RE.match(line)
        if fm:
            front[fm.group(1)] = fm.group(2).strip()
    if "window_days" not in front:
        return None
    try:
        window_days = int(front["window_days"])
    except ValueError:
        return None
    buckets = [b.strip() for b in front.get("buckets", "").split(",") if b.strip()] or None
    return {
        "name": os.path.basename(path)[:-3],
        "title": front.get("title", os.path.basename(path)[:-3]),
        "window_days": window_days,
        "buckets": buckets,
        "body": text[m.end():].strip(),
    }


def load_defs():
    d = defs_dir()
    if not os.path.isdir(d):
        return []
    out = []
    for name in sorted(os.listdir(d)):
        if name.endswith(".md") and not name.startswith("."):
            parsed = read_def(os.path.join(d, name))
            if parsed:
                out.append(parsed)
    return out


def due(defn, state, today):
    """Whether a full window has passed since this one last rendered."""
    row = state.get(defn["name"])
    if not row or not row.get("last_rendered"):
        return True
    try:
        last = dt.date.fromisoformat(row["last_rendered"])
    except ValueError:
        return True
    return (today - last).days >= defn["window_days"]


def slugify(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return (s or "report")[:60]


def build_prompt(defn, period, today):
    covers = "%s to %s" % (period["window_start"], period["window_end"])
    facts = json.dumps({
        "completed": period["completed"], "by_bucket": period["by_bucket"],
        "completed_count": period["completed_count"],
    }, indent=2)
    return (
        "Write a short written report for the to-do board's Reports tab.\n\n"
        "%s\n\n"
        "What this report is about, from its own definition:\n\n%s\n\n"
        "Window: %s. Buckets: %s.\n\n"
        "What actually finished in this window — the only ground truth "
        "you have, do not invent anything beyond it and do not simply "
        "restate it as a list:\n\n```json\n%s\n```\n\n"
        "Reply with frontmatter then the body, and nothing else:\n\n"
        "---\ntopic: <a short topic label>\n"
        "summary: <one line — the actual finding, not \"see below\">\n---\n\n"
        "# %s\n\n<the report body>\n"
        % (RULES, defn["body"], covers,
           ", ".join(defn["buckets"]) if defn["buckets"] else "every bucket",
           facts, defn["title"])
    )


def run_report_agent(defn, period, today, dry=False):
    cmd = [
        "claude", "-p", build_prompt(defn, period, today),
        "--output-format", "json",
        "--max-budget-usd", str(BUDGET_PER_REPORT),
        "--allowedTools", "Read",
    ]
    if dry:
        return None, 0.0, None
    try:
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True,
                              text=True, timeout=TASK_TIMEOUT)
    except subprocess.TimeoutExpired:
        return None, 0.0, "timed out after %d minutes" % (TASK_TIMEOUT // 60)
    except OSError as exc:
        return None, 0.0, "could not start claude: %s" % exc

    raw = (proc.stdout or "").strip()
    try:
        res = json.loads(raw)
    except ValueError:
        err = (proc.stderr or raw or "no output").strip()
        return None, 0.0, err[:400]

    text = res.get("result") or res.get("text") or ""
    cost = res.get("total_cost_usd") or res.get("cost_usd") or 0.0
    if res.get("is_error") or not text.strip():
        return None, cost, (res.get("error") or text or "empty result")[:400]
    return text.strip(), cost, None


def write_report(defn, period, today, body_text):
    """The model's frontmatter, with what this script already knows for
    certain overwritten onto it — the same belt-and-braces write_plan() in
    plan.py uses, and for the same reason: the fields the board reads have
    to be right regardless of what the agent remembered to write."""
    m = FRONT_RE.match(body_text)
    topic, summary, body = "", "", body_text
    if m:
        for line in m.group(1).splitlines():
            fm = FIELD_RE.match(line)
            if fm and fm.group(1) == "topic":
                topic = fm.group(2).strip()
            elif fm and fm.group(1) == "summary":
                summary = fm.group(2).strip()
        body = body_text[m.end():].lstrip("\n")
    front = [
        "---",
        "title: %s" % defn["title"],
        "date: %s" % today.isoformat(),
        "covers: %s to %s" % (period["window_start"], period["window_end"]),
        "topic: %s" % (topic or defn["title"]),
        "summary: %s" % (summary or "The agent wrote no summary line."),
        "---", "",
    ]
    out_dir = os.path.join(paths.data_dir(), "reports")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "%s-%s.md" % (today.isoformat(), slugify(defn["name"])))
    with open(out, "w", encoding="utf-8", newline="") as fh:
        fh.write("\n".join(front) + body.rstrip("\n") + "\n")
    return out


def run(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--def", dest="only", default=None, help="render one, by name")
    ap.add_argument("--budget", type=float, default=REPORT_BUDGET)
    args = ap.parse_args(argv)

    today = dt.date.today()
    defs = load_defs()
    if args.only:
        defs = [d for d in defs if d["name"] == args.only]

    state = load_state()
    todo_list = defs if args.only else [d for d in defs if due(d, state, today)]

    if args.dry_run:
        print("%d definition(s) due\n" % len(todo_list))
        for d in todo_list:
            print("  %-30s every %dd, buckets: %s"
                  % (d["name"], d["window_days"], ", ".join(d["buckets"] or ["all"])))
        return 0

    if not todo_list:
        log("nothing due")
        print("Nothing due.")
        return 0

    spent, written = 0.0, 0
    for defn in todo_list:
        if spent >= args.budget:
            log("stopped: budget of $%.2f reached, %d left"
                % (args.budget, len(todo_list) - written))
            break
        start = today - dt.timedelta(days=defn["window_days"])
        period = aggregate.period_view(_load_tasks(), _archive_path(), start, today,
                                       buckets=defn["buckets"])
        text, cost, err = run_report_agent(defn, period, today)
        spent += cost or 0.0
        if err:
            log("  failed %-30s %s" % (defn["name"], err.splitlines()[0][:120]))
            continue
        out = write_report(defn, period, today, text)
        state[defn["name"]] = {"title": defn["title"], "last_rendered": today.isoformat()}
        save_state(state)
        written += 1
        log("  wrote %-30s -> %s  $%.2f" % (defn["name"], os.path.basename(out), cost or 0.0))

    log("done: %d written, $%.2f spent" % (written, spent))
    print("%d report(s) written, $%.2f spent" % (written, spent))
    return 0


def _load_tasks():
    import todo
    with open(paths.todo_path(), encoding="utf-8") as fh:
        return todo.parse_doc(fh.read())


def _archive_path():
    return os.path.join(paths.data_dir(), "backups", "done-archive.md")


if __name__ == "__main__":
    raise SystemExit(run())
