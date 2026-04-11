import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';

const router = Router();
router.use(authenticate);

// Weekly production report — last 7 days
router.get('/weekly', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, '1 day')::date AS day
      )
      SELECT
        TO_CHAR(d.day, 'Dy') AS day,
        d.day AS date,
        COALESCE(COUNT(wo.id) FILTER (WHERE wo.status IN ('production','finishing','ready','delivered')), 0) AS units
      FROM days d
      LEFT JOIN work_orders wo ON wo.open_date = d.day
      GROUP BY d.day
      ORDER BY d.day ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch weekly report' });
  }
});

// Full order report — all linked data + computed actual cost
router.get('/order/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [orderRes, employeesRes, materialsRes, eventsRes, financialsRes] = await Promise.all([
      query(`
        SELECT wo.*, c.name AS client_name, c.phone AS client_phone, c.email AS client_email
        FROM work_orders wo
        JOIN clients c ON wo.client_id = c.id
        WHERE wo.id = $1
      `, [id]),
      query(`
        SELECT e.id, e.name, e.role, e.salary, woe.hours_logged, woe.role_on_order,
          (woe.hours_logged * (e.salary / 186)) AS labor_cost
        FROM work_order_employees woe
        JOIN employees e ON woe.employee_id = e.id
        WHERE woe.order_id = $1
      `, [id]),
      query(`
        SELECT mm.*, mi.name AS item_name, mi.unit, mi.category,
          (mm.qty * COALESCE(mm.cost_per_unit, mi.cost_per_unit)) AS line_cost
        FROM material_movements mm
        JOIN material_items mi ON mm.item_id = mi.id
        WHERE mm.order_id = $1 AND mm.type = 'consume'
        ORDER BY mm.created_at DESC
      `, [id]),
      query(`SELECT * FROM order_events WHERE order_id = $1 ORDER BY created_at DESC`, [id]),
      query(`SELECT * FROM financial_transactions WHERE order_id = $1 ORDER BY date DESC`, [id]),
    ]);

    if (!orderRes.rows[0]) return res.status(404).json({ error: 'Order not found' });

    const labor_cost = employeesRes.rows.reduce((s, e) => s + parseFloat(e.labor_cost || '0'), 0);
    const material_cost = materialsRes.rows.reduce((s, m) => s + parseFloat(m.line_cost || '0'), 0);
    const actual_cost = labor_cost + material_cost;

    res.json({
      ...orderRes.rows[0],
      employees: employeesRes.rows,
      materials: materialsRes.rows,
      events: eventsRes.rows,
      financials: financialsRes.rows,
      cost_breakdown: { labor_cost, material_cost, actual_cost },
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order report' });
  }
});

// Production stats — last 30 days
router.get('/production', async (req: AuthRequest, res: Response) => {
  try {
    const [orders, hours, materials] = await Promise.all([
      query(`
        SELECT
          COUNT(*) FILTER (WHERE open_date >= NOW() - INTERVAL '30 days') AS started,
          COUNT(*) FILTER (WHERE delivered_date >= NOW() - INTERVAL '30 days') AS completed
        FROM work_orders
      `),
      query(`
        SELECT COALESCE(SUM(hours_logged), 0) AS total_hours
        FROM work_order_employees woe
        JOIN work_orders wo ON woe.order_id = wo.id
        WHERE wo.open_date >= NOW() - INTERVAL '30 days'
      `),
      query(`
        SELECT COALESCE(SUM(qty * COALESCE(cost_per_unit, 0)), 0) AS materials_value
        FROM material_movements
        WHERE type = 'consume'
          AND created_at >= NOW() - INTERVAL '30 days'
      `),
    ]);

    res.json({
      started: parseInt(orders.rows[0].started),
      completed: parseInt(orders.rows[0].completed),
      total_hours: parseFloat(hours.rows[0].total_hours),
      materials_value: parseFloat(materials.rows[0].materials_value),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch production report' });
  }
});

export default router;
