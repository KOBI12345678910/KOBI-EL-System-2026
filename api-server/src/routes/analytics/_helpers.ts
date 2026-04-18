// ============================================================
// Shared helpers for analytics routes.
// All SQL construction flows through _safe-list-helpers — never
// string-interpolate user input into sql.raw.
// ============================================================
import type { Request, Response } from "express";
import type { ZodSchema } from "zod";
import { db } from "@workspace/db";
import { sql, type SQL } from "drizzle-orm";
import {
  buildSafeWhere,
  buildSafeOrderByFragment,
  buildSafeSetClause,
  safeLimit,
  safeOffset,
  buildListResponse,
  safeDateParam,
} from "../_safe-list-helpers";

export {
  db,
  sql,
  buildSafeWhere,
  buildSafeOrderByFragment,
  buildSafeSetClause,
  safeLimit,
  safeOffset,
  buildListResponse,
  safeDateParam,
};
export type { SQL };

/** Validate body against a Zod schema; send 400 on failure. */
export function parseBody<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "בקשה לא תקינה", issues: result.error.issues });
    return null;
  }
  return result.data;
}

/** Validate query against a Zod schema; send 400 on failure. */
export function parseQuery<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ error: "בקשה לא תקינה", issues: result.error.issues });
    return null;
  }
  return result.data;
}

export function sendDbError(res: Response, err: unknown, label = "analytics") {
  const msg = (err as { message?: string })?.message ?? "Database error";
  console.error(`[${label}]`, err);
  if (msg.includes("unique") || msg.includes("duplicate")) {
    return res.status(409).json({ error: "התנגשות ייחודיות", message: msg });
  }
  if (msg.includes("foreign key")) {
    return res.status(400).json({ error: "קישור לא תקין", message: msg });
  }
  return res.status(500).json({ error: "שגיאת מסד נתונים", message: msg });
}

export function getUserId(req: Request): number | null {
  const v = (req as { userId?: unknown }).userId;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Coerce arbitrary JSON-ish value to a JSON string for jsonb parameter binding. */
export function jsonbParam(v: unknown): string {
  return JSON.stringify(v ?? {});
}

/** Validate positive integer id path param. Send 400 if invalid. */
export function parseIntId(req: Request, res: Response): number | null {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "מזהה לא תקין" });
    return null;
  }
  return id;
}

/** Validate uuid path param. Send 400 if invalid. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseUuidId(req: Request, res: Response): string | null {
  const v = String(req.params.id || "");
  if (!UUID_RE.test(v)) {
    res.status(400).json({ error: "מזהה UUID לא תקין" });
    return null;
  }
  return v;
}
