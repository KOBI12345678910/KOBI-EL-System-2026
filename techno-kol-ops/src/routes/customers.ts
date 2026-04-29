import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';
import { eventBus } from '../realtime/eventBus';

// Customers route — alias over `clients` table (the system's customer table).
// Provides minimal CRUD (list / get / create / update / softDelete) for the
// /api/customers namespace expected by the wiring spec / 360 pages.

const router = Router();
router.use(authenticate);

const CUSTOMER_ALLOWED_COLUMNS = new Set([
  'name', 'type', 'contact_name', 'phone', 'email', 'address',
  'credit_limit', 'notes', 'is_active', 'tax_id', 'payment_terms',
]);

function isMissingTable(err: any): boolean {
  const code = err?.code || '';
  const msg = String(err?.message || err);
  return code === '42P01' || /relation .* does not exist|table .* not found/i.test(msg);
}

// LIST
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const { rows } = await query(
      `SELECT * FROM clients WHERE COALESCE(is_active, true) = true
       ORDER BY name LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json(rows);
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'customers service unavailable' });
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// GET BY ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`SELECT * FROM clients WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'customer not found' });
    res.json(rows[0]);
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'customers service unavailable' });
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// CREATE
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, contact_name, phone, email, address, credit_limit, notes } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const { rows } = await query(
      `INSERT INTO clients (name, type, contact_name, phone, email, address, credit_limit, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, type || 'standard', contact_name, phone, email, address, credit_limit, notes]
    );
    broadcastToAll('CUSTOMER_CREATED', rows[0]);
    eventBus.emit('customer:created', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'customers service unavailable' });
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// UPDATE
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const fields = req.body || {};
    const safePairs = Object.entries(fields).filter(([k]) => CUSTOMER_ALLOWED_COLUMNS.has(k));
    if (safePairs.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    const keys = safePairs.map(([k]) => k);
    const values = safePairs.map(([, v]) => v);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE clients SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'customer not found' });
    broadcastToAll('CUSTOMER_UPDATED', rows[0]);
    res.json(rows[0]);
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'customers service unavailable' });
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// SOFT DELETE — flip is_active=false (preserve audit trail; never hard-delete)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(
      `UPDATE clients SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND COALESCE(is_active, true) = true RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      const existing = await query(`SELECT id, is_active FROM clients WHERE id = $1`, [req.params.id]);
      if (existing.rows.length === 0) return res.status(404).json({ error: 'customer not found' });
      return res.json({ ok: true, data: existing.rows[0], note: 'already inactive' });
    }
    broadcastToAll('CUSTOMER_DELETED', rows[0]);
    eventBus.emit('customer:deleted', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.json({ ok: true, soft_deleted: true, data: rows[0] });
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'customers service unavailable' });
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

export default router;
