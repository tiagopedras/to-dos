#!/usr/bin/env python3
"""The companion's policy, tested without an app bundle in the way.

`digest.py` is deliberately the half with no AppKit in it, so everything worth
checking here can be checked at a terminal: which tasks are owed, which messages
are still waiting, and what the notification queue does with what it is given.

The menu drawing in app.py is not covered and does not need to be — it is a
handful of NSMenuItem calls over these answers.

    python3 companion/test_companion.py
"""

import datetime as dt
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "core"))
sys.path.insert(0, HERE)

import digest  # noqa: E402
import notify  # noqa: E402

FAILED = []


def check(name, got, want):
    if got != want:
        FAILED.append("%s\n    got  %r\n    want %r" % (name, got, want))


DAY = dt.date(2026, 9, 7)          # a Monday

DOC = """# List

## 1. People

### Doing

- [ ] **Live task** [impact:: high] [effort:: M] [ai:: none]
  - [ ] Chase the nominees [due:: 2026-09-08] [ai:: none]
    - Suggested message: "Hey 👋 Could you fill in the form?"
  - [ ] Share with Anu [due:: 2026-09-10] [ai:: none]
    - Suggested message (draft): "Hey Anu 👋 Needs editing first."
  - [x] Already sent [ai:: none]
    - Suggested message: "This one has gone."

- [ ] **Undated one** [impact:: med] [effort:: S] [ai:: none]
  - [ ] Ask about the form [ai:: none]
    - Suggested message: "Hey 👋 Quick one about the form."

- [ ] **Waiting on a blocker** [impact:: high] [effort:: S] [ai:: none] `blocked-by:gate`
  - [ ] Ask them [ai:: none]
    - Suggested message: "Blocked, so not ready."

- [ ] **Not startable yet** [impact:: high] [effort:: S] [ai:: none] `start:2099-01-01`
  - [ ] Ask them [due:: 2026-09-09] [ai:: none]
    - Suggested message: "Too early."

### Waiting review

- [ ] **Sitting with somebody** [impact:: high] [effort:: S] [ai:: none]
  - [ ] Nudge them [due:: 2026-09-08] [ai:: none]
    - Suggested message: "With someone else, so not mine to send."

### To do

- [ ] **The gate** [impact:: high] [effort:: S] [ai:: none] `#gate`
"""


def test_messages():
    got = digest.read_messages(DOC, DAY)
    check("only the sendable ones, soonest first, undated last",
          [m["where"] for m in got],
          ["Chase the nominees", "Share with Anu", "Ask about the form"])
    check("a draft is marked", [m["draft"] for m in got], [False, True, False])
    check("and carries the step's own date",
          [m["due"] for m in got], ["2026-09-08", "2026-09-10", ""])

    # Dismissing is by content, so re-ordering the file cannot resurrect one and
    # rewording a message deliberately brings it back.
    key = got[0]["key"]
    fewer = digest.read_messages(DOC, DAY, dismissed={key})
    check("a dismissed message stays hidden",
          [m["where"] for m in fewer], ["Share with Anu", "Ask about the form"])

    reworded = DOC.replace("Could you fill in the form?", "Could you fill the form in?")
    back = digest.read_messages(reworded, DAY, dismissed={key})
    check("rewording it brings it back",
          [m["where"] for m in back],
          ["Chase the nominees", "Share with Anu", "Ask about the form"])

    # Same key from the same content, every time, or dismissal is useless.
    check("the key is stable", digest.read_messages(DOC, DAY)[0]["key"], key)


def test_digest_line():
    d = digest.Digest(DAY)
    check("a quiet day says so", d.line(), "Nothing due today")
    d.messages = [1, 2]
    check("messages are counted into the line", d.line(), "2 to send")


def test_notify_queue():
    tmp = tempfile.mkdtemp(prefix="notify-test-")
    real = notify.ROOT
    notify.ROOT = tmp
    try:
        os.makedirs(os.path.join(tmp, "data", "x"))
        notify.queue("Night agent", "3 plans waiting", dataset="x")
        notify.queue("Night agent", "and another", dataset="x")
        with open(notify.queue_path("x"), encoding="utf-8") as fh:
            items = json.load(fh)
        check("both are queued, in order",
              [i["body"] for i in items], ["3 plans waiting", "and another"])
        check("each carries a timestamp", all("queued" in i for i in items), True)

        # A queue nobody drains means the companion is not running. It is capped
        # so that comes back as the last few lines rather than a month at once.
        for i in range(40):
            notify.queue("t", "body %d" % i, dataset="x")
        with open(notify.queue_path("x"), encoding="utf-8") as fh:
            items = json.load(fh)
        check("the queue is capped", len(items), notify.MAX_QUEUED)
        check("and keeps the newest", items[-1]["body"], "body 39")

        # Where the banner goes when it is pressed. Absent rather than null when
        # there is nowhere in particular to send it.
        notify.queue("Night agent", "3 plans waiting", dataset="x", view="plans")
        notify.queue("Due today", "The audit", dataset="x", task="ds-audit")
        with open(notify.queue_path("x"), encoding="utf-8") as fh:
            items = json.load(fh)
        check("a view rides along", items[-2].get("view"), "plans")
        check("and a task", items[-1].get("task"), "ds-audit")
        check("neither is written when neither was given",
              [k for k in ("task", "view") if k in items[0]], [])

        # It must never raise: every caller is doing something else as its real
        # job, and a banner is not worth taking that down for.
        notify.ROOT = "/nonexistent/nowhere"
        check("an unwritable queue returns None rather than raising",
              notify.queue("t", "b", dataset="x"), None)
    finally:
        notify.ROOT = real
        shutil.rmtree(tmp, ignore_errors=True)


def test_board_url():
    """The fragment grammar, which is the one thing in app.py worth checking.

    It is the contract between this app and the board's parseHash, and it fails
    silently in both directions — a wrong fragment opens the right board on the
    wrong thing, which reads as the link not working. Skipped where PyObjC is
    not installed, since importing app.py pulls in AppKit; it draws no menu and
    claims no lock at import time, so on this machine it is safe to import."""
    try:
        import app  # noqa: E402
    except ImportError:
        return
    base = app.BOARD_URL
    check("nothing named opens the board itself", app.board_url(), base)
    check("a card, whatever view is up", app.board_url("ds-audit"),
          base + "#!task=ds-audit")
    check("a view on its own", app.board_url(None, "plans"), base + "#plans")
    check("both together", app.board_url("ds-audit", "plans"),
          base + "#plans!task=ds-audit")
    # A `!` in a title would otherwise look like the separator the board splits
    # on, and a `#` would end the fragment.
    check("a title is escaped", app.board_url("Ship it! #now"),
          base + "#!task=Ship%20it%21%20%23now")


def main():
    test_messages()
    test_digest_line()
    test_notify_queue()
    test_board_url()
    if FAILED:
        print("%d failed\n" % len(FAILED))
        for f in FAILED:
            print("  " + f)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
