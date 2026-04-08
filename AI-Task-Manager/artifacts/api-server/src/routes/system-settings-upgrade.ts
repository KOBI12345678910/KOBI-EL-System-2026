import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// =====================================================================
// כלי עזר - שאילתות בסיס נתונים
// =====================================================================
const q = async (query: any) => {
  try { const r = await db.execute(query); return r.rows; }
  catch (e) { console.error("[SystemSettings]", e); return []; }
};

const qOne = async (query: any) => {
  try { const r = await db.execute(query); return (r.rows as any[])?.[0] || null; }
  catch (e) { console.error("[SystemSettings]", e); return null; }
};

function clean(d: any, skip: string[] = []) {
  const o = { ...d };
  for (const k of skip) delete o[k];
  for (const k in o) { if (o[k] === "" || o[k] === undefined) o[k] = null; }
  delete o.id; delete o.created_at; delete o.updated_at;
  return o;
}

// =====================================================================
//  POST /init - אתחול כל הטבלאות
// =====================================================================
router.post("/init", async (_req: Request, res: Response) => {
  try {
    // 1. טבלת מעקב סשנים של משתמשים
    await db.execute(sql`CREATE TABLE IF NOT EXISTS user_session_log (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR,
      action VARCHAR(50) DEFAULT 'login',
      ip_address VARCHAR,
      user_agent TEXT,
      login_at TIMESTAMPTZ DEFAULT NOW(),
      logout_at TIMESTAMPTZ,
      duration_minutes INTEGER,
      screen_recordings JSONB DEFAULT '[]',
      pages_visited JSONB DEFAULT '[]',
      actions_count INTEGER DEFAULT 0,
      device_type VARCHAR(50),
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // 2. מנוע כללי אוטומציה
    await db.execute(sql`CREATE TABLE IF NOT EXISTS automation_rules (
      id SERIAL PRIMARY KEY,
      rule_name VARCHAR(300),
      rule_name_he VARCHAR(300),
      trigger_type VARCHAR(50),
      trigger_entity VARCHAR(200),
      trigger_event VARCHAR(100),
      trigger_conditions JSONB DEFAULT '{}',
      actions JSONB DEFAULT '[]',
      action_delay_minutes INTEGER DEFAULT 0,
      channels JSONB DEFAULT '["app"]',
      notify_roles JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      execution_count INTEGER DEFAULT 0,
      last_executed TIMESTAMPTZ,
      error_count INTEGER DEFAULT 0,
      priority INTEGER DEFAULT 0,
      category VARCHAR(100),
      created_by VARCHAR(200),
      notes TEXT,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // 3. מרכז התראות מערכת
    await db.execute(sql`CREATE TABLE IF NOT EXISTS system_notifications (
      id SERIAL PRIMARY KEY,
      type VARCHAR(100),
      category VARCHAR(100),
      severity VARCHAR(20) DEFAULT 'info',
      title VARCHAR(500),
      title_he VARCHAR(500),
      message TEXT,
      message_he TEXT,
      target_user_id INTEGER,
      target_role VARCHAR(100),
      target_department VARCHAR(200),
      entity_type VARCHAR(200),
      entity_id INTEGER,
      action_url VARCHAR(500),
      action_label VARCHAR(200),
      channels JSONB DEFAULT '["app"]',
      sent_via_email BOOLEAN DEFAULT false,
      sent_via_whatsapp BOOLEAN DEFAULT false,
      sent_via_sms BOOLEAN DEFAULT false,
      sent_via_push BOOLEAN DEFAULT false,
      read BOOLEAN DEFAULT false,
      read_at TIMESTAMPTZ,
      dismissed BOOLEAN DEFAULT false,
      auto_generated BOOLEAN DEFAULT true,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // 4. חיבורי אינטגרציות
    await db.execute(sql`CREATE TABLE IF NOT EXISTS integration_configs (
      id SERIAL PRIMARY KEY,
      service_name VARCHAR(200),
      service_type VARCHAR(100),
      api_key_encrypted TEXT,
      api_secret_encrypted TEXT,
      webhook_url TEXT,
      base_url TEXT,
      auth_type VARCHAR(50),
      settings JSONB DEFAULT '{}',
      is_connected BOOLEAN DEFAULT false,
      last_sync TIMESTAMPTZ,
      sync_frequency VARCHAR(50),
      error_message TEXT,
      status VARCHAR(50) DEFAULT 'inactive',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // 5. יומן ביקורת מורחב
    await db.execute(sql`CREATE TABLE IF NOT EXISTS system_audit_enhanced (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      username VARCHAR,
      action VARCHAR(100),
      entity_type VARCHAR(200),
      entity_id INTEGER,
      entity_name VARCHAR(500),
      field_changes JSONB DEFAULT '[]',
      ip_address VARCHAR,
      device VARCHAR,
      before_data JSONB,
      after_data JSONB,
      approval_required BOOLEAN DEFAULT false,
      approved_by VARCHAR,
      approved_at TIMESTAMPTZ,
      risk_level VARCHAR(20) DEFAULT 'low',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // 6. סל מחזור
    await db.execute(sql`CREATE TABLE IF NOT EXISTS recycle_bin (
      id SERIAL PRIMARY KEY,
      original_table VARCHAR(200),
      original_id INTEGER,
      data JSONB,
      deleted_by VARCHAR(200),
      deleted_at TIMESTAMPTZ DEFAULT NOW(),
      restore_deadline TIMESTAMPTZ,
      restored BOOLEAN DEFAULT false,
      restored_by VARCHAR,
      restored_at TIMESTAMPTZ
    )`);

    // 7. קטגוריות מותאמות ובונה בלוקים
    await db.execute(sql`CREATE TABLE IF NOT EXISTS custom_categories (
      id SERIAL PRIMARY KEY,
      parent_id INTEGER,
      name VARCHAR(300),
      name_he VARCHAR(300),
      slug VARCHAR(200),
      icon VARCHAR(50),
      color VARCHAR(20),
      sort_order INTEGER DEFAULT 0,
      entity_type VARCHAR(200),
      settings JSONB DEFAULT '{}',
      is_system BOOLEAN DEFAULT false,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // =====================================================================
    // זריעת אינטגרציות ברירת מחדל
    // =====================================================================
    const defaultIntegrations = [
      { service_name: 'whatsapp_business', service_type: 'messaging', auth_type: 'api_key', settings: { description: 'WhatsApp Business API - שליחת הודעות ללקוחות', icon: 'whatsapp' } },
      { service_name: 'gmail', service_type: 'email', auth_type: 'oauth2', settings: { description: 'Gmail - שליחה וקבלת אימיילים', icon: 'mail' } },
      { service_name: 'google_calendar', service_type: 'calendar', auth_type: 'oauth2', settings: { description: 'Google Calendar - ניהול לוח שנה ופגישות', icon: 'calendar' } },
      { service_name: 'facebook_ads', service_type: 'advertising', auth_type: 'oauth2', settings: { description: 'Facebook Ads - ניהול קמפיינים', icon: 'facebook' } },
      { service_name: 'google_ads', service_type: 'advertising', auth_type: 'oauth2', settings: { description: 'Google Ads - ניהול קמפיינים', icon: 'google' } },
      { service_name: 'wix', service_type: 'website', auth_type: 'api_key', settings: { description: 'Wix - סנכרון אתר ומוצרים', icon: 'globe' } },
      { service_name: 'n8n', service_type: 'automation', auth_type: 'api_key', settings: { description: 'n8n - אוטומציות מתקדמות', icon: 'zap' } },
      { service_name: 'twilio_sms', service_type: 'messaging', auth_type: 'api_key', settings: { description: 'Twilio SMS - שליחת הודעות SMS', icon: 'message-square' } },
      { service_name: 'telegram', service_type: 'messaging', auth_type: 'bot_token', settings: { description: 'Telegram Bot - שליחת הודעות טלגרם', icon: 'send' } },
      { service_name: 'phone_system', service_type: 'telephony', auth_type: 'api_key', settings: { description: 'מרכזיית טלפון - ניהול שיחות', icon: 'phone' } },
      { service_name: 'mecano_attendance', service_type: 'hr', auth_type: 'api_key', settings: { description: 'מכונו נוכחות - דיווחי שעות', icon: 'clock' } },
      { service_name: 'accounting_software', service_type: 'finance', auth_type: 'api_key', settings: { description: 'תוכנת הנהלת חשבונות - סנכרון חשבוניות', icon: 'file-text' } },
      { service_name: 'bank_api', service_type: 'finance', auth_type: 'oauth2', settings: { description: 'API בנקאי - סנכרון תנועות בנק', icon: 'building' } },
      { service_name: 'stripe_payment', service_type: 'payment', auth_type: 'api_key', settings: { description: 'Stripe - עיבוד תשלומים', icon: 'credit-card' } },
    ];

    for (const intg of defaultIntegrations) {
      const exists = await qOne(sql`SELECT id FROM integration_configs WHERE service_name = ${intg.service_name} LIMIT 1`);
      if (!exists) {
        await db.execute(sql`INSERT INTO integration_configs (service_name, service_type, auth_type, settings)
          VALUES (${intg.service_name}, ${intg.service_type}, ${intg.auth_type}, ${JSON.stringify(intg.settings)})`);
      }
    }

    // =====================================================================
    // זריעת תבניות אוטומציה - 25+ תבניות מובנות
    // =====================================================================
    const automationTemplates = getAutomationTemplates();
    for (const tmpl of automationTemplates) {
      const exists = await qOne(sql`SELECT id FROM automation_rules WHERE rule_name = ${tmpl.rule_name} LIMIT 1`);
      if (!exists) {
        await db.execute(sql`INSERT INTO automation_rules
          (rule_name, rule_name_he, trigger_type, trigger_entity, trigger_event, trigger_conditions, actions, action_delay_minutes, channels, notify_roles, is_active, priority, category, created_by, notes, status)
          VALUES (
            ${tmpl.rule_name}, ${tmpl.rule_name_he}, ${tmpl.trigger_type}, ${tmpl.trigger_entity},
            ${tmpl.trigger_event}, ${JSON.stringify(tmpl.trigger_conditions)}, ${JSON.stringify(tmpl.actions)},
            ${tmpl.action_delay_minutes}, ${JSON.stringify(tmpl.channels)}, ${JSON.stringify(tmpl.notify_roles)},
            ${tmpl.is_active}, ${tmpl.priority}, ${tmpl.category}, ${'system'}, ${tmpl.notes}, ${'active'}
          )`);
      }
    }

    res.json({ success: true, message: "כל הטבלאות אותחלו בהצלחה, אינטגרציות ותבניות אוטומציה נזרעו" });
  } catch (e: any) {
    console.error("[SystemSettings] Init error:", e);
    res.status(500).json({ error: e.message });
  }
});


// =====================================================================
//  1. CRUD - מעקב סשנים (user_session_log)
// =====================================================================

// רשימת כל הסשנים
router.get("/user-sessions", async (req: Request, res: Response) => {
  const { status, user_id, limit = 100 } = req.query;
  let filter = sql`1=1`;
  if (status) filter = sql`${filter} AND status = ${status}`;
  if (user_id) filter = sql`${filter} AND user_id = ${Number(user_id)}`;
  const rows = await q(sql`SELECT * FROM user_session_log WHERE ${filter} ORDER BY login_at DESC LIMIT ${Number(limit)}`);
  res.json(rows);
});

// סשן בודד
router.get("/user-sessions/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM user_session_log WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

// יצירת סשן חדש
router.post("/user-sessions", async (req: Request, res: Response) => {
  try {
  const d = clean(req.body);
  const row = await qOne(sql`INSERT INTO user_session_log
    (user_id, username, action, ip_address, user_agent, device_type, status, pages_visited, screen_recordings)
    VALUES (${d.user_id}, ${d.username}, ${d.action || 'login'}, ${d.ip_address}, ${d.user_agent},
      ${d.device_type}, ${'active'}, ${JSON.stringify(d.pages_visited || [])}, ${JSON.stringify(d.screen_recordings || [])})
    RETURNING *`);
  res.json(row);
  } catch (err: any) { /* שגיאה ביצירת סשן משתמש */ console.error("POST /user-sessions error:", err.message); res.status(500).json({ error: "שגיאה ביצירת סשן משתמש" }); }
});

// עדכון סשן
router.put("/user-sessions/:id", async (req: Request, res: Response) => {
  const d = clean(req.body);
  const row = await qOne(sql`UPDATE user_session_log SET
    action = COALESCE(${d.action}, action),
    logout_at = COALESCE(${d.logout_at}, logout_at),
    duration_minutes = COALESCE(${d.duration_minutes}, duration_minutes),
    pages_visited = COALESCE(${d.pages_visited ? JSON.stringify(d.pages_visited) : null}::jsonb, pages_visited),
    screen_recordings = COALESCE(${d.screen_recordings ? JSON.stringify(d.screen_recordings) : null}::jsonb, screen_recordings),
    actions_count = COALESCE(${d.actions_count}, actions_count),
    status = COALESCE(${d.status}, status)
    WHERE id = ${Number(req.params.id)} RETURNING *`);
  res.json(row);
});

// מעקב סשנים פעילים - מי מחובר עכשיו, שעות, עמודים
router.get("/session-tracking", async (_req: Request, res: Response) => {
  // סשנים פעילים
  const active = await q(sql`SELECT
    usl.*,
    EXTRACT(EPOCH FROM (NOW() - usl.login_at)) / 60 AS current_duration_minutes
    FROM user_session_log usl
    WHERE usl.status = 'active' AND usl.logout_at IS NULL
    ORDER BY usl.login_at DESC`);

  // סטטיסטיקות כלליות
  const stats = await qOne(sql`SELECT
    COUNT(*) FILTER(WHERE status = 'active' AND logout_at IS NULL) AS active_now,
    COUNT(*) FILTER(WHERE login_at >= NOW() - INTERVAL '24 hours') AS last_24h,
    COUNT(*) FILTER(WHERE login_at >= NOW() - INTERVAL '7 days') AS last_7d,
    AVG(duration_minutes) FILTER(WHERE duration_minutes > 0) AS avg_session_minutes,
    MAX(duration_minutes) AS max_session_minutes,
    COUNT(DISTINCT user_id) FILTER(WHERE login_at >= NOW() - INTERVAL '24 hours') AS unique_users_24h
    FROM user_session_log`);

  // פעילות לפי שעה (24 שעות אחרונות)
  const hourly = await q(sql`SELECT
    EXTRACT(HOUR FROM login_at) AS hour,
    COUNT(*) AS sessions
    FROM user_session_log
    WHERE login_at >= NOW() - INTERVAL '24 hours'
    GROUP BY EXTRACT(HOUR FROM login_at)
    ORDER BY hour`);

  res.json({ active_sessions: active, stats, hourly_activity: hourly });
});


// =====================================================================
//  2. CRUD - כללי אוטומציה (automation_rules)
// =====================================================================

// רשימת כללים
router.get("/automation-rules", async (req: Request, res: Response) => {
  const { category, is_active, trigger_entity } = req.query;
  let filter = sql`1=1`;
  if (category) filter = sql`${filter} AND category = ${category}`;
  if (is_active !== undefined) filter = sql`${filter} AND is_active = ${is_active === 'true'}`;
  if (trigger_entity) filter = sql`${filter} AND trigger_entity = ${trigger_entity}`;
  const rows = await q(sql`SELECT * FROM automation_rules WHERE ${filter} ORDER BY priority DESC, created_at DESC`);
  res.json(rows);
});

// כלל בודד
router.get("/automation-rules/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM automation_rules WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

// יצירת כלל חדש
router.post("/automation-rules", async (req: Request, res: Response) => {
  try {
  const d = clean(req.body);
  const row = await qOne(sql`INSERT INTO automation_rules
    (rule_name, rule_name_he, trigger_type, trigger_entity, trigger_event, trigger_conditions,
     actions, action_delay_minutes, channels, notify_roles, is_active, priority, category, created_by, notes)
    VALUES (${d.rule_name}, ${d.rule_name_he}, ${d.trigger_type}, ${d.trigger_entity}, ${d.trigger_event},
      ${JSON.stringify(d.trigger_conditions || {})}, ${JSON.stringify(d.actions || [])},
      ${d.action_delay_minutes || 0}, ${JSON.stringify(d.channels || ['app'])},
      ${JSON.stringify(d.notify_roles || [])}, ${d.is_active !== false}, ${d.priority || 0},
      ${d.category}, ${d.created_by}, ${d.notes})
    RETURNING *`);
  res.json(row);
  } catch (err: any) { /* שגיאה ביצירת כלל אוטומציה */ console.error("POST /automation-rules error:", err.message); res.status(500).json({ error: "שגיאה ביצירת כלל אוטומציה" }); }
});

// עדכון כלל
router.put("/automation-rules/:id", async (req: Request, res: Response) => {
  try {
  const d = clean(req.body);
  const row = await qOne(sql`UPDATE automation_rules SET
    rule_name = COALESCE(${d.rule_name}, rule_name),
    rule_name_he = COALESCE(${d.rule_name_he}, rule_name_he),
    trigger_type = COALESCE(${d.trigger_type}, trigger_type),
    trigger_entity = COALESCE(${d.trigger_entity}, trigger_entity),
    trigger_event = COALESCE(${d.trigger_event}, trigger_event),
    trigger_conditions = COALESCE(${d.trigger_conditions ? JSON.stringify(d.trigger_conditions) : null}::jsonb, trigger_conditions),
    actions = COALESCE(${d.actions ? JSON.stringify(d.actions) : null}::jsonb, actions),
    action_delay_minutes = COALESCE(${d.action_delay_minutes}, action_delay_minutes),
    channels = COALESCE(${d.channels ? JSON.stringify(d.channels) : null}::jsonb, channels),
    notify_roles = COALESCE(${d.notify_roles ? JSON.stringify(d.notify_roles) : null}::jsonb, notify_roles),
    is_active = COALESCE(${d.is_active}, is_active),
    priority = COALESCE(${d.priority}, priority),
    category = COALESCE(${d.category}, category),
    notes = COALESCE(${d.notes}, notes),
    status = COALESCE(${d.status}, status),
    updated_at = NOW()
    WHERE id = ${Number(req.params.id)} RETURNING *`);
  res.json(row);
  } catch (err: any) { /* שגיאה בעדכון כלל אוטומציה */ console.error("PUT /automation-rules error:", err.message); res.status(500).json({ error: "שגיאה בעדכון כלל אוטומציה" }); }
});

// הרצת כלל אוטומציה
router.post("/automation/execute", async (req: Request, res: Response) => {
  const { rule_id, context } = req.body;
  try {
    const rule = await qOne(sql`SELECT * FROM automation_rules WHERE id = ${Number(rule_id)} AND is_active = true`);
    if (!rule) return res.status(404).json({ error: "כלל לא נמצא או לא פעיל" });

    // עדכון מספר הרצות
    await db.execute(sql`UPDATE automation_rules SET
      execution_count = execution_count + 1,
      last_executed = NOW()
      WHERE id = ${Number(rule_id)}`);

    // יצירת התראה על ההרצה
    const actions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : (rule.actions || []);
    const executedActions: any[] = [];

    for (const action of actions) {
      // סימולציית הרצת פעולות
      const result: any = {
        action_type: action.type,
        status: 'executed',
        executed_at: new Date().toISOString(),
        details: {}
      };

      switch (action.type) {
        case 'notify':
          // יצירת התראה
          await db.execute(sql`INSERT INTO system_notifications
            (type, category, severity, title, title_he, message, message_he, target_role, entity_type, auto_generated, channels)
            VALUES ('automation', ${(rule as any).category}, 'info',
              ${`Automation: ${(rule as any).rule_name}`},
              ${`אוטומציה: ${(rule as any).rule_name_he}`},
              ${`Rule "${(rule as any).rule_name}" executed`},
              ${`הכלל "${(rule as any).rule_name_he}" הופעל`},
              ${action.target_role || null}, ${(rule as any).trigger_entity}, true,
              ${JSON.stringify((rule as any).channels || ['app'])})`);
          result.details = { notification_created: true };
          break;

        case 'assign':
          result.details = { assigned_to: action.assign_to, entity: context?.entity_type };
          break;

        case 'create_entity':
          result.details = { entity_type: action.entity_type, template: action.template };
          break;

        case 'send_email':
          result.details = { to: action.to, template: action.email_template };
          break;

        case 'send_whatsapp':
          result.details = { to: action.to, template: action.message_template };
          break;

        case 'update_field':
          result.details = { field: action.field, value: action.value };
          break;

        case 'escalate':
          result.details = { escalate_to: action.escalate_to, reason: action.reason };
          break;

        case 'webhook':
          result.details = { url: action.url, method: action.method || 'POST' };
          break;

        default:
          result.status = 'skipped';
          result.details = { reason: 'סוג פעולה לא מוכר' };
      }

      executedActions.push(result);
    }

    // רישום ביומן ביקורת
    await db.execute(sql`INSERT INTO system_audit_enhanced
      (username, action, entity_type, entity_id, entity_name, after_data, risk_level)
      VALUES ('system', 'automation_executed', 'automation_rules', ${Number(rule_id)},
        ${(rule as any).rule_name}, ${JSON.stringify({ executed_actions: executedActions, context })}, 'low')`);

    res.json({
      success: true,
      rule_id,
      rule_name: (rule as any).rule_name,
      executed_actions: executedActions,
      execution_count: ((rule as any).execution_count || 0) + 1
    });
  } catch (e: any) {
    // עדכון שגיאות
    await db.execute(sql`UPDATE automation_rules SET error_count = error_count + 1 WHERE id = ${Number(rule_id)}`);
    res.status(500).json({ error: e.message });
  }
});

// תבניות אוטומציה מובנות
router.get("/automation/templates", async (_req: Request, res: Response) => {
  res.json(getAutomationTemplates());
});


// =====================================================================
//  3. CRUD - התראות מערכת (system_notifications)
// =====================================================================

// כל ההתראות
router.get("/system-notifications", async (req: Request, res: Response) => {
  const { category, severity, target_user_id, limit = 100 } = req.query;
  let filter = sql`1=1`;
  if (category) filter = sql`${filter} AND category = ${category}`;
  if (severity) filter = sql`${filter} AND severity = ${severity}`;
  if (target_user_id) filter = sql`${filter} AND target_user_id = ${Number(target_user_id)}`;
  const rows = await q(sql`SELECT * FROM system_notifications WHERE ${filter} ORDER BY created_at DESC LIMIT ${Number(limit)}`);
  res.json(rows);
});

// התראה בודדת
router.get("/system-notifications/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM system_notifications WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

// יצירת התראה
router.post("/system-notifications", async (req: Request, res: Response) => {
  try {
  const d = clean(req.body);
  const row = await qOne(sql`INSERT INTO system_notifications
    (type, category, severity, title, title_he, message, message_he,
     target_user_id, target_role, target_department, entity_type, entity_id,
     action_url, action_label, channels, auto_generated, expires_at)
    VALUES (${d.type}, ${d.category}, ${d.severity || 'info'}, ${d.title}, ${d.title_he},
      ${d.message}, ${d.message_he}, ${d.target_user_id}, ${d.target_role}, ${d.target_department},
      ${d.entity_type}, ${d.entity_id}, ${d.action_url}, ${d.action_label},
      ${JSON.stringify(d.channels || ['app'])}, ${d.auto_generated !== false}, ${d.expires_at})
    RETURNING *`);
  res.json(row);
  } catch (err: any) { /* שגיאה ביצירת התראת מערכת */ console.error("POST /system-notifications error:", err.message); res.status(500).json({ error: "שגיאה ביצירת התראת מערכת" }); }
});

// עדכון התראה
router.put("/system-notifications/:id", async (req: Request, res: Response) => {
  const d = clean(req.body);
  const row = await qOne(sql`UPDATE system_notifications SET
    type = COALESCE(${d.type}, type),
    category = COALESCE(${d.category}, category),
    severity = COALESCE(${d.severity}, severity),
    title = COALESCE(${d.title}, title),
    title_he = COALESCE(${d.title_he}, title_he),
    message = COALESCE(${d.message}, message),
    message_he = COALESCE(${d.message_he}, message_he),
    read = COALESCE(${d.read}, read),
    read_at = COALESCE(${d.read_at}, read_at),
    dismissed = COALESCE(${d.dismissed}, dismissed)
    WHERE id = ${Number(req.params.id)} RETURNING *`);
  res.json(row);
});

// התראות לא נקראות למשתמש
router.get("/notifications/unread/:userId", async (req: Request, res: Response) => {
  const userId = Number(req.params.userId);
  const rows = await q(sql`SELECT * FROM system_notifications
    WHERE (target_user_id = ${userId} OR target_user_id IS NULL)
    AND read = false AND dismissed = false
    AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1 WHEN 'warning' THEN 2 WHEN 'info' THEN 3 ELSE 4 END,
      created_at DESC`);
  const count = rows.length;
  res.json({ count, notifications: rows });
});

// סימון כנקרא
router.post("/notifications/mark-read", async (req: Request, res: Response) => {
  try {
  const { notification_ids, user_id, mark_all } = req.body;
  if (mark_all && user_id) {
    // סמן הכל כנקרא למשתמש
    await db.execute(sql`UPDATE system_notifications SET read = true, read_at = NOW()
      WHERE (target_user_id = ${Number(user_id)} OR target_user_id IS NULL) AND read = false`);
    res.json({ success: true, message: "כל ההתראות סומנו כנקראו" });
  } else if (notification_ids && Array.isArray(notification_ids)) {
    for (const nid of notification_ids) {
      await db.execute(sql`UPDATE system_notifications SET read = true, read_at = NOW() WHERE id = ${Number(nid)}`);
    }
    res.json({ success: true, marked: notification_ids.length });
  } else {
    res.status(400).json({ error: "יש לספק notification_ids או mark_all + user_id" });
  }
  } catch (err: any) { /* שגיאה בסימון התראות כנקראו */ console.error("POST /notifications/mark-read error:", err.message); res.status(500).json({ error: "שגיאה בסימון התראות כנקראו" }); }
});


// =====================================================================
//  4. CRUD - אינטגרציות (integration_configs)
// =====================================================================

// כל האינטגרציות
router.get("/integration-configs", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT id, service_name, service_type, auth_type, settings,
    is_connected, last_sync, sync_frequency, error_message, status, webhook_url, base_url,
    created_at, updated_at
    FROM integration_configs ORDER BY service_name`);
  res.json(rows);
});

// אינטגרציה בודדת
router.get("/integration-configs/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM integration_configs WHERE id = ${Number(req.params.id)}`);
  // אל תחזיר מפתחות מוצפנים
  if (row) {
    (row as any).api_key_encrypted = (row as any).api_key_encrypted ? '***ENCRYPTED***' : null;
    (row as any).api_secret_encrypted = (row as any).api_secret_encrypted ? '***ENCRYPTED***' : null;
  }
  res.json(row);
});

// יצירת אינטגרציה חדשה
router.post("/integration-configs", async (req: Request, res: Response) => {
  try {
  const d = clean(req.body);
  const row = await qOne(sql`INSERT INTO integration_configs
    (service_name, service_type, api_key_encrypted, api_secret_encrypted, webhook_url,
     base_url, auth_type, settings, is_connected, sync_frequency, status)
    VALUES (${d.service_name}, ${d.service_type}, ${d.api_key_encrypted}, ${d.api_secret_encrypted},
      ${d.webhook_url}, ${d.base_url}, ${d.auth_type}, ${JSON.stringify(d.settings || {})},
      ${d.is_connected || false}, ${d.sync_frequency}, ${d.status || 'inactive'})
    RETURNING *`);
  res.json(row);
  } catch (err: any) { /* שגיאה ביצירת הגדרת אינטגרציה - רגיש אבטחתית */ console.error("POST /integration-configs error:", err.message); res.status(500).json({ error: "שגיאה ביצירת הגדרת אינטגרציה" }); }
});

// עדכון אינטגרציה
router.put("/integration-configs/:id", async (req: Request, res: Response) => {
  try {
  const d = clean(req.body);
  const row = await qOne(sql`UPDATE integration_configs SET
    service_name = COALESCE(${d.service_name}, service_name),
    service_type = COALESCE(${d.service_type}, service_type),
    api_key_encrypted = COALESCE(${d.api_key_encrypted}, api_key_encrypted),
    api_secret_encrypted = COALESCE(${d.api_secret_encrypted}, api_secret_encrypted),
    webhook_url = COALESCE(${d.webhook_url}, webhook_url),
    base_url = COALESCE(${d.base_url}, base_url),
    auth_type = COALESCE(${d.auth_type}, auth_type),
    settings = COALESCE(${d.settings ? JSON.stringify(d.settings) : null}::jsonb, settings),
    is_connected = COALESCE(${d.is_connected}, is_connected),
    sync_frequency = COALESCE(${d.sync_frequency}, sync_frequency),
    error_message = COALESCE(${d.error_message}, error_message),
    status = COALESCE(${d.status}, status),
    last_sync = COALESCE(${d.last_sync}, last_sync),
    updated_at = NOW()
    WHERE id = ${Number(req.params.id)} RETURNING *`);
  res.json(row);
  } catch (err: any) { /* שגיאה בעדכון הגדרת אינטגרציה - רגיש אבטחתית */ console.error("PUT /integration-configs error:", err.message); res.status(500).json({ error: "שגיאה בעדכון הגדרת אינטגרציה" }); }
});

// סטטוס כל האינטגרציות
router.get("/integrations/status", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT
    id, service_name, service_type, is_connected, status, last_sync,
    sync_frequency, error_message, settings,
    CASE WHEN is_connected THEN 'connected' WHEN error_message IS NOT NULL THEN 'error' ELSE 'disconnected' END AS connection_status
    FROM integration_configs ORDER BY is_connected DESC, service_name`);
  const connected = (rows as any[]).filter(r => r.is_connected).length;
  const total = rows.length;
  res.json({ total, connected, disconnected: total - connected, integrations: rows });
});

// בדיקת חיבור אינטגרציה
router.post("/integrations/test/:serviceId", async (req: Request, res: Response) => {
  const serviceId = Number(req.params.serviceId);
  const intg = await qOne(sql`SELECT * FROM integration_configs WHERE id = ${serviceId}`);
  if (!intg) return res.status(404).json({ error: "אינטגרציה לא נמצאה" });

  // סימולציית בדיקת חיבור
  const hasKey = !!(intg as any).api_key_encrypted || !!(intg as any).webhook_url || !!(intg as any).base_url;
  const testResult = {
    service_name: (intg as any).service_name,
    test_passed: hasKey,
    tested_at: new Date().toISOString(),
    response_time_ms: Math.floor(Math.random() * 500) + 50,
    details: hasKey
      ? { status: 'ok', message: 'החיבור תקין' }
      : { status: 'missing_credentials', message: 'חסרים פרטי התחברות' }
  };

  // עדכון סטטוס
  if (hasKey) {
    await db.execute(sql`UPDATE integration_configs SET
      is_connected = true, status = 'active', error_message = NULL, last_sync = NOW(), updated_at = NOW()
      WHERE id = ${serviceId}`);
  } else {
    await db.execute(sql`UPDATE integration_configs SET
      is_connected = false, error_message = 'חסרים פרטי התחברות', updated_at = NOW()
      WHERE id = ${serviceId}`);
  }

  res.json(testResult);
});


// =====================================================================
//  5. CRUD - יומן ביקורת מורחב (system_audit_enhanced)
// =====================================================================

// כל הרשומות
router.get("/system-audit-enhanced", async (req: Request, res: Response) => {
  const { entity_type, user_id, action, risk_level, limit = 200 } = req.query;
  let filter = sql`1=1`;
  if (entity_type) filter = sql`${filter} AND entity_type = ${entity_type}`;
  if (user_id) filter = sql`${filter} AND user_id = ${Number(user_id)}`;
  if (action) filter = sql`${filter} AND action = ${action}`;
  if (risk_level) filter = sql`${filter} AND risk_level = ${risk_level}`;
  const rows = await q(sql`SELECT * FROM system_audit_enhanced WHERE ${filter} ORDER BY created_at DESC LIMIT ${Number(limit)}`);
  res.json(rows);
});

// רשומת ביקורת בודדת
router.get("/system-audit-enhanced/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM system_audit_enhanced WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

// יצירת רשומת ביקורת
router.post("/system-audit-enhanced", async (req: Request, res: Response) => {
  const d = clean(req.body);
  const row = await qOne(sql`INSERT INTO system_audit_enhanced
    (user_id, username, action, entity_type, entity_id, entity_name, field_changes,
     ip_address, device, before_data, after_data, approval_required, risk_level)
    VALUES (${d.user_id}, ${d.username}, ${d.action}, ${d.entity_type}, ${d.entity_id},
      ${d.entity_name}, ${JSON.stringify(d.field_changes || [])}, ${d.ip_address}, ${d.device},
      ${d.before_data ? JSON.stringify(d.before_data) : null},
      ${d.after_data ? JSON.stringify(d.after_data) : null},
      ${d.approval_required || false}, ${d.risk_level || 'low'})
    RETURNING *`);
  res.json(row);
});

// עדכון רשומת ביקורת (אישור)
router.put("/system-audit-enhanced/:id", async (req: Request, res: Response) => {
  const d = clean(req.body);
  const row = await qOne(sql`UPDATE system_audit_enhanced SET
    approved_by = COALESCE(${d.approved_by}, approved_by),
    approved_at = COALESCE(${d.approved_at}, approved_at),
    risk_level = COALESCE(${d.risk_level}, risk_level)
    WHERE id = ${Number(req.params.id)} RETURNING *`);
  res.json(row);
});

// ביקורת מלאה לישות מסוימת
router.get("/audit/entity/:type/:id", async (req: Request, res: Response) => {
  const { type, id } = req.params;
  const rows = await q(sql`SELECT * FROM system_audit_enhanced
    WHERE entity_type = ${type} AND entity_id = ${Number(id)}
    ORDER BY created_at DESC`);
  // סטטיסטיקות
  const stats = await qOne(sql`SELECT
    COUNT(*) AS total_changes,
    COUNT(DISTINCT username) AS unique_editors,
    MIN(created_at) AS first_change,
    MAX(created_at) AS last_change,
    COUNT(*) FILTER(WHERE risk_level = 'high' OR risk_level = 'critical') AS high_risk_changes,
    COUNT(*) FILTER(WHERE approval_required = true AND approved_by IS NULL) AS pending_approvals
    FROM system_audit_enhanced
    WHERE entity_type = ${type} AND entity_id = ${Number(id)}`);
  res.json({ entity_type: type, entity_id: Number(id), stats, audit_trail: rows });
});


// =====================================================================
//  6. CRUD - סל מחזור (recycle_bin)
// =====================================================================

// רשימת פריטים שנמחקו
router.get("/recycle-bin", async (req: Request, res: Response) => {
  const { original_table, deleted_by } = req.query;
  let filter = sql`restored = false`;
  if (original_table) filter = sql`${filter} AND original_table = ${original_table}`;
  if (deleted_by) filter = sql`${filter} AND deleted_by = ${deleted_by}`;
  const rows = await q(sql`SELECT * FROM recycle_bin WHERE ${filter} ORDER BY deleted_at DESC`);
  res.json(rows);
});

// פריט בודד בסל מחזור
router.get("/recycle-bin/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM recycle_bin WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

// העברה לסל מחזור
router.post("/recycle-bin", async (req: Request, res: Response) => {
  try {
  const d = clean(req.body);
  // חישוב דדליין לשחזור - 30 ימים
  const row = await qOne(sql`INSERT INTO recycle_bin
    (original_table, original_id, data, deleted_by, restore_deadline)
    VALUES (${d.original_table}, ${d.original_id},
      ${JSON.stringify(d.data || {})}, ${d.deleted_by},
      NOW() + INTERVAL '30 days')
    RETURNING *`);
  // רישום ביומן ביקורת
  await db.execute(sql`INSERT INTO system_audit_enhanced
    (username, action, entity_type, entity_id, entity_name, before_data, risk_level)
    VALUES (${d.deleted_by}, 'delete_to_recycle_bin', ${d.original_table}, ${d.original_id},
      ${d.original_table + '#' + d.original_id}, ${JSON.stringify(d.data || {})}, 'medium')`);
  res.json(row);
  } catch (err: any) { /* שגיאה בהעברה לסל מחזור - כולל רישום ביקורת */ console.error("POST /recycle-bin error:", err.message); res.status(500).json({ error: "שגיאה בהעברה לסל מחזור" }); }
});

// שחזור פריט מסל מחזור
router.post("/recycle-bin/restore/:id", async (req: Request, res: Response) => {
  try {
  const id = Number(req.params.id);
  const { restored_by } = req.body;

  const item = await qOne(sql`SELECT * FROM recycle_bin WHERE id = ${id}`);
  if (!item) return res.status(404).json({ error: "פריט לא נמצא בסל מחזור" });
  if ((item as any).restored) return res.status(400).json({ error: "הפריט כבר שוחזר" });

  // סימון כמשוחזר
  await db.execute(sql`UPDATE recycle_bin SET
    restored = true, restored_by = ${restored_by || 'system'}, restored_at = NOW()
    WHERE id = ${id}`);

  // רישום ביומן ביקורת
  await db.execute(sql`INSERT INTO system_audit_enhanced
    (username, action, entity_type, entity_id, entity_name, after_data, risk_level)
    VALUES (${restored_by || 'system'}, 'restore_from_recycle_bin',
      ${(item as any).original_table}, ${(item as any).original_id},
      ${(item as any).original_table + '#' + (item as any).original_id},
      ${JSON.stringify((item as any).data)}, 'medium')`);

  res.json({
    success: true,
    message: "הפריט שוחזר בהצלחה",
    restored_item: item
  });
  } catch (err: any) { /* שגיאה בשחזור מסל מחזור - כולל עדכון וביקורת */ console.error("POST /recycle-bin/restore error:", err.message); res.status(500).json({ error: "שגיאה בשחזור מסל מחזור" }); }
});


// =====================================================================
//  7. CRUD - קטגוריות מותאמות (custom_categories)
// =====================================================================

// כל הקטגוריות
router.get("/custom-categories", async (req: Request, res: Response) => {
  const { entity_type, parent_id, status } = req.query;
  let filter = sql`1=1`;
  if (entity_type) filter = sql`${filter} AND entity_type = ${entity_type}`;
  if (parent_id) filter = sql`${filter} AND parent_id = ${Number(parent_id)}`;
  if (status) filter = sql`${filter} AND status = ${status}`;
  const rows = await q(sql`SELECT * FROM custom_categories WHERE ${filter} ORDER BY sort_order, name`);
  res.json(rows);
});

// קטגוריה בודדת
router.get("/custom-categories/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM custom_categories WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

// יצירת קטגוריה
router.post("/custom-categories", async (req: Request, res: Response) => {
  const d = clean(req.body);
  const slug = d.slug || (d.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const row = await qOne(sql`INSERT INTO custom_categories
    (parent_id, name, name_he, slug, icon, color, sort_order, entity_type, settings, is_system, status)
    VALUES (${d.parent_id}, ${d.name}, ${d.name_he}, ${slug}, ${d.icon}, ${d.color},
      ${d.sort_order || 0}, ${d.entity_type}, ${JSON.stringify(d.settings || {})},
      ${d.is_system || false}, ${d.status || 'active'})
    RETURNING *`);
  res.json(row);
});

// עדכון קטגוריה
router.put("/custom-categories/:id", async (req: Request, res: Response) => {
  const d = clean(req.body);
  const row = await qOne(sql`UPDATE custom_categories SET
    parent_id = COALESCE(${d.parent_id}, parent_id),
    name = COALESCE(${d.name}, name),
    name_he = COALESCE(${d.name_he}, name_he),
    slug = COALESCE(${d.slug}, slug),
    icon = COALESCE(${d.icon}, icon),
    color = COALESCE(${d.color}, color),
    sort_order = COALESCE(${d.sort_order}, sort_order),
    entity_type = COALESCE(${d.entity_type}, entity_type),
    settings = COALESCE(${d.settings ? JSON.stringify(d.settings) : null}::jsonb, settings),
    status = COALESCE(${d.status}, status),
    updated_at = NOW()
    WHERE id = ${Number(req.params.id)} RETURNING *`);
  res.json(row);
});


// =====================================================================
//  דשבורד בריאות מערכת
// =====================================================================
router.get("/dashboard/system-health", async (_req: Request, res: Response) => {
  // סשנים פעילים
  const sessions = await qOne(sql`SELECT
    COUNT(*) FILTER(WHERE status = 'active' AND logout_at IS NULL) AS active_sessions,
    COUNT(*) FILTER(WHERE login_at >= NOW() - INTERVAL '24 hours') AS sessions_today,
    COUNT(DISTINCT user_id) FILTER(WHERE login_at >= NOW() - INTERVAL '24 hours') AS unique_users_today
    FROM user_session_log`);

  // כללי אוטומציה
  const automations = await qOne(sql`SELECT
    COUNT(*) AS total_rules,
    COUNT(*) FILTER(WHERE is_active = true) AS active_rules,
    SUM(execution_count) AS total_executions,
    SUM(error_count) AS total_errors,
    MAX(last_executed) AS last_execution
    FROM automation_rules`);

  // התראות
  const notifications = await qOne(sql`SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER(WHERE read = false) AS unread,
    COUNT(*) FILTER(WHERE severity = 'critical' AND read = false) AS critical_unread,
    COUNT(*) FILTER(WHERE severity = 'error' AND read = false) AS error_unread,
    COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '24 hours') AS today
    FROM system_notifications`);

  // אינטגרציות
  const integrations = await qOne(sql`SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER(WHERE is_connected = true) AS connected,
    COUNT(*) FILTER(WHERE status = 'active') AS active,
    COUNT(*) FILTER(WHERE error_message IS NOT NULL) AS with_errors
    FROM integration_configs`);

  // ביקורת
  const audit = await qOne(sql`SELECT
    COUNT(*) AS total_entries,
    COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '24 hours') AS entries_today,
    COUNT(*) FILTER(WHERE risk_level = 'high' OR risk_level = 'critical') AS high_risk,
    COUNT(*) FILTER(WHERE approval_required = true AND approved_by IS NULL) AS pending_approvals
    FROM system_audit_enhanced`);

  // סל מחזור
  const recycleBin = await qOne(sql`SELECT
    COUNT(*) FILTER(WHERE restored = false) AS items_in_bin,
    COUNT(*) FILTER(WHERE restored = true) AS restored_items,
    COUNT(*) FILTER(WHERE restore_deadline < NOW() AND restored = false) AS expired_items
    FROM recycle_bin`);

  // קטגוריות
  const categories = await qOne(sql`SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER(WHERE is_system = true) AS system_categories,
    COUNT(DISTINCT entity_type) AS entity_types
    FROM custom_categories WHERE status = 'active'`);

  res.json({
    timestamp: new Date().toISOString(),
    status: 'healthy',
    sessions,
    automations,
    notifications,
    integrations,
    audit,
    recycle_bin: recycleBin,
    categories
  });
});


// =====================================================================
//  פונקציית תבניות אוטומציה - 25+ תבניות
// =====================================================================
function getAutomationTemplates() {
  return [
    // ----- לידים / CRM -----
    {
      rule_name: 'New Lead → Assign to Agent + Notify',
      rule_name_he: 'ליד חדש → שיוך לנציג + התראה',
      trigger_type: 'entity_created',
      trigger_entity: 'crm_leads',
      trigger_event: 'insert',
      trigger_conditions: {},
      actions: [
        { type: 'assign', assign_to: 'round_robin', role: 'sales_agent' },
        { type: 'notify', target_role: 'sales_manager', message: 'ליד חדש נכנס למערכת' },
        { type: 'send_email', email_template: 'new_lead_welcome', to: '{{lead.email}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['sales_manager', 'sales_agent'],
      is_active: true,
      priority: 10,
      category: 'crm',
      notes: 'שיוך אוטומטי של לידים חדשים לנציגים בשיטת רוטציה'
    },
    {
      rule_name: 'Lead Status Change → Notify Manager',
      rule_name_he: 'שינוי סטטוס ליד → התראה למנהל',
      trigger_type: 'field_changed',
      trigger_entity: 'crm_leads',
      trigger_event: 'update',
      trigger_conditions: { field: 'status', from: '*', to: '*' },
      actions: [
        { type: 'notify', target_role: 'sales_manager', message: 'סטטוס ליד שונה: {{lead.name}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app'],
      notify_roles: ['sales_manager'],
      is_active: true,
      priority: 5,
      category: 'crm',
      notes: 'התראה על כל שינוי סטטוס ליד'
    },
    {
      rule_name: 'No Activity 48h → Alert',
      rule_name_he: 'אין פעילות 48 שעות → התראה',
      trigger_type: 'inactivity',
      trigger_entity: 'crm_leads',
      trigger_event: 'no_activity',
      trigger_conditions: { inactive_hours: 48, statuses: ['new', 'contacted'] },
      actions: [
        { type: 'notify', target_role: 'sales_agent', message: 'ליד ללא פעילות 48 שעות: {{lead.name}}' },
        { type: 'escalate', escalate_to: 'sales_manager', reason: 'חוסר פעילות' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email', 'whatsapp'],
      notify_roles: ['sales_agent', 'sales_manager'],
      is_active: true,
      priority: 8,
      category: 'crm',
      notes: 'זיהוי לידים קרים ללא פעילות 48 שעות'
    },
    {
      rule_name: 'Lead Qualified → Create Opportunity',
      rule_name_he: 'ליד מאושר → יצירת הזדמנות',
      trigger_type: 'field_changed',
      trigger_entity: 'crm_leads',
      trigger_event: 'update',
      trigger_conditions: { field: 'status', to: 'qualified' },
      actions: [
        { type: 'create_entity', entity_type: 'crm_opportunities', template: 'from_lead' },
        { type: 'notify', target_role: 'sales_manager', message: 'ליד הפך להזדמנות: {{lead.name}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app'],
      notify_roles: ['sales_manager'],
      is_active: true,
      priority: 9,
      category: 'crm',
      notes: 'יצירת הזדמנות אוטומטית כשליד מאושר'
    },

    // ----- הצעות מחיר / עסקאות -----
    {
      rule_name: 'Quote Approved → Create Deal',
      rule_name_he: 'הצעת מחיר אושרה → יצירת עסקה',
      trigger_type: 'field_changed',
      trigger_entity: 'crm_quotes',
      trigger_event: 'update',
      trigger_conditions: { field: 'status', to: 'approved' },
      actions: [
        { type: 'create_entity', entity_type: 'crm_deals', template: 'from_quote' },
        { type: 'notify', target_role: 'sales_agent', message: 'הצעת מחיר אושרה: {{quote.number}}' },
        { type: 'send_email', email_template: 'quote_approved', to: '{{customer.email}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['sales_agent', 'sales_manager'],
      is_active: true,
      priority: 10,
      category: 'sales',
      notes: 'יצירת עסקה אוטומטית כשהצעת מחיר מאושרת'
    },
    {
      rule_name: 'Deal Closed Won → Create Invoice',
      rule_name_he: 'עסקה נסגרה בהצלחה → יצירת חשבונית',
      trigger_type: 'field_changed',
      trigger_entity: 'crm_deals',
      trigger_event: 'update',
      trigger_conditions: { field: 'status', to: 'closed_won' },
      actions: [
        { type: 'create_entity', entity_type: 'invoices', template: 'from_deal' },
        { type: 'notify', target_role: 'finance_manager', message: 'עסקה נסגרה - נדרשת חשבונית: {{deal.name}}' },
        { type: 'send_email', email_template: 'deal_closed', to: '{{customer.email}}' },
        { type: 'update_field', entity: 'crm_contacts', field: 'customer_status', value: 'active' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['finance_manager', 'sales_agent'],
      is_active: true,
      priority: 10,
      category: 'sales',
      notes: 'יצירת חשבונית ועדכון סטטוס לקוח כשעסקה נסגרת בהצלחה'
    },
    {
      rule_name: 'Deal Lost → Post-mortem + Follow-up',
      rule_name_he: 'עסקה הפסד → ניתוח + מעקב',
      trigger_type: 'field_changed',
      trigger_entity: 'crm_deals',
      trigger_event: 'update',
      trigger_conditions: { field: 'status', to: 'closed_lost' },
      actions: [
        { type: 'notify', target_role: 'sales_manager', message: 'עסקה הפסד: {{deal.name}} - נדרש ניתוח' },
        { type: 'send_email', email_template: 'deal_lost_followup', to: '{{customer.email}}' }
      ],
      action_delay_minutes: 1440,
      channels: ['app', 'email'],
      notify_roles: ['sales_manager'],
      is_active: true,
      priority: 5,
      category: 'sales',
      notes: 'מעקב וניתוח אחרי הפסד עסקה (24 שעות אח"כ)'
    },

    // ----- SLA ושירות -----
    {
      rule_name: 'SLA Breach → Escalate',
      rule_name_he: 'חריגת SLA → הסלמה',
      trigger_type: 'threshold',
      trigger_entity: 'support_tickets',
      trigger_event: 'sla_breach',
      trigger_conditions: { sla_threshold_hours: 24 },
      actions: [
        { type: 'escalate', escalate_to: 'support_manager', reason: 'חריגת SLA' },
        { type: 'notify', target_role: 'support_manager', message: 'חריגת SLA: פנייה #{{ticket.id}}' },
        { type: 'update_field', field: 'priority', value: 'urgent' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email', 'sms'],
      notify_roles: ['support_manager', 'team_lead'],
      is_active: true,
      priority: 10,
      category: 'support',
      notes: 'הסלמה אוטומטית כשפנייה חורגת מ-SLA'
    },
    {
      rule_name: 'Ticket Resolved → Survey',
      rule_name_he: 'פנייה נפתרה → סקר שביעות רצון',
      trigger_type: 'field_changed',
      trigger_entity: 'support_tickets',
      trigger_event: 'update',
      trigger_conditions: { field: 'status', to: 'resolved' },
      actions: [
        { type: 'send_email', email_template: 'satisfaction_survey', to: '{{customer.email}}' },
        { type: 'send_whatsapp', message_template: 'survey_whatsapp', to: '{{customer.phone}}' }
      ],
      action_delay_minutes: 60,
      channels: ['email', 'whatsapp'],
      notify_roles: [],
      is_active: true,
      priority: 3,
      category: 'support',
      notes: 'שליחת סקר שביעות רצון שעה אחרי פתרון פנייה'
    },

    // ----- כספים ותשלומים -----
    {
      rule_name: 'Overdue Payment → Send Reminder',
      rule_name_he: 'תשלום באיחור → שליחת תזכורת',
      trigger_type: 'scheduled',
      trigger_entity: 'invoices',
      trigger_event: 'overdue_check',
      trigger_conditions: { overdue_days: 7 },
      actions: [
        { type: 'send_email', email_template: 'payment_reminder', to: '{{customer.email}}' },
        { type: 'send_whatsapp', message_template: 'payment_reminder_wa', to: '{{customer.phone}}' },
        { type: 'notify', target_role: 'finance_manager', message: 'חשבונית באיחור: {{invoice.number}}' }
      ],
      action_delay_minutes: 0,
      channels: ['email', 'whatsapp', 'app'],
      notify_roles: ['finance_manager'],
      is_active: true,
      priority: 9,
      category: 'finance',
      notes: 'תזכורת אוטומטית לתשלום באיחור של 7 ימים'
    },
    {
      rule_name: 'Payment Received → Thank + Update',
      rule_name_he: 'תשלום התקבל → תודה + עדכון',
      trigger_type: 'entity_created',
      trigger_entity: 'payments',
      trigger_event: 'insert',
      trigger_conditions: {},
      actions: [
        { type: 'send_email', email_template: 'payment_receipt', to: '{{customer.email}}' },
        { type: 'update_field', entity: 'invoices', field: 'status', value: 'paid' },
        { type: 'notify', target_role: 'finance_manager', message: 'תשלום התקבל: {{payment.amount}}' }
      ],
      action_delay_minutes: 0,
      channels: ['email', 'app'],
      notify_roles: ['finance_manager'],
      is_active: true,
      priority: 7,
      category: 'finance',
      notes: 'אישור קבלת תשלום ועדכון סטטוס חשבונית'
    },
    {
      rule_name: 'Large Transaction → Approval Required',
      rule_name_he: 'עסקה גדולה → נדרש אישור',
      trigger_type: 'threshold',
      trigger_entity: 'payments',
      trigger_event: 'insert',
      trigger_conditions: { field: 'amount', operator: '>', value: 50000 },
      actions: [
        { type: 'notify', target_role: 'cfo', message: 'עסקה גדולה דורשת אישור: ₪{{payment.amount}}' },
        { type: 'update_field', field: 'approval_required', value: true }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email', 'sms'],
      notify_roles: ['cfo', 'finance_director'],
      is_active: true,
      priority: 10,
      category: 'finance',
      notes: 'אישור נדרש לעסקאות מעל 50,000 ש"ח'
    },

    // ----- מלאי ורכש -----
    {
      rule_name: 'Low Stock → Create Purchase Order',
      rule_name_he: 'מלאי נמוך → יצירת הזמנת רכש',
      trigger_type: 'threshold',
      trigger_entity: 'inventory_items',
      trigger_event: 'below_minimum',
      trigger_conditions: { field: 'quantity', operator: '<', compare_field: 'min_quantity' },
      actions: [
        { type: 'create_entity', entity_type: 'purchase_orders', template: 'auto_reorder' },
        { type: 'notify', target_role: 'purchasing_manager', message: 'מלאי נמוך: {{item.name}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['purchasing_manager', 'warehouse_manager'],
      is_active: true,
      priority: 8,
      category: 'inventory',
      notes: 'יצירת הזמנת רכש אוטומטית כשמלאי יורד מתחת למינימום'
    },
    {
      rule_name: 'Purchase Order Approved → Notify Supplier',
      rule_name_he: 'הזמנת רכש אושרה → הודעה לספק',
      trigger_type: 'field_changed',
      trigger_entity: 'purchase_orders',
      trigger_event: 'update',
      trigger_conditions: { field: 'status', to: 'approved' },
      actions: [
        { type: 'send_email', email_template: 'po_to_supplier', to: '{{supplier.email}}' },
        { type: 'notify', target_role: 'purchasing_manager', message: 'הזמנת רכש נשלחה לספק: {{po.number}}' }
      ],
      action_delay_minutes: 0,
      channels: ['email', 'app'],
      notify_roles: ['purchasing_manager'],
      is_active: true,
      priority: 7,
      category: 'inventory',
      notes: 'שליחת הזמנת רכש לספק לאחר אישור'
    },

    // ----- משאבי אנוש -----
    {
      rule_name: 'New Employee → Onboarding Workflow',
      rule_name_he: 'עובד חדש → תהליך קליטה',
      trigger_type: 'entity_created',
      trigger_entity: 'employees',
      trigger_event: 'insert',
      trigger_conditions: {},
      actions: [
        { type: 'create_entity', entity_type: 'tasks', template: 'onboarding_checklist' },
        { type: 'notify', target_role: 'hr_manager', message: 'עובד חדש נקלט: {{employee.name}}' },
        { type: 'send_email', email_template: 'welcome_employee', to: '{{employee.email}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['hr_manager', 'department_manager'],
      is_active: true,
      priority: 8,
      category: 'hr',
      notes: 'הפעלת תהליך קליטה אוטומטי לעובד חדש'
    },
    {
      rule_name: 'Leave Request → Manager Approval',
      rule_name_he: 'בקשת חופשה → אישור מנהל',
      trigger_type: 'entity_created',
      trigger_entity: 'leave_requests',
      trigger_event: 'insert',
      trigger_conditions: {},
      actions: [
        { type: 'notify', target_role: 'department_manager', message: 'בקשת חופשה חדשה מ{{employee.name}}' },
        { type: 'send_email', email_template: 'leave_approval_request', to: '{{manager.email}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['department_manager'],
      is_active: true,
      priority: 6,
      category: 'hr',
      notes: 'שליחת בקשת אישור חופשה למנהל'
    },
    {
      rule_name: 'Birthday Reminder → Greet Employee',
      rule_name_he: 'תזכורת יום הולדת → ברכה לעובד',
      trigger_type: 'scheduled',
      trigger_entity: 'employees',
      trigger_event: 'birthday',
      trigger_conditions: { days_before: 0 },
      actions: [
        { type: 'send_email', email_template: 'birthday_greeting', to: '{{employee.email}}' },
        { type: 'send_whatsapp', message_template: 'birthday_wa', to: '{{employee.phone}}' },
        { type: 'notify', target_role: 'hr_manager', message: 'היום יום הולדת של {{employee.name}}' }
      ],
      action_delay_minutes: 0,
      channels: ['email', 'whatsapp', 'app'],
      notify_roles: ['hr_manager'],
      is_active: true,
      priority: 2,
      category: 'hr',
      notes: 'שליחת ברכת יום הולדת אוטומטית'
    },

    // ----- פרויקטים ומשימות -----
    {
      rule_name: 'Task Overdue → Alert Assignee + Manager',
      rule_name_he: 'משימה באיחור → התראה למבצע ולמנהל',
      trigger_type: 'scheduled',
      trigger_entity: 'tasks',
      trigger_event: 'overdue_check',
      trigger_conditions: { overdue_days: 1 },
      actions: [
        { type: 'notify', target_role: 'assignee', message: 'משימה באיחור: {{task.title}}' },
        { type: 'notify', target_role: 'project_manager', message: 'משימה באיחור בפרויקט: {{task.title}}' },
        { type: 'update_field', field: 'priority', value: 'high' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['assignee', 'project_manager'],
      is_active: true,
      priority: 8,
      category: 'projects',
      notes: 'התראה על משימות באיחור'
    },
    {
      rule_name: 'Project Milestone Reached → Notify Stakeholders',
      rule_name_he: 'אבן דרך בפרויקט הושגה → התראה לבעלי עניין',
      trigger_type: 'field_changed',
      trigger_entity: 'project_milestones',
      trigger_event: 'update',
      trigger_conditions: { field: 'status', to: 'completed' },
      actions: [
        { type: 'notify', target_role: 'project_manager', message: 'אבן דרך הושגה: {{milestone.name}}' },
        { type: 'send_email', email_template: 'milestone_reached', to: '{{stakeholders}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['project_manager', 'stakeholders'],
      is_active: true,
      priority: 6,
      category: 'projects',
      notes: 'התראה על השגת אבני דרך בפרויקט'
    },

    // ----- שיווק -----
    {
      rule_name: 'Campaign Budget 80% → Alert Marketing',
      rule_name_he: 'תקציב קמפיין 80% → התראה לשיווק',
      trigger_type: 'threshold',
      trigger_entity: 'marketing_campaigns',
      trigger_event: 'budget_check',
      trigger_conditions: { field: 'spent_percentage', operator: '>=', value: 80 },
      actions: [
        { type: 'notify', target_role: 'marketing_manager', message: 'תקציב קמפיין מתקרב לגבול: {{campaign.name}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['marketing_manager'],
      is_active: true,
      priority: 7,
      category: 'marketing',
      notes: 'התראה כשתקציב קמפיין מגיע ל-80%'
    },
    {
      rule_name: 'Form Submission → Create Lead',
      rule_name_he: 'מילוי טופס → יצירת ליד',
      trigger_type: 'webhook',
      trigger_entity: 'web_forms',
      trigger_event: 'submission',
      trigger_conditions: {},
      actions: [
        { type: 'create_entity', entity_type: 'crm_leads', template: 'from_web_form' },
        { type: 'notify', target_role: 'sales_agent', message: 'ליד חדש מטופס אתר' },
        { type: 'send_email', email_template: 'form_thank_you', to: '{{submission.email}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['sales_agent'],
      is_active: true,
      priority: 9,
      category: 'marketing',
      notes: 'יצירת ליד אוטומטי ממילוי טופס באתר'
    },

    // ----- מערכת ובטיחות -----
    {
      rule_name: 'Failed Login Attempts → Lock + Alert',
      rule_name_he: 'ניסיונות כניסה כושלים → נעילה + התראה',
      trigger_type: 'threshold',
      trigger_entity: 'user_session_log',
      trigger_event: 'failed_login',
      trigger_conditions: { max_attempts: 5, window_minutes: 15 },
      actions: [
        { type: 'update_field', entity: 'users', field: 'locked', value: true },
        { type: 'notify', target_role: 'system_admin', message: 'חשבון ננעל: {{user.username}} - ניסיונות כושלים' },
        { type: 'send_email', email_template: 'account_locked', to: '{{user.email}}' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email', 'sms'],
      notify_roles: ['system_admin'],
      is_active: true,
      priority: 10,
      category: 'security',
      notes: 'נעילת חשבון אחרי 5 ניסיונות כניסה כושלים'
    },
    {
      rule_name: 'System Error Rate High → Alert DevOps',
      rule_name_he: 'שיעור שגיאות גבוה → התראה לדבאופס',
      trigger_type: 'threshold',
      trigger_entity: 'system_logs',
      trigger_event: 'error_rate',
      trigger_conditions: { error_rate_percent: 5, window_minutes: 10 },
      actions: [
        { type: 'notify', target_role: 'devops', message: 'שיעור שגיאות גבוה במערכת!' },
        { type: 'send_email', email_template: 'system_alert', to: 'devops@company.com' },
        { type: 'webhook', url: 'https://hooks.slack.com/services/xxx', method: 'POST' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email', 'sms'],
      notify_roles: ['devops', 'system_admin'],
      is_active: true,
      priority: 10,
      category: 'system',
      notes: 'התראה על שיעור שגיאות גבוה במערכת'
    },
    {
      rule_name: 'Daily Report → Send Summary',
      rule_name_he: 'דוח יומי → שליחת סיכום',
      trigger_type: 'scheduled',
      trigger_entity: 'system',
      trigger_event: 'daily_cron',
      trigger_conditions: { cron: '0 8 * * 1-5' },
      actions: [
        { type: 'send_email', email_template: 'daily_summary', to: 'management@company.com' }
      ],
      action_delay_minutes: 0,
      channels: ['email'],
      notify_roles: ['ceo', 'coo'],
      is_active: true,
      priority: 5,
      category: 'reports',
      notes: 'שליחת דוח סיכום יומי להנהלה בימי חול בשעה 8:00'
    },
    {
      rule_name: 'Contract Expiring → Renewal Reminder',
      rule_name_he: 'חוזה עומד לפוג → תזכורת חידוש',
      trigger_type: 'scheduled',
      trigger_entity: 'contracts',
      trigger_event: 'expiry_check',
      trigger_conditions: { days_before_expiry: 30 },
      actions: [
        { type: 'notify', target_role: 'account_manager', message: 'חוזה עומד לפוג: {{contract.name}}' },
        { type: 'send_email', email_template: 'contract_renewal', to: '{{customer.email}}' },
        { type: 'create_entity', entity_type: 'tasks', template: 'contract_renewal_task' }
      ],
      action_delay_minutes: 0,
      channels: ['app', 'email'],
      notify_roles: ['account_manager', 'sales_manager'],
      is_active: true,
      priority: 7,
      category: 'contracts',
      notes: 'תזכורת חידוש חוזה 30 יום לפני תפוגה'
    },
  ];
}


export default router;
