"""Cross-cutting error-semantics matrix (VAL-ERR-001 .. VAL-ERR-005).

This module consolidates the full error matrix in one place, verifying that
every /api/sessions/{id} and /api/sessions/{id}/* route (detail, laps,
telemetry, alerts) behaves consistently for:

- VAL-ERR-001: unknown integer id (9999, boundary 0 and -1) -> 404 canonical
  {"detail":"Session not found"} with JSON content-type.
- VAL-ERR-002: non-integer path id (abc) -> 422 FastAPI validation-error array.
- VAL-ERR-003: query-param validation precedes not-found (unknown id + bad
  query param -> 422, not 404).
- VAL-ERR-004: every 422 body has a detail array whose elements contain loc,
  msg, and type, with JSON content-type.
- VAL-ERR-005: generic 404 {"detail":"Not Found"} for an unknown top-level
  path; 404 for an unknown sub-resource under a valid session; 405 for a
  non-GET (POST) method on a GET route.

The four sub-routes exercised: "" (detail), "/laps", "/telemetry", "/alerts".
"""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

# The four sub-routes under /api/sessions/{id} that the matrix covers.
# Each entry is (subroute_suffix, has_query_param_precedence_case).
SUBROUTES: tuple[str, ...] = ("", "/laps", "/telemetry", "/alerts")

# Unknown-but-valid integer ids that must yield 404 "Session not found".
UNKNOWN_INT_IDS: tuple[int, ...] = (9999, 0, -1)

# Canonical 404 body for an unknown session.
SESSION_NOT_FOUND = {"detail": "Session not found"}

# Generic FastAPI 404 body for an unrouted path.
NOT_FOUND = {"detail": "Not Found"}


def _sub(route: str) -> str:
    """Build the path for a sub-route suffix (empty string means detail)."""
    return f"/api/sessions/{{id}}{route}"


# ---------------------------------------------------------------------------
# VAL-ERR-001: unknown integer id -> 404 canonical on every sub-route
# ---------------------------------------------------------------------------


def test_unknown_integer_id_404_canonical_on_every_subroute(client: TestClient) -> None:
    """9999, 0, -1 -> 404 {"detail":"Session not found"} on detail/laps/telemetry/alerts."""
    for bad_id in UNKNOWN_INT_IDS:
        for suffix in SUBROUTES:
            path = _sub(suffix).format(id=bad_id)
            resp = client.get(path)
            assert resp.status_code == 404, f"GET {path}"
            assert resp.headers["content-type"].startswith("application/json"), path
            assert resp.json() == SESSION_NOT_FOUND, f"GET {path}"


def test_unknown_id_9999_detail_404(client: TestClient) -> None:
    """GET /api/sessions/9999 -> 404 canonical."""
    resp = client.get("/api/sessions/9999")
    assert resp.status_code == 404
    assert resp.json() == SESSION_NOT_FOUND


def test_boundary_id_zero_404_on_all_subroutes(client: TestClient) -> None:
    """id=0 -> 404 canonical on detail/laps/telemetry/alerts."""
    for suffix in SUBROUTES:
        path = _sub(suffix).format(id=0)
        resp = client.get(path)
        assert resp.status_code == 404, path
        assert resp.json() == SESSION_NOT_FOUND, path


def test_boundary_id_negative_one_404_on_all_subroutes(client: TestClient) -> None:
    """id=-1 -> 404 canonical on detail/laps/telemetry/alerts."""
    for suffix in SUBROUTES:
        path = _sub(suffix).format(id=-1)
        resp = client.get(path)
        assert resp.status_code == 404, path
        assert resp.json() == SESSION_NOT_FOUND, path


# ---------------------------------------------------------------------------
# VAL-ERR-002: non-integer path id -> 422 on every sub-route
# ---------------------------------------------------------------------------


def test_non_integer_path_422_on_every_subroute(client: TestClient) -> None:
    """abc -> 422 with a detail array on detail/laps/telemetry/alerts."""
    for suffix in SUBROUTES:
        path = _sub(suffix).format(id="abc")
        resp = client.get(path)
        assert resp.status_code == 422, f"GET {path}"
        body = resp.json()
        assert isinstance(body["detail"], list), path
        assert body["detail"], f"detail array must be non-empty: {path}"


# ---------------------------------------------------------------------------
# VAL-ERR-003: query-param validation precedes not-found
# ---------------------------------------------------------------------------


def test_validation_precedes_not_found_telemetry(client: TestClient) -> None:
    """Unknown session + malformed lap query -> 422 (not 404)."""
    resp = client.get("/api/sessions/9999/telemetry?lap=abc")
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)


def test_validation_precedes_not_found_alerts(client: TestClient) -> None:
    """Unknown session + invalid severity query -> 422 (not 404)."""
    resp = client.get("/api/sessions/9999/alerts?severity=bogus")
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)


def test_validation_precedes_not_found_unknown_signal(client: TestClient) -> None:
    """Unknown session + unknown signal -> 422 (not 404)."""
    resp = client.get("/api/sessions/9999/telemetry?signals=foo")
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)


def test_validation_precedes_not_found_boundary_id(client: TestClient) -> None:
    """Boundary id 0 + malformed lap -> 422 (validation before not-found)."""
    resp = client.get("/api/sessions/0/telemetry?lap=abc")
    assert resp.status_code == 422


def test_unknown_session_with_valid_query_still_404(client: TestClient) -> None:
    """Unknown session + valid query param -> 404 (no validation error to surface)."""
    resp = client.get("/api/sessions/9999/telemetry?lap=1")
    assert resp.status_code == 404
    assert resp.json() == SESSION_NOT_FOUND


# ---------------------------------------------------------------------------
# VAL-ERR-004: 422 body structure (loc/msg/type) + JSON content-type
# ---------------------------------------------------------------------------


def _assert_422_structure(resp: Any, path: str) -> None:
    """Assert a 422 response has the FastAPI validation-error structure.

    The TestClient response object is duck-typed (status_code, headers, json).
    """
    assert resp.status_code == 422, path
    assert resp.headers["content-type"].startswith("application/json"), path
    body = resp.json()
    assert isinstance(body["detail"], list), path
    assert body["detail"], f"detail array non-empty: {path}"
    for item in body["detail"]:
        assert {"loc", "msg", "type"} <= set(item.keys()), f"{path}: {item}"


def test_422_structure_non_integer_path_all_subroutes(client: TestClient) -> None:
    """Every non-integer-path 422 has detail[] items with loc/msg/type + JSON ct."""
    for suffix in SUBROUTES:
        path = _sub(suffix).format(id="abc")
        _assert_422_structure(client.get(path), path)


def test_422_structure_telemetry_bad_lap(client: TestClient) -> None:
    """422 for ?lap=abc has the validation-error structure."""
    _assert_422_structure(
        client.get("/api/sessions/1/telemetry?lap=abc"),
        "/api/sessions/1/telemetry?lap=abc",
    )


def test_422_structure_telemetry_unknown_signal(client: TestClient) -> None:
    """422 for ?signals=foo has the validation-error structure."""
    _assert_422_structure(
        client.get("/api/sessions/1/telemetry?signals=foo"),
        "/api/sessions/1/telemetry?signals=foo",
    )


def test_422_structure_telemetry_max_points_out_of_range(client: TestClient) -> None:
    """422 for ?max_points=5001 has the validation-error structure."""
    _assert_422_structure(
        client.get("/api/sessions/1/telemetry?max_points=5001"),
        "/api/sessions/1/telemetry?max_points=5001",
    )


def test_422_structure_alerts_bad_severity(client: TestClient) -> None:
    """422 for ?severity=bogus has the validation-error structure."""
    _assert_422_structure(
        client.get("/api/sessions/1/alerts?severity=bogus"),
        "/api/sessions/1/alerts?severity=bogus",
    )


def test_422_structure_precedence_telemetry(client: TestClient) -> None:
    """The precedence 422 (unknown id + bad lap) has the validation structure."""
    _assert_422_structure(
        client.get("/api/sessions/9999/telemetry?lap=abc"),
        "/api/sessions/9999/telemetry?lap=abc",
    )


def test_422_structure_precedence_alerts(client: TestClient) -> None:
    """The precedence 422 (unknown id + bad severity) has the validation structure."""
    _assert_422_structure(
        client.get("/api/sessions/9999/alerts?severity=bogus"),
        "/api/sessions/9999/alerts?severity=bogus",
    )


# ---------------------------------------------------------------------------
# VAL-ERR-005: routing & method semantics (generic 404, sub-resource 404, 405)
# ---------------------------------------------------------------------------


def test_unknown_top_level_path_404_generic(client: TestClient) -> None:
    """GET /api/does-not-exist -> 404 {"detail":"Not Found"} (distinct from canonical)."""
    resp = client.get("/api/does-not-exist")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json() == NOT_FOUND
    # Distinct from the session not-found body.
    assert resp.json() != SESSION_NOT_FOUND


def test_unknown_top_level_path_not_session_message(client: TestClient) -> None:
    """The generic 404 must NOT say 'Session not found'."""
    body = client.get("/api/does-not-exist").json()
    assert body["detail"] == "Not Found"


def test_unknown_subresource_under_valid_session_404(client: TestClient) -> None:
    """GET /api/sessions/1/bogus -> 404 (unknown sub-resource under a valid session)."""
    resp = client.get("/api/sessions/1/bogus")
    assert resp.status_code == 404


def test_unknown_subresource_under_unknown_session_404(client: TestClient) -> None:
    """GET /api/sessions/9999/bogus -> 404 (no route matches)."""
    resp = client.get("/api/sessions/9999/bogus")
    assert resp.status_code == 404


def test_post_method_not_allowed_on_health(client: TestClient) -> None:
    """POST /api/health -> 405 (health is GET-only)."""
    resp = client.post("/api/health")
    assert resp.status_code == 405


def test_post_method_not_allowed_on_sessions_list(client: TestClient) -> None:
    """POST /api/sessions -> 405."""
    resp = client.post("/api/sessions")
    assert resp.status_code == 405


def test_post_method_not_allowed_on_session_detail(client: TestClient) -> None:
    """POST /api/sessions/1 -> 405."""
    resp = client.post("/api/sessions/1")
    assert resp.status_code == 405


def test_post_method_not_allowed_on_laps(client: TestClient) -> None:
    """POST /api/sessions/1/laps -> 405."""
    resp = client.post("/api/sessions/1/laps")
    assert resp.status_code == 405


def test_post_method_not_allowed_on_telemetry(client: TestClient) -> None:
    """POST /api/sessions/1/telemetry -> 405."""
    resp = client.post("/api/sessions/1/telemetry")
    assert resp.status_code == 405


def test_post_method_not_allowed_on_alerts(client: TestClient) -> None:
    """POST /api/sessions/1/alerts -> 405."""
    resp = client.post("/api/sessions/1/alerts")
    assert resp.status_code == 405


def test_post_405_has_allow_header(client: TestClient) -> None:
    """A 405 response advertises the allowed GET method in the Allow header."""
    resp = client.post("/api/sessions/1/telemetry")
    assert resp.status_code == 405
    allow = resp.headers.get("allow", "")
    assert "GET" in allow


# ---------------------------------------------------------------------------
# Cross-cutting: content-type consistency for 404 canonical responses
# ---------------------------------------------------------------------------


def test_canonical_404_json_content_type_all_subroutes(client: TestClient) -> None:
    """Every canonical session-404 has a JSON content-type."""
    for suffix in SUBROUTES:
        path = _sub(suffix).format(id=9999)
        resp = client.get(path)
        assert resp.status_code == 404, path
        assert resp.headers["content-type"].startswith("application/json"), path


def test_valid_session_routes_return_200(client: TestClient) -> None:
    """Sanity: the valid session 1 returns 200 on every sub-route (no false 404)."""
    for suffix in SUBROUTES:
        path = _sub(suffix).format(id=1)
        resp = client.get(path)
        assert resp.status_code == 200, f"GET {path}"
        assert resp.headers["content-type"].startswith("application/json"), path
