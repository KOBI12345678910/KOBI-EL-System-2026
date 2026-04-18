import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";

const router: IRouter = Router();

function clean(body: any) {
  const c = { ...body };
  for (const k of Object.keys(c)) {
    if (c[k] === "") c[k] = null;
  }
  delete c.id;
  delete c.created_at;
  delete c.updated_at;
  return c;
}

const PROJECT_SELECT = `SELECT
  id, project_number, project_name AS name, project_type, description,
  customer_name AS client, customer_id, site_address,
  manager_name AS owner, status, phase, start_date, end_date,
  estimated_revenue AS budget, actual_cost AS spent,
  completion_pct, priority, department,
  contract_amount AS contract_value,
  created_at, updated_at
FROM projects`;

router.get("/projects-module", async (_req, res) => {
  try {
    const { rows } = await pool.query(`${PROJECT_SELECT} ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/projects-module/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query(`${PROJECT_SELECT} WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/projects-module", async (req, res) => {
  try {
    const b = clean(req.body);
    const { rows } = await pool.query(
      `INSERT INTO projects
        (project_number, project_name, project_type, description, customer_name, customer_id,
         site_address, manager_name, status, phase, start_date, end_date,
         estimated_revenue, actual_cost, completion_pct, priority, department, contract_amount)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        b.projectNumber || b.project_number || ('P-' + Date.now()),
        b.name || b.project_name || 'New Project',
        b.projectType || b.project_type || null,
        b.description || null,
        b.client || b.customer_name || null,
        b.customerId || b.customer_id || null,
        b.siteAddress || b.site_address || null,
        b.owner || b.manager_name || null,
        b.status || 'planning',
        b.phase || null,
        b.startDate || b.start_date || null,
        b.endDate || b.end_date || null,
        b.budget || b.estimated_revenue || 0,
        b.spent || b.actual_cost || 0,
        b.completionPct || b.completion_pct || 0,
        b.priority || 'medium',
        b.department || null,
        b.contractValue || b.contract_value || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/projects-module/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = clean(req.body);
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    const map: Record<string, string> = {
      name: "project_name", project_name: "project_name", projectType: "project_type", project_type: "project_type",
      description: "description", client: "customer_name", customer_name: "customer_name",
      owner: "manager_name", manager_name: "manager_name", status: "status", phase: "phase",
      startDate: "start_date", start_date: "start_date", endDate: "end_date", end_date: "end_date",
      budget: "estimated_revenue", estimated_revenue: "estimated_revenue",
      spent: "actual_cost", actual_cost: "actual_cost",
      completionPct: "completion_pct", completion_pct: "completion_pct",
      priority: "priority", department: "department",
    };
    for (const [k, col] of Object.entries(map)) {
      if (b[k] !== undefined) {
        sets.push(`${col} = $${idx++}`);
        vals.push(b[k]);
      }
    }
    sets.push(`updated_at = NOW()`);
    vals.push(id);
    const { rows } = await pool.query(
      `UPDATE projects SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/projects-module/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query(`DELETE FROM projects WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/project-tasks", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (projectId) {
      const { rows } = await pool.query(`SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY created_at DESC`, [projectId]);
      return res.json(rows);
    }
    const { rows } = await pool.query(`SELECT * FROM project_tasks ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e: any) {
    res.json([]);
  }
});

router.get("/project-tasks/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query(`SELECT * FROM project_tasks WHERE id = $1`, [id]);
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-tasks", async (req, res) => {
  try {
    const b = clean(req.body);
    const { rows } = await pool.query(
      `INSERT INTO project_tasks (project_id, title, description, assignee, status, priority, due_date, estimated_hours, actual_hours, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [b.projectId || b.project_id, b.title, b.description || null,
       b.assignee || null, b.status || 'todo', b.priority || 'medium',
       b.dueDate || b.due_date || null, b.estimatedHours || b.estimated_hours || null,
       b.actualHours || b.actual_hours || null, b.tags || null]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-tasks/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = clean(req.body);
    const { rows } = await pool.query(
      `UPDATE project_tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        assignee = COALESCE($3, assignee),
        status = COALESCE($4, status),
        priority = COALESCE($5, priority),
        due_date = COALESCE($6, due_date),
        updated_at = NOW()
      WHERE id = $7 RETURNING *`,
      [b.title, b.description, b.assignee, b.status, b.priority,
       b.dueDate || b.due_date, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-tasks/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query(`DELETE FROM project_tasks WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/project-milestones", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (projectId) {
      const { rows } = await pool.query(`SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY created_at DESC`, [projectId]);
      return res.json(rows);
    }
    const { rows } = await pool.query(`SELECT * FROM project_milestones ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e: any) {
    res.json([]);
  }
});

router.post("/project-milestones", async (req, res) => {
  try {
    const b = clean(req.body);
    const { rows } = await pool.query(
      `INSERT INTO project_milestones (project_id, title, description, target_date, status, payment_amount)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.projectId || b.project_id, b.title, b.description || null,
       b.targetDate || b.target_date || null, b.status || 'pending',
       b.paymentAmount || b.payment_amount || null]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-milestones/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = clean(req.body);
    const { rows } = await pool.query(
      `UPDATE project_milestones SET
        title = COALESCE($1, title), description = COALESCE($2, description),
        target_date = COALESCE($3, target_date), status = COALESCE($4, status),
        updated_at = NOW()
      WHERE id = $5 RETURNING *`,
      [b.title, b.description, b.targetDate || b.target_date, b.status, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-milestones/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query(`DELETE FROM project_milestones WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
