import { hashUnit, tuitionForOrder } from "./engine";
import type {
  AcademicYear,
  Announcement,
  Assignment,
  Book,
  CalendarEvent,
  ClassGrade,
  Exam,
  Homework,
  Invoice,
  Loan,
  Parent,
  Payment,
  Period,
  School,
  SchoolBundle,
  Section,
  Student,
  Subject,
  Teacher,
  TimetableEntry,
  UserAccount,
  World,
} from "./types";

export const SCHOOL_TODAY = "2026-11-17";
export const SCHOOL_CLOCK = "13:10";

export const PERIODS: Period[] = [
  { id: "p1", label: "Period 1", start: "08:20", end: "09:05", kind: "class" },
  { id: "p2", label: "Period 2", start: "09:05", end: "09:50", kind: "class" },
  { id: "p3", label: "Period 3", start: "09:50", end: "10:35", kind: "class" },
  { id: "br", label: "Break", start: "10:35", end: "10:50", kind: "break" },
  { id: "p4", label: "Period 4", start: "10:50", end: "11:35", kind: "class" },
  { id: "p5", label: "Period 5", start: "11:35", end: "12:20", kind: "class" },
  { id: "lu", label: "Lunch", start: "12:20", end: "13:00", kind: "break" },
  { id: "p6", label: "Period 6", start: "13:00", end: "13:45", kind: "class" },
];

const HOLIDAYS = ["2026-10-02", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-11-09"];

const FIRST_F = ["Ananya", "Diya", "Aadhya", "Anika", "Sara", "Navya", "Kiara", "Pari", "Meera", "Kavya", "Aisha", "Isha", "Tanvi", "Nisha", "Riya", "Sneha", "Pooja", "Aditi", "Ishita", "Neha"];
const FIRST_M = ["Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Krishna", "Ishaan", "Kabir", "Rahul", "Rohan", "Dev", "Harsh", "Kunal", "Yash", "Amit", "Neil", "Om", "Jay", "Rudra"];
const LAST = ["Shah", "Patel", "Mehta", "Joshi", "Desai", "Trivedi", "Bhatt", "Kapadia", "Rao", "Iyer", "Nair", "Reddy", "Singh", "Sharma", "Gupta", "Kulkarni", "Naik", "Solanki", "Parmar", "Das"];
const PARENT_F = ["Rekha", "Bhavna", "Hetal", "Pooja", "Nita", "Seema", "Kiran", "Anita"];
const PARENT_M = ["Nilesh", "Harshad", "Prakash", "Amit", "Sanjay", "Vikas", "Rakesh", "Manoj"];
const BLOOD = ["O+", "A+", "B+", "AB+", "O−", "A−"];
const TEACHER_NAMES = ["Meera Joshi", "Rahul Desai", "Kavita Shah", "Amit Patel", "Nisha Rao", "Dev Sharma", "Anjali Mehta", "Siddharth Iyer", "Pooja Nair", "Karan Gupta", "Ritika Kulkarni", "Vivek Naik", "Shreya Bhatt", "Nikhil Trivedi", "Asha Kapadia", "Rohan Solanki", "Priya Reddy", "Manan Parmar", "Juhi Singh", "Arvind Das", "Snehal Joshi", "Tarun Shah", "Bhavika Patel", "Yash Mehta", "Komal Rao", "Harsh Iyer", "Diya Nair", "Kunal Sharma", "Rhea Gupta", "Aakash Kulkarni", "Mira Naik", "Parth Bhatt", "Sana Trivedi", "Vikram Kapadia", "Ishita Solanki", "Neel Reddy", "Tara Parmar", "Aditya Singh", "Lavanya Das", "Omkar Joshi"];

const SUBJECT_DEFS: { name: string; code: string; kind: Subject["kind"] }[] = [
  { name: "English", code: "ENG", kind: "core" },
  { name: "Hindi", code: "HIN", kind: "core" },
  { name: "Gujarati", code: "GUJ", kind: "optional" },
  { name: "Mathematics", code: "MAT", kind: "core" },
  { name: "EVS", code: "EVS", kind: "core" },
  { name: "Science", code: "SCI", kind: "core" },
  { name: "Social Science", code: "SST", kind: "core" },
  { name: "Computer", code: "CSC", kind: "optional" },
  { name: "Physics", code: "PHY", kind: "core" },
  { name: "Chemistry", code: "CHE", kind: "core" },
  { name: "Biology", code: "BIO", kind: "core" },
  { name: "Accountancy", code: "ACC", kind: "core" },
  { name: "Business Studies", code: "BST", kind: "core" },
  { name: "Economics", code: "ECO", kind: "core" },
];

function subjectsFor(order: number, section: string): string[] {
  if (order <= 5) return ["English", "Hindi", "Mathematics", "EVS", "Computer", "Gujarati"];
  if (order <= 8) return ["English", "Hindi", "Mathematics", "Science", "Social Science", "Computer", "Gujarati"];
  if (order <= 10) return ["English", "Hindi", "Mathematics", "Science", "Social Science", "Computer"];
  if (section === "A") return ["English", "Physics", "Chemistry", "Biology", "Mathematics"];
  return ["English", "Accountancy", "Business Studies", "Economics", "Mathematics"];
}

function className(order: number): string {
  return `Class ${order}`;
}

interface BuildInput {
  school: School;
  orders: number[];
  sectionNames: string[];
  studentsPerSection: number;
  staff: { department: string; count: number; qualification: string }[];
  slug: string;
}

function buildBundle(input: BuildInput): SchoolBundle {
  const { school } = input;
  const year: AcademicYear = {
    id: `${school.id}-y2026`,
    schoolId: school.id,
    label: "2026–2027",
    start: "2026-04-01",
    end: "2027-03-31",
    active: true,
  };
  const classes: ClassGrade[] = input.orders.map((order) => ({
    id: `${school.id}-c${order}`,
    schoolId: school.id,
    name: className(order),
    order,
  }));
  const sections: Section[] = [];
  for (const klass of classes) {
    input.sectionNames.forEach((name, index) => {
      sections.push({
        id: `${klass.id}-${name}`,
        schoolId: school.id,
        classId: klass.id,
        name,
        roomId: `${school.code}-R${klass.order}${index + 1}`,
      });
    });
  }
  const subjects: Subject[] = SUBJECT_DEFS.map((subject) => ({
    id: `${school.id}-${subject.code}`,
    schoolId: school.id,
    name: subject.name,
    code: subject.code,
    kind: subject.kind,
  }));
  const subjectByName = new Map(subjects.map((subject) => [subject.name, subject]));
  const teachers: Teacher[] = [];
  let nameCursor = 0;
  for (const group of input.staff) {
    for (let i = 0; i < group.count; i++) {
      const name = TEACHER_NAMES[nameCursor % TEACHER_NAMES.length];
      nameCursor += 1;
      const id = `${school.id}-t${teachers.length + 1}`;
      teachers.push({
        id,
        schoolId: school.id,
        employeeId: `${school.code}-E${String(teachers.length + 1).padStart(3, "0")}`,
        name,
        email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${input.slug}`,
        phone: `98${String(41000000 + teachers.length).slice(0, 8)}`,
        qualification: group.qualification,
        department: group.department,
        designation: teachers.length === 0 ? "Senior Teacher" : "Teacher",
        joiningDate: `${2016 + (teachers.length % 8)}-06-15`,
        status: "active",
      });
    }
  }
  const assignments: Assignment[] = [];
  const load = new Map<string, number>();
  for (const section of sections) {
    const klass = classes.find((item) => item.id === section.classId)!;
    for (const subjectName of subjectsFor(klass.order, section.name)) {
      const subject = subjectByName.get(subjectName)!;
      const pool = teachers
        .filter((teacher) => teacher.department === subjectName)
        .sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
      const teacher = pool[0] ?? teachers[assignments.length % teachers.length];
      load.set(teacher.id, (load.get(teacher.id) ?? 0) + 1);
      assignments.push({
        id: `${section.id}-${subject.code}`,
        schoolId: school.id,
        teacherId: teacher.id,
        classId: klass.id,
        sectionId: section.id,
        subjectId: subject.id,
      });
    }
  }
  const classPeriods = PERIODS.filter((period) => period.kind === "class");
  const timetable: TimetableEntry[] = [];
  const busy = new Set<string>();
  for (let day = 0; day < 5; day++) {
    for (const period of classPeriods) {
      sections.forEach((section, sectionIndex) => {
        const klass = classes.find((item) => item.id === section.classId)!;
        const names = subjectsFor(klass.order, section.name);
        const start = Math.floor(hashUnit(`${section.id}|${day}|${period.id}`) * names.length);
        for (let attempt = 0; attempt < names.length; attempt++) {
          const subjectName = names[(start + attempt + sectionIndex) % names.length];
          const subject = subjectByName.get(subjectName)!;
          const assignment = assignments.find(
            (item) => item.sectionId === section.id && item.subjectId === subject.id,
          )!;
          const key = `${assignment.teacherId}|${day}|${period.id}`;
          if (busy.has(key)) continue;
          busy.add(key);
          timetable.push({
            id: `${section.id}-d${day}-${period.id}`,
            schoolId: school.id,
            sectionId: section.id,
            day,
            periodId: period.id,
            subjectId: subject.id,
            teacherId: assignment.teacherId,
            roomId: section.roomId,
          });
          return;
        }
      });
    }
  }
  const parents: Parent[] = [];
  const students: Student[] = [];
  const guardians: SchoolBundle["guardians"] = [];
  let serial = 1;
  for (const section of sections) {
    const klass = classes.find((item) => item.id === section.classId)!;
    for (let roll = 1; roll <= input.studentsPerSection; roll++) {
      const female = (serial + roll) % 2 === 0;
      const first = (female ? FIRST_F : FIRST_M)[(serial + roll) % 20];
      const last = LAST[(serial * 3 + roll) % LAST.length];
      const parentName = `${(serial % 2 === 0 ? PARENT_F : PARENT_M)[serial % 8]} ${last}`;
      const parentId = `${school.id}-par-${serial}`;
      parents.push({
        id: parentId,
        schoolId: school.id,
        name: parentName,
        email: `parent.${serial}@${input.slug}`,
        phone: `97${String(50000000 + serial).slice(0, 8)}`,
        occupation: serial % 3 === 0 ? "Teacher" : serial % 3 === 1 ? "Engineer" : "Homemaker",
        relationship: serial % 2 === 0 ? "Mother" : "Father",
        address: `${10 + (serial % 80)}, ${school.city}`,
        preference: "in_app",
      });
      const student: Student = {
        id: `${school.id}-stu-${serial}`,
        schoolId: school.id,
        admissionNo: `${school.code}-26-${String(serial).padStart(4, "0")}`,
        firstName: first,
        lastName: last,
        dob: `${2010 + Math.max(0, 12 - klass.order)}-${String((serial % 12) + 1).padStart(2, "0")}-${String((serial % 27) + 1).padStart(2, "0")}`,
        gender: female ? "Female" : "Male",
        classId: klass.id,
        sectionId: section.id,
        roll,
        admissionDate: "2026-04-08",
        bloodGroup: BLOOD[serial % BLOOD.length],
        address: `${10 + (serial % 80)}, ${school.city}`,
        city: school.city,
        state: school.state,
        pin: school.city === "Ahmedabad" ? "380015" : "411001",
        emergencyPhone: `97${String(50000000 + serial).slice(0, 8)}`,
        status: "active",
        parentId,
        series: serial,
        note: serial % 31 === 0 ? "Uses spectacles for board work." : undefined,
      };
      students.push(student);
      guardians.push({
        studentId: student.id,
        parentId,
        relationship: parents[parents.length - 1].relationship,
        primary: true,
      });
      serial += 1;
    }
  }
  const exams: Exam[] = [
    { id: `${school.id}-ut1`, schoolId: school.id, name: "Unit Test 1", type: "unit_test", status: "published", maxMarks: 25 },
    { id: `${school.id}-mid`, schoolId: school.id, name: "Midterm Examination", type: "midterm", status: "published", maxMarks: 80 },
    { id: `${school.id}-fin`, schoolId: school.id, name: "Final Examination", type: "final", status: "scheduled", maxMarks: 100 },
  ];
  const homework: Homework[] = [];
  for (const section of sections) {
    const klass = classes.find((item) => item.id === section.classId)!;
    const names = subjectsFor(klass.order, section.name);
    names.slice(0, 2).forEach((subjectName, index) => {
      const subject = subjectByName.get(subjectName)!;
      const assignment = assignments.find((item) => item.sectionId === section.id && item.subjectId === subject.id)!;
      homework.push({
        id: `${section.id}-hw-${index + 1}`,
        schoolId: school.id,
        classId: klass.id,
        sectionId: section.id,
        subjectId: subject.id,
        teacherId: assignment.teacherId,
        title: index === 0 ? `${subjectName} practice set` : `${subjectName} reading note`,
        description:
          index === 0
            ? `Complete the ${subjectName.toLowerCase()} practice set shared in class. Show working where a method is used.`
            : `Write a short note on today's ${subjectName.toLowerCase()} lesson in your own words.`,
        due: index === 0 ? "2026-11-10" : "2026-11-25",
        maxMarks: 10,
        attachment: index === 0 ? `${subject.code.toLowerCase()}-practice.pdf` : undefined,
      });
    });
  }
  const catalog: Omit<Book, "id" | "schoolId" | "copies">[] = [
    { title: "The Jungle Book", author: "Rudyard Kipling", publisher: "School Press", isbn: "9780000000011", category: "Fiction" },
    { title: "Panchatantra", author: "Traditional", publisher: "School Press", isbn: "9780000000012", category: "Folklore" },
    { title: "Pride and Prejudice", author: "Jane Austen", publisher: "School Press", isbn: "9780000000013", category: "Fiction" },
    { title: "The Time Machine", author: "H. G. Wells", publisher: "School Press", isbn: "9780000000014", category: "Science fiction" },
    { title: "Adventures of Tom Sawyer", author: "Mark Twain", publisher: "School Press", isbn: "9780000000015", category: "Fiction" },
    { title: "Around the World in Eighty Days", author: "Jules Verne", publisher: "School Press", isbn: "9780000000016", category: "Adventure" },
    { title: "Gitanjali", author: "Rabindranath Tagore", publisher: "School Press", isbn: "9780000000017", category: "Poetry" },
    { title: "Aesop's Fables", author: "Aesop", publisher: "School Press", isbn: "9780000000018", category: "Folklore" },
    { title: "A Short History of Science", author: "School Faculty", publisher: "AIS Press", isbn: "9780000000019", category: "Science" },
    { title: "Maps of India", author: "School Faculty", publisher: "AIS Press", isbn: "9780000000020", category: "Reference" },
    { title: "Fun with Numbers", author: "School Faculty", publisher: "AIS Press", isbn: "9780000000021", category: "Mathematics" },
    { title: "Selected Sherlock Holmes", author: "Arthur Conan Doyle", publisher: "School Press", isbn: "9780000000022", category: "Mystery" },
  ];
  const books: Book[] = catalog.map((book, index) => ({
    ...book,
    id: `${school.id}-book-${index + 1}`,
    schoolId: school.id,
    copies: 2,
  }));
  const loans: Loan[] = [];
  students.slice(0, 18).forEach((student, index) => {
    const book = books[index % books.length];
    loans.push({
      id: `${school.id}-loan-${index + 1}`,
      schoolId: school.id,
      bookId: book.id,
      copyNo: 1,
      borrowerId: student.id,
      borrowerKind: "student",
      issuedOn: "2026-10-28",
      dueOn: index % 4 === 0 ? "2026-11-05" : "2026-11-28",
    });
  });
  const events: CalendarEvent[] = [
    { id: `${school.id}-ev1`, schoolId: school.id, title: "Gandhi Jayanti", date: "2026-10-02", kind: "holiday", audience: "all", detail: "School closed." },
    { id: `${school.id}-ev2`, schoolId: school.id, title: "Autumn break", date: "2026-10-20", kind: "holiday", audience: "all", detail: "Break runs 20–23 October." },
    { id: `${school.id}-ev3`, schoolId: school.id, title: "Diwali holiday", date: "2026-11-09", kind: "holiday", audience: "all", detail: "School closed." },
    { id: `${school.id}-ev4`, schoolId: school.id, title: "Midterm examinations", date: "2026-10-12", kind: "exam", audience: "all", detail: "Midterm window opens." },
    { id: `${school.id}-ev5`, schoolId: school.id, title: "Parent meeting", date: "2026-11-21", kind: "meeting", audience: "all", detail: "Class teachers meet families from 09:00." },
    { id: `${school.id}-ev6`, schoolId: school.id, title: "Sports day", date: "2026-12-05", kind: "event", audience: "all", detail: "House events on the main ground." },
    { id: `${school.id}-ev7`, schoolId: school.id, title: "Final examination window", date: "2027-02-16", kind: "exam", audience: "students", detail: "Finals begin for Classes 1–12." },
  ];
  const announcements: Announcement[] = [
    {
      id: `${school.id}-an1`,
      schoolId: school.id,
      title: "Midterm report cards are published",
      body: "Families can open published midterm results from the student or parent portal. Finals are not published yet.",
      audience: "school",
      author: "Principal's office",
      at: "2026-11-12T09:00:00",
    },
    {
      id: `${school.id}-an2`,
      schoolId: school.id,
      title: "Parent meeting on 21 November",
      body: "Please visit the class teacher between 09:00 and 12:00. Carry the student's school diary.",
      audience: "school",
      author: "School office",
      at: "2026-11-15T11:30:00",
    },
  ];
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  students.forEach((student, index) => {
    const klass = classes.find((item) => item.id === student.classId)!;
    const transport = hashUnit(`${student.id}|bus`) < 0.35;
    const items = [
      { label: "Tuition", amount: tuitionForOrder(klass.order) },
      { label: "Examination fee", amount: 1500 },
      { label: "Activity fee", amount: 800 },
    ];
    if (transport) items.push({ label: "Transportation", amount: 6000 });
    const invoice: Invoice = {
      id: `${school.id}-inv-${index + 1}`,
      schoolId: school.id,
      studentId: student.id,
      number: `INV-${school.code}-${String(index + 1).padStart(4, "0")}`,
      dueDate: "2026-09-20",
      items,
      concession: hashUnit(`${student.id}|aid`) < 0.04 ? 4000 : 0,
    };
    invoices.push(invoice);
    const due = invoice.items.reduce((sum, item) => sum + item.amount, 0);
    const bucket = hashUnit(`${student.id}|fee`);
    const paid = bucket < 0.62 ? due - invoice.concession : bucket < 0.82 ? Math.round((due - invoice.concession) * 0.45) : 0;
    if (paid > 0) {
      payments.push({
        id: `${invoice.id}-pay`,
        schoolId: school.id,
        invoiceId: invoice.id,
        studentId: student.id,
        amount: paid,
        method: bucket < 0.4 ? "UPI" : "Cash",
        at: "2026-09-18T10:30:00",
        gatewayRef: bucket < 0.4 ? `mock_${invoice.number}` : "cash-office",
        idempotencyKey: `${invoice.id}-seed`,
        status: "success",
      });
    }
  });
  const users: UserAccount[] = teachers.map((teacher) => ({
    id: `${teacher.id}-user`,
    schoolId: school.id,
    role: "teacher",
    name: teacher.name,
    email: teacher.email,
    password: "Teach#2026",
    phone: teacher.phone,
    teacherId: teacher.id,
    active: true,
  }));
  return {
    school,
    year,
    classes,
    sections,
    subjects,
    teachers,
    assignments,
    parents,
    guardians,
    students,
    users,
    timetable,
    exams,
    homework,
    books,
    loans,
    events,
    announcements,
    invoices,
    payments,
    holidays: HOLIDAYS,
  };
}

const AIS: School = {
  id: "ais",
  name: "Aarav International School",
  code: "AIS",
  city: "Ahmedabad",
  state: "Gujarat",
  board: "CBSE-style internal curriculum",
  timezone: "Asia/Kolkata",
  phone: "079-4000-2100",
  email: "office@aarav.school",
  address: "12 Riverfront Road, Navrangpura, Ahmedabad",
};

const HPS: School = {
  id: "hps",
  name: "Horizon Public School",
  code: "HPS",
  city: "Pune",
  state: "Maharashtra",
  board: "State-board style internal curriculum",
  timezone: "Asia/Kolkata",
  phone: "020-4100-1180",
  email: "office@horizon.school",
  address: "8 Deccan Road, Pune",
};

const PRIMARY_STAFF = [
  { department: "English", count: 4, qualification: "M.A., B.Ed." },
  { department: "Hindi", count: 3, qualification: "M.A., B.Ed." },
  { department: "Mathematics", count: 4, qualification: "M.Sc., B.Ed." },
  { department: "Science", count: 3, qualification: "M.Sc., B.Ed." },
  { department: "EVS", count: 2, qualification: "B.Sc., B.Ed." },
  { department: "Social Science", count: 3, qualification: "M.A., B.Ed." },
  { department: "Computer", count: 2, qualification: "MCA" },
  { department: "Gujarati", count: 2, qualification: "M.A., B.Ed." },
  { department: "Physics", count: 2, qualification: "M.Sc., B.Ed." },
  { department: "Chemistry", count: 2, qualification: "M.Sc., B.Ed." },
  { department: "Biology", count: 2, qualification: "M.Sc., B.Ed." },
  { department: "Accountancy", count: 1, qualification: "M.Com., B.Ed." },
  { department: "Business Studies", count: 1, qualification: "M.Com., B.Ed." },
  { department: "Economics", count: 1, qualification: "M.A., B.Ed." },
];

function personalize(bundle: SchoolBundle): { studentId: string; parentId: string; teacherId: string; siblingId: string } {
  const class8 = bundle.classes.find((item) => item.order === 8)!;
  const class5 = bundle.classes.find((item) => item.order === 5)!;
  const section8 = bundle.sections.find((item) => item.classId === class8.id && item.name === "A")!;
  const section5 = bundle.sections.find((item) => item.classId === class5.id && item.name === "A")!;
  const student = bundle.students.find((item) => item.sectionId === section8.id && item.roll === 4)!;
  const sibling = bundle.students.find((item) => item.sectionId === section5.id && item.roll === 3)!;
  student.firstName = "Anika";
  student.lastName = "Shah";
  student.series = 143;
  student.gender = "Female";
  sibling.firstName = "Kabir";
  sibling.lastName = "Shah";
  sibling.series = 4;
  sibling.gender = "Male";
  const previousParent = sibling.parentId;
  sibling.parentId = student.parentId;
  bundle.guardians.push({
    studentId: sibling.id,
    parentId: student.parentId,
    relationship: "Mother",
    primary: true,
  });
  bundle.guardians = bundle.guardians.map((link) =>
    link.studentId === sibling.id && link.parentId === previousParent ? { ...link, primary: false } : link,
  );
  const parent = bundle.parents.find((item) => item.id === student.parentId)!;
  parent.name = "Rekha Shah";
  parent.email = "parent@edunexus.school";
  parent.relationship = "Mother";
  parent.phone = "9790002211";
  const math = bundle.subjects.find((item) => item.name === "Mathematics")!;
  const mathAssign = bundle.assignments.find((item) => item.sectionId === section8.id && item.subjectId === math.id)!;
  const teacher = bundle.teachers.find((item) => item.id === mathAssign.teacherId)!;
  teacher.name = "Meera Joshi";
  teacher.email = "teacher@edunexus.school";
  teacher.department = "Mathematics";
  teacher.qualification = "M.Sc., B.Ed.";
  const teacherUser = bundle.users.find((item) => item.teacherId === teacher.id)!;
  teacherUser.name = "Meera Joshi";
  teacherUser.email = "teacher@edunexus.school";
  teacherUser.password = "Teacher#2026";
  return { studentId: student.id, parentId: parent.id, teacherId: teacher.id, siblingId: sibling.id };
}

function roleUser(partial: Omit<UserAccount, "active" | "phone"> & { phone?: string }): UserAccount {
  return { active: true, phone: partial.phone ?? "9800000000", ...partial };
}

export function buildWorld(): World {
  const ais = buildBundle({
    school: AIS,
    orders: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    sectionNames: ["A", "B"],
    studentsPerSection: 14,
    staff: PRIMARY_STAFF,
    slug: "aarav.school",
  });
  const hps = buildBundle({
    school: HPS,
    orders: [1, 2, 3, 4, 5],
    sectionNames: ["A"],
    studentsPerSection: 10,
    staff: [
      { department: "English", count: 1, qualification: "M.A., B.Ed." },
      { department: "Hindi", count: 1, qualification: "M.A., B.Ed." },
      { department: "Mathematics", count: 2, qualification: "M.Sc., B.Ed." },
      { department: "EVS", count: 1, qualification: "B.Sc., B.Ed." },
      { department: "Computer", count: 1, qualification: "MCA" },
      { department: "Gujarati", count: 1, qualification: "M.A., B.Ed." },
      { department: "Science", count: 1, qualification: "M.Sc., B.Ed." },
    ],
    slug: "horizon.school",
  });
  const demo = personalize(ais);
  const staff: UserAccount[] = [
    roleUser({ id: "user-super", schoolId: null, role: "super_admin", name: "Platform Admin", email: "super@edunexus.school", password: "Super#2026" }),
    roleUser({ id: "user-admin", schoolId: "ais", role: "school_admin", name: "Nandini Desai", email: "admin@edunexus.school", password: "Admin#2026" }),
    roleUser({ id: "user-principal", schoolId: "ais", role: "principal", name: "Harish Trivedi", email: "principal@edunexus.school", password: "Principal#2026" }),
    roleUser({ id: "user-coord", schoolId: "ais", role: "coordinator", name: "Leela Iyer", email: "coord@edunexus.school", password: "Coord#2026" }),
    roleUser({ id: "user-student", schoolId: "ais", role: "student", name: "Anika Shah", email: "student@edunexus.school", password: "Student#2026", studentId: demo.studentId }),
    roleUser({ id: "user-parent", schoolId: "ais", role: "parent", name: "Rekha Shah", email: "parent@edunexus.school", password: "Parent#2026", parentId: demo.parentId }),
    roleUser({ id: "user-accounts", schoolId: "ais", role: "accountant", name: "Paresh Mehta", email: "accounts@edunexus.school", password: "Accounts#2026" }),
    roleUser({ id: "user-library", schoolId: "ais", role: "librarian", name: "Hema Kapadia", email: "library@edunexus.school", password: "Library#2026" }),
    roleUser({ id: "user-front", schoolId: "ais", role: "receptionist", name: "Jigna Solanki", email: "front@edunexus.school", password: "Front#2026" }),
    roleUser({ id: "user-hps-admin", schoolId: "hps", role: "school_admin", name: "Suresh Kulkarni", email: "admin@horizon.school", password: "Horizon#2026" }),
  ];
  const users = [...staff, ...ais.users, ...hps.users];
  return {
    bundles: [ais, hps],
    periods: PERIODS,
    users,
    policy: { threshold: 75, lateCountsAs: 1, halfDayCountsAs: 0.5, excludeApprovedLeave: true },
    gradeScale: [
      { min: 91, grade: "A1", point: 10 },
      { min: 81, grade: "A2", point: 9 },
      { min: 71, grade: "B1", point: 8 },
      { min: 61, grade: "B2", point: 7 },
      { min: 51, grade: "C1", point: 6 },
      { min: 41, grade: "C2", point: 5 },
      { min: 33, grade: "D", point: 4 },
      { min: 0, grade: "E", point: 0 },
    ],
    today: SCHOOL_TODAY,
    clock: SCHOOL_CLOCK,
  };
}

let cached: World | null = null;
export function getWorld(): World {
  if (!cached) cached = buildWorld();
  return cached;
}
