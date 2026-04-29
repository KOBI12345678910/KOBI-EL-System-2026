import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';
import { eventBus } from '../realtime/eventBus';

const router = Router();
router.use(authenticate);

const SUPPLIER_ALLOWED_COLUMNS = new Set([
  'name', 'category', 'contact_name', 'phone', 'email',
  'payment_terms', 'lead_days', 'is_active',
]);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT s.*,
        COUNT(mi.id) as material_count,
        COALESCE(SUM(mi.qty * mi.cost_per_unit), 0) as stock_value
      FROM suppliers s
      LEFT JOIN material_items mi ON s.id = mi.supplier_id AND mi.is_active = true
      WHERE s.is_active = true
      GROUP BY s.id
      ORDER BY s.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch suppliers' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, category, contact_name, phone, email, payment_terms, lead_days } = req.body;

    const { rows } = await query(`
      INSERT INTO suppliers (name, category, contact_name, phone, email, payment_terms, lead_days)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *
    `, [name, category, contact_name, phone, email, payment_terms, lead_days]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create supplier' });
  }
});

// GET single supplier
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`SELECT * FROM suppliers WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'supplier not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch supplier' });
  }
});

// UPDATE
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const fields = req.body || {};
    const safePairs = Object.entries(fields).filter(([k]) => SUPPLIER_ALLOWED_COLUMNS.has(k));
    if (safePairs.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    const keys = safePairs.map(([k]) => k);
    const values = safePairs.map(([, v]) => v);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE suppliers SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'supplier not found' });
    broadcastToAll('SUPPLIER_UPDATED', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update supplier' });
  }
});

// SOFT DELETE — flip is_active=false (preserve audit trail; never hard-delete)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(
      `UPDATE suppliers SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND COALESCE(is_active, true) = true RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      const existing = await query(`SELECT id, is_active FROM suppliers WHERE id = $1`, [req.params.id]);
      if (existing.rows.length === 0) return res.status(404).json({ error: 'supplier not found' });
      return res.json({ ok: true, data: existing.rows[0], note: 'already inactive' });
    }
    broadcastToAll('SUPPLIER_DELETED', rows[0]);
    eventBus.emit('supplier:deleted', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.json({ ok: true, soft_deleted: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete supplier' });
  }
});

export default router;
