#!/usr/bin/env python3
"""The runs stream's own writer — the implementing agent's half of the board.

    echo '{"item": {...}, "to": "ready", ...}' | python3 stream.py --apply
    python3 stream.py --sync        mint a run for every plan he has accepted
    python3 stream.py --list        what is in each column, for a terminal

One transition on stdin, the write performed here, `{"ok": true}` back — the
same arrangement `../planning_agent/stream.py` has, and for the same reason:
the board asks, the stream writes, and no program writes another program's
files. See PACKAGES/work_streams/CONTRACT.md.

Why a second file rather than a second state on the plan. A plan and a run are
two work items about one task, and they are in different places at the same
time: a plan he has accepted is *done* as a plan and *not started* as a run.
Carrying both on one document would mean two `state:` fields on one file, which
is the thing the contract exists to stop. So an accepted plan mints a run, the
run carries the implementing agent's state, and the plan file is never written again.

Nothing here runs anything. `--sync` mints documents and `--apply` moves them
between columns; the agent itself is invoked by the `pa-do` skill from a session
Tiago is in, which is the whole reason it is allowed to hold write tools.
"""

import datetime as dt
import json
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "planning_agent"))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..", "..", "PACKAGES", "work_streams")))
import paths                       # noqa: E402  — the planning agent's, since both hang off data/.current
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
    "backlog": ("me",),
    "ready":   ("implementing-agent",),
    "doing":   ("implementing-agent",),
    "review":  ("me",),
    "done":    ("me",),
}
RESOLUTIONS = ("actioned", "superseded", "dropped")
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"


def runs_dir():
    return os.path.join(paths.data_dir(), "runs")


def mint_id():
    """Six characters of base36, the same shape the chat keys and the task ids
    use. Minted once and written into the file, so a retitle costs nothing."""
    return "".join(random.choice(ALPHABET) for _ in range(6))


def frontmatter(path):
    """The `key: value` block at the top of a document, lowercased keys.

    Line at a time rather than through a YAML parser, deliberately: these files
    are written one line at a time and half the summaries contain a colon, so a
    parser would reflow them on the way back out.
    """
    fields = {}
    try:
        with open(path, encoding="utf-8") as fh:
            if fh.readline().strip() != "---":
                return {}
            for line in fh:
                if line.strip() == "---":
                    break
                key, _, value = line.partition(":")
                fields[key.strip().lower()] = value.strip()
    except OSError:
        return {}
    return fields


def _set(text, key, value):
    """Replace one frontmatter line, or add it, or remove it when value is ''."""
    pat = re.compile(r"^%s:.*$\n?" % re.escape(key), re.M)
    if value == "":
        return pat.sub("", text, count=1)
    line = "%s: %s\n" % (key, value)
    if pat.search(text):
        return pat.sub(line, text, count=1)
    return text.replace("---\n", "---\n" + line, 1)


def _manifest():
    if ws is None:
        return json.load(open(MANIFEST, encoding="utf-8"))
    m, errors = ws.load(MANIFEST)
    if errors:
        raise SystemExit(json.dumps({"ok": False, "error": "; ".join(errors)}))
    return m


# --- minting a run from an accepted plan -------------------------------------
#
# A plan he has accepted is `state: accepted`, the state that arrived on
# 12 Sep 2026 to say "approved, and the work it describes has not finished".
# Three older spellings still count and are read rather than refused, the same
# permanent-fallback rule the file format keeps everywhere else: `state: done`,
# which is what accepted was called until `accepted` existed and is where every
# plan accepted before that date still sits; `state: ready` owned by the acting
# agent, which is what "agreed" became on 11 Sep 2026; and `status: actioned`
# from before the states had names at all.
#
# `done` now means the run finished, which is still a plan he accepted, so it
# mints nothing new only because stream.py --sync is idempotent and the run it
# would mint already exists.


def accepted(fields):
    state, owner = fields.get("state"), fields.get("owner")
    if state in ("accepted", "done"):
        return fields.get("resolution") != "superseded"
    if state == "ready" and owner == "implementing-agent":
        return True
    if state is None:
        return fields.get("status") in ("actioned", "agreed")
    return False


def plan_files():
    """(reference, path, fields) for every plan on disk, newest night first."""
    root = paths.plans_dir()
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
            path = os.path.join(folder, name)
            fields = frontmatter(path)
            # A plan pruned into plans/actioned/ keeps its real night in its own
            # frontmatter, so the reference stays stable across the move.
            real = night
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", night):
                real = fields.get("night") or fields.get("date") or night
            out.append(("%s/%s" % (real, name), path, fields))
    return out


def runs():
    """(name, path, fields) for every run document, oldest first."""
    root = runs_dir()
    if not os.path.isdir(root):
        return []
    out = []
    for name in sorted(os.listdir(root)):
        if not name.endswith(".md") or name == "index.md" or name.startswith("."):
            continue
        path = os.path.join(root, name)
        out.append((name, path, frontmatter(path)))
    return out


def run_name(ref):
    """`2026-09-05/add-caveat.md` becomes `2026-09-05-add-caveat.md`.

    Flat rather than nested by night: a run is filed by the plan it carries out
    and there is exactly one per plan, so a folder per night would be a folder
    per file. The night stays in the name so the folder still reads in order.
    """
    night, _, name = ref.partition("/")
    return "%s-%s" % (night, name)


BODY = """
## The plan

It is in `plans/%(plan)s`. Read it there rather than from a copy — a copy is a
second thing to keep in step, and the plan is the instruction.

## What was done

_Not yet._

## What is left, and what should change on the board

_Not yet._
"""


def mint(ref, fields):
    """Write one run document for an accepted plan. Returns its name."""
    name = run_name(ref)
    path = os.path.join(runs_dir(), name)
    if os.path.exists(path):
        return None
    os.makedirs(runs_dir(), exist_ok=True)
    head = [
        "---",
        "id: %s" % mint_id(),
        "title: %s" % (fields.get("title") or fields.get("task") or name[:-3]),
        "task: %s" % fields.get("task", ""),
        "slug: %s" % fields.get("slug", ""),
        "plan: %s" % ref,
        "group: %s" % (fields.get("group") or fields.get("bucket") or ""),
        "column: %s" % fields.get("column", ""),
        "agent: implementing-agent",
        "state: backlog",
        "owner: me",
        "seen: no",
        "created: %s" % dt.date.today().isoformat(),
        "summary: %s" % fields.get("summary", ""),
        "---",
    ]
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        fh.write("\n".join(head) + "\n" + BODY % {"plan": ref})
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
    return name


def sync():
    """Mint a run for every accepted plan that has not got one.

    Idempotent, and cheap enough to call every time the view loads: it reads two
    folders of frontmatter and writes nothing when there is nothing new. That is
    what makes "Backlog is fed by everything in the Plans board's Done column"
    literally true rather than true only for plans accepted since this existed.
    """
    have = {f.get("plan") for _, _, f in runs() if f.get("plan")}
    made = []
    for ref, _path, fields in plan_files():
        if ref in have or not accepted(fields):
            continue
        name = mint(ref, fields)
        if name:
            made.append(name)
            have.add(ref)
    return made


# --- moving one between the columns ------------------------------------------


def apply(req):
    m = _manifest()
    item = req.get("item") or {}
    if req.get("op") == "sync":
        return {"ok": True, "minted": sync()}

    name = item.get("name")
    state = req.get("to")
    owner = req.get("owner") or ("me" if state in ("review", "done", "backlog") else None)
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
        return {"ok": False, "error": "finishing a run needs a resolution (%s)" % ", ".join(RESOLUTIONS)}
    # Sending work back with nothing said about what was wrong is the one move
    # the loop cannot use: the agent would do the same thing again, having spent
    # the money twice. Same rule the planning half already holds.
    if state == "ready" and not reason and req.get("again"):
        return {"ok": False, "error": "sending a run back needs a reason"}
    if not name or "/" in name or not name.endswith(".md"):
        return {"ok": False, "error": "bad run reference"}

    path = os.path.join(runs_dir(), name)
    if not os.path.isfile(path):
        return {"ok": False, "error": "no such run"}

    # One writer at a time. Advisory, so a session that died holding it blocks
    # nothing. See work_streams/writer.py.
    lock = os.path.join(runs_dir(), ".runs.lock")
    if ws_writer is not None:
        refusal = ws_writer.refusal(lock, "the implementing agent")
        if refusal:
            return {"ok": False, "error": refusal}
        ws_writer.claim(lock, "the implementing agent")

    text = open(path, encoding="utf-8").read()
    run_id = (re.search(r"^id:\s*(\S+)$", text, re.M) or [None, ""])[1]
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
    if ws_writer is not None:
        ws_writer.release(lock)
    return {"ok": True, "id": run_id, "state": state, "owner": owner}


def _report():
    m = _manifest()
    words = m.get("states") or {}
    by = {}
    for name, _path, f in runs():
        by.setdefault(f.get("state") or "backlog", []).append(f.get("title") or name)
    for state, word in words.items():
        rows = by.get(state) or []
        print("%-20s %d" % (word, len(rows)))
        for title in rows:
            print("    %s" % title[:70])


def main(argv):
    if "--sync" in argv:
        made = sync()
        print(json.dumps({"ok": True, "minted": made}))
        return 0
    if "--list" in argv:
        _report()
        return 0
    if "--apply" not in argv:
        sys.stderr.write("usage: stream.py --apply | --sync | --list\n")
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
    sys.exit(main(sys.argv[1:]))
