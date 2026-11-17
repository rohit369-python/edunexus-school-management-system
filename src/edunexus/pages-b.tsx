import { useMemo, useState } from "react";
import { ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, CartesianGrid } from "recharts";
import { answerAssistant } from "./ai";
import { can } from "./access";
import { inr, validateMark } from "./engine";
import {
  allEntries,
  className,
  conflictsFor,
  homeworkState,
  invoiceView,
  markFor,
  publishedExams,
  rankInSection,
  resultsFor,
  sectionName,
  sectionSubjects,
  studentRisk,
  subjectName,
  teacherSections,
} from "./selectors";
import { useScreen } from "./screen";
import { useEdu } from "./store";
import type { Homework } from "./types";
import { Btn, Empty, Field, Modal, Pill, control, pretty, toneFor } from "./ui";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function TimetablePage() {
  const { bundle, delta, user, students, patch } = useScreen();
  const sections = bundle.sections;
  const defaultSection = user.role === "student" || user.role === "parent" ? students[0]?.sectionId : user.role === "teacher" && user.teacherId ? teacherSections(bundle, delta, user.teacherId)[0] : sections[0]?.id;
  const [sectionId, setSectionId] = useState(defaultSection ?? "");
  const [error, setError] = useState("");
  const entries = allEntries(bundle, delta).filter((entry) => {
    if (user.role === "teacher" && user.teacherId && sectionId === "mine") return entry.teacherId === user.teacherId;
    return entry.sectionId === sectionId;
  });
  const periods = [
    { id: "p1", start: "08:20", label: "Period 1" },
    { id: "p2", start: "09:05", label: "Period 2" },
    { id: "p3", start: "09:50", label: "Period 3" },
    { id: "p4", start: "10:50", label: "Period 4" },
    { id: "p5", start: "11:35", label: "Period 5" },
    { id: "p6", start: "13:00", label: "Period 6" },
  ];
  const conflicts = conflictsFor(bundle, delta);

  function move(entryId: string, teacherId: string) {
    const current = allEntries(bundle, delta).find((entry) => entry.id === entryId);
    if (!current) return;
    const next = { ...bundle.timetable.find((item) => item.id === entryId)!, teacherId };
    const trial = allEntries(bundle, delta).map((entry) => (entry.id === entryId ? { ...entry, teacherId } : entry));
    const clash = conflictsFor(bundle, { ...delta, timetableEdits: { ...delta.timetableEdits, [entryId]: { ...next, teacherId } } });
    if (clash.some((item) => item.ids.includes(entryId))) {
      setError(clash.find((item) => item.ids.includes(entryId))?.message ?? "That change clashes.");
      return;
    }
    void trial;
    patch((draft) => {
      draft.timetableEdits[entryId] = next;
    }, { actor: user.name, action: "timetable.edit", detail: entryId });
    setError("");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Timetable</h1>
      <div className="flex flex-wrap gap-2">
        {user.role === "teacher" ? <Btn kind={sectionId === "mine" ? "solid" : "line"} onClick={() => setSectionId("mine")}>My week</Btn> : null}
        {(user.role === "teacher" ? sections.filter((section) => teacherSections(bundle, delta, user.teacherId ?? "").includes(section.id)) : user.role === "student" || user.role === "parent" ? sections.filter((section) => students.some((student) => student.sectionId === section.id)) : sections).slice(0, 8).map((section) => (
          <Btn key={section.id} kind={sectionId === section.id ? "solid" : "line"} onClick={() => setSectionId(section.id)}>
            {className(bundle, delta, section.classId)} {section.name}
          </Btn>
        ))}
      </div>
      {conflicts.length ? <p className="text-sm text-clay">{conflicts.length} clash{conflicts.length === 1 ? "" : "es"} in the saved timetable. {conflicts[0].message}</p> : <p className="text-sm text-muted">No teacher, room, or class clashes in the current timetable.</p>}
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead><tr><th className="px-3 py-3 text-muted">Period</th>{DAYS.map((day) => <th key={day} className="px-3 py-3 text-muted">{day}</th>)}</tr></thead>
          <tbody>
            {periods.map((period) => {
              const current = period.id === "p6";
              return (
                <tr key={period.id} className="border-t border-line">
                  <td className="px-3 py-3 font-medium">{period.label}<span className="block text-xs text-muted">{period.start}{current ? " · now" : ""}</span></td>
                  {DAYS.map((_, day) => {
                    const entry = entries.find((item) => item.day === day && item.periodId === period.id);
                    return (
                      <td key={day} className={`px-3 py-3 ${current ? "bg-foam" : ""}`}>
                        {entry ? (
                          <div>
                            <p className="font-semibold">{subjectName(bundle, delta, entry.subjectId)}</p>
                            <p className="text-xs text-muted">{bundle.teachers.find((teacher) => teacher.id === entry.teacherId)?.name}</p>
                            {can(user.role, "timetable.manage") && sectionId !== "mine" ? (
                              <select className="mt-1 max-w-36 text-xs" value={entry.teacherId} onChange={(event) => move(entry.id, event.target.value)} aria-label="Change teacher">
                                {bundle.teachers.filter((teacher) => teacher.department === subjectName(bundle, delta, entry.subjectId) || teacher.id === entry.teacherId).map((teacher) => (
                                  <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                                ))}
                              </select>
                            ) : null}
                          </div>
                        ) : <span className="text-muted">Free</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      <Btn kind="line" onClick={() => window.print()}>Print week</Btn>
    </div>
  );
}

export function ExamsPage() {
  const { world, bundle, delta, user, students, patch } = useScreen();
  const exams = publishedExams(bundle, delta).filter((exam) => examVisible(exam.status, user.role));
  const [examId, setExamId] = useState(exams[0]?.id ?? "");
  const [sectionId, setSectionId] = useState(students[0]?.sectionId ?? bundle.sections[0]?.id ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [cardId, setCardId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const teacherId = user.teacherId;
  const allowedSections = user.role === "teacher" && teacherId ? bundle.sections.filter((section) => teacherSections(bundle, delta, teacherId).includes(section.id)) : bundle.sections;
  const subjects = sectionSubjects(bundle, delta, sectionId).filter((id) => {
    if (user.role !== "teacher" || !user.teacherId) return true;
    return bundle.assignments.some((item) => item.teacherId === user.teacherId && item.sectionId === sectionId && item.subjectId === id);
  });
  const chosenSubject = subjectId || subjects[0] || "";
  const exam = exams.find((item) => item.id === examId);
  const roster = students.filter((student) => student.sectionId === sectionId && student.status === "active");
  const [draft, setDraft] = useState<Record<string, string>>({});

  function save(state: "draft" | "submitted") {
    if (!exam || !chosenSubject) return;
    if (user.role === "accountant") {
      setNote("Accountants cannot enter marks.");
      return;
    }
    const errors: string[] = [];
    patch((store) => {
      for (const student of roster) {
        const raw = draft[student.id];
        if (raw === undefined || raw === "") continue;
        if (raw.toUpperCase() === "AB") {
          store.marks[`${student.id}|${exam.id}|${chosenSubject}`] = { marks: null, state, by: user.name, at: new Date().toISOString() };
          continue;
        }
        const value = Number(raw);
        const problem = validateMark(value, exam.maxMarks);
        if (problem) errors.push(`${student.firstName}: ${problem}`);
        else store.marks[`${student.id}|${exam.id}|${chosenSubject}`] = { marks: value, state, by: user.name, at: new Date().toISOString() };
      }
    }, { actor: user.name, action: state === "draft" ? "marks.draft" : "marks.submit", detail: `${exam.name} ${chosenSubject}` });
    setNote(errors.length ? errors.join(" ") : state === "draft" ? "Draft saved." : "Marks submitted.");
  }

  const cardStudent = students.find((student) => student.id === cardId) ?? null;

  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Examinations</h1>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Examination"><select className={control} value={examId} onChange={(event) => setExamId(event.target.value)}>{exams.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status}</option>)}</select></Field>
        {user.role !== "student" && user.role !== "parent" ? (
          <Field label="Section"><select className={control} value={sectionId} onChange={(event) => { setSectionId(event.target.value); setSubjectId(""); }}>{allowedSections.map((section) => <option key={section.id} value={section.id}>{className(bundle, delta, section.classId)} {section.name}</option>)}</select></Field>
        ) : null}
        {can(user.role, "marks.enter") ? (
          <Field label="Subject"><select className={control} value={chosenSubject} onChange={(event) => setSubjectId(event.target.value)}>{subjects.map((id) => <option key={id} value={id}>{subjectName(bundle, delta, id)}</option>)}</select></Field>
        ) : null}
      </div>
      {user.role === "student" || user.role === "parent" ? (
        students.map((student) => <ResultCard key={student.id} studentId={student.id} examId={examId} />)
      ) : can(user.role, "marks.enter") && exam ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">Maximum {exam.maxMarks}. Use AB if the student was absent. Unpublished exams stay hidden from families.</p>
          {roster.map((student) => {
            const current = markFor(student, exam.id, chosenSubject, exam.maxMarks, delta);
            return (
              <label key={student.id} className="grid grid-cols-[1fr_6rem] items-center gap-2 rounded-2xl border border-line bg-card px-3 py-2">
                <span>{student.roll}. {student.firstName} {student.lastName}</span>
                <input className={control} defaultValue={current.marks ?? (current.absent ? "AB" : "")} onChange={(event) => setDraft((map) => ({ ...map, [student.id]: event.target.value }))} />
              </label>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Btn kind="line" onClick={() => save("draft")}>Save draft</Btn>
            <Btn onClick={() => save("submitted")}>Submit marks</Btn>
            {can(user.role, "results.publish") && exam.status !== "published" ? (
              <Btn kind="clay" onClick={() => patch((store) => { store.publishedExamIds.push(exam.id); }, { actor: user.name, action: "results.publish", detail: exam.name })}>Publish results</Btn>
            ) : null}
          </div>
          {note ? <p className="text-sm text-ink-soft">{note}</p> : null}
        </div>
      ) : (
        <div className="space-y-2">
          {roster.slice(0, 8).map((student) => (
            <button key={student.id} type="button" className="flex w-full items-center justify-between rounded-2xl border border-line bg-card px-4 py-3 text-left" onClick={() => setCardId(student.id)}>
              <span className="font-semibold">{student.firstName} {student.lastName}</span>
              <span className="text-sm text-teal">Report card</span>
            </button>
          ))}
        </div>
      )}
      {cardStudent && exam ? (
        <Modal title="Report card" onClose={() => setCardId(null)}>
          <ResultCard studentId={cardStudent.id} examId={exam.id} />
          <Btn className="mt-3" kind="line" onClick={() => window.print()}>Print / save PDF</Btn>
        </Modal>
      ) : null}
    </div>
  );
}

function examVisible(status: string, role: string) {
  if (status === "published") return true;
  return role !== "student" && role !== "parent";
}

function ResultCard({ studentId, examId }: { studentId: string; examId: string }) {
  const { world, bundle, delta, students, user } = useScreen();
  const student = students.find((item) => item.id === studentId);
  const exam = publishedExams(bundle, delta).find((item) => item.id === examId);
  if (!student || !exam) return null;
  if ((user.role === "student" || user.role === "parent") && exam.status !== "published") {
    return <p className="text-sm text-muted">Results for {exam.name} are not published.</p>;
  }
  const { rows, roll } = resultsFor(student, exam.id, bundle, delta, world);
  const rank = rankInSection(student, exam.id, bundle, delta, world);
  const att = studentRisk(student, bundle, delta, world);
  return (
    <article className="rounded-2xl border border-line bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal">{bundle.school.name}</p>
      <h2 className="text-2xl">{student.firstName} {student.lastName}</h2>
      <p className="text-sm text-muted">{exam.name} · {className(bundle, delta, student.classId)} {sectionName(bundle, delta, student.sectionId)} · {student.admissionNo}</p>
      <table className="mt-3 w-full text-left text-sm">
        <thead><tr className="text-muted"><th className="py-1">Subject</th><th>Marks</th><th>Grade</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.subjectId} className="border-t border-line">
              <td className="py-2">{subjectName(bundle, delta, row.subjectId)}</td>
              <td className="tabular-nums">{row.absent ? "AB" : `${row.marks}/${row.max}`}</td>
              <td>{row.grade ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-sm">Total {roll.scored}/{roll.maximum} · {roll.percent}% · {roll.grade} · {roll.pass ? "Pass" : "Needs a subject pass"}{rank ? ` · Section rank ${rank}` : ""}</p>
      <p className="text-sm text-muted">Attendance in the term window: {att.attendancePct}%. Absent subjects count as not passed and are left out of the average.</p>
      <p className="mt-2 text-sm">Class teacher: keep practising the subjects below the pass mark. Principal: results published for families.</p>
    </article>
  );
}

export function FeesPage() {
  const { world, bundle, delta, user, students, patch } = useScreen();
  const rows = students.filter((student) => student.status === "active").map((student) => ({ student, view: invoiceView(student, bundle, delta, world) })).filter((item) => item.view);
  const [payId, setPayId] = useState<string | null>(null);
  const [fail, setFail] = useState(false);
  const [note, setNote] = useState("");
  const paying = rows.find((item) => item.view?.invoice.id === payId);

  function pay() {
    if (!paying?.view) return;
    const amount = paying.view.balance;
    if (amount <= 0) {
      setNote("Nothing is due on this invoice.");
      return;
    }
    const key = `${paying.view.invoice.id}|${amount}|mock`;
    if (delta.payments.some((payment) => payment.idempotencyKey === key && payment.status === "success")) {
      setNote("This payment was already recorded.");
      return;
    }
    const success = !fail;
    patch((store) => {
      store.payments.push({
        id: `pay-${Date.now()}`,
        schoolId: bundle.school.id,
        invoiceId: paying.view!.invoice.id,
        studentId: paying.student.id,
        amount: success ? amount : 0,
        method: "UPI (mock)",
        at: new Date().toISOString(),
        gatewayRef: success ? `mock_${key}` : "",
        idempotencyKey: key,
        status: success ? "success" : "failed",
      });
      if (success) {
        const parent = world.users.find((account) => account.parentId === paying.student.parentId);
        if (parent) {
          store.notifications.push({
            id: `nt-fee-${key}`,
            userId: parent.id,
            title: "Receipt ready",
            body: `${paying.view!.invoice.number} is paid.`,
            at: new Date().toISOString(),
            read: false,
            kind: "fee",
            dedupeKey: `fee|${key}`,
          });
        }
      }
    }, { actor: user.name, action: success ? "payment.success" : "payment.failed", detail: paying.view.invoice.number });
    setNote(success ? `Mock gateway confirmed ${inr(amount)}. No card number was stored.` : "Mock gateway declined the payment. The invoice is unchanged.");
    setPayId(null);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Fees</h1>
      <p className="text-sm text-muted">Term invoice for 2026–27. Payments go through a mock gateway until a provider is configured.</p>
      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[42rem] text-left text-sm">
          <thead className="text-muted"><tr><th className="px-4 py-3 font-medium">Invoice</th><th className="px-4 py-3 font-medium">Due</th><th className="px-4 py-3 font-medium">Balance</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3"></th></tr></thead>
          <tbody>
            {rows.slice(0, 40).map(({ student, view }) => view ? (
              <tr key={view.invoice.id} className="border-t border-line">
                <td className="px-4 py-3"><span className="font-semibold">{student.firstName} {student.lastName}</span><span className="block text-muted">{view.invoice.number}</span></td>
                <td className="px-4 py-3 tabular-nums">{inr(view.due)}</td>
                <td className="px-4 py-3 tabular-nums">{inr(view.balance)}</td>
                <td className="px-4 py-3"><Pill tone={toneFor(view.status)}>{view.status}</Pill></td>
                <td className="px-4 py-3">{view.balance > 0 && (can(user.role, "fees.pay") || can(user.role, "fees.manage")) ? <Btn kind="line" onClick={() => setPayId(view.invoice.id)}>Pay</Btn> : null}</td>
              </tr>
            ) : null)}
          </tbody>
        </table>
      </div>
      {note ? <p className="text-sm text-ink-soft">{note}</p> : null}
      {paying?.view ? (
        <Modal title={`Pay ${paying.view.invoice.number}`} onClose={() => setPayId(null)}>
          <ul className="text-sm">{paying.view.invoice.items.map((item) => <li key={item.label} className="flex justify-between py-1"><span>{item.label}</span><span className="tabular-nums">{inr(item.amount)}</span></li>)}</ul>
          <p className="mt-2 text-sm">Concession {inr(paying.view.concession)}. Balance {inr(paying.view.balance)}.</p>
          <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={fail} onChange={(event) => setFail(event.target.checked)} /> Simulate a failed payment</label>
          <div className="mt-3 flex gap-2">
            <Btn onClick={pay}>Confirm mock payment</Btn>
            {can(user.role, "fees.manage") ? <Btn kind="line" onClick={() => { patch((store) => { store.concessions[paying.view!.invoice.id] = (store.concessions[paying.view!.invoice.id] ?? paying.view!.concession) + 1000; }, { actor: user.name, action: "fee.concession", detail: paying.view!.invoice.number }); setPayId(null); }}>Add ₹1,000 concession</Btn> : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function HomeworkPage() {
  const { world, bundle, delta, user, students, patch } = useScreen();
  const [title, setTitle] = useState("");
  const [sectionId, setSectionId] = useState(bundle.sections.find((section) => user.teacherId && teacherSections(bundle, delta, user.teacherId).includes(section.id))?.id ?? bundle.sections[0].id);
  const items = [...bundle.homework, ...delta.homeworkAdded].filter((item) => item.schoolId === bundle.school.id && !delta.homeworkArchived.includes(item.id));
  const visible = items.filter((item) => {
    if (user.role === "student" || user.role === "parent") return students.some((student) => student.sectionId === item.sectionId);
    if (user.role === "teacher" && user.teacherId) return item.teacherId === user.teacherId || teacherSections(bundle, delta, user.teacherId).includes(item.sectionId);
    return true;
  });

  function createHomework() {
    const subjectId = sectionSubjects(bundle, delta, sectionId)[0];
    if (!title.trim() || !subjectId) return;
    const row: Homework = {
      id: `hw-${Date.now()}`,
      schoolId: bundle.school.id,
      classId: bundle.sections.find((section) => section.id === sectionId)?.classId ?? "",
      sectionId,
      subjectId,
      teacherId: user.teacherId ?? bundle.teachers[0].id,
      title: title.trim(),
      description: "Complete in your notebook and submit before the deadline.",
      due: "2026-11-28",
      maxMarks: 10,
    };
    patch((store) => { store.homeworkAdded.push(row); }, { actor: user.name, action: "homework.create", detail: row.title });
    setTitle("");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Homework</h1>
      {can(user.role, "homework.manage") ? (
        <div className="flex flex-wrap gap-2">
          <input className={`${control} max-w-sm`} value={title} placeholder="New homework title" onChange={(event) => setTitle(event.target.value)} />
          <Btn onClick={createHomework}>Assign</Btn>
        </div>
      ) : null}
      <div className="space-y-3">
        {visible.slice(0, 24).map((item) => (
          <article key={item.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-xl">{item.title}</h2>
                <p className="text-sm text-muted">{subjectName(bundle, delta, item.subjectId)} · {className(bundle, delta, item.classId)} {sectionName(bundle, delta, item.sectionId)} · due {pretty(item.due)}</p>
                <p className="mt-1 text-sm text-ink-soft">{item.description}</p>
              </div>
              <Pill tone={item.due < world.today ? "ink" : "teal"}>{item.due < world.today ? "Deadline passed" : "Open"}</Pill>
            </div>
            {(user.role === "student" || user.role === "parent" ? students : students.filter((student) => student.sectionId === item.sectionId).slice(0, 6)).map((student) => {
              if (student.sectionId !== item.sectionId) return null;
              const sub = homeworkState(item.id, student, item.due, delta, world);
              return (
                <div key={student.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
                  <span>{student.firstName}: {sub ? sub.state : "not submitted"}{sub?.feedback ? ` · ${sub.feedback}` : ""}</span>
                  {user.role === "student" && !sub ? (
                    <Btn kind="line" onClick={() => patch((store) => {
                      const late = world.today > item.due;
                      store.submissions[`${item.id}|${student.id}`] = { homeworkId: item.id, studentId: student.id, text: "Uploaded from the portal.", fileName: "homework.pdf", at: new Date().toISOString(), state: late ? "late" : "submitted" };
                    }, { actor: user.name, action: "homework.submit", detail: item.title })}>Submit</Btn>
                  ) : null}
                  {can(user.role, "homework.manage") && sub && sub.state !== "evaluated" ? (
                    <Btn kind="line" onClick={() => patch((store) => {
                      const current = store.submissions[`${item.id}|${student.id}`] ?? sub;
                      store.submissions[`${item.id}|${student.id}`] = { ...current, state: "evaluated", marks: 8, feedback: "Clear working. Keep the same layout next time." };
                    }, { actor: user.name, action: "homework.evaluate", detail: item.title })}>Mark 8/10</Btn>
                  ) : null}
                </div>
              );
            })}
          </article>
        ))}
      </div>
    </div>
  );
}

export function InsightsPage() {
  const { world, bundle, delta, user, students, patch } = useScreen();
  const rows = useMemo(() => students.filter((student) => student.status === "active").map((student) => ({ student, risk: studentRisk(student, bundle, delta, world) })).sort((a, b) => (a.risk.level === b.risk.level ? 0 : a.risk.level === "high" ? -1 : 1)), [students, bundle, delta, world]);
  const scatter = rows.slice(0, 80).map(({ student, risk }) => ({ x: risk.attendancePct, y: resultsFor(student, `${bundle.school.id}-mid`, bundle, delta, world).roll.percent, z: 80 }));
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState(rows.find((row) => row.risk.level !== "low")?.student.id ?? "");
  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Academic support</h1>
      <p className="max-w-2xl text-sm text-ink-soft">Flags use attendance, published marks, and missing work. They do not use gender, health notes, or family details, and they are not sanctions.</p>
      <div className="h-56 rounded-2xl border border-line bg-card p-2">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid stroke="var(--color-line)" />
            <XAxis dataKey="x" name="Attendance" unit="%" tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
            <YAxis dataKey="y" name="Midterm" unit="%" tick={{ fill: "var(--color-muted)", fontSize: 12 }} />
            <ZAxis dataKey="z" range={[60, 60]} />
            <Tooltip cursor={{ strokeDasharray: "3 3" }} />
            <Scatter data={scatter} fill="var(--color-teal)" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted">Each dot is one student. Attendance and marks can move differently; the chart does not claim one causes the other.</p>
      <div className="space-y-3">
        {rows.filter((row) => row.risk.level !== "low").slice(0, 8).map(({ student, risk }) => (
          <article key={student.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl">{student.firstName} {student.lastName}</h2>
              <Pill tone={toneFor(risk.level)}>{risk.level} concern</Pill>
            </div>
            <ul className="mt-2 list-disc pl-5 text-sm text-ink-soft">{risk.indicators.map((item) => <li key={item}>{item}</li>)}</ul>
            <p className="mt-2 text-sm">Suggestion: {risk.suggestions[0]}</p>
            {can(user.role, "risk.act") ? (
              <form className="mt-3 flex flex-wrap gap-2" onSubmit={(event) => {
                event.preventDefault();
                patch((store) => {
                  store.interventions.push({ id: `iv-${Date.now()}`, studentId: student.id, schoolId: bundle.school.id, note: note || risk.suggestions[0], action: "Teacher follow-up", status: "open", by: user.name, at: new Date().toISOString() });
                }, { actor: user.name, action: "intervention.open", detail: student.admissionNo });
                setPicked(student.id);
                setNote("");
              }}>
                <input className={`${control} max-w-md`} placeholder="Follow-up note" value={picked === student.id ? note : ""} onChange={(event) => { setPicked(student.id); setNote(event.target.value); }} />
                <Btn type="submit">Record follow-up</Btn>
              </form>
            ) : null}
            {delta.interventions.filter((item) => item.studentId === student.id).map((item) => (
              <p key={item.id} className="mt-2 text-sm text-teal">{item.action}: {item.note} · {item.status}</p>
            ))}
          </article>
        ))}
      </div>
    </div>
  );
}

export function AssistantPage() {
  const { user, patch, delta } = useScreen();
  const [text, setText] = useState("");
  const mode = user.role === "teacher" ? "teacher" : "student";
  const turns = delta.chats.filter((turn) => turn.userId === user.id);
  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Study assistant</h1>
      <p className="max-w-2xl text-sm text-ink-soft">Runs on this device with a built-in topic bank. It does not call a paid model, does not see other students, and does not make official school decisions.</p>
      <div className="space-y-3 rounded-2xl border border-line bg-card p-4">
        {turns.length === 0 ? <p className="text-sm text-muted">Try “explain fractions” or “revision plan”{mode === "teacher" ? ", or “quiz for mathematics”" : ""}.</p> : null}
        {turns.map((turn) => (
          <p key={turn.id} className={`whitespace-pre-wrap text-sm ${turn.role === "user" ? "font-semibold" : "text-ink-soft"}`}>{turn.text}</p>
        ))}
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        const reply = answerAssistant(text, mode);
        const asked = text;
        patch((store) => {
          store.chats.push({ id: `c-${Date.now()}`, userId: user.id, role: "user", text: asked, at: new Date().toISOString() });
          store.chats.push({ id: `a-${Date.now()}`, userId: user.id, role: "assistant", text: reply.text, at: new Date().toISOString() });
        });
        setText("");
      }}>
        <input className={`${control} max-w-xl`} value={text} onChange={(event) => setText(event.target.value)} placeholder="Ask about a concept" />
        <Btn type="submit">Ask</Btn>
      </form>
    </div>
  );
}

export function LibraryPage() {
  const { world, bundle, delta, user, students, patch } = useScreen();
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const books = bundle.books.filter((book) => book.title.toLowerCase().includes(q.toLowerCase()) || book.author.toLowerCase().includes(q.toLowerCase()));
  function openLoans(bookId: string) {
    const seed = bundle.loans.filter((loan) => loan.bookId === bookId && !loan.returnedOn && !delta.loansReturned[loan.id]);
    const added = delta.loansAdded.filter((loan) => loan.bookId === bookId && !delta.loansReturned[loan.id]);
    return [...seed, ...added];
  }
  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Library</h1>
      <input className={`${control} max-w-sm`} placeholder="Search title or author" value={q} onChange={(event) => setQ(event.target.value)} />
      {note ? <p className="text-sm text-ink-soft">{note}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {books.map((book) => {
          const out = openLoans(book.id);
          return (
            <article key={book.id} className="rounded-2xl border border-line bg-card p-4">
              <h2 className="text-xl">{book.title}</h2>
              <p className="text-sm text-muted">{book.author} · {book.category} · ISBN {book.isbn}</p>
              <p className="mt-1 text-sm">{book.copies - out.length} of {book.copies} copies on the shelf.</p>
              {can(user.role, "library.manage") ? (
                <Btn className="mt-3" kind="line" onClick={() => {
                  if (out.length >= book.copies) {
                    setNote(`${book.title} has no free copy.`);
                    return;
                  }
                  const copy = [1, 2].find((number) => !out.some((loan) => loan.copyNo === number)) ?? 1;
                  const borrower = students[0];
                  if (!borrower) return;
                  patch((store) => {
                    store.loansAdded.push({ id: `loan-${Date.now()}`, schoolId: bundle.school.id, bookId: book.id, copyNo: copy, borrowerId: borrower.id, borrowerKind: "student", issuedOn: world.today, dueOn: "2026-12-01" });
                  }, { actor: user.name, action: "library.issue", detail: book.title });
                  setNote(`Issued copy ${copy} of ${book.title}.`);
                }}>Issue a copy</Btn>
              ) : null}
              {out.map((loan) => (
                <p key={loan.id} className="mt-2 text-sm">Copy {loan.copyNo} due {pretty(loan.dueOn)}{loan.dueOn < world.today ? " · overdue" : ""}{can(user.role, "library.manage") ? "" : ""}
                  {can(user.role, "library.manage") ? <button type="button" className="ml-2 font-semibold text-teal" onClick={() => patch((store) => { store.loansReturned[loan.id] = world.today; }, { actor: user.name, action: "library.return", detail: book.title })}>Return</button> : null}
                </p>
              ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarPage() {
  const { bundle, delta } = useScreen();
  const events = [...bundle.events, ...delta.events];
  const cells: (number | null)[] = [...Array(7).fill(null), ...Array.from({ length: 30 }, (_, index) => index + 1)];
  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">November 2026</h1>
      <p className="text-sm text-muted">Times use {bundle.school.timezone}. 1 November 2026 is a Sunday.</p>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => <div key={`${label}-${index}`} className="py-2 text-muted">{label}</div>)}
        {cells.map((day, index) => {
          const iso = day ? `2026-11-${String(day).padStart(2, "0")}` : "";
          const hit = events.filter((event) => event.date === iso);
          return <div key={index} className={`min-h-16 rounded-xl border border-line bg-card p-1 ${day === 17 ? "ring-2 ring-teal" : ""}`}>{day ? <span className="tabular-nums">{day}</span> : null}{hit[0] ? <span className="mt-1 block text-xs leading-tight text-teal">{hit[0].title}</span> : null}</div>;
        })}
      </div>
      <ul className="space-y-2 text-sm">{events.map((event) => <li key={event.id}><span className="font-semibold">{pretty(event.date)}</span> · {event.title}. {event.detail}</li>)}</ul>
    </div>
  );
}

export function AnnouncementsPage() {
  const { bundle, delta, user, students, patch } = useScreen();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const items = [...delta.announcements, ...bundle.announcements].filter((item) => {
    if (item.audience === "school" || !item.sectionId) return item.schoolId === bundle.school.id;
    return students.some((student) => student.sectionId === item.sectionId);
  });
  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Announcements</h1>
      {can(user.role, "announcements.manage") ? (
        <form className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim() || !body.trim()) return;
          patch((store) => {
            store.announcements.unshift({ id: `an-${Date.now()}`, schoolId: bundle.school.id, title: title.trim(), body: body.trim(), audience: "school", author: user.name, at: new Date().toISOString() });
          }, { actor: user.name, action: "announcement.create", detail: title.trim() });
          setTitle("");
          setBody("");
        }}>
          <input className={control} placeholder="Title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea className={`${control} min-h-24`} placeholder="Message. Do not include private student details." value={body} onChange={(event) => setBody(event.target.value)} />
          <Btn type="submit">Post to school</Btn>
        </form>
      ) : null}
      <ul className="space-y-3">{items.map((item) => <li key={item.id} className="rounded-2xl border border-line bg-card p-4"><h2 className="text-xl">{item.title}</h2><p className="text-sm text-ink-soft">{item.body}</p><p className="mt-1 text-xs text-muted">{item.author}</p></li>)}</ul>
    </div>
  );
}

export function MessagesPage() {
  const { bundle, delta, user, students, patch } = useScreen();
  const [body, setBody] = useState("");
  const child = students[0];
  const thread = delta.messages.filter((message) => !child || message.studentId === child.id || user.role === "teacher");
  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">Messages</h1>
      <p className="text-sm text-muted">{child ? `Thread for ${child.firstName} ${child.lastName}.` : "No linked student."} Staff only see classes they are assigned.</p>
      <ul className="space-y-2">{thread.length === 0 ? <Empty title="No messages yet" body="Write to the class teacher. The note stays inside this school." /> : thread.map((message) => <li key={message.id} className="rounded-2xl border border-line bg-card px-4 py-3 text-sm"><span className="font-semibold">{message.fromName}</span> · {message.body}</li>)}</ul>
      <form className="flex flex-wrap gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim() || !child) return;
        patch((store) => {
          store.messages.push({ id: `msg-${Date.now()}`, schoolId: bundle.school.id, studentId: child.id, fromName: user.name, fromRole: user.role, body: body.trim(), at: new Date().toISOString() });
        }, { actor: user.name, action: "message.send", detail: child.admissionNo });
        setBody("");
      }}>
        <input className={`${control} max-w-xl`} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a short note" />
        <Btn type="submit">Send</Btn>
      </form>
    </div>
  );
}

export function SettingsPage() {
  const { world, bundle, delta, user, patch } = useScreen();
  const reset = useEdu((state) => state.reset);
  const setSchool = useEdu((state) => state.setSchool);
  const policy = delta.policy ?? world.policy;
  return (
    <div className="space-y-4">
      <h1 className="text-4xl text-ink">School settings</h1>
      <p className="text-sm text-ink-soft">{bundle.school.address}. Board note: {bundle.school.board}. Timezone {bundle.school.timezone}.</p>
      {user.role === "super_admin" ? (
        <div className="flex flex-wrap gap-2">
          {world.bundles.map((item) => <Btn key={item.school.id} kind={item.school.id === bundle.school.id ? "solid" : "line"} onClick={() => setSchool(item.school.id)}>{item.school.name}</Btn>)}
        </div>
      ) : null}
      <Field label={`Attendance threshold (${policy.threshold}%)`}>
        <input className={control} type="number" min={50} max={100} value={policy.threshold} onChange={(event) => patch((store) => { store.policy = { ...policy, threshold: Number(event.target.value) }; }, { actor: user.name, action: "policy.threshold", detail: event.target.value })} />
      </Field>
      <p className="text-sm text-muted">Late arrivals count as {policy.lateCountsAs}. Half-days count as {policy.halfDayCountsAs}. Approved leave is excluded from the percentage.</p>
      <Btn kind="line" onClick={() => { reset(); }}>Reset demo edits</Btn>
      <h2 className="text-xl">Recent audit</h2>
      <ul className="text-sm">{delta.audit.slice(0, 8).map((row) => <li key={row.id}>{row.actor} · {row.action} · {row.detail}</li>)}{delta.audit.length === 0 ? <li className="text-muted">No edits yet this session.</li> : null}</ul>
    </div>
  );
}
