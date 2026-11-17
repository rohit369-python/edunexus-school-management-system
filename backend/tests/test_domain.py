"""Domain rules: attendance, grades, fees, timetable, risk."""

from __future__ import annotations

import inspect
from datetime import date

import pytest

from app.domain import (
    assess_risk,
    attendance_summary,
    fee_status,
    grade_for_percentage,
    overall_result,
    subject_outcome,
    timetable_conflict_types,
)
from app.domain import TimetableSlot as Slot
from app.errors import NotConfigured
from app.payments import RazorpayAdapter


def test_attendance_math_and_late_flag():
    summary = attendance_summary(
        [
            {"status": "present"},
            {"status": "late"},
            {"status": "half_day"},
            {"status": "absent"},
            {"status": "leave"},
            {"status": "approved_leave"},
            {"status": "present", "is_holiday": True},
        ]
    )
    # leave and holiday are out of both sides. late still counts as attended and flagged.
    assert summary.eligible == 4
    assert summary.attended == 2.5
    assert summary.percentage == 62.5
    assert summary.late_count == 1

    only_late = attendance_summary([{"status": "late"}])
    assert only_late.percentage == 100.0
    assert only_late.late_count == 1

    rounded = attendance_summary(
        [{"status": "half_day"}, {"status": "half_day"}, {"status": "absent"}]
    )
    assert rounded.percentage == 33.3

    empty = attendance_summary([{"status": "leave"}, {"status": "present", "is_holiday": True}])
    assert empty.eligible == 0
    assert empty.percentage is None


def test_grade_boundaries_absent_average_and_no_demographics():
    assert grade_for_percentage(91) == "A1"
    assert grade_for_percentage(90.99) == "A2"
    assert grade_for_percentage(81) == "A2"
    assert grade_for_percentage(80.99) == "B1"
    assert grade_for_percentage(71) == "B1"
    assert grade_for_percentage(61) == "B2"
    assert grade_for_percentage(51) == "C1"
    assert grade_for_percentage(41) == "C2"
    assert grade_for_percentage(33) == "D"
    assert grade_for_percentage(32.99) == "E"

    assert subject_outcome(33, 100, False)["grade"] == "D"
    assert subject_outcome(33, 100, False)["passed"] is True
    assert subject_outcome(32.99, 100, False)["passed"] is False
    assert subject_outcome(100, 100, False)["grade"] == "A1"
    assert subject_outcome(0, 100, False)["grade"] == "E"
    assert subject_outcome(16.5, 50, False)["passed"] is True
    assert subject_outcome(16.4, 50, False)["passed"] is False

    with pytest.raises(ValueError):
        subject_outcome(101, 100, False)
    with pytest.raises(ValueError):
        subject_outcome(-1, 100, False)

    absent = subject_outcome(None, 100, True)
    assert absent["passed"] is False
    assert absent["include_in_average"] is False

    overall = overall_result(
        [
            {"required": True, "outcome": subject_outcome(50, 100, False)},
            {"required": True, "outcome": subject_outcome(None, 100, True)},
            {"required": True, "outcome": subject_outcome(40, 80, False)},
        ]
    )
    assert overall["result"] == "FAIL"
    assert overall["average_percentage"] == 50.0

    custom = (("A", 50), ("E", 0))
    assert grade_for_percentage(50, custom) == "A"
    assert grade_for_percentage(49.9, custom) == "E"

    for name in ("gender", "religion", "blood", "intelligence", "personality", "disability"):
        assert name not in inspect.signature(overall_result).parameters
        assert name not in inspect.signature(subject_outcome).parameters
        assert name not in inspect.getsource(overall_result).lower()


def test_fee_status_matrix():
    due = date(2026, 8, 1)
    assert fee_status(amount_due=1000, amount_paid=1000, concession=0, due_date=due, today=due, cancelled=True) == "cancelled"
    assert fee_status(amount_due=1000, amount_paid=0, concession=1000, due_date=due, today=due) == "waived"
    assert fee_status(amount_due=1000, amount_paid=0, concession=1001, due_date=due, today=due) == "waived"
    assert fee_status(amount_due=1000, amount_paid=600, concession=400, due_date=due, today=due) == "paid"
    assert fee_status(amount_due=1000, amount_paid=1000, concession=0, due_date=due, today=due) == "paid"
    assert fee_status(amount_due=1000, amount_paid=10, concession=0, due_date=due, today=due) == "partial"
    assert fee_status(amount_due=1000, amount_paid=10, concession=0, due_date=due, today=date(2026, 8, 2)) == "partial"
    assert fee_status(amount_due=1000, amount_paid=0, concession=0, due_date=due, today=date(2026, 8, 2)) == "overdue"
    assert fee_status(amount_due=1000, amount_paid=0, concession=0, due_date=due, today=due) == "pending"
    assert fee_status(amount_due=1000, amount_paid=0, concession=0, due_date=due, today=date(2026, 7, 1)) == "pending"
    assert fee_status(amount_due=1000, amount_paid=0, concession=40, due_date=due, today=date(2026, 8, 2)) == "overdue"
    assert fee_status(amount_due=1000, amount_paid=0, concession=1000, due_date=due, today=due, cancelled=True) == "cancelled"


def test_timetable_conflicts():
    teacher = timetable_conflict_types(
        [
            Slot(1, 1, 1, 0, 1, "R1"),
            Slot(1, 2, 1, 0, 1, "R2"),
        ]
    )
    assert {item["type"] for item in teacher} == {"teacher"}

    room = timetable_conflict_types(
        [
            Slot(1, 1, 1, 0, 1, "R1"),
            Slot(2, 2, 2, 0, 1, "R1"),
        ]
    )
    assert {item["type"] for item in room} == {"room"}

    section = timetable_conflict_types(
        [
            Slot(1, 1, 1, 0, 1, "R1"),
            Slot(2, 1, 2, 0, 1, "R2"),
        ]
    )
    assert {item["type"] for item in section} == {"section"}

    clear = timetable_conflict_types(
        [
            Slot(1, 1, 1, 0, 1, "R1"),
            Slot(1, 1, 1, 0, 2, "R1"),
        ]
    )
    assert clear == []


def test_risk_rules_ignore_demographics():
    source = inspect.getsource(assess_risk).lower()
    for word in ("gender", "religion", "blood", "intelligence", "personality", "disability", "iq"):
        assert word not in source
    assert "gender" not in inspect.signature(assess_risk).parameters

    high = assess_risk(attendance_pct=59.9, failed_subjects=0, mark_decline=0, missing_assignments=0)
    assert high["level"] == "high"
    assert high["indicators"] == ["attendance_below_60", "attendance_below_75"]

    fails = assess_risk(attendance_pct=90, failed_subjects=2, mark_decline=0, missing_assignments=0)
    assert fails["level"] == "high"
    assert fails["indicators"] == ["two_or_more_failed_subjects"]

    combined = assess_risk(attendance_pct=74.9, failed_subjects=0, mark_decline=10, missing_assignments=0)
    assert combined["level"] == "high"
    assert "attendance_below_75_and_declining_marks" in combined["indicators"]

    moderate = assess_risk(attendance_pct=60, failed_subjects=0, mark_decline=0, missing_assignments=0)
    assert moderate["level"] == "moderate"
    assert moderate["indicators"] == ["attendance_below_75"]

    decline_only = assess_risk(attendance_pct=80, failed_subjects=1, mark_decline=10, missing_assignments=1)
    assert decline_only["level"] == "moderate"
    assert decline_only["indicators"] == ["declining_marks_10_points"]

    missing = assess_risk(attendance_pct=90, failed_subjects=0, mark_decline=0, missing_assignments=2)
    assert missing["level"] == "moderate"

    low = assess_risk(attendance_pct=75, failed_subjects=0, mark_decline=9.9, missing_assignments=1)
    assert low["level"] == "low"
    assert low["indicators"] == []

    unknown = assess_risk(attendance_pct=None, failed_subjects=0, mark_decline=0, missing_assignments=0)
    assert unknown["level"] == "low"
    blob = " ".join(low["recommendations"] + high["recommendations"]).lower()
    for banned in ("intelligence", "personality", "disability", "sanction"):
        if banned == "sanction":
            assert "not a sanction" in blob
        else:
            assert banned not in blob


def test_razorpay_adapter_does_not_process_without_keys():
    with pytest.raises(NotConfigured):
        RazorpayAdapter(None, None)
    with pytest.raises(NotConfigured):
        RazorpayAdapter("", "secret")
    shaped = RazorpayAdapter("rzp_test_demo", "secret")
    payload = shaped.initiate(amount_paise=1000, receipt="rcpt-1")
    assert payload["processed"] is False
    assert payload["status"] == "not_sent"
