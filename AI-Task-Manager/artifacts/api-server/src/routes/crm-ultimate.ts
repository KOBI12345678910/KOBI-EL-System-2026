// ============================================================================
// CRM ULTIMATE - המנוע המתקדם ביותר בעולם לניהול לקוחות למפעל מסגריית אלומיניום
// TechnoKoluzi - מסגריית מתכת ואלומיניום
// ============================================================================

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ======================== עזרי שאילתות ========================
const q = async (query: any) => {
  try {
    const r = await db.execute(query);
    return r.rows;
  } catch (e) {
    console.error("[CRM-Ultimate]", e);
    return [];
  }
};

const qOne = async (query: any) => {
  const rows = await q(query);
  return rows[0] || null;
};

// מחולל מספר רץ אוטומטי
async function nextNumber(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  try {
    await db.execute(sql`
      INSERT INTO auto_number_counters (prefix, current_value) VALUES (${prefix}, 0)
      ON CONFLICT (prefix) DO NOTHING
    `);
    const rows = await db.execute(sql`
      UPDATE auto_number_counters SET current_value = current_value + 1
      WHERE prefix = ${prefix}
      RETURNING current_value
    `);
    const val = Number((rows.rows as any[])?.[0]?.current_value || 1);
    return `${prefix}-${year}-${String(val).padStart(5, "0")}`;
  } catch {
    return `${prefix}-${year}-${Date.now()}`;
  }
}

// ניקוי אובייקט לפני הכנסה
function clean(d: any, skip: string[] = []) {
  const o = { ...d };
  for (const k of skip) delete o[k];
  for (const k in o) {
    if (o[k] === "" || o[k] === undefined) o[k] = null;
  }
  delete o.id;
  delete o.created_at;
  delete o.updated_at;
  return o;
}

// בניית שאילתת UPDATE דינמית
function buildUpdate(table: string, data: any, id: number): any {
  const entries = Object.entries(data).filter(
    ([k, v]) => v !== undefined && k !== "id" && k !== "created_at"
  );
  if (entries.length === 0) return null;
  const setParts = entries.map(([k], i) => `${k} = $${i + 1}`).join(", ");
  const values = entries.map(([, v]) => v);
  const text = `UPDATE ${table} SET ${setParts}, updated_at = NOW() WHERE id = $${entries.length + 1} RETURNING *`;
  values.push(id);
  return { text, values };
}

// ============================================================================
// יצירת כל הטבלאות - 10 טבלאות מלאות
// ============================================================================
async function ensureCrmUltimateTables(): Promise<void> {
  try {
    // ---- טבלת מונה אוטומטי (אם לא קיימת) ----
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS auto_number_counters (
        prefix VARCHAR(50) PRIMARY KEY,
        current_value INTEGER DEFAULT 0
      )
    `);

    // ============================================================
    // 1. ניהול לידים - הטבלה המרכזית
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_leads_ultimate (
        id SERIAL PRIMARY KEY,
        lead_number VARCHAR(50),
        first_name VARCHAR(200) NOT NULL,
        last_name VARCHAR(200),
        full_name VARCHAR(400),
        phone VARCHAR(50),
        mobile VARCHAR(50),
        email VARCHAR(200),
        city VARCHAR(200),
        address TEXT,
        source VARCHAR(100),
        source_detail VARCHAR(300),
        lead_type VARCHAR(50) DEFAULT 'private',
        urgency VARCHAR(20) DEFAULT 'normal',
        estimated_budget NUMERIC(15,2),
        interested_products JSONB DEFAULT '[]',
        status VARCHAR(50) DEFAULT 'new',
        sub_status VARCHAR(100),
        assigned_agent_id INTEGER,
        assigned_agent_name VARCHAR(200),
        assignment_date TIMESTAMPTZ,
        first_contact_date TIMESTAMPTZ,
        last_contact_date TIMESTAMPTZ,
        next_follow_up DATE,
        follow_up_count INTEGER DEFAULT 0,
        response_time_minutes INTEGER,
        quality_score INTEGER,
        ai_score INTEGER,
        ai_recommendation TEXT,
        conversion_probability NUMERIC(5,2),
        lost_reason VARCHAR(200),
        lost_to_competitor VARCHAR(200),
        tags JSONB DEFAULT '[]',
        custom_fields JSONB DEFAULT '{}',
        notes TEXT,
        is_converted BOOLEAN DEFAULT false,
        converted_to_customer_id INTEGER,
        converted_at TIMESTAMPTZ,
        mandatory_fields_complete BOOLEAN DEFAULT false,
        created_by VARCHAR(200),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // 2. פעילויות והיסטוריה של לידים
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_lead_activities (
        id SERIAL PRIMARY KEY,
        lead_id INTEGER NOT NULL,
        activity_type VARCHAR(50),
        description TEXT,
        outcome VARCHAR(100),
        duration_minutes INTEGER,
        call_recording_url TEXT,
        call_transcript TEXT,
        ai_call_analysis JSONB,
        location VARCHAR(300),
        gps_lat NUMERIC(10,7),
        gps_lng NUMERIC(10,7),
        performed_by VARCHAR(200),
        performed_at TIMESTAMPTZ DEFAULT NOW(),
        next_action TEXT,
        next_action_date DATE,
        attachments JSONB DEFAULT '[]',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // 3. ניהול סוכנים
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_agents (
        id SERIAL PRIMARY KEY,
        agent_number VARCHAR(50),
        full_name VARCHAR(300) NOT NULL,
        phone VARCHAR(50),
        email VARCHAR(200),
        role VARCHAR(50) DEFAULT 'field_agent',
        territory VARCHAR(200),
        territory_cities JSONB DEFAULT '[]',
        commission_rate NUMERIC(5,2) DEFAULT 7.5,
        bonus_rate NUMERIC(5,2) DEFAULT 2.5,
        monthly_target NUMERIC(15,2) DEFAULT 0,
        monthly_actual NUMERIC(15,2) DEFAULT 0,
        target_leads INTEGER DEFAULT 0,
        target_meetings INTEGER DEFAULT 0,
        target_closings INTEGER DEFAULT 0,
        current_leads INTEGER DEFAULT 0,
        current_meetings INTEGER DEFAULT 0,
        current_closings INTEGER DEFAULT 0,
        conversion_rate NUMERIC(5,2) DEFAULT 0,
        avg_response_time_min INTEGER DEFAULT 0,
        avg_deal_size NUMERIC(15,2) DEFAULT 0,
        total_revenue NUMERIC(15,2) DEFAULT 0,
        total_commission NUMERIC(15,2) DEFAULT 0,
        risk_score INTEGER DEFAULT 0,
        quality_score INTEGER DEFAULT 0,
        ranking INTEGER,
        is_active BOOLEAN DEFAULT true,
        last_location_lat NUMERIC(10,7),
        last_location_lng NUMERIC(10,7),
        last_location_time TIMESTAMPTZ,
        last_activity TIMESTAMPTZ,
        availability_status VARCHAR(50) DEFAULT 'available',
        availability_note TEXT,
        shift_start TIME,
        shift_end TIME,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // 4. פגישות ויומן
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_meetings (
        id SERIAL PRIMARY KEY,
        meeting_number VARCHAR(50),
        lead_id INTEGER,
        customer_id INTEGER,
        agent_id INTEGER,
        agent_name VARCHAR(200),
        meeting_type VARCHAR(50),
        title VARCHAR(500),
        date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        duration_minutes INTEGER,
        location VARCHAR(500),
        gps_lat NUMERIC(10,7),
        gps_lng NUMERIC(10,7),
        customer_name VARCHAR(300),
        customer_phone VARCHAR(50),
        notes TEXT,
        outcome VARCHAR(100),
        outcome_notes TEXT,
        quote_amount NUMERIC(15,2),
        photos JSONB DEFAULT '[]',
        signature_url TEXT,
        next_step TEXT,
        status VARCHAR(50) DEFAULT 'scheduled',
        reminder_sent BOOLEAN DEFAULT false,
        customer_confirmed BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // 5. הצעות מחיר ותמחור
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_quotes (
        id SERIAL PRIMARY KEY,
        quote_number VARCHAR(50),
        version INTEGER DEFAULT 1,
        lead_id INTEGER,
        customer_id INTEGER,
        customer_name VARCHAR(300),
        agent_id INTEGER,
        agent_name VARCHAR(200),
        items JSONB DEFAULT '[]',
        subtotal NUMERIC(15,2) DEFAULT 0,
        discount_percent NUMERIC(5,2) DEFAULT 0,
        discount_amount NUMERIC(15,2) DEFAULT 0,
        discount_requires_approval BOOLEAN DEFAULT false,
        discount_approved_by VARCHAR(200),
        total_before_vat NUMERIC(15,2) DEFAULT 0,
        vat_rate NUMERIC(5,2) DEFAULT 17,
        vat_amount NUMERIC(15,2) DEFAULT 0,
        total_with_vat NUMERIC(15,2) DEFAULT 0,
        price_per_sqm NUMERIC(15,2) DEFAULT 0,
        total_sqm NUMERIC(15,2) DEFAULT 0,
        payment_terms VARCHAR(200),
        validity_days INTEGER DEFAULT 30,
        valid_until DATE,
        delivery_time VARCHAR(200),
        notes TEXT,
        internal_notes TEXT,
        terms_and_conditions TEXT,
        sent_at TIMESTAMPTZ,
        viewed_at TIMESTAMPTZ,
        signed_at TIMESTAMPTZ,
        signature_url TEXT,
        pdf_url TEXT,
        previous_version_id INTEGER,
        ai_price_analysis JSONB,
        margin_analysis JSONB,
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // 6. חוזים וחתימות
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_contracts (
        id SERIAL PRIMARY KEY,
        contract_number VARCHAR(50),
        quote_id INTEGER,
        lead_id INTEGER,
        customer_id INTEGER,
        customer_name VARCHAR(300),
        agent_id INTEGER,
        total_amount NUMERIC(15,2),
        currency VARCHAR(10) DEFAULT 'ILS',
        payment_schedule JSONB DEFAULT '[]',
        advance_payment NUMERIC(15,2) DEFAULT 0,
        advance_paid BOOLEAN DEFAULT false,
        products JSONB DEFAULT '[]',
        delivery_date DATE,
        installation_date DATE,
        warranty_months INTEGER DEFAULT 12,
        special_conditions TEXT,
        contract_pdf_url TEXT,
        customer_signature_url TEXT,
        company_signature_url TEXT,
        signed_date DATE,
        signed_by_customer VARCHAR(300),
        approved_by_manager VARCHAR(200),
        approval_date DATE,
        status VARCHAR(50) DEFAULT 'draft',
        cancellation_reason TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // 7. משימות ותזכורות
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_tasks (
        id SERIAL PRIMARY KEY,
        task_number VARCHAR(50),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        task_type VARCHAR(50),
        priority VARCHAR(20) DEFAULT 'medium',
        lead_id INTEGER,
        customer_id INTEGER,
        assigned_to_id INTEGER,
        assigned_to_name VARCHAR(200),
        assigned_by VARCHAR(200),
        due_date DATE,
        due_time TIME,
        completed_at TIMESTAMPTZ,
        completed_by VARCHAR(200),
        reminder_date TIMESTAMPTZ,
        reminder_sent BOOLEAN DEFAULT false,
        send_notification_phone BOOLEAN DEFAULT true,
        send_notification_email BOOLEAN DEFAULT true,
        send_notification_manager BOOLEAN DEFAULT false,
        sla_hours INTEGER,
        sla_breached BOOLEAN DEFAULT false,
        auto_created BOOLEAN DEFAULT false,
        auto_trigger VARCHAR(200),
        notes TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // 8. מעקב GPS מיקום סוכנים
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_agent_locations (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        lat NUMERIC(10,7) NOT NULL,
        lng NUMERIC(10,7) NOT NULL,
        accuracy NUMERIC(10,2),
        address VARCHAR(500),
        activity VARCHAR(50),
        speed NUMERIC(10,2),
        timestamp TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // 9. סטטיסטיקות יומיות של סוכנים - תצלום יומי
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_agent_daily_stats (
        id SERIAL PRIMARY KEY,
        agent_id INTEGER NOT NULL,
        agent_name VARCHAR(200),
        stat_date DATE NOT NULL,
        leads_received INTEGER DEFAULT 0,
        leads_contacted INTEGER DEFAULT 0,
        calls_made INTEGER DEFAULT 0,
        calls_received INTEGER DEFAULT 0,
        calls_missed INTEGER DEFAULT 0,
        calls_returned INTEGER DEFAULT 0,
        total_call_duration_min INTEGER DEFAULT 0,
        meetings_scheduled INTEGER DEFAULT 0,
        meetings_completed INTEGER DEFAULT 0,
        meetings_cancelled INTEGER DEFAULT 0,
        meetings_no_show INTEGER DEFAULT 0,
        quotes_sent INTEGER DEFAULT 0,
        quotes_amount NUMERIC(15,2) DEFAULT 0,
        deals_closed INTEGER DEFAULT 0,
        deals_amount NUMERIC(15,2) DEFAULT 0,
        deals_lost INTEGER DEFAULT 0,
        conversion_rate NUMERIC(5,2) DEFAULT 0,
        avg_response_time_min INTEGER DEFAULT 0,
        km_driven NUMERIC(10,2) DEFAULT 0,
        hours_at_clients NUMERIC(5,2) DEFAULT 0,
        follow_ups_done INTEGER DEFAULT 0,
        tasks_completed INTEGER DEFAULT 0,
        tasks_overdue INTEGER DEFAULT 0,
        quality_score INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(agent_id, stat_date)
      )
    `);

    // ============================================================
    // 10. התראות והתרעות
    // ============================================================
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS crm_notifications (
        id SERIAL PRIMARY KEY,
        notification_type VARCHAR(100),
        severity VARCHAR(20) DEFAULT 'info',
        title VARCHAR(500),
        message TEXT,
        target_user_id INTEGER,
        target_role VARCHAR(50),
        lead_id INTEGER,
        agent_id INTEGER,
        action_url VARCHAR(500),
        action_label VARCHAR(200),
        channels JSONB DEFAULT '["app"]',
        read BOOLEAN DEFAULT false,
        read_at TIMESTAMPTZ,
        dismissed BOOLEAN DEFAULT false,
        auto_generated BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ============================================================
    // אינדקסים לביצועים מיטביים
    // ============================================================

    // אינדקסים לטבלת לידים
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_status ON crm_leads_ultimate(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_agent ON crm_leads_ultimate(assigned_agent_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_source ON crm_leads_ultimate(source)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_city ON crm_leads_ultimate(city)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_type ON crm_leads_ultimate(lead_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_urgency ON crm_leads_ultimate(urgency)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_created ON crm_leads_ultimate(created_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_followup ON crm_leads_ultimate(next_follow_up)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_converted ON crm_leads_ultimate(is_converted)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_phone ON crm_leads_ultimate(phone)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_mobile ON crm_leads_ultimate(mobile)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_leads_ult_number ON crm_leads_ultimate(lead_number)`);

    // אינדקסים לטבלת פעילויות
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activities_lead ON crm_lead_activities(lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activities_type ON crm_lead_activities(activity_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activities_performed ON crm_lead_activities(performed_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_activities_performer ON crm_lead_activities(performed_by)`);

    // אינדקסים לטבלת סוכנים
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agents_active ON crm_agents(is_active)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agents_role ON crm_agents(role)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agents_territory ON crm_agents(territory)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agents_availability ON crm_agents(availability_status)`);

    // אינדקסים לטבלת פגישות
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_meetings_lead ON crm_meetings(lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_meetings_agent ON crm_meetings(agent_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_meetings_date ON crm_meetings(date)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_meetings_status ON crm_meetings(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_meetings_customer ON crm_meetings(customer_id)`);

    // אינדקסים לטבלת הצעות מחיר
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_quotes_lead ON crm_quotes(lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_quotes_agent ON crm_quotes(agent_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_quotes_status ON crm_quotes(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_quotes_customer ON crm_quotes(customer_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_quotes_number ON crm_quotes(quote_number)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_quotes_valid ON crm_quotes(valid_until)`);

    // אינדקסים לטבלת חוזים
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_contracts_lead ON crm_contracts(lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_contracts_customer ON crm_contracts(customer_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_contracts_agent ON crm_contracts(agent_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_contracts_status ON crm_contracts(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_contracts_quote ON crm_contracts(quote_id)`);

    // אינדקסים לטבלת משימות
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tasks_lead ON crm_tasks(lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON crm_tasks(assigned_to_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tasks_status ON crm_tasks(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tasks_due ON crm_tasks(due_date)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tasks_priority ON crm_tasks(priority)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_tasks_type ON crm_tasks(task_type)`);

    // אינדקסים לטבלת מיקום סוכנים
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agent_loc_agent ON crm_agent_locations(agent_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agent_loc_time ON crm_agent_locations(timestamp)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_agent_loc_activity ON crm_agent_locations(activity)`);

    // אינדקסים לטבלת סטטיסטיקות יומיות
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_daily_stats_agent ON crm_agent_daily_stats(agent_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON crm_agent_daily_stats(stat_date)`);

    // אינדקסים לטבלת התראות
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notif_user ON crm_notifications(target_user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notif_type ON crm_notifications(notification_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notif_severity ON crm_notifications(severity)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notif_read ON crm_notifications(read)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notif_lead ON crm_notifications(lead_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notif_agent ON crm_notifications(agent_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notif_created ON crm_notifications(created_at)`);

    console.log("[CRM-Ultimate] כל 10 הטבלאות נוצרו בהצלחה עם אינדקסים");
  } catch (e) {
    console.error("[CRM-Ultimate] שגיאה ביצירת טבלאות:", e);
  }
}

// ============================================================================
// 1. POST /init - אתחול כל הטבלאות + סטטוסים
// ============================================================================
router.post("/init", async (_req: Request, res: Response) => {
  try {
    await ensureCrmUltimateTables();

    // זריעת מוני מספרים רצים
    const prefixes = ["LEAD", "MTG", "QUO", "CON", "TSK", "AGT", "NOT"];
    for (const p of prefixes) {
      await db.execute(sql`
        INSERT INTO auto_number_counters (prefix, current_value) VALUES (${p}, 0)
        ON CONFLICT (prefix) DO NOTHING
      `);
    }

    res.json({
      success: true,
      message: "CRM Ultimate אותחל בהצלחה - 10 טבלאות, אינדקסים, ומוני מספרים",
      tables: [
        "crm_leads_ultimate",
        "crm_lead_activities",
        "crm_agents",
        "crm_meetings",
        "crm_quotes",
        "crm_contracts",
        "crm_tasks",
        "crm_agent_locations",
        "crm_agent_daily_stats",
        "crm_notifications",
      ],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
//  CRUD גנרי לכל 10 הטבלאות
// ============================================================================

// ----- 1. CRUD לידים (crm_leads_ultimate) -----

// קבלת כל הלידים עם סינון וחיפוש
router.get("/leads", async (req: Request, res: Response) => {
  const { status, agent_id, source, city, lead_type, urgency, search, limit, offset } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = '${status}'`;
  if (agent_id) where += ` AND assigned_agent_id = ${agent_id}`;
  if (source) where += ` AND source = '${source}'`;
  if (city) where += ` AND city = '${city}'`;
  if (lead_type) where += ` AND lead_type = '${lead_type}'`;
  if (urgency) where += ` AND urgency = '${urgency}'`;
  if (search) where += ` AND (full_name ILIKE '%${search}%' OR phone ILIKE '%${search}%' OR mobile ILIKE '%${search}%' OR email ILIKE '%${search}%' OR city ILIKE '%${search}%')`;
  const lim = Number(limit) || 200;
  const off = Number(offset) || 0;
  const rows = await q(sql.raw(`SELECT * FROM crm_leads_ultimate ${where} ORDER BY created_at DESC LIMIT ${lim} OFFSET ${off}`));
  const countR = await q(sql.raw(`SELECT COUNT(*) as total FROM crm_leads_ultimate ${where}`));
  res.json({ data: rows, total: Number((countR[0] as any)?.total || 0) });
});

// ליד בודד
router.get("/leads/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM crm_leads_ultimate WHERE id = ${Number(req.params.id)}`);
  if (!row) return res.status(404).json({ error: "ליד לא נמצא" });
  // שליפת פעילויות אחרונות
  const activities = await q(sql`SELECT * FROM crm_lead_activities WHERE lead_id = ${Number(req.params.id)} ORDER BY performed_at DESC LIMIT 50`);
  // שליפת פגישות
  const meetings = await q(sql`SELECT * FROM crm_meetings WHERE lead_id = ${Number(req.params.id)} ORDER BY date DESC`);
  // שליפת הצעות מחיר
  const quotes = await q(sql`SELECT * FROM crm_quotes WHERE lead_id = ${Number(req.params.id)} ORDER BY created_at DESC`);
  // שליפת משימות
  const tasks = await q(sql`SELECT * FROM crm_tasks WHERE lead_id = ${Number(req.params.id)} ORDER BY due_date ASC`);
  res.json({ ...(row as any), activities, meetings, quotes, tasks });
});

// יצירת ליד חדש
router.post("/leads", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const leadNum = await nextNumber("LEAD");
    d.lead_number = leadNum;
    // חישוב שם מלא
    d.full_name = [d.first_name, d.last_name].filter(Boolean).join(" ");
    // בדיקת שדות חובה
    d.mandatory_fields_complete = !!(d.first_name && (d.phone || d.mobile));
    // זמן יצירה
    if (!d.first_contact_date && d.status !== "new") d.first_contact_date = new Date().toISOString();

    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_leads_ultimate (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// עדכון ליד
router.put("/leads/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    if (d.first_name || d.last_name) {
      const existing = await qOne(sql`SELECT first_name, last_name FROM crm_leads_ultimate WHERE id = ${Number(req.params.id)}`);
      if (existing) {
        d.full_name = [(d.first_name || (existing as any).first_name), (d.last_name || (existing as any).last_name)].filter(Boolean).join(" ");
      }
    }
    d.mandatory_fields_complete = !!(d.first_name && (d.phone || d.mobile));
    const upd = buildUpdate("crm_leads_ultimate", d, Number(req.params.id));
    if (!upd) return res.status(400).json({ error: "אין שדות לעדכון" });
    const result = await db.execute(upd as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// מחיקת ליד
router.delete("/leads/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_leads_ultimate WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ----- 2. CRUD פעילויות לידים (crm_lead_activities) -----

router.get("/lead-activities", async (req: Request, res: Response) => {
  const { lead_id, activity_type, performed_by, limit } = req.query;
  let where = "WHERE 1=1";
  if (lead_id) where += ` AND lead_id = ${lead_id}`;
  if (activity_type) where += ` AND activity_type = '${activity_type}'`;
  if (performed_by) where += ` AND performed_by = '${performed_by}'`;
  const lim = Number(limit) || 100;
  const rows = await q(sql.raw(`SELECT * FROM crm_lead_activities ${where} ORDER BY performed_at DESC LIMIT ${lim}`));
  res.json(rows);
});

router.get("/lead-activities/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM crm_lead_activities WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

router.post("/lead-activities", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_lead_activities (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);

    // עדכון תאריך קשר אחרון בליד
    if (d.lead_id) {
      await db.execute(sql`UPDATE crm_leads_ultimate SET last_contact_date = NOW(), follow_up_count = follow_up_count + 1, updated_at = NOW() WHERE id = ${d.lead_id}`);
      // אם זה הקשר הראשון - עדכון תאריך קשר ראשון
      await db.execute(sql`UPDATE crm_leads_ultimate SET first_contact_date = NOW() WHERE id = ${d.lead_id} AND first_contact_date IS NULL`);
    }

    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/lead-activities/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const upd = buildUpdate("crm_lead_activities", d, Number(req.params.id));
    if (!upd) return res.status(400).json({ error: "אין שדות לעדכון" });
    const result = await db.execute(upd as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/lead-activities/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_lead_activities WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ----- 3. CRUD סוכנים (crm_agents) -----

router.get("/agents", async (req: Request, res: Response) => {
  const { is_active, role, territory } = req.query;
  let where = "WHERE 1=1";
  if (is_active !== undefined) where += ` AND is_active = ${is_active === "true"}`;
  if (role) where += ` AND role = '${role}'`;
  if (territory) where += ` AND territory = '${territory}'`;
  const rows = await q(sql.raw(`SELECT * FROM crm_agents ${where} ORDER BY ranking ASC NULLS LAST, full_name ASC`));
  res.json(rows);
});

router.get("/agents/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM crm_agents WHERE id = ${Number(req.params.id)}`);
  if (!row) return res.status(404).json({ error: "סוכן לא נמצא" });
  // שליפת לידים פעילים של הסוכן
  const activeLeads = await q(sql`SELECT * FROM crm_leads_ultimate WHERE assigned_agent_id = ${Number(req.params.id)} AND status NOT IN ('deal_closed','not_relevant','deal_lost') ORDER BY created_at DESC`);
  // שליפת פגישות קרובות
  const upcomingMeetings = await q(sql`SELECT * FROM crm_meetings WHERE agent_id = ${Number(req.params.id)} AND date >= CURRENT_DATE AND status IN ('scheduled','confirmed') ORDER BY date ASC, start_time ASC`);
  // שליפת משימות פתוחות
  const openTasks = await q(sql`SELECT * FROM crm_tasks WHERE assigned_to_id = ${Number(req.params.id)} AND status IN ('pending','in_progress') ORDER BY due_date ASC`);
  res.json({ ...(row as any), activeLeads, upcomingMeetings, openTasks });
});

router.post("/agents", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    d.agent_number = await nextNumber("AGT");
    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_agents (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/agents/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const upd = buildUpdate("crm_agents", d, Number(req.params.id));
    if (!upd) return res.status(400).json({ error: "אין שדות לעדכון" });
    const result = await db.execute(upd as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/agents/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_agents WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ----- 4. CRUD פגישות (crm_meetings) -----

router.get("/meetings", async (req: Request, res: Response) => {
  const { agent_id, lead_id, date, status, date_from, date_to } = req.query;
  let where = "WHERE 1=1";
  if (agent_id) where += ` AND agent_id = ${agent_id}`;
  if (lead_id) where += ` AND lead_id = ${lead_id}`;
  if (date) where += ` AND date = '${date}'`;
  if (status) where += ` AND status = '${status}'`;
  if (date_from) where += ` AND date >= '${date_from}'`;
  if (date_to) where += ` AND date <= '${date_to}'`;
  const rows = await q(sql.raw(`SELECT * FROM crm_meetings ${where} ORDER BY date DESC, start_time DESC`));
  res.json(rows);
});

router.get("/meetings/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM crm_meetings WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

router.post("/meetings", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    d.meeting_number = await nextNumber("MTG");
    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_meetings (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);

    // עדכון סטטוס ליד לפגישה מתוזמנת
    if (d.lead_id) {
      await db.execute(sql`UPDATE crm_leads_ultimate SET status = 'meeting_scheduled', updated_at = NOW() WHERE id = ${d.lead_id} AND status IN ('new', 'call_scheduled')`);
    }

    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/meetings/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const upd = buildUpdate("crm_meetings", d, Number(req.params.id));
    if (!upd) return res.status(400).json({ error: "אין שדות לעדכון" });
    const result = await db.execute(upd as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/meetings/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_meetings WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ----- 5. CRUD הצעות מחיר (crm_quotes) -----

router.get("/quotes", async (req: Request, res: Response) => {
  const { lead_id, agent_id, status, customer_id } = req.query;
  let where = "WHERE 1=1";
  if (lead_id) where += ` AND lead_id = ${lead_id}`;
  if (agent_id) where += ` AND agent_id = ${agent_id}`;
  if (status) where += ` AND status = '${status}'`;
  if (customer_id) where += ` AND customer_id = ${customer_id}`;
  const rows = await q(sql.raw(`SELECT * FROM crm_quotes ${where} ORDER BY created_at DESC`));
  res.json(rows);
});

router.get("/quotes/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM crm_quotes WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

router.post("/quotes", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    d.quote_number = await nextNumber("QUO");

    // חישוב סכומים אוטומטי
    if (d.items && Array.isArray(d.items)) {
      let subtotal = 0;
      let totalSqm = 0;
      for (const item of d.items) {
        subtotal += Number(item.total || 0);
        totalSqm += Number(item.sqm || 0);
      }
      d.subtotal = subtotal;
      d.total_sqm = totalSqm;
      d.items = JSON.stringify(d.items);
    }

    // חישוב הנחה, מע"מ, וסה"כ
    const sub = Number(d.subtotal || 0);
    const discPct = Number(d.discount_percent || 0);
    const discAmt = discPct > 0 ? sub * (discPct / 100) : Number(d.discount_amount || 0);
    d.discount_amount = discAmt;
    d.total_before_vat = sub - discAmt;
    const vatRate = Number(d.vat_rate || 17);
    d.vat_amount = d.total_before_vat * (vatRate / 100);
    d.total_with_vat = d.total_before_vat + d.vat_amount;
    if (d.total_sqm && d.total_sqm > 0) d.price_per_sqm = d.total_before_vat / d.total_sqm;

    // הנחה מעל 10% דורשת אישור
    if (discPct > 10) d.discount_requires_approval = true;

    // תוקף הצעה
    d.valid_until = d.valid_until || new Date(Date.now() + (d.validity_days || 30) * 86400000).toISOString().split("T")[0];

    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_quotes (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);

    // עדכון סטטוס ליד להצעת מחיר נשלחה
    if (d.lead_id) {
      await db.execute(sql`UPDATE crm_leads_ultimate SET status = 'quote_sent', estimated_budget = ${d.total_with_vat}, updated_at = NOW() WHERE id = ${d.lead_id}`);
    }

    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/quotes/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    if (d.items && typeof d.items !== "string") d.items = JSON.stringify(d.items);
    const upd = buildUpdate("crm_quotes", d, Number(req.params.id));
    if (!upd) return res.status(400).json({ error: "אין שדות לעדכון" });
    const result = await db.execute(upd as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/quotes/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_quotes WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ----- 6. CRUD חוזים (crm_contracts) -----

router.get("/contracts", async (req: Request, res: Response) => {
  const { status, customer_id, agent_id } = req.query;
  let where = "WHERE 1=1";
  if (status) where += ` AND status = '${status}'`;
  if (customer_id) where += ` AND customer_id = ${customer_id}`;
  if (agent_id) where += ` AND agent_id = ${agent_id}`;
  const rows = await q(sql.raw(`SELECT * FROM crm_contracts ${where} ORDER BY created_at DESC`));
  res.json(rows);
});

router.get("/contracts/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM crm_contracts WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

router.post("/contracts", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    d.contract_number = await nextNumber("CON");
    if (d.payment_schedule && typeof d.payment_schedule !== "string") d.payment_schedule = JSON.stringify(d.payment_schedule);
    if (d.products && typeof d.products !== "string") d.products = JSON.stringify(d.products);
    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_contracts (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/contracts/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    if (d.payment_schedule && typeof d.payment_schedule !== "string") d.payment_schedule = JSON.stringify(d.payment_schedule);
    if (d.products && typeof d.products !== "string") d.products = JSON.stringify(d.products);
    const upd = buildUpdate("crm_contracts", d, Number(req.params.id));
    if (!upd) return res.status(400).json({ error: "אין שדות לעדכון" });
    const result = await db.execute(upd as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/contracts/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_contracts WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ----- 7. CRUD משימות (crm_tasks) -----

router.get("/tasks", async (req: Request, res: Response) => {
  const { assigned_to_id, status, priority, task_type, lead_id, due_date } = req.query;
  let where = "WHERE 1=1";
  if (assigned_to_id) where += ` AND assigned_to_id = ${assigned_to_id}`;
  if (status) where += ` AND status = '${status}'`;
  if (priority) where += ` AND priority = '${priority}'`;
  if (task_type) where += ` AND task_type = '${task_type}'`;
  if (lead_id) where += ` AND lead_id = ${lead_id}`;
  if (due_date) where += ` AND due_date = '${due_date}'`;
  const rows = await q(sql.raw(`SELECT * FROM crm_tasks ${where} ORDER BY CASE WHEN priority='critical' THEN 1 WHEN priority='high' THEN 2 WHEN priority='medium' THEN 3 ELSE 4 END, due_date ASC NULLS LAST`));
  res.json(rows);
});

router.get("/tasks/:id", async (req: Request, res: Response) => {
  const row = await qOne(sql`SELECT * FROM crm_tasks WHERE id = ${Number(req.params.id)}`);
  res.json(row);
});

router.post("/tasks", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    d.task_number = await nextNumber("TSK");
    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_tasks (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    // אם מסמנים כהושלם - עדכון תאריך השלמה
    if (d.status === "completed" && !d.completed_at) d.completed_at = new Date().toISOString();
    const upd = buildUpdate("crm_tasks", d, Number(req.params.id));
    if (!upd) return res.status(400).json({ error: "אין שדות לעדכון" });
    const result = await db.execute(upd as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/tasks/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_tasks WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ----- 8. CRUD מיקום סוכנים (crm_agent_locations) -----

router.get("/agent-locations", async (req: Request, res: Response) => {
  const { agent_id, limit } = req.query;
  let where = "WHERE 1=1";
  if (agent_id) where += ` AND agent_id = ${agent_id}`;
  const lim = Number(limit) || 100;
  const rows = await q(sql.raw(`SELECT * FROM crm_agent_locations ${where} ORDER BY timestamp DESC LIMIT ${lim}`));
  res.json(rows);
});

router.post("/agent-locations", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_agent_locations (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);

    // עדכון מיקום אחרון של הסוכן
    if (d.agent_id) {
      await db.execute(sql`UPDATE crm_agents SET last_location_lat = ${d.lat}, last_location_lng = ${d.lng}, last_location_time = NOW(), last_activity = NOW(), updated_at = NOW() WHERE id = ${d.agent_id}`);
    }

    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/agent-locations/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_agent_locations WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ----- 9. CRUD סטטיסטיקות יומיות (crm_agent_daily_stats) -----

router.get("/agent-daily-stats", async (req: Request, res: Response) => {
  const { agent_id, date_from, date_to } = req.query;
  let where = "WHERE 1=1";
  if (agent_id) where += ` AND agent_id = ${agent_id}`;
  if (date_from) where += ` AND stat_date >= '${date_from}'`;
  if (date_to) where += ` AND stat_date <= '${date_to}'`;
  const rows = await q(sql.raw(`SELECT * FROM crm_agent_daily_stats ${where} ORDER BY stat_date DESC`));
  res.json(rows);
});

router.post("/agent-daily-stats", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_agent_daily_stats (${keys.join(", ")}) VALUES (${placeholders}) ON CONFLICT (agent_id, stat_date) DO UPDATE SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(", ")} RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/agent-daily-stats/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_agent_daily_stats WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ----- 10. CRUD התראות (crm_notifications) -----

router.get("/notifications", async (req: Request, res: Response) => {
  const { target_user_id, severity, read, notification_type, limit } = req.query;
  let where = "WHERE 1=1";
  if (target_user_id) where += ` AND target_user_id = ${target_user_id}`;
  if (severity) where += ` AND severity = '${severity}'`;
  if (read !== undefined) where += ` AND read = ${read === "true"}`;
  if (notification_type) where += ` AND notification_type = '${notification_type}'`;
  const lim = Number(limit) || 100;
  const rows = await q(sql.raw(`SELECT * FROM crm_notifications ${where} ORDER BY created_at DESC LIMIT ${lim}`));
  res.json(rows);
});

router.post("/notifications", async (req: Request, res: Response) => {
  try {
    const d = clean(req.body);
    if (d.channels && typeof d.channels !== "string") d.channels = JSON.stringify(d.channels);
    const keys = Object.keys(d);
    const vals = Object.values(d);
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
    const text = `INSERT INTO crm_notifications (${keys.join(", ")}) VALUES (${placeholders}) RETURNING *`;
    const result = await db.execute({ text, values: vals } as any);
    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// סימון התראה כנקראה
router.put("/notifications/:id/read", async (_req: Request, res: Response) => {
  const result = await db.execute(sql`UPDATE crm_notifications SET read = true, read_at = NOW() WHERE id = ${Number(_req.params.id)} RETURNING *`);
  res.json((result.rows as any[])[0]);
});

// סימון כל ההתראות כנקראו
router.put("/notifications/read-all", async (req: Request, res: Response) => {
  const { target_user_id } = req.body;
  if (target_user_id) {
    await db.execute(sql`UPDATE crm_notifications SET read = true, read_at = NOW() WHERE target_user_id = ${target_user_id} AND read = false`);
  } else {
    await db.execute(sql`UPDATE crm_notifications SET read = true, read_at = NOW() WHERE read = false`);
  }
  res.json({ success: true });
});

// מחיקת התראה
router.delete("/notifications/:id", async (req: Request, res: Response) => {
  await q(sql`DELETE FROM crm_notifications WHERE id = ${Number(req.params.id)}`);
  res.json({ success: true });
});

// ============================================================================
// נקודות קצה מיוחדות - SPECIAL ENDPOINTS
// ============================================================================

// ============================================================================
// 2. GET /dashboard - דשבורד CRM מלא עם כל ה-KPIs
// ============================================================================
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    // סטטוסי לידים
    const leadsByStatus = await q(sql`
      SELECT status, COUNT(*) as count,
        COALESCE(SUM(estimated_budget), 0) as total_budget
      FROM crm_leads_ultimate
      GROUP BY status ORDER BY count DESC
    `);

    // סה"כ לידים
    const leadsTotals = await qOne(sql`
      SELECT
        COUNT(*) as total_leads,
        COUNT(*) FILTER(WHERE status = 'new') as new_leads,
        COUNT(*) FILTER(WHERE status IN ('call_scheduled','meeting_scheduled')) as active_leads,
        COUNT(*) FILTER(WHERE status = 'quote_sent') as quote_leads,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as closed_leads,
        COUNT(*) FILTER(WHERE status IN ('not_relevant','too_expensive','deal_lost')) as lost_leads,
        COUNT(*) FILTER(WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as leads_this_week,
        COUNT(*) FILTER(WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as leads_this_month,
        COUNT(*) FILTER(WHERE is_converted = true) as total_converted,
        COALESCE(AVG(response_time_minutes), 0) as avg_response_time,
        COALESCE(AVG(quality_score), 0) as avg_quality_score
      FROM crm_leads_ultimate
    `);

    // ביצועי סוכנים - סיכום
    const agentPerformance = await q(sql`
      SELECT
        a.id, a.full_name, a.role, a.territory,
        a.current_leads, a.current_meetings, a.current_closings,
        a.monthly_target, a.monthly_actual, a.conversion_rate,
        a.quality_score, a.risk_score, a.ranking, a.availability_status,
        COUNT(l.id) FILTER(WHERE l.status = 'new') as new_leads_count,
        COUNT(l.id) FILTER(WHERE l.status = 'deal_closed') as closed_deals_count
      FROM crm_agents a
      LEFT JOIN crm_leads_ultimate l ON l.assigned_agent_id = a.id
      WHERE a.is_active = true
      GROUP BY a.id ORDER BY a.ranking ASC NULLS LAST
    `);

    // ערך צינור מכירות - Pipeline
    const pipelineValue = await qOne(sql`
      SELECT
        COALESCE(SUM(total_with_vat) FILTER(WHERE status IN ('draft','sent','viewed','negotiating')), 0) as open_pipeline,
        COALESCE(SUM(total_with_vat) FILTER(WHERE status = 'approved'), 0) as won_pipeline,
        COALESCE(SUM(total_with_vat) FILTER(WHERE status = 'rejected'), 0) as lost_pipeline,
        COALESCE(SUM(total_with_vat) FILTER(WHERE status = 'expired'), 0) as expired_pipeline,
        COUNT(*) FILTER(WHERE status IN ('draft','sent','viewed','negotiating')) as open_quotes,
        COUNT(*) FILTER(WHERE status = 'approved') as won_quotes,
        COUNT(*) FILTER(WHERE status = 'rejected') as lost_quotes,
        COALESCE(AVG(total_with_vat) FILTER(WHERE status = 'approved'), 0) as avg_deal_size
      FROM crm_quotes
    `);

    // פגישות היום
    const todayMeetings = await q(sql`
      SELECT * FROM crm_meetings WHERE date = CURRENT_DATE ORDER BY start_time ASC
    `);

    // משימות היום
    const todayTasks = await q(sql`
      SELECT * FROM crm_tasks WHERE due_date = CURRENT_DATE AND status IN ('pending','in_progress') ORDER BY priority ASC
    `);

    // התראות לא נקראו
    const unreadAlerts = await q(sql`
      SELECT * FROM crm_notifications WHERE read = false ORDER BY severity DESC, created_at DESC LIMIT 20
    `);

    // משפך המרות
    const conversionFunnel = await qOne(sql`
      SELECT
        COUNT(*) as total_leads,
        COUNT(*) FILTER(WHERE status NOT IN ('new')) as contacted,
        COUNT(*) FILTER(WHERE status IN ('meeting_scheduled','quote_sent','deal_closed','think_about_it','return_later')) as had_meeting,
        COUNT(*) FILTER(WHERE status IN ('quote_sent','deal_closed','think_about_it','return_later')) as received_quote,
        COUNT(*) FILTER(WHERE status = 'deal_closed' OR is_converted = true) as closed_deal
      FROM crm_leads_ultimate
    `);

    // לידים לפי מקור
    const leadsBySource = await q(sql`
      SELECT source, COUNT(*) as count,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as closed,
        ROUND(COUNT(*) FILTER(WHERE status = 'deal_closed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as conversion_rate
      FROM crm_leads_ultimate WHERE source IS NOT NULL
      GROUP BY source ORDER BY count DESC
    `);

    // לידים לפי עיר
    const leadsByCity = await q(sql`
      SELECT city, COUNT(*) as count,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as closed,
        COALESCE(SUM(estimated_budget), 0) as total_budget
      FROM crm_leads_ultimate WHERE city IS NOT NULL
      GROUP BY city ORDER BY count DESC LIMIT 20
    `);

    // לידים לפי מוצר - מתוך JSONB
    const leadsByProduct = await q(sql`
      SELECT
        p->>'product' as product,
        COUNT(*) as count
      FROM crm_leads_ultimate, jsonb_array_elements(COALESCE(interested_products, '[]'::jsonb)) p
      GROUP BY p->>'product' ORDER BY count DESC
    `);

    // מגמות שבועיות - 12 שבועות אחרונים
    const weeklyTrends = await q(sql`
      SELECT
        DATE_TRUNC('week', created_at)::date as week,
        COUNT(*) as new_leads,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as closed_deals,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status = 'deal_closed'), 0) as revenue
      FROM crm_leads_ultimate
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 weeks'
      GROUP BY DATE_TRUNC('week', created_at) ORDER BY week ASC
    `);

    // מגמות חודשיות - 12 חודשים אחרונים
    const monthlyTrends = await q(sql`
      SELECT
        DATE_TRUNC('month', created_at)::date as month,
        COUNT(*) as new_leads,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as closed_deals,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status = 'deal_closed'), 0) as revenue
      FROM crm_leads_ultimate
      WHERE created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at) ORDER BY month ASC
    `);

    // משימות באיחור
    const overdueTasks = await q(sql`
      SELECT COUNT(*) as count FROM crm_tasks
      WHERE status IN ('pending','in_progress') AND due_date < CURRENT_DATE
    `);

    // חוזים ממתינים
    const pendingContracts = await q(sql`
      SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
      FROM crm_contracts WHERE status IN ('draft','pending_signature')
    `);

    res.json({
      leadsByStatus,
      leadsTotals,
      agentPerformance,
      pipelineValue,
      todayMeetings,
      todayTasks,
      unreadAlerts,
      conversionFunnel,
      leadsBySource,
      leadsByCity,
      leadsByProduct,
      weeklyTrends,
      monthlyTrends,
      overdueTasks: (overdueTasks[0] as any)?.count || 0,
      pendingContracts: pendingContracts[0] || { count: 0, total: 0 },
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 3. GET /agent-stats/:agentId - סטטיסטיקות מלאות לסוכן
// ============================================================================
router.get("/agent-stats/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = Number(req.params.agentId);
    const agent = await qOne(sql`SELECT * FROM crm_agents WHERE id = ${agentId}`);
    if (!agent) return res.status(404).json({ error: "סוכן לא נמצא" });

    // סיכום לידים
    const leadSummary = await qOne(sql`
      SELECT
        COUNT(*) as total_leads,
        COUNT(*) FILTER(WHERE status = 'new') as new_leads,
        COUNT(*) FILTER(WHERE status IN ('call_scheduled','meeting_scheduled')) as active_leads,
        COUNT(*) FILTER(WHERE status = 'quote_sent') as quote_leads,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as closed_leads,
        COUNT(*) FILTER(WHERE status IN ('not_relevant','too_expensive','deal_lost')) as lost_leads,
        COUNT(*) FILTER(WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as leads_this_month,
        COALESCE(AVG(response_time_minutes), 0) as avg_response_time,
        COALESCE(AVG(quality_score), 0) as avg_quality_score,
        COALESCE(AVG(conversion_probability), 0) as avg_conversion_probability
      FROM crm_leads_ultimate WHERE assigned_agent_id = ${agentId}
    `);

    // סיכום פגישות
    const meetingSummary = await qOne(sql`
      SELECT
        COUNT(*) as total_meetings,
        COUNT(*) FILTER(WHERE status = 'completed') as completed,
        COUNT(*) FILTER(WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER(WHERE status = 'no_show') as no_show,
        COUNT(*) FILTER(WHERE date >= CURRENT_DATE AND status IN ('scheduled','confirmed')) as upcoming,
        COUNT(*) FILTER(WHERE date >= DATE_TRUNC('month', CURRENT_DATE)) as meetings_this_month,
        COALESCE(SUM(quote_amount) FILTER(WHERE outcome = 'quote_requested'), 0) as meeting_quote_total
      FROM crm_meetings WHERE agent_id = ${agentId}
    `);

    // סיכום הצעות מחיר
    const quoteSummary = await qOne(sql`
      SELECT
        COUNT(*) as total_quotes,
        COALESCE(SUM(total_with_vat), 0) as total_value,
        COUNT(*) FILTER(WHERE status = 'approved') as approved,
        COALESCE(SUM(total_with_vat) FILTER(WHERE status = 'approved'), 0) as approved_value,
        COUNT(*) FILTER(WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER(WHERE status IN ('draft','sent','viewed','negotiating')) as pending,
        COALESCE(AVG(total_with_vat), 0) as avg_quote_value,
        COALESCE(AVG(discount_percent), 0) as avg_discount
      FROM crm_quotes WHERE agent_id = ${agentId}
    `);

    // סיכום חוזים
    const contractSummary = await qOne(sql`
      SELECT
        COUNT(*) as total_contracts,
        COALESCE(SUM(total_amount), 0) as total_value,
        COUNT(*) FILTER(WHERE status = 'signed' OR status = 'active') as active_contracts,
        COALESCE(SUM(total_amount) FILTER(WHERE status = 'signed' OR status = 'active'), 0) as active_value
      FROM crm_contracts WHERE agent_id = ${agentId}
    `);

    // סטטיסטיקות יומיות - 30 ימים אחרונים
    const dailyStats = await q(sql`
      SELECT * FROM crm_agent_daily_stats WHERE agent_id = ${agentId}
      AND stat_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY stat_date DESC
    `);

    // משימות פתוחות
    const openTasks = await q(sql`
      SELECT * FROM crm_tasks WHERE assigned_to_id = ${agentId} AND status IN ('pending','in_progress')
      ORDER BY CASE WHEN priority='critical' THEN 1 WHEN priority='high' THEN 2 WHEN priority='medium' THEN 3 ELSE 4 END, due_date ASC NULLS LAST
    `);

    // יחס המרה
    const totalLeads = Number((leadSummary as any)?.total_leads || 0);
    const closedLeads = Number((leadSummary as any)?.closed_leads || 0);
    const conversionRate = totalLeads > 0 ? Math.round((closedLeads / totalLeads) * 10000) / 100 : 0;

    res.json({
      agent,
      leadSummary,
      meetingSummary,
      quoteSummary,
      contractSummary,
      dailyStats,
      openTasks,
      conversionRate,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 4. GET /agent-ranking - דירוג סוכנים (לידרבורד)
// ============================================================================
router.get("/agent-ranking", async (_req: Request, res: Response) => {
  try {
    const agents = await q(sql`
      SELECT
        a.id, a.full_name, a.role, a.territory, a.phone,
        a.monthly_target, a.monthly_actual, a.conversion_rate,
        a.quality_score, a.risk_score, a.avg_deal_size,
        a.total_revenue, a.total_commission, a.availability_status,
        COUNT(DISTINCT l.id) FILTER(WHERE l.status = 'deal_closed') as deals_closed,
        COUNT(DISTINCT l.id) FILTER(WHERE l.status NOT IN ('deal_closed','not_relevant','deal_lost')) as active_leads,
        COUNT(DISTINCT m.id) FILTER(WHERE m.status = 'completed' AND m.date >= DATE_TRUNC('month', CURRENT_DATE)) as meetings_this_month,
        COALESCE(SUM(q.total_with_vat) FILTER(WHERE q.status = 'approved'), 0) as revenue_this_period,
        COALESCE(AVG(l.response_time_minutes), 999) as avg_response_time
      FROM crm_agents a
      LEFT JOIN crm_leads_ultimate l ON l.assigned_agent_id = a.id
      LEFT JOIN crm_meetings m ON m.agent_id = a.id
      LEFT JOIN crm_quotes q ON q.agent_id = a.id
      WHERE a.is_active = true
      GROUP BY a.id
    `);

    // חישוב ציון מורכב לדירוג
    const ranked = (agents as any[]).map((ag) => {
      const closingScore = Number(ag.deals_closed || 0) * 30;
      const revenueScore = Math.min(Number(ag.revenue_this_period || 0) / 10000, 25);
      const qualityScore = Number(ag.quality_score || 0) * 0.2;
      const responseScore = Math.max(0, 15 - Number(ag.avg_response_time || 999) / 60);
      const meetingScore = Number(ag.meetings_this_month || 0) * 5;
      const targetPct = Number(ag.monthly_target) > 0
        ? (Number(ag.monthly_actual) / Number(ag.monthly_target)) * 10
        : 0;
      const compositeScore = Math.round(closingScore + revenueScore + qualityScore + responseScore + meetingScore + targetPct);

      return {
        ...ag,
        composite_score: compositeScore,
        target_achievement: Number(ag.monthly_target) > 0
          ? Math.round((Number(ag.monthly_actual) / Number(ag.monthly_target)) * 100)
          : 0,
      };
    }).sort((a, b) => b.composite_score - a.composite_score);

    // הוספת דירוג
    ranked.forEach((ag, i) => { ag.rank = i + 1; });

    res.json(ranked);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 5. GET /agent-risk/:agentId - הערכת סיכון סוכן
// ============================================================================
router.get("/agent-risk/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = Number(req.params.agentId);
    const agent = await qOne(sql`SELECT * FROM crm_agents WHERE id = ${agentId}`);
    if (!agent) return res.status(404).json({ error: "סוכן לא נמצא" });

    // לידים לא מטופלים - ליד חדש ללא פעילות מעל 24 שעות
    const unhandledLeads = await q(sql`
      SELECT id, lead_number, full_name, phone, created_at FROM crm_leads_ultimate
      WHERE assigned_agent_id = ${agentId} AND status = 'new' AND first_contact_date IS NULL
      AND created_at < NOW() - INTERVAL '24 hours' ORDER BY created_at ASC
    `);

    // לידים "שורפים" - ליד ללא מעקב מעל שבוע
    const burningLeads = await q(sql`
      SELECT id, lead_number, full_name, phone, last_contact_date, status FROM crm_leads_ultimate
      WHERE assigned_agent_id = ${agentId}
        AND status NOT IN ('deal_closed','not_relevant','deal_lost')
        AND (last_contact_date < NOW() - INTERVAL '7 days' OR last_contact_date IS NULL)
      ORDER BY last_contact_date ASC NULLS FIRST
    `);

    // פגישות שבוטלו / לא הגיע
    const failedMeetings = await q(sql`
      SELECT COUNT(*) FILTER(WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER(WHERE status = 'no_show') as no_show,
        COUNT(*) as total
      FROM crm_meetings WHERE agent_id = ${agentId}
      AND date >= CURRENT_DATE - INTERVAL '30 days'
    `);

    // משימות באיחור
    const overdueTasks = await q(sql`
      SELECT id, title, due_date, priority FROM crm_tasks
      WHERE assigned_to_id = ${agentId} AND status IN ('pending','in_progress')
      AND due_date < CURRENT_DATE ORDER BY due_date ASC
    `);

    // הצעות מחיר שפג תוקפן
    const expiredQuotes = await q(sql`
      SELECT id, quote_number, customer_name, total_with_vat, valid_until FROM crm_quotes
      WHERE agent_id = ${agentId} AND status IN ('sent','viewed') AND valid_until < CURRENT_DATE
    `);

    // חישוב ציון סיכון מורכב (0-100)
    const riskFactors = {
      unhandled_leads: unhandledLeads.length * 15,
      burning_leads: Math.min(burningLeads.length * 8, 30),
      overdue_tasks: Math.min(overdueTasks.length * 10, 25),
      expired_quotes: expiredQuotes.length * 5,
      failed_meetings_rate: failedMeetings.length > 0
        ? Math.round((Number((failedMeetings[0] as any)?.cancelled || 0) + Number((failedMeetings[0] as any)?.no_show || 0)) / Math.max(Number((failedMeetings[0] as any)?.total || 1), 1) * 15)
        : 0,
    };
    const totalRisk = Math.min(Object.values(riskFactors).reduce((a, b) => a + b, 0), 100);

    // רמת סיכון
    const riskLevel = totalRisk >= 70 ? "critical" : totalRisk >= 40 ? "warning" : "healthy";

    // המלצות
    const recommendations: string[] = [];
    if (unhandledLeads.length > 0) recommendations.push(`יש ${unhandledLeads.length} לידים חדשים שלא טופלו - יש לפנות אליהם מיידית!`);
    if (burningLeads.length > 0) recommendations.push(`יש ${burningLeads.length} לידים ללא מעקב מעל שבוע - לתזמן מעקב דחוף`);
    if (overdueTasks.length > 0) recommendations.push(`יש ${overdueTasks.length} משימות באיחור - יש לטפל בהן היום`);
    if (expiredQuotes.length > 0) recommendations.push(`יש ${expiredQuotes.length} הצעות מחיר שפג תוקפן - יש ליצור הצעות חדשות`);

    res.json({
      agent: { id: (agent as any).id, full_name: (agent as any).full_name, role: (agent as any).role },
      risk_score: totalRisk,
      risk_level: riskLevel,
      risk_factors: riskFactors,
      recommendations,
      details: {
        unhandledLeads,
        burningLeads,
        overdueTasks,
        expiredQuotes,
        failedMeetings: failedMeetings[0],
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 6. POST /assign-lead - הקצאת ליד לסוכן (ידני או עגול)
// ============================================================================
router.post("/assign-lead", async (req: Request, res: Response) => {
  try {
    const { lead_id, agent_id, method } = req.body; // method: 'manual' | 'round_robin' | 'territory' | 'load_balance'

    let selectedAgentId = agent_id;

    if (!selectedAgentId || method !== "manual") {
      // חלוקה עגולה - הסוכן עם הכי פחות לידים פעילים
      if (method === "load_balance" || !method) {
        const agentRow = await qOne(sql`
          SELECT a.id, a.full_name FROM crm_agents a
          WHERE a.is_active = true AND a.availability_status = 'available'
          ORDER BY a.current_leads ASC, a.last_activity ASC NULLS FIRST
          LIMIT 1
        `);
        if (agentRow) selectedAgentId = (agentRow as any).id;
      }
      // לפי טריטוריה - מחפש סוכן שמכסה את העיר
      else if (method === "territory") {
        const lead = await qOne(sql`SELECT city FROM crm_leads_ultimate WHERE id = ${lead_id}`);
        if (lead && (lead as any).city) {
          const agentRow = await qOne(sql`
            SELECT id, full_name FROM crm_agents
            WHERE is_active = true AND availability_status = 'available'
            AND (territory_cities @> ${JSON.stringify([(lead as any).city])}::jsonb OR territory = ${(lead as any).city})
            ORDER BY current_leads ASC LIMIT 1
          `);
          if (agentRow) selectedAgentId = (agentRow as any).id;
        }
      }
      // רובין עגול
      else if (method === "round_robin") {
        const agentRow = await qOne(sql`
          SELECT id, full_name FROM crm_agents
          WHERE is_active = true AND availability_status = 'available'
          ORDER BY last_activity ASC NULLS FIRST, current_leads ASC
          LIMIT 1
        `);
        if (agentRow) selectedAgentId = (agentRow as any).id;
      }
    }

    if (!selectedAgentId) return res.status(400).json({ error: "לא נמצא סוכן זמין" });

    // שליפת שם הסוכן
    const agentInfo = await qOne(sql`SELECT full_name FROM crm_agents WHERE id = ${selectedAgentId}`);
    const agentName = (agentInfo as any)?.full_name || "לא ידוע";

    // עדכון הליד
    await db.execute(sql`
      UPDATE crm_leads_ultimate SET
        assigned_agent_id = ${selectedAgentId},
        assigned_agent_name = ${agentName},
        assignment_date = NOW(),
        updated_at = NOW()
      WHERE id = ${lead_id}
    `);

    // עדכון מונה לידים של הסוכן
    await db.execute(sql`
      UPDATE crm_agents SET
        current_leads = current_leads + 1,
        last_activity = NOW(),
        updated_at = NOW()
      WHERE id = ${selectedAgentId}
    `);

    // יצירת פעילות ביומן
    await db.execute(sql`
      INSERT INTO crm_lead_activities (lead_id, activity_type, description, performed_by, performed_at)
      VALUES (${lead_id}, 'status_change', ${'ליד הוקצה לסוכן: ' + agentName}, 'מערכת', NOW())
    `);

    // יצירת משימה אוטומטית - התקשרות ראשונית
    const taskNum = await nextNumber("TSK");
    await db.execute(sql`
      INSERT INTO crm_tasks (task_number, title, task_type, priority, lead_id, assigned_to_id, assigned_to_name, assigned_by, due_date, sla_hours, auto_created, auto_trigger, status)
      VALUES (${taskNum}, 'התקשרות ראשונית לליד חדש', 'call', 'high', ${lead_id}, ${selectedAgentId}, ${agentName}, 'מערכת', CURRENT_DATE, 2, true, 'lead_assignment', 'pending')
    `);

    res.json({
      success: true,
      lead_id,
      agent_id: selectedAgentId,
      agent_name: agentName,
      method: method || "load_balance",
      message: `ליד ${lead_id} הוקצה לסוכן ${agentName}`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 7. POST /convert-lead/:leadId - המרת ליד ללקוח
// ============================================================================
router.post("/convert-lead/:leadId", async (req: Request, res: Response) => {
  try {
    const leadId = Number(req.params.leadId);
    const { customer_id, converted_by } = req.body;

    const lead = await qOne(sql`SELECT * FROM crm_leads_ultimate WHERE id = ${leadId}`);
    if (!lead) return res.status(404).json({ error: "ליד לא נמצא" });
    if ((lead as any).is_converted) return res.status(400).json({ error: "ליד כבר הומר ללקוח" });

    // עדכון הליד כהומר
    await db.execute(sql`
      UPDATE crm_leads_ultimate SET
        status = 'deal_closed',
        is_converted = true,
        converted_to_customer_id = ${customer_id || null},
        converted_at = NOW(),
        updated_at = NOW()
      WHERE id = ${leadId}
    `);

    // עדכון מונה סגירות של הסוכן
    if ((lead as any).assigned_agent_id) {
      await db.execute(sql`
        UPDATE crm_agents SET
          current_closings = current_closings + 1,
          last_activity = NOW(),
          updated_at = NOW()
        WHERE id = ${(lead as any).assigned_agent_id}
      `);
    }

    // רישום פעילות
    await db.execute(sql`
      INSERT INTO crm_lead_activities (lead_id, activity_type, description, performed_by, performed_at)
      VALUES (${leadId}, 'status_change', 'ליד הומר ללקוח בהצלחה!', ${converted_by || 'מערכת'}, NOW())
    `);

    // יצירת התראה חיובית
    await db.execute(sql`
      INSERT INTO crm_notifications (notification_type, severity, title, message, lead_id, agent_id, auto_generated)
      VALUES ('deal_closed', 'info', ${'עסקה נסגרה! ' + (lead as any).full_name}, ${'ליד ' + (lead as any).lead_number + ' הומר ללקוח בהצלחה'}, ${leadId}, ${(lead as any).assigned_agent_id}, true)
    `);

    res.json({
      success: true,
      lead_id: leadId,
      customer_id,
      message: `ליד ${(lead as any).full_name} הומר ללקוח בהצלחה!`,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 8. GET /pipeline - צינור מכירות עם שלבים וסכומים
// ============================================================================
router.get("/pipeline", async (_req: Request, res: Response) => {
  try {
    // שלבי צינור מכירות
    const stages = await q(sql`
      SELECT
        CASE
          WHEN status = 'new' THEN '1_new'
          WHEN status = 'call_scheduled' THEN '2_call_scheduled'
          WHEN status = 'meeting_scheduled' THEN '3_meeting'
          WHEN status = 'quote_sent' THEN '4_quote'
          WHEN status IN ('think_about_it','return_later') THEN '5_negotiating'
          WHEN status = 'deal_closed' THEN '6_closed_won'
          WHEN status IN ('not_relevant','too_expensive','deal_lost') THEN '7_closed_lost'
          ELSE '0_other'
        END as stage,
        status,
        COUNT(*) as count,
        COALESCE(SUM(estimated_budget), 0) as total_value,
        COALESCE(AVG(estimated_budget), 0) as avg_value,
        COALESCE(AVG(conversion_probability), 0) as avg_probability,
        COALESCE(SUM(estimated_budget * COALESCE(conversion_probability, 50) / 100), 0) as weighted_value
      FROM crm_leads_ultimate
      GROUP BY stage, status ORDER BY stage ASC
    `);

    // סיכום הצינור
    const pipelineSummary = await qOne(sql`
      SELECT
        COUNT(*) FILTER(WHERE status NOT IN ('deal_closed','not_relevant','too_expensive','deal_lost')) as open_leads,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status NOT IN ('deal_closed','not_relevant','too_expensive','deal_lost')), 0) as open_value,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as won_count,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status = 'deal_closed'), 0) as won_value,
        COUNT(*) FILTER(WHERE status IN ('not_relevant','too_expensive','deal_lost')) as lost_count,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status IN ('not_relevant','too_expensive','deal_lost')), 0) as lost_value
      FROM crm_leads_ultimate
    `);

    // הצעות מחיר פעילות
    const activeQuotes = await q(sql`
      SELECT status, COUNT(*) as count,
        COALESCE(SUM(total_with_vat), 0) as total_value
      FROM crm_quotes
      WHERE status NOT IN ('rejected','expired','converted')
      GROUP BY status ORDER BY status
    `);

    res.json({ stages, pipelineSummary, activeQuotes });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 9. GET /lead-alerts - התראות לידים: לא מטופלים, מעקב באיחור, הפרת SLA
// ============================================================================
router.get("/lead-alerts", async (_req: Request, res: Response) => {
  try {
    // לידים חדשים לא מטופלים (מעל שעה)
    const unhandled = await q(sql`
      SELECT id, lead_number, full_name, phone, mobile, source, city, urgency, created_at, assigned_agent_name,
        EXTRACT(EPOCH FROM (NOW() - created_at)) / 60 as minutes_since_creation
      FROM crm_leads_ultimate
      WHERE status = 'new' AND first_contact_date IS NULL
      AND created_at < NOW() - INTERVAL '1 hour'
      ORDER BY urgency DESC, created_at ASC
    `);

    // מעקבים באיחור
    const overdueFollowUps = await q(sql`
      SELECT id, lead_number, full_name, phone, mobile, next_follow_up, assigned_agent_name, status,
        (CURRENT_DATE - next_follow_up) as days_overdue
      FROM crm_leads_ultimate
      WHERE next_follow_up < CURRENT_DATE
      AND status NOT IN ('deal_closed','not_relevant','deal_lost')
      ORDER BY next_follow_up ASC
    `);

    // הפרות SLA - משימות שעברו את מגבלת השעות
    const slaBreaches = await q(sql`
      SELECT t.id, t.task_number, t.title, t.sla_hours, t.assigned_to_name, t.due_date, t.created_at,
        EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600 as hours_since_creation
      FROM crm_tasks t
      WHERE t.sla_hours IS NOT NULL
      AND t.status IN ('pending','in_progress')
      AND EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600 > t.sla_hours
      ORDER BY t.created_at ASC
    `);

    // לידים "שורפים" - ללא מעקב מעל 5 ימים
    const burningLeads = await q(sql`
      SELECT id, lead_number, full_name, phone, last_contact_date, assigned_agent_name, status, estimated_budget,
        (CURRENT_DATE - last_contact_date::date) as days_since_contact
      FROM crm_leads_ultimate
      WHERE status NOT IN ('deal_closed','not_relevant','deal_lost')
      AND (last_contact_date < NOW() - INTERVAL '5 days' OR (last_contact_date IS NULL AND created_at < NOW() - INTERVAL '2 days'))
      ORDER BY estimated_budget DESC NULLS LAST
    `);

    // הצעות מחיר שעומדות לפוג
    const expiringQuotes = await q(sql`
      SELECT id, quote_number, customer_name, total_with_vat, valid_until, agent_name,
        (valid_until - CURRENT_DATE) as days_until_expiry
      FROM crm_quotes
      WHERE status IN ('sent','viewed','negotiating')
      AND valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
      ORDER BY valid_until ASC
    `);

    const totalAlerts = unhandled.length + overdueFollowUps.length + slaBreaches.length + burningLeads.length + expiringQuotes.length;

    res.json({
      totalAlerts,
      critical: unhandled.length + slaBreaches.length,
      warning: overdueFollowUps.length + burningLeads.length,
      info: expiringQuotes.length,
      unhandled,
      overdueFollowUps,
      slaBreaches,
      burningLeads,
      expiringQuotes,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 10. GET /agent-location-map - מיקום נוכחי של כל הסוכנים
// ============================================================================
router.get("/agent-location-map", async (_req: Request, res: Response) => {
  try {
    const agents = await q(sql`
      SELECT
        a.id, a.full_name, a.phone, a.role, a.territory,
        a.last_location_lat as lat, a.last_location_lng as lng,
        a.last_location_time, a.availability_status,
        a.current_leads, a.current_meetings,
        (SELECT activity FROM crm_agent_locations WHERE agent_id = a.id ORDER BY timestamp DESC LIMIT 1) as last_activity_type,
        (SELECT address FROM crm_agent_locations WHERE agent_id = a.id ORDER BY timestamp DESC LIMIT 1) as last_address
      FROM crm_agents a
      WHERE a.is_active = true AND a.last_location_lat IS NOT NULL
      ORDER BY a.full_name
    `);

    // פגישות היום של כל הסוכנים (לשכבת מפה)
    const todayMeetings = await q(sql`
      SELECT m.*, a.full_name as agent_full_name FROM crm_meetings m
      LEFT JOIN crm_agents a ON a.id = m.agent_id
      WHERE m.date = CURRENT_DATE AND m.gps_lat IS NOT NULL
      ORDER BY m.start_time ASC
    `);

    res.json({ agents, todayMeetings });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 11. POST /log-activity - רישום פעילות כללית (שיחה, פגישה, וכו')
// ============================================================================
router.post("/log-activity", async (req: Request, res: Response) => {
  try {
    const {
      lead_id, activity_type, description, outcome, duration_minutes,
      call_recording_url, call_transcript, location, gps_lat, gps_lng,
      performed_by, next_action, next_action_date, attachments, metadata,
    } = req.body;

    const result = await db.execute(sql`
      INSERT INTO crm_lead_activities (
        lead_id, activity_type, description, outcome, duration_minutes,
        call_recording_url, call_transcript, location, gps_lat, gps_lng,
        performed_by, performed_at, next_action, next_action_date,
        attachments, metadata
      ) VALUES (
        ${lead_id}, ${activity_type}, ${description}, ${outcome || null}, ${duration_minutes || null},
        ${call_recording_url || null}, ${call_transcript || null}, ${location || null}, ${gps_lat || null}, ${gps_lng || null},
        ${performed_by || null}, NOW(), ${next_action || null}, ${next_action_date || null},
        ${JSON.stringify(attachments || [])}::jsonb, ${JSON.stringify(metadata || {})}::jsonb
      ) RETURNING *
    `);

    // עדכון ליד - תאריך קשר אחרון + מעקב הבא
    if (lead_id) {
      await db.execute(sql`
        UPDATE crm_leads_ultimate SET
          last_contact_date = NOW(),
          follow_up_count = follow_up_count + 1,
          next_follow_up = ${next_action_date || null},
          updated_at = NOW()
        WHERE id = ${lead_id}
      `);
      // עדכון תאריך קשר ראשון אם חסר
      await db.execute(sql`
        UPDATE crm_leads_ultimate SET first_contact_date = NOW()
        WHERE id = ${lead_id} AND first_contact_date IS NULL
      `);

      // חישוב זמן תגובה אם זו הפעילות הראשונה
      await db.execute(sql`
        UPDATE crm_leads_ultimate SET
          response_time_minutes = EXTRACT(EPOCH FROM (NOW() - created_at)) / 60
        WHERE id = ${lead_id} AND response_time_minutes IS NULL
      `);
    }

    // אם יש פעולה הבאה - יצירת משימה אוטומטית
    if (next_action && lead_id) {
      const taskNum = await nextNumber("TSK");
      await db.execute(sql`
        INSERT INTO crm_tasks (task_number, title, task_type, lead_id, assigned_to_name, due_date, auto_created, auto_trigger, status)
        VALUES (${taskNum}, ${next_action}, 'follow_up', ${lead_id}, ${performed_by || null}, ${next_action_date || null}, true, ${'activity_' + activity_type}, 'pending')
      `);
    }

    res.json((result.rows as any[])[0]);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 12. GET /conversion-funnel - ניתוח משפך המרות מלא
// ============================================================================
router.get("/conversion-funnel", async (req: Request, res: Response) => {
  try {
    const { date_from, date_to, agent_id, source } = req.query;
    let dateFilter = "";
    if (date_from) dateFilter += ` AND created_at >= '${date_from}'`;
    if (date_to) dateFilter += ` AND created_at <= '${date_to}'`;
    let agentFilter = "";
    if (agent_id) agentFilter = ` AND assigned_agent_id = ${agent_id}`;
    let sourceFilter = "";
    if (source) sourceFilter = ` AND source = '${source}'`;

    const where = `WHERE 1=1 ${dateFilter} ${agentFilter} ${sourceFilter}`;

    const funnel = await qOne(sql.raw(`
      SELECT
        COUNT(*) as total_leads,
        COUNT(*) FILTER(WHERE first_contact_date IS NOT NULL) as contacted,
        COUNT(*) FILTER(WHERE status IN ('meeting_scheduled','quote_sent','deal_closed','think_about_it','return_later')) as had_meeting,
        COUNT(*) FILTER(WHERE status IN ('quote_sent','deal_closed','think_about_it','return_later')) as received_quote,
        COUNT(*) FILTER(WHERE status = 'deal_closed' OR is_converted = true) as closed_deal,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status = 'deal_closed'), 0) as closed_revenue,
        COALESCE(AVG(estimated_budget) FILTER(WHERE status = 'deal_closed'), 0) as avg_deal_size,
        COALESCE(AVG(response_time_minutes), 0) as avg_response_time,
        COALESCE(AVG(follow_up_count) FILTER(WHERE status = 'deal_closed'), 0) as avg_followups_to_close
      FROM crm_leads_ultimate ${where}
    `));

    // חישוב אחוזי המרה בין שלבים
    const total = Number((funnel as any)?.total_leads || 0);
    const contacted = Number((funnel as any)?.contacted || 0);
    const hadMeeting = Number((funnel as any)?.had_meeting || 0);
    const receivedQuote = Number((funnel as any)?.received_quote || 0);
    const closedDeal = Number((funnel as any)?.closed_deal || 0);

    const rates = {
      lead_to_contact: total > 0 ? Math.round((contacted / total) * 100) : 0,
      contact_to_meeting: contacted > 0 ? Math.round((hadMeeting / contacted) * 100) : 0,
      meeting_to_quote: hadMeeting > 0 ? Math.round((receivedQuote / hadMeeting) * 100) : 0,
      quote_to_close: receivedQuote > 0 ? Math.round((closedDeal / receivedQuote) * 100) : 0,
      overall_conversion: total > 0 ? Math.round((closedDeal / total) * 100) : 0,
    };

    // זמן ממוצע בין שלבים
    const avgTimes = await qOne(sql.raw(`
      SELECT
        COALESCE(AVG(EXTRACT(EPOCH FROM (first_contact_date - created_at)) / 3600), 0) as avg_hours_to_contact,
        COALESCE(AVG(EXTRACT(EPOCH FROM (converted_at - created_at)) / 86400) FILTER(WHERE is_converted = true), 0) as avg_days_to_close
      FROM crm_leads_ultimate ${where}
    `));

    // משפך לפי מקור
    const funnelBySource = await q(sql.raw(`
      SELECT
        source,
        COUNT(*) as total,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as closed,
        ROUND(COUNT(*) FILTER(WHERE status = 'deal_closed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as conversion_rate,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status = 'deal_closed'), 0) as revenue
      FROM crm_leads_ultimate ${where} AND source IS NOT NULL
      GROUP BY source ORDER BY conversion_rate DESC
    `));

    res.json({
      funnel,
      rates,
      avgTimes,
      funnelBySource,
      stages: [
        { name: "לידים חדשים", count: total, percentage: 100 },
        { name: "יצרו קשר", count: contacted, percentage: rates.lead_to_contact },
        { name: "פגישה", count: hadMeeting, percentage: total > 0 ? Math.round((hadMeeting / total) * 100) : 0 },
        { name: "הצעת מחיר", count: receivedQuote, percentage: total > 0 ? Math.round((receivedQuote / total) * 100) : 0 },
        { name: "עסקה סגורה", count: closedDeal, percentage: rates.overall_conversion },
      ],
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 13. GET /leads-by-source - ניתוח לידים לפי מקור
// ============================================================================
router.get("/leads-by-source", async (_req: Request, res: Response) => {
  try {
    const data = await q(sql`
      SELECT
        COALESCE(source, 'לא ידוע') as source,
        COUNT(*) as total,
        COUNT(*) FILTER(WHERE status = 'new') as new_count,
        COUNT(*) FILTER(WHERE status IN ('call_scheduled','meeting_scheduled')) as active_count,
        COUNT(*) FILTER(WHERE status = 'quote_sent') as quote_count,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as closed_count,
        COUNT(*) FILTER(WHERE status IN ('not_relevant','too_expensive','deal_lost')) as lost_count,
        ROUND(COUNT(*) FILTER(WHERE status = 'deal_closed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as conversion_rate,
        COALESCE(SUM(estimated_budget), 0) as total_budget,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status = 'deal_closed'), 0) as closed_revenue,
        COALESCE(AVG(estimated_budget), 0) as avg_budget,
        COALESCE(AVG(response_time_minutes), 0) as avg_response_time,
        COALESCE(AVG(quality_score), 0) as avg_quality
      FROM crm_leads_ultimate
      GROUP BY source ORDER BY total DESC
    `);

    // סיכום כולל
    const summary = await qOne(sql`
      SELECT COUNT(*) as total, COUNT(DISTINCT source) as unique_sources FROM crm_leads_ultimate
    `);

    // מגמה חודשית לפי מקור - 6 חודשים אחרונים
    const monthlyBySource = await q(sql`
      SELECT
        DATE_TRUNC('month', created_at)::date as month,
        source,
        COUNT(*) as count
      FROM crm_leads_ultimate
      WHERE created_at >= CURRENT_DATE - INTERVAL '6 months' AND source IS NOT NULL
      GROUP BY month, source ORDER BY month ASC, count DESC
    `);

    res.json({ data, summary, monthlyBySource });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 14. GET /leads-by-city - ניתוח גיאוגרפי לפי עיר
// ============================================================================
router.get("/leads-by-city", async (_req: Request, res: Response) => {
  try {
    const data = await q(sql`
      SELECT
        COALESCE(city, 'לא ידוע') as city,
        COUNT(*) as total,
        COUNT(*) FILTER(WHERE status = 'deal_closed') as closed_count,
        COUNT(*) FILTER(WHERE status IN ('not_relevant','too_expensive','deal_lost')) as lost_count,
        ROUND(COUNT(*) FILTER(WHERE status = 'deal_closed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as conversion_rate,
        COALESCE(SUM(estimated_budget), 0) as total_budget,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status = 'deal_closed'), 0) as closed_revenue,
        COALESCE(AVG(estimated_budget), 0) as avg_budget,
        COUNT(DISTINCT assigned_agent_id) as agents_count,
        STRING_AGG(DISTINCT source, ', ') as sources
      FROM crm_leads_ultimate
      GROUP BY city ORDER BY total DESC
    `);

    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 15. GET /leads-by-product - ניתוח לפי מוצר/התעניינות
// ============================================================================
router.get("/leads-by-product", async (_req: Request, res: Response) => {
  try {
    const data = await q(sql`
      SELECT
        p->>'product' as product,
        COUNT(*) as total_leads,
        COUNT(*) FILTER(WHERE l.status = 'deal_closed') as closed_count,
        ROUND(COUNT(*) FILTER(WHERE l.status = 'deal_closed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) as conversion_rate,
        COALESCE(SUM((p->>'sqm')::numeric), 0) as total_sqm,
        COALESCE(AVG((p->>'sqm')::numeric), 0) as avg_sqm,
        COALESCE(SUM(l.estimated_budget) FILTER(WHERE l.status = 'deal_closed'), 0) as closed_revenue
      FROM crm_leads_ultimate l,
        jsonb_array_elements(COALESCE(l.interested_products, '[]'::jsonb)) p
      GROUP BY p->>'product' ORDER BY total_leads DESC
    `);

    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 16. GET /daily-report/:agentId - דוח יומי לסוכן
// ============================================================================
router.get("/daily-report/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = Number(req.params.agentId);
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

    const agent = await qOne(sql`SELECT id, full_name, role, territory FROM crm_agents WHERE id = ${agentId}`);
    if (!agent) return res.status(404).json({ error: "סוכן לא נמצא" });

    // סטטיסטיקות יומיות קיימות
    const stats = await qOne(sql`SELECT * FROM crm_agent_daily_stats WHERE agent_id = ${agentId} AND stat_date = ${date}`);

    // לידים שנכנסו היום
    const newLeads = await q(sql`
      SELECT id, lead_number, full_name, phone, source, city, urgency, status
      FROM crm_leads_ultimate
      WHERE assigned_agent_id = ${agentId} AND created_at::date = ${date}::date
      ORDER BY created_at DESC
    `);

    // פעילויות היום
    const activities = await q(sql`
      SELECT * FROM crm_lead_activities
      WHERE performed_by = (SELECT full_name FROM crm_agents WHERE id = ${agentId})
      AND performed_at::date = ${date}::date
      ORDER BY performed_at DESC
    `);

    // פגישות היום
    const meetings = await q(sql`
      SELECT * FROM crm_meetings WHERE agent_id = ${agentId} AND date = ${date}::date
      ORDER BY start_time ASC
    `);

    // הצעות מחיר שנשלחו היום
    const quotesSent = await q(sql`
      SELECT * FROM crm_quotes WHERE agent_id = ${agentId} AND created_at::date = ${date}::date
      ORDER BY created_at DESC
    `);

    // משימות ליום
    const tasks = await q(sql`
      SELECT * FROM crm_tasks WHERE assigned_to_id = ${agentId} AND due_date = ${date}::date
      ORDER BY priority ASC
    `);

    // חישוב סיכום יומי מחושב בזמן אמת
    const liveSummary = {
      new_leads: newLeads.length,
      activities_count: activities.length,
      calls: activities.filter((a: any) => a.activity_type === "call_out" || a.activity_type === "call_in").length,
      meetings_scheduled: meetings.filter((m: any) => m.status === "scheduled" || m.status === "confirmed").length,
      meetings_completed: meetings.filter((m: any) => m.status === "completed").length,
      quotes_sent: quotesSent.length,
      quotes_total: quotesSent.reduce((sum: number, q: any) => sum + Number(q.total_with_vat || 0), 0),
      tasks_pending: tasks.filter((t: any) => t.status === "pending").length,
      tasks_completed: tasks.filter((t: any) => t.status === "completed").length,
    };

    res.json({
      agent,
      date,
      stats,
      liveSummary,
      newLeads,
      activities,
      meetings,
      quotesSent,
      tasks,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 17. GET /manager-dashboard - מגדל פיקוד למנהל עם כל ההתראות
// ============================================================================
router.get("/manager-dashboard", async (_req: Request, res: Response) => {
  try {
    // סיכום כללי
    const overallSummary = await qOne(sql`
      SELECT
        COUNT(*) as total_leads,
        COUNT(*) FILTER(WHERE status = 'new') as new_leads,
        COUNT(*) FILTER(WHERE status = 'new' AND first_contact_date IS NULL AND created_at < NOW() - INTERVAL '1 hour') as unhandled_leads,
        COUNT(*) FILTER(WHERE status = 'deal_closed' AND converted_at >= DATE_TRUNC('month', CURRENT_DATE)) as closed_this_month,
        COALESCE(SUM(estimated_budget) FILTER(WHERE status = 'deal_closed' AND converted_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) as revenue_this_month,
        COUNT(*) FILTER(WHERE next_follow_up < CURRENT_DATE AND status NOT IN ('deal_closed','not_relevant','deal_lost')) as overdue_followups,
        COUNT(DISTINCT assigned_agent_id) FILTER(WHERE status NOT IN ('deal_closed','not_relevant','deal_lost')) as active_agents
      FROM crm_leads_ultimate
    `);

    // סטטוס סוכנים
    const agentStatus = await q(sql`
      SELECT
        a.id, a.full_name, a.role, a.availability_status,
        a.current_leads, a.current_closings, a.monthly_target, a.monthly_actual,
        a.quality_score, a.risk_score, a.conversion_rate,
        a.last_location_lat, a.last_location_lng, a.last_activity,
        ROUND(CASE WHEN a.monthly_target > 0 THEN (a.monthly_actual / a.monthly_target * 100) ELSE 0 END, 0) as target_pct
      FROM crm_agents a WHERE a.is_active = true
      ORDER BY a.risk_score DESC
    `);

    // התראות קריטיות
    const criticalAlerts = await q(sql`
      SELECT * FROM crm_notifications WHERE severity = 'critical' AND read = false
      ORDER BY created_at DESC LIMIT 20
    `);

    // סוכנים בסיכון - ציון סיכון גבוה
    const agentsAtRisk = await q(sql`
      SELECT id, full_name, risk_score, quality_score, conversion_rate, current_leads
      FROM crm_agents WHERE is_active = true AND risk_score >= 50
      ORDER BY risk_score DESC
    `);

    // משימות באיחור
    const overdueTasks = await q(sql`
      SELECT t.*, a.full_name as agent_name FROM crm_tasks t
      LEFT JOIN crm_agents a ON a.id = t.assigned_to_id
      WHERE t.status IN ('pending','in_progress') AND t.due_date < CURRENT_DATE
      ORDER BY t.due_date ASC LIMIT 30
    `);

    // פגישות היום
    const todayMeetingsSummary = await qOne(sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER(WHERE status = 'scheduled') as scheduled,
        COUNT(*) FILTER(WHERE status = 'confirmed') as confirmed,
        COUNT(*) FILTER(WHERE status = 'completed') as completed,
        COUNT(*) FILTER(WHERE status = 'cancelled') as cancelled,
        COUNT(*) FILTER(WHERE status = 'no_show') as no_show
      FROM crm_meetings WHERE date = CURRENT_DATE
    `);

    // הצעות מחיר ממתינות לאישור הנחה
    const pendingDiscountApprovals = await q(sql`
      SELECT id, quote_number, customer_name, agent_name, discount_percent, total_with_vat
      FROM crm_quotes WHERE discount_requires_approval = true AND discount_approved_by IS NULL AND status = 'draft'
      ORDER BY total_with_vat DESC
    `);

    // חוזים ממתינים לאישור מנהל
    const pendingContractApprovals = await q(sql`
      SELECT id, contract_number, customer_name, total_amount, status
      FROM crm_contracts WHERE status = 'pending_signature' AND approved_by_manager IS NULL
      ORDER BY total_amount DESC
    `);

    // ביצועי צוות - 7 ימים אחרונים
    const teamPerformance7d = await qOne(sql`
      SELECT
        COALESCE(SUM(leads_received), 0) as leads_received,
        COALESCE(SUM(calls_made), 0) as calls_made,
        COALESCE(SUM(meetings_completed), 0) as meetings_completed,
        COALESCE(SUM(quotes_sent), 0) as quotes_sent,
        COALESCE(SUM(deals_closed), 0) as deals_closed,
        COALESCE(SUM(deals_amount), 0) as deals_amount
      FROM crm_agent_daily_stats WHERE stat_date >= CURRENT_DATE - INTERVAL '7 days'
    `);

    res.json({
      overallSummary,
      agentStatus,
      criticalAlerts,
      agentsAtRisk,
      overdueTasks,
      todayMeetingsSummary,
      pendingDiscountApprovals,
      pendingContractApprovals,
      teamPerformance7d,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// 18. POST /check-mandatory-fields/:leadId - בדיקת שדות חובה בליד
// ============================================================================
router.post("/check-mandatory-fields/:leadId", async (req: Request, res: Response) => {
  try {
    const leadId = Number(req.params.leadId);
    const lead = await qOne(sql`SELECT * FROM crm_leads_ultimate WHERE id = ${leadId}`);
    if (!lead) return res.status(404).json({ error: "ליד לא נמצא" });

    const l = lead as any;
    const missing: string[] = [];
    const warnings: string[] = [];

    // שדות חובה
    if (!l.first_name) missing.push("שם פרטי");
    if (!l.phone && !l.mobile) missing.push("טלפון או נייד");
    if (!l.source) missing.push("מקור ליד");
    if (!l.city) warnings.push("עיר (מומלץ למלא)");
    if (!l.email) warnings.push("אימייל (מומלץ למלא)");
    if (!l.interested_products || (Array.isArray(l.interested_products) && l.interested_products.length === 0)) warnings.push("מוצרים מעניינים (מומלץ למלא)");
    if (!l.estimated_budget) warnings.push("תקציב משוער (מומלץ למלא)");
    if (!l.assigned_agent_id) warnings.push("לא הוקצה סוכן");

    const isComplete = missing.length === 0;

    // עדכון סטטוס שדות חובה
    await db.execute(sql`
      UPDATE crm_leads_ultimate SET mandatory_fields_complete = ${isComplete}, updated_at = NOW()
      WHERE id = ${leadId}
    `);

    res.json({
      lead_id: leadId,
      is_complete: isComplete,
      missing_required: missing,
      warnings,
      score: Math.round(((8 - missing.length - warnings.length * 0.5) / 8) * 100),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================================
// אתחול טבלאות אוטומטי בטעינה ראשונה
// ============================================================================
ensureCrmUltimateTables().catch(() => {});

export default router;
