"""Celery tasks. CELERY_TASK_ALWAYS_EAGER=1 runs them in-process and does not need Redis.

If Celery itself cannot be imported, `.delay` still calls the function directly.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone

from sqlalchemy import select

logger = logging.getLogger("edunexus.tasks")

celery = None
try:
    from celery import Celery

    broker = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
    celery = Celery("edunexus", broker=broker, backend=os.getenv("CELERY_RESULT_BACKEND", broker))
    celery.conf.task_always_eager = os.getenv("CELERY_TASK_ALWAYS_EAGER", "1") == "1"
    celery.conf.task_eager_propagates = True
    celery.conf.broker_connection_retry_on_startup = True
except Exception as exc:  # pragma: no cover - offline fallback
    logger.warning("celery unavailable, using in-process fallback: %s", exc)
    celery = None


def _session():
    from app.config import get_settings
    from app.db import Base, SessionLocal, engine, init_db

    if SessionLocal is None:
        init_db(get_settings().database_url)
        Base.metadata.create_all(engine)
    from app.db import SessionLocal as factory

    return factory()


def _store():
    from app.config import get_settings
    from app.documents import build_document_store

    settings = get_settings()
    return build_document_store(settings.mongo_url, settings.mongo_db)


def send_fee_reminders(school_id: int | None = None) -> dict:
    """Log-only reminders for invoices that are still pending or overdue."""
    from app.domain import fee_status
    from app.models import FeeInvoice, Parent, ParentStudent, Student
    from app.notify import LogEmailAdapter, LogSmsAdapter
    from app.outbox import drain_outbox, enqueue_outbox

    db = _session()
    email = LogEmailAdapter()
    sms = LogSmsAdapter()
    sent = 0
    try:
        stmt = select(FeeInvoice).where(FeeInvoice.cancelled.is_(False))
        if school_id is not None:
            stmt = stmt.where(FeeInvoice.school_id == school_id)
        today = date.today()
        for invoice in db.scalars(stmt).all():
            status = fee_status(
                amount_due=invoice.amount_due,
                amount_paid=invoice.amount_paid,
                concession=invoice.concession,
                due_date=invoice.due_date,
                today=today,
                cancelled=invoice.cancelled,
            )
            invoice.status = status
            if status not in {"pending", "overdue"}:
                continue
            student = db.get(Student, invoice.student_id)
            parent_id = db.scalar(
                select(ParentStudent.parent_id).where(ParentStudent.student_id == invoice.student_id)
            )
            parent = db.get(Parent, parent_id) if parent_id else None
            target = parent.email if parent and parent.email else "accounts@edunexus.school"
            email.send(
                to=target,
                subject=f"Fee reminder {invoice.invoice_no}",
                body=f"Invoice {invoice.invoice_no} is {status}.",
            )
            if parent and parent.phone:
                sms.send(to=parent.phone, body=f"Invoice {invoice.invoice_no} is {status}.")
            enqueue_outbox(
                db,
                school_id=invoice.school_id,
                event_type="fee_reminder",
                collection="notification_payloads",
                dedupe_key=f"fee-reminder:{invoice.id}:{today.isoformat()}",
                payload={
                    "school_id": invoice.school_id,
                    "student_id": student.id if student else None,
                    "invoice_id": invoice.id,
                    "status": status,
                    "channel": "log",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            sent += 1
        drain_outbox(db, _store())
    finally:
        db.close()
    return {"reminders": sent}


def generate_report_cards(exam_id: int) -> dict:
    """Record that a report-card batch was prepared. PDFs are rendered on demand by the API."""
    from app.models import Examination, Mark
    from app.outbox import drain_outbox, enqueue_outbox

    db = _session()
    try:
        exam = db.get(Examination, exam_id)
        if exam is None:
            return {"status": "missing", "exam_id": exam_id}
        mark_count = len(db.scalars(select(Mark.id).where(Mark.exam_id == exam_id)).all())
        enqueue_outbox(
            db,
            school_id=exam.school_id,
            event_type="report_card_batch",
            collection="document_processing_metadata",
            dedupe_key=f"report-cards:{exam_id}",
            payload={
                "school_id": exam.school_id,
                "document_type": "report_card_batch",
                "exam_id": exam_id,
                "mark_rows": mark_count,
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        drain_outbox(db, _store())
        return {"status": "recorded", "exam_id": exam_id, "mark_rows": mark_count}
    finally:
        db.close()


def risk_scan(school_id: int | None = None) -> dict:
    """Write academic observations. Never a sanction and never a demographic label."""
    from app.domain import assess_risk
    from app.models import Student
    from app.outbox import drain_outbox, enqueue_outbox
    from app.risk_service import load_risk_inputs

    db = _session()
    scanned = 0
    try:
        stmt = select(Student.id, Student.school_id)
        if school_id is not None:
            stmt = stmt.where(Student.school_id == school_id)
        today = date.today().isoformat()
        for student_id, sid in db.execute(stmt).all():
            inputs = load_risk_inputs(db, student_id)
            result = assess_risk(
                attendance_pct=inputs["attendance_pct"],
                failed_subjects=inputs["failed_subjects"],
                mark_decline=inputs["mark_decline"],
                missing_assignments=inputs["missing_assignments"],
            )
            enqueue_outbox(
                db,
                school_id=sid,
                event_type="risk_observation",
                collection="student_learning_observations",
                dedupe_key=f"risk:{student_id}:{today}",
                payload={
                    "school_id": sid,
                    "student_id": student_id,
                    "level": result["level"],
                    "indicators": result["indicators"],
                    "recommendations": result["recommendations"],
                    "kind": "human_review_suggestion",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                },
            )
            scanned += 1
        drain_outbox(db, _store())
    finally:
        db.close()
    return {"scanned": scanned}


def _bind(name: str, fn):
    if celery is None:
        fn.delay = lambda *args, _fn=fn, **kwargs: _fn(*args, **kwargs)
        return fn
    return celery.task(name=name)(fn)


send_fee_reminders = _bind("edunexus.send_fee_reminders", send_fee_reminders)
generate_report_cards = _bind("edunexus.generate_report_cards", generate_report_cards)
risk_scan = _bind("edunexus.risk_scan", risk_scan)

if celery is not None:
    celery.conf.beat_schedule = {
        "fee-reminders-daily": {"task": "edunexus.send_fee_reminders", "schedule": 86400.0},
        "risk-scan-daily": {"task": "edunexus.risk_scan", "schedule": 86400.0},
    }
