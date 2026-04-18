// ============================================================
// inventory.materials CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateMaterialSchema,
  UpdateMaterialSchema,
  ListMaterialsQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);

const ALLOWED_ORDER_BY = new Set(["id", "material_code", "name", "category_id", "created_at", "updated_at"]);

// LIST
router.get("/materials", async (req, res) => {
  const q = parseQuery(ListMaterialsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(name ILIKE $${params.length} OR material_code ILIKE $${params.length} OR coalesce(barcode,'') ILIKE $${params.length})`); }
    if (q.category_id !== undefined) { params.push(q.category_id); where.push(`category_id = $${params.length}`); }
    if (q.active !== undefined) { params.push(q.active); where.push(`active = $${params.length}`); }
    if (q.barcode) { params.push(q.barcode); where.push(`barcode = $${params.length}`); }
    const orderBy = safeOrderBy(q.order_by, ALLOWED_ORDER_BY, "id");
    const orderDir = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.materials WHERE ${where.join(" AND ")} ORDER BY ${orderBy} ${orderDir} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await pool.query(sql, params);
    const countRes = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.materials WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: result.rows, total: Number(countRes.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

// READ
router.get("/materials/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM inventory.materials WHERE id = $1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// CREATE
router.post("/materials", async (req, res) => {
  const data = parseBody(CreateMaterialSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("inventory.materials", data);
    const result = await pool.query(q.text, q.values);
    res.status(201).json(result.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// UPDATE
router.put("/materials/:id", async (req, res) => {
  const data = parseBody(UpdateMaterialSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("inventory.materials", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const result = await pool.query(q.text, q.values);
    if (!result.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// SOFT DELETE
router.delete("/materials/:id", async (req, res) => {
  try {
    const result = await pool.query("UPDATE inventory.materials SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
