import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { entityRecordsTable } from "@workspace/db/schema";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { NATIONAL_INSURANCE_RATE, HEALTH_INSURANCE_RATE, PENSION_EMPLOYEE_RATE, PENSION_EMPLOYER_RATE, SEVERANCE_RATE, getIncomeTaxRate } from "../constants";
import {
  checkEntityAccess,
  type ResolvedPermissions,
} from "../lib/permission-engine";
import { onEmployeeCreated } from "../lib/data-sync";

const router = Router();

interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isSuperAdmin: boolean;
}

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

interface EmployeeData {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  employee_id?: string;
  id_number?: string;
  department?: string;
  job_title?: string;
  role?: string;
  employment_type?: string;
  is_contractor?: string;
  hire_date?: string;
  base_salary?: string | number;
  overtime_hours?: string | number;
  bonus?: string | number;
  commission?: string | number;
  monthly_revenue?: string | number;
  projects_completed?: string | number;
  client_satisfaction?: string | number;
  payment_model?: string;
  rate?: string | number;
  units_completed?: string | number;
  project_value?: string | number;
  percentage_rate?: string | number;
  specialty?: string;
  [key: string]: unknown;
}

interface AttendanceData {
  employee_id?: string;
  employee_name?: string;
  date?: string;
  type?: string;
  check_in?: string;
  check_out?: string;
  total_hours?: string | number;
  overtime_hours?: string | number;
  [key: string]: unknown;
}

interface ShiftData {
  employee_id?: string;
  employee_name?: string;
  shift_date?: string;
  shift_name?: string;
  template_name?: string;
  shift_type?: string;
  start_time?: string;
  end_time?: string;
  [key: string]: unknown;
}

interface PayrollRunData {
  period?: string;
  month?: string;
  year?: number;
  run_status?: string;
  employee_count?: number;
  total_gross?: number;
  total_deductions?: number;
  total_net?: number;
  total_employer_cost?: number;
  run_by?: string;
  calculated_at?: string;
  [key: string]: unknown;
}

interface PayslipData {
  payroll_run_id?: number;
  employee_id?: number;
  employee_name?: string;
  department?: string;
  job_title?: string;
  period?: string;
  base_salary?: number;
  overtime_hours?: number;
  overtime_pay?: number;
  bonus?: number;
  commission?: number;
  gross_salary?: number;
  income_tax?: number;
  national_insurance?: number;
  health_insurance?: number;
  pension_employee?: number;
  total_deductions?: number;
  net_salary?: number;
  pension_employer?: number;
  severance_contrib?: number;
  total_employer_cost?: number;
  [key: string]: unknown;
}

type RecordData = EmployeeData | AttendanceData | ShiftData | PayrollRunData | PayslipData;

function getRecordData<T extends RecordData>(record: { data: unknown }): T {
  return (record.data as T) || ({} as T);
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  req.user = result.user as AuthUser;
  next();
}

function checkHrAccess(permissions: ResolvedPermissions | undefined, entityId: number, action: "read" | "create" | "update" | "delete"): boolean {
  if (!permissions) return false;
  if (permissions.isSuperAdmin) return true;
  return checkEntityAccess(permissions, String(entityId), action);
}

router.use("/hr", requireAuth as unknown as (req: Request, res: Response, next: NextFunction) => void);

const EMPLOYEE_ENTITY_ID = 34;
const ATTENDANCE_ENTITY_ID = 35;
const SHIFTS_ENTITY_ID = 36;

router.get("/hr/dashboard", async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const permissions = req.permissions;

    if (!checkHrAccess(permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בנתוני עובדים" });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const weekStart = (() => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      return d.toISOString().slice(0, 10);
    })();

    const [allEmployees, todayAttendance, weekShifts, recentEmployees] = await Promise.all([
      db.select().from(entityRecordsTable).where(eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)),
      db.select().from(entityRecordsTable).where(
        and(eq(entityRecordsTable.entityId, ATTENDANCE_ENTITY_ID), sql`${entityRecordsTable.data}->>'date' = ${today}`)
      ),
      db.select().from(entityRecordsTable).where(
        and(eq(entityRecordsTable.entityId, SHIFTS_ENTITY_ID), sql`${entityRecordsTable.data}->>'shift_date' >= ${weekStart}`)
      ),
      db.select().from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID))
        .orderBy(desc(entityRecordsTable.createdAt)).limit(10),
    ]);

    const employees = {
      total_employees: allEmployees.length,
      active_employees: allEmployees.filter(e => e.status === "active").length,
      on_leave: allEmployees.filter(e => e.status === "on_leave").length,
      terminated: allEmployees.filter(e => e.status === "terminated").length,
      contractors: allEmployees.filter(e => getRecordData<EmployeeData>(e).employment_type === "contractor").length,
      full_time: allEmployees.filter(e => getRecordData<EmployeeData>(e).employment_type === "full_time").length,
    };

    const attendance = {
      total_records: todayAttendance.length,
      present_today: todayAttendance.filter(a => getRecordData<AttendanceData>(a).type === "present").length,
      absent_today: todayAttendance.filter(a => getRecordData<AttendanceData>(a).type === "absent").length,
      late_today: todayAttendance.filter(a => getRecordData<AttendanceData>(a).type === "late").length,
      avg_hours: (() => {
        const hours = todayAttendance.map(a => Number(getRecordData<AttendanceData>(a).total_hours) || 0).filter(h => h > 0);
        return hours.length > 0 ? hours.reduce((s, h) => s + h, 0) / hours.length : 0;
      })(),
    };

    const uniqueShiftEmployees = new Set(weekShifts.map(s => getRecordData<ShiftData>(s).employee_id).filter(Boolean));
    const shifts = {
      total_shifts: weekShifts.length,
      active_shifts: weekShifts.filter(s => s.status === "active").length,
      employees_with_shifts: uniqueShiftEmployees.size,
    };

    res.json({ employees, attendance, shifts, recentEmployees });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/employees", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בעובדים" });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const search = req.query.search as string;
    const status = req.query.status as string;

    const conditions = [eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)];
    if (search) {
      conditions.push(sql`${entityRecordsTable.data}::text ILIKE ${'%' + search + '%'}`);
    }
    if (status) {
      conditions.push(eq(entityRecordsTable.status, status));
    }

    const whereClause = and(...conditions);

    const [employees, countResult] = await Promise.all([
      db.select().from(entityRecordsTable)
        .where(whereClause)
        .orderBy(desc(entityRecordsTable.createdAt))
        .limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(entityRecordsTable)
        .where(whereClause),
    ]);

    res.json({ employees, total: countResult[0]?.count || 0 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/employees/stats", async (_req: Request, res: Response) => {
  try {
    const [countResult, activeResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)),
      db.select({ count: sql<number>`count(*)::int` })
        .from(entityRecordsTable)
        .where(and(eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID), eq(entityRecordsTable.status, "active"))),
    ]);
    res.json({
      total: countResult[0]?.count || 0,
      active: activeResult[0]?.count || 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/employees/:id", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בעובד" });
      return;
    }

    const id = Number(req.params.id);
    const [employee] = await db.select().from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.id, id), eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)));

    if (!employee) { res.status(404).json({ error: "עובד לא נמצא" }); return; }

    const idStr = String(id);
    const payslipEntityId = await getEntityIdBySlug("payslip");
    const contractorAgreementEntityId = await getEntityIdBySlug("contractor_agreement");

    const [attendance, shifts, payslips, agreements] = await Promise.all([
      db.select().from(entityRecordsTable)
        .where(and(
          eq(entityRecordsTable.entityId, ATTENDANCE_ENTITY_ID),
          sql`${entityRecordsTable.data}->>'employee_id' = ${idStr}`
        ))
        .orderBy(sql`${entityRecordsTable.data}->>'date' DESC NULLS LAST`).limit(30),
      db.select().from(entityRecordsTable)
        .where(and(
          eq(entityRecordsTable.entityId, SHIFTS_ENTITY_ID),
          sql`${entityRecordsTable.data}->>'employee_id' = ${idStr}`
        ))
        .orderBy(sql`${entityRecordsTable.data}->>'shift_date' DESC NULLS LAST`).limit(30),
      payslipEntityId
        ? db.select().from(entityRecordsTable)
            .where(and(
              eq(entityRecordsTable.entityId, payslipEntityId),
              sql`(${entityRecordsTable.data}->>'employee_id')::text = ${idStr}`
            ))
            .orderBy(desc(entityRecordsTable.createdAt)).limit(24)
        : Promise.resolve([]),
      contractorAgreementEntityId
        ? db.select().from(entityRecordsTable)
            .where(and(
              eq(entityRecordsTable.entityId, contractorAgreementEntityId),
              sql`${entityRecordsTable.data}->>'contractor_id' = ${idStr}`
            ))
            .orderBy(desc(entityRecordsTable.createdAt))
        : Promise.resolve([]),
    ]);

    const d = getRecordData<EmployeeData>(employee);
    const projects = payslips.map(p => {
      const pd = getRecordData<PayslipData>(p);
      return {
        period: pd.period || "",
        grossSalary: Number(pd.gross_salary) || 0,
        netSalary: Number(pd.net_salary) || 0,
        department: pd.department || d.department || "",
        jobTitle: pd.job_title || d.job_title || "",
      };
    });

    res.json({ employee, attendance, shifts, payslips, agreements, projects });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/hr/employees", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "create")) {
      res.status(403).json({ error: "אין הרשאה ליצירת עובד" });
      return;
    }
    const { status, data } = req.body;
    const [record] = await db.insert(entityRecordsTable).values({
      entityId: EMPLOYEE_ENTITY_ID,
      status: status || "active",
      data: data || {},
    }).returning();

    const empData = data || {};
    onEmployeeCreated(record.id, {
      full_name: empData.full_name || empData.first_name || "",
      employee_id: empData.employee_id || String(record.id),
      department: empData.department || "",
    }).catch(err => console.error("[data-sync] employee created cascade error:", err));

    res.json(record);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.put("/hr/employees/:id", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "update")) {
      res.status(403).json({ error: "אין הרשאה לעדכון עובד" });
      return;
    }
    const id = Number(req.params.id);
    const { status, data } = req.body;
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (data !== undefined) updates.data = data;
    const [record] = await db.update(entityRecordsTable)
      .set(updates)
      .where(and(eq(entityRecordsTable.id, id), eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)))
      .returning();
    if (!record) { res.status(404).json({ error: "עובד לא נמצא" }); return; }
    res.json(record);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.delete("/hr/employees/:id", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "delete")) {
      res.status(403).json({ error: "אין הרשאה למחיקת עובד" });
      return;
    }
    const id = Number(req.params.id);
    const [record] = await db.delete(entityRecordsTable)
      .where(and(eq(entityRecordsTable.id, id), eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)))
      .returning();
    if (!record) { res.status(404).json({ error: "עובד לא נמצא" }); return; }
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

function calculatePayroll(emp: typeof entityRecordsTable.$inferSelect) {
  const d = getRecordData<EmployeeData>(emp);
  const baseSalary = Number(d.base_salary) || 0;
  const overtimeHours = Number(d.overtime_hours) || 0;
  const hourlyRate = baseSalary > 0 ? baseSalary / 186 : 0;
  const overtimePay = overtimeHours * hourlyRate * 1.25;
  const bonus = Number(d.bonus) || 0;
  const commission = Number(d.commission) || 0;
  const grossSalary = baseSalary + overtimePay + bonus + commission;

  const taxRate = getIncomeTaxRate(grossSalary);
  const incomeTax = grossSalary * taxRate;
  const nationalInsurance = grossSalary * NATIONAL_INSURANCE_RATE;
  const healthInsurance = grossSalary * HEALTH_INSURANCE_RATE;
  const pensionEmployee = grossSalary * PENSION_EMPLOYEE_RATE;
  const totalDeductions = incomeTax + nationalInsurance + healthInsurance + pensionEmployee;
  const netSalary = grossSalary - totalDeductions;

  const pensionEmployer = grossSalary * PENSION_EMPLOYER_RATE;
  const severanceContrib = grossSalary * SEVERANCE_RATE;
  const totalEmployerCost = grossSalary + pensionEmployer + severanceContrib;

  const employeeName = d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "N/A";

  return {
    employeeId: emp.id,
    employeeName,
    department: d.department || "",
    role: d.job_title || d.role || "",
    baseSalary: Math.round(baseSalary),
    overtimeHours,
    overtimePay: Math.round(overtimePay),
    bonus: Math.round(bonus),
    commission: Math.round(commission),
    grossSalary: Math.round(grossSalary),
    incomeTax: Math.round(incomeTax),
    nationalInsurance: Math.round(nationalInsurance),
    healthInsurance: Math.round(healthInsurance),
    pensionEmployee: Math.round(pensionEmployee),
    totalDeductions: Math.round(totalDeductions),
    netSalary: Math.round(netSalary),
    pensionEmployer: Math.round(pensionEmployer),
    severanceContrib: Math.round(severanceContrib),
    totalEmployerCost: Math.round(totalEmployerCost),
  };
}

router.get("/hr/payroll/summary", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בנתוני שכר" });
      return;
    }

    const employees = await db.select().from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID), eq(entityRecordsTable.status, "active")));

    const payrollData = employees.map(calculatePayroll);

    const totals = payrollData.reduce(
      (acc, p) => ({
        totalGross: acc.totalGross + p.grossSalary,
        totalNet: acc.totalNet + p.netSalary,
        totalDeductions: acc.totalDeductions + p.totalDeductions,
        totalEmployerCost: acc.totalEmployerCost + p.totalEmployerCost,
        count: acc.count + 1,
      }),
      { totalGross: 0, totalNet: 0, totalDeductions: 0, totalEmployerCost: 0, count: 0 }
    );

    res.json({ payroll: payrollData, totals });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/hr/payroll/run", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "update")) {
      res.status(403).json({ error: "אין הרשאה להרצת שכר" });
      return;
    }

    const authReq = req as AuthenticatedRequest;
    const now = new Date();
    const month = String(req.body.month || (now.getMonth() + 1)).padStart(2, "0");
    const year = Number(req.body.year) || now.getFullYear();
    const period = `${year}-${month}`;

    const payrollRunEntityId = await getEntityIdBySlug("payroll_run");
    const payslipEntityId = await getEntityIdBySlug("payslip");

    if (!payrollRunEntityId || !payslipEntityId) {
      res.status(400).json({ error: "יש להריץ את מיגרציית HR תחילה (POST /api/platform/migrate/hr)" });
      return;
    }

    const existingRun = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.entityId, payrollRunEntityId),
        sql`${entityRecordsTable.data}->>'period' = ${period}`
      ));

    if (existingRun.length > 0) {
      res.status(409).json({ error: `ריצת שכר לתקופה ${period} כבר קיימת`, existingRunId: existingRun[0].id });
      return;
    }

    const employees = await db.select().from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID), eq(entityRecordsTable.status, "active")));

    const payrollData = employees.map(calculatePayroll);

    const totals = payrollData.reduce(
      (acc, p) => ({
        totalGross: acc.totalGross + p.grossSalary,
        totalNet: acc.totalNet + p.netSalary,
        totalDeductions: acc.totalDeductions + p.totalDeductions,
        totalEmployerCost: acc.totalEmployerCost + p.totalEmployerCost,
        count: acc.count + 1,
      }),
      { totalGross: 0, totalNet: 0, totalDeductions: 0, totalEmployerCost: 0, count: 0 }
    );

    const runData: PayrollRunData = {
      period,
      month,
      year,
      run_status: "calculated",
      employee_count: totals.count,
      total_gross: totals.totalGross,
      total_deductions: totals.totalDeductions,
      total_net: totals.totalNet,
      total_employer_cost: totals.totalEmployerCost,
      run_by: authReq.user?.fullName || authReq.user?.username || "system",
      calculated_at: now.toISOString(),
    };

    const [payrollRun] = await db.insert(entityRecordsTable).values({
      entityId: payrollRunEntityId,
      data: runData,
      status: "calculated",
    }).returning();

    const payslips = [];
    for (const p of payrollData) {
      const slipData: PayslipData = {
        payroll_run_id: payrollRun.id,
        employee_id: p.employeeId,
        employee_name: p.employeeName,
        department: p.department,
        job_title: p.role,
        period,
        base_salary: p.baseSalary,
        overtime_hours: p.overtimeHours,
        overtime_pay: p.overtimePay,
        bonus: p.bonus,
        commission: p.commission,
        gross_salary: p.grossSalary,
        income_tax: p.incomeTax,
        national_insurance: p.nationalInsurance,
        health_insurance: p.healthInsurance,
        pension_employee: p.pensionEmployee,
        total_deductions: p.totalDeductions,
        net_salary: p.netSalary,
        pension_employer: p.pensionEmployer,
        severance_contrib: p.severanceContrib,
        total_employer_cost: p.totalEmployerCost,
      };

      const [slip] = await db.insert(entityRecordsTable).values({
        entityId: payslipEntityId,
        data: slipData,
        status: "active",
      }).returning();
      payslips.push(slip);
    }

    res.json({
      message: `ריצת שכר לתקופה ${period} הושלמה`,
      payrollRun,
      payslipCount: payslips.length,
      totals,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/payroll/runs", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בריצות שכר" });
      return;
    }

    const payrollRunEntityId = await getEntityIdBySlug("payroll_run");
    if (!payrollRunEntityId) {
      res.json({ runs: [] });
      return;
    }

    const runs = await db.select().from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, payrollRunEntityId))
      .orderBy(desc(entityRecordsTable.createdAt))
      .limit(50);

    res.json({ runs });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/payroll/runs/:runId/payslips", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בתלושי שכר" });
      return;
    }

    const runId = req.params.runId;
    const payslipEntityId = await getEntityIdBySlug("payslip");
    if (!payslipEntityId) {
      res.json({ payslips: [] });
      return;
    }

    const payslips = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.entityId, payslipEntityId),
        sql`${entityRecordsTable.data}->>'payroll_run_id' = ${runId}`
      ))
      .orderBy(asc(entityRecordsTable.id));

    res.json({ payslips });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/employee-value", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בשווי עובדים" });
      return;
    }

    const employees = await db.select().from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID), eq(entityRecordsTable.status, "active")));

    const valueData = employees.map((emp) => {
      const d = getRecordData<EmployeeData>(emp);
      const baseSalary = Number(d.base_salary) || 0;
      const monthlyRevenue = Number(d.monthly_revenue) || 0;
      const projectsCompleted = Number(d.projects_completed) || 0;
      const clientSatisfaction = Number(d.client_satisfaction) || 0;
      const hireDate = d.hire_date ? new Date(d.hire_date) : new Date();
      const monthsEmployed = Math.max(1, Math.floor((Date.now() - hireDate.getTime()) / (30 * 24 * 60 * 60 * 1000)));

      const totalRevenue = monthlyRevenue * monthsEmployed;
      const totalCost = (baseSalary * 1.25) * monthsEmployed;
      const netValue = totalRevenue - totalCost;
      const roi = totalCost > 0 ? ((totalRevenue - totalCost) / totalCost) * 100 : 0;
      const revenuePerHour = baseSalary > 0 ? (monthlyRevenue / 186) : 0;
      const costPerHour = baseSalary > 0 ? ((baseSalary * 1.25) / 186) : 0;
      const productivityScore = Math.min(100, Math.round(
        (projectsCompleted * 10 + clientSatisfaction * 20 + Math.min(roi, 100)) / 3
      ));

      return {
        employeeId: emp.id,
        employeeName: d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "N/A",
        department: d.department || "",
        role: d.job_title || d.role || "",
        monthsEmployed,
        baseSalary: Math.round(baseSalary),
        monthlyRevenue: Math.round(monthlyRevenue),
        totalRevenue: Math.round(totalRevenue),
        totalCost: Math.round(totalCost),
        netValue: Math.round(netValue),
        roi: Math.round(roi * 10) / 10,
        revenuePerHour: Math.round(revenuePerHour),
        costPerHour: Math.round(costPerHour),
        productivityScore,
        projectsCompleted,
        clientSatisfaction,
      };
    });

    const totals = valueData.reduce(
      (acc, v) => ({
        totalRevenue: acc.totalRevenue + v.totalRevenue,
        totalCost: acc.totalCost + v.totalCost,
        totalNetValue: acc.totalNetValue + v.netValue,
        avgProductivity: acc.avgProductivity + v.productivityScore,
        count: acc.count + 1,
      }),
      { totalRevenue: 0, totalCost: 0, totalNetValue: 0, avgProductivity: 0, count: 0 }
    );
    if (totals.count > 0) totals.avgProductivity = Math.round(totals.avgProductivity / totals.count);

    res.json({ employees: valueData, totals });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/attendance/summary", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, ATTENDANCE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בנוכחות" });
      return;
    }

    const monthParam = (req.query.month as string) || "";
    const monthMatch = /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : new Date().toISOString().slice(0, 7);
    const startDate = `${monthMatch}-01`;

    const records = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.entityId, ATTENDANCE_ENTITY_ID),
        sql`(${entityRecordsTable.data}->>'date')::date >= ${startDate}::date`,
        sql`(${entityRecordsTable.data}->>'date')::date < (${startDate}::date + INTERVAL '1 month')`
      ));

    const summary = {
      total_records: records.length,
      present_count: records.filter(r => getRecordData<AttendanceData>(r).type === "present").length,
      absent_count: records.filter(r => getRecordData<AttendanceData>(r).type === "absent").length,
      late_count: records.filter(r => getRecordData<AttendanceData>(r).type === "late").length,
      sick_leave_count: records.filter(r => getRecordData<AttendanceData>(r).type === "sick_leave").length,
      vacation_count: records.filter(r => getRecordData<AttendanceData>(r).type === "vacation").length,
      avg_hours: (() => {
        const hours = records.map(r => Number(getRecordData<AttendanceData>(r).total_hours) || 0).filter(h => h > 0);
        return hours.length > 0 ? hours.reduce((s, h) => s + h, 0) / hours.length : 0;
      })(),
      total_overtime: records.reduce((s, r) => s + (Number(getRecordData<AttendanceData>(r).overtime_hours) || 0), 0),
    };

    const dailyMap = new Map<string, { present: number; absent: number; late: number }>();
    records.forEach(r => {
      const date = getRecordData<AttendanceData>(r).date || r.createdAt.toISOString().slice(0, 10);
      if (!dailyMap.has(date)) dailyMap.set(date, { present: 0, absent: 0, late: 0 });
      const day = dailyMap.get(date)!;
      const type = getRecordData<AttendanceData>(r).type;
      if (type === "present") day.present++;
      else if (type === "absent") day.absent++;
      else if (type === "late") day.late++;
    });
    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));

    interface EmployeeAttendanceSummary {
      employee_id: string;
      employee_name: string;
      total_days: number;
      present_days: number;
      absent_days: number;
      total_hours: number;
      overtime_hours: number;
    }

    const empMap = new Map<string, EmployeeAttendanceSummary>();
    records.forEach(r => {
      const d = getRecordData<AttendanceData>(r);
      const empId = d.employee_id || "unknown";
      if (!empMap.has(empId)) {
        empMap.set(empId, {
          employee_id: empId,
          employee_name: d.employee_name || `עובד #${empId}`,
          total_days: 0, present_days: 0, absent_days: 0, total_hours: 0, overtime_hours: 0,
        });
      }
      const e = empMap.get(empId)!;
      e.total_days++;
      if (d.type === "present") e.present_days++;
      if (d.type === "absent") e.absent_days++;
      e.total_hours += Number(d.total_hours) || 0;
      e.overtime_hours += Number(d.overtime_hours) || 0;
    });

    res.json({
      summary,
      dailyBreakdown,
      employeeBreakdown: Array.from(empMap.values()),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/shifts/schedule", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, SHIFTS_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה במשמרות" });
      return;
    }

    const [shifts, allShifts] = await Promise.all([
      db.select().from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, SHIFTS_ENTITY_ID))
        .orderBy(sql`${entityRecordsTable.data}->>'shift_date' ASC`)
        .limit(200),
      db.select().from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, SHIFTS_ENTITY_ID)),
    ]);

    interface ShiftTemplate {
      name: string;
      start_time: string | undefined;
      end_time: string | undefined;
      shift_type: string | undefined;
    }

    const templateMap = new Map<string, ShiftTemplate>();
    allShifts.forEach(s => {
      const d = getRecordData<ShiftData>(s);
      if (d.template_name && !templateMap.has(d.template_name)) {
        templateMap.set(d.template_name, {
          name: d.template_name,
          start_time: d.start_time,
          end_time: d.end_time,
          shift_type: d.shift_type,
        });
      }
    });

    interface ShiftConflict {
      shift1_id: number;
      shift2_id: number;
      employee_name: string;
    }

    const conflicts: ShiftConflict[] = [];
    for (let i = 0; i < allShifts.length; i++) {
      for (let j = i + 1; j < allShifts.length; j++) {
        const a = getRecordData<ShiftData>(allShifts[i]);
        const b = getRecordData<ShiftData>(allShifts[j]);
        if (a.employee_id && a.employee_id === b.employee_id &&
            a.shift_date && a.shift_date === b.shift_date &&
            a.start_time && b.start_time && a.end_time && b.end_time &&
            a.start_time < b.end_time && b.start_time < a.end_time) {
          conflicts.push({
            shift1_id: allShifts[i].id,
            shift2_id: allShifts[j].id,
            employee_name: a.employee_name || `עובד #${a.employee_id}`,
          });
        }
      }
    }

    res.json({
      shifts,
      templates: Array.from(templateMap.values()),
      conflicts: conflicts.slice(0, 20),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

interface ContractorAgreementData {
  contractor_name?: string;
  contractor_id?: string;
  payment_model?: string;
  rate?: string | number;
  percentage_rate?: string | number;
  specialty?: string;
  start_date?: string;
  end_date?: string;
  agreement_status?: string;
  notes?: string;
  [key: string]: unknown;
}

router.get("/hr/contractors", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בקבלנים" });
      return;
    }

    const contractorAgreementEntityId = await getEntityIdBySlug("contractor_agreement");

    const [employees, agreements] = await Promise.all([
      db.select().from(entityRecordsTable)
        .where(and(
          eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID),
          sql`(${entityRecordsTable.data}->>'employment_type' = 'contractor' OR ${entityRecordsTable.data}->>'is_contractor' = 'true')`
        )),
      contractorAgreementEntityId
        ? db.select().from(entityRecordsTable)
            .where(eq(entityRecordsTable.entityId, contractorAgreementEntityId))
        : Promise.resolve([]),
    ]);

    const agreementByEmployee = new Map<string, ContractorAgreementData>();
    agreements.forEach(a => {
      const ad = getRecordData<ContractorAgreementData>(a);
      if (ad.contractor_id) {
        agreementByEmployee.set(ad.contractor_id, ad);
      }
    });

    const contractorData = employees.map((emp) => {
      const d = getRecordData<EmployeeData>(emp);
      const agreement = agreementByEmployee.get(String(emp.id));

      const paymentModel = agreement?.payment_model || d.payment_model || "fixed";
      const rate = Number(agreement?.rate ?? d.rate) || 0;
      const unitsCompleted = Number(d.units_completed) || 0;
      const projectValue = Number(d.project_value) || 0;
      const percentageRate = Number(agreement?.percentage_rate ?? d.percentage_rate) || 0;

      let payment = 0;
      let companyRevenue = 0;

      if (paymentModel === "per_meter") {
        payment = rate * unitsCompleted;
        companyRevenue = payment * 3;
      } else if (paymentModel === "percentage") {
        payment = projectValue * (percentageRate / 100);
        companyRevenue = projectValue;
      } else {
        payment = rate;
        companyRevenue = payment * 3;
      }

      const margin = companyRevenue > 0 ? ((companyRevenue - payment) / companyRevenue) * 100 : 0;
      const targetMargin = 66.67;
      const marginStatus = margin >= targetMargin ? "optimal" : margin >= 50 ? "acceptable" : "below_target";

      return {
        contractorId: emp.id,
        contractorName: d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "N/A",
        specialty: agreement?.specialty || d.specialty || d.department || "",
        paymentModel,
        rate: Math.round(rate),
        unitsCompleted,
        projectValue: Math.round(projectValue),
        percentageRate,
        payment: Math.round(payment),
        companyRevenue: Math.round(companyRevenue),
        margin: Math.round(margin * 10) / 10,
        marginStatus,
        status: emp.status,
        hasAgreement: !!agreement,
        agreementStatus: agreement?.agreement_status,
      };
    });

    const totals = contractorData.reduce(
      (acc, c) => ({
        totalPayments: acc.totalPayments + c.payment,
        totalRevenue: acc.totalRevenue + c.companyRevenue,
        count: acc.count + 1,
      }),
      { totalPayments: 0, totalRevenue: 0, count: 0 }
    );
    const avgMargin = totals.totalRevenue > 0
      ? Math.round(((totals.totalRevenue - totals.totalPayments) / totals.totalRevenue) * 1000) / 10
      : 0;

    res.json({ contractors: contractorData, totals: { ...totals, avgMargin } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/departments", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה" });
      return;
    }

    const employees = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID),
        eq(entityRecordsTable.status, "active")
      ));

    const deptMap = new Map<string, number>();
    employees.forEach(e => {
      const dept = getRecordData<EmployeeData>(e).department;
      if (dept) deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    });

    const departments = Array.from(deptMap.entries())
      .map(([department, count]) => ({ department, count }))
      .sort((a, b) => b.count - a.count);

    res.json(departments);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

import { moduleEntitiesTable } from "@workspace/db/schema";

async function getEntityIdBySlug(slug: string): Promise<number | null> {
  const [entity] = await db.select({ id: moduleEntitiesTable.id })
    .from(moduleEntitiesTable)
    .where(and(eq(moduleEntitiesTable.slug, slug), eq(moduleEntitiesTable.moduleId, 8)));
  return entity?.id || null;
}

router.get("/hr/org-chart", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה במבנה ארגוני" });
      return;
    }

    const employees = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID),
        eq(entityRecordsTable.status, "active")
      ));

    const nodes = employees.map(emp => {
      const d = getRecordData<EmployeeData>(emp);
      return {
        id: emp.id,
        name: d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "ללא שם",
        title: d.job_title || d.role || "",
        department: d.department || "",
        managerName: String(d.manager_name || ""),
        email: String(d.email || ""),
        phone: String(d.phone || ""),
        status: emp.status,
      };
    });

    const nameToIds = new Map<string, number[]>();
    nodes.forEach(n => {
      const key = n.name.toLowerCase().trim();
      if (!nameToIds.has(key)) nameToIds.set(key, []);
      nameToIds.get(key)!.push(n.id);
    });

    const hierarchy = nodes.map(n => {
      let managerId: number | null = null;
      if (n.managerName) {
        const key = n.managerName.toLowerCase().trim();
        const ids = nameToIds.get(key);
        if (ids && ids.length > 0 && ids[0] !== n.id) {
          managerId = ids[0];
        }
      }
      return { ...n, managerId };
    });

    const departments = new Map<string, number>();
    nodes.forEach(n => {
      if (n.department) {
        departments.set(n.department, (departments.get(n.department) || 0) + 1);
      }
    });

    res.json({
      nodes: hierarchy,
      departments: Array.from(departments.entries()).map(([name, count]) => ({ name, count })),
      totalEmployees: nodes.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

interface BenefitsData {
  health_insurance_type?: string;
  pension_fund?: string;
  pension_employee_pct?: string | number;
  pension_employer_pct?: string | number;
  training_fund?: string;
  training_fund_pct?: string | number;
  car_make?: string;
  car_model?: string;
  car_value?: string | number;
  phone_allowance?: string | number;
  meal_allowance?: string | number;
  managers_insurance?: string;
  annual_vacation_days?: string | number;
  sick_days_balance?: string | number;
  vacation_days_remaining?: string | number;
}

router.get("/hr/benefits", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בהטבות" });
      return;
    }

    const employees = await db.select().from(entityRecordsTable)
      .where(and(
        eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID),
        eq(entityRecordsTable.status, "active")
      ));

    const benefits = employees.map(emp => {
      const d = emp.data as Record<string, unknown>;
      return {
        employeeId: emp.id,
        employeeName: (d.full_name as string) || `${(d.first_name as string) || ""} ${(d.last_name as string) || ""}`.trim() || "ללא שם",
        department: (d.department as string) || "",
        jobTitle: (d.job_title as string) || (d.role as string) || "",
        healthInsuranceType: (d.health_insurance_type as string) || "",
        pensionFund: (d.pension_fund as string) || "",
        pensionEmployeePct: Number(d.pension_employee_pct) || 0,
        pensionEmployerPct: Number(d.pension_employer_pct) || 0,
        trainingFund: (d.training_fund as string) || "",
        trainingFundPct: Number(d.training_fund_pct) || 0,
        carMake: (d.car_make as string) || "",
        carModel: (d.car_model as string) || "",
        carValue: Number(d.car_value) || 0,
        phoneAllowance: Number(d.phone_allowance) || 0,
        mealAllowance: Number(d.meal_allowance) || 0,
        managersInsurance: (d.managers_insurance as string) || "",
        annualVacationDays: Number(d.annual_vacation_days) || 0,
        sickDaysBalance: Number(d.sick_days_balance) || 0,
        vacationDaysRemaining: Number(d.vacation_days_remaining) || 0,
      };
    });

    const stats = {
      totalEmployees: benefits.length,
      withHealthInsurance: benefits.filter(b => b.healthInsuranceType && b.healthInsuranceType !== "ללא").length,
      withPension: benefits.filter(b => b.pensionEmployeePct > 0 || b.pensionEmployerPct > 0).length,
      withCar: benefits.filter(b => b.carMake || b.carValue > 0).length,
      withPhoneAllowance: benefits.filter(b => b.phoneAllowance > 0).length,
      withMealAllowance: benefits.filter(b => b.mealAllowance > 0).length,
      avgPensionEmployeePct: benefits.length > 0
        ? Math.round((benefits.reduce((s, b) => s + b.pensionEmployeePct, 0) / benefits.length) * 10) / 10
        : 0,
      avgPensionEmployerPct: benefits.length > 0
        ? Math.round((benefits.reduce((s, b) => s + b.pensionEmployerPct, 0) / benefits.length) * 10) / 10
        : 0,
      totalCarValue: benefits.reduce((s, b) => s + b.carValue, 0),
      totalPhoneAllowance: benefits.reduce((s, b) => s + b.phoneAllowance, 0),
      totalMealAllowance: benefits.reduce((s, b) => s + b.mealAllowance, 0),
    };

    res.json({ benefits, stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.get("/hr/benefits/:employeeId", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "read")) {
      res.status(403).json({ error: "אין הרשאה לצפייה בהטבות" });
      return;
    }

    const id = Number(req.params.employeeId);
    const [employee] = await db.select().from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.id, id), eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)));

    if (!employee) {
      res.status(404).json({ error: "עובד לא נמצא" });
      return;
    }

    const d = employee.data as Record<string, unknown>;
    res.json({
      employeeId: employee.id,
      employeeName: (d.full_name as string) || `${(d.first_name as string) || ""} ${(d.last_name as string) || ""}`.trim() || "ללא שם",
      healthInsuranceType: (d.health_insurance_type as string) || "",
      pensionFund: (d.pension_fund as string) || "",
      pensionEmployeePct: Number(d.pension_employee_pct) || 0,
      pensionEmployerPct: Number(d.pension_employer_pct) || 0,
      trainingFund: (d.training_fund as string) || "",
      trainingFundPct: Number(d.training_fund_pct) || 0,
      carMake: (d.car_make as string) || "",
      carModel: (d.car_model as string) || "",
      carValue: Number(d.car_value) || 0,
      phoneAllowance: Number(d.phone_allowance) || 0,
      mealAllowance: Number(d.meal_allowance) || 0,
      managersInsurance: (d.managers_insurance as string) || "",
      annualVacationDays: Number(d.annual_vacation_days) || 0,
      sickDaysBalance: Number(d.sick_days_balance) || 0,
      vacationDaysRemaining: Number(d.vacation_days_remaining) || 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.put("/hr/benefits/:employeeId", async (req: Request, res: Response) => {
  try {
    if (!checkHrAccess(req.permissions, EMPLOYEE_ENTITY_ID, "update")) {
      res.status(403).json({ error: "אין הרשאה לעדכון הטבות" });
      return;
    }

    const id = Number(req.params.employeeId);
    const [employee] = await db.select().from(entityRecordsTable)
      .where(and(eq(entityRecordsTable.id, id), eq(entityRecordsTable.entityId, EMPLOYEE_ENTITY_ID)));

    if (!employee) {
      res.status(404).json({ error: "עובד לא נמצא" });
      return;
    }

    const existingData = (employee.data || {}) as Record<string, unknown>;
    const body = req.body;

    const benefitFields = [
      "health_insurance_type", "pension_fund", "pension_employee_pct", "pension_employer_pct",
      "training_fund", "training_fund_pct", "car_make", "car_model", "car_value",
      "phone_allowance", "meal_allowance", "managers_insurance",
      "annual_vacation_days", "sick_days_balance", "vacation_days_remaining",
    ];

    const updatedData = { ...existingData };
    for (const field of benefitFields) {
      if (field in body) {
        updatedData[field] = body[field];
      }
    }

    const [updated] = await db.update(entityRecordsTable)
      .set({ data: updatedData, updatedAt: new Date() })
      .where(eq(entityRecordsTable.id, id))
      .returning();

    res.json({ message: "הטבות עודכנו בהצלחה", employee: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
