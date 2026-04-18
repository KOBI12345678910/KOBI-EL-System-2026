// ============================================================
// analytics.custom_metrics CRUD
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateCustomMetricSchema,
  UpdateCustomMetricSchema,
  ListCustomMetricsQuerySchema,
} from "@workspace/api-zod/analytics";
import { authMiddleware } from "../../middleware/auth";
import {
  db,
  sql,
  type SQL,
  parseBody,
  parseQuery,
  parseIntId,
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
  "metric_code",
  "metric_name",
  "category",
  "created_at",
  "updated_at",
]);
const ALLOWED_UPDATE_COLS = new Set([
  "metric_code",
  "metric_name",
  "category",
  "formula",
  "unit",
  "aggregation_type",
  "data_source_table",
  "is_active",
  "notes",
  "metadata",
  "record_code",
  "updated_by",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListCustomMetricsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q)
      conditions.push(
        sql`(metric_code ILIKE ${"%" + q.q + "%"} OR metric_name ILIKE ${"%" + q.q + "%"})`,
      );
    if (q.category) conditions.push(sql`category = ${q.category}`);
    if (q.is_active !== undefined) conditions.push(sql`is_active = ${q.is_active}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(
      q.order_by,
      q.order_dir,
      ALLOWED_ORDER_BY,
      "metric_code",
      "asc",
    );
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rowsRes = await db.execute(
      sql`select * from analytics.custom_metrics ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from analytics.custom_metrics ${where}`,
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
    sendDbError(res, err, "custom-metrics:list");
  }
});

router.get("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  try {
    const r = await db.execute(
      sql`select * from analytics.custom_metrics where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "מדד מותאם לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "custom-metrics:get");
  }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateCustomMetricSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into analytics.custom_metrics
        (metric_code, metric_name, category, formula, unit, aggregation_type, data_source_table,
         is_active, notes, metadata, created_by, updated_by)
      values
        (${d.metric_code}, ${d.metric_name}, ${d.category ?? null}, ${d.formula ?? null},
         ${d.unit ?? null}, ${d.aggregation_type ?? null}, ${d.data_source_table ?? null},
         ${d.is_active ?? true}, ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb,
         ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) {
    sendDbError(res, err, "custom-metrics:create");
  }
});

router.put("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const d = parseBody(UpdateCustomMetricSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(
      sql`update analytics.custom_metrics set ${fragment}, updated_at = now() where id = ${id} returning *`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "מדד מותאם לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "custom-metrics:update");
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      update analytics.custom_metrics
         set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now()
       where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "מדד מותאם לא נמצא" });
    res.json({ success: true, id });
  } catch (err) {
    sendDbError(res, err, "custom-metrics:delete");
  }
});

export default router;
