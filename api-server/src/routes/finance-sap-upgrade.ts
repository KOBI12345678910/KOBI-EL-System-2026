import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

// ─── הגדרות טבלאות פיננסיות ברמת SAP ─────────────────────────────
const TABLE_DEFINITIONS: Record<string, string> = {
  profit_centers: `
    CREATE TABLE IF NOT EXISTS profit_centers (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      name_he TEXT,
      parent_id INTEGER,
      department TEXT,
      manager TEXT,
      budget NUMERIC(15,2) DEFAULT 0,
      actual NUMERIC(15,2) DEFAULT 0,
      currency TEXT DEFAULT 'ILS',
      status TEXT DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  intercompany_transactions: `
    CREATE TABLE IF NOT EXISTS intercompany_transactions (
      id SERIAL PRIMARY KEY,
      transaction_number TEXT NOT NULL UNIQUE,
      from_entity TEXT NOT NULL,
      to_entity TEXT NOT NULL,
      transaction_type TEXT NOT NULL,
      amount NUMERIC(15,2) NOT NULL,
      currency TEXT DEFAULT 'ILS',
      exchange_rate NUMERIC(12,6) DEFAULT 1.0,
      description TEXT,
      gl_account TEXT,
      status TEXT DEFAULT 'pending',
      reconciled BOOLEAN DEFAULT FALSE,
      reconciled_at TIMESTAMP,
      reconciled_by TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  allocation_rules: `
    CREATE TABLE IF NOT EXISTS allocation_rules (
      id SERIAL PRIMARY KEY,
      rule_name TEXT NOT NULL,
      rule_name_he TEXT,
      source_cost_center TEXT NOT NULL,
      target_cost_centers JSONB DEFAULT '[]'::jsonb,
      allocation_method TEXT NOT NULL DEFAULT 'percentage' CHECK (allocation_method IN ('percentage','headcount','area','revenue','custom')),
      allocation_basis TEXT,
      percentages JSONB DEFAULT '{}'::jsonb,
      period TEXT,
      fiscal_year INTEGER,
      amount_allocated NUMERIC(15,2) DEFAULT 0,
      status TEXT DEFAULT 'draft',
      executed_at TIMESTAMP,
      executed_by TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  treasury_positions: `
    CREATE TABLE IF NOT EXISTS treasury_positions (
      id SERIAL PRIMARY KEY,
      position_number TEXT NOT NULL UNIQUE,
      instrument_type TEXT NOT NULL DEFAULT 'deposit' CHECK (instrument_type IN ('deposit','loan','bond','forex','derivative','investment')),
      instrument_name TEXT NOT NULL,
      counterparty TEXT,
      principal_amount NUMERIC(15,2) NOT NULL,
      currency TEXT DEFAULT 'ILS',
      interest_rate NUMERIC(8,4) DEFAULT 0,
      start_date DATE,
      maturity_date DATE,
      current_value NUMERIC(15,2) DEFAULT 0,
      unrealized_pnl NUMERIC(15,2) DEFAULT 0,
      realized_pnl NUMERIC(15,2) DEFAULT 0,
      status TEXT DEFAULT 'active',
      risk_rating TEXT DEFAULT 'medium',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  period_close_tasks: `
    CREATE TABLE IF NOT EXISTS period_close_tasks (
      id SERIAL PRIMARY KEY,
      period VARCHAR(20) NOT NULL,
      fiscal_year INTEGER NOT NULL,
      task_name TEXT NOT NULL,
      task_name_he TEXT,
      task_order INTEGER DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'close' CHECK (category IN ('pre_close','close','post_close','reporting')),
      responsible VARCHAR(255),
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','skipped')),
      started_at TIMESTAMP,
      completed_at TIMESTAMP,
      completed_by TEXT,
      notes TEXT,
      blockers TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  credit_limits: `
    CREATE TABLE IF NOT EXISTS credit_limits (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      credit_limit NUMERIC(15,2) DEFAULT 0,
      current_exposure NUMERIC(15,2) DEFAULT 0,
      available_credit NUMERIC(15,2) DEFAULT 0,
      currency TEXT DEFAULT 'ILS',
      risk_category TEXT DEFAULT 'low' CHECK (risk_category IN ('low','medium','high','critical')),
      last_review_date DATE,
      next_review_date DATE,
      approved_by TEXT,
      overdue_amount NUMERIC(15,2) DEFAULT 0,
      overdue_days INTEGER DEFAULT 0,
      blocked BOOLEAN DEFAULT FALSE,
      block_reason TEXT,
      notes TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  financial_kpis: `
    CREATE TABLE IF NOT EXISTS financial_kpis (
      id SERIAL PRIMARY KEY,
      kpi_name TEXT NOT NULL,
      kpi_name_he TEXT,
      category TEXT,
      period TEXT,
      fiscal_year INTEGER,
      target_value NUMERIC(15,4) DEFAULT 0,
      actual_value NUMERIC(15,4) DEFAULT 0,
      unit TEXT DEFAULT 'ILS',
      variance NUMERIC(15,4) DEFAULT 0,
      variance_percent NUMERIC(8,2) DEFAULT 0,
      trend TEXT DEFAULT 'stable' CHECK (trend IN ('up','down','stable')),
      status TEXT DEFAULT 'on_track' CHECK (status IN ('on_track','at_risk','off_track')),
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
  recurring_journals: `
    CREATE TABLE IF NOT EXISTS recurring_journals (
      id SERIAL PRIMARY KEY,
      template_name TEXT NOT NULL,
      template_name_he TEXT,
      description TEXT,
      journal_entries JSONB DEFAULT '[]'::jsonb,
      frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly','quarterly','annually')),
      next_execution DATE,
      last_execution DATE,
      auto_post BOOLEAN DEFAULT FALSE,
      active BOOLEAN DEFAULT TRUE,
      created_by TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      deleted_at TIMESTAMP
    )`,
};

// ─── אינדקסים לעמודות מפתח ──────────────────────────────────────
const INDEX_DEFINITIONS: string[] = [
  // מרכזי רווח
  `CREATE INDEX IF NOT EXISTS idx_profit_centers_code ON profit_centers(code)`,
  `CREATE INDEX IF NOT EXISTS idx_profit_centers_department ON profit_centers(department)`,
  `CREATE INDEX IF NOT EXISTS idx_profit_centers_status ON profit_centers(status)`,
  `CREATE INDEX IF NOT EXISTS idx_profit_centers_parent ON profit_centers(parent_id)`,
  // עסקאות בין-חברתיות
  `CREATE INDEX IF NOT EXISTS idx_intercompany_tx_number ON intercompany_transactions(transaction_number)`,
  `CREATE INDEX IF NOT EXISTS idx_intercompany_from ON intercompany_transactions(from_entity)`,
  `CREATE INDEX IF NOT EXISTS idx_intercompany_to ON intercompany_transactions(to_entity)`,
  `CREATE INDEX IF NOT EXISTS idx_intercompany_status ON intercompany_transactions(status)`,
  `CREATE INDEX IF NOT EXISTS idx_intercompany_reconciled ON intercompany_transactions(reconciled)`,
  // כללי הקצאה
  `CREATE INDEX IF NOT EXISTS idx_allocation_rules_source ON allocation_rules(source_cost_center)`,
  `CREATE INDEX IF NOT EXISTS idx_allocation_rules_fiscal_year ON allocation_rules(fiscal_year)`,
  `CREATE INDEX IF NOT EXISTS idx_allocation_rules_status ON allocation_rules(status)`,
  // פוזיציות אוצר
  `CREATE INDEX IF NOT EXISTS idx_treasury_position_number ON treasury_positions(position_number)`,
  `CREATE INDEX IF NOT EXISTS idx_treasury_instrument_type ON treasury_positions(instrument_type)`,
  `CREATE INDEX IF NOT EXISTS idx_treasury_maturity ON treasury_positions(maturity_date)`,
  `CREATE INDEX IF NOT EXISTS idx_treasury_status ON treasury_positions(status)`,
  // משימות סגירת תקופה
  `CREATE INDEX IF NOT EXISTS idx_period_close_period ON period_close_tasks(period, fiscal_year)`,
  `CREATE INDEX IF NOT EXISTS idx_period_close_category ON period_close_tasks(category)`,
  `CREATE INDEX IF NOT EXISTS idx_period_close_status ON period_close_tasks(status)`,
  `CREATE INDEX IF NOT EXISTS idx_period_close_order ON period_close_tasks(task_order)`,
  // מסגרות אשראי
  `CREATE INDEX IF NOT EXISTS idx_credit_limits_customer ON credit_limits(customer_id)`,
  `CREATE INDEX IF NOT EXISTS idx_credit_limits_risk ON credit_limits(risk_category)`,
  `CREATE INDEX IF NOT EXISTS idx_credit_limits_blocked ON credit_limits(blocked)`,
  `CREATE INDEX IF NOT EXISTS idx_credit_limits_status ON credit_limits(status)`,
  // מדדי KPI פיננסיים
  `CREATE INDEX IF NOT EXISTS idx_financial_kpis_category ON financial_kpis(category)`,
  `CREATE INDEX IF NOT EXISTS idx_financial_kpis_period ON financial_kpis(period, fiscal_year)`,
  `CREATE INDEX IF NOT EXISTS idx_financial_kpis_status ON financial_kpis(status)`,
  // פקודות יומן חוזרות
  `CREATE INDEX IF NOT EXISTS idx_recurring_journals_frequency ON recurring_journals(frequency)`,
  `CREATE INDEX IF NOT EXISTS idx_recurring_journals_next ON recurring_journals(next_execution)`,
  `CREATE INDEX IF NOT EXISTS idx_recurring_journals_active ON recurring_journals(active)`,
];

// ─── יצירת כל הטבלאות והאינדקסים ─────────────────────────────────
async function ensureFinanceSapTables() {
  const client = await pool.connect();
  try {
    // יצירת טבלאות
    for (const [tableName, ddl] of Object.entries(TABLE_DEFINITIONS)) {
      await client.query(ddl);
      console.log(`[FINANCE-SAP] טבלה נוצרה/אומתה: ${tableName}`);
    }
    // יצירת אינדקסים
    for (const indexDdl of INDEX_DEFINITIONS) {
      await client.query(indexDdl);
    }
    console.log(`[FINANCE-SAP] כל האינדקסים נוצרו בהצלחה`);
  } finally {
    client.release();
  }
}

// ─── מפעל CRUD גנרי ─────────────────────────────────────────────
function createCrudRoutes(tableName: string, displayName: string) {
  // GET רשימה עם חיפוש, סינון לפי סטטוס/מחלקה, עימוד ומיון
  router.get(`/finance-sap/${tableName}`, async (req, res) => {
    try {
      const {
        search = "",
        status,
        department,
        category,
        currency,
        fiscal_year,
        page = "1",
        limit = "25",
        sort = "created_at",
        order = "DESC",
      } = req.query as Record<string, string>;

      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions: string[] = [`${tableName}.deleted_at IS NULL`];
      const params: any[] = [];
      let paramIdx = 1;

      if (search) {
        conditions.push(`(${tableName}::text ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
      }
      if (status) {
        conditions.push(`${tableName}.status = $${paramIdx}`);
        params.push(status);
        paramIdx++;
      }
      if (department) {
        conditions.push(`${tableName}.department = $${paramIdx}`);
        params.push(department);
        paramIdx++;
      }
      if (category) {
        conditions.push(`${tableName}.category = $${paramIdx}`);
        params.push(category);
        paramIdx++;
      }
      if (currency) {
        conditions.push(`${tableName}.currency = $${paramIdx}`);
        params.push(currency);
        paramIdx++;
      }
      if (fiscal_year) {
        conditions.push(`${tableName}.fiscal_year = $${paramIdx}`);
        params.push(parseInt(fiscal_year));
        paramIdx++;
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const allowedOrders = ["ASC", "DESC"];
      const safeOrder = allowedOrders.includes(order.toUpperCase()) ? order.toUpperCase() : "DESC";

      const countResult = await pool.query(
        `SELECT COUNT(*) FROM ${tableName} ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      const dataResult = await pool.query(
        `SELECT * FROM ${tableName} ${whereClause} ORDER BY ${sort} ${safeOrder} LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, parseInt(limit), offset]
      );

      res.json({
        data: dataResult.rows,
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      });
    } catch (err: any) {
      console.error(`[FINANCE-SAP] GET ${tableName} error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // GET סטטיסטיקות
  router.get(`/finance-sap/${tableName}/stats`, async (_req, res) => {
    try {
      const total = await pool.query(`SELECT COUNT(*) FROM ${tableName} WHERE deleted_at IS NULL`);
      const byStatus = await pool.query(
        `SELECT status, COUNT(*) as count FROM ${tableName} WHERE deleted_at IS NULL GROUP BY status ORDER BY count DESC`
      );

      let byCurrency = { rows: [] as any[] };
      try {
        byCurrency = await pool.query(
          `SELECT currency, COUNT(*) as count FROM ${tableName} WHERE deleted_at IS NULL AND currency IS NOT NULL GROUP BY currency ORDER BY count DESC`
        );
      } catch (_) { /* העמודה עשויה לא להתקיים */ }

      let byCategory = { rows: [] as any[] };
      try {
        byCategory = await pool.query(
          `SELECT category, COUNT(*) as count FROM ${tableName} WHERE deleted_at IS NULL AND category IS NOT NULL GROUP BY category ORDER BY count DESC`
        );
      } catch (_) { /* העמודה עשויה לא להתקיים */ }

      const recentCount = await pool.query(
        `SELECT COUNT(*) FROM ${tableName} WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL '30 days'`
      );

      res.json({
        total: parseInt(total.rows[0].count),
        byStatus: byStatus.rows,
        byCurrency: byCurrency.rows,
        byCategory: byCategory.rows,
        recentCount: parseInt(recentCount.rows[0].count),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET לפי מזהה
  router.get(`/finance-sap/${tableName}/:id`, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM ${tableName} WHERE id = $1 AND deleted_at IS NULL`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: `${displayName} לא נמצא` });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST יצירה
  router.post(`/finance-sap/${tableName}`, async (req, res) => {
    try {
      const fields = Object.keys(req.body);
      const values = Object.values(req.body);
      const placeholders = values.map((_, i) => `$${i + 1}`);

      const result = await pool.query(
        `INSERT INTO ${tableName} (${fields.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
        values
      );
      res.status(201).json(result.rows[0]);
    } catch (err: any) {
      console.error(`[FINANCE-SAP] POST ${tableName} error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // PUT עדכון
  router.put(`/finance-sap/${tableName}/:id`, async (req, res) => {
    try {
      const fields = Object.keys(req.body);
      const values = Object.values(req.body);
      const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");

      const result = await pool.query(
        `UPDATE ${tableName} SET ${setClause}, updated_at = NOW() WHERE id = $${fields.length + 1} AND deleted_at IS NULL RETURNING *`,
        [...values, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: `${displayName} לא נמצא` });
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE מחיקה רכה
  router.delete(`/finance-sap/${tableName}/:id`, async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE ${tableName} SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: `${displayName} לא נמצא` });
      res.json({ success: true, id: result.rows[0].id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET ייצוא נתונים
  router.get(`/finance-sap/${tableName}/export`, async (req, res) => {
    try {
      const { format = "json" } = req.query as Record<string, string>;
      const result = await pool.query(
        `SELECT * FROM ${tableName} WHERE deleted_at IS NULL ORDER BY created_at DESC`
      );

      if (format === "csv") {
        if (result.rows.length === 0) return res.status(200).send("");
        const headers = Object.keys(result.rows[0]).join(",");
        const rows = result.rows.map((r: any) => Object.values(r).map(v => `"${v ?? ""}"`).join(","));
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename=${tableName}_export.csv`);
        return res.send([headers, ...rows].join("\n"));
      }

      res.json({ data: result.rows, total: result.rows.length, exportedAt: new Date().toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── רישום CRUD לכל 8 הטבלאות ────────────────────────────────────
const tableRegistry: Array<[string, string]> = [
  ["profit_centers", "Profit Centers"],
  ["intercompany_transactions", "Intercompany Transactions"],
  ["allocation_rules", "Allocation Rules"],
  ["treasury_positions", "Treasury Positions"],
  ["period_close_tasks", "Period Close Tasks"],
  ["credit_limits", "Credit Limits"],
  ["financial_kpis", "Financial KPIs"],
  ["recurring_journals", "Recurring Journals"],
];

for (const [tableName, displayName] of tableRegistry) {
  createCrudRoutes(tableName, displayName);
}

// ═══════════════════════════════════════════════════════════════════
// ─── נקודות קצה מיוחדות ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════

// POST /init - אתחול כל הטבלאות והאינדקסים
router.post("/finance-sap/init", async (_req, res) => {
  try {
    await ensureFinanceSapTables();
    res.json({
      success: true,
      message: "כל 8 טבלאות הפיננסים ברמת SAP אותחלו בהצלחה",
      tables: tableRegistry.map(([t]) => t),
      indexes: INDEX_DEFINITIONS.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /period-close-status - סקירת התקדמות סגירת תקופה ────────
router.get("/finance-sap/period-close-status", async (req, res) => {
  try {
    const { period, fiscal_year } = req.query as Record<string, string>;

    // אם לא סופקו פרמטרים, נשתמש בתקופה האחרונה
    let periodFilter = "";
    const params: any[] = [];

    if (period && fiscal_year) {
      periodFilter = "AND period = $1 AND fiscal_year = $2";
      params.push(period, parseInt(fiscal_year));
    }

    // סיכום לפי קטגוריה
    const byCategory = await pool.query(`
      SELECT
        category,
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
      FROM period_close_tasks
      WHERE deleted_at IS NULL ${periodFilter}
      GROUP BY category
      ORDER BY
        CASE category
          WHEN 'pre_close' THEN 1
          WHEN 'close' THEN 2
          WHEN 'post_close' THEN 3
          WHEN 'reporting' THEN 4
        END
    `, params);

    // סה"כ כללי
    const overall = await pool.query(`
      SELECT
        COUNT(*) as total_tasks,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status IN ('pending','in_progress') THEN 1 ELSE 0 END) as remaining,
        ROUND(
          (SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)) * 100, 1
        ) as completion_percent
      FROM period_close_tasks
      WHERE deleted_at IS NULL ${periodFilter}
    `, params);

    // חוסמים פעילים
    const blockers = await pool.query(`
      SELECT id, task_name, task_name_he, category, responsible, blockers
      FROM period_close_tasks
      WHERE deleted_at IS NULL AND blockers IS NOT NULL AND blockers != '' AND status != 'completed'
      ${periodFilter}
      ORDER BY task_order ASC
    `, params);

    // משימות לביצוע הבאות (לפי סדר)
    const nextTasks = await pool.query(`
      SELECT id, task_name, task_name_he, category, responsible, task_order, status
      FROM period_close_tasks
      WHERE deleted_at IS NULL AND status IN ('pending','in_progress')
      ${periodFilter}
      ORDER BY task_order ASC
      LIMIT 10
    `, params);

    res.json({
      overall: overall.rows[0] || { total_tasks: 0, completed: 0, remaining: 0, completion_percent: 0 },
      byCategory: byCategory.rows,
      blockers: blockers.rows,
      nextTasks: nextTasks.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /period-close-execute - ביצוע משימת סגירה ──────────────
router.post("/finance-sap/period-close-execute", async (req, res) => {
  try {
    const { task_id, action, completed_by, notes } = req.body;

    if (!task_id || !action) {
      return res.status(400).json({ error: "נדרשים task_id ו-action" });
    }

    // בדיקה שהמשימה קיימת
    const task = await pool.query(
      `SELECT * FROM period_close_tasks WHERE id = $1 AND deleted_at IS NULL`,
      [task_id]
    );
    if (task.rows.length === 0) {
      return res.status(404).json({ error: "משימת סגירה לא נמצאה" });
    }

    let newStatus: string;
    const updates: string[] = ["updated_at = NOW()"];
    const updateParams: any[] = [];
    let paramIdx = 1;

    switch (action) {
      case "start":
        newStatus = "in_progress";
        updates.push(`status = $${paramIdx++}`);
        updateParams.push(newStatus);
        updates.push(`started_at = NOW()`);
        break;
      case "complete":
        newStatus = "completed";
        updates.push(`status = $${paramIdx++}`);
        updateParams.push(newStatus);
        updates.push(`completed_at = NOW()`);
        if (completed_by) {
          updates.push(`completed_by = $${paramIdx++}`);
          updateParams.push(completed_by);
        }
        break;
      case "skip":
        newStatus = "skipped";
        updates.push(`status = $${paramIdx++}`);
        updateParams.push(newStatus);
        break;
      case "reopen":
        newStatus = "pending";
        updates.push(`status = $${paramIdx++}`);
        updateParams.push(newStatus);
        updates.push(`completed_at = NULL`);
        updates.push(`completed_by = NULL`);
        break;
      default:
        return res.status(400).json({ error: "action חייב להיות: start, complete, skip, reopen" });
    }

    if (notes) {
      updates.push(`notes = $${paramIdx++}`);
      updateParams.push(notes);
    }

    updateParams.push(task_id);
    const result = await pool.query(
      `UPDATE period_close_tasks SET ${updates.join(", ")} WHERE id = $${paramIdx} AND deleted_at IS NULL RETURNING *`,
      updateParams
    );

    res.json({
      success: true,
      action,
      task: result.rows[0],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /credit-exposure - סיכום חשיפת אשראי לקוחות ─────────────
router.get("/finance-sap/credit-exposure", async (req, res) => {
  try {
    const { risk_category, blocked } = req.query as Record<string, string>;

    const conditions: string[] = ["deleted_at IS NULL"];
    const params: any[] = [];
    let paramIdx = 1;

    if (risk_category) {
      conditions.push(`risk_category = $${paramIdx++}`);
      params.push(risk_category);
    }
    if (blocked !== undefined) {
      conditions.push(`blocked = $${paramIdx++}`);
      params.push(blocked === "true");
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // סיכום כללי
    const summary = await pool.query(`
      SELECT
        COUNT(*) as total_customers,
        SUM(credit_limit) as total_credit_limit,
        SUM(current_exposure) as total_exposure,
        SUM(available_credit) as total_available,
        SUM(overdue_amount) as total_overdue,
        AVG(overdue_days) as avg_overdue_days,
        SUM(CASE WHEN blocked THEN 1 ELSE 0 END) as blocked_customers,
        ROUND(
          (SUM(current_exposure)::NUMERIC / NULLIF(SUM(credit_limit), 0)) * 100, 1
        ) as utilization_percent
      FROM credit_limits
      ${whereClause}
    `, params);

    // פילוח לפי קטגוריית סיכון
    const byRisk = await pool.query(`
      SELECT
        risk_category,
        COUNT(*) as count,
        SUM(credit_limit) as total_limit,
        SUM(current_exposure) as total_exposure,
        SUM(overdue_amount) as total_overdue
      FROM credit_limits
      ${whereClause}
      GROUP BY risk_category
      ORDER BY
        CASE risk_category
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `, params);

    // לקוחות בסיכון גבוה (חשיפה מעל 80% מהמסגרת או פיגור מעל 60 יום)
    const atRisk = await pool.query(`
      SELECT
        id, customer_id, customer_name, credit_limit, current_exposure,
        available_credit, overdue_amount, overdue_days, risk_category, blocked,
        ROUND((current_exposure::NUMERIC / NULLIF(credit_limit, 0)) * 100, 1) as utilization_pct
      FROM credit_limits
      WHERE deleted_at IS NULL
        AND (
          (current_exposure::NUMERIC / NULLIF(credit_limit, 0)) > 0.8
          OR overdue_days > 60
          OR blocked = TRUE
        )
      ORDER BY overdue_amount DESC
      LIMIT 20
    `);

    // לקוחות שדורשים סקירה (next_review_date עבר)
    const reviewDue = await pool.query(`
      SELECT id, customer_id, customer_name, risk_category, next_review_date, last_review_date
      FROM credit_limits
      WHERE deleted_at IS NULL AND next_review_date IS NOT NULL AND next_review_date <= NOW()
      ORDER BY next_review_date ASC
      LIMIT 20
    `);

    res.json({
      summary: summary.rows[0] || {},
      byRiskCategory: byRisk.rows,
      atRiskCustomers: atRisk.rows,
      reviewDue: reviewDue.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /allocation-run - הרצת כלל הקצאה ──────────────────────
router.post("/finance-sap/allocation-run", async (req, res) => {
  try {
    const { rule_id, executed_by, dry_run = false } = req.body;

    if (!rule_id) {
      return res.status(400).json({ error: "נדרש rule_id" });
    }

    // קריאת כלל ההקצאה
    const rule = await pool.query(
      `SELECT * FROM allocation_rules WHERE id = $1 AND deleted_at IS NULL`,
      [rule_id]
    );
    if (rule.rows.length === 0) {
      return res.status(404).json({ error: "כלל הקצאה לא נמצא" });
    }

    const allocationRule = rule.rows[0];
    const targetCenters = allocationRule.target_cost_centers || [];
    const percentages = allocationRule.percentages || {};
    const method = allocationRule.allocation_method;

    // חישוב ההקצאה לפי השיטה
    const allocations: Array<{ target: string; amount: number; percentage: number }> = [];

    if (method === "percentage" && percentages) {
      // הקצאה לפי אחוזים שהוגדרו
      for (const target of targetCenters) {
        const pct = parseFloat(percentages[target] || "0");
        const amount = (allocationRule.amount_allocated || 0) * (pct / 100);
        allocations.push({ target, amount: Math.round(amount * 100) / 100, percentage: pct });
      }
    } else if (method === "headcount" || method === "area" || method === "revenue") {
      // הקצאה שווה כברירת מחדל (בפועל תלוי בנתוני הבסיס)
      const equalShare = targetCenters.length > 0
        ? (allocationRule.amount_allocated || 0) / targetCenters.length
        : 0;
      const equalPct = targetCenters.length > 0 ? 100 / targetCenters.length : 0;
      for (const target of targetCenters) {
        allocations.push({
          target,
          amount: Math.round(equalShare * 100) / 100,
          percentage: Math.round(equalPct * 100) / 100,
        });
      }
    } else {
      // custom - שימוש באחוזים כמו percentage
      for (const target of targetCenters) {
        const pct = parseFloat(percentages[target] || "0");
        const amount = (allocationRule.amount_allocated || 0) * (pct / 100);
        allocations.push({ target, amount: Math.round(amount * 100) / 100, percentage: pct });
      }
    }

    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);

    // אם לא הרצה יבשה - עדכון הרשומה
    if (!dry_run) {
      await pool.query(
        `UPDATE allocation_rules SET status = 'executed', executed_at = NOW(), executed_by = $1, updated_at = NOW() WHERE id = $2`,
        [executed_by || "system", rule_id]
      );
    }

    res.json({
      success: true,
      dry_run,
      rule_id,
      rule_name: allocationRule.rule_name,
      method,
      source_cost_center: allocationRule.source_cost_center,
      total_amount: allocationRule.amount_allocated,
      total_allocated: totalAllocated,
      allocations,
      executed_at: dry_run ? null : new Date().toISOString(),
      executed_by: dry_run ? null : (executed_by || "system"),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /treasury-summary - סיכום פוזיציות אוצר עם סכומים ──────
router.get("/finance-sap/treasury-summary", async (req, res) => {
  try {
    const { currency, instrument_type } = req.query as Record<string, string>;

    const conditions: string[] = ["deleted_at IS NULL"];
    const params: any[] = [];
    let paramIdx = 1;

    if (currency) {
      conditions.push(`currency = $${paramIdx++}`);
      params.push(currency);
    }
    if (instrument_type) {
      conditions.push(`instrument_type = $${paramIdx++}`);
      params.push(instrument_type);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // סיכום כללי
    const totals = await pool.query(`
      SELECT
        COUNT(*) as total_positions,
        SUM(principal_amount) as total_principal,
        SUM(current_value) as total_current_value,
        SUM(unrealized_pnl) as total_unrealized_pnl,
        SUM(realized_pnl) as total_realized_pnl,
        SUM(unrealized_pnl + realized_pnl) as total_pnl,
        AVG(interest_rate) as avg_interest_rate
      FROM treasury_positions
      ${whereClause}
    `, params);

    // פילוח לפי סוג מכשיר
    const byInstrument = await pool.query(`
      SELECT
        instrument_type,
        COUNT(*) as count,
        SUM(principal_amount) as total_principal,
        SUM(current_value) as total_value,
        SUM(unrealized_pnl) as unrealized_pnl,
        SUM(realized_pnl) as realized_pnl,
        AVG(interest_rate) as avg_rate
      FROM treasury_positions
      ${whereClause}
      GROUP BY instrument_type
      ORDER BY total_principal DESC
    `, params);

    // פילוח לפי מטבע
    const byCurrency = await pool.query(`
      SELECT
        currency,
        COUNT(*) as count,
        SUM(principal_amount) as total_principal,
        SUM(current_value) as total_value,
        SUM(unrealized_pnl + realized_pnl) as total_pnl
      FROM treasury_positions
      ${whereClause}
      GROUP BY currency
      ORDER BY total_principal DESC
    `, params);

    // פוזיציות שמתבגרות ב-30 הימים הקרובים
    const maturing = await pool.query(`
      SELECT
        id, position_number, instrument_type, instrument_name, counterparty,
        principal_amount, currency, interest_rate, maturity_date, current_value
      FROM treasury_positions
      WHERE deleted_at IS NULL AND status = 'active'
        AND maturity_date IS NOT NULL
        AND maturity_date <= NOW() + INTERVAL '30 days'
        AND maturity_date >= NOW()
      ORDER BY maturity_date ASC
    `);

    // פילוח לפי דירוג סיכון
    const byRisk = await pool.query(`
      SELECT
        risk_rating,
        COUNT(*) as count,
        SUM(current_value) as total_value
      FROM treasury_positions
      ${whereClause}
      GROUP BY risk_rating
      ORDER BY
        CASE risk_rating
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END
    `, params);

    res.json({
      totals: totals.rows[0] || {},
      byInstrumentType: byInstrument.rows,
      byCurrency: byCurrency.rows,
      byRiskRating: byRisk.rows,
      maturingIn30Days: maturing.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /financial-kpis-dashboard - לוח מחוונים KPI פיננסי ──────
router.get("/finance-sap/financial-kpis-dashboard", async (req, res) => {
  try {
    const { period, fiscal_year, category } = req.query as Record<string, string>;

    const conditions: string[] = ["deleted_at IS NULL"];
    const params: any[] = [];
    let paramIdx = 1;

    if (period) {
      conditions.push(`period = $${paramIdx++}`);
      params.push(period);
    }
    if (fiscal_year) {
      conditions.push(`fiscal_year = $${paramIdx++}`);
      params.push(parseInt(fiscal_year));
    }
    if (category) {
      conditions.push(`category = $${paramIdx++}`);
      params.push(category);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // כל ה-KPIs עם פילטרים
    const kpis = await pool.query(`
      SELECT *
      FROM financial_kpis
      ${whereClause}
      ORDER BY category, kpi_name
    `, params);

    // סיכום לפי סטטוס
    const byStatus = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        AVG(variance_percent) as avg_variance_pct
      FROM financial_kpis
      ${whereClause}
      GROUP BY status
    `, params);

    // סיכום לפי קטגוריה
    const byCategoryResult = await pool.query(`
      SELECT
        category,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'on_track' THEN 1 ELSE 0 END) as on_track,
        SUM(CASE WHEN status = 'at_risk' THEN 1 ELSE 0 END) as at_risk,
        SUM(CASE WHEN status = 'off_track' THEN 1 ELSE 0 END) as off_track,
        AVG(variance_percent) as avg_variance
      FROM financial_kpis
      ${whereClause}
      GROUP BY category
      ORDER BY category
    `, params);

    // סיכום לפי מגמה
    const byTrend = await pool.query(`
      SELECT
        trend,
        COUNT(*) as count
      FROM financial_kpis
      ${whereClause}
      GROUP BY trend
    `, params);

    // KPIs בעייתיים (off_track או at_risk עם סטייה שלילית גדולה)
    const alerts = await pool.query(`
      SELECT id, kpi_name, kpi_name_he, category, target_value, actual_value, variance, variance_percent, status, trend
      FROM financial_kpis
      WHERE deleted_at IS NULL AND status IN ('off_track','at_risk')
      ORDER BY ABS(variance_percent) DESC
      LIMIT 15
    `);

    res.json({
      kpis: kpis.rows,
      summary: {
        total: kpis.rows.length,
        byStatus: byStatus.rows,
        byCategory: byCategoryResult.rows,
        byTrend: byTrend.rows,
      },
      alerts: alerts.rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /recurring-journals-execute - רישום פקודות יומן חוזרות ─
router.post("/finance-sap/recurring-journals-execute", async (req, res) => {
  try {
    const { template_id, execution_date, posted_by, dry_run = false } = req.body;

    if (!template_id) {
      return res.status(400).json({ error: "נדרש template_id" });
    }

    // קריאת תבנית פקודת היומן
    const template = await pool.query(
      `SELECT * FROM recurring_journals WHERE id = $1 AND deleted_at IS NULL`,
      [template_id]
    );
    if (template.rows.length === 0) {
      return res.status(404).json({ error: "תבנית פקודת יומן לא נמצאה" });
    }

    const journal = template.rows[0];

    if (!journal.active) {
      return res.status(400).json({ error: "תבנית פקודת היומן אינה פעילה" });
    }

    const entries = journal.journal_entries || [];
    const execDate = execution_date || new Date().toISOString().split("T")[0];

    // חישוב סך חיוב/זיכוי
    let totalDebit = 0;
    let totalCredit = 0;
    for (const entry of entries) {
      totalDebit += parseFloat(entry.debit || 0);
      totalCredit += parseFloat(entry.credit || 0);
    }

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

    if (!isBalanced) {
      return res.status(400).json({
        error: "פקודת היומן אינה מאוזנת",
        totalDebit,
        totalCredit,
        difference: Math.abs(totalDebit - totalCredit),
      });
    }

    // חישוב תאריך הביצוע הבא
    let nextExecution: string | null = null;
    const currentDate = new Date(execDate);
    switch (journal.frequency) {
      case "monthly":
        currentDate.setMonth(currentDate.getMonth() + 1);
        nextExecution = currentDate.toISOString().split("T")[0];
        break;
      case "quarterly":
        currentDate.setMonth(currentDate.getMonth() + 3);
        nextExecution = currentDate.toISOString().split("T")[0];
        break;
      case "annually":
        currentDate.setFullYear(currentDate.getFullYear() + 1);
        nextExecution = currentDate.toISOString().split("T")[0];
        break;
    }

    // עדכון התבנית (אם לא הרצה יבשה)
    if (!dry_run) {
      await pool.query(
        `UPDATE recurring_journals
         SET last_execution = $1, next_execution = $2, updated_at = NOW()
         WHERE id = $3`,
        [execDate, nextExecution, template_id]
      );
    }

    res.json({
      success: true,
      dry_run,
      template_id,
      template_name: journal.template_name,
      frequency: journal.frequency,
      execution_date: execDate,
      next_execution: nextExecution,
      entries_count: entries.length,
      total_debit: totalDebit,
      total_credit: totalCredit,
      is_balanced: isBalanced,
      posted_by: posted_by || "system",
      entries: dry_run ? entries : undefined,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
