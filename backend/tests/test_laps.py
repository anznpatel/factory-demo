"""Tests for the laps endpoint (VAL-LAPS-001 .. VAL-LAPS-004).

Covers GET /api/sessions/{id}/laps: array sized to total_laps (5/4/6), the
exactly-6 contract fields with correct types, lap_number 1..N contiguous
ascending, timing field validity/ordering, and exactly one is_best lap equal
to the minimum lap_time_ms and kpis.best_lap_ms.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

LAP_KEYS = {"id", "session_id", "lap_number", "lap_time_ms", "started_at_ms", "is_best"}

# session id -> expected lap count from the seed.
EXPECTED_LAP_COUNTS = {1: 5, 2: 4, 3: 6}


def test_laps_returns_200_json_array(client: TestClient) -> None:
    """VAL-LAPS-001: GET /api/sessions/1/laps -> 200, JSON content-type, array."""
    resp = client.get("/api/sessions/1/laps")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    assert isinstance(resp.json(), list)


def test_laps_array_sized_to_total_laps(client: TestClient) -> None:
    """VAL-LAPS-001: array length == total_laps (5/4/6) for ids 1/2/3."""
    for sid, expected in EXPECTED_LAP_COUNTS.items():
        body = client.get(f"/api/sessions/{sid}/laps").json()
        assert len(body) == expected


def test_laps_stable_across_calls(client: TestClient) -> None:
    """VAL-LAPS-001: repeated calls return identical arrays."""
    for sid in (1, 2, 3):
        a = client.get(f"/api/sessions/{sid}/laps").json()
        b = client.get(f"/api/sessions/{sid}/laps").json()
        assert a == b


def test_laps_have_exactly_six_fields_correct_types(client: TestClient) -> None:
    """VAL-LAPS-002: each lap has exactly the 6 fields with correct types."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/laps").json()
        for lap in body:
            assert set(lap.keys()) == LAP_KEYS
            assert isinstance(lap["id"], int) and lap["id"] > 0
            assert isinstance(lap["session_id"], int)
            assert isinstance(lap["lap_number"], int)
            assert isinstance(lap["lap_time_ms"], int)
            assert isinstance(lap["started_at_ms"], int)
            assert isinstance(lap["is_best"], bool)


def test_laps_session_id_equals_path_id(client: TestClient) -> None:
    """VAL-LAPS-002: every lap's session_id matches the path id."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/laps").json()
        assert all(lap["session_id"] == sid for lap in body)


def test_laps_lap_numbers_contiguous_ascending(client: TestClient) -> None:
    """VAL-LAPS-002: lap_number is the contiguous set 1..N, ascending as returned."""
    for sid, expected in EXPECTED_LAP_COUNTS.items():
        body = client.get(f"/api/sessions/{sid}/laps").json()
        numbers = [lap["lap_number"] for lap in body]
        assert numbers == list(range(1, expected + 1))


def test_laps_ids_unique(client: TestClient) -> None:
    """VAL-LAPS-002: lap ids are unique positive integers."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/laps").json()
        ids = [lap["id"] for lap in body]
        assert len(set(ids)) == len(ids)


def test_laps_lap_time_positive_integers(client: TestClient) -> None:
    """VAL-LAPS-003: every lap_time_ms is a positive integer."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/laps").json()
        for lap in body:
            assert lap["lap_time_ms"] > 0


def test_laps_started_at_non_negative_and_first_zero(client: TestClient) -> None:
    """VAL-LAPS-003: started_at_ms >= 0; lap 1 has started_at_ms == 0."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/laps").json()
        for lap in body:
            assert lap["started_at_ms"] >= 0
        assert body[0]["lap_number"] == 1
        assert body[0]["started_at_ms"] == 0


def test_laps_started_at_non_decreasing(client: TestClient) -> None:
    """VAL-LAPS-003: started_at_ms is non-decreasing in lap order."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/laps").json()
        offsets = [lap["started_at_ms"] for lap in body]
        assert offsets == sorted(offsets)


def test_laps_exactly_one_is_best_equal_to_min(client: TestClient) -> None:
    """VAL-LAPS-004: exactly one is_best == true, equal to min lap_time_ms."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/laps").json()
        best = [lap for lap in body if lap["is_best"]]
        assert len(best) == 1
        min_time = min(lap["lap_time_ms"] for lap in body)
        assert best[0]["lap_time_ms"] == min_time


def test_laps_best_matches_kpis_best_lap_ms(client: TestClient) -> None:
    """VAL-LAPS-004: the is_best lap time equals kpis.best_lap_ms."""
    for sid in (1, 2, 3):
        laps = client.get(f"/api/sessions/{sid}/laps").json()
        kpis = client.get(f"/api/sessions/{sid}").json()["kpis"]
        best = [lap for lap in laps if lap["is_best"]][0]
        assert best["lap_time_ms"] == kpis["best_lap_ms"]
