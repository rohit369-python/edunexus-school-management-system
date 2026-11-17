"""API tests use a temporary SQLite file and the in-memory document store."""

from __future__ import annotations

import os
import tempfile

_TMP = tempfile.mkdtemp(prefix="edunexus-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/edunexus_test.db"
os.environ["JWT_SECRET"] = "test-jwt-secret"
os.environ["JWT_REFRESH_SECRET"] = "test-refresh-secret"
os.environ["MOCK_GATEWAY_SECRET"] = "test-gateway-secret"
os.environ["CELERY_TASK_ALWAYS_EAGER"] = "1"
os.environ["RATE_LIMIT_PER_MINUTE"] = "10000"
os.environ["MONGO_URL"] = ""
os.environ["RAZORPAY_KEY_ID"] = ""
os.environ["RAZORPAY_KEY_SECRET"] = ""
os.environ["SEED_ON_STARTUP"] = "1"

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(scope="session")
def client():
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db(client):
    from app.db import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def auth_header(client, email: str, password: str) -> dict:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
