"""Pure data-access functions for sessions and laps (architecture.md Section 4).

Every function takes a ``sqlite3.Connection`` (dict row factory) and returns
plain dicts or ``None`` so they are trivially unit-testable without FastAPI.
Routers construct pydantic models from these results.

KPI definitions (architecture.md Section 4):
- top_speed_kph  = max(speed_kph) over the session's telemetry
- best_lap_ms    = min(lap_time_ms) (the is_best lap's time)
- avg_throttle_pct = mean(throttle_pct) over all telemetry samples
- max_tire_temp_c = max across the 4 tire channels over all samples
"""

from __future__ import annotations

import sqlite3
from typing import Any

# The 9 summary columns, in contract order, used to project session rows.
_SESSION_COLUMNS = (
    "id, track_name, car_id, driver, weather, ambient_temp_c, "
    "started_at, ended_at, total_laps"
)

# The 6 lap columns, in contract order.
_LAP_COLUMNS = "id, session_id, lap_number, lap_time_ms, started_at_ms, is_best"


def list_sessions(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """Return all session summaries ordered by id ascending."""
    rows = conn.execute(
        f"SELECT {_SESSION_COLUMNS} FROM sessions ORDER BY id ASC"
    ).fetchall()
    return list(rows)


def get_session_summary(conn: sqlite3.Connection, session_id: int) -> dict[str, Any] | None:
    """Return a single session summary dict, or None if the id is unknown."""
    row: dict[str, Any] | None = conn.execute(
        f"SELECT {_SESSION_COLUMNS} FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    return row


def session_exists(conn: sqlite3.Connection, session_id: int) -> bool:
    """True iff a session row with the given id exists."""
    row = conn.execute(
        "SELECT 1 AS hit FROM sessions WHERE id = ?", (session_id,)
    ).fetchone()
    return row is not None


def get_lap_count(conn: sqlite3.Connection, session_id: int) -> int:
    """Count of laps belonging to the session (== total_laps when seeded)."""
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM laps WHERE session_id = ?", (session_id,)
    ).fetchone()
    return int(row["c"]) if row is not None else 0


def get_laps(conn: sqlite3.Connection, session_id: int) -> list[dict[str, Any]]:
    """Return laps for a session ordered by lap_number ascending."""
    rows = conn.execute(
        f"SELECT {_LAP_COLUMNS} FROM laps WHERE session_id = ? ORDER BY lap_number ASC",
        (session_id,),
    ).fetchall()
    return list(rows)


def compute_kpis(conn: sqlite3.Connection, session_id: int) -> dict[str, Any]:
    """Compute the 4 session KPIs from laps + telemetry.

    Returns a dict with keys top_speed_kph, best_lap_ms, avg_throttle_pct,
    max_tire_temp_c. Assumes the session exists and has laps/telemetry.
    """
    best_row = conn.execute(
        "SELECT MIN(lap_time_ms) AS best_lap_ms FROM laps WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    best_lap_ms = int(best_row["best_lap_ms"]) if best_row is not None else 0

    telem_row = conn.execute(
        """
        SELECT
            MAX(speed_kph) AS top_speed_kph,
            AVG(throttle_pct) AS avg_throttle_pct,
            MAX(tire_temp_fl) AS max_fl,
            MAX(tire_temp_fr) AS max_fr,
            MAX(tire_temp_rl) AS max_rl,
            MAX(tire_temp_rr) AS max_rr
        FROM telemetry_samples
        WHERE session_id = ?
        """,
        (session_id,),
    ).fetchone()

    top_speed_kph = float(telem_row["top_speed_kph"]) if telem_row is not None else 0.0
    avg_throttle_pct = float(telem_row["avg_throttle_pct"]) if telem_row is not None else 0.0
    max_tire_temp_c = 0.0
    if telem_row is not None:
        max_tire_temp_c = float(
            max(
                telem_row["max_fl"],
                telem_row["max_fr"],
                telem_row["max_rl"],
                telem_row["max_rr"],
            )
        )

    return {
        "top_speed_kph": top_speed_kph,
        "best_lap_ms": best_lap_ms,
        "avg_throttle_pct": avg_throttle_pct,
        "max_tire_temp_c": max_tire_temp_c,
    }


def get_session_detail(conn: sqlite3.Connection, session_id: int) -> dict[str, Any] | None:
    """Return a session detail dict (summary + lap_count + kpis) or None.

    Combines the summary row, the lap count, and the computed KPIs into a
    single dict ready to validate against SessionDetail.
    """
    summary = get_session_summary(conn, session_id)
    if summary is None:
        return None
    lap_count = get_lap_count(conn, session_id)
    kpis = compute_kpis(conn, session_id)
    return {**summary, "lap_count": lap_count, "kpis": kpis}
