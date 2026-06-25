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

import math
import sqlite3
from typing import Any

# The 13 valid telemetry signal names, in canonical (contract) order. This is
# the default signal set returned when ``signals`` is omitted.
ALL_SIGNALS: tuple[str, ...] = (
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
)

_VALID_SIGNALS: frozenset[str] = frozenset(ALL_SIGNALS)


class UnknownSignalError(ValueError):
    """Raised when a requested signal name is not in the valid set."""


def parse_signals(raw: str | None) -> list[str]:
    """Parse a CSV ``signals`` query param into a de-duplicated, validated list.

    Missing or blank -> the full 13-signal default set (canonical order).
    Otherwise split on commas, strip whitespace, drop empty fragments, de-dup
    while preserving the first-seen order, and reject unknown names via
    ``UnknownSignalError``.
    """
    if raw is None or raw.strip() == "":
        return list(ALL_SIGNALS)
    seen: list[str] = []
    seen_set: set[str] = set()
    for part in raw.split(","):
        name = part.strip()
        if name == "":
            continue
        if name not in _VALID_SIGNALS:
            raise UnknownSignalError(name)
        if name not in seen_set:
            seen.append(name)
            seen_set.add(name)
    return seen


def _downsample(n: int, max_points: int) -> tuple[list[int], bool]:
    """Return (selected indices, downsampled flag) for ``n`` matched rows.

    When ``n <= max_points`` every row is kept (downsampled=False). Otherwise an
    evenly strided subset (stride = ceil(n / max_points)) is returned that
    always retains the first and last matched rows and never exceeds
    ``max_points`` entries (downsampled=True).
    """
    if n <= max_points:
        return list(range(n)), False
    stride = math.ceil(n / max_points)
    idx = list(range(0, n, stride))
    if idx and idx[-1] != n - 1:
        # Keep the endpoint without exceeding the cap: append when there is
        # room, otherwise swap out the last strided index for the true last.
        if len(idx) < max_points:
            idx.append(n - 1)
        else:
            idx[-1] = n - 1
    return idx, True

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
    max_tire_temp_c. Assumes the session exists. Guards the empty case: when
    a session has no laps or no telemetry samples the SQL aggregates return
    NULL, which is coerced to 0 so callers never hit a float(None) TypeError.
    """
    best_row = conn.execute(
        "SELECT MIN(lap_time_ms) AS best_lap_ms FROM laps WHERE session_id = ?",
        (session_id,),
    ).fetchone()
    best_lap_ms = 0
    if best_row is not None and best_row["best_lap_ms"] is not None:
        best_lap_ms = int(best_row["best_lap_ms"])

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

    # MAX over an empty set is NULL, so top_speed_kph acts as a sentinel for
    # "at least one telemetry sample exists"; when it is NULL every other
    # aggregate in the row is also NULL and must not be passed to float().
    top_speed_kph = 0.0
    avg_throttle_pct = 0.0
    max_tire_temp_c = 0.0
    if telem_row is not None and telem_row["top_speed_kph"] is not None:
        top_speed_kph = float(telem_row["top_speed_kph"])
        avg_throttle_pct = float(telem_row["avg_throttle_pct"])
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


def get_telemetry(
    conn: sqlite3.Connection,
    session_id: int,
    lap: int | None,
    signals: list[str],
    from_ms: int | None,
    to_ms: int | None,
    max_points: int,
) -> dict[str, Any]:
    """Fetch, filter, downsample, and project telemetry for a session.

    Rows are matched from ``telemetry_samples`` joined to ``laps`` (for
    lap_number) and filtered by the optional lap number and inclusive
    [from_ms, to_ms] time window. The matched rows are ordered by
    (lap_number, t_ms), downsampled to at most ``max_points`` samples (first
    and last retained), then projected to ``t_ms`` plus the requested signals.

    ``sample_count`` is the number of matched rows (independent of max_points
    and signals); ``returned_count`` is the number of samples after
    downsampling; ``downsampled`` is True iff sample_count > max_points.

    Assumes the session exists and ``signals`` is already validated/de-duped.
    """
    signal_cols = ", ".join(f"t.{s}" for s in signals)
    sql = (
        f"SELECT t.t_ms, {signal_cols}, l.lap_number "
        "FROM telemetry_samples t JOIN laps l ON t.lap_id = l.id "
        "WHERE t.session_id = ?"
    )
    params: list[Any] = [session_id]
    if lap is not None:
        sql += " AND l.lap_number = ?"
        params.append(lap)
    if from_ms is not None:
        sql += " AND t.t_ms >= ?"
        params.append(from_ms)
    if to_ms is not None:
        sql += " AND t.t_ms <= ?"
        params.append(to_ms)
    sql += " ORDER BY l.lap_number ASC, t.t_ms ASC"

    rows = conn.execute(sql, params).fetchall()
    sample_count = len(rows)
    indices, downsampled = _downsample(sample_count, max_points)

    samples: list[dict[str, Any]] = []
    for i in indices:
        row = rows[i]
        sample: dict[str, Any] = {"t_ms": row["t_ms"]}
        for s in signals:
            sample[s] = row[s]
        samples.append(sample)

    return {
        "session_id": session_id,
        "lap": lap,
        "signals": signals,
        "sample_count": sample_count,
        "returned_count": len(samples),
        "downsampled": downsampled,
        "samples": samples,
    }


# The 8 alert columns exposed by the contract, in contract order. lap_number
# is joined from the laps table (alerts only store lap_id).
_ALERT_COLUMNS = (
    "a.id, a.session_id, a.lap_id, l.lap_number, a.t_ms, a.type, a.severity, a.message"
)


def get_alerts(
    conn: sqlite3.Connection,
    session_id: int,
    severity: str | None,
) -> list[dict[str, Any]]:
    """Return alerts for a session, optionally filtered by severity.

    Ordered by (lap_number, t_ms) ascending. ``lap_number`` is joined from
    laps. Assumes the session exists and ``severity`` (if given) is valid.
    """
    sql = (
        f"SELECT {_ALERT_COLUMNS} "
        "FROM alerts a JOIN laps l ON a.lap_id = l.id "
        "WHERE a.session_id = ?"
    )
    params: list[Any] = [session_id]
    if severity is not None:
        sql += " AND a.severity = ?"
        params.append(severity)
    sql += " ORDER BY l.lap_number ASC, a.t_ms ASC"
    rows = conn.execute(sql, params).fetchall()
    return list(rows)
