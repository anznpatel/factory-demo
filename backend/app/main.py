"""FastAPI application: CORS middleware + health endpoint + startup seeding.

CORS is configured from the very first backend feature so the cross-origin
path (http://localhost:5173 -> :8000) is validated, never patched later.
On startup the app initializes the schema and seeds the demo dataset if the
DB is empty (seed_demo is idempotent).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.generator import seed_demo
from app.routers import sessions as sessions_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Initialize schema and seed the demo dataset on startup if empty."""
    init_db()
    seed_demo()
    yield


app = FastAPI(title="Trackside Telemetry API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(sessions_router.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Liveness probe. Returns the canonical {"status": "ok"} body."""
    return {"status": "ok"}
