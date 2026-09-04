#!/usr/bin/env python3
"""Reading todo.md, in Python.

The board's own reader is the JavaScript in kanban/index.html, and it stays the
authority on writing the file: only the board and the pa-* skills ever change a
task. This module is the read-only half of the same knowledge, for the things
that are not a browser tab — today the desktop companion in companion/, and
anything else later that needs to know what is due without opening the board.

It is a port of the parsing in index.html rather than a second design: the same
two tag syntaxes, the same `repeat:` grammar, the same occurrence maths. Where
the two disagree the board is right and this file is the bug. Ported functions
carry the name they have over there — parse_doc, read_repeat, occurrence_from —
so the pair can be read side by side.

It parses and never serialises. Writing todo.md back out is a whole second
problem — the board keeps every blank line, rule and stray note verbatim so a
save that changed nothing gives back the same bytes — and nothing outside the
board needs it. A reader that cannot write also cannot corrupt the file, which
is worth more here than the symmetry.

It also owns the UK working calendar — which days are weekends and which are
bank holidays. That is not file format, so it sits here on sufferance rather than
by right; it is here because three things need the same answer (the board, the
companion and the pa-checkin consistency checker) and a second list of holidays
is a second list to keep in step. Everything that needs it can reach this file,
either by importing it or by having the skill build step copy it in.

The one thing it deliberately does that the board does not: rolling a recurring
task forward happens in memory only. The board rewrites the date into the file
on load; this works out the same date and keeps it to itself, so a reader can
run every minute of a day the board is never opened without ever racing it.
"""

import calendar
import datetime as dt
import re

# ---- The file's grammar, straight across from index.html ---------------------

TASK_RE = re.compile(r"^-\s+\[([ xX])\]\s?(.*)$")
BUCKET_RE = re.compile(r"^##\s+(\d+)\.\s+(.*)$")
TIER_RE = re.compile(r"^###\s+(.*)$")

# Both accepted syntaxes in one pass. impact, effort, due, ai, start, done and to
# are written as Dataview inline fields because views.md queries them and
# Dataview cannot see inside a code span; everything else stays a code span
# because a line carrying eight bracketed fields is unreadable. The older
# `due:2026-08-21` form is still read and always will be — the backups and the
# done archive are full of it.
ANY_TAG_RE = re.compile(r"\[([A-Za-z][\w-]*)::\s*([^\]]*)\]|`([A-Za-z][\w-]*):([^`]*)`")
SLUG_RE = re.compile(r"`#([a-z0-9][a-z0-9-]*)`", re.I)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

INLINE_KEYS = {"impact", "effort", "due", "ai", "start", "done", "to"}


class Task:
    """One top-level task, or one sub-step: the parser makes no distinction and
    the caller decides by indent. Only the fields a reader asks about are
    promoted to attributes; anything else stays in `extra` exactly as written."""

    __slots__ = ("done", "title", "impact", "effort", "due", "start", "done_on",
                 "ai", "to", "urgent", "week", "slug", "blocked_by", "rank",
                 "headline", "chat", "repeat", "extra", "body", "raw",
                 "bucket", "column")

    def __init__(self):
        self.done = False
        self.title = ""
        self.impact = self.effort = self.due = self.start = ""
        self.done_on = self.ai = self.to = ""
        self.urgent = self.week = False
        self.slug = self.headline = self.chat = self.repeat = ""
        self.blocked_by = []
        self.rank = None
        self.extra = []
        self.body = []
        self.raw = ""
        self.bucket = ""
        self.column = ""

    def __repr__(self):
        return "<Task %r %s %s>" % (self.title, self.column, self.due or "-")


def parse_task(raw_lines):
    m = TASK_RE.match(raw_lines[0])
    task = Task()
    task.done = m.group(1).lower() == "x"
    task.raw = raw_lines[0]
    task.body = list(raw_lines[1:])
    rest = m.group(2)

    def take(match):
        whole = match.group(0)
        if match.group(1) is not None:
            key, val = match.group(1), match.group(2)
        else:
            key, val = match.group(3), match.group(4)
        key = key.lower()
        val = val.strip()
        if key in INLINE_KEYS:
            setattr(task, "done_on" if key == "done" else key, val)
        elif key == "blocked-by":
            task.blocked_by = [s.strip() for s in val.split(",") if s.strip()]
        elif key == "rank":
            try:
                task.rank = int(val)
            except ValueError:
                pass
        elif key == "headline":
            task.headline = val
        elif key == "chat":
            task.chat = val.lower()
        elif key == "repeat":
            task.repeat = val.lower()
        else:
            task.extra.append(whole)
            return " "
        return " "

    rest = ANY_TAG_RE.sub(take, rest)

    def take_slug(match):
        task.slug = match.group(1).lower()
        return " "

    rest = SLUG_RE.sub(take_slug, rest)
    if "`urgent`" in rest:
        task.urgent = True
        rest = rest.replace("`urgent`", " ")
    if "`week`" in rest:
        task.week = True
        rest = rest.replace("`week`", " ")
    title = re.sub(r"\s+", " ", rest).strip()
    if len(title) > 4 and title.startswith("**") and title.endswith("**"):
        title = title[2:-2].strip()
    task.title = title
    return task


def parse_doc(text):
    """Every top-level task in the file, tagged with the bucket and column it
    was found under. Sub-steps stay on their parent's `body`, unparsed, because
    no reader outside the board has needed one yet — and a step has no state of
    its own anyway, it inherits its parent's.

    Anything above the first `## N. Name` heading, and the Context section
    below the last bucket, are skipped: they are prose, not work."""
    lines = re.sub(r"\r\n?", "\n", text).split("\n")
    tasks = []
    bucket = column = ""
    i = 0
    in_buckets = False
    while i < len(lines):
        line = lines[i]
        bm = BUCKET_RE.match(line)
        if bm:
            bucket, column, in_buckets = bm.group(2).strip(), "", True
            i += 1
            continue
        # A `##` that is not a numbered bucket closes the run of them. That is
        # what Context is, and everything in it is notes about people rather
        # than tasks, some of it written as bullets that would otherwise parse.
        if line.startswith("## "):
            in_buckets = False
            i += 1
            continue
        tm = TIER_RE.match(line)
        if tm:
            column = tm.group(1).strip()
            i += 1
            continue
        if in_buckets and TASK_RE.match(line):
            raw = [line]
            i += 1
            # The task owns every indented line under it, and any blank line
            # that still has indented content after it.
            while i < len(lines):
                l = lines[i]
                if l.strip() == "":
                    j = i
                    while j < len(lines) and lines[j].strip() == "":
                        j += 1
                    if j < len(lines) and re.match(r"^\s+\S", lines[j]):
                        raw.extend(lines[i:j])
                        i = j
                        continue
                    break
                if re.match(r"^\s+\S", l):
                    raw.append(l)
                    i += 1
                    continue
                break
            task = parse_task(raw)
            task.bucket, task.column = bucket, column
            tasks.append(task)
            continue
        i += 1
    return tasks


def parse_date(s):
    if not s or not DATE_RE.match(s.strip()):
        return None
    try:
        return dt.date.fromisoformat(s.strip())
    except ValueError:
        return None


# ---- Recurring tasks ---------------------------------------------------------
#
# The grammar, in full:
#
#     repeat:wed          every Wednesday
#     repeat:wed-9:15     every Wednesday at 9:15
#     repeat:15           the 15th of every month
#     repeat:wd5          the fifth working day of every month
#     repeat:tue2         the 2nd Tuesday of every month
#     repeat:~thu-14:00   roughly weekly on Thursday, but the day moves
#     repeat:wed/2        every other Wednesday
#     repeat:15/3         the 15th, quarterly
#     repeat:tue2/3       the 2nd Tuesday, quarterly
#
# `[due:: ]` is the occurrence the card currently points at, and the tag says
# how often. Neither is derivable from the other, which is why both are written.
#
# The `/n` suffix multiplies whatever base comes before it, and the phase it
# counts from is the card's own date — which is why it applies in
# occurrence_after and nowhere else.

REPEAT_VAL = re.compile(
    r"^(~?)(?:([a-z]{3})([1-5])?(?:[-\s]+(\d{1,2}:\d{2}))?|wd(\d{1,2})|(\d{1,2}))"
    r"(?:/(\d{1,2}))?$", re.I)
REPEAT_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
# Two years either way. Past that a cycle is an anniversary, and a date typed
# once is clearer than a rule nobody remembers the phase of.
MAX_EVERY = 24


def ordinal(n):
    suffix = ["th", "st", "nd", "rd"]
    v = n % 100
    if 11 <= v <= 13:
        return "%dth" % n
    return "%d%s" % (n, suffix[v % 10] if v % 10 < 4 else "th")


def every_label(n, unit):
    """How the `/n` suffix is said out loud. Empty at n == 1, where the base
    form's own wording already covers it."""
    if n == 1:
        return ""
    if unit == "week":
        return "fortnightly" if n == 2 else "every %d weeks" % n
    if n == 3:
        return "quarterly"
    if n == 6:
        return "twice a year"
    return "every %d months" % n


def read_repeat(val):
    """The tag as a dict, or None when it is not a cycle this understands. The
    board draws its `label` on the card, so the wording here matches it."""
    m = REPEAT_VAL.match(str(val or "").strip())
    if not m:
        return None
    loose = m.group(1) == "~"
    every = int(m.group(7)) if m.group(7) else 1
    if every < 1 or every > MAX_EVERY:
        return None
    monthly_cyc = every_label(every, "month") or "monthly"
    if m.group(5):
        nth = int(m.group(5))
        if nth < 1 or nth > 23:        # 23 working days is a long month
            return None
        return {"kind": "workday", "nth": nth, "time": "", "loose": loose, "every": every,
                "label": "%s, %s working day" % (monthly_cyc, ordinal(nth))}
    if m.group(6):
        dom = int(m.group(6))
        if dom < 1 or dom > 31:
            return None
        return {"kind": "monthly", "dom": dom, "time": "", "loose": loose, "every": every,
                "label": "%s, %s" % (monthly_cyc, ordinal(dom))}
    try:
        dow = REPEAT_DAYS.index(m.group(2).lower())
    except ValueError:
        return None
    time = m.group(4) or ""
    if m.group(3):
        nth = int(m.group(3))
        return {"kind": "monthly-dow", "dow": dow, "nth": nth, "time": time,
                "loose": loose, "every": every,
                "label": "%s, %s %s%s" % (monthly_cyc, ordinal(nth), DAY_NAMES[dow],
                                          (" " + time) if time else "")}
    head = (("weekly, usually " if loose else "every ") if every == 1
            else every_label(every, "week") + ", " + ("usually " if loose else ""))
    return {"kind": "weekly", "dow": dow, "time": time, "loose": loose, "every": every,
            "label": head + DAY_NAMES[dow] + ((" " + time) if time else "")}


def dow_of(date):
    """Sunday-first, the way the tag counts days — Python's weekday() is
    Monday-first and the grammar came from JavaScript. Public because anything
    comparing a real date against a rep["dow"] has to count the same way, and
    getting that wrong is a bug that only shows up on one day of the week."""
    return (date.weekday() + 1) % 7


_dow = dow_of                     # the name the rest of this file was written with


def _nth_day_matching(y, mo, nth, test):
    """The nth day in a month passing `test`, or the last match when the month
    is too short to have an nth. A date somebody meant to hit is better clamped
    than skipped."""
    last = calendar.monthrange(y, mo)[1]
    seen, fallback = 0, 1
    for day in range(1, last + 1):
        if not test(_dow(dt.date(y, mo, day))):
            continue
        fallback = day
        seen += 1
        if seen == nth:
            return dt.date(y, mo, day)
    return dt.date(y, mo, fallback)


def nth_workday(y, mo, nth):
    return _nth_day_matching(y, mo, nth, lambda wd: wd not in (0, 6))


def nth_weekday(y, mo, dow, nth):
    return _nth_day_matching(y, mo, nth, lambda wd: wd == dow)


def occurrence_from(rep, frm):
    """The first occurrence on or after `frm`. On the morning of the meeting
    that is still today, which is right: the agenda is wanted before it starts,
    so the day of it is not yet the next one."""
    if rep["kind"] == "weekly":
        return frm + dt.timedelta(days=(rep["dow"] - _dow(frm)) % 7)
    y, mo = frm.year, frm.month
    nxt = (y + 1, 1) if mo == 12 else (y, mo + 1)
    if rep["kind"] == "workday":
        hit = nth_workday(y, mo, rep["nth"])
        return hit if hit >= frm else nth_workday(nxt[0], nxt[1], rep["nth"])
    if rep["kind"] == "monthly-dow":
        hit = nth_weekday(y, mo, rep["dow"], rep["nth"])
        return hit if hit >= frm else nth_weekday(nxt[0], nxt[1], rep["dow"], rep["nth"])
    # A monthly day a short month does not have lands on that month's last day
    # rather than skipping the month. The 31st in February is a date he still
    # means to hit, and skipping is the one answer that is certainly wrong.
    if frm.day > min(rep["dom"], calendar.monthrange(y, mo)[1]):
        y, mo = nxt
    return dt.date(y, mo, min(rep["dom"], calendar.monthrange(y, mo)[1]))


def _add_months(y, mo, n):
    """(year, month) n months on, months being 1-12."""
    i = (y * 12 + mo - 1) + n
    return i // 12, i % 12 + 1


def occurrence_after(rep, date):
    """The occurrence strictly after this one, which is what rolling needs.

    Where an interval applies, and the only place it does. occurrence_from
    answers "the next Wednesday", which needs no phase; this answers "the next
    one of mine", which is entirely phase, counted from the date handed in. The
    roll always hands in the card's current date, so moving that date by hand
    moves the whole series with it."""
    n = rep.get("every", 1)
    if n == 1:
        return occurrence_from(rep, date + dt.timedelta(days=1))
    if rep["kind"] == "weekly":
        nxt = date + dt.timedelta(days=7 * n)
        # Zero unless the date was moved onto another weekday by hand, in which
        # case this snaps back onto the tagged day rather than drifting on it.
        return nxt + dt.timedelta(days=(rep["dow"] - _dow(nxt)) % 7)
    y, mo = _add_months(date.year, date.month, n)
    if rep["kind"] == "workday":
        return nth_workday(y, mo, rep["nth"])
    if rep["kind"] == "monthly-dow":
        return nth_weekday(y, mo, rep["dow"], rep["nth"])
    return dt.date(y, mo, min(rep["dom"], calendar.monthrange(y, mo)[1]))


def effective_due(task, today):
    """The date this task is really pointing at, with any recurrence rolled
    forward in memory — the same answer the board writes into the file when it
    loads, worked out without touching it.

    A recurring task with no date at all gets its next occurrence, which is what
    the board does too: the tag already says which day, so the date is derivable
    and flagging it would be busywork."""
    rep = read_repeat(task.repeat) if task.repeat else None
    due = parse_date(task.due)
    if not rep:
        return due
    if not due:
        return occurrence_from(rep, today)
    if due >= today:
        return due
    nxt = occurrence_after(rep, due)
    while nxt < today:
        nxt = occurrence_after(rep, nxt)
    return nxt


def slug_states(tasks):
    """Every `#slug` in the file against whether the line carrying it is ticked.
    Steps are included as well as whole tasks, because several of the blockers
    on the list are steps — `blocked-by:` resolves against either."""
    out = {}
    for t in tasks:
        if t.slug:
            out[t.slug] = t.done
        for line in t.body:
            m = TASK_RE.match(line.strip())
            if not m:
                continue
            s = SLUG_RE.search(m.group(2))
            if s:
                out[s.group(1).lower()] = m.group(1).lower() == "x"
    return out


def is_blocked(task, slugs):
    """True when something this task names as a blocker is not ticked off, or
    does not exist at all. A slug that has gone missing counts as blocking: a
    dependency nobody can find is not one that has been satisfied."""
    return any(not slugs.get(s, False) for s in task.blocked_by)


# ---- The working calendar ----------------------------------------------------
#
# Two countries, because the work spans two: he takes Portuguese public holidays
# and his team takes UK ones, and a date is awkward if either side is away.
# `REGIONS` is the union, and every function here takes a narrower set if a
# caller only cares about one of them.
#
# Worked out from the rules rather than typed in as a table. A table has to be
# extended a year at a time by somebody who remembers to, and the year it runs
# out is the year it silently starts calling every day a working day. These
# rules are stable — the last change to either country's set was Portugal
# restoring four holidays in 2016 — so a generated year is right for as long as
# that holds, and wrong loudly rather than quietly if it stops.
#
# What is not derivable goes in the EXTRA dicts below: one-off holidays granted
# by government (a coronation, a jubilee, a funeral) and municipal holidays,
# neither of which follows a rule. Both are empty today.
#
# This is not file format, so it sits in this module on sufferance. It is here
# because three things need the same answer — the companion staying quiet on a
# day off, the pa-checkin checker flagging a deadline that lands on one, and the
# board's own idea of a working day — and the alternative is a second list to
# keep in step.

REGIONS = ("UK", "PT")

# What the rules cannot produce. A name adds a holiday on that date; None takes
# one away, which is what a year needs when the government moves a standing
# holiday rather than adding to them. Both happen every few years, so this is
# the maintenance surface: two lines per event, and nothing else changes.
#
# The five below are every England-and-Wales departure from the rules since the
# gov.uk feed begins in 2019, and they are here because they are what proves the
# override works, not because anything reads a date in the past.
UK_EXTRA = {
    "2020-05-04": None,                 # moved for the 75th anniversary of VE Day
    "2020-05-08": "Early May bank holiday (VE day)",
    "2022-05-30": None,                 # moved to sit beside the Platinum Jubilee
    "2022-06-02": "Spring bank holiday",
    "2022-06-03": "Platinum Jubilee bank holiday",
    "2022-09-19": "Bank Holiday for the State Funeral of Queen Elizabeth II",
    "2023-05-08": "Bank holiday for the coronation of King Charles III",
}
# Portugal's municipal holidays are one per council, and the Azores and Madeira
# have their own on top, so none is assumed here. Add the relevant one if it
# matters: Porto is 24 June, Lisbon 13 June.
PT_EXTRA = {}


def easter_sunday(year):
    """Gregorian Easter, the anonymous algorithm. Three of the UK's holidays and
    four of Portugal's are counted from it."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return dt.date(year, month, day + 1)


def _mondays(year, month):
    first = dt.date(year, month, 1)
    first += dt.timedelta(days=(7 - first.weekday()) % 7)
    out = []
    while first.month == month:
        out.append(first)
        first += dt.timedelta(days=7)
    return out


def _apply_extra(out, extra, year):
    """The overrides for one year. A None removes rather than adds, and removing
    something the rules never produced is not an error — it just means the rule
    has since changed to agree."""
    for iso, name in extra.items():
        date = dt.date.fromisoformat(iso)
        if date.year != year:
            continue
        if name is None:
            out.pop(date, None)
        else:
            out[date] = name


def _uk_holidays(year):
    """England and Wales.

    A holiday landing on a weekend is not lost, it moves to the next weekday
    that is not already one — which is why Christmas and Boxing Day can push
    each other along by two days, as they do in 2027."""
    easter = easter_sunday(year)
    out = {}
    taken = set()

    def fixed(date, name):
        moved = date
        while moved.weekday() >= 5 or moved in taken:
            moved += dt.timedelta(days=1)
        taken.add(moved)
        out[moved] = name + (" (substitute)" if moved != date else "")

    fixed(dt.date(year, 1, 1), "New Year's Day")
    # Not substituted: they are defined as days of the week already.
    for date, name in ((easter - dt.timedelta(days=2), "Good Friday"),
                       (easter + dt.timedelta(days=1), "Easter Monday"),
                       (_mondays(year, 5)[0], "Early May bank holiday"),
                       (_mondays(year, 5)[-1], "Spring bank holiday"),
                       (_mondays(year, 8)[-1], "Summer bank holiday")):
        taken.add(date)
        out[date] = name
    fixed(dt.date(year, 12, 25), "Christmas Day")
    fixed(dt.date(year, 12, 26), "Boxing Day")
    _apply_extra(out, UK_EXTRA, year)
    return out


def _pt_holidays(year):
    """Portugal, national only.

    No substitution: a holiday on a Saturday is simply lost, which is why 2027
    is a thin year — Liberdade, Trabalhador, Assunção and Natal all fall at a
    weekend.

    Carnaval is the one entry that is not statutory. It is a tolerância de
    ponto, granted by the government most years rather than owed, so its name
    says so — a deadline flagged for landing on it is worth a second look rather
    than an automatic move."""
    easter = easter_sunday(year)
    out = {
        dt.date(year, 1, 1): "Ano Novo",
        dt.date(year, 4, 25): "Dia da Liberdade",
        dt.date(year, 5, 1): "Dia do Trabalhador",
        # Shortened. The full name is "Dia de Portugal, de Camões e das
        # Comunidades Portuguesas", which no menu line can hold.
        dt.date(year, 6, 10): "Dia de Portugal",
        dt.date(year, 8, 15): "Assunção de Nossa Senhora",
        dt.date(year, 10, 5): "Implantação da República",
        dt.date(year, 11, 1): "Dia de Todos-os-Santos",
        dt.date(year, 12, 1): "Restauração da Independência",
        dt.date(year, 12, 8): "Imaculada Conceição",
        dt.date(year, 12, 25): "Natal",
        easter - dt.timedelta(days=47): "Carnaval (tolerância de ponto)",
        easter - dt.timedelta(days=2): "Sexta-feira Santa",
        easter: "Domingo de Páscoa",
        easter + dt.timedelta(days=60): "Corpo de Deus",
    }
    _apply_extra(out, PT_EXTRA, year)
    return out


_BUILDERS = {"UK": _uk_holidays, "PT": _pt_holidays}
_CACHE = {}


def holidays(year, regions=REGIONS):
    """{date: name} for one year. Cached, because the companion asks once a
    minute and the answer for a given year never changes."""
    out = {}
    for region in regions:
        key = (region, year)
        if key not in _CACHE:
            _CACHE[key] = _BUILDERS[region](year)
        out.setdefault(region, _CACHE[key])
    return out


def holiday_names(date, regions=REGIONS):
    """[(region, name)] for every region this date is a holiday in — two entries
    on Christmas Day, which both countries keep."""
    return [(r, names[date]) for r, names in holidays(date.year, regions).items()
            if date in names]


def holiday_name(date, regions=REGIONS):
    """The name of the holiday this date falls on, or None. The first region's
    name where both have one, since the day is the same day either way."""
    hits = holiday_names(date, regions)
    return hits[0][1] if hits else None


WHOSE = {"UK": "a UK bank holiday", "PT": "a Portuguese public holiday"}
COUNTRY = {"UK": "the UK", "PT": "Portugal"}


def non_working_reason(date, regions=REGIONS):
    """Why this is not a working day, phrased to drop into a sentence, or None.

    Reads as "Dia da Liberdade, a Portuguese public holiday" or "the 4th is a
    Saturday", which is what the checker's findings and the companion's menu
    both want to say. A weekend wins over a holiday that falls on one: on a
    Saturday the useful thing to say is that it is a Saturday."""
    if date.weekday() == 5:
        return "a Saturday"
    if date.weekday() == 6:
        return "a Sunday"
    hits = holiday_names(date, regions)
    if not hits:
        return None
    if len(hits) == 1:
        return "%s, %s" % (hits[0][1], WHOSE[hits[0][0]])
    return "%s, a public holiday in %s" % (
        hits[0][1], " and ".join(COUNTRY[h[0]] for h in hits))


def is_working_day(date, regions=REGIONS):
    return non_working_reason(date, regions) is None
