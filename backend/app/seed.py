"""Demo tenant data. Runs only when the schools table is empty."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain import DEFAULT_GRADE_BANDS, fee_status
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
    Mark,
    Parent,
    ParentStudent,
    School,
    SchoolClass,
    Section,
    Student,
    Subject,
    Teacher,
    TeacherAssignment,
    TimetableSlotRow,
    User,
)
from app.security import hash_password

TEACHER_NAMES = [
    "Rohan Desai",
    "Asha Patel",
    "Vikram Shah",
    "Neelam Mehta",
    "Harsh Joshi",
    "Juhi Trivedi",
    "Omkar Nair",
    "Pallavi Iyer",
    "Siddharth Bhatt",
    "Tara Kapoor",
    "Yash Rao",
    "Bhavna Das",
    "Chirag Desai",
    "Deepa Patel",
    "Farhan Shah",
    "Gita Mehta",
    "Hemant Joshi",
    "Ila Trivedi",
    "Jatin Nair",
    "Kiran Iyer",
    "Lalit Bhatt",
    "Mona Kapoor",
    "Nikhil Rao",
    "Ojas Das",
    "Priti Desai",
    "Kunal Patel",
    "Rekha Shah",
    "Suresh Mehta",
    "Tina Joshi",
    "Uday Trivedi",
    "Varun Nair",
    "Leela Iyer",
    "Keshav Bhatt",
    "Yamini Kapoor",
    "Zubin Rao",
    "Amit Das",
]

STUDENT_FIRST = [
    "Aarav",
    "Vivaan",
    "Aditya",
    "Anaya",
    "Myra",
    "Sara",
    "Reyansh",
    "Aanya",
    "Arjun",
    "Kiara",
    "Navya",
    "Dev",
    "Meera",
    "Rahul",
    "Saanvi",
    "Anika",
    "Ishita",
    "Kabir",
    "Diya",
    "Ishan",
]
STUDENT_LAST = ["Shah", "Patel", "Mehta", "Desai", "Joshi", "Trivedi", "Nair", "Iyer", "Bhatt", "Rao"]

SUBJECTS = [
    ("MATH", "Mathematics"),
    ("SCI", "Science"),
    ("ENG", "English"),
    ("HIN", "Hindi"),
    ("SST", "Social Science"),
    ("CS", "Computer"),
]


def seed_if_empty(db: Session) -> None:
    existing = db.scalar(select(func.count()).select_from(School)) or 0
    if existing:
        return
    passwords = {
        raw: hash_password(raw)
        for raw in (
            "Super#2026",
            "Admin#2026",
            "Principal#2026",
            "Coord#2026",
            "Teacher#2026",
            "Student#2026",
            "Parent#2026",
            "Accounts#2026",
            "Library#2026",
            "Front#2026",
            "Horizon#2026",
        )
    }
    ais = _school(db, "Aarav International School", "AIS", "Ahmedabad", "Satellite, Ahmedabad")
    hps = _school(db, "Horizon Public School", "HPS", "Vadodara", "Alkapuri, Vadodara")
    ais_year = _year(db, ais.id)
    hps_year = _year(db, hps.id)
    _bands(db, ais.id)
    _bands(db, hps.id)
    classes, sections = _classes(db, ais.id, ais_year.id)
    subjects = _subjects(db, ais.id)

    def add_user(email: str, password: str, full_name: str, role: str, school_id: int | None) -> User:
        user = User(
            school_id=school_id,
            email=email,
            password_hash=passwords[password],
            full_name=full_name,
            role=role,
            is_active=True,
        )
        db.add(user)
        db.flush()
        return user

    add_user("super@edunexus.school", "Super#2026", "Platform Super", "super_admin", None)
    add_user("admin@edunexus.school", "Admin#2026", "Meera Iyer", "school_admin", ais.id)
    add_user("principal@edunexus.school", "Principal#2026", "Anil Trivedi", "principal", ais.id)
    add_user("coord@edunexus.school", "Coord#2026", "Kavya Nair", "coordinator", ais.id)
    add_user("accounts@edunexus.school", "Accounts#2026", "Hitesh Patel", "accountant", ais.id)
    add_user("library@edunexus.school", "Library#2026", "Pooja Joshi", "librarian", ais.id)
    add_user("front@edunexus.school", "Front#2026", "Rakesh Bhatt", "receptionist", ais.id)
    teacher_user = add_user(
        "teacher@edunexus.school", "Teacher#2026", "Rohan Desai", "teacher", ais.id
    )
    student_user = add_user(
        "student@edunexus.school", "Student#2026", "Diya Shah", "student", ais.id
    )
    weak_user = add_user("weak@edunexus.school", "Student#2026", "Ishan Mehta", "student", ais.id)
    parent_user = add_user("parent@edunexus.school", "Parent#2026", "Neha Shah", "parent", ais.id)

    teachers: list[Teacher] = []
    for index, name in enumerate(TEACHER_NAMES):
        if index == 0:
            user = teacher_user
        else:
            user = add_user(
                f"teacher{index + 1}@edunexus.school",
                "Teacher#2026",
                name,
                "teacher",
                ais.id,
            )
        teacher = Teacher(
            school_id=ais.id,
            user_id=user.id,
            employee_code=f"T-AIS-{index + 1:03d}",
            full_name=name,
        )
        db.add(teacher)
        db.flush()
        teachers.append(teacher)

    ordered_sections: list[tuple[int, str, Section]] = []
    for grade in range(1, 13):
        for sec_name in ("A", "B"):
            ordered_sections.append((grade, sec_name, sections[(grade, sec_name)]))
    section_8a = sections[(8, "A")]
    other_sections = [item for item in ordered_sections if item[2].id != section_8a.id]
    _assign(db, ais.id, teachers[0].id, section_8a.id, subjects["MATH"].id, ais_year.id)
    for teacher, (_grade, _name, section) in zip(teachers[1:24], other_sections, strict=True):
        _assign(db, ais.id, teacher.id, section.id, subjects["MATH"].id, ais_year.id)
    for teacher, (_grade, _name, section) in zip(teachers[24:], ordered_sections[:12], strict=True):
        _assign(db, ais.id, teacher.id, section.id, subjects["SCI"].id, ais_year.id)

    specials = {
        (8, "A", 0): {
            "first": "Diya",
            "last": "Shah",
            "admission": "AIS-8A-001",
            "user": student_user,
            "gender": "female",
            "blood_group": "O+",
            "religion": "HinduDemoToken",
        },
        (8, "A", 1): {
            "first": "Ishan",
            "last": "Mehta",
            "admission": "AIS-8A-099",
            "user": weak_user,
            "gender": "male",
            "blood_group": "B+",
            "religion": "ZoroastrianDemoToken",
        },
        (3, "A", 0): {
            "first": "Kabir",
            "last": "Shah",
            "admission": "AIS-3A-001",
            "user": None,
            "gender": "male",
            "blood_group": "A+",
            "religion": "HinduDemoToken",
        },
    }
    students: dict[tuple[int, str, int], Student] = {}
    serial = 0
    for grade in range(1, 13):
        for sec_name in ("A", "B"):
            section = sections[(grade, sec_name)]
            klass = classes[grade]
            for index in range(5):
                serial += 1
                spec = specials.get((grade, sec_name, index))
                if spec:
                    first, last = spec["first"], spec["last"]
                    admission = spec["admission"]
                    user = spec["user"]
                    gender = spec["gender"]
                    blood = spec["blood_group"]
                    religion = spec["religion"]
                else:
                    first = STUDENT_FIRST[serial % len(STUDENT_FIRST)]
                    last = STUDENT_LAST[serial % len(STUDENT_LAST)]
                    admission = f"AIS-{serial:04d}"
                    user = None
                    gender = "female" if serial % 2 == 0 else "male"
                    blood = None
                    religion = None
                student = Student(
                    school_id=ais.id,
                    user_id=None if user is None else user.id,
                    academic_year_id=ais_year.id,
                    class_id=klass.id,
                    section_id=section.id,
                    admission_no=admission,
                    first_name=first,
                    last_name=last,
                    gender=gender,
                    blood_group=blood,
                    religion=religion,
                    date_of_birth=date(2026 - 6 - grade, 4, 10 + index),
                    roll_no=index + 1,
                    status="active",
                )
                db.add(student)
                db.flush()
                students[(grade, sec_name, index)] = student

    parent = Parent(
        school_id=ais.id,
        user_id=parent_user.id,
        full_name="Neha Shah",
        phone="9800000000",
        email="parent@edunexus.school",
    )
    db.add(parent)
    db.flush()
    for admission_student in (students[(8, "A", 0)], students[(3, "A", 0)]):
        db.add(
            ParentStudent(
                school_id=ais.id,
                parent_id=parent.id,
                student_id=admission_student.id,
                relationship_name="mother",
            )
        )
    generated = 0
    for grade in range(1, 13):
        for sec_name in ("A", "B"):
            if (grade, sec_name, 2) in specials:
                continue
            generated += 1
            child = students[(grade, sec_name, 2)]
            extra_user = add_user(
                f"parent{generated}@edunexus.school",
                "Parent#2026",
                f"Parent of {child.first_name}",
                "parent",
                ais.id,
            )
            extra = Parent(
                school_id=ais.id,
                user_id=extra_user.id,
                full_name=extra_user.full_name,
                phone="",
                email=extra_user.email,
            )
            db.add(extra)
            db.flush()
            db.add(
                ParentStudent(
                    school_id=ais.id,
                    parent_id=extra.id,
                    student_id=child.id,
                    relationship_name="parent",
                )
            )

    class_8 = classes[8]
    unit = _exam(db, ais.id, ais_year.id, class_8.id, "Unit Test 1", "unit_test", "published", date(2026, 7, 20))
    midterm = _exam(db, ais.id, ais_year.id, class_8.id, "Midterm", "midterm", "published", date(2026, 9, 20))
    final = _exam(db, ais.id, ais_year.id, class_8.id, "Final", "final", "draft", date(2026, 12, 10))
    for exam in (unit, midterm, final):
        for code in ("MATH", "SCI", "ENG"):
            db.add(
                ExamSubject(
                    school_id=ais.id,
                    exam_id=exam.id,
                    subject_id=subjects[code].id,
                    max_marks=100,
                    required=True,
                )
            )
    db.flush()

    mark_plan = {
        students[(8, "A", 0)].id: {
            unit.id: {"MATH": 88, "SCI": 86, "ENG": 90},
            midterm.id: {"MATH": 90, "SCI": 84, "ENG": 87},
            final.id: {"MATH": 10, "SCI": 92, "ENG": 91},
        },
        students[(8, "A", 1)].id: {
            unit.id: {"MATH": 80, "SCI": 78, "ENG": 79},
            midterm.id: {"MATH": 20, "SCI": 15, "ENG": 80},
        },
    }
    for (_grade, _sec, index), student in students.items():
        if student.section_id != section_8a.id:
            continue
        if student.id in mark_plan:
            continue
        mark_plan[student.id] = {
            unit.id: {"MATH": 72, "SCI": 74, "ENG": 70},
            midterm.id: {"MATH": 76, "SCI": 73, "ENG": 75},
        }
    for student_id, exams in mark_plan.items():
        for exam_id, scores in exams.items():
            for code, score in scores.items():
                db.add(
                    Mark(
                        school_id=ais.id,
                        exam_id=exam_id,
                        student_id=student_id,
                        subject_id=subjects[code].id,
                        marks_obtained=score,
                        max_marks=100,
                        is_absent=False,
                        entered_by=teacher_user.id,
                    )
                )

    ishan = students[(8, "A", 1)]
    weak_status = ["absent"] * 7 + ["present", "present", "late"]
    section_students = [students[(8, "A", index)] for index in range(5)]
    for offset, status in enumerate(weak_status):
        session_date = date(2026, 9, 1) + timedelta(days=offset)
        session = AttendanceSession(
            school_id=ais.id,
            section_id=section_8a.id,
            subject_id=subjects["MATH"].id,
            session_date=session_date,
            period=1,
            is_holiday=False,
            created_by=teacher_user.id,
        )
        db.add(session)
        db.flush()
        for student in section_students:
            row_status = status if student.id == ishan.id else "present"
            db.add(
                AttendanceRecord(
                    school_id=ais.id,
                    session_id=session.id,
                    student_id=student.id,
                    status=row_status,
                    marked_by=teacher_user.id,
                    marked_at=datetime(2026, 9, 1, 9, 0) + timedelta(days=offset),
                )
            )

    _invoice(
        db,
        ais.id,
        ais_year.id,
        students[(8, "A", 0)].id,
        "INV-AIS-0001",
        15000,
        15000,
        0,
        date(2026, 8, 1),
        False,
        paid_payment=True,
    )
    _invoice(
        db,
        ais.id,
        ais_year.id,
        students[(3, "A", 0)].id,
        "INV-AIS-0002",
        8000,
        0,
        0,
        date(2026, 12, 15),
        False,
    )
    _invoice(
        db,
        ais.id,
        ais_year.id,
        ishan.id,
        "INV-AIS-0003",
        8000,
        0,
        0,
        date(2026, 6, 1),
        False,
    )
    _invoice(
        db,
        ais.id,
        ais_year.id,
        students[(5, "A", 0)].id,
        "INV-AIS-0004",
        5000,
        0,
        5000,
        date(2026, 7, 1),
        False,
    )
    _invoice(
        db,
        ais.id,
        ais_year.id,
        students[(6, "B", 0)].id,
        "INV-AIS-0005",
        9000,
        2000,
        0,
        date(2026, 6, 1),
        False,
    )
    _invoice(
        db,
        ais.id,
        ais_year.id,
        students[(7, "A", 0)].id,
        "INV-AIS-0006",
        4000,
        0,
        0,
        date(2026, 5, 1),
        True,
    )
    for extra_index in range(7, 13):
        grade = extra_index - 6
        _invoice(
            db,
            ais.id,
            ais_year.id,
            students[(grade, "B", 1)].id,
            f"INV-AIS-{extra_index:04d}",
            6000,
            0,
            0,
            date(2026, 12, 20),
            False,
        )

    past_one = Assignment(
        school_id=ais.id,
        section_id=section_8a.id,
        subject_id=subjects["MATH"].id,
        teacher_id=teachers[0].id,
        title="Linear equations practice",
        description="Complete the worksheet on one variable.",
        due_date=date(2026, 10, 1),
        max_marks=10,
    )
    past_two = Assignment(
        school_id=ais.id,
        section_id=section_8a.id,
        subject_id=subjects["MATH"].id,
        teacher_id=teachers[0].id,
        title="Fractions worksheet",
        description="Simplify and compare fractions.",
        due_date=date(2026, 10, 15),
        max_marks=10,
    )
    future = Assignment(
        school_id=ais.id,
        section_id=section_8a.id,
        subject_id=subjects["MATH"].id,
        teacher_id=teachers[0].id,
        title="December revision",
        description="Not due yet.",
        due_date=date(2026, 12, 20),
        max_marks=20,
    )
    db.add_all([past_one, past_two, future])
    db.flush()
    for assignment in (past_one, past_two):
        for student in section_students:
            if student.id == ishan.id:
                continue
            db.add(
                AssignmentSubmission(
                    school_id=ais.id,
                    assignment_id=assignment.id,
                    student_id=student.id,
                    status="submitted",
                    submitted_at=datetime(2026, 10, 1, 12, 0),
                )
            )

    catalogue = [
        ("NCERT Mathematics Class 8", "NCERT", "9788174500001"),
        ("Science Explorer 8", "NCERT", "9788174500002"),
        ("A Compact English Grammar", "Rao", "9788174500003"),
        ("Maps and People", "NCERT", "9788174500004"),
    ]
    for book_index, (title, author, isbn) in enumerate(catalogue, start=1):
        book = Book(school_id=ais.id, title=title, author=author, isbn=isbn)
        db.add(book)
        db.flush()
        for copy_no in (1, 2):
            db.add(
                BookCopy(
                    school_id=ais.id,
                    book_id=book.id,
                    accession_no=f"AIS-BK-{book_index:02d}-{copy_no}",
                    status="available",
                )
            )

    db.add(
        TimetableSlotRow(
            school_id=ais.id,
            section_id=section_8a.id,
            subject_id=subjects["MATH"].id,
            teacher_id=teachers[0].id,
            weekday=0,
            period=1,
            room="AIS-8A-R1",
        )
    )
    db.add(
        TimetableSlotRow(
            school_id=ais.id,
            section_id=sections[(8, "B")].id,
            subject_id=subjects["MATH"].id,
            teacher_id=teachers[1].id,
            weekday=0,
            period=1,
            room="AIS-8B-R1",
        )
    )
    db.add(
        TimetableSlotRow(
            school_id=ais.id,
            section_id=section_8a.id,
            subject_id=subjects["ENG"].id,
            teacher_id=teachers[2].id,
            weekday=0,
            period=2,
            room="AIS-8A-R2",
        )
    )
    db.add_all(
        [
            CalendarEvent(
                school_id=ais.id,
                title="Independence Day",
                event_date=date(2026, 8, 15),
                event_type="holiday",
                description="School closed. Not an attendance session.",
            ),
            CalendarEvent(
                school_id=ais.id,
                title="Gandhi Jayanti",
                event_date=date(2026, 10, 2),
                event_type="holiday",
                description="School closed.",
            ),
            CalendarEvent(
                school_id=ais.id,
                title="Midterm window",
                event_date=date(2026, 9, 20),
                event_type="exam",
                description="Published midterm.",
            ),
            CalendarEvent(
                school_id=ais.id,
                title="Children's Day assembly",
                event_date=date(2026, 11, 14),
                event_type="event",
                description="Morning assembly.",
            ),
        ]
    )
    db.add_all(
        [
            Announcement(
                school_id=ais.id,
                title="Welcome to 2026-2027",
                body="Term has started. Check the calendar for holidays.",
                audience="all",
                created_by=None,
            ),
            Announcement(
                school_id=ais.id,
                title="Fee window",
                body="Tuition invoices are visible to parents and accounts.",
                audience="parent",
                created_by=None,
            ),
        ]
    )

    hps_class = SchoolClass(
        school_id=hps.id, academic_year_id=hps_year.id, name="Class 8", grade_level=8
    )
    db.add(hps_class)
    db.flush()
    hps_section = Section(school_id=hps.id, class_id=hps_class.id, name="A")
    db.add(hps_section)
    db.flush()
    hps_admin = add_user(
        "horizon.admin@edunexus.school", "Horizon#2026", "Horizon Admin", "school_admin", hps.id
    )
    hps_teacher_user = add_user(
        "horizon.teacher@edunexus.school", "Teacher#2026", "Horizon Teacher", "teacher", hps.id
    )
    hps_teacher = Teacher(
        school_id=hps.id,
        user_id=hps_teacher_user.id,
        employee_code="T-HPS-001",
        full_name="Horizon Teacher",
    )
    db.add(hps_teacher)
    db.flush()
    _ = hps_admin
    for index in range(5):
        db.add(
            Student(
                school_id=hps.id,
                user_id=None,
                academic_year_id=hps_year.id,
                class_id=hps_class.id,
                section_id=hps_section.id,
                admission_no=f"HPS-{index + 1:04d}",
                first_name=STUDENT_FIRST[index],
                last_name="Solanki",
                gender=None,
                date_of_birth=date(2013, 1, 10 + index),
                roll_no=index + 1,
                status="active",
            )
        )
    db.flush()


def _school(db: Session, name: str, code: str, city: str, address: str) -> School:
    school = School(name=name, code=code, city=city, address=address)
    db.add(school)
    db.flush()
    return school


def _year(db: Session, school_id: int) -> AcademicYear:
    year = AcademicYear(
        school_id=school_id,
        name="2026-2027",
        start_date=date(2026, 4, 1),
        end_date=date(2027, 3, 31),
        is_current=True,
    )
    db.add(year)
    db.flush()
    return year


def _bands(db: Session, school_id: int) -> None:
    for grade, minimum in DEFAULT_GRADE_BANDS:
        db.add(GradeBand(school_id=school_id, grade=grade, min_percentage=float(minimum)))


def _classes(db: Session, school_id: int, year_id: int):
    classes: dict[int, SchoolClass] = {}
    sections: dict[tuple[int, str], Section] = {}
    for grade in range(1, 13):
        klass = SchoolClass(
            school_id=school_id,
            academic_year_id=year_id,
            name=f"Class {grade}",
            grade_level=grade,
        )
        db.add(klass)
        db.flush()
        classes[grade] = klass
        for sec_name in ("A", "B"):
            section = Section(school_id=school_id, class_id=klass.id, name=sec_name)
            db.add(section)
            db.flush()
            sections[(grade, sec_name)] = section
    return classes, sections


def _subjects(db: Session, school_id: int) -> dict[str, Subject]:
    found: dict[str, Subject] = {}
    for code, name in SUBJECTS:
        subject = Subject(school_id=school_id, code=code, name=name)
        db.add(subject)
        db.flush()
        found[code] = subject
    return found


def _assign(db, school_id, teacher_id, section_id, subject_id, year_id) -> None:
    db.add(
        TeacherAssignment(
            school_id=school_id,
            teacher_id=teacher_id,
            section_id=section_id,
            subject_id=subject_id,
            academic_year_id=year_id,
        )
    )


def _exam(db, school_id, year_id, class_id, name, exam_type, status, exam_date) -> Examination:
    exam = Examination(
        school_id=school_id,
        academic_year_id=year_id,
        class_id=class_id,
        name=name,
        exam_type=exam_type,
        status=status,
        exam_date=exam_date,
        published_at=datetime(2026, 7, 21) if status == "published" else None,
    )
    db.add(exam)
    db.flush()
    return exam


def _invoice(
    db,
    school_id,
    year_id,
    student_id,
    number,
    due,
    paid,
    concession,
    due_date,
    cancelled,
    paid_payment: bool = False,
) -> None:
    today = date.today()
    status = fee_status(
        amount_due=due,
        amount_paid=paid,
        concession=concession,
        due_date=due_date,
        today=today,
        cancelled=cancelled,
    )
    invoice = FeeInvoice(
        school_id=school_id,
        student_id=student_id,
        academic_year_id=year_id,
        invoice_no=number,
        description="Tuition",
        amount_due=due,
        amount_paid=paid,
        concession=concession,
        due_date=due_date,
        status=status,
        cancelled=cancelled,
    )
    db.add(invoice)
    db.flush()
    if paid_payment:
        db.add(
            FeePayment(
                school_id=school_id,
                invoice_id=invoice.id,
                amount=paid,
                gateway="mock",
                order_id=f"seed_{number}",
                payment_id=f"seed_pay_{number}",
                status="paid",
                idempotency_key=f"seed-{number}",
                paid_at=datetime(2026, 8, 2, 10, 0),
            )
        )
