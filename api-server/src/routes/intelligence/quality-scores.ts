// ============================================================
// intelligence.quality_scores CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateQualityScoreSchema,
  UpdateQualityScoreSchema,
  ListQualityScoresQuerySchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "scored_at", "score_type", "score_value"]);
const ALLOWED_UPDATE_COLS = new Set([
  "parent_entity_type","parent_entity_id","score_type","score_value","explanation",
  "notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/quality-scores", async (req, res) => {
  const q = parseQuery(ListQualityScoresQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`score_type ILIKE ${"%" + q.q + "%"}`);
    if (q.score_type) conditions.push(sql`score_type = ${q.score_type}`);
    if (q.parent_entity_type) conditions.push(sql`parent_entity_type = ${q.parent_entity_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.quality_scores ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.quality_scores ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "quality-scores:list"); }
});

router.get("/quality-scores/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.quality_scores where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "quality-scores:get"); }
});

router.post("/quality-scores", async (req, res) => {
  const d = parseBody(CreateQualityScoreSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.quality_scores
        (parent_entity_type, parent_entity_id, score_type, score_value, explanation, notes, metadata, created_by, updated_by)
      values
        (${d.parent_entity_type}, ${d.parent_entity_id}, ${d.score_type}, ${d.score_value}, ${d.explanation ?? null},
         ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "quality-scores:create"); }
});

router.put("/quality-scores/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateQualityScoreSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.quality_scores set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "quality-scores:update"); }
});

router.delete("/quality-scores/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.quality_scores set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "quality-scores:delete"); }
});

export default router;
