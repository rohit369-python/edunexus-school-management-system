"""HTTP routes for the EduNexus modular monolith."""

from __future__ import annotations

import csv
import io
import json
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import jwt
from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import Response
from openpyxl import Workbook
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.access import (
    FEE_WRITE_ROLES,
    MARKS_WRITE_ROLES,
    get_student_for_user,
    linked_student_ids,
    require_roles,
    require_school_id,
    scoped_school_id,
    student_payload,
    teacher_can_teach,
    teacher_section_ids,
)
from app.ai import MockEducationProvider
from app.deps import get_current_user, get_db
from app.domain import (
    DEFAULT_GRADE_BANDS,
    TimetableSlot,
    attendance_summary,
    fee_status,
    overall_result,
    subject_outcome,
    timetable_conflict_types,
)
from app.domain import assess_risk as assess_risk_rules
from app.errors import AppError
from app.models import (
    AcademicYear,
    Announcement,
    Assignment,
    AssignmentSubmission,
    AttendanceRecord,
    AttendanceSession,
    Book,
    BookCopy,
    CalendarEvent,
    ExamSubject,
    Examination,
    FeeInvoice,
    FeePayment,
    GradeBand,
    LibraryIssue,
    Mark,
    Parent,
    ParentStudent,
    RefreshToken,
    School,
    SchoolClass,
    Section,
    Student,
    Subject,
    Teacher,
    TimetableSlotRow,
    User,
)
from app.notify import LogEmailAdapter, LogSmsAdapter
from app.outbox import enqueue_outbox
from app.payments import MockGateway, RazorpayAdapter
from app.pdfs import fee_receipt_pdf, report_card_pdf
from app.risk_service import load_risk_inputs
from app.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh,
    new_refresh_jti,
    verify_password,
)

router = APIRouter()
_provider = MockEducationProvider()
_ATTENDANCE = {"present", "late", "half_day", "absent", "leave", "approved_leave"}


class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str
    password: str


class RefreshIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    refresh_token: str


class StudentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    admission_no: str
    first_name: str
    last_name: str = ""
    grade_level: int
    section: str
    date_of_birth: date | None = None
    gender: str | None = None
    blood_group: str | None = None
    religion: str | None = None
    roll_no: int | None = None
    school_id: int | None = None


class AttendanceEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int
    status: str


class AttendanceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    section_id: int
    subject_id: int
    session_date: date
    period: int = 1
    records: list[AttendanceEntry]


class MarkEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int
    marks_obtained: float | None = None
    is_absent: bool = False


class MarksIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exam_id: int
    subject_id: int
    section_id: int
    entries: list[MarkEntry]


class PublishIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    exam_id: int


class InvoiceIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int
    amount_due: float
    concession: float = 0
    due_date: date
    description: str = "Tuition"
    invoice_no: str | None = None


class PayIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    idempotency_key: str = Field(min_length=1, max_length=80)
    amount: float


class VerifyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    order_id: str
    payment_id: str
    signature: str
    idempotency_key: str


class RazorpayIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount_paise: int
    receipt: str


class AssignmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    section_id: int
    subject_id: int
    title: str
    description: str = ""
    due_date: date
    max_marks: float = 10


class SubmissionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: int | None = None


class IssueIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    copy_id: int
    student_id: int
    due_date: date | None = None


class ChatIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=2000)
    student_id: int | None = None


class EventIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    event_date: date
    event_type: str
    description: str = ""
    school_id: int | None = None


class SlotIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    section_id: int
    subject_id: int
    teacher_id: int
    weekday: int
    period: int
    room: str


class AnnouncementIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    body: str
    audience: str = "all"
    school_id: int | None = None


class SchoolIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    code: str
    city: str = ""
    address: str = ""


def _user_body(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "school_id": user.school_id,
    }


def _issue_tokens(db: Session, user: User, settings) -> dict:
    access = create_access_token(user, settings)
    jti = new_refresh_jti()
    refresh, expires = create_refresh_token(user, jti, settings)
    db.add(RefreshToken(user_id=user.id, jti=jti, expires_at=expires, revoked=False))
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "user": _user_body(user),
    }


def _current_year(db: Session, school_id: int) -> AcademicYear:
    year = db.scalar(
        select(AcademicYear).where(
            AcademicYear.school_id == school_id,
            AcademicYear.is_current.is_(True),
        )
    )
    if year is None:
        raise AppError(422, "No current academic year", "validation_error")
    return year


def _resolve_section(db: Session, school_id: int, year_id: int, grade_level: int, section_name: str):
    klass = db.scalar(
        select(SchoolClass).where(
            SchoolClass.school_id == school_id,
            SchoolClass.academic_year_id == year_id,
            SchoolClass.grade_level == grade_level,
        )
    )
    if klass is None:
        raise ValueError(f"unknown class for grade {grade_level}")
    section = db.scalar(
        select(Section).where(
            Section.class_id == klass.id,
            Section.name == section_name.strip().upper(),
        )
    )
    if section is None:
        raise ValueError(f"unknown section {section_name}")
    return klass, section


def _school_bands(db: Session, school_id: int):
    rows = db.scalars(select(GradeBand).where(GradeBand.school_id == school_id)).all()
    if not rows:
        return DEFAULT_GRADE_BANDS
    return tuple((row.grade, Decimal(str(row.min_percentage))) for row in rows)


def _invoice_status(invoice: FeeInvoice, today: date | None = None) -> str:
    status = fee_status(
        amount_due=invoice.amount_due,
        amount_paid=invoice.amount_paid,
        concession=invoice.concession,
        due_date=invoice.due_date,
        today=today or date.today(),
        cancelled=bool(invoice.cancelled),
    )
    invoice.status = status
    return status


def _invoice_body(db: Session, invoice: FeeInvoice) -> dict:
    payments = db.scalars(select(FeePayment).where(FeePayment.invoice_id == invoice.id)).all()
    return {
        "id": invoice.id,
        "school_id": invoice.school_id,
        "student_id": invoice.student_id,
        "invoice_no": invoice.invoice_no,
        "description": invoice.description,
        "amount_due": invoice.amount_due,
        "amount_paid": invoice.amount_paid,
        "concession": invoice.concession,
        "due_date": invoice.due_date.isoformat(),
        "status": _invoice_status(invoice),
        "cancelled": bool(invoice.cancelled),
        "payments": [
            {
                "id": payment.id,
                "order_id": payment.order_id,
                "payment_id": payment.payment_id,
                "status": payment.status,
                "amount": payment.amount,
                "idempotency_key": payment.idempotency_key,
                "gateway": payment.gateway,
            }
            for payment in payments
        ],
    }


def _visible_exam(user: User, exam: Examination) -> None:
    if exam.status != "published" and user.role in {"student", "parent"}:
        raise AppError(404, "Examination not found", "not_found")


def _get_exam(db: Session, user: User, exam_id: int) -> Examination:
    exam = db.get(Examination, exam_id)
    if exam is None:
        raise AppError(404, "Examination not found", "not_found")
    if user.role != "super_admin" and exam.school_id != user.school_id:
        raise AppError(404, "Examination not found", "not_found")
    _visible_exam(user, exam)
    return exam


def _result_for(db: Session, user: User, exam: Examination, student: Student) -> dict:
    if student.school_id != exam.school_id:
        raise AppError(404, "Student not found", "not_found")
    if exam.class_id is not None and student.class_id != exam.class_id and user.role in {"student", "parent"}:
        raise AppError(404, "Examination not found", "not_found")
    bands = _school_bands(db, exam.school_id)
    exam_subjects = db.scalars(select(ExamSubject).where(ExamSubject.exam_id == exam.id)).all()
    allowed_subjects = None
    if user.role == "teacher":
        teacher_ok = set()
        for exam_subject in exam_subjects:
            if teacher_can_teach(db, user, student.section_id, exam_subject.subject_id):
                teacher_ok.add(exam_subject.subject_id)
        allowed_subjects = teacher_ok
    rows = []
    packed = []
    missing_required = False
    for exam_subject in exam_subjects:
        if allowed_subjects is not None and exam_subject.subject_id not in allowed_subjects:
            continue
        subject = db.get(Subject, exam_subject.subject_id)
        mark = db.scalar(
            select(Mark).where(
                Mark.exam_id == exam.id,
                Mark.student_id == student.id,
                Mark.subject_id == exam_subject.subject_id,
            )
        )
        if mark is None:
            if exam_subject.required:
                missing_required = True
            rows.append(
                {
                    "subject_id": exam_subject.subject_id,
                    "subject_name": subject.name if subject else "",
                    "marks_obtained": None,
                    "max_marks": exam_subject.max_marks,
                    "is_absent": False,
                    "absent": False,
                    "not_entered": True,
                    "percentage": None,
                    "grade": None,
                    "passed": None,
                }
            )
            continue
        outcome = subject_outcome(
            mark.marks_obtained,
            mark.max_marks,
            bool(mark.is_absent) or mark.marks_obtained is None,
            bands,
        )
        packed.append({"required": bool(exam_subject.required), "outcome": outcome})
        rows.append(
            {
                "subject_id": exam_subject.subject_id,
                "subject_name": subject.name if subject else "",
                "marks_obtained": outcome["marks_obtained"],
                "max_marks": outcome["max_marks"],
                "is_absent": outcome["absent"],
                "absent": outcome["absent"],
                "not_entered": False,
                "percentage": outcome["percentage"],
                "grade": outcome["grade"],
                "passed": outcome["passed"],
            }
        )
    overall = overall_result(packed, bands) if packed else {
        "average_percentage": None,
        "overall_grade": None,
        "result": "INCOMPLETE",
    }
    if overall["result"] != "FAIL" and missing_required:
        overall["result"] = "INCOMPLETE"
    klass = db.get(SchoolClass, student.class_id)
    section = db.get(Section, student.section_id)
    school = db.get(School, student.school_id)
    return {
        "exam_id": exam.id,
        "exam_name": exam.name,
        "exam_type": exam.exam_type,
        "exam_status": exam.status,
        "status": exam.status,
        "student_id": student.id,
        "student_name": f"{student.first_name} {student.last_name}".strip(),
        "admission_no": student.admission_no,
        "class_name": klass.name if klass else "",
        "section": section.name if section else "",
        "school_name": school.name if school else "",
        "subjects": rows,
        "average_percentage": overall["average_percentage"],
        "overall_grade": overall["overall_grade"],
        "result": overall["result"],
    }


def _self_student(db: Session, user: User) -> Student:
    student = db.scalar(select(Student).where(Student.user_id == user.id))
    if student is None:
        raise AppError(404, "Student profile not found", "not_found")
    return student


def _target_student(db: Session, user: User, student_id: int | None) -> Student:
    if user.role == "student":
        return _self_student(db, user)
    if student_id is None:
        raise AppError(422, "student_id is required", "validation_error")
    return get_student_for_user(db, user, student_id)


def _apply_payment(db: Session, payment: FeePayment, payment_id: str) -> FeePayment:
    if payment.status == "paid":
        return payment
    invoice = db.get(FeeInvoice, payment.invoice_id)
    if invoice is None:
        raise AppError(404, "Invoice not found", "not_found")
    if invoice.cancelled:
        raise AppError(409, "Invoice is cancelled", "conflict")
    payment.status = "paid"
    payment.payment_id = payment_id
    payment.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)
    invoice.amount_paid = float(
        (Decimal(str(invoice.amount_paid)) + Decimal(str(payment.amount))).quantize(Decimal("0.01"))
    )
    _invoice_status(invoice)
    return payment


@router.get("/health")
def health() -> dict:
    return {"status": "ok"}


@router.get("/ready")
def ready(request: Request, db: Session = Depends(get_db)) -> dict:
    db.execute(select(1))
    mongo = "configured" if request.app.state.settings.mongo_url else "memory"
    return {"status": "ready", "database": "ok", "documents": mongo}


@router.post("/auth/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)) -> dict:
    email = body.email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        raise AppError(401, "Invalid credentials", "unauthorized")
    enqueue_outbox(
        db,
        school_id=user.school_id,
        event_type="login",
        collection="activity_events",
        payload={
            "school_id": user.school_id,
            "user_id": user.id,
            "event_type": "login",
            "occurred_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return _issue_tokens(db, user, request.app.state.settings)


@router.post("/auth/refresh")
def refresh(body: RefreshIn, request: Request, db: Session = Depends(get_db)) -> dict:
    settings = request.app.state.settings
    try:
        payload = decode_refresh(body.refresh_token, settings)
    except jwt.PyJWTError:
        raise AppError(401, "Invalid refresh token", "unauthorized") from None
    row = db.scalar(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    if row is None or row.revoked:
        raise AppError(401, "Refresh token revoked", "unauthorized")
    if row.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise AppError(401, "Refresh token expired", "unauthorized")
    user = db.get(User, row.user_id)
    if user is None or not user.is_active:
        raise AppError(401, "User inactive or missing", "unauthorized")
    row.revoked = True
    return _issue_tokens(db, user, settings)


@router.post("/auth/logout")
def logout(
    body: RefreshIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    settings = request.app.state.settings
    try:
        payload = decode_refresh(body.refresh_token, settings)
    except jwt.PyJWTError:
        raise AppError(401, "Invalid refresh token", "unauthorized") from None
    if str(user.id) != str(payload.get("sub")):
        raise AppError(403, "Cannot revoke another session", "forbidden")
    row = db.scalar(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    if row is not None:
        row.revoked = True
    return {"status": "logged_out"}


@router.get("/schools")
def list_schools(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    stmt = select(School)
    if user.role != "super_admin":
        stmt = stmt.where(School.id == user.school_id)
    rows = db.scalars(stmt.order_by(School.id)).all()
    return {
        "items": [
            {"id": row.id, "name": row.name, "code": row.code, "city": row.city, "address": row.address}
            for row in rows
        ]
    }


@router.post("/schools", status_code=201)
def create_school(
    body: SchoolIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, set())
    if user.role != "super_admin":
        raise AppError(403, "Only a super admin can create a school", "forbidden")
    if db.scalar(select(School.id).where(School.code == body.code.strip().upper())):
        raise AppError(409, "School code already exists", "conflict")
    school = School(name=body.name.strip(), code=body.code.strip().upper(), city=body.city, address=body.address)
    db.add(school)
    db.flush()
    return {"id": school.id, "name": school.name, "code": school.code, "city": school.city}


def _student_stmt(db: Session, user: User, school_id: int | None, q: str | None, grade_level: int | None, section: str | None):
    stmt = select(Student)
    if user.role == "super_admin":
        if school_id is not None:
            stmt = stmt.where(Student.school_id == school_id)
    else:
        stmt = stmt.where(Student.school_id == user.school_id)
    if user.role == "parent":
        ids = linked_student_ids(db, user) or {-1}
        stmt = stmt.where(Student.id.in_(ids))
    elif user.role == "student":
        stmt = stmt.where(Student.user_id == user.id)
    elif user.role == "teacher":
        ids = teacher_section_ids(db, user) or {-1}
        stmt = stmt.where(Student.section_id.in_(ids))
    if grade_level is not None or section:
        stmt = stmt.join(SchoolClass, Student.class_id == SchoolClass.id)
        if grade_level is not None:
            stmt = stmt.where(SchoolClass.grade_level == grade_level)
    if section:
        stmt = stmt.join(Section, Student.section_id == Section.id).where(Section.name == section.strip().upper())
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(Student.first_name).like(like),
                func.lower(Student.last_name).like(like),
                func.lower(Student.admission_no).like(like),
            )
        )
    return stmt


@router.get("/students")
def list_students(
    school_id: int | None = None,
    q: str | None = None,
    grade_level: int | None = None,
    section: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator", "teacher", "student", "parent", "accountant", "librarian", "receptionist"})
    scoped = scoped_school_id(user, school_id)
    stmt = _student_stmt(db, user, scoped, q, grade_level, section)
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = db.scalars(stmt.order_by(Student.id).offset((page - 1) * page_size).limit(page_size)).all()
    return {
        "items": [student_payload(db, row, include_directory=False) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/students/export")
def export_students(
    school_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_roles(user, {"school_admin", "principal", "coordinator", "teacher", "accountant", "receptionist"})
    scoped = scoped_school_id(user, school_id)
    stmt = _student_stmt(db, user, scoped, None, None, None)
    rows = db.scalars(stmt.order_by(Student.admission_no)).all()
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Students"
    sheet.append(["admission_no", "first_name", "last_name", "class_name", "section", "roll_no", "status", "date_of_birth"])
    for student in rows:
        payload = student_payload(db, student, include_directory=False)
        sheet.append(
            [
                payload["admission_no"],
                payload["first_name"],
                payload["last_name"],
                payload["class_name"],
                payload["section"],
                payload["roll_no"],
                payload["status"],
                payload["date_of_birth"],
            ]
        )
    buffer = io.BytesIO()
    workbook.save(buffer)
    return Response(
        content=buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="students.xlsx"'},
    )


def _insert_student(db: Session, school_id: int, data: dict) -> Student:
    admission = (data.get("admission_no") or "").strip()
    first = (data.get("first_name") or "").strip()
    if not admission:
        raise ValueError("admission_no is required")
    if not first:
        raise ValueError("first_name is required")
    try:
        grade_level = int(data.get("grade_level"))
    except (TypeError, ValueError) as exc:
        raise ValueError("grade_level is required") from exc
    section_name = (data.get("section") or "").strip()
    if not section_name:
        raise ValueError("section is required")
    year = _current_year(db, school_id)
    klass, section = _resolve_section(db, school_id, year.id, grade_level, section_name)
    dob_raw = data.get("date_of_birth") or ""
    dob = None
    if isinstance(dob_raw, date):
        dob = dob_raw
    elif str(dob_raw).strip():
        try:
            dob = date.fromisoformat(str(dob_raw).strip())
        except ValueError as exc:
            raise ValueError("date_of_birth must be YYYY-MM-DD") from exc
    roll_raw = data.get("roll_no")
    roll = int(roll_raw) if str(roll_raw).strip() else None
    student = Student(
        school_id=school_id,
        academic_year_id=year.id,
        class_id=klass.id,
        section_id=section.id,
        admission_no=admission,
        first_name=first,
        last_name=(data.get("last_name") or "").strip(),
        gender=(data.get("gender") or None),
        blood_group=(data.get("blood_group") or None),
        religion=(data.get("religion") or None),
        date_of_birth=dob,
        roll_no=roll,
        status="active",
    )
    db.add(student)
    db.flush()
    return student


@router.post("/students/import")
async def import_students(
    file: UploadFile = File(...),
    school_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator", "receptionist"})
    target = require_school_id(user, school_id)
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise AppError(422, "CSV must be UTF-8", "validation_error") from exc
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise AppError(422, "CSV header is missing", "validation_error")
    inserted = []
    errors = []
    for line_no, row in enumerate(reader, start=2):
        try:
            with db.begin_nested():
                student = _insert_student(db, target, row)
            inserted.append({"row": line_no, "id": student.id, "admission_no": student.admission_no})
        except Exception as exc:  # report the bad row; keep the good ones
            errors.append(
                {
                    "row": line_no,
                    "admission_no": (row.get("admission_no") or "").strip(),
                    "detail": str(exc),
                }
            )
    return {"inserted": len(inserted), "errors": errors, "rows": inserted}


@router.post("/students", status_code=201)
def create_student(
    body: StudentIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator", "receptionist"})
    target = require_school_id(user, body.school_id)
    try:
        student = _insert_student(db, target, body.model_dump())
    except ValueError as exc:
        raise AppError(422, str(exc), "validation_error") from exc
    return student_payload(db, student, include_directory=True)


@router.get("/students/{student_id}")
def get_student(
    student_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    student = get_student_for_user(db, user, student_id)
    return student_payload(db, student, include_directory=True)


@router.post("/attendance", status_code=201)
def mark_attendance(
    body: AttendanceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator", "teacher"})
    section = db.get(Section, body.section_id)
    if section is None or (user.role != "super_admin" and section.school_id != user.school_id):
        raise AppError(404, "Section not found", "not_found")
    if not teacher_can_teach(db, user, body.section_id, body.subject_id):
        raise AppError(403, "You cannot mark attendance for this section and subject", "forbidden")
    holiday = db.scalar(
        select(CalendarEvent.id).where(
            CalendarEvent.school_id == section.school_id,
            CalendarEvent.event_date == body.session_date,
            CalendarEvent.event_type == "holiday",
        )
    )
    if holiday is not None:
        raise AppError(422, "Holidays are not attendance sessions", "validation_error")
    for entry in body.records:
        if entry.status not in _ATTENDANCE:
            raise AppError(422, f"Unknown attendance status {entry.status}", "validation_error")
    session = db.scalar(
        select(AttendanceSession).where(
            AttendanceSession.section_id == body.section_id,
            AttendanceSession.subject_id == body.subject_id,
            AttendanceSession.session_date == body.session_date,
            AttendanceSession.period == body.period,
        )
    )
    if session is None:
        session = AttendanceSession(
            school_id=section.school_id,
            section_id=body.section_id,
            subject_id=body.subject_id,
            session_date=body.session_date,
            period=body.period,
            is_holiday=False,
            created_by=user.id,
        )
        db.add(session)
        db.flush()
    created_notifications = []
    email = LogEmailAdapter()
    sms = LogSmsAdapter()
    for entry in body.records:
        student = db.get(Student, entry.student_id)
        if student is None or student.school_id != section.school_id or student.section_id != section.id:
            raise AppError(422, f"Student {entry.student_id} is not in this section", "validation_error")
        record = db.scalar(
            select(AttendanceRecord).where(
                AttendanceRecord.session_id == session.id,
                AttendanceRecord.student_id == student.id,
            )
        )
        if record is None:
            record = AttendanceRecord(
                school_id=section.school_id,
                session_id=session.id,
                student_id=student.id,
                status=entry.status,
                marked_by=user.id,
            )
            db.add(record)
        else:
            record.status = entry.status
            record.marked_by = user.id
        if entry.status == "absent":
            dedupe = f"att-notify:{session.id}:{student.id}"
            _event, created = enqueue_outbox(
                db,
                school_id=section.school_id,
                event_type="absence_notice",
                collection="parent_communication_logs",
                dedupe_key=dedupe,
                payload={
                    "school_id": section.school_id,
                    "student_id": student.id,
                    "session_id": session.id,
                    "session_date": body.session_date.isoformat(),
                    "channel": "log",
                    "template": "absence",
                },
            )
            if created:
                enqueue_outbox(
                    db,
                    school_id=section.school_id,
                    event_type="absence_notice",
                    collection="notification_payloads",
                    dedupe_key=f"att-notify-payload:{session.id}:{student.id}",
                    payload={
                        "school_id": section.school_id,
                        "student_id": student.id,
                        "session_id": session.id,
                        "template": "absence",
                        "channel": "log",
                    },
                )
                parent_link = db.scalar(
                    select(ParentStudent).where(ParentStudent.student_id == student.id)
                )
                parent = db.get(Parent, parent_link.parent_id) if parent_link else None
                if parent and parent.email:
                    email.send(
                        to=parent.email,
                        subject="Absence recorded",
                        body=f"An absence was recorded on {body.session_date.isoformat()}.",
                    )
                if parent and parent.phone:
                    sms.send(to=parent.phone, body=f"Absence recorded on {body.session_date.isoformat()}.")
                created_notifications.append(student.id)
    return {
        "session_id": session.id,
        "updated": len(body.records),
        "parent_notifications_created": created_notifications,
    }


@router.get("/attendance/summary")
def attendance_for_student(
    student_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    student = get_student_for_user(db, user, student_id)
    rows = db.execute(
        select(AttendanceRecord.status, AttendanceSession.is_holiday)
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
        .where(AttendanceRecord.student_id == student.id)
    ).all()
    summary = attendance_summary([{"status": status, "is_holiday": bool(flag)} for status, flag in rows])
    return {
        "student_id": student.id,
        "percentage": summary.percentage,
        "attended": summary.attended,
        "eligible": summary.eligible,
        "late_count": summary.late_count,
    }


@router.get("/examinations")
def list_exams(
    school_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list:
    scoped = scoped_school_id(user, school_id)
    stmt = select(Examination)
    if scoped is not None:
        stmt = stmt.where(Examination.school_id == scoped)
    if user.role in {"student", "parent"}:
        stmt = stmt.where(Examination.status == "published")
    exams = db.scalars(stmt.order_by(Examination.exam_date, Examination.id)).all()
    payload = []
    for exam in exams:
        subjects = db.scalars(select(ExamSubject).where(ExamSubject.exam_id == exam.id)).all()
        payload.append(
            {
                "id": exam.id,
                "school_id": exam.school_id,
                "name": exam.name,
                "exam_type": exam.exam_type,
                "status": exam.status,
                "exam_date": exam.exam_date.isoformat() if exam.exam_date else None,
                "class_id": exam.class_id,
                "subjects": [
                    {
                        "subject_id": row.subject_id,
                        "name": db.get(Subject, row.subject_id).name,
                        "code": db.get(Subject, row.subject_id).code,
                        "max_marks": row.max_marks,
                        "required": bool(row.required),
                    }
                    for row in subjects
                ],
            }
        )
    return payload


@router.post("/results/marks")
def enter_marks(
    body: MarksIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    if user.role not in MARKS_WRITE_ROLES:
        raise AppError(403, "You cannot enter marks", "forbidden")
    exam = db.get(Examination, body.exam_id)
    if exam is None or (user.role != "super_admin" and exam.school_id != user.school_id):
        raise AppError(404, "Examination not found", "not_found")
    if not teacher_can_teach(db, user, body.section_id, body.subject_id):
        raise AppError(403, "You cannot enter marks for this section and subject", "forbidden")
    exam_subject = db.scalar(
        select(ExamSubject).where(
            ExamSubject.exam_id == exam.id,
            ExamSubject.subject_id == body.subject_id,
        )
    )
    if exam_subject is None:
        raise AppError(404, "Subject is not part of this examination", "not_found")
    bands = _school_bands(db, exam.school_id)
    saved = 0
    for entry in body.entries:
        student = db.get(Student, entry.student_id)
        if student is None or student.school_id != exam.school_id or student.section_id != body.section_id:
            raise AppError(422, f"Student {entry.student_id} is not in this section", "validation_error")
        absent = entry.is_absent or entry.marks_obtained is None
        if not absent:
            try:
                subject_outcome(entry.marks_obtained, exam_subject.max_marks, False, bands)
            except ValueError as exc:
                raise AppError(422, str(exc), "validation_error") from exc
        mark = db.scalar(
            select(Mark).where(
                Mark.exam_id == exam.id,
                Mark.student_id == student.id,
                Mark.subject_id == body.subject_id,
            )
        )
        if mark is None:
            mark = Mark(
                school_id=exam.school_id,
                exam_id=exam.id,
                student_id=student.id,
                subject_id=body.subject_id,
                max_marks=exam_subject.max_marks,
                entered_by=user.id,
            )
            db.add(mark)
        mark.max_marks = exam_subject.max_marks
        mark.is_absent = absent
        mark.marks_obtained = None if absent else entry.marks_obtained
        mark.entered_by = user.id
        saved += 1
    return {"saved": saved, "exam_id": exam.id, "subject_id": body.subject_id}


@router.post("/results/publish")
def publish_exam(
    body: PublishIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator"})
    exam = db.get(Examination, body.exam_id)
    if exam is None or (user.role != "super_admin" and exam.school_id != user.school_id):
        raise AppError(404, "Examination not found", "not_found")
    exam.status = "published"
    exam.published_at = datetime.now(timezone.utc).replace(tzinfo=None)
    return {"id": exam.id, "status": exam.status}


@router.get("/results")
def get_results(
    exam_id: int,
    student_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    exam = _get_exam(db, user, exam_id)
    student = _target_student(db, user, student_id)
    if user.role == "teacher" and student.section_id not in teacher_section_ids(db, user):
        raise AppError(403, "You cannot open this student", "forbidden")
    return _result_for(db, user, exam, student)


@router.get("/results/report-card")
def report_card(
    exam_id: int,
    student_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    exam = _get_exam(db, user, exam_id)
    student = _target_student(db, user, student_id)
    data = _result_for(db, user, exam, student)
    pdf = report_card_pdf(data)
    return Response(content=pdf, media_type="application/pdf")


@router.get("/fees/invoices")
def list_invoices(
    student_id: int | None = None,
    school_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator", "accountant", "parent", "student"})
    scoped = scoped_school_id(user, school_id)
    stmt = select(FeeInvoice)
    if scoped is not None:
        stmt = stmt.where(FeeInvoice.school_id == scoped)
    if user.role == "parent":
        ids = linked_student_ids(db, user) or {-1}
        stmt = stmt.where(FeeInvoice.student_id.in_(ids))
    elif user.role == "student":
        student = _self_student(db, user)
        stmt = stmt.where(FeeInvoice.student_id == student.id)
    if student_id is not None:
        get_student_for_user(db, user, student_id)
        stmt = stmt.where(FeeInvoice.student_id == student_id)
    rows = db.scalars(stmt.order_by(FeeInvoice.id)).all()
    return {"items": [_invoice_body(db, row) for row in rows]}


@router.post("/fees/invoices", status_code=201)
def create_invoice(
    body: InvoiceIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, FEE_WRITE_ROLES)
    student = get_student_for_user(db, user, body.student_id)
    if body.amount_due < 0 or body.concession < 0:
        raise AppError(422, "Amounts cannot be negative", "validation_error")
    year = _current_year(db, student.school_id)
    number = body.invoice_no or f"INV-{student.school_id}-{int(datetime.now().timestamp())}"
    invoice = FeeInvoice(
        school_id=student.school_id,
        student_id=student.id,
        academic_year_id=year.id,
        invoice_no=number,
        description=body.description,
        amount_due=body.amount_due,
        amount_paid=0,
        concession=body.concession,
        due_date=body.due_date,
        cancelled=False,
        status="pending",
    )
    _invoice_status(invoice)
    db.add(invoice)
    db.flush()
    return _invoice_body(db, invoice)


@router.get("/fees/invoices/{invoice_id}")
def get_invoice(
    invoice_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    invoice = db.get(FeeInvoice, invoice_id)
    if invoice is None:
        raise AppError(404, "Invoice not found", "not_found")
    get_student_for_user(db, user, invoice.student_id)
    return _invoice_body(db, invoice)


@router.post("/fees/invoices/{invoice_id}/pay", status_code=201)
def pay_invoice(
    invoice_id: int,
    body: PayIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "accountant", "parent"})
    invoice = db.get(FeeInvoice, invoice_id)
    if invoice is None:
        raise AppError(404, "Invoice not found", "not_found")
    get_student_for_user(db, user, invoice.student_id)
    if user.role == "parent" and invoice.student_id not in linked_student_ids(db, user):
        raise AppError(403, "You cannot pay this invoice", "forbidden")
    if invoice.cancelled:
        raise AppError(409, "Invoice is cancelled", "conflict")
    existing = db.scalar(
        select(FeePayment).where(
            FeePayment.school_id == invoice.school_id,
            FeePayment.idempotency_key == body.idempotency_key,
        )
    )
    if existing is not None:
        return {
            "id": existing.id,
            "order_id": existing.order_id,
            "status": existing.status,
            "amount": existing.amount,
            "idempotency_key": existing.idempotency_key,
            "invoice_id": existing.invoice_id,
        }
    if body.amount <= 0:
        raise AppError(422, "Amount must be positive", "validation_error")
    remaining = (
        Decimal(str(invoice.amount_due))
        - Decimal(str(invoice.amount_paid))
        - Decimal(str(invoice.concession))
    )
    if Decimal(str(body.amount)) > remaining + Decimal("0.001"):
        raise AppError(422, "Amount exceeds the remaining balance", "validation_error")
    gateway = MockGateway(request.app.state.settings.mock_gateway_secret)
    order_id = gateway.initiate(idempotency_key=body.idempotency_key)
    payment = FeePayment(
        school_id=invoice.school_id,
        invoice_id=invoice.id,
        amount=body.amount,
        gateway="mock",
        order_id=order_id,
        payment_id=None,
        status="initiated",
        idempotency_key=body.idempotency_key,
    )
    db.add(payment)
    db.flush()
    return {
        "id": payment.id,
        "order_id": payment.order_id,
        "status": payment.status,
        "amount": payment.amount,
        "idempotency_key": payment.idempotency_key,
        "invoice_id": invoice.id,
    }


@router.post("/fees/payments/verify")
def verify_payment(
    body: VerifyIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "accountant", "parent"})
    payment = db.scalar(
        select(FeePayment).where(
            FeePayment.order_id == body.order_id,
            FeePayment.idempotency_key == body.idempotency_key,
        )
    )
    if payment is None:
        raise AppError(404, "Payment not found", "not_found")
    if user.role != "super_admin" and payment.school_id != user.school_id:
        raise AppError(404, "Payment not found", "not_found")
    invoice = db.get(FeeInvoice, payment.invoice_id)
    if invoice is not None:
        get_student_for_user(db, user, invoice.student_id)
    if payment.status != "paid":
        gateway = MockGateway(request.app.state.settings.mock_gateway_secret)
        if not gateway.verify(body.order_id, body.payment_id, body.signature):
            raise AppError(400, "Payment signature is invalid", "bad_signature")
        _apply_payment(db, payment, body.payment_id)
    return {
        "id": payment.id,
        "order_id": payment.order_id,
        "payment_id": payment.payment_id,
        "status": payment.status,
        "amount": payment.amount,
        "invoice_id": payment.invoice_id,
    }


@router.post("/fees/webhooks/mock")
async def mock_webhook(request: Request, db: Session = Depends(get_db)) -> dict:
    raw = await request.body()
    signature = request.headers.get("x-signature", "")
    gateway = MockGateway(request.app.state.settings.mock_gateway_secret)
    if not gateway.verify_webhook(raw, signature):
        raise AppError(400, "Invalid webhook signature", "bad_signature")
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise AppError(422, "Webhook body must be JSON", "validation_error") from exc
    order_id = data.get("order_id")
    payment_ref = data.get("payment_id")
    payment = db.scalar(select(FeePayment).where(FeePayment.order_id == order_id))
    if payment is None:
        raise AppError(404, "Payment not found", "not_found")
    enqueue_outbox(
        db,
        school_id=payment.school_id,
        event_type="payment_webhook",
        collection="integration_webhook_events",
        dedupe_key=f"webhook:{order_id}:{payment_ref}",
        payload={
            "school_id": payment.school_id,
            "provider": "mock",
            "order_id": order_id,
            "idempotency_key": payment.idempotency_key,
            "status": data.get("status"),
        },
    )
    if data.get("status") in {"paid", "captured"} and payment_ref:
        _apply_payment(db, payment, str(payment_ref))
    return {"status": payment.status, "order_id": payment.order_id}


@router.post("/fees/gateways/razorpay/order")
def razorpay_order(
    body: RazorpayIn,
    request: Request,
    user: User = Depends(get_current_user),
) -> dict:
    require_roles(user, FEE_WRITE_ROLES)
    settings = request.app.state.settings
    adapter = RazorpayAdapter(settings.razorpay_key_id, settings.razorpay_key_secret)
    return adapter.initiate(amount_paise=body.amount_paise, receipt=body.receipt)


@router.post("/fees/invoices/{invoice_id}/cancel")
def cancel_invoice(
    invoice_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, FEE_WRITE_ROLES)
    invoice = db.get(FeeInvoice, invoice_id)
    if invoice is None or (user.role != "super_admin" and invoice.school_id != user.school_id):
        raise AppError(404, "Invoice not found", "not_found")
    invoice.cancelled = True
    invoice.status = "cancelled"
    return _invoice_body(db, invoice)


@router.get("/fees/invoices/{invoice_id}/receipt")
def fee_receipt(
    invoice_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invoice = db.get(FeeInvoice, invoice_id)
    if invoice is None:
        raise AppError(404, "Invoice not found", "not_found")
    student = get_student_for_user(db, user, invoice.student_id)
    status = _invoice_status(invoice)
    payment = db.scalar(
        select(FeePayment).where(FeePayment.invoice_id == invoice.id, FeePayment.status == "paid")
    )
    if payment is None or status != "paid":
        raise AppError(409, "Receipt is available only after payment is verified", "conflict")
    school = db.get(School, invoice.school_id)
    pdf = fee_receipt_pdf(
        {
            "invoice_no": invoice.invoice_no,
            "school_name": school.name if school else "",
            "student_name": f"{student.first_name} {student.last_name}".strip(),
            "admission_no": student.admission_no,
            "description": invoice.description,
            "amount_due": invoice.amount_due,
            "concession": invoice.concession,
            "amount_paid": invoice.amount_paid,
            "payment_id": payment.payment_id,
            "order_id": payment.order_id,
            "gateway": payment.gateway,
            "status": status,
            "paid_at": payment.paid_at.isoformat() if payment.paid_at else "",
        }
    )
    return Response(content=pdf, media_type="application/pdf")


@router.get("/assignments")
def list_assignments(
    section_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(Assignment)
    if user.role != "super_admin":
        stmt = stmt.where(Assignment.school_id == user.school_id)
    if user.role == "teacher":
        sections = teacher_section_ids(db, user) or {-1}
        stmt = stmt.where(Assignment.section_id.in_(sections))
    elif user.role == "student":
        student = _self_student(db, user)
        stmt = stmt.where(Assignment.section_id == student.section_id)
    elif user.role == "parent":
        ids = linked_student_ids(db, user) or {-1}
        section_ids = db.scalars(select(Student.section_id).where(Student.id.in_(ids))).all()
        stmt = stmt.where(Assignment.section_id.in_(set(section_ids) or {-1}))
    if section_id is not None:
        stmt = stmt.where(Assignment.section_id == section_id)
    rows = db.scalars(stmt.order_by(Assignment.due_date)).all()
    return {
        "items": [
            {
                "id": row.id,
                "school_id": row.school_id,
                "section_id": row.section_id,
                "subject_id": row.subject_id,
                "title": row.title,
                "description": row.description,
                "due_date": row.due_date.isoformat(),
                "max_marks": row.max_marks,
            }
            for row in rows
        ]
    }


@router.post("/assignments", status_code=201)
def create_assignment(
    body: AssignmentIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator", "teacher"})
    section = db.get(Section, body.section_id)
    if section is None or (user.role != "super_admin" and section.school_id != user.school_id):
        raise AppError(404, "Section not found", "not_found")
    if not teacher_can_teach(db, user, body.section_id, body.subject_id):
        raise AppError(403, "You cannot create this assignment", "forbidden")
    teacher = db.scalar(select(Teacher).where(Teacher.user_id == user.id)) if user.role == "teacher" else None
    row = Assignment(
        school_id=section.school_id,
        section_id=body.section_id,
        subject_id=body.subject_id,
        teacher_id=None if teacher is None else teacher.id,
        title=body.title,
        description=body.description,
        due_date=body.due_date,
        max_marks=body.max_marks,
    )
    db.add(row)
    db.flush()
    return {"id": row.id, "title": row.title, "due_date": row.due_date.isoformat()}


@router.post("/assignments/{assignment_id}/submissions", status_code=201)
def submit_assignment(
    assignment_id: int,
    body: SubmissionIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    assignment = db.get(Assignment, assignment_id)
    if assignment is None or (user.role != "super_admin" and assignment.school_id != user.school_id):
        raise AppError(404, "Assignment not found", "not_found")
    student = _target_student(db, user, body.student_id)
    if user.role not in {"student", "teacher", "school_admin", "principal", "coordinator", "super_admin"}:
        raise AppError(403, "You cannot submit this assignment", "forbidden")
    if student.section_id != assignment.section_id:
        raise AppError(422, "Student is not in this section", "validation_error")
    existing = db.scalar(
        select(AssignmentSubmission).where(
            AssignmentSubmission.assignment_id == assignment.id,
            AssignmentSubmission.student_id == student.id,
        )
    )
    if existing is not None:
        return {"id": existing.id, "status": existing.status, "student_id": student.id}
    row = AssignmentSubmission(
        school_id=assignment.school_id,
        assignment_id=assignment.id,
        student_id=student.id,
        status="submitted",
    )
    db.add(row)
    db.flush()
    return {"id": row.id, "status": row.status, "student_id": student.id}


@router.get("/library/books")
def list_books(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    stmt = select(Book)
    if user.role != "super_admin":
        stmt = stmt.where(Book.school_id == user.school_id)
    rows = db.scalars(stmt.order_by(Book.id)).all()
    return {
        "items": [
            {"id": row.id, "title": row.title, "author": row.author, "isbn": row.isbn, "school_id": row.school_id}
            for row in rows
        ]
    }


@router.get("/library/copies")
def list_copies(
    status: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(BookCopy)
    if user.role != "super_admin":
        stmt = stmt.where(BookCopy.school_id == user.school_id)
    if status:
        stmt = stmt.where(BookCopy.status == status)
    rows = db.scalars(stmt.order_by(BookCopy.id)).all()
    return {
        "items": [
            {
                "id": row.id,
                "book_id": row.book_id,
                "accession_no": row.accession_no,
                "status": row.status,
                "school_id": row.school_id,
            }
            for row in rows
        ]
    }


@router.post("/library/issues", status_code=201)
def issue_copy(
    body: IssueIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"librarian", "school_admin", "principal"})
    copy = db.get(BookCopy, body.copy_id)
    if copy is None or (user.role != "super_admin" and copy.school_id != user.school_id):
        raise AppError(404, "Copy not found", "not_found")
    student = get_student_for_user(db, user, body.student_id)
    if student.school_id != copy.school_id:
        raise AppError(404, "Student not found", "not_found")
    open_issue = db.scalar(
        select(LibraryIssue).where(
            LibraryIssue.copy_id == copy.id,
            LibraryIssue.returned_at.is_(None),
        )
    )
    if copy.status == "issued" or open_issue is not None:
        raise AppError(409, "Copy is already issued", "conflict")
    copy.status = "issued"
    row = LibraryIssue(
        school_id=copy.school_id,
        copy_id=copy.id,
        student_id=student.id,
        due_date=body.due_date or (date.today() + timedelta(days=14)),
    )
    db.add(row)
    db.flush()
    return {"id": row.id, "copy_id": copy.id, "student_id": student.id, "status": "issued"}


@router.post("/library/issues/{issue_id}/return")
def return_copy(
    issue_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"librarian", "school_admin", "principal"})
    row = db.get(LibraryIssue, issue_id)
    if row is None or (user.role != "super_admin" and row.school_id != user.school_id):
        raise AppError(404, "Issue not found", "not_found")
    if row.returned_at is not None:
        return {"id": row.id, "status": "returned"}
    row.returned_at = datetime.now(timezone.utc).replace(tzinfo=None)
    copy = db.get(BookCopy, row.copy_id)
    if copy is not None:
        copy.status = "available"
    return {"id": row.id, "status": "returned"}


@router.get("/analytics/overview")
def analytics_overview(
    school_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator", "teacher", "accountant"})
    scoped = require_school_id(user, school_id) if user.role != "super_admin" or school_id else scoped_school_id(user, school_id)
    if scoped is None and user.role != "super_admin":
        scoped = user.school_id
    student_stmt = select(func.count()).select_from(Student)
    teacher_stmt = select(func.count()).select_from(Teacher)
    if scoped is not None:
        student_stmt = student_stmt.where(Student.school_id == scoped)
        teacher_stmt = teacher_stmt.where(Teacher.school_id == scoped)
    record_stmt = (
        select(AttendanceRecord.status, AttendanceSession.is_holiday)
        .join(AttendanceSession, AttendanceRecord.session_id == AttendanceSession.id)
    )
    invoice_stmt = select(FeeInvoice)
    exam_stmt = select(func.count()).select_from(Examination).where(Examination.status == "published")
    if scoped is not None:
        record_stmt = record_stmt.where(AttendanceRecord.school_id == scoped)
        invoice_stmt = invoice_stmt.where(FeeInvoice.school_id == scoped)
        exam_stmt = exam_stmt.where(Examination.school_id == scoped)
    summary = attendance_summary(
        [{"status": status, "is_holiday": bool(flag)} for status, flag in db.execute(record_stmt).all()]
    )
    collected = 0.0
    outstanding = 0.0
    for invoice in db.scalars(invoice_stmt).all():
        status = _invoice_status(invoice)
        collected += float(invoice.amount_paid)
        if status in {"pending", "partial", "overdue"}:
            outstanding += max(
                float(Decimal(str(invoice.amount_due)) - Decimal(str(invoice.amount_paid)) - Decimal(str(invoice.concession))),
                0.0,
            )
    return {
        "school_id": scoped,
        "student_count": db.scalar(student_stmt) or 0,
        "teacher_count": db.scalar(teacher_stmt) or 0,
        "attendance_percentage": summary.percentage,
        "late_count": summary.late_count,
        "fee_collected": round(collected, 2),
        "fee_outstanding": round(outstanding, 2),
        "published_exams": db.scalar(exam_stmt) or 0,
    }


@router.post("/ai/chat")
def ai_chat(
    body: ChatIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator", "teacher", "student", "parent"})
    student = _target_student(db, user, body.student_id)
    klass = db.get(SchoolClass, student.class_id)
    grade = klass.grade_level if klass else 8
    reply = _provider.study_help(
        topic=body.message,
        grade_level=grade,
        learner_first_name=student.first_name,
    )
    enqueue_outbox(
        db,
        school_id=student.school_id,
        event_type="ai_chat",
        collection="ai_interaction_logs",
        payload={
            "school_id": student.school_id,
            "student_id": student.id,
            "grade_level": grade,
            "topic": body.message[:200],
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    return {"student_id": student.id, "reply": reply}


@router.get("/ai/risk/{student_id}")
def ai_risk(
    student_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator", "teacher", "parent"})
    student = get_student_for_user(db, user, student_id)
    inputs = load_risk_inputs(db, student.id)
    result = assess_risk_rules(
        attendance_pct=inputs["attendance_pct"],
        failed_subjects=inputs["failed_subjects"],
        mark_decline=inputs["mark_decline"],
        missing_assignments=inputs["missing_assignments"],
    )
    return {"student_id": student.id, **result}


@router.get("/calendar")
def list_calendar(
    school_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    scoped = scoped_school_id(user, school_id)
    stmt = select(CalendarEvent)
    if scoped is not None:
        stmt = stmt.where(CalendarEvent.school_id == scoped)
    elif user.role != "super_admin":
        stmt = stmt.where(CalendarEvent.school_id == user.school_id)
    rows = db.scalars(stmt.order_by(CalendarEvent.event_date)).all()
    return {
        "items": [
            {
                "id": row.id,
                "school_id": row.school_id,
                "title": row.title,
                "event_date": row.event_date.isoformat(),
                "event_type": row.event_type,
                "description": row.description,
            }
            for row in rows
        ]
    }


@router.post("/calendar", status_code=201)
def create_event(
    body: EventIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator"})
    school_id = require_school_id(user, body.school_id)
    if body.event_type not in {"holiday", "exam", "event"}:
        raise AppError(422, "event_type must be holiday, exam, or event", "validation_error")
    row = CalendarEvent(
        school_id=school_id,
        title=body.title,
        event_date=body.event_date,
        event_type=body.event_type,
        description=body.description,
    )
    db.add(row)
    db.flush()
    return {"id": row.id, "title": row.title, "event_type": row.event_type}


@router.get("/calendar/timetable")
def list_timetable(
    section_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    stmt = select(TimetableSlotRow)
    if user.role != "super_admin":
        stmt = stmt.where(TimetableSlotRow.school_id == user.school_id)
    if section_id is not None:
        stmt = stmt.where(TimetableSlotRow.section_id == section_id)
    rows = db.scalars(stmt.order_by(TimetableSlotRow.weekday, TimetableSlotRow.period)).all()
    return {
        "items": [
            {
                "id": row.id,
                "section_id": row.section_id,
                "subject_id": row.subject_id,
                "teacher_id": row.teacher_id,
                "weekday": row.weekday,
                "period": row.period,
                "room": row.room,
            }
            for row in rows
        ]
    }


@router.post("/calendar/timetable", status_code=201)
def create_slot(
    body: SlotIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator"})
    section = db.get(Section, body.section_id)
    if section is None or (user.role != "super_admin" and section.school_id != user.school_id):
        raise AppError(404, "Section not found", "not_found")
    existing_rows = db.scalars(
        select(TimetableSlotRow).where(TimetableSlotRow.school_id == section.school_id)
    ).all()
    new_slot = TimetableSlot(
        teacher_id=body.teacher_id,
        section_id=body.section_id,
        subject_id=body.subject_id,
        weekday=body.weekday,
        period=body.period,
        room=body.room,
    )
    relevant = []
    for row in existing_rows:
        relevant.extend(
            timetable_conflict_types(
                [
                    TimetableSlot(
                        row.teacher_id,
                        row.section_id,
                        row.subject_id,
                        row.weekday,
                        row.period,
                        row.room,
                        row.id,
                    ),
                    new_slot,
                ]
            )
        )
    if relevant:
        types = sorted({item["type"] for item in relevant})
        raise AppError(409, "Timetable conflict: " + ", ".join(types), "conflict")
    row = TimetableSlotRow(
        school_id=section.school_id,
        section_id=body.section_id,
        subject_id=body.subject_id,
        teacher_id=body.teacher_id,
        weekday=body.weekday,
        period=body.period,
        room=body.room.strip(),
    )
    db.add(row)
    db.flush()
    return {"id": row.id, "room": row.room, "weekday": row.weekday, "period": row.period}


@router.get("/announcements")
def list_announcements(
    school_id: int | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    scoped = scoped_school_id(user, school_id)
    stmt = select(Announcement)
    if scoped is not None:
        stmt = stmt.where(Announcement.school_id == scoped)
    elif user.role != "super_admin":
        stmt = stmt.where(Announcement.school_id == user.school_id)
    rows = db.scalars(stmt.order_by(Announcement.id.desc())).all()
    return {
        "items": [
            {
                "id": row.id,
                "school_id": row.school_id,
                "title": row.title,
                "body": row.body,
                "audience": row.audience,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ]
    }


@router.post("/announcements", status_code=201)
def create_announcement(
    body: AnnouncementIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    require_roles(user, {"school_admin", "principal", "coordinator"})
    school_id = require_school_id(user, body.school_id)
    row = Announcement(
        school_id=school_id,
        title=body.title,
        body=body.body,
        audience=body.audience,
        created_by=user.id,
    )
    db.add(row)
    db.flush()
    return {"id": row.id, "title": row.title}
