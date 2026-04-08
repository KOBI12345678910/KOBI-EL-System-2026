/**
 * @openapi
 * /api/general-ledger:
 *   get:
 *     summary: יומן חשבונאי כללי — General ledger entries
 *     description: מחזיר רשומות יומן כללי (General Ledger) עם אפשרות סינון לפי חשבון, שנת כספים ותקופה. מודול הנהלת חשבונות מלאה.
 *     tags: [Finance & Accounting]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: account_number
 *         schema: { type: string }
 *         description: מספר חשבון
 *       - in: query
 *         name: fiscal_year
 *         schema: { type: integer }
 *         description: שנת כספים
 *       - in: query
 *         name: fiscal_period
 *         schema: { type: integer }
 *         description: תקופה (חודש)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 200, maximum: 1000 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: רשומות יומן כללי
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data: { type: array }
 *                 total: { type: integer }
 *       401: { description: לא מחובר }
 */
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
  catch (e: any) { console.error("Finance-Accounting query error:", e.message); return []; }
}

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

async function ensureTable(tableName: string, createSql: string) {
  try {
    await db.execute(sql.raw(`SELECT 1 FROM ${tableName} LIMIT 1`));
  } catch {
    await db.execute(sql.raw(createSql));
  }
}


// ========== GENERAL LEDGER ==========
router.get("/general-ledger", async (req, res) => {
  const { account_number, fiscal_year, fiscal_period, limit = "200", offset = "0" } = req.query;
  let where = "WHERE 1=1";
  if (account_number) where += ` AND account_number = '${String(account_number).replace(/'/g, "''")}'`;
  if (fiscal_year) where += ` AND fiscal_year = ${parseInt(String(fiscal_year))}`;
  if (fiscal_period) where += ` AND fiscal_period = ${parseInt(String(fiscal_period))}`;
  const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 200, 1), 1000);
  const safeOffset = Math.max(parseInt(String(offset)) || 0, 0);
  const rows = await q(`SELECT * FROM general_ledger ${where} ORDER BY entry_date DESC, id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM general_ledger ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/general-ledger/by-account", async (_req, res) => {
  try {
    const rows = await q(`SELECT
      account_number, account_name, account_type,
      COUNT(*) as entry_count,
      COALESCE(SUM(debit_amount), 0) as total_debit,
      COALESCE(SUM(credit_amount), 0) as total_credit,
      COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as balance
    FROM general_ledger
    GROUP BY account_number, account_name, account_type
    ORDER BY account_number`);
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/general-ledger/by-period", async (_req, res) => {
  try {
    const rows = await q(`SELECT
      fiscal_year, fiscal_period,
      COUNT(*) as entry_count,
      COALESCE(SUM(debit_amount), 0) as total_debit,
      COALESCE(SUM(credit_amount), 0) as total_credit,
      COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as balance
    FROM general_ledger
    GROUP BY fiscal_year, fiscal_period
    ORDER BY fiscal_year DESC, fiscal_period DESC`);
    res.json(rows);
  } catch { res.json([]); }
});

router.get("/general-ledger/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COALESCE(SUM(debit_amount), 0) as total_debit,
    COALESCE(SUM(credit_amount), 0) as total_credit,
    COALESCE(SUM(debit_amount) - SUM(credit_amount), 0) as net_balance,
    COUNT(DISTINCT account_number) as account_count,
    COUNT(*) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)) as month_entries,
    COALESCE(SUM(debit_amount) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as month_debit,
    COALESCE(SUM(credit_amount) FILTER (WHERE entry_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as month_credit,
    COUNT(DISTINCT fiscal_period) as periods_count,
    COUNT(*) FILTER (WHERE status='posted') as posted_count,
    COUNT(*) FILTER (WHERE status='draft') as draft_count
  FROM general_ledger`);
  res.json(rows[0] || {});
});

router.get("/general-ledger/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM general_ledger WHERE id=${parseInt(req.params.id)}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/general-ledger", async (req, res) => {
  const d = req.body;
  const num = await nextNum("GL-", "general_ledger", "entry_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const balance = (Number(d.debitAmount) || 0) - (Number(d.creditAmount) || 0);
  await q(`INSERT INTO general_ledger (entry_number, entry_date, account_number, account_name, account_type, description, reference, source_document, source_type, debit_amount, credit_amount, balance, currency, exchange_rate, fiscal_year, fiscal_period, cost_center, department, project_name, journal_entry_id, status, posted_by, posted_by_name, notes)
    VALUES ('${num}', '${d.entryDate || new Date().toISOString().slice(0,10)}', ${s(d.accountNumber)}, ${s(d.accountName)}, ${s(d.accountType)}, ${s(d.description)}, ${s(d.reference)}, ${s(d.sourceDocument)}, ${s(d.sourceType)}, ${d.debitAmount||0}, ${d.creditAmount||0}, ${balance}, '${d.currency||'ILS'}', ${d.exchangeRate||1}, ${d.fiscalYear || new Date().getFullYear()}, ${d.fiscalPeriod || new Date().getMonth()+1}, ${s(d.costCenter)}, ${s(d.department)}, ${s(d.projectName)}, ${d.journalEntryId||'NULL'}, '${d.status||'posted'}', ${user?.id||'NULL'}, ${user?.fullName ? s(user.fullName) : 'NULL'}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM general_ledger WHERE entry_number='${num}'`);
  res.json(rows[0]);
});

router.put("/general-ledger/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.entryDate) sets.push(`entry_date='${d.entryDate}'`);
  if (d.accountNumber) sets.push(`account_number=${s(d.accountNumber)}`);
  if (d.accountName) sets.push(`account_name=${s(d.accountName)}`);
  if (d.accountType) sets.push(`account_type=${s(d.accountType)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.reference !== undefined) sets.push(`reference=${s(d.reference)}`);
  if (d.debitAmount !== undefined) sets.push(`debit_amount=${d.debitAmount}`);
  if (d.creditAmount !== undefined) sets.push(`credit_amount=${d.creditAmount}`);
  if (d.debitAmount !== undefined || d.creditAmount !== undefined) {
    const debit = d.debitAmount !== undefined ? d.debitAmount : 0;
    const credit = d.creditAmount !== undefined ? d.creditAmount : 0;
    sets.push(`balance=${debit - credit}`);
  }
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.costCenter !== undefined) sets.push(`cost_center=${s(d.costCenter)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.fiscalYear) sets.push(`fiscal_year=${d.fiscalYear}`);
  if (d.fiscalPeriod) sets.push(`fiscal_period=${d.fiscalPeriod}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE general_ledger SET ${sets.join(",")} WHERE id=${req.params.id}`);
  const rows = await q(`SELECT * FROM general_ledger WHERE id=${req.params.id}`);
  res.json(rows[0]);
});

router.delete("/general-ledger/:id", async (req, res) => {
  await q(`DELETE FROM general_ledger WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== FIXED ASSETS ==========
router.get("/fixed-assets", async (req, res) => {
  const { status, category, asset_type, limit = "200", offset = "0" } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = '${String(status).replace(/'/g, "''")}'`;
  if (category) where += ` AND category = '${String(category).replace(/'/g, "''")}'`;
  if (asset_type) where += ` AND asset_type = '${String(asset_type).replace(/'/g, "''")}'`;
  const safeLimit = Math.min(Math.max(parseInt(String(limit)) || 200, 1), 1000);
  const safeOffset = Math.max(parseInt(String(offset)) || 0, 0);
  const rows = await q(`SELECT * FROM fixed_assets ${where} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM fixed_assets ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/fixed-assets/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active_count,
    COUNT(*) FILTER (WHERE status='disposed') as disposed_count,
    COUNT(*) FILTER (WHERE status='under_maintenance') as maintenance_count,
    COALESCE(SUM(purchase_price), 0) as total_purchase_value,
    COALESCE(SUM(current_value), 0) as total_current_value,
    COALESCE(SUM(accumulated_depreciation), 0) as total_depreciation,
    COALESCE(SUM(annual_depreciation), 0) as total_annual_depreciation,
    COALESCE(SUM(current_value) FILTER (WHERE status='active'), 0) as active_value,
    COUNT(DISTINCT category) as category_count,
    COUNT(DISTINCT location) as location_count,
    COUNT(*) FILTER (WHERE warranty_expiry IS NOT NULL AND warranty_expiry < CURRENT_DATE) as expired_warranty
  FROM fixed_assets`);
  res.json(rows[0] || {});
});

router.get("/fixed-assets/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM fixed_assets WHERE id=${parseInt(req.params.id)}`);
  if (rows.length === 0) { res.status(404).json({ error: "נכס לא נמצא" }); return; }
  res.json(rows[0]);
});

router.post("/fixed-assets", async (req, res) => {
  const d = req.body;
  const num = await nextNum("FA-", "fixed_assets", "asset_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const purchasePrice = Number(d.purchasePrice) || 0;
  const residualValue = Number(d.residualValue) || 0;
  const usefulLife = Number(d.usefulLifeYears) || 5;
  const annualDep = usefulLife > 0 ? (purchasePrice - residualValue) / usefulLife : 0;
  const currentValue = purchasePrice - (Number(d.accumulatedDepreciation) || 0);
  const depRate = purchasePrice > 0 ? (annualDep / purchasePrice * 100) : 0;

  await q(`INSERT INTO fixed_assets (asset_number, asset_name, asset_type, category, description, serial_number, manufacturer, model, location, department, assigned_to, purchase_date, purchase_price, currency, supplier, invoice_number, useful_life_years, depreciation_method, depreciation_rate, accumulated_depreciation, current_value, residual_value, annual_depreciation, warranty_expiry, insurance_policy, insurance_expiry, maintenance_schedule, status, gl_account, cost_center, barcode, notes)
    VALUES ('${num}', ${s(d.assetName)}, '${d.assetType||'equipment'}', ${s(d.category)}, ${s(d.description)}, ${s(d.serialNumber)}, ${s(d.manufacturer)}, ${s(d.model)}, ${s(d.location)}, ${s(d.department)}, ${s(d.assignedTo)}, ${d.purchaseDate ? `'${d.purchaseDate}'` : 'NULL'}, ${purchasePrice}, '${d.currency||'ILS'}', ${s(d.supplier)}, ${s(d.invoiceNumber)}, ${usefulLife}, '${d.depreciationMethod||'straight_line'}', ${depRate.toFixed(2)}, ${Number(d.accumulatedDepreciation)||0}, ${currentValue}, ${residualValue}, ${annualDep.toFixed(2)}, ${d.warrantyExpiry ? `'${d.warrantyExpiry}'` : 'NULL'}, ${s(d.insurancePolicy)}, ${d.insuranceExpiry ? `'${d.insuranceExpiry}'` : 'NULL'}, ${s(d.maintenanceSchedule)}, '${d.status||'active'}', ${s(d.glAccount)}, ${s(d.costCenter)}, ${s(d.barcode)}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM fixed_assets WHERE asset_number='${num}'`);
  res.json(rows[0]);
});

router.put("/fixed-assets/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.assetName) sets.push(`asset_name=${s(d.assetName)}`);
  if (d.assetType) sets.push(`asset_type='${d.assetType}'`);
  if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.serialNumber !== undefined) sets.push(`serial_number=${s(d.serialNumber)}`);
  if (d.manufacturer !== undefined) sets.push(`manufacturer=${s(d.manufacturer)}`);
  if (d.model !== undefined) sets.push(`model=${s(d.model)}`);
  if (d.location !== undefined) sets.push(`location=${s(d.location)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.assignedTo !== undefined) sets.push(`assigned_to=${s(d.assignedTo)}`);
  if (d.purchaseDate) sets.push(`purchase_date='${d.purchaseDate}'`);
  if (d.purchasePrice !== undefined) sets.push(`purchase_price=${d.purchasePrice}`);
  if (d.usefulLifeYears !== undefined) sets.push(`useful_life_years=${d.usefulLifeYears}`);
  if (d.depreciationMethod) sets.push(`depreciation_method='${d.depreciationMethod}'`);
  if (d.accumulatedDepreciation !== undefined) sets.push(`accumulated_depreciation=${d.accumulatedDepreciation}`);
  if (d.currentValue !== undefined) sets.push(`current_value=${d.currentValue}`);
  if (d.residualValue !== undefined) sets.push(`residual_value=${d.residualValue}`);
  if (d.annualDepreciation !== undefined) sets.push(`annual_depreciation=${d.annualDepreciation}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.warrantyExpiry) sets.push(`warranty_expiry='${d.warrantyExpiry}'`);
  if (d.insurancePolicy !== undefined) sets.push(`insurance_policy=${s(d.insurancePolicy)}`);
  if (d.maintenanceSchedule !== undefined) sets.push(`maintenance_schedule=${s(d.maintenanceSchedule)}`);
  if (d.glAccount !== undefined) sets.push(`gl_account=${s(d.glAccount)}`);
  if (d.costCenter !== undefined) sets.push(`cost_center=${s(d.costCenter)}`);
  if (d.barcode !== undefined) sets.push(`barcode=${s(d.barcode)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.disposalDate) sets.push(`disposal_date='${d.disposalDate}'`);
  if (d.disposalPrice !== undefined) sets.push(`disposal_price=${d.disposalPrice}`);
  if (d.disposalMethod !== undefined) sets.push(`disposal_method=${s(d.disposalMethod)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE fixed_assets SET ${sets.join(",")} WHERE id=${req.params.id}`);
  const rows = await q(`SELECT * FROM fixed_assets WHERE id=${req.params.id}`);
  res.json(rows[0]);
});

router.delete("/fixed-assets/:id", async (req, res) => {
  await q(`DELETE FROM fixed_assets WHERE id=${req.params.id}`);
  res.json({ success: true });
});

router.get("/fixed-assets/by-category", async (_req, res) => {
  const rows = await q(`SELECT
    COALESCE(category, 'ללא קטגוריה') as category,
    COUNT(*) as count,
    COALESCE(SUM(purchase_price), 0) as total_purchase,
    COALESCE(SUM(current_value), 0) as total_current,
    COALESCE(SUM(accumulated_depreciation), 0) as total_depreciation,
    COALESCE(SUM(annual_depreciation), 0) as annual_depreciation
  FROM fixed_assets WHERE status != 'disposed'
  GROUP BY category ORDER BY total_current DESC`);
  res.json(rows);
});

router.get("/fixed-assets/by-location", async (_req, res) => {
  const rows = await q(`SELECT
    COALESCE(location, 'לא צוין') as location,
    COUNT(*) as count,
    COALESCE(SUM(current_value), 0) as total_value
  FROM fixed_assets WHERE status = 'active'
  GROUP BY location ORDER BY total_value DESC`);
  res.json(rows);
});

// ========== EXPENSE REPORTS ENHANCED ==========
router.get("/expense-reports/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='pending') as pending,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='paid') as paid,
    COUNT(*) FILTER (WHERE status='rejected') as rejected,
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(amount) FILTER (WHERE status='pending'), 0) as pending_amount,
    COALESCE(SUM(amount) FILTER (WHERE status='approved'), 0) as approved_amount,
    COALESCE(SUM(amount) FILTER (WHERE status='paid'), 0) as paid_amount,
    COALESCE(SUM(amount) FILTER (WHERE expense_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as month_amount,
    COUNT(DISTINCT category) as category_count,
    COUNT(DISTINCT department) as department_count
  FROM expenses WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

// ========== FINANCIAL REPORTS SUMMARY ==========
router.get("/financial-reports/overview", async (_req, res) => {
  const [balanceSheet, cashTotal, arTotal, apTotal, taxTotal, jeStats, expStats, budgetStats] = await Promise.all([
    q(`SELECT
      COALESCE(SUM(balance) FILTER (WHERE account_type='asset'), 0) as total_assets,
      COALESCE(SUM(balance) FILTER (WHERE account_type='liability'), 0) as total_liabilities,
      COALESCE(SUM(balance) FILTER (WHERE account_type='equity'), 0) as total_equity,
      COALESCE(SUM(balance) FILTER (WHERE account_type='revenue'), 0) as total_revenue,
      COALESCE(SUM(balance) FILTER (WHERE account_type='expense'), 0) as total_expenses
    FROM financial_accounts WHERE is_active = true`),
    q(`SELECT COALESCE(SUM(current_balance), 0) as total FROM bank_accounts WHERE is_active = true`),
    q(`SELECT COALESCE(SUM(balance_due), 0) as total, COUNT(*) as count FROM accounts_receivable WHERE status IN ('open','partial','overdue')`),
    q(`SELECT COALESCE(SUM(balance_due), 0) as total, COUNT(*) as count FROM accounts_payable WHERE status IN ('open','partial','overdue')`),
    q(`SELECT COALESCE(SUM(balance_due), 0) as total FROM tax_records WHERE status NOT IN ('paid','cancelled')`),
    q(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='posted') as posted FROM journal_entries`),
    q(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE status NOT IN ('cancelled','rejected') AND expense_date >= DATE_TRUNC('month', CURRENT_DATE)`),
    q(`SELECT COUNT(*) as total, COALESCE(SUM(budgeted_amount::numeric), 0) as budgeted, COALESCE(SUM(actual_amount::numeric), 0) as actual FROM budgets WHERE fiscal_year = EXTRACT(YEAR FROM CURRENT_DATE)`)
  ]);

  const bs = balanceSheet[0] || {};
  const netIncome = Number((bs as any).total_revenue || 0) - Number((bs as any).total_expenses || 0);

  res.json({
    totalAssets: Number((bs as any).total_assets || 0) + Number((cashTotal[0] as any)?.total || 0),
    totalLiabilities: Number((bs as any).total_liabilities || 0) + Number((apTotal[0] as any)?.total || 0),
    totalEquity: Number((bs as any).total_equity || 0),
    totalRevenue: Number((bs as any).total_revenue || 0),
    totalExpenses: Number((bs as any).total_expenses || 0),
    netIncome,
    cashBalance: Number((cashTotal[0] as any)?.total || 0),
    receivables: Number((arTotal[0] as any)?.total || 0),
    receivablesCount: Number((arTotal[0] as any)?.count || 0),
    payables: Number((apTotal[0] as any)?.total || 0),
    payablesCount: Number((apTotal[0] as any)?.count || 0),
    taxLiabilities: Number((taxTotal[0] as any)?.total || 0),
    journalEntries: Number((jeStats[0] as any)?.total || 0),
    postedEntries: Number((jeStats[0] as any)?.posted || 0),
    monthlyExpenses: Number((expStats[0] as any)?.total || 0),
    budgetTotal: Number((budgetStats[0] as any)?.budgeted || 0),
    budgetActual: Number((budgetStats[0] as any)?.actual || 0),
    budgetCount: Number((budgetStats[0] as any)?.total || 0),
  });
});

export default router;
