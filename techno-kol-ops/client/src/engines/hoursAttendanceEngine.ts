/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║   HOURS & ATTENDANCE ENGINE — Client-Side                             ║
 * ║   מודל שעות עבודה, ימי חופש, מחלה, וחיסורים                         ║
 * ║                                                                        ║
 * ║   • רישום שעות יומיות לכל עובד                                        ║
 * ║   • בקשות חופשה עם זרימת אישור                                        ║
 * ║   • ימי מחלה עם מסמכים רפואיים                                         ║
 * ║   • חיסורים (לא מוצדקים)                                              ║
 * ║   • צבירת יתרות (חופש + מחלה)                                         ║
 * ║   • ייצוא ל-Payroll Autonomous                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type AbsenceType =
  | 'vacation'         // חופש
  | 'sick'             // מחלה
  | 'sick_family'      // מחלה במשפחה
  | 'bereavement'      // אבל
  | 'military'         // מילואים
  | 'maternity'        // חופשת לידה
  | 'study'            // חופשת לימודים
  | 'personal'         // יום אישי
  | 'unpaid'           // חופשה ללא תשלום
  | 'unauthorized';    // חיסור לא מאושר

export type AbsenceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export type ShiftType = 'regular' | 'overtime_125' | 'overtime_150' | 'night' | 'saturday' | 'holiday';

/** רישום שעות יומי של עובד */
export interface HoursEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:MM
  endTime: string;        // HH:MM
  breakMinutes: number;
  totalHours: number;     // calculated: (end-start-break) in hours
  regularHours: number;   // עד 8 שעות
  overtime125: number;    // שעה 9-10
  overtime150: number;    // שעה 11+
  shiftType: ShiftType;
  projectId?: string;
  projectName?: string;
  notes?: string;
  approved: boolean;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** בקשת היעדרות (חופש/מחלה/חיסור) */
export interface AbsenceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: AbsenceType;
  status: AbsenceStatus;
  startDate: string;      // YYYY-MM-DD
  endDate: string;        // YYYY-MM-DD
  daysCount: number;      // כולל סופי שבוע? לא
  halfDay: boolean;       // חצי יום?
  reason: string;
  documentUrl?: string;   // for sick notes / military orders
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
  affectsBalance: boolean; // does this deduct from vacation/sick balance?
}

/** יתרת חופש ומחלה לעובד */
export interface EmployeeBalance {
  employeeId: string;
  employeeName: string;
  year: number;
  // חופש
  vacationEntitled: number;     // ימים להם זכאי השנה
  vacationUsed: number;         // ימים שנוצלו
  vacationRemaining: number;    // יתרה
  vacationCarryForward: number; // מיתרת שנה קודמת
  // מחלה
  sickEntitled: number;         // ימי מחלה שנתיים (1.5 × 12 = 18)
  sickUsed: number;
  sickRemaining: number;
  sickAccumulated: number;      // מיתרת שנים קודמות
  // חיסורים
  unauthorizedDays: number;     // חיסורים לא מוצדקים השנה
  // מילואים
  militaryDaysUsed: number;
  lastUpdated: string;
}

/** כללי צבירה */
export interface AccrualRules {
  /** ימי חופש בחודש (1.75 × 12 = 21 ימים שנתיים) */
  vacationDaysPerMonth: number;
  /** מקסימום ימי חופש להעביר שנה הבאה */
  vacationMaxCarryForward: number;
  /** ימי מחלה בחודש (1.5 × 12 = 18) */
  sickDaysPerMonth: number;
  /** מקסימום ימי מחלה צבורים (90 לפי חוק) */
  sickMaxAccumulated: number;
  /** שעות עבודה ביום תקן */
  standardHoursPerDay: number;
  /** ימי עבודה בשבוע */
  workDaysPerWeek: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT RULES (חוק ישראלי)
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_ACCRUAL_RULES: AccrualRules = {
  vacationDaysPerMonth: 1.75,    // ≈ 21 ימים לשנה
  vacationMaxCarryForward: 7,
  sickDaysPerMonth: 1.5,          // ≈ 18 ימים לשנה
  sickMaxAccumulated: 90,
  standardHoursPerDay: 8.6,       // 43 שעות שבועיות / 5
  workDaysPerWeek: 5,
};

// ═══════════════════════════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const LS_HOURS = 'tk_hours_entries';
const LS_ABSENCES = 'tk_absence_requests';
const LS_BALANCES = 'tk_employee_balances';
const LS_ACCRUAL = 'tk_accrual_rules';

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* ignore */ }
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(1, Math.round((e - s) / 86400000) + 1);
}

/** חשב ימי עבודה בלבד (ללא שישי-שבת) בין שני תאריכים */
export function workingDaysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  const current = new Date(s);
  while (current <= e) {
    const day = current.getDay();
    if (day !== 5 && day !== 6) count++; // skip Fri/Sat
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/** חשב שעות יומיות + חלוקה לשעות תקן/נוספות */
export function computeHours(
  startTime: string,
  endTime: string,
  breakMinutes: number,
  standardHoursPerDay = DEFAULT_ACCRUAL_RULES.standardHoursPerDay,
): { total: number; regular: number; overtime125: number; overtime150: number } {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin < startMin) endMin += 24 * 60; // over midnight
  const totalMinutes = Math.max(0, endMin - startMin - breakMinutes);
  const total = Math.round((totalMinutes / 60) * 100) / 100;

  const regular = Math.min(total, standardHoursPerDay);
  const afterRegular = Math.max(0, total - standardHoursPerDay);
  const overtime125 = Math.min(afterRegular, 2); // first 2 hours of overtime
  const overtime150 = Math.max(0, afterRegular - 2); // beyond 10 hours

  return {
    total,
    regular: Math.round(regular * 100) / 100,
    overtime125: Math.round(overtime125 * 100) / 100,
    overtime150: Math.round(overtime150 * 100) / 100,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HOURS STORE
// ═══════════════════════════════════════════════════════════════════════════

export const HoursStore = {
  getAll(): HoursEntry[] {
    return readLS<HoursEntry[]>(LS_HOURS, []);
  },

  getByEmployee(employeeId: string): HoursEntry[] {
    return this.getAll().filter(h => h.employeeId === employeeId);
  },

  getByDate(date: string): HoursEntry[] {
    return this.getAll().filter(h => h.date === date);
  },

  getByDateRange(start: string, end: string): HoursEntry[] {
    return this.getAll().filter(h => h.date >= start && h.date <= end);
  },

  add(entry: Omit<HoursEntry, 'id' | 'createdAt' | 'updatedAt'>): HoursEntry {
    const now = new Date().toISOString();
    const full: HoursEntry = {
      ...entry,
      id: uid('hrs'),
      createdAt: now,
      updatedAt: now,
    };
    const all = this.getAll();
    all.push(full);
    writeLS(LS_HOURS, all);
    return full;
  },

  update(id: string, patch: Partial<HoursEntry>): HoursEntry | null {
    const all = this.getAll();
    const idx = all.findIndex(h => h.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toISOString() };
    writeLS(LS_HOURS, all);
    return all[idx];
  },

  remove(id: string): boolean {
    const all = this.getAll();
    const next = all.filter(h => h.id !== id);
    if (next.length === all.length) return false;
    writeLS(LS_HOURS, next);
    return true;
  },

  approve(id: string, approvedBy: string): HoursEntry | null {
    return this.update(id, { approved: true, approvedBy, approvedAt: new Date().toISOString() });
  },

  /** סיכום שעות לתקופה */
  summary(employeeId: string, startDate: string, endDate: string): {
    totalHours: number;
    regularHours: number;
    overtime125: number;
    overtime150: number;
    daysWorked: number;
    avgHoursPerDay: number;
  } {
    const entries = this.getByEmployee(employeeId).filter(h => h.date >= startDate && h.date <= endDate);
    const totalHours = entries.reduce((s, e) => s + e.totalHours, 0);
    const regularHours = entries.reduce((s, e) => s + e.regularHours, 0);
    const overtime125 = entries.reduce((s, e) => s + e.overtime125, 0);
    const overtime150 = entries.reduce((s, e) => s + e.overtime150, 0);
    const daysWorked = new Set(entries.map(e => e.date)).size;
    return {
      totalHours: Math.round(totalHours * 100) / 100,
      regularHours: Math.round(regularHours * 100) / 100,
      overtime125: Math.round(overtime125 * 100) / 100,
      overtime150: Math.round(overtime150 * 100) / 100,
      daysWorked,
      avgHoursPerDay: daysWorked > 0 ? Math.round((totalHours / daysWorked) * 100) / 100 : 0,
    };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// ABSENCE STORE
// ═══════════════════════════════════════════════════════════════════════════

export const AbsenceStore = {
  getAll(): AbsenceRequest[] {
    return readLS<AbsenceRequest[]>(LS_ABSENCES, []);
  },

  getByEmployee(employeeId: string): AbsenceRequest[] {
    return this.getAll().filter(a => a.employeeId === employeeId);
  },

  getByStatus(status: AbsenceStatus): AbsenceRequest[] {
    return this.getAll().filter(a => a.status === status);
  },

  getPendingCount(): number {
    return this.getByStatus('pending').length;
  },

  submit(
    req: Omit<AbsenceRequest, 'id' | 'status' | 'daysCount' | 'submittedAt' | 'affectsBalance'>,
  ): AbsenceRequest {
    const daysCount = req.halfDay ? 0.5 : workingDaysBetween(req.startDate, req.endDate);
    const affectsBalance = req.type === 'vacation' || req.type === 'sick' || req.type === 'sick_family';

    const full: AbsenceRequest = {
      ...req,
      id: uid('abs'),
      status: 'pending',
      daysCount,
      submittedAt: new Date().toISOString(),
      affectsBalance,
    };
    const all = this.getAll();
    all.push(full);
    writeLS(LS_ABSENCES, all);
    return full;
  },

  approve(id: string, approvedBy: string): AbsenceRequest | null {
    const all = this.getAll();
    const idx = all.findIndex(a => a.id === id);
    if (idx === -1) return null;
    all[idx] = {
      ...all[idx],
      status: 'approved',
      approvedBy,
      approvedAt: new Date().toISOString(),
    };
    writeLS(LS_ABSENCES, all);

    // Update balance
    const req = all[idx];
    if (req.affectsBalance) {
      BalanceStore.applyAbsence(req);
    }
    return all[idx];
  },

  reject(id: string, rejectedReason: string, rejectedBy: string): AbsenceRequest | null {
    const all = this.getAll();
    const idx = all.findIndex(a => a.id === id);
    if (idx === -1) return null;
    all[idx] = {
      ...all[idx],
      status: 'rejected',
      rejectedReason,
      approvedBy: rejectedBy,
      approvedAt: new Date().toISOString(),
    };
    writeLS(LS_ABSENCES, all);
    return all[idx];
  },

  cancel(id: string): AbsenceRequest | null {
    const all = this.getAll();
    const idx = all.findIndex(a => a.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], status: 'cancelled' };
    writeLS(LS_ABSENCES, all);
    return all[idx];
  },

  /** רשום חיסור לא מאושר (יזום ע"י מנהל, לא דרך בקשה) */
  logUnauthorized(employeeId: string, employeeName: string, date: string, reason: string): AbsenceRequest {
    const full: AbsenceRequest = {
      id: uid('abs'),
      employeeId,
      employeeName,
      type: 'unauthorized',
      status: 'approved', // מנהל יזם אז זה "approved" במובן של נרשם
      startDate: date,
      endDate: date,
      daysCount: 1,
      halfDay: false,
      reason,
      submittedAt: new Date().toISOString(),
      approvedBy: 'manager',
      approvedAt: new Date().toISOString(),
      affectsBalance: false,
    };
    const all = this.getAll();
    all.push(full);
    writeLS(LS_ABSENCES, all);

    // increment unauthorized counter
    const balance = BalanceStore.getOrCreate(employeeId, employeeName);
    balance.unauthorizedDays += 1;
    balance.lastUpdated = new Date().toISOString();
    BalanceStore.save(balance);

    return full;
  },

  getAbsencesForDateRange(start: string, end: string): AbsenceRequest[] {
    return this.getAll().filter(
      a =>
        a.status === 'approved' &&
        !(a.endDate < start || a.startDate > end)
    );
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// BALANCE STORE
// ═══════════════════════════════════════════════════════════════════════════

export const BalanceStore = {
  getAccrualRules(): AccrualRules {
    return readLS<AccrualRules>(LS_ACCRUAL, DEFAULT_ACCRUAL_RULES);
  },

  saveAccrualRules(rules: AccrualRules): void {
    writeLS(LS_ACCRUAL, rules);
  },

  getAll(): EmployeeBalance[] {
    return readLS<EmployeeBalance[]>(LS_BALANCES, []);
  },

  getForEmployee(employeeId: string, year: number = new Date().getFullYear()): EmployeeBalance | null {
    return this.getAll().find(b => b.employeeId === employeeId && b.year === year) ?? null;
  },

  getOrCreate(employeeId: string, employeeName: string, year: number = new Date().getFullYear()): EmployeeBalance {
    let balance = this.getForEmployee(employeeId, year);
    if (!balance) {
      const rules = this.getAccrualRules();
      balance = {
        employeeId,
        employeeName,
        year,
        vacationEntitled: rules.vacationDaysPerMonth * 12,
        vacationUsed: 0,
        vacationRemaining: rules.vacationDaysPerMonth * 12,
        vacationCarryForward: 0,
        sickEntitled: rules.sickDaysPerMonth * 12,
        sickUsed: 0,
        sickRemaining: rules.sickDaysPerMonth * 12,
        sickAccumulated: 0,
        unauthorizedDays: 0,
        militaryDaysUsed: 0,
        lastUpdated: new Date().toISOString(),
      };
      this.save(balance);
    }
    return balance;
  },

  save(balance: EmployeeBalance): void {
    const all = this.getAll();
    const idx = all.findIndex(b => b.employeeId === balance.employeeId && b.year === balance.year);
    if (idx >= 0) all[idx] = balance;
    else all.push(balance);
    writeLS(LS_BALANCES, all);
  },

  /** נכה יתרה לפי בקשת היעדרות שאושרה */
  applyAbsence(req: AbsenceRequest): void {
    const year = new Date(req.startDate).getFullYear();
    const balance = this.getOrCreate(req.employeeId, req.employeeName, year);

    if (req.type === 'vacation') {
      balance.vacationUsed += req.daysCount;
      balance.vacationRemaining = balance.vacationEntitled + balance.vacationCarryForward - balance.vacationUsed;
    } else if (req.type === 'sick' || req.type === 'sick_family') {
      balance.sickUsed += req.daysCount;
      balance.sickRemaining = balance.sickEntitled + balance.sickAccumulated - balance.sickUsed;
    } else if (req.type === 'military') {
      balance.militaryDaysUsed += req.daysCount;
    }
    balance.lastUpdated = new Date().toISOString();
    this.save(balance);
  },

  /** הוסף צבירה חודשית לכל עובד (להרצה בתחילת חודש) */
  accrueMonthly(employeeId: string, employeeName: string): void {
    const rules = this.getAccrualRules();
    const balance = this.getOrCreate(employeeId, employeeName);
    balance.vacationEntitled += rules.vacationDaysPerMonth;
    balance.vacationRemaining = balance.vacationEntitled + balance.vacationCarryForward - balance.vacationUsed;

    const newSickEntitled = balance.sickEntitled + rules.sickDaysPerMonth;
    balance.sickEntitled = Math.min(newSickEntitled, rules.sickMaxAccumulated);
    balance.sickRemaining = balance.sickEntitled + balance.sickAccumulated - balance.sickUsed;

    balance.lastUpdated = new Date().toISOString();
    this.save(balance);
  },

  /** העבר יתרת חופש לשנה הבאה (להרצה ב-1 בינואר) */
  carryForward(employeeId: string, fromYear: number, toYear: number): void {
    const rules = this.getAccrualRules();
    const prev = this.getForEmployee(employeeId, fromYear);
    if (!prev) return;
    const next = this.getOrCreate(employeeId, prev.employeeName, toYear);
    next.vacationCarryForward = Math.min(prev.vacationRemaining, rules.vacationMaxCarryForward);
    next.sickAccumulated = prev.sickAccumulated + prev.sickRemaining;
    next.vacationRemaining = next.vacationEntitled + next.vacationCarryForward - next.vacationUsed;
    next.sickRemaining = next.sickEntitled + next.sickAccumulated - next.sickUsed;
    this.save(next);
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS — תרגום סוגי היעדרות
// ═══════════════════════════════════════════════════════════════════════════

export const ABSENCE_LABELS: Record<AbsenceType, string> = {
  vacation: 'חופש',
  sick: 'מחלה',
  sick_family: 'מחלה במשפחה',
  bereavement: 'אבל',
  military: 'מילואים',
  maternity: 'חופשת לידה',
  study: 'חופשת לימודים',
  personal: 'יום אישי',
  unpaid: 'חופש ללא תשלום',
  unauthorized: 'חיסור לא מאושר',
};

export const ABSENCE_COLORS: Record<AbsenceType, string> = {
  vacation: '#14CCBB',
  sick: '#FC8585',
  sick_family: '#FF9E66',
  bereavement: '#B6B8BB',
  military: '#8B7FFF',
  maternity: '#F6B5D8',
  study: '#F6E58C',
  personal: '#A4D2E8',
  unpaid: '#5C7080',
  unauthorized: '#FF4444',
};

export const STATUS_LABELS: Record<AbsenceStatus, string> = {
  pending: 'ממתין לאישור',
  approved: 'מאושר',
  rejected: 'נדחה',
  cancelled: 'בוטל',
};

export const STATUS_COLORS: Record<AbsenceStatus, string> = {
  pending: '#F6B64A',
  approved: '#14CCBB',
  rejected: '#FC8585',
  cancelled: '#5C7080',
};

// ═══════════════════════════════════════════════════════════════════════════
// DEMO SEED
// ═══════════════════════════════════════════════════════════════════════════

export function seedHoursDemoData(employees: Array<{ id: string; name: string }>): void {
  if (localStorage.getItem('tk_hours_seeded')) return;

  // Create balances for every employee
  for (const emp of employees) {
    BalanceStore.getOrCreate(emp.id, emp.name);
  }

  // Seed a few hours entries
  if (employees.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const emp = employees[0];
    const hours1 = computeHours('07:30', '16:30', 30);
    HoursStore.add({
      employeeId: emp.id,
      employeeName: emp.name,
      date: today,
      startTime: '07:30',
      endTime: '16:30',
      breakMinutes: 30,
      totalHours: hours1.total,
      regularHours: hours1.regular,
      overtime125: hours1.overtime125,
      overtime150: hours1.overtime150,
      shiftType: 'regular',
      approved: false,
    });
    const hours2 = computeHours('07:00', '17:00', 45);
    HoursStore.add({
      employeeId: emp.id,
      employeeName: emp.name,
      date: yest,
      startTime: '07:00',
      endTime: '17:00',
      breakMinutes: 45,
      totalHours: hours2.total,
      regularHours: hours2.regular,
      overtime125: hours2.overtime125,
      overtime150: hours2.overtime150,
      shiftType: 'overtime_125',
      approved: true,
      approvedBy: 'manager',
      approvedAt: new Date().toISOString(),
    });
  }

  localStorage.setItem('tk_hours_seeded', '1');
}
