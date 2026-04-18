// ============================================================
// intelligence.seasonality_patterns CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateSeasonalityPatternSchema,
  UpdateSeasonalityPatternSchema,
  ListSeasonalityPatternsQuerySchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "generated_at", "pattern_type"]);
const ALLOWED_UPDATE_COLS = new Set([
  "pattern_type","parent_entity_type","parent_entity_id","pattern_payload",
  "notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/seasonality-patterns", async (req, res) => {
  const q = parseQuery(ListSeasonalityPatternsQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`pattern_type ILIKE ${"%" + q.q + "%"}`);
    if (q.pattern_type) conditions.push(sql`pattern_type = ${q.pattern_type}`);
    if (q.parent_entity_type) conditions.push(sql`parent_entity_type = ${q.parent_entity_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.seasonality_patterns ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.seasonality_patterns ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "seasonality-patterns:list"); }
});

router.get("/seasonality-patterns/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.seasonality_patterns where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "seasonality-patterns:get"); }
});

router.post("/seasonality-patterns", async (req, res) => {
  const d = parseBody(CreateSeasonalityPatternSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.seasonality_patterns
        (pattern_type, parent_entity_type, parent_entity_id, pattern_payload, notes, metadata, created_by, updated_by)
      values
        (${d.pattern_type}, ${d.parent_entity_type ?? null}, ${d.parent_entity_id ?? null}, ${jsonbParam(d.pattern_payload)}::jsonb,
         ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "seasonality-patterns:create"); }
});

router.put("/seasonality-patterns/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateSeasonalityPatternSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.pattern_payload !== undefined) updates.pattern_payload = jsonbParam(d.pattern_payload);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.seasonality_patterns set ${fragment} where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "seasonality-patterns:update"); }
});

router.delete("/seasonality-patterns/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.seasonality_patterns set is_deleted = true, is_active = false, updated_by = ${uid} where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "seasonality-patterns:delete"); }
});

export default router;
