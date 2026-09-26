"""The guard around an unattended run of types 1 to 5: what it may leave behind.

A write-up, a draft, a prompt, working data or a deck may only add new files to
one project folder. The tool list already says so (hooks.options() grants Write
and Edit on that folder alone), and this checks afterwards anyway, the same way
the Plan agent hashes todo.md rather than trusting its tool list.

Before the run the folder is photographed and every file in it copied aside.
After it, anything the agent changed or removed is put back from the copy, and
its version is set aside under `_set-aside-<date>/` in the same folder, so no
work is lost and nothing he had is overwritten. A new version of a file belongs
beside it as `name-v2.md`, which `next_version()` names.

Outside the folder, the dataset folder is watched too, less a few files the
board and the queues write on their own. A new file there is moved into the
set-aside folder. A changed one cannot be put back, since only the project
folder was copied, so it is copied aside and reported, and the run stops.
"""

import hashlib
import os
import shutil
import tempfile

# Past these the folder is too big to copy aside before a run, and a run that
# could not be undone is not one to start.
MAX_FILES = 2000
MAX_BYTES = 200 * 1024 * 1024

# Never walked: git's own store, and dependency folders nobody writes by hand.
SKIP_DIRS = {".git", "node_modules", "__pycache__"}

# In the dataset folder, written by something other than this agent while it
# runs: the queues the board drains, its own backups, and every lock.
OUTSIDE_IGNORED = ("tick-queue.json", "attach-queue.json", "backups/", "todo.md.tmp")

SET_ASIDE = "_set-aside-%s"


class TooBig(Exception):
    pass


def _walk(root, skip=()):
    """Every regular file under `root`, as paths relative to it."""
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        # A folder of set-aside work is the harness's own, from this run or an
        # earlier one, and never part of what the agent did.
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith("_set-aside-")]
        for name in filenames:
            full = os.path.join(dirpath, name)
            if os.path.islink(full) or not os.path.isfile(full):
                continue
            rel = os.path.relpath(full, root)
            if any(rel == s.rstrip("/") or rel.startswith(s) for s in skip if s.endswith("/")) \
                    or rel in skip or name.endswith(".lock"):
                continue
            out.append(rel)
    return out


def _digest(path):
    h = hashlib.sha1()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def _stat(path):
    st = os.stat(path)
    return "%d:%d" % (st.st_size, st.st_mtime_ns)


def snapshot(root, skip=(), quick=False):
    """{relative path: fingerprint} for every file under root. Content hashes for
    the project folder; size and mtime for the dataset folder around it, which
    holds every other project and is only asked whether anything moved."""
    if not os.path.isdir(root):
        return {}
    how = _stat if quick else _digest
    return {rel: how(os.path.join(root, rel)) for rel in _walk(root, skip)}


def before(folder, watch=None):
    """Photograph the project folder, copy it aside, and photograph `watch`.

    Returns the state `after()` needs. `watch` is the dataset folder, whose
    photograph leaves out the project folder when it sits inside it.
    """
    os.makedirs(folder, exist_ok=True)
    files = _walk(folder)
    total = sum(os.path.getsize(os.path.join(folder, f)) for f in files)
    if len(files) > MAX_FILES or total > MAX_BYTES:
        raise TooBig("the project folder holds %d files (%d MB), too many to copy aside before a run"
                     % (len(files), total // (1024 * 1024)))
    backup = tempfile.mkdtemp(prefix="implement-backup-")
    for rel in files:
        dst = os.path.join(backup, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(folder, rel), dst)
    state = {"folder": folder, "backup": backup, "files": snapshot(folder), "watch": watch, "outside": {}}
    if watch:
        state["outside"] = snapshot(watch, _outside_skip(folder, watch), quick=True)
    return state


def _outside_skip(folder, watch):
    skip = list(OUTSIDE_IGNORED)
    real_f, real_w = os.path.realpath(folder), os.path.realpath(watch)
    if real_f != real_w and os.path.commonpath([real_f, real_w]) == real_w:
        skip.append(os.path.relpath(real_f, real_w) + "/")
    return skip


def next_version(path):
    """`name-v2.md` beside `name.md`, or the first `-vN` not yet taken."""
    base, ext = os.path.splitext(path)
    n = 2
    while os.path.exists("%s-v%d%s" % (base, n, ext)):
        n += 1
    return "%s-v%d%s" % (base, n, ext)


def after(state, day, revert_new=False):
    """Put back what the agent was not allowed to do, and say what that was.

    Returns a dict: `added` (new files left in the folder), and the breaches,
    each a list of relative paths: `overwritten`, `removed` (both put back),
    `outside_new` (moved aside), `outside_changed` (copied aside, not put back)
    and `todo` (todo.md changed, which is left alone: the board is its writer).
    `revert_new` also moves every new file aside, for a run that failed part
    way or said it did nothing.
    """
    folder, backup = state["folder"], state["backup"]
    aside = os.path.join(folder, SET_ASIDE % day.isoformat())
    now = snapshot(folder)
    was = state["files"]
    out = {"added": [], "overwritten": [], "removed": [], "outside_new": [], "outside_changed": [],
           "todo": False, "aside": aside}

    def put_aside(src, rel, move=True):
        dst = os.path.join(aside, rel)
        if os.path.exists(dst):
            dst = next_version(dst)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        (shutil.move if move else shutil.copy2)(src, dst)

    for rel, digest in sorted(now.items()):
        full = os.path.join(folder, rel)
        if rel not in was:
            if revert_new:
                put_aside(full, rel)
            else:
                out["added"].append(rel)
        elif digest != was[rel]:
            put_aside(full, rel)
            shutil.copy2(os.path.join(backup, rel), full)
            out["overwritten"].append(rel)
    for rel in sorted(was):
        if rel not in now:
            dst = os.path.join(folder, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(os.path.join(backup, rel), dst)
            out["removed"].append(rel)

    watch = state.get("watch")
    if watch:
        then = state["outside"]
        now_out = snapshot(watch, _outside_skip(folder, watch), quick=True)
        for rel, digest in sorted(now_out.items()):
            if rel == "todo.md":
                out["todo"] = digest != then.get(rel)
                continue
            if rel not in then:
                put_aside(os.path.join(watch, rel), os.path.join("outside", rel))
                out["outside_new"].append(rel)
            elif digest != then[rel]:
                put_aside(os.path.join(watch, rel), os.path.join("outside", rel), move=False)
                out["outside_changed"].append(rel)
    shutil.rmtree(backup, ignore_errors=True)
    return out


def breaches(report):
    """The guard's findings as sentences, empty when the run stayed inside its rules."""
    said = []
    if report["overwritten"]:
        said.append("wrote over %s (put back; its version is set aside)" % ", ".join(report["overwritten"][:5]))
    if report["removed"]:
        said.append("removed %s (put back)" % ", ".join(report["removed"][:5]))
    if report["outside_new"]:
        said.append("wrote outside the project folder, %s (moved aside)" % ", ".join(report["outside_new"][:5]))
    if report["outside_changed"]:
        said.append("changed %s outside the project folder, which could not be put back"
                    % ", ".join(report["outside_changed"][:5]))
    if report["todo"]:
        said.append("todo.md changed during the run")
    return said


def discard(state):
    """Throw the copy away without checking, when the run never started."""
    shutil.rmtree(state.get("backup") or "", ignore_errors=True)
