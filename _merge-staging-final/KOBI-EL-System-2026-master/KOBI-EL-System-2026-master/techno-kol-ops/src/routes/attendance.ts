import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';

const router = Router();
router.use(authenticate);

router.get('/today', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT e.id, e.name, e.role, e.department,
        a.location, a.check_in, a.check_out, a.hours_worked
      FROM employees e
      LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = CURRENT_DATE
      WHERE e.is_active = true
      ORDER BY e.name
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, from, to } = req.query;
    let sql = `
      SELECT a.*, e.name as employee_name
      FROM attendance a JOIN employees e ON a.employee_id = e.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let i = 1;
    if (employee_id) { sql += ` AND a.employee_id = $${i++}`; params.push(employee_id); }
    if (from) { sql += ` AND a.date >= $${i++}`; params.push(from); }
    if (to) { sql += ` AND a.date <= $${i++}`; params.push(to); }
    sql += ` ORDER BY a.date DESC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, date, check_in, check_out, location, hours_worked, notes } = req.body;

    const { rows } = await query(`
      INSERT INTO attendance (employee_id, date, check_in, check_out, location, hours_worked, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (employee_id, date) DO UPDATE
      SET check_in = COALESCE($3, attendance.check_in),
          check_out = COALESCE($4, attendance.check_out),
          location = COALESCE($5, attendance.location),
          hours_worked = COALESCE($6, attendance.hours_worked),
          notes = COALESCE($7, attendance.notes)
      RETURNING *
    `, [employee_id, date, check_in, check_out, location, hours_worked, notes]);

    broadcastToAll('ATTENDANCE_UPDATED', rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to record attendance' });
  }
});

export default router;
