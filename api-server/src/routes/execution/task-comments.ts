import { Router } from "express";
import { TaskComments } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler, validate } from "./_shared";

const router = Router();
router.use(requireExecutionAuth);

router.get("/", asyncHandler(async (req, res) => {
  const q = validate(TaskComments.ListTaskCommentsQuerySchema, req.query, res);
  if (!q) return;
  const where = q.task_id ? `WHERE task_id = $1` : "";
  const params: unknown[] = q.task_id ? [q.task_id] : [];
  const rows = await query(
    `SELECT * FROM execution.task_comments ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.limit, q.offset]
  );
  res.json({ data: rows });
}));

router.post("/", asyncHandler(async (req, res) => {
  const v = validate(TaskComments.CreateTaskCommentSchema, req.body, res);
  if (!v) return;
  const authorId = v.author_user_id ?? (req.userId ? parseInt(req.userId, 10) : null);
  const rows = await query(
    `INSERT INTO execution.task_comments (task_id, author_user_id, comment_body) VALUES ($1, $2, $3) RETURNING *`,
    [v.task_id, authorId, v.comment_body]
  );
  await audit(req, "execution.task_comments", (rows[0] as { id: number }).id, "INSERT", null, rows[0]);
  res.status(201).json({ data: rows[0] });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const rows = await query(`DELETE FROM execution.task_comments WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ error: "Comment not found" }); return; }
  await audit(req, "execution.task_comments", req.params.id, "DELETE", null, null);
  res.json({ ok: true });
}));

export default router;
