// inventory.material_lots CRUD + traceability
import { Router, type IRouter } from "express";
import {
  CreateMaterialLotSchema,
  UpdateMaterialLotSchema,
  ListMaterialLotsQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "lot_number", "material_id", "warehouse_id", "received_at", "created_at", "updated_at"]);

router.get("/material-lots", async (req, res) => {
  const q = parseQuery(ListMaterialLotsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`lot_number ILIKE $${params.length}`); }
    if (q.material_id !== undefined) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    if (q.warehouse_id !== undefined) { params.push(q.warehouse_id); where.push(`warehouse_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.lot_number) { params.push(q.lot_number); where.push(`lot_number = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "id"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.material_lots WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.material_lots WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/material-lots/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.material_lots WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// Traceability — chain of custody for a single lot
router.get("/material-lots/:id/traceability", async (req, res) => {
  try {
    const lot = await pool.query("SELECT * FROM inventory.material_lots WHERE id = $1", [req.params.id]);
    if (!lot.rowCount) return res.status(404).json({ error: "לא נמצא" });
    const movements = await pool.query(
      "SELECT * FROM inventory.inventory_movements WHERE lot_id = $1 ORDER BY movement_date DESC LIMIT 500",
      [req.params.id],
    );
    const receipts = await pool.query(
      "SELECT ir.* FROM inventory.inventory_receipts ir WHERE ir.material_id = $1 AND (ir.batch_reference = $2 OR ir.batch_reference IS NULL) ORDER BY ir.receipt_date DESC LIMIT 200",
      [lot.rows[0].material_id, lot.rows[0].lot_number],
    );
    const issues = await pool.query(
      "SELECT ii.* FROM inventory.inventory_issues ii WHERE ii.material_id = $1 ORDER BY ii.issue_date DESC LIMIT 200",
      [lot.rows[0].material_id],
    );
    res.json({
      lot: lot.rows[0],
      movements: movements.rows,
      receipts: receipts.rows,
      issues: issues.rows,
      generated_at: new Date().toISOString(),
    });
  } catch (err) { sendDbError(res, err); }
});

router.post("/material-lots", async (req, res) => {
  const data = parseBody(CreateMaterialLotSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.material_lots", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/material-lots/:id", async (req, res) => {
  const data = parseBody(UpdateMaterialLotSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.material_lots", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/material-lots/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.material_lots SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
