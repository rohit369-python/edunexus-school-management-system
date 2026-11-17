"""SQLAlchemy engine. SQLite by default; PostgreSQL when DATABASE_URL says so."""

from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

engine = None
SessionLocal = None
_listener_bound = False


class Base(DeclarativeBase):
    pass


def init_db(url: str):
    global engine, SessionLocal, _listener_bound
    connect_args: dict = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    engine = create_engine(url, connect_args=connect_args, future=True)
    if url.startswith("sqlite") and not _listener_bound:

        @event.listens_for(engine, "connect")
        def _enable_fk(dbapi_conn, _connection_record):  # noqa: ARG001
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

        _listener_bound = True
    SessionLocal = sessionmaker(bind=engine, autoflush=True, expire_on_commit=False, future=True)
    return engine
