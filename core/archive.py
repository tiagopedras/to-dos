"""Reads a done-archive.md file — task lines the board has lifted out of
todo.md once they had been ticked off for more than ARCHIVE_DAYS.

The Python side of a gap named twice in IMPROVEMENTS.md: check_todo.py names
the archive only as a file to ignore, and completedRecently() /
parseArchiveEntries() in kanban/js/12-reports.js are the only place that
joins it back to the live list. This is that reading, ported rather than
duplicated — todo.TASK_RE and todo.parse_task() are the same ones the live
document is parsed with, since one archived line is the same grammar as one
live one, just sitting under a "### Bucket · Tier" heading instead of a
"## Bucket" / "### Tier" pair.
"""

import re

import todo

SECTION_RE = re.compile(r"^###\s+(.*)$")


def read_archive(path):
    """Every finished task in a done-archive.md, in file order.

    A line that fails to parse as done with a done_on is skipped rather than
    raising — the archive is append-only and outlives format changes, so an
    old line the current grammar cannot fully place is still worth having in
    the file even where this cannot read it back.
    """
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        return []
    bucket, tier = "", ""
    out = []
    for line in text.replace("\r\n", "\n").split("\n"):
        m = SECTION_RE.match(line)
        if m:
            parts = m.group(1).split(" · ")
            bucket = parts[0].strip() if parts else ""
            tier = parts[1].strip() if len(parts) > 1 else ""
            continue
        if not todo.TASK_RE.match(line):
            continue
        t = todo.parse_task([line])
        if not (t.done and t.done_on):
            continue
        t.bucket, t.column = bucket, tier
        out.append(t)
    return out
