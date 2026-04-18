// inventory.stock_count_lines CRUD
import { Router, type IRouter } from "express";
import {
  CreateStockCountLineSchema,
  UpdateStockCountLineSchema,
  ListStockCountLinesQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "stock_count_id", "material_id", "created_at"]);

router.get("/stock-count-lines", async (req, res) => {
  const q = parseQuery(ListStockCountLinesQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.stock_count_id !== undefined) { params.push(q.stock_count_id); where.push(`stock_count_id = $${params.length}`); }
    if (q.material_id !== undefined) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "id"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.stock_count_lines WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.stock_count_lines WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/stock-count-lines/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.stock_count_lines WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/stock-count-lines", async (req, res) => {
  const data = parseBody(CreateStockCountLineSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.stock_count_lines", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/stock-count-lines/:id", async (req, res) => {
  const data = parseBody(UpdateStockCountLineSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.stock_count_lines", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/stock-count-lines/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.stock_count_lines SET is_deleted = true WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
