"""Load academic inputs for risk. This module must not read directory demographics."""

from __future__ import annotations

from datetime import date

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.domain import attendance_summary, overall_result, subject_outcome
from app.errors import AppError
from app.models import (
    Assignment,
    AssignmentSubmission,
    AttendanceRecord,
    AttendanceSession,
    ExamSubject,
    Examination,
    Mark,
    Student,
)


def load_risk_inputs(db: Session, student_id: int) -> dict:
    student = db.get(Student, student_id)
    if student is None:
        raise AppError(404, "Student not found", "not_found")
    rows = db.execute(
        select(AttendanceRecord.status, AttendanceSession.is_holiday)
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .where(
            AttendanceRecord.student_id == student_id,
            AttendanceRecord.school_id == student.school_id,
        )
    ).all()
    summary = attendance_summary(
        [{"status": status, "is_holiday": bool(is_holiday)} for status, is_holiday in rows]
    )
    exams = db.scalars(
        select(Examination)
        .where(
            Examination.school_id == student.school_id,
            Examination.status == "published",
            or_(Examination.class_id.is_(None), Examination.class_id == student.class_id),
        )
        .order_by(Examination.exam_date, Examination.id)
    ).all()

    def exam_snapshot(exam: Examination) -> tuple[float | None, int]:
        subjects = db.scalars(select(ExamSubject).where(ExamSubject.exam_id == exam.id)).all()
        packed = []
        for exam_subject in subjects:
            mark = db.scalar(
                select(Mark).where(
                    Mark.exam_id == exam.id,
                    Mark.student_id == student_id,
                    Mark.subject_id == exam_subject.subject_id,
                )
            )
            if mark is None:
                continue
            outcome = subject_outcome(
                mark.marks_obtained,
                mark.max_marks,
                bool(mark.is_absent) or mark.marks_obtained is None,
            )
            packed.append({"required": bool(exam_subject.required), "outcome": outcome})
        if not packed:
            return None, 0
        overall = overall_result(packed)
        failed = sum(1 for item in packed if item["required"] and not item["outcome"]["passed"])
        return overall["average_percentage"], failed

    failed_subjects = 0
    mark_decline = 0.0
    if exams:
        latest_pct, failed_subjects = exam_snapshot(exams[-1])
        if len(exams) >= 2:
            previous_pct, _ignored = exam_snapshot(exams[-2])
            if latest_pct is not None and previous_pct is not None:
                mark_decline = float(previous_pct) - float(latest_pct)

    today = date.today()
    assignments = db.scalars(
        select(Assignment).where(
            Assignment.school_id == student.school_id,
            Assignment.section_id == student.section_id,
            Assignment.due_date < today,
        )
    ).all()
    missing = 0
    for assignment in assignments:
        submission = db.scalar(
            select(AssignmentSubmission.id).where(
                AssignmentSubmission.assignment_id == assignment.id,
                AssignmentSubmission.student_id == student_id,
            )
        )
        if submission is None:
            missing += 1
    return {
        "student_id": student.id,
        "school_id": student.school_id,
        "attendance_pct": summary.percentage,
        "failed_subjects": failed_subjects,
        "mark_decline": mark_decline,
        "missing_assignments": missing,
    }
