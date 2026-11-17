export type Role =
  | "super_admin"
  | "school_admin"
  | "principal"
  | "coordinator"
  | "teacher"
  | "student"
  | "parent"
  | "accountant"
  | "librarian"
  | "receptionist";

export type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "leave";

export type FeeState = "pending" | "partial" | "paid" | "overdue" | "waived" | "cancelled";

export type RiskLevel = "low" | "moderate" | "high";

export interface GradeBand {
  min: number;
  grade: string;
  point: number;
}

export interface AttendancePolicy {
  threshold: number;
  lateCountsAs: number;
  halfDayCountsAs: number;
  excludeApprovedLeave: boolean;
}

export interface School {
  id: string;
  name: string;
  code: string;
  city: string;
  state: string;
  board: string;
  timezone: string;
  phone: string;
  email: string;
  address: string;
}

export interface AcademicYear {
  id: string;
  schoolId: string;
  label: string;
  start: string;
  end: string;
  active: boolean;
}

export interface ClassGrade {
  id: string;
  schoolId: string;
  name: string;
  order: number;
}

export interface Section {
  id: string;
  schoolId: string;
  classId: string;
  name: string;
  roomId: string;
}

export interface Subject {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  kind: "core" | "optional" | "practical";
}

export interface Teacher {
  id: string;
  schoolId: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string;
  qualification: string;
  department: string;
  designation: string;
  joiningDate: string;
  status: "active" | "inactive";
}

export interface Assignment {
  id: string;
  schoolId: string;
  teacherId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
}

export interface Parent {
  id: string;
  schoolId: string;
  name: string;
  email: string;
  phone: string;
  occupation: string;
  relationship: string;
  address: string;
  preference: "in_app" | "email" | "sms";
}

export interface GuardianLink {
  studentId: string;
  parentId: string;
  relationship: string;
  primary: boolean;
}

export interface Student {
  id: string;
  schoolId: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: "Female" | "Male";
  classId: string;
  sectionId: string;
  roll: number;
  admissionDate: string;
  bloodGroup: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  emergencyPhone: string;
  status: "active" | "archived" | "transferred";
  parentId: string;
  series: number;
  note?: string;
}

export interface UserAccount {
  id: string;
  schoolId: string | null;
  role: Role;
  name: string;
  email: string;
  password: string;
  phone: string;
  teacherId?: string;
  studentId?: string;
  parentId?: string;
  active: boolean;
}

export interface Period {
  id: string;
  label: string;
  start: string;
  end: string;
  kind: "class" | "break";
}

export interface TimetableEntry {
  id: string;
  schoolId: string;
  sectionId: string;
  day: number;
  periodId: string;
  subjectId: string;
  teacherId: string;
  roomId: string;
}

export interface Exam {
  id: string;
  schoolId: string;
  name: string;
  type: string;
  status: "draft" | "scheduled" | "published";
  maxMarks: number;
}

export interface Homework {
  id: string;
  schoolId: string;
  classId: string;
  sectionId: string;
  subjectId: string;
  teacherId: string;
  title: string;
  description: string;
  due: string;
  maxMarks: number;
  attachment?: string;
}

export interface Book {
  id: string;
  schoolId: string;
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  category: string;
  copies: number;
}

export interface Loan {
  id: string;
  schoolId: string;
  bookId: string;
  copyNo: number;
  borrowerId: string;
  borrowerKind: "student" | "teacher";
  issuedOn: string;
  dueOn: string;
  returnedOn?: string;
}

export interface CalendarEvent {
  id: string;
  schoolId: string;
  title: string;
  date: string;
  kind: "holiday" | "exam" | "event" | "meeting" | "deadline";
  audience: "all" | "staff" | "students";
  detail: string;
}

export interface Announcement {
  id: string;
  schoolId: string;
  title: string;
  body: string;
  audience: "school" | "class" | "section";
  classId?: string;
  sectionId?: string;
  author: string;
  at: string;
}

export interface Invoice {
  id: string;
  schoolId: string;
  studentId: string;
  number: string;
  dueDate: string;
  items: { label: string; amount: number }[];
  concession: number;
  cancelled?: boolean;
}

export interface Payment {
  id: string;
  schoolId: string;
  invoiceId: string;
  studentId: string;
  amount: number;
  method: string;
  at: string;
  gatewayRef: string;
  idempotencyKey: string;
  status: "success" | "failed";
}

export interface SchoolBundle {
  school: School;
  year: AcademicYear;
  classes: ClassGrade[];
  sections: Section[];
  subjects: Subject[];
  teachers: Teacher[];
  assignments: Assignment[];
  parents: Parent[];
  guardians: GuardianLink[];
  students: Student[];
  users: UserAccount[];
  timetable: TimetableEntry[];
  exams: Exam[];
  homework: Homework[];
  books: Book[];
  loans: Loan[];
  events: CalendarEvent[];
  announcements: Announcement[];
  invoices: Invoice[];
  payments: Payment[];
  holidays: string[];
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  kind: string;
  dedupeKey: string;
}

export interface MarkEdit {
  marks: number | null;
  state: "draft" | "submitted";
  by: string;
  at: string;
}

export interface AttendanceEdit {
  status: AttendanceStatus;
  remarks: string;
  by: string;
  at: string;
  history: { status: AttendanceStatus; remarks: string; by: string; at: string }[];
}

export interface Submission {
  homeworkId: string;
  studentId: string;
  text: string;
  fileName?: string;
  at: string;
  marks?: number;
  feedback?: string;
  state: "submitted" | "late" | "evaluated" | "resubmit";
}

export interface Intervention {
  id: string;
  studentId: string;
  schoolId: string;
  note: string;
  action: string;
  status: "open" | "done";
  by: string;
  at: string;
}

export interface ChatTurn {
  id: string;
  userId: string;
  role: "user" | "assistant";
  text: string;
  at: string;
}

export interface DirectMessage {
  id: string;
  schoolId: string;
  studentId: string;
  fromName: string;
  fromRole: Role;
  body: string;
  at: string;
}

export interface AuditRow {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface Delta {
  studentPatches: Record<string, Partial<Student>>;
  studentsAdded: Student[];
  parentsAdded: Parent[];
  guardiansAdded: GuardianLink[];
  attendance: Record<string, AttendanceEdit>;
  marks: Record<string, MarkEdit>;
  publishedExamIds: string[];
  payments: Payment[];
  concessions: Record<string, number>;
  cancelledInvoices: string[];
  homeworkAdded: Homework[];
  homeworkArchived: string[];
  submissions: Record<string, Submission>;
  loansAdded: Loan[];
  loansReturned: Record<string, string>;
  announcements: Announcement[];
  notifications: AppNotification[];
  interventions: Intervention[];
  chats: ChatTurn[];
  messages: DirectMessage[];
  events: CalendarEvent[];
  timetableEdits: Record<string, TimetableEntry | null>;
  classesAdded: ClassGrade[];
  sectionsAdded: Section[];
  subjectsAdded: Subject[];
  classSubjectAdded: { classId: string; subjectId: string }[];
  teachersAdded: Teacher[];
  teacherPatches: Record<string, Partial<Teacher>>;
  assignmentsAdded: Assignment[];
  policy?: AttendancePolicy;
  gradeScale?: GradeBand[];
  schoolPatch?: Partial<School>;
  audit: AuditRow[];
  examsAdded: Exam[];
}

export interface World {
  bundles: SchoolBundle[];
  periods: Period[];
  users: UserAccount[];
  policy: AttendancePolicy;
  gradeScale: GradeBand[];
  today: string;
  clock: string;
}
