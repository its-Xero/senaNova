#!/usr/bin/env bash
# Run everything: setup, start backend + frontend, run tests/build/lint, then stop services.
# Usage: ./run_all.sh
# Requires: python, pip, and optionally npm on PATH.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

info() { printf "[INFO] %s\n" "$1"; }
succ() { printf "[OK]   %s\n" "$1"; }
warn() { printf "[WARN] %s\n" "$1"; }
err() { printf "[ERROR] %s\n" "$1"; }

# Prereqs
if ! command -v python >/dev/null 2>&1; then
  err "python not found on PATH. Install Python and re-run."
  exit 2
fi
if ! command -v npm >/dev/null 2>&1; then
  warn "npm not found on PATH. Frontend steps will be skipped."
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
$VENV_PY -m pip install --upgrade pip >/dev/null
$VENV_PY -m pip install -r backend/requirements.txt >/dev/null || { err "pip install failed"; exit 4; }

# Frontend deps
if command -v npm >/dev/null 2>&1; then
  if [ ! -d "frontend/node_modules" ]; then
    info "Installing frontend dependencies"
    (cd frontend && npm install) || warn "npm install failed; frontend tasks may fail"
  else
    info "Frontend dependencies present"
  fi
fi

# Start backend
PIDS=()
info "Starting backend"
"$VENV_PY" backend/run.py >/dev/null 2>&1 &
PIDS+=("$!")
info "Backend PID ${PIDS[-1]}"

# Start frontend
if command -v npm >/dev/null 2>&1; then
  info "Starting frontend (next dev)"
  npm --prefix frontend run dev >/dev/null 2>&1 &
  PIDS+=("$!")
  info "Frontend PID ${PIDS[-1]}"
fi

# Wait for services
wait_for_url() {
  local url="$1" timeout="$2" start ts
  start=$(date +%s)
  while true; do
    if command -v curl >/dev/null 2>&1; then
      if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then return 0; fi
    else
      # try netcat style check (very basic)
      (echo > /dev/tcp/127.0.0.1/${url##*:}) >/dev/null 2>&1 && return 0 || true
    fi
    ts=$(date +%s)
    if [ $((ts - start)) -ge "$timeout" ]; then return 1; fi
    sleep 1
  done
}

if wait_for_url "http://127.0.0.1:8000/docs" 20; then succ "Backend responded at /docs"; else warn "Backend did not respond in time"; fi
if command -v npm >/dev/null 2>&1; then
  if wait_for_url "http://127.0.0.1:3000" 30; then succ "Frontend responded at :3000"; else warn "Frontend did not respond in time"; fi
fi

EXIT_CODE=0
info "Running backend tests (pytest)"
"$VENV_PY" -m pytest -q || EXIT_CODE=1

if command -v npm >/dev/null 2>&1; then
  info "Building frontend"
  (cd frontend && npm run build) || EXIT_CODE=1
  info "Running frontend linter"
  npm --prefix frontend run lint || EXIT_CODE=1
fi

# Cleanup helper
cleanup() {
  info "Stopping background processes"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" || true
      wait "$pid" 2>/dev/null || true
      info "Stopped PID $pid"
    fi
  done
}
trap cleanup EXIT INT TERM

if [ "$EXIT_CODE" -eq 0 ]; then succ "All steps succeeded"; else err "Some steps failed (exit code $EXIT_CODE)"; fi
exit $EXIT_CODE
