"""Transactional outbox. SQL commits even when the document store is down."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OutboxEvent

logger = logging.getLogger("edunexus.outbox")
MAX_ATTEMPTS = 5


def enqueue_outbox(
    db: Session,
    *,
    school_id: int | None,
    event_type: str,
    collection: str,
    payload: dict,
    dedupe_key: str | None = None,
) -> tuple[OutboxEvent, bool]:
    if dedupe_key:
        existing = db.scalar(select(OutboxEvent).where(OutboxEvent.dedupe_key == dedupe_key))
        if existing is not None:
            return existing, False
    body = dict(payload)
    if dedupe_key:
        body.setdefault("dedupe_key", dedupe_key)
    event = OutboxEvent(
        school_id=school_id,
        event_type=event_type,
        collection=collection,
        payload_json=json.dumps(body, default=str),
        status="pending",
        attempts=0,
        dedupe_key=dedupe_key,
    )
    db.add(event)
    db.flush()
    return event, True


def drain_outbox(db: Session, store, limit: int = 100) -> int:
    """Commit pending SQL first, then copy rows into the document store with retries.

    A document-store failure increments `attempts` and leaves the relational data in place.
    """
    db.commit()
    ids = list(
        db.scalars(
            select(OutboxEvent.id)
            .where(OutboxEvent.status == "pending")
            .order_by(OutboxEvent.id)
            .limit(limit)
        )
    )
    delivered = 0
    for event_id in ids:
        event = db.get(OutboxEvent, event_id)
        if event is None or event.status != "pending":
            continue
        try:
            payload = json.loads(event.payload_json)
            store.insert(event.collection, payload)
        except Exception as exc:  # store errors must not roll back committed business rows
            db.rollback()
            event = db.get(OutboxEvent, event_id)
            if event is None:
                continue
            event.attempts = int(event.attempts or 0) + 1
            event.last_error = str(exc)[:500]
            if event.attempts >= MAX_ATTEMPTS:
                event.status = "failed"
            logger.warning(
                "outbox delivery failed",
                extra={"event_id": event_id, "attempts": event.attempts, "collection": event.collection},
            )
            db.commit()
            continue
        event.status = "processed"
        event.processed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        event.attempts = int(event.attempts or 0) + 1
        event.last_error = None
        db.commit()
        delivered += 1
    return delivered
