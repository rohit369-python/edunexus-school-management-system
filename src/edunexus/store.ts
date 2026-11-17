import { create } from "zustand";
import type {
  Announcement,
  Assignment,
  AttendanceStatus,
  CalendarEvent,
  ClassGrade,
  Delta,
  DirectMessage,
  Homework,
  Intervention,
  Loan,
  Payment,
  School,
  Section,
  Student,
  Subject,
  Teacher,
  TimetableEntry,
} from "./types";

export const emptyDelta = (): Delta => ({
  studentPatches: {},
  studentsAdded: [],
  parentsAdded: [],
  guardiansAdded: [],
  attendance: {},
  marks: {},
  publishedExamIds: [],
  payments: [],
  concessions: {},
  cancelledInvoices: [],
  homeworkAdded: [],
  homeworkArchived: [],
  submissions: {},
  loansAdded: [],
  loansReturned: {},
  announcements: [],
  notifications: [],
  interventions: [],
  chats: [],
  messages: [],
  events: [],
  timetableEdits: {},
  classesAdded: [],
  sectionsAdded: [],
  subjectsAdded: [],
  classSubjectAdded: [],
  teachersAdded: [],
  teacherPatches: {},
  assignmentsAdded: [],
  audit: [],
  examsAdded: [],
});

const KEY = "edunexus-delta-v1";
const SESSION = "edunexus-session-v1";

interface EduState {
  ready: boolean;
  userId: string | null;
  schoolId: string;
  view: string;
  childId: string | null;
  delta: Delta;
  boot: () => void;
  login: (userId: string, schoolId: string | null) => void;
  logout: () => void;
  setSchool: (schoolId: string) => void;
  setView: (view: string) => void;
  setChild: (id: string) => void;
  patch: (recipe: (delta: Delta) => void, audit?: { actor: string; action: string; detail: string }) => void;
  reset: () => void;
}

function persist(delta: Delta, userId: string | null) {
  try {
    localStorage.setItem(KEY, JSON.stringify(delta));
    if (userId) localStorage.setItem(SESSION, userId);
    else localStorage.removeItem(SESSION);
  } catch {
    /* demo storage can fill; the session still works in memory */
  }
}

export const useEdu = create<EduState>((set, get) => ({
  ready: false,
  userId: null,
  schoolId: "ais",
  view: "overview",
  childId: null,
  delta: emptyDelta(),
  boot: () => {
    if (get().ready) return;
    let delta = emptyDelta();
    let userId: string | null = null;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) delta = { ...emptyDelta(), ...JSON.parse(raw) };
      userId = localStorage.getItem(SESSION);
    } catch {
      delta = emptyDelta();
    }
    set({ ready: true, delta, userId });
  },
  login: (userId, schoolId) => {
    set({ userId, schoolId: schoolId ?? get().schoolId, view: "overview", childId: null });
    persist(get().delta, userId);
  },
  logout: () => {
    set({ userId: null, view: "overview", childId: null });
    persist(get().delta, null);
  },
  setSchool: (schoolId) => set({ schoolId, view: "overview", childId: null }),
  setView: (view) => set({ view }),
  setChild: (childId) => set({ childId }),
  patch: (recipe, audit) => {
    const delta = structuredClone(get().delta);
    recipe(delta);
    if (audit) {
      delta.audit.unshift({
        id: `aud-${Date.now()}`,
        at: new Date().toISOString(),
        actor: audit.actor,
        action: audit.action,
        detail: audit.detail,
      });
    }
    set({ delta });
    persist(delta, get().userId);
  },
  reset: () => {
    const delta = emptyDelta();
    set({ delta });
    persist(delta, get().userId);
  },
}));

export type { Announcement, Assignment, AttendanceStatus, CalendarEvent, ClassGrade, DirectMessage, Homework, Intervention, Loan, Payment, School, Section, Student, Subject, Teacher, TimetableEntry };
