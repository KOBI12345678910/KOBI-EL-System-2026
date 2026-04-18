// ============================================================
// מנוע שכר ושכרות - חישוב משכורות לחברה ישראלית עם 200 עובדים
// תומך בעובדים שכירים וקבלנים
// ============================================================

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================
// יצירת טבלאות ונתוני בסיס
// ============================================================
router.post("/init", async (req: Request, res: Response) => {
  try {
    // יצירת טבלת הרצות שכר
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payroll_runs (
        id SERIAL PRIMARY KEY,
        run_id VARCHAR(50) UNIQUE,
        period VARCHAR(7),
        year INTEGER,
        run_date DATE,
        total_employees INTEGER DEFAULT 0,
        total_gross NUMERIC(15,2) DEFAULT 0,
        total_employer_cost NUMERIC(15,2) DEFAULT 0,
        total_income_tax NUMERIC(15,2) DEFAULT 0,
        total_national_insurance_employee NUMERIC(15,2) DEFAULT 0,
        total_national_insurance_employer NUMERIC(15,2) DEFAULT 0,
        total_health_tax NUMERIC(15,2) DEFAULT 0,
        total_pension_employee NUMERIC(15,2) DEFAULT 0,
        total_pension_employer NUMERIC(15,2) DEFAULT 0,
        total_severance NUMERIC(15,2) DEFAULT 0,
        total_net NUMERIC(15,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'draft',
        approved_by VARCHAR(255),
        approved_at TIMESTAMPTZ,
        sent_to_bank BOOLEAN DEFAULT false,
        sent_to_accountant BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת תלושי שכר
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payslips (
        id SERIAL PRIMARY KEY,
        payroll_run_id INTEGER REFERENCES payroll_runs(id),
        employee_id INTEGER,
        employee_name VARCHAR(255),
        id_number VARCHAR(20),
        department VARCHAR(100),
        position VARCHAR(100),
        base_salary NUMERIC(10,2),
        overtime_hours NUMERIC(5,2) DEFAULT 0,
        overtime_125_amount NUMERIC(10,2) DEFAULT 0,
        overtime_150_amount NUMERIC(10,2) DEFAULT 0,
        travel_allowance NUMERIC(10,2) DEFAULT 0,
        phone_allowance NUMERIC(10,2) DEFAULT 0,
        bonus NUMERIC(10,2) DEFAULT 0,
        commission NUMERIC(10,2) DEFAULT 0,
        gross_salary NUMERIC(10,2),
        income_tax NUMERIC(10,2) DEFAULT 0,
        national_insurance_employee NUMERIC(10,2) DEFAULT 0,
        health_tax NUMERIC(10,2) DEFAULT 0,
        pension_employee NUMERIC(10,2) DEFAULT 0,
        pension_employer NUMERIC(10,2) DEFAULT 0,
        severance_deposit NUMERIC(10,2) DEFAULT 0,
        national_insurance_employer NUMERIC(10,2) DEFAULT 0,
        other_deductions NUMERIC(10,2) DEFAULT 0,
        net_salary NUMERIC(10,2),
        total_employer_cost NUMERIC(10,2),
        bank_name VARCHAR(100),
        bank_branch VARCHAR(20),
        bank_account VARCHAR(30),
        tax_credit_points NUMERIC(4,2) DEFAULT 2.25,
        vacation_days_used NUMERIC(4,1) DEFAULT 0,
        sick_days_used NUMERIC(4,1) DEFAULT 0,
        work_days INTEGER DEFAULT 22,
        actual_work_days INTEGER DEFAULT 22,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת טבלת מבני שכר
    await pool.query(`
      CREATE TABLE IF NOT EXISTS salary_structures (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER,
        employee_name VARCHAR(255),
        base_salary NUMERIC(10,2),
        travel_allowance NUMERIC(10,2) DEFAULT 0,
        phone_allowance NUMERIC(10,2) DEFAULT 0,
        tax_credit_points NUMERIC(4,2) DEFAULT 2.25,
        pension_rate_employee NUMERIC(4,2) DEFAULT 6.0,
        pension_rate_employer NUMERIC(4,2) DEFAULT 6.5,
        severance_rate NUMERIC(4,2) DEFAULT 8.33,
        bank_name VARCHAR(100),
        bank_branch VARCHAR(20),
        bank_account VARCHAR(30),
        effective_from DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // זריעת 15 מבני שכר - שילוב של עובדי ייצור, משרדיים, מנהלים וסוכני מכירות
    const seedData = [
      // עובדי ייצור - שכר 8,000-12,000
      { id: 1, name: "יוסי כהן", salary: 8500, travel: 400, phone: 0, dept: "ייצור", credits: 2.25, bank: "לאומי", branch: "684", account: "12345678" },
      { id: 2, name: "מוחמד עלי", salary: 9200, travel: 400, phone: 0, dept: "ייצור", credits: 2.25, bank: "הפועלים", branch: "532", account: "23456789" },
      { id: 3, name: "אלכס פטרוב", salary: 10000, travel: 450, phone: 0, dept: "ייצור", credits: 2.25, bank: "דיסקונט", branch: "123", account: "34567890" },
      { id: 4, name: "דוד לוי", salary: 11500, travel: 400, phone: 0, dept: "ייצור", credits: 2.75, bank: "לאומי", branch: "684", account: "45678901" },
      { id: 5, name: "חסן מחמוד", salary: 8800, travel: 350, phone: 0, dept: "ייצור", credits: 2.25, bank: "מזרחי", branch: "456", account: "56789012" },

      // עובדי משרד - שכר 12,000-18,000
      { id: 6, name: "שרה ישראלי", salary: 14000, travel: 500, phone: 200, dept: "הנהלת חשבונות", credits: 2.75, bank: "הפועלים", branch: "532", account: "67890123" },
      { id: 7, name: "רונית אברהם", salary: 13500, travel: 500, phone: 200, dept: "משאבי אנוש", credits: 2.25, bank: "לאומי", branch: "684", account: "78901234" },
      { id: 8, name: "תומר שלום", salary: 16000, travel: 600, phone: 250, dept: "IT", credits: 2.25, bank: "דיסקונט", branch: "123", account: "89012345" },
      { id: 9, name: "מיכל דביר", salary: 15000, travel: 500, phone: 200, dept: "שירות לקוחות", credits: 2.75, bank: "מזרחי", branch: "456", account: "90123456" },
      { id: 10, name: "נועם ברק", salary: 17500, travel: 600, phone: 250, dept: "לוגיסטיקה", credits: 2.25, bank: "הפועלים", branch: "532", account: "01234567" },

      // מנהלים - שכר 20,000-35,000
      { id: 11, name: "אורי גולדשטיין", salary: 28000, travel: 800, phone: 350, dept: "הנהלה", credits: 2.25, bank: "לאומי", branch: "684", account: "11223344" },
      { id: 12, name: "ליאת כץ", salary: 25000, travel: 750, phone: 300, dept: "מכירות", credits: 2.75, bank: "הפועלים", branch: "532", account: "22334455" },
      { id: 13, name: "אמיר נחום", salary: 32000, travel: 900, phone: 400, dept: "הנהלה", credits: 2.25, bank: "דיסקונט", branch: "123", account: "33445566" },

      // סוכני מכירות עם עמלות
      { id: 14, name: "רועי שמעון", salary: 12000, travel: 700, phone: 300, dept: "מכירות", credits: 2.25, bank: "מזרחי", branch: "456", account: "44556677" },
      { id: 15, name: "דנה פרידמן", salary: 11000, travel: 700, phone: 300, dept: "מכירות", credits: 2.75, bank: "לאומי", branch: "684", account: "55667788" },
    ];

    for (const emp of seedData) {
      await pool.query(
        `INSERT INTO salary_structures (employee_id, employee_name, base_salary, travel_allowance, phone_allowance, tax_credit_points, bank_name, bank_branch, bank_account, effective_from, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '2026-01-01', 'active')
         ON CONFLICT DO NOTHING`,
        [emp.id, emp.name, emp.salary, emp.travel, emp.phone, emp.credits, emp.bank, emp.branch, emp.account]
      );
    }

    res.json({ success: true, message: "טבלאות שכר נוצרו בהצלחה ו-15 מבני שכר נזרעו" });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// פונקציית חישוב מס הכנסה לפי מדרגות 2026
// ============================================================
function calculateIncomeTax(monthlyGross: number, creditPoints: number): number {
  // מדרגות מס הכנסה חודשיות 2026
  const brackets = [
    { limit: 7010, rate: 0.10 },
    { limit: 10060, rate: 0.14 },
    { limit: 16150, rate: 0.20 },
    { limit: 22440, rate: 0.31 },
    { limit: 46690, rate: 0.35 },
    { limit: Infinity, rate: 0.47 },
  ];

  let tax = 0;
  let prevLimit = 0;

  for (const bracket of brackets) {
    if (monthlyGross <= prevLimit) break;
    const taxableInBracket = Math.min(monthlyGross, bracket.limit) - prevLimit;
    if (taxableInBracket > 0) {
      tax += taxableInBracket * bracket.rate;
    }
    prevLimit = bracket.limit;
  }

  // הפחתת נקודות זיכוי - ערך נקודת זיכוי 235 ש"ח
  const creditValue = creditPoints * 235;
  tax = Math.max(0, tax - creditValue);

  return Math.round(tax * 100) / 100;
}

// ============================================================
// פונקציית חישוב ביטוח לאומי עובד
// ============================================================
function calculateNationalInsuranceEmployee(gross: number): number {
  // ביטוח לאומי עובד: 3.5% עד 7,122 ש"ח, 12% מעל
  const threshold = 7122;
  let ni = 0;
  if (gross <= threshold) {
    ni = gross * 0.035;
  } else {
    ni = threshold * 0.035 + (gross - threshold) * 0.12;
  }
  return Math.round(ni * 100) / 100;
}

// ============================================================
// פונקציית חישוב ביטוח לאומי מעסיק
// ============================================================
function calculateNationalInsuranceEmployer(gross: number): number {
  // ביטוח לאומי מעסיק: 3.55% עד 7,122 ש"ח, 7.6% מעל
  const threshold = 7122;
  let ni = 0;
  if (gross <= threshold) {
    ni = gross * 0.0355;
  } else {
    ni = threshold * 0.0355 + (gross - threshold) * 0.076;
  }
  return Math.round(ni * 100) / 100;
}

// ============================================================
// פונקציית חישוב מס בריאות
// ============================================================
function calculateHealthTax(gross: number): number {
  // מס בריאות: 3.1% עד 7,122 ש"ח, 5% מעל
  const threshold = 7122;
  let ht = 0;
  if (gross <= threshold) {
    ht = gross * 0.031;
  } else {
    ht = threshold * 0.031 + (gross - threshold) * 0.05;
  }
  return Math.round(ht * 100) / 100;
}

// ============================================================
// חישוב שכר לתקופה
// ============================================================
router.post("/calculate/:period", async (req: Request, res: Response) => {
  try {
    const { period } = req.params; // פורמט: "2026-03"
    const [yearStr, monthStr] = period.split("-");
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    // בדיקה אם כבר קיימת הרצה לתקופה זו
    const existingRun = await pool.query(
      `SELECT id FROM payroll_runs WHERE period = $1 AND year = $2 AND status != 'cancelled'`,
      [period, year]
    );

    if (existingRun.rows.length > 0) {
      // מחזירים הרצה קיימת - אפשר לחשב מחדש
      await pool.query(`DELETE FROM payslips WHERE payroll_run_id = $1`, [existingRun.rows[0].id]);
      await pool.query(`DELETE FROM payroll_runs WHERE id = $1`, [existingRun.rows[0].id]);
    }

    // יצירת הרצת שכר חדשה
    const runId = `PR-${period}-${Date.now().toString(36).toUpperCase()}`;
    const runResult = await pool.query(
      `INSERT INTO payroll_runs (run_id, period, year, run_date, status)
       VALUES ($1, $2, $3, CURRENT_DATE, 'draft')
       RETURNING *`,
      [runId, period, year]
    );
    const payrollRunId = runResult.rows[0].id;

    // שליפת כל מבני השכר הפעילים
    const structures = await pool.query(
      `SELECT * FROM salary_structures WHERE status = 'active' ORDER BY employee_id`
    );

    // נתוני עמלות לסוכני מכירות (סימולציה)
    const commissions: Record<number, number> = {
      14: 4500, // רועי - עמלות גבוהות
      15: 3200, // דנה - עמלות בינוניות
    };

    // נתוני שעות נוספות (סימולציה)
    const overtimeData: Record<number, { hours125: number; hours150: number }> = {
      1: { hours125: 10, hours150: 4 },
      2: { hours125: 12, hours150: 6 },
      3: { hours125: 8, hours150: 2 },
      4: { hours125: 15, hours150: 5 },
      5: { hours125: 11, hours150: 3 },
    };

    // סכומים כלליים
    let totals = {
      employees: 0,
      gross: 0,
      employerCost: 0,
      incomeTax: 0,
      niEmployee: 0,
      niEmployer: 0,
      healthTax: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      severance: 0,
      net: 0,
    };

    // חישוב משכורת לכל עובד
    for (const emp of structures.rows) {
      const hourlyRate = emp.base_salary / 186; // שעות חודשיות תקניות

      // חישוב שעות נוספות
      const ot = overtimeData[emp.employee_id] || { hours125: 0, hours150: 0 };
      const overtime125Amount = Math.round(ot.hours125 * hourlyRate * 1.25 * 100) / 100;
      const overtime150Amount = Math.round(ot.hours150 * hourlyRate * 1.50 * 100) / 100;
      const totalOvertimeHours = ot.hours125 + ot.hours150;

      // עמלות
      const commission = commissions[emp.employee_id] || 0;

      // בונוס (סימולציה - רק למנהלים בחודשים מסוימים)
      let bonus = 0;
      if (emp.base_salary >= 20000 && month === 3) {
        bonus = emp.base_salary * 0.5; // בונוס חצי משכורת ברבעון
      }

      // חישוב ברוטו
      const grossSalary =
        parseFloat(emp.base_salary) +
        overtime125Amount +
        overtime150Amount +
        parseFloat(emp.travel_allowance || 0) +
        parseFloat(emp.phone_allowance || 0) +
        bonus +
        commission;

      // חישוב ניכויים
      const incomeTax = calculateIncomeTax(grossSalary, parseFloat(emp.tax_credit_points));
      const niEmployee = calculateNationalInsuranceEmployee(grossSalary);
      const healthTax = calculateHealthTax(grossSalary);

      // פנסיה עובד ומעסיק
      const pensionableIncome = parseFloat(emp.base_salary) + overtime125Amount + overtime150Amount;
      const pensionEmployee = Math.round(pensionableIncome * (parseFloat(emp.pension_rate_employee || 6) / 100) * 100) / 100;
      const pensionEmployer = Math.round(pensionableIncome * (parseFloat(emp.pension_rate_employer || 6.5) / 100) * 100) / 100;

      // פיצויים
      const severanceDeposit = Math.round(parseFloat(emp.base_salary) * (parseFloat(emp.severance_rate || 8.33) / 100) * 100) / 100;

      // ביטוח לאומי מעסיק
      const niEmployer = calculateNationalInsuranceEmployer(grossSalary);

      // חישוב נטו
      const netSalary = Math.round((grossSalary - incomeTax - niEmployee - healthTax - pensionEmployee) * 100) / 100;

      // עלות מעסיק כוללת
      const totalEmployerCost = Math.round((grossSalary + pensionEmployer + severanceDeposit + niEmployer) * 100) / 100;

      // הכנסת תלוש שכר
      await pool.query(
        `INSERT INTO payslips (
          payroll_run_id, employee_id, employee_name, id_number, department, position,
          base_salary, overtime_hours, overtime_125_amount, overtime_150_amount,
          travel_allowance, phone_allowance, bonus, commission, gross_salary,
          income_tax, national_insurance_employee, health_tax,
          pension_employee, pension_employer, severance_deposit, national_insurance_employer,
          net_salary, total_employer_cost,
          bank_name, bank_branch, bank_account, tax_credit_points
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
        [
          payrollRunId, emp.employee_id, emp.employee_name,
          `0${emp.employee_id}${String(emp.employee_id * 1234567 % 100000000).padStart(8, "0")}`,
          emp.employee_id <= 5 ? "ייצור" : emp.employee_id <= 10 ? "משרד" : emp.employee_id <= 13 ? "הנהלה" : "מכירות",
          emp.employee_id <= 5 ? "עובד ייצור" : emp.employee_id <= 10 ? "עובד משרד" : emp.employee_id <= 13 ? "מנהל" : "סוכן מכירות",
          emp.base_salary, totalOvertimeHours, overtime125Amount, overtime150Amount,
          emp.travel_allowance, emp.phone_allowance, bonus, commission, grossSalary,
          incomeTax, niEmployee, healthTax,
          pensionEmployee, pensionEmployer, severanceDeposit, niEmployer,
          netSalary, totalEmployerCost,
          emp.bank_name, emp.bank_branch, emp.bank_account, emp.tax_credit_points,
        ]
      );

      // צבירת סכומים
      totals.employees++;
      totals.gross += grossSalary;
      totals.employerCost += totalEmployerCost;
      totals.incomeTax += incomeTax;
      totals.niEmployee += niEmployee;
      totals.niEmployer += niEmployer;
      totals.healthTax += healthTax;
      totals.pensionEmployee += pensionEmployee;
      totals.pensionEmployer += pensionEmployer;
      totals.severance += severanceDeposit;
      totals.net += netSalary;
    }

    // עדכון הרצת השכר עם הסכומים
    await pool.query(
      `UPDATE payroll_runs SET
        total_employees = $1, total_gross = $2, total_employer_cost = $3,
        total_income_tax = $4, total_national_insurance_employee = $5,
        total_national_insurance_employer = $6, total_health_tax = $7,
        total_pension_employee = $8, total_pension_employer = $9,
        total_severance = $10, total_net = $11, updated_at = NOW()
       WHERE id = $12`,
      [
        totals.employees, Math.round(totals.gross * 100) / 100, Math.round(totals.employerCost * 100) / 100,
        Math.round(totals.incomeTax * 100) / 100, Math.round(totals.niEmployee * 100) / 100,
        Math.round(totals.niEmployer * 100) / 100, Math.round(totals.healthTax * 100) / 100,
        Math.round(totals.pensionEmployee * 100) / 100, Math.round(totals.pensionEmployer * 100) / 100,
        Math.round(totals.severance * 100) / 100, Math.round(totals.net * 100) / 100,
        payrollRunId,
      ]
    );

    // שליפת הרצה מעודכנת
    const finalRun = await pool.query(`SELECT * FROM payroll_runs WHERE id = $1`, [payrollRunId]);

    res.json({
      success: true,
      message: `חושבו ${totals.employees} תלושי שכר לתקופה ${period}`,
      payroll_run: finalRun.rows[0],
      summary: {
        total_employees: totals.employees,
        total_gross: Math.round(totals.gross * 100) / 100,
        total_net: Math.round(totals.net * 100) / 100,
        total_employer_cost: Math.round(totals.employerCost * 100) / 100,
        total_deductions: Math.round((totals.incomeTax + totals.niEmployee + totals.healthTax + totals.pensionEmployee) * 100) / 100,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// רשימת כל הרצות השכר
// ============================================================
router.get("/payroll-runs", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM payroll_runs ORDER BY created_at DESC`
    );
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// כל התלושים להרצת שכר מסוימת
// ============================================================
router.get("/payslips/:runId", async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const result = await pool.query(
      `SELECT p.*, pr.period, pr.run_id, pr.status as run_status
       FROM payslips p
       JOIN payroll_runs pr ON p.payroll_run_id = pr.id
       WHERE pr.id = $1
       ORDER BY p.department, p.employee_name`,
      [runId]
    );

    // סיכום לפי מחלקה
    const departmentSummary: Record<string, { count: number; gross: number; net: number; employer_cost: number }> = {};
    for (const slip of result.rows) {
      const dept = slip.department || "לא מוגדר";
      if (!departmentSummary[dept]) {
        departmentSummary[dept] = { count: 0, gross: 0, net: 0, employer_cost: 0 };
      }
      departmentSummary[dept].count++;
      departmentSummary[dept].gross += parseFloat(slip.gross_salary);
      departmentSummary[dept].net += parseFloat(slip.net_salary);
      departmentSummary[dept].employer_cost += parseFloat(slip.total_employer_cost);
    }

    res.json({
      success: true,
      data: result.rows,
      total: result.rows.length,
      department_summary: departmentSummary,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// תלוש שכר בודד - פירוט מלא
// ============================================================
router.get("/payslip/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.*, pr.period, pr.run_id, pr.status as run_status
       FROM payslips p
       JOIN payroll_runs pr ON p.payroll_run_id = pr.id
       WHERE p.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תלוש שכר לא נמצא" });
    }

    const slip = result.rows[0];

    // פירוט מלא של התלוש
    const breakdown = {
      // הכנסות
      earnings: {
        base_salary: parseFloat(slip.base_salary),
        overtime_125: parseFloat(slip.overtime_125_amount),
        overtime_150: parseFloat(slip.overtime_150_amount),
        travel_allowance: parseFloat(slip.travel_allowance),
        phone_allowance: parseFloat(slip.phone_allowance),
        bonus: parseFloat(slip.bonus),
        commission: parseFloat(slip.commission),
        total_gross: parseFloat(slip.gross_salary),
      },
      // ניכויי עובד
      employee_deductions: {
        income_tax: parseFloat(slip.income_tax),
        national_insurance: parseFloat(slip.national_insurance_employee),
        health_tax: parseFloat(slip.health_tax),
        pension: parseFloat(slip.pension_employee),
        other: parseFloat(slip.other_deductions),
        total_deductions:
          parseFloat(slip.income_tax) +
          parseFloat(slip.national_insurance_employee) +
          parseFloat(slip.health_tax) +
          parseFloat(slip.pension_employee) +
          parseFloat(slip.other_deductions),
      },
      // הפרשות מעסיק
      employer_contributions: {
        pension: parseFloat(slip.pension_employer),
        severance: parseFloat(slip.severance_deposit),
        national_insurance: parseFloat(slip.national_insurance_employer),
        total_contributions:
          parseFloat(slip.pension_employer) +
          parseFloat(slip.severance_deposit) +
          parseFloat(slip.national_insurance_employer),
      },
      net_salary: parseFloat(slip.net_salary),
      total_employer_cost: parseFloat(slip.total_employer_cost),
    };

    res.json({ success: true, data: slip, breakdown });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// עדכון תלוש שכר לפני אישור
// ============================================================
router.put("/payslip/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // בדיקה שההרצה עדיין בסטטוס טיוטה
    const check = await pool.query(
      `SELECT pr.status FROM payslips p JOIN payroll_runs pr ON p.payroll_run_id = pr.id WHERE p.id = $1`,
      [id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ success: false, error: "תלוש לא נמצא" });
    }
    if (check.rows[0].status !== "draft") {
      return res.status(400).json({ success: false, error: "לא ניתן לעדכן תלוש שכבר אושר" });
    }

    // עדכון שדות מותרים
    const allowedFields = [
      "overtime_hours", "overtime_125_amount", "overtime_150_amount",
      "travel_allowance", "phone_allowance", "bonus", "commission",
      "other_deductions", "vacation_days_used", "sick_days_used",
      "actual_work_days", "notes",
    ];

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: "לא נשלחו שדות לעדכון" });
    }

    values.push(id);
    await pool.query(
      `UPDATE payslips SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    // חישוב מחדש של הברוטו והנטו
    const slip = await pool.query(`SELECT * FROM payslips WHERE id = $1`, [id]);
    const s = slip.rows[0];

    const grossSalary =
      parseFloat(s.base_salary) +
      parseFloat(s.overtime_125_amount) +
      parseFloat(s.overtime_150_amount) +
      parseFloat(s.travel_allowance) +
      parseFloat(s.phone_allowance) +
      parseFloat(s.bonus) +
      parseFloat(s.commission);

    const incomeTax = calculateIncomeTax(grossSalary, parseFloat(s.tax_credit_points));
    const niEmployee = calculateNationalInsuranceEmployee(grossSalary);
    const healthTax = calculateHealthTax(grossSalary);
    const pensionableIncome = parseFloat(s.base_salary) + parseFloat(s.overtime_125_amount) + parseFloat(s.overtime_150_amount);
    const pensionEmployee = Math.round(pensionableIncome * 0.06 * 100) / 100;
    const pensionEmployer = Math.round(pensionableIncome * 0.065 * 100) / 100;
    const severanceDeposit = Math.round(parseFloat(s.base_salary) * 0.0833 * 100) / 100;
    const niEmployer = calculateNationalInsuranceEmployer(grossSalary);
    const netSalary = Math.round((grossSalary - incomeTax - niEmployee - healthTax - pensionEmployee - parseFloat(s.other_deductions)) * 100) / 100;
    const totalEmployerCost = Math.round((grossSalary + pensionEmployer + severanceDeposit + niEmployer) * 100) / 100;

    await pool.query(
      `UPDATE payslips SET gross_salary=$1, income_tax=$2, national_insurance_employee=$3,
       health_tax=$4, pension_employee=$5, pension_employer=$6, severance_deposit=$7,
       national_insurance_employer=$8, net_salary=$9, total_employer_cost=$10
       WHERE id = $11`,
      [grossSalary, incomeTax, niEmployee, healthTax, pensionEmployee, pensionEmployer, severanceDeposit, niEmployer, netSalary, totalEmployerCost, id]
    );

    const updated = await pool.query(`SELECT * FROM payslips WHERE id = $1`, [id]);
    res.json({ success: true, message: "תלוש עודכן וחושב מחדש", data: updated.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// אישור הרצת שכר
// ============================================================
router.post("/approve/:runId", async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;
    const { approved_by } = req.body;

    const run = await pool.query(`SELECT * FROM payroll_runs WHERE id = $1`, [runId]);
    if (run.rows.length === 0) {
      return res.status(404).json({ success: false, error: "הרצת שכר לא נמצאה" });
    }
    if (run.rows[0].status !== "draft") {
      return res.status(400).json({ success: false, error: "ניתן לאשר רק הרצות בסטטוס טיוטה" });
    }

    await pool.query(
      `UPDATE payroll_runs SET status = 'approved', approved_by = $1, approved_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [approved_by || "מנהל מערכת", runId]
    );

    const updated = await pool.query(`SELECT * FROM payroll_runs WHERE id = $1`, [runId]);
    res.json({ success: true, message: "הרצת השכר אושרה בהצלחה", data: updated.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// היסטוריית שכר לעובד
// ============================================================
router.get("/employee/:id/history", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT p.*, pr.period, pr.run_id, pr.status as run_status
       FROM payslips p
       JOIN payroll_runs pr ON p.payroll_run_id = pr.id
       WHERE p.employee_id = $1
       ORDER BY pr.period DESC`,
      [id]
    );

    // חישוב מגמות
    const history = result.rows;
    let avgGross = 0;
    let avgNet = 0;
    if (history.length > 0) {
      avgGross = history.reduce((sum: number, h: any) => sum + parseFloat(h.gross_salary), 0) / history.length;
      avgNet = history.reduce((sum: number, h: any) => sum + parseFloat(h.net_salary), 0) / history.length;
    }

    res.json({
      success: true,
      data: history,
      total: history.length,
      trends: {
        avg_gross: Math.round(avgGross * 100) / 100,
        avg_net: Math.round(avgNet * 100) / 100,
        months_count: history.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// סיכום שנתי לעובד - נתוני טופס 106
// ============================================================
router.get("/annual-summary/:employeeId/:year", async (req: Request, res: Response) => {
  try {
    const { employeeId, year } = req.params;

    const result = await pool.query(
      `SELECT p.*
       FROM payslips p
       JOIN payroll_runs pr ON p.payroll_run_id = pr.id
       WHERE p.employee_id = $1 AND pr.year = $2 AND pr.status = 'approved'
       ORDER BY pr.period`,
      [employeeId, year]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "לא נמצאו נתונים לעובד בשנה זו" });
    }

    // סיכום שנתי - נתוני 106
    const slips = result.rows;
    const annual = {
      employee_id: employeeId,
      employee_name: slips[0].employee_name,
      id_number: slips[0].id_number,
      year: parseInt(year),
      months_worked: slips.length,
      // הכנסות
      total_base_salary: 0,
      total_overtime: 0,
      total_travel: 0,
      total_phone: 0,
      total_bonus: 0,
      total_commission: 0,
      total_gross: 0,
      // ניכויים
      total_income_tax: 0,
      total_national_insurance_employee: 0,
      total_health_tax: 0,
      total_pension_employee: 0,
      total_other_deductions: 0,
      // הפרשות מעסיק
      total_pension_employer: 0,
      total_severance: 0,
      total_national_insurance_employer: 0,
      // נטו
      total_net: 0,
      total_employer_cost: 0,
      // ימי חופשה ומחלה
      total_vacation_days: 0,
      total_sick_days: 0,
    };

    for (const s of slips) {
      annual.total_base_salary += parseFloat(s.base_salary);
      annual.total_overtime += parseFloat(s.overtime_125_amount) + parseFloat(s.overtime_150_amount);
      annual.total_travel += parseFloat(s.travel_allowance);
      annual.total_phone += parseFloat(s.phone_allowance);
      annual.total_bonus += parseFloat(s.bonus);
      annual.total_commission += parseFloat(s.commission);
      annual.total_gross += parseFloat(s.gross_salary);
      annual.total_income_tax += parseFloat(s.income_tax);
      annual.total_national_insurance_employee += parseFloat(s.national_insurance_employee);
      annual.total_health_tax += parseFloat(s.health_tax);
      annual.total_pension_employee += parseFloat(s.pension_employee);
      annual.total_other_deductions += parseFloat(s.other_deductions);
      annual.total_pension_employer += parseFloat(s.pension_employer);
      annual.total_severance += parseFloat(s.severance_deposit);
      annual.total_national_insurance_employer += parseFloat(s.national_insurance_employer);
      annual.total_net += parseFloat(s.net_salary);
      annual.total_employer_cost += parseFloat(s.total_employer_cost);
      annual.total_vacation_days += parseFloat(s.vacation_days_used);
      annual.total_sick_days += parseFloat(s.sick_days_used);
    }

    // עיגול כל הערכים
    for (const key of Object.keys(annual)) {
      if (typeof (annual as any)[key] === "number" && key !== "year" && key !== "months_worked") {
        (annual as any)[key] = Math.round((annual as any)[key] * 100) / 100;
      }
    }

    res.json({ success: true, data: annual });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// עלות לפי מחלקה לחודש
// ============================================================
router.get("/department-cost/:month", async (req: Request, res: Response) => {
  try {
    const { month } = req.params; // פורמט: "2026-03"

    const result = await pool.query(
      `SELECT
         p.department,
         COUNT(*) as employee_count,
         SUM(p.gross_salary) as total_gross,
         SUM(p.net_salary) as total_net,
         SUM(p.total_employer_cost) as total_employer_cost,
         AVG(p.gross_salary) as avg_gross,
         AVG(p.net_salary) as avg_net,
         SUM(p.income_tax) as total_income_tax,
         SUM(p.pension_employee + p.pension_employer) as total_pension,
         SUM(p.severance_deposit) as total_severance
       FROM payslips p
       JOIN payroll_runs pr ON p.payroll_run_id = pr.id
       WHERE pr.period = $1
       GROUP BY p.department
       ORDER BY total_employer_cost DESC`,
      [month]
    );

    res.json({ success: true, data: result.rows, period: month });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// דשבורד שכר
// ============================================================
router.get("/dashboard", async (req: Request, res: Response) => {
  try {
    // הרצת שכר אחרונה
    const latestRun = await pool.query(
      `SELECT * FROM payroll_runs ORDER BY created_at DESC LIMIT 1`
    );

    // סיכום לפי מחלקה מההרצה האחרונה
    let departmentBreakdown: any[] = [];
    let avgSalary = 0;
    let employerCostBreakdown: any = {};

    if (latestRun.rows.length > 0) {
      const runId = latestRun.rows[0].id;

      const deptResult = await pool.query(
        `SELECT department, COUNT(*) as count,
                SUM(gross_salary) as total_gross,
                SUM(total_employer_cost) as total_cost,
                AVG(gross_salary) as avg_salary
         FROM payslips WHERE payroll_run_id = $1
         GROUP BY department ORDER BY total_cost DESC`,
        [runId]
      );
      departmentBreakdown = deptResult.rows;

      const avgResult = await pool.query(
        `SELECT AVG(gross_salary) as avg_gross, AVG(net_salary) as avg_net
         FROM payslips WHERE payroll_run_id = $1`,
        [runId]
      );
      avgSalary = parseFloat(avgResult.rows[0].avg_gross) || 0;

      // פירוט עלות מעסיק
      const costResult = await pool.query(
        `SELECT
           SUM(gross_salary) as total_gross,
           SUM(pension_employer) as total_pension_employer,
           SUM(severance_deposit) as total_severance,
           SUM(national_insurance_employer) as total_ni_employer
         FROM payslips WHERE payroll_run_id = $1`,
        [runId]
      );
      employerCostBreakdown = costResult.rows[0];
    }

    // כמות הרצות לפי סטטוס
    const statusCount = await pool.query(
      `SELECT status, COUNT(*) as count FROM payroll_runs GROUP BY status`
    );

    res.json({
      success: true,
      dashboard: {
        latest_payroll_run: latestRun.rows[0] || null,
        department_breakdown: departmentBreakdown,
        avg_salary: Math.round(avgSalary * 100) / 100,
        employer_cost_breakdown: employerCostBreakdown,
        runs_by_status: statusCount.rows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD מבני שכר - יצירה
// ============================================================
router.post("/salary-structures", async (req: Request, res: Response) => {
  try {
    const {
      employee_id, employee_name, base_salary, travel_allowance, phone_allowance,
      tax_credit_points, pension_rate_employee, pension_rate_employer, severance_rate,
      bank_name, bank_branch, bank_account, effective_from,
    } = req.body;

    const result = await pool.query(
      `INSERT INTO salary_structures (
        employee_id, employee_name, base_salary, travel_allowance, phone_allowance,
        tax_credit_points, pension_rate_employee, pension_rate_employer, severance_rate,
        bank_name, bank_branch, bank_account, effective_from
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        employee_id, employee_name, base_salary, travel_allowance || 0, phone_allowance || 0,
        tax_credit_points || 2.25, pension_rate_employee || 6.0, pension_rate_employer || 6.5, severance_rate || 8.33,
        bank_name, bank_branch, bank_account, effective_from || new Date(),
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD מבני שכר - שליפת הכל
// ============================================================
router.get("/salary-structures", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT * FROM salary_structures ORDER BY employee_id`
    );
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD מבני שכר - שליפת מבנה בודד
// ============================================================
router.get("/salary-structures/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM salary_structures WHERE id = $1`, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: "מבנה שכר לא נמצא" });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CRUD מבני שכר - עדכון
// ============================================================
router.put("/salary-structures/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const allowedFields = [
      "employee_name", "base_salary", "travel_allowance", "phone_allowance",
      "tax_credit_points", "pension_rate_employee", "pension_rate_employer", "severance_rate",
      "bank_name", "bank_branch", "bank_account", "effective_from", "status",
    ];

    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        setClauses.push(`${field} = $${paramIndex}`);
        values.push(updates[field]);
        paramIndex++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: "לא נשלחו שדות לעדכון" });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    await pool.query(
      `UPDATE salary_structures SET ${setClauses.join(", ")} WHERE id = $${paramIndex}`,
      values
    );

    const result = await pool.query(`SELECT * FROM salary_structures WHERE id = $1`, [id]);
    res.json({ success: true, data: result.rows[0] });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
