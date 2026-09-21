#!/usr/bin/env python3
"""The planning agent's entry point. The night is run by the shared runner
(PACKAGES/agents_engine/RUNNER.md); this puts it on the path and hands it
hooks.py. `python3 run.py --help` lists the commands."""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "..", "..", "PACKAGES", "agents_engine", "python")))

import hooks  # noqa: E402
from agents_engine.runner import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main(hooks, HERE))
