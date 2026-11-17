"""Runtime settings. Environment only — no .env file is read or written."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    jwt_refresh_secret: str
    access_token_minutes: int
    refresh_token_days: int
    mongo_url: str | None
    mongo_db: str
    celery_always_eager: bool
    celery_broker_url: str
    celery_result_backend: str
    mock_gateway_secret: str
    razorpay_key_id: str | None
    razorpay_key_secret: str | None
    rate_limit_per_minute: int
    seed_on_startup: bool


def get_settings() -> Settings:
    mongo = os.getenv("MONGO_URL", "").strip()
    broker = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    return Settings(
        database_url=os.getenv("DATABASE_URL", "sqlite:///./edunexus.db"),
        jwt_secret=os.getenv("JWT_SECRET", "dev-only-change-me"),
        jwt_refresh_secret=os.getenv("JWT_REFRESH_SECRET", "dev-only-refresh-change-me"),
        access_token_minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "30")),
        refresh_token_days=int(os.getenv("REFRESH_TOKEN_DAYS", "14")),
        mongo_url=mongo or None,
        mongo_db=os.getenv("MONGO_DB", "edunexus"),
        celery_always_eager=os.getenv("CELERY_TASK_ALWAYS_EAGER", "1") == "1",
        celery_broker_url=broker,
        celery_result_backend=os.getenv("CELERY_RESULT_BACKEND", broker),
        mock_gateway_secret=os.getenv("MOCK_GATEWAY_SECRET", "dev-mock-gateway-secret"),
        razorpay_key_id=(os.getenv("RAZORPAY_KEY_ID") or "").strip() or None,
        razorpay_key_secret=(os.getenv("RAZORPAY_KEY_SECRET") or "").strip() or None,
        rate_limit_per_minute=int(os.getenv("RATE_LIMIT_PER_MINUTE", "60")),
        seed_on_startup=os.getenv("SEED_ON_STARTUP", "1") == "1",
    )
