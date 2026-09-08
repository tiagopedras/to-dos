#!/usr/bin/env python3
"""Logs how long a pa-* sitting took, and against which buckets.

Usage:
    python3 log_sitting.py start MARKER_PATH
    python3 log_sitting.py end MARKER_PATH LOG_PATH --buckets "People,Design System" [--skill pa-checkin]

MARKER_PATH is a small per-session file — data/<dataset>/.pa-sitting-<session>.json
is the shape every caller should use — that `start` writes and `end` reads and
removes. LOG_PATH is data/<dataset>/pa-time.json, the append-only log every
sitting's entry lands on, resolved from data/.current the same way every other
pa-* skill resolves the list itself, never guessed here.

`start` records the wall-clock moment the sitting began, from the OS rather
than from the model, since nothing in a conversation reads a live clock.
`end` reads that back, computes how long it has been, and appends one entry —
`{session, skill, started, ended, buckets}` — to LOG_PATH. The whole sitting's
duration counts against every bucket named, not a split: a pa-checkin sweep
that touches four buckets logs its full length against all four, per the
decision recorded against this entry in IMPROVEMENTS.md.

Both subcommands read CLAUDE_CODE_SESSION_ID from the environment to name the
sitting, and exit 1 without writing anything when it is unset — this only
makes sense run from inside a real Claude Code session.

`end` with no marker at MARKER_PATH is not an error: a sitting that never
called `start` (an older session, or one that skipped it) simply logs nothing
rather than guessing a start time, and says so on stderr.
"""

import argparse
import datetime
import json
import os
import sys


def now_iso():
    return datetime.datetime.now().isoformat(timespec="seconds")


def session_id(args):
    sid = (args.session or os.environ.get("CLAUDE_CODE_SESSION_ID", "")).strip()
    return sid


def cmd_start(args):
    sid = session_id(args)
    if not sid:
        print("CLAUDE_CODE_SESSION_ID is not set — this only works run from inside "
              "a Claude Code session, or with --session.", file=sys.stderr)
        return 1
    os.makedirs(os.path.dirname(os.path.abspath(args.marker_path)), exist_ok=True)
    with open(args.marker_path, "w", encoding="utf-8", newline="") as fh:
        json.dump({"session": sid, "started": now_iso()}, fh)
    return 0


def cmd_end(args):
    sid = session_id(args)
    if not sid:
        print("CLAUDE_CODE_SESSION_ID is not set — this only works run from inside "
              "a Claude Code session, or with --session.", file=sys.stderr)
        return 1

    buckets = [b.strip() for b in args.buckets.split(",") if b.strip()]
    if not buckets:
        print("no buckets named — nothing to log against", file=sys.stderr)
        return 1

    try:
        with open(args.marker_path, encoding="utf-8") as fh:
            marker = json.load(fh)
        started = marker.get("started")
    except (OSError, ValueError):
        started = None

    if not started:
        print("no start marker at %s — logging nothing rather than guessing "
              "when this sitting began" % args.marker_path, file=sys.stderr)
        return 0

    try:
        with open(args.log_path, encoding="utf-8") as fh:
            entries = json.load(fh)
        if not isinstance(entries, list):
            entries = []
    except (OSError, ValueError):
        entries = []

    entries.append({
        "session": sid,
        "skill": args.skill,
        "started": started,
        "ended": now_iso(),
        "buckets": buckets,
    })

    os.makedirs(os.path.dirname(os.path.abspath(args.log_path)), exist_ok=True)
    tmp = args.log_path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(entries, fh, indent=2)
    os.replace(tmp, args.log_path)

    try:
        os.remove(args.marker_path)
    except OSError:
        pass

    print('logged %s (%s) against %s' % (sid, args.skill or "pa", ", ".join(buckets)))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                  formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--session", default=None,
                    help="the session to log; defaults to this one, from CLAUDE_CODE_SESSION_ID")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_start = sub.add_parser("start", help="record the start of a sitting")
    p_start.add_argument("marker_path", help="data/<dataset>/.pa-sitting-<session>.json")
    p_start.set_defaults(func=cmd_start)

    p_end = sub.add_parser("end", help="close a sitting and log its duration")
    p_end.add_argument("marker_path", help="data/<dataset>/.pa-sitting-<session>.json")
    p_end.add_argument("log_path", help="data/<dataset>/pa-time.json")
    p_end.add_argument("--buckets", required=True,
                        help="comma-separated bucket names this sitting touched")
    p_end.add_argument("--skill", default=None, help="which pa-* skill this was, e.g. pa-checkin")
    p_end.set_defaults(func=cmd_end)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
