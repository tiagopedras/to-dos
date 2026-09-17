#!/usr/bin/env python3
"""Tests core/aggregate.py, core/archive.py and core/render.py — the reading
and rendering IMPROVEMENTS.md's two report entries asked for. No JavaScript
counterpart to keep in step with: the aggregation and the rendering are both
Python-only, since nothing on the board side needs either.

    python3 core/test_reports.py
"""

import datetime as dt
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import aggregate  # noqa: E402
import archive  # noqa: E402
import render  # noqa: E402
import todo  # noqa: E402

FAILED = []


def check(name, got, want):
    ok = got == want
    print(("  ok  " if ok else " FAIL ") + " " + name)
    if not ok:
        FAILED.append("%s\n    got  %r\n    want %r" % (name, got, want))


DOC = """## 1. Design System

### To do

- [ ] **A task due tomorrow** [impact:: high] [effort:: M] [ai:: none] `due:2026-09-15`
- [ ] **A quick win** [impact:: med] [effort:: S] [ai:: partial]
- [ ] **The headline task** [impact:: high] [effort:: L] [ai:: none] `headline:2026-09-11` `week`
  - [ ] Not yet started [ai:: none]
  - [ ] Also open [ai:: none]
- [ ] **Delegated, high priority** [impact:: high] [effort:: S] [ai:: full]
- [ ] **Delegated, low priority** [impact:: low] [effort:: L] [ai:: full]
- [ ] **A blocked quick win** [impact:: med] [effort:: S] [ai:: none] `blocked-by:gate` #other
- [ ] **Weekly design review** [impact:: med] [effort:: S] [ai:: none] `due:2026-09-14` `repeat:mon`
  - Agenda:
    - Rebrand colours
      - Confirm the palette before Friday.
    - Token audit
      - Still waiting on the export.

### Doing

- [ ] **In progress right now** [impact:: high] [effort:: M] [ai:: none]

### Waiting for review

- [ ] **Sitting with someone else** [impact:: high] [effort:: S] [ai:: none] `due:2026-09-10`

### Blocked

- [ ] **Cannot move yet** [impact:: med] [effort:: M] [ai:: none]

### Backlog

- [ ] **Not for now** [impact:: low] [effort:: S] [ai:: full]

### Done

- [x] **Finished this morning** [impact:: med] [effort:: S] [ai:: none] `done:2026-09-14`
- [x] **Finished last week** [impact:: high] [effort:: M] [ai:: none] `done:2026-09-08`

## Context

Nothing here parses as work.
"""

TODAY = dt.date(2026, 9, 14)  # a Monday


def test_today_view():
    tasks = todo.parse_doc(DOC)
    v = aggregate.today_view(tasks, TODAY)

    check("the headline is the task carrying headline:", v["headline"], "The headline task")
    check("its age is whole days since that date", v["headline_age"], 3)
    check("its next step is the first unticked sub-step",
          v["headline_next_step"], "Not yet started")

    check("overdue excludes Waiting for review — its date belongs to someone else now",
          [r["title"] for r in v["overdue"]], [])
    check("due today", [r["title"] for r in v["overdue"] + v["due_today"]],
          ["Weekly design review"])
    check("due tomorrow", [r["title"] for r in v["due_tomorrow"]],
          ["A task due tomorrow"])

    check("doing is read off the column, not a tag",
          [r["title"] for r in v["doing"]], ["In progress right now"])
    check("waiting review", [r["title"] for r in v["waiting"]],
          ["Sitting with someone else"])
    check("blocked", [r["title"] for r in v["blocked"]], ["Cannot move yet"])

    check("week carries the headline task, tagged week",
          [r["title"] for r in v["week"]], ["The headline task"])

    check("done today", [r["title"] for r in v["done_today"]],
          ["Finished this morning"])

    quick_titles = [r["title"] for r in v["quick_wins"]]
    check("a quick win is S effort and unblocked", "A quick win" in quick_titles, True)
    check("a blocked one is not, whatever its effort",
          "A blocked quick win" in quick_titles, False)
    check("ai:full is Delegate's, not Quick wins'",
          "Delegated, high priority" in quick_titles, False)

    check("delegate is ai:full regardless of column, ranked by impact against effort",
          [r["title"] for r in v["delegate"]],
          ["Delegated, high priority", "Not for now", "Delegated, low priority"])

    check("a recurring task due today is a meeting for the next two days",
          [r["title"] for r in v["meetings_next_two_days"]], ["Weekly design review"])
    check("its agenda is written", v["meetings_next_two_days"][0]["agenda_state"], "written")

    check("counts agree with the lists they count",
          (v["doing_count"], v["waiting_count"], v["blocked_count"]), (1, 1, 1))


def test_meeting_view():
    tasks = todo.parse_doc(DOC)
    mv = aggregate.meeting_view(tasks, "Weekly design review", TODAY)
    check("matched by title", mv["meeting"], "Weekly design review")
    check("the agenda is read off the task's own block",
          [t["topic"] for t in mv["agenda"]], ["Rebrand colours", "Token audit"])
    check("a title that matches nothing finds nothing",
          aggregate.meeting_view(tasks, "Not a real meeting", TODAY), None)


def test_agenda_topics():
    tasks = todo.parse_doc(DOC)
    t = next(t for t in tasks if t.title == "Weekly design review")
    topics = todo.agenda_topics(t)
    check("two topics", len(topics), 2)
    check("context is joined into one line",
          topics[0]["context"], "Confirm the palette before Friday.")
    check("no Previous agenda block here", todo.agenda_topics(t, previous=True), [])


ARCHIVE = """### Design System · Done

- [x] **An archived task** [impact:: high] [effort:: M] [ai:: none] `done:2026-08-01`
- [x] **Outside the window** [impact:: med] [effort:: S] [ai:: none] `done:2026-01-01`
"""

# A cancellation is a tick plus a tag (CONVENTIONS.md, Cancelling a task), and
# it is indistinguishable from finished work once it has been archived out —
# which is the whole reason counts_as_finished() exists. Both halves are
# covered: one still in the live file and one in the archive.
CANCELLED_ARCHIVE = """### Design System · Done

- [x] **Really finished, in the archive** [impact:: high] [effort:: M] [ai:: none] `done:2026-08-01`
- [x] **Cancelled, in the archive** [impact:: high] [effort:: M] [ai:: none] `done:2026-08-02` `cancelled:2026-08-02`
- [x] **Archived away, in the archive** [impact:: low] [effort:: S] [ai:: none] `done:2026-08-03` `archived:2026-08-03`
"""

CANCELLED_DOC = """# To-do

## 1. Design System

### Done

- [x] **Really finished, live** [impact:: high] [effort:: M] [ai:: none] `done:2026-09-02`
- [x] **Cancelled, live** [impact:: high] [effort:: M] [ai:: none] `done:2026-09-02` `cancelled:2026-09-02`
- [x] **Archived away, live** [impact:: low] [effort:: S] [ai:: none] `done:2026-09-02` `archived:2026-09-02`
"""


def test_cancelled_work_is_not_counted_as_finished():
    tmp = tempfile.mkdtemp(prefix="cancelled-test-")
    path = os.path.join(tmp, "done-archive.md")
    try:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(CANCELLED_ARCHIVE)
        tasks = todo.parse_doc(CANCELLED_DOC)

        check("the tags parse off a task line",
              [(t.cancelled, t.archived) for t in tasks],
              [("", ""), ("2026-09-02", ""), ("", "2026-09-02")])

        live = aggregate.period_view(tasks, path, dt.date(2026, 9, 1), dt.date(2026, 9, 14))
        check("a cancelled live task is left out of completed",
              [r["title"] for r in live["completed"]], ["Really finished, live"])
        check("and out of the per-bucket count with it",
              live["by_bucket"], [{"bucket": "Design System", "count": 1}])

        arch = aggregate.period_view(tasks, path, dt.date(2026, 8, 1), dt.date(2026, 8, 5))
        check("a cancelled archived task is left out too",
              [r["title"] for r in arch["completed"]], ["Really finished, in the archive"])

        view = aggregate.today_view(tasks, dt.date(2026, 9, 2))
        check("and out of what was finished today",
              [r["title"] for r in view["done_today"]], ["Really finished, live"])
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)


def test_archive_and_period_view():
    tmp = tempfile.mkdtemp(prefix="archive-test-")
    path = os.path.join(tmp, "done-archive.md")
    try:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(ARCHIVE)
        entries = archive.read_archive(path)
        check("both archived tasks parse", [e.title for e in entries],
              ["An archived task", "Outside the window"])
        check("bucket and tier come off the ### heading",
              (entries[0].bucket, entries[0].column), ("Design System", "Done"))

        check("a path that does not exist reads as empty",
              archive.read_archive(os.path.join(tmp, "missing.md")), [])

        tasks = todo.parse_doc(DOC)
        # A window over September: both live-done tasks fall inside it, and
        # both archive entries fall outside it.
        sept = aggregate.period_view(tasks, path, dt.date(2026, 9, 1), dt.date(2026, 9, 14))
        sept_titles = [r["title"] for r in sept["completed"]]
        check("live done tasks in the window are included",
              set(sept_titles), {"Finished this morning", "Finished last week"})
        check("grouped by bucket for the shape a report most likely wants",
              sept["by_bucket"], [{"bucket": "Design System", "count": 2}])

        # A window over early August: only the archived entry from that
        # month falls inside it — the live tasks and the other archive
        # entry (January) are both outside it.
        aug = aggregate.period_view(tasks, path, dt.date(2026, 7, 25), dt.date(2026, 8, 5))
        check("and the archive is joined in the same way, for a window of its own",
              [r["title"] for r in aug["completed"]], ["An archived task"])
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)


def test_render_empty_line_and_heading_rules():
    tmp = tempfile.mkdtemp(prefix="render-test-")
    path = os.path.join(tmp, "t.md")
    try:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(
                "---\nname: t\nuse: a test\nlines: 20\n---\n"
                "Head\n"
                "Next: {{next_step}}\n\n"
                "Late\n"
                "{{#overdue}}\n- {{title}}\n{{/overdue}}\n"
                "{{^overdue}}\nNothing overdue.\n{{/overdue}}\n"
            )
        out = render.render(path, {"next_step": "", "overdue": []})
        check("a placeholder with nothing to fill it drops its whole line",
              "Next:" in out, False)
        check("the heading itself survives since it has no placeholder",
              "Head" in out, True)
        check("an empty list's own heading is what {{^x}} is for",
              "Nothing overdue." in out, True)

        out2 = render.render(path, {"next_step": "Draft it",
                                     "overdue": [{"title": "A late one"}]})
        check("a filled placeholder keeps its line", "Next: Draft it" in out2, True)
        check("a non-empty list renders its rows", "- A late one" in out2, True)
        check("and the {{^x}} empty case does not also render",
              "Nothing overdue." in out2, False)

        cap_path = os.path.join(tmp, "cap.md")
        with open(cap_path, "w", encoding="utf-8") as fh:
            fh.write("---\nname: cap\nuse: a test\nlines: 4\n---\n"
                      "{{#overdue}}\n- {{title}}\n{{/overdue}}\n")
        out3 = render.render(cap_path, {"overdue": [
            {"title": "one"}, {"title": "two"}, {"title": "three"},
            {"title": "four"}, {"title": "five"}]})
        check("lines: is a hard ceiling, cut from the bottom",
              out3.rstrip("\n").split("\n")[-1].startswith("+"), True)
        check("never past the ceiling", len(out3.rstrip("\n").split("\n")) <= 4, True)

        html_path = os.path.join(tmp, "h.md")
        with open(html_path, "w", encoding="utf-8") as fh:
            fh.write("---\nname: h\nuse: x\n---\n{{title}}\n")
        out4 = render.render(html_path, {"title": "Foundations <> Components"})
        check("this is plain text, not HTML — no entity-escaping survives",
              out4.strip(), "Foundations <> Components")
    finally:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    test_today_view()
    test_meeting_view()
    test_agenda_topics()
    test_archive_and_period_view()
    test_cancelled_work_is_not_counted_as_finished()
    test_render_empty_line_and_heading_rules()
    if FAILED:
        print("\n%d failed\n" % len(FAILED))
        for f in FAILED:
            print("  " + f)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
