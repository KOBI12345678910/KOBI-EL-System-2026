import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { projectResourcesTable, projectBudgetLinesTable } from "@workspace/db/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function clean(body: any) {
  const c = { ...body };
  for (const k of Object.keys(c)) {
    if (c[k] === "") c[k] = null;
  }
  delete c.id;
  delete c.createdAt;
  delete c.updatedAt;
  return c;
}

async function detectOverallocation(employeeId: number | null, employeeName: string | null, projectId: number, startDate: string | null, endDate: string | null, excludeId?: number): Promise<{ hasConflict: boolean; conflictDetails: string | null }> {
  if (!employeeId && !employeeName) return { hasConflict: false, conflictDetails: null };
  try {
    let query = `
      SELECT pr.project_id, pr.allocation_pct, p.project_name
      FROM project_resources pr
      LEFT JOIN projects p ON p.id = pr.project_id
      WHERE pr.project_id != $1
    `;
    const params: any[] = [projectId];
    let idx = 2;
    if (employeeId) {
      query += ` AND pr.employee_id = $${idx++}`;
      params.push(employeeId);
    } else if (employeeName) {
      query += ` AND LOWER(pr.name) = LOWER($${idx++})`;
      params.push(employeeName);
    }
    if (excludeId) {
      query += ` AND pr.id != $${idx++}`;
      params.push(excludeId);
    }
    if (startDate && endDate) {
      query += ` AND (pr.start_date IS NULL OR pr.start_date <= $${idx++}) AND (pr.end_date IS NULL OR pr.end_date >= $${idx++})`;
      params.push(endDate, startDate);
    }
    const { rows } = await pool.query(query, params);
    const totalPct = rows.reduce((s: number, r: any) => s + parseFloat(r.allocation_pct || "0"), 0);
    if (totalPct > 100) {
      const projects = rows.map((r: any) => r.project_name || `Project ${r.project_id}`).join(", ");
      return {
        hasConflict: true,
        conflictDetails: `Overallocated: ${totalPct.toFixed(0)}% across projects: ${projects}`,
      };
    }
    return { hasConflict: false, conflictDetails: null };
  } catch {
    return { hasConflict: false, conflictDetails: null };
  }
}

router.get("/project-resources", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (projectId) {
      const rows = await db.select().from(projectResourcesTable).where(eq(projectResourcesTable.projectId, projectId)).orderBy(desc(projectResourcesTable.createdAt));
      return res.json(rows);
    }
    const rows = await db.select().from(projectResourcesTable).orderBy(desc(projectResourcesTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/project-resources/conflicts", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT pr.*, p.project_name AS project_label
      FROM project_resources pr
      LEFT JOIN projects p ON p.id = pr.project_id
      WHERE pr.has_conflict = true
      ORDER BY pr.updated_at DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/project-resources/utilization", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COALESCE(pr.name, 'Unknown') AS name,
        pr.employee_id,
        pr.resource_type,
        COUNT(DISTINCT pr.project_id) AS project_count,
        SUM(CAST(COALESCE(pr.allocation_pct, 0) AS NUMERIC)) AS total_allocation_pct,
        MAX(CAST(COALESCE(pr.allocation_pct, 0) AS NUMERIC)) AS max_allocation_pct,
        bool_or(pr.has_conflict) AS has_conflict
      FROM project_resources pr
      GROUP BY pr.name, pr.employee_id, pr.resource_type
      ORDER BY total_allocation_pct DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/project-resources/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(projectResourcesTable).where(eq(projectResourcesTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-resources", async (req, res) => {
  try {
    const data = clean(req.body);
    const conflict = await detectOverallocation(
      data.employeeId || data.employee_id || null,
      data.name || null,
      data.projectId || data.project_id,
      data.startDate || data.start_date || null,
      data.endDate || data.end_date || null,
    );
    data.hasConflict = conflict.hasConflict;
    data.conflictDetails = conflict.conflictDetails;
    const [row] = await db.insert(projectResourcesTable).values(data).returning();
    res.status(201).json({ ...row, conflicts: conflict });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-resources/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const conflict = await detectOverallocation(
      data.employeeId || data.employee_id || null,
      data.name || null,
      data.projectId || data.project_id,
      data.startDate || data.start_date || null,
      data.endDate || data.end_date || null,
      id,
    );
    data.hasConflict = conflict.hasConflict;
    data.conflictDetails = conflict.conflictDetails;
    const [row] = await db.update(projectResourcesTable).set({ ...data, updatedAt: new Date() }).where(eq(projectResourcesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json({ ...row, conflicts: conflict });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-resources/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(projectResourcesTable).where(eq(projectResourcesTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/project-budget-lines", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (projectId) {
      const rows = await db.select().from(projectBudgetLinesTable).where(eq(projectBudgetLinesTable.projectId, projectId)).orderBy(desc(projectBudgetLinesTable.createdAt));
      return res.json(rows);
    }
    const rows = await db.select().from(projectBudgetLinesTable).orderBy(desc(projectBudgetLinesTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/project-budget-lines/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(projectBudgetLinesTable).where(eq(projectBudgetLinesTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-budget-lines", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(projectBudgetLinesTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-budget-lines/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(projectBudgetLinesTable).set({ ...data, updatedAt: new Date() }).where(eq(projectBudgetLinesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-budget-lines/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(projectBudgetLinesTable).where(eq(projectBudgetLinesTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

function calcEvm(pv: number, ev: number, ac: number, bac: number) {
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv > 0 ? ev / pv : null;
  const cv = ev - ac;
  const sv = ev - pv;
  const eac = cpi && cpi > 0 ? bac / cpi : bac - ev + ac;
  const etc = eac - ac;
  const vac = bac - eac;
  return { pv, ev, ac, cpi, spi, cv, sv, eac, etc, vac };
}

router.get("/project-evm/:projectId", async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const { rows: lines } = await pool.query(
      `SELECT * FROM project_budget_lines WHERE project_id = $1`, [projectId]
    );
    const { rows: projectRows } = await pool.query(
      `SELECT completion_pct, estimated_revenue FROM projects WHERE id = $1`, [projectId]
    );
    const project = projectRows[0] || {};
    const completionPct = parseFloat(project.completion_pct || "0") / 100;
    const bac = lines.reduce((s: number, l: any) => s + parseFloat(l.planned_amount || "0"), 0);
    const pv = lines.reduce((s: number, l: any) => s + parseFloat(l.planned_value || l.planned_amount || "0"), 0);
    const ev = lines.reduce((s: number, l: any) => {
      const planned = parseFloat(l.planned_amount || "0");
      return s + (parseFloat(l.earned_value || "0") || planned * completionPct);
    }, 0);
    const ac = lines.reduce((s: number, l: any) => s + parseFloat(l.actual_amount || "0"), 0);
    const evm = calcEvm(pv, ev, ac, bac);
    const totalPlanned = lines.reduce((s: number, l: any) => s + parseFloat(l.planned_amount || "0"), 0);
    const budgetUtilization = totalPlanned > 0 ? (ac / totalPlanned) * 100 : 0;
    const alerts: string[] = [];
    if (budgetUtilization >= 100) alerts.push("budget_exceeded");
    else if (budgetUtilization >= 80) alerts.push("budget_warning_80");
    if (evm.cpi !== null && evm.cpi < 0.9) alerts.push("cost_overrun");
    if (evm.spi !== null && evm.spi < 0.9) alerts.push("schedule_delay");
    res.json({ ...evm, bac, completionPct: completionPct * 100, budgetUtilization, alerts, lines });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/project-evm/:projectId/snapshot", async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const { rows: lines } = await pool.query(
      `SELECT * FROM project_budget_lines WHERE project_id = $1`, [projectId]
    );
    const { rows: projectRows } = await pool.query(
      `SELECT completion_pct FROM projects WHERE id = $1`, [projectId]
    );
    const project = projectRows[0] || {};
    const completionPct = parseFloat(project.completion_pct || "0") / 100;
    const bac = lines.reduce((s: number, l: any) => s + parseFloat(l.planned_amount || "0"), 0);
    const pv = lines.reduce((s: number, l: any) => s + parseFloat(l.planned_value || l.planned_amount || "0"), 0);
    const ev = lines.reduce((s: number, l: any) => {
      const planned = parseFloat(l.planned_amount || "0");
      return s + (parseFloat(l.earned_value || "0") || planned * completionPct);
    }, 0);
    const ac = lines.reduce((s: number, l: any) => s + parseFloat(l.actual_amount || "0"), 0);
    const evm = calcEvm(pv, ev, ac, bac);
    const snapshotDate = new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `INSERT INTO project_evm_snapshots (project_id, snapshot_date, pv, ev, ac, cpi, spi, eac, etc, vac, cv, sv, completion_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [projectId, snapshotDate, evm.pv, evm.ev, evm.ac, evm.cpi, evm.spi, evm.eac, evm.etc, evm.vac, evm.cv, evm.sv, completionPct * 100]
    );
    res.status(201).json(rows[0]);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/project-evm/:projectId/history", async (req, res) => {
  try {
    const projectId = z.coerce.number().int().positive().parse(req.params.projectId);
    const { rows } = await pool.query(
      `SELECT * FROM project_evm_snapshots WHERE project_id = $1 ORDER BY snapshot_date ASC`, [projectId]
    );
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
