// ============================================================
// Safe list-query helpers — SQLi-proof building blocks
// Generated: 2026-04-18
// Security decision: B-D033
// ============================================================
//
// Purpose: provide parameterized, injection-safe building blocks
// for LIST handlers across all domain routes (commercial, execution,
// procurement, inventory, finance, workforce, docs, intelligence,
// governance, analytics, orchestration, comms).
//
// DO NOT use `sql.raw()` with any user-derived string. This module
// gives you tagged-template building blocks that Drizzle will
// parameterize automatically.
//
// Replaces the unsafe `query(text, params)` pattern where `$N`
// placeholders were manually substituted into raw SQL via
// `String(v).replace(/'/g, "''")`. That pattern fails under:
//   - backslash escapes (standard_conforming_strings = off)
//   - multi-byte truncation / invalid UTF-8
//   - NUL bytes in input
//   - identifier interpolation (order_by, order_dir, column names)
//   - boolean / number / JSON coercion edge cases
//
// Usage example:
// ----------------------------------------------------------------
//   import {
//     buildSafeWhere,
//     buildSafeOrderBy,
//     safeLimit,
//     safeOffset,
//   } from "../_safe-list-helpers";
//   import { sql } from "drizzle-orm";
//   import { db } from "@workspace/db";
//
//   const allowedColumns = new Set([
//     "id", "created_at", "updated_at", "name", "status",
//   ]);
//
//   const conditions: ReturnType<typeof sql>[] = [];
//   if (q.status) conditions.push(sql`status = ${q.status}`);
//   if (q.customer_id) conditions.push(sql`customer_id = ${q.customer_id}`);
//   if (q.q) conditions.push(sql`name ILIKE ${"%" + q.q + "%"}`);
//
//   const where = buildSafeWhere(conditions);
//   const orderBy = buildSafeOrderBy(q.order_by, q.order_dir, allowedColumns, "created_at");
//   const limit = safeLimit(q.limit, 500);
//   const offset = safeOffset(q.offset);
//
//   const rows = await db.execute(sql`
//     select * from commercial.customers
//     ${where}
//     order by ${sql.raw(orderBy)}
//     limit ${limit} offset ${offset}
//   `);
// ----------------------------------------------------------------

import { sql, type SQL } from "drizzle-orm";

// ────────────────────────────────────────────────────────────────
// WHERE clause assembly
// ────────────────────────────────────────────────────────────────

/**
 * Join an array of SQL fragments with ` AND ` and prefix with WHERE
 * if the array is non-empty. Returns an empty SQL fragment otherwise.
 *
 * Every fragment must already be a parameterized `sql` tagged template —
 * NEVER build fragments via `sql.raw(userString)`.
 *
 * @example
 *   const conditions: SQL[] = [];
 *   if (q.status) conditions.push(sql`status = ${q.status}`);
 *   const where = buildSafeWhere(conditions);
 *   // -> sql`WHERE status = $1` (with q.status bound as param)
 */
export function buildSafeWhere(conditions: SQL[]): SQL {
  if (!conditions || conditions.length === 0) {
    return sql``;
  }
  // Manually reduce because some Drizzle versions don't expose sql.join.
  let acc: SQL = sql`WHERE `;
  for (let i = 0; i < conditions.length; i++) {
    if (i === 0) {
      acc = sql`${acc}${conditions[i]}`;
    } else {
      acc = sql`${acc} AND ${conditions[i]}`;
    }
  }
  return acc;
}

// ────────────────────────────────────────────────────────────────
// ORDER BY clause — whitelist + safe emission
// ────────────────────────────────────────────────────────────────

const ALLOWED_DIRECTIONS = new Set(["asc", "desc", "ASC", "DESC"]);

/**
 * Produce a safe `ORDER BY col DIR` string that can be spliced into a
 * raw SQL tail. Column and direction are both whitelist-validated.
 *
 * Returns a plain string (not SQL fragment) because ORDER BY does not
 * accept parameterized identifiers in PostgreSQL. The string is only
 * safe because both inputs are validated against explicit whitelists —
 * never user-derived string interpolation.
 *
 * Throws if inputs are invalid, so callers should validate at the Zod
 * layer first and treat a throw here as a programmer bug.
 *
 * @param orderBy candidate column name — must be in `allowedColumns`
 * @param orderDir candidate direction — must be "asc" or "desc"
 * @param allowedColumns Set of column identifiers whitelisted for sorting
 * @param fallbackColumn column to use if orderBy is undefined
 * @param fallbackDir direction to use if orderDir is undefined
 */
export function buildSafeOrderBy(
  orderBy: string | undefined | null,
  orderDir: string | undefined | null,
  allowedColumns: Set<string>,
  fallbackColumn: string,
  fallbackDir: "asc" | "desc" = "desc",
): string {
  const col = orderBy && allowedColumns.has(orderBy) ? orderBy : fallbackColumn;
  if (!allowedColumns.has(col)) {
    throw new Error(
      `buildSafeOrderBy: fallback column '${fallbackColumn}' is not in the allowed set. ` +
        `This indicates a programmer bug — the fallback must be whitelisted.`,
    );
  }
  const dirRaw = (orderDir ?? fallbackDir).toLowerCase();
  const dir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : fallbackDir;
  if (!ALLOWED_DIRECTIONS.has(dir)) {
    throw new Error(`buildSafeOrderBy: invalid direction '${dir}'`);
  }
  return `${col} ${dir}`;
}

/**
 * Same as `buildSafeOrderBy` but returns an SQL fragment that uses
 * `sql.raw` internally on already-whitelisted values. Safe because the
 * inputs are both constrained by the whitelists above, never by user
 * input directly.
 */
export function buildSafeOrderByFragment(
  orderBy: string | undefined | null,
  orderDir: string | undefined | null,
  allowedColumns: Set<string>,
  fallbackColumn: string,
  fallbackDir: "asc" | "desc" = "desc",
): SQL {
  const clause = buildSafeOrderBy(orderBy, orderDir, allowedColumns, fallbackColumn, fallbackDir);
  return sql`ORDER BY ${sql.raw(clause)}`;
}

// ────────────────────────────────────────────────────────────────
// Pagination — LIMIT / OFFSET clamps
// ────────────────────────────────────────────────────────────────

/**
 * Coerce a user-supplied limit to a safe positive integer clamped to
 * `maxLimit`. Returns `defaultLimit` if the input is missing or
 * non-numeric.
 */
export function safeLimit(
  raw: unknown,
  maxLimit = 500,
  defaultLimit = 50,
): number {
  if (raw === null || raw === undefined || raw === "") return defaultLimit;
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultLimit;
  const i = Math.trunc(n);
  if (i <= 0) return defaultLimit;
  return Math.min(i, maxLimit);
}

/**
 * Coerce a user-supplied offset to a safe non-negative integer.
 * Returns 0 for missing/invalid input.
 */
export function safeOffset(raw: unknown, maxOffset = 10_000_000): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const i = Math.trunc(n);
  if (i < 0) return 0;
  return Math.min(i, maxOffset);
}

// ────────────────────────────────────────────────────────────────
// Identifier validation for dynamic column names in UPDATE builders
// ────────────────────────────────────────────────────────────────

/**
 * Validate a column name against a whitelist before it can be spliced
 * into SQL identifier position. Use this when building dynamic SET
 * clauses in PATCH handlers.
 *
 * @throws Error if the identifier is not in the whitelist
 */
export function safeIdentifier(
  identifier: string,
  allowedIdentifiers: Set<string>,
): string {
  if (!allowedIdentifiers.has(identifier)) {
    throw new Error(`safeIdentifier: '${identifier}' is not in the allowed identifier set`);
  }
  // Additional defense: ensure the identifier matches a strict pattern
  // (alphanumeric + underscore, starts with letter). Even though it's
  // in the whitelist, this is a belt-and-suspenders check.
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) {
    throw new Error(`safeIdentifier: '${identifier}' does not match the safe identifier pattern`);
  }
  return identifier;
}

/**
 * Build a parameterized SET clause for UPDATE statements from a plain
 * object of column → value pairs. Each column name is validated against
 * `allowedColumns` before being used as an identifier.
 *
 * @example
 *   const { fragment, hasUpdates } = buildSafeSetClause(
 *     { name: "Acme", updated_by: 42 },
 *     new Set(["name", "email", "phone", "updated_by"])
 *   );
 *   if (hasUpdates) {
 *     await db.execute(sql`update customers set ${fragment} where id = ${id}`);
 *   }
 */
export function buildSafeSetClause(
  updates: Record<string, unknown>,
  allowedColumns: Set<string>,
): { fragment: SQL; hasUpdates: boolean } {
  const fragments: SQL[] = [];
  for (const [col, val] of Object.entries(updates)) {
    if (val === undefined) continue;
    const safeCol = safeIdentifier(col, allowedColumns);
    fragments.push(sql`${sql.raw(safeCol)} = ${val}`);
  }
  if (fragments.length === 0) {
    return { fragment: sql``, hasUpdates: false };
  }
  let acc: SQL = fragments[0];
  for (let i = 1; i < fragments.length; i++) {
    acc = sql`${acc}, ${fragments[i]}`;
  }
  return { fragment: acc, hasUpdates: true };
}

// ────────────────────────────────────────────────────────────────
// Pagination metadata helper
// ────────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function buildPaginationMeta(
  totalRows: number,
  limit: number,
  offset: number,
): PaginationMeta {
  const pageSize = limit > 0 ? limit : 1;
  const page = Math.floor(offset / pageSize) + 1;
  const totalPages = pageSize > 0 ? Math.ceil(totalRows / pageSize) : 1;
  return {
    page,
    pageSize,
    total: totalRows,
    totalPages,
    hasNext: offset + pageSize < totalRows,
    hasPrev: offset > 0,
  };
}

// ────────────────────────────────────────────────────────────────
// Standard list-query envelope shape — applies across all domains
// ────────────────────────────────────────────────────────────────

export interface ListResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Wrap raw rows + total count into the canonical list response shape.
 */
export function buildListResponse<T>(
  rows: T[],
  totalRows: number,
  limit: number,
  offset: number,
): ListResponse<T> {
  return {
    data: rows,
    pagination: buildPaginationMeta(totalRows, limit, offset),
  };
}

// ────────────────────────────────────────────────────────────────
// Date range coercion — safe for filters
// ────────────────────────────────────────────────────────────────

/**
 * Parse a date string or Date object to ISO-8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`)
 * or return null. Callers should pass the result into a parameterized `sql`
 * binding — NEVER string-interpolate into `sql.raw`.
 *
 * @example
 *   const from = safeDateParam(q.from_date);
 *   if (from) conditions.push(sql`created_at >= ${from}`);
 */
export function safeDateParam(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) {
    return Number.isFinite(raw.getTime()) ? raw.toISOString() : null;
  }
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}
