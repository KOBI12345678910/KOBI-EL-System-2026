import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.query;
    let sql = `
      SELECT mi.*, s.name as supplier_name,
        CASE WHEN mi.qty <= mi.min_threshold THEN true ELSE false END as is_low
      FROM material_items mi
      LEFT JOIN suppliers s ON mi.supplier_id = s.id
      WHERE mi.is_active = true
    `;
    const params: any[] = [];
    if (category) { sql += ` AND mi.category = $1`; params.push(category); }
    sql += ` ORDER BY mi.category, mi.name`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

router.get('/alerts', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT mi.*, s.name as supplier_name,
        ROUND((mi.qty / NULLIF(mi.min_threshold, 0)) * 100) as pct_of_threshold
      FROM material_items mi
      LEFT JOIN suppliers s ON mi.supplier_id = s.id
      WHERE mi.qty <= mi.min_threshold AND mi.is_active = true
      ORDER BY (mi.qty / NULLIF(mi.min_threshold, 0)) ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch material alerts' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [itemRes, movementsRes] = await Promise.all([
      query(`SELECT mi.*, s.name as supplier_name FROM material_items mi LEFT JOIN suppliers s ON mi.supplier_id = s.id WHERE mi.id = $1`, [id]),
      query(`SELECT mm.*, wo.product as order_product FROM material_movements mm LEFT JOIN work_orders wo ON mm.order_id = wo.id WHERE mm.item_id = $1 ORDER BY mm.created_at DESC LIMIT 20`, [id])
    ]);

    res.json({ ...itemRes.rows[0], movements: movementsRes.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch material' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, sku, category, subcategory, qty, unit, min_threshold, max_stock, cost_per_unit, supplier_id, location } = req.body;

    const { rows } = await query(`
      INSERT INTO material_items (name, sku, category, subcategory, qty, unit, min_threshold, max_stock, cost_per_unit, supplier_id, location)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *
    `, [name, sku, category, subcategory, qty, unit, min_threshold, max_stock, cost_per_unit, supplier_id, location]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create material' });
  }
});

// Receive stock
router.post('/:id/receive', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { qty, cost_per_unit, supplier_id, notes } = req.body;

    await query(`UPDATE material_items SET qty = qty + $2, cost_per_unit = $3 WHERE id = $1`, [id, qty, cost_per_unit]);

    await query(`
      INSERT INTO material_movements (item_id, type, qty, cost_per_unit, supplier_id, notes)
      VALUES ($1, 'receive', $2, $3, $4, $5)
    `, [id, qty, cost_per_unit, supplier_id, notes]);

    const { rows } = await query(`SELECT * FROM material_items WHERE id = $1`, [id]);
    broadcastToAll('MATERIAL_RECEIVED', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to receive stock' });
  }
});

// Consume from order
router.post('/:id/consume', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { qty, order_id, employee_id, notes } = req.body;

    const check = await query(`SELECT qty FROM material_items WHERE id = $1`, [id]);
    if (check.rows[0].qty < qty) {
      return res.status(400).json({ error: 'Insufficient stock' });
    }

    await query(`UPDATE material_items SET qty = qty - $2 WHERE id = $1`, [id, qty]);

    await query(`
      INSERT INTO material_movements (item_id, order_id, type, qty, employee_id, notes)
      VALUES ($1, $2, 'consume', $3, $4, $5)
    `, [id, order_id, qty, employee_id, notes]);

    const { rows } = await query(`SELECT * FROM material_items WHERE id = $1`, [id]);

    if (rows[0].qty <= rows[0].min_threshold) {
      broadcastToAll('MATERIAL_LOW', rows[0]);
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to consume material' });
  }
});

export default router;
