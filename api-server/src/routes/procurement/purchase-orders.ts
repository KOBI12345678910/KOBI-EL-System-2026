// procurement.purchase_orders CRUD + approve/submit
import { Router, type IRouter } from "express";
import { CreatePurchaseOrderSchema, UpdatePurchaseOrderSchema, ListPurchaseOrdersQuerySchema, ApprovePurchaseOrderSchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, withClient } from "./_helpers";

const router: IRouter = Router();

router.get("/purchase-orders", async (req, res) => {
  const q = parseQuery(ListPurchaseOrdersQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(po_number ILIKE $${params.length} OR internal_notes ILIKE $${params.length})`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    if (q.supplier_id) { params.push(q.supplier_id); where.push(`supplier_id = $${params.length}`); }
    if (q.project_id) { params.push(q.project_id); where.push(`project_id = $${params.length}`); }
    if (q.approval_status) { params.push(q.approval_status); where.push(`approval_status = $${params.length}`); }
    if (q.payment_status) { params.push(q.payment_status); where.push(`payment_status = $${params.length}`); }
    if (q.order_date_from) { params.push(q.order_date_from); where.push(`order_date >= $${params.length}`); }
    if (q.order_date_to) { params.push(q.order_date_to); where.push(`order_date <= $${params.length}`); }
    const orderBy = ["id", "po_number", "order_date", "grand_total", "state"].includes(q.order_by) ? q.order_by : "id";
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.purchase_orders WHERE ${where.join(" AND ")} ORDER BY ${orderBy} ${q.order_dir} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/purchase-orders/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.purchase_orders WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    const [lines, receipts, invoices] = await Promise.all([
      pool.query("SELECT count(*)::int as c FROM procurement.purchase_order_lines WHERE po_id = $1", [req.params.id]),
      pool.query("SELECT count(*)::int as c FROM procurement.goods_receipts WHERE po_id = $1", [req.params.id]),
      pool.query("SELECT count(*)::int as c FROM procurement.supplier_invoices WHERE po_id = $1", [req.params.id]),
    ]);
    res.json({ ...r.rows[0], counts: { lines: lines.rows[0].c, receipts: receipts.rows[0].c, invoices: invoices.rows[0].c } });
  } catch (err) { sendDbError(res, err); }
});

router.post("/purchase-orders", async (req, res) => {
  const data = parseBody(CreatePurchaseOrderSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.purchase_orders", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/purchase-orders/:id", async (req, res) => {
  const data = parseBody(UpdatePurchaseOrderSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.purchase_orders", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/purchase-orders/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE procurement.purchase_orders SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

// Business: APPROVE — move pending_approval → approved, create approval record
router.post("/purchase-orders/:id/approve", async (req, res) => {
  const data = parseBody(ApprovePurchaseOrderSchema, req, res);
  if (!data) return;
  try {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const po = await client.query("SELECT id, state, grand_total, approval_status FROM procurement.purchase_orders WHERE id = $1 FOR UPDATE", [req.params.id]);
        if (!po.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "לא נמצא" }); }
        if (po.rows[0].state !== "pending_approval" && po.rows[0].state !== "draft") {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: `PO state is ${po.rows[0].state}, cannot approve` });
        }
        await client.query(
          `INSERT INTO procurement.approvals
            (entity_type, entity_id, approval_type, requested_by_user_id, assigned_approver_user_id, state, acted_at, decision, comments)
           VALUES ('purchase_order', $1, 'po_approval', $2, $2, 'approved', NOW(), 'approve', $3)`,
          [req.params.id, (req as any).userId ?? null, data.comments ?? null],
        );
        const updated = await client.query(
          "UPDATE procurement.purchase_orders SET state = 'approved', approval_status = 'approved', updated_at = NOW() WHERE id = $1 RETURNING *",
          [req.params.id],
        );
        await client.query("COMMIT");
        res.json({ success: true, po: updated.rows[0] });
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    });
  } catch (err) { sendDbError(res, err); }
});

// Business: SUBMIT — move approved → submitted (to supplier)
router.post("/purchase-orders/:id/submit", async (req, res) => {
  try {
    const po = await pool.query("SELECT state FROM procurement.purchase_orders WHERE id = $1", [req.params.id]);
    if (!po.rowCount) return res.status(404).json({ error: "לא נמצא" });
    if (po.rows[0].state !== "approved") return res.status(409).json({ error: `PO state is ${po.rows[0].state}, cannot submit` });
    const r = await pool.query("UPDATE procurement.purchase_orders SET state = 'submitted', updated_at = NOW() WHERE id = $1 RETURNING *", [req.params.id]);
    res.json({ success: true, po: r.rows[0] });
  } catch (err) { sendDbError(res, err); }
});

export default router;
