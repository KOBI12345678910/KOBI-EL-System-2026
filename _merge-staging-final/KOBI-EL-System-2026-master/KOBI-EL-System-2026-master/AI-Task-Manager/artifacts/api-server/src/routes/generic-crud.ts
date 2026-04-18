import { Router, Request, Response } from "express";
import { pool } from "@workspace/db";
import { heavyEndpointRateLimit } from "../lib/api-gateway";
import { eventBus } from "../lib/event-bus";

const SAFE_COL = /^[a-z_][a-z0-9_]{0,63}$/i;

const _colCache = new Map<string, string[]>();
async function getColumns(table: string): Promise<string[]> {
  if (_colCache.has(table)) return _colCache.get(table)!;
  try {
    const { rows } = await pool.query(
      `SELECT a.attname as col FROM pg_attribute a WHERE a.attrelid = $1::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum`,
      [table]
    );
    const cols = rows.map((r: any) => r.col as string);
    _colCache.set(table, cols);
    return cols;
  } catch {
    return [];
  }
}

export function invalidateColumnCache(table: string) {
  _colCache.delete(table);
}

const _genColCache = new Map<string, Set<string>>();
async function getGeneratedCols(table: string): Promise<Set<string>> {
  if (_genColCache.has(table)) return _genColCache.get(table)!;
  try {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND (is_generated='ALWAYS' OR generation_expression IS NOT NULL)`,
      [table]
    );
    const s = new Set(rows.map((r: any) => r.column_name as string));
    _genColCache.set(table, s);
    return s;
  } catch {
    const s = new Set<string>();
    _genColCache.set(table, s);
    return s;
  }
}

const _textColCache = new Map<string, string[]>();
async function getTextColumns(table: string): Promise<string[]> {
  if (_textColCache.has(table)) return _textColCache.get(table)!;
  try {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND data_type IN ('text','character varying','character')`,
      [table]
    );
    const cols = rows.map((r: any) => r.column_name as string);
    _textColCache.set(table, cols);
    return cols;
  } catch {
    return [];
  }
}

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return "";
  const s = typeof val === "object" ? JSON.stringify(val) : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

export interface CrudOptions {
  orderBy?: string;
  searchColumns?: string[];
  defaultLimit?: number;
}

export function crudAll(router: Router, route: string, table: string, opts?: CrudOptions) {
  const orderBy = opts?.orderBy || "created_at DESC NULLS LAST";
  const defaultLimit = opts?.defaultLimit || 50;

  router.get(`${route}/export`, heavyEndpointRateLimit, async (req: Request, res: Response) => {
    try {
      const cols = await getColumns(table);
      if (cols.length === 0) return res.status(404).json({ error: `Table ${table} not found` });

      const softDelete = cols.includes("deleted_at");
      const baseFilter = softDelete ? " WHERE deleted_at IS NULL" : "";

      const where = buildWhere(req.query, cols, softDelete);
      const { rows } = await pool.query(
        `SELECT * FROM ${table}${where.clause || baseFilter} ORDER BY ${orderBy}`,
        where.params
      );

      const header = cols.map(escapeCsvField).join(",");
      const lines = rows.map((r: any) => cols.map(c => escapeCsvField(r[c])).join(","));

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${table}.csv"`);
      res.send("\uFEFF" + header + "\n" + lines.join("\n"));
    } catch (err: any) {
      console.error(`[crud] export ${table}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.get(`${route}/stats`, async (req: Request, res: Response) => {
    try {
      const cols = await getColumns(table);
      const softDelete = cols.includes("deleted_at");
      const where = buildWhere(req.query, cols, softDelete);

      const countQ = await pool.query(
        `SELECT COUNT(*) as total FROM ${table}${where.clause}`,
        where.params
      );
      const total = Number(countQ.rows[0]?.total || 0);

      let activeCount: number | null = null;
      if (cols.includes("is_active")) {
        const pLen = where.params.length;
        const activeQ = await pool.query(
          `SELECT COUNT(*) as c FROM ${table}${where.clause}${where.clause ? " AND" : " WHERE"} is_active = $${pLen + 1}`,
          [...where.params, true]
        );
        activeCount = Number(activeQ.rows[0]?.c || 0);
      }

      let statusBreakdown: Record<string, number> | null = null;
      if (cols.includes("status")) {
        const statusQ = await pool.query(
          `SELECT COALESCE(status, 'unknown') as status, COUNT(*) as c FROM ${table}${where.clause} GROUP BY status ORDER BY c DESC`,
          where.params
        );
        statusBreakdown = {};
        statusQ.rows.forEach((r: any) => { statusBreakdown![r.status] = Number(r.c); });
      }

      const stats: any = { total };
      if (activeCount !== null) stats.active = activeCount;
      if (statusBreakdown) stats.byStatus = statusBreakdown;

      let recentCount: number | null = null;
      if (cols.includes("created_at")) {
        const softFilter = softDelete ? " AND deleted_at IS NULL" : "";
        const recentQ = await pool.query(
          `SELECT COUNT(*) as c FROM ${table} WHERE created_at >= NOW() - INTERVAL '30 days'${softFilter}`
        );
        recentCount = Number(recentQ.rows[0]?.c || 0);
        stats.last30Days = recentCount;
      }

      if (softDelete) {
        const deletedQ = await pool.query(
          `SELECT COUNT(*) as c FROM ${table} WHERE deleted_at IS NOT NULL`
        );
        stats.deleted = Number(deletedQ.rows[0]?.c || 0);
      }

      res.json(stats);
    } catch (err: any) {
      console.error(`[crud] stats ${table}:`, err.message);
      res.json({ total: 0 });
    }
  });

  router.get(route, async (req: Request, res: Response) => {
    try {
      const cols = await getColumns(table);
      if (cols.length === 0) return res.status(404).json({ error: `Table ${table} not found` });

      const softDelete = cols.includes("deleted_at");
      const includeDeleted = req.query.include_deleted === "true";

      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || defaultLimit));
      const offset = (page - 1) * limit;

      const search = (req.query.search as string || "").trim();
      const sortBy = SAFE_COL.test(req.query.sort_by as string || "") && cols.includes(req.query.sort_by as string)
        ? req.query.sort_by as string : null;
      const sortDir = (req.query.sort_dir as string || "").toLowerCase() === "asc" ? "ASC" : "DESC";

      const where = buildWhere(req.query, cols, softDelete && !includeDeleted);
      let searchClause = "";
      const allParams = [...where.params];

      if (search) {
        const textCols = opts?.searchColumns || await getTextColumns(table);
        if (textCols.length > 0) {
          const paramIdx = allParams.length + 1;
          const searchTerm = `%${search}%`;
          const orConds = textCols
            .filter(c => cols.includes(c))
            .map(c => `"${c}" ILIKE $${paramIdx}`)
            .join(" OR ");
          if (orConds) {
            searchClause = `${where.clause ? " AND" : " WHERE"} (${orConds})`;
            allParams.push(searchTerm);
          }
        }
      }

      const sort = sortBy ? `"${sortBy}" ${sortDir} NULLS LAST` : orderBy;
      const pOff = allParams.length + 1;
      const pLim = allParams.length + 2;

      const countQ = await pool.query(
        `SELECT COUNT(*) as total FROM ${table}${where.clause}${searchClause}`,
        allParams
      );
      const total = Number(countQ.rows[0]?.total || 0);

      const { rows } = await pool.query(
        `SELECT * FROM ${table}${where.clause}${searchClause} ORDER BY ${sort} OFFSET $${pOff} LIMIT $${pLim}`,
        [...allParams, offset, limit]
      );

      res.json({
        data: rows,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    } catch (err: any) {
      console.error(`[crud] GET ${table}:`, err.message);
      res.json({ data: [], pagination: { page: 1, limit: defaultLimit, total: 0, totalPages: 0 } });
    }
  });

  router.get(`${route}/:id`, async (req: Request, res: Response) => {
    try {
      const allCols = await getColumns(table);
      const hasSoftDelete = allCols.includes("deleted_at");
      const includeDeleted = req.query.include_deleted === "true";

      let query: string;
      if (hasSoftDelete && !includeDeleted) {
        query = `SELECT * FROM ${table} WHERE id = $1 AND deleted_at IS NULL`;
      } else {
        query = `SELECT * FROM ${table} WHERE id = $1`;
      }

      const { rows } = await pool.query(query, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: "לא נמצא" });
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post(`${route}/import`, async (req: Request, res: Response) => {
    try {
      const csvText = req.body?.csv as string;
      if (!csvText) return res.status(400).json({ error: "Missing csv field" });

      const allCols = await getColumns(table);
      const genCols = await getGeneratedCols(table);
      const lines = csvText.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return res.status(400).json({ error: "CSV must have header + data rows" });

      const headers = parseCsvLine(lines[0]).map(h => h.replace(/^\uFEFF/, ""));
      const validHeaders = headers.filter(h => SAFE_COL.test(h) && allCols.includes(h) && h !== "id" && !genCols.has(h));

      let imported = 0;
      let errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const values = parseCsvLine(lines[i]);
          const data: Record<string, any> = {};
          headers.forEach((h, idx) => {
            if (validHeaders.includes(h) && idx < values.length) {
              const v = values[idx];
              data[h] = v === "" ? null : v;
            }
          });

          const keys = Object.keys(data);
          if (keys.length === 0) continue;

          const vals = keys.map(k => data[k]);
          const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
          const colStr = keys.map(k => `"${k}"`).join(", ");

          await pool.query(`INSERT INTO ${table} (${colStr}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, vals);
          imported++;
        } catch (e: any) {
          errors.push(`שורה ${i + 1}: ${e.message?.slice(0, 100)}`);
        }
      }

      res.json({ imported, errors: errors.slice(0, 20), totalRows: lines.length - 1 });
    } catch (err: any) {
      console.error(`[crud] import ${table}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post(route, async (req: Request, res: Response) => {
    try {
      const data = req.body;

      if (table === "customers") {
        const name = data["name"];
        if (!name || !String(name).trim()) {
          return res.status(400).json({ error: "שדה חובה — יש להזין שם לקוח" });
        }
      }

      const allCols = await getColumns(table);
      const genCols = await getGeneratedCols(table);
      const keys = Object.keys(data).filter(k =>
        k !== "id" && SAFE_COL.test(k) && allCols.includes(k) && !genCols.has(k)
      );
      if (keys.length === 0) return res.status(400).json({ error: "אין נתונים תקינים" });

      const vals = keys.map(k => data[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
      const colStr = keys.map(k => `"${k}"`).join(", ");

      const { rows } = await pool.query(
        `INSERT INTO ${table} (${colStr}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      const created = rows[0];
      res.status(201).json(created);

      try {
        eventBus.emit("record.created", {
          type: "record.created",
          entityId: table,
          recordId: created?.id,
          data: created,
          timestamp: new Date(),
        });
      } catch {}
    } catch (err: any) {
      console.error(`[crud] POST ${table}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.put(`${route}/:id`, async (req: Request, res: Response) => {
    try {
      const data = req.body;
      const allCols = await getColumns(table);
      const genCols = await getGeneratedCols(table);
      const keys = Object.keys(data).filter(k =>
        k !== "id" && k !== "created_at" && SAFE_COL.test(k) && allCols.includes(k) && !genCols.has(k)
      );
      if (keys.length === 0) return res.status(400).json({ error: "אין נתונים לעדכון" });

      const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
      const vals = [...keys.map(k => data[k]), req.params.id];
      const updatedAt = allCols.includes("updated_at") ? `, "updated_at" = NOW()` : "";

      const { rows } = await pool.query(
        `UPDATE ${table} SET ${sets}${updatedAt} WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ error: "לא נמצא" });
      const updated = rows[0];
      res.json(updated);

      try {
        eventBus.emit("record.updated", {
          type: "record.updated",
          entityId: table,
          recordId: updated?.id,
          data: updated,
          timestamp: new Date(),
        });
      } catch {}
    } catch (err: any) {
      console.error(`[crud] PUT ${table}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete(`${route}/:id`, async (req: Request, res: Response) => {
    try {
      const permissions = (req as any).permissions;
      const isSuperAdmin = permissions?.isSuperAdmin === true;
      if (!isSuperAdmin) {
        return res.status(403).json({ error: "מחיקה מותרת רק למנהל מערכת ראשי" });
      }

      const allCols = await getColumns(table);
      const hasSoftDelete = allCols.includes("deleted_at");

      if (hasSoftDelete) {
        const updatedAt = allCols.includes("updated_at") ? `, "updated_at" = NOW()` : "";
        const { rows } = await pool.query(
          `UPDATE ${table} SET deleted_at = NOW()${updatedAt} WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
          [req.params.id]
        );
        if (!rows[0]) return res.status(404).json({ error: "לא נמצא" });
      } else if (allCols.includes("is_active")) {
        const updatedAt = allCols.includes("updated_at") ? `, "updated_at" = NOW()` : "";
        const { rows } = await pool.query(
          `UPDATE ${table} SET is_active = false${updatedAt} WHERE id = $1 RETURNING id`,
          [req.params.id]
        );
        if (!rows[0]) {
          await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
        }
      } else {
        await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      }

      res.json({ success: true });

      try {
        eventBus.emit("record.deleted", {
          type: "record.deleted",
          entityId: table,
          recordId: Number(req.params.id),
          data: null,
          timestamp: new Date(),
        });
      } catch {}
    } catch (err: any) {
      console.error(`[crud] DELETE ${table}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.post(`${route}/:id/restore`, async (req: Request, res: Response) => {
    try {
      const allCols = await getColumns(table);
      if (!allCols.includes("deleted_at")) {
        return res.status(400).json({ error: "טבלה זו אינה תומכת בשחזור" });
      }
      const updatedAt = allCols.includes("updated_at") ? `, "updated_at" = NOW()` : "";
      const { rows } = await pool.query(
        `UPDATE ${table} SET deleted_at = NULL${updatedAt} WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return res.status(404).json({ error: "הרשומה לא נמצאה בסל המיחזור" });
      res.json({ success: true, record: rows[0] });
    } catch (err: any) {
      console.error(`[crud] RESTORE ${table}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });

  router.delete(`${route}/:id/permanent`, async (req: Request, res: Response) => {
    try {
      const permissions = (req as any).permissions;
      const isSuperAdmin = permissions?.isSuperAdmin === true;
      if (!isSuperAdmin) {
        return res.status(403).json({ error: "מחיקה קבועה מותרת רק למנהל מערכת ראשי" });
      }
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      console.error(`[crud] PERMANENT DELETE ${table}:`, err.message);
      res.status(500).json({ error: err.message });
    }
  });
}

function buildWhere(query: Record<string, any>, cols: string[], filterDeleted = false): { clause: string; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];
  const skip = new Set(["page", "limit", "search", "sort_by", "sort_dir", "format", "_", "include_deleted"]);

  for (const [key, val] of Object.entries(query)) {
    if (skip.has(key) || !SAFE_COL.test(key) || !cols.includes(key) || val === undefined || val === "") continue;
    params.push(val);
    conditions.push(`"${key}" = $${params.length}`);
  }

  if (filterDeleted) {
    conditions.push(`deleted_at IS NULL`);
  }

  return {
    clause: conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export default crudAll;
