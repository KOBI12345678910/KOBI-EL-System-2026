// ============================================================
// KPI / Metric Dictionary - מילון מדדים ו-KPI
// הגדרה, אישור, snapshot ומעקב אחר מדדים עסקיים
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// אתחול טבלאות
// ============================================================
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metric_definitions (
      id SERIAL PRIMARY KEY,
      metric_key VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      category VARCHAR(255),
      description TEXT,
      formula TEXT,
      source_tables TEXT,
      refresh_frequency VARCHAR(100),
      owner VARCHAR(255),
      status VARCHAR(50) DEFAULT 'draft',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS metric_snapshots (
      id SERIAL PRIMARY KEY,
      metric_id INTEGER REFERENCES metric_definitions(id) ON DELETE CASCADE,
      value NUMERIC,
      snapshot_date DATE DEFAULT CURRENT_DATE,
      context JSONB DEFAULT '{}'
    )
  `);
}

ensureTables().catch(err => console.error('Metric dictionary table init error:', err));

// ============================================================
// GET /metrics - רשימת כל המדדים
// ============================================================
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const category = req.query.category as string;
    let query = 'SELECT * FROM metric_definitions WHERE 1=1';
    const params: any[] = [];
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    if (category) { params.push(category); query += ` AND category = $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (err: any) {
    console.error('Error fetching metrics:', err);
    res.status(500).json({ error: 'שגיאה בטעינת מדדים' });
  }
});

// ============================================================
// POST /metrics - יצירת מדד חדש
// ============================================================
router.post('/metrics', async (req: Request, res: Response) => {
  try {
    const { metric_key, name, category, description, formula, source_tables, refresh_frequency, owner } = req.body;
    if (!metric_key || !name) {
      res.status(400).json({ error: 'מפתח ושם המדד נדרשים' });
      return;
    }
    const result = await pool.query(`
      INSERT INTO metric_definitions (metric_key, name, category, description, formula, source_tables, refresh_frequency, owner)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [metric_key, name, category || null, description || null, formula || null,
        source_tables || null, refresh_frequency || null, owner || null]);
    res.json({ data: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'מפתח מדד כבר קיים' });
      return;
    }
    console.error('Error creating metric:', err);
    res.status(500).json({ error: 'שגיאה ביצירת מדד' });
  }
});

// ============================================================
// GET /metrics/:id - קריאת מדד בודד
// ============================================================
router.get('/metrics/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM metric_definitions WHERE id = $1', [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'מדד לא נמצא' }); return; }
    res.json({ data: result.rows[0] });
  } catch (err: any) {
    console.error('Error fetching metric:', err);
    res.status(500).json({ error: 'שגיאה בטעינת מדד' });
  }
});

// ============================================================
// PUT /metrics/:id - עדכון מדד
// ============================================================
router.put('/metrics/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { metric_key, name, category, description, formula, source_tables, refresh_frequency, owner } = req.body;
    const result = await pool.query(`
      UPDATE metric_definitions
      SET metric_key = COALESCE($1, metric_key),
          name = COALESCE($2, name),
          category = COALESCE($3, category),
          description = COALESCE($4, description),
          formula = COALESCE($5, formula),
          source_tables = COALESCE($6, source_tables),
          refresh_frequency = COALESCE($7, refresh_frequency),
          owner = COALESCE($8, owner)
      WHERE id = $9 RETURNING *
    `, [metric_key, name, category, description, formula, source_tables, refresh_frequency, owner, id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'מדד לא נמצא' }); return; }
    res.json({ data: result.rows[0] });
  } catch (err: any) {
    console.error('Error updating metric:', err);
    res.status(500).json({ error: 'שגיאה בעדכון מדד' });
  }
});

// ============================================================
// DELETE /metrics/:id - מחיקת מדד
// ============================================================
router.delete('/metrics/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM metric_definitions WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'מדד לא נמצא' }); return; }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting metric:', err);
    res.status(500).json({ error: 'שגיאה במחיקת מדד' });
  }
});

// ============================================================
// POST /metrics/:id/approve - אישור מדד
// ============================================================
router.post('/metrics/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      UPDATE metric_definitions SET status = 'approved' WHERE id = $1 RETURNING *
    `, [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'מדד לא נמצא' }); return; }
    res.json({ data: result.rows[0] });
  } catch (err: any) {
    console.error('Error approving metric:', err);
    res.status(500).json({ error: 'שגיאה באישור מדד' });
  }
});

// ============================================================
// POST /metrics/:id/deprecate - ביטול מדד
// ============================================================
router.post('/metrics/:id/deprecate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query(`
      UPDATE metric_definitions SET status = 'deprecated' WHERE id = $1 RETURNING *
    `, [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'מדד לא נמצא' }); return; }
    res.json({ data: result.rows[0] });
  } catch (err: any) {
    console.error('Error deprecating metric:', err);
    res.status(500).json({ error: 'שגיאה בביטול מדד' });
  }
});

// ============================================================
// POST /metrics/:id/snapshot - יצירת snapshot
// ============================================================
router.post('/metrics/:id/snapshot', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { value, snapshot_date, context } = req.body;
    if (value === undefined || value === null) {
      res.status(400).json({ error: 'ערך נדרש' });
      return;
    }
    const metric = await pool.query('SELECT * FROM metric_definitions WHERE id = $1', [id]);
    if (metric.rows.length === 0) { res.status(404).json({ error: 'מדד לא נמצא' }); return; }

    const result = await pool.query(`
      INSERT INTO metric_snapshots (metric_id, value, snapshot_date, context)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [id, value, snapshot_date || new Date().toISOString().split('T')[0], JSON.stringify(context || {})]);
    res.json({ data: result.rows[0] });
  } catch (err: any) {
    console.error('Error creating snapshot:', err);
    res.status(500).json({ error: 'שגיאה ביצירת snapshot' });
  }
});

// ============================================================
// GET /metrics/snapshots/:metricId - היסטוריית snapshots
// ============================================================
router.get('/metrics/snapshots/:metricId', async (req: Request, res: Response) => {
  try {
    const { metricId } = req.params;
    const result = await pool.query(`
      SELECT * FROM metric_snapshots
      WHERE metric_id = $1
      ORDER BY snapshot_date DESC
    `, [metricId]);
    res.json({ data: result.rows });
  } catch (err: any) {
    console.error('Error fetching snapshots:', err);
    res.status(500).json({ error: 'שגיאה בטעינת snapshots' });
  }
});

// ============================================================
// GET /metrics/dashboard - דשבורד מדדים
// ============================================================
router.get('/metrics/dashboard', async (_req: Request, res: Response) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count FROM metric_definitions');
    const approved = await pool.query(`SELECT COUNT(*) as count FROM metric_definitions WHERE status = 'approved'`);
    const draft = await pool.query(`SELECT COUNT(*) as count FROM metric_definitions WHERE status = 'draft'`);
    const deprecated = await pool.query(`SELECT COUNT(*) as count FROM metric_definitions WHERE status = 'deprecated'`);
    const byCategory = await pool.query(`
      SELECT category, COUNT(*) as count FROM metric_definitions
      WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC
    `);
    const totalSnapshots = await pool.query('SELECT COUNT(*) as count FROM metric_snapshots');
    const latestSnapshots = await pool.query(`
      SELECT DISTINCT ON (ms.metric_id) ms.*, md.name as metric_name, md.metric_key
      FROM metric_snapshots ms
      JOIN metric_definitions md ON md.id = ms.metric_id
      ORDER BY ms.metric_id, ms.snapshot_date DESC
      LIMIT 20
    `);

    res.json({
      total: parseInt(total.rows[0].count),
      approved: parseInt(approved.rows[0].count),
      draft: parseInt(draft.rows[0].count),
      deprecated: parseInt(deprecated.rows[0].count),
      by_category: byCategory.rows,
      total_snapshots: parseInt(totalSnapshots.rows[0].count),
      latest_snapshots: latestSnapshots.rows
    });
  } catch (err: any) {
    console.error('Error fetching dashboard:', err);
    res.status(500).json({ error: 'שגיאה בטעינת דשבורד' });
  }
});

export default router;
