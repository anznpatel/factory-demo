"""Tests for the sessions endpoints (VAL-SESS-001 .. VAL-SESS-006, VAL-ERR-001/002).

Covers GET /api/sessions (list) and GET /api/sessions/{id} (detail + KPIs),
including 404 for unknown integer ids, 422 for non-integer path segments,
JSON content-type, ordering, field/type correctness, KPI cross-consistency,
and determinism across repeated calls.
"""

from __future__ import annotations

import sqlite3

from fastapi.testclient import TestClient

# Seeded identity mapping (architecture.md Section 3 / validation contract).
EXPECTED_SESSIONS = [
    {
        "id": 1,
        "track_name": "Silverstone",
        "car_id": "RB-19",
        "driver": "A. Verstappen",
        "weather": "dry",
        "total_laps": 5,
    },
    {
        "id": 2,
        "track_name": "Monza",
        "car_id": "SF-23",
        "driver": "C. Leclerc",
        "weather": "dry",
        "total_laps": 4,
    },
    {
        "id": 3,
        "track_name": "Suzuka",
        "car_id": "W14",
        "driver": "L. Hamilton",
        "weather": "mixed",
        "total_laps": 6,
    },
]

SUMMARY_KEYS = {
    "id",
    "track_name",
    "car_id",
    "driver",
    "weather",
    "ambient_temp_c",
    "started_at",
    "ended_at",
    "total_laps",
}

KPI_KEYS = {"top_speed_kph", "best_lap_ms", "avg_throttle_pct", "max_tire_temp_c"}

DETAIL_KEYS = SUMMARY_KEYS | {"lap_count", "kpis"}


def test_list_returns_200_json_array(client: TestClient) -> None:
    """VAL-SESS-001: GET /api/sessions -> 200, JSON content-type, top-level array."""
    resp = client.get("/api/sessions")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    body = resp.json()
    assert isinstance(body, list)


def test_list_has_exactly_three_sessions_ordered_by_id(client: TestClient) -> None:
    """VAL-SESS-001: exactly 3 sessions with ids [1,2,3] ascending."""
    body = client.get("/api/sessions").json()
    assert len(body) == 3
    assert [s["id"] for s in body] == [1, 2, 3]


def test_list_is_stable_across_calls(client: TestClient) -> None:
    """VAL-SESS-001: repeated calls return identical arrays."""
    a = client.get("/api/sessions").json()
    b = client.get("/api/sessions").json()
    assert a == b


def test_list_items_have_nine_fields_correct_types(client: TestClient) -> None:
    """VAL-SESS-002: each item has exactly the 9 summary fields with correct types."""
    body = client.get("/api/sessions").json()
    for item in body:
        assert set(item.keys()) == SUMMARY_KEYS
        assert isinstance(item["id"], int)
        assert isinstance(item["track_name"], str)
        assert isinstance(item["car_id"], str)
        assert isinstance(item["driver"], str)
        assert isinstance(item["weather"], str)
        assert isinstance(item["ambient_temp_c"], (int, float))
        assert not isinstance(item["ambient_temp_c"], bool)
        assert isinstance(item["started_at"], str)
        assert isinstance(item["ended_at"], str)
        assert isinstance(item["total_laps"], int)
        # No detail-only fields leak into list items.
        assert "lap_count" not in item
        assert "kpis" not in item


def test_list_matches_seeded_identity_mapping(client: TestClient) -> None:
    """VAL-SESS-002: track/car/driver/weather/total_laps match the seed."""
    body = {s["id"]: s for s in client.get("/api/sessions").json()}
    for expected in EXPECTED_SESSIONS:
        actual = body[expected["id"]]
        assert actual["track_name"] == expected["track_name"]
        assert actual["car_id"] == expected["car_id"]
        assert actual["driver"] == expected["driver"]
        assert actual["weather"] == expected["weather"]
        assert actual["total_laps"] == expected["total_laps"]


def test_list_timestamps_are_iso8601_and_ended_after_started(client: TestClient) -> None:
    """VAL-SESS-002: started_at/ended_at are ISO-8601 UTC with ended_at > started_at."""
    body = client.get("/api/sessions").json()
    for item in body:
        assert item["started_at"].endswith("Z")
        assert item["ended_at"].endswith("Z")
        assert item["ended_at"] > item["started_at"]


def test_detail_returns_200_with_summary_lap_count_kpis(client: TestClient) -> None:
    """VAL-SESS-003: GET /api/sessions/{id} -> 200 with 9 summary + lap_count + kpis."""
    resp = client.get("/api/sessions/1")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    body = resp.json()
    assert set(body.keys()) == DETAIL_KEYS
    assert isinstance(body["lap_count"], int)
    assert isinstance(body["kpis"], dict)


def test_detail_summary_deep_equals_list_item(client: TestClient) -> None:
    """VAL-SESS-003: detail summary fields are identical to the list item."""
    list_item = {s["id"]: s for s in client.get("/api/sessions").json()}[1]
    detail = client.get("/api/sessions/1").json()
    for key in SUMMARY_KEYS:
        assert detail[key] == list_item[key]


def test_detail_lap_count_equals_total_laps_and_laps_length(client: TestClient) -> None:
    """VAL-SESS-003: lap_count == total_laps == length(/laps) for ids 1/2/3."""
    for sid, expected_laps in [(1, 5), (2, 4), (3, 6)]:
        detail = client.get(f"/api/sessions/{sid}").json()
        laps = client.get(f"/api/sessions/{sid}/laps").json()
        assert detail["lap_count"] == expected_laps
        assert detail["total_laps"] == expected_laps
        assert len(laps) == expected_laps


def test_detail_kpis_has_exactly_four_numeric_keys(client: TestClient) -> None:
    """VAL-SESS-004: kpis has exactly the 4 keys, all numeric, within bounds,
    and max_tire_temp_c strictly exceeds the session's ambient_temp_c."""
    for sid in (1, 2, 3):
        detail = client.get(f"/api/sessions/{sid}").json()
        kpis = detail["kpis"]
        assert set(kpis.keys()) == KPI_KEYS
        assert isinstance(kpis["top_speed_kph"], (int, float))
        assert isinstance(kpis["best_lap_ms"], int)
        assert isinstance(kpis["avg_throttle_pct"], (int, float))
        assert isinstance(kpis["max_tire_temp_c"], (int, float))
        assert 0 < kpis["top_speed_kph"] <= 360
        assert 0 <= kpis["avg_throttle_pct"] <= 100
        assert 75000 <= kpis["best_lap_ms"] <= 115000
        assert 40 <= kpis["max_tire_temp_c"] <= 200
        assert kpis["max_tire_temp_c"] > detail["ambient_temp_c"]


def test_kpi_best_lap_matches_min_lap_time_and_is_best(client: TestClient) -> None:
    """VAL-SESS-005: best_lap_ms == min(lap_time_ms) == is_best lap time."""
    for sid in (1, 2, 3):
        laps = client.get(f"/api/sessions/{sid}/laps").json()
        kpis = client.get(f"/api/sessions/{sid}").json()["kpis"]
        min_time = min(lap["lap_time_ms"] for lap in laps)
        best_laps = [lap for lap in laps if lap["is_best"]]
        assert len(best_laps) == 1
        assert kpis["best_lap_ms"] == min_time
        assert best_laps[0]["lap_time_ms"] == min_time
        assert best_laps[0]["lap_time_ms"] == kpis["best_lap_ms"]


def test_kpi_top_speed_matches_max_telemetry_speed(client: TestClient) -> None:
    """VAL-SESS-005: top_speed_kph == max(speed_kph) over the session's telemetry."""
    from app.db import connect

    conn = connect()
    try:
        for sid in (1, 2, 3):
            kpis = client.get(f"/api/sessions/{sid}").json()["kpis"]
            row = conn.execute(
                "SELECT MAX(speed_kph) AS m FROM telemetry_samples WHERE session_id = ?",
                (sid,),
            ).fetchone()
            assert abs(kpis["top_speed_kph"] - float(row["m"])) <= 0.1
    finally:
        conn.close()


def test_kpi_avg_throttle_matches_mean(client: TestClient) -> None:
    """VAL-SESS-005: avg_throttle_pct == mean(throttle_pct) over all samples."""
    from app.db import connect

    conn = connect()
    try:
        for sid in (1, 2, 3):
            kpis = client.get(f"/api/sessions/{sid}").json()["kpis"]
            row = conn.execute(
                "SELECT AVG(throttle_pct) AS a FROM telemetry_samples WHERE session_id = ?",
                (sid,),
            ).fetchone()
            assert abs(kpis["avg_throttle_pct"] - float(row["a"])) <= 0.5
    finally:
        conn.close()


def test_kpi_max_tire_temp_matches_max_of_four_channels(client: TestClient) -> None:
    """VAL-SESS-005: max_tire_temp_c == max across the 4 tire channels."""
    from app.db import connect

    conn = connect()
    try:
        for sid in (1, 2, 3):
            kpis = client.get(f"/api/sessions/{sid}").json()["kpis"]
            row = conn.execute(
                """
                SELECT MAX(tire_temp_fl) AS fl, MAX(tire_temp_fr) AS fr,
                       MAX(tire_temp_rl) AS rl, MAX(tire_temp_rr) AS rr
                FROM telemetry_samples WHERE session_id = ?
                """,
                (sid,),
            ).fetchone()
            expected = max(row["fl"], row["fr"], row["rl"], row["rr"])
            assert abs(kpis["max_tire_temp_c"] - float(expected)) <= 0.1
    finally:
        conn.close()


def test_compute_kpis_handles_session_with_zero_telemetry(
    temp_db: sqlite3.Connection,
) -> None:
    """compute_kpis must not raise on a session with no telemetry samples.

    SQL aggregates (MAX/AVG) return NULL over an empty set; the function
    guards those NULLs and returns 0-valued telemetry KPIs instead of a
    float(None) TypeError. best_lap_ms still reflects laps when present.
    """
    from app.queries import compute_kpis

    conn = temp_db
    conn.execute(
        "INSERT INTO sessions (id, track_name, car_id, driver, weather, "
        "ambient_temp_c, started_at, ended_at, total_laps) "
        "VALUES (1, 'Test', 'C1', 'D1', 'dry', 22.0, '2024-01-01T00:00:00Z', "
        "'2024-01-01T00:02:00Z', 1)"
    )
    conn.execute(
        "INSERT INTO laps (id, session_id, lap_number, lap_time_ms, started_at_ms, is_best) "
        "VALUES (10, 1, 1, 90000, 0, 1)"
    )
    conn.commit()
    kpis = compute_kpis(conn, 1)
    assert set(kpis.keys()) == KPI_KEYS
    assert kpis["best_lap_ms"] == 90000
    assert kpis["top_speed_kph"] == 0.0
    assert kpis["avg_throttle_pct"] == 0.0
    assert kpis["max_tire_temp_c"] == 0.0


def test_compute_kpis_handles_session_with_no_laps_or_telemetry(
    temp_db: sqlite3.Connection,
) -> None:
    """compute_kpis on a session with no laps and no telemetry returns 0-valued KPIs."""
    from app.queries import compute_kpis

    conn = temp_db
    conn.execute(
        "INSERT INTO sessions (id, track_name, car_id, driver, weather, "
        "ambient_temp_c, started_at, ended_at, total_laps) "
        "VALUES (1, 'Test', 'C1', 'D1', 'dry', 22.0, '2024-01-01T00:00:00Z', "
        "'2024-01-01T00:02:00Z', 0)"
    )
    conn.commit()
    kpis = compute_kpis(conn, 1)
    assert set(kpis.keys()) == KPI_KEYS
    assert kpis["best_lap_ms"] == 0
    assert kpis["top_speed_kph"] == 0.0
    assert kpis["avg_throttle_pct"] == 0.0
    assert kpis["max_tire_temp_c"] == 0.0


def test_detail_and_kpis_deterministic_across_calls(client: TestClient) -> None:
    """VAL-SESS-006: consecutive detail responses are byte-identical for ids 1/2/3."""
    for sid in (1, 2, 3):
        a = client.get(f"/api/sessions/{sid}").json()
        b = client.get(f"/api/sessions/{sid}").json()
        assert a == b


def test_detail_404_unknown_integer_id(client: TestClient) -> None:
    """VAL-ERR-001: unknown integer id -> 404 with canonical body."""
    resp = client.get("/api/sessions/9999")
    assert resp.status_code == 404
    assert resp.headers["content-type"].startswith("application/json")
    assert resp.json() == {"detail": "Session not found"}


def test_detail_404_boundary_ids(client: TestClient) -> None:
    """VAL-ERR-001: boundary ids 0 and -1 -> 404 canonical body."""
    for bad_id in (0, -1):
        resp = client.get(f"/api/sessions/{bad_id}")
        assert resp.status_code == 404
        assert resp.json() == {"detail": "Session not found"}


def test_detail_422_non_integer_path(client: TestClient) -> None:
    """VAL-ERR-002: non-integer path segment -> 422 with detail array."""
    resp = client.get("/api/sessions/abc")
    assert resp.status_code == 422
    body = resp.json()
    assert isinstance(body["detail"], list)


def test_laps_404_unknown_session(client: TestClient) -> None:
    """VAL-ERR-001: /laps on unknown session -> 404 canonical body."""
    resp = client.get("/api/sessions/9999/laps")
    assert resp.status_code == 404
    assert resp.json() == {"detail": "Session not found"}


def test_laps_422_non_integer_path(client: TestClient) -> None:
    """VAL-ERR-002: non-integer path on /laps -> 422 with detail array."""
    resp = client.get("/api/sessions/abc/laps")
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)
