// API routes for execution.tasks — with transition-status endpoint
import { Router } from "express";
import { Tasks } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler, validate } from "./_shared";
import { makeCrudRouter } from "./_crud-factory";

const crudRouter = makeCrudRouter({
  schema: "execution",
  table: "tasks",
  createSchema: Tasks.CreateTaskSchema,
  updateSchema: Tasks.UpdateTaskSchema,
  listQuerySchema: Tasks.ListTasksQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "work_order_id", kind: "eq" },
    { key: "assignee_user_id", kind: "eq" },
    { key: "state", kind: "eq" },
    { key: "priority", kind: "eq" },
  ],
  searchColumns: ["task_number", "title", "description"],
  orderByAllowed: ["created_at", "due_date", "priority", "state", "title"],
});

const extra = Router();
extra.use(requireExecutionAuth);

extra.post("/:id/transition-status", asyncHandler(async (req, res) => {
  const v = validate(Tasks.TransitionTaskSchema, req.body, res);
  if (!v) return;
  const before = await query(`SELECT state FROM execution.tasks WHERE id = $1`, [req.params.id]);
  if (!before.length) { res.status(404).json({ error: "Task not found" }); return; }
  const rows = await query(
    `UPDATE execution.tasks SET state = $1, updated_at = now(), updated_by = $2 WHERE id = $3 RETURNING *`,
    [v.to_state, req.userId ? parseInt(req.userId, 10) : null, req.params.id]
  );
  await audit(req, "execution.tasks", req.params.id, "UPDATE",
    { state: (before[0] as { state: string }).state },
    { state: v.to_state, reason: v.reason });
  res.json({ data: rows[0] });
}));

const router = Router();
router.use(extra);
router.use(crudRouter);

export default router;
