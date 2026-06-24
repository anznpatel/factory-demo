"""Pytest fixtures: a sync ASGI client against the FastAPI app + a temp DB.

This harness is the test entrypoint for the backend. Tests use FastAPI's
TestClient (a sync wrapper over httpx's ASGI transport) to exercise the app
in-process without binding a port. A ``temp_db`` fixture provides an isolated
SQLite connection (schema initialized) for generator/schema tests so they
never touch the dev DB.
"""

from __future__ import annotations

import os
import tempfile
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.db import connect, init_db
from app.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    """A sync TestClient that talks to the FastAPI app over ASGI in-process."""
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def temp_db() -> Iterator[object]:
    """An isolated SQLite connection with the schema created, in a temp dir.

    Yields a ``sqlite3.Connection`` (dict row factory, foreign keys on) backed
    by a throwaway file that is removed on teardown. Tests that need seeded
    data call ``seed_demo(conn)`` themselves.
    """
    # Ensure the app's startup seeding does not race the temp DB by isolating
    # the connection to a unique temp path (env only affects connect() defaults
    # not this explicit path).
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "test.db")
        conn = connect(path)
        init_db(conn)
        yield conn
        conn.close()
