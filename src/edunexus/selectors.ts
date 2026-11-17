import {
  assessRisk,
  feeStatus,
  hashUnit,
  outstanding,
  rollupExam,
  schoolDays,
  subjectResult,
  summarizeAttendance,
  timetableConflicts,
} from "./engine";
import type { ExamRollup, RiskAssessment, SlotRef, SubjectResult } from "./engine";
import type { AttendanceStatus, Delta, SchoolBundle, Student, UserAccount, World } from "./types";

export function bundleOf(world: World, schoolId: string): SchoolBundle {
  const bundle = world.bundles.find((item) => item.school.id === schoolId);
  if (!bundle) throw new Error("Unknown school");
  return bundle;
}

export function activeStudents(bundle: SchoolBundle, delta: Delta): Student[] {
  const patched = bundle.students.map((student) => ({ ...student, ...delta.studentPatches[student.id] }));
  return [...patched, ...delta.studentsAdded.filter((student) => student.schoolId === bundle.school.id)];
}

export function className(bundle: SchoolBundle, delta: Delta, classId: string): string {
  return (
    bundle.classes.find((item) => item.id === classId)?.name ??
    delta.classesAdded.find((item) => item.id === classId)?.name ??
    "Class"
  );
}

export function sectionName(bundle: SchoolBundle, delta: Delta, sectionId: string): string {
  return (
    bundle.sections.find((item) => item.id === sectionId)?.name ??
    delta.sectionsAdded.find((item) => item.id === sectionId)?.name ??
    ""
  );
}

export function subjectName(bundle: SchoolBundle, delta: Delta, subjectId: string): string {
  return (
    bundle.subjects.find((item) => item.id === subjectId)?.name ??
    delta.subjectsAdded.find((item) => item.id === subjectId)?.name ??
    "Subject"
  );
}

export function isHoliday(bundle: SchoolBundle, iso: string): boolean {
  return bundle.holidays.includes(iso);
}

export function profileFlags(student: Student): { lowAttendance: boolean; declining: boolean; missWork: boolean } {
  return {
    lowAttendance: student.series % 13 === 0,
    declining: student.series % 11 === 0,
    missWork: student.series % 11 === 0,
  };
}

export function rawAttendance(student: Student, iso: string, bundle: SchoolBundle, delta: Delta): AttendanceStatus | null {
  if (isHoliday(bundle, iso)) return null;
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  if (day === 0 || day === 6) return null;
  const edited = delta.attendance[`${student.id}|${iso}`];
  if (edited) return edited.status;
  if (iso >= "2026-11-17") return null;
  if (iso < "2026-10-01") return null;
  const flags = profileFlags(student);
  const roll = hashUnit(`${student.id}|${iso}|att`);
  if (flags.lowAttendance) {
    if (roll < 0.34) return "absent";
    if (roll < 0.42) return "late";
    return "present";
  }
  if (roll < 0.03) return "absent";
  if (roll < 0.06) return "late";
  if (roll < 0.08) return "half_day";
  if (roll < 0.09) return "leave";
  return "present";
}

export function attendanceRows(student: Student, bundle: SchoolBundle, delta: Delta) {
  return schoolDays("2026-10-01", "2026-11-16", bundle.holidays)
    .map((iso) => ({ date: iso, status: rawAttendance(student, iso, bundle, delta) }))
    .filter((row): row is { date: string; status: AttendanceStatus } => row.status !== null);
}

export function attendanceOf(student: Student, bundle: SchoolBundle, delta: Delta, world: World) {
  return summarizeAttendance(attendanceRows(student, bundle, delta), delta.policy ?? world.policy);
}

export function publishedExams(bundle: SchoolBundle, delta: Delta) {
  const extra = new Set(delta.publishedExamIds);
  return [...bundle.exams, ...delta.examsAdded.filter((exam) => exam.schoolId === bundle.school.id)].map((exam) =>
    extra.has(exam.id) ? { ...exam, status: "published" as const } : exam,
  );
}

export function examVisible(status: string, role: string): boolean {
  if (status === "published") return true;
  return role !== "student" && role !== "parent";
}

export function syntheticMark(student: Student, examId: string, subjectId: string, max: number): number | null {
  const code = examId.endsWith("fin") ? "FIN" : examId.endsWith("mid") ? "MID" : "UT1";
  if (code === "FIN") return null;
  const flags = profileFlags(student);
  if (flags.declining && code === "MID" && hashUnit(subjectId) < 0.18) return null;
  let strength = 0.48 + ((student.series * 17) % 100) / 100 * 0.42;
  strength += (hashUnit(`${student.id}|${subjectId}`) - 0.5) * 0.16;
  if (flags.declining && code === "MID") strength -= 0.2;
  if (flags.declining && code === "UT1") strength -= 0.02;
  if (!flags.declining && code === "MID") strength += 0.03;
  strength = Math.min(0.98, Math.max(0.18, strength));
  return Math.round(strength * max);
}

export function markFor(student: Student, examId: string, subjectId: string, max: number, delta: Delta) {
  const edit = delta.marks[`${student.id}|${examId}|${subjectId}`];
  if (edit) return { marks: edit.marks, state: edit.state, absent: edit.marks === null };
  const marks = syntheticMark(student, examId, subjectId, max);
  if (examId.endsWith("fin")) return { marks: null, state: "official" as const, absent: false };
  return { marks, state: "official" as const, absent: marks === null };
}

export function subjectsForOrder(order: number, section: string): string[] {
  if (order <= 5) return ["English", "Hindi", "Mathematics", "EVS", "Computer", "Gujarati"];
  if (order <= 8) return ["English", "Hindi", "Mathematics", "Science", "Social Science", "Computer", "Gujarati"];
  if (order <= 10) return ["English", "Hindi", "Mathematics", "Science", "Social Science", "Computer"];
  if (section === "A") return ["English", "Physics", "Chemistry", "Biology", "Mathematics"];
  return ["English", "Accountancy", "Business Studies", "Economics", "Mathematics"];
}

export function sectionSubjects(bundle: SchoolBundle, delta: Delta, sectionId: string): string[] {
  const section = [...bundle.sections, ...delta.sectionsAdded].find((item) => item.id === sectionId);
  if (!section) return [];
  const klass = [...bundle.classes, ...delta.classesAdded].find((item) => item.id === section.classId);
  if (!klass) return [];
  const names = subjectsForOrder(klass.order, section.name);
  const fromSeed = bundle.subjects.filter((subject) => names.includes(subject.name)).map((subject) => subject.id);
  const added = delta.classSubjectAdded.filter((item) => item.classId === klass.id).map((item) => item.subjectId);
  return [...new Set([...fromSeed, ...added])];
}

export function resultsFor(student: Student, examId: string, bundle: SchoolBundle, delta: Delta, world: World): {
  rows: SubjectResult[];
  roll: ExamRollup;
} {
  const exam = publishedExams(bundle, delta).find((item) => item.id === examId);
  const max = exam?.maxMarks ?? 100;
  const scale = delta.gradeScale ?? world.gradeScale;
  const rows = sectionSubjects(bundle, delta, student.sectionId).map((subjectId) => {
    const got = markFor(student, examId, subjectId, max, delta);
    const row = subjectResult(got.absent ? null : got.marks, max, 33, scale);
    return { ...row, subjectId };
  });
  return { rows, roll: rollupExam(rows, scale, 33) };
}

export function rankInSection(student: Student, examId: string, bundle: SchoolBundle, delta: Delta, world: World): number | null {
  const peers = activeStudents(bundle, delta).filter((item) => item.sectionId === student.sectionId && item.status === "active");
  const scored = peers
    .map((peer) => ({ id: peer.id, percent: resultsFor(peer, examId, bundle, delta, world).roll.percent }))
    .sort((a, b) => b.percent - a.percent);
  const mine = scored.find((item) => item.id === student.id);
  if (!mine) return null;
  return scored.filter((item) => item.percent > mine.percent).length + 1;
}

export function invoiceView(student: Student, bundle: SchoolBundle, delta: Delta, world: World) {
  const invoice = bundle.invoices.find((item) => item.studentId === student.id);
  if (!invoice) return null;
  const due = invoice.items.reduce((sum, item) => sum + item.amount, 0);
  const concession = delta.concessions[invoice.id] ?? invoice.concession;
  const paid = [...bundle.payments, ...delta.payments]
    .filter((payment) => payment.invoiceId === invoice.id && payment.status === "success")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const cancelled = delta.cancelledInvoices.includes(invoice.id) || Boolean(invoice.cancelled);
  const status = feeStatus({ due, paid, concession, dueDate: invoice.dueDate, today: world.today, cancelled });
  return { invoice, due, paid, concession, balance: outstanding(due, paid, concession), status };
}

export function homeworkState(homeworkId: string, student: Student, due: string, delta: Delta, world: World) {
  const saved = delta.submissions[`${homeworkId}|${student.id}`];
  if (saved) return saved;
  if (due >= world.today) return null;
  if (profileFlags(student).missWork && homeworkId.endsWith("hw-1")) return null;
  return {
    homeworkId,
    studentId: student.id,
    text: "Submitted in class notebook.",
    at: "2026-11-09T16:00:00",
    state: "submitted" as const,
  };
}

export function studentRisk(student: Student, bundle: SchoolBundle, delta: Delta, world: World): RiskAssessment & {
  attendancePct: number;
  markDrop: number | null;
  missing: number;
} {
  const attendance = attendanceOf(student, bundle, delta, world);
  const exams = publishedExams(bundle, delta).filter((exam) => exam.status === "published");
  const latest = exams.find((exam) => exam.id.endsWith("mid")) ?? exams[0];
  const previous = exams.find((exam) => exam.id.endsWith("ut1"));
  const latestRoll = latest ? resultsFor(student, latest.id, bundle, delta, world).roll : null;
  const prevRoll = previous ? resultsFor(student, previous.id, bundle, delta, world).roll : null;
  const markDrop =
    latestRoll && prevRoll && latestRoll.maximum > 0 && prevRoll.maximum > 0
      ? Math.round((latestRoll.percent - prevRoll.percent) * 10) / 10
      : null;
  const missing = [...bundle.homework, ...delta.homeworkAdded]
    .filter((item) => item.sectionId === student.sectionId && !delta.homeworkArchived.includes(item.id) && item.due < world.today)
    .filter((item) => !homeworkState(item.id, student, item.due, delta, world)).length;
  const failed = latest ? resultsFor(student, latest.id, bundle, delta, world).rows.filter((row) => !row.pass).length : 0;
  const policy = delta.policy ?? world.policy;
  const assessment = assessRisk({
    attendancePct: attendance.percentage,
    eligibleSessions: attendance.eligible,
    failedSubjects: failed,
    markDrop,
    missingAssignments: missing,
    threshold: policy.threshold,
  });
  return { ...assessment, attendancePct: attendance.percentage, markDrop, missing };
}

export function allEntries(bundle: SchoolBundle, delta: Delta): SlotRef[] {
  const edited = bundle.timetable
    .filter((entry) => delta.timetableEdits[entry.id] !== null)
    .map((entry) => delta.timetableEdits[entry.id] ?? entry);
  const added = Object.entries(delta.timetableEdits)
    .filter(([id, entry]) => entry && !bundle.timetable.some((item) => item.id === id))
    .map(([, entry]) => entry!);
  return [...edited, ...added].map((entry) => ({
    id: entry.id,
    teacherId: entry.teacherId,
    roomId: entry.roomId,
    sectionId: entry.sectionId,
    day: entry.day,
    periodId: entry.periodId,
    subjectId: entry.subjectId,
  }));
}

export function conflictsFor(bundle: SchoolBundle, delta: Delta) {
  return timetableConflicts(allEntries(bundle, delta));
}

export function teacherSections(bundle: SchoolBundle, delta: Delta, teacherId: string): string[] {
  const seed = bundle.assignments.filter((item) => item.teacherId === teacherId).map((item) => item.sectionId);
  const extra = delta.assignmentsAdded.filter((item) => item.teacherId === teacherId).map((item) => item.sectionId);
  return [...new Set([...seed, ...extra])];
}

export function dayAttendanceRate(bundle: SchoolBundle, delta: Delta, world: World, iso: string): number | null {
  const students = activeStudents(bundle, delta).filter((student) => student.status === "active");
  const statuses = students
    .map((student) => rawAttendance(student, iso, bundle, delta))
    .filter((status): status is AttendanceStatus => Boolean(status));
  if (statuses.length === 0) return null;
  return summarizeAttendance(
    statuses.map((status) => ({ status })),
    delta.policy ?? world.policy,
  ).percentage;
}

export function feeTotals(bundle: SchoolBundle, delta: Delta, world: World) {
  const students = activeStudents(bundle, delta).filter((student) => student.status === "active");
  let demand = 0;
  let collected = 0;
  let outstandingSum = 0;
  const byStatus: Record<string, number> = {};
  for (const student of students) {
    const view = invoiceView(student, bundle, delta, world);
    if (!view) continue;
    demand += view.due;
    collected += view.paid;
    outstandingSum += view.balance;
    byStatus[view.status] = (byStatus[view.status] ?? 0) + 1;
  }
  return { demand, collected, outstanding: outstandingSum, byStatus, count: students.length };
}

export function userById(world: World, id: string): UserAccount | undefined {
  return world.users.find((user) => user.id === id);
}
