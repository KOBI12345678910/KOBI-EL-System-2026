import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';
import { eventBus } from '../realtime/eventBus';

const router = Router();
router.use(authenticate);

// P0-1 fix: Add LIMIT/OFFSET pagination
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

    const { rows } = await query(`
      SELECT l.*, e.name as assigned_name
      FROM leads l
      LEFT JOIN employees e ON l.assigned_to = e.id
      ORDER BY l.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, address, lat, lng, product_interest, estimated_value, source, assigned_to, notes } = req.body;

    const { rows } = await query(`
      INSERT INTO leads (name, phone, address, lat, lng, product_interest, estimated_value, source, assigned_to, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [name, phone, address, lat, lng, product_interest, estimated_value, source, assigned_to, notes]);

    broadcastToAll('LEAD_CREATED', rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// BUG-SEC-004: Column allowlist to prevent SQL injection via key interpolation
const LEAD_ALLOWED_COLUMNS = new Set([
  'name', 'phone', 'address', 'lat', 'lng', 'product_interest',
  'estimated_value', 'source', 'assigned_to', 'notes', 'status',
  'priority', 'next_follow_up', 'email', 'company',
]);

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const fields = req.body;
    const safePairs = Object.entries(fields).filter(([k]) => LEAD_ALLOWED_COLUMNS.has(k));
    if (safePairs.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    const keys = safePairs.map(([k]) => k);
    const values = safePairs.map(([, v]) => v);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');

    const { rows } = await query(
      `UPDATE leads SET ${setClause} WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    broadcastToAll('LEAD_UPDATED', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// CRUD-GAP-FIX: soft delete (status='deleted'). Status flip only — never hard-delete.
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'מזהה ליד לא תקין' });
    }
    const { rows } = await query(
      `UPDATE leads SET status = 'deleted' WHERE id = $1 AND COALESCE(status, '') <> 'deleted' RETURNING *`,
      [id]
    );
    if (rows.length === 0) {
      const existing = await query(`SELECT id, status FROM leads WHERE id = $1`, [id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ ok: false, error: 'ליד לא נמצא' });
      }
      return res.json({ ok: true, data: existing.rows[0], note: 'כבר מסומן כמחוק' });
    }
    broadcastToAll('LEAD_DELETED', rows[0]);
    eventBus.emit('lead.deleted', { id: rows[0].id, actor: req.user?.id });
    res.json({ ok: true, data: rows[0] });
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (/relation .* does not exist|table .* not found/i.test(msg)) {
      return res.status(503).json({ ok: false, error: 'שירות הלידים אינו זמין כרגע' });
    }
    console.error('[leads DELETE] error:', msg);
    res.status(500).json({ ok: false, error: 'מחיקת הליד נכשלה' });
  }
});

export default router;
