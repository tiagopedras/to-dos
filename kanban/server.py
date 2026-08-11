#!/usr/bin/env python3
"""Tiny local server for the to-do board.

This file lives in kanban/ and serves the folder above it, so kanban/kanban.html
and todo.md at the project root are both reachable. It accepts PUT /todo.md so the
board can write your changes straight back, and keeps backups in backups/.
Listens on 127.0.0.1 only, so nothing outside this machine can reach it.

Run it with board.command, or directly:  python3 kanban/server.py
"""

import datetime
import http.server
import json
import os
import shutil
import socket
import sys
import threading
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
# Everything is served from the project root, one level up from this file.
ROOT = os.path.dirname(HERE)
BACKUP_DIR = os.path.join(ROOT, "backups")
TARGET = "todo.md"
PAGE = "kanban/kanban.html"
PORT = 8765
MAX_BYTES = 5 * 1024 * 1024
backup_made = False


KEEP_BACKUPS = 10


def prune_backups():
    """Keep only the most recent backups so the folder does not fill up."""
    names = sorted(n for n in os.listdir(BACKUP_DIR)
                   if n.startswith("todo-backup-") and n.endswith(".md"))
    for old in names[:-KEEP_BACKUPS]:
        try:
            os.remove(os.path.join(BACKUP_DIR, old))
        except OSError:
            pass


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if "PUT" in (args[0] if args else ""):
            sys.stdout.write("saved todo.md\n")

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

    def do_PUT(self):
        global backup_made
        if self.path.split("?")[0].lstrip("/") != TARGET:
            return self._json(404, {"error": "only todo.md can be written"})

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

        self._json(200, {"ok": True, "bytes": len(data), "backup": backup_name})


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
            print("Port %d is already in use — the board may already be running." % PORT)
            print("Open http://127.0.0.1:%d/%s" % (PORT, PAGE))
            webbrowser.open("http://127.0.0.1:%d/%s" % (PORT, PAGE))
            return 0
        raise

    url = "http://127.0.0.1:%d/%s" % (PORT, PAGE)
    print("To-do board running at %s" % url)
    print("Leave this window open while you use the board. Press Ctrl-C to stop.")
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
