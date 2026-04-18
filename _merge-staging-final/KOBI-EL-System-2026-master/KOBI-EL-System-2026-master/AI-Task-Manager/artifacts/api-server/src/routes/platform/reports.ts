import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { reportDefinitionsTable, entityRecordsTable, entityFieldsTable, entityStatusesTable, reportSnapshotsTable } from "@workspace/db/schema";
import { eq, desc, asc, and, sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

interface ReportColumn { slug: string; label?: string; name?: string; fieldType?: string }
interface ReportFilter { field: string; operator: string; value: string }
interface ReportSort { field: string; direction: string }
interface ReportAggregation { field: string; function: string; label?: string }
interface ReportGroup { field: string }

const ReportBody = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string().optional(),
  entityId: z.number().optional(),
  queryConfig: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  columns: z.array(z.object({ slug: z.string(), label: z.string().optional(), name: z.string().optional(), fieldType: z.string().optional() })).optional(),
  aggregations: z.array(z.object({ field: z.string(), function: z.string(), label: z.string().optional() })).optional(),
  grouping: z.array(z.object({ field: z.string() })).optional(),
  filters: z.array(z.object({ field: z.string(), operator: z.string(), value: z.string() })).optional(),
  sorting: z.array(z.object({ field: z.string(), direction: z.string() })).optional(),
  calculatedFields: z.array(z.object({ slug: z.string(), expression: z.string(), label: z.string().optional() })).optional(),
  displayType: z.string().optional(),
  chartConfig: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  scheduleConfig: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).nullable().optional(),
  scheduleEmail: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get("/platform/reports", async (_req, res) => {
  try {
    const reports = await db.select().from(reportDefinitionsTable).orderBy(desc(reportDefinitionsTable.createdAt));
    res.json(reports);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/reports", async (req, res) => {
  try {
    const body = ReportBody.parse(req.body);
    const [report] = await db.insert(reportDefinitionsTable).values(body).returning();
    res.status(201).json(report);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/reports/by-slug/:slug", async (req, res) => {
  try {
    const [report] = await db.select().from(reportDefinitionsTable).where(eq(reportDefinitionsTable.slug, req.params.slug));
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/reports/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [report] = await db.select().from(reportDefinitionsTable).where(eq(reportDefinitionsTable.id, id));
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.put("/platform/reports/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = ReportBody.partial().parse(req.body);
    const [report] = await db.update(reportDefinitionsTable).set({ ...body, updatedAt: new Date() }).where(eq(reportDefinitionsTable.id, id)).returning();
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  } catch (err: any) {
    if (err?.issues) return res.status(400).json({ message: "Validation error", errors: err.issues });
    res.status(500).json({ message: err.message });
  }
});

router.delete("/platform/reports/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await db.delete(reportDefinitionsTable).where(eq(reportDefinitionsTable.id, id));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

function applyRecordFilter(data: Record<string, unknown>, status: string | null, filter: ReportFilter): boolean {
  const fieldSlug = (filter as Record<string, string>).fieldSlug || filter.field;
  const rawVal = fieldSlug === "_status" ? status : data[fieldSlug];
  const val = String(rawVal ?? "");
  const filterVal = String(filter.value ?? "");

  switch (filter.operator) {
    case "equals": return val === filterVal;
    case "not_equals": return val !== filterVal;
    case "contains": return val.toLowerCase().includes(filterVal.toLowerCase());
    case "not_contains": return !val.toLowerCase().includes(filterVal.toLowerCase());
    case "starts_with": return val.toLowerCase().startsWith(filterVal.toLowerCase());
    case "gt": {
      if (rawVal === null || rawVal === undefined || rawVal === "") return false;
      return Number(rawVal) > Number(filter.value);
    }
    case "gte": {
      if (rawVal === null || rawVal === undefined || rawVal === "") return false;
      return Number(rawVal) >= Number(filter.value);
    }
    case "lt": {
      if (rawVal === null || rawVal === undefined || rawVal === "") return false;
      return Number(rawVal) < Number(filter.value);
    }
    case "lte": {
      if (rawVal === null || rawVal === undefined || rawVal === "") return false;
      return Number(rawVal) <= Number(filter.value);
    }
    case "is_empty": return rawVal === null || rawVal === undefined || rawVal === "";
    case "is_not_empty": return rawVal !== null && rawVal !== undefined && rawVal !== "";
    default: return true;
  }
}

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

router.post("/platform/reports/by-slug/:slug/generate", async (req, res) => {
  try {
    const [report] = await db.select().from(reportDefinitionsTable).where(eq(reportDefinitionsTable.slug, req.params.slug));
    if (!report) return res.status(404).json({ message: "Report not found" });
    const result = await generateReportData(report);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

async function generateReportData(report: any) {
  if (!report.entityId) {
    return { reportId: report.id, reportName: report.name, entityId: null, totalRecords: 0, columns: [], rows: [], aggregations: {}, groupedData: null, generatedAt: new Date().toISOString() };
  }

  const allRecords = await db.select({
    id: entityRecordsTable.id,
    entityId: entityRecordsTable.entityId,
    data: entityRecordsTable.data,
    status: entityRecordsTable.status,
    createdAt: entityRecordsTable.createdAt,
    updatedAt: entityRecordsTable.updatedAt,
  }).from(entityRecordsTable)
    .where(eq(entityRecordsTable.entityId, report.entityId));

  const filters = (report.filters as any[]) || [];
  const filteredRecords = allRecords.filter(rec => {
    const data = (rec.data as Record<string, any>) || {};
    return filters.every(f => applyRecordFilter(data, rec.status, f));
  });

  const fields = await db.select().from(entityFieldsTable)
    .where(eq(entityFieldsTable.entityId, report.entityId))
    .orderBy(asc(entityFieldsTable.sortOrder));

  const statuses = await db.select().from(entityStatusesTable)
    .where(eq(entityStatusesTable.entityId, report.entityId));

  const columns = (report.columns as any[]) || [];
  const columnFields = columns.length > 0
    ? columns.map((c: any) => {
        const f = fields.find(fld => fld.slug === (c.fieldSlug || c.field));
        return f ? { ...f, label: c.label || f.name } : null;
      }).filter(Boolean)
    : fields.filter(f => f.showInList);

  const sorting = (report.sorting as any[]) || [];
  let sortedRecords = [...filteredRecords];
  const numericTypes = new Set(["number", "integer", "decimal", "float", "currency", "percent"]);
  const dateTypes = new Set(["date", "datetime"]);
  for (const sort of sorting.reverse()) {
    const fieldSlug = sort.fieldSlug || sort.field;
    const dir = sort.direction || "asc";
    const fieldDef = fields.find(f => f.slug === fieldSlug);
    const isNumeric = fieldDef && numericTypes.has(fieldDef.fieldType);
    const isDate = fieldDef && dateTypes.has(fieldDef.fieldType);
    sortedRecords.sort((a, b) => {
      const aRaw = fieldSlug === "_status" ? (a.status || "") : (a.data as any)?.[fieldSlug];
      const bRaw = fieldSlug === "_status" ? (b.status || "") : (b.data as any)?.[fieldSlug];
      let cmp: number;
      if (isNumeric) {
        cmp = (Number(aRaw) || 0) - (Number(bRaw) || 0);
      } else if (isDate) {
        cmp = (new Date(aRaw || 0).getTime()) - (new Date(bRaw || 0).getTime());
      } else {
        cmp = String(aRaw || "").localeCompare(String(bRaw || ""), "he");
      }
      return dir === "desc" ? -cmp : cmp;
    });
  }

  const aggregations = (report.aggregations as any[]) || [];
  const aggregationResults: Record<string, any> = {};
  for (const agg of aggregations) {
    const fieldSlug = agg.fieldSlug || agg.field;
    const func = agg.function || agg.aggregation || "count";
    const values = sortedRecords.map(r => Number((r.data as any)?.[fieldSlug] || 0));
    aggregationResults[`${func}_${fieldSlug}`] = computeAggregate(func, values);
  }

  const grouping = (report.grouping as any[]) || [];
  let groupedData: Record<string, any[]> | null = null;
  if (grouping.length > 0) {
    groupedData = {};
    const groupField = grouping[0].fieldSlug || grouping[0].field;
    for (const rec of sortedRecords) {
      const data = (rec.data as Record<string, any>) || {};
      const key = groupField === "_status"
        ? (statuses.find((s: any) => s.slug === rec.status)?.name || rec.status || "unknown")
        : String(data[groupField] || "unknown");
      if (!groupedData[key]) groupedData[key] = [];
      groupedData[key].push(rec);
    }
  }

  const rows = sortedRecords.map(rec => {
    const data = (rec.data as Record<string, any>) || {};
    const row: Record<string, any> = { id: rec.id, status: rec.status };
    for (const col of columnFields) {
      if (col) {
        row[(col as any).slug] = data[(col as any).slug] ?? "";
      }
    }
    return row;
  });

  return {
    reportId: report.id,
    reportName: report.name,
    entityId: report.entityId,
    totalRecords: sortedRecords.length,
    columns: columnFields.map((c: any) => ({ slug: c.slug, name: c.label || c.name, fieldType: c.fieldType })),
    rows,
    aggregations: aggregationResults,
    groupedData: groupedData ? Object.entries(groupedData).map(([key, recs]) => ({
      group: key,
      count: recs.length,
      rows: recs.map(r => {
        const d = (r.data as Record<string, any>) || {};
        const row: Record<string, any> = { id: r.id, status: r.status };
        for (const col of columnFields) {
          if (col) row[(col as any).slug] = d[(col as any).slug] ?? "";
        }
        return row;
      }),
    })) : null,
    generatedAt: new Date().toISOString(),
  };
}

router.post("/platform/reports/:id/generate", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [report] = await db.select().from(reportDefinitionsTable).where(eq(reportDefinitionsTable.id, id));
    if (!report) return res.status(404).json({ message: "Report not found" });

    if (!report.entityId) {
      return res.status(400).json({ message: "Report has no entity configured" });
    }

    const allRecords = await db.select().from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, report.entityId));

    const filters = (report.filters as ReportFilter[]) || [];
    const filteredRecords = allRecords.filter(rec => {
      const data = (rec.data as Record<string, unknown>) || {};
      return filters.every(f => applyRecordFilter(data, rec.status, f));
    });

    const fields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, report.entityId))
      .orderBy(asc(entityFieldsTable.sortOrder));

    const statuses = await db.select().from(entityStatusesTable)
      .where(eq(entityStatusesTable.entityId, report.entityId));

    const columns = (report.columns as ReportColumn[]) || [];
    const columnFields = columns.length > 0
      ? columns.map(c => {
          const slug = (c as Record<string, string>).fieldSlug || c.slug;
          const f = fields.find(fld => fld.slug === slug);
          return f ? { ...f, label: c.label || f.name } : null;
        }).filter(Boolean)
      : fields.filter(f => f.showInList);

    const sorting = (report.sorting as ReportSort[]) || [];
    let sortedRecords = [...filteredRecords];
    const numericTypes = new Set(["number", "integer", "decimal", "float", "currency", "percent"]);
    const dateTypes = new Set(["date", "datetime"]);
    for (const sort of sorting.reverse()) {
      const fieldSlug = (sort as Record<string, string>).fieldSlug || sort.field;
      const dir = sort.direction || "asc";
      const fieldDef = fields.find(f => f.slug === fieldSlug);
      const isNumeric = fieldDef && numericTypes.has(fieldDef.fieldType);
      const isDate = fieldDef && dateTypes.has(fieldDef.fieldType);
      sortedRecords.sort((a, b) => {
        const aData = (a.data as Record<string, unknown>) || {};
        const bData = (b.data as Record<string, unknown>) || {};
        const aRaw = fieldSlug === "_status" ? (a.status || "") : aData[fieldSlug];
        const bRaw = fieldSlug === "_status" ? (b.status || "") : bData[fieldSlug];
        let cmp: number;
        if (isNumeric) {
          cmp = (Number(aRaw) || 0) - (Number(bRaw) || 0);
        } else if (isDate) {
          cmp = (new Date(String(aRaw || 0)).getTime()) - (new Date(String(bRaw || 0)).getTime());
        } else {
          cmp = String(aRaw || "").localeCompare(String(bRaw || ""), "he");
        }
        return dir === "desc" ? -cmp : cmp;
      });
    }

    const aggregations = (report.aggregations as ReportAggregation[]) || [];
    const aggregationResults: Record<string, number> = {};
    for (const agg of aggregations) {
      const fieldSlug = (agg as Record<string, string>).fieldSlug || agg.field;
      const func = agg.function || "count";
      const values = sortedRecords.map(r => Number(((r.data as Record<string, unknown>) || {})[fieldSlug] || 0));
      aggregationResults[`${func}_${fieldSlug}`] = computeAggregate(func, values);
    }

    const grouping = (report.grouping as ReportGroup[]) || [];
    let groupedData: Record<string, any[]> | null = null;
    if (grouping.length > 0) {
      groupedData = {};
      const groupField = (grouping[0] as Record<string, string>).fieldSlug || grouping[0].field;
      for (const rec of sortedRecords) {
        const data = (rec.data as Record<string, unknown>) || {};
        const key = groupField === "_status"
          ? (statuses.find(s => s.slug === rec.status)?.name || rec.status || "unknown")
          : String(data[groupField] || "unknown");
        if (!groupedData[key]) groupedData[key] = [];
        groupedData[key].push(rec);
      }
    }

    const rows = sortedRecords.map(rec => {
      const data = (rec.data as Record<string, unknown>) || {};
      const row: Record<string, unknown> = { id: rec.id, status: rec.status };
      for (const col of columnFields) {
        if (col) {
          row[col.slug] = data[col.slug] ?? "";
        }
      }
      return row;
    });

    const result = {
      reportId: report.id,
      reportName: report.name,
      entityId: report.entityId,
      totalRecords: sortedRecords.length,
      columns: columnFields.map(c => ({ slug: c!.slug, name: c!.label || c!.name, fieldType: c!.fieldType })),
      rows,
      aggregations: aggregationResults,
      groupedData: groupedData ? Object.entries(groupedData).map(([key, recs]) => ({
        group: key,
        count: recs.length,
        rows: recs.map(r => {
          const d = (r.data as Record<string, unknown>) || {};
          const row: Record<string, unknown> = { id: r.id, status: r.status };
          for (const col of columnFields) {
            if (col) row[col.slug] = d[col.slug] ?? "";
          }
          return row;
        }),
      })) : null,
      generatedAt: new Date().toISOString(),
    };

    await db.insert(reportSnapshotsTable).values({
      reportId: report.id,
      snapshotData: result,
      totalRecords: sortedRecords.length,
    }).catch(() => {});

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/platform/reports/:id/snapshots", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const snapshots = await db.select().from(reportSnapshotsTable)
      .where(eq(reportSnapshotsTable.reportId, id))
      .orderBy(desc(reportSnapshotsTable.createdAt))
      .limit(20);
    res.json(snapshots);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/platform/reports/:id/export", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [report] = await db.select().from(reportDefinitionsTable).where(eq(reportDefinitionsTable.id, id));
    if (!report) return res.status(404).json({ message: "Report not found" });

    if (!report.entityId) {
      return res.status(400).json({ message: "Report has no entity configured" });
    }

    const format = req.body.format || "csv";

    const allRecords = await db.select().from(entityRecordsTable)
      .where(eq(entityRecordsTable.entityId, report.entityId));

    const filters = (report.filters as ReportFilter[]) || [];
    const filteredRecords = allRecords.filter(rec => {
      const data = (rec.data as Record<string, unknown>) || {};
      return filters.every(f => applyRecordFilter(data, rec.status, f));
    });

    const fields = await db.select().from(entityFieldsTable)
      .where(eq(entityFieldsTable.entityId, report.entityId))
      .orderBy(asc(entityFieldsTable.sortOrder));

    const columns = (report.columns as ReportColumn[]) || [];
    const columnFields = columns.length > 0
      ? columns.map(c => fields.find(f => f.slug === ((c as Record<string, string>).fieldSlug || c.slug))).filter(Boolean)
      : fields.filter(f => f.showInList);

    if (format === "csv") {
      const headerRow = ["ID", "Status", ...columnFields.map(c => c!.name)].join(",");
      const dataRows = filteredRecords.map(rec => {
        const data = (rec.data as Record<string, unknown>) || {};
        const values = [
          rec.id,
          rec.status || "",
          ...columnFields.map(c => {
            const val = data[c!.slug];
            const str = val === null || val === undefined ? "" : String(val);
            return str.includes(",") ? `"${str.replace(/"/g, '""')}"` : str;
          }),
        ];
        return values.join(",");
      });

      const csvContent = [headerRow, ...dataRows].join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${report.slug}-export.csv"`);
      res.send("\uFEFF" + csvContent);
    } else {
      res.json({
        reportId: id,
        format,
        totalRecords: filteredRecords.length,
        data: filteredRecords.map(rec => ({
          id: rec.id,
          status: rec.status,
          ...(rec.data as Record<string, any>),
        })),
      });
    }
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
