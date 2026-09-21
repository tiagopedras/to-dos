#!/usr/bin/env python3
"""The rolling 5-hour usage windows: reconstructing them, and reading them back.

Usage runs in rolling 5-hour windows. A window opens on the first request after
the previous one expired and lasts five hours, so windows are anchored to when
work starts rather than sitting on a fixed grid.

This module used to decide whether the planning agent was allowed to spend, against
one test — the window being spent in must expire by 07:00, so nothing the agent
did overnight came out of Tiago's morning. That rule was removed on 9 Sep 2026.
A window is anchored to whenever the day's first request happened to land, so it
moves every night, and a schedule cannot be set against something that lands
somewhere different each time: the same hours rode on Monday and stopped on
Tuesday for no reason visible from outside. Keeping the morning clear is done by
`agents/plan-agent/schedule.py` instead — hours, plus a floor that refuses the
working day whatever the schedule file says.

What is left here is measurement rather than permission. Two readers:
`agents/plan-agent/plan.py` asks how much of the current window is left before
it starts another task, and the board's usage chart asks what every window in
the last month spent.

Where a boundary comes from, in priority order:

  1. `window.json`, when a run has actually hit the limit. The error names the
     reset time, which is the only exact signal there is. It beats everything
     else until it expires.
  2. The timestamps in ~/.claude/projects/**/*.jsonl, greedily bucketed. Cheap,
     needs no network, and correct for anything done in Claude Code on this
     machine. It cannot see claude.ai, Chrome or mobile, so it can believe a
     window is closed when it is open.

`apiBlockIndex` in the transcripts looks like it should be this and is not: it
counts blocks within one session and restarts per transcript. Do not build on it.

    python3 core/windows.py            the window open right now, if any
    python3 core/windows.py --history  the last 30 days, one line a window
"""

import datetime as dt
import glob
import json
import os
import sys

WINDOW = dt.timedelta(hours=5)

TRANSCRIPTS = "~/.claude/projects/*/*.jsonl"


def _local(ts):
    """A UTC ISO timestamp as an aware datetime in this machine's zone."""
    return dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone()


def turns(pattern=TRANSCRIPTS, since=None):
    """Every assistant turn on disk, oldest first, as (when, tokens).

    Assistant turns only: a user message costs nothing on its own, and it is the
    request that opens a window rather than the typing.
    """
    out = []
    cut = since.isoformat() if since else None
    for path in glob.glob(os.path.expanduser(pattern)):
        try:
            fh = open(path, encoding="utf-8")
        except OSError:
            continue
        with fh:
            for line in fh:
                # Cheap reject before the JSON parse. These files run to tens of
                # thousands of lines each and most of them are not assistant
                # turns, so parsing every one costs seconds we do not need.
                if '"assistant"' not in line:
                    continue
                try:
                    d = json.loads(line)
                except ValueError:
                    continue
                if d.get("type") != "assistant":
                    continue
                ts = d.get("timestamp")
                if not ts or (cut and ts < cut):
                    continue
                u = (d.get("message") or {}).get("usage") or {}
                tok = (u.get("input_tokens", 0) + u.get("output_tokens", 0)
                       + u.get("cache_creation_input_tokens", 0)
                       + u.get("cache_read_input_tokens", 0))
                try:
                    out.append((_local(ts), tok))
                except ValueError:
                    continue
    out.sort()
    return out


def reconstruct(events):
    """Bucket turns into windows: the first turn after one expires opens the next.

    Greedy and in one pass, which is exactly how the real thing behaves. Returns
    dicts rather than a class because the only consumers are this file's own
    reporting and one caller asking for the last one.

    `shape` is the running total after each turn, as (when, cumulative). The
    decision this module exists to make never looks at it — a window's total is
    the only thing that matters to RIDE/OPEN/STOP — but the board's chart draws
    each window as a box with the spend filling in across its five hours, and
    that curve cannot be recovered from a total. It is the same numbers the
    total is made of, kept rather than thrown away. Downsample it at the edge
    that renders it; a busy window holds several hundred turns.
    """
    wins = []
    for when, tok in events:
        if not wins or when >= wins[-1]["end"]:
            wins.append({"start": when, "end": when + WINDOW, "tok": 0, "turns": 0, "shape": []})
        wins[-1]["tok"] += tok
        wins[-1]["turns"] += 1
        wins[-1]["shape"].append((when, wins[-1]["tok"]))
    return wins


def read_state(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def write_state(path, state):
    """Atomic, like every other write in this repo: temp file then replace."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(state, fh, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def known_expiry(state, now):
    """The exact expiry a limit error gave us, if it has not already passed.

    This is the one authoritative signal available, so it outranks the estimate
    entirely — but only until it expires, after which it says nothing about the
    window that came next.
    """
    raw = (state or {}).get("expires")
    if not raw:
        return None
    try:
        when = dt.datetime.fromisoformat(raw)
    except ValueError:
        return None
    if when.tzinfo is None:
        when = when.astimezone()
    return when if when > now else None


def current(now=None, state=None, events=None):
    """The window open right now, or None — no judgement attached.

    Returns `{"expires": datetime|None, "source": str}`. `events` is injectable
    so the tests can hand it a fabricated night rather than depending on
    whatever happens to be in ~/.claude today.
    """
    now = now or dt.datetime.now().astimezone()

    expiry = known_expiry(state, now)
    if expiry is not None:
        return {"expires": expiry, "source": "the limit's own reset time"}

    if events is None:
        events = turns(since=now - dt.timedelta(hours=12))
    wins = reconstruct(events)
    if wins and wins[-1]["end"] > now:
        return {"expires": wins[-1]["end"], "source": "estimated from transcripts"}
    return {"expires": None, "source": "nothing open"}


def _history(days=30):
    since = dt.datetime.now().astimezone() - dt.timedelta(days=days)
    wins = reconstruct(turns(since=since))
    if not wins:
        print("No windows found in the last %d days." % days)
        return
    print("%d windows in the last %d days\n" % (len(wins), days))
    for w in wins:
        rode = "night" if (w["start"].hour >= 19 or w["start"].hour < 7) else "     "
        print("  %s -> %s  %6.1fM tok  %5d turns  %s" % (
            w["start"].strftime("%a %d %b %H:%M"), w["end"].strftime("%H:%M"),
            w["tok"] / 1e6, w["turns"], rode))
    toks = sorted(w["tok"] for w in wins)
    print("\n  median %.0fM   p90 %.0fM   max %.0fM" % (
        toks[len(toks) // 2] / 1e6, toks[int(len(toks) * 0.9)] / 1e6, toks[-1] / 1e6))


def main(argv):
    if "--history" in argv:
        _history()
        return 0
    # The state file lives with the planning agent's other state, so this reaches
    # sideways for it. The module itself has no opinion about where that is —
    # every caller passes the state in — and this is only for the command line.
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, os.path.join(root, "agents", "plan-agent"))
    import paths  # noqa: E402

    now = dt.datetime.now().astimezone()
    win = current(now=now, state=read_state(paths.window_path()))
    if not win["expires"]:
        print("No window open right now.")
        return 0
    left = win["expires"] - now
    print("Window open until %s (%d min left), %s" % (
        win["expires"].strftime("%H:%M"), left.total_seconds() // 60, win["source"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
