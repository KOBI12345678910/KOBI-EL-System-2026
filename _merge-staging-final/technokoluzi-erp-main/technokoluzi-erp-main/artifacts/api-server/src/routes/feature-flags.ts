// ============================================================
// Feature Flags - ניהול דגלי פיצ'רים
// הפעלה/כיבוי פיצ'רים לפי סביבה, תפקיד וענף
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// אתחול טבלאות
// ============================================================
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feature_flags (
      id SERIAL PRIMARY KEY,
      flag_key VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      enabled BOOLEAN DEFAULT false,
      environment VARCHAR(50) DEFAULT 'all',
      role_scope JSONB DEFAULT '[]',
      branch_scope JSONB DEFAULT '[]',
      owner VARCHAR(255),
      expiry_date TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

ensureTables().catch(err => console.error('Feature flags table init error:', err));

// ============================================================
// GET /feature-flags - רשימת כל הדגלים
// ============================================================
router.get('/feature-flags', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT * FROM feature_flags ORDER BY created_at DESC
    `);
    res.json({ data: result.rows });
  } catch (err: any) {
    console.error('Error fetching feature flags:', err);
    res.status(500).json({ error: 'שגיאה בטעינת דגלי פיצ׳רים' });
  }
});

// ============================================================
// POST /feature-flags - יצירת דגל חדש
// ============================================================
router.post('/feature-flags', async (req: Request, res: Response) => {
  try {
    const { flag_key, name, description, enabled, environment, role_scope, branch_scope, owner, expiry_date } = req.body;
    if (!flag_key || !name) {
      res.status(400).json({ error: 'שם ומפתח הדגל נדרשים' });
      return;
    }
    const result = await pool.query(`
      INSERT INTO feature_flags (flag_key, name, description, enabled, environment, role_scope, branch_scope, owner, expiry_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [flag_key, name, description || null, enabled || false, environment || 'all',
        JSON.stringify(role_scope || []), JSON.stringify(branch_scope || []),
        owner || null, expiry_date || null]);
    res.json({ data: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'מפתח דגל כבר קיים' });
      return;
    }
    console.error('Error creating feature flag:', err);
    res.status(500).json({ error: 'שגיאה ביצירת דגל' });
  }
});

// ============================================================
// PUT /feature-flags/:id - עדכון דגל
// ============================================================
router.put('/feature-flags/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { flag_key, name, description, enabled, environment, role_scope, branch_scope, owner, expiry_date } = req.body;
    const result = await pool.query(`
      UPDATE feature_flags
      SET flag_key = COALESCE($1, flag_key),
          name = COALESCE($2, name),
          description = COALESCE($3, description),
          enabled = COALESCE($4, enabled),
          environment = COALESCE($5, environment),
          role_scope = COALESCE($6, role_scope),
          branch_scope = COALESCE($7, branch_scope),
          owner = COALESCE($8, owner),
          expiry_date = $9,
          updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [flag_key, name, description, enabled, environment,
        role_scope ? JSON.stringify(role_scope) : null,
        branch_scope ? JSON.stringify(branch_scope) : null,
        owner, expiry_date || null, id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'דגל לא נמצא' });
      return;
    }
    res.json({ data: result.rows[0] });
  } catch (err: any) {
    console.error('Error updating feature flag:', err);
    res.status(500).json({ error: 'שגיאה בעדכון דגל' });
  }
});

// ============================================================
// DELETE /feature-flags/:id - מחיקת דגל
// ============================================================
router.delete('/feature-flags/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM feature_flags WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'דגל לא נמצא' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting feature flag:', err);
    res.status(500).json({ error: 'שגיאה במחיקת דגל' });
  }
});

// ============================================================
// GET /feature-flags/check/:key - בדיקת מצב דגל
// ============================================================
router.get('/feature-flags/check/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const result = await pool.query(`
      SELECT enabled, environment, role_scope, branch_scope, expiry_date
      FROM feature_flags WHERE flag_key = $1
    `, [key]);
    if (result.rows.length === 0) {
      res.json({ enabled: false, exists: false });
      return;
    }
    const flag = result.rows[0];
    let enabled = flag.enabled;
    if (enabled && flag.expiry_date && new Date(flag.expiry_date) < new Date()) {
      enabled = false;
      await pool.query('UPDATE feature_flags SET enabled = false WHERE flag_key = $1', [key]);
    }
    res.json({ enabled, exists: true });
  } catch (err: any) {
    console.error('Error checking feature flag:', err);
    res.status(500).json({ error: 'שגיאה בבדיקת דגל' });
  }
});

// ============================================================
// GET /feature-flags/dashboard - דשבורד סיכום
// ============================================================
router.get('/feature-flags/dashboard', async (_req: Request, res: Response) => {
  try {
    const total = await pool.query('SELECT COUNT(*) as count FROM feature_flags');
    const enabled = await pool.query('SELECT COUNT(*) as count FROM feature_flags WHERE enabled = true');
    const disabled = await pool.query('SELECT COUNT(*) as count FROM feature_flags WHERE enabled = false');
    const expired = await pool.query(`SELECT COUNT(*) as count FROM feature_flags WHERE expiry_date IS NOT NULL AND expiry_date < NOW()`);
    const byEnv = await pool.query(`
      SELECT environment, COUNT(*) as count, SUM(CASE WHEN enabled THEN 1 ELSE 0 END) as enabled_count
      FROM feature_flags GROUP BY environment ORDER BY count DESC
    `);
    const recent = await pool.query(`
      SELECT id, flag_key, name, enabled, environment, updated_at
      FROM feature_flags ORDER BY updated_at DESC LIMIT 10
    `);
    res.json({
      total: parseInt(total.rows[0].count),
      enabled: parseInt(enabled.rows[0].count),
      disabled: parseInt(disabled.rows[0].count),
      expired: parseInt(expired.rows[0].count),
      by_environment: byEnv.rows,
      recent_changes: recent.rows
    });
  } catch (err: any) {
    console.error('Error fetching dashboard:', err);
    res.status(500).json({ error: 'שגיאה בטעינת דשבורד' });
  }
});

export default router;
