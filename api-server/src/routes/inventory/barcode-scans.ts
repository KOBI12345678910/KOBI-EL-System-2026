// inventory.barcode_scans CRUD + POST for live scans
import { Router, type IRouter } from "express";
import {
  CreateBarcodeScanSchema,
  UpdateBarcodeScanSchema,
  ListBarcodeScansQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "barcode_value", "scanned_at", "created_at"]);

router.get("/barcode-scans", async (req, res) => {
  const q = parseQuery(ListBarcodeScansQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`barcode_value ILIKE $${params.length}`); }
    if (q.material_id !== undefined) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    if (q.warehouse_id !== undefined) { params.push(q.warehouse_id); where.push(`warehouse_id = $${params.length}`); }
    if (q.barcode_value) { params.push(q.barcode_value); where.push(`barcode_value = $${params.length}`); }
    if (q.scan_type) { params.push(q.scan_type); where.push(`scan_type = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "scanned_at"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.barcode_scans WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.barcode_scans WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/barcode-scans/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.barcode_scans WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// POST /barcode-scans — record a scan (used by mobile field workers)
router.post("/barcode-scans", async (req, res) => {
  const data = parseBody(CreateBarcodeScanSchema, req, res); if (!data) return;
  try {
    const payload = { ...data, scanned_by_user_id: data.scanned_by_user_id ?? req.userId ?? null };
    const q = buildInsert("inventory.barcode_scans", payload);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/barcode-scans/:id", async (req, res) => {
  const data = parseBody(UpdateBarcodeScanSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.barcode_scans", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/barcode-scans/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.barcode_scans SET is_deleted = true WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
