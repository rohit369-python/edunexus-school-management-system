"""Initial schema. Uses the SQLAlchemy metadata so SQLite and PostgreSQL stay aligned.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-17
"""

from __future__ import annotations

from alembic import op

from app.db import Base
from app import models  # noqa: F401

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
