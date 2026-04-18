// API routes for execution.work_orders — with start, complete-qa, transition-status
import { Router } from "express";
import { WorkOrders } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler, validate } from "./_shared";
import { makeCrudRouter } from "./_crud-factory";

const crudRouter = makeCrudRouter({
  schema: "execution",
  table: "work_orders",
  createSchema: WorkOrders.CreateWorkOrderSchema,
  updateSchema: WorkOrders.UpdateWorkOrderSchema,
  listQuerySchema: WorkOrders.ListWorkOrdersQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "state", kind: "eq" },
    { key: "owner_user_id", kind: "eq" },
  ],
  searchColumns: ["work_order_number", "title", "description"],
  orderByAllowed: ["created_at", "updated_at", "state", "title", "required_start_date"],
});

const extra = Router();
extra.use(requireExecutionAuth);

extra.post("/:id/transition-status", asyncHandler(async (req, res) => {
  const v = validate(WorkOrders.TransitionWorkOrderSchema, req.body, res);
  if (!v) return;
  const before = await query(`SELECT state FROM execution.work_orders WHERE id = $1`, [req.params.id]);
  if (!before.length) { res.status(404).json({ error: "Work order not found" }); return; }
  const rows = await query(
    `UPDATE execution.work_orders SET state = $1, updated_at = now(), updated_by = $2 WHERE id = $3 RETURNING *`,
    [v.to_state, req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  await audit(req, "execution.work_orders", req.params.id, "UPDATE",
    { state: (before[0] as { state: string }).state }, { state: v.to_state, reason: v.reason });
  res.json({ data: rows[0] });
}));

extra.post("/:id/start", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.work_orders SET state = 'in_progress', actual_start_at = now(), updated_at = now(), updated_by = $1 WHERE id = $2 AND state IN ('draft','approved') RETURNING *`,
    [req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Work order cannot be started from current state" }); return; }
  await audit(req, "execution.work_orders", req.params.id, "UPDATE", null, { action: "start" });
  res.json({ data: rows[0] });
}));

extra.post("/:id/complete-qa", asyncHandler(async (req, res) => {
  const v = validate(WorkOrders.CompleteQaSchema, req.body, res);
  if (!v) return;
  const newState = v.quality_status === "pass" ? "done" : "qa";
  const rows = await query(
    `UPDATE execution.work_orders SET quality_status = $1, state = $2, updated_at = now(), updated_by = $3,
       notes = CASE WHEN $4::text IS NOT NULL THEN COALESCE(notes, '') || E'\n[QA] ' || $4 ELSE notes END
     WHERE id = $5 RETURNING *`,
    [v.quality_status, newState, req.userId ? parseInt(req.userId, 10) : null, v.qa_notes ?? null, req.params.id]
  );
  if (!rows.length) { res.status(404).json({ error: "Work order not found" }); return; }
  await audit(req, "execution.work_orders", req.params.id, "UPDATE", null, { action: "complete-qa", result: v.quality_status });
  res.json({ data: rows[0] });
}));

const router = Router();
router.use(extra);
router.use(crudRouter);

export default router;
