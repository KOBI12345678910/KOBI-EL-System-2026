import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
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
    if (projectId) {
      const rows = await db.select().from(timesheetEntriesTable).where(eq(timesheetEntriesTable.projectId, projectId)).orderBy(desc(timesheetEntriesTable.date));
      return res.json(rows);
    }
    if (employee) {
      const rows = await db.select().from(timesheetEntriesTable).where(eq(timesheetEntriesTable.employee, employee)).orderBy(desc(timesheetEntriesTable.date));
      return res.json(rows);
    }
    const rows = await db.select().from(timesheetEntriesTable).orderBy(desc(timesheetEntriesTable.date));
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
    const [row] = await db.insert(timesheetEntriesTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/timesheet-entries/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(timesheetEntriesTable).set({ ...data, updatedAt: new Date() }).where(eq(timesheetEntriesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/timesheet-entries/:id/submit", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.update(timesheetEntriesTable).set({ status: "submitted", updatedAt: new Date() }).where(eq(timesheetEntriesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.patch("/timesheet-entries/:id/approve", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const approvedBy = req.body.approvedBy || "manager";
    const [row] = await db.update(timesheetEntriesTable).set({ status: "approved", approvedBy, updatedAt: new Date() }).where(eq(timesheetEntriesTable.id, id)).returning();
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
