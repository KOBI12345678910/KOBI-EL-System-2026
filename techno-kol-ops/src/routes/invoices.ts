import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';
import { eventBus } from '../realtime/eventBus';

// Invoices CRUD route. Lazily ensures the `invoices` table exists since the
// base schema does not yet define it for techno-kol-ops.

const router = Router();
router.use(authenticate);

let tableEnsured = false;
async function ensureTable(): Promise<void> {
  if (tableEnsured) return;
  await query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      invoice_number VARCHAR(50) UNIQUE,
      client_id UUID REFERENCES clients(id),
      project_id UUID,
      order_id VARCHAR(20),
      issue_date DATE DEFAULT CURRENT_DATE,
      due_date DATE,
      subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      currency VARCHAR(8) DEFAULT 'ILS',
      status VARCHAR(20) DEFAULT 'draft',
      notes TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  tableEnsured = true;
}

const INVOICE_ALLOWED_COLUMNS = new Set([
  'invoice_number', 'client_id', 'project_id', 'order_id',
  'issue_date', 'due_date', 'subtotal', 'tax_amount',
  'total_amount', 'paid_amount', 'currency', 'status', 'notes',
]);

// LIST
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const status = req.query.status as string | undefined;
    const client_id = req.query.client_id as string | undefined;

    let sql = `SELECT * FROM invoices WHERE COALESCE(status,'') <> 'deleted'`;
    const params: any[] = [];
    let i = 1;
    if (status)    { sql += ` AND status = $${i++}`;    params.push(status); }
    if (client_id) { sql += ` AND client_id = $${i++}`; params.push(client_id); }
    sql += ` ORDER BY issue_date DESC, created_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch invoices', detail: err?.message });
  }
});

// GET BY ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const { rows } = await query(`SELECT * FROM invoices WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'invoice not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch invoice', detail: err?.message });
  }
});

// CREATE
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const {
      invoice_number, client_id, project_id, order_id, issue_date, due_date,
      subtotal, tax_amount, total_amount, currency, notes,
    } = req.body || {};
    if (!client_id && !project_id && !order_id) {
      return res.status(400).json({ error: 'one of client_id, project_id, order_id is required' });
    }
    const { rows } = await query(
      `INSERT INTO invoices
         (invoice_number, client_id, project_id, order_id, issue_date, due_date,
          subtotal, tax_amount, total_amount, currency, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [invoice_number, client_id, project_id, order_id,
       issue_date || new Date(), due_date,
       subtotal || 0, tax_amount || 0, total_amount || 0,
       currency || 'ILS', notes, req.user?.id || null]
    );
    broadcastToAll('INVOICE_CREATED', rows[0]);
    eventBus.emit('invoice:created', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create invoice', detail: err?.message });
  }
});

// UPDATE
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const fields = req.body || {};
    const safePairs = Object.entries(fields).filter(([k]) => INVOICE_ALLOWED_COLUMNS.has(k));
    if (safePairs.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    const keys = safePairs.map(([k]) => k);
    const values = safePairs.map(([, v]) => v);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE invoices SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'invoice not found' });
    broadcastToAll('INVOICE_UPDATED', rows[0]);
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update invoice', detail: err?.message });
  }
});

// SOFT DELETE
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await ensureTable();
    const { rows } = await query(
      `UPDATE invoices SET status = 'deleted', updated_at = NOW()
       WHERE id = $1 AND COALESCE(status,'') <> 'deleted' RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      const existing = await query(`SELECT id, status FROM invoices WHERE id = $1`, [req.params.id]);
      if (existing.rows.length === 0) return res.status(404).json({ error: 'invoice not found' });
      return res.json({ ok: true, data: existing.rows[0], note: 'already deleted' });
    }
    broadcastToAll('INVOICE_DELETED', rows[0]);
    eventBus.emit('invoice:deleted', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.json({ ok: true, soft_deleted: true, data: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete invoice', detail: err?.message });
  }
});

export default router;
