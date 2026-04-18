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

/**
 * DEPRECATED — SQLi fix B-D033.
 *
 * The old query(text, params) helper used sql.raw() with manual string
 * interpolation + quote escaping. That pattern is SQL-injection-prone:
 *   - String() coercion of complex values is attacker-controllable
 *   - Manual quote-doubling fails under non-standard_conforming_strings
 *   - Backslash escapes, NUL bytes, multi-byte truncation all bypass it
 *   - Identifier-position slots (order_by, order_dir, column names) have
 *     no protection at all
 *
 * SAFE REPLACEMENT — use Drizzle parameterized tagged templates directly:
 *
 *   import { db } from "@workspace/db";
 *   import { sql } from "drizzle-orm";
 *
 *   const rows = await db.execute(sql`
 *     select id, name from execution.tasks
 *     where project_id = ${projectId}
 *     order by ${sql.raw("created_at")} desc
 *     limit ${limit} offset ${offset}
 *   `);
 *
 * For dynamic WHERE clauses with user input, see
 *   api-server/src/routes/_safe-list-helpers.ts
 * which provides buildSafeWhere(), buildSafeOrderByFragment(),
 * safeLimit(), safeOffset(), and buildSafeSetClause() — all with
 * whitelist-validated identifiers and parameterized value bindings.
 *
 * This stub throws intentionally so any remaining caller fails loudly
 * at runtime rather than silently executing unsafe SQL.
 */
export function query<_T = Record<string, unknown>>(
  _text: string,
  _params: unknown[] = []
): Promise<never> {
  throw new Error(
    "DEPRECATED: execution/_shared.ts::query() removed (SQLi fix B-D033). " +
    "Use db.execute(sql`...`) with parameterized ${bindings} directly. " +
    "For ORDER BY/WHERE/SET helpers see api-server/src/routes/_safe-list-helpers.ts."
  );
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
    const numId = typeof recordId === "number" ? recordId : parseInt(String(recordId), 10);
    await logAudit({
      user_id: Number.isFinite(userId as number) ? (userId as number) : null,
      user_name: req.username || null,
      table_name: tableName,
      record_id: Number.isFinite(numId) ? numId : 0,
      action,
      old_values: (oldValues as Record<string, unknown> | null) ?? null,
      new_values: (newValues as Record<string, unknown> | null) ?? null,
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
