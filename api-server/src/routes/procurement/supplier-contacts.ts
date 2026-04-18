// procurement.supplier_contacts CRUD
import { Router, type IRouter } from "express";
import { CreateSupplierContactSchema, UpdateSupplierContactSchema, ListSupplierContactsQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/supplier-contacts", async (req, res) => {
  const q = parseQuery(ListSupplierContactsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (q.supplier_id) { params.push(q.supplier_id); where.push(`supplier_id = $${params.length}`); }
    if (q.is_primary !== undefined) { params.push(q.is_primary); where.push(`is_primary = $${params.length}`); }
    if (q.is_active !== undefined) { params.push(q.is_active); where.push(`is_active = $${params.length}`); }
    if (q.q) { params.push(`%${q.q}%`); where.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.supplier_contacts WHERE ${where.join(" AND ")} ORDER BY is_primary DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const result = await pool.query(sql, params);
    res.json({ rows: result.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/supplier-contacts/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.supplier_contacts WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/supplier-contacts", async (req, res) => {
  const data = parseBody(CreateSupplierContactSchema, req, res);
  if (!data) return;
  try {
    if (data.is_primary) {
      await pool.query("UPDATE procurement.supplier_contacts SET is_primary = false WHERE supplier_id = $1", [data.supplier_id]);
    }
    const q = buildInsert("procurement.supplier_contacts", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/supplier-contacts/:id", async (req, res) => {
  const data = parseBody(UpdateSupplierContactSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.supplier_contacts", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields to update" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/supplier-contacts/:id", async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM procurement.supplier_contacts WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

export default router;
