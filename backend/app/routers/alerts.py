"""Alerts router (architecture.md Section 4 + 4.1 LOCKED decisions).

GET /api/sessions/{id}/alerts
  Query params: severity (optional: info|warning|critical).

Path id is typed ``int`` so a non-integer segment is 422 automatically. The
severity enum is enforced via a ``Query`` regex so an invalid value is rejected
as 422 by FastAPI before the handler runs (and thus before the 404 not-found
check), honoring validation precedence. Alerts are ordered by
(lap_number, t_ms); a valid-but-unused severity returns 200 [].
"""

from __future__ import annotations

from fastapi import APIRouter, Query

from app import queries
from app.models import Alert
from app.routers.deps import Conn, require_session

router = APIRouter(prefix="/api", tags=["alerts"])


@router.get("/sessions/{session_id}/alerts", response_model=list[Alert])
def list_alerts(
    session_id: int,
    conn: Conn,
    severity: str | None = Query(None, pattern=r"^(info|warning|critical)$"),
) -> list[Alert]:
    """GET /api/sessions/{id}/alerts -> alerts scoped to the session."""
    require_session(conn, session_id)
    rows = queries.get_alerts(conn, session_id, severity)
    return [Alert(**row) for row in rows]
