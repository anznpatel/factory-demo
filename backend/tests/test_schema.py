"""Schema integrity tests for the SQLite data layer (architecture.md Section 3).

These run against the ``temp_db`` fixture (an isolated, schema-initialized
connection) and assert table/column/index presence and foreign-key enforcement.
"""

from __future__ import annotations

import sqlite3

import pytest

from app.db import connect, init_db

EXPECTED_COLUMNS = {
    "sessions": {
        "id",
        "track_name",
        "car_id",
        "driver",
        "weather",
        "ambient_temp_c",
        "started_at",
        "ended_at",
        "total_laps",
    },
    "laps": {
        "id",
        "session_id",
        "lap_number",
        "lap_time_ms",
        "started_at_ms",
        "is_best",
    },
    "telemetry_samples": {
        "id",
        "session_id",
        "lap_id",
        "t_ms",
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
    },
    "alerts": {
        "id",
        "session_id",
        "lap_id",
        "t_ms",
        "type",
        "severity",
        "message",
    },
}

EXPECTED_INDEXES = {
    "idx_laps_session_id",
    "idx_telem_session_id",
    "idx_telem_lap_id",
    "idx_telem_session_lap_time",
    "idx_alerts_session_id",
    "idx_alerts_lap_id",
}


def _columns(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {r["name"] for r in rows}


def _index_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {r["name"] for r in rows}


def test_all_four_tables_exist(temp_db: sqlite3.Connection) -> None:
    """sessions, laps, telemetry_samples, alerts are all created."""
    rows = temp_db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    tables = {r["name"] for r in rows}
    assert EXPECTED_COLUMNS.keys() <= tables


@pytest.mark.parametrize("table", sorted(EXPECTED_COLUMNS))
def test_table_columns(temp_db: sqlite3.Connection, table: str) -> None:
    """Each table exposes exactly the contract columns (no more, no less)."""
    assert _columns(temp_db, table) == EXPECTED_COLUMNS[table]


def test_all_indexes_present(temp_db: sqlite3.Connection) -> None:
    """FK-column indexes and the telemetry (session_id, lap_id, t_ms) index exist."""
    assert EXPECTED_INDEXES <= _index_names(temp_db)


def test_foreign_keys_enforced_on_connection(temp_db: sqlite3.Connection) -> None:
    """PRAGMA foreign_keys is ON so a dangling child row is rejected."""
    row = temp_db.execute("PRAGMA foreign_keys").fetchone()
    # PRAGMA returns a single integer column; read it positionally.
    assert tuple(row.values())[0] == 1


def test_telemetry_fk_rejects_dangling_lap(temp_db: sqlite3.Connection) -> None:
    """Inserting telemetry referencing a nonexistent lap raises IntegrityError."""
    # First add a real session so the only violation is the lap reference.
    temp_db.execute(
        "INSERT INTO sessions (id, track_name, car_id, driver, weather, ambient_temp_c,"
        " started_at, ended_at, total_laps) VALUES (1,'T','C','D','dry',20,'a','b',1)"
    )
    temp_db.commit()
    with pytest.raises(sqlite3.IntegrityError):
        temp_db.execute(
            "INSERT INTO telemetry_samples (session_id, lap_id, t_ms) VALUES (1, 9999, 0)"
        )


def test_alerts_fk_rejects_dangling_session() -> None:
    """An alert cannot reference a session that does not exist.

    A real lap is inserted first so lap_id is valid; the only remaining FK
    violation is the session_id reference, making the IntegrityError
    attributable to the session_id FK specifically (not a dangling lap_id).
    """
    conn = connect(":memory:")
    init_db(conn)
    try:
        conn.execute(
            "INSERT INTO sessions (id, track_name, car_id, driver, weather, ambient_temp_c,"
            " started_at, ended_at, total_laps) VALUES (1,'T','C','D','dry',20,'a','b',1)"
        )
        conn.execute(
            "INSERT INTO laps (id, session_id, lap_number, lap_time_ms, started_at_ms, is_best)"
            " VALUES (1, 1, 1, 90000, 0, 1)"
        )
        conn.commit()
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(
                "INSERT INTO alerts (session_id, lap_id, t_ms, type, severity, message)"
                " VALUES (9999, 1, 0, 'redline', 'info', 'x')"
            )
    finally:
        conn.close()


def test_row_factory_returns_dicts(temp_db: sqlite3.Connection) -> None:
    """The connection's row factory yields dict-like rows keyed by column name."""
    temp_db.execute(
        "INSERT INTO sessions (id, track_name, car_id, driver, weather, ambient_temp_c,"
        " started_at, ended_at, total_laps) VALUES (1,'T','C','D','dry',20,'a','b',1)"
    )
    temp_db.commit()
    row = temp_db.execute("SELECT id, track_name FROM sessions WHERE id = 1").fetchone()
    assert row["track_name"] == "T"
    assert row["id"] == 1
