import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, BarChart, Bar } from "recharts";
import { Download, Search } from "lucide-react";
import { can, studentVisibleTo } from "./access";
import { inr, parseStudentCsv } from "./engine";
import {
  activeStudents,
  attendanceOf,
  className,
  dayAttendanceRate,
  feeTotals,
  rawAttendance,
  sectionName,
  studentRisk,
  teacherSections,
} from "./selectors";
import { useScreen } from "./screen";
import { schoolDays } from "./engine";
import { Btn, Empty, Field, Modal, Pill, Stat, control, pretty, toneFor } from "./ui";
import type { Student } from "./types";

export function Overview() {
  const { world, bundle, delta, user, students } = useScreen();
  const active = students.filter((student) => student.status === "active");
  const days = schoolDays("2026-10-01", "2026-11-16", bundle.holidays).slice(-12);
  const trend = days.map((iso) => ({
    day: iso.slice(8),
    attendance: dayAttendanceRate(bundle, delta, world, iso) ?? 0,
  }));
  const fees = feeTotals(bundle, delta, world);
  const highs = useMemo(() => {
    if (!can(user.role, "risk.view")) return [];
    return active
      .map((student) => ({ student, risk: studentRisk(student, bundle, delta, world) }))
      .filter((item) => item.risk.level !== "low")
      .sort((a, b) => (a.risk.level === "high" ? -1 : 1))
      .slice(0, 5);
  }, [active, bundle, delta, world, user.role]);
  const yesterday = dayAttendanceRate(bundle, delta, world, "2026-11-16");
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-muted">Tuesday, 17 November 2026 · school clock {world.clock}</p>
        <h1 className="mt-1 text-4xl text-ink">{bundle.school.name}</h1>
        <p className="mt-2 max-w-2xl text-ink-soft">
          Session {bundle.year.label}. {active.length} students on roll
          {user.role === "teacher" ? " in your classes" : ""}. Figures below are calculated from attendance, published exams, and fee records — not estimates.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Students" value={String(active.length)} hint={`${bundle.teachers.filter((t) => t.status === "active").length} active teachers`} />
        <Stat label="Attendance yesterday" value={yesterday === null ? "—" : `${yesterday}%`} hint="Late counts as present. Approved leave is excluded." />
        <Stat label="Fees collected" value={inr(fees.collected)} hint={`${inr(fees.outstanding)} still outstanding`} />
        <Stat label="Support flags" value={can(user.role, "risk.view") ? String(highs.length) : "—"} hint="Shown only to staff who teach or lead." />
      </div>
      <div className="grid gap-3 lg:grid-cols-5">
        <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-3">
          <h2 className="text-xl text-ink">Attendance, last school days</h2>
          <p className="text-sm text-muted">Share of eligible students marked present or late.</p>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
                <YAxis domain={[50, 100]} tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="attendance" stroke="var(--color-teal)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article className="rounded-2xl border border-line bg-card p-4 lg:col-span-2">
          <h2 className="text-xl text-ink">Fee status</h2>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={Object.entries(fees.byStatus).map(([name, count]) => ({ name, count }))}>
                <XAxis dataKey="name" tick={{ fill: "var(--color-muted)", fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="var(--color-clay)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
      {can(user.role, "risk.view") ? (
        <article className="rounded-2xl border border-line bg-card p-4">
          <h2 className="text-xl text-ink">Students who may need a conversation</h2>
          <p className="text-sm text-muted">A flag is a suggestion for staff. It is not a ranking and it does not describe character.</p>
          <ul className="mt-3 divide-y divide-line">
            {highs.length === 0 ? <li className="py-3 text-sm text-muted">No moderate or high flags in this view.</li> : null}
            {highs.map(({ student, risk }) => (
              <li key={student.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold text-ink">{student.firstName} {student.lastName}</p>
                  <p className="text-sm text-muted">{className(bundle, delta, student.classId)} {sectionName(bundle, delta, student.sectionId)} · {risk.indicators[0]}</p>
                </div>
                <Pill tone={toneFor(risk.level)}>{risk.level}</Pill>
              </li>
            ))}
          </ul>
        </article>
      ) : null}
      <article className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-xl text-ink">Announcements</h2>
        <ul className="mt-2 space-y-3">
          {[...bundle.announcements, ...delta.announcements].slice(0, 3).map((item) => (
            <li key={item.id}>
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-ink-soft">{item.body}</p>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}

export function StudentsPage() {
  const { world, bundle, delta, user, students } = useScreen();
  const [q, setQ] = useState("");
  const [classId, setClassId] = useState("all");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Student | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [importText, setImportText] = useState("");
  const [importNote, setImportNote] = useState("");
  const visible = students.filter((student) => {
    const teacherOk = user.role !== "teacher" || !user.teacherId || teacherSections(bundle, delta, user.teacherId).includes(student.sectionId);
    const links = [...bundle.guardians, ...delta.guardiansAdded];
    return teacherOk && studentVisibleTo(user, student, links, user.teacherId ? teacherSections(bundle, delta, user.teacherId) : []);
  });
  const filtered = visible.filter((student) => {
    const blob = `${student.firstName} ${student.lastName} ${student.admissionNo}`.toLowerCase();
    return (classId === "all" || student.classId === classId) && blob.includes(q.toLowerCase());
  });
  const slice = filtered.slice(page * 12, page * 12 + 12);
  const classes = [...bundle.classes, ...delta.classesAdded];
  const sensitive = can(user.role, "students.sensitive");

  function exportCsv() {
    const header = "admission_no,first_name,last_name,class,section,roll,status";
    const lines = filtered.map((student) =>
      [student.admissionNo, student.firstName, student.lastName, className(bundle, delta, student.classId), sectionName(bundle, delta, student.sectionId), student.roll, student.status].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "students.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function runImport() {
    const report = parseStudentCsv(importText, {
      classes: classes.map((item) => ({ id: item.id, name: item.name })),
      sections: [...bundle.sections, ...delta.sectionsAdded].map((item) => ({ id: item.id, classId: item.classId, name: item.name })),
      admissions: new Set(activeStudents(bundle, delta).map((student) => student.admissionNo)),
    });
    const actor = user.name;
    if (report.accepted.length) {
      useScreenAdd(report.accepted, actor);
    }
    setImportNote(
      `${report.accepted.length} row${report.accepted.length === 1 ? "" : "s"} ready to add. ${report.errors.length} rejected. ${report.errors.map((error) => `Line ${error.line}: ${error.message}`).join(" ")}`,
    );
  }

  const { patch } = useScreen();
  function useScreenAdd(rows: ReturnType<typeof parseStudentCsv>["accepted"], actor: string) {
    patch((draft) => {
      rows.forEach((row, index) => {
        const id = `add-${Date.now()}-${index}`;
        const admission = row.admissionNo || `${bundle.school.code}-26-${String(9000 + draft.studentsAdded.length + index).padStart(4, "0")}`;
        draft.studentsAdded.push({
          id,
          schoolId: bundle.school.id,
          admissionNo: admission,
          firstName: row.firstName,
          lastName: row.lastName,
          dob: row.dob,
          gender: row.gender,
          classId: row.classId,
          sectionId: row.sectionId,
          roll: row.roll || 99,
          admissionDate: world.today,
          bloodGroup: "—",
          address: row.address || bundle.school.city,
          city: row.city || bundle.school.city,
          state: bundle.school.state,
          pin: "380015",
          emergencyPhone: row.phone || "9800000000",
          status: "active",
          parentId: `${id}-parent`,
          series: 3,
        });
      });
    }, { actor, action: "student.import", detail: `Imported ${rows.length} students. Rejected rows were reported and not saved.` });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-4xl text-ink">Students</h1>
          <p className="text-sm text-muted">{filtered.length} in this view. Blood group and notes stay off the list.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn kind="line" onClick={exportCsv}><Download className="size-4" /> Export</Btn>
          {can(user.role, "students.manage") ? <Btn onClick={() => setShowAdd(true)}>Add or import</Btn> : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" />
          <input className={`${control} pl-9`} placeholder="Search name or admission number" value={q} onChange={(event) => { setQ(event.target.value); setPage(0); }} />
        </div>
        <select className={control} value={classId} onChange={(event) => { setClassId(event.target.value); setPage(0); }}>
          <option value="all">All classes</option>
          {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Class</th>
              <th className="px-4 py-3 font-medium">Attendance</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((student) => {
              const att = attendanceOf(student, bundle, delta, world);
              return (
                <tr key={student.id} className="border-t border-line">
                  <td className="px-4 py-3">
                    <button type="button" className="text-left" onClick={() => setOpen(student)}>
                      <span className="block font-semibold text-ink">{student.firstName} {student.lastName}</span>
                      <span className="text-muted">{student.admissionNo}</span>
                    </button>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{className(bundle, delta, student.classId)}-{sectionName(bundle, delta, student.sectionId)} · {student.roll}</td>
                  <td className="px-4 py-3 tabular-nums">{att.eligible ? `${att.percentage}%` : "—"}</td>
                  <td className="px-4 py-3"><Pill tone={toneFor(student.status)}>{student.status}</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {slice.length === 0 ? <div className="p-4"><Empty title="No students" body="Try another class or search." /></div> : null}
      </div>
      <div className="flex gap-2">
        <Btn kind="line" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</Btn>
        <Btn kind="line" disabled={(page + 1) * 12 >= filtered.length} onClick={() => setPage((value) => value + 1)}>Next</Btn>
      </div>
      {open ? (
        <Modal title={`${open.firstName} ${open.lastName}`} onClose={() => setOpen(null)}>
          <Profile student={open} sensitive={sensitive} />
        </Modal>
      ) : null}
      {showAdd ? (
        <Modal title="Add students" onClose={() => setShowAdd(false)}>
          <p className="text-sm text-ink-soft">Paste CSV with first_name, last_name, dob, class, section. Optional: admission_no, gender, roll, phone, address, city. Invalid rows are listed and not saved.</p>
          <textarea className={`${control} mt-3 min-h-36`} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={"first_name,last_name,dob,class,section\nAsha,Mehta,2014-04-02,Class 8,A"} />
          <div className="mt-3 flex gap-2">
            <Btn onClick={runImport}>Validate and save</Btn>
          </div>
          {importNote ? <p className="mt-3 text-sm text-ink-soft">{importNote}</p> : null}
        </Modal>
      ) : null}
    </div>
  );
}

function Profile({ student, sensitive }: { student: Student; sensitive: boolean }) {
  const { world, bundle, delta, user, patch } = useScreen();
  const att = attendanceOf(student, bundle, delta, world);
  const parent = bundle.parents.find((item) => item.id === student.parentId);
  return (
    <div className="space-y-3 text-sm">
      <p>{className(bundle, delta, student.classId)} {sectionName(bundle, delta, student.sectionId)} · Roll {student.roll} · Admitted {pretty(student.admissionDate)}</p>
      <p>Attendance {att.percentage}% across {att.eligible} eligible days. Absent {att.absent}, late {att.late}.</p>
      {sensitive ? <p>Emergency {student.emergencyPhone}. {student.address}, {student.city} {student.pin}. Blood group {student.bloodGroup}.</p> : <p>Contact desk holds the emergency number.</p>}
      {sensitive && student.note ? <p>Access note: {student.note}</p> : null}
      {parent && sensitive ? <p>Primary guardian {parent.name} ({parent.relationship}), {parent.phone}.</p> : null}
      {can(user.role, "students.manage") ? (
        <div className="flex flex-wrap gap-2 pt-2">
          <Btn kind="line" onClick={() => patch((draft) => { draft.studentPatches[student.id] = { ...draft.studentPatches[student.id], status: "archived" }; }, { actor: user.name, action: "student.archive", detail: student.admissionNo })}>Archive</Btn>
          <Btn kind="line" onClick={() => patch((draft) => { draft.studentPatches[student.id] = { ...draft.studentPatches[student.id], status: "transferred" }; }, { actor: user.name, action: "student.transfer", detail: student.admissionNo })}>Mark transferred</Btn>
        </div>
      ) : null}
    </div>
  );
}

export function TeachersPage() {
  const { bundle, delta } = useScreen();
  const teachers = [...bundle.teachers, ...delta.teachersAdded].map((teacher) => ({ ...teacher, ...delta.teacherPatches[teacher.id] }));
  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Teachers</h1>
      <p className="text-sm text-muted">Workload is the number of timetable periods this week, not a quality score.</p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="text-muted"><tr><th className="px-4 py-3 font-medium">Teacher</th><th className="px-4 py-3 font-medium">Department</th><th className="px-4 py-3 font-medium">Periods</th><th className="px-4 py-3 font-medium">Status</th></tr></thead>
          <tbody>
            {teachers.map((teacher) => {
              const periods = bundle.timetable.filter((entry) => entry.teacherId === teacher.id).length;
              return (
                <tr key={teacher.id} className="border-t border-line">
                  <td className="px-4 py-3"><span className="font-semibold">{teacher.name}</span><span className="block text-muted">{teacher.employeeId} · {teacher.qualification}</span></td>
                  <td className="px-4 py-3">{teacher.department}</td>
                  <td className="px-4 py-3 tabular-nums">{periods}</td>
                  <td className="px-4 py-3"><Pill tone={toneFor(teacher.status)}>{teacher.status}</Pill></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AcademicsPage() {
  const { bundle, delta, user, patch } = useScreen();
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Academics</h1>
      <p className="max-w-2xl text-sm text-ink-soft">Session {bundle.year.label} ({pretty(bundle.year.start)} – {pretty(bundle.year.end)}). Classes are configured for this school, not fixed to one board.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...bundle.classes, ...delta.classesAdded].map((klass) => {
          const sections = [...bundle.sections, ...delta.sectionsAdded].filter((section) => section.classId === klass.id);
          return (
            <article key={klass.id} className="rounded-2xl border border-line bg-card p-4">
              <h2 className="text-xl">{klass.name}</h2>
              <p className="text-sm text-muted">Sections {sections.map((section) => section.name).join(", ") || "—"}</p>
            </article>
          );
        })}
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        patch((draft) => {
          draft.classesAdded.push({ id: `cls-${Date.now()}`, schoolId: bundle.school.id, name: name.trim(), order: 100 + draft.classesAdded.length });
        }, { actor: user.name, action: "class.add", detail: name.trim() });
        setName("");
      }}>
        <input className={`${control} max-w-xs`} value={name} onChange={(event) => setName(event.target.value)} placeholder="New class name" />
        <Btn type="submit">Add class</Btn>
      </form>
      <div className="flex flex-wrap gap-2">
        {bundle.subjects.map((subject) => <Pill key={subject.id} tone="ink">{subject.name}</Pill>)}
      </div>
    </div>
  );
}

export function AttendancePage() {
  const { world, bundle, delta, user, students, patch } = useScreen();
  const sections = user.role === "teacher" && user.teacherId
    ? bundle.sections.filter((section) => teacherSections(bundle, delta, user.teacherId!).includes(section.id))
    : bundle.sections;
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [date, setDate] = useState(world.today);
  const [marks, setMarks] = useState<Record<string, "present" | "absent" | "late" | "half_day" | "leave">>({});
  const [remark, setRemark] = useState("");
  const [message, setMessage] = useState("");
  const holiday = bundle.holidays.includes(date) || [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());
  const roster = students.filter((student) => student.sectionId === sectionId && student.status === "active");
  const own = user.role === "student" || user.role === "parent";

  if (own) {
    const focus = students;
    return (
      <div className="space-y-4">
        <h1 className="text-4xl text-ink">Attendance</h1>
        {focus.map((student) => {
          const summary = attendanceOf(student, bundle, delta, world);
          const rows = schoolDays("2026-11-01", "2026-11-16", bundle.holidays);
          return (
            <article key={student.id} className="rounded-2xl border border-line bg-card p-4">
              <h2 className="text-xl">{student.firstName} {student.lastName}</h2>
              <p className="text-sm text-muted">{summary.percentage}% · {summary.absent} absent · {summary.late} late. Approved leave is left out of the percentage.</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {rows.map((iso) => {
                  const status = rawAttendance(student, iso, bundle, delta);
                  const tone = status === "absent" ? "bg-clay" : status === "late" || status === "half_day" ? "bg-ink-soft" : status === "leave" ? "bg-paper-2" : "bg-teal";
                  return <span key={iso} title={`${iso} ${status ?? ""}`} className={`inline-block size-6 rounded-md ${tone}`} />;
                })}
              </div>
            </article>
          );
        })}
      </div>
    );
  }

  function save() {
    if (holiday) {
      setMessage("That date is not a school day.");
      return;
    }
    if (!can(user.role, "attendance.mark")) {
      setMessage("You can view attendance, not change it.");
      return;
    }
    const existing = roster.some((student) => delta.attendance[`${student.id}|${date}`] || date < world.today);
    if (existing && remark.trim().length < 3) {
      setMessage("A correction needs a short reason.");
      return;
    }
    patch((draft) => {
      for (const student of roster) {
        const status = marks[student.id] ?? "present";
        const key = `${student.id}|${date}`;
        const previous = draft.attendance[key];
        draft.attendance[key] = {
          status,
          remarks: remark,
          by: user.name,
          at: new Date().toISOString(),
          history: [...(previous?.history ?? []), ...(previous ? [{ status: previous.status, remarks: previous.remarks, by: previous.by, at: previous.at }] : [])],
        };
        if (status === "absent") {
          const parentUser = world.users.find((account) => account.parentId === student.parentId);
          const dedupe = `abs|${student.id}|${date}`;
          if (parentUser && !draft.notifications.some((item) => item.dedupeKey === dedupe) && !delta.notifications.some((item) => item.dedupeKey === dedupe)) {
            draft.notifications.push({
              id: `nt-${dedupe}`,
              userId: parentUser.id,
              title: `${student.firstName} marked absent`,
              body: `${className(bundle, delta, student.classId)} attendance on ${date}.`,
              at: new Date().toISOString(),
              read: false,
              kind: "attendance",
              dedupeKey: dedupe,
            });
          }
        }
      }
    }, { actor: user.name, action: existing ? "attendance.correct" : "attendance.submit", detail: `${date} ${sectionId}` });
    setMessage(existing ? "Correction saved with an audit note. Parent alerts are not repeated." : "Attendance submitted.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Attendance</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Section">
          <select className={control} value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            {sections.map((section) => <option key={section.id} value={section.id}>{className(bundle, delta, section.classId)} {section.name}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className={control} value={date} onChange={(event) => setDate(event.target.value)} />
        </Field>
      </div>
      {holiday ? <Empty title="Not a school day" body="Holidays and weekends are excluded from attendance." /> : (
        <div className="space-y-2">
          {roster.map((student) => (
            <div key={student.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card px-3 py-2">
              <span className="font-medium">{student.roll}. {student.firstName} {student.lastName}</span>
              <div className="flex flex-wrap gap-1">
                {(["present", "absent", "late", "half_day", "leave"] as const).map((status) => (
                  <button key={status} type="button" className={`min-h-11 rounded-full px-3 text-xs font-semibold ${(marks[student.id] ?? "present") === status ? "bg-teal text-card" : "bg-paper-2 text-ink-soft"}`} onClick={() => setMarks((current) => ({ ...current, [student.id]: status }))}>
                    {status.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <Field label="Remark (required if this date was already saved)">
            <input className={control} value={remark} onChange={(event) => setRemark(event.target.value)} />
          </Field>
          <Btn onClick={save}>Submit attendance</Btn>
          {message ? <p className="text-sm text-ink-soft">{message}</p> : null}
        </div>
      )}
    </div>
  );
}
