"""Generator + seeding tests: determinism and dataset invariants.

Run against the ``temp_db`` fixture (an isolated schema-initialized connection).
These assert the deterministic demo dataset's invariants from architecture.md
Section 7 and the feature's expected behavior.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile

from app.db import connect, init_db
from app.generator import DEMO_SESSIONS, reset_and_seed, seed_demo

EXPECTED_SESSIONS = [
    (1, "Silverstone", "RB-19", "A. Verstappen", "dry", 5),
    (2, "Monza", "SF-23", "C. Leclerc", "dry", 4),
    (3, "Suzuka", "W14", "L. Hamilton", "mixed", 6),
]


def _seeded() -> sqlite3.Connection:
    """Helper used by determinism tests: a fresh seeded temp DB."""
    d = tempfile.mkdtemp()
    path = os.path.join(d, "t.db")
    conn = connect(path)
    init_db(conn)
    seed_demo(conn)
    return conn


def test_seed_creates_exactly_three_sessions_with_identity(temp_db: sqlite3.Connection) -> None:
    """seed_demo seeds exactly the 3 sessions with the pinned ids and identity mapping."""
    seed_demo(temp_db)
    rows = temp_db.execute(
        "SELECT id, track_name, car_id, driver, weather, total_laps"
        " FROM sessions ORDER BY id"
    ).fetchall()
    assert [
        (r["id"], r["track_name"], r["car_id"], r["driver"], r["weather"], r["total_laps"])
        for r in rows
    ] == EXPECTED_SESSIONS


def test_lap_counts_match_total_laps(temp_db: sqlite3.Connection) -> None:
    """laps per session == total_laps (5/4/6) and lap_number is contiguous 1..N."""
    seed_demo(temp_db)
    for sid, _, _, _, _, total in EXPECTED_SESSIONS:
        rows = temp_db.execute(
            "SELECT lap_number FROM laps WHERE session_id = ? ORDER BY lap_number", (sid,)
        ).fetchall()
        numbers = [r["lap_number"] for r in rows]
        assert len(numbers) == total
        assert numbers == list(range(1, total + 1))


def test_total_laps_equals_lap_row_count(temp_db: sqlite3.Connection) -> None:
    """sessions.total_laps == count of related laps (invariant)."""
    seed_demo(temp_db)
    rows = temp_db.execute(
        "SELECT s.id, s.total_laps, COUNT(l.id) AS n FROM sessions s"
        " LEFT JOIN laps l ON l.session_id = s.id GROUP BY s.id ORDER BY s.id"
    ).fetchall()
    for r in rows:
        assert r["total_laps"] == r["n"]


def test_exactly_one_is_best_per_session_equals_min(temp_db: sqlite3.Connection) -> None:
    """Exactly one is_best lap per session, equal to the minimum lap_time_ms."""
    seed_demo(temp_db)
    for sid, *_ in EXPECTED_SESSIONS:
        rows = temp_db.execute(
            "SELECT lap_time_ms, is_best FROM laps WHERE session_id = ? ORDER BY lap_number",
            (sid,),
        ).fetchall()
        times = [r["lap_time_ms"] for r in rows]
        best_count = sum(1 for r in rows if r["is_best"] == 1)
        assert best_count == 1
        best_time = next(r["lap_time_ms"] for r in rows if r["is_best"] == 1)
        assert best_time == min(times)


def test_telemetry_t_ms_in_range_and_cadence(temp_db: sqlite3.Connection) -> None:
    """t_ms in [0, lap_time_ms] at 100 ms cadence (first 0, last == lap_time_ms)."""
    seed_demo(temp_db)
    rows = temp_db.execute(
        "SELECT l.session_id, l.lap_number, l.lap_time_ms, t.t_ms"
        " FROM telemetry_samples t JOIN laps l ON l.id = t.lap_id"
        " ORDER BY l.session_id, l.lap_number, t.t_ms"
    ).fetchall()
    assert rows, "telemetry should be seeded"
    by_lap: dict[tuple[int, int], list[int]] = {}
    lap_time: dict[tuple[int, int], int] = {}
    for r in rows:
        key = (r["session_id"], r["lap_number"])
        by_lap.setdefault(key, []).append(r["t_ms"])
        lap_time[key] = r["lap_time_ms"]
    for key, times in by_lap.items():
        assert times[0] == 0
        assert times[-1] == lap_time[key]
        assert all(0 <= t <= lap_time[key] for t in times)
        diffs = {times[i + 1] - times[i] for i in range(len(times) - 1)}
        assert diffs == {100}


def test_fuel_non_increasing_per_session(temp_db: sqlite3.Connection) -> None:
    """fuel_pct is monotonically non-increasing along (lap_number, t_ms) order."""
    seed_demo(temp_db)
    for sid, *_ in EXPECTED_SESSIONS:
        rows = temp_db.execute(
            "SELECT t.fuel_pct FROM telemetry_samples t"
            " JOIN laps l ON l.id = t.lap_id"
            " WHERE t.session_id = ? ORDER BY l.lap_number, t.t_ms",
            (sid,),
        ).fetchall()
        fuels = [r["fuel_pct"] for r in rows]
        assert len(fuels) > 1
        for i in range(1, len(fuels)):
            assert fuels[i] <= fuels[i - 1] + 1e-9


def test_signal_domains_respected(temp_db: sqlite3.Connection) -> None:
    """Every signal stays within its documented domain (VAL-TELEM-005 subset)."""
    seed_demo(temp_db)
    rows = temp_db.execute(
        "SELECT speed_kph, rpm, gear, throttle_pct, brake_pct, steering_deg,"
        " tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr, g_lat, g_long, fuel_pct"
        " FROM telemetry_samples"
    ).fetchall()
    assert rows
    for r in rows:
        assert 0.0 <= r["speed_kph"] <= 360.0
        assert 0 <= r["rpm"] <= 15000
        assert 0 <= r["gear"] <= 8
        assert 0.0 <= r["throttle_pct"] <= 100.0
        assert 0.0 <= r["brake_pct"] <= 100.0
        assert -180.0 <= r["steering_deg"] <= 180.0
        for col in ("tire_temp_fl", "tire_temp_fr", "tire_temp_rl", "tire_temp_rr"):
            assert 0.0 <= r[col] <= 200.0
        assert -3.0 <= r["g_lat"] <= 3.0
        assert -3.0 <= r["g_long"] <= 3.0
        assert 0.0 <= r["fuel_pct"] <= 100.0


def test_each_session_has_at_least_one_alert(temp_db: sqlite3.Connection) -> None:
    """Every session has >=1 alert (VAL-ALERTS-005)."""
    seed_demo(temp_db)
    rows = temp_db.execute(
        "SELECT session_id, COUNT(*) AS n FROM alerts GROUP BY session_id ORDER BY session_id"
    ).fetchall()
    by_session = {r["session_id"]: r["n"] for r in rows}
    for sid, *_ in EXPECTED_SESSIONS:
        assert by_session.get(sid, 0) >= 1


def test_at_least_one_critical_alert(temp_db: sqlite3.Connection) -> None:
    """At least one critical alert exists across the dataset (VAL-ALERTS-005)."""
    seed_demo(temp_db)
    row = temp_db.execute(
        "SELECT COUNT(*) AS n FROM alerts WHERE severity = 'critical'"
    ).fetchone()
    assert row["n"] >= 1


def test_alerts_reference_valid_laps_and_t_ms(temp_db: sqlite3.Connection) -> None:
    """Each alert's lap belongs to its session and 0 <= t_ms <= lap_time_ms."""
    seed_demo(temp_db)
    rows = temp_db.execute(
        "SELECT a.session_id, a.lap_id, a.t_ms, l.session_id AS lap_session,"
        " l.lap_time_ms FROM alerts a JOIN laps l ON l.id = a.lap_id"
    ).fetchall()
    assert rows
    for r in rows:
        assert r["lap_session"] == r["session_id"]
        assert 0 <= r["t_ms"] <= r["lap_time_ms"]


def test_seed_demo_is_idempotent(temp_db: sqlite3.Connection) -> None:
    """Calling seed_demo twice still yields exactly 3 sessions and stable counts."""
    seed_demo(temp_db)
    counts1 = temp_db.execute(
        "SELECT 'sessions' AS t, COUNT(*) AS n FROM sessions"
        " UNION ALL SELECT 'laps', COUNT(*) FROM laps"
        " UNION ALL SELECT 'telemetry_samples', COUNT(*) FROM telemetry_samples"
        " UNION ALL SELECT 'alerts', COUNT(*) FROM alerts"
    ).fetchall()
    seed_demo(temp_db)  # second call should be a no-op
    counts2 = temp_db.execute(
        "SELECT 'sessions' AS t, COUNT(*) AS n FROM sessions"
        " UNION ALL SELECT 'laps', COUNT(*) FROM laps"
        " UNION ALL SELECT 'telemetry_samples', COUNT(*) FROM telemetry_samples"
        " UNION ALL SELECT 'alerts', COUNT(*) FROM alerts"
    ).fetchall()
    assert {r["t"]: r["n"] for r in counts1} == {r["t"]: r["n"] for r in counts2}
    assert {r["t"]: r["n"] for r in counts2}["sessions"] == len(DEMO_SESSIONS)


def test_generator_is_deterministic() -> None:
    """Two independent seedings produce byte-identical telemetry for session 1 lap 1."""
    conn_a = _seeded()
    conn_b = _seeded()
    try:
        q = (
            "SELECT t.t_ms, t.speed_kph, t.rpm, t.gear, t.throttle_pct, t.brake_pct,"
            " t.steering_deg, t.tire_temp_fl, t.tire_temp_fr, t.tire_temp_rl,"
            " t.tire_temp_rr, t.g_lat, t.g_long, t.fuel_pct FROM telemetry_samples t"
            " JOIN laps l ON l.id = t.lap_id"
            " WHERE l.session_id = 1 AND l.lap_number = 1 ORDER BY t.t_ms"
        )
        a = [tuple(r.values()) for r in conn_a.execute(q).fetchall()]
        b = [tuple(r.values()) for r in conn_b.execute(q).fetchall()]
        assert a == b
    finally:
        conn_a.close()
        conn_b.close()


def test_reset_drops_and_reseeds() -> None:
    """reset_and_seed produces a clean dataset identical to a fresh seed."""
    d = tempfile.mkdtemp()
    path = os.path.join(d, "t.db")
    conn = connect(path)
    init_db(conn)
    # Pollute with an extra session, then reset.
    conn.execute(
        "INSERT INTO sessions (id, track_name, car_id, driver, weather, ambient_temp_c,"
        " started_at, ended_at, total_laps) VALUES (99,'X','C','D','dry',20,'a','b',0)"
    )
    conn.commit()
    reset_and_seed(conn)
    ids = [r["id"] for r in conn.execute("SELECT id FROM sessions ORDER BY id").fetchall()]
    conn.close()
    assert ids == [1, 2, 3]


def test_ended_at_after_started_at(temp_db: sqlite3.Connection) -> None:
    """ended_at > started_at for every session."""
    seed_demo(temp_db)
    rows = temp_db.execute("SELECT started_at, ended_at FROM sessions ORDER BY id").fetchall()
    for r in rows:
        assert r["ended_at"] > r["started_at"]
