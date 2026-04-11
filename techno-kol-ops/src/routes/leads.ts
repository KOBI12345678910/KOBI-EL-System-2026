import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT l.*, e.name as assigned_name
      FROM leads l
      LEFT JOIN employees e ON l.assigned_to = e.id
      ORDER BY l.created_at DESC
    `);
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

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const fields = req.body;
    const keys = Object.keys(fields);
    const values = keys.map(k => fields[k]);
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

export default router;
