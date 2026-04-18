// procurement.approval_steps CRUD (admin/config)
import { Router, type IRouter } from "express";
import { CreateApprovalStepSchema, UpdateApprovalStepSchema, ListApprovalStepsQuerySchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/approval-steps", async (req, res) => {
  const q = parseQuery(ListApprovalStepsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (q.policy_code) { params.push(q.policy_code); where.push(`policy_code = $${params.length}`); }
    if (q.entity_type) { params.push(q.entity_type); where.push(`entity_type = $${params.length}`); }
    if (q.is_active !== undefined) { params.push(q.is_active); where.push(`is_active = $${params.length}`); }
    if (q.q) { params.push(`%${q.q}%`); where.push(`(policy_code ILIKE $${params.length} OR tier_name ILIKE $${params.length})`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.approval_steps WHERE ${where.join(" AND ")} ORDER BY policy_code, entity_type, tier LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/approval-steps/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.approval_steps WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/approval-steps", async (req, res) => {
  const data = parseBody(CreateApprovalStepSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.approval_steps", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/approval-steps/:id", async (req, res) => {
  const data = parseBody(UpdateApprovalStepSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.approval_steps", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/approval-steps/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE procurement.approval_steps SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

export default router;
