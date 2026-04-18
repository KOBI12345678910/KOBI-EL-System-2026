import { Router } from "express";
import { LaborLogs } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler } from "./_shared";
import { makeCrudRouter } from "./_crud-factory";

const crudRouter = makeCrudRouter({
  schema: "execution",
  table: "labor_logs",
  createSchema: LaborLogs.CreateLaborLogSchema,
  updateSchema: LaborLogs.UpdateLaborLogSchema,
  listQuerySchema: LaborLogs.ListLaborLogsQuerySchema,
  listFilters: [
    { key: "employee_user_id", kind: "eq" },
    { key: "project_id", kind: "eq" },
    { key: "work_order_id", kind: "eq" },
    { key: "state", kind: "eq" },
    { key: "from_date", column: "started_at", kind: "gte" },
    { key: "to_date", column: "started_at", kind: "lte" },
  ],
  searchColumns: ["employee_name"],
  orderByAllowed: ["started_at", "created_at", "state"],
  defaultOrderBy: "started_at",
});

const extra = Router();
extra.use(requireExecutionAuth);

extra.post("/:id/submit", asyncHandler(async (req, res) => {
  const rows = await query(
    `UPDATE execution.labor_logs SET state = 'submitted', updated_at = now(), updated_by = $1 WHERE id = $2 AND state = 'draft' RETURNING *`,
    [req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Cannot submit from current state" }); return; }
  await audit(req, "execution.labor_logs", req.params.id, "UPDATE", null, { action: "submit" });
  res.json({ data: rows[0] });
}));

extra.post("/:id/approve", asyncHandler(async (req, res) => {
  const uid = req.userId ? parseInt(req.userId, 10) : null;
  const rows = await query(
    `UPDATE execution.labor_logs SET state = 'approved', approver_user_id = $1, approved_at = now(),
       updated_at = now(), updated_by = $1 WHERE id = $2 AND state = 'submitted' RETURNING *`,
    [uid, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Cannot approve from current state" }); return; }
  await audit(req, "execution.labor_logs", req.params.id, "UPDATE", null, { action: "approve" });
  res.json({ data: rows[0] });
}));

const router = Router();
router.use(extra);
router.use(crudRouter);

export default router;
