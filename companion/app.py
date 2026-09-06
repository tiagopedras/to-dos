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
sys.path.insert(0, os.path.join(ROOT, "core"))
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


class NotificationClicks(AppKit.NSObject):
    """What happens when one of our banners is clicked.

    A notification that says three things are due and then does nothing when you
    press it is a notification that has to be acted on twice — once to read it,
    once to go and find what it named. So every banner carries where it points
    in its `userInfo`, and this delegate opens the board there.

    `shouldPresent` is forced true because macOS suppresses a notification from
    the frontmost app. The companion is an accessory with no windows and is
    never really frontmost, but it can be during a `--notify-once` run, and a
    briefing that silently does not appear is the worst failure this app has."""

    def userNotificationCenter_shouldPresentNotification_(self, centre, note):
        return True

    def userNotificationCenter_didActivateNotification_(self, centre, note):
        info = note.userInfo() or {}
        task = info.get("task") or None
        view = info.get("view") or None
        log("banner clicked → %s" % (task or view or "the board"))
        open_board(task, view)
        try:
            centre.removeDeliveredNotification_(note)
        except Exception:
            pass


# Held here because NSUserNotificationCenter does not retain its delegate. A
# local would be collected the moment notify() returned and the click would go
# nowhere, silently.
_clicks = None


def notification_centre():
    global _clicks
    centre = Foundation.NSUserNotificationCenter.defaultUserNotificationCenter()
    if centre is None:
        return None
    if _clicks is None:
        _clicks = NotificationClicks.alloc().init()
    if centre.delegate() is not _clicks:
        centre.setDelegate_(_clicks)
    return centre


def notify(title, body, task=None, view=None):
    """One notification, by whichever route this machine actually allows.

    NSUserNotification first. It is deprecated, and Apple's replacement —
    UNUserNotificationCenter — is what this ought to use, but that one refuses
    to post for an app bundle macOS has not properly registered, which an
    unsigned one built by hand is not. The deprecated call still delivers, and
    it delivers under this app's own name and icon, which is the whole reason
    for the bundle and the interpreter copy inside it.

    `task` and `view` say where the banner goes when it is pressed — a card, a
    view, or the board's front page when neither is given. They ride in the
    notification's `userInfo`, which is where NotificationClicks reads them back
    out. Only this route can carry them.

    `display notification` through osascript is the fallback, for the day that
    call is finally removed or the bundle identity is lost. It always works, is
    attributed to Script Editor, and cannot be clicked through to anything —
    ugly and unresponsive, and still better than silence.
    Neither route is ever allowed to take the app down: a missed notification is
    worth less than a running menu bar."""
    try:
        note = Foundation.NSUserNotification.alloc().init()
        note.setTitle_(title)
        note.setInformativeText_(body)
        where = {}
        if task:
            where["task"] = str(task)
        if view:
            where["view"] = str(view)
        note.setUserInfo_(where)
        # No action button: the whole banner is the target, so there is nothing
        # for a second one to do that pressing the first does not.
        note.setHasActionButton_(False)
        centre = notification_centre()
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


def board_url(task=None, view=None):
    """The board, optionally with a view and a card named in the fragment.

    `#<view>!task=<key>` — either half can be empty. An empty view segment
    opens the card and leaves whichever view is up alone; a view on its own
    switches to it. The fragment rather than a query string because a link
    differing only after the `#` is a same-document navigation: the browser
    raises the tab that is already open instead of adding a second one, and two
    tabs autosaving one todo.md is the failure this whole app is written to stay
    out of the way of.

    `safe=""` so a `!` inside a title is escaped and cannot look like the
    separator the board splits on."""
    if not task and not view:
        return BOARD_URL
    frag = view or ""
    if task:
        frag += "!task=" + urllib.parse.quote(task, safe="")
    return BOARD_URL + "#" + frag


def open_board(task=None, view=None):
    """Open the board, starting the server first if nothing is listening.

    When it is already up this is one `open` and the tab comes forward. When it
    is not, the app bundle is launched and puts a tab up itself — a second
    `open` straight away would give two — so a link to a card waits on a thread
    for the port, lets the server's own tab land, and then sends the fragment to
    it. Best effort: if the board never comes up, nothing happens and the menu
    is still there."""
    if board_up():
        subprocess.Popen(["/usr/bin/open", board_url(task, view)])
        return
    subprocess.Popen(["/usr/bin/open", os.path.join(ROOT, "To-Do Board.app")])
    if not task and not view:
        return

    def follow():
        import time
        for _ in range(40):                 # twenty seconds, then give up
            if board_up(0.2):
                time.sleep(1.5)             # let the server's own tab open first
                subprocess.Popen(["/usr/bin/open", board_url(task, view)])
                return
            time.sleep(0.5)
        log("board never came up; %r not opened" % (task or view))

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
        self.digest = digest.build(dismissed=set(self.state.get("dismissed", [])))
        self.drain_notifications()
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

        # The messages waiting to go out. This is the section the whole app is
        # most useful for: what stalls a contact step for days is writing the
        # opening line, and one already written turns that into a click.
        #
        # Listed rather than counted, unlike the parked tasks above, because the
        # useful thing is which person is waiting rather than how many are.
        if d.messages:
            self.menu.addItem_(AppKit.NSMenuItem.separatorItem())
            self._label("Messages to send")
            for m in d.messages:
                self._message(m)

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

    @objc.python_method
    def _message(self, m):
        # The step is the label, because that is what names the person, and the
        # message itself is the tooltip — it is two or three sentences and a menu
        # that wide is unreadable.
        #
        # Click copies. Hold alt and the row becomes Dismiss, which is the
        # standard menu bar idiom for a second action and costs no extra rows.
        # Dismissing is this app's own state and never touches todo.md: the
        # message stays on the card, and the board is still where it gets
        # deleted when it is actually sent.
        label = m["where"] or m["task"]
        if len(label) >= 46:
            label = label[:45].rstrip() + "…"
        if m["draft"]:
            label += "  (draft)"
        item = AppKit.NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
            "  " + label, "copyMessage:", "")
        item.setTarget_(self)
        item.setRepresentedObject_(m["key"])
        item.setToolTip_(m["text"])
        self.menu.addItem_(item)

        alt = AppKit.NSMenuItem.alloc().initWithTitle_action_keyEquivalent_(
            "  Dismiss — " + label.strip(), "dismissMessage:", "")
        alt.setTarget_(self)
        alt.setRepresentedObject_(m["key"])
        alt.setKeyEquivalentModifierMask_(AppKit.NSEventModifierFlagOption)
        alt.setAlternate_(True)
        alt.setToolTip_("Hide this until the message is reworded. Nothing is "
                        "removed from the board.")
        self.menu.addItem_(alt)

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
        target = None
        if d.headline:
            body += ".\nThe one thing: " + d.headline.title
            # Only when the banner actually names a card. A briefing that reads
            # "3 due today, 1 overdue" names none, and picking one of them to
            # open would be a guess — the board's front page is the honest
            # answer to a line about several tasks.
            target = task_key(d.headline)
        notify("To-do — %s" % d.day.strftime("%A %-d %B"), body, task=target)
        now = dt.datetime.now()
        self.state["notified"] = now.date().isoformat()
        self.state["notified_at"] = now.strftime("%-H:%M")
        write_state(self.state)

    # ---- the notification pathway ----------------------------------------------

    @objc.python_method
    def drain_notifications(self):
        """Post whatever anything else has asked to be said, and clear the queue.

        This app is the only thing here that can put a notification on screen.
        The night agent has no UI at all, the board is a browser tab that is
        usually shut, and a skill is a conversation that has already ended by the
        time its result matters. So rather than each of them growing its own way
        to speak, they append to one file and this drains it on the next tick.

        The shape is deliberately the same as `attach-queue.json`: a JSON array,
        appended to by anything, drained and cleared by the one process that can
        act on it. It is in `data/` because a notification quotes the list and so
        can carry a name.

        Rules the queue does not get to override:

          - Nothing outside NOTIFY_AT..NOTIFY_UNTIL. A queued line waits for the
            morning rather than going off at 02:00, which is exactly when the
            night agent finishes and exactly when he is asleep.
          - At most three at once, oldest first. Anything more is a bug in
            whatever wrote them, and a stack of eleven banners is worse than
            silence.

        **The weekend and holiday rule does not apply here**, which is the one
        way this differs from the morning briefing above. That briefing is a
        scheduled interruption about a working day, so a Saturday rightly gets
        none. A queued line is the opposite: it answers something that has just
        happened, put there by something he set running himself. If he runs the
        night agent on a Saturday, holding the result until Monday morning
        helps nobody. The time window is the guard that matters, because that one
        is about not being woken, and it still applies every day.

        An entry is `{"title": ..., "body": ..., "queued": ISO}`, and may carry
        `"task"` and `"view"` saying where the banner goes when it is pressed —
        a card key and a board view, both optional, both passed straight through
        to the fragment. Anything else in the object is ignored.
        """
        path = os.path.join(ROOT, "data", digest.DATASET, "notify-queue.json")
        try:
            with open(path, encoding="utf-8") as fh:
                queued = json.load(fh)
            if not isinstance(queued, list) or not queued:
                return
        except (OSError, ValueError):
            return

        now = dt.datetime.now()
        if not (NOTIFY_AT <= now.time() <= NOTIFY_UNTIL):
            return                      # left on the queue, said in the morning

        for entry in queued[:3]:
            if not isinstance(entry, dict):
                continue
            title = str(entry.get("title") or "To-do")[:120]
            body = str(entry.get("body") or "")[:400]
            if body:
                notify(title, body,
                       task=str(entry.get("task") or "")[:200] or None,
                       view=str(entry.get("view") or "")[:40] or None)
                log("queued notification sent: %s" % title)

        rest = queued[3:]
        try:
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(rest, fh, indent=2)
            os.replace(tmp, path)
        except OSError as exc:
            log("could not clear the notification queue: %s" % exc)

    # ---- menu handlers ---------------------------------------------------------

    def tick_(self, timer):
        self.refresh()
        self.maybe_notify()

    def openBoard_(self, sender):
        open_board()

    def openTask_(self, sender):
        open_board(sender.representedObject())

    def copyMessage_(self, sender):
        """Onto the clipboard, ready to paste into Slack or an email.

        Copying is the whole interaction. A menu bar app that opens a window to
        show two sentences has lost the point, and sending it from here would
        mean this process knowing about Slack, which it is not going to."""
        key = sender.representedObject()
        m = next((x for x in self.digest.messages if x["key"] == key), None)
        if not m:
            return
        pb = AppKit.NSPasteboard.generalPasteboard()
        pb.clearContents()
        pb.setString_forType_(m["text"], AppKit.NSPasteboardTypeString)
        log("copied the message for %r" % (m["where"] or m["task"]))
        # A moment of feedback in the icon, since the menu has already closed by
        # the time this runs and there is nowhere else to say anything.
        self.item.button().setTitle_(" copied")
        Foundation.NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
            1.4, self, "clearFlash:", None, False)

    def clearFlash_(self, timer):
        self.draw_icon()

    def dismissMessage_(self, sender):
        """Hide one message here, and only here.

        Dismissing is a statement about this menu, not about the work: the
        message stays on the card, and the board is still the only thing that
        deletes one when it is actually sent. The key is a hash of the task, the
        step and the text, so rewording a message deliberately brings it back —
        a changed message is a different message and is worth seeing again."""
        key = sender.representedObject()
        seen = list(self.state.get("dismissed", []))
        if key not in seen:
            seen.append(key)
            # Trimmed from the front so the file cannot grow without limit. Two
            # hundred is far more than are ever live at once, and the oldest
            # dropping off only means an already-sent message reappears once.
            self.state["dismissed"] = seen[-200:]
            write_state(self.state)
        self.refresh()

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
        open -n "To-Do Companion.app" --args --notify-once

    `-n` matters. Without it, `open` on a bundle that is already running just
    brings that copy forward and drops the arguments on the floor — so with the
    companion in the menu bar, which is always, the command appears to succeed
    and nothing is posted."""
    app = AppKit.NSApplication.sharedApplication()
    app.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)
    d = digest.build()
    body = d.line()
    target = None
    if d.headline:
        body += ".\nThe one thing: " + d.headline.title
        target = task_key(d.headline)
    notify("To-do — %s" % d.day.strftime("%A %-d %B"), body, task=target)
    # Delivery is asynchronous, and a banner is only clickable while the process
    # that posted it is alive — so this waits out the banner rather than the
    # delivery. It costs nothing: `open --args` has already returned, and this is
    # an accessory process with no window and no menu bar item.
    Foundation.NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
        30.0, app, "terminate:", None, False)
    AppHelper.runEventLoop()


def notify_test(task=None, view=None):
    """One banner pointing wherever you say, at any hour — `--notify-test`.

    The click path cannot be checked any other way. `--notify-once` sends the
    digest, and the digest names a card only on a day that has a headline; the
    queue is held outside 08:30–20:00 by design; and the menu's *Send this
    morning's notification* needs a hand on the menu bar. This is the same
    `notify()` and the same delegate as everything else, so what it proves is
    real — the only thing it skips is deciding what to say.

        open "To-Do Companion.app" --args --notify-test --view plans
        open "To-Do Companion.app" --args --notify-test --task ds-audit

    With neither, it points at whatever the list says is most owed today, so
    there is always something to press."""
    app = AppKit.NSApplication.sharedApplication()
    app.setActivationPolicy_(AppKit.NSApplicationActivationPolicyAccessory)
    where = "the board"
    if not task and not view:
        d = digest.build()
        pick = d.headline or (d.overdue[0][1] if d.overdue else
                              (d.today[0][1] if d.today else None))
        if pick:
            task, where = task_key(pick), pick.title
    elif task:
        where = task
    else:
        where = "the %s view" % view
    notify("To-do — test", "Press this. It should open %s." % where,
           task=task, view=view)
    log("test banner sent → %s" % (task or view or "the board"))
    Foundation.NSTimer.scheduledTimerWithTimeInterval_target_selector_userInfo_repeats_(
        60.0, app, "terminate:", None, False)
    AppHelper.runEventLoop()


def main():
    argv = sys.argv[1:]
    if "--notify-test" in argv:
        def opt(name):
            return argv[argv.index(name) + 1] if name in argv[:-1] else None
        return notify_test(opt("--task"), opt("--view"))
    if "--notify-once" in argv:
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
