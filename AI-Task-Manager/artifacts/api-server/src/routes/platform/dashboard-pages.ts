import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { systemDashboardPagesTable, systemDashboardWidgetsTable, entityRecordsTable, entityFieldsTable, entityStatusesTable, recordAuditLogTable } from "@workspace/db/schema";
import { eq, asc, desc, sql, and } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const IdParam = z.coerce.number().int().positive();

const CreateDashboardPageBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  moduleId: z.number().int().optional(),
  isDefault: z.boolean().optional(),
  layout: z.record(z.string(), z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const CreateDashboardWidgetBody = z.object({
  widgetType: z.string().min(1),
  title: z.string().min(1),
  entityId: z.number().int().nullable().optional(),
  config: z.record(z.string(), z.any()).optional(),
  position: z.number().int().optional(),
  size: z.string().optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

router.get("/platform/dashboard-pages", async (_req, res) => {
  try {
    const pages = await db.select().from(systemDashboardPagesTable)
      .orderBy(asc(systemDashboardPagesTable.createdAt));
    res.json(pages);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/dashboard-pages", async (req, res) => {
  try {
    const body = CreateDashboardPageBody.parse(req.body);
    const [page] = await db.insert(systemDashboardPagesTable).values(body).returning();
    res.status(201).json(page);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/dashboard-pages/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateDashboardPageBody.partial().parse(req.body);
    const [page] = await db.update(systemDashboardPagesTable)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(systemDashboardPagesTable.id, id))
      .returning();
    if (!page) return res.status(404).json({ message: "Dashboard page not found" });
    res.json(page);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/dashboard-pages/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(systemDashboardPagesTable).where(eq(systemDashboardPagesTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/dashboard-pages/:dashboardId/widgets", async (req, res) => {
  try {
    const dashboardId = IdParam.parse(req.params.dashboardId);
    const widgets = await db.select().from(systemDashboardWidgetsTable)
      .where(eq(systemDashboardWidgetsTable.dashboardId, dashboardId))
      .orderBy(asc(systemDashboardWidgetsTable.createdAt));
    res.json(widgets);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/dashboard-pages/:dashboardId/widgets", async (req, res) => {
  try {
    const dashboardId = IdParam.parse(req.params.dashboardId);
    const body = CreateDashboardWidgetBody.parse(req.body);
    const [widget] = await db.insert(systemDashboardWidgetsTable).values({ ...body, dashboardId }).returning();
    res.status(201).json(widget);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/dashboard-widgets/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    const body = CreateDashboardWidgetBody.partial().parse(req.body);
    const [widget] = await db.update(systemDashboardWidgetsTable)
      .set(body)
      .where(eq(systemDashboardWidgetsTable.id, id))
      .returning();
    if (!widget) return res.status(404).json({ message: "Widget not found" });
    res.json(widget);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/dashboard-widgets/:id", async (req, res) => {
  try {
    const id = IdParam.parse(req.params.id);
    await db.delete(systemDashboardWidgetsTable).where(eq(systemDashboardWidgetsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

function computeAggregate(func: string, values: number[]): number {
  const nums = values.filter(v => !isNaN(v));
  if (nums.length === 0) return 0;
  switch (func) {
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min": return Math.min(...nums);
    case "max": return Math.max(...nums);
    case "count": return nums.length;
    default: return nums.length;
  }
}

router.post("/platform/dashboard-data", async (req, res) => {
  try {
    const { widgetType, entityId, config } = req.body;

    if (widgetType === "kpi_card" || widgetType === "counter") {
      if (!entityId) {
        return res.json({ value: 0, label: config?.label || "" });
      }
      const aggregation = config?.aggregation || "count";
      const fieldSlug = config?.fieldSlug;
      const statusFilter = config?.statusFilter;

      const conditions = [eq(entityRecordsTable.entityId, entityId)];
      if (statusFilter) conditions.push(eq(entityRecordsTable.status, statusFilter));

      if (aggregation === "count") {
        const result = await db.select({ count: sql<number>`count(*)::int` })
          .from(entityRecordsTable)
          .where(and(...conditions));
        return res.json({ value: result[0]?.count || 0, label: config?.label || "רשומות" });
      }

      const records = await db.select({ id: entityRecordsTable.id, data: entityRecordsTable.data, status: entityRecordsTable.status }).from(entityRecordsTable).where(and(...conditions));
      const values = records.map(r => Number((r.data as any)?.[fieldSlug] || 0));
      const value = computeAggregate(aggregation, values);
      return res.json({ value: Math.round(value * 100) / 100, label: config?.label || "" });
    }

    if (widgetType === "chart_bar" || widgetType === "chart_line" || widgetType === "chart_pie") {
      if (!entityId) {
        return res.json({ labels: [], datasets: [{ data: [] }] });
      }

      const groupByField = config?.groupByField || "_status";
      const aggregation = config?.aggregation || "count";
      const valueField = config?.valueField;

      const records = await db.select({ id: entityRecordsTable.id, data: entityRecordsTable.data, status: entityRecordsTable.status }).from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, entityId));

      const groups: Record<string, number[]> = {};
      for (const rec of records) {
        const data = rec.data as Record<string, any>;
        const groupKey = groupByField === "_status" ? (rec.status || "unknown") : String(data?.[groupByField] || "unknown");
        if (!groups[groupKey]) groups[groupKey] = [];

        if (aggregation === "count") {
          groups[groupKey].push(1);
        } else if (valueField) {
          groups[groupKey].push(Number(data?.[valueField] || 0));
        } else {
          groups[groupKey].push(1);
        }
      }

      let labels: string[] = [];
      let statuses: any[] = [];

      if (groupByField === "_status") {
        statuses = await db.select().from(entityStatusesTable)
          .where(eq(entityStatusesTable.entityId, entityId));
        labels = Object.keys(groups).map(key => {
          const s = statuses.find((st: any) => st.slug === key);
          return s ? s.name : key;
        });
      } else {
        labels = Object.keys(groups);
      }

      const dataValues = Object.values(groups).map(vals => computeAggregate(aggregation, vals));

      return res.json({ labels, datasets: [{ data: dataValues }] });
    }

    if (widgetType === "data_table") {
      if (!entityId) {
        return res.json({ records: [], fields: [] });
      }
      const limit = config?.limit || 10;
      const records = await db.select({ id: entityRecordsTable.id, data: entityRecordsTable.data, status: entityRecordsTable.status, createdAt: entityRecordsTable.createdAt }).from(entityRecordsTable)
        .where(eq(entityRecordsTable.entityId, entityId))
        .orderBy(desc(entityRecordsTable.createdAt))
        .limit(limit);

      const fields = await db.select().from(entityFieldsTable)
        .where(eq(entityFieldsTable.entityId, entityId))
        .orderBy(asc(entityFieldsTable.sortOrder));

      const listFields = fields.filter(f => f.showInList).slice(0, 5);
      return res.json({ records, fields: listFields });
    }

    if (widgetType === "recent_activity") {
      const entityFilter = entityId ? eq(recordAuditLogTable.entityId, entityId) : undefined;
      const limit = config?.limit || 10;

      let query = db.select().from(recordAuditLogTable).$dynamic();
      if (entityFilter) query = query.where(entityFilter);
      const logs = await query.orderBy(desc(recordAuditLogTable.createdAt)).limit(limit);

      return res.json({ logs });
    }

    res.json({ message: "Unknown widget type" });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
