// Shared helpers for docs domain routes.
// Thin wrapper that pulls the established pool/parse/build helpers
// (via procurement `_helpers.ts`) and re-exports the SQL-safe building
// blocks from `../_safe-list-helpers` so every docs route imports its
// LIST/UPDATE primitives from a single, injection-safe source.
import type { Request, Response } from "express";
import type { ZodSchema } from "zod";
import { pool } from "@workspace/db";

export { pool };
export {
  buildSafeWhere,
  buildSafeOrderBy,
  buildSafeOrderByFragment,
  safeLimit,
  safeOffset,
  safeIdentifier,
  buildSafeSetClause,
  buildPaginationMeta,
  buildListResponse,
  safeDateParam,
  type ListResponse,
  type PaginationMeta,
} from "../_safe-list-helpers";

export function parseBody<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Validation failed", issues: result.error.issues });
    return null;
  }
  return result.data;
}

export function parseQuery<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ error: "Validation failed", issues: result.error.issues });
    return null;
  }
  return result.data;
}

export function parseParamId(req: Request, res: Response, key = "id"): number | null {
  const raw = (req.params as Record<string, string>)[key];
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    res.status(400).json({ error: `Invalid ${key} parameter` });
    return null;
  }
  return n;
}

export function buildInsert(table: string, data: Record<string, unknown>) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const vals = keys.map((k) => (data[k] === "" ? null : data[k]));
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  return {
    text: `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${placeholders}) RETURNING *`,
    values: vals,
  };
}

export function buildUpdate(
  table: string,
  data: Record<string, unknown>,
  idCol: string,
  id: string | number,
) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (keys.length === 0) return null;
  const vals = keys.map((k) => (data[k] === "" ? null : data[k]));
  const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
  vals.push(id);
  return {
    text: `UPDATE ${table} SET ${sets}, updated_at = NOW() WHERE "${idCol}" = $${vals.length} RETURNING *`,
    values: vals,
  };
}

export function sendDbError(res: Response, err: unknown) {
  const msg = (err as { message?: string })?.message ?? "Database error";
  if (msg.includes("unique") || msg.includes("duplicate")) {
    return res.status(409).json({ error: "Conflict", message: msg });
  }
  return res.status(500).json({ error: "Database error", message: msg });
}
