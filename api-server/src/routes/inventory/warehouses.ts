// inventory.warehouses CRUD
import { Router, type IRouter } from "express";
import {
  CreateWarehouseSchema,
  UpdateWarehouseSchema,
  ListWarehousesQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "warehouse_code", "name", "warehouse_type", "created_at", "updated_at"]);

router.get("/warehouses", async (req, res) => {
  const q = parseQuery(ListWarehousesQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(name ILIKE $${params.length} OR warehouse_code ILIKE $${params.length} OR coalesce(city,'') ILIKE $${params.length})`); }
    if (q.active !== undefined) { params.push(q.active); where.push(`active = $${params.length}`); }
    if (q.warehouse_type) { params.push(q.warehouse_type); where.push(`warehouse_type = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "id"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.warehouses WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.warehouses WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/warehouses/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.warehouses WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/warehouses", async (req, res) => {
  const data = parseBody(CreateWarehouseSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.warehouses", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/warehouses/:id", async (req, res) => {
  const data = parseBody(UpdateWarehouseSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.warehouses", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/warehouses/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.warehouses SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
