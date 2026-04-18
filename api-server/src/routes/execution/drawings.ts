import { Router } from "express";
import { Drawings } from "@workspace/api-zod/execution";
import { requireExecutionAuth, query, audit, asyncHandler } from "./_shared";
import { makeCrudRouter } from "./_crud-factory";

const crudRouter = makeCrudRouter({
  schema: "execution",
  table: "drawings",
  createSchema: Drawings.CreateDrawingSchema,
  updateSchema: Drawings.UpdateDrawingSchema,
  listQuerySchema: Drawings.ListDrawingsQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "drawing_type", kind: "eq" },
    { key: "approval_state", kind: "eq" },
  ],
  searchColumns: ["drawing_number", "title", "description"],
  orderByAllowed: ["drawing_number", "title", "created_at", "approval_state"],
});

const extra = Router();
extra.use(requireExecutionAuth);

extra.post("/:id/approve", asyncHandler(async (req, res) => {
  const uid = req.userId ? parseInt(req.userId, 10) : null;
  const rows = await query(
    `UPDATE execution.drawings SET approval_state = 'approved', approved_by_user_id = $1,
       updated_at = now(), updated_by = $1 WHERE id = $2 AND approval_state IN ('draft','in_review') RETURNING *`,
    [uid, req.params.id]
  );
  if (!rows.length) { res.status(409).json({ error: "Cannot approve from current state" }); return; }
  await audit(req, "execution.drawings", req.params.id, "UPDATE", null, { action: "approve" });
  res.json({ data: rows[0] });
}));

const router = Router();
router.use(extra);
router.use(crudRouter);

export default router;
