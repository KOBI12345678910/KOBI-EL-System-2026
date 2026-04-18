// ============================================================
// intelligence.orchestration_flows CRUD + trigger
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateOrchestrationFlowSchema,
  UpdateOrchestrationFlowSchema,
  TriggerOrchestrationFlowSchema,
  ListOrchestrationFlowsQuerySchema,
} from "@workspace/api-zod/intelligence";
import { authMiddleware } from "../../middleware/auth";
import {
  db, sql, type SQL,
  parseBody, parseQuery, parseUuidId, sendDbError, getUserId, jsonbParam,
  buildSafeWhere, buildSafeOrderByFragment, buildSafeSetClause,
  safeLimit, safeOffset, buildListResponse,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);

const ALLOWED_ORDER_BY = new Set(["created_at", "updated_at", "flow_name", "status", "trigger_type", "last_run_at"]);
const ALLOWED_UPDATE_COLS = new Set([
  "flow_name","description","trigger_type","trigger_config","steps","status","last_run_at",
  "notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/orchestration-flows", async (req, res) => {
  const q = parseQuery(ListOrchestrationFlowsQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`(flow_name ILIKE ${"%" + q.q + "%"} OR description ILIKE ${"%" + q.q + "%"})`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.trigger_type) conditions.push(sql`trigger_type = ${q.trigger_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.orchestration_flows ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.orchestration_flows ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "orchestration-flows:list"); }
});

router.get("/orchestration-flows/:id", async (req, res) => {
  const id = parseUuidId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.orchestration_flows where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "orchestration-flows:get"); }
});

router.post("/orchestration-flows", async (req, res) => {
  const d = parseBody(CreateOrchestrationFlowSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.orchestration_flows
        (flow_name, description, trigger_type, trigger_config, steps, status, last_run_at, notes, metadata, created_by, updated_by)
      values
        (${d.flow_name}, ${d.description ?? null}, ${d.trigger_type ?? "manual"}, ${jsonbParam(d.trigger_config ?? {})}::jsonb,
         ${jsonbParam(d.steps ?? [])}::jsonb, ${d.status ?? "draft"}, ${d.last_run_at ?? null}, ${d.notes ?? null},
         ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "orchestration-flows:create"); }
});

router.put("/orchestration-flows/:id", async (req, res) => {
  const id = parseUuidId(req, res); if (!id) return;
  const d = parseBody(UpdateOrchestrationFlowSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.trigger_config !== undefined) updates.trigger_config = jsonbParam(d.trigger_config);
    if (d.steps !== undefined) updates.steps = jsonbParam(d.steps);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.orchestration_flows set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "orchestration-flows:update"); }
});

router.post("/orchestration-flows/:id/trigger", async (req, res) => {
  const id = parseUuidId(req, res); if (!id) return;
  const d = parseBody(TriggerOrchestrationFlowSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    // Mark the flow as triggered (stamp last_run_at). Actual step execution is
    // delegated to the orchestrator layer outside this data-layer route.
    const r = await db.execute(sql`
      update intelligence.orchestration_flows
         set last_run_at = now(), updated_by = ${uid}, updated_at = now()
       where id = ${id} and coalesce(is_deleted,false)=false
       returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json({
      success: true,
      flow: row,
      trigger_input: d.input ?? {},
      action: "trigger",
      note: "Flow stamped as triggered. Step execution is delegated to the orchestrator service.",
    });
  } catch (err) { sendDbError(res, err, "orchestration-flows:trigger"); }
});

router.delete("/orchestration-flows/:id", async (req, res) => {
  const id = parseUuidId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.orchestration_flows set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "orchestration-flows:delete"); }
});

export default router;
