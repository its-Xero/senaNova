# Makefile for common tasks
VENV=.venv
PYTHON=$(VENV)/bin/python
NPM=npm --prefix frontend

.PHONY: all setup start test build lint ci clean

all: ci

setup:
	@echo "[INFO] Setting up virtualenv and installing backend deps..."
	@if [ ! -d $(VENV) ]; then python -m venv $(VENV); fi
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r backend/requirements.txt
	@if [ -d frontend ] && [ ! -d frontend/node_modules ]; then cd frontend && npm install; fi

start:
	@echo "[INFO] Start backend and frontend (dev mode)"
	$(PYTHON) backend/run.py &
	$(NPM) run dev &

test:
	@echo "[INFO] Running backend tests"
	$(PYTHON) -m pytest -q

build:
	@echo "[INFO] Building frontend"
	$(NPM) run build

lint:
	@echo "[INFO] Running frontend lint"
	$(NPM) run lint

ci: setup test build lint
	@echo "[OK] CI tasks complete"

clean:
	@echo "[INFO] Cleaning virtualenv and node_modules (optional)"
	rm -rf $(VENV) frontend/node_modules frontend/.next
