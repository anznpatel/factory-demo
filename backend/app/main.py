"""FastAPI application: CORS middleware + health endpoint.

CORS is configured from the very first backend feature so the cross-origin
path (http://localhost:5173 -> :8000) is validated, never patched later.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Trackside Telemetry API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness probe. Returns the canonical {"status": "ok"} body."""
    return {"status": "ok"}
