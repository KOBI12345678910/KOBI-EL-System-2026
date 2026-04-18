// procurement.goods_receipts CRUD + three-way-match trigger
import { Router, type IRouter } from "express";
import { CreateGoodsReceiptSchema, UpdateGoodsReceiptSchema, ListGoodsReceiptsQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildUpdate, sendDbError, withClient } from "./_helpers";

const router: IRouter = Router();

router.get("/goods-receipts", async (req, res) => {
  const q = parseQuery(ListGoodsReceiptsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(gr_number ILIKE $${params.length} OR delivery_note_ref ILIKE $${params.length})`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    if (q.po_id) { params.push(q.po_id); where.push(`po_id = $${params.length}`); }
    if (q.supplier_id) { params.push(q.supplier_id); where.push(`supplier_id = $${params.length}`); }
    if (q.warehouse_id) { params.push(q.warehouse_id); where.push(`warehouse_id = $${params.length}`); }
    if (q.receipt_date_from) { params.push(q.receipt_date_from); where.push(`receipt_date >= $${params.length}`); }
    if (q.receipt_date_to) { params.push(q.receipt_date_to); where.push(`receipt_date <= $${params.length}`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.goods_receipts WHERE ${where.join(" AND ")} ORDER BY receipt_date DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/goods-receipts/:id", async (req, res) => {
  try {
    const gr = await pool.query("SELECT * FROM procurement.goods_receipts WHERE id = $1", [req.params.id]);
    if (!gr.rowCount) return res.status(404).json({ error: "לא נמצא" });
    const lines = await pool.query("SELECT * FROM procurement.goods_receipt_lines WHERE goods_receipt_id = $1 ORDER BY line_number", [req.params.id]);
    res.json({ ...gr.rows[0], lines: lines.rows });
  } catch (err) { sendDbError(res, err); }
});

// POST /goods-receipts — creates header + lines + (optionally) triggers three-way match
router.post("/goods-receipts", async (req, res) => {
  const data = parseBody(CreateGoodsReceiptSchema, req, res);
  if (!data) return;
  try {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const header = await client.query(
          `INSERT INTO procurement.goods_receipts
            (gr_number, po_id, supplier_id, project_id, warehouse_id, receipt_date, received_by_user_id,
             delivery_note_ref, carrier, state, inspection_status, inspection_notes, internal_notes, metadata)
           VALUES ($1,$2,$3,$4,$5,COALESCE($6, CURRENT_DATE),$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING *`,
          [
            data.gr_number, data.po_id, data.supplier_id, data.project_id ?? null, data.warehouse_id ?? null,
            data.receipt_date ?? null, (req as any).userId ?? null,
            data.delivery_note_ref ?? null, data.carrier ?? null, data.state ?? "draft",
            data.inspection_status ?? "pending", data.inspection_notes ?? null, data.internal_notes ?? null,
            data.metadata ?? {},
          ],
        );
        const grId = header.rows[0].id;
        for (const l of data.lines) {
          await client.query(
            `INSERT INTO procurement.goods_receipt_lines
              (goods_receipt_id, po_line_id, line_number, material_id, description, quantity_expected,
               quantity_received, quantity_accepted, quantity_rejected, unit_of_measure, unit_cost,
               line_total, reject_reason, lot_number, expiry_date)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
            [
              grId, l.po_line_id ?? null, l.line_number, l.material_id ?? null, l.description,
              l.quantity_expected ?? 0, l.quantity_received, l.quantity_accepted ?? 0, l.quantity_rejected ?? 0,
              l.unit_of_measure ?? null, l.unit_cost ?? null, l.line_total ?? 0, l.reject_reason ?? null,
              l.lot_number ?? null, l.expiry_date ?? null,
            ],
          );
          if (l.po_line_id) {
            await client.query(
              `UPDATE procurement.purchase_order_lines
                 SET quantity_received = COALESCE(quantity_received,0) + $1,
                     quantity_open = GREATEST(0, quantity_ordered - (COALESCE(quantity_received,0) + $1)),
                     updated_at = NOW()
               WHERE id = $2`,
              [l.quantity_received, l.po_line_id],
            );
          }
        }
        // Update PO receiving_status
        const linesAgg = await client.query(
          `SELECT SUM(quantity_ordered) AS ord, SUM(quantity_received) AS recv
             FROM procurement.purchase_order_lines WHERE po_id = $1`,
          [data.po_id],
        );
        const { ord, recv } = linesAgg.rows[0] ?? {};
        let recvStatus = "partially_received";
        let poState: string | null = null;
        if (Number(recv) >= Number(ord) && Number(ord) > 0) { recvStatus = "fully_received"; poState = "fully_received"; }
        await client.query(
          `UPDATE procurement.purchase_orders
             SET receiving_status = $2,
                 state = COALESCE($3, state),
                 updated_at = NOW()
           WHERE id = $1`,
          [data.po_id, recvStatus, poState],
        );

        let twm: any = null;
        if (data.trigger_three_way_match !== false) {
          const matchNumber = `TWM-${Date.now()}-${grId}`;
          const twmResult = await client.query(
            `INSERT INTO procurement.three_way_matches
              (match_number, po_id, goods_receipt_id, match_date, state)
             VALUES ($1, $2, $3, CURRENT_DATE, 'pending')
             RETURNING *`,
            [matchNumber, data.po_id, grId],
          );
          twm = twmResult.rows[0];
        }

        await client.query("COMMIT");
        res.status(201).json({ ...header.rows[0], three_way_match: twm });
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    });
  } catch (err) { sendDbError(res, err); }
});

router.put("/goods-receipts/:id", async (req, res) => {
  const data = parseBody(UpdateGoodsReceiptSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.goods_receipts", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/goods-receipts/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE procurement.goods_receipts SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

export default router;
