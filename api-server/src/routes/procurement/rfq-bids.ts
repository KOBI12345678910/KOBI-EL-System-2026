// procurement.supplier_quotes + supplier_quote_lines (rfq_bids) CRUD
import { Router, type IRouter } from "express";
import { CreateRfqBidSchema, UpdateRfqBidSchema, ListRfqBidsQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, sendDbError, withClient } from "./_helpers";

const router: IRouter = Router();

router.get("/rfq-bids", async (req, res) => {
  const q = parseQuery(ListRfqBidsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (q.rfq_id) { params.push(q.rfq_id); where.push(`rfq_id = $${params.length}`); }
    if (q.supplier_id) { params.push(q.supplier_id); where.push(`supplier_id = $${params.length}`); }
    if (q.selected !== undefined) { params.push(q.selected); where.push(`selected = $${params.length}`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.supplier_quotes WHERE ${where.join(" AND ")} ORDER BY selected DESC, grand_total ASC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/rfq-bids/:id", async (req, res) => {
  try {
    const bid = await pool.query("SELECT * FROM procurement.supplier_quotes WHERE id = $1", [req.params.id]);
    if (!bid.rowCount) return res.status(404).json({ error: "לא נמצא" });
    const lines = await pool.query("SELECT * FROM procurement.supplier_quote_lines WHERE supplier_quote_id = $1 ORDER BY line_number", [req.params.id]);
    res.json({ ...bid.rows[0], lines: lines.rows });
  } catch (err) { sendDbError(res, err); }
});

router.post("/rfq-bids", async (req, res) => {
  const data = parseBody(CreateRfqBidSchema, req, res);
  if (!data) return;
  try {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        let subtotal = 0, vat_total = 0, grand_total = 0;
        for (const l of data.lines) {
          const line_subtotal = l.quantity * l.unit_price;
          const vat_percent = l.vat_percent ?? 18;
          const vat_amount = line_subtotal * (vat_percent / 100);
          subtotal += line_subtotal;
          vat_total += vat_amount;
          grand_total += line_subtotal + vat_amount;
        }
        const header = await client.query(
          `INSERT INTO procurement.supplier_quotes
            (rfq_id, supplier_id, quote_reference, quote_date, valid_until, subtotal, vat_total, grand_total, currency, delivery_days_estimate, payment_terms, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [data.rfq_id, data.supplier_id, data.quote_reference ?? null, data.quote_date ?? null, data.valid_until ?? null,
           subtotal, vat_total, grand_total, data.currency ?? "ILS", data.delivery_days_estimate ?? null,
           data.payment_terms ?? null, data.notes ?? null],
        );
        const quoteId = header.rows[0].id;
        for (const l of data.lines) {
          const line_subtotal = l.quantity * l.unit_price;
          const vat_percent = l.vat_percent ?? 18;
          const vat_amount = line_subtotal * (vat_percent / 100);
          const line_total = line_subtotal + vat_amount;
          await client.query(
            `INSERT INTO procurement.supplier_quote_lines
              (supplier_quote_id, rfq_item_id, line_number, material_id, description, quantity, unit_price, line_subtotal, vat_percent, vat_amount, line_total, delivery_days, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [quoteId, l.rfq_item_id ?? null, l.line_number, l.material_id ?? null, l.description, l.quantity, l.unit_price,
             line_subtotal, vat_percent, vat_amount, line_total, l.delivery_days ?? null, l.notes ?? null],
          );
        }
        await client.query(
          "UPDATE procurement.rfqs SET state = CASE WHEN state = 'sent' THEN 'responded' ELSE state END, updated_at = NOW() WHERE id = $1",
          [data.rfq_id],
        );
        await client.query("COMMIT");
        res.status(201).json(header.rows[0]);
      } catch (e) { await client.query("ROLLBACK"); throw e; }
    });
  } catch (err) { sendDbError(res, err); }
});

router.put("/rfq-bids/:id", async (req, res) => {
  const data = parseBody(UpdateRfqBidSchema, req, res);
  if (!data) return;
  try {
    const allowed: any = { ...data }; delete allowed.lines;
    const keys = Object.keys(allowed);
    if (!keys.length) return res.status(400).json({ error: "No fields" });
    const vals = keys.map(k => (allowed as any)[k]);
    const sets = keys.map((k, i) => `"${k}" = $${i + 1}`).join(", ");
    vals.push(req.params.id);
    const r = await pool.query(`UPDATE procurement.supplier_quotes SET ${sets}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`, vals);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/rfq-bids/:id", async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM procurement.supplier_quotes WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

export default router;
