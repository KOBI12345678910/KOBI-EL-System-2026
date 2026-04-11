import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll, broadcast } from '../realtime/websocket';

const router = Router();
router.use(authenticate);

// GET all tasks
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, date, status } = req.query;
    let sql = `
      SELECT t.*, e.name as employee_name, wo.client_id,
        c.name as client_name, c.phone as client_phone
      FROM tasks t
      LEFT JOIN employees e ON t.employee_id = e.id
      LEFT JOIN work_orders wo ON t.order_id = wo.id
      LEFT JOIN clients c ON wo.client_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];
    let i = 1;
    if (employee_id) { sql += ` AND t.employee_id = $${i++}`; params.push(employee_id); }
    if (date) { sql += ` AND t.scheduled_date = $${i++}`; params.push(date); }
    if (status) { sql += ` AND t.status = $${i++}`; params.push(status); }
    sql += ` ORDER BY t.scheduled_date ASC, t.scheduled_time ASC`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST create task
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      order_id, employee_id, type, title, description,
      address, lat, lng, scheduled_date, scheduled_time
    } = req.body;

    const { rows } = await query(`
      INSERT INTO tasks
        (order_id, employee_id, type, title, description,
         address, lat, lng, scheduled_date, scheduled_time)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *
    `, [order_id, employee_id, type, title, description,
        address, lat, lng, scheduled_date, scheduled_time]);

    // Notify the employee via WS
    broadcast(`employee:${employee_id}`, 'NEW_TASK', rows[0]);
    broadcastToAll('TASK_CREATED', rows[0]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PUT update task status (from mobile)
router.put('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes, lat, lng } = req.body;

    const updates: any = { status };
    if (status === 'arrived') updates.arrived_at = new Date().toISOString();
    if (status === 'done') updates.completed_at = new Date().toISOString();
    if (notes) updates.notes = notes;

    const keys = Object.keys(updates);
    const values = keys.map(k => updates[k]);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');

    const { rows } = await query(
      `UPDATE tasks SET ${setClause} WHERE id = $1 RETURNING *`,
      [id, ...values]
    );

    broadcastToAll('TASK_UPDATED', rows[0]);

    // If task done, log event on the order
    if (status === 'done' && rows[0].order_id) {
      await query(`
        INSERT INTO order_events (order_id, event_type, description)
        VALUES ($1, 'task_completed', $2)
      `, [rows[0].order_id, `משימה הושלמה: ${rows[0].title}`]);
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// POST add photo to task
router.post('/:id/photo', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { photo_url, caption } = req.body;

    const { rows } = await query(`
      UPDATE tasks
      SET photos = photos || $2::jsonb
      WHERE id = $1 RETURNING *
    `, [id, JSON.stringify([{ url: photo_url, caption, at: new Date().toISOString() }])]);

    broadcastToAll('TASK_PHOTO_ADDED', { task_id: id, photo_url });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add photo' });
  }
});

export default router;
