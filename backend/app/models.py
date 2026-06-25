"""Pydantic v2 response models for the API (architecture.md Section 4).

Models mirror the JSON contract exactly. ``is_best`` is exposed as a JSON
boolean (stored as 0/1 in SQLite); pydantic v2 coerces the integer on
validation. Field order follows the contract listing.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class SessionSummary(BaseModel):
    """The 9 summary fields returned by GET /api/sessions and the detail route."""

    id: int
    track_name: str
    car_id: str
    driver: str
    weather: str
    ambient_temp_c: float
    started_at: str
    ended_at: str
    total_laps: int


class KPIs(BaseModel):
    """Session-level KPIs computed from laps + telemetry (architecture.md Section 4)."""

    top_speed_kph: float
    best_lap_ms: int
    avg_throttle_pct: float
    max_tire_temp_c: float


class SessionDetail(BaseModel):
    """Session detail: the 9 summary fields + integer lap_count + kpis object."""

    id: int
    track_name: str
    car_id: str
    driver: str
    weather: str
    ambient_temp_c: float
    started_at: str
    ended_at: str
    total_laps: int
    lap_count: int
    kpis: KPIs


class Lap(BaseModel):
    """One lap row: the 6 contract fields, with is_best as a JSON boolean."""

    id: int
    session_id: int
    lap_number: int
    lap_time_ms: int
    started_at_ms: int
    is_best: bool


class TelemetryResponse(BaseModel):
    """GET /api/sessions/{id}/telemetry response (architecture.md Section 4).

    ``lap`` is null when the lap param is omitted (whole session). ``samples``
    is a list of dicts each containing ``t_ms`` plus the requested signals, so
    the per-sample key set varies with the projection; hence ``list[dict]``.
    """

    session_id: int
    lap: int | None
    signals: list[str]
    sample_count: int
    returned_count: int
    downsampled: bool
    samples: list[dict[str, Any]]


class Alert(BaseModel):
    """One alert row: the 8 contract fields (lap_number joined from laps)."""

    id: int
    session_id: int
    lap_id: int
    lap_number: int
    t_ms: int
    type: str
    severity: str
    message: str
