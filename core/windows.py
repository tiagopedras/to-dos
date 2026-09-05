#!/usr/bin/env python3
"""When the nightly agent is allowed to spend, and when it must keep its hands off.

Usage runs in rolling 5-hour windows. A window opens on the first request after
the previous one expired and lasts five hours, so windows are anchored to when
work starts rather than sitting on a fixed grid. That matters here for one
reason: anything spent in a window that is still alive at 07:00 is capacity
taken out of Tiago's morning.

So one test decides everything this module exists to answer:

    the window being spent in must expire by MORNING.

Which gives three answers, and no fourth:

  RIDE   a window is open and expires by 07:00. Spend in it. It costs him
         nothing, because it dies before he sits down.
  OPEN   nothing is open, and now + 5h is still before 07:00. Open a fresh one.
         The last moment that is true is 02:00, derived rather than written down.
  STOP   a window is open that survives past 07:00, or it is past 02:00 with
         nothing open. Do nothing, and say which.

The reason the RIDE case is first rather than a nicety: over the thirty nights
before this was written, 29 already had a window running between 19:00 and
07:00, opened by his own evening work, and on 13 of them there was no room at
all to open a fresh one before the cutoff. A design that woke at 02:00 and
started its own window would have done nothing on nearly half the nights. The
capacity is in the window he already opened and then leaves half unused.

Where the boundaries come from, in priority order:

  1. `window.json`, when a run has actually hit the limit. The error names the
     reset time, which is the only exact signal there is. It beats everything
     else until it expires.
  2. The timestamps in ~/.claude/projects/**/*.jsonl, greedily bucketed. Cheap,
     needs no network, and correct for anything done in Claude Code on this
     machine. It cannot see claude.ai, Chrome or mobile, so it can believe a
     window is closed when it is open.

Being wrong is safe in the direction that matters. Believing a window is closed
when it is open means opening nothing and riding what is there. Believing one is
open when it is closed costs a fresh window, and the cutoff arithmetic already
stops that happening after 02:00.

`apiBlockIndex` in the transcripts looks like it should be this and is not: it
counts blocks within one session and restarts per transcript. Do not build on it.

    python3 core/windows.py            what it would do right now
    python3 core/windows.py --history  the last 30 days, one line a window
    python3 core/windows.py --json     the same decision, for the runner
"""

import datetime as dt
import glob
import json
import os
import sys

WINDOW = dt.timedelta(hours=5)

# The morning belongs to him. Everything else here is derived from this one
# constant, including the 02:00 cutoff, so moving the boundary is a one-line
# change rather than an arithmetic hunt.
MORNING = dt.time(7, 0)

# The hours the runner is woken. Outside these it exits before doing anything at
# all, which is the guard against launchd firing a missed job on wake.
NIGHT_FROM = dt.time(19, 0)
NIGHT_TO = dt.time(6, 59)

RIDE, OPEN, STOP = "ride", "open", "stop"

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
    """
    wins = []
    for when, tok in events:
        if not wins or when >= wins[-1]["end"]:
            wins.append({"start": when, "end": when + WINDOW, "tok": 0, "turns": 0})
        wins[-1]["tok"] += tok
        wins[-1]["turns"] += 1
    return wins


def morning_after(now):
    """The next MORNING boundary. Tonight's 19:00 looks forward to tomorrow's."""
    today = dt.datetime.combine(now.date(), MORNING, now.tzinfo)
    return today if now < today else today + dt.timedelta(days=1)


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


def decide(now=None, state=None, events=None):
    """RIDE, OPEN or STOP, with the reasoning attached.

    `events` is injectable so the tests can hand it a fabricated night rather
    than depending on whatever happens to be in ~/.claude today.
    """
    now = now or dt.datetime.now().astimezone()
    morning = morning_after(now)

    # Outside the night entirely. Checked before anything is read, because this
    # is the case where launchd has fired a job missed while the lid was shut.
    t = now.timetz().replace(tzinfo=None)
    if not (t >= NIGHT_FROM or t <= NIGHT_TO):
        return {"action": STOP, "why": "outside the night window (19:00-06:59)",
                "until": None, "expires": None}

    expiry = known_expiry(state, now)
    source = "the limit's own reset time"
    if expiry is None:
        if events is None:
            events = turns(since=now - dt.timedelta(hours=12))
        wins = reconstruct(events)
        source = "estimated from transcripts"
        if wins and wins[-1]["end"] > now:
            expiry = wins[-1]["end"]

    if expiry is not None:
        if expiry <= morning:
            return {"action": RIDE,
                    "why": "a window is open until %s, %s" % (expiry.strftime("%H:%M"), source),
                    "until": None, "expires": expiry}
        # Open, but it outlives the morning boundary. Spending here is spending
        # his 07:00. Wait for it to expire and reassess then — by which point
        # the cutoff has usually passed too, and the answer becomes tomorrow.
        return {"action": STOP,
                "why": "the open window runs to %s, past %s" % (
                    expiry.strftime("%H:%M"), morning.strftime("%H:%M")),
                "until": expiry, "expires": expiry}

    # Nothing open. Opening one is only allowed if it dies before the morning.
    fresh = now + WINDOW
    if fresh <= morning:
        return {"action": OPEN,
                "why": "nothing open; a fresh window would close at %s" % fresh.strftime("%H:%M"),
                "until": None, "expires": fresh}
    return {"action": STOP,
            "why": "past the %s cutoff, a fresh window would run to %s" % (
                (morning - WINDOW).strftime("%H:%M"), fresh.strftime("%H:%M")),
            "until": None, "expires": None}


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
    # The state file lives with the nightly agent's other state, so this reaches
    # sideways for it. The module itself has no opinion about where that is —
    # every caller passes the state in — and this is only for the command line.
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    sys.path.insert(0, os.path.join(root, "nightly"))
    import paths  # noqa: E402

    state = read_state(paths.window_path())
    d = decide(state=state)
    if "--json" in argv:
        out = dict(d)
        for k in ("until", "expires"):
            out[k] = out[k].isoformat() if out[k] else None
        print(json.dumps(out))
        return 0
    print("%s — %s" % (d["action"].upper(), d["why"]))
    if d["until"]:
        print("next worth checking: %s" % d["until"].strftime("%a %H:%M"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
