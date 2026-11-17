"""Pure academic rules. Demographics are not inputs and must not be added."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

DEFAULT_GRADE_BANDS: tuple[tuple[str, Decimal], ...] = (
    ("A1", Decimal("91")),
    ("A2", Decimal("81")),
    ("B1", Decimal("71")),
    ("B2", Decimal("61")),
    ("C1", Decimal("51")),
    ("C2", Decimal("41")),
    ("D", Decimal("33")),
    ("E", Decimal("0")),
)

PASS_RATIO = Decimal("0.33")

ATTENDANCE_WEIGHTS = {
    "present": Decimal("1"),
    "late": Decimal("1"),
    "half_day": Decimal("0.5"),
    "absent": Decimal("0"),
}

LEAVE_STATUSES = {"leave", "approved_leave"}


def _d(value) -> Decimal:
    return Decimal(str(value))


def _one_decimal(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


@dataclass(frozen=True)
class AttendanceSummary:
    percentage: float | None
    attended: float
    eligible: int
    late_count: int


def attendance_summary(records: list[dict]) -> AttendanceSummary:
    """present=1, late=1 (still counted late), half_day=0.5, absent=0.

    Approved leave is excluded from both numerator and denominator.
    Holidays are not sessions and are ignored when flagged.
    Returns percentage None when nothing is eligible (do not treat as 0).
    """
    attended = Decimal("0")
    eligible = 0
    late_count = 0
    for record in records:
        if record.get("is_holiday"):
            continue
        status = record.get("status")
        if status in LEAVE_STATUSES:
            continue
        if status not in ATTENDANCE_WEIGHTS:
            continue
        eligible += 1
        attended += ATTENDANCE_WEIGHTS[status]
        if status == "late":
            late_count += 1
    if eligible == 0:
        return AttendanceSummary(percentage=None, attended=0.0, eligible=0, late_count=0)
    percentage = _one_decimal(attended / Decimal(eligible) * Decimal(100))
    return AttendanceSummary(
        percentage=percentage,
        attended=float(attended),
        eligible=eligible,
        late_count=late_count,
    )


def grade_for_percentage(percentage, bands=DEFAULT_GRADE_BANDS) -> str:
    pct = _d(percentage)
    ordered = sorted(bands, key=lambda item: _d(item[1]), reverse=True)
    for name, minimum in ordered:
        if pct >= _d(minimum):
            return name
    return "E"


def subject_outcome(marks_obtained, max_marks, is_absent: bool, bands=DEFAULT_GRADE_BANDS) -> dict:
    """Absent (null) fails the subject and is left out of the average."""
    if is_absent or marks_obtained is None:
        return {
            "passed": False,
            "grade": None,
            "percentage": None,
            "include_in_average": False,
            "absent": True,
            "marks_obtained": None,
            "max_marks": float(max_marks) if max_marks is not None else None,
        }
    maximum = _d(max_marks)
    obtained = _d(marks_obtained)
    if maximum <= 0:
        raise ValueError("max_marks must be positive")
    if obtained < 0 or obtained > maximum:
        raise ValueError("marks must be between 0 and max")
    percentage = obtained / maximum * Decimal(100)
    passed = obtained >= (maximum * PASS_RATIO)
    return {
        "passed": passed,
        "grade": grade_for_percentage(percentage, bands),
        "percentage": _one_decimal(percentage),
        "include_in_average": True,
        "absent": False,
        "marks_obtained": float(obtained),
        "max_marks": float(maximum),
    }


def overall_result(subjects: list[dict], bands=DEFAULT_GRADE_BANDS) -> dict:
    """FAIL if any required subject fails. Absent rows are not in the denominator."""
    obtained = Decimal("0")
    maximum = Decimal("0")
    any_required_fail = False
    for item in subjects:
        outcome = item["outcome"]
        required = item.get("required", True)
        if required and not outcome["passed"]:
            any_required_fail = True
        if outcome.get("include_in_average"):
            obtained += _d(outcome["marks_obtained"])
            maximum += _d(outcome["max_marks"])
    if maximum == 0:
        average = None
        grade = None
    else:
        average = _one_decimal(obtained / maximum * Decimal(100))
        grade = grade_for_percentage(average, bands)
    return {
        "average_percentage": average,
        "overall_grade": grade,
        "result": "FAIL" if any_required_fail else "PASS",
    }


def fee_status(
    *,
    amount_due,
    amount_paid,
    concession,
    due_date: date,
    today: date,
    cancelled: bool = False,
) -> str:
    """waived, paid, partial, overdue, pending, or cancelled.

    Partial wins over overdue when any amount has been paid.
    A due date equal to today is not yet overdue.
    """
    if cancelled:
        return "cancelled"
    due = _d(amount_due)
    paid = _d(amount_paid)
    conc = _d(concession)
    if conc >= due:
        return "waived"
    if paid + conc >= due:
        return "paid"
    if paid > 0:
        return "partial"
    if today > due_date:
        return "overdue"
    return "pending"


@dataclass(frozen=True)
class TimetableSlot:
    teacher_id: int
    section_id: int
    subject_id: int
    weekday: int
    period: int
    room: str
    slot_id: int | None = None


def timetable_conflict_types(slots: list[TimetableSlot]) -> list[dict]:
    """Same teacher in two classes, same room, or two subjects in one section."""
    found: list[dict] = []
    for index, left in enumerate(slots):
        for right in slots[index + 1 :]:
            if left.weekday != right.weekday or left.period != right.period:
                continue
            if left.slot_id is not None and left.slot_id == right.slot_id:
                continue
            if left.teacher_id == right.teacher_id and left.section_id != right.section_id:
                found.append({"type": "teacher", "detail": "Teacher is booked in two classes for this period"})
            if left.room and left.room == right.room:
                found.append({"type": "room", "detail": "Room is already used in this period"})
            if left.section_id == right.section_id and left.subject_id != right.subject_id:
                found.append({"type": "section", "detail": "Section already has another subject in this period"})
    return found


def assess_risk(
    *,
    attendance_pct: float | None,
    failed_subjects: int,
    mark_decline: float,
    missing_assignments: int,
) -> dict:
    """Support suggestion only. High, moderate, or low. Indicators that fired, nothing else."""
    high: list[str] = []
    moderate: list[str] = []
    if attendance_pct is not None and attendance_pct < 60:
        high.append("attendance_below_60")
    if failed_subjects >= 2:
        high.append("two_or_more_failed_subjects")
    if attendance_pct is not None and attendance_pct < 75 and mark_decline >= 10:
        high.append("attendance_below_75_and_declining_marks")
    if attendance_pct is not None and attendance_pct < 75:
        moderate.append("attendance_below_75")
    if mark_decline >= 10:
        moderate.append("declining_marks_10_points")
    if missing_assignments >= 2:
        moderate.append("two_or_more_missing_assignments")

    if high:
        level = "high"
        indicators = high + [item for item in moderate if item not in high]
    elif moderate:
        level = "moderate"
        indicators = moderate
    else:
        level = "low"
        indicators = []

    explanations = {
        "attendance_below_60": "Attendance is below 60%.",
        "two_or_more_failed_subjects": "Two or more subjects were failed in the latest published exam.",
        "attendance_below_75_and_declining_marks": (
            "Attendance is below 75% and marks declined by at least 10 points."
        ),
        "attendance_below_75": "Attendance is below 75%.",
        "declining_marks_10_points": (
            "Marks declined by at least 10 points between the last two published exams."
        ),
        "two_or_more_missing_assignments": "Two or more assignments are missing after the due date.",
    }
    recommendations = {
        "attendance_below_60": (
            "A teacher or coordinator should review attendance with the student and family. "
            "This is a support suggestion, not a sanction."
        ),
        "two_or_more_failed_subjects": (
            "Review the failed subjects with the subject teacher and consider remedial practice "
            "after a human looks at the papers."
        ),
        "attendance_below_75_and_declining_marks": (
            "Ask a coordinator to look at both attendance and the recent mark drop together."
        ),
        "attendance_below_75": (
            "Check whether absences are explained before the next reporting period."
        ),
        "declining_marks_10_points": (
            "Compare the last two published exams with the student and agree a short study plan."
        ),
        "two_or_more_missing_assignments": (
            "Confirm the student can access the work. Missing work is a follow-up, not a label."
        ),
    }
    if indicators:
        explanation = " ".join(explanations[code] for code in indicators)
        recs = [recommendations[code] for code in indicators]
    else:
        explanation = "No risk indicators are currently present."
        recs = ["No academic risk indicators. Continue routine human review at report-card time."]
    return {
        "level": level,
        "indicators": indicators,
        "explanation": explanation,
        "recommendations": recs,
    }
