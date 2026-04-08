// ============================================================
// production-sap-upgrade.ts
// שדרוג ייצור ברמת SAP - MRP, תכנון קיבולת, OEE, אצוות, מספרים סידוריים
// כלי ייצור, עבודות חוזרות, זמני השבתה
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// יצירת טבלאות ייצור SAP
// ============================================================
async function ensureProductionSapTables(): Promise<void> {
  await pool.query(`

    -- ריצות MRP - תכנון דרישות חומרים
    CREATE TABLE IF NOT EXISTS mrp_runs (
      id SERIAL PRIMARY KEY,
      run_number VARCHAR(100),
      run_date TIMESTAMPTZ DEFAULT NOW(),
      run_type VARCHAR(30) CHECK (run_type IN ('net_change', 'regenerative', 'selective')) DEFAULT 'net_change',
      planning_horizon_days INTEGER DEFAULT 90,
      status VARCHAR(30) CHECK (status IN ('scheduled', 'running', 'completed', 'failed')) DEFAULT 'scheduled',
      items_planned INTEGER DEFAULT 0,
      orders_created INTEGER DEFAULT 0,
      messages TEXT,
      run_by VARCHAR(200),
      duration_seconds INTEGER,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- תוצאות MRP - חוסרים והמלצות
    CREATE TABLE IF NOT EXISTS mrp_results (
      id SERIAL PRIMARY KEY,
      mrp_run_id INTEGER REFERENCES mrp_runs(id) ON DELETE CASCADE,
      material_id INTEGER,
      material_name VARCHAR(300),
      material_type VARCHAR(30) CHECK (material_type IN ('raw', 'semi', 'finished')) DEFAULT 'raw',
      current_stock NUMERIC(15,3) DEFAULT 0,
      required_qty NUMERIC(15,3) DEFAULT 0,
      shortage_qty NUMERIC(15,3) DEFAULT 0,
      recommended_action VARCHAR(30) CHECK (recommended_action IN ('purchase', 'produce', 'transfer')) DEFAULT 'purchase',
      recommended_qty NUMERIC(15,3) DEFAULT 0,
      recommended_date DATE,
      lead_time_days INTEGER DEFAULT 0,
      supplier_name VARCHAR(300),
      priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
      status VARCHAR(20) CHECK (status IN ('open', 'ordered', 'closed')) DEFAULT 'open',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- תכנון קיבולת - משאבים, שעות, ניצולת
    CREATE TABLE IF NOT EXISTS capacity_planning (
      id SERIAL PRIMARY KEY,
      resource_type VARCHAR(30) CHECK (resource_type IN ('machine', 'labor', 'tool')) DEFAULT 'machine',
      resource_id INTEGER,
      resource_name VARCHAR(300),
      department VARCHAR(200),
      period_start DATE,
      period_end DATE,
      available_hours NUMERIC(10,2) DEFAULT 0,
      planned_hours NUMERIC(10,2) DEFAULT 0,
      actual_hours NUMERIC(10,2) DEFAULT 0,
      utilization_percent NUMERIC(6,2) DEFAULT 0,
      overload BOOLEAN DEFAULT FALSE,
      overload_hours NUMERIC(10,2) DEFAULT 0,
      shift_pattern VARCHAR(100),
      efficiency_factor NUMERIC(5,3) DEFAULT 1.0,
      notes TEXT,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- רשומות אצוות - מעקב ייצור לפי אצווה
    CREATE TABLE IF NOT EXISTS batch_records (
      id SERIAL PRIMARY KEY,
      batch_number VARCHAR(100) UNIQUE,
      product_id INTEGER,
      product_name VARCHAR(300),
      work_order_id INTEGER,
      quantity NUMERIC(15,3) DEFAULT 0,
      unit VARCHAR(50),
      production_date DATE,
      expiry_date DATE,
      quality_status VARCHAR(30) CHECK (quality_status IN ('pending', 'passed', 'failed', 'quarantine')) DEFAULT 'pending',
      inspection_id INTEGER,
      storage_location VARCHAR(200),
      supplier_batch VARCHAR(200),
      traceability_chain JSONB DEFAULT '[]'::jsonb,
      notes TEXT,
      status VARCHAR(50) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- מספרים סידוריים - מעקב יחידות בודדות
    CREATE TABLE IF NOT EXISTS serial_numbers (
      id SERIAL PRIMARY KEY,
      serial_number VARCHAR(200) UNIQUE,
      product_id INTEGER,
      product_name VARCHAR(300),
      batch_id INTEGER REFERENCES batch_records(id) ON DELETE SET NULL,
      work_order_id INTEGER,
      production_date DATE,
      warranty_start DATE,
      warranty_end DATE,
      current_location VARCHAR(200),
      customer_id INTEGER,
      customer_name VARCHAR(300),
      sold_date DATE,
      status VARCHAR(30) CHECK (status IN ('available', 'sold', 'returned', 'scrapped', 'warranty')) DEFAULT 'available',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- רשומות OEE - יעילות ציוד כוללת
    CREATE TABLE IF NOT EXISTS oee_records (
      id SERIAL PRIMARY KEY,
      machine_id INTEGER,
      machine_name VARCHAR(300),
      department VARCHAR(200),
      shift_date DATE,
      shift_type VARCHAR(50),
      planned_production_time NUMERIC(10,2) DEFAULT 0,
      actual_run_time NUMERIC(10,2) DEFAULT 0,
      ideal_cycle_time NUMERIC(10,4) DEFAULT 0,
      total_pieces NUMERIC(15,2) DEFAULT 0,
      good_pieces NUMERIC(15,2) DEFAULT 0,
      availability_pct NUMERIC(6,2) DEFAULT 0,
      performance_pct NUMERIC(6,2) DEFAULT 0,
      quality_pct NUMERIC(6,2) DEFAULT 0,
      oee_pct NUMERIC(6,2) DEFAULT 0,
      downtime_minutes NUMERIC(10,2) DEFAULT 0,
      downtime_reasons JSONB DEFAULT '[]'::jsonb,
      speed_losses NUMERIC(10,2) DEFAULT 0,
      defect_count INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- ניהול כלים - כלי ייצור, תחזוקה, כיול
    CREATE TABLE IF NOT EXISTS tool_management (
      id SERIAL PRIMARY KEY,
      tool_number VARCHAR(100),
      tool_name VARCHAR(300),
      tool_name_he VARCHAR(300),
      tool_type VARCHAR(100),
      manufacturer VARCHAR(200),
      model VARCHAR(200),
      serial_number VARCHAR(200),
      purchase_date DATE,
      purchase_cost NUMERIC(12,2) DEFAULT 0,
      current_condition VARCHAR(30) CHECK (current_condition IN ('new', 'good', 'fair', 'worn', 'broken')) DEFAULT 'new',
      location VARCHAR(200),
      assigned_to_machine INTEGER,
      assigned_to_machine_name VARCHAR(300),
      total_usage_hours NUMERIC(10,2) DEFAULT 0,
      max_usage_hours NUMERIC(10,2) DEFAULT 0,
      last_maintenance DATE,
      next_maintenance DATE,
      calibration_date DATE,
      calibration_due DATE,
      status VARCHAR(30) CHECK (status IN ('active', 'maintenance', 'retired', 'lost')) DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- הזמנות עבודה חוזרת - תיקונים ועיבוד מחדש
    CREATE TABLE IF NOT EXISTS rework_orders (
      id SERIAL PRIMARY KEY,
      rework_number VARCHAR(100),
      original_work_order INTEGER,
      original_wo_number VARCHAR(100),
      product_name VARCHAR(300),
      quantity NUMERIC(15,3) DEFAULT 0,
      defect_type VARCHAR(200),
      defect_description TEXT,
      root_cause TEXT,
      rework_instructions TEXT,
      assigned_to VARCHAR(200),
      estimated_hours NUMERIC(8,2) DEFAULT 0,
      actual_hours NUMERIC(8,2) DEFAULT 0,
      material_cost NUMERIC(12,2) DEFAULT 0,
      labor_cost NUMERIC(12,2) DEFAULT 0,
      total_cost NUMERIC(12,2) DEFAULT 0,
      quality_check_required BOOLEAN DEFAULT TRUE,
      quality_result VARCHAR(100),
      status VARCHAR(30) CHECK (status IN ('pending', 'in_progress', 'completed', 'scrapped')) DEFAULT 'pending',
      priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- רשומות השבתה - זמני עצירה ועלויות
    CREATE TABLE IF NOT EXISTS downtime_records (
      id SERIAL PRIMARY KEY,
      machine_id INTEGER,
      machine_name VARCHAR(300),
      department VARCHAR(200),
      start_time TIMESTAMPTZ,
      end_time TIMESTAMPTZ,
      duration_minutes NUMERIC(10,2) DEFAULT 0,
      downtime_type VARCHAR(30) CHECK (downtime_type IN ('planned', 'unplanned', 'changeover', 'breakdown', 'maintenance')) DEFAULT 'unplanned',
      category VARCHAR(200),
      reason TEXT,
      impact_description TEXT,
      production_lost_units INTEGER DEFAULT 0,
      cost_impact NUMERIC(12,2) DEFAULT 0,
      corrective_action TEXT,
      reported_by VARCHAR(200),
      resolved_by VARCHAR(200),
      status VARCHAR(30) CHECK (status IN ('active', 'resolved', 'under_investigation')) DEFAULT 'active',
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

  `);
}

// ============================================================
// הגדרת טבלאות עבור CRUD גנרי
// ============================================================
const TABLE_CONFIGS: Record<string, { table: string; label: string }> = {
  'mrp-runs':          { table: 'mrp_runs',          label: 'ריצות MRP' },
  'mrp-results':       { table: 'mrp_results',       label: 'תוצאות MRP' },
  'capacity-planning': { table: 'capacity_planning',  label: 'תכנון קיבולת' },
  'batch-records':     { table: 'batch_records',      label: 'רשומות אצוות' },
  'serial-numbers':    { table: 'serial_numbers',     label: 'מספרים סידוריים' },
  'oee-records':       { table: 'oee_records',        label: 'רשומות OEE' },
  'tool-management':   { table: 'tool_management',    label: 'ניהול כלים' },
  'rework-orders':     { table: 'rework_orders',      label: 'עבודות חוזרות' },
  'downtime-records':  { table: 'downtime_records',   label: 'רשומות השבתה' },
};

// ============================================================
// CRUD גנרי לכל 9 הטבלאות
// ============================================================
for (const [routePath, cfg] of Object.entries(TABLE_CONFIGS)) {

  // GET - שליפת כל הרשומות עם חיפוש ודפדוף
  router.get(`/${routePath}`, async (req: Request, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const rawSortBy = (req.query.sortBy as string) || 'created_at';
      // תיקון: מניעת SQL injection - רק שמות עמודות חוקיים מותרים ב-ORDER BY
      const ALLOWED_SORT_COLUMNS = ['id', 'created_at', 'updated_at', 'status', 'priority', 'notes'];
      const sortBy = ALLOWED_SORT_COLUMNS.includes(rawSortBy) ? rawSortBy : 'created_at';
      const sortDir = (req.query.sortDir as string)?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      let whereClause = '';
      const params: any[] = [];
      const conditions: string[] = [];

      if (search) {
        params.push(`%${search}%`);
        conditions.push(`(CAST(${cfg.table} AS TEXT) ILIKE $${params.length})`);
      }
      if (status) {
        params.push(status);
        conditions.push(`status = $${params.length}`);
      }

      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }

      // ספירה כוללת
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM ${cfg.table} ${whereClause}`,
        params
      );
      const total = parseInt(countResult.rows[0].count);

      // שליפת נתונים
      const dataParams = [...params, limit, offset];
      const dataResult = await pool.query(
        `SELECT * FROM ${cfg.table} ${whereClause}
         ORDER BY ${sortBy} ${sortDir}
         LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
        dataParams
      );

      res.json({
        success: true,
        data: dataResult.rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        label: cfg.label
      });
    } catch (error: any) {
      console.error(`שגיאה בשליפת ${cfg.label}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // GET /:id - שליפת רשומה בודדת
  router.get(`/${routePath}/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`SELECT * FROM ${cfg.table} WHERE id = $1`, [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: `${cfg.label} לא נמצא` });
      }
      res.json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      console.error(`שגיאה בשליפת ${cfg.label}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // POST - יצירת רשומה חדשה
  router.post(`/${routePath}`, async (req: Request, res: Response) => {
    try {
      const body = req.body;
      const keys = Object.keys(body).filter(k => k !== 'id');
      if (keys.length === 0) {
        return res.status(400).json({ success: false, error: 'לא סופקו נתונים' });
      }
      const cols = keys.join(', ');
      const vals = keys.map((_, i) => `$${i + 1}`).join(', ');
      const params = keys.map(k => body[k]);

      const result = await pool.query(
        `INSERT INTO ${cfg.table} (${cols}) VALUES (${vals}) RETURNING *`,
        params
      );
      res.status(201).json({ success: true, data: result.rows[0], message: `${cfg.label} נוצר בהצלחה` });
    } catch (error: any) {
      console.error(`שגיאה ביצירת ${cfg.label}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // PUT /:id - עדכון רשומה
  router.put(`/${routePath}/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body;
      const keys = Object.keys(body).filter(k => k !== 'id');
      if (keys.length === 0) {
        return res.status(400).json({ success: false, error: 'לא סופקו נתונים לעדכון' });
      }
      const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const params = [...keys.map(k => body[k]), id];

      const result = await pool.query(
        `UPDATE ${cfg.table} SET ${sets}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
        params
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: `${cfg.label} לא נמצא` });
      }
      res.json({ success: true, data: result.rows[0], message: `${cfg.label} עודכן בהצלחה` });
    } catch (error: any) {
      console.error(`שגיאה בעדכון ${cfg.label}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // DELETE /:id - מחיקת רשומה
  router.delete(`/${routePath}/:id`, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        `DELETE FROM ${cfg.table} WHERE id = $1 RETURNING id`,
        [id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: `${cfg.label} לא נמצא` });
      }
      res.json({ success: true, message: `${cfg.label} נמחק בהצלחה` });
    } catch (error: any) {
      console.error(`שגיאה במחיקת ${cfg.label}:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

// ============================================================
// POST /init - אתחול טבלאות
// ============================================================
router.post('/init', async (_req: Request, res: Response) => {
  try {
    await ensureProductionSapTables();
    res.json({
      success: true,
      message: 'טבלאות ייצור SAP אותחלו בהצלחה',
      tables: Object.values(TABLE_CONFIGS).map(c => c.table)
    });
  } catch (error: any) {
    console.error('שגיאה באתחול טבלאות ייצור SAP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// POST /mrp-run - הרצת חישוב MRP
// בודק מלאי מול ביקוש, מייצר רשימת חוסרים והמלצות
// ============================================================
router.post('/mrp-run', async (req: Request, res: Response) => {
  try {
    const {
      run_type = 'net_change',
      planning_horizon_days = 90,
      run_by = 'system'
    } = req.body;

    const runNumber = `MRP-${Date.now()}`;
    const startTime = Date.now();

    // יצירת ריצת MRP חדשה
    const runResult = await pool.query(
      `INSERT INTO mrp_runs (run_number, run_type, planning_horizon_days, status, run_by)
       VALUES ($1, $2, $3, 'running', $4) RETURNING *`,
      [runNumber, run_type, planning_horizon_days, run_by]
    );
    const mrpRun = runResult.rows[0];

    // שליפת חומרים ובדיקת מלאי מול ביקושים
    // בודק אם יש טבלאות inventory_items ו-work_orders, אחרת מדלג
    let itemsPlanned = 0;
    let ordersCreated = 0;
    const messages: string[] = [];

    try {
      // ניסיון לשלוף חומרים ממלאי ולחשב חוסרים
      const materialsCheck = await pool.query(`
        SELECT
          ii.id AS material_id,
          ii.name AS material_name,
          COALESCE(ii.quantity, 0) AS current_stock,
          COALESCE(
            (SELECT SUM(woi.quantity) FROM work_order_items woi
             JOIN work_orders wo ON wo.id = woi.work_order_id
             WHERE woi.item_id = ii.id
             AND wo.status IN ('pending', 'in_progress')
             AND wo.due_date <= CURRENT_DATE + ($1 || ' days')::INTERVAL),
            0
          ) AS required_qty
        FROM inventory_items ii
        WHERE ii.quantity < COALESCE(ii.min_stock, 0)
           OR ii.quantity < (
             SELECT COALESCE(SUM(woi.quantity), 0) FROM work_order_items woi
             JOIN work_orders wo ON wo.id = woi.work_order_id
             WHERE woi.item_id = ii.id
             AND wo.status IN ('pending', 'in_progress')
           )
      `, [planning_horizon_days]);

      for (const mat of materialsCheck.rows) {
        const shortageQty = Math.max(0, mat.required_qty - mat.current_stock);
        if (shortageQty > 0) {
          await pool.query(
            `INSERT INTO mrp_results
             (mrp_run_id, material_id, material_name, current_stock, required_qty,
              shortage_qty, recommended_action, recommended_qty, recommended_date, priority)
             VALUES ($1, $2, $3, $4, $5, $6, 'purchase', $6, CURRENT_DATE + 7,
                     CASE WHEN $6 > $5 * 0.5 THEN 'critical'
                          WHEN $6 > $5 * 0.3 THEN 'high'
                          WHEN $6 > $5 * 0.1 THEN 'medium'
                          ELSE 'low' END)`,
            [mrpRun.id, mat.material_id, mat.material_name, mat.current_stock,
             mat.required_qty, shortageQty]
          );
          ordersCreated++;
        }
        itemsPlanned++;
      }

      messages.push(`נבדקו ${itemsPlanned} חומרים, נמצאו ${ordersCreated} חוסרים`);
    } catch (innerErr: any) {
      // אם טבלאות מלאי לא קיימות - הודעה מתאימה
      messages.push(`חישוב MRP חלקי - טבלאות מלאי לא זמינות: ${innerErr.message}`);
    }

    // עדכון ריצת MRP עם תוצאות
    const durationSeconds = Math.round((Date.now() - startTime) / 1000);
    await pool.query(
      `UPDATE mrp_runs SET
         status = 'completed',
         items_planned = $1,
         orders_created = $2,
         messages = $3,
         duration_seconds = $4,
         updated_at = NOW()
       WHERE id = $5`,
      [itemsPlanned, ordersCreated, messages.join('\n'), durationSeconds, mrpRun.id]
    );

    // שליפת תוצאות סופיות
    const results = await pool.query(
      `SELECT * FROM mrp_results WHERE mrp_run_id = $1 ORDER BY priority DESC, shortage_qty DESC`,
      [mrpRun.id]
    );

    res.json({
      success: true,
      message: 'ריצת MRP הושלמה בהצלחה',
      run: { ...mrpRun, status: 'completed', items_planned: itemsPlanned, orders_created: ordersCreated, duration_seconds: durationSeconds },
      results: results.rows,
      summary: {
        items_planned: itemsPlanned,
        shortages_found: ordersCreated,
        critical: results.rows.filter((r: any) => r.priority === 'critical').length,
        high: results.rows.filter((r: any) => r.priority === 'high').length,
        medium: results.rows.filter((r: any) => r.priority === 'medium').length,
        low: results.rows.filter((r: any) => r.priority === 'low').length,
      }
    });
  } catch (error: any) {
    console.error('שגיאה בהרצת MRP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /mrp-results/:runId - תוצאות MRP לריצה מסוימת
// ============================================================
router.get('/mrp-results/:runId', async (req: Request, res: Response) => {
  try {
    const { runId } = req.params;

    // שליפת פרטי הריצה
    const runResult = await pool.query(`SELECT * FROM mrp_runs WHERE id = $1`, [runId]);
    if (runResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'ריצת MRP לא נמצאה' });
    }

    // שליפת תוצאות
    const results = await pool.query(
      `SELECT * FROM mrp_results WHERE mrp_run_id = $1 ORDER BY priority DESC, shortage_qty DESC`,
      [runId]
    );

    // סיכום לפי פעולה מומלצת
    const byAction = await pool.query(
      `SELECT recommended_action, COUNT(*) AS count, SUM(shortage_qty) AS total_shortage
       FROM mrp_results WHERE mrp_run_id = $1
       GROUP BY recommended_action`,
      [runId]
    );

    res.json({
      success: true,
      run: runResult.rows[0],
      results: results.rows,
      summary: {
        total_items: results.rows.length,
        by_action: byAction.rows,
        by_priority: {
          critical: results.rows.filter((r: any) => r.priority === 'critical').length,
          high: results.rows.filter((r: any) => r.priority === 'high').length,
          medium: results.rows.filter((r: any) => r.priority === 'medium').length,
          low: results.rows.filter((r: any) => r.priority === 'low').length,
        }
      }
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת תוצאות MRP:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /capacity-overview - סקירת ניצולת קיבולת
// ============================================================
router.get('/capacity-overview', async (req: Request, res: Response) => {
  try {
    const department = req.query.department as string;
    const resourceType = req.query.resource_type as string;

    let whereClause = '';
    const params: any[] = [];
    const conditions: string[] = [];

    if (department) {
      params.push(department);
      conditions.push(`department = $${params.length}`);
    }
    if (resourceType) {
      params.push(resourceType);
      conditions.push(`resource_type = $${params.length}`);
    }
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // סיכום ניצולת כולל
    const overall = await pool.query(
      `SELECT
         COUNT(*) AS total_resources,
         ROUND(AVG(utilization_percent), 2) AS avg_utilization,
         ROUND(SUM(available_hours), 2) AS total_available_hours,
         ROUND(SUM(planned_hours), 2) AS total_planned_hours,
         ROUND(SUM(actual_hours), 2) AS total_actual_hours,
         SUM(CASE WHEN overload = TRUE THEN 1 ELSE 0 END) AS overloaded_resources,
         ROUND(SUM(overload_hours), 2) AS total_overload_hours
       FROM capacity_planning ${whereClause}`,
      params
    );

    // פירוט לפי מחלקה
    const byDepartment = await pool.query(
      `SELECT
         department,
         COUNT(*) AS resource_count,
         ROUND(AVG(utilization_percent), 2) AS avg_utilization,
         ROUND(SUM(available_hours), 2) AS available_hours,
         ROUND(SUM(planned_hours), 2) AS planned_hours,
         SUM(CASE WHEN overload = TRUE THEN 1 ELSE 0 END) AS overloaded
       FROM capacity_planning ${whereClause}
       GROUP BY department
       ORDER BY avg_utilization DESC`,
      params
    );

    // פירוט לפי סוג משאב
    const byType = await pool.query(
      `SELECT
         resource_type,
         COUNT(*) AS count,
         ROUND(AVG(utilization_percent), 2) AS avg_utilization,
         ROUND(AVG(efficiency_factor), 3) AS avg_efficiency
       FROM capacity_planning ${whereClause}
       GROUP BY resource_type`,
      params
    );

    // משאבים עם עומס יתר
    const overloaded = await pool.query(
      `SELECT resource_name, department, resource_type, utilization_percent, overload_hours
       FROM capacity_planning
       WHERE overload = TRUE ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
       ORDER BY overload_hours DESC
       LIMIT 20`,
      params
    );

    res.json({
      success: true,
      overall: overall.rows[0],
      by_department: byDepartment.rows,
      by_resource_type: byType.rows,
      overloaded_resources: overloaded.rows
    });
  } catch (error: any) {
    console.error('שגיאה בסקירת קיבולת:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /oee-dashboard - לוח מחוונים OEE
// ============================================================
router.get('/oee-dashboard', async (req: Request, res: Response) => {
  try {
    const department = req.query.department as string;
    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;

    const conditions: string[] = [];
    const params: any[] = [];

    if (department) {
      params.push(department);
      conditions.push(`department = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`shift_date >= $${params.length}`);
    }
    if (dateTo) {
      params.push(dateTo);
      conditions.push(`shift_date <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // ממוצעי OEE כלליים
    const overall = await pool.query(
      `SELECT
         COUNT(*) AS total_records,
         ROUND(AVG(oee_pct), 2) AS avg_oee,
         ROUND(AVG(availability_pct), 2) AS avg_availability,
         ROUND(AVG(performance_pct), 2) AS avg_performance,
         ROUND(AVG(quality_pct), 2) AS avg_quality,
         ROUND(SUM(downtime_minutes), 2) AS total_downtime_minutes,
         SUM(defect_count) AS total_defects,
         ROUND(SUM(good_pieces), 2) AS total_good_pieces,
         ROUND(SUM(total_pieces), 2) AS total_pieces
       FROM oee_records ${whereClause}`,
      params
    );

    // OEE לפי מכונה
    const byMachine = await pool.query(
      `SELECT
         machine_id,
         machine_name,
         department,
         COUNT(*) AS shifts_recorded,
         ROUND(AVG(oee_pct), 2) AS avg_oee,
         ROUND(AVG(availability_pct), 2) AS avg_availability,
         ROUND(AVG(performance_pct), 2) AS avg_performance,
         ROUND(AVG(quality_pct), 2) AS avg_quality,
         ROUND(SUM(downtime_minutes), 2) AS total_downtime,
         SUM(defect_count) AS total_defects
       FROM oee_records ${whereClause}
       GROUP BY machine_id, machine_name, department
       ORDER BY avg_oee ASC`,
      params
    );

    // OEE לפי מחלקה
    const byDepartment = await pool.query(
      `SELECT
         department,
         COUNT(DISTINCT machine_id) AS machines,
         ROUND(AVG(oee_pct), 2) AS avg_oee,
         ROUND(AVG(availability_pct), 2) AS avg_availability,
         ROUND(AVG(performance_pct), 2) AS avg_performance,
         ROUND(AVG(quality_pct), 2) AS avg_quality
       FROM oee_records ${whereClause}
       GROUP BY department
       ORDER BY avg_oee ASC`,
      params
    );

    // מגמת OEE לפי תאריך
    const trend = await pool.query(
      `SELECT
         shift_date,
         ROUND(AVG(oee_pct), 2) AS avg_oee,
         ROUND(AVG(availability_pct), 2) AS avg_availability,
         ROUND(AVG(performance_pct), 2) AS avg_performance,
         ROUND(AVG(quality_pct), 2) AS avg_quality
       FROM oee_records ${whereClause}
       GROUP BY shift_date
       ORDER BY shift_date DESC
       LIMIT 60`,
      params
    );

    res.json({
      success: true,
      overall: overall.rows[0],
      by_machine: byMachine.rows,
      by_department: byDepartment.rows,
      trend: trend.rows,
      benchmarks: {
        world_class: 85,
        good: 70,
        average: 55,
        needs_improvement: 40
      }
    });
  } catch (error: any) {
    console.error('שגיאה בלוח מחוונים OEE:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /batch-trace/:batchNumber - עקיבות מלאה לאצווה
// ============================================================
router.get('/batch-trace/:batchNumber', async (req: Request, res: Response) => {
  try {
    const { batchNumber } = req.params;

    // שליפת רשומת אצווה
    const batchResult = await pool.query(
      `SELECT * FROM batch_records WHERE batch_number = $1`,
      [batchNumber]
    );
    if (batchResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'אצווה לא נמצאה' });
    }
    const batch = batchResult.rows[0];

    // מספרים סידוריים באצווה
    const serialNums = await pool.query(
      `SELECT * FROM serial_numbers WHERE batch_id = $1 ORDER BY serial_number`,
      [batch.id]
    );

    // עבודות חוזרות קשורות
    const reworks = await pool.query(
      `SELECT * FROM rework_orders WHERE original_work_order = $1 ORDER BY created_at DESC`,
      [batch.work_order_id]
    );

    // רשומות OEE של תאריך הייצור
    let oeeRecords: any[] = [];
    if (batch.production_date) {
      const oeeResult = await pool.query(
        `SELECT * FROM oee_records WHERE shift_date = $1 ORDER BY machine_name`,
        [batch.production_date]
      );
      oeeRecords = oeeResult.rows;
    }

    // השבתות ביום הייצור
    let downtimes: any[] = [];
    if (batch.production_date) {
      const dtResult = await pool.query(
        `SELECT * FROM downtime_records
         WHERE DATE(start_time) = $1
         ORDER BY start_time`,
        [batch.production_date]
      );
      downtimes = dtResult.rows;
    }

    res.json({
      success: true,
      batch,
      traceability: {
        serial_numbers: serialNums.rows,
        serial_count: serialNums.rows.length,
        rework_orders: reworks.rows,
        oee_on_production_date: oeeRecords,
        downtimes_on_production_date: downtimes,
        traceability_chain: batch.traceability_chain || []
      }
    });
  } catch (error: any) {
    console.error('שגיאה בעקיבות אצווה:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /serial-trace/:serialNumber - מחזור חיים מלא למספר סידורי
// ============================================================
router.get('/serial-trace/:serialNumber', async (req: Request, res: Response) => {
  try {
    const { serialNumber } = req.params;

    // שליפת מספר סידורי
    const snResult = await pool.query(
      `SELECT * FROM serial_numbers WHERE serial_number = $1`,
      [serialNumber]
    );
    if (snResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'מספר סידורי לא נמצא' });
    }
    const sn = snResult.rows[0];

    // אצווה משויכת
    let batch = null;
    if (sn.batch_id) {
      const batchResult = await pool.query(
        `SELECT * FROM batch_records WHERE id = $1`,
        [sn.batch_id]
      );
      if (batchResult.rows.length > 0) batch = batchResult.rows[0];
    }

    // עבודות חוזרות קשורות
    let reworks: any[] = [];
    if (sn.work_order_id) {
      const reworkResult = await pool.query(
        `SELECT * FROM rework_orders WHERE original_work_order = $1 ORDER BY created_at DESC`,
        [sn.work_order_id]
      );
      reworks = reworkResult.rows;
    }

    // חישוב ימי אחריות שנותרו
    let warrantyDaysRemaining: number | null = null;
    if (sn.warranty_end) {
      const today = new Date();
      const warrantyEnd = new Date(sn.warranty_end);
      warrantyDaysRemaining = Math.ceil((warrantyEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    }

    res.json({
      success: true,
      serial: sn,
      lifecycle: {
        production_date: sn.production_date,
        batch: batch ? { batch_number: batch.batch_number, quality_status: batch.quality_status } : null,
        warranty: {
          start: sn.warranty_start,
          end: sn.warranty_end,
          days_remaining: warrantyDaysRemaining,
          is_active: warrantyDaysRemaining !== null && warrantyDaysRemaining > 0
        },
        current_status: sn.status,
        current_location: sn.current_location,
        customer: sn.customer_id ? { id: sn.customer_id, name: sn.customer_name, sold_date: sn.sold_date } : null,
        rework_history: reworks
      }
    });
  } catch (error: any) {
    console.error('שגיאה בעקיבות מספר סידורי:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /downtime-analysis - ניתוח פארטו של השבתות
// ============================================================
router.get('/downtime-analysis', async (req: Request, res: Response) => {
  try {
    const department = req.query.department as string;
    const dateFrom = req.query.date_from as string;
    const dateTo = req.query.date_to as string;

    const conditions: string[] = [];
    const params: any[] = [];

    if (department) {
      params.push(department);
      conditions.push(`department = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`start_time >= $${params.length}::TIMESTAMPTZ`);
    }
    if (dateTo) {
      params.push(dateTo);
      conditions.push(`start_time <= $${params.length}::TIMESTAMPTZ`);
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    // סיכום כולל
    const overall = await pool.query(
      `SELECT
         COUNT(*) AS total_events,
         ROUND(SUM(duration_minutes), 2) AS total_downtime_minutes,
         ROUND(AVG(duration_minutes), 2) AS avg_duration,
         ROUND(SUM(cost_impact), 2) AS total_cost,
         SUM(production_lost_units) AS total_lost_units
       FROM downtime_records ${whereClause}`,
      params
    );

    // פארטו לפי סיבה - Top reasons
    const byReason = await pool.query(
      `SELECT
         COALESCE(category, 'לא מסווג') AS category,
         COUNT(*) AS event_count,
         ROUND(SUM(duration_minutes), 2) AS total_minutes,
         ROUND(SUM(cost_impact), 2) AS total_cost,
         ROUND(100.0 * SUM(duration_minutes) / NULLIF((SELECT SUM(duration_minutes) FROM downtime_records ${whereClause}), 0), 2) AS pct_of_total
       FROM downtime_records ${whereClause}
       GROUP BY category
       ORDER BY total_minutes DESC
       LIMIT 15`,
      params
    );

    // פארטו לפי מכונה
    const byMachine = await pool.query(
      `SELECT
         machine_id,
         machine_name,
         department,
         COUNT(*) AS event_count,
         ROUND(SUM(duration_minutes), 2) AS total_minutes,
         ROUND(SUM(cost_impact), 2) AS total_cost,
         SUM(production_lost_units) AS lost_units
       FROM downtime_records ${whereClause}
       GROUP BY machine_id, machine_name, department
       ORDER BY total_minutes DESC
       LIMIT 15`,
      params
    );

    // פירוט לפי סוג השבתה
    const byType = await pool.query(
      `SELECT
         downtime_type,
         COUNT(*) AS event_count,
         ROUND(SUM(duration_minutes), 2) AS total_minutes,
         ROUND(SUM(cost_impact), 2) AS total_cost,
         ROUND(AVG(duration_minutes), 2) AS avg_duration
       FROM downtime_records ${whereClause}
       GROUP BY downtime_type
       ORDER BY total_minutes DESC`,
      params
    );

    // מגמת השבתות לפי יום
    const trend = await pool.query(
      `SELECT
         DATE(start_time) AS day,
         COUNT(*) AS events,
         ROUND(SUM(duration_minutes), 2) AS total_minutes,
         ROUND(SUM(cost_impact), 2) AS cost
       FROM downtime_records ${whereClause}
       GROUP BY DATE(start_time)
       ORDER BY day DESC
       LIMIT 60`,
      params
    );

    res.json({
      success: true,
      overall: overall.rows[0],
      pareto_by_reason: byReason.rows,
      pareto_by_machine: byMachine.rows,
      by_downtime_type: byType.rows,
      daily_trend: trend.rows
    });
  } catch (error: any) {
    console.error('שגיאה בניתוח השבתות:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// GET /tool-alerts - התראות כלים הדורשים תחזוקה/כיול
// ============================================================
router.get('/tool-alerts', async (_req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // כלים שדורשים תחזוקה (תאריך עבר או קרוב ב-7 ימים)
    const maintenanceDue = await pool.query(
      `SELECT id, tool_number, tool_name, tool_name_he, tool_type, location,
              assigned_to_machine_name, last_maintenance, next_maintenance,
              current_condition, total_usage_hours, max_usage_hours, status
       FROM tool_management
       WHERE next_maintenance <= (CURRENT_DATE + INTERVAL '7 days')
         AND status = 'active'
       ORDER BY next_maintenance ASC`
    );

    // כלים שדורשים כיול
    const calibrationDue = await pool.query(
      `SELECT id, tool_number, tool_name, tool_name_he, tool_type, location,
              calibration_date, calibration_due, status
       FROM tool_management
       WHERE calibration_due <= (CURRENT_DATE + INTERVAL '7 days')
         AND status = 'active'
       ORDER BY calibration_due ASC`
    );

    // כלים במצב בלוי או שבור
    const wornOrBroken = await pool.query(
      `SELECT id, tool_number, tool_name, tool_name_he, tool_type, location,
              current_condition, total_usage_hours, max_usage_hours, status
       FROM tool_management
       WHERE current_condition IN ('worn', 'broken')
         AND status = 'active'
       ORDER BY current_condition, tool_name`
    );

    // כלים שעברו את מכסת השעות המקסימלית
    const overused = await pool.query(
      `SELECT id, tool_number, tool_name, tool_name_he, tool_type, location,
              total_usage_hours, max_usage_hours,
              ROUND(total_usage_hours / NULLIF(max_usage_hours, 0) * 100, 1) AS usage_pct
       FROM tool_management
       WHERE max_usage_hours > 0
         AND total_usage_hours >= max_usage_hours * 0.9
         AND status = 'active'
       ORDER BY usage_pct DESC`
    );

    // כלים אבודים
    const lost = await pool.query(
      `SELECT id, tool_number, tool_name, tool_name_he, tool_type, location, purchase_cost
       FROM tool_management
       WHERE status = 'lost'
       ORDER BY purchase_cost DESC`
    );

    res.json({
      success: true,
      alerts: {
        maintenance_due: {
          count: maintenanceDue.rows.length,
          items: maintenanceDue.rows,
          label: 'כלים הדורשים תחזוקה'
        },
        calibration_due: {
          count: calibrationDue.rows.length,
          items: calibrationDue.rows,
          label: 'כלים הדורשים כיול'
        },
        worn_or_broken: {
          count: wornOrBroken.rows.length,
          items: wornOrBroken.rows,
          label: 'כלים בלויים או שבורים'
        },
        overused: {
          count: overused.rows.length,
          items: overused.rows,
          label: 'כלים שעברו מכסת שעות'
        },
        lost: {
          count: lost.rows.length,
          items: lost.rows,
          label: 'כלים אבודים'
        }
      },
      total_alerts:
        maintenanceDue.rows.length +
        calibrationDue.rows.length +
        wornOrBroken.rows.length +
        overused.rows.length +
        lost.rows.length,
      checked_at: today
    });
  } catch (error: any) {
    console.error('שגיאה בשליפת התראות כלים:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
