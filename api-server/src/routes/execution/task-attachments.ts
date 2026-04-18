import { Router } from "express";
import { TaskAttachments } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler, validate } from "./_shared";

const router = Router();
router.use(requireExecutionAuth);

router.get("/", asyncHandler(async (req, res) => {
  const q = validate(TaskAttachments.ListTaskAttachmentsQuerySchema, req.query, res);
  if (!q) return;
  const where = q.task_id ? `WHERE task_id = $1` : "";
  const params: unknown[] = q.task_id ? [q.task_id] : [];
  const rows = await query(
    `SELECT * FROM execution.task_attachments ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, q.limit, q.offset]
  );
  res.json({ data: rows });
}));

router.post("/", asyncHandler(async (req, res) => {
  const v = validate(TaskAttachments.CreateTaskAttachmentSchema, req.body, res);
  if (!v) return;
  const uploader = v.uploaded_by_user_id ?? (req.userId ? parseInt(req.userId, 10) : null);
  const rows = await query(
    `INSERT INTO execution.task_attachments (task_id, file_name, file_url, file_mime_type, file_size_bytes, uploaded_by_user_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [v.task_id, v.file_name, v.file_url, v.file_mime_type, v.file_size_bytes, uploader]
  );
  await audit(req, "execution.task_attachments", (rows[0] as { id: number }).id, "INSERT", null, rows[0]);
  res.status(201).json({ data: rows[0] });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const rows = await query(`DELETE FROM execution.task_attachments WHERE id = $1 RETURNING id`, [req.params.id]);
  if (!rows.length) { res.status(404).json({ error: "Attachment not found" }); return; }
  await audit(req, "execution.task_attachments", req.params.id, "DELETE", null, null);
  res.json({ ok: true });
}));

export default router;
