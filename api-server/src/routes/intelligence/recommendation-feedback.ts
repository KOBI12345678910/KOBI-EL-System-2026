// ============================================================
// intelligence.recommendation_feedback CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateRecommendationFeedbackSchema,
  UpdateRecommendationFeedbackSchema,
  ListRecommendationFeedbackQuerySchema,
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
  "recommendation_id","feedback_type","feedback_notes","provided_by_user_id","provided_at",
  "notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/recommendation-feedback", async (req, res) => {
  const q = parseQuery(ListRecommendationFeedbackQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`(feedback_type ILIKE ${"%" + q.q + "%"} OR feedback_notes ILIKE ${"%" + q.q + "%"})`);
    if (q.recommendation_id) conditions.push(sql`recommendation_id = ${q.recommendation_id}`);
    if (q.feedback_type) conditions.push(sql`feedback_type = ${q.feedback_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.recommendation_feedback ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.recommendation_feedback ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "recommendation-feedback:list"); }
});

router.get("/recommendation-feedback/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.recommendation_feedback where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "recommendation-feedback:get"); }
});

router.post("/recommendation-feedback", async (req, res) => {
  const d = parseBody(CreateRecommendationFeedbackSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.recommendation_feedback
        (recommendation_id, feedback_type, feedback_notes, provided_by_user_id, provided_at, notes, metadata, created_by, updated_by)
      values
        (${d.recommendation_id}, ${d.feedback_type}, ${d.feedback_notes ?? null}, ${d.provided_by_user_id ?? uid}, ${d.provided_at ?? new Date().toISOString()},
         ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "recommendation-feedback:create"); }
});

router.put("/recommendation-feedback/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateRecommendationFeedbackSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.recommendation_feedback set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "recommendation-feedback:update"); }
});

router.delete("/recommendation-feedback/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.recommendation_feedback set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "recommendation-feedback:delete"); }
});

export default router;
