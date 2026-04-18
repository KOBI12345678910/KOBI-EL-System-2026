// inventory.inventory_movements — journal feed
import { Router, type IRouter } from "express";
import {
  CreateInventoryMovementSchema,
  UpdateInventoryMovementSchema,
  ListInventoryMovementsQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "movement_date", "material_id", "warehouse_id", "status", "created_at"]);

router.get("/inventory/journal", async (req, res) => {
  const q = parseQuery(ListInventoryMovementsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(coalesce(movement_code,'') ILIKE $${params.length} OR coalesce(notes,'') ILIKE $${params.length})`); }
    if (q.material_id !== undefined) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    if (q.warehouse_id !== undefined) { params.push(q.warehouse_id); where.push(`warehouse_id = $${params.length}`); }
    if (q.movement_type) { params.push(q.movement_type); where.push(`movement_type = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.from_date) { params.push(q.from_date); where.push(`movement_date >= $${params.length}`); }
    if (q.to_date) { params.push(q.to_date); where.push(`movement_date <= $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "movement_date"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.inventory_movements WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.inventory_movements WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/inventory/movements/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.inventory_movements WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/inventory/movements", async (req, res) => {
  const data = parseBody(CreateInventoryMovementSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.inventory_movements", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/inventory/movements/:id", async (req, res) => {
  const data = parseBody(UpdateInventoryMovementSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.inventory_movements", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/inventory/movements/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.inventory_movements SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
