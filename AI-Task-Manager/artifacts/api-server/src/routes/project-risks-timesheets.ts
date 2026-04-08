import { Router, type IRouter } from "express";
import { db, pool } from "@workspace/db";
import { projectRisksTable, timesheetEntriesTable } from "@workspace/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
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

router.get("/project-risks", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    if (projectId) {
      const rows = await db.select().from(projectRisksTable).where(eq(projectRisksTable.projectId, projectId)).orderBy(desc(projectRisksTable.createdAt));
      return res.json(rows);
    }
    const rows = await db.select().from(projectRisksTable).orderBy(desc(projectRisksTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/project-risks/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(projectRisksTable).where(eq(projectRisksTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/project-risks", async (req, res) => {
  try {
    const data = clean(req.body);
    if (data.probability && data.impact) {
      const pMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
      const iMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
      data.riskScore = String((pMap[data.probability] || 2) * (iMap[data.impact] || 2));
    }
    const [row] = await db.insert(projectRisksTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-risks/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    if (data.probability && data.impact) {
      const pMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
      const iMap: Record<string, number> = { low: 1, medium: 2, high: 3 };
      data.riskScore = String((pMap[data.probability] || 2) * (iMap[data.impact] || 2));
    }
    const [row] = await db.update(projectRisksTable).set({ ...data, updatedAt: new Date() }).where(eq(projectRisksTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/project-risks/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(projectRisksTable).where(eq(projectRisksTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/timesheet-entries", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    const employee = req.query.employee as string | undefined;
    const approvalStatus = req.query.approvalStatus as string | undefined;
    const billable = req.query.billable;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (projectId) { conditions.push(`project_id = $${idx++}`); params.push(projectId); }
    if (employee) { conditions.push(`LOWER(employee) = LOWER($${idx++})`); params.push(employee); }
    if (approvalStatus) { conditions.push(`approval_status = $${idx++}`); params.push(approvalStatus); }
    if (billable !== undefined) { conditions.push(`billable = $${idx++}`); params.push(billable === "true"); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query(`SELECT * FROM timesheet_entries ${where} ORDER BY date DESC`, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/timesheet-entries/weekly-grid", async (req, res) => {
  try {
    const weekEndingStr = req.query.weekEnding as string;
    const employee = req.query.employee as string | undefined;
    if (!weekEndingStr) return res.status(400).json({ error: "weekEnding required (YYYY-MM-DD)" });
    const weekEnding = new Date(weekEndingStr);
    const weekStart = new Date(weekEnding);
    weekStart.setDate(weekEnding.getDate() - 6);
    const startStr = weekStart.toISOString().slice(0, 10);
    const endStr = weekEnding.toISOString().slice(0, 10);
    const params: any[] = [startStr, endStr];
    let employeeFilter = "";
    if (employee) {
      employeeFilter = ` AND LOWER(te.employee) = LOWER($3)`;
      params.push(employee);
    }
    const { rows } = await pool.query(`
      SELECT
        te.employee,
        te.project_id,
        COALESCE(p.project_name, te.project_id::text) AS project_name,
        te.task_id,
        te.date,
        te.hours,
        te.billable,
        te.hourly_rate,
        te.billable_amount,
        te.approval_status,
        te.description
      FROM timesheet_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.date >= $1 AND te.date <= $2
      ${employeeFilter}
      ORDER BY te.employee, te.project_id, te.date
    `, params);

    const grid: Record<string, any> = {};
    for (const r of rows) {
      const key = `${r.employee}||${r.project_id}`;
      if (!grid[key]) {
        grid[key] = {
          employee: r.employee,
          projectId: r.project_id,
          projectName: r.project_name,
          days: {} as Record<string, number>,
          totalHours: 0,
          billableHours: 0,
          approvalStatus: r.approval_status,
        };
      }
      grid[key].days[r.date] = (grid[key].days[r.date] || 0) + parseFloat(r.hours || "0");
      grid[key].totalHours += parseFloat(r.hours || "0");
      if (r.billable) grid[key].billableHours += parseFloat(r.hours || "0");
    }
    res.json({ weekStart: startStr, weekEnd: endStr, grid: Object.values(grid) });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/timesheet-entries/approval-queue", async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT te.*, COALESCE(p.project_name, te.project_id::text) AS project_label
      FROM timesheet_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.approval_status = 'submitted'
      ORDER BY te.date DESC
    `);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/timesheet-entries/billable-report", async (req, res) => {
  try {
    const projectId = req.query.projectId ? z.coerce.number().parse(req.query.projectId) : null;
    let query = `
      SELECT
        te.employee,
        te.project_id,
        COALESCE(p.project_name, te.project_id::text) AS project_name,
        SUM(CASE WHEN te.billable THEN CAST(te.hours AS NUMERIC) ELSE 0 END) AS billable_hours,
        SUM(CASE WHEN NOT te.billable THEN CAST(te.hours AS NUMERIC) ELSE 0 END) AS non_billable_hours,
        SUM(CAST(te.hours AS NUMERIC)) AS total_hours,
        SUM(COALESCE(CAST(te.billable_amount AS NUMERIC), 0)) AS total_billable_amount
      FROM timesheet_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE te.approval_status IN ('submitted', 'approved')
    `;
    const params: any[] = [];
    if (projectId) { query += ` AND te.project_id = $1`; params.push(projectId); }
    query += ` GROUP BY te.employee, te.project_id, project_name ORDER BY total_hours DESC`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/timesheet-entries/weekly-summary", async (req, res) => {
  try {
    const rows = await db.select({
      employee: timesheetEntriesTable.employee,
      totalHours: sql<string>`SUM(CAST(${timesheetEntriesTable.hours} AS NUMERIC))`,
      entryCount: sql<number>`COUNT(*)`,
    }).from(timesheetEntriesTable).groupBy(timesheetEntriesTable.employee);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/timesheet-entries/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(timesheetEntriesTable).where(eq(timesheetEntriesTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/timesheet-entries", async (req, res) => {
  try {
    const data = clean(req.body);
    if (data.billable && data.hourlyRate && data.hours) {
      data.billableAmount = String(parseFloat(data.hours) * parseFloat(data.hourlyRate));
    }
    if (!data.approvalStatus) data.approvalStatus = data.status || "draft";
    const [row] = await db.insert(timesheetEntriesTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/timesheet-entries/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    if (data.billable && data.hourlyRate && data.hours) {
      data.billableAmount = String(parseFloat(data.hours) * parseFloat(data.hourlyRate));
    }
    const [row] = await db.update(timesheetEntriesTable).set({ ...data, updatedAt: new Date() }).where(eq(timesheetEntriesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/timesheet-entries/:id/submit", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.update(timesheetEntriesTable).set({
      status: "submitted",
      approvalStatus: "submitted",
      updatedAt: new Date(),
    }).where(eq(timesheetEntriesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/timesheet-entries/:id/approve", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const approvedBy = req.body.approvedBy || req.body.approved_by || "manager";
    const approvedById = req.body.approvedById || req.body.approved_by_id || null;
    const [row] = await db.update(timesheetEntriesTable).set({
      status: "approved",
      approvalStatus: "approved",
      approvedBy,
      approvedById,
      approvedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(timesheetEntriesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/timesheet-entries/:id/reject", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const rejectionComment = req.body.comment || req.body.rejectionComment || "";
    const [row] = await db.update(timesheetEntriesTable).set({
      status: "rejected",
      approvalStatus: "rejected",
      rejectionComment,
      updatedAt: new Date(),
    }).where(eq(timesheetEntriesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/timesheet-entries/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(timesheetEntriesTable).where(eq(timesheetEntriesTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
