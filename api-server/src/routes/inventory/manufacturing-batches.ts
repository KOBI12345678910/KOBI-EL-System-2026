// inventory.manufacturing_batches CRUD + POST /:id/consume-materials
import { Router, type IRouter } from "express";
import {
  CreateManufacturingBatchSchema,
  UpdateManufacturingBatchSchema,
  ListManufacturingBatchesQuerySchema,
  ConsumeMaterialsSchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir, withClient } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "batch_number", "started_at", "completed_at", "state", "created_at"]);

router.get("/manufacturing-batches", async (req, res) => {
  const q = parseQuery(ListManufacturingBatchesQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`batch_number ILIKE $${params.length}`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    if (q.project_id !== undefined) { params.push(q.project_id); where.push(`project_id = $${params.length}`); }
    if (q.work_order_id !== undefined) { params.push(q.work_order_id); where.push(`work_order_id = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "created_at"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.manufacturing_batches WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.manufacturing_batches WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/manufacturing-batches/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.manufacturing_batches WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/manufacturing-batches", async (req, res) => {
  const data = parseBody(CreateManufacturingBatchSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.manufacturing_batches", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/manufacturing-batches/:id", async (req, res) => {
  const data = parseBody(UpdateManufacturingBatchSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.manufacturing_batches", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/manufacturing-batches/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.manufacturing_batches SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// POST /manufacturing-batches/:id/consume-materials — decrement stock + record movements
router.post("/manufacturing-batches/:id/consume-materials", async (req, res) => {
  const data = parseBody(ConsumeMaterialsSchema, req, res); if (!data) return;
  try {
    const result = await withClient(async (client) => {
      await client.query("BEGIN");
      const b = await client.query("SELECT * FROM inventory.manufacturing_batches WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (!b.rowCount) throw new Error("NOT_FOUND");

      for (const line of data.lines) {
        const stk = await client.query(
          "SELECT on_hand_qty FROM inventory.inventory WHERE material_id = $1 AND warehouse_id = $2 FOR UPDATE",
          [line.material_id, line.warehouse_id],
        );
        if (!stk.rowCount || Number(stk.rows[0].on_hand_qty) < Number(line.quantity)) {
          throw new Error("INSUFFICIENT_STOCK:" + line.material_id);
        }
        await client.query(
          `UPDATE inventory.inventory
             SET on_hand_qty = on_hand_qty - $1,
                 available_qty = available_qty - $1,
                 last_movement_at = NOW(),
                 updated_at = NOW()
           WHERE material_id = $2 AND warehouse_id = $3`,
          [line.quantity, line.material_id, line.warehouse_id],
        );
        await client.query(
          `INSERT INTO inventory.inventory_movements
             (material_id, warehouse_id, lot_id, movement_type, quantity, movement_date,
              reference_type, reference_id, status, posted_at, created_by, notes)
           VALUES ($1, $2, $3, 'issue', $4, NOW(), 'manufacturing_batch', $5, 'posted', NOW(), $6, 'Consumed for manufacturing batch')`,
          [line.material_id, line.warehouse_id, line.lot_id ?? null, -Math.abs(Number(line.quantity)), req.params.id, req.userId ?? null],
        );
      }

      await client.query("COMMIT");
      return { success: true, batch_id: req.params.id, consumed_lines: data.lines.length };
    });
    res.json(result);
  } catch (err: any) {
    const msg = err?.message ?? "";
    if (msg === "NOT_FOUND") return res.status(404).json({ error: "לא נמצא" });
    if (msg.startsWith("INSUFFICIENT_STOCK:")) {
      const [, matId] = msg.split(":");
      return res.status(409).json({ error: "Insufficient stock", material_id: Number(matId) });
    }
    sendDbError(res, err);
  }
});

export default router;
