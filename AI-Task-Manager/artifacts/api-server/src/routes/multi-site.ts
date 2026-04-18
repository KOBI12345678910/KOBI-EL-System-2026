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
  catch (e: any) { console.error("MultiSite query error:", e.message); return []; }
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
  await q(`CREATE TABLE IF NOT EXISTS sites (
    id SERIAL PRIMARY KEY,
    site_code VARCHAR(50) UNIQUE NOT NULL,
    site_name VARCHAR(255) NOT NULL,
    site_type VARCHAR(50) DEFAULT 'branch',
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(100) DEFAULT 'ישראל',
    phone VARCHAR(50),
    email VARCHAR(255),
    manager VARCHAR(255),
    manager_id INTEGER,
    default_warehouse VARCHAR(100),
    default_currency VARCHAR(10) DEFAULT 'ILS',
    tax_config JSONB DEFAULT '{}',
    working_hours TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    parent_site_id INTEGER REFERENCES sites(id),
    employee_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS site_configurations (
    id SERIAL PRIMARY KEY,
    site_id INTEGER REFERENCES sites(id) ON DELETE CASCADE,
    site_code VARCHAR(50),
    config_key VARCHAR(100) NOT NULL,
    config_value TEXT,
    config_type VARCHAR(30) DEFAULT 'string',
    category VARCHAR(50) DEFAULT 'general',
    description TEXT,
    is_inherited BOOLEAN DEFAULT false,
    override_parent BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(site_id, config_key)
  )`);
  await q(`CREATE TABLE IF NOT EXISTS inter_site_transfers (
    id SERIAL PRIMARY KEY,
    transfer_number VARCHAR(50) UNIQUE NOT NULL,
    from_site_id INTEGER REFERENCES sites(id),
    to_site_id INTEGER REFERENCES sites(id),
    from_site_name VARCHAR(255),
    to_site_name VARCHAR(255),
    transfer_type VARCHAR(50) DEFAULT 'inventory',
    status VARCHAR(30) DEFAULT 'draft',
    item_description TEXT,
    item_sku VARCHAR(100),
    quantity NUMERIC(18,3) DEFAULT 0,
    unit VARCHAR(30) DEFAULT 'יחידה',
    unit_cost NUMERIC(18,2) DEFAULT 0,
    total_cost NUMERIC(18,2) DEFAULT 0,
    currency VARCHAR(10) DEFAULT 'ILS',
    request_date DATE DEFAULT CURRENT_DATE,
    ship_date DATE,
    receive_date DATE,
    shipping_method VARCHAR(100),
    tracking_number VARCHAR(100),
    reason TEXT,
    priority VARCHAR(20) DEFAULT 'normal',
    approved_by VARCHAR(255),
    approved_at TIMESTAMP,
    shipped_by VARCHAR(255),
    received_by VARCHAR(255),
    notes TEXT,
    created_by VARCHAR(255),
    created_by_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS site_consolidation_rules (
    id SERIAL PRIMARY KEY,
    rule_code VARCHAR(50) UNIQUE NOT NULL,
    rule_name VARCHAR(255) NOT NULL,
    rule_type VARCHAR(50) DEFAULT 'financial',
    source_site_ids TEXT,
    target_site_id INTEGER REFERENCES sites(id),
    target_site_name VARCHAR(255),
    aggregation_method VARCHAR(50) DEFAULT 'sum',
    metric_name VARCHAR(100),
    metric_category VARCHAR(50),
    currency_conversion BOOLEAN DEFAULT false,
    elimination_entries BOOLEAN DEFAULT false,
    frequency VARCHAR(30) DEFAULT 'monthly',
    last_run_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);
}
ensureTables();

// ========== SITES ==========
router.get("/sites", async (_req, res) => {
  res.json(await q(`SELECT s.*, ps.site_name as parent_site_name FROM sites s LEFT JOIN sites ps ON s.parent_site_id = ps.id ORDER BY s.site_name`));
});

router.get("/sites/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total_sites,
    COUNT(*) FILTER (WHERE status='active') as active_sites,
    COUNT(*) FILTER (WHERE site_type='headquarters') as headquarters,
    COUNT(*) FILTER (WHERE site_type='branch') as branches,
    COUNT(*) FILTER (WHERE site_type='warehouse') as warehouses,
    COUNT(*) FILTER (WHERE site_type='factory') as factories,
    COALESCE(SUM(employee_count), 0) as total_employees,
    COUNT(DISTINCT country) as countries
  FROM sites`);
  res.json(rows[0] || {});
});

router.get("/sites/:id", async (req, res) => {
  const rows = await q(`SELECT * FROM sites WHERE id=${parseInt(req.params.id)}`);
  rows.length ? res.json(rows[0]) : res.status(404).json({ error: "אתר לא נמצא" });
});

router.post("/sites", async (req, res) => {
  const d = req.body;
  await q(`INSERT INTO sites (site_code, site_name, site_type, address, city, country, phone, email, manager, manager_id, default_warehouse, default_currency, tax_config, working_hours, latitude, longitude, parent_site_id, employee_count, status, notes)
    VALUES (${s(d.siteCode)}, ${s(d.siteName)}, ${s(d.siteType||'branch')}, ${s(d.address)}, ${s(d.city)}, ${s(d.country||'ישראל')}, ${s(d.phone)}, ${s(d.email)}, ${s(d.manager)}, ${d.managerId||'NULL'}, ${s(d.defaultWarehouse)}, ${s(d.defaultCurrency||'ILS')}, ${s(d.taxConfig ? JSON.stringify(d.taxConfig) : '{}')}, ${s(d.workingHours)}, ${d.latitude||'NULL'}, ${d.longitude||'NULL'}, ${d.parentSiteId||'NULL'}, ${n(d.employeeCount)}, ${s(d.status||'active')}, ${s(d.notes)})`);
  const rows = await q(`SELECT * FROM sites WHERE site_code=${s(d.siteCode)}`);
  res.json(rows[0]);
});

router.put("/sites/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  await q(`UPDATE sites SET site_code=${s(d.siteCode)}, site_name=${s(d.siteName)}, site_type=${s(d.siteType)}, address=${s(d.address)}, city=${s(d.city)}, country=${s(d.country)}, phone=${s(d.phone)}, email=${s(d.email)}, manager=${s(d.manager)}, manager_id=${d.managerId||'NULL'}, default_warehouse=${s(d.defaultWarehouse)}, default_currency=${s(d.defaultCurrency)}, tax_config=${s(d.taxConfig ? JSON.stringify(d.taxConfig) : '{}')}, working_hours=${s(d.workingHours)}, latitude=${d.latitude||'NULL'}, longitude=${d.longitude||'NULL'}, parent_site_id=${d.parentSiteId||'NULL'}, employee_count=${n(d.employeeCount)}, status=${s(d.status)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM sites WHERE id=${id}`))[0]);
});

router.delete("/sites/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  await q(`DELETE FROM site_configurations WHERE site_id=${id}`);
  await q(`DELETE FROM sites WHERE id=${id}`);
  res.json({ success: true });
});

// ========== SITE CONFIGURATIONS ==========
router.get("/sites/:siteId/config", async (req, res) => {
  res.json(await q(`SELECT * FROM site_configurations WHERE site_id=${parseInt(req.params.siteId)} ORDER BY category, config_key`));
});

router.post("/sites/:siteId/config", async (req, res) => {
  const d = req.body; const siteId = parseInt(req.params.siteId);
  const siteRows = await q(`SELECT site_code FROM sites WHERE id=${siteId}`);
  const siteCode = (siteRows[0] as any)?.site_code || "";
  await q(`INSERT INTO site_configurations (site_id, site_code, config_key, config_value, config_type, category, description, is_inherited, override_parent, status)
    VALUES (${siteId}, ${s(siteCode)}, ${s(d.configKey)}, ${s(d.configValue)}, ${s(d.configType||'string')}, ${s(d.category||'general')}, ${s(d.description)}, ${d.isInherited||false}, ${d.overrideParent||false}, ${s(d.status||'active')})
    ON CONFLICT (site_id, config_key) DO UPDATE SET config_value=${s(d.configValue)}, config_type=${s(d.configType)}, category=${s(d.category)}, description=${s(d.description)}, override_parent=${d.overrideParent||false}, status=${s(d.status)}, updated_at=NOW()`);
  res.json((await q(`SELECT * FROM site_configurations WHERE site_id=${siteId} AND config_key=${s(d.configKey)}`))[0]);
});

router.delete("/sites/:siteId/config/:configId", async (req, res) => {
  await q(`DELETE FROM site_configurations WHERE id=${parseInt(req.params.configId)} AND site_id=${parseInt(req.params.siteId)}`);
  res.json({ success: true });
});

// ========== INTER-SITE TRANSFERS ==========
router.get("/inter-site-transfers", async (_req, res) => {
  res.json(await q(`SELECT t.*, fs.site_name as from_name, ts.site_name as to_name FROM inter_site_transfers t LEFT JOIN sites fs ON t.from_site_id = fs.id LEFT JOIN sites ts ON t.to_site_id = ts.id ORDER BY t.request_date DESC, t.id DESC`));
});

router.get("/inter-site-transfers/stats", async (_req, res) => {
  const rows = await q(`SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='draft') as drafts,
    COUNT(*) FILTER (WHERE status='approved') as approved,
    COUNT(*) FILTER (WHERE status='in_transit') as in_transit,
    COUNT(*) FILTER (WHERE status='received') as received,
    COALESCE(SUM(total_cost), 0) as total_value,
    COALESCE(SUM(total_cost) FILTER (WHERE status='in_transit'), 0) as in_transit_value,
    COUNT(DISTINCT from_site_id) as source_sites,
    COUNT(DISTINCT to_site_id) as dest_sites
  FROM inter_site_transfers`);
  res.json(rows[0] || {});
});

router.post("/inter-site-transfers", async (req, res) => {
  const d = req.body; const user = (req as any).user;
  const num = await nextNum("IST-", "inter_site_transfers", "transfer_number");
  const qty = n(d.quantity); const unitCost = n(d.unitCost); const total = qty * unitCost;
  await q(`INSERT INTO inter_site_transfers (transfer_number, from_site_id, to_site_id, from_site_name, to_site_name, transfer_type, status, item_description, item_sku, quantity, unit, unit_cost, total_cost, currency, request_date, ship_date, shipping_method, tracking_number, reason, priority, notes, created_by, created_by_name)
    VALUES ('${num}', ${d.fromSiteId||'NULL'}, ${d.toSiteId||'NULL'}, ${s(d.fromSiteName)}, ${s(d.toSiteName)}, ${s(d.transferType||'inventory')}, ${s(d.status||'draft')}, ${s(d.itemDescription)}, ${s(d.itemSku)}, ${qty}, ${s(d.unit||'יחידה')}, ${unitCost}, ${total}, ${s(d.currency||'ILS')}, ${s(d.requestDate||new Date().toISOString().slice(0,10))}, ${s(d.shipDate)}, ${s(d.shippingMethod)}, ${s(d.trackingNumber)}, ${s(d.reason)}, ${s(d.priority||'normal')}, ${s(d.notes)}, ${s(user?.id)}, ${s(user?.fullName)})`);
  res.json((await q(`SELECT * FROM inter_site_transfers WHERE transfer_number='${num}'`))[0]);
});

router.put("/inter-site-transfers/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  const qty = n(d.quantity); const unitCost = n(d.unitCost); const total = qty * unitCost;
  await q(`UPDATE inter_site_transfers SET from_site_id=${d.fromSiteId||'NULL'}, to_site_id=${d.toSiteId||'NULL'}, from_site_name=${s(d.fromSiteName)}, to_site_name=${s(d.toSiteName)}, transfer_type=${s(d.transferType)}, status=${s(d.status)}, item_description=${s(d.itemDescription)}, item_sku=${s(d.itemSku)}, quantity=${qty}, unit=${s(d.unit)}, unit_cost=${unitCost}, total_cost=${total}, currency=${s(d.currency)}, request_date=${s(d.requestDate)}, ship_date=${s(d.shipDate)}, receive_date=${s(d.receiveDate)}, shipping_method=${s(d.shippingMethod)}, tracking_number=${s(d.trackingNumber)}, reason=${s(d.reason)}, priority=${s(d.priority)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM inter_site_transfers WHERE id=${id}`))[0]);
});

router.post("/inter-site-transfers/:id/approve", async (req, res) => {
  const id = parseInt(req.params.id); const user = (req as any).user;
  await q(`UPDATE inter_site_transfers SET status='approved', approved_by=${s(user?.fullName)}, approved_at=NOW(), updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM inter_site_transfers WHERE id=${id}`))[0]);
});

router.post("/inter-site-transfers/:id/ship", async (req, res) => {
  const id = parseInt(req.params.id); const user = (req as any).user;
  const d = req.body;
  await q(`UPDATE inter_site_transfers SET status='in_transit', shipped_by=${s(user?.fullName)}, ship_date=${s(d.shipDate||new Date().toISOString().slice(0,10))}, tracking_number=${s(d.trackingNumber)}, shipping_method=${s(d.shippingMethod)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM inter_site_transfers WHERE id=${id}`))[0]);
});

router.post("/inter-site-transfers/:id/receive", async (req, res) => {
  const id = parseInt(req.params.id); const user = (req as any).user;
  await q(`UPDATE inter_site_transfers SET status='received', received_by=${s(user?.fullName)}, receive_date='${new Date().toISOString().slice(0,10)}', updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM inter_site_transfers WHERE id=${id}`))[0]);
});

router.delete("/inter-site-transfers/:id", async (req, res) => {
  await q(`DELETE FROM inter_site_transfers WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== CONSOLIDATION RULES ==========
router.get("/site-consolidation-rules", async (_req, res) => {
  res.json(await q(`SELECT * FROM site_consolidation_rules ORDER BY rule_name`));
});

router.post("/site-consolidation-rules", async (req, res) => {
  const d = req.body;
  const code = d.ruleCode || `SCR-${Date.now()}`;
  await q(`INSERT INTO site_consolidation_rules (rule_code, rule_name, rule_type, source_site_ids, target_site_id, target_site_name, aggregation_method, metric_name, metric_category, currency_conversion, elimination_entries, frequency, status, notes)
    VALUES (${s(code)}, ${s(d.ruleName)}, ${s(d.ruleType||'financial')}, ${s(d.sourceSiteIds)}, ${d.targetSiteId||'NULL'}, ${s(d.targetSiteName)}, ${s(d.aggregationMethod||'sum')}, ${s(d.metricName)}, ${s(d.metricCategory)}, ${d.currencyConversion||false}, ${d.eliminationEntries||false}, ${s(d.frequency||'monthly')}, ${s(d.status||'active')}, ${s(d.notes)})`);
  res.json((await q(`SELECT * FROM site_consolidation_rules ORDER BY id DESC LIMIT 1`))[0]);
});

router.put("/site-consolidation-rules/:id", async (req, res) => {
  const d = req.body; const id = parseInt(req.params.id);
  await q(`UPDATE site_consolidation_rules SET rule_name=${s(d.ruleName)}, rule_type=${s(d.ruleType)}, source_site_ids=${s(d.sourceSiteIds)}, target_site_id=${d.targetSiteId||'NULL'}, target_site_name=${s(d.targetSiteName)}, aggregation_method=${s(d.aggregationMethod)}, metric_name=${s(d.metricName)}, metric_category=${s(d.metricCategory)}, currency_conversion=${d.currencyConversion||false}, elimination_entries=${d.eliminationEntries||false}, frequency=${s(d.frequency)}, status=${s(d.status)}, notes=${s(d.notes)}, updated_at=NOW() WHERE id=${id}`);
  res.json((await q(`SELECT * FROM site_consolidation_rules WHERE id=${id}`))[0]);
});

router.delete("/site-consolidation-rules/:id", async (req, res) => {
  await q(`DELETE FROM site_consolidation_rules WHERE id=${parseInt(req.params.id)}`);
  res.json({ success: true });
});

// ========== CONSOLIDATED REPORTING ==========
router.get("/sites/consolidated-report", async (req, res) => {
  const siteSummary = await q(`SELECT s.id, s.site_code, s.site_name, s.site_type, s.city, s.country, s.employee_count, s.status,
    (SELECT COUNT(*) FROM inter_site_transfers WHERE from_site_id = s.id) as outgoing_transfers,
    (SELECT COUNT(*) FROM inter_site_transfers WHERE to_site_id = s.id) as incoming_transfers,
    (SELECT COALESCE(SUM(total_cost),0) FROM inter_site_transfers WHERE from_site_id = s.id AND status='received') as outgoing_value,
    (SELECT COALESCE(SUM(total_cost),0) FROM inter_site_transfers WHERE to_site_id = s.id AND status='received') as incoming_value
  FROM sites s WHERE s.status='active' ORDER BY s.site_name`);

  const transferVolume = await q(`SELECT
    COALESCE(SUM(total_cost), 0) as total_transfer_value,
    COUNT(*) as total_transfers,
    COUNT(*) FILTER (WHERE status='in_transit') as in_transit,
    COUNT(*) FILTER (WHERE status='received') as completed
  FROM inter_site_transfers`);

  const byType = await q(`SELECT site_type, COUNT(*) as count, COALESCE(SUM(employee_count),0) as employees FROM sites WHERE status='active' GROUP BY site_type`);

  res.json({ sites: siteSummary, transferVolume: transferVolume[0] || {}, byType });
});

// ========== SITE P&L (placeholder - aggregated from transfers) ==========
router.get("/sites/:id/pnl", async (req, res) => {
  const id = parseInt(req.params.id);
  const site = (await q(`SELECT * FROM sites WHERE id=${id}`))[0] as any;
  if (!site) { res.status(404).json({ error: "אתר לא נמצא" }); return; }

  const outgoing = await q(`SELECT COALESCE(SUM(total_cost),0) as total FROM inter_site_transfers WHERE from_site_id=${id} AND status='received'`);
  const incoming = await q(`SELECT COALESCE(SUM(total_cost),0) as total FROM inter_site_transfers WHERE to_site_id=${id} AND status='received'`);
  const transfersByMonth = await q(`SELECT
    TO_CHAR(request_date, 'YYYY-MM') as month,
    COALESCE(SUM(CASE WHEN from_site_id=${id} THEN total_cost ELSE 0 END), 0) as outgoing,
    COALESCE(SUM(CASE WHEN to_site_id=${id} THEN total_cost ELSE 0 END), 0) as incoming
  FROM inter_site_transfers WHERE (from_site_id=${id} OR to_site_id=${id}) AND status='received'
  GROUP BY TO_CHAR(request_date, 'YYYY-MM') ORDER BY month DESC LIMIT 12`);

  res.json({
    site,
    totalOutgoing: (outgoing[0] as any)?.total || 0,
    totalIncoming: (incoming[0] as any)?.total || 0,
    netPosition: Number((incoming[0] as any)?.total || 0) - Number((outgoing[0] as any)?.total || 0),
    transfersByMonth
  });
});

export default router;
