"""Tests for the telemetry endpoint (VAL-TELEM-001 .. VAL-TELEM-011, VAL-ERR-003/004).

Covers GET /api/sessions/{id}/telemetry: default shape/types, default 13-signal
set, sample/returned counts, signals CSV projection/order/de-dup, value domains,
lap filtering + cadence, whole-session ordering + fuel monotonicity,
downsampling caps + endpoint retention, inclusive from_ms/to_ms range + count
formula, empty-200 edge cases, 422 validation (incl. boundaries), and 404 for
unknown session. Uses the deterministic seed via the shared ``client`` fixture.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

ALL_SIGNALS = [
    "speed_kph",
    "rpm",
    "gear",
    "throttle_pct",
    "brake_pct",
    "steering_deg",
    "tire_temp_fl",
    "tire_temp_fr",
    "tire_temp_rl",
    "tire_temp_rr",
    "g_lat",
    "g_long",
    "fuel_pct",
]

TELEMETRY_KEYS = {
    "session_id",
    "lap",
    "signals",
    "sample_count",
    "returned_count",
    "downsampled",
    "samples",
}


def _laps(client: TestClient, sid: int) -> list[dict[str, object]]:
    return client.get(f"/api/sessions/{sid}/laps").json()


# ---------------------------------------------------------------------------
# VAL-TELEM-001: default shape and types
# ---------------------------------------------------------------------------


def test_default_returns_200_correct_shape_and_types(client: TestClient) -> None:
    """Default call -> 200, 7 top-level keys, lap null, correct types."""
    resp = client.get("/api/sessions/1/telemetry")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("application/json")
    body = resp.json()
    assert set(body.keys()) == TELEMETRY_KEYS
    assert body["session_id"] == 1
    assert body["lap"] is None
    assert isinstance(body["signals"], list)
    assert isinstance(body["sample_count"], int)
    assert isinstance(body["returned_count"], int)
    assert isinstance(body["downsampled"], bool)
    assert isinstance(body["samples"], list)


# ---------------------------------------------------------------------------
# VAL-TELEM-002: default signals = all 13; each sample is t_ms + 13 signals
# ---------------------------------------------------------------------------


def test_default_signal_set_is_all_thirteen(client: TestClient) -> None:
    """With signals omitted, signals[] set-equals the 13 names."""
    body = client.get("/api/sessions/1/telemetry").json()
    assert set(body["signals"]) == set(ALL_SIGNALS)


def test_default_samples_have_fourteen_keys(client: TestClient) -> None:
    """Each default sample has exactly 14 keys (t_ms + 13 signals)."""
    body = client.get("/api/sessions/1/telemetry").json()
    assert body["samples"], "expected non-empty samples"
    key_counts = {len(s.keys()) for s in body["samples"]}
    assert key_counts == {14}
    assert set(body["samples"][0].keys()) == {"t_ms", *ALL_SIGNALS}


# ---------------------------------------------------------------------------
# VAL-TELEM-003: returned_count == len(samples) and <= sample_count
# ---------------------------------------------------------------------------


def test_returned_count_equals_samples_length_and_le_sample_count(client: TestClient) -> None:
    """returned_count == len(samples) and returned_count <= sample_count always."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/telemetry").json()
        assert body["returned_count"] == len(body["samples"])
        assert body["returned_count"] <= body["sample_count"]


# ---------------------------------------------------------------------------
# VAL-TELEM-004: signals CSV projects keys and echoes order after de-dup
# ---------------------------------------------------------------------------


def test_signals_csv_projects_keys_and_echoes_order(client: TestClient) -> None:
    """?signals=speed_kph,rpm projects samples to {t_ms,speed_kph,rpm} and echoes order."""
    body = client.get("/api/sessions/1/telemetry?signals=speed_kph,rpm").json()
    assert body["signals"] == ["speed_kph", "rpm"]
    assert body["samples"]
    for s in body["samples"]:
        assert set(s.keys()) == {"t_ms", "speed_kph", "rpm"}


def test_signals_csv_echoes_requested_order(client: TestClient) -> None:
    """?signals=rpm,speed_kph echoes that exact order."""
    body = client.get("/api/sessions/1/telemetry?signals=rpm,speed_kph").json()
    assert body["signals"] == ["rpm", "speed_kph"]


def test_signals_csv_de_duplicates(client: TestClient) -> None:
    """?signals=speed_kph,speed_kph de-dups to a single entry."""
    body = client.get("/api/sessions/1/telemetry?signals=speed_kph,speed_kph").json()
    assert body["signals"] == ["speed_kph"]
    for s in body["samples"]:
        assert set(s.keys()) == {"t_ms", "speed_kph"}


# ---------------------------------------------------------------------------
# VAL-TELEM-005: value types and signal domains
# ---------------------------------------------------------------------------


def test_sample_value_types_and_domains(client: TestClient) -> None:
    """t_ms/rpm/gear are integers; all values numbers; signals within domains."""
    body = client.get("/api/sessions/1/telemetry?lap=1&max_points=5000").json()
    assert body["samples"]
    for s in body["samples"]:
        assert isinstance(s["t_ms"], int)
        assert isinstance(s["rpm"], int)
        assert isinstance(s["gear"], int)
        for _k, v in s.items():
            assert isinstance(v, (int, float)) and not isinstance(v, bool)
        assert 0 <= s["speed_kph"] <= 360
        assert 0 <= s["rpm"] <= 15000
        assert 0 <= s["gear"] <= 8
        assert 0 <= s["throttle_pct"] <= 100
        assert 0 <= s["brake_pct"] <= 100
        assert -180 <= s["steering_deg"] <= 180
        assert 0 <= s["fuel_pct"] <= 100
        for ch in ("tire_temp_fl", "tire_temp_fr", "tire_temp_rl", "tire_temp_rr"):
            assert 0 <= s[ch] <= 200
        assert -3 <= s["g_lat"] <= 3
        assert -3 <= s["g_long"] <= 3


# ---------------------------------------------------------------------------
# VAL-TELEM-006: lap=N filtering, count, time domain, ordering, cadence
# ---------------------------------------------------------------------------


def test_lap_filter_count_time_domain_cadence(client: TestClient) -> None:
    """?lap=1&max_points=5000 -> lap==1, exact count, t_ms in [0,L], 100ms cadence."""
    laps = _laps(client, 1)
    lap_time_ms = next(lap["lap_time_ms"] for lap in laps if lap["lap_number"] == 1)
    body = client.get("/api/sessions/1/telemetry?lap=1&max_points=5000").json()
    assert body["lap"] == 1
    expected_count = lap_time_ms // 100 + 1
    assert body["sample_count"] == expected_count
    assert body["downsampled"] is False
    assert body["returned_count"] == body["sample_count"]
    t_values = [s["t_ms"] for s in body["samples"]]
    assert t_values[0] == 0
    assert t_values[-1] == lap_time_ms
    assert all(0 <= t <= lap_time_ms for t in t_values)
    diffs = [t_values[i + 1] - t_values[i] for i in range(len(t_values) - 1)]
    assert set(diffs) == {100}


# ---------------------------------------------------------------------------
# VAL-TELEM-007: whole-session ordering + fuel non-increasing
# ---------------------------------------------------------------------------


def test_whole_session_ordered_and_fuel_non_increasing(client: TestClient) -> None:
    """Whole session (lap omitted) ordered by (lap_number, t_ms); fuel non-increasing."""
    laps = _laps(client, 1)
    total_laps = len(laps)
    per_lap_counts = []
    for lap in laps:
        lt = lap["lap_time_ms"]
        per_lap_counts.append(lt // 100 + 1)
    body = client.get("/api/sessions/1/telemetry?max_points=5000").json()
    assert body["lap"] is None
    assert body["sample_count"] == sum(per_lap_counts)
    assert body["downsampled"] is False
    t_values = [s["t_ms"] for s in body["samples"]]
    # t_ms decreases exactly total_laps-1 times (lap resets).
    resets = sum(1 for i in range(1, len(t_values)) if t_values[i] < t_values[i - 1])
    assert resets == total_laps - 1
    assert t_values[0] == 0
    assert t_values[-1] == laps[-1]["lap_time_ms"]
    fuel = [s["fuel_pct"] for s in body["samples"]]
    for i in range(1, len(fuel)):
        assert fuel[i] <= fuel[i - 1] + 1e-9


# ---------------------------------------------------------------------------
# VAL-TELEM-008: downsampling caps output, retains endpoints, counts stable
# ---------------------------------------------------------------------------


def test_downsampling_caps_and_retains_endpoints(client: TestClient) -> None:
    """max_points below sample_count -> downsampled, returned_count<=cap, endpoints kept."""
    laps = _laps(client, 1)
    lap_time_ms = next(lap["lap_time_ms"] for lap in laps if lap["lap_number"] == 1)
    for cap in (200, 10):
        body = client.get(f"/api/sessions/1/telemetry?lap=1&max_points={cap}").json()
        assert body["downsampled"] is True, f"cap={cap}"
        assert body["returned_count"] <= cap
        t_values = [s["t_ms"] for s in body["samples"]]
        assert t_values[0] == 0
        assert t_values[-1] == lap_time_ms
        # strictly increasing
        for i in range(1, len(t_values)):
            assert t_values[i] > t_values[i - 1]


def test_default_downsamples_full_lap(client: TestClient) -> None:
    """Default max_points=500 downsamples a full lap (>500 samples)."""
    body = client.get("/api/sessions/1/telemetry?lap=1").json()
    assert body["sample_count"] > 500
    assert body["downsampled"] is True
    assert body["returned_count"] <= 500


def test_no_downsample_when_rows_fit(client: TestClient) -> None:
    """max_points=5000 -> downsampled false, returned_count == sample_count."""
    body = client.get("/api/sessions/1/telemetry?lap=1&max_points=5000").json()
    assert body["downsampled"] is False
    assert body["returned_count"] == body["sample_count"]


def test_sample_count_independent_of_max_points_and_signals(client: TestClient) -> None:
    """sample_count is identical across max_points and across signals variations."""
    full = client.get("/api/sessions/1/telemetry?lap=1&max_points=10").json()["sample_count"]
    big = client.get("/api/sessions/1/telemetry?lap=1&max_points=5000").json()["sample_count"]
    assert full == big
    one_sig = client.get("/api/sessions/1/telemetry?lap=1&signals=speed_kph").json()[
        "sample_count"
    ]
    all_sig = client.get("/api/sessions/1/telemetry?lap=1").json()["sample_count"]
    assert one_sig == all_sig


# ---------------------------------------------------------------------------
# VAL-TELEM-009: from_ms/to_ms inclusive closed range + count formula
# ---------------------------------------------------------------------------


def test_from_to_ms_inclusive_range_and_count(client: TestClient) -> None:
    """from_ms/to_ms bound t_ms to inclusive [X,Y]; count == (Y-X)/100 + 1."""
    body = client.get(
        "/api/sessions/1/telemetry?lap=1&from_ms=10000&to_ms=20000&max_points=5000"
    ).json()
    t_values = [s["t_ms"] for s in body["samples"]]
    assert all(10000 <= t <= 20000 for t in t_values)
    assert body["sample_count"] == (20000 - 10000) // 100 + 1
    full = client.get("/api/sessions/1/telemetry?lap=1&max_points=5000").json()[
        "sample_count"
    ]
    assert body["sample_count"] < full


# ---------------------------------------------------------------------------
# VAL-TELEM-010: empty-200 for nonexistent lap, past-end from_ms, inverted window
# ---------------------------------------------------------------------------


def test_nonexistent_lap_returns_200_empty(client: TestClient) -> None:
    """?lap=99 -> 200, lap echoed, empty samples."""
    resp = client.get("/api/sessions/1/telemetry?lap=99")
    assert resp.status_code == 200
    body = resp.json()
    assert body["lap"] == 99
    assert body["sample_count"] == 0
    assert body["returned_count"] == 0
    assert body["samples"] == []


def test_from_ms_past_lap_end_returns_200_empty(client: TestClient) -> None:
    """from_ms beyond lap end -> 200 with empty samples."""
    resp = client.get("/api/sessions/1/telemetry?lap=1&from_ms=99999999")
    assert resp.status_code == 200
    body = resp.json()
    assert body["sample_count"] == 0
    assert body["samples"] == []


def test_inverted_window_returns_200_empty(client: TestClient) -> None:
    """from_ms > to_ms -> 200 with empty samples."""
    resp = client.get("/api/sessions/1/telemetry?lap=1&from_ms=50000&to_ms=10000")
    assert resp.status_code == 200
    body = resp.json()
    assert body["sample_count"] == 0
    assert body["samples"] == []


# ---------------------------------------------------------------------------
# VAL-TELEM-011 + VAL-ERR-004: validation, range boundaries, 422 structure
# ---------------------------------------------------------------------------


def test_non_integer_params_return_422(client: TestClient) -> None:
    """Non-integer lap/max_points/from_ms/to_ms -> 422 with detail array."""
    for qs in (
        "?lap=abc",
        "?max_points=ten",
        "?from_ms=abc",
        "?to_ms=xyz",
    ):
        resp = client.get(f"/api/sessions/1/telemetry{qs}")
        assert resp.status_code == 422, qs
        assert isinstance(resp.json()["detail"], list)


def test_unknown_signal_returns_422(client: TestClient) -> None:
    """Unknown signal alone or mixed -> 422."""
    for qs in ("?signals=foo", "?signals=speed_kph,foo"):
        resp = client.get(f"/api/sessions/1/telemetry{qs}")
        assert resp.status_code == 422, qs


def test_max_points_out_of_range_returns_422(client: TestClient) -> None:
    """max_points outside [1,5000] -> 422."""
    for val in (0, 5001):
        resp = client.get(f"/api/sessions/1/telemetry?max_points={val}")
        assert resp.status_code == 422, f"max_points={val}"


def test_max_points_boundaries_accepted(client: TestClient) -> None:
    """max_points=5000 and =1 are accepted (200)."""
    for val in (5000, 1):
        resp = client.get(f"/api/sessions/1/telemetry?lap=1&max_points={val}")
        assert resp.status_code == 200, f"max_points={val}"


def test_lap_below_one_returns_422(client: TestClient) -> None:
    """lap < 1 -> 422."""
    resp = client.get("/api/sessions/1/telemetry?lap=0")
    assert resp.status_code == 422


def test_negative_from_to_ms_return_422(client: TestClient) -> None:
    """from_ms < 0 or to_ms < 0 -> 422."""
    for qs in ("?from_ms=-1", "?to_ms=-1"):
        resp = client.get(f"/api/sessions/1/telemetry{qs}")
        assert resp.status_code == 422, qs


def test_422_uses_fastapi_validation_structure(client: TestClient) -> None:
    """VAL-ERR-004: 422 body detail is an array whose first item has loc/msg/type."""
    resp = client.get("/api/sessions/1/telemetry?lap=abc")
    assert resp.status_code == 422
    assert resp.headers["content-type"].startswith("application/json")
    body = resp.json()
    assert isinstance(body["detail"], list)
    first = body["detail"][0]
    assert {"loc", "msg", "type"} <= set(first.keys())


# ---------------------------------------------------------------------------
# VAL-ERR-001 / VAL-ERR-002 / VAL-ERR-003: 404, non-integer path, precedence
# ---------------------------------------------------------------------------


def test_unknown_session_returns_404_canonical(client: TestClient) -> None:
    """Unknown session id -> 404 canonical body on /telemetry."""
    for bad_id in (9999, 0, -1):
        resp = client.get(f"/api/sessions/{bad_id}/telemetry")
        assert resp.status_code == 404, bad_id
        assert resp.json() == {"detail": "Session not found"}


def test_non_integer_path_returns_422(client: TestClient) -> None:
    """Non-integer path segment -> 422 with detail array."""
    resp = client.get("/api/sessions/abc/telemetry")
    assert resp.status_code == 422
    assert isinstance(resp.json()["detail"], list)


def test_validation_precedes_not_found(client: TestClient) -> None:
    """VAL-ERR-003: unknown session + malformed param -> 422 (not 404)."""
    resp = client.get("/api/sessions/9999/telemetry?lap=abc")
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Extra: determinism + per-lap lap echo across sessions
# ---------------------------------------------------------------------------


def test_telemetry_deterministic_across_calls(client: TestClient) -> None:
    """Repeated identical calls return identical bodies."""
    for sid in (1, 2, 3):
        a = client.get(f"/api/sessions/{sid}/telemetry?lap=1&signals=speed_kph").json()
        b = client.get(f"/api/sessions/{sid}/telemetry?lap=1&signals=speed_kph").json()
        assert a == b


def test_lap_echoed_for_each_session(client: TestClient) -> None:
    """?lap=1 echoes lap==1 for every session and returns samples."""
    for sid in (1, 2, 3):
        body = client.get(f"/api/sessions/{sid}/telemetry?lap=1").json()
        assert body["lap"] == 1
        assert body["session_id"] == sid
        assert body["sample_count"] > 0
