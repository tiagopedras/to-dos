#!/usr/bin/env python3
"""Rename the two agents inside the data they have already written.

The folders became `agents/planning_agent/` and `agents/implementing_agent/` on
12 Sep 2026, and the names they write into their own documents went with them:
`night-agent` is `planning-agent`, `execution-agent` is `implementing-agent`.
Plans and runs already on disk still carry the old spellings in `owner:` and
`agent:`, and `ledger.json` carries them in `owner`, so this rewrites them.

Nothing depends on this having been run. Both streams keep an `owner_legacy`
map in their manifest, so a document carrying an old spelling still resolves —
the same arrangement the `legacy` block already gives the five status words
this stream used until 11 Sep 2026. This is the tidy-up, not the fix.

    python3 core/migrations/migrate-agent-names.py            # say what would change
    python3 core/migrations/migrate-agent-names.py --apply    # change it

Safe to run twice: a file already carrying the new spelling is left alone.
"""

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, "data")

# Longest first, so `pa-plan-design-system` is not left as `pa-planning-...`.
OWNERS = {
    "night-agent": "planning-agent",
    "execution-agent": "implementing-agent",
}
# The `agent:` field says which brief wrote a plan. It is display-only — the
# board prints it in the card's meta line and nothing matches on it — which is
# why `pa-plan-*`, dropped as a prefix on 7 Sep 2026, is still sitting in files
# written before then. Tidied here for the same reason, not because it breaks.
STREAMS = ("design-system", "general", "people", "processes", "strategic", "work-oversight")
AGENTS = {}
for s in STREAMS:
    AGENTS["pa-plan-%s" % s] = "planning-%s" % s
    AGENTS["plan-%s" % s] = "planning-%s" % s
AGENTS.update(OWNERS)


def _sub(line, key, table):
    m = re.match(r"^(%s:\s*)(\S+)\s*$" % re.escape(key), line)
    if not m or m.group(2) not in table:
        return line
    return "%s%s\n" % (m.group(1), table[m.group(2)])


def doc(path, apply):
    with open(path, encoding="utf-8") as fh:
        lines = fh.readlines()
    out, changed = [], 0
    for line in lines:
        new = _sub(line, "owner", OWNERS)
        if new == line:
            new = _sub(line, "agent", AGENTS)
        if new != line:
            changed += 1
        out.append(new)
    if changed and apply:
        with open(path, "w", encoding="utf-8") as fh:
            fh.writelines(out)
    return changed


def ledger(path, apply):
    try:
        with open(path, encoding="utf-8") as fh:
            rows = json.load(fh)
    except (OSError, ValueError):
        return 0
    changed = 0
    for row in rows if isinstance(rows, list) else rows.values():
        if not isinstance(row, dict):
            continue
        if row.get("owner") in OWNERS:
            row["owner"] = OWNERS[row["owner"]]
            changed += 1
        if row.get("agent") in AGENTS:
            row["agent"] = AGENTS[row["agent"]]
            changed += 1
    if changed and apply:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(rows, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    return changed


def main():
    apply = "--apply" in sys.argv
    total, touched = 0, 0
    for dataset in sorted(os.listdir(DATA)):
        base = os.path.join(DATA, dataset)
        if not os.path.isdir(base) or dataset.startswith("."):
            continue
        for sub in ("plans", "runs"):
            folder = os.path.join(base, sub)
            for here, _dirs, names in os.walk(folder):
                for name in sorted(names):
                    path = os.path.join(here, name)
                    n = ledger(path, apply) if name == "ledger.json" else \
                        doc(path, apply) if name.endswith(".md") else 0
                    if n:
                        total += n
                        touched += 1
                        print("  %-3d %s" % (n, os.path.relpath(path, ROOT)))
    if not touched:
        print("nothing to change — every document already names the two agents as they are called now")
        return
    print("\n%d line(s) across %d file(s)%s" % (total, touched, "" if apply else " — rerun with --apply"))


if __name__ == "__main__":
    main()
