#!/usr/bin/env python3
"""Runs one planning agent per task and files what comes back.

The middle of the night agent. `core/windows.py` says whether it may spend,
`pick.py` says on what, and this runs the agents and writes the results.

One `claude -p` per task, sequential. Sequential rather than parallel for two
reasons: a runaway agent then costs one timeout rather than the night, and three
agents crossing a usage limit together makes the window arithmetic guesswork.

Everything here is arranged around one fact: this runs unattended at two in the
morning with nobody watching. So it is suspicious of its own agents. They are
given read-only tools and told not to write todo.md, and then the file is hashed
before the batch and checked after every single task anyway. Belt and braces is
warranted when the failure is silent and the file is irreplaceable.

    python3 agents/night_agent/plan.py --dry-run       what it would do, no spend
    python3 agents/night_agent/plan.py                 the batch
    python3 agents/night_agent/plan.py --task "..."    one task, by hand
"""

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "core"))
sys.path.insert(0, HERE)

import paths  # noqa: E402
import pick  # noqa: E402
import windows  # noqa: E402

# Buckets are renameable on the board, and they get renamed: "Design System"
# and "Work oversight" became "DS" and "BAU" within a day of this being written,
# which sent both to the fallback agent without anything looking broken. So every
# bucket carries its aliases, and a task landing on the fallback is logged loudly
# rather than quietly planned by a generalist.
# Bucket heading -> the stream it belongs to. One table rather than two,
# because everything per-bucket is named off this: the planning agent is
# `plan-<stream>`, beside this file, and the bucket brief is
# `data/<dataset>/buckets/<stream>/<stream>.md`.
# A second table keyed the same way is a second thing to keep in step, and the
# headings move — People, BAU, DS, Strategic and Processes are what the file
# says today, and the four in CONVENTIONS.md are what it said in August.
STREAMS = {
    "people": "people",
    "design system": "design-system",
    "ds": "design-system",
    "work oversight": "work-oversight",
    "bau": "work-oversight",
    "strategic": "strategic",
    "strategy": "strategic",
    "processes": "processes",
    "process": "processes",
    # `personal`'s only heading. It would reach `general` through the fallback
    # anyway, but the fallback logs loudly and is meant to — it is how a renamed
    # bucket gets noticed. A heading that is deliberately general belongs in the
    # table, so the noise stays reserved for headings nobody has mapped yet.
    "tasks": "general",
}
FALLBACK_STREAM = "general"
FALLBACK_AGENT = "plan-general"

# The line every bucket brief ships with, and the one line that has to come out
# before the brief counts as written. See BUCKETS.md.
BRIEF_EMPTY = "<!-- NOT FILLED IN YET -->"

TASK_TIMEOUT = 10 * 60        # one agent's ceiling, seconds
BUDGET_PER_TASK = 2.00        # dollars, handed to --max-budget-usd
NIGHT_AGENT_BUDGET = 12.00        # dollars across the whole batch

# What the agent writes into its own frontmatter when it decides the task
# cannot be planned without a decision only Tiago can make. See the folding
# rule in PLAN-BRIEF.md — it is a real answer rather than a failure, so a
# folded plan is written, listed and counted like any other, just under its own
# heading.
FOLDED = "folded"
FLOOR = dt.timedelta(minutes=20)   # do not start another task below this
KEEP_DAYS = 30

# What a usage limit looks like coming back. Matched loosely on purpose: the
# wording is not ours and changes, so anything mentioning a limit and a reset is
# treated as one, and a stray match only costs an early night.
#
# Widened 5 Sep 2026, after a real one got through. The CLI said "You've hit your
# session limit · resets 12:20pm", which named neither "usage" nor "at", so the
# batch treated it as an ordinary agent failure and moved on to the next task —
# which would have failed the same way, twenty-four more times, in about a
# minute, with no reset time recorded and nothing in window.json to stop the next
# wake doing it again. Any word before "limit", and a reset with or without "at".
LIMIT_RE = re.compile(
    r"((usage|rate|session|weekly|daily)\s+limit|limit reached"
    r"|resets?\s+(?:at\s+)?\d{1,2}:\d{2})", re.I)
RESET_RE = re.compile(r"resets? (?:at )?([0-9]{1,2}:[0-9]{2}\s*(?:am|pm)?|[0-9T:\-\+]{10,})", re.I)


def bucket_stream(bucket):
    """Which stream a bucket heading belongs to. "3. DS" -> "design-system"."""
    key = re.sub(r"^\d+[.)]\s*", "", (bucket or "")).strip().lower()
    return STREAMS.get(key, FALLBACK_STREAM)


def bucket_agent(bucket):
    return "plan-%s" % bucket_stream(bucket)


def bucket_brief(bucket):
    """The path to this bucket's own brief, or None where it is still empty.

    One folder per stream under `data/<dataset>/buckets/`, holding the processes
    Tiago actually runs in that bucket, what each produces and which skill
    already does it, plus that bucket's own skills. Both the planners and the
    acting agent read it, and he reaches for it himself.

    Scoped to the dataset because a brief is only true of one list: `twinkl` and
    `personal` have different buckets, different processes and different people,
    so a brief filed by stream name alone would hand one list the other's. See
    `paths.buckets_dir()`, which is where that path is worked out.

    Gitignored with the rest of `data/`: it names real people and real Twinkl
    processes, and this repo is public. `BUCKETS.md` at the root is the tracked
    half, holding the rules and the template but none of the content.

    A brief that exists but has never been filled in is treated as absent. The
    templates ship with a marker line and nothing else useful, and naming an
    empty file in the prompt would spend an agent's attention on a page of
    headings.
    """
    stream = bucket_stream(bucket)
    path = os.path.join(paths.buckets_dir(), stream, "%s.md" % stream)
    try:
        with open(path, encoding="utf-8") as fh:
            body = fh.read()
    except OSError:
        return None
    return None if BRIEF_EMPTY in body else path


def file_hash(path):
    try:
        with open(path, "rb") as fh:
            return hashlib.sha256(fh.read()).hexdigest()
    except OSError:
        return None


def slugify(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return (s or "task")[:60]


def log(line):
    path = paths.log_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    stamp = dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(path, "a", encoding="utf-8", newline="") as fh:
        fh.write("%s  %s\n" % (stamp, line))


def read_front(path):
    """A plan file's frontmatter as a dict. {} for anything unreadable."""
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


def rejection(prior):
    """Why the last plan for this task was sent back, if it was.

    The board writes `redo_note:` into the plan's own frontmatter when he
    rejects it, and the ledger row already records which file that was. So the
    link exists and this only follows it: no second store, and the reason stays
    where a person reading the plan can see it.

    Returns (summary, note) or None. The summary comes along because "do not
    propose this again" means nothing without what was proposed.
    """
    if not prior or prior.get("status") != "redo":
        return None
    night, name = prior.get("night"), prior.get("file")
    if not night or not name:
        return None
    front = read_front(os.path.join(paths.plans_dir(), night, name))
    note = front.get("redo_note")
    if not note:
        return None
    return front.get("summary", ""), note


def build_prompt(task, prior=None):
    """What the agent is actually asked.

    The task's own text is pasted in verbatim rather than summarised, because
    the notes under a task are where the reasoning lives and a paraphrase of
    them is exactly the context that gets lost.

    Two things are added where they exist: the bucket's own brief, and the
    reason the last plan for this task was rejected. The second is the point of
    the redo loop. Without it a rejected plan comes back the next night saying
    the same thing, having spent the same money to reach it.
    """
    block = "\n".join([task.raw] + list(task.body))
    parts = [
        "Plan this one task from the to-do list. Read agents/night_agent/PLAN-BRIEF.md first "
        "for the format and the rules, then your own agent definition applies on "
        "top of it.\n\n"
        "The task, exactly as it stands in %s:\n\n"
        "```markdown\n%s\n```\n\n"
        "Bucket: %s. State: %s. Delegation tag: ai:%s.\n"
        % (os.path.relpath(paths.todo_path(), paths.ROOT),
           block, task.bucket, task.column, task.ai or "?")
    ]

    brief = bucket_brief(task.bucket)
    if brief:
        parts.append(
            "\nRead `%s` as well. It holds the processes he actually runs in this "
            "bucket, what each one produces and which of his skills already does "
            "it. A plan proposing work that a skill named in there already does "
            "is the failure it exists to prevent.\n"
            % os.path.relpath(brief, paths.ROOT))

    said = rejection(prior)
    if said:
        summary, note = said
        parts.append(
            "\nYou have planned this task before and he sent that plan back.\n\n"
            "What it proposed: %s\n"
            "Why he rejected it: %s\n\n"
            "Do not propose that again. Where his reason settles something the "
            "last plan was guessing at, use it. Where it means the task cannot be "
            "planned without another decision from him, fold and say which one.\n"
            % (summary or "(no summary was written)", note))

    parts.append(
        "\nResearch it and write the plan. Output the plan itself and nothing else, "
        "no preamble and no commentary about what you are about to do. Start with "
        "the frontmatter block. Do not create any files; your reply is the plan, "
        "and the runner writes it to disk.\n")
    return "".join(parts)


# What the agents are allowed to look at outside this repo. Every one of them is
# told to read something up here — `~/Code/CLAUDE.md` is the map of the whole
# folder, `SKILLS.md` is the index of every skill, `DS-KNOWN-ISSUES.md` is what
# the design system already knows is broken — and without this they cannot,
# because `claude -p` can only reach its own working directory.
#
# The first real run said so itself, on 5 Sep 2026: "this session was sandboxed
# to the to-dos repo only and couldn't open ~/Code/DS-KNOWN-ISSUES.md,
# ds-inventory/, ds-snapshots/ or ds-docs/". The plan it wrote was still useful
# and it was honest about the gap, which is the only reason this was caught
# rather than quietly producing thinner plans every night.
#
# The parent folder rather than a list of children: `~/Code/CLAUDE.md` describes
# a dozen folders and which one answers what, and an agent that can read the map
# and not the territory is worse off than one with neither. Reading is all it
# can do with them — see the tool list below.
EXTRA_DIRS = ["~/Code"]


def run_agent(task, dry=False, prior=None):
    """One headless run. Returns (text, session_id, cost, error)."""
    agent = bucket_agent(task.bucket)
    cmd = [
        "claude", "-p", build_prompt(task, prior),
        "--agent", agent,
        "--output-format", "json",
        "--max-budget-usd", str(BUDGET_PER_TASK),
        # Named here as well as in each agent definition. A definition is a
        # request; this is the thing that actually holds, and it runs unattended.
        "--allowedTools", "Read", "Grep", "Glob", "WebFetch", "WebSearch",
    ]
    for d in EXTRA_DIRS:
        cmd += ["--add-dir", os.path.expanduser(d)]
    if dry:
        return None, None, 0.0, None
    try:
        proc = subprocess.run(cmd, cwd=paths.ROOT, capture_output=True,
                              text=True, timeout=TASK_TIMEOUT)
    except subprocess.TimeoutExpired:
        return None, None, 0.0, "timed out after %d minutes" % (TASK_TIMEOUT // 60)
    except OSError as exc:
        return None, None, 0.0, "could not start claude: %s" % exc

    raw = (proc.stdout or "").strip()
    try:
        res = json.loads(raw)
    except ValueError:
        err = (proc.stderr or raw or "no output").strip()
        return None, None, 0.0, err[:400]

    # The result object's field names have moved before, so read defensively and
    # take the first that is present rather than trusting one spelling.
    text = res.get("result") or res.get("text") or ""
    session = res.get("session_id") or res.get("sessionId")
    cost = res.get("total_cost_usd") or res.get("cost_usd") or 0.0
    if res.get("is_error") or not text.strip():
        return None, session, cost, (res.get("error") or text or "empty result")[:400]
    return text, session, cost, None


def is_limit(err):
    return bool(err and LIMIT_RE.search(err))


def record_limit(err):
    """Take the exact reset time out of a limit message and keep it.

    This is the only authoritative signal about where a window boundary is, so
    it is worth the parsing. When the message cannot be read, the expiry is left
    unset and core/windows.py falls back to the estimate — which is the normal case
    anyway, so a miss here costs nothing.

    It also records what the window had spent at the moment it was refused,
    which is the one measurement of the session allowance this machine can
    make. No limit figure appears anywhere on disk and the message names the
    reset time but never the ceiling, so the alternative is a constant written
    into the repo that goes stale the next time the plan changes. The board's
    usage chart reads `limit_tok` as its 100%% when it is here, and falls back
    to the busiest window seen when it is not.

    It is a floor rather than the exact allowance — the refused request is not
    counted, and the limit may have been crossed part way through the last one
    — so it is only ever revised upward, never down.
    """
    state = windows.read_state(paths.window_path())
    state["limited_at"] = dt.datetime.now().astimezone().isoformat()
    state["message"] = (err or "")[:300]
    try:
        open_now = windows.reconstruct(windows.turns(
            since=dt.datetime.now().astimezone() - windows.WINDOW * 2))
        if open_now:
            spent = open_now[-1]["tok"]
            if spent > state.get("limit_tok", 0):
                state["limit_tok"] = spent
                state["limit_tok_at"] = dt.date.today().isoformat()
    except (OSError, ValueError):
        pass
    m = RESET_RE.search(err or "")
    if m:
        state["expires_raw"] = m.group(1)
        parsed = _parse_reset(m.group(1))
        if parsed:
            state["expires"] = parsed.isoformat()
    windows.write_state(paths.window_path(), state)
    return state.get("expires")


def _parse_reset(text):
    """"3:45pm", "03:45" or an ISO timestamp, as the next moment that reads."""
    text = text.strip()
    try:
        when = dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
        return when.astimezone()
    except ValueError:
        pass
    m = re.match(r"^(\d{1,2}):(\d{2})\s*(am|pm)?$", text, re.I)
    if not m:
        return None
    hour, minute = int(m.group(1)), int(m.group(2))
    ampm = (m.group(3) or "").lower()
    if ampm == "pm" and hour < 12:
        hour += 12
    if ampm == "am" and hour == 12:
        hour = 0
    now = dt.datetime.now().astimezone()
    when = now.replace(hour=hour % 24, minute=minute, second=0, microsecond=0)
    return when if when > now else when + dt.timedelta(days=1)


FRONT_RE = re.compile(r"^---\n(.*?)\n---\n", re.S)


def write_plan(task, text, session, day):
    """One plan file, with the frontmatter completed rather than trusted.

    The agent is asked for frontmatter and usually gives it, but the fields the
    board and the ledger read have to be right, and an agent getting its own
    bucket wrong would file the plan under the wrong task. So whatever it wrote
    is kept for `summary`, and everything derivable is overwritten from what we
    already know.
    """
    body = text.strip()
    summary, outcome = "", ""
    m = FRONT_RE.match(body + "\n")
    if m:
        for line in m.group(1).splitlines():
            if line.lower().startswith("summary:"):
                summary = line.split(":", 1)[1].strip()
            elif line.lower().startswith("outcome:"):
                outcome = line.split(":", 1)[1].strip().lower()
        body = body[m.end():].lstrip("\n")
    # `[fill in]` is the brief's marker for a fact the agent could not
    # establish, so reusing it here made two different things read the same: a
    # plan with an unknown in it, and a plan whose agent forgot the summary
    # line. Two of ten did that on 5 Sep 2026 and listed as "[fill in]" with no
    # way to tell which had happened.
    if not summary:
        summary = "The agent wrote no summary line."

    front = [
        "---",
        "title: %s" % task.title,
        "task: %s" % task.title,
        "bucket: %s" % task.bucket,
        "column: %s" % task.column,
        "ai: %s" % (task.ai or ""),
        "agent: %s" % bucket_agent(task.bucket),
        "date: %s" % day.isoformat(),
        # The moment this file was actually written, to the second — `date:`
        # only carries the night's own day, and the file's own mtime moves
        # every time mark_plan (kanban/server.py) flips its status, so neither
        # can answer "when was this generated" once a plan has been agreed or
        # sent back.
        "generated: %s" % dt.datetime.now().isoformat(timespec="seconds"),
        "status: unread",
    ]
    if task.slug:
        front.append("slug: %s" % task.slug)
    if session:
        front.append("session: %s" % session)
    # Kept as the agent wrote it. `folded` is the only value that means
    # anything to the runner; anything else is passed through and ignored,
    # rather than dropped, so a plan is never quieter than its own agent was.
    if outcome:
        front.append("outcome: %s" % outcome)
    front.append("summary: %s" % summary)
    front.append("---")

    out = os.path.join(paths.night_dir(day), slugify(task.title) + ".md")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="") as fh:
        fh.write("\n".join(front) + "\n\n" + body.rstrip("\n") + "\n")
    return out, summary, outcome == FOLDED


def queue_attach(task, session):
    """File the planning conversation against its task, through the board's queue.

    Reuses pa-attach's own writer rather than appending to the queue here: the
    queue's shape is that script's to define, and two writers of one format is
    the failure this repo keeps arranging itself to avoid.
    """
    if not session:
        return
    script = os.path.join(paths.ROOT, "agents", "pa_agent", "skills", "pa-attach",
                           "scripts", "attach_session.py")
    if not os.path.exists(script):
        return
    try:
        subprocess.run([sys.executable, script, paths.attach_queue_path(),
                        "--title", task.title, "--cwd", paths.ROOT,
                        "--session", session],
                       capture_output=True, text=True, timeout=30)
    except (OSError, subprocess.TimeoutExpired) as exc:
        log("  attach failed for %r: %s" % (task.title, exc))


def write_index(day, written, skipped, stopped):
    lines = ["---",
             "title: Plans for %s" % day.strftime("%A %-d %B %Y"),
             "date: %s" % day.isoformat(),
             "count: %d" % len([w for w in written if not w[3]]),
             "folded: %d" % len([w for w in written if w[3]]),
             "---", "",
             "# Plans for %s" % day.strftime("%A %-d %B %Y"), ""]
    plans = [w for w in written if not w[3]]
    folded = [w for w in written if w[3]]
    # Folded first. They are the ones with something for him to do, and a
    # morning that reads top to bottom should reach the questions before the
    # proposals.
    if folded:
        lines += ["## Waiting on you", "",
                  "%d %s could not be planned without a decision only you can make."
                  % (len(folded), "task" if len(folded) == 1 else "tasks"), ""]
        for name, title, summary, _ in folded:
            lines.append("- **[%s](%s)** — %s" % (title, name, summary))
        lines.append("")
    if plans:
        if folded:
            lines += ["## Planned", ""]
        for name, title, summary, _ in plans:
            lines.append("- **[%s](%s)** — %s" % (title, name, summary))
    elif not folded:
        lines.append("Nothing planned.")
    if skipped:
        lines += ["", "## Not planned", ""]
        for title, why in skipped:
            lines.append("- %s — %s" % (title, why))
    if stopped:
        lines += ["", "## Stopped early", "", stopped]
    path = os.path.join(paths.night_dir(day), "index.md")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write("\n".join(lines) + "\n")


def write_run_record(day, written, skipped, stopped, spent, started):
    """The same night as JSON, for anything reading this agent rather than the plans.

    index.md is written for him, and it is the better thing to open. This is
    written for the agents dashboard, which asks every agent on the machine the
    same question — what did last night do — and cannot be expected to parse
    each one's prose to find out. Cheap, next to the plans it describes, and
    pruned with them.
    """
    rows = []
    for name, title, summary, folded in written:
        rows.append({"outcome": "folded" if folded else "planned",
                     "title": title, "summary": summary, "file": name})
    for title, why in skipped:
        rows.append({"outcome": "skipped", "title": title, "summary": why})
    record = {
        "started": started.isoformat(),
        "finished": dt.datetime.now().astimezone().isoformat(),
        "cost": round(spent, 4),
        "stopped": stopped,
        "entries": rows,
    }
    path = os.path.join(paths.night_dir(day), "run.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(record, fh, indent=2)
        fh.write("\n")
    os.replace(tmp, path)


# The statuses prune() will not throw away. `actioned` is the record of a
# decision rather than scratch state; `agreed` is a plan he has approved and
# that has not been carried out yet, and deleting one of those on its thirtieth
# day would silently drop work he had already said yes to.
KEEP_STATUS = re.compile(r"^status:\s*(actioned|agreed)\s*$", re.M)


def prune(day):
    """Delete plan folders older than KEEP_DAYS, keeping the ones that matter.

    Same policy as the backups, with one exception: a plan he actioned or agreed
    is worth keeping, so it moves to plans/actioned/ instead of going.
    Everything else is a proposal that expired.
    """
    root = paths.plans_dir()
    if not os.path.isdir(root):
        return
    cutoff = day - dt.timedelta(days=KEEP_DAYS)
    for name in sorted(os.listdir(root)):
        full = os.path.join(root, name)
        if not os.path.isdir(full) or name == "actioned":
            continue
        try:
            when = dt.date.fromisoformat(name)
        except ValueError:
            continue
        if when >= cutoff:
            continue
        for fn in os.listdir(full):
            src = os.path.join(full, fn)
            if fn == "index.md" or not fn.endswith(".md"):
                continue
            try:
                with open(src, encoding="utf-8") as fh:
                    head = fh.read(600)
            except OSError:
                continue
            if KEEP_STATUS.search(head):
                keep = paths.actioned_dir()
                os.makedirs(keep, exist_ok=True)
                shutil.move(src, os.path.join(keep, "%s-%s" % (name, fn)))
        shutil.rmtree(full, ignore_errors=True)
        log("pruned plans from %s" % name)


def announce(written, skipped, stopped):
    """One line on the queue the companion drains, so the night is not silent.

    The run finishes at two in the morning and the plans then sit in a folder
    nobody has a reason to open. This is the only thing that tells him they are
    there without him going looking, and the companion holds it until the
    morning rather than posting at 02:00.

    One notification for the whole night, never one per plan: three banners is
    information and eleven is noise, and the companion caps it at three anyway.
    Silence when nothing was written, since "nothing to plan" is the normal
    quiet night and does not need saying.
    """
    if not written:
        return
    sys.path.insert(0, os.path.join(paths.ROOT, "companion"))
    try:
        import notify  # noqa: E402
    except ImportError:
        return
    plans = [w for w in written if not w[3]]
    folded = [w for w in written if w[3]]
    body = "%d plan%s waiting" % (len(plans), "" if len(plans) == 1 else "s")
    # Named in the banner rather than left to be discovered, because a fold is
    # a question addressed to him and a question nobody sees is not asked.
    if folded:
        body += ", %d waiting on you" % len(folded)
    if skipped:
        body += ", %d unchanged" % len(skipped)
    if stopped:
        body += ". Stopped early"
    first = (folded or plans or written)[0][1]
    body += ".\n" + (first if len(first) < 60 else first[:59].rstrip() + "…")
    # Pressing it lands on the Plans tab, which is where the night's output
    # actually is. Not on a single plan: the banner counts a batch, and opening
    # one of several would answer a question it did not ask.
    notify.queue("Night agent", body, view="plans")


def run(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true", help="ignore the ledger")
    ap.add_argument("--task", default=None, help="plan exactly one, by title")
    ap.add_argument("--budget", type=float, default=NIGHT_AGENT_BUDGET)
    args = ap.parse_args(argv)

    day = dt.date.today()
    todo_file = paths.todo_path()
    with open(todo_file, encoding="utf-8") as fh:
        text = fh.read()

    ledger = pick.load_ledger()
    plan, skip = pick.select(text, day=day, use_ledger=not (args.all or args.task),
                             ledger=ledger, only=args.task)
    skipped = [(t.title, why) for t, why in skip]

    if args.dry_run:
        print("%d to plan, %d skipped\n" % (len(plan), len(skipped)))
        for t in plan:
            agent = bucket_agent(t.bucket)
            flag = "  <- no agent for this bucket" if agent == FALLBACK_AGENT else ""
            if not bucket_brief(t.bucket):
                flag += "  <- no bucket brief yet"
            print("  %-22s %-58s %s%s" % (t.bucket, t.title[:58], agent, flag))
        orphans = sorted({t.bucket for t in plan if bucket_agent(t.bucket) == FALLBACK_AGENT})
        if orphans:
            print("\n%d bucket(s) have no agent: %s" % (len(orphans), ", ".join(orphans)))
            print("Either add an alias to AGENTS in agents/night_agent/plan.py, or write the agent.")
        for title, why in skipped:
            print("  skip  %-58s %s" % (title[:58], why))
        return 0

    if not plan:
        log("nothing to plan (%d unchanged)" % len(skipped))
        return 0

    guard = file_hash(todo_file)
    expiry = windows.decide(state=windows.read_state(paths.window_path()))["expires"]
    spent, written, stopped = 0.0, [], None
    started = dt.datetime.now().astimezone()
    log("start: %d to plan, %d skipped" % (len(plan), len(skipped)))

    for task in plan:
        now = dt.datetime.now().astimezone()
        if expiry and expiry - now < FLOOR:
            stopped = "Stopped with %d left: under %d minutes of window remaining." % (
                len(plan) - len(written), FLOOR.seconds // 60)
            log(stopped)
            break
        if spent >= args.budget:
            stopped = "Stopped with %d left: nightly budget of $%.2f reached." % (
                len(plan) - len(written), args.budget)
            log(stopped)
            break

        agent = bucket_agent(task.bucket)
        if agent == FALLBACK_AGENT:
            log("  NO AGENT for bucket %r — planning %r with the fallback. Add an "
                "alias to AGENTS in agents/night_agent/plan.py." % (task.bucket, task.title[:50]))
        # Logged before the run, not only after. An agent takes minutes, so
        # without this the log — and the board's Schedule view, which reads it —
        # says nothing at all about the one currently in flight, which is the
        # only one anybody watching actually wants named.
        log("  > %s (%s)" % (task.title[:60], agent))
        began = dt.datetime.now()
        body, session, cost, err = run_agent(task, prior=ledger.get(task.title))
        spent += cost or 0.0
        took = (dt.datetime.now() - began).seconds

        if file_hash(todo_file) != guard:
            stopped = "STOPPED: todo.md changed during the run. Nothing else was attempted."
            log(stopped)
            log("  the agent for %r is the suspect; check it before running again" % task.title)
            break

        if err:
            if is_limit(err):
                reset = record_limit(err)
                stopped = "Stopped with %d left: usage limit%s." % (
                    len(plan) - len(written), (", resets %s" % reset) if reset else "")
                log(stopped)
                break
            log("  failed %-50s %s" % (task.title[:50], err.splitlines()[0][:120]))
            skipped.append((task.title, "the run failed"))
            continue

        out, summary, folded = write_plan(task, body, session, day)
        queue_attach(task, session)
        written.append((os.path.basename(out), task.title, summary, folded))
        if folded:
            log("  folded  %-50s needs a decision from him first" % task.title[:50])
        ledger[task.title] = {
            "fingerprint": pick.fingerprint(task),
            "planned": day.isoformat(),
            "status": "unread",
            "file": os.path.basename(out),
            "night": day.isoformat(),
        }
        pick.save_ledger(ledger)
        log("  planned %-50s %3ds  $%.2f" % (task.title[:50], took, cost or 0.0))

    write_index(day, written, skipped, stopped)
    write_run_record(day, written, skipped, stopped, spent, started)
    prune(day)
    folded = len([w for w in written if w[3]])
    log("done: %d written%s, $%.2f spent%s"
        % (len(written), (" (%d folded)" % folded) if folded else "", spent,
           " (cut short)" if stopped else ""))
    announce(written, skipped, stopped)
    print("%d plans written to %s" % (len(written), os.path.relpath(paths.night_dir(day), paths.ROOT)))
    if folded:
        print("%d of them folded, waiting on a decision from you." % folded)
    if stopped:
        print(stopped)
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
