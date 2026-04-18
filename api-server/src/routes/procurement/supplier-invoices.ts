// procurement.supplier_invoices CRUD + approve
import { Router, type IRouter } from "express";
import { CreateSupplierInvoiceSchema, UpdateSupplierInvoiceSchema, ListSupplierInvoicesQuerySchema, ApproveSupplierInvoiceSchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, withClient } from "./_helpers";

const router: IRouter = Router();

router.get("/supplier-invoices", async (req, res) => {
  const q = parseQuery(ListSupplierInvoicesQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`supplier_invoice_number ILIKE $${params.length}`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    if (q.supplier_id) { params.push(q.supplier_id); where.push(`supplier_id = $${params.length}`); }
    if (q.po_id) { params.push(q.po_id); where.push(`po_id = $${params.length}`); }
    if (q.approved_for_payment !== undefined) { params.push(q.approved_for_payment); where.push(`approved_for_payment = $${params.length}`); }
    if (q.invoice_date_from) { params.push(q.invoice_date_from); where.push(`invoice_date >= $${params.length}`); }
    if (q.invoice_date_to) { params.push(q.invoice_date_to); where.push(`invoice_date <= $${params.length}`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.supplier_invoices WHERE ${where.join(" AND ")} ORDER BY invoice_date DESC NULLS LAST, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/supplier-invoices/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.supplier_invoices WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/supplier-invoices", async (req, res) => {
  const data = parseBody(CreateSupplierInvoiceSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.supplier_invoices", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/supplier-invoices/:id", async (req, res) => {
  const data = parseBody(UpdateSupplierInvoiceSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.supplier_invoices", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/supplier-invoices/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE procurement.supplier_invoices SET is_deleted = true, state = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

// Business: APPROVE invoice for payment
router.post("/supplier-invoices/:id/approve", async (req, res) => {
  const data = parseBody(ApproveSupplierInvoiceSchema, req, res);
  if (!data) return;
  try {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const inv = await client.query("SELECT id, state, matched_po FROM procurement.supplier_invoices WHERE id = $1 FOR UPDATE", [req.params.id]);
        if (!inv.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "לא נמצא" }); }
        if (!inv.rows[0].matched_po && !data.override_match) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "Invoice not matched to PO — use override_match=true to force" });
        }
        await client.query(
          `INSERT INTO procurement.approvals
            (entity_type, entity_id, approval_type, requested_by_user_id, state, acted_at, decision, comments)
           VALUES ('supplier_invoice', $1, 'invoice_approval', $2, 'approved', NOW(), 'approve', $3)`,
          [req.params.id, (req as any).userId ?? null, data.comments ?? null],
        );
        const updated = await client.query(
          "UPDATE procurement.supplier_invoices SET state = 'approved', approved_for_payment = true, updated_at = NOW() WHERE id = $1 RETURNING *",
          [req.params.id],
        );
        await client.query("COMMIT");
        res.json({ success: true, invoice: updated.rows[0] });
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    });
  } catch (err) { sendDbError(res, err); }
});

export default router;
