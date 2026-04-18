// ============================================================
// intelligence.decision_recommendations CRUD + state actions
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateDecisionRecommendationSchema,
  UpdateDecisionRecommendationSchema,
  ListDecisionRecommendationsQuerySchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "generated_at", "status", "priority", "confidence_score"]);
const ALLOWED_UPDATE_COLS = new Set([
  "recommendation_number","parent_entity_type","parent_entity_id","recommendation_type","recommendation_text",
  "priority","confidence_score","action_code","status","notes","metadata","is_active","is_deleted","record_code","updated_by","actioned_at",
]);

router.get("/decision-recommendations", async (req, res) => {
  const q = parseQuery(ListDecisionRecommendationsQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`(recommendation_number ILIKE ${"%" + q.q + "%"} OR recommendation_text ILIKE ${"%" + q.q + "%"})`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.recommendation_type) conditions.push(sql`recommendation_type = ${q.recommendation_type}`);
    if (q.priority) conditions.push(sql`priority = ${q.priority}`);
    if (q.parent_entity_type) conditions.push(sql`parent_entity_type = ${q.parent_entity_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.decision_recommendations ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.decision_recommendations ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "decision-recommendations:list"); }
});

router.get("/decision-recommendations/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.decision_recommendations where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "decision-recommendations:get"); }
});

router.post("/decision-recommendations", async (req, res) => {
  const d = parseBody(CreateDecisionRecommendationSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.decision_recommendations
        (recommendation_number, parent_entity_type, parent_entity_id, recommendation_type, recommendation_text,
         priority, confidence_score, action_code, status, notes, metadata, created_by, updated_by)
      values
        (${d.recommendation_number}, ${d.parent_entity_type}, ${d.parent_entity_id}, ${d.recommendation_type}, ${d.recommendation_text},
         ${d.priority ?? null}, ${d.confidence_score ?? null}, ${d.action_code ?? null}, ${d.status ?? "pending"}, ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb,
         ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "decision-recommendations:create"); }
});

router.put("/decision-recommendations/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateDecisionRecommendationSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.decision_recommendations set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "decision-recommendations:update"); }
});

router.delete("/decision-recommendations/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.decision_recommendations set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "decision-recommendations:delete"); }
});

async function transition(req: Request, res: Response, target: string, label: string) {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.decision_recommendations set status = ${target}, actioned_at = now(), updated_by = ${uid}, updated_at = now() where id = ${id} and coalesce(is_deleted,false)=false returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, recommendation: row, action: label });
  } catch (err) { sendDbError(res, err, `decision-recommendations:${label}`); }
}

router.post("/decision-recommendations/:id/accept", (req, res) => transition(req, res, "accepted", "accept"));
router.post("/decision-recommendations/:id/reject", (req, res) => transition(req, res, "rejected", "reject"));

export default router;
