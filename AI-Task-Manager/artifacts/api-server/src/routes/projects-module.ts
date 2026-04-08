import { Router, type IRouter, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import { pool } from "@workspace/db";
import { z } from "zod/v4";
import crypto from "crypto";
import { validateSession } from "../lib/auth";

interface AuthedRequest extends Request {
  erpUser?: Record<string, unknown>;
}

function generatePortalToken(): string {
  return "portal_" + crypto.randomBytes(24).toString("hex");
}

const requireErpAuth: RequestHandler = async (req: AuthedRequest, res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  req.erpUser = result.user as Record<string, unknown>;
  next();
};

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
    const { rows } = await pool.query(`${PROJECT_SELECT} WHERE deleted_at IS NULL ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/projects-module/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query(`${PROJECT_SELECT} WHERE id = $1 AND deleted_at IS NULL`, [id]);
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
    await pool.query(`UPDATE projects SET deleted_at = NOW() WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/project-tasks", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (projectId) {
      const { rows } = await pool.query(
        `SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY sort_order ASC, wbs_code ASC, created_at ASC`,
        [projectId]
      );
      return res.json(rows);
    }
    const { rows } = await pool.query(
      `SELECT * FROM project_tasks ORDER BY sort_order ASC, wbs_code ASC, created_at ASC`
    );
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
    const projectId = b.projectId || b.project_id;
    const parentTaskId = b.parentTaskId || b.parent_task_id || null;

    let wbsCode = b.wbsCode || b.wbs_code || null;
    if (!wbsCode && projectId) {
      wbsCode = await generateWbsCode(projectId, parentTaskId);
    }

    const { rows } = await pool.query(
      `INSERT INTO project_tasks (
        project_id, parent_task_id, wbs_code, sort_order,
        title, description, assignee, status, priority, due_date,
        estimated_hours, actual_hours, tags,
        duration, planned_start, planned_end, actual_start, actual_end,
        is_milestone
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [
        projectId,
        parentTaskId,
        wbsCode,
        b.sortOrder || b.sort_order || 0,
        b.title,
        b.description || null,
        b.assignee || null,
        b.status || 'todo',
        b.priority || 'medium',
        b.dueDate || b.due_date || null,
        b.estimatedHours || b.estimated_hours || null,
        b.actualHours || b.actual_hours || null,
        b.tags || null,
        b.duration || 1,
        b.plannedStart || b.planned_start || null,
        b.plannedEnd || b.planned_end || null,
        b.actualStart || b.actual_start || null,
        b.actualEnd || b.actual_end || null,
        b.isMilestone || b.is_milestone || false,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-tasks/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const b = clean(req.body);
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    const map: Record<string, string> = {
      title: "title", description: "description", assignee: "assignee",
      status: "status", priority: "priority",
      dueDate: "due_date", due_date: "due_date",
      estimatedHours: "estimated_hours", estimated_hours: "estimated_hours",
      actualHours: "actual_hours", actual_hours: "actual_hours",
      tags: "tags",
      parentTaskId: "parent_task_id", parent_task_id: "parent_task_id",
      wbsCode: "wbs_code", wbs_code: "wbs_code",
      sortOrder: "sort_order", sort_order: "sort_order",
      duration: "duration",
      plannedStart: "planned_start", planned_start: "planned_start",
      plannedEnd: "planned_end", planned_end: "planned_end",
      actualStart: "actual_start", actual_start: "actual_start",
      actualEnd: "actual_end", actual_end: "actual_end",
      isMilestone: "is_milestone", is_milestone: "is_milestone",
      isCritical: "is_critical", is_critical: "is_critical",
      baselineStart: "baseline_start", baseline_start: "baseline_start",
      baselineEnd: "baseline_end", baseline_end: "baseline_end",
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
      `UPDATE project_tasks SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`, vals
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

async function generateWbsCode(projectId: number, parentTaskId: number | null): Promise<string> {
  if (!parentTaskId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as cnt FROM project_tasks WHERE project_id = $1 AND parent_task_id IS NULL`,
      [projectId]
    );
    return String(parseInt(rows[0].cnt) + 1);
  }
  const { rows: parent } = await pool.query(
    `SELECT wbs_code FROM project_tasks WHERE id = $1`,
    [parentTaskId]
  );
  const parentCode = parent[0]?.wbs_code || "1";
  const { rows } = await pool.query(
    `SELECT COUNT(*) as cnt FROM project_tasks WHERE project_id = $1 AND parent_task_id = $2`,
    [projectId, parentTaskId]
  );
  return `${parentCode}.${parseInt(rows[0].cnt) + 1}`;
}

router.get("/project-task-dependencies", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (projectId) {
      const { rows } = await pool.query(
        `SELECT * FROM project_task_dependencies WHERE project_id = $1 ORDER BY id`,
        [projectId]
      );
      return res.json(rows);
    }
    const { rows } = await pool.query(`SELECT * FROM project_task_dependencies ORDER BY id`);
    res.json(rows);
  } catch (e: any) { res.json([]); }
});

router.post("/project-task-dependencies", async (req, res) => {
  try {
    const b = clean(req.body);
    const { rows } = await pool.query(
      `INSERT INTO project_task_dependencies (project_id, predecessor_id, successor_id, dependency_type, lag_days)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [
        b.projectId || b.project_id,
        b.predecessorId || b.predecessor_id,
        b.successorId || b.successor_id,
        b.dependencyType || b.dependency_type || 'FS',
        b.lagDays || b.lag_days || 0,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-task-dependencies/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query(`DELETE FROM project_task_dependencies WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-tasks/calculate-critical-path/:projectId", async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const result = await calculateCriticalPath(projectId);
    res.json(result);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-tasks/save-baseline/:projectId", async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    await pool.query(
      `UPDATE project_tasks 
       SET baseline_start = planned_start, baseline_end = planned_end
       WHERE project_id = $1`,
      [projectId]
    );
    res.json({ success: true, message: "Baseline saved" });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

async function calculateCriticalPath(projectId: number) {
  const { rows: tasks } = await pool.query(
    `SELECT * FROM project_tasks WHERE project_id = $1 ORDER BY sort_order ASC, id ASC`,
    [projectId]
  );
  const { rows: deps } = await pool.query(
    `SELECT * FROM project_task_dependencies WHERE project_id = $1`,
    [projectId]
  );

  const taskMap = new Map<number, any>();
  for (const t of tasks) {
    taskMap.set(t.id, {
      ...t,
      duration: t.duration || 1,
      earlyStart: 0,
      earlyFinish: 0,
      lateStart: 0,
      lateFinish: 0,
      totalFloat: 0,
      freeFloat: 0,
      isCritical: false,
    });
  }

  const successors = new Map<number, number[]>();
  const predecessors = new Map<number, { id: number; type: string; lag: number }[]>();

  for (const t of tasks) {
    successors.set(t.id, []);
    predecessors.set(t.id, []);
  }

  for (const d of deps) {
    const slist = successors.get(d.predecessor_id) || [];
    slist.push(d.successor_id);
    successors.set(d.predecessor_id, slist);

    const plist = predecessors.get(d.successor_id) || [];
    plist.push({ id: d.predecessor_id, type: d.dependency_type || 'FS', lag: d.lag_days || 0 });
    predecessors.set(d.successor_id, plist);
  }

  const topOrder = topologicalSort(tasks.map(t => t.id), successors);

  for (const id of topOrder) {
    const task = taskMap.get(id)!;
    const preds = predecessors.get(id) || [];
    if (preds.length === 0) {
      task.earlyStart = 0;
    } else {
      let maxES = 0;
      for (const pred of preds) {
        const predTask = taskMap.get(pred.id)!;
        let es = 0;
        if (pred.type === 'FS') es = predTask.earlyFinish + pred.lag;
        else if (pred.type === 'SS') es = predTask.earlyStart + pred.lag;
        else if (pred.type === 'FF') es = predTask.earlyFinish + pred.lag - task.duration;
        else if (pred.type === 'SF') es = predTask.earlyStart + pred.lag - task.duration;
        maxES = Math.max(maxES, es);
      }
      task.earlyStart = maxES;
    }
    task.earlyFinish = task.earlyStart + task.duration;
  }

  const projectDuration = Math.max(...[...taskMap.values()].map(t => t.earlyFinish));

  for (const id of [...topOrder].reverse()) {
    const task = taskMap.get(id)!;
    const succs = successors.get(id) || [];
    if (succs.length === 0) {
      task.lateFinish = projectDuration;
    } else {
      let minLF = Infinity;
      for (const succId of succs) {
        const succTask = taskMap.get(succId)!;
        const dep = deps.find((d: any) => d.predecessor_id === id && d.successor_id === succId);
        const lag = dep?.lag_days || 0;
        const type = dep?.dependency_type || 'FS';
        let lf = 0;
        if (type === 'FS') lf = succTask.lateStart - lag;
        else if (type === 'SS') lf = succTask.lateStart - lag + task.duration;
        else if (type === 'FF') lf = succTask.lateFinish - lag;
        else if (type === 'SF') lf = succTask.lateFinish - lag + task.duration;
        minLF = Math.min(minLF, lf);
      }
      task.lateFinish = minLF;
    }
    task.lateStart = task.lateFinish - task.duration;
    task.totalFloat = task.lateStart - task.earlyStart;
    task.isCritical = task.totalFloat <= 0;
  }

  for (const id of topOrder) {
    const task = taskMap.get(id)!;
    const succs = successors.get(id) || [];
    if (succs.length === 0) {
      task.freeFloat = task.lateFinish - task.earlyFinish;
    } else {
      let minSuccES = Infinity;
      for (const succId of succs) {
        const succTask = taskMap.get(succId)!;
        minSuccES = Math.min(minSuccES, succTask.earlyStart);
      }
      task.freeFloat = minSuccES - task.earlyFinish;
    }
  }

  const updates = [];
  for (const [id, task] of taskMap) {
    updates.push(
      pool.query(
        `UPDATE project_tasks SET
          early_start = $1, early_finish = $2, late_start = $3, late_finish = $4,
          total_float = $5, free_float = $6, is_critical = $7
         WHERE id = $8`,
        [
          task.earlyStart, task.earlyFinish,
          task.lateStart, task.lateFinish,
          task.totalFloat, task.freeFloat,
          task.isCritical,
          id,
        ]
      )
    );
  }
  await Promise.all(updates);

  return {
    projectDuration,
    criticalPathCount: [...taskMap.values()].filter(t => t.isCritical).length,
    tasks: [...taskMap.values()],
  };
}

function topologicalSort(ids: number[], successors: Map<number, number[]>): number[] {
  const visited = new Set<number>();
  const result: number[] = [];

  function visit(id: number) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const s of (successors.get(id) || [])) {
      visit(s);
    }
    result.unshift(id);
  }

  for (const id of ids) {
    visit(id);
  }

  return result;
}

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

// ─── PORTFOLIO DASHBOARD API ────────────────────────────────────────────────

router.get("/portfolio-dashboard", requireErpAuth, async (req, res) => {
  try {
    const { manager, customer, type, status, dateFrom, dateTo, sortBy, sortDir } = req.query;
    let where = "WHERE 1=1";
    const vals: any[] = [];
    let idx = 1;
    if (manager) { where += ` AND manager_name ILIKE $${idx++}`; vals.push(`%${manager}%`); }
    if (customer) { where += ` AND customer_name ILIKE $${idx++}`; vals.push(`%${customer}%`); }
    if (type) { where += ` AND project_type = $${idx++}`; vals.push(type); }
    if (status) { where += ` AND status = $${idx++}`; vals.push(status); }
    if (dateFrom) { where += ` AND start_date >= $${idx++}`; vals.push(dateFrom); }
    if (dateTo) { where += ` AND end_date <= $${idx++}`; vals.push(dateTo); }

    const allowedSortCols: Record<string, string> = {
      created_at: "p.created_at", name: "p.project_name", start_date: "p.start_date",
      end_date: "p.end_date", status: "p.status", completion_pct: "p.completion_pct",
      manager: "p.manager_name", customer: "p.customer_name",
    };
    const sortCol = allowedSortCols[sortBy as string] || "p.created_at";
    const sortDirection = (sortDir as string)?.toUpperCase() === "ASC" ? "ASC" : "DESC";

    const { rows: projects } = await pool.query(
      `SELECT p.*,
        COALESCE((SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id = p.id AND pt.status != 'done'), 0) AS open_tasks,
        COALESCE((SELECT COUNT(*) FROM project_milestones pm WHERE pm.project_id = p.id), 0) AS milestone_count,
        COALESCE((SELECT COUNT(*) FROM project_milestones pm WHERE pm.project_id = p.id AND pm.status = 'completed'), 0) AS milestones_done
       FROM projects p ${where} ORDER BY ${sortCol} ${sortDirection}`,
      vals
    );

    const enriched = projects.map((p: any) => {
      const budget = parseFloat(p.estimated_revenue || p.budget || "0");
      const spent = parseFloat(p.actual_cost || p.spent || "0");
      const budgetHealth = budget > 0 ? (spent / budget) <= 1.1 ? "ok" : spent / budget <= 1.25 ? "warning" : "over" : "ok";
      const now = new Date();
      const end = p.end_date ? new Date(p.end_date) : null;
      const scheduleHealth = !end ? "ok" : end < now && p.status !== "completed" && p.status !== "cancelled" ? "late" : "ok";
      const completionPct = parseFloat(p.completion_pct || "0");
      return {
        ...p,
        budget_health: budgetHealth,
        schedule_health: scheduleHealth,
        completion_pct: completionPct,
        budget: budget,
        spent: spent,
      };
    });

    res.json({ projects: enriched, total: enriched.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/portfolio-kpis", requireErpAuth, async (_req, res) => {
  try {
    const { rows: projects } = await pool.query(`SELECT * FROM projects WHERE deleted_at IS NULL`);
    const total = projects.length;
    const active = projects.filter((p: any) => p.status === "active").length;
    const now = new Date();
    const onTime = projects.filter((p: any) => {
      if (!p.end_date) return true;
      return new Date(p.end_date) >= now || p.status === "completed";
    }).length;
    const onTimeRate = total > 0 ? Math.round((onTime / total) * 100) : 100;

    const budgetHealthy = projects.filter((p: any) => {
      const budget = parseFloat(p.estimated_revenue || p.budget || "0");
      const spent = parseFloat(p.actual_cost || p.spent || "0");
      return budget <= 0 || spent / budget <= 1.1;
    }).length;
    const onBudgetRate = total > 0 ? Math.round((budgetHealthy / total) * 100) : 100;

    const avgCompletion = total > 0
      ? Math.round(projects.reduce((s: number, p: any) => s + parseFloat(p.completion_pct || "0"), 0) / total)
      : 0;
    const totalRevenuePipeline = projects.reduce((s: number, p: any) => s + parseFloat(p.estimated_revenue || p.budget || "0"), 0);

    res.json({ total, active, onTimeRate, onBudgetRate, avgCompletion, totalRevenuePipeline });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/portfolio-resource-heatmap", requireErpAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT 
        pr.name,
        pr.resource_type,
        pr.project_id,
        p.project_name AS project_name,
        pr.allocation_pct,
        pr.start_date,
        pr.end_date,
        pr.status
       FROM project_resources pr
       LEFT JOIN projects p ON p.id = pr.project_id
       WHERE pr.start_date IS NOT NULL OR pr.end_date IS NOT NULL
       ORDER BY pr.name, pr.start_date`
    );

    const grouped: Record<string, any> = {};
    const today = new Date();
    const weeks: string[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i * 7 - today.getDay());
      weeks.push(d.toISOString().slice(0, 10));
    }

    for (const r of rows) {
      const key = r.name;
      if (!grouped[key]) {
        grouped[key] = { name: r.name, resourceType: r.resource_type, weeks: {} };
        for (const w of weeks) grouped[key].weeks[w] = 0;
      }
      const startDate = r.start_date ? new Date(r.start_date) : null;
      const endDate = r.end_date ? new Date(r.end_date) : null;
      const alloc = parseFloat(r.allocation_pct || "100");
      for (const w of weeks) {
        const wd = new Date(w);
        if ((!startDate || wd >= startDate) && (!endDate || wd <= endDate)) {
          grouped[key].weeks[w] = (grouped[key].weeks[w] || 0) + alloc;
        }
      }
    }

    res.json({ weeks, resources: Object.values(grouped) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ─── INTERNAL PORTAL MANAGEMENT (ERP session auth required) ─────────────────
// NOTE: Public portal endpoints (no ERP auth) are registered in app.ts before the auth middleware.

// Internal: get portal milestones by projectId (ERP-auth enforced)
router.get("/project-portal/:projectId/milestones", requireErpAuth, async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const { rows } = await pool.query(
      `SELECT * FROM project_milestones WHERE project_id = $1 ORDER BY target_date ASC, created_at ASC`,
      [projectId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Internal: approve milestone (ERP-auth enforced)
router.post("/project-portal/:projectId/milestones/:milestoneId/approve", requireErpAuth, async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const milestoneId = z.coerce.number().int().positive().parse(req.params.milestoneId);
    const { rows } = await pool.query(
      `UPDATE project_milestones SET status = 'approved', updated_at = NOW() WHERE id = $1 AND project_id = $2 RETURNING *`,
      [milestoneId, projectId]
    );
    if (!rows.length) return res.status(404).json({ error: "Milestone not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Internal: get comments by projectId (ERP-auth enforced)
router.get("/project-portal/:projectId/comments", requireErpAuth, async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const { rows } = await pool.query(
      `SELECT * FROM project_comments WHERE project_id = $1 ORDER BY created_at ASC`,
      [projectId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Internal: post comment (ERP-auth enforced)
router.post("/project-portal/:projectId/comments", requireErpAuth, async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const { message, authorName, authorEmail, authorType, taskId, milestoneId } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });
    const { rows } = await pool.query(
      `INSERT INTO project_comments (project_id, task_id, milestone_id, author_type, author_name, author_email, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [projectId, taskId || null, milestoneId || null,
       authorType || "internal", authorName || "Team", authorEmail || null, message]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Internal: resolve comment (ERP-auth enforced)
router.put("/project-portal/comments/:id/resolve", requireErpAuth, async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows } = await pool.query(
      `UPDATE project_comments SET is_resolved = true, updated_at = NOW() WHERE id = $1 RETURNING *`, [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Comment not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Internal: create portal access token (ERP-auth enforced, crypto token)
router.post("/project-portal-access", requireErpAuth, async (req, res) => {
  try {
    const { projectId, customerId, contactEmail, permissions, expiresAt } = req.body;
    if (!projectId) return res.status(400).json({ error: "projectId required" });
    const token = generatePortalToken();
    const { rows } = await pool.query(
      `INSERT INTO project_portal_access (project_id, customer_id, contact_email, access_token, permissions, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [projectId, customerId || null, contactEmail || null, token,
       JSON.stringify(permissions || { view_progress: true, view_documents: true, approve_milestones: false, submit_comments: true }),
       expiresAt || null]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Internal: list portal access entries (ERP-auth enforced)
router.get("/project-portal-access", requireErpAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (projectId) {
      const { rows } = await pool.query(
        `SELECT pa.*, p.project_name FROM project_portal_access pa LEFT JOIN projects p ON p.id = pa.project_id WHERE pa.project_id = $1 ORDER BY pa.created_at DESC`,
        [projectId]
      );
      return res.json(rows);
    }
    const { rows } = await pool.query(
      `SELECT pa.*, p.project_name FROM project_portal_access pa LEFT JOIN projects p ON p.id = pa.project_id ORDER BY pa.created_at DESC`
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Internal: revoke portal access (ERP-auth enforced)
router.delete("/project-portal-access/:id", requireErpAuth, async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query(`UPDATE project_portal_access SET is_active = false WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Internal: project comments management (ERP-auth enforced)
router.get("/project-comments", requireErpAuth, async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (projectId) {
      const { rows } = await pool.query(`SELECT * FROM project_comments WHERE project_id = $1 ORDER BY created_at ASC`, [projectId]);
      return res.json(rows);
    }
    const { rows } = await pool.query(`SELECT * FROM project_comments ORDER BY created_at DESC`);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/project-comments", requireErpAuth, async (req, res) => {
  try {
    const { projectId, taskId, milestoneId, message, authorName, authorType } = req.body;
    if (!projectId || !message) return res.status(400).json({ error: "projectId and message required" });
    const { rows } = await pool.query(
      `INSERT INTO project_comments (project_id, task_id, milestone_id, author_type, author_name, message)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [projectId, taskId || null, milestoneId || null, authorType || "internal", authorName || "Team", message]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-comments/:id", requireErpAuth, async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    const { rows } = await pool.query(
      `UPDATE project_comments SET message = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [message, id]
    );
    if (!rows.length) return res.status(404).json({ error: "Comment not found" });
    res.json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-comments/:id", requireErpAuth, async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query(`DELETE FROM project_comments WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// ─── PRODUCTION INTEGRATION API ──────────────────────────────────────────────

router.get("/project-work-order-links", requireErpAuth, async (req, res) => {
  try {
    const taskId = req.query.taskId ? z.coerce.number().parse(req.query.taskId) : null;
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (taskId) {
      const { rows } = await pool.query(
        `SELECT pwl.*, wo.order_number, wo.product_name, wo.status AS wo_status, wo.completion_percentage
         FROM project_work_order_links pwl
         LEFT JOIN production_work_orders wo ON wo.id = pwl.work_order_id
         WHERE pwl.project_task_id = $1 ORDER BY pwl.created_at DESC`,
        [taskId]
      );
      return res.json(rows);
    }
    if (projectId) {
      const { rows } = await pool.query(
        `SELECT pwl.*, wo.order_number, wo.product_name, wo.status AS wo_status, wo.completion_percentage,
                pt.title AS task_title
         FROM project_work_order_links pwl
         LEFT JOIN production_work_orders wo ON wo.id = pwl.work_order_id
         LEFT JOIN project_tasks pt ON pt.id = pwl.project_task_id
         WHERE pt.project_id = $1 ORDER BY pwl.created_at DESC`,
        [projectId]
      );
      return res.json(rows);
    }
    const { rows } = await pool.query(
      `SELECT pwl.*, wo.order_number, wo.product_name, wo.status AS wo_status, wo.completion_percentage,
              pt.title AS task_title
       FROM project_work_order_links pwl
       LEFT JOIN production_work_orders wo ON wo.id = pwl.work_order_id
       LEFT JOIN project_tasks pt ON pt.id = pwl.project_task_id
       ORDER BY pwl.created_at DESC`
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/project-work-order-links", requireErpAuth, async (req, res) => {
  try {
    const { projectTaskId, workOrderId, linkType, notes } = req.body;
    if (!projectTaskId || !workOrderId) return res.status(400).json({ error: "projectTaskId and workOrderId required" });
    const { rows } = await pool.query(
      `INSERT INTO project_work_order_links (project_task_id, work_order_id, link_type, notes)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (project_task_id, work_order_id) DO UPDATE SET link_type = EXCLUDED.link_type, notes = EXCLUDED.notes, updated_at = NOW()
       RETURNING *`,
      [projectTaskId, workOrderId, linkType || "linked", notes || null]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-work-order-links/:id", requireErpAuth, async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await pool.query(`DELETE FROM project_work_order_links WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Helper: recalculate project completion_pct from task completion averages and linked work orders
async function recalculateProjectCompletion(projectId: number): Promise<void> {
  const { rows: tasks } = await pool.query(
    `SELECT pt.id, pt.completion_percent, pt.status,
            COALESCE(wo.completion_percentage, NULL) AS wo_completion
     FROM project_tasks pt
     LEFT JOIN project_work_order_links pwl ON pwl.project_task_id = pt.id
     LEFT JOIN production_work_orders wo ON wo.id = pwl.work_order_id
     WHERE pt.project_id = $1`,
    [projectId]
  );
  if (!tasks.length) return;
  const taskCompletions = tasks.map((t: any) => {
    const base = t.status === "done" ? 100 : parseFloat(t.completion_percent || "0");
    const wo = t.wo_completion !== null ? parseFloat(t.wo_completion || "0") : null;
    return wo !== null ? Math.max(base, wo) : base;
  });
  const avg = Math.round(taskCompletions.reduce((s: number, v: number) => s + v, 0) / taskCompletions.length);
  await pool.query(`UPDATE projects SET completion_pct = $1, updated_at = NOW() WHERE id = $2`, [avg, projectId]);
}

// Sync work order completion to task, then recalculate project completion
router.post("/project-work-order-links/:id/sync", requireErpAuth, async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const { rows: links } = await pool.query(
      `SELECT pwl.*, wo.completion_percentage, wo.status AS wo_status, pt.project_id
       FROM project_work_order_links pwl
       LEFT JOIN production_work_orders wo ON wo.id = pwl.work_order_id
       LEFT JOIN project_tasks pt ON pt.id = pwl.project_task_id
       WHERE pwl.id = $1`, [id]
    );
    if (!links.length) return res.status(404).json({ error: "Link not found" });
    const link = links[0];
    const woStatus = link.wo_status;
    const woCompletion = parseFloat(link.completion_percentage || "0");
    const taskStatus = woStatus === "completed" ? "done" : woStatus === "in_progress" ? "in-progress" : "todo";
    const taskCompletion = woStatus === "completed" ? 100 : woCompletion;
    await pool.query(
      `UPDATE project_tasks SET status = $1, completion_percent = $2, updated_at = NOW() WHERE id = $3`,
      [taskStatus, taskCompletion, link.project_task_id]
    );
    await pool.query(
      `UPDATE project_work_order_links SET sync_status = 'synced', last_synced_at = NOW() WHERE id = $1`, [id]
    );
    if (link.project_id) {
      await recalculateProjectCompletion(link.project_id);
    }
    res.json({ success: true, taskStatus, woCompletion, taskCompletion });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Sync all work orders for a project (bidirectional bulk sync)
router.post("/projects-module/:projectId/sync-work-orders", requireErpAuth, async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const { rows: links } = await pool.query(
      `SELECT pwl.*, wo.completion_percentage, wo.status AS wo_status, pwl.project_task_id
       FROM project_work_order_links pwl
       LEFT JOIN production_work_orders wo ON wo.id = pwl.work_order_id
       LEFT JOIN project_tasks pt ON pt.id = pwl.project_task_id
       WHERE pt.project_id = $1`,
      [projectId]
    );
    let synced = 0;
    for (const link of links) {
      if (!link.wo_status) continue;
      const taskStatus = link.wo_status === "completed" ? "done" : link.wo_status === "in_progress" ? "in-progress" : "todo";
      const taskCompletion = link.wo_status === "completed" ? 100 : parseFloat(link.completion_percentage || "0");
      await pool.query(
        `UPDATE project_tasks SET status = $1, completion_percent = $2, updated_at = NOW() WHERE id = $3`,
        [taskStatus, taskCompletion, link.project_task_id]
      );
      await pool.query(
        `UPDATE project_work_order_links SET sync_status = 'synced', last_synced_at = NOW() WHERE id = $1`, [link.id]
      );
      synced++;
    }
    await recalculateProjectCompletion(projectId);
    res.json({ success: true, synced });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Auto-create work order from project task
router.post("/project-tasks/:taskId/create-work-order", requireErpAuth, async (req, res) => {
  try {
    const taskId = z.coerce.number().int().positive().parse(req.params.taskId);
    const { rows: tasks } = await pool.query(`SELECT * FROM project_tasks WHERE id = $1`, [taskId]);
    if (!tasks.length) return res.status(404).json({ error: "Task not found" });
    const task = tasks[0];
    const { rows: projects } = await pool.query(`SELECT * FROM projects WHERE id = $1 AND deleted_at IS NULL`, [task.project_id]);
    const project = projects[0] || {};
    const orderNumber = `WO-PT-${taskId}-${Date.now()}`;
    const { rows: workOrders } = await pool.query(
      `INSERT INTO production_work_orders (order_number, product_name, status, priority, notes, planned_start, planned_end, customer_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [orderNumber, task.title, "planned", task.priority || "medium",
       `Auto-created from project task: ${task.title} (Project: ${project.project_name || project.name || task.project_id})`,
       task.planned_start || task.due_date || null,
       task.planned_end || task.due_date || null,
       project.customer_name || project.client || null]
    );
    const workOrder = workOrders[0];
    const { rows: link } = await pool.query(
      `INSERT INTO project_work_order_links (project_task_id, work_order_id, link_type)
       VALUES ($1,$2,'auto_created')
       ON CONFLICT (project_task_id, work_order_id) DO UPDATE SET link_type = 'auto_created', updated_at = NOW()
       RETURNING *`,
      [taskId, workOrder.id]
    );
    res.status(201).json({ workOrder, link: link[0] });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

// Get available work orders for linking
router.get("/production-work-orders-list", requireErpAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, order_number, product_name, status, completion_percentage, planned_start, planned_end, customer_name FROM production_work_orders ORDER BY created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
