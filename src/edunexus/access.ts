import type { Role, Student, UserAccount } from "./types";

export type Permission =
  | "students.view"
  | "students.manage"
  | "students.sensitive"
  | "teachers.view"
  | "teachers.manage"
  | "attendance.mark"
  | "attendance.view"
  | "marks.enter"
  | "results.publish"
  | "results.view"
  | "exams.manage"
  | "fees.manage"
  | "fees.pay"
  | "fees.view"
  | "homework.manage"
  | "homework.view"
  | "library.manage"
  | "announcements.manage"
  | "ai.student"
  | "ai.teacher"
  | "risk.view"
  | "risk.act"
  | "timetable.manage"
  | "academics.manage"
  | "settings.manage"
  | "messages.use";

const MATRIX: Record<Role, Permission[]> = {
  super_admin: [
    "students.view", "students.manage", "students.sensitive", "teachers.view", "teachers.manage",
    "attendance.mark", "attendance.view", "marks.enter", "results.publish", "results.view",
    "exams.manage", "fees.manage", "fees.view", "homework.manage", "homework.view", "library.manage",
    "announcements.manage", "risk.view", "risk.act", "timetable.manage", "academics.manage",
    "settings.manage", "messages.use",
  ],
  school_admin: [
    "students.view", "students.manage", "students.sensitive", "teachers.view", "teachers.manage",
    "attendance.mark", "attendance.view", "marks.enter", "results.publish", "results.view",
    "exams.manage", "fees.manage", "fees.view", "homework.manage", "homework.view", "library.manage",
    "announcements.manage", "risk.view", "risk.act", "timetable.manage", "academics.manage",
    "settings.manage", "messages.use",
  ],
  principal: [
    "students.view", "students.sensitive", "teachers.view", "attendance.view", "results.publish",
    "results.view", "exams.manage", "fees.view", "homework.view", "announcements.manage", "risk.view",
    "timetable.manage", "academics.manage", "messages.use",
  ],
  coordinator: [
    "students.view", "students.sensitive", "teachers.view", "attendance.view", "results.view",
    "exams.manage", "homework.view", "announcements.manage", "risk.view", "timetable.manage",
    "academics.manage", "messages.use",
  ],
  teacher: [
    "students.view", "students.sensitive", "attendance.mark", "attendance.view", "marks.enter",
    "results.view", "homework.manage", "homework.view", "announcements.manage", "ai.teacher",
    "risk.view", "risk.act", "messages.use",
  ],
  student: ["attendance.view", "results.view", "homework.view", "ai.student"],
  parent: ["students.view", "attendance.view", "results.view", "fees.pay", "fees.view", "homework.view", "messages.use"],
  accountant: ["students.view", "fees.manage", "fees.view"],
  librarian: ["library.manage", "students.view"],
  receptionist: ["students.view", "announcements.manage"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function navFor(role: Role): string[] {
  const items = ["overview"];
  if (can(role, "students.view")) items.push("students");
  if (can(role, "teachers.view")) items.push("teachers");
  if (can(role, "academics.manage")) items.push("academics");
  if (can(role, "attendance.view") || can(role, "attendance.mark")) items.push("attendance");
  items.push("timetable");
  if (can(role, "results.view") || can(role, "marks.enter") || can(role, "exams.manage")) items.push("exams");
  if (can(role, "fees.view") || can(role, "fees.manage") || can(role, "fees.pay")) items.push("fees");
  if (can(role, "homework.view") || can(role, "homework.manage")) items.push("homework");
  if (can(role, "risk.view")) items.push("insights");
  if (can(role, "ai.student") || can(role, "ai.teacher")) items.push("assistant");
  if (role === "librarian" || role === "student" || role === "teacher" || role === "school_admin" || role === "principal") {
    items.push("library");
  }
  items.push("calendar", "announcements");
  if (can(role, "messages.use")) items.push("messages");
  if (can(role, "settings.manage") || role === "super_admin") items.push("settings");
  return items;
}

export function linkedStudentIds(user: UserAccount, links: { studentId: string; parentId: string; primary?: boolean }[]): string[] {
  if (user.role === "student" && user.studentId) return [user.studentId];
  if (user.role === "parent" && user.parentId) {
    return links.filter((link) => link.parentId === user.parentId && link.primary).map((link) => link.studentId);
  }
  return [];
}

export function studentVisibleTo(user: UserAccount, student: Student, links: { studentId: string; parentId: string; primary?: boolean }[], teacherSectionIds: string[]): boolean {
  if (user.schoolId && user.schoolId !== student.schoolId && user.role !== "super_admin") return false;
  if (user.role === "student") return user.studentId === student.id;
  if (user.role === "parent") return linkedStudentIds(user, links).includes(student.id);
  if (user.role === "teacher") return teacherSectionIds.includes(student.sectionId);
  if (user.role === "accountant" || user.role === "receptionist" || user.role === "librarian") return user.schoolId === student.schoolId;
  return user.role === "super_admin" || user.schoolId === student.schoolId;
}
