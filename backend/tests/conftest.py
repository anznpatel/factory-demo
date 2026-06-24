"""Pytest fixtures: a sync ASGI client against the FastAPI app.

This harness is the test entrypoint for the backend. Tests use FastAPI's
TestClient (a sync wrapper over httpx's ASGI transport) to exercise the app
in-process without binding a port.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture()
def client() -> Iterator[TestClient]:
    """A sync TestClient that talks to the FastAPI app over ASGI in-process."""
    with TestClient(app) as c:
        yield c
