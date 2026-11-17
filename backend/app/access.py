"""School, parent, and teacher scope. Every read goes through these checks."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import AppError
from app.models import Parent, ParentStudent, SchoolClass, Section, Student, Teacher, TeacherAssignment

LEADERSHIP = {"super_admin", "school_admin", "principal", "coordinator"}
MARKS_WRITE_ROLES = LEADERSHIP | {"teacher"}
FEE_WRITE_ROLES = {"super_admin", "school_admin", "principal", "accountant"}
STUDENT_DIRECTORY_ROLES = LEADERSHIP | {"teacher", "accountant", "librarian", "receptionist", "student", "parent"}


def scoped_school_id(user, requested: int | None) -> int | None:
    """None means all schools and is allowed only for super_admin."""
    if user.role == "super_admin":
        return requested
    if requested is not None and requested != user.school_id:
        raise AppError(403, "Cross-school access is not allowed", "forbidden")
    return user.school_id


def require_school_id(user, requested: int | None) -> int:
    school_id = scoped_school_id(user, requested)
    if school_id is None:
        raise AppError(422, "school_id is required for this action", "validation_error")
    return school_id


def require_roles(user, roles: set[str]) -> None:
    if user.role == "super_admin" or user.role in roles:
        return
    raise AppError(403, "Insufficient permissions", "forbidden")


def parent_profile(db: Session, user):
    return db.scalar(select(Parent).where(Parent.user_id == user.id))


def linked_student_ids(db: Session, user) -> set[int]:
    parent = parent_profile(db, user)
    if parent is None:
        return set()
    rows = db.scalars(select(ParentStudent.student_id).where(ParentStudent.parent_id == parent.id)).all()
    return set(rows)


def teacher_profile(db: Session, user):
    return db.scalar(select(Teacher).where(Teacher.user_id == user.id))


def teacher_section_ids(db: Session, user) -> set[int]:
    teacher = teacher_profile(db, user)
    if teacher is None:
        return set()
    rows = db.scalars(
        select(TeacherAssignment.section_id).where(TeacherAssignment.teacher_id == teacher.id)
    ).all()
    return set(rows)


def teacher_can_teach(db: Session, user, section_id: int, subject_id: int) -> bool:
    if user.role in LEADERSHIP:
        return True
    if user.role != "teacher":
        return False
    teacher = teacher_profile(db, user)
    if teacher is None:
        return False
    row = db.scalar(
        select(TeacherAssignment.id).where(
            TeacherAssignment.teacher_id == teacher.id,
            TeacherAssignment.section_id == section_id,
            TeacherAssignment.subject_id == subject_id,
        )
    )
    return row is not None


def get_student_for_user(db: Session, user, student_id: int) -> Student:
    student = db.get(Student, student_id)
    if student is None:
        raise AppError(404, "Student not found", "not_found")
    if user.role != "super_admin" and student.school_id != user.school_id:
        raise AppError(404, "Student not found", "not_found")
    if user.role == "parent":
        if student.id not in linked_student_ids(db, user):
            raise AppError(403, "You cannot open this student", "forbidden")
    elif user.role == "student":
        if student.user_id != user.id:
            raise AppError(403, "You cannot open this student", "forbidden")
    elif user.role == "teacher":
        if student.section_id not in teacher_section_ids(db, user):
            raise AppError(403, "You cannot open this student", "forbidden")
    return student


def student_payload(db: Session, student: Student, *, include_directory: bool) -> dict:
    klass = db.get(SchoolClass, student.class_id)
    section = db.get(Section, student.section_id)
    body = {
        "id": student.id,
        "school_id": student.school_id,
        "admission_no": student.admission_no,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "class_name": klass.name if klass else None,
        "grade_level": klass.grade_level if klass else None,
        "section": section.name if section else None,
        "section_id": student.section_id,
        "class_id": student.class_id,
        "roll_no": student.roll_no,
        "status": student.status,
        "date_of_birth": student.date_of_birth.isoformat() if student.date_of_birth else None,
    }
    if include_directory:
        body["gender"] = student.gender
        body["blood_group"] = student.blood_group
        body["religion"] = student.religion
    return body
