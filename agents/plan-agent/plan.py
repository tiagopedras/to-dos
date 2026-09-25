#!/usr/bin/env python3
"""What the planning agent's hooks call: prompts, plan files, run records.

The loop that used to live here is the shared runner's since 21 Sep 2026
(PACKAGES/agents-engine/RUNNER.md); `hooks.py` is this agent's side of it and
calls into this file for everything about plans.

It runs unattended at two in the morning with nobody watching, so it is
suspicious of its own agents. They are given read-only tools and told not to
write todo.md, and then the file is hashed before the batch and checked after
every single task anyway. Belt and braces is warranted when the failure is
silent and the file is irreplaceable.

    ./agents/plan-agent/run.sh --dry-run       what it would do, no spend
    ./agents/plan-agent/run.sh --force         every list now
    ./agents/plan-agent/run.sh --task "..."    one task, by hand
"""

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
import project_folders  # noqa: E402
import tick_queue  # noqa: E402
import todo  # noqa: E402
import windows  # noqa: E402

# Which stream a bucket belongs to, and there is no table of it any more.
#
# There was one until 17 Sep 2026, `STREAMS`, mapping a heading to a name. All
# it ever did was bridge a shorthand — `ds` to `design-system`, `bau` to
# `work-oversight` — while its other three entries mapped a heading to itself.
# The cost was that a bucket invented on the board was invisible to this file
# until someone edited the table by hand, so every task in a new list planned
# against the fallback and logged loudly for it. That is how `personal` behaved
# from the day it was made.
#
# So the heading is the stream: strip the leading number, lowercase it, join the
# words with hyphens. `3. DS` is `ds`, `2. BAU` is `bau`, and a bucket created
# today needs nothing written down anywhere.
#
# One thing a slug alone cannot do is survive a rename, and a rename must not
# move a bucket's brief. So the slug is fixed when the bucket is created and
# written into the dataset's own `buckets/README.md` beside the heading;
# stream_map() below reads it there first. Slugifying the live heading is the
# fallback for a bucket that has never been through the editor, which is what
# lets a hand-written todo.md keep working unchanged.
FALLBACK_STREAM = "general"
FALLBACK_AGENT = "twinkl-general-agent"

# The line every bucket brief ships with, and the one line that has to come out
# before the brief counts as written. See BUCKETS.md.
BRIEF_EMPTY = "<!-- NOT FILLED IN YET -->"

TASK_TIMEOUT = 10 * 60        # one agent's ceiling, seconds
BUDGET_PER_TASK = 2.00        # dollars, handed to --max-budget-usd

# What the agent writes into its own frontmatter when it decides the task
# cannot be planned without a decision only Tiago can make. See the folding
# rule in PLAN-BRIEF.md — it is a real answer rather than a failure, so a
# folded plan is written, listed and counted like any other, just under its own
# heading.
FOLDED = "folded"
FLOOR = dt.timedelta(minutes=20)   # do not start another task below this
KEEP_DAYS = 30

RESET_RE = re.compile(r"resets? (?:at )?([0-9]{1,2}:[0-9]{2}\s*(?:am|pm)?|[0-9T:\-\+]{10,})", re.I)


def bucket_slug(bucket):
    """A heading as a stream name. "## 3. DS" -> "ds"."""
    key = re.sub(r"^#+\s*", "", (bucket or ""))
    key = re.sub(r"^\d+[.)]\s*", "", key).strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", key).strip("-")


# The row shape in a dataset's buckets/README.md: the heading, the stream, the
# brief. Only the first two are read — the third is worked out from the second
# by bucket_brief(), and two places saying where a brief lives is one too many.
README_ROW = re.compile(r"^\|\s*`?([^|`]+)`?\s*\|\s*`?([a-z0-9-]+)`?\s*\|")


def stream_map(path=None):
    """Heading -> stream, out of the dataset's own buckets/README.md.

    Empty when there is no such file, which is the honest answer rather than a
    failure: every heading then slugifies to itself, which is what a list
    written by hand has always effectively done.
    """
    path = path or os.path.join(paths.buckets_dir(), "README.md")
    out = {}
    try:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                m = README_ROW.match(line.strip())
                if not m:
                    continue
                heading, stream = m.group(1).strip(), m.group(2).strip()
                if heading in ("Heading in `todo.md`", "---", "\u2014"):
                    continue
                key = bucket_slug(heading)
                if key:
                    out[key] = stream
    except OSError:
        return {}
    return out


def bucket_stream(bucket):
    """Which stream a bucket heading belongs to. "3. DS" -> "ds".

    The README first, so a bucket renamed on the board keeps the brief it has
    always had, and the heading's own slug behind it.
    """
    key = bucket_slug(bucket)
    if not key:
        return FALLBACK_STREAM
    return stream_map().get(key, key)


def bucket_agent(bucket):
    """The planner's name: `<dataset>-<stream>-agent`, `twinkl-ds-agent`.

    Named after the list as well as the bucket, since each list has its own
    buckets. A stream that already starts with the list's name keeps one copy
    of it, so `personal-tasks` in `personal` is `personal-tasks-agent`.
    """
    stream, ds = bucket_stream(bucket), paths.dataset()
    if stream == ds or stream.startswith(ds + "-"):
        return "%s-agent" % stream
    return "%s-%s-agent" % (ds, stream)


def agent_on_disk(agent):
    """Whether a planner of that name exists to be invoked.

    Claude Code reads agent definitions out of `.claude/agents/`, and each file
    there is a symlink back to the real copy beside this one — so the real copy
    is what is checked, and a missing symlink shows up as the run failing rather
    than as this quietly saying no.
    """
    return os.path.isfile(os.path.join(HERE, "%s.md" % agent))


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

    One file per task, filed flat under plans_dir() — no per-night folder to
    look inside and no separate archive to fall back to, since a plan is
    never moved out of the way any more. See plan_filename() for how the name
    itself is built.
    """
    name = (prior or {}).get("file")
    if not name:
        return None
    path = os.path.join(paths.plans_dir(), name)
    return path if os.path.isfile(path) else None


def plan_filename(task):
    """The one file this task's plan lives in, for as long as the task does.

    The slug stays for readability — it is what makes `ls plans/` legible —
    but the id is what actually keeps two tasks that happen to share a title
    from landing on the same file. That collision was survivable while a
    plan was scoped to one night; it is not once the file is the task's plan
    for good. A task with no id yet (a list from before mint-ids.mjs ran)
    falls back to the slug alone, same as this always worked.
    """
    tid = getattr(task, "stable_id", "")
    base = slugify(task.title)
    return "%s-%s.md" % (base, tid) if tid else "%s.md" % base


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


def history(prior, day, agent, task=None):
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
    said = rejection(prior, task)
    if said and rev > 1:
        line += "Re-planned by `%s` after revision %d was sent back: %s" % (
            agent, rev - 1, said[1].rstrip("."))
        if not line.endswith("."):
            line += "."
    else:
        line += "Planned by `%s`." % agent
    lines = [l for l in was.splitlines() if l.strip().startswith("-")] + [line]
    return rev, "\n".join(lines)


def feedback_on(task):
    """What he said when he sent the plan back: the `feedback:` notes under the
    task's Plan sub-task, joined. Empty when the task has none, or is not one that
    was handed over, which has no Plan sub-task to hold them."""
    if task is None:
        return ""
    said = []
    for s in todo.split_body(task)[1]:
        if not (s["task"].slug or "").endswith("-plan"):
            continue
        for line in s["notes"]:
            m = re.match(r"^\s*-\s*feedback:\s*(.*)$", line, re.I)
            if m and m.group(1).strip():
                said.append(m.group(1).strip())
    return " ".join(said)


def rejection(prior, task=None):
    """Why the last plan for this task was sent back, and what it had worked out.

    Since 22 Sep 2026 the reason is a `feedback:` note under the task's Plan
    sub-task, written when he sends it back from the review (feedback_on()), and
    the ledger row records which file the last plan was. Before that the board
    wrote it into the plan's own frontmatter, which is still read for a plan
    written then.

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
    said_now = feedback_on(task)
    sent_back = bool(said_now) or (prior.get("state") == "ready"
                 and prior.get("owner") == "plan-agent") or prior.get("status") == "redo"
    if not sent_back:
        return None
    path = plan_path(prior)
    if not path:
        return None
    front = read_front(path)
    note = said_now or front.get("feedback") or front.get("redo_note")
    if not note:
        return None
    was = read_sections(path, ("Context", "Proposed plan"))
    return (front.get("summary", ""), note,
            was.get("context", ""), was.get("proposed plan", ""))


def task_briefing(task):
    """The cached briefing agents/plan-agent/brief.py wrote for this task, or "".

    Not re-validated against the task's current fingerprint here — a slightly
    stale orientation is still an orientation, and the verbatim block below it
    is what the agent is actually meant to plan from. See IMPROVEMENTS.md,
    "Every place that hands a task to an assistant re-derives its own
    understanding from the same chaotic notes field."
    """
    try:
        with open(paths.briefings_path(), encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        return ""
    row = (data.get("briefed") or {}).get(pick.key_of(task))
    return (row or {}).get("text", "")


def build_prompt(task, prior=None):
    """What the agent is actually asked.

    The task's own text is pasted in verbatim rather than summarised, because
    the notes under a task are where the reasoning lives and a paraphrase of
    them is exactly the context that gets lost.

    Three things are added where they exist: a cached briefing, for a fast
    orientation before the verbatim block rather than instead of it; the
    bucket's own brief; and the reason the last plan for this task was
    rejected. The third is the point of the redo loop. Without it a rejected
    plan comes back the next night saying the same thing, having spent the
    same money to reach it.
    """
    block = "\n".join([task.raw] + list(task.body))
    parts = [
        "Plan this one task from the to-do list. Read agents/plan-agent/PLAN-BRIEF.md first "
        "for the format and the rules, then your own agent definition applies on "
        "top of it.\n\n"
        "The task, exactly as it stands in %s:\n\n"
        "```markdown\n%s\n```\n\n"
        "Bucket: %s. State: %s. Delegated to: %s.\n"
        % (os.path.relpath(paths.todo_path(), paths.ROOT),
           block, task.bucket, task.column, task.to or "?")
    ]

    briefing = task_briefing(task)
    if briefing:
        parts.append(
            "\nA quick orientation generated earlier, before you read the notes "
            "yourself — useful for direction, not a substitute for reading them, "
            "and it may already be a little out of date:\n\n%s\n" % briefing)

    brief = bucket_brief(task.bucket)
    if brief:
        parts.append(
            "\nRead `%s` as well. It holds the processes he actually runs in this "
            "bucket, what each one produces and which of his skills already does "
            "it. A plan proposing work that a skill named in there already does "
            "is the failure it exists to prevent.\n"
            % os.path.relpath(brief, paths.ROOT))

    said = rejection(prior, task)
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


def project_dirs(task):
    """The task's own project folder, when it is one of his outside ~/Code.

    A `Project:` note can carry an absolute path to a folder he approved on the
    board (data/<dataset>/project-folders.json). The planner is sandboxed to the
    repo plus EXTRA_DIRS, so a folder elsewhere is added for this one run, and
    only once project_folders.resolve() has said it sits inside an approved
    folder. A bare name is under data/ already and needs nothing.
    """
    ref = project_folders.note_ref(getattr(task, "body", None))
    if not ref or not os.path.isabs(ref):
        return []
    real, err = project_folders.resolve(ref, paths.data_dir())
    if err:
        return []
    code = os.path.realpath(os.path.expanduser("~/Code"))
    return [] if project_folders.inside(code, real) else [real]


def planner_for(bucket):
    """The planner a bucket's tasks actually run against.

    The bucket's own where its file is on disk, `twinkl-general-agent` where it is
    not. Worked out here and only here: the main loop used to swap in the
    fallback itself while the run worked the name out again, so the log
    said `twinkl-general-agent` and `claude` was still asked for the missing one.
    """
    agent = bucket_agent(bucket)
    return agent if agent_on_disk(agent) else FALLBACK_AGENT


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


def harvest_usage():
    """One real reading of the account's usage allowance, logged as a line
    rather than kept as a figure to act on — see the "Every agent here is
    rationed..." entry in IMPROVEMENTS.md. `core/windows.py`'s own estimate,
    reconstructed from this machine's own transcripts, stays the actual gate
    on whether there is room for another task; this is advisory only, a
    second, independent source sampled once a batch so it can be watched as a
    trend across nights rather than trusted on the strength of one reading.

    Never raises and never gates. A harvester that failed to spawn, or a
    machine with no PACKAGES/usage_harvester checked out at all, costs one log
    line and nothing else — this is new and unproven, and a night should not
    fail to start because a pty session failed to open.
    """
    sys.path.insert(0, os.path.normpath(
        os.path.join(HERE, "..", "..", "..", "PACKAGES", "usage_harvester")))
    try:
        import harvest as usage_harvester  # noqa: E402
    except ImportError:
        log("usage harvest: PACKAGES/usage_harvester not found")
        return
    try:
        record = usage_harvester.harvest(timeout=60, model="haiku", cwd=ROOT)
    except OSError as exc:
        log("usage harvest failed: %s" % exc)
        return
    if not record:
        log("usage harvest: the statusline never fired")
        return
    got = usage_harvester.summarise(record)

    def fmt(key):
        pct = got.get(key)
        return "n/a" if pct is None else "%.1f%%" % pct
    log("usage harvest: 5h %s / 7d %s" % (fmt("five_hour"), fmt("seven_day")))


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
    rev, told = history(prior, day, bucket_agent(task.bucket), task)
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
        "to: %s" % (task.to or ""),
        "agent: %s" % bucket_agent(task.bucket),
        "date: %s" % day.isoformat(),
        # The moment this file was actually written, to the second — `date:`
        # only carries the night's own day, and the file's own mtime moves
        # every time mark_plan (kanban/server.py) flips its status, so neither
        # can answer "when was this generated" once a plan has been agreed or
        # sent back.
        "created: %s" % dt.datetime.now().isoformat(timespec="seconds"),
        "night: %s" % day.isoformat(),
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
    # Which attempt at this task this is. One file per task now, overwritten
    # in place on a replan, so `revision:` is what still says how many times —
    # the History section inside carries the ones before this one.
    front.append("revision: %d" % rev)
    front.append("needs_you: %s" % ("yes" if outcome == FOLDED else "no"))
    if outcome and outcome != FOLDED:
        front.append("outcome: %s" % outcome)
    front.append("summary: %s" % summary)
    front.append("---")

    out = os.path.join(paths.plans_dir(), plan_filename(task))
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


def queue_plan_tick(task, plan_file):
    """Says the plan is written, on the Plan sub-task it was written for.

    Through the board's queue like everything else the agent wants changed in
    the list: it never writes todo.md. Nothing to do for a task handed over the
    old way, which has no Plan sub-task to tick. The ledger row records the
    sub-task too, so tomorrow night does not plan it again while the board has
    yet to be opened and apply the tick.
    """
    if not getattr(task, "plan_sub", ""):
        return
    tick_queue.append(task.plan_sub, "Plan agent",
                      note="plan written to %s" % plan_file,
                      path=paths.tick_queue_path(), plan=plan_file)


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


def prune(day, tasks):
    """Delete a plan whose task no longer exists on the list.

    One file per task changes what "old" means for a plan. It used to be the
    folder's own age — a plan was a proposal from a particular night, and a
    night past KEEP_DAYS was assumed spent. Now the file is the task's plan
    for as long as the task exists, whatever its state: an accepted plan
    tied to a task still on the board is never touched here regardless of
    how long ago it was written, which is what `about:` (the id this plan is
    about, written by write_plan()) is for — it is checked against the ids
    actually on todo.md rather than against a status word.

    What ages out is the other case: a plan whose task has been deleted, or
    archived out of todo.md by ARCHIVE_DAYS in kanban/js/25-archiving.js,
    leaving nothing that will ever read this file again. Given a grace
    period rather than removed the moment the task disappears, since an
    accidental delete-and-undo should not cost the plan as well.
    """
    root = paths.plans_dir()
    if not os.path.isdir(root):
        return
    known = {pick.key_of(t) for t in tasks}
    cutoff = day - dt.timedelta(days=KEEP_DAYS)
    for name in sorted(os.listdir(root)):
        if not name.endswith(".md"):
            continue
        path = os.path.join(root, name)
        about = read_front(path).get("about", "")
        task_id = about[len("task:"):] if about.startswith("task:") else ""
        if not task_id or task_id in known:
            continue
        try:
            touched = dt.date.fromtimestamp(os.stat(path).st_mtime)
        except OSError:
            continue
        if touched >= cutoff:
            continue
        os.remove(path)
        log("pruned an orphaned plan: %s (its task is gone)" % name)


def prune_nights(day):
    """Delete old nights' own run records — index.md and run.json.

    The one thing still filed by date, now that plans themselves are not
    (see prune() above). A night's folder holds only its own record today,
    so it ages out whole, past KEEP_DAYS, the same way the whole of
    plans/<night>/ used to.
    """
    root = paths.plans_dir()
    if not os.path.isdir(root):
        return
    cutoff = day - dt.timedelta(days=KEEP_DAYS)
    for name in sorted(os.listdir(root)):
        full = os.path.join(root, name)
        if not os.path.isdir(full):
            continue
        try:
            when = dt.date.fromisoformat(name)
        except ValueError:
            continue
        if when >= cutoff:
            continue
        shutil.rmtree(full, ignore_errors=True)
        log("pruned the night record for %s" % name)


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
    notify.queue("Plan agent", body, view=view)
