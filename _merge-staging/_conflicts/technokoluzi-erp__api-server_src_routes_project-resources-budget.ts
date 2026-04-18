import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { projectResourcesTable, projectBudgetLinesTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
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
    const [row] = await db.insert(projectResourcesTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/project-resources/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(projectResourcesTable).set({ ...data, updatedAt: new Date() }).where(eq(projectResourcesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
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

export default router;
