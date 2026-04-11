import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT e.*,
        a.location as today_location,
        a.check_in as today_checkin,
        COUNT(DISTINCT woe.order_id) as active_orders
      FROM employees e
      LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = CURRENT_DATE
      LEFT JOIN work_order_employees woe ON e.id = woe.employee_id
      LEFT JOIN work_orders wo ON woe.order_id = wo.id AND wo.status NOT IN ('delivered','cancelled')
      WHERE e.is_active = true
      GROUP BY e.id, a.location, a.check_in
      ORDER BY e.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [empRes, attendanceRes, ordersRes] = await Promise.all([
      query(`SELECT * FROM employees WHERE id = $1`, [id]),
      query(`
        SELECT * FROM attendance
        WHERE employee_id = $1
        ORDER BY date DESC LIMIT 30
      `, [id]),
      query(`
        SELECT wo.id, wo.product, wo.status, wo.progress, woe.hours_logged, woe.role_on_order
        FROM work_order_employees woe
        JOIN work_orders wo ON woe.order_id = wo.id
        WHERE woe.employee_id = $1
        ORDER BY wo.open_date DESC
        LIMIT 10
      `, [id])
    ]);

    if (!empRes.rows[0]) return res.status(404).json({ error: 'Employee not found' });

    const hoursThisMonth = attendanceRes.rows
      .filter(a => new Date(a.date).getMonth() === new Date().getMonth())
      .reduce((sum, a) => sum + (parseFloat(a.hours_worked) || 0), 0);

    res.json({
      ...empRes.rows[0],
      attendance: attendanceRes.rows,
      orders: ordersRes.rows,
      hoursThisMonth,
      costThisMonth: (empRes.rows[0].salary / 22) * (hoursThisMonth / 8)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, role, department, phone, id_number, salary, employment_type, start_date, notes } = req.body;

    const { rows } = await query(`
      INSERT INTO employees (name, role, department, phone, id_number, salary, employment_type, start_date, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [name, role, department, phone, id_number, salary, employment_type, start_date, notes]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create employee' });
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
      `UPDATE employees SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update employee' });
  }
});

export default router;
