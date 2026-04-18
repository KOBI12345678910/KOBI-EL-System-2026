// procurement.three_way_matches CRUD + resolve
import { Router, type IRouter } from "express";
import { CreateThreeWayMatchSchema, UpdateThreeWayMatchSchema, ListThreeWayMatchesQuerySchema, ResolveThreeWayMatchSchema } from "@workspace/api-zod/procurement";
import { pool, parseBody, parseQuery, buildInsert, buildUpdate, sendDbError } from "./_helpers";

const router: IRouter = Router();

router.get("/three-way-matches", async (req, res) => {
  const q = parseQuery(ListThreeWayMatchesQuerySchema, req, res);
  if (!q) return;
  try {
    const where: string[] = ["1=1"];
    const params: any[] = [];
    if (q.q) { params.push(`%${q.q}%`); where.push(`(match_number ILIKE $${params.length} OR discrepancy_reason ILIKE $${params.length})`); }
    if (q.state) { params.push(q.state); where.push(`state = $${params.length}`); }
    if (q.po_id) { params.push(q.po_id); where.push(`po_id = $${params.length}`); }
    if (q.tolerance_exceeded !== undefined) { params.push(q.tolerance_exceeded); where.push(`tolerance_exceeded = $${params.length}`); }
    if (q.requires_approval !== undefined) { params.push(q.requires_approval); where.push(`requires_approval = $${params.length}`); }
    params.push(q.limit); params.push(q.offset);
    const sql = `SELECT * FROM procurement.three_way_matches WHERE ${where.join(" AND ")} ORDER BY match_date DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const r = await pool.query(sql, params);
    res.json({ rows: r.rows, limit: q.limit, offset: q.offset });
  } catch (err) { sendDbError(res, err); }
});

router.get("/three-way-matches/:id", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM procurement.three_way_matches WHERE id = $1", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.post("/three-way-matches", async (req, res) => {
  const data = parseBody(CreateThreeWayMatchSchema, req, res);
  if (!data) return;
  try {
    const q = buildInsert("procurement.three_way_matches", data);
    const r = await pool.query(q.text, q.values);
    res.status(201).json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.put("/three-way-matches/:id", async (req, res) => {
  const data = parseBody(UpdateThreeWayMatchSchema, req, res);
  if (!data) return;
  try {
    const q = buildUpdate("procurement.three_way_matches", data, "id", req.params.id);
    if (!q) return res.status(400).json({ error: "No fields" });
    const r = await pool.query(q.text, q.values);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json(r.rows[0]);
  } catch (err) { sendDbError(res, err); }
});

router.delete("/three-way-matches/:id", async (req, res) => {
  try {
    const r = await pool.query("UPDATE procurement.three_way_matches SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true });
  } catch (err) { sendDbError(res, err); }
});

// Business: RESOLVE — mark discrepancy → resolved
router.post("/three-way-matches/:id/resolve", async (req, res) => {
  const data = parseBody(ResolveThreeWayMatchSchema, req, res);
  if (!data) return;
  try {
    const r = await pool.query(
      `UPDATE procurement.three_way_matches
         SET state = 'resolved',
             resolution_action = $2,
             internal_notes = COALESCE(internal_notes, '') || CASE WHEN $3::text IS NOT NULL THEN E'\n' || $3 ELSE '' END,
             resolved_at = NOW(),
             resolved_by_user_id = $4,
             updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [req.params.id, data.resolution_action, data.notes ?? null, (req as any).userId ?? null],
    );
    if (!r.rowCount) return res.status(404).json({ error: "לא נמצא" });
    res.json({ success: true, match: r.rows[0] });
  } catch (err) { sendDbError(res, err); }
});

export default router;
