#!/usr/bin/env python3
"""The two routes behind the bucket editor's Brief button.

    python3 kanban/test_bucket_brief.py

No browser, and — unlike every other suite that talks to this server — no
running board either. It starts a `Handler` of its own on an ephemeral port
with `dataset_dir()` and `current_dataset()` pointed at a temporary folder, so
the dataset pointer in `data/.current` is never touched and nothing under
`data/` is read or written. That matters more here than usual: a brief is real
content, and `data/.current` is one file shared by every tab and session
pointed at the live server.

What it holds to:

  * a brief resolves through `bucket_stream()`, so the board edits the file
    the planning agents actually read;
  * a bucket with no brief yet opens on the template in `BUCKETS.md`, and
    saving writes it;
  * the marker line is reported rather than judged — a file that still carries
    it reads as unfilled on the way in and on the way out;
  * the write refuses anything that is not the board, and the todo.md guard
    on `do_PUT` is untouched by the new branch above it.
"""

import http.server
import json
import os
import shutil
import sys
import tempfile
import threading
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "kanban"))

import server  # noqa: E402

PASS = []
FAIL = []


def ok(label, cond, detail=""):
    (PASS if cond else FAIL).append(label if cond else
                                    (label + (" — " + detail if detail else "")))


def request(base, method, path, body=None, headers=None):
    req = urllib.request.Request(base + path, method=method,
                                 data=body.encode("utf-8") if body else None,
                                 headers=headers or {})
    try:
        with urllib.request.urlopen(req) as res:
            return res.status, res.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode("utf-8")


def main():
    tmp = tempfile.mkdtemp(prefix="brief-test-")
    # Every path the routes touch resolves through these two, so pointing them
    # at a temp folder is the whole of the isolation.
    server.dataset_dir = lambda name=None: tmp
    server.current_dataset = lambda: "brief-test"

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    base = "http://127.0.0.1:%d" % httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    try:
        # --- a bucket with no brief yet ---------------------------------------
        code, body = request(base, "GET", "/bucket-brief.json?bucket=1.%20People")
        ok("a brief with no file answers 200", code == 200, "got %d" % code)
        got = json.loads(body)
        ok("it resolves the stream through bucket_stream()", got["stream"] == "people",
           "got %r" % got.get("stream"))
        ok("and names the file the agents read",
           got["path"].endswith(os.path.join("people", "people.md")), got.get("path", ""))
        ok("it says the file is not there yet", got["exists"] is False)
        ok("and opens on the BUCKETS.md template", "## The processes I run in this bucket" in got["text"])
        ok("the template still carries the empty marker", got["marker"] in got["text"])
        ok("so nothing reads as filled", got["filled"] is False)
        ok("and People is not the fallback", got["fallback"] is False)

        # --- a bucket nobody has written a planner for --------------------------
        # It used to fall back to the `general` stream and share `general`'s
        # brief; since 17 Sep 2026 the heading is the stream, so it gets a brief
        # of its own and what is missing is the planner that would read it.
        code, body = request(base, "GET", "/bucket-brief.json?bucket=9.%20Nothing%20maps%20here")
        got = json.loads(body)
        ok("a new heading gets a stream of its own", got["stream"] == "nothing-maps-here",
           "got %r" % got.get("stream"))
        ok("and the reply says no planner reads it yet", got["fallback"] is True)

        # --- the write ---------------------------------------------------------
        written = "# People\n\nWhat lands in this bucket.\n"
        code, body = request(base, "PUT", "/bucket-brief",
                             json.dumps({"bucket": "1. People", "text": written}),
                             {"Content-Type": "application/json", "X-Board": "1"})
        ok("a brief can be written", code == 200, "got %d: %s" % (code, body))
        ok("and the reply says it is filled in", json.loads(body)["filled"] is True)
        on_disk = os.path.join(tmp, "buckets", "people", "people.md")
        ok("the file lands where the agents look", os.path.isfile(on_disk))
        with open(on_disk, encoding="utf-8") as fh:
            ok("with exactly what was sent", fh.read() == written)
        ok("and no temp file is left beside it", not os.path.exists(on_disk + ".tmp"))

        # --- reading it back ---------------------------------------------------
        code, body = request(base, "GET", "/bucket-brief.json?bucket=1.%20People")
        got = json.loads(body)
        ok("the brief reads back whole", got["text"] == written)
        ok("and now exists", got["exists"] is True and got["filled"] is True)

        # --- a brief still carrying the marker is not filled --------------------
        request(base, "PUT", "/bucket-brief",
                json.dumps({"bucket": "1. People", "text": "# People\n\n" + server.planning_agent_plan.BRIEF_EMPTY + "\n"}),
                {"Content-Type": "application/json", "X-Board": "1"})
        code, body = request(base, "GET", "/bucket-brief.json?bucket=1.%20People")
        got = json.loads(body)
        ok("a brief still holding the marker reads as unfilled",
           got["exists"] is True and got["filled"] is False)

        # --- the guards --------------------------------------------------------
        code, _ = request(base, "PUT", "/bucket-brief",
                          json.dumps({"bucket": "1. People", "text": "x"}),
                          {"Content-Type": "application/json"})
        ok("a write that is not from the board is refused", code == 403, "got %d" % code)

        code, _ = request(base, "PUT", "/bucket-brief", json.dumps({"text": "x"}),
                          {"Content-Type": "application/json", "X-Board": "1"})
        ok("a write with no bucket is refused", code == 400, "got %d" % code)

        code, _ = request(base, "GET", "/bucket-brief.json?bucket=")
        ok("a read with no bucket is refused", code == 400, "got %d" % code)

        # The branch added above do_PUT's own guard must not have widened it.
        code, _ = request(base, "PUT", "/data/people.md", "hello",
                          {"Content-Type": "text/markdown", "X-Board": "1"})
        ok("do_PUT still refuses anything but todo.md", code == 404, "got %d" % code)
    finally:
        httpd.shutdown()
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n%d passed" % len(PASS))
    for f in FAIL:
        print("  FAIL  " + f)
    if FAIL:
        print("\n%d failed\n" % len(FAIL))
        sys.exit(1)
    print("")


if __name__ == "__main__":
    main()
