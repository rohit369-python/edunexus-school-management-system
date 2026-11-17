import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  GraduationCap,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  MessageSquare,
  NotebookPen,
  Settings,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { linkedStudentIds, navFor, studentVisibleTo } from "./access";
import { AcademicsPage, AttendancePage, Overview, StudentsPage, TeachersPage } from "./pages-a";
import {
  AnnouncementsPage,
  AssistantPage,
  CalendarPage,
  ExamsPage,
  FeesPage,
  HomeworkPage,
  InsightsPage,
  LibraryPage,
  MessagesPage,
  SettingsPage,
  TimetablePage,
} from "./pages-b";
import { ScreenProvider } from "./screen";
import { activeStudents, bundleOf, teacherSections } from "./selectors";
import { getWorld } from "./seed";
import { useEdu } from "./store";
import type { Role } from "./types";
import { Btn, control } from "./ui";

const NAV: Record<string, { label: string; icon: typeof Users }> = {
  overview: { label: "Overview", icon: LayoutDashboard },
  students: { label: "Students", icon: Users },
  teachers: { label: "Teachers", icon: GraduationCap },
  academics: { label: "Academics", icon: BookOpen },
  attendance: { label: "Attendance", icon: CalendarCheck },
  timetable: { label: "Timetable", icon: CalendarDays },
  exams: { label: "Exams", icon: NotebookPen },
  fees: { label: "Fees", icon: Wallet },
  homework: { label: "Homework", icon: BookOpen },
  insights: { label: "Support", icon: ChartColumn },
  assistant: { label: "Assistant", icon: Sparkles },
  library: { label: "Library", icon: Library },
  calendar: { label: "Calendar", icon: CalendarDays },
  announcements: { label: "Notices", icon: Bell },
  messages: { label: "Messages", icon: MessageSquare },
  settings: { label: "Settings", icon: Settings },
};

const DEMOS: { email: string; password: string; label: string }[] = [
  { email: "admin@edunexus.school", password: "Admin#2026", label: "School admin" },
  { email: "teacher@edunexus.school", password: "Teacher#2026", label: "Teacher" },
  { email: "student@edunexus.school", password: "Student#2026", label: "Student" },
  { email: "parent@edunexus.school", password: "Parent#2026", label: "Parent" },
  { email: "principal@edunexus.school", password: "Principal#2026", label: "Principal" },
  { email: "accounts@edunexus.school", password: "Accounts#2026", label: "Accountant" },
  { email: "coord@edunexus.school", password: "Coord#2026", label: "Coordinator" },
  { email: "library@edunexus.school", password: "Library#2026", label: "Librarian" },
  { email: "front@edunexus.school", password: "Front#2026", label: "Front desk" },
  { email: "super@edunexus.school", password: "Super#2026", label: "Super admin" },
];

function roleTitle(role: Role): string {
  return role.replaceAll("_", " ");
}

export function EduApp() {
  const ready = useEdu((state) => state.ready);
  const boot = useEdu((state) => state.boot);
  const userId = useEdu((state) => state.userId);
  const schoolId = useEdu((state) => state.schoolId);
  const view = useEdu((state) => state.view);
  const delta = useEdu((state) => state.delta);
  const childId = useEdu((state) => state.childId);
  const login = useEdu((state) => state.login);
  const logout = useEdu((state) => state.logout);
  const setView = useEdu((state) => state.setView);
  const setChild = useEdu((state) => state.setChild);
  const patch = useEdu((state) => state.patch);
  const world = useMemo(() => getWorld(), []);

  useEffect(() => {
    boot();
  }, [boot]);

  if (!ready) {
    return (
      <main className="grid min-h-dvh place-items-center bg-paper px-6">
        <p className="font-display text-3xl text-ink">EduNexus</p>
      </main>
    );
  }

  const user = world.users.find((item) => item.id === userId && item.active);
  if (!user) return <Login onLogin={(email, password) => {
    const found = world.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase() && item.password === password && item.active);
    if (!found) return "Those details do not match a demo account.";
    login(found.id, found.schoolId);
    return null;
  }} />;

  const activeSchool = user.role === "super_admin" ? schoolId : user.schoolId ?? "ais";
  const bundle = bundleOf(world, activeSchool);
  const links = [...bundle.guardians, ...delta.guardiansAdded];
  const sections = user.teacherId ? teacherSections(bundle, delta, user.teacherId) : [];
  const everyone = activeStudents(bundle, delta);
  const students = everyone.filter((student) => studentVisibleTo(user, student, links, sections));
  const linked = linkedStudentIds(user, links);
  const focus = students.find((student) => student.id === (childId ?? linked[0])) ?? students[0] ?? null;
  const notices = delta.notifications.filter((item) => item.userId === user.id && !item.read);

  const pages: Record<string, React.ReactNode> = {
    overview: <Overview />,
    students: <StudentsPage />,
    teachers: <TeachersPage />,
    academics: <AcademicsPage />,
    attendance: <AttendancePage />,
    timetable: <TimetablePage />,
    exams: <ExamsPage />,
    fees: <FeesPage />,
    homework: <HomeworkPage />,
    insights: <InsightsPage />,
    assistant: <AssistantPage />,
    library: <LibraryPage />,
    calendar: <CalendarPage />,
    announcements: <AnnouncementsPage />,
    messages: <MessagesPage />,
    settings: <SettingsPage />,
  };
  const allowed = navFor(user.role);
  const current = allowed.includes(view) ? view : "overview";

  return (
    <ScreenProvider value={{ world, bundle, delta, user, students: focus && (user.role === "student" || user.role === "parent") ? students : students, focus, setView, setChild, patch }}>
      <Shell
        name={user.name}
        role={roleTitle(user.role)}
        school={bundle.school.name}
        notices={notices.length}
        items={allowed}
        current={current}
        onNavigate={setView}
        onLogout={logout}
        onRead={() => patch((draft) => { draft.notifications.forEach((item) => { if (item.userId === user.id) item.read = true; }); })}
        childSwitcher={user.role === "parent" ? students : []}
        childId={focus?.id ?? ""}
        onChild={setChild}
      >
        {pages[current]}
      </Shell>
    </ScreenProvider>
  );
}

function Login({ onLogin }: { onLogin: (email: string, password: string) => string | null }) {
  const [email, setEmail] = useState("admin@edunexus.school");
  const [password, setPassword] = useState("Admin#2026");
  const [error, setError] = useState("");
  return (
    <main className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section className="hidden flex-col justify-between bg-teal-deep px-10 py-10 text-card lg:flex">
        <p className="font-display text-3xl">EduNexus</p>
        <div>
          <h1 className="max-w-md text-5xl leading-tight">The school day, held in one place.</h1>
          <p className="mt-4 max-w-md text-foam">Attendance, exams, fees, homework, and support notes for a fictional Ahmedabad school. Session 2026–27.</p>
        </div>
        <p className="text-sm text-foam">No real children. Demo passwords are for this preview only.</p>
      </section>
      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <p className="font-display text-3xl text-ink lg:hidden">EduNexus</p>
        <h2 className="mt-2 text-3xl text-ink">Sign in</h2>
        <form className="mt-6 max-w-md space-y-3" onSubmit={(event) => {
          event.preventDefault();
          setError(onLogin(email, password) ?? "");
        }}>
          <label className="block text-sm font-medium text-ink-soft">Email
            <input className={`${control} mt-1`} autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-ink-soft">Password
            <input className={`${control} mt-1`} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? <p className="text-sm text-clay">{error}</p> : null}
          <Btn type="submit" className="w-full">Enter school</Btn>
        </form>
        <div className="mt-8 grid max-w-xl grid-cols-2 gap-2 sm:grid-cols-3">
          {DEMOS.map((demo) => (
            <button key={demo.email} type="button" className="min-h-11 rounded-2xl border border-line bg-card px-3 py-2 text-left text-sm hover:border-teal" onClick={() => { setEmail(demo.email); setPassword(demo.password); setError(""); }}>
              <span className="block font-semibold text-ink">{demo.label}</span>
              <span className="text-xs text-muted">{demo.email}</span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function Shell({
  name, role, school, notices, items, current, onNavigate, onLogout, onRead, children, childSwitcher, childId, onChild,
}: {
  name: string;
  role: string;
  school: string;
  notices: number;
  items: string[];
  current: string;
  onNavigate: (view: string) => void;
  onLogout: () => void;
  onRead: () => void;
  children: React.ReactNode;
  childSwitcher: { id: string; firstName: string }[];
  childId: string;
  onChild: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const nav = (
    <nav className="flex flex-col gap-1">
      {items.map((id) => {
        const item = NAV[id];
        const Icon = item.icon;
        const active = id === current;
        return (
          <button key={id} type="button" onClick={() => { onNavigate(id); setOpen(false); }} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium ${active ? "bg-teal text-card" : "text-ink-soft hover:bg-paper-2"}`}>
            <Icon className="size-4" /> {item.label}
          </button>
        );
      })}
    </nav>
  );
  return (
    <div className="min-h-dvh bg-paper text-ink lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="no-print hidden border-r border-line bg-card px-4 py-6 lg:block">
        <p className="font-display text-2xl text-ink">EduNexus</p>
        <p className="mt-1 text-xs text-muted">{school}</p>
        <div className="mt-6">{nav}</div>
      </aside>
      <div className="min-w-0">
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <button type="button" className="grid size-11 place-items-center rounded-full border border-line lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></button>
            <div>
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-xs capitalize text-muted">{role}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {childSwitcher.length > 1 ? (
              <select className="min-h-11 rounded-full border border-line bg-card px-3 text-sm" value={childId} onChange={(event) => onChild(event.target.value)} aria-label="Choose child">
                {childSwitcher.map((child) => <option key={child.id} value={child.id}>{child.firstName}</option>)}
              </select>
            ) : null}
            <button type="button" className="relative grid size-11 place-items-center rounded-full border border-line bg-card" aria-label="Notifications" onClick={() => { setBell((value) => !value); onRead(); }}>
              <Bell className="size-4" />
              {notices > 0 ? <span className="absolute right-2 top-2 size-2 rounded-full bg-clay" /> : null}
            </button>
            <button type="button" className="grid size-11 place-items-center rounded-full border border-line bg-card" onClick={onLogout} aria-label="Sign out"><LogOut className="size-4" /></button>
          </div>
        </header>
        {bell ? <p className="no-print border-b border-line bg-foam px-4 py-2 text-sm text-teal-deep">{notices > 0 ? "New notices were marked read." : "No new notices. Absence alerts appear here for linked parents."}</p> : null}
        <div className="px-4 py-5 sm:px-6">{children}</div>
      </div>
      {open ? (
        <div className="no-print fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-72 overflow-auto bg-card p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <p className="font-display text-2xl">EduNexus</p>
              <button type="button" className="grid size-11 place-items-center" onClick={() => setOpen(false)} aria-label="Close menu"><X className="size-5" /></button>
            </div>
            {nav}
          </div>
        </div>
      ) : null}
    </div>
  );
}
