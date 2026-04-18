import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { strategicGoalsTable, swotItemsTable, bscObjectivesTable, competitiveAnalysesTable, businessPlanSectionsTable } from "@workspace/db/schema";
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

router.get("/strategic-goals", async (_req, res) => {
  try {
    const rows = await db.select().from(strategicGoalsTable).orderBy(desc(strategicGoalsTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/strategic-goals/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(strategicGoalsTable).where(eq(strategicGoalsTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/strategic-goals", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(strategicGoalsTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/strategic-goals/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(strategicGoalsTable).set({ ...data, updatedAt: new Date() }).where(eq(strategicGoalsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/strategic-goals/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(strategicGoalsTable).where(eq(strategicGoalsTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/swot-items", async (_req, res) => {
  try {
    const rows = await db.select().from(swotItemsTable).orderBy(desc(swotItemsTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/swot-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(swotItemsTable).where(eq(swotItemsTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/swot-items", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(swotItemsTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/swot-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(swotItemsTable).set({ ...data, updatedAt: new Date() }).where(eq(swotItemsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/swot-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(swotItemsTable).where(eq(swotItemsTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/bsc-objectives", async (_req, res) => {
  try {
    const rows = await db.select().from(bscObjectivesTable).orderBy(desc(bscObjectivesTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/bsc-objectives/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(bscObjectivesTable).where(eq(bscObjectivesTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/bsc-objectives", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(bscObjectivesTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/bsc-objectives/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(bscObjectivesTable).set({ ...data, updatedAt: new Date() }).where(eq(bscObjectivesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/bsc-objectives/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(bscObjectivesTable).where(eq(bscObjectivesTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/competitive-analyses", async (_req, res) => {
  try {
    const rows = await db.select().from(competitiveAnalysesTable).orderBy(desc(competitiveAnalysesTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/competitive-analyses/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(competitiveAnalysesTable).where(eq(competitiveAnalysesTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/competitive-analyses", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(competitiveAnalysesTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/competitive-analyses/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(competitiveAnalysesTable).set({ ...data, updatedAt: new Date() }).where(eq(competitiveAnalysesTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/competitive-analyses/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(competitiveAnalysesTable).where(eq(competitiveAnalysesTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/business-plan-sections", async (_req, res) => {
  try {
    const rows = await db.select().from(businessPlanSectionsTable).orderBy(businessPlanSectionsTable.order);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/business-plan-sections/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(businessPlanSectionsTable).where(eq(businessPlanSectionsTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/business-plan-sections", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(businessPlanSectionsTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/business-plan-sections/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(businessPlanSectionsTable).set({ ...data, updatedAt: new Date() }).where(eq(businessPlanSectionsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/business-plan-sections/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(businessPlanSectionsTable).where(eq(businessPlanSectionsTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
