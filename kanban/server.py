#!/usr/bin/env python3
"""Tiny local server for the to-do board.

This file lives in kanban/ and serves the folder above it, so kanban/index.html
and data/todo.md are both reachable. It accepts PUT /data/todo.md so the board can
write your changes straight back, and keeps backups in data/backups/.
Listens on 127.0.0.1 only, so nothing outside this machine can reach it.

The list lives in data/ and nothing else does. That folder is the whole of what
git ignores, and it is what Obsidian opens as its vault.

Run it with run.command, or directly:  python3 kanban/server.py
"""

import datetime
import http.server
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
# Everything is served from the project root, one level up from this file.
ROOT = os.path.dirname(HERE)
# The list and everything derived from it live in one folder, and that folder is
# the only thing git ignores. Before this, the private half of the repo was four
# separate ignore rules — todo.md, backups/, todo-backup-*.md, views.md — and
# anything new had to remember to add a fifth. One folder cannot be forgotten.
# It is also what Obsidian opens as its vault, so the vault holds the list and
# nothing else: no board, no skill, no README to index.
DATA = "data"
BACKUP_DIR = os.path.join(ROOT, DATA, "backups")
TARGET = DATA + "/todo.md"
PAGE = "kanban/index.html"
PORT = 8765
MAX_BYTES = 5 * 1024 * 1024
backup_made = False


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
    if not os.path.isdir(BACKUP_DIR):
        return []
    return sorted(n for n in os.listdir(BACKUP_DIR)
                  if n.startswith(SESSION_PREFIX) and n.endswith(".md"))


def prune_backups():
    """Keep the folder small without ever touching the weekly snapshots.

    The rolling backups exist to undo the last few sessions, so ten is plenty.
    The weekly ones are the long memory and are pruned on their own, far slower
    schedule — otherwise a busy fortnight of saves would quietly delete the
    only copy of how the list looked last month.
    """
    names = backup_names()
    session = [n for n in names if not is_weekly(n)]
    weekly = [n for n in names if is_weekly(n)]
    for old in session[:-KEEP_BACKUPS] + weekly[:-KEEP_WEEKLY]:
        try:
            os.remove(os.path.join(BACKUP_DIR, old))
        except OSError:
            pass


def weekly_backup():
    """One snapshot per calendar week, the first time the board notices a new week.

    Taken whether or not anything was saved, so a week that opened with the
    board running is captured as it was before that week's edits started.
    Returns the file name if one was written, otherwise None.
    """
    path = os.path.join(ROOT, TARGET)
    if not os.path.exists(path):
        return None
    name = WEEKLY_PREFIX + week_tag() + ".md"
    dest = os.path.join(BACKUP_DIR, name)
    if os.path.exists(dest):
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    shutil.copy2(path, dest)
    prune_backups()
    return name


def weekly_backup_watcher(every=1800):
    """Check for a new week while the board runs, so crossing midnight on a
    Sunday is enough to trigger the snapshot — no save required."""
    while True:
        try:
            name = weekly_backup()
            if name:
                sys.stdout.write("weekly backup: %s/backups/%s\n" % (DATA, name))
                sys.stdout.flush()
        except OSError as err:
            sys.stdout.write("weekly backup failed: %s\n" % err)
        time.sleep(every)


ARCHIVE = "done-archive.md"


def archive_done(text):
    """Append finished work lifted out of todo.md, under a dated heading.

    A separate file rather than a reliance on the backups: a backup is a copy of
    the whole list at a moment, and every one of them is eventually pruned, so
    work archived today would quietly stop existing in twelve weeks. This file is
    never pruned and never written to by anything else — it only grows.
    """
    os.makedirs(BACKUP_DIR, exist_ok=True)
    path = os.path.join(BACKUP_DIR, ARCHIVE)
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


def archive_info():
    """The archive is not a backup and is not listed as one — it is the only file
    here that is never pruned, and it holds work that is in no current copy of
    todo.md at all."""
    path = os.path.join(BACKUP_DIR, ARCHIVE)
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
    for name in backup_names():
        full = os.path.join(BACKUP_DIR, name)
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


# ---- Running Claude from a card -------------------------------------------
#
# A prompt written on a task already had a way out of the board: Open in Claude,
# a link to claude.ai with the text sitting in the box. That is a hand-over and
# it ends there — the chat it opens runs in a tab that has never seen this
# machine, so a prompt saying "read the notes in data/projects/AOP2027" is
# asking for something the other end cannot do.
#
# Claude Code can. It is already installed, already signed in, and it runs where
# the files are. So this pipes the same prompt into it and streams the answer
# back to the card. The link stays, for when the full chat is what you wanted.
#
# Two modes, and the difference between them is the whole of the safety story:
#
#   ask    the default, and the only one that exists without a config file.
#          Bash, Edit, Write, NotebookEdit and Task are removed from the run
#          outright — not asked about, not present. It can read the folder and
#          answer; it cannot change anything. That is stronger than a permission
#          setting, because a disallowed tool never appears in Claude's tool
#          list at all, so there is nothing to be talked into using.
#
#   work   the one that does the job in full, permissions bypassed. It exists
#          only if data/claude.json says "work": true, because a button that
#          edits files across the disk should be switched on deliberately rather
#          than shipped on.
#
# Both are refused unless the request carries X-Board: 1. Any page in any tab
# can POST to 127.0.0.1 — that is what CSRF is — but a header a form cannot set
# forces a preflight this server does not answer, so the request never leaves
# the other page. It costs one header and it closes the hole.

CLAUDE_CONFIG = os.path.join(ROOT, DATA, "claude.json")

# Taken away from an ask run. Not a permission rule: the tools are not there.
ASK_DENIES = ["Bash", "Edit", "Write", "NotebookEdit", "Task"]

MAX_PROMPT = 20000
MAX_RUNS = 2            # at once — two is a follow-up while the first still talks
DEFAULT_TIMEOUT = 900   # 15 minutes, then the run is killed and says so

SESSION_ID = re.compile(r"^[0-9a-fA-F-]{36}$")

runs_lock = threading.Lock()
runs_now = 0


def claude_binary():
    """Where the CLI is, or None. None is an ordinary state: no CLI, no button."""
    return shutil.which("claude")


def claude_config():
    """data/claude.json, or the defaults. Read per request, so editing the file
    takes effect without restarting the board.

    Absent is the normal case, exactly as with data/jira.json — a fresh clone has
    no file and gets ask mode running in the repo folder, which is the harmless
    half of the feature.
    """
    raw = {}
    try:
        with open(CLAUDE_CONFIG, encoding="utf-8") as fh:
            raw = json.load(fh) or {}
    except (OSError, ValueError):
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    cwd = os.path.abspath(os.path.expanduser(str(raw.get("cwd") or ROOT)))
    if not os.path.isdir(cwd):
        cwd = ROOT
    try:
        timeout = max(30, min(3600, int(raw.get("timeout") or DEFAULT_TIMEOUT)))
    except (TypeError, ValueError):
        timeout = DEFAULT_TIMEOUT
    return {
        "cwd": cwd,
        "work": raw.get("work") is True,
        "model": str(raw["model"]) if raw.get("model") else None,
        "timeout": timeout,
    }


def claude_argv(prompt, mode, session, cfg, binary):
    argv = [binary, "-p", prompt, "--output-format", "stream-json", "--verbose"]
    if cfg["model"]:
        argv += ["--model", cfg["model"]]
    if session:
        # A follow-up carries the conversation on rather than starting one that
        # has to be told everything again.
        argv += ["--resume", session]
    if mode == "work":
        argv += ["--dangerously-skip-permissions"]
    else:
        argv += ["--permission-mode", "dontAsk", "--disallowedTools"] + ASK_DENIES
    return argv


def claude_status():
    cfg = claude_config()
    return {
        "available": bool(claude_binary()),
        "work": cfg["work"],
        "cwd": cfg["cwd"],
        "home": os.path.basename(cfg["cwd"]) or cfg["cwd"],
        "model": cfg["model"],
        "timeout": cfg["timeout"],
        "config": os.path.exists(CLAUDE_CONFIG),
    }


# ---- Which conversations belong to which task ------------------------------
#
# A task carries a `chat:` tag, and this file says which sessions sit under it.
# That is all it says. The conversations themselves are not in here and never
# were: Claude Code already writes every session to
# ~/.claude/projects/<cwd>/<id>.jsonl, and that file is what the CLI resumes
# from and what Claude Desktop imports. Copying it into data/ would have made a
# second copy that goes stale the moment a session is carried on anywhere else.
#
# So this is an index of ids, and the transcripts are read back out of the files
# Claude Code already keeps. One consequence worth knowing: clearing those files
# clears the history the board can show, and the board says so rather than
# drawing an empty conversation as though nothing was ever said.

SESSIONS_FILE = os.path.join(ROOT, DATA, "sessions.json")
CHAT_KEY = re.compile(r"^[a-z0-9]{4,12}$")
MAX_TITLE = 120
MAX_REPLAY = 20 * 1024 * 1024   # a transcript larger than this is not replayed
MAX_TURNS = 60                  # ...and only the last of these are


def sessions_read():
    try:
        with open(SESSIONS_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    chats = data.get("chats")
    return chats if isinstance(chats, dict) else {}


def sessions_write(chats):
    os.makedirs(os.path.dirname(SESSIONS_FILE), exist_ok=True)
    tmp = SESSIONS_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump({"version": 1, "chats": chats}, fh, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, SESSIONS_FILE)


def session_record(chat, session_id, title, mode, cwd):
    """Note that this session belongs to this task. Called once the CLI has told
    us its id, which is the first thing it says."""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    with runs_lock:
        chats = sessions_read()
        rows = chats.setdefault(chat, [])
        for row in rows:
            if row.get("id") == session_id:
                row["updated"] = now
                return
        rows.append({
            "id": session_id, "title": title[:MAX_TITLE],
            "started": now, "updated": now, "mode": mode, "cwd": cwd,
        })
        sessions_write(chats)


def session_touch(chat, session_id):
    with runs_lock:
        chats = sessions_read()
        for row in chats.get(chat, []):
            if row.get("id") == session_id:
                row["updated"] = datetime.datetime.now().isoformat(timespec="seconds")
                sessions_write(chats)
                return


def session_forget(chat, session_id):
    """Drops it off this task's list. The transcript itself is Claude Code's
    file and is left alone — this is the board forgetting a conversation, not
    the machine losing one."""
    with runs_lock:
        chats = sessions_read()
        rows = chats.get(chat, [])
        kept = [r for r in rows if r.get("id") != session_id]
        if len(kept) == len(rows):
            return False
        if kept:
            chats[chat] = kept
        else:
            chats.pop(chat, None)
        sessions_write(chats)
        return True


def transcript_path(session_id, cwd):
    """Where Claude Code put the session. The folder name is the working
    directory with every separator turned into a dash, which is what the CLI
    does; the search is a fallback for a session whose cwd has since moved."""
    root = os.path.expanduser(os.environ.get("CLAUDE_CONFIG_DIR") or "~/.claude")
    root = os.path.join(root, "projects")
    if cwd:
        slug = cwd.replace(os.sep, "-").replace(".", "-")
        direct = os.path.join(root, slug, session_id + ".jsonl")
        if os.path.exists(direct):
            return direct
    try:
        for name in os.listdir(root):
            guess = os.path.join(root, name, session_id + ".jsonl")
            if os.path.exists(guess):
                return guess
    except OSError:
        pass
    return None


def _text_blocks(content):
    """The human's words out of one row, or '' when the row is a tool result
    wearing a user's clothes — Claude Code files those under "user" too."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    out = []
    for block in content:
        if not isinstance(block, dict):
            continue
        if block.get("type") == "tool_result":
            return ""
        if block.get("type") == "text":
            out.append(block.get("text") or "")
    return "\n\n".join(t for t in out if t)


def transcript_read(session_id, cwd):
    """Replay a session as the turns the board draws. Reads the file Claude Code
    keeps rather than any copy of our own, so a conversation carried on in the
    terminal or in Claude Desktop comes back complete."""
    path = transcript_path(session_id, cwd)
    if not path:
        return None
    try:
        if os.path.getsize(path) > MAX_REPLAY:
            return {"turns": [], "toobig": True, "path": path}
    except OSError:
        return None

    turns = []
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                line = line.strip()
                if not line.startswith("{"):
                    continue
                try:
                    row = json.loads(line)
                except ValueError:
                    continue
                # Subagent traffic is a conversation Claude had with itself.
                if row.get("isSidechain") or row.get("isMeta"):
                    continue
                msg = row.get("message") or {}
                if row.get("type") == "user":
                    said = _text_blocks(msg.get("content"))
                    if said.strip():
                        turns.append({"ask": said, "reply": "", "tools": [],
                                      "at": row.get("timestamp") or ""})
                elif row.get("type") == "assistant" and turns:
                    turn = turns[-1]
                    for block in (msg.get("content") or []):
                        if not isinstance(block, dict):
                            continue
                        if block.get("type") == "text" and block.get("text"):
                            turn["reply"] += ("\n\n" if turn["reply"] else "") + block["text"]
                        elif block.get("type") == "tool_use":
                            turn["tools"].append({"name": block.get("name") or "",
                                                  "input": block.get("input") or {}})
    except OSError:
        return None
    return {"turns": turns[-MAX_TURNS:], "toobig": False, "path": path}


class Handler(http.server.SimpleHTTPRequestHandler):
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
            sys.stdout.write("saved %s\n" % TARGET)
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
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/backups.json":
            return self._json(200, {
                "backups": backup_listing(),
                "archive": archive_info(),
                "keep": {"session": KEEP_BACKUPS, "weekly": KEEP_WEEKLY},
                "week": week_tag(),
            })
        # What the board asks before it draws an Ask Claude button. Static
        # hosting answers this with a 404, which is the right answer there: no
        # CLI on the other end, so no button.
        if path == "/claude.json":
            return self._json(200, claude_status())
        # The whole index in one go. It is a few lines per task and the board
        # already reads whole files rather than querying them.
        if path == "/claude/sessions.json":
            return self._json(200, {"chats": sessions_read()})
        if path == "/claude/transcript.json":
            from urllib.parse import parse_qs, urlparse
            q = parse_qs(urlparse(self.path).query)
            sid = (q.get("session") or [""])[0]
            if not SESSION_ID.match(sid):
                return self._json(400, {"error": "not a session id"})
            got = transcript_read(sid, (q.get("cwd") or [""])[0])
            if got is None:
                return self._json(404, {"error": "no transcript on disk for that session"})
            return self._json(200, got)
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
        if path == "/claude":
            return self.run_claude()
        if path == "/claude/forget":
            if self.headers.get("X-Board") != "1":
                return self._json(403, {"error": "not from the board"})
            data = self._body()
            try:
                payload = json.loads((data or b"{}").decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return self._json(400, {"error": "body was not valid JSON"})
            chat = str(payload.get("chat") or "")
            sid = str(payload.get("session") or "")
            if not CHAT_KEY.match(chat) or not SESSION_ID.match(sid):
                return self._json(400, {"error": "bad chat or session id"})
            return self._json(200, {"ok": session_forget(chat, sid)})
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
        sys.stdout.write("archived finished work to %s/backups/%s\n" % (DATA, name))
        sys.stdout.flush()
        return self._json(200, {"ok": True, "archive": name})

    def _line(self, obj):
        """One NDJSON line, pushed out now rather than at the end.

        The response carries no Content-Length, so the browser reads it until
        the connection closes — which is what makes an answer appear a sentence
        at a time instead of arriving whole after two minutes of nothing.
        """
        self.wfile.write((json.dumps(obj) + "\n").encode())
        self.wfile.flush()

    def run_claude(self):
        global runs_now

        # See the note above ASK_DENIES. A form cannot set this header, so a
        # page on another origin cannot reach here without a preflight, and
        # there is no do_OPTIONS to answer one.
        if self.headers.get("X-Board") != "1":
            return self._json(403, {"error": "not from the board"})

        binary = claude_binary()
        if not binary:
            return self._json(501, {"error": "the claude CLI is not on PATH"})

        data = self._body()
        if data is None:
            return self._json(400, {"error": "bad or empty body"})
        try:
            payload = json.loads(data.decode("utf-8"))
        except (UnicodeDecodeError, ValueError):
            return self._json(400, {"error": "body was not valid JSON"})

        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            return self._json(400, {"error": "no prompt"})
        if len(prompt) > MAX_PROMPT:
            return self._json(413, {"error": "prompt too long"})

        cfg = claude_config()
        mode = "work" if payload.get("mode") == "work" else "ask"
        if mode == "work" and not cfg["work"]:
            return self._json(403, {"error": 'work mode is off — set "work": true in data/claude.json'})

        session = str(payload.get("session") or "")
        session = session if SESSION_ID.match(session) else ""

        # Which task this belongs to, and what to call it in that task's list.
        # Absent is allowed: a run with no chat key is simply not filed anywhere.
        chat = str(payload.get("chat") or "")
        chat = chat if CHAT_KEY.match(chat) else ""
        title = str(payload.get("title") or prompt).strip().replace("\n", " ")[:MAX_TITLE]

        with runs_lock:
            if runs_now >= MAX_RUNS:
                return self._json(429, {"error": "two runs already going — wait for one to finish"})
            runs_now += 1

        argv = claude_argv(prompt, mode, session, cfg, binary)
        proc = None
        killer = None
        errs = []
        try:
            try:
                proc = subprocess.Popen(
                    argv, cwd=cfg["cwd"],
                    stdin=subprocess.DEVNULL,
                    stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    text=True, bufsize=1,
                    # Its own process group, so stopping the run stops whatever
                    # Claude itself started rather than orphaning it.
                    start_new_session=True,
                )
            except OSError as err:
                return self._json(500, {"error": "could not start claude: %s" % err})

            def stop(why):
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
                except (OSError, ProcessLookupError):
                    pass
                errs.append(why)

            killer = threading.Timer(cfg["timeout"], stop, args=("timed out after %d minutes" % (cfg["timeout"] // 60),))
            killer.daemon = True
            killer.start()

            # stderr on its own thread: a full pipe nobody is draining is how a
            # subprocess ends up blocked forever with the board waiting on it.
            tail = []

            def drain():
                for line in proc.stderr:
                    tail.append(line.rstrip("\n"))
                    del tail[:-20]
            drainer = threading.Thread(target=drain, daemon=True)
            drainer.start()

            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.end_headers()

            sys.stdout.write("claude (%s) in %s\n" % (mode, cfg["cwd"]))
            sys.stdout.flush()

            self._line({"type": "board_start", "mode": mode, "cwd": cfg["cwd"],
                        "home": os.path.basename(cfg["cwd"]) or cfg["cwd"],
                        "resumed": bool(session)})

            saw_result = False
            filed = ""
            try:
                for line in proc.stdout:
                    line = line.strip()
                    if not line.startswith("{"):
                        continue
                    if '"type":"result"' in line:
                        saw_result = True
                    # The init line carries the session id, and it is the first
                    # thing the CLI says — so a run that is stopped or crashes
                    # ten seconds in is still in the task's list afterwards,
                    # with whatever was said in it readable from the transcript.
                    if chat and not filed and '"subtype":"init"' in line:
                        try:
                            sid = json.loads(line).get("session_id") or ""
                        except ValueError:
                            sid = ""
                        if SESSION_ID.match(sid):
                            filed = sid
                            session_record(chat, sid, title, mode, cfg["cwd"])
                    self.wfile.write((line + "\n").encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                # The tab was closed, or Stop was pressed. Either way nobody is
                # reading any more, so the run has no reason to carry on.
                stop("stopped")
                return

            if chat and filed:
                session_touch(chat, filed)
            code = proc.wait()
            if killer:
                killer.cancel()
            if not saw_result:
                why = errs[0] if errs else ("claude exited %d" % code)
                self._line({"type": "board_error", "text": why,
                            "detail": "\n".join(tail[-6:])})
        finally:
            if killer:
                killer.cancel()
            if proc and proc.poll() is None:
                try:
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                except (OSError, ProcessLookupError):
                    pass
            with runs_lock:
                runs_now -= 1

    def do_PUT(self):
        global backup_made
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

        path = os.path.join(ROOT, TARGET)
        backup_name = None

        # A save is also a chance to notice the week turned over.
        weekly_name = weekly_backup()

        # A write that removes tasks asks for its own backup, whether or not this
        # run has already taken one. One per session is the right amount for
        # ordinary edits and the wrong amount for the save that empties something
        # out of the file.
        forced = "backup=force" in self.path
        if forced:
            backup_made = False

        # One backup per run, before the first write of this session.
        if not backup_made and os.path.exists(path):
            stamp = datetime.datetime.now().strftime("%Y-%m-%d-%H%M%S")
            backup_name = "todo-backup-%s.md" % stamp
            os.makedirs(BACKUP_DIR, exist_ok=True)
            shutil.copy2(path, os.path.join(BACKUP_DIR, backup_name))
            backup_made = True
            prune_backups()

        # Write to a neighbouring temp file first, then swap it in, so a crash
        # mid-write cannot leave todo.md half-written.
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)

        self._json(200, {"ok": True, "bytes": len(data),
                         "backup": backup_name, "weekly": weekly_name})


def main():
    os.chdir(ROOT)
    if not os.path.exists(os.path.join(ROOT, TARGET)):
        print("Cannot find %s in %s" % (TARGET, ROOT))
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
        print("weekly backup: %s/backups/%s" % (DATA, first_weekly))
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
