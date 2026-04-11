/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   ONYX HR AUTONOMY ENGINE                                             ║
 * ║   מערכת משאבי אנוש אוטונומית — טכנו כל עוזי                          ║
 * ║                                                                        ║
 * ║   מכסה את כל מחזור חיי העובד:                                          ║
 * ║   גיוס → קליטה → נוכחות → שכר → הערכה → הכשרה → משמעת → עזיבה       ║
 * ║                                                                        ║
 * ║   כל תהליך אוטומטי עם אישורים, audit trail, ו-compliance              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 *   EMPLOYEE LIFECYCLE:
 *
 *   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
 *   │ RECRUIT │ → │ ONBOARD │ → │ ACTIVE  │ → │ OFFBOARD│
 *   └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘
 *        │             │             │              │
 *   • משרה         • חוזה       • נוכחות        • מכתב
 *   • מודעה        • ציוד       • שעות          • גמר חשבון
 *   • מועמדים      • הדרכה      • חופשות        • ציוד חזרה
 *   • ראיונות      • מנטור      • שכר           • exit interview
 *   • החלטה        • גישות      • הערכות        • ארכיון
 *   • הצעה                     • הכשרות
 *                              • משמעת
 *                              • קידום
 */

import * as crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type Department = 'ייצור' | 'התקנות' | 'מכירות' | 'הנהלה' | 'כספים' | 'לוגיסטיקה' | 'שיווק' | 'IT' | 'בטיחות' | 'אחזקה' | 'מחסן' | 'נדלן' | 'custom';
type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'temporary' | 'intern';
type EmployeeStatus = 'candidate' | 'onboarding' | 'active' | 'probation' | 'suspended' | 'notice_period' | 'terminated' | 'resigned' | 'retired';

/** עובד */
interface Employee {
  id: string;
  /** פרטים אישיים */
  personal: {
    firstName: string;
    lastName: string;
    fullName: string;
    idNumber: string;          // ת.ז
    dateOfBirth?: string;
    phone: string;
    email?: string;
    address?: string;
    emergencyContact?: { name: string; phone: string; relation: string };
    bankDetails?: { bankName: string; branch: string; accountNumber: string };
    photo?: string;
  };
  /** פרטי העסקה */
  employment: {
    status: EmployeeStatus;
    department: Department;
    position: string;
    manager: string;           // employee ID of manager
    employmentType: EmploymentType;
    startDate: string;
    endDate?: string;
    probationEndDate?: string;
    salary: SalaryInfo;
    workSchedule: WorkSchedule;
    contractId?: string;       // DMS document ID
  };
  /** מיומנויות ותעודות */
  qualifications: {
    skills: string[];
    certifications: Array<{ name: string; issuedDate: string; expiresDate?: string; documentId?: string }>;
    languages: string[];
    education?: string;
    licenses?: Array<{ type: string; number: string; expires: string }>;
  };
  /** ציוד שהוקצה */
  equipment: Array<{ item: string; serialNumber?: string; issuedDate: string; returnedDate?: string; condition?: string }>;
  /** הערכות ביצוע */
  reviews: PerformanceReview[];
  /** היסטוריית משמעת */
  disciplinary: DisciplinaryRecord[];
  /** חופשות */
  leave: LeaveBalance;
  /** הכשרות */
  training: TrainingRecord[];
  /** הערות */
  notes: Array<{ date: string; author: string; text: string; private: boolean }>;
  /** audit */
  audit: Array<{ timestamp: number; action: string; actor: string; detail: string; prev?: unknown; next?: unknown }>;
  /** מטא */
  createdAt: number;
  updatedAt: number;
}

interface SalaryInfo {
  baseSalary: number;          // ברוטו חודשי
  hourlyRate?: number;
  currency: string;
  payFrequency: 'monthly' | 'biweekly' | 'weekly';
  /** תוספות */
  allowances: Array<{ name: string; amount: number; taxable: boolean }>;
  /** ניכויים */
  deductions: Array<{ name: string; amount: number; type: 'fixed' | 'percent' }>;
  /** היסטוריית שכר */
  history: Array<{ date: string; baseSalary: number; reason: string; approvedBy: string }>;
  lastRaise?: string;
  nextReviewDate?: string;
}

interface WorkSchedule {
  type: 'regular' | 'shifts' | 'flexible';
  weeklyHours: number;
  workDays: number[];          // 0=Sunday
  startTime?: string;          // HH:MM
  endTime?: string;
  breakMinutes: number;
}

interface PerformanceReview {
  id: string;
  period: string;              // "Q1 2026"
  reviewDate: string;
  reviewerId: string;
  reviewerName: string;
  scores: {
    quality: number;           // 1-5
    productivity: number;
    teamwork: number;
    reliability: number;
    initiative: number;
    safety: number;
    overall: number;
  };
  strengths: string[];
  improvements: string[];
  goals: Array<{ goal: string; deadline: string; status: 'pending' | 'in_progress' | 'completed' | 'missed' }>;
  comments: string;
  employeeComments?: string;
  status: 'draft' | 'submitted' | 'acknowledged' | 'disputed';
}

interface DisciplinaryRecord {
  id: string;
  date: string;
  type: 'verbal_warning' | 'written_warning' | 'final_warning' | 'suspension' | 'termination';
  reason: string;
  description: string;
  issuedBy: string;
  witnesses?: string[];
  employeeResponse?: string;
  followUpDate?: string;
  followUpCompleted: boolean;
  documentId?: string;
}

interface LeaveBalance {
  annual: { entitled: number; used: number; remaining: number; pendingApproval: number };
  sick: { entitled: number; used: number; remaining: number };
  personal: { entitled: number; used: number; remaining: number };
  /** היסטוריית חופשות */
  history: LeaveRequest[];
}

interface LeaveRequest {
  id: string;
  type: 'annual' | 'sick' | 'personal' | 'unpaid' | 'military' | 'maternity' | 'paternity' | 'bereavement';
  startDate: string;
  endDate: string;
  days: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approvedBy?: string;
  approvedAt?: number;
  requestedAt: number;
  attachmentId?: string;
}

interface TrainingRecord {
  id: string;
  name: string;
  type: 'safety' | 'technical' | 'management' | 'compliance' | 'onboarding' | 'custom';
  date: string;
  duration: string;
  provider: string;
  status: 'scheduled' | 'completed' | 'failed' | 'cancelled';
  score?: number;
  certificateId?: string;
  expiresDate?: string;
  mandatory: boolean;
}

/** משרה פתוחה */
interface JobOpening {
  id: string;
  title: string;
  department: Department;
  description: string;
  requirements: string[];
  salaryRange: { min: number; max: number };
  employmentType: EmploymentType;
  location: string;
  urgent: boolean;
  status: 'draft' | 'open' | 'interviewing' | 'offered' | 'filled' | 'cancelled';
  publishedTo: string[];      // ערוצי פרסום
  candidates: Candidate[];
  createdAt: number;
  createdBy: string;
  filledBy?: string;
  filledAt?: number;
}

/** מועמד */
interface Candidate {
  id: string;
  name: string;
  phone: string;
  email?: string;
  source: string;             // מודעה/המלצה/פייסבוק
  resume?: string;            // document ID
  status: 'new' | 'screening' | 'phone_interview' | 'in_person_interview' | 'test' | 'offer' | 'accepted' | 'rejected' | 'withdrawn';
  rating: number;             // 1-5
  interviews: Array<{ date: string; interviewer: string; notes: string; rating: number; recommendation: 'hire' | 'maybe' | 'reject' }>;
  offeredSalary?: number;
  offeredAt?: number;
  rejectionReason?: string;
  notes: string;
  appliedAt: number;
}

/** נוכחות */
interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  clockIn?: string;            // HH:MM
  clockOut?: string;
  breakMinutes: number;
  totalHours: number;
  overtime: number;
  status: 'present' | 'absent' | 'late' | 'half_day' | 'remote' | 'sick' | 'leave' | 'holiday';
  notes?: string;
  approvedBy?: string;
  location?: string;
}

/** תבנית onboarding */
interface OnboardingChecklist {
  employeeId: string;
  items: Array<{
    task: string;
    category: 'documents' | 'equipment' | 'training' | 'access' | 'introduction' | 'safety' | 'admin';
    assignee: string;
    dueDate: string;
    completed: boolean;
    completedAt?: number;
    completedBy?: string;
    notes?: string;
  }>;
  startDate: string;
  targetCompletionDate: string;
  status: 'in_progress' | 'completed' | 'overdue';
  completedPercent: number;
}

/** תבנית offboarding */
interface OffboardingChecklist {
  employeeId: string;
  items: Array<{
    task: string;
    category: 'equipment' | 'access' | 'documents' | 'knowledge_transfer' | 'financial' | 'exit';
    assignee: string;
    completed: boolean;
    completedAt?: number;
    notes?: string;
  }>;
  lastDay: string;
  exitInterview?: { date: string; conductor: string; feedback: string; wouldRehire: boolean };
  status: 'in_progress' | 'completed';
}

interface PayrollEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;              // "2026-04"
  baseSalary: number;
  overtimeHours: number;
  overtimePay: number;
  allowances: Array<{ name: string; amount: number }>;
  grossPay: number;
  deductions: Array<{ name: string; amount: number }>;
  incomeTax: number;
  nationalInsurance: number;
  healthInsurance: number;
  pension: number;
  netPay: number;
  status: 'draft' | 'calculated' | 'approved' | 'paid';
  paidAt?: number;
  payslipDocId?: string;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: EMPLOYEE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

class EmployeeRegistry {
  private employees: Map<string, Employee> = new Map();

  add(params: {
    firstName: string; lastName: string; idNumber: string; phone: string;
    email?: string; address?: string; dateOfBirth?: string;
    department: Department; position: string; manager: string;
    employmentType: EmploymentType; startDate: string;
    baseSalary: number; workDays?: number[]; weeklyHours?: number;
    skills?: string[];
    emergencyContact?: Employee['personal']['emergencyContact'];
    bankDetails?: Employee['personal']['bankDetails'];
  }): Employee {
    const id = `emp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
    const emp: Employee = {
      id,
      personal: {
        firstName: params.firstName, lastName: params.lastName,
        fullName: `${params.firstName} ${params.lastName}`,
        idNumber: params.idNumber, phone: params.phone,
        email: params.email, address: params.address,
        dateOfBirth: params.dateOfBirth,
        emergencyContact: params.emergencyContact,
        bankDetails: params.bankDetails,
      },
      employment: {
        status: 'onboarding', department: params.department,
        position: params.position, manager: params.manager,
        employmentType: params.employmentType, startDate: params.startDate,
        probationEndDate: this.addMonths(params.startDate, 6),
        salary: {
          baseSalary: params.baseSalary, currency: 'ILS',
          payFrequency: 'monthly', allowances: [], deductions: [],
          history: [{ date: params.startDate, baseSalary: params.baseSalary, reason: 'התחלת עבודה', approvedBy: 'system' }],
        },
        workSchedule: {
          type: 'regular', weeklyHours: params.weeklyHours ?? 42,
          workDays: params.workDays ?? [0, 1, 2, 3, 4], // א-ה
          startTime: '07:00', endTime: '16:00', breakMinutes: 30,
        },
      },
      qualifications: { skills: params.skills ?? [], certifications: [], languages: ['עברית'] },
      equipment: [], reviews: [], disciplinary: [],
      leave: {
        annual: { entitled: this.calcAnnualLeave(params.startDate), used: 0, remaining: 0, pendingApproval: 0 },
        sick: { entitled: 18, used: 0, remaining: 18 },
        personal: { entitled: 3, used: 0, remaining: 3 },
        history: [],
      },
      training: [], notes: [],
      audit: [{ timestamp: Date.now(), action: 'employee_created', actor: 'system', detail: `${params.firstName} ${params.lastName} — ${params.position}` }],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    emp.leave.annual.remaining = emp.leave.annual.entitled;
    this.employees.set(id, emp);
    return emp;
  }

  get(id: string): Employee | undefined { return this.employees.get(id); }
  getAll(): Employee[] { return Array.from(this.employees.values()); }
  getActive(): Employee[] { return this.getAll().filter(e => e.employment.status === 'active' || e.employment.status === 'probation'); }
  getByDepartment(dept: Department): Employee[] { return this.getActive().filter(e => e.employment.department === dept); }
  getByManager(managerId: string): Employee[] { return this.getActive().filter(e => e.employment.manager === managerId); }

  search(query: string): Employee[] {
    const q = query.toLowerCase();
    return this.getAll().filter(e =>
      e.personal.fullName.toLowerCase().includes(q) ||
      e.personal.idNumber.includes(q) ||
      e.personal.phone.includes(q) ||
      e.employment.position.toLowerCase().includes(q) ||
      e.employment.department.includes(q)
    );
  }

  update(id: string, updates: Partial<Pick<Employee['personal'], 'phone' | 'email' | 'address'>>, actor: string): void {
    const emp = this.employees.get(id);
    if (!emp) return;
    const prev = { ...emp.personal };
    Object.assign(emp.personal, updates);
    emp.updatedAt = Date.now();
    emp.audit.push({ timestamp: Date.now(), action: 'personal_updated', actor, detail: JSON.stringify(updates), prev, next: { ...emp.personal } });
  }

  private calcAnnualLeave(startDate: string): number {
    // חוק ישראלי: 12 ימים ב-4 שנים ראשונות, 14 בשנה 5, וכו'
    const years = (Date.now() - new Date(startDate).getTime()) / (365.25 * 86400000);
    if (years < 4) return 12;
    if (years < 5) return 14;
    if (years < 6) return 16;
    if (years < 7) return 18;
    if (years < 8) return 21;
    return 24; // 14+ שנים
  }

  private addMonths(date: string, months: number): string {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: RECRUITMENT ENGINE — גיוס
// ═══════════════════════════════════════════════════════════════════════════

class RecruitmentEngine {
  private openings: Map<string, JobOpening> = new Map();

  /** פתח משרה */
  createOpening(params: {
    title: string; department: Department; description: string;
    requirements: string[]; salaryRange: { min: number; max: number };
    employmentType: EmploymentType; location?: string;
    urgent?: boolean; createdBy: string;
  }): JobOpening {
    const opening: JobOpening = {
      id: `job_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      title: params.title, department: params.department,
      description: params.description, requirements: params.requirements,
      salaryRange: params.salaryRange, employmentType: params.employmentType,
      location: params.location ?? 'ריבל 37, תל אביב',
      urgent: params.urgent ?? false,
      status: 'open', publishedTo: [], candidates: [],
      createdAt: Date.now(), createdBy: params.createdBy,
    };
    this.openings.set(opening.id, opening);
    return opening;
  }

  /** הוסף מועמד */
  addCandidate(openingId: string, params: {
    name: string; phone: string; email?: string;
    source: string; notes?: string;
  }): Candidate | null {
    const opening = this.openings.get(openingId);
    if (!opening) return null;
    const candidate: Candidate = {
      id: `cand_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`,
      name: params.name, phone: params.phone, email: params.email,
      source: params.source, status: 'new', rating: 0,
      interviews: [], notes: params.notes ?? '', appliedAt: Date.now(),
    };
    opening.candidates.push(candidate);
    return candidate;
  }

  /** תעד ראיון */
  recordInterview(openingId: string, candidateId: string, interview: {
    date: string; interviewer: string; notes: string;
    rating: number; recommendation: 'hire' | 'maybe' | 'reject';
  }): void {
    const opening = this.openings.get(openingId);
    const candidate = opening?.candidates.find(c => c.id === candidateId);
    if (!candidate) return;
    candidate.interviews.push(interview);
    candidate.rating = Math.round(candidate.interviews.reduce((s, i) => s + i.rating, 0) / candidate.interviews.length * 10) / 10;
    if (interview.recommendation === 'reject') candidate.status = 'rejected';
    else if (candidate.interviews.length >= 2 && candidate.interviews.every(i => i.recommendation === 'hire')) candidate.status = 'offer';
    else candidate.status = 'in_person_interview';
  }

  /** שלח הצעה */
  makeOffer(openingId: string, candidateId: string, salary: number): void {
    const opening = this.openings.get(openingId);
    const candidate = opening?.candidates.find(c => c.id === candidateId);
    if (!candidate) return;
    candidate.status = 'offer';
    candidate.offeredSalary = salary;
    candidate.offeredAt = Date.now();
  }

  /** מועמד קיבל — ממשיך ל-onboarding */
  acceptOffer(openingId: string, candidateId: string): { candidate: Candidate; opening: JobOpening } | null {
    const opening = this.openings.get(openingId);
    const candidate = opening?.candidates.find(c => c.id === candidateId);
    if (!candidate || !opening) return null;
    candidate.status = 'accepted';
    opening.status = 'filled';
    opening.filledBy = candidate.id;
    opening.filledAt = Date.now();
    return { candidate, opening };
  }

  /** בנה הודעת גיוס לפרסום */
  buildJobPost(openingId: string): string {
    const o = this.openings.get(openingId);
    if (!o) return '';
    return [
      `🔔 דרוש/ה: ${o.title}`,
      `📍 ${o.location}`,
      `🏢 מחלקת ${o.department} — טכנו כל עוזי בע"מ`,
      ``,
      `📋 תיאור:`,
      o.description,
      ``,
      `✅ דרישות:`,
      ...o.requirements.map(r => `• ${r}`),
      ``,
      `💰 שכר: ₪${o.salaryRange.min.toLocaleString()}-₪${o.salaryRange.max.toLocaleString()}`,
      `📅 סוג: ${o.employmentType === 'full_time' ? 'משרה מלאה' : o.employmentType}`,
      o.urgent ? `\n🔴 דחוף!` : '',
      ``,
      `📱 קו"ח ופניות: קורין — 054-XXXXXXX`,
      `📧 jobs@technokoluzi.com`,
    ].filter(Boolean).join('\n');
  }

  getOpening(id: string): JobOpening | undefined { return this.openings.get(id); }
  getOpenOpenings(): JobOpening[] { return Array.from(this.openings.values()).filter(o => o.status === 'open' || o.status === 'interviewing'); }
  getAllOpenings(): JobOpening[] { return Array.from(this.openings.values()); }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: ONBOARDING / OFFBOARDING ENGINE
// ═══════════════════════════════════════════════════════════════════════════

class OnOffboardingEngine {
  private onboardings: Map<string, OnboardingChecklist> = new Map();
  private offboardings: Map<string, OffboardingChecklist> = new Map();

  /** צור checklist onboarding */
  createOnboarding(employeeId: string, startDate: string, managerName: string): OnboardingChecklist {
    const checklist: OnboardingChecklist = {
      employeeId, startDate,
      targetCompletionDate: this.addDays(startDate, 14),
      status: 'in_progress', completedPercent: 0,
      items: [
        // מסמכים
        { task: 'חתימה על חוזה העסקה', category: 'documents', assignee: 'HR', dueDate: startDate, completed: false },
        { task: 'צילום ת.ז + ספח', category: 'documents', assignee: 'HR', dueDate: startDate, completed: false },
        { task: 'טופס 101', category: 'documents', assignee: 'HR', dueDate: startDate, completed: false },
        { task: 'הרשאת בנק', category: 'documents', assignee: 'HR', dueDate: this.addDays(startDate, 3), completed: false },
        { task: 'הצהרת בריאות', category: 'documents', assignee: 'HR', dueDate: startDate, completed: false },
        { task: 'טופס קבלת ציוד', category: 'documents', assignee: 'HR', dueDate: startDate, completed: false },
        // ציוד
        { task: 'ביגוד עבודה', category: 'equipment', assignee: 'מחסן', dueDate: startDate, completed: false },
        { task: 'ציוד בטיחות (נעליים, קסדה, כפפות)', category: 'equipment', assignee: 'מחסן', dueDate: startDate, completed: false },
        { task: 'כלי עבודה אישיים', category: 'equipment', assignee: 'מחסן', dueDate: this.addDays(startDate, 1), completed: false },
        { task: 'מפתחות / כרטיס גישה', category: 'equipment', assignee: 'מנהל', dueDate: startDate, completed: false },
        { task: 'טלפון / סים (אם רלוונטי)', category: 'equipment', assignee: 'IT', dueDate: this.addDays(startDate, 3), completed: false },
        // הדרכות
        { task: 'הדרכת בטיחות ראשונית', category: 'training', assignee: 'בטיחות', dueDate: startDate, completed: false },
        { task: 'הדרכת כיבוי אש', category: 'training', assignee: 'בטיחות', dueDate: this.addDays(startDate, 7), completed: false },
        { task: 'הכרת נהלי חברה', category: 'training', assignee: 'HR', dueDate: this.addDays(startDate, 3), completed: false },
        { task: 'הדרכה מקצועית ראשונית', category: 'training', assignee: managerName, dueDate: this.addDays(startDate, 7), completed: false },
        // גישות
        { task: 'הוספה לקבוצת WhatsApp', category: 'access', assignee: managerName, dueDate: startDate, completed: false },
        { task: 'הוספה למערכת נוכחות', category: 'access', assignee: 'HR', dueDate: startDate, completed: false },
        { task: 'הוספה למערכת ERP', category: 'access', assignee: 'IT', dueDate: this.addDays(startDate, 1), completed: false },
        // היכרות
        { task: 'היכרות עם הצוות', category: 'introduction', assignee: managerName, dueDate: startDate, completed: false },
        { task: 'סיור במפעל', category: 'introduction', assignee: managerName, dueDate: startDate, completed: false },
        { task: 'הצגה לעובדי ייצור', category: 'introduction', assignee: managerName, dueDate: this.addDays(startDate, 1), completed: false },
        // בטיחות
        { task: 'חתימה על טופס בטיחות', category: 'safety', assignee: 'בטיחות', dueDate: startDate, completed: false },
        { task: 'הכרת יציאות חירום', category: 'safety', assignee: 'בטיחות', dueDate: startDate, completed: false },
        // אדמיניסטרטיבי
        { task: 'דיווח לביטוח לאומי', category: 'admin', assignee: 'כספים', dueDate: this.addDays(startDate, 7), completed: false },
        { task: 'רישום לקרן פנסיה', category: 'admin', assignee: 'כספים', dueDate: this.addDays(startDate, 14), completed: false },
        { task: 'רישום לקופת גמל', category: 'admin', assignee: 'כספים', dueDate: this.addDays(startDate, 14), completed: false },
      ],
    };
    this.onboardings.set(employeeId, checklist);
    return checklist;
  }

  /** סמן משימת onboarding כבוצעה */
  completeOnboardingItem(employeeId: string, taskIndex: number, by: string): void {
    const checklist = this.onboardings.get(employeeId);
    if (!checklist || !checklist.items[taskIndex]) return;
    checklist.items[taskIndex].completed = true;
    checklist.items[taskIndex].completedAt = Date.now();
    checklist.items[taskIndex].completedBy = by;
    checklist.completedPercent = Math.round(checklist.items.filter(i => i.completed).length / checklist.items.length * 100);
    if (checklist.completedPercent === 100) checklist.status = 'completed';
    else if (new Date(checklist.targetCompletionDate).getTime() < Date.now()) checklist.status = 'overdue';
  }

  /** צור checklist offboarding */
  createOffboarding(employeeId: string, lastDay: string, managerName: string): OffboardingChecklist {
    const checklist: OffboardingChecklist = {
      employeeId, lastDay, status: 'in_progress',
      items: [
        { task: 'מכתב התפטרות / סיום', category: 'documents', assignee: 'HR', completed: false },
        { task: 'גמר חשבון — חישוב', category: 'financial', assignee: 'כספים', completed: false },
        { task: 'פדיון ימי חופשה', category: 'financial', assignee: 'כספים', completed: false },
        { task: 'שחרור כספי פנסיה/גמל (אם רלוונטי)', category: 'financial', assignee: 'כספים', completed: false },
        { task: 'החזרת ציוד עבודה', category: 'equipment', assignee: managerName, completed: false },
        { task: 'החזרת מפתחות / כרטיס גישה', category: 'equipment', assignee: managerName, completed: false },
        { task: 'החזרת טלפון / ציוד IT', category: 'equipment', assignee: 'IT', completed: false },
        { task: 'הסרה ממערכת נוכחות', category: 'access', assignee: 'HR', completed: false },
        { task: 'הסרה מקבוצות WhatsApp', category: 'access', assignee: managerName, completed: false },
        { task: 'הסרה ממערכת ERP', category: 'access', assignee: 'IT', completed: false },
        { task: 'העברת ידע למחליף', category: 'knowledge_transfer', assignee: managerName, completed: false },
        { task: 'תיעוד פרויקטים פתוחים', category: 'knowledge_transfer', assignee: managerName, completed: false },
        { task: 'שיחת יציאה (exit interview)', category: 'exit', assignee: 'HR', completed: false },
        { task: 'אישור סיום מחשבת שכר', category: 'documents', assignee: 'כספים', completed: false },
        { task: 'טופס 161 / אישור תקופת עבודה', category: 'documents', assignee: 'כספים', completed: false },
      ],
    };
    this.offboardings.set(employeeId, checklist);
    return checklist;
  }

  getOnboarding(employeeId: string): OnboardingChecklist | undefined { return this.onboardings.get(employeeId); }
  getOffboarding(employeeId: string): OffboardingChecklist | undefined { return this.offboardings.get(employeeId); }
  getOverdueOnboardings(): OnboardingChecklist[] { return Array.from(this.onboardings.values()).filter(c => c.status !== 'completed' && new Date(c.targetCompletionDate).getTime() < Date.now()); }

  private addDays(date: string, days: number): string {
    const d = new Date(date); d.setDate(d.getDate() + days); return d.toISOString().split('T')[0];
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: ATTENDANCE & LEAVE ENGINE — נוכחות וחופשות
// ═══════════════════════════════════════════════════════════════════════════

class AttendanceEngine {
  private records: AttendanceRecord[] = [];

  /** רשום כניסה */
  clockIn(employeeId: string, time?: string, location?: string): AttendanceRecord {
    const now = new Date();
    const record: AttendanceRecord = {
      id: `att_${Date.now().toString(36)}`,
      employeeId,
      date: now.toISOString().split('T')[0],
      clockIn: time ?? `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
      breakMinutes: 0, totalHours: 0, overtime: 0,
      status: 'present', location,
    };
    this.records.push(record);
    return record;
  }

  /** רשום יציאה */
  clockOut(employeeId: string, time?: string): AttendanceRecord | undefined {
    const today = new Date().toISOString().split('T')[0];
    const record = this.records.find(r => r.employeeId === employeeId && r.date === today && !r.clockOut);
    if (!record) return undefined;

    const now = new Date();
    record.clockOut = time ?? `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    // חשב שעות
    const [inH, inM] = record.clockIn!.split(':').map(Number);
    const [outH, outM] = record.clockOut.split(':').map(Number);
    const totalMinutes = (outH * 60 + outM) - (inH * 60 + inM) - record.breakMinutes;
    record.totalHours = Math.round(totalMinutes / 60 * 100) / 100;

    // שעות נוספות (מעל 8.6 שעות ליום עבודה רגיל)
    record.overtime = Math.max(0, Math.round((record.totalHours - 8.6) * 100) / 100);

    // בדוק איחור
    if (record.clockIn && record.clockIn > '07:15') record.status = 'late';

    return record;
  }

  /** רשום היעדרות */
  recordAbsence(employeeId: string, date: string, status: AttendanceRecord['status'], notes?: string): AttendanceRecord {
    const record: AttendanceRecord = {
      id: `att_${Date.now().toString(36)}`, employeeId, date,
      breakMinutes: 0, totalHours: 0, overtime: 0,
      status, notes,
    };
    this.records.push(record);
    return record;
  }

  /** שלוף נוכחות עובד */
  getByEmployee(employeeId: string, month?: string): AttendanceRecord[] {
    return this.records.filter(r => r.employeeId === employeeId && (!month || r.date.startsWith(month))).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** סיכום חודשי */
  getMonthlySummary(employeeId: string, month: string): {
    totalDays: number; presentDays: number; absentDays: number;
    lateDays: number; totalHours: number; overtimeHours: number;
    sickDays: number; leaveDays: number;
  } {
    const records = this.getByEmployee(employeeId, month);
    return {
      totalDays: records.length,
      presentDays: records.filter(r => r.status === 'present' || r.status === 'late').length,
      absentDays: records.filter(r => r.status === 'absent').length,
      lateDays: records.filter(r => r.status === 'late').length,
      totalHours: Math.round(records.reduce((s, r) => s + r.totalHours, 0) * 100) / 100,
      overtimeHours: Math.round(records.reduce((s, r) => s + r.overtime, 0) * 100) / 100,
      sickDays: records.filter(r => r.status === 'sick').length,
      leaveDays: records.filter(r => r.status === 'leave').length,
    };
  }

  /** מי לא נמצא היום */
  getTodayAbsent(allEmployeeIds: string[]): string[] {
    const today = new Date().toISOString().split('T')[0];
    const presentIds = this.records.filter(r => r.date === today && r.clockIn).map(r => r.employeeId);
    return allEmployeeIds.filter(id => !presentIds.includes(id));
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: LEAVE MANAGER — חופשות
// ═══════════════════════════════════════════════════════════════════════════

class LeaveManager {
  /** בקש חופשה */
  requestLeave(employee: Employee, params: {
    type: LeaveRequest['type']; startDate: string; endDate: string;
    days: number; reason?: string;
  }): LeaveRequest {
    const request: LeaveRequest = {
      id: `leave_${Date.now().toString(36)}`,
      type: params.type, startDate: params.startDate, endDate: params.endDate,
      days: params.days, reason: params.reason,
      status: 'pending', requestedAt: Date.now(),
    };
    employee.leave.history.push(request);
    employee.leave.annual.pendingApproval += params.type === 'annual' ? params.days : 0;
    employee.audit.push({ timestamp: Date.now(), action: 'leave_requested', actor: employee.id, detail: `${params.type}: ${params.startDate} — ${params.endDate} (${params.days} ימים)` });
    return request;
  }

  /** אשר חופשה */
  approveLeave(employee: Employee, leaveId: string, approver: string): boolean {
    const request = employee.leave.history.find(l => l.id === leaveId);
    if (!request || request.status !== 'pending') return false;

    // בדוק יתרה
    const balance = employee.leave[request.type === 'annual' ? 'annual' : request.type === 'sick' ? 'sick' : 'personal'];
    if (balance && balance.remaining < request.days) return false;

    request.status = 'approved';
    request.approvedBy = approver;
    request.approvedAt = Date.now();

    // עדכן יתרה
    if (balance) {
      balance.used += request.days;
      balance.remaining -= request.days;
    }
    if (request.type === 'annual') employee.leave.annual.pendingApproval -= request.days;

    employee.audit.push({ timestamp: Date.now(), action: 'leave_approved', actor: approver, detail: `${request.type}: ${request.days} ימים` });
    return true;
  }

  /** דחה חופשה */
  rejectLeave(employee: Employee, leaveId: string, approver: string, reason: string): void {
    const request = employee.leave.history.find(l => l.id === leaveId);
    if (!request) return;
    request.status = 'rejected';
    request.approvedBy = approver;
    if (request.type === 'annual') employee.leave.annual.pendingApproval -= request.days;
    employee.audit.push({ timestamp: Date.now(), action: 'leave_rejected', actor: approver, detail: reason });
  }

  /** יתרות חופשה */
  getBalance(employee: Employee): Employee['leave'] { return employee.leave; }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: PAYROLL ENGINE — שכר
// ═══════════════════════════════════════════════════════════════════════════

class PayrollEngine {
  private entries: PayrollEntry[] = [];

  /** חשב משכורת חודשית */
  calculate(employee: Employee, month: string, attendance: {
    totalHours: number; overtimeHours: number; sickDays: number; absentDays: number;
  }): PayrollEntry {
    const salary = employee.employment.salary;
    const overtime125 = Math.min(attendance.overtimeHours, 2 * 22); // 2 שעות ראשונות × 125%
    const overtime150 = Math.max(0, attendance.overtimeHours - overtime125); // מעל זה × 150%
    const hourlyRate = salary.baseSalary / (salary.payFrequency === 'monthly' ? 186 : 42); // 186 שעות חודשיות

    const overtimePay = Math.round(overtime125 * hourlyRate * 1.25 + overtime150 * hourlyRate * 1.5);

    const allowanceTotal = salary.allowances.reduce((s, a) => s + a.amount, 0);
    const grossPay = salary.baseSalary + overtimePay + allowanceTotal;

    // ניכויים
    const fixedDeductions = salary.deductions.filter(d => d.type === 'fixed').reduce((s, d) => s + d.amount, 0);
    const percentDeductions = salary.deductions.filter(d => d.type === 'percent').reduce((s, d) => s + Math.round(grossPay * d.amount / 100), 0);

    // מס הכנסה (מדרגות ישראל 2026 — פשוט)
    const incomeTax = this.calcIncomeTax(grossPay * 12) / 12;
    const nationalInsurance = Math.round(grossPay * 0.035); // 3.5%
    const healthInsurance = Math.round(grossPay * 0.031);   // 3.1%
    const pension = Math.round(grossPay * 0.06);             // 6% עובד

    const totalDeductions = fixedDeductions + percentDeductions + incomeTax + nationalInsurance + healthInsurance + pension;
    const netPay = Math.round(grossPay - totalDeductions);

    const entry: PayrollEntry = {
      id: `pay_${Date.now().toString(36)}`,
      employeeId: employee.id,
      employeeName: employee.personal.fullName,
      period: month,
      baseSalary: salary.baseSalary,
      overtimeHours: attendance.overtimeHours,
      overtimePay,
      allowances: salary.allowances.map(a => ({ name: a.name, amount: a.amount })),
      grossPay,
      deductions: [
        ...salary.deductions.map(d => ({ name: d.name, amount: d.type === 'fixed' ? d.amount : Math.round(grossPay * d.amount / 100) })),
      ],
      incomeTax: Math.round(incomeTax),
      nationalInsurance,
      healthInsurance,
      pension,
      netPay,
      status: 'calculated',
    };
    this.entries.push(entry);
    return entry;
  }

  private calcIncomeTax(annualIncome: number): number {
    // מדרגות מס פשוטות
    const brackets = [
      { limit: 84120, rate: 0.10 },
      { limit: 120720, rate: 0.14 },
      { limit: 193800, rate: 0.20 },
      { limit: 269280, rate: 0.31 },
      { limit: 560280, rate: 0.35 },
      { limit: 721560, rate: 0.47 },
      { limit: Infinity, rate: 0.50 },
    ];
    let tax = 0; let remaining = annualIncome; let prev = 0;
    for (const bracket of brackets) {
      const taxable = Math.min(remaining, bracket.limit - prev);
      tax += taxable * bracket.rate;
      remaining -= taxable; prev = bracket.limit;
      if (remaining <= 0) break;
    }
    // נקודות זיכוי (2.25 בסיס)
    tax -= 2904 * 2.25;
    return Math.max(0, Math.round(tax));
  }

  /** אשר משכורת */
  approve(entryId: string): void {
    const entry = this.entries.find(e => e.id === entryId);
    if (entry) entry.status = 'approved';
  }

  /** סמן כשולם */
  markPaid(entryId: string, payslipDocId?: string): void {
    const entry = this.entries.find(e => e.id === entryId);
    if (entry) { entry.status = 'paid'; entry.paidAt = Date.now(); entry.payslipDocId = payslipDocId; }
  }

  /** דוח שכר חודשי */
  getMonthlyReport(month: string): { entries: PayrollEntry[]; totalGross: number; totalNet: number; totalTax: number } {
    const entries = this.entries.filter(e => e.period === month);
    return {
      entries, totalGross: entries.reduce((s, e) => s + e.grossPay, 0),
      totalNet: entries.reduce((s, e) => s + e.netPay, 0),
      totalTax: entries.reduce((s, e) => s + e.incomeTax + e.nationalInsurance + e.healthInsurance, 0),
    };
  }

  getByEmployee(employeeId: string): PayrollEntry[] { return this.entries.filter(e => e.employeeId === employeeId); }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: PERFORMANCE & DISCIPLINARY
// ═══════════════════════════════════════════════════════════════════════════

class PerformanceEngine {
  /** צור הערכת ביצוע */
  createReview(employee: Employee, params: {
    period: string; reviewerId: string; reviewerName: string;
    scores: PerformanceReview['scores'];
    strengths: string[]; improvements: string[];
    goals: Array<{ goal: string; deadline: string }>;
    comments: string;
  }): PerformanceReview {
    const overall = Math.round(Object.values(params.scores).reduce((s, v) => s + v, 0) / Object.values(params.scores).length * 10) / 10;
    const review: PerformanceReview = {
      id: `rev_${Date.now().toString(36)}`,
      ...params,
      scores: { ...params.scores, overall },
      goals: params.goals.map(g => ({ ...g, status: 'pending' as const })),
      status: 'submitted',
    };
    employee.reviews.push(review);
    employee.audit.push({ timestamp: Date.now(), action: 'performance_review', actor: params.reviewerId, detail: `תקופה: ${params.period}, ציון: ${overall}/5` });
    return review;
  }

  /** הוסף רשומת משמעת */
  addDisciplinary(employee: Employee, params: {
    type: DisciplinaryRecord['type']; reason: string; description: string;
    issuedBy: string; witnesses?: string[]; followUpDate?: string;
  }): DisciplinaryRecord {
    const record: DisciplinaryRecord = {
      id: `disc_${Date.now().toString(36)}`,
      date: new Date().toISOString().split('T')[0],
      ...params, followUpCompleted: false,
    };
    employee.disciplinary.push(record);
    employee.audit.push({ timestamp: Date.now(), action: 'disciplinary_action', actor: params.issuedBy, detail: `${params.type}: ${params.reason}` });

    // התראה אוטומטית אחרי 3 אזהרות
    const warningCount = employee.disciplinary.filter(d => d.type.includes('warning')).length;
    if (warningCount >= 3) {
      employee.notes.push({ date: new Date().toISOString().split('T')[0], author: 'system', text: `⚠️ ${warningCount} אזהרות — לשקול צעדים נוספים`, private: true });
    }

    return record;
  }

  /** העלאת שכר */
  raiseSalary(employee: Employee, newSalary: number, reason: string, approvedBy: string): void {
    const prev = employee.employment.salary.baseSalary;
    employee.employment.salary.history.push({
      date: new Date().toISOString().split('T')[0],
      baseSalary: newSalary, reason, approvedBy,
    });
    employee.employment.salary.baseSalary = newSalary;
    employee.employment.salary.lastRaise = new Date().toISOString().split('T')[0];
    employee.audit.push({ timestamp: Date.now(), action: 'salary_raise', actor: approvedBy, detail: `₪${prev.toLocaleString()} → ₪${newSalary.toLocaleString()} (${reason})`, prev, next: newSalary });
  }

  /** קידום */
  promote(employee: Employee, newPosition: string, newDepartment?: Department, salaryIncrease?: number, approvedBy?: string): void {
    const prev = employee.employment.position;
    employee.employment.position = newPosition;
    if (newDepartment) employee.employment.department = newDepartment;
    if (salaryIncrease) this.raiseSalary(employee, employee.employment.salary.baseSalary + salaryIncrease, `קידום ל-${newPosition}`, approvedBy ?? 'system');
    employee.audit.push({ timestamp: Date.now(), action: 'promoted', actor: approvedBy ?? 'system', detail: `${prev} → ${newPosition}`, prev, next: newPosition });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: COMPLIANCE ENGINE — ציות לחוקי עבודה
// ═══════════════════════════════════════════════════════════════════════════

class ComplianceEngine {
  /** בדוק ציות */
  audit(employees: Employee[]): Array<{ employeeId: string; employeeName: string; issue: string; severity: 'critical' | 'warning' | 'info'; recommendation: string }> {
    const issues: Array<{ employeeId: string; employeeName: string; issue: string; severity: 'critical' | 'warning' | 'info'; recommendation: string }> = [];

    for (const emp of employees) {
      if (emp.employment.status !== 'active' && emp.employment.status !== 'probation') continue;

      // חוזה חסר
      if (!emp.employment.contractId) {
        issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: 'אין חוזה העסקה במערכת', severity: 'critical', recommendation: 'העלה חוזה חתום ל-DMS' });
      }

      // פרטי בנק חסרים
      if (!emp.personal.bankDetails) {
        issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: 'אין פרטי בנק', severity: 'warning', recommendation: 'בקש טופס הרשאת בנק' });
      }

      // איש קשר חירום חסר
      if (!emp.personal.emergencyContact) {
        issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: 'אין איש קשר לשעת חירום', severity: 'warning', recommendation: 'בקש פרטי קשר לחירום' });
      }

      // הדרכת בטיחות
      const safetyTrainings = emp.training.filter(t => t.type === 'safety' && t.status === 'completed');
      const latestSafety = safetyTrainings.length > 0 ? new Date(safetyTrainings.sort((a, b) => b.date.localeCompare(a.date))[0].date) : null;
      if (!latestSafety || Date.now() - latestSafety.getTime() > 365 * 86400000) {
        issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: 'הדרכת בטיחות לא מעודכנת (מעל שנה)', severity: 'critical', recommendation: 'תזמן הדרכת בטיחות' });
      }

      // תום ניסיון
      if (emp.employment.status === 'probation' && emp.employment.probationEndDate) {
        const daysLeft = (new Date(emp.employment.probationEndDate).getTime() - Date.now()) / 86400000;
        if (daysLeft < 14 && daysLeft > 0) {
          issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: `תום ניסיון בעוד ${Math.round(daysLeft)} ימים`, severity: 'warning', recommendation: 'בצע הערכה וקבל החלטה' });
        } else if (daysLeft <= 0) {
          issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: 'תקופת ניסיון הסתיימה — לא התקבלה החלטה', severity: 'critical', recommendation: 'קבע סטטוס: קבוע או סיום' });
        }
      }

      // הערכת ביצוע
      const lastReview = emp.reviews.length > 0 ? emp.reviews.sort((a, b) => b.reviewDate.localeCompare(a.reviewDate))[0] : null;
      if (!lastReview || (Date.now() - new Date(lastReview.reviewDate).getTime() > 365 * 86400000)) {
        issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: 'לא בוצעה הערכת ביצוע בשנה האחרונה', severity: 'warning', recommendation: 'תזמן הערכת ביצוע' });
      }

      // חופשות שלא נוצלו
      if (emp.leave.annual.remaining > 10) {
        issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: `${emp.leave.annual.remaining} ימי חופשה לא מנוצלים`, severity: 'info', recommendation: 'עודד את העובד לצאת לחופשה' });
      }

      // תעודות פגות תוקף
      for (const cert of emp.qualifications.certifications) {
        if (cert.expiresDate && new Date(cert.expiresDate).getTime() < Date.now() + 30 * 86400000) {
          issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: `תעודה "${cert.name}" פגה/עומדת לפוג`, severity: cert.expiresDate && new Date(cert.expiresDate).getTime() < Date.now() ? 'critical' : 'warning', recommendation: 'חדש תעודה' });
        }
      }

      // רישיונות פגים
      for (const lic of emp.qualifications.licenses ?? []) {
        if (new Date(lic.expires).getTime() < Date.now() + 30 * 86400000) {
          issues.push({ employeeId: emp.id, employeeName: emp.personal.fullName, issue: `רישיון ${lic.type} פג/עומד לפוג`, severity: 'critical', recommendation: 'חדש רישיון' });
        }
      }
    }

    return issues.sort((a, b) => {
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: HR MANAGER — ממשק אחד לכל HR
// ═══════════════════════════════════════════════════════════════════════════

export class HRManager {
  readonly employees: EmployeeRegistry;
  readonly recruitment: RecruitmentEngine;
  readonly onOffboarding: OnOffboardingEngine;
  readonly attendance: AttendanceEngine;
  readonly leaves: LeaveManager;
  readonly payroll: PayrollEngine;
  readonly performance: PerformanceEngine;
  readonly compliance: ComplianceEngine;

  constructor() {
    this.employees = new EmployeeRegistry();
    this.recruitment = new RecruitmentEngine();
    this.onOffboarding = new OnOffboardingEngine();
    this.attendance = new AttendanceEngine();
    this.leaves = new LeaveManager();
    this.payroll = new PayrollEngine();
    this.performance = new PerformanceEngine();
    this.compliance = new ComplianceEngine();
  }

  // ─── תהליך מלא: גיוס → קליטה → פעיל ──

  /** גייס עובד חדש (אחרי שהמועמד קיבל הצעה) */
  hireFromRecruitment(openingId: string, candidateId: string, params: {
    idNumber: string; startDate: string; baseSalary: number;
    manager: string; workDays?: number[];
    email?: string; address?: string;
  }): { employee: Employee; onboarding: OnboardingChecklist } | null {
    const result = this.recruitment.acceptOffer(openingId, candidateId);
    if (!result) return null;

    const { candidate, opening } = result;
    const [firstName, ...lastParts] = candidate.name.split(' ');

    const employee = this.employees.add({
      firstName, lastName: lastParts.join(' ') || firstName,
      idNumber: params.idNumber, phone: candidate.phone,
      email: params.email ?? candidate.email,
      address: params.address,
      department: opening.department, position: opening.title,
      manager: params.manager, employmentType: opening.employmentType,
      startDate: params.startDate, baseSalary: params.baseSalary,
      workDays: params.workDays,
    });

    const onboarding = this.onOffboarding.createOnboarding(employee.id, params.startDate, params.manager);

    console.log(`\n✅ ${employee.personal.fullName} גויס/ה ל-${opening.title} (${opening.department})`);
    console.log(`   תחילת עבודה: ${params.startDate}`);
    console.log(`   Onboarding: ${onboarding.items.length} משימות\n`);

    return { employee, onboarding };
  }

  /** הפעל עובד (אחרי onboarding) */
  activateEmployee(employeeId: string): void {
    const emp = this.employees.get(employeeId);
    if (!emp) return;
    emp.employment.status = 'probation';
    emp.audit.push({ timestamp: Date.now(), action: 'activated', actor: 'system', detail: 'עובד הופעל — תקופת ניסיון' });
  }

  /** העבר לקבוע */
  confirmEmployee(employeeId: string, approvedBy: string): void {
    const emp = this.employees.get(employeeId);
    if (!emp) return;
    emp.employment.status = 'active';
    emp.audit.push({ timestamp: Date.now(), action: 'confirmed', actor: approvedBy, detail: 'עובד קבוע' });
  }

  /** סיים עובד */
  terminateEmployee(employeeId: string, params: {
    reason: string; lastDay: string; type: 'resignation' | 'termination' | 'retirement';
    initiatedBy: string;
  }): OffboardingChecklist | null {
    const emp = this.employees.get(employeeId);
    if (!emp) return null;

    emp.employment.status = params.type === 'resignation' ? 'resigned' : params.type === 'retirement' ? 'retired' : 'terminated';
    emp.employment.endDate = params.lastDay;
    emp.audit.push({ timestamp: Date.now(), action: `employee_${params.type}`, actor: params.initiatedBy, detail: params.reason });

    const offboarding = this.onOffboarding.createOffboarding(employeeId, params.lastDay, emp.employment.manager);

    console.log(`\n⚠️ ${emp.personal.fullName} — ${params.type}: ${params.reason}`);
    console.log(`   יום אחרון: ${params.lastDay}`);
    console.log(`   Offboarding: ${offboarding.items.length} משימות\n`);

    return offboarding;
  }

  // ─── דוחות ──

  /** סיכום HR */
  getDashboard(): {
    totalEmployees: number; activeEmployees: number; onboardingCount: number;
    openPositions: number; pendingLeaves: number;
    complianceIssues: number; criticalIssues: number;
    byDepartment: Record<string, number>; byStatus: Record<string, number>;
    avgSalary: number; totalPayroll: number;
  } {
    const all = this.employees.getAll();
    const active = all.filter(e => e.employment.status === 'active' || e.employment.status === 'probation');
    const byDept: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let totalSalary = 0;

    for (const emp of all) {
      byDept[emp.employment.department] = (byDept[emp.employment.department] ?? 0) + 1;
      byStatus[emp.employment.status] = (byStatus[emp.employment.status] ?? 0) + 1;
      if (emp.employment.status === 'active' || emp.employment.status === 'probation') {
        totalSalary += emp.employment.salary.baseSalary;
      }
    }

    const complianceIssues = this.compliance.audit(active);
    const pendingLeaves = active.reduce((s, e) => s + e.leave.history.filter(l => l.status === 'pending').length, 0);

    return {
      totalEmployees: all.length,
      activeEmployees: active.length,
      onboardingCount: all.filter(e => e.employment.status === 'onboarding').length,
      openPositions: this.recruitment.getOpenOpenings().length,
      pendingLeaves,
      complianceIssues: complianceIssues.length,
      criticalIssues: complianceIssues.filter(i => i.severity === 'critical').length,
      byDepartment: byDept, byStatus,
      avgSalary: active.length > 0 ? Math.round(totalSalary / active.length) : 0,
      totalPayroll: totalSalary,
    };
  }

  /** הדפס דשבורד */
  printDashboard(): void {
    const d = this.getDashboard();
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║   👥 ONYX HR — דשבורד משאבי אנוש                            ║
╠══════════════════════════════════════════════════════════════╣
║
║   סה"כ עובדים: ${String(d.totalEmployees).padEnd(8)} פעילים: ${String(d.activeEmployees).padEnd(8)} בקליטה: ${d.onboardingCount}
║   משרות פתוחות: ${String(d.openPositions).padEnd(7)} חופשות ממתינות: ${d.pendingLeaves}
║
║   💰 שכר ממוצע: ₪${d.avgSalary.toLocaleString()}
║   💰 שכר חודשי כולל: ₪${d.totalPayroll.toLocaleString()}
║
║   לפי מחלקה:
${Object.entries(d.byDepartment).sort((a,b) => b[1] - a[1]).map(([dept, count]) => `║     ${dept}: ${count}`).join('\n')}
║
║   ⚠️ בעיות ציות: ${d.complianceIssues} (${d.criticalIssues} קריטיות)
║
╚══════════════════════════════════════════════════════════════╝`);
  }

  /** דוח ציות */
  printComplianceReport(): void {
    const issues = this.compliance.audit(this.employees.getActive());
    const icons = { critical: '🔴', warning: '🟡', info: 'ℹ️' };
    console.log(`\n⚖️ דוח ציות — ${issues.length} בעיות:\n`);
    for (const issue of issues) {
      console.log(`${icons[issue.severity]} ${issue.employeeName}: ${issue.issue}`);
      console.log(`   → ${issue.recommendation}\n`);
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  EmployeeRegistry, RecruitmentEngine, OnOffboardingEngine,
  AttendanceEngine, LeaveManager, PayrollEngine,
  PerformanceEngine, ComplianceEngine,
};

export type {
  Employee, SalaryInfo, WorkSchedule, EmployeeStatus, Department, EmploymentType,
  JobOpening, Candidate, AttendanceRecord,
  LeaveRequest, LeaveBalance, PerformanceReview, DisciplinaryRecord,
  TrainingRecord, OnboardingChecklist, OffboardingChecklist,
  PayrollEntry,
};

// ═══════════════════════════════════════════════════════════════════════════
// שימוש
// ═══════════════════════════════════════════════════════════════════════════
//
// const hr = new HRManager();
//
// // ── גיוס ──
// const job = hr.recruitment.createOpening({
//   title: 'רתך מוסמך',
//   department: 'ייצור',
//   description: 'רתך/ת מוסמך/ת לעבודה במפעל מתכת',
//   requirements: ['תעודת רתכות', '3 שנות ניסיון', 'נכונות לעבודה בשטח'],
//   salaryRange: { min: 10000, max: 14000 },
//   employmentType: 'full_time',
//   createdBy: 'קורין',
// });
//
// // פרסום
// const post = hr.recruitment.buildJobPost(job.id);
// // → שלח ב-WhatsApp לקבוצות, פייסבוק
//
// // מועמדים
// hr.recruitment.addCandidate(job.id, { name: 'יוסי כהן', phone: '+972501234567', source: 'פייסבוק' });
// hr.recruitment.addCandidate(job.id, { name: 'אחמד חסן', phone: '+972509876543', source: 'המלצה' });
//
// // ראיונות
// hr.recruitment.recordInterview(job.id, candidates[0].id, {
//   date: '2026-04-15', interviewer: 'דימה',
//   notes: 'ניסיון מצוין, מקצועי', rating: 4,
//   recommendation: 'hire',
// });
//
// // גיוס
// const result = hr.hireFromRecruitment(job.id, candidates[0].id, {
//   idNumber: '123456789', startDate: '2026-05-01',
//   baseSalary: 12000, manager: 'דימה',
// });
// // → יצירת עובד + checklist onboarding (25 משימות)
//
// // ── נוכחות ──
// hr.attendance.clockIn(result.employee.id, '07:05');
// hr.attendance.clockOut(result.employee.id, '16:30');
//
// // ── חופשה ──
// hr.leaves.requestLeave(result.employee, {
//   type: 'annual', startDate: '2026-06-01', endDate: '2026-06-05', days: 4,
// });
// hr.leaves.approveLeave(result.employee, leaveId, 'דימה');
//
// // ── משכורת ──
// const payslip = hr.payroll.calculate(result.employee, '2026-05', {
//   totalHours: 186, overtimeHours: 12, sickDays: 0, absentDays: 0,
// });
// // → ברוטו: ₪13,800 | מס: ₪1,200 | נטו: ₪10,950
//
// // ── הערכת ביצוע ──
// hr.performance.createReview(result.employee, {
//   period: 'Q2 2026', reviewerId: 'dima', reviewerName: 'דימה',
//   scores: { quality: 4, productivity: 4, teamwork: 3, reliability: 5, initiative: 3, safety: 5, overall: 0 },
//   strengths: ['ריתוך מדויק', 'אמין'], improvements: ['עבודת צוות'],
//   goals: [{ goal: 'הסמכת TIG', deadline: '2026-12-31' }],
//   comments: 'עובד טוב, צריך לפתח שיתוף פעולה',
// });
//
// // ── ציות ──
// hr.printComplianceReport();
// // → 🔴 יוסי כהן: הדרכת בטיחות לא מעודכנת
// // → 🟡 יוסי כהן: אין פרטי בנק
//
// hr.printDashboard();
