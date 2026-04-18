/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║     TECHNO KOL UZI — AI ENGINE API ROUTES                      ║
 * ║     נתיבי API למנוע הזרמת נתונים, AI, אוטומציות וסנכרון          ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * חושף את כל 4 השכבות של המנוע דרך REST API:
 * 1. DataBus — אירועים וזרימת נתונים
 * 2. AIBrain — תובנות, חיזויים, ניתוחים
 * 3. AutomationEngine — חוקי אוטומציה
 * 4. SyncBridge — סנכרון מערכות חיצוניות
 */

import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================
// טבלאות DB למנוע (persistent storage)
// ============================================================

async function ensureAIEngineTables(): Promise<string[]> {
  const created: string[] = [];

  // אירועים
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engine_events (
      id SERIAL PRIMARY KEY,
      event_id VARCHAR(100) UNIQUE,
      source_module VARCHAR(100),
      target_module VARCHAR(100),
      event_type VARCHAR(100),
      priority VARCHAR(20) DEFAULT 'medium',
      status VARCHAR(20) DEFAULT 'pending',
      direction VARCHAR(50) DEFAULT 'internal',
      payload JSONB DEFAULT '{}',
      metadata JSONB DEFAULT '{}',
      correlation_id VARCHAR(100),
      platform VARCHAR(20) DEFAULT 'knowdo',
      retry_count INTEGER DEFAULT 0,
      error TEXT,
      processed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_by VARCHAR(200),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  created.push("engine_events");

  // תובנות AI
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engine_ai_insights (
      id SERIAL PRIMARY KEY,
      insight_id VARCHAR(100) UNIQUE,
      category VARCHAR(100),
      severity VARCHAR(20) DEFAULT 'info',
      title_he TEXT,
      description_he TEXT,
      data_points JSONB DEFAULT '{}',
      recommendation TEXT,
      confidence NUMERIC(3,2) DEFAULT 0,
      affected_modules JSONB DEFAULT '[]',
      actionable BOOLEAN DEFAULT false,
      suggested_actions JSONB DEFAULT '[]',
      auto_executed BOOLEAN DEFAULT false,
      acknowledged BOOLEAN DEFAULT false,
      acknowledged_by VARCHAR(200),
      expires_at TIMESTAMPTZ,
      generated_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  created.push("engine_ai_insights");

  // חוקי אוטומציה
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engine_automation_rules (
      id SERIAL PRIMARY KEY,
      rule_id VARCHAR(100) UNIQUE,
      name_he VARCHAR(500),
      description TEXT,
      enabled BOOLEAN DEFAULT true,
      priority INTEGER DEFAULT 0,
      trigger_event_types JSONB DEFAULT '[]',
      trigger_source_modules JSONB DEFAULT '[]',
      trigger_schedule VARCHAR(100),
      conditions JSONB DEFAULT '[]',
      actions JSONB DEFAULT '[]',
      cooldown_ms INTEGER DEFAULT 60000,
      last_fired_at TIMESTAMPTZ,
      total_fired INTEGER DEFAULT 0,
      total_success INTEGER DEFAULT 0,
      total_failed INTEGER DEFAULT 0,
      avg_execution_ms INTEGER DEFAULT 0,
      category VARCHAR(100),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  created.push("engine_automation_rules");

  // לוג ביצוע אוטומציות
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engine_automation_log (
      id SERIAL PRIMARY KEY,
      rule_id VARCHAR(100),
      rule_name VARCHAR(500),
      event_id VARCHAR(100),
      event_type VARCHAR(100),
      actions_executed JSONB DEFAULT '[]',
      execution_ms INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'success',
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  created.push("engine_automation_log");

  // סנכרון מערכות חיצוניות
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engine_sync_configs (
      id SERIAL PRIMARY KEY,
      system_name VARCHAR(100) UNIQUE,
      system_name_he VARCHAR(200),
      enabled BOOLEAN DEFAULT false,
      direction VARCHAR(20) DEFAULT 'bidirectional',
      interval_ms INTEGER DEFAULT 30000,
      auth_type VARCHAR(50),
      auth_credentials JSONB DEFAULT '{}',
      field_mappings JSONB DEFAULT '[]',
      last_sync_at TIMESTAMPTZ,
      last_sync_status VARCHAR(20),
      total_syncs INTEGER DEFAULT 0,
      total_errors INTEGER DEFAULT 0,
      error_log JSONB DEFAULT '[]',
      settings JSONB DEFAULT '{}',
      status VARCHAR(50) DEFAULT 'inactive',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  created.push("engine_sync_configs");

  // לוג סנכרון
  await pool.query(`
    CREATE TABLE IF NOT EXISTS engine_sync_log (
      id SERIAL PRIMARY KEY,
      system_name VARCHAR(100),
      direction VARCHAR(20),
      records_synced INTEGER DEFAULT 0,
      records_failed INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      error TEXT,
      details JSONB DEFAULT '{}',
      status VARCHAR(20) DEFAULT 'success',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  created.push("engine_sync_log");

  // אינדקסים
  const indexes = [
    "CREATE INDEX IF NOT EXISTS idx_engine_events_type ON engine_events(event_type)",
    "CREATE INDEX IF NOT EXISTS idx_engine_events_source ON engine_events(source_module)",
    "CREATE INDEX IF NOT EXISTS idx_engine_events_status ON engine_events(status)",
    "CREATE INDEX IF NOT EXISTS idx_engine_events_created ON engine_events(created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_engine_events_corr ON engine_events(correlation_id)",
    "CREATE INDEX IF NOT EXISTS idx_engine_insights_cat ON engine_ai_insights(category)",
    "CREATE INDEX IF NOT EXISTS idx_engine_insights_sev ON engine_ai_insights(severity)",
    "CREATE INDEX IF NOT EXISTS idx_engine_auto_rules_cat ON engine_automation_rules(category)",
    "CREATE INDEX IF NOT EXISTS idx_engine_auto_log_rule ON engine_automation_log(rule_id)",
    "CREATE INDEX IF NOT EXISTS idx_engine_sync_log_sys ON engine_sync_log(system_name)",
  ];
  for (const sql of indexes) { try { await pool.query(sql); } catch {} }

  return created;
}

// ============================================================
// Seed - חוקי אוטומציה מובנים למפעל מסגרות
// ============================================================

async function seedFactoryAutomationRules(): Promise<number> {
  const rules = [
    { id: "auto_lead_assign", name: "הקצאת ליד אוטומטית לסוכן", category: "crm", events: ["lead:newInquiry"], actions: [{ type: "updateEntity", config: { assign: "round_robin" } }, { type: "notify", config: { channel: "whatsapp", to: "agent" } }] },
    { id: "auto_lead_followup", name: "תזכורת פולואפ אחרי 24 שעות", category: "crm", events: ["lead:qualified"], actions: [{ type: "createTask", config: { title: "פולואפ ליד", dueHours: 24 } }] },
    { id: "auto_quote_to_deal", name: "הצעת מחיר שאושרה → פתיחת עסקה", category: "sales", events: ["quote:approved"], actions: [{ type: "sendEvent", config: { type: "deal:stageChanged", stage: "won" } }] },
    { id: "auto_deal_won_invoice", name: "עסקה נסגרה → יצירת חשבונית", category: "finance", events: ["deal:won"], actions: [{ type: "createInvoice", config: { auto: true } }] },
    { id: "auto_invoice_overdue", name: "חשבונית באיחור → תזכורת תשלום", category: "finance", events: ["invoice:overdue"], actions: [{ type: "sendWhatsApp", config: { template: "payment_reminder" } }, { type: "notify", config: { to: "finance_manager" } }] },
    { id: "auto_low_stock", name: "מלאי נמוך → יצירת בקשת רכש", category: "inventory", events: ["inventory:low"], actions: [{ type: "sendEvent", config: { type: "procurement:requested" } }] },
    { id: "auto_order_to_production", name: "הזמנה אושרה → פקודת ייצור", category: "production", events: ["order:confirmed"], actions: [{ type: "sendEvent", config: { type: "production:started" } }] },
    { id: "auto_production_complete", name: "ייצור הסתיים → שליחה לצבע", category: "production", events: ["production:completed"], actions: [{ type: "updateEntity", config: { status: "painting" } }, { type: "notify", config: { to: "paint_department" } }] },
    { id: "auto_measurement_schedule", name: "מדידה תואמה → הודעה ללקוח ומודד", category: "operations", events: ["measurement:scheduled"], actions: [{ type: "sendWhatsApp", config: { template: "measurement_confirmation" } }] },
    { id: "auto_installation_complete", name: "התקנה הושלמה → סקר שביעות רצון", category: "operations", events: ["installation:completed"], actions: [{ type: "sendWhatsApp", config: { template: "satisfaction_survey" } }] },
    { id: "auto_employee_absent", name: "עובד לא הגיע → התראה למנהל", category: "hr", events: ["employee:absent"], actions: [{ type: "notify", config: { to: "hr_manager", severity: "warning" } }] },
    { id: "auto_expense_submitted", name: "הוצאה הוגשה → שליחה לאישור", category: "finance", events: ["expense:submitted"], actions: [{ type: "notify", config: { to: "finance_manager" } }] },
    { id: "auto_project_delayed", name: "פרויקט מאחר → התראה קריטית", category: "project", events: ["project:delayed"], actions: [{ type: "notify", config: { to: "project_manager", severity: "critical" } }, { type: "aiAnalysis", config: { type: "project_delay_risk" } }] },
    { id: "auto_cashflow_alert", name: "תזרים שלילי → התראה למנכ\"ל", category: "finance", events: ["cashflow:alert"], actions: [{ type: "notify", config: { to: "ceo", severity: "critical" } }] },
    { id: "auto_anomaly_detected", name: "חריגה זוהתה → חקירה אוטומטית", category: "ai", events: ["ai:anomalyDetected"], actions: [{ type: "createTask", config: { title: "חקירת חריגה", priority: "high" } }, { type: "notify", config: { to: "admin" } }] },
    { id: "auto_deal_lost", name: "עסקה אבדה → ניתוח סיבות", category: "crm", events: ["deal:lost"], actions: [{ type: "aiAnalysis", config: { type: "win_loss_analysis" } }] },
    { id: "auto_customer_churn", name: "לקוח בסיכון נטישה → התראה + פעולה", category: "crm", events: ["ai:predictionReady"], actions: [{ type: "createTask", config: { title: "טיפול בלקוח בסיכון" } }, { type: "sendWhatsApp", config: { template: "retention_offer" } }] },
    { id: "auto_supplier_delay", name: "ספק מאחר → התראה ומציאת חלופה", category: "procurement", events: ["procurement:received"], actions: [{ type: "aiAnalysis", config: { type: "supplier_evaluation" } }] },
    { id: "auto_quality_fail", name: "בדיקת איכות נכשלה → עצירת ייצור", category: "quality", events: ["entity:updated"], actions: [{ type: "notify", config: { to: "quality_manager", severity: "critical" } }, { type: "createTask", config: { title: "בדיקת איכות חוזרת" } }] },
    { id: "auto_revenue_milestone", name: "יעד הכנסות הושג → חגיגה!", category: "finance", events: ["revenue:milestone"], actions: [{ type: "notify", config: { to: "all", severity: "info", message: "🎉 הגענו ליעד!" } }] },
  ];

  let seeded = 0;
  for (const rule of rules) {
    const existing = await pool.query("SELECT id FROM engine_automation_rules WHERE rule_id = $1", [rule.id]);
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO engine_automation_rules (rule_id, name_he, category, trigger_event_types, actions, enabled)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [rule.id, rule.name, rule.category, JSON.stringify(rule.events), JSON.stringify(rule.actions)]
      );
      seeded++;
    }
  }
  return seeded;
}

// Seed external sync configs
async function seedSyncConfigs(): Promise<number> {
  const configs = [
    { name: "sumit", nameHe: "סומית (הנה\"ח)", direction: "bidirectional", interval: 300000 },
    { name: "whatsapp_business", nameHe: "וואצאפ ביזנס", direction: "bidirectional", interval: 5000 },
    { name: "google_calendar", nameHe: "Google Calendar", direction: "bidirectional", interval: 60000 },
    { name: "google_sheets", nameHe: "Google Sheets", direction: "push", interval: 300000 },
    { name: "google_drive", nameHe: "Google Drive", direction: "push", interval: 600000 },
    { name: "wix", nameHe: "אתר Wix", direction: "pull", interval: 30000 },
    { name: "scala_crm", nameHe: "Scala CRM", direction: "pull", interval: 60000 },
    { name: "n8n", nameHe: "n8n Automations", direction: "bidirectional", interval: 10000 },
    { name: "make_com", nameHe: "Make.com", direction: "bidirectional", interval: 30000 },
    { name: "mecano_attendance", nameHe: "מקאנו נוכחות", direction: "pull", interval: 300000 },
    { name: "phone_system", nameHe: "מרכזיית טלפון", direction: "pull", interval: 60000 },
    { name: "facebook_ads", nameHe: "Facebook Ads", direction: "pull", interval: 600000 },
    { name: "stripe_payments", nameHe: "Stripe תשלומים", direction: "pull", interval: 30000 },
  ];

  let seeded = 0;
  for (const cfg of configs) {
    const existing = await pool.query("SELECT id FROM engine_sync_configs WHERE system_name = $1", [cfg.name]);
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO engine_sync_configs (system_name, system_name_he, direction, interval_ms) VALUES ($1, $2, $3, $4)`,
        [cfg.name, cfg.nameHe, cfg.direction, cfg.interval]
      );
      seeded++;
    }
  }
  return seeded;
}

// ============================================================
// API ROUTES
// ============================================================

// === INIT ===
router.post("/init", async (_req, res, next) => {
  try {
    const tables = await ensureAIEngineTables();
    const rulesSeeded = await seedFactoryAutomationRules();
    const syncsSeeded = await seedSyncConfigs();
    res.json({
      message: `✅ מנוע AI אותחל`,
      tables: tables.length,
      automationRules: rulesSeeded,
      syncConfigs: syncsSeeded,
    });
  } catch (e) { next(e); }
});

// === EVENTS ===
router.post("/events/emit", async (req, res, next) => {
  try {
    const { source, target, type, priority, payload, userId } = req.body;
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const correlationId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

    await pool.query(
      `INSERT INTO engine_events (event_id, source_module, target_module, event_type, priority, payload, metadata, correlation_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [eventId, source, target || "*", type, priority || "medium", JSON.stringify(payload || {}),
       JSON.stringify({ userId, tags: [] }), correlationId, userId || "system"]
    );

    // Check automation rules
    const matchingRules = await pool.query(
      "SELECT * FROM engine_automation_rules WHERE enabled = true AND trigger_event_types @> $1::jsonb",
      [JSON.stringify([type])]
    );

    const automationsTriggered: string[] = [];
    for (const rule of matchingRules.rows) {
      automationsTriggered.push(rule.name_he);
      await pool.query(
        `INSERT INTO engine_automation_log (rule_id, rule_name, event_id, event_type, status) VALUES ($1, $2, $3, $4, 'success')`,
        [rule.rule_id, rule.name_he, eventId, type]
      );
      await pool.query(
        "UPDATE engine_automation_rules SET last_fired_at = NOW(), total_fired = total_fired + 1, total_success = total_success + 1 WHERE rule_id = $1",
        [rule.rule_id]
      );
    }

    await pool.query("UPDATE engine_events SET status = 'completed', completed_at = NOW() WHERE event_id = $1", [eventId]);

    res.json({ eventId, correlationId, automationsTriggered, matchedRules: matchingRules.rows.length });
  } catch (e) { next(e); }
});

router.get("/events", async (req, res, next) => {
  try {
    const { type, source, status, limit = "50" } = req.query as any;
    let sql = "SELECT * FROM engine_events WHERE 1=1";
    const params: any[] = [];
    let idx = 1;
    if (type) { sql += ` AND event_type = $${idx++}`; params.push(type); }
    if (source) { sql += ` AND source_module = $${idx++}`; params.push(source); }
    if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(parseInt(limit));
    const result = await pool.query(sql, params);
    res.json({ count: result.rows.length, events: result.rows });
  } catch (e) { next(e); }
});

router.get("/events/trace/:correlationId", async (req, res, next) => {
  try {
    const result = await pool.query(
      "SELECT * FROM engine_events WHERE correlation_id = $1 ORDER BY created_at ASC",
      [req.params.correlationId]
    );
    res.json({ correlationId: req.params.correlationId, events: result.rows });
  } catch (e) { next(e); }
});

// === AI INSIGHTS ===
router.get("/insights", async (req, res, next) => {
  try {
    const { category, severity, actionable, limit = "20" } = req.query as any;
    let sql = "SELECT * FROM engine_ai_insights WHERE 1=1";
    const params: any[] = [];
    let idx = 1;
    if (category) { sql += ` AND category = $${idx++}`; params.push(category); }
    if (severity) { sql += ` AND severity = $${idx++}`; params.push(severity); }
    if (actionable === "true") { sql += ` AND actionable = true`; }
    sql += ` ORDER BY generated_at DESC LIMIT $${idx}`;
    params.push(parseInt(limit));
    const result = await pool.query(sql, params);
    res.json({ count: result.rows.length, insights: result.rows });
  } catch (e) { next(e); }
});

router.post("/insights/generate", async (req, res, next) => {
  try {
    const { category, dataPoints } = req.body;
    const insightId = `ins_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Generate insight based on category
    const insights: Record<string, { title: string; desc: string; sev: string }> = {
      revenue_trend: { title: "מגמת הכנסות", desc: "ניתוח מגמת הכנסות לתקופה", sev: "info" },
      cash_flow_forecast: { title: "תחזית תזרים", desc: "חיזוי תזרים מזומנים", sev: "warning" },
      customer_churn_risk: { title: "סיכון נטישת לקוח", desc: "לקוחות בסיכון גבוה לנטישה", sev: "critical" },
      inventory_optimization: { title: "אופטימיזציית מלאי", desc: "המלצות לשיפור ניהול מלאי", sev: "info" },
      sales_performance: { title: "ביצועי מכירות", desc: "ניתוח ביצועי סוכני מכירות", sev: "info" },
      project_delay_risk: { title: "סיכון עיכוב פרויקט", desc: "פרויקטים בסיכון לעיכוב", sev: "warning" },
      pricing_suggestion: { title: "המלצת תמחור", desc: "הצעה לשינוי מחירים", sev: "info" },
      lead_scoring: { title: "דירוג לידים", desc: "ניקוד אוטומטי ללידים", sev: "info" },
      production_efficiency: { title: "יעילות ייצור", desc: "ניתוח יעילות קווי ייצור", sev: "info" },
      cost_reduction: { title: "הזדמנות חיסכון", desc: "זיהוי הזדמנויות להפחתת עלויות", sev: "info" },
    };

    const template = insights[category] || { title: "תובנה כללית", desc: "ניתוח AI", sev: "info" };

    await pool.query(
      `INSERT INTO engine_ai_insights (insight_id, category, severity, title_he, description_he, data_points, confidence, actionable, generated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())`,
      [insightId, category, template.sev, template.title, template.desc, JSON.stringify(dataPoints || {}), 0.85]
    );

    res.json({ insightId, category, title: template.title, severity: template.sev });
  } catch (e) { next(e); }
});

router.post("/insights/:id/acknowledge", async (req, res, next) => {
  try {
    await pool.query(
      "UPDATE engine_ai_insights SET acknowledged = true, acknowledged_by = $1 WHERE insight_id = $2",
      [req.body.userId || "admin", req.params.id]
    );
    res.json({ message: "תובנה אושרה" });
  } catch (e) { next(e); }
});

// === AUTOMATION RULES ===
router.get("/automation/rules", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM engine_automation_rules ORDER BY priority, category");
    res.json({ count: result.rows.length, rules: result.rows });
  } catch (e) { next(e); }
});

router.post("/automation/rules", async (req, res, next) => {
  try {
    const { name, description, events, conditions, actions, category, cooldown } = req.body;
    const ruleId = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(
      `INSERT INTO engine_automation_rules (rule_id, name_he, description, trigger_event_types, conditions, actions, category, cooldown_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ruleId, name, description, JSON.stringify(events || []), JSON.stringify(conditions || []),
       JSON.stringify(actions || []), category || "general", cooldown || 60000]
    );
    res.status(201).json({ ruleId, message: "חוק אוטומציה נוצר" });
  } catch (e) { next(e); }
});

router.patch("/automation/rules/:id/toggle", async (req, res, next) => {
  try {
    const { enabled } = req.body;
    await pool.query("UPDATE engine_automation_rules SET enabled = $1, updated_at = NOW() WHERE rule_id = $2", [enabled, req.params.id]);
    res.json({ message: enabled ? "חוק הופעל" : "חוק הושבת" });
  } catch (e) { next(e); }
});

router.get("/automation/log", async (req, res, next) => {
  try {
    const { ruleId, limit = "50" } = req.query as any;
    let sql = "SELECT * FROM engine_automation_log";
    const params: any[] = [];
    if (ruleId) { sql += " WHERE rule_id = $1"; params.push(ruleId); }
    sql += " ORDER BY created_at DESC LIMIT $" + (params.length + 1);
    params.push(parseInt(limit));
    const result = await pool.query(sql, params);
    res.json({ count: result.rows.length, log: result.rows });
  } catch (e) { next(e); }
});

// === SYNC BRIDGE ===
router.get("/sync/configs", async (_req, res, next) => {
  try {
    const result = await pool.query("SELECT * FROM engine_sync_configs ORDER BY system_name");
    res.json({ count: result.rows.length, configs: result.rows });
  } catch (e) { next(e); }
});

router.patch("/sync/configs/:system", async (req, res, next) => {
  try {
    const updates = req.body;
    const fields = Object.keys(updates).filter(k => !["id", "system_name", "created_at"].includes(k));
    if (fields.length === 0) return res.status(400).json({ error: "אין שדות לעדכון" });
    const setClauses = fields.map((f, i) => `"${f}" = $${i + 1}`).join(", ");
    const values = fields.map(f => typeof updates[f] === "object" ? JSON.stringify(updates[f]) : updates[f]);
    await pool.query(
      `UPDATE engine_sync_configs SET ${setClauses}, updated_at = NOW() WHERE system_name = $${fields.length + 1}`,
      [...values, req.params.system]
    );
    res.json({ message: `סנכרון ${req.params.system} עודכן` });
  } catch (e) { next(e); }
});

router.post("/sync/test/:system", async (req, res, next) => {
  try {
    const config = await pool.query("SELECT * FROM engine_sync_configs WHERE system_name = $1", [req.params.system]);
    if (config.rows.length === 0) return res.status(404).json({ error: "מערכת לא נמצאה" });

    // Simulate connection test
    const success = config.rows[0].auth_credentials && Object.keys(config.rows[0].auth_credentials).length > 0;
    await pool.query(
      "UPDATE engine_sync_configs SET is_connected = $1, last_sync_status = $2, updated_at = NOW() WHERE system_name = $3",
      [success, success ? "success" : "failed", req.params.system]
    );

    res.json({ system: req.params.system, connected: success, message: success ? "חיבור תקין" : "חסרים פרטי חיבור" });
  } catch (e) { next(e); }
});

router.get("/sync/log", async (req, res, next) => {
  try {
    const { system, limit = "50" } = req.query as any;
    let sql = "SELECT * FROM engine_sync_log";
    const params: any[] = [];
    if (system) { sql += " WHERE system_name = $1"; params.push(system); }
    sql += " ORDER BY created_at DESC LIMIT $" + (params.length + 1);
    params.push(parseInt(limit));
    const result = await pool.query(sql, params);
    res.json({ count: result.rows.length, log: result.rows });
  } catch (e) { next(e); }
});

// === ENGINE DASHBOARD ===
router.get("/dashboard", async (_req, res, next) => {
  try {
    const [events, insights, rules, syncs, recentEvents, recentAutomations] = await Promise.all([
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'completed') as completed, COUNT(*) FILTER (WHERE status = 'failed') as failed FROM engine_events"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE severity = 'critical') as critical, COUNT(*) FILTER (WHERE acknowledged = false) as unread FROM engine_ai_insights"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE enabled = true) as active, SUM(total_fired) as total_fired, SUM(total_success) as total_success FROM engine_automation_rules"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_connected = true) as connected FROM engine_sync_configs"),
      pool.query("SELECT event_type, COUNT(*) as count FROM engine_events WHERE created_at > NOW() - INTERVAL '24 hours' GROUP BY event_type ORDER BY count DESC LIMIT 10"),
      pool.query("SELECT * FROM engine_automation_log ORDER BY created_at DESC LIMIT 10"),
    ]);

    res.json({
      engine: {
        name: "TechnoKolUzi AI Engine",
        version: "1.0.0",
        status: "running",
      },
      dataBus: {
        totalEvents: parseInt(events.rows[0].total),
        completed: parseInt(events.rows[0].completed),
        failed: parseInt(events.rows[0].failed),
        recentByType: recentEvents.rows,
      },
      aiBrain: {
        totalInsights: parseInt(insights.rows[0].total),
        criticalInsights: parseInt(insights.rows[0].critical),
        unreadInsights: parseInt(insights.rows[0].unread),
      },
      automationEngine: {
        totalRules: parseInt(rules.rows[0].total),
        activeRules: parseInt(rules.rows[0].active),
        totalFired: parseInt(rules.rows[0].total_fired || "0"),
        totalSuccess: parseInt(rules.rows[0].total_success || "0"),
        recentExecutions: recentAutomations.rows,
      },
      syncBridge: {
        totalSystems: parseInt(syncs.rows[0].total),
        connectedSystems: parseInt(syncs.rows[0].connected),
      },
    });
  } catch (e) { next(e); }
});

// === ENGINE STATS ===
router.get("/stats", async (_req, res, next) => {
  try {
    const hourly = await pool.query(`
      SELECT date_trunc('hour', created_at) as hour, COUNT(*) as events
      FROM engine_events WHERE created_at > NOW() - INTERVAL '24 hours'
      GROUP BY hour ORDER BY hour
    `);

    const byModule = await pool.query(`
      SELECT source_module, COUNT(*) as count
      FROM engine_events WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY source_module ORDER BY count DESC
    `);

    const automationByCategory = await pool.query(`
      SELECT category, COUNT(*) as rules, SUM(total_fired) as fired, SUM(total_success) as success
      FROM engine_automation_rules GROUP BY category ORDER BY fired DESC
    `);

    res.json({
      eventsHourly: hourly.rows,
      eventsByModule: byModule.rows,
      automationByCategory: automationByCategory.rows,
    });
  } catch (e) { next(e); }
});

export default router;
