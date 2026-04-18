// ===================================================================
// supply-chain-engine.ts
// מנוע שרשרת אספקה מלאה - מליד ועד סיום התקנה
// ניהול שלבים, מעקב פרויקטים, SLA, צווארי בקבוק ולוחות זמנים
// ===================================================================

import { pool } from "@workspace/db";
import { Router, Request, Response } from "express";

// ===================================================================
// טיפוסים וממשקים
// ===================================================================

/** שלב בשרשרת האספקה */
interface SupplyChainStage {
  id: number;
  stage_code: string;
  stage_name: string;
  stage_name_he: string;
  stage_order: number;
  department: string;
  default_duration_days: number;
  requires_approval: boolean;
  auto_advance: boolean;
  notifications: Record<string, any>;
  status: string;
  created_at: string;
  updated_at: string;
}

/** רשומת מעקב פרויקט בשרשרת */
interface SupplyChainTracking {
  id: number;
  project_id: number;
  project_name: string;
  customer_name: string;
  current_stage: string;
  stage_history: StageHistoryEntry[];
  started_at: string;
  estimated_completion: string;
  actual_completion: string | null;
  assigned_to: string;
  blockers: string | null;
  alerts: Alert[];
  sla_deadline: string | null;
  sla_breached: boolean;
  notes: string | null;
  status: "active" | "completed" | "on_hold" | "cancelled";
  created_at: string;
  updated_at: string;
}

/** כניסה בהיסטוריית שלבים */
interface StageHistoryEntry {
  stage_code: string;
  stage_name: string;
  entered_at: string;
  completed_at?: string;
  duration_days?: number;
  completed_by?: string;
  notes?: string;
}

/** התראה */
interface Alert {
  type: string;
  message: string;
  created_at: string;
  resolved?: boolean;
}

// ===================================================================
// שלבי ברירת מחדל - Seed Data
// כל שלב מייצג נקודה בתהליך מליד ועד סגירת פרויקט
// ===================================================================

const DEFAULT_STAGES: Omit<SupplyChainStage, "id" | "created_at" | "updated_at">[] = [
  { stage_code: "lead_received", stage_name: "Lead Received", stage_name_he: "ליד התקבל", stage_order: 1, department: "sales", default_duration_days: 1, requires_approval: false, auto_advance: false, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "sales_meeting", stage_name: "Sales Meeting", stage_name_he: "פגישת מכירות", stage_order: 2, department: "sales", default_duration_days: 3, requires_approval: false, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "quotation_sent", stage_name: "Quotation Sent", stage_name_he: "הצעת מחיר נשלחה", stage_order: 3, department: "sales", default_duration_days: 2, requires_approval: false, auto_advance: false, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "quotation_approved", stage_name: "Quotation Approved", stage_name_he: "הצעת מחיר אושרה", stage_order: 4, department: "sales", default_duration_days: 5, requires_approval: true, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "contract_signed", stage_name: "Contract Signed", stage_name_he: "חוזה נחתם", stage_order: 5, department: "sales", default_duration_days: 3, requires_approval: true, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "measurement_scheduled", stage_name: "Measurement Scheduled", stage_name_he: "מדידה תואמה", stage_order: 6, department: "engineering", default_duration_days: 3, requires_approval: false, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "measurement_completed", stage_name: "Measurement Completed", stage_name_he: "מדידה הושלמה", stage_order: 7, department: "engineering", default_duration_days: 1, requires_approval: false, auto_advance: true, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "engineering_design", stage_name: "Engineering Design", stage_name_he: "תכנון הנדסי", stage_order: 8, department: "engineering", default_duration_days: 7, requires_approval: false, auto_advance: false, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "design_approved", stage_name: "Design Approved", stage_name_he: "תכנון אושר", stage_order: 9, department: "engineering", default_duration_days: 3, requires_approval: true, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "material_ordering", stage_name: "Material Ordering", stage_name_he: "הזמנת חומרים", stage_order: 10, department: "procurement", default_duration_days: 2, requires_approval: true, auto_advance: false, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "materials_received", stage_name: "Materials Received", stage_name_he: "חומרים התקבלו", stage_order: 11, department: "procurement", default_duration_days: 14, requires_approval: false, auto_advance: true, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "production_scheduled", stage_name: "Production Scheduled", stage_name_he: "ייצור תוזמן", stage_order: 12, department: "production", default_duration_days: 2, requires_approval: false, auto_advance: false, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "production_started", stage_name: "Production Started", stage_name_he: "ייצור התחיל", stage_order: 13, department: "production", default_duration_days: 1, requires_approval: false, auto_advance: true, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "production_completed", stage_name: "Production Completed", stage_name_he: "ייצור הושלם", stage_order: 14, department: "production", default_duration_days: 10, requires_approval: false, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "quality_check", stage_name: "Quality Check", stage_name_he: "בדיקת איכות", stage_order: 15, department: "quality", default_duration_days: 2, requires_approval: true, auto_advance: false, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "painting", stage_name: "Painting", stage_name_he: "צביעה", stage_order: 16, department: "production", default_duration_days: 1, requires_approval: false, auto_advance: true, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "painting_completed", stage_name: "Painting Completed", stage_name_he: "צביעה הושלמה", stage_order: 17, department: "production", default_duration_days: 5, requires_approval: false, auto_advance: false, notifications: { email: true, sms: false }, status: "active" },
  { stage_code: "delivery_scheduled", stage_name: "Delivery Scheduled", stage_name_he: "משלוח תוזמן", stage_order: 18, department: "logistics", default_duration_days: 3, requires_approval: false, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "delivered", stage_name: "Delivered", stage_name_he: "נמסר", stage_order: 19, department: "logistics", default_duration_days: 1, requires_approval: false, auto_advance: true, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "installation_scheduled", stage_name: "Installation Scheduled", stage_name_he: "התקנה תוזמנה", stage_order: 20, department: "installation", default_duration_days: 3, requires_approval: false, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "installation_started", stage_name: "Installation Started", stage_name_he: "התקנה התחילה", stage_order: 21, department: "installation", default_duration_days: 1, requires_approval: false, auto_advance: true, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "installation_completed", stage_name: "Installation Completed", stage_name_he: "התקנה הושלמה", stage_order: 22, department: "installation", default_duration_days: 3, requires_approval: false, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "customer_inspection", stage_name: "Customer Inspection", stage_name_he: "בדיקת לקוח", stage_order: 23, department: "quality", default_duration_days: 2, requires_approval: true, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
  { stage_code: "project_closed", stage_name: "Project Closed", stage_name_he: "פרויקט נסגר", stage_order: 24, department: "management", default_duration_days: 1, requires_approval: false, auto_advance: false, notifications: { email: true, sms: true }, status: "active" },
];

// ===================================================================
// יצירת טבלאות בבסיס הנתונים
// ===================================================================

/** אתחול טבלאות שרשרת האספקה וזריעת שלבי ברירת מחדל */
export async function initSupplyChain(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // טבלת שלבי שרשרת אספקה
    await client.query(`
      CREATE TABLE IF NOT EXISTS supply_chain_stages (
        id SERIAL PRIMARY KEY,
        stage_code VARCHAR(100) UNIQUE NOT NULL,
        stage_name VARCHAR(255) NOT NULL,
        stage_name_he VARCHAR(255) NOT NULL,
        stage_order INTEGER NOT NULL,
        department VARCHAR(100) NOT NULL,
        default_duration_days INTEGER NOT NULL DEFAULT 1,
        requires_approval BOOLEAN NOT NULL DEFAULT false,
        auto_advance BOOLEAN NOT NULL DEFAULT false,
        notifications JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // טבלת מעקב שרשרת אספקה לכל פרויקט
    await client.query(`
      CREATE TABLE IF NOT EXISTS supply_chain_tracking (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        project_name VARCHAR(500) NOT NULL,
        customer_name VARCHAR(500) NOT NULL,
        current_stage VARCHAR(100) NOT NULL REFERENCES supply_chain_stages(stage_code),
        stage_history JSONB DEFAULT '[]',
        started_at TIMESTAMPTZ DEFAULT NOW(),
        estimated_completion DATE,
        actual_completion DATE,
        assigned_to VARCHAR(255),
        blockers TEXT,
        alerts JSONB DEFAULT '[]',
        sla_deadline TIMESTAMPTZ,
        sla_breached BOOLEAN DEFAULT false,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'on_hold', 'cancelled')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // אינדקסים לביצועים
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sct_project_id ON supply_chain_tracking(project_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sct_current_stage ON supply_chain_tracking(current_stage);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sct_status ON supply_chain_tracking(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sct_sla_deadline ON supply_chain_tracking(sla_deadline);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_scs_stage_order ON supply_chain_stages(stage_order);`);

    // זריעת שלבי ברירת מחדל - רק אם הטבלה ריקה
    const { rows: existingStages } = await client.query("SELECT COUNT(*) as cnt FROM supply_chain_stages");
    if (parseInt(existingStages[0].cnt) === 0) {
      for (const stage of DEFAULT_STAGES) {
        await client.query(
          `INSERT INTO supply_chain_stages (stage_code, stage_name, stage_name_he, stage_order, department, default_duration_days, requires_approval, auto_advance, notifications, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [stage.stage_code, stage.stage_name, stage.stage_name_he, stage.stage_order, stage.department, stage.default_duration_days, stage.requires_approval, stage.auto_advance, JSON.stringify(stage.notifications), stage.status]
        );
      }
      console.log("[supply-chain] זרעו 24 שלבי ברירת מחדל");
    }

    await client.query("COMMIT");
    console.log("[supply-chain] אתחול שרשרת אספקה הושלם בהצלחה");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[supply-chain] שגיאה באתחול:", err);
    throw err;
  } finally {
    client.release();
  }
}

// ===================================================================
// פונקציות ליבה
// ===================================================================

/** קידום פרויקט לשלב הבא בשרשרת */
export async function advanceStage(
  projectId: number,
  completedBy?: string,
  notes?: string
): Promise<{ success: boolean; newStage?: string; message: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // שליפת מעקב הפרויקט הנוכחי
    const { rows: trackingRows } = await client.query(
      "SELECT * FROM supply_chain_tracking WHERE project_id = $1 AND status = 'active' LIMIT 1",
      [projectId]
    );
    if (trackingRows.length === 0) {
      return { success: false, message: "לא נמצא פרויקט פעיל עם מזהה זה" };
    }
    const tracking = trackingRows[0] as SupplyChainTracking;

    // שליפת השלב הנוכחי והשלב הבא
    const { rows: currentStageRows } = await client.query(
      "SELECT * FROM supply_chain_stages WHERE stage_code = $1",
      [tracking.current_stage]
    );
    if (currentStageRows.length === 0) {
      return { success: false, message: "שלב נוכחי לא נמצא בהגדרות" };
    }
    const currentStage = currentStageRows[0] as SupplyChainStage;

    // בדיקה אם נדרש אישור
    if (currentStage.requires_approval && !completedBy) {
      return { success: false, message: `שלב "${currentStage.stage_name_he}" דורש אישור - יש לספק שם מאשר` };
    }

    // מציאת השלב הבא
    const { rows: nextStageRows } = await client.query(
      "SELECT * FROM supply_chain_stages WHERE stage_order = $1 AND status = 'active'",
      [currentStage.stage_order + 1]
    );

    // אם אין שלב הבא - הפרויקט הושלם
    if (nextStageRows.length === 0) {
      // עדכון היסטוריה - סגירת השלב האחרון
      const history: StageHistoryEntry[] = Array.isArray(tracking.stage_history) ? tracking.stage_history : [];
      if (history.length > 0) {
        history[history.length - 1].completed_at = new Date().toISOString();
        history[history.length - 1].completed_by = completedBy;
        history[history.length - 1].notes = notes;
      }

      await client.query(
        `UPDATE supply_chain_tracking
         SET status = 'completed', actual_completion = NOW(), stage_history = $1, updated_at = NOW()
         WHERE project_id = $2 AND status = 'active'`,
        [JSON.stringify(history), projectId]
      );

      await client.query("COMMIT");
      return { success: true, message: "הפרויקט הושלם בהצלחה! כל השלבים בוצעו." };
    }

    const nextStage = nextStageRows[0] as SupplyChainStage;

    // עדכון היסטוריית שלבים
    const history: StageHistoryEntry[] = Array.isArray(tracking.stage_history) ? tracking.stage_history : [];
    const now = new Date().toISOString();

    // סגירת השלב הנוכחי בהיסטוריה
    if (history.length > 0) {
      const lastEntry = history[history.length - 1];
      lastEntry.completed_at = now;
      lastEntry.completed_by = completedBy;
      lastEntry.notes = notes;
      if (lastEntry.entered_at) {
        const entered = new Date(lastEntry.entered_at);
        const completed = new Date(now);
        lastEntry.duration_days = Math.ceil((completed.getTime() - entered.getTime()) / (1000 * 60 * 60 * 24));
      }
    }

    // פתיחת שלב חדש בהיסטוריה
    history.push({
      stage_code: nextStage.stage_code,
      stage_name: nextStage.stage_name_he,
      entered_at: now,
    });

    // חישוב SLA חדש
    const slaDeadline = new Date();
    slaDeadline.setDate(slaDeadline.getDate() + nextStage.default_duration_days);

    // עדכון רשומת המעקב
    await client.query(
      `UPDATE supply_chain_tracking
       SET current_stage = $1, stage_history = $2, sla_deadline = $3, sla_breached = false, updated_at = NOW()
       WHERE project_id = $4 AND status = 'active'`,
      [nextStage.stage_code, JSON.stringify(history), slaDeadline.toISOString(), projectId]
    );

    await client.query("COMMIT");

    return {
      success: true,
      newStage: nextStage.stage_code,
      message: `הפרויקט קודם ל: ${nextStage.stage_name_he} (${nextStage.stage_name})`,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[supply-chain] שגיאה בקידום שלב:", err);
    return { success: false, message: `שגיאה בקידום: ${(err as Error).message}` };
  } finally {
    client.release();
  }
}

/** דשבורד שרשרת אספקה - סיכום כל הפרויקטים */
export async function getSupplyChainDashboard(): Promise<Record<string, any>> {
  const client = await pool.connect();
  try {
    // סטטיסטיקות כלליות
    const { rows: stats } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') as active_projects,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_projects,
        COUNT(*) FILTER (WHERE status = 'on_hold') as on_hold_projects,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_projects,
        COUNT(*) FILTER (WHERE sla_breached = true AND status = 'active') as sla_breached_count,
        COUNT(*) as total_projects
      FROM supply_chain_tracking
    `);

    // פרויקטים לפי שלב נוכחי
    const { rows: byStage } = await client.query(`
      SELECT
        t.current_stage,
        s.stage_name_he,
        s.department,
        COUNT(*) as project_count
      FROM supply_chain_tracking t
      JOIN supply_chain_stages s ON t.current_stage = s.stage_code
      WHERE t.status = 'active'
      GROUP BY t.current_stage, s.stage_name_he, s.department
      ORDER BY s.stage_order
    `);

    // פרויקטים לפי מחלקה
    const { rows: byDepartment } = await client.query(`
      SELECT
        s.department,
        COUNT(*) as project_count
      FROM supply_chain_tracking t
      JOIN supply_chain_stages s ON t.current_stage = s.stage_code
      WHERE t.status = 'active'
      GROUP BY s.department
      ORDER BY project_count DESC
    `);

    // פרויקטים שעומדים לפרוץ SLA בקרוב (48 שעות)
    const { rows: urgentSLA } = await client.query(`
      SELECT
        t.project_id, t.project_name, t.customer_name, t.current_stage,
        s.stage_name_he, t.sla_deadline, t.assigned_to
      FROM supply_chain_tracking t
      JOIN supply_chain_stages s ON t.current_stage = s.stage_code
      WHERE t.status = 'active'
        AND t.sla_deadline IS NOT NULL
        AND t.sla_deadline <= NOW() + INTERVAL '48 hours'
        AND t.sla_breached = false
      ORDER BY t.sla_deadline ASC
      LIMIT 20
    `);

    // פרויקטים שהושלמו לאחרונה
    const { rows: recentCompleted } = await client.query(`
      SELECT project_id, project_name, customer_name, actual_completion, started_at
      FROM supply_chain_tracking
      WHERE status = 'completed'
      ORDER BY actual_completion DESC
      LIMIT 10
    `);

    return {
      summary: stats[0] || {},
      byStage,
      byDepartment,
      urgentSLA,
      recentCompleted,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    client.release();
  }
}

/** זיהוי צווארי בקבוק בשרשרת */
export async function getBottlenecks(): Promise<Record<string, any>> {
  const client = await pool.connect();
  try {
    // שלבים עם הכי הרבה פרויקטים תקועים
    const { rows: congested } = await client.query(`
      SELECT
        t.current_stage,
        s.stage_name_he,
        s.department,
        s.default_duration_days,
        COUNT(*) as stuck_count,
        AVG(EXTRACT(EPOCH FROM (NOW() - t.updated_at)) / 86400)::NUMERIC(10,1) as avg_days_in_stage
      FROM supply_chain_tracking t
      JOIN supply_chain_stages s ON t.current_stage = s.stage_code
      WHERE t.status = 'active'
      GROUP BY t.current_stage, s.stage_name_he, s.department, s.default_duration_days
      HAVING COUNT(*) > 1 OR AVG(EXTRACT(EPOCH FROM (NOW() - t.updated_at)) / 86400) > s.default_duration_days
      ORDER BY stuck_count DESC, avg_days_in_stage DESC
    `);

    // פרויקטים שחורגים מה-SLA
    const { rows: breached } = await client.query(`
      SELECT
        t.project_id, t.project_name, t.customer_name, t.current_stage,
        s.stage_name_he, s.department, t.sla_deadline, t.assigned_to, t.blockers,
        EXTRACT(EPOCH FROM (NOW() - t.sla_deadline) / 86400)::NUMERIC(10,1) as days_overdue
      FROM supply_chain_tracking t
      JOIN supply_chain_stages s ON t.current_stage = s.stage_code
      WHERE t.status = 'active' AND t.sla_breached = true
      ORDER BY days_overdue DESC
    `);

    // שלבים שלוקחים יותר זמן מהממוצע (ניתוח היסטורי)
    const { rows: slowStages } = await client.query(`
      SELECT
        s.stage_code, s.stage_name_he, s.default_duration_days,
        COUNT(t.id) as total_passed,
        AVG(
          CASE WHEN h.value->>'duration_days' IS NOT NULL
          THEN (h.value->>'duration_days')::NUMERIC ELSE NULL END
        )::NUMERIC(10,1) as avg_actual_days
      FROM supply_chain_stages s
      LEFT JOIN supply_chain_tracking t ON true
      LEFT JOIN LATERAL jsonb_array_elements(t.stage_history) h ON h.value->>'stage_code' = s.stage_code
      WHERE h.value->>'completed_at' IS NOT NULL
      GROUP BY s.stage_code, s.stage_name_he, s.default_duration_days
      HAVING AVG((h.value->>'duration_days')::NUMERIC) > s.default_duration_days * 1.2
      ORDER BY avg_actual_days DESC
    `);

    return {
      congested,
      slaBreached: breached,
      slowStages,
      analysis: {
        totalBottlenecks: congested.length,
        totalBreached: breached.length,
        mostCongestedStage: congested[0]?.stage_name_he || "אין",
        mostCongestedDepartment: congested[0]?.department || "אין",
      },
      generatedAt: new Date().toISOString(),
    };
  } finally {
    client.release();
  }
}

/** ציר זמן של פרויקט ספציפי */
export async function getProjectTimeline(projectId: number): Promise<Record<string, any> | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT t.*, s.stage_name_he, s.stage_order, s.department, s.default_duration_days
       FROM supply_chain_tracking t
       JOIN supply_chain_stages s ON t.current_stage = s.stage_code
       WHERE t.project_id = $1
       ORDER BY t.created_at DESC
       LIMIT 1`,
      [projectId]
    );
    if (rows.length === 0) return null;

    const project = rows[0];
    const history: StageHistoryEntry[] = Array.isArray(project.stage_history) ? project.stage_history : [];

    // שליפת כל השלבים לחישוב אחוז התקדמות
    const { rows: allStages } = await client.query(
      "SELECT stage_code, stage_name_he, stage_order FROM supply_chain_stages ORDER BY stage_order"
    );
    const totalStages = allStages.length;
    const currentOrder = project.stage_order as number;
    const progressPercent = Math.round((currentOrder / totalStages) * 100);

    // חישוב זמנים
    const startedAt = new Date(project.started_at);
    const now = new Date();
    const totalDaysElapsed = Math.ceil((now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
      projectId: project.project_id,
      projectName: project.project_name,
      customerName: project.customer_name,
      currentStage: {
        code: project.current_stage,
        name: project.stage_name_he,
        department: project.department,
        order: currentOrder,
      },
      progress: {
        completedStages: history.filter((h) => h.completed_at).length,
        totalStages,
        percent: progressPercent,
      },
      timeline: history.map((h) => ({
        ...h,
        isCompleted: !!h.completed_at,
        wasOverdue: h.duration_days
          ? h.duration_days > (allStages.find((s: any) => s.stage_code === h.stage_code) as any)?.default_duration_days
          : false,
      })),
      remainingStages: allStages
        .filter((s: any) => s.stage_order > currentOrder)
        .map((s: any) => ({ code: s.stage_code, name: s.stage_name_he })),
      stats: {
        totalDaysElapsed,
        estimatedCompletion: project.estimated_completion,
        slaDeadline: project.sla_deadline,
        slaBreached: project.sla_breached,
      },
      blockers: project.blockers,
      notes: project.notes,
      status: project.status,
      assignedTo: project.assigned_to,
    };
  } finally {
    client.release();
  }
}

/** בדיקת SLA - מסמן פרויקטים שחרגו מזמן היעד */
export async function checkSLAs(): Promise<{ breachedCount: number; alertsSent: number }> {
  const client = await pool.connect();
  try {
    // סימון פרויקטים שפרצו SLA
    const { rowCount: breachedCount } = await client.query(`
      UPDATE supply_chain_tracking
      SET sla_breached = true,
          alerts = alerts || jsonb_build_array(jsonb_build_object(
            'type', 'sla_breach',
            'message', 'פרויקט חרג ממועד ה-SLA',
            'created_at', NOW()::TEXT,
            'resolved', false
          )),
          updated_at = NOW()
      WHERE status = 'active'
        AND sla_deadline IS NOT NULL
        AND sla_deadline < NOW()
        AND sla_breached = false
    `);

    // התראות על פרויקטים שקרובים לחריגה (24 שעות)
    const { rowCount: alertsSent } = await client.query(`
      UPDATE supply_chain_tracking
      SET alerts = alerts || jsonb_build_array(jsonb_build_object(
            'type', 'sla_warning',
            'message', 'פרויקט עומד לחרוג מ-SLA תוך 24 שעות',
            'created_at', NOW()::TEXT,
            'resolved', false
          )),
          updated_at = NOW()
      WHERE status = 'active'
        AND sla_deadline IS NOT NULL
        AND sla_deadline BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
        AND sla_breached = false
        AND NOT (alerts @> '[{"type": "sla_warning"}]')
    `);

    console.log(`[supply-chain] בדיקת SLA: ${breachedCount || 0} חריגות, ${alertsSent || 0} התראות`);
    return { breachedCount: breachedCount || 0, alertsSent: alertsSent || 0 };
  } finally {
    client.release();
  }
}

// ===================================================================
// Express Router - נתיבי API
// ===================================================================

export const supplyChainRouter = Router();

// --- CRUD שלבים ---

/** שליפת כל השלבים */
supplyChainRouter.get("/stages", async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query("SELECT * FROM supply_chain_stages ORDER BY stage_order ASC");
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** יצירת שלב חדש */
supplyChainRouter.post("/stages", async (req: Request, res: Response) => {
  try {
    const { stage_code, stage_name, stage_name_he, stage_order, department, default_duration_days, requires_approval, auto_advance, notifications } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO supply_chain_stages (stage_code, stage_name, stage_name_he, stage_order, department, default_duration_days, requires_approval, auto_advance, notifications)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [stage_code, stage_name, stage_name_he, stage_order, department, default_duration_days || 1, requires_approval || false, auto_advance || false, JSON.stringify(notifications || {})]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** עדכון שלב */
supplyChainRouter.put("/stages/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === "id" || key === "created_at") continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(key === "notifications" ? JSON.stringify(value) : value);
      idx++;
    }
    setClauses.push(`updated_at = NOW()`);
    values.push(parseInt(id));

    const { rows } = await pool.query(
      `UPDATE supply_chain_stages SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** מחיקת שלב */
supplyChainRouter.delete("/stages/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE supply_chain_stages SET status = 'deleted' WHERE id = $1", [parseInt(id)]);
    res.json({ success: true, message: "שלב הוסר" });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// --- CRUD מעקב פרויקטים ---

/** שליפת כל רשומות המעקב */
supplyChainRouter.get("/tracking", async (req: Request, res: Response) => {
  try {
    const { status, stage, department } = req.query;
    let query = `
      SELECT t.*, s.stage_name_he, s.stage_order, s.department
      FROM supply_chain_tracking t
      JOIN supply_chain_stages s ON t.current_stage = s.stage_code
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (status) {
      query += ` AND t.status = $${idx}`;
      params.push(status);
      idx++;
    }
    if (stage) {
      query += ` AND t.current_stage = $${idx}`;
      params.push(stage);
      idx++;
    }
    if (department) {
      query += ` AND s.department = $${idx}`;
      params.push(department);
      idx++;
    }

    query += " ORDER BY t.updated_at DESC";
    const { rows } = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** יצירת רשומת מעקב חדשה (פרויקט חדש בשרשרת) */
supplyChainRouter.post("/tracking", async (req: Request, res: Response) => {
  try {
    const { project_id, project_name, customer_name, assigned_to, estimated_completion, notes } = req.body;
    const firstStage = "lead_received";

    // חישוב SLA ראשוני
    const { rows: stageRows } = await pool.query(
      "SELECT default_duration_days FROM supply_chain_stages WHERE stage_code = $1",
      [firstStage]
    );
    const slaDays = stageRows[0]?.default_duration_days || 1;
    const slaDeadline = new Date();
    slaDeadline.setDate(slaDeadline.getDate() + slaDays);

    const initialHistory: StageHistoryEntry[] = [
      {
        stage_code: firstStage,
        stage_name: "ליד התקבל",
        entered_at: new Date().toISOString(),
      },
    ];

    const { rows } = await pool.query(
      `INSERT INTO supply_chain_tracking
       (project_id, project_name, customer_name, current_stage, stage_history, assigned_to, estimated_completion, sla_deadline, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [project_id, project_name, customer_name, firstStage, JSON.stringify(initialHistory), assigned_to, estimated_completion, slaDeadline.toISOString(), notes]
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** עדכון רשומת מעקב */
supplyChainRouter.put("/tracking/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const setClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (key === "id" || key === "created_at") continue;
      setClauses.push(`${key} = $${idx}`);
      values.push(["stage_history", "alerts", "notifications"].includes(key) ? JSON.stringify(value) : value);
      idx++;
    }
    setClauses.push(`updated_at = NOW()`);
    values.push(parseInt(id));

    const { rows } = await pool.query(
      `UPDATE supply_chain_tracking SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** מחיקת רשומת מעקב (ביטול) */
supplyChainRouter.delete("/tracking/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await pool.query("UPDATE supply_chain_tracking SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [parseInt(id)]);
    res.json({ success: true, message: "רשומת מעקב בוטלה" });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// --- נתיבים מתקדמים ---

/** קידום פרויקט לשלב הבא */
supplyChainRouter.post("/advance/:projectId", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { completed_by, notes } = req.body;
    const result = await advanceStage(projectId, completed_by, notes);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** דשבורד שרשרת אספקה */
supplyChainRouter.get("/dashboard", async (_req: Request, res: Response) => {
  try {
    const dashboard = await getSupplyChainDashboard();
    res.json({ success: true, data: dashboard });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** צווארי בקבוק */
supplyChainRouter.get("/bottlenecks", async (_req: Request, res: Response) => {
  try {
    const bottlenecks = await getBottlenecks();
    res.json({ success: true, data: bottlenecks });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** ציר זמן של פרויקט */
supplyChainRouter.get("/timeline/:projectId", async (req: Request, res: Response) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const timeline = await getProjectTimeline(projectId);
    if (!timeline) {
      return res.status(404).json({ success: false, error: "פרויקט לא נמצא" });
    }
    res.json({ success: true, data: timeline });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/** בדיקת התראות SLA */
supplyChainRouter.get("/sla-alerts", async (_req: Request, res: Response) => {
  try {
    const result = await checkSLAs();
    // שליפת כל הפרויקטים עם SLA שנפרצו
    const { rows: alerts } = await pool.query(`
      SELECT t.project_id, t.project_name, t.customer_name, t.current_stage,
             s.stage_name_he, t.sla_deadline, t.assigned_to, t.alerts
      FROM supply_chain_tracking t
      JOIN supply_chain_stages s ON t.current_stage = s.stage_code
      WHERE t.status = 'active' AND (t.sla_breached = true OR t.sla_deadline <= NOW() + INTERVAL '24 hours')
      ORDER BY t.sla_deadline ASC
    `);
    res.json({ success: true, data: { ...result, alerts } });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default supplyChainRouter;
