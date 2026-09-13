#!/usr/bin/env python3
"""Tiny local server for the to-do board.

This file lives in kanban/ and serves the folder above it, so kanban/index.html
and data/<dataset>/todo.md are both reachable. It accepts PUT /data/todo.md so
the board can write your changes straight back, and keeps backups in
data/<dataset>/backups/. Listens on 127.0.0.1 only, so nothing outside this
machine can reach it.

Everything private lives in data/, and that folder is the whole of what git
ignores. It is not one list any more but a folder of them — data/twinkl/,
data/personal/, whatever the board's dropdown has been used to add — each
shaped exactly like the others: its own todo.md, backups/, views.md, projects/,
claude.json and jira.json. Exactly one of them is "current" at a time, tracked
in data/.current, and every URL the board already used (/data/todo.md,
/data/backups/…) is transparently rewritten below to point at whichever
dataset that is — see translate_path. The board itself never learns a
dataset's name until it asks /datasets.json for the list.

Run it with run.command, or directly:  python3 kanban/server.py
"""

import datetime
import hashlib
import http.server
import json
import mimetypes
import os
import re
import subprocess
import shutil
import sys
import threading
import time
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
# Everything is served from the project root, one level up from this file.
ROOT = os.path.dirname(HERE)

# The two shared modules in core/, imported the same conditional way ai_chat is:
# a checkout without them serves the board and answers 404 on the routes that
# need them, rather than refusing to start. `todo` is the working calendar, for
# saying when the companion next speaks; `windows` is the usage-window
# reconstruction behind the Schedule view.
sys.path.insert(0, os.path.join(ROOT, "core"))
try:
    import todo
except ImportError:
    todo = None
try:
    import windows
except ImportError:
    windows = None
# The planning agent's own two modules, imported the same way and for the same
# reason. `pick` is what decides which tasks tonight would plan, and the board's
# queue column is that decision rendered rather than a second guess at it —
# there is one selection rule and this is it. `plan` comes along for the bucket
# mapping alone, so the queue can name the agent each task would go to.
sys.path.insert(0, os.path.join(ROOT, "agents", "planning_agent"))
try:
    import pick as planning_agent_pick
    import plan as planning_agent_plan
except ImportError:
    planning_agent_pick = planning_agent_plan = None
# The list and everything derived from it live in one folder, and that folder is
# the only thing git ignores. Before this, the private half of the repo was four
# separate ignore rules — todo.md, backups/, todo-backup-*.md, views.md — and
# anything new had to remember to add a fifth. One folder cannot be forgotten.
# It is also what Obsidian opens as its vault, so the vault holds the list and
# nothing else: no board, no skill, no README to index.
DATA = "data"
CURRENT_FILE = os.path.join(ROOT, DATA, ".current")
TARGET = DATA + "/todo.md"
PAGE = "kanban/index.html"
PORT = 8765
MAX_BYTES = 5 * 1024 * 1024
# One-backup-per-run applies per dataset, not to the server as a whole — the
# rare session that visits two lists gets one grace save on each.
backup_made = set()


# ---- Data sets --------------------------------------------------------------
#
# A dataset is nothing but a folder directly under data/ that has a todo.md in
# it. That is the whole of the contract, so listing them is a directory scan
# rather than a registry that could fall out of step with what is really on
# disk. Which one is "current" is a single word in data/.current; missing,
# blank or naming something deleted, it falls back to the first dataset found,
# which covers a fresh clone (data/.current does not exist) the same way it
# covers a dataset removed by hand outside the board.

def list_datasets():
    base = os.path.join(ROOT, DATA)
    if not os.path.isdir(base):
        return []
    out = [name for name in os.listdir(base)
           if not name.startswith(".")
           and os.path.isfile(os.path.join(base, name, "todo.md"))]
    return sorted(out)


def current_dataset():
    try:
        with open(CURRENT_FILE, encoding="utf-8") as fh:
            name = fh.read().strip()
    except OSError:
        name = ""
    names = list_datasets()
    if name in names:
        return name
    return names[0] if names else None


def set_current_dataset(name):
    os.makedirs(os.path.join(ROOT, DATA), exist_ok=True)
    with open(CURRENT_FILE, "w", encoding="utf-8") as fh:
        fh.write(name)


def slugify(raw):
    """A name typed into the dropdown, turned into a folder name safe to sit
    under data/ and to appear in a URL untouched: lowercase, hyphens, nothing
    that could climb out of the folder or collide with the pointer file."""
    s = re.sub(r"[^a-z0-9]+", "-", (raw or "").strip().lower()).strip("-")
    return s[:40]


def dataset_dir(name):
    return os.path.join(ROOT, DATA, name)


def todo_path(name=None):
    return os.path.join(dataset_dir(name or current_dataset()), "todo.md")


def migrating_path(name=None):
    """The sentinel a migration drops beside todo.md while it works on it.

    Its only job is to make do_PUT refuse. A migration runs with the board shut,
    but a tab left open from before holds a whole pre-migration document and
    autosaves it within four seconds of anything marking it dirty — which
    rollRecurring does on every load, before he has touched anything.
    """
    return os.path.join(dataset_dir(name or current_dataset()), ".migrating")

def backup_dir(name=None):
    return os.path.join(dataset_dir(name or current_dataset()), "backups")


def file_hash(path):
    """What todo.md holds right now, as a short content hash.

    Last-Modified is what do_PUT checked first, and it carries one second of
    precision. Two writes inside the same second are indistinguishable to it,
    so the second one lands unrefused on a document built before the first —
    which is the narrow half of the hole the two real losses went through.
    A content hash has no such granularity: it changes when the bytes change
    and not otherwise.

    sha256, the same as file_hash() in agents/planning_agent/plan.py, which
    guards the same file for the same reason from the other side. Truncated to
    16 characters because this travels in a header on every read: it is a
    fingerprint for equality, not a signature, and 64 bits is far past enough
    for telling two versions of one file apart.

    None when the file is not there, which is a real state — a dataset that
    has never been written — and one the callers treat as "no opinion".
    """
    try:
        with open(path, "rb") as fh:
            return hashlib.sha256(fh.read()).hexdigest()[:16]
    except OSError:
        return None


def chat_viewed_path(name=None):
    """When each conversation card was last opened, so the drawer's Chats
    field knows which ones to mark unread.

    A separate file from todo.md on purpose, and not a candidate for ever
    being merged into it. When you last looked at something is not task
    content, and todo.md has exactly one writer for reasons the README goes
    into at length. Nothing in here is load-bearing: delete it and every card
    reads as unread once, which is the only thing that is lost.

    It was canvas.json until 12 Sep 2026, when the canvas view was removed and
    the two thirds of that file holding card and box positions went with it.
    """
    return os.path.join(dataset_dir(name or current_dataset()), "chat-viewed.json")


def bucket_colors_path(name=None):
    """Where a bucket's own chosen colour lives: name -> one of the board's
    ten preset swatches (var(--b1) .. var(--b10) — see BUCKET_COLOR in
    kanban/js/02-state.js).

    A separate file for the same reason chat-viewed.json is one: a colour is a
    preference about looking at the list, not a fact the list itself carries,
    and todo.md has exactly one writer. Keyed by name rather than position, on
    purpose — reordering the buckets must not reshuffle which colour each one
    wears, which is what deriving it from the array index always did before.
    Renaming a bucket does orphan its entry here, same as a renamed bucket
    already drops out of anything else keyed by name in this app; picking a
    colour again after a rename costs one click, and losing it silently would
    be a worse failure than that.
    """
    return os.path.join(dataset_dir(name or current_dataset()), "bucket-colors.json")


def attach_queue_path(name=None):
    """Where /pa-attach leaves what it could not write itself.

    The skill knows a session's id and its own cwd — CLAUDE_CODE_SESSION_ID
    and os.getcwd() — and which task it should be filed against, but it must
    not touch todo.md: the board holds the whole document in memory and
    autosaves it, so a second writer editing the file underneath an open tab
    is exactly the failure this repo is built to avoid. So the skill writes
    what it wants here and stops. loadFile() drains this on every real load,
    once state.locked is confirmed false — minting any `chat:` key it needs
    through the board's own edit path, filing the session, and clearing
    whatever it managed. An entry whose task has since been renamed or
    deleted is left behind rather than dropped, so nothing queued is ever
    silently lost.
    """
    return os.path.join(dataset_dir(name or current_dataset()), "attach-queue.json")


def reports_dir(name=None):
    # Written reports live beside the list they're about rather than in the
    # repo, because a report names people, dates and internal decisions — the
    # same reasons todo.md itself never leaves data/. One per dataset, same
    # as backups.
    return os.path.join(dataset_dir(name or current_dataset()), "reports")


def projects_dir(name=None):
    # Where a task's own "- Project: data/projects/<name>" note points.
    # Nothing here is a fact todo.md tracks — a folder appears the moment
    # someone creates it and vanishes the moment someone deletes it, with no
    # signal from the list either way. project_listing() below is what lets a
    # folder be seen before, or after, any task happens to mention it.
    return os.path.join(dataset_dir(name or current_dataset()), "projects")


# "Opened 26 Aug 2026." — the line every project CLAUDE.md written by the PA
# carries under its lead paragraph. It is the only start date a project folder
# has: nothing on disk records when a folder was made, and a folder's own
# ctime is the day it was last moved rather than the day it was opened.
# The date and nothing after it: several of these carry a clause explaining
# where the folder came from, and "6 Sep 2026, from four files that had been
# sitting loose at the root of ~/Code since" is not a date.
OPENED_RE = re.compile(r"^Opened\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})", re.I)


def project_about(path):
    """The folder's own description, out of the top of its CLAUDE.md.

    No frontmatter anywhere here, and none worth adding: every one of these
    files already opens the same way, an H1 naming the project and a lead
    paragraph saying what it is, because the PA wrote them all to the same
    shape. That shape is the metadata — read it rather than asking him to
    maintain a second copy of it in a header.

    Only the head of the file is read. The rest is the project itself, which
    is exactly what the drawer has always said it does not open.
    """
    out = {"title": "", "blurb": "", "opened": ""}
    try:
        with open(os.path.join(path, "CLAUDE.md"), encoding="utf-8") as fh:
            head = fh.read(4000)
    except (OSError, UnicodeDecodeError):
        return out
    lines = head.splitlines()
    i = 0
    while i < len(lines) and not lines[i].startswith("# "):
        i += 1
    if i < len(lines):
        out["title"] = lines[i][2:].strip()
        i += 1
    # The lead paragraph: everything up to the next blank line or heading,
    # rewrapped, since the file is hard-wrapped at 90 and the drawer is not.
    para = []
    while i < len(lines) and not lines[i].strip():
        i += 1
    while i < len(lines) and lines[i].strip() and not lines[i].startswith("#"):
        para.append(lines[i].strip())
        i += 1
    # Every one of these paragraphs ends the same two ways — "this folder is
    # the context" and "the tasks live in ../../todo.md and only carry the
    # essentials". Both are filing rather than description: the drawer is the
    # folder, and it lists those tasks a few inches below this.
    text = " ".join(para)
    skip = ("todo.md", "this folder is the context")
    kept = [s for s in re.split(r"(?<=\.)\s+", text)
            if not any(w in s.lower() for w in skip)]
    out["blurb"] = " ".join(kept).strip() or text
    for line in lines:
        m = OPENED_RE.match(line.strip())
        if m:
            out["opened"] = m.group(1).strip()
            break
    return out


def project_meta(path, name):
    """One project folder, described without opening every file inside it.

    Nothing on disk declares a title or a status for one of these folders —
    CLAUDE.md's presence is the only signal, and the folder name and its own
    modified time are the rest. Whether it is "live" (a task currently points
    at it) is left to the board: it already holds every task in memory and
    already knows how to scan one for a project note, so repeating that scan
    here would be a second copy of the same rule.
    """
    try:
        st = os.stat(path)
    except OSError:
        return None
    if not os.path.isdir(path):
        return None
    entries = [e for e in os.listdir(path) if not e.startswith(".")]
    latest = st.st_mtime
    for entry in entries:
        try:
            latest = max(latest, os.stat(os.path.join(path, entry)).st_mtime)
        except OSError:
            pass
    about = project_about(path)
    return {
        "name": name,
        # The H1 out of CLAUDE.md — "Individual Role Profiles" where the
        # folder is called career-framework-revisions. The folder name stays the identity
        # (it is what a task's note points at); this is only what to call it
        # on screen.
        "title": about["title"],
        "blurb": about["blurb"],
        "opened": about["opened"],
        "has_claude_md": "CLAUDE.md" in entries,
        "file_count": len(entries),
        # When the project was last touched, not when the folder was: the
        # newest mtime across the folder and everything directly inside it.
        # A file edited two levels down still counts, because writing it bumps
        # its own folder, and that folder is one of the entries here. Nothing
        # has to be written or maintained for this to be true — which is why
        # there is no "last edited" line in CLAUDE.md for anyone to forget.
        "modified": datetime.datetime.fromtimestamp(latest).isoformat(timespec="seconds"),
        # No dataset name in this, deliberately — see the same note on plan_meta.
        "url": "/" + DATA + "/projects/" + name + "/",
    }


def project_entries(path):
    """What is in one project folder, one level down and no further.

    A folder is a row like any other, carrying its own child count rather
    than its contents — a project keeping its documents in sources/ would
    otherwise flood the panel with someone else's filing, and a walk deep
    enough to be useful is deep enough to be slow on a folder holding a
    checkout. Clicking the row opens the folder in the browser's own
    directory listing, which is the walk, on demand.
    """
    out = []
    try:
        names = sorted(os.listdir(path))
    except OSError:
        return out
    for name in names:
        if name.startswith("."):
            continue
        full = os.path.join(path, name)
        try:
            st = os.stat(full)
        except OSError:
            continue
        isdir = os.path.isdir(full)
        kids = None
        if isdir:
            try:
                kids = len([e for e in os.listdir(full) if not e.startswith(".")])
            except OSError:
                kids = None
        out.append({
            "name": name,
            "dir": isdir,
            "size": None if isdir else st.st_size,
            "children": kids,
            "modified": datetime.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
        })
    # Folders first, then files, each alphabetically — the same order a file
    # manager uses, and the one that keeps sources/ from hiding under n files.
    out.sort(key=lambda e: (not e["dir"], e["name"].lower()))
    return out


def project_listing():
    """Every project folder on disk, alphabetically — live or not.

    taskProject() (kanban/js/06-dates-substeps.js) only ever finds a folder
    some task's own body happens to mention. This walks projects_dir()
    directly, so a folder nothing on the list points at yet, or any more,
    still shows up.
    """
    pdir = projects_dir()
    if not os.path.isdir(pdir):
        return []
    out = []
    for name in sorted(os.listdir(pdir)):
        if name.startswith("."):
            continue
        meta = project_meta(os.path.join(pdir, name), name)
        if meta:
            out.append(meta)
    return out


# Same four states every other data set starts with, so a brand new list's
# columns read the same on the board as any other's from the first save —
# not because these four are special to the board (any heading works, and
# the Columns editor can rename, add to, or remove from them), but because
# nothing is more confusing than a second list whose board looks unlike the
# first for no reason anyone chose.
NEW_DATASET_TEMPLATE = (
    "# To-do\n\n"
    "## 1. Tasks\n\n"
    "### Waiting review\n\n"
    "### Doing\n\n"
    "### To do\n\n"
    "### Backlog\n\n"
)


def create_dataset(name):
    """A new dataset starts as one bucket with the standard four columns,
    empty — the least a file needs for load() and this server's own PUT
    check to accept it — and nothing else: no backups, no Claude or Jira
    config, until something asks for one."""
    path = dataset_dir(name)
    if os.path.exists(path):
        return False
    os.makedirs(path)
    with open(os.path.join(path, "todo.md"), "w", encoding="utf-8", newline="") as fh:
        fh.write(NEW_DATASET_TEMPLATE)
    return True


SESSION_PREFIX = "todo-backup-"
WEEKLY_PREFIX = "todo-backup-week-"
KEEP_BACKUPS = 50      # rolling snapshots, one per run of the board
KEEP_WEEKLY = 12       # weekly snapshots, roughly a quarter of history


def is_weekly(name):
    return name.startswith(WEEKLY_PREFIX)


def week_tag(when=None):
    """ISO week label, e.g. 2026-W33. Weeks start on Monday."""
    year, week, _ = (when or datetime.date.today()).isocalendar()
    return "%04d-W%02d" % (year, week)


def backup_names():
    bdir = backup_dir()
    if not os.path.isdir(bdir):
        return []
    return sorted(n for n in os.listdir(bdir)
                  if n.startswith(SESSION_PREFIX) and n.endswith(".md"))


def prune_backups():
    """Keep the folder small without ever touching the weekly snapshots.

    The rolling backups exist to undo the last few sessions, so ten is plenty.
    The weekly ones are the long memory and are pruned on their own, far slower
    schedule — otherwise a busy fortnight of saves would quietly delete the
    only copy of how the list looked last month.
    """
    bdir = backup_dir()
    names = backup_names()
    session = [n for n in names if not is_weekly(n)]
    weekly = [n for n in names if is_weekly(n)]
    for old in session[:-KEEP_BACKUPS] + weekly[:-KEEP_WEEKLY]:
        try:
            os.remove(os.path.join(bdir, old))
        except OSError:
            pass


def weekly_backup():
    """One snapshot per calendar week, the first time the board notices a new week.

    Taken whether or not anything was saved, so a week that opened with the
    board running is captured as it was before that week's edits started.
    Returns the file name if one was written, otherwise None.
    """
    path = todo_path()
    if not os.path.exists(path):
        return None
    bdir = backup_dir()
    name = WEEKLY_PREFIX + week_tag() + ".md"
    dest = os.path.join(bdir, name)
    if os.path.exists(dest):
        return None
    os.makedirs(bdir, exist_ok=True)
    shutil.copy2(path, dest)
    prune_backups()
    return name


def weekly_backup_watcher(every=1800):
    """Check for a new week while the board runs, so crossing midnight on a
    Sunday is enough to trigger the snapshot — no save required. Runs against
    whichever dataset is current at the moment it fires, same as a save does."""
    while True:
        try:
            ds = current_dataset()
            name = weekly_backup()
            if name:
                sys.stdout.write("weekly backup: %s/%s/backups/%s\n" % (DATA, ds, name))
                sys.stdout.flush()
        except OSError as err:
            sys.stdout.write("weekly backup failed: %s\n" % err)
        time.sleep(every)


# ---- The schedule, and what the usage windows have been doing ---------------
#
# Three things around this app run on a clock rather than on demand, and until
# now the only way to know whether any of them had actually fired was to go and
# look in three different places. This is that, as one list.
#
# Two sources, and they are not alternatives:
#
#   Live   whether a job is installed and armed, and when it fires next. Only
#          the system knows that, and a log will happily describe a job that was
#          unloaded a week ago.
#   Ledger what actually happened. launchctl cannot tell you the planning agent
#          wrote three plans and stopped on a usage limit.
#
# Everything here is read-only and local. `launchctl` is shelled out to with a
# short timeout, and its absence is a real and expected answer rather than an
# error: an uninstalled job is exactly the thing this view is most useful for
# saying out loud.

PLANNING_LABEL = "com.tiagopedras.todos-planning-agent"


def _launchctl(args, timeout=3):
    import subprocess
    try:
        p = subprocess.run(["/bin/launchctl"] + args, capture_output=True,
                           text=True, timeout=timeout)
        return p.stdout if p.returncode == 0 else ""
    except (OSError, subprocess.SubprocessError):
        return ""


def _tail(path, n=12):
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return [l.rstrip("\n") for l in fh.readlines()[-n:]]
    except OSError:
        return []


def _planning_agent_job():
    """The planning agent: twelve launchd wakes, 19:00 to 06:00."""
    plist = os.path.join(ROOT, "agents", "planning_agent", "com.tiagopedras.todos-planning-agent.plist")
    installed = os.path.exists(os.path.expanduser(
        "~/Library/LaunchAgents/%s.plist" % PLANNING_LABEL))
    printed = _launchctl(["print", "gui/%d/%s" % (os.getuid(), PLANNING_LABEL)])
    loaded = bool(printed)

    hours = sorted(int(h) for h in re.findall(
        r"<key>Hour</key>\s*<integer>(\d+)</integer>",
        open(plist, encoding="utf-8").read() if os.path.exists(plist) else ""))
    now = datetime.datetime.now()
    nxt = ""
    if hours:
        later = [h for h in hours if h > now.hour]
        when = now.replace(hour=later[0] if later else hours[0], minute=5,
                           second=0, microsecond=0)
        if not later:
            when += datetime.timedelta(days=1)
        nxt = when.isoformat(timespec="minutes")

    # The wakes run 19:00 to 06:00, so they wrap midnight and the first and last
    # of a sorted list are 00 and 23 — which reads as "all day" and is the
    # opposite of the truth. Find the real ends instead: the hour whose
    # predecessor is not in the set starts the run, and the one whose successor
    # is not in it ends the run.
    span = ""
    if hours:
        hs = set(hours)
        first = next((h for h in hours if (h - 1) % 24 not in hs), hours[0])
        last = next((h for h in hours if (h + 1) % 24 not in hs), hours[-1])
        span = "%d wakes, %02d:00–%02d:00" % (len(hours), first, last)

    log = _tail(os.path.join(plans_dir(), "planning-agent.log"), 40)
    ran = [l for l in log if " start:" in l or " done:" in l or " wake" in l]
    last_done = next((l for l in reversed(log) if " done:" in l), "")
    return {
        "id": "planning-agent",
        "name": "Planning agent",
        "what": "Plans every task tagged ai:full or ai:partial, one agent each.",
        "schedule": span or "not configured",
        "armed": loaded,
        "state": ("running" if loaded else
                  "installed, not loaded" if installed else "not installed"),
        "next": nxt if loaded else "",
        "last": last_done,
        "recent": ran[-6:],
        "hint": ("" if loaded else
                 "ln -s agents/planning_agent/%s.plist ~/Library/LaunchAgents/ && "
                 "launchctl load ~/Library/LaunchAgents/%s.plist"
                 % (PLANNING_LABEL, PLANNING_LABEL)),
    }


def _companion_job():
    """The menu bar app. Not launchd — an app with a timer inside it."""
    lock = os.path.join(dataset_dir(current_dataset()), "companion.lock")
    running = "todocompanion" in _launchctl(["list"]).lower()
    state = {}
    try:
        with open(os.path.join(dataset_dir(current_dataset()), "companion.json"),
                  encoding="utf-8") as fh:
            state = json.load(fh)
    except (OSError, ValueError):
        pass

    # 08:30 on the next working day, from the same calendar the companion uses.
    nxt = ""
    if todo:
        day = datetime.date.today()
        if state.get("notified") == day.isoformat() or datetime.datetime.now().hour >= 20:
            day += datetime.timedelta(days=1)
        for _ in range(14):
            if todo.is_working_day(day):
                break
            day += datetime.timedelta(days=1)
        nxt = datetime.datetime.combine(day, datetime.time(8, 30)).isoformat(timespec="minutes")

    last = state.get("notified", "")
    return {
        "id": "companion",
        "name": "Desktop companion",
        "what": "One briefing each working morning, and the messages waiting to go out.",
        "schedule": "08:30 on a working day",
        "armed": running,
        "state": "running" if running else "not running",
        "next": nxt if running else "",
        "last": ("notified %s at %s" % (last, state.get("notified_at", "?"))
                 if last else "has not spoken yet"),
        "recent": [],
        "hint": "" if running else "open To-Do Companion.app",
        "lock": os.path.exists(lock),
    }


def _weekly_job():
    """A thread inside this server, so armed means the server is up."""
    weekly = [b for b in backup_listing() if b.get("kind") == "weekly"]
    return {
        "id": "weekly-backup",
        "name": "Weekly backup",
        "what": "One snapshot of todo.md a week, kept for %d weeks." % KEEP_WEEKLY,
        "schedule": "checked every 30 minutes while the board is running",
        "armed": True,
        "state": "running, in this server",
        "next": "",
        "last": ("%s, %s" % (weekly[0]["name"], weekly[0]["modified"])
                 if weekly else "none taken yet"),
        "recent": [b["name"] for b in weekly[:4]],
        "hint": "",
    }


def schedule_listing():
    out = []
    for fn in (_planning_agent_job, _companion_job, _weekly_job):
        try:
            out.append(fn())
        except Exception as exc:                     # noqa: BLE001
            # One job failing to describe itself must not empty the whole view.
            out.append({"id": "?", "name": fn.__name__, "state": "could not read",
                        "what": str(exc)[:200], "armed": False, "schedule": "",
                        "next": "", "last": "", "recent": [], "hint": ""})
    return out


_usage_cache = {"at": 0.0, "data": None}


def ceiling(wins, roll, state):
    """What counts as 100% on the usage chart, and where the figure came from.

    The chart is a percentage of an allowance, and no allowance appears anywhere
    on disk: `core/windows.py` reconstructs what each window spent, and the error
    a real limit returns names the reset time but not the ceiling. So there are
    two sources and they are not equal.

      measured  a run was actually refused, and `plan.py` wrote what the window
                had spent at that moment into window.json. A real floor under
                the true allowance, and the honest answer.
      observed  no limit has been hit yet, so the busiest window in the period
                stands in for the ceiling. That is not the allowance and the
                card says so — it is "against the heaviest session you have
                had", which still answers whether today is unusual.

    The week has no measured source at all. Nothing here has any notion of a
    weekly allowance, so it is always the busiest seven days seen.
    """
    seen = max((w["tok"] for w in wins), default=0)
    measured = (state or {}).get("limit_tok") or 0
    return {
        "session": max(measured, seen, 1),
        "week": max((r["tok"] for r in roll), default=0) or 1,
        "source": "measured" if measured >= seen and measured else "observed",
        "measuredAt": (state or {}).get("limit_tok_at", ""),
    }


def rolling_week(wins, days):
    """Tokens used in the seven days ending on each day of the range.

    The weekly half of the usage chart, and a rolling total rather than a share
    of anything, because nothing here knows what the ceiling is. `core/windows.py`
    reconstructs windows from the transcripts and can say what each one used; no
    limit figure appears anywhere on disk, and the error a real limit returns
    names the reset time but not the allowance. So the chart answers "is this
    trending down" rather than "how much is left", which is the question actually
    being asked of it.

    A window is counted on the day it opened. Windows run five hours and some
    cross midnight, and splitting one across two days would be more precise about
    a number nobody reads and less honest about the thing being counted, which is
    sessions rather than hours.

    The first six days of the range are short by construction — a seven-day total
    needs seven days behind it — so they are not returned at all. A line that
    ramps up from nothing for its first week looks like a trend and is an
    artefact.
    """
    if not wins:
        return []
    per_day = {}
    for w in wins:
        day = w["start"].date()
        per_day[day] = per_day.get(day, 0) + w["tok"]
    last = datetime.date.today()
    first = last - datetime.timedelta(days=days - 1)
    out = []
    day = first + datetime.timedelta(days=6)
    while day <= last:
        total = sum(per_day.get(day - datetime.timedelta(days=n), 0) for n in range(7))
        out.append({"day": day.isoformat(), "tok": total})
        day += datetime.timedelta(days=1)
    return out


def window_shape(w, steps=14):
    """A window's spend curve, thinned to something worth sending.

    `shape` off reconstruct() is one point per turn, and a busy window holds
    several hundred — thirty days of them is megabytes of JSON to draw a box
    two hundred pixels wide. Sampled at even points across the window's own
    five hours rather than every nth turn, because the chart plots it against
    time: a window with four hundred turns in its first ten minutes and none
    after should draw as a step, and taking every nth turn would draw it as a
    ramp. The last point is the window's total, always, so the curve ends
    where the box's top edge is.

    Each point is (fraction of the window elapsed, fraction of its spend), both
    0 to 1, so the client needs neither the window's clock nor its total to
    draw it.
    """
    pts = w.get("shape") or []
    if not pts or not w["tok"]:
        return []
    span = (w["end"] - w["start"]).total_seconds() or 1
    out, i = [], 0
    for s in range(1, steps + 1):
        at = s / steps
        cutoff = w["start"] + datetime.timedelta(seconds=span * at)
        while i < len(pts) and pts[i][0] <= cutoff:
            i += 1
        # i is now the first turn after the cutoff, so i-1 is the running total
        # as at the cutoff. Nothing yet spent reads as a flat 0, which is right.
        run = pts[i - 1][1] if i else 0
        out.append([round(at, 4), round(run / w["tok"], 4)])
    return out


BASELINE_DAYS = 30


def usage_summary(days=30, ttl=60):
    """The rolling 5-hour usage windows, from core/windows.py.

    Cached, because reconstructing a month is about forty thousand transcript
    lines and a second or so — fine on demand, not fine on every render. Keyed
    on `days`, since the card's range buttons ask for four different spans and
    a cache that ignored which one was asked for would answer the wrong one.

    Always reconstructs the full baseline and then narrows, rather than
    reconstructing only what is being looked at. The reason is the axis: 100%
    is the heaviest session seen, so a three-day view that worked out its own
    ceiling would call its own busiest window 100% and every range would mean
    something different. The chart is there to answer "is today unusual", and
    the comparison has to be against the month either way. The rolling
    seven-day line needs the same — seven days of history behind each point.

    So the range buttons buy legibility, not speed. That was always the
    complaint: eighty-three windows in a 380px column is a barcode.
    """
    if windows is None:
        return {"available": False}
    now = time.time()
    if _usage_cache.get("days") == days and _usage_cache["data"] and now - _usage_cache["at"] < ttl:
        return _usage_cache["data"]

    span = max(days, BASELINE_DAYS)
    since = datetime.datetime.now().astimezone() - datetime.timedelta(days=span)
    every = windows.reconstruct(windows.turns(since=since))
    state = windows.read_state(os.path.join(plans_dir(), "window.json"))
    win = windows.current(state=state)
    # The ceiling and the weekly line are worked out over the whole baseline;
    # only what is drawn is cut back to the range asked for.
    roll = rolling_week(every, span)
    cap = ceiling(every, roll, state)

    cut = datetime.datetime.now().astimezone() - datetime.timedelta(days=days)
    wins = [w for w in every if w["end"] > cut]
    firstDay = cut.date().isoformat()
    roll = [r for r in roll if r["day"] >= firstDay]
    toks = sorted(w["tok"] for w in wins) or [0]
    data = {
        "rolling": roll,
        "ceiling": cap,
        "baseline": span,
        "available": True,
        "days": days,
        # The window open right now, and nothing gates on it — it stopped being
        # a gate on 9 Sep 2026. It is here because "how much of this window is
        # left" is still the honest answer to "is there room to run something".
        "window": {"expires": win["expires"].isoformat() if win["expires"] else None,
                   "source": win["source"]},
        "median": toks[len(toks) // 2],
        "p90": toks[int(len(toks) * 0.9)],
        "max": toks[-1],
        "windows": [{
            "start": w["start"].isoformat(timespec="minutes"),
            "end": w["end"].isoformat(timespec="minutes"),
            "tok": w["tok"],
            "turns": w["turns"],
            "open": w["end"] > datetime.datetime.now().astimezone(),
            # A window that both starts and ends inside the night is one the
            # planning agent could have spent in without touching the morning.
            "night": w["start"].hour >= 19 or w["start"].hour < 7,
            # How the spend arrived across the five hours — see window_shape.
            "shape": window_shape(w),
        } for w in wins],
    }
    _usage_cache.update(at=now, data=data, days=days)
    return data


def plans_dir(name=None):
    """Where the planning agent leaves what it worked out overnight.

    A different folder from reports/ on purpose, and not a candidate for being
    merged into it. A report is Tiago's own record of what happened, written in
    his voice and finished the day it is written. A plan is a proposal about
    what to do next, written by an agent, and it expires the moment he acts on
    it. Putting the two together would put machine output into the Reports view,
    which is a view of his own writing.
    """
    return os.path.join(dataset_dir(name or current_dataset()), "plans")


_owner_alias = {}


def owner_now(owner):
    """What a document's `owner:` is called today.

    The two agents were renamed on 12 Sep 2026 — `night-agent` was named for
    the hour it ran and `execution-agent` for the job, which is two axes for
    one pair — so a plan or a run written before then names an owner nothing
    on the board matches any more, and every card of it draws as though it
    were owned by nobody. `core/migrations/migrate-agent-names.py` rewrites
    what is on disk; this is what reads the one the migration never reached, a
    file restored from a backup being the obvious case.

    The map is each stream's own, in its manifest beside the `legacy` block
    that already does this for the five status words, so there is one copy of
    it and it is the stream's to change.
    """
    if not _owner_alias:
        for folder in ("planning_agent", "implementing_agent"):
            try:
                with open(os.path.join(ROOT, "agents", folder, "stream.json"), encoding="utf-8") as fh:
                    m = json.load(fh)
            except (OSError, ValueError):
                continue
            _owner_alias.update(((m.get("owner_legacy") or {}).get("map") or {}))
    return _owner_alias.get(owner, owner)


def plan_meta(path, name, night):
    """One nightly plan, described from its frontmatter.

    Same idea as report_meta and deliberately not the same function: a plan
    carries the task it belongs to, the agent that wrote it and whether it has
    been actioned, and folding four extra fields into the report reader would
    make both harder to follow than keeping them apart.
    """
    fields = {}
    try:
        with open(path, encoding="utf-8") as fh:
            if fh.readline().strip() != "---":
                return None
            for line in fh:
                if line.strip() == "---":
                    break
                key, _, value = line.partition(":")
                fields[key.strip().lower()] = value.strip()
    except OSError:
        return None
    try:
        st = os.stat(path)
    except OSError:
        return None
    # A plan pruned into plans/actioned/ is not from a night called "actioned".
    # It says which night it is from, in its own frontmatter, and that is what
    # everything downstream needs: the marker validates a date, and the board
    # sorted "actioned" above every real date when deciding whether a rejected
    # plan had been replaced. Both were waiting to fire on 5 Oct 2026, when the
    # first folder becomes old enough for prune() to move it.
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", night or ""):
        night = fields.get("night") or fields.get("date") or night
    return {
        "name": name,
        "night": night,
        "title": fields.get("title") or name[:-3].replace("-", " "),
        "task": fields.get("task", ""),
        "bucket": fields.get("bucket", ""),
        "column": fields.get("column", ""),
        "ai": fields.get("ai", ""),
        "agent": fields.get("agent", ""),
        "slug": fields.get("slug", ""),
        "date": fields.get("date", night),
        # The canonical shape, since 11 Sep 2026. `status` is still read below
        # so a plan restored from a backup taken before that still renders —
        # the same permanent-fallback rule the tag syntax follows rather than a
        # migration window.
        "id": fields.get("id", ""),
        "about": fields.get("about", ""),
        "group": fields.get("group", fields.get("bucket", "")),
        "state": fields.get("state", ""),
        "owner": owner_now(fields.get("owner", "")),
        "seen": fields.get("seen", "") == "yes",
        "needs_you": fields.get("needs_you", "") == "yes",
        "resolution": fields.get("resolution", ""),
        # How far the implementing agent's half has got, on a plan he accepted.
        # Its own field rather than more values on `state` because the contract
        # allows one state per document and this is a second question about the
        # same one: `state` says where the plan is, `production` says what has
        # happened to the work it describes. Written by the fold migration and
        # by do; "" on every plan that has not been accepted.
        #
        # This is also the field the eight-column version of the Plans view
        # would draw as columns, if the implementing agent ever becomes
        # autonomous enough to be worth watching — see IMPROVEMENTS.md.
        "production": fields.get("production", ""),
        "production_summary": fields.get("production_summary", ""),
        "feedback": fields.get("feedback", fields.get("redo_note", "")),
        "created": fields.get("created", fields.get("generated", "")),
        # When the file was actually written, to the second. Missing on any
        # plan from before this field existed — the board falls back to
        # `modified` for those, which is the file's mtime and moves whenever
        # mark_plan flips the status, so it is only a fallback and not what
        # this field is for.
        "generated": fields.get("generated", ""),
        "status": fields.get("status", "unread"),
        # An agent that decided the task could not be planned without a
        # decision only he can make writes `outcome: folded`. See the folding
        # rule in agents/planning_agent/PLAN-BRIEF.md. Passed through as written rather than
        # reduced to a boolean, so a value this server has never heard of
        # reaches the board instead of being swallowed here.
        "outcome": fields.get("outcome", ""),
        # Why he sent it back, on a plan he sent back. Shown on the card so the
        # reason is visible without opening it, and read by the next run.
        "redo_note": fields.get("redo_note", ""),
        "summary": fields.get("summary", ""),
        "bytes": st.st_size,
        "modified": datetime.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
        # No dataset name in this, deliberately, and it is easy to get wrong:
        # translate_path puts the current one in for every /data/ URL, so naming
        # it here asks for data/twinkl/twinkl/plans/... and 404s. Reports and
        # backups build their URLs the same way, for the same reason.
        "url": "/" + DATA + "/plans/" + night + "/" + name,
    }


def plan_listing():
    """Every plan the planning agent has written, newest night first.

    index.md is skipped: it is the night's own contents page, useful to read on
    disk and noise in a list that already shows every plan it points at.
    """
    root = plans_dir()
    if not os.path.isdir(root):
        return []
    out = []
    for night in sorted(os.listdir(root), reverse=True):
        folder = os.path.join(root, night)
        if not os.path.isdir(folder) or night.startswith("."):
            continue
        for name in sorted(os.listdir(folder)):
            if not name.endswith(".md") or name == "index.md" or name.startswith("."):
                continue
            meta = plan_meta(os.path.join(folder, name), name, night)
            if meta:
                out.append(meta)
    out.sort(key=lambda p: (p["night"], p["modified"]), reverse=True)
    return out


def ledger_path():
    return os.path.join(plans_dir(), "ledger.json")


def queue_order_path():
    return os.path.join(plans_dir(), "queue-order.json")


PLANNING_LOCK = os.path.join(ROOT, DATA, ".planning-agent.lock")


def _queue_row(task, ledger, position=0, state="queued", why=""):
    seen = ledger.get(task.title) if isinstance(ledger, dict) else None
    if not why and planning_agent_pick:
        _, why = planning_agent_pick.is_stale(task, ledger or {})
    return {
        "title": task.title,
        "bucket": task.bucket,
        "column": task.column,
        "ai": task.ai or "",
        "slug": task.slug or "",
        "impact": getattr(task, "impact", "") or "",
        "effort": getattr(task, "effort", "") or "",
        "agent": planning_agent_plan.bucket_agent(task.bucket) if planning_agent_plan else "",
        "position": position,
        "state": state,
        "why": why,
        # What happened to it last time, so a card that has been planned three
        # nights running says so rather than looking new every morning.
        "last": (seen or {}).get("planned", ""),
        "lastStatus": (seen or {}).get("status", ""),
    }


def queue_listing():
    """What tonight would plan, in the order it would plan it.

    Returns None when the planning agent is not in this checkout, which the route
    answers as a 404 — the same shape the Ask Claude routes use, and the board
    draws no queue column rather than an error.
    """
    if planning_agent_pick is None or todo is None:
        return None
    try:
        with open(todo_path(), encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return {"queue": [], "held": [], "skipped": [], "order": [], "hold": [],
                "error": "no todo.md to read"}

    order = planning_agent_pick.load_order(queue_order_path())
    try:
        with open(ledger_path(), encoding="utf-8") as fh:
            ledger = json.load(fh)
    except (OSError, ValueError):
        ledger = {}
    if not isinstance(ledger, dict):
        ledger = {}

    queue, skipped = planning_agent_pick.select(text, order=order, ledger=ledger)
    holds = {planning_agent_pick.key(t) for t in order.get("hold") or []}

    rows = [_queue_row(t, ledger, i + 1) for i, t in enumerate(queue)]
    held, other = [], []
    for task, why in skipped:
        if planning_agent_pick.key(task.title) in holds:
            held.append(_queue_row(task, ledger, 0, "held", why))
        else:
            other.append(_queue_row(task, ledger, 0, "skipped", why))
    return {
        "queue": rows, "held": held, "skipped": other,
        "order": order.get("order") or [], "hold": order.get("hold") or [],
    }


def set_queue_order(order, hold):
    """Write the board's ordering. The second write either surface makes.

    It writes a file the planning agent owns and nothing else reads. Both lists
    are taken as given rather than validated against the current queue: a title
    in here that no longer exists is never matched and costs nothing, whereas
    dropping unknown titles would quietly lose the ordering of a task that is
    merely Blocked this week and back next.
    """
    if planning_agent_pick is None:
        return None, {"error": "no planning agent in this checkout"}
    if not isinstance(order, list) or not isinstance(hold, list):
        return None, {"error": "order and hold must both be lists"}
    if len(order) + len(hold) > 500:
        return None, {"error": "too many titles"}
    body = planning_agent_pick.save_order({"order": order, "hold": hold},
                                   queue_order_path())
    return {"ok": True, "order": body["order"], "hold": body["hold"],
            "saved": body["saved"]}, None


# The log lines plan.py writes, and which of them mean what. Matched here rather
# than exported from plan.py because the log is a human artefact first: it is
# read at a terminal far more often than it is parsed, and pinning its wording
# to a format string the board depends on would stop it being edited freely.
# When one of these stops matching, the column goes quiet — it does not lie.
_LOG_RE = re.compile(r"^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s\s+(.*)$")
_FLIGHT_RE = re.compile(r"^>\s+(.*?)\s+\(([a-z0-9\-]+)\)\s*$")
_DONE_RE = re.compile(r"^planned\s+(.*?)\s+(\d+)s\s+\$([0-9.]+)\s*$")
# Greedy up to 50 rather than lazy to a run of spaces: plan.py pads the title
# into a 50-character field, so a title that fills it is followed by a single
# space and a lazy match would take the message as part of the title.
_FAIL_RE = re.compile(r"^failed\s(.{1,50})\s+(\S.*)$")


def start_planning_agent_run():
    """Kick off a batch now, from the board's button.

    `--force`, which is the whole point: it skips the clock gate and the window
    test, so it runs at eleven in the morning when neither would allow it. It
    does not skip the lock, and it does not skip the ledger — a task planned
    last night whose text has not moved is still skipped, so pressing this twice
    in a row is cheap rather than a second full batch.

    Detached with start_new_session, so the run outlives both this request and
    this server. A batch is twenty-odd agents over half an hour and it must not
    be tied to whether a board tab stays open.

    The lock is checked here as well as in run.sh. run.sh would refuse anyway,
    but it refuses by logging a line and exiting 0, which from here is
    indistinguishable from a run that started — and a button that says it
    started something it did not is worse than one that refuses.
    """
    import subprocess
    if planning_agent_pick is None:
        return None, {"error": "no planning agent in this checkout"}
    script = os.path.join(ROOT, "agents", "planning_agent", "run.sh")
    if not os.path.isfile(script):
        return None, {"error": "agents/planning_agent/run.sh is not here"}
    if os.path.isdir(PLANNING_LOCK):
        return None, {"error": "a run is already going"}
    try:
        subprocess.Popen(
            [script, "--force"], cwd=ROOT,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL, start_new_session=True)
    except OSError as exc:
        return None, {"error": "could not start it: %s" % exc}
    sys.stdout.write("planning agent: forced a run from the board\n")
    sys.stdout.flush()
    return {"ok": True, "started": True}, None


def planning_agent_run():
    """What the planning agent is doing, or did last, from its lock and its log.

    Two sources again, and neither is enough alone. The lock directory says
    whether a run is going on right now — it is held for the life of the batch
    and cleared by a trap on the way out. The log says what that run has got
    through. A log with a task in flight and no lock is a run that died between
    the two, which is worth saying out loud rather than showing as live.

    Only ever one task is in flight: plan.py runs its agents one at a time, on
    purpose, so this is a single card rather than a list of them.
    """
    live = os.path.isdir(PLANNING_LOCK)
    since = ""
    if live:
        try:
            since = datetime.datetime.fromtimestamp(
                os.path.getmtime(PLANNING_LOCK)).isoformat(timespec="minutes")
        except OSError:
            live = False

    lines = []
    for raw in _tail(os.path.join(plans_dir(), "planning-agent.log"), 400):
        m = _LOG_RE.match(raw)
        if m:
            lines.append((m.group(1), m.group(2).strip()))

    # Everything since the last "start:" is this run. Before that is last night.
    begun = ""
    for i in range(len(lines) - 1, -1, -1):
        if lines[i][1].startswith("start:"):
            begun, lines = lines[i][0], lines[i:]
            break
    else:
        lines = []

    to_plan = 0
    current, done, failed, stopped = None, [], [], ""
    for stamp, body in lines:
        m = re.match(r"^start:\s+(\d+) to plan", body)
        if m:
            to_plan = int(m.group(1))
            continue
        m = _FLIGHT_RE.match(body)
        if m:
            current = {"title": m.group(1), "agent": m.group(2), "since": stamp}
            continue
        m = _DONE_RE.match(body)
        if m:
            done.append({"title": m.group(1).strip(), "took": int(m.group(2)),
                         "cost": float(m.group(3)), "at": stamp})
            current = None
            continue
        m = _FAIL_RE.match(body)
        if m:
            failed.append({"title": m.group(1).strip(), "why": m.group(2), "at": stamp})
            current = None
            continue
        if body.startswith("Stopped") or body.startswith("STOPPED"):
            stopped, current = body, None

    orphan = bool(current) and not live
    return {
        "live": live,
        "since": since,
        "started": begun,
        "toPlan": to_plan,
        "current": None if orphan else current,
        "orphan": orphan and current or None,
        "done": done,
        "failed": failed,
        "stopped": stopped,
        "left": max(0, to_plan - len(done) - len(failed)) if to_plan else 0,
    }


def report_meta(path, name):
    """Title, date and standfirst for one report, read from its frontmatter.

    A report is a plain Markdown file, so the board must be able to describe one
    without opening it. Frontmatter carries what the list needs; everything below
    it is the report itself and is only fetched when someone opens it.
    """
    title, date, covers, topic, summary = "", "", "", "", ""
    try:
        with open(path, encoding="utf-8") as fh:
            first = fh.readline()
            if first.strip() == "---":
                for line in fh:
                    if line.strip() == "---":
                        break
                    key, _, value = line.partition(":")
                    key, value = key.strip().lower(), value.strip()
                    if key == "title":
                        title = value
                    elif key == "date":
                        date = value
                    elif key == "covers":
                        covers = value
                    elif key == "topic":
                        topic = value
                    elif key == "summary":
                        summary = value
    except OSError:
        return None
    try:
        st = os.stat(path)
    except OSError:
        return None
    # A file with no frontmatter is still a report. Fall back to the name so a
    # dropped-in Markdown file shows up rather than being silently ignored.
    if not title:
        title = name[:-3].replace("-", " ").strip()
    return {
        "name": name,
        "title": title,
        "date": date,
        "covers": covers,
        "topic": topic,
        "summary": summary,
        "bytes": st.st_size,
        "modified": datetime.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
        "url": "/" + DATA + "/reports/" + name,
    }


def report_listing():
    """Every written report, newest first by the date it covers up to.

    Sorted on the frontmatter date rather than the file's mtime: fixing a typo in
    a report from three weeks ago should not move it to the top of the list.
    """
    rdir = reports_dir()
    if not os.path.isdir(rdir):
        return []
    out = []
    for name in sorted(os.listdir(rdir)):
        if not name.endswith(".md") or name.startswith("."):
            continue
        meta = report_meta(os.path.join(rdir, name), name)
        if meta:
            out.append(meta)
    out.sort(key=lambda r: (r["date"] or "", r["modified"]), reverse=True)
    return out


ARCHIVE = "done-archive.md"


def archive_done(text):
    """Append finished work lifted out of todo.md, under a dated heading.

    A separate file rather than a reliance on the backups: a backup is a copy of
    the whole list at a moment, and every one of them is eventually pruned, so
    work archived today would quietly stop existing in twelve weeks. This file is
    never pruned and never written to by anything else — it only grows.
    """
    bdir = backup_dir()
    os.makedirs(bdir, exist_ok=True)
    path = os.path.join(bdir, ARCHIVE)
    new = not os.path.exists(path)
    with open(path, "a", encoding="utf-8", newline="") as fh:
        if new:
            fh.write("# Finished and archived\n\n"
                     "Tasks lifted out of todo.md once they had been ticked off for more\n"
                     "than a month. Newest section last. Nothing here is ever deleted.\n")
        fh.write("\n## Archived %s\n\n" % datetime.date.today().isoformat())
        fh.write(text.rstrip("\n") + "\n")
        fh.flush()
        os.fsync(fh.fileno())
    return ARCHIVE


AGENDA_ARCHIVE = "agenda-history.md"


def archive_agenda(text):
    """Append one recurring meeting's previous agenda, cut by the roll.

    A card keeps one cycle of history — that is what writing the next agenda
    needs — but the one being replaced is a record of a meeting that actually
    happened, not scratch state. Same shape as archive_done: append-only,
    never pruned, written to by nothing else.
    """
    bdir = backup_dir()
    os.makedirs(bdir, exist_ok=True)
    path = os.path.join(bdir, AGENDA_ARCHIVE)
    new = not os.path.exists(path)
    with open(path, "a", encoding="utf-8", newline="") as fh:
        if new:
            fh.write("# Agenda history\n\n"
                     "Previous agendas, filed here by the roll the moment a newer one\n"
                     "replaces them on the card. Newest section last. Nothing here is ever\n"
                     "deleted.\n")
        fh.write("\n" + text.rstrip("\n") + "\n")
        fh.flush()
        os.fsync(fh.fileno())
    return AGENDA_ARCHIVE


def archive_info():
    """The archive is not a backup and is not listed as one — it is the only file
    here that is never pruned, and it holds work that is in no current copy of
    todo.md at all."""
    path = os.path.join(backup_dir(), ARCHIVE)
    try:
        st = os.stat(path)
    except OSError:
        return None
    sections = 0
    try:
        with open(path, encoding="utf-8") as fh:
            sections = sum(1 for line in fh if line.startswith("## Archived "))
    except OSError:
        pass
    return {
        "name": ARCHIVE,
        "bytes": st.st_size,
        "modified": datetime.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
        "url": "/" + DATA + "/backups/" + ARCHIVE,
        "sections": sections,
    }


def backup_listing():
    """What the backup index page reads. Newest first."""
    out = []
    bdir = backup_dir()
    for name in backup_names():
        full = os.path.join(bdir, name)
        try:
            st = os.stat(full)
        except OSError:
            continue
        out.append({
            "name": name,
            "kind": "weekly" if is_weekly(name) else "session",
            "bytes": st.st_size,
            "modified": datetime.datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
            "url": "/" + DATA + "/backups/" + name,
        })
    out.sort(key=lambda b: b["modified"], reverse=True)
    return out


# ---- Claude, on a task -----------------------------------------------------
#
# The engine that runs Claude Code and the index of which sessions sit under
# which task now live one level up, in ai_chat_engine/ — a module any local
# tool can load, not just this one. See its README.md for the HTTP contract
# this wires up below, and its engine.py for what it actually does: run the
# CLI, stream its output, and read a transcript back from the file Claude
# Code itself writes.
#
# A prompt written on a task already had a way out of the board before any of
# this: Open in Claude, a link to claude.ai with the text sitting in the box.
# That is a hand-over and it ends there — the chat it opens runs in a tab that
# has never seen this machine. AI_CHAT_DIR below is where the module that
# fixes that lives; STATIC_PREFIX is where its own JS and CSS are served from.

AI_CHAT_DIR = os.path.normpath(os.path.join(ROOT, "..", "PACKAGES", "ai_chat_engine"))
STATIC_PREFIX = "/ai-chat/"

# The work-item model every stream in here shares. Same wiring as AI_CHAT_DIR
# above, and the same failure: a checkout without PACKAGES answers 404 on
# /streams.json and /work-streams/* and serves the board exactly as it did
# before either existed. Nothing the board needs in order to start may come
# from here, because on the static deployment this path does not exist at all.
WORK_STREAMS_DIR = os.path.normpath(os.path.join(ROOT, "..", "PACKAGES", "work_streams"))
WS_PREFIX = "/work-streams/"
if os.path.isdir(WORK_STREAMS_DIR):
    sys.path.insert(0, WORK_STREAMS_DIR)
try:
    import manifest as ws_manifest
except ImportError:
    ws_manifest = None
try:
    import writer as ws_writer
except ImportError:
    ws_writer = None

Engine = ChatEndpoints = None
if os.path.isdir(AI_CHAT_DIR):
    sys.path.insert(0, AI_CHAT_DIR)
    try:
        from engine import Engine          # noqa: E402  (path set just above)
        from http_glue import ChatEndpoints  # noqa: E402
    except ImportError:
        # ai_chat_engine exists but is missing a file, or is an incompatible
        # version.
        # Same rule as a missing folder: no engine, no buttons — not a crash.
        Engine = ChatEndpoints = None

# One engine per dataset, built the first time something asks for it. Each
# dataset owns its own claude.json and sessions.json exactly as it owns its
# own todo.md, so a chat started against one list has no business appearing
# under another — and switching lists must not lose track of the sessions
# recorded against the one just left.
_ai_chat_cache = {}


def ai_chat_for(name):
    if not Engine or not name:
        return None
    inst = _ai_chat_cache.get(name)
    if inst is None:
        engine = Engine(
            default_cwd=ROOT,
            config_path=os.path.join(dataset_dir(name), "claude.json"),
            sessions_path=os.path.join(dataset_dir(name), "sessions.json"),
        )
        inst = ChatEndpoints(engine)
        _ai_chat_cache[name] = inst
    return inst


def ai_chat_static(rel_path):
    """A file under ai_chat/interface/, or None. Kept to that one folder —
    this is a static-file route for the widget's own assets, not a general
    file server onto a sibling directory."""
    if not AI_CHAT_DIR or ".." in rel_path.split("/"):
        return None
    full = os.path.join(AI_CHAT_DIR, "interface", rel_path)
    if not os.path.isfile(full):
        return None
    return full


def work_streams_static(rel_path):
    """A file under work_streams/interface/, or None. Kept to that one folder,
    exactly like ai_chat_static above: a route for the package's own assets,
    not a way to read a sibling directory."""
    if not WORK_STREAMS_DIR or ".." in rel_path.split("/"):
        return None
    full = os.path.join(WORK_STREAMS_DIR, "interface", rel_path)
    if not os.path.isfile(full):
        return None
    return full


def plan_legacy_map():
    """The five words this stream used until 11 Sep 2026, and what each means
    now. Read out of the planning agent's own manifest so there is one copy."""
    if ws_manifest is None:
        return {}
    m, _ = ws_manifest.load(os.path.join(ROOT, "agents", "planning_agent", "stream.json"))
    return ((m or {}).get("legacy") or {}).get("map") or {}


def stream_apply(stream_id, payload):
    """Hand one transition to the stream that owns it, and return what it says.

    The board never writes another stream's files. It asks, the stream writes,
    the same split agents-dashboard/CONTRACT.md already uses for schedules. A
    stream whose command fails is one error on one card rather than a page that
    went blank.
    """
    if ws_manifest is None:
        return 503, {"ok": False, "error": "the work_streams package is not on this machine"}
    root = os.path.normpath(os.path.join(ROOT, ".."))
    for path in ws_manifest.discover(root):
        m, errors = ws_manifest.load(path)
        if m is None or m.get("id") != stream_id:
            continue
        if errors:
            return 500, {"ok": False, "error": "; ".join(errors)}
        how = (m.get("writer") or {}).get("how") or {}
        if how.get("kind") != "subprocess":
            return 400, {"ok": False, "error": "the %s stream is not written this way" % stream_id}
        cwd = os.path.normpath(os.path.join(os.path.dirname(path), how.get("cwd") or "."))
        try:
            proc = subprocess.run(how["apply"], cwd=cwd, input=json.dumps(payload),
                                  capture_output=True, text=True, timeout=30)
        except (OSError, subprocess.TimeoutExpired) as err:
            return 502, {"ok": False, "error": "%s did not answer: %s" % (stream_id, err)}
        try:
            return (200 if proc.returncode == 0 else 400), json.loads(proc.stdout or "{}")
        except ValueError:
            first = (proc.stderr or proc.stdout or "").strip().splitlines()
            return 502, {"ok": False, "error": first[0] if first else "no answer"}
    return 404, {"ok": False, "error": "no stream called %r" % stream_id}


def stream_listing():
    """Every stream manifest under ~/Code, with whatever is wrong with each.

    The errors travel with the manifest rather than being raised, so one badly
    written stream is one card saying so rather than a blank page. Same choice
    the agents dashboard makes about an agent whose state command fails.
    """
    if ws_manifest is None:
        return {"streams": [], "problem": "the work_streams package is not on this machine"}
    root = os.path.normpath(os.path.join(ROOT, ".."))
    out = []
    for path in ws_manifest.discover(root):
        m, errors = ws_manifest.load(path)
        if m is None:
            out.append({"path": path, "errors": errors})
            continue
        out.append({
            "id": m.get("id"), "name": m.get("name"), "blurb": m.get("blurb", ""),
            "path": os.path.relpath(path, root),
            "manifest": {k: v for k, v in m.items() if not k.startswith("_")},
            "lanes": ws_manifest.lanes(m),
            "ownsItsFile": ws_manifest.owns_its_file(m),
            "errors": errors,
        })
    return {"streams": out, "contract": ws_manifest.CONTRACT,
            "canonical": list(ws_manifest.CANONICAL)}


class Handler(http.server.SimpleHTTPRequestHandler):
    # Markdown as text rather than a download. The project drawer links
    # straight at the files in a project folder, and most of them are .md —
    # macOS has no mapping for it, so without this every one of those links
    # saved a file to Downloads instead of opening it in a tab.
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map[".md"] = "text/plain"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        # Only saves are worth a line. Everything else is noise.
        #
        # args[0] is a request line for a normal hit but an HTTPStatus when the
        # base class logs an error, and "in" against one of those raises — which
        # killed the connection mid-response, so the browser reported a network
        # failure instead of the 404 the server had actually decided on. Any
        # missing file became an unexplainable "Failed to fetch".
        first = args[0] if args else ""
        if isinstance(first, str) and "PUT" in first:
            sys.stdout.write("saved %s/%s/todo.md\n" % (DATA, current_dataset()))
            sys.stdout.flush()

    def _json(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        # Every read of todo.md carries the hash of what was read, so the tab
        # can hand it back on the next save and do_PUT can check content rather
        # than a second-precision timestamp. GET and HEAD both — the watcher
        # polls with HEAD and never sees a body.
        if self.command in ("GET", "HEAD") and self.path.split("?")[0].lstrip("/") == TARGET:
            digest = file_hash(todo_path())
            if digest:
                self.send_header("X-Todo-Hash", digest)
        super().end_headers()

    def translate_path(self, path):
        # Every file the board reads under /data/ — todo.md, views.md,
        # backups/*, jira.json — is asked for at a path with no dataset name
        # in it, because the board only ever knows "the current list". This is
        # the one place that fact gets resolved: swap /data/... for
        # /data/<current>/... before handing off to the normal file server.
        # GET and HEAD both funnel through here (send_head calls this), so a
        # dataset switch takes effect for every read without the board's own
        # fetch calls changing at all.
        p = path.split("?")[0]
        prefix = "/" + DATA
        if p == prefix or p.startswith(prefix + "/"):
            ds = current_dataset()
            if ds:
                rest = p[len(prefix):]
                return super().translate_path(prefix + "/" + ds + rest)
        return super().translate_path(path)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/datasets.json":
            return self._json(200, {"datasets": list_datasets(), "current": current_dataset()})
        if path == "/chat-viewed.json":
            try:
                with open(chat_viewed_path(), encoding="utf-8") as fh:
                    return self._json(200, json.load(fh))
            except (OSError, ValueError):
                # No file yet, or one written by hand and broken. Either way
                # "nothing has been opened" is the honest answer and the next
                # save fixes it.
                return self._json(200, {"version": 1, "viewed": {}})
        if path == "/attach-queue.json":
            try:
                with open(attach_queue_path(), encoding="utf-8") as fh:
                    items = json.load(fh)
                    return self._json(200, items if isinstance(items, list) else [])
            except (OSError, ValueError):
                # No file yet, or one written by hand and broken. Either way an
                # empty queue is the honest answer.
                return self._json(200, [])
        if path == "/bucket-colors.json":
            try:
                with open(bucket_colors_path(), encoding="utf-8") as fh:
                    colors = json.load(fh)
                    return self._json(200, colors if isinstance(colors, dict) else {})
            except (OSError, ValueError):
                # No file yet, or one written by hand and broken. Either way
                # every bucket falls back to its position in the list.
                return self._json(200, {})
        if path == "/reports.json":
            return self._json(200, {"reports": report_listing()})
        if path == "/projects.json":
            return self._json(200, {"projects": project_listing()})
        # One folder's contents, asked for by the project drawer alone. Kept
        # off /projects.json on purpose: the Projects view needs a count and
        # nothing else, and shipping every folder's file list to draw it would
        # be the whole of data/projects/ on every render.
        if path == "/project.json":
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(self.path).query)
            name = (q.get("name") or [""])[0]
            # A folder name and not a path: anything with a separator or a
            # parent hop in it is a way out of data/projects/.
            if not name or name.startswith(".") or "/" in name or "\\" in name:
                return self._json(400, {"error": "bad project name"})
            meta = project_meta(os.path.join(projects_dir(), name), name)
            if not meta:
                return self._json(404, {"error": "no such project"})
            meta["entries"] = project_entries(os.path.join(projects_dir(), name))
            return self._json(200, meta)
        if path == "/plans.json":
            return self._json(200, {"plans": plan_listing()})
        # The implementing agent's half. Read-only here, like every other listing:
        # what mints and moves these documents is the runs stream's own writer,
        # reached through /stream/apply.
        # Three routes rather than one, and split by how long each takes: the
        # queue is a parse of todo.md, the run is a tail of a log, and both are
        # instant. A checkout with no agents/planning_agent/ answers 404 on the queue and the
        # board simply draws one fewer column.
        if path == "/queue.json":
            got = queue_listing()
            return self._json(404 if got is None else 200,
                              got if got is not None else {"error": "no planning agent here"})
        if path == "/planning-agent.json":
            return self._json(200, planning_agent_run())
        # Every stream manifest under ~/Code, with whatever is wrong with each.
        # Read-only and read by nobody yet: the board still gets its columns
        # from 02-state.js. This is here so the views can be moved onto it one
        # at a time rather than all at once.
        if path == "/streams.json":
            return self._json(200, stream_listing())
        # Two routes rather than one, because the jobs are instant and the
        # windows are a second: the view paints the jobs and fetches the usage
        # after, instead of waiting on both.
        if path == "/schedule.json":
            return self._json(200, {"jobs": schedule_listing()})
        if path == "/usage.json":
            # ?days= is the card's range buttons. Clamped rather than trusted:
            # this walks every transcript on disk, so an unbounded span is a
            # way to make the board sit there for a minute.
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(self.path).query)
            try:
                days = int((q.get("days") or ["30"])[0])
            except ValueError:
                days = 30
            return self._json(200, usage_summary(days=max(1, min(days, 90))))
        if path == "/backups.json":
            return self._json(200, {
                "backups": backup_listing(),
                "archive": archive_info(),
                "keep": {"session": KEEP_BACKUPS, "weekly": KEEP_WEEKLY},
                "week": week_tag(),
            })
        ai_chat = ai_chat_for(current_dataset())
        # What the board asks before it draws an Ask Claude button. No
        # ai_chat module on disk, or no CLI behind it, answers the same way
        # as static hosting would: a 404, and the board draws no button.
        if ai_chat and path == "/claude.json":
            return self._json(200, ai_chat.status())
        # The whole index in one go. It is a few lines per task and the board
        # already reads whole files rather than querying them.
        if ai_chat and path == "/claude/sessions.json":
            return self._json(200, ai_chat.sessions())
        if ai_chat and path == "/claude/transcript.json":
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(self.path).query)
            got, err = ai_chat.transcript((q.get("session") or [""])[0], (q.get("cwd") or [""])[0])
            return self._json(404 if err else 200, err or got)
        # Sessions Claude Code has on disk that aren't filed here yet — the
        # drawer's "Attach a session…" reads this list.
        if ai_chat and path == "/claude/attachable.json":
            return self._json(200, ai_chat.attachable())
        # The work-item model's browser half, read straight from the package.
        # Same shape as the ai-chat block below, and the same degradation: on a
        # checkout or a deployment without PACKAGES this 404s and the board
        # carries on, which is why nothing it needs to boot comes from here.
        if path.startswith(WS_PREFIX):
            full = work_streams_static(path[len(WS_PREFIX):])
            if not full:
                return self._json(404, {"error": "not found under work_streams/interface"})
            ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
            with open(full, "rb") as fh:
                body = fh.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # The chat widget's own JS and CSS, read straight from ai_chat/ rather
        # than copied in — see AI_CHAT_DIR above.
        if ai_chat and path.startswith(STATIC_PREFIX):
            full = ai_chat_static(path[len(STATIC_PREFIX):])
            if not full:
                return self._json(404, {"error": "not found under ai_chat/interface"})
            ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
            with open(full, "rb") as fh:
                body = fh.read()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def _body(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            return None
        if length <= 0 or length > MAX_BYTES:
            return None
        return self.rfile.read(length)

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/datasets":
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            name = slugify(payload.get("name"))
            if not name:
                return self._json(400, {"error": "that name has nothing usable in it"})
            if name in list_datasets():
                return self._json(409, {"error": "there is already a list called “%s”" % name})
            create_dataset(name)
            set_current_dataset(name)
            return self._json(200, {"ok": True, "name": name,
                                    "datasets": list_datasets(), "current": name})
        if path == "/dataset/select":
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            name = str(payload.get("name") or "")
            if name not in list_datasets():
                return self._json(404, {"error": "no list called “%s”" % name})
            set_current_dataset(name)
            return self._json(200, {"ok": True, "current": name})
        ai_chat = ai_chat_for(current_dataset())
        # Both routes below are refused unless the request carries X-Board: 1.
        # Any page in any tab can POST to 127.0.0.1 — that is what CSRF is —
        # but a header a form cannot set forces a preflight this server does
        # not answer, so the request never leaves the other page. See
        # ai_chat/README.md for the rest of that story.
        if ai_chat and path == "/claude":
            if not ai_chat.guard_ok(self):
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            err = ai_chat.stream(self, payload)
            if err:
                return self._json(err[0], err[1])
            return
        if ai_chat and path == "/claude/forget":
            if not ai_chat.guard_ok(self):
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            got, err = ai_chat.forget(payload.get("owner"), payload.get("session"))
            return self._json(400 if err else 200, err or got)
        if path == "/chat-viewed":
            # Same guard as the Claude routes. Nothing here is dangerous —
            # worst case is a card reading as unread — but this server's rule is
            # that anything a page can POST carries the header, and one
            # exception is how a rule stops being a rule.
            if self.headers.get("X-Board") != "1":
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            if not isinstance(payload, dict):
                return self._json(400, {"error": "expected an object"})
            path_out = chat_viewed_path()
            os.makedirs(os.path.dirname(path_out), exist_ok=True)
            tmp = path_out + ".tmp"
            with open(tmp, "w", encoding="utf-8", newline="") as fh:
                json.dump(payload, fh, indent=2)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path_out)
            return self._json(200, {"ok": True})
        if path == "/bucket-colors":
            # Same guard, same shape as /chat-viewed: the whole map is sent and
            # written back whole, and nothing here is dangerous to get wrong —
            # worst case is a bucket in the wrong colour.
            if self.headers.get("X-Board") != "1":
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            if not isinstance(payload, dict) or len(payload) > 200:
                return self._json(400, {"error": "expected a name -> colour map"})
            for k, v in payload.items():
                if not isinstance(k, str) or not isinstance(v, str) or len(k) > 200 or len(v) > 40:
                    return self._json(400, {"error": "bad name or colour"})
            path_out = bucket_colors_path()
            os.makedirs(os.path.dirname(path_out), exist_ok=True)
            tmp = path_out + ".tmp"
            with open(tmp, "w", encoding="utf-8", newline="") as fh:
                json.dump(payload, fh, indent=2, sort_keys=True)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path_out)
            return self._json(200, {"ok": True})
        if path == "/attach-queue.json":
            # Same guard, same shape as /chat-viewed. Only the board calls this,
            # after draining what it could — see attach_queue_path() — to
            # write back whatever it could not file, or an empty list.
            if self.headers.get("X-Board") != "1":
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            if not isinstance(payload, list):
                return self._json(400, {"error": "expected an array"})
            path_out = attach_queue_path()
            os.makedirs(os.path.dirname(path_out), exist_ok=True)
            tmp = path_out + ".tmp"
            with open(tmp, "w", encoding="utf-8", newline="") as fh:
                json.dump(payload, fh, indent=2)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path_out)
            return self._json(200, {"ok": True})
        if ai_chat and path == "/claude/assign":
            if not ai_chat.guard_ok(self):
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            got, err = ai_chat.assign(
                payload.get("owner"), payload.get("session"), payload.get("to")
            )
            return self._json(400 if err else 200, err or got)
        if ai_chat and path == "/claude/note":
            if not ai_chat.guard_ok(self):
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            got, err = ai_chat.note(
                payload.get("owner"), payload.get("session"), payload.get("prompt")
            )
            return self._json(400 if err else 200, err or got)
        if ai_chat and path == "/claude/attach":
            if not ai_chat.guard_ok(self):
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            got, err = ai_chat.attach(
                payload.get("owner"), payload.get("session"),
                payload.get("cwd"), payload.get("title")
            )
            return self._json(400 if err else 200, err or got)
        # One transition, handed to whichever stream owns the item. The generic
        # route; /plan/status below is now a shim over it, kept so a board tab
        # open from before this change still works.
        if path == "/stream/apply":
            if self.headers.get("X-Board") != "1":
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            code, out = stream_apply(payload.get("stream", ""), payload)
            return self._json(code, out)
        if path == "/plan/status":
            # Same guard as every other write route: only the board asks.
            if self.headers.get("X-Board") != "1":
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            # A shim over /stream/apply since 11 Sep 2026. The five status words
            # are gone from the files; what they meant is state + owner + seen,
            # and the mapping lives in the stream's own manifest rather than
            # being written out a second time here. Kept so a board tab open
            # from before the change still works, and so nothing else that
            # learned this route breaks silently.
            legacy = plan_legacy_map()
            v = legacy.get(payload.get("status") or "")
            if not v:
                return self._json(400, {"error": "unknown status"})
            code, out = stream_apply("plans", {
                "stream": "plans",
                "item": {"group": payload.get("night"), "name": payload.get("name")},
                "to": v["state"], "owner": v["owner"], "seen": v["seen"],
                "resolution": v.get("resolution", ""), "reason": payload.get("note") or "",
            })
            return self._json(code, out)
        if path == "/planning_agent/run":
            # Spends real money, so it is guarded like every other write route
            # and confirmed in the board before it gets here.
            if self.headers.get("X-Board") != "1":
                return self._json(403, {"error": "not from the board"})
            got, err = start_planning_agent_run()
            return self._json(409 if err else 200, err or got)
        if path == "/queue/order":
            # Same guard as every other write route: only the board asks.
            if self.headers.get("X-Board") != "1":
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            got, err = set_queue_order(payload.get("order") or [],
                                       payload.get("hold") or [])
            return self._json(400 if err else 200, err or got)
        if path == "/agenda-history":
            data = self._body()
            if data is None:
                return self._json(400, {"error": "bad or empty body"})
            try:
                payload = json.loads(data.decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            text = payload.get("text") or ""
            if not text.strip():
                return self._json(400, {"error": "nothing to file"})
            name = archive_agenda(text)
            sys.stdout.write("filed a previous agenda to %s/%s/backups/%s\n" % (DATA, current_dataset(), name))
            sys.stdout.flush()
            return self._json(200, {"ok": True, "archive": name})
        if path != "/archive":
            return self._json(404, {"error": "nothing to post there"})
        data = self._body()
        if data is None:
            return self._json(400, {"error": "bad or empty body"})
        try:
            payload = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return self._json(400, {"error": "body was not valid JSON"})
        text = payload.get("text") or ""
        if not text.strip():
            return self._json(400, {"error": "nothing to archive"})
        name = archive_done(text)
        sys.stdout.write("archived finished work to %s/%s/backups/%s\n" % (DATA, current_dataset(), name))
        sys.stdout.flush()
        return self._json(200, {"ok": True, "archive": name})

    def do_PUT(self):
        if self.path.split("?")[0].lstrip("/") != TARGET:
            return self._json(404, {"error": "only %s can be written" % TARGET})

        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            return self._json(400, {"error": "bad Content-Length"})
        if length <= 0:
            return self._json(400, {"error": "empty body refused"})
        if length > MAX_BYTES:
            return self._json(413, {"error": "file too large"})

        data = self.rfile.read(length)
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            return self._json(400, {"error": "body was not valid UTF-8"})
        if "## " not in text:
            return self._json(400, {"error": "that does not look like the to-do file, refusing to write"})

        ds = current_dataset()
        path = todo_path(ds)

        # A migration is working on this list directly, with the board shut. A
        # tab left open from before it started holds the pre-migration document
        # and would put it back. See migrating_path().
        if os.path.exists(migrating_path(ds)):
            return self._json(409, {"error": "a migration is running on this list, so nothing was written",
                                    "migrating": True})

        # The tab sends back the Last-Modified it last agreed with (state.diskStamp,
        # set by rememberStamp in 24-autosave-watching.js). If the file has moved
        # since, this document was built on a version that no longer exists and
        # writing it whole would drop whatever changed in between.
        #
        # Until now there was no check of any kind here: do_PUT took a whole
        # document from any tab and replaced the file with it. That is the hole
        # both real losses went through, and the board already has a conflict
        # modal (23-conflict-modal.js) built to answer the 409.
        #
        # Second precision, because that is all Last-Modified carries. The string
        # is built the same way SimpleHTTPRequestHandler built the one the tab was
        # given, so the two compare directly without parsing either. What that
        # second cannot see is checked below, by If-Match against the content.
        # One writer per stream, checked rather than assumed. The board is the
        # writer for this list, so it takes the claim and keeps it; what this
        # refuses is a second live process writing underneath it. Advisory: a
        # claim held by a process that has gone is ignored, so a crash cannot
        # leave the board unable to save. See PACKAGES/work_streams/writer.py.
        if ws_writer is not None:
            lock = os.path.join(dataset_dir(ds), ".board.lock")
            refusal = ws_writer.refusal(lock, "the board")
            if refusal:
                return self._json(409, {"error": refusal, "locked": True})
            ws_writer.claim(lock, "the board")

        since = self.headers.get("If-Unmodified-Since")
        if not since:
            # Required, not optional. Every legitimate writer has read the file
            # first: loadFile() takes the stamp off its own GET, and a tab that
            # has not read it is in demo mode and locked, so it cannot save at
            # all. That makes a header-less PUT something no board ever sends —
            # which is exactly what an ad-hoc script or a test harness sends,
            # and those are what took the list both times.
            return self._json(428, {"error": "a write must say which version of todo.md it is replacing "
                                             "(If-Unmodified-Since); nothing was written",
                                    "precondition": True})
        if os.path.exists(path):
            current = self.date_time_string(os.stat(path).st_mtime)
            if since != current:
                return self._json(409, {"error": "todo.md changed on disk since this tab last read it",
                                        "stale": True, "disk": current,
                                        "hash": file_hash(path)})

        # And the same question asked of the content, which is the half the
        # stamp above cannot answer. Last-Modified is second-precision, so a
        # write landing in the same second as the read this document was built
        # on passes that check while replacing a file it never saw. The hash
        # does not have that blind spot.
        #
        # Checked when offered rather than demanded the way the stamp is. The
        # board always offers it — every read sets state.diskHash — so a write
        # without one is either a tab from before this landed or a script, and
        # both are already held by the 428 above. Making it required as well
        # would refuse the first save after an upgrade for no gain.
        match = self.headers.get("If-Match")
        if match and os.path.exists(path):
            digest = file_hash(path)
            if digest and match != digest:
                return self._json(409, {"error": "todo.md changed on disk since this tab last read it",
                                        "stale": True,
                                        "disk": self.date_time_string(os.stat(path).st_mtime),
                                        "hash": digest})

        backup_name = None

        # A save is also a chance to notice the week turned over.
        weekly_name = weekly_backup()

        # A write that removes tasks asks for its own backup, whether or not this
        # run has already taken one. One per session is the right amount for
        # ordinary edits and the wrong amount for the save that empties something
        # out of the file.
        forced = "backup=force" in self.path
        if forced:
            backup_made.discard(ds)

        # One backup per run, before the first write of this session.
        if ds not in backup_made and os.path.exists(path):
            stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
            backup_name = "todo-backup-%s.md" % stamp
            bdir = backup_dir(ds)
            os.makedirs(bdir, exist_ok=True)
            shutil.copy2(path, os.path.join(bdir, backup_name))
            backup_made.add(ds)
            prune_backups()

        # Write to a neighbouring temp file first, then swap it in, so a crash
        # mid-write cannot leave todo.md half-written.
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)

        # The hash of what was just written, reported rather than adopted. The
        # tab takes both halves from rememberStamp()'s own HEAD instead, so the
        # stamp and the hash it holds always describe the same read — taking
        # one from here and one from there is how they would come to disagree
        # if a second write landed in between. It is here for the suites, which
        # assert on what a write produced without a second request.
        self._json(200, {"ok": True, "bytes": len(data),
                         "backup": backup_name, "weekly": weekly_name,
                         "hash": file_hash(path)})


def main():
    os.chdir(ROOT)
    ds = current_dataset()
    if not ds:
        print("Cannot find any data set under %s/ — expected at least one folder" % DATA)
        print("with a todo.md in it, e.g. %s/twinkl/todo.md" % DATA)
        return 1
    if not os.path.exists(os.path.join(ROOT, PAGE)):
        print("Cannot find %s in %s" % (PAGE, ROOT))
        return 1

    try:
        httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError as err:
        if err.errno in (48, 98):
            # Attaching to whatever already holds the port is usually right, but
            # not always: a helper left running from days ago is an older copy of
            # this file, and the board it serves will be missing anything added
            # since. Say so here, because from the browser it looks like a bug.
            print("Port %d is already in use — the board is already running." % PORT)
            print("Opening that one: http://127.0.0.1:%d/%s" % (PORT, PAGE))
            print("")
            print("If the board is missing something that should be there, that copy is")
            print("out of date. Stop it and start this one instead:")
            print("")
            print("    lsof -ti tcp:%d | xargs kill" % PORT)
            print("")
            print("then start run.command again.")
            print("")
            webbrowser.open("http://127.0.0.1:%d/%s" % (PORT, PAGE))
            return 0
        raise

    first_weekly = weekly_backup()
    if first_weekly:
        print("weekly backup: %s/%s/backups/%s" % (DATA, ds, first_weekly))
    threading.Thread(target=weekly_backup_watcher, daemon=True).start()

    url = "http://127.0.0.1:%d/%s" % (PORT, PAGE)
    print("To-do board running at %s" % url)
    print("Leave this window open while you use the board. Press Ctrl-C to stop.")
    # If this window is ever closed without stopping first, the helper keeps
    # running with nothing attached to it — no window left to press Ctrl-C in,
    # and the next launch just opens a tab against this stale copy. Printing the
    # way out here means it is in the scrollback when it is needed.
    print("Running as process %d. If this window is gone, stop it with:" % os.getpid())
    print("    lsof -ti tcp:%d | xargs kill" % PORT)
    threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
