#!/usr/bin/env python3
"""The plans stream's own writer.

    echo '{"item": {...}, "to": "done", ...}' | python3 stream.py --apply

One transition on stdin, the write performed here, `{"ok": true}` back. See
PACKAGES/work_streams/CONTRACT.md, which this is the `subprocess` writer kind.

Why this file exists at all. Until today the board's own server held mark_plan()
and wrote these files: a second program writing another program's data, which is
exactly what agents-dashboard/CONTRACT.md refuses to do for schedules, and for
the same reason. Two writers of one file eventually give two different answers
about it, and this stream had already collected a bug of precisely that kind:
the implementing agent was told to set a plan's status by editing the frontmatter,
which left the ledger saying `agreed` for ever, so is_stale() held the task out
of every future night's queue and it was never planned again.

Both halves are written here, together, or neither is.
"""

import datetime as dt
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..", "..", "PACKAGES", "work_streams")))
import paths                       # noqa: E402
try:
    import manifest as ws
except ImportError:
    ws = None
try:
    import writer as ws_writer
except ImportError:
    ws_writer = None

MANIFEST = os.path.join(HERE, "stream.json")
# Which states may carry which owner. A transition naming a pairing that is not
# here is refused rather than written, because an item owned by nobody is an
# item nothing will ever pick up.
OWNERS = {
    "backlog":  ("me",),
    "ready":    ("me", "plan-agent", "implement-agent"),
    "doing":    ("plan-agent", "implement-agent"),
    "review":   ("me",),
    # Accepting a plan used to be the last move he made on it: what happened
    # next was the run it minted, on a board of its own, so the implementing
    # agent owned it from here. Since the two boards were folded into one on
    # 13 Sep 2026 there is no second document, and the same card comes back to
    # him the moment the agent reports — so `accepted` is owned by whichever of
    # the two is next to move, and `production` below says which that is.
    "accepted": ("implement-agent", "me"),
    "done":     ("me",),
}
# `completed` arrived with the `accepted` state on 12 Sep 2026. Until then
# `actioned` was what accepting a plan wrote, because accepting it was the only
# way a plan could reach `done`; now accepting one lands in `accepted` and
# `done` means the work has finished, so the two need telling apart on the
# files already on disk. Nothing rewrites an old `done: actioned`, so it stays
# readable as what it meant — see planColumn() in kanban/js/13-plans.js and
# core/migrations/migrate-plans-accepted.py, which tidies it if he wants it
# tidied.
# `declined` arrived 13 Sep 2026: a plan he read and turned down outright. Until
# then the only ways to say no were Plan it again, which sends the task round for
# a second opinion he never asked for, and Leave it alone, which drops it in
# Backlog reading as undecided. A resolution rather than an eighth state, because
# `done` already closes an item with `resolution` saying how.
RESOLUTIONS = ("actioned", "completed", "superseded", "dropped", "declined")

# How far the implementing agent's half has got, on a plan he accepted. A second
# field rather than more states, because the contract allows one `state:` per
# document and this answers a different question about the same one: `state`
# says where the plan is, `production` says what has happened to the work it
# describes. It is what the runs stream was, before that stream was folded into
# this one on 13 Sep 2026 and its documents were merged onto their plans.
#
# Six columns on Plans rather than eight was the decision that goes with it, so
# these are read off the card. If the implementing agent ever runs unattended,
# these are what the two extra columns would be drawn from.
PRODUCTION = ("none", "doing", "review", "done")
FM_KEYS = ("state", "owner", "seen", "resolution", "feedback", "production")


def _manifest():
    if ws is None:
        return json.load(open(MANIFEST, encoding="utf-8"))
    m, errors = ws.load(MANIFEST)
    if errors:
        raise SystemExit(json.dumps({"ok": False, "error": "; ".join(errors)}))
    return m


def _set(text, key, value):
    """Replace one frontmatter line, or add it, or remove it when value is ''.

    Line at a time rather than through a YAML writer, deliberately: these files
    are written one `key: value` line at a time and half the summaries contain a
    colon, so a parser would reflow them.
    """
    pat = re.compile(r"^%s:.*$\n?" % re.escape(key), re.M)
    if value == "":
        return pat.sub("", text, count=1)
    line = "%s: %s\n" % (key, value)
    if pat.search(text):
        return pat.sub(line, text, count=1)
    return text.replace("---\n", "---\n" + line, 1)


# The shape of a History line the board writes, as against the two plan.py
# writes. One date, one revision, and the rest is prose — the same grammar
# history_entry() in kanban/server.py parses, so a line written here reads in
# the modal exactly as a line written by the runner does.
#
# The board is a second writer of this section as of 17 Sep 2026, and that is a
# real change: History belonged to the runner because it spans revisions and an
# agent only ever sees one. What the board adds is not a revision — it is what
# he said about one, which the runner cannot know, and it carries the revision
# number the plan already holds rather than minting a new one.
BOARD_HISTORY = {
    "accepted": "Accepted by `me`%s.",
    "ready": "Sent back by `me`%s.",
    "done": "Turned down by `me`%s.",
}


def _append_history(text, line):
    """Put one line at the end of the plan's own History section.

    At the end of the file when the section is last, which it is in every plan
    the runner writes. A plan with no History section at all gets one, so a
    hand-written plan is not a special case.
    """
    if "\n## History" not in text:
        return text.rstrip("\n") + "\n\n## History\n\n" + line + "\n"
    head, _, rest = text.partition("\n## History")
    body, nl, after = rest.partition("\n## ")
    body = body.rstrip("\n") + "\n" + line + "\n"
    return head + "\n## History" + body + (nl + after if nl else "")


def apply(req):
    m = _manifest()
    item = req.get("item") or {}
    name = item.get("name")
    state = req.get("to")
    owner = req.get("owner") or ("implement-agent" if state == "accepted"
                                 else "me" if state in ("review", "done", "backlog") else None)
    seen = req.get("seen")
    resolution = req.get("resolution", "")
    # What he has to say about the plan. It was a sentence typed into a box and
    # 500 characters was plenty; since 17 Sep 2026 it can also be a whole
    # conversation he had about the plan in the board's chat window, which is
    # the same thing at a different length — see the Chat button in
    # kanban/js/13-plans.js. So the cap is 4000 rather than 500.
    #
    # Still one flattened line. `feedback:` is read back by a regex on a single
    # frontmatter line in three places (plan_meta() in kanban/server.py, the
    # /do skill, implement-agent.md), and a block scalar would be a format
    # change all three would have to learn at once for no gain a reader can
    # see.
    reason = " ".join((req.get("reason") or "").split())[:4000]
    # Absent means "leave it as it is", which is not the same as "none" — a move
    # that is not about production must not reset it.
    production = req.get("production")

    if state not in (m.get("states") or {}):
        return {"ok": False, "error": "this stream has no state %r" % state}
    if owner not in OWNERS.get(state, ()):
        return {"ok": False, "error": "%r cannot be owned by %r" % (state, owner)}
    if resolution and resolution not in RESOLUTIONS:
        return {"ok": False, "error": "unknown resolution %r" % resolution}
    if production is not None and production not in PRODUCTION:
        return {"ok": False, "error": "unknown production stage %r" % production}
    if production is not None and state != "accepted" and production != "done":
        return {"ok": False, "error":
                "production only means something on an accepted plan (or on done, once finished)"}
    if state == "done" and not resolution:
        return {"ok": False, "error": "finishing a plan needs a resolution (%s)" % ", ".join(RESOLUTIONS)}
    # A rejection with no reason is the one thing the loop cannot use: the next
    # run would plan the task again with nothing to go on and write much the
    # same plan, having spent the money twice.
    if state == "ready" and owner == "plan-agent" and not reason:
        return {"ok": False, "error": "sending a plan back needs a reason"}
    # Same rule, different direction: a declined plan is the end of the idea, and
    # the reason is the only thing left of it worth reading.
    if resolution == "declined" and not reason:
        return {"ok": False, "error": "turning a plan down needs a reason"}
    if not name or "/" in name or not name.endswith(".md"):
        return {"ok": False, "error": "bad plan reference"}

    # One file per task, flat under plans_dir() — no night to resolve through
    # and no separate archive a plan could have been moved into.
    path = os.path.join(paths.plans_dir(), name)
    if not os.path.isfile(path):
        return {"ok": False, "error": "no such plan"}

    # One writer at a time, even though this is the only one there is: a nightly
    # run and a move from the board can land in the same second. Advisory, so a
    # run that died holding it blocks nothing. See work_streams/writer.py.
    lock = os.path.join(paths.plans_dir(), ".plans.lock")
    if ws_writer is not None:
        refusal = ws_writer.refusal(lock, "the planning agent")
        if refusal:
            return {"ok": False, "error": refusal}
        ws_writer.claim(lock, "the planning agent")

    text = open(path, encoding="utf-8").read()
    plan_id = (re.search(r"^id:\s*(\S+)$", text, re.M) or [None, ""])[1]
    writes = [("state", state), ("owner", owner),
              ("seen", "yes" if (seen if seen is not None else True) else "no"),
              ("resolution", resolution),
              ("feedback", reason)]
    # What he said about this plan, on the record beside the revisions rather
    # than only in the frontmatter — the frontmatter holds the latest one, and
    # History is what makes a plan on its third revision readable.
    said = ""
    if reason and state in BOARD_HISTORY:
        rev = (re.search(r"^revision:\s*(\d+)$", text, re.M) or [None, "1"])[1]
        kind = " after a conversation" if len(reason) > 240 else ""
        said = "- **%s, revision %s.** %s %s" % (
            dt.date.today().isoformat(), rev, BOARD_HISTORY[state] % kind, reason)
    # Newly accepted with nothing said about production is the start of the
    # agent's half, so it starts at `none` rather than at whatever the field
    # happened to hold before.
    if production is None and state == "accepted" and not re.search(r"^production:", text, re.M):
        production = "none"
    if production is not None:
        writes.append(("production", production))
    for key, value in writes:
        text = _set(text, key, value)
    if said:
        text = _append_history(text, said)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)

    # And the ledger, in the same call. The board reads the file and the picker
    # reads the ledger, neither is derivable from the other, and a writer that
    # did one of them is the bug this file was written to remove.
    lpath = paths.ledger_path()
    try:
        rows = json.load(open(lpath, encoding="utf-8"))
    except (OSError, ValueError):
        rows = None
    touched = 0
    if isinstance(rows, dict):
        for _, row in rows.items():
            if not isinstance(row, dict):
                continue
            if row.get("file") == name:
                row.update({"state": state, "owner": owner, "resolution": resolution,
                            "seen": bool(seen) if seen is not None else True})
                row.pop("status", None)
                touched += 1
        tmp = lpath + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="") as fh:
            json.dump(rows, fh, indent=2)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, lpath)
    if ws_writer is not None:
        ws_writer.release(lock)
    return {"ok": True, "id": plan_id, "state": state, "owner": owner, "ledger_rows": touched}


def main():
    if "--apply" not in sys.argv:
        sys.stderr.write("usage: stream.py --apply  (one transition on stdin)\n")
        return 2
    try:
        req = json.load(sys.stdin)
    except ValueError as err:
        print(json.dumps({"ok": False, "error": "stdin was not JSON: %s" % err}))
        return 1
    out = apply(req)
    print(json.dumps(out))
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
