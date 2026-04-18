// inventory.inventory_transfers CRUD + POST /:id/execute
import { Router, type IRouter } from "express";
import {
  CreateInventoryTransferSchema,
  UpdateInventoryTransferSchema,
  ListInventoryTransfersQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir, withClient } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "transfer_number", "transfer_date", "material_id", "status", "created_at"]);

router.get("/inventory/transfers", async (req, res) => {
  const q = parseQuery(ListInventoryTransfersQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`transfer_number ILIKE $${params.length}`); }
    if (q.material_id !== undefined) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    if (q.from_warehouse_id !== undefined) { params.push(q.from_warehouse_id); where.push(`from_warehouse_id = $${params.length}`); }
    if (q.to_warehouse_id !== undefined) { params.push(q.to_warehouse_id); where.push(`to_warehouse_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "transfer_date"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.inventory_transfers WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.inventory_transfers WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/inventory/transfers/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.inventory_transfers WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/inventory/transfers", async (req, res) => {
  const data = parseBody(CreateInventoryTransferSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.inventory_transfers", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/inventory/transfers/:id", async (req, res) => {
  const data = parseBody(UpdateInventoryTransferSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.inventory_transfers", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/inventory/transfers/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.inventory_transfers SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// POST /inventory/transfers/:id/execute — move stock between warehouses atomically
router.post("/inventory/transfers/:id/execute", async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      await client.query("BEGIN");
      const tr = await client.query("SELECT * FROM inventory.inventory_transfers WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (!tr.rowCount) throw new Error("NOT_FOUND");
      const t = tr.rows[0];
      if (t.status === "executed") throw new Error("ALREADY_EXECUTED");

      // Check source availability
      const src = await client.query(
        "SELECT * FROM inventory.inventory WHERE material_id = $1 AND warehouse_id = $2 FOR UPDATE",
        [t.material_id, t.from_warehouse_id],
      );
      const avail = Number(src.rows[0]?.available_qty ?? 0);
      if (avail < Number(t.quantity_transferred)) throw new Error("INSUFFICIENT_STOCK");

      // Decrement source
      await client.query(
        `UPDATE inventory.inventory
           SET on_hand_qty = on_hand_qty - $1,
               available_qty = available_qty - $1,
               last_movement_at = NOW(),
               updated_at = NOW()
         WHERE material_id = $2 AND warehouse_id = $3`,
        [t.quantity_transferred, t.material_id, t.from_warehouse_id],
      );

      // Upsert destination
      await client.query(
        `INSERT INTO inventory.inventory (material_id, warehouse_id, on_hand_qty, available_qty, last_movement_at)
         VALUES ($1, $2, $3, $3, NOW())
         ON CONFLICT (material_id, warehouse_id) DO UPDATE
         SET on_hand_qty = inventory.inventory.on_hand_qty + EXCLUDED.on_hand_qty,
             available_qty = inventory.inventory.available_qty + EXCLUDED.available_qty,
             last_movement_at = NOW(),
             updated_at = NOW()`,
        [t.material_id, t.to_warehouse_id, t.quantity_transferred],
      );

      // Two movements (out, in)
      await client.query(
        `INSERT INTO inventory.inventory_movements
           (material_id, warehouse_id, movement_type, quantity, movement_date,
            reference_type, reference_id, status, posted_at, created_by)
         VALUES
           ($1, $2, 'transfer_out', $3, NOW(), 'inventory_transfer', $4, 'posted', NOW(), $5),
           ($1, $6, 'transfer_in', $7, NOW(), 'inventory_transfer', $4, 'posted', NOW(), $5)`,
        [
          t.material_id, t.from_warehouse_id,
          -Math.abs(Number(t.quantity_transferred)),
          t.id, req.userId ?? null,
          t.to_warehouse_id, t.quantity_transferred,
        ],
      );

      const upd = await client.query(
        `UPDATE inventory.inventory_transfers
           SET status = 'executed', executed_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE id = $2 RETURNING *`,
        [req.userId ?? null, req.params.id],
      );
      await client.query("COMMIT");
      return upd.rows[0];
    });
    res.json(result);
  } catch (err: any) {
    if (err?.message === "NOT_FOUND") return res.status(404).json({ error: "לא נמצא" });
    if (err?.message === "ALREADY_EXECUTED") return res.status(409).json({ error: "Transfer already executed" });
    if (err?.message === "INSUFFICIENT_STOCK") return res.status(409).json({ error: "Insufficient stock at source warehouse" });
    sendDbError(res, err);
  }
});

export default router;
