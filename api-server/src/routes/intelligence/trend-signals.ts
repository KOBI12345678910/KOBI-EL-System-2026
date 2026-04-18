// ============================================================
// intelligence.trend_signals CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateTrendSignalSchema,
  UpdateTrendSignalSchema,
  ListTrendSignalsQuerySchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "generated_at", "signal_type", "signal_value"]);
const ALLOWED_UPDATE_COLS = new Set([
  "signal_type","parent_entity_type","parent_entity_id","signal_value","payload",
  "notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/trend-signals", async (req, res) => {
  const q = parseQuery(ListTrendSignalsQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`signal_type ILIKE ${"%" + q.q + "%"}`);
    if (q.signal_type) conditions.push(sql`signal_type = ${q.signal_type}`);
    if (q.parent_entity_type) conditions.push(sql`parent_entity_type = ${q.parent_entity_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.trend_signals ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.trend_signals ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "trend-signals:list"); }
});

router.get("/trend-signals/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.trend_signals where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "trend-signals:get"); }
});

router.post("/trend-signals", async (req, res) => {
  const d = parseBody(CreateTrendSignalSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.trend_signals
        (signal_type, parent_entity_type, parent_entity_id, signal_value, payload,
         notes, metadata, created_by, updated_by)
      values
        (${d.signal_type}, ${d.parent_entity_type ?? null}, ${d.parent_entity_id ?? null}, ${d.signal_value ?? null}, ${d.payload ? jsonbParam(d.payload) : null}::jsonb,
         ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "trend-signals:create"); }
});

router.put("/trend-signals/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateTrendSignalSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.payload !== undefined) updates.payload = d.payload == null ? null : jsonbParam(d.payload);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.trend_signals set ${fragment} where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "trend-signals:update"); }
});

router.delete("/trend-signals/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.trend_signals set is_deleted = true, is_active = false, updated_by = ${uid} where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "trend-signals:delete"); }
});

export default router;
