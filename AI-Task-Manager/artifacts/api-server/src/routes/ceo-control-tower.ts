// ============================================================================
// מגדל הפיקוד של המנכ"ל - CEO Control Tower
// מרכז הפיקוד האולטימטיבי שמאגד את כל הנתונים מכל המודולים
// מסך יחיד שנותן למנכ"ל תמונה מלאה של החברה כולה
// ============================================================================

import { Router } from "express";
import { pool } from "@workspace/db";

const router = Router();

// ============================================================================
// אתחול טבלאות - יצירת כל הטבלאות של מגדל הפיקוד
// ============================================================================
router.post("/init", async (_req, res) => {
  try {
    await pool.query(`
      -- תמונת מצב יומית של החברה
      CREATE TABLE IF NOT EXISTS company_daily_snapshot (
        id SERIAL PRIMARY KEY,
        snapshot_date DATE UNIQUE,
        revenue_today NUMERIC(15,2) DEFAULT 0,
        expenses_today NUMERIC(15,2) DEFAULT 0,
        profit_today NUMERIC(15,2) DEFAULT 0,
        revenue_mtd NUMERIC(15,2) DEFAULT 0,
        expenses_mtd NUMERIC(15,2) DEFAULT 0,
        profit_mtd NUMERIC(15,2) DEFAULT 0,
        revenue_ytd NUMERIC(15,2) DEFAULT 0,
        cash_position NUMERIC(15,2) DEFAULT 0,
        ar_total NUMERIC(15,2) DEFAULT 0,
        ap_total NUMERIC(15,2) DEFAULT 0,
        ar_overdue NUMERIC(15,2) DEFAULT 0,
        ap_overdue NUMERIC(15,2) DEFAULT 0,
        active_projects INTEGER DEFAULT 0,
        projects_at_risk INTEGER DEFAULT 0,
        production_utilization NUMERIC(5,2) DEFAULT 0,
        new_leads_today INTEGER DEFAULT 0,
        deals_closed_today INTEGER DEFAULT 0,
        deals_value_today NUMERIC(15,2) DEFAULT 0,
        employees_present INTEGER DEFAULT 0,
        employees_total INTEGER DEFAULT 0,
        open_support_tickets INTEGER DEFAULT 0,
        safety_incidents INTEGER DEFAULT 0,
        inventory_value NUMERIC(15,2) DEFAULT 0,
        low_stock_alerts INTEGER DEFAULT 0,
        overdue_tasks INTEGER DEFAULT 0,
        pending_approvals INTEGER DEFAULT 0,
        customer_satisfaction NUMERIC(5,2) DEFAULT 0,
        ai_health_score INTEGER DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- יעדי KPI של החברה
      CREATE TABLE IF NOT EXISTS company_kpi_targets (
        id SERIAL PRIMARY KEY,
        kpi_name VARCHAR(200),
        kpi_name_he VARCHAR(200),
        category VARCHAR(100),
        target_value NUMERIC(15,2),
        actual_value NUMERIC(15,2) DEFAULT 0,
        unit VARCHAR(50),
        period VARCHAR(20),
        fiscal_year INTEGER,
        trend VARCHAR(20),
        achievement_percent NUMERIC(5,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'on_track',
        owner VARCHAR(200),
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- התראות חברה
      CREATE TABLE IF NOT EXISTS company_alerts (
        id SERIAL PRIMARY KEY,
        alert_type VARCHAR(100),
        severity VARCHAR(20),
        source_module VARCHAR(100),
        title VARCHAR(500),
        title_he VARCHAR(500),
        message TEXT,
        metric_name VARCHAR(200),
        metric_value NUMERIC(15,2),
        threshold_value NUMERIC(15,2),
        action_required TEXT,
        action_url VARCHAR(500),
        acknowledged BOOLEAN DEFAULT false,
        acknowledged_by VARCHAR,
        resolved BOOLEAN DEFAULT false,
        resolved_at TIMESTAMPTZ,
        auto_generated BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- יעדים אסטרטגיים
      CREATE TABLE IF NOT EXISTS strategic_goals (
        id SERIAL PRIMARY KEY,
        goal_name VARCHAR(500),
        goal_name_he VARCHAR(500),
        category VARCHAR(100),
        description TEXT,
        target_value NUMERIC(15,2),
        current_value NUMERIC(15,2) DEFAULT 0,
        unit VARCHAR(50),
        start_date DATE,
        target_date DATE,
        owner VARCHAR(200),
        milestones JSONB DEFAULT '[]',
        progress_percent NUMERIC(5,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        priority VARCHAR(20) DEFAULT 'high',
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- אינדקסים לביצועים מיטביים
      CREATE INDEX IF NOT EXISTS idx_snapshot_date ON company_daily_snapshot(snapshot_date DESC);
      CREATE INDEX IF NOT EXISTS idx_kpi_category ON company_kpi_targets(category);
      CREATE INDEX IF NOT EXISTS idx_kpi_fiscal_year ON company_kpi_targets(fiscal_year);
      CREATE INDEX IF NOT EXISTS idx_kpi_status ON company_kpi_targets(status);
      CREATE INDEX IF NOT EXISTS idx_alerts_severity ON company_alerts(severity);
      CREATE INDEX IF NOT EXISTS idx_alerts_resolved ON company_alerts(resolved);
      CREATE INDEX IF NOT EXISTS idx_alerts_source ON company_alerts(source_module);
      CREATE INDEX IF NOT EXISTS idx_alerts_created ON company_alerts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_goals_status ON strategic_goals(status);
      CREATE INDEX IF NOT EXISTS idx_goals_category ON strategic_goals(category);
      CREATE INDEX IF NOT EXISTS idx_goals_priority ON strategic_goals(priority);
    `);

    res.json({ success: true, message: "טבלאות מגדל הפיקוד של המנכ\"ל אותחלו בהצלחה" });
  } catch (err: any) {
    console.error("שגיאה באתחול טבלאות מגדל הפיקוד:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// CRUD - תמונת מצב יומית (company_daily_snapshot)
// ============================================================================

// שליפת כל התמונות היומיות
router.get("/snapshots", async (req, res) => {
  try {
    const { limit = 30, offset = 0, from_date, to_date } = req.query;
    let query = `SELECT * FROM company_daily_snapshot WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    // סינון לפי טווח תאריכים
    if (from_date) {
      query += ` AND snapshot_date >= $${idx++}`;
      params.push(from_date);
    }
    if (to_date) {
      query += ` AND snapshot_date <= $${idx++}`;
      params.push(to_date);
    }

    query += ` ORDER BY snapshot_date DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const countRes = await pool.query(`SELECT COUNT(*) FROM company_daily_snapshot`);
    res.json({ data: result.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err: any) {
    console.error("שגיאה בשליפת תמונות מצב:", err);
    res.status(500).json({ error: err.message });
  }
});

// שליפת תמונת מצב בודדת לפי מזהה
router.get("/snapshots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`SELECT * FROM company_daily_snapshot WHERE id = $1`, [id]);
    if (!result.rows.length) return res.status(404).json({ error: "תמונת מצב לא נמצאה" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// יצירת תמונת מצב חדשה
router.post("/snapshots", async (req, res) => {
  try {
    const {
      snapshot_date, revenue_today, expenses_today, profit_today,
      revenue_mtd, expenses_mtd, profit_mtd, revenue_ytd, cash_position,
      ar_total, ap_total, ar_overdue, ap_overdue, active_projects,
      projects_at_risk, production_utilization, new_leads_today,
      deals_closed_today, deals_value_today, employees_present,
      employees_total, open_support_tickets, safety_incidents,
      inventory_value, low_stock_alerts, overdue_tasks,
      pending_approvals, customer_satisfaction, ai_health_score, notes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO company_daily_snapshot (
        snapshot_date, revenue_today, expenses_today, profit_today,
        revenue_mtd, expenses_mtd, profit_mtd, revenue_ytd, cash_position,
        ar_total, ap_total, ar_overdue, ap_overdue, active_projects,
        projects_at_risk, production_utilization, new_leads_today,
        deals_closed_today, deals_value_today, employees_present,
        employees_total, open_support_tickets, safety_incidents,
        inventory_value, low_stock_alerts, overdue_tasks,
        pending_approvals, customer_satisfaction, ai_health_score, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
      RETURNING *`,
      [
        snapshot_date, revenue_today, expenses_today, profit_today,
        revenue_mtd, expenses_mtd, profit_mtd, revenue_ytd, cash_position,
        ar_total, ap_total, ar_overdue, ap_overdue, active_projects,
        projects_at_risk, production_utilization, new_leads_today,
        deals_closed_today, deals_value_today, employees_present,
        employees_total, open_support_tickets, safety_incidents,
        inventory_value, low_stock_alerts, overdue_tasks,
        pending_approvals, customer_satisfaction, ai_health_score, notes
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error("שגיאה ביצירת תמונת מצב:", err);
    res.status(500).json({ error: err.message });
  }
});

// עדכון תמונת מצב
router.put("/snapshots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const keys = Object.keys(fields);
    if (!keys.length) return res.status(400).json({ error: "לא סופקו שדות לעדכון" });

    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const vals = keys.map((k) => fields[k]);
    vals.push(id);

    const result = await pool.query(
      `UPDATE company_daily_snapshot SET ${sets} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: "תמונת מצב לא נמצאה" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// מחיקה רכה - סימון כמבוטלת (לא מוחקים לעולם!)
router.delete("/snapshots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    // לא מוחקים! רק מסמנים בהערה
    const result = await pool.query(
      `UPDATE company_daily_snapshot SET notes = COALESCE(notes, '') || ' [בוטל]' WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "תמונת מצב לא נמצאה" });
    res.json({ success: true, message: "תמונת המצב סומנה כמבוטלת", data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// CRUD - יעדי KPI (company_kpi_targets)
// ============================================================================

// שליפת כל ה-KPIs
router.get("/kpis", async (req, res) => {
  try {
    const { category, fiscal_year, status, limit = 100, offset = 0 } = req.query;
    let query = `SELECT * FROM company_kpi_targets WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (category) { query += ` AND category = $${idx++}`; params.push(category); }
    if (fiscal_year) { query += ` AND fiscal_year = $${idx++}`; params.push(fiscal_year); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }

    query += ` ORDER BY category, kpi_name LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const countRes = await pool.query(`SELECT COUNT(*) FROM company_kpi_targets`);
    res.json({ data: result.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// שליפת KPI בודד
router.get("/kpis/:id", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM company_kpi_targets WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "KPI לא נמצא" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// יצירת KPI חדש
router.post("/kpis", async (req, res) => {
  try {
    const {
      kpi_name, kpi_name_he, category, target_value, actual_value,
      unit, period, fiscal_year, trend, achievement_percent, status, owner, notes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO company_kpi_targets (
        kpi_name, kpi_name_he, category, target_value, actual_value,
        unit, period, fiscal_year, trend, achievement_percent, status, owner, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [kpi_name, kpi_name_he, category, target_value, actual_value,
       unit, period, fiscal_year, trend, achievement_percent, status, owner, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// עדכון KPI
router.put("/kpis/:id", async (req, res) => {
  try {
    const fields = req.body;
    const keys = Object.keys(fields);
    if (!keys.length) return res.status(400).json({ error: "לא סופקו שדות" });

    // עדכון אוטומטי של אחוז ההשגה
    if (fields.actual_value && fields.target_value) {
      fields.achievement_percent = ((fields.actual_value / fields.target_value) * 100).toFixed(2);
    }
    fields.updated_at = new Date().toISOString();

    const finalKeys = Object.keys(fields);
    const sets = finalKeys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const vals = finalKeys.map((k) => fields[k]);
    vals.push(req.params.id);

    const result = await pool.query(
      `UPDATE company_kpi_targets SET ${sets} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: "KPI לא נמצא" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// מחיקה רכה של KPI
router.delete("/kpis/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE company_kpi_targets SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "KPI לא נמצא" });
    res.json({ success: true, message: "KPI הועבר לארכיון", data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// CRUD - התראות חברה (company_alerts)
// ============================================================================

// שליפת כל ההתראות
router.get("/alerts", async (req, res) => {
  try {
    const { severity, source_module, resolved, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM company_alerts WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (severity) { query += ` AND severity = $${idx++}`; params.push(severity); }
    if (source_module) { query += ` AND source_module = $${idx++}`; params.push(source_module); }
    if (resolved !== undefined) { query += ` AND resolved = $${idx++}`; params.push(resolved === "true"); }

    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const countRes = await pool.query(`SELECT COUNT(*) FROM company_alerts`);
    res.json({ data: result.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// שליפת התראה בודדת
router.get("/alerts/:id", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM company_alerts WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "התראה לא נמצאה" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// יצירת התראה חדשה
router.post("/alerts", async (req, res) => {
  try {
    const {
      alert_type, severity, source_module, title, title_he, message,
      metric_name, metric_value, threshold_value, action_required,
      action_url, auto_generated
    } = req.body;

    const result = await pool.query(
      `INSERT INTO company_alerts (
        alert_type, severity, source_module, title, title_he, message,
        metric_name, metric_value, threshold_value, action_required,
        action_url, auto_generated
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [alert_type, severity, source_module, title, title_he, message,
       metric_name, metric_value, threshold_value, action_required,
       action_url, auto_generated ?? true]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// עדכון התראה (אישור / פתרון)
router.put("/alerts/:id", async (req, res) => {
  try {
    const fields = req.body;
    // אם מסמנים כנפתרה, מוסיפים תאריך פתרון
    if (fields.resolved === true && !fields.resolved_at) {
      fields.resolved_at = new Date().toISOString();
    }

    const keys = Object.keys(fields);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const vals = keys.map((k) => fields[k]);
    vals.push(req.params.id);

    const result = await pool.query(
      `UPDATE company_alerts SET ${sets} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: "התראה לא נמצאה" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// מחיקה רכה של התראה - סימון כנפתרה
router.delete("/alerts/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE company_alerts SET resolved = true, resolved_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "התראה לא נמצאה" });
    res.json({ success: true, message: "התראה סומנה כנפתרה", data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// CRUD - יעדים אסטרטגיים (strategic_goals)
// ============================================================================

// שליפת כל היעדים
router.get("/goals", async (req, res) => {
  try {
    const { category, status, priority, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM strategic_goals WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (category) { query += ` AND category = $${idx++}`; params.push(category); }
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (priority) { query += ` AND priority = $${idx++}`; params.push(priority); }

    query += ` ORDER BY priority DESC, target_date ASC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    const countRes = await pool.query(`SELECT COUNT(*) FROM strategic_goals`);
    res.json({ data: result.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// שליפת יעד בודד
router.get("/goals/:id", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM strategic_goals WHERE id = $1`, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "יעד לא נמצא" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// יצירת יעד אסטרטגי חדש
router.post("/goals", async (req, res) => {
  try {
    const {
      goal_name, goal_name_he, category, description, target_value,
      current_value, unit, start_date, target_date, owner,
      milestones, progress_percent, status, priority, notes
    } = req.body;

    const result = await pool.query(
      `INSERT INTO strategic_goals (
        goal_name, goal_name_he, category, description, target_value,
        current_value, unit, start_date, target_date, owner,
        milestones, progress_percent, status, priority, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [goal_name, goal_name_he, category, description, target_value,
       current_value, unit, start_date, target_date, owner,
       JSON.stringify(milestones || []), progress_percent, status, priority, notes]
    );

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// עדכון יעד אסטרטגי
router.put("/goals/:id", async (req, res) => {
  try {
    const fields = req.body;
    if (fields.milestones) fields.milestones = JSON.stringify(fields.milestones);
    fields.updated_at = new Date().toISOString();

    // חישוב אוטומטי של אחוז התקדמות
    if (fields.current_value !== undefined && fields.target_value !== undefined) {
      fields.progress_percent = ((fields.current_value / fields.target_value) * 100).toFixed(2);
    }

    const keys = Object.keys(fields);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const vals = keys.map((k) => fields[k]);
    vals.push(req.params.id);

    const result = await pool.query(
      `UPDATE strategic_goals SET ${sets} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!result.rows.length) return res.status(404).json({ error: "יעד לא נמצא" });
    res.json(result.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// מחיקה רכה של יעד - העברה לארכיון
router.delete("/goals/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE strategic_goals SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: "יעד לא נמצא" });
    res.json({ success: true, message: "יעד הועבר לארכיון", data: result.rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// דשבורד המנכ"ל - THE ULTIMATE CEO DASHBOARD
// מאגד נתונים מכל הטבלאות וכל המודולים בחברה
// ============================================================================
router.get("/dashboard", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const firstOfYear = `${now.getFullYear()}-01-01`;

    // שליפה מקבילית מכל המקורות - מקסימום מהירות
    const [
      snapshotRes,
      prevSnapshotRes,
      kpisRes,
      activeAlertsRes,
      goalsRes,
      // נתונים ממודולים אחרים (עם catch למקרה שהטבלה לא קיימת)
      salesOrdersRes,
      invoicesRes,
      expensesRes,
      projectsRes,
      employeesRes,
      leadsRes,
      inventoryRes,
      supportRes,
      productionRes,
      bankRes,
      arRes,
      apRes,
      quotationsRes,
      workOrdersRes,
      qcRes,
    ] = await Promise.all([
      // תמונת מצב של היום
      pool.query(`SELECT * FROM company_daily_snapshot WHERE snapshot_date = $1`, [today]).catch(() => ({ rows: [] })),
      // תמונת מצב של אתמול להשוואה
      pool.query(`SELECT * FROM company_daily_snapshot WHERE snapshot_date = $1 - INTERVAL '1 day'`, [today]).catch(() => ({ rows: [] })),
      // KPIs פעילים
      pool.query(`SELECT * FROM company_kpi_targets WHERE status != 'archived' AND fiscal_year = $1 ORDER BY category`, [now.getFullYear()]).catch(() => ({ rows: [] })),
      // התראות פעילות
      pool.query(`SELECT * FROM company_alerts WHERE resolved = false ORDER BY severity DESC, created_at DESC LIMIT 20`).catch(() => ({ rows: [] })),
      // יעדים אסטרטגיים פעילים
      pool.query(`SELECT * FROM strategic_goals WHERE status = 'active' ORDER BY priority DESC`).catch(() => ({ rows: [] })),
      // הזמנות מכירה
      pool.query(`SELECT status, COALESCE(SUM(total_amount),0) as total, COUNT(*) as cnt FROM sales_orders GROUP BY status`).catch(() => ({ rows: [] })),
      // חשבוניות
      pool.query(`SELECT status, COALESCE(SUM(total_amount),0) as total, COUNT(*) as cnt FROM customer_invoices GROUP BY status`).catch(() => ({ rows: [] })),
      // הוצאות חודשיות
      pool.query(`SELECT category, COALESCE(SUM(amount),0) as total FROM expenses WHERE expense_date >= $1 GROUP BY category`, [firstOfMonth]).catch(() => ({ rows: [] })),
      // פרויקטים
      pool.query(`SELECT status, COUNT(*) as cnt FROM projects GROUP BY status`).catch(() => ({ rows: [] })),
      // עובדים
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM employees`).catch(() => ({ rows: [{ total: 0, active: 0 }] })),
      // לידים
      pool.query(`SELECT status, COUNT(*) as cnt FROM leads GROUP BY status`).catch(() => ({ rows: [] })),
      // מלאי
      pool.query(`SELECT COUNT(*) as total_items, COALESCE(SUM(quantity * unit_price),0) as total_value, COUNT(*) FILTER (WHERE quantity <= min_quantity) as low_stock FROM inventory_items`).catch(() => ({ rows: [{ total_items: 0, total_value: 0, low_stock: 0 }] })),
      // תמיכה
      pool.query(`SELECT status, COUNT(*) as cnt FROM support_tickets GROUP BY status`).catch(() => ({ rows: [] })),
      // ייצור
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(quantity_ordered),0) as qty FROM production_work_orders GROUP BY status`).catch(() => ({ rows: [] })),
      // בנקים
      pool.query(`SELECT COALESCE(SUM(balance),0) as total_balance FROM bank_accounts WHERE status = 'active'`).catch(() => ({ rows: [{ total_balance: 0 }] })),
      // חייבים
      pool.query(`SELECT COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(CASE WHEN due_date < NOW() THEN total_amount ELSE 0 END),0) as overdue FROM customer_invoices WHERE status IN ('sent','overdue','partial')`).catch(() => ({ rows: [{ total: 0, overdue: 0 }] })),
      // זכאים
      pool.query(`SELECT COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(CASE WHEN due_date < NOW() THEN total_amount ELSE 0 END),0) as overdue FROM supplier_invoices WHERE status IN ('pending','overdue','partial')`).catch(() => ({ rows: [{ total: 0, overdue: 0 }] })),
      // הצעות מחיר
      pool.query(`SELECT status, COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM quotations GROUP BY status`).catch(() => ({ rows: [] })),
      // הוראות עבודה
      pool.query(`SELECT status, COUNT(*) as cnt FROM production_work_orders WHERE created_at >= $1 GROUP BY status`, [firstOfMonth]).catch(() => ({ rows: [] })),
      // בקרת איכות
      pool.query(`SELECT result, COUNT(*) as cnt FROM qc_inspections WHERE inspection_date >= $1 GROUP BY result`, [firstOfMonth]).catch(() => ({ rows: [] })),
    ]);

    // ====== עיבוד נתונים פיננסיים ======
    const snapshot = snapshotRes.rows[0] || {};
    const prevSnapshot = prevSnapshotRes.rows[0] || {};

    // חישוב הכנסות מהזמנות מכירה
    const salesByStatus: Record<string, any> = {};
    salesOrdersRes.rows.forEach((r: any) => { salesByStatus[r.status] = { total: parseFloat(r.total), count: parseInt(r.cnt) }; });

    // חישוב חשבוניות
    const invoicesByStatus: Record<string, any> = {};
    invoicesRes.rows.forEach((r: any) => { invoicesByStatus[r.status] = { total: parseFloat(r.total), count: parseInt(r.cnt) }; });

    // חישוב הוצאות
    const expensesByCategory: Record<string, number> = {};
    let totalExpenses = 0;
    expensesRes.rows.forEach((r: any) => { expensesByCategory[r.category] = parseFloat(r.total); totalExpenses += parseFloat(r.total); });

    // פרויקטים לפי סטטוס
    const projectsByStatus: Record<string, number> = {};
    let totalProjects = 0;
    projectsRes.rows.forEach((r: any) => { projectsByStatus[r.status] = parseInt(r.cnt); totalProjects += parseInt(r.cnt); });

    // לידים לפי סטטוס
    const leadsByStatus: Record<string, number> = {};
    leadsRes.rows.forEach((r: any) => { leadsByStatus[r.status] = parseInt(r.cnt); });

    // תמיכה לפי סטטוס
    const supportByStatus: Record<string, number> = {};
    supportRes.rows.forEach((r: any) => { supportByStatus[r.status] = parseInt(r.cnt); });

    // ייצור
    const productionByStatus: Record<string, any> = {};
    productionRes.rows.forEach((r: any) => { productionByStatus[r.status] = { count: parseInt(r.cnt), qty: parseInt(r.qty) }; });

    // הצעות מחיר
    const quotesByStatus: Record<string, any> = {};
    quotationsRes.rows.forEach((r: any) => { quotesByStatus[r.status] = { count: parseInt(r.cnt), total: parseFloat(r.total) }; });

    // בקרת איכות
    const qcByResult: Record<string, number> = {};
    let totalQc = 0;
    qcRes.rows.forEach((r: any) => { qcByResult[r.result] = parseInt(r.cnt); totalQc += parseInt(r.cnt); });

    // עובדים
    const empData = employeesRes.rows[0] || { total: 0, active: 0 };

    // מלאי
    const invData = inventoryRes.rows[0] || { total_items: 0, total_value: 0, low_stock: 0 };

    // בנק
    const cashPosition = parseFloat(bankRes.rows[0]?.total_balance || 0);

    // חייבים וזכאים
    const arData = arRes.rows[0] || { total: 0, overdue: 0 };
    const apData = apRes.rows[0] || { total: 0, overdue: 0 };

    // KPIs מקובצים לפי קטגוריה
    const kpisByCategory: Record<string, any[]> = {};
    kpisRes.rows.forEach((k: any) => {
      if (!kpisByCategory[k.category]) kpisByCategory[k.category] = [];
      kpisByCategory[k.category].push(k);
    });

    // חישוב שינוי יומי
    const calcChange = (current: number, previous: number) => {
      if (!previous) return { value: current, change: 0, changePercent: 0 };
      const change = current - previous;
      const changePercent = previous ? ((change / previous) * 100) : 0;
      return { value: current, change, changePercent: parseFloat(changePercent.toFixed(2)) };
    };

    // ====== בניית הדשבורד ======
    const dashboard = {
      // מטא-דאטה
      generated_at: new Date().toISOString(),
      snapshot_date: today,
      data_freshness: snapshot.created_at || "אין תמונת מצב להיום",

      // פיננסי - הלב הפועם
      financial: {
        revenue: {
          today: calcChange(parseFloat(snapshot.revenue_today || 0), parseFloat(prevSnapshot.revenue_today || 0)),
          mtd: parseFloat(snapshot.revenue_mtd || 0),
          ytd: parseFloat(snapshot.revenue_ytd || 0),
        },
        expenses: {
          today: parseFloat(snapshot.expenses_today || 0),
          mtd: parseFloat(snapshot.expenses_mtd || 0),
          by_category: expensesByCategory,
          total_month: totalExpenses,
        },
        profit: {
          today: parseFloat(snapshot.profit_today || 0),
          mtd: parseFloat(snapshot.profit_mtd || 0),
          margin_today: parseFloat(snapshot.revenue_today || 0) > 0
            ? ((parseFloat(snapshot.profit_today || 0) / parseFloat(snapshot.revenue_today || 1)) * 100).toFixed(2)
            : 0,
        },
        cash_position: cashPosition,
        accounts_receivable: {
          total: parseFloat(arData.total),
          overdue: parseFloat(arData.overdue),
          overdue_percent: parseFloat(arData.total) > 0
            ? ((parseFloat(arData.overdue) / parseFloat(arData.total)) * 100).toFixed(2)
            : 0,
        },
        accounts_payable: {
          total: parseFloat(apData.total),
          overdue: parseFloat(apData.overdue),
          overdue_percent: parseFloat(apData.total) > 0
            ? ((parseFloat(apData.overdue) / parseFloat(apData.total)) * 100).toFixed(2)
            : 0,
        },
        invoices_summary: invoicesByStatus,
      },

      // תפעול
      operations: {
        projects: {
          total: totalProjects,
          by_status: projectsByStatus,
          active: projectsByStatus["active"] || projectsByStatus["in_progress"] || 0,
          at_risk: parseInt(snapshot.projects_at_risk || 0),
        },
        production: {
          utilization: parseFloat(snapshot.production_utilization || 0),
          work_orders: productionByStatus,
          on_time_delivery: totalQc > 0
            ? (((qcByResult["pass"] || 0) / totalQc) * 100).toFixed(2)
            : "N/A",
        },
        quality: {
          inspections_this_month: totalQc,
          by_result: qcByResult,
          defect_rate: totalQc > 0
            ? (((qcByResult["fail"] || 0) / totalQc) * 100).toFixed(2)
            : 0,
          pass_rate: totalQc > 0
            ? (((qcByResult["pass"] || 0) / totalQc) * 100).toFixed(2)
            : 0,
        },
      },

      // מכירות
      sales: {
        new_leads_today: parseInt(snapshot.new_leads_today || 0),
        leads_by_status: leadsByStatus,
        total_leads: Object.values(leadsByStatus).reduce((a: number, b: number) => a + b, 0),
        deals_closed_today: parseInt(snapshot.deals_closed_today || 0),
        deals_value_today: parseFloat(snapshot.deals_value_today || 0),
        pipeline: {
          orders: salesByStatus,
          quotations: quotesByStatus,
          pipeline_value: Object.values(quotesByStatus)
            .filter((_v: any, _i: number) => true)
            .reduce((sum: number, v: any) => sum + (v.total || 0), 0),
        },
        conversion_rate: (leadsByStatus["won"] && Object.values(leadsByStatus).reduce((a: number, b: number) => a + b, 0) > 0)
          ? ((leadsByStatus["won"] / Object.values(leadsByStatus).reduce((a: number, b: number) => a + b, 0)) * 100).toFixed(2)
          : "N/A",
      },

      // משאבי אנוש
      hr: {
        headcount: {
          total: parseInt(empData.total),
          active: parseInt(empData.active),
        },
        attendance: {
          present: parseInt(snapshot.employees_present || 0),
          total: parseInt(snapshot.employees_total || 0),
          attendance_rate: parseInt(snapshot.employees_total || 0) > 0
            ? ((parseInt(snapshot.employees_present || 0) / parseInt(snapshot.employees_total || 1)) * 100).toFixed(2)
            : 0,
        },
      },

      // מלאי
      inventory: {
        total_items: parseInt(invData.total_items),
        total_value: parseFloat(invData.total_value),
        low_stock_alerts: parseInt(invData.low_stock),
      },

      // סיכונים
      risks: {
        overdue_payments_ar: parseFloat(arData.overdue),
        overdue_payments_ap: parseFloat(apData.overdue),
        projects_at_risk: parseInt(snapshot.projects_at_risk || 0),
        safety_incidents: parseInt(snapshot.safety_incidents || 0),
        overdue_tasks: parseInt(snapshot.overdue_tasks || 0),
        critical_alerts: activeAlertsRes.rows.filter((a: any) => a.severity === "critical").length,
        high_alerts: activeAlertsRes.rows.filter((a: any) => a.severity === "high").length,
      },

      // תמיכה ושירות
      support: {
        open_tickets: supportByStatus["open"] || 0,
        in_progress: supportByStatus["in_progress"] || 0,
        total_by_status: supportByStatus,
        customer_satisfaction: parseFloat(snapshot.customer_satisfaction || 0),
      },

      // ציון בריאות AI
      ai_health_score: parseInt(snapshot.ai_health_score || 0),

      // KPIs לפי קטגוריה
      kpis: kpisByCategory,

      // התראות פעילות
      active_alerts: {
        total: activeAlertsRes.rows.length,
        critical: activeAlertsRes.rows.filter((a: any) => a.severity === "critical"),
        high: activeAlertsRes.rows.filter((a: any) => a.severity === "high"),
        medium: activeAlertsRes.rows.filter((a: any) => a.severity === "medium"),
        low: activeAlertsRes.rows.filter((a: any) => a.severity === "low"),
      },

      // יעדים אסטרטגיים
      strategic_goals: {
        total: goalsRes.rows.length,
        on_track: goalsRes.rows.filter((g: any) => g.progress_percent >= 50).length,
        at_risk: goalsRes.rows.filter((g: any) => g.progress_percent < 30 && g.status === "active").length,
        goals: goalsRes.rows,
      },

      // אישורים ממתינים
      pending_approvals: parseInt(snapshot.pending_approvals || 0),
    };

    res.json(dashboard);
  } catch (err: any) {
    console.error("שגיאה בבניית דשבורד המנכ\"ל:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// צילום תמונת מצב יומית - אוסף נתונים מכל המודולים
// ============================================================================
router.post("/take-snapshot", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const firstOfYear = `${now.getFullYear()}-01-01`;

    // איסוף נתונים מקבילי מכל המודולים
    const [
      revenueToday, revenueMtd, revenueYtd,
      expensesToday, expensesMtd,
      cashRes, arRes, apRes,
      projectsRes, productionRes,
      leadsToday, dealsToday,
      empRes, supportRes,
      safetyRes, invRes,
      overdueTasksRes, approvalsRes,
      satisfactionRes,
    ] = await Promise.all([
      // הכנסות היום
      pool.query(`SELECT COALESCE(SUM(total_amount),0) as val FROM sales_orders WHERE DATE(created_at) = $1 AND status NOT IN ('cancelled','draft')`, [today]).catch(() => ({ rows: [{ val: 0 }] })),
      // הכנסות מתחילת החודש
      pool.query(`SELECT COALESCE(SUM(total_amount),0) as val FROM sales_orders WHERE created_at >= $1 AND status NOT IN ('cancelled','draft')`, [firstOfMonth]).catch(() => ({ rows: [{ val: 0 }] })),
      // הכנסות מתחילת השנה
      pool.query(`SELECT COALESCE(SUM(total_amount),0) as val FROM sales_orders WHERE created_at >= $1 AND status NOT IN ('cancelled','draft')`, [firstOfYear]).catch(() => ({ rows: [{ val: 0 }] })),
      // הוצאות היום
      pool.query(`SELECT COALESCE(SUM(amount),0) as val FROM expenses WHERE expense_date = $1`, [today]).catch(() => ({ rows: [{ val: 0 }] })),
      // הוצאות מתחילת החודש
      pool.query(`SELECT COALESCE(SUM(amount),0) as val FROM expenses WHERE expense_date >= $1`, [firstOfMonth]).catch(() => ({ rows: [{ val: 0 }] })),
      // מצב מזומנים
      pool.query(`SELECT COALESCE(SUM(balance),0) as val FROM bank_accounts WHERE status = 'active'`).catch(() => ({ rows: [{ val: 0 }] })),
      // חייבים
      pool.query(`SELECT COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(CASE WHEN due_date < NOW() THEN total_amount ELSE 0 END),0) as overdue FROM customer_invoices WHERE status IN ('sent','overdue','partial')`).catch(() => ({ rows: [{ total: 0, overdue: 0 }] })),
      // זכאים
      pool.query(`SELECT COALESCE(SUM(total_amount),0) as total, COALESCE(SUM(CASE WHEN due_date < NOW() THEN total_amount ELSE 0 END),0) as overdue FROM supplier_invoices WHERE status IN ('pending','overdue','partial')`).catch(() => ({ rows: [{ total: 0, overdue: 0 }] })),
      // פרויקטים
      pool.query(`SELECT COUNT(*) FILTER (WHERE status IN ('active','in_progress')) as active, COUNT(*) FILTER (WHERE status = 'at_risk') as at_risk FROM projects`).catch(() => ({ rows: [{ active: 0, at_risk: 0 }] })),
      // ניצולת ייצור
      pool.query(`SELECT CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / COUNT(*) * 100) ELSE 0 END as utilization FROM production_work_orders WHERE created_at >= $1`, [firstOfMonth]).catch(() => ({ rows: [{ utilization: 0 }] })),
      // לידים חדשים היום
      pool.query(`SELECT COUNT(*) as cnt FROM leads WHERE DATE(created_at) = $1`, [today]).catch(() => ({ rows: [{ cnt: 0 }] })),
      // עסקאות שנסגרו היום
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as val FROM sales_orders WHERE DATE(created_at) = $1 AND status = 'completed'`, [today]).catch(() => ({ rows: [{ cnt: 0, val: 0 }] })),
      // עובדים
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'active') as active FROM employees`).catch(() => ({ rows: [{ total: 0, active: 0 }] })),
      // כרטיסי תמיכה פתוחים
      pool.query(`SELECT COUNT(*) as cnt FROM support_tickets WHERE status IN ('open','in_progress')`).catch(() => ({ rows: [{ cnt: 0 }] })),
      // אירועי בטיחות
      pool.query(`SELECT COUNT(*) as cnt FROM safety_incidents WHERE DATE(incident_date) = $1`, [today]).catch(() => ({ rows: [{ cnt: 0 }] })),
      // מלאי
      pool.query(`SELECT COALESCE(SUM(quantity * unit_price),0) as val, COUNT(*) FILTER (WHERE quantity <= min_quantity) as low FROM inventory_items`).catch(() => ({ rows: [{ val: 0, low: 0 }] })),
      // משימות באיחור
      pool.query(`SELECT COUNT(*) as cnt FROM tasks WHERE due_date < NOW() AND status NOT IN ('completed','cancelled')`).catch(() => ({ rows: [{ cnt: 0 }] })),
      // אישורים ממתינים
      pool.query(`SELECT COUNT(*) as cnt FROM approval_requests WHERE status = 'pending'`).catch(() => ({ rows: [{ cnt: 0 }] })),
      // שביעות רצון לקוחות
      pool.query(`SELECT COALESCE(AVG(rating),0) as val FROM customer_feedback WHERE DATE(created_at) >= $1`, [firstOfMonth]).catch(() => ({ rows: [{ val: 0 }] })),
    ]);

    const revToday = parseFloat(revenueToday.rows[0].val);
    const expToday = parseFloat(expensesToday.rows[0].val);

    // הכנסה או עדכון של תמונת המצב להיום
    const result = await pool.query(
      `INSERT INTO company_daily_snapshot (
        snapshot_date, revenue_today, expenses_today, profit_today,
        revenue_mtd, expenses_mtd, profit_mtd, revenue_ytd,
        cash_position, ar_total, ap_total, ar_overdue, ap_overdue,
        active_projects, projects_at_risk, production_utilization,
        new_leads_today, deals_closed_today, deals_value_today,
        employees_present, employees_total, open_support_tickets,
        safety_incidents, inventory_value, low_stock_alerts,
        overdue_tasks, pending_approvals, customer_satisfaction
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28
      )
      ON CONFLICT (snapshot_date) DO UPDATE SET
        revenue_today = EXCLUDED.revenue_today,
        expenses_today = EXCLUDED.expenses_today,
        profit_today = EXCLUDED.profit_today,
        revenue_mtd = EXCLUDED.revenue_mtd,
        expenses_mtd = EXCLUDED.expenses_mtd,
        profit_mtd = EXCLUDED.profit_mtd,
        revenue_ytd = EXCLUDED.revenue_ytd,
        cash_position = EXCLUDED.cash_position,
        ar_total = EXCLUDED.ar_total,
        ap_total = EXCLUDED.ap_total,
        ar_overdue = EXCLUDED.ar_overdue,
        ap_overdue = EXCLUDED.ap_overdue,
        active_projects = EXCLUDED.active_projects,
        projects_at_risk = EXCLUDED.projects_at_risk,
        production_utilization = EXCLUDED.production_utilization,
        new_leads_today = EXCLUDED.new_leads_today,
        deals_closed_today = EXCLUDED.deals_closed_today,
        deals_value_today = EXCLUDED.deals_value_today,
        employees_present = EXCLUDED.employees_present,
        employees_total = EXCLUDED.employees_total,
        open_support_tickets = EXCLUDED.open_support_tickets,
        safety_incidents = EXCLUDED.safety_incidents,
        inventory_value = EXCLUDED.inventory_value,
        low_stock_alerts = EXCLUDED.low_stock_alerts,
        overdue_tasks = EXCLUDED.overdue_tasks,
        pending_approvals = EXCLUDED.pending_approvals,
        customer_satisfaction = EXCLUDED.customer_satisfaction
      RETURNING *`,
      [
        today, revToday, expToday, revToday - expToday,
        parseFloat(revenueMtd.rows[0].val), parseFloat(expensesMtd.rows[0].val),
        parseFloat(revenueMtd.rows[0].val) - parseFloat(expensesMtd.rows[0].val),
        parseFloat(revenueYtd.rows[0].val),
        parseFloat(cashRes.rows[0].val),
        parseFloat(arRes.rows[0].total), parseFloat(apRes.rows[0].total),
        parseFloat(arRes.rows[0].overdue), parseFloat(apRes.rows[0].overdue),
        parseInt(projectsRes.rows[0].active), parseInt(projectsRes.rows[0].at_risk),
        parseFloat(productionRes.rows[0].utilization),
        parseInt(leadsToday.rows[0].cnt),
        parseInt(dealsToday.rows[0].cnt), parseFloat(dealsToday.rows[0].val),
        parseInt(empRes.rows[0].active), parseInt(empRes.rows[0].total),
        parseInt(supportRes.rows[0].cnt),
        parseInt(safetyRes.rows[0].cnt),
        parseFloat(invRes.rows[0].val), parseInt(invRes.rows[0].low),
        parseInt(overdueTasksRes.rows[0].cnt),
        parseInt(approvalsRes.rows[0].cnt),
        parseFloat(satisfactionRes.rows[0].val),
      ]
    );

    res.json({
      success: true,
      message: `תמונת מצב יומית צולמה בהצלחה ל-${today}`,
      snapshot: result.rows[0],
    });
  } catch (err: any) {
    console.error("שגיאה בצילום תמונת מצב:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// מגמות היסטוריות לכל מדד
// ============================================================================
router.get("/trends/:metric", async (req, res) => {
  try {
    const { metric } = req.params;
    const { days = 30 } = req.query;

    // רשימת מדדים מותרים - הגנה מפני SQL injection
    const allowedMetrics = [
      "revenue_today", "expenses_today", "profit_today",
      "revenue_mtd", "expenses_mtd", "profit_mtd", "revenue_ytd",
      "cash_position", "ar_total", "ap_total", "ar_overdue", "ap_overdue",
      "active_projects", "projects_at_risk", "production_utilization",
      "new_leads_today", "deals_closed_today", "deals_value_today",
      "employees_present", "employees_total", "open_support_tickets",
      "safety_incidents", "inventory_value", "low_stock_alerts",
      "overdue_tasks", "pending_approvals", "customer_satisfaction",
      "ai_health_score",
    ];

    if (!allowedMetrics.includes(metric)) {
      return res.status(400).json({ error: `מדד לא חוקי. מדדים זמינים: ${allowedMetrics.join(", ")}` });
    }

    const result = await pool.query(
      `SELECT snapshot_date, ${metric} as value
       FROM company_daily_snapshot
       WHERE snapshot_date >= CURRENT_DATE - $1::INTEGER
       ORDER BY snapshot_date ASC`,
      [days]
    );

    // חישוב סטטיסטיקות על המגמה
    const values = result.rows.map((r: any) => parseFloat(r.value || 0));
    const avg = values.length > 0 ? values.reduce((a: number, b: number) => a + b, 0) / values.length : 0;
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    const latest = values.length > 0 ? values[values.length - 1] : 0;
    const first = values.length > 0 ? values[0] : 0;
    const changePercent = first > 0 ? (((latest - first) / first) * 100) : 0;

    // כיוון המגמה
    let trendDirection = "stable";
    if (values.length >= 3) {
      const recentAvg = values.slice(-3).reduce((a: number, b: number) => a + b, 0) / 3;
      const olderAvg = values.slice(0, 3).reduce((a: number, b: number) => a + b, 0) / Math.min(3, values.length);
      if (recentAvg > olderAvg * 1.05) trendDirection = "up";
      else if (recentAvg < olderAvg * 0.95) trendDirection = "down";
    }

    res.json({
      metric,
      period_days: parseInt(days as string),
      data_points: result.rows,
      statistics: {
        average: parseFloat(avg.toFixed(2)),
        min,
        max,
        latest,
        change_percent: parseFloat(changePercent.toFixed(2)),
        trend_direction: trendDirection,
      },
    });
  } catch (err: any) {
    console.error("שגיאה בשליפת מגמות:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// התראות פעילות - כל ההתראות שעדיין לא נפתרו
// ============================================================================
router.get("/alerts/active", async (req, res) => {
  try {
    const { severity, source_module } = req.query;
    let query = `SELECT * FROM company_alerts WHERE resolved = false`;
    const params: any[] = [];
    let idx = 1;

    if (severity) { query += ` AND severity = $${idx++}`; params.push(severity); }
    if (source_module) { query += ` AND source_module = $${idx++}`; params.push(source_module); }

    query += ` ORDER BY
      CASE severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END,
      created_at DESC`;

    const result = await pool.query(query, params);

    // סיכום לפי חומרה
    const bySeverity: Record<string, number> = {};
    result.rows.forEach((r: any) => {
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
    });

    // סיכום לפי מודול מקור
    const byModule: Record<string, number> = {};
    result.rows.forEach((r: any) => {
      byModule[r.source_module] = (byModule[r.source_module] || 0) + 1;
    });

    res.json({
      total: result.rows.length,
      by_severity: bySeverity,
      by_module: byModule,
      alerts: result.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// יעדים אסטרטגיים עם התקדמות
// ============================================================================
router.get("/strategic-goals", async (req, res) => {
  try {
    const { category, status = "active" } = req.query;
    let query = `SELECT * FROM strategic_goals WHERE 1=1`;
    const params: any[] = [];
    let idx = 1;

    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (category) { query += ` AND category = $${idx++}`; params.push(category); }

    query += ` ORDER BY priority DESC, target_date ASC`;

    const result = await pool.query(query, params);

    // סיכום כללי
    const summary = {
      total: result.rows.length,
      on_track: result.rows.filter((g: any) => g.progress_percent >= 50).length,
      at_risk: result.rows.filter((g: any) => g.progress_percent < 30).length,
      completed: result.rows.filter((g: any) => g.progress_percent >= 100).length,
      average_progress: result.rows.length > 0
        ? (result.rows.reduce((sum: number, g: any) => sum + parseFloat(g.progress_percent || 0), 0) / result.rows.length).toFixed(2)
        : 0,
      by_category: {} as Record<string, any>,
    };

    // קיבוץ לפי קטגוריה
    result.rows.forEach((g: any) => {
      if (!summary.by_category[g.category]) {
        summary.by_category[g.category] = { count: 0, avg_progress: 0, goals: [] };
      }
      summary.by_category[g.category].count++;
      summary.by_category[g.category].goals.push(g);
    });

    // חישוב ממוצע התקדמות לכל קטגוריה
    Object.keys(summary.by_category).forEach((cat) => {
      const goals = summary.by_category[cat].goals;
      summary.by_category[cat].avg_progress = (
        goals.reduce((sum: number, g: any) => sum + parseFloat(g.progress_percent || 0), 0) / goals.length
      ).toFixed(2);
    });

    res.json({ summary, goals: result.rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// פולס בזמן אמת - מה קרה בשעה האחרונה
// ============================================================================
router.get("/company-pulse", async (req, res) => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // שליפה מקבילית של כל הפעילות האחרונה
    const [
      newOrders, newLeads, newInvoices, newExpenses,
      newAlerts, newTickets, newTasks, recentActivities,
    ] = await Promise.all([
      // הזמנות חדשות בשעה האחרונה
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE created_at >= $1`, [oneHourAgo]).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
      // לידים חדשים
      pool.query(`SELECT COUNT(*) as cnt FROM leads WHERE created_at >= $1`, [oneHourAgo]).catch(() => ({ rows: [{ cnt: 0 }] })),
      // חשבוניות חדשות
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM customer_invoices WHERE created_at >= $1`, [oneHourAgo]).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
      // הוצאות חדשות
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(amount),0) as total FROM expenses WHERE created_at >= $1`, [oneHourAgo]).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
      // התראות חדשות
      pool.query(`SELECT * FROM company_alerts WHERE created_at >= $1 ORDER BY severity DESC`, [oneHourAgo]).catch(() => ({ rows: [] })),
      // כרטיסי תמיכה חדשים
      pool.query(`SELECT COUNT(*) as cnt FROM support_tickets WHERE created_at >= $1`, [oneHourAgo]).catch(() => ({ rows: [{ cnt: 0 }] })),
      // משימות שהושלמו
      pool.query(`SELECT COUNT(*) as cnt FROM tasks WHERE updated_at >= $1 AND status = 'completed'`, [oneHourAgo]).catch(() => ({ rows: [{ cnt: 0 }] })),
      // פעילויות אחרונות מלוג
      pool.query(`SELECT * FROM audit_log WHERE created_at >= $1 ORDER BY created_at DESC LIMIT 20`, [oneHourAgo]).catch(() => ({ rows: [] })),
    ]);

    const pulse = {
      timestamp: new Date().toISOString(),
      period: "שעה אחרונה",
      activity: {
        new_orders: { count: parseInt(newOrders.rows[0].cnt), value: parseFloat(newOrders.rows[0].total) },
        new_leads: parseInt(newLeads.rows[0].cnt),
        new_invoices: { count: parseInt(newInvoices.rows[0].cnt), value: parseFloat(newInvoices.rows[0].total) },
        new_expenses: { count: parseInt(newExpenses.rows[0].cnt), value: parseFloat(newExpenses.rows[0].total) },
        new_support_tickets: parseInt(newTickets.rows[0].cnt),
        tasks_completed: parseInt(newTasks.rows[0].cnt),
      },
      alerts: {
        new_count: newAlerts.rows.length,
        items: newAlerts.rows,
      },
      recent_activities: recentActivities.rows,
      // חישוב רמת פעילות
      activity_level:
        parseInt(newOrders.rows[0].cnt) + parseInt(newLeads.rows[0].cnt) + parseInt(newInvoices.rows[0].cnt) > 10
          ? "high"
          : parseInt(newOrders.rows[0].cnt) + parseInt(newLeads.rows[0].cnt) > 3
            ? "medium"
            : "low",
    };

    res.json(pulse);
  } catch (err: any) {
    console.error("שגיאה בשליפת פולס החברה:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// רווח והפסד יומי - Daily P&L
// ============================================================================
router.get("/daily-pnl", async (req, res) => {
  try {
    const { days = 30 } = req.query;

    // רווח והפסד מתמונות מצב יומיות
    const snapshotsRes = await pool.query(
      `SELECT snapshot_date, revenue_today, expenses_today, profit_today,
              revenue_mtd, expenses_mtd, profit_mtd
       FROM company_daily_snapshot
       WHERE snapshot_date >= CURRENT_DATE - $1::INTEGER
       ORDER BY snapshot_date ASC`,
      [days]
    );

    // פירוט הוצאות לפי קטגוריה לתקופה
    const expenseBreakdownRes = await pool.query(
      `SELECT category, DATE(expense_date) as day, COALESCE(SUM(amount),0) as total
       FROM expenses
       WHERE expense_date >= CURRENT_DATE - $1::INTEGER
       GROUP BY category, DATE(expense_date)
       ORDER BY day ASC`,
      [days]
    ).catch(() => ({ rows: [] }));

    // פירוט הכנסות לפי מקור
    const revenueBreakdownRes = await pool.query(
      `SELECT DATE(created_at) as day, COUNT(*) as order_count, COALESCE(SUM(total_amount),0) as total
       FROM sales_orders
       WHERE created_at >= CURRENT_DATE - $1::INTEGER AND status NOT IN ('cancelled','draft')
       GROUP BY DATE(created_at)
       ORDER BY day ASC`,
      [days]
    ).catch(() => ({ rows: [] }));

    // חישוב סיכומים
    const dailyData = snapshotsRes.rows;
    const totalRevenue = dailyData.reduce((sum: number, d: any) => sum + parseFloat(d.revenue_today || 0), 0);
    const totalExpenses = dailyData.reduce((sum: number, d: any) => sum + parseFloat(d.expenses_today || 0), 0);
    const totalProfit = totalRevenue - totalExpenses;
    const avgDailyProfit = dailyData.length > 0 ? totalProfit / dailyData.length : 0;

    // קיבוץ הוצאות לפי קטגוריה
    const expenseCategories: Record<string, number> = {};
    expenseBreakdownRes.rows.forEach((r: any) => {
      expenseCategories[r.category] = (expenseCategories[r.category] || 0) + parseFloat(r.total);
    });

    res.json({
      period_days: parseInt(days as string),
      daily_breakdown: dailyData,
      revenue_by_day: revenueBreakdownRes.rows,
      expense_by_category: expenseCategories,
      expense_daily_detail: expenseBreakdownRes.rows,
      totals: {
        total_revenue: parseFloat(totalRevenue.toFixed(2)),
        total_expenses: parseFloat(totalExpenses.toFixed(2)),
        total_profit: parseFloat(totalProfit.toFixed(2)),
        profit_margin: totalRevenue > 0 ? parseFloat(((totalProfit / totalRevenue) * 100).toFixed(2)) : 0,
        avg_daily_revenue: dailyData.length > 0 ? parseFloat((totalRevenue / dailyData.length).toFixed(2)) : 0,
        avg_daily_expenses: dailyData.length > 0 ? parseFloat((totalExpenses / dailyData.length).toFixed(2)) : 0,
        avg_daily_profit: parseFloat(avgDailyProfit.toFixed(2)),
      },
    });
  } catch (err: any) {
    console.error("שגיאה בחישוב רווח והפסד יומי:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// דוח שבועי אוטומטי - Weekly Report
// ============================================================================
router.get("/weekly-report", async (req, res) => {
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    // נתוני השבוע הנוכחי
    const [
      thisWeekSnapshots, prevWeekSnapshots,
      thisWeekOrders, prevWeekOrders,
      thisWeekLeads, prevWeekLeads,
      thisWeekAlerts, goalsProgress,
      newCustomers, completedProjects,
    ] = await Promise.all([
      // תמונות מצב של השבוע
      pool.query(`SELECT * FROM company_daily_snapshot WHERE snapshot_date >= $1 ORDER BY snapshot_date ASC`, [weekAgo]).catch(() => ({ rows: [] })),
      // תמונות מצב של השבוע הקודם
      pool.query(`SELECT * FROM company_daily_snapshot WHERE snapshot_date >= $1 AND snapshot_date < $2 ORDER BY snapshot_date ASC`, [twoWeeksAgo, weekAgo]).catch(() => ({ rows: [] })),
      // הזמנות השבוע
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE created_at >= $1 AND status NOT IN ('cancelled','draft')`, [weekAgo]).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
      // הזמנות שבוע קודם
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE created_at >= $1 AND created_at < $2 AND status NOT IN ('cancelled','draft')`, [twoWeeksAgo, weekAgo]).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
      // לידים השבוע
      pool.query(`SELECT COUNT(*) as cnt FROM leads WHERE created_at >= $1`, [weekAgo]).catch(() => ({ rows: [{ cnt: 0 }] })),
      // לידים שבוע קודם
      pool.query(`SELECT COUNT(*) as cnt FROM leads WHERE created_at >= $1 AND created_at < $2`, [twoWeeksAgo, weekAgo]).catch(() => ({ rows: [{ cnt: 0 }] })),
      // התראות שנוצרו השבוע
      pool.query(`SELECT severity, COUNT(*) as cnt FROM company_alerts WHERE created_at >= $1 GROUP BY severity`, [weekAgo]).catch(() => ({ rows: [] })),
      // התקדמות יעדים
      pool.query(`SELECT * FROM strategic_goals WHERE status = 'active' ORDER BY priority DESC LIMIT 10`).catch(() => ({ rows: [] })),
      // לקוחות חדשים
      pool.query(`SELECT COUNT(*) as cnt FROM customers WHERE created_at >= $1`, [weekAgo]).catch(() => ({ rows: [{ cnt: 0 }] })),
      // פרויקטים שהושלמו
      pool.query(`SELECT COUNT(*) as cnt FROM projects WHERE status = 'completed' AND updated_at >= $1`, [weekAgo]).catch(() => ({ rows: [{ cnt: 0 }] })),
    ]);

    // חישוב סיכומים שבועיים
    const thisWeekRevenue = thisWeekSnapshots.rows.reduce((s: number, r: any) => s + parseFloat(r.revenue_today || 0), 0);
    const prevWeekRevenue = prevWeekSnapshots.rows.reduce((s: number, r: any) => s + parseFloat(r.revenue_today || 0), 0);
    const thisWeekExpenses = thisWeekSnapshots.rows.reduce((s: number, r: any) => s + parseFloat(r.expenses_today || 0), 0);
    const prevWeekExpenses = prevWeekSnapshots.rows.reduce((s: number, r: any) => s + parseFloat(r.expenses_today || 0), 0);

    // חישוב שינוי באחוזים
    const revenueChange = prevWeekRevenue > 0 ? (((thisWeekRevenue - prevWeekRevenue) / prevWeekRevenue) * 100) : 0;
    const expenseChange = prevWeekExpenses > 0 ? (((thisWeekExpenses - prevWeekExpenses) / prevWeekExpenses) * 100) : 0;

    // התראות לפי חומרה
    const alertsBySeverity: Record<string, number> = {};
    thisWeekAlerts.rows.forEach((r: any) => { alertsBySeverity[r.severity] = parseInt(r.cnt); });

    const report = {
      report_type: "weekly",
      period: { from: weekAgo, to: today },
      generated_at: now.toISOString(),

      // סיכום מנהלים
      executive_summary: {
        revenue: {
          this_week: parseFloat(thisWeekRevenue.toFixed(2)),
          prev_week: parseFloat(prevWeekRevenue.toFixed(2)),
          change_percent: parseFloat(revenueChange.toFixed(2)),
          trend: revenueChange > 0 ? "עלייה" : revenueChange < 0 ? "ירידה" : "יציב",
        },
        expenses: {
          this_week: parseFloat(thisWeekExpenses.toFixed(2)),
          prev_week: parseFloat(prevWeekExpenses.toFixed(2)),
          change_percent: parseFloat(expenseChange.toFixed(2)),
        },
        profit: {
          this_week: parseFloat((thisWeekRevenue - thisWeekExpenses).toFixed(2)),
          prev_week: parseFloat((prevWeekRevenue - prevWeekExpenses).toFixed(2)),
        },
        orders: {
          this_week: { count: parseInt(thisWeekOrders.rows[0].cnt), value: parseFloat(thisWeekOrders.rows[0].total) },
          prev_week: { count: parseInt(prevWeekOrders.rows[0].cnt), value: parseFloat(prevWeekOrders.rows[0].total) },
        },
        leads: {
          this_week: parseInt(thisWeekLeads.rows[0].cnt),
          prev_week: parseInt(prevWeekLeads.rows[0].cnt),
        },
        new_customers: parseInt(newCustomers.rows[0].cnt),
        completed_projects: parseInt(completedProjects.rows[0].cnt),
      },

      // התראות השבוע
      alerts_this_week: alertsBySeverity,

      // יעדים אסטרטגיים
      strategic_goals_status: goalsProgress.rows.map((g: any) => ({
        id: g.id,
        name: g.goal_name_he || g.goal_name,
        progress: parseFloat(g.progress_percent),
        status: g.status,
        target_date: g.target_date,
      })),

      // תמונות מצב יומיות של השבוע
      daily_snapshots: thisWeekSnapshots.rows,
    };

    res.json(report);
  } catch (err: any) {
    console.error("שגיאה ביצירת דוח שבועי:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// רדאר סיכונים - כל הסיכונים מאוגדים
// ============================================================================
router.get("/risk-radar", async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // איסוף סיכונים מכל המודולים
    const [
      overdueAR, overdueAP, projectsAtRisk,
      safetyIncidents, criticalAlerts,
      overdueTasksRes, lowStockRes,
      overdueDeliveries, budgetOverruns,
      expiringContracts,
    ] = await Promise.all([
      // חייבים באיחור
      pool.query(`SELECT customer_name, total_amount, due_date, CURRENT_DATE - due_date as days_overdue
        FROM customer_invoices WHERE due_date < CURRENT_DATE AND status IN ('sent','overdue','partial')
        ORDER BY total_amount DESC LIMIT 10`).catch(() => ({ rows: [] })),
      // זכאים באיחור
      pool.query(`SELECT supplier_name, total_amount, due_date, CURRENT_DATE - due_date as days_overdue
        FROM supplier_invoices WHERE due_date < CURRENT_DATE AND status IN ('pending','overdue','partial')
        ORDER BY total_amount DESC LIMIT 10`).catch(() => ({ rows: [] })),
      // פרויקטים בסיכון
      pool.query(`SELECT name, status, end_date, budget FROM projects WHERE status = 'at_risk' ORDER BY end_date ASC`).catch(() => ({ rows: [] })),
      // אירועי בטיחות אחרונים
      pool.query(`SELECT * FROM safety_incidents WHERE incident_date >= CURRENT_DATE - 30 ORDER BY incident_date DESC LIMIT 10`).catch(() => ({ rows: [] })),
      // התראות קריטיות שלא נפתרו
      pool.query(`SELECT * FROM company_alerts WHERE severity IN ('critical','high') AND resolved = false ORDER BY created_at DESC`).catch(() => ({ rows: [] })),
      // משימות באיחור
      pool.query(`SELECT title, due_date, assigned_to, priority FROM tasks WHERE due_date < CURRENT_DATE AND status NOT IN ('completed','cancelled') ORDER BY due_date ASC LIMIT 15`).catch(() => ({ rows: [] })),
      // פריטי מלאי נמוכים
      pool.query(`SELECT item_name, quantity, min_quantity, unit FROM inventory_items WHERE quantity <= min_quantity ORDER BY quantity ASC LIMIT 10`).catch(() => ({ rows: [] })),
      // משלוחים באיחור
      pool.query(`SELECT order_number, expected_delivery, status FROM sales_orders WHERE expected_delivery < CURRENT_DATE AND status NOT IN ('delivered','completed','cancelled') LIMIT 10`).catch(() => ({ rows: [] })),
      // חריגות תקציב
      pool.query(`SELECT department, allocated_amount, used_amount, (used_amount / NULLIF(allocated_amount,0) * 100) as usage_percent
        FROM budgets WHERE used_amount > allocated_amount`).catch(() => ({ rows: [] })),
      // חוזים שעומדים לפוג
      pool.query(`SELECT contract_name, supplier_name, end_date FROM supplier_contracts WHERE end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 AND status = 'active' ORDER BY end_date ASC`).catch(() => ({ rows: [] })),
    ]);

    // חישוב ציון סיכון כולל (0-100, כאשר 100 = סיכון מקסימלי)
    let riskScore = 0;
    riskScore += Math.min(overdueAR.rows.length * 5, 20);      // עד 20 נקודות על חייבים
    riskScore += Math.min(overdueAP.rows.length * 3, 15);      // עד 15 נקודות על זכאים
    riskScore += Math.min(projectsAtRisk.rows.length * 8, 20); // עד 20 נקודות על פרויקטים
    riskScore += Math.min(criticalAlerts.rows.length * 5, 15);  // עד 15 נקודות על התראות
    riskScore += Math.min(safetyIncidents.rows.length * 10, 15); // עד 15 נקודות על בטיחות
    riskScore += Math.min(budgetOverruns.rows.length * 5, 15);  // עד 15 נקודות על חריגות

    // רמת סיכון
    let riskLevel = "low";
    if (riskScore >= 70) riskLevel = "critical";
    else if (riskScore >= 50) riskLevel = "high";
    else if (riskScore >= 30) riskLevel = "medium";

    res.json({
      risk_score: Math.min(riskScore, 100),
      risk_level: riskLevel,
      risk_level_he: riskLevel === "critical" ? "קריטי" : riskLevel === "high" ? "גבוה" : riskLevel === "medium" ? "בינוני" : "נמוך",

      financial_risks: {
        overdue_receivables: {
          count: overdueAR.rows.length,
          total: overdueAR.rows.reduce((s: number, r: any) => s + parseFloat(r.total_amount || 0), 0),
          items: overdueAR.rows,
        },
        overdue_payables: {
          count: overdueAP.rows.length,
          total: overdueAP.rows.reduce((s: number, r: any) => s + parseFloat(r.total_amount || 0), 0),
          items: overdueAP.rows,
        },
        budget_overruns: budgetOverruns.rows,
      },

      operational_risks: {
        projects_at_risk: projectsAtRisk.rows,
        overdue_tasks: { count: overdueTasksRes.rows.length, items: overdueTasksRes.rows },
        overdue_deliveries: overdueDeliveries.rows,
        low_stock_items: lowStockRes.rows,
      },

      safety_risks: {
        recent_incidents: safetyIncidents.rows,
      },

      compliance_risks: {
        expiring_contracts: expiringContracts.rows,
      },

      unresolved_alerts: {
        count: criticalAlerts.rows.length,
        items: criticalAlerts.rows,
      },
    });
  } catch (err: any) {
    console.error("שגיאה בבניית רדאר סיכונים:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// מיקום תחרותי - placeholder לניתוח שוק
// ============================================================================
router.get("/competitor-position", async (_req, res) => {
  try {
    // שליפת נתונים פנימיים להשוואה עתידית עם נתוני שוק
    const [revenueRes, customersRes, productsRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total_amount),0) as total FROM sales_orders WHERE created_at >= DATE_TRUNC('year', CURRENT_DATE) AND status NOT IN ('cancelled','draft')`).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT COUNT(*) as total FROM customers WHERE status = 'active'`).catch(() => ({ rows: [{ total: 0 }] })),
      pool.query(`SELECT COUNT(*) as total FROM products WHERE status = 'active'`).catch(() => ({ rows: [{ total: 0 }] })),
    ]);

    res.json({
      message: "ניתוח מיקום תחרותי - placeholder למודול עתידי",
      our_metrics: {
        annual_revenue_ytd: parseFloat(revenueRes.rows[0].total),
        active_customers: parseInt(customersRes.rows[0].total),
        active_products: parseInt(productsRes.rows[0].total),
      },
      market_analysis: {
        status: "placeholder",
        note: "מודול זה יחובר לשירותי BI חיצוניים וממשקי נתוני שוק בעתיד",
        planned_integrations: [
          "נתוני ענף מלשכת הסטטיסטיקה",
          "דוחות אנליסטים",
          "מעקב אחרי מתחרים",
          "ניתוח מחירים בשוק",
          "סקרי שוק",
        ],
      },
      competitive_indicators: {
        market_share: "לא זמין - דורש חיבור למקורות חיצוניים",
        price_position: "לא זמין",
        customer_growth_rate: "לא זמין",
        product_diversification: "לא זמין",
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// חישוב ציון בריאות חברה מבוסס AI (0-100)
// ============================================================================
router.post("/calculate-health-score", async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    // איסוף כל המדדים הרלוונטיים לחישוב
    const [
      cashRes, arOverdueRes, apOverdueRes,
      projectsRes, safetyRes,
      alertsRes, tasksRes,
      satisfactionRes, inventoryRes,
      productionRes, revenueRes,
    ] = await Promise.all([
      // מצב מזומנים
      pool.query(`SELECT COALESCE(SUM(balance),0) as val FROM bank_accounts WHERE status = 'active'`).catch(() => ({ rows: [{ val: 0 }] })),
      // חייבים באיחור
      pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount),0) as total FROM customer_invoices WHERE due_date < CURRENT_DATE AND status IN ('sent','overdue','partial')`).catch(() => ({ rows: [{ cnt: 0, total: 0 }] })),
      // זכאים באיחור
      pool.query(`SELECT COUNT(*) as cnt FROM supplier_invoices WHERE due_date < CURRENT_DATE AND status IN ('pending','overdue')`).catch(() => ({ rows: [{ cnt: 0 }] })),
      // פרויקטים בסיכון
      pool.query(`SELECT COUNT(*) FILTER (WHERE status = 'at_risk') as at_risk, COUNT(*) as total FROM projects WHERE status NOT IN ('completed','cancelled')`).catch(() => ({ rows: [{ at_risk: 0, total: 1 }] })),
      // אירועי בטיחות החודש
      pool.query(`SELECT COUNT(*) as cnt FROM safety_incidents WHERE incident_date >= $1`, [firstOfMonth]).catch(() => ({ rows: [{ cnt: 0 }] })),
      // התראות קריטיות לא נפתרות
      pool.query(`SELECT COUNT(*) as cnt FROM company_alerts WHERE severity IN ('critical','high') AND resolved = false`).catch(() => ({ rows: [{ cnt: 0 }] })),
      // משימות באיחור
      pool.query(`SELECT COUNT(*) as overdue, (SELECT COUNT(*) FROM tasks WHERE status NOT IN ('completed','cancelled')) as total FROM tasks WHERE due_date < CURRENT_DATE AND status NOT IN ('completed','cancelled')`).catch(() => ({ rows: [{ overdue: 0, total: 1 }] })),
      // שביעות רצון לקוחות
      pool.query(`SELECT COALESCE(AVG(rating),0) as avg_rating FROM customer_feedback WHERE created_at >= $1`, [firstOfMonth]).catch(() => ({ rows: [{ avg_rating: 0 }] })),
      // מלאי נמוך
      pool.query(`SELECT COUNT(*) FILTER (WHERE quantity <= min_quantity) as low, COUNT(*) as total FROM inventory_items`).catch(() => ({ rows: [{ low: 0, total: 1 }] })),
      // ניצולת ייצור
      pool.query(`SELECT CASE WHEN COUNT(*) > 0 THEN (COUNT(*) FILTER (WHERE status = 'completed')::DECIMAL / COUNT(*) * 100) ELSE 0 END as utilization FROM production_work_orders WHERE created_at >= $1`, [firstOfMonth]).catch(() => ({ rows: [{ utilization: 0 }] })),
      // מגמת הכנסות
      pool.query(`SELECT COALESCE(SUM(revenue_today),0) as current_week FROM company_daily_snapshot WHERE snapshot_date >= CURRENT_DATE - 7`).catch(() => ({ rows: [{ current_week: 0 }] })),
    ]);

    // ====== חישוב ציון בריאות (0-100) ======
    // כל קטגוריה מקבלת ניקוד ונשקלת

    // 1. בריאות פיננסית (עד 25 נקודות)
    let financialScore = 25;
    const cash = parseFloat(cashRes.rows[0].val);
    if (cash <= 0) financialScore -= 15;          // מצב מזומנים שלילי = בעיה גדולה
    else if (cash < 50000) financialScore -= 8;   // מזומנים נמוכים
    const arOverdue = parseInt(arOverdueRes.rows[0].cnt);
    financialScore -= Math.min(arOverdue * 2, 10); // חייבים באיחור

    // 2. בריאות תפעולית (עד 25 נקודות)
    let operationalScore = 25;
    const projTotal = parseInt(projectsRes.rows[0].total);
    const projAtRisk = parseInt(projectsRes.rows[0].at_risk);
    if (projTotal > 0) {
      const riskPercent = (projAtRisk / projTotal) * 100;
      operationalScore -= Math.min(Math.floor(riskPercent / 5), 10);
    }
    const utilization = parseFloat(productionRes.rows[0].utilization);
    if (utilization < 50) operationalScore -= 8;
    else if (utilization < 70) operationalScore -= 4;
    const taskOverduePercent = parseInt(tasksRes.rows[0].total) > 0
      ? (parseInt(tasksRes.rows[0].overdue) / parseInt(tasksRes.rows[0].total)) * 100
      : 0;
    operationalScore -= Math.min(Math.floor(taskOverduePercent / 10), 7);

    // 3. שביעות רצון ושירות (עד 20 נקודות)
    let serviceScore = 20;
    const satisfaction = parseFloat(satisfactionRes.rows[0].avg_rating);
    if (satisfaction > 0 && satisfaction < 3) serviceScore -= 10;
    else if (satisfaction >= 3 && satisfaction < 4) serviceScore -= 5;

    // 4. בטיחות וציות (עד 15 נקודות)
    let safetyScore = 15;
    const incidents = parseInt(safetyRes.rows[0].cnt);
    safetyScore -= Math.min(incidents * 5, 15);

    // 5. התראות קריטיות (עד 15 נקודות)
    let alertScore = 15;
    const criticalAlerts = parseInt(alertsRes.rows[0].cnt);
    alertScore -= Math.min(criticalAlerts * 3, 15);

    // ציון כולל
    const healthScore = Math.max(0, Math.min(100,
      financialScore + operationalScore + serviceScore + safetyScore + alertScore
    ));

    // קביעת רמת בריאות
    let healthLevel = "excellent";
    let healthLevelHe = "מצוין";
    if (healthScore < 40) { healthLevel = "critical"; healthLevelHe = "קריטי"; }
    else if (healthScore < 60) { healthLevel = "poor"; healthLevelHe = "חלש"; }
    else if (healthScore < 75) { healthLevel = "fair"; healthLevelHe = "סביר"; }
    else if (healthScore < 90) { healthLevel = "good"; healthLevelHe = "טוב"; }

    // שמירת הציון בתמונת המצב של היום
    await pool.query(
      `UPDATE company_daily_snapshot SET ai_health_score = $1 WHERE snapshot_date = $2`,
      [healthScore, today]
    ).catch(() => {});

    res.json({
      health_score: healthScore,
      health_level: healthLevel,
      health_level_he: healthLevelHe,
      calculated_at: new Date().toISOString(),

      breakdown: {
        financial: {
          score: Math.max(0, financialScore),
          max: 25,
          details: {
            cash_position: cash,
            overdue_receivables: arOverdue,
            overdue_payables: parseInt(apOverdueRes.rows[0].cnt),
          },
        },
        operational: {
          score: Math.max(0, operationalScore),
          max: 25,
          details: {
            projects_at_risk: projAtRisk,
            production_utilization: utilization,
            task_overdue_percent: parseFloat(taskOverduePercent.toFixed(2)),
          },
        },
        service: {
          score: Math.max(0, serviceScore),
          max: 20,
          details: {
            customer_satisfaction: satisfaction,
          },
        },
        safety: {
          score: Math.max(0, safetyScore),
          max: 15,
          details: {
            incidents_this_month: incidents,
          },
        },
        alerts: {
          score: Math.max(0, alertScore),
          max: 15,
          details: {
            unresolved_critical_alerts: criticalAlerts,
          },
        },
      },

      // המלצות לשיפור
      recommendations: [
        ...(financialScore < 15 ? ["יש לשפר את מצב המזומנים ולטפל בחייבים באיחור"] : []),
        ...(operationalScore < 15 ? ["יש לטפל בפרויקטים בסיכון ולשפר את ניצולת הייצור"] : []),
        ...(serviceScore < 10 ? ["יש לשפר את שביעות רצון הלקוחות"] : []),
        ...(safetyScore < 10 ? ["יש לטפל באירועי בטיחות ולחזק נהלי בטיחות"] : []),
        ...(alertScore < 10 ? ["יש לטפל בהתראות קריטיות שלא נפתרו"] : []),
        ...(healthScore >= 90 ? ["החברה במצב מצוין! להמשיך לשמור על הרמה"] : []),
      ],
    });
  } catch (err: any) {
    console.error("שגיאה בחישוב ציון בריאות:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
