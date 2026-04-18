// inventory.inventory_receipts CRUD + POST /:id/post
import { Router, type IRouter } from "express";
import {
  CreateInventoryReceiptSchema,
  UpdateInventoryReceiptSchema,
  ListInventoryReceiptsQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir, withClient } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "receipt_number", "receipt_date", "material_id", "warehouse_id", "status", "created_at"]);

router.get("/inventory/receipts", async (req, res) => {
  const q = parseQuery(ListInventoryReceiptsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`receipt_number ILIKE $${params.length}`); }
    if (q.material_id !== undefined) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    if (q.warehouse_id !== undefined) { params.push(q.warehouse_id); where.push(`warehouse_id = $${params.length}`); }
    if (q.po_id !== undefined) { params.push(q.po_id); where.push(`po_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "receipt_date"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.inventory_receipts WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.inventory_receipts WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/inventory/receipts/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.inventory_receipts WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/inventory/receipts", async (req, res) => {
  const data = parseBody(CreateInventoryReceiptSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.inventory_receipts", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/inventory/receipts/:id", async (req, res) => {
  const data = parseBody(UpdateInventoryReceiptSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.inventory_receipts", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/inventory/receipts/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.inventory_receipts SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// POST /inventory/receipts/:id/post — post receipt, update stock, create movement
router.post("/inventory/receipts/:id/post", async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      await client.query("BEGIN");
      const rc = await client.query(
        "SELECT * FROM inventory.inventory_receipts WHERE id = $1 FOR UPDATE",
        [req.params.id],
      );
      if (!rc.rowCount) throw new Error("NOT_FOUND");
      const receipt = rc.rows[0];
      if (receipt.status === "posted") throw new Error("ALREADY_POSTED");

      // Upsert stock level
      await client.query(
        `INSERT INTO inventory.inventory (material_id, warehouse_id, on_hand_qty, available_qty, last_movement_at)
         VALUES ($1, $2, $3, $3, NOW())
         ON CONFLICT (material_id, warehouse_id) DO UPDATE
         SET on_hand_qty = inventory.inventory.on_hand_qty + EXCLUDED.on_hand_qty,
             available_qty = inventory.inventory.available_qty + EXCLUDED.available_qty,
             last_movement_at = NOW(),
             updated_at = NOW()`,
        [receipt.material_id, receipt.warehouse_id, receipt.quantity_received],
      );

      // Record movement
      await client.query(
        `INSERT INTO inventory.inventory_movements
           (material_id, warehouse_id, movement_type, quantity, unit_cost, movement_date,
            reference_type, reference_id, status, posted_at, created_by)
         VALUES ($1, $2, 'receipt', $3, $4, NOW(), 'inventory_receipt', $5, 'posted', NOW(), $6)`,
        [receipt.material_id, receipt.warehouse_id, receipt.quantity_received, receipt.unit_cost ?? null, receipt.id, req.userId ?? null],
      );

      const upd = await client.query(
        `UPDATE inventory.inventory_receipts
           SET status = 'posted', posted_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE id = $2 RETURNING *`,
        [req.userId ?? null, req.params.id],
      );
      await client.query("COMMIT");
      return upd.rows[0];
    });
    res.json(result);
  } catch (err: any) {
    if (err?.message === "NOT_FOUND") return res.status(404).json({ error: "לא נמצא" });
    if (err?.message === "ALREADY_POSTED") return res.status(409).json({ error: "Receipt already posted" });
    sendDbError(res, err);
  }
});

export default router;
