// procurement.contracts CRUD
import { Router, type IRouter } from "express";
import { CreateContractSchema, UpdateContractSchema, ListContractsQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/contracts", async (req, res) => {
  const q = parseQuery(ListContractsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`contract_number ILIKE $${params.length}`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    if (q.contract_type) { params.push(q.contract_type); where.push(`contract_type = $${params.length}`); }
    if (q.supplier_id) { params.push(q.supplier_id); where.push(`supplier_id = $${params.length}`); }
    if (q.customer_id) { params.push(q.customer_id); where.push(`customer_id = $${params.length}`); }
    if (q.expiring_within_days) { params.push(q.expiring_within_days); where.push(`expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + ($${params.length}::int * INTERVAL '1 day')`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.contracts WHERE ${where.join(" AND ")} ORDER BY expiry_date ASC NULLS LAST, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/contracts/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.contracts WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/contracts", async (req, res) => {
  const data = parseBody(CreateContractSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.contracts", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/contracts/:id", async (req, res) => {
  const data = parseBody(UpdateContractSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.contracts", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/contracts/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE procurement.contracts SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

export default router;
