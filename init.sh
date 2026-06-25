#!/usr/bin/env bash
#
# Idempotent environment setup for the Trackside Telemetry Visualization Pipeline.
# Creates the backend Python 3.12 venv + installs backend requirements, and
# installs frontend dependencies. Safe to re-run: it skips work already done.
# It does NOT seed the database or start any servers (see README "Running").
set -euo pipefail

# Anchor every path to this script's own directory (the repo root) so the script
# behaves identically from any working directory and never hard-codes a path.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Best-effort: ensure python3.12-venv (required to build the venv). If it is
# missing and apt/sudo are unavailable, continue; venv creation below surfaces a
# clear error if the tooling is genuinely absent.
if command -v dpkg >/dev/null 2>&1 && ! dpkg -s python3.12-venv >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update -qq && sudo apt-get install -y python3.12-venv \
      || echo "init.sh: warning: could not install python3.12-venv (continuing)"
  else
    echo "init.sh: warning: python3.12-venv missing and apt/sudo unavailable (continuing)"
  fi
fi

# Backend: create the Python 3.12 venv if absent, then install requirements.
if [ -d "$BACKEND_DIR" ]; then
  if [ ! -d "$BACKEND_DIR/.venv" ]; then
    PYTHON_BIN="$(command -v python3.12 || command -v python3)"
    "$PYTHON_BIN" -m venv "$BACKEND_DIR/.venv"
    "$BACKEND_DIR/.venv/bin/pip" install --upgrade pip
  fi
  if [ -f "$BACKEND_DIR/requirements.txt" ]; then
    "$BACKEND_DIR/.venv/bin/pip" install -q -r "$BACKEND_DIR/requirements.txt"
  fi
fi

# Frontend: install node_modules only when absent.
if [ -f "$FRONTEND_DIR/package.json" ] && [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  (cd "$FRONTEND_DIR" && npm install)
fi

echo "init.sh: environment ready"
