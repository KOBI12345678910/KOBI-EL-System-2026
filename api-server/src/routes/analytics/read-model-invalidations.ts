// ============================================================
// analytics.read_model_invalidations CRUD + POST /:id/reprocess
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateInvalidationSchema,
  UpdateInvalidationSchema,
  ListInvalidationsQuerySchema,
  ReprocessInvalidationSchema,
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
  "read_model_name",
  "status",
  "created_at",
  "processed_at",
]);
const ALLOWED_UPDATE_COLS = new Set([
  "read_model_name",
  "trigger_reason",
  "payload",
  "status",
  "processed_at",
  "error_message",
  "retry_count",
  "notes",
  "metadata",
]);

router.get("/", async (req: Request, res: Response) => {
  const q = parseQuery(ListInvalidationsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`read_model_name ILIKE ${"%" + q.q + "%"}`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.read_model_name) conditions.push(sql`read_model_name = ${q.read_model_name}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(
      q.order_by,
      q.order_dir,
      ALLOWED_ORDER_BY,
      "created_at",
    );
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rowsRes = await db.execute(
      sql`select * from analytics.read_model_invalidations ${where} ${orderBy} limit ${limit} offset ${offset}`,
    );
    const countRes = await db.execute(
      sql`select count(*)::bigint as total from analytics.read_model_invalidations ${where}`,
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
    sendDbError(res, err, "read-model-invalidations:list");
  }
});

router.get("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  try {
    const r = await db.execute(
      sql`select * from analytics.read_model_invalidations where id = ${id} and coalesce(is_deleted,false)=false limit 1`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "בקשת חידוש לא נמצאה" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "read-model-invalidations:get");
  }
});

router.post("/", async (req, res) => {
  const d = parseBody(CreateInvalidationSchema, req, res);
  if (!d) return;
  try {
    const r = await db.execute(sql`
      insert into analytics.read_model_invalidations
        (read_model_name, trigger_reason, payload, status, notes, metadata)
      values
        (${d.read_model_name}, ${d.trigger_reason ?? null},
         ${jsonbParam(d.payload ?? {})}::jsonb, ${d.status ?? "pending"},
         ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb)
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) {
    sendDbError(res, err, "read-model-invalidations:create");
  }
});

router.put("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const d = parseBody(UpdateInvalidationSchema, req, res);
  if (!d) return;
  try {
    const updates: Record<string, unknown> = { ...d };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.payload !== undefined) updates.payload = jsonbParam(d.payload);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(
      sql`update analytics.read_model_invalidations set ${fragment} where id = ${id} returning *`,
    );
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "בקשת חידוש לא נמצאה" });
    res.json(row);
  } catch (err) {
    sendDbError(res, err, "read-model-invalidations:update");
  }
});

router.delete("/:id", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  try {
    const r = await db.execute(
      sql`update analytics.read_model_invalidations set is_deleted = true where id = ${id} returning id`,
    );
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "בקשת חידוש לא נמצאה" });
    res.json({ success: true, id });
  } catch (err) {
    sendDbError(res, err, "read-model-invalidations:delete");
  }
});

// POST /:id/reprocess — reset status to pending + bump retry_count
router.post("/:id/reprocess", async (req, res) => {
  const id = parseIntId(req, res);
  if (!id) return;
  const d = parseBody(ReprocessInvalidationSchema, req, res);
  if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      update analytics.read_model_invalidations
         set status = 'pending',
             retry_count = coalesce(retry_count, 0) + 1,
             error_message = null,
             metadata = coalesce(metadata, '{}'::jsonb) ||
                        ${jsonbParam({ reprocess_reason: d.reason ?? null, reprocess_by: uid, reprocess_at: new Date().toISOString() })}::jsonb
       where id = ${id} and coalesce(is_deleted, false) = false
       returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "בקשת חידוש לא נמצאה" });
    res.status(202).json({ success: true, invalidation: row });
  } catch (err) {
    sendDbError(res, err, "read-model-invalidations:reprocess");
  }
});

export default router;
