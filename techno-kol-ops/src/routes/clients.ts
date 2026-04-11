import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT c.*,
        COUNT(wo.id) as total_orders,
        COALESCE(SUM(wo.price), 0) as total_revenue,
        MAX(wo.open_date) as last_order_date
      FROM clients c
      LEFT JOIN work_orders wo ON c.id = wo.client_id
      WHERE c.is_active = true
      GROUP BY c.id
      ORDER BY total_revenue DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [clientRes, ordersRes, financialsRes] = await Promise.all([
      query(`SELECT * FROM clients WHERE id = $1`, [id]),
      query(`SELECT * FROM work_orders WHERE client_id = $1 ORDER BY open_date DESC`, [id]),
      query(`SELECT * FROM financial_transactions WHERE client_id = $1 ORDER BY date DESC`, [id])
    ]);

    res.json({
      ...clientRes.rows[0],
      orders: ordersRes.rows,
      financials: financialsRes.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch client' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, contact_name, phone, email, address, credit_limit, notes } = req.body;

    const { rows } = await query(`
      INSERT INTO clients (name, type, contact_name, phone, email, address, credit_limit, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [name, type, contact_name, phone, email, address, credit_limit, notes]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create client' });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    const keys = Object.keys(fields);
    const values = keys.map(k => fields[k]);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');

    const { rows } = await query(
      `UPDATE clients SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update client' });
  }
});

export default router;
