import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ======================== עזרים ========================
const q = async (query: any) => { try { const r = await db.execute(query); return r.rows; } catch(e) { console.error("[CommMarketing]", e); return []; } };

function clean(d: any) {
  const o = { ...d };
  for (const k in o) { if (o[k] === "" || o[k] === undefined) o[k] = null; }
  delete o.id; delete o.created_at; delete o.updated_at;
  return o;
}

// ======================== אתחול טבלאות ========================
router.post("/communication-marketing/init", async (_req: Request, res: Response) => {
  try {
    // טבלת תבניות וואטסאפ
    await db.execute(sql`CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id SERIAL PRIMARY KEY,
      template_name VARCHAR(300),
      template_name_he VARCHAR(300),
      category VARCHAR(100),
      language VARCHAR(10) DEFAULT 'he',
      content TEXT,
      variables JSONB DEFAULT '[]',
      media_type VARCHAR(50),
      media_url TEXT,
      buttons JSONB DEFAULT '[]',
      is_approved BOOLEAN DEFAULT false,
      whatsapp_template_id VARCHAR(200),
      usage_count INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // טבלת תבניות אימייל
    await db.execute(sql`CREATE TABLE IF NOT EXISTS email_templates (
      id SERIAL PRIMARY KEY,
      template_name VARCHAR(300),
      template_name_he VARCHAR(300),
      category VARCHAR(100),
      subject VARCHAR(500),
      subject_he VARCHAR(500),
      body_html TEXT,
      body_text TEXT,
      variables JSONB DEFAULT '[]',
      design_theme VARCHAR(50),
      attachments JSONB DEFAULT '[]',
      usage_count INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // טבלת תבניות SMS
    await db.execute(sql`CREATE TABLE IF NOT EXISTS sms_templates (
      id SERIAL PRIMARY KEY,
      template_name VARCHAR(300),
      content VARCHAR(500),
      variables JSONB DEFAULT '[]',
      usage_count INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // טבלת לוג תקשורת
    await db.execute(sql`CREATE TABLE IF NOT EXISTS communication_log (
      id SERIAL PRIMARY KEY,
      channel VARCHAR(50),
      direction VARCHAR(20) DEFAULT 'outgoing',
      contact_name VARCHAR(300),
      contact_phone VARCHAR(50),
      contact_email VARCHAR(200),
      lead_id INTEGER,
      customer_id INTEGER,
      agent_id INTEGER,
      template_id INTEGER,
      subject VARCHAR(500),
      message TEXT,
      media_url TEXT,
      status VARCHAR(50) DEFAULT 'sent',
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      replied_at TIMESTAMPTZ,
      error TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // טבלת קמפיינים שיווקיים
    await db.execute(sql`CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id SERIAL PRIMARY KEY,
      campaign_name VARCHAR(300),
      campaign_name_he VARCHAR(300),
      campaign_type VARCHAR(50),
      channel VARCHAR(50),
      target_audience JSONB DEFAULT '{}',
      segment_criteria JSONB DEFAULT '{}',
      template_id INTEGER,
      scheduled_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      delivered_count INTEGER DEFAULT 0,
      opened_count INTEGER DEFAULT 0,
      clicked_count INTEGER DEFAULT 0,
      replied_count INTEGER DEFAULT 0,
      converted_count INTEGER DEFAULT 0,
      unsubscribed_count INTEGER DEFAULT 0,
      budget NUMERIC(15,2) DEFAULT 0,
      spent NUMERIC(15,2) DEFAULT 0,
      revenue_generated NUMERIC(15,2) DEFAULT 0,
      roi_percent NUMERIC(10,2),
      cost_per_lead NUMERIC(15,2),
      notes TEXT,
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // טבלת הגדרות מקורות לידים
    await db.execute(sql`CREATE TABLE IF NOT EXISTS lead_sources_config (
      id SERIAL PRIMARY KEY,
      source_name VARCHAR(200),
      source_name_he VARCHAR(200),
      source_type VARCHAR(50),
      channel VARCHAR(50),
      webhook_url TEXT,
      api_config JSONB DEFAULT '{}',
      auto_assign BOOLEAN DEFAULT true,
      assign_to_agent_id INTEGER,
      assign_method VARCHAR(50) DEFAULT 'round_robin',
      notification_channels JSONB DEFAULT '["app","whatsapp"]',
      total_leads INTEGER DEFAULT 0,
      conversion_rate NUMERIC(5,2) DEFAULT 0,
      cost_per_lead NUMERIC(15,2),
      is_active BOOLEAN DEFAULT true,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // ======================== זריעת תבניות וואטסאפ ========================
    const waCount = await q(sql`SELECT COUNT(*) as c FROM whatsapp_templates`);
    if (Number((waCount as any[])[0]?.c) === 0) {
      await db.execute(sql`INSERT INTO whatsapp_templates (template_name, template_name_he, category, content, variables) VALUES
        ('welcome_lead', 'ברוכים הבאים - ליד חדש', 'greeting', 'שלום {{1}}, תודה שפניתם אלינו! אני {{2}} ואשמח לסייע לכם. מתי נוח לקבוע שיחה?', '["contact_name","agent_name"]'),
        ('appointment_confirmation', 'אישור פגישה', 'scheduling', 'שלום {{1}}, הפגישה שלכם אושרה לתאריך {{2}} בשעה {{3}} בכתובת {{4}}. נתראה!', '["contact_name","date","time","address"]'),
        ('quote_sent', 'הצעת מחיר נשלחה', 'sales', 'שלום {{1}}, הצעת מחיר מספר {{2}} בסך {{3}} ש"ח נשלחה אליכם לאימייל. נשמח לענות על כל שאלה.', '["contact_name","quote_number","amount"]'),
        ('payment_reminder', 'תזכורת תשלום', 'billing', 'שלום {{1}}, תזכורת ידידותית - יש לכם חשבונית פתוחה מספר {{2}} בסך {{3}} ש"ח. אנא הסדירו את התשלום. תודה!', '["contact_name","invoice_number","amount"]'),
        ('installation_scheduled', 'התקנה תוזמנה', 'operations', 'שלום {{1}}, ההתקנה שלכם תוזמנה לתאריך {{2}}. צוות ההתקנה בראשות {{3}} יגיע בשעה {{4}}.', '["contact_name","date","team_leader","time"]'),
        ('satisfaction_survey', 'סקר שביעות רצון', 'feedback', 'שלום {{1}}, סיימנו את הפרויקט שלכם ונשמח לשמוע חוות דעת! דרגו אותנו מ-1 עד 5 והשאירו הערה.', '["contact_name"]'),
        ('follow_up', 'מעקב', 'sales', 'שלום {{1}}, חולפים כמה ימים מאז ששוחחנו. האם יש שאלות לגבי ההצעה? אשמח לעזור. {{2}}', '["contact_name","agent_name"]')
      `);
    }

    // ======================== זריעת תבניות אימייל ========================
    const emCount = await q(sql`SELECT COUNT(*) as c FROM email_templates`);
    if (Number((emCount as any[])[0]?.c) === 0) {
      await db.execute(sql`INSERT INTO email_templates (template_name, template_name_he, category, subject, subject_he, body_html, body_text, variables) VALUES
        ('welcome', 'ברוכים הבאים', 'onboarding', 'Welcome to our company', 'ברוכים הבאים לחברתנו', '<h1>שלום {{contact_name}}</h1><p>תודה שבחרתם בנו! אנחנו שמחים להיות השותפים שלכם.</p><p>צוות {{company_name}}</p>', 'שלום {{contact_name}}, תודה שבחרתם בנו! אנחנו שמחים להיות השותפים שלכם. צוות {{company_name}}', '["contact_name","company_name"]'),
        ('quote_pdf', 'הצעת מחיר', 'sales', 'Quote #{{quote_number}}', 'הצעת מחיר מספר {{quote_number}}', '<h2>הצעת מחיר</h2><p>שלום {{contact_name}},</p><p>מצורפת הצעת מחיר מספר {{quote_number}} בסך {{amount}} ש"ח.</p><p>ההצעה בתוקף עד {{valid_until}}.</p>', 'שלום {{contact_name}}, מצורפת הצעת מחיר מספר {{quote_number}} בסך {{amount}} ש"ח. ההצעה בתוקף עד {{valid_until}}.', '["contact_name","quote_number","amount","valid_until"]'),
        ('contract', 'חוזה', 'legal', 'Contract for {{project_name}}', 'חוזה עבור {{project_name}}', '<h2>חוזה התקשרות</h2><p>שלום {{contact_name}},</p><p>מצורף חוזה עבור פרויקט {{project_name}}. אנא עיינו וחתמו.</p>', 'שלום {{contact_name}}, מצורף חוזה עבור פרויקט {{project_name}}. אנא עיינו וחתמו.', '["contact_name","project_name"]'),
        ('invoice', 'חשבונית', 'billing', 'Invoice #{{invoice_number}}', 'חשבונית מספר {{invoice_number}}', '<h2>חשבונית</h2><p>שלום {{contact_name}},</p><p>מצורפת חשבונית מספר {{invoice_number}} בסך {{amount}} ש"ח. מועד תשלום: {{due_date}}.</p>', 'שלום {{contact_name}}, מצורפת חשבונית מספר {{invoice_number}} בסך {{amount}} ש"ח. מועד תשלום: {{due_date}}.', '["contact_name","invoice_number","amount","due_date"]'),
        ('thank_you', 'תודה', 'retention', 'Thank you!', 'תודה רבה!', '<h2>תודה רבה {{contact_name}}!</h2><p>נהנינו לעבוד איתכם על {{project_name}}. מקווים לשיתוף פעולה נוסף בעתיד!</p>', 'תודה רבה {{contact_name}}! נהנינו לעבוד איתכם על {{project_name}}. מקווים לשיתוף פעולה נוסף בעתיד!', '["contact_name","project_name"]')
      `);
    }

    // ======================== זריעת תבניות SMS ========================
    const smsCount = await q(sql`SELECT COUNT(*) as c FROM sms_templates`);
    if (Number((smsCount as any[])[0]?.c) === 0) {
      await db.execute(sql`INSERT INTO sms_templates (template_name, content, variables) VALUES
        ('appointment_reminder', 'תזכורת: פגישה מחר {{date}} בשעה {{time}}. {{company_name}}', '["date","time","company_name"]'),
        ('payment_due', 'תזכורת תשלום: חשבונית {{invoice_number}} בסך {{amount}} ש"ח. לתשלום: {{payment_link}}', '["invoice_number","amount","payment_link"]'),
        ('delivery_notice', 'הודעה: המשלוח שלכם בדרך! צפי הגעה: {{date}} {{time}}. מספר מעקב: {{tracking}}', '["date","time","tracking"]')
      `);
    }

    // ======================== זריעת מקורות לידים ========================
    const srcCount = await q(sql`SELECT COUNT(*) as c FROM lead_sources_config`);
    if (Number((srcCount as any[])[0]?.c) === 0) {
      await db.execute(sql`INSERT INTO lead_sources_config (source_name, source_name_he, source_type, channel, assign_method) VALUES
        ('wix_website', 'אתר Wix', 'website', 'web', 'round_robin'),
        ('whatsapp_direct', 'וואטסאפ ישיר', 'messaging', 'whatsapp', 'round_robin'),
        ('facebook_ads', 'פרסום פייסבוק', 'paid_ads', 'facebook', 'round_robin'),
        ('google_ads', 'פרסום גוגל', 'paid_ads', 'google', 'round_robin'),
        ('instagram', 'אינסטגרם', 'social', 'instagram', 'round_robin'),
        ('phone_call', 'שיחת טלפון', 'direct', 'phone', 'round_robin'),
        ('referral', 'הפניה', 'referral', 'word_of_mouth', 'round_robin'),
        ('walk_in', 'נכנס לחנות', 'direct', 'physical', 'round_robin'),
        ('architect_referral', 'הפניה מאדריכל', 'referral', 'professional', 'round_robin'),
        ('contractor_referral', 'הפניה מקבלן', 'referral', 'professional', 'round_robin')
      `);
    }

    res.json({ success: true, message: "כל הטבלאות נוצרו ונזרעו בהצלחה" });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ======================== CRUD - תבניות וואטסאפ ========================
// קבלת כל תבניות הוואטסאפ
router.get("/communication-marketing/whatsapp-templates", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM whatsapp_templates ORDER BY created_at DESC`);
  res.json(rows);
});

// קבלת תבנית וואטסאפ לפי מזהה
router.get("/communication-marketing/whatsapp-templates/:id", async (req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM whatsapp_templates WHERE id = ${Number(req.params.id)}`);
  res.json(rows[0] || null);
});

// יצירת תבנית וואטסאפ חדשה
router.post("/communication-marketing/whatsapp-templates", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    await db.execute(sql`INSERT INTO whatsapp_templates (template_name, template_name_he, category, language, content, variables, media_type, media_url, buttons, is_approved, whatsapp_template_id, status)
      VALUES (${d.template_name}, ${d.template_name_he}, ${d.category}, ${d.language || 'he'}, ${d.content}, ${JSON.stringify(d.variables || [])}, ${d.media_type}, ${d.media_url}, ${JSON.stringify(d.buttons || [])}, ${d.is_approved || false}, ${d.whatsapp_template_id}, ${d.status || 'active'})`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// עדכון תבנית וואטסאפ
router.put("/communication-marketing/whatsapp-templates/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE whatsapp_templates SET template_name=${d.template_name}, template_name_he=${d.template_name_he}, category=${d.category}, language=${d.language}, content=${d.content}, variables=${JSON.stringify(d.variables || [])}, media_type=${d.media_type}, media_url=${d.media_url}, buttons=${JSON.stringify(d.buttons || [])}, is_approved=${d.is_approved}, whatsapp_template_id=${d.whatsapp_template_id}, status=${d.status}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// מחיקת תבנית וואטסאפ
router.delete("/communication-marketing/whatsapp-templates/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM whatsapp_templates WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CRUD - תבניות אימייל ========================
// קבלת כל תבניות האימייל
router.get("/communication-marketing/email-templates", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM email_templates ORDER BY created_at DESC`);
  res.json(rows);
});

// קבלת תבנית אימייל לפי מזהה
router.get("/communication-marketing/email-templates/:id", async (req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM email_templates WHERE id = ${Number(req.params.id)}`);
  res.json(rows[0] || null);
});

// יצירת תבנית אימייל חדשה
router.post("/communication-marketing/email-templates", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    await db.execute(sql`INSERT INTO email_templates (template_name, template_name_he, category, subject, subject_he, body_html, body_text, variables, design_theme, attachments, status)
      VALUES (${d.template_name}, ${d.template_name_he}, ${d.category}, ${d.subject}, ${d.subject_he}, ${d.body_html}, ${d.body_text}, ${JSON.stringify(d.variables || [])}, ${d.design_theme}, ${JSON.stringify(d.attachments || [])}, ${d.status || 'active'})`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// עדכון תבנית אימייל
router.put("/communication-marketing/email-templates/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE email_templates SET template_name=${d.template_name}, template_name_he=${d.template_name_he}, category=${d.category}, subject=${d.subject}, subject_he=${d.subject_he}, body_html=${d.body_html}, body_text=${d.body_text}, variables=${JSON.stringify(d.variables || [])}, design_theme=${d.design_theme}, attachments=${JSON.stringify(d.attachments || [])}, status=${d.status}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// מחיקת תבנית אימייל
router.delete("/communication-marketing/email-templates/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM email_templates WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CRUD - תבניות SMS ========================
// קבלת כל תבניות ה-SMS
router.get("/communication-marketing/sms-templates", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sms_templates ORDER BY created_at DESC`);
  res.json(rows);
});

// קבלת תבנית SMS לפי מזהה
router.get("/communication-marketing/sms-templates/:id", async (req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM sms_templates WHERE id = ${Number(req.params.id)}`);
  res.json(rows[0] || null);
});

// יצירת תבנית SMS חדשה
router.post("/communication-marketing/sms-templates", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    await db.execute(sql`INSERT INTO sms_templates (template_name, content, variables, status)
      VALUES (${d.template_name}, ${d.content}, ${JSON.stringify(d.variables || [])}, ${d.status || 'active'})`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// עדכון תבנית SMS
router.put("/communication-marketing/sms-templates/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE sms_templates SET template_name=${d.template_name}, content=${d.content}, variables=${JSON.stringify(d.variables || [])}, status=${d.status} WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// מחיקת תבנית SMS
router.delete("/communication-marketing/sms-templates/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM sms_templates WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CRUD - לוג תקשורת ========================
// קבלת כל הלוגים
router.get("/communication-marketing/communication-log", async (req: Request, res: Response) => {
  const { channel, direction, status, limit } = req.query;
  let query = `SELECT * FROM communication_log WHERE 1=1`;
  if (channel) query += ` AND channel = '${channel}'`;
  if (direction) query += ` AND direction = '${direction}'`;
  if (status) query += ` AND status = '${status}'`;
  query += ` ORDER BY created_at DESC LIMIT ${Number(limit) || 200}`;
  const rows = await q(sql.raw(query));
  res.json(rows);
});

// קבלת רשומת לוג לפי מזהה
router.get("/communication-marketing/communication-log/:id", async (req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM communication_log WHERE id = ${Number(req.params.id)}`);
  res.json(rows[0] || null);
});

// יצירת רשומת לוג חדשה
router.post("/communication-marketing/communication-log", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    await db.execute(sql`INSERT INTO communication_log (channel, direction, contact_name, contact_phone, contact_email, lead_id, customer_id, agent_id, template_id, subject, message, media_url, status, delivered_at, read_at, replied_at, error, metadata)
      VALUES (${d.channel}, ${d.direction || 'outgoing'}, ${d.contact_name}, ${d.contact_phone}, ${d.contact_email}, ${d.lead_id}, ${d.customer_id}, ${d.agent_id}, ${d.template_id}, ${d.subject}, ${d.message}, ${d.media_url}, ${d.status || 'sent'}, ${d.delivered_at}, ${d.read_at}, ${d.replied_at}, ${d.error}, ${JSON.stringify(d.metadata || {})})`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// עדכון רשומת לוג
router.put("/communication-marketing/communication-log/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE communication_log SET channel=${d.channel}, direction=${d.direction}, contact_name=${d.contact_name}, contact_phone=${d.contact_phone}, contact_email=${d.contact_email}, lead_id=${d.lead_id}, customer_id=${d.customer_id}, agent_id=${d.agent_id}, template_id=${d.template_id}, subject=${d.subject}, message=${d.message}, media_url=${d.media_url}, status=${d.status}, delivered_at=${d.delivered_at}, read_at=${d.read_at}, replied_at=${d.replied_at}, error=${d.error}, metadata=${JSON.stringify(d.metadata || {})} WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// מחיקת רשומת לוג
router.delete("/communication-marketing/communication-log/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM communication_log WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CRUD - קמפיינים שיווקיים ========================
// קבלת כל הקמפיינים
router.get("/communication-marketing/campaigns", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM marketing_campaigns ORDER BY created_at DESC`);
  res.json(rows);
});

// קבלת קמפיין לפי מזהה
router.get("/communication-marketing/campaigns/:id", async (req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM marketing_campaigns WHERE id = ${Number(req.params.id)}`);
  res.json(rows[0] || null);
});

// יצירת קמפיין חדש
router.post("/communication-marketing/campaigns", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    await db.execute(sql`INSERT INTO marketing_campaigns (campaign_name, campaign_name_he, campaign_type, channel, target_audience, segment_criteria, template_id, scheduled_at, budget, notes, status)
      VALUES (${d.campaign_name}, ${d.campaign_name_he}, ${d.campaign_type}, ${d.channel}, ${JSON.stringify(d.target_audience || {})}, ${JSON.stringify(d.segment_criteria || {})}, ${d.template_id}, ${d.scheduled_at}, ${d.budget || 0}, ${d.notes}, ${d.status || 'draft'})`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// עדכון קמפיין
router.put("/communication-marketing/campaigns/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE marketing_campaigns SET campaign_name=${d.campaign_name}, campaign_name_he=${d.campaign_name_he}, campaign_type=${d.campaign_type}, channel=${d.channel}, target_audience=${JSON.stringify(d.target_audience || {})}, segment_criteria=${JSON.stringify(d.segment_criteria || {})}, template_id=${d.template_id}, scheduled_at=${d.scheduled_at}, started_at=${d.started_at}, completed_at=${d.completed_at}, total_recipients=${d.total_recipients}, sent_count=${d.sent_count}, delivered_count=${d.delivered_count}, opened_count=${d.opened_count}, clicked_count=${d.clicked_count}, replied_count=${d.replied_count}, converted_count=${d.converted_count}, unsubscribed_count=${d.unsubscribed_count}, budget=${d.budget}, spent=${d.spent}, revenue_generated=${d.revenue_generated}, roi_percent=${d.roi_percent}, cost_per_lead=${d.cost_per_lead}, notes=${d.notes}, status=${d.status}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// מחיקת קמפיין
router.delete("/communication-marketing/campaigns/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM marketing_campaigns WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== CRUD - הגדרות מקורות לידים ========================
// קבלת כל מקורות הלידים
router.get("/communication-marketing/lead-sources", async (_req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM lead_sources_config ORDER BY total_leads DESC`);
  res.json(rows);
});

// קבלת מקור ליד לפי מזהה
router.get("/communication-marketing/lead-sources/:id", async (req: Request, res: Response) => {
  const rows = await q(sql`SELECT * FROM lead_sources_config WHERE id = ${Number(req.params.id)}`);
  res.json(rows[0] || null);
});

// יצירת מקור ליד חדש
router.post("/communication-marketing/lead-sources", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    await db.execute(sql`INSERT INTO lead_sources_config (source_name, source_name_he, source_type, channel, webhook_url, api_config, auto_assign, assign_to_agent_id, assign_method, notification_channels, cost_per_lead, is_active, status)
      VALUES (${d.source_name}, ${d.source_name_he}, ${d.source_type}, ${d.channel}, ${d.webhook_url}, ${JSON.stringify(d.api_config || {})}, ${d.auto_assign ?? true}, ${d.assign_to_agent_id}, ${d.assign_method || 'round_robin'}, ${JSON.stringify(d.notification_channels || ['app','whatsapp'])}, ${d.cost_per_lead}, ${d.is_active ?? true}, ${d.status || 'active'})`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// עדכון מקור ליד
router.put("/communication-marketing/lead-sources/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const id = Number(req.params.id);
    await db.execute(sql`UPDATE lead_sources_config SET source_name=${d.source_name}, source_name_he=${d.source_name_he}, source_type=${d.source_type}, channel=${d.channel}, webhook_url=${d.webhook_url}, api_config=${JSON.stringify(d.api_config || {})}, auto_assign=${d.auto_assign}, assign_to_agent_id=${d.assign_to_agent_id}, assign_method=${d.assign_method}, notification_channels=${JSON.stringify(d.notification_channels || [])}, total_leads=${d.total_leads}, conversion_rate=${d.conversion_rate}, cost_per_lead=${d.cost_per_lead}, is_active=${d.is_active}, status=${d.status}, updated_at=NOW() WHERE id=${id}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// מחיקת מקור ליד
router.delete("/communication-marketing/lead-sources/:id", async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM lead_sources_config WHERE id=${Number(req.params.id)}`);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== שליחת הודעת וואטסאפ ========================
router.post("/communication-marketing/send-whatsapp", async (req: Request, res: Response) => {
  try {
    const { contact_name, contact_phone, template_id, message, media_url, lead_id, customer_id, agent_id, variables } = req.body;

    // אם יש תבנית - טוענים אותה ומחליפים משתנים
    let finalMessage = message || '';
    if (template_id) {
      const tpl = await q(sql`SELECT * FROM whatsapp_templates WHERE id = ${Number(template_id)}`);
      if (tpl[0]) {
        finalMessage = (tpl[0] as any).content || '';
        // החלפת משתנים בתוכן התבנית
        if (variables && Array.isArray(variables)) {
          variables.forEach((val: string, idx: number) => {
            finalMessage = finalMessage.replace(`{{${idx + 1}}}`, val);
          });
        }
        // עדכון מספר השימושים בתבנית
        await db.execute(sql`UPDATE whatsapp_templates SET usage_count = usage_count + 1 WHERE id = ${Number(template_id)}`);
      }
    }

    // רישום בלוג תקשורת
    await db.execute(sql`INSERT INTO communication_log (channel, direction, contact_name, contact_phone, lead_id, customer_id, agent_id, template_id, message, media_url, status, metadata)
      VALUES ('whatsapp', 'outgoing', ${contact_name}, ${contact_phone}, ${lead_id}, ${customer_id}, ${agent_id}, ${template_id}, ${finalMessage}, ${media_url}, 'sent', ${JSON.stringify({ variables: variables || [], source: 'manual' })})`);

    // כאן יתבצע חיבור ל-WhatsApp Business API בפועל
    // TODO: חיבור ל-WhatsApp Cloud API / Twilio / 360dialog

    res.json({ success: true, message: "הודעת וואטסאפ נשלחה בהצלחה", sent_message: finalMessage });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== שליחת אימייל ========================
router.post("/communication-marketing/send-email", async (req: Request, res: Response) => {
  try {
    const { contact_name, contact_email, template_id, subject, body_html, body_text, attachments, lead_id, customer_id, agent_id, variables } = req.body;

    let finalSubject = subject || '';
    let finalBody = body_html || body_text || '';

    // אם יש תבנית - טוענים אותה ומחליפים משתנים
    if (template_id) {
      const tpl = await q(sql`SELECT * FROM email_templates WHERE id = ${Number(template_id)}`);
      if (tpl[0]) {
        const t = tpl[0] as any;
        finalSubject = t.subject_he || t.subject || subject || '';
        finalBody = t.body_html || t.body_text || '';
        // החלפת משתנים
        if (variables && typeof variables === 'object') {
          for (const [key, val] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            finalSubject = finalSubject.replace(regex, String(val));
            finalBody = finalBody.replace(regex, String(val));
          }
        }
        // עדכון מספר שימושים
        await db.execute(sql`UPDATE email_templates SET usage_count = usage_count + 1 WHERE id = ${Number(template_id)}`);
      }
    }

    // רישום בלוג תקשורת
    await db.execute(sql`INSERT INTO communication_log (channel, direction, contact_name, contact_email, lead_id, customer_id, agent_id, template_id, subject, message, status, metadata)
      VALUES ('email', 'outgoing', ${contact_name}, ${contact_email}, ${lead_id}, ${customer_id}, ${agent_id}, ${template_id}, ${finalSubject}, ${finalBody}, 'sent', ${JSON.stringify({ attachments: attachments || [], variables: variables || {} })})`);

    // כאן יתבצע חיבור לשרת SMTP / SendGrid / Mailgun
    // TODO: חיבור לספק אימייל

    res.json({ success: true, message: "אימייל נשלח בהצלחה", subject: finalSubject });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== שליחת SMS ========================
router.post("/communication-marketing/send-sms", async (req: Request, res: Response) => {
  try {
    const { contact_name, contact_phone, template_id, message, lead_id, customer_id, agent_id, variables } = req.body;

    let finalMessage = message || '';

    // אם יש תבנית - טוענים אותה ומחליפים משתנים
    if (template_id) {
      const tpl = await q(sql`SELECT * FROM sms_templates WHERE id = ${Number(template_id)}`);
      if (tpl[0]) {
        finalMessage = (tpl[0] as any).content || '';
        if (variables && typeof variables === 'object') {
          for (const [key, val] of Object.entries(variables)) {
            finalMessage = finalMessage.replace(`{{${key}}}`, String(val));
          }
        }
        // עדכון מספר שימושים
        await db.execute(sql`UPDATE sms_templates SET usage_count = usage_count + 1 WHERE id = ${Number(template_id)}`);
      }
    }

    // רישום בלוג תקשורת
    await db.execute(sql`INSERT INTO communication_log (channel, direction, contact_name, contact_phone, lead_id, customer_id, agent_id, template_id, message, status, metadata)
      VALUES ('sms', 'outgoing', ${contact_name}, ${contact_phone}, ${lead_id}, ${customer_id}, ${agent_id}, ${template_id}, ${finalMessage}, 'sent', ${JSON.stringify({ variables: variables || {} })})`);

    // כאן יתבצע חיבור לספק SMS - Twilio / InforU / 019
    // TODO: חיבור לספק SMS

    res.json({ success: true, message: "SMS נשלח בהצלחה", sent_message: finalMessage });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== שליחה המונית לסגמנט ========================
router.post("/communication-marketing/send-bulk", async (req: Request, res: Response) => {
  try {
    const { channel, template_id, recipients, campaign_id, variables_map } = req.body;
    // recipients: מערך של { contact_name, contact_phone?, contact_email?, lead_id?, customer_id?, variables }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "נדרש מערך נמענים" });
    }

    let sentCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const recipient of recipients) {
      try {
        const vars = recipient.variables || variables_map || {};

        // רישום בלוג לכל נמען
        await db.execute(sql`INSERT INTO communication_log (channel, direction, contact_name, contact_phone, contact_email, lead_id, customer_id, template_id, message, status, metadata)
          VALUES (${channel}, 'outgoing', ${recipient.contact_name}, ${recipient.contact_phone}, ${recipient.contact_email}, ${recipient.lead_id}, ${recipient.customer_id}, ${template_id}, ${'bulk_send'}, 'queued', ${JSON.stringify({ campaign_id, variables: vars })})`);

        sentCount++;
      } catch (err: any) {
        errorCount++;
        errors.push(`${recipient.contact_name}: ${err.message}`);
      }
    }

    // עדכון קמפיין אם קיים
    if (campaign_id) {
      await db.execute(sql`UPDATE marketing_campaigns SET total_recipients = ${recipients.length}, sent_count = ${sentCount}, status = 'sending', started_at = NOW(), updated_at = NOW() WHERE id = ${Number(campaign_id)}`);
    }

    // עדכון שימושים בתבנית
    if (template_id) {
      if (channel === 'whatsapp') {
        await db.execute(sql`UPDATE whatsapp_templates SET usage_count = usage_count + ${sentCount} WHERE id = ${Number(template_id)}`);
      } else if (channel === 'email') {
        await db.execute(sql`UPDATE email_templates SET usage_count = usage_count + ${sentCount} WHERE id = ${Number(template_id)}`);
      } else if (channel === 'sms') {
        await db.execute(sql`UPDATE sms_templates SET usage_count = usage_count + ${sentCount} WHERE id = ${Number(template_id)}`);
      }
    }

    res.json({
      success: true,
      message: `שליחה המונית הושלמה`,
      total: recipients.length,
      sent: sentCount,
      errors: errorCount,
      error_details: errors
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== היסטוריית תקשורת לאיש קשר ========================
router.get("/communication-marketing/communication-history/:contactId", async (req: Request, res: Response) => {
  try {
    const contactId = req.params.contactId;
    const { type } = req.query; // lead או customer

    let rows;
    if (type === 'lead') {
      // שליפת כל התקשורת עם ליד לפי מזהה ליד
      rows = await q(sql`SELECT * FROM communication_log WHERE lead_id = ${Number(contactId)} ORDER BY created_at DESC`);
    } else if (type === 'customer') {
      // שליפת כל התקשורת עם לקוח לפי מזהה לקוח
      rows = await q(sql`SELECT * FROM communication_log WHERE customer_id = ${Number(contactId)} ORDER BY created_at DESC`);
    } else {
      // חיפוש לפי טלפון או אימייל
      rows = await q(sql`SELECT * FROM communication_log WHERE contact_phone = ${contactId} OR contact_email = ${contactId} OR lead_id = ${Number(contactId) || 0} OR customer_id = ${Number(contactId) || 0} ORDER BY created_at DESC`);
    }

    // סיכום סטטיסטי
    const stats = {
      total: (rows as any[]).length,
      by_channel: {} as Record<string, number>,
      by_status: {} as Record<string, number>,
      last_contact: (rows as any[])[0]?.created_at || null,
      outgoing: (rows as any[]).filter((r: any) => r.direction === 'outgoing').length,
      incoming: (rows as any[]).filter((r: any) => r.direction === 'incoming').length,
    };

    (rows as any[]).forEach((r: any) => {
      stats.by_channel[r.channel] = (stats.by_channel[r.channel] || 0) + 1;
      stats.by_status[r.status] = (stats.by_status[r.status] || 0) + 1;
    });

    res.json({ history: rows, stats });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== השקת קמפיין שיווקי ========================
router.post("/communication-marketing/campaign/launch", async (req: Request, res: Response) => {
  try {
    const { campaign_id } = req.body;

    // שליפת פרטי הקמפיין
    const campaigns = await q(sql`SELECT * FROM marketing_campaigns WHERE id = ${Number(campaign_id)}`);
    if (!campaigns[0]) {
      return res.status(404).json({ error: "קמפיין לא נמצא" });
    }
    const campaign = campaigns[0] as any;

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      return res.status(400).json({ error: `לא ניתן להשיק קמפיין בסטטוס ${campaign.status}` });
    }

    // עדכון סטטוס הקמפיין להשקה
    await db.execute(sql`UPDATE marketing_campaigns SET status = 'launching', started_at = NOW(), updated_at = NOW() WHERE id = ${Number(campaign_id)}`);

    // כאן יתבצע תהליך השליחה בפועל - שליפת נמענים לפי סגמנט, שליחה דרך הערוץ המתאים
    // TODO: מנוע סגמנטציה + תור שליחה

    // לוג אירוע
    await db.execute(sql`INSERT INTO communication_log (channel, direction, subject, message, status, metadata)
      VALUES (${campaign.channel}, 'outgoing', ${campaign.campaign_name}, 'campaign_launch', 'queued', ${JSON.stringify({ campaign_id, campaign_type: campaign.campaign_type })})`);

    res.json({
      success: true,
      message: `קמפיין "${campaign.campaign_name_he || campaign.campaign_name}" הושק בהצלחה`,
      campaign_id,
      channel: campaign.channel,
      status: 'launching'
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== אנליטיקס קמפיין ========================
router.get("/communication-marketing/campaign/analytics/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);

    // נתוני הקמפיין
    const campaigns = await q(sql`SELECT * FROM marketing_campaigns WHERE id = ${id}`);
    if (!campaigns[0]) {
      return res.status(404).json({ error: "קמפיין לא נמצא" });
    }
    const campaign = campaigns[0] as any;

    // חישוב מדדי ביצוע
    const total = campaign.total_recipients || 1;
    const analytics = {
      campaign,
      kpis: {
        // שיעור מסירה
        delivery_rate: campaign.delivered_count ? ((campaign.delivered_count / total) * 100).toFixed(1) : '0',
        // שיעור פתיחה
        open_rate: campaign.opened_count ? ((campaign.opened_count / total) * 100).toFixed(1) : '0',
        // שיעור הקלקה
        click_rate: campaign.clicked_count ? ((campaign.clicked_count / total) * 100).toFixed(1) : '0',
        // שיעור תגובה
        reply_rate: campaign.replied_count ? ((campaign.replied_count / total) * 100).toFixed(1) : '0',
        // שיעור המרה
        conversion_rate: campaign.converted_count ? ((campaign.converted_count / total) * 100).toFixed(1) : '0',
        // שיעור ביטול הרשמה
        unsubscribe_rate: campaign.unsubscribed_count ? ((campaign.unsubscribed_count / total) * 100).toFixed(1) : '0',
        // ROI
        roi: campaign.spent > 0 ? (((campaign.revenue_generated - campaign.spent) / campaign.spent) * 100).toFixed(1) : '0',
        // עלות לליד
        cost_per_lead: campaign.converted_count > 0 ? (campaign.spent / campaign.converted_count).toFixed(2) : '0',
        // הכנסה לנמען
        revenue_per_recipient: total > 0 ? (campaign.revenue_generated / total).toFixed(2) : '0',
      },
      // לוגי שליחה לקמפיין
      communication_logs: await q(sql`SELECT channel, status, COUNT(*) as count FROM communication_log WHERE metadata->>'campaign_id' = ${String(id)} GROUP BY channel, status`),
      // פעילות לפי שעה
      hourly_activity: await q(sql`SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count FROM communication_log WHERE metadata->>'campaign_id' = ${String(id)} GROUP BY hour ORDER BY hour`),
    };

    res.json(analytics);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== אנליטיקס מקורות לידים ========================
router.get("/communication-marketing/lead-sources/analytics", async (_req: Request, res: Response) => {
  try {
    // סטטיסטיקות כלליות לכל מקור
    const sources = await q(sql`SELECT * FROM lead_sources_config ORDER BY total_leads DESC`);

    // סיכום כללי
    const totalLeads = (sources as any[]).reduce((sum: number, s: any) => sum + (s.total_leads || 0), 0);
    const totalCost = (sources as any[]).reduce((sum: number, s: any) => sum + ((s.cost_per_lead || 0) * (s.total_leads || 0)), 0);
    const avgConversion = totalLeads > 0
      ? (sources as any[]).reduce((sum: number, s: any) => sum + ((s.conversion_rate || 0) * (s.total_leads || 0)), 0) / totalLeads
      : 0;

    // דירוג מקורות לפי ביצועים
    const ranked = (sources as any[])
      .filter((s: any) => s.is_active)
      .sort((a: any, b: any) => {
        // ציון משוקלל: המרה * 0.5 + כמות * 0.3 + עלות נמוכה * 0.2
        const scoreA = (a.conversion_rate || 0) * 0.5 + Math.min((a.total_leads || 0) / 100, 1) * 30 + (a.cost_per_lead ? Math.max(0, 20 - (a.cost_per_lead / 10)) : 10);
        const scoreB = (b.conversion_rate || 0) * 0.5 + Math.min((b.total_leads || 0) / 100, 1) * 30 + (b.cost_per_lead ? Math.max(0, 20 - (b.cost_per_lead / 10)) : 10);
        return scoreB - scoreA;
      })
      .map((s: any, idx: number) => ({ ...s, rank: idx + 1 }));

    // התפלגות לפי סוג ערוץ
    const byChannel: Record<string, { leads: number; sources: number; avg_conversion: number }> = {};
    (sources as any[]).forEach((s: any) => {
      const ch = s.channel || 'other';
      if (!byChannel[ch]) byChannel[ch] = { leads: 0, sources: 0, avg_conversion: 0 };
      byChannel[ch].leads += s.total_leads || 0;
      byChannel[ch].sources += 1;
      byChannel[ch].avg_conversion += s.conversion_rate || 0;
    });
    for (const ch in byChannel) {
      byChannel[ch].avg_conversion = byChannel[ch].sources > 0
        ? Number((byChannel[ch].avg_conversion / byChannel[ch].sources).toFixed(1))
        : 0;
    }

    res.json({
      sources: ranked,
      summary: {
        total_sources: (sources as any[]).length,
        active_sources: (sources as any[]).filter((s: any) => s.is_active).length,
        total_leads: totalLeads,
        total_cost: totalCost.toFixed(2),
        avg_conversion_rate: avgConversion.toFixed(1),
        avg_cost_per_lead: totalLeads > 0 ? (totalCost / totalLeads).toFixed(2) : '0',
        best_source: ranked[0]?.source_name_he || ranked[0]?.source_name || 'N/A',
      },
      by_channel: byChannel,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== וובהוק לקבלת לידים ממקורות חיצוניים ========================
router.post("/communication-marketing/incoming-webhook/:source", async (req: Request, res: Response) => {
  try {
    const source = req.params.source;
    const payload = req.body;

    // שליפת הגדרות המקור
    const sources = await q(sql`SELECT * FROM lead_sources_config WHERE source_name = ${source} AND is_active = true`);
    const sourceConfig = sources[0] as any;

    if (!sourceConfig) {
      return res.status(404).json({ error: `מקור ליד "${source}" לא נמצא או לא פעיל` });
    }

    // עדכון מונה לידים למקור
    await db.execute(sql`UPDATE lead_sources_config SET total_leads = total_leads + 1, updated_at = NOW() WHERE id = ${sourceConfig.id}`);

    // חילוץ נתוני הליד מהפיילואד לפי סוג המקור
    let leadData: any = {};

    if (source === 'wix_website') {
      // מבנה Wix form submission
      leadData = {
        first_name: payload.firstName || payload.first_name || payload.name?.split(' ')[0] || '',
        last_name: payload.lastName || payload.last_name || payload.name?.split(' ').slice(1).join(' ') || '',
        phone: payload.phone || payload.telephone || '',
        email: payload.email || '',
        notes: payload.message || payload.notes || '',
        source: 'wix_website'
      };
    } else if (source === 'facebook_ads') {
      // מבנה Facebook Lead Ads webhook
      leadData = {
        first_name: payload.field_data?.find((f: any) => f.name === 'first_name')?.values?.[0] || payload.first_name || '',
        last_name: payload.field_data?.find((f: any) => f.name === 'last_name')?.values?.[0] || payload.last_name || '',
        phone: payload.field_data?.find((f: any) => f.name === 'phone_number')?.values?.[0] || payload.phone || '',
        email: payload.field_data?.find((f: any) => f.name === 'email')?.values?.[0] || payload.email || '',
        source: 'facebook_ads'
      };
    } else if (source === 'google_ads') {
      // מבנה Google Ads webhook
      leadData = {
        first_name: payload.user_column_data?.find((f: any) => f.column_id === 'FIRST_NAME')?.string_value || payload.first_name || '',
        last_name: payload.user_column_data?.find((f: any) => f.column_id === 'LAST_NAME')?.string_value || payload.last_name || '',
        phone: payload.user_column_data?.find((f: any) => f.column_id === 'PHONE_NUMBER')?.string_value || payload.phone || '',
        email: payload.user_column_data?.find((f: any) => f.column_id === 'EMAIL')?.string_value || payload.email || '',
        source: 'google_ads'
      };
    } else {
      // מבנה גנרי
      leadData = {
        first_name: payload.first_name || payload.firstName || payload.name || '',
        last_name: payload.last_name || payload.lastName || '',
        phone: payload.phone || payload.telephone || payload.mobile || '',
        email: payload.email || '',
        notes: payload.message || payload.notes || payload.comment || '',
        source: source
      };
    }

    // רישום בלוג תקשורת - הודעה נכנסת
    await db.execute(sql`INSERT INTO communication_log (channel, direction, contact_name, contact_phone, contact_email, message, status, metadata)
      VALUES (${sourceConfig.channel || 'webhook'}, 'incoming', ${(leadData.first_name + ' ' + leadData.last_name).trim()}, ${leadData.phone}, ${leadData.email}, ${'ליד חדש ממקור: ' + (sourceConfig.source_name_he || source)}, 'received', ${JSON.stringify({ source, raw_payload: payload, source_config_id: sourceConfig.id })})`);

    // ניתוב אוטומטי לסוכן - אם מוגדר
    let assignedAgent = null;
    if (sourceConfig.auto_assign) {
      if (sourceConfig.assign_to_agent_id) {
        assignedAgent = sourceConfig.assign_to_agent_id;
      }
      // TODO: מימוש round_robin / load_balanced
    }

    res.json({
      success: true,
      message: "ליד התקבל בהצלחה",
      lead_data: leadData,
      source: sourceConfig.source_name_he || source,
      assigned_agent: assignedAgent,
      notification_sent: sourceConfig.notification_channels || []
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ======================== דשבורד תקשורת מאוחד ========================
router.get("/communication-marketing/communication-dashboard", async (_req: Request, res: Response) => {
  try {
    // סטטיסטיקות כלליות תקשורת
    const generalStats = await q(sql`SELECT
      COUNT(*) as total_messages,
      COUNT(*) FILTER(WHERE channel = 'whatsapp') as whatsapp_count,
      COUNT(*) FILTER(WHERE channel = 'email') as email_count,
      COUNT(*) FILTER(WHERE channel = 'sms') as sms_count,
      COUNT(*) FILTER(WHERE direction = 'outgoing') as outgoing_count,
      COUNT(*) FILTER(WHERE direction = 'incoming') as incoming_count,
      COUNT(*) FILTER(WHERE status = 'sent') as sent_count,
      COUNT(*) FILTER(WHERE status = 'delivered') as delivered_count,
      COUNT(*) FILTER(WHERE status = 'read') as read_count,
      COUNT(*) FILTER(WHERE status = 'failed') as failed_count,
      COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '24 hours') as last_24h,
      COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '7 days') as last_7d,
      COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '30 days') as last_30d,
      COUNT(DISTINCT contact_phone) FILTER(WHERE contact_phone IS NOT NULL) as unique_contacts_phone,
      COUNT(DISTINCT contact_email) FILTER(WHERE contact_email IS NOT NULL) as unique_contacts_email
      FROM communication_log`);

    // סטטיסטיקות קמפיינים
    const campaignStats = await q(sql`SELECT
      COUNT(*) as total_campaigns,
      COUNT(*) FILTER(WHERE status = 'draft') as draft_count,
      COUNT(*) FILTER(WHERE status = 'active' OR status = 'sending' OR status = 'launching') as active_count,
      COUNT(*) FILTER(WHERE status = 'completed') as completed_count,
      COALESCE(SUM(budget), 0) as total_budget,
      COALESCE(SUM(spent), 0) as total_spent,
      COALESCE(SUM(revenue_generated), 0) as total_revenue,
      COALESCE(SUM(sent_count), 0) as total_sent,
      COALESCE(SUM(delivered_count), 0) as total_delivered,
      COALESCE(SUM(opened_count), 0) as total_opened,
      COALESCE(SUM(converted_count), 0) as total_converted
      FROM marketing_campaigns`);

    // תבניות הכי בשימוש
    const topWhatsAppTemplates = await q(sql`SELECT template_name_he, template_name, usage_count, category FROM whatsapp_templates WHERE status = 'active' ORDER BY usage_count DESC LIMIT 5`);
    const topEmailTemplates = await q(sql`SELECT template_name_he, template_name, usage_count, category FROM email_templates WHERE status = 'active' ORDER BY usage_count DESC LIMIT 5`);

    // מקורות לידים מובילים
    const topLeadSources = await q(sql`SELECT source_name_he, source_name, total_leads, conversion_rate, cost_per_lead, channel FROM lead_sources_config WHERE is_active = true ORDER BY total_leads DESC LIMIT 5`);

    // הודעות אחרונות
    const recentMessages = await q(sql`SELECT id, channel, direction, contact_name, contact_phone, contact_email, subject, status, created_at FROM communication_log ORDER BY created_at DESC LIMIT 10`);

    // פעילות לפי יום (7 ימים אחרונים)
    const dailyActivity = await q(sql`SELECT
      DATE(created_at) as date,
      COUNT(*) as total,
      COUNT(*) FILTER(WHERE channel = 'whatsapp') as whatsapp,
      COUNT(*) FILTER(WHERE channel = 'email') as email,
      COUNT(*) FILTER(WHERE channel = 'sms') as sms
      FROM communication_log
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC`);

    // קמפיינים פעילים
    const activeCampaigns = await q(sql`SELECT id, campaign_name_he, campaign_name, channel, status, total_recipients, sent_count, delivered_count, opened_count, converted_count, started_at FROM marketing_campaigns WHERE status IN ('active', 'sending', 'launching', 'scheduled') ORDER BY updated_at DESC LIMIT 5`);

    res.json({
      communication: (generalStats as any[])[0] || {},
      campaigns: (campaignStats as any[])[0] || {},
      top_whatsapp_templates: topWhatsAppTemplates,
      top_email_templates: topEmailTemplates,
      top_lead_sources: topLeadSources,
      recent_messages: recentMessages,
      daily_activity: dailyActivity,
      active_campaigns: activeCampaigns,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
