import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';
import { eventBus } from '../realtime/eventBus';

// Payments CRUD route. Lazily ensures the `payments` table exists since the
// base schema does not yet define it for techno-kol-ops.

const router = Router();
router.use(authenticate);

let tableEnsured = false;
async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      payment_number VARCHAR(50) UNIQUE,
      invoice_id UUID,
      client_id UUID REFERENCES clients(id),
      project_id UUID,
      amount DECIMAL(12,2) NOT NULL,
      currency VARCHAR(8) DEFAULT 'ILS',
      payment_method VARCHAR(30) DEFAULT 'bank_transfer',
      reference VARCHAR(100),
      paid_at TIMESTAMPTZ DEFAULT NOW(),
      status VARCHAR(20) DEFAULT 'completed',
      notes TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  tableEnsured = true;
}

const PAYMENT_ALLOWED_COLUMNS = new Set([
  'payment_number', 'invoice_id', 'client_id', 'project_id',
  'amount', 'currency', 'payment_method', 'reference',
  'paid_at', 'status', 'notes',
]);

// LIST
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const status = req.query.status as string | undefined;
    const client_id = req.query.client_id as string | undefined;
    const invoice_id = req.query.invoice_id as string | undefined;

    let sql = `SELECT * FROM payments WHERE COALESCE(status,'') <> 'deleted'`;
    const params: any[] = [];
    let i = 1;
    if (status)     { sql += ` AND status = $${i++}`;     params.push(status); }
    if (client_id)  { sql += ` AND client_id = $${i++}`;  params.push(client_id); }
    if (invoice_id) { sql += ` AND invoice_id = $${i++}`; params.push(invoice_id); }
    sql += ` ORDER BY paid_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch payments', detail: err?.message });
  }
});

// GET BY ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const { rows } = await query(`SELECT * FROM payments WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'payment not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch payment', detail: err?.message });
  }
});

// CREATE
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const {
      payment_number, invoice_id, client_id, project_id,
      amount, currency, payment_method, reference, paid_at, notes,
    } = req.body || {};
    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: 'amount is required' });
    }
    const { rows } = await query(
      `INSERT INTO payments
         (payment_number, invoice_id, client_id, project_id,
          amount, currency, payment_method, reference, paid_at, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [payment_number, invoice_id, client_id, project_id,
       amount, currency || 'ILS', payment_method || 'bank_transfer',
       reference, paid_at || new Date(), notes, req.user?.id || null]
    );
    broadcastToAll('PAYMENT_CREATED', rows[0]);
    eventBus.emit('payment:created', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create payment', detail: err?.message });
  }
});

// UPDATE
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const fields = req.body || {};
    const safePairs = Object.entries(fields).filter(([k]) => PAYMENT_ALLOWED_COLUMNS.has(k));
    if (safePairs.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    const keys = safePairs.map(([k]) => k);
    const values = safePairs.map(([, v]) => v);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE payments SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'payment not found' });
    broadcastToAll('PAYMENT_UPDATED', rows[0]);
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update payment', detail: err?.message });
  }
});

// SOFT DELETE
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const { rows } = await query(
      `UPDATE payments SET status = 'deleted', updated_at = NOW()
       WHERE id = $1 AND COALESCE(status,'') <> 'deleted' RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      const existing = await query(`SELECT id, status FROM payments WHERE id = $1`, [req.params.id]);
      if (existing.rows.length === 0) return res.status(404).json({ error: 'payment not found' });
      return res.json({ ok: true, data: existing.rows[0], note: 'already deleted' });
    }
    broadcastToAll('PAYMENT_DELETED', rows[0]);
    eventBus.emit('payment:deleted', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.json({ ok: true, soft_deleted: true, data: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete payment', detail: err?.message });
  }
});

export default router;
