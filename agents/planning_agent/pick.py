#!/usr/bin/env python3
"""Which tasks tonight's run should plan.

Every open, top-level task tagged `[ai:: full]`, minus three exclusions and minus
anything already planned whose text has not changed since.

The three exclusions are the same ones companion/digest.py applies, deliberately:
two readers of one list disagreeing about what is actionable is worse than
either answer on its own.

  - Waiting for review and Blocked. The next move belongs to somebody else, so
    there is nothing to plan.
  - An unticked `blocked-by:`. The blocker is the real task.
  - A `start:` that has not arrived. It cannot begin yet.

Since 17 Sep 2026 the three are advice rather than a gate. Every task tagged
`[ai:: full]` has one card on Plans — one task, one plan — so an excluded task
is not missing from the view, it is a card in Backlog wearing the reason. Where
the card sits is the instruction, and dragging it into To do plans it tonight
regardless: that is the `force` list in `plans/queue-order.json`, which this
reads back below.

`due:` is deliberately not consulted. A deadline says when something must be
finished, not whether it is worth thinking about tonight, and CONVENTIONS.md is
explicit that a deadline never hides anything.

Order comes from the board. The Plans view shows this queue as its first column
and writes `plans/queue-order.json` when a card is dragged, so the front of the
list is what he asked for first rather than whichever bucket happens to sort
early. Cards can also be held back there, and a held task is not planned at all.

The ledger is what makes planning all of them affordable rather than a wall of
identical files every morning. Each planned task is recorded against a hash of
its own text; a task whose text has not moved, and whose last plan has not been
actioned, is skipped. So the first night plans everything and every night after
plans only what changed.

No format knowledge lives here. Everything about how todo.md is written comes
from core/todo.py, which every reader of the list shares.

    python3 agents/planning_agent/pick.py            what tonight would plan, in order
    python3 agents/planning_agent/pick.py --all      ignore the ledger
    python3 agents/planning_agent/pick.py --json     the same, for the runner
"""

import datetime as dt
import hashlib
import re
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(HERE)), "core"))
sys.path.insert(0, HERE)

import todo  # noqa: E402
import paths  # noqa: E402

PARKED = {"waiting for review", "blocked"}

# Only `[ai:: full]`. `partial` was in here until 6 Sep 2026, on the reasoning
# that a task Claude could half-do was still worth a night's research. It is
# not: the tag is his own judgement about whether the work can run mostly
# without him, and a task he has not judged that way should not be spending
# overnight capacity ahead of one he has. Narrowing this is the whole change —
# the queue ordering and the window budget below know nothing about the tag.
PLANNABLE = {"full"}

# The tags that claim Claude can do some of the work without claiming it can do
# most of it. These are the ones worth naming on the board when they are passed
# over: `ai:: none` is his own statement that the task is his, and a done,
# parked or blocked task explains itself by where it sits, so listing either
# would be noise in the "not eligible" fold.
NEARLY = {"partial"}
NOT_PLANNABLE_WHY = "tagged ai:%s, and only ai:full is planned"

# The three reasons a task in Handed to AI starts its life on Plans in Backlog
# rather than in tonight's queue. They read on the card, so each one says what
# is true of the task rather than what this file did about it.
#
# They are advice now, not a gate. Every task tagged `ai:: full` has a card on
# Plans — one task, one plan — and where that card sits is the instruction, so
# dragging it into To do plans it tonight whatever these say. That is the
# `force` list below, and it is why nothing here removes a task any more.
PARKED_WHY = "sitting in %s"
BLOCKED_WHY = "blocked by something unfinished"
STARTS_WHY = "not startable until %s"


# Tokens that say which task this is, not what it says. A fingerprint answers
# "has this changed since I last looked", so identity has no business in it:
# giving 137 tasks an id would otherwise have read as 137 changed tasks and
# spent a whole night's budget re-planning work that was already planned.
IDENTITY_TOKENS = re.compile(r"`(?:id|created):[^`]*`|\[(?:id|created)::[^\]]*\]")


def fingerprint(task):
    """A hash of the task as written, title line and notes together.

    The whole block rather than the title, because the point is to notice that
    the task has changed — a new sub-step, a rewritten note, a moved date all
    make last night's plan stale, and none of them touch the title.

    Two things are taken out first. Identity tokens, for the reason above. And
    whitespace is flattened, because reflowing a paragraph is not a change of
    mind: the improvements agent's reader has always said so in as many words,
    this one did not, and re-wrapping one note line used to cost a whole plan.
    One question deserves one answer, so both now flatten.
    """
    text = task.raw + "\n" + "\n".join(task.body)
    text = IDENTITY_TOKENS.sub("", text)
    return hashlib.sha1(" ".join(text.split()).encode("utf-8")).hexdigest()[:12]


def eligible(tasks, day, slugs=None, drops=None):
    """The tasks worth planning, before the ledger has its say.

    `drops`, when given, collects (task, why) for every exclusion the board has
    to draw: an `ai:: partial` task, which is the one worth naming in the "not
    eligible" fold, and the three below, each of which is a card in Backlog
    rather than a task off the view. A done task and an `ai:: none` one are
    neither — they are not handed over, so there is nothing on Plans to place.
    """
    slugs = slugs if slugs is not None else todo.slug_states(tasks)
    out = []
    for t in tasks:
        if t.done:
            continue
        if t.ai not in PLANNABLE:
            if (drops is not None and t.ai in NEARLY
                    and t.column.strip().lower() not in PARKED
                    and not todo.is_blocked(t, slugs)):
                drops.append((t, NOT_PLANNABLE_WHY % t.ai))
            continue
        # Past this line the task is in Handed to AI on the board, so it has a
        # card on Plans whatever happens next. Each exclusion below says why the
        # card starts in Backlog instead of in tonight's queue; none of them
        # takes the task off the view.
        if t.column.strip().lower() in PARKED:
            if drops is not None:
                drops.append((t, PARKED_WHY % t.column))
            continue
        if todo.is_blocked(t, slugs):
            if drops is not None:
                drops.append((t, BLOCKED_WHY))
            continue
        if t.start:
            start = todo.parse_date(t.start)
            if start and start > day:
                if drops is not None:
                    drops.append((t, STARTS_WHY % t.start))
                continue
        out.append(t)
    return out


def load_ledger(path=None):
    try:
        with open(path or paths.ledger_path(), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def save_ledger(ledger, path=None):
    path = path or paths.ledger_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(ledger, fh, indent=2, sort_keys=True)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


# --- the board's ordering ----------------------------------------------------
#
# The queue used to be whatever order the tasks happened to sit in todo.md,
# which is bucket order, which is not a priority. This is the board's say in it:
# `plans/queue-order.json`, written by the Plans view when a card is dragged,
# holding two lists of titles.
#
#   order  the front of the queue, in the order they should be planned
#   hold   tasks not to plan at all until they are let back in
#
# Titles rather than ids because titles are already what the ledger keys on, and
# a second identity scheme for the same tasks is a second thing to keep in step.
# Retitling a task loses its place in the order, which is the same thing it does
# to its ledger row, and costs one plan rather than anything else.
#
# Neither list is authoritative about what the queue contains. Every rule above
# still decides that; this only sorts what survives them and drops what is held.
# So a title in here that no longer exists, or that has gone Blocked since, is
# simply never matched, and there is nothing to prune.


def titles(value):
    """A list of non-empty titles, or nothing, from whatever was in the file.

    `isinstance(value, list)` rather than truthiness, because a string is
    iterable: a hand-edited file saying `"order": "Some task"` would otherwise
    come back as one entry per letter and quietly shuffle the whole queue.
    """
    if not isinstance(value, list):
        return []
    return [str(t) for t in value if str(t).strip()]


def load_order(path=None):
    try:
        with open(path or paths.order_path(), encoding="utf-8") as fh:
            got = json.load(fh)
    except (OSError, ValueError):
        return {"order": [], "hold": [], "force": []}
    if not isinstance(got, dict):
        return {"order": [], "hold": [], "force": []}
    # `force` is him having dragged a card the rules put in Backlog back into To
    # do. Absent from every file written before 17 Sep 2026, and an empty list
    # reads the same as the rules never having been overruled.
    return {"order": titles(got.get("order")), "hold": titles(got.get("hold")),
            "force": titles(got.get("force"))}


def save_order(order, path=None):
    path = path or paths.order_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    # Held and forced are the two columns, so a title cannot be in both: the
    # later write wins, and hold is the one that means leave it alone.
    hold = titles(order.get("hold"))
    held = {key(t) for t in hold}
    body = {
        "order": titles(order.get("order")),
        "hold": hold,
        "force": [t for t in titles(order.get("force")) if key(t) not in held],
        "saved": dt.datetime.now().astimezone().isoformat(timespec="minutes"),
    }
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as fh:
        json.dump(body, fh, indent=2)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
    return body


def key(title):
    return (title or "").strip().lower()


def in_order(tasks, order, today=None):
    """The queue, in the order the list's own rules say to work through it.

    Four keys, in this order, and the first three exist because the board's
    ordering cannot express them:

    1. **What he dragged.** `plans/queue-order.json` is him saying "this one
       first" in as many words, and nothing here second-guesses it. A task he
       has never ranked sorts behind every task he has, so an ordering set last
       week survives a new task appearing today.

    2. **The headline.** One task carries `headline:` and it is, by definition,
       the one that makes the others easier or unnecessary. PA.md calls it the
       one thing; planning anything ahead of it is planning the wrong task.

    3. **The date.** PA.md is explicit that a date beats a score, because the
       tasks with real dates are the people ones and their consequences land on
       somebody else. Overdue first, then soonest. Recurrence is rolled forward
       in memory by `effective_due` so a fortnightly 1:1 sorts on the meeting it
       is actually pointing at.

       This is not the same as `due:` deciding *whether* to plan something,
       which the module docstring rules out and this does not change. A deadline
       still hides nothing; it only says what to reach first when the budget
       runs out before the queue does.

    4. **Impact against effort**, highest first, straight out of
       `core/todo.py` so it is the same arithmetic the board draws. An unscored
       task scores -1 and sinks, which is right: a task nobody has scored is not
       a task anybody has said is worth a night's spend.

    Bucket is deliberately not a key at any level. The first full batch, on
    5 Sep 2026, spent its whole budget on Design System and left three buckets
    untouched, because the fallback was file order and file order is bucket
    order. Sorting by the rules rather than by the file is what mixes them: the
    buckets interleave on merit instead of one draining before the next starts.
    """
    today = today or dt.date.today()
    rank = {key(t): i for i, t in enumerate(order or [])}
    back = len(rank)

    def sort_key(t):
        due = todo.effective_due(t, today)
        return (
            rank.get(key(key_of(t)), back),
            0 if t.headline else 1,
            (due - today).days if due else 10 ** 6,
            -todo.priority_score(t),
        )

    return sorted(tasks, key=sort_key)


def is_stale(task, ledger):
    """Whether this task needs a fresh plan.

    The question is `is this mine to pick up`, asked of the ledger row's owner,
    rather than `what does the status word say`. Until 11 Sep 2026 there were
    five words and this function knew three of them by name; now there are six
    states shared by every stream, and which agent may act is `owner`.

    So: a row owned by this agent is one to plan. A row owned by the acting
    agent is a plan he has approved and which is waiting to be carried out, and
    planning the same task again tonight would spend a slot writing a second
    opinion nobody asked for and put two live plans on one task. A row owned by
    him is waiting on him, and is not ours either.

    The row is keyed by task id since the same day, so a retitle no longer loses
    it. Rows written before that are keyed by title and are read by the caller,
    which tries the id first.
    """
    seen = ledger.get(key_of(task)) or ledger.get(task.title)
    if not seen:
        return True, "never planned"
    if seen.get("fingerprint") != fingerprint(task):
        return True, "changed since %s" % seen.get("planned", "?")

    state, owner = seen.get("state"), seen.get("owner")
    if state is None:
        # A ledger written before the six states. Read the old word rather than
        # refusing, the same permanent fallback the file format keeps.
        status = seen.get("status")
        if status == "redo":
            return True, "last plan sent back"
        if status == "actioned":
            return False, "last plan actioned on %s" % seen.get("planned", "?")
        if status == "agreed":
            return False, "plan agreed on %s, waiting to be carried out" % seen.get("planned", "?")
        return False, "unchanged since %s" % seen.get("planned", "?")

    if state in ("accepted", "done"):
        # He has accepted it. That is the end of the planning half rather than a
        # reason to start it again: the plan he accepted is what the acting
        # agent carries out, and writing a second opinion over it tonight would
        # put two live plans on one task. It comes back into the queue when the
        # task's own text changes, which the fingerprint above has already
        # answered, or when he drags it back to To do.
        #
        # Both states, because they are the two halves of one answer. `accepted`
        # is a plan whose run has not finished; `done` is one whose run has.
        # Neither wants planning again, and `done` is also where every plan
        # accepted before 12 Sep 2026 still sits, since that was the word for
        # accepted until `accepted` existed.
        if seen.get("resolution") == "superseded":
            return True, "last plan was replaced"
        # Turned down outright, 13 Sep 2026 onwards. Not stale — the whole point
        # of declining is that the idea is finished, so planning it again is the
        # one thing that must not happen — but it is not "accepted" either, and
        # the board prints this line in its not-eligible fold.
        if seen.get("resolution") == "declined":
            return False, "turned down on %s" % seen.get("planned", "?")
        return False, "plan accepted on %s" % seen.get("planned", "?")
    if state == "backlog":
        return False, "parked; the agent leaves it alone"
    if state == "ready" and owner == "planning-agent":
        return True, "last plan sent back"
    if state == "ready" and owner == "implementing-agent":
        return False, "plan agreed on %s, waiting to be carried out" % seen.get("planned", "?")
    return False, "unchanged since %s" % seen.get("planned", "?")


def key_of(task):
    """What the ledger and the queue order key a task by.

    The id on the task's own line, falling back to the title for a list that
    has not been through core/migrations/mint-ids.mjs. Titles were the key
    until 11 Sep 2026, for the honest reason that no id existed and a second
    identity scheme would have been a second thing to keep in step. One exists
    now, it is written in the file, and it survives the retitle that used to
    cost a task its ledger row and its place in the queue.
    """
    return getattr(task, "stable_id", "") or task.title


def select(text, day=None, use_ledger=True, ledger=None, only=None, order=None):
    """(to plan, skipped) — skipped carries a reason for the log.

    The returned queue is in the order it will actually be worked through, which
    is the board's order first and list order behind it. That matters more than
    it looks: the batch stops on a budget, a floor or a usage limit, so the
    front of this list is the part that reliably gets planned and the back is
    the part that might not.
    """
    day = day or dt.date.today()
    tasks = todo.parse_doc(text)
    slugs = todo.slug_states(tasks)
    drops = []
    cand = eligible(tasks, day, slugs, drops=drops)

    if only:
        want = only.strip().lower()
        # Exact first, so a title that is a prefix of another still resolves.
        hit = [t for t in tasks if t.title.strip().lower() == want]
        if not hit:
            hit = [t for t in tasks if want in t.title.strip().lower()]
        return hit, []

    order = order if order is not None else load_order()
    held = {key(t) for t in order.get("hold") or []}
    forced = {key(t) for t in order.get("force") or []}

    # A card he dragged out of Backlog and into To do. The three rules in
    # eligible() are advice about where a card starts, so overruling one is him
    # saying plan it anyway — which is the whole of what the column means. Held
    # still wins, since save_order() will not write a title into both.
    rescued = [t for t, _ in drops
               if key(key_of(t)) in forced and key(key_of(t)) not in held
               and t.ai in PLANNABLE]
    rescued_keys = {key(key_of(t)) for t in rescued}
    drops = [(t, why) for t, why in drops if key(key_of(t)) not in rescued_keys]
    cand = rescued + cand
    ledger = ledger if ledger is not None else (load_ledger() if use_ledger else {})
    plan, skip = [], []
    for t in cand:
        # Held beats everything, --all included. The ledger is a cache and --all
        # exists to ignore it; this is an instruction, and ignoring it would
        # mean the one control he has over the night quietly not working.
        if key(key_of(t)) in held:
            skip.append((t, "held back from the board"))
            continue
        if not use_ledger:
            plan.append(t)
            continue
        stale, why = is_stale(t, ledger)
        (plan if stale else skip).append(t if stale else (t, why))
    return in_order(plan, order.get("order"), day), skip + drops


def _report(plan, skip):
    if not plan:
        print("Nothing to plan.")
    else:
        # Numbered and flat rather than grouped by bucket. Grouping would imply
        # the runner works bucket by bucket, and since the board started
        # ordering this queue it works straight down it.
        print("%d to plan, in order:\n" % len(plan))
        for i, t in enumerate(plan, 1):
            print("  %2d. %-14s %-8s %-40s %s" % (
                i, t.column, t.ai, t.title[:40], t.bucket))
    if skip:
        print("\n%d skipped:" % len(skip))
        for t, why in skip:
            print("    %-60s %s" % (t.title[:60], why))


def main(argv):
    with open(paths.todo_path(), encoding="utf-8") as fh:
        text = fh.read()
    only = None
    if "--task" in argv:
        only = argv[argv.index("--task") + 1]
    plan, skip = select(text, use_ledger="--all" not in argv, only=only)
    if "--json" in argv:
        print(json.dumps([{
            "title": t.title, "bucket": t.bucket, "column": t.column,
            "ai": t.ai, "slug": t.slug, "fingerprint": fingerprint(t),
            "raw": t.raw, "body": t.body,
        } for t in plan], indent=2))
        return 0
    _report(plan, skip)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
