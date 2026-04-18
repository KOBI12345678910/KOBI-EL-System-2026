// inventory.material_categories CRUD
import { Router, type IRouter } from "express";
import {
  CreateMaterialCategorySchema,
  UpdateMaterialCategorySchema,
  ListMaterialCategoriesQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "category_code", "category_name", "created_at", "updated_at"]);

router.get("/material-categories", async (req, res) => {
  const q = parseQuery(ListMaterialCategoriesQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(category_name ILIKE $${params.length} OR category_code ILIKE $${params.length})`); }
    if (q.active !== undefined) { params.push(q.active); where.push(`active = $${params.length}`); }
    if (q.parent_category_id !== undefined) { params.push(q.parent_category_id); where.push(`parent_category_id = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "id"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.material_categories WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await pool.query(sql, params);
    const countRes = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.material_categories WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: result.rows, total: Number(countRes.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/material-categories/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.material_categories WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/material-categories", async (req, res) => {
  const data = parseBody(CreateMaterialCategorySchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.material_categories", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/material-categories/:id", async (req, res) => {
  const data = parseBody(UpdateMaterialCategorySchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.material_categories", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/material-categories/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.material_categories SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
