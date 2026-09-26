#!/usr/bin/env python3
"""The Implement agent's unattended entry point. The run is the shared runner's
(PACKAGES/agents-engine/RUNNER.md); this puts it on the path and hands it
hooks.py. Off until its hours are set on the agents dashboard. The /do skill is
still how it runs with him in the room. `python3 run.py --help` lists the
commands."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..", "..", "PACKAGES", "agents-engine", "python")))
sys.path.insert(0, HERE)

import hooks  # noqa: E402
from agents_engine.runner import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(hooks, HERE))
