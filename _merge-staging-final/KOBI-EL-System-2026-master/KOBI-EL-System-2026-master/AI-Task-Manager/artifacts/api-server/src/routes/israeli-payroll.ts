import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { checkEntityAccess, type ResolvedPermissions } from "../lib/permission-engine";
import { calculateIsraeliPayroll, getTaxConfigForYear, ISRAELI_TAX_CONFIG_2025, ISRAELI_TAX_CONFIG_2026, type PayrollInputEmployee } from "../services/israeli-payroll-engine";

const router = Router();

const PAYROLL_ENTITY_ID = 34;

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

function requirePayrollAccess(action: "read" | "create" | "update" | "delete" = "read") {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const permissions: ResolvedPermissions | undefined = (req as any).permissions;
    if (user?.isSuperAdmin) { next(); return; }
    if (permissions) {
      if (permissions.isSuperAdmin) { next(); return; }
      if (checkEntityAccess(permissions, String(PAYROLL_ENTITY_ID), action)) { next(); return; }
    }
    const role: string = (user?.role || "").toLowerCase();
    const hrRoles = ["admin", "hr", "payroll", "superadmin"];
    if (hrRoles.some(r => role === r || role.startsWith(r + "_") || role.endsWith("_" + r))) { next(); return; }
    res.status(403).json({ error: "אין הרשאה לגישה לנתוני שכר" });
  };
}

function requireAdminAccess() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    const permissions: ResolvedPermissions | undefined = (req as any).permissions;
    if (user?.isSuperAdmin) { next(); return; }
    if (permissions?.isSuperAdmin) { next(); return; }
    const role: string = user?.role || "";
    if (["admin", "superadmin"].some(r => role.toLowerCase().includes(r))) { next(); return; }
    res.status(403).json({ error: "נדרשת הרשאת מנהל מערכת" });
  };
}

router.use(requireAuth as any);
router.use("/payroll", requirePayrollAccess("read") as any);

async function q(query: any) {
  const r = await db.execute(query);
  return (r?.rows || r || []) as any[];
}

async function loadTaxConfigFromDb(year: number): Promise<import("../services/israeli-payroll-engine").IsraeliTaxConfig> {
  try {
    const rows = await q(sql`SELECT * FROM israeli_tax_config WHERE tax_year = ${year}`);
    if (rows.length > 0) {
      const row = rows[0];
      const brackets = typeof row.brackets_json === "string" ? JSON.parse(row.brackets_json) : (row.brackets_json || []);
      const blRates = typeof row.bituach_leumi_rates === "string" ? JSON.parse(row.bituach_leumi_rates) : (row.bituach_leumi_rates || {});
      const healthRates = typeof row.health_rates === "string" ? JSON.parse(row.health_rates) : (row.health_rates || {});
      const pensionMin = typeof row.pension_minimums === "string" ? JSON.parse(row.pension_minimums) : (row.pension_minimums || {});
      if (brackets.length > 0) {
        return {
          taxYear: year,
          creditPointValue: Number(row.credit_point_value) || getTaxConfigForYear(year).creditPointValue,
          brackets,
          bituachLeumiEmployee: {
            lowerRate: blRates.employeeLower || getTaxConfigForYear(year).bituachLeumiEmployee.lowerRate,
            upperRate: blRates.employeeUpper || getTaxConfigForYear(year).bituachLeumiEmployee.upperRate,
            threshold: blRates.employeeThreshold || getTaxConfigForYear(year).bituachLeumiEmployee.threshold,
            ceiling: blRates.ceiling || getTaxConfigForYear(year).bituachLeumiEmployee.ceiling,
          },
          bituachLeumiEmployer: {
            lowerRate: blRates.employerLower || getTaxConfigForYear(year).bituachLeumiEmployer.lowerRate,
            upperRate: blRates.employerUpper || getTaxConfigForYear(year).bituachLeumiEmployer.upperRate,
            threshold: blRates.employerThreshold || blRates.employeeThreshold || getTaxConfigForYear(year).bituachLeumiEmployer.threshold,
            ceiling: blRates.ceiling || getTaxConfigForYear(year).bituachLeumiEmployer.ceiling,
          },
          healthEmployee: {
            lowerRate: healthRates.lowerRate || healthRates.lower || getTaxConfigForYear(year).healthEmployee.lowerRate,
            upperRate: healthRates.upperRate || healthRates.upper || getTaxConfigForYear(year).healthEmployee.upperRate,
            threshold: healthRates.threshold || getTaxConfigForYear(year).healthEmployee.threshold,
          },
          pensionMinimumSalary: Number(pensionMin.minimumWage) || getTaxConfigForYear(year).pensionMinimumSalary,
          educationFundCeiling: Number(row.education_fund_ceiling) || getTaxConfigForYear(year).educationFundCeiling,
          convalescenceRatePerDay: Number(row.convalescence_rate_per_day) || getTaxConfigForYear(year).convalescenceRatePerDay,
        };
      }
    }
  } catch { }
  return getTaxConfigForYear(year);
}

const ALLOWED_COST_CENTER_TYPES = ["department", "project", "production_order"] as const;
function isCostCenterType(v: unknown): v is typeof ALLOWED_COST_CENTER_TYPES[number] {
  return ALLOWED_COST_CENTER_TYPES.includes(v as any);
}

function parsePeriod(p: unknown): { py: number; pm: number } | null {
  if (typeof p !== "string") return null;
  const m = p.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const py = parseInt(m[1]), pm = parseInt(m[2]);
  if (py < 2000 || py > 2100 || pm < 1 || pm > 12) return null;
  return { py, pm };
}

async function ensurePayrollTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payroll_calculation_runs (
      id SERIAL PRIMARY KEY,
      run_number VARCHAR(30) UNIQUE,
      period VARCHAR(7) NOT NULL,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      calculated_by VARCHAR(100),
      reviewed_by VARCHAR(100),
      approved_by VARCHAR(100),
      finalized_by VARCHAR(100),
      employee_count INTEGER DEFAULT 0,
      total_gross NUMERIC(14,2) DEFAULT 0,
      total_net NUMERIC(14,2) DEFAULT 0,
      total_employer_cost NUMERIC(14,2) DEFAULT 0,
      total_cost_to_employer NUMERIC(14,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='payroll_calculation_runs' AND column_name='reviewed_by')
      THEN ALTER TABLE payroll_calculation_runs ADD COLUMN reviewed_by VARCHAR(100); END IF;
    END$$
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payroll_employee_calculations (
      id SERIAL PRIMARY KEY,
      run_id INTEGER REFERENCES payroll_calculation_runs(id) ON DELETE CASCADE,
      employee_id INTEGER,
      employee_name VARCHAR(200),
      department VARCHAR(100),
      job_title VARCHAR(100),
      period VARCHAR(7),
      base_salary NUMERIC(12,2) DEFAULT 0,
      overtime_pay NUMERIC(12,2) DEFAULT 0,
      overtime_hours NUMERIC(6,2) DEFAULT 0,
      bonus NUMERIC(12,2) DEFAULT 0,
      commission NUMERIC(12,2) DEFAULT 0,
      travel_allowance NUMERIC(12,2) DEFAULT 0,
      allowances NUMERIC(12,2) DEFAULT 0,
      convalescence_pay NUMERIC(12,2) DEFAULT 0,
      gross_salary NUMERIC(12,2) DEFAULT 0,
      income_tax NUMERIC(12,2) DEFAULT 0,
      tax_credit_points_value NUMERIC(12,2) DEFAULT 0,
      bituach_leumi_employee NUMERIC(12,2) DEFAULT 0,
      health_insurance_employee NUMERIC(12,2) DEFAULT 0,
      pension_employee NUMERIC(12,2) DEFAULT 0,
      education_fund_employee NUMERIC(12,2) DEFAULT 0,
      total_deductions NUMERIC(12,2) DEFAULT 0,
      net_salary NUMERIC(12,2) DEFAULT 0,
      pension_employer NUMERIC(12,2) DEFAULT 0,
      severance_contrib NUMERIC(12,2) DEFAULT 0,
      bituach_leumi_employer NUMERIC(12,2) DEFAULT 0,
      education_fund_employer NUMERIC(12,2) DEFAULT 0,
      total_employer_cost NUMERIC(12,2) DEFAULT 0,
      total_cost_to_employer NUMERIC(12,2) DEFAULT 0,
      tax_credit_points NUMERIC(5,2) DEFAULT 2.25,
      pension_employee_pct NUMERIC(5,2) DEFAULT 6,
      pension_employer_pct NUMERIC(5,2) DEFAULT 6.5,
      severance_pct NUMERIC(5,2) DEFAULT 8.33,
      education_fund_employee_pct NUMERIC(5,2) DEFAULT 2.5,
      education_fund_employer_pct NUMERIC(5,2) DEFAULT 7.5,
      keren_hishtalmut_enabled BOOLEAN DEFAULT TRUE,
      adjustment_notes TEXT,
      line_items JSONB DEFAULT '[]',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_name='payroll_employee_calculations' AND column_name='health_insurance_employee')
      THEN ALTER TABLE payroll_employee_calculations ADD COLUMN health_insurance_employee NUMERIC(12,2) DEFAULT 0; END IF;
    END$$
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS payroll_line_items (
      id SERIAL PRIMARY KEY,
      calc_id INTEGER REFERENCES payroll_employee_calculations(id) ON DELETE CASCADE,
      run_id INTEGER,
      employee_id INTEGER,
      line_type VARCHAR(50) NOT NULL,
      description VARCHAR(300) NOT NULL,
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      is_deduction BOOLEAN DEFAULT FALSE,
      is_employer_cost BOOLEAN DEFAULT FALSE,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS labor_cost_allocations (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      employee_name VARCHAR(200),
      period VARCHAR(7) NOT NULL,
      cost_center_type VARCHAR(30) NOT NULL,
      cost_center_id VARCHAR(100),
      cost_center_name VARCHAR(200),
      allocation_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
      allocation_hours NUMERIC(8,2),
      allocated_gross NUMERIC(12,2) DEFAULT 0,
      allocated_net NUMERIC(12,2) DEFAULT 0,
      allocated_employer_cost NUMERIC(12,2) DEFAULT 0,
      allocated_total_cost NUMERIC(12,2) DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS israeli_tax_config (
      id SERIAL PRIMARY KEY,
      tax_year INTEGER UNIQUE NOT NULL,
      credit_point_value NUMERIC(8,2),
      brackets_json JSONB,
      bituach_leumi_rates JSONB,
      health_rates JSONB,
      pension_minimums JSONB,
      education_fund_ceiling NUMERIC(10,2),
      convalescence_rate_per_day NUMERIC(8,2),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

router.post("/payroll/migrate", requireAdminAccess() as any, async (_req, res) => {
  try {
    await ensurePayrollTables();
    await db.execute(sql`
      INSERT INTO israeli_tax_config (tax_year, credit_point_value, brackets_json, bituach_leumi_rates, health_rates, pension_minimums, education_fund_ceiling, convalescence_rate_per_day)
      VALUES (
        2025, 242,
        '[{"upTo":7010,"rate":0.10},{"upTo":10060,"rate":0.14},{"upTo":16150,"rate":0.20},{"upTo":21240,"rate":0.31},{"upTo":44060,"rate":0.35},{"upTo":57170,"rate":0.47},{"upTo":null,"rate":0.50}]',
        '{"employeeThreshold":7522,"employeeLower":0.004,"employeeUpper":0.07,"employerLower":0.037,"employerUpper":0.123,"ceiling":49030}',
        '{"threshold":7522,"lower":0.031,"upper":0.05}',
        '{"minimumWage":5880}',
        15712, 379
      )
      ON CONFLICT (tax_year) DO NOTHING
    `);
    res.json({ success: true, message: "טבלאות שכר ישראלי נוצרו בהצלחה" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/tax-config", async (_req, res) => {
  try {
    const rows = await q(sql`SELECT * FROM israeli_tax_config ORDER BY tax_year DESC`);
    res.json(rows.length > 0 ? rows : [ISRAELI_TAX_CONFIG_2026, ISRAELI_TAX_CONFIG_2025]);
  } catch {
    res.json([ISRAELI_TAX_CONFIG_2026, ISRAELI_TAX_CONFIG_2025]);
  }
});

router.get("/payroll/calculation-runs", async (_req, res) => {
  try {
    await ensurePayrollTables();
    const rows = await q(sql`SELECT * FROM payroll_calculation_runs ORDER BY created_at DESC LIMIT 50`);
    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/calculation-runs/:runId", async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const [run] = await q(sql`SELECT * FROM payroll_calculation_runs WHERE id = ${runId}`);
    if (!run) { res.status(404).json({ error: "ריצת שכר לא נמצאה" }); return; }
    const calcs = await q(sql`SELECT * FROM payroll_employee_calculations WHERE run_id = ${runId} ORDER BY employee_name`);
    res.json({ run, calculations: calcs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/payroll/calculation-runs", requirePayrollAccess("create") as any, async (req, res) => {
  try {
    await ensurePayrollTables();
    const user = (req as any).user;
    const now = new Date();
    const month = Math.min(12, Math.max(1, parseInt(req.body.month) || (now.getMonth() + 1)));
    const year = Math.min(2100, Math.max(2000, parseInt(req.body.year) || now.getFullYear()));
    const period = `${year}-${String(month).padStart(2, "0")}`;

    const [existing] = await q(sql`SELECT id FROM payroll_calculation_runs WHERE period = ${period} AND status NOT IN ('cancelled')`);
    if (existing) {
      res.status(409).json({ error: `ריצת שכר לתקופה ${period} כבר קיימת`, runId: existing.id });
      return;
    }

    const countResult = await q(sql`SELECT COUNT(*)+1 as next FROM payroll_calculation_runs`);
    const runNum = `RUN-${String(countResult[0]?.next || 1).padStart(4, "0")}`;
    const userName = String(user?.fullName || user?.username || "system").substring(0, 100);

    const [newRun] = await q(sql`
      INSERT INTO payroll_calculation_runs (run_number, period, period_year, period_month, status, calculated_by)
      VALUES (${runNum}, ${period}, ${year}, ${month}, 'draft', ${userName})
      RETURNING *
    `);

    res.json({ run: newRun, message: `ריצת שכר ${runNum} נוצרה לתקופה ${period}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/payroll/calculation-runs/:runId/calculate", requirePayrollAccess("update") as any, async (req, res) => {
  try {
    await ensurePayrollTables();
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const user = (req as any).user;

    const [run] = await q(sql`SELECT * FROM payroll_calculation_runs WHERE id = ${runId}`);
    if (!run) { res.status(404).json({ error: "ריצת שכר לא נמצאה" }); return; }
    if (!["draft", "calculated"].includes(run.status)) {
      res.status(400).json({ error: "ניתן לחשב רק ריצות בסטטוס טיוטה" }); return;
    }

    const employees = await q(sql`
      SELECT e.id, e.data FROM entity_records e
      INNER JOIN entities ent ON ent.id = e.entity_id
      WHERE ent.slug = 'employee' AND e.status = 'active'
    `);

    let empInputs: PayrollInputEmployee[] = [];

    if (employees.length === 0) {
      const empRows = await q(sql`
        SELECT id, full_name, department, job_title, base_salary, pension_employee_pct, pension_employer_pct,
               severance_pct, education_fund_employee_pct, education_fund_employer_pct, tax_credit_points, hire_date, convalescence_days
        FROM employees WHERE status = 'active' LIMIT 200
      `);
      empInputs = empRows.map((emp: any) => ({
        id: emp.id,
        name: emp.full_name || "לא ידוע",
        department: emp.department || "",
        jobTitle: emp.job_title || "",
        baseSalary: Number(emp.base_salary) || 0,
        taxCreditPoints: Number(emp.tax_credit_points) || 2.25,
        pensionEmployeePct: Number(emp.pension_employee_pct) || 6,
        pensionEmployerPct: Number(emp.pension_employer_pct) || 6.5,
        severancePct: Number(emp.severance_pct) || 8.33,
        educationFundEmployeePct: Number(emp.education_fund_employee_pct) || 2.5,
        educationFundEmployerPct: Number(emp.education_fund_employer_pct) || 7.5,
        hireDate: emp.hire_date,
        convalescenceDays: emp.convalescence_days || 0,
        kerenHishtalmutEnabled: true,
      }));
    } else {
      empInputs = employees.map((empRow: any) => {
        const d = typeof empRow.data === "string" ? JSON.parse(empRow.data) : (empRow.data || {});
        return {
          id: empRow.id,
          name: d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim() || "לא ידוע",
          department: d.department || "",
          jobTitle: d.job_title || d.role || "",
          baseSalary: Number(d.base_salary) || 0,
          taxCreditPoints: Number(d.tax_credit_points) || 2.25,
          pensionEmployeePct: Number(d.employee_pension_pct) || 6,
          pensionEmployerPct: Number(d.employer_pension_pct) || 6.5,
          severancePct: Number(d.severance_pct) || 8.33,
          educationFundEmployeePct: Number(d.education_fund_employee_pct) || 2.5,
          educationFundEmployerPct: Number(d.education_fund_employer_pct) || 7.5,
          hireDate: d.hire_date,
          kerenHishtalmutEnabled: true,
        };
      });
    }

    if (empInputs.length === 0) {
      res.json({ message: "אין עובדים פעילים לחישוב", calculated: 0 }); return;
    }

    const attendanceMap: Record<string, { overtimeHours: number; absenceDays: number }> = {};
    try {
      const attendanceRows = await q(sql`
        SELECT employee_name, employee_id,
          COALESCE(SUM(overtime_hours), 0) as total_overtime_hours,
          COUNT(CASE WHEN status = 'absent' THEN 1 END) as absence_days
        FROM attendance_records
        WHERE EXTRACT(MONTH FROM attendance_date) = ${run.period_month}
          AND EXTRACT(YEAR FROM attendance_date) = ${run.period_year}
        GROUP BY employee_name, employee_id
      `);
      for (const row of attendanceRows) {
        const key = String(row.employee_id || row.employee_name || "");
        if (key) attendanceMap[key] = { overtimeHours: Number(row.total_overtime_hours) || 0, absenceDays: Number(row.absence_days) || 0 };
        if (row.employee_name) attendanceMap[String(row.employee_name)] = { overtimeHours: Number(row.total_overtime_hours) || 0, absenceDays: Number(row.absence_days) || 0 };
      }
    } catch { }

    await q(sql`DELETE FROM payroll_line_items WHERE run_id = ${runId}`);
    await q(sql`DELETE FROM payroll_employee_calculations WHERE run_id = ${runId}`);

    let totalGross = 0, totalNet = 0, totalEmployerCost = 0, totalCostToEmployer = 0;

    for (const input of empInputs) {
      const att = attendanceMap[String(input.id)] || attendanceMap[String(input.name)];
      if (att && att.overtimeHours > 0 && !input.overtimePay) {
        const hourlyRate = input.baseSalary / 182;
        input.overtimeHours = att.overtimeHours;
        input.overtimePay = Math.round(att.overtimeHours * hourlyRate * 1.25);
      }

      const taxConfig = await loadTaxConfigFromDb(run.period_year);
      const calc = calculateIsraeliPayroll(input, run.period, taxConfig);

      const [inserted] = await q(sql`
        INSERT INTO payroll_employee_calculations
          (run_id, employee_id, employee_name, department, job_title, period,
           base_salary, overtime_pay, overtime_hours, bonus, commission, travel_allowance,
           allowances, convalescence_pay, gross_salary, income_tax, tax_credit_points_value,
           bituach_leumi_employee, health_insurance_employee, pension_employee, education_fund_employee, total_deductions,
           net_salary, pension_employer, severance_contrib, bituach_leumi_employer,
           education_fund_employer, total_employer_cost, total_cost_to_employer,
           tax_credit_points, pension_employee_pct, pension_employer_pct, severance_pct,
           education_fund_employee_pct, education_fund_employer_pct, keren_hishtalmut_enabled,
           line_items)
        VALUES
          (${runId}, ${calc.employeeId}, ${calc.employeeName}, ${calc.department}, ${calc.jobTitle}, ${calc.period},
           ${calc.baseSalary}, ${calc.overtimePay}, ${calc.overtimeHours}, ${calc.bonus}, ${calc.commission}, ${calc.travelAllowance},
           ${calc.allowances}, ${calc.convalescencePay}, ${calc.grossSalary}, ${calc.incomeTax}, ${calc.taxCreditPointsValue},
           ${calc.bituachLeumiEmployee}, ${calc.healthInsuranceEmployee}, ${calc.pensionEmployee}, ${calc.educationFundEmployee}, ${calc.totalEmployeeDeductions},
           ${calc.netSalary}, ${calc.pensionEmployer}, ${calc.severanceContrib}, ${calc.bituachLeumiEmployer},
           ${calc.educationFundEmployer}, ${calc.totalEmployerCost}, ${calc.totalCostToEmployer},
           ${input.taxCreditPoints || 2.25}, ${input.pensionEmployeePct || 6}, ${input.pensionEmployerPct || 6.5},
           ${input.severancePct || 8.33}, ${input.educationFundEmployeePct || 2.5}, ${input.educationFundEmployerPct || 7.5},
           ${input.kerenHishtalmutEnabled !== false},
           ${JSON.stringify(calc.lineItems)})
        RETURNING id
      `);

      if (inserted?.id) {
        for (let i = 0; i < calc.lineItems.length; i++) {
          const li = calc.lineItems[i];
          await q(sql`
            INSERT INTO payroll_line_items (calc_id, run_id, employee_id, line_type, description, amount, is_deduction, is_employer_cost, sort_order)
            VALUES (${inserted.id}, ${runId}, ${input.id || null}, ${li.lineType || "component"}, ${li.description || ""}, ${Number(li.amount) || 0}, ${li.isDeduction === true}, ${li.isEmployerCost === true}, ${i})
          `);
        }
      }

      totalGross += calc.grossSalary;
      totalNet += calc.netSalary;
      totalEmployerCost += calc.totalEmployerCost;
      totalCostToEmployer += calc.totalCostToEmployer;
    }

    const userName = String(user?.fullName || user?.username || "system").substring(0, 100);
    await q(sql`
      UPDATE payroll_calculation_runs SET
        status = 'calculated',
        employee_count = ${empInputs.length},
        total_gross = ${totalGross},
        total_net = ${totalNet},
        total_employer_cost = ${totalEmployerCost},
        total_cost_to_employer = ${totalCostToEmployer},
        calculated_by = ${userName},
        updated_at = NOW()
      WHERE id = ${runId}
    `);

    res.json({ message: `חושבו ${empInputs.length} עובדים`, calculated: empInputs.length, totalGross, totalNet, totalEmployerCost });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.put("/payroll/calculation-runs/:runId/employee/:calcId", requirePayrollAccess("update") as any, async (req, res) => {
  try {
    const calcId = parseInt(req.params.calcId);
    const runId = parseInt(req.params.runId);
    if (isNaN(calcId) || isNaN(runId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const b = req.body;

    const [run] = await q(sql`SELECT * FROM payroll_calculation_runs WHERE id = ${runId}`);
    if (!run) { res.status(404).json({ error: "ריצת שכר לא נמצאה" }); return; }
    if (run.status === "approved" || run.status === "finalized") {
      res.status(400).json({ error: "לא ניתן לשנות ריצה מאושרת" }); return;
    }

    const [existingCalc] = await q(sql`SELECT id FROM payroll_employee_calculations WHERE id = ${calcId} AND run_id = ${runId}`);
    if (!existingCalc) { res.status(404).json({ error: "חישוב עובד לא נמצא בריצה זו" }); return; }

    const bonus = b.bonus !== undefined ? Math.max(0, Number(b.bonus)) : undefined;
    const commission = b.commission !== undefined ? Math.max(0, Number(b.commission)) : undefined;
    const overtimePay = b.overtimePay !== undefined ? Math.max(0, Number(b.overtimePay)) : undefined;
    const overtimeHours = b.overtimeHours !== undefined ? Math.max(0, Number(b.overtimeHours)) : undefined;
    const allowances = b.allowances !== undefined ? Math.max(0, Number(b.allowances)) : undefined;
    const travelAllowance = b.travelAllowance !== undefined ? Math.max(0, Number(b.travelAllowance)) : undefined;
    const adjustmentNotes = b.adjustmentNotes !== undefined ? String(b.adjustmentNotes).substring(0, 500) : undefined;

    if (bonus !== undefined) await q(sql`UPDATE payroll_employee_calculations SET bonus = ${bonus} WHERE id = ${calcId} AND run_id = ${runId}`);
    if (commission !== undefined) await q(sql`UPDATE payroll_employee_calculations SET commission = ${commission} WHERE id = ${calcId} AND run_id = ${runId}`);
    if (overtimePay !== undefined) await q(sql`UPDATE payroll_employee_calculations SET overtime_pay = ${overtimePay} WHERE id = ${calcId} AND run_id = ${runId}`);
    if (overtimeHours !== undefined) await q(sql`UPDATE payroll_employee_calculations SET overtime_hours = ${overtimeHours} WHERE id = ${calcId} AND run_id = ${runId}`);
    if (allowances !== undefined) await q(sql`UPDATE payroll_employee_calculations SET allowances = ${allowances} WHERE id = ${calcId} AND run_id = ${runId}`);
    if (travelAllowance !== undefined) await q(sql`UPDATE payroll_employee_calculations SET travel_allowance = ${travelAllowance} WHERE id = ${calcId} AND run_id = ${runId}`);
    if (adjustmentNotes !== undefined) await q(sql`UPDATE payroll_employee_calculations SET adjustment_notes = ${adjustmentNotes} WHERE id = ${calcId} AND run_id = ${runId}`);

    const [updated] = await q(sql`SELECT * FROM payroll_employee_calculations WHERE id = ${calcId} AND run_id = ${runId}`);
    if (updated) {
      const input: PayrollInputEmployee = {
        id: updated.employee_id,
        name: updated.employee_name,
        department: updated.department,
        jobTitle: updated.job_title,
        baseSalary: Number(updated.base_salary),
        overtimePay: Number(updated.overtime_pay),
        overtimeHours: Number(updated.overtime_hours),
        bonus: Number(updated.bonus),
        commission: Number(updated.commission),
        travelAllowance: Number(updated.travel_allowance),
        allowances: Number(updated.allowances),
        taxCreditPoints: Number(updated.tax_credit_points) || 2.25,
        pensionEmployeePct: Number(updated.pension_employee_pct) || 6,
        pensionEmployerPct: Number(updated.pension_employer_pct) || 6.5,
        severancePct: Number(updated.severance_pct) || 8.33,
        educationFundEmployeePct: Number(updated.education_fund_employee_pct) || 2.5,
        educationFundEmployerPct: Number(updated.education_fund_employer_pct) || 7.5,
        kerenHishtalmutEnabled: updated.keren_hishtalmut_enabled !== false,
      };
      const taxConfig = await loadTaxConfigFromDb(run.period_year);
      const calc = calculateIsraeliPayroll(input, updated.period, taxConfig);
      await q(sql`
        UPDATE payroll_employee_calculations SET
          gross_salary = ${calc.grossSalary},
          income_tax = ${calc.incomeTax},
          tax_credit_points_value = ${calc.taxCreditPointsValue},
          bituach_leumi_employee = ${calc.bituachLeumiEmployee},
          health_insurance_employee = ${calc.healthInsuranceEmployee},
          pension_employee = ${calc.pensionEmployee},
          education_fund_employee = ${calc.educationFundEmployee},
          total_deductions = ${calc.totalEmployeeDeductions},
          net_salary = ${calc.netSalary},
          pension_employer = ${calc.pensionEmployer},
          severance_contrib = ${calc.severanceContrib},
          bituach_leumi_employer = ${calc.bituachLeumiEmployer},
          education_fund_employer = ${calc.educationFundEmployer},
          total_employer_cost = ${calc.totalEmployerCost},
          total_cost_to_employer = ${calc.totalCostToEmployer},
          line_items = ${JSON.stringify(calc.lineItems)},
          updated_at = NOW()
        WHERE id = ${calcId}
      `);

      await q(sql`DELETE FROM payroll_line_items WHERE calc_id = ${calcId}`);
      for (let i = 0; i < calc.lineItems.length; i++) {
        const li = calc.lineItems[i];
        await q(sql`
          INSERT INTO payroll_line_items (calc_id, run_id, employee_id, line_type, description, amount, is_deduction, is_employer_cost, sort_order)
          VALUES (${calcId}, ${runId}, ${updated.employee_id || null}, ${li.lineType || "component"}, ${li.description || ""}, ${Number(li.amount) || 0}, ${li.isDeduction === true}, ${li.isEmployerCost === true}, ${i})
        `);
      }

      const [totals] = await q(sql`
        SELECT SUM(gross_salary) as tg, SUM(net_salary) as tn, SUM(total_employer_cost) as te, SUM(total_cost_to_employer) as tc
        FROM payroll_employee_calculations WHERE run_id = ${runId}
      `);
      await q(sql`
        UPDATE payroll_calculation_runs SET
          total_gross = ${Number(totals?.tg) || 0}, total_net = ${Number(totals?.tn) || 0},
          total_employer_cost = ${Number(totals?.te) || 0}, total_cost_to_employer = ${Number(totals?.tc) || 0},
          updated_at = NOW()
        WHERE id = ${runId}
      `);
    }

    res.json({ success: true, message: "עדכון בוצע בהצלחה" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/payroll/calculation-runs/:runId/review", requirePayrollAccess("update") as any, async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const user = (req as any).user;
    const [run] = await q(sql`SELECT * FROM payroll_calculation_runs WHERE id = ${runId}`);
    if (!run) { res.status(404).json({ error: "ריצת שכר לא נמצאה" }); return; }
    if (run.status !== "calculated") {
      res.status(400).json({ error: "ניתן לסקור רק ריצות שחושבו" }); return;
    }
    const userName = String(user?.fullName || user?.username || "system").substring(0, 100);
    await q(sql`UPDATE payroll_calculation_runs SET status='reviewed', reviewed_by=${userName}, updated_at=NOW() WHERE id=${runId}`);
    res.json({ success: true, message: "ריצת השכר סומנה כנסקרת" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/payroll/calculation-runs/:runId/approve", requirePayrollAccess("update") as any, async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const user = (req as any).user;
    const [run] = await q(sql`SELECT * FROM payroll_calculation_runs WHERE id = ${runId}`);
    if (!run) { res.status(404).json({ error: "ריצת שכר לא נמצאה" }); return; }
    if (!["calculated", "reviewed"].includes(run.status)) {
      res.status(400).json({ error: "ניתן לאשר רק ריצות שחושבו או נסקרו" }); return;
    }
    const userName = String(user?.fullName || user?.username || "system").substring(0, 100);
    await q(sql`UPDATE payroll_calculation_runs SET status='approved', approved_by=${userName}, updated_at=NOW() WHERE id=${runId}`);
    res.json({ success: true, message: "ריצת השכר אושרה" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/payroll/calculation-runs/:runId/finalize", requirePayrollAccess("update") as any, async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const user = (req as any).user;
    const [run] = await q(sql`SELECT * FROM payroll_calculation_runs WHERE id = ${runId}`);
    if (!run) { res.status(404).json({ error: "ריצת שכר לא נמצאה" }); return; }
    if (run.status !== "approved") {
      res.status(400).json({ error: "ניתן לסיים רק ריצות מאושרות" }); return;
    }
    const userName = String(user?.fullName || user?.username || "system").substring(0, 100);
    await q(sql`UPDATE payroll_calculation_runs SET status='finalized', finalized_by=${userName}, updated_at=NOW() WHERE id=${runId}`);

    try {
      const calcs = await q(sql`SELECT * FROM payroll_employee_calculations WHERE run_id=${runId}`);
      for (const c of calcs) {
        await q(sql`
          INSERT INTO payroll_records (record_number, employee_name, department, period_month, period_year,
            base_salary, overtime_hours, overtime_pay, bonus, commission, allowances, travel_allowance,
            gross_salary, income_tax, national_insurance, health_insurance, pension_employee, pension_employer,
            severance_fund, education_fund, other_deductions, total_deductions, net_salary, employer_cost, status)
          VALUES (
            ${(run.run_number || run.period) + "-" + c.employee_id},
            ${c.employee_name}, ${c.department || ""},
            ${run.period_month}, ${run.period_year},
            ${c.base_salary}, ${c.overtime_hours}, ${c.overtime_pay},
            ${c.bonus}, ${c.commission}, ${c.allowances}, ${c.travel_allowance},
            ${c.gross_salary}, ${c.income_tax}, ${c.bituach_leumi_employee}, ${c.health_insurance_employee || 0},
            ${c.pension_employee}, ${c.pension_employer}, ${c.severance_contrib}, ${c.education_fund_employer},
            0, ${c.total_deductions}, ${c.net_salary}, ${c.total_employer_cost}, 'approved'
          )
          ON CONFLICT DO NOTHING
        `);
      }
    } catch { }

    res.json({ success: true, message: "ריצת השכר הסתיימה ותלושים נוצרו" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/payroll/calculation-runs/:runId/cancel", requirePayrollAccess("update") as any, async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const [run] = await q(sql`SELECT * FROM payroll_calculation_runs WHERE id = ${runId}`);
    if (!run) { res.status(404).json({ error: "ריצת שכר לא נמצאה" }); return; }
    if (run.status === "finalized") { res.status(400).json({ error: "לא ניתן לבטל ריצה שסיימה" }); return; }
    await q(sql`UPDATE payroll_calculation_runs SET status='cancelled', updated_at=NOW() WHERE id=${runId}`);
    res.json({ success: true, message: "ריצת השכר בוטלה" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/calculation-runs/:runId/employer-report", async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    const calcs = await q(sql`
      SELECT employee_name, department, job_title, gross_salary, pension_employer, severance_contrib,
             bituach_leumi_employer, education_fund_employer, total_employer_cost, total_cost_to_employer
      FROM payroll_employee_calculations WHERE run_id=${runId} ORDER BY department, employee_name
    `);
    const deptSummary = calcs.reduce((acc: any, c: any) => {
      const d = c.department || "כללי";
      if (!acc[d]) acc[d] = { department: d, count: 0, totalGross: 0, totalPension: 0, totalSeverance: 0, totalBL: 0, totalEdFund: 0, totalEmployerCost: 0, totalCostToEmployer: 0 };
      acc[d].count++;
      acc[d].totalGross += Number(c.gross_salary);
      acc[d].totalPension += Number(c.pension_employer);
      acc[d].totalSeverance += Number(c.severance_contrib);
      acc[d].totalBL += Number(c.bituach_leumi_employer);
      acc[d].totalEdFund += Number(c.education_fund_employer);
      acc[d].totalEmployerCost += Number(c.total_employer_cost);
      acc[d].totalCostToEmployer += Number(c.total_cost_to_employer);
      return acc;
    }, {});
    res.json({ employees: calcs, departmentSummary: Object.values(deptSummary) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/comparison-report", async (_req, res) => {
  try {
    await ensurePayrollTables();
    const rows = await q(sql`
      SELECT period, period_year, period_month, employee_count, total_gross, total_net, total_employer_cost, total_cost_to_employer, status
      FROM payroll_calculation_runs
      WHERE status IN ('finalized','approved')
      ORDER BY period_year DESC, period_month DESC
      LIMIT 24
    `);
    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/labor-cost-allocations", async (req, res) => {
  try {
    await ensurePayrollTables();
    const { period, employeeId, costCenterType } = req.query;

    const periodParsed = period ? parsePeriod(period) : null;
    const empId = employeeId ? parseInt(String(employeeId)) : NaN;
    const cct = costCenterType && isCostCenterType(costCenterType) ? costCenterType : null;

    if (period && !periodParsed) { res.status(400).json({ error: "פורמט תקופה לא תקין (YYYY-MM)" }); return; }
    if (employeeId && isNaN(empId)) { res.status(400).json({ error: "מזהה עובד לא תקין" }); return; }

    let rows: any[];
    if (periodParsed && !isNaN(empId) && cct) {
      const periodStr = `${periodParsed.py}-${String(periodParsed.pm).padStart(2, "0")}`;
      rows = await q(sql`SELECT * FROM labor_cost_allocations WHERE period=${periodStr} AND employee_id=${empId} AND cost_center_type=${cct} ORDER BY period DESC, employee_name`);
    } else if (periodParsed && !isNaN(empId)) {
      const periodStr = `${periodParsed.py}-${String(periodParsed.pm).padStart(2, "0")}`;
      rows = await q(sql`SELECT * FROM labor_cost_allocations WHERE period=${periodStr} AND employee_id=${empId} ORDER BY period DESC, employee_name`);
    } else if (periodParsed && cct) {
      const periodStr = `${periodParsed.py}-${String(periodParsed.pm).padStart(2, "0")}`;
      rows = await q(sql`SELECT * FROM labor_cost_allocations WHERE period=${periodStr} AND cost_center_type=${cct} ORDER BY period DESC, employee_name`);
    } else if (periodParsed) {
      const periodStr = `${periodParsed.py}-${String(periodParsed.pm).padStart(2, "0")}`;
      rows = await q(sql`SELECT * FROM labor_cost_allocations WHERE period=${periodStr} ORDER BY period DESC, employee_name`);
    } else if (!isNaN(empId)) {
      rows = await q(sql`SELECT * FROM labor_cost_allocations WHERE employee_id=${empId} ORDER BY period DESC, employee_name`);
    } else if (cct) {
      rows = await q(sql`SELECT * FROM labor_cost_allocations WHERE cost_center_type=${cct} ORDER BY period DESC, employee_name`);
    } else {
      rows = await q(sql`SELECT * FROM labor_cost_allocations ORDER BY period DESC, employee_name LIMIT 500`);
    }

    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/payroll/labor-cost-allocations", requirePayrollAccess("create") as any, async (req, res) => {
  try {
    await ensurePayrollTables();
    const b = req.body;
    const allocations = Array.isArray(b) ? b : [b];

    for (const a of allocations) {
      if (!a.period || !parsePeriod(a.period)) {
        res.status(400).json({ error: "פורמט תקופה לא תקין" }); return;
      }
      if (!isCostCenterType(a.costCenterType)) {
        res.status(400).json({ error: `סוג מרכז עלות לא תקין: ${a.costCenterType}` }); return;
      }
    }

    const totalPct = allocations.reduce((s: number, a: any) => s + Number(a.allocationPct || 0), 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      res.status(400).json({ error: `סך האחוזים חייב להיות 100% (כרגע: ${totalPct.toFixed(1)}%)` }); return;
    }

    const firstAlloc = allocations[0];
    const firstEmpId = parseInt(String(firstAlloc.employeeId)) || null;
    const firstPeriod = firstAlloc.period;

    if (firstEmpId !== null) {
      await q(sql`DELETE FROM labor_cost_allocations WHERE employee_id=${firstEmpId} AND period=${firstPeriod}`);
    } else {
      const firstEmpName = String(firstAlloc.employeeName || "").substring(0, 200);
      await q(sql`DELETE FROM labor_cost_allocations WHERE employee_name=${firstEmpName} AND period=${firstPeriod}`);
    }

    for (const a of allocations) {
      const empId = parseInt(String(a.employeeId)) || null;
      const empName = String(a.employeeName || "").substring(0, 200);
      const period = String(a.period);
      const cct = String(a.costCenterType);
      const ccId = String(a.costCenterId || "").substring(0, 100) || null;
      const ccName = String(a.costCenterName || "").substring(0, 200);
      const pct = Math.min(100, Math.max(0, Number(a.allocationPct)));
      const hours = a.allocationHours !== undefined ? Math.max(0, Number(a.allocationHours)) : null;
      const gross = Math.max(0, Number(a.allocatedGross || 0));
      const net = Math.max(0, Number(a.allocatedNet || 0));
      const employer = Math.max(0, Number(a.allocatedEmployerCost || 0));
      const total = Math.max(0, Number(a.allocatedTotalCost || 0));
      const notes = a.notes ? String(a.notes).substring(0, 500) : null;

      await q(sql`
        INSERT INTO labor_cost_allocations
          (employee_id, employee_name, period, cost_center_type, cost_center_id, cost_center_name,
           allocation_pct, allocation_hours, allocated_gross, allocated_net, allocated_employer_cost, allocated_total_cost, notes)
        VALUES
          (${empId}, ${empName}, ${period}, ${cct}, ${ccId}, ${ccName},
           ${pct}, ${hours}, ${gross}, ${net}, ${employer}, ${total}, ${notes})
      `);
    }

    res.json({ success: true, message: `${allocations.length} הקצאות נשמרו בהצלחה` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/labor-cost-report", async (req, res) => {
  try {
    await ensurePayrollTables();
    const { period } = req.query;

    let rows: any[];
    if (period) {
      const parsed = parsePeriod(period);
      if (!parsed) { res.status(400).json({ error: "פורמט תקופה לא תקין (YYYY-MM)" }); return; }
      const periodStr = `${parsed.py}-${String(parsed.pm).padStart(2, "0")}`;
      rows = await q(sql`
        SELECT cost_center_type, cost_center_name, cost_center_id,
          COUNT(DISTINCT employee_id) as employee_count,
          SUM(allocation_pct) as total_pct,
          SUM(allocated_gross) as total_gross,
          SUM(allocated_net) as total_net,
          SUM(allocated_employer_cost) as total_employer_cost,
          SUM(allocated_total_cost) as total_cost
        FROM labor_cost_allocations
        WHERE period = ${periodStr}
        GROUP BY cost_center_type, cost_center_name, cost_center_id
        ORDER BY total_cost DESC
      `);
    } else {
      rows = await q(sql`
        SELECT cost_center_type, cost_center_name, cost_center_id,
          COUNT(DISTINCT employee_id) as employee_count,
          SUM(allocation_pct) as total_pct,
          SUM(allocated_gross) as total_gross,
          SUM(allocated_net) as total_net,
          SUM(allocated_employer_cost) as total_employer_cost,
          SUM(allocated_total_cost) as total_cost
        FROM labor_cost_allocations
        GROUP BY cost_center_type, cost_center_name, cost_center_id
        ORDER BY total_cost DESC
      `);
    }

    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete("/payroll/labor-cost-allocations/:id", requirePayrollAccess("delete") as any, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
    await q(sql`DELETE FROM labor_cost_allocations WHERE id = ${id}`);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/employer-cost-summary", async (req, res) => {
  try {
    const { period } = req.query;

    if (period) {
      const parsed = parsePeriod(period);
      if (!parsed) { res.status(400).json({ error: "פורמט תקופה לא תקין (YYYY-MM)" }); return; }
      const { py, pm } = parsed;

      const calcRows = await q(sql`
        SELECT c.employee_name, c.department, c.job_title, c.gross_salary,
               c.pension_employer, c.severance_contrib as severance_fund, c.bituach_leumi_employer,
               c.education_fund_employer, c.total_employer_cost, c.total_cost_to_employer, c.net_salary,
               c.bituach_leumi_employee, c.pension_employee, c.income_tax
        FROM payroll_employee_calculations c
        JOIN payroll_calculation_runs r ON r.id = c.run_id
        WHERE r.period_year = ${py} AND r.period_month = ${pm} AND r.status IN ('approved','finalized')
        ORDER BY c.department, c.employee_name
      `);

      let rows = calcRows;
      if (rows.length === 0) {
        rows = await q(sql`
          SELECT employee_name, department, job_title, gross_salary,
                 pension_employer, severance_fund, national_insurance as bituach_leumi_employer,
                 education_fund as education_fund_employer,
                 (COALESCE(pension_employer,0) + COALESCE(severance_fund,0) + COALESCE(national_insurance,0) + COALESCE(education_fund,0)) as total_employer_cost,
                 (gross_salary + COALESCE(pension_employer,0) + COALESCE(severance_fund,0) + COALESCE(national_insurance,0) + COALESCE(education_fund,0)) as total_cost_to_employer,
                 net_salary
          FROM payroll_records
          WHERE period_year = ${py} AND period_month = ${pm}
          ORDER BY department, employee_name
        `);
      }

      const deptTotals = rows.reduce((acc: any, r: any) => {
        const d = r.department || "כללי";
        if (!acc[d]) acc[d] = { department: d, count: 0, totalGross: 0, totalEmployerCost: 0, totalCostToEmployer: 0, pension: 0, severance: 0, bl: 0, edFund: 0 };
        acc[d].count++;
        acc[d].totalGross += Number(r.gross_salary);
        acc[d].totalEmployerCost += Number(r.total_employer_cost);
        acc[d].totalCostToEmployer += Number(r.total_cost_to_employer);
        acc[d].pension += Number(r.pension_employer);
        acc[d].severance += Number(r.severance_fund);
        acc[d].bl += Number(r.bituach_leumi_employer);
        acc[d].edFund += Number(r.education_fund_employer);
        return acc;
      }, {});

      res.json({ employees: rows, departmentSummary: Object.values(deptTotals) });
      return;
    }

    const rows = await q(sql`
      SELECT department,
        COUNT(DISTINCT employee_name) as emp_count,
        SUM(gross_salary) as total_gross,
        SUM(COALESCE(pension_employer,0)) as total_pension,
        SUM(COALESCE(severance_fund,0)) as total_severance,
        SUM(COALESCE(national_insurance,0) * 0.6) as total_bl_employer,
        SUM(COALESCE(education_fund,0)) as total_ed_fund,
        SUM(employer_cost) as total_employer_cost
      FROM payroll_records
      GROUP BY department ORDER BY total_employer_cost DESC NULLS LAST
    `);

    const [grandTotals] = await q(sql`
      SELECT COUNT(DISTINCT employee_name) as emp_count,
        SUM(gross_salary) as total_gross,
        SUM(COALESCE(pension_employer,0)) as total_pension,
        SUM(COALESCE(severance_fund,0)) as total_severance,
        SUM(employer_cost) as total_employer_cost
      FROM payroll_records WHERE status != 'cancelled'
    `);

    res.json({ departmentSummary: rows, grandTotals: grandTotals || {} });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/run-employees", async (req, res) => {
  try {
    await ensurePayrollTables();
    const { month, year } = req.query;
    const m = parseInt(String(month));
    const y = parseInt(String(year));
    if (isNaN(m) || isNaN(y) || m < 1 || m > 12 || y < 2000 || y > 2100) {
      res.status(400).json({ error: "פרמטרים לא תקינים" }); return;
    }

    const rows = await q(sql`
      SELECT c.id, c.employee_id as employee_id_ref, c.employee_name, c.department, c.job_title,
             c.gross_salary, c.net_salary, c.total_employer_cost as employer_cost,
             c.total_cost_to_employer, c.period
      FROM payroll_employee_calculations c
      JOIN payroll_calculation_runs r ON r.id = c.run_id
      WHERE r.period_year = ${y} AND r.period_month = ${m} AND r.status IN ('calculated','reviewed','approved','finalized')
      ORDER BY c.employee_name
    `);

    res.json(rows);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post("/payroll/calculate-preview", async (req, res) => {
  try {
    const { employee } = req.body;
    if (!employee) { res.status(400).json({ error: "נתוני עובד נדרשים" }); return; }
    const periodYear = employee.period ? parseInt(employee.period.split("-")[0]) : new Date().getFullYear();
    const taxConfig = await loadTaxConfigFromDb(periodYear);
    const calc = calculateIsraeliPayroll(employee, employee.period || "2025-01", taxConfig);
    res.json(calc);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/calculation-runs/:runId/payslip/:calcId/pdf", async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    const calcId = parseInt(req.params.calcId);
    if (isNaN(runId) || isNaN(calcId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }

    const [run] = await q(sql`SELECT * FROM payroll_calculation_runs WHERE id = ${runId}`);
    if (!run) { res.status(404).json({ error: "ריצת שכר לא נמצאה" }); return; }

    const [calc] = await q(sql`SELECT * FROM payroll_employee_calculations WHERE id = ${calcId} AND run_id = ${runId}`);
    if (!calc) { res.status(404).json({ error: "חישוב עובד לא נמצא" }); return; }

    const MONTH_NAMES = ["","ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
    const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const fmtCur = (v: any) => `${fmt(v)} ₪`;
    const periodLabel = `${MONTH_NAMES[run.period_month]} ${run.period_year}`;

    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4", margin: 40, rtl: false });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      const buf = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="payslip-${calc.employee_name?.replace(/\s+/g, "_")}-${run.period}.pdf"`);
      res.send(buf);
    });

    doc.fontSize(20).font("Helvetica-Bold").text("PAYSLIP / TALOUSH SACHAR", { align: "center" });
    doc.fontSize(14).font("Helvetica").text(periodLabel, { align: "center" });
    doc.moveDown();
    doc.fontSize(12).font("Helvetica-Bold").text("Employee Details");
    doc.fontSize(11).font("Helvetica");
    doc.text(`Name: ${calc.employee_name}`);
    doc.text(`Department: ${calc.department || "-"}`);
    doc.text(`Job Title: ${calc.job_title || "-"}`);
    doc.text(`Period: ${periodLabel}`);
    doc.moveDown();

    doc.fontSize(12).font("Helvetica-Bold").text("Income (HACHNASOT)");
    doc.fontSize(11).font("Helvetica");
    doc.text(`Base Salary: ${fmtCur(calc.base_salary)}`);
    if (Number(calc.overtime_pay) > 0) doc.text(`Overtime Pay (${calc.overtime_hours}h): ${fmtCur(calc.overtime_pay)}`);
    if (Number(calc.bonus) > 0) doc.text(`Bonus: ${fmtCur(calc.bonus)}`);
    if (Number(calc.commission) > 0) doc.text(`Commission: ${fmtCur(calc.commission)}`);
    if (Number(calc.travel_allowance) > 0) doc.text(`Travel Allowance: ${fmtCur(calc.travel_allowance)}`);
    if (Number(calc.allowances) > 0) doc.text(`Other Allowances: ${fmtCur(calc.allowances)}`);
    if (Number(calc.convalescence_pay) > 0) doc.text(`Convalescence Pay: ${fmtCur(calc.convalescence_pay)}`);
    doc.font("Helvetica-Bold").text(`GROSS SALARY: ${fmtCur(calc.gross_salary)}`);
    doc.moveDown();

    doc.fontSize(12).font("Helvetica-Bold").text("Deductions (NIKOOYIM - OVED)");
    doc.fontSize(11).font("Helvetica");
    doc.text(`Income Tax (Mas Hachnasa): ${fmtCur(calc.income_tax)}`);
    if (Number(calc.tax_credit_points_value) > 0) doc.text(`  Credit Points Reduction: -${fmtCur(calc.tax_credit_points_value)}`);
    doc.text(`Bituach Leumi (Oved): ${fmtCur(calc.bituach_leumi_employee)}`);
    if (Number(calc.health_insurance_employee) > 0) doc.text(`Health Insurance (Briut): ${fmtCur(calc.health_insurance_employee)}`);
    doc.text(`Pension (Pensya - Oved 6%): ${fmtCur(calc.pension_employee)}`);
    if (Number(calc.education_fund_employee) > 0) doc.text(`Keren Hishtalmut (Oved 2.5%): ${fmtCur(calc.education_fund_employee)}`);
    doc.font("Helvetica-Bold").text(`TOTAL DEDUCTIONS: ${fmtCur(calc.total_deductions)}`);
    doc.moveDown();

    doc.rect(doc.x, doc.y, 514, 30).fill("#1a56db");
    doc.fillColor("white").fontSize(14).font("Helvetica-Bold").text(`NET SALARY (SACHAR NETO): ${fmtCur(calc.net_salary)}`, { align: "center" });
    doc.fillColor("black").moveDown();

    doc.fontSize(12).font("Helvetica-Bold").text("Employer Costs (IALUT MAASIK)");
    doc.fontSize(11).font("Helvetica");
    doc.text(`Bituach Leumi (Maasik): ${fmtCur(calc.bituach_leumi_employer)}`);
    doc.text(`Pension (Maasik 6.5%): ${fmtCur(calc.pension_employer)}`);
    doc.text(`Severance (Pitzuim 8.33%): ${fmtCur(calc.severance_contrib)}`);
    if (Number(calc.education_fund_employer) > 0) doc.text(`Keren Hishtalmut (Maasik 7.5%): ${fmtCur(calc.education_fund_employer)}`);
    doc.font("Helvetica-Bold").text(`TOTAL EMPLOYER COST: ${fmtCur(calc.total_employer_cost)}`);
    doc.text(`TOTAL COST TO EMPLOYER: ${fmtCur(calc.total_cost_to_employer)}`);
    doc.moveDown();

    doc.fontSize(9).font("Helvetica").fillColor("gray").text("Generated by Israeli Payroll Engine 2025 | Tax brackets per Income Tax Ordinance | Bituach Leumi rates per National Insurance Institute", { align: "center" });

    doc.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get("/payroll/calculation-runs/:runId/payslips-pdf", async (req, res) => {
  try {
    const runId = parseInt(req.params.runId);
    if (isNaN(runId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }

    const [run] = await q(sql`SELECT * FROM payroll_calculation_runs WHERE id = ${runId}`);
    if (!run) { res.status(404).json({ error: "ריצת שכר לא נמצאה" }); return; }
    if (!["approved", "finalized"].includes(run.status)) {
      res.status(400).json({ error: "ניתן להפיק תלושים רק לריצות מאושרות" }); return;
    }

    const calcs = await q(sql`SELECT * FROM payroll_employee_calculations WHERE run_id = ${runId} ORDER BY employee_name`);
    if (calcs.length === 0) { res.status(404).json({ error: "אין חישובי שכר לריצה זו" }); return; }

    const MONTH_NAMES = ["","ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
    const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    const fmtCur = (v: any) => `${fmt(v)} ILS`;
    const periodLabel = `${MONTH_NAMES[run.period_month]} ${run.period_year}`;

    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4", margin: 40, rtl: false, autoFirstPage: false });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => {
      const buf = Buffer.concat(chunks);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="payslips-${run.period}.pdf"`);
      res.send(buf);
    });

    for (const calc of calcs) {
      doc.addPage();
      doc.fontSize(16).font("Helvetica-Bold").text(`PAYSLIP - ${periodLabel}`, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(12).font("Helvetica").text(`${calc.employee_name} | ${calc.department || "-"}`, { align: "center" });
      doc.moveDown();

      const leftX = 40;
      doc.fontSize(11).font("Helvetica-Bold").text("INCOME", leftX);
      doc.font("Helvetica");
      const incomeItems: [string, any][] = [
        ["Base Salary", calc.base_salary],
        Number(calc.overtime_pay) > 0 ? [`Overtime (${calc.overtime_hours}h)`, calc.overtime_pay] : null,
        Number(calc.bonus) > 0 ? ["Bonus", calc.bonus] : null,
        Number(calc.commission) > 0 ? ["Commission", calc.commission] : null,
        Number(calc.travel_allowance) > 0 ? ["Travel", calc.travel_allowance] : null,
        Number(calc.allowances) > 0 ? ["Allowances", calc.allowances] : null,
        Number(calc.convalescence_pay) > 0 ? ["Convalescence", calc.convalescence_pay] : null,
      ].filter(Boolean) as [string, any][];
      for (const [label, val] of incomeItems) {
        doc.text(`  ${label}: ${fmtCur(val)}`);
      }
      doc.font("Helvetica-Bold").text(`  GROSS: ${fmtCur(calc.gross_salary)}`).moveDown(0.5);

      doc.font("Helvetica-Bold").text("DEDUCTIONS");
      doc.font("Helvetica");
      doc.text(`  Income Tax: ${fmtCur(calc.income_tax)}`);
      doc.text(`  Bituach Leumi: ${fmtCur(calc.bituach_leumi_employee)}`);
      if (Number(calc.health_insurance_employee) > 0) doc.text(`  Health Insurance (Briut): ${fmtCur(calc.health_insurance_employee)}`);
      doc.text(`  Pension (6%): ${fmtCur(calc.pension_employee)}`);
      if (Number(calc.education_fund_employee) > 0) doc.text(`  Keren Hishtalmut (2.5%): ${fmtCur(calc.education_fund_employee)}`);
      doc.font("Helvetica-Bold").text(`  TOTAL DEDUCTIONS: ${fmtCur(calc.total_deductions)}`).moveDown(0.5);

      doc.font("Helvetica-Bold").fontSize(14).text(`NET SALARY: ${fmtCur(calc.net_salary)}`, { align: "center" }).moveDown(0.5);

      doc.fontSize(11).font("Helvetica-Bold").text("EMPLOYER COSTS");
      doc.font("Helvetica");
      doc.text(`  Bituach Leumi: ${fmtCur(calc.bituach_leumi_employer)}`);
      doc.text(`  Pension (6.5%): ${fmtCur(calc.pension_employer)}`);
      doc.text(`  Severance (8.33%): ${fmtCur(calc.severance_contrib)}`);
      if (Number(calc.education_fund_employer) > 0) doc.text(`  Keren Hishtalmut (7.5%): ${fmtCur(calc.education_fund_employer)}`);
      doc.font("Helvetica-Bold").text(`  TOTAL EMPLOYER COST: ${fmtCur(calc.total_employer_cost)}`);
      doc.text(`  TOTAL COST TO EMPLOYER: ${fmtCur(calc.total_cost_to_employer)}`);
    }

    doc.end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
