import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { resolved, severity, type } = req.query;
    let sql = `SELECT * FROM alerts WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (resolved !== undefined) { sql += ` AND is_resolved = $${i++}`; params.push(resolved === 'true'); }
    if (severity) { sql += ` AND severity = $${i++}`; params.push(severity); }
    if (type) { sql += ` AND type = $${i++}`; params.push(type); }
    sql += ` ORDER BY created_at DESC LIMIT 100`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

router.put('/:id/resolve', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { rows } = await query(`
      UPDATE alerts
      SET is_resolved = true, resolved_at = NOW(), resolved_by = $2
      WHERE id = $1 RETURNING *
    `, [id, req.user?.id]);

    broadcastToAll('ALERT_RESOLVED', rows[0]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

export default router;
