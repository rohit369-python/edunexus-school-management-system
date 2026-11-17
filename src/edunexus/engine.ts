import type {
  AttendancePolicy,
  AttendanceStatus,
  FeeState,
  GradeBand,
  RiskLevel,
} from "./types";

export const DEFAULT_GRADE_SCALE: GradeBand[] = [
  { min: 91, grade: "A1", point: 10 },
  { min: 81, grade: "A2", point: 9 },
  { min: 71, grade: "B1", point: 8 },
  { min: 61, grade: "B2", point: 7 },
  { min: 51, grade: "C1", point: 6 },
  { min: 41, grade: "C2", point: 5 },
  { min: 33, grade: "D", point: 4 },
  { min: 0, grade: "E", point: 0 },
];

export const DEFAULT_POLICY: AttendancePolicy = {
  threshold: 75,
  lateCountsAs: 1,
  halfDayCountsAs: 0.5,
  excludeApprovedLeave: true,
};

export function hashUnit(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

export function attendanceCredit(
  status: AttendanceStatus,
  policy: AttendancePolicy,
): { credit: number; eligible: boolean } {
  if (status === "present") return { credit: 1, eligible: true };
  if (status === "late") return { credit: policy.lateCountsAs, eligible: true };
  if (status === "half_day") return { credit: policy.halfDayCountsAs, eligible: true };
  if (status === "absent") return { credit: 0, eligible: true };
  if (policy.excludeApprovedLeave) return { credit: 0, eligible: false };
  return { credit: 0, eligible: true };
}

export interface AttendanceSummary {
  percentage: number;
  eligible: number;
  attended: number;
  absent: number;
  late: number;
  half: number;
  leave: number;
}

export function summarizeAttendance(
  rows: { status: AttendanceStatus }[],
  policy: AttendancePolicy,
): AttendanceSummary {
  let credit = 0;
  let eligible = 0;
  const summary: AttendanceSummary = {
    percentage: 0,
    eligible: 0,
    attended: 0,
    absent: 0,
    late: 0,
    half: 0,
    leave: 0,
  };
  for (const row of rows) {
    if (row.status === "absent") summary.absent += 1;
    if (row.status === "late") summary.late += 1;
    if (row.status === "half_day") summary.half += 1;
    if (row.status === "leave") summary.leave += 1;
    const part = attendanceCredit(row.status, policy);
    if (!part.eligible) continue;
    eligible += 1;
    credit += part.credit;
  }
  summary.eligible = eligible;
  summary.attended = Math.round(credit * 10) / 10;
  summary.percentage = eligible === 0 ? 0 : Math.round((credit / eligible) * 1000) / 10;
  return summary;
}

export function gradeFor(percent: number, scale: GradeBand[] = DEFAULT_GRADE_SCALE): GradeBand {
  const source = scale.length > 0 ? scale : DEFAULT_GRADE_SCALE;
  const sorted = [...source].sort((a, b) => b.min - a.min);
  return sorted.find((band) => percent + 1e-9 >= band.min) ?? sorted[sorted.length - 1];
}

export function validateMark(value: number, max: number): string | null {
  if (!Number.isFinite(value)) return "Marks must be a number.";
  if (value < 0) return "Marks cannot be negative.";
  if (value > max) return "Marks cannot exceed the maximum.";
  return null;
}

export interface SubjectResult {
  subjectId: string;
  marks: number | null;
  max: number;
  absent: boolean;
  percent: number | null;
  grade: string | null;
  pass: boolean;
}

export function subjectResult(
  marks: number | null,
  max: number,
  passPercent: number,
  scale: GradeBand[],
): SubjectResult {
  if (marks === null) {
    return { subjectId: "", marks: null, max, absent: true, percent: null, grade: null, pass: false };
  }
  const percent = max === 0 ? 0 : Math.round((marks / max) * 1000) / 10;
  const grade = gradeFor(percent, scale).grade;
  return {
    subjectId: "",
    marks,
    max,
    absent: false,
    percent,
    grade,
    pass: percent + 1e-9 >= passPercent,
  };
}

export interface ExamRollup {
  scored: number;
  maximum: number;
  percent: number;
  grade: string;
  failed: number;
  absent: number;
  pass: boolean;
}

export function rollupExam(rows: SubjectResult[], scale: GradeBand[], passPercent: number): ExamRollup {
  let scored = 0;
  let maximum = 0;
  let failed = 0;
  let absent = 0;
  for (const row of rows) {
    if (row.absent || row.marks === null) {
      absent += 1;
      failed += 1;
      continue;
    }
    scored += row.marks;
    maximum += row.max;
    if (!row.pass) failed += 1;
  }
  const percent = maximum === 0 ? 0 : Math.round((scored / maximum) * 1000) / 10;
  return {
    scored,
    maximum,
    percent,
    grade: gradeFor(percent, scale).grade,
    failed,
    absent,
    pass: failed === 0 && rows.length > 0 && percent + 1e-9 >= passPercent,
  };
}

export function feeStatus(input: {
  due: number;
  paid: number;
  concession: number;
  dueDate: string;
  today: string;
  cancelled?: boolean;
}): FeeState {
  if (input.cancelled) return "cancelled";
  if (input.due > 0 && input.concession >= input.due) return "waived";
  const covered = input.paid + input.concession;
  if (covered + 1e-9 >= input.due) return "paid";
  if (input.today > input.dueDate) return "overdue";
  if (input.paid > 0) return "partial";
  return "pending";
}

export function outstanding(due: number, paid: number, concession: number): number {
  return Math.max(0, Math.round((due - paid - concession) * 100) / 100);
}

export interface SlotRef {
  id: string;
  teacherId: string;
  roomId: string;
  sectionId: string;
  day: number;
  periodId: string;
  subjectId: string;
}

export interface TimetableConflict {
  code: "teacher" | "room" | "section";
  message: string;
  ids: string[];
}

export function timetableConflicts(entries: SlotRef[]): TimetableConflict[] {
  const conflicts: TimetableConflict[] = [];
  const seen = {
    teacher: new Map<string, string>(),
    room: new Map<string, string>(),
    section: new Map<string, string>(),
  };
  for (const entry of entries) {
    const pairs: [keyof typeof seen, string, TimetableConflict["code"], string][] = [
      ["teacher", `${entry.teacherId}|${entry.day}|${entry.periodId}`, "teacher", "Teacher is already booked in this period."],
      ["room", `${entry.roomId}|${entry.day}|${entry.periodId}`, "room", "Classroom is already booked in this period."],
      ["section", `${entry.sectionId}|${entry.day}|${entry.periodId}`, "section", "This class already has a period in this slot."],
    ];
    for (const [bucket, key, code, message] of pairs) {
      const prev = seen[bucket].get(key);
      if (prev) conflicts.push({ code, message, ids: [prev, entry.id] });
      else seen[bucket].set(key, entry.id);
    }
  }
  return conflicts;
}

export interface RiskInput {
  attendancePct: number;
  eligibleSessions: number;
  failedSubjects: number;
  markDrop: number | null;
  missingAssignments: number;
  threshold?: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  indicators: string[];
  suggestions: string[];
}

export function assessRisk(input: RiskInput): RiskAssessment {
  const threshold = input.threshold ?? 75;
  const indicators: string[] = [];
  const suggestions: string[] = [];
  const lowAttendance = input.eligibleSessions > 0 && input.attendancePct < threshold;
  const veryLow = input.eligibleSessions > 0 && input.attendancePct < 60;
  if (veryLow) {
    indicators.push(`Attendance is ${input.attendancePct}%, below 60%.`);
    suggestions.push("Discuss attendance with the student and family. This is support, not a sanction.");
  } else if (lowAttendance) {
    indicators.push(`Attendance is ${input.attendancePct}%, below the ${threshold}% school threshold.`);
    suggestions.push("Review recent absences and agree a short attendance plan.");
  }
  if (input.failedSubjects >= 2) {
    indicators.push(
      `${input.failedSubjects} subjects are below the passing mark in the latest published examination.`,
    );
    suggestions.push("Arrange subject revision and a teacher follow-up.");
  } else if (input.failedSubjects === 1) {
    indicators.push("1 subject is below the passing mark in the latest published examination.");
    suggestions.push("Offer focused practice in the subject below the passing mark.");
  }
  const declining = input.markDrop !== null && input.markDrop <= -10;
  if (declining) {
    indicators.push(
      `Average marks fell by ${Math.abs(input.markDrop ?? 0)} points from the previous published examination.`,
    );
    suggestions.push("Compare the two papers with the student and pick two topics to revise.");
  }
  if (input.missingAssignments >= 2) {
    indicators.push(`${input.missingAssignments} assignments are past the deadline and not submitted.`);
    suggestions.push("Help the student plan the missing work before the next deadline.");
  }
  const high =
    veryLow || input.failedSubjects >= 2 || (lowAttendance && declining);
  if (high) return { level: "high", indicators, suggestions };
  if (indicators.length > 0) return { level: "moderate", indicators, suggestions };
  return {
    level: "low",
    indicators: ["No support flag on the current rules."],
    suggestions: ["No intervention suggested. Continue routine monitoring."],
  };
}

export interface CsvContext {
  classes: { id: string; name: string }[];
  sections: { id: string; classId: string; name: string }[];
  admissions: Set<string>;
}

export interface CsvRow {
  line: number;
  firstName: string;
  lastName: string;
  dob: string;
  gender: "Female" | "Male";
  classId: string;
  sectionId: string;
  roll: number;
  admissionNo: string;
  phone: string;
  address: string;
  city: string;
}

export interface CsvReport {
  accepted: CsvRow[];
  errors: { line: number; message: string }[];
}

function parseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const time = Date.parse(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(time)) return null;
  return trimmed;
}

export function parseStudentCsv(text: string, ctx: CsvContext): CsvReport {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  const report: CsvReport = { accepted: [], errors: [] };
  if (lines.length === 0) {
    report.errors.push({ line: 1, message: "The file is empty." });
    return report;
  }
  const header = lines[0].split(",").map((cell) => cell.trim().toLowerCase());
  const required = ["first_name", "last_name", "dob", "class", "section"];
  for (const column of required) {
    if (!header.includes(column)) {
      report.errors.push({ line: 1, message: `Missing required column ${column}.` });
    }
  }
  if (report.errors.length) return report;
  const index = (name: string) => header.indexOf(name);
  const seen = new Set(ctx.admissions);
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((cell) => cell.trim());
    const line = i + 1;
    const firstName = cells[index("first_name")] ?? "";
    const lastName = cells[index("last_name")] ?? "";
    const dob = parseDate(cells[index("dob")] ?? "");
    const className = cells[index("class")] ?? "";
    const sectionName = cells[index("section")] ?? "";
    if (!firstName || !lastName) {
      report.errors.push({ line, message: "First and last name are required." });
      continue;
    }
    if (!dob) {
      report.errors.push({ line, message: "Date of birth must be YYYY-MM-DD." });
      continue;
    }
    const klass = ctx.classes.find((item) => item.name.toLowerCase() === className.toLowerCase());
    if (!klass) {
      report.errors.push({ line, message: `Unknown class “${className}”.` });
      continue;
    }
    const section = ctx.sections.find(
      (item) => item.classId === klass.id && item.name.toLowerCase() === sectionName.toLowerCase(),
    );
    if (!section) {
      report.errors.push({ line, message: `Unknown section “${sectionName}” for ${klass.name}.` });
      continue;
    }
    const admissionNo = (cells[index("admission_no")] ?? "").trim();
    if (admissionNo && seen.has(admissionNo)) {
      report.errors.push({ line, message: `Duplicate admission number ${admissionNo}.` });
      continue;
    }
    if (admissionNo) seen.add(admissionNo);
    const genderRaw = (cells[index("gender")] ?? "Female").toLowerCase();
    const gender: "Female" | "Male" = genderRaw.startsWith("m") ? "Male" : "Female";
    const roll = Number(cells[index("roll")] ?? "0");
    report.accepted.push({
      line,
      firstName,
      lastName,
      dob,
      gender,
      classId: klass.id,
      sectionId: section.id,
      roll: Number.isFinite(roll) && roll > 0 ? roll : 0,
      admissionNo,
      phone: cells[index("phone")] ?? "",
      address: cells[index("address")] ?? "",
      city: cells[index("city")] ?? "",
    });
  }
  return report;
}

export function canAccessSchool(role: string, userSchoolId: string | null, targetSchoolId: string): boolean {
  if (role === "super_admin") return true;
  return userSchoolId === targetSchoolId;
}

export function isWeekday(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

export function schoolDays(from: string, to: string, holidays: string[]): string[] {
  const skip = new Set(holidays);
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    if (isWeekday(iso) && !skip.has(iso)) days.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export function tuitionForOrder(order: number): number {
  if (order <= 5) return 18000;
  if (order <= 8) return 24000;
  if (order <= 10) return 28000;
  return 34000;
}

export function inr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}
