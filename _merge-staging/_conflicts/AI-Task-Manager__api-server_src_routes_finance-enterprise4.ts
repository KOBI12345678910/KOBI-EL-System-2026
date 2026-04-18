import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}
router.use(requireAuth as any);

async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("Finance4 query error:", e.message); return []; }
}
async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

// ========== GENERAL LEDGER ==========
router.get("/general-ledger", async (req, res) => {
  const { account, period, fiscal_year, from_date, to_date, limit = "500", offset = "0" } = req.query;
  let where = "WHERE 1=1";
  if (account) where += ` AND (account_number='${String(account).replace(/'/g,"''")}' OR account_name ILIKE '%${String(account).replace(/'/g,"''")}%')`;
  if (period) where += ` AND fiscal_period=${parseInt(String(period))}`;
  if (fiscal_year) where += ` AND fiscal_year=${parseInt(String(fiscal_year)) || new Date().getFullYear()}`;
  if (from_date) where += ` AND entry_date >= '${String(from_date).replace(/'/g,"''")}'`;
  if (to_date) where += ` AND entry_date <= '${String(to_date).replace(/'/g,"''")}'`;
  const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 500, 1), 2000);
  const safeOffset = Math.max(parseInt(String(offset)) || 0, 0);
  const rows = await q(`SELECT * FROM general_ledger ${where} ORDER BY entry_date ASC, id ASC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM general_ledger ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/general-ledger/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COALESCE(SUM(debit_amount), 0) as total_debit,
    COALESCE(SUM(credit_amount), 0) as total_credit,
    COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as net_balance,
    COUNT(DISTINCT account_number) as accounts_used,
    COUNT(DISTINCT fiscal_period) as periods,
    COUNT(*) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)) as month_entries,
    COALESCE(SUM(debit_amount) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as month_debit,
    COALESCE(SUM(credit_amount) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as month_credit,
    COUNT(*) FILTER (WHERE reconciled = false) as unreconciled
  FROM general_ledger WHERE status='posted'`);
  res.json(rows[0] || {});
});

router.get("/general-ledger/by-account", async (req, res) => {
  const { fiscal_year } = req.query;
  const yearFilter = fiscal_year ? `AND fiscal_year=${parseInt(String(fiscal_year))}` : '';
  const rows = await q(`SELECT
    account_number, account_name, account_type,
    COUNT(*) as entry_count,
    COALESCE(SUM(debit_amount), 0) as total_debit,
    COALESCE(SUM(credit_amount), 0) as total_credit,
    COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as balance,
    MIN(entry_date) as first_entry,
    MAX(entry_date) as last_entry
  FROM general_ledger WHERE status='posted' ${yearFilter}
  GROUP BY account_number, account_name, account_type
  ORDER BY account_number ASC`);
  res.json(rows);
});

router.get("/general-ledger/by-period", async (req, res) => {
  const { fiscal_year } = req.query;
  const yearFilter = fiscal_year ? `AND fiscal_year=${parseInt(String(fiscal_year))}` : '';
  const rows = await q(`SELECT
    fiscal_year, fiscal_period,
    COUNT(*) as entry_count,
    COALESCE(SUM(debit_amount), 0) as total_debit,
    COALESCE(SUM(credit_amount), 0) as total_credit,
    COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as net
  FROM general_ledger WHERE status='posted' ${yearFilter}
  GROUP BY fiscal_year, fiscal_period
  ORDER BY fiscal_year DESC, fiscal_period DESC`);
  res.json(rows);
});

router.post("/general-ledger", async (req, res) => {
  const d = req.body;
  const num = await nextNum("GL-", "general_ledger", "entry_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO general_ledger (entry_number, account_id, account_number, account_name, account_type, entry_date, fiscal_year, fiscal_period, description, reference, source_type, source_document, journal_entry_id, debit_amount, credit_amount, balance, currency, exchange_rate, amount_ils, cost_center, department, project_name, notes, posted_by, posted_by_name, status)
    VALUES ('${num}', ${d.accountId||'NULL'}, ${s(d.accountNumber)}, ${s(d.accountName)}, ${s(d.accountType)}, '${d.entryDate || new Date().toISOString().slice(0,10)}', ${d.fiscalYear || new Date().getFullYear()}, ${d.fiscalPeriod || new Date().getMonth()+1}, ${s(d.description)}, ${s(d.reference)}, ${s(d.sourceType)}, ${s(d.sourceDocument)}, ${d.journalEntryId||'NULL'}, ${d.debit||0}, ${d.credit||0}, ${(d.debit||0)-(d.credit||0)}, '${d.currency||'ILS'}', ${d.exchangeRate||1}, ${((d.debit||0)-(d.credit||0))*(d.exchangeRate||1)}, ${s(d.costCenter)}, ${s(d.department)}, ${s(d.projectName)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)}, '${d.status||'posted'}')`);
  const rows = await q(`SELECT * FROM general_ledger WHERE entry_number='${num}'`);
  res.json(rows[0]);
});

router.put("/general-ledger/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.accountNumber) sets.push(`account_number=${s(d.accountNumber)}`);
  if (d.accountName) sets.push(`account_name=${s(d.accountName)}`);
  if (d.entryDate) sets.push(`entry_date='${d.entryDate}'`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.reference !== undefined) sets.push(`reference=${s(d.reference)}`);
  if (d.debit !== undefined) sets.push(`debit_amount=${Number(d.debit) || 0}`);
  if (d.credit !== undefined) sets.push(`credit_amount=${Number(d.credit) || 0}`);
  if (d.costCenter !== undefined) sets.push(`cost_center=${s(d.costCenter)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.projectName !== undefined) sets.push(`project_name=${s(d.projectName)}`);
  if (d.reconciled !== undefined) { sets.push(`reconciled=${!!d.reconciled}`); if (d.reconciled) sets.push(`reconciliation_date=CURRENT_DATE`); }
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE general_ledger SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM general_ledger WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/general-ledger/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  await q(`DELETE FROM general_ledger WHERE id=${id}`);
  res.json({ success: true });
});

// ========== EXPENSE REPORTS ==========
router.get("/expense-reports", async (_req, res) => {
  const rows = await q(`SELECT * FROM expense_reports ORDER BY submit_date DESC, id DESC`);
  res.json(rows);
});

router.get("/expense-reports/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='submitted') as submitted,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='rejected') as rejected,
    COUNT(*) FILTER (WHERE status='reimbursed') as reimbursed,
    COALESCE(SUM(total_amount), 0) as total_amount,
    COALESCE(SUM(approved_amount), 0) as total_approved,
    COALESCE(SUM(reimbursed_amount), 0) as total_reimbursed,
    COALESCE(SUM(total_amount) FILTER (WHERE status='submitted'), 0) as pending_amount,
    COALESCE(SUM(total_amount) FILTER (WHERE status='approved'), 0) as awaiting_reimbursement,
    COUNT(DISTINCT employee_name) as employees
  FROM expense_reports WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/expense-reports", async (req, res) => {
  const d = req.body;
  const num = await nextNum("ER-", "expense_reports", "report_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO expense_reports (report_number, employee_name, employee_id, department, submit_date, period_start, period_end, total_amount, currency, status, purpose, project_name, cost_center, notes, created_by, created_by_name)
    VALUES ('${num}', ${s(d.employeeName)}, ${d.employeeId||'NULL'}, ${s(d.department)}, '${d.submitDate || new Date().toISOString().slice(0,10)}', ${d.periodStart ? `'${d.periodStart}'` : 'NULL'}, ${d.periodEnd ? `'${d.periodEnd}'` : 'NULL'}, ${d.totalAmount||0}, '${d.currency||'ILS'}', '${d.status||'draft'}', ${s(d.purpose)}, ${s(d.projectName)}, ${s(d.costCenter)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  const rows = await q(`SELECT * FROM expense_reports WHERE report_number='${num}'`);
  res.json(rows[0]);
});

router.put("/expense-reports/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.employeeName) sets.push(`employee_name=${s(d.employeeName)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.submitDate) sets.push(`submit_date='${d.submitDate}'`);
  if (d.periodStart) sets.push(`period_start='${d.periodStart}'`);
  if (d.periodEnd) sets.push(`period_end='${d.periodEnd}'`);
  if (d.totalAmount !== undefined) sets.push(`total_amount=${d.totalAmount}`);
  if (d.approvedAmount !== undefined) sets.push(`approved_amount=${d.approvedAmount}`);
  if (d.purpose !== undefined) sets.push(`purpose=${s(d.purpose)}`);
  if (d.projectName !== undefined) sets.push(`project_name=${s(d.projectName)}`);
  if (d.costCenter !== undefined) sets.push(`cost_center=${s(d.costCenter)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.rejectedReason !== undefined) sets.push(`rejected_reason=${s(d.rejectedReason)}`);
  if (d.status) {
    sets.push(`status='${d.status}'`);
    const user = (req as any).user;
    if (d.status === 'approved') {
      sets.push(`approver_name=${s(user?.fullName)}`);
      sets.push(`approver_id=${user?.id||'NULL'}`);
      sets.push(`approved_at=NOW()`);
      if (d.approvedAmount === undefined) sets.push(`approved_amount=total_amount`);
    }
    if (d.status === 'reimbursed') {
      sets.push(`reimbursement_date=CURRENT_DATE`);
      sets.push(`reimbursed_amount=COALESCE(approved_amount, total_amount)`);
    }
  }
  if (d.reimbursementMethod) sets.push(`reimbursement_method=${s(d.reimbursementMethod)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE expense_reports SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM expense_reports WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/expense-reports/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  await q(`DELETE FROM expense_reports WHERE id=${id} AND status IN ('draft','rejected')`);
  res.json({ success: true });
});

router.post("/expense-reports/:id/submit", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  await q(`UPDATE expense_reports SET status='submitted', submit_date=CURRENT_DATE, updated_at=NOW() WHERE id=${id} AND status='draft'`);
  const rows = await q(`SELECT * FROM expense_reports WHERE id=${id}`);
  res.json(rows[0]);
});

router.post("/expense-reports/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const user = (req as any).user;
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const approvedAmt = d.approvedAmount ? Number(d.approvedAmount) || 0 : null;
  await q(`UPDATE expense_reports SET status='approved', approver_name=${s(user?.fullName)}, approver_id=${user?.id ? parseInt(user.id) : 'NULL'}, approved_at=NOW(), approved_amount=COALESCE(${approvedAmt !== null ? approvedAmt : 'NULL'}, total_amount), updated_at=NOW() WHERE id=${id} AND status='submitted'`);
  const rows = await q(`SELECT * FROM expense_reports WHERE id=${id}`);
  res.json(rows[0]);
});

router.post("/expense-reports/:id/reject", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`UPDATE expense_reports SET status='rejected', rejected_reason=${s(d.reason)}, updated_at=NOW() WHERE id=${id} AND status='submitted'`);
  const rows = await q(`SELECT * FROM expense_reports WHERE id=${id}`);
  res.json(rows[0]);
});

// ========== EXPENSE REPORT LINES ==========
router.get("/expense-reports/:id/lines", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  res.json(await q(`SELECT * FROM expense_report_lines WHERE expense_report_id=${id} ORDER BY line_number ASC`));
});

router.post("/expense-reports/:id/lines", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const lines = Array.isArray(d) ? d : [d];
  for (const line of lines) {
    const amt = Number(line.amount) || 0;
    const exRate = Number(line.exchangeRate) || 1;
    const amtIls = amt * exRate;
    await q(`INSERT INTO expense_report_lines (expense_report_id, line_number, expense_date, category, description, amount, currency, exchange_rate, amount_ils, vat_amount, net_amount, receipt_number, receipt_url, vendor_name, payment_method, is_billable, project_name, cost_center, gl_account, tax_deductible, notes)
      VALUES (${id}, ${parseInt(line.lineNumber) || 1}, '${line.expenseDate || new Date().toISOString().slice(0,10)}', ${s(line.category)}, ${s(line.description)}, ${amt}, '${line.currency||'ILS'}', ${exRate}, ${amtIls}, ${Number(line.vatAmount) || 0}, ${Number(line.netAmount) || amt}, ${s(line.receiptNumber)}, ${s(line.receiptUrl)}, ${s(line.vendorName)}, ${s(line.paymentMethod)}, ${!!line.isBillable}, ${s(line.projectName)}, ${s(line.costCenter)}, ${s(line.glAccount)}, ${line.taxDeductible !== false}, ${s(line.notes)})`);
  }
  const allLines = await q(`SELECT * FROM expense_report_lines WHERE expense_report_id=${id} ORDER BY line_number ASC`);
  const total = allLines.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
  await q(`UPDATE expense_reports SET total_amount=${total}, lines_count=${allLines.length}, updated_at=NOW() WHERE id=${id}`);
  res.json(allLines);
});

router.delete("/expense-report-lines/:lineId", async (req, res) => {
  const lineId = parseInt(req.params.lineId);
  if (isNaN(lineId)) { res.status(400).json({ error: "מזהה לא תקין" }); return; }
  const line = await q(`SELECT expense_report_id FROM expense_report_lines WHERE id=${lineId}`);
  await q(`DELETE FROM expense_report_lines WHERE id=${lineId}`);
  if (line[0]) {
    const reportId = (line[0] as any).expense_report_id;
    const allLines = await q(`SELECT * FROM expense_report_lines WHERE expense_report_id=${reportId}`);
    const total = allLines.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
    await q(`UPDATE expense_reports SET total_amount=${total}, lines_count=${allLines.length}, updated_at=NOW() WHERE id=${reportId}`);
  }
  res.json({ success: true });
});

// ========== FIXED ASSETS (Finance-specific routes) ==========
router.get("/finance/fixed-assets", async (_req, res) => {
  const rows = await q(`SELECT * FROM fixed_assets ORDER BY asset_number ASC`);
  res.json(rows);
});

router.get("/finance/fixed-assets/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COUNT(*) FILTER (WHERE status='disposed') as disposed,
    COUNT(*) FILTER (WHERE status='maintenance') as in_maintenance,
    COALESCE(SUM(purchase_cost), 0) as total_cost,
    COALESCE(SUM(accumulated_depreciation), 0) as total_depreciation,
    COALESCE(SUM(purchase_cost) - SUM(accumulated_depreciation), 0) as total_book_value,
    COALESCE(SUM(salvage_value), 0) as total_salvage,
    COALESCE(SUM(annual_depreciation), 0) as annual_depreciation,
    COUNT(DISTINCT category) as categories,
    COUNT(DISTINCT location) as locations,
    COUNT(DISTINCT department) as departments
  FROM fixed_assets`);
  res.json(rows[0] || {});
});

router.get("/finance/fixed-assets/by-category", async (_req, res) => {
  const rows = await q(`SELECT
    category,
    COUNT(*) as count,
    COALESCE(SUM(purchase_cost), 0) as total_cost,
    COALESCE(SUM(accumulated_depreciation), 0) as total_depreciation,
    COALESCE(SUM(purchase_cost) - SUM(accumulated_depreciation), 0) as book_value,
    COALESCE(SUM(annual_depreciation), 0) as annual_depreciation
  FROM fixed_assets WHERE status='active'
  GROUP BY category ORDER BY total_cost DESC`);
  res.json(rows);
});

router.get("/finance/fixed-assets/depreciation-schedule", async (_req, res) => {
  const rows = await q(`SELECT
    id, asset_number, asset_name, category, purchase_date, purchase_cost,
    useful_life_years, depreciation_method, annual_depreciation,
    accumulated_depreciation, salvage_value,
    purchase_cost - accumulated_depreciation as book_value,
    CASE WHEN useful_life_years > 0
      THEN ROUND((accumulated_depreciation / NULLIF(purchase_cost - salvage_value, 0) * 100)::numeric, 1)
      ELSE 0 END as depreciation_pct,
    CASE WHEN useful_life_years > 0 AND annual_depreciation > 0
      THEN ROUND(((purchase_cost - accumulated_depreciation - salvage_value) / NULLIF(annual_depreciation, 0))::numeric, 1)
      ELSE 0 END as remaining_years
  FROM fixed_assets WHERE status='active' AND depreciation_method IS NOT NULL
  ORDER BY book_value DESC`);
  res.json(rows);
});

router.post("/finance/fixed-assets/calculate-depreciation", async (req, res) => {
  const assets = await q(`SELECT id, purchase_cost, salvage_value, useful_life_years, depreciation_method, accumulated_depreciation, annual_depreciation FROM fixed_assets WHERE status='active' AND useful_life_years > 0`);
  let updated = 0;
  for (const asset of assets as any[]) {
    const cost = Number(asset.purchase_cost || 0);
    const salvage = Number(asset.salvage_value || 0);
    const life = Number(asset.useful_life_years || 1);
    const depreciable = cost - salvage;
    let annualDep = 0;
    if (asset.depreciation_method === 'declining_balance') {
      const rate = 2 / life;
      const bookValue = cost - Number(asset.accumulated_depreciation || 0);
      annualDep = Math.max(bookValue * rate, 0);
    } else {
      annualDep = depreciable / life;
    }
    const monthlyDep = annualDep / 12;
    const newAccum = Math.min(Number(asset.accumulated_depreciation || 0) + monthlyDep, depreciable);
    await q(`UPDATE fixed_assets SET annual_depreciation=${annualDep.toFixed(2)}, accumulated_depreciation=${newAccum.toFixed(2)}, updated_at=NOW() WHERE id=${asset.id}`);
    updated++;
  }
  res.json({ success: true, updated });
});

// ========== FINANCIAL REPORTS ==========
router.get("/financial-reports/trial-balance", async (req, res) => {
  const { fiscal_year, period } = req.query;
  let where = "WHERE status='active'";
  const year = fiscal_year ? parseInt(String(fiscal_year)) : new Date().getFullYear();

  const accounts = await q(`SELECT
    ca.account_number, ca.account_name,
    ca.account_type, ca.account_subtype, ca.normal_balance,
    ca.opening_balance,
    COALESCE(ca.debit_total, 0) as debit_total,
    COALESCE(ca.credit_total, 0) as credit_total,
    COALESCE(ca.current_balance, 0) as current_balance,
    COALESCE(gl.period_debit, 0) as period_debit,
    COALESCE(gl.period_credit, 0) as period_credit
  FROM chart_of_accounts ca
  LEFT JOIN (
    SELECT account_number,
      SUM(debit_amount) as period_debit,
      SUM(credit_amount) as period_credit
    FROM general_ledger
    WHERE fiscal_year=${year} ${period ? `AND fiscal_period=${parseInt(String(period))}` : ''} AND status='posted'
    GROUP BY account_number
  ) gl ON gl.account_number = ca.account_number
  ${where}
  ORDER BY ca.account_number ASC`);

  const totalDebit = accounts.reduce((s: number, a: any) => s + Number(a.period_debit || a.debit_total || 0), 0);
  const totalCredit = accounts.reduce((s: number, a: any) => s + Number(a.period_credit || a.credit_total || 0), 0);

  res.json({
    accounts,
    summary: { totalDebit, totalCredit, difference: totalDebit - totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 },
    period: { fiscal_year: year, period: period || 'all' }
  });
});

router.get("/financial-reports/profit-loss", async (req, res) => {
  const { fiscal_year, period_from, period_to } = req.query;
  const year = fiscal_year ? parseInt(String(fiscal_year)) : new Date().getFullYear();
  const pFrom = period_from ? parseInt(String(period_from)) : 1;
  const pTo = period_to ? parseInt(String(period_to)) : 12;

  const revenues = await q(`SELECT
    ca.account_number, ca.account_name, ca.account_subtype,
    COALESCE(SUM(gl.credit_amount) - SUM(gl.debit_amount), ca.current_balance) as amount
  FROM chart_of_accounts ca
  LEFT JOIN general_ledger gl ON gl.account_number = ca.account_number AND gl.fiscal_year=${year} AND gl.fiscal_period BETWEEN ${pFrom} AND ${pTo} AND gl.status='posted'
  WHERE ca.account_type='revenue' AND ca.status='active'
  GROUP BY ca.account_number, ca.account_name, ca.account_subtype, ca.current_balance
  ORDER BY ca.account_number`);

  const expenses = await q(`SELECT
    ca.account_number, ca.account_name, ca.account_subtype,
    COALESCE(SUM(gl.debit_amount) - SUM(gl.credit_amount), ca.current_balance) as amount
  FROM chart_of_accounts ca
  LEFT JOIN general_ledger gl ON gl.account_number = ca.account_number AND gl.fiscal_year=${year} AND gl.fiscal_period BETWEEN ${pFrom} AND ${pTo} AND gl.status='posted'
  WHERE ca.account_type='expense' AND ca.status='active'
  GROUP BY ca.account_number, ca.account_name, ca.account_subtype, ca.current_balance
  ORDER BY ca.account_number`);

  const totalRevenue = revenues.reduce((s: number, r: any) => s + Math.abs(Number(r.amount || 0)), 0);
  const totalExpenses = expenses.reduce((s: number, e: any) => s + Math.abs(Number(e.amount || 0)), 0);

  res.json({
    revenues, expenses,
    summary: { totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses, margin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue * 100) : 0 },
    period: { fiscal_year: year, period_from: pFrom, period_to: pTo }
  });
});

router.get("/financial-reports/profit-loss/monthly", async (req, res) => {
  const yearsParam = req.query.years ? String(req.query.years) : String(new Date().getFullYear());
  const years = yearsParam.split(",").map(y => parseInt(y.trim())).filter(y => y > 2000 && y < 2100);
  if (years.length === 0) return res.status(400).json({ error: "Invalid years" });

  const result: Record<number, { months: any[] }> = {};

  for (const year of years) {
    const monthlyData = [];
    for (let month = 1; month <= 12; month++) {
      const revRows = await q(`SELECT COALESCE(SUM(gl.credit_amount) - SUM(gl.debit_amount), 0) as total
        FROM general_ledger gl
        JOIN chart_of_accounts ca ON ca.account_number = gl.account_number
        WHERE ca.account_type='revenue' AND ca.status='active'
          AND gl.fiscal_year=${year} AND gl.fiscal_period=${month} AND gl.status='posted'`);
      const expRows = await q(`SELECT COALESCE(SUM(gl.debit_amount) - SUM(gl.credit_amount), 0) as total
        FROM general_ledger gl
        JOIN chart_of_accounts ca ON ca.account_number = gl.account_number
        WHERE ca.account_type='expense' AND ca.status='active'
          AND gl.fiscal_year=${year} AND gl.fiscal_period=${month} AND gl.status='posted'`);

      const revenue = Math.abs(Number(revRows[0]?.total || 0));
      const expenses = Math.abs(Number(expRows[0]?.total || 0));
      monthlyData.push({
        month,
        monthName: ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"][month - 1],
        revenue,
        expenses,
        netIncome: revenue - expenses,
        margin: revenue > 0 ? ((revenue - expenses) / revenue * 100) : 0,
      });
    }

    const totalRevenue = monthlyData.reduce((s, m) => s + m.revenue, 0);
    const totalExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0);

    result[year] = {
      months: monthlyData,
    };
  }

  res.json({ years: result });
});

router.get("/financial-reports/balance-sheet", async (req, res) => {
  const { fiscal_year, compare_year } = req.query;
  const year = fiscal_year ? parseInt(String(fiscal_year)) : new Date().getFullYear();
  const cmpYear = compare_year ? parseInt(String(compare_year)) : null;

  async function getBalancesForYear(y: number) {
    const endDate = `${y}-12-31`;
    const rows = await q(`
      SELECT
        ca.account_number,
        ca.account_name,
        ca.account_type,
        ca.account_subtype,
        ca.hierarchy_level,
        ca.normal_balance,
        CASE
          WHEN ca.normal_balance = 'credit' THEN
            COALESCE(ca.opening_balance, 0)
            + COALESCE(SUM(CASE WHEN gl.status='posted' AND gl.entry_date <= '${endDate}' THEN gl.credit_amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN gl.status='posted' AND gl.entry_date <= '${endDate}' THEN gl.debit_amount ELSE 0 END), 0)
          ELSE
            COALESCE(ca.opening_balance, 0)
            + COALESCE(SUM(CASE WHEN gl.status='posted' AND gl.entry_date <= '${endDate}' THEN gl.debit_amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN gl.status='posted' AND gl.entry_date <= '${endDate}' THEN gl.credit_amount ELSE 0 END), 0)
        END AS balance,
        COALESCE(SUM(CASE WHEN gl.status='posted' AND gl.entry_date <= '${endDate}' THEN gl.debit_amount ELSE 0 END), 0) AS total_debit,
        COALESCE(SUM(CASE WHEN gl.status='posted' AND gl.entry_date <= '${endDate}' THEN gl.credit_amount ELSE 0 END), 0) AS total_credit
      FROM chart_of_accounts ca
      LEFT JOIN general_ledger gl ON gl.account_number = ca.account_number
      WHERE ca.status='active' AND ca.account_type IN ('asset','liability','equity')
      GROUP BY ca.account_number, ca.account_name, ca.account_type, ca.account_subtype, ca.hierarchy_level, ca.normal_balance, ca.opening_balance
      ORDER BY ca.account_number
    `);
    return rows as any[];
  }

  const rows = await getBalancesForYear(year);
  const cmpRows = cmpYear ? await getBalancesForYear(cmpYear) : [];
  const cmpMap: Record<string, number> = {};
  for (const r of cmpRows) cmpMap[r.account_number] = Number(r.balance || 0);

  const assets = rows.filter((r: any) => r.account_type === 'asset');
  const liabilities = rows.filter((r: any) => r.account_type === 'liability');
  const equity = rows.filter((r: any) => r.account_type === 'equity');

  const addCmp = (arr: any[]) => arr.map((a: any) => ({
    ...a,
    balance: Number(a.balance || 0),
    compare_balance: cmpYear !== null ? (cmpMap[a.account_number] ?? 0) : undefined,
    change: cmpYear !== null ? (Number(a.balance || 0) - (cmpMap[a.account_number] ?? 0)) : undefined,
  }));

  const assetsOut = addCmp(assets);
  const liabilitiesOut = addCmp(liabilities);
  const equityOut = addCmp(equity);

  const totalAssets = assetsOut.reduce((s: number, a: any) => s + a.balance, 0);
  const totalLiabilities = liabilitiesOut.reduce((s: number, l: any) => s + l.balance, 0);
  const totalEquity = equityOut.reduce((s: number, e: any) => s + e.balance, 0);
  const cmpTotalAssets = cmpYear ? cmpRows.filter((r: any) => r.account_type === 'asset').reduce((s: number, a: any) => s + Number(a.balance || 0), 0) : undefined;
  const cmpTotalLiabilities = cmpYear ? cmpRows.filter((r: any) => r.account_type === 'liability').reduce((s: number, l: any) => s + Number(l.balance || 0), 0) : undefined;
  const cmpTotalEquity = cmpYear ? cmpRows.filter((r: any) => r.account_type === 'equity').reduce((s: number, e: any) => s + Number(e.balance || 0), 0) : undefined;

  res.json({
    assets: assetsOut,
    liabilities: liabilitiesOut,
    equity: equityOut,
    summary: {
      totalAssets, totalLiabilities, totalEquity,
      liabilitiesAndEquity: totalLiabilities + totalEquity,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
      compare_year: cmpYear,
      cmpTotalAssets, cmpTotalLiabilities, cmpTotalEquity,
    },
    period: { fiscal_year: year, compare_year: cmpYear }
  });
});

router.get("/financial-reports/balance-sheet/account-transactions", async (req, res) => {
  const { account_number, fiscal_year } = req.query;
  if (!account_number) { res.status(400).json({ error: "נדרש מספר חשבון" }); return; }
  const year = fiscal_year ? parseInt(String(fiscal_year)) : new Date().getFullYear();
  const acctNum = String(account_number).replace(/['";\s]/g, "");
  const endDate = `${year}-12-31`;
  const startDate = `${year}-01-01`;
  const openingRows = await q(`
    SELECT
      COALESCE(ca.opening_balance, 0)
        + COALESCE(SUM(CASE WHEN gl.status='posted' AND gl.entry_date < '${startDate}' THEN gl.debit_amount - gl.credit_amount ELSE 0 END), 0)
        AS opening_balance
    FROM chart_of_accounts ca
    LEFT JOIN general_ledger gl ON gl.account_number = ca.account_number
    WHERE ca.account_number='${acctNum}'
    GROUP BY ca.opening_balance
  `);
  const openingBalance = Number((openingRows[0] as any)?.opening_balance || 0);
  const txRows = await q(`
    SELECT id, entry_date, entry_number, description, reference, source_type,
      COALESCE(debit_amount, 0) as debit, COALESCE(credit_amount, 0) as credit,
      COALESCE(debit_amount, 0) - COALESCE(credit_amount, 0) as net
    FROM general_ledger
    WHERE account_number='${acctNum}' AND status='posted'
      AND entry_date BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY entry_date ASC, id ASC
  `);
  let running = openingBalance;
  const transactions = (txRows as any[]).map((t: any) => {
    running += Number(t.net || 0);
    return { ...t, running_balance: running };
  });
  const acctInfo = await q(`SELECT account_name, account_type, account_subtype FROM chart_of_accounts WHERE account_number='${acctNum}'`);
  res.json({ account_number: acctNum, account: (acctInfo[0] as any) || null, opening_balance: openingBalance, transactions, closing_balance: running, fiscal_year: year });
});

router.get("/financial-reports/aging", async (_req, res) => {
  const apAging = await q(`SELECT
    supplier_name as name,
    COUNT(*) as invoice_count,
    COALESCE(SUM(balance_due), 0) as total_balance,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as days_30,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days'), 0) as days_60,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '60 days' AND due_date >= CURRENT_DATE - INTERVAL '90 days'), 0) as days_90,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '90 days'), 0) as days_90_plus
  FROM accounts_payable WHERE status NOT IN ('paid','cancelled')
  GROUP BY supplier_name ORDER BY total_balance DESC`);

  const arAging = await q(`SELECT
    customer_name as name,
    COUNT(*) as invoice_count,
    COALESCE(SUM(balance_due), 0) as total_balance,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as days_30,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '30 days' AND due_date >= CURRENT_DATE - INTERVAL '60 days'), 0) as days_60,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '60 days' AND due_date >= CURRENT_DATE - INTERVAL '90 days'), 0) as days_90,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '90 days'), 0) as days_90_plus
  FROM accounts_receivable WHERE status NOT IN ('paid','cancelled','written_off')
  GROUP BY customer_name ORDER BY total_balance DESC`);

  const apTotal = apAging.reduce((s: number, a: any) => s + Number(a.total_balance || 0), 0);
  const arTotal = arAging.reduce((s: number, a: any) => s + Number(a.total_balance || 0), 0);

  res.json({
    accountsPayable: apAging,
    accountsReceivable: arAging,
    summary: { apTotal, arTotal, netPosition: arTotal - apTotal }
  });
});

// ========== ENTITY LEDGER (Customer/Vendor Ledger) ==========
router.get("/entity-ledger", async (req, res) => {
  const { entity_type, entity_name, limit = "200", offset = "0" } = req.query;
  const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 200, 1), 1000);
  const safeOffset = Math.max(parseInt(String(offset)) || 0, 0);
  // Whitelist entity_type to prevent injection (support both 'supplier' and 'vendor')
  const allowedTypes = ["customer", "supplier", "vendor"];
  const safeEntityType = allowedTypes.includes(String(entity_type)) ? String(entity_type) : null;
  // Sanitize entity_name: strip any SQL special chars beyond quote escaping
  const safeEntityName = entity_name ? String(entity_name).replace(/[;'"\\]/g, "") : null;
  let where = "WHERE 1=1";
  if (safeEntityType) where += ` AND entity_type='${safeEntityType}'`;
  if (safeEntityName) where += ` AND entity_name ILIKE '%${safeEntityName}%'`;

  const rows = await q(`SELECT * FROM entity_ledger ${where} ORDER BY entry_date DESC, id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  if (rows.length > 0) {
    res.json({ data: rows, total: rows.length });
    return;
  }

  const typeFilter = (safeEntityType === "supplier" || safeEntityType === "vendor")
    ? "gl.account_type IN ('liability')"
    : safeEntityType === "customer"
      ? "gl.account_type IN ('asset')"
      : "gl.account_type IN ('asset','liability')";
  const nameFilter = safeEntityName ? ` AND gl.account_name ILIKE '%${safeEntityName}%'` : "";
  const glRows = await q(`SELECT
    gl.entry_number, gl.entry_date, gl.account_number, gl.account_name,
    COALESCE(gl.debit_amount, 0) as debit, COALESCE(gl.credit_amount, 0) as credit,
    COALESCE(gl.debit_amount, 0) - COALESCE(gl.credit_amount, 0) as balance,
    gl.description, gl.reference, gl.source_type,
    CASE WHEN gl.account_type IN ('liability') THEN 'supplier' ELSE 'customer' END as entity_type,
    gl.account_name as entity_name
  FROM general_ledger gl
  WHERE ${typeFilter} AND gl.status='posted'${nameFilter}
  ORDER BY gl.entry_date DESC, gl.id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);

  res.json({ data: glRows, total: glRows.length });
});

router.get("/entity-ledger/stats", async (_req, res) => {
  const stats = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE entity_type='customer') as customer_count,
    COUNT(*) FILTER (WHERE entity_type='supplier') as supplier_count,
    COALESCE(SUM(debit) - SUM(credit), 0) as net_balance
  FROM entity_ledger`);
  const s = stats[0] as any || {};
  if (Number(s.total) > 0) { res.json(s); return; }
  const glStats = await q(`SELECT
    COUNT(*) as total,
    0 as customer_count,
    0 as supplier_count,
    COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as net_balance
  FROM general_ledger WHERE status='posted'`);
  res.json(glStats[0] || {});
});

// ========== CUSTOMER AGING (dedicated endpoint — filters aging-snapshots by entity_type=customer) ==========
router.get("/customer-aging", async (req, res) => {
  const { risk_level } = req.query;
  let where = "WHERE entity_type='customer'";
  const allowedRisk = ["low", "medium", "high", "critical"];
  if (risk_level && allowedRisk.includes(String(risk_level))) {
    where += ` AND risk_level='${String(risk_level)}'`;
  }
  const rows = await q(`SELECT * FROM aging_snapshots ${where} ORDER BY total_outstanding DESC`);
  const stats = await q(`SELECT
    COUNT(*) as total,
    COALESCE(SUM(total_outstanding), 0) as total_receivable,
    COUNT(*) FILTER (WHERE risk_level IN ('high','critical')) as high_risk_count,
    COALESCE(SUM(days_over_120), 0) as over_120_total
  FROM aging_snapshots WHERE entity_type='customer'`);
  res.json({ data: rows, stats: stats[0] || {}, total: rows.length });
});

// ========== SUPPLIER AGING (dedicated endpoint — filters aging-snapshots by entity_type=supplier/vendor) ==========
router.get("/supplier-aging", async (req, res) => {
  const { risk_level } = req.query;
  let where = "WHERE entity_type IN ('supplier','vendor')";
  const allowedRisk = ["low", "medium", "high", "critical"];
  if (risk_level && allowedRisk.includes(String(risk_level))) {
    where += ` AND risk_level='${String(risk_level)}'`;
  }
  const rows = await q(`SELECT * FROM aging_snapshots ${where} ORDER BY total_outstanding DESC`);
  const stats = await q(`SELECT
    COUNT(*) as total,
    COALESCE(SUM(total_outstanding), 0) as total_payable,
    COUNT(*) FILTER (WHERE risk_level IN ('high','critical')) as high_risk_count,
    COALESCE(SUM(days_over_120), 0) as over_120_total
  FROM aging_snapshots WHERE entity_type='supplier'`);
  res.json({ data: rows, stats: stats[0] || {}, total: rows.length });
});

// ========== VAT REPORT ==========
router.get("/vat-report", async (req, res) => {
  const { year, quarter } = req.query;
  const y = year ? parseInt(String(year)) : new Date().getFullYear();
  const q_num = quarter ? parseInt(String(quarter)) : Math.ceil((new Date().getMonth() + 1) / 3);
  const monthFrom = (q_num - 1) * 3 + 1;
  const monthTo = q_num * 3;

  const periods = await q(`SELECT
    TO_CHAR(invoice_date, 'YYYY-MM') as month,
    COALESCE(SUM(total_amount), 0) as taxable_sales,
    COALESCE(SUM(vat_amount), 0) as output_vat,
    0 as taxable_purchases,
    0 as input_vat,
    COALESCE(SUM(vat_amount), 0) as net_vat,
    COUNT(*) as transaction_count
  FROM accounts_receivable
  WHERE EXTRACT(YEAR FROM invoice_date) = ${y}
    AND EXTRACT(MONTH FROM invoice_date) BETWEEN ${monthFrom} AND ${monthTo}
    AND status NOT IN ('cancelled')
  GROUP BY TO_CHAR(invoice_date, 'YYYY-MM')
  ORDER BY month`);

  const apPeriods = await q(`SELECT
    TO_CHAR(invoice_date, 'YYYY-MM') as month,
    COALESCE(SUM(total_amount), 0) as taxable_purchases,
    COALESCE(SUM(vat_amount), 0) as input_vat
  FROM accounts_payable
  WHERE EXTRACT(YEAR FROM invoice_date) = ${y}
    AND EXTRACT(MONTH FROM invoice_date) BETWEEN ${monthFrom} AND ${monthTo}
    AND status NOT IN ('cancelled')
  GROUP BY TO_CHAR(invoice_date, 'YYYY-MM')`);

  // Merge AR and AP — include months from both datasets (full outer join in JS)
  const arMap: Record<string, any> = {};
  for (const ar of periods as any[]) { arMap[ar.month] = ar; }
  const apMap: Record<string, any> = {};
  for (const ap of apPeriods as any[]) { apMap[ap.month] = ap; }

  const allMonths = new Set([...Object.keys(arMap), ...Object.keys(apMap)]);
  const mergedPeriods = Array.from(allMonths).sort().map((month: string) => {
    const ar = arMap[month] || { taxable_sales: 0, output_vat: 0, transaction_count: 0 };
    const ap = apMap[month] || { taxable_purchases: 0, input_vat: 0 };
    const netVat = Number(ar.output_vat) - Number(ap.input_vat);
    return {
      month,
      taxable_sales: ar.taxable_sales,
      output_vat: ar.output_vat,
      taxable_purchases: ap.taxable_purchases,
      input_vat: ap.input_vat,
      net_vat: netVat,
      transaction_count: Number(ar.transaction_count || 0)
    };
  });

  const totalOutputVat = mergedPeriods.reduce((s, p) => s + Number(p.output_vat || 0), 0);
  const totalInputVat = mergedPeriods.reduce((s, p) => s + Number(p.input_vat || 0), 0);
  const totalTaxableSales = mergedPeriods.reduce((s, p) => s + Number(p.taxable_sales || 0), 0);
  const totalTaxablePurchases = mergedPeriods.reduce((s, p) => s + Number(p.taxable_purchases || 0), 0);

  res.json({
    periods: mergedPeriods,
    summary: { totalTaxableSales, totalOutputVat, totalTaxablePurchases, totalInputVat, netVat: totalOutputVat - totalInputVat },
    taxRate: 17,
    vatNumber: null,
    period: { year: y, quarter: q_num }
  });
});

// ========== FISCAL REPORT ==========
router.get("/fiscal-report", async (req, res) => {
  const { year, view } = req.query;
  const y = year ? parseInt(String(year)) : new Date().getFullYear();

  const revenueByQuarter = await q(`SELECT
    EXTRACT(QUARTER FROM invoice_date)::int as quarter,
    COALESCE(SUM(total_amount), 0) as revenue
  FROM accounts_receivable
  WHERE EXTRACT(YEAR FROM invoice_date) = ${y} AND status NOT IN ('cancelled')
  GROUP BY EXTRACT(QUARTER FROM invoice_date)
  ORDER BY quarter`);

  const expensesByQuarter = await q(`SELECT
    EXTRACT(QUARTER FROM expense_date)::int as quarter,
    COALESCE(SUM(amount), 0) as expenses
  FROM expenses
  WHERE EXTRACT(YEAR FROM expense_date) = ${y} AND status NOT IN ('cancelled','rejected')
  GROUP BY EXTRACT(QUARTER FROM expense_date)
  ORDER BY quarter`);

  const revMap: Record<number, number> = {};
  for (const r of revenueByQuarter as any[]) revMap[r.quarter] = Number(r.revenue);
  const expMap: Record<number, number> = {};
  for (const e of expensesByQuarter as any[]) expMap[e.quarter] = Number(e.expenses);

  const quarters = [1, 2, 3, 4].map(q_num => {
    const rev = revMap[q_num] || 0;
    const exp = expMap[q_num] || 0;
    const gross = rev - exp;
    const tax = Math.max(gross * 0.23, 0);
    const net = gross - tax;
    const margin = rev > 0 ? (net / rev * 100) : 0;
    return { quarter: q_num, revenue: rev, expenses: exp, gross_profit: gross, tax_amount: tax, net_profit: net, margin: margin.toFixed(1) };
  });

  const totalRevenue = quarters.reduce((s, q) => s + q.revenue, 0);
  const totalExpenses = quarters.reduce((s, q) => s + q.expenses, 0);
  const grossProfit = totalRevenue - totalExpenses;
  const totalTax = Math.max(grossProfit * 0.23, 0);
  const netProfit = grossProfit - totalTax;

  const [revByCat, expByCat] = await Promise.all([
    // Revenue by category from accounts_receivable (service_type or category field)
    q(`SELECT
      COALESCE(service_type, category, 'כללי') as category,
      COALESCE(SUM(total_amount), 0) as total
    FROM accounts_receivable
    WHERE EXTRACT(YEAR FROM invoice_date) = ${y} AND status NOT IN ('cancelled')
    GROUP BY COALESCE(service_type, category, 'כללי') ORDER BY total DESC LIMIT 10`),
    // Expenses by category
    q(`SELECT
      COALESCE(category, 'כללי') as category,
      COALESCE(SUM(amount), 0) as total
    FROM expenses WHERE EXTRACT(YEAR FROM expense_date) = ${y} AND status NOT IN ('cancelled','rejected')
    GROUP BY COALESCE(category, 'כללי') ORDER BY total DESC LIMIT 10`)
  ]);

  res.json({
    quarters,
    annual: { revenue: totalRevenue, expenses: totalExpenses, gross_profit: grossProfit, tax_amount: totalTax, net_profit: netProfit, margin: totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : 0 },
    revenueByCategory: revByCat,
    expensesByCategory: expByCat,
    period: { year: y }
  });
});

// ========== INVOICE ANALYSIS ==========
router.get("/invoice-analysis", async (_req, res) => {
  const trends = await q(`SELECT
    TO_CHAR(invoice_date, 'YYYY-MM') as month,
    COUNT(*) as invoice_count,
    COALESCE(SUM(total_amount), 0) as total_amount,
    COALESCE(AVG(total_amount), 0) as avg_amount,
    COUNT(*) FILTER (WHERE status='paid') as paid_count
  FROM accounts_receivable
  WHERE invoice_date >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY TO_CHAR(invoice_date, 'YYYY-MM')
  ORDER BY month`);

  const statusBreakdown = await q(`SELECT
    status,
    COUNT(*) as count,
    COALESCE(SUM(total_amount), 0) as total,
    ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) as percentage
  FROM accounts_receivable
  GROUP BY status ORDER BY count DESC`);

  const paymentTimes = await q(`SELECT
    customer_name as entity_name,
    COUNT(*) as invoice_count,
    COALESCE(AVG(EXTRACT(DAY FROM (payment_date - due_date))), 0) as avg_days,
    COUNT(*) FILTER (WHERE payment_date > due_date) as late_count
  FROM accounts_receivable
  WHERE payment_date IS NOT NULL
  GROUP BY customer_name
  ORDER BY avg_days DESC LIMIT 20`);

  const summary = await q(`SELECT
    COUNT(*) as total_invoices,
    COUNT(*) FILTER (WHERE status='paid') as paid_invoices,
    COUNT(*) FILTER (WHERE status IN ('open','partial','overdue')) as pending_invoices,
    COALESCE(AVG(EXTRACT(DAY FROM (payment_date - invoice_date))) FILTER (WHERE payment_date IS NOT NULL), 0) as avg_payment_days,
    COALESCE(SUM(total_amount), 0) as total_amount,
    COALESCE(SUM(paid_amount), 0) as paid_amount
  FROM accounts_receivable`);

  res.json({ trends, statusBreakdown, paymentTimes, summary: summary[0] || {} });
});

// ========== ANALYTICAL REPORTS ==========
router.get("/analytical-reports", async (req, res) => {
  const { year } = req.query;
  const y = year ? parseInt(String(year)) : new Date().getFullYear();

  const [revenueByMonth, expensesByCategory, topCustomers, projectProfitability] = await Promise.all([
    q(`SELECT
      TO_CHAR(invoice_date, 'YYYY-MM') as month,
      COALESCE(SUM(total_amount), 0) as revenue,
      0 as expenses,
      COALESCE(SUM(total_amount), 0) as profit
    FROM accounts_receivable
    WHERE EXTRACT(YEAR FROM invoice_date) = ${y} AND status NOT IN ('cancelled')
    GROUP BY TO_CHAR(invoice_date, 'YYYY-MM')
    ORDER BY month`),
    q(`SELECT
      category,
      COALESCE(SUM(amount), 0) as total,
      ROUND(SUM(amount) * 100.0 / NULLIF(SUM(SUM(amount)) OVER (), 0), 1) as percentage
    FROM expenses
    WHERE EXTRACT(YEAR FROM expense_date) = ${y} AND status NOT IN ('cancelled','rejected')
    GROUP BY category ORDER BY total DESC`),
    q(`SELECT
      customer_name,
      COUNT(*) as invoice_count,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM(paid_amount), 0) as paid_amount,
      COALESCE(SUM(balance_due), 0) as balance_due
    FROM accounts_receivable
    WHERE EXTRACT(YEAR FROM invoice_date) = ${y} AND status NOT IN ('cancelled')
    GROUP BY customer_name ORDER BY total_amount DESC LIMIT 10`),
    q(`SELECT
      project_name,
      COALESCE(SUM(actual_revenue), 0) as actual_revenue,
      COALESCE(SUM(actual_cost), 0) as actual_cost,
      CASE WHEN SUM(actual_revenue) > 0
        THEN ROUND(((SUM(actual_revenue) - SUM(actual_cost)) / SUM(actual_revenue) * 100)::numeric, 1)
        ELSE 0 END as margin
    FROM projects
    WHERE status IN ('active','completed')
    GROUP BY project_name ORDER BY actual_revenue DESC LIMIT 10`)
  ]);

  const totalRevenue = (revenueByMonth as any[]).reduce((s, m) => s + Number(m.revenue || 0), 0);
  const totalExpenses = (expensesByCategory as any[]).reduce((s, c) => s + Number(c.total || 0), 0);
  const netProfit = totalRevenue - totalExpenses;

  res.json({
    revenueByMonth,
    expensesByCategory,
    topCustomers,
    projectProfitability,
    summary: { total_revenue: totalRevenue, total_expenses: totalExpenses, net_profit: netProfit, margin: totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : 0 }
  });
});

// ========== EXECUTIVE SUMMARY ==========
router.get("/executive-summary", async (req, res) => {
  const { period = "month" } = req.query;
  const dateFilter = period === "month" ? "DATE_TRUNC('month', CURRENT_DATE)"
    : period === "quarter" ? "DATE_TRUNC('quarter', CURRENT_DATE)"
    : "DATE_TRUNC('year', CURRENT_DATE)";

  const [revenueData, expensesData, cashData, arData, apData, prevRevenueData] = await Promise.all([
    q(`SELECT COALESCE(SUM(amount), 0) as total FROM accounts_receivable WHERE invoice_date >= ${dateFilter} AND status NOT IN ('cancelled')`),
    q(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE expense_date >= ${dateFilter} AND status NOT IN ('cancelled','rejected')`),
    q(`SELECT COALESCE(SUM(current_balance), 0) as total FROM bank_accounts WHERE is_active = true`),
    q(`SELECT
      COALESCE(SUM(balance_due), 0) as total,
      COUNT(*) FILTER (WHERE status IN ('open','partial','overdue')) as open_count,
      COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as overdue_30,
      COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - INTERVAL '90 days'), 0) as overdue_90
    FROM accounts_receivable WHERE status NOT IN ('paid','cancelled','written_off')`),
    q(`SELECT
      COALESCE(SUM(balance_due), 0) as total,
      COUNT(*) FILTER (WHERE status IN ('open','partial','overdue')) as open_count,
      COALESCE(SUM(balance_due) FILTER (WHERE due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'), 0) as due_soon,
      COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE), 0) as overdue
    FROM accounts_payable WHERE status NOT IN ('paid','cancelled')`),
    q(`SELECT COALESCE(SUM(amount), 0) as total FROM accounts_receivable WHERE invoice_date >= ${dateFilter} - INTERVAL '1 ${period === "month" ? "month" : period === "quarter" ? "quarter" : "year"}' AND invoice_date < ${dateFilter} AND status NOT IN ('cancelled')`)
  ]);

  const revenue = Number((revenueData[0] as any)?.total || 0);
  const expenses = Number((expensesData[0] as any)?.total || 0);
  const prevRevenue = Number((prevRevenueData[0] as any)?.total || 0);
  const netProfit = revenue - expenses;
  const profitMargin = revenue > 0 ? (netProfit / revenue * 100) : 0;
  const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue * 100) : null;

  const ar = arData[0] as any || {};
  const ap = apData[0] as any || {};

  const alerts: any[] = [];
  if (Number(ar.overdue_30 || 0) > 0) alerts.push({ type: "warning", title: "חייבים מאחרים", message: `₪${Number(ar.overdue_30 || 0).toLocaleString("he-IL")} מעל 30 יום` });
  if (Number(ap.overdue || 0) > 0) alerts.push({ type: "danger", title: "תשלומים לספקים באיחור", message: `₪${Number(ap.overdue || 0).toLocaleString("he-IL")} באיחור` });
  if (Number(ap.due_soon || 0) > 0) alerts.push({ type: "warning", title: "תשלומים קרובים", message: `₪${Number(ap.due_soon || 0).toLocaleString("he-IL")} תוך 30 יום` });

  const topCustomers = await q(`SELECT customer_name as name, COALESCE(SUM(amount), 0) as revenue FROM accounts_receivable WHERE invoice_date >= ${dateFilter} AND status NOT IN ('cancelled') GROUP BY customer_name ORDER BY revenue DESC LIMIT 5`);
  const topSuppliers = await q(`SELECT supplier_name as name, COALESCE(SUM(amount), 0) as amount FROM accounts_payable WHERE invoice_date >= ${dateFilter} AND status NOT IN ('cancelled') GROUP BY supplier_name ORDER BY amount DESC LIMIT 5`);

  const cashInflows = await q(`SELECT COALESCE(SUM(amount), 0) as total FROM cash_flow_records WHERE flow_type='inflow' AND record_date >= ${dateFilter}`);
  const cashOutflows = await q(`SELECT COALESCE(SUM(amount), 0) as total FROM cash_flow_records WHERE flow_type='outflow' AND record_date >= ${dateFilter}`);

  const yearNum = Number(req.query.year) || new Date().getFullYear();
  const MONTHS_SHORT = ["ינו", "פבר", "מרץ", "אפר", "מאי", "יוני", "יולי", "אוג", "ספט", "אוק", "נוב", "דצמ"];
  const monthlyIncome: any[] = [];
  const monthlyCashFlow: any[] = [];
  for (let m = 1; m <= 12; m++) {
    const ms = `${yearNum}-${String(m).padStart(2, "0")}-01`;
    const me = m < 12 ? `${yearNum}-${String(m + 1).padStart(2, "0")}-01` : `${yearNum + 1}-01-01`;
    const incR = await q(`SELECT COALESCE(SUM(amount), 0) as v FROM income_documents WHERE invoice_date >= '${ms}' AND invoice_date < '${me}' AND status != 'cancelled'`);
    const expR = await q(`SELECT COALESCE(SUM(amount), 0) as v FROM expenses WHERE expense_date >= '${ms}' AND expense_date < '${me}' AND status NOT IN ('cancelled','rejected')`);
    const inc = Number((incR[0] as any)?.v || 0);
    const exp = Number((expR[0] as any)?.v || 0);
    monthlyIncome.push({ month: MONTHS_SHORT[m - 1], income: inc });
    monthlyCashFlow.push({ month: MONTHS_SHORT[m - 1], inflows: inc, outflows: exp });
  }

  const topExpenses = await q(`SELECT category as name, COALESCE(SUM(amount), 0) as total FROM expenses WHERE EXTRACT(YEAR FROM expense_date) = ${yearNum} AND status NOT IN ('cancelled','rejected') AND category IS NOT NULL AND category != '' GROUP BY category ORDER BY total DESC LIMIT 6`);
  const topProducts = await q(`SELECT COALESCE(products, 'אחר') as name, COALESCE(SUM(amount), 0) as total FROM income_documents WHERE EXTRACT(YEAR FROM invoice_date) = ${yearNum} AND status != 'cancelled' GROUP BY products ORDER BY total DESC LIMIT 6`);

  res.json({
    kpis: {
      revenue, expenses, net_profit: netProfit, profit_margin: profitMargin.toFixed(1),
      cash_balance: Number((cashData[0] as any)?.total || 0),
      revenue_change: revenueChange !== null ? revenueChange.toFixed(1) : null
    },
    receivables: { total: ar.total, open_count: ar.open_count, overdue_30: ar.overdue_30, overdue_90: ar.overdue_90 },
    payables: { total: ap.total, open_count: ap.open_count, due_soon: ap.due_soon, overdue: ap.overdue },
    cashFlow: {
      inflows: Number((cashInflows[0] as any)?.total || 0),
      outflows: Number((cashOutflows[0] as any)?.total || 0),
      net: Number((cashInflows[0] as any)?.total || 0) - Number((cashOutflows[0] as any)?.total || 0)
    },
    alerts,
    topItems: { topCustomers, topSuppliers, topExpenses, topProducts },
    monthlyIncome,
    monthlyCashFlow,
    period
  });
});

export default router;

