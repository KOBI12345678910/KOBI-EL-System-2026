// procurement.purchase_order_lines CRUD
import { Router, type IRouter } from "express";
import { CreatePoLineSchema, UpdatePoLineSchema, ListPoLinesQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/po-lines", async (req, res) => {
  const q = parseQuery(ListPoLinesQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (q.po_id) { params.push(q.po_id); where.push(`po_id = $${params.length}`); }
    if (q.material_id) { params.push(q.material_id); where.push(`material_id = $${params.length}`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.purchase_order_lines WHERE ${where.join(" AND ")} ORDER BY po_id, line_number LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows });
  } catch (err) { sendDbError(res, err); }
});

router.get("/purchase-orders/:id/lines", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.purchase_order_lines WHERE po_id = $1 ORDER BY line_number", [req.params.id]);
    res.json({ rows: r.rows });
  } catch (err) { sendDbError(res, err); }
});

router.post("/po-lines", async (req, res) => {
  const data = parseBody(CreatePoLineSchema, req, res);
  if (!data) return;
  try {
    if (!data.quantity_open) data.quantity_open = data.quantity_ordered - (data.quantity_received ?? 0);
    const q = buildInsert("procurement.purchase_order_lines", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/po-lines/:id", async (req, res) => {
  const data = parseBody(UpdatePoLineSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.purchase_order_lines", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/po-lines/:id", async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM procurement.purchase_order_lines WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

export default router;
