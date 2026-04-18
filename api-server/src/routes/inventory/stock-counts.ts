// inventory.stock_counts CRUD + POST /:id/reconcile
import { Router, type IRouter } from "express";
import {
  CreateStockCountSchema,
  UpdateStockCountSchema,
  ListStockCountsQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir, withClient } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "count_number", "counted_at", "warehouse_id", "status", "created_at"]);

router.get("/stock-counts", async (req, res) => {
  const q = parseQuery(ListStockCountsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`count_number ILIKE $${params.length}`); }
    if (q.warehouse_id !== undefined) { params.push(q.warehouse_id); where.push(`warehouse_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "counted_at"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.stock_counts WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.stock_counts WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/stock-counts/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.stock_counts WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    const lines = await pool.query("SELECT * FROM inventory.stock_count_lines WHERE stock_count_id = $1 ORDER BY id", [req.params.id]);
    res.json({ ...r.rows[0], lines: lines.rows });
  } catch (err) { sendDbError(res, err); }
});

router.post("/stock-counts", async (req, res) => {
  const data = parseBody(CreateStockCountSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.stock_counts", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/stock-counts/:id", async (req, res) => {
  const data = parseBody(UpdateStockCountSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.stock_counts", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/stock-counts/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.stock_counts SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// POST /stock-counts/:id/reconcile — create adjustment movements for variances
router.post("/stock-counts/:id/reconcile", async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      await client.query("BEGIN");
      const sc = await client.query("SELECT * FROM inventory.stock_counts WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (!sc.rowCount) throw new Error("NOT_FOUND");
      const count = sc.rows[0];
      if (count.status === "reconciled" || count.status === "closed") throw new Error("ALREADY_RECONCILED");
      if (count.status !== "counted") throw new Error("WRONG_STATE");

      const lines = await client.query(
        "SELECT * FROM inventory.stock_count_lines WHERE stock_count_id = $1 AND variance_qty <> 0",
        [req.params.id],
      );

      let adjustments = 0;
      for (const l of lines.rows) {
        const qty = Number(l.variance_qty);
        if (qty === 0) continue;

        // Apply adjustment to stock (variance_qty = counted_qty - system_qty)
        await client.query(
          `INSERT INTO inventory.inventory (material_id, warehouse_id, on_hand_qty, available_qty, last_movement_at)
           VALUES ($1, $2, $3, $3, NOW())
           ON CONFLICT (material_id, warehouse_id) DO UPDATE
           SET on_hand_qty = inventory.inventory.on_hand_qty + EXCLUDED.on_hand_qty,
               available_qty = inventory.inventory.available_qty + EXCLUDED.available_qty,
               last_movement_at = NOW(),
               updated_at = NOW()`,
          [l.material_id, count.warehouse_id, qty],
        );

        await client.query(
          `INSERT INTO inventory.inventory_movements
             (material_id, warehouse_id, movement_type, quantity, movement_date,
              reference_type, reference_id, status, posted_at, created_by, notes)
           VALUES ($1, $2, 'adjustment', $3, NOW(), 'stock_count', $4, 'posted', NOW(), $5, 'Stock count reconciliation')`,
          [l.material_id, count.warehouse_id, qty, count.id, req.userId ?? null],
        );
        adjustments++;
      }

      const upd = await client.query(
        `UPDATE inventory.stock_counts
           SET status = 'reconciled', reconciled_at = NOW(), updated_at = NOW(), updated_by = $1
         WHERE id = $2 RETURNING *`,
        [req.userId ?? null, req.params.id],
      );
      await client.query("COMMIT");
      return { ...upd.rows[0], adjustments_created: adjustments };
    });
    res.json(result);
  } catch (err: any) {
    if (err?.message === "NOT_FOUND") return res.status(404).json({ error: "לא נמצא" });
    if (err?.message === "ALREADY_RECONCILED") return res.status(409).json({ error: "Stock count already reconciled" });
    if (err?.message === "WRONG_STATE") return res.status(409).json({ error: "Stock count must be in 'counted' state" });
    sendDbError(res, err);
  }
});

export default router;
