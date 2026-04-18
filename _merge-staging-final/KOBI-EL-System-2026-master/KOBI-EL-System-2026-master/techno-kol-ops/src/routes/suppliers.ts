import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';

const router = Router();
router.use(authenticate);

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

export default router;
