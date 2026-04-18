// procurement_approvals — alias surface over procurement.approvals,
// provides a queue-focused endpoint and /decide convenience.
import { Router, type IRouter } from "express";
import { pool, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/procurement-approvals/queue", async (req, res) => {
  try {
    const state = (req.query.state as string) ?? "pending";
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const r = await pool.query(
      `SELECT a.*,
              CASE a.entity_type
                WHEN 'purchase_order' THEN (SELECT po_number FROM procurement.purchase_orders WHERE id = a.entity_id)
                WHEN 'supplier_invoice' THEN (SELECT supplier_invoice_number FROM procurement.supplier_invoices WHERE id = a.entity_id)
                WHEN 'contract' THEN (SELECT contract_number FROM procurement.contracts WHERE id = a.entity_id)
                WHEN 'rfq' THEN (SELECT rfq_number FROM procurement.rfqs WHERE id = a.entity_id)
                ELSE NULL
              END AS entity_reference
         FROM procurement.approvals a
        WHERE a.state = $1
        ORDER BY a.requested_at ASC
        LIMIT $2`,
      [state, limit],
    );
    res.json({ rows: r.rows, state, limit });
  } catch (err) { sendDbError(res, err); }
});

router.get("/procurement-approvals/summary", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT state, count(*)::int AS c
         FROM procurement.approvals
        GROUP BY state
        ORDER BY state`,
    );
    res.json({ by_state: r.rows });
  } catch (err) { sendDbError(res, err); }
});

export default router;
