"""Shared router dependencies: SQLite connection + session-existence guard.

Every ``/api/sessions/{id}/*`` router reuses these so the dict-row connection
lifecycle and the canonical 404 ("Session not found") behavior stay uniform.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException

from app import queries
from app.db import connect


def get_conn() -> Iterator[sqlite3.Connection]:
    """Yield a dict-row SQLite connection, closing it after the request."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


Conn = Annotated[sqlite3.Connection, Depends(get_conn)]


def require_session(conn: sqlite3.Connection, session_id: int) -> None:
    """Raise the canonical 404 if the session id does not exist."""
    if not queries.session_exists(conn, session_id):
        raise HTTPException(status_code=404, detail="Session not found")
