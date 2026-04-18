// ============================================================
// procurement.suppliers CRUD
// ============================================================
import { Router, type IRouter } from "express";
import {
  CreateSupplierSchema,
  UpdateSupplierSchema,
  ListSuppliersQuerySchema,
} from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

// LIST
router.get("/suppliers", async (req, res) => {
  const q = parseQuery(ListSuppliersQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(legal_name ILIKE $${params.length} OR supplier_number ILIKE $${params.length} OR display_name ILIKE $${params.length})`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.supplier_category) { params.push(q.supplier_category); where.push(`supplier_category = $${params.length}`); }
    if (q.risk_level) { params.push(q.risk_level); where.push(`risk_level = $${params.length}`); }
    if (q.preferred_supplier !== undefined) { params.push(q.preferred_supplier); where.push(`preferred_supplier = $${params.length}`); }
    const orderBy = ["id", "legal_name", "created_at", "updated_at", "performance_score"].includes(q.order_by) ? q.order_by : "id";
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.suppliers WHERE ${where.join(" AND ")} ORDER BY ${orderBy} ${q.order_dir} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await pool.query(sql, params);
    const countRes = await pool.query(`SELECT count(*)::bigint AS total FROM procurement.suppliers WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: result.rows, total: Number(countRes.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

// READ
router.get("/suppliers/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM procurement.suppliers WHERE id = $1", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// CREATE
router.post("/suppliers", async (req, res) => {
  const data = parseBody(CreateSupplierSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.suppliers", data);
    const result = await pool.query(q.text, q.values);
    res.status(201).json(result.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// UPDATE
router.put("/suppliers/:id", async (req, res) => {
  const data = parseBody(UpdateSupplierSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.suppliers", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const result = await pool.query(q.text, q.values);
    if (!result.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(result.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// SOFT DELETE
router.delete("/suppliers/:id", async (req, res) => {
  try {
    const result = await pool.query("UPDATE procurement.suppliers SET is_deleted = true, deleted_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: result.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
