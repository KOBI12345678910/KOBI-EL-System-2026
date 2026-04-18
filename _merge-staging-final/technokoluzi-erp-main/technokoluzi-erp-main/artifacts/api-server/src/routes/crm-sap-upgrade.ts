import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../lib/auth";

const router = Router();

// ========== אימות משתמש ==========
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

// ========== עזרים כלליים ==========
async function q(query: string) {
  try { const r = await db.execute(sql.raw(query)); return r.rows || []; }
  catch (e: any) { console.error("CRM-SAP query error:", e.message); return []; }
}
async function nextNum(prefix: string, table: string, col: string) {
  const year = new Date().getFullYear();
  const rows = await q(`SELECT ${col} FROM ${table} WHERE ${col} LIKE '${prefix}${year}-%' ORDER BY id DESC LIMIT 1`);
  const last = (rows[0] as any)?.[col];
  const seq = last ? parseInt(last.split("-").pop()!) + 1 : 1;
  return `${prefix}${year}-${String(seq).padStart(4, "0")}`;
}
function esc(v: any): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

// ========== יצירת טבלאות SAP CRM ==========
async function ensureCrmSapTables() {
  // טבלת אזורי מכירה - ניהול טריטוריות
  await q(`CREATE TABLE IF NOT EXISTS sales_territories (
    id SERIAL PRIMARY KEY,
    territory_code VARCHAR(50) UNIQUE,
    territory_name VARCHAR(255),
    territory_name_he VARCHAR(255),
    region VARCHAR(100),
    country VARCHAR(10) DEFAULT 'IL',
    manager_id INTEGER,
    manager_name VARCHAR(255),
    assigned_reps JSONB DEFAULT '[]',
    customer_count INTEGER DEFAULT 0,
    revenue_target NUMERIC(15,2),
    revenue_actual NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    geo_bounds JSONB,
    status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת תוכניות עמלה - מנגנוני תגמול
  await q(`CREATE TABLE IF NOT EXISTS commission_plans (
    id SERIAL PRIMARY KEY,
    plan_name VARCHAR(255),
    plan_name_he VARCHAR(255),
    plan_type VARCHAR(50) CHECK (plan_type IN ('flat','tiered','quota_based','split','custom')),
    base_rate NUMERIC(8,4),
    tiers JSONB DEFAULT '[]',
    quota_amount NUMERIC(15,2),
    quota_period VARCHAR(50),
    accelerator_rate NUMERIC(8,4),
    cap_amount NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    effective_from DATE,
    effective_to DATE,
    applicable_roles JSONB,
    status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת רשומות עמלה - חישובי תגמול בפועל
  await q(`CREATE TABLE IF NOT EXISTS commission_records (
    id SERIAL PRIMARY KEY,
    record_number VARCHAR(50) UNIQUE,
    salesperson_id INTEGER,
    salesperson_name VARCHAR(255),
    plan_id INTEGER,
    period VARCHAR(20),
    sales_amount NUMERIC(15,2),
    commission_amount NUMERIC(15,2),
    quota_attainment_pct NUMERIC(8,2),
    tier_applied VARCHAR(100),
    deal_id INTEGER,
    deal_name VARCHAR(255),
    customer_name VARCHAR(255),
    currency VARCHAR(10) DEFAULT 'ILS',
    status VARCHAR(50) CHECK (status IN ('calculated','approved','paid','disputed')) DEFAULT 'calculated',
    approved_by VARCHAR(255),
    paid_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת חוזים - ניהול הסכמים
  await q(`CREATE TABLE IF NOT EXISTS contracts (
    id SERIAL PRIMARY KEY,
    contract_number VARCHAR(50) UNIQUE,
    contract_type VARCHAR(50) CHECK (contract_type IN ('service','maintenance','subscription','lease','supply','framework')),
    customer_id INTEGER,
    customer_name VARCHAR(255),
    title VARCHAR(500),
    description TEXT,
    start_date DATE,
    end_date DATE,
    value NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    billing_frequency VARCHAR(50) CHECK (billing_frequency IN ('monthly','quarterly','annually','one_time')),
    auto_renew BOOLEAN DEFAULT false,
    renewal_terms TEXT,
    notice_period_days INTEGER DEFAULT 30,
    sla_id INTEGER,
    assigned_to VARCHAR(255),
    signed_date DATE,
    signed_by VARCHAR(255),
    termination_date DATE,
    termination_reason TEXT,
    status VARCHAR(50) CHECK (status IN ('draft','pending_approval','active','expired','terminated','renewed')) DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת פלחי לקוחות - סגמנטציה
  await q(`CREATE TABLE IF NOT EXISTS customer_segments (
    id SERIAL PRIMARY KEY,
    segment_name VARCHAR(255),
    segment_name_he VARCHAR(255),
    segment_type VARCHAR(50) CHECK (segment_type IN ('demographic','behavioral','value_based','geographic','industry')),
    criteria JSONB DEFAULT '{}',
    customer_count INTEGER DEFAULT 0,
    avg_revenue NUMERIC(15,2),
    avg_lifetime_value NUMERIC(15,2),
    churn_rate NUMERIC(8,4),
    description TEXT,
    color VARCHAR(20),
    priority INTEGER,
    marketing_strategy TEXT,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת מעקב קמפיינים - שיווק
  await q(`CREATE TABLE IF NOT EXISTS campaign_tracking (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255),
    campaign_type VARCHAR(50) CHECK (campaign_type IN ('email','social','event','webinar','print','radio','sms','whatsapp')),
    channel VARCHAR(100),
    start_date DATE,
    end_date DATE,
    budget NUMERIC(15,2),
    spent NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    target_audience VARCHAR(255),
    segment_id INTEGER,
    leads_generated INTEGER DEFAULT 0,
    opportunities_created INTEGER DEFAULT 0,
    deals_closed INTEGER DEFAULT 0,
    revenue_generated NUMERIC(15,2) DEFAULT 0,
    roi_percent NUMERIC(10,2),
    cost_per_lead NUMERIC(10,2),
    conversion_rate NUMERIC(8,4),
    impressions INTEGER,
    clicks INTEGER,
    status VARCHAR(50) CHECK (status IN ('planned','active','paused','completed','cancelled')) DEFAULT 'planned',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת תצורת הצעות מחיר - CPQ
  await q(`CREATE TABLE IF NOT EXISTS quote_configurations (
    id SERIAL PRIMARY KEY,
    config_name VARCHAR(255),
    product_id INTEGER,
    product_name VARCHAR(255),
    base_price NUMERIC(15,2),
    currency VARCHAR(10) DEFAULT 'ILS',
    options JSONB DEFAULT '[]',
    pricing_rules JSONB DEFAULT '[]',
    discount_tiers JSONB DEFAULT '[]',
    min_quantity INTEGER DEFAULT 1,
    max_discount_pct NUMERIC(8,2) DEFAULT 0,
    requires_approval_above NUMERIC(15,2),
    valid_days INTEGER DEFAULT 30,
    template_id INTEGER,
    status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // טבלת תוכניות לקוח - ניהול חשבונות אסטרטגי
  await q(`CREATE TABLE IF NOT EXISTS account_plans (
    id SERIAL PRIMARY KEY,
    plan_number VARCHAR(50) UNIQUE,
    customer_id INTEGER,
    customer_name VARCHAR(255),
    account_manager VARCHAR(255),
    plan_period VARCHAR(50),
    fiscal_year INTEGER,
    revenue_target NUMERIC(15,2),
    revenue_actual NUMERIC(15,2) DEFAULT 0,
    growth_target_pct NUMERIC(8,2),
    key_objectives JSONB DEFAULT '[]',
    action_items JSONB DEFAULT '[]',
    stakeholders JSONB DEFAULT '[]',
    competitors JSONB DEFAULT '[]',
    risks TEXT,
    opportunities TEXT,
    next_review_date DATE,
    last_review_date DATE,
    status VARCHAR(50) CHECK (status IN ('draft','active','completed','archived')) DEFAULT 'draft',
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`);

  // ========== אינדקסים לביצועים ==========
  // אזורי מכירה
  await q(`CREATE INDEX IF NOT EXISTS idx_sales_territories_code ON sales_territories(territory_code)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_sales_territories_region ON sales_territories(region)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_sales_territories_manager ON sales_territories(manager_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_sales_territories_status ON sales_territories(status)`);

  // תוכניות עמלה
  await q(`CREATE INDEX IF NOT EXISTS idx_commission_plans_type ON commission_plans(plan_type)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_commission_plans_status ON commission_plans(status)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_commission_plans_dates ON commission_plans(effective_from, effective_to)`);

  // רשומות עמלה
  await q(`CREATE INDEX IF NOT EXISTS idx_commission_records_number ON commission_records(record_number)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_commission_records_salesperson ON commission_records(salesperson_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_commission_records_period ON commission_records(period)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_commission_records_status ON commission_records(status)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_commission_records_plan ON commission_records(plan_id)`);

  // חוזים
  await q(`CREATE INDEX IF NOT EXISTS idx_contracts_number ON contracts(contract_number)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_contracts_customer ON contracts(customer_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_contracts_type ON contracts(contract_type)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_contracts_dates ON contracts(start_date, end_date)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_contracts_assigned ON contracts(assigned_to)`);

  // פלחי לקוחות
  await q(`CREATE INDEX IF NOT EXISTS idx_customer_segments_type ON customer_segments(segment_type)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_customer_segments_status ON customer_segments(status)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_customer_segments_priority ON customer_segments(priority)`);

  // מעקב קמפיינים
  await q(`CREATE INDEX IF NOT EXISTS idx_campaign_tracking_type ON campaign_tracking(campaign_type)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_campaign_tracking_status ON campaign_tracking(status)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_campaign_tracking_dates ON campaign_tracking(start_date, end_date)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_campaign_tracking_segment ON campaign_tracking(segment_id)`);

  // תצורת הצעות מחיר
  await q(`CREATE INDEX IF NOT EXISTS idx_quote_configurations_product ON quote_configurations(product_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_quote_configurations_status ON quote_configurations(status)`);

  // תוכניות לקוח
  await q(`CREATE INDEX IF NOT EXISTS idx_account_plans_number ON account_plans(plan_number)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_account_plans_customer ON account_plans(customer_id)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_account_plans_manager ON account_plans(account_manager)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_account_plans_year ON account_plans(fiscal_year)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_account_plans_status ON account_plans(status)`);

  console.log("CRM SAP tables and indexes created successfully / טבלאות CRM SAP נוצרו בהצלחה");
}

// ========== אתחול ==========
router.post("/init", async (_req, res) => {
  await ensureCrmSapTables();
  res.json({ success: true, message: "טבלאות CRM SAP נוצרו בהצלחה" });
});

// ========== CRUD גנרי לכל 8 הטבלאות ==========
const tables = [
  { name: "sales_territories", label: "אזורי מכירה", numPrefix: "TER", numCol: "territory_code" },
  { name: "commission_plans", label: "תוכניות עמלה", numPrefix: null, numCol: null },
  { name: "commission_records", label: "רשומות עמלה", numPrefix: "COM", numCol: "record_number" },
  { name: "contracts", label: "חוזים", numPrefix: "CON", numCol: "contract_number" },
  { name: "customer_segments", label: "פלחי לקוחות", numPrefix: null, numCol: null },
  { name: "campaign_tracking", label: "מעקב קמפיינים", numPrefix: null, numCol: null },
  { name: "quote_configurations", label: "תצורת הצעות מחיר", numPrefix: null, numCol: null },
  { name: "account_plans", label: "תוכניות לקוח", numPrefix: "APL", numCol: "plan_number" },
];

for (const tbl of tables) {
  // קריאת כל הרשומות
  router.get(`/${tbl.name}`, async (req, res) => {
    const status = req.query.status as string;
    let where = "";
    if (status) where = ` WHERE status = ${esc(status)}`;
    res.json(await q(`SELECT * FROM ${tbl.name}${where} ORDER BY id DESC`));
  });

  // קריאת רשומה בודדת
  router.get(`/${tbl.name}/:id`, async (req, res) => {
    const rows = await q(`SELECT * FROM ${tbl.name} WHERE id = ${parseInt(req.params.id)}`);
    if (!rows.length) { res.status(404).json({ error: `${tbl.label} לא נמצא` }); return; }
    res.json(rows[0]);
  });

  // יצירת רשומה חדשה
  router.post(`/${tbl.name}`, async (req, res) => {
    const body = { ...req.body };
    // מספור אוטומטי אם יש
    if (tbl.numPrefix && tbl.numCol && !body[tbl.numCol]) {
      body[tbl.numCol] = await nextNum(tbl.numPrefix, tbl.name, tbl.numCol);
    }
    const keys = Object.keys(body).filter(k => body[k] !== undefined);
    if (!keys.length) { res.status(400).json({ error: "לא סופקו נתונים" }); return; }
    const cols = keys.join(", ");
    const vals = keys.map(k => esc(body[k])).join(", ");
    const rows = await q(`INSERT INTO ${tbl.name} (${cols}) VALUES (${vals}) RETURNING *`);
    res.json(rows[0] || { success: true });
  });

  // עדכון רשומה
  router.put(`/${tbl.name}/:id`, async (req, res) => {
    const body = req.body;
    const keys = Object.keys(body).filter(k => body[k] !== undefined && k !== "id");
    if (!keys.length) { res.status(400).json({ error: "לא סופקו נתונים לעדכון" }); return; }
    const sets = keys.map(k => `${k} = ${esc(body[k])}`).join(", ");
    const rows = await q(`UPDATE ${tbl.name} SET ${sets}, updated_at = NOW() WHERE id = ${parseInt(req.params.id)} RETURNING *`);
    if (!rows.length) { res.status(404).json({ error: `${tbl.label} לא נמצא` }); return; }
    res.json(rows[0]);
  });

  // מחיקה רכה
  router.delete(`/${tbl.name}/:id`, async (req, res) => {
    const rows = await q(`UPDATE ${tbl.name} SET status = 'deleted', updated_at = NOW() WHERE id = ${parseInt(req.params.id)} RETURNING id`);
    if (!rows.length) { res.status(404).json({ error: `${tbl.label} לא נמצא` }); return; }
    res.json({ success: true, message: `${tbl.label} נמחק בהצלחה` });
  });
}

// ========== ביצועי אזור מכירה ==========
router.get("/territory-performance", async (_req, res) => {
  const rows = await q(`
    SELECT
      st.id,
      st.territory_code,
      st.territory_name,
      st.territory_name_he,
      st.region,
      st.manager_name,
      st.customer_count,
      COALESCE(st.revenue_target, 0) as revenue_target,
      COALESCE(st.revenue_actual, 0) as revenue_actual,
      CASE
        WHEN COALESCE(st.revenue_target, 0) > 0
        THEN ROUND((COALESCE(st.revenue_actual, 0) / st.revenue_target) * 100, 2)
        ELSE 0
      END as target_attainment_pct,
      COALESCE(st.revenue_target, 0) - COALESCE(st.revenue_actual, 0) as gap_to_target,
      st.currency,
      COALESCE(jsonb_array_length(st.assigned_reps), 0) as rep_count,
      CASE
        WHEN COALESCE(jsonb_array_length(st.assigned_reps), 0) > 0
        THEN ROUND(COALESCE(st.revenue_actual, 0) / jsonb_array_length(st.assigned_reps), 2)
        ELSE 0
      END as revenue_per_rep,
      CASE
        WHEN st.customer_count > 0
        THEN ROUND(COALESCE(st.revenue_actual, 0) / st.customer_count, 2)
        ELSE 0
      END as revenue_per_customer
    FROM sales_territories st
    WHERE st.status = 'active'
    ORDER BY revenue_actual DESC
  `);

  // סיכום כללי
  const summary = await q(`
    SELECT
      COUNT(*) as total_territories,
      SUM(customer_count) as total_customers,
      COALESCE(SUM(revenue_target), 0) as total_target,
      COALESCE(SUM(revenue_actual), 0) as total_actual,
      CASE
        WHEN COALESCE(SUM(revenue_target), 0) > 0
        THEN ROUND((COALESCE(SUM(revenue_actual), 0) / SUM(revenue_target)) * 100, 2)
        ELSE 0
      END as overall_attainment_pct
    FROM sales_territories
    WHERE status = 'active'
  `);

  res.json({ territories: rows, summary: summary[0] || {} });
});

// ========== חישוב עמלה לאיש מכירות ==========
router.get("/commission-calculate/:salespersonId", async (req, res) => {
  const spId = parseInt(req.params.salespersonId);
  const period = (req.query.period as string) || new Date().toISOString().slice(0, 7); // YYYY-MM

  // שליפת תוכנית העמלה הפעילה
  const plans = await q(`
    SELECT cp.* FROM commission_plans cp
    WHERE cp.status = 'active'
      AND (cp.effective_from IS NULL OR cp.effective_from <= CURRENT_DATE)
      AND (cp.effective_to IS NULL OR cp.effective_to >= CURRENT_DATE)
    ORDER BY cp.id DESC LIMIT 1
  `);

  if (!plans.length) {
    res.json({ error: "לא נמצאה תוכנית עמלה פעילה", salesperson_id: spId, period });
    return;
  }
  const plan = plans[0] as any;

  // שליפת רשומות מכירה קיימות לתקופה
  const salesData = await q(`
    SELECT
      COALESCE(SUM(sales_amount), 0) as total_sales,
      COUNT(*) as deal_count
    FROM commission_records
    WHERE salesperson_id = ${spId} AND period = ${esc(period)}
  `);
  const sales = salesData[0] as any;
  const totalSales = parseFloat(sales?.total_sales || "0");

  let commissionAmount = 0;
  let tierApplied = "base";
  let quotaAttainment = 0;

  // חישוב לפי סוג תוכנית
  if (plan.plan_type === "flat") {
    // עמלה קבועה - אחוז קבוע מכל מכירה
    commissionAmount = totalSales * parseFloat(plan.base_rate || "0");
    tierApplied = "flat_rate";

  } else if (plan.plan_type === "tiered") {
    // עמלה מדורגת - אחוזים עולים לפי רמת מכירות
    const tiers = Array.isArray(plan.tiers) ? plan.tiers : [];
    let remaining = totalSales;
    for (const tier of tiers) {
      const from = parseFloat(tier.from || "0");
      const to = parseFloat(tier.to || "999999999");
      const rate = parseFloat(tier.rate || "0");
      if (remaining > 0 && totalSales > from) {
        const taxable = Math.min(remaining, to - from);
        commissionAmount += taxable * rate;
        remaining -= taxable;
        tierApplied = `tier_${tier.name || rate}`;
      }
    }

  } else if (plan.plan_type === "quota_based") {
    // עמלה מבוססת יעד - בונוס על עמידה ביעד
    const quota = parseFloat(plan.quota_amount || "0");
    quotaAttainment = quota > 0 ? (totalSales / quota) * 100 : 0;
    commissionAmount = totalSales * parseFloat(plan.base_rate || "0");
    // מאיץ - אם עברת את היעד מקבל אחוז גבוה יותר
    if (quotaAttainment > 100 && plan.accelerator_rate) {
      const overQuota = totalSales - quota;
      commissionAmount += overQuota * (parseFloat(plan.accelerator_rate) - parseFloat(plan.base_rate || "0"));
      tierApplied = "accelerator";
    }

  } else if (plan.plan_type === "split") {
    // עמלה מפוצלת
    commissionAmount = totalSales * parseFloat(plan.base_rate || "0") * 0.5;
    tierApplied = "split_50";
  } else {
    // מותאם אישית
    commissionAmount = totalSales * parseFloat(plan.base_rate || "0");
    tierApplied = "custom";
  }

  // בדיקת תקרת עמלה
  if (plan.cap_amount && commissionAmount > parseFloat(plan.cap_amount)) {
    commissionAmount = parseFloat(plan.cap_amount);
    tierApplied += "_capped";
  }

  res.json({
    salesperson_id: spId,
    period,
    plan_id: plan.id,
    plan_name: plan.plan_name,
    plan_type: plan.plan_type,
    total_sales: totalSales,
    deal_count: parseInt(sales?.deal_count || "0"),
    commission_amount: Math.round(commissionAmount * 100) / 100,
    quota_attainment_pct: Math.round(quotaAttainment * 100) / 100,
    tier_applied: tierApplied,
    currency: plan.currency || "ILS",
  });
});

// ========== הרצת חישוב עמלות לכל הנציגים ==========
router.post("/commission-run", async (req, res) => {
  const period = (req.body.period as string) || new Date().toISOString().slice(0, 7);

  // שליפת כל אנשי המכירות עם רשומות בתקופה
  const salespersons = await q(`
    SELECT DISTINCT salesperson_id, salesperson_name
    FROM commission_records
    WHERE period = ${esc(period)}
  `);

  // שליפת תוכנית פעילה
  const plans = await q(`
    SELECT * FROM commission_plans
    WHERE status = 'active'
      AND (effective_from IS NULL OR effective_from <= CURRENT_DATE)
      AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    ORDER BY id DESC LIMIT 1
  `);

  if (!plans.length) {
    res.json({ error: "לא נמצאה תוכנית עמלה פעילה", period });
    return;
  }
  const plan = plans[0] as any;
  const results: any[] = [];

  for (const sp of salespersons) {
    const spData = sp as any;
    // סכום מכירות לתקופה
    const salesRows = await q(`
      SELECT COALESCE(SUM(sales_amount), 0) as total_sales
      FROM commission_records
      WHERE salesperson_id = ${spData.salesperson_id} AND period = ${esc(period)}
    `);
    const totalSales = parseFloat((salesRows[0] as any)?.total_sales || "0");
    let commission = totalSales * parseFloat(plan.base_rate || "0");
    if (plan.cap_amount && commission > parseFloat(plan.cap_amount)) {
      commission = parseFloat(plan.cap_amount);
    }

    // עדכון כל הרשומות של הנציג בתקופה
    await q(`
      UPDATE commission_records
      SET commission_amount = ${Math.round(commission * 100) / 100},
          plan_id = ${plan.id},
          status = 'calculated',
          updated_at = NOW()
      WHERE salesperson_id = ${spData.salesperson_id} AND period = ${esc(period)}
    `);

    results.push({
      salesperson_id: spData.salesperson_id,
      salesperson_name: spData.salesperson_name,
      total_sales: totalSales,
      commission_amount: Math.round(commission * 100) / 100,
    });
  }

  res.json({
    period,
    plan_id: plan.id,
    plan_name: plan.plan_name,
    reps_processed: results.length,
    total_commissions: results.reduce((sum, r) => sum + r.commission_amount, 0),
    results,
  });
});

// ========== התראות חוזים ==========
router.get("/contract-alerts", async (req, res) => {
  const daysAhead = parseInt((req.query.days as string) || "30");

  // חוזים שפגים בקרוב
  const expiringSoon = await q(`
    SELECT *,
      (end_date - CURRENT_DATE) as days_until_expiry
    FROM contracts
    WHERE status = 'active'
      AND end_date IS NOT NULL
      AND end_date <= CURRENT_DATE + ${daysAhead}
      AND end_date >= CURRENT_DATE
    ORDER BY end_date ASC
  `);

  // חוזים שכבר פגו אבל לא עודכנו
  const expired = await q(`
    SELECT *,
      (CURRENT_DATE - end_date) as days_overdue
    FROM contracts
    WHERE status = 'active'
      AND end_date IS NOT NULL
      AND end_date < CURRENT_DATE
    ORDER BY end_date ASC
  `);

  // חוזים שממתינים לאישור
  const pendingApproval = await q(`
    SELECT * FROM contracts
    WHERE status = 'pending_approval'
    ORDER BY created_at DESC
  `);

  // חוזים לחידוש אוטומטי
  const autoRenewable = await q(`
    SELECT *,
      (end_date - CURRENT_DATE) as days_until_expiry
    FROM contracts
    WHERE status = 'active'
      AND auto_renew = true
      AND end_date IS NOT NULL
      AND end_date <= CURRENT_DATE + ${daysAhead}
      AND end_date >= CURRENT_DATE
    ORDER BY end_date ASC
  `);

  // סיכום
  const summary = await q(`
    SELECT
      COUNT(*) as total_active,
      COALESCE(SUM(value), 0) as total_value,
      COUNT(*) FILTER (WHERE end_date <= CURRENT_DATE + 30 AND end_date >= CURRENT_DATE) as expiring_30,
      COUNT(*) FILTER (WHERE end_date <= CURRENT_DATE + 60 AND end_date > CURRENT_DATE + 30) as expiring_60,
      COUNT(*) FILTER (WHERE end_date <= CURRENT_DATE + 90 AND end_date > CURRENT_DATE + 60) as expiring_90,
      COUNT(*) FILTER (WHERE end_date < CURRENT_DATE) as already_expired
    FROM contracts
    WHERE status = 'active'
  `);

  res.json({
    expiring_soon: expiringSoon,
    expired,
    pending_approval: pendingApproval,
    auto_renewable: autoRenewable,
    summary: summary[0] || {},
  });
});

// ========== ניתוח פלחי לקוחות ==========
router.get("/segment-analysis", async (_req, res) => {
  const segments = await q(`
    SELECT
      cs.*,
      CASE
        WHEN cs.customer_count > 0 AND cs.avg_revenue > 0
        THEN ROUND(cs.avg_revenue * cs.customer_count, 2)
        ELSE 0
      END as total_segment_revenue,
      CASE
        WHEN cs.churn_rate IS NOT NULL
        THEN ROUND(cs.customer_count * cs.churn_rate / 100, 0)
        ELSE 0
      END as estimated_churn_customers
    FROM customer_segments cs
    WHERE cs.status = 'active'
    ORDER BY cs.priority ASC NULLS LAST, cs.customer_count DESC
  `);

  // סיכום כללי
  const summary = await q(`
    SELECT
      COUNT(*) as total_segments,
      COALESCE(SUM(customer_count), 0) as total_customers,
      ROUND(AVG(avg_revenue), 2) as overall_avg_revenue,
      ROUND(AVG(avg_lifetime_value), 2) as overall_avg_ltv,
      ROUND(AVG(churn_rate), 4) as overall_avg_churn
    FROM customer_segments
    WHERE status = 'active'
  `);

  // התפלגות לפי סוג
  const byType = await q(`
    SELECT
      segment_type,
      COUNT(*) as count,
      SUM(customer_count) as total_customers,
      ROUND(AVG(avg_revenue), 2) as avg_revenue
    FROM customer_segments
    WHERE status = 'active'
    GROUP BY segment_type
    ORDER BY total_customers DESC
  `);

  res.json({ segments, summary: summary[0] || {}, by_type: byType });
});

// ========== ניתוח ROI קמפיינים ==========
router.get("/campaign-roi", async (_req, res) => {
  const campaigns = await q(`
    SELECT
      ct.*,
      CASE
        WHEN COALESCE(ct.spent, 0) > 0
        THEN ROUND(((COALESCE(ct.revenue_generated, 0) - ct.spent) / ct.spent) * 100, 2)
        ELSE 0
      END as calculated_roi,
      CASE
        WHEN COALESCE(ct.leads_generated, 0) > 0
        THEN ROUND(COALESCE(ct.spent, 0) / ct.leads_generated, 2)
        ELSE 0
      END as calculated_cpl,
      CASE
        WHEN COALESCE(ct.leads_generated, 0) > 0
        THEN ROUND((COALESCE(ct.deals_closed, 0)::NUMERIC / ct.leads_generated) * 100, 2)
        ELSE 0
      END as calculated_conversion,
      CASE
        WHEN COALESCE(ct.clicks, 0) > 0 AND COALESCE(ct.impressions, 0) > 0
        THEN ROUND((ct.clicks::NUMERIC / ct.impressions) * 100, 2)
        ELSE 0
      END as ctr_percent,
      CASE
        WHEN COALESCE(ct.clicks, 0) > 0
        THEN ROUND(COALESCE(ct.spent, 0) / ct.clicks, 2)
        ELSE 0
      END as cost_per_click
    FROM campaign_tracking ct
    WHERE ct.status != 'cancelled'
    ORDER BY calculated_roi DESC
  `);

  // סיכום כללי
  const summary = await q(`
    SELECT
      COUNT(*) as total_campaigns,
      COUNT(*) FILTER (WHERE status = 'active') as active_campaigns,
      COALESCE(SUM(budget), 0) as total_budget,
      COALESCE(SUM(spent), 0) as total_spent,
      COALESCE(SUM(revenue_generated), 0) as total_revenue,
      COALESCE(SUM(leads_generated), 0) as total_leads,
      COALESCE(SUM(deals_closed), 0) as total_deals,
      CASE
        WHEN COALESCE(SUM(spent), 0) > 0
        THEN ROUND(((COALESCE(SUM(revenue_generated), 0) - SUM(spent)) / SUM(spent)) * 100, 2)
        ELSE 0
      END as overall_roi,
      CASE
        WHEN COALESCE(SUM(leads_generated), 0) > 0
        THEN ROUND(COALESCE(SUM(spent), 0) / SUM(leads_generated), 2)
        ELSE 0
      END as overall_cpl
    FROM campaign_tracking
    WHERE status != 'cancelled'
  `);

  // ביצועים לפי סוג קמפיין
  const byType = await q(`
    SELECT
      campaign_type,
      COUNT(*) as count,
      COALESCE(SUM(spent), 0) as total_spent,
      COALESCE(SUM(revenue_generated), 0) as total_revenue,
      COALESCE(SUM(leads_generated), 0) as total_leads,
      COALESCE(SUM(deals_closed), 0) as total_deals,
      CASE
        WHEN COALESCE(SUM(spent), 0) > 0
        THEN ROUND(((COALESCE(SUM(revenue_generated), 0) - SUM(spent)) / SUM(spent)) * 100, 2)
        ELSE 0
      END as roi
    FROM campaign_tracking
    WHERE status != 'cancelled'
    GROUP BY campaign_type
    ORDER BY roi DESC
  `);

  res.json({ campaigns, summary: summary[0] || {}, by_type: byType });
});

// ========== תחזית הכנסות מצנרת המכירות ==========
router.get("/pipeline-forecast", async (_req, res) => {
  // תחזית מבוססת שלבי עסקה (אם יש טבלת deals)
  const pipeline = await q(`
    SELECT
      COALESCE(status, 'unknown') as stage,
      COUNT(*) as deal_count,
      COALESCE(SUM(value), 0) as total_value,
      ROUND(AVG(value), 2) as avg_deal_value,
      CASE status
        WHEN 'lead' THEN 0.10
        WHEN 'qualified' THEN 0.25
        WHEN 'proposal' THEN 0.50
        WHEN 'negotiation' THEN 0.75
        WHEN 'closed_won' THEN 1.00
        WHEN 'active' THEN 0.90
        WHEN 'draft' THEN 0.05
        WHEN 'pending_approval' THEN 0.60
        ELSE 0.20
      END as probability,
      ROUND(COALESCE(SUM(value), 0) * CASE status
        WHEN 'lead' THEN 0.10
        WHEN 'qualified' THEN 0.25
        WHEN 'proposal' THEN 0.50
        WHEN 'negotiation' THEN 0.75
        WHEN 'closed_won' THEN 1.00
        WHEN 'active' THEN 0.90
        WHEN 'draft' THEN 0.05
        WHEN 'pending_approval' THEN 0.60
        ELSE 0.20
      END, 2) as weighted_value
    FROM contracts
    WHERE status NOT IN ('terminated', 'expired', 'deleted')
    GROUP BY status
    ORDER BY probability DESC
  `);

  // תחזית חודשית מחוזים פעילים
  const monthlyForecast = await q(`
    SELECT
      TO_CHAR(start_date, 'YYYY-MM') as month,
      COUNT(*) as contract_count,
      COALESCE(SUM(value), 0) as total_value,
      SUM(CASE WHEN billing_frequency = 'monthly' THEN value
               WHEN billing_frequency = 'quarterly' THEN value / 3
               WHEN billing_frequency = 'annually' THEN value / 12
               ELSE value END) as monthly_revenue
    FROM contracts
    WHERE status = 'active' AND start_date IS NOT NULL
    GROUP BY TO_CHAR(start_date, 'YYYY-MM')
    ORDER BY month DESC
    LIMIT 12
  `);

  // סיכום כולל
  const totals = await q(`
    SELECT
      COALESCE(SUM(value), 0) as total_pipeline_value,
      COUNT(*) as total_deals,
      ROUND(AVG(value), 2) as avg_deal_size
    FROM contracts
    WHERE status NOT IN ('terminated', 'expired', 'deleted')
  `);

  res.json({
    pipeline_stages: pipeline,
    monthly_forecast: monthlyForecast,
    totals: totals[0] || {},
  });
});

// ========== בריאות חשבונות לקוח ==========
router.get("/account-health", async (_req, res) => {
  // ציון בריאות מבוסס: הכנסות, חוזים פעילים, תוכניות חשבון
  const accounts = await q(`
    SELECT
      ap.customer_id,
      ap.customer_name,
      ap.account_manager,
      ap.fiscal_year,
      COALESCE(ap.revenue_target, 0) as revenue_target,
      COALESCE(ap.revenue_actual, 0) as revenue_actual,
      ap.growth_target_pct,
      ap.status as plan_status,
      ap.next_review_date,
      -- ציון הכנסות (0-30 נקודות)
      CASE
        WHEN COALESCE(ap.revenue_target, 0) > 0 AND COALESCE(ap.revenue_actual, 0) >= ap.revenue_target THEN 30
        WHEN COALESCE(ap.revenue_target, 0) > 0 AND COALESCE(ap.revenue_actual, 0) >= ap.revenue_target * 0.8 THEN 25
        WHEN COALESCE(ap.revenue_target, 0) > 0 AND COALESCE(ap.revenue_actual, 0) >= ap.revenue_target * 0.5 THEN 15
        WHEN COALESCE(ap.revenue_actual, 0) > 0 THEN 10
        ELSE 0
      END as revenue_score,
      -- ציון תוכנית (0-20 נקודות)
      CASE
        WHEN ap.status = 'active' THEN 20
        WHEN ap.status = 'draft' THEN 10
        WHEN ap.status = 'completed' THEN 15
        ELSE 0
      END as plan_score,
      -- ציון מעורבות (0-20 נקודות) - מבוסס על תאריך סקירה
      CASE
        WHEN ap.last_review_date >= CURRENT_DATE - 30 THEN 20
        WHEN ap.last_review_date >= CURRENT_DATE - 60 THEN 15
        WHEN ap.last_review_date >= CURRENT_DATE - 90 THEN 10
        WHEN ap.last_review_date IS NOT NULL THEN 5
        ELSE 0
      END as engagement_score
    FROM account_plans ap
    WHERE ap.status != 'archived'
    ORDER BY ap.revenue_actual DESC
  `);

  // חישוב ציון בריאות כולל לכל חשבון
  const enriched = (accounts as any[]).map(a => {
    const revenueScore = parseInt(a.revenue_score) || 0;
    const planScore = parseInt(a.plan_score) || 0;
    const engagementScore = parseInt(a.engagement_score) || 0;
    const totalScore = revenueScore + planScore + engagementScore;
    let healthStatus = "critical"; // אדום
    if (totalScore >= 50) healthStatus = "healthy"; // ירוק
    else if (totalScore >= 35) healthStatus = "good"; // כחול
    else if (totalScore >= 20) healthStatus = "at_risk"; // כתום
    return {
      ...a,
      health_score: totalScore,
      max_score: 70,
      health_status: healthStatus,
      revenue_score: revenueScore,
      plan_score: planScore,
      engagement_score: engagementScore,
    };
  });

  // חוזים פעילים לכל לקוח
  const contractCounts = await q(`
    SELECT
      customer_id,
      customer_name,
      COUNT(*) as active_contracts,
      COALESCE(SUM(value), 0) as contracts_value,
      MIN(end_date) as earliest_expiry
    FROM contracts
    WHERE status = 'active'
    GROUP BY customer_id, customer_name
  `);

  // סיכום
  const summary = {
    total_accounts: enriched.length,
    healthy: enriched.filter(a => a.health_status === "healthy").length,
    good: enriched.filter(a => a.health_status === "good").length,
    at_risk: enriched.filter(a => a.health_status === "at_risk").length,
    critical: enriched.filter(a => a.health_status === "critical").length,
    avg_health_score: enriched.length > 0
      ? Math.round(enriched.reduce((sum, a) => sum + a.health_score, 0) / enriched.length * 100) / 100
      : 0,
  };

  res.json({
    accounts: enriched,
    contract_summary: contractCounts,
    summary,
  });
});

export default router;
