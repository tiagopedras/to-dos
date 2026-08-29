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
import mimetypes
import os
import shutil
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


# ---- Claude, on a task -----------------------------------------------------
#
# The engine that runs Claude Code and the index of which sessions sit under
# which task now live one level up, in ai_chat/ — a module any local tool can
# load, not just this one. See ai_chat/README.md for the HTTP contract this
# wires up below, and ai_chat/engine.py for what it actually does: run the
# CLI, stream its output, and read a transcript back from the file Claude
# Code itself writes.
#
# A prompt written on a task already had a way out of the board before any of
# this: Open in Claude, a link to claude.ai with the text sitting in the box.
# That is a hand-over and it ends there — the chat it opens runs in a tab that
# has never seen this machine. AI_CHAT_DIR below is where the module that
# fixes that lives; STATIC_PREFIX is where its own JS and CSS are served from.

AI_CHAT_DIR = os.path.normpath(os.path.join(ROOT, "..", "ai_chat"))
STATIC_PREFIX = "/ai-chat/"

ai_chat = None
if os.path.isdir(AI_CHAT_DIR):
    sys.path.insert(0, AI_CHAT_DIR)
    try:
        from engine import Engine          # noqa: E402  (path set just above)
        from http_glue import ChatEndpoints  # noqa: E402

        engine = Engine(
            default_cwd=ROOT,
            config_path=os.path.join(ROOT, DATA, "claude.json"),
            sessions_path=os.path.join(ROOT, DATA, "sessions.json"),
        )
        ai_chat = ChatEndpoints(engine)
    except ImportError:
        # ai_chat exists but is missing a file, or is an incompatible version.
        # Same rule as a missing folder: no engine, no buttons — not a crash.
        ai_chat = None


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
