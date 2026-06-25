"""Sessions + laps router (architecture.md Section 4).

Routes:
- GET /api/sessions            -> list of session summaries (ordered by id)
- GET /api/sessions/{id}       -> session detail + lap_count + kpis (404 if unknown)
- GET /api/sessions/{id}/laps  -> laps for a session (404 if session unknown)

The path id is typed ``int`` so a non-integer segment is rejected with 422
automatically by FastAPI before any handler logic runs. Routers stay thin:
they obtain a connection, call pure query functions, and construct pydantic
response models. Not-found sessions raise the canonical 404.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app import queries
from app.models import Lap, SessionDetail, SessionSummary
from app.routers.deps import Conn, require_session

router = APIRouter(prefix="/api", tags=["sessions"])


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions(conn: Conn) -> list[SessionSummary]:
    """GET /api/sessions -> all session summaries ordered by id ascending."""
    rows = queries.list_sessions(conn)
    return [SessionSummary(**row) for row in rows]


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: int, conn: Conn) -> SessionDetail:
    """GET /api/sessions/{id} -> session detail with lap_count and kpis."""
    detail = queries.get_session_detail(conn, session_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return SessionDetail(**detail)


@router.get("/sessions/{session_id}/laps", response_model=list[Lap])
def list_laps(session_id: int, conn: Conn) -> list[Lap]:
    """GET /api/sessions/{id}/laps -> laps for the session ordered by lap_number."""
    require_session(conn, session_id)
    rows = queries.get_laps(conn, session_id)
    return [Lap(**row) for row in rows]
