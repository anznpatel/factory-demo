"""Tests for the /api/health endpoint (VAL-HEALTH-001)."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    """GET /api/health returns 200 with body exactly {"status":"ok"} and JSON content-type."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    assert resp.headers["content-type"].startswith("application/json")


def test_health_ignores_extraneous_query_params(client: TestClient) -> None:
    """Extraneous query params do not change the health response (VAL-HEALTH-001)."""
    resp = client.get("/api/health", params={"foo": "bar", "x": "1"})
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
