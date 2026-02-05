"""Run script for FastAPI backend (development).

Usage:
    python backend/run.py

This launches uvicorn for `backend.app.main:app` on 0.0.0.0:8000 with reload.
"""
import os
import uvicorn

if __name__ == '__main__':
    host = os.getenv('HOST', '0.0.0.0')
    port = int(os.getenv('PORT', '8000'))
    uvicorn.run('app.main:app', host=host, port=port, reload=True)
