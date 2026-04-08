import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketingCampaignsTable, contentCalendarTable, socialMediaTable, emailMarketingTable, marketingBudgetTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
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

router.get("/marketing-campaigns", async (_req, res) => {
  try {
    const rows = await db.select().from(marketingCampaignsTable).orderBy(desc(marketingCampaignsTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/marketing-campaigns/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/marketing-campaigns", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(marketingCampaignsTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/marketing-campaigns/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(marketingCampaignsTable).set({ ...data, updatedAt: new Date() }).where(eq(marketingCampaignsTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/marketing-campaigns/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(marketingCampaignsTable).where(eq(marketingCampaignsTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/content-calendar-items", async (_req, res) => {
  try {
    const rows = await db.select().from(contentCalendarTable).orderBy(desc(contentCalendarTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/content-calendar-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(contentCalendarTable).where(eq(contentCalendarTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/content-calendar-items", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(contentCalendarTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/content-calendar-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(contentCalendarTable).set({ ...data, updatedAt: new Date() }).where(eq(contentCalendarTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/content-calendar-items/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(contentCalendarTable).where(eq(contentCalendarTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/social-media-posts", async (_req, res) => {
  try {
    const rows = await db.select().from(socialMediaTable).orderBy(desc(socialMediaTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/social-media-posts/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(socialMediaTable).where(eq(socialMediaTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/social-media-posts", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(socialMediaTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/social-media-posts/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(socialMediaTable).set({ ...data, updatedAt: new Date() }).where(eq(socialMediaTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/social-media-posts/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(socialMediaTable).where(eq(socialMediaTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/email-campaigns", async (_req, res) => {
  try {
    const rows = await db.select().from(emailMarketingTable).orderBy(desc(emailMarketingTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/email-campaigns/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(emailMarketingTable).where(eq(emailMarketingTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/email-campaigns", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(emailMarketingTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/email-campaigns/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(emailMarketingTable).set({ ...data, updatedAt: new Date() }).where(eq(emailMarketingTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/email-campaigns/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(emailMarketingTable).where(eq(emailMarketingTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.get("/marketing-budget-lines", async (_req, res) => {
  try {
    const rows = await db.select().from(marketingBudgetTable).orderBy(desc(marketingBudgetTable.createdAt));
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/marketing-budget-lines/aggregate", async (_req, res) => {
  try {
    const rows = await db.select({
      category: marketingBudgetTable.category,
      totalPlanned: sql<string>`SUM(CAST(${marketingBudgetTable.plannedAmount} AS NUMERIC))`,
      totalActual: sql<string>`SUM(CAST(${marketingBudgetTable.actualAmount} AS NUMERIC))`,
    }).from(marketingBudgetTable).groupBy(marketingBudgetTable.category);
    res.json(rows);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/marketing-budget-lines/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const [row] = await db.select().from(marketingBudgetTable).where(eq(marketingBudgetTable.id, id));
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.post("/marketing-budget-lines", async (req, res) => {
  try {
    const data = clean(req.body);
    const [row] = await db.insert(marketingBudgetTable).values(data).returning();
    res.status(201).json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.put("/marketing-budget-lines/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const data = clean(req.body);
    const [row] = await db.update(marketingBudgetTable).set({ ...data, updatedAt: new Date() }).where(eq(marketingBudgetTable.id, id)).returning();
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

router.delete("/marketing-budget-lines/:id", async (req, res) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    await db.delete(marketingBudgetTable).where(eq(marketingBudgetTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

export default router;
