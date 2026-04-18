import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ─── Auto-create tables ───────────────────────────────────────────────────────
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payroll_runs (
      id SERIAL PRIMARY KEY,
      period VARCHAR(10) NOT NULL,
      run_date DATE DEFAULT CURRENT_DATE,
      total_gross NUMERIC(14,2) DEFAULT 0,
      total_deductions NUMERIC(14,2) DEFAULT 0,
      total_net NUMERIC(14,2) DEFAULT 0,
      total_employer_cost NUMERIC(14,2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','calculated','approved','paid')),
      approved_by VARCHAR(200),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payroll_entries (
      id SERIAL PRIMARY KEY,
      run_id INTEGER REFERENCES payroll_runs(id) ON DELETE CASCADE,
      employee_id INTEGER,
      employee_name VARCHAR(200),
      employee_type VARCHAR(30) DEFAULT 'salaried' CHECK (employee_type IN ('salaried','hourly','contractor_pct','contractor_meter')),
      base_salary NUMERIC(12,2) DEFAULT 0,
      hours_worked NUMERIC(8,2) DEFAULT 0,
      overtime_hours NUMERIC(8,2) DEFAULT 0,
      overtime_rate NUMERIC(4,2) DEFAULT 1.25,
      projects_count INTEGER DEFAULT 0,
      total_project_value NUMERIC(14,2) DEFAULT 0,
      commission_rate REAL DEFAULT 0,
      commission_amount NUMERIC(12,2) DEFAULT 0,
      bonus NUMERIC(12,2) DEFAULT 0,
      gross_pay NUMERIC(14,2) DEFAULT 0,
      income_tax NUMERIC(12,2) DEFAULT 0,
      social_security NUMERIC(12,2) DEFAULT 0,
      health_insurance NUMERIC(12,2) DEFAULT 0,
      pension_employee NUMERIC(12,2) DEFAULT 0,
      pension_employer NUMERIC(12,2) DEFAULT 0,
      severance_fund NUMERIC(12,2) DEFAULT 0,
      total_deductions NUMERIC(14,2) DEFAULT 0,
      net_pay NUMERIC(14,2) DEFAULT 0,
      employer_total_cost NUMERIC(14,2) DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS payroll_deductions (
      id SERIAL PRIMARY KEY,
      entry_id INTEGER REFERENCES payroll_entries(id) ON DELETE CASCADE,
      deduction_type VARCHAR(60) NOT NULL,
      amount NUMERIC(12,2) DEFAULT 0,
      is_employer BOOLEAN DEFAULT false,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS contractor_payments (
      id SERIAL PRIMARY KEY,
      run_id INTEGER REFERENCES payroll_runs(id) ON DELETE CASCADE,
      contractor_id INTEGER,
      contractor_name VARCHAR(200),
      payment_model VARCHAR(20) DEFAULT 'percentage' CHECK (payment_model IN ('percentage','per_meter','fixed')),
      projects JSONB DEFAULT '[]',
      total_amount NUMERIC(14,2) DEFAULT 0,
      vat_amount NUMERIC(12,2) DEFAULT 0,
      total_with_vat NUMERIC(14,2) DEFAULT 0,
      invoice_number VARCHAR(60),
      status VARCHAR(20) DEFAULT 'calculated' CHECK (status IN ('calculated','invoiced','paid')),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
}

let tablesReady = false;
async function init() {
  if (!tablesReady) { await ensureTables(); tablesReady = true; }
}

// ─── Israeli payroll calculation helpers ──────────────────────────────────────
// 2024/2025 Israeli tax brackets (monthly, ILS)
function calcIncomeTax(annualGross: number): number {
  const brackets = [
    { limit: 84120, rate: 0.10 },
    { limit: 120720, rate: 0.14 },
    { limit: 193800, rate: 0.20 },
    { limit: 269280, rate: 0.31 },
    { limit: 560280, rate: 0.35 },
    { limit: 721560, rate: 0.47 },
    { limit: Infinity, rate: 0.50 },
  ];
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (annualGross <= prev) break;
    const taxable = Math.min(annualGross, b.limit) - prev;
    tax += taxable * b.rate;
    prev = b.limit;
  }
  // Standard credit points: 2.25 points * 235 = 528.75/month
  const monthlyCredit = 2.25 * 235;
  return Math.max(0, tax / 12 - monthlyCredit);
}

function calcSocialSecurity(grossMonthly: number): { employee: number; employer: number } {
  // Up to 60% of avg wage (7,122): 3.5% employee, 3.55% employer
  // Above 60% up to max: 12% employee, 7.6% employer
  const low = 7122;
  const max = 49030;
  const capped = Math.min(grossMonthly, max);
  let empEe = 0, empEr = 0;
  if (capped <= low) {
    empEe = capped * 0.035;
    empEr = capped * 0.0355;
  } else {
    empEe = low * 0.035 + (capped - low) * 0.12;
    empEr = low * 0.0355 + (capped - low) * 0.076;
  }
  return { employee: Math.round(empEe * 100) / 100, employer: Math.round(empEr * 100) / 100 };
}

function calcHealthInsurance(grossMonthly: number): number {
  const low = 7122;
  const max = 49030;
  const capped = Math.min(grossMonthly, max);
  if (capped <= low) return Math.round(capped * 0.031 * 100) / 100;
  return Math.round((low * 0.031 + (capped - low) * 0.05) * 100) / 100;
}

function calcPayrollEntry(entry: any) {
  const base = parseFloat(entry.base_salary) || 0;
  const otHours = parseFloat(entry.overtime_hours) || 0;
  const otRate = parseFloat(entry.overtime_rate) || 1.25;
  const bonus = parseFloat(entry.bonus) || 0;
  const commRate = parseFloat(entry.commission_rate) || 0;
  const projValue = parseFloat(entry.total_project_value) || 0;
  const hoursWorked = parseFloat(entry.hours_worked) || 0;

  let grossPay = 0;
  const empType = entry.employee_type || "salaried";

  if (empType === "salaried") {
    const hourlyRate = base / 186; // standard monthly hours in Israel
    const overtimePay = otHours * hourlyRate * otRate;
    const commission = projValue * (commRate / 100);
    grossPay = base + overtimePay + bonus + commission;
  } else if (empType === "hourly") {
    const hourlyRate = base; // base is hourly rate
    const regularPay = hoursWorked * hourlyRate;
    const overtimePay = otHours * hourlyRate * otRate;
    grossPay = regularPay + overtimePay + bonus;
  } else {
    grossPay = base + bonus;
  }

  const annualGross = grossPay * 12;
  const incomeTax = calcIncomeTax(annualGross);
  const ss = calcSocialSecurity(grossPay);
  const health = calcHealthInsurance(grossPay);
  const pensionEmployee = Math.round(grossPay * 0.06 * 100) / 100;
  const pensionEmployer = Math.round(grossPay * 0.065 * 100) / 100;
  const severanceFund = Math.round(grossPay * 0.0833 * 100) / 100;

  const totalDeductions = Math.round((incomeTax + ss.employee + health + pensionEmployee) * 100) / 100;
  const netPay = Math.round((grossPay - totalDeductions) * 100) / 100;
  const employerCost = Math.round((grossPay + ss.employer + pensionEmployer + severanceFund) * 100) / 100;

  return {
    gross_pay: Math.round(grossPay * 100) / 100,
    income_tax: Math.round(incomeTax * 100) / 100,
    social_security: ss.employee,
    health_insurance: health,
    pension_employee: pensionEmployee,
    pension_employer: pensionEmployer,
    severance_fund: severanceFund,
    total_deductions: totalDeductions,
    net_pay: netPay,
    employer_total_cost: employerCost,
    commission_amount: empType === "salaried" ? Math.round(projValue * (commRate / 100) * 100) / 100 : 0,
  };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// Create payroll run
router.post("/payroll/runs", async (req, res) => {
  try {
    await init();
    const { period, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO payroll_runs (period, notes) VALUES ($1, $2) RETURNING *`,
      [period || new Date().toISOString().slice(0, 7), notes || null]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// List payroll runs
router.get("/payroll/runs", async (_req, res) => {
  try {
    await init();
    const result = await pool.query(`SELECT * FROM payroll_runs ORDER BY created_at DESC`);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Get single run with entries
router.get("/payroll/runs/:id", async (req, res) => {
  try {
    await init();
    const { id } = req.params;
    const run = await pool.query(`SELECT * FROM payroll_runs WHERE id = $1`, [id]);
    if (run.rows.length === 0) return res.status(404).json({ message: "Run not found" });
    const entries = await pool.query(`SELECT * FROM payroll_entries WHERE run_id = $1 ORDER BY employee_name`, [id]);
    res.json({ ...run.rows[0], entries: entries.rows });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Add entry to run
router.post("/payroll/runs/:id/entries", async (req, res) => {
  try {
    await init();
    const { id } = req.params;
    const b = req.body;
    const result = await pool.query(
      `INSERT INTO payroll_entries (run_id, employee_id, employee_name, employee_type, base_salary, hours_worked, overtime_hours, overtime_rate, projects_count, total_project_value, commission_rate, bonus)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [id, b.employee_id, b.employee_name, b.employee_type || "salaried", b.base_salary || 0, b.hours_worked || 0, b.overtime_hours || 0, b.overtime_rate || 1.25, b.projects_count || 0, b.total_project_value || 0, b.commission_rate || 0, b.bonus || 0]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Get entries for run
router.get("/payroll/runs/:id/entries", async (req, res) => {
  try {
    await init();
    const entries = await pool.query(`SELECT * FROM payroll_entries WHERE run_id = $1 ORDER BY employee_name`, [req.params.id]);
    res.json(entries.rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Calculate all entries in a run (Israeli payroll)
router.post("/payroll/runs/:id/calculate", async (req, res) => {
  try {
    await init();
    const { id } = req.params;
    const entries = await pool.query(`SELECT * FROM payroll_entries WHERE run_id = $1`, [id]);

    let totalGross = 0, totalDed = 0, totalNet = 0, totalEmployerCost = 0;

    for (const entry of entries.rows) {
      const calc = calcPayrollEntry(entry);
      await pool.query(
        `UPDATE payroll_entries SET gross_pay=$1, income_tax=$2, social_security=$3, health_insurance=$4, pension_employee=$5, pension_employer=$6, severance_fund=$7, total_deductions=$8, net_pay=$9, employer_total_cost=$10, commission_amount=$11 WHERE id=$12`,
        [calc.gross_pay, calc.income_tax, calc.social_security, calc.health_insurance, calc.pension_employee, calc.pension_employer, calc.severance_fund, calc.total_deductions, calc.net_pay, calc.employer_total_cost, calc.commission_amount, entry.id]
      );
      totalGross += calc.gross_pay;
      totalDed += calc.total_deductions;
      totalNet += calc.net_pay;
      totalEmployerCost += calc.employer_total_cost;
    }

    await pool.query(
      `UPDATE payroll_runs SET total_gross=$1, total_deductions=$2, total_net=$3, total_employer_cost=$4, status='calculated', updated_at=NOW() WHERE id=$5`,
      [totalGross.toFixed(2), totalDed.toFixed(2), totalNet.toFixed(2), totalEmployerCost.toFixed(2), id]
    );

    const updated = await pool.query(`SELECT * FROM payroll_runs WHERE id = $1`, [id]);
    const updatedEntries = await pool.query(`SELECT * FROM payroll_entries WHERE run_id = $1 ORDER BY employee_name`, [id]);
    res.json({ ...updated.rows[0], entries: updatedEntries.rows });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Approve run
router.post("/payroll/runs/:id/approve", async (req, res) => {
  try {
    await init();
    const { id } = req.params;
    const { approved_by } = req.body;
    await pool.query(
      `UPDATE payroll_runs SET status='approved', approved_by=$1, updated_at=NOW() WHERE id=$2`,
      [approved_by || "System", id]
    );
    const result = await pool.query(`SELECT * FROM payroll_runs WHERE id = $1`, [id]);
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Delete entry
router.delete("/payroll/entries/:id", async (req, res) => {
  try {
    await init();
    await pool.query(`DELETE FROM payroll_entries WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// ─── Contractor payments ──────────────────────────────────────────────────────

router.get("/payroll/contractors/:runId", async (req, res) => {
  try {
    await init();
    const result = await pool.query(`SELECT * FROM contractor_payments WHERE run_id = $1 ORDER BY contractor_name`, [req.params.runId]);
    res.json(result.rows);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

router.post("/payroll/contractor-payment", async (req, res) => {
  try {
    await init();
    const b = req.body;
    const projects = b.projects || [];
    let totalAmount = 0;

    for (const p of projects) {
      if (b.payment_model === "percentage") {
        p.amount = (parseFloat(p.value) || 0) * ((parseFloat(p.rate) || 0) / 100);
      } else if (b.payment_model === "per_meter") {
        p.amount = (parseFloat(p.meters) || 0) * (parseFloat(p.rate) || 0);
      } else {
        p.amount = parseFloat(p.amount) || 0;
      }
      totalAmount += p.amount;
    }

    const vatRate = 0.18; // Israeli VAT — 18% effective 2026-01-01 (was 17%)
    const vatAmount = Math.round(totalAmount * vatRate * 100) / 100;
    const totalWithVat = Math.round((totalAmount + vatAmount) * 100) / 100;

    const result = await pool.query(
      `INSERT INTO contractor_payments (run_id, contractor_id, contractor_name, payment_model, projects, total_amount, vat_amount, total_with_vat, invoice_number, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.run_id, b.contractor_id, b.contractor_name, b.payment_model || "percentage", JSON.stringify(projects), totalAmount.toFixed(2), vatAmount, totalWithVat, b.invoice_number, "calculated"]
    );
    res.json(result.rows[0]);
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

// Dashboard summary
router.get("/payroll/dashboard", async (_req, res) => {
  try {
    await init();
    const runs = await pool.query(`SELECT * FROM payroll_runs ORDER BY created_at DESC LIMIT 12`);
    const latestRun = runs.rows[0];
    let latestEntries: any[] = [];
    if (latestRun) {
      const e = await pool.query(`SELECT * FROM payroll_entries WHERE run_id = $1 ORDER BY employee_name`, [latestRun.id]);
      latestEntries = e.rows;
    }
    const totalEmployees = latestEntries.length;
    const avgSalary = totalEmployees > 0 ? latestEntries.reduce((s, e) => s + parseFloat(e.gross_pay || "0"), 0) / totalEmployees : 0;
    const totalContractors = latestRun ? (await pool.query(`SELECT COUNT(*) as cnt FROM contractor_payments WHERE run_id = $1`, [latestRun.id])).rows[0]?.cnt || 0 : 0;

    res.json({
      latestRun,
      runs: runs.rows,
      totalEmployees,
      avgSalary: Math.round(avgSalary),
      totalContractors: parseInt(totalContractors),
      totalGross: latestRun ? parseFloat(latestRun.total_gross) : 0,
      totalNet: latestRun ? parseFloat(latestRun.total_net) : 0,
      totalEmployerCost: latestRun ? parseFloat(latestRun.total_employer_cost) : 0,
    });
  } catch (e: any) { res.status(500).json({ message: e.message }); }
});

export default router;
