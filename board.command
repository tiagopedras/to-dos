#!/bin/bash
# Double-click this file to open the to-do board.
cd "$(dirname "$0")" || exit 1
exec /usr/bin/env python3 kanban/server.py
