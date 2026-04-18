import { Router } from "express";
import { TaskDependencies } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler, validate } from "./_shared";

const router = Router();
router.use(requireExecutionAuth);

router.get("/", asyncHandler(async (req, res) => {
  const q = validate(TaskDependencies.ListTaskDependenciesQuerySchema, req.query, res);
  if (!q) return;
  const filters: string[] = [];
  const params: unknown[] = [];
  let i = 1;
  if (q.task_id) {
    filters.push(`(predecessor_task_id = $${i} OR successor_task_id = $${i})`);
    params.push(q.task_id);
    i++;
  }
  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const rows = await query(
    `SELECT * FROM execution.task_dependencies ${where} ORDER BY id DESC LIMIT $${i++} OFFSET $${i}`,
    [...params, q.limit, q.offset]
  );
  res.json({ data: rows, limit: q.limit, offset: q.offset });
}));

router.post("/", asyncHandler(async (req, res) => {
  const v = validate(TaskDependencies.CreateTaskDependencySchema, req.body, res);
  if (!v) return;
  const rows = await query(
    `INSERT INTO execution.task_dependencies (predecessor_task_id, successor_task_id, dependency_type)
     VALUES ($1, $2, $3) ON CONFLICT (predecessor_task_id, successor_task_id) DO UPDATE SET dependency_type = EXCLUDED.dependency_type RETURNING *`,
    [v.predecessor_task_id, v.successor_task_id, v.dependency_type]
  );
  await audit(req, "execution.task_dependencies", (rows[0] as { id: number }).id, "INSERT", null, rows[0]);
  res.status(201).json({ data: rows[0] });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const rows = await query(`DELETE FROM execution.task_dependencies WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ error: "Dependency not found" }); return; }
  await audit(req, "execution.task_dependencies", req.params.id, "DELETE", null, null);
  res.json({ ok: true });
}));

export default router;
