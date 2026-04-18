// procurement.approvals CRUD + decide
import { Router, type IRouter } from "express";
import { CreateApprovalSchema, UpdateApprovalSchema, ListApprovalsQuerySchema, DecideApprovalSchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/approvals", async (req, res) => {
  const q = parseQuery(ListApprovalsQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(approval_type ILIKE $${params.length} OR approval_policy_code ILIKE $${params.length})`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    if (q.entity_type) { params.push(q.entity_type); where.push(`entity_type = $${params.length}`); }
    if (q.entity_id) { params.push(q.entity_id); where.push(`entity_id = $${params.length}`); }
    if (q.assigned_approver_user_id) { params.push(q.assigned_approver_user_id); where.push(`assigned_approver_user_id = $${params.length}`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.approvals WHERE ${where.join(" AND ")} ORDER BY requested_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/approvals/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.approvals WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/approvals", async (req, res) => {
  const data = parseBody(CreateApprovalSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.approvals", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/approvals/:id", async (req, res) => {
  const data = parseBody(UpdateApprovalSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.approvals", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

// Decide
router.post("/approvals/:id/decide", async (req, res) => {
  const data = parseBody(DecideApprovalSchema, req, res);
  if (!data) return;
  try {
    const stateMap: Record<string, string> = {
      approve: "approved",
      reject: "rejected",
      escalate: "escalated",
      request_changes: "pending",
    };
    const newState = stateMap[data.decision];
    const r = await pool.query(
      `UPDATE procurement.approvals
         SET state = $2, decision = $3, acted_at = NOW(), comments = $4, updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, newState, data.decision, data.comments ?? null],
    );
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, approval: r.rows[0] });
  } catch (err) { sendDbError(res, err); }
});

// Alias endpoint group: /procurement-approvals — same as /approvals
router.get("/procurement-approvals", async (req, res) => {
  const q = parseQuery(ListApprovalsQuerySchema, req, res);
  if (!q) return;
  try {
    const r = await pool.query("SELECT * FROM procurement.approvals ORDER BY requested_at DESC LIMIT $1 OFFSET $2", [q.limit, q.offset]);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

export default router;
