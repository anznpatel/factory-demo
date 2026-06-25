"""Telemetry router (architecture.md Section 4 + 4.1 LOCKED decisions).

GET /api/sessions/{id}/telemetry
  Query params (all optional):
    lap        int >= 1          (filters to that lap_number; null when omitted)
    signals    CSV of signal names (default = all 13; de-duped, order echoed)
    from_ms    int >= 0          (inclusive lower bound on t_ms)
    to_ms      int >= 0          (inclusive upper bound on t_ms)
    max_points int in [1,5000]   (downsampling cap; default 500)

Path id is typed ``int`` so a non-integer segment is 422 automatically. Range
constraints on the numeric params are declared via ``Query`` so FastAPI
surfaces them as 422 before the handler (and thus before the 404 not-found
check), honoring the validation-precedence locked decision. Unknown signal
names are validated in-handler and rejected as 422 (also before the 404 check).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app import queries
from app.models import TelemetryResponse
from app.routers.deps import Conn, require_session

router = APIRouter(prefix="/api", tags=["telemetry"])


@router.get("/sessions/{session_id}/telemetry", response_model=TelemetryResponse)
def get_telemetry(
    session_id: int,
    conn: Conn,
    lap: int | None = Query(None, ge=1),
    signals: str | None = Query(None),
    from_ms: int | None = Query(None, ge=0),
    to_ms: int | None = Query(None, ge=0),
    max_points: int = Query(500, ge=1, le=5000),
) -> TelemetryResponse:
    """GET /api/sessions/{id}/telemetry -> filtered, downsampled telemetry."""
    # Validate signals first so an unknown name yields 422 even for an
    # unknown session (validation precedes not-found).
    try:
        sig_list = queries.parse_signals(signals)
    except queries.UnknownSignalError as exc:
        raise HTTPException(
            status_code=422,
            detail=[
                {
                    "loc": ["query", "signals"],
                    "msg": f"Unknown signal name: {exc}",
                    "type": "value_error",
                }
            ],
        ) from exc

    require_session(conn, session_id)
    data = queries.get_telemetry(
        conn, session_id, lap, sig_list, from_ms, to_ms, max_points
    )
    return TelemetryResponse(**data)
