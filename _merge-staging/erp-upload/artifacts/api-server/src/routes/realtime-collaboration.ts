// ============================================================
// Real-Time Collaboration Engine - שיתוף פעולה בזמן אמת
// מפגשים, נעילות, הערות, נוכחות
// ============================================================

import { Router, Request, Response } from 'express';
import pool from '@workspace/db';

const router = Router();

// ============================================================
// אתחול טבלאות
// ============================================================
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collaboration_sessions (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(255) NOT NULL,
      entity_id VARCHAR(255) NOT NULL,
      user_id VARCHAR(255) NOT NULL,
      user_name VARCHAR(255),
      user_avatar VARCHAR(500),
      session_start TIMESTAMPTZ DEFAULT NOW(),
      last_activity TIMESTAMPTZ DEFAULT NOW(),
      status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active','idle','disconnected')),
      metadata JSONB DEFAULT '{}'
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collaboration_cursors (
      id SERIAL PRIMARY KEY,
      session_id INTEGER REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
      field_name VARCHAR(255),
      position_x REAL,
      position_y REAL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS collaboration_comments (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(255) NOT NULL,
      entity_id VARCHAR(255) NOT NULL,
      field_name VARCHAR(255),
      user_id VARCHAR(255) NOT NULL,
      user_name VARCHAR(255),
      comment TEXT NOT NULL,
      parent_id INTEGER REFERENCES collaboration_comments(id) ON DELETE SET NULL,
      resolved BOOLEAN DEFAULT FALSE,
      resolved_by VARCHAR(255),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS entity_locks (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(255) NOT NULL,
      entity_id VARCHAR(255) NOT NULL,
      locked_by VARCHAR(255) NOT NULL,
      locked_by_name VARCHAR(255),
      locked_at TIMESTAMPTZ DEFAULT NOW(),
      lock_type VARCHAR(50) DEFAULT 'edit' CHECK (lock_type IN ('edit','approval','processing')),
      expires_at TIMESTAMPTZ,
      reason VARCHAR(500)
    )
  `);
}

ensureTables().catch(err => console.error('[Collaboration] Table init error:', err));

// ============================================================
// הצטרפות למפגש
// ============================================================
router.post('/collaboration/join/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const { entityType, entityId } = req.params;
    const { user_id, user_name, user_avatar } = req.body;

    // סגירת מפגשים ישנים של אותו משתמש על אותו entity
    await pool.query(
      `UPDATE collaboration_sessions SET status = 'disconnected'
       WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3 AND status != 'disconnected'`,
      [user_id, entityType, entityId]
    );

    const { rows } = await pool.query(
      `INSERT INTO collaboration_sessions (entity_type, entity_id, user_id, user_name, user_avatar)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [entityType, entityId, user_id, user_name, user_avatar]
    );

    // שליפת כל המשתתפים הפעילים
    const { rows: activeUsers } = await pool.query(
      `SELECT * FROM collaboration_sessions
       WHERE entity_type = $1 AND entity_id = $2 AND status IN ('active','idle')
       ORDER BY session_start`,
      [entityType, entityId]
    );

    res.json({ session: rows[0], active_users: activeUsers });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// יציאה ממפגש
// ============================================================
router.post('/collaboration/leave', async (req: Request, res: Response) => {
  try {
    const { session_id, user_id, entity_type, entity_id } = req.body;
    if (session_id) {
      await pool.query('UPDATE collaboration_sessions SET status = $1 WHERE id = $2', ['disconnected', session_id]);
    } else if (user_id && entity_type && entity_id) {
      await pool.query(
        `UPDATE collaboration_sessions SET status = 'disconnected'
         WHERE user_id = $1 AND entity_type = $2 AND entity_id = $3 AND status != 'disconnected'`,
        [user_id, entity_type, entity_id]
      );
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// עדכון פעילות (heartbeat)
// ============================================================
router.post('/collaboration/heartbeat', async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;
    await pool.query(
      'UPDATE collaboration_sessions SET last_activity = NOW(), status = $1 WHERE id = $2',
      ['active', session_id]
    );
    // סימון idle אחרי 5 דקות ללא פעילות
    await pool.query(
      `UPDATE collaboration_sessions SET status = 'idle'
       WHERE last_activity < NOW() - INTERVAL '5 minutes' AND status = 'active'`
    );
    // ניתוק אחרי 30 דקות
    await pool.query(
      `UPDATE collaboration_sessions SET status = 'disconnected'
       WHERE last_activity < NOW() - INTERVAL '30 minutes' AND status IN ('active','idle')`
    );
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// משתמשים פעילים
// ============================================================
router.get('/collaboration/active-users/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    // ניקוי מפגשים ישנים
    await pool.query(
      `UPDATE collaboration_sessions SET status = 'disconnected'
       WHERE last_activity < NOW() - INTERVAL '30 minutes' AND status IN ('active','idle')`
    );
    const { rows } = await pool.query(
      `SELECT * FROM collaboration_sessions
       WHERE entity_type = $1 AND entity_id = $2 AND status IN ('active','idle')
       ORDER BY session_start`,
      [req.params.entityType, req.params.entityId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// נעילת ישות
// ============================================================
router.post('/collaboration/lock', async (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, locked_by, locked_by_name, lock_type, reason, expires_minutes } = req.body;

    // בדיקה אם כבר נעול
    const { rows: existing } = await pool.query(
      `SELECT * FROM entity_locks
       WHERE entity_type = $1 AND entity_id = $2 AND (expires_at IS NULL OR expires_at > NOW())`,
      [entity_type, entity_id]
    );
    if (existing.length > 0 && existing[0].locked_by !== locked_by) {
      return res.status(409).json({
        error: 'Entity is locked',
        locked_by: existing[0].locked_by,
        locked_by_name: existing[0].locked_by_name,
        lock_type: existing[0].lock_type,
        expires_at: existing[0].expires_at,
      });
    }

    // מחיקת נעילה קיימת של אותו משתמש
    await pool.query(
      'DELETE FROM entity_locks WHERE entity_type = $1 AND entity_id = $2 AND locked_by = $3',
      [entity_type, entity_id, locked_by]
    );

    const expiresAt = expires_minutes
      ? new Date(Date.now() + parseInt(expires_minutes) * 60000).toISOString()
      : null;

    const { rows } = await pool.query(
      `INSERT INTO entity_locks (entity_type, entity_id, locked_by, locked_by_name, lock_type, reason, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [entity_type, entity_id, locked_by, locked_by_name, lock_type || 'edit', reason, expiresAt]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/collaboration/lock/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM entity_locks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get('/collaboration/locks', async (req: Request, res: Response) => {
  try {
    // ניקוי נעילות שפגו
    await pool.query('DELETE FROM entity_locks WHERE expires_at IS NOT NULL AND expires_at < NOW()');
    const entityType = req.query.entity_type;
    let query = 'SELECT * FROM entity_locks WHERE 1=1';
    const params: any[] = [];
    if (entityType) { params.push(entityType); query += ` AND entity_type = $${params.length}`; }
    query += ' ORDER BY locked_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CRUD הערות
// ============================================================
router.get('/collaboration/comments/:entityType/:entityId', async (req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM collaboration_comments
       WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC`,
      [req.params.entityType, req.params.entityId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/collaboration/comments', async (req: Request, res: Response) => {
  try {
    const { entity_type, entity_id, field_name, user_id, user_name, comment, parent_id } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO collaboration_comments (entity_type, entity_id, field_name, user_id, user_name, comment, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [entity_type, entity_id, field_name, user_id, user_name, comment, parent_id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put('/collaboration/comments/:id', async (req: Request, res: Response) => {
  try {
    const { comment } = req.body;
    const { rows } = await pool.query(
      'UPDATE collaboration_comments SET comment = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [comment, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete('/collaboration/comments/:id', async (req: Request, res: Response) => {
  try {
    await pool.query('DELETE FROM collaboration_comments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post('/collaboration/comments/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { resolved_by } = req.body;
    const { rows } = await pool.query(
      `UPDATE collaboration_comments SET resolved = TRUE, resolved_by = $1, resolved_at = NOW()
       WHERE id = $2 RETURNING *`,
      [resolved_by, req.params.id]
    );
    res.json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// דשבורד שיתוף
// ============================================================
router.get('/collaboration/dashboard', async (_req: Request, res: Response) => {
  try {
    // ניקוי
    await pool.query(
      `UPDATE collaboration_sessions SET status = 'disconnected'
       WHERE last_activity < NOW() - INTERVAL '30 minutes' AND status IN ('active','idle')`
    );
    await pool.query('DELETE FROM entity_locks WHERE expires_at IS NOT NULL AND expires_at < NOW()');

    const sessionsQ = pool.query(`
      SELECT COUNT(*) as total_active, COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT entity_type || '::' || entity_id) as entities_in_use
      FROM collaboration_sessions WHERE status IN ('active','idle')
    `);
    const locksQ = pool.query('SELECT COUNT(*) as total_locks FROM entity_locks');
    const commentsQ = pool.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER(WHERE resolved = FALSE) as unresolved,
        COUNT(*) FILTER(WHERE created_at >= NOW() - INTERVAL '24 hours') as today
      FROM collaboration_comments
    `);
    const activeSessionsQ = pool.query(`
      SELECT entity_type, entity_id, COUNT(*) as user_count,
        json_agg(json_build_object('user_name', user_name, 'status', status)) as users
      FROM collaboration_sessions WHERE status IN ('active','idle')
      GROUP BY entity_type, entity_id ORDER BY user_count DESC LIMIT 20
    `);
    const recentCommentsQ = pool.query(`
      SELECT * FROM collaboration_comments ORDER BY created_at DESC LIMIT 15
    `);

    const [sessions, locks, comments, activeSessions, recentComments] = await Promise.all([
      sessionsQ, locksQ, commentsQ, activeSessionsQ, recentCommentsQ
    ]);
    res.json({
      sessions: sessions.rows[0],
      locks: locks.rows[0],
      comments: comments.rows[0],
      active_entities: activeSessions.rows,
      recent_comments: recentComments.rows,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
