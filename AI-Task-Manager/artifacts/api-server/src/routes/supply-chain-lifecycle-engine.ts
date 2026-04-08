// =====================================================
// מנוע מחזור חיים של שרשרת אספקה - מפעל מתכת
// מסגור עסקה ועד השלמת התקנה
// ברזל, אלומיניום, זכוכית
// =====================================================
// עוקב אחרי פרויקט מרגע סגירת העסקה דרך מדידה, ייצור, צביעה, משלוח והתקנה

import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";

const router = Router();

// =====================================================
// הגדרת שלבי שרשרת האספקה - 20 שלבים מלאים
// =====================================================
const STAGE_FLOW = [
  { name: "deal_closed", name_he: "עסקה נסגרה", role: "sales_agent" },
  { name: "contract_signed", name_he: "חוזה נחתם", role: "customer" },
  { name: "advance_payment", name_he: "מקדמה התקבלה", role: "finance" },
  { name: "measurement_scheduled", name_he: "מדידה תואמה", role: "engineer_coordinator" },
  { name: "measurement_done", name_he: "מדידה בוצעה", role: "field_engineer" },
  { name: "measurement_approved", name_he: "מדידה אושרה", role: "project_manager" },
  { name: "materials_ordered", name_he: "חומרי גלם הוזמנו", role: "procurement" },
  { name: "materials_received", name_he: "חומרי גלם התקבלו", role: "warehouse" },
  { name: "production_scheduled", name_he: "ייצור תוכנן", role: "production_manager" },
  { name: "production_started", name_he: "ייצור התחיל", role: "production_worker" },
  { name: "production_completed", name_he: "ייצור הסתיים", role: "production_manager" },
  { name: "quality_check", name_he: "בקרת איכות", role: "qc_inspector" },
  { name: "painting_sent", name_he: "נשלח לצבע בתנור", role: "logistics" },
  { name: "painting_received", name_he: "חזר מצבע", role: "warehouse" },
  { name: "installation_scheduled", name_he: "התקנה תואמה", role: "installer_coordinator" },
  { name: "installation_started", name_he: "התקנה התחילה", role: "installer" },
  { name: "installation_completed", name_he: "התקנה הסתיימה", role: "installer" },
  { name: "customer_approval", name_he: "אישור לקוח", role: "customer" },
  { name: "final_payment", name_he: "תשלום סופי", role: "finance" },
  { name: "project_completed", name_he: "פרויקט הושלם", role: "project_manager" },
] as const;

// שמות השלבים כמערך פשוט לנוחות
const STAGE_NAMES = STAGE_FLOW.map((s) => s.name);

// =====================================================
// SLA ברירת מחדל לכל שלב - בשעות
// =====================================================
const SLA_DEFAULTS: Record<string, number> = {
  measurement_scheduled: 48,
  measurement_done: 72,
  measurement_approved: 24,
  materials_ordered: 24,
  materials_received: 168,
  production_scheduled: 24,
  production_started: 48,
  production_completed: 240,
  quality_check: 24,
  painting_sent: 24,
  painting_received: 120,
  installation_scheduled: 48,
  installation_started: 72,
  installation_completed: 168,
  customer_approval: 48,
  final_payment: 168,
};

// שלבים שדורשים אישור מפורש לפני מעבר לשלב הבא
const STAGES_REQUIRING_APPROVAL = [
  "measurement_approved",
  "quality_check",
  "customer_approval",
];

// =====================================================
// פונקציית עזר - חיפוש שלב לפי שם
// =====================================================
function getStageInfo(stageName: string) {
  return STAGE_FLOW.find((s) => s.name === stageName);
}

// פונקציית עזר - קבלת אינדקס השלב
function getStageIndex(stageName: string): number {
  return STAGE_NAMES.indexOf(stageName);
}

// פונקציית עזר - קבלת השלב הבא
function getNextStage(currentStage: string): string | null {
  const idx = getStageIndex(currentStage);
  if (idx === -1 || idx >= STAGE_NAMES.length - 1) return null;
  return STAGE_NAMES[idx + 1];
}

// =====================================================
// POST /init - יצירת כל הטבלאות, אינדקסים ודאטה לדוגמה
// =====================================================
router.post("/init", async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // טבלת פרויקטים בשרשרת אספקה
    await client.query(`
      CREATE TABLE IF NOT EXISTS supply_chain_projects (
        id SERIAL PRIMARY KEY,
        project_number VARCHAR(50) UNIQUE,
        deal_id INTEGER,
        customer_id INTEGER,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(50),
        customer_email VARCHAR(255),
        customer_address TEXT,
        city VARCHAR(100),
        sales_agent_id INTEGER,
        sales_agent_name VARCHAR(255),
        products JSONB DEFAULT '[]',
        total_amount NUMERIC(15,2),
        vat_amount NUMERIC(15,2),
        total_with_vat NUMERIC(15,2),
        contract_signed BOOLEAN DEFAULT false,
        contract_signed_date DATE,
        contract_document_url TEXT,
        advance_payment NUMERIC(15,2) DEFAULT 0,
        advance_payment_date DATE,
        current_stage VARCHAR(50) DEFAULT 'deal_closed',
        stage_history JSONB DEFAULT '[]',
        estimated_completion DATE,
        actual_completion DATE,
        priority VARCHAR(20) DEFAULT 'normal',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת שלבים - כל שלב בפרויקט נרשם כאן
    await client.query(`
      CREATE TABLE IF NOT EXISTS supply_chain_stages (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES supply_chain_projects(id),
        stage_name VARCHAR(50),
        stage_name_he VARCHAR(100),
        assigned_to_id INTEGER,
        assigned_to_name VARCHAR(255),
        assigned_to_role VARCHAR(50),
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        approved_by VARCHAR(255),
        approved_at TIMESTAMPTZ,
        approval_notes TEXT,
        documents JSONB DEFAULT '[]',
        photos JSONB DEFAULT '[]',
        issues JSONB DEFAULT '[]',
        status VARCHAR(20) DEFAULT 'pending',
        sla_hours INTEGER,
        sla_deadline TIMESTAMPTZ,
        is_overdue BOOLEAN DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // טבלת התראות שרשרת אספקה
    await client.query(`
      CREATE TABLE IF NOT EXISTS supply_chain_alerts (
        id SERIAL PRIMARY KEY,
        project_id INTEGER,
        stage_id INTEGER,
        alert_type VARCHAR(50),
        severity VARCHAR(20) DEFAULT 'medium',
        title VARCHAR(255),
        title_he VARCHAR(255),
        message TEXT,
        message_he TEXT,
        assigned_to VARCHAR(255),
        acknowledged BOOLEAN DEFAULT false,
        acknowledged_at TIMESTAMPTZ,
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMPTZ,
        resolved_by VARCHAR(255),
        auto_escalate BOOLEAN DEFAULT true,
        escalated_to VARCHAR(255),
        escalated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // יצירת אינדקסים לביצועים מיטביים
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scp_current_stage ON supply_chain_projects(current_stage)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scp_customer_id ON supply_chain_projects(customer_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scp_sales_agent_id ON supply_chain_projects(sales_agent_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scp_priority ON supply_chain_projects(priority)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scp_created_at ON supply_chain_projects(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scs_project_id ON supply_chain_stages(project_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scs_stage_name ON supply_chain_stages(stage_name)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scs_status ON supply_chain_stages(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scs_is_overdue ON supply_chain_stages(is_overdue)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sca_project_id ON supply_chain_alerts(project_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sca_severity ON supply_chain_alerts(severity)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sca_resolved ON supply_chain_alerts(resolved)`);

    // =====================================================
    // נתוני דוגמה - 3 פרויקטים בשלבים שונים
    // =====================================================
    const existingProjects = await client.query(
      `SELECT COUNT(*) as cnt FROM supply_chain_projects`
    );

    if (parseInt(existingProjects.rows[0].cnt, 10) === 0) {
      // פרויקט 1 - בשלב ייצור (אמצע התהליך)
      const p1 = await client.query(
        `INSERT INTO supply_chain_projects (
          project_number, deal_id, customer_id, customer_name, customer_phone, customer_email,
          customer_address, city, sales_agent_id, sales_agent_name,
          products, total_amount, vat_amount, total_with_vat,
          contract_signed, contract_signed_date, advance_payment, advance_payment_date,
          current_stage, stage_history, estimated_completion, priority, notes
        ) VALUES (
          'SC-2026-001', 101, 201, 'חברת בנייה צפון בע"מ', '054-1234567', 'north@build.co.il',
          'רחוב התעשייה 15', 'חיפה', 301, 'יוסי כהן',
          $1, 85000.00, 14450.00, 99450.00,
          true, '2026-02-10', 30000.00, '2026-02-12',
          'production_started',
          $2,
          '2026-04-15', 'high',
          'פרויקט שערים ומעקות ברזל לבניין מגורים - 4 קומות'
        ) RETURNING id`,
        [
          JSON.stringify([
            { name: "שער כניסה ראשי - ברזל", qty: 1, unit_price: 15000 },
            { name: "מעקה מדרגות - ברזל", qty: 8, unit_price: 5000 },
            { name: "דלת פלדה", qty: 4, unit_price: 3500 },
          ]),
          JSON.stringify([
            { stage: "deal_closed", at: "2026-02-08T10:00:00Z", by: "יוסי כהן" },
            { stage: "contract_signed", at: "2026-02-10T14:00:00Z", by: "חברת בנייה צפון" },
            { stage: "advance_payment", at: "2026-02-12T09:00:00Z", by: "מחלקת כספים" },
            { stage: "measurement_scheduled", at: "2026-02-13T08:00:00Z", by: "רונן מהנדס" },
            { stage: "measurement_done", at: "2026-02-15T16:00:00Z", by: "אבי מודד" },
            { stage: "measurement_approved", at: "2026-02-16T11:00:00Z", by: "דני מנהל פרויקט" },
            { stage: "materials_ordered", at: "2026-02-17T09:00:00Z", by: "שרה רכש" },
            { stage: "materials_received", at: "2026-02-24T14:00:00Z", by: "מחסן ראשי" },
            { stage: "production_scheduled", at: "2026-02-25T08:00:00Z", by: "מוטי מנהל ייצור" },
            { stage: "production_started", at: "2026-02-27T07:00:00Z", by: "צוות ייצור א" },
          ]),
        ]
      );

      // יצירת רשומות שלבים לפרויקט 1
      const p1Stages = STAGE_FLOW.slice(0, 10); // עד production_started
      for (let i = 0; i < p1Stages.length; i++) {
        const s = p1Stages[i];
        const isLast = i === p1Stages.length - 1;
        await client.query(
          `INSERT INTO supply_chain_stages (
            project_id, stage_name, stage_name_he, assigned_to_name, assigned_to_role,
            started_at, completed_at, status, sla_hours
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            p1.rows[0].id,
            s.name,
            s.name_he,
            "עובד מערכת",
            s.role,
            new Date(Date.now() - (p1Stages.length - i) * 2 * 24 * 3600000).toISOString(),
            isLast ? null : new Date(Date.now() - (p1Stages.length - i - 1) * 2 * 24 * 3600000).toISOString(),
            isLast ? "in_progress" : "completed",
            SLA_DEFAULTS[s.name] || null,
          ]
        );
      }

      // פרויקט 2 - בשלב מדידה (תחילת התהליך)
      const p2 = await client.query(
        `INSERT INTO supply_chain_projects (
          project_number, deal_id, customer_id, customer_name, customer_phone, customer_email,
          customer_address, city, sales_agent_id, sales_agent_name,
          products, total_amount, vat_amount, total_with_vat,
          contract_signed, contract_signed_date, advance_payment, advance_payment_date,
          current_stage, stage_history, estimated_completion, priority, notes
        ) VALUES (
          'SC-2026-002', 102, 202, 'וילה כרמל - משפחת לוי', '052-9876543', 'levi@gmail.com',
          'רחוב הגפן 8', 'זכרון יעקב', 302, 'מיכל דהן',
          $1, 120000.00, 20400.00, 140400.00,
          true, '2026-03-15', 42000.00, '2026-03-17',
          'measurement_scheduled',
          $2,
          '2026-05-20', 'normal',
          'חלונות ודלתות אלומיניום + מעקה זכוכית לוילה פרטית'
        ) RETURNING id`,
        [
          JSON.stringify([
            { name: "חלון אלומיניום 150x120", qty: 12, unit_price: 3500 },
            { name: "דלת כניסה אלומיניום", qty: 1, unit_price: 12000 },
            { name: "מעקה זכוכית מרפסת", qty: 15, unit_price: 2800 },
          ]),
          JSON.stringify([
            { stage: "deal_closed", at: "2026-03-12T11:00:00Z", by: "מיכל דהן" },
            { stage: "contract_signed", at: "2026-03-15T10:00:00Z", by: "משפחת לוי" },
            { stage: "advance_payment", at: "2026-03-17T15:00:00Z", by: "מחלקת כספים" },
            { stage: "measurement_scheduled", at: "2026-03-18T09:00:00Z", by: "רונן מהנדס" },
          ]),
        ]
      );

      const p2Stages = STAGE_FLOW.slice(0, 4); // עד measurement_scheduled
      for (let i = 0; i < p2Stages.length; i++) {
        const s = p2Stages[i];
        const isLast = i === p2Stages.length - 1;
        await client.query(
          `INSERT INTO supply_chain_stages (
            project_id, stage_name, stage_name_he, assigned_to_name, assigned_to_role,
            started_at, completed_at, status, sla_hours
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            p2.rows[0].id,
            s.name,
            s.name_he,
            "עובד מערכת",
            s.role,
            new Date(Date.now() - (p2Stages.length - i) * 24 * 3600000).toISOString(),
            isLast ? null : new Date(Date.now() - (p2Stages.length - i - 1) * 24 * 3600000).toISOString(),
            isLast ? "in_progress" : "completed",
            SLA_DEFAULTS[s.name] || null,
          ]
        );
      }

      // פרויקט 3 - בשלב התקנה (קרוב לסיום)
      const p3 = await client.query(
        `INSERT INTO supply_chain_projects (
          project_number, deal_id, customer_id, customer_name, customer_phone, customer_email,
          customer_address, city, sales_agent_id, sales_agent_name,
          products, total_amount, vat_amount, total_with_vat,
          contract_signed, contract_signed_date, advance_payment, advance_payment_date,
          current_stage, stage_history, estimated_completion, priority, notes
        ) VALUES (
          'SC-2026-003', 103, 203, 'מסעדת הנמל - יפו', '03-5551234', 'port.rest@biz.co.il',
          'רחוב נמל יפו 22', 'תל אביב-יפו', 301, 'יוסי כהן',
          $1, 45000.00, 7650.00, 52650.00,
          true, '2026-01-20', 18000.00, '2026-01-22',
          'installation_started',
          $2,
          '2026-03-30', 'urgent',
          'פרגולת ברזל + מעקה זכוכית למרפסת מסעדה עם נוף לים'
        ) RETURNING id`,
        [
          JSON.stringify([
            { name: "פרגולת ברזל 6x4 מטר", qty: 1, unit_price: 25000 },
            { name: "מעקה זכוכית מחוסמת", qty: 8, unit_price: 2500 },
          ]),
          JSON.stringify([
            { stage: "deal_closed", at: "2026-01-18T09:00:00Z", by: "יוסי כהן" },
            { stage: "contract_signed", at: "2026-01-20T12:00:00Z", by: "מסעדת הנמל" },
            { stage: "advance_payment", at: "2026-01-22T10:00:00Z", by: "מחלקת כספים" },
            { stage: "measurement_scheduled", at: "2026-01-23T08:00:00Z", by: "רונן מהנדס" },
            { stage: "measurement_done", at: "2026-01-25T15:00:00Z", by: "אבי מודד" },
            { stage: "measurement_approved", at: "2026-01-26T10:00:00Z", by: "דני מנהל פרויקט" },
            { stage: "materials_ordered", at: "2026-01-27T09:00:00Z", by: "שרה רכש" },
            { stage: "materials_received", at: "2026-02-05T14:00:00Z", by: "מחסן ראשי" },
            { stage: "production_scheduled", at: "2026-02-06T08:00:00Z", by: "מוטי מנהל ייצור" },
            { stage: "production_started", at: "2026-02-08T07:00:00Z", by: "צוות ייצור ב" },
            { stage: "production_completed", at: "2026-02-20T16:00:00Z", by: "מוטי מנהל ייצור" },
            { stage: "quality_check", at: "2026-02-21T11:00:00Z", by: "יעל בקרת איכות" },
            { stage: "painting_sent", at: "2026-02-22T08:00:00Z", by: "לוגיסטיקה" },
            { stage: "painting_received", at: "2026-03-01T14:00:00Z", by: "מחסן ראשי" },
            { stage: "installation_scheduled", at: "2026-03-02T09:00:00Z", by: "רמי מתאם התקנות" },
            { stage: "installation_started", at: "2026-03-05T07:00:00Z", by: "צוות התקנה א" },
          ]),
        ]
      );

      const p3Stages = STAGE_FLOW.slice(0, 16); // עד installation_started
      for (let i = 0; i < p3Stages.length; i++) {
        const s = p3Stages[i];
        const isLast = i === p3Stages.length - 1;
        await client.query(
          `INSERT INTO supply_chain_stages (
            project_id, stage_name, stage_name_he, assigned_to_name, assigned_to_role,
            started_at, completed_at, status, sla_hours
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            p3.rows[0].id,
            s.name,
            s.name_he,
            "עובד מערכת",
            s.role,
            new Date(Date.now() - (p3Stages.length - i) * 2 * 24 * 3600000).toISOString(),
            isLast ? null : new Date(Date.now() - (p3Stages.length - i - 1) * 2 * 24 * 3600000).toISOString(),
            isLast ? "in_progress" : "completed",
            SLA_DEFAULTS[s.name] || null,
          ]
        );
      }

      // התראת דוגמה - SLA חריגה בפרויקט 3
      await client.query(
        `INSERT INTO supply_chain_alerts (
          project_id, alert_type, severity, title, title_he, message, message_he, assigned_to
        ) VALUES ($1, 'sla_violation', 'high',
          'Installation taking longer than expected',
          'התקנה לוקחת יותר מהצפוי',
          'Project SC-2026-003 installation has exceeded SLA deadline',
          'פרויקט SC-2026-003 - ההתקנה חרגה מזמן ה-SLA המוגדר',
          'רמי מתאם התקנות'
        )`,
        [p3.rows[0].id]
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "טבלאות שרשרת אספקה נוצרו בהצלחה עם נתוני דוגמה",
      tables: [
        "supply_chain_projects",
        "supply_chain_stages",
        "supply_chain_alerts",
      ],
      seed_projects: 3,
      stages_defined: STAGE_FLOW.length,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("שגיאה באתחול טבלאות שרשרת אספקה:", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// GET / - רשימת כל הפרויקטים עם השלב הנוכחי
// =====================================================
router.get("/", async (req: Request, res: Response) => {
  try {
    const { stage, priority, city, search, page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    // בניית שאילתה דינמית עם פילטרים
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (stage) {
      conditions.push(`p.current_stage = $${paramIdx++}`);
      params.push(stage);
    }
    if (priority) {
      conditions.push(`p.priority = $${paramIdx++}`);
      params.push(priority);
    }
    if (city) {
      conditions.push(`p.city ILIKE $${paramIdx++}`);
      params.push(`%${city}%`);
    }
    if (search) {
      conditions.push(
        `(p.project_number ILIKE $${paramIdx} OR p.customer_name ILIKE $${paramIdx} OR p.notes ILIKE $${paramIdx})`
      );
      params.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // ספירת סך הכל לדפדוף
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM supply_chain_projects p ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // שליפת הפרויקטים
    const result = await pool.query(
      `SELECT p.*,
        (SELECT json_build_object('name', sf.stage_name, 'name_he', sf.stage_name_he, 'status', sf.status, 'started_at', sf.started_at)
         FROM supply_chain_stages sf WHERE sf.project_id = p.id AND sf.stage_name = p.current_stage LIMIT 1
        ) as current_stage_details,
        (SELECT COUNT(*) FROM supply_chain_alerts a WHERE a.project_id = p.id AND a.resolved = false) as active_alerts
      FROM supply_chain_projects p
      ${whereClause}
      ORDER BY
        CASE p.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
        p.updated_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limitNum, offset]
    );

    // מיפוי שם השלב בעברית
    const projects = result.rows.map((p: any) => {
      const stageInfo = getStageInfo(p.current_stage);
      return {
        ...p,
        current_stage_he: stageInfo?.name_he || p.current_stage,
        stage_progress: `${getStageIndex(p.current_stage) + 1}/${STAGE_FLOW.length}`,
      };
    });

    res.json({
      success: true,
      data: projects,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        total_pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת פרויקטים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST / - יצירת פרויקט חדש מעסקה שנסגרה
// =====================================================
router.post("/", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const {
      deal_id,
      customer_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      city,
      sales_agent_id,
      sales_agent_name,
      products,
      total_amount,
      vat_amount,
      total_with_vat,
      estimated_completion,
      priority = "normal",
      notes,
    } = req.body;

    // וידוא שדות חובה
    if (!customer_name || !sales_agent_name || !total_amount) {
      return res.status(400).json({
        success: false,
        error: "שדות חובה חסרים: customer_name, sales_agent_name, total_amount",
      });
    }

    // יצירת מספר פרויקט ייחודי
    const yearMonth = new Date().toISOString().slice(0, 7).replace("-", "");
    const seqResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(project_number FROM '[0-9]+$') AS INTEGER)), 0) + 1 as next_seq
       FROM supply_chain_projects
       WHERE project_number LIKE $1`,
      [`SC-${yearMonth}-%`]
    );
    const seq = String(seqResult.rows[0].next_seq).padStart(3, "0");
    const projectNumber = `SC-${yearMonth}-${seq}`;

    // יצירת הפרויקט
    const result = await client.query(
      `INSERT INTO supply_chain_projects (
        project_number, deal_id, customer_id, customer_name, customer_phone, customer_email,
        customer_address, city, sales_agent_id, sales_agent_name,
        products, total_amount, vat_amount, total_with_vat,
        current_stage, stage_history, estimated_completion, priority, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'deal_closed',$15,$16,$17,$18)
      RETURNING *`,
      [
        projectNumber,
        deal_id || null,
        customer_id || null,
        customer_name,
        customer_phone || null,
        customer_email || null,
        customer_address || null,
        city || null,
        sales_agent_id || null,
        sales_agent_name,
        JSON.stringify(products || []),
        total_amount,
        vat_amount || null,
        total_with_vat || null,
        JSON.stringify([
          {
            stage: "deal_closed",
            at: new Date().toISOString(),
            by: sales_agent_name,
          },
        ]),
        estimated_completion || null,
        priority,
        notes || null,
      ]
    );

    const project = result.rows[0];

    // יצירת רשומת שלב ראשון - עסקה נסגרה
    const slaHours = SLA_DEFAULTS["deal_closed"] || null;
    const slaDeadline = slaHours
      ? new Date(Date.now() + slaHours * 3600000).toISOString()
      : null;

    await client.query(
      `INSERT INTO supply_chain_stages (
        project_id, stage_name, stage_name_he, assigned_to_name, assigned_to_role,
        started_at, status, sla_hours, sla_deadline
      ) VALUES ($1, 'deal_closed', 'עסקה נסגרה', $2, 'sales_agent', NOW(), 'in_progress', $3, $4)`,
      [project.id, sales_agent_name, slaHours, slaDeadline]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: `פרויקט ${projectNumber} נוצר בהצלחה`,
      data: project,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("שגיאה ביצירת פרויקט:", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// GET /dashboard - לוח מחוונים של שרשרת האספקה
// =====================================================
router.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    // פרויקטים לפי שלב
    const byStage = await pool.query(`
      SELECT current_stage, COUNT(*) as count
      FROM supply_chain_projects
      GROUP BY current_stage
      ORDER BY array_position(
        ARRAY['deal_closed','contract_signed','advance_payment','measurement_scheduled',
              'measurement_done','measurement_approved','materials_ordered','materials_received',
              'production_scheduled','production_started','production_completed','quality_check',
              'painting_sent','painting_received','installation_scheduled','installation_started',
              'installation_completed','customer_approval','final_payment','project_completed'],
        current_stage
      )
    `);

    // מיפוי שמות עבריים
    const stageDistribution = byStage.rows.map((r: any) => ({
      stage: r.current_stage,
      stage_he: getStageInfo(r.current_stage)?.name_he || r.current_stage,
      count: parseInt(r.count, 10),
    }));

    // פרויקטים באיחור - שלבים שחרגו מה-SLA
    const overdue = await pool.query(`
      SELECT s.*, p.project_number, p.customer_name, p.priority
      FROM supply_chain_stages s
      JOIN supply_chain_projects p ON p.id = s.project_id
      WHERE s.status = 'in_progress'
        AND s.sla_deadline IS NOT NULL
        AND s.sla_deadline < NOW()
      ORDER BY s.sla_deadline ASC
    `);

    // זמן ממוצע לכל שלב (בשעות)
    const avgTime = await pool.query(`
      SELECT stage_name,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600)::numeric, 1) as avg_hours,
        COUNT(*) as completed_count
      FROM supply_chain_stages
      WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
      GROUP BY stage_name
      ORDER BY array_position(
        ARRAY['deal_closed','contract_signed','advance_payment','measurement_scheduled',
              'measurement_done','measurement_approved','materials_ordered','materials_received',
              'production_scheduled','production_started','production_completed','quality_check',
              'painting_sent','painting_received','installation_scheduled','installation_started',
              'installation_completed','customer_approval','final_payment','project_completed'],
        stage_name
      )
    `);

    const avgTimePerStage = avgTime.rows.map((r: any) => ({
      stage: r.stage_name,
      stage_he: getStageInfo(r.stage_name)?.name_he || r.stage_name,
      avg_hours: parseFloat(r.avg_hours),
      completed_count: parseInt(r.completed_count, 10),
    }));

    // סיכום התראות
    const alertsSummary = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE resolved = false) as active,
        COUNT(*) FILTER (WHERE resolved = false AND severity = 'critical') as critical,
        COUNT(*) FILTER (WHERE resolved = false AND severity = 'high') as high,
        COUNT(*) FILTER (WHERE resolved = false AND severity = 'medium') as medium,
        COUNT(*) FILTER (WHERE resolved = false AND severity = 'low') as low,
        COUNT(*) FILTER (WHERE resolved = true) as resolved
      FROM supply_chain_alerts
    `);

    // סטטיסטיקות כלליות
    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_projects,
        COUNT(*) FILTER (WHERE current_stage = 'project_completed') as completed,
        COUNT(*) FILTER (WHERE current_stage != 'project_completed') as active,
        COUNT(*) FILTER (WHERE priority = 'urgent') as urgent,
        COALESCE(SUM(total_with_vat), 0) as total_value,
        COALESCE(SUM(total_with_vat) FILTER (WHERE current_stage != 'project_completed'), 0) as active_value
      FROM supply_chain_projects
    `);

    res.json({
      success: true,
      data: {
        statistics: stats.rows[0],
        stage_distribution: stageDistribution,
        overdue_projects: overdue.rows,
        avg_time_per_stage: avgTimePerStage,
        alerts_summary: alertsSummary.rows[0],
        total_stages: STAGE_FLOW.length,
        stage_flow: STAGE_FLOW,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בטעינת לוח מחוונים:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /timeline/:id - נתוני ציר זמן לפרויקט
// =====================================================
router.get("/timeline/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // שליפת הפרויקט
    const project = await pool.query(
      `SELECT * FROM supply_chain_projects WHERE id = $1`,
      [id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ success: false, error: "פרויקט לא נמצא" });
    }

    // שליפת כל השלבים
    const stages = await pool.query(
      `SELECT * FROM supply_chain_stages
       WHERE project_id = $1
       ORDER BY array_position(
         ARRAY['deal_closed','contract_signed','advance_payment','measurement_scheduled',
               'measurement_done','measurement_approved','materials_ordered','materials_received',
               'production_scheduled','production_started','production_completed','quality_check',
               'painting_sent','painting_received','installation_scheduled','installation_started',
               'installation_completed','customer_approval','final_payment','project_completed'],
         stage_name
       )`,
      [id]
    );

    // בניית ציר זמן מלא עם כל 20 השלבים
    const timeline = STAGE_FLOW.map((sf) => {
      const stageRecord = stages.rows.find((s: any) => s.stage_name === sf.name);
      const currentStageIdx = getStageIndex(project.rows[0].current_stage);
      const thisStageIdx = getStageIndex(sf.name);

      let timelineStatus = "future";
      if (stageRecord) {
        timelineStatus = stageRecord.status;
      } else if (thisStageIdx <= currentStageIdx) {
        timelineStatus = "skipped";
      }

      // חישוב משך הזמן בשעות אם השלב הושלם
      let durationHours: number | null = null;
      if (stageRecord?.started_at && stageRecord?.completed_at) {
        const start = new Date(stageRecord.started_at).getTime();
        const end = new Date(stageRecord.completed_at).getTime();
        durationHours = Math.round(((end - start) / 3600000) * 10) / 10;
      }

      return {
        stage_name: sf.name,
        stage_name_he: sf.name_he,
        role: sf.role,
        status: timelineStatus,
        started_at: stageRecord?.started_at || null,
        completed_at: stageRecord?.completed_at || null,
        duration_hours: durationHours,
        sla_hours: SLA_DEFAULTS[sf.name] || null,
        is_overdue: stageRecord?.is_overdue || false,
        assigned_to: stageRecord?.assigned_to_name || null,
        approved_by: stageRecord?.approved_by || null,
        issues: stageRecord?.issues || [],
        documents: stageRecord?.documents || [],
        photos: stageRecord?.photos || [],
        notes: stageRecord?.notes || null,
      };
    });

    // חישוב זמן כולל של הפרויקט
    const firstStage = stages.rows[0];
    const lastCompletedStage = [...stages.rows]
      .reverse()
      .find((s: any) => s.completed_at);
    let totalDurationHours: number | null = null;
    if (firstStage?.started_at) {
      const start = new Date(firstStage.started_at).getTime();
      const end = lastCompletedStage?.completed_at
        ? new Date(lastCompletedStage.completed_at).getTime()
        : Date.now();
      totalDurationHours = Math.round(((end - start) / 3600000) * 10) / 10;
    }

    res.json({
      success: true,
      data: {
        project: project.rows[0],
        timeline,
        progress: {
          current_stage: project.rows[0].current_stage,
          current_stage_he: getStageInfo(project.rows[0].current_stage)?.name_he,
          completed_stages: stages.rows.filter((s: any) => s.status === "completed").length,
          total_stages: STAGE_FLOW.length,
          percentage: Math.round(
            (stages.rows.filter((s: any) => s.status === "completed").length / STAGE_FLOW.length) * 100
          ),
          total_duration_hours: totalDurationHours,
        },
      },
    });
  } catch (error: any) {
    console.error("שגיאה בטעינת ציר זמן:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /alerts - כל ההתראות הפעילות ממוינות לפי חומרה
// =====================================================
router.get("/alerts", async (req: Request, res: Response) => {
  try {
    const { resolved, severity, project_id } = req.query;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (resolved !== undefined) {
      conditions.push(`a.resolved = $${paramIdx++}`);
      params.push(resolved === "true");
    } else {
      // ברירת מחדל - רק התראות פעילות
      conditions.push(`a.resolved = false`);
    }

    if (severity) {
      conditions.push(`a.severity = $${paramIdx++}`);
      params.push(severity);
    }

    if (project_id) {
      conditions.push(`a.project_id = $${paramIdx++}`);
      params.push(project_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT a.*, p.project_number, p.customer_name
       FROM supply_chain_alerts a
       LEFT JOIN supply_chain_projects p ON p.id = a.project_id
       ${whereClause}
       ORDER BY
         CASE a.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
         a.created_at DESC`,
      params
    );

    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (error: any) {
    console.error("שגיאה בשליפת התראות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /bottleneck-analysis - ניתוח צווארי בקבוק
// =====================================================
router.get("/bottleneck-analysis", async (_req: Request, res: Response) => {
  try {
    // שלבים שלוקחים הכי הרבה זמן בממוצע
    const slowestStages = await pool.query(`
      SELECT
        stage_name,
        COUNT(*) as total_completed,
        ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600)::numeric, 1) as avg_hours,
        ROUND(MAX(EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600)::numeric, 1) as max_hours,
        ROUND(MIN(EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600)::numeric, 1) as min_hours,
        COUNT(*) FILTER (WHERE is_overdue = true) as overdue_count
      FROM supply_chain_stages
      WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL
      GROUP BY stage_name
      ORDER BY avg_hours DESC
    `);

    // שלבים עם הכי הרבה בעיות
    const issuesByStage = await pool.query(`
      SELECT
        s.stage_name,
        COUNT(a.id) as issue_count,
        COUNT(a.id) FILTER (WHERE a.severity = 'critical') as critical_issues,
        COUNT(a.id) FILTER (WHERE a.severity = 'high') as high_issues
      FROM supply_chain_stages s
      LEFT JOIN supply_chain_alerts a ON a.stage_id = s.id
      WHERE a.id IS NOT NULL
      GROUP BY s.stage_name
      ORDER BY issue_count DESC
    `);

    // שלבים שחורגים מ-SLA הכי הרבה
    const slaViolations = await pool.query(`
      SELECT
        stage_name,
        COUNT(*) FILTER (WHERE is_overdue = true) as overdue_count,
        COUNT(*) as total,
        ROUND(
          (COUNT(*) FILTER (WHERE is_overdue = true)::numeric / NULLIF(COUNT(*), 0) * 100)::numeric, 1
        ) as overdue_percentage
      FROM supply_chain_stages
      WHERE status IN ('completed', 'in_progress')
      GROUP BY stage_name
      HAVING COUNT(*) > 0
      ORDER BY overdue_percentage DESC
    `);

    // פרויקטים שתקועים - בשלב הנוכחי יותר מ-48 שעות
    const stuckProjects = await pool.query(`
      SELECT p.id, p.project_number, p.customer_name, p.current_stage, p.priority,
        s.started_at,
        ROUND(EXTRACT(EPOCH FROM (NOW() - s.started_at)) / 3600) as hours_in_stage
      FROM supply_chain_projects p
      JOIN supply_chain_stages s ON s.project_id = p.id AND s.stage_name = p.current_stage
      WHERE s.status = 'in_progress'
        AND s.started_at < NOW() - INTERVAL '48 hours'
        AND p.current_stage != 'project_completed'
      ORDER BY hours_in_stage DESC
    `);

    // הוספת שמות עבריים
    const enriched = (rows: any[]) =>
      rows.map((r: any) => ({
        ...r,
        stage_name_he: getStageInfo(r.stage_name)?.name_he || r.stage_name,
      }));

    res.json({
      success: true,
      data: {
        slowest_stages: enriched(slowestStages.rows),
        most_issues: enriched(issuesByStage.rows),
        sla_violations: enriched(slaViolations.rows),
        stuck_projects: stuckProjects.rows.map((p: any) => ({
          ...p,
          current_stage_he: getStageInfo(p.current_stage)?.name_he || p.current_stage,
        })),
      },
    });
  } catch (error: any) {
    console.error("שגיאה בניתוח צווארי בקבוק:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /installer-schedule - לוח זמנים התקנות קרובות
// =====================================================
router.get("/installer-schedule", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.project_number, p.customer_name, p.customer_phone,
        p.customer_address, p.city, p.priority, p.products, p.notes,
        p.current_stage,
        s.started_at, s.assigned_to_name, s.assigned_to_role, s.sla_deadline, s.notes as stage_notes
      FROM supply_chain_projects p
      JOIN supply_chain_stages s ON s.project_id = p.id AND s.stage_name = p.current_stage
      WHERE p.current_stage IN ('installation_scheduled', 'installation_started', 'installation_completed')
      ORDER BY
        CASE p.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
        s.started_at ASC
    `);

    const schedule = result.rows.map((r: any) => ({
      ...r,
      current_stage_he: getStageInfo(r.current_stage)?.name_he || r.current_stage,
    }));

    res.json({ success: true, data: schedule, total: schedule.length });
  } catch (error: any) {
    console.error("שגיאה בשליפת לוח התקנות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /production-queue - תור ייצור
// =====================================================
router.get("/production-queue", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.project_number, p.customer_name, p.priority, p.products,
        p.current_stage, p.estimated_completion, p.notes,
        s.started_at, s.assigned_to_name, s.sla_deadline, s.is_overdue
      FROM supply_chain_projects p
      JOIN supply_chain_stages s ON s.project_id = p.id AND s.stage_name = p.current_stage
      WHERE p.current_stage IN ('production_scheduled', 'production_started', 'production_completed', 'quality_check')
      ORDER BY
        CASE p.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
        s.started_at ASC
    `);

    const queue = result.rows.map((r: any) => ({
      ...r,
      current_stage_he: getStageInfo(r.current_stage)?.name_he || r.current_stage,
    }));

    res.json({ success: true, data: queue, total: queue.length });
  } catch (error: any) {
    console.error("שגיאה בשליפת תור ייצור:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /measurement-queue - תור מדידות
// =====================================================
router.get("/measurement-queue", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.project_number, p.customer_name, p.customer_phone,
        p.customer_address, p.city, p.priority, p.products, p.notes,
        p.current_stage,
        s.started_at, s.assigned_to_name, s.sla_deadline, s.is_overdue
      FROM supply_chain_projects p
      JOIN supply_chain_stages s ON s.project_id = p.id AND s.stage_name = p.current_stage
      WHERE p.current_stage IN ('measurement_scheduled', 'measurement_done', 'measurement_approved')
      ORDER BY
        CASE p.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
        s.started_at ASC
    `);

    const queue = result.rows.map((r: any) => ({
      ...r,
      current_stage_he: getStageInfo(r.current_stage)?.name_he || r.current_stage,
    }));

    res.json({ success: true, data: queue, total: queue.length });
  } catch (error: any) {
    console.error("שגיאה בשליפת תור מדידות:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// GET /:id - פרויקט מלא עם כל השלבים
// =====================================================
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const project = await pool.query(
      `SELECT * FROM supply_chain_projects WHERE id = $1`,
      [id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ success: false, error: "פרויקט לא נמצא" });
    }

    // שליפת כל השלבים של הפרויקט
    const stages = await pool.query(
      `SELECT * FROM supply_chain_stages
       WHERE project_id = $1
       ORDER BY created_at ASC`,
      [id]
    );

    // שליפת התראות פעילות
    const alerts = await pool.query(
      `SELECT * FROM supply_chain_alerts
       WHERE project_id = $1 AND resolved = false
       ORDER BY
         CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END,
         created_at DESC`,
      [id]
    );

    const projectData = project.rows[0];
    const stageInfo = getStageInfo(projectData.current_stage);

    res.json({
      success: true,
      data: {
        ...projectData,
        current_stage_he: stageInfo?.name_he || projectData.current_stage,
        stage_progress: `${getStageIndex(projectData.current_stage) + 1}/${STAGE_FLOW.length}`,
        progress_percentage: Math.round(
          ((getStageIndex(projectData.current_stage) + 1) / STAGE_FLOW.length) * 100
        ),
        stages: stages.rows,
        active_alerts: alerts.rows,
        next_stage: getNextStage(projectData.current_stage),
        next_stage_he: getNextStage(projectData.current_stage)
          ? getStageInfo(getNextStage(projectData.current_stage)!)?.name_he
          : null,
      },
    });
  } catch (error: any) {
    console.error("שגיאה בשליפת פרויקט:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// PUT /:id - עדכון פרטי פרויקט
// =====================================================
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // בדיקה שהפרויקט קיים
    const existing = await pool.query(
      `SELECT id FROM supply_chain_projects WHERE id = $1`,
      [id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, error: "פרויקט לא נמצא" });
    }

    // שדות מותרים לעדכון
    const allowedFields = [
      "customer_name", "customer_phone", "customer_email", "customer_address", "city",
      "sales_agent_id", "sales_agent_name", "products", "total_amount", "vat_amount",
      "total_with_vat", "contract_signed", "contract_signed_date", "contract_document_url",
      "advance_payment", "advance_payment_date", "estimated_completion", "actual_completion",
      "priority", "notes",
    ];

    const updates: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const value = field === "products" ? JSON.stringify(req.body[field]) : req.body[field];
        updates.push(`${field} = $${paramIdx++}`);
        params.push(value);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: "לא סופקו שדות לעדכון" });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await pool.query(
      `UPDATE supply_chain_projects SET ${updates.join(", ")} WHERE id = $${paramIdx} RETURNING *`,
      params
    );

    res.json({
      success: true,
      message: "פרויקט עודכן בהצלחה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בעדכון פרויקט:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /:id/advance-stage - קידום פרויקט לשלב הבא
// =====================================================
router.post("/:id/advance-stage", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { id } = req.params;
    const { completed_by, notes, assigned_to_name, assigned_to_id } = req.body;

    // שליפת הפרויקט
    const project = await client.query(
      `SELECT * FROM supply_chain_projects WHERE id = $1 FOR UPDATE`,
      [id]
    );

    if (project.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "פרויקט לא נמצא" });
    }

    const p = project.rows[0];
    const currentStage = p.current_stage;
    const nextStageName = getNextStage(currentStage);

    // בדיקה שלא הגענו לסוף
    if (!nextStageName) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        error: "הפרויקט כבר בשלב הסופי - אי אפשר להתקדם",
      });
    }

    // בדיקה שהשלב הנוכחי דורש אישור ועדיין לא אושר
    if (STAGES_REQUIRING_APPROVAL.includes(currentStage)) {
      const currentStageRecord = await client.query(
        `SELECT * FROM supply_chain_stages
         WHERE project_id = $1 AND stage_name = $2 AND status = 'in_progress'
         LIMIT 1`,
        [id, currentStage]
      );
      if (
        currentStageRecord.rows.length > 0 &&
        !currentStageRecord.rows[0].approved_by
      ) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          success: false,
          error: `השלב "${getStageInfo(currentStage)?.name_he}" דורש אישור לפני מעבר לשלב הבא. יש לאשר את השלב קודם.`,
          stage_requiring_approval: currentStage,
        });
      }
    }

    // סגירת השלב הנוכחי
    await client.query(
      `UPDATE supply_chain_stages
       SET status = 'completed', completed_at = NOW(), notes = COALESCE(notes || E'\n', '') || COALESCE($2, ''), updated_at = NOW()
       WHERE project_id = $1 AND stage_name = $3 AND status = 'in_progress'`,
      [id, notes || null, currentStage]
    );

    // חישוב SLA לשלב הבא
    const nextStageInfo = getStageInfo(nextStageName);
    const slaHours = SLA_DEFAULTS[nextStageName] || null;
    const slaDeadline = slaHours
      ? new Date(Date.now() + slaHours * 3600000).toISOString()
      : null;

    // יצירת רשומת השלב הבא
    await client.query(
      `INSERT INTO supply_chain_stages (
        project_id, stage_name, stage_name_he, assigned_to_id, assigned_to_name, assigned_to_role,
        started_at, status, sla_hours, sla_deadline
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'in_progress', $7, $8)`,
      [
        id,
        nextStageName,
        nextStageInfo?.name_he || nextStageName,
        assigned_to_id || null,
        assigned_to_name || null,
        nextStageInfo?.role || null,
        slaHours,
        slaDeadline,
      ]
    );

    // עדכון היסטוריית שלבים ושלב נוכחי בפרויקט
    const stageHistoryEntry = {
      stage: nextStageName,
      at: new Date().toISOString(),
      by: completed_by || assigned_to_name || "מערכת",
    };

    await client.query(
      `UPDATE supply_chain_projects
       SET current_stage = $2,
           stage_history = stage_history || $3::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [id, nextStageName, JSON.stringify(stageHistoryEntry)]
    );

    // אם הפרויקט הגיע לשלב הסופי, עדכון תאריך סיום
    if (nextStageName === "project_completed") {
      await client.query(
        `UPDATE supply_chain_projects SET actual_completion = NOW() WHERE id = $1`,
        [id]
      );
    }

    // בדיקת SLA חריגה בשלב שנסגר (אם רלוונטי)
    const closedStage = await client.query(
      `SELECT * FROM supply_chain_stages
       WHERE project_id = $1 AND stage_name = $2 AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
      [id, currentStage]
    );

    if (
      closedStage.rows.length > 0 &&
      closedStage.rows[0].sla_deadline &&
      closedStage.rows[0].completed_at
    ) {
      const deadline = new Date(closedStage.rows[0].sla_deadline).getTime();
      const completed = new Date(closedStage.rows[0].completed_at).getTime();
      if (completed > deadline) {
        // סימון כחורג מ-SLA
        await client.query(
          `UPDATE supply_chain_stages SET is_overdue = true WHERE id = $1`,
          [closedStage.rows[0].id]
        );

        // יצירת התראת SLA
        const currentStageHe = getStageInfo(currentStage)?.name_he || currentStage;
        await client.query(
          `INSERT INTO supply_chain_alerts (
            project_id, stage_id, alert_type, severity, title, title_he, message, message_he, assigned_to
          ) VALUES ($1, $2, 'sla_violation', 'high',
            $3, $4, $5, $6, $7
          )`,
          [
            id,
            closedStage.rows[0].id,
            `SLA exceeded for stage: ${currentStage}`,
            `חריגה מ-SLA בשלב: ${currentStageHe}`,
            `Project ${p.project_number}: Stage "${currentStage}" exceeded SLA deadline.`,
            `פרויקט ${p.project_number}: השלב "${currentStageHe}" חרג ממועד ה-SLA.`,
            assigned_to_name || closedStage.rows[0].assigned_to_name || null,
          ]
        );
      }
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `פרויקט ${p.project_number} קודם לשלב: ${nextStageInfo?.name_he}`,
      data: {
        project_id: id,
        project_number: p.project_number,
        previous_stage: currentStage,
        previous_stage_he: getStageInfo(currentStage)?.name_he,
        new_stage: nextStageName,
        new_stage_he: nextStageInfo?.name_he,
        sla_hours: slaHours,
        sla_deadline: slaDeadline,
        progress: `${getStageIndex(nextStageName) + 1}/${STAGE_FLOW.length}`,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("שגיאה בקידום שלב:", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// POST /:id/stage/:stageId/approve - אישור שלב
// =====================================================
router.post("/:id/stage/:stageId/approve", async (req: Request, res: Response) => {
  try {
    const { id, stageId } = req.params;
    const { approved_by, approval_notes } = req.body;

    if (!approved_by) {
      return res.status(400).json({
        success: false,
        error: "חובה לציין מי מאשר (approved_by)",
      });
    }

    // בדיקה שהשלב קיים ושייך לפרויקט
    const stage = await pool.query(
      `SELECT s.*, p.project_number
       FROM supply_chain_stages s
       JOIN supply_chain_projects p ON p.id = s.project_id
       WHERE s.id = $1 AND s.project_id = $2`,
      [stageId, id]
    );

    if (stage.rows.length === 0) {
      return res.status(404).json({ success: false, error: "שלב לא נמצא בפרויקט" });
    }

    const s = stage.rows[0];

    if (s.status !== "in_progress") {
      return res.status(400).json({
        success: false,
        error: "ניתן לאשר רק שלב שנמצא בסטטוס in_progress",
      });
    }

    // עדכון האישור
    await pool.query(
      `UPDATE supply_chain_stages
       SET approved_by = $1, approved_at = NOW(), approval_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [approved_by, approval_notes || null, stageId]
    );

    res.json({
      success: true,
      message: `שלב "${s.stage_name_he}" אושר על ידי ${approved_by}`,
      data: {
        project_number: s.project_number,
        stage_name: s.stage_name,
        stage_name_he: s.stage_name_he,
        approved_by,
        approved_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("שגיאה באישור שלב:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /:id/stage/:stageId/report-issue - דיווח על בעיה בשלב
// =====================================================
router.post("/:id/stage/:stageId/report-issue", async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { id, stageId } = req.params;
    const {
      title,
      title_he,
      description,
      description_he,
      severity = "medium",
      reported_by,
    } = req.body;

    if (!title && !title_he) {
      return res.status(400).json({
        success: false,
        error: "חובה לציין כותרת לבעיה (title או title_he)",
      });
    }

    // בדיקה שהשלב קיים
    const stage = await client.query(
      `SELECT s.*, p.project_number, p.customer_name
       FROM supply_chain_stages s
       JOIN supply_chain_projects p ON p.id = s.project_id
       WHERE s.id = $1 AND s.project_id = $2`,
      [stageId, id]
    );

    if (stage.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, error: "שלב לא נמצא" });
    }

    const s = stage.rows[0];

    // הוספת הבעיה למערך הבעיות של השלב
    const issue = {
      title: title || title_he,
      title_he: title_he || title,
      description: description || description_he || "",
      severity,
      reported_by: reported_by || "לא ידוע",
      reported_at: new Date().toISOString(),
      resolved: false,
    };

    await client.query(
      `UPDATE supply_chain_stages
       SET issues = issues || $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(issue), stageId]
    );

    // יצירת התראה
    const alert = await client.query(
      `INSERT INTO supply_chain_alerts (
        project_id, stage_id, alert_type, severity,
        title, title_he, message, message_he, assigned_to
      ) VALUES ($1, $2, 'issue_reported', $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        id,
        stageId,
        severity,
        title || `Issue in ${s.stage_name}`,
        title_he || `בעיה בשלב ${s.stage_name_he}`,
        description || `Issue reported for project ${s.project_number} at stage ${s.stage_name}`,
        description_he || `בעיה דווחה בפרויקט ${s.project_number} בשלב ${s.stage_name_he}`,
        s.assigned_to_name || reported_by || null,
      ]
    );

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: `בעיה דווחה בהצלחה בשלב "${s.stage_name_he}"`,
      data: {
        issue,
        alert: alert.rows[0],
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("שגיאה בדיווח על בעיה:", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// POST /:id/stage/:stageId/upload-document - העלאת מסמך/תמונה לשלב
// =====================================================
router.post("/:id/stage/:stageId/upload-document", async (req: Request, res: Response) => {
  try {
    const { id, stageId } = req.params;
    const { type = "document", url, name, description, uploaded_by } = req.body;

    if (!url || !name) {
      return res.status(400).json({
        success: false,
        error: "חובה לציין url ו-name של המסמך",
      });
    }

    // בדיקה שהשלב קיים
    const stage = await pool.query(
      `SELECT s.id, s.stage_name_he FROM supply_chain_stages s
       WHERE s.id = $1 AND s.project_id = $2`,
      [stageId, id]
    );

    if (stage.rows.length === 0) {
      return res.status(404).json({ success: false, error: "שלב לא נמצא" });
    }

    const doc = {
      name,
      url,
      description: description || "",
      uploaded_by: uploaded_by || "מערכת",
      uploaded_at: new Date().toISOString(),
    };

    // הוספה למסמכים או תמונות בהתאם לסוג
    const field = type === "photo" ? "photos" : "documents";
    await pool.query(
      `UPDATE supply_chain_stages
       SET ${field} = ${field} || $1::jsonb, updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(doc), stageId]
    );

    res.json({
      success: true,
      message: `${type === "photo" ? "תמונה" : "מסמך"} הועלה בהצלחה לשלב "${stage.rows[0].stage_name_he}"`,
      data: doc,
    });
  } catch (error: any) {
    console.error("שגיאה בהעלאת מסמך:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// PUT /alerts/:id/acknowledge - אישור קבלת התראה
// =====================================================
router.put("/alerts/:id/acknowledge", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE supply_chain_alerts
       SET acknowledged = true, acknowledged_at = NOW()
       WHERE id = $1 AND acknowledged = false
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "התראה לא נמצאה או כבר אושרה",
      });
    }

    res.json({
      success: true,
      message: "התראה אושרה",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה באישור התראה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// PUT /alerts/:id/resolve - סגירת התראה
// =====================================================
router.put("/alerts/:id/resolve", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { resolved_by } = req.body;

    if (!resolved_by) {
      return res.status(400).json({
        success: false,
        error: "חובה לציין מי סוגר את ההתראה (resolved_by)",
      });
    }

    const result = await pool.query(
      `UPDATE supply_chain_alerts
       SET resolved = true, resolved_at = NOW(), resolved_by = $1
       WHERE id = $2 AND resolved = false
       RETURNING *`,
      [resolved_by, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "התראה לא נמצאה או כבר נסגרה",
      });
    }

    res.json({
      success: true,
      message: `התראה נסגרה על ידי ${resolved_by}`,
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("שגיאה בסגירת התראה:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// =====================================================
// POST /auto-check-sla - בדיקת SLA אוטומטית לכל השלבים הפעילים
// =====================================================
router.post("/auto-check-sla", async (_req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // מציאת כל השלבים הפעילים שחרגו מ-SLA
    const overdueStages = await client.query(`
      SELECT s.*, p.project_number, p.customer_name, p.priority
      FROM supply_chain_stages s
      JOIN supply_chain_projects p ON p.id = s.project_id
      WHERE s.status = 'in_progress'
        AND s.sla_deadline IS NOT NULL
        AND s.sla_deadline < NOW()
        AND s.is_overdue = false
    `);

    const alertsCreated: any[] = [];

    for (const stage of overdueStages.rows) {
      // סימון כחורג
      await client.query(
        `UPDATE supply_chain_stages SET is_overdue = true, updated_at = NOW() WHERE id = $1`,
        [stage.id]
      );

      // בדיקה שאין כבר התראת SLA פתוחה לשלב זה
      const existingAlert = await client.query(
        `SELECT id FROM supply_chain_alerts
         WHERE stage_id = $1 AND alert_type = 'sla_violation' AND resolved = false
         LIMIT 1`,
        [stage.id]
      );

      if (existingAlert.rows.length === 0) {
        const stageHe = stage.stage_name_he || getStageInfo(stage.stage_name)?.name_he || stage.stage_name;
        // חישוב שעות חריגה
        const hoursOverdue = Math.round(
          (Date.now() - new Date(stage.sla_deadline).getTime()) / 3600000
        );

        // קביעת חומרה לפי שעות חריגה ועדיפות הפרויקט
        let severity = "medium";
        if (hoursOverdue > 48 || stage.priority === "urgent") severity = "critical";
        else if (hoursOverdue > 24 || stage.priority === "high") severity = "high";

        const alert = await client.query(
          `INSERT INTO supply_chain_alerts (
            project_id, stage_id, alert_type, severity,
            title, title_he, message, message_he, assigned_to, auto_escalate
          ) VALUES ($1, $2, 'sla_violation', $3, $4, $5, $6, $7, $8, true)
          RETURNING *`,
          [
            stage.project_id,
            stage.id,
            severity,
            `SLA exceeded: ${stage.stage_name} (${hoursOverdue}h overdue)`,
            `חריגת SLA: ${stageHe} (${hoursOverdue} שעות באיחור)`,
            `Project ${stage.project_number} - Stage "${stage.stage_name}" has exceeded its SLA deadline by ${hoursOverdue} hours. Customer: ${stage.customer_name}`,
            `פרויקט ${stage.project_number} - השלב "${stageHe}" חורג מ-SLA ב-${hoursOverdue} שעות. לקוח: ${stage.customer_name}`,
            stage.assigned_to_name || null,
          ]
        );

        alertsCreated.push(alert.rows[0]);
      }
    }

    // בדיקת שלבים שעברו את ה-SLA פעם שנייה - אסקלציה
    const escalationCandidates = await client.query(`
      SELECT a.*, p.project_number
      FROM supply_chain_alerts a
      JOIN supply_chain_projects p ON p.id = a.project_id
      WHERE a.alert_type = 'sla_violation'
        AND a.resolved = false
        AND a.auto_escalate = true
        AND a.escalated_at IS NULL
        AND a.created_at < NOW() - INTERVAL '24 hours'
    `);

    const escalated: any[] = [];
    for (const alert of escalationCandidates.rows) {
      await client.query(
        `UPDATE supply_chain_alerts
         SET escalated_to = 'מנהל תפעול', escalated_at = NOW(), severity = 'critical'
         WHERE id = $1`,
        [alert.id]
      );
      escalated.push({
        alert_id: alert.id,
        project_number: alert.project_number,
        escalated_to: "מנהל תפעול",
      });
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: `בדיקת SLA הושלמה`,
      data: {
        overdue_found: overdueStages.rows.length,
        alerts_created: alertsCreated.length,
        alerts: alertsCreated,
        escalations: escalated,
      },
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("שגיאה בבדיקת SLA:", error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.release();
  }
});

// =====================================================
// ייצוא ברירת מחדל של הנתב
// =====================================================
export default router;
