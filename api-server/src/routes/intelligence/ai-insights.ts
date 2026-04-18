// ============================================================
// intelligence.ai_insights CRUD + state actions
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateAIInsightSchema,
  UpdateAIInsightSchema,
  ListAIInsightsQuerySchema,
} from "@workspace/api-zod/intelligence";
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "generated_at", "status", "severity", "category"]);
const ALLOWED_UPDATE_COLS = new Set([
  "insight_number","parent_entity_type","parent_entity_id","category","confidence_score",
  "severity","recommendation_text","recommended_action","status","notes","metadata",
  "is_active","is_deleted","record_code","updated_by",
]);

// LIST
router.get("/ai-insights", async (req: Request, res: Response) => {
  const q = parseQuery(ListAIInsightsQuerySchema, req, res);
  if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`(insight_number ILIKE ${"%" + q.q + "%"} OR recommendation_text ILIKE ${"%" + q.q + "%"})`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.category) conditions.push(sql`category = ${q.category}`);
    if (q.severity) conditions.push(sql`severity = ${q.severity}`);
    if (q.parent_entity_type) conditions.push(sql`parent_entity_type = ${q.parent_entity_type}`);
    if (q.parent_entity_id) conditions.push(sql`parent_entity_id = ${q.parent_entity_id}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.ai_insights ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.ai_insights ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "ai-insights:list"); }
});

// READ
router.get("/ai-insights/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.ai_insights where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "ai-insights:get"); }
});

// CREATE
router.post("/ai-insights", async (req, res) => {
  const d = parseBody(CreateAIInsightSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.ai_insights
        (insight_number, parent_entity_type, parent_entity_id, category, confidence_score,
         severity, recommendation_text, recommended_action, status, notes, metadata,
         created_by, updated_by)
      values
        (${d.insight_number}, ${d.parent_entity_type}, ${d.parent_entity_id}, ${d.category ?? null}, ${d.confidence_score ?? null},
         ${d.severity ?? null}, ${d.recommendation_text ?? null}, ${d.recommended_action ?? null}, ${d.status ?? "generated"}, ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb,
         ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "ai-insights:create"); }
});

// UPDATE
router.put("/ai-insights/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateAIInsightSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.ai_insights set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "ai-insights:update"); }
});

// SOFT DELETE
router.delete("/ai-insights/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.ai_insights set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "ai-insights:delete"); }
});

// Actions — acknowledge / action / dismiss
async function transitionStatus(req: Request, res: Response, target: string, label: string) {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.ai_insights set status = ${target}, updated_by = ${uid}, updated_at = now() where id = ${id} and coalesce(is_deleted,false)=false returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, insight: row, action: label });
  } catch (err) { sendDbError(res, err, `ai-insights:${label}`); }
}

router.post("/ai-insights/:id/acknowledge", (req, res) => transitionStatus(req, res, "acknowledged", "acknowledge"));
router.post("/ai-insights/:id/action",      (req, res) => transitionStatus(req, res, "actioned",     "action"));
router.post("/ai-insights/:id/dismiss",     (req, res) => transitionStatus(req, res, "dismissed",    "dismiss"));

export default router;
