import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessRisk,
  canAccessSchool,
  DEFAULT_POLICY,
  feeStatus,
  gradeFor,
  outstanding,
  parseStudentCsv,
  rollupExam,
  subjectResult,
  summarizeAttendance,
  timetableConflicts,
  validateMark,
} from "./engine.ts";

describe("attendance", () => {
  it("counts late as present, half-day as half, and excludes approved leave", () => {
    const summary = summarizeAttendance(
      [
        { status: "present" },
        { status: "late" },
        { status: "half_day" },
        { status: "absent" },
        { status: "leave" },
      ],
      DEFAULT_POLICY,
    );
    assert.equal(summary.eligible, 4);
    assert.equal(summary.attended, 2.5);
    assert.equal(summary.percentage, 62.5);
    assert.equal(summarizeAttendance([{ status: "present" }, { status: "present" }], DEFAULT_POLICY).percentage, 100);
  });
});

describe("grades", () => {
  it("uses the configured boundaries and fails an absent subject", () => {
    assert.equal(gradeFor(91).grade, "A1");
    assert.equal(gradeFor(90.9).grade, "A2");
    assert.equal(gradeFor(33).grade, "D");
    assert.equal(gradeFor(32.9).grade, "E");
    const rows = [
      { ...subjectResult(80, 100, 33, []), subjectId: "m" },
      { ...subjectResult(null, 100, 33, []), subjectId: "e" },
    ];
    const roll = rollupExam(rows, [], 33);
    assert.equal(roll.pass, false);
    assert.equal(roll.absent, 1);
    assert.equal(roll.percent, 80);
    assert.equal(validateMark(-1, 100), "Marks cannot be negative.");
    assert.equal(validateMark(101, 100), "Marks cannot exceed the maximum.");
    assert.equal(validateMark(40, 100), null);
  });
});

describe("fees", () => {
  it("classifies paid, partial, overdue, waived, and cancelled", () => {
    assert.equal(feeStatus({ due: 100, paid: 100, concession: 0, dueDate: "2026-09-01", today: "2026-11-17" }), "paid");
    assert.equal(feeStatus({ due: 100, paid: 40, concession: 0, dueDate: "2026-12-01", today: "2026-11-17" }), "partial");
    assert.equal(feeStatus({ due: 100, paid: 40, concession: 0, dueDate: "2026-09-01", today: "2026-11-17" }), "overdue");
    assert.equal(feeStatus({ due: 100, paid: 0, concession: 100, dueDate: "2026-09-01", today: "2026-11-17" }), "waived");
    assert.equal(feeStatus({ due: 100, paid: 0, concession: 0, dueDate: "2026-12-01", today: "2026-11-17" }), "pending");
    assert.equal(
      feeStatus({ due: 100, paid: 10, concession: 0, dueDate: "2026-09-01", today: "2026-11-17", cancelled: true }),
      "cancelled",
    );
    assert.equal(outstanding(1000, 400, 100), 500);
  });
});

describe("timetable", () => {
  it("flags teacher, room, and section clashes", () => {
    const clashes = timetableConflicts([
      { id: "a", teacherId: "t", roomId: "r1", sectionId: "s1", day: 1, periodId: "p", subjectId: "m" },
      { id: "b", teacherId: "t", roomId: "r2", sectionId: "s2", day: 1, periodId: "p", subjectId: "m" },
      { id: "c", teacherId: "t2", roomId: "r1", sectionId: "s3", day: 1, periodId: "p", subjectId: "e" },
      { id: "d", teacherId: "t3", roomId: "r3", sectionId: "s1", day: 1, periodId: "p", subjectId: "h" },
    ]);
    assert.equal(clashes.some((item) => item.code === "teacher"), true);
    assert.equal(clashes.some((item) => item.code === "room"), true);
    assert.equal(clashes.some((item) => item.code === "section"), true);
  });
});

describe("risk", () => {
  it("explains flags and does not invent a trait label", () => {
    const risk = assessRisk({
      attendancePct: 58,
      eligibleSessions: 20,
      failedSubjects: 2,
      markDrop: -12,
      missingAssignments: 2,
    });
    assert.equal(risk.level, "high");
    assert.equal(risk.indicators.length >= 3, true);
    const blob = JSON.stringify(risk).toLowerCase();
    assert.equal(blob.includes("intelligence"), false);
    assert.equal(blob.includes("disability"), false);
    assert.equal(blob.includes("gender"), false);
    const calm = assessRisk({
      attendancePct: 96,
      eligibleSessions: 20,
      failedSubjects: 0,
      markDrop: 2,
      missingAssignments: 0,
    });
    assert.equal(calm.level, "low");
  });
});

describe("isolation and import", () => {
  it("blocks cross-school access and reports bad csv rows without dropping the message", () => {
    assert.equal(canAccessSchool("teacher", "ais", "hps"), false);
    assert.equal(canAccessSchool("super_admin", null, "hps"), true);
    const report = parseStudentCsv(
      [
        "first_name,last_name,dob,class,section,admission_no",
        "Asha,Mehta,2014-04-02,Class 8,A,AIS-9",
        "Bad,Row,02-04-2014,Class 8,A,AIS-2",
        "Duplicate,Row,2014-01-01,Class 8,A,AIS-1",
        "Unknown,Class,2014-01-01,Class 99,A,",
      ].join("\n"),
      {
        classes: [{ id: "c8", name: "Class 8" }],
        sections: [{ id: "s", classId: "c8", name: "A" }],
        admissions: new Set(["AIS-1"]),
      },
    );
    assert.equal(report.accepted.length, 1);
    assert.equal(report.errors.length, 3);
  });
});
