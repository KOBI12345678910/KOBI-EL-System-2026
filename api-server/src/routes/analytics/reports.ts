// ============================================================
// analytics.report_definitions + report_runs CRUD + enqueue
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateReportSchema,
  UpdateReportSchema,
  ListReportsQuerySchema,
  EnqueueReportRunSchema,
  ListReportRunsQuerySchema,
  UpdateReportRunSchema,
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
  "report_code",
  "report_name",
  "category",
  "created_at",
  "updated_at",
]);
const ALLOWED_UPDATE_COLS = new Set([
  "report_code",
  "report_name",
  "report_label_he",
  "description",
  "category",
  "query_template",
  "parameters_schema",
  "output_format",
  "source_table",
  "is_active",
  "notes",
  "metadata",
  "record_code",
  "updated_by",
]);

// =====================================================
// report_definitions
// =====================================================

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListReportsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q)
      conditions.push(
        sql`(report_code ILIKE ${"%" + q.q + "%"} OR report_name ILIKE ${"%" + q.q + "%"} OR report_label_he ILIKE ${"%" + q.q + "%"})`,
      );
    if (q.category) conditions.push(sql`category = ${q.category}`);
    if (q.is_active !== undefined) conditions.push(sql`is_active = ${q.is_active}`);
    if (q.output_format) conditions.push(sql`output_format = ${q.output_format}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rowsRes = await db.execute(
      sql`select * from analytics.report_definitions ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from analytics.report_definitions ${where}`,
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
    sendDbError(res, err, "reports:list");
  }
});

router.get("/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  try {
    const r = await db.execute(
      sql`select * from analytics.report_definitions where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "דוח לא נמצא" });
    const runs = await db.execute(
      sql`select * from analytics.report_runs where report_id = ${id} order by created_at desc limit 50`,
    );
    res.json({ ...row, recent_runs: runs.rows ?? [] });
  } catch (err) {
    sendDbError(res, err, "reports:get");
  }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateReportSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into analytics.report_definitions
        (report_code, report_name, report_label_he, description, category, query_template,
         parameters_schema, output_format, source_table, is_active, notes, metadata,
         created_by, updated_by)
      values
        (${d.report_code}, ${d.report_name}, ${d.report_label_he ?? null}, ${d.description ?? null},
         ${d.category ?? null}, ${d.query_template ?? null},
         ${jsonbParam(d.parameters_schema ?? {})}::jsonb, ${d.output_format ?? "table"},
         ${d.source_table ?? null}, ${d.is_active ?? true}, ${d.notes ?? null},
         ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) {
    sendDbError(res, err, "reports:create");
  }
});

router.put("/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  const d = parseBody(UpdateReportSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.parameters_schema !== undefined)
      updates.parameters_schema = jsonbParam(d.parameters_schema);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(
      sql`update analytics.report_definitions set ${fragment}, updated_at = now() where id = ${id} returning *`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "דוח לא נמצא" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "reports:update");
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      update analytics.report_definitions
         set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now()
       where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "דוח לא נמצא" });
    res.json({ success: true, id });
  } catch (err) {
    sendDbError(res, err, "reports:delete");
  }
});

// =====================================================
// POST /:id/run — enqueue a report run
// =====================================================

router.post("/:id/run", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  const d = parseBody(EnqueueReportRunSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const exists = await db.execute(
      sql`select id from analytics.report_definitions where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    if (!(exists.rows ?? []).length)
      return res.status(404).json({ error: "דוח לא נמצא" });
    const r = await db.execute(sql`
      insert into analytics.report_runs (report_id, status, parameters, requested_by, metadata)
      values (${id}, 'queued', ${jsonbParam(d.parameters ?? {})}::jsonb, ${uid},
              ${jsonbParam({ enqueued_at: new Date().toISOString() })}::jsonb)
      returning *`);
    res.status(202).json({ success: true, run: (r.rows ?? [])[0] });
  } catch (err) {
    sendDbError(res, err, "reports:enqueue-run");
  }
});

// =====================================================
// report_runs subresource
// =====================================================

router.get("/runs/list", async (req, res) => {
  const q = parseQuery(ListReportRunsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.report_id) conditions.push(sql`report_id = ${q.report_id}`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    const where = buildSafeWhere(conditions);
    const allowed = new Set([
      "id",
      "report_id",
      "status",
      "started_at",
      "finished_at",
      "created_at",
    ]);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, allowed, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);
    const rowsRes = await db.execute(
      sql`select * from analytics.report_runs ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from analytics.report_runs ${where}`,
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
    sendDbError(res, err, "report-runs:list");
  }
});

router.put("/runs/:id", async (req, res) => {
  const id = parseUuidId(req, res);
  if (!id) return;
  const d = parseBody(UpdateReportRunSchema, req, res);
  if (!d) return;
  try {
    const updates: Record<string, unknown> = { ...d };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    const allowedRunCols = new Set([
      "status",
      "output_uri",
      "row_count",
      "error_message",
      "started_at",
      "finished_at",
      "duration_ms",
      "metadata",
    ]);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, allowedRunCols);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(
      sql`update analytics.report_runs set ${fragment}, updated_at = now() where id = ${id} returning *`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "ריצה לא נמצאה" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "report-runs:update");
  }
});

export default router;
