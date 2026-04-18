// procurement.rfqs CRUD + business endpoints
import { Router, type IRouter } from "express";
import {
  CreateRfqSchema,
  UpdateRfqSchema,
  ListRfqsQuerySchema,
  SendRfqSchema,
  AwardRfqSchema,
} from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError, withClient } from "./_helpers";

const router: IRouter = Router();

router.get("/rfqs", async (req, res) => {
  const q = parseQuery(ListRfqsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_active, true) = true"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(rfq_number ILIKE $${params.length} OR internal_notes ILIKE $${params.length})`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    if (q.project_id) { params.push(q.project_id); where.push(`project_id = $${params.length}`); }
    if (q.winning_supplier_id) { params.push(q.winning_supplier_id); where.push(`winning_supplier_id = $${params.length}`); }
    if (q.requested_date_from) { params.push(q.requested_date_from); where.push(`requested_date >= $${params.length}`); }
    if (q.requested_date_to) { params.push(q.requested_date_to); where.push(`requested_date <= $${params.length}`); }
    const orderBy = ["id", "rfq_number", "requested_date", "response_deadline", "created_at"].includes(q.order_by) ? q.order_by : "id";
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.rfqs WHERE ${where.join(" AND ")} ORDER BY ${orderBy} ${q.order_dir} LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/rfqs/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.rfqs WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    // Include header + counts
    const [items, invites, bids] = await Promise.all([
      pool.query("SELECT count(*)::int as c FROM procurement.rfq_items WHERE rfq_id = $1", [req.params.id]),
      pool.query("SELECT count(*)::int as c FROM procurement.rfq_supplier_invites WHERE rfq_id = $1", [req.params.id]),
      pool.query("SELECT count(*)::int as c FROM procurement.supplier_quotes WHERE rfq_id = $1", [req.params.id]),
    ]);
    res.json({ ...r.rows[0], counts: { items: items.rows[0].c, invites: invites.rows[0].c, bids: bids.rows[0].c } });
  } catch (err) { sendDbError(res, err); }
});

router.post("/rfqs", async (req, res) => {
  const data = parseBody(CreateRfqSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.rfqs", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/rfqs/:id", async (req, res) => {
  const data = parseBody(UpdateRfqSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.rfqs", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/rfqs/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE procurement.rfqs SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

// Business: SEND — move draft → sent and create invites
router.post("/rfqs/:id/send", async (req, res) => {
  const data = parseBody(SendRfqSchema, req, res);
  if (!data) return;
  try {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const rfq = await client.query("SELECT id, state FROM procurement.rfqs WHERE id = $1 FOR UPDATE", [req.params.id]);
        if (!rfq.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "לא נמצא" }); }
        if (rfq.rows[0].state !== "draft") { await client.query("ROLLBACK"); return res.status(409).json({ error: `RFQ state is ${rfq.rows[0].state}, cannot send` }); }
        for (const supplierId of data.invited_supplier_ids) {
          await client.query(
            `INSERT INTO procurement.rfq_supplier_invites (rfq_id, supplier_id, response_status, notes)
             VALUES ($1, $2, 'pending', $3) ON CONFLICT (rfq_id, supplier_id) DO NOTHING`,
            [req.params.id, supplierId, data.message ?? null],
          );
        }
        const updated = await client.query(
          "UPDATE procurement.rfqs SET state = 'sent', updated_at = NOW() WHERE id = $1 RETURNING *",
          [req.params.id],
        );
        await client.query("COMMIT");
        res.json({ success: true, rfq: updated.rows[0], invites_created: data.invited_supplier_ids.length });
      } catch (innerErr) {
        await client.query("ROLLBACK");
        throw innerErr;
      }
    });
  } catch (err) { sendDbError(res, err); }
});

// Business: AWARD — mark winning quote, update rfq to awarded
router.post("/rfqs/:id/award/:bidId", async (req, res) => {
  const data = parseBody(AwardRfqSchema.partial(), req, res);
  if (!data) return;
  try {
    await withClient(async (client) => {
      await client.query("BEGIN");
      try {
        const bid = await client.query(
          "SELECT id, rfq_id, supplier_id FROM procurement.supplier_quotes WHERE id = $1 AND rfq_id = $2 FOR UPDATE",
          [req.params.bidId, req.params.id],
        );
        if (!bid.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ error: "Bid not found for this RFQ" }); }
        await client.query("UPDATE procurement.supplier_quotes SET selected = false WHERE rfq_id = $1", [req.params.id]);
        await client.query("UPDATE procurement.supplier_quotes SET selected = true, state = 'awarded', updated_at = NOW() WHERE id = $1", [req.params.bidId]);
        const updated = await client.query(
          "UPDATE procurement.rfqs SET state = 'awarded', winning_supplier_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *",
          [req.params.id, bid.rows[0].supplier_id],
        );
        await client.query("COMMIT");
        res.json({ success: true, rfq: updated.rows[0], awarded_bid_id: Number(req.params.bidId) });
      } catch (innerErr) {
        await client.query("ROLLBACK");
        throw innerErr;
      }
    });
  } catch (err) { sendDbError(res, err); }
});

export default router;
