#!/usr/bin/env bash
# idempotent installer: creates virtualenv, installs backend requirements, and installs frontend deps.
# Usage: ./install_deps.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

info() { printf "[INFO] %s\n" "$1"; }
succ() { printf "[OK]   %s\n" "$1"; }
err() { printf "[ERROR] %s\n" "$1"; }

if ! command -v python >/dev/null 2>&1; then
  err "python not found on PATH. Install Python and re-run."
  exit 2
fi

VENV_DIR="${REPO_ROOT}/.venv"
PYTHON=python

if [ ! -d "$VENV_DIR" ]; then
  info "Creating virtualenv at $VENV_DIR"
  $PYTHON -m venv "$VENV_DIR"
fi

VENV_PY="$VENV_DIR/bin/python"
if [ ! -x "$VENV_PY" ]; then
  VENV_PY="$PYTHON"
fi

info "Upgrading pip and installing backend requirements"
$VENV_PY -m pip install --upgrade pip
$VENV_PY -m pip install -r backend/requirements.txt
succ "Backend requirements installed"

if [ -d frontend ]; then
  info "Installing frontend dependencies (npm ci)"
  if command -v npm >/dev/null 2>&1; then
    (cd frontend && npm ci)
    succ "Frontend deps installed"
  else
    err "npm not found on PATH — skipping frontend install"
  fi
else
  warn() { printf "[WARN]  %s\n" "$1"; }
  warn "No frontend directory present; skipping frontend install"
fi

succ "All install steps complete"