"""Tests for the alerts endpoint (VAL-ALERTS-001 .. VAL-ALERTS-005, VAL-ERR-001/002/003).

Covers GET /api/sessions/{id}/alerts: 8-field well-formed alerts scoped to the
session, valid lap references + t_ms bounds, (lap_number, t_ms) ordering +
determinism, severity filter soundness/partition + invalid 422 + unused 200 [],
dataset guarantees (>=1 alert per session, >=1 critical overall), 404 for
unknown session, 422 for non-integer path, and validation precedence.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

ALERT_KEYS = {
    "id",
    "session_id",
    "lap_id",
    "lap_number",
    "t_ms",
    "type",
    "severity",
    "message",
}

VALID_TYPES = {"redline", "tire_overtemp", "brake_lock", "fuel_low"}
VALID_SEVERITIES = {"info", "warning", "critical"}


def _laps(client: TestClient, sid: int) -> list[dict[str, object]]:
    return client.get(f"/api/sessions/{sid}/laps").json()


# ---------------------------------------------------------------------------
# VAL-ALERTS-001: well-formed alerts scoped to the session
# ---------------------------------------------------------------------------


def test_alerts_returns_200_json_array(client: TestClient) -> None:
    """GET /api/sessions/1/alerts -> 200, JSON content-type, top-level array."""
    resp = client.get("/api/sessions/1/alerts")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    assert isinstance(resp.json(), list)


def test_alerts_have_eight_fields_correct_types(client: TestClient) -> None:
    """Every alert has the 8 fields with correct types and in-enum type/severity."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/alerts").json()
        assert body, f"session {sid} should have alerts"
        for a in body:
            assert set(a.keys()) == ALERT_KEYS
            assert isinstance(a["id"], int) and a["id"] > 0
            assert isinstance(a["session_id"], int)
            assert isinstance(a["lap_id"], int)
            assert isinstance(a["lap_number"], int)
            assert isinstance(a["t_ms"], int) and a["t_ms"] >= 0
            assert isinstance(a["type"], str) and a["type"] in VALID_TYPES
            assert isinstance(a["severity"], str) and a["severity"] in VALID_SEVERITIES
            assert isinstance(a["message"], str) and a["message"] != ""


def test_alerts_scoped_to_session(client: TestClient) -> None:
    """Every alert's session_id equals the path id; ids are unique."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/alerts").json()
        assert all(a["session_id"] == sid for a in body)
        ids = [a["id"] for a in body]
        assert len(set(ids)) == len(ids)


# ---------------------------------------------------------------------------
# VAL-ALERTS-002: valid lap references + t_ms bounds
# ---------------------------------------------------------------------------


def test_alerts_reference_valid_lap_and_t_ms_bounds(client: TestClient) -> None:
    """Each alert's lap_number is in 1..total_laps, lap_id matches, t_ms <= lap_time."""
    for sid in (1, 2, 3):
        laps = _laps(client, sid)
        id_to_number = {lap["id"]: lap["lap_number"] for lap in laps}
        id_to_time = {lap["id"]: lap["lap_time_ms"] for lap in laps}
        lap_numbers = {lap["lap_number"] for lap in laps}
        body = client.get(f"/api/sessions/{sid}/alerts").json()
        for a in body:
            assert a["lap_number"] in lap_numbers
            assert id_to_number[a["lap_id"]] == a["lap_number"]
            assert 0 <= a["t_ms"] <= id_to_time[a["lap_id"]]


# ---------------------------------------------------------------------------
# VAL-ALERTS-003: ordering by (lap_number, t_ms) + determinism
# ---------------------------------------------------------------------------


def test_alerts_ordered_by_lap_then_t_ms(client: TestClient) -> None:
    """The alerts array is ordered ascending by (lap_number, t_ms)."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/alerts").json()
        seq = [(a["lap_number"], a["t_ms"]) for a in body]
        assert seq == sorted(seq)


def test_alerts_deterministic_across_calls(client: TestClient) -> None:
    """Identical requests return byte-identical bodies (also for ?severity=critical)."""
    for sid in (1, 2, 3):
        a = client.get(f"/api/sessions/{sid}/alerts").json()
        b = client.get(f"/api/sessions/{sid}/alerts").json()
        assert a == b
        c = client.get(f"/api/sessions/{sid}/alerts?severity=critical").json()
        d = client.get(f"/api/sessions/{sid}/alerts?severity=critical").json()
        assert c == d


# ---------------------------------------------------------------------------
# VAL-ALERTS-004: severity filter soundness, partition, invalid 422, unused 200 []
# ---------------------------------------------------------------------------


def test_severity_filter_returns_only_that_severity(client: TestClient) -> None:
    """?severity=S returns 200 with only alerts of that severity."""
    for sid in (1, 2, 3):
        for sev in VALID_SEVERITIES:
            resp = client.get(f"/api/sessions/{sid}/alerts?severity={sev}")
            assert resp.status_code == 200
            body = resp.json()
            assert all(a["severity"] == sev for a in body)


def test_severity_filter_partitions_the_set(client: TestClient) -> None:
    """info + warning + critical counts sum to the unfiltered count."""
    for sid in (1, 2, 3):
        total = len(client.get(f"/api/sessions/{sid}/alerts").json())
        parts = sum(
            len(client.get(f"/api/sessions/{sid}/alerts?severity={sev}").json())
            for sev in VALID_SEVERITIES
        )
        assert parts == total


def test_invalid_severity_returns_422(client: TestClient) -> None:
    """?severity=bogus -> 422 with detail array."""
    resp = client.get("/api/sessions/1/alerts?severity=bogus")
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)


def test_unused_severity_returns_200_empty(client: TestClient) -> None:
    """A valid-but-unused severity returns 200 [] (session 2 has no critical)."""
    resp = client.get("/api/sessions/2/alerts?severity=critical")
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# VAL-ALERTS-005: dataset guarantees
# ---------------------------------------------------------------------------


def test_each_session_has_at_least_one_alert(client: TestClient) -> None:
    """Every session returns a non-empty alerts array."""
    for sid in (1, 2, 3):
        assert len(client.get(f"/api/sessions/{sid}/alerts").json()) >= 1


def test_at_least_one_critical_overall(client: TestClient) -> None:
    """Summing ?severity=critical across sessions yields >=1 critical alert."""
    total_critical = sum(
        len(client.get(f"/api/sessions/{sid}/alerts?severity=critical").json())
        for sid in (1, 2, 3)
    )
    assert total_critical >= 1


# ---------------------------------------------------------------------------
# VAL-ERR-001 / VAL-ERR-002 / VAL-ERR-003: 404, non-integer path, precedence
# ---------------------------------------------------------------------------


def test_unknown_session_returns_404_canonical(client: TestClient) -> None:
    """Unknown session id -> 404 canonical body on /alerts."""
    for bad_id in (9999, 0, -1):
        resp = client.get(f"/api/sessions/{bad_id}/alerts")
        assert resp.status_code == 404, bad_id
        assert resp.json() == {"detail": "Session not found"}


def test_non_integer_path_returns_422(client: TestClient) -> None:
    """Non-integer path segment -> 422 with detail array."""
    resp = client.get("/api/sessions/abc/alerts")
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)


def test_validation_precedes_not_found(client: TestClient) -> None:
    """VAL-ERR-003: unknown session + invalid severity -> 422 (not 404)."""
    resp = client.get("/api/sessions/9999/alerts?severity=bogus")
    assert resp.status_code == 422
