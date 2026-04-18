// ============================================================
// analytics.kpi_definitions CRUD + POST /:id/compute
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateKpiDefinitionSchema,
  UpdateKpiDefinitionSchema,
  ListKpiDefinitionsQuerySchema,
  ComputeKpiSnapshotSchema,
} from "@workspace/api-zod/analytics";
import { authMiddleware } from "../../middleware/auth";
import {
  db,
  sql,
  type SQL,
  parseBody,
  parseQuery,
  parseUuidId,
  sendDbError,
  getUserId,
  jsonbParam,
  buildSafeWhere,
  buildSafeOrderByFragment,
  buildSafeSetClause,
  safeLimit,
  safeOffset,
  buildListResponse,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);

const ALLOWED_ORDER_BY = new Set([
  "id",
  "kpi_name",
  "category",
  "comparison_type",
  "created_at",
  "updated_at",
]);
const ALLOWED_UPDATE_COLS = new Set([
  "kpi_name",
  "kpi_label_he",
  "formula_jsonb",
  "unit",
  "target_value",
  "comparison_type",
  "data_source_table",
  "data_source_query",
  "refresh_cron",
  "category",
  "is_active",
  "notes",
  "metadata",
  "record_code",
  "updated_by",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListKpiDefinitionsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q)
      conditions.push(
        sql`(kpi_name ILIKE ${"%" + q.q + "%"} OR kpi_label_he ILIKE ${"%" + q.q + "%"})`,
      );
    if (q.category) conditions.push(sql`category = ${q.category}`);
    if (q.is_active !== undefined) conditions.push(sql`is_active = ${q.is_active}`);
    if (q.comparison_type) conditions.push(sql`comparison_type = ${q.comparison_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "kpi_name", "asc");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rowsRes = await db.execute(
      sql`select * from analytics.kpi_definitions ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from analytics.kpi_definitions ${where}`,
    );
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({
      ...buildListResponse(rowsRes.rows ?? [], total, limit, offset),
      rows: rowsRes.rows ?? [],
      total,
      limit,
      offset,
    });
  } catch (err) {
    sendDbError(res, err, "kpi-definitions:list");
  }
});

router.get("/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  try {
    const r = await db.execute(
      sql`select * from analytics.kpi_definitions where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הגדרת KPI לא נמצאה" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "kpi-definitions:get");
  }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateKpiDefinitionSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into analytics.kpi_definitions
        (kpi_name, kpi_label_he, formula_jsonb, unit, target_value, comparison_type,
         data_source_table, data_source_query, refresh_cron, category, is_active, notes,
         metadata, created_by, updated_by)
      values
        (${d.kpi_name}, ${d.kpi_label_he ?? null}, ${jsonbParam(d.formula_jsonb ?? {})}::jsonb,
         ${d.unit ?? null}, ${d.target_value ?? null}, ${d.comparison_type ?? "higher_is_better"},
         ${d.data_source_table ?? null}, ${d.data_source_query ?? null},
         ${d.refresh_cron ?? null}, ${d.category ?? null}, ${d.is_active ?? true},
         ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) {
    sendDbError(res, err, "kpi-definitions:create");
  }
});

router.put("/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  const d = parseBody(UpdateKpiDefinitionSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.formula_jsonb !== undefined) updates.formula_jsonb = jsonbParam(d.formula_jsonb);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(
      sql`update analytics.kpi_definitions set ${fragment}, updated_at = now() where id = ${id} returning *`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "הגדרת KPI לא נמצאה" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "kpi-definitions:update");
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      update analytics.kpi_definitions
         set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now()
       where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "הגדרת KPI לא נמצאה" });
    res.json({ success: true, id });
  } catch (err) {
    sendDbError(res, err, "kpi-definitions:delete");
  }
});

// POST /:id/compute — enqueue a snapshot compute
router.post("/:id/compute", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  const d = parseBody(ComputeKpiSnapshotSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const kpi = await db.execute(
      sql`select kpi_name from analytics.kpi_definitions where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    const row = (kpi.rows ?? [])[0] as { kpi_name?: string } | undefined;
    if (!row?.kpi_name) return res.status(404).json({ error: "הגדרת KPI לא נמצאה" });

    const asOf = d.as_of_date ?? new Date().toISOString().slice(0, 10);
    // Record an invalidation so the read-model worker knows to recompute.
    const inv = await db.execute(sql`
      insert into analytics.read_model_invalidations
        (read_model_name, trigger_reason, payload, status, metadata)
      values
        (${row.kpi_name}, 'kpi_compute_requested',
         ${jsonbParam({ kpi_id: id, as_of_date: asOf, parameters: d.parameters ?? {}, requested_by: uid })}::jsonb,
         'pending',
         ${jsonbParam({ source: "api/analytics/kpi-definitions/:id/compute" })}::jsonb)
      returning *`);
    res.status(202).json({
      success: true,
      kpi_name: row.kpi_name,
      as_of_date: asOf,
      invalidation: (inv.rows ?? [])[0],
      message: "חישוב KPI נשלח לעיבוד",
    });
  } catch (err) {
    sendDbError(res, err, "kpi-definitions:compute");
  }
});

export default router;
