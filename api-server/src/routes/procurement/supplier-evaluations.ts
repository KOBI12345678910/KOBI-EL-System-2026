// procurement.supplier_evaluations CRUD
import { Router, type IRouter } from "express";
import { CreateSupplierEvaluationSchema, UpdateSupplierEvaluationSchema, ListSupplierEvaluationsQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/supplier-evaluations", async (req, res) => {
  const q = parseQuery(ListSupplierEvaluationsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (q.supplier_id) { params.push(q.supplier_id); where.push(`supplier_id = $${params.length}`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    if (q.grade) { params.push(q.grade); where.push(`grade = $${params.length}`); }
    if (q.min_overall_score !== undefined) { params.push(q.min_overall_score); where.push(`overall_score >= $${params.length}`); }
    if (q.q) { params.push(`%${q.q}%`); where.push(`evaluation_number ILIKE $${params.length}`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.supplier_evaluations WHERE ${where.join(" AND ")} ORDER BY evaluation_period_end DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/supplier-evaluations/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.supplier_evaluations WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/supplier-evaluations", async (req, res) => {
  const data = parseBody(CreateSupplierEvaluationSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.supplier_evaluations", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/supplier-evaluations/:id", async (req, res) => {
  const data = parseBody(UpdateSupplierEvaluationSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.supplier_evaluations", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/supplier-evaluations/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE procurement.supplier_evaluations SET is_active = false, state = 'archived', updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

export default router;
