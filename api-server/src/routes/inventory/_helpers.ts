// Shared helpers for inventory routes — mirrors procurement/_helpers pattern
import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import type { ZodSchema } from "zod";

/** Extract a validated body using a Zod schema; send 400 on failure. */
export function parseBody<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Validation failed", issues: result.error.issues });
    return null;
  }
  return result.data;
}

/** Extract a validated query using a Zod schema; send 400 on failure. */
export function parseQuery<T>(schema: ZodSchema<T>, req: Request, res: Response): T | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    res.status(400).json({ error: "Validation failed", issues: result.error.issues });
    return null;
  }
  return result.data;
}

/** Coerce Object to INSERT column/value lists. */
export function buildInsert(table: string, data: Record<string, unknown>) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const vals = keys.map((k) => (data[k] === "" ? null : data[k]));
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  return {
    text: `INSERT INTO ${table} (${keys.map((k) => `"${k}"`).join(", ")}) VALUES (${placeholders}) RETURNING *`,
    values: vals,
  };
}

/** Coerce Object to UPDATE SET list. */
export function buildUpdate(table: string, data: Record<string, unknown>, idCol: string, id: string | number) {
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

export function sendDbError(res: Response, err: any) {
  const msg = err?.message ?? "Database error";
  if (msg.includes("unique") || msg.includes("duplicate")) {
    return res.status(409).json({ error: "Conflict", message: msg });
  }
  return res.status(500).json({ error: "Database error", message: msg });
}

export async function withClient<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Whitelist-validated ORDER BY clause builder (SQLi-safe).
 * Used by inventory list endpoints — never splice user input.
 */
export function safeOrderBy(
  raw: string | undefined,
  allowed: Set<string>,
  fallback: string,
): string {
  return raw && allowed.has(raw) ? raw : fallback;
}

export function safeOrderDir(raw: string | undefined): "asc" | "desc" {
  return (raw ?? "").toLowerCase() === "asc" ? "asc" : "desc";
}

export { pool };
