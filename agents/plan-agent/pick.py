#!/usr/bin/env python3
"""Which tasks tonight's run should plan.

Every task handed to the Plan agent that has its Plan sub-task open (see
plannable() below), minus three exclusions and minus anything already planned
whose text has not changed since.

The three exclusions are the same ones companion/digest.py applies, deliberately:
two readers of one list disagreeing about what is actionable is worse than
either answer on its own.

  - Reviewing. The next move belongs to somebody else, so there is nothing to
    plan.
  - An unticked `blocked-by:`. The blocker is the real task.
  - A `start:` that has not arrived. It cannot begin yet.

They are advice, not a gate: an excluded task is reported with the reason it was
left out, and comes back the moment the reason stops being true.

`due:` is deliberately not consulted. A deadline says when something must be
finished, not whether it is worth thinking about tonight, and CONVENTIONS.md is
explicit that a deadline never hides anything.

Order is in_order()'s, the rules and not the file. There was a file of the
board's own beside it, `plans/queue-order.json`, written when a card was dragged
on the Plans view; both went on 22 Sep 2026.

The ledger is what makes planning all of them affordable rather than a wall of
identical files every morning. Each planned task is recorded against a hash of
its own text; a task whose text has not moved, and whose last plan has not been
actioned, is skipped. So the first night plans everything and every night after
plans only what changed.

No format knowledge lives here. Everything about how todo.md is written comes
from core/todo.py, which every reader of the list shares.

    python3 agents/plan-agent/pick.py            what tonight would plan, in order
    python3 agents/plan-agent/pick.py --all      ignore the ledger
    python3 agents/plan-agent/pick.py --json     the same, for the runner
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

PARKED = {"reviewing"}

# Only a task delegated to the Plan agent, `[to:: Plan agent]`. It was
# `[ai:: full]` until 21 Sep 2026, when `ai:` was retired for one field saying
# who does the work. A task with the Implement agent already says how it is to
# be done, so it is not planned. The queue ordering and the window budget below
# know nothing about the tag.
def plannable(task, slugs=None):
    """Whether the Plan agent has work on this task, and the id of the sub-task.

    Returns (yes, sub_id). A task is the Plan agent's when it has been handed to
    it, which lays out sub-tasks on the card (handOver() in the board's
    04-tier-two-the-one-thing.js), and the Plan agent's part is its Plan
    sub-task: open, assigned to it, with what it waits on ticked. Nothing else
    on the task is planned while that is not so, because a ticked Plan means the
    plan is written and a blocked one is not its turn. The mark of a handover is
    the slug it makes, the task's id and `-plan` or `-implement`; an ordinary step
    that happens to be assigned to an agent is a step it does, not a handover.

    `[to:: Plan agent]` on a task with no such sub-tasks is not planned. It was
    until 22 Sep 2026, when the Plans view went: a plan is read from the review
    behind it on the card, so a plan written for a task that was never handed over
    would have nowhere to be read. Handing it over again is what brings it back.
    `sub_id` is empty for a sub-task with no id written on its line, which cannot
    be ticked by name.
    """
    steps = [s["task"] for s in todo.split_body(task)[1]]
    made = [s for s in steps if task.stable_id and todo.agent_of(s.to)
            and re.fullmatch(re.escape(task.stable_id) + r"-(plan|implement)", s.slug or "")]
    slugs = slugs if slugs is not None else todo.slug_states([task])
    for s in made:
        if (not s.done and todo.agent_of(s.to) == todo.PLAN_AGENT
                and not todo.is_blocked(s, slugs)):
            return True, s.stable_id
    return False, ""

# The three reasons a task delegated to the Plan agent starts its life on Plans in Backlog
# rather than in tonight's queue. They read on the card, so each one says what
# is true of the task rather than what this file did about it.
#
# They are advice now, not a gate. Every task delegated to the Plan agent has a card on
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
    to draw: the three below, each of which is a card in Backlog rather than a
    task off the view. A done task and one not delegated to the Plan agent are
    neither — they are not handed over, so there is nothing on Plans to place.
    """
    slugs = slugs if slugs is not None else todo.slug_states(tasks)
    out = []
    for t in tasks:
        if t.done:
            continue
        ok, sub_id = plannable(t, slugs)
        if not ok:
            continue
        t.plan_sub = sub_id
        # Past this line the task is the Plan agent's, so it has a card on
        # Plans whatever happens next. Each exclusion below says why the
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


# --- the order ---------------------------------------------------------------
#
# The queue used to take the order a card was dragged into on the Plans view,
# stored in `plans/queue-order.json`, with two more lists beside it, one to hold a
# task back and one to overrule the rules below. That view went on 22 Sep 2026.
# Holding a task back is not handing it over, and overruling a rule is handing it
# over again, so nothing here reads a file of the board's any more: what is in the
# queue is decided by the sub-tasks on the list and the rules below, and the order
# is `in_order()`'s.


def key(title):
    return (title or "").strip().lower()


def in_order(tasks, today=None):
    """The queue, in the order the list's own rules say to work through it.

    Three keys, in this order:

    1. **The headline.** One task carries `headline:` and it is, by definition,
       the one that makes the others easier or unnecessary. PA.md calls it the
       one thing; planning anything ahead of it is planning the wrong task.

    2. **The date.** PA.md is explicit that a date beats a score, because the
       tasks with real dates are the people ones and their consequences land on
       somebody else. Overdue first, then soonest. Recurrence is rolled forward
       in memory by `effective_due` so a fortnightly 1:1 sorts on the meeting it
       is actually pointing at.

       This is not the same as `due:` deciding *whether* to plan something,
       which the module docstring rules out and this does not change. A deadline
       still hides nothing; it only says what to reach first when the budget
       runs out before the queue does.

    3. **Impact against effort**, highest first, straight out of
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

    def sort_key(t):
        due = todo.effective_due(t, today)
        return (
            0 if t.headline else 1,
            (due - today).days if due else 10 ** 6,
            -todo.priority_score(t),
        )

    return sorted(tasks, key=sort_key)


def is_stale(task, ledger):
    """Whether this task needs a fresh plan.

    Asked of the ledger row's fingerprint alone. The state a plan is in used to be
    read here too, as a plan document's `state:` and the ledger row's copy of it;
    it lives in the task's sub-tasks now, and the fingerprint hashes the task's
    whole block, so every move that matters changes it: ticking Plan when the plan
    is written, a review unticking it with a `feedback:` note, a sub-task added by
    handing the task over again. Whether the plan is owed is `plannable()`'s
    question, asked of the sub-tasks; this only says whether what the ledger
    remembers is still the task as it stands.

    The row is keyed by task id, so a retitle does not lose it. Rows written
    before that are keyed by title and are read by the caller, which tries the id
    first.
    """
    seen = ledger.get(key_of(task)) or ledger.get(task.title)
    if not seen:
        return True, "never planned"
    if seen.get("fingerprint") != fingerprint(task):
        return True, "changed since %s" % seen.get("planned", "?")
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


def select(text, day=None, use_ledger=True, ledger=None, only=None):
    """(to plan, skipped) — skipped carries a reason for the log.

    The returned queue is in the order it will actually be worked through, which
    is `in_order()`'s. That matters more than it looks: the batch stops on a
    budget, a floor or a usage limit, so the front of this list is the part that
    reliably gets planned and the back is the part that might not.
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

    ledger = ledger if ledger is not None else (load_ledger() if use_ledger else {})
    plan, skip = [], []
    for t in cand:
        if not use_ledger:
            plan.append(t)
            continue
        stale, why = is_stale(t, ledger)
        (plan if stale else skip).append(t if stale else (t, why))
    return in_order(plan, day), skip + drops


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
                i, t.column, t.to, t.title[:40], t.bucket))
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
            "to": t.to, "slug": t.slug, "fingerprint": fingerprint(t),
            "raw": t.raw, "body": t.body,
        } for t in plan], indent=2))
        return 0
    _report(plan, skip)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
