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
the acting agent was told to set a plan's status by editing the frontmatter,
which left the ledger saying `agreed` for ever, so is_stale() held the task out
of every future night's queue and it was never planned again.

Both halves are written here, together, or neither is.
"""

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
    "ready":    ("me", "night-agent", "execution-agent"),
    "doing":    ("night-agent", "execution-agent"),
    "review":   ("me",),
    # Accepting a plan is the last move he makes on it. What happens next is the
    # run it minted, so the acting agent owns it from here, and it stays owned
    # by the agent until the work is finished rather than coming back to him to
    # be moved on a second time.
    "accepted": ("execution-agent",),
    "done":     ("me",),
}
RESOLUTIONS = ("actioned", "superseded", "dropped")
FM_KEYS = ("state", "owner", "seen", "resolution", "feedback")


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


def apply(req):
    m = _manifest()
    item = req.get("item") or {}
    night, name = item.get("group") or item.get("night"), item.get("name")
    state = req.get("to")
    owner = req.get("owner") or ("execution-agent" if state == "accepted"
                                 else "me" if state in ("review", "done", "backlog") else None)
    seen = req.get("seen")
    resolution = req.get("resolution", "")
    reason = " ".join((req.get("reason") or "").split())[:500]

    if state not in (m.get("states") or {}):
        return {"ok": False, "error": "this stream has no state %r" % state}
    if owner not in OWNERS.get(state, ()):
        return {"ok": False, "error": "%r cannot be owned by %r" % (state, owner)}
    if resolution and resolution not in RESOLUTIONS:
        return {"ok": False, "error": "unknown resolution %r" % resolution}
    if state == "done" and not resolution:
        return {"ok": False, "error": "finishing a plan needs a resolution (%s)" % ", ".join(RESOLUTIONS)}
    # A rejection with no reason is the one thing the loop cannot use: the next
    # run would plan the task again with nothing to go on and write much the
    # same plan, having spent the money twice.
    if state == "ready" and owner == "night-agent" and not reason:
        return {"ok": False, "error": "sending a plan back needs a reason"}
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", night or ""):
        return {"ok": False, "error": "bad plan reference"}
    if not name or "/" in name or not name.endswith(".md"):
        return {"ok": False, "error": "bad plan reference"}

    path = os.path.join(paths.plans_dir(), night, name)
    if not os.path.isfile(path):
        # A plan pruned into plans/actioned/ keeps its real night in its own
        # frontmatter, so it is still addressable by the night it was written.
        alt = os.path.join(paths.plans_dir(), "actioned", "%s-%s" % (night, name))
        if not os.path.isfile(alt):
            return {"ok": False, "error": "no such plan"}
        path = alt

    # One writer at a time, even though this is the only one there is: a nightly
    # run and a move from the board can land in the same second. Advisory, so a
    # run that died holding it blocks nothing. See work_streams/writer.py.
    lock = os.path.join(paths.plans_dir(), ".plans.lock")
    if ws_writer is not None:
        refusal = ws_writer.refusal(lock, "the night agent")
        if refusal:
            return {"ok": False, "error": refusal}
        ws_writer.claim(lock, "the night agent")

    text = open(path, encoding="utf-8").read()
    plan_id = (re.search(r"^id:\s*(\S+)$", text, re.M) or [None, ""])[1]
    for key, value in (("state", state), ("owner", owner),
                       ("seen", "yes" if (seen if seen is not None else True) else "no"),
                       ("resolution", resolution),
                       ("feedback", reason)):
        text = _set(text, key, value)
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
            if row.get("file") == name and row.get("night") == night:
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
