"""Deterministic synthetic-telemetry generator + idempotent demo seeder.

A single ``random.Random(42)`` instance drives every randomized value, so
repeated seeding produces byte-identical data. Signals are physically
plausible and correlated: speed/RPM/gear track each other, throttle and brake
are anti-correlated, tire temps drift up over a lap, fuel is monotonically
non-increasing across a session, and g_lat/g_long reflect cornering/braking.

Run as a module to seed or reset the DB:

    python -m app.generator            # seed if empty (idempotent)
    python -m app.generator --reset    # drop, recreate, seed
"""

from __future__ import annotations

import argparse
import math
import random
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import TypedDict

from app.db import connect, drop_tables, init_db

SEED = 42


class DemoSession(TypedDict):
    """Static type for the fixed demo-session descriptor rows."""

    id: int
    track_name: str
    car_id: str
    driver: str
    weather: str
    ambient_temp_c: float
    total_laps: int
    top_speed: float
    started_at: str


# Fixed demo dataset (architecture.md Section 3). Session ids are pinned to
# 1 (Silverstone), 2 (Monza), 3 (Suzuka) by inserting explicit ids.
DEMO_SESSIONS: list[DemoSession] = [
    {
        "id": 1,
        "track_name": "Silverstone",
        "car_id": "RB-19",
        "driver": "A. Verstappen",
        "weather": "dry",
        "ambient_temp_c": 22.5,
        "total_laps": 5,
        "top_speed": 312.0,
        "started_at": "2024-06-01T13:00:00Z",
    },
    {
        "id": 2,
        "track_name": "Monza",
        "car_id": "SF-23",
        "driver": "C. Leclerc",
        "weather": "dry",
        "ambient_temp_c": 26.0,
        "total_laps": 4,
        "top_speed": 328.0,
        "started_at": "2024-06-08T14:00:00Z",
    },
    {
        "id": 3,
        "track_name": "Suzuka",
        "car_id": "W14",
        "driver": "L. Hamilton",
        "weather": "mixed",
        "ambient_temp_c": 19.5,
        "total_laps": 6,
        "top_speed": 300.0,
        "started_at": "2024-06-15T15:00:00Z",
    },
]

# Fixed corner layout (fraction of lap, cornering depth). Alternating signs
# give left/right corners so steering and g_lat swing both ways.
_CORNERS = [
    (0.08, 0.70),
    (0.22, 0.85),
    (0.38, 0.60),
    (0.52, 0.90),
    (0.68, 0.55),
    (0.83, 0.75),
]
_CORNER_WIDTH = 0.045


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def _corner_field(p: float) -> float:
    """Signed cornering field in roughly [-1, 1]; sign = corner direction."""
    val = 0.0
    for i, (pos, depth) in enumerate(_CORNERS):
        d = (p - pos) / _CORNER_WIDTH
        val += ((-1) ** i) * depth * math.exp(-d * d)
    return val


def _parse_iso(ts: str) -> datetime:
    """Parse a trailing-Z ISO-8601 UTC timestamp into an aware datetime."""
    return datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _format_iso(dt: datetime) -> str:
    """Format an aware datetime as ISO-8601 UTC with a trailing Z."""
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _generate_lap(
    rng: random.Random,
    lap_time_ms: int,
    top_speed: float,
    fuel_start: float,
) -> tuple[list[dict[str, float | int]], float]:
    """Generate 10 Hz telemetry for one lap; return (samples, fuel_end).

    ``fuel_start`` is carried across laps so fuel is non-increasing for the
    whole session. ``t_ms`` steps by 100 from 0 to ``lap_time_ms`` inclusive.
    """
    samples: list[dict[str, float | int]] = []
    fuel = fuel_start
    n = lap_time_ms // 100
    for step in range(n + 1):
        t_ms = step * 100
        p = t_ms / lap_time_ms if lap_time_ms else 0.0
        field = _corner_field(p)
        intensity = min(abs(field), 1.0)
        sign = 1.0 if field >= 0 else -1.0

        speed = _clamp(top_speed * (1.0 - 0.65 * intensity) + rng.uniform(-3.0, 3.0), 0.0, 360.0)
        brake = _clamp(intensity * 100.0 + rng.uniform(-5.0, 5.0), 0.0, 100.0)
        throttle = _clamp((1.0 - intensity) * 100.0 + rng.uniform(-5.0, 5.0), 0.0, 100.0)
        # Enforce throttle<->brake anti-correlation: never both high at once.
        if throttle + brake > 100.0:
            excess = (throttle + brake) - 100.0
            throttle -= excess / 2.0
            brake -= excess / 2.0
            throttle = _clamp(throttle, 0.0, 100.0)
            brake = _clamp(brake, 0.0, 100.0)

        gear = max(0, min(8, int(speed / 45.0) + 1)) if speed > 5.0 else 0
        rpm = int(
            _clamp(4000.0 + speed * 30.0 - gear * 1200.0 + rng.uniform(-200.0, 200.0), 0.0, 15000.0)
        )
        steering = _clamp(sign * intensity * 120.0 + rng.uniform(-10.0, 10.0), -180.0, 180.0)
        g_lat = _clamp(sign * intensity * 2.5 + rng.uniform(-0.1, 0.1), -3.0, 3.0)
        g_long = _clamp((throttle - brake) / 100.0 * 1.2 + rng.uniform(-0.1, 0.1), -3.0, 3.0)

        tire_base = 85.0 + p * 15.0 + intensity * 10.0
        tire_fl = _clamp(tire_base + rng.uniform(-2.0, 2.0), 0.0, 200.0)
        tire_fr = _clamp(tire_base + rng.uniform(-2.0, 2.0), 0.0, 200.0)
        tire_rl = _clamp(tire_base - 3.0 + rng.uniform(-2.0, 2.0), 0.0, 200.0)
        tire_rr = _clamp(tire_base - 3.0 + rng.uniform(-2.0, 2.0), 0.0, 200.0)

        # Fuel burn: proportional to throttle plus a small idle draw. Only ever
        # decreases, keeping fuel_pct monotonically non-increasing per session.
        fuel = max(0.0, fuel - (throttle / 100.0 * 0.004 + 0.0002))

        samples.append(
            {
                "t_ms": t_ms,
                "speed_kph": round(speed, 2),
                "rpm": rpm,
                "gear": gear,
                "throttle_pct": round(throttle, 2),
                "brake_pct": round(brake, 2),
                "steering_deg": round(steering, 2),
                "tire_temp_fl": round(tire_fl, 2),
                "tire_temp_fr": round(tire_fr, 2),
                "tire_temp_rl": round(tire_rl, 2),
                "tire_temp_rr": round(tire_rr, 2),
                "g_lat": round(g_lat, 3),
                "g_long": round(g_long, 3),
                "fuel_pct": round(fuel, 3),
            }
        )
    return samples, fuel


def _seed_session(
    rng: random.Random,
    conn: sqlite3.Connection,
    sess: DemoSession,
) -> None:
    """Insert one session, its laps, telemetry, and alerts (deterministic)."""
    sess_id = sess["id"]
    total_laps = sess["total_laps"]
    top_speed = sess["top_speed"]

    # Deterministic lap times as multiples of 100 ms so 10 Hz cadence lands
    # exactly on lap_time_ms (last sample t_ms == lap_time_ms).
    lap_times = [rng.randint(800, 1100) * 100 for _ in range(total_laps)]
    best_idx = min(range(total_laps), key=lambda i: (lap_times[i], i))

    # Compute the session end time from the total lap duration, then insert the
    # session row first so laps/telemetry/alerts FKs resolve.
    started = _parse_iso(str(sess["started_at"]))
    total_duration_ms = sum(lap_times)
    ended = started + timedelta(milliseconds=total_duration_ms)
    conn.execute(
        """
        INSERT INTO sessions
            (id, track_name, car_id, driver, weather, ambient_temp_c,
             started_at, ended_at, total_laps)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            sess_id,
            sess["track_name"],
            sess["car_id"],
            sess["driver"],
            sess["weather"],
            float(sess["ambient_temp_c"]),
            sess["started_at"],
            _format_iso(ended),
            total_laps,
        ),
    )

    started_at_ms = 0
    lap_ids: list[int] = []
    fuel = round(98.0 - (sess_id - 1) * 1.5, 3)  # per-session starting fuel
    for lap_number in range(1, total_laps + 1):
        lap_time_ms = lap_times[lap_number - 1]
        is_best = 1 if (lap_number - 1) == best_idx else 0
        cur = conn.execute(
            """
            INSERT INTO laps (session_id, lap_number, lap_time_ms, started_at_ms, is_best)
            VALUES (?, ?, ?, ?, ?)
            """,
            (sess_id, lap_number, lap_time_ms, started_at_ms, is_best),
        )
        assert cur.lastrowid is not None
        lap_id = int(cur.lastrowid)
        lap_ids.append(lap_id)

        samples, fuel = _generate_lap(rng, lap_time_ms, top_speed, fuel)
        conn.executemany(
            """
            INSERT INTO telemetry_samples
                (session_id, lap_id, t_ms, speed_kph, rpm, gear, throttle_pct, brake_pct,
                 steering_deg, tire_temp_fl, tire_temp_fr, tire_temp_rl, tire_temp_rr,
                 g_lat, g_long, fuel_pct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (
                    sess_id,
                    lap_id,
                    int(s["t_ms"]),
                    s["speed_kph"],
                    int(s["rpm"]),
                    int(s["gear"]),
                    s["throttle_pct"],
                    s["brake_pct"],
                    s["steering_deg"],
                    s["tire_temp_fl"],
                    s["tire_temp_fr"],
                    s["tire_temp_rl"],
                    s["tire_temp_rr"],
                    s["g_lat"],
                    s["g_long"],
                    s["fuel_pct"],
                )
                for s in samples
            ],
        )
        started_at_ms += lap_time_ms

    _seed_alerts(rng, conn, sess, lap_ids, lap_times)


def _seed_alerts(
    rng: random.Random,
    conn: sqlite3.Connection,
    sess: DemoSession,
    lap_ids: list[int],
    lap_times: list[int],
) -> None:
    """Insert a handful of deterministic, plausible alerts for one session.

    Guarantees each session has >=1 alert, and session 1 carries a critical
    alert so >=1 critical exists across the dataset. Every alert's t_ms lies
    within [0, lap_time_ms] of its referenced lap.
    """
    sess_id = sess["id"]
    track = sess["track_name"]
    last_lap = len(lap_ids)
    last_time = lap_times[-1]
    mid_lap = min(2, last_lap)
    mid_time = lap_times[mid_lap - 1]

    # Session 1's redline is critical; others are warnings/info. Each tuple is
    # (lap_number, t_ms, type, severity, message); t_ms is clamped to the
    # referenced lap's lap_time_ms when building the insert rows below.
    alert_specs: list[tuple[int, int, str, str, str]] = [
        (
            1,
            lap_times[0] // 2,
            "redline",
            "critical" if sess_id == 1 else "warning",
            f"{track}: engine held near redline on the main straight",
        ),
        (
            last_lap,
            last_time * 9 // 10,
            "tire_overtemp",
            "warning",
            f"{track}: front-left tire over 110C late in the stint",
        ),
        (
            mid_lap,
            mid_time // 4,
            "brake_lock",
            "info",
            f"{track}: front brakes momentarily locked into Turn 1",
        ),
        (
            last_lap,
            last_time * 19 // 20,
            "fuel_low",
            "info",
            f"{track}: fuel level low, consider pit stop",
        ),
    ]

    rows = []
    for lap_number, t_ms, atype, severity, message in alert_specs:
        lap_id = lap_ids[lap_number - 1]
        lap_time_ms = lap_times[lap_number - 1]
        rows.append((sess_id, lap_id, min(t_ms, lap_time_ms), atype, severity, message))
    conn.executemany(
        """
        INSERT INTO alerts (session_id, lap_id, t_ms, type, severity, message)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    # Touch rng to keep the stream position stable across sessions.
    _ = rng.random()


def seed_demo(conn: sqlite3.Connection | None = None) -> None:
    """Idempotently seed the fixed 3-session demo dataset.

    A no-op if the 3 sessions already exist. Deterministic via ``random.Random(42)``.
    """
    own_conn = conn is None
    if conn is None:
        conn = connect()
    try:
        init_db(conn)
        row = conn.execute("SELECT COUNT(*) AS c FROM sessions").fetchone()
        existing = row["c"] if row is not None else 0
        if existing >= len(DEMO_SESSIONS):
            return
        rng = random.Random(SEED)
        for sess in DEMO_SESSIONS:
            _seed_session(rng, conn, sess)
        conn.commit()
    finally:
        if own_conn:
            conn.close()


def reset_and_seed(conn: sqlite3.Connection | None = None) -> None:
    """Drop all tables, recreate the schema, and seed the demo dataset."""
    own_conn = conn is None
    if conn is None:
        conn = connect()
    try:
        drop_tables(conn)
        init_db(conn)
        seed_demo(conn)
    finally:
        if own_conn:
            conn.close()


def main() -> None:
    """CLI entrypoint: ``python -m app.generator [--reset]``."""
    parser = argparse.ArgumentParser(description="Seed the telemetry demo database.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Drop and recreate all tables before seeding.",
    )
    args = parser.parse_args()
    if args.reset:
        reset_and_seed()
        print("Database reset and seeded with the demo dataset.")
    else:
        seed_demo()
        print("Database seeded (idempotent; no-op if already populated).")


if __name__ == "__main__":
    main()
