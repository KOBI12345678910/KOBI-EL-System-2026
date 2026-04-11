import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';

const router = Router();
router.use(authenticate);

// POST — employee sends their location (called every 30s from mobile)
router.post('/update', async (req: AuthRequest, res: Response) => {
  try {
    const { employee_id, lat, lng, accuracy, speed, heading, battery_level } = req.body;

    // Insert into history
    await query(`
      INSERT INTO gps_locations (employee_id, lat, lng, accuracy, speed, heading, battery_level)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [employee_id, lat, lng, accuracy, speed, heading, battery_level]);

    // Upsert current position
    await query(`
      INSERT INTO employee_current_location
        (employee_id, lat, lng, accuracy, speed, battery_level, last_seen, status)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'active')
      ON CONFLICT (employee_id) DO UPDATE SET
        lat = $2, lng = $3, accuracy = $4,
        speed = $5, battery_level = $6,
        last_seen = NOW(), status = 'active'
    `, [employee_id, lat, lng, accuracy, speed, battery_level]);

    // Broadcast to dashboard
    broadcastToAll('LOCATION_UPDATE', {
      employee_id, lat, lng, speed, battery_level,
      timestamp: new Date().toISOString()
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update location' });
  }
});

// GET — all current locations (for map)
router.get('/current', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT
        ecl.*,
        e.name, e.role, e.department,
        t.id as current_task_id,
        t.title as current_task,
        t.address as task_address,
        t.status as task_status,
        EXTRACT(EPOCH FROM (NOW() - ecl.last_seen)) as seconds_ago
      FROM employee_current_location ecl
      JOIN employees e ON ecl.employee_id = e.id
      LEFT JOIN tasks t ON t.employee_id = ecl.employee_id
        AND t.scheduled_date = CURRENT_DATE
        AND t.status IN ('on_way','arrived','in_progress')
      WHERE ecl.last_seen > NOW() - INTERVAL '2 hours'
        AND e.is_active = true
      ORDER BY ecl.last_seen DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// GET — location history for one employee today
router.get('/history/:employeeId', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(`
      SELECT lat, lng, speed, timestamp
      FROM gps_locations
      WHERE employee_id = $1
        AND timestamp >= CURRENT_DATE::TIMESTAMPTZ
      ORDER BY timestamp ASC
    `, [req.params.employeeId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;
