import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { biDashboardsTable, biWidgetsTable } from "@workspace/db/schema";
import { validateSession } from "../lib/auth";

const router = Router();

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}

router.use("/bi/dashboards", requireAuth as any);
router.use("/bi/widgets", requireAuth as any);

router.get("/bi/dashboards", async (_req: Request, res: Response) => {
  try {
    const dashboards = await db.select().from(biDashboardsTable).orderBy(desc(biDashboardsTable.createdAt));
    res.json(dashboards);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bi/dashboards/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [dashboard] = await db.select().from(biDashboardsTable).where(eq(biDashboardsTable.id, id));
    if (!dashboard) { res.status(404).json({ error: "לא נמצא" }); return; }
    const widgets = await db.select().from(biWidgetsTable).where(eq(biWidgetsTable.dashboardId, id));
    res.json({ ...dashboard, widgets });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bi/dashboards", async (req: Request, res: Response) => {
  try {
    const { name, slug, description, layoutConfig, roleAssignments, isDefault, isPublic } = req.body;
    if (!name) { res.status(400).json({ error: "שם חובה" }); return; }
    const [created] = await db.insert(biDashboardsTable).values({
      name,
      slug: slug || name.toLowerCase().replace(/[^\w]+/g, "-"),
      description: description || null,
      layoutConfig: layoutConfig || {},
      roleAssignments: roleAssignments || [],
      isDefault: !!isDefault,
      isPublic: !!isPublic,
      status: "active",
      updatedAt: new Date(),
    }).returning();
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/bi/dashboards/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, slug, description, layoutConfig, roleAssignments, isDefault, isPublic, status } = req.body;
    const [updated] = await db.update(biDashboardsTable)
      .set({ name, slug, description, layoutConfig, roleAssignments, isDefault, isPublic, status, updatedAt: new Date() })
      .where(eq(biDashboardsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/bi/dashboards/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(biDashboardsTable).where(eq(biDashboardsTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bi/widgets", async (req: Request, res: Response) => {
  try {
    const dashboardId = req.query.dashboardId ? parseInt(req.query.dashboardId as string) : null;
    if (dashboardId) {
      const widgets = await db.select().from(biWidgetsTable).where(eq(biWidgetsTable.dashboardId, dashboardId));
      res.json(widgets);
    } else {
      const widgets = await db.select().from(biWidgetsTable);
      res.json(widgets);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/bi/widgets", async (req: Request, res: Response) => {
  try {
    const { dashboardId, widgetType, title, reportId, dataSourceConfig, displayConfig, positionX, positionY, sizeW, sizeH } = req.body;
    if (!dashboardId || !title) { res.status(400).json({ error: "dashboardId ו-title חובה" }); return; }
    const [created] = await db.insert(biWidgetsTable).values({
      dashboardId,
      widgetType: widgetType || "kpi",
      title,
      reportId: reportId || null,
      dataSourceConfig: dataSourceConfig || {},
      displayConfig: displayConfig || {},
      positionX: positionX ?? 0,
      positionY: positionY ?? 0,
      sizeW: sizeW ?? 4,
      sizeH: sizeH ?? 3,
      updatedAt: new Date(),
    }).returning();
    res.json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/bi/widgets/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { widgetType, title, reportId, dataSourceConfig, displayConfig, positionX, positionY, sizeW, sizeH } = req.body;
    const [updated] = await db.update(biWidgetsTable)
      .set({ widgetType, title, reportId, dataSourceConfig, displayConfig, positionX, positionY, sizeW, sizeH, updatedAt: new Date() })
      .where(eq(biWidgetsTable.id, id))
      .returning();
    if (!updated) { res.status(404).json({ error: "לא נמצא" }); return; }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/bi/widgets/:id/position", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { positionX, positionY, sizeW, sizeH } = req.body;
    const [updated] = await db.update(biWidgetsTable)
      .set({ positionX, positionY, sizeW, sizeH, updatedAt: new Date() })
      .where(eq(biWidgetsTable.id, id))
      .returning();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/bi/widgets/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(biWidgetsTable).where(eq(biWidgetsTable.id, id));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/bi/hub", async (_req: Request, res: Response) => {
  try {
    const [reports, dashboards] = await Promise.all([
      db.execute(sql`SELECT id, name, slug, description, display_type, is_active, created_at, updated_at FROM report_definitions ORDER BY updated_at DESC`),
      db.select().from(biDashboardsTable).orderBy(desc(biDashboardsTable.updatedAt)),
    ]);
    res.json({
      reports: reports.rows || [],
      dashboards,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
