// inventory.material_requests CRUD + approve/fulfill
import { Router, type IRouter } from "express";
import {
  CreateMaterialRequestSchema,
  UpdateMaterialRequestSchema,
  ListMaterialRequestsQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "request_number", "requested_date", "needed_by_date", "status", "created_at", "updated_at"]);

router.get("/material-requests", async (req, res) => {
  const q = parseQuery(ListMaterialRequestsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`request_number ILIKE $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.project_id !== undefined) { params.push(q.project_id); where.push(`project_id = $${params.length}`); }
    if (q.work_order_id !== undefined) { params.push(q.work_order_id); where.push(`work_order_id = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "id"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.material_requests WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.material_requests WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/material-requests/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.material_requests WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    const lines = await pool.query("SELECT * FROM inventory.material_request_lines WHERE material_request_id = $1 ORDER BY id", [req.params.id]);
    res.json({ ...r.rows[0], lines: lines.rows });
  } catch (err) { sendDbError(res, err); }
});

router.post("/material-requests", async (req, res) => {
  const data = parseBody(CreateMaterialRequestSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.material_requests", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/material-requests/:id", async (req, res) => {
  const data = parseBody(UpdateMaterialRequestSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.material_requests", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/material-requests/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.material_requests SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// Approve
router.post("/material-requests/:id/approve", async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE inventory.material_requests SET status = 'approved', updated_at = NOW(), updated_by = $1 WHERE id = $2 AND status IN ('draft','submitted') RETURNING *",
      [req.userId ?? null, req.params.id],
    );
    if (!r.rowCount) return res.status(409).json({ error: "Cannot approve: wrong state or not found" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// Fulfill — marks as fulfilled; issues should be created separately
router.post("/material-requests/:id/fulfill", async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE inventory.material_requests SET status = 'fulfilled', updated_at = NOW(), updated_by = $1 WHERE id = $2 AND status = 'approved' RETURNING *",
      [req.userId ?? null, req.params.id],
    );
    if (!r.rowCount) return res.status(409).json({ error: "Cannot fulfill: request must be approved first" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

export default router;
