"""Request dependencies: DB unit of work, auth, and the in-memory rate limit."""

from __future__ import annotations

import threading
import time
from collections import deque

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.errors import AppError
from app.models import User
from app.outbox import drain_outbox
from app.security import decode_access

_bearer = HTTPBearer(auto_error=False)
_lock = threading.Lock()
_hits: dict[str, deque] = {}
_EXEMPT_SUFFIXES = ("/health", "/ready", "/metrics")


def rate_limiter(request: Request) -> None:
    path = request.url.path
    if path == "/metrics" or path.endswith(_EXEMPT_SUFFIXES):
        return
    limit = request.app.state.settings.rate_limit_per_minute
    host = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _lock:
        bucket = _hits.setdefault(host, deque())
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= limit:
            raise AppError(429, "Rate limit exceeded", "rate_limited")
        bucket.append(now)


def get_db(request: Request):
    if SessionLocal is None:
        raise AppError(503, "Database is not initialised", "not_ready")
    db: Session = SessionLocal()
    try:
        yield db
        store = getattr(request.app.state, "documents", None)
        if store is not None:
            drain_outbox(db, store)
        else:
            db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None or not creds.credentials:
        raise AppError(401, "Not authenticated", "unauthorized")
    settings = request.app.state.settings
    try:
        payload = decode_access(creds.credentials, settings)
    except jwt.PyJWTError:
        raise AppError(401, "Invalid token", "unauthorized") from None
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.is_active:
        raise AppError(401, "User inactive or missing", "unauthorized")
    return user
