#!/usr/bin/env python3
"""Writes one entry onto the attach queue.

Usage:
    python3 attach_session.py QUEUE_PATH --title "Exact task title" [--cwd PATH]

QUEUE_PATH is data/<dataset>/attach-queue.json — resolved by the skill from
data/.current the same way every other pa-* skill resolves the list itself,
never guessed here.

Reads the session id from CLAUDE_CODE_SESSION_ID, which Claude Code sets in
the environment of every session, and the working directory from the current
process unless --cwd overrides it — the board needs both to find this
session's transcript again later. Appends rather than replaces: the board
drains and clears this file on its next load (see attach_queue_path() in
kanban/server.py), so a queue this script finds non-empty is one the board
has not opened since the last attach, and the new entry joins whatever is
already waiting rather than overwriting it.

Exits 1, and writes nothing, when CLAUDE_CODE_SESSION_ID is unset — this only
makes sense run from inside a real Claude Code session.
"""

import argparse
import datetime
import json
import os
import sys


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("queue_path", help="data/<dataset>/attach-queue.json")
    ap.add_argument("--title", required=True, help="the task's exact title, as it stands in todo.md")
    ap.add_argument("--cwd", default=None, help="defaults to the current working directory")
    args = ap.parse_args()

    session_id = os.environ.get("CLAUDE_CODE_SESSION_ID", "").strip()
    if not session_id:
        print("CLAUDE_CODE_SESSION_ID is not set — this only works run from inside "
              "a Claude Code session.", file=sys.stderr)
        return 1

    title = args.title.strip()
    if not title:
        print("no task title given", file=sys.stderr)
        return 1

    try:
        with open(args.queue_path, encoding="utf-8") as fh:
            items = json.load(fh)
        if not isinstance(items, list):
            items = []
    except (OSError, ValueError):
        items = []

    items.append({
        "session": session_id,
        "cwd": args.cwd or os.getcwd(),
        "title": title,
        "queued": datetime.datetime.now().isoformat(timespec="seconds"),
    })

    os.makedirs(os.path.dirname(os.path.abspath(args.queue_path)), exist_ok=True)
    tmp = args.queue_path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(items, fh, indent=2)
    os.replace(tmp, args.queue_path)

    print('queued %s under "%s" — the board files it on its next load' % (session_id, title))
    return 0


if __name__ == "__main__":
    sys.exit(main())
