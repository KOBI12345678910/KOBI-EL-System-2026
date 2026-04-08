import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
import { runPaymentAnomalyDetection } from "./finance-enterprise";
import { VAT_RATE } from "../constants";

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
  catch (e: any) { console.error("AP query error:", e.message); return []; }
}
async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

// ========== ACCOUNTS PAYABLE ENTERPRISE ==========
router.get("/ap", async (_req, res) => {
  res.json(await q(`SELECT * FROM accounts_payable ORDER BY due_date ASC, id DESC`));
});

router.get("/ap/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='open') as open_count,
    COUNT(*) FILTER (WHERE status='partial') as partial_count,
    COUNT(*) FILTER (WHERE status='paid') as paid_count,
    COUNT(*) FILTER (WHERE status='overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)) as overdue_count,
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(balance_due), 0) as total_balance,
    COALESCE(SUM(paid_amount), 0) as total_paid,
    COALESCE(SUM(vat_amount), 0) as total_vat,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE AND due_date < CURRENT_DATE + 30), 0) as due_30,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30), 0) as overdue_30,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60), 0) as overdue_60,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90), 0) as overdue_90,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 90), 0) as overdue_120_plus,
    COUNT(DISTINCT supplier_name) as supplier_count
  FROM accounts_payable WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.get("/ap/aging", async (_req, res) => {
  const rows = await q(`SELECT 
    supplier_name,
    COUNT(*) as invoice_count,
    COALESCE(SUM(balance_due), 0) as total_balance,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30), 0) as days_30,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60), 0) as days_60,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90), 0) as days_90,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 90), 0) as days_120_plus
  FROM accounts_payable WHERE status IN ('open','partial','overdue')
  GROUP BY supplier_name ORDER BY total_balance DESC`);
  res.json(rows);
});

router.get("/ap/top-suppliers", async (_req, res) => {
  const rows = await q(`SELECT 
    supplier_name,
    COUNT(*) as invoice_count,
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(paid_amount), 0) as total_paid,
    COALESCE(SUM(balance_due), 0) as total_balance
  FROM accounts_payable WHERE status != 'cancelled'
  GROUP BY supplier_name ORDER BY total_amount DESC LIMIT 15`);
  res.json(rows);
});

router.post("/ap", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  const num = await nextNum("AP-", "accounts_payable", "ap_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const vatAmount = Number(d.vatAmount) || (Number(d.amount || 0) * VAT_RATE);
  const netAmount = Number(d.netAmount) || (Number(d.amount || 0) - vatAmount);
  await q(`INSERT INTO accounts_payable (ap_number, invoice_number, supplier_id, supplier_name, invoice_date, due_date, amount, net_amount, vat_amount, paid_amount, currency, status, payment_terms, description, category, notes, tags, priority, gl_account, gl_account_name, cost_center, department, project_name, payment_method, bank_account, contact_person, contact_phone, contact_email, withholding_tax, discount_percent, discount_amount, discount_date, is_recurring, recurring_frequency, three_way_match, po_matched, grn_matched)
    VALUES ('${num}', ${s(d.invoiceNumber)}, ${d.supplierId||'NULL'}, ${s(d.supplierName)}, '${d.invoiceDate || new Date().toISOString().slice(0,10)}', '${d.dueDate || new Date().toISOString().slice(0,10)}', ${d.amount||0}, ${netAmount}, ${vatAmount}, 0, '${d.currency||'ILS'}', '${d.status||'open'}', ${s(d.paymentTerms)}, ${s(d.description)}, ${s(d.category)}, ${s(d.notes)}, ${s(d.tags)}, '${d.priority||'normal'}', ${s(d.glAccount)}, ${s(d.glAccountName)}, ${s(d.costCenter)}, ${s(d.department)}, ${s(d.projectName)}, ${s(d.paymentMethod)}, ${s(d.bankAccount)}, ${s(d.contactPerson)}, ${s(d.contactPhone)}, ${s(d.contactEmail)}, ${d.withholdingTax||0}, ${d.discountPercent||0}, ${d.discountAmount||0}, ${d.discountDate ? `'${d.discountDate}'` : 'NULL'}, ${d.isRecurring||false}, ${s(d.recurringFrequency)}, ${d.threeWayMatch||false}, ${d.poMatched||false}, ${d.grnMatched||false})`);
  const rows = await q(`SELECT * FROM accounts_payable WHERE ap_number='${num}'`);
  res.json(rows[0]);
});

router.put("/ap/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.invoiceNumber !== undefined) sets.push(`invoice_number=${s(d.invoiceNumber)}`);
  if (d.supplierName) sets.push(`supplier_name=${s(d.supplierName)}`);
  if (d.supplierId) sets.push(`supplier_id=${d.supplierId}`);
  if (d.invoiceDate) sets.push(`invoice_date='${d.invoiceDate}'`);
  if (d.dueDate) sets.push(`due_date='${d.dueDate}'`);
  if (d.amount) sets.push(`amount=${d.amount}`);
  if (d.vatAmount !== undefined) sets.push(`vat_amount=${d.vatAmount||0}`);
  if (d.netAmount !== undefined) sets.push(`net_amount=${d.netAmount||0}`);
  if (d.currency) sets.push(`currency='${d.currency}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.paymentTerms !== undefined) sets.push(`payment_terms=${s(d.paymentTerms)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.priority) sets.push(`priority='${d.priority}'`);
  if (d.glAccount !== undefined) sets.push(`gl_account=${s(d.glAccount)}`);
  if (d.glAccountName !== undefined) sets.push(`gl_account_name=${s(d.glAccountName)}`);
  if (d.costCenter !== undefined) sets.push(`cost_center=${s(d.costCenter)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.projectName !== undefined) sets.push(`project_name=${s(d.projectName)}`);
  if (d.paymentMethod !== undefined) sets.push(`payment_method=${s(d.paymentMethod)}`);
  if (d.contactPerson !== undefined) sets.push(`contact_person=${s(d.contactPerson)}`);
  if (d.contactPhone !== undefined) sets.push(`contact_phone=${s(d.contactPhone)}`);
  if (d.contactEmail !== undefined) sets.push(`contact_email=${s(d.contactEmail)}`);
  if (d.withholdingTax !== undefined) sets.push(`withholding_tax=${d.withholdingTax}`);
  if (d.discountPercent !== undefined) sets.push(`discount_percent=${d.discountPercent}`);
  if (d.discountAmount !== undefined) sets.push(`discount_amount=${d.discountAmount}`);
  if (d.threeWayMatch !== undefined) sets.push(`three_way_match=${d.threeWayMatch}`);
  if (d.poMatched !== undefined) sets.push(`po_matched=${d.poMatched}`);
  if (d.grnMatched !== undefined) sets.push(`grn_matched=${d.grnMatched}`);
  if (d.isRecurring !== undefined) sets.push(`is_recurring=${d.isRecurring}`);
  if (d.status === 'approved') {
    const user = (req as any).user;
    sets.push(`approved_by=${user?.id||'NULL'}`);
    sets.push(`approved_by_name=${user?.fullName ? `'${user.fullName.replace(/'/g,"''")}'` : 'NULL'}`);
    sets.push(`approved_at=NOW()`);
  }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE accounts_payable SET ${sets.join(",")} WHERE id=${req.params.id}`);
  const rows = await q(`SELECT * FROM accounts_payable WHERE id=${req.params.id}`);
  res.json(rows[0]);
});

router.delete("/ap/:id", async (req, res) => {
  await q(`DELETE FROM accounts_payable WHERE id=${req.params.id} AND status IN ('open','cancelled')`);
  res.json({ success: true });
});

// ========== AP PAYMENTS ==========
router.get("/ap/:id/payments", async (req, res) => {
  res.json(await q(`SELECT * FROM ap_payments WHERE ap_id=${req.params.id} ORDER BY payment_date DESC`));
});

router.post("/ap/:id/pay", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const num = await nextNum("APY-", "ap_payments", "payment_number");
  await q(`INSERT INTO ap_payments (ap_id, payment_number, payment_date, amount, currency, payment_method, bank_account, check_number, reference, notes, created_by, created_by_name)
    VALUES (${req.params.id}, '${num}', '${d.paymentDate || new Date().toISOString().slice(0,10)}', ${d.amount||0}, '${d.currency||'ILS'}', ${s(d.paymentMethod)}, ${s(d.bankAccount)}, ${s(d.checkNumber)}, ${s(d.reference)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${user?.fullName ? `'${user.fullName.replace(/'/g,"''")}'` : 'NULL'})`);
  
  const totalPaid = await q(`SELECT COALESCE(SUM(amount),0) as total FROM ap_payments WHERE ap_id=${req.params.id}`);
  const paidAmount = Number((totalPaid[0] as any)?.total || 0);
  const ap = await q(`SELECT amount FROM accounts_payable WHERE id=${req.params.id}`);
  const apAmount = Number((ap[0] as any)?.amount || 0);
  const newStatus = paidAmount >= apAmount ? 'paid' : paidAmount > 0 ? 'partial' : 'open';
  await q(`UPDATE accounts_payable SET paid_amount=${paidAmount}, status='${newStatus}', updated_at=NOW() WHERE id=${req.params.id}`);
  
  const updated = await q(`SELECT * FROM accounts_payable WHERE id=${req.params.id}`);
  res.json(updated[0]);

  // Trigger anomaly detection asynchronously after payment is recorded
  runPaymentAnomalyDetection().catch(err =>
    console.error("[PaymentAnomaly] Background detection error after payment:", err.message)
  );
});

// ========== AP AGING SNAPSHOTS ==========
router.get("/ap/aging-snapshots", async (_req, res) => {
  res.json(await q(`SELECT * FROM ap_aging_snapshots ORDER BY snapshot_date DESC LIMIT 12`));
});

router.post("/ap/aging-snapshot", async (_req, res) => {
  const data = await q(`SELECT
    COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30), 0) as days_30,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60), 0) as days_60,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90), 0) as days_90,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 90), 0) as days_120_plus,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE), 0) as total_overdue,
    COALESCE(SUM(balance_due), 0) as total_balance,
    COUNT(DISTINCT supplier_name) as supplier_count,
    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) as overdue_count
  FROM accounts_payable WHERE status IN ('open','partial','overdue')`);
  const d = (data[0] as any) || {};
  await q(`INSERT INTO ap_aging_snapshots (current_amount, days_30, days_60, days_90, days_120_plus, total_overdue, total_balance, supplier_count, overdue_count)
    VALUES (${d.current_amount||0}, ${d.days_30||0}, ${d.days_60||0}, ${d.days_90||0}, ${d.days_120_plus||0}, ${d.total_overdue||0}, ${d.total_balance||0}, ${d.supplier_count||0}, ${d.overdue_count||0})`);
  res.json({ success: true, snapshot: d });
});

export default router;
