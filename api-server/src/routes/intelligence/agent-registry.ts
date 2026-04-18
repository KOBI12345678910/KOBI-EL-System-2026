// ============================================================
// intelligence.agent_registry CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  ListAgentsQuerySchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "updated_at", "agent_code", "status", "last_heartbeat_at"]);
const ALLOWED_UPDATE_COLS = new Set([
  "agent_code","agent_name","status","config_payload","last_heartbeat_at",
  "notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/agents", async (req, res) => {
  const q = parseQuery(ListAgentsQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`(agent_code ILIKE ${"%" + q.q + "%"} OR agent_name ILIKE ${"%" + q.q + "%"})`);
    if (q.status) conditions.push(sql`status = ${q.status}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.agent_registry ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.agent_registry ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "agents:list"); }
});

router.get("/agents/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.agent_registry where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "agents:get"); }
});

router.post("/agents", async (req, res) => {
  const d = parseBody(CreateAgentSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.agent_registry
        (agent_code, agent_name, status, config_payload, last_heartbeat_at, notes, metadata, created_by, updated_by)
      values
        (${d.agent_code}, ${d.agent_name}, ${d.status ?? "healthy"}, ${jsonbParam(d.config_payload ?? {})}::jsonb,
         ${d.last_heartbeat_at ?? null}, ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "agents:create"); }
});

router.put("/agents/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateAgentSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.config_payload !== undefined) updates.config_payload = jsonbParam(d.config_payload);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.agent_registry set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "agents:update"); }
});

router.delete("/agents/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.agent_registry set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "agents:delete"); }
});

export default router;
