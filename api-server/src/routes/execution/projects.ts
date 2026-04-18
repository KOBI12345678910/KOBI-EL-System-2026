// API routes for execution.projects
import { Router } from "express";
import { Projects } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler, validate } from "./_shared";

const router = Router();
router.use(requireExecutionAuth);

// GET /api/execution/projects
router.get("/", asyncHandler(async (req, res) => {
  const q = validate(Projects.ListProjectsQuerySchema, req.query, res);
  if (!q) return;
  const filters: string[] = ["is_deleted = false"];
  const params: unknown[] = [];
  let i = 1;
  if (q.state) { filters.push(`state = $${i++}`); params.push(q.state); }
  if (q.customer_id) { filters.push(`customer_id = $${i++}`); params.push(q.customer_id); }
  if (q.owner_user_id) { filters.push(`owner_user_id = $${i++}`); params.push(q.owner_user_id); }
  if (q.is_active !== undefined) { filters.push(`is_active = $${i++}`); params.push(q.is_active); }
  if (q.q) { filters.push(`(project_number ILIKE $${i} OR project_name ILIKE $${i})`); params.push(`%${q.q}%`); i++; }
  const orderBy = ["project_number", "project_name", "state", "created_at", "updated_at"].includes(q.order_by || "") ? q.order_by : "created_at";
  const rows = await query(
    `SELECT * FROM execution.projects WHERE ${filters.join(" AND ")} ORDER BY ${orderBy} ${q.order_dir} LIMIT $${i++} OFFSET $${i}`,
    [...params, q.limit, q.offset]
  );
  const [{ count }] = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM execution.projects WHERE ${filters.join(" AND ")}`,
    params
  );
  res.json({ data: rows, total: parseInt(count, 10), limit: q.limit, offset: q.offset });
}));

// GET /api/execution/projects/:id
router.get("/:id", asyncHandler(async (req, res) => {
  const rows = await query(`SELECT * FROM execution.projects WHERE id = $1 AND is_deleted = false`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ error: "Project not found" }); return; }
  res.json({ data: rows[0] });
}));

// POST /api/execution/projects
router.post("/", asyncHandler(async (req, res) => {
  const v = validate(Projects.CreateProjectSchema, req.body, res);
  if (!v) return;
  const rows = await query(
    `INSERT INTO execution.projects (project_number, project_name, customer_id, quote_id, contract_id, project_type,
      location_name, address_line_1, city, region, owner_user_id, budget_amount, priority, planned_start_date,
      planned_end_date, billable, state, internal_notes, external_notes, is_active, metadata, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$22)
     RETURNING *`,
    [v.project_number, v.project_name, v.customer_id, v.quote_id, v.contract_id, v.project_type,
      v.location_name, v.address_line_1, v.city, v.region, v.owner_user_id, v.budget_amount, v.priority,
      v.planned_start_date, v.planned_end_date, v.billable, v.state || "draft", v.internal_notes, v.external_notes,
      v.is_active ?? true, JSON.stringify(v.metadata || {}), req.userId ? parseInt(req.userId, 10) : null]
  );
  await audit(req, "execution.projects", (rows[0] as { id: number }).id, "INSERT", null, rows[0]);
  res.status(201).json({ data: rows[0] });
}));

// PUT /api/execution/projects/:id
router.put("/:id", asyncHandler(async (req, res) => {
  const v = validate(Projects.UpdateProjectSchema, req.body, res);
  if (!v) return;
  const fields: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  for (const [k, val] of Object.entries(v)) {
    if (val === undefined) continue;
    if (k === "metadata") { fields.push(`${k} = $${i++}::jsonb`); params.push(JSON.stringify(val)); continue; }
    fields.push(`${k} = $${i++}`);
    params.push(val as unknown);
  }
  if (!fields.length) { res.status(400).json({ error: "No fields to update" }); return; }
  fields.push(`updated_at = now()`);
  fields.push(`updated_by = $${i++}`); params.push(req.userId ? parseInt(req.userId, 10) : null);
  params.push(req.params.id);
  const rows = await query(
    `UPDATE execution.projects SET ${fields.join(", ")} WHERE id = $${i} AND is_deleted = false RETURNING *`,
    params
  );
  if (!rows.length) { res.status(404).json({ error: "Project not found" }); return; }
  await audit(req, "execution.projects", req.params.id, "UPDATE", null, rows[0]);
  res.json({ data: rows[0] });
}));

// DELETE /api/execution/projects/:id (soft)
router.delete("/:id", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.projects SET is_deleted = true, is_active = false, updated_at = now() WHERE id = $1 RETURNING id`,
    [req.params.id]
  );
  if (!rows.length) { res.status(404).json({ error: "Project not found" }); return; }
  await audit(req, "execution.projects", req.params.id, "DELETE", null, null);
  res.json({ ok: true });
}));

// POST /api/execution/projects/:id/transition-status
router.post("/:id/transition-status", asyncHandler(async (req, res) => {
  const v = validate(Projects.TransitionProjectSchema, req.body, res);
  if (!v) return;
  const before = await query(`SELECT state FROM execution.projects WHERE id = $1`, [req.params.id]);
  if (!before.length) { res.status(404).json({ error: "Project not found" }); return; }
  const rows = await query(
    `UPDATE execution.projects SET state = $1, updated_at = now(), updated_by = $2 WHERE id = $3 RETURNING *`,
    [v.to_state, req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  await audit(req, "execution.projects", req.params.id, "UPDATE",
    { state: (before[0] as { state: string }).state },
    { state: v.to_state, reason: v.reason });
  res.json({ data: rows[0] });
}));

export default router;
