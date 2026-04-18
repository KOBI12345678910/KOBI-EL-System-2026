// ============================================================
// intelligence.agent_jobs CRUD + enqueue + cancel
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateAgentJobSchema,
  UpdateAgentJobSchema,
  EnqueueAgentJobSchema,
  ListAgentJobsQuerySchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "updated_at", "status", "job_type", "started_at", "finished_at"]);
const ALLOWED_UPDATE_COLS = new Set([
  "agent_id","job_type","status","payload","started_at","finished_at","error_message",
  "notes","metadata","is_active","is_deleted","record_code","updated_by",
]);

router.get("/agent-jobs", async (req, res) => {
  const q = parseQuery(ListAgentJobsQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`job_type ILIKE ${"%" + q.q + "%"}`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.agent_id) conditions.push(sql`agent_id = ${q.agent_id}`);
    if (q.job_type) conditions.push(sql`job_type = ${q.job_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.agent_jobs ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.agent_jobs ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "agent-jobs:list"); }
});

router.get("/agent-jobs/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.agent_jobs where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "agent-jobs:get"); }
});

router.post("/agent-jobs", async (req, res) => {
  const d = parseBody(CreateAgentJobSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.agent_jobs
        (agent_id, job_type, status, payload, notes, metadata, created_by, updated_by)
      values
        (${d.agent_id}, ${d.job_type}, ${d.status ?? "queued"},
         ${d.payload ? jsonbParam(d.payload) : null}::jsonb, ${d.notes ?? null},
         ${jsonbParam(d.metadata ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "agent-jobs:create"); }
});

router.post("/agent-jobs/enqueue", async (req, res) => {
  const d = parseBody(EnqueueAgentJobSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.agent_jobs
        (agent_id, job_type, status, payload, created_by, updated_by)
      values
        (${d.agent_id}, ${d.job_type}, 'queued', ${jsonbParam(d.payload ?? {})}::jsonb, ${uid}, ${uid})
      returning *`);
    res.status(201).json({ success: true, job: (r.rows ?? [])[0] });
  } catch (err) { sendDbError(res, err, "agent-jobs:enqueue"); }
});

router.put("/agent-jobs/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateAgentJobSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    if (d.payload !== undefined) updates.payload = d.payload == null ? null : jsonbParam(d.payload);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.agent_jobs set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "agent-jobs:update"); }
});

router.post("/agent-jobs/:id/cancel", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      update intelligence.agent_jobs
         set status = 'failed', error_message = coalesce(error_message, 'cancelled by user'),
             finished_at = now(), updated_by = ${uid}, updated_at = now()
       where id = ${id} and status in ('queued','running')
      returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא או אינו ניתן לביטול" });
    res.json({ success: true, job: row, action: "cancel" });
  } catch (err) { sendDbError(res, err, "agent-jobs:cancel"); }
});

router.delete("/agent-jobs/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.agent_jobs set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "agent-jobs:delete"); }
});

export default router;
