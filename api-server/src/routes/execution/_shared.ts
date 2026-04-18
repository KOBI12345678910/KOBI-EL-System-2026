// ============================================================
// Shared helpers for execution-domain API routes
// Generated: 2026-04-18
// ============================================================
import type { RequestHandler, Request, Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { validateSession } from "../../lib/auth";
import { resolveUserPermissions } from "../../lib/permission-engine";
import { logAudit } from "../../lib/audit-log";

interface SessionUser {
  id: number;
  username: string;
  email?: string;
}

/** Auth middleware aligned with CRM / commercial convention (crm.ts:16-29). */
export const requireExecutionAuth: RequestHandler = async (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : null;
  const cookieToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.accessToken;
  const resolved = token ?? cookieToken ?? null;
  if (!resolved) {
    res.status(401).json({ error: "נדרשת התחברות" });
    return;
  }
  const result = await validateSession(resolved);
  if (result.error || !result.user) {
    res.status(401).json({ error: "הסשן פג תוקף" });
    return;
  }
  const user = result.user as SessionUser;
  (req as Record<string, unknown>).user = user;
  req.userId = String(user.id || "");
  if (req.userId && (!req.permissions || !req.permissions.roles?.length)) {
    req.permissions = await resolveUserPermissions(req.userId);
  }
  next();
};

/** Execute a SQL query and return rows. */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  // Drizzle sql template — we use sql.raw for interpolated queries.
  // For parameterized queries, callers should prefer db.execute(sql`...`) directly.
  const result = await db.execute(sql.raw(text.replace(/\$(\d+)/g, (_m, n) => {
    const v = params[Number(n) - 1];
    if (v === null || v === undefined) return "NULL";
    if (typeof v === "number") return String(v);
    if (typeof v === "boolean") return v ? "true" : "false";
    if (v instanceof Date) return `'${v.toISOString()}'`;
    const safe = String(v).replace(/'/g, "''");
    return `'${safe}'`;
  })));
  return (result.rows || []) as T[];
}

/** Safe JSON parse for jsonb columns returned as strings. */
export function parseJson(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

/** Build a WHERE clause from filter object. Returns {clause, params}. */
export function buildWhere(
  filters: Record<string, unknown>,
  start = 1
): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  let i = start;
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${k} = $${i++}`);
    params.push(v);
  }
  return {
    clause: parts.length ? "WHERE " + parts.join(" AND ") : "",
    params,
  };
}

/** Attempt to log an audit event. Silent on failure. */
export async function audit(
  req: Request,
  tableName: string,
  recordId: string | number,
  action: "INSERT" | "UPDATE" | "DELETE",
  oldValues: unknown,
  newValues: unknown
): Promise<void> {
  try {
    const userId = typeof req.userId === "string" ? parseInt(req.userId, 10) : req.userId;
    await logAudit({
      user_id: Number.isFinite(userId as number) ? (userId as number) : null,
      user_name: req.username || null,
      table_name: tableName,
      record_id: String(recordId),
      action,
      old_values: oldValues ?? null,
      new_values: newValues ?? null,
      ip_address: req.ip || null,
      notes: null,
    });
  } catch {
    // audit table may not exist in test contexts — silent
  }
}

/** Wrap an async handler so that thrown errors produce a 500 JSON. */
export function asyncHandler(
  fn: (req: Request, res: Response) => Promise<unknown>
): RequestHandler {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[execution route error]`, msg);
      if (!res.headersSent) res.status(500).json({ error: msg });
    }
  };
}

/** Zod validation helper — returns parsed data or sends 400. */
export function validate<TOut>(
  schema: { safeParse: (v: unknown) => { success: true; data: TOut } | { success: false; error: unknown } },
  data: unknown,
  res: Response
): TOut | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    res.status(400).json({ error: "Validation failed", details: (result.error as { issues?: unknown }).issues });
    return null;
  }
  return result.data;
}
