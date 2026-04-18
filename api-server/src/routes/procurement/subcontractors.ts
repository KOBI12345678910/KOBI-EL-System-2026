// procurement.subcontractors CRUD
import { Router, type IRouter } from "express";
import { CreateSubcontractorSchema, UpdateSubcontractorSchema, ListSubcontractorsQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/subcontractors", async (req, res) => {
  const q = parseQuery(ListSubcontractorsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["coalesce(is_deleted, false) = false"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(legal_name ILIKE $${params.length} OR subcontractor_number ILIKE $${params.length})`); }
    if (q.status) { params.push(q.status); where.push(`status = $${params.length}`); }
    if (q.specialty) { params.push(q.specialty); where.push(`specialty = $${params.length}`); }
    if (q.risk_level) { params.push(q.risk_level); where.push(`risk_level = $${params.length}`); }
    if (q.license_expiring_within_days) {
      params.push(q.license_expiring_within_days);
      where.push(`license_expiry IS NOT NULL AND license_expiry <= CURRENT_DATE + ($${params.length}::int * INTERVAL '1 day')`);
    }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.subcontractors WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/subcontractors/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.subcontractors WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/subcontractors", async (req, res) => {
  const data = parseBody(CreateSubcontractorSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.subcontractors", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/subcontractors/:id", async (req, res) => {
  const data = parseBody(UpdateSubcontractorSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.subcontractors", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/subcontractors/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE procurement.subcontractors SET is_deleted = true, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

export default router;
