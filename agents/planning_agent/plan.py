#!/usr/bin/env python3
"""Runs one planning agent per task and files what comes back.

The middle of the planning agent. `agents/planning_agent/schedule.py` says whether it
may start, `core/windows.py` says how much of the current usage window is left,
`pick.py` says on what, and this runs the agents and writes the results.

One `claude -p` per task, sequential. Sequential rather than parallel for two
reasons: a runaway agent then costs one timeout rather than the night, and three
agents crossing a usage limit together makes the window arithmetic guesswork.

Everything here is arranged around one fact: this runs unattended at two in the
morning with nobody watching. So it is suspicious of its own agents. They are
given read-only tools and told not to write todo.md, and then the file is hashed
before the batch and checked after every single task anyway. Belt and braces is
warranted when the failure is silent and the file is irreplaceable.

    python3 agents/planning_agent/plan.py --dry-run       what it would do, no spend
    python3 agents/planning_agent/plan.py                 the batch
    python3 agents/planning_agent/plan.py --task "..."    one task, by hand
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
# `planning-<stream>`, beside this file, and the bucket brief is
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
FALLBACK_AGENT = "planning-general"

# The line every bucket brief ships with, and the one line that has to come out
# before the brief counts as written. See BUCKETS.md.
BRIEF_EMPTY = "<!-- NOT FILLED IN YET -->"

TASK_TIMEOUT = 10 * 60        # one agent's ceiling, seconds
BUDGET_PER_TASK = 2.00        # dollars, handed to --max-budget-usd
PLANNING_AGENT_BUDGET = 12.00        # dollars across the whole batch

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
    return "planning-%s" % bucket_stream(bucket)


def bucket_brief(bucket):
    """The path to this bucket's own brief, or None where it is still empty.

    One folder per stream under `data/<dataset>/buckets/`, holding the processes
    Tiago actually runs in that bucket, what each produces and which skill
    already does it, plus that bucket's own skills. Both the planners and the
    implementing agent read it, and he reaches for it himself.

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


def plan_path(prior):
    """Where the plan a ledger row points at actually is, or None.

    Two places, for the same reason stream.py looks in two: a plan pruned into
    `plans/actioned/` keeps the night it was written in its own frontmatter, so
    it stays addressable by that night after the folder has gone.
    """
    night, name = (prior or {}).get("night"), (prior or {}).get("file")
    if not night or not name:
        return None
    path = os.path.join(paths.plans_dir(), night, name)
    if os.path.isfile(path):
        return path
    alt = os.path.join(paths.plans_dir(), "actioned", "%s-%s" % (night, name))
    return alt if os.path.isfile(alt) else None


SECTION_RE = re.compile(r"^(#{1,4})\s+(.*?)\s*$")


def read_sections(path, names):
    """Named `##` sections of a plan file, as {lowercased name: text}.

    The same rule the board renders by: a section runs to the next heading at
    its own level or above. Kept here rather than imported from anywhere,
    because this reads a file the board wrote and the board reads a file this
    wrote, and neither should have to load the other to do it.
    """
    want = {n.strip().lower() for n in names}
    found, current, buf, level = {}, None, [], 0
    try:
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    except OSError:
        return {}
    for line in lines:
        m = SECTION_RE.match(line)
        if m:
            if current and len(m.group(1)) <= level:
                found[current] = "\n".join(buf).strip()
                current, buf = None, []
            if not current and m.group(2).strip().lower() in want:
                current, buf, level = m.group(2).strip().lower(), [], len(m.group(1))
                continue
        if current:
            buf.append(line)
    if current:
        found[current] = "\n".join(buf).strip()
    return found


def drop_section(body, name):
    """`body` without its `## <name>` section, by the rule read_sections uses.

    The runner owns History and writes it itself, so an agent that invented one
    has it taken away rather than having two in the file.
    """
    want = name.strip().lower()
    out, skip_at = [], 0
    for line in body.splitlines():
        m = SECTION_RE.match(line)
        if m:
            level = len(m.group(1))
            if skip_at and level <= skip_at:
                skip_at = 0
            if not skip_at and m.group(2).strip().lower() == want:
                skip_at = level
                continue
        if not skip_at:
            out.append(line)
    return "\n".join(out).strip()


def history(prior, day, agent):
    """The plan's History section: one line per revision, appended never rewritten.

    Hidden on the board — see PLAN_UNSHOWN in kanban/js/13-plans.js — because it
    is the file's own record rather than something to read over coffee. It is
    here so that one plan file holds everything about one plan, including the
    version of it he turned down and why.
    """
    path = plan_path(prior)
    was = read_sections(path, ("History",)).get("history", "") if path else ""
    front = read_front(path) if path else {}
    try:
        rev = int(front.get("revision", "1")) + 1
    except ValueError:
        rev = 2
    if not path:
        rev = 1
    line = "- **%s, revision %d.** " % (day.isoformat(), rev)
    said = rejection(prior)
    if said and rev > 1:
        line += "Re-planned by `%s` after revision %d was sent back: %s" % (
            agent, rev - 1, said[1].rstrip("."))
        if not line.endswith("."):
            line += "."
    else:
        line += "Planned by `%s`." % agent
    lines = [l for l in was.splitlines() if l.strip().startswith("-")] + [line]
    return rev, "\n".join(lines)


def rejection(prior):
    """Why the last plan for this task was sent back, and what it had worked out.

    The board writes the reason into the plan's own frontmatter when he rejects
    it, and the ledger row records which file that was. So the link exists and
    this only follows it: no second store, and the reason stays where a person
    reading the plan can see it.

    What comes back with it is the point. A summary and a rejection is not
    enough to write a better plan than last night's — it says what not to
    propose and nothing about what was already established, so the second night
    spends its whole budget reading the same files to reach the same place. The
    prior plan's Context and Proposed plan sections come too, which is the
    second thing those sections are for.

    Returns (summary, note, context, proposal) or None.

    A rejection is `state: ready` owned by the planning agent, one half of the six
    states every queue here shares. `status: redo` is the word this stream used
    until 11 Sep 2026 and is still read, because a ledger or a plan restored
    from a backup written before then carries it.
    """
    if not prior:
        return None
    sent_back = (prior.get("state") == "ready"
                 and prior.get("owner") == "planning-agent") or prior.get("status") == "redo"
    if not sent_back:
        return None
    path = plan_path(prior)
    if not path:
        return None
    front = read_front(path)
    note = front.get("feedback") or front.get("redo_note")
    if not note:
        return None
    was = read_sections(path, ("Context", "Proposed plan"))
    return (front.get("summary", ""), note,
            was.get("context", ""), was.get("proposed plan", ""))


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
        "Plan this one task from the to-do list. Read agents/planning_agent/PLAN-BRIEF.md first "
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
        summary, note, was_context, was_plan = said
        parts.append(
            "\nYou have planned this task before and he sent that plan back.\n\n"
            "What it proposed, in a line: %s\n"
            "Why he rejected it: %s\n\n"
            "Do not propose that again. Where his reason settles something the "
            "last plan was guessing at, use it. Where it means the task cannot be "
            "planned without another decision from him, fold and say which one.\n"
            % (summary or "(no summary was written)", note))
        if was_context:
            parts.append(
                "\nWhat that night had already established. Start from it rather "
                "than reading it all again, and correct it where his reason says "
                "it was wrong.\n\n```markdown\n%s\n```\n" % was_context)
        if was_plan:
            parts.append(
                "\nThe steps he rejected, in full:\n\n```markdown\n%s\n```\n"
                % was_plan)

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
    anyway, so a miss here costs nothing. Nothing gates on it: it is read to
    decide whether there is room for another task, and by the board's chart.

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


def write_plan(task, text, session, day, prior=None):
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

    # History is the runner's to write, not the agent's: it spans revisions and
    # an agent only ever sees one. Anything it wrote under that heading goes.
    rev, told = history(prior, day, bucket_agent(task.bucket))
    body = drop_section(body, "History")
    body = (body.rstrip("\n") + "\n\n## History\n\n" + told).strip()

    front = [
        "---",
        "title: %s" % task.title,
        "task: %s" % task.title,
        # Which task this is about, by the id on its own line, so a retitle
        # tomorrow does not orphan the plan. `task:` above stays as the label
        # the board falls back to when the task has gone from the list.
        "about: task:%s" % getattr(task, "stable_id", ""),
        "group: %s" % task.bucket,
        # Advisory snapshots of where the task stood when this was written.
        # Routinely stale by the time he reads it, and never read as truth.
        "column: %s" % task.column,
        "ai: %s" % (task.ai or ""),
        "agent: %s" % bucket_agent(task.bucket),
        "date: %s" % day.isoformat(),
        # The moment this file was actually written, to the second — `date:`
        # only carries the night's own day, and the file's own mtime moves
        # every time mark_plan (kanban/server.py) flips its status, so neither
        # can answer "when was this generated" once a plan has been agreed or
        # sent back.
        "created: %s" % dt.datetime.now().isoformat(timespec="seconds"),
        "night: %s" % day.isoformat(),
        # A fresh plan is waiting on him and he has not seen it. The five words
        # this stream used until 11 Sep 2026 are gone; what they meant is state
        # plus owner plus seen. See PACKAGES/work_streams/CONTRACT.md.
        "state: review",
        "owner: me",
        "seen: no",
    ]
    if task.slug:
        front.append("slug: %s" % task.slug)
    if session:
        front.append("session: %s" % session)
    # Kept as the agent wrote it. `folded` is the only value that means
    # anything to the runner; anything else is passed through and ignored,
    # rather than dropped, so a plan is never quieter than its own agent was.
    # An agent that folded could not plan the task without a decision only he
    # can make. That is the same fact the improvements backlog calls "needs
    # you", so it is one canonical field rather than two words for one thing.
    # Which attempt at this task this is. One file per revision still, since a
    # plan belongs to the night that wrote it, and the History section inside
    # each carries the ones before it.
    front.append("revision: %d" % rev)
    front.append("needs_you: %s" % ("yes" if outcome == FOLDED else "no"))
    if outcome and outcome != FOLDED:
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


def run_record_path(day):
    return os.path.join(paths.night_dir(day), "run.json")


def read_run_record(day):
    try:
        with open(run_record_path(day), encoding="utf-8") as fh:
            record = json.load(fh)
    except (OSError, ValueError):
        return None
    return record if isinstance(record, dict) else None


def carry_over(day, written, skipped, stopped, spent, started):
    """Fold an earlier run of the same day into this one's record and index.

    A night that plans everything leaves nothing for the next scheduled hour, so
    for most of this agent's life the day's folder held exactly one run and
    writing over it cost nothing. It stops being true the moment two runs in one
    day both find something — a task edited at nine and another at eleven — and
    then the second run's index.md and run.json describe only the second, while
    the first run's plan files sit in the folder unlisted. The morning reads the
    index; a plan missing from it is a plan that was not written.

    So the day accumulates. Entries this run produced win over the same task or
    the same file carried from earlier, anything planned today is dropped from
    the not-planned list however the earlier run described it, and the cost and
    start time cover the day rather than the last hour of it.
    """
    prior = read_run_record(day)
    if not prior:
        return written, skipped, stopped, spent, started
    entries = prior.get("entries") or []

    files = {w[0] for w in written}
    titles = {w[1] for w in written}
    carried = [(e.get("file"), e.get("title"), e.get("summary"), e.get("outcome") == "folded")
               for e in entries
               if e.get("outcome") in ("planned", "folded")
               and e.get("file") not in files and e.get("title") not in titles]
    written = carried + list(written)

    planned = {w[1] for w in written}
    seen, merged = set(), []
    for title, why in ([(e.get("title"), e.get("summary")) for e in entries
                        if e.get("outcome") == "skipped"] + list(skipped)):
        if title in planned or title in seen:
            continue
        seen.add(title)
        merged.append((title, why))

    was = prior.get("started")
    if was:
        try:
            started = dt.datetime.fromisoformat(was)
        except ValueError:
            pass
    return written, merged, stopped or prior.get("stopped"), spent + (prior.get("cost") or 0.0), started


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
    path = run_record_path(day)
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
# A plan worth keeping when its night is pruned: one that was carried out, and
# one an agent still has to act on. Owner rather than a status word, so a third
# agent needs no fourth word here. The old form is still matched, because a
# backup restored from before 11 Sep 2026 carries it.
KEEP_STATUS = re.compile(
    r"^(?:state:\s*done\s*$|owner:\s*implementing-agent\s*$|status:\s*(?:actioned|agreed)\s*$)", re.M)


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


def count_backlog_runs():
    """How many runs are minted and still untouched in Execution's Backlog.

    A run reaches `state: backlog` the moment `stream.py --sync` mints it off
    an accepted plan, and sits there until he drags it to To do through
    `do`. That queue can grow quietly for weeks — on 12 Sep 2026 six plans
    stood accepted, all six had runs minted, and two were still sitting in
    Backlog untouched — and nothing said so until the Execution tab was
    opened. Reads frontmatter only, the same shallow way `plan_meta()` in
    `kanban/server.py` does; a run with no `state:` line or an unreadable file
    just doesn't count, rather than raising into an unattended run.
    """
    runs_dir = os.path.join(paths.data_dir(), "runs")
    if not os.path.isdir(runs_dir):
        return 0
    n = 0
    for name in os.listdir(runs_dir):
        if not name.endswith(".md"):
            continue
        try:
            with open(os.path.join(runs_dir, name), encoding="utf-8") as fh:
                head = fh.read(600)
        except OSError:
            continue
        if re.search(r"^state:\s*backlog\s*$", head, re.M):
            n += 1
    return n


def announce(written, skipped, stopped):
    """One line on the queue the companion drains, so the night is not silent.

    The run finishes at two in the morning and the plans then sit in a folder
    nobody has a reason to open. This is the only thing that tells him they are
    there without him going looking, and the companion holds it until the
    morning rather than posting at 02:00.

    One notification for the whole night, never one per plan: three banners is
    information and eleven is noise, and the companion caps it at three anyway.

    Silence needs both halves to have nothing to say: no plan written tonight,
    and no accepted plan sitting in Execution's Backlog from a previous night.
    The second half fires even on a night that wrote nothing, which is the one
    this entry was raised for — a report that agreed plans are waiting is not
    itself a run, so it can say so on a quiet night same as a busy one.
    """
    backlog = count_backlog_runs()
    if not written and not backlog:
        return
    sys.path.insert(0, os.path.join(paths.ROOT, "companion"))
    try:
        import notify  # noqa: E402
    except ImportError:
        return
    plans = [w for w in written if not w[3]]
    folded = [w for w in written if w[3]]
    parts = []
    if plans:
        parts.append("%d plan%s waiting" % (len(plans), "" if len(plans) == 1 else "s"))
    # Named in the banner rather than left to be discovered, because a fold is
    # a question addressed to him and a question nobody sees is not asked.
    if folded:
        parts.append("%d waiting on you" % len(folded))
    if skipped:
        parts.append("%d unchanged" % len(skipped))
    if backlog:
        parts.append("%d accepted plan%s still waiting to run" % (
            backlog, "" if backlog == 1 else "s"))
    body = ", ".join(parts) if parts else "nothing new"
    if stopped:
        body += ". Stopped early"
    first_batch = folded or plans
    if first_batch:
        first = first_batch[0][1]
        body += ".\n" + (first if len(first) < 60 else first[:59].rstrip() + "…")
    else:
        body += "."
    # Pressing it lands on the Plans tab when there is a plan to show for the
    # night, and Execution when the only news is the backlog of runs — either
    # is where the thing it is announcing actually lives.
    view = "plans" if written else "execution"
    notify.queue("Planning agent", body, view=view)


def run(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--all", action="store_true", help="ignore the ledger")
    ap.add_argument("--task", default=None, help="plan exactly one, by title")
    ap.add_argument("--budget", type=float, default=PLANNING_AGENT_BUDGET)
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
            print("Either add an alias to AGENTS in agents/planning_agent/plan.py, or write the agent.")
        for title, why in skipped:
            print("  skip  %-58s %s" % (title[:58], why))
        return 0

    if not plan:
        log("nothing to plan (%d unchanged)" % len(skipped))
        # Nothing to plan is not the same as nothing to say: a batch of
        # accepted plans can still be sitting untouched in Execution's
        # Backlog from a previous night, and this is the only path through
        # run() that reaches a quiet night — the one announce() was missing.
        announce([], [], None)
        return 0

    guard = file_hash(todo_file)
    expiry = windows.current(state=windows.read_state(paths.window_path()))["expires"]
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
                "alias to AGENTS in agents/planning_agent/plan.py." % (task.bucket, task.title[:50]))
        # Logged before the run, not only after. An agent takes minutes, so
        # without this the log — and the board's Schedule view, which reads it —
        # says nothing at all about the one currently in flight, which is the
        # only one anybody watching actually wants named.
        log("  > %s (%s)" % (task.title[:60], agent))
        began = dt.datetime.now()
        # The ledger is keyed by task id since 11 Sep 2026, so that a retitle
        # keeps its row. Rows written before that are keyed by title, which is
        # the fallback pick.is_stale reads by too.
        prior = ledger.get(pick.key_of(task)) or ledger.get(task.title)
        body, session, cost, err = run_agent(task, prior=prior)
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

        out, summary, folded = write_plan(task, body, session, day, prior=prior)
        queue_attach(task, session)
        written.append((os.path.basename(out), task.title, summary, folded))
        if folded:
            log("  folded  %-50s needs a decision from him first" % task.title[:50])
        # Keyed by id, and in the six states every queue here shares, which is
        # what the rest of this stream already reads. It was still writing a
        # title key and `status: unread` after the 11 Sep migration, so a
        # rejection could not be found again by the night that had to answer it.
        ledger.pop(task.title, None)
        ledger[pick.key_of(task)] = {
            "title": task.title,
            "fingerprint": pick.fingerprint(task),
            "planned": day.isoformat(),
            "file": os.path.basename(out),
            "night": day.isoformat(),
            "state": "review",
            "owner": "me",
            "seen": False,
            "resolution": "",
        }
        pick.save_ledger(ledger)
        log("  planned %-50s %3ds  $%.2f" % (task.title[:50], took, cost or 0.0))

    # The day's whole account for the two files anything else reads; the log
    # line and the notification below stay this run's own, because what just
    # happened is what they are for.
    day_written, day_skipped, day_stopped, day_spent, day_started = carry_over(
        day, written, skipped, stopped, spent, started)
    write_index(day, day_written, day_skipped, day_stopped)
    write_run_record(day, day_written, day_skipped, day_stopped, day_spent, day_started)
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
