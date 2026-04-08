import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  integrationConnectionsTable,
  integrationSyncLogsTable,
} from "@workspace/db/schema";
import { eq, desc, gte } from "drizzle-orm";

const router = Router();

interface QueryRow {
  [key: string]: unknown;
}

function safeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const ENTITY_TABLES: Record<string, { table: string; columns: string[] }> = {
  customers: {
    table: "customers",
    columns: ["name", "email", "phone", "address", "city", "contact_person", "tax_id", "notes"],
  },
  suppliers: {
    table: "suppliers",
    columns: ["name", "email", "phone", "address", "city", "contact_person", "tax_id", "notes", "rating"],
  },
  products: {
    table: "products",
    columns: ["name", "sku", "description", "category", "unit_price", "cost_price", "unit_of_measure", "min_stock", "max_stock"],
  },
  raw_materials: {
    table: "raw_materials",
    columns: ["name", "sku", "description", "category", "unit_of_measure", "unit_price", "min_stock", "current_stock"],
  },
  employees: {
    table: "employees",
    columns: ["first_name", "last_name", "email", "phone", "department", "position", "hire_date", "salary"],
  },
  warehouses: {
    table: "warehouses",
    columns: ["name", "code", "address", "city", "manager_name", "capacity"],
  },
};

router.get("/data-import-export/entities", (_req: Request, res: Response) => {
  const entities = Object.entries(ENTITY_TABLES).map(([key, val]) => ({
    key,
    label: key === "customers" ? "לקוחות"
      : key === "suppliers" ? "ספקים"
      : key === "products" ? "מוצרים"
      : key === "raw_materials" ? "חומרי גלם"
      : key === "employees" ? "עובדים"
      : key === "warehouses" ? "מחסנים"
      : key,
    columns: val.columns,
  }));
  res.json(entities);
});

router.post("/data-import-export/validate", async (req: Request, res: Response) => {
  try {
    const { entity, rows, columnMapping } = req.body as {
      entity: string;
      rows: Record<string, string>[];
      columnMapping: Record<string, string>;
    };

    const entityConfig = ENTITY_TABLES[entity];
    if (!entityConfig) {
      res.status(400).json({ error: "ישות לא מוכרת" });
      return;
    }

    const errors: { row: number; field: string; message: string }[] = [];
    const validRows: Record<string, unknown>[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: Record<string, unknown> = {};
      let rowHasError = false;

      for (const [sourceCol, targetCol] of Object.entries(columnMapping)) {
        if (!targetCol || targetCol === "_skip") continue;
        const val = row[sourceCol];

        if (targetCol === "name" || targetCol === "first_name") {
          if (!val || String(val).trim() === "") {
            errors.push({ row: i + 1, field: targetCol, message: "שדה חובה" });
            rowHasError = true;
          }
        }

        if ((targetCol === "unit_price" || targetCol === "cost_price" || targetCol === "salary" || targetCol === "min_stock" || targetCol === "max_stock" || targetCol === "current_stock" || targetCol === "capacity") && val) {
          const num = Number(String(val).replace(/[,₪]/g, ""));
          if (isNaN(num)) {
            errors.push({ row: i + 1, field: targetCol, message: "ערך מספרי לא תקין" });
            rowHasError = true;
          } else {
            mapped[targetCol] = num;
            continue;
          }
        }

        if (targetCol === "email" && val) {
          if (!String(val).includes("@")) {
            errors.push({ row: i + 1, field: targetCol, message: "כתובת אימייל לא תקינה" });
            rowHasError = true;
          }
        }

        mapped[targetCol] = val || null;
      }

      if (!rowHasError) {
        validRows.push(mapped);
      }
    }

    res.json({
      totalRows: rows.length,
      validRows: validRows.length,
      errorCount: errors.length,
      errors: errors.slice(0, 100),
      preview: validRows.slice(0, 10),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "שגיאת אימות";
    res.status(500).json({ error: msg });
  }
});

router.post("/data-import-export/import", async (req: Request, res: Response) => {
  try {
    const { entity, rows, columnMapping, dryRun } = req.body as {
      entity: string;
      rows: Record<string, string>[];
      columnMapping: Record<string, string>;
      dryRun?: boolean;
    };

    const entityConfig = ENTITY_TABLES[entity];
    if (!entityConfig) {
      res.status(400).json({ error: "ישות לא מוכרת" });
      return;
    }

    const validRows: Record<string, unknown>[] = [];
    const failedRows: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const mapped: Record<string, unknown> = {};
      let skip = false;

      for (const [sourceCol, targetCol] of Object.entries(columnMapping)) {
        if (!targetCol || targetCol === "_skip") continue;
        const val = row[sourceCol];

        if ((targetCol === "name" || targetCol === "first_name") && (!val || !String(val).trim())) {
          skip = true;
          failedRows.push({ row: i + 1, error: `שדה חובה חסר: ${targetCol}` });
          break;
        }

        if ((targetCol === "unit_price" || targetCol === "cost_price" || targetCol === "salary" || targetCol === "min_stock" || targetCol === "max_stock" || targetCol === "current_stock" || targetCol === "capacity" || targetCol === "rating") && val) {
          mapped[targetCol] = Number(String(val).replace(/[,₪]/g, "")) || 0;
          continue;
        }

        mapped[targetCol] = val || null;
      }

      if (!skip) validRows.push(mapped);
    }

    if (dryRun) {
      res.json({
        dryRun: true,
        wouldInsert: validRows.length,
        wouldSkip: failedRows.length,
        failedRows: failedRows.slice(0, 50),
        preview: validRows.slice(0, 5),
      });
      return;
    }

    let inserted = 0;
    const batchSize = 50;

    for (let b = 0; b < validRows.length; b += batchSize) {
      const batch = validRows.slice(b, b + batchSize);
      for (const row of batch) {
        try {
          const cols = Object.keys(row).filter(k => entityConfig.columns.includes(k));
          if (cols.length === 0) continue;
          const values = cols.map(c => row[c]);
          const colList = cols.map(c => `"${c}"`).join(", ");
          const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
          await db.execute(sql.raw(`INSERT INTO "${entityConfig.table}" (${colList}) VALUES (${placeholders})`, values));
          inserted++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "שגיאה";
          failedRows.push({ row: b + inserted + 1, error: msg });
        }
      }
    }

    try {
      await db.execute(sql`INSERT INTO automation_log (flow_id, flow_name, affected, status, details, created_at)
        VALUES (${"data-import"}, ${"ייבוא נתונים - " + entity}, ${inserted + " רשומות"}, ${failedRows.length > 0 ? "partial" : "success"},
        ${JSON.stringify({ entity, inserted, failed: failedRows.length })}::jsonb, NOW())`);
    } catch {}

    res.json({
      success: true,
      inserted,
      failed: failedRows.length,
      failedRows: failedRows.slice(0, 50),
      total: rows.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "שגיאת ייבוא";
    res.status(500).json({ error: msg });
  }
});

router.post("/data-import-export/export", async (req: Request, res: Response) => {
  try {
    const { entity, format, filters } = req.body as {
      entity: string;
      format: "csv" | "json";
      filters?: Record<string, string>;
    };

    const entityConfig = ENTITY_TABLES[entity];
    if (!entityConfig) {
      res.status(400).json({ error: "ישות לא מוכרת" });
      return;
    }

    const colList = ["id", ...entityConfig.columns].map(c => `"${c}"`).join(", ");
    let query = `SELECT ${colList} FROM "${entityConfig.table}"`;

    const conditions: string[] = [];
    if (filters?.search) {
      const safe = filters.search.replace(/'/g, "''");
      const searchCols = entity === "employees"
        ? [`"first_name" ILIKE '%${safe}%'`, `"last_name" ILIKE '%${safe}%'`]
        : [`"name" ILIKE '%${safe}%'`];
      conditions.push(`(${searchCols.join(" OR ")})`);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    query += " ORDER BY id DESC LIMIT 10000";

    const result = await db.execute(sql.raw(query));
    const rows = (result as unknown as { rows: QueryRow[] }).rows || [];

    try {
      await db.execute(sql`INSERT INTO automation_log (flow_id, flow_name, affected, status, details, created_at)
        VALUES (${"data-export"}, ${"ייצוא נתונים - " + entity}, ${rows.length + " רשומות"}, ${"success"},
        ${JSON.stringify({ entity, format, count: rows.length })}::jsonb, NOW())`);
    } catch {}

    if (format === "csv") {
      const headers = ["id", ...entityConfig.columns];
      const csvLines = [headers.join(",")];
      for (const row of rows) {
        const line = headers.map(h => {
          const v = row[h];
          if (v === null || v === undefined) return "";
          const s = String(v);
          return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(",");
        csvLines.push(line);
      }
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${entity}_export.csv"`);
      res.send("\uFEFF" + csvLines.join("\n"));
      return;
    }

    res.json({
      entity,
      count: rows.length,
      columns: ["id", ...entityConfig.columns],
      data: rows,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "שגיאת ייצוא";
    res.status(500).json({ error: msg });
  }
});

router.get("/data-import-export/history", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`
      SELECT flow_id, flow_name, affected, status, details, created_at
      FROM automation_log
      WHERE flow_id IN ('data-import', 'data-export', 'data-migration')
      ORDER BY created_at DESC
      LIMIT 100
    `);
    const rows = (result as unknown as { rows: QueryRow[] }).rows || [];
    res.json(rows);
  } catch {
    res.json([]);
  }
});

router.get("/integration-monitoring/dashboard", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const h24Ago = new Date(now.getTime() - 86400000);
    const h7dAgo = new Date(now.getTime() - 7 * 86400000);

    const [connectionsResult, logsResult, logs7dResult] = await Promise.all([
      db.select({
        id: integrationConnectionsTable.id,
        name: integrationConnectionsTable.name,
        slug: integrationConnectionsTable.slug,
        isActive: integrationConnectionsTable.isActive,
        lastSyncAt: integrationConnectionsTable.lastSyncAt,
      }).from(integrationConnectionsTable),

      db.select().from(integrationSyncLogsTable)
        .where(gte(integrationSyncLogsTable.startedAt, h24Ago))
        .orderBy(desc(integrationSyncLogsTable.startedAt))
        .limit(200),

      db.select().from(integrationSyncLogsTable)
        .where(gte(integrationSyncLogsTable.startedAt, h7dAgo))
        .orderBy(desc(integrationSyncLogsTable.startedAt))
        .limit(1000),
    ]);

    const connections = connectionsResult || [];
    const logs24h = logsResult || [];
    const logs7d = logs7dResult || [];

    const totalSyncs24h = logs24h.length;
    const successSyncs24h = logs24h.filter(l => l.status === "success").length;
    const failedSyncs24h = logs24h.filter(l => l.status === "error" || l.status === "failed").length;
    const recordsProcessed24h = logs24h.reduce((s, l) => s + safeInt(l.recordsProcessed), 0);

    const byConnection: Record<number, {
      connectionId: number;
      connectionName: string;
      slug: string;
      isActive: boolean;
      lastSync: string | null;
      syncs24h: number;
      success24h: number;
      failed24h: number;
      records24h: number;
      avgDuration: number;
      healthScore: number;
      recentErrors: string[];
    }> = {};

    for (const conn of connections) {
      byConnection[conn.id] = {
        connectionId: conn.id,
        connectionName: conn.name,
        slug: conn.slug,
        isActive: conn.isActive ?? false,
        lastSync: conn.lastSyncAt ? new Date(conn.lastSyncAt).toISOString() : null,
        syncs24h: 0,
        success24h: 0,
        failed24h: 0,
        records24h: 0,
        avgDuration: 0,
        healthScore: 100,
        recentErrors: [],
      };
    }

    for (const log of logs24h) {
      const entry = byConnection[log.connectionId];
      if (!entry) continue;
      entry.syncs24h++;
      if (log.status === "success") entry.success24h++;
      else if (log.status === "error" || log.status === "failed") {
        entry.failed24h++;
        if (log.errorMessage && entry.recentErrors.length < 5) {
          entry.recentErrors.push(log.errorMessage);
        }
      }
      entry.records24h += safeInt(log.recordsProcessed);
      if (log.startedAt && log.completedAt) {
        const dur = new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime();
        entry.avgDuration += dur;
      }
    }

    for (const entry of Object.values(byConnection)) {
      if (entry.syncs24h > 0) {
        entry.avgDuration = Math.round(entry.avgDuration / entry.syncs24h);
        entry.healthScore = Math.round((entry.success24h / entry.syncs24h) * 100);
      }
      if (!entry.isActive) entry.healthScore = 0;
    }

    const daily7d: { date: string; success: number; failed: number; records: number }[] = [];
    const dayMap: Record<string, { success: number; failed: number; records: number }> = {};
    for (const log of logs7d) {
      const day = new Date(log.startedAt).toISOString().split("T")[0];
      if (!dayMap[day]) dayMap[day] = { success: 0, failed: 0, records: 0 };
      if (log.status === "success") dayMap[day].success++;
      else dayMap[day].failed++;
      dayMap[day].records += safeInt(log.recordsProcessed);
    }
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().split("T")[0];
      daily7d.push({ date: key, ...(dayMap[key] || { success: 0, failed: 0, records: 0 }) });
    }

    const alerts: { level: string; message: string; connectionId?: number; time: string }[] = [];
    for (const entry of Object.values(byConnection)) {
      if (entry.isActive && entry.healthScore < 50 && entry.syncs24h > 0) {
        alerts.push({
          level: "critical",
          message: `${entry.connectionName}: אחוז הצלחה נמוך (${entry.healthScore}%)`,
          connectionId: entry.connectionId,
          time: new Date().toISOString(),
        });
      }
      if (entry.isActive && entry.lastSync) {
        const lastSyncAge = now.getTime() - new Date(entry.lastSync).getTime();
        if (lastSyncAge > 86400000) {
          alerts.push({
            level: "warning",
            message: `${entry.connectionName}: לא סונכרן מעל 24 שעות`,
            connectionId: entry.connectionId,
            time: new Date().toISOString(),
          });
        }
      }
      if (entry.failed24h >= 3) {
        alerts.push({
          level: "critical",
          message: `${entry.connectionName}: ${entry.failed24h} כשלונות ב-24 שעות`,
          connectionId: entry.connectionId,
          time: new Date().toISOString(),
        });
      }
    }

    res.json({
      summary: {
        activeConnections: connections.filter(c => c.isActive).length,
        totalConnections: connections.length,
        totalSyncs24h,
        successSyncs24h,
        failedSyncs24h,
        recordsProcessed24h,
        overallHealthScore: totalSyncs24h > 0 ? Math.round((successSyncs24h / totalSyncs24h) * 100) : 100,
      },
      connections: Object.values(byConnection),
      daily7d,
      alerts,
      recentLogs: logs24h.slice(0, 50).map(l => ({
        id: l.id,
        connectionId: l.connectionId,
        direction: l.direction,
        status: l.status,
        recordsProcessed: l.recordsProcessed,
        recordsFailed: l.recordsFailed,
        errorMessage: l.errorMessage,
        startedAt: l.startedAt ? new Date(l.startedAt).toISOString() : null,
        completedAt: l.completedAt ? new Date(l.completedAt).toISOString() : null,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    res.status(500).json({ error: msg });
  }
});

router.get("/integration-monitoring/sync-logs", async (req: Request, res: Response) => {
  try {
    const connectionId = req.query.connectionId ? Number(req.query.connectionId) : null;
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    let query = db.select().from(integrationSyncLogsTable);
    if (connectionId) {
      query = query.where(eq(integrationSyncLogsTable.connectionId, connectionId)) as typeof query;
    }
    const logs = await query.orderBy(desc(integrationSyncLogsTable.startedAt)).limit(limit);

    res.json(logs.map(l => ({
      id: l.id,
      connectionId: l.connectionId,
      direction: l.direction,
      status: l.status,
      recordsProcessed: l.recordsProcessed,
      recordsFailed: l.recordsFailed,
      errorMessage: l.errorMessage,
      details: l.details,
      startedAt: l.startedAt ? new Date(l.startedAt).toISOString() : null,
      completedAt: l.completedAt ? new Date(l.completedAt).toISOString() : null,
    })));
  } catch {
    res.json([]);
  }
});

router.post("/integration-monitoring/test-all", async (_req: Request, res: Response) => {
  try {
    const connections = await db.select({
      id: integrationConnectionsTable.id,
      name: integrationConnectionsTable.name,
      slug: integrationConnectionsTable.slug,
      isActive: integrationConnectionsTable.isActive,
      baseUrl: integrationConnectionsTable.baseUrl,
    }).from(integrationConnectionsTable)
      .where(eq(integrationConnectionsTable.isActive, true));

    const results: { connectionId: number; name: string; status: string; message: string }[] = [];

    const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal", "169.254.169.254"]);

    for (const conn of connections) {
      try {
        if (conn.baseUrl) {
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(conn.baseUrl);
          } catch {
            results.push({ connectionId: conn.id, name: conn.name, status: "unhealthy", message: "URL לא תקין" });
            continue;
          }
          if (BLOCKED_HOSTS.has(parsedUrl.hostname) || parsedUrl.hostname.endsWith(".internal") || /^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(parsedUrl.hostname)) {
            results.push({ connectionId: conn.id, name: conn.name, status: "blocked", message: "URL פנימי חסום" });
            continue;
          }
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(conn.baseUrl, { signal: controller.signal, method: "HEAD" });
          clearTimeout(timeout);
          results.push({
            connectionId: conn.id,
            name: conn.name,
            status: response.ok ? "healthy" : "degraded",
            message: response.ok ? "תקין" : `קוד תגובה: ${response.status}`,
          });
        } else {
          results.push({
            connectionId: conn.id,
            name: conn.name,
            status: "unknown",
            message: "אין URL לבדיקה",
          });
        }
      } catch {
        results.push({
          connectionId: conn.id,
          name: conn.name,
          status: "unhealthy",
          message: "לא ניתן להתחבר",
        });
      }

      await db.insert(integrationSyncLogsTable).values({
        connectionId: conn.id,
        direction: "health_check",
        status: results[results.length - 1].status === "healthy" ? "success" : "error",
        recordsProcessed: 0,
        recordsFailed: 0,
        errorMessage: results[results.length - 1].status !== "healthy" ? results[results.length - 1].message : null,
      });
    }

    res.json({ tested: results.length, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "שגיאה";
    res.status(500).json({ error: msg });
  }
});

export default router;
