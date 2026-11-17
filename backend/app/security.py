"""Passwords (stdlib PBKDF2) and JWT access/refresh tokens."""

from __future__ import annotations

import hashlib
import hmac
import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config import Settings

ROLES = (
    "super_admin",
    "school_admin",
    "principal",
    "coordinator",
    "teacher",
    "student",
    "parent",
    "accountant",
    "librarian",
    "receptionist",
)

PBKDF2_ITERATIONS = 100_000


def password_meets_policy(password: str) -> bool:
    if len(password) < 8 or len(password) > 128:
        return False
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(not c.isalnum() for c in password)
    return has_upper and has_lower and has_digit and has_special


def hash_password(password: str, iterations: int = PBKDF2_ITERATIONS) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, rounds, salt_hex, hash_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            bytes.fromhex(salt_hex),
            int(rounds),
        )
        return hmac.compare_digest(digest.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_access_token(user, settings: Settings) -> str:
    now = _now()
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "school_id": user.school_id,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def new_refresh_jti() -> str:
    return uuid.uuid4().hex


def create_refresh_token(user, jti: str, settings: Settings) -> tuple[str, datetime]:
    now = _now()
    expires = now + timedelta(days=settings.refresh_token_days)
    payload = {
        "sub": str(user.id),
        "type": "refresh",
        "jti": jti,
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
    }
    token = jwt.encode(payload, settings.jwt_refresh_secret, algorithm="HS256")
    return token, expires.replace(tzinfo=None)


def decode_access(token: str, settings: Settings) -> dict:
    payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return payload


def decode_refresh(token: str, settings: Settings) -> dict:
    payload = jwt.decode(token, settings.jwt_refresh_secret, algorithms=["HS256"])
    if payload.get("type") != "refresh":
        raise jwt.InvalidTokenError("not a refresh token")
    return payload
