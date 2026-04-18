// inventory.inventory_issues CRUD + POST /:id/post
import { Router, type IRouter } from "express";
import {
  CreateInventoryIssueSchema,
  UpdateInventoryIssueSchema,
  ListInventoryIssuesQuerySchema,
} from "@workspace/api-zod/inventory";
import { authMiddleware } from "../../middleware/auth";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, safeOrderBy, safeOrderDir, withClient } from "./_helpers";

const router: IRouter = Router();
router.use(authMiddleware);
const ALLOWED = new Set(["id", "issue_number", "issue_date", "material_id", "warehouse_id", "status", "created_at"]);

router.get("/inventory/issues", async (req, res) => {
  const q = parseQuery(ListInventoryIssuesQuerySchema, req, res); if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`issue_number ILIKE $${params.length}`); }
    if (q.material_id !== undefined) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    if (q.warehouse_id !== undefined) { params.push(q.warehouse_id); where.push(`warehouse_id = $${params.length}`); }
    if (q.project_id !== undefined) { params.push(q.project_id); where.push(`project_id = $${params.length}`); }
    if (q.work_order_id !== undefined) { params.push(q.work_order_id); where.push(`work_order_id = $${params.length}`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    const ob = safeOrderBy(q.order_by, ALLOWED, "issue_date"); const od = safeOrderDir(q.order_dir);
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM inventory.inventory_issues WHERE ${where.join(" AND ")} ORDER BY ${ob} ${od} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    const c = await pool.query(`SELECT count(*)::bigint AS total FROM inventory.inventory_issues WHERE ${where.join(" AND ")}`, params.slice(0, params.length - 2));
    res.json({ rows: r.rows, total: Number(c.rows[0]?.total ?? 0), limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/inventory/issues/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM inventory.inventory_issues WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/inventory/issues", async (req, res) => {
  const data = parseBody(CreateInventoryIssueSchema, req, res); if (!data) return;
  try { const q = buildInsert("inventory.inventory_issues", data); const r = await pool.query(q.text, q.values); res.status(201).json(r.rows[0]); }
  catch (err) { sendDbError(res, err); }
});

router.put("/inventory/issues/:id", async (req, res) => {
  const data = parseBody(UpdateInventoryIssueSchema, req, res); if (!data) return;
  try {
    const q = buildUpdate("inventory.inventory_issues", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/inventory/issues/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE inventory.inventory_issues SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, id: r.rows[0].id });
  } catch (err) { sendDbError(res, err); }
});

// POST /inventory/issues/:id/post — post issue, decrement stock, create movement
router.post("/inventory/issues/:id/post", async (req, res) => {
  try {
    const result = await withClient(async (client) => {
      await client.query("BEGIN");
      const rc = await client.query("SELECT * FROM inventory.inventory_issues WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (!rc.rowCount) throw new Error("NOT_FOUND");
      const iss = rc.rows[0];
      if (iss.status === "posted") throw new Error("ALREADY_POSTED");

      // Check availability
      const stk = await client.query(
        "SELECT * FROM inventory.inventory WHERE material_id = $1 AND warehouse_id = $2 FOR UPDATE",
        [iss.material_id, iss.warehouse_id],
      );
      const onHand = Number(stk.rows[0]?.on_hand_qty ?? 0);
      if (onHand < Number(iss.quantity_issued)) throw new Error("INSUFFICIENT_STOCK");

      await client.query(
        `UPDATE inventory.inventory
           SET on_hand_qty = on_hand_qty - $1,
               available_qty = available_qty - $1,
               last_movement_at = NOW(),
               updated_at = NOW()
         WHERE material_id = $2 AND warehouse_id = $3`,
        [iss.quantity_issued, iss.material_id, iss.warehouse_id],
      );

      await client.query(
        `INSERT INTO inventory.inventory_movements
           (material_id, warehouse_id, movement_type, quantity, unit_cost, movement_date,
            reference_type, reference_id, status, posted_at, created_by)
         VALUES ($1, $2, 'issue', $3, $4, NOW(), 'inventory_issue', $5, 'posted', NOW(), $6)`,
        [iss.material_id, iss.warehouse_id, -Math.abs(Number(iss.quantity_issued)), iss.cost_per_unit ?? null, iss.id, req.userId ?? null],
      );

      const upd = await client.query(
        `UPDATE inventory.inventory_issues
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
    if (err?.message === "ALREADY_POSTED") return res.status(409).json({ error: "Issue already posted" });
    if (err?.message === "INSUFFICIENT_STOCK") return res.status(409).json({ error: "Insufficient stock to post issue" });
    sendDbError(res, err);
  }
});

export default router;
