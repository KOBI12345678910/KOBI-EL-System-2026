// ============================================================
// CRUD factory for execution routes
// Generates standard GET list, GET one, POST, PUT, DELETE for any table.
// ============================================================
import { Router } from "express";
import type { RequestHandler } from "express";
import { requireExecutionAuth, query, audit, asyncHandler, validate } from "./_shared";

interface CrudOpts<TCreate, TUpdate, TListQuery> {
  schema: string;      // e.g. "execution"
  table: string;       // e.g. "projects"
  pk?: string;         // default "id"
  jsonbColumns?: string[]; // columns that should be JSON.stringify'd
  softDelete?: boolean;    // if true, sets is_deleted=true instead of delete
  createSchema: { safeParse: (v: unknown) => { success: true; data: TCreate } | { success: false; error: unknown } };
  updateSchema: { safeParse: (v: unknown) => { success: true; data: TUpdate } | { success: false; error: unknown } };
  listQuerySchema: { safeParse: (v: unknown) => { success: true; data: TListQuery } | { success: false; error: unknown } };
  listFilters?: Array<{ key: string; column?: string; kind?: "eq" | "ilike" | "bool" | "gte" | "lte" }>;
  searchColumns?: string[]; // columns searched when ?q= is provided
  orderByAllowed?: string[]; // columns permitted for ORDER BY
  defaultOrderBy?: string;
  beforeCreate?: (v: TCreate, req: Parameters<RequestHandler>[0]) => TCreate;
}

export function makeCrudRouter<
  TCreate extends Record<string, unknown>,
  TUpdate extends Record<string, unknown>,
  TListQuery extends Record<string, unknown>
>(opts: CrudOpts<TCreate, TUpdate, TListQuery>): Router {
  const router = Router();
  router.use(requireExecutionAuth);

  const pk = opts.pk ?? "id";
  const tableFqn = `${opts.schema}.${opts.table}`;
  const jsonb = new Set(opts.jsonbColumns ?? ["metadata"]);
  const orderAllowed = new Set(opts.orderByAllowed ?? ["created_at", "updated_at", "id"]);
  const defaultOrder = opts.defaultOrderBy ?? "created_at";

  // LIST
  router.get("/", asyncHandler(async (req, res) => {
    const q = validate(opts.listQuerySchema, req.query, res);
    if (!q) return;
    const qa = q as unknown as Record<string, unknown>;
    const filters: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (opts.softDelete !== false) filters.push("is_deleted = false");
    for (const f of opts.listFilters ?? []) {
      const val = qa[f.key];
      if (val === undefined || val === null || val === "") continue;
      const col = f.column ?? f.key;
      if (f.kind === "ilike") { filters.push(`${col} ILIKE $${i++}`); params.push(`%${val}%`); }
      else if (f.kind === "gte") { filters.push(`${col} >= $${i++}`); params.push(val); }
      else if (f.kind === "lte") { filters.push(`${col} <= $${i++}`); params.push(val); }
      else if (f.kind === "bool") { filters.push(`${col} = $${i++}`); params.push(val); }
      else { filters.push(`${col} = $${i++}`); params.push(val); }
    }
    const qs = (qa.q as string | undefined);
    if (qs && (opts.searchColumns ?? []).length) {
      const searchParts = opts.searchColumns!.map(() => `$${i}`);
      const colParts = opts.searchColumns!.map((c, idx) => `${c} ILIKE ${searchParts[idx]}`);
      filters.push(`(${colParts.join(" OR ")})`);
      params.push(`%${qs}%`);
      i++;
    }
    const orderByRaw = (qa.order_by as string) ?? defaultOrder;
    const orderBy = orderAllowed.has(orderByRaw) ? orderByRaw : defaultOrder;
    const orderDir = qa.order_dir === "asc" ? "asc" : "desc";
    const limit = Math.min(500, Math.max(1, Number(qa.limit ?? 50)));
    const offset = Math.max(0, Number(qa.offset ?? 0));
    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const rows = await query(
      `SELECT * FROM ${tableFqn} ${whereClause} ORDER BY ${orderBy} ${orderDir} LIMIT $${i++} OFFSET $${i}`,
      [...params, limit, offset]
    );
    const countRows = await query<{ count: string }>(
      `SELECT COUNT(*)::text as count FROM ${tableFqn} ${whereClause}`,
      params
    );
    res.json({ data: rows, total: parseInt(countRows[0]?.count ?? "0", 10), limit, offset });
  }));

  // GET ONE
  router.get("/:id", asyncHandler(async (req, res) => {
    const softFilter = opts.softDelete !== false ? ` AND is_deleted = false` : "";
    const rows = await query(`SELECT * FROM ${tableFqn} WHERE ${pk} = $1${softFilter}`, [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: `${opts.table} not found` }); return; }
    res.json({ data: rows[0] });
  }));

  // CREATE
  router.post("/", asyncHandler(async (req, res) => {
    let v = validate(opts.createSchema, req.body, res);
    if (!v) return;
    if (opts.beforeCreate) v = opts.beforeCreate(v, req);
    const keys = Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined);
    const cols: string[] = [];
    const placeholders: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const k of keys) {
      cols.push(k);
      if (jsonb.has(k)) {
        placeholders.push(`$${i++}::jsonb`);
        params.push(JSON.stringify((v as Record<string, unknown>)[k] ?? {}));
      } else {
        placeholders.push(`$${i++}`);
        params.push((v as Record<string, unknown>)[k]);
      }
    }
    // Audit columns
    if (req.userId) {
      cols.push("created_by", "updated_by");
      placeholders.push(`$${i++}`, `$${i++}`);
      params.push(parseInt(req.userId, 10), parseInt(req.userId, 10));
    }
    const rows = await query(
      `INSERT INTO ${tableFqn} (${cols.join(", ")}) VALUES (${placeholders.join(", ")}) RETURNING *`,
      params
    );
    await audit(req, tableFqn, (rows[0] as { id: number }).id, "INSERT", null, rows[0]);
    res.status(201).json({ data: rows[0] });
  }));

  // UPDATE
  router.put("/:id", asyncHandler(async (req, res) => {
    const v = validate(opts.updateSchema, req.body, res);
    if (!v) return;
    const fields: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    for (const [k, val] of Object.entries(v)) {
      if (val === undefined) continue;
      if (jsonb.has(k)) { fields.push(`${k} = $${i++}::jsonb`); params.push(JSON.stringify(val)); }
      else { fields.push(`${k} = $${i++}`); params.push(val); }
    }
    if (!fields.length) { res.status(400).json({ error: "No fields to update" }); return; }
    fields.push(`updated_at = now()`);
    if (req.userId) { fields.push(`updated_by = $${i++}`); params.push(parseInt(req.userId, 10)); }
    params.push(req.params.id);
    const softFilter = opts.softDelete !== false ? ` AND is_deleted = false` : "";
    const rows = await query(
      `UPDATE ${tableFqn} SET ${fields.join(", ")} WHERE ${pk} = $${i}${softFilter} RETURNING *`,
      params
    );
    if (!rows.length) { res.status(404).json({ error: `${opts.table} not found` }); return; }
    await audit(req, tableFqn, req.params.id, "UPDATE", null, rows[0]);
    res.json({ data: rows[0] });
  }));

  // DELETE
  router.delete("/:id", asyncHandler(async (req, res) => {
    if (opts.softDelete !== false) {
      const rows = await query(
        `UPDATE ${tableFqn} SET is_deleted = true, is_active = false, updated_at = now() WHERE ${pk} = $1 RETURNING ${pk}`,
        [req.params.id]
      );
      if (!rows.length) { res.status(404).json({ error: `${opts.table} not found` }); return; }
    } else {
      const rows = await query(`DELETE FROM ${tableFqn} WHERE ${pk} = $1 RETURNING ${pk}`, [req.params.id]);
      if (!rows.length) { res.status(404).json({ error: `${opts.table} not found` }); return; }
    }
    await audit(req, tableFqn, req.params.id, "DELETE", null, null);
    res.json({ ok: true });
  }));

  return router;
}
