"""Tests for CORS behavior on the API (VAL-HEALTH-002, VAL-HEALTH-003).

CORS is built in from the first backend feature. These tests assert:
- the allowed origin http://localhost:5173 is echoed on data routes,
- a disallowed origin is NOT echoed,
- OPTIONS preflight from the allowed origin succeeds advertising GET.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

ALLOWED_ORIGIN = "http://localhost:5173"
DISALLOWED_ORIGIN = "http://evil.example"


def test_allowed_origin_echoed_on_health(client: TestClient) -> None:
    """GET /api/health with the allowed Origin echoes access-control-allow-origin."""
    resp = client.get("/api/health", headers={"Origin": ALLOWED_ORIGIN})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


def test_disallowed_origin_not_echoed(client: TestClient) -> None:
    """A disallowed Origin is not echoed back as access-control-allow-origin."""
    resp = client.get("/api/health", headers={"Origin": DISALLOWED_ORIGIN})
    assert resp.headers.get("access-control-allow-origin") != DISALLOWED_ORIGIN


def test_preflight_succeeds_advertising_get(client: TestClient) -> None:
    """OPTIONS preflight from allowed origin: 200/204, allow-origin set, GET in allow-methods."""
    resp = client.options(
        "/api/health",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.status_code in (200, 204)
    assert resp.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN
    allow_methods = resp.headers.get("access-control-allow-methods", "")
    assert "GET" in allow_methods.upper()


def test_preflight_disallowed_origin_not_echoed(client: TestClient) -> None:
    """OPTIONS preflight from a disallowed origin does not echo that origin."""
    resp = client.options(
        "/api/health",
        headers={
            "Origin": DISALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert resp.headers.get("access-control-allow-origin") != DISALLOWED_ORIGIN
