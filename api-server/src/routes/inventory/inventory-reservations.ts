// inventory.inventory_reservations — CRUD with availability check
import { Router, type IRouter } from "express";
import {
  CreateInventoryReservationSchema,
  UpdateInventoryReservationSchema,
  ListInventoryReservationsQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildUpdate, sendDbError, safeOrderBy, safeOrderDir, withClient } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "material_id", "warehouse_id", "reserved_at", "created_at"]);

router.get("/inventory/reservations", async (req, res) => {
  const q = parseQuery(ListInventoryReservationsQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.material_id !== undefined) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    if (q.warehouse_id !== undefined) { params.push(q.warehouse_id); where.push(`warehouse_id = $${params.length}`); }
    if (q.project_id !== undefined) { params.push(q.project_id); where.push(`project_id = $${params.length}`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "reserved_at"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.inventory_reservations WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.inventory_reservations WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/inventory/reservations/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.inventory_reservations WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// POST — create reservation only when available stock is sufficient (409 if not)
router.post("/inventory/reservations", async (req, res) => {
  const data = parseBody(CreateInventoryReservationSchema, req, res); if (!data) return;
  try {
    const result = await withClient(async (client) => {
      await client.query("BEGIN");
      const stk = await client.query(
        "SELECT available_qty FROM inventory.inventory WHERE material_id = $1 AND warehouse_id = $2 FOR UPDATE",
        [data.material_id, data.warehouse_id],
      );
      const avail = Number(stk.rows[0]?.available_qty ?? 0);
      if (avail < Number(data.reserved_qty)) throw new Error("INSUFFICIENT_STOCK");

      await client.query(
        `UPDATE inventory.inventory
           SET reserved_qty = reserved_qty + $1,
               available_qty = available_qty - $1,
               updated_at = NOW()
         WHERE material_id = $2 AND warehouse_id = $3`,
        [data.reserved_qty, data.material_id, data.warehouse_id],
      );

      const ins = await client.query(
        `INSERT INTO inventory.inventory_reservations
           (material_id, warehouse_id, project_id, work_order_id, reserved_qty,
            reserved_by_user_id, state, notes, metadata, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          data.material_id, data.warehouse_id, data.project_id ?? null, data.work_order_id ?? null,
          data.reserved_qty, data.reserved_by_user_id ?? req.userId ?? null, data.state ?? "Reserved",
          data.notes ?? null, data.metadata ?? {}, req.userId ?? null,
        ],
      );
      await client.query("COMMIT");
      return ins.rows[0];
    });
    res.status(201).json(result);
  } catch (err: any) {
    if (err?.message === "INSUFFICIENT_STOCK") return res.status(409).json({ error: "Insufficient stock to reserve", code: "INSUFFICIENT_STOCK" });
    sendDbError(res, err);
  }
});

router.put("/inventory/reservations/:id", async (req, res) => {
  const data = parseBody(UpdateInventoryReservationSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.inventory_reservations", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/inventory/reservations/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.inventory_reservations SET is_deleted = true, state = 'Released', released_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

export default router;
