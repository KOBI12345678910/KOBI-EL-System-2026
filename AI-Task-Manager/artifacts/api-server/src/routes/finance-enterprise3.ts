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
  catch (e: any) { console.error("Finance3 query error:", e.message); return []; }
}
async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

// ========== PETTY CASH ==========
router.get("/petty-cash", async (_req, res) => {
  res.json(await q(`SELECT * FROM petty_cash ORDER BY transaction_date DESC, id DESC`));
});

router.get("/petty-cash/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='pending') as pending,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='paid') as paid,
    COALESCE(SUM(amount) FILTER (WHERE transaction_type='expense' AND status IN ('approved','paid')), 0) as total_expenses,
    COALESCE(SUM(amount) FILTER (WHERE transaction_type='replenishment' AND status IN ('approved','paid')), 0) as total_replenishments,
    COALESCE(SUM(CASE WHEN transaction_type='replenishment' THEN amount ELSE -amount END) FILTER (WHERE status IN ('approved','paid')), 0) as current_balance,
    COUNT(DISTINCT category) as categories_used
  FROM petty_cash`);
  res.json(rows[0] || {});
});

router.post("/petty-cash", async (req, res) => {
  const d = req.body;
  const num = await nextNum("PCH-", "petty_cash", "transaction_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO petty_cash (transaction_number, transaction_type, transaction_date, cash_box_name, category, description, amount, vat_included, vat_amount, net_amount, receipt_number, vendor_name, paid_to, status, cost_center, project_name, notes, created_by, created_by_name)
    VALUES ('${num}', '${d.transactionType||'expense'}', '${d.transactionDate||new Date().toISOString().slice(0,10)}', ${s(d.cashBoxName||'ראשי')}, '${d.category||'office'}', ${s(d.description)}, ${d.amount||0}, ${d.vatIncluded||false}, ${d.vatAmount||0}, ${d.netAmount||0}, ${s(d.receiptNumber)}, ${s(d.vendorName)}, ${s(d.paidTo)}, '${d.status||'pending'}', ${s(d.costCenter)}, ${s(d.projectName)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM petty_cash WHERE transaction_number='${num}'`))[0]);
});

router.put("/petty-cash/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.transactionType) sets.push(`transaction_type='${d.transactionType}'`);
  if (d.category) sets.push(`category='${d.category}'`);
  if (d.description) sets.push(`description=${s(d.description)}`);
  if (d.amount !== undefined) sets.push(`amount=${d.amount}`);
  if (d.vatAmount !== undefined) sets.push(`vat_amount=${d.vatAmount}`);
  if (d.netAmount !== undefined) sets.push(`net_amount=${d.netAmount}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'approved') { sets.push(`approved_by=${s((req as any).user?.fullName)}`); sets.push(`approved_at=NOW()`); }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE petty_cash SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM petty_cash WHERE id=${req.params.id}`))[0]);
});

router.delete("/petty-cash/:id", async (req, res) => {
  await q(`DELETE FROM petty_cash WHERE id=${req.params.id} AND status='pending'`);
  res.json({ success: true });
});

// ========== EXPENSE CLAIMS ==========
router.get("/expense-claims", async (_req, res) => {
  res.json(await q(`SELECT * FROM expense_claims ORDER BY claim_date DESC, id DESC`));
});

router.get("/expense-claims/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='submitted') as submitted,
    COUNT(*) FILTER (WHERE status='under_review') as under_review,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='paid') as paid,
    COUNT(*) FILTER (WHERE status='rejected') as rejected,
    COALESCE(SUM(total_claimed), 0) as total_claimed_sum,
    COALESCE(SUM(total_approved), 0) as total_approved_sum,
    COALESCE(SUM(total_paid), 0) as total_paid_sum,
    COALESCE(SUM(balance_due) FILTER (WHERE status IN ('approved','partially_approved')), 0) as pending_payment
  FROM expense_claims WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/expense-claims", async (req, res) => {
  const d = req.body;
  const num = await nextNum("EXC-", "expense_claims", "claim_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO expense_claims (claim_number, claim_date, employee_name, department, claim_type, period_from, period_to, status, currency, total_claimed, items_count, travel_km, travel_rate, travel_amount, meals_amount, accommodation_amount, transport_amount, other_amount, cost_center, project_name, notes, created_by, created_by_name)
    VALUES ('${num}', '${d.claimDate||new Date().toISOString().slice(0,10)}', ${s(d.employeeName)}, ${s(d.department)}, '${d.claimType||'business'}', ${d.periodFrom?`'${d.periodFrom}'`:'NULL'}, ${d.periodTo?`'${d.periodTo}'`:'NULL'}, '${d.status||'draft'}', '${d.currency||'ILS'}', ${d.totalClaimed||0}, ${d.itemsCount||0}, ${d.travelKm||0}, ${d.travelRate||0}, ${d.travelAmount||0}, ${d.mealsAmount||0}, ${d.accommodationAmount||0}, ${d.transportAmount||0}, ${d.otherAmount||0}, ${s(d.costCenter)}, ${s(d.projectName)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM expense_claims WHERE claim_number='${num}'`))[0]);
});

router.put("/expense-claims/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.employeeName) sets.push(`employee_name=${s(d.employeeName)}`);
  if (d.department) sets.push(`department=${s(d.department)}`);
  if (d.claimType) sets.push(`claim_type='${d.claimType}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.totalClaimed !== undefined) sets.push(`total_claimed=${d.totalClaimed}`);
  if (d.totalApproved !== undefined) sets.push(`total_approved=${d.totalApproved}`);
  if (d.totalRejected !== undefined) sets.push(`total_rejected=${d.totalRejected}`);
  if (d.totalPaid !== undefined) sets.push(`total_paid=${d.totalPaid}`);
  if (d.travelKm !== undefined) sets.push(`travel_km=${d.travelKm}`);
  if (d.travelAmount !== undefined) sets.push(`travel_amount=${d.travelAmount}`);
  if (d.mealsAmount !== undefined) sets.push(`meals_amount=${d.mealsAmount}`);
  if (d.accommodationAmount !== undefined) sets.push(`accommodation_amount=${d.accommodationAmount}`);
  if (d.transportAmount !== undefined) sets.push(`transport_amount=${d.transportAmount}`);
  if (d.otherAmount !== undefined) sets.push(`other_amount=${d.otherAmount}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.rejectionReason) sets.push(`rejection_reason=${s(d.rejectionReason)}`);
  if (d.status === 'approved') { sets.push(`approver_name=${s((req as any).user?.fullName)}`); sets.push(`approved_at=NOW()`); }
  if (d.status === 'paid') { sets.push(`paid_date='${d.paidDate||new Date().toISOString().slice(0,10)}'`); }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE expense_claims SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM expense_claims WHERE id=${req.params.id}`))[0]);
});

router.delete("/expense-claims/:id", async (req, res) => {
  await q(`DELETE FROM expense_claims WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== PAYMENT RUNS ==========
router.get("/payment-runs", async (_req, res) => {
  res.json(await q(`SELECT * FROM payment_runs ORDER BY run_date DESC, id DESC`));
});

router.get("/payment-runs/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='pending_approval') as pending,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='executed') as executed,
    COUNT(*) FILTER (WHERE status='failed') as failed,
    COALESCE(SUM(total_amount), 0) as total_amount_sum,
    COALESCE(SUM(net_payment), 0) as total_net_sum,
    COALESCE(SUM(total_invoices), 0) as total_invoices_sum,
    COALESCE(SUM(total_withholding_tax), 0) as total_withholding_sum
  FROM payment_runs WHERE status != 'cancelled'`);
  res.json(rows[0] || {});
});

router.post("/payment-runs", async (req, res) => {
  const d = req.body;
  const num = await nextNum("PR-", "payment_runs", "run_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO payment_runs (run_number, run_date, run_type, payment_method, bank_account, status, currency, total_invoices, total_suppliers, total_amount, total_vat, total_withholding_tax, net_payment, payment_date, value_date, cut_off_date, min_amount, include_overdue_only, notes, created_by, created_by_name)
    VALUES ('${num}', '${d.runDate||new Date().toISOString().slice(0,10)}', '${d.runType||'supplier'}', '${d.paymentMethod||'bank_transfer'}', ${s(d.bankAccount)}, '${d.status||'draft'}', '${d.currency||'ILS'}', ${d.totalInvoices||0}, ${d.totalSuppliers||0}, ${d.totalAmount||0}, ${d.totalVat||0}, ${d.totalWithholdingTax||0}, ${d.netPayment||0}, ${d.paymentDate?`'${d.paymentDate}'`:'NULL'}, ${d.valueDate?`'${d.valueDate}'`:'NULL'}, ${d.cutOffDate?`'${d.cutOffDate}'`:'NULL'}, ${d.minAmount||0}, ${d.includeOverdueOnly||false}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM payment_runs WHERE run_number='${num}'`))[0]);
});

router.put("/payment-runs/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.runType) sets.push(`run_type='${d.runType}'`);
  if (d.paymentMethod) sets.push(`payment_method='${d.paymentMethod}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.totalInvoices !== undefined) sets.push(`total_invoices=${d.totalInvoices}`);
  if (d.totalSuppliers !== undefined) sets.push(`total_suppliers=${d.totalSuppliers}`);
  if (d.totalAmount !== undefined) sets.push(`total_amount=${d.totalAmount}`);
  if (d.totalVat !== undefined) sets.push(`total_vat=${d.totalVat}`);
  if (d.totalWithholdingTax !== undefined) sets.push(`total_withholding_tax=${d.totalWithholdingTax}`);
  if (d.netPayment !== undefined) sets.push(`net_payment=${d.netPayment}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.status === 'approved') { sets.push(`approved_by=${s((req as any).user?.fullName)}`); sets.push(`approved_at=NOW()`); }
  if (d.status === 'executed') { sets.push(`executed_by=${s((req as any).user?.fullName)}`); sets.push(`executed_at=NOW()`); }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE payment_runs SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM payment_runs WHERE id=${req.params.id}`))[0]);
});

router.delete("/payment-runs/:id", async (req, res) => {
  await q(`DELETE FROM payment_runs WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== WITHHOLDING TAX ==========
router.get("/withholding-tax", async (_req, res) => {
  res.json(await q(`SELECT * FROM withholding_tax ORDER BY tax_year DESC, tax_month DESC NULLS LAST, id DESC`));
});

router.get("/withholding-tax/stats", async (_req, res) => {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE tax_year=${year}) as current_year,
    COUNT(*) FILTER (WHERE status='active') as active,
    COUNT(*) FILTER (WHERE status='reported') as reported,
    COALESCE(SUM(gross_amount) FILTER (WHERE tax_year=${year}), 0) as gross_total,
    COALESCE(SUM(tax_withheld) FILTER (WHERE tax_year=${year}), 0) as withheld_total,
    COALESCE(SUM(net_paid) FILTER (WHERE tax_year=${year}), 0) as net_total,
    COALESCE(AVG(tax_rate) FILTER (WHERE tax_year=${year} AND tax_rate > 0), 0) as avg_rate
  FROM withholding_tax`);
  res.json(rows[0] || {});
});

router.post("/withholding-tax", async (req, res) => {
  const d = req.body;
  const num = await nextNum("WHT-", "withholding_tax", "certificate_number");
  const user = (req as any).user;
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  await q(`INSERT INTO withholding_tax (certificate_number, tax_year, tax_month, entity_name, entity_type, entity_tax_id, certificate_type, tax_rate, gross_amount, tax_withheld, invoice_number, invoice_date, payment_date, payment_method, status, certificate_valid_from, certificate_valid_to, exemption_pct, reduced_rate, authority_reference, notes, created_by, created_by_name)
    VALUES ('${num}', ${d.taxYear||new Date().getFullYear()}, ${d.taxMonth||'NULL'}, ${s(d.entityName)}, '${d.entityType||'supplier'}', ${s(d.entityTaxId)}, '${d.certificateType||'withholding'}', ${d.taxRate||0}, ${d.grossAmount||0}, ${d.taxWithheld||0}, ${s(d.invoiceNumber)}, ${d.invoiceDate?`'${d.invoiceDate}'`:'NULL'}, ${d.paymentDate?`'${d.paymentDate}'`:'NULL'}, ${s(d.paymentMethod)}, '${d.status||'active'}', ${d.certificateValidFrom?`'${d.certificateValidFrom}'`:'NULL'}, ${d.certificateValidTo?`'${d.certificateValidTo}'`:'NULL'}, ${d.exemptionPct||0}, ${d.reducedRate||'NULL'}, ${s(d.authorityReference)}, ${s(d.notes)}, ${user?.id||'NULL'}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM withholding_tax WHERE certificate_number='${num}'`))[0]);
});

router.put("/withholding-tax/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
  if (d.entityName) sets.push(`entity_name=${s(d.entityName)}`);
  if (d.entityType) sets.push(`entity_type='${d.entityType}'`);
  if (d.entityTaxId) sets.push(`entity_tax_id=${s(d.entityTaxId)}`);
  if (d.taxRate !== undefined) sets.push(`tax_rate=${d.taxRate}`);
  if (d.grossAmount !== undefined) sets.push(`gross_amount=${d.grossAmount}`);
  if (d.taxWithheld !== undefined) sets.push(`tax_withheld=${d.taxWithheld}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.reportedToTax !== undefined) sets.push(`reported_to_tax=${d.reportedToTax}`);
  if (d.reportedToTax) sets.push(`reported_date='${new Date().toISOString().slice(0,10)}'`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE withholding_tax SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM withholding_tax WHERE id=${req.params.id}`))[0]);
});

router.delete("/withholding-tax/:id", async (req, res) => {
  await q(`DELETE FROM withholding_tax WHERE id=${req.params.id} AND status='active'`);
  res.json({ success: true });
});

router.get("/bank-accounts-enterprise", async (_req, res) => {
  res.json(await q(`SELECT * FROM bank_accounts ORDER BY bank_name`));
});

router.get("/bank-accounts-enterprise/stats", async (_req, res) => {
  const r = (await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE is_active = true) as active_count,
    COUNT(*) FILTER (WHERE is_active = false) as inactive_count,
    COUNT(*) FILTER (WHERE account_type = 'checking') as checking_count,
    COUNT(*) FILTER (WHERE account_type = 'savings') as savings_count,
    COALESCE(SUM(current_balance),0) as total_balance,
    COALESCE(SUM(current_balance) FILTER (WHERE current_balance > 0),0) as positive_balance,
    COALESCE(SUM(ABS(current_balance)) FILTER (WHERE current_balance < 0),0) as negative_balance,
    COALESCE(SUM(credit_limit),0) as total_credit_limit,
    COALESCE(SUM(available_balance),0) as total_available
  FROM bank_accounts`))[0] || {};
  res.json(r);
});

router.put("/bank-accounts-enterprise/:id", async (req, res) => {
  const d = req.body; const s = (v: any) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
  const sets: string[] = [];
  if (d.bankName !== undefined) sets.push(`bank_name=${s(d.bankName)}`);
  if (d.branchNumber !== undefined) sets.push(`branch_number=${s(d.branchNumber)}`);
  if (d.accountNumber !== undefined) sets.push(`account_number=${s(d.accountNumber)}`);
  if (d.accountType !== undefined) sets.push(`account_type='${d.accountType}'`);
  if (d.currentBalance !== undefined) sets.push(`current_balance=${Number(d.currentBalance)||0}`);
  if (d.availableBalance !== undefined) sets.push(`available_balance=${Number(d.availableBalance)||0}`);
  if (d.creditLimit !== undefined) sets.push(`credit_limit=${Number(d.creditLimit)||0}`);
  if (d.currency !== undefined) sets.push(`currency='${d.currency||'ILS'}'`);
  if (d.isActive !== undefined) sets.push(`is_active=${d.isActive}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE bank_accounts SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM bank_accounts WHERE id=${req.params.id}`))[0]);
});

router.post("/bank-accounts-enterprise", async (req, res) => {
  const d = req.body; const s = (v: any) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
  const r = await q(`INSERT INTO bank_accounts (bank_name, branch_number, account_number, account_type, current_balance, available_balance, credit_limit, currency, is_active)
    VALUES (${s(d.bankName)}, ${s(d.branchNumber)}, ${s(d.accountNumber)}, '${d.accountType||'checking'}', ${Number(d.currentBalance)||0}, ${Number(d.availableBalance)||Number(d.currentBalance)||0}, ${Number(d.creditLimit)||0}, '${d.currency||'ILS'}', ${d.isActive !== false}) RETURNING *`);
  res.json(r[0]);
});

router.delete("/bank-accounts-enterprise/:id", async (req, res) => {
  await q(`DELETE FROM bank_accounts WHERE id=${req.params.id}`);
  res.json({ success: true });
});

router.get("/projects-enterprise", async (_req, res) => {
  res.json(await q(`SELECT * FROM projects WHERE deleted_at IS NULL ORDER BY created_at DESC`));
});

router.get("/projects-enterprise/stats", async (_req, res) => {
  const r = (await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'active') as active_count,
    COUNT(*) FILTER (WHERE status = 'planning') as planning_count,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
    COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold_count,
    COALESCE(SUM(estimated_revenue),0) as total_estimated_revenue,
    COALESCE(SUM(actual_revenue),0) as total_actual_revenue,
    COALESCE(SUM(actual_cost),0) as total_actual_cost,
    COALESCE(SUM(actual_revenue) - SUM(actual_cost),0) as total_profit,
    CASE WHEN SUM(actual_revenue) > 0 THEN ROUND(((SUM(actual_revenue) - SUM(actual_cost)) / SUM(actual_revenue) * 100)::numeric, 1) ELSE 0 END as avg_margin
  FROM projects WHERE deleted_at IS NULL`))[0] || {};
  res.json(r);
});

router.post("/projects-enterprise", async (req, res) => {
  const d = req.body; const s = (v: any) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
  const num = d.projectNumber || `PRJ-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9999)).padStart(4,'0')}`;
  const r = await q(`INSERT INTO projects (project_number, project_name, customer_name, start_date, end_date, estimated_revenue, estimated_cost, actual_revenue, actual_cost, status, department, manager_name, description)
    VALUES ('${num}', ${s(d.projectName)}, ${s(d.customerName)}, ${d.startDate ? `'${d.startDate}'` : 'NULL'}, ${d.endDate ? `'${d.endDate}'` : 'NULL'}, ${Number(d.estimatedRevenue)||0}, ${Number(d.estimatedCost)||0}, ${Number(d.actualRevenue)||0}, ${Number(d.actualCost)||0}, '${d.status||'planning'}', ${s(d.department)}, ${s(d.managerName)}, ${s(d.description)}) RETURNING *`);
  res.json(r[0]);
});

router.put("/projects-enterprise/:id", async (req, res) => {
  const d = req.body; const s = (v: any) => v == null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`;
  const sets: string[] = [];
  if (d.projectName !== undefined) sets.push(`project_name=${s(d.projectName)}`);
  if (d.customerName !== undefined) sets.push(`customer_name=${s(d.customerName)}`);
  if (d.startDate !== undefined) sets.push(`start_date=${d.startDate ? `'${d.startDate}'` : 'NULL'}`);
  if (d.endDate !== undefined) sets.push(`end_date=${d.endDate ? `'${d.endDate}'` : 'NULL'}`);
  if (d.estimatedRevenue !== undefined) sets.push(`estimated_revenue=${Number(d.estimatedRevenue)||0}`);
  if (d.estimatedCost !== undefined) sets.push(`estimated_cost=${Number(d.estimatedCost)||0}`);
  if (d.actualRevenue !== undefined) sets.push(`actual_revenue=${Number(d.actualRevenue)||0}`);
  if (d.actualCost !== undefined) sets.push(`actual_cost=${Number(d.actualCost)||0}`);
  if (d.status !== undefined) sets.push(`status='${d.status}'`);
  if (d.department !== undefined) sets.push(`department=${s(d.department)}`);
  if (d.managerName !== undefined) sets.push(`manager_name=${s(d.managerName)}`);
  if (d.description !== undefined) sets.push(`description=${s(d.description)}`);
  if (d.actualRevenue !== undefined || d.actualCost !== undefined) {
    sets.push(`profit_margin = CASE WHEN COALESCE(actual_revenue,0) > 0 THEN ROUND(((COALESCE(actual_revenue,0) - COALESCE(actual_cost,0)) / COALESCE(actual_revenue,0) * 100)::numeric, 1) ELSE 0 END`);
  }
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE projects SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM projects WHERE id=${req.params.id}`))[0]);
});

router.delete("/projects-enterprise/:id", async (req, res) => {
  await q(`UPDATE projects SET deleted_at=NOW() WHERE id=${req.params.id}`);
  res.json({ success: true });
});

export default router;
