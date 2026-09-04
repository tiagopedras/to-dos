#!/usr/bin/env python3
"""The desktop companion: a menu bar icon and one notification a morning.

It answers the thing the board cannot. The board only tells you anything while a
tab is open on it, so a day it is never opened is a day nothing is said. This
sits in the menu bar instead, reads data/twinkl/todo.md straight off disk, and
says once each working morning what is due and what is overdue.

Deliberately not a second board. It shows what is owed and opens the real board
when you want to do anything about it — no ticking off, no editing, nothing that
could write to todo.md. The file is opened read-only and never written, so the
companion cannot race the board's autosave or corrupt a list. Its own state, one
line recording the last morning it spoke, lives beside the list in
data/<dataset>/companion.json.

Written straight against AppKit through PyObjC rather than with rumps, because
PyObjC is already on this machine with the Python that runs the board and rumps
is one more thing to install and remember. It is about eighty lines more code
and no dependencies at all.

Run it from the app bundle (double-click "To-Do Companion.app"), or directly:

    python3 companion/app.py
"""

import datetime as dt
import fcntl
import json
import os
import subprocess
import sys
import threading
import urllib.parse

import AppKit
import Foundation
import objc
from PyObjCTools import AppHelper

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "kanban"))
import digest  # noqa: E402
import todo  # noqa: E402

_lock = None
BOARD_URL = "http://127.0.0.1:8765/kanban/index.html"
# How often the file is re-read. A minute is far more often than a to-do list
# changes, and the read is a few milliseconds, but it is what makes the menu
# right the moment you look at it rather than as of whenever it last ran.
TICK = 60.0
# The morning notification goes out at the first tick at or after this, on a
# working day — a weekday that is not a UK bank holiday. The holiday list is
# todo.py's, the same one the pa-checkin checker reads, so a Monday off is a
# Monday off to both of them and there is no second list to keep in step.
NOTIFY_AT = dt.time(8, 30)
# And not after this. Launching the app late in the evening should not produce a
# briefing about a day that is over — but launching it at four in the afternoon,
# having not opened the laptop all day, should. The cutoff is what separates
# those two, and nothing is recorded when it stops one, so the next morning goes
# out as normal.
NOTIFY_UNTIL = dt.time(20, 0)


def log(msg):
    """Stdout, which the app bundle's launcher redirects to
    ~/Library/Logs/To-Do Companion.log. A menu bar app has nowhere else to say
    anything, and which route a notification took is the one thing worth being
    able to check after the fact."""
    print("%s  %s" % (dt.datetime.now().strftime("%H:%M:%S"), msg), flush=True)


def claim_single_instance():
    """One companion at a time. Two status items for one list is clutter, and
    two would notify twice on the same morning before either wrote the state
    file. An flock rather than a pid file or a pgrep: the kernel drops the lock
    when the process dies, so a crash never leaves a stale one behind that has
    to be cleared by hand before the app will start again."""
    path = os.path.join(ROOT, "data", digest.DATASET, "companion.lock")
    try:
        fh = open(path, "w")
        fcntl.flock(fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return None
    return fh                 # held open for the life of the process


def state_path():
    return os.path.join(ROOT, "data", digest.DATASET, "companion.json")


def read_state():
    try:
        with open(state_path(), encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def write_state(state):
    try:
        with open(state_path(), "w", encoding="utf-8") as fh:
            json.dump(state, fh, indent=2)
    except OSError:
        pass          # a companion that cannot remember is still a companion


def notify(title, body):
    """One notification, by whichever route this machine actually allows.

    NSUserNotification first. It is deprecated, and Apple's replacement —
    UNUserNotificationCenter — is what this ought to use, but that one refuses
    to post for an app bundle macOS has not properly registered, which an
    unsigned one built by hand is not. The deprecated call still delivers, and
    it delivers under this app's own name and icon, which is the whole reason
    for the bundle and the interpreter copy inside it.

    `display notification` through osascript is the fallback, for the day that
    call is finally removed or the bundle identity is lost. It always works and
    is attributed to Script Editor, which is ugly and still better than silence.
    Neither route is ever allowed to take the app down: a missed notification is
    worth less than a running menu bar."""
    try:
        note = Foundation.NSUserNotification.alloc().init()
        note.setTitle_(title)
        note.setInformativeText_(body)
        centre = Foundation.NSUserNotificationCenter.defaultUserNotificationCenter()
        if centre is not None:
            centre.deliverNotification_(note)
            log("notification delivered")
            return True
    except Exception as exc:
        log("notification centre unavailable: %s" % exc)
    try:
        # Passed as arguments rather than pasted into the script text. The body
        # carries a line break and the titles carry apostrophes and dashes, and
        # every one of those is a way to break AppleScript quoting.
        subprocess.run(["/usr/bin/osascript", "-e",
                        "on run argv\n"
                        "  display notification (item 1 of argv) with title (item 2 of argv)\n"
                        "end run", body, title], check=False, timeout=10)
        log("notification sent through osascript")
        return True
    except Exception as exc:
        log("no notification could be sent: %s" % exc)
        return False


def board_up(timeout=0.4):
    import socket
    s = socket.socket()
    s.settimeout(timeout)
    try:
        s.connect(("127.0.0.1", 8765))
        return True
    except OSError:
        return False
    finally:
        s.close()


def board_url(task=None):
    """The board, optionally with a card named in the fragment.

    `#!task=<key>` — an empty view segment, so the board opens the card and
    leaves whichever view is up alone. The fragment rather than a query string
    because a link differing only after the `#` is a same-document navigation:
    the browser raises the tab that is already open instead of adding a second
    one, and two tabs autosaving one todo.md is the failure this whole app is
    written to stay out of the way of.

    `safe=""` so a `!` inside a title is escaped and cannot look like the
    separator the board splits on."""
    if not task:
        return BOARD_URL
    return BOARD_URL + "#!task=" + urllib.parse.quote(task, safe="")


def open_board(task=None):
    """Open the board, starting the server first if nothing is listening.

    When it is already up this is one `open` and the tab comes forward. When it
    is not, the app bundle is launched and puts a tab up itself — a second
    `open` straight away would give two — so a link to a card waits on a thread
    for the port, lets the server's own tab land, and then sends the fragment to
    it. Best effort: if the board never comes up, nothing happens and the menu
    is still there."""
    if board_up():
        subprocess.Popen(["/usr/bin/open", board_url(task)])
        return
    subprocess.Popen(["/usr/bin/open", os.path.join(ROOT, "To-Do Board.app")])
    if not task:
        return

    def follow():
        import time
        for _ in range(40):                 # twenty seconds, then give up
            if board_up(0.2):
                time.sleep(1.5)             # let the server's own tab open first
                subprocess.Popen(["/usr/bin/open", board_url(task)])
                return
            time.sleep(0.5)
        log("board never came up; %r not opened" % task)

    threading.Thread(target=follow, daemon=True).start()


def task_key(task):
    """How a card is named in a link. Its `#slug` where it has one, its title
    where it does not — the two things in todo.md stable enough to point at,
    since the board mints a fresh id for every task on every parse."""
    return task.slug or task.title


class Companion(AppKit.NSObject):

    def init(self):
        self = objc.super(Companion, self).init()
        if self is None:
            return None
        self.digest = None
        self.state = read_state()
        bar = AppKit.NSStatusBar.systemStatusBar()
        self.item = bar.statusItemWithLength_(AppKit.NSVariableStatusItemLength)
        self.menu = AppKit.NSMenu.alloc().init()
        self.item.setMenu_(self.menu)
        self.refresh()
        Foundation.NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            TICK, self, "tick:", None, True)
        return self

    # ---- reading and drawing -------------------------------------------------

    @objc.python_method
    def refresh(self):
        self.digest = digest.build()
        self.draw_icon()
        self.draw_menu()

    @objc.python_method
    def draw_icon(self):
        d = self.digest
        button = self.item.button()
        # An SF Symbol as a template image, so it follows the menu bar through
        # light and dark and through a wallpaper-tinted bar, which a text glyph
        # does not. The count sits beside it and disappears at zero, so a clear
        # day reads as a quiet icon rather than as a nought.
        name = "exclamationmark.triangle" if (d.error or d.overdue) else "checklist"
        img = AppKit.NSImage.imageWithSystemSymbolName_accessibilityDescription_(name, "To-do")
        if img is not None:
            img.setTemplate_(True)
            button.setImage_(img)
            button.setImagePosition_(AppKit.NSImageLeft)
        button.setTitle_(" %d" % d.count if d.count else "")
        button.setToolTip_(d.line())

    @objc.python_method
    def draw_menu(self):
        d = self.digest
        self.menu.removeAllItems()
        self._label("%s — %s" % (d.day.strftime("%A %-d %B"), d.line()))

        if d.headline:
            self.menu.addItem_(AppKit.NSMenuItem.separatorItem())
            self._label("The one thing")
            self._task(d.headline)

        for title, group in (("Overdue", d.overdue), ("Due today", d.today)):
            if not group:
                continue
            self.menu.addItem_(AppKit.NSMenuItem.separatorItem())
            self._label(title)
            for due, task in group:
                self._task(task, "" if due == d.day else due.strftime("%-d %b"))

        # Counted rather than listed. These are the tasks the digest leaves out
        # — with somebody else, or waiting on another task — and a count is
        # enough to stop the list quietly shrinking without anyone noticing.
        if d.parked:
            self.menu.addItem_(AppKit.NSMenuItem.separatorItem())
            self._label("%d more with somebody else or blocked" % d.parked)

        self.menu.addItem_(AppKit.NSMenuItem.separatorItem())
        self._action("Open the board", "openBoard:", "o")
        self._action("Check again now", "checkNow:", "r")
        self._action("Send this morning's notification", "notifyNow:", "")
        self.menu.addItem_(AppKit.NSMenuItem.separatorItem())
        self._label(self.status_line())
        self._action("Quit", "quit:", "q")

    @objc.python_method
    def status_line(self):
        today = dt.date.today()
        last = self.state.get("notified")
        if last == today.isoformat():
            at = self.state.get("notified_at", "")
            return "Notified today" + (" at " + at if at else "")
        # Named rather than merely quiet, so a silent Monday reads as the
        # holiday it is instead of as an app that has stopped working. The
        # country is on it because the two calendars disagree most days: a
        # quiet Monday in June is Portugal's, one in May is the UK's.
        hits = todo.holiday_names(today)
        if hits:
            return "Quiet — %s (%s)" % (hits[0][1], " & ".join(r for r, _ in hits))
        if today.weekday() >= 5:
            return "Quiet at the weekend"
        if dt.datetime.now().time() > NOTIFY_UNTIL:
            return "Too late in the day to notify"
        return "Notifying at %s" % NOTIFY_AT.strftime("%-H:%M")

    @objc.python_method
    def _label(self, text):
        item = AppKit.NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(text, None, "")
        item.setEnabled_(False)
        self.menu.addItem_(item)

    @objc.python_method
    def _action(self, text, selector, key):
        item = AppKit.NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
            text, selector, key)
        item.setTarget_(self)
        self.menu.addItem_(item)

    @objc.python_method
    def _task(self, task, when=""):
        # A task in the menu opens the board on that card. Reading it and doing
        # something about it are still two different places on purpose: there is
        # no ticking off here, because a tick is a write to todo.md and this
        # process never writes to it.
        #
        # One selector for every row, with the key carried on the item itself —
        # a selector per task would mean minting methods at runtime, and the
        # only thing that varies is which card to name.
        title = task.title if len(task.title) < 52 else task.title[:51].rstrip() + "…"
        if when:
            title += "   " + when
        item = AppKit.NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
            "  " + title, "openTask:", "")
        item.setTarget_(self)
        item.setRepresentedObject_(task_key(task))
        item.setToolTip_("%s · %s" % (task.bucket, task.column))
        self.menu.addItem_(item)

    # ---- the morning -----------------------------------------------------------

    @objc.python_method
    def maybe_notify(self):
        now = dt.datetime.now()
        today = now.date().isoformat()
        if today == self.state.get("notified"):
            return
        # Weekends and public holidays both, in either country: he takes the
        # Portuguese ones and his team takes the UK ones, and a briefing is
        # worth less on a morning either side is away. Nothing is recorded when
        # this stops one, so the next working morning goes out as normal.
        # To narrow it to one country, pass regions — todo.is_working_day(d,
        # ("PT",)) — here and nowhere else.
        if not todo.is_working_day(now.date()):
            return
        if now.time() < NOTIFY_AT or now.time() > NOTIFY_UNTIL:
            return
        self.send()

    @objc.python_method
    def send(self):
        d = self.digest
        body = d.line()
        if d.headline:
            body += ".\nThe one thing: " + d.headline.title
        notify("To-do — %s" % d.day.strftime("%A %-d %B"), body)
        now = dt.datetime.now()
        self.state["notified"] = now.date().isoformat()
        self.state["notified_at"] = now.strftime("%-H:%M")
        write_state(self.state)

    # ---- menu handlers ---------------------------------------------------------

    def tick_(self, timer):
        self.refresh()
        self.maybe_notify()

    def openBoard_(self, sender):
        open_board()

    def openTask_(self, sender):
        open_board(sender.representedObject())

    def checkNow_(self, sender):
        self.refresh()

    def notifyNow_(self, sender):
        self.refresh()
        self.send()
        self.draw_menu()

    def quit_(self, sender):
        AppKit.NSApp.terminate_(self)


def notify_once():
    """Fire the digest and quit, without touching the state file — what
    `--notify-once` runs. It exists so the notification can be checked without
    waiting for a morning, and so one can be triggered from a script.

    Run it through the app bundle, or the alert loses the app's name:
        open "To-Do Companion.app" --args --notify-once"""
    app = AppKit.NSApplication.sharedApplication()
    app.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)
    d = digest.build()
    body = d.line()
    if d.headline:
        body += ".\nThe one thing: " + d.headline.title
    notify("To-do — %s" % d.day.strftime("%A %-d %B"), body)
    # Delivery is asynchronous, so give it a moment before the process goes.
    Foundation.NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
        2.0, app, "terminate:", None, False)
    AppHelper.runEventLoop()


def main():
    if "--notify-once" in sys.argv[1:]:
        return notify_once()
    global _lock
    _lock = claim_single_instance()
    if _lock is None:
        return                # another companion already has the menu bar
    app = AppKit.NSApplication.sharedApplication()
    # Accessory: a menu bar item with no Dock icon and no menu bar of its own.
    app.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)
    companion = Companion.alloc().init()
    app.setDelegate_(companion)
    AppHelper.runEventLoop()


if __name__ == "__main__":
    main()
