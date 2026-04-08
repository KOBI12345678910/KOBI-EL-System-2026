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
  catch (e: any) { console.error("Finance2 query error:", e.message); return []; }
}

async function ensureTable(tableName: string, createSql: string) {
  try {
    await db.execute(sql.raw(`SELECT 1 FROM ${tableName} LIMIT 1`));
  } catch {
    try { await db.execute(sql.raw(createSql)); } catch (e: any) { console.error(`Finance2 ensureTable ${tableName}:`, e.message); }
  }
}

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

// ========== COST CENTERS ==========
router.get("/cost-centers", async (_req, res) => {
  res.json(await q(`SELECT * FROM cost_centers ORDER BY center_number ASC`));
});

router.get("/cost-centers/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COALESCE(SUM(budget_annual), 0) as total_budget,
    COALESCE(SUM(budget_used), 0) as total_used,
    COALESCE(SUM(budget_remaining), 0) as total_remaining,
    COALESCE(SUM(revenue), 0) as total_revenue,
    COALESCE(SUM(total_costs), 0) as total_costs_sum,
    COALESCE(SUM(profit_contribution), 0) as total_profit
  FROM cost_centers WHERE status='active'`);
  res.json(rows[0] || {});
});

router.post("/cost-centers", async (req, res) => {
  const d = req.body;
  const num = await nextNum("CC-", "cost_centers", "center_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO cost_centers (center_number, center_name, center_type, department, manager_name, status, budget_annual, budget_used, cost_allocation_method, allocation_base, allocation_rate, revenue, direct_costs, indirect_costs, headcount, area_sqm, description, notes)
    VALUES ('${num}', ${s(d.centerName)}, '${d.centerType||'production'}', ${s(d.department)}, ${s(d.managerName)}, '${d.status||'active'}', ${d.budgetAnnual||0}, ${d.budgetUsed||0}, '${d.costAllocationMethod||'direct'}', ${s(d.allocationBase)}, ${d.allocationRate||0}, ${d.revenue||0}, ${d.directCosts||0}, ${d.indirectCosts||0}, ${d.headcount||0}, ${d.areaSqm||0}, ${s(d.description)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM cost_centers WHERE center_number='${num}'`))[0]);
});

router.put("/cost-centers/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.centerName) sets.push(`center_name=${s(d.centerName)}`);
  if (d.centerType) sets.push(`center_type='${d.centerType}'`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.managerName !== undefined) sets.push(`manager_name=${s(d.managerName)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.budgetAnnual !== undefined) sets.push(`budget_annual=${d.budgetAnnual}`);
  if (d.budgetUsed !== undefined) sets.push(`budget_used=${d.budgetUsed}`);
  if (d.costAllocationMethod) sets.push(`cost_allocation_method='${d.costAllocationMethod}'`);
  if (d.revenue !== undefined) sets.push(`revenue=${d.revenue}`);
  if (d.directCosts !== undefined) sets.push(`direct_costs=${d.directCosts}`);
  if (d.indirectCosts !== undefined) sets.push(`indirect_costs=${d.indirectCosts}`);
  if (d.headcount !== undefined) sets.push(`headcount=${d.headcount}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cost_centers SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM cost_centers WHERE id=${req.params.id}`))[0]);
});

router.delete("/cost-centers/:id", async (req, res) => {
  await q(`UPDATE cost_centers SET status='closed', updated_at=NOW() WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== CUSTOMER INVOICES ==========
// J-02: Hebrew error messages
router.get("/customer-invoices", async (_req, res) => {
  try {
    const result = await q(`SELECT * FROM customer_invoices WHERE deleted_at IS NULL ORDER BY invoice_date DESC, id DESC`);
    res.json(result);
  } catch (error: any) {
    console.error("Invoices fetch error:", error);
    res.status(500).json({ error: "אירעה שגיאה בטעינת החשבוניות" });
  }
});

router.get("/customer-invoices/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='sent') as sent,
    COUNT(*) FILTER (WHERE status='paid') as paid,
    COUNT(*) FILTER (WHERE status='overdue') as overdue,
    COUNT(*) FILTER (WHERE status='partial') as partial,
    COALESCE(SUM(total_amount), 0) as total_invoiced,
    COALESCE(SUM(balance_due) FILTER (WHERE status NOT IN ('paid','cancelled','written_off')), 0) as total_outstanding
  FROM customer_invoices`);
  res.json(rows[0] || {});
});

router.post("/customer-invoices", async (req, res) => {
  const d = req.body;
  const num = await nextNum("INV-", "customer_invoices", "invoice_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO customer_invoices (invoice_number, invoice_type, invoice_date, due_date, customer_name, customer_address, customer_tax_id, contact_name, contact_phone, contact_email, status, currency, exchange_rate, subtotal, discount_pct, discount_amount, before_vat, vat_rate, vat_amount, total_amount, payment_terms, payment_method, reference_number, po_number, project_name, cost_center, salesperson, delivery_date, item_description, notes, created_by, created_by_name)
    VALUES ('${num}', '${d.invoiceType||'tax_invoice'}', '${d.invoiceDate || new Date().toISOString().slice(0,10)}', ${d.dueDate ? `'${d.dueDate}'` : 'NULL'}, ${s(d.customerName)}, ${s(d.customerAddress)}, ${s(d.customerTaxId)}, ${s(d.contactName)}, ${s(d.contactPhone)}, ${s(d.contactEmail)}, '${d.status||'draft'}', '${d.currency||'ILS'}', ${d.exchangeRate||1}, ${d.subtotal||0}, ${d.discountPct||0}, ${d.discountAmount||0}, ${d.beforeVat||0}, ${d.vatRate||17}, ${d.vatAmount||0}, ${d.totalAmount||0}, '${d.paymentTerms||'net_30'}', ${s(d.paymentMethod)}, ${s(d.referenceNumber)}, ${s(d.poNumber)}, ${s(d.projectName)}, ${s(d.costCenter)}, ${s(d.salesperson)}, ${d.deliveryDate ? `'${d.deliveryDate}'` : 'NULL'}, ${s(d.itemDescription)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM customer_invoices WHERE invoice_number='${num}'`))[0]);
});

router.put("/customer-invoices/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.invoiceType) sets.push(`invoice_type='${d.invoiceType}'`);
  if (d.customerName) sets.push(`customer_name=${s(d.customerName)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.subtotal !== undefined) sets.push(`subtotal=${d.subtotal}`);
  if (d.discountPct !== undefined) sets.push(`discount_pct=${d.discountPct}`);
  if (d.discountAmount !== undefined) sets.push(`discount_amount=${d.discountAmount}`);
  if (d.beforeVat !== undefined) sets.push(`before_vat=${d.beforeVat}`);
  if (d.vatAmount !== undefined) sets.push(`vat_amount=${d.vatAmount}`);
  if (d.totalAmount !== undefined) sets.push(`total_amount=${d.totalAmount}`);
  if (d.amountPaid !== undefined) sets.push(`amount_paid=${d.amountPaid}`);
  if (d.paymentMethod) sets.push(`payment_method=${s(d.paymentMethod)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'sent') sets.push(`sent_at=NOW()`);
  let previousStatus: string | null = null;
  if (d.status === 'paid') {
    const prev = await q(`SELECT status, total_amount FROM customer_invoices WHERE id=${req.params.id}`);
    previousStatus = prev.length > 0 ? (prev[0] as any).status : null;
    sets.push(`paid_at=NOW()`);
    sets.push(`balance_due=0`);
    if (!d.amountPaid && prev.length > 0) {
      sets.push(`amount_paid=${(prev[0] as any).total_amount || 0}`);
    }
  }
  if (d.status === 'cancelled' && d.cancelledReason) sets.push(`cancelled_reason=${s(d.cancelledReason)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE customer_invoices SET ${sets.join(",")} WHERE id=${req.params.id}`);
  const updated = (await q(`SELECT * FROM customer_invoices WHERE id=${req.params.id}`))[0] as any;
  if (d.status === 'paid' && previousStatus && previousStatus !== 'paid' && updated?.customer_name) {
    try {
      const custNameSafe = String(updated.customer_name).replace(/'/g, "''");
      const invNumSafe = String(updated.invoice_number).replace(/'/g, "''");
      await q(`UPDATE accounts_receivable SET status='paid', balance_due='0', paid_amount=total_amount, payment_date=NOW()::text, updated_at=NOW() WHERE customer_name='${custNameSafe}' AND invoice_number='${invNumSafe}' AND status NOT IN ('paid','cancelled')`);
      await q(`UPDATE sales_customers SET total_revenue = COALESCE(total_revenue,0) + ${Number(updated.total_amount) || 0}, updated_at=NOW() WHERE name='${custNameSafe}'`);
    } catch (flowErr: any) { console.error("[DataFlow] Invoice paid update error:", flowErr.message); }
  }
  res.json(updated);
});

router.delete("/customer-invoices/:id", async (req, res) => {
  await q(`DELETE FROM customer_invoices WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== CREDIT NOTES ==========
router.get("/credit-notes", async (_req, res) => {
  res.json(await q(`SELECT * FROM credit_notes ORDER BY credit_date DESC, id DESC`));
});

router.get("/credit-notes/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='pending') as pending,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='issued') as issued,
    COUNT(*) FILTER (WHERE status='refunded') as refunded,
    COALESCE(SUM(total_amount), 0) as total_credit_value,
    COALESCE(SUM(total_amount) FILTER (WHERE status='refunded'), 0) as total_refunded
  FROM credit_notes WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/credit-notes", async (req, res) => {
  const d = req.body;
  const num = await nextNum("CN-", "credit_notes", "credit_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO credit_notes (credit_number, credit_type, credit_date, original_invoice_number, customer_name, customer_tax_id, reason, reason_description, status, currency, subtotal, vat_rate, vat_amount, total_amount, refund_method, notes, created_by, created_by_name)
    VALUES ('${num}', '${d.creditType||'credit'}', '${d.creditDate || new Date().toISOString().slice(0,10)}', ${s(d.originalInvoiceNumber)}, ${s(d.customerName)}, ${s(d.customerTaxId)}, '${d.reason||'return'}', ${s(d.reasonDescription)}, '${d.status||'draft'}', '${d.currency||'ILS'}', ${d.subtotal||0}, ${d.vatRate||17}, ${d.vatAmount||0}, ${d.totalAmount||0}, ${s(d.refundMethod)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM credit_notes WHERE credit_number='${num}'`))[0]);
});

router.put("/credit-notes/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.creditType) sets.push(`credit_type='${d.creditType}'`);
  if (d.customerName) sets.push(`customer_name=${s(d.customerName)}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.subtotal !== undefined) sets.push(`subtotal=${d.subtotal}`);
  if (d.vatAmount !== undefined) sets.push(`vat_amount=${d.vatAmount}`);
  if (d.totalAmount !== undefined) sets.push(`total_amount=${d.totalAmount}`);
  if (d.refundMethod) sets.push(`refund_method=${s(d.refundMethod)}`);
  if (d.refundDate) sets.push(`refund_date='${d.refundDate}'`);
  if (d.refundReference) sets.push(`refund_reference=${s(d.refundReference)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'approved') { sets.push(`approved_by=${s((req as any).user?.fullName)}`); sets.push(`approved_at=NOW()`); }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE credit_notes SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM credit_notes WHERE id=${req.params.id}`))[0]);
});

router.delete("/credit-notes/:id", async (req, res) => {
  await q(`DELETE FROM credit_notes WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== AGING SNAPSHOTS ==========
router.get("/aging-snapshots", async (_req, res) => {
  res.json(await q(`SELECT * FROM aging_snapshots ORDER BY snapshot_date DESC, id DESC`));
});

router.get("/aging-snapshots/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE snapshot_type='receivable') as receivable_count,
    COUNT(*) FILTER (WHERE snapshot_type='payable') as payable_count,
    COALESCE(SUM(total_outstanding) FILTER (WHERE snapshot_type='receivable'), 0) as total_receivable,
    COALESCE(SUM(total_outstanding) FILTER (WHERE snapshot_type='payable'), 0) as total_payable,
    COALESCE(SUM(days_over_120), 0) as over_120_total,
    COUNT(*) FILTER (WHERE risk_level IN ('high','critical')) as high_risk_count,
    COALESCE(AVG(avg_days_to_pay), 0) as avg_collection_days
  FROM aging_snapshots WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM aging_snapshots)`);
  res.json(rows[0] || {});
});

router.post("/aging-snapshots", async (req, res) => {
  const d = req.body;
  const num = await nextNum("AGE-", "aging_snapshots", "snapshot_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO aging_snapshots (snapshot_number, snapshot_type, snapshot_date, entity_name, entity_type, total_outstanding, current_amount, days_1_30, days_31_60, days_61_90, days_91_120, days_over_120, oldest_invoice_date, oldest_invoice_number, payment_terms, credit_limit, risk_level, last_payment_date, last_payment_amount, avg_days_to_pay, contact_name, contact_phone, collection_notes, notes, created_by, created_by_name)
    VALUES ('${num}', '${d.snapshotType||'receivable'}', '${d.snapshotDate || new Date().toISOString().slice(0,10)}', ${s(d.entityName)}, '${d.entityType||'customer'}', ${d.totalOutstanding||0}, ${d.currentAmount||0}, ${d.days1_30||0}, ${d.days31_60||0}, ${d.days61_90||0}, ${d.days91_120||0}, ${d.daysOver120||0}, ${d.oldestInvoiceDate ? `'${d.oldestInvoiceDate}'` : 'NULL'}, ${s(d.oldestInvoiceNumber)}, ${s(d.paymentTerms)}, ${d.creditLimit||0}, '${d.riskLevel||'low'}', ${d.lastPaymentDate ? `'${d.lastPaymentDate}'` : 'NULL'}, ${d.lastPaymentAmount||'NULL'}, ${d.avgDaysToPay||'NULL'}, ${s(d.contactName)}, ${s(d.contactPhone)}, ${s(d.collectionNotes)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM aging_snapshots WHERE snapshot_number='${num}'`))[0]);
});

router.put("/aging-snapshots/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.totalOutstanding !== undefined) sets.push(`total_outstanding=${d.totalOutstanding}`);
  if (d.currentAmount !== undefined) sets.push(`current_amount=${d.currentAmount}`);
  if (d.days1_30 !== undefined) sets.push(`days_1_30=${d.days1_30}`);
  if (d.days31_60 !== undefined) sets.push(`days_31_60=${d.days31_60}`);
  if (d.days61_90 !== undefined) sets.push(`days_61_90=${d.days61_90}`);
  if (d.days91_120 !== undefined) sets.push(`days_91_120=${d.days91_120}`);
  if (d.daysOver120 !== undefined) sets.push(`days_over_120=${d.daysOver120}`);
  if (d.riskLevel) sets.push(`risk_level='${d.riskLevel}'`);
  if (d.collectionNotes !== undefined) sets.push(`collection_notes=${s(d.collectionNotes)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  await q(`UPDATE aging_snapshots SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM aging_snapshots WHERE id=${req.params.id}`))[0]);
});

router.delete("/aging-snapshots/:id", async (req, res) => {
  await q(`DELETE FROM aging_snapshots WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ---- Shared helpers for new endpoints ----
function safeId2(v: any): number { const n = parseInt(String(v), 10); return isNaN(n) || n <= 0 ? 0 : n; }
function safeNum2(v: any, fallback = 0): number { const n = Number(v); return isNaN(n) ? fallback : n; }
function safeDate2(v: any): string { const s = String(v || "").replace(/[^0-9-]/g, ""); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 10); }
function allowEnum(v: any, allowed: string[], fallback: string): string { const val = String(v || ""); return allowed.includes(val) ? val : fallback; }

// ========== CUSTOMER REFUNDS ==========
router.get("/customer-refunds", async (_req, res) => {
  res.json(await q(`SELECT * FROM customer_refunds ORDER BY refund_date DESC, id DESC`));
});

router.get("/customer-refunds/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='pending') as pending,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='processed') as processed,
    COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
    COALESCE(SUM(total_amount), 0) as total_amount,
    COALESCE(SUM(total_amount) FILTER (WHERE status='processed'), 0) as total_processed
  FROM customer_refunds`);
  res.json(rows[0] || {});
});

router.post("/customer-refunds", async (req, res) => {
  const d = req.body;
  const num = await nextNum("REF-", "customer_refunds", "refund_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const reason = allowEnum(d.reason, ["return","defect","overcharge","discount","cancellation","price_adjustment","duplicate","other"], "return");
  const status = allowEnum(d.status, ["draft","pending","approved","processed","cancelled"], "draft");
  const currency = allowEnum(d.currency, ["ILS","USD","EUR","GBP"], "ILS");
  const refundMethod = allowEnum(d.refundMethod, ["bank_transfer","check","cash","credit_card","credit_note",""], "bank_transfer");
  await q(`INSERT INTO customer_refunds (refund_number, refund_date, customer_name, customer_tax_id, original_invoice_number, reason, reason_description, status, currency, subtotal, vat_rate, vat_amount, total_amount, refund_method, notes, created_by, created_by_name)
    VALUES ('${num}', '${safeDate2(d.refundDate)}', ${s(d.customerName)}, ${s(d.customerTaxId)}, ${s(d.originalInvoiceNumber)}, '${reason}', ${s(d.reasonDescription)}, '${status}', '${currency}', ${safeNum2(d.subtotal)}, ${safeNum2(d.vatRate,17)}, ${safeNum2(d.vatAmount)}, ${safeNum2(d.totalAmount)}, '${refundMethod}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM customer_refunds WHERE refund_number='${num}'`))[0]);
});

router.put("/customer-refunds/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.customerName) sets.push(`customer_name=${s(d.customerName)}`);
  if (d.status) sets.push(`status='${allowEnum(d.status, ["draft","pending","approved","processed","cancelled"], "draft")}'`);
  if (d.reason) sets.push(`reason='${allowEnum(d.reason, ["return","defect","overcharge","discount","cancellation","price_adjustment","duplicate","other"], "other")}'`);
  if (d.reasonDescription !== undefined) sets.push(`reason_description=${s(d.reasonDescription)}`);
  if (d.subtotal !== undefined) sets.push(`subtotal=${safeNum2(d.subtotal)}`);
  if (d.vatAmount !== undefined) sets.push(`vat_amount=${safeNum2(d.vatAmount)}`);
  if (d.totalAmount !== undefined) sets.push(`total_amount=${safeNum2(d.totalAmount)}`);
  if (d.refundMethod) sets.push(`refund_method='${allowEnum(d.refundMethod, ["bank_transfer","check","cash","credit_card","credit_note"], "bank_transfer")}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE customer_refunds SET ${sets.join(",")} WHERE id=${id}`);
  res.json((await q(`SELECT * FROM customer_refunds WHERE id=${id}`))[0]);
});

router.delete("/customer-refunds/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await q(`DELETE FROM customer_refunds WHERE id=${id} AND status='draft'`);
  res.json({ success: true });
});

// ========== CUSTOMER PAYMENTS ==========
router.get("/customer-payments", async (_req, res) => {
  res.json(await q(`SELECT * FROM customer_payments ORDER BY payment_date DESC, id DESC`));
});

router.get("/customer-payments/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='pending') as pending,
    COUNT(*) FILTER (WHERE status='completed') as completed,
    COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
    COUNT(*) FILTER (WHERE status='bounced') as bounced,
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(amount) FILTER (WHERE status='completed'), 0) as completed_amount,
    COALESCE(SUM(amount) FILTER (WHERE status='pending'), 0) as pending_amount
  FROM customer_payments`);
  res.json(rows[0] || {});
});

router.post("/customer-payments", async (req, res) => {
  const d = req.body;
  const num = await nextNum("CPAY-", "customer_payments", "payment_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const status = allowEnum(d.status, ["pending","completed","cancelled","bounced"], "pending");
  const currency = allowEnum(d.currency, ["ILS","USD","EUR","GBP"], "ILS");
  const paymentMethod = allowEnum(d.paymentMethod, ["bank_transfer","check","cash","credit_card","direct_debit","other"], "bank_transfer");
  await q(`INSERT INTO customer_payments (payment_number, payment_date, customer_name, customer_tax_id, invoice_number, amount, currency, payment_method, reference_number, check_number, status, notes, created_by, created_by_name)
    VALUES ('${num}', '${safeDate2(d.paymentDate)}', ${s(d.customerName)}, ${s(d.customerTaxId)}, ${s(d.invoiceNumber)}, ${safeNum2(d.amount)}, '${currency}', '${paymentMethod}', ${s(d.referenceNumber)}, ${s(d.checkNumber)}, '${status}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM customer_payments WHERE payment_number='${num}'`))[0]);
});

router.put("/customer-payments/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.customerName) sets.push(`customer_name=${s(d.customerName)}`);
  if (d.status) sets.push(`status='${allowEnum(d.status, ["pending","completed","cancelled","bounced"], "pending")}'`);
  if (d.amount !== undefined) sets.push(`amount=${safeNum2(d.amount)}`);
  if (d.paymentMethod) sets.push(`payment_method='${allowEnum(d.paymentMethod, ["bank_transfer","check","cash","credit_card","direct_debit","other"], "bank_transfer")}'`);
  if (d.referenceNumber !== undefined) sets.push(`reference_number=${s(d.referenceNumber)}`);
  if (d.checkNumber !== undefined) sets.push(`check_number=${s(d.checkNumber)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE customer_payments SET ${sets.join(",")} WHERE id=${id}`);
  res.json((await q(`SELECT * FROM customer_payments WHERE id=${id}`))[0]);
});

router.delete("/customer-payments/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await q(`DELETE FROM customer_payments WHERE id=${id} AND status='pending'`);
  res.json({ success: true });
});

// ========== SUPPLIER INVOICES ==========
router.get("/supplier-invoices", async (_req, res) => {
  res.json(await q(`SELECT *, (total_amount - amount_paid) AS balance_due FROM supplier_invoices ORDER BY invoice_date DESC, id DESC`));
});

router.get("/supplier-invoices/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='received') as received,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='paid') as paid,
    COUNT(*) FILTER (WHERE status='overdue') as overdue,
    COUNT(*) FILTER (WHERE status='partial') as partial,
    COALESCE(SUM(total_amount), 0) as total_invoiced,
    COALESCE(SUM(total_amount - amount_paid) FILTER (WHERE status NOT IN ('paid','cancelled')), 0) as total_outstanding
  FROM supplier_invoices`);
  res.json(rows[0] || {});
});

router.post("/supplier-invoices", async (req, res) => {
  const d = req.body;
  const num = await nextNum("SINV-", "supplier_invoices", "invoice_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const status = allowEnum(d.status, ["draft","received","verified","approved","partial","paid","overdue","cancelled","disputed"], "received");
  const currency = allowEnum(d.currency, ["ILS","USD","EUR","GBP"], "ILS");
  const paymentTerms = allowEnum(d.paymentTerms, ["immediate","net_15","net_30","net_45","net_60","net_90","eom"], "net_30");
  const invoiceDate = safeDate2(d.invoiceDate);
  const dueDate = d.dueDate ? `'${safeDate2(d.dueDate)}'` : "NULL";
  const totalAmount = safeNum2(d.totalAmount);
  const amountPaid = safeNum2(d.amountPaid);
  await q(`INSERT INTO supplier_invoices (invoice_number, invoice_date, due_date, supplier_name, supplier_tax_id, status, currency, subtotal, vat_rate, vat_amount, total_amount, amount_paid, balance_due, payment_terms, item_description, notes, created_by, created_by_name)
    VALUES ('${num}', '${invoiceDate}', ${dueDate}, ${s(d.supplierName)}, ${s(d.supplierTaxId)}, '${status}', '${currency}', ${safeNum2(d.subtotal)}, ${safeNum2(d.vatRate,17)}, ${safeNum2(d.vatAmount)}, ${totalAmount}, ${amountPaid}, ${totalAmount - amountPaid}, '${paymentTerms}', ${s(d.itemDescription)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT *, (total_amount - amount_paid) AS balance_due FROM supplier_invoices WHERE invoice_number='${num}'`))[0]);
});

router.put("/supplier-invoices/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.supplierName) sets.push(`supplier_name=${s(d.supplierName)}`);
  if (d.status) sets.push(`status='${allowEnum(d.status, ["draft","received","verified","approved","partial","paid","overdue","cancelled","disputed"], "received")}'`);
  if (d.subtotal !== undefined) sets.push(`subtotal=${safeNum2(d.subtotal)}`);
  if (d.vatAmount !== undefined) sets.push(`vat_amount=${safeNum2(d.vatAmount)}`);
  if (d.totalAmount !== undefined) sets.push(`total_amount=${safeNum2(d.totalAmount)}`);
  if (d.amountPaid !== undefined) sets.push(`amount_paid=${safeNum2(d.amountPaid)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.totalAmount !== undefined || d.amountPaid !== undefined) {
    sets.push(`balance_due=(total_amount - amount_paid)`);
  }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE supplier_invoices SET ${sets.join(",")} WHERE id=${id}`);
  res.json((await q(`SELECT *, (total_amount - amount_paid) AS balance_due FROM supplier_invoices WHERE id=${id}`))[0]);
});

router.delete("/supplier-invoices/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await q(`DELETE FROM supplier_invoices WHERE id=${id} AND status='draft'`);
  res.json({ success: true });
});

// ========== SUPPLIER CREDIT NOTES ==========
router.get("/supplier-credit-notes", async (_req, res) => {
  res.json(await q(`SELECT * FROM supplier_credit_notes ORDER BY credit_date DESC, id DESC`));
});

router.get("/supplier-credit-notes/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='pending') as pending,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='issued') as issued,
    COUNT(*) FILTER (WHERE status='applied') as applied,
    COALESCE(SUM(total_amount), 0) as total_credit_value,
    COALESCE(SUM(total_amount) FILTER (WHERE status='applied'), 0) as total_applied
  FROM supplier_credit_notes WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/supplier-credit-notes", async (req, res) => {
  const d = req.body;
  const num = await nextNum("SCN-", "supplier_credit_notes", "credit_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const reason = allowEnum(d.reason, ["return","defect","overcharge","discount","cancellation","price_adjustment","duplicate","other"], "overcharge");
  const status = allowEnum(d.status, ["draft","pending","approved","issued","applied","cancelled"], "draft");
  const currency = allowEnum(d.currency, ["ILS","USD","EUR","GBP"], "ILS");
  await q(`INSERT INTO supplier_credit_notes (credit_number, credit_date, supplier_name, supplier_tax_id, original_invoice_number, reason, reason_description, status, currency, subtotal, vat_rate, vat_amount, total_amount, notes, created_by, created_by_name)
    VALUES ('${num}', '${safeDate2(d.creditDate)}', ${s(d.supplierName)}, ${s(d.supplierTaxId)}, ${s(d.originalInvoiceNumber)}, '${reason}', ${s(d.reasonDescription)}, '${status}', '${currency}', ${safeNum2(d.subtotal)}, ${safeNum2(d.vatRate,17)}, ${safeNum2(d.vatAmount)}, ${safeNum2(d.totalAmount)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM supplier_credit_notes WHERE credit_number='${num}'`))[0]);
});

router.put("/supplier-credit-notes/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.supplierName) sets.push(`supplier_name=${s(d.supplierName)}`);
  if (d.status) sets.push(`status='${allowEnum(d.status, ["draft","pending","approved","issued","applied","cancelled"], "draft")}'`);
  if (d.reason) sets.push(`reason='${allowEnum(d.reason, ["return","defect","overcharge","discount","cancellation","price_adjustment","duplicate","other"], "other")}'`);
  if (d.reasonDescription !== undefined) sets.push(`reason_description=${s(d.reasonDescription)}`);
  if (d.subtotal !== undefined) sets.push(`subtotal=${safeNum2(d.subtotal)}`);
  if (d.vatAmount !== undefined) sets.push(`vat_amount=${safeNum2(d.vatAmount)}`);
  if (d.totalAmount !== undefined) sets.push(`total_amount=${safeNum2(d.totalAmount)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE supplier_credit_notes SET ${sets.join(",")} WHERE id=${id}`);
  res.json((await q(`SELECT * FROM supplier_credit_notes WHERE id=${id}`))[0]);
});

router.delete("/supplier-credit-notes/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await q(`DELETE FROM supplier_credit_notes WHERE id=${id} AND status='draft'`);
  res.json({ success: true });
});

// ========== SUPPLIER PAYMENTS ==========
router.get("/supplier-payments", async (_req, res) => {
  res.json(await q(`SELECT * FROM supplier_payments ORDER BY payment_date DESC, id DESC`));
});

router.get("/supplier-payments/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='pending') as pending,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='completed') as completed,
    COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(amount) FILTER (WHERE status='completed'), 0) as completed_amount,
    COALESCE(SUM(amount) FILTER (WHERE status IN ('pending','approved')), 0) as pending_amount
  FROM supplier_payments`);
  res.json(rows[0] || {});
});

router.post("/supplier-payments", async (req, res) => {
  const d = req.body;
  const num = await nextNum("SPAY-", "supplier_payments", "payment_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const status = allowEnum(d.status, ["pending","approved","completed","cancelled","bounced"], "pending");
  const currency = allowEnum(d.currency, ["ILS","USD","EUR","GBP"], "ILS");
  const paymentMethod = allowEnum(d.paymentMethod, ["bank_transfer","check","cash","credit_card","direct_debit","other"], "bank_transfer");
  await q(`INSERT INTO supplier_payments (payment_number, payment_date, supplier_name, supplier_tax_id, invoice_number, amount, currency, payment_method, reference_number, check_number, status, notes, created_by, created_by_name)
    VALUES ('${num}', '${safeDate2(d.paymentDate)}', ${s(d.supplierName)}, ${s(d.supplierTaxId)}, ${s(d.invoiceNumber)}, ${safeNum2(d.amount)}, '${currency}', '${paymentMethod}', ${s(d.referenceNumber)}, ${s(d.checkNumber)}, '${status}', ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM supplier_payments WHERE payment_number='${num}'`))[0]);
});

router.put("/supplier-payments/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.supplierName) sets.push(`supplier_name=${s(d.supplierName)}`);
  if (d.status) sets.push(`status='${allowEnum(d.status, ["pending","approved","completed","cancelled","bounced"], "pending")}'`);
  if (d.amount !== undefined) sets.push(`amount=${safeNum2(d.amount)}`);
  if (d.paymentMethod) sets.push(`payment_method='${allowEnum(d.paymentMethod, ["bank_transfer","check","cash","credit_card","direct_debit","other"], "bank_transfer")}'`);
  if (d.referenceNumber !== undefined) sets.push(`reference_number=${s(d.referenceNumber)}`);
  if (d.checkNumber !== undefined) sets.push(`check_number=${s(d.checkNumber)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE supplier_payments SET ${sets.join(",")} WHERE id=${id}`);
  res.json((await q(`SELECT * FROM supplier_payments WHERE id=${id}`))[0]);
});

router.delete("/supplier-payments/:id", async (req, res) => {
  const id = safeId2(req.params.id); if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  await q(`DELETE FROM supplier_payments WHERE id=${id} AND status='pending'`);
  res.json({ success: true });
});

export default router;
