import { Router, Response } from 'express';
import { AuthRequest, authenticate } from '../middleware/auth';
import { query } from '../db/connection';
import { broadcastToAll } from '../realtime/websocket';
import { eventBus } from '../realtime/eventBus';

// Projects CRUD route — `projects` table is defined in schema.sql.
// Soft delete uses current_stage = 'cancelled' (pipeline_stage enum) when present;
// otherwise we fall back to setting closed_at.

const router = Router();
router.use(authenticate);

const PROJECT_ALLOWED_COLUMNS = new Set([
  'project_number', 'order_id', 'client_id', 'title', 'description',
  'address', 'lat', 'lng', 'total_price', 'advance_paid',
  'current_stage', 'surveyor_id', 'production_manager_id',
  'contractor_id', 'installer_id', 'driver_id', 'project_manager_id',
  'measurement_date', 'installation_date', 'installation_time',
  'survey_score', 'survey_feedback', 'notes',
]);

function isMissingTable(err: any): boolean {
  const code = err?.code || '';
  const msg = String(err?.message || err);
  return code === '42P01' || /relation .* does not exist|table .* not found/i.test(msg);
}

// LIST
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const stage = req.query.stage as string | undefined;
    const client_id = req.query.client_id as string | undefined;

    let sql = `SELECT p.*, c.name as client_name FROM projects p
               LEFT JOIN clients c ON p.client_id = c.id WHERE 1=1`;
    const params: any[] = [];
    let i = 1;
    if (stage)     { sql += ` AND p.current_stage = $${i++}`; params.push(stage); }
    if (client_id) { sql += ` AND p.client_id = $${i++}`;     params.push(client_id); }
    sql += ` ORDER BY p.created_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(limit, offset);

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'projects service unavailable' });
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// GET BY ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(
      `SELECT p.*, c.name as client_name FROM projects p
       LEFT JOIN clients c ON p.client_id = c.id WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'project not found' });
    res.json(rows[0]);
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'projects service unavailable' });
    res.status(500).json({ error: 'Failed to fetch project' });
  }
});

// CREATE
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      project_number, order_id, client_id, title, description, address,
      lat, lng, total_price, advance_paid, notes,
    } = req.body || {};
    if (!project_number || !client_id || !title || !address || total_price === undefined) {
      return res.status(400).json({ error: 'project_number, client_id, title, address, total_price are required' });
    }
    const { rows } = await query(
      `INSERT INTO projects
         (project_number, order_id, client_id, title, description, address,
          lat, lng, total_price, advance_paid, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [project_number, order_id, client_id, title, description, address,
       lat, lng, total_price, advance_paid || 0, notes]
    );
    broadcastToAll('PROJECT_CREATED', rows[0]);
    eventBus.emit('project:created', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.status(201).json(rows[0]);
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'projects service unavailable' });
    res.status(500).json({ error: 'Failed to create project', detail: err?.message });
  }
});

// UPDATE
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const fields = req.body || {};
    const safePairs = Object.entries(fields).filter(([k]) => PROJECT_ALLOWED_COLUMNS.has(k));
    if (safePairs.length === 0) return res.status(400).json({ error: 'No valid fields to update' });
    const keys = safePairs.map(([k]) => k);
    const values = safePairs.map(([, v]) => v);
    const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await query(
      `UPDATE projects SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id, ...values]
    );
    if (!rows[0]) return res.status(404).json({ error: 'project not found' });
    broadcastToAll('PROJECT_UPDATED', rows[0]);
    res.json(rows[0]);
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'projects service unavailable' });
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// SOFT DELETE — set closed_at; the pipeline_stage enum may not include 'cancelled'
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await query(
      `UPDATE projects SET closed_at = COALESCE(closed_at, NOW()), updated_at = NOW()
       WHERE id = $1 AND closed_at IS NULL RETURNING *`,
      [req.params.id]
    );
    if (rows.length === 0) {
      const existing = await query(`SELECT id, closed_at FROM projects WHERE id = $1`, [req.params.id]);
      if (existing.rows.length === 0) return res.status(404).json({ error: 'project not found' });
      return res.json({ ok: true, data: existing.rows[0], note: 'already closed' });
    }
    broadcastToAll('PROJECT_DELETED', rows[0]);
    eventBus.emit('project:deleted', { entity_id: rows[0].id, actor: req.user?.id || 'system' });
    res.json({ ok: true, soft_deleted: true, data: rows[0] });
  } catch (err: any) {
    if (isMissingTable(err)) return res.status(503).json({ error: 'projects service unavailable' });
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

export default router;
