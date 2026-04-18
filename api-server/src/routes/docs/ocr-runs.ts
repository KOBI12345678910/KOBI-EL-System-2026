// docs.ocr_runs CRUD + enqueue business endpoint
import { Router, type IRouter } from "express";
import {
  CreateOcrRunSchema, UpdateOcrRunSchema, ListOcrRunsQuerySchema,
} from "@workspace/api-zod/docs";
import { authMiddleware } from "../../middleware/auth";
import {
  pool, parseBody, parseQuery, parseParamId,
  buildInsert, buildUpdate, sendDbError,
  buildSafeOrderBy, safeLimit, safeOffset,
} from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED_ORDER = new Set(["id","document_id","status","provider","requested_at","completed_at","created_at","updated_at"]);

router.get("/ocr-runs", async (req, res) => {
  const q = parseQuery(ListOcrRunsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted,false) = false"]; const params: unknown[] = [];
    if (q.document_id !== undefined) { params.push(q.document_id); where.push(`document_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.provider) { params.push(q.provider); where.push(`provider = $${params.length}`); }
    const orderBy = buildSafeOrderBy(q.order_by, q.order_dir, ALLOWED_ORDER, "id");
    const limit = safeLimit(q.limit, 500); const offset = safeOffset(q.offset);
    const whereText = `WHERE ${where.join(" AND ")}`;
    const rows = await pool.query(`SELECT * FROM docs.ocr_runs ${whereText} ORDER BY ${orderBy} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]);
    const count = await pool.query(`SELECT count(*)::bigint AS total FROM docs.ocr_runs ${whereText}`, params);
    res.json({ rows: rows.rows, total: Number(count.rows[0]?.total ?? 0), limit, offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/ocr-runs/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("SELECT * FROM docs.ocr_runs WHERE id = $1", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// CREATE / ENQUEUE
router.post("/ocr-runs", async (req, res) => {
  const data = parseBody(CreateOcrRunSchema, req, res); if (!data) return;
  try {
    const q = buildInsert("docs.ocr_runs", { ...data, status: data.status ?? "queued", created_by: req.userId ?? null });
    const r = await pool.query(q.text, q.values);
    await pool.query(
      `UPDATE docs.documents SET ocr_status = $1, updated_at = NOW() WHERE id = $2`,
      [data.status ?? "queued", data.document_id],
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/ocr-runs/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  const data = parseBody(UpdateOcrRunSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("docs.ocr_runs", { ...data, updated_by: req.userId ?? null }, "id", id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/ocr-runs/:id", async (req, res) => {
  const id = parseParamId(req, res); if (id == null) return;
  try {
    const r = await pool.query("UPDATE docs.ocr_runs SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
