// ============================================================
// intelligence.anomaly_feedback CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateAnomalyFeedbackSchema,
  UpdateAnomalyFeedbackSchema,
  ListAnomalyFeedbackQuerySchema,
} from "@workspace/api-zod/intelligence";
import { authMiddleware } from "../../middleware/auth";
import {
  db, sql, type SQL,
  parseBody, parseQuery, parseIntId, sendDbError, getUserId, jsonbParam,
  buildSafeWhere, buildSafeOrderByFragment, buildSafeSetClause,
  safeLimit, safeOffset, buildListResponse,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "updated_at", "provided_at", "feedback_type"]);
const ALLOWED_UPDATE_COLS = new Set([
  "anomaly_case_id","feedback_type","feedback_label","feedback_notes","provided_by_user_id","provided_at",
  "notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/anomaly-feedback", async (req, res) => {
  const q = parseQuery(ListAnomalyFeedbackQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`(feedback_type ILIKE ${"%" + q.q + "%"} OR feedback_notes ILIKE ${"%" + q.q + "%"})`);
    if (q.anomaly_case_id) conditions.push(sql`anomaly_case_id = ${q.anomaly_case_id}`);
    if (q.feedback_type) conditions.push(sql`feedback_type = ${q.feedback_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.anomaly_feedback ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.anomaly_feedback ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "anomaly-feedback:list"); }
});

router.get("/anomaly-feedback/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.anomaly_feedback where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "anomaly-feedback:get"); }
});

router.post("/anomaly-feedback", async (req, res) => {
  const d = parseBody(CreateAnomalyFeedbackSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.anomaly_feedback
        (anomaly_case_id, feedback_type, feedback_label, feedback_notes, provided_by_user_id, provided_at, notes, metadata, created_by, updated_by)
      values
        (${d.anomaly_case_id}, ${d.feedback_type}, ${d.feedback_label ?? null}, ${d.feedback_notes ?? null},
         ${d.provided_by_user_id ?? uid}, ${d.provided_at ?? new Date().toISOString()}, ${d.notes ?? null},
         ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "anomaly-feedback:create"); }
});

router.put("/anomaly-feedback/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateAnomalyFeedbackSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.anomaly_feedback set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "anomaly-feedback:update"); }
});

router.delete("/anomaly-feedback/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.anomaly_feedback set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "anomaly-feedback:delete"); }
});

export default router;
