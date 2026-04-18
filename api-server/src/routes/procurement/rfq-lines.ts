// procurement.rfq_items (rfq_lines) CRUD
import { Router, type IRouter } from "express";
import { CreateRfqLineSchema, UpdateRfqLineSchema, ListRfqLinesQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/rfq-lines", async (req, res) => {
  const q = parseQuery(ListRfqLinesQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (q.rfq_id) { params.push(q.rfq_id); where.push(`rfq_id = $${params.length}`); }
    if (q.q) { params.push(`%${q.q}%`); where.push(`description ILIKE $${params.length}`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.rfq_items WHERE ${where.join(" AND ")} ORDER BY rfq_id, line_number LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/rfqs/:id/lines", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.rfq_items WHERE rfq_id = $1 ORDER BY line_number", [req.params.id]);
    res.json({ rows: r.rows });
  } catch (err) { sendDbError(res, err); }
});

router.post("/rfq-lines", async (req, res) => {
  const data = parseBody(CreateRfqLineSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.rfq_items", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/rfq-lines/:id", async (req, res) => {
  const data = parseBody(UpdateRfqLineSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.rfq_items", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/rfq-lines/:id", async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM procurement.rfq_items WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

export default router;
