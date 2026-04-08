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
  catch (e: any) { console.error("Finance-New-Pages query error:", e.message); return []; }
}

async function ensureTable(tableName: string, createSql: string) {
  try {
    await db.execute(sql.raw(`SELECT 1 FROM ${tableName} LIMIT 1`));
  } catch {
    await db.execute(sql.raw(createSql));
  }
}

function s(v: any): string {
  if (v === undefined || v === null || v === "") return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function n(v: any, fallback = 0): number {
  const parsed = Number(v);
  return isNaN(parsed) ? fallback : parsed;
}

function safeInt(v: any, fallback = 0): number {
  const parsed = parseInt(String(v));
  return isNaN(parsed) ? fallback : parsed;
}

function safeDate(v: any): string {
  if (!v) return "NULL";
  const dateStr = String(v).replace(/[^0-9-]/g, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return `'${dateStr}'`;
  return "NULL";
}

function safePagination(limitStr: any, offsetStr: any) {
  const safeLimit = Math.min(Math.max(safeInt(limitStr, 200), 1), 1000);
  const safeOffset = Math.max(safeInt(offsetStr, 0), 0);
  return { safeLimit, safeOffset };
}

function safeId(v: any): number {
  return Math.max(safeInt(v, 0), 0);
}


async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

// ========== JOURNAL TRANSACTIONS ==========
router.get("/finance/journal-transactions", async (req, res) => {
  const { transaction_type, status, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (transaction_type) where += ` AND transaction_type = ${s(transaction_type)}`;
  if (status) where += ` AND status = ${s(status)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM journal_transactions ${where} ORDER BY transaction_date DESC, id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM journal_transactions ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/journal-transactions/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM journal_transactions WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/journal-transactions", async (req, res) => {
  const d = req.body;
  const num = await nextNum("JT-", "journal_transactions", "transaction_number");
  const year = new Date().getFullYear();
  await q(`INSERT INTO journal_transactions (transaction_number, transaction_date, account_number, account_name, transaction_type, debit_amount, credit_amount, description, reference, journal_entry_ref, fiscal_year, fiscal_period, status, notes)
    VALUES ('${num}', ${safeDate(d.transaction_date) !== "NULL" ? safeDate(d.transaction_date) : "CURRENT_DATE"}, ${s(d.account_number)}, ${s(d.account_name)}, ${s(d.transaction_type || "debit")}, ${n(d.debit_amount)}, ${n(d.credit_amount)}, ${s(d.description)}, ${s(d.reference)}, ${s(d.journal_entry_ref)}, ${safeInt(d.fiscal_year, year)}, ${safeInt(d.fiscal_period, new Date().getMonth()+1)}, ${s(d.status || "posted")}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM journal_transactions WHERE transaction_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/journal-transactions/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.transaction_date) sets.push(`transaction_date=${safeDate(d.transaction_date)}`);
  if (d.account_number !== undefined) sets.push(`account_number=${s(d.account_number)}`);
  if (d.account_name !== undefined) sets.push(`account_name=${s(d.account_name)}`);
  if (d.transaction_type) sets.push(`transaction_type=${s(d.transaction_type)}`);
  if (d.debit_amount !== undefined) sets.push(`debit_amount=${n(d.debit_amount)}`);
  if (d.credit_amount !== undefined) sets.push(`credit_amount=${n(d.credit_amount)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.reference !== undefined) sets.push(`reference=${s(d.reference)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE journal_transactions SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM journal_transactions WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/journal-transactions/:id", async (req, res) => {
  await q(`DELETE FROM journal_transactions WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== JOURNAL REPORT ==========
router.get("/finance/journal-report", async (req, res) => {
  const { status, fiscal_year, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  if (fiscal_year) where += ` AND fiscal_year = ${safeInt(fiscal_year)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM journal_reports ${where} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM journal_reports ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/journal-report/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM journal_reports WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/journal-report", async (req, res) => {
  const d = req.body;
  const num = await nextNum("JR-", "journal_reports", "report_number");
  const user = (req as any).user;
  const year = new Date().getFullYear();
  await q(`INSERT INTO journal_reports (report_number, report_name, period_start, period_end, fiscal_year, fiscal_period, total_debit, total_credit, net_balance, entry_count, status, generated_by, notes)
    VALUES ('${num}', ${s(d.report_name)}, ${safeDate(d.period_start)}, ${safeDate(d.period_end)}, ${safeInt(d.fiscal_year, year)}, ${safeInt(d.fiscal_period, new Date().getMonth()+1)}, ${n(d.total_debit)}, ${n(d.total_credit)}, ${n(d.net_balance)}, ${safeInt(d.entry_count)}, ${s(d.status || "draft")}, ${s(user?.fullName || d.generated_by)}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM journal_reports WHERE report_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/journal-report/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.report_name !== undefined) sets.push(`report_name=${s(d.report_name)}`);
  if (d.period_start) sets.push(`period_start=${safeDate(d.period_start)}`);
  if (d.period_end) sets.push(`period_end=${safeDate(d.period_end)}`);
  if (d.fiscal_year !== undefined) sets.push(`fiscal_year=${safeInt(d.fiscal_year)}`);
  if (d.total_debit !== undefined) sets.push(`total_debit=${n(d.total_debit)}`);
  if (d.total_credit !== undefined) sets.push(`total_credit=${n(d.total_credit)}`);
  if (d.net_balance !== undefined) sets.push(`net_balance=${n(d.net_balance)}`);
  if (d.entry_count !== undefined) sets.push(`entry_count=${safeInt(d.entry_count)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE journal_reports SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM journal_reports WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/journal-report/:id", async (req, res) => {
  await q(`DELETE FROM journal_reports WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== AUDIT CONTROL ==========
router.get("/finance/audit-control", async (req, res) => {
  const { status, severity, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  if (severity) where += ` AND severity = ${s(severity)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM audit_controls ${where} ORDER BY control_date DESC, id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM audit_controls ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/audit-control/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM audit_controls WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/audit-control", async (req, res) => {
  const d = req.body;
  const num = await nextNum("AC-", "audit_controls", "control_number");
  const variance = n(d.actual_balance) - n(d.expected_balance);
  await q(`INSERT INTO audit_controls (control_number, control_date, control_type, account_number, account_name, expected_balance, actual_balance, variance, status, severity, assigned_to, notes)
    VALUES ('${num}', ${safeDate(d.control_date) !== "NULL" ? safeDate(d.control_date) : "CURRENT_DATE"}, ${s(d.control_type || "balance_check")}, ${s(d.account_number)}, ${s(d.account_name)}, ${n(d.expected_balance)}, ${n(d.actual_balance)}, ${variance}, ${s(d.status || "open")}, ${s(d.severity || "low")}, ${s(d.assigned_to)}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM audit_controls WHERE control_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/audit-control/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const existing = await q(`SELECT * FROM audit_controls WHERE id=${id}`);
  if (existing.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  const cur = existing[0] as any;
  const sets: string[] = [];
  if (d.control_date) sets.push(`control_date=${safeDate(d.control_date)}`);
  if (d.control_type) sets.push(`control_type=${s(d.control_type)}`);
  if (d.account_number !== undefined) sets.push(`account_number=${s(d.account_number)}`);
  if (d.account_name !== undefined) sets.push(`account_name=${s(d.account_name)}`);
  if (d.expected_balance !== undefined) sets.push(`expected_balance=${n(d.expected_balance)}`);
  if (d.actual_balance !== undefined) sets.push(`actual_balance=${n(d.actual_balance)}`);
  if (d.expected_balance !== undefined || d.actual_balance !== undefined) {
    const eb = d.expected_balance !== undefined ? n(d.expected_balance) : n(cur.expected_balance);
    const ab = d.actual_balance !== undefined ? n(d.actual_balance) : n(cur.actual_balance);
    sets.push(`variance=${ab - eb}`);
  }
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.severity) sets.push(`severity=${s(d.severity)}`);
  if (d.assigned_to !== undefined) sets.push(`assigned_to=${s(d.assigned_to)}`);
  if (d.resolved_date) sets.push(`resolved_date=${safeDate(d.resolved_date)}`);
  if (d.resolution_notes !== undefined) sets.push(`resolution_notes=${s(d.resolution_notes)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE audit_controls SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM audit_controls WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/audit-control/:id", async (req, res) => {
  await q(`DELETE FROM audit_controls WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== WORKING FILES ==========
router.get("/finance/working-files", async (req, res) => {
  const { status, fiscal_year, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  if (fiscal_year) where += ` AND fiscal_year = ${safeInt(fiscal_year)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM working_files ${where} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM working_files ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/working-files/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM working_files WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/working-files", async (req, res) => {
  const d = req.body;
  const num = await nextNum("WF-", "working_files", "file_number");
  const year = new Date().getFullYear();
  await q(`INSERT INTO working_files (file_number, file_name, file_type, fiscal_year, fiscal_period, accountant, reviewer, status, priority, due_date, description, notes)
    VALUES ('${num}', ${s(d.file_name)}, ${s(d.file_type || "working_paper")}, ${safeInt(d.fiscal_year, year)}, ${safeInt(d.fiscal_period, new Date().getMonth()+1)}, ${s(d.accountant)}, ${s(d.reviewer)}, ${s(d.status || "in_progress")}, ${s(d.priority || "normal")}, ${safeDate(d.due_date)}, ${s(d.description)}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM working_files WHERE file_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/working-files/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.file_name !== undefined) sets.push(`file_name=${s(d.file_name)}`);
  if (d.file_type) sets.push(`file_type=${s(d.file_type)}`);
  if (d.fiscal_year !== undefined) sets.push(`fiscal_year=${safeInt(d.fiscal_year)}`);
  if (d.accountant !== undefined) sets.push(`accountant=${s(d.accountant)}`);
  if (d.reviewer !== undefined) sets.push(`reviewer=${s(d.reviewer)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.priority) sets.push(`priority=${s(d.priority)}`);
  if (d.due_date !== undefined) sets.push(`due_date=${safeDate(d.due_date)}`);
  if (d.completed_date !== undefined) sets.push(`completed_date=${safeDate(d.completed_date)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE working_files SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM working_files WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/working-files/:id", async (req, res) => {
  await q(`DELETE FROM working_files WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== ANNUAL REPORT ==========
router.get("/finance/annual-report", async (req, res) => {
  const { status, fiscal_year, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  if (fiscal_year) where += ` AND fiscal_year = ${safeInt(fiscal_year)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM annual_reports ${where} ORDER BY fiscal_year DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM annual_reports ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/annual-report/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM annual_reports WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/annual-report", async (req, res) => {
  const d = req.body;
  const num = await nextNum("AR-", "annual_reports", "report_number");
  const year = new Date().getFullYear();
  const netIncome = n(d.total_revenue) - n(d.total_expenses);
  await q(`INSERT INTO annual_reports (report_number, fiscal_year, total_assets, total_liabilities, total_equity, total_revenue, total_expenses, net_income, operating_cash_flow, status, approved_by, notes)
    VALUES ('${num}', ${safeInt(d.fiscal_year, year)}, ${n(d.total_assets)}, ${n(d.total_liabilities)}, ${n(d.total_equity)}, ${n(d.total_revenue)}, ${n(d.total_expenses)}, ${netIncome}, ${n(d.operating_cash_flow)}, ${s(d.status || "draft")}, ${s(d.approved_by)}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM annual_reports WHERE report_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/annual-report/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const existing = await q(`SELECT * FROM annual_reports WHERE id=${id}`);
  if (existing.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  const cur = existing[0] as any;
  const sets: string[] = [];
  if (d.fiscal_year !== undefined) sets.push(`fiscal_year=${safeInt(d.fiscal_year)}`);
  if (d.total_assets !== undefined) sets.push(`total_assets=${n(d.total_assets)}`);
  if (d.total_liabilities !== undefined) sets.push(`total_liabilities=${n(d.total_liabilities)}`);
  if (d.total_equity !== undefined) sets.push(`total_equity=${n(d.total_equity)}`);
  if (d.total_revenue !== undefined) sets.push(`total_revenue=${n(d.total_revenue)}`);
  if (d.total_expenses !== undefined) sets.push(`total_expenses=${n(d.total_expenses)}`);
  if (d.total_revenue !== undefined || d.total_expenses !== undefined) {
    const rev = d.total_revenue !== undefined ? n(d.total_revenue) : n(cur.total_revenue);
    const exp = d.total_expenses !== undefined ? n(d.total_expenses) : n(cur.total_expenses);
    sets.push(`net_income=${rev - exp}`);
  }
  if (d.operating_cash_flow !== undefined) sets.push(`operating_cash_flow=${n(d.operating_cash_flow)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.approved_by !== undefined) sets.push(`approved_by=${s(d.approved_by)}`);
  if (d.approved_date) sets.push(`approved_date=${safeDate(d.approved_date)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE annual_reports SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM annual_reports WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/annual-report/:id", async (req, res) => {
  await q(`DELETE FROM annual_reports WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== ACCOUNTING INVENTORY ==========
router.get("/finance/accounting-inventory", async (req, res) => {
  const { status, category, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  if (category) where += ` AND category = ${s(category)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM accounting_inventory ${where} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM accounting_inventory ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/accounting-inventory/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM accounting_inventory WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/accounting-inventory", async (req, res) => {
  const d = req.body;
  const num = await nextNum("AI-", "accounting_inventory", "item_number");
  const qty = n(d.quantity);
  const cost = n(d.cost_per_unit);
  const mkt = n(d.market_value_per_unit);
  await q(`INSERT INTO accounting_inventory (item_number, item_name, category, quantity, unit, cost_per_unit, market_value_per_unit, total_cost, total_market_value, provision_amount, valuation_method, last_count_date, status, notes)
    VALUES ('${num}', ${s(d.item_name)}, ${s(d.category)}, ${qty}, ${s(d.unit || "יחידה")}, ${cost}, ${mkt}, ${qty*cost}, ${qty*mkt}, ${n(d.provision_amount)}, ${s(d.valuation_method || "fifo")}, ${safeDate(d.last_count_date) !== "NULL" ? safeDate(d.last_count_date) : "CURRENT_DATE"}, ${s(d.status || "active")}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM accounting_inventory WHERE item_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/accounting-inventory/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const existing = await q(`SELECT * FROM accounting_inventory WHERE id=${id}`);
  if (existing.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  const cur = existing[0] as any;
  const sets: string[] = [];
  if (d.item_name !== undefined) sets.push(`item_name=${s(d.item_name)}`);
  if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
  if (d.quantity !== undefined) sets.push(`quantity=${n(d.quantity)}`);
  if (d.unit !== undefined) sets.push(`unit=${s(d.unit)}`);
  if (d.cost_per_unit !== undefined) sets.push(`cost_per_unit=${n(d.cost_per_unit)}`);
  if (d.market_value_per_unit !== undefined) sets.push(`market_value_per_unit=${n(d.market_value_per_unit)}`);
  if (d.quantity !== undefined || d.cost_per_unit !== undefined) {
    const qty = d.quantity !== undefined ? n(d.quantity) : n(cur.quantity);
    const cpu = d.cost_per_unit !== undefined ? n(d.cost_per_unit) : n(cur.cost_per_unit);
    sets.push(`total_cost=${qty * cpu}`);
  }
  if (d.quantity !== undefined || d.market_value_per_unit !== undefined) {
    const qty = d.quantity !== undefined ? n(d.quantity) : n(cur.quantity);
    const mvpu = d.market_value_per_unit !== undefined ? n(d.market_value_per_unit) : n(cur.market_value_per_unit);
    sets.push(`total_market_value=${qty * mvpu}`);
  }
  if (d.provision_amount !== undefined) sets.push(`provision_amount=${n(d.provision_amount)}`);
  if (d.valuation_method) sets.push(`valuation_method=${s(d.valuation_method)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE accounting_inventory SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM accounting_inventory WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/accounting-inventory/:id", async (req, res) => {
  await q(`DELETE FROM accounting_inventory WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== DEPRECIATION SCHEDULE ==========
router.get("/finance/depreciation-schedule", async (req, res) => {
  const { status, depreciation_method, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  if (depreciation_method) where += ` AND depreciation_method = ${s(depreciation_method)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM depreciation_schedules ${where} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM depreciation_schedules ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/depreciation-schedule/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM depreciation_schedules WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/depreciation-schedule", async (req, res) => {
  const d = req.body;
  const num = await nextNum("DS-", "depreciation_schedules", "schedule_number");
  const year = new Date().getFullYear();
  const price = n(d.purchase_price);
  const residual = n(d.residual_value);
  const life = safeInt(d.useful_life_years, 5);
  const annualDep = life > 0 ? (price - residual) / life : 0;
  const accDep = n(d.accumulated_depreciation);
  const bookValue = price - accDep;
  await q(`INSERT INTO depreciation_schedules (schedule_number, asset_name, asset_number, purchase_date, purchase_price, residual_value, useful_life_years, depreciation_method, annual_depreciation, accumulated_depreciation, current_book_value, fiscal_year, period_depreciation, status, notes)
    VALUES ('${num}', ${s(d.asset_name)}, ${s(d.asset_number)}, ${safeDate(d.purchase_date)}, ${price}, ${residual}, ${life}, ${s(d.depreciation_method || "straight_line")}, ${annualDep.toFixed(2)}, ${accDep}, ${bookValue}, ${safeInt(d.fiscal_year, year)}, ${(annualDep/12).toFixed(2)}, ${s(d.status || "active")}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM depreciation_schedules WHERE schedule_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/depreciation-schedule/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.asset_name !== undefined) sets.push(`asset_name=${s(d.asset_name)}`);
  if (d.asset_number !== undefined) sets.push(`asset_number=${s(d.asset_number)}`);
  if (d.purchase_date) sets.push(`purchase_date=${safeDate(d.purchase_date)}`);
  if (d.purchase_price !== undefined) sets.push(`purchase_price=${n(d.purchase_price)}`);
  if (d.residual_value !== undefined) sets.push(`residual_value=${n(d.residual_value)}`);
  if (d.useful_life_years !== undefined) sets.push(`useful_life_years=${safeInt(d.useful_life_years)}`);
  if (d.depreciation_method) sets.push(`depreciation_method=${s(d.depreciation_method)}`);
  if (d.accumulated_depreciation !== undefined) sets.push(`accumulated_depreciation=${n(d.accumulated_depreciation)}`);
  if (d.current_book_value !== undefined) sets.push(`current_book_value=${n(d.current_book_value)}`);
  if (d.annual_depreciation !== undefined) sets.push(`annual_depreciation=${n(d.annual_depreciation)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE depreciation_schedules SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM depreciation_schedules WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/depreciation-schedule/:id", async (req, res) => {
  await q(`DELETE FROM depreciation_schedules WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== LOAN ANALYSIS ==========
router.get("/finance/loan-analysis", async (req, res) => {
  const { status, loan_type, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  if (loan_type) where += ` AND loan_type = ${s(loan_type)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM loan_analyses ${where} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM loan_analyses ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/loan-analysis/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM loan_analyses WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/loan-analysis", async (req, res) => {
  const d = req.body;
  const num = await nextNum("LA-", "loan_analyses", "loan_number");
  const principal = n(d.principal_amount);
  const rate = n(d.interest_rate);
  let monthly = n(d.monthly_payment);
  if (!d.monthly_payment && principal > 0 && rate > 0) {
    const mr = rate / 12 / 100;
    const termMonths = safeInt(d.term_months, 60);
    monthly = (principal * mr) / (1 - Math.pow(1 + mr, -termMonths));
  }
  await q(`INSERT INTO loan_analyses (loan_number, loan_name, lender, borrower, principal_amount, interest_rate, loan_date, maturity_date, payment_frequency, monthly_payment, outstanding_balance, payments_made, loan_type, status, notes)
    VALUES ('${num}', ${s(d.loan_name)}, ${s(d.lender)}, ${s(d.borrower)}, ${principal}, ${rate}, ${safeDate(d.loan_date)}, ${safeDate(d.maturity_date)}, ${s(d.payment_frequency || "monthly")}, ${monthly.toFixed(2)}, ${n(d.outstanding_balance, principal)}, ${safeInt(d.payments_made)}, ${s(d.loan_type || "bank_loan")}, ${s(d.status || "active")}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM loan_analyses WHERE loan_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/loan-analysis/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.loan_name !== undefined) sets.push(`loan_name=${s(d.loan_name)}`);
  if (d.lender !== undefined) sets.push(`lender=${s(d.lender)}`);
  if (d.borrower !== undefined) sets.push(`borrower=${s(d.borrower)}`);
  if (d.principal_amount !== undefined) sets.push(`principal_amount=${n(d.principal_amount)}`);
  if (d.interest_rate !== undefined) sets.push(`interest_rate=${n(d.interest_rate)}`);
  if (d.loan_date) sets.push(`loan_date=${safeDate(d.loan_date)}`);
  if (d.maturity_date) sets.push(`maturity_date=${safeDate(d.maturity_date)}`);
  if (d.monthly_payment !== undefined) sets.push(`monthly_payment=${n(d.monthly_payment)}`);
  if (d.outstanding_balance !== undefined) sets.push(`outstanding_balance=${n(d.outstanding_balance)}`);
  if (d.payments_made !== undefined) sets.push(`payments_made=${safeInt(d.payments_made)}`);
  if (d.loan_type) sets.push(`loan_type=${s(d.loan_type)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE loan_analyses SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM loan_analyses WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/loan-analysis/:id", async (req, res) => {
  await q(`DELETE FROM loan_analyses WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== ADJUSTING ENTRIES ==========
router.get("/finance/adjusting-entries", async (req, res) => {
  const { status, entry_type, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  if (entry_type) where += ` AND entry_type = ${s(entry_type)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM adjusting_entries ${where} ORDER BY entry_date DESC, id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM adjusting_entries ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/adjusting-entries/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM adjusting_entries WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/adjusting-entries", async (req, res) => {
  const d = req.body;
  const num = await nextNum("AE-", "adjusting_entries", "entry_number");
  const year = new Date().getFullYear();
  await q(`INSERT INTO adjusting_entries (entry_number, entry_date, entry_type, account_number, account_name, debit_amount, credit_amount, description, period_start, period_end, fiscal_year, fiscal_period, status, approved_by, notes)
    VALUES ('${num}', ${safeDate(d.entry_date) !== "NULL" ? safeDate(d.entry_date) : "CURRENT_DATE"}, ${s(d.entry_type || "accrual")}, ${s(d.account_number)}, ${s(d.account_name)}, ${n(d.debit_amount)}, ${n(d.credit_amount)}, ${s(d.description)}, ${safeDate(d.period_start)}, ${safeDate(d.period_end)}, ${safeInt(d.fiscal_year, year)}, ${safeInt(d.fiscal_period, new Date().getMonth()+1)}, ${s(d.status || "draft")}, ${s(d.approved_by)}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM adjusting_entries WHERE entry_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/adjusting-entries/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.entry_date) sets.push(`entry_date=${safeDate(d.entry_date)}`);
  if (d.entry_type) sets.push(`entry_type=${s(d.entry_type)}`);
  if (d.account_number !== undefined) sets.push(`account_number=${s(d.account_number)}`);
  if (d.account_name !== undefined) sets.push(`account_name=${s(d.account_name)}`);
  if (d.debit_amount !== undefined) sets.push(`debit_amount=${n(d.debit_amount)}`);
  if (d.credit_amount !== undefined) sets.push(`credit_amount=${n(d.credit_amount)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.period_start) sets.push(`period_start=${safeDate(d.period_start)}`);
  if (d.period_end) sets.push(`period_end=${safeDate(d.period_end)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.approved_by !== undefined) sets.push(`approved_by=${s(d.approved_by)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE adjusting_entries SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM adjusting_entries WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/adjusting-entries/:id", async (req, res) => {
  await q(`DELETE FROM adjusting_entries WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== DEFERRED REVENUE ==========
router.get("/finance/deferred-revenue", async (req, res) => {
  const { status, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM deferred_revenue ${where} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM deferred_revenue ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/deferred-revenue/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM deferred_revenue WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/deferred-revenue", async (req, res) => {
  const d = req.body;
  const num = await nextNum("DR-", "deferred_revenue", "record_number");
  const total = n(d.total_amount);
  const recognized = n(d.recognized_amount);
  const remaining = total - recognized;
  await q(`INSERT INTO deferred_revenue (record_number, customer_name, description, total_amount, recognized_amount, remaining_amount, recognition_start, recognition_end, recognition_method, monthly_recognition, status, gl_account, notes)
    VALUES ('${num}', ${s(d.customer_name)}, ${s(d.description)}, ${total}, ${recognized}, ${remaining}, ${safeDate(d.recognition_start)}, ${safeDate(d.recognition_end)}, ${s(d.recognition_method || "straight_line")}, ${n(d.monthly_recognition)}, ${s(d.status || "active")}, ${s(d.gl_account)}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM deferred_revenue WHERE record_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/deferred-revenue/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const existing = await q(`SELECT * FROM deferred_revenue WHERE id=${id}`);
  if (existing.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  const cur = existing[0] as any;
  const sets: string[] = [];
  if (d.customer_name !== undefined) sets.push(`customer_name=${s(d.customer_name)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.total_amount !== undefined) sets.push(`total_amount=${n(d.total_amount)}`);
  if (d.recognized_amount !== undefined) sets.push(`recognized_amount=${n(d.recognized_amount)}`);
  if (d.total_amount !== undefined || d.recognized_amount !== undefined) {
    const ta = d.total_amount !== undefined ? n(d.total_amount) : n(cur.total_amount);
    const ra = d.recognized_amount !== undefined ? n(d.recognized_amount) : n(cur.recognized_amount);
    sets.push(`remaining_amount=${ta - ra}`);
  }
  if (d.recognition_start) sets.push(`recognition_start=${safeDate(d.recognition_start)}`);
  if (d.recognition_end) sets.push(`recognition_end=${safeDate(d.recognition_end)}`);
  if (d.monthly_recognition !== undefined) sets.push(`monthly_recognition=${n(d.monthly_recognition)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.gl_account !== undefined) sets.push(`gl_account=${s(d.gl_account)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE deferred_revenue SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM deferred_revenue WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/deferred-revenue/:id", async (req, res) => {
  await q(`DELETE FROM deferred_revenue WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== DEFERRED EXPENSES ==========
router.get("/finance/deferred-expenses", async (req, res) => {
  const { status, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM deferred_expenses ${where} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM deferred_expenses ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/deferred-expenses/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM deferred_expenses WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/deferred-expenses", async (req, res) => {
  const d = req.body;
  const num = await nextNum("DE-", "deferred_expenses", "record_number");
  const total = n(d.total_amount);
  const recognized = n(d.recognized_amount);
  const remaining = total - recognized;
  await q(`INSERT INTO deferred_expenses (record_number, vendor_name, description, total_amount, recognized_amount, remaining_amount, recognition_start, recognition_end, recognition_method, monthly_recognition, status, gl_account, notes)
    VALUES ('${num}', ${s(d.vendor_name)}, ${s(d.description)}, ${total}, ${recognized}, ${remaining}, ${safeDate(d.recognition_start)}, ${safeDate(d.recognition_end)}, ${s(d.recognition_method || "straight_line")}, ${n(d.monthly_recognition)}, ${s(d.status || "active")}, ${s(d.gl_account)}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM deferred_expenses WHERE record_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/deferred-expenses/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const existing = await q(`SELECT * FROM deferred_expenses WHERE id=${id}`);
  if (existing.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  const cur = existing[0] as any;
  const sets: string[] = [];
  if (d.vendor_name !== undefined) sets.push(`vendor_name=${s(d.vendor_name)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.total_amount !== undefined) sets.push(`total_amount=${n(d.total_amount)}`);
  if (d.recognized_amount !== undefined) sets.push(`recognized_amount=${n(d.recognized_amount)}`);
  if (d.total_amount !== undefined || d.recognized_amount !== undefined) {
    const ta = d.total_amount !== undefined ? n(d.total_amount) : n(cur.total_amount);
    const ra = d.recognized_amount !== undefined ? n(d.recognized_amount) : n(cur.recognized_amount);
    sets.push(`remaining_amount=${ta - ra}`);
  }
  if (d.recognition_start) sets.push(`recognition_start=${safeDate(d.recognition_start)}`);
  if (d.recognition_end) sets.push(`recognition_end=${safeDate(d.recognition_end)}`);
  if (d.monthly_recognition !== undefined) sets.push(`monthly_recognition=${n(d.monthly_recognition)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.gl_account !== undefined) sets.push(`gl_account=${s(d.gl_account)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE deferred_expenses SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM deferred_expenses WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/deferred-expenses/:id", async (req, res) => {
  await q(`DELETE FROM deferred_expenses WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== REGISTRATIONS ==========
router.get("/finance/registrations", async (req, res) => {
  const { status, registration_type, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = ${s(status)}`;
  if (registration_type) where += ` AND registration_type = ${s(registration_type)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM finance_registrations ${where} ORDER BY registration_date DESC, id DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM finance_registrations ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/registrations/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM finance_registrations WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/registrations", async (req, res) => {
  const d = req.body;
  const num = await nextNum("RG-", "finance_registrations", "registration_number");
  await q(`INSERT INTO finance_registrations (registration_number, registration_date, registration_type, entity_type, entity_name, source, amount, description, reference, status, notes)
    VALUES ('${num}', ${safeDate(d.registration_date) !== "NULL" ? safeDate(d.registration_date) : "CURRENT_DATE"}, ${s(d.registration_type || "general")}, ${s(d.entity_type)}, ${s(d.entity_name)}, ${s(d.source)}, ${n(d.amount)}, ${s(d.description)}, ${s(d.reference)}, ${s(d.status || "active")}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM finance_registrations WHERE registration_number='${num}'`);
  res.json(rows[0]);
});

router.put("/finance/registrations/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.registration_date) sets.push(`registration_date=${safeDate(d.registration_date)}`);
  if (d.registration_type) sets.push(`registration_type=${s(d.registration_type)}`);
  if (d.entity_type !== undefined) sets.push(`entity_type=${s(d.entity_type)}`);
  if (d.entity_name !== undefined) sets.push(`entity_name=${s(d.entity_name)}`);
  if (d.source !== undefined) sets.push(`source=${s(d.source)}`);
  if (d.amount !== undefined) sets.push(`amount=${n(d.amount)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.reference !== undefined) sets.push(`reference=${s(d.reference)}`);
  if (d.status) sets.push(`status=${s(d.status)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE finance_registrations SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM finance_registrations WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/registrations/:id", async (req, res) => {
  await q(`DELETE FROM finance_registrations WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

// ========== CHANGE TRACKING ==========
router.get("/finance/change-tracking", async (req, res) => {
  const { entity_type, action, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (entity_type) where += ` AND entity_type = ${s(entity_type)}`;
  if (action) where += ` AND action = ${s(action)}`;
  const { safeLimit, safeOffset } = safePagination(limit, offset);
  const rows = await q(`SELECT * FROM finance_change_tracking ${where} ORDER BY change_date DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`);
  const countResult = await q(`SELECT COUNT(*) as total FROM finance_change_tracking ${where}`);
  res.json({ data: rows, total: Number((countResult[0] as any)?.total || 0) });
});

router.get("/finance/change-tracking/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const rows = await q(`SELECT * FROM finance_change_tracking WHERE id=${id}`);
  if (rows.length === 0) { res.status(404).json({ error: "רשומה לא נמצאה" }); return; }
  res.json(rows[0]);
});

router.post("/finance/change-tracking", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  await q(`INSERT INTO finance_change_tracking (entity_type, entity_id, entity_name, field_changed, old_value, new_value, changed_by, change_reason, ip_address, action, notes)
    VALUES (${s(d.entity_type)}, ${d.entity_id ? safeInt(d.entity_id) : "NULL"}, ${s(d.entity_name)}, ${s(d.field_changed)}, ${s(d.old_value)}, ${s(d.new_value)}, ${s(d.changed_by || user?.fullName)}, ${s(d.change_reason)}, ${s(d.ip_address)}, ${s(d.action || "update")}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM finance_change_tracking ORDER BY id DESC LIMIT 1`);
  res.json(rows[0]);
});

router.put("/finance/change-tracking/:id", async (req, res) => {
  const id = safeId(req.params.id);
  const d = req.body;
  const sets: string[] = [];
  if (d.entity_type !== undefined) sets.push(`entity_type=${s(d.entity_type)}`);
  if (d.entity_id !== undefined) sets.push(`entity_id=${safeInt(d.entity_id)}`);
  if (d.entity_name !== undefined) sets.push(`entity_name=${s(d.entity_name)}`);
  if (d.field_changed !== undefined) sets.push(`field_changed=${s(d.field_changed)}`);
  if (d.old_value !== undefined) sets.push(`old_value=${s(d.old_value)}`);
  if (d.new_value !== undefined) sets.push(`new_value=${s(d.new_value)}`);
  if (d.changed_by !== undefined) sets.push(`changed_by=${s(d.changed_by)}`);
  if (d.change_reason !== undefined) sets.push(`change_reason=${s(d.change_reason)}`);
  if (d.action !== undefined) sets.push(`action=${s(d.action)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (sets.length === 0) { res.json({ success: true }); return; }
  await q(`UPDATE finance_change_tracking SET ${sets.join(",")} WHERE id=${id}`);
  const rows = await q(`SELECT * FROM finance_change_tracking WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/finance/change-tracking/:id", async (req, res) => {
  await q(`DELETE FROM finance_change_tracking WHERE id=${safeId(req.params.id)}`);
  res.json({ success: true });
});

export default router;
