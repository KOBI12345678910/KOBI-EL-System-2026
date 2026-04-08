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
  catch (e: any) { console.error("Pricing-Enterprise query error:", e.message); return []; }
}

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

const s = (v: any) => v ? `'${String(v).replace(/'/g, "''")}'` : "NULL";

// ========== PRICE LISTS ==========
router.get("/price-lists-ent", async (_req, res) => {
  res.json(await q(`SELECT * FROM price_lists_ent ORDER BY updated_at DESC, id DESC`));
});

router.get("/price-lists-ent/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='active') as active,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='expired') as expired,
    COALESCE(SUM(total_products), 0) as total_products,
    COUNT(DISTINCT customer_category) as categories,
    MAX(updated_at) as last_update
  FROM price_lists_ent`);
  res.json(rows[0] || {});
});

router.post("/price-lists-ent", async (req, res) => {
  const d = req.body;
  const num = await nextNum("PL-", "price_lists_ent", "list_number");
  await q(`INSERT INTO price_lists_ent (list_number, list_name, list_type, customer_category, currency, valid_from, valid_to, discount_percent, items_json, total_products, status, notes)
    VALUES ('${num}', ${s(d.listName)}, '${d.listType || 'general'}', ${s(d.customerCategory)}, '${d.currency || 'ILS'}', ${d.validFrom ? `'${d.validFrom}'` : 'NULL'}, ${d.validTo ? `'${d.validTo}'` : 'NULL'}, ${d.discountPercent || 0}, ${d.itemsJson ? `'${JSON.stringify(d.itemsJson).replace(/'/g, "''")}'` : "'[]'"}, ${d.totalProducts || 0}, '${d.status || 'draft'}', ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM price_lists_ent WHERE list_number='${num}'`))[0]);
});

router.put("/price-lists-ent/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.listName) sets.push(`list_name=${s(d.listName)}`);
  if (d.listType) sets.push(`list_type='${d.listType}'`);
  if (d.customerCategory !== undefined) sets.push(`customer_category=${s(d.customerCategory)}`);
  if (d.currency) sets.push(`currency='${d.currency}'`);
  if (d.validFrom) sets.push(`valid_from='${d.validFrom}'`);
  if (d.validTo) sets.push(`valid_to='${d.validTo}'`);
  if (d.discountPercent !== undefined) sets.push(`discount_percent=${d.discountPercent}`);
  if (d.totalProducts !== undefined) sets.push(`total_products=${d.totalProducts}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.approvedBy) { sets.push(`approved_by=${s(d.approvedBy)}`); sets.push(`approved_at=NOW()`); }
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  if (d.itemsJson) sets.push(`items_json='${JSON.stringify(d.itemsJson).replace(/'/g, "''")}'`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE price_lists_ent SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM price_lists_ent WHERE id=${req.params.id}`))[0]);
});

router.delete("/price-lists-ent/:id", async (req, res) => {
  await q(`DELETE FROM price_lists_ent WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== COST CALCULATIONS ==========
router.get("/cost-calculations", async (_req, res) => {
  res.json(await q(`SELECT * FROM cost_calculations ORDER BY updated_at DESC, id DESC`));
});

router.get("/cost-calculations/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COALESCE(AVG(margin_percent::numeric), 0) as avg_margin,
    COALESCE(AVG(total_cost::numeric), 0) as avg_cost,
    COUNT(*) FILTER (WHERE selling_price::numeric = 0 OR selling_price IS NULL) as unpriced,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COALESCE(SUM(profit::numeric), 0) as total_profit,
    COUNT(DISTINCT category) as categories
  FROM cost_calculations`);
  res.json(rows[0] || {});
});

router.post("/cost-calculations", async (req, res) => {
  const d = req.body;
  const num = await nextNum("CC-", "cost_calculations", "calculation_number");
  const totalCost = (Number(d.materialsCost) || 0) + (Number(d.laborCost) || 0) + (Number(d.overheadCost) || 0) + (Number(d.packagingCost) || 0) + (Number(d.shippingCost) || 0) + (Number(d.customsCost) || 0) + (Number(d.otherCosts) || 0);
  const margin = Number(d.marginPercent) || 0;
  const sellingPrice = d.sellingPrice || (totalCost * (1 + margin / 100));
  const profit = sellingPrice - totalCost;
  await q(`INSERT INTO cost_calculations (calculation_number, product_name, product_code, category, materials_cost, labor_cost, overhead_cost, packaging_cost, shipping_cost, customs_cost, other_costs, total_cost, margin_percent, selling_price, profit, currency, status, calculated_by, notes)
    VALUES ('${num}', ${s(d.productName)}, ${s(d.productCode)}, ${s(d.category)}, ${d.materialsCost || 0}, ${d.laborCost || 0}, ${d.overheadCost || 0}, ${d.packagingCost || 0}, ${d.shippingCost || 0}, ${d.customsCost || 0}, ${d.otherCosts || 0}, ${totalCost}, ${margin}, ${sellingPrice}, ${profit}, '${d.currency || 'ILS'}', '${d.status || 'draft'}', ${s(d.calculatedBy)}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM cost_calculations WHERE calculation_number='${num}'`))[0]);
});

router.put("/cost-calculations/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.productName) sets.push(`product_name=${s(d.productName)}`);
  if (d.productCode !== undefined) sets.push(`product_code=${s(d.productCode)}`);
  if (d.category !== undefined) sets.push(`category=${s(d.category)}`);
  if (d.materialsCost !== undefined) sets.push(`materials_cost=${d.materialsCost}`);
  if (d.laborCost !== undefined) sets.push(`labor_cost=${d.laborCost}`);
  if (d.overheadCost !== undefined) sets.push(`overhead_cost=${d.overheadCost}`);
  if (d.packagingCost !== undefined) sets.push(`packaging_cost=${d.packagingCost}`);
  if (d.shippingCost !== undefined) sets.push(`shipping_cost=${d.shippingCost}`);
  if (d.customsCost !== undefined) sets.push(`customs_cost=${d.customsCost}`);
  if (d.otherCosts !== undefined) sets.push(`other_costs=${d.otherCosts}`);
  if (d.totalCost !== undefined) sets.push(`total_cost=${d.totalCost}`);
  if (d.marginPercent !== undefined) sets.push(`margin_percent=${d.marginPercent}`);
  if (d.sellingPrice !== undefined) sets.push(`selling_price=${d.sellingPrice}`);
  if (d.profit !== undefined) sets.push(`profit=${d.profit}`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.approvedBy) sets.push(`approved_by=${s(d.approvedBy)}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE cost_calculations SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM cost_calculations WHERE id=${req.params.id}`))[0]);
});

router.delete("/cost-calculations/:id", async (req, res) => {
  await q(`DELETE FROM cost_calculations WHERE id=${req.params.id} AND status='draft'`);
  res.json({ success: true });
});

// ========== COLLECTION MANAGEMENT ==========
router.get("/collection-management", async (_req, res) => {
  res.json(await q(`SELECT * FROM collection_management ORDER BY days_overdue DESC, id DESC`));
});

router.get("/collection-management/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='open') as open_count,
    COALESCE(SUM(balance_due::numeric), 0) as total_outstanding,
    COALESCE(SUM(paid_amount::numeric), 0) as total_paid,
    COALESCE(SUM(paid_amount::numeric) FILTER (WHERE updated_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) as collected_this_month,
    COUNT(*) FILTER (WHERE days_overdue > 90) as over_90_days,
    COUNT(*) FILTER (WHERE risk_level='critical') as critical_risk,
    COUNT(*) FILTER (WHERE risk_level='high') as high_risk,
    COALESCE(AVG(days_overdue), 0) as avg_overdue_days,
    CASE WHEN COALESCE(SUM(original_amount::numeric), 0) > 0 THEN ROUND(SUM(paid_amount::numeric) / SUM(original_amount::numeric) * 100, 1) ELSE 0 END as collection_rate
  FROM collection_management WHERE status NOT IN ('written_off','paid')`);
  res.json(rows[0] || {});
});

router.post("/collection-management", async (req, res) => {
  const d = req.body;
  const num = await nextNum("COL-", "collection_management", "collection_number");
  const balance = (Number(d.originalAmount) || 0) - (Number(d.paidAmount) || 0);
  await q(`INSERT INTO collection_management (collection_number, customer_name, customer_id, invoice_number, invoice_date, due_date, original_amount, paid_amount, balance_due, days_overdue, risk_level, status, collector, phone, email, last_contact_date, next_action, next_action_date, payment_plan, dunning_letters_sent, escalation_level, notes)
    VALUES ('${num}', ${s(d.customerName)}, ${s(d.customerId)}, ${s(d.invoiceNumber)}, ${d.invoiceDate ? `'${d.invoiceDate}'` : 'NULL'}, ${d.dueDate ? `'${d.dueDate}'` : 'NULL'}, ${d.originalAmount || 0}, ${d.paidAmount || 0}, ${balance}, ${d.daysOverdue || 0}, '${d.riskLevel || 'low'}', '${d.status || 'open'}', ${s(d.collector)}, ${s(d.phone)}, ${s(d.email)}, ${d.lastContactDate ? `'${d.lastContactDate}'` : 'NULL'}, ${s(d.nextAction)}, ${d.nextActionDate ? `'${d.nextActionDate}'` : 'NULL'}, ${s(d.paymentPlan)}, ${d.dunningLettersSent || 0}, ${d.escalationLevel || 0}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM collection_management WHERE collection_number='${num}'`))[0]);
});

router.put("/collection-management/:id", async (req, res) => {
  const d = req.body; const sets: string[] = [];
  if (d.customerName) sets.push(`customer_name=${s(d.customerName)}`);
  if (d.invoiceNumber !== undefined) sets.push(`invoice_number=${s(d.invoiceNumber)}`);
  if (d.originalAmount !== undefined) sets.push(`original_amount=${d.originalAmount}`);
  if (d.paidAmount !== undefined) {
    sets.push(`paid_amount=${d.paidAmount}`);
    if (d.originalAmount !== undefined) {
      sets.push(`balance_due=${(Number(d.originalAmount) || 0) - (Number(d.paidAmount) || 0)}`);
    }
  }
  if (d.dueDate) sets.push(`due_date='${d.dueDate}'`);
  if (d.daysOverdue !== undefined) sets.push(`days_overdue=${d.daysOverdue}`);
  if (d.riskLevel) sets.push(`risk_level='${d.riskLevel}'`);
  if (d.status) sets.push(`status='${d.status}'`);
  if (d.collector !== undefined) sets.push(`collector=${s(d.collector)}`);
  if (d.phone !== undefined) sets.push(`phone=${s(d.phone)}`);
  if (d.email !== undefined) sets.push(`email=${s(d.email)}`);
  if (d.lastContactDate) sets.push(`last_contact_date='${d.lastContactDate}'`);
  if (d.nextAction !== undefined) sets.push(`next_action=${s(d.nextAction)}`);
  if (d.nextActionDate) sets.push(`next_action_date='${d.nextActionDate}'`);
  if (d.paymentPlan !== undefined) sets.push(`payment_plan=${s(d.paymentPlan)}`);
  if (d.dunningLettersSent !== undefined) sets.push(`dunning_letters_sent=${d.dunningLettersSent}`);
  if (d.escalationLevel !== undefined) sets.push(`escalation_level=${d.escalationLevel}`);
  if (d.notes !== undefined) sets.push(`notes=${s(d.notes)}`);
  sets.push(`updated_at=NOW()`);
  await q(`UPDATE collection_management SET ${sets.join(",")} WHERE id=${req.params.id}`);
  res.json((await q(`SELECT * FROM collection_management WHERE id=${req.params.id}`))[0]);
});

router.delete("/collection-management/:id", async (req, res) => {
  await q(`DELETE FROM collection_management WHERE id=${req.params.id} AND status='open'`);
  res.json({ success: true });
});

export default router;
