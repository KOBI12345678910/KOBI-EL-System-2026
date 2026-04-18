// ============================================================
// intelligence.anomaly_cases CRUD + state actions
// ============================================================
import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateAnomalyCaseSchema,
  UpdateAnomalyCaseSchema,
  ListAnomalyCasesQuerySchema,
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

const ALLOWED_ORDER_BY = new Set(["id", "created_at", "generated_at", "status", "severity", "anomaly_score"]);
const ALLOWED_UPDATE_COLS = new Set([
  "anomaly_number","parent_entity_type","parent_entity_id","anomaly_type","anomaly_score",
  "severity","explanation","status","notes","metadata","is_active","is_deleted","record_code","updated_by","resolved_at",
]);

router.get("/anomaly-cases", async (req, res) => {
  const q = parseQuery(ListAnomalyCasesQuerySchema, req, res); if (!q) return;
  try {
    const conditions: SQL[] = [sql`coalesce(is_deleted, false) = false`];
    if (q.q) conditions.push(sql`(anomaly_number ILIKE ${"%" + q.q + "%"} OR explanation ILIKE ${"%" + q.q + "%"})`);
    if (q.status) conditions.push(sql`status = ${q.status}`);
    if (q.anomaly_type) conditions.push(sql`anomaly_type = ${q.anomaly_type}`);
    if (q.severity) conditions.push(sql`severity = ${q.severity}`);
    if (q.parent_entity_type) conditions.push(sql`parent_entity_type = ${q.parent_entity_type}`);

    const where = buildSafeWhere(conditions);
    const orderBy = buildSafeOrderByFragment(q.order_by, q.order_dir, ALLOWED_ORDER_BY, "created_at");
    const limit = safeLimit(q.limit, 500);
    const offset = safeOffset(q.offset);

    const rows = await db.execute(sql`select * from intelligence.anomaly_cases ${where} ${orderBy} limit ${limit} offset ${offset}`);
    const countRes = await db.execute(sql`select count(*)::bigint as total from intelligence.anomaly_cases ${where}`);
    const total = Number((countRes.rows?.[0] as { total?: number })?.total ?? 0);
    res.json({ ...buildListResponse(rows.rows ?? [], total, limit, offset), rows: rows.rows ?? [], total, limit, offset });
  } catch (err) { sendDbError(res, err, "anomaly-cases:list"); }
});

router.get("/anomaly-cases/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  try {
    const r = await db.execute(sql`select * from intelligence.anomaly_cases where id = ${id} and coalesce(is_deleted,false)=false limit 1`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "anomaly-cases:get"); }
});

router.post("/anomaly-cases", async (req, res) => {
  const d = parseBody(CreateAnomalyCaseSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`
      insert into intelligence.anomaly_cases
        (anomaly_number, parent_entity_type, parent_entity_id, anomaly_type, anomaly_score,
         severity, explanation, status, notes, metadata, created_by, updated_by)
      values
        (${d.anomaly_number}, ${d.parent_entity_type}, ${d.parent_entity_id}, ${d.anomaly_type}, ${d.anomaly_score ?? null},
         ${d.severity ?? null}, ${d.explanation ?? null}, ${d.status ?? "open"}, ${d.notes ?? null}, ${jsonbParam(d.metadata ?? {})}::jsonb,
         ${uid}, ${uid})
      returning *`);
    res.status(201).json((r.rows ?? [])[0]);
  } catch (err) { sendDbError(res, err, "anomaly-cases:create"); }
});

router.put("/anomaly-cases/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const d = parseBody(UpdateAnomalyCaseSchema, req, res); if (!d) return;
  const uid = getUserId(req);
  try {
    const updates: Record<string, unknown> = { ...d, updated_by: uid };
    if (d.metadata !== undefined) updates.metadata = jsonbParam(d.metadata);
    const { fragment, hasUpdates } = buildSafeSetClause(updates, ALLOWED_UPDATE_COLS);
    if (!hasUpdates) return res.status(400).json({ error: "אין שדות לעדכון" });
    const r = await db.execute(sql`update intelligence.anomaly_cases set ${fragment}, updated_at = now() where id = ${id} returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json(row);
  } catch (err) { sendDbError(res, err, "anomaly-cases:update"); }
});

router.delete("/anomaly-cases/:id", async (req, res) => {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = await db.execute(sql`update intelligence.anomaly_cases set is_deleted = true, is_active = false, updated_by = ${uid}, updated_at = now() where id = ${id} returning id`);
    if (!(r.rows ?? []).length) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id });
  } catch (err) { sendDbError(res, err, "anomaly-cases:delete"); }
});

async function transition(req: Request, res: Response, target: string, label: string, setResolved = false) {
  const id = parseIntId(req, res); if (!id) return;
  const uid = getUserId(req);
  try {
    const r = setResolved
      ? await db.execute(sql`update intelligence.anomaly_cases set status = ${target}, resolved_at = now(), updated_by = ${uid}, updated_at = now() where id = ${id} and coalesce(is_deleted,false)=false returning *`)
      : await db.execute(sql`update intelligence.anomaly_cases set status = ${target}, updated_by = ${uid}, updated_at = now() where id = ${id} and coalesce(is_deleted,false)=false returning *`);
    const row = (r.rows ?? [])[0];
    if (!row) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, case: row, action: label });
  } catch (err) { sendDbError(res, err, `anomaly-cases:${label}`); }
}

router.post("/anomaly-cases/:id/resolve",        (req, res) => transition(req, res, "resolved",       "resolve", true));
router.post("/anomaly-cases/:id/false-positive", (req, res) => transition(req, res, "false_positive", "false-positive", true));

export default router;
