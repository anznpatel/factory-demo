"""SQLite data layer: connection helper, dict row factory, and schema creation.

All schema DDL lives here (architecture.md Section 3). Foreign keys are
enforced on every connection, and rows are returned as plain dicts so query
functions can pass them straight to pydantic models.
"""

from __future__ import annotations

import os
import sqlite3
from typing import Any

# Absolute default anchored to the package location so the path resolves
# correctly regardless of the process working directory (uvicorn/pytest/CLI
# all cd into backend/). Resolves to <repo>/backend/telemetry.db.
_DEFAULT_DB_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "telemetry.db",
)

# DDL for the four core tables (architecture.md Section 3).
_SCHEMA = [
    """
    CREATE TABLE IF NOT EXISTS sessions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        track_name      TEXT    NOT NULL,
        car_id          TEXT    NOT NULL,
        driver          TEXT    NOT NULL,
        weather         TEXT    NOT NULL,
        ambient_temp_c  REAL    NOT NULL,
        started_at      TEXT    NOT NULL,
        ended_at        TEXT    NOT NULL,
        total_laps      INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS laps (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        lap_number    INTEGER NOT NULL,
        lap_time_ms   INTEGER NOT NULL,
        started_at_ms INTEGER NOT NULL,
        is_best       INTEGER NOT NULL DEFAULT 0,
        UNIQUE(session_id, lap_number)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS telemetry_samples (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        lap_id        INTEGER NOT NULL REFERENCES laps(id) ON DELETE CASCADE,
        t_ms          INTEGER NOT NULL,
        speed_kph     REAL,
        rpm           INTEGER,
        gear          INTEGER,
        throttle_pct  REAL,
        brake_pct     REAL,
        steering_deg  REAL,
        tire_temp_fl  REAL,
        tire_temp_fr  REAL,
        tire_temp_rl  REAL,
        tire_temp_rr  REAL,
        g_lat         REAL,
        g_long        REAL,
        fuel_pct      REAL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS alerts (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        lap_id      INTEGER NOT NULL REFERENCES laps(id) ON DELETE CASCADE,
        t_ms        INTEGER NOT NULL,
        type        TEXT    NOT NULL,
        severity    TEXT    NOT NULL,
        message     TEXT    NOT NULL
    )
    """,
]

# Indexes on every foreign-key column plus the telemetry access path
# (session_id, lap_id, t_ms) used by the telemetry endpoint.
_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_laps_session_id ON laps(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_telem_session_id ON telemetry_samples(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_telem_lap_id ON telemetry_samples(lap_id)",
    (
        "CREATE INDEX IF NOT EXISTS idx_telem_session_lap_time"
        " ON telemetry_samples(session_id, lap_id, t_ms)"
    ),
    "CREATE INDEX IF NOT EXISTS idx_alerts_session_id ON alerts(session_id)",
    "CREATE INDEX IF NOT EXISTS idx_alerts_lap_id ON alerts(lap_id)",
]

# Tables in dependency order for a clean drop (children before parents).
_TABLES_DROP_ORDER = ("telemetry_samples", "alerts", "laps", "sessions")


def _dict_factory(cursor: sqlite3.Cursor, row: tuple[Any, ...]) -> dict[str, Any]:
    """Row factory returning plain dicts keyed by column name."""
    return {col[0]: row[i] for i, col in enumerate(cursor.description)}


def get_db_path() -> str:
    """Resolve the SQLite file path from TELEMETRY_DB_PATH (default backend/telemetry.db)."""
    return os.environ.get("TELEMETRY_DB_PATH", _DEFAULT_DB_FILE)


def connect(db_path: str | None = None) -> sqlite3.Connection:
    """Open a connection with dict rows and foreign keys enforced."""
    conn = sqlite3.connect(db_path if db_path is not None else get_db_path())
    conn.row_factory = _dict_factory
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db(conn: sqlite3.Connection | None = None) -> None:
    """Create all tables and indexes if they do not already exist (idempotent)."""
    own_conn = conn is None
    if conn is None:
        conn = connect()
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        for stmt in _SCHEMA:
            conn.execute(stmt)
        for stmt in _INDEXES:
            conn.execute(stmt)
        conn.commit()
    finally:
        if own_conn:
            conn.close()


def drop_tables(conn: sqlite3.Connection) -> None:
    """Drop all tables (children first) so a reset can recreate from scratch."""
    conn.execute("PRAGMA foreign_keys = OFF")
    for table in _TABLES_DROP_ORDER:
        conn.execute(f"DROP TABLE IF EXISTS {table}")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.commit()
