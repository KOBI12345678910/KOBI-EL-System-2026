import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";
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
  catch (e: any) { console.error("AR query error:", e.message); return []; }
}
async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

// ========== ACCOUNTS RECEIVABLE ENTERPRISE ==========
router.get("/ar", async (_req, res) => {
  res.json(await q(`SELECT * FROM accounts_receivable ORDER BY due_date ASC, id DESC`));
});

router.get("/ar/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='open') as open_count,
    COUNT(*) FILTER (WHERE status='partial') as partial_count,
    COUNT(*) FILTER (WHERE status='paid') as paid_count,
    COUNT(*) FILTER (WHERE status='overdue' OR (status IN ('open','partial') AND due_date < CURRENT_DATE)) as overdue_count,
    COUNT(*) FILTER (WHERE status='written_off') as written_off_count,
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(balance_due), 0) as total_balance,
    COALESCE(SUM(paid_amount), 0) as total_collected,
    COALESCE(SUM(vat_amount), 0) as total_vat,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_due,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30), 0) as overdue_30,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60), 0) as overdue_60,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90), 0) as overdue_90,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 90), 0) as overdue_120_plus,
    COUNT(DISTINCT customer_name) as customer_count,
    COALESCE(AVG(EXTRACT(DAY FROM CURRENT_DATE - due_date)) FILTER (WHERE status IN ('open','partial') AND due_date < CURRENT_DATE), 0) as avg_days_overdue
  FROM accounts_receivable WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.get("/ar/aging", async (_req, res) => {
  const rows = await q(`SELECT 
    customer_name,
    COUNT(*) as invoice_count,
    COALESCE(SUM(balance_due), 0) as total_balance,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date >= CURRENT_DATE), 0) as current_amount,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30), 0) as days_30,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60), 0) as days_60,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90), 0) as days_90,
    COALESCE(SUM(balance_due) FILTER (WHERE due_date < CURRENT_DATE - 90), 0) as days_120_plus,
    MAX(dunning_level) as max_dunning_level
  FROM accounts_receivable WHERE status IN ('open','partial','overdue')
  GROUP BY customer_name ORDER BY total_balance DESC`);
  res.json(rows);
});

router.get("/ar/top-customers", async (_req, res) => {
  const rows = await q(`SELECT 
    customer_name,
    COUNT(*) as invoice_count,
    COALESCE(SUM(amount), 0) as total_amount,
    COALESCE(SUM(paid_amount), 0) as total_collected,
    COALESCE(SUM(balance_due), 0) as total_balance,
    ROUND(COALESCE(SUM(paid_amount)::numeric / NULLIF(SUM(amount),0) * 100, 0), 1) as collection_rate
  FROM accounts_receivable WHERE status != 'cancelled'
  GROUP BY customer_name ORDER BY total_amount DESC LIMIT 15`);
  res.json(rows);
});

router.post("/ar", async (req, res) => {
  const d = req.body;
  const num = await nextNum("AR-", "accounts_receivable", "ar_number");
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const vatAmount = Number(d.vatAmount) || (Number(d.amount || 0) * VAT_RATE / (1 + VAT_RATE));
  const netAmount = Number(d.netAmount) || (Number(d.amount || 0) / (1 + VAT_RATE));
  await q(`INSERT INTO accounts_receivable (ar_number, invoice_number, customer_id, customer_name, customer_phone, customer_email, invoice_date, due_date, amount, net_amount, vat_amount, paid_amount, currency, status, payment_terms, description, category, notes, tags, priority, gl_account, gl_account_name, cost_center, department, project_name, payment_method, salesperson, contact_person, contact_phone, withholding_tax, discount_percent, discount_amount, discount_date, credit_limit, order_number, delivery_note)
    VALUES ('${num}', ${s(d.invoiceNumber)}, ${d.customerId||'NULL'}, ${s(d.customerName)}, ${s(d.customerPhone)}, ${s(d.customerEmail)}, '${d.invoiceDate || new Date().toISOString().slice(0,10)}', '${d.dueDate || new Date().toISOString().slice(0,10)}', ${d.amount||0}, ${netAmount.toFixed(2)}, ${vatAmount.toFixed(2)}, 0, '${d.currency||'ILS'}', '${d.status||'open'}', ${s(d.paymentTerms)}, ${s(d.description)}, ${s(d.category)}, ${s(d.notes)}, ${s(d.tags)}, '${d.priority||'normal'}', ${s(d.glAccount)}, ${s(d.glAccountName)}, ${s(d.costCenter)}, ${s(d.department)}, ${s(d.projectName)}, ${s(d.paymentMethod)}, ${s(d.salesperson)}, ${s(d.contactPerson)}, ${s(d.contactPhone)}, ${d.withholdingTax||0}, ${d.discountPercent||0}, ${d.discountAmount||0}, ${d.discountDate ? `'${d.discountDate}'` : 'NULL'}, ${d.creditLimit||0}, ${s(d.orderNumber)}, ${s(d.deliveryNote)})`);
  const rows = await q(`SELECT * FROM accounts_receivable WHERE ar_number='${num}'`);
  res.json(rows[0]);
});

router.put("/ar/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.invoiceNumber !== undefined) sets.push(`invoice_number=${s(d.invoiceNumber)}`);
  if (d.customerName) sets.push(`customer_name=${s(d.customerName)}`);
  if (d.customerId) sets.push(`customer_id=${d.customerId}`);
  if (d.customerPhone !== undefined) sets.push(`customer_phone=${s(d.customerPhone)}`);
  if (d.customerEmail !== undefined) sets.push(`customer_email=${s(d.customerEmail)}`);
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
  if (d.costCenter !== undefined) sets.push(`cost_center=${s(d.costCenter)}`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.projectName !== undefined) sets.push(`project_name=${s(d.projectName)}`);
  if (d.salesperson !== undefined) sets.push(`salesperson=${s(d.salesperson)}`);
  if (d.contactPerson !== undefined) sets.push(`contact_person=${s(d.contactPerson)}`);
  if (d.contactPhone !== undefined) sets.push(`contact_phone=${s(d.contactPhone)}`);
  if (d.withholdingTax !== undefined) sets.push(`withholding_tax=${d.withholdingTax}`);
  if (d.discountPercent !== undefined) sets.push(`discount_percent=${d.discountPercent}`);
  if (d.creditLimit !== undefined) sets.push(`credit_limit=${d.creditLimit}`);
  if (d.orderNumber !== undefined) sets.push(`order_number=${s(d.orderNumber)}`);
  if (d.deliveryNote !== undefined) sets.push(`delivery_note=${s(d.deliveryNote)}`);
  if (d.dunningLevel !== undefined) sets.push(`dunning_level=${d.dunningLevel}`);
  if (d.dunningBlocked !== undefined) sets.push(`dunning_blocked=${d.dunningBlocked}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE accounts_receivable SET ${sets.join(",")} WHERE id=${req.params.id}`);
  const rows = await q(`SELECT * FROM accounts_receivable WHERE id=${req.params.id}`);
  res.json(rows[0]);
});

router.delete("/ar/:id", async (req, res) => {
  await q(`DELETE FROM accounts_receivable WHERE id=${req.params.id} AND status IN ('open','cancelled')`);
  res.json({ success: true });
});

// ========== GLOBAL AR RECEIPTS (for /finance/receipts page) ==========
router.get("/ar-receipts", async (_req, res) => {
  const rows = await q(`
    SELECT r.*, ci.invoice_number, ci.customer_name, ci.balance_due AS invoice_balance,
      ci.total_amount AS invoice_total, ci.status AS invoice_status,
      r.amount AS amount_received,
      COALESCE(ci.balance_due, 0) - r.amount AS balance_remaining
    FROM ar_receipts r
    LEFT JOIN customer_invoices ci ON ci.id = r.ar_id
    ORDER BY r.receipt_date DESC, r.id DESC
    LIMIT 500
  `);
  res.json(rows);
});

router.post("/ar-receipts", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const receiptNum = d.receiptNumber ? `'${String(d.receiptNumber).replace(/'/g,"''")}'` : `'${await nextNum("RCP-", "ar_receipts", "receipt_number")}'`;
  await q(`INSERT INTO ar_receipts (ar_id, receipt_number, receipt_date, amount, currency, payment_method, bank_account, reference, notes, created_by, created_by_name)
    VALUES (${d.invoiceId ? d.invoiceId : 'NULL'}, ${receiptNum}, '${d.receiptDate || new Date().toISOString().slice(0,10)}', ${d.amountReceived||d.amount||0}, '${d.currency||'ILS'}', ${s(d.paymentMethod)}, ${s(d.bankAccount)}, ${s(d.referenceNumber||d.reference)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${user?.fullName ? `'${user.fullName.replace(/'/g,"''")}'` : 'NULL'})`);
  res.json({ success: true });
});

router.put("/ar-receipts/:id", async (req, res) => {
  const d = req.body;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`UPDATE ar_receipts SET
    amount=${d.amountReceived||d.amount||0},
    payment_method=${s(d.paymentMethod)},
    reference=${s(d.referenceNumber||d.reference)},
    notes=${s(d.notes)},
    receipt_date='${d.receiptDate || new Date().toISOString().slice(0,10)}',
    updated_at=NOW()
    WHERE id=${req.params.id}`);
  res.json({ success: true });
});

router.delete("/ar-receipts/:id", async (req, res) => {
  await q(`DELETE FROM ar_receipts WHERE id=${req.params.id}`);
  res.json({ success: true });
});

// ========== AR RECEIPTS ==========
router.get("/ar/:id/receipts", async (req, res) => {
  res.json(await q(`SELECT * FROM ar_receipts WHERE ar_id=${req.params.id} ORDER BY receipt_date DESC`));
});

router.post("/ar/:id/collect", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const num = await nextNum("RCT-", "ar_receipts", "receipt_number");
  await q(`INSERT INTO ar_receipts (ar_id, receipt_number, receipt_date, amount, currency, payment_method, bank_account, check_number, check_date, reference, notes, created_by, created_by_name)
    VALUES (${req.params.id}, '${num}', '${d.receiptDate || new Date().toISOString().slice(0,10)}', ${d.amount||0}, '${d.currency||'ILS'}', ${s(d.paymentMethod)}, ${s(d.bankAccount)}, ${s(d.checkNumber)}, ${d.checkDate ? `'${d.checkDate}'` : 'NULL'}, ${s(d.reference)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${user?.fullName ? `'${user.fullName.replace(/'/g,"''")}'` : 'NULL'})`);
  
  const totalCollected = await q(`SELECT COALESCE(SUM(amount),0) as total FROM ar_receipts WHERE ar_id=${req.params.id}`);
  const collectedAmount = Number((totalCollected[0] as any)?.total || 0);
  const ar = await q(`SELECT amount FROM accounts_receivable WHERE id=${req.params.id}`);
  const arAmount = Number((ar[0] as any)?.amount || 0);
  const newStatus = collectedAmount >= arAmount ? 'paid' : collectedAmount > 0 ? 'partial' : 'open';
  await q(`UPDATE accounts_receivable SET paid_amount=${collectedAmount}, status='${newStatus}', updated_at=NOW() WHERE id=${req.params.id}`);
  
  const updated = await q(`SELECT * FROM accounts_receivable WHERE id=${req.params.id}`);
  res.json(updated[0]);
});

// ========== DUNNING LETTERS ==========
router.get("/ar/dunning", async (_req, res) => {
  res.json(await q(`SELECT * FROM ar_dunning_letters ORDER BY letter_date DESC, id DESC`));
});

router.get("/ar/:id/dunning", async (req, res) => {
  res.json(await q(`SELECT * FROM ar_dunning_letters WHERE ar_id=${req.params.id} ORDER BY dunning_level ASC`));
});

router.post("/ar/:id/dunning", async (req, res) => {
  const d = req.body;
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  const num = await nextNum("DUN-", "ar_dunning_letters", "dunning_number");
  
  const ar = await q(`SELECT * FROM accounts_receivable WHERE id=${req.params.id}`);
  const invoice = ar[0] as any;
  if (!invoice) { res.status(404).json({ error: "חשבונית לא נמצאה" }); return; }
  
  const daysOver = Math.max(0, Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000));
  const level = d.dunningLevel || (invoice.dunning_level || 0) + 1;
  const interestRate = level >= 3 ? 0.015 : level >= 2 ? 0.01 : 0;
  const interestAmount = Number(invoice.balance_due || 0) * interestRate;
  
  await q(`INSERT INTO ar_dunning_letters (dunning_number, ar_id, customer_name, customer_email, dunning_level, letter_date, due_amount, interest_amount, total_amount, days_overdue, subject, body, status, created_by, created_by_name)
    VALUES ('${num}', ${req.params.id}, ${s(invoice.customer_name)}, ${s(invoice.customer_email)}, ${level}, '${d.letterDate || new Date().toISOString().slice(0,10)}', ${invoice.balance_due||0}, ${interestAmount.toFixed(2)}, ${(Number(invoice.balance_due||0) + interestAmount).toFixed(2)}, ${daysOver}, ${s(d.subject || `מכתב התראה ${level} - חשבונית ${invoice.invoice_number}`)}, ${s(d.body)}, '${d.status||'draft'}', ${user?.id||'NULL'}, ${user?.fullName ? `'${user.fullName.replace(/'/g,"''")}'` : 'NULL'})`);
  
  await q(`UPDATE accounts_receivable SET dunning_level=${level}, last_dunning_date=CURRENT_DATE, updated_at=NOW() WHERE id=${req.params.id}`);
  
  const letters = await q(`SELECT * FROM ar_dunning_letters WHERE ar_id=${req.params.id} ORDER BY dunning_level ASC`);
  res.json(letters);
});

router.put("/ar/dunning/:id", async (req, res) => {
  const d = req.body;
  const sets: string[] = [];
  if (d.status) {
    sets.push(`status='${d.status}'`);
    if (d.status === 'sent') sets.push(`sent_at=NOW()`);
  }
  if (d.responseDate) sets.push(`response_date='${d.responseDate}'`);
  if (d.responseNotes !== undefined) sets.push(`response_notes=${d.responseNotes ? `'${d.responseNotes.replace(/'/g,"''")}'` : 'NULL'}`);
  if (sets.length > 0) {
    await q(`UPDATE ar_dunning_letters SET ${sets.join(",")} WHERE id=${req.params.id}`);
  }
  const rows = await q(`SELECT * FROM ar_dunning_letters WHERE id=${req.params.id}`);
  res.json(rows[0]);
});

export default router;
