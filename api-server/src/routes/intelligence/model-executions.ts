// ============================================================
// intelligence.model_executions CRUD + rerun
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateModelExecutionSchema,
  UpdateModelExecutionSchema,
  ListModelExecutionsQuerySchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "updated_at", "status", "started_at", "finished_at", "execution_type"]);
const ALLOWED_UPDATE_COLS = new Set([
  "model_registry_id","execution_type","parent_entity_type","parent_entity_id","input_payload","output_payload",
  "success","status","started_at","finished_at","error_message",
  "notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/model-executions", async (req, res) => {
  const q = parseQuery(ListModelExecutionsQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`execution_type ILIKE ${"%" + q.q + "%"}`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.model_registry_id) conditions.push(sql`model_registry_id = ${q.model_registry_id}`);
    if (q.execution_type) conditions.push(sql`execution_type = ${q.execution_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.model_executions ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.model_executions ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "model-executions:list"); }
});

router.get("/model-executions/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.model_executions where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "model-executions:get"); }
});

router.post("/model-executions", async (req, res) => {
  const d = parseBody(CreateModelExecutionSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.model_executions
        (model_registry_id, execution_type, parent_entity_type, parent_entity_id, input_payload, output_payload,
         success, status, started_at, finished_at, error_message, notes, metadata, created_by, updated_by)
      values
        (${d.model_registry_id}, ${d.execution_type}, ${d.parent_entity_type ?? null}, ${d.parent_entity_id ?? null},
         ${d.input_payload ? jsonbParam(d.input_payload) : null}::jsonb, ${d.output_payload ? jsonbParam(d.output_payload) : null}::jsonb,
         ${d.success ?? false}, ${d.status ?? "queued"}, ${d.started_at ?? null}, ${d.finished_at ?? null}, ${d.error_message ?? null},
         ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "model-executions:create"); }
});

router.put("/model-executions/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateModelExecutionSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.input_payload !== undefined) updates.input_payload = d.input_payload == null ? null : jsonbParam(d.input_payload);
    if (d.output_payload !== undefined) updates.output_payload = d.output_payload == null ? null : jsonbParam(d.output_payload);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.model_executions set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "model-executions:update"); }
});

router.post("/model-executions/:id/rerun", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const src = await db.execute(sql`select * from intelligence.model_executions where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (src.rows ?? [])[0] as
      | { model_registry_id: number; execution_type: string; parent_entity_type: string | null; parent_entity_id: number | null; input_payload: unknown }
      | undefined;
    if (!row) return res.status(404).json({ error: "ביצוע המקור לא נמצא" });

    const r = await db.execute(sql`
      insert into intelligence.model_executions
        (model_registry_id, execution_type, parent_entity_type, parent_entity_id, input_payload,
         success, status, started_at, notes, created_by, updated_by)
      values
        (${row.model_registry_id}, ${row.execution_type}, ${row.parent_entity_type}, ${row.parent_entity_id},
         ${row.input_payload ? jsonbParam(row.input_payload) : null}::jsonb,
         false, 'queued', now(), ${"rerun of execution #" + id}, ${uid}, ${uid})
      returning *`);
    res.status(201).json({ success: true, original_id: id, rerun: (r.rows ?? [])[0] });
  } catch (err) { sendDbError(res, err, "model-executions:rerun"); }
});

router.delete("/model-executions/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.model_executions set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "model-executions:delete"); }
});

export default router;
