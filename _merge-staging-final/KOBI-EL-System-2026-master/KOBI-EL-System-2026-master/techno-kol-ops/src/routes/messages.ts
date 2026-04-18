import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcast } from '../realtime/websocket';

const router = Router();
router.use(authenticate);

router.get('/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT m.*, u.username as from_name
      FROM messages m
      LEFT JOIN users u ON m.from_user_id = u.id
      WHERE m.to_employee_id = $1
      ORDER BY m.created_at DESC
      LIMIT 50
    `, [req.params.employeeId]);
    res.json(rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { to_employee_id, content, type } = req.body;

    const { rows } = await query(`
      INSERT INTO messages (from_user_id, to_employee_id, content, type)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [req.user?.id, to_employee_id, content, type || 'text']);

    // Push to employee's WS room
    broadcast(`employee:${to_employee_id}`, 'NEW_MESSAGE', rows[0]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    await query(`UPDATE messages SET is_read = true, read_at = NOW() WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark read' });
  }
});

export default router;
