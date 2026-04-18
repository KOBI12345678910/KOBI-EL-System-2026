// ============================================================
// intelligence.forecast_models CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateForecastModelSchema,
  UpdateForecastModelSchema,
  ListForecastModelsQuerySchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "generated_at", "state", "forecast_domain", "period_start", "period_end"]);
const ALLOWED_UPDATE_COLS = new Set([
  "model_number","forecast_domain","parent_entity_type","parent_entity_id","period_start","period_end",
  "forecast_payload","model_version","state","notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/forecast-models", async (req, res) => {
  const q = parseQuery(ListForecastModelsQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`(model_number ILIKE ${"%" + q.q + "%"} OR forecast_domain ILIKE ${"%" + q.q + "%"})`);
    if (q.forecast_domain) conditions.push(sql`forecast_domain = ${q.forecast_domain}`);
    if (q.state) conditions.push(sql`state = ${q.state}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.forecast_models ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.forecast_models ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "forecast-models:list"); }
});

router.get("/forecast-models/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.forecast_models where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "forecast-models:get"); }
});

router.post("/forecast-models", async (req, res) => {
  const d = parseBody(CreateForecastModelSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.forecast_models
        (model_number, forecast_domain, parent_entity_type, parent_entity_id, period_start, period_end,
         forecast_payload, model_version, state, notes, metadata, created_by, updated_by)
      values
        (${d.model_number}, ${d.forecast_domain}, ${d.parent_entity_type ?? null}, ${d.parent_entity_id ?? null}, ${d.period_start ?? null}, ${d.period_end ?? null},
         ${jsonbParam(d.forecast_payload)}::jsonb, ${d.model_version ?? null}, ${d.state ?? "Generated"}, ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb,
         ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "forecast-models:create"); }
});

router.put("/forecast-models/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateForecastModelSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.forecast_payload !== undefined) updates.forecast_payload = jsonbParam(d.forecast_payload);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.forecast_models set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "forecast-models:update"); }
});

router.delete("/forecast-models/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.forecast_models set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "forecast-models:delete"); }
});

// Drilldown: executions for a given forecast model (via model_registry linkage if model_version matches)
router.get("/forecast-models/:id/executions", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`
      select me.* from intelligence.model_executions me
      join intelligence.forecast_models fm on fm.id = ${id}
      where me.execution_type = 'forecast'
        and (me.parent_entity_type = 'forecast_model' and me.parent_entity_id = ${id})
      order by me.started_at desc
      limit 200`);
    res.json({ rows: r.rows ?? [] });
  } catch (err) { sendDbError(res, err, "forecast-models:executions"); }
});

export default router;
