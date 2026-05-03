import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';
import { eventBus } from '../realtime/eventBus';

// Quotes CRUD route. The base techno-kol-ops schema does not yet include a
// `quotes` table — we lazily ensure one exists on first request so this
// endpoint works in fresh dev environments. Pattern matches the existing
// "if relation missing → 503" convention used elsewhere.

const router = Router();
router.use(authenticate);

let tableEnsured = false;
async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      quote_number VARCHAR(50) UNIQUE,
      client_id UUID REFERENCES clients(id),
      project_id UUID,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      currency VARCHAR(8) DEFAULT 'ILS',
      status VARCHAR(20) DEFAULT 'draft',
      valid_until DATE,
      notes TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  tableEnsured = true;
}

const QUOTE_ALLOWED_COLUMNS = new Set([
  'quote_number', 'client_id', 'project_id', 'title', 'description',
  'total_amount', 'currency', 'status', 'valid_until', 'notes',
]);

// LIST
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const status = req.query.status as string | undefined;
    const client_id = req.query.client_id as string | undefined;

    let sql = `SELECT * FROM quotes WHERE COALESCE(status,'') <> 'deleted'`;
    const params: any[] = [];
    let i = 1;
    if (status)    { sql += ` AND status = $${i++}`;    params.push(status); }
    if (client_id) { sql += ` AND client_id = $${i++}`; params.push(client_id); }
    sql += ` ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch quotes', detail: err?.message });
  }
});

// GET BY ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const { rows } = await query(`SELECT * FROM quotes WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'quote not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch quote', detail: err?.message });
  }
});

// CREATE
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const {
      quote_number, client_id, project_id, title, description,
      total_amount, currency, valid_until, notes,
    } = req.body || {};
    if (!title) return res.status(400).json({ error: 'title is required' });
    const { rows } = await query(
      `INSERT INTO quotes
         (quote_number, client_id, project_id, title, description,
          total_amount, currency, valid_until, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [quote_number, client_id, project_id, title, description,
       total_amount || 0, currency || 'ILS', valid_until, notes,
       req.user?.id || null]
    );
    broadcastToAll('QUOTE_CREATED', rows[0]);
    eventBus.emit('quote:created', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create quote', detail: err?.message });
  }
});

// UPDATE
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const fields = req.body || {};
    const safePairs = Object.entries(fields).filter(([k]) => QUOTE_ALLOWED_COLUMNS.has(k));
    if (safePairs.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    const keys = safePairs.map(([k]) => k);
    const values = safePairs.map(([, v]) => v);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE quotes SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'quote not found' });
    broadcastToAll('QUOTE_UPDATED', rows[0]);
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update quote', detail: err?.message });
  }
});

// SOFT DELETE
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const { rows } = await query(
      `UPDATE quotes SET status = 'deleted', updated_at = NOW()
       WHERE id = $1 AND COALESCE(status,'') <> 'deleted' RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      const existing = await query(`SELECT id, status FROM quotes WHERE id = $1`, [req.params.id]);
      if (existing.rows.length === 0) return res.status(404).json({ error: 'quote not found' });
      return res.json({ ok: true, data: existing.rows[0], note: 'already deleted' });
    }
    broadcastToAll('QUOTE_DELETED', rows[0]);
    eventBus.emit('quote:deleted', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.json({ ok: true, soft_deleted: true, data: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete quote', detail: err?.message });
  }
});

export default router;
