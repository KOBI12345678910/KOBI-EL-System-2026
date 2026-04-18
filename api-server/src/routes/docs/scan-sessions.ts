// docs.scan_sessions CRUD
import { Router, type IRouter } from "express";
import {
  CreateScanSessionSchema, UpdateScanSessionSchema, ListScanSessionsQuerySchema,
} from "@workspace/api-zod/docs";
import { authMiddleware } from "../../middleware/auth";
import {
  pool, parseBody, parseQuery, parseParamId,
  buildInsert, buildUpdate, sendDbError,
  buildSafeOrderBy, safeLimit, safeOffset,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED_ORDER = new Set(["id","session_number","state","started_at","ended_at","created_at","updated_at"]);

router.get("/scan-sessions", async (req, res) => {
  const q = parseQuery(ListScanSessionsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted,false) = false"]; const params: unknown[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(session_number ILIKE $${params.length} OR scanner_name ILIKE $${params.length})`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    const orderBy = buildSafeOrderBy(q.order_by, q.order_dir, ALLOWED_ORDER, "id");
    const limit = safeLimit(q.limit, 500); const offset = safeOffset(q.offset);
    const whereText = `WHERE ${where.join(" AND ")}`;
    const rows = await pool.query(`SELECT * FROM docs.scan_sessions ${whereText} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
    const count = await pool.query(`SELECT count(*)::bigint AS total FROM docs.scan_sessions ${whereText}`, params);
    res.json({ rows: rows.rows, total: Number(count.rows[0]?.total ?? 0), limit, offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/scan-sessions/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("SELECT * FROM docs.scan_sessions WHERE id = $1", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/scan-sessions", async (req, res) => {
  const data = parseBody(CreateScanSessionSchema, req, res); if (!data) return;
  try {
    const q = buildInsert("docs.scan_sessions", { ...data, initiated_by_user_id: data.initiated_by_user_id ?? req.userId ?? null, created_by: req.userId ?? null });
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/scan-sessions/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  const data = parseBody(UpdateScanSessionSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("docs.scan_sessions", { ...data, updated_by: req.userId ?? null }, "id", id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/scan-sessions/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("UPDATE docs.scan_sessions SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
