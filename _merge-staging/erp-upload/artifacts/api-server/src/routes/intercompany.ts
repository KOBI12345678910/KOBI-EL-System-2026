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
  catch (e: any) { console.error("Intercompany query error:", e.message); return []; }
}
const s = (v: any) => v != null && v !== "" ? `'${String(v).replace(/'/g, "''")}'` : "NULL";
const n = (v: any) => (v != null && v !== "" ? Number(v) : 0);

async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}

async function ensureTables() {
  await q(`CREATE TABLE IF NOT EXISTS intercompany_entities (
    id SERIAL PRIMARY KEY,
    entity_code VARCHAR(50) UNIQUE NOT NULL,
    entity_name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) DEFAULT 'subsidiary',
    country VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'ILS',
    tax_id VARCHAR(50),
    address TEXT,
    contact_person VARCHAR(255),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    parent_entity_id INTEGER REFERENCES intercompany_entities(id),
    ownership_pct NUMERIC(5,2) DEFAULT 100,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS intercompany_transactions (
    id SERIAL PRIMARY KEY,
    transaction_number VARCHAR(50) UNIQUE NOT NULL,
    transaction_type VARCHAR(50) NOT NULL DEFAULT 'sale',
    from_entity_id INTEGER REFERENCES intercompany_entities(id),
    to_entity_id INTEGER REFERENCES intercompany_entities(id),
    from_entity_name VARCHAR(255),
    to_entity_name VARCHAR(255),
    description TEXT,
    amount NUMERIC(18,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'ILS',
    exchange_rate NUMERIC(12,6) DEFAULT 1,
    amount_local NUMERIC(18,2) DEFAULT 0,
    vat_amount NUMERIC(18,2) DEFAULT 0,
    total_amount NUMERIC(18,2) DEFAULT 0,
    transaction_date DATE DEFAULT CURRENT_DATE,
    due_date DATE,
    reference_doc VARCHAR(100),
    cost_center VARCHAR(100),
    pricing_rule_id INTEGER,
    status VARCHAR(30) DEFAULT 'draft',
    settlement_id INTEGER,
    elimination_status VARCHAR(30) DEFAULT 'pending',
    notes TEXT,
    created_by VARCHAR(255),
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS intercompany_settlements (
    id SERIAL PRIMARY KEY,
    settlement_number VARCHAR(50) UNIQUE NOT NULL,
    entity_a_id INTEGER REFERENCES intercompany_entities(id),
    entity_b_id INTEGER REFERENCES intercompany_entities(id),
    entity_a_name VARCHAR(255),
    entity_b_name VARCHAR(255),
    net_amount NUMERIC(18,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'ILS',
    settlement_date DATE DEFAULT CURRENT_DATE,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(100),
    status VARCHAR(30) DEFAULT 'pending',
    transactions_count INTEGER DEFAULT 0,
    period_from DATE,
    period_to DATE,
    notes TEXT,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    created_by VARCHAR(255),
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS transfer_pricing_rules (
    id SERIAL PRIMARY KEY,
    rule_code VARCHAR(50) UNIQUE NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    from_entity_id INTEGER REFERENCES intercompany_entities(id),
    to_entity_id INTEGER REFERENCES intercompany_entities(id),
    from_entity_name VARCHAR(255),
    to_entity_name VARCHAR(255),
    pricing_method VARCHAR(50) DEFAULT 'cost_plus',
    markup_pct NUMERIC(8,2) DEFAULT 0,
    product_category VARCHAR(100),
    service_type VARCHAR(100),
    effective_from DATE,
    effective_to DATE,
    min_amount NUMERIC(18,2),
    max_amount NUMERIC(18,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    documentation_ref VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
}
ensureTables();

// ========== ENTITIES ==========
router.get("/intercompany/entities", async (_req, res) => {
  res.json(await q(`SELECT e.*, p.entity_name as parent_entity_name FROM intercompany_entities e LEFT JOIN intercompany_entities p ON e.parent_entity_id = p.id ORDER BY e.entity_name`));
});

router.get("/intercompany/entities/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM intercompany_entities WHERE id=${parseInt(req.params.id)}`);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: "ישות לא נמצאה" });
});

router.post("/intercompany/entities", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO intercompany_entities (entity_code, entity_name, entity_type, country, currency, tax_id, address, contact_person, contact_email, contact_phone, parent_entity_id, ownership_pct, status, notes)
    VALUES (${s(d.entityCode)}, ${s(d.entityName)}, ${s(d.entityType||'subsidiary')}, ${s(d.country)}, ${s(d.currency||'ILS')}, ${s(d.taxId)}, ${s(d.address)}, ${s(d.contactPerson)}, ${s(d.contactEmail)}, ${s(d.contactPhone)}, ${d.parentEntityId||'NULL'}, ${n(d.ownershipPct)||100}, ${s(d.status||'active')}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM intercompany_entities WHERE entity_code=${s(d.entityCode)}`);
  res.json(rows[0]);
});

router.put("/intercompany/entities/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  await q(`UPDATE intercompany_entities SET entity_code=${s(d.entityCode)}, entity_name=${s(d.entityName)}, entity_type=${s(d.entityType)}, country=${s(d.country)}, currency=${s(d.currency)}, tax_id=${s(d.taxId)}, address=${s(d.address)}, contact_person=${s(d.contactPerson)}, contact_email=${s(d.contactEmail)}, contact_phone=${s(d.contactPhone)}, parent_entity_id=${d.parentEntityId||'NULL'}, ownership_pct=${n(d.ownershipPct)}, status=${s(d.status)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  const rows = await q(`SELECT * FROM intercompany_entities WHERE id=${id}`);
  res.json(rows[0]);
});

router.delete("/intercompany/entities/:id", async (req, res) => {
  await q(`DELETE FROM intercompany_entities WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== TRANSACTIONS ==========
router.get("/intercompany/transactions", async (_req, res) => {
  res.json(await q(`SELECT t.*, fe.entity_name as from_name, te.entity_name as to_name FROM intercompany_transactions t LEFT JOIN intercompany_entities fe ON t.from_entity_id = fe.id LEFT JOIN intercompany_entities te ON t.to_entity_id = te.id ORDER BY t.transaction_date DESC, t.id DESC`));
});

router.get("/intercompany/transactions/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='settled') as settled,
    COALESCE(SUM(total_amount), 0) as total_volume,
    COALESCE(SUM(total_amount) FILTER (WHERE status='approved' AND settlement_id IS NULL), 0) as pending_settlement,
    COUNT(*) FILTER (WHERE elimination_status='pending') as pending_elimination,
    COUNT(DISTINCT from_entity_id) + COUNT(DISTINCT to_entity_id) as entities_involved
  FROM intercompany_transactions`);
  res.json(rows[0] || {});
});

router.post("/intercompany/transactions", async (req, res) => {
  const d = req.body; const user = (req as any).user;
  const num = await nextNum("ICT-", "intercompany_transactions", "transaction_number");
  const amt = n(d.amount); const vat = n(d.vatAmount); const total = amt + vat;
  const amtLocal = amt * n(d.exchangeRate || 1);
  await q(`INSERT INTO intercompany_transactions (transaction_number, transaction_type, from_entity_id, to_entity_id, from_entity_name, to_entity_name, description, amount, currency, exchange_rate, amount_local, vat_amount, total_amount, transaction_date, due_date, reference_doc, cost_center, pricing_rule_id, status, notes, created_by, created_by_name)
    VALUES ('${num}', ${s(d.transactionType||'sale')}, ${d.fromEntityId||'NULL'}, ${d.toEntityId||'NULL'}, ${s(d.fromEntityName)}, ${s(d.toEntityName)}, ${s(d.description)}, ${amt}, ${s(d.currency||'ILS')}, ${n(d.exchangeRate||1)}, ${amtLocal}, ${vat}, ${total}, ${s(d.transactionDate||new Date().toISOString().slice(0,10))}, ${s(d.dueDate)}, ${s(d.referenceDoc)}, ${s(d.costCenter)}, ${d.pricingRuleId||'NULL'}, ${s(d.status||'draft')}, ${s(d.notes)}, ${s(user?.id)}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM intercompany_transactions WHERE transaction_number='${num}'`))[0]);
});

router.put("/intercompany/transactions/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  const amt = n(d.amount); const vat = n(d.vatAmount); const total = amt + vat;
  await q(`UPDATE intercompany_transactions SET transaction_type=${s(d.transactionType)}, from_entity_id=${d.fromEntityId||'NULL'}, to_entity_id=${d.toEntityId||'NULL'}, from_entity_name=${s(d.fromEntityName)}, to_entity_name=${s(d.toEntityName)}, description=${s(d.description)}, amount=${amt}, currency=${s(d.currency)}, exchange_rate=${n(d.exchangeRate||1)}, vat_amount=${vat}, total_amount=${total}, transaction_date=${s(d.transactionDate)}, due_date=${s(d.dueDate)}, reference_doc=${s(d.referenceDoc)}, cost_center=${s(d.costCenter)}, pricing_rule_id=${d.pricingRuleId||'NULL'}, status=${s(d.status)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM intercompany_transactions WHERE id=${id}`))[0]);
});

router.delete("/intercompany/transactions/:id", async (req, res) => {
  await q(`DELETE FROM intercompany_transactions WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== SETTLEMENTS ==========
router.get("/intercompany/settlements", async (_req, res) => {
  res.json(await q(`SELECT * FROM intercompany_settlements ORDER BY settlement_date DESC, id DESC`));
});

router.post("/intercompany/settlements", async (req, res) => {
  const d = req.body; const user = (req as any).user;
  const num = await nextNum("ICS-", "intercompany_settlements", "settlement_number");
  await q(`INSERT INTO intercompany_settlements (settlement_number, entity_a_id, entity_b_id, entity_a_name, entity_b_name, net_amount, currency, settlement_date, payment_method, payment_reference, status, transactions_count, period_from, period_to, notes, created_by, created_by_name)
    VALUES ('${num}', ${d.entityAId||'NULL'}, ${d.entityBId||'NULL'}, ${s(d.entityAName)}, ${s(d.entityBName)}, ${n(d.netAmount)}, ${s(d.currency||'ILS')}, ${s(d.settlementDate||new Date().toISOString().slice(0,10))}, ${s(d.paymentMethod)}, ${s(d.paymentReference)}, ${s(d.status||'pending')}, ${n(d.transactionsCount)}, ${s(d.periodFrom)}, ${s(d.periodTo)}, ${s(d.notes)}, ${s(user?.id)}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM intercompany_settlements WHERE settlement_number='${num}'`))[0]);
});

router.post("/intercompany/settlements/:id/process", async (req, res) => {
  const id = parseInt(req.params.id); const user = (req as any).user;
  await q(`UPDATE intercompany_settlements SET status='completed', approved_by=${s(user?.fullName)}, approved_at=NOW(), updated_at=NOW() WHERE id=${id}`);
  // Mark related transactions as settled
  await q(`UPDATE intercompany_transactions SET status='settled', settlement_id=${id}, updated_at=NOW() WHERE settlement_id=${id} OR (status='approved' AND ((from_entity_id=(SELECT entity_a_id FROM intercompany_settlements WHERE id=${id}) AND to_entity_id=(SELECT entity_b_id FROM intercompany_settlements WHERE id=${id})) OR (from_entity_id=(SELECT entity_b_id FROM intercompany_settlements WHERE id=${id}) AND to_entity_id=(SELECT entity_a_id FROM intercompany_settlements WHERE id=${id}))))`);
  res.json((await q(`SELECT * FROM intercompany_settlements WHERE id=${id}`))[0]);
});

router.put("/intercompany/settlements/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  await q(`UPDATE intercompany_settlements SET entity_a_id=${d.entityAId||'NULL'}, entity_b_id=${d.entityBId||'NULL'}, entity_a_name=${s(d.entityAName)}, entity_b_name=${s(d.entityBName)}, net_amount=${n(d.netAmount)}, currency=${s(d.currency)}, settlement_date=${s(d.settlementDate)}, payment_method=${s(d.paymentMethod)}, payment_reference=${s(d.paymentReference)}, status=${s(d.status)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM intercompany_settlements WHERE id=${id}`))[0]);
});

router.delete("/intercompany/settlements/:id", async (req, res) => {
  await q(`DELETE FROM intercompany_settlements WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== TRANSFER PRICING RULES ==========
router.get("/intercompany/pricing-rules", async (_req, res) => {
  res.json(await q(`SELECT * FROM transfer_pricing_rules ORDER BY rule_name`));
});

router.post("/intercompany/pricing-rules", async (req, res) => {
  const d = req.body;
  const code = `TPR-${Date.now()}`;
  await q(`INSERT INTO transfer_pricing_rules (rule_code, rule_name, from_entity_id, to_entity_id, from_entity_name, to_entity_name, pricing_method, markup_pct, product_category, service_type, effective_from, effective_to, min_amount, max_amount, currency, documentation_ref, status, notes)
    VALUES (${s(d.ruleCode||code)}, ${s(d.ruleName)}, ${d.fromEntityId||'NULL'}, ${d.toEntityId||'NULL'}, ${s(d.fromEntityName)}, ${s(d.toEntityName)}, ${s(d.pricingMethod||'cost_plus')}, ${n(d.markupPct)}, ${s(d.productCategory)}, ${s(d.serviceType)}, ${s(d.effectiveFrom)}, ${s(d.effectiveTo)}, ${d.minAmount||'NULL'}, ${d.maxAmount||'NULL'}, ${s(d.currency||'ILS')}, ${s(d.documentationRef)}, ${s(d.status||'active')}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM transfer_pricing_rules ORDER BY id DESC LIMIT 1`);
  res.json(rows[0]);
});

router.put("/intercompany/pricing-rules/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  await q(`UPDATE transfer_pricing_rules SET rule_name=${s(d.ruleName)}, from_entity_id=${d.fromEntityId||'NULL'}, to_entity_id=${d.toEntityId||'NULL'}, from_entity_name=${s(d.fromEntityName)}, to_entity_name=${s(d.toEntityName)}, pricing_method=${s(d.pricingMethod)}, markup_pct=${n(d.markupPct)}, product_category=${s(d.productCategory)}, service_type=${s(d.serviceType)}, effective_from=${s(d.effectiveFrom)}, effective_to=${s(d.effectiveTo)}, min_amount=${d.minAmount||'NULL'}, max_amount=${d.maxAmount||'NULL'}, currency=${s(d.currency)}, documentation_ref=${s(d.documentationRef)}, status=${s(d.status)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM transfer_pricing_rules WHERE id=${id}`))[0]);
});

router.delete("/intercompany/pricing-rules/:id", async (req, res) => {
  await q(`DELETE FROM transfer_pricing_rules WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== ELIMINATION ENTRIES ==========
router.get("/intercompany/eliminations", async (_req, res) => {
  const rows = await q(`SELECT t.*, fe.entity_name as from_name, te.entity_name as to_name
    FROM intercompany_transactions t
    LEFT JOIN intercompany_entities fe ON t.from_entity_id = fe.id
    LEFT JOIN intercompany_entities te ON t.to_entity_id = te.id
    WHERE t.elimination_status = 'pending' AND t.status IN ('approved','settled')
    ORDER BY t.transaction_date DESC`);
  res.json(rows);
});

router.post("/intercompany/eliminations/process", async (req, res) => {
  const { transactionIds } = req.body;
  if (!transactionIds?.length) { res.status(400).json({ error: "לא נבחרו עסקאות" }); return; }
  const ids = transactionIds.join(",");
  await q(`UPDATE intercompany_transactions SET elimination_status='eliminated', updated_at=NOW() WHERE id IN (${ids})`);
  res.json({ success: true, processed: transactionIds.length });
});

// ========== CONSOLIDATION REPORT ==========
router.get("/intercompany/consolidation-report", async (req, res) => {
  const { periodFrom, periodTo } = req.query;
  let dateFilter = "";
  if (periodFrom) dateFilter += ` AND t.transaction_date >= '${periodFrom}'`;
  if (periodTo) dateFilter += ` AND t.transaction_date <= '${periodTo}'`;

  const summary = await q(`SELECT
    COUNT(*) as total_transactions,
    COALESCE(SUM(total_amount), 0) as total_volume,
    COUNT(*) FILTER (WHERE elimination_status='eliminated') as eliminated,
    COUNT(*) FILTER (WHERE elimination_status='pending') as pending_elimination,
    COALESCE(SUM(total_amount) FILTER (WHERE elimination_status='eliminated'), 0) as eliminated_amount,
    COALESCE(SUM(total_amount) FILTER (WHERE elimination_status='pending'), 0) as pending_amount
  FROM intercompany_transactions t WHERE 1=1 ${dateFilter}`);

  const byEntity = await q(`SELECT e.entity_name,
    COALESCE(SUM(CASE WHEN t.from_entity_id = e.id THEN t.total_amount ELSE 0 END), 0) as total_outgoing,
    COALESCE(SUM(CASE WHEN t.to_entity_id = e.id THEN t.total_amount ELSE 0 END), 0) as total_incoming,
    COALESCE(SUM(CASE WHEN t.to_entity_id = e.id THEN t.total_amount ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN t.from_entity_id = e.id THEN t.total_amount ELSE 0 END), 0) as net_position
  FROM intercompany_entities e
  LEFT JOIN intercompany_transactions t ON (t.from_entity_id = e.id OR t.to_entity_id = e.id) ${dateFilter ? 'AND 1=1 ' + dateFilter : ''}
  GROUP BY e.id, e.entity_name ORDER BY e.entity_name`);

  const byType = await q(`SELECT transaction_type, COUNT(*) as count, COALESCE(SUM(total_amount),0) as amount FROM intercompany_transactions t WHERE 1=1 ${dateFilter} GROUP BY transaction_type`);

  res.json({ summary: summary[0] || {}, byEntity, byType });
});

export default router;
