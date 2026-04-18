// ============================================================
// Shared helpers for orchestration routes.
// Orchestration routers install `authMiddleware`. Admin-sensitive
// endpoints additionally install `adminMiddleware` at the sub-router
// level (e.g. workflow definitions, triggers).
// ============================================================
import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import { authMiddleware, adminMiddleware } from "../../middleware/auth";
import {
  buildSafeWhere,
  buildSafeOrderBy,
  safeLimit,
  safeOffset,
  buildListResponse,
  safeDateParam,
} from "../_safe-list-helpers";

export { authMiddleware, adminMiddleware };
export { db, sql };
export {
  buildSafeWhere,
  buildSafeOrderBy,
  safeLimit,
  safeOffset,
  buildListResponse,
  safeDateParam,
};

// Placeholder guard for future "viewer/operator" split
export function authOnly(_req: Request, _res: Response, next: NextFunction): void {
  next();
}

export function parseBody<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "בקשה לא תקינה", issues: result.error.issues });
    return null;
  }
  return result.data;
}

export function parseQuery<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ error: "בקשה לא תקינה", issues: result.error.issues });
    return null;
  }
  return result.data;
}

export function idFromParams(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "מזהה לא תקין" });
    return null;
  }
  return id;
}

export function currentUserId(req: Request): number | null {
  const v = Number((req as { userId?: unknown }).userId);
  return Number.isInteger(v) && v > 0 ? v : null;
}

export function sendDbError(res: Response, err: unknown, label: string): void {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("duplicate key")) {
    res.status(409).json({ error: "רשומה כבר קיימת", message: msg });
    return;
  }
  if (msg.includes("foreign key")) {
    res.status(400).json({ error: "קישור לא תקין", message: msg });
    return;
  }
  if (msg.includes("check constraint")) {
    res.status(400).json({ error: "ערך לא חוקי", message: msg });
    return;
  }
  console.error(`[orchestration:${label}]`, err);
  res.status(500).json({ error: "שגיאה בשירות התזמור" });
}

// Generic LIST helper mirroring governance/_helpers.runSafeList
export async function runSafeList<T>(params: {
  table: string;
  conditions: SQL[];
  allowedOrderColumns: Set<string>;
  fallbackColumn: string;
  orderBy: string | undefined;
  orderDir: string | undefined;
  limit: number;
  offset: number;
  columns?: string;
}) {
  const {
    table,
    conditions,
    allowedOrderColumns,
    fallbackColumn,
    orderBy,
    orderDir,
    limit,
    offset,
    columns = "*",
  } = params;

  const where = buildSafeWhere(conditions);
  const orderClause = buildSafeOrderBy(
    orderBy,
    orderDir,
    allowedOrderColumns,
    fallbackColumn,
    "desc",
  );
  const safeColumns = columns === "*" ? "*" : columns;

  const rowsRes = await db.execute(sql`
    select ${sql.raw(safeColumns)} from ${sql.raw(table)}
    ${where}
    order by ${sql.raw(orderClause)}
    limit ${limit} offset ${offset}
  `);
  const countRes = await db.execute(sql`
    select count(*)::bigint as total from ${sql.raw(table)} ${where}
  `);
  const total = Number(
    (countRes.rows?.[0] as { total?: number | string } | undefined)?.total ?? 0,
  );
  return buildListResponse<T>((rowsRes.rows ?? []) as T[], total, limit, offset);
}
